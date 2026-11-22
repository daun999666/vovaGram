/* v1.7.0 compatibility and Material 3 icon helpers */
(()=>{
 'use strict';
 const root=document.documentElement;
 // Keep custom font preferences applied to the workspace panel and dynamically-created controls.
 const applyFont=()=>{
   const saved=(()=>{try{return JSON.parse(localStorage.getItem('vg_ui')||'{}')}catch{return {}}})();
   const family=String(saved.customFont||'').replace(/[^a-zA-Z0-9 _-]/g,'').trim();
   if(family) root.style.setProperty('--font-family','"'+family+'",system-ui,"Segoe UI",sans-serif');
   document.querySelectorAll('#vg16-panel,.vg16-menu,.modal,.profile-side,.media-panel').forEach(el=>el.style.fontFamily='var(--font-family)');
 };
 applyFont();
 const patchStyle=document.createElement('style');
 patchStyle.textContent=`
 #app.vg16-panel-open{grid-template-columns:minmax(248px,300px) minmax(0,1fr) 340px!important}
 #vg16-panel{font-family:var(--font-family)!important;min-width:0!important;max-width:min(360px,38vw)!important}
 #vg16-panel *{font-family:var(--font-family)!important;box-sizing:border-box}
 .messages{padding:16px clamp(12px,2vw,28px)!important;align-items:stretch!important}
 .messages>.message.vg-left-message,.messages>.message.vg-left-message.mine{display:flex!important;flex-direction:row!important;align-self:flex-start!important;align-items:flex-end!important;justify-content:flex-start!important;gap:8px!important;width:fit-content!important;max-width:min(78%,760px)!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:var(--text)!important}
 .vg-message-avatar{width:34px!important;height:34px!important;flex:0 0 34px!important;align-self:flex-end!important}
 .vg-message-avatar .sender-avatar{width:34px!important;height:34px!important;border-radius:50%!important;object-fit:cover!important}
 .vg-message-content{min-width:0!important;max-width:100%!important;padding:10px 13px!important;border-radius:18px 18px 18px 5px!important;background:var(--bubble)!important;color:var(--text)!important;overflow-wrap:anywhere!important}
 .message.mine .vg-message-content{background:var(--bubble)!important;color:var(--text)!important;border-radius:18px 18px 5px 18px!important}
 .vg-message-content p{white-space:pre-wrap!important;overflow-wrap:anywhere!important;line-height:1.45!important}
 .modal-content{max-height:min(72dvh,720px)!important;overflow:auto!important}
 @media(max-width:900px){#app.vg16-panel-open{grid-template-columns:minmax(0,1fr)!important}#vg16-panel{position:fixed!important;right:0!important;top:72px!important;bottom:0!important;width:min(92vw,360px)!important;max-width:92vw!important}.messages>.message.vg-left-message,.messages>.message.vg-left-message.mine{max-width:92%!important}}
 @media(max-width:560px){.messages{padding:12px 8px!important}.vg-message-avatar,.vg-message-avatar .sender-avatar{width:28px!important;height:28px!important;flex-basis:28px!important}.messages>.message.vg-left-message,.messages>.message.vg-left-message.mine{max-width:96%!important}}
 `;
 document.head.append(patchStyle);

 new MutationObserver(applyFont).observe(document.body,{childList:true,subtree:true});
 // M3 symbol names map to Material Symbols Rounded; graceful text fallback if the font is unavailable.
 window.vgIcon=(name,fallback='•')=>{
   const known={menu:'menu',search:'search',settings:'settings',add:'add',send:'send',attach_file:'attach_file',emoji_emotions:'sentiment_satisfied',more_vert:'more_vert',close:'close',arrow_back:'arrow_back',edit:'edit',delete:'delete',push_pin:'push_pin',bookmark:'bookmark',reply:'reply',forward:'forward',content_copy:'content_copy',image:'image',music_note:'music_note',person:'person',group:'group',campaign:'campaign',notifications:'notifications',done:'done',check:'check',dark_mode:'dark_mode',palette:'palette',font_download:'font_download',wallpaper:'wallpaper'};
   const symbol=known[name];return symbol?'<span class="vg-m3-icon" aria-hidden="true">'+symbol+'</span>':fallback;
 };
 // Correct the scroll container after channel tabs/settings panes change their content dimensions.
 const normalize=()=>{
   document.querySelectorAll('.messages,.chat-list,.modal-content,.media-song-list,#vg16-panel').forEach(el=>{
     el.style.minWidth='0';el.style.overscrollBehavior='contain';
   });
 };
 new MutationObserver(normalize).observe(document.body,{childList:true,subtree:true});
 normalize();
})();
