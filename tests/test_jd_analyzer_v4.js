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

console.log("JD analyzer v4 tests passed");
