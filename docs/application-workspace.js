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
      (facts.tools || []).forEach((row) => add(row.value, row.value, "채용공고에서 직접 요구", workspace, row.value));
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

  // 15회차: 8·9번 로컬 결과를 JD 분석 요약 txt에 포함한다. 요약 txt는
  // JD 분석을 통째로 저장하는 기록이라, 8·9번이 빠지면 분석 결과를
  // 저장했을 때 기업분석→지원서 연결이 안 보인다. 8·9번은 JD 분석
  // 화면의 1~7번과 같은 JD 원문·프로필 기준의 결과라 요약에 넣는 게 맞다.
  // 단, 8·9번이 아직 안 돌아간 상태면 "아직 실행하지 않았습니다"로 남기고,
  // 로컬 결과면 서버 없이 이 기기에서 규칙으로 연결·배치했다는 출처를 밝힌다.
  // JDQ 10번 문항은 별도 모듈이라 이 요약에는 넣지 않는다.
  function buildJdReportText({ company = "", role = "", sourceUrl = "", collectedAt = "", analysis = null, profileConnections = null, questionMap = null } = {}) {
    if (!analysis?.facts || !analysis?.careerAnalysis) throw new Error("내보낼 채용공고 분석 결과가 없습니다.");
    const facts = analysis.facts;
    const career = analysis.careerAnalysis;
    const lines = [
      [company, role].filter(Boolean).join(" · ") || "채용공고 분석 보고서",
      "=".repeat(28),
      `원문 확인일: ${collectedAt || "미입력"}`,
      `공고 주소: ${sourceUrl || "미입력"}`,
      "",
      "[채용공고 내용]",
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
    pushFact("도구·프로그램·언어", facts.tools);
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
    lines.push("", "[내 경험 연결]");
    if (!profileConnections?.matches?.length) {
      lines.push("내 경험 연결을 아직 실행하지 않았습니다.");
    } else {
      if (profileConnections.source === "local") lines.push("서버 없이 이 기기에서 규칙으로 연결했습니다. 프로필 원문은 외부로 전송되지 않았습니다.");
      const counts = profileConnections.counts || {};
      lines.push(`직접 ${counts.direct ?? 0}개 · 간접 ${counts.indirect ?? 0}개 · 추가 근거 필요 ${counts.none ?? 0}개`);
      const statusLabels = { direct: "직접", indirect: "간접", none: "근거 없음" };
      profileConnections.matches.forEach((row, index) => {
        lines.push(`${index + 1}. [${statusLabels[row.status] || "확인 필요"}] ${row?.requirement?.text || "요구사항 없음"}`);
        if (row?.experience) lines.push(`   연결 경험: ${row.experience.kind} · ${row.experience.label}`);
        if (row?.profileEvidenceQuote) lines.push(`   근거 발췌: ${row.profileEvidenceQuote}`);
        if (row?.reasoning) lines.push(`   연결 판단: ${row.reasoning}`);
      });
    }
    lines.push("", "[자기소개서 문항별 경험 연결]");
    if (!questionMap?.placements?.length) {
      lines.push("자기소개서 문항별 경험 연결을 아직 실행하지 않았습니다.");
    } else {
      if (questionMap.source === "local") lines.push("서버 없이 이 기기에서 규칙으로 연결했습니다. 프로필 원문은 외부로 전송되지 않았습니다.");
      questionMap.placements.forEach((row, index) => {
        const jdqMark = row?.fromJdq ? " (연습 문항)" : "";
        lines.push(`Q${index + 1}. ${row?.question?.text || "문항 없음"}${jdqMark}`);
        lines.push(`- 연결한 경험: ${row?.experience ? `${row.experience.kind} · ${row.experience.label}` : "근거 부족"} (${STATUS_LABELS[row?.status] || "확인 필요"})`);
        if (row?.jdRequirement?.text) lines.push(`- 채용공고 연결: ${row.jdRequirement.text}`);
        if (row?.missingInfo) lines.push(`- 보완할 내용: ${row.missingInfo}`);
      });
    }
    lines.push("", "[원문 근거]");
    (analysis.units || []).forEach((unit) => lines.push(`${unit.id} · ${unit.section}: ${unit.text}`));
    lines.push("", "※ 내용은 입력한 채용공고 원문 범위의 추출 결과이며, 자동 해석은 지원 판단을 대신하지 않습니다.");
    return lines.join("\n").trim();
  }

  function summarize(placements = []) {
    const usage = new Map();
    let assignedCount = 0;
    let missingCount = 0;
    let noJdAnchorCount = 0;
    let jdqCount = 0;
    const missing = [];

    placements.forEach((row, index) => {
      if (row?.fromJdq) jdqCount += 1;
      if (!row?.experience || row.status === "missing") {
        missingCount += 1;
        missing.push(index + 1);
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
      message: `${row.label} 경험이 Q${row.questions.join("·Q")}에 반복 연결되었습니다. 문항마다 역할·행동·결과가 다르게 드러나는지 확인하세요.`,
    }));
    if (missingCount) warnings.push({
      type: "missing",
      message: `Q${missing.join("·Q")}${missing.length > 1 ? "는" : "은"} 현재 프로필에서 사용할 근거를 찾지 못했습니다. 경험을 만들지 말고 실제 활동을 보완하세요.`,
    });
    if (noJdAnchorCount) warnings.push({
      type: "anchor",
      message: `${noJdAnchorCount}개 연결은 채용공고 요구사항과 직접 연결되지 않았습니다. 회사·직무 맞춤 문장인지 다시 확인하세요.`,
    });

    return {
      questionCount: placements.length,
      assignedCount,
      missingCount,
      missing,
      noJdAnchorCount,
      jdqCount,
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

  // 15회차: 제출용 배치만 고른다. JDQ에서 보낸 배치는 JD 원문에서 만든
  // 연습 문항이지 실제 지원 문항이 아니다. 배치표에는 그대로 두지만
  // (JDQ 답변을 잃지 않게), 제출본·최종 제출 점검에는 넣지 않는다.
  // 넣으면 제출본에 실제 문항이 아닌 JDQ 문항이 Q5·Q6으로 들어가고,
  // "초안 x/y"도 실제 문항이 아닌 JDQ 문항까지 세게 된다.
  // 표 차원의 수치·표현 반복 점검(reviewPackage/findDraftOverlaps)은
  // app.js에서 합친 전체 배치로 따로 돌리니, JDQ 초안과 실제 초안의
  // 수치 불일치는 거기서도 잡힌다.
  function submissionPlacements(placements = []) {
    return (Array.isArray(placements) ? placements : []).filter((row) => !row?.fromJdq);
  }

  function buildSubmissionChecklist({ placements = [], drafts = {}, profileEntries = [], currentCompany = "", knownCompanies = [] } = {}) {
    placements = submissionPlacements(placements);
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
      if (jdAnchorMissing) warnings.push("채용공고와 직접 연결 없음");
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
    // 15회차: 제출본은 실제 지원 문항만 싣는다. JDQ 연습 문항은 제외한다.
    placements = submissionPlacements(placements);
    const title = [company, role].filter(Boolean).join(" · ") || "지원서";
    const checklist = buildSubmissionChecklist({ placements, drafts, profileEntries, currentCompany: company, knownCompanies });
    const lines = [title];
    if (includeReview) {
      const statusLabels = { writing: "작성 중", review: "검토 필요", basic_pass: "기본 점검 통과" };
      lines.push("=".repeat(title.length), "", `[최종 점검: ${statusLabels[checklist.status]}]`);
      lines.push(`- 초안 완료: ${checklist.completedCount}/${checklist.questionCount}`);
      lines.push(`- 경험 근거 부족: ${checklist.evidenceMissingCount}`);
      lines.push(`- 채용공고와 직접 연결 없음: ${checklist.jdAnchorMissingCount}`);
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
      lines.push("※ 이 점검은 저장된 채용공고·경험 원문과 초안의 기계적 대조 결과입니다. 실제 채용 페이지의 문항과 글자 수 제한은 제출 전에 직접 확인하세요.");
    }
    return lines.join("\n").trim();
  }

  function buildText({ company = "", role = "", placements = [], drafts = {}, includeDrafts = false }) {
    const title = [company, role].filter(Boolean).join(" · ") || "지원서 경험 연결";
    const lines = [title, "=".repeat(title.length), ""];
    placements.forEach((row, index) => {
      lines.push(`Q${index + 1}. ${row?.question?.text || "문항 없음"}`);
      // 15회차: 작업본에는 JDQ 행도 남기되, 실제 지원 문항이 아님을 밝힌다.
      if (row?.fromJdq) lines.push("- 출처: 연습 문항 (실제 지원 문항이 아닙니다)");
      lines.push(`- 연결한 경험: ${row?.experience ? `${row.experience.kind} · ${row.experience.label}` : "근거 부족"}`);
      lines.push(`- 상태: ${STATUS_LABELS[row?.status] || "확인 필요"}`);
      if (row?.intent) lines.push(`- 문항 의도: ${row.intent}`);
      if (row?.jdRequirement?.text) lines.push(`- 채용공고 연결: ${row.jdRequirement.text}`);
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

  function buildJdqPlacement(question = {}, scope = "", experience = undefined) {
    // JDQ 문항을 지원서 작업의 배치(placement)로 바꾼다. draftId·요약·수치
    // 점검이 기존 배치와 같은 기준으로 동작하도록 모양을 맞춘다.
    // experience를 주면 그걸 쓰고, 생략하면 연결된 경험을 그대로 쓴다.
    // experience가 null이면 근거 부족(missing) 배치다.
    const statusMap = { linked: "strong", indirect: "usable", gap: "missing" };
    const linked = question?.linkedExperience || null;
    const resolved = experience === undefined
      ? (linked ? { id: String(linked.id || ""), label: String(linked.label || ""), kind: String(linked.kind || "경험") } : null)
      : experience;
    return {
      question: { text: String(question?.question || "") },
      experience: resolved,
      status: statusMap[question?.status] || "missing",
      intent: String(question?.axisTitle || ""),
      jdRequirement: question?.jdQuote ? { text: String(question.jdQuote) } : null,
      writingAngle: String(question?.direction || ""),
      reasoning: String(question?.indirectNote || ""),
      profileEvidenceQuote: String(linked?.excerpt || ""),
      missingInfo: question?.status === "gap" ? String(question?.nextAction || "") : "",
      workspaceScope: String(scope || ""),
      fromJdq: true,
      jdqId: String(question?.key || question?.id || ""),
    };
  }

  function mergeJdqPlacements(placements = [], jdqPlacements = []) {
    // JDQ에서 보낸 배치를 문항 배치표에 합친다. 같은 문항(질문 문장 기준)이
    // 이미 있으면 추가하지 않는다. 문항 배치를 다시 실행해도 저장된 JDQ
    // 배치가 사라지지 않게, 렌더링할 때마다 저장소에서 다시 합친다.
    // 34회차: 같은 문항인데 JDQ 배치가 더 강하면(직접 > 간접 > 근거 부족),
    // 제출용 행은 유지한 채 경험·인용·판정만 JDQ 쪽으로 올린다. 방산 Q1처럼
    // 9번이 약한 경험(동아리)을 붙이고 JDQ가 직접 경험(기계공학부)을 붙인
    // 경우, 9번 행이 JDQ 배치를 가리던 문제를 고친다. 약한 JDQ 배치는
    // 기존 행을 내리지 않고, JDQ 배치가 경험이 없으면 올릴 게 없다.
    // 46회차 (45회차 객관 검토 B11): 문장 기준에 더해, 같은 문항(안정 키 +
    // 채용공고 인용문)이면 문구가 바뀌어도 같은 문항으로 본다.
    // saveJdqPlacement와 같은 기준이다. 병합 결과는 저장·복원돼 다시
    // 병합되므로, 기본 행에도 JDQ 행(jdqId 있음)이 섞여 있다. 질문 문구가
    // 바뀌면(43회차 한화 Q3 중립 문구) 옛 문구 행이 남아 9번 표에 같은
    // 역량 행이 두 개 뜨는 잔재 엣지를 막는다. 안정 키는 분석 때마다 다시
    // 매겨져 다른 채용공고와 겹칠 수 있어 인용문까지 같이 본다.
    const RANK = { strong: 2, usable: 1, missing: 0 };
    const base = Array.isArray(placements) ? [...placements] : [];
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const questionKey = (row) => {
      const key = String(row?.jdqId || "");
      const quote = String(row?.jdRequirement?.text || "");
      return key && quote ? `${key}\u0000${quote}` : "";
    };
    const byKey = new Map();
    const byQuestion = new Map();
    base.forEach((row, index) => {
      const key = normalize(row?.question?.text);
      if (key && !byKey.has(key)) byKey.set(key, index);
      const qk = questionKey(row);
      if (qk && !byQuestion.has(qk)) byQuestion.set(qk, index);
    });
    let upgraded = false;
    (Array.isArray(jdqPlacements) ? jdqPlacements : []).forEach((row) => {
      const key = normalize(row?.question?.text);
      if (!key) return;
      let index = byKey.get(key);
      if (index === undefined) index = byQuestion.get(questionKey(row));
      if (index === undefined) {
        byKey.set(key, base.length);
        const qk = questionKey(row);
        if (qk) byQuestion.set(qk, base.length);
        base.push(row);
        return;
      }
      byKey.set(key, index);
      const current = base[index];
      const currentRank = RANK[current?.status] ?? 0;
      const jdqRank = RANK[row?.status] ?? 0;
      if (!row?.experience || jdqRank <= currentRank) return;
      const label = String(row.experience.label || "");
      const reasoning = String(row.reasoning || "").trim()
        || `채용공고에서 나온 질문에서 '${label}' 경험이 ${row.status === "strong" ? "직접" : "간접"} 연결됐습니다.`;
      base[index] = {
        ...current,
        experience: row.experience,
        profileEvidenceQuote: row.profileEvidenceQuote || current.profileEvidenceQuote || "",
        status: row.status,
        reasoning,
        writingAngle: row.writingAngle || current.writingAngle || "",
        missingInfo: row.status === "strong" ? "" : (current.missingInfo || ""),
        jdqLinked: true,
      };
      upgraded = true;
    });
    // 경험이 바뀐 경우에만 반복 사용 횟수를 다시 센다. 바뀌지 않았으면
    // 입력과 같은 모양을 그대로 돌려준다.
    if (!upgraded) return base;
    const reuse = {};
    base.forEach((row) => { if (row?.experience?.id) reuse[row.experience.id] = (reuse[row.experience.id] || 0) + 1; });
    return base.map((row) => (row && typeof row === "object"
      ? { ...row, reuseCount: row.experience ? reuse[row.experience.id] || 1 : 0 }
      : row));
  }

  function countPlacementStatuses(placements = []) {
    const counts = { strong: 0, usable: 0, missing: 0 };
    (Array.isArray(placements) ? placements : []).forEach((row) => {
      if (row?.status === "strong") counts.strong += 1;
      else if (row?.status === "usable") counts.usable += 1;
      else counts.missing += 1;
    });
    return counts;
  }

  function buildResumeSections(profile = {}) {
    const clean = (value) => String(value ?? "").trim();
    const join = (values, separator) => values.map(clean).filter(Boolean).join(separator);
    const line = (label, value) => clean(value) ? `${label}: ${clean(value)}` : "";
    const rows = (values) => join(values, "\n");
    const period = (row) => join([row.startDate, row.endDate], " ~ ");
    const education = (profile.educations || []).map((row) => rows([
      join([row.school, row.level, row.status], " · "),
      line("전공", row.major), line("복수·부·세부전공", row.secondaryMajor),
      line("기간", period(row)), line("평균 학점", row.gpa ? join([row.gpa, row.gpaScale], " / ") : ""),
      line("총 이수학점", row.credits), line("학교 소재지", row.region), line("편입", row.transfer),
      line("이수 과목", row.coursework), line("지도교수", row.advisor), line("연구실", row.lab),
      line("연구 분야", row.research), line("논문", row.theses), line("학회", row.conferences),
    ]));
    const experience = (profile.experiences || []).map((row) => rows([
      join([row.title, row.type, row.organization], " · "),
      line("기간", period(row)), line("역할", row.role), line("배경·목표", row.situation),
      line("활동 내용", row.action), line("결과", row.result),
      line("기술·장비", row.tools), line("확인한 수치", row.verifiedNumbers),
    ]));
    return [
      { title: "기본정보", entries: [rows([line("이름", profile.name), line("이메일", profile.email), line("연락처", profile.phone)])] },
      { title: "학력", entries: education },
      { title: "경력·프로젝트·활동", entries: experience },
      { title: "교육·기술", entries: [clean(profile.skills)] },
      { title: "자격증", entries: [clean(profile.certificates)] },
      { title: "어학", entries: [clean(profile.languages)] },
      { title: "수상", entries: [clean(profile.awards)] },
    ].map((section) => ({ ...section, entries: section.entries.filter(Boolean) }))
      .filter((section) => section.entries.length);
  }

  function buildResumeText(profile = {}) {
    const sections = buildResumeSections(profile);
    if (!sections.length) throw new Error("복사할 이력서 내용이 없습니다.");
    return sections.map(({ title, entries }) => `[${title}]\n${entries.join("\n\n")}`).join("\n\n");
  }

  // 24회차: 저장한 지원 작업 한눈에 보기. 초안은 작업 범위(scope) 접두사가
  // 붙은 키로 저장되니, 해당 작업의 초안만 셀 수 있다. 값은 문자열이거나
  // {current} 형태라 둘 다 확인한다. 빈 초안은 세지 않는다.
  function countWorkspaceDrafts(drafts = {}, workspaceId = "") {
    const prefix = String(workspaceId || "").trim();
    if (!prefix) return 0;
    return Object.entries(drafts || {}).filter(([key, value]) => {
      if (!String(key).startsWith(`${prefix}::`)) return false;
      const text = typeof value === "string" ? value : value?.current;
      return String(text || "").trim().length > 0;
    }).length;
  }

  // 24회차: 저장 목록 카드에 보여줄 진행 상태. 단계는 저장된 결과가
  // 어디까지 있는지로 정한다. 2 = 분석만, 3 = 경험 연결까지,
  // 4 = 자기소개서 문항 연결까지. 초안 개수는 제출본 기준(연습 문항 제외).
  function summarizeWorkspace(snapshot = {}, drafts = {}) {
    const connections = snapshot?.profileConnections?.matches || [];
    const counts = snapshot?.profileConnections?.counts || {};
    const placements = submissionPlacements(snapshot?.questionMap?.placements || []);
    const questionCount = placements.length;
    const draftCount = countWorkspaceDrafts(drafts, snapshot?.id);
    return {
      id: snapshot?.id || "",
      company: snapshot?.company || "",
      role: snapshot?.role || "",
      savedAt: snapshot?.savedAt || "",
      step: questionCount ? 4 : connections.length ? 3 : 2,
      connectionCounts: {
        direct: counts.direct ?? 0,
        indirect: counts.indirect ?? 0,
        none: counts.none ?? 0,
      },
      questionCount,
      draftCount,
    };
  }

  const api = {
    STATUS_LABELS, draftId, workspaceScope, normalizeWorkspaceLibrary, upsertWorkspace, removeWorkspace,
    mergeWorkspaceLibraries, buildWorkspaceBackup, normalizeWorkspaceBackup,
    compareWorkspaceFacts, countWorkspaceDrafts, summarizeWorkspace,
    buildJdReportText, buildJdqPlacement, mergeJdqPlacements, countPlacementStatuses, submissionPlacements,
    summarize, readDraft, addHistory, historyFor, draftTokens,
    findDraftOverlaps, numericClaims, reviewPackage, inferCharacterLimit, placeholderMarkers, buildSubmissionChecklist,
    buildSubmissionText, buildText, buildResumeSections, buildResumeText,
  };
  root.ApplicationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
