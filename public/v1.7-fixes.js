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
