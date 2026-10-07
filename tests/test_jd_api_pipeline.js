const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sourceCode = fs.readFileSync('google_apps_script/JdAnalysisApi.gs', 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(sourceCode, context);

const jd = `자격요건
관련 전공하신 분
문제해결역량을 보유하신 분
우대사항
영어 회화 역량을 보유하신 분
주요 활용 Tool
MiniTab`;
const facts = context.jdVerifyRawFacts_({ facts: {
  jobTitle: { value: '품질엔지니어', evidenceQuotes: ['원문에 없는 직무명'] },
  required: [
    { value: '관련 전공', evidenceQuotes: ['관련 전공하신 분'] },
    { value: '문제해결역량', evidenceQuotes: ['문제해결역량을 보유하신 분'] },
  ],
  preferred: [{ value: '영어 회화 역량', evidenceQuotes: ['영어 회화 역량을 보유하신 분'] }],
  tools: [{ value: 'MiniTab', evidenceQuotes: ['MiniTab'] }],
}}, jd);
assert.equal(facts.jobTitle.evidenceQuotes.length, 0);
assert.equal(facts.required.length, 2);
assert.equal(facts.preferred.length, 1);
assert.equal(facts.tools.length, 1);

const career = {
  workAxes: [
    { title: '개발품질 검증', evidenceIds: ['JD-01'] },
    { title: '제품 품질개선', evidenceIds: ['JD-02'] },
    { title: '협력업체 품질보증', evidenceIds: ['JD-03'] },
  ],
  competencyLinks: [{ requirement: '관련 전공', evidenceIds: ['JD-04'] }],
  emphasis: [{ level: '중간 근거 밀도', label: '관련 교과목', reason: '반복', evidenceIds: ['JD-04'] }],
};
const transformedFacts = {
  required: [
    { value: '관련 전공', evidenceIds: ['JD-04'] },
    { value: '문제해결역량', evidenceIds: ['JD-05'] },
  ],
  preferred: [{ value: '영어 회화 역량', evidenceIds: ['JD-06'] }],
  tools: [{ value: 'MiniTab', evidenceIds: ['JD-07'] }],
};
context.jdEnsureCompetencyCoverage_(career, transformedFacts);
assert.equal(career.competencyLinks.length, 4);
assert.ok(career.competencyLinks.some((row) => row.requirement === 'MiniTab' && row.connectionType === '사용 맥락 미명시'));

context.jdEnsureConcreteEmphasis_(career);
assert.equal(career.emphasis.length, 3);
assert.equal(career.emphasis.some((row) => row.label === '관련 교과목'), false);
assert.deepEqual(Array.from(career.emphasis, (row) => row.label), ['개발품질 검증', '제품 품질개선', '협력업체 품질보증']);

const careerPrompt = context.jdBuildCareerPrompt_({}, jd, facts);
assert.match(careerPrompt, /검증 Fact/);
assert.match(careerPrompt, /facts\.required, facts\.preferred, facts\.tools의 모든 항목/);
console.log('JD API two-stage pipeline tests passed');
