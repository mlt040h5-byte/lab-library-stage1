/* ===== النواة: الإعدادات والحالة وتحميل البيانات والحسابات والتقدم والملاحظات ===== */
const SUPABASE_URL = "https://tsaotjrngbwoqiunhqfr.supabase.co";
const SUPABASE_KEY = "sb_publishable_LdWZAcD_uV9bD9DXRHyvjg_2Lc5hgvN";
const VAPID_PUBLIC = "BAqWU2bIgn9zStMUFOfz207S8pX__O6fFyy2Jxs2QBjW7x3px3mi1WkIi9W3bQ3E7s_Tb8BQlVjDlT4GRLzrRxA";
const MAX_MB = 50, BUCKET = "lectures", EMAIL_DOMAIN = "students.invalid";
const DAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const DAY_ORDER = [6,0,1,2,3,4,5];
const KIND_AR = {theory:"نظري", practical:"عملي"};
const LEC_KINDS = ["نظري","عملي","ملزمة","أخرى"], SEMS = ["الأول","الثاني"];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = d => new Date(d).toLocaleDateString("ar-IQ", {year:"numeric", month:"long", day:"numeric"});
const fmtDT = d => new Date(d).toLocaleString("ar-IQ", {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});
const fmtSize = b => b ? (b/1048576).toFixed(1) + " MB" : "";
const norm = s => String(s||"").toLowerCase().trim();
const hhmm = t => String(t||"").slice(0,5);
const pct = (a,b) => b ? Math.round(a/b*100) : 0;

let sb = null, session = null, isAdmin = false, isContentManager = false, roleErr = false, adminErr = false, adminFor = null, me = null, ready = false;
let subjects = [], lectures = [], settings = {}, anns = [], sched = [];
let prog = new Map(), notes = [], notifs = [], reads = new Set(), subCount = null;
let q = "", nq = "", filter = "all", fKind = "", fSem = "", fDone = "", dashTab = "saved";
let locationStatus = "idle", locationError = "", locationBusy = false, accessBusy = false;
let publicRanking = {published:false, students:[]}, adminRanking = null, rankingErr = "", rankingBusy = false;
let editing = null, busy = false, loadError = "", authTab = "login", pendingCode = null, curLec = null, colorTouched = false;

function toast(msg, type="ok"){
  const t = $("#toast"); t.textContent = msg; t.className = type; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", type === "ok" ? 3500 : 7000);
}
const fileUrl = (path, dl) => sb.storage.from(BUCKET).getPublicUrl(path, dl ? {download: true} : undefined).data.publicUrl;
const subj = id => subjects.find(s => s.id === id);
const pg = id => prog.get(id) || {completed:false, favorite:false, saved:false};

/* ---------- الخلفية ---------- */
const lum = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h||""); if(!m) return 1; const n = parseInt(m[1],16); return (0.299*(n>>16) + 0.587*((n>>8)&255) + 0.114*(n&255))/255; };
function applyBg(){
  const b = document.body, s = settings || {};
  b.classList.remove("custombg"); b.style.background = ""; b.style.backgroundImage = "";
  if(s.bg_image){
    const d = (s.bg_dim ?? 40)/100, url = sb.storage.from("site").getPublicUrl(s.bg_image).data.publicUrl;
    b.style.backgroundImage = `linear-gradient(rgba(0,0,0,${d}),rgba(0,0,0,${d})), url("${url}")`;
    b.style.backgroundSize = "cover"; b.style.backgroundPosition = "center"; b.style.backgroundAttachment = "fixed"; b.classList.add("custombg");
  } else if(s.bg_color){ b.style.background = s.bg_color; if(lum(s.bg_color) < 0.5) b.classList.add("custombg"); }
  try{ localStorage.setItem("lib_settings", JSON.stringify(s)); }catch(_){}
}

/* ---------- تحميل البيانات ---------- */
async function load(){
  try{
    const [a,b,s,an,sc] = await Promise.all([
      sb.from("subjects").select("*").order("sort"),
      sb.from("lectures").select("*").order("created_at",{ascending:false}),
      sb.from("site_settings").select("*").eq("id",1).maybeSingle(),
      sb.from("announcements").select("*").order("created_at",{ascending:false}).limit(50),
      sb.from("schedule").select("*").order("start_time")
    ]);
    if(a.error) throw a.error; if(b.error) throw b.error;
    subjects = a.data; lectures = b.data; loadError = "";
    if(s.data){ settings = s.data; applyBg(); }
    if(!an.error) anns = an.data || [];
    if(!sc.error) sched = sc.data || [];
  }catch(e){ loadError = "تعذر تحميل البيانات. تأكد من الاتصال بالإنترنت."; }
}

/* ---------- التحقق من الأدوار ---------- */
async function checkAdmin(){
  if(!session){
    isAdmin = false;
    isContentManager = false;
    adminFor = null;
    adminErr = false;
    roleErr = false;
    return;
  }

  const uid = session.user.id;

  // لا نعيد الاستعلام إذا تحققنا من الدور لهذا الحساب بالفعل.
  if(adminFor === uid && !adminErr && !roleErr) return;

  isAdmin = false;
  isContentManager = false;
  adminFor = null;
  adminErr = false;
  roleErr = false;

  let adminChecked = false;

  // التحقق من صلاحية المالك الكامل أولًا.
  for(let i = 0; i < 3; i++){
    try{
      const r = await sb.from("admins").select("user_id").eq("user_id", uid).maybeSingle();

      if(!r.error){
        isAdmin = !!r.data;
        adminFor = uid;
        adminChecked = true;
        break;
      }
    }catch(_){}

    await new Promise(r => setTimeout(r, 900));
  }

  if(!adminChecked){
    adminErr = true;
    return;
  }

  // المالك الكامل يحتفظ بصلاحياته ولا يحتاج دور مشرف المحتوى.
  if(isAdmin) return;

  // التحقق من دور مشرف المحتوى بواسطة الدالة الموجودة في Supabase.
  for(let i = 0; i < 3; i++){
    try{
      const r = await sb.rpc("is_content_manager");

      if(!r.error){
        isContentManager = r.data === true;
        return;
      }
    }catch(_){}

    await new Promise(r => setTimeout(r, 900));
  }

  // عند فشل التحقق، لا نمنح دور مشرف المحتوى.
  roleErr = true;
}

/* ---------- تحميل بيانات الحساب ---------- */
async function loadMe(){
  me = null;
  prog = new Map();
  notes = [];
  notifs = [];
  reads = new Set();

  if(!session) return;

  // لا نحمّل بيانات الطالب لمشرف المحتوى أو عند تعذّر التحقق من الدور.
  if(isContentManager || roleErr || adminErr) return;

  try{
    if(isAdmin){
      const c = await sb.from("push_subs").select("id",{count:"exact",head:true});
      if(!c.error) subCount = c.count;
      return;
    }

    const [p,g,n] = await Promise.all([
      sb.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle(),
      sb.from("study_progress").select("*"),
      sb.from("notes").select("*").order("updated_at",{ascending:false}).limit(500)
    ]);

    me = p.data || null;
    (g.data || []).forEach(r => prog.set(r.lecture_id, r));
    notes = n.data || [];

    if(me){
      await loadNotifs();
      touchSeen();
    }
  }catch(_){}
}

function touchSeen(){
  try{
    if(!me || Date.now() - (+localStorage.getItem("lib_seen")||0) < 10*60000) return;
    localStorage.setItem("lib_seen", String(Date.now()));
    sb.from("profiles").update({last_seen:new Date().toISOString()}).eq("user_id", me.user_id).then(()=>{});
  }catch(_){}
}

/* ---------- تسجيل الزيارة ---------- */
async function logVisit(){
  try{
    if(isAdmin || isContentManager || roleErr || adminErr) return;

    let id = localStorage.getItem("lib_vid");
    if(!id){
      id = crypto.randomUUID();
      localStorage.setItem("lib_vid", id);
    }

    if(Date.now() - (+localStorage.getItem("lib_vlast")||0) < 30*60*1000) return;

    const r = await sb.from("visits").insert({visitor:id});
    if(!r.error) localStorage.setItem("lib_vlast", String(Date.now()));
  }catch(_){}
}

/* ---------- إذن الموقع والإشعارات للطلاب ---------- */
function notificationPermission(){
  try{ return ("Notification" in window) ? Notification.permission : "unsupported"; }
  catch(_){ return "unsupported"; }
}

function studentAccessNeedsSetup(){
  if(!session || isAdmin || isContentManager || roleErr || adminErr || !me) return false;
  if(accessBusy) return true;

  const pp = notificationPermission();

  return locationStatus !== "ok" ||
    (pp === "default" && ("serviceWorker" in navigator) && ("PushManager" in window));
}

function locationGateView(){
  /* بعد الضغط على «تفعيل»، اعرض واجهة الانتظار فقط كما طُلب سابقًا. */
  if(accessBusy || locationStatus === "requesting"){
    return `<div class="empty" style="margin:48px auto;text-align:center">يرجى الانتظار</div>`;
  }

  const pp = notificationPermission();
  const title = "تفعيل الاشعارات والموقع";

  const detail = locationStatus === "denied"
    ? "اسمح للمكتبة بالوصول إلى الموقع من إعدادات المتصفح، ثم اضغط «تفعيل» مجددًا. يمكنك رفض الإشعارات، لكن يلزم إذن الموقع لتسجيل آخر موقع دخول."
    : locationStatus === "error"
    ? esc(locationError || "تأكد من تشغيل خدمة الموقع والاتصال بالإنترنت، ثم أعد المحاولة.")
    : "تفعيل لوصول إشعارات المحاضرات";

  const pstatus = pp === "granted"
    ? "الإشعارات: مفعّلة ✓"
    : pp === "denied"
    ? "الإشعارات: محظورة من إعدادات المتصفح"
    : pp === "unsupported"
    ? "الإشعارات غير مدعومة في هذا المتصفح"
    : "الإشعارات: بانتظار الإذن";

  return `<div class="panel" style="max-width:560px;margin:24px auto;text-align:center"><h2>🔔📍 ${title}</h2><p>${detail}</p><p class="hint">${pstatus}</p><p><button class="btn" data-act="activateaccess">تفعيل</button></p></div>`;
}

async function ensureStudentLocation(){
  // لا نطلب الموقع من المالك أو مشرف المحتوى.
  if(!session || isAdmin || isContentManager || roleErr || adminErr || !me){
    locationStatus = "idle";
    return true;
  }

  locationError = "";

  try{
    if(navigator.permissions && navigator.permissions.query){
      const perm = await navigator.permissions.query({name:"geolocation"});

      if(perm.state === "granted") return captureStudentLocation();

      locationStatus = perm.state === "denied" ? "denied" : "needs-permission";
    } else {
      locationStatus = "needs-permission";
    }
  }catch(_){
    locationStatus = "needs-permission";
  }

  render();
  return false;
}

async function activateStudentAccess(){
  // هذه الوظيفة خاصة بحسابات الطلاب فقط.
  if(!session || isAdmin || isContentManager || roleErr || adminErr || !me || accessBusy) return;

  try{
    localStorage.removeItem("lib_push_later");
  }catch(_){}

  accessBusy = true;
  render();

  /* يبدأ طلب الإشعارات والموقع من ضغط المستخدم نفسه. */
  const pushTask = enablePush(true);
  const locationTask = captureStudentLocation();

  await Promise.allSettled([pushTask, locationTask]);

  accessBusy = false;
  render();
}

function requestStudentLocation(){
  return activateStudentAccess();
}

function captureStudentLocation(){
  if(!navigator.geolocation){
    locationStatus = "error";
    locationError = "هذا المتصفح لا يدعم تحديد الموقع. افتح المكتبة في متصفح حديث مع تفعيل الموقع.";
    render();
    return Promise.resolve(false);
  }

  locationStatus = "requesting";
  locationError = "";
  render();

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(async pos => {
      try{
        const coords = pos.coords;

        const r = await sb.rpc("save_student_location", {
          p_latitude:coords.latitude,
          p_longitude:coords.longitude,
          p_accuracy_m:Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
          p_captured_at:new Date().toISOString()
        });

        if(r.error) throw r.error;

        locationStatus = "ok";
        locationError = "";
        render();
        resolve(true);
      }catch(e){
        locationStatus = "error";
        locationError = "تعذر حفظ الموقع في قاعدة البيانات. تحقق من إعداد جدول student_locations وصلاحياته.";
        render();
        resolve(false);
      }
    }, err => {
      locationStatus = err && err.code === 1 ? "denied" : "error";

      locationError = err && err.code === 2
        ? "تعذر تحديد الموقع. فعّل خدمة الموقع في الجهاز وتأكد من اتصالك بالإنترنت."
        : err && err.code === 3
        ? "انتهت مهلة تحديد الموقع. تأكد من تشغيل خدمة الموقع ثم أعد المحاولة."
        : "لم يتم منح إذن الموقع. اسمح للموقع من إعدادات المتصفح ثم أعد المحاولة.";

      render();
      resolve(false);
    }, {enableHighAccuracy:true, timeout:15000, maximumAge:0});
  });
}

/* ---------- الإشعارات الداخلية ---------- */
async function loadNotifs(){
  if(!me) return;

  const [a,b] = await Promise.all([
    sb.from("notifications").select("*").gte("created_at", me.created_at).order("created_at",{ascending:false}).limit(60),
    sb.from("notification_reads").select("notification_id")
  ]);

  notifs = a.data || [];
  reads = new Set((b.data || []).map(x => x.notification_id));
}

const notifOk = n => !me
  || (n.type === "content" ? me.notify_content
  : n.type === "announcement" ? me.notify_announcements
  : n.type === "message" ? me.notify_messages
  : true);

const unreadCount = () => notifs.filter(n => notifOk(n) && !reads.has(n.id)).length;

async function markRead(ids){
  ids = ids.filter(i => !reads.has(i));
  if(!ids.length || !me) return;

  ids.forEach(i => reads.add(i));

  await sb.from("notification_reads").upsert(
    ids.map(i => ({user_id:me.user_id, notification_id:i})),
    {onConflict:"user_id,notification_id", ignoreDuplicates:true}
  );
}

/* ---------- الحسابات ---------- */
const toEmail = u => String(u).trim().toLowerCase() + "@" + EMAIL_DOMAIN;

async function fn(name, body){
  const r = await sb.functions.invoke(name, {body});

  if(!r.error) return {data:r.data};

  let msg = "تعذر الاتصال بالخادم. حاول مرة أخرى.";

  try{
    const j = await r.error.context.json();
    if(j && j.error) msg = j.error;
  }catch(_){}

  return {err:msg};
}

async function doLogin(){
  const u = $("#a-user").value.trim(), p = $("#a-pass").value;

  if(!u || !p) return toast("اكتب اسم المستخدم وكلمة المرور.","err");

  const {error} = await sb.auth.signInWithPassword({
    email:toEmail(u),
    password:p
  });

  if(error) toast("اسم المستخدم أو كلمة المرور غير صحيحة.","err");
  else toast("تم تسجيل الدخول.");
}

async function doRegister(){
  const name = $("#a-name").value.trim(),
        u = $("#a-user").value.trim(),
        p = $("#a-pass").value,
        p2 = $("#a-pass2").value;

  if(!name) return toast("اكتب اسمك.","err");

  if(!/^[A-Za-z0-9_.-]{3,32}$/.test(u)){
    return toast("اسم المستخدم: من 3 إلى 32 حرفًا إنجليزيًا أو أرقامًا أو . _ -","err");
  }

  if(p.length < 10) return toast("كلمة المرور 10 أحرف على الأقل.","err");
  if(p !== p2) return toast("كلمتا المرور غير متطابقتين.","err");

  busy = true;
  render();

  const r = await fn("student-accounts", {
    action:"register",
    username:u,
    password:p,
    display_name:name
  });

  if(r.err){
    busy = false;
    render();
    return toast(r.err,"err");
  }

  pendingCode = r.data.recovery_code || null;

  const s = await sb.auth.signInWithPassword({
    email:r.data.login_email || toEmail(u),
    password:p
  });

  busy = false;
  render();

  if(s.error) toast("تم إنشاء الحساب. سجّل الدخول من تبويب الدخول.","err");
}

async function doRecover(){
  const u = $("#a-user").value.trim(),
        c = $("#a-code").value.trim().toLowerCase(),
        p = $("#a-pass").value,
        p2 = $("#a-pass2").value;

  if(!u || !/^[a-f0-9]{64}$/.test(c)){
    return toast("اكتب اسم المستخدم ورمز الاستعادة كاملًا (64 حرفًا).","err");
  }

  if(p.length < 10) return toast("كلمة المرور الجديدة 10 أحرف على الأقل.","err");
  if(p !== p2) return toast("كلمتا المرور غير متطابقتين.","err");

  busy = true;
  render();

  const r = await fn("student-accounts", {
    action:"recover",
    username:u,
    recovery_code:c,
    new_password:p
  });

  busy = false;

  if(r.err){
    render();
    return toast(r.err,"err");
  }

  authTab = "login";
  pendingCode = r.data.recovery_code || null;
  render();

  toast(r.data.message || "تم تغيير كلمة المرور.");
}

async function doLogout(){
  await sb.auth.signOut();
}

/* ---------- متابعة الدراسة ---------- */
async function setProg(id, patch, quiet){
  if(!me) return;

  const cur = pg(id), next = {...cur, ...patch}, now = new Date().toISOString();

  const row = {
    user_id:me.user_id,
    lecture_id:id,
    completed:!!next.completed,
    favorite:!!next.favorite,
    saved:!!next.saved,
    updated_at:now
  };

  if(patch.last_opened_at) row.last_opened_at = patch.last_opened_at;

  prog.set(id, {
    ...next,
    user_id:me.user_id,
    lecture_id:id,
    updated_at:now
  });

  if(!quiet) render();

  const r = await sb.from("study_progress").upsert(row, {
    onConflict:"user_id,lecture_id"
  });

  if(r.error){
    prog.set(id, cur);
    if(!quiet) render();
    toast("تعذر الحفظ: " + r.error.message, "err");
  }
}

function lastLecture(){
  let best = null;

  prog.forEach(r => {
    if(r.last_opened_at && (!best || r.last_opened_at > best.last_opened_at)){
      best = r;
    }
  });

  return best ? (lectures.find(l => l.id === best.lecture_id) || null) : null;
}

function filtered(){
  return lectures.filter(l =>
    (filter === "all" || l.subject_id === filter) &&
    (!fKind || l.kind === fKind) &&
    (!fSem || l.semester === fSem) &&
    (!fDone || (fDone === "done" ? pg(l.id).completed : !pg(l.id).completed)) &&
    (!q || norm(l.title).includes(norm(q)) || norm(l.description).includes(norm(q)))
  );
}

function nextClass(){
  if(!sched.length) return null;

  const now = new Date(),
        nowMin = now.getHours()*60 + now.getMinutes(),
        today = now.getDay();

  let best = null, bestDelta = 1e9;

  for(const x of sched){
    const [h,m] = String(x.start_time).split(":").map(Number);

    let delta = ((x.day_of_week - today + 7) % 7)*1440 + (h*60 + m) - nowMin;

    if(delta < 0) delta += 7*1440;

    if(delta < bestDelta){
      best = x;
      bestDelta = delta;
    }
  }

  return best ? {item:best, delta:bestDelta} : null;
}

/* ---------- الملاحظات الشخصية ---------- */
let noteTimer = null, noteDirtyFlag = false, curNoteId = null;

const setNoteStatus = t => {
  const e = $("#n-status");
  if(e) e.textContent = t;
};

function noteChanged(){
  noteDirtyFlag = true;
  setNoteStatus("…");
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, 800);
}

async function saveNote(){
  clearTimeout(noteTimer);

  if(!noteDirtyFlag) return;

  const id = curNoteId,
        n = notes.find(x => x.id === id),
        t = $("#n-title");

  if(!n || !t) return;

  const payload = {
    title:t.value.slice(0,200),
    body:$("#n-body").value,
    subject_id:$("#n-subj").value || null,
    lecture_id:$("#n-lec").value || null
  };

  noteDirtyFlag = false;
  setNoteStatus("جارٍ الحفظ…");

  const r = await sb.from("notes").update(payload).eq("id", id).select().single();

  if(r.error){
    noteDirtyFlag = true;
    setNoteStatus("تعذر الحفظ، سنعيد المحاولة…");
    noteTimer = setTimeout(saveNote, 3000);
    return;
  }

  Object.assign(n, r.data);
  setNoteStatus("تم الحفظ ✓");
}

async function newNote(lec){
  if(!me) return;

  const row = {
    user_id:me.user_id,
    title:lec ? lec.title.slice(0,200) : "",
    body:"",
    subject_id:lec ? lec.subject_id : null,
    lecture_id:lec ? lec.id : null
  };

  const r = await sb.from("notes").insert(row).select().single();

  if(r.error) return toast("تعذر إنشاء الملاحظة: " + r.error.message, "err");

  notes.unshift(r.data);
  location.hash = "#/note/" + r.data.id;
}

function lecNote(id){
  const n = notes.find(x => x.lecture_id === id);

  if(n){
    location.hash = "#/note/" + n.id;
    return;
  }

  const l = lectures.find(x => x.id === id);
  if(l) newNote(l);
}

async function delNote(id){
  if(!confirm("حذف هذه الملاحظة نهائيًا؟")) return;

  const r = await sb.from("notes").delete().eq("id", id);

  if(r.error) return toast("تعذر الحذف: " + r.error.message, "err");

  notes = notes.filter(x => x.id !== id);
  noteDirtyFlag = false;

  toast("تم حذف الملاحظة.");
  location.hash = "#/notes";
}

/* ---------- الإشعارات الخارجية (Push) ---------- */
const b64u = s => {
  const p = "=".repeat((4 - s.length%4)%4),
        r = atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));

  return Uint8Array.from([...r].map(c => c.charCodeAt(0)));
};

async function enablePush(silent=false){
  try{
    if(!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)){
      if(!silent) toast("هذا المتصفح لا يدعم الإشعارات.","err");
      return false;
    }

    const perm = await Notification.requestPermission();

    if(perm !== "granted"){
      if(!silent) toast("لم يتم السماح بالإشعارات.","err");
      render();
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const expectedKey = b64u(VAPID_PUBLIC);
    let sub = await reg.pushManager.getSubscription();

    // إذا كانت هناك اشتراكة بمفتاح قديم، أعد إنشاءها حتى تطابق مفاتيح المرحلة الأولى.
    if(sub){
      const currentKey = sub.options && sub.options.applicationServerKey;
      const sameKey = !!currentKey && currentKey.byteLength === expectedKey.byteLength &&
        expectedKey.every((v, i) => v === new Uint8Array(currentKey)[i]);
      if(!sameKey){
        await sub.unsubscribe();
        sub = null;
      }
    }

    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:expectedKey
      });
    }

    const j = sub.toJSON();
    if(!j.endpoint || !j.keys || !j.keys.p256dh || !j.keys.auth) throw new Error("بيانات الاشتراك غير مكتملة.");

    const saved = await fn("save-push-subscription", {
      endpoint:j.endpoint,
      p256dh:j.keys.p256dh,
      auth:j.keys.auth
    });
    if(saved.err) throw new Error(saved.err);

    if(!silent) toast("تم تفعيل الإشعارات.");

    render();
    return true;
  }catch(e){
    if(!silent) toast("تعذر تفعيل الإشعارات: " + (e.message || e), "err");
    return false;
  }
                         }
