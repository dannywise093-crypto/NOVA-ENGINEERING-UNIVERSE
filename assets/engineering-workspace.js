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

/* ChatGPT-clone-inspired conversation shell for NOVA's specialist AI pages.
   Keeps each page's existing /api/engineer request handler and discipline prompt intact. */
(()=>{
 const task=document.getElementById('task'),result=document.getElementById('result'),send=document.getElementById('send');
 if(!task||!result||!send||!document.querySelector('.layout'))return;
 const pageKey='nova-chat-history:'+location.pathname;
 const layout=document.querySelector('.layout'),panels=layout.querySelectorAll(':scope > .panel');
 if(panels.length<2)return;
 const inputPanel=panels[0],outputPanel=panels[1],formTitle=inputPanel.querySelector('h2'),outputTitle=outputPanel.querySelector('h2');
 document.body.classList.add('eu-chat-page');
 const app=document.createElement('div');app.className='eu-chat-app';
 const glow=document.createElement('div');glow.className='eu-chat-glow';document.body.append(glow);const sidebar=document.createElement('aside');sidebar.className='eu-chat-sidebar';
 const newBtn=document.createElement('button');newBtn.type='button';newBtn.className='eu-chat-new';newBtn.innerHTML='<span aria-hidden="true">＋</span><span>New chat</span>';
 const histTitle=document.createElement('div');histTitle.className='eu-chat-sidebar-title';histTitle.textContent='Conversations';
 const history=document.createElement('div');history.className='eu-chat-history';
 const main=document.createElement('section');main.className='eu-chat-main';const footer=document.createElement('div');footer.className='eu-chat-footer';const clearHistory=document.createElement('button');clearHistory.type='button';clearHistory.textContent='♲  Clear conversations';clearHistory.addEventListener('click',()=>{if(confirm('Clear saved conversations for this assistant?')){conversations=[];save();fresh();renderHistory()}});const info=document.createElement('div');info.innerHTML='NOVA Engineering Universe<br>Specialist Engineering AI';footer.append(clearHistory,info);
 const topline=document.createElement('div');topline.className='eu-chat-topline';
 const title=document.createElement('strong');title.textContent=(document.title.split('|')[0]||'NOVA Engineering AI').trim();
 const menuBtn=document.createElement('button');menuBtn.type='button';menuBtn.className='eu-chat-new';menuBtn.style.width='auto';menuBtn.style.padding='6px 10px';menuBtn.textContent='☰ Chats';menuBtn.addEventListener('click',()=>document.body.classList.toggle('eu-sidebar-open'));
 topline.append(menuBtn,title);
 const transcript=document.createElement('div');transcript.className='eu-chat-transcript';transcript.setAttribute('aria-live','polite');
 const empty=document.createElement('div');empty.className='eu-chat-empty';empty.innerHTML='<h1>What are we engineering today?</h1><p>Ask a question, develop a concept, or work through an engineering calculation.</p>';transcript.append(empty);
 const composerWrap=document.createElement('div');composerWrap.className='eu-chat-compose-wrap';
 const composer=document.createElement('div');composer.className='eu-chat-composer';
 const composeBottom=document.createElement('div');composeBottom.className='eu-chat-composer-bottom';
 const status=document.createElement('div');status.className='eu-chat-status';
 const copyActions=document.createElement('div');copyActions.className='eu-chat-copy-actions';
 const originalStatus=inputPanel.querySelector('#status'),styleLabel=inputPanel.querySelector('label[for="style"]'),styleSelect=document.getElementById('style'),clearBtn=document.getElementById('clear'),copyBtn=document.getElementById('copy'),downloadBtn=document.getElementById('download'),prompts=inputPanel.querySelector('.prompts'),safety=inputPanel.querySelector('.safety');
 let conversations=[];let activeId=null;let lastResult='';
 const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
 const save=()=>{try{localStorage.setItem(pageKey,JSON.stringify(conversations.slice(0,30)))}catch{}};
 const active=()=>conversations.find(c=>c.id===activeId);
 const addMessage=(role,content,quiet=false)=>{if(!content)return;empty.remove();const node=document.createElement('article');node.className='eu-chat-message '+role;const avatar=document.createElement('div');avatar.className='eu-chat-avatar';avatar.textContent=role==='user'?'U':'N';const body=document.createElement('div');body.className='eu-chat-message-content';body.textContent=content;node.append(avatar,body);transcript.append(node);transcript.scrollTop=transcript.scrollHeight;if(!quiet){const c=active();if(c){c.messages.push({role,content});if(role==='user'&&c.title==='New chat')c.title=content.slice(0,52);save();renderHistory()}}};
 const renderHistory=()=>{history.replaceChildren();conversations.forEach(c=>{const b=document.createElement('button');b.type='button';b.textContent=c.title||'New chat';b.setAttribute('aria-current',String(c.id===activeId));b.addEventListener('click',()=>load(c.id));history.append(b)})};
 const load=id=>{activeId=id;const c=active();transcript.replaceChildren();if(!c||!c.messages.length)transcript.append(empty);else c.messages.forEach(m=>addMessage(m.role,m.content,true));renderHistory();document.body.classList.remove('eu-sidebar-open');transcript.scrollTop=transcript.scrollHeight};
 const fresh=()=>{const c={id:uid(),title:'New chat',messages:[]};conversations.unshift(c);activeId=c.id;task.value='';result.textContent='';result.className='result eu-chat-original-result';lastResult='';transcript.replaceChildren(empty);if(originalStatus)originalStatus.textContent='Ready for your next engineering question.';save();renderHistory();document.body.classList.remove('eu-sidebar-open');task.focus()};
 try{const old=JSON.parse(localStorage.getItem(pageKey)||'[]');if(Array.isArray(old))conversations=old.filter(c=>c&&c.id&&Array.isArray(c.messages)).slice(0,30)}catch{}
 // Move the existing controls into a ChatGPT-style composer; listeners remain attached.
 app.append(sidebar,main);layout.replaceWith(app);
 sidebar.append(newBtn,histTitle,history,footer);
 /* Keep engineering prompts and safety guidance available in the original specialist page logic; chat layout follows the reference sidebar structure. */
 main.append(topline,transcript,composerWrap);composerWrap.append(composer,copyActions,status);
 composer.append(task,composeBottom);
 if(styleSelect){if(styleLabel)composeBottom.append(styleLabel);composeBottom.append(styleSelect)}
 const actions=inputPanel.querySelector('.actions');if(actions)composeBottom.append(actions);
 if(originalStatus){status.append(originalStatus);originalStatus.style.display='block';originalStatus.className='eu-chat-status'}
 if(copyBtn)copyActions.append(copyBtn);if(downloadBtn)copyActions.append(downloadBtn);
 result.classList.add('eu-chat-original-result');outputPanel.remove();
 if(clearBtn)clearBtn.addEventListener('click',()=>fresh());
 newBtn.addEventListener('click',fresh);
 task.setAttribute('placeholder','Message NOVA…');task.setAttribute('aria-label','Message NOVA engineering assistant');
 task.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send.click()}});
 document.addEventListener('click',e=>{if(e.target===send||e.target.closest('#send')){const text=task.value.trim();if(text){if(!active())fresh();addMessage('user',text);lastResult='';result.classList.add('eu-chat-original-result');}}},true);
 const observer=new MutationObserver(()=>{const text=(result.textContent||'').trim();if(!text||result.classList.contains('loading')||text===lastResult||text.startsWith('Your ')&&text.endsWith(' response will appear here.'))return;lastResult=text;addMessage('assistant',text);});
 observer.observe(result,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
 renderHistory();
 if(conversations.length)load(conversations[0].id);else{activeId=uid();conversations.unshift({id:activeId,title:'New chat',messages:[]});renderHistory();save()}
 const resize=()=>{task.style.height='auto';task.style.height=Math.min(task.scrollHeight,200)+'px'};task.addEventListener('input',resize);
})();
