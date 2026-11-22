const $=s=>document.querySelector(s);
const state={token:localStorage.getItem('vg_token'),user:null,chats:[],active:null,socket:null,theme:localStorage.getItem('vg_theme')||'blue',folder:'all',replyTo:null,ui:JSON.parse(localStorage.getItem('vg_ui')||'{}'),wallpaper:localStorage.getItem('vg_wallpaper')||'expressive',songs:[],currentSong:null,pendingImage:null,messageHasMore:false,loadingOlder:false,pins:[],onlineUsers:new Set(),typingTimer:null,draftTimer:null};
const themes={blue:{primary:'#526da8',surface:'#f7f8ff',surface2:'#edf0fa',surface3:'#dfe5f5',bubble:'#e8edf9'},green:{primary:'#39765c',surface:'#f5faf6',surface2:'#e9f3ec',surface3:'#dcebe0',bubble:'#e4f1e7'},purple:{primary:'#72599d',surface:'#faf8ff',surface2:'#f0ebfa',surface3:'#e6def5',bubble:'#eee8f8'},rose:{primary:'#a45370',surface:'#fff8fa',surface2:'#f8edf1',surface3:'#f2dfe7',bubble:'#f8e8ee'},orange:{primary:'#946039',surface:'#fffaf5',surface2:'#f8efe5',surface3:'#f0e1d0',bubble:'#f5e9dc'},mono:{primary:'#555963',surface:'#f7f7f8',surface2:'#eeeeef',surface3:'#e2e3e5',bubble:'#e9e9eb'}};
const fontFamilies={google:"'Roboto Flex',Roboto,Arial,sans-serif",roboto:"Roboto,Arial,sans-serif",inter:"Inter,'Roboto',sans-serif",system:"system-ui,-apple-system,'Segoe UI',sans-serif"};
const emojiGroups={Часто:'😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😍 🥰 😎 🤔 🥳 😭 😡 ❤️ 🧡 💛 💚 💙 💜 🤍 👍 👎 🙌 👏 🔥 ✨ 🎉 💯',Лица:'😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 😎 🤓 🧐 🤔 🤫 🤭 🫡 🤗 🫠 😐 😑 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 😵 🤯 🥺 😢 😭 😤 😠 😡 🤬 🤒 🤕 🤧 🥵 🥶',Жесты:'👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 💪 🦾',Символы:'❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 🔥 ✨ ⭐ 🌟 💫 ⚡ ☀️ 🌈 ☁️ ❄️ 🌙 ☕ 🍀 🎵 🎶 💯 ✅ ❌ ⚠️'};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(s){const e=$('#toast');e.textContent=s;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2500)}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{}),...(opts.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||`Ошибка ${r.status}`);return d}
function modal(title,sub,body,actions='<button class="soft-btn" data-close>Закрыть</button>'){const root=$('#modalRoot');root.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>${title}</h2><p class="sub">${sub||''}</p></div><button class="icon-btn" data-close>×</button></div><div class="modal-content">${body}</div><div class="modal-actions">${actions}</div></div></div>`;root.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal);root.querySelector('.modal-backdrop').onclick=e=>{if(e.target.classList.contains('modal-backdrop'))closeModal()};return root.querySelector('.modal')}
function closeModal(){$('#modalRoot').innerHTML=''}
function applyTheme(name){
 state.theme=themes[name]?name:'blue';
 const t=themes[state.theme],root=document.documentElement,dark=!!state.ui.dark;
 root.dataset.dark=dark?'true':'false';
 const vars={
  primary:t.primary,
  surface:dark?'#151820':t.surface,
  surface2:dark?'#202631':t.surface2,
  surface3:dark?'#2b3342':t.surface3,
  bubble:dark?'#293241':t.bubble,
  text:dark?'#edf1fa':'#1b1d25',
  muted:dark?'#a9b1c2':'#6e7280',
  outline:dark?'#3d4657':'#d1d6e4',
  'on-primary':dark?'#172033':'#ffffff'
 };
 Object.entries(vars).forEach(([k,v])=>root.style.setProperty('--'+k,v));
 document.querySelector('meta[name="theme-color"]').content=vars.surface3;
 localStorage.setItem('vg_theme',state.theme);
}
function applyUI(){
 const r=document.documentElement;
 r.style.setProperty('--font-scale',state.ui.fontScale||1);
 r.style.setProperty('--font-family',fontFamilies[state.ui.fontFamily]||fontFamilies.google);
 r.style.setProperty('--bubble-radius',(state.ui.bubbleRadius||20)+'px');
 r.style.setProperty('--chat-gap',(state.ui.chatGap||10)+'px');
 r.dataset.dark=state.ui.dark?'true':'false';r.dataset.density=state.ui.density||'normal';
 applyTheme(state.theme);
}
function avatar(src,name,cls='avatar'){return src?`<img class="${cls} image-avatar" src="${esc(src)}" alt="">`:`<div class="${cls}">${esc((name||'?').trim().slice(0,1).toUpperCase())}</div>`}
function badge(u){return u&&['owner','dev'].includes(u.role)?'<span class="verified" title="Подтверждённый аккаунт">✓</span>':''}
function drawProfile(){const u=state.user;if(!u)return;const label=u.displayName||u.username;$('#drawerProfile').innerHTML=`${avatar(u.avatar,label)}<span class="profile-label"><b>${esc(label)} ${badge(u)}</b><small>@${esc(u.username)} · ${esc(u.number||'')}</small></span><span class="profile-more">⌄</span>`;$('#profileBtn').innerHTML=avatar(u.avatar,label,'top-avatar');$('#accountBtn').textContent='@'+u.username;$('#navDrawerAccount').innerHTML=`${avatar(u.avatar,label,'nav-avatar')}<div><b>${esc(label)} ${badge(u)}</b><small>@${esc(u.username)} · ${esc(u.number||'')}</small></div>`;$('#drawerAdmin').classList.toggle('hidden',!['owner','dev'].includes(u.role));$('#drawerThemeState').textContent=state.ui.dark?'Вкл.':'Выкл.'}
function showAuth(){const m=modal('vovchikGram','Войди или создай аккаунт',`<div class="segmented"><button id="loginTab" class="selected" type="button">Войти</button><button id="registerTab" type="button">Регистрация</button></div><form id="authForm"><label class="field"><span>Юзернейм</span><input name="username" minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="your_name" required></label><label class="field"><span>Пароль</span><input name="password" type="password" minlength="8" autocomplete="current-password" required></label><label class="field hidden" id="displayField"><span>Имя в профиле</span><input name="displayName" maxlength="40" placeholder="Как тебя называть"></label><p id="authError" class="auth-error hidden" role="alert"></p><button class="filled full" id="authSubmit" type="submit">Войти</button></form>`,'');let mode='login';const setMode=next=>{mode=next;$('#loginTab').classList.toggle('selected',mode==='login');$('#registerTab').classList.toggle('selected',mode==='register');$('#displayField').classList.toggle('hidden',mode!=='register');$('#authSubmit').textContent=mode==='login'?'Войти':'Создать аккаунт';$('#authError').classList.add('hidden');$('#authForm [name=password]').autocomplete=mode==='login'?'current-password':'new-password'};$('#loginTab').onclick=()=>setMode('login');$('#registerTab').onclick=()=>setMode('register');$('#authForm').onsubmit=async e=>{e.preventDefault();const submit=$('#authSubmit'),err=$('#authError');submit.disabled=true;submit.textContent='Подождите…';err.classList.add('hidden');const data=Object.fromEntries(new FormData(e.target));data.username=String(data.username||'').trim().replace(/^@/,'').toLowerCase();try{const d=await api('/api/'+mode,{method:'POST',body:JSON.stringify(data)});state.token=d.token;localStorage.setItem('vg_token',d.token);closeModal();await init()}catch(error){err.textContent=error.message==='Неверный юзернейм или пароль'?'Не удалось войти. Проверь юзернейм и пароль, а также ту ли базу данных использует сервер.':error.message;err.classList.remove('hidden')}finally{if($('#authSubmit')){submit.disabled=false;submit.textContent=mode==='login'?'Войти':'Создать аккаунт'}}}}
function renderChats(){
 const list=$('#chatList');
 const chats=state.chats.filter(c=>{
  const archived=!!Number(c.is_archived),starred=!!Number(c.is_starred),unread=Number(c.unread_count||0)>0;
  if(state.folder==='archive')return archived;
  if(archived)return false;
  if(state.folder==='all')return true;
  if(state.folder==='unread')return unread;
  if(state.folder==='pinned')return !!Number(c.is_pinned);
  if(state.folder==='favorites')return starred;
  return c.type===state.folder;
 });
 list.innerHTML=chats.map(c=>{
  const online=c.type==='direct'&&state.onlineUsers.has(Number(c.peer_user_id));
  const unread=Number(c.unread_count||0);
  return '<button class="chat-item '+(state.active?.id===c.id?'active':'')+'" data-id="'+c.id+'">'+
   avatar(c.avatar,c.title,'chat-avatar')+
   '<span class="chat-meta"><b>'+esc(c.title)+' '+(c.type==='channel'?'<span class="tiny-verified">◉</span>':'')+(Number(c.is_pinned)?'<span class="chat-pin-mark"><span class="material-symbols-rounded">push_pin</span></span>':'')+(Number(c.is_starred)?'<span class="chat-favorite-mark">★</span>':'')+'</b>'+
   '<small>'+(online?'<i class="chat-presence-dot"></i>':'')+esc(c.last_message||c.description||'Пока нет сообщений')+'</small></span>'+
   '<span class="chat-time">'+(c.last_time?new Date(c.last_time+'Z').toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'')+(unread?'<i class="chat-unread-badge">'+(unread>99?'99+':unread)+'</i>':'')+'</span></button>';
 }).join('')||'<div class="empty">Здесь пока нет чатов</div>';
 list.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{openChat(+b.dataset.id);$('#sidebar').classList.remove('open')});
}
async function loadChats(){const d=await api('/api/chats');state.chats=d.chats;renderChats()}
function setWallpaper(value){
 const w=$('#wallpaper');const v=String(value||'expressive');
 const upload=v.startsWith('/uploads/');
 const cls=upload?'custom':({pattern:'shapes',diamonds:'m3forms',shapes:'shapes',m3forms:'m3forms',waves:'waves',dots:'dots',plain:'plain',expressive:'expressive'})[v]||'expressive';
 if(w){
  w.className='wallpaper '+cls;
  w.dataset.wallpaper=upload?'custom':v;
  w.style.backgroundImage=upload?'linear-gradient(180deg,rgba(13,13,20,.12),rgba(13,13,20,.24)),url("'+v.replace(/["\\]/g,'')+'")':'';
 }
 document.documentElement.style.setProperty('--vg-wallpaper',upload?'url("'+v.replace(/["\\]/g,'')+'")':'none');
}
async function openChat(id){
 const c=state.chats.find(x=>x.id===id);if(!c)return;
 if(state.active?.id===id){$('#sidebar').classList.remove('open');return}
 const previousChatId=state.active?.id;
 if(previousChatId){
  clearTimeout(state.draftTimer);
  persistChatDraft(previousChatId,$('#messageInput').value).catch(()=>{});
 }
 $('#messageInput').value='';
 state.active=c;state.replyTo=null;state.messageHasMore=false;state.pins=[];
 $('#replyBar').classList.add('hidden');$('#pinnedMessageBanner').classList.add('hidden');
 $('#welcome').classList.add('hidden');
 const conversation=$('#conversation');
 conversation.classList.remove('hidden','chat-enter');void conversation.offsetWidth;conversation.classList.add('chat-enter');
 $('#topTitle').innerHTML=`<b>${esc(c.title)}</b><small>${c.type==='channel'?'Канал':c.type==='group'?'Групповой чат':'Личный диалог'} · ${esc(c.description||'vovchikGram')}</small>`;
 $('#chatBanner').innerHTML=`${avatar(c.avatar,c.title,'banner-avatar')}<div><b>${esc(c.title)}</b><small>${esc(c.description||'')}</small><small id="typingStatus" class="chat-typing-status" aria-live="polite"></small></div><button class="soft-btn" id="chatDetails">Инфо</button>`;
 $('#chatDetails').onclick=()=>chatDetails(c);
 setWallpaper((c.wallpaper&&c.wallpaper!=='shapes')?c.wallpaper:(state.wallpaper||c.wallpaper||'expressive'));
 renderChats();
 try{
  $('#messages').innerHTML='<div class="m3-chat-loading"><span class="m3-loading-indicator" role="progressbar" aria-label="Загрузка диалога"></span><span>Загружаю диалог…</span></div>';
  const [d,draftResponse]=await Promise.all([
   api(`/api/chats/${id}/messages?limit=50`),
   api(`/api/chats/${id}/draft`)
  ]);
  if(state.active?.id===id)$('#messageInput').value=draftResponse.draft?.body||'';
  $('#messages').innerHTML='';d.messages.forEach(m=>addMessage(m));
  state.messageHasMore=!!d.hasMore;updateLoadMoreButton();
  $('#messages').scrollTop=$('#messages').scrollHeight;
  state.socket?.emit('join-chat',id);
  await markChatRead(id);
  await loadChatPins(id);
 }catch(e){toast(e.message)}
}
function updateLoadMoreButton(){
 const button=$('#loadMoreMessages');if(!button)return;
 button.classList.toggle('hidden',!state.messageHasMore);
 button.disabled=state.loadingOlder;
 button.innerHTML=state.loadingOlder
  ? '<span class="m3-loading-indicator" aria-hidden="true"></span>Загрузка…'
  : '<span class="material-symbols-rounded">keyboard_double_arrow_up</span>Загрузить предыдущие сообщения';
}
async function persistChatDraft(chatId,body){
 if(!chatId)return;
 const text=String(body||'').slice(0,4000);
 await api('/api/chats/'+chatId+'/draft',{method:'PUT',body:JSON.stringify({body:text})});
}
function scheduleDraftSave(){
 if(!state.active)return;
 const chatId=state.active.id,body=$('#messageInput').value;
 clearTimeout(state.draftTimer);
 state.draftTimer=setTimeout(()=>persistChatDraft(chatId,body).catch(()=>{}),450);
}
async function markChatRead(chatId){
 try{await api(`/api/chats/${chatId}/read`,{method:'POST'});await loadChats()}catch(e){/* keep chat opening resilient if read marker fails */}
}
async function loadOlderMessages(){
 if(!state.active||!state.messageHasMore||state.loadingOlder)return;
 const list=$('#messages'),first=list.querySelector('.message');
 const before=Number(first?.id?.replace('msg-','')||0);if(!before)return;
 state.loadingOlder=true;updateLoadMoreButton();
 const oldHeight=list.scrollHeight,oldTop=list.scrollTop;
 try{
  const d=await api(`/api/chats/${state.active.id}/messages?before=${before}&limit=50`);
  d.messages.slice().reverse().forEach(m=>addMessage(m,{prepend:true}));
  state.messageHasMore=!!d.hasMore;
  list.scrollTop=list.scrollHeight-oldHeight+oldTop;
 }catch(e){toast(e.message)}
 finally{state.loadingOlder=false;updateLoadMoreButton()}
}
async function loadChatPins(chatId){
 try{
  const d=await api(`/api/chats/${chatId}/pins`);
  if(state.active?.id!==chatId)return;
  state.pins=d.pins||[];
  renderPinnedBanner();
 }catch(e){state.pins=[];renderPinnedBanner()}
}
function renderPinnedBanner(){
 const bar=$('#pinnedMessageBanner');if(!bar)return;
 const pin=state.pins[0];
 if(!pin){bar.classList.add('hidden');bar.innerHTML='';return}
 bar.innerHTML='<span class="material-symbols-rounded">push_pin</span><span class="pin-copy"><b>Закреплённое сообщение</b><small>'+esc(pin.display_name||pin.username||'')+' · '+esc(pin.body||'Вложение')+'</small></span><span class="material-symbols-rounded">chevron_right</span>';
 bar.classList.remove('hidden');
 bar.onclick=()=>document.getElementById('msg-'+pin.id)?.scrollIntoView({behavior:'smooth',block:'center'});
}
async function togglePinMessage(message){
 if(!state.active)return;
 const pinned=!!message.is_pinned;
 try{
  await api(`/api/chats/${state.active.id}/pins/${message.id}`,{method:pinned?'DELETE':'POST'});
  message.is_pinned=!pinned;
  const button=document.querySelector('#msg-'+message.id+' [data-pin]');
  if(button){button.dataset.pinned=String(message.is_pinned);button.title=message.is_pinned?'Открепить':'Закрепить'}
  await loadChatPins(state.active.id);
  toast(message.is_pinned?'Сообщение закреплено':'Сообщение откреплено');
 }catch(e){toast(e.message)}
}
async function saveMessage(message){
 try{await api('/api/messages/'+message.id+'/save',{method:'POST'});toast('Сохранено в Избранное')}
 catch(e){toast(e.message)}
}
async function forwardMessage(message){
 const available=state.chats.filter(chat=>chat.id!==message.chat_id||state.chats.length===1);
 const choices=available.map(chat=>'<button type="button" class="m3-forward-choice" data-forward-chat="'+chat.id+'"><span class="material-symbols-rounded">'+(chat.type==='channel'?'campaign':chat.type==='group'?'groups':'person')+'</span><span><b>'+esc(chat.title)+'</b><small>'+(chat.type==='channel'?'Канал':chat.type==='group'?'Группа':'Личный чат')+'</small></span></button>').join('');
 const dialog=modal('Переслать сообщение','Выбери чат назначения',choices||'<p class="empty">Нет доступных чатов</p>','<button class="soft-btn" data-close>Отмена</button>');
 dialog.querySelectorAll('[data-forward-chat]').forEach(button=>button.onclick=async()=>{
  try{
   await api('/api/messages/'+message.id+'/forward',{method:'POST',body:JSON.stringify({chatId:Number(button.dataset.forwardChat)})});
   closeModal();toast('Сообщение переслано');await loadChats();
  }catch(e){toast(e.message)}
 });
}
async function openMessageHistory(message){
 try{
  const d=await api('/api/messages/'+message.id+'/edits');
  const entries=(d.edits||[]).map((edit,index)=>'<article class="m3-history-entry"><small>Версия '+(d.edits.length-index)+' · '+new Date(String(edit.edited_at).replace(' ','T')+'Z').toLocaleString('ru-RU')+'</small><p>'+esc(edit.body)+'</p></article>').join('');
  modal('История изменений','Предыдущие версии сообщения',entries||'<p class="empty">История изменений пока пуста</p>');
 }catch(e){toast(e.message)}
}
async function openHiddenMessages(){
 try{
  const d=await api('/api/hidden-messages');
  const items=(d.messages||[]).map(m=>'<div class="m3-hidden-item"><span><b>'+esc(m.chat_title)+'</b><small>'+esc(m.body||'Вложение')+'</small></span><button class="soft-btn" data-restore-hidden="'+m.id+'" data-chat-id="'+m.chat_id+'">Вернуть</button></div>').join('');
  const dialog=modal('Скрытые сообщения','Скрытие действует только в твоём аккаунте',items?'<div class="m3-hidden-list">'+items+'</div>':'<p class="empty">Скрытых сообщений нет</p>','<button class="soft-btn" data-close>Закрыть</button>');
  dialog.querySelectorAll('[data-restore-hidden]').forEach(button=>button.onclick=async()=>{
   try{
    const id=Number(button.dataset.restoreHidden),chatId=Number(button.dataset.chatId);
    await api('/api/messages/'+id+'/hide',{method:'DELETE'});
    await openChat(chatId);closeModal();toast('Сообщение возвращено');
   }catch(e){toast(e.message)}
  });
 }catch(e){toast(e.message)}
}
async function hideMessageForMe(message){
 try{
  await api('/api/messages/'+message.id+'/hide',{method:'POST'});
  $('#msg-'+message.id)?.remove();
  await loadChats();
  toast('Сообщение скрыто только у тебя');
 }catch(e){toast(e.message)}
}
async function openSavedMessages(){
 try{
  const d=await api('/api/saved');
  const items=(d.messages||[]).map(m=>`<button class="m3-saved-item" type="button" data-saved-chat="${m.chat_id}" data-saved-message="${m.id}"><span class="material-symbols-rounded">bookmark</span><span><b>${esc(m.chat_title)}</b><small>${esc(m.display_name||m.username)} · ${esc(m.body||'Вложение')}</small></span></button>`).join('');
  const m=modal('Избранное','Сохранённые сообщения твоего аккаунта',items?'<div class="m3-saved-list">'+items+'</div>':'<p class="empty">Сохранённых сообщений пока нет</p>','<button class="soft-btn" data-close>Закрыть</button>');
  m.querySelectorAll('[data-saved-chat]').forEach(b=>b.onclick=()=>{const chatId=Number(b.dataset.savedChat);closeModal();openChat(chatId).then(()=>document.getElementById('msg-'+b.dataset.savedMessage)?.scrollIntoView({behavior:'smooth',block:'center'}))});
 }catch(e){toast(e.message)}
}
function m3Icon(name){return '<span class="material-symbols-rounded" aria-hidden="true">'+name+'</span>'}
function addMessage(m,{prepend=false}={}){
 const old=$('#msg-'+m.id);if(old)old.remove();
 const mine=String(m.username||'').toLowerCase()===String(state.user?.username||'').toLowerCase();
 const senderName=mine?(state.user?.displayName||state.user?.username||m.username):(m.display_name||m.username||'Пользователь');
 const senderAvatar=mine?(state.user?.avatar||m.avatar):(m.avatar||'');
 let reply='';if(m.reply_to)reply='<div class="reply-preview">Ответ на сообщение #'+Number(m.reply_to)+'</div>';
 const forwardHeader=m.forwarded_from_name?'<div class="message-forward"><span class="material-symbols-rounded">forward</span><span><b>Переслано от '+esc(m.forwarded_from_name)+'</b><small>'+esc(m.forwarded_from_chat_title||'Исходный чат')+'</small></span></div>':'';
 const forwardCount=Number(m.forward_count)>0?'<span class="message-forward-count" title="Количество пересылок"><span class="material-symbols-rounded">forward</span>'+Number(m.forward_count)+'</span>':'';

 let reactions={};try{reactions=JSON.parse(m.reactions||'{}')}catch{}
 const react=Object.entries(reactions).filter(([,ids])=>Array.isArray(ids)&&ids.length).map(([emo,ids])=>'<span class="reaction-entry"><button class="reaction" data-react="'+esc(emo)+'">'+esc(emo)+' '+ids.length+'</button><button class="reaction-users" data-react-users="'+esc(emo)+'" title="Кто поставил реакцию" aria-label="Кто поставил реакцию">'+m3Icon('groups')+'</button></span>').join('');
 let attachments=[];try{attachments=JSON.parse(m.attachments||'[]')}catch{}
 const media=attachments.map(a=>{
  const url=esc(a.url),name=esc(a.name||'Вложение'),mime=String(a.mime||''),size=Number(a.size)||0;
  if(mime.startsWith('image/'))return '<a class="message-image-link" href="'+url+'" target="_blank" rel="noopener"><img class="message-image" src="'+url+'" alt="'+name+'" loading="lazy"></a>';
  if(mime.startsWith('video/'))return '<video class="message-video" controls preload="metadata"><source src="'+url+'" type="'+esc(mime)+'"></video>';
  const icon=mime==='application/pdf'?'picture_as_pdf':mime.startsWith('text/')?'description':mime.includes('wordprocessingml')?'article':'folder_zip';
  const sizeLabel=size?size<1024*1024?(size/1024).toFixed(0)+' КБ':(size/1024/1024).toFixed(1)+' МБ':'Файл';
  return '<a class="message-file-card" href="'+url+'" target="_blank" rel="noopener" download="'+name+'"><span class="material-symbols-rounded">'+icon+'</span><span><b>'+name+'</b><small>'+sizeLabel+'</small></span><span class="material-symbols-rounded">download</span></a>';
 }).join('');
 const date=m.created_at?new Date(String(m.created_at).replace(' ','T')+'Z'):new Date();
 const time=Number.isNaN(date.getTime())?'':date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const el=document.createElement('article');
 el.id='msg-'+m.id;el.dataset.messageId=String(m.id);el.dataset.sender=m.username||'';el.className='message m3-message'+(mine?' mine':'');
 el.innerHTML='<div class="message-avatar">'+avatar(senderAvatar,senderName,'sender-avatar')+'</div>'+
  '<div class="message-content">'+forwardHeader+'<div class="sender"><b>'+esc(senderName)+'</b> '+badge(mine?state.user:m)+'</div>'+
  reply+(m.body?'<p>'+esc(m.body)+'</p>':'')+media+
  '<div class="message-foot"><time>'+time+(m.edited_at?' · изм.':'')+'</time>'+
  (mine?'<button type="button" class="message-read" data-readers title="'+(Number(m.read_by_count)>0?'Кто прочитал':'Отправлено')+'" aria-label="Кто прочитал">'+m3Icon(Number(m.read_by_count)>0?'done_all':'done')+'</button>':'')+
  forwardCount+'<span class="message-actions">'+
  '<button data-copy title="Копировать" aria-label="Копировать">'+m3Icon('content_copy')+'</button>'+
  '<button data-message-link title="Скопировать ссылку" aria-label="Скопировать ссылку">'+m3Icon('link')+'</button>'+
  '<button data-reply title="Ответить" aria-label="Ответить">'+m3Icon('reply')+'</button>'+
  '<button data-save title="В Избранное" aria-label="В Избранное">'+m3Icon('bookmark_add')+'</button>'+
  '<button data-hide-me title="Удалить у меня" aria-label="Удалить у меня">'+m3Icon('visibility_off')+'</button>'+
  '<button data-forward title="Переслать" aria-label="Переслать">'+m3Icon('forward')+'</button>'+
  (m.edited_at?'<button data-history title="История изменений" aria-label="История изменений">'+m3Icon('history')+'</button>':'')+
  ((state.active?.type==='direct'||['owner','admin'].includes(state.active?.my_role)||['owner','dev'].includes(state.user?.role))?'<button data-pin data-pinned="'+(m.is_pinned?'true':'false')+'" title="'+(m.is_pinned?'Открепить':'Закрепить')+'" aria-label="Закрепить сообщение">'+m3Icon('push_pin')+'</button>':'')+
  '<button data-react-open title="Реакция" aria-label="Реакция">'+m3Icon('add_reaction')+'</button>'+
  (mine?'<button data-edit title="Изменить" aria-label="Изменить">'+m3Icon('edit')+'</button><button data-delete title="Удалить" aria-label="Удалить">'+m3Icon('delete')+'</button>':'')+
  '</span></div><div class="reactions">'+react+'</div></div>';
 el.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(m.body||'Изображение');toast('Скопировано')}catch{toast('Браузер запретил копирование')}};
 el.querySelector('[data-message-link]').onclick=()=>copyMessageLink(m);
 el.querySelector('[data-reply]').onclick=()=>setReply(m);
 el.querySelector('[data-save]').onclick=()=>saveMessage(m);
 el.querySelector('[data-readers]')?.addEventListener('click',()=>openMessageReaders(m.id));
 el.querySelector('[data-hide-me]').onclick=()=>hideMessageForMe(m);
 el.querySelector('[data-forward]').onclick=()=>forwardMessage(m);
 el.querySelector('[data-history]')?.addEventListener('click',()=>openMessageHistory(m));
 el.querySelector('[data-pin]')?.addEventListener('click',()=>togglePinMessage(m));
 el.querySelector('[data-react-open]').onclick=()=>quickReact(m);
 el.querySelector('[data-edit]')?.addEventListener('click',()=>editMessage(m));
 el.querySelector('[data-delete]')?.addEventListener('click',()=>deleteMessage(m));
 el.querySelectorAll('[data-react]').forEach(b=>b.onclick=()=>reactMessage(m.id,b.dataset.react));
 el.querySelectorAll('[data-react-users]').forEach(b=>b.onclick=()=>openReactionUsers(m.id,b.dataset.react));
 if(prepend){const first=$('#messages').querySelector('.message');if(first)$('#messages').insertBefore(el,first);else $('#messages').append(el)}else{$('#messages').append(el);$('#messages').scrollTop=$('#messages').scrollHeight;}
}
function setReply(m){state.replyTo=m.id;$('#replyBar').innerHTML=`<span>Ответ на <b>@${esc(m.username)}</b>: ${esc(m.body.slice(0,90))}</span><button id="cancelReply">×</button>`;$('#replyBar').classList.remove('hidden');$('#cancelReply').onclick=()=>{state.replyTo=null;$('#replyBar').classList.add('hidden')};$('#messageInput').focus()}
async function editMessage(m){const text=prompt('Изменить сообщение:',m.body);if(text===null||!text.trim())return;try{await api('/api/messages/'+m.id,{method:'PATCH',body:JSON.stringify({body:text})})}catch(e){toast(e.message)}}
async function deleteMessage(m){if(!confirm('Удалить сообщение?'))return;try{await api('/api/messages/'+m.id,{method:'DELETE'})}catch(e){toast(e.message)}}
async function openMessageReaders(messageId){
 try{
  const result=await api('/api/messages/'+messageId+'/readers');
  const rows=(result.readers||[]).map(user=>'<div class="m3-reaction-user">'+avatar(user.avatar,user.display_name,'result-avatar')+'<span><b>'+esc(user.display_name)+'</b><small>@'+esc(user.username)+' · '+new Date(String(user.read_at).replace(' ','T')+'Z').toLocaleString('ru-RU')+'</small></span></div>').join('');
  modal('Прочитали сообщение',(result.readers||[]).length+' участников',rows?'<div class="m3-reaction-users">'+rows+'</div>':'<p class="empty">Пока никто из участников не прочитал это сообщение</p>');
 }catch(e){toast(e.message)}
}
async function openReactionUsers(messageId,emoji){
 try{
  const result=await api('/api/messages/'+messageId+'/reactions?emoji='+encodeURIComponent(emoji));
  const rows=(result.users||[]).map(user=>'<div class="m3-reaction-user">'+avatar(user.avatar,user.display_name,'result-avatar')+'<span><b>'+esc(user.display_name)+'</b><small>@'+esc(user.username)+'</small></span></div>').join('');
  modal('Реакция '+emoji,(result.users||[]).length+' участников поставили эту реакцию',rows?'<div class="m3-reaction-users">'+rows+'</div>':'<p class="empty">Пока никто не поставил эту реакцию</p>');
 }catch(e){toast(e.message)}
}
async function reactMessage(id,emoji){try{await api('/api/messages/'+id+'/reaction',{method:'POST',body:JSON.stringify({emoji})})}catch(e){toast(e.message)}}
function quickReact(m){const options=['👍','❤️','😂','🔥','😮','👏','😢'];const v=prompt('Выбери реакцию:\n'+options.join(' '),'👍');if(v&&[...options,'🎉','😍','💯'].includes(v.trim()))reactMessage(m.id,v.trim())}
async function createChat(defaultType='group'){
 const m=modal('Создать пространство','Новая группа или публичный канал',`<form id="createForm"><label class="field"><span>Название</span><input name="title" maxlength="60" required placeholder="Например, Друзья"></label><label class="field"><span>Описание</span><textarea name="description" maxlength="250" placeholder="О чём это пространство?"></textarea></label><label class="field"><span>Тип пространства</span><select name="type"><option value="group" ${defaultType==='group'?'selected':''}>Групповой чат</option><option value="channel" ${defaultType==='channel'?'selected':''}>Канал</option></select></label><label class="field"><span>Участники через запятую (необязательно)</span><input name="members" placeholder="user1, user2"></label></form>`,'<button class="soft-btn" data-close>Отмена</button><button class="filled" id="createSubmit">Создать</button>');
 $('#createSubmit').onclick=async()=>{const d=Object.fromEntries(new FormData($('#createForm')));d.members=d.members.split(',').map(x=>x.trim().replace(/^@/,'')).filter(Boolean);try{const r=await api('/api/chats',{method:'POST',body:JSON.stringify(d)});closeModal();await loadChats();openChat(r.chat.id)}catch(e){toast(e.message)}};
}
async function findUser(name){
 try{
  const [profile,blockList]=await Promise.all([
   api('/api/users/'+encodeURIComponent(name.replace(/^@/,''))),
   api('/api/blocks')
  ]);
  const u=profile.user;
  let blocked=(blockList.users||[]).some(x=>Number(x.id)===Number(u.id));
  const dialog=modal('Профиль пользователя','@'+esc(u.username),
   '<div class="public-profile">'+avatar(u.avatar,u.displayName,'public-avatar')+
   '<h3>'+esc(u.displayName)+' '+badge(u)+'</h3><p>@'+esc(u.username)+' · '+esc(u.number||'')+'</p><p>'+esc(u.bio||'Описание не добавлено')+'</p></div>'+
   '<p class="muted" id="blockStatus">'+(blocked?'Пользователь заблокирован тобой':'')+'</p>',
   '<button class="soft-btn" data-close>Закрыть</button>'+
   '<button class="danger" id="toggleUserBlock">'+(blocked?'Разблокировать':'Заблокировать')+'</button>'+
   '<button class="filled" id="startDM" '+(blocked?'disabled':'')+'>Написать</button>');
  $('#startDM').onclick=async()=>{
   try{
    const x=await api('/api/dm',{method:'POST',body:JSON.stringify({username:u.username})});
    closeModal();await loadChats();openChat(x.chat.id);
   }catch(e){toast(e.message)}
  };
  $('#toggleUserBlock').onclick=async()=>{
   try{
    await api('/api/users/'+u.id+'/block',{method:blocked?'DELETE':'POST'});
    blocked=!blocked;
    $('#toggleUserBlock').textContent=blocked?'Разблокировать':'Заблокировать';
    $('#startDM').disabled=blocked;
    $('#blockStatus').textContent=blocked?'Пользователь заблокирован тобой':'';
    toast(blocked?'Пользователь заблокирован':'Пользователь разблокирован');
   }catch(e){toast(e.message)}
  };
 }catch(e){toast(e.message)}
}
async function openBlockedUsers(){
 try{
  const d=await api('/api/blocks');
  const list=(d.users||[]).map(u=>'<div class="m3-hidden-item"><span><b>'+esc(u.display_name)+'</b><small>@'+esc(u.username)+'</small></span><button class="soft-btn" data-unblock="'+u.id+'">Разблокировать</button></div>').join('');
  const dialog=modal('Заблокированные','Они не смогут начать с тобой личный диалог или писать в direct-чате',list?'<div class="m3-hidden-list">'+list+'</div>':'<p class="empty">Заблокированных пользователей нет</p>');
  dialog.querySelectorAll('[data-unblock]').forEach(button=>button.onclick=async()=>{
   try{
    await api('/api/users/'+button.dataset.unblock+'/block',{method:'DELETE'});
    button.closest('.m3-hidden-item')?.remove();
    toast('Пользователь разблокирован');
   }catch(e){toast(e.message)}
  });
 }catch(e){toast(e.message)}
}
async function copyMessageLink(message){
 const url=new URL(location.href);
 url.searchParams.set('chat',String(message.chat_id));
 url.searchParams.set('message',String(message.id));
 try{
  await navigator.clipboard.writeText(url.toString());
  toast('Ссылка на сообщение скопирована');
 }catch(e){toast('Браузер не разрешил копирование ссылки')}
}
async function jumpToMessage(chatId,messageId){
 const targetChat=state.chats.find(c=>c.id===Number(chatId));
 if(!targetChat){toast('Чат больше недоступен');return}
 if(state.active?.id!==Number(chatId))await openChat(Number(chatId));
 let target=document.getElementById('msg-'+messageId),guard=0;
 while(!target&&state.messageHasMore&&guard<40){
  await loadOlderMessages();
  target=document.getElementById('msg-'+messageId);
  guard++;
 }
 if(target){
  target.scrollIntoView({behavior:'smooth',block:'center'});
  target.classList.add('m3-search-hit');
  setTimeout(()=>target.classList.remove('m3-search-hit'),1400);
 }else toast('Сообщение не найдено в истории');
}
let searchTimer;$('#searchInput').oninput=()=>{
 clearTimeout(searchTimer);
 const term=$('#searchInput').value.trim();
 if(term.length<2){$('#searchResults').classList.add('hidden');return}
 searchTimer=setTimeout(async()=>{
  try{
   const results=await Promise.all([
    api('/api/search?q='+encodeURIComponent(term)),
    api('/api/search/messages?q='+encodeURIComponent(term)+'&limit=20')
   ]);
   const peopleAndChats=results[0],messageResults=results[1],box=$('#searchResults');
   const users=peopleAndChats.users.map(u=>'<button data-user="'+esc(u.username)+'">'+avatar(u.avatar,u.display_name,'result-avatar')+'<span><b>'+esc(u.display_name)+'</b><small>@'+esc(u.username)+'</small></span></button>');
   const chats=peopleAndChats.chats.map(c=>'<button data-chat="'+c.id+'">'+avatar(c.avatar,c.title,'result-avatar')+'<span><b>'+esc(c.title)+'</b><small>'+(c.type==='channel'?'Канал':'Чат')+'</small></span></button>');
   const messages=(messageResults.messages||[]).map(m=>'<button data-message-chat="'+m.chat_id+'" data-message-id="'+m.id+'"><span class="result-avatar message-search-icon"><span class="material-symbols-rounded">chat</span></span><span><b>'+esc(m.chat_title)+' · '+esc(m.display_name||m.username)+'</b><small>'+esc(String(m.body||'').slice(0,110))+'</small></span></button>');
   box.innerHTML=users.concat(chats,messages).join('')||'<p class="empty">Ничего не найдено</p>';
   box.classList.remove('hidden');
   box.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>{box.classList.add('hidden');findUser(b.dataset.user)});
   box.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{box.classList.add('hidden');openChat(+b.dataset.chat)});
   box.querySelectorAll('[data-message-id]').forEach(b=>b.onclick=()=>{box.classList.add('hidden');jumpToMessage(+b.dataset.messageChat,+b.dataset.messageId)});
  }catch(e){toast(e.message)}
 },250);
};
function setTransferProgress(progress,label){
 const box=$('#transferProgress');if(!box)return;
 const indicator=$('#transferWave');
 if(progress===null){
  indicator.indeterminate=true;indicator.setAttribute('indeterminate','');
  $('#transferValue').textContent='';
 }else{
  const p=Math.max(0,Math.min(100,Number(progress)||0));
  indicator.indeterminate=false;indicator.removeAttribute('indeterminate');
  indicator.value=p;indicator.setAttribute('aria-valuenow',String(Math.round(p)));
  $('#transferValue').textContent=Math.round(p)+'%';
 }
 if(label)$('#transferLabel').textContent=label;
 box.classList.remove('hidden');
}
function hideTransferProgress(){const box=$('#transferProgress');if(box)box.classList.add('hidden')}
function uploadFile(file,kind){
 return new Promise((resolve,reject)=>{
  const max=kind==='audio'?15*1024*1024:kind==='image'?5*1024*1024:20*1024*1024;
  if(file.size>max)return reject(Error(kind==='audio'?'Максимум 15 МБ':kind==='image'?'Изображение до 5 МБ':'Документ или видео до 20 МБ'));
  const reader=new FileReader();
  reader.onprogress=e=>{if(e.lengthComputable)setTransferProgress(e.loaded/e.total*18,'Подготовка '+file.name)};
  reader.onload=()=>{
   const xhr=new XMLHttpRequest();xhr.open('POST','/api/upload');
   xhr.setRequestHeader('Content-Type','application/json');
   if(state.token)xhr.setRequestHeader('Authorization','Bearer '+state.token);
   xhr.upload.onprogress=e=>{if(e.lengthComputable)setTransferProgress(18+(e.loaded/e.total*82),'Отправка '+file.name)};
   xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||'{}')}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(Error(data.error||('Ошибка загрузки '+xhr.status)))};
   xhr.onerror=()=>reject(Error('Сетевая ошибка при загрузке файла'));
   xhr.onabort=()=>reject(Error('Загрузка отменена'));
   xhr.send(JSON.stringify({kind,data:reader.result}));
  };
  reader.onerror=()=>reject(Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
 });
}
let pendingMessageFiles=[];
function renderAttachmentPreview(){
 const box=$('#attachmentPreview');if(!box)return;
 box.innerHTML=pendingMessageFiles.map((file,index)=>{
  const visual=file.type.startsWith('image/')
   ? '<img src="'+URL.createObjectURL(file)+'" alt="">'
   : '<span class="material-symbols-rounded attachment-file-icon">'+(file.type==='application/pdf'?'picture_as_pdf':file.type.startsWith('video/')?'movie':'description')+'</span>';
  const size=file.size<1024*1024?(file.size/1024).toFixed(0)+' КБ':(file.size/1024/1024).toFixed(1)+' МБ';
  return '<div class="attachment-chip">'+visual+'<span>'+esc(file.name)+' · '+size+'</span><button type="button" data-remove-attachment="'+index+'" aria-label="Убрать">×</button></div>';
 }).join('');
 box.classList.toggle('hidden',!pendingMessageFiles.length);
 box.querySelectorAll('[data-remove-attachment]').forEach(button=>button.onclick=()=>{pendingMessageFiles.splice(Number(button.dataset.removeAttachment),1);renderAttachmentPreview()});
}
function addMessageFiles(files){
 const imageTypes=['image/png','image/jpeg','image/webp','image/gif'];
 const fileTypes=['application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','video/webm'];
 for(const file of files){
  const isImage=imageTypes.includes(file.type),isFile=fileTypes.includes(file.type);
  if(!isImage&&!isFile){toast('Поддерживаются изображения, PDF, TXT, DOCX, ZIP, MP4 и WebM');continue}
  const max=isImage?5*1024*1024:20*1024*1024;
  if(file.size>max){toast(isImage?'Изображение должно быть до 5 МБ':'Документ или видео должно быть до 20 МБ');continue}
  if(pendingMessageFiles.length>=8){toast('Максимум 8 вложений в сообщении');break}
  const total=pendingMessageFiles.reduce((sum,item)=>sum+item.size,0)+file.size;
  if(total>22*1024*1024){toast('Общий размер вложений в одном сообщении — до 22 МБ');break}
  pendingMessageFiles.push(file);
 }
 renderAttachmentPreview();
}
async function exportChatHistory(chatId){
 try{
  const data=await api('/api/chats/'+chatId+'/export');
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='vovchikGram-chat-'+chatId+'.json';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('История чата экспортирована');
 }catch(e){toast(e.message)}
}
async function openScheduledMessages(){
 if(!state.active)return;
 const chatId=state.active.id;
 try{
  const d=await api('/api/chats/'+chatId+'/scheduled');
  const rows=(d.messages||[]).map(item=>{
   const time=new Date(Number(item.scheduled_at)*1000).toLocaleString('ru-RU');
   const failed=item.status==='failed';
   return '<article class="m3-scheduled-row"><span><b>'+esc(item.body||'Вложение')+'</b><small>'+time+' · '+(failed?'Ошибка: '+esc(item.error||'не отправлено'):'Ожидает отправки')+'</small></span>'+
    (failed?'':'<button class="soft-btn" data-cancel-scheduled="'+item.id+'">Отменить</button>')+'</article>';
  }).join('');
  const dialog=modal('Отложенные сообщения','Запланированные сообщения этого чата',rows?'<div class="m3-scheduled-list">'+rows+'</div>':'<p class="empty">Отложенных сообщений нет</p>','<button class="soft-btn" data-close>Закрыть</button>');
  dialog.querySelectorAll('[data-cancel-scheduled]').forEach(button=>button.onclick=async()=>{
   try{
    await api('/api/scheduled/'+button.dataset.cancelScheduled,{method:'DELETE'});
    button.closest('.m3-scheduled-row')?.remove();toast('Отправка отменена');
   }catch(e){toast(e.message)}
  });
 }catch(e){toast(e.message)}
}
function openScheduleDialog(){
 if(!state.active)return;
 const suggested=new Date(Date.now()+5*60*1000).toISOString().slice(0,16);
 const html='<label class="field"><span>Дата и время отправки</span><input type="datetime-local" id="scheduledAt" min="'+new Date(Date.now()+1000).toISOString().slice(0,16)+'" value="'+suggested+'" required></label>'+
  '<p class="muted">Сообщение отправится автоматически, даже если браузер будет закрыт. Срок планирования — до 30 дней.</p>';
 const dialog=modal('Отложенная отправка','Выбери, когда отправить сообщение',html,'<button class="soft-btn" data-close>Отмена</button><button class="filled" id="confirmSchedule">Запланировать</button>');
 $('#confirmSchedule').onclick=async()=>{
  const chatId=state.active?.id,body=$('#messageInput').value.trim(),input=$('#scheduledAt').value;
  if(!chatId||(!body&&!pendingMessageFiles.length)){toast('Сначала напиши сообщение или прикрепи фото');return}
  const date=new Date(input);
  if(!input||!Number.isFinite(date.getTime())){toast('Укажи корректное время');return}
  try{
   const attachments=[];
   for(const file of pendingMessageFiles){
    setTransferProgress(0,'Загрузка '+file.name);
    const uploaded=await uploadFile(file,file.type.startsWith('image/')?'image':'file');
    attachments.push({url:uploaded.url,mime:file.type,name:file.name});
   }
   await api('/api/chats/'+chatId+'/scheduled',{method:'POST',body:JSON.stringify({body,attachments,scheduledAt:date.toISOString()})});
   $('#messageInput').value='';clearTimeout(state.draftTimer);
   await api('/api/chats/'+chatId+'/draft',{method:'DELETE'}).catch(()=>{});
   pendingMessageFiles=[];renderAttachmentPreview();hideTransferProgress();
   closeModal();toast('Сообщение запланировано');
  }catch(e){hideTransferProgress();toast(e.message)}
 };
}
async function sendCurrentMessage(){
 if(!state.active)return;
 const input=$('#messageInput'),body=input.value.trim(),chatId=state.active.id;
 if(!body&&!pendingMessageFiles.length)return;
 const send=$('.send-btn');send.disabled=true;
 try{
  const attachments=[];
  for(const file of pendingMessageFiles){
   setTransferProgress(0,'Загрузка '+file.name);
   const up=await uploadFile(file,file.type.startsWith('image/')?'image':'file');
   attachments.push({url:up.url,mime:file.type,name:file.name});
  }
  const d=await api(`/api/chats/${chatId}/messages`,{method:'POST',body:JSON.stringify({body,replyTo:state.replyTo,attachments})});
  if(!state.socket?.connected)addMessage(d.message);
  input.value='';input.style.height='auto';clearTimeout(state.draftTimer);
  await api('/api/chats/'+chatId+'/draft',{method:'DELETE'}).catch(()=>{});
  pendingMessageFiles=[];renderAttachmentPreview();hideTransferProgress();
  state.replyTo=null;$('#replyBar').classList.add('hidden');loadChats();
 }catch(err){hideTransferProgress();toast(err.message)}
 finally{send.disabled=false}
}
function openEmoji(){const box=$('#emojiPicker');box.classList.toggle('hidden');box.innerHTML=`<input id="emojiSearch" placeholder="Найти эмодзи"><div class="emoji-tabs">${Object.keys(emojiGroups).map((x,i)=>`<button data-group="${x}" class="${i===0?'active':''}">${x}</button>`).join('')}</div><div class="emoji-grid" id="emojiGrid"></div>`;function draw(group='Часто',query=''){const all=Object.values(emojiGroups).join(' ').split(/\s+/).filter(x=>x);const list=query?all.filter(x=>x.includes(query)):emojiGroups[group].split(' ');$('#emojiGrid').innerHTML=[...new Set(list)].map(x=>`<button>${x}</button>`).join('');$('#emojiGrid').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#messageInput').value+=$('#messageInput').value?' '+b.textContent:b.textContent;$('#messageInput').focus();box.classList.add('hidden')})}draw();box.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{box.querySelectorAll('[data-group]').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.group)});$('#emojiSearch').oninput=e=>draw('Часто',e.target.value.trim())}
async function chatDetails(c){
 const canEdit=['owner','admin'].includes(c.my_role)||['owner','dev'].includes(state.user.role);
 const canDelete=true;
 const canManageDelete=c.owner_id===state.user.id||c.my_role==='owner'||state.user.role==='owner';
 const deleteDescription=c.type==='direct'?'Диалог будет скрыт из твоего списка.':canManageDelete?`Удаление ${c.type==='channel'?'канала':'группы'} необратимо: будут удалены сообщения и участники.`:`Ты покинешь ${c.type==='channel'?'канал':'группу'}; у остальных участников он останется.`;
 let memberPanel='';
 const canManageMembers=['owner','admin'].includes(c.my_role)||['owner','dev'].includes(state.user.role);
 if(c.type!=='direct'){
  try{
   const memberData=await api('/api/chats/'+c.id+'/members');
   const memberRows=(memberData.members||[]).map(member=>{
    const isOwner=member.chat_role==='owner';
    const canManageThis=canManageMembers&&member.id!==state.user.id&&!isOwner&&(
     ['owner','dev'].includes(state.user.role)||c.my_role==='owner'||(c.my_role==='admin'&&member.chat_role==='member')
    );
    let controls='';
    if(canManageThis){
     if(['owner','dev'].includes(state.user.role)||c.my_role==='owner'){
      controls+='<button class="soft-btn" data-member-role="'+member.id+'" data-next-role="'+(member.chat_role==='admin'?'member':'admin')+'">'+(member.chat_role==='admin'?'Снять админа':'Назначить админом')+'</button>';
     }
     controls+='<button class="danger" data-remove-member="'+member.id+'">Удалить</button>';
    }
    const roleLabel=member.chat_role==='owner'?'Владелец':member.chat_role==='admin'?'Администратор':'Участник';
    return '<div class="m3-member-row"><span>'+avatar(member.avatar,member.display_name,'result-avatar')+'<span><b>'+esc(member.display_name)+'</b><small>@'+esc(member.username)+' · '+roleLabel+'</small></span></span><span class="m3-member-actions">'+controls+'</span></div>';
   }).join('');
   memberPanel='<section class="m3-members-section"><h3>Участники · '+memberData.members.length+'</h3><div class="m3-member-list">'+memberRows+'</div>'+
    (canManageMembers?'<button class="soft-btn" id="createChatInvite"><span class="material-symbols-rounded">link</span>Создать ссылку-приглашение</button><button class="soft-btn" id="openJoinRequests"><span class="material-symbols-rounded">how_to_reg</span>Заявки на вступление</button>':'')+'</section>';
  }catch(error){memberPanel='<p class="muted">Не удалось загрузить список участников.</p>'}
 }
 const formHtml=`<div class="chat-info-head">${avatar(c.avatar,c.title,'public-avatar')}<div><b>${esc(c.title)}</b><small>${esc(c.description||'')}</small></div></div>${canEdit?`<label class="field"><span>Название</span><input id="chatName" value="${esc(c.title)}"></label><label class="field"><span>Описание</span><textarea id="chatDesc">${esc(c.description||'')}</textarea></label><label class="field"><span>Аватар чата</span><input id="chatAvatarFile" type="file" accept="image/*"></label><label class="field"><span>Обои</span><select id="chatWallpaper"><option value="shapes">Мягкие формы</option><option value="m3forms">Капсулы</option><option value="waves">Дуги</option><option value="dots">Точки</option><option value="plain">Без узора</option><option value="__custom">Своя картинка…</option></select></label><label class="field"><span>Свои обои</span><input id="chatWallpaperFile" type="file" accept="image/png,image/jpeg,image/webp"></label>`:''}<p class="muted">Тип: ${c.type==='channel'?'канал':c.type==='group'?'группа':'личный диалог'}</p>${canDelete?`<p class="muted">${deleteDescription}</p>`:''}`;
 const actions='<button class="soft-btn" data-close>Закрыть</button>'+(canEdit?'<button class="filled" id="saveChat">Сохранить</button>':'')+(canDelete?'<button class="danger" id="deleteChannel">'+(c.type==='direct'?'Убрать диалог':canManageDelete?'Удалить пространство':c.type==='channel'?'Покинуть канал':'Покинуть группу')+'</button>':'');
 const preferenceHtml='<div class="chat-preference-actions"><h3>Быстрые настройки</h3>'+
  '<button class="soft-btn" id="toggleChatFavorite"><span class="material-symbols-rounded">'+(Number(c.is_starred)?'star':'star_outline')+'</span>'+(Number(c.is_starred)?'Убрать из избранного':'Добавить в избранное')+'</button>'+
  '<button class="soft-btn" id="toggleChatPin"><span class="material-symbols-rounded">'+(Number(c.is_pinned)?'keep_off':'push_pin')+'</span>'+(Number(c.is_pinned)?'Открепить чат':'Закрепить чат')+'</button>'+
  '<button class="soft-btn" id="toggleChatArchive"><span class="material-symbols-rounded">'+(Number(c.is_archived)?'unarchive':'archive')+'</span>'+(Number(c.is_archived)?'Вернуть из архива':'Переместить в архив')+'</button>'+
  '<div class="chat-mute-control"><label for="chatMuteDuration">Отключить уведомления</label><div class="chat-mute-row"><select id="chatMuteDuration" aria-label="Длительность отключения уведомлений"><option value="60">На 1 час</option><option value="480">На 8 часов</option><option value="1440">На 24 часа</option><option value="10080">На 7 дней</option><option value="-1">Навсегда</option></select><button class="soft-btn" id="toggleChatMute">'+(Number(c.is_muted)?'Включить':'Отключить')+'</button></div>'+(Number(c.is_muted)?'<small class="muted">Уведомления сейчас отключены'+(Number(c.muted_until)?' до '+new Date(Number(c.muted_until)*1000).toLocaleString('ru-RU'):' без срока')+'</small>':'')+'</div>'+
  '<button class="soft-btn" id="openScheduledMessages"><span class="material-symbols-rounded">schedule</span>Отложенные сообщения</button>'+
  '<button class="soft-btn" id="exportChatHistory"><span class="material-symbols-rounded">download</span>Экспортировать историю</button></div>';
 const dialog=modal('Информация о чате','Параметры пространства',formHtml+memberPanel+preferenceHtml,actions);
 const updatePreference=async(field,value)=>{
  try{
   if(field==='muted'&&!value&&'Notification' in window&&Notification.permission==='default') await Notification.requestPermission();
   await api('/api/chats/'+c.id+'/preferences',{method:'PATCH',body:JSON.stringify({[field]:value})});
   await loadChats();
   if(state.active?.id===c.id)state.active=state.chats.find(x=>x.id===c.id)||state.active;
   closeModal();
   toast(field==='starred'?(value?'Добавлено в избранное':'Убрано из избранного'):field==='pinned'?(value?'Чат закреплён':'Чат откреплён'):field==='muted'?(value?'Уведомления отключены':'Уведомления включены'):(value?'Перемещено в архив':'Возвращено из архива'));
  }catch(e){toast(e.message)}
 };
 $('#toggleChatFavorite').onclick=()=>updatePreference('starred',!Number(c.is_starred));
 $('#toggleChatPin').onclick=()=>updatePreference('pinned',!Number(c.is_pinned));
 $('#toggleChatArchive').onclick=()=>updatePreference('archived',!Number(c.is_archived));
 $('#toggleChatMute').onclick=async()=>{
  try{
   const muteMinutes=Number(c.is_muted)?0:Number($('#chatMuteDuration').value);
   await api('/api/chats/'+c.id+'/preferences',{method:'PATCH',body:JSON.stringify({muteMinutes})});
   await loadChats();
   if(state.active?.id===c.id)state.active=state.chats.find(x=>x.id===c.id)||state.active;
   closeModal();
   toast(muteMinutes===0?'Уведомления включены':muteMinutes===-1?'Уведомления отключены навсегда':'Уведомления отключены на выбранный срок');
  }catch(e){toast(e.message)}
 };
 $('#openScheduledMessages').onclick=openScheduledMessages;
 $('#exportChatHistory').onclick=()=>exportChatHistory(c.id);
 dialog.querySelectorAll('[data-member-role]').forEach(button=>button.onclick=async()=>{
  try{
   await api('/api/chats/'+c.id+'/members/'+button.dataset.memberRole,{method:'PATCH',body:JSON.stringify({role:button.dataset.nextRole})});
   await loadChats();closeModal();chatDetails(state.chats.find(x=>x.id===c.id)||c);
  }catch(e){toast(e.message)}
 });
 dialog.querySelectorAll('[data-remove-member]').forEach(button=>button.onclick=async()=>{
  if(!confirm('Удалить участника из этого пространства?'))return;
  try{
   await api('/api/chats/'+c.id+'/members/'+button.dataset.removeMember,{method:'DELETE'});
   await loadChats();closeModal();chatDetails(state.chats.find(x=>x.id===c.id)||c);
  }catch(e){toast(e.message)}
 });
 $('#openJoinRequests')?.addEventListener('click',async()=>{
  const renderRequests=async()=>{
   try{
    const result=await api('/api/chats/'+c.id+'/join-requests');
    const rows=(result.requests||[]).map(request=>'<div class="m3-join-request"><span>'+avatar(request.avatar,request.display_name,'result-avatar')+'<span><b>'+esc(request.display_name)+'</b><small>@'+esc(request.username)+' · '+new Date(request.requested_at+'Z').toLocaleString('ru-RU')+'</small></span></span><span class="m3-join-actions"><button class="soft-btn" data-join-decision="approve" data-request-id="'+request.id+'">Принять</button><button class="danger" data-join-decision="reject" data-request-id="'+request.id+'">Отклонить</button></span></div>').join('');
    const panel=modal('Заявки на вступление',c.title,rows||'<p class="muted">Новых заявок нет.</p>');
    panel.querySelectorAll('[data-join-decision]').forEach(button=>button.onclick=async()=>{
     button.disabled=true;
     try{
      await api('/api/chats/'+c.id+'/join-requests/'+button.dataset.requestId,{method:'PATCH',body:JSON.stringify({decision:button.dataset.joinDecision})});
      toast(button.dataset.joinDecision==='approve'?'Участник добавлен':'Заявка отклонена');
      await loadChats();
      await renderRequests();
     }catch(error){toast(error.message);button.disabled=false}
    });
   }catch(error){toast(error.message)}
  };
  await renderRequests();
 });
 $('#createChatInvite')?.addEventListener('click',async()=>{
  try{
   const result=await api('/api/chats/'+c.id+'/invites',{method:'POST',body:JSON.stringify({expiresInSeconds:7*24*60*60,maxUses:0})});
   const link=location.origin+'/?invite='+encodeURIComponent(result.invite.token);
   await navigator.clipboard.writeText(link);
   toast('Ссылка на приглашение скопирована');
  }catch(e){toast(e.message||'Не удалось скопировать ссылку')}
 });

 if(canEdit){
  $('#chatWallpaper').value=(c.wallpaper||'shapes').startsWith('/uploads/')?'__custom':(c.wallpaper||'shapes');
  $('#saveChat').onclick=async()=>{try{let avatarUrl=c.avatar||'',wallpaper=$('#chatWallpaper').value;const f=$('#chatAvatarFile').files[0],wf=$('#chatWallpaperFile').files[0];if(f)avatarUrl=(await uploadFile(f,'image')).url;if(wf)wallpaper=(await uploadFile(wf,'image')).url;else if(wallpaper==='__custom')wallpaper=c.wallpaper||'shapes';await api('/api/chats/'+c.id,{method:'PATCH',body:JSON.stringify({title:$('#chatName').value,description:$('#chatDesc').value,avatar:avatarUrl,wallpaper})});closeModal();await loadChats();openChat(c.id);toast('Чат обновлён')}catch(e){toast(e.message)}};
 }
 if(canDelete) $('#deleteChannel').onclick=async()=>{
  if(!confirm(c.type==='direct'?`Убрать диалог «${c.title}» из твоего списка?`:`Удалить ${c.type==='channel'?'канал':'группу'} «${c.title}» вместе со всеми сообщениями и участниками? Это действие нельзя отменить.`))return;
  try{const result=await api('/api/chats/'+c.id,{method:'DELETE'});closeModal();if(state.active?.id===c.id){state.active=null;$('#conversation').classList.add('hidden');$('#welcome').classList.remove('hidden');$('#topTitle').innerHTML='';$('#messages').innerHTML=''}await loadChats();toast(result.left?(c.type==='direct'?'Диалог убран из списка':'Ты покинул пространство'):c.type==='channel'?'Канал удалён':'Группа удалена')}catch(e){toast(e.message)}
 };
}
function profileSide(){const u=state.user;$('#profileSide').innerHTML=`<div class="side-cover" style="${safeBg(u.profileBg)}"></div><button class="icon-btn side-close" id="closeProfile">×</button>${avatar(u.avatar,u.displayName,'side-avatar')}<h2>${esc(u.displayName)} ${badge(u)}</h2><p>@${esc(u.username)} ${u.verified?'<span class="verified-label">Подтверждённый аккаунт</span>':''}</p><p>${esc(u.bio||'Описание не добавлено')}</p><div class="side-detail"><small>Анонимный номер</small><b>${esc(u.number||'—')}</b></div>${state.needsOwnerSetup&&u.username==='owner'?'<p class="muted">Номер владельца +888000888 назначится после активации прав в настройках.</p>':''}<button class="filled full" id="sideSettings">Редактировать профиль</button>`;$('#profileSide').classList.remove('hidden');$('#closeProfile').onclick=()=>$('#profileSide').classList.add('hidden');$('#sideSettings').onclick=()=>{ $('#profileSide').classList.add('hidden');settings()}}
function safeBg(v){const x=String(v||'').trim();return (/^#[0-9a-f]{3,8}$/i.test(x)||/^[a-z]{3,20}$/i.test(x)||/^linear-gradient\([\w\s,#.%()deg-]+\)$/i.test(x))?`background:${x}`:''}
function settings(){
 if(!state.user)return showAuth();
 const fonts={google:'Roboto Flex · M3 Expressive',roboto:'Roboto',inter:'Inter',system:'Системный'};
 const wallpaperOptions=[['expressive','Expressive'],['shapes','Мягкие формы'],['m3forms','Капсулы'],['waves','Дуги'],['dots','Точки'],['plain','Чистый фон']];
 const m=modal('Настройки','Настрой свой vovchikGram',`
 <div class="settings-section"><h3>Оформление</h3><span class="muted">Палитра Material You</span><div class="palette">${Object.entries(themes).map(([k,v])=>`<button class="palette-item ${state.theme===k?'selected':''}" data-theme="${k}" style="--swatch:${v.primary}" title="${k}"><i></i><span>${({blue:'Ocean',green:'Forest',purple:'Lavender',rose:'Rose',orange:'Sand',mono:'Mono'})[k]}</span></button>`).join('')}</div>
 <label class="field"><span>Размер шрифта <b id="fontLabel">${Math.round((state.ui.fontScale||1)*100)}%</b></span><input id="fontSize" type="range" min="85" max="145" value="${Math.round((state.ui.fontScale||1)*100)}"></label>
 <label class="field"><span>Шрифт интерфейса</span><select id="fontFamily">${Object.entries(fonts).map(([k,v])=>`<option value="${k}" ${(state.ui.fontFamily||'google')===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label class="field"><span>Скругление сообщений <b id="radiusLabel">${state.ui.bubbleRadius||20}px</b></span><input id="bubbleRadius" type="range" min="8" max="32" value="${state.ui.bubbleRadius||20}"></label>
 <label class="field"><span>Расстояние между сообщениями <b id="gapLabel">${state.ui.chatGap||10}px</b></span><input id="chatGap" type="range" min="4" max="24" value="${state.ui.chatGap||10}"></label>
 <label class="field"><span>Плотность списка</span><select id="density"><option value="normal">Обычная</option><option value="compact" ${state.ui.density==='compact'?'selected':''}>Компактная</option></select></label>
 <label class="toggle"><input id="darkMode" type="checkbox" ${state.ui.dark?'checked':''}> Тёмная тема</label>
 <label class="toggle"><input id="sendOnEnter" type="checkbox" ${state.ui.sendOnEnter!==false?'checked':''}> Отправлять по Enter <small class="muted">Shift+Enter — новая строка</small></label></div>
 <div class="settings-section"><h3>Профиль</h3><div class="profile-edit-head">${avatar(state.user.avatar,state.user.displayName,'edit-avatar')}<label class="soft-btn upload-label">Изменить фото<input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>
 <label class="field"><span>Имя</span><input id="pName" value="${esc(state.user.displayName)}" maxlength="40"></label><label class="field"><span>Описание</span><textarea id="pBio" maxlength="160">${esc(state.user.bio||'')}</textarea></label>
 <div class="profile-number-card"><small>Твой номер vovchikGram</small><b>${esc(state.user.number||'—')}</b><span>${state.user.verified?'✓ Подтверждённый аккаунт':'Идентификатор аккаунта'}</span></div>
 <label class="field"><span>Цвет обложки</span><div class="cover-colors">${['#526da8','#39765c','#72599d','#a45370','#946039','#555963'].map(c=>`<button data-cover="${c}" style="background:${c}"></button>`).join('')}</div></label><label class="field"><span>Цвет обложки профиля</span><input id="pBg" type="color" value="${/^#[0-9a-f]{6}$/i.test(state.user.profileBg||'')?state.user.profileBg:'#526da8'}"></label><button id="saveProfile" class="filled">Сохранить профиль</button></div>
 <div class="settings-section"><h3>Юзернеймы · ${state.usernames?.length||0}/5</h3><div id="namesList">${(state.usernames||[]).map(n=>`<div class="name-row">@${esc(n)}<button class="danger" data-remove="${esc(n)}">Удалить</button></div>`).join('')}</div><div class="inline-input"><input id="newUsername" minlength="3" maxlength="24" placeholder="dev или my_username"><button id="addUsername" class="soft-btn">＋ Добавить</button></div></div>
 <div class="settings-section"><h3>Обои чатов</h3><div class="wallpaper-options wallpaper-options-wide">${wallpaperOptions.map(([v,t])=>`<button data-wall="${v}" class="wall-sample ${v} ${(state.wallpaper===v||(state.wallpaper==='pattern'&&v==='shapes'))?'selected':''}">${t}</button>`).join('')}</div><button class="soft-btn" id="uploadWallpaper">Загрузить свои обои</button></div>
 <div class="settings-section"><h3>Музыка</h3><p class="muted">Личная медиатека с таймкодами, перемоткой и скоростью воспроизведения.</p><button class="soft-btn" id="openMediaFromSettings">Открыть медиаплеер и редактор</button><div id="songList" class="song-list"></div></div>
 <div class="settings-section"><h3>Безопасность аккаунта</h3>
 <form id="passwordChangeForm"><label class="field"><span>Текущий пароль</span><input id="currentPassword" type="password" autocomplete="current-password" required></label><label class="field"><span>Новый пароль</span><input id="newPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="field"><span>Повтори новый пароль</span><input id="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button class="soft-btn" type="submit">Изменить пароль</button></form>
 <p class="muted">После смены пароля остальные устройства будут отключены.</p></div>
 <div class="settings-section"><h3>История безопасности</h3><div id="accountActivity"><span class="muted">Загружаю события…</span></div></div>
 <div class="settings-section"><h3>Активные сеансы</h3><p class="muted">Управляй устройствами, где выполнен вход в аккаунт.</p><div id="activeSessions"><span class="muted">Загружаю сеансы…</span></div><button class="soft-btn" id="revokeOtherSessions">Завершить все остальные сеансы</button></div>
 <div class="settings-section"><h3>Приложение</h3><p class="muted">vovchikGram · build 1.7.1<br>Material 3 Expressive · Roboto Flex · Dynamic wallpapers</p></div>
 ${state.needsOwnerSetup&&state.user.username==='owner'?'<div class="settings-section owner-setup-section"><h3>Активация панели владельца</h3><p class="muted">Аккаунт @owner пока не назначен владельцем сервера. Укажи свой OWNER_PASSWORD в файле .env, перезапусти сервер и введи это значение здесь. После активации номер станет +888000888.</p><label class="field"><span>Ключ владельца из .env</span><input id="ownerBootstrapPassword" type="password" autocomplete="current-password" placeholder="Пароль из OWNER_PASSWORD"></label><button id="claimOwner" class="filled">Активировать права владельца</button></div>':''}${['owner','dev'].includes(state.user.role)?'<div class="settings-section"><h3>Администрирование</h3><p class="muted">Блокировка и удаление пользовательских аккаунтов.</p><button id="adminOpen" class="soft-btn">Открыть панель управления</button></div>':''}
 <div class="settings-section"><button id="logout" class="danger">Выйти из аккаунта</button></div>`, '<button class="soft-btn" data-close>Готово</button>');
 m.querySelectorAll('[data-theme]').forEach(b=>b.onclick=async()=>{applyTheme(b.dataset.theme);m.querySelectorAll('[data-theme]').forEach(x=>x.classList.toggle('selected',x===b));try{const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify({theme:state.theme})});state.user=d.user}catch(e){toast('Тема сохранена на этом устройстве')}});
 m.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>$('#pBg').value=b.dataset.cover);
 m.querySelectorAll('[data-wall]').forEach(b=>b.onclick=()=>{state.wallpaper=b.dataset.wall;localStorage.setItem('vg_wallpaper',state.wallpaper);setWallpaper(state.wallpaper);m.querySelectorAll('[data-wall]').forEach(x=>x.classList.toggle('selected',x===b))});
 const saveUI=()=>localStorage.setItem('vg_ui',JSON.stringify(state.ui));
 const bindRange=(id,key,label,suffix,mult=1)=>$('#'+id).oninput=e=>{state.ui[key]=Number(e.target.value)*mult;$('#'+label).textContent=e.target.value+suffix;applyUI();saveUI()};
 bindRange('fontSize','fontScale','fontLabel','%',.01);bindRange('bubbleRadius','bubbleRadius','radiusLabel','px');bindRange('chatGap','chatGap','gapLabel','px');
 $('#fontFamily').onchange=e=>{state.ui.fontFamily=e.target.value;applyUI();saveUI()};
 $('#density').onchange=e=>{state.ui.density=e.target.value;applyUI();saveUI()};
 $('#darkMode').onchange=e=>{state.ui.dark=e.target.checked;applyUI();saveUI();$('#drawerThemeState').textContent=state.ui.dark?'Вкл.':'Выкл.'};
 $('#sendOnEnter').onchange=e=>{state.ui.sendOnEnter=e.target.checked;saveUI()};
 $('#passwordChangeForm').onsubmit=async e=>{
  e.preventDefault();
  const currentPassword=$('#currentPassword').value,newPassword=$('#newPassword').value,confirmPassword=$('#confirmPassword').value;
  if(newPassword!==confirmPassword){toast('Новые пароли не совпадают');return}
  try{const result=await api('/api/account/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});$('#passwordChangeForm').reset();toast('Пароль изменён · остальные сеансы завершены');loadAccountSessions();loadAccountActivity()}
  catch(error){toast(error.message)}
 };
 async function loadAccountActivity(){
  const box=$('#accountActivity');if(!box)return;
  const labels={account_registered:'Аккаунт создан',login_succeeded:'Успешный вход',login_failed:'Неудачная попытка входа',password_changed:'Пароль изменён',session_revoked:'Сеанс завершён',other_sessions_revoked:'Завершены другие сеансы',logout:'Выход из аккаунта'};
  try{const data=await api('/api/account/activity');box.innerHTML=data.events.map(event=>'<div class="session-row"><div><b>'+esc(labels[event.event]||event.event)+'</b><small>'+esc(new Date(String(event.created_at).replace(' ','T')+'Z').toLocaleString())+'</small></div></div>').join('')||'<p class="muted">Событий пока нет</p>'}
  catch(error){box.innerHTML='<p class="muted">'+esc(error.message)+'</p>'}
 }
 async function loadAccountSessions(){
  const box=$('#activeSessions');if(!box)return;
  try{
   const data=await api('/api/sessions');
   box.innerHTML=data.sessions.map(s=>'<div class="session-row"><div><b>'+(s.current?'Это устройство':'Другой сеанс')+'</b><small>'+esc(s.user_agent||'Неизвестный браузер')+'</small><small>Вход: '+esc(new Date(s.created_at).toLocaleString())+'</small></div>'+(s.current?'<span class="session-current">Текущий</span>':'<button class="danger" data-revoke-session="'+esc(s.id)+'">Завершить</button>')+'</div>').join('')||'<p class="muted">Нет активных сеансов</p>';
   box.querySelectorAll('[data-revoke-session]').forEach(button=>button.onclick=async()=>{try{await api('/api/sessions/'+encodeURIComponent(button.dataset.revokeSession),{method:'DELETE'});toast('Сеанс завершён');loadAccountSessions()}catch(e){toast(e.message)}});
  }catch(e){box.innerHTML='<p class="muted">'+esc(e.message)+'</p>'}
 }
 $('#revokeOtherSessions').onclick=async()=>{if(!confirm('Завершить все остальные сеансы?'))return;try{const d=await api('/api/sessions/revoke-others',{method:'POST'});toast('Завершено сеансов: '+d.revoked);loadAccountSessions()}catch(e){toast(e.message)}};
 loadAccountSessions();loadAccountActivity();
 $('#saveProfile').onclick=async()=>{try{let avatarUrl=state.user.avatar||'';const f=$('#avatarFile').files[0];if(f)avatarUrl=(await uploadFile(f,'image')).url;const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify({displayName:$('#pName').value,bio:$('#pBio').value,profileBg:$('#pBg').value,avatar:avatarUrl,theme:state.theme})});state.user=d.user;drawProfile();toast('Профиль сохранён')}catch(e){toast(e.message)}};
 $('#addUsername').onclick=async()=>{try{await api('/api/usernames',{method:'POST',body:JSON.stringify({username:$('#newUsername').value})});toast('Юзернейм добавлен');closeModal();await refreshMe();settings()}catch(e){toast(e.message)}};
 m.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{await api('/api/usernames/'+encodeURIComponent(b.dataset.remove),{method:'DELETE'});closeModal();await refreshMe();settings()}catch(e){toast(e.message)}});
 $('#uploadWallpaper').onclick=()=>{const f=$('#imagePicker');f.onchange=async()=>{if(!f.files[0])return;try{const r=await uploadFile(f.files[0],'image');state.wallpaper=r.url;localStorage.setItem('vg_wallpaper',r.url);setWallpaper(state.wallpaper);toast('Обои загружены')}catch(e){toast(e.message)}};f.click()};
 $('#openMediaFromSettings').onclick=()=>openMedia();loadSongs();$('#claimOwner')?.addEventListener('click',async()=>{const key=$('#ownerBootstrapPassword').value;try{const d=await api('/api/claim-owner',{method:'POST',body:JSON.stringify({bootstrapPassword:key})});state.user=d.user;state.needsOwnerSetup=false;drawProfile();closeModal();toast('Права владельца активированы · +888000888');settings()}catch(e){toast(e.message)}});$('#adminOpen')?.addEventListener('click',()=>{closeModal();adminPanel()});
 $('#logout').onclick=async()=>{let serverRevoked=false;try{await api('/api/logout',{method:'POST'});serverRevoked=true}catch{}finally{localStorage.removeItem('vg_token');state.token=null;state.user=null;state.socket?.disconnect();closeModal();showAuth();if(serverRevoked)toast('Ты вышел из аккаунта');else toast('Локальный выход выполнен; сервер не подтвердил отзыв сеанса')}};
}
async function refreshMe(){const d=await api('/api/me');state.user=d.user;state.usernames=d.usernames||[];state.needsOwnerSetup=!!d.needsOwnerSetup;drawProfile()}
async function loadSongs(){
 const target=$('#mediaSongList');if(target)target.innerHTML='<div class="m3-loading-row"><span class="m3-loading-indicator" role="progressbar" aria-label="Загрузка медиатеки"></span><span>Загружаю медиатеку…</span></div>';
 try{
  const d=await api('/api/songs');state.songs=d.songs;
  const render=(box,expanded=false)=>{if(!box)return;box.innerHTML=state.songs.map((song,i)=>`<div class="${expanded?'media-song-row':'song-row'} ${state.currentSong?.id===song.id?'playing':''}"><button data-play="${song.id}" title="Воспроизвести">▶</button><span>${esc(song.title)}</span>${expanded?`<small>#${i+1}</small>`:''}<button data-remove-song="${song.id}" title="Удалить из медиатеки">×</button></div>`).join('')||'<small class="muted">Пока нет треков</small>';box.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>playSong(state.songs.find(x=>x.id===+b.dataset.play)));box.querySelectorAll('[data-remove-song]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить трек из медиатеки?'))return;try{await api('/api/songs/'+b.dataset.removeSong,{method:'DELETE'});if(state.currentSong?.id===+b.dataset.removeSong){$('#audioPlayer').pause();state.currentSong=null;updatePlayerLabels()}await loadSongs()}catch(e){toast(e.message)}})};
  render($('#songList'));render($('#mediaSongList'),true);
 }catch(e){const target=$('#mediaSongList');if(target)target.innerHTML='<p class="empty">Не удалось загрузить медиатеку</p>';toast(e.message)}
}
function formatTime(value){if(!Number.isFinite(value)||value<0)return '00:00';const sec=Math.floor(value);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function updatePlayerLabels(){
 const a=$('#audioPlayer'),song=state.currentSong,playing=!a.paused&&!!a.src;
 $('#mediaTrackTitle').textContent=song?.title||'Выбери композицию';
 $('#mediaTrackSubtitle').textContent=song?'Личная коллекция':'Персональный плеер vovchikGram';
 $('#trackName').textContent=song?.title||'Нет трека';
 $('#mediaCurrent').textContent=formatTime(a.currentTime);
 $('#mediaDuration').textContent=formatTime(a.duration);
 $('#mediaPlayPause').innerHTML='<span class="material-symbols-rounded">'+(playing?'pause':'play_arrow')+'</span>';
 $('#mediaPlayPause').setAttribute('aria-label',playing?'Пауза':'Воспроизвести');
 $('#mediaPlayPause').title=playing?'Пауза':'Воспроизвести';
 $('#mediaPanel').classList.toggle('is-playing',playing);
 $('#playerDock').classList.toggle('is-playing',playing);
 const progress=a.duration?Math.min(100,Math.max(0,a.currentTime/a.duration*100)):0;
 $('#mediaSeek').value=Math.round(progress*10);
 const nativeProgress=$('#mediaWaveform');
 if(nativeProgress){nativeProgress.value=progress;nativeProgress.setAttribute('aria-valuenow',String(Math.round(progress)))}
}
function openMedia(){if(!state.user)return showAuth();const panel=$('#mediaPanel');clearTimeout(closeMedia.timer);panel.classList.remove('hidden');panel.classList.remove('media-panel-open');void panel.offsetWidth;panel.classList.add('media-panel-open');loadSongs()}
function closeMedia(){const panel=$('#mediaPanel');panel.classList.remove('media-panel-open');clearTimeout(closeMedia.timer);closeMedia.timer=setTimeout(()=>panel.classList.add('hidden'),220)}
function playSong(song){if(!song)return;state.currentSong=song;$('#playerDock').classList.remove('hidden');$('#audioPlayer').src=song.file_url;$('#audioPlayer').play().catch(()=>{});updatePlayerLabels();loadSongs()}
function stepSong(delta){if(!state.songs.length)return;let i=state.songs.findIndex(x=>x.id===state.currentSong?.id);i=i<0?0:(i+delta+state.songs.length)%state.songs.length;playSong(state.songs[i])}
$('#audioPlayer').addEventListener('timeupdate',updatePlayerLabels);$('#audioPlayer').addEventListener('durationchange',updatePlayerLabels);$('#audioPlayer').addEventListener('play',updatePlayerLabels);$('#audioPlayer').addEventListener('pause',updatePlayerLabels);$('#audioPlayer').addEventListener('ended',()=>stepSong(1));
$('#mediaSeek').oninput=e=>{const a=$('#audioPlayer');if(a.duration)a.currentTime=a.duration*Number(e.target.value)/1000;const p=Number(e.target.value)/10+'%';e.target.style.setProperty('--seek-progress',p);$('#mediaWaveform')?.style.setProperty('--seek-progress',p);updatePlayerLabels()};
$('#mediaPlayPause').onclick=()=>{const a=$('#audioPlayer');if(!a.src){if(state.songs[0])playSong(state.songs[0]);else toast('Сначала добавь трек');return}if(a.paused)a.play().catch(()=>{});else a.pause()};
$('#mediaPrevious').onclick=()=>stepSong(-1);$('#mediaNext').onclick=()=>stepSong(1);$('#mediaSpeed').onchange=e=>$('#audioPlayer').playbackRate=Number(e.target.value);
$('#mediaAddTrack').onclick=()=>$('#audioPicker').click();$('#dockOpenMedia').onclick=openMedia;$('#dockTrackOpen').onclick=openMedia;$('#closeMedia').onclick=closeMedia;
$('#audioPicker').onchange=async()=>{const f=$('#audioPicker').files[0];if(!f)return;try{setTransferProgress(0,'Загрузка '+f.name);const up=await uploadFile(f,'audio');await api('/api/songs',{method:'POST',body:JSON.stringify({title:f.name.replace(/\.[^.]+$/,''),url:up.url})});await loadSongs();toast('Трек добавлен в медиатеку')}catch(e){toast(e.message)}finally{hideTransferProgress();$('#audioPicker').value=''}};
async function adminPanel(){
 try{
  const [stats,users]=await Promise.all([api('/api/admin/stats'),api('/api/admin/users')]);
  const m=modal('Администрирование','Управление аккаунтами · блокировка и удаление',`<div class="admin-grid">${Object.entries({Пользователи:stats.users,Онлайн:stats.online,Заблокировано:stats.banned,Чаты:stats.chats,Сообщения:stats.messages}).map(([k,v])=>`<div class="stat"><strong>${v}</strong><small>${k}</small></div>`).join('')}</div><h3>Пользователи</h3><div class="admin-user-list">${users.users.map(u=>`<div class="admin-user-row"><div class="admin-user-main"><b>@${esc(u.username)} ${u.role!=='user'?`<small class="role-tag">${esc(u.role)}</small>`:''}</b><small>${esc(u.display_name)} · ${esc(u.number||'')}</small><small>${u.banned?'Заблокирован':'Активен'}</small></div>${['owner','dev'].includes(u.role)?'<span class="muted">Защищён</span>':`<div class="admin-user-actions"><button class="${u.banned?'soft-btn':'danger'}" data-ban="${u.id}" data-state="${u.banned?0:1}">${u.banned?'Разбанить':'Бан'}</button><button class="danger" data-delete-user="${u.id}" data-username="${esc(u.username)}">Удалить</button></div>`}</div>`).join('')||'<p class="empty">Нет пользователей</p>'}</div>`,'<button class="soft-btn" data-close>Закрыть</button>');
  m.querySelectorAll('[data-ban]').forEach(b=>b.onclick=async()=>{try{await api('/api/admin/ban',{method:'POST',body:JSON.stringify({userId:+b.dataset.ban,banned:!!+b.dataset.state})});closeModal();adminPanel()}catch(e){toast(e.message)}});
  m.querySelectorAll('[data-delete-user]').forEach(b=>b.onclick=async()=>{const username=b.dataset.username;if(!confirm(`Удалить аккаунт @${username} без возможности восстановления? Его сообщения и медиатека будут удалены, а принадлежащие ему группы при наличии участников перейдут другому участнику.`))return;try{await api('/api/admin/users/'+b.dataset.deleteUser,{method:'DELETE'});toast('Аккаунт удалён');closeModal();adminPanel()}catch(e){toast(e.message)}});
 }catch(e){toast(e.message)}
}
function showIncomingNotification(message){
 const chat=state.chats.find(x=>x.id===Number(message.chat_id));
 if(!chat||Number(chat.is_muted)||!document.hidden)return;
 if(!('Notification' in window)||Notification.permission!=='granted')return;
 const sender=message.display_name||message.username||'Новое сообщение';
 const preview=String(message.body||'Вложение').slice(0,140);
 const notification=new Notification(chat.title,{body:sender+': '+preview,icon:'/icons/icon.svg',tag:'vovchikgram-chat-'+chat.id});
 notification.onclick=()=>{window.focus();const target=state.chats.find(x=>x.id===chat.id);if(target)openChat(chat.id);notification.close()};
}
document.addEventListener('visibilitychange',async()=>{
 if(document.hidden||!state.active)return;
 const chatId=state.active.id;
 try{
  const data=await api('/api/chats/'+chatId+'/messages?limit=50');
  if(state.active?.id!==chatId)return;
  $('#messages').innerHTML='';data.messages.forEach(m=>addMessage(m));
  state.messageHasMore=!!data.hasMore;updateLoadMoreButton();
  $('#messages').scrollTop=$('#messages').scrollHeight;
  await markChatRead(chatId);
 }catch(e){/* reconnect and refresh again on the next focus */}
});
function initSocket(){
 state.socket?.disconnect();state.socket=io({auth:{token:state.token}});
 state.socket.on('presence-snapshot',d=>{state.onlineUsers=new Set((d.userIds||[]).map(Number));renderChats()});
 state.socket.on('presence-update',d=>{if(d.online)state.onlineUsers.add(Number(d.userId));else state.onlineUsers.delete(Number(d.userId));renderChats()});
 state.socket.on('message',m=>{
  if(state.active?.id===m.chat_id&&!document.hidden){addMessage(m);markChatRead(m.chat_id)}
  else showIncomingNotification(m);
  loadChats();
 });
 state.socket.on('message-updated',m=>{if(state.active?.id===m.chat_id)addMessage(m)});
 state.socket.on('message-deleted',d=>$('#msg-'+d.id)?.remove());
 state.socket.on('chat-read',d=>{
  if(state.active?.id!==d.chatId)return;
  document.querySelectorAll('#messages>.message.mine').forEach(el=>{
   if(Number(el.dataset.messageId)<=Number(d.lastReadMessageId)){
    const marker=el.querySelector('.message-read');if(marker)marker.innerHTML=m3Icon('done_all');
   }
  });
 });
 state.socket.on('pins-updated',d=>{if(state.active?.id===d.chatId)loadChatPins(d.chatId)});
 state.socket.on('typing',d=>{
  if(state.active?.id!==d.chatId||Number(d.userId)===Number(state.user?.id))return;
  const label=$('#typingStatus');if(!label)return;
  clearTimeout(state.typingTimer);
  label.textContent=d.typing?(d.displayName||d.username)+' печатает…':'';
  if(d.typing)state.typingTimer=setTimeout(()=>{label.textContent=''},1800);
 });
 state.socket.on('chat-deleted',d=>{state.chats=state.chats.filter(c=>c.id!==d.id);if(state.active?.id===d.id){state.active=null;$('#conversation').classList.add('hidden');$('#welcome').classList.remove('hidden');$('#topTitle').innerHTML='';$('#messages').innerHTML=''}renderChats();toast('Канал удалён владельцем')});
 state.socket.on('reaction-updated',d=>{if(state.active)api(`/api/chats/${state.active.id}/messages?limit=50`).then(x=>{$('#messages').innerHTML='';x.messages.forEach(m=>addMessage(m));state.messageHasMore=!!x.hasMore;updateLoadMoreButton()}).catch(()=>{})});
 state.socket.on('connect_error',()=>toast('Соединение с сервером потеряно'));
}
const materialProgressReady=(async()=>{
 try{
  await import('/vendor/material/elements/css/progress.js');
  const materialElements=await import('/vendor/material/elements/index.js');
  materialElements.defineProgress();
  return true;
 }catch(error){
  console.error('Material 3 progress component failed to load:',error);
  return false;
 }
})();
async function showInvitePreview(token){
 try{
  const result=await api('/api/invites/'+encodeURIComponent(token));
  const chat=result.chat,invite=result.invite;
  const description=chat.description||'Описание не добавлено';
  const body='<div class="chat-invite-preview">'+avatar(chat.avatar,chat.title,'public-avatar')+'<h3>'+esc(chat.title)+'</h3><p>'+esc(description)+'</p><small>'+(chat.type==='channel'?'Публичный канал':'Групповой чат')+'</small>'+
   (invite.valid?'':'<p class="auth-error">Эта ссылка истекла или исчерпала лимит использований.</p>')+'</div>';
  const dialog=modal('Приглашение в пространство','Проверь информацию перед вступлением',body,'<button class="soft-btn" data-close>Отмена</button><button class="filled" id="joinInvite" '+(invite.valid?'':'disabled')+'>Присоединиться</button>');
  $('#joinInvite').onclick=async()=>{
   try{
    const joined=await api('/api/invites/'+encodeURIComponent(token)+'/join',{method:'POST',body:'{}'});
    const url=new URL(location.href);url.searchParams.delete('invite');history.replaceState({},'',url.pathname+url.search+url.hash);
    closeModal();await loadChats();openChat(joined.chat.id);toast('Ты присоединился к пространству');
   }catch(e){toast(e.message)}
  };
 }catch(e){toast(e.message)}
}
async function init(){try{
 await materialProgressReady;
 if(!state.token){showAuth();return}
 await refreshMe();applyTheme(state.user.theme||state.theme);applyUI();await loadChats();initSocket();
 const params=new URLSearchParams(location.search);
 const inviteToken=params.get('invite');
 if(inviteToken)await showInvitePreview(inviteToken);
 else{
  const linkedChat=Number(params.get('chat')),linkedMessage=Number(params.get('message'));
  if(linkedChat>0&&linkedMessage>0)await jumpToMessage(linkedChat,linkedMessage);
 }
}catch(e){localStorage.removeItem('vg_token');state.token=null;state.user=null;showAuth()}}
$('#newChat').onclick=()=>{closeSpaceMenu();createChat('group')};
$('#newChatMenu').onclick=e=>{e.stopPropagation();const menu=$('#newChatMenuItems'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('#newChatMenu').setAttribute('aria-expanded',String(open));};
function closeSpaceMenu(){const menu=$('#newChatMenuItems');if(menu)menu.classList.add('hidden');$('#newChatMenu')?.setAttribute('aria-expanded','false')}
$('#newChatMenuItems').querySelectorAll('[data-create-space]').forEach(b=>b.onclick=()=>{const kind=b.dataset.createSpace;closeSpaceMenu();createChat(kind)});
document.addEventListener('click',e=>{if(!e.target.closest('.m3-split-button'))closeSpaceMenu()});
$('#loadMoreMessages').onclick=loadOlderMessages;
$('#scheduleMessage').onclick=openScheduleDialog;
$('#welcomeCreate').onclick=createChat;$('#settingsBtn').onclick=settings;$('#drawerProfile').onclick=()=>state.user?profileSide():showAuth();$('#profileBtn').onclick=()=>state.user?profileSide():showAuth();$('#accountBtn').onclick=()=>state.user?settings():showAuth();$('#menuPlayer').onclick=openMedia;$('#playerBtn').onclick=()=>$('#playerDock').classList.toggle('hidden');$('#closePlayer').onclick=()=>$('#playerDock').classList.add('hidden');$('#emojiBtn').onclick=openEmoji;$('#attachBtn').onclick=()=>$('#messageFilePicker').click();
$('#chatFab').onclick=e=>{e.stopPropagation();const menu=$('#chatFabMenu'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('#chatFab').setAttribute('aria-expanded',String(open));};
$('#chatFabMenu').querySelectorAll('[data-fab-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.fabAction;$('#chatFabMenu').classList.add('hidden');$('#chatFab').setAttribute('aria-expanded','false');if(action==='attach')$('#messageFilePicker').click();else if(action==='emoji')openEmoji();else if(action==='music')openMedia()});
document.addEventListener('click',e=>{if(!e.target.closest('.m3-fab-stack')){$('#chatFabMenu').classList.add('hidden');$('#chatFab').setAttribute('aria-expanded','false')}});
$('#messageFilePicker').onchange=e=>{addMessageFiles([...e.target.files]);e.target.value=''};
let typingStopTimer=null;
$('#messageInput').addEventListener('input',()=>{
 const messageInput=$('#messageInput');
 messageInput.style.height='auto';
 messageInput.style.height=Math.min(messageInput.scrollHeight,140)+'px';
 if(!state.active)return;
 scheduleDraftSave();
 if(!state.socket?.connected)return;
 const typingChatId=state.active.id;
 state.socket.emit('typing',{chatId:typingChatId,typing:true});
 clearTimeout(typingStopTimer);
 typingStopTimer=setTimeout(()=>state.socket?.emit('typing',{chatId:typingChatId,typing:false}),1300);
});
$('#messageInput').addEventListener('keydown',e=>{
 const action=window.VGMessageKeyboard?.getMessageKeyAction(e,state.ui.sendOnEnter!==false);
 if(action==='send'){e.preventDefault();$('#sendForm').requestSubmit()}
});
$('#sendForm').onsubmit=async e=>{e.preventDefault();await sendCurrentMessage()};document.addEventListener('paste',e=>{if(!state.active)return;const items=[...(e.clipboardData?.items||[])];const images=items.filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){e.preventDefault();addMessageFiles(images)}});
$('#openNav').onclick=()=>$('#sidebar').classList.add('open');$('#closeNav').onclick=()=>$('#sidebar').classList.remove('open');$('#menuDrawer').onclick=()=>$('#navDrawer').classList.toggle('hidden');$('#navDrawer').querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{const action=b.dataset.nav;$('#navDrawer').classList.add('hidden');if(action==='profile')profileSide();else if(action==='group')createChat('group');else if(action==='channel')createChat('channel');else if(action==='music')openMedia();else if(action==='saved')openSavedMessages();else if(action==='hidden')openHiddenMessages();else if(action==='blocked')openBlockedUsers();else if(action==='settings')settings();else if(action==='dark'){state.ui.dark=!state.ui.dark;applyUI();localStorage.setItem('vg_ui',JSON.stringify(state.ui));drawProfile()}else if(action==='admin')adminPanel()});document.addEventListener('click',e=>{if(!e.target.closest('#navDrawer')&&!e.target.closest('#menuDrawer'))$('#navDrawer').classList.add('hidden')});$('#chatList').addEventListener('click',()=>$('#sidebar').classList.remove('open'));$('#folderTabs').querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{state.folder=b.dataset.folder;$('#folderTabs').querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});const list=$('#chatList');list.classList.remove('list-switch');void list.offsetWidth;list.classList.add('list-switch');renderChats()});$('#headerSearch').onclick=()=>$('#searchInput').focus();document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#searchInput').focus()}if(e.key==='Escape'){closeModal();$('#emojiPicker').classList.add('hidden')}});

function installMaterialIconFont(){
 const glyphs=[['☰','menu'],['⌕','search'],['＋','add'],['⚙','settings'],['♫','music_note'],['☾','dark_mode'],['◉','account_circle'],['♧','group_add'],['◈','campaign'],['☺','sentiment_satisfied'],['➤','send'],['▢','content_copy'],['↩','reply'],['✎','edit'],['×','close'],['▶','play_arrow'],['Ⅱ','pause'],['↶','skip_previous'],['↷','skip_next'],['☆','star'],['★','star'],['⌖','push_pin'],['➦','forward'],['🔔','notifications'],['🔕','notifications_off']];
 const scan=root=>{
  if(!root||!root.querySelectorAll)return;
  root.querySelectorAll('button').forEach(button=>{
   if(button.dataset.m3Iconized==='1')return;
   const node=[...button.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
   if(!node)return;
   const raw=node.textContent,trimmed=raw.trimStart();
   const found=glyphs.find(([glyph])=>trimmed.startsWith(glyph));
   if(!found)return;
   const icon=document.createElement('span');icon.className='material-symbols-rounded';icon.setAttribute('aria-hidden','true');icon.textContent=found[1];
   node.replaceWith(icon,document.createTextNode(raw.slice(0,raw.indexOf(trimmed))+trimmed.slice(found[0].length)));
   button.dataset.m3Iconized='1';
  });
 };
 scan(document);
 new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)scan(node)}))).observe(document.body,{childList:true,subtree:true});
}

installMaterialIconFont();
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});applyTheme(state.theme);applyUI();setWallpaper(state.wallpaper);init();
