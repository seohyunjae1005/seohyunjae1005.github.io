(function (root) {
  "use strict";

  const STATUS_LABELS = { strong: "우선", usable: "보조", missing: "근거 부족" };

  function draftId(placement) {
    return `${placement?.question?.text || ""}::${placement?.experience?.id || "none"}`;
  }

  function summarize(placements = []) {
    const usage = new Map();
    let assignedCount = 0;
    let missingCount = 0;
    let noJdAnchorCount = 0;

    placements.forEach((row, index) => {
      if (!row?.experience || row.status === "missing") {
        missingCount += 1;
        return;
      }
      assignedCount += 1;
      if (!row.jdRequirement) noJdAnchorCount += 1;
      const current = usage.get(row.experience.id) || {
        id: row.experience.id,
        label: row.experience.label,
        kind: row.experience.kind,
        count: 0,
        questions: [],
      };
      current.count += 1;
      current.questions.push(index + 1);
      usage.set(row.experience.id, current);
    });

    const experiences = Array.from(usage.values());
    const repeated = experiences.filter((row) => row.count > 1);
    const warnings = [];
    repeated.forEach((row) => warnings.push({
      type: "reuse",
      message: `${row.label} 경험이 Q${row.questions.join("·Q")}에 반복 배치되었습니다. 문항마다 역할·행동·결과가 다르게 드러나는지 확인하세요.`,
    }));
    if (missingCount) warnings.push({
      type: "missing",
      message: `${missingCount}개 문항은 현재 프로필에서 사용할 근거를 찾지 못했습니다. 경험을 만들지 말고 실제 활동을 보완하세요.`,
    });
    if (noJdAnchorCount) warnings.push({
      type: "anchor",
      message: `${noJdAnchorCount}개 배치는 JD 요구사항과 직접 연결되지 않았습니다. 회사·직무 맞춤 문장인지 다시 확인하세요.`,
    });

    return {
      questionCount: placements.length,
      assignedCount,
      missingCount,
      noJdAnchorCount,
      uniqueExperienceCount: experiences.length,
      repeatedExperienceCount: repeated.length,
      experiences,
      repeated,
      warnings,
    };
  }

  function readDraft(drafts, placement) {
    const stored = drafts?.[draftId(placement)];
    if (typeof stored === "string") return stored;
    return typeof stored?.current === "string" ? stored.current : "";
  }

  function buildText({ company = "", role = "", placements = [], drafts = {}, includeDrafts = false }) {
    const title = [company, role].filter(Boolean).join(" · ") || "지원서 경험 배치";
    const lines = [title, "=".repeat(title.length), ""];
    placements.forEach((row, index) => {
      lines.push(`Q${index + 1}. ${row?.question?.text || "문항 없음"}`);
      lines.push(`- 배치: ${row?.experience ? `${row.experience.kind} · ${row.experience.label}` : "근거 부족"}`);
      lines.push(`- 상태: ${STATUS_LABELS[row?.status] || "확인 필요"}`);
      if (row?.intent) lines.push(`- 문항 의도: ${row.intent}`);
      if (row?.jdRequirement?.text) lines.push(`- JD 연결: ${row.jdRequirement.text}`);
      if (row?.writingAngle) lines.push(`- 작성 방향: ${row.writingAngle}`);
      if (row?.missingInfo) lines.push(`- 보완할 내용: ${row.missingInfo}`);
      if (includeDrafts) {
        const draft = readDraft(drafts, row).trim();
        lines.push("- 작성 초안:");
        lines.push(draft || "  아직 작성하지 않음");
      }
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  const api = { STATUS_LABELS, draftId, summarize, readDraft, buildText };
  root.ApplicationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
