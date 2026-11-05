/**
 * Activador de la cola de Instagram de EZY Dashboard.
 *
 * Instagram no deja programar publicaciones desde fuera: el dashboard publica cuando le llega la
 * hora. Este script le da un toque cada 5 minutos ("¿hay algo pendiente? publícalo").
 *
 * Instalación (una sola vez, con la cuenta de Google de EZY):
 *   1. script.google.com → Nuevo proyecto → pega este archivo entero.
 *   2. Configuración del proyecto (engranaje) → Propiedades de la secuencia de comandos →
 *      añade CLAVE con el valor de CRON_SECRET (te lo da Claude, está en .env.local / Vercel).
 *   3. Vuelve al editor, elige la función «instalar» y pulsa Ejecutar. Acepta los permisos.
 *   Listo: «activador» se ejecutará cada 5 minutos. Para pararlo, ejecuta «desinstalar».
 */

var URL_ACTIVADOR = 'https://ezyprods-dashboard.vercel.app/api/cron/instagram';

function activador() {
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
  if (!clave) throw new Error('Falta la propiedad CLAVE (CRON_SECRET)');
  var res = UrlFetchApp.fetch(URL_ACTIVADOR + '?key=' + encodeURIComponent(clave), {
    muteHttpExceptions: true,
    followRedirects: true,
  });
  var codigo = res.getResponseCode();
  if (codigo !== 200) console.warn('Activador de Instagram respondió ' + codigo + ': ' + res.getContentText().slice(0, 300));
}

function instalar() {
  desinstalar();
  ScriptApp.newTrigger('activador').timeBased().everyMinutes(5).create();
  activador();
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'activador') ScriptApp.deleteTrigger(t);
  });
}
