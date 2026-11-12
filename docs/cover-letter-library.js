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

  function roleFilter(companyId, role) {
    if (companyId === 'skhynix') return /p\s*&\s*t|package/i.test(role) ? '양산기술(P&T)' : '양산기술';
    return role === '미확인' ? '직무 미확인' : role;
  }

  function buildRecords(companyId, dataset) {
    const groups = [...dataset.groups].sort((a, b) => b.year - a.year || Number(b.season === '하반기') - Number(a.season === '하반기'));
    const periodCounts = new Map();
    return groups.flatMap(group => group.essays.map(essay => {
      const period = `${group.year} ${group.season}`;
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
      showPeriods(records, previousPeriod, false);
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
    const { duties, organization, site } = essay.details;
    return [['세부 업무', duties], ['사업부·조직', organization], ['사업장', site]]
      .filter(([, value]) => value && value !== '미확인')
      .map(([label, value]) => `${label}: ${value}`);
  }

  function renderEssay(record, isOpen) {
    const { id, role, period, number, employment, essay, questions, dateConflict } = record;
    const coverage = essay.details?.status === '부분 수집' ? essay.details.status : '';
    const meta = [essay.stage, employment, coverage, `문항 ${questions.length}개`].filter(value => value && value !== '미확인');
    const details = [
      ...essayMetadata(essay),
      essay.publishedAt && !['None', '미확인'].includes(essay.publishedAt) ? `게시일 ${essay.publishedAt.slice(0, 10)}` : '',
      dateConflict ? '게시일이 수집 자료의 채용 연도보다 앞섭니다. 시즌은 원문에서 확인해 주세요.' : '',
    ].filter(Boolean).join(' · ');
    return `<details class="library-essay" data-library-essay="${escape(id)}"${isOpen ? ' open' : ''}>
      <summary><span class="library-essay-heading"><strong>지원자 ${number}</strong> <span>${escape(role === '미확인' ? '직무 미확인' : role)}</span></span>
        <span class="library-essay-meta">${escape([period, ...meta].join(' · '))}${dateConflict ? ' <span class="library-season-note">시즌 확인 필요</span>' : ''}</span></summary>
      <div class="library-essay-body">
        <div class="library-essay-actions">
          <button type="button" data-library-copy-essay>전체 복사</button>
          <label><input type="checkbox" data-library-select${selected.has(id) ? ' checked' : ''}> 함께 복사할 글로 선택</label>
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
      essay.details?.status === '부분 수집' ? '부분 수집' : '',
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
      if (request === copyRequest) status.textContent = `자소서 ${items.length}편을 복사했습니다.`;
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
      <div class="library-filters">
        <label>회사<select id="library-company">${Object.entries(companies).map(([id, company]) => `<option value="${id}">${company.name}</option>`).join('')}</select></label>
        <label>직무<select id="library-role"></select></label>
        <label>연도·시즌<select id="library-period"></select></label>
        <label>검색<input id="library-search" type="search" placeholder="예: 팀워크, 공정 개선"></label>
      </div>
      <div class="library-toolbar">
        <p id="library-summary" aria-live="polite"></p>
        <div class="library-toolbar-actions"><button type="button" id="library-copy" disabled>선택한 자소서 복사 (0)</button>
        <button type="button" id="library-clear" hidden>선택 해제</button></div>
      </div>
      <p class="library-note">문항과 직무명은 수집 자료의 표기를 따릅니다. 일부 글은 공개된 문항만 수록되어 있습니다.</p>
      <p id="library-copy-status" role="status"></p>
      <textarea id="library-copy-fallback" aria-label="직접 복사할 내용" rows="8" readonly hidden></textarea>
      <section id="library-essays" aria-label="지원자별 자소서"></section>`;
    field('company').addEventListener('change', showCompany);
    field('role').addEventListener('change', () => {
      if (field('company').value === 'hyundai') {
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
    });
    field('essays').addEventListener('click', event => {
      if (event.target.closest('[data-library-retry]')) {
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
