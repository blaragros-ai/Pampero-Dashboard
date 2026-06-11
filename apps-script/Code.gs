/**
 * PAMPERO ORÁN — Extracción semanal de reportes de ventas
 * --------------------------------------------------------
 * Corre en la cuenta pampero.oran@gmail.com (script.google.com).
 * Cada lunes a las 15:00 busca los mails con los reportes CSV de la
 * semana, los cifra con la clave del tablero y los sube al repositorio
 * de GitHub. El tablero (GitHub Pages) los descifra en el navegador.
 *
 * REQUIERE (Configuración del proyecto → Propiedades del script):
 *   GITHUB_TOKEN   token de GitHub con permiso de Contents (lectura/escritura) sobre el repo
 *   GITHUB_REPO    p. ej. "blaragros-ai/Pampero-Dashboard"
 *   CLAVE_CIFRADO  la misma clave que usan las gerentes para entrar al tablero
 *
 * REQUIERE además un archivo de script llamado "crypto-js.gs" con el
 * contenido de crypto-js.min.js (está en la carpeta apps-script del repo).
 *
 * Disparador: extraerReportesSemanales → Basado en tiempo → Temporizador
 * semanal → Lunes → 15:00 a 16:00 (zona horaria del proyecto: Buenos Aires).
 */

var PROPS = PropertiesService.getScriptProperties();

// Función principal (la que va en el disparador semanal)
function extraerReportesSemanales() {
  procesarMails('has:attachment filename:csv newer_than:10d');
}

// Ejecutar UNA VEZ a mano para cargar todos los reportes históricos de 2026
// que estén en la casilla (puede tardar unos minutos si hay muchas semanas).
function cargarHistorico() {
  procesarMails('has:attachment filename:csv after:2026/01/01');
}

function procesarMails(consulta) {
  var clave = PROPS.getProperty('CLAVE_CIFRADO');
  if (!clave) throw new Error('Falta la propiedad CLAVE_CIFRADO');

  var hilos = GmailApp.search(consulta);
  var subidos = [];

  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (adj) {
        var nombre = adj.getName();
        if (!/\.csv$/i.test(nombre)) return;
        // Solo los dos reportes que alimentan el tablero
        var esReporte = /Reporte Ventas Semanal/i.test(nombre) || /Margen entre ventas/i.test(nombre);
        if (!esReporte) return;

        var texto = adj.getDataAsString('UTF-8');
        var archivo = nombre.replace(/\.csv$/i, '').replace(/[^\w\-]+/g, '_') + '.enc';
        if (subidos.indexOf(archivo) !== -1) return;   // adjunto repetido en el hilo

        var cifrado = CryptoJS.AES.encrypt(texto, clave).toString();
        subirArchivo('data/' + archivo, cifrado, 'Reporte semanal: ' + nombre);
        subidos.push(archivo);
        Logger.log('Subido: ' + archivo);
      });
    });
  });

  if (subidos.length) {
    actualizarIndice(subidos);
    Logger.log('Listo: ' + subidos.length + ' archivo(s) subido(s) y agregado(s) al índice.');
  } else {
    Logger.log('No se encontraron reportes CSV con la búsqueda: ' + consulta);
  }
}

// Ejecutar esta a mano la primera vez: autoriza los permisos y prueba todo el circuito
function probarAhora() {
  extraerReportesSemanales();
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
