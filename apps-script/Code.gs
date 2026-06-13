/**
 * PAMPERO ORÁN — Carga diaria de reportes (ventas + margen)
 * --------------------------------------------------------
 * Corre en la cuenta pampero.oran@gmail.com (script.google.com).
 * Todas las noches (después de los mails de las 22:30) busca los CSV de
 * ventas y de margen del día, los cifra con la clave del tablero y los sube
 * al repositorio de GitHub. El tablero (GitHub Pages) los descifra en el
 * navegador.
 *
 * Cada archivo se guarda nombrado por la FECHA de los datos
 * (p. ej. data/ventas_2026-06-15.enc), no por el nombre del adjunto: así
 * cada día es un archivo propio, nunca se pisa el historial y si un día se
 * reenvía corregido se reemplaza solo ese día. El tablero fusiona por día,
 * de modo que la semana en curso se va completando sola.
 *
 * REQUIERE (Configuración del proyecto → Propiedades del script):
 *   GITHUB_TOKEN   token de GitHub con permiso de Contents (lectura/escritura) sobre el repo
 *   GITHUB_REPO    p. ej. "blaragros-ai/Pampero-Dashboard"
 *   CLAVE_CIFRADO  la misma clave que usan las gerentes para entrar al tablero
 *
 * REQUIERE además un archivo de script llamado "crypto-js.gs" con el
 * contenido de crypto-js.min.js (está en la carpeta apps-script del repo).
 *
 * Disparador: cargarReportesDiario → Basado en tiempo → Temporizador diario →
 * 23:00 a 00:00 (corre después de los mails de las 22:30; zona horaria del
 * proyecto: Buenos Aires).
 */

var PROPS = PropertiesService.getScriptProperties();

// Función diaria (la que va en el disparador): toma el CSV de ventas y el de
// margen del día. Mira los últimos 2 días por si alguna noche el disparador
// no llegó a correr.
function cargarReportesDiario() {
  procesarMails('from:znube@zoologic.com.ar newer_than:2d', {});
}

// Alias por compatibilidad: si el disparador quedó apuntando a este nombre
// (versión anterior), sigue funcionando y ahora también sube el margen.
function cargarVentasDiario() {
  cargarReportesDiario();
}

// Ejecutar UNA VEZ a mano para cargar todo el historial que haya en la casilla
// (incluye el reporte de margen si está presente).
function cargarHistorico() {
  procesarMails('from:znube@zoologic.com.ar after:2025/01/01', {});
}

// Versión semanal anterior (ventas + margen). Queda por compatibilidad; no se
// usa si el disparador apunta a cargarVentasDiario.
function extraerReportesSemanales() {
  procesarMails('from:znube@zoologic.com.ar newer_than:10d', {});
}

function procesarMails(consulta, opc) {
  opc = opc || {};
  var clave = PROPS.getProperty('CLAVE_CIFRADO');
  if (!clave) throw new Error('Falta la propiedad CLAVE_CIFRADO');

  var hilos = GmailApp.search(consulta);
  var subidos = [];

  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (adj) {
        if (!/\.csv$/i.test(adj.getName())) return;

        var texto = leerTexto(adj);
        var esMargen = texto.indexOf('Margen Vtas') !== -1;
        if (esMargen && opc.soloVentas) return;          // modo diario: solo ventas

        var fecha = primeraFecha(texto);                 // 'aaaa-mm-dd' del primer día del CSV
        if (!fecha) return;                              // no es un reporte con fechas

        var archivo = (esMargen ? 'margen_' : 'ventas_') + fecha + '.enc';
        if (subidos.indexOf(archivo) !== -1) return;     // ya subido en esta corrida

        var cifrado = CryptoJS.AES.encrypt(texto, clave).toString();
        subirArchivo('data/' + archivo, cifrado, 'Reporte ' + (esMargen ? 'margen' : 'ventas') + ' ' + fecha);
        subidos.push(archivo);
        Logger.log('Subido: ' + archivo);
      });
    });
  });

  if (subidos.length) {
    actualizarIndice(subidos);
    Logger.log('Listo: ' + subidos.length + ' archivo(s) subido(s) y agregado(s) al índice.');
  } else {
    Logger.log('No se subió nada. Mails encontrados con "' + consulta + '": ' + hilos.length +
               '. (Si hay mails pero no se subió nada, el adjunto no es un CSV de reporte con fechas.)');
  }
}

// Lee el adjunto probando varias codificaciones y se queda con la primera que
// permita encontrar la fecha. Algunos cubos pueden llegar en UTF-16 o Latin-1
// en vez de UTF-8; así el script los lee igual.
function leerTexto(adj) {
  var charsets = ['UTF-8', 'ISO-8859-1', 'UTF-16'];
  for (var i = 0; i < charsets.length; i++) {
    try {
      var t = adj.getDataAsString(charsets[i]);
      if (primeraFecha(t)) return t;
    } catch (e) {}
  }
  return adj.getDataAsString('UTF-8');
}

// Primer dd/mm/aaaa que aparece en el CSV → 'aaaa-mm-dd' (el encabezado no
// tiene fechas, así que la primera coincidencia es la del primer día de datos).
function primeraFecha(texto) {
  var m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : null;
}

// Ejecutar esta a mano la primera vez: autoriza los permisos y prueba todo el circuito
function probarAhora() {
  cargarReportesDiario();
}

/* ---------------- GitHub API ---------------- */

function gh(metodo, ruta, cuerpo) {
  var res = UrlFetchApp.fetch('https://api.github.com' + ruta, {
    method: metodo,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + PROPS.getProperty('GITHUB_TOKEN'),
      Accept: 'application/vnd.github+json'
    },
    contentType: 'application/json',
    payload: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { codigo: res.getResponseCode(), json: JSON.parse(res.getContentText() || '{}') };
}

function subirArchivo(ruta, contenidoTexto, mensaje) {
  var repo = PROPS.getProperty('GITHUB_REPO');
  var url = '/repos/' + repo + '/contents/' + ruta;
  var previo = gh('get', url);
  var cuerpo = {
    message: mensaje,
    content: Utilities.base64Encode(contenidoTexto, Utilities.Charset.UTF_8)
  };
  if (previo.codigo === 200 && previo.json.sha) cuerpo.sha = previo.json.sha;  // ya existía: se reemplaza
  var res = gh('put', url, cuerpo);
  if (res.codigo !== 200 && res.codigo !== 201)
    throw new Error('GitHub respondió ' + res.codigo + ' al subir ' + ruta + ': ' + JSON.stringify(res.json));
}

function actualizarIndice(nuevos) {
  var repo = PROPS.getProperty('GITHUB_REPO');
  var url = '/repos/' + repo + '/contents/data/index.json';
  var previo = gh('get', url);
  if (previo.codigo !== 200) throw new Error('No encuentro data/index.json en el repo (¿se borró?)');

  var indice = JSON.parse(Utilities.newBlob(Utilities.base64Decode(previo.json.content)).getDataAsString());
  var cambio = false;
  nuevos.forEach(function (n) {
    if (indice.archivos.indexOf(n) === -1) { indice.archivos.push(n); cambio = true; }
  });
  if (!cambio) return;
  indice.archivos.sort();

  var res = gh('put', url, {
    message: 'Actualizar índice de reportes',
    content: Utilities.base64Encode(JSON.stringify(indice, null, 2), Utilities.Charset.UTF_8),
    sha: previo.json.sha
  });
  if (res.codigo !== 200) throw new Error('GitHub respondió ' + res.codigo + ' al actualizar el índice');
}
