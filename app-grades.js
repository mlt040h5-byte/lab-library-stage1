
/* ===== سجل درجاتي: الدرجات اليدوية للطلاب ===== */
(() => {
  "use strict";

  let gradeRows = [];
  let gradeBusy = false;
  let gradeEditingId = null;
  let gradeAdminStudent = "";
  let gradeLoadedFor = null;

  const gradeEsc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const gradeToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const gradeFmt = d => {
    if (!d) return "—";
    return new Date(d + "T12:00:00").toLocaleDateString("ar-IQ");
  };

  const gradeNum = n => Number(n || 0).toLocaleString("ar-IQ", {
    maximumFractionDigits: 2
  });

  const gradePct = (score, max) => max > 0
    ? Math.round(score / max * 100)
    : 0;

  const gradeSubName = id => {
    const s = (subjects || []).find(x => String(x.id) === String(id));
    return s ? (s.name_ar || s.name || s.title || String(s.id)) : String(id);
  };

  function gradeNoticeKey() {
    return "manual_grades_notice_v1_" + (session?.user?.id || "unknown");
  }

  function gradeNotice() {
    if (!me || isAdmin || !session?.user?.id) return;

    try {
      if (localStorage.getItem(gradeNoticeKey()) === "1") return;
    } catch (_) {}

    if (document.getElementById("grades-notice")) return;

    const modal = document.createElement("div");
    modal.id = "grades-notice";
    modal.style.cssText =
      "position:fixed;inset:0;background:#0009;z-index:1000;" +
      "display:flex;align-items:center;justify-content:center;padding:18px";

    modal.innerHTML = `
      <div role="dialog" aria-modal="true"
        style="width:min(100%,420px);background:var(--card);color:var(--ink);
        border:1px solid var(--line);border-radius:16px;padding:22px;
        box-shadow:0 12px 40px #0004;text-align:center">
        <h3 style="margin-top:0">توضيح مهم</h3>
        <p>سيبقى سجل الدرجات موجوداً عند تحديث التطبيق.</p>
        <button class="btn" id="grades-notice-ok">حسنًا</button>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById("grades-notice-ok").onclick = () => {
      try {
        localStorage.setItem(gradeNoticeKey(), "1");
      } catch (_) {}
      modal.remove();
    };
  }

  async function gradeLoad() {
    if (!sb || !session?.user?.id) {
      gradeRows = [];
      return;
    }

    gradeBusy = true;

    try {
      let query = sb.from("student_grades").select("*")
        .order("exam_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (isAdmin) {
        if (gradeAdminStudent) {
          query = query.eq("user_id", gradeAdminStudent);
        }
      } else {
        query = query.eq("user_id", session.user.id);
      }

      const result = await query.limit(1000);
      if (result.error) throw result.error;

      gradeRows = result.data || [];
    } catch (err) {
      gradeRows = [];
      toast("تعذر تحميل سجل الدرجات: " + (err.message || "خطأ"), "err");
    } finally {
      gradeBusy = false;
    }
  }

  function gradeSummary(rows) {
    const totalScore = rows.reduce((s, r) => s + Number(r.score || 0), 0);
    const totalMax = rows.reduce((s, r) => s + Number(r.max_score || 0), 0);
    const average = totalMax ? Math.round(totalScore / totalMax * 100) : 0;

    return `
      <div class="stats">
        <div class="stat"><b>${rows.length}</b>عدد السجلات</div>
        <div class="stat"><b>${average}%</b>المعدل العام</div>
      </div>`;
  }

  function gradeSubjectStats(rows) {
    const ids = [...new Set(rows.map(r => String(r.subject_id)))];
    if (!ids.length) return "";

    return `
      <div class="panel">
        <h3>المعدلات حسب المادة</h3>
        ${ids.map(id => {
          const list = rows.filter(r => String(r.subject_id) === id);
          const earned = list.reduce((s, r) => s + Number(r.score || 0), 0);
          const possible = list.reduce((s, r) => s + Number(r.max_score || 0), 0);
          const average = possible ? Math.round(earned / possible * 100) : 0;

          return `
            <div class="row">
              <b>${gradeEsc(gradeSubName(id))}</b>
              <div class="hint">${list.length} سجل · المعدل ${average}%</div>
              <div class="pbar"><i style="width:${average}%"></i></div>
            </div>`;
        }).join("")}
      </div>`;
  }

  function gradeForm() {
    const editing = gradeEditingId
      ? gradeRows.find(r => r.id === gradeEditingId)
      : null;

    const subjectOptions = (subjects || []).map(s => {
      const name = s.name_ar || s.name || s.title || s.id;
      const selected = editing && String(editing.subject_id) === String(s.id);

      return `<option value="${gradeEsc(s.id)}" ${selected ? "selected" : ""}>
        ${gradeEsc(name)}
      </option>`;
    }).join("");

    return `
      <div class="panel">
        <h3>${editing ? "تعديل الدرجة" : "إضافة درجة جديدة"}</h3>

        <label for="grade-subject">المادة</label>
        <select id="grade-subject" required>
          <option value="">اختر المادة</option>
          ${subjectOptions}
        </select>

        <label for="grade-type">نوع الامتحان</label>
        <input id="grade-type" maxlength="100" required
          placeholder="مثال: امتحان شهري"
          value="${gradeEsc(editing?.exam_type || "")}">

        <div class="grid">
          <div>
            <label for="grade-max">الدرجة الكاملة (5–100)</label>
            <input id="grade-max" type="number" min="5" max="100"
              step="0.01" required value="${editing?.max_score ?? 100}">
          </div>
          <div>
            <label for="grade-score">درجتك</label>
            <input id="grade-score" type="number" min="0"
              max="${editing?.max_score ?? 100}"
              step="0.01" required value="${editing?.score ?? ""}">
          </div>
        </div>

        <label for="grade-date">تاريخ الامتحان</label>
        <input id="grade-date" type="date" required
          value="${gradeEsc(editing?.exam_date || gradeToday())}">

        <label for="grade-notes">ملاحظات (اختياري)</label>
        <textarea id="grade-notes" maxlength="1000" rows="3"
          placeholder="ملاحظات عن الامتحان">${gradeEsc(editing?.notes || "")}</textarea>

        <div class="acts">
          <button class="btn" data-grade-act="save" ${gradeBusy ? "disabled" : ""}>
            ${gradeBusy ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "حفظ الدرجة"}
          </button>
          ${editing ? `<button class="btn sec" data-grade-act="cancel">إلغاء</button>` : ""}
        </div>
      </div>`;
  }

  function gradeList(rows, adminMode) {
    if (!rows.length) {
      return `<div class="empty">لا توجد درجات مسجلة حتى الآن.</div>`;
    }

    return rows.map(r => {
      const max = Number(r.max_score);
      const score = Number(r.score);
      const percent = gradePct(score, max);

      return `
        <div class="lec">
          <h3>${gradeEsc(gradeSubName(r.subject_id))}</h3>
          <p>${gradeEsc(r.exam_type)}</p>

          <div class="stats" style="margin-top:10px">
            <div class="stat"><b>${gradeNum(score)} / ${gradeNum(max)}</b>الدرجة</div>
            <div class="stat"><b>${percent}%</b>النسبة</div>
          </div>

          <div class="pbar"><i style="width:${percent}%"></i></div>
          <div class="m">التاريخ: ${gradeEsc(gradeFmt(r.exam_date))}</div>
          ${r.notes ? `<p>${gradeEsc(r.notes)}</p>` : ""}

          ${adminMode
            ? `<div class="hint">معرّف الطالب: <span dir="ltr">${gradeEsc(r.user_id)}</span></div>`
            : `<div class="acts">
                <button class="btn sec sm" data-grade-act="edit"
                  data-id="${gradeEsc(r.id)}">تعديل</button>
                <button class="btn del sm" data-grade-act="delete"
                  data-id="${gradeEsc(r.id)}">حذف</button>
              </div>`}
        </div>`;
    }).join("");
  }

  function gradeAdminPicker() {
    return `
      <div class="panel">
        <h3>سجلات الطلاب</h3>
        <p class="hint">يمكنك عرض جميع السجلات أو تصفيتها بمعرّف حساب الطالب.</p>
        <label for="grade-admin-user">معرّف الطالب (اختياري)</label>
        <input id="grade-admin-user" dir="ltr"
          placeholder="UUID الخاص بحساب الطالب"
          value="${gradeEsc(gradeAdminStudent)}">
        <div class="acts">
          <button class="btn" data-grade-act="admin-filter">تطبيق</button>
          <button class="btn sec" data-grade-act="admin-all">عرض الجميع</button>
        </div>
      </div>`;
  }

  function gradeView() {
    if (!session) {
      return `<div class="empty">يرجى تسجيل الدخول أولًا.</div>`;
    }

    if (isAdmin) {
      return `
        <h2>سجل درجات الطلاب</h2>
        ${gradeAdminPicker()}
        ${gradeSummary(gradeRows)}
        ${gradeList(gradeRows, true)}`;
    }

    if (!me) {
      return `<div class="empty">تعذر تحميل حساب الطالب.</div>`;
    }

    return `
      <h2>سجل درجاتي</h2>
      <p class="hint">سجّل درجات امتحاناتك يدويًا وراجع معدلاتك في كل مادة.</p>
      ${gradeSummary(gradeRows)}
      ${gradeSubjectStats(gradeRows)}
      ${gradeForm()}
      <h3>الدرجات السابقة</h3>
      ${gradeList(gradeRows, false)}`;
  }

  async function gradeOpen() {
    if (!session?.user?.id) {
      location.hash = "#/";
      return;
    }

    const currentUserId = session.user.id;
    gradeLoadedFor = currentUserId;

    await gradeLoad();

    // إذا تغيّر الحساب أثناء تحميل البيانات، لا تعرض بيانات الحساب السابق.
    if (!session?.user?.id || session.user.id !== currentUserId) return;

    gradeEditingId = null;
    gradeNotice();
    render();
  }

  async function gradeSave() {
    if (gradeBusy || !session?.user?.id || isAdmin) return;

    const subjectId = document.getElementById("grade-subject")?.value || "";
    const examType = document.getElementById("grade-type")?.value.trim() || "";
    const max = Number(document.getElementById("grade-max")?.value);
    const score = Number(document.getElementById("grade-score")?.value);
    const date = document.getElementById("grade-date")?.value || "";
    const notesText = document.getElementById("grade-notes")?.value.trim() || "";

    if (!subjectId) return toast("اختر المادة.", "err");
    if (!(subjects || []).some(s => String(s.id) === String(subjectId))) {
      return toast("المادة المختارة غير موجودة.", "err");
    }
    if (!examType || examType.length > 100) {
      return toast("اكتب نوع الامتحان.", "err");
    }
    if (!Number.isFinite(max) || max < 5 || max > 100) {
      return toast("الدرجة الكاملة يجب أن تكون بين 5 و100.", "err");
    }
    if (!Number.isFinite(score) || score < 0 || score > max) {
      return toast("تأكد أن درجتك بين صفر والدرجة الكاملة.", "err");
    }
    if (!date) return toast("اختر تاريخ الامتحان.", "err");
    if (notesText.length > 1000) return toast("الملاحظات طويلة جدًا.", "err");

    const userId = session.user.id;
    const payload = {
      user_id: userId,
      subject_id: subjectId,
      exam_type: examType,
      max_score: max,
      score,
      exam_date: date,
      notes: notesText
    };

    gradeBusy = true;
    render();

    try {
      let result;

      if (gradeEditingId) {
        result = await sb.from("student_grades")
          .update(payload)
          .eq("id", gradeEditingId)
          .eq("user_id", userId);
      } else {
        result = await sb.from("student_grades").insert(payload);
      }

      if (result.error) throw result.error;

      gradeEditingId = null;
      await gradeLoad();
      toast("تم حفظ الدرجة.");
    } catch (err) {
      toast("تعذر حفظ الدرجة: " + (err.message || "خطأ"), "err");
    } finally {
      gradeBusy = false;
      render();
    }
  }

  async function gradeDelete(id) {
    if (!session?.user?.id || isAdmin) return;

    const row = gradeRows.find(r => String(r.id) === String(id));
    if (!row || row.user_id !== session.user.id) {
      return toast("لا يمكن حذف هذا السجل.", "err");
    }

    if (!confirm("هل تريد حذف سجل هذه الدرجة؟")) return;

    try {
      const result = await sb.from("student_grades")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (result.error) throw result.error;

      gradeEditingId = null;
      await gradeLoad();
      toast("تم حذف الدرجة.");
      render();
    } catch (err) {
      toast("تعذر حذف الدرجة: " + (err.message || "خطأ"), "err");
    }
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-grade-act]");
    if (!button) return;

    const action = button.dataset.gradeAct;

    if (action === "save") return gradeSave();

    if (action === "cancel") {
      gradeEditingId = null;
      render();
      return;
    }

    if (action === "edit") {
      if (isAdmin) return;
      const row = gradeRows.find(r => String(r.id) === String(button.dataset.id));
      if (!row || row.user_id !== session?.user?.id) {
        return toast("لا يمكن تعديل هذا السجل.", "err");
      }
      gradeEditingId = row.id;
      render();
      return;
    }

    if (action === "delete") return gradeDelete(button.dataset.id);

    if (action === "admin-filter") {
      if (!isAdmin) return;
      gradeAdminStudent = document.getElementById("grade-admin-user")?.value.trim() || "";

      if (gradeAdminStudent && !/^[0-9a-f-]{36}$/i.test(gradeAdminStudent)) {
        return toast("تحقق من معرّف الطالب.", "err");
      }

      await gradeLoad();
      render();
      return;
    }

    if (action === "admin-all") {
      if (!isAdmin) return;
      gradeAdminStudent = "";
      await gradeLoad();
      render();
    }
  });

  // إضافة سجل الدرجات إلى التوجيه الحالي.
  const originalRouteView = routeView;
  routeView = function (hash) {
    if (hash === "#/grades") return gradeView();
    return originalRouteView(hash);
  };

  // إضافة رابط السجل إلى شريط التنقل دون حذف روابط التطبيق.
  const originalRenderChrome = renderChrome;
  renderChrome = function (hash) {
    originalRenderChrome(hash);

    const nav = document.getElementById("nav");
    if (!nav || nav.style.display === "none") return;

    let link = nav.querySelector('[data-grades-nav="1"]');

    if (!link) {
      link = document.createElement("a");
      link.href = "#/grades";
      link.dataset.gradesNav = "1";
      link.innerHTML = "<b>📈</b>سجل الدرجات";
      nav.appendChild(link);
    }

    link.classList.toggle("on", hash === "#/grades");
  };

  // دعم فتح #/grades مباشرةً أو الانتقال إليها من داخل التطبيق.
  const originalRender = render;
  render = function () {
    originalRender();

    if (location.hash !== "#/grades" || !ready || !session?.user?.id) return;

    const userId = session.user.id;

    if (gradeLoadedFor !== userId && !gradeBusy) {
      gradeLoadedFor = userId;
      gradeOpen();
    }
  };

  // عند تغيير المسار إلى صفحة الدرجات، حمّل بيانات الحساب الحالي.
  window.addEventListener("hashchange", () => {
    if (location.hash !== "#/grades") {
      gradeEditingId = null;
      return;
    }

    if (!session?.user?.id) return;

    gradeLoadedFor = session.user.id;
    gradeOpen();
  });

  // يمكن استدعاؤها عند تغيير الحساب لإعادة تحميل السجلات.
  window.reloadStudentGrades = async function () {
    gradeLoadedFor = null;
    gradeRows = [];
    gradeEditingId = null;

    if (location.hash === "#/grades" && session?.user?.id) {
      await gradeOpen();
    }
  };
})();
