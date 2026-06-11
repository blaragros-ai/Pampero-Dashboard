# Tablero de Ventas Pampero — Guía de puesta en marcha

## Qué es esto

- **El tablero**: https://blaragros-ai.github.io/Pampero-Dashboard/ — las gerentes lo abren desde cualquier computadora, ingresan la clave de acceso una sola vez por máquina y ven las ventas y márgenes siempre actualizados.
- **Los datos**: viven en la carpeta `data/` de este repositorio, **cifrados** con la clave. Aunque el repositorio es público, sin la clave los datos son ilegibles.
- **La automatización**: un Google Apps Script en la cuenta `pampero.oran@gmail.com` corre todos los **lunes a las 15:00** (hora argentina), busca los mails con los dos reportes CSV, los cifra y los sube acá. Nadie tiene que tocar nada.

## Para las gerentes (uso diario)

1. Entrar a https://blaragros-ai.github.io/Pampero-Dashboard/
2. La primera vez en cada computadora, ingresar la **clave de acceso** (la tiene el dueño).
3. Listo: la clave queda recordada en esa computadora. En una computadora ajena o compartida, al terminar usar el botón **"Olvidar clave en esta computadora"** (abajo de todo).

## Configurar la automatización del Gmail (una sola vez, ~10 minutos)

1. Entrar a https://script.google.com **con la cuenta pampero.oran@gmail.com**.
2. "Nuevo proyecto". Ponerle de nombre, p. ej., `Subir reportes Pampero`.
3. Borrar el contenido de `Código.gs` y pegar el contenido de [`apps-script/Code.gs`](apps-script/Code.gs) (verlo en GitHub → botón "Raw" → seleccionar todo y copiar).
4. Con el botón **+** junto a "Archivos" agregar otro archivo de secuencia de comandos, llamarlo `crypto-js`, borrar su contenido y pegar el contenido completo de [`apps-script/crypto-js.min.js`](apps-script/crypto-js.min.js) (mismo método: Raw → copiar todo).
5. Ir a **Configuración del proyecto** (engranaje):
   - Marcar "Mostrar el archivo de manifiesto appsscript.json", abrirlo y verificar que diga `"timeZone": "America/Argentina/Buenos_Aires"` (si no, cambiarlo).
   - En **Propiedades del script**, agregar estas tres propiedades:
     | Propiedad | Valor |
     |---|---|
     | `GITHUB_TOKEN` | un token de GitHub (ver abajo) |
     | `GITHUB_REPO` | `blaragros-ai/Pampero-Dashboard` |
     | `CLAVE_CIFRADO` | la clave de acceso del tablero |
6. Volver al editor, elegir la función **`probarAhora`** en el desplegable y apretar **Ejecutar**. Google va a pedir autorización para acceder al Gmail y a servicios externos: aceptar (avisa que la app "no está verificada" porque es un script propio: Configuración avanzada → Ir al proyecto). En el "Registro de ejecución" tiene que decir qué archivos subió.
7. Ir a **Activadores** (relojito) → "Añadir activador":
   - Función: `extraerReportesSemanales`
   - Origen: "Basado en tiempo" → "Temporizador semanal" → **Lunes** → **15:00 a 16:00**
   - Guardar.

Desde ese momento, cada lunes a la tarde los reportes nuevos aparecen solos en el tablero.

## El token de GitHub (importante)

Para el paso 5 conviene crear un token **limitado solo a este repositorio**:

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. Repository access: **Only select repositories** → `Pampero-Dashboard`.
3. Permissions → Repository permissions → **Contents: Read and write**. Nada más.
4. Vencimiento: el máximo que permita. Anotar en el calendario renovarlo antes de que venza (el script va a empezar a fallar ese día) y actualizar la propiedad `GITHUB_TOKEN`.

> ⚠️ El token clásico que se usó para la configuración inicial se compartió por chat: conviene **revocarlo** (Settings → Developer settings → Tokens (classic) → Delete) una vez creado el fine-grained.

## Cambiar la clave de acceso

La clave cifra los archivos, así que cambiarla implica re-cifrar todo el historial con la clave nueva, actualizar `CLAVE_CIFRADO` en el Apps Script y avisarles a las gerentes. Es un proceso asistido: pedírselo a Claude.

## Si un lunes no aparecen los datos

1. ¿Llegaron los dos mails con los CSV? Si llegaron tarde, ejecutar `probarAhora` a mano en script.google.com, o esperar al lunes siguiente (el script busca mails de los últimos 10 días).
2. Revisar en script.google.com → "Ejecuciones" si el script falló y con qué error (token vencido es la causa más probable).
3. Siempre se puede cargar el CSV a mano: arrastrarlo adentro del tablero (se ve solo en esa computadora, hasta que el script lo suba al repositorio).
