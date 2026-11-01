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
    return `<details class="recall-helper"><summary>경험 구체화 <small>기억 꺼내기 · 지원 방향별 메모</small></summary><div class="recall-body"><p>경험 원본은 하나로 두고, 지원 방향마다 강조할 내용을 따로 정리합니다.</p>
      <input type="hidden" data-field="recallDraft" value="${escape(row.recallDraft)}" />
      <label>지원 방향<select data-recall-track>${Object.entries(tracks).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join("")}</select></label>
      ${Object.entries(tracks).map(([key, t], index) => `<section data-recall-panel="${key}"${index ? " hidden" : ""}>
        <p class="recall-cue">${t.cue}</p><p class="recall-scene">현업 연결 예시 · ${t.scene}. 실제 JD와 대조해 활용하세요.</p>
        <details><summary>기억을 돕는 질문 3개</summary><p class="recall-caption">활동 회고용 질문입니다. 해당하는 경험만 답하세요.</p>
        ${t.questions.map((q, i) => { const id = `${key}${i}`, a = draft[id] || {}; return `<div class="recall-question" data-recall-id="${id}"><p>${q}</p><label>경험 여부<select data-recall-status><option value="">선택</option>${[["yes", "있음"], ["no", "없음"], ["unsure", "기억 안 남"]].map(([v, text]) => `<option value="${v}"${a.status === v ? " selected" : ""}>${text}</option>`).join("")}</select></label><label data-recall-detail-wrap${a.status === "yes" ? "" : " hidden"}>실제 사례<textarea data-recall-detail rows="3" placeholder="당시 상황 / 직접 한 행동 / 확인된 결과">${escape(a.detail)}</textarea></label></div>`; }).join("")}
        <button type="button" class="jd-secondary" data-recall-apply>답변 확인 후 경험에 반영</button><p data-recall-status-message role="status"></p></details>
        <label class="recall-angle">${t.name} 활용 메모 <small>작성 방향 · 경험 사실에는 포함되지 않음</small><textarea data-field="angle${key}" rows="3" placeholder="회사·직무명 / 연결할 내 행동 / 강조할 판단 과정">${escape(row[`angle${key}`])}</textarea></label>
      </section>`).join("")}
      <details class="recall-confirmed"><summary>확인한 추가 경험</summary><label>본인이 확인한 내용<textarea data-field="confirmedRecall" rows="5">${escape(row.confirmedRecall)}</textarea></label></details>
      <p class="recall-caption">답변·활용 메모는 프로필의 ‘이 기기에 저장’으로 보관합니다.</p></div></details>`;
  }
  if (root.document) {
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
  const api = { template, confirmedAnswers, tracks };
  root.ExperienceRecall = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
