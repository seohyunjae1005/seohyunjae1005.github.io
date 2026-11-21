(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExperienceQuestions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const tracks = { chipmaker: '칩메이커', equipment: '장비사' };
  const activities = { academic: '전공·연구·기술 실무', work: '알바·인턴·직장', external: '동아리·대외활동', daily: '일상·개인 활동' };
  const stages = { ongoing: '진행 중', complete: '마침', proposal: '준비·제안 단계' };
  // Questions are editorial prompts derived from stored cases, not employer questions or hiring criteria.
  const sources = {
    recipe: { company: 'SK하이닉스', post: '36333', number: 1, point: '조건별 결과 비교와 목표 규격 검증' },
    samsung: { company: '삼성전자', post: '36332', number: 4, point: '공정 조건과 제품 특성의 연결' },
    grinder: { company: 'AMAT', post: '36413', number: 3, point: '조치 후 남은 알람에서 원인 재검토' },
    cvd: { company: 'ASML', post: '32578', number: 1, point: '점검 결과에 따른 원인 가설 변경' },
    teamwork: { company: 'SK하이닉스', post: '36333', number: 2, point: '강점에 따른 역할 재분배' },
    information: { company: 'AMAT', post: '36413', number: 4, point: '같은 형식으로 정보를 공유해 협업' },
    vendor: { company: 'SK하이닉스', post: '32681', number: 4, point: '임의 판단 대신 담당 부서에 확인·전달' },
    challenge: { company: 'SK하이닉스', post: '25576', number: 1, point: '접근 변경과 목표 미달 범위까지 서술' },
    routine: { company: 'AMAT', post: '36407', number: 3, point: '실천 방식을 바꾸고 다른 활동에 적용' },
    improvement: { company: 'SK하이닉스', post: '25576', number: 2, point: '매장 제약에 맞춘 홍보·판매 방식 변경' },
    feedback: { company: 'ASML', post: '25511', number: 1, point: '의견 접수부터 조치·결과 회신까지 연결' },
    growth: { company: '삼성전자', post: '36332', number: 2, point: '공유 경험에서 가치관과 행동의 변화' },
    personality: { company: 'SK하이닉스', post: '36333', number: 4, point: '실제 반복 행동으로 성향 설명' },
    service: { company: 'ASML', post: '30114', number: 2, point: '상황 확인 후 경위와 대기시간 안내' },
    terms: { company: 'ASML', post: '31334', number: 1, point: '고객이 이해하도록 용어·보고 형식 통일' },
    needs: { company: 'ASML', post: '26039', number: 2, point: '상대 목적에 따라 지원 방식 조정' },
    record: { company: 'TEL', post: '36681', number: 3, point: '원인 확인·복구 뒤 코드 관리 지침 공유' },
    mentor: { company: 'ASML', post: '25064', number: 2, point: '본인 점검과 사수에게 확인한 판단 구분' },
  };
  const q = (id, label, hint, refs) => ({ id, label, hint, refs });
  const themes = {
    expertise: {
      name: '전문성·문제 해결', refs: ['recipe', 'grinder', 'cvd'],
      questions: [
        q('knowledge', '문제를 이해하려고 익힌 지식·자료는?', '배운 내용 중 실제 판단에 쓴 부분을 적어 주세요.', ['recipe', 'cvd']),
        q('evidence', '무엇을 보고 원인이나 방법을 판단했나?', '관찰·측정·기록·비교 결과와 그때의 판단.', ['recipe', 'grinder']),
        q('action', '직접 실행하거나 바꾼 것과 그 이유는?', '조작·제안·관찰·분석 중 직접 한 일을 구분해 주세요.', ['recipe', 'grinder']),
        q('retry', '첫 시도 뒤 무엇이 남았고, 다음에 뭘 확인했나?', '잘된 점과 해결되지 않은 점, 가설을 바꾼 계기.', ['grinder', 'cvd']),
      ],
    },
    teamwork: {
      name: '팀워크', refs: ['teamwork', 'information', 'vendor'],
      questions: [
        q('difference', '사람마다 달랐던 상황·역량·입장은?', '시간 부족, 이해 차이, 업무 부담 등을 어떻게 확인했나요?', ['teamwork', 'vendor']),
        q('proposal', '내가 먼저 요청하거나 제안한 내용은?', '누구에게 무엇을 말했고, 상대는 어떻게 반응했나요?', ['teamwork', 'vendor']),
        q('coordination', '역할·기준·정보 공유를 어떻게 바꿨나?', '변경 전후에 각자 일하는 방식이 어떻게 달라졌나요?', ['teamwork', 'information']),
        q('connection', '내 작업과 팀원의 작업은 어떻게 이어졌나?', '내가 도운 부분, 도움받은 부분, 기다리던 일이 풀린 과정.', ['teamwork', 'information']),
      ],
    },
    challenge: {
      name: '도전·어려움 극복', refs: ['challenge', 'routine'],
      questions: [
        q('motivation', '목표는 누가 정했고, 나는 왜 해보려 했나?', '맡겨진 목표와 스스로 높인 목표를 구분해 주세요.', ['challenge', 'routine']),
        q('setback', '처음 방법은 어디에서 막혔나?', '실패·정체·의욕 저하가 드러난 구체적인 장면.', ['challenge', 'routine']),
        q('change', '무슨 근거로 다음 방법을 바꿨나?', '자료·피드백·기록을 보고 실제로 바꾼 행동.', ['challenge', 'routine']),
        q('persistence', '다시 어려워졌을 때 어떻게 이어갔나?', '시간만 늘렸는지, 연습·점검·도움 요청 방식도 바꿨는지.', ['challenge', 'routine']),
      ],
    },
    improvement: {
      name: '개선·아이디어', refs: ['improvement', 'feedback'],
      questions: [
        q('before', '기존 방식에서 누가 어떤 불편을 겪었나?', '문제를 직접 본 장면과 원래 처리 방식.', ['improvement', 'feedback']),
        q('alternative', '어떤 단서로 대안을 골랐나?', '관찰·의견·자료와 다른 대안의 장단점.', ['improvement', 'feedback']),
        q('implementation', '제안에서 실제 적용까지 무엇을 했나?', '설득·승인·제작·운영 중 어디까지 했는지.', ['improvement', 'feedback']),
        q('test', '어떤 범위에서 효과를 확인했나?', '시험·사용자 반응·실제 운영을 제안서 평가와 구분해 주세요.', ['improvement', 'feedback']),
      ],
    },
    personality: {
      name: '가치관·성장·자기소개', refs: ['growth', 'personality', 'routine'],
      questions: [
        q('value', '나를 설명하는 태도나 습관은?', '성격 단어보다 평소 반복하는 행동으로 적어 주세요.', ['personality', 'routine']),
        q('turning', '그 생각이 생기거나 바뀐 구체적인 계기는?', '이전의 내 모습과 달라진 계기가 된 사건·말.', ['growth', 'routine']),
        q('choice', '그때 나는 무엇을 선택하고 행동했나?', '선택 이유와 행동이 드러나는 장면 하나.', ['growth', 'personality']),
        q('repeat', '이후 다른 상황에서도 반복한 행동은?', '한 번의 성과가 현재의 습관으로 이어진 사례.', ['growth', 'routine']),
      ],
    },
    communication: {
      name: '소통·고객 대응', refs: ['service', 'terms', 'needs', 'vendor'],
      questions: [
        q('need', '상대가 원하거나 이해하지 못한 것은?', '직접 질문하거나 확인해 알게 된 요구·걱정·기대.', ['needs', 'terms']),
        q('mismatch', '처음 설명이나 대응이 통하지 않은 이유는?', '서로 다르게 이해한 용어·기준·상황.', ['terms', 'needs']),
        q('delivery', '설명·자료·안내 순서를 어떻게 바꿨나?', '상대가 판단하거나 행동할 수 있도록 알려준 내용.', ['service', 'terms']),
        q('confirmation', '바로 답할 수 없던 것은 누구에게 확인했나?', '내가 확인한 범위, 담당자에게 물은 내용, 다시 전달한 답.', ['service', 'vendor']),
      ],
    },
  };
  function questionGroups(draft) {
    const theme = themes[draft.theme] || themes.expertise;
    const contextHints = {
      academic: '과제·연구·실무의 목표와 필요한 기준.', work: '맡은 업무·고객 요청·운영상 목표.',
      external: '행사·모임·봉사에서 함께 이루려던 것.', daily: '공부·운동·취미를 시작한 이유와 목표.',
    };
    const groups = [{ id: 'context', title: '상황·역할', questions: [
      q('context', '어떤 활동이었고, 목표는 무엇이었나?', contextHints[draft.activity] || contextHints.academic, theme.refs),
      q('role', '내 역할과 함께한 사람은?', '기간, 맡은 책임, 내가 결정할 수 있었던 범위.', ['teamwork', 'mentor']),
      q('constraint', '당시 제약이나 잘 안 되던 점은?', '시간·자원·경험·상대의 사정 등 실제로 부딪힌 것.', theme.refs),
    ] }, { id: 'action', title: '판단·행동', questions: theme.questions.map(item => ({ ...item, id: draft.theme + '.' + item.id })) }];
    // Nontechnical/personality experiences use the same behavior questions for both tracks.
    if (draft.activity === 'academic' && ['expertise', 'improvement'].includes(draft.theme)) {
      const chip = [
        q('chip.criterion', '맞춰야 할 품질·특성·편차 기준은?', '목표값이 없었다면 비교 기준이나 확인하려던 차이.', ['recipe', 'samsung']),
        q('chip.comparison', '어떤 조건을 고정·변경했고, 선택 근거는?', '조건별 차이와 품질·속도 등 함께 고려한 항목.', ['recipe', 'samsung']),
        q('chip.verification', '선택한 조건이 적합한지 어떻게 검증했나?', '반복·다른 조건·측정으로 확인한 범위와 아직 모르는 점.', ['recipe', 'samsung']),
      ];
      const equipment = [
        q('equipment.state', '장비 동작과 결과 사이에서 확인한 관계는?', '증상·알람·가공 결과와 정상 상태의 기준. 고장이 없었다면 조건별 차이.', ['grinder', 'cvd', 'recipe']),
        q('equipment.sequence', '무엇부터 점검했고, 결과마다 판단이 어떻게 달라졌나?', '점검 순서의 이유와 배제하거나 남긴 원인. 실험이라면 다음 조건을 고른 근거.', ['grinder', 'cvd']),
        q('equipment.recovery', '조치 후 정상 동작·결과를 무엇으로 확인했나?', '재시험·작업 재개·측정 결과. 실제로 확인한 범위만.', ['grinder', 'mentor']),
        q('equipment.handoff', '사수·업체·다음 사용자에게 무엇을 확인·전달했나?', '직접 판단한 부분과 확인받은 부분, 남긴 기록·절차.', ['mentor', 'record']),
      ];
      groups.push({ id: 'track', title: tracks[draft.track] + ' 관점', questions: draft.track === 'equipment' ? equipment : chip });
    }
    const result = [
      q('result', '실제로 확인한 결과는?', '전후 차이·측정값·완성물·상대 반응. 숫자가 없어도 관찰한 내용을 적어 주세요.', theme.refs),
      q('contribution', '내 기여와 다른 사람의 기여를 나누면?', '직접 한 일, 함께한 일, 관찰·제안만 한 일을 구분해 주세요.', ['mentor', 'teamwork']),
      q('after', '이후 바꾼 행동이나 남긴 기록은?', '같은 상황의 재발, 다음 사용자, 다른 활동에 적용한 변화.', ['record', 'routine', 'growth']),
    ];
    if (draft.stage !== 'complete') result.push(q('next', '아직 확인하지 못한 점과 앞으로 할 일은?', '현재까지 한 일과 이후 계획을 나눠 적어 주세요.', ['challenge']));
    groups.push({ id: 'result', title: draft.stage === 'complete' ? '결과·변화' : '현재 결과·다음 할 일', questions: result });
    return groups;
  }
  return { tracks, activities, stages, themes, sources, questionGroups };
});
