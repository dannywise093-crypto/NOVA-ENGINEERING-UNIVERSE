/* Responsive display presets for NOVA Engineering Universe */
(()=>{
 const modes=[['auto','Auto'],['desktop','Desktop'],['window','Window'],['pc','PC'],['mobile','Mobile']];
 const apply=(mode,save=true)=>{
  const selected=modes.some(m=>m[0]===mode)?mode:'auto';
  if(selected==='auto')document.body.removeAttribute('data-eu-mode');else document.body.dataset.euMode=selected;
  document.querySelectorAll('[data-eu-mode-button]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.euModeButton===selected)));
  if(save)try{localStorage.setItem('eu-display-mode',selected)}catch{}
 };
 const mount=()=>{
  const nav=document.querySelector('header .nav,header .wrap.nav,header .wrap,header nav,header.top');
  if(!nav||document.querySelector('.eu-modebar'))return;
  const bar=document.createElement('div');bar.className='eu-modebar';bar.setAttribute('role','group');bar.setAttribute('aria-label','Workspace layout');
  const label=document.createElement('span');label.className='eu-modebar-label';label.textContent='Layout';bar.append(label);
  modes.forEach(([mode,title])=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.dataset.euModeButton=mode;b.setAttribute('aria-label',title+' layout');b.addEventListener('click',()=>apply(mode));bar.append(b)});
  const full=document.createElement('button');full.type='button';full.className='eu-expand';full.textContent='⛶';full.title='Toggle fullscreen';full.setAttribute('aria-label','Toggle fullscreen');full.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{full.title='Fullscreen is not supported by this browser'}});bar.append(full);
  nav.append(bar);
  let saved='auto';try{saved=localStorage.getItem('eu-display-mode')||'auto'}catch{}apply(saved,false);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
