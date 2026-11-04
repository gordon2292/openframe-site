(()=>{
  const storageKey="openframe-language";
  const choices=["zh-Hans","zh-Hant","en"];
  function initialLanguage(){
    const saved=localStorage.getItem(storageKey);
    if(choices.includes(saved))return saved;
    const system=(navigator.language||"").toLowerCase();
    if(system.startsWith("zh"))return /hk|tw|mo|hant/.test(system)?"zh-Hant":"zh-Hans";
    return system.startsWith("en")?"en":"zh-Hans";
  }
  function text(key,lang=window.openFrameLanguage||initialLanguage()){
    return (window.PAGE_I18N?.[lang]||window.PAGE_I18N?.["zh-Hans"]||{})[key]||key;
  }
  function apply(lang){
    if(!choices.includes(lang))lang="zh-Hans";
    window.openFrameLanguage=lang;localStorage.setItem(storageKey,lang);
    document.documentElement.lang=lang;
    document.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=text(el.dataset.i18n,lang));
    document.querySelectorAll("[data-i18n-html]").forEach(el=>el.innerHTML=text(el.dataset.i18nHtml,lang));
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>el.placeholder=text(el.dataset.i18nPlaceholder,lang));
    document.querySelectorAll("[data-title]").forEach(el=>document.title=text(el.dataset.title,lang));
    document.querySelectorAll("[data-lang]").forEach(el=>{
      el.classList.toggle("active",el.dataset.lang===lang);
      el.setAttribute("aria-pressed",el.dataset.lang===lang?"true":"false");
    });
    document.dispatchEvent(new CustomEvent("openframe:languagechange",{detail:{lang}}));
  }
  window.ofText=text;window.ofSetLanguage=apply;
  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll("[data-lang]").forEach(button=>button.addEventListener("click",()=>apply(button.dataset.lang)));
    apply(initialLanguage());
  });
})();