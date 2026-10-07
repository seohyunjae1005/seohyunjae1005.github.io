const assert = require("node:assert/strict");
const analyzer = require("../docs/jd-analyzer-v4.js");

function assertEvidenceIntegrity(result) {
  const ids = new Set(result.units.map((row) => row.id));
  const factRows = [
    ...result.facts.duties,
    ...result.facts.competencies,
    ...result.facts.required,
    ...result.facts.preferred,
    ...result.facts.knowledge,
    ...result.facts.tools,
    ...result.facts.collaborators,
    ...result.facts.metrics,
    ...result.facts.keywords,
  ];
  factRows.forEach((row) => {
    assert.ok(row.evidenceIds.length > 0, `근거 없는 Fact: ${row.value || row.original}`);
    row.evidenceIds.forEach((id) => assert.ok(ids.has(id), `존재하지 않는 근거 번호: ${id}`));
  });
  result.interpretations.filter((row) => row.status === "supported").forEach((row) => {
    assert.ok(row.evidenceIds.length > 0, `근거 없는 해석: ${row.label}`);
    row.evidenceIds.forEach((id) => assert.ok(ids.has(id), `존재하지 않는 해석 근거: ${id}`));
  });
  const careerRows = [
    result.careerAnalysis.definition,
    ...result.careerAnalysis.workAxes,
    ...result.careerAnalysis.problems,
    ...result.careerAnalysis.competencyLinks,
    ...result.careerAnalysis.performanceGroups,
    ...result.careerAnalysis.deliveryGoals,
    ...result.careerAnalysis.emphasis,
    ...result.careerAnalysis.preparation.must,
    ...result.careerAnalysis.preparation.strengths,
    ...result.careerAnalysis.preparation.study,
  ].filter((row) => row.status !== "insufficient");
  careerRows.forEach((row) => {
    assert.ok(row.evidenceIds.length > 0, `근거 없는 직무 해석: ${row.title || row.label || row.problem || row.category}`);
    row.evidenceIds.forEach((id) => assert.ok(ids.has(id), `존재하지 않는 직무 해석 근거: ${id}`));
  });
}

const hyundai = `직무명: 생산기술
주요 업무
1) 신차 준비 및 생산 라인 설계: 공법과 투자비를 검토하고 신공장 건설, 레이아웃과 표준인원 및 공장 운영관리 프로세스를 수립합니다.
2) 자동화 설비 고도화 및 스마트팩토리 구축: 빅데이터, AI, 비전 활용 기술을 개발하고 E-FOREST 시스템을 확대 적용합니다.
3) 공장 생산성, 가동률, 수익성, 품질 개선: 가동률 저해요인을 분석하고 개선하며 신차 개발 단계별 부품 품질을 확보합니다.
Minimum qualifications
- 학사 또는 석사 학위를 취득했거나 졸업 예정인 분
- 기계공학, 자동차공학, 산업공학, 전기공학, 전자공학 전공인 분
- SPA, OPIc, TOEIC Speaking, TEPS Speaking 영어회화 성적을 보유한 분`;

const hyundaiResult = analyzer.analyze({ jdText: hyundai });
assert.equal(hyundaiResult.facts.jobTitle.value, "생산기술");
assert.equal(hyundaiResult.facts.jobTitle.origin, "jd");
assert.ok(hyundaiResult.facts.jobTitle.evidenceIds.length > 0);
assert.equal(hyundaiResult.facts.duties.length, 3);
assert.equal(hyundaiResult.facts.required.length, 3);
assert.ok(hyundaiResult.facts.metrics.some((row) => /가동률/.test(row.value)));
assert.ok(hyundaiResult.facts.tools.some((row) => row.value === "AI" ) === false);
assert.ok(hyundaiResult.facts.keywords.some((row) => row.standardized === "Automation / Smart Factory"));
assert.ok(hyundaiResult.careerAnalysis.definition.status === "supported");
assert.ok(hyundaiResult.careerAnalysis.workAxes.some((row) => row.id === "launch"));
assert.ok(hyundaiResult.careerAnalysis.workAxes.some((row) => row.id === "line"));
assert.ok(hyundaiResult.careerAnalysis.workAxes.some((row) => row.id === "economics"));
assert.ok(hyundaiResult.careerAnalysis.workAxes.some((row) => row.id === "automation"));
assert.ok(hyundaiResult.careerAnalysis.workAxes.some((row) => row.id === "operations_improvement"));
assert.ok(hyundaiResult.careerAnalysis.workAxes.some((row) => row.id === "quality"));
assert.ok(hyundaiResult.careerAnalysis.problems.some((row) => /가동률/.test(row.problem)));
assert.ok(hyundaiResult.careerAnalysis.performanceGroups.some((row) => row.category === "경제성 지표"));
assert.ok(hyundaiResult.careerAnalysis.deliveryGoals.some((row) => row.category === "자동화·혁신 목표"));
assert.ok(hyundaiResult.careerAnalysis.preparation.must.some((row) => /영어회화/.test(row.title)));
assert.equal(JSON.stringify(hyundaiResult.careerAnalysis).includes("수율"), false);
assert.equal(hyundaiResult.validation.status, "pass");
assert.equal(JSON.stringify(hyundaiResult).includes("재료·화학"), false);
assert.equal("profile" in hyundaiResult, false);
assertEvidenceIntegrity(hyundaiResult);

const hynix = `직무명: 양산기술
What You'll Experience
• Photolithography, Etch, Ion Implant & Diffusion, Thin Film, Cleaning & CMP 등 핵심 양산 공정을 안정적으로 운영하고 조건을 최적화하여 생산 품질과 수율을 높입니다.
• 반도체 장비를 Set-up하고 지속적인 개선을 수행하며 장비 업체와 협업합니다.
이런 역량이나 경험이 있다면 더 좋습니다
• 반도체 공정 전반의 흐름과 원리를 이해하고 있는 분
• TEST 분석 프로그램 개발 등 프로그래밍을 활용해본 경험이 있는 분`;
const hynixResult = analyzer.analyze({ jdText: hynix });
assert.equal(hynixResult.facts.duties.length, 2);
assert.equal(hynixResult.facts.preferred.length, 2);
assert.ok(hynixResult.facts.collaborators.some((row) => /장비\s*업체/.test(row.value)));
assert.ok(hynixResult.facts.metrics.some((row) => /수율/.test(row.value)));
assert.ok(hynixResult.careerAnalysis.workAxes.some((row) => row.id === "quality"));
assert.ok(hynixResult.careerAnalysis.competencyLinks.some((row) => /반도체 공정/.test(row.requirement)));
assertEvidenceIntegrity(hynixResult);

const generic = analyzer.analyze({
  roleName: "데이터 엔지니어",
  jdText: `주요 업무
- Python과 SQL을 사용해 데이터 파이프라인을 개발합니다.
- 개발 부서와 협업하여 데이터 품질을 개선합니다.
자격 요건
- Python 개발 경험
우대 사항
- Tableau 활용 경험`,
});
assert.equal(generic.facts.jobTitle.origin, "user");
assert.ok(generic.facts.tools.some((row) => row.value === "Python"));
assert.ok(generic.facts.tools.some((row) => row.value === "SQL"));
assert.ok(generic.facts.tools.some((row) => row.value === "Tableau"));
assert.ok(generic.facts.collaborators.some((row) => /개발\s*부서/.test(row.value)));
assert.ok(generic.careerAnalysis.workAxes.some((row) => ["data", "software"].includes(row.id)));
assert.equal("profile" in generic.careerAnalysis, false);
assertEvidenceIntegrity(generic);

const noRequirementHeading = analyzer.analyze({ jdText: "고객 데이터를 분석하고 서비스 품질을 개선합니다." });
assert.equal(noRequirementHeading.facts.required.length, 0);
assert.equal(noRequirementHeading.facts.preferred.length, 0);
assert.equal(noRequirementHeading.facts.jobTitle.value, "원문에 없음");
assert.ok(noRequirementHeading.warnings.length > 0);
assertEvidenceIntegrity(noRequirementHeading);

const noYieldContamination = analyzer.analyze({
  roleName: "생산기술",
  jdText: `주요 업무
- 생산 라인의 품질을 개선합니다.
- 자동화 설비를 구축하고 가동률 저해요인을 분석합니다.
우대 사항
- Python, R, DBMS 활용 경험
- 품질경영기사 자격증 보유`,
});
assert.equal(JSON.stringify(noYieldContamination.careerAnalysis).includes("수율"), false);
assert.equal(noYieldContamination.validation.status, "pass");
assert.ok(noYieldContamination.facts.tools.some((row) => row.value === "DBMS"));
assert.ok(noYieldContamination.careerAnalysis.competencyLinks.some((row) => /Python/.test(row.requirement)));
const licensePreparation = noYieldContamination.careerAnalysis.preparation.strengths.find((row) => /기사/.test(row.title));
assert.ok(licensePreparation);
assert.match(licensePreparation.detail, /특정 업무축에 억지로 연결하지 않고/);
assertEvidenceIntegrity(noYieldContamination);

const deliberateContamination = analyzer.validateCareerAnalysis("품질 개선", {
  definition: { value: "수율 개선" }, workAxes: [], problems: [], competencyLinks: [], performanceGroups: [], deliveryGoals: [], emphasis: [], preparation: { must: [], strengths: [], study: [] },
});
assert.equal(deliberateContamination.status, "fail");
assert.ok(deliberateContamination.unsupportedTerms.includes("수율"));

const lges = `전공
화학공학, 기계공학, 재료공학, 전기전자공학 및 관련 전공
근무지
오창에너지플랜트
인원
-
필수 사항
[모집 대상 : 학사]
✔ 이런 분을 찾고 있어요.
① 공정기술 업무에 대한 이해와 습득을 위해 관련 전공(공학 계열) 지식과 소양을 갖추신 분
② 공정/생산 등 다양한 부서와의 협업을 위한 원활한 커뮤니케이션 및 협업 능력을 보유하신 분
③ 해외 출장에 거부감 없으며, 외국어 소통에 자신감이 있는 분
우대 사항
✔ 이런 분이면 더 좋아요.
① 긍정적인 마인드로 본인이 맡은 업무에 책임을 다하며, 최선을 다해 수행하는 분
② 문제 해결 역량을 보유하신 분 (현상 파악/원인 분석/개선점 도출)
③ 공정 중 발생하는 많은 데이터를 분석해야 하므로 데이터 분석 툴을 활용할 수 있는 분
④ 다양한 부서와의 협업이 많고 중요하기 때문에, 열린 마음으로 소통할 수 있는 분
상세 내용
✔ 우리 조직을 소개합니다.
우리 조직은 전극 공정의 품질/수율/생산성을 향상시키기 위해 기술을 개발하고, 공정을 안정화시키는 조직이에요.
세계 최고 수준의 이차 전지 제조 경쟁력을 확보하고, 전극/조립 공정의 다른 팀들과 협업하여 최고 품질의 셀(Cell)을 만드는 것이 목표에요.
✔ 이런 일을 합니다.
① 공정 중 발생하는 불량의 근본 원인 및 발생 메커니즘을 분석하여 개선점을 도출하고, 과제를 수행합니다.
② 전극 생산성 및 제품 경쟁력 강화를 위한 신기술을 개발하고, 검증된 기술은 Global 법인(Global Site)으로 전개합니다.
③ Global 법인의 신규 생산 라인의 빠른 안정화를 위한 기술을 지원합니다.
✔ 이렇게 성장할 수 있어요.
① 공정/품질 데이터 분석 및 개선 업무를 수행하는 전극 공정 엔지니어 전문가
② 설비 유닛(Unit) 설계 및 개발을 담당하는 설계 엔지니어 전문가`;
const lgesResult = analyzer.analyze({ roleName: "공정기술(전극)", jdText: lges });
assert.equal(lgesResult.facts.duties.length, 3);
assert.equal(lgesResult.facts.preferred.length, 4);
assert.ok(lgesResult.facts.required.some((row) => /학사/.test(row.value)));
assert.ok(lgesResult.facts.required.some((row) => /화학공학/.test(row.value)));
assert.ok(lgesResult.facts.required.some((row) => /해외 출장/.test(row.value)));
assert.ok(lgesResult.careerAnalysis.workAxes.some((row) => row.id === "defect_root_cause"));
assert.ok(lgesResult.careerAnalysis.workAxes.some((row) => row.id === "technology_development"));
assert.ok(lgesResult.careerAnalysis.workAxes.some((row) => row.id === "global_transfer"));
assert.ok(lgesResult.careerAnalysis.workAxes.some((row) => row.id === "line_stabilization"));
assert.ok(lgesResult.careerAnalysis.problems.some((row) => /근본 원인/.test(row.problem)));
assert.ok(lgesResult.careerAnalysis.problems.some((row) => /글로벌/.test(row.problem)));
assert.equal(lgesResult.careerAnalysis.deliveryGoals.length, 0);
assert.equal(lgesResult.facts.knowledge.some((row) => /다양한 부서|데이터 분석 툴/.test(row.value)), false);
assert.ok(lgesResult.facts.keywords.some((row) => row.standardized === "Production Line"));
assert.equal(lgesResult.facts.keywords.some((row) => row.standardized === "Production Line Design"), false);
assert.ok(lgesResult.careerAnalysis.competencyLinks.some((row) => /데이터 분석 툴/.test(row.requirement) && row.axisTitle === "전극 불량 원인·메커니즘 분석"));
assert.ok(lgesResult.careerAnalysis.emphasis.some((row) => /협업|소통/.test(row.label) && row.level === "높은 근거 밀도"));
assert.equal(JSON.stringify(lgesResult.studySuggestions).includes("Python"), false);
assert.equal(JSON.stringify(lgesResult.studySuggestions).includes("SQL"), false);
assertEvidenceIntegrity(lgesResult);

// 현대자동차 채용 페이지처럼 불릿 없이 줄바꿈으로만 업무를 나누고,
// ■ 세부 직무와 전형·기타 안내가 뒤따르는 실제 복사 형식 회귀 테스트.
const hyundaiCopiedFormat = `조직소개
우리 조직은 좋은 품질의 차량을 효율적으로 생산하기 위한 생산 기술을 개발하고 관리하는 조직입니다.

직무상세
완성차 및 파워트레인 공장의 신설·증설, 신제품 생산 준비, 품질 및 가동률 향상 업무를 수행합니다.

■ 완성차 생산기술
신차 투입을 위한 양산 공장의 공법/투자비 검토 및 신 공장 건설 업무 수행
신차 구조 검토 및 설계 개선을 통한 원가 및 수익성 산출
공장 건설 투자비 산출, 레이아웃, 표준인원 검토, 공장 운영관리 프로세스 수립 등
디지털 툴(CATIA/BIG DATA/AI/CPS 등)을 활용한 선행구조 검토 및 품질 확보 업무 수행
생산공장/제품/품질 데이터를 활용한 생산 공법/투자비/설비 사양 검토 및 최적 생산 방안 제시
자동화 설비 고도화 및 빅데이터/AI 응용 기술 개발 통한 스마트팩토리(E-FOREST) 구축

■ 자동화 설비제어 생산기술
신차 생산을 위한 설비 제어 설계/검증 및 프로젝트 수행
PC/PLC 프로그램 설계
AGV/ACS 제어시스템 표준 설계 및 최적화
설비 예방 진단을 위한 데이터 분석, 제어 기술 표준화/신기술 개발

■ 금형 생산기술
신차개발 단계의 금형 기술 개발
무결점 판넬 생산을 위한 금형 양산 품질 확보 및 국내/해외 공장 생산성 향상을 위한 기술 지원

■ PT 생산기술
엔진/변속기 설계도면 양산성 검토, 공정 프로세스 설계, 생산설비 등 4M 생산준비 계획 수립
4M 생산 준비, 제조부문 인수인계, 양산 초기 안정화 활동
양산공장 품질/생산성/수익성 향상
품질시스템, 생산운영시스템 설계/구축

지원자격
학사/석사 학위를 기 취득하셨거나 학사/석사 '26년 8월 내 졸업 예정이신 분
OPIc IM2 or TOEIC Speaking 130 이상 영어회화 성적을 보유하신 분
('24.04.04 ~ '26.04.03 내 취득 점수 기준 / 영어권 해외대학 제외)

우대사항
기계/자동차/전자전기/산업공학/화공/재료/컴퓨터공학 관련 학과를 전공하신 분
기사 자격증 및 업무 관련 자격증을 보유하신 분
데이터 운영 및 분석 관련 SW(DBMS, Python, R 등) 활용 프로젝트/과제 수행 경험이 있으신 분
C/C++/C#/Python/JS 등 소프트웨어 코딩, PLC 프로그램 설계 경험이 있으신 분
CATIA/CAD/DM Works Tool 사용 가능하신 분

전형단계
지원서 접수
서류전형
직무면접

기타
[중복지원 제한]
동일 기간동안 진행 중인 채용 공고에 중복으로 지원할 수 없습니다.
[기타 유의사항]
지원서를 포함하여 제출한 내용이 사실과 다를 경우 합격이 취소될 수 있습니다.
지원자격 미충족이 확인되는 경우 전형상 불이익을 받을 수 있습니다.
최종 합격 후 회사가 지정하는 입사일에 입사 불가할 경우
[지원자 참고사항]
지원서 접수는 현대자동차 채용 홈페이지를 통해 접수합니다.`;
const hyundaiCopiedResult = analyzer.analyze({ roleName: "생산기술", jdText: hyundaiCopiedFormat });
assert.ok(hyundaiCopiedResult.facts.duties.length >= 15);
assert.equal(hyundaiCopiedResult.facts.required.length, 3);
assert.equal(hyundaiCopiedResult.facts.preferred.length, 5);
assert.equal([...hyundaiCopiedResult.facts.required, ...hyundaiCopiedResult.facts.preferred].some((row) => /전형단계|서류전형|중복지원|합격이 취소|미충족|입사 불가|채용 홈페이지/.test(row.value)), false);
for (const tool of ["CATIA", "CAD", "DBMS", "Python", "R", "C", "C++", "C#", "JavaScript", "PLC", "CPS", "AGV", "ACS", "DM Works"]) {
  assert.ok(hyundaiCopiedResult.facts.tools.some((row) => row.value === tool), `현대차 명시 도구 누락: ${tool}`);
}
for (const axis of ["launch", "line", "economics", "automation", "operations_improvement", "quality"]) {
  assert.ok(hyundaiCopiedResult.careerAnalysis.workAxes.some((row) => row.id === axis), `현대차 업무축 누락: ${axis}`);
}
assert.equal(hyundaiCopiedResult.careerAnalysis.workAxes.some((row) => row.id === "technology_development"), false);
assert.equal(JSON.stringify(hyundaiCopiedResult).includes("전극 공정"), false);
assert.equal(hyundaiCopiedResult.validation.status, "pass");
assertEvidenceIntegrity(hyundaiCopiedResult);

console.log("JD analyzer v4 tests passed");
