const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sourceCode = fs.readFileSync('google_apps_script/JdAnalysisApi.gs', 'utf8');
const context = { console, Utilities: { formatDate: () => '2026' } };
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

const dnSource = `완제품 품질관리 및 품질개선 업무
설치초기하자/ Field Claim/ 제품검사 DPU 분석 및 품질개선 활동
공작기계 신제품/UNIT 개발 검증/평가 지원 (CFT 참여 및 기능/로직 검증 수행)
고객 입회검사(FAT·SAT) 대응
요건
전공: 기계/전기/전자/제어 등 메카트로닉스 관련 전공, 산업공학
학위: 학사 이상
우대 사항
공작기계 품질관리/검증평가 유경험자 우`;
const dnFacts = context.jdEnrichVerifiedFacts_({
  jobTitle: { value: '품질', evidenceQuotes: ['품질'] }, productContext: [], competencies: [], tools: [], preferred: [], keywords: [
    { original: 'DPU', standardized: 'DPU', evidenceQuotes: ['DPU'] },
    { original: 'FAT', standardized: 'FAT', evidenceQuotes: ['FAT'] },
    { original: 'SAT', standardized: 'SAT', evidenceQuotes: ['SAT'] },
    { original: 'CFT', standardized: 'CFT', evidenceQuotes: ['CFT'] },
  ],
  required: [
    { value: '기계/전기/전자/제어 등 메카트로닉스 관련 전공, 산업공학', evidenceQuotes: ['전공: 기계/전기/전자/제어 등 메카트로닉스 관련 전공, 산업공학'] },
    { value: '학사 이상', evidenceQuotes: ['학위: 학사 이상'] },
  ],
  knowledge: [], collaborators: [], metrics: [],
  duties: [
    { value: '설치초기하자/ Field Claim/ 제품검사 DPU 분석 및 품질개선 활동', evidenceQuotes: ['설치초기하자/ Field Claim/ 제품검사 DPU 분석 및 품질개선 활동'] },
    { value: 'CFT 참여 및 기능/로직 검증 수행', evidenceQuotes: ['CFT 참여 및 기능/로직 검증 수행'] },
    { value: '고객 입회검사(FAT·SAT) 대응', evidenceQuotes: ['고객 입회검사(FAT·SAT) 대응'] },
  ],
}, dnSource);
assert.ok(dnFacts.knowledge.some((row) => /메카트로닉스/.test(row.value)));
assert.equal(dnFacts.knowledge.length, 1);
assert.ok(dnFacts.collaborators.some((row) => row.value === 'CFT'));
assert.ok(dnFacts.collaborators.some((row) => row.value === '고객'));
assert.ok(dnFacts.metrics.some((row) => row.value === '관리·분석 지표: DPU'));
assert.ok(dnFacts.metrics.some((row) => row.value === '성과 목표: 품질 개선'));
assert.equal(dnFacts.keywords.find((row) => row.original === 'DPU').standardized, 'Defects Per Unit');
assert.equal(dnFacts.keywords.find((row) => row.original === 'CFT').standardized, 'Cross-Functional Team');
const keywordlessFacts = context.jdEnrichVerifiedFacts_({ required: [], duties: [], knowledge: [], collaborators: [], metrics: [], keywords: [] }, dnSource);
assert.equal(keywordlessFacts.keywords.find((row) => row.original === 'FAT').standardized, 'Factory Acceptance Test');
assert.equal(keywordlessFacts.keywords.find((row) => row.original === 'SAT').standardized, 'Site Acceptance Test');
assert.ok(context.jdSourceWarnings_(dnSource).some((warning) => /문장 중간/.test(warning)));

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
context.jdAnnotateCompetencyKinds_(career, transformedFacts);
assert.equal(career.competencyLinks.find((row) => row.requirement === '관련 전공').sourceKind, '필수 조건');
assert.equal(career.competencyLinks.find((row) => row.requirement === '영어 회화 역량').sourceKind, '우대 조건');
assert.equal(career.competencyLinks.find((row) => row.requirement === 'MiniTab').sourceKind, '명시 Tool');

const preparation = {
  preparation: {
    must: [{ title: '필수', evidenceIds: ['JD-04'] }, { title: '잘못 들어온 우대', evidenceIds: ['JD-06'] }],
    strengths: [{ title: '우대', evidenceIds: ['JD-06'] }, { title: '잘못 들어온 필수', evidenceIds: ['JD-04'] }],
    study: [],
  },
};
context.jdEnforcePreparationSources_(preparation, transformedFacts);
assert.deepEqual(Array.from(preparation.preparation.must, (row) => row.title), ['필수']);
assert.deepEqual(Array.from(preparation.preparation.strengths, (row) => row.title), ['우대']);

context.jdEnsureConcreteEmphasis_(career);
assert.equal(career.emphasis.length, 3);
assert.equal(career.emphasis.some((row) => row.label === '관련 교과목'), false);
assert.deepEqual(Array.from(career.emphasis, (row) => row.label), ['개발품질 검증', '제품 품질개선', '협력업체 품질보증']);

const problemCareer = { problems: [
  { problem: '설치초기하자', target: '설치초기하자', direction: 'DPU 분석 및 품질개선', result: '직접 명시 없음', evidenceIds: ['JD-10'] },
  { problem: 'Field Claim', target: 'Field Claim', direction: 'DPU 분석 및 품질개선', result: '직접 명시 없음', evidenceIds: ['JD-10'] },
] };
context.jdMergeProblemFlows_(problemCareer, { metrics: [{ value: '성과 목표: 품질 개선', evidenceIds: ['JD-10'] }] });
assert.equal(problemCareer.problems.length, 1);
assert.match(problemCareer.problems[0].problem, /설치초기하자.*Field Claim/);
assert.equal(problemCareer.problems[0].result, '품질 개선');

const careerPrompt = context.jdBuildCareerPrompt_({}, jd, facts);
assert.match(careerPrompt, /검증 Fact/);
assert.match(careerPrompt, /facts\.required, facts\.preferred, facts\.tools의 모든 항목/);
assert.match(careerPrompt, /수행 행위만으로 문제 상황을 역추정하지 않는다/);
assert.match(careerPrompt, /facts\.required가 비어 있으면 반드시 빈 배열/);
assert.match(careerPrompt, /같은 근거 문장에서 나온 초기하자/);
assert.match(careerPrompt, /전문가로 성장.*직무 Mission이나 성과로 사용하지 않는다/);

const matchRequirements = [{ id: 'R1', kind: '주요 업무', text: '제품검사 DPU 분석', evidenceQuote: '제품검사 DPU 분석' }];
const matchEntries = [{ id: 'E1', kind: '경험', label: '품질 실습', text: '제품 불량 데이터를 분석하고 검사 기준을 개선함' }];
const matchPrompt = context.jdBuildProfileMatchPrompt_(matchRequirements, matchEntries);
assert.match(matchPrompt, /direct는 프로필 원문이 같은 구체 업무/);
assert.match(matchPrompt, /profileEntries\.text에서 글자와 순서를 바꾸지 않은/);
const matched = context.jdValidateProfileMatches_({ matches: [{
  requirementId: 'R1', status: 'direct', experienceId: 'E1', profileEvidenceQuote: '불량 데이터를 분석',
  reasoning: '불량 데이터 분석 경험이 직접 확인됨', writingDirection: '분석 기준과 개선 결과를 설명',
}] }, matchRequirements, matchEntries);
assert.equal(matched.counts.direct, 1);
assert.equal(matched.matches[0].profileEvidenceQuote, '불량 데이터를 분석');
const overstatedDirect = context.jdValidateProfileMatches_({ matches: [{
  requirementId: 'R1', status: 'direct', experienceId: 'E1', profileEvidenceQuote: '제품 불량 데이터를 분석',
  reasoning: '장비 경험이 있음', writingDirection: '구체화',
}] }, [{ id: 'R1', kind: '주요 업무', text: '반도체 장비를 Set-up하고 개조·개선', evidenceQuote: '장비를 Set-up' }], matchEntries);
assert.equal(overstatedDirect.matches[0].status, 'indirect');
const optimizedOverstatement = context.jdValidateProfileMatches_({ matches: [{
  requirementId: 'R1', status: 'direct', experienceId: 'E1', profileEvidenceQuote: '제품 불량 데이터를 분석',
}] }, [{ id: 'R1', kind: '주요 업무', text: '생산 공정과 테스트를 구현하고 최적화', evidenceQuote: '공정을 구현' }], matchEntries);
assert.equal(optimizedOverstatement.matches[0].status, 'indirect');
const rejectedMatch = context.jdValidateProfileMatches_({ matches: [{
  requirementId: 'R1', status: 'direct', experienceId: 'E1', profileEvidenceQuote: '존재하지 않는 성과',
}] }, matchRequirements, matchEntries);
assert.equal(rejectedMatch.matches[0].status, 'none');
console.log('JD API two-stage pipeline tests passed');
