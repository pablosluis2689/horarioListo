const CACHE='mochila-v9';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{clients.claim();});
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});

let datosHijos=[];
let notificados={};

self.addEventListener('message',e=>{
  if(e.data?.type==='SYNC_HIJOS'){datosHijos=e.data.hijos;}
});

function getHora(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function getFecha(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function restar(h,m){if(!h)return null;const [hh,mm]=h.split(':').map(Number);let t=hh*60+mm-m;if(t<0)t+=1440;return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function matsTexto(dh,dia){try{return (dh.horario[dia]||[]).map(x=>{const mat=dh.materias?.find(z=>z.id===x.materiaId);return mat?.nombre||''}).filter(Boolean).join(', ')||'Sin materias'}catch{return 'Revisar mochila'}}

function check(){
  if(!datosHijos.length) return;
  const ha=getHora(); const fh=getFecha();
  const ahora=new Date(); const map=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const hoy=map[ahora.getDay()]; const man=map[(ahora.getDay()+1)%7];
  const grupos={};
  datosHijos.forEach(dh=>{
    const nom=dh.nombre||'Hijo';
    if(dh.config?.horaMochila===ha){const k='mochila_'+ha;if(!grupos[k])grupos[k]=[];grupos[k].push({t:'mochila',nom,det:matsTexto(dh,man)})}
    dh.extras?.forEach(ex=>{if(!ex.dias?.includes(hoy))return;if(restar(ex.horaInicio,ex.anticipacionMinutos||30)===ha){const k='extra_'+ha;if(!grupos[k])grupos[k]=[];grupos[k].push({t:'extra',nom,det:ex.nombre+' '+ex.horaInicio})}});
    dh.tareas?.forEach(ta=>{if(ta.fechaAviso===fh&&ta.horaAviso===ha){const k='tarea_'+ha;if(!grupos[k])grupos[k]=[];grupos[k].push({t:'tarea',nom,det:ta.materia+' '+ta.titulo})}});
  });
  Object.keys(grupos).forEach(k=>{
    const its=grupos[k]; const sk='g_'+k+'_'+fh+'_'+ha; if(notificados[sk])return;
    let tit,cuer;
    if(its.length===1){const it=its[0];tit=it.t==='mochila'?`🎒 Mochila de ${it.nom}`:it.t==='extra'?`⚽ ${it.nom}`:`📚 ${it.nom}`;cuer=it.det}
    else{tit=`🎒 ${k.split('_')[1]} - ${its.length} hijos`;cuer=its.map(i=>`• ${i.nom}: ${i.det}`).join('\n')}
    self.registration.showNotification(tit,{body:cuer,icon:'https://cdn-icons-png.flaticon.com/512/3456/3456426.png',badge:'https://cdn-icons-png.flaticon.com/512/3456/3456426.png',requireInteraction:true,vibrate:[400,100,400],tag:k});
    notificados[sk]=1;
  });
}
setInterval(check,30000); check();
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.openWindow('./'))});