const assert = require("node:assert/strict");
const profileStore = require("../docs/profile-store-v2.js");

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

const saved = profileStore.save({
  targetRoles: "SK하이닉스 양산기술",
  educations: [{
    id: "edu-1",
    level: "대학(학사)",
    school: "테스트대학교",
    status: "졸업예정",
    major: "신소재공학",
    gpa: "4.1",
    gpaScale: "4.5",
    coursework: "반도체공정 · 3학점 · A+",
  }],
  skills: "Python 데이터 분석\n반도체 공정 교육",
  certificates: "OPIc IM2",
  languages: "OPIc IM2 · 2026-03",
  experiences: [{
    id: "exp-1",
    type: "공정·분석 실습",
    title: "반도체 공정 실습",
    role: "측정 데이터 분석",
    action: "조건별 측정 데이터를 비교함",
    result: "이상 원인 후보를 정리함",
  }],
  aiExperience: {
    title: "뉴스 분류 프로젝트",
    role: "검증 기준 설계",
    aiUse: "초기 분류 보조",
    verification: "원문과 표본 30건을 비교",
    result: "오분류 규칙을 개선",
  },
}, storage);

assert.equal(profileStore.load(storage).educations[0].major, "신소재공학");
assert.equal(profileStore.summary(saved).experienceCount, 2);
assert.equal(profileStore.summary(saved).educationCount, 1);
assert.equal(profileStore.summary(saved).ready, true);
assert.match(profileStore.toExperienceText(saved), /공정 실습/);
assert.match(profileStore.toExperienceText(saved), /보유 기술 및 교육: Python/);
assert.match(profileStore.toExperienceText(saved), /AI 문제해결 경험/);
const evidenceEntries = profileStore.toEvidenceEntries(saved);
assert.ok(evidenceEntries.some((row) => row.kind === "경험" && /공정 실습/.test(row.text)));
assert.ok(evidenceEntries.some((row) => row.kind === "기술·교육" && /Python/.test(row.text)));
assert.ok(evidenceEntries.every((row) => row.id && row.label && row.text));
assert.equal(profileStore.clear(storage).experiences.length, 0);
assert.equal(profileStore.load(storage).educations.length, 0);

memory.set(profileStore.LEGACY_STORAGE_KEY, JSON.stringify({
  education: "경북대학교 재학",
  major: "화학공학",
  certificates: "산업안전기사\n토익스피킹 AL",
  experiences: "공정 조건을 비교함\n팀 일정을 조율함",
}));
const migrated = profileStore.load(storage);
assert.equal(migrated.educations[0].major, "화학공학");
assert.equal(migrated.educations[0].level, "대학(학사)");
assert.equal(migrated.educations[0].school, "경북대학교");
assert.equal(migrated.educations[0].status, "재학");
assert.equal(migrated.certificates, "산업안전기사");
assert.equal(migrated.languages, "토익스피킹 AL");
assert.equal(migrated.experiences.length, 2);

console.log("Profile store tests passed");
