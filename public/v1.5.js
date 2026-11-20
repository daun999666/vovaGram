// vovchikGram 1.5.0 message context menu
(()=>{
 const pinnedKey='vg_pinned_messages';
 const readPinned=()=>{try{return JSON.parse(localStorage.getItem(pinnedKey)||'[]')}catch{return []}};
 const writePinned=ids=>localStorage.setItem(pinnedKey,JSON.stringify(ids));
 let menu=null;
 function close(){menu?.remove();menu=null}
 function action(label,run){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{close();run()};return b}
 document.addEventListener('contextmenu',e=>{
  const msg=e.target.closest('.message');if(!msg)return;
  e.preventDefault();close();
  const actions=document.createElement('div');actions.className='message-context-menu';
  const id=msg.id.replace('msg-',''), pinned=readPinned(), isPinned=pinned.includes(id);
  const click=sel=>msg.querySelector(sel)?.click();
  actions.append(
   action('Копировать',()=>click('[data-copy]')),
   action('Ответить',()=>click('[data-reply]')),
   action('Реакция',()=>click('[data-react-open]')),
   ...(msg.classList.contains('mine')?[action('Изменить',()=>click('[data-edit]')),action('Удалить',()=>click('[data-delete]'))]:[]),
   action(isPinned?'Открепить':'Закрепить у себя',()=>{
    const next=readPinned().filter(x=>x!==id);if(!isPinned)next.push(id);writePinned(next);
    msg.classList.toggle('locally-pinned',!isPinned);
    toast(isPinned?'Сообщение откреплено':'Сообщение закреплено только у тебя');
   })
  );
  document.body.append(actions);menu=actions;
  const r=actions.getBoundingClientRect();
  actions.style.left=Math.max(8,Math.min(e.clientX,innerWidth-r.width-8))+'px';
  actions.style.top=Math.max(8,Math.min(e.clientY,innerHeight-r.height-8))+'px';
 });
 document.addEventListener('click',e=>{if(!e.target.closest('.message-context-menu'))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 const observer=new MutationObserver(()=>{
  document.querySelectorAll('.message[id]').forEach(m=>m.classList.toggle('locally-pinned',readPinned().includes(m.id.replace('msg-',''))));
 });
 observer.observe(document.querySelector('#messages')||document.body,{childList:true,subtree:true});
})();
