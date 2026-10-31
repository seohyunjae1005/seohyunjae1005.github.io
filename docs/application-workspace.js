(function (root) {
  "use strict";

  const STATUS_LABELS = { strong: "우선", usable: "보조", missing: "근거 부족" };

  function legacyDraftId(placement) {
    return `${placement?.question?.text || ""}::${placement?.experience?.id || "none"}`;
  }

  function draftId(placement) {
    const base = legacyDraftId(placement);
    const scope = String(placement?.workspaceScope || "").trim();
    return scope ? `${scope}::${base}` : base;
  }

  function workspaceScope({ company = "", role = "", jdText = "" } = {}) {
    const source = [company, role, jdText].map((value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase()).join("|");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `ws-${(hash >>> 0).toString(36)}`;
  }

  function normalizeWorkspaceLibrary(value = {}) {
    const items = value?.items && typeof value.items === "object"
      ? Object.fromEntries(Object.entries(value.items).filter(([id, row]) => id && row && typeof row === "object"))
      : {};
    return { activeId: items[value?.activeId] ? value.activeId : "", items };
  }

  function upsertWorkspace(library = {}, snapshot = {}, limit = 8) {
    const next = normalizeWorkspaceLibrary(library);
    if (!snapshot?.id) return next;
    next.items = { ...next.items, [snapshot.id]: snapshot };
    const ordered = Object.values(next.items)
      .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")))
      .slice(0, Math.max(1, limit));
    next.items = Object.fromEntries(ordered.map((row) => [row.id, row]));
    next.activeId = next.items[snapshot.id] ? snapshot.id : ordered[0]?.id || "";
    return next;
  }

  function removeWorkspace(library = {}, id = "") {
    const next = normalizeWorkspaceLibrary(library);
    delete next.items[id];
    const newest = Object.values(next.items).sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")))[0];
    next.activeId = newest?.id || "";
    return next;
  }

  function mergeWorkspaceLibraries(base = {}, incoming = {}, limit = 8) {
    const merged = normalizeWorkspaceLibrary(base);
    const imported = normalizeWorkspaceLibrary(incoming);
    Object.values(imported.items).forEach((snapshot) => {
      const current = merged.items[snapshot.id];
      if (!current || String(snapshot.savedAt || "") >= String(current.savedAt || "")) merged.items[snapshot.id] = snapshot;
    });
    const ordered = Object.values(merged.items)
      .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")))
      .slice(0, Math.max(1, limit));
    merged.items = Object.fromEntries(ordered.map((row) => [row.id, row]));
    merged.activeId = merged.items[imported.activeId] ? imported.activeId : ordered[0]?.id || "";
    return merged;
  }

  function buildWorkspaceBackup({ library = {}, drafts = {}, history = {} } = {}) {
    return {
      type: "aiproject-application-workspace",
      version: 1,
      exportedAt: new Date().toISOString(),
      library: normalizeWorkspaceLibrary(library),
      drafts: drafts && typeof drafts === "object" && !Array.isArray(drafts) ? drafts : {},
      history: history && typeof history === "object" && !Array.isArray(history) ? history : {},
    };
  }

  function normalizeWorkspaceBackup(value = {}) {
    if (value?.type !== "aiproject-application-workspace" || value?.version !== 1) {
      throw new Error("이 사이트에서 만든 지원 작업 백업 파일이 아닙니다.");
    }
    return buildWorkspaceBackup({
      library: value.library,
      drafts: value.drafts,
      history: value.history,
    });
  }

  function compareWorkspaceFacts(workspaces = []) {
    const rows = Array.isArray(workspaces) ? workspaces.filter((row) => row?.jdAnalysis?.facts) : [];
    const buckets = new Map();
    const add = (key, label, kind, workspace, original = "") => {
      const normalized = String(key || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!normalized) return;
      const current = buckets.get(`${kind}:${normalized}`) || { label, kind, workspaces: new Set(), companies: new Set(), originals: new Set() };
      current.workspaces.add(workspace.id || `${workspace.company}|${workspace.role}`);
      current.companies.add([workspace.company, workspace.role].filter(Boolean).join(" · ") || "회사·직무 미입력");
      if (original) current.originals.add(original);
      buckets.set(`${kind}:${normalized}`, current);
    };
    rows.forEach((workspace) => {
      const facts = workspace.jdAnalysis.facts;
      (facts.keywords || []).forEach((row) => add(row.standardized || row.original, row.standardized || row.original, "표준 키워드", workspace, row.original));
      (facts.tools || []).forEach((row) => add(row.value, row.value, "JD 직접 요구 Tool", workspace, row.value));
    });
    const common = Array.from(buckets.values()).map((row) => ({
      label: row.label,
      kind: row.kind,
      count: row.workspaces.size,
      companies: Array.from(row.companies),
      originals: Array.from(row.originals),
    })).filter((row) => row.count >= 2).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko"));
    return { comparedCount: rows.length, common };
  }

  function buildJdReportText({ company = "", role = "", sourceUrl = "", collectedAt = "", analysis = null } = {}) {
    if (!analysis?.facts || !analysis?.careerAnalysis) throw new Error("내보낼 JD 분석 결과가 없습니다.");
    const facts = analysis.facts;
    const career = analysis.careerAnalysis;
    const lines = [
      [company, role].filter(Boolean).join(" · ") || "JD 분석 보고서",
      "=".repeat(28),
      `원문 확인일: ${collectedAt || "미입력"}`,
      `공고 주소: ${sourceUrl || "미입력"}`,
      "",
      "[JD FACT]",
    ];
    const pushFact = (label, rows) => {
      const values = (rows || []).map((row) => row?.value || row?.original).filter(Boolean);
      lines.push(`${label}: ${values.length ? values.join(" / ") : "원문에 없음"}`);
    };
    lines.push(`직무명: ${facts.jobTitle?.value || "원문에 없음"}`);
    pushFact("주요 업무", facts.duties);
    pushFact("요구 역량", facts.competencies);
    pushFact("필수 조건", facts.required);
    pushFact("우대 조건", facts.preferred);
    pushFact("전공·기술지식", facts.knowledge);
    pushFact("Tool·Software·언어", facts.tools);
    pushFact("협업 대상", facts.collaborators);
    pushFact("성과 목표·지표", facts.metrics);
    pushFact("원문 키워드", facts.keywords);
    lines.push("", "[자동 해석]");
    lines.push(`직무 한 줄 해석: ${career.definition?.value || "해석 근거 부족"}`);
    (career.workAxes || []).forEach((axis, index) => {
      lines.push(`${index + 1}. ${axis.title}`);
      (axis.actualWork || []).forEach((work) => lines.push(`   - ${work}`));
      if (axis.purpose) lines.push(`   목적: ${axis.purpose}`);
    });
    if (career.preparation?.study?.length) {
      lines.push("", "공부 후보 (자동 제안)");
      career.preparation.study.forEach((row) => lines.push(`- ${row.title}: ${row.detail}`));
    }
    lines.push("", "[원문 근거]");
    (analysis.units || []).forEach((unit) => lines.push(`${unit.id} · ${unit.section}: ${unit.text}`));
    lines.push("", "※ Fact는 입력한 JD 원문 범위의 추출 결과이며, 자동 해석은 지원 판단을 대신하지 않습니다.");
    return lines.join("\n").trim();
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
    const stored = drafts?.[draftId(placement)] ?? drafts?.[legacyDraftId(placement)];
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

  function inferCharacterLimit(questionText) {
    const matches = String(questionText || "").match(/(?:최대\s*)?(\d{2,5})\s*자(?:\s*(?:이내|이하|내외))?/g) || [];
    const limits = matches.map((value) => Number(value.match(/\d{2,5}/)?.[0] || 0)).filter((value) => value >= 20);
    return limits.length ? Math.min(...limits) : null;
  }

  function placeholderMarkers(value) {
    const source = String(value || "");
    const bracketed = source.match(/\[(?:(?:회사명|직무명|내용|수치|경험|추가|작성)[^\]]*)\]/gi) || [];
    const asciiTokens = source.match(/\b(?:OO|XX|TBD|TODO)\b/gi) || [];
    const koreanTokens = source.match(/(?:○○|미작성|추후\s*작성)/g) || [];
    return [...new Set([...bracketed, ...asciiTokens, ...koreanTokens])];
  }

  function buildSubmissionChecklist({ placements = [], drafts = {}, profileEntries = [], currentCompany = "", knownCompanies = [] } = {}) {
    const packageReview = reviewPackage(placements, drafts, profileEntries);
    const overlaps = findDraftOverlaps(placements, drafts);
    const normalizedCurrentCompany = String(currentCompany || "").replace(/\s+/g, "").toLowerCase();
    const otherCompanies = [...new Set(knownCompanies.map((value) => String(value || "").trim()).filter((value) => value.length >= 2))]
      .filter((value) => value.replace(/\s+/g, "").toLowerCase() !== normalizedCurrentCompany);
    const questions = placements.map((placement, index) => {
      const draft = readDraft(drafts, placement).trim();
      const characterLimit = inferCharacterLimit(placement?.question?.text);
      const overLimit = Boolean(characterLimit && draft.length > characterLimit);
      const unsupportedNumbers = packageReview.unsupportedNumbers.filter((row) => row.questionIndex === index);
      const conflicts = packageReview.numericConflicts.filter((row) => row.leftIndex === index || row.rightIndex === index);
      const overlapRows = overlaps.filter((row) => row.leftIndex === index || row.rightIndex === index);
      const evidenceMissing = !placement?.experience || placement.status === "missing";
      const jdAnchorMissing = !placement?.jdRequirement;
      const companyMentions = otherCompanies.filter((company) => draft.toLowerCase().includes(company.toLowerCase()));
      const placeholders = placeholderMarkers(draft);
      const warnings = [];
      if (!draft) warnings.push("초안 미작성");
      if (evidenceMissing) warnings.push("경험 근거 부족");
      if (jdAnchorMissing) warnings.push("JD 직접 연결 없음");
      if (unsupportedNumbers.length) warnings.push("경험 원문에서 확인되지 않은 수치");
      if (conflicts.length) warnings.push("다른 문항과 수치 표현 불일치");
      if (overlapRows.length) warnings.push("다른 문항과 표현 반복");
      if (overLimit) warnings.push(`글자 수 ${draft.length - characterLimit}자 초과`);
      if (companyMentions.length) warnings.push(`다른 저장 작업 회사명 확인: ${companyMentions.join(" · ")}`);
      if (placeholders.length) warnings.push(`임시 표기 확인: ${placeholders.join(" · ")}`);
      return {
        index,
        drafted: Boolean(draft),
        characterCount: draft.length,
        characterLimit,
        overLimit,
        companyMentions,
        placeholders,
        evidenceMissing,
        jdAnchorMissing,
        unsupportedNumbers,
        conflicts,
        overlaps: overlapRows,
        warnings,
      };
    });
    const completedCount = questions.filter((row) => row.drafted).length;
    const evidenceMissingCount = questions.filter((row) => row.evidenceMissing).length;
    const jdAnchorMissingCount = questions.filter((row) => row.jdAnchorMissing).length;
    const overLimitCount = questions.filter((row) => row.overLimit).length;
    const companyMentionCount = questions.reduce((sum, row) => sum + row.companyMentions.length, 0);
    const placeholderCount = questions.reduce((sum, row) => sum + row.placeholders.length, 0);
    const issueCount = evidenceMissingCount + jdAnchorMissingCount + packageReview.unsupportedNumbers.length
      + packageReview.numericConflicts.length + overlaps.length + overLimitCount + companyMentionCount + placeholderCount;
    const status = completedCount < placements.length
      ? "writing"
      : issueCount > 0 ? "review" : "basic_pass";
    return {
      status,
      questionCount: placements.length,
      completedCount,
      evidenceMissingCount,
      jdAnchorMissingCount,
      unsupportedNumberCount: packageReview.unsupportedNumbers.length,
      numericConflictCount: packageReview.numericConflicts.length,
      overlapCount: overlaps.length,
      overLimitCount,
      companyMentionCount,
      placeholderCount,
      questions,
      packageReview,
      overlaps,
    };
  }

  function submissionAnswerBlock(format, index, question, answer) {
    if (format === "answers") return answer || "[미작성]";
    if (format === "numbered") return `${index + 1}. ${question}\n${answer || "[미작성]"}`;
    return `Q${index + 1}. ${question}\n\n${answer || "[미작성]"}`;
  }

  function buildSubmissionText({
    company = "", role = "", placements = [], drafts = {}, profileEntries = [], knownCompanies = [],
    format = "sectioned", includeReview = false,
  } = {}) {
    const title = [company, role].filter(Boolean).join(" · ") || "지원서";
    const checklist = buildSubmissionChecklist({ placements, drafts, profileEntries, currentCompany: company, knownCompanies });
    const lines = [title];
    if (includeReview) {
      const statusLabels = { writing: "작성 중", review: "검토 필요", basic_pass: "기본 점검 통과" };
      lines.push("=".repeat(title.length), "", `[최종 점검: ${statusLabels[checklist.status]}]`);
      lines.push(`- 초안 완료: ${checklist.completedCount}/${checklist.questionCount}`);
      lines.push(`- 경험 근거 부족: ${checklist.evidenceMissingCount}`);
      lines.push(`- JD 직접 연결 없음: ${checklist.jdAnchorMissingCount}`);
      lines.push(`- 경험 원문 미확인 수치: ${checklist.unsupportedNumberCount}`);
      lines.push(`- 수치 표현 불일치: ${checklist.numericConflictCount}`);
      lines.push(`- 문항 간 반복 표현: ${checklist.overlapCount}`);
      lines.push(`- 글자 수 초과: ${checklist.overLimitCount}`);
      lines.push(`- 다른 저장 작업 회사명 확인: ${checklist.companyMentionCount}`);
      lines.push(`- 임시 표기 확인: ${checklist.placeholderCount}`, "");
    } else {
      lines.push("");
    }
    placements.forEach((placement, index) => {
      const answer = readDraft(drafts, placement).trim();
      lines.push(submissionAnswerBlock(format, index, placement?.question?.text || "문항 없음", answer));
      if (includeReview) {
        const questionReview = checklist.questions[index];
        lines.push(`- 글자 수: ${questionReview.characterCount}${questionReview.characterLimit ? `/${questionReview.characterLimit}` : ""}자`);
        lines.push(`- 점검: ${questionReview.warnings.length ? questionReview.warnings.join(" / ") : "자동 점검 항목 없음"}`);
      }
      lines.push("");
    });
    if (includeReview) {
      lines.push("※ 이 점검은 저장된 JD·경험 원문과 초안의 기계적 대조 결과입니다. 실제 채용 페이지의 문항과 글자 수 제한은 제출 전에 직접 확인하세요.");
    }
    return lines.join("\n").trim();
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

  const api = {
    STATUS_LABELS, draftId, workspaceScope, normalizeWorkspaceLibrary, upsertWorkspace, removeWorkspace,
    mergeWorkspaceLibraries, buildWorkspaceBackup, normalizeWorkspaceBackup,
    compareWorkspaceFacts,
    buildJdReportText,
    summarize, readDraft, addHistory, historyFor, draftTokens,
    findDraftOverlaps, numericClaims, reviewPackage, inferCharacterLimit, placeholderMarkers, buildSubmissionChecklist,
    buildSubmissionText, buildText,
  };
  root.ApplicationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
