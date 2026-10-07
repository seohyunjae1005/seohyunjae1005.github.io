(function (root) {
  "use strict";

  const SECTION_RULES = [
    ["duty", "주요 업무", /^(담당\s*업무|주요\s*업무|수행\s*업무|직무\s*내용|업무\s*내용|이런\s*일을\s*합니다|responsibilities|what\s*you(?:'|’)?ll\s*(?:do|experience)|경험할\s*수\s*있습니다)$/i],
    ["required", "필수 조건", /^(전공|필수|필수\s*사항|필수\s*조건|필수\s*요건|자격\s*요건|지원\s*자격|지원자격|이런\s*분을\s*찾고\s*있어요|minimum\s*qualifications?|basic\s*qualifications?|requirements?|qualifications?|who\s+we(?:'|’)?re\s+looking\s+for)$/i],
    ["preferred", "우대 조건", /^(우대|우대\s*사항|우대\s*조건|이런\s*분이면\s*더\s*좋아요|preferred(?:\s*qualifications?)?|nice\s*to\s*have|이런\s*역량이나\s*경\S{0,2}이\s*있다면\s*더\s*좋습니다)$/i],
    ["context", "조직·직무 소개", /^(상세\s*내용|우리\s*조직을\s*소개합니다|조직\s*소개)$/i],
    ["career", "성장 경로", /^(이렇게\s*성장할\s*수\s*있어요|성장\s*경로|career\s*path)$/i],
    ["preparation", "회사 제안 준비", /^(이렇게\s*준비하면\s*좋아요|지원\s*준비|how\s*to\s*prepare)$/i],
    ["ignore", "기타", /^(인원|근무지|복리\s*후생|전형\s*절차|지원\s*방법|근무\s*(조건|지역|장소)|회사\s*소개|benefits?|about\s*us)$/i],
  ].map(([level, label, regex]) => ({ level, label, regex }));

  const KEYWORD_RULES = [
    [/공정\s*최적화|조건\s*최적화/gi, "Process Optimization"],
    [/수율\s*(향상|개선|증대)|수율/gi, "Yield Improvement"],
    [/생산성\s*(향상|개선)|생산성/gi, "Productivity Improvement"],
    [/가동률\s*(향상|개선)|가동률/gi, "Equipment Utilization Improvement"],
    [/품질\s*(안정화|향상|개선|확보)|품질/gi, "Quality Improvement"],
    [/데이터\s*(분석|활용)|빅데이터/gi, "Data Analysis"],
    [/자동화\s*(설비|시스템|기술)?|스마트\s*팩토리/gi, "Automation / Smart Factory"],
    [/라인\s*설계|생산\s*라인|레이아웃|layout/gi, "Production Line Design"],
    [/투자비|원가|수익성/gi, "Cost / Investment Review"],
    [/유관\s*부서\s*협업|협력사\s*협업|업체와\s*협업|협업/gi, "Cross-functional Collaboration"],
    [/문제\s*해결|원인\s*분석|저해\s*요인/gi, "Problem Solving"],
    [/설비\s*(개선|고도화|set[- ]?up)|장비\s*(개선|set[- ]?up)/gi, "Equipment Engineering"],
  ];
  const TOOL_RULES = [
    [/\bPython\b/gi, "Python"], [/\bSQL\b/gi, "SQL"], [/\bJMP\b/gi, "JMP"], [/\bMinitab\b/gi, "Minitab"],
    [/\bMATLAB\b/gi, "MATLAB"], [/\bR\b/g, "R"], [/\bDBMS\b/gi, "DBMS"], [/\bC\+\+\b/gi, "C++"], [/\bJava\b/gi, "Java"],
    [/\bExcel\b/gi, "Excel"], [/\bTableau\b/gi, "Tableau"], [/\bPower\s*BI\b/gi, "Power BI"],
    [/\bCAD\b/gi, "CAD"], [/\bCATIA\b/gi, "CATIA"], [/\bPLC\b/gi, "PLC"], [/\bSPC\b/gi, "SPC"], [/\bDOE\b/gi, "DOE"],
    [/\bE-FOREST\b/gi, "E-FOREST"],
  ];
  const TECH_RULES = [
    [/빅데이터/gi, "빅데이터"], [/\bAI\b|인공지능/gi, "AI·인공지능"], [/컴퓨터\s*비전|\bvision\b|비전\s*활용/gi, "비전 기술"],
    [/스마트\s*팩토리/gi, "스마트팩토리"], [/Photolithography/gi, "Photolithography"], [/\bEtch\b/gi, "Etch"],
    [/Ion\s*Implant/gi, "Ion Implant"], [/Diffusion/gi, "Diffusion"], [/Thin\s*Film/gi, "Thin Film"], [/Cleaning/gi, "Cleaning"], [/\bCMP\b/gi, "CMP"],
  ];
  const COLLABORATOR_RULES = [/유관\s*부서/gi, /다양한\s*부서/gi, /전극\s*\/\s*조립\s*공정의\s*다른\s*팀/gi, /장비\s*업체/gi, /협력사/gi, /고객사?/gi, /연구소/gi, /생산\s*부서/gi, /품질\s*부서/gi, /개발\s*부서/gi, /외부\s*업체/gi];
  const METRIC_RULES = [/수율\s*(향상|개선|증대)?/gi, /생산성\s*(향상|개선)?/gi, /가동률\s*(향상|개선)?/gi, /품질\s*(안정화|향상|개선|확보)?/gi, /원가\s*(절감|개선)?/gi, /수익성\s*(향상|개선)?/gi, /처리량\s*(향상|개선)?/gi, /불량률\s*(감소|개선)?/gi, /납기\s*(준수|단축)?/gi];
  const KNOWLEDGE_HINT = /(전공|지식|이해|원리|공학|과학|기술|공정|설계|알고리즘|회로|재료|통계)/i;
  const COMPETENCY_HINT = /(경험|역량|능력|가능한\s*분|이해|활용|분석|설계|개발|협업|커뮤니케이션|문제\s*해결)/i;
  const ELIGIBILITY_HINT = /(학사|석사|박사|학위|졸업|모집\s*대상|전공|성적|어학|영어|외국어|해외\s*출장|자격증?|경력\s*\d|병역|근무\s*가능)/i;
  const DUTY_HINT = /(담당|수행|설계|구축|운영|관리|검토|분석|개선|개발|최적화|산출|수립|지원|적용|평가|확보|협업)/i;

  function normalize(value) { return String(value || "").toLocaleLowerCase("ko").replace(/[\s·•\-–—_*()[\]{}<>:：,.;!?/\\'’]+/g, ""); }
  function clean(value) { return String(value || "").replace(/^\s*(?:[-–—•·▪▶✓✔]|[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)]|[가-힣][.)])\s*/, "").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim(); }
  function sectionRule(text) { const heading = clean(text).replace(/[.!?]+$/, ""); return SECTION_RULES.find((rule) => rule.regex.test(heading)); }
  function markBoundaries(value) {
    let text = String(value || "").replace(/\r/g, "\n").replace(/we\s*[•·]\s*re/gi, "we're").replace(/you\s*[•·]\s*ll/gi, "you'll").replace(/\blon\s+lmplant\b/gi, "Ion Implant");
    const headings = [/minimum\s+qualifications?/gi, /basic\s+qualifications?/gi, /preferred\s+qualifications?/gi, /responsibilities/gi, /what\s+you(?:'|’)?ll\s+(do|experience)/gi, /who\s+we(?:'|’)?re\s+looking\s+for/gi, /담당\s*업무/gi, /주요\s*업무/gi, /이런\s*일을\s*합니다/gi, /지원\s*자격/gi, /지원자격/gi, /자격\s*요건/gi, /필수\s*(사항|조건|요건)/gi, /이런\s*분을\s*찾고\s*있어요/gi, /우대\s*(사항|조건)/gi, /이런\s*분이면\s*더\s*좋아요/gi, /이런\s*역량이나\s*경\S{0,2}이\s*있다면\s*더\s*좋습니다/gi, /상세\s*내용/gi, /우리\s*조직을\s*소개합니다/gi, /이렇게\s*성장할\s*수\s*있어요/gi, /이렇게\s*준비하면\s*좋아요/gi];
    headings.forEach((regex) => { text = text.replace(regex, (match) => `\n§H§${match}\n`); });
    return text.replace(/(^|\s)(\d{1,2}[.)])(?=\s*[가-힣A-Za-z])/g, "$1\n§N§$2\n").replace(/([①②③④⑤⑥⑦⑧⑨⑩])/g, "\n§C§$1\n").replace(/\s*[•▪▶✓✔]\s*/g, "\n§B§").replace(/\s+·\s+/g, "\n§B§").replace(/\n{3,}/g, "\n\n");
  }
  function segment(sourceText) {
    const source = String(sourceText || ""); const units = []; let buffer = ""; let section = "unspecified"; let group = ""; let counter = 0;
    const flush = () => {
      const text = clean(buffer); buffer = ""; if (text.length < 2) return;
      const exactStart = source.indexOf(text); units.push({ id: `JD-${String(units.length + 1).padStart(2, "0")}`, text, section, group: group || `U${++counter}`, start: exactStart, end: exactStart >= 0 ? exactStart + text.length : -1, verified: normalize(source).includes(normalize(text)) });
    };
    markBoundaries(source).split(/\n+/).forEach((raw) => {
      let line = raw.trim(); if (!line || /^\[\d+쪽\]$/.test(line)) return;
      if (line.startsWith("§B§")) {
        flush();
        line = line.slice(3).trim();
        if (!group || !/^N\d+$/.test(group)) group = `U${++counter}`;
      }
      const bracket = line.match(/^\[([^\]]+)\]$/); const bracketRule = bracket ? sectionRule(bracket[1]) : null;
      if (bracketRule) { flush(); section = bracketRule.level; group = ""; return; }
      const plainRule = sectionRule(line);
      if (plainRule) { flush(); section = plainRule.level; group = ""; return; }
      if (line.startsWith("§H§")) { flush(); const rule = sectionRule(line.slice(3)); if (rule) section = rule.level; group = ""; return; }
      if (line.startsWith("§N§")) { flush(); group = `N${line.slice(3).replace(/\D/g, "")}`; return; }
      if (line.startsWith("§C§")) { flush(); group = `C${"①②③④⑤⑥⑦⑧⑨⑩".indexOf(line.slice(3).trim()) + 1}`; return; }
      if (/^[-–—]\s+/.test(line)) { flush(); line = line.replace(/^[-–—]\s+/, ""); if (!group) group = `U${++counter}`; else if (!/^N\d+$/.test(group)) group = `U${++counter}`; }
      if (!line) return; if (buffer && /[.!?]$/.test(buffer)) flush(); buffer = buffer ? `${buffer} ${line}` : line;
    }); flush();
    // 복사 과정에서 소제목이 사라졌더라도, 자격요건 앞의 번호 업무 블록은
    // 버리지 않는다. 단, 일반 소개 문장을 업무로 단정하지 않도록 번호 표지가
    // 있거나 명확한 수행 동사가 있는 의미 단위만 제한적으로 복원한다.
    units.forEach((unit) => {
      if (unit.section !== "unspecified") return;
      if ((/^N\d+$/.test(unit.group) || DUTY_HINT.test(unit.text)) && DUTY_HINT.test(unit.text)) unit.section = "duty_inferred";
    });
    return units;
  }
  function previewSource(sourceText) {
    const units = segment(sourceText); if (!units.length) throw new Error("분석할 JD 원문을 입력해 주세요.");
    const headingCount = units.reduce((count, unit, index) => unit.section !== "unspecified" && unit.section !== units[index - 1]?.section ? count + 1 : count, 0);
    return { cleanedText: String(sourceText || "").trim(), units, semanticUnitCount: units.length, headingCount, warnings: units.every((u) => u.verified) ? [] : ["일부 의미 단위를 원문에서 정확히 다시 찾지 못했습니다. 원문을 확인해 주세요."] };
  }
  function unique(values) { return [...new Set(values.filter(Boolean))]; }
  function matches(text, rules) { return unique(rules.flatMap((rule) => [...String(text).matchAll(rule)].map((match) => match[0].trim()))); }
  function fact(value, evidenceIds) { return { value: String(value || "").trim(), evidenceIds: unique(evidenceIds) }; }
  function mergeFacts(rows) {
    const merged = new Map();
    rows.filter((row) => row?.value).forEach((row) => {
      const key = normalize(row.value);
      if (!merged.has(key)) merged.set(key, fact(row.value, row.evidenceIds));
      else merged.get(key).evidenceIds = unique([...merged.get(key).evidenceIds, ...(row.evidenceIds || [])]);
    });
    return [...merged.values()];
  }
  function safeTest(regex, text) { regex.lastIndex = 0; return regex.test(text); }
  function extractJobTitle(source, units, userRole) {
    const match = String(source).match(/(?:직무명|모집\s*직무|포지션|position)\s*[:：]\s*([^\n]{2,60})/i);
    if (match) {
      const value = clean(match[1]);
      const evidence = units.find((unit) => normalize(unit.text).includes(normalize(value)) || /직무명|모집\s*직무|포지션|position/i.test(unit.text));
      return { value, evidenceIds: evidence ? [evidence.id] : [], origin: evidence ? "jd" : "unverified" };
    }
    return userRole ? { value: String(userRole).trim(), evidenceIds: [], origin: "user" } : { value: "원문에 없음", evidenceIds: [], origin: "none" };
  }
  function keywordFacts(units) {
    const rows = [];
    units.forEach((unit) => KEYWORD_RULES.forEach(([regex, standard]) => { [...unit.text.matchAll(regex)].forEach((match) => rows.push({ original: match[0].trim(), standardized: standard, evidenceIds: [unit.id] })); }));
    const seen = new Set(); return rows.filter((row) => { const key = `${row.original}|${row.standardized}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 20);
  }
  function extractFacts(source, units, roleName) {
    const dutyUnits = units.filter((u) => u.section === "duty" || u.section === "duty_inferred");
    const duties = mergeFacts(dutyUnits.map((u) => fact(u.text, [u.id])));
    const requiredUnits = units.filter((u) => u.section === "required"); const preferredUnits = units.filter((u) => u.section === "preferred");
    const required = requiredUnits.map((u) => fact(u.text, [u.id]));
    const competencies = mergeFacts([...requiredUnits, ...preferredUnits].filter((u) => COMPETENCY_HINT.test(u.text) && !ELIGIBILITY_HINT.test(u.text)).map((u) => fact(u.text, [u.id])));
    const preferred = mergeFacts(preferredUnits.map((u) => fact(u.text, [u.id])));
    const statedKnowledge = [...requiredUnits, ...preferredUnits].filter((u) => KNOWLEDGE_HINT.test(u.text)).map((u) => fact(u.text, [u.id]));
    const technicalKnowledge = units.flatMap((u) => TECH_RULES.flatMap(([regex, name]) => safeTest(regex, u.text) ? [fact(name, [u.id])] : []));
    const knowledge = mergeFacts([...statedKnowledge, ...technicalKnowledge]).slice(0, 12);
    const tools = mergeFacts(units.flatMap((u) => TOOL_RULES.flatMap(([regex, name]) => safeTest(regex, u.text) ? [fact(name, [u.id])] : [])));
    const collaborators = mergeFacts(units.flatMap((u) => matches(u.text, COLLABORATOR_RULES).map((value) => fact(value, [u.id]))));
    const metrics = mergeFacts(units.flatMap((u) => matches(u.text, METRIC_RULES).map((value) => fact(value, [u.id]))));
    return { jobTitle: extractJobTitle(source, units, roleName), duties, competencies, required: mergeFacts(required), preferred, knowledge, tools, collaborators, metrics, keywords: keywordFacts(units) };
  }
  function interpretation(label, value, evidenceIds) { return { label, value, evidenceIds: unique(evidenceIds), status: evidenceIds.length ? "supported" : "insufficient" }; }
  function buildInterpretations(facts) {
    const rows = []; const dutyRefs = unique(facts.duties.slice(0, 4).flatMap((row) => row.evidenceIds)); const metricRefs = unique(facts.metrics.slice(0, 4).flatMap((row) => row.evidenceIds));
    if (facts.duties.length && facts.metrics.length) rows.push(interpretation("직무 Mission", `JD에 명시된 주요 업무를 수행해 ${unique(facts.metrics.map((r) => r.value)).slice(0, 3).join("·")} 목표에 기여하는 역할로 해석됩니다.`, [...dutyRefs, ...metricRefs]));
    else rows.push(interpretation("직무 Mission", "해석 근거 부족", []));
    if (facts.duties.length >= 2) rows.push(interpretation("예상 업무 흐름", facts.duties.slice(0, 4).map((row, i) => `${i + 1}. ${row.value}`).join(" → "), dutyRefs));
    else rows.push(interpretation("예상 업무 흐름", "해석 근거 부족", []));
    if (facts.metrics.length) rows.push(interpretation("성과 목표/KPI 의미", `${unique(facts.metrics.map((r) => r.value)).join("·")}은(는) 업무 결과를 확인할 때 살펴볼 성과 기준 후보입니다. 실제 산식과 목표값은 원문에 없으면 확인할 수 없습니다.`, metricRefs));
    else rows.push(interpretation("성과 목표/KPI 의미", "해석 근거 부족", []));
    const problemKeywords = facts.keywords.filter((row) => ["Problem Solving", "Quality Improvement", "Productivity Improvement", "Equipment Utilization Improvement", "Yield Improvement"].includes(row.standardized));
    if (problemKeywords.length) {
      const labels = unique(problemKeywords.map((row) => ({
        "Problem Solving": "저해 요인",
        "Quality Improvement": "품질",
        "Productivity Improvement": "생산성",
        "Equipment Utilization Improvement": "가동률",
        "Yield Improvement": "수율",
      }[row.standardized])));
      rows.push(interpretation("대표 문제 상황", `JD가 언급한 ${labels.join("·")} 문제의 원인을 확인하고 개선안을 검증하는 상황이 발생할 가능성이 있습니다.`, problemKeywords.flatMap((r) => r.evidenceIds)));
    }
    else rows.push(interpretation("대표 문제 상황", "해석 근거 부족", []));
    if (facts.competencies.length || facts.keywords.length) rows.push(interpretation("중요해 보이는 역량", unique([...facts.competencies.slice(0, 3).map((r) => r.value), ...facts.keywords.slice(0, 4).map((r) => r.original)]).join(" / "), unique([...facts.competencies.flatMap((r) => r.evidenceIds), ...facts.keywords.flatMap((r) => r.evidenceIds)])));
    else rows.push(interpretation("중요해 보이는 역량", "해석 근거 부족", []));
    return rows;
  }
  function studySuggestions(facts) {
    const suggestions = [];
    const add = (name, reason, keyword) => { const refs = facts.keywords.filter((r) => r.standardized === keyword).flatMap((r) => r.evidenceIds); if (refs.length && !facts.tools.some((r) => r.value === name)) suggestions.push({ name, reason, evidenceIds: unique(refs) }); };
    const dataRefs = facts.keywords.filter((r) => r.standardized === "Data Analysis").flatMap((r) => r.evidenceIds);
    if (dataRefs.length && !facts.tools.length) suggestions.push({ name: "데이터 분석 도구 기초", reason: "공고가 특정 도구명을 요구하지 않으므로 도구 선택은 추가 확인하고, 데이터 정리·시각화·원인 분석 흐름부터 연습하는 후보", evidenceIds: unique(dataRefs) });
    add("JMP 또는 Minitab", "공정·품질 데이터 비교와 통계 해석 학습 후보", "Process Optimization"); add("PLC 기초", "설비 자동화 구조 이해를 위한 학습 후보", "Automation / Smart Factory");
    return suggestions.slice(0, 3);
  }

  const WORK_AXIS_RULES = [
    { id: "defect_root_cause", regex: /불량.*(?:근본\s*원인|발생\s*메커니즘)|(?:근본\s*원인|발생\s*메커니즘).*불량/ },
    { id: "technology_development", regex: /신기술\s*(?:을\s*)?(?:개발|검증)|검증된\s*기술.*(?:전개|적용)/ },
    { id: "global_transfer", regex: /Global\s*(?:법인|Site)|글로벌\s*(?:법인|사이트)|해외\s*법인|기술.*(?:전개|이관)/i },
    { id: "line_stabilization", regex: /신규\s*생산\s*라인.*(?:안정화|조기\s*안정)|생산\s*라인.*(?:안정화|조기\s*안정)/ },
    { id: "launch", regex: /신차|신제품|신규\s*제품|양산\s*(준비|전환)|제품\s*도입|개발\s*단계/ },
    { id: "line", regex: /생산\s*라인|라인\s*설계|레이아웃|layout|표준\s*인원|공장\s*건설|공정\s*설계|운영관리\s*프로세스/ },
    { id: "economics", regex: /공법|투자비|원가|수익성|경제성/ },
    { id: "automation", regex: /자동화|스마트\s*팩토리|빅데이터|\bAI\b|인공지능|비전|E-FOREST|시스템\s*(구축|확대|고도화)|디지털/ },
    { id: "operations_improvement", regex: /생산성|가동률|저해\s*요인|처리량|납기/ },
    { id: "quality", regex: /품질|수율|불량/ },
    { id: "process_operations", regex: /공정\s*(운영|최적화)|조건\s*최적화|장비\s*set[- ]?up|설비\s*운영|안정적으로\s*운영|모니터링/ },
    { id: "data", regex: /데이터\s*(분석|활용)|파이프라인|데이터베이스|DBMS|\bSQL\b|통계|모델/ },
    { id: "software", regex: /소프트웨어|프로그램|프로그래밍|코드|\bAPI\b|서비스\s*개발|애플리케이션|배포/ },
    { id: "research", regex: /연구|실험|평가|검증|시험|특성\s*분석/ },
    { id: "business", regex: /고객|시장|영업|전략|사업|매출/ },
  ];

  function evidenceOf(rows) { return unique((rows || []).flatMap((row) => row.evidenceIds || [])); }
  function topicParticle(word) {
    const hangul = String(word || "").match(/[가-힣](?!.*[가-힣])/); const last = hangul ? hangul[0] : String(word || "").slice(-1); const code = last.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "는" : "은";
    return "는";
  }
  function shortDuty(text) {
    const value = clean(text).replace(/^(?:담당\s*업무\s*)/i, "");
    const colon = value.split(/[:：]/);
    if (colon.length > 1 && colon[0].length >= 3 && colon[0].length <= 32) return `${colon[0].trim()}: ${colon.slice(1).join(":").trim()}`;
    return value.length > 170 ? `${value.slice(0, 167).trim()}…` : value;
  }
  function axisPresentation(axisId, source) {
    const has = (regex) => hasAny(source, regex);
    const map = {
      launch: { title: has(/신차/) ? "신차 양산 준비" : "제품 양산 준비", purpose: has(/신차/) ? "신차가 생산 현장에 안정적으로 도입되도록 준비" : "제품이 생산·운영 환경에 안정적으로 도입되도록 준비" },
      defect_root_cause: { title: "전극 불량 원인·메커니즘 분석", purpose: "공정 불량의 근본 원인과 발생 메커니즘을 분석해 개선 과제를 도출" },
      technology_development: { title: "전극 공정 신기술 개발·검증", purpose: "생산성과 제품 경쟁력을 높이는 신기술을 개발하고 검증" },
      global_transfer: { title: "검증 기술의 글로벌 법인 전개", purpose: "검증된 공정기술을 해외 생산법인에 전개하고 현장 적용을 지원" },
      line_stabilization: { title: "신규 생산라인 조기 안정화", purpose: "글로벌 신규 생산라인이 빠르게 안정화되도록 기술을 지원" },
      line: { title: has(/생산\s*라인|라인\s*설계/) ? "생산라인·공장 설계" : "공정·운영 체계 설계", purpose: "레이아웃·인원·운영 프로세스를 포함한 생산 체계를 설계" },
      economics: { title: has(/투자비/) ? "공법·투자비·경제성 검토" : "원가·경제성 검토", purpose: "JD에 제시된 비용·투자·수익 관점에서 생산 계획을 검토" },
      automation: { title: has(/스마트\s*팩토리/) ? "자동화·스마트팩토리 고도화" : "자동화·시스템 고도화", purpose: has(/빅데이터|\bAI\b|인공지능|비전/) ? "JD에 명시된 데이터·AI·비전 기술을 현장에 적용해 자동화 수준을 높임" : "자동화 기술과 시스템의 운영 수준을 높임" },
      operations_improvement: { title: "생산 운영 개선", purpose: "저해 요인을 분석해 JD에 제시된 생산 운영 성과를 개선" },
      quality: { title: has(/신차/) ? "신차 품질 확보" : has(/수율/) ? "품질·수율 개선" : "품질 확보·개선", purpose: "제품·공정의 품질 상태를 확인하고 JD에 제시된 품질 목표를 확보" },
      process_operations: { title: "공정·설비 운영 최적화", purpose: "공정과 설비를 안정적으로 운영하고 조건을 최적화" },
      data: { title: "데이터 분석·활용", purpose: "데이터를 수집·분석해 판단과 개선에 활용" },
      software: { title: "소프트웨어·프로그램 개발", purpose: "JD에 명시된 소프트웨어·프로그램 업무를 개발·운영" },
      research: { title: "연구·평가·검증", purpose: "가설이나 기술의 성능을 평가하고 검증" },
      business: { title: "고객·사업 실행", purpose: "고객과 시장 요구를 사업 업무에 연결" },
      other: { title: "기타 핵심 업무", purpose: "사전에 맞지 않더라도 JD가 직접 제시한 업무로 보존" },
    };
    return map[axisId] || map.other;
  }
  function axisWorkSummary(axisId, source) {
    const phraseRules = {
      launch: [/신차\s*준비/, /신제품\s*준비/, /양산\s*(?:준비|전환)/, /제품\s*도입/, /개발\s*단계/],
      defect_root_cause: [/불량의?\s*근본\s*원인/, /발생\s*메커니즘/, /개선점\s*도출/],
      technology_development: [/신기술\s*개발/, /검증된\s*기술/, /제품\s*경쟁력\s*강화/],
      global_transfer: [/Global\s*(?:법인|Site)/i, /글로벌\s*(?:법인|사이트)/, /해외\s*법인/, /기술.*(?:전개|이관)/],
      line_stabilization: [/신규\s*생산\s*라인/, /빠른\s*안정화/, /기술\s*지원/],
      line: [/생산\s*라인\s*설계/, /신공장\s*건설/, /레이아웃/, /표준\s*인원/, /운영관리\s*프로세스\s*수립/, /공정\s*설계/],
      economics: [/공법/, /투자비/, /원가/, /수익성/],
      automation: [/자동화\s*설비\s*고도화/, /스마트\s*팩토리\s*구축/, /빅데이터/, /\bAI\b/, /인공지능/, /비전\s*활용/, /E-FOREST\s*시스템\s*(?:구축|확대\s*적용)?/],
      operations_improvement: [/생산성/, /가동률\s*저해\s*요인/, /가동률/, /처리량/, /납기/],
      quality: [/신차\s*개발\s*단계별\s*부품\s*품질(?:을)?\s*(?:육성\s*및\s*)?확보/, /품질(?:을)?\s*(?:안정화|향상|개선|확보)/, /수율\s*(?:향상|개선)?/, /불량률?\s*(?:감소|개선)?/],
      process_operations: [/공정\s*(?:운영|최적화)/, /조건\s*최적화/, /장비\s*set[- ]?up/i, /안정적으로\s*운영/],
      data: [/데이터\s*(?:분석|활용)/, /데이터\s*파이프라인/, /데이터베이스/, /DBMS/i, /SQL/i, /통계/],
      software: [/소프트웨어/, /프로그램(?:밍)?/, /API/i, /서비스\s*개발/, /애플리케이션/, /배포/],
      research: [/연구/, /실험/, /평가/, /검증/, /시험/, /특성\s*분석/],
      business: [/고객/, /시장/, /영업/, /전략/, /사업/, /매출/],
    };
    const phrases = unique((phraseRules[axisId] || []).flatMap((regex) => {
      const match = String(source).match(new RegExp(regex.source, regex.flags.includes("i") ? "i" : "")); return match ? [match[0].trim()] : [];
    }));
    return phrases.length ? phrases.join(" · ") : shortDuty(source);
  }
  function axisScore(text, axis) {
    const matches = String(text).match(new RegExp(axis.regex.source, "gi"));
    return matches ? matches.length : 0;
  }
  function buildWorkAxes(facts) {
    const buckets = new Map(); const unclassified = [];
    const specificAxisIds = new Set(["defect_root_cause", "technology_development", "global_transfer", "line_stabilization"]);
    facts.duties.forEach((duty) => {
      const allMatched = WORK_AXIS_RULES.filter((axis) => axisScore(duty.value, axis) > 0);
      const specificMatched = allMatched.filter((axis) => specificAxisIds.has(axis.id));
      const matched = specificMatched.length ? specificMatched : allMatched;
      if (!matched.length) { unclassified.push(duty); return; }
      matched.forEach((axis) => {
        if (!buckets.has(axis.id)) buckets.set(axis.id, { ...axis, duties: [] });
        buckets.get(axis.id).duties.push(duty);
      });
    });
    const axes = [...buckets.values()].map((axis) => ({
      id: axis.id,
      ...axisPresentation(axis.id, axis.duties.map((row) => row.value).join(" ")),
      actualWork: [axisWorkSummary(axis.id, axis.duties.map((row) => row.value).join(" "))],
      evidenceIds: evidenceOf(axis.duties),
    }));
    if (unclassified.length) axes.push({ id: "other", ...axisPresentation("other", ""), actualWork: unclassified.map((row) => shortDuty(row.value)), evidenceIds: evidenceOf(unclassified) });
    return axes.slice(0, 6);
  }
  function hasAny(text, regex) { regex.lastIndex = 0; return regex.test(String(text)); }
  function matchingEvidence(facts, regex) {
    const rows = [...facts.duties, ...facts.metrics, ...facts.keywords.map((row) => ({ value: row.original, evidenceIds: row.evidenceIds }))];
    return evidenceOf(rows.filter((row) => hasAny(row.value, regex)));
  }
  function buildProblems(facts, axes) {
    const source = facts.duties.map((row) => row.value).join(" "); const candidates = [];
    const directTerms = (terms) => terms.filter(([regex]) => hasAny(source, regex)).map(([, label]) => label);
    const operating = directTerms([[/생산성/, "생산성"], [/가동률/, "가동률"], [/처리량/, "처리량"], [/납기/, "납기"]]);
    if (operating.length) candidates.push({ regex: /생산성|가동률|저해\s*요인|처리량|납기/, problem: `${operating.join("·")}을 개선하거나 확보해야 함`, target: hasAny(source, /저해\s*요인/) ? "JD가 언급한 운영 저해 요인" : "JD에 제시된 생산 운영 상태", direction: hasAny(source, /분석/) ? "운영 상태와 저해 요인을 분석하고 개선" : "운영 상태를 확인하고 개선 활동을 수행", result: `${operating.join("·")} 개선` });
    const quality = directTerms([[/품질/, "품질"], [/수율/, "수율"], [/불량/, "불량" ]]);
    if (quality.length) candidates.push({ regex: /품질|수율|불량|근본\s*원인|발생\s*메커니즘/, problem: hasAny(source, /불량.*(?:근본\s*원인|발생\s*메커니즘)/) ? "전극 공정 불량의 근본 원인과 발생 메커니즘을 밝혀야 함" : `${quality.join("·")} 목표를 확보하거나 개선해야 함`, target: hasAny(source, /전극/) ? "전극 공정에서 발생하는 불량과 공정 상태" : hasAny(source, /부품\s*품질/) ? "JD에 언급된 부품 품질" : "JD에 언급된 제품·공정 품질", direction: hasAny(source, /근본\s*원인|발생\s*메커니즘/) ? "원인과 발생 메커니즘을 분석해 개선점을 도출하고 과제로 수행" : "상태와 원인을 확인하고 확보·개선 활동을 수행", result: hasAny(source, /불량.*(?:근본\s*원인|발생\s*메커니즘)/) ? "불량 원인 규명·개선" : `${quality.join("·")} 확보·개선` });
    if (hasAny(source, /Global\s*(?:법인|Site)|글로벌\s*(?:법인|사이트)|해외\s*법인/i)) candidates.push({ regex: /Global\s*(?:법인|Site)|글로벌\s*(?:법인|사이트)|해외\s*법인|기술.*(?:전개|이관)/i, problem: "검증된 공정기술을 글로벌 생산 현장에 동일한 수준으로 적용해야 함", target: "JD에 언급된 글로벌 법인과 검증 기술", direction: "검증 기술을 현장에 전개하고 신규 라인의 안정화를 기술 지원", result: "글로벌 생산라인 조기 안정화" });
    const economy = directTerms([[/공법/, "공법"], [/투자비/, "투자비"], [/원가/, "원가"], [/수익성/, "수익성"]]);
    if (economy.length) candidates.push({ regex: /공법|투자비|원가|수익성/, problem: `${economy.join("·")}을 함께 검토해야 함`, target: `${economy.join("·")} 관련 계획과 산출 내용`, direction: "JD에 제시된 비용·투자·수익 관점에서 대안을 검토", result: `${economy.join("·")} 검토 결과 확보` });
    if (hasAny(source, /신차|신제품|양산\s*(준비|전환)|개발\s*단계/)) candidates.push({ regex: /신차|신제품|양산\s*(준비|전환)|개발\s*단계/, problem: hasAny(source, /신차/) ? "신차를 생산 현장에 안정적으로 도입해야 함" : "제품을 생산 현장에 안정적으로 도입해야 함", target: hasAny(source, /구조|설계/) ? "JD에 언급된 제품 구조·설계와 생산 조건" : "JD에 언급된 제품과 생산 조건", direction: "사전 검토와 생산 준비 활동을 수행", result: hasAny(source, /신차/) ? "신차 양산 준비" : "제품 양산 준비" });
    if (hasAny(source, /자동화|스마트\s*팩토리|빅데이터|\bAI\b|비전/)) candidates.push({ regex: /자동화|스마트\s*팩토리|빅데이터|\bAI\b|비전/, problem: "자동화 설비와 기술 적용 수준을 높여야 함", target: "JD에 언급된 자동화 설비와 적용 기술", direction: "원문에 명시된 기술을 개발·적용", result: hasAny(source, /스마트\s*팩토리/) ? "자동화·스마트팩토리 고도화" : "자동화 수준 고도화" });
    return candidates.map((row) => ({ ...row, evidenceIds: matchingEvidence(facts, row.regex) })).filter((row) => row.evidenceIds.length).slice(0, 6);
  }
  function findAxisForRequirement(value, axes) {
    if (/자격증|기사\s*(?:자격|보유)|어학|영어\s*성적|학위|졸업/.test(String(value))) return null;
    const tokens = String(value).match(/[가-힣A-Za-z]{2,}/g) || [];
    let axis = axes.find((item) => item.actualWork.some((work) => tokens.some((token) => normalize(work).includes(normalize(token)))));
    if (!axis && /분석|데이터|Python|SQL|DBMS|\bR\b|통계|프로그램/i.test(value)) axis = axes.find((item) => ["data", "operations_improvement", "automation", "software"].includes(item.id));
    if (!axis && /공정|원리|반도체|설계|전공|공학/i.test(value)) axis = axes.find((item) => ["process_operations", "operations_improvement", "line", "research"].includes(item.id));
    if (!axis && /협업|커뮤니케이션/i.test(value)) axis = axes[0];
    return axis || null;
  }
  function buildCompetencyLinks(facts, axes) {
    const rows = [...facts.competencies, ...facts.preferred, ...facts.required];
    const seen = new Set(); const links = [];
    rows.forEach((row) => {
      const value = row.value; const normalized = normalize(value); if (!normalized || seen.has(normalized)) return;
      if (ELIGIBILITY_HINT.test(value)) return;
      const axis = findAxisForRequirement(value, axes);
      if (!axis) return;
      let reason = `${axis.title} 업무의 대상을 이해하고 실행하기 위한 배경으로 연결됩니다.`;
      if (/분석|데이터|Python|SQL|통계/i.test(value)) reason = `${axis.title}에서 현상을 수치로 확인하고 원인을 좁히는 데 연결됩니다.`;
      else if (/협업|커뮤니케이션/i.test(value)) reason = `${axis.title} 수행 중 관련 조직과 조건·일정·결과를 조율하는 데 연결됩니다.`;
      else if (/공정|원리|반도체|설계|공학/i.test(value)) reason = `${axis.title}의 변수와 기술적 제약을 이해하는 기반으로 연결됩니다.`;
      links.push({ requirement: value, axisTitle: axis.title, reason, evidenceIds: unique([...(row.evidenceIds || []), ...axis.evidenceIds]) }); seen.add(normalized);
    });
    return links.slice(0, 6);
  }
  function buildPerformanceGroups(facts, axes) {
    const groups = [
      ["생산 운영 지표", /생산성|가동률|처리량|납기/, ["operations_improvement"]], ["품질 지표", /품질|수율|불량률/, ["quality"]], ["경제성 지표", /원가|수익성/, ["economics"]],
    ];
    const rows = [...facts.metrics, ...facts.keywords.map((row) => ({ value: row.original, evidenceIds: row.evidenceIds }))];
    return groups.map(([category, regex, axisIds]) => {
      const matched = mergeFacts(rows.filter((row) => hasAny(row.value, regex)));
      if (!matched.length) return null;
      const items = [];
      matched.map((row) => row.value).sort((a, b) => b.length - a.length).forEach((value) => {
        if (!items.some((item) => normalize(item).includes(normalize(value)) || normalize(value).includes(normalize(item)))) items.push(value);
      });
      const relatedAxes = axes.filter((axis) => axisIds.includes(axis.id)).map((axis) => axis.title);
      return { category, items, connection: relatedAxes.length ? `${unique(relatedAxes).join("·")} 업무의 결과를 확인하는 기준입니다.` : "JD가 직접 언급한 업무 결과 기준입니다.", evidenceIds: evidenceOf(matched) };
    }).filter(Boolean);
  }
  function buildDeliveryGoals(facts, axes) {
    const groups = [["구축·설계 산출물", /라인\s*설계|레이아웃|공장\s*건설|시스템\s*구축|프로세스\s*수립/, ["line", "economics"]], ["자동화·혁신 목표", /자동화|스마트\s*팩토리|고도화|확대\s*적용/, ["automation"]]];
    const rows = facts.duties;
    return groups.map(([category, regex, axisIds]) => {
      const matched = rows.filter((row) => hasAny(row.value, regex)); if (!matched.length) return null;
      const relatedAxes = axes.filter((axis) => axisIds.includes(axis.id)).map((axis) => axis.title);
      return { category, description: relatedAxes.length ? `${unique(relatedAxes).join("·")}에서 만들어야 할 구축·설계 결과입니다.` : "JD가 직접 제시한 구축·설계 결과입니다.", evidenceIds: evidenceOf(matched) };
    }).filter(Boolean);
  }
  function directConceptLabel(source, terms) { return terms.filter(([regex]) => hasAny(source, regex)).map(([, label]) => label).join("·"); }
  function buildEvidenceDensity(facts, units) {
    const concepts = [
      [[[/생산성/, "생산성"], [/가동률/, "가동률"]], /생산성|가동률/],
      [[[/품질/, "품질"], [/수율/, "수율"], [/불량/, "불량"]], /품질|수율|불량/],
      [[[/자동화/, "자동화"], [/스마트\s*팩토리/, "스마트팩토리"], [/빅데이터/, "빅데이터"], [/\bAI\b|인공지능/, "AI"], [/비전/, "비전"]], /자동화|스마트\s*팩토리|빅데이터|\bAI\b|인공지능|비전/],
      [[[/라인/, "라인"], [/레이아웃/, "레이아웃"], [/공법/, "공법"]], /라인|레이아웃|공법|공정\s*설계/],
      [[[/원가/, "원가"], [/투자비/, "투자비"], [/수익성/, "수익성"]], /원가|투자비|수익성/],
      [[[/운영/, "운영"], [/안정/, "안정화"], [/set[- ]?up/i, "Set-up"]], /운영|안정|set[- ]?up/],
    ];
    const evidenceRows = [...facts.duties, ...facts.competencies, ...facts.required, ...facts.preferred];
    const unitMap = new Map(units.map((unit) => [unit.id, unit])); const sectionNames = { duty: "주요 업무", duty_inferred: "주요 업무", required: "필수 조건", preferred: "우대 조건", unspecified: "기타" };
    return concepts.map(([terms, regex]) => {
      const matched = evidenceRows.filter((row) => hasAny(row.value, regex)); const refs = evidenceOf(matched);
      if (!refs.length) return null;
      const source = matched.map((row) => row.value).join(" "); const label = directConceptLabel(source, terms);
      const sections = unique(refs.map((id) => sectionNames[unitMap.get(id)?.section] || "기타")); const inDuty = sections.includes("주요 업무");
      const level = sections.length >= 2 || refs.length >= 3 ? "높은 근거 밀도" : inDuty ? "중간 근거 밀도" : "보조 근거";
      const reason = `${sections.join("·")}의 ${refs.length}개 의미 단위에서 직접 확인됩니다.`;
      return { label, level, reason, sections, evidenceIds: refs };
    }).filter(Boolean).sort((a, b) => {
      const scores = { "높은 근거 밀도": 3, "중간 근거 밀도": 2, "보조 근거": 1 };
      return scores[b.level] - scores[a.level];
    }).slice(0, 6);
  }
  function buildPreparation(facts, axes, suggestions) {
    const must = facts.required.slice(0, 5).map((row) => ({ title: row.value, detail: "지원 전 충족 여부를 원문 기준으로 먼저 확인해야 합니다.", evidenceIds: row.evidenceIds }));
    const strengths = [...facts.preferred, ...facts.competencies].slice(0, 5).map((row) => {
      const axis = findAxisForRequirement(row.value, axes);
      return { title: row.value, detail: axis ? `${axis.title} 업무와 연결되는 경험을 구체적인 행동·결과로 설명할 준비가 필요합니다.` : "특정 업무축에 억지로 연결하지 않고 JD 명시 우대·역량 사항으로 준비합니다.", evidenceIds: unique([...(row.evidenceIds || []), ...(axis?.evidenceIds || [])]) };
    });
    if (!strengths.length) axes.slice(0, 3).forEach((axis) => strengths.push({ title: axis.title, detail: "이 업무와 관련해 본인이 수행한 행동·판단·산출물을 설명할 수 있도록 정리합니다.", evidenceIds: axis.evidenceIds }));
    const study = suggestions.map((row) => ({ title: row.name, detail: row.reason, evidenceIds: row.evidenceIds }));
    return { must, strengths, study };
  }
  function buildCareerAnalysis(facts, suggestions, units) {
    const workAxes = buildWorkAxes(facts); const performanceGroups = buildPerformanceGroups(facts, workAxes);
    const metricNames = unique(performanceGroups.flatMap((row) => row.items)).slice(0, 5);
    const axisNames = workAxes.slice(0, 4).map((row) => row.title);
    const definitionRefs = unique([...workAxes.slice(0, 4).flatMap((row) => row.evidenceIds), ...performanceGroups.flatMap((row) => row.evidenceIds)]);
    const role = facts.jobTitle.value === "원문에 없음" ? "이 직무" : facts.jobTitle.value;
    const definition = definitionRefs.length && axisNames.length
      ? interpretation("직무 한 줄 정의", `${role}${topicParticle(role)} ${axisNames.join(", ")}${workAxes.length > 4 ? " 등" : ""}의 업무를 통해 ${metricNames.length ? `${metricNames.join("·")} 같은 성과` : "JD에 제시된 업무 목표"}를 확보·개선하는 역할로 해석됩니다.`, definitionRefs)
      : interpretation("직무 한 줄 정의", "해석 근거 부족", []);
    return {
      definition,
      workAxes,
      problems: buildProblems(facts, workAxes),
      competencyLinks: buildCompetencyLinks(facts, workAxes),
      performanceGroups,
      deliveryGoals: buildDeliveryGoals(facts, workAxes),
      emphasis: buildEvidenceDensity(facts, units),
      preparation: buildPreparation(facts, workAxes, suggestions),
    };
  }
  function validateCareerAnalysis(source, career) {
    const protectedTerms = ["수율", "OEE", "Cpk", "PLC", "JMP", "Minitab", "Python", "SQL", "DBMS", "E-FOREST"];
    const withoutStudySuggestions = { ...career, preparation: { ...career.preparation, study: [] } };
    const rendered = JSON.stringify(withoutStudySuggestions).toLocaleLowerCase("ko");
    const original = String(source || "").toLocaleLowerCase("ko");
    const unsupportedTerms = protectedTerms.filter((term) => rendered.includes(term.toLocaleLowerCase("ko")) && !original.includes(term.toLocaleLowerCase("ko")));
    return { status: unsupportedTerms.length ? "fail" : "pass", unsupportedTerms, checkedTerms: protectedTerms };
  }
  function analyze(input) {
    const source = String(input?.jdText || "").trim(); if (!source) throw new Error("분석할 JD 원문을 입력해 주세요.");
    const units = segment(source); const facts = extractFacts(source, units, input?.roleName); const interpretations = buildInterpretations(facts); const suggestions = studySuggestions(facts); const warnings = [];
    if (units.some((u) => !u.verified)) warnings.push("일부 근거 문장을 원문에서 다시 찾지 못해 해당 결과를 최종 사실로 확정하지 않았습니다.");
    if (!units.some((u) => u.section === "duty") && units.some((u) => u.section === "duty_inferred")) warnings.push("주요 업무 소제목이 없어 번호·수행 동사를 기준으로 업무 의미 단위를 복원했습니다. 원문과 대조해 주세요.");
    if (!units.some((u) => u.section === "duty" || u.section === "duty_inferred")) warnings.push("주요 업무 소제목 또는 명확한 업무 문장을 찾지 못했습니다. 업무 Fact를 ‘원문에 없음’으로 표시합니다.");
    const careerAnalysis = buildCareerAnalysis(facts, suggestions, units); const validation = validateCareerAnalysis(source, careerAnalysis);
    if (validation.status === "fail") warnings.push(`최종 용어 검증에서 원문에 없는 표현(${validation.unsupportedTerms.join("·")})을 발견했습니다. 해당 해석은 게시 전 확인이 필요합니다.`);
    return { units, facts, interpretations, studySuggestions: suggestions, careerAnalysis, validation, warnings, analyzedAt: new Date().toISOString() };
  }

  root.JDAnalyzer = { SECTION_RULES, KEYWORD_RULES, TOOL_RULES, normalize, clean, segment, previewSource, extractFacts, buildInterpretations, studySuggestions, buildCareerAnalysis, validateCareerAnalysis, analyze };
  if (typeof module !== "undefined" && module.exports) module.exports = root.JDAnalyzer;
})(typeof window !== "undefined" ? window : globalThis);
