/* ===== الاختبارات: محلّل النص الملصق + واجهة الطالب + إدارة الاختبارات ===== */
let quizzes = [], attempts = [], adminAttempts = [], qz = null, draft = [], qopen = null, qopenList = null;
let quizForm = {target:"", title:"", subject:"", pub:true, type:"mcq", text:""};

/* ---------- محلّل النص ---------- */
const normDigits = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const LBL = [["أ","ا","آ","a"],["ب","b"],["ج","c"],["د","d"],["ه","e"]];
const labelIndex = tok => { const t = String(tok || "").replace(/ـ/g,"").toLowerCase(); return LBL.findIndex(g => g.includes(t)); };
const OPT_RE = /^\s*[\(\[]?\s*([A-Ea-eأاآبجده])ـ*\s*[\)\]\.\-–—:：،]+\s*(.*\S)\s*$/;
const ANS_RE = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|Correct answer|Correct|Answer|Ans)\s*[:：\-–=]\s*(.+?)\s*$/i;
const EXP_RE = /^\s*(?:الشرح|التوضيح|التفسير|التعليل|Explanation|Reason)\s*[:：\-–]\s*(.+?)\s*$/i;
const MARK_END = /\s*(?:\*+|✓|✔|✅|☑)\s*$/, MARK_START = /^\s*(?:\*+|✓|✔|✅|☑)\s*/;

function takeMark(t){
  let c = false;
  if(MARK_END.test(t)){ t = t.replace(MARK_END,""); c = true; }
  if(MARK_START.test(t)){ t = t.replace(MARK_START,""); c = true; }
  return {t:t.trim(), c};
}

function stripNum(s){
  return String(s).replace(/^\s*(?:(?:السؤال|سؤال|س|Q|Question)\s*)?\d+\s*[\.\)\-–:：،]\s*/i,"")
    .replace(/^\s*(?:السؤال|سؤال)\s*[:：\-–]\s*/,"").trim();
}

function inlineOptions(line){
  const re = /(?:^|\s)[\(\[]?([A-Ea-eأاآبجده])ـ*\s*[\)\]]\s*/g, hits = []; let m;
  while((m = re.exec(line))) hits.push({idx:m.index, end:re.lastIndex, lab:m[1]});
  if(hits.length < 3 || labelIndex(hits[0].lab) !== 0) return null;
  for(let i = 1; i < hits.length; i++) if(labelIndex(hits[i].lab) !== i) return null;
  return {head:line.slice(0, hits[0].idx).trim(), opts:hits.map((h,i) => line.slice(h.end, i+1 < hits.length ? hits[i+1].idx : line.length).trim())};
}

function setAnswer(q, v){
  v = String(v || "").trim().replace(/[\.\،]+$/,"").replace(/^[\(\[]|[\)\]]$/g,"").trim();
  const t = v.replace(/ـ/g,""); let i = -1;
  if(/^[A-Ea-eأاآبجده]$/.test(t)) i = labelIndex(t);
  else if(/^[1-5]$/.test(t)) i = +t - 1;
  else {
    const mm = OPT_RE.exec(v); if(mm) i = labelIndex(mm[1]);
    if(i < 0 || i >= q.options.length){ const nv = norm(v); i = q.options.findIndex(o => norm(o) === nv); }
  }
  if(i >= 0 && i < q.options.length) q.correct = i;
}

function parseMcq(raw){
  const lines = normDigits(raw).replace(/\r/g,"").split("\n").map(s => s.trim()).filter(Boolean);
  const out = []; let cur = null, skipped = 0;
  const flush = () => { if(cur){ if(cur.text && cur.options.length >= 2) out.push(cur); else skipped++; } cur = null; };
  const startQ = t => { flush(); cur = {qtype:"mcq", text:t, options:[], correct:null, explanation:""}; };
  const addOpt = txt => { const m = takeMark(txt); if(!m.t) return; cur.options.push(m.t); if(m.c) cur.correct = cur.options.length - 1; };

  for(const line of lines){
    let m;
    if((m = ANS_RE.exec(line))){ if(cur) setAnswer(cur, m[1]); continue; }
    if((m = EXP_RE.exec(line))){ if(cur) cur.explanation = m[1]; continue; }
    const inl = inlineOptions(line);
    if(inl){
      if(inl.head){
        if(cur && cur.options.length === 0) cur.text += " " + inl.head; else startQ(stripNum(inl.head));
      } else if(!cur) continue;
      inl.opts.forEach(addOpt); continue;
    }
    const om = OPT_RE.exec(line);
    if(om && cur && labelIndex(om[1]) === cur.options.length){ addOpt(om[2]); continue; }
    if(cur && cur.options.length === 0){ cur.text += " " + line; continue; }
    startQ(stripNum(line));
  }
  flush();
  return {items:out, skipped};
}

const TRUE_W = ["صح","صحيحة","صحيح","true","t","✓","✔","✅"], FALSE_W = ["خطأ","خطا","خاطئة","خاطئ","غلط","false","f","✗","✘","✖","❌","×"];
const tfVal = w => { const x = String(w || "").trim().toLowerCase(); if(TRUE_W.includes(x)) return 0; if(FALSE_W.includes(x)) return 1; return null; };
const TF_ASK = /[\(\[]?\s*(?:صح\s*[\/،,\-]\s*خطأ|صح\s*أم\s*خطأ|صح\s*أو\s*خطأ|true\s*\/\s*false)\s*[\)\]]?\s*[\?؟:]?\s*$/i;
const TF_PAR = /[\(\[\{]\s*(صح|صحيحة|صحيح|خطأ|خطا|خاطئة|خاطئ|غلط|true|false|t|f|✓|✔|✅|✗|✘|✖|❌|×)\s*[\)\]\}]\s*[\.\،]?\s*$/i;
const TF_DASH = /\s*[\-–—:：]\s*(صح|صحيحة|صحيح|خطأ|خطا|خاطئة|غلط|true|false)\s*\.?\s*$/i;
const TF_SYM = /\s*(✓|✔|✅|✗|✘|✖|❌|×)\s*$/;
const TF_WORD = /\s(صح|خطأ|خطا|true|false)\s*\.?\s*$/i;
const TF_LEAD = /^\s*[\(\[]?\s*(صح|خطأ|خطا|✓|✔|✅|✗|✘|✖|❌)\s*[\)\]]?\s*[\-–—:：]\s*/;

function parseTf(raw){
  const lines = normDigits(raw).replace(/\r/g,"").split("\n").map(s => s.trim()).filter(Boolean);
  const out = []; let cur = null;

  for(const line of lines){
    let m;
    if((m = ANS_RE.exec(line))){ if(cur){ const v = tfVal(m[1].replace(/[\.\،\s]+$/,"")); if(v !== null) cur.correct = v; } continue; }
    if((m = EXP_RE.exec(line))){ if(cur) cur.explanation = m[1]; continue; }

    let t = stripNum(line).replace(TF_ASK,"").trim(), c = null, mm;
    if((mm = TF_PAR.exec(t))){ c = tfVal(mm[1]); t = t.slice(0, mm.index).trim(); }
    else if((mm = TF_DASH.exec(t))){ c = tfVal(mm[1]); t = t.slice(0, mm.index).trim(); }
    else if((mm = TF_SYM.exec(t))){ c = tfVal(mm[1]); t = t.slice(0, mm.index).trim(); }
    else if((mm = TF_WORD.exec(t))){ c = tfVal(mm[1]); t = t.slice(0, mm.index).trim(); }
    else if((mm = TF_LEAD.exec(t))){ c = tfVal(mm[1]); t = t.slice(mm[0].length).trim(); }

    t = t.replace(/[\s\-–:：]+$/,"").trim();
    if(!t) continue;
    cur = {qtype:"tf", text:t, options:["صح","خطأ"], correct:c, explanation:""};
    out.push(cur);
  }
  return {items:out, skipped:0};
}

/* ---------- تحميل ---------- */
async function loadQuizzes(){
  attempts = [];
  adminAttempts = [];

  try{
    const a = await sb.from("quizzes")
      .select("*, quiz_questions(count)")
      .order("created_at", {ascending:false});

    quizzes = (a.data || []).map(z => ({
      ...z,
      qn:(z.quiz_questions && z.quiz_questions[0] && z.quiz_questions[0].count) || 0
    }));

    if(isAdmin){
      const b = await sb.from("quiz_attempts").select("quiz_id,score,total");
      adminAttempts = b.data || [];
    } else if(me){
      const b = await sb.from("quiz_attempts")
        .select("*")
        .order("created_at", {ascending:false})
        .limit(300);
      attempts = b.data || [];
    }
  }catch(_){}
}

const bestPct = id => {
  const a = attempts.filter(x => x.quiz_id === id);
  return a.length ? Math.max(...a.map(x => pct(x.score, x.total))) : null;
};

function quizStatsBlock(){
  if(!me) return "";
  if(!attempts.length) return `<div class="panel"><h3>الاختبارات</h3><p class="hint">لم تُجرِ أي اختبار بعد. <a href="#/quizzes">ابدأ اختبارًا</a></p></div>`;
  const avg = pct(attempts.reduce((s,a) => s + a.score, 0), attempts.reduce((s,a) => s + a.total, 0));
  return `<div class="stats"><div class="stat"><b>${attempts.length}</b>اختبارات منجزة</div><div class="stat"><b>${avg}%</b>متوسط الدرجات</div></div>`;
}

/* ---------- واجهة الطالب ---------- */
function resultsBlock(){
  if(!attempts.length) return "";
  const bySub = {};
  attempts.forEach(a => {
    const z = quizzes.find(x => x.id === a.quiz_id);
    if(!z) return;
    const o = bySub[z.subject_id] || (bySub[z.subject_id] = {s:0, t:0, n:0});
    o.s += a.score; o.t += a.total; o.n++;
  });

  const rows = Object.entries(bySub)
    .map(([sid, o]) => ({sid, p:pct(o.s, o.t), n:o.n}))
    .sort((a,b) => a.p - b.p);

  const lab = p => p >= 80 ? "قوي 💪" : p >= 60 ? "جيد" : "يحتاج مراجعة 📚";
  const trend = attempts.slice(0, 8).reverse();
  const avg = pct(attempts.reduce((s,a) => s + a.score, 0), attempts.reduce((s,a) => s + a.total, 0));

  return `<div class="panel"><h3>📊 نتائجي</h3>
   <div class="stats"><div class="stat"><b>${attempts.length}</b>محاولة</div><div class="stat"><b>${avg}%</b>المتوسط العام</div></div>
   ${rows.map(r => {
     const s = subj(r.sid);
     return `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${s?esc(s.icon+" "+s.name_ar):""}</span><span class="hint">${r.p}% · ${lab(r.p)}${r.p < 60 ? ` · <a href="#/s/${esc(r.sid)}">راجع المحاضرات</a>` : ""}</span></div><div class="pbar"><i style="width:${r.p}%"></i></div></div>`;
   }).join("")}
   <h3>تطور مستواك (آخر ${trend.length} محاولات)</h3>
   <div style="display:flex;align-items:flex-end;gap:6px;height:90px">${trend.map(a => {
     const p = pct(a.score, a.total);
     return `<div style="flex:1;text-align:center;font-size:.7rem"><div style="height:${Math.max(4, p*0.7)}px;background:var(--brand);border-radius:6px 6px 0 0"></div>${p}%</div>`;
   }).join("")}</div></div>`;
}

function quizzesView(){
  const list = quizzes.filter(z => z.published);
  const groups = subjects.map(s => ({s, items:list.filter(z => z.subject_id === s.id)})).filter(g => g.items.length);

  return `<h2>📝 الاختبارات</h2>${resultsBlock()}
  ${groups.length ? groups.map(g => `<h3>${esc(g.s.icon)} ${esc(g.s.name_ar)}</h3>${g.items.map(z => {
    const b = bestPct(z.id);
    return `<div class="lec"><h3>${esc(z.title)}</h3><div class="m">${z.qn} سؤال · ${b === null ? "لم تُحاول بعد" : "أفضل نتيجة: " + b + "%"}</div><div class="acts"><a class="btn sm" href="#/quiz/${z.id}">${b === null ? "ابدأ الاختبار" : "أعد المحاولة"}</a></div></div>`;
  }).join("")}`).join("") : '<div class="empty">لا توجد اختبارات منشورة بعد.</div>'}`;
}

async function startQuiz(z){
  qz = {quiz:z, qs:[], i:0, ans:{}, done:false, loading:true, busy:false, saved:null, err:""};
  const mine = qz;
  const r = await sb.from("quiz_questions").select("*").eq("quiz_id", z.id).order("position");

  if(qz !== mine) return;

  qz.loading = false;
  if(r.error || !(r.data || []).length) qz.err = r.error ? "تعذر تحميل الأسئلة. تأكد من الاتصال." : "لا توجد أسئلة في هذا الاختبار بعد.";
  else qz.qs = r.data;

  render();
}

function quizView(id){
  const z = quizzes.find(x => x.id === id && (x.published || isAdmin));
  if(!z) return `<div class="empty">الاختبار غير موجود.</div><p><a class="btn" href="#/quizzes">الاختبارات</a></p>`;
  if(!qz || qz.quiz.id !== id){ startQuiz(z); return loadingView(); }
  if(qz.loading) return loadingView();

  const back = isAdmin ? "#/admin" : "#/quizzes";
  if(qz.err) return `<p class="crumb"><a href="${back}">← رجوع</a></p><div class="empty">${esc(qz.err)}</div>`;
  if(qz.done) return quizResultView();

  const q = qz.qs[qz.i], a = qz.ans[q.id], n = qz.qs.length;
  const opts = q.options.map((o, oi) => {
    let cls = "opt", mark = "";
    if(a){
      if(oi === a.choice && a.correct){ cls += " ok"; mark = "✓"; }
      else if(oi === a.choice){ cls += " bad"; mark = "✗"; }
      else if(oi === a.ci){ cls += " ok"; mark = "✓"; }
      else cls += " dim";
    }
    return `<button class="${cls}" data-act="qpick" data-oi="${oi}" ${a ? "disabled" : ""}><span>${esc(o)}</span><b>${mark}</b></button>`;
  }).join("");

  return `<p class="crumb"><a href="${back}">← رجوع</a></p><h2>${esc(qz.quiz.title)}</h2>
  <div class="pbar"><i style="width:${pct(qz.i + (a ? 1 : 0), n)}%"></i></div><p class="hint">سؤال ${qz.i + 1} من ${n}</p>
  <div class="panel"><h3 style="line-height:1.8">${esc(q.text)}</h3>${opts}
   ${a ? `<p style="font-weight:700;color:${a.correct ? "var(--ok)" : "var(--err)"}">${a.correct ? "✓ إجابة صحيحة" : "✗ إجابة خاطئة"}</p>` : ""}
   ${a && a.ex ? `<p class="hint">💡 ${esc(a.ex)}</p>` : ""}
   ${a ? `<p><button class="btn" data-act="qnext">${qz.i + 1 < n ? "السؤال التالي" : "عرض النتيجة"}</button></p>` : ""}</div>`;
}

function quizResultView(){
  const n = qz.qs.length, ok = qz.qs.filter(q => qz.ans[q.id] && qz.ans[q.id].correct).length, p = pct(ok, n);
  const wrong = qz.qs.filter(q => !(qz.ans[q.id] && qz.ans[q.id].correct));
  const msg = p >= 80 ? "ممتاز 🎉" : p >= 60 ? "جيد، واصل المراجعة 👍" : "تحتاج إلى مزيد من المراجعة 📚";

  return `<p class="crumb"><a href="${isAdmin ? "#/admin" : "#/quizzes"}">← الاختبارات</a></p>
  <div class="panel"><h2>النتيجة: ${ok} من ${n} (${p}%)</h2><div class="pbar"><i style="width:${p}%"></i></div><p>${msg}</p>
   ${qz.saved === false ? '<p class="hint" style="color:var(--err)">تعذر حفظ نتيجتك بسبب الاتصال، لكن إجاباتك ظاهرة أمامك.</p>' : ""}
   <p><button class="btn" data-act="qretry">إعادة الاختبار</button> <a class="btn sec" href="${isAdmin ? "#/admin" : "#/quizzes"}">رجوع</a></p></div>
  ${wrong.length ? `<h3>الأسئلة التي أخطأت فيها (${wrong.length})</h3>${wrong.map(q => {
    const a = qz.ans[q.id];
    return `<div class="lec"><p style="margin:0;color:var(--ink)">${esc(q.text)}</p>${a ? `<div class="m">إجابتك: ✗ ${esc(q.options[a.choice])}</div><div class="m" style="color:var(--ok)">الصحيحة: ✓ ${esc(q.options[a.ci])}</div>${a.ex ? `<div class="m">💡 ${esc(a.ex)}</div>` : ""}` : '<div class="m">لم تُجب عن هذا السؤال.</div>'}</div>`;
  }).join("")}` : ""}`;
}

async function qPick(oi){
  if(!qz || qz.loading || qz.done || qz.busy) return;

  const q = qz.qs[qz.i];
  if(qz.ans[q.id]) return;

  qz.busy = true;
  const r = await sb.rpc("check_answer", {p_question:q.id, p_choice:oi});
  qz.busy = false;

  if(r.error){
    toast("تعذر التحقق من الإجابة. تأكد من الاتصال وحاول مجددًا.","err");
    return;
  }

  qz.ans[q.id] = {
    choice:oi,
    correct:!!r.data.correct,
    ci:r.data.correct_index,
    ex:r.data.explanation || ""
  };
  render();
}

async function qNext(){
  if(!qz) return;

  if(qz.i + 1 < qz.qs.length){
    qz.i++;
    render();
    scrollTo(0,0);
    return;
  }

  qz.done = true;
  render();
  scrollTo(0,0);

  if(isAdmin){
    qz.saved = null;
    return;
  }

  const answers = {};
  qz.qs.forEach(q => {
    if(qz.ans[q.id]) answers[q.id] = qz.ans[q.id].choice;
  });

  const mine = qz;
  const r = await sb.rpc("submit_attempt", {p_quiz:qz.quiz.id, p_answers:answers});

  if(qz !== mine) return;
  if(r.error){ qz.saved = false; render(); return; }

  qz.saved = true;
  attempts.unshift({
    quiz_id:qz.quiz.id,
    score:r.data.score,
    total:r.data.total,
    created_at:new Date().toISOString()
  });
  render();
}

/* ---------- إدارة الاختبارات ---------- */
function draftHtml(){
  if(!draft.length) return "";

  const missing = draft.filter(d => d.correct === null).length;

  return `<h3>المسودة: ${draft.length} سؤال ${missing ? `<span class="new" style="background:var(--err)">${missing} بلا إجابة صحيحة</span>` : ""}</h3>
  ${draft.map((d, i) => `<div class="lec" style="margin:8px 0"><div class="m">${i+1} · ${d.qtype === "tf" ? "صح/خطأ" : "اختيار من متعدد"}</div>
   <textarea class="dq-text" data-qi="${i}" rows="2" maxlength="2000">${esc(d.text)}</textarea>
   ${d.options.map((o, oi) => `<button class="opt ${d.correct === oi ? "ok" : ""}" style="color:#172b34!important;background:#f7fafb!important;border-color:#b8c8d0!important;text-align:right;white-space:normal;line-height:1.6;font-weight:600" data-act="dcorrect" data-qi="${i}" data-oi="${oi}"><span style="color:#172b34!important;opacity:1!important">${esc(o)}</span><b style="color:#172b34!important;opacity:1!important">${d.correct === oi ? "✓" : ""}</b></button>`).join("")}
   ${d.correct === null ? '<p class="hint" style="color:var(--err)">اضغط على الإجابة الصحيحة.</p>' : ""}
   <button class="btn del sm" data-act="dqdel" data-qi="${i}">حذف السؤال</button></div>`).join("")}
  <p><button class="btn" data-act="qsave" ${busy ? "disabled" : ""}>${busy ? "جارٍ الحفظ…" : "حفظ الاختبار"}</button> <button class="btn sec" data-act="dclear">مسح المسودة</button></p>`;
}

function qlistHtml(){
  if(!qopenList) return `<p class="hint">جارٍ التحميل…</p>`;

  return qopenList.map((q, i) => {
    const k = Array.isArray(q.quiz_keys)
      ? (q.quiz_keys[0] && q.quiz_keys[0].correct)
      : (q.quiz_keys && q.quiz_keys.correct);

    return `<div class="row"><b>${i+1}. ${esc(q.text)}</b>${q.options.map((o, oi) => `<div class="m" style="${oi === k ? "color:var(--ok);font-weight:700" : ""}">${oi === k ? "✓" : "○"} ${esc(o)}</div>`).join("")}<button class="btn del sm" data-act="qqdel" data-id="${q.id}">حذف السؤال</button></div>`;
  }).join("") || '<p class="hint">لا توجد أسئلة.</p>';
}

function quizListHtml(){
  return quizzes.map(z => {
    const at = adminAttempts.filter(a => a.quiz_id === z.id), s = subj(z.subject_id);
    const avg = at.length ? pct(at.reduce((x,a) => x + a.score, 0), at.reduce((x,a) => x + a.total, 0)) : null;

    return `<div class="lec" style="margin:8px 0"><h3>${esc(z.title)} ${z.published ? "" : '<span class="hint">(مخفي)</span>'}</h3>
     <div class="m">${s ? esc(s.name_ar) : ""} · ${z.qn} سؤال · ${at.length} محاولة${avg !== null ? ` · المتوسط ${avg}%` : ""}</div>
     <div class="acts"><button class="btn sec sm" data-act="qpub" data-id="${z.id}">${z.published ? "إخفاء" : "نشر"}</button><button class="btn sec sm" data-act="qshow" data-id="${z.id}">${qopen === z.id ? "إخفاء الأسئلة" : "عرض الأسئلة"}</button><button class="btn sec sm" data-act="qappend" data-id="${z.id}">+ أسئلة</button><a class="btn sec sm" href="#/quiz/${z.id}">تجربة</a><button class="btn del sm" data-act="qdel" data-id="${z.id}">حذف</button></div>
     ${qopen === z.id ? qlistHtml() : ""}</div>`;
  }).join("") || '<p class="hint">لا توجد اختبارات بعد.</p>';
}

/* ---------- قائمة مشرف المحتوى ---------- */
function contentManagerQuizListHtml(){
  return quizzes.map(z => {
    const s = subj(z.subject_id);

    return `<div class="lec" style="margin:8px 0">
      <h3>${esc(z.title)}</h3>
      <div class="m">${s ? esc(s.name_ar) : ""} · ${z.qn} سؤال · ${z.published ? "منشور" : "غير منشور"}</div>
      <div class="acts">
        <button class="btn del sm" data-act="qdel" data-id="${z.id}">🗑 حذف الاختبار</button>
      </div>
    </div>`;
  }).join("") || '<p class="hint">لا توجد اختبارات حاليًا.</p>';
}

/* ---------- لوحة الاختبارات ---------- */
function quizAdminPanel(){
  if(isContentManager && !isAdmin){
    const t = quizForm;
    const firstSub = subjects[0] ? subjects[0].id : "";

    return `<div class="panel"><h2>📝 إنشاء الاختبارات</h2>
      <label>عنوان الاختبار</label>
      <input id="qz-title" maxlength="200" value="${esc(t.title)}">

      <label>المادة</label>
      <select id="qz-subject">
        ${subjects.map(s => `<option value="${esc(s.id)}" ${(t.subject || firstSub) === s.id ? "selected" : ""}>${esc(s.name_ar)}</option>`).join("")}
      </select>

      <label>نوع الأسئلة</label>
      <select id="qz-type">
        <option value="mcq" ${t.type === "mcq" ? "selected" : ""}>اختيار من متعدد (MCQ)</option>
        <option value="tf" ${t.type === "tf" ? "selected" : ""}>صح وخطأ</option>
      </select>

      <label>الصق الأسئلة هنا</label>
      <textarea id="qz-text" rows="8" dir="auto">${esc(t.text)}</textarea>

      <p class="hint">بعد تحليل النص، حدّد الإجابة الصحيحة لكل سؤال ثم احفظ الاختبار. يُنشر الاختبار الجديد تلقائيًا.</p>
      <p><button class="btn" data-act="qparse">تحليل النص</button></p>

      ${draftHtml()}

      <h3>الاختبارات الحالية (${quizzes.length})</h3>
      ${contentManagerQuizListHtml()}
    </div>`;
  }

  const t = quizForm, target = quizzes.find(z => z.id === t.target), firstSub = subjects[0] ? subjects[0].id : "";
  const hintMcq = "الصق الأسئلة بأي صيغة معتادة: رقم السؤال، ثم الخيارات (أ ب ج د أو A B C D)، ثم سطر «الإجابة: ب». أو ضع علامة * بعد الخيار الصحيح. وإن لم تكن الإجابة موجودة فاخترها بعد التحليل.";
  const hintTf = "اكتب كل عبارة في سطر، وضع في آخرها (صح) أو (خطأ)، أو اكتب في السطر التالي «الإجابة: صح». وإن لم تكن موجودة فاخترها بعد التحليل.";

  return `<div class="panel"><h2>📝 الاختبارات</h2>
   <label>الوجهة</label><select id="qz-target"><option value="">اختبار جديد</option>${quizzes.map(z => `<option value="${z.id}" ${t.target === z.id ? "selected" : ""}>${esc(z.title)}</option>`).join("")}</select>
   ${target ? `<p class="hint">ستُضاف الأسئلة إلى «${esc(target.title)}».</p>` : `<label>عنوان الاختبار</label><input id="qz-title" maxlength="200" value="${esc(t.title)}">
   <label>المادة</label><select id="qz-subject">${subjects.map(s => `<option value="${esc(s.id)}" ${(t.subject || firstSub) === s.id ? "selected" : ""}>${esc(s.name_ar)}</option>`).join("")}</select>
   <label style="font-weight:400"><input type="checkbox" id="qz-pub" style="width:auto" ${t.pub ? "checked" : ""}> نشر الاختبار للطلاب فور حفظه</label>`}
   <label>نوع الأسئلة في النص الملصق</label><select id="qz-type"><option value="mcq" ${t.type === "mcq" ? "selected" : ""}>اختيار من متعدد (MCQ)</option><option value="tf" ${t.type === "tf" ? "selected" : ""}>صح وخطأ</option></select>
   <label>الصق الأسئلة هنا</label><textarea id="qz-text" rows="8" dir="auto">${esc(t.text)}</textarea>
   <p class="hint">${t.type === "mcq" ? hintMcq : hintTf}</p>
   <p><button class="btn" data-act="qparse">تحليل النص</button></p>
   ${draftHtml()}
   <h3>الاختبارات الحالية (${quizzes.length})</h3>${quizListHtml()}</div>`;
}

function quizParse(){
  const raw = ($("#qz-text").value || "").trim();
  if(!raw) return toast("الصق نص الأسئلة أولًا.","err");

  const r = quizForm.type === "tf" ? parseTf(raw) : parseMcq(raw);

  if(!r.items.length) return toast("لم أتعرف على أي سؤال. تأكد من الصيغة المذكورة تحت الخانة.","err");

  draft = draft.concat(r.items);
  quizForm.text = "";
  render();

  toast(`تم تحليل ${r.items.length} سؤال` + (r.skipped ? ` (تجاهلتُ ${r.skipped} نصًّا لم يكتمل)` : "") + ". راجعها ثم احفظ.");
}

async function quizSave(){
  if(busy) return;
  if(!draft.length) return toast("لا توجد أسئلة.","err");
  if(draft.some(d => d.correct === null)) return toast("حدّد الإجابة الصحيحة لكل سؤال.","err");
  if(draft.some(d => !String(d.text).trim())) return toast("يوجد سؤال بلا نص.","err");

  // لا يسمح لمشرف المحتوى بتحديد اختبار موجود للتعديل.
  const tg = (isContentManager && !isAdmin) ? "" : quizForm.target;
  const title = quizForm.title.trim();
  const subject = quizForm.subject || (subjects[0] ? subjects[0].id : "");

  if(!tg && !title) return toast("اكتب عنوان الاختبار.","err");

  busy = true;
  render();

  const r = await sb.rpc("admin_save_quiz", {
    p_quiz:tg || null,
    p_title:title,
    p_subject:subject,
    p_published:(isContentManager && !isAdmin) ? true : quizForm.pub,
    p_questions:draft.map(d => ({
      qtype:d.qtype,
      text:d.text.trim(),
      options:d.options,
      correct:d.correct,
      explanation:d.explanation || ""
    }))
  });

  busy = false;

  if(r.error){
    render();
    return toast("تعذر الحفظ: " + r.error.message, "err");
  }

  draft = [];
  quizForm.title = "";
  quizForm.target = "";
  qopen = null;

  await loadQuizzes();
  render();
  toast("تم حفظ الاختبار.");
}

async function quizShow(id){
  if(isContentManager && !isAdmin){
    return toast("لا يملك مشرف المحتوى صلاحية عرض الإجابات الصحيحة.", "err");
  }

  if(qopen === id){
    qopen = null;
    render();
    return;
  }

  qopen = id;
  qopenList = null;
  render();

  const r = await sb.from("quiz_questions")
    .select("*, quiz_keys(correct)")
    .eq("quiz_id", id)
    .order("position");

  qopenList = r.data || [];
  render();
}

async function quizAdminAct(kind, id){
  // مشرف المحتوى يستطيع حذف الاختبار بالكامل فقط.
  if(isContentManager && !isAdmin && kind !== "del"){
    return toast("هذه العملية غير متاحة لمشرف المحتوى.", "err");
  }

  if(kind === "pub"){
    const z = quizzes.find(x => x.id === id);
    if(!z) return;

    const r = await sb.from("quizzes").update({published:!z.published}).eq("id", id);
    if(r.error) return toast("تعذر التعديل: " + r.error.message, "err");
  } else if(kind === "del"){
    if(!confirm("حذف الاختبار وكل أسئلته ونتائج الطلاب فيه نهائيًا؟")) return;

    const r = await sb.from("quizzes").delete().eq("id", id);
    if(r.error) return toast("تعذر الحذف: " + r.error.message, "err");

    if(qopen === id) qopen = null;
    toast("تم حذف الاختبار.");
  } else if(kind === "qdel"){
    if(!confirm("حذف هذا السؤال نهائيًا؟")) return;

    const r = await sb.from("quiz_questions").delete().eq("id", id);
    if(r.error) return toast("تعذر الحذف: " + r.error.message, "err");

    qopenList = (qopenList || []).filter(q => q.id !== id);
  }

  await loadQuizzes();
  render();
}

/* ---------- ربط الأحداث ---------- */
const QUIZ_ACT = {
  qpick: t => qPick(+t.dataset.oi),
  qnext: qNext,
  qretry: () => { qz = null; render(); },
  qparse: quizParse,
  qsave: quizSave,
  dcorrect: t => { const d = draft[+t.dataset.qi]; if(d){ d.correct = +t.dataset.oi; render(); } },
  dqdel: t => { draft.splice(+t.dataset.qi, 1); render(); },
  dclear: () => { draft = []; render(); },
  qpub: t => quizAdminAct("pub", t.dataset.id),
  qdel: t => quizAdminAct("del", t.dataset.id),
  qqdel: t => quizAdminAct("qdel", t.dataset.id),
  qshow: t => quizShow(t.dataset.id),
  qappend: t => { quizForm.target = t.dataset.id; render(); toast("اختر نوع الأسئلة والصق النص أعلى هذه القائمة."); }
};

function quizOnInput(e){
  const id = e.target.id;
  if(id === "qz-title"){ quizForm.title = e.target.value; return true; }
  if(id === "qz-text"){ quizForm.text = e.target.value; return true; }
  return false;
}

function quizOnChange(e){
  const t = e.target, id = t.id;
  if(id === "qz-target"){ quizForm.target = t.value; render(); return true; }
  if(id === "qz-subject"){ quizForm.subject = t.value; return true; }
  if(id === "qz-pub"){ quizForm.pub = t.checked; return true; }
  if(id === "qz-type"){ quizForm.type = t.value; render(); return true; }
  if(t.classList && t.classList.contains("dq-text")){ const d = draft[+t.dataset.qi]; if(d) d.text = t.value; return true; }
  return false;
}

function quizRouteChange(h){
  if(!h.startsWith("#/quiz/")) qz = null;
                                                                   }
