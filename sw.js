const CACHE='mochila-v8';

self.addEventListener('install',e=>{
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))
});

let datosHijos = [];
let notificados = {};

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SYNC_HIJOS') {
    datosHijos = e.data.hijos;
  }
});

function getHoraActual(){ const a=new Date(); return a.getHours().toString().padStart(2,'0')+':'+a.getMinutes().toString().padStart(2,'0'); }
function getFechaHoy(){ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0'); }
function restarMinutos(horaStr,min){
  if(!horaStr) return null;
  const [h,m]=horaStr.split(':').map(Number);
  let t=h*60+m-min; if(t<0)t+=1440;
  return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
}
function getMateriasTexto(dataHijo, diaManana){
  try{
    const mats=dataHijo.horario[diaManana]||[];
    return mats.map(mm=>{
      const mat=dataHijo.materias?.find(x=>x.id===mm.materiaId);
      return mat?mat.nombre:'';
    }).filter(Boolean).join(', ')||'Sin materias';
  }catch{return 'Revisar mochila';}
}

function checkAlarmasSW(){
  if(!datosHijos.length) return;
  const horaAhora=getHoraActual();
  const fechaHoy=getFechaHoy();
  const ahora=new Date();
  const diaMap=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const hoy=diaMap[ahora.getDay()];
  const manana=diaMap[(ahora.getDay()+1)%7];
  const grupos={};

  datosHijos.forEach((dataHijo)=>{
    const hijoNombre=dataHijo.nombre||'Hijo';
    if(dataHijo.config?.horaMochila===horaAhora){
      const k='mochila_'+horaAhora;
      if(!grupos[k]) grupos[k]=[];
      grupos[k].push({tipo:'mochila',hijoNombre,detalle:getMateriasTexto(dataHijo,manana)});
    }
    dataHijo.extras?.forEach(ex=>{
      if(!ex.dias?.includes(hoy)) return;
      const aviso=restarMinutos(ex.horaInicio, ex.anticipacionMinutos||30);
      if(aviso===horaAhora){
        const k='extra_'+horaAhora;
        if(!grupos[k]) grupos[k]=[];
        grupos[k].push({tipo:'extra',hijoNombre,detalle:ex.nombre+' a las '+ex.horaInicio+' - Llevar: '+(ex.nota||'')});
      }
    });
    dataHijo.tareas?.forEach(t=>{
      if(t.fechaAviso===fechaHoy && t.horaAviso===horaAhora){
        const k='tarea_'+horaAhora;
        if(!grupos[k]) grupos[k]=[];
        grupos[k].push({tipo:'tarea',hijoNombre,detalle:(t.materia||'')+' '+(t.titulo||'')});
      }
    });
  });

  Object.keys(grupos).forEach(llave=>{
    const items=grupos[llave];
    const storageKey='notificado_grupo_'+llave+'_'+fechaHoy+'_'+horaAhora;
    if(notificados[storageKey]) return;
    let titulo,cuerpo;
    if(items.length===1){
      const it=items[0];
      titulo=it.tipo==='mochila'?`🎒 Mochila de ${it.hijoNombre}`:it.tipo==='extra'?`⚽ ${it.hijoNombre}`:`📚 Tarea de ${it.hijoNombre}`;
      cuerpo=it.detalle;
    }else{
      titulo=items[0].tipo==='mochila'?`🎒 Mochila ${llave.split('_')[1]} - ${items.length} hijos`:`⚽ Extras ${llave.split('_')[1]} - ${items.length} hijos`;
      cuerpo=items.map(i=>`• ${i.hijoNombre}: ${i.detalle}`).join('\n');
    }
    self.registration.showNotification(titulo,{body:cuerpo,icon:'https://cdn-icons-png.flaticon.com/512/3456/3456426.png',badge:'https://cdn-icons-png.flaticon.com/512/3456/3456426.png',requireInteraction:true,vibrate:[400,100,400]});
    notificados[storageKey]=1;
  });
}

setInterval(checkAlarmasSW, 30000);
checkAlarmasSW();

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});