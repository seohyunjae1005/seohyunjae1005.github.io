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

  function addHistory(historyMap = {}, placement, value, savedAt = new Date().toISOString(), limit = 5) {
    const next = { ...historyMap };
    const id = draftId(placement);
    const cleaned = String(value || "").trim();
    if (!cleaned) return next;
    const current = Array.isArray(next[id]) ? next[id].filter((row) => row && typeof row.value === "string") : [];
    const deduplicated = current.filter((row) => row.value.trim() !== cleaned);
    next[id] = [{ value: cleaned, savedAt }, ...deduplicated].slice(0, Math.max(1, limit));
    return next;
  }

  function historyFor(historyMap = {}, placement) {
    const rows = historyMap?.[draftId(placement)];
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.value === "string" && row.value.trim()) : [];
  }

  const DUPLICATE_STOPWORDS = new Set([
    "그리고", "하지만", "통해", "대한", "위해", "관련", "업무", "경험", "과정", "결과", "문제", "역할",
    "진행", "수행", "활용", "했습니다", "하였습니다", "있습니다", "저는", "제가", "이를", "해당", "있는", "하는",
  ]);

  function draftTokens(value) {
    const matches = String(value || "").toLowerCase().match(/[가-힣a-z0-9]+/g) || [];
    return Array.from(new Set(matches.filter((token) => token.length >= 2 && !DUPLICATE_STOPWORDS.has(token))));
  }

  function findDraftOverlaps(placements = [], drafts = {}) {
    const entries = placements.map((placement, index) => ({
      index,
      text: readDraft(drafts, placement).trim(),
      tokens: draftTokens(readDraft(drafts, placement)),
    })).filter((row) => row.text.length >= 40 && row.tokens.length >= 6);
    const overlaps = [];
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const leftTokens = new Set(entries[left].tokens);
        const rightTokens = new Set(entries[right].tokens);
        const shared = entries[left].tokens.filter((token) => rightTokens.has(token));
        const unionSize = new Set([...leftTokens, ...rightTokens]).size;
        const similarity = unionSize ? shared.length / unionSize : 0;
        const containment = Math.min(leftTokens.size, rightTokens.size) ? shared.length / Math.min(leftTokens.size, rightTokens.size) : 0;
        if (shared.length >= 5 && (similarity >= 0.4 || containment >= 0.65)) {
          overlaps.push({
            leftIndex: entries[left].index,
            rightIndex: entries[right].index,
            similarity: Math.round(similarity * 100),
            sharedTerms: shared.slice(0, 8),
          });
        }
      }
    }
    return overlaps;
  }

  function numericClaims(value) {
    const source = String(value || "");
    const pattern = /(\d+(?:[.,]\d+)?)\s*(%|퍼센트|명|개|건|회|시간|개월|년|점|위|배)/g;
    return Array.from(source.matchAll(pattern)).map((match) => ({
      value: `${match[1]}${match[2]}`,
      number: match[1].replace(",", "."),
      unit: match[2],
      context: source.slice(Math.max(0, match.index - 24), Math.min(source.length, match.index + match[0].length + 24)).replace(/\s+/g, " ").trim(),
    }));
  }

  function reviewPackage(placements = [], drafts = {}, profileEntries = []) {
    const evidenceMap = Object.fromEntries(profileEntries.map((row, index) => [`E${index + 1}`, String(row?.text || "")]));
    const unsupportedNumbers = [];
    const byExperience = new Map();

    placements.forEach((placement, index) => {
      const draft = readDraft(drafts, placement).trim();
      if (!draft || !placement?.experience?.id) return;
      const claims = numericClaims(draft);
      const evidence = evidenceMap[placement.experience.id] || "";
      const normalizedEvidence = evidence.replace(/\s+/g, "").toLowerCase();
      claims.forEach((claim) => {
        if (!normalizedEvidence.includes(claim.value.replace(/\s+/g, "").toLowerCase())) {
          unsupportedNumbers.push({ questionIndex: index, experienceId: placement.experience.id, ...claim });
        }
      });
      const rows = byExperience.get(placement.experience.id) || [];
      rows.push({ questionIndex: index, claims });
      byExperience.set(placement.experience.id, rows);
    });

    const numericConflicts = [];
    byExperience.forEach((rows, experienceId) => {
      for (let left = 0; left < rows.length; left += 1) {
        for (let right = left + 1; right < rows.length; right += 1) {
          const leftByUnit = new Map(rows[left].claims.map((claim) => [claim.unit, claim]));
          rows[right].claims.forEach((rightClaim) => {
            const leftClaim = leftByUnit.get(rightClaim.unit);
            if (leftClaim && leftClaim.number !== rightClaim.number) {
              numericConflicts.push({
                experienceId,
                leftIndex: rows[left].questionIndex,
                rightIndex: rows[right].questionIndex,
                leftValue: leftClaim.value,
                rightValue: rightClaim.value,
                unit: rightClaim.unit,
              });
            }
          });
        }
      }
    });

    return { unsupportedNumbers, numericConflicts };
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

  const api = { STATUS_LABELS, draftId, summarize, readDraft, addHistory, historyFor, draftTokens, findDraftOverlaps, numericClaims, reviewPackage, buildText };
  root.ApplicationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
