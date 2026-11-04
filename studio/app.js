const statusText={pending:"等待审核",revision_requested:"需要修改",published:"已发布",declined:"不予发布"};
const topicText={science:"科学与自然",life_skills:"生活技能",language:"语言",art_design:"艺术与设计",movement_health:"运动与健康"};
const topicValue={"科学与自然":"science","生活技能":"life_skills","语言":"language","艺术与设计":"art_design","运动与健康":"movement_health"};
const ageValue={"10–12 岁":"10-12","13–15 岁":"13-15","16–18 岁":"16-18"};
const languageValue={简体中文:"zh-Hans",繁体中文:"zh-Hant",英文:"en",中英双语:"bilingual"};
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const cfg=window.OPENFRAME_SUPABASE;
const db=cfg&&window.supabase?window.supabase.createClient(cfg.url,cfg.publishableKey):null;
function toast(message){const el=document.querySelector(".toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3000)}
function statusClass(status){return status==="published"?"published":status==="revision_requested"?"revise":status==="declined"?"declined":""}
function relativeDate(value){return new Intl.DateTimeFormat("zh-Hans",{month:"long",day:"numeric"}).format(new Date(value))}
async function currentUser(){
  if(!db)throw new Error("Studio 尚未完成服务配置。");
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user){location.href="/studio/login/";return null}
  return user;
}
async function renderStats(user){
  const {data,error}=await db.from("submissions").select("status").eq("creator_id",user.id);
  if(error){toast("无法读取投稿："+error.message);return}
  const rows=data||[];
  const all=document.querySelector("[data-count=all]"),waiting=document.querySelector("[data-count=waiting]"),published=document.querySelector("[data-count=published]");
  if(all)all.textContent=rows.length;
  if(waiting)waiting.textContent=rows.filter(x=>x.status==="pending").length;
  if(published)published.textContent=rows.filter(x=>x.status==="published").length;
}
async function renderList(user){
  const target=document.querySelector("#submissionList");if(!target)return;
  const {data,error}=await db.from("submissions").select("id,title,topic,age_band,status,created_at").eq("creator_id",user.id).order("created_at",{ascending:false});
  if(error){target.innerHTML='<div class="empty">无法读取提交记录。请稍后再试。</div>';return}
  if(!data?.length){target.innerHTML='<div class="empty">还没有提交内容。第一条内容会在这里显示审核状态。</div>';return}
  target.innerHTML=data.map(x=>'<article class="submission"><div class="icon">▸</div><div><h3>'+escapeHTML(x.title)+'</h3><small>'+escapeHTML(topicText[x.topic]||x.topic)+' · '+escapeHTML(x.age_band)+' 岁 · '+relativeDate(x.created_at)+'</small></div><span class="status '+statusClass(x.status)+'">'+statusText[x.status]+'</span></article>').join("");
}
function setFileHint(file){
  const hint=document.querySelector("#fileHint");if(!hint)return;
  hint.textContent=file?'已选择：'+file.name+'。上传中请保持此页面开启。':'建议：MP4、720p、60 秒以内。';
}
async function submitContent(user,form){
  const fd=new FormData(form),file=fd.get("video");
  if(!(file instanceof File)||!file.size){toast("请选择 MP4 或 WebM 视频。");return}
  if(file.size>104857600){toast("视频超过 100 MB，暂时无法上传。");return}
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
  const videoPath=user.id+"/"+crypto.randomUUID()+"-"+safeName;
  const submitButton=form.querySelector('button[type="submit"]');
  submitButton.disabled=true;submitButton.textContent="正在上传…";
  const {error:uploadError}=await db.storage.from("videos").upload(videoPath,file,{contentType:file.type||"video/mp4",upsert:false});
  if(uploadError){submitButton.disabled=false;submitButton.textContent="保存提交并进入审核";toast("上传失败："+uploadError.message);return}
  const record={
    creator_id:user.id,title:fd.get("title"),topic:topicValue[fd.get("topic")],age_band:ageValue[fd.get("age")],
    content_language:languageValue[fd.get("language")],summary:fd.get("summary"),source_url:fd.get("source"),video_path:videoPath,status:"pending"
  };
  const {error:insertError}=await db.from("submissions").insert(record);
  if(insertError){submitButton.disabled=false;submitButton.textContent="保存提交并进入审核";toast("已上传视频，但建立审核记录失败："+insertError.message);return}
  location.href="/studio/submissions/";
}
async function initLogin(){
  const form=document.querySelector("#access");if(!form)return;
  const hint=document.querySelector("#authHint");
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!db){hint.textContent="登入服务尚未加载，请稍后重试。";return}
    const email=new FormData(form).get("email");
    const button=form.querySelector("button");button.disabled=true;button.textContent="正在发送…";
    const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:"https://openframe.run.place/studio/home/"}});
    button.disabled=false;button.textContent="发送登入链接";
    hint.textContent=error?"无法发送："+error.message:"登入链接已发送。请在邮箱中打开链接后回到工作台。";
  };
}
async function initStudio(){
  const needsAuth=document.querySelector("#submissionForm,#submissionList,[data-count]");
  if(!needsAuth)return;
  const user=await currentUser();if(!user)return;
  await Promise.all([renderStats(user),renderList(user)]);
  const file=document.querySelector("#video");if(file)file.onchange=e=>setFileHint(e.target.files[0]);
  const form=document.querySelector("#submissionForm");
  if(form)form.onsubmit=event=>{event.preventDefault();submitContent(user,form)};
}
document.addEventListener("DOMContentLoaded",async()=>{
  await initLogin();
  await initStudio();
  const review=document.querySelector("#reviewList");
  if(review)review.innerHTML='<article class="review-item"><div class="eyebrow">ADMIN CONSOLE</div><h2>审核后台尚未对外开放。</h2><p>审核功能会在管理员角色和独立后台完成后启用；创作者页面不会显示其他人的未审核内容。</p></article>';
});