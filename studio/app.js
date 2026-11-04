const statusKey={pending:"waiting",revision_requested:"revise",published:"published",declined:"declined"};
const topicKey={science:"science",life_skills:"life",language:"languageTopic",art_design:"art",movement_health:"movement"};
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const cfg=window.OPENFRAME_SUPABASE;
const db=cfg&&window.supabase?window.supabase.createClient(cfg.url,cfg.publishableKey):null;
let activeUser=null;let activeRole="creator";
const t=key=>window.ofText?window.ofText(key):key;
function toast(message){const el=document.querySelector(".toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)}
function statusClass(status){return status==="published"?"published":status==="revision_requested"?"revise":status==="declined"?"declined":""}
function relativeDate(value){return new Intl.DateTimeFormat(window.openFrameLanguage||"zh-Hans",{month:"long",day:"numeric"}).format(new Date(value))}
async function currentUser(){
  if(!db){toast(t("configured"));return null}
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user){location.href="/studio/login/";return null}
  return user;
}
async function currentRole(user){
  const {data,error}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
  return error||!data?.role?"creator":data.role;
}
function setAdminVisibility(role){
  document.querySelectorAll("[data-admin-only]").forEach(el=>{el.hidden=role!=="admin"});
}
async function renderStats(user){
  const {data,error}=await db.from("submissions").select("status").eq("creator_id",user.id);
  if(error){toast(t("readFail"));return}
  const rows=data||[];
  const all=document.querySelector("[data-count=all]"),waiting=document.querySelector("[data-count=waiting]"),published=document.querySelector("[data-count=published]");
  if(all)all.textContent=rows.length;
  if(waiting)waiting.textContent=rows.filter(x=>x.status==="pending").length;
  if(published)published.textContent=rows.filter(x=>x.status==="published").length;
}
async function renderList(user){
  const target=document.querySelector("#submissionList");if(!target)return;
  const {data,error}=await db.from("submissions").select("id,title,topic,age_band,status,created_at").eq("creator_id",user.id).order("created_at",{ascending:false});
  if(error){target.innerHTML='<div class="empty">'+escapeHTML(t("readFail"))+'</div>';return}
  if(!data?.length){target.innerHTML='<div class="empty">'+escapeHTML(t("empty"))+'</div>';return}
  target.innerHTML=data.map(x=>'<article class="submission"><div class="icon">▸</div><div><h3>'+escapeHTML(x.title)+'</h3><small>'+escapeHTML(t(topicKey[x.topic]||x.topic))+' · '+escapeHTML(x.age_band)+' · '+relativeDate(x.created_at)+'</small></div><span class="status '+statusClass(x.status)+'">'+escapeHTML(t(statusKey[x.status]||"waiting"))+'</span></article>').join("");
}
async function renderReviewQueue(user){
  const target=document.querySelector("#reviewList");if(!target)return;
  const {data,error}=await db.from("submissions").select("id,title,topic,age_band,summary,source_url,status,created_at").in("status",["pending","revision_requested"]).order("created_at",{ascending:true});
  if(error){target.innerHTML='<article class="review-item"><h2>'+escapeHTML(t("reviewFail"))+'</h2><p>'+escapeHTML(error.message)+'</p></article>';return}
  if(!data?.length){target.innerHTML='<article class="review-item"><h2>'+escapeHTML(t("reviewEmpty"))+'</h2></article>';return}
  target.innerHTML=data.map(x=>'<article class="review-item"><div class="eyebrow">'+escapeHTML(t(topicKey[x.topic]||x.topic))+' · '+escapeHTML(x.age_band)+'</div><h2>'+escapeHTML(x.title)+'</h2><p>'+escapeHTML(x.summary)+'</p><p><a class="source" target="_blank" rel="noopener" href="'+escapeHTML(x.source_url)+'">'+escapeHTML(t("sourceLink"))+' ↗</a></p><label>'+escapeHTML(t("reviewNote"))+'<textarea data-review-note="'+escapeHTML(x.id)+'"></textarea></label><div class="actions"><button data-review-action="published" data-review-id="'+escapeHTML(x.id)+'">'+escapeHTML(t("approve"))+'</button><button data-review-action="revision_requested" data-review-id="'+escapeHTML(x.id)+'">'+escapeHTML(t("requestRevision"))+'</button><button data-review-action="declined" data-review-id="'+escapeHTML(x.id)+'">'+escapeHTML(t("decline"))+'</button></div></article>').join("");
  target.querySelectorAll("[data-review-action]").forEach(button=>button.onclick=async()=>{
    button.disabled=true;
    const id=button.dataset.reviewId,status=button.dataset.reviewAction,note=target.querySelector('[data-review-note="'+id+'"]').value.trim();
    const {error:updateError}=await db.from("submissions").update({status,review_note:note||null,reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq("id",id);
    if(updateError){toast(t("reviewFail")+updateError.message);button.disabled=false;return}
    toast(t("reviewSaved"));await renderReviewQueue(user);
  });
}
function setFileHint(file){
  const hint=document.querySelector("#fileHint");if(!hint)return;
  hint.textContent=file?t("fileSelected")+file.name+"。"+t("fileOpen"):t("fileHint");
}
async function submitContent(user,form){
  const fd=new FormData(form),file=fd.get("video");
  if(!(file instanceof File)||!file.size){toast(t("chooseFile"));return}
  if(file.size>104857600){toast(t("uploadTooLarge"));return}
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
  const videoPath=user.id+"/"+crypto.randomUUID()+"-"+safeName;
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;button.textContent=t("uploading");
  const {error:uploadError}=await db.storage.from("videos").upload(videoPath,file,{contentType:file.type||"video/mp4",upsert:false});
  if(uploadError){button.disabled=false;button.textContent=t("submitButton");toast(t("uploadFail")+uploadError.message);return}
  const record={creator_id:user.id,title:fd.get("title"),topic:fd.get("topic"),age_band:fd.get("age"),content_language:fd.get("language"),summary:fd.get("summary"),source_url:fd.get("source"),video_path:videoPath,status:"pending"};
  const {error:insertError}=await db.from("submissions").insert(record);
  if(insertError){button.disabled=false;button.textContent=t("submitButton");toast(t("recordFail")+insertError.message);return}
  location.href="/studio/submissions/";
}
function initLogin(){
  const form=document.querySelector("#access");if(!form)return;
  const hint=document.querySelector("#authHint");
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!db){hint.textContent=t("serviceMissing");return}
    const email=new FormData(form).get("email"),button=form.querySelector("button");
    button.disabled=true;button.textContent=t("sending");
    const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:"https://openframe.run.place/studio/home/"}});
    button.disabled=false;button.textContent=t("send");
    hint.textContent=error?error.message:t("sent");
  };
}
function initLogout(){
  document.querySelectorAll("[data-signout]").forEach(button=>button.onclick=async()=>{
    if(db)await db.auth.signOut();
    location.href="/studio/login/";
  });
}
async function initStudio(){
  const needsAuth=document.querySelector("#submissionForm,#submissionList,[data-count],#reviewList");
  if(!needsAuth)return;
  const user=await currentUser();if(!user)return;
  activeUser=user;activeRole=await currentRole(user);setAdminVisibility(activeRole);
  const review=document.querySelector("#reviewList");
  if(review){
    if(activeRole!=="admin"){location.href="/studio/home/";return}
    await renderReviewQueue(user);return;
  }
  await Promise.all([renderStats(user),renderList(user)]);
  const file=document.querySelector("#video");if(file)file.onchange=e=>setFileHint(e.target.files[0]);
  const form=document.querySelector("#submissionForm");if(form)form.onsubmit=event=>{event.preventDefault();submitContent(user,form)};
}
document.addEventListener("DOMContentLoaded",async()=>{
  initLogin();initLogout();await initStudio();
});
document.addEventListener("openframe:languagechange",async()=>{
  if(!activeUser)return;
  if(document.querySelector("#reviewList")&&activeRole==="admin"){await renderReviewQueue(activeUser);return}
  await Promise.all([renderStats(activeUser),renderList(activeUser)]);
});