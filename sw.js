const CACHE='mochila-v13';
const APP_SHELL=['./','./index.html','./manifest.json','./icon.svg'];
const DB_NAME='mochila-lista-notificaciones';
const DB_VERSION=1;

function openDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('state'))db.createObjectStore('state',{keyPath:'key'});
      if(!db.objectStoreNames.contains('sent'))db.createObjectStore('sent',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

function saveChildren(children){
  
  return openDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite');
    tx.objectStore('state').put({key:'children',value:children});
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  }));
}

function loadChildren(){
  return openDatabase().then(db=>new Promise((resolve,reject)=>{
    const request=db.transaction('state','readonly').objectStore('state').get('children');
    request.onsuccess=()=>{const value=request.result;db.close();resolve(value&&Array.isArray(value.value)?value.value:[]);};
    request.onerror=()=>{db.close();reject(request.error);};
  }));
}

function claimNotification(id){
  return openDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('sent','readwrite');
    const store=tx.objectStore('sent');
    let claimed=false;
    const request=store.get(id);
    request.onsuccess=()=>{
      if(!request.result){
        store.put({id:id,sentAt:Date.now()});
        claimed=true;
      }
    };
    tx.oncomplete=()=>{db.close();resolve(claimed);};
    tx.onerror=()=>{db.close();reject(tx.error);};
  }));
}

function releaseNotification(id){
  return openDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('sent','readwrite');
    tx.objectStore('sent').delete(id);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mochila-v')&&key!==CACHE).map(key=>caches.delete(key)))),
    loadChildren().then(children=>{datosHijos=children;}).catch(error=>console.error('No se pudieron recuperar los datos de alarmas.',error))
  ]).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(request).then(cached=>{
    if(cached)return cached;
    return fetch(request).then(response=>{
      if(response.ok)cache.put(request,response.clone()).catch(error=>console.error('No se pudo guardar un recurso en caché.',error));
      return response;
    }).catch(error=>{
      if(request.mode==='navigate')return cache.match('./index.html').then(fallback=>{
        if(fallback)return fallback;
        throw error;
      });
      throw error;
    });
  })));
});

let datosHijos=[];

self.addEventListener('message',event=>{
  if(!event.data || event.data.type!=='SYNC_HIJOS' || !Array.isArray(event.data.hijos))return;
  const children=event.data.hijos.map(child=>({nombre:child.nombre||'Hijo',data:child.data||{}}));
  event.waitUntil(saveChildren(children).then(()=>{
    datosHijos=children;
    return checkAlarms();
  }).catch(error=>console.error('No se pudieron sincronizar las alarmas.',error)));
});

function getHora(date){
  return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}

function getFecha(date){
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}

function restarMinutos(time,minutes){
  if(!time)return null;
  const [hours,mins]=time.split(':').map(Number);
  const total=(hours*60+mins-minutes+1440)%1440;
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}

function materiasManana(data,day){
  const items=data.horario&&data.horario[day]||[];
  return items.map(item=>{
    const materia=(data.materias||[]).find(subject=>subject.id===item.materiaId);
    return materia&&materia.nombre;
  }).filter(Boolean).join(', ')||'Sin materias';
}

async function sendAlarm(id,title,body){
  try{
    if(!await claimNotification(id))return;
    await self.registration.showNotification(title,{
      body:body,
      icon:'./icon.svg',
      badge:'./icon.svg',
      requireInteraction:true,
      vibrate:[400,100,400],
      tag:id
    });
  }catch(error){
    console.error('No se pudo mostrar una notificación.',error);
    try{await releaseNotification(id);}catch(storageError){console.error('No se pudo liberar el registro de notificación.',storageError);}
  }
}

async function checkAlarms(){
  if(!datosHijos.length || !('Notification' in self) || self.Notification.permission!=='granted')return;
  const now=new Date();
  const currentTime=getHora(now);
  const today=getFecha(now);
  const days=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const todayName=days[now.getDay()];
  const tomorrowName=days[(now.getDay()+1)%7];
  const groups={};

  datosHijos.forEach(child=>{
    const name=child.nombre||'Hijo';
    const data=child.data||{};
    if(data.config&&data.config.horaMochila===currentTime){
      const key='mochila_'+currentTime;
      if(!groups[key])groups[key]=[];
      groups[key].push({type:'mochila',name:name,detail:'Mañana ('+tomorrowName+'): '+materiasManana(data,tomorrowName)+'. ¡Arma la mochila!'});
    }
    (data.extras||[]).forEach(extra=>{
      if(!(extra.dias||[]).includes(todayName))return;
      const lead=Number.isFinite(Number(extra.anticipacionMinutos))?Number(extra.anticipacionMinutos):30;
      if(restarMinutos(extra.horaInicio,lead)!==currentTime)return;
      const key='extra_'+currentTime;
      if(!groups[key])groups[key]=[];
      groups[key].push({type:'extra',name:name,detail:(extra.nombre||'Actividad')+' a las '+extra.horaInicio+(extra.nota?' · Llevar: '+extra.nota:'')});
    });
    (data.tareas||[]).forEach(task=>{
      if(task.estado==='hecha'||task.fechaAviso!==today||task.horaAviso!==currentTime)return;
      const subject=(data.materias||[]).find(item=>item.id===task.materiaId);
      const key='tarea_'+currentTime;
      if(!groups[key])groups[key]=[];
      groups[key].push({type:'tarea',name:name,detail:(subject?subject.nombre+': ':'')+(task.titulo||'Tarea')+(task.nota?' · '+task.nota:'')});
    });
  });

  for(const key of Object.keys(groups)){
    const items=groups[key];
    const id=key+'_'+today+'_'+currentTime;
    const title=items.length===1
      ?items[0].type==='mochila'?'🎒 Mochila de '+items[0].name:items[0].type==='extra'?'⚽ '+items[0].name:'📚 Tarea de '+items[0].name
      :items[0].type==='mochila'?'🎒 Mochila · '+items.length+' hijos':items[0].type==='extra'?'⚽ Actividades · '+items.length+' hijos':'📚 Tareas · '+items.length+' hijos';
    const body=items.map(item=>'• '+item.name+': '+item.detail).join('\n');
    await sendAlarm(id,title,body);
  }
}

setInterval(()=>{checkAlarms().catch(error=>console.error('Falló la comprobación de alarmas.',error));},30000);

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.openWindow('./'));
});
