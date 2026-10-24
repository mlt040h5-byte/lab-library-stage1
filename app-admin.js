/* ===== لوحة الإدارة ===== */
let stats = null, statsErr = "", statsBusy = false;
let accts = null, acctsErr = "", acctsBusy = false, acctQ = "";
let studentLocations = null, studentLocationsErr = "", studentLocationsBusy = false;

/* ---------- دخول المالك ---------- */
async function doAdminLogin(){
  const {error} = await sb.auth.signInWithPassword({email:$("#em").value.trim().toLowerCase(), password:$("#pw").value.trim()});
  if(error){
    const m = /invalid login credentials/i.test(error.message) ? "البريد أو كلمة المرور غير صحيحة." : error.message;
    toast("فشل تسجيل الدخول: " + m, "err");
  } else toast("تم تسجيل الدخول بنجاح.");
}
async function sendOtp(){
  const email = $("#em").value.trim().toLowerCase(); if(!email) return toast("اكتب بريدك أولًا.","err");
  const {error} = await sb.auth.signInWithOtp({email, options:{shouldCreateUser:false}});
  if(error) return toast("تعذر إرسال الرمز: " + error.message, "err");
  $("#otpbox").style.display = "block"; toast("أُرسل الرمز إلى بريدك. افحص الوارد والرسائل غير المرغوبة.");
}
async function verifyOtp(){
  const email = $("#em").value.trim().toLowerCase(), token = $("#otp").value.trim();
  if(!token) return toast("اكتب الرمز.","err");
  const {error} = await sb.auth.verifyOtp({email, token, type:"email"});
  if(error) toast("الرمز غير صحيح أو انتهت صلاحيته: " + error.message, "err"); else toast("تم تسجيل الدخول بنجاح.");
}

/* ---------- المحاضرات ---------- */
async function validatePdf(f){
  if(!f) return "اختر ملف PDF.";
  if(!/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf")) return "الملف ليس PDF.";
  if(f.size > MAX_MB*1048576) return `حجم الملف أكبر من ${MAX_MB} ميجابايت.`;
  if(f.size < 100) return "الملف فارغ أو تالف.";
  const head = await f.slice(0,5).text();
  if(head !== "%PDF-") return "محتوى الملف ليس PDF صالحًا.";
  return null;
}
const newPath = sid => `${sid}/${crypto.randomUUID()}.pdf`;
const upload = (path, f) => sb.storage.from(BUCKET).upload(path, f, {contentType:"application/pdf", upsert:false});

async function saveLecture(){
  // مشرف المحتوى يضيف محاضرات جديدة فقط ولا يعدّل محاضرة موجودة.
  if(isContentManager && !isAdmin && editing){
    editing = null;
    return toast("مشرف المحتوى يستطيع إضافة المحاضرات وحذفها فقط.", "err");
  }
  if(busy) return;
  const sid = $("#f-sub").value, title = $("#f-title").value.trim(), desc = $("#f-desc").value.trim(), file = $("#f-file").files[0];
  const kind = $("#f-kind2").value || null, semester = $("#f-sem2").value || null;
  if(!title) return toast("اكتب عنوان المحاضرة.","err");
  const e = editing ? lectures.find(l => l.id === editing) : null;
  if(file || !e){ const v = await validatePdf(file); if(v) return toast(v,"err"); }
  busy = true; render();
  try{
    if(!e){
      const path = newPath(sid);
      let r = await upload(path, file); if(r.error) throw r.error;
      r = await sb.from("lectures").insert({subject_id:sid, title, description:desc||null, file_path:path, file_size:file.size, kind, semester});
      if(r.error){ await sb.storage.from(BUCKET).remove([path]); throw r.error; }
      toast("تم رفع المحاضرة ونشرها بنجاح.");
    } else {
      const upd = {subject_id:sid, title, description:desc||null, kind, semester, updated_at:new Date().toISOString()};
      let newFile = null, moved = null;
      if(file){
        newFile = newPath(sid);
        const r = await upload(newFile, file); if(r.error) throw r.error;
        upd.file_path = newFile; upd.file_size = file.size;
      } else if(sid !== e.subject_id){
        const np = newPath(sid);
        const r = await sb.storage.from(BUCKET).move(e.file_path, np); if(r.error) throw r.error;
        moved = np; upd.file_path = np;
      }
      const r = await sb.from("lectures").update(upd).eq("id", e.id);
      if(r.error){
        if(newFile) await sb.storage.from(BUCKET).remove([newFile]);
        if(moved) await sb.storage.from(BUCKET).move(moved, e.file_path);
        throw r.error;
      }
      if(newFile){ const d = await sb.storage.from(BUCKET).remove([e.file_path]); if(d.error) toast("تم الحفظ، لكن تعذر حذف الملف القديم.","err"); else toast("تم حفظ التعديلات واستبدال الملف."); }
      else toast("تم حفظ التعديلات.");
      editing = null;
    }
    await load();
  }catch(err){ toast("فشلت العملية: " + (err.message || "خطأ غير معروف"), "err"); }
  busy = false; render();
}
async function delLecture(id){
  const l = lectures.find(x => x.id === id); if(!l) return;
  if(!confirm(`حذف المحاضرة «${l.title}» نهائيًا؟`)) return;
  const r = await sb.from("lectures").delete().eq("id", id);
  if(r.error) return toast("فشل الحذف: " + r.error.message, "err");
  const d = await sb.storage.from(BUCKET).remove([l.file_path]);
  toast(d.error ? "حُذفت المحاضرة لكن تعذر حذف ملفها من التخزين." : "تم حذف المحاضرة وملفها.", d.error ? "err" : "ok");
  await load(); render();
}

/* ---------- الخلفية ---------- */
async function shrinkImage(f){
  if(!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error("نوع الصورة غير مدعوم (JPG أو PNG أو WEBP فقط).");
  if(f.size > 20*1048576) throw new Error("الصورة كبيرة جدًا.");
  const bmp = await createImageBitmap(f), k = Math.min(1, 1600/Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width*k); c.height = Math.round(bmp.height*k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
}
async function saveBg(reset){
  if(busy) return; const f = $("#bg-file").files[0];
  busy = true;
  try{
    let img = settings.bg_image || null, old = null, color = settings.bg_color || null, dim = +$("#bg-dim").value, newPath2 = null;
    if(reset){ old = img; img = null; color = null; dim = 40; }
    else{
      if(colorTouched) color = $("#bg-color").value;
      if(f){ const blob = await shrinkImage(f); newPath2 = `bg/${crypto.randomUUID()}.jpg`;
        const u = await sb.storage.from("site").upload(newPath2, blob, {contentType:"image/jpeg"}); if(u.error) throw u.error;
        old = img; img = newPath2; }
    }
    const row = {id:1, bg_color:color, bg_image:img, bg_dim:dim, updated_at:new Date().toISOString()};
    const r = await sb.from("site_settings").upsert(row);
    if(r.error){ if(newPath2) await sb.storage.from("site").remove([newPath2]); throw r.error; }
    if(old) await sb.storage.from("site").remove([old]);
    settings = row; colorTouched = false; applyBg(); toast(reset ? "تمت إعادة الخلفية الافتراضية." : "تم حفظ مظهر المكتبة.");
  }catch(e){ toast("فشل حفظ المظهر: " + (e.message || "خطأ"), "err"); }
  busy = false; render();
}

/* ---------- الإعلانات ---------- */
function annPanel(){
  if(isContentManager && !isAdmin){
    return `<div class="panel"><h2>📢 الإعلانات والتبليغات</h2>
      <label>نص الإعلان</label>
      <textarea id="ann-text" rows="3" maxlength="500" placeholder="اكتب الإعلان أو التبليغ هنا"></textarea>
      <p><button class="btn" data-act="annpost">نشر الإعلان</button></p>
      <h3>الإعلانات الحالية</h3>
      ${anns.length ? anns.slice(0,30).map(a => `<div class="lec" style="margin:8px 0">
        <p>${esc(a.message)}</p>
        <div class="m">${fmtDate(a.created_at)}</div>
        <button class="btn del sm" data-act="anndel" data-id="${a.id}">حذف الإعلان</button>
      </div>`).join("") : '<p class="hint">لا توجد إعلانات.</p>'}
    </div>`;
  }

  return `<div class="panel"><h2>📢 إعلان للطلاب</h2>
   <textarea id="ann-text" rows="2" maxlength="500" placeholder="مثال: أُضيفت محاضرات الأنسجة الجديدة"></textarea>
   <label style="font-weight:400"><input type="checkbox" id="ann-pin" style="width:auto"> تثبيت الإعلان في أعلى الصفحة</label>
   <label style="font-weight:400"><input type="checkbox" id="ann-push" style="width:auto"> أرسل كإشعار للهاتف أيضًا</label>
   <p><button class="btn" data-act="annpost">نشر الإعلان</button></p>
   ${anns.length ? anns.slice(0,10).map(a => `<div class="lec" style="margin:8px 0"><div>${a.pinned?"📌 ":""}${esc(a.message)}</div><div class="m">${fmtDate(a.created_at)} · ${a.active?"ظاهر":"مخفي"}</div><div class="acts"><button class="btn sec sm" data-act="anntoggle" data-id="${a.id}">${a.active?"إخفاء":"إظهار"}</button><button class="btn sec sm" data-act="annpin" data-id="${a.id}">${a.pinned?"إلغاء التثبيت":"تثبيت"}</button><button class="btn del sm" data-act="anndel" data-id="${a.id}">حذف</button></div></div>`).join("") : '<p class="hint">لا توجد إعلانات.</p>'}
   <p class="hint">الإعلان الجديد يصل تلقائيًا إلى إشعارات الطلاب داخل التطبيق.</p></div>`;
}
async function postAnn(){
  const field = $("#ann-text");
  const m = field ? field.value.trim() : "";
  if(!m) return toast("اكتب نص الإعلان.","err");

  const managerOnly = isContentManager && !isAdmin;
  const pin = managerOnly ? false : !!($("#ann-pin") && $("#ann-pin").checked);
  const alsoPush = managerOnly ? false : !!($("#ann-push") && $("#ann-push").checked);

  const r = await sb.from("announcements").insert({message:m, pinned:pin});
  if(r.error) return toast("فشل النشر: " + r.error.message, "err");

  toast("تم نشر الإعلان.");

  // إشعارات الهاتف أداة للمالك الكامل فقط.
  if(alsoPush && isAdmin){
    try{
      const d = await sendPush("📢 إعلان جديد", m);
      toast("نُشر الإعلان وأُرسل إشعار إلى " + d.sent + " جهاز.");
    }catch(e){
      toast("نُشر الإعلان لكن فشل إشعار الهاتف: " + e.message, "err");
    }
  }

  await load();
  render();
}
async function annUpdate(id, patch){
  const r = await sb.from("announcements").update(patch).eq("id", id);
  if(r.error) return toast("فشل التعديل: " + r.error.message, "err");
  await load(); render();
}
async function delAnn(id){
  if(!confirm("حذف هذا الإعلان نهائيًا؟")) return;
  const r = await sb.from("announcements").delete().eq("id", id);
  if(r.error) return toast("فشل الحذف: " + r.error.message, "err");
  toast("تم حذف الإعلان."); await load(); render();
}

/* ---------- إشعارات الهاتف ---------- */
function pushPanel(){
  return `<div class="panel"><h2>🔔 إرسال إشعار للهاتف</h2>
   <p class="hint">عدد الأجهزة المشتركة: ${subCount ?? "—"}</p>
   <label>العنوان</label><input id="pn-title" maxlength="100" placeholder="مكتبة المحاضرات">
   <label>النص</label><textarea id="pn-body" rows="2" maxlength="300" placeholder="أُضيفت محاضرة جديدة في مادة الأنسجة"></textarea>
   <p><button class="btn" data-act="pnsend">إرسال الآن</button></p>
   <p class="hint">يصل لمن فعّل إشعارات الهاتف فقط، وقد يتأخر قليلًا.</p></div>`;
}
async function sendPush(title, body){
  const r = await sb.functions.invoke("send-push", {body:{title, body}});
  if(r.error) throw new Error(r.error.message || "فشل الإرسال");
  return r.data;
}
async function doPushSend(){
  const title = $("#pn-title").value.trim() || "مكتبة المحاضرات", body = $("#pn-body").value.trim();
  if(!body) return toast("اكتب نص الإشعار.","err");
  if(!confirm("إرسال هذا الإشعار لكل المشتركين؟")) return;
  try{ const d = await sendPush(title, body); toast("أُرسل إلى " + d.sent + " جهاز من " + d.total + "."); await loadMe(); render(); }
  catch(e){ toast("فشل الإرسال: " + e.message, "err"); }
}

/* ---------- الجدول الدراسي ---------- */
function schedPanel(){
  const rows = [...sched].sort((a,b) => (DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)) || String(a.start_time).localeCompare(String(b.start_time)));
  return `<div class="panel"><h2>🗓 الجدول الدراسي</h2>
   <label>اليوم</label><select id="sc-day">${DAY_ORDER.map(d => `<option value="${d}">${DAYS[d]}</option>`).join("")}</select>
   <div class="bar"><div style="flex:1"><label>من</label><input id="sc-from" type="time" value="08:30"></div><div style="flex:1"><label>إلى</label><input id="sc-to" type="time" value="10:00"></div></div>
   <label>المادة</label><select id="sc-sub">${subjects.map(s => `<option value="${esc(s.id)}">${esc(s.name_ar)}</option>`).join("")}</select>
   <label>النوع</label><select id="sc-kind"><option value="theory">نظري</option><option value="practical">عملي</option></select>
   <label>القاعة (اختياري)</label><input id="sc-room" maxlength="60">
   <label>المجموعة (اختياري)</label><input id="sc-group" maxlength="40">
   <p><button class="btn" data-act="schadd">إضافة للجدول</button></p>
   ${rows.map(x => { const s = subj(x.subject_id);
     return `<div class="row">${DAYS[x.day_of_week]} ${hhmm(x.start_time)}–${hhmm(x.end_time)} · ${s?esc(s.name_ar):""} · ${KIND_AR[x.kind]||""}${x.room?" · "+esc(x.room):""}${x.group_name?" · "+esc(x.group_name):""} <button class="btn del sm" data-act="schdel" data-id="${x.id}">حذف</button></div>`; }).join("") || '<p class="hint">لا توجد محاضرات في الجدول بعد.</p>'}</div>`;
}
async function schedAdd(){
  const from = $("#sc-from").value, to = $("#sc-to").value;
  if(!from || !to || to <= from) return toast("اختر وقتًا صحيحًا: النهاية بعد البداية.","err");
  const r = await sb.from("schedule").insert({day_of_week:+$("#sc-day").value, start_time:from, end_time:to, subject_id:$("#sc-sub").value, kind:$("#sc-kind").value, room:$("#sc-room").value.trim()||null, group_name:$("#sc-group").value.trim()||null});
  if(r.error) return toast("تعذرت الإضافة: " + r.error.message, "err");
  toast("أُضيفت المحاضرة إلى الجدول."); await load(); render();
}
async function schedDel(id){
  if(!confirm("حذف هذا الموعد من الجدول؟")) return;
  const r = await sb.from("schedule").delete().eq("id", id);
  if(r.error) return toast("تعذر الحذف: " + r.error.message, "err");
  await load(); render();
}

/* ---------- حسابات الطلاب ---------- */
async function loadAccts(){
  if(acctsBusy) return; acctsBusy = true;
  try{
    const r = await sb.rpc("admin_students");
    if(r.error){ accts = null; acctsErr = "تعذر تحميل الحسابات: " + r.error.message; }
    else { accts = r.data || []; acctsErr = ""; }
  }catch(e){ accts = null; acctsErr = "تعذر تحميل الحسابات."; }
  acctsBusy = false; render();
}
async function loadStudentLocations(){
  if(studentLocationsBusy || !isAdmin) return;
  studentLocationsBusy = true;
  try{
    const r = await sb.from("student_locations").select("user_id,latitude,longitude,accuracy_m,captured_at,updated_at").order("updated_at",{ascending:false});
    if(r.error){ studentLocations = null; studentLocationsErr = "تعذر تحميل المواقع: " + r.error.message; }
    else { studentLocations = r.data || []; studentLocationsErr = ""; }
  }catch(e){ studentLocations = null; studentLocationsErr = "تعذر تحميل مواقع الطلاب."; }
  studentLocationsBusy = false; render();
}
function locationsPanel(){
  if(studentLocationsErr) return `<div class="panel"><h2>📍 مواقع الطلاب</h2><p class="hint">${esc(studentLocationsErr)}</p><p class="hint">تأكد من تنفيذ ملف SQL المرفق في Supabase وإضافة سياسات الأمان.</p><button class="btn sec sm" data-act="locationreload">إعادة المحاولة</button></div>`;
  if(!studentLocations) return `<div class="panel"><h2>📍 مواقع الطلاب</h2><p class="hint">جارٍ تحميل المواقع…</p></div>`;
  const nameFor = id => (accts || []).find(a => a.user_id === id);
  return `<div class="panel"><h2>📍 مواقع الطلاب</h2><p class="hint">تظهر هذه البيانات للمسؤول فقط. الموقع محفوظ من آخر دخول ناجح للطالب.</p>
    ${studentLocations.length ? studentLocations.map(x => { const a = nameFor(x.user_id); const lat = Number(x.latitude), lon = Number(x.longitude); const valid = Number.isFinite(lat) && Number.isFinite(lon); const map = valid ? `https://www.google.com/maps?q=${lat},${lon}` : "#"; return `<div class="lec" style="margin:8px 0"><h3>${esc(a?.display_name || "طالب")} ${a?.username ? `<span class="hint" dir="ltr">@${esc(a.username)}</span>` : ""}</h3><div class="m">آخر تحديث: ${esc(fmtDT(x.updated_at || x.captured_at))}</div><div class="m" dir="ltr">${valid ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "إحداثيات غير صالحة"}${x.accuracy_m != null ? ` · دقة تقريبية ${Math.round(Number(x.accuracy_m))} م` : ""}</div><p><a class="btn sec sm" href="${map}" target="_blank" rel="noopener" ${valid ? "" : 'aria-disabled="true"'}>فتح على خرائط Google</a></p><details><summary>معرّف الحساب</summary><small dir="ltr">${esc(x.user_id)}</small></details></div>`; }).join("") : `<p class="hint">لم يسجّل أي طالب موقعه بعد.</p>`}
    <p><button class="btn sec sm" data-act="locationreload">تحديث المواقع</button></p></div>`;
}

function acctsPanel(){
  if(acctsErr) return `<div class="panel"><h2>👥 حسابات الطلاب</h2><p class="hint">${esc(acctsErr)}</p><button class="btn sec sm" data-act="acctreload">إعادة المحاولة</button></div>`;
  if(!accts) return `<div class="panel"><h2>👥 حسابات الطلاب</h2><p class="hint">جارٍ التحميل…</p></div>`;
  const wk = Date.now() - 7*86400000;
  const act = accts.filter(a => new Date(a.last_seen).getTime() > wk).length, nw = accts.filter(a => new Date(a.created_at).getTime() > wk).length;
  const list = accts.filter(a => !acctQ || norm(a.username).includes(norm(acctQ)) || norm(a.display_name).includes(norm(acctQ)));
  return `<div class="panel"><h2>👥 حسابات الطلاب</h2>
   <div class="stats"><div class="stat"><b>${accts.length}</b>إجمالي الطلاب</div><div class="stat"><b>${act}</b>نشطون (7 أيام)</div><div class="stat"><b>${nw}</b>جدد (7 أيام)</div><div class="stat"><b>${lectures.length}</b>محاضرات</div></div>
   <div class="bar"><input id="aq" type="search" placeholder="🔎 ابحث بالاسم أو اسم المستخدم…" value="${esc(acctQ)}"></div>
   ${list.map(a => `<div class="lec" style="margin:6px 0"><h3>${esc(a.display_name)} <span class="hint" dir="ltr">@${esc(a.username)}</span></h3><div class="m">آخر ظهور: ${fmtDT(a.last_seen)} · مكتملة ${a.completed} · مفضلة ${a.favorites} · محفوظة ${a.saved} · ملاحظات ${a.notes}</div><div class="acts"><button class="btn sec sm" data-act="acctpass" data-id="${a.user_id}">كلمة مرور جديدة</button><button class="btn del sm" data-act="acctdel" data-id="${a.user_id}">حذف الحساب</button></div></div>`).join("") || '<p class="hint">لا توجد حسابات مطابقة.</p>'}
   <p><button class="btn sec sm" data-act="acctreload">تحديث</button></p></div>`;
}
async function acctPass(id){
  const p = prompt("كلمة المرور الجديدة للطالب (10 أحرف على الأقل). أبلغه بها بنفسك:");
  if(p === null) return;
  if(p.length < 10) return toast("كلمة المرور 10 أحرف على الأقل.","err");
  const r = await fn("admin-accounts", {action:"reset_password", user_id:id, new_password:p});
  toast(r.err || "تم تغيير كلمة مرور الطالب.", r.err ? "err" : "ok");
}
async function acctDel(id){
  const a = (accts || []).find(x => x.user_id === id);
  if(!confirm(`حذف حساب «${a ? a.display_name : ""}» نهائيًا مع ملاحظاته وتقدمه؟ لا يمكن التراجع.`)) return;
  const r = await fn("admin-accounts", {action:"delete_user", user_id:id});
  if(r.err) return toast(r.err, "err");
  toast("تم حذف الحساب."); accts = null; acctsErr = ""; render();
}

/* ---------- التصنيف الدراسي للطلاب ---------- */
async function loadPublicRanking(){
  try{
    const r = await sb.rpc("get_student_ranking");
    if(r.error){ publicRanking = {published:false, students:[]}; return; }
    const d = r.data || {};
    publicRanking = {published:!!d.published, students:Array.isArray(d.students)?d.students:[]};
  }catch(_){ publicRanking = {published:false, students:[]}; }
}
async function loadAdminRanking(){
  if(rankingBusy || !isAdmin) return;
  rankingBusy = true;
  try{
    const r = await sb.rpc("admin_student_ranking");
    if(r.error){ adminRanking = null; rankingErr = "تعذر تحميل التصنيف: " + r.error.message; }
    else {
      const d = r.data || {};
      adminRanking = {published:!!d.published, students:Array.isArray(d.students)?d.students:[]};
      rankingErr = "";
    }
  }catch(e){ adminRanking = null; rankingErr = "تعذر تحميل التصنيف الدراسي."; }
  rankingBusy = false;
  render();
}
async function toggleStudentRanking(){
  if(!isAdmin) return;
  const el = $("#rank-pub");
  if(!el) return;
  const published = !!el.checked;
  const r = await sb.rpc("set_student_ranking_published", {p_published:published});
  if(r.error) return toast("تعذر تغيير نشر التصنيف. تأكد من تنفيذ ملف student-ranking.sql. " + r.error.message, "err");
  toast(published ? "تم نشر التصنيف للطلاب." : "تم إخفاء التصنيف عن الطلاب.");
  rankingErr = ""; adminRanking = null;
  await loadPublicRanking();
  await loadAdminRanking();
  render();
}
function rankingPanel(){
  if(rankingErr) return `<div class="panel"><h2>🏆 تصنيف الطلاب</h2><p class="hint">${esc(rankingErr)}</p><p class="hint">نفّذ ملف student-ranking.sql في Supabase مرة واحدة لتجهيز التصنيف وصلاحياته.</p><button class="btn sec sm" data-act="rankingreload">إعادة المحاولة</button></div>`;
  if(!adminRanking) return `<div class="panel"><h2>🏆 تصنيف الطلاب</h2><p class="hint">جارٍ تحميل التصنيف…</p></div>`;
  const list = adminRanking.students || [];
  return `<div class="panel"><h2>🏆 تصنيف الطلاب</h2>
    <p class="hint">الدرجة النهائية = 50% من متوسط الاختبارات + 50% من نسبة إكمال المحاضرات. البيانات خاصة بالمالك حتى تختار نشرها.</p>
    <label style="font-weight:400"><input id="rank-pub" type="checkbox" style="width:auto" ${adminRanking.published?"checked":""}> إظهار التصنيف لجميع الطلاب</label>
    <p><button class="btn sm" data-act="rankingtoggle">حفظ حالة النشر</button></p>
    ${list.length ? list.map((x,i) => `<div class="lec" style="margin:7px 0"><h3>${i+1}. ${esc(x.display_name || "طالب")} <span class="hint" dir="ltr">@${esc(x.username || "")}</span></h3><div class="m">النتيجة النهائية ${Number(x.overall_score||0).toFixed(1)}% · متوسط الاختبارات ${Number(x.quiz_percent||0).toFixed(1)}% · إكمال المحاضرات ${Number(x.completion_percent||0).toFixed(1)}%</div><div class="m">المحاضرات المكتملة ${Number(x.completed||0)} من ${Number(x.lecture_total||0)} · محاولات الاختبارات ${Number(x.attempts||0)}</div></div>`).join("") : `<p class="hint">لا توجد حسابات طلاب لعرضها.</p>`}
    <p><button class="btn sec sm" data-act="rankingreload">تحديث التصنيف</button></p></div>`;
}

/* ---------- إحصائيات الدخول ---------- */
async function loadStats(){
  if(statsBusy) return; statsBusy = true;
  try{
    const r = await sb.rpc("visit_stats");
    if(r.error){ stats = null; statsErr = "تعذر تحميل الإحصائيات (" + r.error.message + ")"; }
    else { stats = r.data; statsErr = ""; }
  }catch(e){ stats = null; statsErr = "تعذر تحميل الإحصائيات."; }
  statsBusy = false; render();
}
function statsPanel(){
  if(statsErr) return `<div class="panel"><h2>📈 إحصائيات الدخول</h2><p class="hint">${esc(statsErr)}</p><button class="btn sec sm" data-act="statsreload">إعادة المحاولة</button></div>`;
  if(!stats) return `<div class="panel"><h2>📈 إحصائيات الدخول</h2><p class="hint">جارٍ التحميل…</p></div>`;
  const box = (n, t) => `<div class="stat"><b>${n}</b>${t}</div>`;
  const days = stats.daily || [], max = Math.max(1, ...days.map(x => x.opens));
  return `<div class="panel"><h2>📈 إحصائيات الدخول</h2>
   <div class="stats">${box(stats.today_opens,"مرات الفتح اليوم")}${box(stats.today_devices,"أجهزة اليوم")}${box(stats.week_opens,"مرات الفتح (7 أيام)")}${box(stats.week_devices,"أجهزة (7 أيام)")}${box(stats.month_opens,"مرات الفتح (30 يومًا)")}${box(stats.month_devices,"أجهزة (30 يومًا)")}${box(stats.total_opens,"إجمالي مرات الفتح")}${box(stats.total_devices,"إجمالي الأجهزة")}</div>
   <h3>آخر 14 يومًا (مرات الفتح)</h3>
   ${days.length ? days.map(x => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:.85rem"><span style="width:60px;direction:ltr">${esc(String(x.d).slice(5))}</span><div class="pbar" style="flex:1"><i style="width:${Math.round(x.opens/max*100)}%"></i></div><b>${x.opens}</b></div>`).join("") : '<p class="hint">لا توجد بيانات بعد.</p>'}
   <p class="hint">الجهاز = متصفح أو تطبيق واحد. تُحسب الزيارة مرة كل 30 دقيقة لكل جهاز، ولا تُحسب زياراتك أنت. الأرقام تقريبية.</p>
   <button class="btn sec sm" data-act="statsreload">تحديث</button></div>`;
}

/* ---------- لوحة مشرف المحتوى ---------- */
function contentManagerView(){
  const list = filtered();

  return `<p class="crumb">
      <a href="#/">← المكتبة</a>
      · <button class="btn sec sm" data-act="logoutcontent">تسجيل الخروج</button>
    </p>

    <div class="panel">
      <h2>📚 إدارة المحاضرات</h2>

      <label>المادة</label>
      <select id="f-sub">
        ${subjects.map(s => `<option value="${esc(s.id)}">${esc(s.name_ar)} — ${esc(s.name_en)}</option>`).join("")}
      </select>

      <label>عنوان المحاضرة</label>
      <input id="f-title" maxlength="200">

      <div class="bar">
        <div style="flex:1">
          <label>النوع</label>
          <select id="f-kind2">
            <option value="">— بدون —</option>
            ${LEC_KINDS.map(x => `<option value="${x}">${x}</option>`).join("")}
          </select>
        </div>
        <div style="flex:1">
          <label>الفصل</label>
          <select id="f-sem2">
            <option value="">— بدون —</option>
            ${SEMS.map(x => `<option value="${x}">${x}</option>`).join("")}
          </select>
        </div>
      </div>

      <label>وصف المحاضرة (اختياري)</label>
      <textarea id="f-desc" rows="2" maxlength="1000"></textarea>

      <label>ملف PDF (الحد الأقصى ${MAX_MB} ميجابايت)</label>
      <input id="f-file" type="file" accept="application/pdf,.pdf">

      <p><button class="btn" data-act="save" ${busy ? "disabled" : ""}>
        ${busy ? "جارٍ الرفع…" : "رفع المحاضرة"}
      </button></p>
    </div>

    ${schedPanel()}
    ${quizAdminPanel()}
    ${annPanel()}

    <h2>المحاضرات الحالية (${lectures.length})</h2>
    ${searchBlock(true)}

    ${list.length ? list.map(l => {
      const s = subj(l.subject_id);
      return `<div class="lec">
        <h3>${esc(l.title)}</h3>
        <div class="m">${s ? esc(s.name_ar) : ""} · ${l.kind ? esc(l.kind) : ""} · ${fmtDate(l.created_at)}</div>
        ${l.description ? `<p>${esc(l.description)}</p>` : ""}
        <div class="acts">
          <button class="btn del sm" data-act="del" data-id="${l.id}">🗑 حذف المحاضرة</button>
        </div>
      </div>`;
    }).join("") : `<div class="empty">لا توجد محاضرات مطابقة.</div>`}
  `;
}

/* ---------- صفحة الإدارة ---------- */
function adminView(){
  if(!session) return `<div class="panel"><h2>تسجيل دخول المالك</h2>
   <label>البريد الإلكتروني</label><input id="em" type="email" autocomplete="username" dir="ltr">
   <label>كلمة المرور</label><input id="pw" type="password" autocomplete="current-password" dir="ltr">
   <label style="font-weight:400"><input type="checkbox" id="showpw" style="width:auto"> إظهار كلمة المرور</label>
   <p><button class="btn" data-act="adminlogin">دخول</button></p>
   <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
   <h3>أو الدخول برمز يصل إلى بريدك</h3>
   <p class="hint">اكتب بريدك في الخانة أعلاه فقط، ثم اضغط إرسال الرمز.</p>
   <button class="btn sec" data-act="sendotp">إرسال الرمز إلى بريدي</button>
   <div id="otpbox" style="display:none"><label>الرمز الذي وصلك</label><input id="otp" inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="10"><p><button class="btn" data-act="verifyotp">تأكيد الرمز</button></p></div></div>`;
  if(roleErr) return `<div class="panel"><h2>تعذر التحقق من الصلاحية</h2><p>لم نتمكن من تأكيد دور هذا الحساب من الخادم.</p><button class="btn" data-act="retryadmin">إعادة المحاولة</button> <button class="btn sec" data-act="logout">تسجيل الخروج</button></div>`;
  if(adminErr && !isAdmin) return `<div class="panel"><h2>تعذر التحقق من الصلاحية</h2><p>المشكلة في الاتصال بالإنترنت وليست في حسابك.</p><button class="btn" data-act="retryadmin">إعادة المحاولة</button> <button class="btn sec" data-act="logout">تسجيل الخروج</button></div>`;
  if(isContentManager && !isAdmin){
    editing = null;
    return contentManagerView();
  }
  if(!isAdmin) return `<div class="panel"><h2>غير مصرّح</h2><p>هذه الصفحة لمالك المكتبة فقط.</p><p><a class="btn" href="#/">العودة للمكتبة</a> <button class="btn sec" data-act="logout">تسجيل الخروج</button></p></div>`;
  const e = editing ? lectures.find(l => l.id === editing) : null, list = filtered();
  const opt = (arr, v) => arr.map(x => `<option ${v===x?"selected":""}>${x}</option>`).join("");
  return `<p class="crumb"><a href="#/">← المكتبة</a> · <a href="#" data-act="logout">تسجيل الخروج</a></p>
  <div class="panel"><h2>${e?"تعديل محاضرة":"إضافة محاضرة"}</h2>
   <label>المادة</label><select id="f-sub">${subjects.map(s => `<option value="${esc(s.id)}" ${e&&e.subject_id===s.id?"selected":""}>${esc(s.name_ar)} — ${esc(s.name_en)}</option>`).join("")}</select>
   <label>عنوان المحاضرة</label><input id="f-title" maxlength="200" value="${esc(e?.title)}">
   <div class="bar"><div style="flex:1"><label>النوع</label><select id="f-kind2"><option value="">— بدون —</option>${opt(LEC_KINDS, e?.kind)}</select></div><div style="flex:1"><label>الفصل</label><select id="f-sem2"><option value="">— بدون —</option>${opt(SEMS, e?.semester)}</select></div></div>
   <label>وصف (اختياري)</label><textarea id="f-desc" rows="2" maxlength="1000">${esc(e?.description)}</textarea>
   <label>${e?"استبدال ملف PDF (اتركه فارغًا للإبقاء على الملف الحالي)":"ملف PDF (الحد الأقصى "+MAX_MB+" ميجابايت)"}</label>
   <input id="f-file" type="file" accept="application/pdf,.pdf">
   <p><button class="btn" data-act="save" ${busy?"disabled":""}>${busy?"جارٍ الحفظ…":(e?"حفظ التعديلات":"رفع المحاضرة")}</button>${e?` <button class="btn sec" data-act="cancel">إلغاء</button>`:""}</p></div>
  ${quizAdminPanel()}
  ${annPanel()}
  ${schedPanel()}
  ${acctsPanel()}
  ${rankingPanel()}
  ${locationsPanel()}
  <div class="panel"><h2>🎨 مظهر المكتبة</h2>
   <label>لون الخلفية</label><input id="bg-color" type="color" value="${esc(settings.bg_color||"#f4f7f9")}" style="height:48px;padding:4px">
   <label>أو صورة خلفية (JPG / PNG / WEBP)</label><input id="bg-file" type="file" accept="image/jpeg,image/png,image/webp">
   <label>تعتيم الصورة: <span id="dimv">${settings.bg_dim ?? 40}</span>%</label><input id="bg-dim" type="range" min="0" max="80" value="${settings.bg_dim ?? 40}">
   <p><button class="btn" data-act="bgsave" ${busy?"disabled":""}>حفظ المظهر</button> <button class="btn sec" data-act="bgreset">إعادة الافتراضي</button></p></div>
  ${pushPanel()}
  ${statsPanel()}
  <h2>كل المحاضرات (${lectures.length})</h2>${searchBlock(true)}
  ${list.length ? list.map(l => lecCard(l, true)).join("") : `<div class="empty">لا توجد محاضرات.</div>`}`;
      }
