(function (root) {
  "use strict";

  // 8·9번 로컬 폴백 (14회차): Apps Script 엔드포인트가 없을 때 JD 분석
  // 결과(1~7번, 로컬) + 저장된 프로필 원문만으로 8번 "JD와 내 경험 연결
  // 분석"과 9번 "문항별 경험 배치"를 만든다. 서버 결과와 같은 형태를
  // 반환해 app.js의 렌더러·초안 저장·점검을 그대로 쓴다.
  // - 연결은 jd-recall-questions.js의 토큰 overlap 규칙만 쓴다 (AI 없음).
  //   직접 판정은 Apps Script jdHasDirectActionEvidence_와 같은 강등 규칙을 따른다.
  // - 없는 경험은 만들지 않는다. 근거가 없으면 none/missing으로 남기고
  //   [보완 필요]로 표시한다. 계획 중인 프로젝트는 프로필 원문
  //   (toEvidenceEntries)에 들어가지 않으므로 초안·뼈대에 절대 들어가지 않는다.
  // - 프로필 원문의 항목 라벨("문제·목표", "행동", "결과" 등)은 매칭용
  //   텍스트에서만 뺀다. 라벨이 매칭 어간이 되면("목표"가 모든 경험에
  //   붙어 있어) 엉뚱한 경험이 연결되기 때문이다. 화면에 보이는 발췌는
  //   원래 프로필 원문 그대로(verbatim) 쓴다.
  // - source: "local"을 결과에 넣어 렌더러가 서버 결과와 구분한다.

  // 46회차 (45회차 객관 검토 B9): 8·9번 요구사항 상한을 20개에서 40개로
  // 올린다. 현대차 실전 JD는 요구사항 26개(직무 14 + 우대 2 + 도구 10)라
  // 20개 상한에 도구 6개(C#, C, JavaScript, CAD, CATIA, DM Works)가
  // 조용히 잘렸다. 상한을 넘기면 자른 개수를 totalRequirementCount로
  // 돌려줘 화면에 밝힌다.
  const MAX_REQUIREMENTS = 40;
  const MAX_QUESTIONS = 8;

  // 매칭에서 제외하는 일반 어간: JD·문항·경험에 두루 나오는 말이라
  // 이것만 겹친다고 연결하지 않는다.
  const GENERIC_STEMS = ["반도체", "공정", "경험", "수행", "분석", "활용", "작성", "주세요", "관련", "지원", "직무", "문항", "내용", "자기소개서", "있는", "분", "목표", "행동", "결과", "역할", "기술", "도구"];

  // 프로필 원문의 " · " 구간 앞에 붙는 항목 라벨. 매칭용 텍스트에서만 뺀다.
  const ENTRY_LABELS = ["역할", "문제·목표", "행동", "결과", "기술·도구", "본인 확인 추가 경험", "경험 메모", "관련 과목", "연구", "보유 기술 및 교육", "자격", "어학", "학점", "이수학점"];
  function matchText(text) {
    return String(text || "").split(" · ").map((segment) => {
      const seg = segment.trim();
      for (const label of ENTRY_LABELS) {
        if (seg === label) return "";
        if (seg.startsWith(label + " ") || seg.startsWith(label + ":")) {
          return seg.slice(label.length + 1).trim();
        }
      }
      return seg;
    }).filter(Boolean).join(" · ");
  }

  function recall() {
    const r = root.JdRecallQuestions;
    if (!r) throw new Error("채용공고에서 나온 질문 기능이 로드되지 않았습니다. 페이지를 새로고침해 주세요.");
    return r;
  }

  // 발췌는 120자에서 자르되, 단어·구간 중간이 아니라 " · " 구간 경계에서
  // 자른다. 이전에는 120자 하드 컷이라 "대학 Fab 교육 이"처럼 단어
  // 중간에서 끊겼다 (품질 검증 2026-11-05 발견). 경계가 없으면 공백에서
  // 자르고, 그것도 없으면 120자에서 자른다. "…"는 붙이지 않는다 —
  // 발췌는 프로필 원문의 일부여야 한다는 검증이 있기 때문이다.
  function excerpt(text) {
    const value = String(text || "");
    if (value.length <= 120) return value;
    const cut = value.slice(0, 120);
    const boundary = cut.lastIndexOf(" · ");
    if (boundary > 0) return cut.slice(0, boundary);
    const space = cut.lastIndexOf(" ");
    if (space > 0) return cut.slice(0, space);
    return cut;
  }

  // app.js jdProfileRequirements() 출력 {kind, text, evidenceQuote}을
  // 서버와 같은 R번호 요구사항으로 바꾼다.
  function normalizeRequirements(requirements) {
    return (Array.isArray(requirements) ? requirements : []).slice(0, MAX_REQUIREMENTS).map((row, index) => ({
      id: `R${index + 1}`,
      kind: String(row && row.kind || "채용공고 내용").slice(0, 30),
      text: String(row && row.text || row && row.evidenceQuote || "").trim(),
      evidenceQuote: String(row && row.evidenceQuote || ""),
    })).filter((row) => row.text);
  }

  // 프로필 원문 항목을 E번호로 바꾼다. E번호는 app.js의
  // state.questionProfileEntries 순서(배치의 수치 점검·경험 재사용 집계가
  // E번호로 항목을 찾기 때문)와 같아야 한다.
  function normalizeEntries(profileEntries) {
    return (Array.isArray(profileEntries) ? profileEntries : []).map((row, index) => ({
      id: `E${index + 1}`,
      originalId: row && row.id,
      kind: String(row && row.kind || "경험").slice(0, 30),
      label: String(row && row.label || `경험 ${index + 1}`).slice(0, 100),
      text: String(row && row.text || "").trim(),
      // 36회차: 확인한 수치를 별도 필드로 들고 다닌다. 원문(text)에는
      // 값만 들어 있고(라벨 없음 — profile-store-v2.js 참조), 뼈대·
      // JDQ 카드에서 "확인한 수치"로 따로 보여주려면 필드가 필요하다.
      verifiedNumbers: String(row && row.verifiedNumbers || "").slice(0, 200),
    })).filter((row) => row.text);
  }

  // 매칭용 항목: 원문 id는 유지하고 텍스트만 라벨을 뺀 것이다.
  function matchingEntries(entries) {
    return entries.map((row) => ({ id: row.originalId, kind: row.kind, label: row.label, text: matchText(row.text) }));
  }

  function toE(entries, matched) {
    const index = entries.findIndex((row) => row.originalId === matched.id);
    if (index < 0) return { id: String(matched.id || ""), kind: matched.kind, label: matched.label, verifiedNumbers: String(matched.verifiedNumbers || "") };
    return { id: entries[index].id, kind: entries[index].kind, label: entries[index].label, verifiedNumbers: entries[index].verifiedNumbers || "" };
  }

  // 원문에서 발췌한다 (매칭용 텍스트가 아니라 원래 프로필 원문).
  function originalExcerpt(entries, matched) {
    const found = entries.find((row) => row.originalId === matched.id);
    return excerpt(found ? found.text : matched.text);
  }

  // 판정 근거로 보여줄 공유 어간: 구체 어간을 먼저, 없으면 다리 어간.
  // 한 어간이 다른 어간의 일부면("프로젝트" ⊂ "직무마스터프로젝트")
  // 짧은 쪽만 보여줘 중복을 줄인다.
  function sharedLabel(matched) {
    const specific = (matched.matchedTokens || []).filter((t) => !GENERIC_STEMS.includes(t));
    const tokens = [...new Set([...specific, ...(matched.bridgeTokens || [])])];
    const deduped = tokens.filter((t) => !tokens.some((u) => u !== t && u.length < t.length && t.includes(u)));
    return deduped.slice(0, 3).join(" · ");
  }

  // 41회차: 명시 Tool 요구사항 종류. app.js는 "명시된 도구", 테스트
  // 헬퍼는 "명시 Tool"을 쓴다. 둘 다 도구 이름 자체를 본다.
  function isToolRequirement(req) {
    const kind = String(req && req.kind || "");
    return kind === "명시 Tool" || kind === "명시된 도구";
  }

  // 41회차: 도구 이름이 경험 원문에 언급됐는지 단어 경계로 본다.
  // "PLC", "Python", "MATLAB", "CATIA"가 그대로 나오면 언급이다.
  // "CAD"가 "Auto-CAD" 속에 있어도 하이픈은 경계라 잡힌다.
  // "C"는 "CAD"·"CD" 속 C와 구분된다 (뒤가 영숫자면 언급이 아니다).
  // 하이픈 표기 차이("E-FOREST" vs "EFOREST")는 하이픈을 떼고 본다.
  // 46회차 (45회차 객관 검토 B2): 도구명 뒤 조사·어미(으로/로/을/를/
  // 이/가/와/과/도/만/에서/에게/의/에)도 경계로 본다 — "Python으로",
  // "CAD로", "PLC를"도 도구 언급이다. 기존 경계 정규식은 조사(가-힣)를
  // 경계로 못 봐서 조사 붙은 표기는 전부 못 알아보고 bare 표기만 봤다.
  // 한국어 표기도 정규화한다 ("파이썬"→Python, "캐드"→CAD, "C언어"→C) —
  // 원문 표기와 도구명 표기가 달라도 같은 도구로 본다.
  const TOOL_ALIASES = { "파이썬": "python", "캐드": "cad", "c언어": "c" };
  function mentionsTool(experienceText, toolName) {
    let text = String(experienceText || "").toLowerCase();
    const name = String(toolName || "").trim().toLowerCase();
    if (!name) return false;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 원문 속 한국어 표기를 표준 표기로 바꾼다.
    for (const [ko, en] of Object.entries(TOOL_ALIASES)) {
      text = text.replace(new RegExp(esc(ko), "g"), en);
    }
    // 도구명 자체가 한국어 표기면 표준 표기로 바꾼다.
    const canonical = TOOL_ALIASES[name] || name;
    // 도구명 뒤에 오는 조사·어미는 경계다. 조사 뒤에 한글이 바로 오면
    // 더 긴 단어의 일부라 경계가 아니다 ("Python로봇"의 "로"는 조사가 아님).
    // "이다"(서술격 조사)도 경계로 본다 — "주 언어는 Python이다" 같은 문장.
    const particle = "(이다|으로|로|을|를|이|가|와|과|도|만|에서|에게|의|에)(?![가-힣])";
    const boundary = new RegExp(`(^|[^a-z0-9가-힣])${esc(canonical)}(${particle}|[^a-z0-9가-힣]|$)`, "i");
    if (boundary.test(text)) return true;
    const flat = (s) => s.replace(/[-‐_]/g, "");
    const flatName = flat(canonical);
    if (flatName !== canonical && flatName.length > 1) {
      const flatText = flat(text);
      if (new RegExp(`(^|[^a-z0-9가-힣])${esc(flatName)}(${particle}|[^a-z0-9가-힣]|$)`, "i").test(flatText)) return true;
    }
    return false;
  }

  // 46회차 (45회차 객관 검토 B5): 명시 Tool 요구사항에서 도구명을 언급한
  // 경험을 다시 찾는다. 최고점 경험이 도구 언급이 없어 간접으로 강등됐거나,
  // 토큰 겹침(2개)이 안 돼 직접이 안 나왔을 때 쓴다. "Python 실습"처럼
  // 짧아 요구사항과 겹치는 어간이 1개뿐인 경험도 도구 언급이 있으면
  // 직접이다 — 도구 언급 자체가 직접 근거다. 후보 중 요구사항과 겹치는
  // 구체 어간이 가장 많은 경험을 쓴다.
  function findToolMentionExperience(candidateText, entries, toolName) {
    const r = recall();
    const candTokens = new Set(r.stemmedTokens(candidateText));
    let best = null;
    for (const entry of entries || []) {
      if (!mentionsTool(entry.text, toolName)) continue;
      const entryTokens = r.stemmedTokens(entry.text);
      const shared = entryTokens.filter((t) => [...candTokens].some((c) => r.tokenMatches(c, t)));
      const specific = shared.filter((t) => !GENERIC_STEMS.includes(t));
      const score = specific.length * 2 + Math.min(shared.length, 3);
      if (!best || score > best.score) best = { score, entry };
    }
    return best ? best.entry : null;
  }

  // 8번 로컬 연결 분석. Apps Script jdMatchProfile_과 같은 결과 형태.
  function matchProfileLocal(input) {
    const r = recall();
    const totalRequirementCount = Array.isArray(input && input.requirements) ? input.requirements.length : 0;
    const requirements = normalizeRequirements(input && input.requirements);
    const entries = normalizeEntries(input && input.profileEntries);
    if (!requirements.length) throw new Error("연결할 채용공고 요구사항을 확인하지 못했습니다. 채용공고를 다시 분석해 주세요.");
    if (!entries.length) throw new Error("연결할 프로필 경험이 없습니다. 내 프로필을 먼저 작성해 주세요.");
    const matchable = matchingEntries(entries);
    const matches = requirements.map((req) => {
      const candidateText = [req.text, req.evidenceQuote].filter(Boolean).join(" ");
      let linked = r.findLinkedExperience(candidateText, matchable);
      let indirect = null;
      // Apps Script 패리티: 주요 업무(duty)가 요구하는 구체 행동이
      // 프로필 원문에 없으면 직접이 아니라 간접으로 강등한다.
      if (linked && req.kind === "주요 업무" && !r.hasDirectActionEvidence(req.text, linked.text, "duty")) {
        indirect = linked;
        linked = null;
      }
      // 36회차: 주요 업무 중 process_yield 종류이면서 개선·변경을
      // 요구하는 문장은 JDQ(35회차)와 같은 기준으로 조건 변경 +
      // 측정·비교 근거를 본다. 요구 문장에 목록 행동어가 없어
      // hasDirectActionEvidence가 기본값 true를 돌려줘도, 조건을 바꿔
      // 측정한 적이 없는 경험은 직접이 아니라 간접이다 (실전 현대차
      // Q1과 같은 오판 — JDQ에서는 강등됐는데 8번에서는 직접으로 남아
      // 있었다). 단, 품질 검사·시험 수행처럼 개선·변경을 요구하지
      // 않는 문장은 그대로 둔다 (방산 품질 검사 실습은 직접 수행한
      // 검사라 직접이 정직하다). programming_data 등 다른 종류의
      // 기본값 true 직접(현대차 "데이터 정리" vs "검토")은 아래
      // 37회차 규칙이 다룬다.
      if (linked && req.kind === "주요 업무" && r.classify(req.text) === "process_yield" && /향상|개선|최적화|변경|조정/.test(req.text) && !r.hasConditionChangeEvidence(linked.text)) {
        indirect = linked;
        linked = null;
      }
      // 37회차: 주요 업무가 수행·판단을 묻는데 연결된 경험 원문에 수행
      // 동사가 하나도 없으면(조사·정리·발표만 한 학습 전용 경험) 직접이
      // 아니라 간접이다. 한화 [1] 동아리 "조립 공정 흐름 정리와 발표"가
      // 제조·조립·생산 수행에, 현대차 [4] 현장실습 "가동률 데이터 정리"가
      // "검토"에 직접 연결되던 과장을 막는다. 이해·학습을 묻는 요구사항에는
      // 적용하지 않는다 (방산 공정 흐름·원리 이해, 프로젝트 학습 경험은
      // 조사·정리가 정당한 근거라 직접을 유지한다). 품질 검사 실습은
      // 측정·기록 수행 동사가 있어 직접을 유지한다. hasDirectActionEvidence는
      // 건드리지 않는다 (35회차 "수행" 목록 추가 불가 결정 유지).
      if (linked && req.kind === "주요 업무" && r.requiresPerformanceAction(req.text) && !r.hasPerformActionEvidence(linked.text, linked)) {
        indirect = linked;
        linked = null;
      }
      // 41회차: 명시 Tool 요구사항은 도구 이름 자체가 경험 원문에 있어야
      // 직접이다. 근거 문장 속 일반어("프로젝트·설계", "데이터")와의 겹침만으로
      // 직접이 되면, PLC·Python·C++을 쓴 적 없는 경험이 직접 연결된다
      // (실전 현대차 8번 [18] PLC·[19] Python·[20] C++). 도구 이름이
      // 원문에 없으면 간접으로 강등한다 — 간접은 부분 배경으로 남는다.
      // 한화 CATIA도 같은 이유로 간접이 된다 (CAD 일반은 썼지만 CATIA
      // 언급은 없다). CAD는 원문에 "CAD"가 있어 직접을 유지한다.
      if (linked && isToolRequirement(req) && !mentionsTool(linked.text, req.text)) {
        indirect = linked;
        linked = null;
      }
      // 46회차 (45회차 객관 검토 B5): 명시 Tool 요구사항은 도구 언급 자체가
      // 직접 근거다. 최고점 경험이 강등됐거나 토큰 겹침이 안 돼 직접이
      // 안 나왔어도, 도구명을 언급한 경험이 있으면 그중 요구사항과 가장
      // 겹치는 경험을 직접으로 다시 찾는다. JDQ 경로의 R32 강등-다리
      // 교체와 같은 취지다.
      if (isToolRequirement(req) && !linked) {
        const retry = findToolMentionExperience(candidateText, matchable, req.text);
        if (retry) { linked = retry; indirect = null; }
      }
      if (!linked && !indirect) {
        indirect = r.findIndirectExperience(candidateText, r.classify(candidateText), matchable, null);
      }
      const connected = linked || indirect;
      const status = linked ? "direct" : indirect ? "indirect" : "none";
      const shared = connected ? sharedLabel(connected) : "";
      const reasoning = status === "direct"
        ? `'${connected.label}' 원문과 채용공고 문장에서 '${shared}'가 겹쳐 직접 연결했습니다.`
        : status === "indirect"
          ? `'${connected.label}' 원문은 직접 경험이 아니라 부분 배경입니다.${shared ? ` 공유 개념: ${shared}.` : ""}`
          : "저장된 프로필 원문에서 직접 연결할 근거를 확인하지 못했습니다.";
      const writingDirection = status === "direct"
        ? "채용공고 요구사항과 직접 연결되는 행동·결과를 중심으로 쓰세요. 경험 원문에 없는 수치는 넣지 마세요."
        : status === "indirect"
          ? "연결되는 부분만 쓰고, 직접 수행하지 않은 부분은 [보완 필요]로 남기세요."
          : "";
      return {
        requirement: { id: req.id, kind: req.kind, text: req.text },
        status,
        experience: connected ? toE(entries, connected) : null,
        profileEvidenceQuote: connected ? originalExcerpt(entries, connected) : "",
        reasoning,
        writingDirection,
      };
    });
    const counts = { direct: 0, indirect: 0, none: 0 };
    matches.forEach((row) => { counts[row.status] += 1; });
    return { matches, counts, requirementCount: requirements.length, totalRequirementCount, profileEntryCount: entries.length, source: "local" };
  }

  // 문항 의도를 가르는 작은 분류기. 의도 문구는 고정 문장이라
  // 원문에 없는 내용을 만들지 않는다. 22회차: 방향 키워드도 함께 둔다.
  // 로컬 검토가 초안에 문항이 묻는 방향이 보이는지 대조한다.
  const INTENT_RULES = [
    { key: "motivation", pattern: /지원\s*동기|지원하게 된|왜.*지원|입사.*이유|지원.*이유/i, sentence: "지원 동기와 직무 적합성을 묻는 문항입니다.", direction: "지원한 이유와 직무 적합성", keywords: ["지원", "관심", "이유", "계기", "매력", "끌렸", "끌려", "선택", "입사"] },
    { key: "challenge", pattern: /어려운|도전|극복|실패|문제.*해결|난관/i, sentence: "어려운 목표나 문제에 도전해 극복한 경험을 묻는 문항입니다.", direction: "어려운 목표에 도전해 극복한 과정", keywords: ["극복", "해결", "도전", "개선", "시도", "바꿨", "바꿔", "바꾼", "고쳤", "고쳐", "고친", "이겨", "이긴", "이겼", "해냈", "해내", "넘었", "넘어", "넘은", "포기하지", "끝까지", "돌파"] },
    { key: "teamwork", pattern: /협업|팀|갈등|소통|협력|유관 부서/i, sentence: "팀 협업·소통 경험을 묻는 문항입니다.", direction: "팀과 함께한 협업·소통", keywords: ["팀", "함께", "협력", "소통", "조율", "동료", "의견", "갈등", "협의", "역할"] },
    { key: "growth", pattern: /배운|성장|학습|발전|깨달은/i, sentence: "배우고 성장한 경험을 묻는 문항입니다.", direction: "배우고 성장한 내용", keywords: ["배웠", "배운", "성장", "깨달", "배움", "알게", "느꼈", "얻었", "얻은"] },
    { key: "strength", pattern: /강점|약점|장단점|성격/i, sentence: "본인의 강점·약점을 묻는 문항입니다.", direction: "본인의 강점·약점", keywords: ["강점", "장점", "약점", "단점", "성격", "잘하는", "잘한"] },
    { key: "future", pattern: /입사 후|목표|계획|포부|비전/i, sentence: "입사 후 목표·계획을 묻는 문항입니다.", direction: "입사 후 목표·계획", keywords: ["입사", "목표", "계획", "기여", "포부", "비전", "이루"] },
  ];

  function intentOf(questionText) {
    const found = INTENT_RULES.find((rule) => rule.pattern.test(String(questionText || "")));
    return found ? found.sentence : "경험 서술 문항입니다. 문항 의도를 구체적으로 해석할 근거가 부족합니다.";
  }

  // 로컬 검토용: 문항 의도가 가려지면 묻는 방향과 그 방향을 보여주는
  // 단어를 돌려준다. 의도를 가릴 수 없으면 null이라 대조하지 않는다.
  function intentDirection(questionText) {
    const found = INTENT_RULES.find((rule) => rule.pattern.test(String(questionText || "")));
    return found ? { direction: found.direction, keywords: found.keywords } : null;
  }

  // 9번 로컬 문항별 배치. Apps Script jdMapQuestions_와 같은 결과 형태.
  // 배치 순서: (1) 문항과 겹치는 채용공고 요구사항 중 연결된 경험이 있는 것,
  // (2) 채용공고 요구사항과 안 겹치면 문항–경험 직접 겹침,
  // (3) 문항이 "지원 직무와 관련된 경험"처럼 특정 요구사항을 지목하지
  // 않으면, 채용공고와 가장 강하게 연결되는 경험으로 넓게 배치한다(usable).
  // 셋 다 없으면 missing + [보완 필요].
  function mapQuestionsLocal(input) {
    const r = recall();
    const questions = (Array.isArray(input && input.questions) ? input.questions : [])
      .map((value, index) => ({ id: `Q${index + 1}`, text: String(value || "").replace(/\s+/g, " ").trim() }))
      .filter((row) => row.text).slice(0, MAX_QUESTIONS);
    const totalRequirementCount = Array.isArray(input && input.requirements) ? input.requirements.length : 0;
    const requirements = normalizeRequirements(input && input.requirements);
    const entries = normalizeEntries(input && input.profileEntries);
    if (!questions.length) throw new Error("연결할 자기소개서 문항이 없습니다.");
    if (!entries.length) throw new Error("연결할 프로필 경험이 없습니다. 내 프로필을 먼저 작성해 주세요.");
    const match = matchProfileLocal({ requirements: input && input.requirements, profileEntries: input && input.profileEntries });
    const matchByReqId = Object.fromEntries(match.matches.map((row) => [row.requirement.id, row]));
    const matchable = matchingEntries(entries);

    const placements = questions.map((question) => {
      const intent = intentOf(question.text);
      const qTokens = new Set(r.stemmedTokens(question.text));
      let bestReq = null;
      for (const req of requirements) {
        const reqTokens = r.stemmedTokens(`${req.text} ${req.evidenceQuote || ""}`);
        const shared = [...new Set(reqTokens.filter((t) => [...qTokens].some((c) => r.tokenMatches(c, t)) && !GENERIC_STEMS.includes(t)))];
        if (!shared.length) continue;
        const m = matchByReqId[req.id];
        // 문항–경험 겹침도 순위에 반영한다. 요구사항 어간만으로는
        // "품질" 1개가 겹치는 품질 검사 요구사항이, 조건 변경 의도의
        // 문항을 생산 공정 운영 요구사항보다 앞서는 오배치가 생겼다
        // (방산 JDQ-04 문항: 품질 검사 실습 대신 CNC 가공 실습이 답이다).
        // 직접 보너스(+2)보다 작게, 최대 4까지만 더한다. 경험은
        // 매칭용 텍스트(라벨 제외)로 본다.
        // 간접 연결이면 33회차 다리 규칙과 같은 방식으로, 문항·요구사항과
        // 다리가 있는 더 강한 경험이 있는지 보고 그 경험을 기준으로
        // 겹침을 센다. 8번의 간접 경험(동아리)이 약한 연결이라 그대로
        // 쓰면 조건 변경 문항이 품질 검사 요구사항에 진다.
        let expEntry = null;
        if (m && m.experience) {
          const norm = entries.find((e) => e.id === m.experience.id);
          expEntry = norm ? matchable.find((me) => me.id === norm.originalId) : null;
          if (m.status === "indirect" && expEntry) {
            const kind = r.classify(req.text);
            if (!r.bridgeStems(kind, expEntry.text).length) {
              const combined = `${question.text} ${req.text} ${req.evidenceQuote || ""}`;
              const bridged = r.findIndirectExperience(combined, kind, matchable, null);
              const specificShared = (bridged?.matchedTokens || []).filter((t) => !["반도체", "공정", "경험", "수행", "분석", "활용", "관련"].includes(t));
              if (bridged && specificShared.length) {
                const bridgedEntry = matchable.find((me) => me.id === bridged.id);
                if (bridgedEntry) expEntry = bridgedEntry;
              }
            }
          }
        }
        let expShared = 0;
        if (expEntry) {
          const expTokens = new Set(r.stemmedTokens(expEntry.text));
          expShared = Math.min(4, [...expTokens].filter((t) => [...qTokens].some((c) => r.tokenMatches(c, t)) && !GENERIC_STEMS.includes(t)).length);
        }
        const rank = shared.length * 2 + (m && m.status === "direct" ? 2 : m && m.status === "indirect" ? 1 : 0) + expShared;
        if (!bestReq || rank > bestReq.rank) bestReq = { req, shared, rank, match: m };
      }
      if (bestReq && bestReq.match && bestReq.match.status !== "none") {
        const m = bestReq.match;
        const status = m.status === "direct" ? "strong" : "usable";
        let experience = m.experience;
        let profileEvidenceQuote = m.profileEvidenceQuote;
        let reasoning = `'${bestReq.req.text}' 요구사항과 문항이 '${bestReq.shared.slice(0, 3).join(" · ")}'로 연결되고, '${m.experience.label}' 경험이 그 요구사항에 ${m.status === "direct" ? "직접" : "간접"} 연결됩니다.`;
        // 33회차: 간접 배치인데 연결된 경험이 요구사항 종류의 다리 어간을
        // 하나도 공유하지 않으면, 문항+요구사항으로 다리가 있는 다른 경험을
        // 찾아 쓴다 (32회차 JDQ 강등-다리 규칙과 같은 원칙). 방산 Q1이
        // 조립 흐름만 정리한 동아리 대신 조건을 바꿔 측정한 CNC 가공 실습으로
        // 배치된다. 다리가 있으면 강등 경험을 그대로 둔다. 상태는 usable
        // 그대로라 직접으로 올리지 않는다. 다리 체크는 항목 라벨을 뺀
        // 매칭용 텍스트로 한다 (라벨이 다리 어간과 겹치는 것을 막기 위해).
        if (m.status === "indirect") {
          const kind = r.classify(bestReq.req.text);
          const currentEntry = entries.find((e) => e.id === m.experience.id);
          const currentMatchable = currentEntry ? matchable.find((me) => me.id === currentEntry.originalId) : null;
          const currentText = currentMatchable ? currentMatchable.text : m.profileEvidenceQuote;
          if (!r.bridgeStems(kind, currentText).length) {
            const combined = `${question.text} ${bestReq.req.text} ${bestReq.req.evidenceQuote || ""}`;
            const bridged = r.findIndirectExperience(combined, kind, matchable, null);
            // 다리만 있고 문항·요구사항과 겹치는 구체 어간이 하나도 없으면
            // 바꾸지 않는다. 현대차 Q2(설비 고장 대응)에서 캡스톤이
            // 동선·최적화 다리만으로 붙는 오연결이 나왔다 — 고장 대응
            // 문항과 겹치는 어간이 하나도 없는데 다리 점수만으로 이겼기
            // 때문이다. 다리 + 구체 어간이 함께 있어야 교체한다.
            // (방산 CNC는 가공·조건, 현대차 Q1 캡스톤은 라인으로 통과한다.)
            const specificShared = (bridged?.matchedTokens || []).filter((t) => !["반도체", "공정", "경험", "수행", "분석", "활용", "관련"].includes(t));
            if (bridged && specificShared.length) {
              const bridgedE = toE(entries, bridged);
              if (bridgedE.id !== m.experience.id) {
                experience = bridgedE;
                profileEvidenceQuote = originalExcerpt(entries, bridged);
                reasoning = `'${bestReq.req.text}' 요구사항과 문항이 '${bestReq.shared.slice(0, 3).join(" · ")}'로 연결됩니다. '${bridged.label}' 경험이 문항·요구사항과 '${sharedLabel(bridged)}'로 부분 배경이 되어 간접 연결됩니다.`;
              }
            }
          }
        }
        return {
          question,
          intent,
          status,
          experience,
          profileEvidenceQuote,
          jdRequirement: { id: bestReq.req.id, kind: bestReq.req.kind, text: bestReq.req.text },
          reasoning,
          writingAngle: status === "strong"
            ? `'${experience.label}'에서 한 행동과 그 결과를 중심으로 쓰세요.`
            : `'${experience.label}' 중 문항과 연결되는 부분만 쓰고, 직접 경험이 아닌 부분은 [보완 필요]로 남기세요.`,
          missingInfo: status === "strong" ? "" : "연결되지 않은 부분(역할·수치·결과)을 프로필에 추가로 기록해 주세요.",
          reuseCount: 0,
        };
      }
      // 문항–경험 직접 겹침 (채용공고 요구사항과 안 겹칠 때만).
      const linked = r.findLinkedExperience(question.text, matchable);
      if (linked) {
        return {
          question,
          intent,
          status: "usable",
          experience: toE(entries, linked),
          profileEvidenceQuote: originalExcerpt(entries, linked),
          jdRequirement: null,
          reasoning: `문항과 '${linked.label}' 경험 원문에서 '${sharedLabel(linked)}'가 겹치지만, 채용공고 요구사항과 직접 연결되지는 않습니다.`,
          writingAngle: `'${linked.label}' 중 문항과 연결되는 부분만 쓰고, 채용공고 요구사항과의 연결을 추가로 확인해 주세요.`,
          missingInfo: "채용공고 요구사항과 연결되는지 추가로 확인해 주세요.",
          reuseCount: 0,
        };
      }
      const indirect = r.findIndirectExperience(question.text, r.classify(question.text), matchable, null);
      if (indirect) {
        return {
          question,
          intent,
          status: "usable",
          experience: toE(entries, indirect),
          profileEvidenceQuote: originalExcerpt(entries, indirect),
          jdRequirement: null,
          reasoning: `문항과 '${indirect.label}' 경험 원문은 직접 연결이 아니라 부분 배경입니다.${sharedLabel(indirect) ? ` 공유 개념: ${sharedLabel(indirect)}.` : ""}`,
          writingAngle: `'${indirect.label}' 중 문항과 연결되는 부분만 쓰고, 직접 경험이 아닌 부분은 [보완 필요]로 남기세요.`,
          missingInfo: "연결되지 않은 부분(역할·수치·결과)을 프로필에 추가로 기록해 주세요.",
          reuseCount: 0,
        };
      }
      // 특정 요구사항을 지목하지 않는 문항("지원 직무와 관련된 경험")은
      // 채용공고와 가장 강하게 연결되는 경험으로 넓게 배치한다. strong이 아니라
      // usable이고, 이유를 판정문에 밝혀 과장하지 않는다.
      if (/지원.*직무|직무.*관련|관련.*경험|직무.*역량/i.test(question.text)) {
        const best = match.matches.filter((row) => row.status !== "none")
          .sort((a, b) => ({ direct: 0, indirect: 1 }[a.status] - { direct: 0, indirect: 1 }[b.status]))[0];
        if (best) {
          return {
            question,
            intent,
            status: "usable",
            experience: best.experience,
            profileEvidenceQuote: best.profileEvidenceQuote,
            jdRequirement: { id: best.requirement.id, kind: best.requirement.kind, text: best.requirement.text },
            reasoning: `문항이 특정 채용공고 요구사항을 지목하지 않아, 채용공고와 가장 강하게 연결되는 '${best.requirement.text}' 요구사항의 '${best.experience.label}' 경험을 연결했습니다.`,
            writingAngle: `'${best.experience.label}' 중 지원 직무와 연결되는 부분만 쓰세요.`,
            missingInfo: "문항이 묻는 특정 행동·결과가 있으면 프로필에 추가로 기록해 주세요.",
            reuseCount: 0,
          };
        }
      }
      return {
        question,
        intent,
        status: "missing",
        experience: null,
        profileEvidenceQuote: "",
        jdRequirement: null,
        reasoning: "현재 저장된 프로필 원문에서 이 문항에 연결할 근거를 확인하지 못했습니다.",
        writingAngle: "",
        missingInfo: "문항과 관련된 본인의 역할·행동·결과를 프로필에 추가로 기록해 주세요.",
        reuseCount: 0,
      };
    });
    const reuse = {};
    placements.forEach((row) => { if (row.experience && row.experience.id) reuse[row.experience.id] = (reuse[row.experience.id] || 0) + 1; });
    placements.forEach((row) => { row.reuseCount = row.experience ? reuse[row.experience.id] || 1 : 0; });
    // 34회차: 같은 요구사항에 연결되는 다른 경험(최대 2개). 문항당 1개만
    // 배치하면 답변이 얇아지므로, 같은 요구사항 어간을 공유하는 다른
    // 경험을 뼈대에 함께 보여준다. 배치된 경험은 제외하고, 라벨을 뺀
    // 매칭용 텍스트로만 본다.
    // 35회차: 요구사항 어간 겹침이 없어도 같은 분야 경험은 제안한다.
    // 문항 종류의 다리 어간(BRIDGES)을 공유하는 경험이 그 예다. 공정
    // 흐름·원리 문항에 E-beam(lithography·패턴)·STOB(nand)이 뜨지
    // 않던 것이 이 규칙으로 뜬다. 다리만으로 직접·간접 판정을 바꾸지는
    // 않는다 — 관련 경험은 뼈대의 "소제목으로 추가해 보세요" 제안일
    // 뿐이다 (findIndirectExperience의 다리만 후보 함정과 구분된다).
    // 어간 겹침이 먼저, 다리는 그 다음 순위다. 둘 다 없으면 빈 배열이다.
    placements.forEach((row) => {
      row.relatedExperiences = [];
      if (!row.jdRequirement || !row.experience) return;
      const placedEntry = entries.find((e) => e.id === row.experience.id);
      const reqTokens = new Set(r.stemmedTokens(row.jdRequirement.text));
      const kind = r.classify(row.jdRequirement.text);
      const scored = matchable
        .filter((me) => !placedEntry || me.id !== placedEntry.originalId)
        .map((me) => {
          const expTokens = new Set(r.stemmedTokens(me.text));
          const shared = [...expTokens].filter((t) => [...reqTokens].some((c) => r.tokenMatches(c, t)) && !GENERIC_STEMS.includes(t));
          const bridge = r.bridgeStems(kind, me.text);
          return { me, shared: shared.length, bridge: bridge.length };
        })
        .filter((item) => item.shared > 0 || item.bridge > 0)
        .sort((a, b) => b.shared - a.shared || b.bridge - a.bridge)
        .slice(0, 2);
      row.relatedExperiences = scored.map(({ me }) => toE(entries, me));
    });
    const counts = { strong: 0, usable: 0, missing: 0 };
    placements.forEach((row) => { counts[row.status] += 1; });
    return { placements, counts, questionCount: questions.length, requirementCount: requirements.length, totalRequirementCount, profileEntryCount: entries.length, source: "local" };
  }

  // 34회차: 간접(usable) 문항을 직접으로 올리려면 무엇이 필요한지,
  // 요구사항 종류별로 안내한다. 이 문구는 "이렇게 하면 직접이 된다"는
  // 자동 재분류가 아니라, 프로필에 추가로 기록할 것을 안내하는
  // 문구다. 직접 연결 판정 자체는 바꾸지 않는다.
  const UPGRADE_HINTS = {
    process_yield: "직접으로 올리려면: 조건을 바꿔 측정하고 전후 수치를 기록한 경험이 필요합니다. 조건 변경·측정값·비교 결과가 경험 원문에 있으면 직접 연결이 됩니다.",
    equipment_collab: "직접으로 올리려면: 장비 Set-up·개조를 직접 하거나 장비 업체·담당자와 조율한 기록이 필요합니다. 증상 확인·전달·후속 조치가 경험 원문에 있으면 직접 연결이 됩니다.",
    process_knowledge: "직접으로 올리려면: 교육·실습을 넘어 직접 분석·실습·조사한 내용이 필요합니다. 본인이 직접 한 분석·실습·조사가 경험 원문에 있으면 직접 연결이 됩니다.",
    programming_data: "직접으로 올리려면: 프로그램을 직접 개발하거나 데이터 분석 도구를 직접 쓴 기록이 필요합니다. 개발·분석한 도구와 확인한 결과가 경험 원문에 있으면 직접 연결이 됩니다.",
    project_learning: "직접으로 올리려면: 실험·프로젝트를 직접 수행·분석한 기록이 필요합니다. 본인이 직접 수행·분석한 부분과 확인한 결과가 경험 원문에 있으면 직접 연결이 됩니다.",
    collaboration: "직접으로 올리려면: 다른 부서·팀과 조건·일정·결과를 직접 조율한 기록이 필요합니다. 조율 대상·전달한 사실·합의된 내용이 경험 원문에 있으면 직접 연결이 됩니다.",
    derived_product: "직접으로 올리려면: 제품·요소기술을 직접 개발·검증한 기록이 필요합니다. 본인이 직접 설계·개발·검증한 부분과 확인한 결과가 경험 원문에 있으면 직접 연결이 됩니다.",
    amhs: "직접으로 올리려면: 반송·동선·배치를 직접 설계·최적화한 기록이 필요합니다. 바꾼 동선·배치와 확인한 변화가 경험 원문에 있으면 직접 연결이 됩니다.",
    related_field: "직접으로 올리려면: 전공·수업에서 배운 내용을 직접 적용한 사례가 필요합니다. 배운 내용을 적용한 행동·결과가 경험 원문에 있으면 직접 연결이 됩니다.",
    generic: "직접으로 올리려면: 문항과 직접 연결되는 행동·결과를 프로필에 추가로 기록해 주세요.",
  };

  // 35회차: 직접 문항 보강 안내. 직접 연결이어도 연결한 경험 원문에
  // 숫자가 없으면, 측정값·비교 결과를 추가하라는 안내를 붙인다. 직접
  // 판정 자체는 바꾸지 않는다. 합격 자소서는 조건-측정-비교 서사에
  // 수치를 박는데, 숫자가 없는 직접 문항은 그 서사가 안 나오기 때문이다.
  // 숫자는 extractNumbers로 본다 (한글 수사 포함, 연도 제외).
  const REINFORCE_HINTS = {
    process_yield: "더 탄탄하게 하려면: 조건 변경 전후의 측정값·비교 결과가 있으면 추가하세요. 확인한 수치만 쓰세요.",
    equipment_collab: "더 탄탄하게 하려면: Set-up·개조·협업 중 직접 한 부분의 결과가 있으면 추가하세요.",
    process_knowledge: "더 탄탄하게 하려면: 배운 원리를 적용한 사례나 직접 분석한 결과가 있으면 추가하세요.",
    programming_data: "더 탄탄하게 하려면: 개발·분석한 도구로 확인한 결과가 있으면 추가하세요.",
    project_learning: "더 탄탄하게 하려면: 직접 수행·분석한 부분의 결과가 있으면 추가하세요.",
    collaboration: "더 탄탄하게 하려면: 조율한 내용과 정해진 결과가 있으면 추가하세요.",
    derived_product: "더 탄탄하게 하려면: 개발·검증한 부분의 결과가 있으면 추가하세요.",
    amhs: "더 탄탄하게 하려면: 바꾼 동선·배치 전후의 변화가 있으면 추가하세요.",
    related_field: "더 탄탄하게 하려면: 배운 내용을 적용한 사례가 있으면 추가하세요.",
    generic: "더 탄탄하게 하려면: 측정값·비교 결과가 있으면 추가하세요. 확인한 수치만 쓰세요.",
  };

  // 35회차: 입사 후 목표 문항 로드맵 안내. 합격 자소서는 입사 후 목표를
  // 연차별 로드맵(0~2년 / 2~5년 / 5년 이후)으로 쓴다. 목표 문항에만 붙인다.
  // intentOf의 future 패턴(/목표/ 포함)은 "품질 목표 달성" 같은 과거
  // 성과 문항까지 잡아서, 로드맵은 더 좁은 조건(입사 후·포부·비전·향후·
  // 앞으로·N년 후)으로만 가른다.
  const ROADMAP_GUIDE = "[직접 채워 주세요] 입사 후 목표는 연차별로 나눠 쓰세요. 0~2년: 직무·매뉴얼을 익히고 기본을 다지는 단계, 2~5년: 맡은 영역의 문제를 직접 해결하고 예방하는 단계, 5년 이후: 더 넓은 영역을 맡아 개선하는 단계 — 각 단계에 이 회사·직무와 연결되는 구체적인 내용을 쓰세요. 계획은 계획으로 밝히세요.";
  function isFutureGoalQuestion(questionText) {
    return /입사 후|포부|비전|향후|앞으로|\d+\s*년 후/i.test(String(questionText || ""));
  }

  // 37회차: 보강 안내는 결과 수치가 없을 때 뜨는 안내다. 기간 수치
  // (~8개월, ~3일, ~2주)는 결과가 아니라 기간이라, 기간 수치만 있는
  // 경험에도 안내가 떠야 한다. extractNumbers 결과에서 기간 단위
  // (monthDuration·week·day)만 빼고 본다. extractNumbers 자체는
  // 초안 검토 대조에도 쓰여 기간을 수치로 봐야 해서 건드리지 않는다.
  // 38회차: "년"은 단위만으로 가릴 수 없어 문맥으로 본다. "년"이 나온
  // 자리 앞뒤 6자 안에 결과 맥락어(연장·단축·감소·증가·향상·개선·
  // 절감)가 있으면 결과 수치("수명 2년 연장"), 없으면 기간 수치
  // ("2년 근무", "2년차", "약 2년")로 본다. 애매하면 기간 쪽이
  // 안전하다 — 보강 안내는 제안이지 지적이 아니라서, 떠도 해가 없다.
  const PERIOD_UNITS = new Set(["monthDuration", "week", "day"]);
  const YEAR_RESULT_WORDS = ["연장", "단축", "감소", "증가", "향상", "개선", "절감"];
  // 41회차: 길이 수치도 단위만으로 가릴 수 없어 문맥으로 본다.
  // "23nm 패턴", "50nm 피치"는 만든 것의 치수(결과 수치 아님)라
  // 보강 안내가 떠야 한다. "RMS 0.5nm 이하", "두께 20.1nm 측정"처럼
  // 측정·결과 맥락어가 앞뒤 6자 안에 있으면 결과 수치로 본다.
  // 애매하면 치수 쪽이 안전하다 (보강 안내는 제안이라 떠도 해가 없다).
  const LENGTH_RESULT_WORDS = ["측정", "RMS", "이하", "이상", "오차", "편차", "감소", "단축", "증가", "향상", "개선", "절감", "달성"];
  function hasContextWord(text, raw, words) {
    const source = String(text || "");
    const idx = source.indexOf(String(raw || ""));
    if (idx < 0) return false;
    const window = source.slice(Math.max(0, idx - 6), idx + String(raw || "").length + 6);
    return words.some((w) => window.includes(w));
  }
  function isYearResultNumber(text, raw) {
    return hasContextWord(text, raw, YEAR_RESULT_WORDS);
  }
  function isLengthResultNumber(text, raw) {
    return hasContextWord(text, raw, LENGTH_RESULT_WORDS);
  }
  // 46회차 (45회차 객관 검토 B10): 농도 수치도 조건 수치라 길이와
  // 같이 본다. "5mM 용액"은 쓴 용액의 농도지 측정 결과가 아니다.
  // "농도 5mM 이하로 측정"처럼 측정·결과 맥락어가 앞뒤 6자 안에
  // 있을 때만 결과 수치로 본다.
  function isConcentrationResultNumber(text, raw) {
    return hasContextWord(text, raw, LENGTH_RESULT_WORDS);
  }
  function hasResultNumber(text) {
    const source = String(text || "");
    return extractNumbers(source).some((n) => {
      if (PERIOD_UNITS.has(n.unit)) return false;
      if (n.unit === "year") return isYearResultNumber(source, n.raw);
      if (n.unit === "length") return isLengthResultNumber(source, n.raw);
      if (n.unit === "concentration") return isConcentrationResultNumber(source, n.raw);
      return true;
    });
  }

  // 로컬 초안 뼈대: app.js renderQuestionOutline()이 받는 형태를 만든다.
  // 상황·역할은 원문 발췌(사실)만, 행동·결과는 사용자가 직접 채울
  // 안내 문구다. 완성 문장이 아니라 뼈대임을 문구에 밝힌다.
  function buildLocalOutline(placement, options) {
    const label = placement && placement.experience ? placement.experience.label : "";
    const quote = placement && placement.profileEvidenceQuote ? placement.profileEvidenceQuote : "";
    const jdText = placement && placement.jdRequirement ? placement.jdRequirement.text : "";
    const company = String((options && options.company) || "").trim();
    const role = String((options && options.role) || "").trim();
    const companyLine = company || role ? ` 첫 문단에 '${[company, role].filter(Boolean).join(" ")}'와 연결되는 한 줄을 넣으세요.` : " 첫 문단에 회사와 연결되는 한 줄을 넣으세요.";
    return {
      headline: {
        value: jdText
          ? `채용공고 요구사항 '${jdText}'과 '${label}' 경험을 연결하는 답변이 필요합니다.`
          : `'${label}' 경험을 문항 의도에 맞게 정리하는 답변이 필요합니다.`,
      },
      // 34회차: 합격 자소서 구조와 비교한 뼈대 gap — 소제목(핵심 주장),
      // 회사 맥락 첫 문단, 간접→직접 보완 안내, 같은 역량의 다른 경험을
      // 뼈대에 함께 보여준다. 값은 모두 "[직접 채워 주세요]" 안내
      // 문구라 원문에 없는 내용을 만들지 않는다.
      claim: { value: "[직접 채워 주세요] 이 문항의 핵심 주장을 한 줄로 쓰세요. 연결한 경험에서 가장 내세울 행동·결과를 한 문장으로 정리하세요." },
      opening: { value: `[직접 채워 주세요]${companyLine} 이 회사·직무가 본인과 맞는 이유를 채용공고에서 확인한 내용으로만 쓰세요.` },
      // 34회차: 보완 안내는 JDQ 문항 종류(classify)로 고른다. 배치의
      // jdRequirement.kind는 분석기 종류("주요 업무" 등)라 UPGRADE_HINTS
      // 키와 맞지 않는다. classify가 없으면 일반 문구로 떨어진다.
      upgrade: placement && placement.status === "usable" && jdText
        ? { value: UPGRADE_HINTS[recall().classify(jdText)] || UPGRADE_HINTS.generic }
        : null,
      // 35회차: 직접 문항인데 연결한 경험 원문에 결과 수치가 없으면 보강
      // 안내를 붙인다. 경험 원문은 options.experienceText(전체)가
      // 있으면 그걸 쓰고, 없으면 발췌(quote)로 본다. 직접 판정은 안 바꾼다.
      // 37회차: 기간 수치(~8개월)는 결과가 아니라서 안내를 막지 않는다.
      reinforce: placement && placement.status === "strong" && jdText && !hasResultNumber(String((options && options.experienceText) || quote || ""))
        ? { value: REINFORCE_HINTS[recall().classify(jdText)] || REINFORCE_HINTS.generic }
        : null,
      // 35회차: 입사 후 목표 문항에만 연차별 로드맵 안내를 붙인다.
      roadmap: placement && placement.question && isFutureGoalQuestion(placement.question.text)
        ? { value: ROADMAP_GUIDE }
        : null,
      // 36회차: 확인한 수치 — 연결한 경험에 사용자가 적어 둔 측정·기록
      // 수치가 있으면 뼈대에 따로 보여준다. 값은 프로필 원문에서 온
      // 것이라 새로 만드는 내용이 아니다. 없으면 안 보인다 (빈 칸
      // 안내를 넣지 않는다 — 없는 수치를 채우라고 재촉하지 않는다).
      verifiedNumbers: placement && placement.experience && placement.experience.verifiedNumbers
        ? { value: String(placement.experience.verifiedNumbers) }
        : null,
      relatedExperiences: Array.isArray(placement && placement.relatedExperiences)
        ? placement.relatedExperiences.map((row) => ({ id: String(row.id || ""), label: String(row.label || ""), kind: String(row.kind || "경험") }))
        : [],
      fields: {
        situation: { value: quote || "근거 부족", evidenceQuotes: quote ? [quote] : [] },
        role: { value: placement && placement.experience ? `${placement.experience.kind} · ${label}` : "근거 부족", evidenceQuotes: [] },
        action: { value: "[직접 채워 주세요] 채용공고 요구사항과 직접 연결되는 본인의 행동을 경험 원문에서 확인해 쓰세요.", evidenceQuotes: [] },
        result: { value: "[직접 채워 주세요] 경험 원문에서 확인한 결과만 쓰세요. 확인하지 못한 수치는 넣지 마세요.", evidenceQuotes: [] },
      },
      missingQuestions: placement && placement.status === "usable"
        ? [{ question: "연결되지 않은 부분(역할·수치·결과)을 프로필에 추가로 기록해 주세요." }]
        : [],
    };
  }

  // 21회차: 서버 없이 초안 검토 — 이 기기에서 규칙으로만 확인한다.
  // AI 검토가 아니므로, 판단은 원문 대조로만 한다.
  // - 초안의 수치: 연결한 경험 원문·채용공고 요구사항·문항 중 어느 한
  //   곳에도 없는 수치면 "원문에 없는 수치"로 알린다. 연도(1900~2100)는
  //   대조에서 뺀다.
  // - 35회차: 대조 대상은 주 경험 1개가 아니라 배치된 경험 전부다.
  //   뼈대가 복수 경험을 권장하는데 검토가 주 경험만 대조하면, 다른
  //   경험의 확인된 수치("23nm")를 거짓으로 지적한다. app.js가
  //   relatedExperiences 원문을 otherExperienceTexts로 넘긴다.
  // - 22회차: 한글 수사도 대조한다 ("여덟 달"과 "8개월"이 같은 수치인지
  //   본다). 단위를 묶어 비교한다 (달·개월 = 기간, 번·회·차 =
  //   횟수). 단위가 다르면 같은 값이어도 근거로 보지 않는다
  //   ("두 번" ≠ "2개월"). 단위가 없는 수는 값만으로 대조한다.
  // - 23회차: "월"은 달·개월과 묶지 않는다. "8월"은 달력의 8월(시점),
  //   "8개월"은 8개월(기간)이라 다른 단위다 ("8월" ≠ "8개월").
  //   고유명사 안의 수사("삼일절"의 "삼일")는 수치로 잡지 않는다.
  //   알려진 고유명사만 목록으로 가리고, 아라비아 날짜 표기
  //   ("3·1절", "5·18")도 수량이 아니라 날짜로 본다.
  // - 겹침: 초안과 경험 원문 사이에 구체 어간이 하나도 안 겹치면 알린다.
  // - 22회차: 문항 의도 대조 — 문항이 묻는 방향(극복 과정 등)이 초안에
  //   보이는지 본다. 방향 단어가 하나도 없으면 "보이지 않는다"고만
  //   알리고, 단정하지 않는다. 의도를 가릴 수 없는 문항은 대조하지 않는다.
  // - 길이: 글자 수 제한을 넘기면 알린다.
  // 서버 검토와 같은 형태를 반환해 app.js의 renderDraftReview를 그대로 쓴다.
  function splitSentences(text) {
    return String(text || "").split(/[\n。！？.!?]+/).map((s) => s.trim()).filter(Boolean);
  }

  // 단위 묶음: 같은 뜻의 단위는 같은 단위로 본다.
  // 23회차: "월"은 달·개월과 묶지 않는다. "8월"은 달력의 8월(시점)이고
  // "8개월"은 8개월(기간)이라, 같은 값이어도 다른 단위다.
  const UNIT_GROUPS = {
    "달": "monthDuration", "개월": "monthDuration", "월": "calendarMonth",
    "년": "year", "해": "year",
    "번": "count", "회": "count", "차": "count",
    "명": "person", "사람": "person", "인원": "person",
    "시간": "hour", "분": "minute", "초": "second",
    "일": "day", "날": "day", "주": "week",
    "개": "item", "건": "item",
    // 41회차: 길이 단위(nm·μm·mm·cm·m)는 치수다. "23nm 패턴"은
    // 만든 패턴의 크기지, 개선·측정 결과가 아니다. hasResultNumber가
    // 길이 수치를 결과로 세면 E-beam 주력 문항에 보강 안내가 안 뜬다.
    "nm": "length", "μm": "length", "µm": "length", "mm": "length", "cm": "length", "m": "length",
    // 46회차 (45회차 객관 검토 B10): 농도 단위(mM·μM·nM)는 길이(m)가
    // 아니다. "5mM 용액"을 "5m" 미터로 읽으면 초안 대조에서 5m 길이와
    // 같은 수치로 본다. 농도로 따로 묶는다. bare "M"(몰)은 "5M원"
    // (5백만)과 겹쳐 넣지 않는다 — "5M"은 단위 없이 읽는다.
    "mM": "concentration", "μM": "concentration", "µM": "concentration", "nM": "concentration", "uM": "concentration",
  };
  const COUNTER_WORDS = Object.keys(UNIT_GROUPS).sort((a, b) => b.length - a.length).join("|");

  // 한글 수사 단어: 긴 것부터 둔다 ("일곱"이 "일"보다 먼저 잡혀야 한다).
  const KOREAN_NUMERAL_TOKENS = [
    ["스물", 20, "tens"], ["서른", 30, "tens"], ["마흔", 40, "tens"], ["쉰", 50, "tens"],
    ["예순", 60, "tens"], ["일흔", 70, "tens"], ["여든", 80, "tens"], ["아흔", 90, "tens"],
    ["이십", 20, "tens"], ["삼십", 30, "tens"], ["사십", 40, "tens"], ["오십", 50, "tens"],
    ["육십", 60, "tens"], ["칠십", 70, "tens"], ["팔십", 80, "tens"], ["구십", 90, "tens"],
    ["하나", 1, "digit"], ["둘", 2, "digit"], ["셋", 3, "digit"], ["넷", 4, "digit"],
    ["다섯", 5, "digit"], ["여섯", 6, "digit"], ["일곱", 7, "digit"], ["여덟", 8, "digit"], ["아홉", 9, "digit"],
    ["만", 10000, "man"], ["천", 1000, "scale"], ["백", 100, "scale"], ["십", 10, "scale"], ["열", 10, "scale"],
    ["일", 1, "digit"], ["이", 2, "digit"], ["삼", 3, "digit"], ["사", 4, "digit"],
    ["오", 5, "digit"], ["육", 6, "digit"], ["칠", 7, "digit"], ["팔", 8, "digit"], ["구", 9, "digit"],
    ["한", 1, "digit"], ["두", 2, "digit"], ["세", 3, "digit"], ["네", 4, "digit"],
  ];
  const KOREAN_NUMERAL_PATTERN = KOREAN_NUMERAL_TOKENS.map(([word]) => word).join("|");
  // 숫자처럼 보이지만 숫자가 아닌 말: "이번 주"(이번이 아님),
  // "이건"(이것), "사건", "한일"(한국·일본). 대조에서 뺀다.
  const KOREAN_FALSE_WORDS = new Set(["이번", "이건", "사건", "한일"]);

  // 23회차: 고유명사 안에 들어간 수사. "삼일절"의 "삼일"은 3일이 아니라
  // 3·1절이라는 이름이고, "사월초파일"의 "사월"은 4월이라는 날짜 이름이다.
  // 알려진 고유명사만 목록으로 가린다. 목록에 없는 고유명사는 가리지
  // 않는다 (과하게 단정하지 않는다). "삼일간"은 진짜 3일이라 가리지 않는다.
  const KOREAN_PROPER_NOUNS = ["삼일절", "삼일운동", "사월초파일", "오일팔"];

  // 글에서 알려진 고유명사가 차지하는 구간 [시작, 끝) 목록.
  function properNounSpans(text) {
    const spans = [];
    for (const word of KOREAN_PROPER_NOUNS) {
      let from = 0;
      while (true) {
        const at = text.indexOf(word, from);
        if (at < 0) break;
        spans.push([at, at + word.length]);
        from = at + word.length;
      }
    }
    return spans;
  }

  // 23회차: 아라비아 날짜 표기. "3·1절"의 3과 1, "5·18"의 5와 18은
  // 수량이 아니라 날짜다. 가운뎃점(·)으로 이어진 숫자 쌍과, "절·운동"
  // 따위가 바로 뒤에 오는 소수점 날짜("3.1절")만 가린다. "3.5시간" 같은
  // 진짜 소수+단위는 가리지 않는다.
  function isDatePatternNumber(source, match) {
    const start = match.index;
    const end = start + match[0].length;
    const after = source.slice(end);
    const before = source.slice(0, start);
    if (/^[·ㆍ•]\d/.test(after)) return true; // "3·1", "5·18"의 앞쪽 숫자
    if (/\d[·ㆍ•]$/.test(before)) return true; // "3·1", "5·18"의 뒤쪽 숫자
    if (match[0].includes(".") && /^\s*(민주화운동|운동|절|기념일)/.test(after)) return true; // "3.1절"
    return false;
  }

  // 한글 수사를 숫자로 바꾼다. "스물다섯"→25, "이천이십육"→2026,
  // "열두"→12. 이어지는 규칙에 안 맞는 말("일이")은 null로 돌려준다.
  function parseKoreanNumeral(word) {
    const tokens = [];
    let rest = word;
    while (rest) {
      const found = KOREAN_NUMERAL_TOKENS.find(([token]) => rest.startsWith(token));
      if (!found) return null;
      tokens.push(found);
      rest = rest.slice(found[0].length);
    }
    let total = 0, current = 0, pending = 0, hasPending = false;
    for (const [, value, kind] of tokens) {
      if (kind === "man") {
        total += (current + pending || 1) * 10000;
        current = 0; pending = 0; hasPending = false;
      } else if (kind === "scale") {
        current += (hasPending ? pending : 1) * value;
        pending = 0; hasPending = false;
      } else if (kind === "tens") {
        if (hasPending) return null;
        current += value;
      } else {
        if (hasPending) return null;
        pending = value; hasPending = true;
      }
    }
    return total + current + pending;
  }

  // 글에서 수치를 뽑는다. {value, raw, unit} 목록이다. unit이 ""이면
  // 단위 없는 수라 값만으로 대조한다. 연도는 대조에서 뺀다.
  function extractNumbers(text) {
    const found = new Map();
    const source = String(text || "");
    const arabic = new RegExp(`\\d[\\d,]*(?:\\.\\d+)?\\s*(${COUNTER_WORDS})?`, "g");
    let match;
    while ((match = arabic.exec(source)) !== null) {
      if (isDatePatternNumber(source, match)) continue; // "3·1절", "5·18"은 날짜다
      const digits = match[0].match(/^\d[\d,]*(?:\.\d+)?/)[0];
      // "3D NAND"·"2D 도면"의 3·2는 개수·수치가 아니라 차원 표시다. 숫자
      // 바로 뒤에 D가 붙으면 수치로 잡지 않는다 (비교 검증 2026-11-06
      // 항목 6: "23nm"이 '23'·'3'으로 쪼개져 지적됐다 — '3'은 "3D NAND"에서 왔다).
      const afterDigits = source[match.index + digits.length];
      if (afterDigits === "D" || afterDigits === "d") continue;
      const value = Number(digits.replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      if (/^\d{4}$/.test(digits) && value >= 1900 && value <= 2100) continue; // 연도는 대조에서 뺀다
      const unit = match[1] ? UNIT_GROUPS[match[1]] || "" : "";
      const key = `${value}|${unit}`;
      if (!found.has(key)) found.set(key, { value, raw: match[0].trim().replace(/,+$/, ""), unit });
    }
    const spans = properNounSpans(source);
    const korean = new RegExp(`((?:${KOREAN_NUMERAL_PATTERN})+)\\s*(${COUNTER_WORDS})`, "g");
    while ((match = korean.exec(source)) !== null) {
      if (spans.some(([s, e]) => match.index < e && match.index + match[0].length > s)) continue; // 고유명사 안의 수사
      if (KOREAN_FALSE_WORDS.has(match[0].replace(/\s+/g, ""))) continue;
      const value = parseKoreanNumeral(match[1]);
      if (value === null) continue;
      const unit = UNIT_GROUPS[match[2]] || "";
      if (unit === "year" && value >= 1900 && value <= 2100) continue; // 한글 연도도 대조에서 뺀다
      const key = `${value}|${unit}`;
      if (!found.has(key)) found.set(key, { value, raw: match[0].trim(), unit });
    }
    return [...found.values()];
  }

  // 초안 수치가 근거에 있는지 본다. 단위가 둘 다 있으면 단위까지
  // 같아야 하고, 한쪽이라도 단위가 없으면 값만으로 본다.
  function isGroundedNumber(draftNumber, groundingNumbers) {
    return groundingNumbers.some((grounded) => grounded.value === draftNumber.value
      && (draftNumber.unit === "" || grounded.unit === "" || draftNumber.unit === grounded.unit));
  }

  function reviewDraftLocal(input) {
    const r = recall();
    const draft = String(input && input.draftText || "").trim();
    if (!draft) throw new Error("검토할 자기소개서 답변을 입력해 주세요.");
    const experience = String(input && input.experienceText || "");
    // 35회차: 뼈대가 복수 경험을 권장하는데 검토는 주 경험 1개만 대조해서
    // 다른 경험의 확인된 수치("23nm")를 거짓으로 지적했다. 배치된 다른
    // 경험 원문(otherExperienceTexts)도 대조 대상에 합친다. 없는 경험은
    // 만들지 않는다 — 대조 대상은 저장된 프로필 원문뿐이다.
    const otherExperiences = (Array.isArray(input && input.otherExperienceTexts) ? input.otherExperienceTexts : []).map((t) => String(t || "")).filter(Boolean);
    const allExperienceTexts = [experience, ...otherExperiences].filter(Boolean);
    const experienceAll = allExperienceTexts.join(" / ");
    const question = String(input && input.questionText || "");
    const jdRequirement = String(input && input.jdRequirement || "");
    const limit = Number(input && input.characterLimit) || 0;

    const grounding = `${experienceAll} ${jdRequirement} ${question}`;
    const groundedNumbers = extractNumbers(grounding);
    const sentences = splitSentences(draft);
    const unsupportedClaims = [];
    extractNumbers(draft).forEach((draftNumber) => {
      if (isGroundedNumber(draftNumber, groundedNumbers)) return;
      const sentence = sentences.find((s) => s.includes(draftNumber.raw)) || sentences[0] || draft;
      unsupportedClaims.push({
        draftQuote: sentence.slice(0, 80),
        reason: `'${draftNumber.raw}' 수치가 경험 원문·채용공고·문항 어디에도 없습니다. 원문에서 확인한 수치만 쓰세요.`,
      });
    });

    const expTokens = r.stemmedTokens(matchText(experienceAll));
    const draftTokens = r.stemmedTokens(draft).filter((t) => !GENERIC_STEMS.includes(t));
    const shared = draftTokens.filter((t) => expTokens.some((e) => r.tokenMatches(t, e)));
    const supportedPoints = [];
    if (shared.length) {
      // 겹치는 어간이 가장 많은 초안 문장을 근거 연결로 보여준다 (최대 2개).
      // 근거 발췌는 그 문장과 가장 많이 겹치는 경험 원문에서 가져온다.
      sentences.map((s) => ({ s, n: r.stemmedTokens(s).filter((t) => shared.some((h) => r.tokenMatches(t, h))).length }))
        .filter((row) => row.n > 0).sort((a, b) => b.n - a.n).slice(0, 2)
        .forEach((row) => {
          // 발췌는 그 문장과 가장 많이 겹치는 경험 원문에서 가져온다.
          // (전역 공유 어간 수로 고르면 STOB처럼 어간이 많은 경험이
          //  모든 문장의 발췌를 차지한다.)
          const sentTokens = r.stemmedTokens(row.s);
          let bestSource = experience;
          let bestN = -1;
          for (const src of allExperienceTexts) {
            const srcTokens = r.stemmedTokens(matchText(src));
            const n = sentTokens.filter((t) => srcTokens.some((e) => r.tokenMatches(t, e))).length;
            if (n > bestN) { bestN = n; bestSource = src; }
          }
          supportedPoints.push({ draftQuote: row.s.slice(0, 80), evidenceQuote: excerpt(matchText(bestSource)) });
        });
    } else {
      unsupportedClaims.push({
        draftQuote: (sentences[0] || draft).slice(0, 80),
        reason: "연결한 경험 원문과 겹치는 내용이 없습니다. 경험 원문에서 확인한 행동·결과를 쓰세요.",
      });
    }

    const structureGaps = [];
    // 22회차: 문항 의도 대조. 방향 단어가 하나도 없으면 "보이지
    // 않는다"고만 알리고, 단정하지 않는다. 의도를 가릴 수 없는 문항은
    // 대조하지 않는다.
    const direction = intentDirection(question);
    if (direction && !direction.keywords.some((keyword) => draft.includes(keyword))) {
      structureGaps.push({ message: `문항이 묻는 방향(${direction.direction})이 초안에 보이지 않습니다. 문항 의도와 다른 방향이면 다시 확인해 주세요.` });
    }
    if (limit > 0 && draft.length > limit) {
      structureGaps.push({ message: `글자 수 제한(${limit}자)을 ${draft.length - limit}자 넘었습니다.` });
    }

    const revisionPlan = [];
    if (unsupportedClaims.length) revisionPlan.push({ instruction: "원문에 없는 수치·내용을 지우고, 경험 원문에 있는 행동·결과만으로 다시 쓰세요." });
    if (direction && structureGaps.some((gap) => gap.message.includes("문항이 묻는 방향"))) revisionPlan.push({ instruction: `문항이 묻는 방향(${direction.direction})이 드러나도록 다시 쓰세요.` });
    if (structureGaps.some((gap) => gap.message.includes("글자 수 제한"))) revisionPlan.push({ instruction: "글자 수 제한 안에 들도록 줄이세요." });

    const needsReview = unsupportedClaims.length > 0 || structureGaps.length > 0;
    return {
      status: needsReview ? "needs_review" : "grounded",
      summary: needsReview
        ? "이 기기에서 규칙으로 확인했습니다. 원문과 어긋날 수 있는 부분을 찾았습니다. AI 검토가 아니라 규칙 확인입니다."
        : "이 기기에서 규칙으로 확인했습니다. 원문에 없는 수치를 찾지 못했고, 연결한 경험과 겹치는 내용을 확인했습니다. AI 검토가 아니라 규칙 확인입니다.",
      supportedPoints,
      unsupportedClaims,
      structureGaps,
      revisionPlan,
      source: "local",
    };
  }

  const api = { matchProfileLocal, mapQuestionsLocal, buildLocalOutline, reviewDraftLocal, intentOf, intentDirection, parseKoreanNumeral, matchText };
  root.JdLocalFallback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
