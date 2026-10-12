// UI-only helpers, kept apart from app.js so they can be tested without a browser.
// Fullscreen is feature-detected (standard, then WebKit-prefixed); iPhone Safari offers
// neither for arbitrary elements, so callers hide their control when this returns null.
export function fullscreenSupport(doc,el) {
  if(!doc||!el)return null;
  if(doc.fullscreenEnabled===true&&typeof el.requestFullscreen==='function')return {
    request:()=>el.requestFullscreen(),exit:()=>doc.exitFullscreen(),current:()=>doc.fullscreenElement
  };
  if(doc.webkitFullscreenEnabled===true&&typeof el.webkitRequestFullscreen==='function')return {
    request:()=>el.webkitRequestFullscreen(),exit:()=>doc.webkitExitFullscreen(),current:()=>doc.webkitFullscreenElement
  };
  return null;
}
export function isFullscreen(doc,el) {
  const api=fullscreenSupport(doc,el);
  return !!api&&api.current()===el;
}
// Resolves to 'entered', 'exited', 'unsupported' or 'failed'; never rejects.
export async function toggleFullscreen(doc,el) {
  const api=fullscreenSupport(doc,el);
  if(!api)return 'unsupported';
  try{
    if(api.current()===el){await api.exit();return 'exited';}
    await api.request();return 'entered';
  }catch{return 'failed';}
}
