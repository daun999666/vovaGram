const $=s=>document.querySelector(s);
const state={token:localStorage.getItem('vg_token'),user:null,chats:[],active:null,socket:null,theme:localStorage.getItem('vg_theme')||'blue',folder:'all',replyTo:null,ui:JSON.parse(localStorage.getItem('vg_ui')||'{}'),wallpaper:localStorage.getItem('vg_wallpaper')||'expressive',songs:[],currentSong:null,pendingImage:null,messageHasMore:false,loadingOlder:false,pins:[],onlineUsers:new Set(),typingTimer:null};
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
  if(state.folder==='favorites')return starred;
  return c.type===state.folder;
 });
 list.innerHTML=chats.map(c=>{
  const online=c.type==='direct'&&state.onlineUsers.has(Number(c.peer_user_id));
  const unread=Number(c.unread_count||0);
  return '<button class="chat-item '+(state.active?.id===c.id?'active':'')+'" data-id="'+c.id+'">'+
   avatar(c.avatar,c.title,'chat-avatar')+
   '<span class="chat-meta"><b>'+esc(c.title)+' '+(c.type==='channel'?'<span class="tiny-verified">◉</span>':'')+(Number(c.is_starred)?'<span class="chat-favorite-mark">★</span>':'')+'</b>'+
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
  const d=await api(`/api/chats/${id}/messages?limit=50`);
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
 const react=Object.entries(reactions).filter(([,ids])=>Array.isArray(ids)&&ids.length).map(([emo,ids])=>'<button class="reaction" data-react="'+esc(emo)+'">'+esc(emo)+' '+ids.length+'</button>').join('');
 let attachments=[];try{attachments=JSON.parse(m.attachments||'[]')}catch{}
 const media=attachments.map(a=>'<a class="message-image-link" href="'+esc(a.url)+'" target="_blank" rel="noopener"><img class="message-image" src="'+esc(a.url)+'" alt="'+esc(a.name||'Изображение')+'" loading="lazy"></a>').join('');
 const date=m.created_at?new Date(String(m.created_at).replace(' ','T')+'Z'):new Date();
 const time=Number.isNaN(date.getTime())?'':date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const el=document.createElement('article');
 el.id='msg-'+m.id;el.dataset.messageId=String(m.id);el.dataset.sender=m.username||'';el.className='message m3-message'+(mine?' mine':'');
 el.innerHTML='<div class="message-avatar">'+avatar(senderAvatar,senderName,'sender-avatar')+'</div>'+
  '<div class="message-content">'+forwardHeader+'<div class="sender"><b>'+esc(senderName)+'</b> '+badge(mine?state.user:m)+'</div>'+
  reply+(m.body?'<p>'+esc(m.body)+'</p>':'')+media+
  '<div class="message-foot"><time>'+time+(m.edited_at?' · изм.':'')+'</time>'+
  (mine?'<span class="message-read" title="'+(Number(m.read_by_count)>0?'Прочитано':'Отправлено')+'">'+m3Icon(Number(m.read_by_count)>0?'done_all':'done')+'</span>':'')+
  forwardCount+'<span class="message-actions">'+
  '<button data-copy title="Копировать" aria-label="Копировать">'+m3Icon('content_copy')+'</button>'+
  '<button data-reply title="Ответить" aria-label="Ответить">'+m3Icon('reply')+'</button>'+
  '<button data-save title="В Избранное" aria-label="В Избранное">'+m3Icon('bookmark_add')+'</button>'+
  '<button data-forward title="Переслать" aria-label="Переслать">'+m3Icon('forward')+'</button>'+
  (m.edited_at?'<button data-history title="История изменений" aria-label="История изменений">'+m3Icon('history')+'</button>':'')+
  ((state.active?.type==='direct'||['owner','admin'].includes(state.active?.my_role)||['owner','dev'].includes(state.user?.role))?'<button data-pin data-pinned="'+(m.is_pinned?'true':'false')+'" title="'+(m.is_pinned?'Открепить':'Закрепить')+'" aria-label="Закрепить сообщение">'+m3Icon('push_pin')+'</button>':'')+
  '<button data-react-open title="Реакция" aria-label="Реакция">'+m3Icon('add_reaction')+'</button>'+
  (mine?'<button data-edit title="Изменить" aria-label="Изменить">'+m3Icon('edit')+'</button><button data-delete title="Удалить" aria-label="Удалить">'+m3Icon('delete')+'</button>':'')+
  '</span></div><div class="reactions">'+react+'</div></div>';
 el.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(m.body||'Изображение');toast('Скопировано')}catch{toast('Браузер запретил копирование')}};
 el.querySelector('[data-reply]').onclick=()=>setReply(m);
 el.querySelector('[data-save]').onclick=()=>saveMessage(m);
 el.querySelector('[data-forward]').onclick=()=>forwardMessage(m);
 el.querySelector('[data-history]')?.addEventListener('click',()=>openMessageHistory(m));
 el.querySelector('[data-pin]').onclick=()=>togglePinMessage(m);
 el.querySelector('[data-react-open]').onclick=()=>quickReact(m);
 el.querySelector('[data-edit]')?.addEventListener('click',()=>editMessage(m));
 el.querySelector('[data-delete]')?.addEventListener('click',()=>deleteMessage(m));
 el.querySelectorAll('[data-react]').forEach(b=>b.onclick=()=>reactMessage(m.id,b.dataset.react));
 if(prepend){const first=$('#messages').querySelector('.message');if(first)$('#messages').insertBefore(el,first);else $('#messages').append(el)}else{$('#messages').append(el);$('#messages').scrollTop=$('#messages').scrollHeight;}
}
function setReply(m){state.replyTo=m.id;$('#replyBar').innerHTML=`<span>Ответ на <b>@${esc(m.username)}</b>: ${esc(m.body.slice(0,90))}</span><button id="cancelReply">×</button>`;$('#replyBar').classList.remove('hidden');$('#cancelReply').onclick=()=>{state.replyTo=null;$('#replyBar').classList.add('hidden')};$('#messageInput').focus()}
async function editMessage(m){const text=prompt('Изменить сообщение:',m.body);if(text===null||!text.trim())return;try{await api('/api/messages/'+m.id,{method:'PATCH',body:JSON.stringify({body:text})})}catch(e){toast(e.message)}}
async function deleteMessage(m){if(!confirm('Удалить сообщение?'))return;try{await api('/api/messages/'+m.id,{method:'DELETE'})}catch(e){toast(e.message)}}
async function reactMessage(id,emoji){try{await api('/api/messages/'+id+'/reaction',{method:'POST',body:JSON.stringify({emoji})})}catch(e){toast(e.message)}}
function quickReact(m){const options=['👍','❤️','😂','🔥','😮','👏','😢'];const v=prompt('Выбери реакцию:\n'+options.join(' '),'👍');if(v&&[...options,'🎉','😍','💯'].includes(v.trim()))reactMessage(m.id,v.trim())}
async function createChat(defaultType='group'){
 const m=modal('Создать пространство','Новая группа или публичный канал',`<form id="createForm"><label class="field"><span>Название</span><input name="title" maxlength="60" required placeholder="Например, Друзья"></label><label class="field"><span>Описание</span><textarea name="description" maxlength="250" placeholder="О чём это пространство?"></textarea></label><label class="field"><span>Тип пространства</span><select name="type"><option value="group" ${defaultType==='group'?'selected':''}>Групповой чат</option><option value="channel" ${defaultType==='channel'?'selected':''}>Канал</option></select></label><label class="field"><span>Участники через запятую (необязательно)</span><input name="members" placeholder="user1, user2"></label></form>`,'<button class="soft-btn" data-close>Отмена</button><button class="filled" id="createSubmit">Создать</button>');
 $('#createSubmit').onclick=async()=>{const d=Object.fromEntries(new FormData($('#createForm')));d.members=d.members.split(',').map(x=>x.trim().replace(/^@/,'')).filter(Boolean);try{const r=await api('/api/chats',{method:'POST',body:JSON.stringify(d)});closeModal();await loadChats();openChat(r.chat.id)}catch(e){toast(e.message)}};
}
async function findUser(name){try{const r=await api('/api/users/'+encodeURIComponent(name.replace(/^@/,'')));const u=r.user;const m=modal('Профиль пользователя',`@${esc(u.username)}`,`<div class="public-profile">${avatar(u.avatar,u.displayName,'public-avatar')}<h3>${esc(u.displayName)} ${badge(u)}</h3><p>@${esc(u.username)} · ${esc(u.number||'')}</p><p>${esc(u.bio||'Описание не добавлено')}</p></div>`,'<button class="soft-btn" data-close>Закрыть</button><button class="filled" id="startDM">Написать</button>');$('#startDM').onclick=async()=>{try{const x=await api('/api/dm',{method:'POST',body:JSON.stringify({username:u.username})});closeModal();await loadChats();openChat(x.chat.id)}catch(e){toast(e.message)}}}catch(e){toast(e.message)}}
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
  const max=kind==='audio'?15*1024*1024:5*1024*1024;
  if(file.size>max)return reject(Error(kind==='audio'?'Максимум 15 МБ':'Максимум 5 МБ'));
  const reader=new FileReader();
  reader.onprogress=e=>{if(e.lengthComputable)setTransferProgress(e.loaded/e.total*18,'Подготовка '+file.name)};
  reader.onload=()=>{
   const xhr=new XMLHttpRequest();xhr.open('POST','/api/upload');
   xhr.setRequestHeader('Content-Type','application/json');
   if(state.token)xhr.setRequestHeader('Authorization','Bearer '+state.token);
   xhr.upload.onprogress=e=>{if(e.lengthComputable)setTransferProgress(18+(e.loaded/e.total*82),'Отправка '+file.name)};
   xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||'{}')}catch{}
    if(xhr.status>=200&&xhr.status<300)resolve(data);
    else reject(Error(data.error||('Ошибка загрузки '+xhr.status)));
   };
   xhr.onerror=()=>reject(Error('Сетевая ошибка при загрузке файла'));
   xhr.onabort=()=>reject(Error('Загрузка отменена'));
   xhr.send(JSON.stringify({kind,data:reader.result}));
  };
  reader.onerror=()=>reject(Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
 });
}
let pendingMessageFiles=[];
function renderAttachmentPreview(){const box=$('#attachmentPreview');if(!box)return;box.innerHTML=pendingMessageFiles.map((f,i)=>`<div class="attachment-chip"><img src="${URL.createObjectURL(f)}" alt=""><span>${esc(f.name)}</span><button type="button" data-remove-attachment="${i}" aria-label="Убрать">×</button></div>`).join('');box.classList.toggle('hidden',!pendingMessageFiles.length);box.querySelectorAll('[data-remove-attachment]').forEach(b=>b.onclick=()=>{pendingMessageFiles.splice(+b.dataset.removeAttachment,1);renderAttachmentPreview()})}
function addMessageFiles(files){for(const f of files){if(!f.type.startsWith('image/')){toast('Пока можно прикреплять изображения');continue}if(f.size>5*1024*1024){toast('Изображение должно быть до 5 МБ');continue}if(pendingMessageFiles.length>=4){toast('Максимум 4 изображения в одном сообщении');break}pendingMessageFiles.push(f)}renderAttachmentPreview()}
async function sendCurrentMessage(){if(!state.active)return;const input=$('#messageInput'),body=input.value.trim();if(!body&&!pendingMessageFiles.length)return;const send=$('.send-btn');send.disabled=true;try{const attachments=[];for(const file of pendingMessageFiles){setTransferProgress(0,'Загрузка '+file.name);const up=await uploadFile(file,'image');attachments.push({url:up.url,mime:file.type,name:file.name})}const d=await api(`/api/chats/${state.active.id}/messages`,{method:'POST',body:JSON.stringify({body,replyTo:state.replyTo,attachments})});if(!state.socket?.connected)addMessage(d.message);input.value='';pendingMessageFiles=[];renderAttachmentPreview();hideTransferProgress();state.replyTo=null;$('#replyBar').classList.add('hidden');loadChats()}catch(err){hideTransferProgress();toast(err.message)}finally{send.disabled=false}}
function openEmoji(){const box=$('#emojiPicker');box.classList.toggle('hidden');box.innerHTML=`<input id="emojiSearch" placeholder="Найти эмодзи"><div class="emoji-tabs">${Object.keys(emojiGroups).map((x,i)=>`<button data-group="${x}" class="${i===0?'active':''}">${x}</button>`).join('')}</div><div class="emoji-grid" id="emojiGrid"></div>`;function draw(group='Часто',query=''){const all=Object.values(emojiGroups).join(' ').split(/\s+/).filter(x=>x);const list=query?all.filter(x=>x.includes(query)):emojiGroups[group].split(' ');$('#emojiGrid').innerHTML=[...new Set(list)].map(x=>`<button>${x}</button>`).join('');$('#emojiGrid').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#messageInput').value+=$('#messageInput').value?' '+b.textContent:b.textContent;$('#messageInput').focus();box.classList.add('hidden')})}draw();box.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{box.querySelectorAll('[data-group]').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(b.dataset.group)});$('#emojiSearch').oninput=e=>draw('Часто',e.target.value.trim())}
async function chatDetails(c){
 const canEdit=['owner','admin'].includes(c.my_role)||['owner','dev'].includes(state.user.role);
 const canDelete=true;
 const canManageDelete=c.owner_id===state.user.id||c.my_role==='owner'||state.user.role==='owner';
 const deleteDescription=c.type==='direct'?'Диалог будет скрыт из твоего списка.':canManageDelete?`Удаление ${c.type==='channel'?'канала':'группы'} необратимо: будут удалены сообщения и участники.`:`Ты покинешь ${c.type==='channel'?'канал':'группу'}; у остальных участников он останется.`;
 const formHtml=`<div class="chat-info-head">${avatar(c.avatar,c.title,'public-avatar')}<div><b>${esc(c.title)}</b><small>${esc(c.description||'')}</small></div></div>${canEdit?`<label class="field"><span>Название</span><input id="chatName" value="${esc(c.title)}"></label><label class="field"><span>Описание</span><textarea id="chatDesc">${esc(c.description||'')}</textarea></label><label class="field"><span>Аватар чата</span><input id="chatAvatarFile" type="file" accept="image/*"></label><label class="field"><span>Обои</span><select id="chatWallpaper"><option value="shapes">Мягкие формы</option><option value="m3forms">Капсулы</option><option value="waves">Дуги</option><option value="dots">Точки</option><option value="plain">Без узора</option><option value="__custom">Своя картинка…</option></select></label><label class="field"><span>Свои обои</span><input id="chatWallpaperFile" type="file" accept="image/png,image/jpeg,image/webp"></label>`:''}<p class="muted">Тип: ${c.type==='channel'?'канал':c.type==='group'?'группа':'личный диалог'}</p>${canDelete?`<p class="muted">${deleteDescription}</p>`:''}`;
 const actions='<button class="soft-btn" data-close>Закрыть</button>'+(canEdit?'<button class="filled" id="saveChat">Сохранить</button>':'')+(canDelete?'<button class="danger" id="deleteChannel">'+(c.type==='direct'?'Убрать диалог':canManageDelete?'Удалить пространство':c.type==='channel'?'Покинуть канал':'Покинуть группу')+'</button>':'');
 const preferenceHtml='<div class="chat-preference-actions"><h3>Быстрые настройки</h3>'+
  '<button class="soft-btn" id="toggleChatFavorite"><span class="material-symbols-rounded">'+(Number(c.is_starred)?'star':'star_outline')+'</span>'+(Number(c.is_starred)?'Убрать из избранного':'Добавить в избранное')+'</button>'+
  '<button class="soft-btn" id="toggleChatArchive"><span class="material-symbols-rounded">'+(Number(c.is_archived)?'unarchive':'archive')+'</span>'+(Number(c.is_archived)?'Вернуть из архива':'Переместить в архив')+'</button></div>';
 modal('Информация о чате','Параметры пространства',formHtml+preferenceHtml,actions);
 const updatePreference=async(field,value)=>{
  try{
   await api('/api/chats/'+c.id+'/preferences',{method:'PATCH',body:JSON.stringify({[field]:value})});
   await loadChats();
   if(state.active?.id===c.id)state.active=state.chats.find(x=>x.id===c.id)||state.active;
   closeModal();
   toast(field==='starred'?(value?'Добавлено в избранное':'Убрано из избранного'):(value?'Перемещено в архив':'Возвращено из архива'));
  }catch(e){toast(e.message)}
 };
 $('#toggleChatFavorite').onclick=()=>updatePreference('starred',!Number(c.is_starred));
 $('#toggleChatArchive').onclick=()=>updatePreference('archived',!Number(c.is_archived));
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
 <label class="toggle"><input id="darkMode" type="checkbox" ${state.ui.dark?'checked':''}> Тёмная тема</label></div>
 <div class="settings-section"><h3>Профиль</h3><div class="profile-edit-head">${avatar(state.user.avatar,state.user.displayName,'edit-avatar')}<label class="soft-btn upload-label">Изменить фото<input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>
 <label class="field"><span>Имя</span><input id="pName" value="${esc(state.user.displayName)}" maxlength="40"></label><label class="field"><span>Описание</span><textarea id="pBio" maxlength="160">${esc(state.user.bio||'')}</textarea></label>
 <div class="profile-number-card"><small>Твой номер vovchikGram</small><b>${esc(state.user.number||'—')}</b><span>${state.user.verified?'✓ Подтверждённый аккаунт':'Идентификатор аккаунта'}</span></div>
 <label class="field"><span>Цвет обложки</span><div class="cover-colors">${['#526da8','#39765c','#72599d','#a45370','#946039','#555963'].map(c=>`<button data-cover="${c}" style="background:${c}"></button>`).join('')}</div></label><label class="field"><span>Цвет обложки профиля</span><input id="pBg" type="color" value="${/^#[0-9a-f]{6}$/i.test(state.user.profileBg||'')?state.user.profileBg:'#526da8'}"></label><button id="saveProfile" class="filled">Сохранить профиль</button></div>
 <div class="settings-section"><h3>Юзернеймы · ${state.usernames?.length||0}/5</h3><div id="namesList">${(state.usernames||[]).map(n=>`<div class="name-row">@${esc(n)}<button class="danger" data-remove="${esc(n)}">Удалить</button></div>`).join('')}</div><div class="inline-input"><input id="newUsername" minlength="3" maxlength="24" placeholder="dev или my_username"><button id="addUsername" class="soft-btn">＋ Добавить</button></div></div>
 <div class="settings-section"><h3>Обои чатов</h3><div class="wallpaper-options wallpaper-options-wide">${wallpaperOptions.map(([v,t])=>`<button data-wall="${v}" class="wall-sample ${v} ${(state.wallpaper===v||(state.wallpaper==='pattern'&&v==='shapes'))?'selected':''}">${t}</button>`).join('')}</div><button class="soft-btn" id="uploadWallpaper">Загрузить свои обои</button></div>
 <div class="settings-section"><h3>Музыка</h3><p class="muted">Личная медиатека с таймкодами, перемоткой и скоростью воспроизведения.</p><button class="soft-btn" id="openMediaFromSettings">Открыть медиаплеер и редактор</button><div id="songList" class="song-list"></div></div>
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
 $('#saveProfile').onclick=async()=>{try{let avatarUrl=state.user.avatar||'';const f=$('#avatarFile').files[0];if(f)avatarUrl=(await uploadFile(f,'image')).url;const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify({displayName:$('#pName').value,bio:$('#pBio').value,profileBg:$('#pBg').value,avatar:avatarUrl,theme:state.theme})});state.user=d.user;drawProfile();toast('Профиль сохранён')}catch(e){toast(e.message)}};
 $('#addUsername').onclick=async()=>{try{await api('/api/usernames',{method:'POST',body:JSON.stringify({username:$('#newUsername').value})});toast('Юзернейм добавлен');closeModal();await refreshMe();settings()}catch(e){toast(e.message)}};
 m.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{await api('/api/usernames/'+encodeURIComponent(b.dataset.remove),{method:'DELETE'});closeModal();await refreshMe();settings()}catch(e){toast(e.message)}});
 $('#uploadWallpaper').onclick=()=>{const f=$('#imagePicker');f.onchange=async()=>{if(!f.files[0])return;try{const r=await uploadFile(f.files[0],'image');state.wallpaper=r.url;localStorage.setItem('vg_wallpaper',r.url);setWallpaper(state.wallpaper);toast('Обои загружены')}catch(e){toast(e.message)}};f.click()};
 $('#openMediaFromSettings').onclick=()=>openMedia();loadSongs();$('#claimOwner')?.addEventListener('click',async()=>{const key=$('#ownerBootstrapPassword').value;try{const d=await api('/api/claim-owner',{method:'POST',body:JSON.stringify({bootstrapPassword:key})});state.user=d.user;state.needsOwnerSetup=false;drawProfile();closeModal();toast('Права владельца активированы · +888000888');settings()}catch(e){toast(e.message)}});$('#adminOpen')?.addEventListener('click',()=>{closeModal();adminPanel()});
 $('#logout').onclick=()=>{localStorage.removeItem('vg_token');state.token=null;state.user=null;state.socket?.disconnect();closeModal();showAuth()};
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
function initSocket(){
 state.socket?.disconnect();state.socket=io({auth:{token:state.token}});
 state.socket.on('presence-snapshot',d=>{state.onlineUsers=new Set((d.userIds||[]).map(Number));renderChats()});
 state.socket.on('presence-update',d=>{if(d.online)state.onlineUsers.add(Number(d.userId));else state.onlineUsers.delete(Number(d.userId));renderChats()});
 state.socket.on('message',m=>{if(state.active?.id===m.chat_id){addMessage(m);markChatRead(m.chat_id)}loadChats()});
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
async function init(){try{await materialProgressReady;if(!state.token){showAuth();return}await refreshMe();applyTheme(state.user.theme||state.theme);applyUI();await loadChats();initSocket()}catch(e){localStorage.removeItem('vg_token');state.token=null;state.user=null;showAuth()}}
$('#newChat').onclick=()=>{closeSpaceMenu();createChat('group')};
$('#newChatMenu').onclick=e=>{e.stopPropagation();const menu=$('#newChatMenuItems'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('#newChatMenu').setAttribute('aria-expanded',String(open));};
function closeSpaceMenu(){const menu=$('#newChatMenuItems');if(menu)menu.classList.add('hidden');$('#newChatMenu')?.setAttribute('aria-expanded','false')}
$('#newChatMenuItems').querySelectorAll('[data-create-space]').forEach(b=>b.onclick=()=>{const kind=b.dataset.createSpace;closeSpaceMenu();createChat(kind)});
document.addEventListener('click',e=>{if(!e.target.closest('.m3-split-button'))closeSpaceMenu()});
$('#loadMoreMessages').onclick=loadOlderMessages;
$('#welcomeCreate').onclick=createChat;$('#settingsBtn').onclick=settings;$('#drawerProfile').onclick=()=>state.user?profileSide():showAuth();$('#profileBtn').onclick=()=>state.user?profileSide():showAuth();$('#accountBtn').onclick=()=>state.user?settings():showAuth();$('#menuPlayer').onclick=openMedia;$('#playerBtn').onclick=()=>$('#playerDock').classList.toggle('hidden');$('#closePlayer').onclick=()=>$('#playerDock').classList.add('hidden');$('#emojiBtn').onclick=openEmoji;$('#attachBtn').onclick=()=>$('#messageFilePicker').click();
$('#chatFab').onclick=e=>{e.stopPropagation();const menu=$('#chatFabMenu'),open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);$('#chatFab').setAttribute('aria-expanded',String(open));};
$('#chatFabMenu').querySelectorAll('[data-fab-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.fabAction;$('#chatFabMenu').classList.add('hidden');$('#chatFab').setAttribute('aria-expanded','false');if(action==='attach')$('#messageFilePicker').click();else if(action==='emoji')openEmoji();else if(action==='music')openMedia()});
document.addEventListener('click',e=>{if(!e.target.closest('.m3-fab-stack')){$('#chatFabMenu').classList.add('hidden');$('#chatFab').setAttribute('aria-expanded','false')}});
$('#messageFilePicker').onchange=e=>{addMessageFiles([...e.target.files]);e.target.value=''};
let typingStopTimer=null;
$('#messageInput').addEventListener('input',()=>{
 if(!state.active||!state.socket?.connected)return;
 const typingChatId=state.active.id;
 state.socket.emit('typing',{chatId:typingChatId,typing:true});
 clearTimeout(typingStopTimer);
 typingStopTimer=setTimeout(()=>state.socket?.emit('typing',{chatId:typingChatId,typing:false}),1300);
});$('#sendForm').onsubmit=async e=>{e.preventDefault();await sendCurrentMessage()};document.addEventListener('paste',e=>{if(!state.active)return;const items=[...(e.clipboardData?.items||[])];const images=items.filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){e.preventDefault();addMessageFiles(images)}});
$('#openNav').onclick=()=>$('#sidebar').classList.add('open');$('#closeNav').onclick=()=>$('#sidebar').classList.remove('open');$('#menuDrawer').onclick=()=>$('#navDrawer').classList.toggle('hidden');$('#navDrawer').querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{const action=b.dataset.nav;$('#navDrawer').classList.add('hidden');if(action==='profile')profileSide();else if(action==='group')createChat('group');else if(action==='channel')createChat('channel');else if(action==='music')openMedia();else if(action==='saved')openSavedMessages();else if(action==='settings')settings();else if(action==='dark'){state.ui.dark=!state.ui.dark;applyUI();localStorage.setItem('vg_ui',JSON.stringify(state.ui));drawProfile()}else if(action==='admin')adminPanel()});document.addEventListener('click',e=>{if(!e.target.closest('#navDrawer')&&!e.target.closest('#menuDrawer'))$('#navDrawer').classList.add('hidden')});$('#chatList').addEventListener('click',()=>$('#sidebar').classList.remove('open'));$('#folderTabs').querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{state.folder=b.dataset.folder;$('#folderTabs').querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});const list=$('#chatList');list.classList.remove('list-switch');void list.offsetWidth;list.classList.add('list-switch');renderChats()});$('#headerSearch').onclick=()=>$('#searchInput').focus();document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#searchInput').focus()}if(e.key==='Escape'){closeModal();$('#emojiPicker').classList.add('hidden')}});

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
