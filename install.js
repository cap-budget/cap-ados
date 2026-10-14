let installEvent=null;const installButton=document.getElementById('install-app'),installation=document.getElementById('install-help');const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
function installed(){installButton.hidden=true;installation.textContent='CAP Ados est ouvert en mode application.'}
if(standalone())installed();
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;if(!standalone())installButton.hidden=false});
installButton.addEventListener('click',async()=>{if(!installEvent)return;const event=installEvent;installEvent=null;installButton.hidden=true;await event.prompt();const choice=await event.userChoice;installation.textContent=choice.outcome==='accepted'?'Installation demandée. Retrouve CAP Ados sur ton écran d’accueil.':'Tu peux aussi utiliser le menu de ton navigateur pour l’installer.'});
window.addEventListener('appinstalled',installed);
if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{document.getElementById('offline-status').textContent='✓ Application disponible hors connexion après cette ouverture.'}).catch(()=>{document.getElementById('offline-status').textContent='Le mode hors connexion n’est pas disponible dans ce navigateur pour le moment.'})}
