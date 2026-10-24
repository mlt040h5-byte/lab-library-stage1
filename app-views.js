/* ===== واجهات الطالب ===== */
function authView(){
  const tabs = `<div class="tabs"><button class="tab ${authTab==="login"?"on":""}" data-act="tab" data-id="login">دخول</button><button class="tab ${authTab==="register"?"on":""}" data-act="tab" data-id="register">حساب جديد</button></div>`;
  const show = `<label style="font-weight:400"><input type="checkbox" id="showpw" style="width:auto"> إظهار كلمة المرور</label>`;
  const user = `<label>اسم المستخدم (بالإنجليزية)</label><input id="a-user" dir="ltr" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false">`;
  const pw = (id, lab, ac) => `<label>${lab}</label><input id="${id}" type="password" dir="ltr" autocomplete="${ac}">`;
  let f;
  if(authTab === "register") f = `<label>الاسم</label><input id="a-name" maxlength="60" autocomplete="name">${user}${pw("a-pass","كلمة المرور (10 أحرف على الأقل)","new-password")}${pw("a-pass2","تأكيد كلمة المرور","new-password")}${show}<p><button class="btn" data-act="register" ${busy?"disabled":""}>${busy?"جارٍ الإنشاء…":"إنشاء الحساب"}</button></p>`;
  else if(authTab === "recover") f = `<h3>استعادة الحساب</h3><p class="hint">اكتب رمز الاستعادة الذي ظهر لك عند إنشاء الحساب.</p>${user}<label>رمز الاستعادة</label><input id="a-code" dir="ltr" autocapitalize="none" spellcheck="false">${pw("a-pass","كلمة المرور الجديدة (10 أحرف على الأقل)","new-password")}${pw("a-pass2","تأكيد كلمة المرور","new-password")}${show}<p><button class="btn" data-act="recover" ${busy?"disabled":""}>تغيير كلمة المرور</button> <button class="btn sec" data-act="tab" data-id="login">رجوع</button></p>`;
  else f = `${user}${pw("a-pass","كلمة المرور","current-password")}${show}<p><button class="btn" data-act="login">دخول</button></p><p><a href="#" data-act="tab" data-id="recover">نسيت كلمة المرور؟</a></p>`;
  return `<div class="panel"><h2>👋 أهلًا بك في المكتبة</h2>${authTab==="recover"?"":tabs}${f}</div>`;
}
function codeView(){
  return `<div class="panel"><h2>🔑 رمز الاستعادة</h2>
   <p>احفظ هذا الرمز في مكان آمن (لقطة شاشة أو ملاحظات). تحتاجه لاستعادة حسابك إن نسيت كلمة المرور، ولن يظهر مرة أخرى.</p>
   <div class="code">${esc(pendingCode)}</div>
   <p><button class="btn sec" data-act="copycode">نسخ الرمز</button></p>
   <label style="font-weight:400"><input type="checkbox" id="codeok" style="width:auto"> حفظتُ الرمز في مكان آمن</label>
   <p><button class="btn" data-act="codedone">متابعة</button></p></div>`;
}
const loadingView = () => `<div class="empty">جارٍ التحميل…</div>`;
const incompleteView = () => `<div class="panel"><h2>حسابك غير مكتمل</h2><p>تعذر العثور على ملفك الشخصي. سجّل الخروج وأنشئ حسابًا جديدًا، أو تواصل مع إدارة المكتبة.</p><button class="btn sec" data-act="logout">تسجيل الخروج</button></div>`;

function pushCard(){
  try{
    if(!me || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "";
    if(Notification.permission !== "default" || localStorage.getItem("lib_push_later")) return "";
  }catch(_){ return ""; }
  return `<div class="ann"><span>🔔 فعّل إشعارات الهاتف لتصلك المحاضرات والإعلانات الجديدة</span><button class="btn sm" data-act="enablepush">تفعيل</button><button class="btn sec sm" data-act="pushlater">لاحقًا</button></div>`;
}
const pinnedBlock = () => anns.filter(a => a.active && a.pinned).slice(0,2).map(a => `<div class="ann"><span>📌 ${esc(a.message)}</span></div>`).join("");
function banner(){
  const a = anns.find(x => x.active && !x.pinned); if(!a) return "";
  let seen = ""; try{ seen = localStorage.getItem("lib_ann_seen") || ""; }catch(_){}
  if(seen === String(a.id)) return "";
  return `<div class="ann"><span>📢 ${esc(a.message)}</span><button class="btn sec sm" data-act="annclose" data-id="${a.id}">حسنًا</button></div>`;
}
function nextBlock(){
  const n = nextClass(); if(!n) return "";
  const x = n.item, s = subj(x.subject_id), today = new Date().getDay();
  const dl = (x.day_of_week === today && n.delta < 1440) ? "اليوم" : (x.day_of_week === (today+1)%7 && n.delta < 2880) ? "غدًا" : DAYS[x.day_of_week];
  return `<a href="#/schedule" class="ann" style="text-decoration:none"><span>🗓 المحاضرة القادمة: <b>${s?esc(s.name_ar):""}</b> (${KIND_AR[x.kind]||""}) — ${dl} ${hhmm(x.start_time)}${x.room?" · القاعة "+esc(x.room):""}</span></a>`;
}
function searchBlock(subjChips){
  const hasKind = lectures.some(l => l.kind), hasSem = lectures.some(l => l.semester);
  const opt = (arr, v) => arr.map(x => `<option ${v===x?"selected":""}>${x}</option>`).join("");
  return `<div class="bar"><input id="q" type="search" placeholder="🔎 ابحث عن محاضرة أو مادة…" value="${esc(q)}"></div>
  ${subjChips ? `<div class="chips"><span class="chipb ${filter==="all"?"on":""}" data-act="chip" data-id="all">كل المواد</span>${subjects.map(s => `<span class="chipb ${filter===s.id?"on":""}" data-act="chip" data-id="${esc(s.id)}">${esc(s.name_ar)}</span>`).join("")}</div>` : ""}
  ${(hasKind||hasSem) ? `<div class="bar">${hasKind?`<select id="f-kind" style="flex:1"><option value="">كل الأنواع</option>${opt(LEC_KINDS,fKind)}</select>`:""}${hasSem?`<select id="f-sem" style="flex:1"><option value="">كل الفصول</option>${opt(SEMS,fSem)}</select>`:""}</div>` : ""}`;
}
function lecCard(l, admin){
  const s = subj(l.subject_id), st = pg(l.id), isNew = Date.now() - new Date(l.created_at).getTime() < 7*86400000;
  const meta = [s?esc(s.icon+" "+s.name_ar):"", l.kind?esc(l.kind):"", l.semester?"الفصل "+esc(l.semester):"", "أضيفت "+fmtDate(l.created_at), l.file_size?fmtSize(l.file_size):""].filter(Boolean).join(" · ");
  const tb = (k, label) => `<button class="chipb ${st[k]?"on":""}" data-act="tog" data-k="${k}" data-id="${l.id}">${label}</button>`;
  return `<div class="lec ${me&&st.completed?"done":""}"><h3>${esc(l.title)}${isNew?'<span class="new">جديد</span>':''}</h3>
  <div class="m">${meta}</div>${l.description?`<p>${esc(l.description)}</p>`:""}
  <div class="acts"><button class="btn sm" data-act="read" data-id="${l.id}">📖 قراءة</button><a class="btn sec sm" href="${fileUrl(l.file_path,true)}" download>⬇ تنزيل</a><button class="btn sec sm" data-act="sharemenu" data-id="${l.id}">↗ مشاركة</button>
  ${me?`${tb("completed","✓ مكتملة")}${tb("favorite","★ مفضلة")}${tb("saved","🔖 للمراجعة")}<button class="chipb" data-act="lecnote" data-id="${l.id}">📝 ملاحظة</button>`:""}
  ${admin?`<button class="btn sec sm" data-act="edit" data-id="${l.id}">✏ تعديل</button><button class="btn del sm" data-act="del" data-id="${l.id}">🗑 حذف</button>`:""}</div></div>`;
}
function subjectCard(s){
  const ls = lectures.filter(l => l.subject_id === s.id), d = ls.filter(l => pg(l.id).completed).length;
  return `<a class="sub" href="#/s/${esc(s.id)}"><span class="ic">${esc(s.icon)}</span><b>${esc(s.name_ar)}</b><small>${esc(s.name_en)}</small><div class="n">${ls.length} محاضرة${me?` · ${d} مكتملة`:""}</div>${me&&ls.length?`<div class="pbar"><i style="width:${pct(d,ls.length)}%"></i></div>`:""}</a>`;
}
function publicRankingBlock(){
  if(!publicRanking || !publicRanking.published) return "";
  const list = (publicRanking.students || []).slice(0,10);
  return `<div class="panel"><h3>🏆 التصنيف الدراسي للطلاب</h3><p class="hint">يعتمد الترتيب على متوسط درجات الاختبارات وإكمال المحاضرات بالتساوي.</p>
  ${list.length ? list.map((x,i) => `<div class="row"><b>${i+1}. ${esc(x.display_name || "طالب")}</b><span class="hint">النتيجة ${Number(x.overall_score||0).toFixed(1)}% · الاختبارات ${Number(x.quiz_percent||0).toFixed(1)}% · المحاضرات ${Number(x.completion_percent||0).toFixed(1)}%</span></div>`).join("") : `<p class="hint">لا توجد بيانات كافية لعرض التصنيف بعد.</p>`}</div>`;
}
function homeView(){
  const searching = q || filter !== "all" || fKind || fSem;
  let h = nextBlock() + pinnedBlock() + banner() + publicRankingBlock() + pushCard() + `<h2>المكتبة</h2>${searchBlock(true)}`;
  if(searching){
    const subs = q ? subjects.filter(s => norm(s.name_ar).includes(norm(q)) || norm(s.name_en).includes(norm(q))) : [];
    if(subs.length) h += `<div class="chips">${subs.map(s => `<a class="chipb" href="#/s/${esc(s.id)}">${esc(s.icon)} ${esc(s.name_ar)}</a>`).join("")}</div>`;
    const r = filtered();
    h += r.length ? r.map(l => lecCard(l)).join("") : `<div class="empty">لا توجد محاضرات مطابقة.</div>`;
  } else {
    h += `<div class="grid">${subjects.map(subjectCard).join("")}</div>`;
    const recent = lectures.slice(0,5);
    if(recent.length) h += `<h3>آخر المحاضرات المضافة</h3>${recent.map(l => lecCard(l)).join("")}`;
  }
  return h;
}
function subjectView(id){
  const s = subj(id); if(!s) return `<div class="empty">المادة غير موجودة.</div>`;
  const all = lectures.filter(l => l.subject_id === id), done = all.filter(l => pg(l.id).completed).length;
  const r = all.filter(l => (!fKind||l.kind===fKind) && (!fSem||l.semester===fSem) && (!fDone||(fDone==="done"?pg(l.id).completed:!pg(l.id).completed)) && (!q||norm(l.title).includes(norm(q))));
  const dchip = (v, t) => `<span class="chipb ${fDone===v?"on":""}" data-act="done" data-id="${v}">${t}</span>`;
  return `${banner()}<p class="crumb"><a href="#/">← كل المواد</a></p><h2>${esc(s.icon)} ${esc(s.name_ar)}</h2><div class="hint" dir="ltr" style="text-align:right">${esc(s.name_en)}</div>
  ${me&&all.length?`<p class="hint">أنجزتَ ${done} من ${all.length} (${pct(done,all.length)}%)</p><div class="pbar"><i style="width:${pct(done,all.length)}%"></i></div>`:""}
  <div style="margin-top:12px">${searchBlock(false)}</div>
  ${me?`<div class="chips">${dchip("","الكل")}${dchip("done","المكتملة")}${dchip("todo","غير المكتملة")}</div>`:""}
  ${r.length ? r.map(l => lecCard(l)).join("") : `<div class="empty">${(q||fKind||fSem||fDone)?"لا توجد نتائج مطابقة.":"لا توجد محاضرات في هذه المادة حتى الآن."}</div>`}`;
}
function dashView(){
  const total = lectures.length, done = lectures.filter(l => pg(l.id).completed).length;
  const rows = [...prog.values()], fav = rows.filter(r => r.favorite).length, sav = rows.filter(r => r.saved).length;
  const week = rows.filter(r => Date.now() - new Date(r.updated_at||0).getTime() < 7*86400000).length;
  const last = lastLecture();
  const tabs = [["saved","🔖 للمراجعة"],["favorite","★ المفضلة"],["completed","✓ المكتملة"]];
  const list = lectures.filter(l => pg(l.id)[dashTab]).sort((a,b) => new Date(pg(b.id).updated_at||0) - new Date(pg(a.id).updated_at||0));
  const bars = subjects.map(s => {
    const ls = lectures.filter(l => l.subject_id === s.id), d = ls.filter(l => pg(l.id).completed).length;
    return `<a href="#/s/${esc(s.id)}" style="text-decoration:none;color:inherit;display:block;margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(s.icon)} ${esc(s.name_ar)}</span><span class="hint">${ls.length?`${d}/${ls.length} (${pct(d,ls.length)}%)`:"لا محاضرات"}</span></div><div class="pbar"><i style="width:${pct(d,ls.length)}%"></i></div></a>`;
  }).join("");
  return `<h2>📊 متابعتي الدراسية</h2>
  <div class="panel"><h3>الإنجاز الكلي: ${pct(done,total)}%</h3><div class="pbar"><i style="width:${pct(done,total)}%"></i></div><p class="hint">أكملتَ ${done} من ${total} محاضرة</p></div>
  ${last?`<div class="panel"><h3>تابع من حيث توقفت</h3><p>${esc(last.title)}</p><button class="btn" data-act="read" data-id="${last.id}">📖 متابعة القراءة</button></div>`:""}
  <div class="stats"><div class="stat"><b>${done}</b>مكتملة</div><div class="stat"><b>${Math.max(0,total-done)}</b>متبقية</div><div class="stat"><b>${sav}</b>للمراجعة</div><div class="stat"><b>${fav}</b>مفضلة</div><div class="stat"><b>${notes.length}</b>ملاحظاتي</div><div class="stat"><b>${week}</b>نشاط آخر 7 أيام</div></div>
  <div class="panel"><h3>التقدم حسب المادة</h3>${bars||'<p class="hint">لا توجد مواد.</p>'}</div>
  <div class="tabs">${tabs.map(([k,t]) => `<button class="tab ${dashTab===k?"on":""}" data-act="dtab" data-id="${k}">${t}</button>`).join("")}</div>
  ${list.length ? list.map(l => lecCard(l)).join("") : `<div class="empty">لا توجد محاضرات في هذه القائمة.</div>`}
  ${quizStatsBlock()}<p><a class="btn" href="#/quizzes">📝 الاختبارات</a> <a class="btn sec" href="#/notes">📝 ملاحظاتي (${notes.length})</a></p>`;
}
function notesView(){
  const list = notes.filter(n => !nq || norm(n.title).includes(norm(nq)) || norm(n.body).includes(norm(nq)));
  return `<h2>📝 ملاحظاتي</h2><div class="bar"><input id="nq" type="search" placeholder="🔎 ابحث في ملاحظاتي…" value="${esc(nq)}"></div>
  <p><button class="btn" data-act="newnote">+ ملاحظة جديدة</button></p>
  ${list.length ? list.map(n => { const s = subj(n.subject_id), l = lectures.find(x => x.id === n.lecture_id);
    return `<a href="#/note/${n.id}" class="lec" style="display:block;text-decoration:none;color:inherit"><h3>${esc(n.title||"بدون عنوان")}</h3><div class="m">${[s?esc(s.name_ar):"", l?esc(l.title):"", fmtDT(n.updated_at)].filter(Boolean).join(" · ")}</div><p>${esc((n.body||"").slice(0,90))}</p></a>`; }).join("") : `<div class="empty">${nq?"لا توجد نتائج.":"لا توجد ملاحظات بعد."}</div>`}
  <p class="hint">ملاحظاتك خاصة بك فقط، وتجدها من أي جهاز تسجل الدخول منه.</p>`;
}
function noteView(id){
  const n = notes.find(x => x.id === id);
  if(!n) return `<div class="empty">الملاحظة غير موجودة.</div><p><a class="btn" href="#/notes">ملاحظاتي</a></p>`;
  const lecs = lectures.filter(l => !n.subject_id || l.subject_id === n.subject_id);
  return `<p class="crumb"><a href="#/notes">← ملاحظاتي</a> <span id="n-status" class="hint"></span></p>
  <div class="panel"><input id="n-title" maxlength="200" placeholder="عنوان الملاحظة" value="${esc(n.title)}">
   <label>المادة</label><select id="n-subj"><option value="">— بدون —</option>${subjects.map(s => `<option value="${esc(s.id)}" ${n.subject_id===s.id?"selected":""}>${esc(s.name_ar)}</option>`).join("")}</select>
   <label>المحاضرة</label><select id="n-lec"><option value="">— بدون —</option>${lecs.map(l => `<option value="${l.id}" ${n.lecture_id===l.id?"selected":""}>${esc(l.title)}</option>`).join("")}</select>
   <label>النص (يُحفظ تلقائيًا)</label><textarea id="n-body" rows="12" maxlength="20000">${esc(n.body)}</textarea>
   <p><button class="btn del" data-act="notedel" data-id="${n.id}">🗑 حذف الملاحظة</button></p></div>`;
}
function scheduleView(){
  const today = new Date().getDay();
  const days = DAY_ORDER.map(d => {
    const items = sched.filter(x => x.day_of_week === d).sort((a,b) => String(a.start_time).localeCompare(String(b.start_time)));
    if(!items.length) return "";
    return `<div class="panel ${d===today?"today":""}"><h3>${DAYS[d]}${d===today?' <span class="new">اليوم</span>':''}</h3>${items.map(x => { const s = subj(x.subject_id);
      return `<div class="row"><b>${hhmm(x.start_time)} – ${hhmm(x.end_time)}</b> ${s?esc(s.icon+" "+s.name_ar):""} <span class="chipb">${KIND_AR[x.kind]||""}</span>${x.room?` · القاعة ${esc(x.room)}`:""}${x.group_name?` · ${esc(x.group_name)}`:""}</div>`; }).join("")}</div>`;
  }).join("");
  return `<h2>🗓 الجدول الدراسي</h2>${nextBlock()}${days || '<div class="empty">لم يُضَف الجدول الدراسي بعد.</div>'}`;
}
function newsView(){
  const list = anns.filter(a => a.active).sort((a,b) => ((b.pinned?1:0) - (a.pinned?1:0)) || (new Date(b.created_at) - new Date(a.created_at)));
  return `<h2>📢 الإعلانات والأخبار</h2>${list.length ? list.map(a => `<div class="lec ${a.pinned?"today":""}"><p style="margin:0;color:var(--ink)">${a.pinned?"📌 ":""}${esc(a.message)}</p><div class="m">${fmtDate(a.created_at)}</div></div>`).join("") : '<div class="empty">لا توجد إعلانات.</div>'}`;
}
function notifsView(){
  const list = notifs.filter(notifOk), icon = t => ({content:"📚", announcement:"📢", schedule:"🗓", message:"💬", share:"🔗"}[t] || "🔔");
  return `<h2>🔔 الإشعارات</h2>${list.length ? `<p><button class="btn sec sm" data-act="readall">تعليم الكل كمقروء</button></p>` : ""}
  ${list.length ? list.map(n => `<div class="lec ${reads.has(n.id)?"":"unread"}" data-act="opennotif" data-id="${n.id}" style="cursor:pointer"><h3>${icon(n.type)} ${esc(n.title)}</h3>${n.body?`<p>${esc(n.body)}</p>`:""}<div class="m">${fmtDT(n.created_at)}</div></div>`).join("") : '<div class="empty">لا توجد إشعارات.</div>'}`;
}
function profileView(){
  const rows = [...prog.values()], done = rows.filter(r => r.completed).length, fav = rows.filter(r => r.favorite).length, sav = rows.filter(r => r.saved).length;
  const acts = rows.filter(r => r.updated_at || r.last_opened_at).map(r => ({r, t:new Date(Math.max(new Date(r.updated_at||0), new Date(r.last_opened_at||0)))})).sort((a,b) => b.t - a.t).slice(0,12);
  const ps = ("Notification" in window) ? Notification.permission : "unsupported";
  const chk = (k, label) => `<label style="font-weight:400"><input type="checkbox" class="pn" data-k="${k}" style="width:auto" ${me[k]?"checked":""}> ${label}</label>`;
  return `<h2>👤 حسابي</h2>
  <div class="panel"><h3>${esc(me.display_name)}</h3><p class="hint" dir="ltr" style="text-align:right">@${esc(me.username)}</p>
   <div class="stats"><div class="stat"><b>${done}</b>مكتملة</div><div class="stat"><b>${sav}</b>للمراجعة</div><div class="stat"><b>${fav}</b>مفضلة</div><div class="stat"><b>${notes.length}</b>ملاحظات</div></div></div>
  <div class="panel"><h3>الاسم الظاهر</h3><input id="p-name" maxlength="60" value="${esc(me.display_name)}"><p><button class="btn sm" data-act="savename">حفظ الاسم</button></p></div>
  <div class="panel"><h3>الإشعارات</h3>${chk("notify_content","المحاضرات والملفات الجديدة")}${chk("notify_announcements","الإعلانات")}${chk("notify_messages","الرسائل")}
   ${ps==="granted"?'<p class="hint">إشعارات الهاتف مفعّلة ✓</p>':ps==="denied"?'<p class="hint">إشعارات الهاتف محظورة من إعدادات المتصفح.</p>':ps==="default"?'<p><button class="btn sm" data-act="enablepush">تفعيل إشعارات الهاتف</button></p>':''}</div>
  <div class="panel"><h3>تغيير كلمة المرور</h3><label>كلمة المرور الجديدة (10 أحرف على الأقل)</label><input id="p-pass" type="password" dir="ltr" autocomplete="new-password"><label>تأكيد كلمة المرور</label><input id="p-pass2" type="password" dir="ltr" autocomplete="new-password"><p><button class="btn sm" data-act="savepass">تغيير</button></p></div>
  <div class="panel"><h3>سجل النشاط</h3>${acts.length ? acts.map(({r,t}) => { const l = lectures.find(x => x.id === r.lecture_id); if(!l) return "";
    const tags = [r.completed?"✓ مكتملة":"", r.favorite?"★ مفضلة":"", r.saved?"🔖 للمراجعة":"", r.last_opened_at?"📖 فُتحت":""].filter(Boolean).join(" · ");
    return `<div class="row"><b>${esc(l.title)}</b><div class="hint">${tags} · ${fmtDT(t)}</div></div>`; }).join("") : '<p class="hint">لا يوجد نشاط بعد.</p>'}</div>
  <p><button class="btn del" data-act="logout">تسجيل الخروج</button></p>`;
}
