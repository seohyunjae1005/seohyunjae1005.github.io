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

let history = {};
history = workspace.addHistory(history, placements[0], "첫 번째 초안", "2026-10-30T10:00:00.000Z");
history = workspace.addHistory(history, placements[0], "두 번째 초안", "2026-10-30T11:00:00.000Z");
history = workspace.addHistory(history, placements[0], "두 번째 초안", "2026-10-30T12:00:00.000Z");
assert.equal(workspace.historyFor(history, placements[0]).length, 2);
assert.equal(workspace.historyFor(history, placements[0])[0].value, "두 번째 초안");

const duplicateDrafts = {
  [workspace.draftId(placements[0])]: "품질 실습에서 조건별 측정 데이터를 비교하고 불량 원인 후보를 두 가지로 좁혔습니다.",
  [workspace.draftId(placements[1])]: "공정 실습에서 조건별 측정 데이터를 비교하고 불량 원인 후보를 두 가지로 좁힌 뒤 개선안을 정리했습니다.",
};
const overlaps = workspace.findDraftOverlaps(placements, duplicateDrafts);
assert.equal(overlaps.length, 1);
assert.equal(overlaps[0].leftIndex, 0);
assert.equal(overlaps[0].rightIndex, 1);
assert.ok(overlaps[0].sharedTerms.includes("조건별"));

const numericDrafts = {
  [workspace.draftId(placements[0])]: "측정 결과 원인 후보를 2개로 좁혔습니다.",
  [workspace.draftId(placements[1])]: "추가 분석을 통해 원인 후보를 3개로 좁혔습니다.",
};
const packageReview = workspace.reviewPackage(placements, numericDrafts, [{ text: "조건별 측정으로 원인 후보를 2개로 좁혔다." }]);
assert.equal(packageReview.unsupportedNumbers.length, 1);
assert.equal(packageReview.unsupportedNumbers[0].value, "3개");
assert.equal(packageReview.numericConflicts.length, 1);
assert.equal(packageReview.numericConflicts[0].leftValue, "2개");
assert.equal(packageReview.numericConflicts[0].rightValue, "3개");

const submissionChecklist = workspace.buildSubmissionChecklist({
  placements,
  drafts: numericDrafts,
  profileEntries: [{ text: "조건별 측정으로 원인 후보를 2개로 좁혔다." }],
});
assert.equal(submissionChecklist.status, "writing");
assert.equal(submissionChecklist.completedCount, 2);
assert.equal(submissionChecklist.evidenceMissingCount, 1);
assert.equal(submissionChecklist.unsupportedNumberCount, 1);
assert.equal(submissionChecklist.numericConflictCount, 1);

const groundedPlacements = [placements[0]];
const groundedDrafts = { [workspace.draftId(placements[0])]: "조건별 측정으로 원인 후보를 2개로 좁혔다." };
const groundedChecklist = workspace.buildSubmissionChecklist({
  placements: groundedPlacements,
  drafts: groundedDrafts,
  profileEntries: [{ text: "조건별 측정으로 원인 후보를 2개로 좁혔다." }],
});
assert.equal(groundedChecklist.status, "basic_pass");
assert.equal(groundedChecklist.completedCount, 1);
assert.equal(groundedChecklist.unsupportedNumberCount, 0);

const cleanSubmission = workspace.buildSubmissionText({
  company: "테스트기업", role: "품질", placements: groundedPlacements,
  drafts: groundedDrafts, profileEntries: [{ text: "조건별 측정으로 원인 후보를 2개로 좁혔다." }],
  format: "sectioned", includeReview: false,
});
assert.match(cleanSubmission, /Q1\. 직무 관련 경험/);
assert.match(cleanSubmission, /원인 후보를 2개로/);
assert.doesNotMatch(cleanSubmission, /최종 점검|경험 근거 부족|JD 직접 연결 없음/);

const reviewSubmission = workspace.buildSubmissionText({
  company: "테스트기업", role: "품질", placements,
  drafts: numericDrafts, profileEntries: [{ text: "조건별 측정으로 원인 후보를 2개로 좁혔다." }],
  format: "numbered", includeReview: true,
});
assert.match(reviewSubmission, /최종 점검: 작성 중/);
assert.match(reviewSubmission, /경험 원문 미확인 수치: 1/);
assert.match(reviewSubmission, /1\. 직무 관련 경험/);
assert.match(reviewSubmission, /글자 수:/);

console.log("application workspace tests passed");
