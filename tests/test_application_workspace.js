const assert = require("node:assert/strict");
const workspace = require("../docs/application-workspace.js");

const placements = [
  {
    question: { text: "직무 관련 경험" }, status: "strong",
    experience: { id: "E1", kind: "경험", label: "품질 실습" },
    jdRequirement: { text: "불량 원인 분석" }, intent: "직무 역량 확인", writingAngle: "분석 행동 중심",
  },
  {
    question: { text: "문제 해결 경험" }, status: "usable",
    experience: { id: "E1", kind: "경험", label: "품질 실습" },
    jdRequirement: null, intent: "문제 해결 과정 확인", writingAngle: "비교 기준 중심",
  },
  { question: { text: "협업 경험" }, status: "missing", experience: null, jdRequirement: null },
];

const summary = workspace.summarize(placements);
assert.equal(summary.questionCount, 3);
assert.equal(summary.uniqueExperienceCount, 1);
assert.equal(summary.repeatedExperienceCount, 1);
assert.equal(summary.missingCount, 1);
assert.equal(summary.noJdAnchorCount, 1);
assert.match(summary.warnings[0].message, /Q1·Q2/);

const key = workspace.draftId(placements[0]);
const text = workspace.buildText({
  company: "테스트기업", role: "품질", placements,
  drafts: { [key]: "조건별 데이터를 비교했다." }, includeDrafts: true,
});
assert.match(text, /테스트기업 · 품질/);
assert.match(text, /Q1\. 직무 관련 경험/);
assert.match(text, /조건별 데이터를 비교했다/);
assert.match(text, /아직 작성하지 않음/);

assert.equal(workspace.readDraft({ [key]: { current: "이전 형식 호환" } }, placements[0]), "이전 형식 호환");
console.log("application workspace tests passed");
