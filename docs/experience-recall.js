(function (root) {
  "use strict";
  const tracks = {
    Chip: { name: "칩메이커", cue: "공정 조건·측정값·재현성", scene: "조건별 결과를 비교하고 공정 변동의 원인을 확인하는 상황", questions: ["조건이나 순서를 바꿔 결과를 비교한 적이 있나요? 무엇을 같게 두고 무엇을 바꿨나요?", "측정값이 예상과 달라 다시 확인한 적이 있나요? 확인 순서와 본인 역할은 무엇이었나요?", "다른 사람이 같은 결과를 얻도록 절차나 조건을 기록했나요? 실제 기록 내용을 떠올려 보세요."] },
    Equipment: { name: "장비사", cue: "증상 확인·절차 점검·인수인계", scene: "고객의 설명을 구체적인 증상으로 정리하고, 점검 결과와 후속 조치를 전달하는 상황", questions: ["모호한 요청이나 이상 현상을 구체화하려고 추가 질문한 적이 있나요? 어떤 정보를 확인했나요?", "오류나 누락을 발견해 순서대로 점검한 적이 있나요? 장비 경험이 아니어도 실제 확인 과정을 적어 보세요.", "직접 판단하기 어려운 일을 담당자에게 전달했나요? 이미 확인한 내용과 확인이 필요한 내용을 어떻게 나눴나요?"] },
    Quality: { name: "품질", cue: "기준 대조·이상 확인·재발 방지", scene: "결과를 기준과 대조하고, 이상을 확인한 기록을 바탕으로 후속 조치를 정하는 상황", questions: ["서류·결과물·측정값을 기준과 비교한 적이 있나요? 어떤 기준이었나요?", "오류를 발견했을 때 발생 지점이나 원인을 확인했나요? 추측과 확인한 사실을 구분해 적어 보세요.", "같은 실수를 줄이려고 확인 방법이나 안내를 바꿨나요? 바꾼 내용과 이후 관찰한 결과는 무엇인가요?"] },
    Production: { name: "생산기술", cue: "작업 흐름·지연 원인·개선 전후", scene: "작업 흐름의 지연 요인을 파악하고, 절차나 배치를 조정한 뒤 결과를 확인하는 상황", questions: ["일이 늦어지거나 반복 작업이 생긴 구간을 발견했나요? 당시 작업 흐름을 설명해 보세요.", "작업 순서·도구·역할 분담을 바꿔본 적이 있나요? 본인이 제안하거나 실행한 부분은 무엇인가요?", "변경 전후를 비교했나요? 기록된 시간·횟수·결과물이 없다면 실제 관찰한 차이만 적어 보세요."] },
  };
  const escape = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function parse(value) { try { const data = JSON.parse(value); return data && typeof data === "object" ? data : {}; } catch (_) { return {}; } }
  function confirmedAnswers(draft) {
    return Object.entries(tracks).flatMap(([key, track]) => track.questions.flatMap((q, i) => {
      const answer = draft[`${key}${i}`];
      return answer?.status === "yes" && String(answer.detail || "").trim() ? [`본인 확인 사례: ${answer.detail.trim()}`] : [];
    })).join("\n\n");
  }
  function template(row) {
    const draft = parse(row.recallDraft);
    return `<details class="recall-helper"><summary>경험 구체화 <small>질문에 답하며 기억 꺼내기</small></summary><div class="recall-body">
      <input type="hidden" data-field="recallDraft" value="${escape(row.recallDraft)}" />
      <label>지원 방향<select data-recall-track>${Object.entries(tracks).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join("")}</select></label>
      ${Object.entries(tracks).map(([key, t], index) => `<section data-recall-panel="${key}"${index ? " hidden" : ""}>
        <p class="recall-cue">${t.cue}</p>
        ${t.questions.map((q, i) => { const id = `${key}${i}`, a = draft[id] || {}; const [title, ...hint] = q.split("?"); return `<details class="recall-question" data-recall-id="${id}"${i === 0 ? " open" : ""}><summary><span class="recall-number">${i + 1}</span><span>${title}?</span></summary><div class="recall-answer"><p class="recall-caption">${hint.join("?").trim()}</p><label>경험 여부<select data-recall-status><option value="">선택</option>${[["yes", "있음"], ["no", "없음"], ["unsure", "기억 안 남"]].map(([v, text]) => `<option value="${v}"${a.status === v ? " selected" : ""}>${text}</option>`).join("")}</select></label><label data-recall-detail-wrap${a.status === "yes" ? "" : " hidden"}>기억나는 사례<textarea data-recall-detail rows="3" placeholder="상황 → 내가 한 행동 → 결과">${escape(a.detail)}</textarea></label></div></details>`; }).join("")}
        <div class="recall-actions"><button type="button" class="jd-secondary" data-recall-apply>확인한 답변 반영</button><p data-recall-status-message role="status"></p></div>
        <details class="recall-angle"><summary>${t.name} 지원 메모 <small>선택</small></summary><p class="recall-scene">연결 관점 · ${t.scene}</p><label>강조할 내용<textarea data-field="angle${key}" rows="3" placeholder="지원 회사·직무와 강조하고 싶은 내 행동">${escape(row[`angle${key}`])}</textarea></label><p class="recall-caption">작성 방향 메모이며 경험 사실에는 포함되지 않습니다.</p></details>
      </section>`).join("")}
      <details class="recall-confirmed"><summary>반영된 경험 보기</summary><label>확인한 내용<textarea data-field="confirmedRecall" rows="5">${escape(row.confirmedRecall)}</textarea></label></details>
      <p class="recall-caption recall-save-hint">마지막에 프로필의 ‘이 기기에 저장’을 눌러 주세요.</p></div></details>`;
  }
  if (root.document) {
    root.document.addEventListener("toggle", (event) => {
      const question = event.target;
      if (!question.matches?.(".recall-question") || !question.open) return;
      question.parentElement.querySelectorAll(".recall-question").forEach((other) => { if (other !== question) other.open = false; });
    }, true);
    root.document.addEventListener("change", (event) => {
      const helper = event.target.closest(".recall-helper");
      if (!helper) return;
      if (event.target.matches("[data-recall-track]")) helper.querySelectorAll("[data-recall-panel]").forEach((panel) => { panel.hidden = panel.dataset.recallPanel !== event.target.value; });
      const question = event.target.closest("[data-recall-id]");
      if (question) {
        question.querySelector("[data-recall-detail-wrap]").hidden = question.querySelector("[data-recall-status]").value !== "yes";
        updateDraft(helper);
      }
    });
    root.document.addEventListener("input", (event) => { const helper = event.target.closest(".recall-helper"); if (helper && event.target.matches("[data-recall-detail]")) updateDraft(helper); });
    root.document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-recall-apply]");
      if (!button) return;
      const helper = button.closest(".recall-helper");
      updateDraft(helper);
      const draft = parse(helper.querySelector('[data-field="recallDraft"]').value);
      const active = helper.querySelector("[data-recall-track]").value;
      const selected = Object.fromEntries(Object.entries(draft).filter(([key]) => key.startsWith(active)));
      const text = confirmedAnswers(selected);
      const message = button.nextElementSibling;
      if (!text) { message.textContent = "「있음」을 선택하고 실제 사례를 적어 주세요."; return; }
      const output = helper.querySelector('[data-field="confirmedRecall"]');
      const existing = output.value.trim();
      const additions = text.split("\n\n").filter((item) => !existing.includes(item));
      output.value = [existing, ...additions].filter(Boolean).join("\n\n");
      message.textContent = "확인한 답변을 추가했습니다. 아래에서 수정한 뒤 프로필을 저장하세요.";
    });
  }
  function updateDraft(helper) {
    const draft = {};
    helper.querySelectorAll("[data-recall-id]").forEach((q) => { draft[q.dataset.recallId] = { status: q.querySelector("[data-recall-status]").value, detail: q.querySelector("[data-recall-detail]").value }; });
    helper.querySelector('[data-field="recallDraft"]').value = JSON.stringify(draft);
  }
  // JD 기반 경험 구체화 질문(JDQ) 표시용 템플릿.
  // 입력은 JdRecallQuestions.buildRecallQuestions() 결과 그대로 받는다.
  // 원문 사실(JD 인용·근거 번호)과 해석·제안(질문·작성 방향)을 라벨로 구분해 표시하고,
  // 연결된 경험이 없으면 [보완 필요]로 남긴다. 없는 경험을 만들어내지 않는다.
  function jdqTemplate(recall, savedAnswers = {}) {
    const questions = Array.isArray(recall?.questions) ? recall.questions : [];
    const answers = savedAnswers && typeof savedAnswers === "object" ? savedAnswers : {};
    const warnings = Array.isArray(recall?.warnings) ? recall.warnings : [];
    if (!questions.length) {
      return `<p class="jd-empty-result">채용공고에서 나온 질문을 만들지 못했습니다. 채용공고 원문과 분석 결과를 확인해 주세요.</p>${warnings.map((w) => `<p class="jd-recall-warning">${escape(w)}</p>`).join("")}`;
    }
    const summary = recall.summary || {
      total: questions.length,
      direct: questions.filter((q) => q.status === "linked").length,
      indirect: questions.filter((q) => q.status === "indirect").length,
      gap: questions.filter((q) => q.status === "gap").length,
      answerable: questions.filter((q) => q.status === "linked").length,
      background: questions.filter((q) => q.status === "indirect").length,
    };
    // 4회차 정정: "답할 수 있는 문항"에는 직접만 센다. 간접은 배경으로 따로 표시한다.
    const summaryLine = `<p class="jd-recall-summary">직접 답할 수 있는 문항 ${summary.direct}/${summary.total} · 간접 배경 ${summary.indirect} · 보완 필요 ${summary.gap} — 간접은 부분 배경이지 완성된 답이 아닙니다.</p>`;
    return summaryLine + questions.map((q, index) => {
      const linked = q.linkedExperience;
      // 카드 배지는 세부 표시와 같은 낙관도로 단다 (4회차 정정).
      // 세부(subParts)가 있으면 그중 간접인 부분만 세어 "일부만 (n/m)"으로 표시하고,
      // 세부 없이 간접이면 "부분 유사", 직접이면 "연결됨"이다.
      const cardBadge = () => {
        if (q.status === "linked" && linked) return `<span class="jd-recall-status linked">연결됨 · ${escape(linked.kind || "경험")}</span>`;
        if (q.status === "indirect" && linked) {
          if (Array.isArray(q.subParts) && q.subParts.length) {
            const covered = q.subParts.filter((p) => p.status === "indirect").length;
            return `<span class="jd-recall-status indirect">간접 연결 · 일부만 (${covered}/${q.subParts.length})</span>`;
          }
          return `<span class="jd-recall-status indirect">간접 연결 · 부분 유사</span>`;
        }
        return `<span class="jd-recall-status gap">[보완 필요]</span>`;
      };
      const status = cardBadge();
      const profileLink = `<a class="jd-recall-profile-link" href="#profile-form">프로필에서 보기</a>`;
      const boundaryBlock = q.boundary
        ? `<p class="jd-recall-boundary">${escape(q.boundary)}</p>` : "";
      const subPartsBlock = Array.isArray(q.subParts) && q.subParts.length
        ? `<ul class="jd-recall-subparts">${q.subParts.map((part) => `<li><strong>${escape(part.label)}</strong> <span class="jd-recall-status ${part.status === "indirect" ? "indirect" : "gap"}">${part.status === "indirect" ? "간접 연결" : "[보완 필요]"}</span> <span>${escape(part.note || "")}</span></li>`).join("")}</ul>`
        : "";
      const experienceBlock = q.status === "linked" && linked
        ? `<div class="jd-recall-experience"><small>연결된 경험 · 원문 발췌</small><strong>${escape(linked.label)}</strong><blockquote>${escape(linked.excerpt)}</blockquote>${linked.verifiedNumbers ? `<p class="jd-recall-verified-numbers">확인한 수치: ${escape(linked.verifiedNumbers)}</p>` : ""}${boundaryBlock}${profileLink}</div>`
        : q.status === "indirect" && linked
          ? `<div class="jd-recall-experience jd-recall-indirect"><small>간접 연결 · 부분 유사 — 직접 경험이 아닙니다</small><strong>${escape(linked.label)}</strong><blockquote>${escape(linked.excerpt)}</blockquote>${linked.verifiedNumbers ? `<p class="jd-recall-verified-numbers">확인한 수치: ${escape(linked.verifiedNumbers)}</p>` : ""}<p>${escape(q.indirectNote || "")}</p>${profileLink}</div>`
          : `<div class="jd-recall-experience jd-recall-gap"><small>연결된 경험 없음</small><p>저장한 프로필 원문에서 이 질문과 연결할 근거를 찾지 못했습니다. 경험이 없다는 판정이 아니라, 근거가 없다는 뜻입니다. 실제 수행한 활동을 추가하거나, 관련 프로젝트를 진행한 뒤 다시 확인하세요.</p>${q.nextAction ? `<p class="jd-recall-next">${escape(q.nextAction)}</p>` : ""}</div>`;
      // 38회차: 카드에 "같은 역량의 다른 경험"과 "관련 계획"을 보여준다.
      // 관련 계획은 직접 근거가 아니라는 표시를 분명히 한다.
      const relatedExperiencesBlock = Array.isArray(q.relatedExperiences) && q.relatedExperiences.length
        ? `<div class="jd-recall-related"><small>같은 역량의 다른 경험</small><ul>${q.relatedExperiences.map((r) => `<li><strong>${escape(r.label)}</strong><span>${escape(r.excerpt)}</span>${r.verifiedNumbers ? `<span>확인한 수치: ${escape(r.verifiedNumbers)}</span>` : ""}</li>`).join("")}</ul></div>`
        : "";
      const relatedPlansBlock = Array.isArray(q.relatedPlans) && q.relatedPlans.length
        ? `<div class="jd-recall-related"><small>관련 계획 · 계획 중 — 아직 실적이 아닙니다</small><ul>${q.relatedPlans.map((p) => `<li><strong>${escape(p.label)}</strong><span>${escape(p.covers || "")}</span></li>`).join("")}</ul></div>`
        : "";
      // 역량 문구가 JD 인용문과 같은 문장이면 축 라인에 두 번 적지 않는다.
      // JD 문장은 아래 사실 blockquote에 한 번만 나온다.
      const competencyLine = q.competency && q.competency !== q.jdQuote
        ? ` · <span>${escape(q.competency)}</span>` : "";
      const answerBlock = `<div class="jd-recall-answer">
        <label>내 답변 <small>상황 → 내가 한 행동 → 결과 순서로 쓰세요. 지원서 초안의 재료가 됩니다.</small></label>
        <textarea data-jdq-answer rows="4" placeholder="상황: ${escape(q.focus?.situation || "")} / 내가 한 행동: ${escape(q.focus?.action || "")} / 결과: ${escape(q.focus?.result || "")}">${escape(answers[q.id] || "")}</textarea>
        <div class="jd-recall-answer-actions"><button type="button" data-send-to-workspace>지원서 초안에 보내기</button><small data-jdq-save-status>${answers[q.id] ? "이 기기에 임시 저장됨" : "입력하면 이 기기에 자동 저장됩니다."}</small></div>
        <p class="jd-recall-send-status" data-jdq-send-status role="status"></p>
      </div>`;
      return `<article class="jd-recall-card ${q.status === "linked" ? "" : q.status}" data-question-id="${escape(q.id)}" data-jdq-key="${escape(q.key || q.id)}" data-evidence="${escape((q.jdEvidenceIds || []).join(","))}">
        <div class="jd-recall-head"><strong>${index + 1}.</strong><span class="jd-interpretation-label">${escape(q.label || "채용공고에서 나온 질문")}</span>${status}</div>
        <h4>${escape(q.question)}</h4>
        <p class="jd-recall-axis"><span>${escape(q.axisTitle || "채용공고 업무")}</span>${competencyLine}</p>
        <div class="jd-recall-fact"><span class="jd-fact-label">사실</span><blockquote>${escape(q.jdQuote)}</blockquote></div>
        <dl class="jd-recall-focus">
          <div><dt>상황</dt><dd>${escape(q.focus?.situation || "")}</dd></div>
          <div><dt>내가 한 행동</dt><dd>${escape(q.focus?.action || "")}</dd></div>
          <div><dt>결과</dt><dd>${escape(q.focus?.result || "")}</dd></div>
        </dl>
        ${subPartsBlock}
        <p class="jd-recall-direction"><span class="jd-interpretation-label">제안</span> 지원서 작성 방향 · ${escape(q.direction)}</p>
        ${experienceBlock}
        ${relatedExperiencesBlock}
        ${relatedPlansBlock}
        ${answerBlock}
      </article>`;
    }).join("") + (warnings.length ? warnings.map((w) => `<p class="jd-recall-warning">${escape(w)}</p>`).join("") : "");
  }
  const api = { template, confirmedAnswers, tracks, jdqTemplate };
  root.ExperienceRecall = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
