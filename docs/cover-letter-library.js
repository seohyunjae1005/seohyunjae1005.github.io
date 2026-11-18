(function () {
  'use strict';

  const companies = {
    skhynix: { name: 'SK하이닉스', path: 'skhynix-yangsan.json', allRoles: '양산기술 계열 전체' },
    samsung: { name: '삼성전자', path: 'samsung-process.json', allRoles: '공정 계열 전체' },
    asml: { name: 'ASML', path: 'asml-service.json', allRoles: '서비스 직무 전체' },
    kla: { name: 'KLA', path: 'kla-service.json', allRoles: '전체 직무' },
    amat: { name: 'Applied Materials', path: 'amat-service.json', allRoles: 'CE 계열 전체' },
    tel: { name: '도쿄일렉트론(TEL)', path: 'tel-service.json', allRoles: '전체 직무' },
    lam: { name: 'Lam Research', path: 'lam-service.json', allRoles: '서비스 직무 전체' },
    hyundai: { name: '현대자동차', paths: ['hyundai-quality.json', 'hyundai-production.json'], allRoles: '전체 직무' },
    hanwha: { name: '한화에어로스페이스', paths: ['hanwha-quality.json', 'hanwha-production.json'], allRoles: '전체 직무' },
    lig: { name: 'LIG넥스원', paths: ['lig-production.json'], allRoles: '전체 직무' },
  };
  const datasets = new Map();
  const selected = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const panel = () => document.querySelector('#library-chapter');
  const field = id => panel().querySelector(`#library-${id}`);
  let records = [];
  let initialized = false;
  let companyRequest = 0;
  let copyRequest = 0;

  const experienceFlows = [
    {
      id: 'anomaly',
      title: '예상과 다른 결과에서 시작',
      fit: '이상한 결과를 보고 원인을 좁혔거나, 확인 방법을 바꿔본 경험',
      example: '처음에는 식각 포화 시점을 6~7초로 봤다. 5초 조건의 값이 흔들려 측정 지점 수를 의심했다. 지점을 늘려 다시 측정해 5초로 판단을 바꾸고, 공정시간을 150초 줄였다고 썼다.',
      url: 'https://linkareer.com/cover-letter/33865',
      prompts: ['처음 결과에서 무엇이 예상이나 기준과 달랐나?', '어떤 단서를 보고 어디부터 확인하기로 했나?', '내가 직접 다시 측정하거나 비교·변경한 것은 무엇인가?', '그 뒤 무엇을 확인했고, 적용이나 제안은 어디까지 했나?'],
    },
    {
      id: 'criteria',
      title: '맞춰야 할 기준에서 시작',
      fit: '지켜야 할 기준이 있었고, 조건이나 대안을 비교해 선택한 경험',
      example: '연삭에서 목표 두께와 총 두께 편차 1㎛ 이하를 함께 맞춰야 했다. 조건별 측정값을 비교해 회전 속도와 시간을 조정했고, 목표 두께와 총 두께 편차 0.7㎛를 충족한 조건을 레시피로 정리했다.',
      url: 'https://www.linkareer.com/cover-letter/36333',
      prompts: ['어떤 결과를 만들어야 했고, 함께 지켜야 할 기준은 무엇이었나?', '어떤 조건이나 대안을 비교했고, 내가 맡은 일은 무엇이었나?', '어떤 관찰이나 비교 결과로 그 조건을 골랐나?', '선택한 조건은 기준을 어디까지 충족했나?'],
    },
    {
      id: 'learning',
      title: '배운 내용을 적용한 경험',
      fit: '수업이나 실습에서 배운 원리를 직접 확인한 경험',
      example: '유기화학 지식으로 감광재가 빛에 반응하는 원리를 공부했다. 패터닝 실습에서 장비를 조작하고, 노광·현상 시간에 따라 패턴 치수가 어떻게 달라지는지 확인했다.',
      url: 'https://www.linkareer.com/cover-letter/35621',
      prompts: ['어떤 원리나 기술을 배웠나?', '그 지식을 어떤 실습이나 과제에서 활용했나?', '직접 다룬 조건이나 확인한 결과는 무엇인가?', '실습 뒤 그 원리를 어떻게 이해하게 됐나?'],
    },
  ];

  function renderExperienceGuide() {
    return `<details id="library-experience-guide" class="library-experience-guide">
      <summary>자소서용 경험 정리 <span>SK하이닉스 양산기술 · 전문성</span></summary>
      <div class="library-guide-body">
        <label for="library-guide-flow">내 경험과 가까운 전개 고르기</label>
        <select id="library-guide-flow">${experienceFlows.map(flow => `<option value="${flow.id}">${flow.title}</option>`).join('')}</select>
        ${experienceFlows.map((flow, index) => `<section data-experience-flow="${flow.id}"${index ? ' hidden' : ''}>
          <p>${flow.fit}</p>
          <details class="library-guide-example"><summary>합격 사례의 전개 보기</summary>
            <p>${flow.example}</p><a href="${flow.url}" target="_blank" rel="noopener noreferrer">자소서 원문 ↗</a>
          </details>
          <div class="library-guide-prompts">${flow.prompts.map(prompt => `<label>${prompt}<textarea rows="2"></textarea></label>`).join('')}</div>
        </section>`).join('')}
        <button type="button" id="library-guide-copy">경험 정리본 복사</button>
        <p id="library-guide-status" role="status"></p>
        <textarea id="library-guide-fallback" aria-label="직접 복사할 경험 정리본" rows="6" readonly hidden></textarea>
      </div>
    </details>`;
  }

  function bindExperienceGuide() {
    const selector = field('guide-flow');
    const status = field('guide-status');
    const fallback = field('guide-fallback');
    const active = () => field('experience-guide').querySelector('[data-experience-flow]:not([hidden])');
    selector.addEventListener('change', () => {
      for (const section of field('experience-guide').querySelectorAll('[data-experience-flow]')) {
        section.hidden = section.dataset.experienceFlow !== selector.value;
      }
      fallback.hidden = true;
      status.textContent = '';
    });
    field('guide-copy').addEventListener('click', async () => {
      const flow = experienceFlows.find(item => item.id === selector.value);
      const notes = [...active().querySelectorAll('textarea')].flatMap((input, index) => {
        const answer = input.value.trim();
        return answer ? [`${flow.prompts[index]}\n${answer}`] : [];
      });
      fallback.hidden = true;
      if (!notes.length) {
        status.textContent = '경험을 한 줄 이상 적어 주세요.';
        active().querySelector('textarea').focus();
        return;
      }
      const content = ['SK하이닉스 양산기술 · 직무 전문성', flow.title, ...notes].join('\n\n');
      let timer;
      try {
        await Promise.race([
          navigator.clipboard.writeText(content),
          new Promise((_, reject) => { timer = setTimeout(reject, 1500); }),
        ]);
        if (selector.value !== flow.id) return;
        status.textContent = '경험 정리본을 복사했어요.';
      } catch (_) {
        if (selector.value !== flow.id) return;
        fallback.value = content;
        fallback.hidden = false;
        fallback.select();
        status.textContent = '선택된 내용을 직접 복사해 주세요.';
      } finally {
        clearTimeout(timer);
      }
    });
  }

  function roleFilter(companyId, role) {
    if (companyId === 'skhynix') return /p\s*&\s*t|package/i.test(role) ? '양산기술(P&T)' : '양산기술';
    return role === '미확인' ? '직무 미확인' : role;
  }

  function buildRecords(companyId, dataset) {
    const groups = [...dataset.groups].sort((a, b) => b.year - a.year || Number(b.season === '하반기') - Number(a.season === '하반기'));
    const periodCounts = new Map();
    return groups.flatMap(group => group.essays.map(essay => {
      const period = group.year ? `${group.year} ${group.season}` : '시즌 미확인';
      const number = (periodCounts.get(period) || 0) + 1;
      periodCounts.set(period, number);
      const answers = new Map(essay.answers.map(answer => [answer.number, answer.text]));
      const questions = group.questions.filter(question => answers.has(question.number))
        .map(question => ({
          ...question, answer: answers.get(question.number), note: essay.questionNotes?.[question.number],
        }));
      const role = essay.details?.originalRole || group.role;
      const search = [group.category, role, ...essayMetadata(essay),
        ...questions.map(question => `${question.text}\n${question.answer}`)].join('\n').toLocaleLowerCase();
      const publishedYear = Number(/^\d{4}(?=-)/.exec(essay.publishedAt)?.[0]);
      return {
        id: `${companyId}:${group.category || ''}:${essay.id}`, company: dataset.company, role,
        roleFilter: group.category || roleFilter(companyId, group.role), period, number, employment: group.employment,
        dateConflict: publishedYear < group.year, essay, questions, search,
      };
    }));
  }

  function loadRecords(companyId) {
    if (!datasets.has(companyId)) {
      const company = companies[companyId];
      const paths = company.paths || [company.path];
      const promise = Promise.all(paths.map(async path => {
        const response = await fetch(`library/${path}?v=20261111-1`);
        if (!response.ok) throw new Error('자료를 불러오지 못했습니다.');
        return response.json();
      }))
        .then(data => buildRecords(companyId, { company: company.name, groups: data.flatMap(dataset => dataset.groups) }))
        .catch(error => {
          datasets.delete(companyId);
          throw error;
        });
      datasets.set(companyId, promise);
    }
    return datasets.get(companyId);
  }

  function options(values) {
    return values.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
  }

  async function showCompany() {
    const request = ++companyRequest;
    const companyId = field('company').value;
    field('experience-guide').hidden = companyId !== 'skhynix';
    const previousPeriod = field('period').value;
    const list = field('essays');
    for (const key of ['role', 'period', 'search']) field(key).disabled = true;
    field('summary').textContent = '';
    list.innerHTML = '<p class="library-empty">자료를 불러오는 중…</p>';
    try {
      const loaded = await loadRecords(companyId);
      if (request !== companyRequest) return;
      records = loaded;
      const roles = [...new Set(records.map(record => record.roleFilter))]
        .sort((a, b) => (a === '직무 미확인') - (b === '직무 미확인') || a.localeCompare(b, 'ko'));
      field('role').innerHTML = `<option value="">${companies[companyId].allRoles}</option>${options(roles)}`;
      showPeriods(records, previousPeriod, true);
      for (const key of ['role', 'period', 'search']) field(key).disabled = false;
      renderList();
    } catch (_) {
      if (request !== companyRequest) return;
      list.innerHTML = '<p class="library-empty">자료를 불러오지 못했습니다. <button type="button" data-library-retry>다시 불러오기</button></p>';
    }
  }

  function showPeriods(entries, preferred, keepAll) {
    const periods = [...new Set(entries.map(record => record.period))];
    field('period').innerHTML = `<option value="">전체 시즌</option>${options(periods)}`;
    field('period').value = (keepAll && preferred === '') || periods.includes(preferred) ? preferred : periods[0] || '';
  }

  function essayMetadata(essay) {
    if (!essay.details) return [];
    const { originalCompany, duties, organization, site } = essay.details;
    return [['원문 회사명', originalCompany], ['세부 업무', duties], ['사업부·조직', organization], ['사업장', site]]
      .filter(([, value]) => value && value !== '미확인')
      .map(([label, value]) => `${label}: ${value}`);
  }

  function renderEssay(record, isOpen) {
    const { id, role, period, number, employment, essay, questions, dateConflict } = record;
    const coverage = essay.details?.status === '전문 수집' ? '' : essay.details?.status;
    const stage = essay.details && essay.stage === '미확인' ? '합격 단계 미확인' : essay.stage;
    const meta = [stage, employment, coverage, `문항 ${questions.length}개`].filter(value => value && value !== '미확인');
    const details = [
      ...essayMetadata(essay),
      essay.publishedAt && !['None', '미확인'].includes(essay.publishedAt) ? `게시일 ${essay.publishedAt.slice(0, 10)}` : '',
      dateConflict ? '게시일이 수집 자료의 채용 연도보다 앞섭니다. 시즌은 원문에서 확인해 주세요.' : '',
    ].filter(Boolean).join(' · ');
    return `<details class="library-essay" data-library-essay="${escape(id)}"${isOpen ? ' open' : ''}>
      <summary><span class="library-essay-heading"><input type="checkbox" class="library-essay-check" data-library-select aria-label="${escape(period)} 지원자 ${number} 복사 선택"${selected.has(id) ? ' checked' : ''}> <strong>지원자 ${number}</strong> <span>${escape(role === '미확인' ? '직무 미확인' : role)}</span></span>
        <span class="library-essay-meta">${escape([period, ...meta].join(' · '))}${dateConflict ? ' <span class="library-season-note">시즌 확인 필요</span>' : ''}</span></summary>
      <div class="library-essay-body">
        <div class="library-essay-actions">
          <button type="button" data-library-copy-essay>전체 복사</button>
          <a href="${escape(essay.url)}" target="_blank" rel="noopener noreferrer">${escape(essay.source)} 원문 ↗</a>
        </div>
        <p class="library-copy-feedback" role="status"></p>
        ${details ? `<p class="library-note">${escape(details)}</p>` : ''}
        ${questions.map(question => `<section class="library-question">
          <h4><span>문항 ${question.number}</span> ${escape(question.text)}</h4>
          ${question.limit && question.limit !== '미확인' ? `<p class="library-note">${escape(question.limit)}</p>` : ''}
          ${question.note ? `<p class="library-note">${escape(question.note)}</p>` : ''}
          <p class="library-answer-text">${escape(question.answer)}</p>
        </section>`).join('')}
      </div>
    </details>`;
  }

  function renderList() {
    const role = field('role').value;
    const period = field('period').value;
    const terms = field('search').value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const shown = records.filter(record => (!role || role === record.roleFilter) && (!period || period === record.period) &&
      terms.every(term => record.search.includes(term)));
    const list = field('essays');
    const openIds = new Set([...list.querySelectorAll('details[open]')].map(essay => essay.dataset.libraryEssay));
    field('summary').textContent = `자소서 ${shown.length}편`;
    list.innerHTML = shown.map(record => renderEssay(record, openIds.has(record.id))).join('') ||
      '<p class="library-empty">조건에 맞는 자소서가 없습니다.</p>';
  }

  function updateSelection() {
    field('copy').textContent = `선택한 자소서 복사 (${selected.size})`;
    field('copy').disabled = selected.size === 0;
    field('copy').hidden = selected.size === 0;
    field('clear').hidden = selected.size === 0;
  }

  function essayText(record) {
    const { company, role, period, number, employment, essay, questions, dateConflict } = record;
    const content = questions.map(question => {
      const limit = question.limit && question.limit !== '미확인' ? ` (${question.limit})` : '';
      return [`문항 ${question.number}${limit}`, question.note, question.text, '', question.answer]
        .filter(line => line !== undefined).join('\n');
    });
    return [
      `${company} / ${role === '미확인' ? '직무 미확인' : role} / ${period} / 지원자 ${number}`,
      `채용 구분 ${employment} · 출처의 합격 단계 ${essay.stage}`,
      essayMetadata(essay).join(' · '),
      essay.details?.status && essay.details.status !== '전문 수집' ? `수집 상태: ${essay.details.status}` : '',
      dateConflict ? `시즌 확인 필요: 게시일 ${essay.publishedAt.slice(0, 10)}` : '',
      ...content,
      `출처 ${essay.source}: ${essay.url}`,
    ].filter(Boolean).join('\n\n');
  }

  async function copyEssays(items, status = field('copy-status')) {
    if (!items.length) return;
    const request = ++copyRequest;
    const text = items.map(essayText).join('\n\n────────────\n\n');
    const fallback = field('copy-fallback');
    fallback.hidden = true;
    fallback.value = '';
    field('copy-status').textContent = '';
    status.textContent = '';
    let timer;
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => { timer = setTimeout(reject, 1500); }),
      ]);
      if (request === copyRequest) {
        status.textContent = `자소서 ${items.length}편 복사 완료`;
        if (status === field('copy-status')) {
          setTimeout(() => { if (request === copyRequest) status.textContent = ''; }, 2400);
        }
      }
    } catch (_) {
      if (request !== copyRequest) return;
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      field('copy-status').textContent = '아래 내용을 직접 복사해 주세요.';
    } finally {
      clearTimeout(timer);
    }
  }

  function open() {
    if (initialized) return;
    initialized = true;
    panel().innerHTML = `<header class="library-heading"><h2>합격 자소서</h2></header>
      ${renderExperienceGuide()}
      <div class="library-filters">
        <label>회사<select id="library-company">${Object.entries(companies).map(([id, company]) => `<option value="${id}">${company.name}</option>`).join('')}</select></label>
        <label>직무<select id="library-role"></select></label>
        <label>연도·시즌<select id="library-period"></select></label>
        <label>검색<input id="library-search" type="search" placeholder="예: 팀워크, 공정 개선"></label>
      </div>
      <div class="library-toolbar">
        <p id="library-summary" aria-live="polite"></p>
        <div class="library-toolbar-actions"><button type="button" id="library-copy" disabled hidden>선택한 자소서 복사 (0)</button>
        <button type="button" id="library-clear" hidden>선택 해제</button></div>
      </div>
      <p id="library-copy-status" role="status"></p>
      <textarea id="library-copy-fallback" aria-label="직접 복사할 내용" rows="8" readonly hidden></textarea>
      <section id="library-essays" aria-label="지원자별 자소서"></section>`;
    field('company').addEventListener('change', showCompany);
    bindExperienceGuide();
    field('role').addEventListener('change', () => {
      if (companies[field('company').value].paths) {
        const role = field('role').value;
        showPeriods(records.filter(record => !role || role === record.roleFilter), field('period').value, true);
      }
      renderList();
    });
    field('period').addEventListener('change', renderList);
    field('search').addEventListener('input', renderList);
    field('copy').addEventListener('click', () => copyEssays([...selected.values()]));
    field('clear').addEventListener('click', () => {
      selected.clear();
      copyRequest += 1;
      field('copy-fallback').hidden = true;
      field('copy-status').textContent = '';
      updateSelection();
      if (!field('period').disabled) renderList();
    });
    field('essays').addEventListener('change', event => {
      if (!event.target.matches('[data-library-select]')) return;
      const id = event.target.closest('[data-library-essay]').dataset.libraryEssay;
      if (event.target.checked) selected.set(id, records.find(record => record.id === id));
      else selected.delete(id);
      updateSelection();
      if (selected.size) copyEssays([...selected.values()]);
      else {
        copyRequest += 1;
        field('copy-status').textContent = '';
        field('copy-fallback').hidden = true;
      }
    });
    field('essays').addEventListener('click', event => {
      if (event.target.matches('[data-library-select]')) {
        event.stopPropagation();
      } else if (event.target.closest('[data-library-retry]')) {
        showCompany();
      } else if (event.target.closest('[data-library-copy-essay]')) {
        const essay = event.target.closest('[data-library-essay]');
        const record = records.find(item => item.id === essay.dataset.libraryEssay);
        copyEssays([record], essay.querySelector('.library-copy-feedback'));
      }
    });
    showCompany();
  }

  window.CoverLetterLibrary = { open };
})();
