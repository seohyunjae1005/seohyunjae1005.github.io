(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InterviewPrep = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const storageKey = 'interview-study-notes-v1';
  const states = { new: '미정리', review: '복습 필요', done: '정리 완료' };
  const blank = () => ({ answer: '', memo: '', status: 'new', starred: false });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\-·&_/.,()[\]:'"?]+/g, '');
  const noteFor = (notes, id) => notes[id] || blank();
  function validateCatalog(raw) {
    if (raw?.version !== 1 || !Array.isArray(raw.groups) || !Array.isArray(raw.topics) || !Array.isArray(raw.items)) throw new Error('자료 목록 형식 오류');
    const groups = new Set(raw.groups.map(g => g.id));
    const topics = new Set(raw.topics.map(t => t.id));
    if (topics.size !== raw.topics.length || groups.size !== raw.groups.length || raw.topics.some(t => !groups.has(t.group))) throw new Error('분류 형식 오류');
    const ids = new Set();
    for (const item of raw.items) {
      const url = new URL(item.url);
      if (!/^ddan-\d+$/.test(item.id) || ids.has(item.id) || typeof item.title !== 'string' ||
          !Array.isArray(item.topics) || !item.topics.includes(item.primary) || item.topics.some(t => !topics.has(t)) ||
          !['article','image','index'].includes(item.format) || item.bodyIncluded !== false ||
          !Array.isArray(item.sortOrder) || item.sortOrder.length !== 3 || !item.sortOrder.every(Number.isFinite) ||
          url.protocol !== 'https:' || url.hostname !== 'sshmyb.tistory.com') throw new Error('자료 항목 오류');
      ids.add(item.id);
    }
    if (raw.studyGuide) {
      const guide = raw.studyGuide;
      if (guide.version !== 1 || !Array.isArray(guide.stages) || !Array.isArray(guide.priorities) || !Array.isArray(guide.sources)) throw new Error('학습 가이드 형식 오류');
      const sources = new Set(guide.sources.map(source => source.id));
      const stages = new Set(guide.stages.map(stage => stage.id));
      if (sources.size !== guide.sources.length || stages.size !== guide.stages.length || guide.sources.some(source => new URL(source.url).protocol !== 'https:')) throw new Error('학습 출처 형식 오류');
      for (const row of [...guide.stages,...guide.priorities]) {
        if (!Array.isArray(row.posts) || !row.posts.length || new Set(row.posts).size !== row.posts.length || row.posts.some(post => !ids.has('ddan-' + post))) throw new Error('학습 경로 형식 오류');
        if (row.sources?.some(id => !sources.has(id))) throw new Error('학습 근거 형식 오류');
      }
      if (raw.items.some(item => item.reviewNote?.sources.some(id => !sources.has(id)))) throw new Error('확인 메모 출처 오류');
    }
    return raw;
  }
  function normalizeState(raw) {
    if (raw?.version !== 1 || !raw.notes || typeof raw.notes !== 'object' || Array.isArray(raw.notes)) throw new Error('기록 파일 형식 오류');
    const notes = {};
    for (const [id, item] of Object.entries(raw.notes)) {
      if (!/^(?:ddan-\d+|equip-[a-z]+(?:--(?:amat|asml|tel|lam))?)$/.test(id) || !item || typeof item.answer !== 'string' || typeof item.memo !== 'string' ||
          !Object.prototype.hasOwnProperty.call(states, item.status) || typeof item.starred !== 'boolean') throw new Error('기록 항목 오류');
      notes[id] = { answer: item.answer, memo: item.memo, status: item.status, starred: item.starred };
    }
    return { version: 1, notes };
  }
  function mergeState(current, incoming) {
    const merged = normalizeState(current);
    const imported = normalizeState(incoming);
    const append = (a, b) => !b.trim() || a === b || a.includes('\n\n[불러온 기록]\n' + b) ? a : !a.trim() ? b : a + '\n\n[불러온 기록]\n' + b;
    for (const [id, other] of Object.entries(imported.notes)) {
      if (!merged.notes[id]) { merged.notes[id] = other; continue; }
      const old = merged.notes[id];
      const different = old.answer.trim() && other.answer.trim() && old.answer !== other.answer;
      merged.notes[id] = { answer: append(old.answer, other.answer), memo: append(old.memo, other.memo),
        starred: old.starred || other.starred,
        status: different ? 'review' : old.status === 'new' ? other.status : old.status };
    }
    return merged;
  }
  function filterItems(catalog, filter = {}, notes = {}) {
    const topicMap = new Map(catalog.topics.map(t => [t.id, t]));
    const terms = String(filter.search || '').trim().split(/\s+/).filter(Boolean).map(normalize);
    const order = new Map(catalog.topics.map((t,i) => [t.id,i]));
    const stage = catalog.studyGuide?.stages.find(row => row.id === filter.stage);
    const stageOrder = stage ? new Map(stage.posts.map((post,i) => ['ddan-' + post,i])) : null;
    return catalog.items.filter(item => {
      if (stageOrder && !stageOrder.has(item.id)) return false;
      if (filter.group && !item.topics.some(t => topicMap.get(t).group === filter.group)) return false;
      if (filter.topic && !item.topics.includes(filter.topic)) return false;
      const note = noteFor(notes,item.id);
      if (filter.state === 'starred' && !note.starred) return false;
      if (['new','review','done'].includes(filter.state) && note.status !== filter.state) return false;
      if (filter.state === 'written' && !note.answer.trim() && !note.memo.trim()) return false;
      const haystack = normalize([item.title,item.originalTitle,item.aliases].join(' '));
      return terms.every(term => haystack.includes(term));
    }).sort((a,b) => (stageOrder ? stageOrder.get(a.id)-stageOrder.get(b.id) : order.get(a.primary)-order.get(b.primary)) || a.sortOrder[0]-b.sortOrder[0] || a.sortOrder[1]-b.sortOrder[1] || a.order-b.order);
  }
  function noteText(item, note) {
    return [item.title, '원문: ' + item.url, note.answer.trim() ? '[내 답변]\n' + note.answer.trim() : '',
      note.memo.trim() ? '[복습 메모]\n' + note.memo.trim() : ''].filter(Boolean).join('\n\n');
  }
  let mounted = false;
  let loading = null;
  let catalog = null;
  let state = { version: 1, notes: {} };
  let storage = null;
  let storageReadError = false;
  let copyVersion = 0;
  let selectedStage = '';
  let root;
  const field = name => root.querySelector('[data-interview="' + name + '"]');
  const options = rows => rows.map(([id,name]) => '<option value="' + escape(id) + '">' + escape(name) + '</option>').join('');
  function save() {
    copyVersion++;
    if (storageReadError) { field('status').textContent = '기존 기록을 읽지 못했어요. 백업으로 보관하세요.'; return; }
    try { storage.setItem(storageKey,JSON.stringify(state)); field('status').textContent = '이 브라우저에 저장'; }
    catch (_) { field('status').textContent = '저장되지 않았어요. 복사·백업으로 보관하세요.'; }
  }
  function filters() {
    return Object.fromEntries(['group','topic','state','search'].map(key => [key,field(key).value]));
  }
  function renderTopics() {
    const previous = field('topic').value;
    const topics = catalog.topics.filter(t => !field('group').value || t.group === field('group').value);
    field('topic').innerHTML = '<option value="">전체 주제</option>' + options(topics.map(t => [t.id,t.name]));
    if (topics.some(t => t.id === previous)) field('topic').value = previous;
  }
  function fillBody(card) {
    if (card.dataset.ready) return;
    card.dataset.ready = 'true';
    const item = catalog.items.find(item => item.id === card.dataset.interviewId);
    const note = noteFor(state.notes,item.id);
    card.querySelector('[data-interview-body]').innerHTML = `<div class="interview-source-row"><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">원문 보기</a><span>${escape(item.publishedAt)}</span></div>
      ${item.reviewNote ? `<aside class="process-reading-note"><h3>${escape(item.reviewNote.title)}</h3><p>${escape(item.reviewNote.text)}</p>${sourceLinks(item.reviewNote.sources)}</aside>` : ''}
      ${item.format === 'image' ? '<p class="interview-material-note">이미지 슬라이드 자료입니다. 원문에서 확인하세요.</p>' : ''}
      <label class="interview-answer-label">${item.format === 'index' ? '학습 메모' : '내 답변'}<textarea data-note-field="answer" rows="5" placeholder="원문을 읽고 내 말로 정리하세요.">${escape(note.answer)}</textarea></label>
      <label class="interview-memo-label">헷갈리는 점<textarea data-note-field="memo" rows="2" placeholder="다시 확인할 개념이나 질문">${escape(note.memo)}</textarea></label>
      <div class="interview-note-actions"><label>복습 상태<select data-note-field="status">${options(Object.entries(states))}</select></label><button type="button" data-copy-note>답변 복사</button></div>
      <p data-note-status role="status"></p><textarea data-note-fallback readonly rows="6" aria-label="직접 복사할 답변" hidden></textarea>
      <details class="interview-original"><summary>자료 정보</summary><p>${escape(item.originalTitle)}</p><p>${escape(catalog.source)} · ${escape(item.publishedAt)}</p></details>`;
    card.querySelector('[data-note-field="status"]').value = note.status;
  }
  function renderList() {
    const oldOpen = new Set([...field('list').querySelectorAll('details[data-interview-id][open]')].map(node => node.dataset.interviewId));
    const topicMap = new Map(catalog.topics.map(t => [t.id,t]));
    const shown = filterItems(catalog,{...filters(),stage:selectedStage},state.notes);
    field('count').textContent = '자료 ' + shown.length + '개';
    const stage = catalog.studyGuide?.stages.find(row => row.id === selectedStage);
    field('route').hidden = !stage;
    field('route-name').textContent = stage ? '학습 경로: ' + stage.title : '';
    root.querySelectorAll('[data-study-stage]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.studyStage === selectedStage)));
    field('list').innerHTML = shown.map(item => {
      const note = noteFor(state.notes,item.id);
      const format = (item.format === 'image' ? ' · 이미지 자료' : item.format === 'index' ? ' · 목차' : '') + (item.reviewNote ? ' · 확인 메모' : '');
      return `<details class="interview-item" data-interview-id="${item.id}"${oldOpen.has(item.id) ? ' open' : ''}>
        <summary><button type="button" data-star aria-pressed="${note.starred}" aria-label="${escape(item.title)} 북마크" title="북마크">${note.starred ? '★' : '☆'}</button>
          <span class="interview-summary"><strong>${escape(item.title)}</strong><span>${escape(topicMap.get(item.primary).name + format)}<span data-note-badge>${note.status === 'new' ? '' : ' · ' + states[note.status]}</span></span></span></summary>
        <div class="interview-item-body" data-interview-body></div></details>`;
    }).join('') || '<p class="interview-empty">조건에 맞는 자료가 없습니다.</p>';
    field('list').querySelectorAll('details[open]').forEach(fillBody);
  }
  function sourceLinks(ids) {
    const sources = catalog.studyGuide?.sources || [];
    return `<div class="process-guide-links">${ids.map(id => sources.find(source => source.id === id)).filter(Boolean).map(source => `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a>`).join('')}</div>`;
  }
  function renderGuide() {
    const guide = catalog.studyGuide;
    if (!guide) { field('guide').hidden = true; return; }
    field('guide').hidden = false;
    const related = posts => `<div class="process-related">${posts.map(post => catalog.items.find(item => item.id === 'ddan-' + post)).filter(Boolean).map(item => `<button type="button" data-study-post="${item.id}">${escape(item.title)}</button>`).join('')}</div>`;
    field('guide').innerHTML = `<h3>공정기술 면접 학습</h3><p>${escape(guide.summary)}</p>
      <p class="process-answer-frame">${escape(guide.answerFrame)}</p>
      <details class="process-learning-path" open><summary>추천 학습 순서</summary><ol>${guide.stages.map(stage => `<li><button type="button" data-study-stage="${escape(stage.id)}" aria-pressed="false">${escape(stage.title)}<span>자료 ${stage.posts.length}편 보기</span></button><p>${escape(stage.description)}</p></li>`).join('')}</ol></details>
      <details class="process-priorities"><summary>보강할 6가지 · 연습 질문과 답변 방향</summary><p>아래는 학습을 위한 가상 질문과 답변 예시입니다. 실제 경험이나 특정 회사의 정답을 뜻하지 않습니다.</p>
        ${guide.priorities.map(row => `<details class="process-priority"><summary>${escape(row.title)}</summary><div><p>${escape(row.assessment)}</p><h4>보강할 내용</h4><p>${escape(row.learn)}</p><h4>연습 질문</h4><p class="process-practice-question">${escape(row.question)}</p><h4>답변 방향 예시</h4><p>${escape(row.direction)}</p><p class="process-avoid"><strong>피할 답변</strong> · ${escape(row.avoid)}</p><h4>기존 자료와 연결하기</h4>${related(row.posts)}${sourceLinks(row.sources)}</div></details>`).join('')}</details>
      <details class="process-review-basis"><summary>검토 범위와 기준</summary><p>${escape(guide.scope)}</p><p>공식 직무 소개와 공개 기술 자료를 대조한 학습 추천입니다. 기업의 내부 평가표나 실제 출제 기준은 아닙니다. 확인 메모는 발견한 부분만 표시합니다.</p><p>검토일 ${escape(guide.reviewedAt)} · 기존 원문 제목은 각 자료의 ‘자료 정보’에서 볼 수 있습니다.</p>${sourceLinks(['samsung-role','hynix-role'])}</details>`;
  }
  async function loadCatalog() {
    if (loading) return loading;
    field('loading').hidden = false; field('loading').textContent = '자료 불러오는 중…';
    field('content').hidden = true;
    loading = (async () => {
      try {
        const response = await fetch('interview/catalog.json?v=20261121-3');
        if (!response.ok) throw new Error('fetch');
        catalog = validateCatalog(await response.json());
        field('group').innerHTML = '<option value="">전체 분야</option>' + options(catalog.groups.map(g => [g.id,g.name]));
        renderTopics(); renderGuide(); renderList();
        field('info').textContent = catalog.source + ' · ' + catalog.collectedAt + ' 수집 목록. 제목과 목록을 기준으로 재분류했으며 본문은 포함하지 않습니다. 원문은 새 창에서 열립니다. 복습 상태와 답변은 이 브라우저에만 저장됩니다.';
        field('loading').hidden = true; field('content').hidden = false;
      } catch (_) {
        field('loading').innerHTML = '자료를 불러오지 못했습니다. <button type="button" data-interview-retry>다시 불러오기</button>';
      } finally { loading = null; }
    })();
    return loading;
  }
  function open() {
    if (mounted) return;
    mounted = true; root = document.querySelector('#interview-chapter');
    try { storage = globalThis.localStorage; const saved = storage.getItem(storageKey); if (saved) state = normalizeState(JSON.parse(saved)); }
    catch (_) { storageReadError = true; }
    root.innerHTML = `<header class="interview-heading"><h2>면접 대비</h2><div class="interview-backup-actions"><button type="button" data-interview="backup">기록 백업</button><button type="button" data-interview="import">불러오기</button><input type="file" accept=".json,application/json" data-interview="file" hidden></div></header>
      <div class="interview-sections" role="tablist" aria-label="면접 자료 선택"><button type="button" role="tab" id="equipment-interview-tab" aria-selected="true" aria-controls="equipment-interview-panel" data-interview-view="equipment">장비사 기출</button><button type="button" role="tab" id="process-study-tab" aria-selected="false" aria-controls="process-study-panel" data-interview-view="study" tabindex="-1">공정 학습 자료</button></div>
      <p data-interview="status" role="status"></p>
      <div id="equipment-interview-panel" role="tabpanel" aria-labelledby="equipment-interview-tab" data-interview="equipment"></div>
      <div id="process-study-panel" role="tabpanel" aria-labelledby="process-study-tab" data-interview="study" hidden>
      <p data-interview="loading" role="status"></p><div data-interview="content" hidden>
      <section data-interview="guide" class="process-study-guide" aria-label="공정기술 학습 가이드"></section>
      <div class="interview-filters"><label>분야<select data-interview="group"></select></label><label>주제<select data-interview="topic"></select></label>
        <label>내 기록<select data-interview="state">${options([['','전체'],['starred','북마크'],['review','복습 필요'],['done','정리 완료'],['written','작성한 자료'],['new','미정리']])}</select></label>
        <label>검색<input data-interview="search" type="search" placeholder="제목·키워드"></label></div>
      <div class="interview-result-line"><p data-interview="count"></p><button type="button" data-interview="reset">필터 초기화</button></div>
      <div data-interview="route" class="process-active-route" hidden><span data-interview="route-name"></span><button type="button" data-study-all>전체 자료로 돌아가기</button></div>
      <div data-interview="list" class="interview-list"></div>
      <details class="interview-info"><summary>자료 안내</summary><p data-interview="info"></p></details></div></div>`;
    function showView(view) {
      field('equipment').hidden = view !== 'equipment'; field('study').hidden = view !== 'study';
      root.querySelectorAll('[data-interview-view]').forEach(button => { const selected = button.dataset.interviewView === view; button.setAttribute('aria-selected',String(selected)); button.tabIndex = selected ? 0 : -1; });
      if (view === 'study') { if (!catalog) loadCatalog(); }
      else globalThis.EquipmentInterview.mount(field('equipment'), {getNotes:() => state.notes, updateNote:(id,note) => { state.notes[id] = note; save(); }});
    }
    const viewButtons = [...root.querySelectorAll('[data-interview-view]')];
    viewButtons.forEach(button => {
      button.addEventListener('click',() => showView(button.dataset.interviewView));
      button.addEventListener('keydown',event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault(); const index = viewButtons.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? viewButtons.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + viewButtons.length) % viewButtons.length;
        showView(viewButtons[next].dataset.interviewView); viewButtons[next].focus();
      });
    });
    for (const name of ['group','topic','state']) field(name).addEventListener('change', () => { if (name === 'group') renderTopics(); renderList(); });
    field('search').addEventListener('input',renderList);
    function resetStudy() { selectedStage = ''; for (const key of ['group','state','search']) field(key).value = ''; renderTopics(); field('topic').value = ''; }
    field('reset').addEventListener('click', () => { resetStudy(); renderList(); });
    root.addEventListener('click', event => {
      if (event.target.closest('[data-interview-retry]')) loadCatalog();
      const stage = event.target.closest('[data-study-stage]');
      const post = event.target.closest('[data-study-post]');
      if (stage) { resetStudy(); selectedStage = stage.dataset.studyStage; renderList(); field('count').scrollIntoView({block:'start'}); }
      if (event.target.closest('[data-study-all]')) { resetStudy(); renderList(); }
      if (post) {
        resetStudy(); renderList();
        const card = field('list').querySelector('[data-interview-id="' + post.dataset.studyPost + '"]');
        if (card) { card.open = true; fillBody(card); card.scrollIntoView({block:'start'}); card.querySelector('summary').focus({preventScroll:true}); }
      }
    });
    field('list').addEventListener('toggle',event => { if (event.target.matches('details[data-interview-id]') && event.target.open) fillBody(event.target); },true);
    field('list').addEventListener('click', async event => {
      const card = event.target.closest('[data-interview-id]'); if (!card) return;
      const id = card.dataset.interviewId;
      if (event.target.closest('[data-star]')) {
        event.preventDefault(); event.stopPropagation();
        const note = noteFor(state.notes,id); state.notes[id] = { ...note, starred: !note.starred }; save(); renderList();
        field('list').querySelector('[data-interview-id="' + id + '"] [data-star]')?.focus();
      } else if (event.target.closest('[data-copy-note]')) {
        const item = catalog.items.find(item => item.id === id); const note = noteFor(state.notes,id);
        const status = card.querySelector('[data-note-status]');
        if (!note.answer.trim() && !note.memo.trim()) { status.textContent = '정리한 내용을 먼저 적어 주세요.'; return; }
        const content = noteText(item,note); const request = ++copyVersion; let timer;
        card.querySelector('[data-note-fallback]').hidden = true;
        try {
          await Promise.race([navigator.clipboard.writeText(content),new Promise((_,reject) => { timer = setTimeout(reject,1500); })]);
          if (request === copyVersion && card.isConnected) status.textContent = '답변 복사 완료';
        } catch (_) {
          if (request !== copyVersion || !card.isConnected) return;
          const box = card.querySelector('[data-note-fallback]'); box.value = content; box.hidden = false; box.focus(); box.select();
          status.textContent = '선택된 내용을 직접 복사하세요.';
        } finally { clearTimeout(timer); }
      }
    });
    function updateNote(event) {
      const key = event.target.dataset.noteField; if (!key) return;
      if ((key === 'status') !== (event.type === 'change')) return;
      const card = event.target.closest('[data-interview-id]'); const id = card.dataset.interviewId;
      state.notes[id] = { ...noteFor(state.notes,id), [key]: event.target.value }; save();
      card.querySelector('[data-note-status]').textContent = '';
      card.querySelector('[data-note-fallback]').hidden = true;
      if (key === 'status') renderList();
    }
    field('list').addEventListener('input',updateNote);
    field('list').addEventListener('change',updateNote);
    field('backup').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{ type:'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'interview-notes-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    });
    field('import').addEventListener('click',() => field('file').click());
    field('file').addEventListener('change',async event => {
      const file = event.target.files[0]; if (!file) return;
      try { const incoming = normalizeState(JSON.parse(await file.text())); state = mergeState(state,incoming); save(); if (catalog) renderList(); globalThis.EquipmentInterview.refresh(); field('status').textContent = '기존 기록을 유지하며 불러왔어요.'; }
      catch (_) { field('status').textContent = '기록 파일을 읽지 못했어요. 기존 기록은 유지됩니다.'; }
      event.target.value = '';
    });
    showView('equipment');
  }
  return { open, storageKey, validateCatalog, normalizeState, mergeState, filterItems, noteText };
});
