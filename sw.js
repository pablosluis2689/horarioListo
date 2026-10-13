const CACHE='mochila-v6'; // cambiamos a v6 para obligar al telefono a actualizar el archivo viejo

// install: se ejecuta cuando el telefono instala la app por primera vez
self.addEventListener('install',e=>{
  self.skipWaiting(); // le decimos al navegador "no esperes, activa este sw.js ya"
});

// activate: se ejecuta cuando el nuevo sw.js toma el control
self.addEventListener('activate',e=>{
  self.clients.claim(); // toma control de todas las paginas abiertas de la app de inmediato
});

// fetch: es lo que tenias antes, para que la app funcione offline
// si hay internet trae de internet, si no hay, trae de la memoria cache
self.addEventListener('fetch',e=>{
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))
});

// ESTO ES LO QUE TE FALTA Y HACE QUE SUENE LA ALARMA:
// notificationclick: que pasa cuando tocas la notificacion
// sin esto, en Android la notificacion aparece pero no hace nada al tocarla
self.addEventListener('notificationclick',e=>{
  e.notification.close(); // cierra la notificacion al tocarla
  // y abre de nuevo la app en index.html
  e.waitUntil(clients.openWindow('./index.html'));
});

// NOTA: no necesitamos 'push' porque tu alarma no viene de un servidor
// tu alarma la dispara el propio index.html con reg.showNotification()
// pero para que reg.showNotification() funcione, el sw.js TIENE que estar activo
// con tu v5 no lo estaba de forma correcta, con este v6 si