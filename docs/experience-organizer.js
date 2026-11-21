(function () {
  'use strict';

  const storageKey = 'skhynix-experience-organizer-v1';
  const activities = {
    academic: '전공·연구·프로젝트',
    work: '알바·인턴·직장',
    external: '동아리·대외활동·봉사',
    daily: '일상·개인 활동',
  };
  const stages = { ongoing: '진행 중', complete: '마친 경험', proposal: '제안·계획 단계' };
  const themes = {
    expertise: {
      name: '직무 전문성',
      steps: ['맡은 일', '판단의 근거', '직접 한 일', '확인한 결과'],
      questions: {
        academic: ['어떤 연구·과제였고, 내가 맡은 부분은 무엇인가?', '어떤 원리·기준과 비교했나? 결과를 보고 무엇을 더 확인하려 했나?', '어떤 조건을 제안하거나 직접 조작·관찰·기록했나? 함께한 일도 적어 주세요.', '직접 확인한 패턴·측정값·차이는 무엇인가? 아직 판단하기 어려운 점은?'],
        work: ['어떤 업무를 맡았고, 익혀야 할 방법이나 기준은 무엇이었나?', '업무에서 이상하거나 더 배워야겠다고 느낀 점은? 무엇을 보고 판단했나?', '직접 확인·수행한 일과 동료나 상사에게 확인받은 부분은?', '업무에서 실제로 확인한 변화나 피드백은 무엇인가?'],
        external: ['활동에서 어떤 일을 맡았고, 필요한 지식이나 기술은 무엇이었나?', '기존에 아는 것만으로 어려웠던 부분은? 어떤 자료·기준을 참고했나?', '새로 익힌 방법을 어디에 직접 적용했나?', '적용한 뒤 무엇을 확인했나? 결과물이나 피드백이 있었나?'],
        daily: ['어떤 것을 배우거나 만들어봤고, 확인하려던 것은 무엇인가?', '어떤 자료나 기준으로 자신의 수준이나 결과를 확인했나?', '배운 내용을 어디에 직접 써봤나?', '실제로 확인한 결과와 아직 더 배워야 할 부분은?'],
      },
      recall: ['처음 배운 내용, 현재 기준, 실제 결과 중 비교할 수 있는 것이 있나요?', '장비를 다룬 일, 관찰한 일, 조건을 제안한 일을 구분해서 떠올려보세요.'],
      sources: [
        { id: '29293', number: 3, title: '공정 실습', text: '배운 공정을 실습하고, 위치별 박막 두께와 공정능력을 확인해 목표 기준과 비교했다.' },
        { id: '32681', number: 3, title: '설비 보전 업무', text: '수리 이력에서 고장 횟수를 파악하고, 부품 수급과 수리 비용에 관한 방안을 기획했다.' },
      ],
    },
    teamwork: {
      name: '팀워크',
      steps: ['공동 목표', '상대의 상황', '협업 방식 변경', '함께한 결과'],
      questions: {
        academic: ['팀이 완성하려던 것은 무엇이고, 나와 팀원은 각각 어떤 일을 맡았나?', '팀원이 참여하기 어렵거나 일이 기다려진 이유는 무엇이었나?', '역할·기록·논의 방식을 어떻게 제안하거나 조정했나?', '제안 뒤 팀원들이 어떻게 일했고, 공동 작업은 어디까지 진행됐나?'],
        work: ['동료·다른 교대조·고객과 함께 처리해야 했던 일과 내 역할은?', '동료가 바로 처리하기 어려웠던 사정이나 전달되지 않은 정보는 무엇이었나?', '업무 인계·분담·확인 기준을 어떻게 맞췄나? 상대에게 어떤 도움을 요청했나?', '상대방은 어떻게 대응했고, 업무나 고객 응대는 어디까지 마무리됐나?'],
        external: ['함께 하려던 행사·운영·봉사와 내가 맡은 일은 무엇인가?', '팀원·참여자마다 시간·경험·입장이 어떻게 달랐나?', '참여 방식·역할·공유 자료를 어떻게 제안하거나 바꿨나?', '그 뒤 다른 사람들이 어떻게 참여했고, 함께 이룬 일은 무엇인가?'],
        daily: ['누구와 무엇을 함께하려 했고, 나는 어떤 역할이었나?', '각자가 어려워하거나 다르게 생각한 부분은 무엇이었나?', '함께 진행할 수 있도록 직접 요청·조정·공유한 것은?', '상대방의 반응과 실제로 함께 마친 일은?'],
      },
      recall: ['상대에게 사정을 물어본 적이 있나요? 확인한 말이나 상황을 적어보세요.', '내 제안 뒤 상대가 한 일을 떠올려보세요. 의견 차이가 없던 경험도 괜찮아요.'],
      sources: [
        { id: '33864', number: 2, title: '논문 작성', text: '취업 준비로 시간이 부족한 팀원들을 고려해, 추가 실험·그래프·개략도 작업을 나누었다.' },
        { id: '35319', number: 2, title: '동아리 운영', text: '인원 부족에 대응해 홍보하고, 차기 운영진에게 절차·예산·회의 기록을 남겼다.' },
        { id: '32681', number: 4, title: '협력업체 대응', text: '업체의 문의를 취합해 안전 담당 부서에 확인하고, 답을 공유해 수리 작업 재개를 도왔다.' },
      ],
    },
    challenge: {
      name: '도전·목표 달성',
      steps: ['내가 세운 목표', '첫 시도의 한계', '바꾼 방법', '도달한 수준'],
      questions: {
        academic: ['직접 세운 연구·과제 목표는 무엇이고, 왜 해보려 했나?', '처음 방식으로 해보니 어디에서 막혔나?', '무엇을 보고 다음 실험·설계·학습 방법을 바꿨나? 직접 바꾼 부분은?', '본래 목표와 비교해 어디까지 도달했나? 미완료된 부분도 적어 주세요.'],
        work: ['맡은 업무에서 스스로 더 해보려던 목표와 그 이유는?', '처음 시도할 때 어떤 제약이나 어려움이 있었나?', '다음 시도에서 확인·준비·처리 방법을 어떻게 바꿨나?', '목표 대비 실제로 처리하거나 확인한 범위는? 남은 부분은?'],
        external: ['활동·대회·행사에서 직접 정한 목표와 그 이유는?', '첫 준비나 시도가 기대대로 되지 않은 지점은?', '그 뒤 준비·연습·운영 방식을 무엇 때문에 어떻게 바꿨나?', '활동 결과가 원래 목표에 어디까지 도달했나?'],
        daily: ['도전하려던 공부·운동·취미 목표와 개인적인 이유는?', '처음 연습이나 시도에서 반복해서 막힌 부분은?', '그걸 알아차린 뒤 연습·학습·점검 방법을 어떻게 바꿨나?', '현재 수준이나 기록은 목표와 어떻게 다른가?'],
      },
      recall: ['목표를 누가 정했는지, 자신이 더 해보고 싶었던 부분이 있는지 떠올려보세요.', '같은 방식으로 시간을 늘렸나요, 방법도 바꿨나요? 실제로 한 것만 적어 주세요.'],
      sources: [
        { id: '33390', number: 1, title: '통역병 시험 준비', text: '첫 시험에서 떨어진 뒤, 기사 통역 녹음과 모의시험으로 준비 방식을 바꾸고 시험에 통과했다.' },
        { id: '25576', number: 1, title: '태양전지 연구', text: '실험 조건을 바꿔 확인한 효율을 제시하면서, 처음 목표에는 미치지 못했다는 점도 밝혔다.' },
      ],
    },
    improvement: {
      name: '개선·아이디어',
      steps: ['기존의 불편', '변경 이유', '직접 실행', '효과 확인'],
      questions: {
        academic: ['기존 설계·실험·제작 방식의 불편이나 한계는?', '왜 그 대안이나 조건을 선택했나? 비교한 장단점은?', '직접 제안·설계·구현한 것과 다른 사람이 맡은 부분은?', '실험·계산·사용자 확인 중 무엇으로 효과를 확인했나?'],
        work: ['기존 주문·정리·재고·고객 응대에서 직접 본 불편은?', '어떤 방식을 제안했고, 그게 이 상황에 맞는다고 본 이유는?', '동료나 담당자와 상의한 뒤 직접 바꾸거나 실행한 부분은?', '고객·동료의 반응이나 운영 결과를 실제로 확인했나? 어디까지인가?'],
        external: ['기존 홍보·신청·행사·운영 방식에서 무엇이 불편했나?', '참여자 의견이나 조사에서 어떤 단서를 얻어 새 방식을 골랐나?', '직접 제안하거나 운영에 반영한 것은 무엇인가?', '실제 참여·사용 반응을 봤나, 기획안 평가까지 받았나?'],
        daily: ['일상에서 반복되던 불편과 원래 해결 방식은?', '왜 그 방법으로 바꾸려 했나? 다른 대안과 비교했나?', '직접 만들거나 바꿔 써본 것은 무엇인가?', '사용 뒤 편의나 결과가 어떻게 달랐나? 아직 모르는 점은?'],
      },
      recall: ['기존 방식을 계속 쓰기 어려웠던 구체적인 장면을 떠올려보세요.', '제안·도입·효과 확인 중 어디까지 했나요? 수치가 없으면 관찰한 반응을 적어도 돼요.'],
      sources: [
        { id: '26607', number: 2, title: '영화제 기획', text: '대학생 설문에서 얻은 단서를 행사 구성에 반영하고, 실제 관객 수 변화를 서술했다.' },
        { id: '25576', number: 2, title: '매장 운영', text: '매장 위치의 약점을 보완하려 홍보·판매·대관 방식을 실행하고 매출 변화를 제시했다.' },
        { id: '28480', number: 2, title: '도어락 제작', text: '누구나 쓰기 쉬운 안내 방식을 구현한 뒤, 기존 방식과 비교하는 사용자 설문을 진행했다.' },
      ],
    },
    personality: {
      name: '자유 자기소개',
      steps: ['나를 설명하는 말', '실제 장면', '반복하는 행동', '반응과 의미'],
      questions: {
        academic: ['수업·팀 과제에서 평소 어떤 식으로 행동하는 사람인가?', '그 성향이 드러났던 장면 하나는?', '그때 직접 한 행동은? 비슷한 상황에서 반복해 온 습관도 있나?', '그 행동에 대한 반응이나 본인이 중요하게 생각하는 이유는?'],
        work: ['알바·직장에서 평소 어떤 식으로 일하는 사람인가?', '그 모습이 드러난 근무·교대·고객 응대 장면은?', '직접 관찰·기록·응대한 것과 반복해 온 행동은?', '동료·고객의 실제 반응이나 그 습관을 지키는 이유는?'],
        external: ['모임·행사·봉사에서 나는 어떤 사람인가?', '그걸 보여주는 참여자·팀원과의 장면 하나는?', '그때 직접 도운 일이나 계속해 온 습관은?', '주변 사람의 반응과 나에게 그 행동이 중요한 이유는?'],
        daily: ['평소 자신을 설명할 수 있는 행동이나 습관은?', '최근 일상·취미·공부에서 그 모습이 나타난 장면은?', '그 상황에서 직접 한 일과 반복해 온 행동은?', '그 행동이 자신에게 어떤 의미이고, 주변 반응이 있었나?'],
      },
      recall: ['성격 단어 대신 최근 실제로 했던 행동 하나를 떠올려보세요.', '큰 성과가 없어도 괜찮아요. 남이 한 말과 자신이 느낀 점을 구분해 적어 주세요.'],
      sources: [
        { id: '36019', number: 4, title: '편의점 근무', text: '날씨와 시험 기간에 따른 판매 흐름을 관찰해 발주를 제안하는 행동으로 관찰력을 설명했다.' },
        { id: '36333', number: 4, title: '러닝 모임', text: '함께 운동 기록과 응원을 공유하는 모임을 운영한 장면으로 함께 성장하려는 성향을 설명했다.' },
      ],
    },
  };

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function createDraft() {
    return {
      id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2),
      title: '', theme: 'expertise', activity: 'academic', stage: 'ongoing',
      notes: ['', '', '', ''], next: '',
    };
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey));
      if (parsed?.version === 1 && Array.isArray(parsed.drafts)) {
        const drafts = parsed.drafts.filter(draft =>
          typeof draft.id === 'string' && typeof draft.title === 'string' &&
          Object.hasOwn(themes, draft.theme) && Object.hasOwn(activities, draft.activity) &&
          Object.hasOwn(stages, draft.stage) && Array.isArray(draft.notes) &&
          draft.notes.length === 4 && draft.notes.every(note => typeof note === 'string') &&
          typeof draft.next === 'string');
        const ids = new Set();
        const unique = drafts.filter(draft => !ids.has(draft.id) && ids.add(draft.id));
        if (unique.length) {
          return { version: 1, active: unique.some(draft => draft.id === parsed.active) ? parsed.active : unique[0].id, drafts: unique };
        }
      }
    } catch (_) {
      // The form also works in memory when browser storage is unavailable.
    }
    const draft = createDraft();
    return { version: 1, active: draft.id, drafts: [draft] };
  }

  function mount(root) {
    if (root.dataset.mounted) return;
    root.dataset.mounted = 'true';
    const state = readState();
    const field = name => root.querySelector('[data-organizer="' + name + '"]');
    const current = () => state.drafts.find(draft => draft.id === state.active);
    const options = values => Object.entries(values).map(([value, text]) =>
      '<option value="' + escape(value) + '">' + escape(text) + '</option>').join('');
    let copyVersion = 0;

    root.innerHTML = `<summary>자소서용 경험 정리 <span>SK하이닉스 양산기술</span></summary>
      <div class="library-guide-body">
        <div class="organizer-drafts" data-organizer="drafts-row"><label>저장한 경험<select data-organizer="draft" aria-label="저장한 경험"></select></label></div>
        <div class="organizer-title-row"><label class="organizer-title">경험 이름<input data-organizer="title" placeholder="예: PBL 제작, 카페 근무"></label>
          <button type="button" data-organizer="new">새 경험</button></div>
        <div class="organizer-options">
          <label>문항<select data-organizer="theme">${options(Object.fromEntries(Object.entries(themes).map(([key, value]) => [key, value.name])))}</select></label>
          <label>활동<select data-organizer="activity">${options(activities)}</select></label>
          <label>진행 단계<select data-organizer="stage">${options(stages)}</select></label>
        </div>
        <details class="library-guide-example"><summary>합격 사례와 질문의 근거</summary>
          <p data-organizer="steps"></p><div data-organizer="sources"></div>
        </details>
        <div class="library-guide-prompts">
          ${[0, 1, 2, 3].map(index => `<div class="organizer-prompt">
            <label for="organizer-note-${index}" data-organizer="label-${index}"></label>
            <textarea id="organizer-note-${index}" data-note="${index}" rows="3"></textarea>
          </div>`).join('')}
        </div>
        <details class="organizer-recall"><summary>기억이 잘 안 날 때</summary><ul data-organizer="recall"></ul></details>
        <label class="organizer-next" data-organizer="next-label">앞으로 할 일<textarea data-organizer="next" rows="2"></textarea></label>
        <div class="organizer-actions"><button type="button" data-organizer="preview">순서대로 정리하기</button>
          <button type="button" data-organizer="copy">정리본 복사</button></div>
        <p class="organizer-save" data-organizer="save" role="status">이 브라우저에 저장돼요.</p>
        <p data-organizer="status" role="status"></p>
        <section data-organizer="result" class="organizer-result" aria-label="경험 정리본" hidden></section>
        <textarea data-organizer="fallback" aria-label="직접 복사할 경험 정리본" rows="8" readonly hidden></textarea>
      </div>`;

    function save() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
        field('save').textContent = '이 브라우저에 저장했어요.';
      } catch (_) {
        field('save').textContent = '브라우저에 저장하지 못했어요. 정리본을 복사해 보관해 주세요.';
      }
    }

    function renderDrafts() {
      field('drafts-row').hidden = state.drafts.length === 1;
      field('draft').innerHTML = state.drafts.map((draft, index) =>
        '<option value="' + escape(draft.id) + '">' + escape(draft.title.trim() || '이름 없는 경험 ' + (index + 1)) + '</option>').join('');
      field('draft').value = state.active;
    }

    function labels(draft) {
      const questions = [...themes[draft.theme].questions[draft.activity]];
      if (draft.stage === 'proposal') {
        questions[2] = '직접 완료한 준비·조사·제안은 무엇인가? 함께 준비한 부분도 적어 주세요.';
        questions[3] = '제안·준비에 대해 실제로 받은 반응이나 확인한 내용은? 아직 미확인이면 그대로 적어 주세요.';
      } else if (draft.stage === 'ongoing') {
        questions[3] += ' 현재까지 확인한 범위만 적어 주세요.';
      }
      return questions;
    }

    function outline() {
      const draft = current();
      const questions = labels(draft);
      const sections = draft.notes.map((note, index) => ({
        heading: themes[draft.theme].steps[index],
        text: note.trim() || '미작성 · ' + questions[index],
        missing: !note.trim(),
      }));
      if (draft.stage === 'proposal') sections[2].heading = '완료한 준비·제안';
      if (draft.stage !== 'complete') sections[3].heading = '현재까지 확인한 내용';
      return sections;
    }

    function renderResult() {
      const draft = current();
      const sections = outline();
      field('result').innerHTML = '<h3>' + escape(draft.title.trim() || '경험 정리본') + '</h3>' +
        '<p>' + escape(themes[draft.theme].name + ' · ' + activities[draft.activity] + ' · ' + stages[draft.stage]) + '</p>' +
        sections.map(section => '<section><h4>' + escape(section.heading) + '</h4><p' +
          (section.missing ? ' class="organizer-missing"' : '') + '>' + escape(section.text) + '</p></section>').join('') +
        (draft.stage !== 'complete' && draft.next.trim() ? '<section><h4>앞으로 할 일</h4><p>' + escape(draft.next.trim()) + '</p></section>' : '');
    }

    function refresh() {
      const draft = current();
      const theme = themes[draft.theme];
      renderDrafts();
      for (const name of ['title', 'theme', 'activity', 'stage', 'next']) field(name).value = draft[name];
      labels(draft).forEach((label, index) => {
        field('label-' + index).textContent = label;
        const input = root.querySelector('[data-note="' + index + '"]');
        input.value = draft.notes[index];
      });
      field('steps').textContent = '합격 사례를 바탕으로 구성한 정리 순서 · ' + theme.steps.join(' → ');
      field('sources').innerHTML = theme.sources.map(source =>
        '<p><a href="https://www.linkareer.com/cover-letter/' + source.id + '" target="_blank" rel="noopener noreferrer">' +
        escape(source.title) + ' · 문항 ' + source.number + '</a><br>' + escape(source.text) + '</p>').join('');
      const recall = [...theme.recall];
      if (draft.stage !== 'complete') recall.push('한 일·관찰한 결과와 앞으로 할 일을 나눠 적어 주세요. 원인이 확실하지 않으면 본 모습까지 적어도 돼요.');
      field('recall').innerHTML = recall.map(text => '<li>' + escape(text) + '</li>').join('');
      field('next-label').hidden = draft.stage === 'complete';
      field('result').hidden = true;
      field('fallback').hidden = true;
      field('status').textContent = '';
      copyVersion += 1;
    }

    root.addEventListener('input', event => {
      const draft = current();
      if (event.target.matches('[data-note]')) {
        draft.notes[Number(event.target.dataset.note)] = event.target.value;
      } else if (event.target === field('title')) {
        draft.title = event.target.value;
        renderDrafts();
      } else if (event.target === field('next')) {
        draft.next = event.target.value;
      } else {
        return;
      }
      copyVersion += 1;
      field('fallback').hidden = true;
      field('status').textContent = '';
      save();
      if (!field('result').hidden) renderResult();
    });

    root.addEventListener('change', event => {
      const name = event.target.dataset.organizer;
      if (name === 'draft') {
        state.active = event.target.value;
      } else if (['theme', 'activity', 'stage'].includes(name)) {
        current()[name] = event.target.value;
      } else {
        return;
      }
      refresh();
      save();
    });

    field('new').addEventListener('click', () => {
      const draft = createDraft();
      state.drafts.push(draft);
      state.active = draft.id;
      refresh();
      save();
      field('title').focus();
    });

    function hasNotes() {
      if (current().notes.some(note => note.trim())) return true;
      field('status').textContent = '기억나는 내용을 한 줄 이상 적어 주세요.';
      root.querySelector('[data-note="0"]').focus();
      return false;
    }

    field('preview').addEventListener('click', () => {
      if (!hasNotes()) return;
      renderResult();
      field('result').hidden = false;
    });
    field('copy').addEventListener('click', async () => {
      if (!hasNotes()) return;
      renderResult();
      field('result').hidden = false;
      const draft = current();
      const content = [draft.title.trim() || '경험 정리본',
        'SK하이닉스 양산기술 · ' + themes[draft.theme].name + ' · ' + activities[draft.activity] + ' · ' + stages[draft.stage],
        ...outline().map(section => section.heading + '\n' + section.text)];
      if (draft.stage !== 'complete' && draft.next.trim()) content.push('앞으로 할 일\n' + draft.next.trim());
      const text = content.join('\n\n');
      const request = ++copyVersion;
      let timer;
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => { timer = setTimeout(reject, 1500); }),
        ]);
        if (request === copyVersion) field('status').textContent = '경험 정리본을 복사했어요.';
      } catch (_) {
        if (request !== copyVersion) return;
        field('fallback').value = text;
        field('fallback').hidden = false;
        field('fallback').focus();
        field('fallback').select();
        field('status').textContent = '선택된 내용을 직접 복사해 주세요.';
      } finally {
        clearTimeout(timer);
      }
    });
    refresh();
  }

  window.ExperienceOrganizer = { mount };
})();
