const assert = require("node:assert/strict");
const client = require("../docs/jd-ai-client.js");

assert.throws(() => client.normalizeEndpoint("http://example.com"), /https/);
assert.throws(() => client.normalizeEndpoint("https://example.com/exec"), /Google Apps Script/);
assert.match(client.normalizeEndpoint("https://script.google.com/macros/s/test/exec"), /^https:\/\/script\.google\.com/);

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

