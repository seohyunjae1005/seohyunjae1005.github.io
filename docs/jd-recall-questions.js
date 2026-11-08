(function (root) {
  "use strict";

  // JD 기반 경험 구체화 질문 자동 생성 (로컬, AI/서버 없음)
  // 설계 근거: docs/jd_analysis_design.md "JD 기반 추천 문항"
  // - 최대 4개, 각 문항에 생성 근거가 된 JD 문장 번호 표시
  // - 프로필에서 연결할 경험이 있으면 경험 번호와 원문 표시, 없으면 근거 없음으로 표시
  // - 실제 기업 문항이 아니라 "JD 기반 추천"으로 명확히 표시
  // - 원문 사실(JD 인용)과 해석/제안(질문·지원서 작성 방향)을 분리한다.
  // - 확인되지 않은 경험·수치는 절대 생성하지 않는다. 연결은 프로필 원문에
  //   실제로 나타나는 토큰 overlap으로만 판단한다.
  // - 연결 판정은 3단계다. Apps Script jdMatchProfile_과 같은 의미다:
  //   linked=direct(직접) / indirect=간접 / gap=none(근거 없음).
  //   용어 통일 결정 (2026-11-04 4회차): 로컬 상태값 linked/indirect/gap은
  //   app.js·템플릿·테스트가 이미 쓰고 있어 바꾸지 않고, 의미만 맞춘다.
  //   직접 판정은 jdHasDirectActionEvidence_ 규칙을 따른다 —
  //   주요 업무(duty)에서 요구하는 구체 행동(구현·최적화·Set-up·개조·설계·구축)이
  //   프로필 원문에 없으면 직접이 아니라 간접으로 강등한다.
  //   간접 연결은 "이 경험의 이 부분이 부분적으로 연결된다"는 단서付き로만 표시하고,
  //   직접 경험으로 과장하지 않는다.
  //
  // 입력: jd-analyzer-v4 analyze() 결과 + CareerProfile.toEvidenceEntries() 결과
  // 출력: { questions: [...], warnings: [...], summary: {total, direct, indirect, gap, answerable, background} }
  //  각 question: { id, question, jdQuote, jdEvidenceIds, axisTitle, competency,
  //    focus:{situation, action, result}, direction, linkedExperience, status, label,
  //    indirectNote?, nextAction?, boundary?, subParts? }
  //  answerable = direct만. 간접은 "부분 배경"이라 직접 답할 수 있는 문항 수에
  //  더하지 않는다 (4회차 정정: 3회차까지는 direct+indirect를 합쳐서
  //  "답할 수 있는 문항 4/4"처럼 낙관적으로 보였다). 간접 수는 background로 따로 둔다.

  const MAX_QUESTIONS = 4;
  const PROTECTED_TERMS = ["수율", "OEE", "Cpk", "PLC", "JMP", "Minitab", "Python", "SQL", "DBMS", "E-FOREST"];

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("ko").replace(/[\s·•\-–—_*()[\]{}<>:：,.;!?/\\'’]+/g, "");
  }
  function tokens(value) {
    return (String(value || "").match(/[가-힣A-Za-z]{2,}/g) || []).map((t) => t.toLocaleLowerCase());
  }
  function unique(values) { return [...new Set(values.filter(Boolean))]; }

  function classify(text) {
    const v = String(text || "");
    // 15회차: 파생제품·AMHS 전용 종류. "파생"·"요소기술"·"AMHS"·"반송"은
    // 특정 직무 문장이라 generic으로 떨어지기 전에 먼저 잡는다.
    // "신제품"은 영업 JD에도 나와서 쓰지 않는다. "AMR"은 단어 경계로만
    // 잡는다 (다른 단어 속 "amr" 오탐 방지).
    if (/파생|요소기술/i.test(v)) return "derived_product";
    if (/AMHS|반송|OHT|Stocker|Conveyor|\bAMR\b|MCS/i.test(v)) return "amhs";
    if (/TEST|분석 프로그램|프로그래밍|프로그램 개발|데이터 분석|데이터.*툴/i.test(v)) return "programming_data";
    if (/장비.*Set-up|Set-up|장비 업체|협력사|고객사/i.test(v)) return "equipment_collab";
    if (/조건.*최적화|안정적.*운영|품질|수율|불량|공정.*안정/i.test(v)) return "process_yield";
    // 관련 분야 우대 항목은 전공·수업에서 배운 내용과 연결되는 문항이다.
    // generic 질문("일을 직접 수행하거나 관찰한 적이 있나요?")은 전공
    // 라벨(기계공학부)에는 맞지 않는다 — 전공은 수행한 일이 아니다
    // (품질 검증 2026-11-05 발견). "관련 전공"도 여기서 잡아
    // 공정·원리 규칙(전공)이 먼저 잡는 것을 막는다.
    // 46회차 (45회차 객관 검토 B8): "관련 공학계열 전공"처럼 "관련"과
    // "전공" 사이에 다른 말이 끼는 경우도 관련 분야 문항이다. 기존
    // 패턴(/관련 전공/)은 "관련 공학계열 전공하신 분"(KAI 우대)을
    // 못 잡아 공정 지식 템플릿으로 떨어졌다.
    if (/관련.*전공|관련.*학과|유관 전공|관련 분야/i.test(v)) return "related_field";
    if (/공정.*흐름|원리|이해|전공|지식/i.test(v)) return "process_knowledge";
    if (/실험.*프로젝트|프로젝트.*학습|학습해본|실험.*학습/i.test(v)) return "project_learning";
    if (/협업|커뮤니케이션|소통|유관 부서/i.test(v)) return "collaboration";
    if (/데이터|분석/i.test(v)) return "programming_data";
    // 41회차: 밸리데이션·적격성 평가는 장비 다루기가 아니라 검증 지원이다.
    // "설비 적격성 평가" 속 "설비" 때문에 equipment_collab으로 떨어지면
    // Set-up·수리 방향이 붙는다 (바이오 밸리데이션 gap 문항). 검증은
    // generic으로 둔다 — 중립 방향이 오도하는 방향보다 낫다.
    if (/밸리데이션|적격성/i.test(v)) return "generic";
    if (/장비|설비/i.test(v)) return "equipment_collab";
    if (/공정/i.test(v)) return "process_knowledge";
    return "generic";
  }

  const TEMPLATES = {
    process_yield: {
      question: "조건이나 순서를 바꿔 결과를 비교하고, 품질·수율과 연결해 확인한 적이 있나요?",
      focus: {
        situation: "어떤 공정·작업에서, 무엇을 같게 두고 무엇을 바꿨나요?",
        action: "측정값·결과를 어떻게 확인했고, 본인 역할은 무엇이었나요?",
        result: "바뀐 조건 전후로 실제 관찰한 차이만 적으세요. 확인하지 못한 수치는 넣지 마세요.",
      },
      direction: "지원서에서는 '조건 최적화 → 품질·수율' 흐름으로 쓰세요. 조건 변경 → 확인 방법 → 관찰한 결과 순서로 쓰세요. 양산 Fab 실무가 아니라면 대학 Fab·실습·분석 경험임을 그대로 밝히세요. 지원서 작성용입니다.",
    },
    equipment_collab: {
      question: "장비를 다루거나 이상·요청을 구체화해 담당자·업체와 조율한 적이 있나요?",
      focus: {
        situation: "어떤 장비·요청이었고, 모호했던 점은 무엇이었나요?",
        action: "증상을 어떻게 확인했고, 누구에게 무엇을 전달했나요?",
        result: "전달·조율 뒤에 실제 확인된 변화만 적으세요.",
      },
      direction: "지원서에서는 'Set-up·개선·업체 협업' 흐름으로 쓰세요. 증상 확인 → 점검·전달 → 후속 조치 순서로 쓰세요. 직접 수리·정비한 적이 없다면 그렇게 쓰지 마세요. 지원서 작성용입니다.",
    },
    process_knowledge: {
      question: "공정 흐름·원리를 배우고 실제 사례에 적용해 이해한 적이 있나요?",
      focus: {
        situation: "어떤 공정·소자·원리를 배웠고, 왜 그 순서·조건이 필요한지 이해했나요?",
        action: "직접 분석·실습·조사한 내용과 본인 역할을 구분해 적으세요.",
        result: "이해한 원리를 다음 판단에 어떻게 썼는지, 실제 확인한 범위까지만 적으세요.",
      },
      direction: "지원서에서는 배운 원리 → 적용한 사례 → 이해의 한계 순서로 쓰세요. 조사·분석은 조사·분석으로, 직접 실험은 직접 실험으로만 쓰세요. 지원서 작성용입니다.",
    },
    programming_data: {
      question: "데이터·프로그램을 활용해 문제를 정리하거나 분석한 적이 있나요?",
      focus: {
        situation: "어떤 데이터를·문제를 다뤘고, 목표는 무엇이었나요?",
        action: "어떤 도구·방법으로 정리·분석했고, 검증은 어떻게 했나요?",
        result: "프로그램·분석으로 실제 확인한 결과만 적으세요. 만든 적 없는 도구는 쓰지 마세요.",
      },
      direction: "지원서에서는 문제 → 도구·방법 → 검증·결과 순서로 쓰세요. 단순 질의응답을 개발 경험으로 포장하지 마세요. 지원서 작성용입니다.",
    },
    // 11회차 추가: "실험이나 프로젝트를 통해 학습해본 경험" 같은 우대 항목용.
    // 직접 연결되는 우대 항목이 문항에 들어오면서 생긴 종류다. generic
    // 질문("이 JD 업무와 연결되는 일을…")은 학습 경험에 안 맞는다.
    project_learning: {
      question: "실험이나 프로젝트를 통해 배운 것이 있나요?",
      focus: {
        situation: "어떤 실험·프로젝트였고, 무엇을 배우려 했나요?",
        action: "직접 수행·분석·조사한 내용과 본인 역할을 구분해 적으세요.",
        result: "배운 것을 다음 판단·실습에 어떻게 썼는지, 실제 확인한 범위까지만 적으세요.",
      },
      direction: "지원서에서는 프로젝트 → 배운 점 → 다음 적용 순서로 쓰세요. 조사·분석은 조사·분석으로, 직접 수행은 직접 수행으로만 쓰세요. 지원서 작성용입니다.",
    },
    collaboration: {
      question: "다른 부서·팀과 조건·일정·결과를 조율한 적이 있나요?",
      focus: {
        situation: "누구와, 무엇을 조율해야 했나요?",
        action: "확인한 내용과 확인이 필요한 내용을 어떻게 나눠 전달했나요?",
        result: "조율 뒤에 실제 정해진 내용만 적으세요.",
      },
      direction: "지원서에서는 조율 대상 → 전달한 사실 → 합의된 내용 순서로 쓰세요. 지원서 작성용입니다.",
    },
    // 15회차 추가: 파생제품·AMHS 전용 템플릿. 12회차까지 알려진 한계 —
    // 두 문항이 generic 질문("이 JD 업무와 연결되는 일을…")으로 똑같이
    // 나왔다. 이제 종류별로 질문·초점·방향이 다르다.
    derived_product: {
      question: "새로운 제품이나 요소기술을 개발하거나, 기존 제품에서 파생된 것을 만든 적이 있나요?",
      focus: {
        situation: "어떤 제품·요소기술이었고, 새로 만든 부분은 무엇이었나요?",
        action: "본인이 직접 설계·개발·검증한 부분은 무엇이었나요?",
        result: "개발한 것이 실제로 동작·적용된 범위까지만 적으세요.",
      },
      direction: "지원서에서는 개발 대상 → 본인 역할 → 확인한 결과 순서로 쓰세요. 개발한 적 없는 제품·기술은 쓰지 마세요. 지원서 작성용입니다.",
    },
    amhs: {
      question: "자동반송·물류 흐름(반송·배치·동선)을 설계하거나 최적화한 적이 있나요?",
      focus: {
        situation: "어떤 반송·동선·배치 문제였고, 흐름이 막히는 지점은 어디였나요?",
        action: "동선·배치를 어떻게 바꾸고, 효과는 어떻게 확인했나요?",
        result: "바꾼 뒤 실제 확인한 변화만 적으세요. 확인하지 못한 수치는 넣지 마세요.",
      },
      direction: "지원서에서는 흐름 문제 → 바꾼 동선·배치 → 확인한 변화 순서로 쓰세요. AMHS 장비를 직접 운영한 적 없다면 그렇게 쓰지 마세요. 지원서 작성용입니다.",
    },
    // 관련 분야 우대 항목용 (품질 검증 2026-11-05 추가): 전공·수업에서
    // 배운 내용을 묻는다. generic 질문은 전공 라벨에 맞지 않는다.
    related_field: {
      question: "전공·수업에서 배운 내용 중 이 채용공고 업무와 연결되는 것이 있나요?",
      focus: {
        situation: "어떤 전공·수업에서, 무엇을 배웠나요?",
        action: "배운 내용 중 이 업무와 연결되는 부분은 무엇인가요?",
        result: "배운 것을 어떻게 이해·적용했는지, 실제 확인한 범위까지만 적으세요.",
      },
      direction: "지원서에서는 전공·수업에서 배운 내용 → 업무 연결 순서로 쓰세요. 직접 수행한 실무 경험이 아니라면 그렇게 쓰지 마세요. 지원서 작성용입니다.",
    },
    generic: {
      question: "이 채용공고 업무와 연결되는 일을 직접 수행하거나 관찰한 적이 있나요?",
      focus: {
        situation: "어떤 상황에서, 맡은 일은 무엇이었나요?",
        action: "본인이 직접 한 행동은 무엇이었나요?",
        result: "실제 확인한 결과만 적으세요.",
      },
      direction: "지원서에서는 채용공고 원문에 나온 업무와 직접 연결되는 행동·결과만 쓰세요. 없는 경험은 [보완 필요]로 남기세요. 지원서 작성용입니다.",
    },
  };

  // 간접 연결의 다리(bridge) 어간: 문항 종류별로, 직접 경험은 아니지만
  // 부분적으로 겹치는 개념이다. 이 다리만으로 직접 연결을 만들지 않는다.
  // 간접은 "이 경험의 이 부분이 부분적으로 연결된다"는 단서付き로만 표시한다.
  const BRIDGES = {
    process_yield: ["dose", "cd", "측정", "패턴", "분석", "최적화", "개선"],
    equipment_collab: ["최적화", "개선", "장비", "동선", "전달"],
    process_knowledge: ["cmos", "fab", "lithography", "nand", "패턴", "원리"],
    project_learning: ["프로젝트", "실험", "학습", "분석", "조사"],
    programming_data: ["rag", "agent", "pipeline", "요약", "분석", "개발"],
    collaboration: ["전달", "조율", "소통"],
    // 15회차 정정: "프로젝트"는 빼야 한다. 원익QNC가 "직무마스터프로젝트"라
    // 는 이유만으로 파생제품 개발과 간접 연결되는 약한 매칭이 생겼기 때문
    // (8번에서 파생제품이 none→indirect으로 잘못 뒤집힘). 프로젝트는
    // 그릇 단어지 개발 활동이 아니다. "개발·설계·제품·검증"만 남긴다.
    derived_product: ["개발", "설계", "제품", "검증"],
    amhs: ["동선", "반송", "배치", "최적화", "설계", "흐름"],
    // 43회차: 관련 분야 다리는 분야 내용어만 남긴다. "과정·교육·학습"은
    // 형식어라 어떤 교육 경험이든 걸린다 — KFP 대학 Fab 실습이
    // "교육·참관", "교육 이수", "참관·학습"으로 다리 2개를 가져가 전공
    // (전자공학부, 다리 0개 + 종류 보너스)보다 1점 앞에 떴다 (SK 8번
    // [5]). 전공·수업·학과는 분야 자체를 가리키는 말이라 남긴다.
    // 전 픽스처 diff로 확인: 관련 분야 간접 연결이 전공이 아닌 경험인
    // 경우는 SK KFP뿐이라, 바뀌는 건 SK 8번 [5]뿐이어야 한다.
    related_field: ["전공", "수업", "학과"],
    generic: [],
  };
  const INDIRECT_NOTES = {
    process_yield: "직접 경험은 아니지만, 이 경험의 '조건을 바꿔 측정으로 확인한' 부분이 이 질문과 부분적으로 연결됩니다. 지원서에서 직접 수율 실적이라고 쓰지 마세요.",
    equipment_collab: "직접 경험은 아니지만, 이 경험의 '지속적인 개선' 부분이 이 질문과 부분적으로 연결됩니다. 장비 Set-up이나 업체 협업 경험은 아닙니다.",
    process_knowledge: "직접 경험은 아니지만, 이 경험에서 배운 원리·흐름의 일부가 이 질문과 부분적으로 연결됩니다.",
    project_learning: "직접 경험은 아니지만, 이 경험의 '프로젝트·실험으로 배운' 부분이 이 질문과 부분적으로 연결됩니다. 직접 실험·프로젝트 수행 경험이 아니면 그렇게 말하지 마세요.",
    programming_data: "직접 경험은 아니지만, 이 경험의 '데이터·프로그램으로 정리·분석한' 부분이 이 질문과 부분적으로 연결됩니다. 프로그램을 개발한 경험은 아닙니다.",
    collaboration: "직접 경험은 아니지만, 이 경험의 조율·전달 부분이 이 질문과 부분적으로 연결됩니다.",
    derived_product: "직접 경험은 아니지만, 이 경험의 '개발·설계한' 부분이 이 질문과 부분적으로 연결됩니다. 파생제품·요소기술을 개발한 경험은 아닙니다.",
    amhs: "직접 경험은 아니지만, 이 경험의 '동선·흐름을 바꾼' 부분이 이 질문과 부분적으로 연결됩니다. AMHS를 설계·운영한 경험은 아닙니다.",
    related_field: "직접 경험은 아니지만, 이 경험에서 배운 전공·수업 내용이 이 질문과 부분적으로 연결됩니다.",
    generic: "직접 경험은 아니지만, 이 경험의 일부가 이 질문과 부분적으로 연결됩니다.",
  };

  // 장비 문항 간접 단서: 연결된 경험이 실제로 '개선'·'최적화'와 겹치면
  // 기존 문구를 쓰고, 아니면 겹친 어간으로 문구를 만든다.
  // 하드코딩된 "'지속적인 개선' 부분"이 장비 교육만 받은 경험(KFP)에
  // 붙는 오류를 막는다 (실제 JD 재검증 10회차 발견).
  // 겹침은 matchedTokens와 bridgeTokens 둘 다 본다: 간접 연결은
  // 다리 어간(bridge)으로 이어질 수도 있기 때문이다.
  function equipmentIndirectNote(connected) {
    const tokens = [...(connected?.matchedTokens || []), ...(connected?.bridgeTokens || [])];
    if (tokens.some((t) => String(t).includes("개선") || String(t).includes("최적"))) return INDIRECT_NOTES.equipment_collab;
    const generic = ["반도체", "공정", "경험", "수행", "분석", "활용"];
    const part = tokens.find((t) => !generic.includes(String(t))) || "장비";
    return `직접 경험은 아니지만, 이 경험의 '${part}' 부분이 이 질문과 부분적으로 연결됩니다. 장비 Set-up이나 업체 협업 경험은 아닙니다.`;
  }

  // 조건 변경 문항 간접 단서: 연결된 경험이 실제로 '조건을 바꾸고
  // 측정·비교로 확인한' 경우에만 기존 문구를 쓰고, 아니면 겹친 어간으로
  // 문구를 만든다. 하드코딩된 "'조건을 바꿔 측정으로 확인한' 부분"이
  // 측정·조건 변경이 없는 경험(E-beam Dose-CD 관계 분석, 캡스톤
  // 동선·배치 최적화)에 붙는 오류를 막는다 (품질 검증 2026-11-05 발견).
  // 장비 단서와 같은 방식. 조건 변경과 측정·비교가 둘 다 있어야
  // 기존 문구를 쓴다 (둘 중 하나만 있으면 그 부분만 있는 것이 아니다).
  // 35회차: 조건 변경 문항(process_yield)의 직접 근거. 질문 자체가
  // "조건이나 순서를 바꿔 결과를 비교"하는 경험을 묻는다. 경험 원문에
  // 조건 변경과 측정·비교가 둘 다 있어야 직접 답할 수 있다. 간접 단서와
  // 직접 판정이 같은 기준을 쓰게, 여기서 한 번만 정의한다.
  function hasConditionChangeEvidence(text) {
    const v = String(text || "");
    return /바꿔|바꾼|바꾸|조정|변경/.test(v) && /측정|비교/.test(v);
  }

  function processYieldIndirectNote(connected) {
    const text = String(connected?.text || "");
    // 조건 변경·측정은 경험 원문 전체에서 본다. 연결 어간
    // (matchedTokens·bridgeTokens)에는 '바꿔'가 안 들어갈 수 있기
    // 때문이다 (방산 CNC: 어간은 가공·공정·조건·측정인데 원문에는
    // '조건을 바꿔'가 있다 — 어간만 보면 기존 문구를 못 쓴다).
    if (hasConditionChangeEvidence(text)) return INDIRECT_NOTES.process_yield;
    const tokens = [...(connected?.matchedTokens || []), ...(connected?.bridgeTokens || [])];
    const generic = ["반도체", "공정", "경험", "수행", "분석", "활용"];
    const korean = tokens.filter((t) => /[가-힣]/.test(String(t)) && !generic.includes(String(t)));
    const part = korean[0] || tokens.find((t) => !generic.includes(String(t))) || "조건";
    return `직접 경험은 아니지만, 이 경험의 '${part}' 부분이 이 질문과 부분적으로 연결됩니다. 조건을 바꿔 측정으로 확인한 경험은 아닙니다. 지원서에서 직접 수율 실적이라고 쓰지 마세요.`;
  }

  // 29회차: programming_data 간접 단서의 "TEST 분석 프로그램"은 SK JD
  // 우대 항목("TEST/분석 프로그램 개발")에서 온 말이다. TEST가 없는
  // JD(화학·바이오·전기·전자 등)에서는 무슨 말인지 알 수 없는 누수라,
  // JD에 TEST가 있을 때만 TEST 문구를 쓰고 없으면 일반 문구로 바꾼다
  // (Fab 방향 문구의 조건부 처리와 같은 방식).
  // 품질 검증 2026-11-05 추가: "데이터·프로그램으로 정리·분석한"도
  // 경험 원문에 프로그램·개발이 있을 때만 쓴다. 데이터 정리만 한
  // 경험(현장실습 가동률 데이터 정리)에는 '데이터를 정리한'으로 쓴다.
  // 프로그램 작업의 근거는 원문(프로그램·개발) 또는 연결 어간(RAG·
  // Agent·Pipeline 같은 프로그램 작업) 둘 다 본다. AI Research Agent의
  // RAG 파이프라인은 프로그램 작업과 부분 겹치기 때문이다.
  // 41회차: 마지막 단서(연결 어간이 프로그램·데이터와 무관한 경우 —
  // 예: 한화 공정설계 문항의 '설계')의 "프로그램을 개발한 경험은
  // 아닙니다"는 문항 자체가 프로그래밍·데이터·TEST를 언급할 때만
  // 붙인다. "Capa. 분석"처럼 분석만 있는 문항은 프로그래밍 문항이
  // 아니므로, 문항 텍스트에 프로그래밍 흔적이 없으면 첫 문장만
  // 남긴다. questionText가 없으면 기존 동작을 유지한다.
  function programmingIndirectNote(connected, sourceText, questionText) {
    const text = String(connected?.text || "");
    const tokens = [...(connected?.matchedTokens || []), ...(connected?.bridgeTokens || [])];
    if (/프로그램|개발/.test(text) || tokens.some((t) => /프로그램|개발|rag|agent|pipeline/.test(String(t)))) {
      if (/\bTEST\b/i.test(String(sourceText || ""))) {
        return "직접 경험은 아니지만, 이 경험의 '데이터·프로그램으로 정리·분석한' 부분이 이 질문과 부분적으로 연결됩니다. TEST 분석 프로그램을 개발한 경험은 아닙니다.";
      }
      return INDIRECT_NOTES.programming_data;
    }
    if (tokens.some((t) => String(t).includes("데이터"))) {
      return "직접 경험은 아니지만, 이 경험의 '데이터를 정리한' 부분이 이 질문과 부분적으로 연결됩니다. 프로그램을 개발한 경험은 아닙니다.";
    }
    const generic = ["반도체", "공정", "경험", "수행", "분석", "활용"];
    const korean = tokens.filter((t) => /[가-힣]/.test(String(t)) && !generic.includes(String(t)));
    const part = korean[0] || tokens.find((t) => !generic.includes(String(t))) || "데이터";
    if (questionText && !/TEST|프로그램|프로그래밍|데이터/i.test(String(questionText))) {
      return `직접 경험은 아니지만, 이 경험의 '${part}' 부분이 이 질문과 부분적으로 연결됩니다.`;
    }
    return `직접 경험은 아니지만, 이 경험의 '${part}' 부분이 이 질문과 부분적으로 연결됩니다. 프로그램을 개발한 경험은 아닙니다.`;
  }

  // 31회차: 질문 의도(intent) 토큰 — 종류별 템플릿 질문·초점에서 온
  // 행동 동사다. 토큰 점수만으로는 역량 문장 어간(관리·기준·이물)이
  // 많은 경험(HACCP·GMP)이 이겨서, 조건을 바꿔 측정한 실습이 밀렸다
  // (식품·제약 JDQ-01). 의도 토큰 2개 이상이 연결된 경험 원문에
  // 있으면 "질문 의도에 답하는 경험"으로 본다. 이 순위는 같은 질문
  // 문구를 만드는 후보끼리의 중복 제거에만 쓴다
  // (findLinkedExperience 자체는 안 건드린다). "분석"·"수행" 같은
  // 일반어는 tokenMatches가 안 잡으니 의도 토큰에서 뺐다.
  const INTENT_TOKENS = {
    process_yield: ["바꿔", "비교", "확인", "측정"],
    equipment_collab: ["조율", "확인", "전달"],
    process_knowledge: ["적용", "이해"],
    project_learning: ["배운", "조사"],
    programming_data: ["정리", "검증"],
    collaboration: ["조율", "전달"],
    derived_product: ["개발", "설계", "검증"],
    amhs: ["설계", "최적화"],
    related_field: ["배운", "이해"],
    generic: [],
  };
  function intentScore(kind, connected) {
    if (!connected) return 0;
    const entryTokens = stemmedTokens(String(connected.text || ""));
    const intents = (INTENT_TOKENS[kind] || []).map(stem);
    return intents.filter((t) => entryTokens.some((et) => tokenMatches(t, et))).length;
  }

  // gap 카드에 표시할 다음 행동 후보 (13회차 일반화).
  // 이전에는 B1500·LabVIEW·원익QNC 심화·학생회·H-Jump 같은 특정 사용자
  // (Seo)의 계획·경험이 상수에 하드코딩돼 있었다. 빈 프로필인 다른
  // 사용자가 gap 문항을 봐도 Seo의 프로젝트가 떴다. 이제는 프로필의
  // "계획 중인 프로젝트"(plans)에서 고른다. 계획이 없으면 계획이
  // 없다는 사실을 밝힌다. 계획 중인 프로젝트를 완료한 경험처럼
  // 쓰지 않는다 — "(계획 중 — 아직 실적이 아닙니다)" 표시 필수.
  // plans는 { label, covers } 배열이다 (profile-store-v2 toPlanEntries).
  const KIND_PLAN_KEYWORDS = {
    process_yield: ["측정", "수율", "품질", "CTQ", "분포", "변동", "이상치", "고장", "축소", "조건"],
    equipment_collab: ["개선", "최적화", "동선", "장비", "Set-up", "셋업", "협업", "업체"],
    process_knowledge: ["공정", "측정", "데이터", "비교", "조건", "원리", "흐름", "CTQ", "분포", "변동", "이상치", "고장"],
    project_learning: ["실험", "프로젝트", "수행", "기록", "측정", "학습", "실습"],
    programming_data: ["프로그램", "자동", "측정", "통신", "시퀀스", "로깅", "반복성", "개발"],
    collaboration: ["조율", "팀", "소통", "협업", "전달"],
    // 15회차 정정: BRIDGES와 같은 이유 — "프로젝트"는 그릇 단어라
    // 파생제품 gap의 다음 행동 후보로 엉뚱한 계획을 끌어온다.
    derived_product: ["개발", "설계", "제품", "검증", "실험"],
    amhs: ["동선", "반송", "배치", "최적화", "설계", "흐름", "장비"],
    related_field: [],
    generic: [],
  };
  const NO_PLAN_NEXT_ACTION = "다음 행동 후보 · 아직 이 문항을 채울 계획 중인 프로젝트가 없습니다. 관련 활동을 실제 수행한 뒤 다시 확인하세요.";
  function nextActionFor(kind, plans) {
    const keywords = KIND_PLAN_KEYWORDS[kind] || [];
    const list = Array.isArray(plans) ? plans : [];
    let best = null;
    for (const plan of list) {
      const hay = stemmedTokens(`${plan.label || ""} ${plan.covers || ""}`);
      const hits = keywords.filter((kw) => hay.some((t) => tokenMatches(stem(kw), t)));
      if (!hits.length) continue;
      if (!best || hits.length > best.hits.length) best = { plan, hits };
    }
    if (!best) return NO_PLAN_NEXT_ACTION;
    const covers = String(best.plan.covers || "").trim();
    const shown = covers.length > 140 ? covers.slice(0, 140) + "…" : covers;
    const body = shown
      ? `${best.plan.label}: ${shown}`
      : `${best.plan.label}을(를) 직접 수행·기록한 뒤 다시 확인하세요.`;
    return `다음 행동 후보 · ${body} (계획 중 — 아직 실적이 아닙니다)`;
  }

  // 38회차: JDQ 카드에 보여줄 "같은 역량의 다른 경험" (최대 2개).
  // 34·35회차 뼈대 관련 경험과 같은 신호를 쓴다 — 요구사항 어간 겹침이
  // 먼저, 문항 종류의 다리 어간이 그 다음이다. 둘 다 없으면 빈 배열이다.
  // 직접·간접 판정을 바꾸지 않는다 — 카드의 제안일 뿐이다. 연결된
  // 경험은 제외하고, "경험" 항목만 본다 (학력·전공은 다른 경험이 아니다).
  const RELATED_GENERIC_STEMS = ["반도체", "공정", "경험", "수행", "분석", "활용", "작성", "주세요", "관련", "지원", "직무", "문항", "내용", "자기소개서", "있는", "분", "목표", "행동", "결과", "역할", "기술", "도구"];
  function findRelatedExperiences(candidateText, kind, profileEntries, excludeId) {
    const reqTokens = new Set(stemmedTokens(candidateText));
    return (Array.isArray(profileEntries) ? profileEntries : [])
      .filter((entry) => String(entry.kind || "") === "경험" && entry.id !== excludeId)
      .map((entry) => {
        const expTokens = new Set(stemmedTokens(entry.text));
        const shared = [...expTokens].filter((t) => [...reqTokens].some((c) => tokenMatches(c, t)) && !RELATED_GENERIC_STEMS.includes(t));
        const bridge = bridgeStems(kind, entry.text);
        return { entry, shared: shared.length, bridge: bridge.length };
      })
      .filter((item) => item.shared > 0 || item.bridge > 0)
      .sort((a, b) => b.shared - a.shared || b.bridge - a.bridge)
      .slice(0, 2)
      .map(({ entry }) => ({ id: entry.id, kind: entry.kind, label: entry.label, excerpt: excerptText(entry.text), verifiedNumbers: String(entry.verifiedNumbers || "") }));
  }

  // 38회차: JDQ 카드에 보여줄 "관련 계획" (최대 2개). gap 문항에는
  // 붙이지 않는다 — gap은 nextAction이 이미 최상의 계획을 보여준다.
  // KIND_PLAN_KEYWORDS 중 일반적인 어간(측정·데이터·비교·조건·기록·
  // 수행)은 제외하고, 종류별 특징 어간이 1개라도 겹치는 계획을 보여준다.
  // 계획은 직접 근거가 아니라는 표시를 카드에서 붙인다.
  const PLAN_RELATED_KEYWORDS = {
    process_yield: ["수율", "품질", "CTQ", "분포", "변동", "이상치", "고장", "축소", "조건"],
    equipment_collab: ["개선", "최적화", "동선", "장비", "Set-up", "셋업", "협업", "업체"],
    process_knowledge: ["공정", "원리", "흐름", "CTQ", "분포", "변동", "이상치", "고장"],
    project_learning: ["실험", "프로젝트", "실습", "학습"],
    programming_data: ["프로그램", "자동", "통신", "시퀀스", "로깅", "반복성", "개발"],
    collaboration: ["조율", "팀", "소통", "협업", "전달"],
    derived_product: ["개발", "설계", "제품", "검증", "실험"],
    amhs: ["동선", "반송", "배치", "최적화", "설계", "흐름", "장비"],
    related_field: [],
    generic: [],
  };
  function findRelatedPlans(kind, plans) {
    const keywords = PLAN_RELATED_KEYWORDS[kind] || [];
    const list = Array.isArray(plans) ? plans : [];
    return list
      .map((plan) => {
        const hay = stemmedTokens(`${plan.label || ""} ${plan.covers || ""}`);
        const hits = keywords.filter((kw) => hay.some((t) => tokenMatches(stem(kw), t)));
        return { plan, hits: hits.length };
      })
      .filter((item) => item.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 2)
      .map(({ plan }) => ({ id: plan.id, label: plan.label, covers: plan.covers, period: plan.period }));
  }

  // 직접 연결된 공정 지식 문항에 붙는 경계 문구 (S3, 13회차 일반화).
  // 이전에는 KFP 전용 문구("대학 Fab에서 Cleanroom 환경에서 CMOS 공정
  // 흐름을…")가 라벨에 "KFP"가 있을 때만 붙었다. 이제는 연결된 경험이
  // 교육·실습 성격이면 경험 라벨을 넣어 같은 경계를 만든다. 어떤
  // 사용자의 교육·실습 경험에도 같은 규칙이 적용된다.
  const GENERIC_KNOWLEDGE_BOUNDARY = "안전하게 말할 수 있는 범위: 직접 수행·실습한 범위까지만 말하고, 조사한 내용은 조사했다고 구분하세요.";
  function trainingBoundary(linked) {
    const text = String(linked?.text || "");
    if (!/교육|실습/.test(text)) return GENERIC_KNOWLEDGE_BOUNDARY;
    return `안전하게 말할 수 있는 범위: '${linked.label}'에서 교육·실습으로 익힌 범위까지만 말하세요. 실무 운영, 실적, 장비 관리 실무라고 말하면 안 됩니다.`;
  }

  function stem(token) {
    let s = String(token || "").toLocaleLowerCase();
    // 한국어 조사·어미를 떼어낸다: "흐름과"→"흐름", "원리를"→"원리", "조건을"→"조건"
    // 2글자 미만으로 줄어들지 않게 반복 제거한다.
    const suffixes = ["에서", "으로", "하고", "하는", "있는", "과", "와", "을", "를", "의", "에", "로", "은", "는", "이", "가", "도", "만", "한", "인"];
    let changed = true;
    while (changed && s.length > 2) {
      changed = false;
      for (const suf of suffixes) {
        if (s.endsWith(suf) && s.length - suf.length >= 2) { s = s.slice(0, -suf.length); changed = true; break; }
      }
    }
    // 42회차: 학과·학부 이름 끝의 "부"도 뗀다. "화학공학부"는 "화학공학" +
    // 학과 표기인데, "부"를 안 떼면 "화학공학" 요구사항과 안 겹쳐 전공이
    // 매처에 안 보인다 ("약학과"→"약학"은 "과"를 떼서 이미 되던 것과
    // 같은 원리).
    // 46회차 (45회차 객관 검토 B4): "부"는 학력·전공 토큰("학부")에만
    // 뗀다. "개발부"(부서명)에서 "부"를 떼면 "개발"이 돼, "개발부
    // 프로젝트 인턴"(회의록만 쓴 인턴)이 "개발 프로젝트를 수행합니다"에
    // 직접 연결되는 오탐이 난다. "학부"가 아닌 끝의 "부"는 그대로 둔다.
    if (s.endsWith("학부") && s.length >= 3) s = s.slice(0, -1);
    return s;
  }
  function stemmedTokens(value) {
    return unique(tokens(value).map(stem).filter((t) => t.length >= 2));
  }
  // 어간 포함 판정: "photolithography" ⊃ "lithography" 같은 경우를 같은
  // 개념으로 본다. 단, 남은 부분이 2글자 이하면 다른 단어일 수 있다
  // ("resolution" ⊃ "solution"은 우연한 포함이다 — AMHS 문항이
  // E-beam과 연결되는 오탐을 냈다. 실제 JD 재검증 10회차 발견).
  // 26회차: 한글 합성어도 같은 규칙으로 본다. "화학공정"은 "화학"+"공정"이다.
  // JD는 "화학 공정"으로 띄어 쓰고 프로필(전공 과목·실습)은 "화학공정"으로
  // 붙여 쓰는 일이 잦다 — 화학·기계·전기 등 비반도체 산업군에서 특히.
  // 짧은 어간(2글자)이 긴 단어에 들어있고 남은 부분이 2글자 이상(온전한
  // 형태소 1개 이상)이면 같은 개념으로 본다. 남은 부분이 1글자면 접미사
  // 파생("개발자"·"분석법"·"최적화" 속 "최적")일 수 있어 제외한다.
  // 영어는 기존 규칙을 그대로 쓴다 ("resolution" ⊃ "solution" 오탐 방지).
  // "불공정" 속 "공정"은 남은 부분이 1글자라 안 잡힌다.
  // 단, 일반어(분석·공정·경험 등)는 합성어 속에서도 일반어다. "분석화학"이
  // "분석"과 겹친다고 구체적인 연결로 세면 안 된다 — 일반어만 겹친
  // 연결이 직접으로 부풀려진다 (26회차 화학 감사에서 분석화학 실험이
  // 품질 관리·데이터 분석 문항에 직접 연결되던 오탐). 일반어는 정확히
  // 같은 단어일 때만 겹친 것으로 본다.
  const GENERIC_COMPONENT_WORDS = new Set(["반도체", "공정", "경험", "수행", "분석", "활용", "작성", "주세요", "관련", "지원", "직무", "문항", "내용", "자기소개서", "있는", "분", "목표", "행동", "결과", "역할", "기술", "도구"]);
  function tokenMatches(c, t) {
    if (c === t) return true;
    if (GENERIC_COMPONENT_WORDS.has(c) || GENERIC_COMPONENT_WORDS.has(t)) return false;
    for (const [longer, shorter] of [[c, t], [t, c]]) {
      if (shorter.length >= 4 && longer.length - shorter.length >= 3 && longer.includes(shorter)) return true;
      if (
        shorter.length >= 2 &&
        longer.length - shorter.length >= 2 &&
        /^[가-힣]+$/.test(longer) &&
        /^[가-힣]+$/.test(shorter) &&
        longer.includes(shorter)
      ) return true;
    }
    return false;
  }
  // 28회차: 핵심 활동 직접 연결 (project_learning 전용 폴백).
  // "바이오 관련 실험이나 프로젝트 학습 경험" 같은 우대 항목은 묻는 게
  // "실험·프로젝트를 통한 학습"인데, 도메인 수식어("바이오")가 프로필
  // 원문("미생물 실험")과 어휘가 안 겹치면 토큰 규칙은 공유 어간
  // "실험" 1개뿐이라 직접을 못 만든다. 임계값 완화는 27회차 실험에서
  // 전면 부풀림("데이터를 정리함"이 데이터 분석 문항에 직접)이 확인돼
  // 안 된다. 대신 후보 종류가 project_learning일 때만, 경험 항목의
  // 이름(라벨) 자체가 그 핵심 활동("실험"/"프로젝트")을 가리키면
  // 직접으로 본다. 라벨은 사용자가 붙인 경험의 이름이라 "실험실"
  // (장소)처럼 스치는 언급이 아니라 그 경험이 실험·프로젝트 자체임을
  // 뜻한다 ("실험"과 "실험실"은 tokenMatches가 안 잡는다 — 남은 부분
  // 1글자라서). 토큰 규칙이 이미 직접을 찾았으면 이 규칙은 안 쓴다
  // (폴백 전용) — SK·화학·현대차 픽스처는 토큰 규칙이 이미 직접을
  // 만들어서 안 바뀐다. 종류는 "경험" 항목으로만 한정한다 (학력·전공
  // 과목이나 기술·자격은 실험·프로젝트 "경험"이 아니다).
  const CORE_ACTIVITY_TOKENS = ["실험", "프로젝트"];
  // 38회차: "실습"도 핵심 활동이다. 라벨·원문에 "실습"이 있고 경험
  // 원문에 실험 근거(실험·측정·분석·시험·형성·제작·구현 중 하나라도
  // 동사형으로)가 있으면 실험·프로젝트 자체로 본다. E-beam 실습은
  // 23nm 패턴 형성·Dose-CD-Resolution 관계 분석을 직접 한 실험이다.
  // "데이터 정리"만 한 현장실습은 실험 근거가 없어 안 걸린다 (27회차
  // 부풀림 재발 방지). "실습실"은 장소라 제외한다. 점수는 라벨 일치(5)
  // 보다 높게 둔다 — 질문 첫 단어가 "실험"이라 실제 실험이 가장 가까운
  // 답이다. "가공"은 생산 활동이라 실험 근거에서 뺀다 (CNC 가공 실습이
  // 실험 문항에 직접으로 뜨지 않게 한다).
  const EXPERIMENT_EVIDENCE_ENDING = "(을|를|하|했|함|합|해|한|할|하고|하여|하며|되며|된|되는|했습니다|합니다|했음|했고|[.,;·]| ·|$)";
  const EXPERIMENT_ACTIVITY_STEMS = ["실험", "측정", "분석", "시험", "형성", "제작", "구현"];
  function hasExperimentActivityEvidence(text) {
    const t = String(text || "").toLocaleLowerCase("ko");
    return EXPERIMENT_ACTIVITY_STEMS.some((s) => new RegExp(s + EXPERIMENT_EVIDENCE_ENDING).test(t));
  }
  // 발췌는 120자에서 자르되 " · " 구간 경계에서 자른다 (jd-local-fallback.js
  // excerpt와 같은 규칙). 하드 컷은 "대학 Fab 교육 이"처럼 단어를
  // 중간에서 끊는다 (품질 검증 2026-11-05 발견). 경계가 없으면 공백에서
  // 자르고, 그것도 없으면 120자에서 자른다. "…"는 붙이지 않는다 —
  // 발췌는 프로필 원문의 일부여야 한다는 검증이 있기 때문이다.
  function excerptText(text) {
    const value = String(text || "");
    if (value.length <= 120) return value;
    const cut = value.slice(0, 120);
    const boundary = cut.lastIndexOf(" · ");
    if (boundary > 0) return cut.slice(0, boundary);
    const space = cut.lastIndexOf(" ");
    if (space > 0) return cut.slice(0, space);
    return cut;
  }
  function findCoreActivityExperience(candidateText, profileEntries) {
    if (classify(candidateText) !== "project_learning") return null;
    const candTokens = stemmedTokens(candidateText);
    const core = CORE_ACTIVITY_TOKENS.filter((t) => candTokens.some((c) => tokenMatches(c, t)));
    if (!core.length) return null;
    let best = null;
    for (const entry of Array.isArray(profileEntries) ? profileEntries : []) {
      if (String(entry.kind || "") !== "경험") continue;
      const labelTokens = stemmedTokens(entry.label || "");
      const matched = core.filter((t) => labelTokens.some((lt) => tokenMatches(t, lt)));
      if (!matched.length) continue;
      // 토큰 규칙의 최저 직접 점수(4)보다 높게, 강한 토큰 겹침(6 이상)
      // 보다는 낮게 둔다. 폴백이라 순위를 가릴 일은 거의 없다.
      if (!best || matched.length > best.matched.length) best = { score: 5, entry, matched };
    }
    // 38회차: "실습" + 실험 근거도 핵심 활동이다 (E-beam 실습). 라벨
    // 일치와 따로 보고, 점수 6으로 라벨 일치(5)보다 높게 둔다.
    // 종류는 "경험" 항목으로만 한정한다.
    let bestPractice = null;
    for (const entry of Array.isArray(profileEntries) ? profileEntries : []) {
      if (String(entry.kind || "") !== "경험") continue;
      const nameText = `${entry.label || ""} ${entry.text || ""}`;
      if (!/실습(?!실)/.test(nameText)) continue;
      if (!hasExperimentActivityEvidence(entry.text)) continue;
      if (!bestPractice) bestPractice = { score: 6, entry, matched: ["실습"] };
    }
    if (bestPractice && (!best || bestPractice.score > best.score)) best = bestPractice;
    if (!best) return null;
    const excerpt = excerptText(best.entry.text);
    return { id: best.entry.id, kind: best.entry.kind, label: best.entry.label, text: String(best.entry.text || ""), excerpt, score: best.score, matchedTokens: best.matched, verifiedNumbers: String(best.entry.verifiedNumbers || "") };
  }

  // 38회차: 공정 지식 문항의 적용 경험 찾기. 수행 동사(37회차
  // hasPerformActionEvidence)가 있고, 문항 종류의 다리 어간이나 후보
  // 문장과 겹치는 구체 어간이 있는 "경험" 항목을 고른다. 순위는
  // 조건 변경·측정 근거(37회차 hasConditionChangeEvidence — 조건을
  // 바꿔 측정했다는 가장 강한 적용 신호) → 다리 겹침 수 → 구체 어간
  // 겹침 수 순이다. 반도체 단계 어휘(패턴·리소그래피 등)로만 가리면
  // 바이오·화학·식품의 실제 적용(세포배양·화학공정·식품 제조 실습)을
  // 못 알아봐서, 다리·공유 어간으로만 본다.
  function findProcessApplicationExperience(candidateText, profileEntries, excludeId) {
    if (classify(candidateText) !== "process_knowledge") return null;
    const candTokens = new Set(stemmedTokens(candidateText));
    const bridges = BRIDGES.process_knowledge || [];
    let best = null;
    for (const entry of Array.isArray(profileEntries) ? profileEntries : []) {
      if (String(entry.kind || "") !== "경험") continue;
      if (excludeId && entry.id === excludeId) continue;
      if (!hasPerformActionEvidence(entry.text, entry)) continue;
      const entryTokens = stemmedTokens(entry.text);
      const bridge = unique(entryTokens.filter((t) => bridges.some((b) => tokenMatches(b, t))));
      const shared = unique(entryTokens.filter((t) => [...candTokens].some((c) => tokenMatches(c, t)))).filter((t) => !["반도체", "공정", "경험", "수행", "분석", "활용", "관련"].includes(t));
      if (!hasConditionChangeEvidence(entry.text) && !bridge.length && !shared.length) continue;
      const rank = (hasConditionChangeEvidence(entry.text) ? 4 : 0) + bridge.length * 2 + shared.length;
      if (!best || rank > best.rank) best = { rank, entry };
    }
    if (!best) return null;
    const excerpt = excerptText(best.entry.text);
    return { id: best.entry.id, kind: best.entry.kind, label: best.entry.label, text: String(best.entry.text || ""), excerpt, score: 6, matchedTokens: [], verifiedNumbers: String(best.entry.verifiedNumbers || "") };
  }

  function relevantEntries(candidateText, profileEntries) {
    const kind = classify(candidateText);
    const entries = Array.isArray(profileEntries) ? profileEntries : [];
    const technical = /반도체|CMOS|MOSFET|웨이퍼|소자|리소|노광|식각|증착|산화|CMP|공정\s*(조건|흐름|원리)|photolithography|diffusion|thin film/i;
    const academic = /공학(?:부|과|전공)|물리학|화학과|재료공학|관련 과목|이수학점/;
    return entries.filter((entry) => {
      const text = String(entry.text || "");
      if (kind === "related_field") return /학력|전공/.test(String(entry.kind || "")) || academic.test(text);
      if (kind === "process_knowledge" && /반도체|공정/.test(candidateText)) return technical.test(text);
      if (kind === "project_learning" && /반도체/.test(candidateText)) return technical.test(text);
      if (kind === "derived_product") return /파생|요소기술|웨이퍼|소자|소재|시제품|부품|재료|회로|제품.*(제작|개발|설계)/.test(text);
      if (kind === "programming_data") return /프로그래밍|프로그램|python|labview|javascript|SQL|코딩|소스\s*코드|코드.*(작성|실행|구현)|데이터.*분석|분석.*데이터/i.test(text);
      return true;
    });
  }

  function findLinkedExperience(candidateText, profileEntries) {
    profileEntries = relevantEntries(candidateText, profileEntries);
    const candTokens = new Set(stemmedTokens(candidateText));
    if (!candTokens.size || !Array.isArray(profileEntries)) return null;
    // 38회차: 실험·프로젝트 문항은 "실험이나 프로젝트를 통해 배운 것"을
    // 묻는다. 학력(전공·과목 나열)은 실험이 아니라서 직접 근거가 될 수
    // 없다 — 토큰 규칙이 학력을 잡는 경우(화학공학부·식품공학과)를
    // 막기 위해, 이 종류에서는 학력 항목을 빼고 본다. AI 활용 경험은
    // 프로젝트 그 자체라 대상에 남긴다.
    const isProjectLearning = classify(candidateText) === "project_learning";
    let best = null;
    let bestPerformed = null;
    for (const entry of profileEntries) {
      if (isProjectLearning && String(entry.kind || "").startsWith("학력")) continue;
      const text = String(entry.text || "");
      const entryTokens = stemmedTokens(text);
      // 어간이 서로 포함되면 같은 개념으로 본다: "photolithography" ⊃ "lithography"
      const shared = unique(entryTokens.filter((t) => [...candTokens].some((c) => tokenMatches(c, t))));
      // '반도체', '공정' 같은 일반어는 1개만으로는 연결하지 않는다.
      const specific = shared.filter((t) => !["반도체", "공정", "경험", "수행", "분석", "활용", "관련"].includes(t));
      const score = specific.length * 2 + Math.min(shared.length, 3);
      // 최소 2개의 어간이 겹치고 그중 1개 이상이 구체적 어간이어야 연결한다.
      // '공정' 1개만 겹치는 경우(품질·수율 문항)는 gap으로 둔다.
      if (specific.length < 1 || shared.length < 2 || score < 4) continue;
      if (!best || score > best.score) best = { score, entry, shared };
      // 42회차: 수행 근거가 있는 후보 중 최고 점수도 따로 둔다.
      if (hasPerformActionEvidence(text, entry)) {
        if (!bestPerformed || score > bestPerformed.score) bestPerformed = { score, entry, shared };
      }
    }
    if (!best) {
      // 28회차 폴백: 토큰 규칙으로 직접이 안 나올 때만, 핵심 활동
      // (실험·프로젝트) 라벨 규칙을 본다. 토큰 규칙이 찾았으면
      // 그쪽을 그대로 쓴다.
      const core = findCoreActivityExperience(candidateText, profileEntries);
      if (core) return core;
      return null;
    }
    // 42회차: 수행·판단을 묻는 문항·요구사항에서는 조사·정리만 한
    // 학습 전용 경험이 어간 수만으로 실무 경험을 앞서는 걸 막는다.
    // 최고 점수 경험에 수행 동사 근거가 없고, 수행 근거가 있는 다른
    // 경험이 직접 임계값을 넘으면 그 경험을 쓴다 — 방산 생산 운영
    // 문항의 동아리(정리·발표만, 9점)보다 조건을 바꿔 측정한 CNC
    // 가공 실습(7점)이, 현대차 데이터/SW 코딩 문항의 현장실습
    // (데이터 정리만, 6점)보다 자동화 설비 프로젝트인 캡스톤(6점)이
    // 정직한 직접 연결이다. 이해·학습을 묻는 문항에는 적용하지 않는다
    // (requiresPerformanceAction이 이해·학습·지식을 걸러낸다).
    // 여유(margin)를 두지 않는다 — 수행 요구사항에서는 직접 임계값을
    // 넘은 수행 경험이 어간이 적어도 조사만 한 경험보다 정직하다.
    if (!hasPerformActionEvidence(best.entry.text, best.entry) && requiresPerformanceAction(candidateText) && bestPerformed) best = bestPerformed;
    // 38회차: 실험·프로젝트 문항은 경험의 "종류"를 묻는 문항이라,
    // 핵심 활동 규칙(실험·프로젝트 그 자체인지)이 동점에서는 토큰
    // 규칙을 이긴다. 토큰 규칙은 "프로젝트"라는 단어가 라벨에 두 번
    // 들어간 경험(직무마스터프로젝트 + 프로젝트 초기 단계)을 실제
    // 실험보다 높게 세는 경우가 있다. 토큰 점수가 분명히 높으면
    // 토큰 쪽을 쓴다.
    const core = findCoreActivityExperience(candidateText, profileEntries);
    if (core && core.score >= best.score) return core;
    const excerpt = excerptText(best.entry.text);
    return { id: best.entry.id, kind: best.entry.kind, label: best.entry.label, text: String(best.entry.text || ""), excerpt, score: best.score, matchedTokens: best.shared, verifiedNumbers: String(best.entry.verifiedNumbers || "") };
  }

  // Apps Script jdHasDirectActionEvidence_와 같은 규칙으로 직접 판정을 조인다.
  // - 주요 업무(duty)가 아니면 true (Apps Script도 kind !== '주요 업무'면 true).
  // - 요구 문장에 구체 행동(구현·최적화·Set-up·개조·설계·구축)이 있으면
  //   프로필 원문에 그중 하나라도 있어야 직접이다. 없으면 간접으로 강등한다.
  //   예: "측정 장비 담당"만으로는 "장비 Set-up 및 개조"의 직접 근거가 안 된다.
  // - 구체 행동이 없으면 일반 행동(운영·개발·검증·평가·분석·개선·관리·교육·협업·제개정)
  //   중 요구 문장에 있는 것이 프로필에 하나라도 있으면 직접이다.
  // 46회차 (R32 판정 복원, 45회차 객관 검토 B1): "최적화" 직접 근거는
  // (a) 프로필에 "최적화" 단어가 있거나, (b) 조건 변경 + 측정·비교 +
  // 최적 조건 선택 또는 개선 결과가 있을 때만 인정한다. "조건을 바꿔
  // 측정"만으로는 최적 조건을 고르거나 개선한 결과가 없어서 직접이
  // 아니다 — 32회차 실험에서 그 규칙은 식품·제약·화학의 직접을
  // 체계적으로 부풀렸다 (조건 변경·측정은 실습에서 흔한 절차라).
  // 부정은 결과가 아니다 ("찾지 못했다", "못 찾았다", "개선되지
  // 않았다"가 있는 절은 제외한다). 반례: '담당자를 변경하고 결과를
  // 측정했다', '일정을 변경하고 측정했다' → 결과 없음 → 간접.
  function hasOptimizationResultEvidence(profileText) {
    if (!hasConditionChangeEvidence(profileText)) return false;
    const clauses = String(profileText || "").toLocaleLowerCase("ko").split(/[.,;·\n]/).map((c) => c.trim()).filter((c) => c && !/못|않|없|아니/.test(c));
    return clauses.some((c) => {
      // (1) 최적 조건 선택: "최적 조건을 찾았다/선택했다/정했다" 등.
      if ((/최적\s*(조건|안|값|점|레시피|조합|설정)|가장\s*좋은\s*조건/.test(c)) && /찾|선택|정하|결정|도출|확정|적용/.test(c)) return true;
      // (2) 개선 결과: "개선했다" 또는 "개선" + 수치·향상·단축·감소·절감.
      if (/개선(했|함|했음|했습니다|했고|됐|되었|되어|됨)/.test(c)) return true;
      if (/개선/.test(c) && /[0-9]|→|향상|단축|감소|절감|줄었|높아|낮아/.test(c)) return true;
      return false;
    });
  }

  function hasDirectActionEvidence(requirementText, profileText, source) {
    if (String(source || "") !== "duty") return true;
    const req = String(requirementText || "").toLocaleLowerCase("ko");
    const prof = String(profileText || "").toLocaleLowerCase("ko");
    const specific = [/구현/, /최적화/, /set[- ]?up|setup|셋업/, /개조/, /설계/, /구축/];
    const requiredSpecific = specific.filter((re) => re.test(req));
    if (requiredSpecific.length) {
      if (requiredSpecific.some((re) => re.test(prof))) return true;
      // 46회차 (R32 판정 복원): "최적화"는 단어가 있거나, 조건 변경 +
      // 측정·비교 + 최적 조건 선택 또는 개선 결과가 있을 때만 직접이다.
      // 39회차가 넣은 "조건 변경 + 측정·비교만으로 직접" 예외는
      // 32회차가 검토하고 잠가둔 판정을 언급 없이 뒤집은 것이라
      // 되돌린다. 이 예외는 "최적화"에만 해당한다 — Set-up·개조·
      // 설계·구축은 조건 변경 근거로 충족되지 않는다.
      if (/최적화/.test(req) && hasOptimizationResultEvidence(profileText)) return true;
      return false;
    }
    const general = [/운영/, /개발/, /검증/, /평가/, /분석/, /개선/, /관리/, /교육/, /협업/, /제[·\s-]?개정/];
    const requiredGeneral = general.filter((re) => re.test(req));
    if (!requiredGeneral.length) return true;
    return requiredGeneral.some((re) => re.test(prof));
  }

  // 간접 연결: 직접 판정 기준에는 못 미치지만, 문항 종류별 다리 어간이
  // 겹치거나 후보 문장과 어간이 1개 이상 겹치는 경험이다.
  // 순위: 다리 겹침 수 → 후보 어간 겹침 수. 직접 연결된 경험은 제외한다.
  // 29회차: 다리 매칭을 직접 규칙과 같은 tokenMatches로 맞췄다. 이전에는
  // 순수 부분 문자열(includes)이라 "실험실"이 "실험" 다리로 잡혔는데,
  // 직접 규칙은 "실험"과 "실험실"을 안 잡는다(남은 부분 1글자) — 같은
  // 개념을 두 규칙이 다르게 보는 불일치였다. tokenMatches는 "측정하고" 속
  // "측정"(남은 부분 2글자)은 그대로 잡고, "측정값" 속 "측정"(남은 부분
  // 1글자)·"분석화학" 속 "분석"(일반어)은 안 잡는다. 전 픽스처 diff로
  // 부작용을 확인한다.

  // 37회차: 수행 동사 근거. 경험 원문에 수행 동사가 하나라도 동사형으로
  // 있으면 true다. "조립 공정 흐름 정리" 속 조립은 주제어이지 수행이
  // 아니라서, 어간 뒤에 동사 어미(을/를/하/했/함/합/해/한/할/하고/하여/
  // 하며/되며/된/되는/했습니다/합니다/했음/했고)나 문장 부호·문장 끝이
  // 오는 경우만 수행으로 본다. "측정 장비 담당" 속 측정, "검사 결과" 속
  // 검사, "가공 정밀도" 속 가공은 주제어라 수행이 아니다. "데이터 정리"·
  // "점검 보조"는 수행 동사가 아니다 (정리·보조는 목록에 없음). 교육·
  // 실습·학습·이수도 수행이 아니다 — 대학 Fab 실습도 양산 실무가 아니라
  // 교육·훈련이라, 수행 직무에는 직접이 아니라 간접이 정직하다.
  // "X 실습"은 X를 실습한 것이라 수행으로 본다 ("CCP 설정 실습" 속
  // 설정). 단 "실습실"은 장소라 제외한다. 분석·설정 같은 판단 업무는
  // 수행이다 — 위해요소 분석·CCP 설정을 한 HACCP 프로젝트는 품질 관리
  // 직무에 직접이 정직하고, 기준 정리만 한 GMP 프로젝트는 간접이다.
  // hasDirectActionEvidence는 건드리지 않는다 — "수행"을 목록에 넣으면
  // 주제어("조립 공정")까지 수행으로 잡혀 한화 [1]을 못 막고 서버
  // 패리티도 깨진다 (35회차 결정 유지).
  const PERFORM_ACTION_ENDING = "(을|를|하|했|함|합|해|한|할|하고|하여|하며|되며|된|되는|했습니다|합니다|했음|했고|[.,;]| 실습(?![가-힣])|$)";
  // "작성"은 " 실습" 끝맺음을 쓰지 않는다 — "문서 작성 실습" 같은
  // 교육·훈련 설명이 수행 근거가 돼, 기준 정리만 한 GMP 학습
  // 프로젝트가 품질 검사 수행 문항에 직접 연결되는 오연결이 된다
  // (46회차 전 픽스처 diff 확인). "프로그램을 작성했다" 같은 동사형은
  // 그대로 수행이다.
  const PERFORM_ACTION_ENDING_NO_PRACTICE = "(을|를|하|했|함|합|해|한|할|하고|하여|하며|되며|된|되는|했습니다|합니다|했음|했고|[.,;]|$)";
  const PERFORM_ACTION_STEMS = ["구현", "최적화", "셋업", "개조", "설계", "구축", "운영", "개발", "검증", "평가", "분석", "개선", "관리", "교육", "협업", "측정", "검사", "시험", "기록", "가공", "제조", "조립", "생산", "실시", "실행", "제작", "검토", "판단", "결정", "비교", "확인", "수행", "처리", "설치", "운전", "점검", "수리", "정비", "수립", "확보", "추진", "설정", "코딩", "작성", "프로그래밍"];
  function hasPerformActionEvidence(text, meta) {
    // 46회차 (45회차 객관 검토 B3): 평탄한 문자열 자르기 대신 구조 기반
    // 판정을 쓴다. 39회차가 넣은 " ·" 끝맺음 + 첫 구간 자르기는 두 방향
    // 으로 틀렸다 — 과목명("기계설계 ·")이 수행 근거가 되고(" ·" 끝맺음),
    // 첫 구간에 있는 동사("코딩했다", "프로그램을 작성했다")는 잘려서
    // 수행 근거가 안 된다 (순서만 바꿔도 판정이 뒤집히는 역전). 대신
    // 항목의 종류(학력·전공은 수행 근거 아님)와 " · " 구간 구조로 본다.
    // 학력·전공 항목은 수행 근거가 아니다 — 과목 나열("기계설계 ·
    // 생산자동화 · CAD 실습")이 수행 동사로 잡히는 것을 막는다.
    // 종류가 없으면(원문만 받은 경우) 구간 구조만으로 판단한다.
    const kind = typeof meta === "string" ? meta : meta && meta.kind;
    if (String(kind || "") === "학력·전공") return false;
    const t = String(text || "").toLocaleLowerCase("ko");
    // " · "는 증거 원문의 필드 경계다. 구간별로 본다 — "확인한 수치"가
    // 뒤에 붙어 ("분석 · 23nm 패턴") 수행 동사가 문장 끝에서 밀려나도,
    // 자기 구간의 끝에서는 여전히 수행 근거다 (39회차 BUG #2의 목표는
    // 유지하고, 수단은 구간 구조로 바꾼다).
    return t.split(" · ").some((segment) => {
      const s = segment.trim();
      if (!s) return false;
      // "관련 과목"으로 시작하는 구간은 과목 나열이라 수행이 아니다.
      if (/^관련 과목/.test(s)) return false;
      return PERFORM_ACTION_STEMS.some((stem) => {
        const ending = stem === "작성" ? PERFORM_ACTION_ENDING_NO_PRACTICE : PERFORM_ACTION_ENDING;
        const m = new RegExp(stem + ending).exec(s);
        if (!m) return false;
        // 문장 끝($)만으로 잡힌 경우: 공백이 있는 구절("설계 검토",
        // "Dose-CD-Resolution 관계 분석")만 인정한다. 한 단어짜리 구간
        // ("기계설계" 같은 과목명)은 수행이 아니다 — 순서만 바꿔도
        // 판정이 뒤집히는 역전을 막는다.
        if (m[0] === stem && !/\s/.test(s)) return false;
        return true;
      });
    });
  }

  // 37회차: 요구사항이 수행·판단을 묻는지. 이해·학습·지식을 묻는
  // 요구사항(흐름·원리 이해, 프로젝트 학습 경험)은 조사·정리가 정당한
  // 근거라 강등하지 않는다. 수행·검토·분석·평가·판단·개선 등을 묻는
  // 주요 업무에만 학습 전용 경험 강등을 적용한다.
  function requiresPerformanceAction(requirementText) {
    const t = String(requirementText || "");
    if (/이해|학습|지식/.test(t)) return false;
    return /수행|실시|실행|담당|운영|관리|검토|분석|평가|판단|결정|개선|최적화|변경|조정|개발|설계|구축|구현|검증|시험|검사|측정|가공|제조|조립|생산|수립|확보|추진/.test(t);
  }
  // 46회차 (45회차 객관 검토 B6): 관련 분야 다리의 "교육·학습·과정"은
  // 형식어라, 분야 토큰(산업·도메인 명사)을 요구사항과 함께 공유할 때만
  // 센다. "반도체 공정 교육"은 반도체를 공유하니 간접이 되고, KFP는
  // 반도체를 공유하지 않으니(공정·흐름만 겹침) 안 걸린다. 공정·흐름·
  // 원리·이해 같은 일반어는 분야 토큰이 아니다. "소재"는 "소재지"와
  // 겹쳐 목록에서 뺐다.
  const FIELD_TOKENS = ["반도체", "화학", "식품", "제약", "바이오", "기계", "전기", "전자", "자동차", "항공", "방산", "의료", "에너지", "조선", "철강", "디스플레이", "배터리", "로봇", "통신", "건설", "물류", "화장품", "원자력", "수소"];
  const RELATED_FIELD_CONDITIONAL_BRIDGES = ["교육", "학습", "과정"];
  function findIndirectExperience(candidateText, kind, profileEntries, excludeId) {
    const candTokens = new Set(stemmedTokens(candidateText));
    const bridges = BRIDGES[kind] || [];
    if (!candTokens.size || !Array.isArray(profileEntries)) return null;
    let best = null;
    for (const entry of profileEntries) {
      if (excludeId && entry.id === excludeId) continue;
      const text = String(entry.text || "");
      const entryTokens = stemmedTokens(text);
      const shared = unique(entryTokens.filter((t) => [...candTokens].some((c) => tokenMatches(c, t))));
      let bridge = unique(entryTokens.filter((t) => bridges.some((b) => tokenMatches(b, t))));
      // 46회차 (B6): 관련 분야 다리 "교육·학습·과정"은 분야 토큰을 함께
      // 공유할 때만 다리로 센다. 43회차에 형식어라 빼버렸더니 전공 없는
      // 프로필의 "반도체 공정 교육"·"반도체 공정 학습 프로젝트"가
      // 간접에서 gap으로 퇴보했다. KFP는 분야 토큰 겹침이 0개라 여전히
      // 안 걸린다.
      if (kind === "related_field") {
        const sharedField = FIELD_TOKENS.some((f) => String(candidateText || "").includes(f) && text.includes(f));
        if (sharedField) {
          const conditional = unique(entryTokens.filter((t) => RELATED_FIELD_CONDITIONAL_BRIDGES.some((b) => tokenMatches(b, t))));
          bridge = unique([...bridge, ...conditional]);
        }
      }
      const specific = shared.filter((t) => !["반도체", "공정", "경험", "수행", "분석", "활용", "관련"].includes(t));
      // 38회차 판정: 다리만 있는 후보를 막는 가드는 넣지 않는다. 넣어
      // 봤더니(전 픽스처 diff) 정당한 다리 연결이 깨졌다 — AI Research
      // Agent→TEST 프로그래밍 문항(다리 rag·agent·요약, 겹침 어간 0개),
      // 원익QNC→장비 Set-up 문항(다리 동선·최적화)이 간접에서 떨어져
      // gap이 되고 테스트 8개가 깨졌다. 다리 표는 종류별로 엄선된
      // 개념 연결이라, 다리 적중 자체가 구체적 연결이다. 통어 겹침이
      // 0개인 경우를 연결하는 게 다리의 설계 목적이다. 33회차 9번
      // 교체 조건(구체 어간 필요)은 이미 연결된 경험을 교체하는
      // 결정에만 적용되는 게 맞고, 간접 조회 본체에는 적용하지 않는다.
      if (bridge.length < 1 && !(shared.length >= 1 && specific.length >= 1)) continue;
      // 42회차: 요구사항 원문과 직접 겹치는 구체 어간이 다리 어간보다
      // 강한 근거다. 다리는 종류별 개념 연결이라 어떤 분석이든 잡지만
      // ("분석" 다리는 위해요소 분석도 잡는다), 구체 어간은 요구사항이
      // 실제로 쓴 단어와 겹친다 — "최적 공정 설계" 문항에 원리만 정리한
      // 동아리보다 실제로 설계한 CAD 실습이, "데이터 분석" 문항에
      // 위해요소 분석만 한 HACCP보다 측정·데이터 정리를 한 식품 실습이
      // 정직한 간접 연결이다. 구체 어간 1개가 다리 1개보다 무겁다
      // (3 > 2). 다리만 있는 연결은 그대로 둔다 (38회차 판정 유지 —
      // AI→TEST, 원익QNC→장비 같은 다리 연결은 구체 어간이 0개라
      // 순위가 안 바뀐다).
      // \"관련 분야\" 문항은 전공 자체가 답이라 학력·전공 항목에 +2를
      // 준다 (약학과 전공이 GMP 정리 프로젝트보다, 화학공학부 전공이
      // 화학공학 학회보다 앞에 온다).
      // 42회차 수정: 구체 어간 보너스는 실제 수행 근거가 있는 경험에만
      // 준다. 학습 전용 경험의 키워드 겹침("장비 교육 이수"의 '장비')은
      // 배경일 뿐 수행 증거가 아니므로, 이를 강하게 치면 실제 개선을
      // 수행한 경험(원익QNC 동선·최적화)보다 앞에 뜨는 오연결이 된다
      // (SK 장비 Set-up 문항이 원익QNC에서 KFP로 뒤집혔다).
      // 전공 항목도 구체 보너스에서는 뺀다. 과목명 속 수행어("기계설계"의
      // '설계') 때문에 수행 근거가 있는 것으로 판정돼, 과목명 겹침
      // ("생산자동화" 속 '자동화')만으로 현장실습·캡스톤을 앞지르는
      // 오연결이 된다 (현대차 8번 [6]·[12]·[17]이 현장실습·캡스톤에서
      // 기계공학부로 뒤집혔다). 전공은 관련 분야 문항의 종류 보너스(+2)가
      // 따로 있어 거기서는 여전히 이긴다 (화학공학부·약학과·전자공학부).
      // 46회차: 전공 제외는 hasPerformActionEvidence가 직접 한다.
      const performed = hasPerformActionEvidence(text, entry);
      let rank = bridge.length * 2 + shared.length + (performed ? specific.length * 3 : 0);
      if (kind === "related_field" && String(entry.kind || "") === "학력·전공") rank += 2;
      if (!best || rank > best.rank) best = { rank, entry, shared, bridge };
    }
    if (!best) return null;
    const excerpt = excerptText(best.entry.text);
    return { id: best.entry.id, kind: best.entry.kind, label: best.entry.label, text: String(best.entry.text || ""), excerpt, score: best.rank, matchedTokens: best.shared, bridgeTokens: best.bridge, verifiedNumbers: String(best.entry.verifiedNumbers || "") };
  }

  // 33회차: 문항 종류의 다리 어간 중 경험 원문과 겹치는 것을 돌려준다.
  // 32회차 강등-다리 규칙과 같은 판정을 9번 배치(mapQuestionsLocal)에서도
  // 쓸 수 있게 export한다. 다리가 하나도 없으면 빈 배열이다.
  function bridgeStems(kind, text) {
    const bridges = BRIDGES[kind] || [];
    return stemmedTokens(String(text || "")).filter((t) => bridges.some((b) => tokenMatches(b, t)));
  }

  function collectCandidates(analysis) {
    const facts = analysis?.facts || {};
    const career = analysis?.careerAnalysis || {};
    const candidates = [];
    const seenEvidence = new Set();
    const push = (source, value, evidenceIds, axisTitle) => {
      const text = String(value || "").trim();
      if (!text) return;
      const key = normalize(text);
      if (candidates.some((c) => normalize(c.competency) === key)) return;
      // 같은 JD 문장에서 이미 후보를 만들었으면 중복을 피한다 (단, 축이 다르면 허용하지 않음 - 1문장 1질문)
      const evKey = (evidenceIds || []).slice().sort().join(",");
      if (evKey && seenEvidence.has(evKey)) return;
      if (evKey) seenEvidence.add(evKey);
      candidates.push({ source, competency: text, evidenceIds: unique(evidenceIds || []), axisTitle: axisTitle || "" });
    };
    // 1순위: 주요 업무 (duties) - JD의 핵심
    (facts.duties || []).forEach((row) => push("duty", row.value, row.evidenceIds, ""));
    // 2순위: 우대·필수 역량 (competencyLinks가 놓친 TEST 프로그램 같은 항목을 살리기 위해 직접 사용)
    [...(facts.preferred || []), ...(facts.competencies || []), ...(facts.required || [])]
      .filter((row) => !/학사|석사|박사|학위|졸업|어학|영어|자격증/i.test(row.value))
      .forEach((row) => {
        const link = (career.competencyLinks || []).find((l) => normalize(l.requirement) === normalize(row.value));
        push("preferred", row.value, row.evidenceIds, link ? link.axisTitle : "");
      });
    // 3순위: competencyLinks에 있는데 위에서 안 잡힌 항목
    (career.competencyLinks || []).forEach((link) => push("competencyLink", link.requirement, link.evidenceIds, link.axisTitle));
    // 축 타이틀 보완: evidenceIds로 workAxes에서 찾기
    const axes = career.workAxes || [];
    candidates.forEach((c) => {
      if (!c.axisTitle) {
        const axis = axes.find((a) => (a.evidenceIds || []).some((id) => c.evidenceIds.includes(id)));
        if (axis) c.axisTitle = axis.title;
      }
    });
    return candidates;
  }

  // 템플릿 문구에 들어간 보호 용어가 JD 원문에 없으면 빼낸다.
  // 예: process_yield 템플릿의 "품질·수율"은 JD에 수율이 없을 때 "품질"이 된다.
  // 이렇게 하지 않으면 모듈이 만든 문항이 모듈 자신의 검증(validateRecallQuestions)에 실패한다.
  // (2026-11-04 발견: 수율이 없는 현대차 JD에서 JDQ-03이 "원문에 없는 용어(수율)"로 fail)
  function fitToSource(text, sourceText) {
    let out = String(text || "");
    const source = String(sourceText || "").toLocaleLowerCase("ko");
    for (const term of PROTECTED_TERMS) {
      if (source.includes(term.toLocaleLowerCase("ko"))) continue;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`·${escaped}`, "g"), "").replace(new RegExp(`${escaped}·`, "g"), "").replace(new RegExp(escaped, "g"), "");
    }
    return out.replace(/ {2,}/g, " ").trim();
  }

  // 14회차: process_yield 방향 문구의 "대학 Fab"은 반도체 도메인 문구다.
  // JD 원문에 반도체를 가리키는 말이 없을 때(예: 현대차 JD)는 일반
  // 문구로 바꾼다. "공정"만으로는 반도체라고 단정하지 않는다.
  // (자동차·제조 JD에도 공정은 있기 때문이다.)
  const SEMICONDUCTOR_DOMAIN = /반도체|fab|팹|웨이퍼|wafer/i;
  const FAB_DIRECTION_CLAUSE = "양산 Fab 실무가 아니라면 대학 Fab·실습·분석 경험임을 그대로 밝히세요.";
  const GENERIC_DIRECTION_CLAUSE = "실무 경험이 아니라면 교육·실습·분석 경험임을 그대로 밝히세요.";
  function directionFor(kind, sourceText) {
    let out = fitToSource((TEMPLATES[kind] || TEMPLATES.generic).direction, sourceText);
    if (kind === "process_yield" && !SEMICONDUCTOR_DOMAIN.test(String(sourceText || ""))) {
      out = out.replace(FAB_DIRECTION_CLAUSE, GENERIC_DIRECTION_CLAUSE);
    }
    return out;
  }

  // 43회차: programming_data 종류인데 원문에 프로그래밍·데이터 신호가
  // 없으면("분석"만으로 걸린 경우 — 한화 제조공정 설계 직무처럼),
  // 템플릿 문구가 프로그래밍 풍이라 직무와 안 맞는다. 종류는 그대로
  // 두고(순위·링크·단서·검증은 종류로 돈다) 표시 문구만 중립 문구로
  // 바꾼다. 41회차 종류 변경 시도는 부작용 3건이 나서 되돌린 전례가
  // 있다 — 종류를 건드리지 않는 것이 이 수정의 전제다. 신호가 있는
  // 문항(현대차 데이터/SW 코딩, SK TEST)은 그대로 둔다.
  // 중립 문구는 기존 템플릿 문장과 겹치지 않게 쓴다 — 질문 문구로
  // 중복 제거(25회차)와 저장·병합(app.js saveJdqPlacement,
  // mergeJdqPlacements)이 문장 기준이라, generic 문구를 그대로 쓰면
  // 한화 Q2(generic)와 같은 문장이 돼 슬롯에서 밀려난다.
  // 46회차 (45회차 객관 검토 B7): "도구"는 프로그래밍 신호가 아니다.
  // "분석 도구를 활용한 품질 관리" 같은 문항이 프로그래밍 템플릿으로
  // 나오는 걸 막는다 — 도구만 있고 프로그래밍·데이터 신호가 없으면
  // 중립 문구를 쓴다.
  const PROGRAMMING_SIGNAL = /데이터|프로그램|프로그래밍|SW|소프트웨어|코딩|Python|C\+\+|MATLAB/i;
  const NEUTRAL_WORDING = {
    question: "이 업무와 연결되는 일을 직접 수행하거나 참여한 적이 있나요?",
    focus: {
      situation: "어떤 업무였고, 맡은 일은 무엇이었나요?",
      action: "본인이 직접 한 행동은 무엇이었고, 어떻게 확인했나요?",
      result: "실제 확인한 결과만 적으세요.",
    },
    direction: "지원서에서는 맡은 업무 → 직접 수행한 행동 → 확인한 결과 순서로 쓰세요. 직접 수행한 부분과 참여한 부분은 구분해 쓰세요. 지원서 작성용입니다.",
  };

  function buildRecallQuestions(analysis, profileEntries, options) {
    const max = Math.max(1, Math.min(6, Number(options?.maxQuestions) || MAX_QUESTIONS));
    const units = analysis?.units || [];
    const unitMap = new Map(units.map((u) => [u.id, u]));
    const sourceText = units.map((u) => u.text).join(" ");
    const candidates = collectCandidates(analysis);
    const warnings = [];
    if (!candidates.length) warnings.push("채용공고에서 질문 근거가 될 업무·역량 문장을 찾지 못했습니다. 채용공고 원문을 확인해 주세요.");

    // 11회차 설계 변경: 직접 연결되는 후보를 먼저 보여준다.
    // 후보를 전부 만든 뒤, 직접(linked) 후보를 원래 순서대로 먼저 두고
    // 나머지는 원래 순서대로 둔다. 최대 문항 수(4개)는 그대로다.
    // 이전에는 후보 순서대로 앞 4개만 잘라서, 주요 업무 4개가 문항을
    // 다 차지하면 우대 항목이 문항에 아예 안 나왔다. 그런데 사용자가
    // 직접 답할 수 있는 유일한 경험(KFP 대학 Fab 실습 → 공정 흐름·원리)은
    // 우대 항목에 연결돼서, 실제 JD에서는 직접 답할 수 있는 문항이 0/4가
    // 됐다. 직접 문항이 있으면 그걸 먼저 보여주는 게 취업준비에 쓸모 있다.
    // 간접·gap 후보끼리의 순서는 바꾸지 않는다 (직접만 앞으로 당긴다).
    const built = [];
    const builtCandidates = [];
    const builtIntent = [];
    for (const cand of candidates) {
      const evidenceIds = cand.evidenceIds.filter((id) => unitMap.has(id));
      if (!evidenceIds.length) continue;
      const jdQuote = unitMap.get(evidenceIds[0]).text;
      const kind = classify(cand.competency + " " + jdQuote);
      const candidateEntries = relevantEntries(cand.competency + " " + jdQuote, profileEntries);
      const tpl = TEMPLATES[kind] || TEMPLATES.generic;
      // 43회차: programming_data인데 원문에 프로그래밍·데이터 신호가
      // 없으면 표시 문구만 중립 문구로 바꾼다 (종류는 유지 — 순위·링크·
      // 단서·검증은 종류로 돈다). 신호 판정은 역량 문장 + 인용문 기준.
      const useNeutralWording = kind === "programming_data" && !PROGRAMMING_SIGNAL.test(cand.competency + " " + jdQuote);
      const wording = useNeutralWording ? NEUTRAL_WORDING : tpl;
      // 3단계 판정: 직접 → 간접 → gap. 간접은 직접 기준에 못 미쳐도
      // 다리 어간이 겹치는 경우에만, 단서付き로 표시한다.
      // Apps Script 패리티: 직접 후보라도 주요 업무(duty)가 요구하는
      // 구체 행동이 프로필 원문에 없으면 간접으로 강등한다.
      let linked = findLinkedExperience(cand.competency + " " + jdQuote, candidateEntries);
      let indirect = null;
      // 35회차: process_yield 문항은 조건 변경 + 측정·비교가 질문의
      // 핵심이다. 직접 연결된 경험 원문에 그 근거가 없으면 간접으로
      // 강등한다. 실전 현대차 Q1이 "프레스·가동률" 어간만 겹친 현장실습
      // (점검 보조·데이터 정리)에 직접 연결됐는데, hasDirectActionEvidence는
      // 요구 문장에 목록 행동어(운영·개발·검증…)가 없으면 true를 돌려줘서
      // 막지 못한다. 요구 문장의 행동어가 아니라 질문 종류가 요구하는
      // 근거로 본다. 8번(요구사항 연결)의 직접 판정은 이 규칙을 안 쓴다 —
      // 8번은 문항이 아니라 요구사항과 경험의 연결이라, 강등 기준이 다르다.
      const yieldEvidenceMissing = linked && kind === "process_yield" && !hasConditionChangeEvidence(linked.text);
      // 37회차: 주요 업무가 수행·판단을 묻는데 연결된 경험 원문에 수행
      // 동사가 하나도 없으면(조사·정리·발표만 한 학습 전용 경험) 직접이
      // 아니라 간접이다. 한화 Q1 동아리 "조립 공정 흐름 정리와 발표"가
      // 제조·조립·생산 수행 문항에 직접 연결되던 과장을 막는다.
      // 이해·학습을 묻는 문항에는 적용하지 않는다 (requiresPerformanceAction
      // 이 흐름·원리 이해, 프로젝트 학습 경험을 걸러낸다).
      const learningOnlyDemote = linked && cand.source === "duty" && requiresPerformanceAction(cand.competency) && !hasPerformActionEvidence(linked.text, linked);
      // 38회차 (수정): 공정 지식 문항은 "배우고 실제 사례에 적용"을 묻는다.
      // 직접 연결된 경험에 수행 근거가 하나도 없으면(교육·참관·정리만 한
      // 학습 전용 경험) 적용 근거가 있는 다른 경험을 찾는다. 있으면 그걸
      // 직접으로 올리고 기존 연결은 간접 배경으로 남긴다. 없으면 기존
      // 직접 연결을 유지한다 — 간접으로 내리면 문항이 4개 슬롯에서 밀려
      // 사라지는 경우가 있다(바이오·EE·제약·확인한 수치 테스트 확인).
      // 8번(요구사항 연결)은 "이해" 요구사항이라 학습 전용 직접을 유지한다.
      if (linked && kind === "process_knowledge" && !hasPerformActionEvidence(linked.text, linked)) {
        const applied = findProcessApplicationExperience(cand.competency + " " + jdQuote, candidateEntries, linked.id);
        if (applied) {
          indirect = linked;
          linked = applied;
        }
      }
      if (linked && (!hasDirectActionEvidence(cand.competency, linked.text, cand.source) || yieldEvidenceMissing || learningOnlyDemote)) {
        indirect = linked; // 강등: 직접 기준 미달 → 간접 경험으로 표시
        linked = null;
        // 32회차: 강등된 경험이 이 문항 종류와 다리 어간을 하나도 공유하지
        // 않으면, 다리로 연결되는 다른 경험이 있는지 본다. 강등 경험이
        // 문항 의도와 무관한 경우(방산 생산 공정 운영 → 조립 흐름만 정리한
        // 동아리)보다 다리가 있는 경험(조건을 바꿔 측정한 CNC 가공 실습)이
        // 정직한 간접 연결이다. 다리가 있으면 강등 경험을 그대로 둔다
        // (식품·제약·화학·바이오·전기전자 실습은 측정 다리가 있어 안 바뀐다).
        const kindBridges = BRIDGES[kind] || [];
        const demotedBridge = stemmedTokens(indirect.text || "").filter((t) => kindBridges.some((b) => tokenMatches(b, t)));
        if (!demotedBridge.length) {
          const bridged = findIndirectExperience(cand.competency + " " + jdQuote, kind, candidateEntries, null);
          if (bridged) indirect = bridged;
        }
      }
      if (!linked && !indirect) {
        indirect = findIndirectExperience(cand.competency + " " + jdQuote, kind, candidateEntries, null);
      }
      const status = linked ? "linked" : indirect ? "indirect" : "gap";
      const connected = linked || indirect;
      // S7: 장비 문항은 Set-up·지속적인 개선·업체 협업 세 부분으로 나눠 표시한다.
      // 직접 연결이 없을 때만 나눈다. 직접 연결이 있으면 그 경험이 문항 전체를 커버한다.
      let subParts = null;
      if (!linked && kind === "equipment_collab" && /Set-up/i.test(cand.competency) && /협업/.test(cand.competency)) {
        // ② 지속적인 개선: 연결된 경험이 실제로 '개선'·'최적화'와 겹칠 때만
        // 간접이다. 겹치지 않으면(예: 장비 교육만 받은 KFP) gap이다.
        // "원익QNC와 부분 연결"을 하드코딩하지 않고 연결된 경험 라벨을 쓴다
        // (실제 JD 재검증 10회차 발견).
        const improvementTokens = [...(connected?.matchedTokens || []), ...(connected?.bridgeTokens || [])];
        const improvementIndirect = status === "indirect" && improvementTokens.some((t) => String(t).includes("개선") || String(t).includes("최적"));
        subParts = [
          { label: "① 장비 Set-up", status: "gap", note: "Set-up 경험 근거 없음" },
          { label: "② 지속적인 개선", status: improvementIndirect ? "indirect" : "gap", note: improvementIndirect ? `${connected.label}와 부분 연결` : "개선 경험 근거 없음" },
          { label: "③ 장비 업체 협업", status: "gap", note: "업체 협업 경험 근거 없음" },
        ];
      }
      built.push({
        // id는 순서가 정해진 뒤에 붙인다 (JDQ-01은 화면 표시 순서다).
        // key는 순서와 무관한 안정 식별자다: 첫 JD 근거 번호라서, 순서가
        // 바뀌어도 같은 문항은 같은 key를 가진다. JDQ 답변·배치 저장소가
        // 이 key로 저장해야 순서 변경 뒤에도 답변이 엉뚱한 문항에 안 붙는다.
        key: evidenceIds[0],
        label: "채용공고에서 나온 질문",
        question: fitToSource(wording.question, sourceText),
        jdQuote,
        jdEvidenceIds: evidenceIds,
        axisTitle: cand.axisTitle || "채용공고 업무",
        competency: cand.competency,
        focus: {
          situation: fitToSource(wording.focus.situation, sourceText),
          action: fitToSource(wording.focus.action, sourceText),
          result: fitToSource(wording.focus.result, sourceText),
        },
        direction: useNeutralWording ? NEUTRAL_WORDING.direction : directionFor(kind, sourceText),
        linkedExperience: connected ? { ...connected, level: status } : null,
        status,
        // 간접 연결에만 단서를 붙인다. 직접 연결에는 단서가 없다.
        // 단서·경계·다음 행동에도 fitToSource를 적용한다: "수율" 같은 보호 용어는
        // JD 원문에 있을 때만 남긴다 (수율 없는 JD에서 검증이 실패하지 않게).
        indirectNote: status === "indirect" ? fitToSource(kind === "equipment_collab" ? equipmentIndirectNote(connected) : kind === "process_yield" ? processYieldIndirectNote(connected) : kind === "programming_data" ? programmingIndirectNote(connected, sourceText, cand.competency + " " + jdQuote) : (INDIRECT_NOTES[kind] || INDIRECT_NOTES.generic), sourceText) : null,
        // gap에만 다음 행동 후보를 붙인다. 간접은 이미 부분 배경이 있어 다음 행동을 따로 붙이지 않는다.
        // 다음 행동은 프로필의 계획 중인 프로젝트에서 고른다
        // (options.plans). 계획이 없으면 없다는 사실을 밝힌다.
        nextAction: status === "gap" ? fitToSource(nextActionFor(kind, options?.plans), sourceText) : null,
        // 38회차: JDQ 카드에 "같은 역량의 다른 경험"과 "관련 계획"을 함께
        // 보여준다. 관련 계획은 gap이 아닌 문항에만 붙인다 (gap은
        // nextAction이 이미 최상의 계획을 보여준다).
        relatedExperiences: findRelatedExperiences(cand.competency + " " + jdQuote, kind, candidateEntries, connected?.id),
        relatedPlans: status === "gap" ? [] : findRelatedPlans(kind, options?.plans),
        // S3: 직접 연결된 공정 지식 문항에만 경계 문구를 붙인다.
        // 연결된 경험이 교육·실습 성격이면 그 경험 라벨로 경계를 만든다.
        boundary: status === "linked" && kind === "process_knowledge"
          ? fitToSource(trainingBoundary(linked), sourceText)
          : null,
        subParts,
      });
      builtCandidates.push(cand);
      builtIntent.push(intentScore(kind, connected));
    }
    // 25회차: 종류가 다른 후보가 같은 질문 템플릿으로 떨어지면 질문이
    // 통째로 겹친다(현대차 JD: 설비 관련 후보 3개가 모두 "장비를 다루거나
    // 이상·요청을 구체화해…" 한 문장이 됨). 같은 문구는 하나만 남기고
    // 나머지는 빼서 4개 문항 슬롯이 다른 영역(품질 개선·데이터 분석 등)에
    // 돌아가게 한다. 같은 문구면 직접 연결된 후보를 우선 남긴다.
    // 경고(빠진 영역) 계산도 중복을 뺀 뒤를 기준으로 한다.
    // 31회차: 같은 질문 문구의 후보끼리는 질문 의도에 답하는 경험을
    // 우선 남긴다. 의도 토큰 2개 이상이 겹치면 의도 충족으로 보고,
    // 그 안에서만 직접→간접→gap 순위를 본다. 의도가 같으면 의도
    // 점수가 높은 쪽, 그래도 같으면 먼저 나온 후보를 남긴다.
    // (이전: 상태 순위만 봤다 — 그래서 식품·제약 JDQ-01이 조건 변경
    // 의도와 무관한 HACCP·GMP에 직접 연결됐다.)
    const statusRank = { linked: 0, indirect: 1, gap: 2 };
    const bestByQuestion = new Map();
    built.forEach((q, i) => {
      const key = normalize(q.question);
      const prev = bestByQuestion.get(key);
      const intent = builtIntent[i];
      const boost = intent >= 2 ? 1 : 0;
      const prevBoost = prev ? (prev.intent >= 2 ? 1 : 0) : -1;
      if (!prev
        || boost > prevBoost
        || (boost === prevBoost && statusRank[q.status] < statusRank[prev.q.status])
        || (boost === prevBoost && statusRank[q.status] === statusRank[prev.q.status] && intent > prev.intent)) {
        bestByQuestion.set(key, { q, cand: builtCandidates[i], index: i, intent });
      }
    });
    const deduped = [...bestByQuestion.values()].sort((a, b) => a.index - b.index);
    const dedupedBuilt = deduped.map((row) => row.q);
    const dedupedCandidates = deduped.map((row) => row.cand);
    const ordered = [
      ...dedupedBuilt.filter((q) => q.status === "linked"),
      ...dedupedBuilt.filter((q) => q.status !== "linked"),
    ];
    const questions = ordered.slice(0, max);
    questions.forEach((q, i) => { q.id = `JDQ-${String(i + 1).padStart(2, "0")}`; });
    if (!questions.length) warnings.push("채용공고에서 나온 질문을 만들지 못했습니다. 채용공고 원문·분석 결과를 확인해 주세요.");
    // 문항은 최대 4개라 후보가 더 많으면 뒤쪽 후보는 문항에 안 나온다.
    // 어떤 영역이 빠졌는지 솔직하게 밝힌다 (실제 JD 재검증 10회차: 8개 후보
    // 중 우대 4개가 문항에 안 나옴). 빠진 후보는 원래 후보 순서대로 적는다.
    // 11회차: 직접 문항이 앞으로 오면서 빠지는 후보가 달라졌으니,
    // 선택되지 않은 후보를 기준으로 경고를 만든다.
    if (dedupedBuilt.length > questions.length) {
      const selectedSet = new Set(questions);
      const leftoverCands = dedupedCandidates.filter((_, i) => !selectedSet.has(dedupedBuilt[i]));
      const leftover = leftoverCands.map((c) => {
        const t = String(c.competency || "").trim();
        return t.length > 32 ? t.slice(0, 32) + "…" : t;
      });
      let warning = `채용공고 업무·역량 ${dedupedBuilt.length}개 중 ${questions.length}개만 질문으로 만들었습니다. 질문에 나오지 않은 영역: ${leftover.join(" / ")}`;
      // 16회차: 잘린 영역 중 전용 질문이 있는 영역(파생제품·AMHS)이 있으면
      // 알려준다. 문항 수(최대 4개)·직접 우선 순서는 바꾸지 않고 안내만
      // 추가한다. 전용 질문은 직접 연결되는 문항이 적을 때 문항으로 나온다.
      const dedicatedNames = [...new Set(leftoverCands.map((c) => {
        const quote = unitMap.get((c.evidenceIds || [])[0])?.text || "";
        return classify(`${c.competency || ""} ${quote}`);
      }).filter((k) => k === "derived_product" || k === "amhs")
        .map((k) => (k === "derived_product" ? "파생제품" : "자동반송")))];
      if (dedicatedNames.length) {
        warning += ` 이 중 ${dedicatedNames.join("·")}은 전용 질문이 준비돼 있습니다. 질문이 ${questions.length}개로 제한돼 있어 지금은 나오지 않았습니다. 직접 연결되는 질문이 적으면 이 영역도 질문으로 나옵니다.`;
      }
      warnings.push(warning);
    }
    const summary = {
      total: questions.length,
      direct: questions.filter((q) => q.status === "linked").length,
      indirect: questions.filter((q) => q.status === "indirect").length,
      gap: questions.filter((q) => q.status === "gap").length,
      // 4회차 정정: answerable은 직접만 센다. 간접은 background로 따로 둔다.
      answerable: questions.filter((q) => q.status === "linked").length,
      background: questions.filter((q) => q.status === "indirect").length,
    };
    return { questions, warnings, summary };
  }

  function validateRecallQuestions(analysis, result, jdSourceText, profileEntries) {
    const source = String(jdSourceText || "");
    const unitIds = new Set((analysis?.units || []).map((u) => u.id));
    const unitTexts = new Set((analysis?.units || []).map((u) => u.text));
    const profileTexts = (profileEntries || []).map((e) => String(e.text || ""));
    const issues = [];
    const questions = result?.questions || [];
    if (questions.length > 6) issues.push("문항이 6개를 초과합니다.");
    for (const q of questions) {
      if (!["linked", "indirect", "gap"].includes(q.status)) issues.push(`${q.id}: 판정 상태가 linked/indirect/gap 중 하나가 아닙니다.`);
      if (!q.jdEvidenceIds?.length || !q.jdEvidenceIds.every((id) => unitIds.has(id))) issues.push(`${q.id}: 채용공고 근거 번호가 분석 결과에 없습니다.`);
      if (!unitTexts.has(q.jdQuote)) issues.push(`${q.id}: 채용공고 인용문이 원문 의미 단위와 일치하지 않습니다.`);
      if (q.label !== "채용공고에서 나온 질문") issues.push(`${q.id}: '채용공고에서 나온 질문' 표시가 없습니다.`);
      const rendered = [q.question, q.direction, q.focus?.situation, q.focus?.action, q.focus?.result, q.indirectNote, q.nextAction, q.boundary].join(" ");
      for (const term of PROTECTED_TERMS) {
        if (rendered.toLocaleLowerCase("ko").includes(term.toLocaleLowerCase("ko")) && !source.toLocaleLowerCase("ko").includes(term.toLocaleLowerCase("ko"))) {
          issues.push(`${q.id}: 원문에 없는 용어(${term})를 질문·작성 방향에 사용했습니다.`);
        }
      }
      if (q.linkedExperience && !q.linkedExperience.excerpt) issues.push(`${q.id}: 연결된 경험의 원문이 없습니다.`);
      if (q.linkedExperience && profileTexts.length && !profileTexts.some((t) => t.includes(q.linkedExperience.excerpt))) issues.push(`${q.id}: 연결된 경험의 발췌가 프로필 원문의 일부가 아닙니다.`);
      if (q.status === "indirect" && !q.indirectNote) issues.push(`${q.id}: 간접 연결인데 단서 문구가 없습니다.`);
      if (q.status === "indirect" && q.linkedExperience?.level !== "indirect") issues.push(`${q.id}: 간접 연결의 level 표시가 indirect가 아닙니다.`);
      if (q.status === "gap" && q.linkedExperience) issues.push(`${q.id}: gap인데 연결된 경험이 있습니다.`);
      if (q.status === "gap" && !q.nextAction) issues.push(`${q.id}: gap인데 다음 행동 후보가 없습니다.`);
      if (q.status === "linked" && q.indirectNote) issues.push(`${q.id}: 직접 연결인데 간접 단서가 있습니다.`);
    }
    // 요약 수가 문항 수와 맞는지 확인한다.
    // answerable은 직접만, background는 간접 수와 같아야 한다 (4회차 정정).
    if (result?.summary) {
      const s = result.summary;
      if (s.total !== questions.length || s.direct + s.indirect + s.gap !== questions.length || s.answerable !== s.direct || (s.background !== undefined && s.background !== s.indirect)) {
        issues.push("요약 수(직접·간접·보완 필요)가 문항 수와 맞지 않습니다.");
      }
    }
    return { status: issues.length ? "fail" : "pass", issues };
  }

  const api = { buildRecallQuestions, validateRecallQuestions, classify, findLinkedExperience, findIndirectExperience, findRelatedExperiences, findRelatedPlans, findCoreActivityExperience, findProcessApplicationExperience, bridgeStems, collectCandidates, fitToSource, hasDirectActionEvidence, hasOptimizationResultEvidence, hasConditionChangeEvidence, hasPerformActionEvidence, requiresPerformanceAction, hasExperimentActivityEvidence, stemmedTokens, tokenMatches, MAX_QUESTIONS };
  root.JdRecallQuestions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
