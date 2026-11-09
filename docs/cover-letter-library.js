(function () {
  'use strict';
  let dataset = null;
  let loading = null;
  let activeQuestion = '';
  let questionRows = [];
  const selected = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const panel = () => document.querySelector('#library-chapter');

  function renderQuestions() {
    const root = panel();
    const role = root.querySelector('#library-role').value;
    const year = Number(root.querySelector('#library-year').value);
    const query = root.querySelector('#library-search').value.trim().toLocaleLowerCase();
    const groups = dataset.groups.filter(group => (!role || group.role === role) && (!year || group.year === year));
    const questions = new Map();
    for (const group of groups) {
      for (const question of group.questions) {
        const key = JSON.stringify([group.year, group.season, group.employment, question.number, question.text, question.limit]);
        const row = questions.get(key) || { key, question, year: group.year, season: group.season, answers: [] };
        for (const essay of group.essays) {
          const answer = essay.answers.find(item => item.number === question.number);
          if (answer) row.answers.push({ id: `${group.id}:${essay.id}:${answer.number}`, group, essay, answer, question });
        }
        questions.set(key, row);
      }
    }
    questionRows = [...questions.values()].filter(row => !query || [row.question.text, ...row.answers.map(item => item.answer.text)].join(' ').toLocaleLowerCase().includes(query));
    if (!questionRows.some(row => row.key === activeQuestion)) activeQuestion = questionRows[0]?.key || '';
    root.querySelector('#library-summary').textContent = `${questionRows.length}개 문항 · ${questionRows.reduce((sum, row) => sum + row.answers.length, 0)}개 답변`;
    root.querySelector('#library-questions').innerHTML = questionRows.map((row, index) => `<button type="button" data-library-question="${index}" aria-pressed="${row.key === activeQuestion}"><small>${row.year} ${row.season} · 문항 ${row.question.number} · 답변 ${row.answers.length}</small><span>${escape(row.question.text)}</span></button>`).join('') || '<p class="library-empty">조건에 맞는 자료가 없습니다.</p>';
    renderAnswers();
  }

  function renderAnswers() {
    const row = questionRows.find(item => item.key === activeQuestion);
    const area = panel().querySelector('#library-answers');
    if (!row) { area.innerHTML = ''; return; }
    area.innerHTML = `<header class="library-question-heading"><small>${row.year} ${row.season} · 문항 ${row.question.number}</small><h3>${escape(row.question.text)}</h3><p>글자 수 제한 ${escape(row.question.limit)}</p></header>` + row.answers.map((item, index) => `<article class="library-answer"><label class="library-select"><input type="checkbox" data-library-select="${index}" ${selected.has(item.id) ? 'checked' : ''}>복사할 답변 선택</label><details><summary><strong>답변 ${index + 1}</strong><span>${escape(item.group.role)}</span><small>${escape(item.essay.stage)}</small></summary><div class="library-answer-body"><p class="library-source">게시물 ${escape(item.essay.postId)} · 수집 ${escape(item.essay.collectedAt)} · 채용 구분 ${escape(item.group.employment)}</p><p class="library-answer-text">${escape(item.answer.text)}</p><a href="${escape(item.essay.url)}" target="_blank" rel="noopener noreferrer">링커리어 원문 ↗</a></div></details></article>`).join('');
  }

  function updateSelection() {
    panel().querySelector('#library-copy').textContent = `선택한 답변 복사 (${selected.size})`;
    panel().querySelector('#library-copy').disabled = selected.size === 0;
    panel().querySelector('#library-copy-status').textContent = '';
  }

  async function copySelection() {
    const text = [...selected.values()].map(item => `SK하이닉스 / ${item.group.role} / ${item.group.year} ${item.group.season}\n채용 구분 ${item.group.employment}\n출처의 합격 단계 ${item.essay.stage}\n문항 ${item.question.number} (${item.question.limit})\n${item.question.text}\n\n${item.answer.text}\n\n출처 ${item.essay.url}\n게시물 ID ${item.essay.postId} / 수집일 ${item.essay.collectedAt}`).join('\n\n────────────\n\n');
    const status = panel().querySelector('#library-copy-status');
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard permission timeout')), 1500)),
      ]);
      status.textContent = `${selected.size}개 답변을 복사했습니다.`;
    } catch (_) {
      const fallback = panel().querySelector('#library-copy-fallback');
      fallback.hidden = false;
      fallback.value = text;
      fallback.focus();
      fallback.select();
      status.textContent = '아래 내용을 직접 복사해 주세요.';
    }
  }

  async function load() {
    const root = panel();
    try {
      const response = await fetch('library/skhynix-yangsan.json');
      if (!response.ok) throw new Error('자료를 불러오지 못했습니다.');
      dataset = await response.json();
      const roles = [...new Set(dataset.groups.map(group => group.role))].sort();
      const years = [...new Set(dataset.groups.map(group => group.year))].sort((a, b) => b - a);
      root.innerHTML = `<header class="library-heading"><div><h2>합격 자소서</h2><p>SK하이닉스 · 2018~2026 · 자소서 ${dataset.counts.essays}건 · 답변 ${dataset.counts.answers}건</p></div></header><div class="library-filters"><label>회사<select aria-label="회사"><option>SK하이닉스</option></select></label><label>직무<select id="library-role"><option value="">양산기술 전체 표기</option>${roles.map(role => `<option>${escape(role)}</option>`).join('')}</select></label><label>연도<select id="library-year">${years.map(year => `<option>${year}</option>`).join('')}<option value="0">전체 연도</option></select></label><label class="library-search">문항·답변 검색<input id="library-search" type="search" placeholder="찾을 단어"></label></div><div class="library-toolbar"><p id="library-summary"></p><div><button type="button" id="library-copy" disabled>선택한 답변 복사 (0)</button><button type="button" id="library-clear">선택 해제</button></div></div><p class="library-note">합격 단계와 직무명은 수집 자료의 표기를 따릅니다. 본문을 펼쳐 읽고 필요한 답변을 선택하세요.</p><p id="library-copy-status" role="status"></p><textarea id="library-copy-fallback" aria-label="직접 복사할 내용" rows="8" hidden></textarea><div class="library-layout"><nav id="library-questions" aria-label="해당 연도의 자소서 문항"></nav><section id="library-answers" aria-label="문항별 답변"></section></div>`;
      root.querySelectorAll('#library-role, #library-year').forEach(input => input.addEventListener('change', renderQuestions));
      root.querySelector('#library-search').addEventListener('input', renderQuestions);
      root.querySelector('#library-questions').addEventListener('click', event => {
        const button = event.target.closest('[data-library-question]');
        if (!button) return;
        activeQuestion = questionRows[Number(button.dataset.libraryQuestion)].key;
        renderQuestions();
      });
      root.querySelector('#library-answers').addEventListener('change', event => {
        if (!event.target.matches('[data-library-select]')) return;
        const row = questionRows.find(item => item.key === activeQuestion);
        const item = row.answers[Number(event.target.dataset.librarySelect)];
        if (event.target.checked) selected.set(item.id, item);
        else selected.delete(item.id);
        updateSelection();
      });
      root.querySelector('#library-copy').addEventListener('click', copySelection);
      root.querySelector('#library-clear').addEventListener('click', () => {
        selected.clear();
        root.querySelector('#library-copy-fallback').hidden = true;
        updateSelection();
        renderAnswers();
      });
      renderQuestions();
    } catch (error) {
      dataset = null;
      root.innerHTML = '<p>자료를 불러오지 못했습니다.</p><button type="button" id="library-retry">다시 불러오기</button>';
      root.querySelector('#library-retry').addEventListener('click', () => { loading = null; window.CoverLetterLibrary.open(); });
    }
  }
  window.CoverLetterLibrary = { open() { if (!loading) loading = load(); return loading; } };
})();
