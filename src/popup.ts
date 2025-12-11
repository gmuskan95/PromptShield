declare const chrome: any;

const SETTINGS_KEY = 'promptshield_settings_v1';
document.addEventListener('DOMContentLoaded', ()=>{
  const detectNames = document.getElementById('detect-names') as HTMLInputElement;
  const style = document.getElementById('style') as HTMLSelectElement;
  const autoPreview = document.getElementById('auto-preview') as HTMLInputElement;
  const save = document.getElementById('save') as HTMLButtonElement;

  if(chrome && chrome.storage && chrome.storage.local){
    chrome.storage.local.get([SETTINGS_KEY], (items: any)=>{
      const s = items[SETTINGS_KEY] || {detectNames:false, style:'generic', autoPreview:true};
      detectNames.checked = !!s.detectNames;
      style.value = s.style || 'generic';
      autoPreview.checked = s.autoPreview !== false;
    });
  }

  save.addEventListener('click', ()=>{
    const s = {detectNames: detectNames.checked, style: style.value, autoPreview: autoPreview.checked};
    const obj: any = {};
    obj[SETTINGS_KEY] = s;
    chrome.storage.local.set(obj, ()=>{ window.close(); });
  });
});

export {};
