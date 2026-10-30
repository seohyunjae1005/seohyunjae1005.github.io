const assert = require("node:assert/strict");
const client = require("../docs/jd-ai-client.js");

assert.throws(() => client.normalizeEndpoint("http://example.com"), /https/);
assert.throws(() => client.normalizeEndpoint("https://example.com/exec"), /Google Apps Script/);
assert.match(client.normalizeEndpoint("https://script.google.com/macros/s/test/exec"), /^https:\/\/script\.google\.com/);
assert.deepEqual(client.parseQuestions("1. 지원 직무 관련 경험을 작성해 주세요.\n2) 협업 경험을 작성해 주세요.\n3번 어려운 목표에 도전한 경험을 작성해 주세요."), [
  "지원 직무 관련 경험을 작성해 주세요.", "협업 경험을 작성해 주세요.", "어려운 목표에 도전한 경험을 작성해 주세요.",
]);
assert.deepEqual(client.parseQuestions("지원동기를 작성해 주세요.\n\n직무 역량 경험을 작성해 주세요."), ["지원동기를 작성해 주세요.", "직무 역량 경험을 작성해 주세요."]);
assert.deepEqual(client.parseQuestions("Q1. 문제 해결 경험을 작성해 주세요.\n구체적인 행동과 결과를 포함하세요.\nQ2. 협업 경험을 작성해 주세요."), [
  "문제 해결 경험을 작성해 주세요. 구체적인 행동과 결과를 포함하세요.", "협업 경험을 작성해 주세요.",
]);

const validResult = {
  units: [{ id: "JD-01", section: "AI가 선택한 원문 근거", text: "품질 문제의 근본 원인을 조사합니다.", verified: true }],
  facts: {
    jobTitle: { value: "품질보증", evidenceIds: ["JD-01"] },
    productContext: [], duties: [{ value: "품질 문제 원인 조사", evidenceIds: ["JD-01"] }], competencies: [], required: [], preferred: [], knowledge: [], tools: [], collaborators: [], metrics: [], keywords: [],
  },
  careerAnalysis: { definition: { status: "supported", value: "품질 문제의 재발을 방지하는 직무", evidenceIds: ["JD-01"] } },
};
assert.equal(client.assertResult(validResult), validResult);
assert.throws(() => client.assertResult({ ...validResult, facts: { ...validResult.facts, duties: [{ value: "오류", evidenceIds: ["JD-99"] }] } }), /존재하지 않는 근거/);

(async () => {
  const result = await client.analyze({ jdText: "품질 문제의 근본 원인을 조사합니다." }, {
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetcher: async () => ({ ok: true, json: async () => ({ ok: true, result: validResult }) }),
  });
  assert.equal(result.facts.duties[0].value, "품질 문제 원인 조사");
  console.log("JD AI client tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

(async () => {
  const organized = {
    summary: "측정 데이터를 비교함 → 이상 원인 후보를 정리함",
    activities: {
      observed: [], performed: [{ quote: "조건별 측정 데이터를 비교함" }], assigned: [], ongoing: [], planned: [],
    },
    fields: {
      role: { value: "측정 데이터 분석", evidenceQuotes: ["측정 데이터 분석"] },
      situation: { value: "", evidenceQuotes: [] },
      action: { value: "조건별 측정 데이터를 비교함", evidenceQuotes: ["조건별 측정 데이터를 비교함"] },
      result: { value: "이상 원인 후보를 정리함", evidenceQuotes: ["이상 원인 후보를 정리함"] },
      tools: { value: "", evidenceQuotes: [] },
    },
    questions: [{ field: "tools", question: "사용한 도구가 있었나요?" }],
  };
  const result = await client.organizeExperience({ experienceText: "측정 데이터 분석" }, {
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetcher: async (_url, options) => {
      assert.equal(JSON.parse(options.body).action, "organizeExperience");
      return { ok: true, json: async () => ({ ok: true, result: organized }) };
    },
  });
  assert.equal(result.fields.action.value, "조건별 측정 데이터를 비교함");
})().catch((error) => { console.error(error); process.exitCode = 1; });

(async () => {
  const matchResult = {
    counts: { direct: 1, indirect: 0, none: 0 },
    matches: [{
      requirement: { id: "R1", kind: "주요 업무", text: "DPU 분석" }, status: "direct",
      experience: { id: "E1", kind: "경험", label: "품질 실습" }, profileEvidenceQuote: "불량 데이터를 분석",
      reasoning: "데이터 분석 행동이 직접 확인됨", writingDirection: "분석 대상과 결과를 설명",
    }],
  };
  const result = await client.matchProfile({ jdText: "DPU 분석", requirements: [], profileEntries: [] }, {
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetcher: async (_url, options) => {
      assert.equal(JSON.parse(options.body).action, "matchProfile");
      return { ok: true, json: async () => ({ ok: true, result: matchResult }) };
    },
  });
  assert.equal(result.matches[0].status, "direct");
})().catch((error) => { console.error(error); process.exitCode = 1; });

(async () => {
  const questionResult = {
    counts: { strong: 1, usable: 0, missing: 0 },
    placements: [{
      question: { id: "Q1", text: "품질 개선 경험을 작성해 주세요." }, status: "strong",
      experience: { id: "E1", kind: "경험", label: "품질 실습" }, profileEvidenceQuote: "불량 데이터를 분석",
      jdRequirement: { id: "R1", kind: "주요 업무", text: "DPU 분석" }, intent: "품질 문제 분석 경험 확인",
      reasoning: "분석 행동이 확인됨", writingAngle: "분석 기준과 결과 중심", missingInfo: "", reuseCount: 1,
    }],
  };
  const result = await client.mapQuestions({ jdText: "DPU 분석", questions: ["품질 개선 경험"], requirements: [], profileEntries: [] }, {
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetcher: async (_url, options) => {
      assert.equal(JSON.parse(options.body).action, "mapQuestions");
      return { ok: true, json: async () => ({ ok: true, result: questionResult }) };
    },
  });
  assert.equal(result.placements[0].status, "strong");
})().catch((error) => { console.error(error); process.exitCode = 1; });

(async () => {
  const outline = {
    headline: { value: "불량 원인 후보를 좁힌 분석 경험", evidenceQuotes: ["불량 원인 후보를 좁혔다"] },
    fields: {
      situation: { value: "불량 원인 확인", evidenceQuotes: ["불량 원인을 확인해야 했다"] },
      role: { value: "데이터 분석 담당", evidenceQuotes: ["데이터 분석을 담당했다"] },
      action: { value: "조건별 데이터를 비교", evidenceQuotes: ["조건별 데이터를 비교했다"] },
      result: { value: "원인 후보를 좁힘", evidenceQuotes: ["불량 원인 후보를 좁혔다"] },
    },
    missingQuestions: [],
  };
  const result = await client.buildQuestionOutline({ experienceText: "경험", questionText: "문제 해결 경험" }, {
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetcher: async (_url, options) => {
      assert.equal(JSON.parse(options.body).action, "buildQuestionOutline");
      return { ok: true, json: async () => ({ ok: true, result: outline }) };
    },
  });
  assert.equal(result.fields.action.value, "조건별 데이터를 비교");
})().catch((error) => { console.error(error); process.exitCode = 1; });

(async () => {
  const review = {
    status: "needs_review", summary: "근거 확인 필요",
    supportedPoints: [{ draftQuote: "조건별 데이터를 비교했다", evidenceQuote: "조건별 데이터를 비교했다", note: "행동 근거 확인" }],
    unsupportedClaims: [{ draftQuote: "수율을 30% 높였다", reason: "경험 원문에 수치 없음" }],
    structureGaps: [{ field: "role", message: "본인 역할이 빠졌습니다." }],
    revisionPlan: [{ priority: 1, instruction: "근거 없는 수치를 삭제하세요." }],
  };
  const result = await client.reviewApplicationDraft({ experienceText: "경험", draftText: "답변" }, {
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetcher: async (_url, options) => {
      assert.equal(JSON.parse(options.body).action, "reviewApplicationDraft");
      return { ok: true, json: async () => ({ ok: true, result: review }) };
    },
  });
  assert.equal(result.status, "needs_review");
})().catch((error) => { console.error(error); process.exitCode = 1; });

