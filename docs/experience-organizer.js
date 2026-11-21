(function (root, factory) {
  'use strict';
  const bank = typeof module === 'object' && module.exports ? require('./experience-question-bank.js') : root.ExperienceQuestions;
  const api = factory(bank);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExperienceOrganizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (bank) {
  'use strict';
  const storageKey = 'career-experience-organizer-v2';
  const legacyKey = 'skhynix-experience-organizer-v1';
  const legacySteps = {
    expertise: ['맡은 일', '판단의 근거', '직접 한 일', '확인한 결과'],
    teamwork: ['공동 목표', '상대의 상황', '협업 방식 변경', '함께한 결과'],
    challenge: ['내가 세운 목표', '첫 시도의 한계', '바꾼 방법', '도달한 수준'],
    improvement: ['기존의 불편', '변경 이유', '직접 실행', '효과 확인'],
    personality: ['나를 설명하는 말', '실제 장면', '반복하는 행동', '반응과 의미'],
  };
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const id = () => globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);
  const text = value => typeof value === 'string' ? value : '';
  function createDraft() {
    return { id: id(), title: '', theme: 'expertise', activity: 'academic', track: 'chipmaker', stage: 'ongoing', company: '', question: '', answers: {} };
  }
  function normalizeDraft(raw) {
    if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.title !== 'string' ||
        !own(bank.themes, raw.theme) || !own(bank.activities, raw.activity) ||
        !own(bank.tracks, raw.track) || !own(bank.stages, raw.stage) ||
        !raw.answers || Array.isArray(raw.answers) || typeof raw.answers !== 'object') throw new Error('경험 자료 형식을 확인해 주세요.');
    const answers = Object.fromEntries(Object.entries(raw.answers).filter(([key, value]) =>
      typeof value === 'string' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'));
    const draft = { id: raw.id, title: raw.title, theme: raw.theme, activity: raw.activity, track: raw.track, stage: raw.stage,
      company: text(raw.company), question: text(raw.question), answers };
    if (raw.legacy && Array.isArray(raw.legacy.notes) && raw.legacy.notes.length === 4 && raw.legacy.notes.every(note => typeof note === 'string')) {
      draft.legacy = { theme: own(legacySteps, raw.legacy.theme) ? raw.legacy.theme : 'expertise',
        stage: own(bank.stages, raw.legacy.stage) ? raw.legacy.stage : 'ongoing', notes: [...raw.legacy.notes], next: text(raw.legacy.next) };
    }
    return draft;
  }
  function normalizeState(raw) {
    if (!raw || raw.version !== 2 || !Array.isArray(raw.drafts) || !raw.drafts.length) throw new Error('경험 백업 파일을 확인해 주세요.');
    const drafts = raw.drafts.map(normalizeDraft);
    if (new Set(drafts.map(draft => draft.id)).size !== drafts.length) throw new Error('중복된 경험 번호가 있습니다.');
    return { version: 2, active: drafts.some(draft => draft.id === raw.active) ? raw.active : drafts[0].id, drafts };
  }
  function migrateLegacy(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.drafts) || !raw.drafts.length) throw new Error('이전 경험 자료를 읽지 못했습니다.');
    if (raw.drafts.some(old => !old || !Array.isArray(old.notes) || old.notes.length !== 4 || !old.notes.every(note => typeof note === 'string'))) throw new Error('이전 경험 답변을 확인해 주세요.');
    return normalizeState({ version: 2, active: raw.active, drafts: raw.drafts.map(old => ({
      ...createDraft(), id: old.id, title: old.title, theme: old.theme, activity: old.activity, stage: old.stage,
      legacy: { theme: old.theme, stage: old.stage, notes: old.notes, next: old.next },
    })) });
  }
  function loadState(storage) {
    const draft = createDraft();
    const fallback = { state: { version: 2, active: draft.id, drafts: [draft] }, readError: false };
    try {
      const saved = storage.getItem(storageKey);
      if (saved !== null) return { state: normalizeState(JSON.parse(saved)), readError: false };
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) return { state: migrateLegacy(JSON.parse(legacy)), readError: false };
    } catch (_) { fallback.readError = true; }
    return fallback;
  }
  function mergeState(current, incoming) {
    const merged = normalizeState(current);
    const imported = normalizeState(incoming);
    const used = new Map(merged.drafts.map(draft => [draft.id, draft]));
    let active = merged.active;
    for (const draft of imported.drafts) {
      if (used.has(draft.id) && JSON.stringify(used.get(draft.id)) === JSON.stringify(draft)) { active = draft.id; continue; }
      if (used.has(draft.id)) draft.id = id();
      merged.drafts.push(draft); used.set(draft.id, draft); active = draft.id;
    }
    merged.active = active;
    return merged;
  }
  function legacyText(draft) {
    if (!draft.legacy) return '';
    const old = draft.legacy;
    const steps = [...legacySteps[old.theme]];
    if (old.stage === 'proposal') steps[2] = '완료한 준비·제안';
    if (old.stage !== 'complete') steps[3] = '현재까지 확인한 내용';
    const notes = old.notes.map((note, index) => note.trim() ? steps[index] + '\n' + note.trim() : '').filter(Boolean);
    if (old.next.trim()) notes.push('당시 앞으로 할 일\n' + old.next.trim());
    return notes.length ? '이전 정리 (' + bank.stages[old.stage] + ')\n' + notes.join('\n\n') : '';
  }
  function hasContent(draft) {
    return !!legacyText(draft) || bank.questionGroups(draft).some(group => group.questions.some(q => text(draft.answers[q.id]).trim()));
  }
  function buildText(draft) {
    const groups = bank.questionGroups(draft);
    const sections = groups.map(group => {
      const rows = group.questions.filter(q => q.id !== 'next' && text(draft.answers[q.id]).trim())
        .map(q => q.label + '\n' + draft.answers[q.id].trim());
      return rows.length ? '[' + group.title + ']\n' + rows.join('\n\n') : '';
    }).filter(Boolean);
    // Plans stay separate even if the user later changes the overall stage to complete.
    if (text(draft.answers.next).trim()) sections.push('[계획·미확인]\n' + draft.answers.next.trim());
    const old = legacyText(draft);
    return [draft.title.trim() || '경험 정리',
      bank.tracks[draft.track] + ' / ' + bank.themes[draft.theme].name + ' / ' + bank.activities[draft.activity] + ' / ' + bank.stages[draft.stage],
      draft.company.trim() ? '지원 회사: ' + draft.company.trim() : '',
      draft.question.trim() ? '지원 문항: ' + draft.question.trim() : '',
      ...sections, old].filter(Boolean).join('\n\n');
  }
  function buildAiPrompt(draft) {
    const technical = draft.activity === 'academic' && ['expertise', 'improvement'].includes(draft.theme);
    const angle = technical ? (draft.track === 'chipmaker'
      ? '공정 조건의 선택 근거와 품질·특성 검증을 중심으로 구성해 주세요.'
      : '장비 동작과 결과의 관계, 점검·판단 순서, 확인·공유한 내용을 중심으로 구성해 주세요. 고장이나 고객 대응이 입력되지 않았다면 만들어 넣지 마세요.')
      : '인성·팀워크·소통은 회사 종류에 따라 성격을 꾸미지 말고, 문항이 묻는 행동과 변화를 중심으로 구성해 주세요.';
    return ['아래 경험 답변을 바탕으로 ' + (draft.company.trim() || bank.tracks[draft.track]) + ' 지원용 자기소개서 초안을 작성해 주세요.',
      draft.question.trim() ? '답할 문항: ' + draft.question.trim() : '문항 유형: ' + bank.themes[draft.theme].name,
      angle,
      '핵심 행동을 먼저 밝히고 상황·판단·행동·결과가 자연스럽게 이어지도록 작성해 주세요. 질문 순서를 그대로 나열할 필요는 없습니다.',
      '입력한 사실의 의미를 구체적으로 설명하되, 없는 행동·수치·도구·성과·상대 반응을 추가하지 마세요. 직접 수행·공동 수행·관찰·제안·계획을 구분하고, 진행 중인 일을 완료한 성과로 바꾸지 마세요.',
      '지원자들의 사례나 예시 문구는 내 경험이 아닙니다. 내 답변만 사용하고, 사실이 부족하면 초안 뒤에 추가로 확인할 질문을 최대 3개 적어 주세요.',
      '회사 인재상을 단정하거나 억지로 고객·공정 업무를 덧붙이지 말고, 과장된 수식어 없이 학생이 직접 쓴 말투로 작성해 주세요.',
      '--- 내 경험 답변 ---', buildText(draft)].join('\n\n');
  }

  function mount(root) {
    if (root.dataset.mounted) return;
    root.dataset.mounted = 'true';
    let storage;
    try { storage = globalThis.localStorage; } catch (_) { storage = null; }
    const loaded = loadState(storage);
    let state = loaded.state;
    const field = name => root.querySelector('[data-organizer="' + name + '"]');
    const current = () => state.drafts.find(draft => draft.id === state.active);
    const options = values => Object.entries(values).map(([value, label]) => '<option value="' + escape(value) + '">' + escape(label) + '</option>').join('');
    let copyVersion = 0;
    let deleting = '';
    root.classList.add('experience-manager');
    root.innerHTML = `<div class="organizer-drafts"><label>저장한 경험<select data-organizer="draft"></select></label>
        <button type="button" data-organizer="new">경험 추가</button></div>
      <label class="organizer-title">경험 이름<input data-organizer="title" placeholder="예: 공정 실습, 카페 근무, 러닝 모임"></label>
      <div class="organizer-track" role="group" aria-label="지원 분야">
        ${Object.entries(bank.tracks).map(([value, label]) => `<button type="button" data-track="${value}" aria-pressed="false">${label}</button>`).join('')}
      </div>
      <div class="organizer-options">
        <label>문항 유형<select data-organizer="theme">${options(Object.fromEntries(Object.entries(bank.themes).map(([key, theme]) => [key, theme.name])))}</select></label>
        <label>활동<select data-organizer="activity">${options(bank.activities)}</select></label>
        <label>진행 단계<select data-organizer="stage">${options(bank.stages)}</select></label>
      </div>
      <div class="organizer-status-line"><p>기억나는 질문부터 답하세요.</p><p data-organizer="save" role="status"></p></div>
      <details class="organizer-legacy" data-organizer="legacy" hidden><summary>이전 정리</summary><p data-organizer="legacy-text"></p></details>
      <div data-organizer="questions" class="organizer-groups"></div>
      <details class="organizer-sources"><summary>질문 근거</summary><p>합격 사례의 전개를 바탕으로 만든 질문입니다.</p><ul data-organizer="sources"></ul></details>
      <details class="organizer-submission"><summary>지원 회사·문항 지정</summary>
        <label>지원 회사<input data-organizer="company" placeholder="선택 입력"></label>
        <label>자소서 문항<textarea data-organizer="question" rows="2" placeholder="실제 지원 문항이 있으면 붙여 넣으세요."></textarea></label></details>
      <div class="organizer-actions"><button type="button" data-organizer="preview">답변 모아보기</button>
        <button type="button" data-organizer="copy">정리본 복사</button>
        <button type="button" data-organizer="ai-copy" class="organizer-primary">AI 작성용 복사</button></div>
      <p data-organizer="status" role="status"></p>
      <section class="organizer-result" data-organizer="result" hidden>
        <label>복사할 내용<textarea data-organizer="output" rows="12" readonly></textarea></label></section>
      <details class="organizer-manage"><summary>백업·관리</summary><div class="organizer-actions">
        <button type="button" data-organizer="backup">전체 백업</button>
        <button type="button" data-organizer="import">백업 불러오기</button>
        <button type="button" data-organizer="delete">이 경험 삭제</button></div>
        <input data-organizer="file" type="file" accept=".json,application/json" hidden></details>`;

    function save() {
      copyVersion += 1;
      if (loaded.readError) {
        field('save').textContent = '기존 저장 자료를 읽지 못했어요. 복사·백업으로 보관하세요.';
        return;
      }
      try {
        storage.setItem(storageKey, JSON.stringify(state));
        field('save').textContent = '이 브라우저에 자동 저장';
      } catch (_) { field('save').textContent = '저장되지 않았어요. 복사·백업으로 보관하세요.'; }
    }
    function renderDrafts() {
      field('draft').innerHTML = state.drafts.map((draft, index) => '<option value="' + escape(draft.id) + '">' + escape(draft.title.trim() || '새 경험 ' + (index + 1)) + '</option>').join('');
      field('draft').value = state.active;
    }
    function renderCounts() {
      for (const group of bank.questionGroups(current())) {
        const count = group.questions.filter(q => text(current().answers[q.id]).trim()).length;
        const target = root.querySelector('[data-group-count="' + group.id + '"]');
        if (target) target.textContent = count + '/' + group.questions.length;
      }
    }
    function renderQuestions() {
      const groups = bank.questionGroups(current());
      field('questions').innerHTML = groups.map((group, index) => `<details class="organizer-group"${index === 0 ? ' open' : ''}>
        <summary><strong>${escape(group.title)}</strong><span data-group-count="${group.id}"></span></summary>
        <div class="organizer-question-list">${group.questions.map(q => `<label class="organizer-prompt" for="experience-answer-${q.id}">
          <span>${escape(q.label)}</span><textarea id="experience-answer-${q.id}" data-answer="${q.id}" rows="3" placeholder="${escape(q.hint)}">${escape(current().answers[q.id] || '')}</textarea></label>`).join('')}</div></details>`).join('');
      const refs = [...new Set(groups.flatMap(group => group.questions.flatMap(q => q.refs)))];
      field('sources').innerHTML = refs.map(key => {
        const source = bank.sources[key];
        return `<li><a href="https://linkareer.com/cover-letter/${source.post}" target="_blank" rel="noopener noreferrer">${escape(source.company)} · 문항 ${source.number}</a><span>${escape(source.point)}</span></li>`;
      }).join('');
      renderCounts();
    }
    function refresh() {
      copyVersion += 1; deleting = '';
      renderDrafts();
      for (const key of ['title', 'theme', 'activity', 'stage', 'company', 'question']) field(key).value = current()[key];
      root.querySelectorAll('[data-track]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.track === current().track)));
      renderQuestions();
      const old = legacyText(current());
      field('legacy').hidden = !old; field('legacy-text').textContent = old;
      field('result').hidden = true; field('output').value = ''; field('status').textContent = '';
      field('delete').textContent = '이 경험 삭제';
      field('save').textContent = loaded.readError ? '기존 저장 자료를 읽지 못했어요. 복사·백업으로 보관하세요.' : '이 브라우저에 저장';
    }
    root.addEventListener('input', event => {
      const draft = current();
      if (event.target.matches('[data-answer]')) draft.answers[event.target.dataset.answer] = event.target.value;
      else if (['title', 'company', 'question'].includes(event.target.dataset.organizer)) draft[event.target.dataset.organizer] = event.target.value;
      else return;
      if (event.target === field('title')) renderDrafts();
      save(); renderCounts();
      field('status').textContent = ''; field('result').hidden = true;
    });
    root.addEventListener('change', event => {
      const name = event.target.dataset.organizer;
      if (name === 'draft') state.active = event.target.value;
      else if (['theme', 'activity', 'stage'].includes(name)) current()[name] = event.target.value;
      else return;
      refresh(); save();
    });
    root.querySelectorAll('[data-track]').forEach(button => button.addEventListener('click', () => {
      current().track = button.dataset.track; refresh(); save();
    }));
    field('new').addEventListener('click', () => {
      const draft = createDraft(); draft.track = current().track;
      state.drafts.push(draft); state.active = draft.id; refresh(); save(); field('title').focus();
    });
    field('delete').addEventListener('click', () => {
      if (deleting !== current().id) { deleting = current().id; field('delete').textContent = '삭제 확인'; return; }
      state.drafts = state.drafts.filter(draft => draft.id !== state.active);
      if (!state.drafts.length) state.drafts.push(createDraft());
      state.active = state.drafts[0].id; refresh(); save();
    });
    function ready() {
      if (hasContent(current())) return true;
      field('status').textContent = '기억나는 내용부터 한 가지 적어 주세요.';
      root.querySelector('[data-answer]').focus(); return false;
    }
    function showOutput(content) {
      field('output').value = content; field('result').hidden = false;
    }
    async function copy(content, label) {
      const request = ++copyVersion;
      let timer;
      try {
        await Promise.race([navigator.clipboard.writeText(content), new Promise((_, reject) => { timer = setTimeout(reject, 1500); })]);
        if (request === copyVersion) field('status').textContent = label + ' 복사 완료';
      } catch (_) {
        if (request !== copyVersion) return;
        showOutput(content); field('output').focus(); field('output').select();
        field('status').textContent = '선택된 내용을 직접 복사하세요.';
      } finally { clearTimeout(timer); }
    }
    field('preview').addEventListener('click', () => { if (ready()) { showOutput(buildText(current())); field('status').textContent = ''; } });
    field('copy').addEventListener('click', () => { if (ready()) copy(buildText(current()), '정리본'); });
    field('ai-copy').addEventListener('click', () => { if (ready()) copy(buildAiPrompt(current()), 'AI 작성용 내용'); });
    field('backup').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url;
      link.download = 'experience-notes-' + new Date().toISOString().slice(0, 10) + '.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      field('status').textContent = '전체 경험 백업 파일 저장';
    });
    field('import').addEventListener('click', () => field('file').click());
    field('file').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const incoming = parsed.version === 1 ? migrateLegacy(parsed) : normalizeState(parsed);
        state = mergeState(state, incoming); refresh(); save();
        field('status').textContent = '백업을 불러왔어요. 기존 경험도 유지됩니다.';
      } catch (_) { field('status').textContent = '백업 파일을 읽지 못했어요. 기존 경험은 유지됩니다.'; }
      event.target.value = '';
    });
    refresh();
  }
  return { storageKey, legacyKey, createDraft, normalizeState, migrateLegacy, loadState, mergeState, buildText, buildAiPrompt, hasContent, mount };
});
