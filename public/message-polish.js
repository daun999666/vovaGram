(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function syncMessageControls(root=document){
 $$('.message.m3-message',root).forEach((message,index)=>{
  const trigger=$('[data-menu-toggle]',message),menu=$('.message-actions',message),content=$('.message-content',message);
  if(!trigger||!menu||!content)return;
  if(!menu.id)menu.id='vg-message-actions-'+(message.dataset.messageId||message.dataset.messageid||index);
  trigger.setAttribute('aria-controls',menu.id);
  trigger.setAttribute('aria-expanded',String(message.classList.contains('is-actions-open')));
  trigger.setAttribute('aria-haspopup','menu');
  menu.setAttribute('role','menu');
  $$('button',menu).forEach(button=>{button.setAttribute('role','menuitem');if(!button.getAttribute('aria-label')&&!button.title)button.setAttribute('aria-label',button.textContent.trim()||'Действие')});
 });
}
function positionMenu(message){
 const content=$('.message-content',message),menu=$('.message-actions',message);if(!content||!menu)return;
 content.classList.remove('vg-menu-up');
 requestAnimationFrame(()=>{const r=menu.getBoundingClientRect();if(r.bottom>innerHeight-12&&r.top>r.height+12)content.classList.add('vg-menu-up');});
}
function closeMenus(restore=false){
 $$('.message.is-actions-open').forEach(message=>{message.classList.remove('is-actions-open');const b=$('[data-menu-toggle]',message);b?.setAttribute('aria-expanded','false');if(restore)b?.focus()});
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-menu-toggle]');
 if(trigger){const message=trigger.closest('.message');if(message?.classList.contains('is-actions-open'))positionMenu(message);else $('.message-content.vg-menu-up',message)?.classList.remove('vg-menu-up');return}
 const item=event.target.closest('.message-actions button');
 if(item){const message=item.closest('.message');message?.classList.remove('is-actions-open');$('[data-menu-toggle]',message)?.setAttribute('aria-expanded','false');return}
 if(!event.target.closest('.message.is-actions-open'))closeMenus(false);
});
document.addEventListener('keydown',event=>{
 const message=event.target.closest('.message.is-actions-open');if(!message)return;
 const trigger=$('[data-menu-toggle]',message),items=$$('.message-actions button:not([disabled])',message);
 if(event.key==='Escape'){event.preventDefault();closeMenus(true);return}
 if(!items.length)return;
 let i=items.indexOf(document.activeElement);
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();i=(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[i].focus()}
 if(event.key==='Home'){event.preventDefault();items[0].focus()}
 if(event.key==='End'){event.preventDefault();items[items.length-1].focus()}
 if(event.key==='Tab'&&event.shiftKey&&document.activeElement===items[0]){event.preventDefault();trigger?.focus()}
 if(event.key==='Tab'&&!event.shiftKey&&document.activeElement===items[items.length-1]){event.preventDefault();trigger?.focus()}
});
const list=$('#messages');if(list)new MutationObserver(()=>syncMessageControls(list)).observe(list,{childList:true,subtree:true});
syncMessageControls();window.addEventListener('resize',()=>$$('.message.is-actions-open').forEach(positionMenu),{passive:true});
})();
