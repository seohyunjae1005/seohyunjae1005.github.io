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
const toolFacts = context.jdEnrichVerifiedFacts_({
  required: [], duties: [], knowledge: [], collaborators: [], metrics: [], keywords: [],
  tools: [
    { value: '빅데이터', evidenceQuotes: ['빅데이터'] },
    { value: 'E-FOREST', evidenceQuotes: ['E-FOREST'] },
  ],
}, '빅데이터 E-FOREST');
assert.deepEqual(Array.from(toolFacts.tools, (row) => row.value), ['E-FOREST']);
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
assert.equal(context.jdCleanMatchNarrative_('E1에서 규칙 4에 따라 장비 경험을 확인함'), '저장된 프로필에서 장비 경험을 확인함');
const rejectedMatch = context.jdValidateProfileMatches_({ matches: [{
  requirementId: 'R1', status: 'direct', experienceId: 'E1', profileEvidenceQuote: '존재하지 않는 성과',
}] }, matchRequirements, matchEntries);
assert.equal(rejectedMatch.matches[0].status, 'none');

const questionPrompt = context.jdBuildQuestionMapPrompt_(
  [{ id: 'Q1', text: '품질 문제를 개선한 경험을 작성해 주세요.' }],
  matchRequirements,
  matchEntries,
);
assert.match(questionPrompt, /문항마다 사용자의 어떤 경험을 배치/);
assert.match(questionPrompt, /완성 자소서 문장이 아니라/);
const questionMap = context.jdValidateQuestionMap_({ placements: [{
  questionId: 'Q1', intent: '품질 문제 해결 행동 확인', status: 'strong', experienceId: 'E1',
  profileEvidenceQuote: '불량 데이터를 분석', jdRequirementId: 'R1',
  reasoning: '품질 데이터 분석 행동이 확인됨', writingAngle: '분석 기준과 개선 결과를 중심으로 작성', missingInfo: '',
}] }, [{ id: 'Q1', text: '품질 문제를 개선한 경험을 작성해 주세요.' }], matchRequirements, matchEntries);
assert.equal(questionMap.counts.strong, 1);
assert.equal(questionMap.placements[0].profileEvidenceQuote, '불량 데이터를 분석');
assert.equal(questionMap.placements[0].jdRequirement.text, '제품검사 DPU 분석');
const badQuestionMap = context.jdValidateQuestionMap_({ placements: [{
  questionId: 'Q1', status: 'strong', experienceId: 'E1', profileEvidenceQuote: '존재하지 않는 성과', jdRequirementId: 'R1',
}] }, [{ id: 'Q1', text: '품질 경험' }], matchRequirements, matchEntries);
assert.equal(badQuestionMap.placements[0].status, 'missing');

const outlineSource = '품질 실습에서 데이터 분석을 담당했다. 불량 원인을 확인해야 했다. 조건별 측정값을 비교했다. 원인 후보를 두 가지로 좁혔다.';
const outline = context.jdValidateQuestionOutline_({
  headline: { value: '측정값 비교로 원인 후보를 좁힌 경험', evidenceQuotes: ['조건별 측정값을 비교했다', '원인 후보를 두 가지로 좁혔다'] },
  fields: {
    situation: { value: '불량 원인 확인', evidenceQuotes: ['불량 원인을 확인해야 했다'] },
    role: { value: '데이터 분석 담당', evidenceQuotes: ['데이터 분석을 담당했다'] },
    action: { value: '조건별 측정값 비교', evidenceQuotes: ['조건별 측정값을 비교했다'] },
    result: { value: '원인 후보를 두 가지로 좁힘', evidenceQuotes: ['원인 후보를 두 가지로 좁혔다'] },
  },
}, outlineSource);
assert.equal(outline.fields.action.value, '조건별 측정값 비교');
assert.equal(outline.fields.result.value, '원인 후보를 두 가지로 좁힘');
assert.equal(outline.missingQuestions.length, 0);
const guardedOutline = context.jdValidateQuestionOutline_({
  headline: { value: 'B1500 분석 경험', evidenceQuotes: ['B1500 분석은 다음 달 진행 예정이다'] },
  fields: {
    situation: { value: '', evidenceQuotes: [] }, role: { value: '', evidenceQuotes: [] },
    action: { value: 'B1500 분석 완료', evidenceQuotes: ['B1500 분석은 다음 달 진행 예정이다'] },
    result: { value: '수율 20% 개선', evidenceQuotes: ['B1500 분석은 다음 달 진행 예정이다'] },
  },
}, 'B1500 분석은 다음 달 진행 예정이다.');
assert.equal(guardedOutline.fields.action.value, '');
assert.equal(guardedOutline.fields.result.value, '');
assert.ok(guardedOutline.missingQuestions.some((row) => row.field === 'action'));
assert.ok(guardedOutline.missingQuestions.some((row) => row.field === 'result'));
const deduplicatedOutline = context.jdValidateQuestionOutline_({
  headline: { value: '분석 경험', evidenceQuotes: ['조건별 측정값을 비교했다'] },
  fields: {
    situation: { value: '', evidenceQuotes: [] }, role: { value: '', evidenceQuotes: [] },
    action: { value: '측정값 비교 후 원인 후보를 좁힘', evidenceQuotes: ['조건별 측정값을 비교했다', '원인 후보를 두 가지로 좁혔다'] },
    result: { value: '원인 후보를 두 가지로 좁힘', evidenceQuotes: ['원인 후보를 두 가지로 좁혔다'] },
  },
}, outlineSource);
assert.equal(deduplicatedOutline.fields.action.value, '조건별 측정값을 비교했다');
assert.equal(Array.from(deduplicatedOutline.fields.action.evidenceQuotes).join('|'), '조건별 측정값을 비교했다');
assert.match(context.jdBuildQuestionOutlinePrompt_({ questionText: '문제 해결 경험' }, '실험 경험'), /완성 자기소개서를 쓰지 말고/);

const organizedExperience = context.jdValidateExperienceExtraction_({
  summary: { value: '측정값을 비교해 원인 후보를 두 가지로 좁힘', evidenceQuotes: ['측정값을 조건별로 비교했다', '원인 후보를 두 가지로 좁혔다'] },
  activities: { observed: [], performed: [{ quote: '측정값을 조건별로 비교했다' }], assigned: [{ quote: '측정 데이터 분석 담당' }], ongoing: [], planned: [] },
  fields: {
    role: { value: '측정 데이터 분석 담당', evidenceQuotes: ['측정 데이터 분석 담당'] },
    situation: { value: '조건별 편차 원인 확인', evidenceQuotes: ['조건별 편차의 원인을 확인해야 했다'] },
    action: { value: '측정값을 조건별로 비교함', evidenceQuotes: ['측정값을 조건별로 비교했다'] },
    result: { value: '원인 후보를 두 가지로 좁힘', evidenceQuotes: ['원인 후보를 두 가지로 좁혔다', '존재하지 않는 30% 개선'] },
    tools: { value: '', evidenceQuotes: [] },
  },
}, '측정 데이터 분석 담당. 조건별 편차의 원인을 확인해야 했다. 측정값을 조건별로 비교했다. 원인 후보를 두 가지로 좁혔다.');
assert.equal(organizedExperience.fields.result.value, '원인 후보를 두 가지로 좁힘');
assert.equal(organizedExperience.fields.tools.value, '');
assert.ok(organizedExperience.questions.some((row) => row.field === 'tools'));
assert.ok(!organizedExperience.summary.includes('30%'));
assert.match(context.jdBuildExperiencePrompt_('테스트 경험'), /새로운 사실, 수치, 도구, 성과, 역할을 만들거나/);
const mixedActionResult = context.jdValidateExperienceExtraction_({
  summary: { value: '조건별 측정값을 Excel로 비교해 이상 원인 후보를 두 가지로 좁힘', evidenceQuotes: ['조건별 측정값을 Excel로 비교했고', '이상 원인 후보를 두 가지로 좁혔다'] },
  activities: { observed: [], performed: [{ quote: '조건별 측정값을 Excel로 비교했고' }], assigned: [{ quote: '측정 데이터 분석을 담당했다' }], ongoing: [], planned: [] },
  fields: {
    role: { value: '측정 데이터 분석 담당', evidenceQuotes: ['측정 데이터 분석을 담당했다'] }, situation: { value: '공정 실습', evidenceQuotes: ['공정 실습에서'] },
    action: { value: '조건별 측정값을 Excel로 비교함', evidenceQuotes: ['조건별 측정값을 Excel로 비교했고'] },
    result: { value: '이상 원인 후보를 두 가지로 좁힘', evidenceQuotes: ['이상 원인 후보를 두 가지로 좁혔다'] }, tools: { value: 'Excel', evidenceQuotes: ['Excel'] },
  },
}, '공정 실습에서 측정 데이터 분석을 담당했다. 조건별 측정값을 Excel로 비교했고, 이상 원인 후보를 두 가지로 좁혔다.');
assert.equal(mixedActionResult.fields.action.value, '조건별 측정값을 Excel로 비교함');
assert.equal(mixedActionResult.fields.result.value, '이상 원인 후보를 두 가지로 좁힘');
assert.equal(mixedActionResult.questions.some((row) => row.field === 'result'), false);

const statusSource = 'CMOS 공정을 참관했음. 열증착기는 직접 한번 해봤고. 측정 장비 담당으로 배정받았다. B1500 데이터 분석은 방학간 진행예정이다.';
const statusResult = context.jdValidateExperienceExtraction_({
  summary: { value: 'CMOS 공정을 참관하고 열증착기를 직접 사용했으며, B1500 데이터 분석을 완료했다.', evidenceQuotes: ['CMOS 공정을 참관했음', '열증착기는 직접 한번 해봤고', 'B1500 데이터 분석은 방학간 진행예정이다'] },
  activities: {
    observed: [{ quote: 'CMOS 공정을 참관했음' }], performed: [{ quote: '열증착기는 직접 한번 해봤고' }],
    assigned: [{ quote: '측정 장비 담당으로 배정받았다' }], ongoing: [], planned: [{ quote: 'B1500 데이터 분석은 방학간 진행예정이다' }],
  },
  fields: {
    role: { value: '측정 장비 담당', evidenceQuotes: ['측정 장비 담당으로 배정받았다'] }, situation: { value: '', evidenceQuotes: [] },
    action: { value: 'CMOS 공정을 참관하고 열증착기를 직접 사용했으며 B1500 데이터 분석을 완료함', evidenceQuotes: ['CMOS 공정을 참관했음', '열증착기는 직접 한번 해봤고', 'B1500 데이터 분석은 방학간 진행예정이다'] },
    result: { value: '', evidenceQuotes: [] }, tools: { value: '열증착기 직접 사용, B1500 사용 예정', evidenceQuotes: ['열증착기는 직접 한번 해봤고', 'B1500 데이터 분석은 방학간 진행예정이다'] },
  },
}, statusSource);
assert.equal(statusResult.activities.observed.length, 1);
assert.equal(statusResult.activities.performed.length, 1);
assert.equal(statusResult.activities.planned.length, 1);
assert.deepEqual(Array.from(statusResult.fields.action.evidenceQuotes), ['열증착기는 직접 한번 해봤고']);
assert.doesNotMatch(statusResult.fields.action.value, /B1500|참관/);
assert.doesNotMatch(statusResult.summary, /완료했다/);

const mixedStatusDraft = context.jdValidateExperienceExtraction_({
  summary: { value: 'CMOS 공정을 참관하고 열증착을 직접 수행했으며 분석 환경 구축을 준비 중임', evidenceQuotes: ['CMOS 공정을 참관했음', '열증착기는 직접 한번 해봤고', 'B1500 데이터 분석은 방학간 진행예정이다'] },
  activities: {
    observed: [{ quote: 'CMOS 공정을 참관했음' }], performed: [{ quote: '열증착기는 직접 한번 해봤고' }],
    assigned: [{ quote: '측정 장비 담당으로 배정받았다' }], ongoing: [], planned: [{ quote: 'B1500 데이터 분석은 방학간 진행예정이다' }],
  },
  fields: {
    role: { value: '측정 장비 담당', evidenceQuotes: ['측정 장비 담당으로 배정받았다'] }, situation: { value: '', evidenceQuotes: [] },
    action: { value: 'CMOS 공정 관람, 열증착 직접 수행, B1500 데이터 분석 준비', evidenceQuotes: ['CMOS 공정을 참관했음', '열증착기는 직접 한번 해봤고', 'B1500 데이터 분석은 방학간 진행예정이다'] },
    result: { value: '', evidenceQuotes: [] }, tools: { value: '', evidenceQuotes: [] },
  },
}, statusSource);
assert.equal(mixedStatusDraft.fields.action.value, '열증착기는 직접 한번 해봤고');
assert.deepEqual(Array.from(mixedStatusDraft.fields.action.evidenceQuotes), ['열증착기는 직접 한번 해봤고']);
console.log('JD API two-stage pipeline tests passed');
