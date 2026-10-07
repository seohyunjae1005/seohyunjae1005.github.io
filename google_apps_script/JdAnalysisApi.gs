/**
 * JD 단독 분석 API (Google Apps Script 웹 앱)
 *
 * Script Properties에 GEMINI_API_KEY를 저장한 뒤 웹 앱으로 배포한다.
 * 브라우저에는 키를 노출하지 않으며, AI가 반환한 근거 인용은 원문에
 * 실제 존재하는지 서버에서 검사한다.
 */

const JD_API_VERSION = 'jd-ai-v1';
const JD_MAX_SOURCE_LENGTH = 30000;
const JD_DAILY_LIMIT = 100;

function doGet() {
  return jdJsonResponse_({ ok: true, service: 'JD analysis API', version: JD_API_VERSION });
}

function doPost(event) {
  try {
    const body = JSON.parse(event && event.postData && event.postData.contents || '{}');
    const source = String(body.jdText || '').trim();
    if (!source) throw new Error('분석할 JD 원문이 없습니다.');
    if (source.length > JD_MAX_SOURCE_LENGTH) throw new Error(`JD 원문은 ${JD_MAX_SOURCE_LENGTH}자 이하만 분석할 수 있습니다.`);
    jdConsumeQuota_();

    const properties = PropertiesService.getScriptProperties();
    const apiKey = String(properties.getProperty('GEMINI_API_KEY') || '').trim();
    if (!apiKey) throw new Error('Apps Script의 GEMINI_API_KEY가 설정되지 않았습니다.');
    const model = String(properties.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash-lite').trim();
    const raw = jdCallGemini_(jdBuildPrompt_(body, source), apiKey, model);
    const checked = jdValidateAndTransform_(raw, source);
    return jdJsonResponse_({ ok: true, version: JD_API_VERSION, model, result: checked });
  } catch (error) {
    return jdJsonResponse_({ ok: false, version: JD_API_VERSION, error: String(error && error.message || error) });
  }
}

function jdConsumeQuota_() {
  const cache = CacheService.getScriptCache();
  const key = `jd-api-${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd')}`;
  const count = Number(cache.get(key) || 0) + 1;
  if (count > JD_DAILY_LIMIT) throw new Error('오늘의 JD 분석 시험 한도를 초과했습니다. 내일 다시 시도해 주세요.');
  cache.put(key, String(count), 21600);
}

function jdJsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function jdBuildPrompt_(input, source) {
  const metadata = {
    company: String(input.company || '').trim(),
    role: String(input.role || '').trim(),
    sourceType: String(input.sourceType || '').trim(),
  };
  return `당신은 채용공고(JD) 원문만 분석하는 엄격한 분석기다.

목표: 회사나 직무 종류에 관계없이 입력 JD 자체에서 사실을 추출하고, 그 사실로부터 제한적인 직무 해석을 만든다. 생산기술·품질·구매·연구·설계 등 미리 정한 직무 분류표에 끼워 맞추지 않는다.

절대 규칙:
1. facts는 원문에 실제 적힌 내용만 쓴다. 없으면 빈 배열 또는 "원문에 없음"으로 둔다.
2. 모든 facts 항목과 모든 career 항목에 evidenceQuotes를 넣는다. 각 인용은 JD에서 글자와 단어 순서를 바꾸지 않고 그대로 복사한 짧은 구절이어야 한다.
3. career는 AI 해석이다. 하지만 반드시 evidenceQuotes로 연결해야 한다. 일반 제조업 상식이나 다른 회사 JD의 용어를 추가하지 않는다.
4. JD에 없는 수율, OEE, Cpk, PLC, Python, SQL, SPC, DOE 등을 자동으로 넣지 않는다.
5. 회사명·제품명·전공명·기술명·성과지표는 근거 인용에 실제 등장할 때만 사용한다.
6. 업무축은 이 JD의 표현을 이용해 동적으로 2~6개 만든다. 범용 이름(개발·구현, 문제 해결)만 쓰지 않는다.
7. 성과지표와 구축·설계·운영 같은 과업/산출물을 구분한다.
8. 단순 반복 횟수를 중요도나 합격 가능성으로 표현하지 않는다.
9. 사용자 경험, 적합도, 이력서, 자기소개서, 합격 가능성은 분석하지 않는다.

JSON 외의 글은 출력하지 않는다. 다음 구조를 정확히 지킨다.
{
  "facts": {
    "jobTitle": {"value":"", "evidenceQuotes":[]},
    "productContext": [{"value":"", "evidenceQuotes":[]}],
    "duties": [{"value":"", "evidenceQuotes":[]}],
    "competencies": [{"value":"", "evidenceQuotes":[]}],
    "required": [{"value":"", "evidenceQuotes":[]}],
    "preferred": [{"value":"", "evidenceQuotes":[]}],
    "knowledge": [{"value":"", "evidenceQuotes":[]}],
    "tools": [{"value":"", "evidenceQuotes":[]}],
    "collaborators": [{"value":"", "evidenceQuotes":[]}],
    "metrics": [{"value":"", "evidenceQuotes":[]}],
    "keywords": [{"original":"", "standardized":"", "evidenceQuotes":[]}]
  },
  "career": {
    "definition": {"value":"", "evidenceQuotes":[]},
    "workAxes": [{"title":"", "actualWork":[""], "purpose":"", "evidenceQuotes":[]}],
    "problems": [{"problem":"", "target":"", "direction":"", "result":"", "evidenceQuotes":[]}],
    "competencyLinks": [{"requirement":"", "axisTitle":"", "reason":"", "evidenceQuotes":[]}],
    "performanceGroups": [{"category":"", "items":[""], "connection":"", "evidenceQuotes":[]}],
    "deliveryGoals": [{"category":"", "description":"", "evidenceQuotes":[]}],
    "emphasis": [{"level":"직접 확인", "label":"", "reason":"어느 섹션에서 확인되는지만 설명", "evidenceQuotes":[]}],
    "preparation": {
      "must": [{"title":"", "detail":"", "evidenceQuotes":[]}],
      "strengths": [{"title":"", "detail":"", "evidenceQuotes":[]}],
      "study": [{"title":"", "detail":"JD 요구사항이 아니라 AI 공부 후보라고 명시", "evidenceQuotes":[]}]
    }
  },
  "warnings": [""]
}

메타데이터(사용자 입력이므로 원문 Fact가 아님):
${JSON.stringify(metadata)}

JD 원문 시작
---
${source}
---
JD 원문 끝`;
}

function jdCallGemini_(prompt, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
  };
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code >= 200 && code < 300) {
      const parsed = JSON.parse(text);
      const parts = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts || [];
      const output = parts.map((part) => part.text || '').join('').replace(/^```(?:json)?\s*|\s*```$/gi, '');
      if (!output) throw new Error('Gemini가 분석 결과를 반환하지 않았습니다.');
      return JSON.parse(output);
    }
    lastError = `Gemini HTTP ${code}: ${text.slice(0, 300)}`;
    if (![429, 500, 502, 503, 504].includes(code)) break;
    Utilities.sleep((attempt + 1) * 1500);
  }
  throw new Error(lastError || 'Gemini 호출에 실패했습니다.');
}

function jdNormalizeQuote_(value) {
  return String(value || '').replace(/[\u00a0\u200b]/g, ' ').replace(/\s+/g, ' ').trim();
}

function jdVerifiedQuotes_(quotes, source) {
  const normalizedSource = jdNormalizeQuote_(source);
  return [...new Set((Array.isArray(quotes) ? quotes : []).map(jdNormalizeQuote_).filter((quote) => quote.length >= 4 && normalizedSource.includes(quote)))];
}

function jdValidateAndTransform_(raw, source) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 분석 결과가 JSON 객체가 아닙니다.');
  const evidence = [];
  const evidenceMap = {};
  const removed = [];
  function evidenceIds(quotes, label) {
    const verified = jdVerifiedQuotes_(quotes, source);
    if (!verified.length) { removed.push(label); return []; }
    return verified.map((quote) => {
      if (!evidenceMap[quote]) {
        const id = `JD-${String(evidence.length + 1).padStart(2, '0')}`;
        evidenceMap[quote] = id;
        evidence.push({ id, section: 'AI가 선택한 원문 근거', text: quote, verified: true });
      }
      return evidenceMap[quote];
    });
  }
  function rows(values, label, mapper) {
    return (Array.isArray(values) ? values : []).map((row, index) => {
      const ids = evidenceIds(row && row.evidenceQuotes, `${label} ${index + 1}`);
      return ids.length ? mapper(row, ids) : null;
    }).filter(Boolean);
  }
  const factsRaw = raw.facts || {};
  const jobIds = evidenceIds(factsRaw.jobTitle && factsRaw.jobTitle.evidenceQuotes, '직무명');
  const facts = {
    jobTitle: { value: jobIds.length ? String(factsRaw.jobTitle.value || '원문에 없음') : '원문에 없음', evidenceIds: jobIds, origin: 'jd' },
    productContext: rows(factsRaw.productContext, '제품·사업 맥락', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    duties: rows(factsRaw.duties, '주요 업무', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    competencies: rows(factsRaw.competencies, '요구 역량', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    required: rows(factsRaw.required, '필수 조건', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    preferred: rows(factsRaw.preferred, '우대 조건', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    knowledge: rows(factsRaw.knowledge, '필요 지식', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    tools: rows(factsRaw.tools, '도구', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    collaborators: rows(factsRaw.collaborators, '협업 대상', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    metrics: rows(factsRaw.metrics, '성과 목표', (r, ids) => ({ value: String(r.value || ''), evidenceIds: ids })),
    keywords: rows(factsRaw.keywords, '핵심 키워드', (r, ids) => ({ original: String(r.original || ''), standardized: String(r.standardized || ''), evidenceIds: ids })),
  };
  const careerRaw = raw.career || {};
  function single(row, label, mapper) {
    const ids = evidenceIds(row && row.evidenceQuotes, label);
    return ids.length ? mapper(row, ids) : { status: 'insufficient', value: '해석 근거 부족', evidenceIds: [] };
  }
  const careerAnalysis = {
    definition: single(careerRaw.definition, '직무 Mission', (r, ids) => ({ status: 'supported', value: String(r.value || ''), evidenceIds: ids })),
    workAxes: rows(careerRaw.workAxes, '업무축', (r, ids) => ({ title: String(r.title || ''), actualWork: Array.isArray(r.actualWork) ? r.actualWork.map(String) : [], purpose: String(r.purpose || ''), evidenceIds: ids })),
    problems: rows(careerRaw.problems, '문제 상황', (r, ids) => ({ problem: String(r.problem || ''), target: String(r.target || ''), direction: String(r.direction || ''), result: String(r.result || ''), evidenceIds: ids })),
    competencyLinks: rows(careerRaw.competencyLinks, '역량 연결', (r, ids) => ({ requirement: String(r.requirement || ''), axisTitle: String(r.axisTitle || ''), reason: String(r.reason || ''), evidenceIds: ids })),
    performanceGroups: rows(careerRaw.performanceGroups, '성과 구조', (r, ids) => ({ category: String(r.category || ''), items: Array.isArray(r.items) ? r.items.map(String) : [], connection: String(r.connection || ''), evidenceIds: ids })),
    deliveryGoals: rows(careerRaw.deliveryGoals, '과업·산출물', (r, ids) => ({ category: String(r.category || ''), description: String(r.description || ''), evidenceIds: ids })),
    emphasis: rows(careerRaw.emphasis, '근거 밀도', (r, ids) => ({ level: String(r.level || '직접 확인'), label: String(r.label || ''), reason: String(r.reason || ''), evidenceIds: ids })),
    preparation: {
      must: rows(careerRaw.preparation && careerRaw.preparation.must, '먼저 확인', (r, ids) => ({ title: String(r.title || ''), detail: String(r.detail || ''), evidenceIds: ids })),
      strengths: rows(careerRaw.preparation && careerRaw.preparation.strengths, '강조 준비', (r, ids) => ({ title: String(r.title || ''), detail: String(r.detail || ''), evidenceIds: ids })),
      study: rows(careerRaw.preparation && careerRaw.preparation.study, '공부 후보', (r, ids) => ({ title: String(r.title || ''), detail: String(r.detail || ''), evidenceIds: ids })),
    },
  };
  const studySuggestions = careerAnalysis.preparation.study.map((row) => ({ name: row.title, reason: row.detail, evidenceIds: row.evidenceIds }));
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : []);
  if (removed.length) warnings.unshift(`원문에서 근거 인용을 확인하지 못한 ${removed.length}개 항목을 결과에서 제외했습니다.`);
  return { units: evidence, facts, careerAnalysis, studySuggestions, warnings, validation: { status: removed.length ? 'filtered' : 'pass', removed, verifiedEvidenceCount: evidence.length, checkedTerms: [] }, scope: {} };
}

