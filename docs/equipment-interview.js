(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EquipmentInterview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s·\-_/.,()[\]:]/g,'');
  const statuses = {new:'미정리',review:'복습 필요',done:'정리 완료'};
  const empty = () => ({answer:'',memo:'',status:'new',starred:false});
  const noteId = (item,company = '') => item.id + (company ? '--' + company : '');
  function validateCatalog(raw) {
    if (raw?.version !== 1 || raw.sourceType !== 'reported-interview-compilation' || !Array.isArray(raw.items) || !Array.isArray(raw.companies) || !Array.isArray(raw.categories)) throw new Error('면접 자료 형식 오류');
    const companies = new Map(raw.companies.map(c => [c.id,c.sourceRows]));
    const categories = new Set(raw.categories.map(c => c.id));
    const guidance = raw.answerGuidance;
    if (guidance?.version !== 1 || !guidance.references || !guidance.companyContexts || typeof guidance.notice !== 'string') throw new Error('답변 가이드 형식 오류');
    for (const reference of Object.values(guidance.references)) {
      const url = new URL(reference.url);
      if (url.protocol !== 'https:' || typeof reference.title !== 'string') throw new Error('참고 자료 주소 오류');
    }
    const strings = (value,keys) => value && keys.every(k => typeof value[k] === 'string' && value[k].trim());
    const refsValid = refs => Array.isArray(refs) && refs.every(k => Object.prototype.hasOwnProperty.call(guidance.references,k));
    for (const [company,context] of Object.entries(guidance.companyContexts)) {
      if (!companies.has(company) || !strings(context,['fact','connection']) || !refsValid(context.refs)) throw new Error('회사별 안내 오류');
    }
    const ids = new Set();
    for (const item of raw.items) {
      if (!/^equip-[a-z]+$/.test(item.id) || ids.has(item.id) || !categories.has(item.category) ||
          !['title','prompt','focus'].every(k => typeof item[k] === 'string' && item[k].trim()) ||
          !Array.isArray(item.sources) || !item.sources.length) throw new Error('면접 항목 오류');
      ids.add(item.id);
      const refs = new Set();
      for (const source of item.sources) {
        const key = source.company + ':' + source.number;
        if (!companies.has(source.company) || !Number.isInteger(source.number) || source.number < 1 || source.number > companies.get(source.company) ||
            !Number.isInteger(source.page) || source.page < 1 || source.page > 30 || !/^202[56] [상하]$/.test(source.period) ||
            typeof source.role !== 'string' || typeof source.english !== 'boolean' || typeof source.japaneseRelated !== 'boolean' || refs.has(key)) throw new Error('출처 항목 오류');
        refs.add(key);
      }
      if (item.sources.some(s => s.english) && typeof item.englishPrompt !== 'string') throw new Error('영어 연습문 오류');
      const guide = item.guide;
      if (!strings(guide,['evaluation','direction','example','caution']) || !['concept','hypothetical','approach'].includes(guide.kind) ||
          !Array.isArray(guide.followups) || !guide.followups.every(q => typeof q === 'string') || !refsValid(guide.refs) ||
          !Array.isArray(guide.pressure) || !guide.pressure.every(p => strings(p,['question','answer','followup','followupAnswer','adapt'])) ||
          !Array.isArray(guide.technicalVariants) || !guide.technicalVariants.every(p => strings(p,['question','answer']) && refsValid(p.refs)) ||
          !guide.companyExamples || Object.entries(guide.companyExamples).some(([company,example]) => !companies.has(company) || !strings(example,['example']) || !refsValid(example.refs)) ||
          (item.sources.some(s => s.english) && !strings(guide,['englishExample']))) throw new Error('답변 가이드 항목 오류');
    }
    return raw;
  }
  function matchingSources(item, filter = {}) {
    return item.sources.filter(s => (!filter.company || s.company === filter.company) &&
      (!filter.period || s.period === filter.period) &&
      (filter.language !== 'english' || s.english) && (filter.language !== 'japanese' || s.japaneseRelated));
  }
  const aliases = {
    'equip-rk':'CE CS CSE FE FSE FST FPE FAE Customer Engineer Field Service Engineer',
    'equip-rc':'CE CS CSE FE FSE PS PSE 직무 차이', 'equip-sk':'CE CS CSE FE FSE FST FPE FAE 역량',
    'equip-dep':'증착 CVD PVD ALD RF Sputtering 스퍼터링', 'equip-et':'식각 Etch Etching MOSFET',
    'equip-pa':'플라즈마 Plasma', 'equip-vc':'진공 Vacuum PM 예방정비',
    'equip-eu':'EUV 노광 Lithography 주석 광원', 'equip-mb':'메모리 DRAM NAND 디램 낸드',
    'equip-sn':'Sn 주석 녹는점 끓는점', 'equip-cl':'Dry Cleaning 건식 세정',
    'equip-el':'PCB 레이저 전자 기계 소자 MOSFET', 'equip-dt':'Excel 엑셀 데이터 분석',
    'equip-pg':'C언어 코딩 AI 인공지능 프로그래밍', 'equip-ts':'Troubleshooting 트러블 슈팅 장비다운 로그',
    'equip-oc':'On-call 온콜 긴급 호출 출근', 'equip-sh':'교대 야간 근무', 'equip-ph':'방진복 클린룸 체력',
    'equip-te':'팀워크 협업', 'equip-lf':'리더십 팔로워십', 'equip-vr':'칩메이커 제조사 장비사',
  };
  function filterItems(catalog, filter = {}, notes = {}) {
    const companyMap = new Map(catalog.companies.map(c => [c.id,c.name]));
    const terms = String(filter.search || '').trim().split(/\s+/).filter(Boolean).map(normalize);
    return catalog.items.flatMap(item => {
      if (filter.category === 'pressure' ? !item.guide.pressure.length : filter.category && item.category !== filter.category) return [];
      const sources = matchingSources(item,filter);
      if (!sources.length) return [];
      const note = notes[noteId(item,filter.company)] || empty();
      if (filter.state === 'starred' && !note.starred) return [];
      if (filter.state === 'written' && !note.answer.trim() && !note.memo.trim()) return [];
      if (statuses[filter.state] && note.status !== filter.state) return [];
      const haystack = normalize([item.title,item.prompt,item.englishPrompt,aliases[item.id],
        ...item.guide.pressure.flatMap(p => [p.question,p.followup]), ...item.guide.technicalVariants.map(p => p.question),
        ...sources.map(s => [companyMap.get(s.company),s.company,s.role,s.period].join(' '))].join(' '));
      if (!terms.every(term => haystack.includes(term))) return [];
      return [{...item,matchedSources:sources}];
    });
  }
  function noteText(item,note,companyName = '') {
    return [item.title + (companyName ? ' · ' + companyName : ' · 공통'),item.prompt,
      note.answer.trim() ? '[내 답변]\n' + note.answer.trim() : '',
      note.memo.trim() ? '[복습 메모]\n' + note.memo.trim() : ''].filter(Boolean).join('\n\n');
  }
  function ranges(numbers) {
    const sorted = [...new Set(numbers)].sort((a,b) => a-b);
    const result = [];
    for (let i = 0; i < sorted.length; i++) {
      let end = sorted[i]; const start = end;
      while (sorted[i+1] === end+1) end = sorted[++i];
      result.push(start === end ? String(start) : start + '–' + end);
    }
    return result.join(', ');
  }
  const exampleLabels = {concept:'개념 답변 예시',hypothetical:'가상 경험 예시 · 본인 경험으로 교체',approach:'답변 예시 · 본인 상황에 맞게 수정'};
  function referenceHtml(catalog,refs) {
    return refs.map(key => { const ref = catalog.answerGuidance.references[key]; return `<a href="${escape(ref.url)}" target="_blank" rel="noopener noreferrer">${escape(ref.title)}</a>`; }).join('');
  }
  function guideHtml(item,catalog,filter = {}) {
    const guide = item.guide;
    const companyExample = guide.companyExamples[filter.company];
    const scope = companyExample ? catalog.companies.find(c => c.id === filter.company).name + ' ' : '';
    const guideRefs = [...new Set([...guide.refs,...(companyExample?.refs || [])])];
    const terms = String(filter.search || '').trim().split(/\s+/).filter(Boolean).map(normalize);
    const matches = p => terms.length && terms.every(t => normalize(p.question + ' ' + p.followup).includes(t));
    const pressureFirst = filter.category === 'pressure' || guide.pressure.some(matches);
    const pressure = guide.pressure.length ? `<section class="equipment-pressure"><h3>압박 질문 연습</h3><p class="equipment-guide-caption">추가로 작성한 연습 질문입니다.</p>${guide.pressure.map(p => `<details class="equipment-pressure-case"${filter.category === 'pressure' || matches(p) ? ' open' : ''}>
      <summary>${escape(p.question)}</summary><div><p>${escape(p.answer)}</p><h4>이렇게 다시 물으면</h4><p class="equipment-pressure-question">${escape(p.followup)}</p><p>${escape(p.followupAnswer)}</p><p class="equipment-guide-caption">${escape(p.adapt)}</p></div></details>`).join('')}</section>` : '';
    const context = catalog.answerGuidance.companyContexts[filter.company];
    const connected = ['mv','vr','rm','ck','ce','cv','rk','sk','rc','pp','st','ca'].includes(item.id.slice(6));
    const company = context && connected ? `<details class="equipment-company-context"><summary>${escape(catalog.companies.find(c => c.id === filter.company).name)} 업무에 연결하기</summary><div><h4>공식 자료에서 확인한 내용</h4><p>${escape(context.fact)}</p><h4>답변에 연결하는 방법 · 해석</h4><p>${escape(context.connection)}</p><div class="equipment-guide-links">${referenceHtml(catalog,context.refs)}</div></div></details>` : '';
    return `<section class="equipment-answer-guide" aria-label="${escape(item.title)} 답변 가이드">
      <div><h3>평가 관점 · 해석</h3><p>${escape(guide.evaluation)}</p></div>
      <div><h3>답변 방향</h3><p>${escape(guide.direction)}</p></div>
      ${pressureFirst ? pressure : ''}
      <div class="equipment-guide-example"><h3>${escape(scope)}예시 답변</h3><p class="equipment-guide-caption">${escape(exampleLabels[guide.kind])}</p><p>${escape(companyExample?.example || guide.example)}</p>
      <button type="button" data-equipment-copy-example>예시 답변 복사</button><p data-equipment-example-status role="status"></p><textarea data-equipment-example-fallback readonly rows="6" aria-label="직접 복사할 예시 답변" hidden></textarea></div>
      <div><h3>답변할 때 주의할 점</h3><p>${escape(guide.caution)}</p></div>
      <details class="equipment-followups"><summary>이어질 수 있는 질문</summary><ul>${guide.followups.map(q => '<li>' + escape(q) + '</li>').join('')}</ul></details>
      ${pressureFirst ? '' : pressure}
      ${guide.technicalVariants.map(p => `<details class="equipment-followups"><summary>${escape(p.question)}</summary><p>${escape(p.answer)}</p><div class="equipment-guide-links">${referenceHtml(catalog,p.refs)}</div></details>`).join('')}
      ${company}
      ${guideRefs.length ? `<details class="equipment-guide-references"><summary>참고한 공식·기술 자료</summary><div class="equipment-guide-links">${referenceHtml(catalog,guideRefs)}</div></details>` : ''}
      </section>`;
  }
  function exampleText(item,company = '') {
    return [item.title,'[' + exampleLabels[item.guide.kind] + ']',item.guide.companyExamples[company]?.example || item.guide.example,'[바꿔 쓸 때]\n' + item.guide.caution].join('\n\n');
  }
  let mounted = false, root, hooks, catalog, loading, copyVersion = 0;
  const field = key => root.querySelector('[data-equipment="' + key + '"]');
  const optionList = rows => rows.map(([id,label]) => '<option value="' + escape(id) + '">' + escape(label) + '</option>').join('');
  const filters = () => Object.fromEntries(['company','category','period','language','state','search'].map(k => [k,field(k).value]));
  const companyName = id => catalog.companies.find(c => c.id === id)?.name || '';
  function sourceDetails(sources) {
    const groups = new Map();
    for (const s of sources) {
      const label = companyName(s.company) + ' · ' + s.period + ' · ' + s.role;
      if (!groups.has(label)) groups.set(label,[]);
      groups.get(label).push(s);
    }
    return [...groups].map(([label,rows]) => `<li><span>${escape(label)}</span><br>원자료 번호 ${ranges(rows.map(s => s.number))} · ${ranges(rows.map(s => s.page))}쪽${rows.some(s => s.english) ? ' · 영어 답변 요구 포함' : ''}${rows.some(s => s.japaneseRelated) ? ' · 일본어 관련' : ''}</li>`).join('');
  }
  function fillBody(card) {
    if (card.dataset.ready) return;
    card.dataset.ready = 'true';
    const item = catalog.items.find(i => i.id === card.dataset.equipmentId);
    const filter = filters();
    const sources = matchingSources(item,filter);
    const note = hooks.getNotes()[card.dataset.noteId] || empty();
    const scope = companyName(filter.company) || '공통';
    card.querySelector('[data-equipment-body]').innerHTML = `<p class="equipment-question">${escape(item.prompt)}</p>
      ${guideHtml(item,catalog,filter)}
      ${sources.some(s => s.english) ? `<details class="equipment-language-guide"${filter.language === 'english' ? ' open' : ''}><summary>영어 질문·답변 예시</summary><div class="equipment-english"><p class="equipment-guide-caption">연습용 예문 · 경험과 수준은 본인 사실로 수정</p><p lang="en"><strong>${escape(item.englishPrompt)}</strong></p><p lang="en">${escape(item.guide.englishExample)}</p></div></details>` : ''}
      ${sources.some(s => s.japaneseRelated) && item.guide.japaneseExample ? `<details class="equipment-language-guide"${filter.language === 'japanese' ? ' open' : ''}><summary>일본어 답변 연습</summary><div class="equipment-english"><p class="equipment-guide-caption">연습용 예문 · 경험과 수준은 본인 사실로 수정</p><p lang="ja">${escape(item.guide.japaneseExample)}</p></div></details>` : ''}
      <label>${escape(scope)} 답변<textarea data-equipment-note="answer" rows="5" placeholder="본인의 실제 경험과 근거로 정리하세요.">${escape(note.answer)}</textarea></label>
      <label>복습 메모<textarea data-equipment-note="memo" rows="2" placeholder="다시 확인할 개념이나 후속 질문">${escape(note.memo)}</textarea></label>
      <div class="interview-note-actions"><label>복습 상태<select data-equipment-note="status">${optionList(Object.entries(statuses))}</select></label><button type="button" data-equipment-copy>답변 복사</button></div>
      <p data-equipment-copy-status role="status"></p><textarea data-equipment-fallback readonly rows="6" aria-label="직접 복사할 답변" hidden></textarea>
      <details class="interview-original"><summary>질문 출처</summary><ul class="equipment-sources">${sourceDetails(sources)}</ul></details>`;
    card.querySelector('[data-equipment-note="status"]').value = note.status;
  }
  function renderList() {
    if (!catalog) return;
    copyVersion++;
    const oldOpen = new Set([...field('list').querySelectorAll('[data-equipment-id][open]')].map(n => n.dataset.noteId));
    const filter = filters(), notes = hooks.getNotes();
    const shown = filterItems(catalog,filter,notes);
    field('count').textContent = '연습 질문 ' + shown.length + '개';
    field('list').innerHTML = shown.map(item => {
      const id = noteId(item,filter.company), note = notes[id] || empty();
      const labels = [...new Set(item.matchedSources.map(s => companyName(s.company)))].join(' · ');
      const category = catalog.categories.find(c => c.id === item.category).name;
      return `<details class="interview-item" data-equipment-id="${item.id}" data-note-id="${id}"${oldOpen.has(id) ? ' open' : ''}>
        <summary><button type="button" data-equipment-star aria-pressed="${note.starred}" aria-label="${escape(item.title)} 북마크">${note.starred ? '★' : '☆'}</button>
        <span class="interview-summary"><strong>${escape(item.title)}</strong><span>${escape(labels + ' · ' + category)}${note.status === 'new' ? '' : ' · ' + statuses[note.status]}</span></span></summary>
        <div class="interview-item-body" data-equipment-body></div></details>`;
    }).join('') || '<p class="interview-empty">조건에 맞는 질문이 없습니다.</p>';
    field('list').querySelectorAll('[open]').forEach(fillBody);
  }
  async function load() {
    if (loading) return loading;
    field('loading').textContent = '질문 불러오는 중…';
    field('content').hidden = true;
    loading = (async () => {
      try {
        const response = await fetch('interview/equipment.json?v=20261121-2');
        if (!response.ok) throw new Error('fetch');
        catalog = validateCatalog(await response.json());
        field('company').innerHTML = '<option value="">전체 회사</option>' + optionList(catalog.companies.map(c => [c.id,c.name]));
        field('category').innerHTML = '<option value="">전체 주제</option><option value="pressure">압박·꼬리 질문</option>' + optionList(catalog.categories.map(c => [c.id,c.name]));
        const periods = [...new Set(catalog.items.flatMap(i => i.sources.map(s => s.period)))].sort();
        field('period').innerHTML = '<option value="">전체 시기</option>' + optionList(periods.map(p => [p,p]));
        field('info').textContent = catalog.source + ' · 첨부 ' + catalog.sourceImages + '장. AMAT 158개, ASML 362개, TEL 215개, 램리서치 291개 번호를 대조해 질문 ' + catalog.questionRows.toLocaleString() + '개 항목을 ' + catalog.items.length + '개 연습 주제로 묶었습니다. 질문이 아닌 후기 메모 2개는 제외했습니다. ' + catalog.notice + ' 번호는 원자료 행 번호이며 서로 다른 면접 횟수가 아닙니다. 영어 예문은 연습용으로 재작성했습니다. 전체 회사에서는 공통 답변, 회사를 선택하면 회사별 답변을 저장합니다. 답변은 이 브라우저에만 저장됩니다.';
        field('info').textContent += ' ' + catalog.answerGuidance.notice;
        renderList(); field('loading').hidden = true; field('content').hidden = false;
      } catch (_) {
        field('loading').innerHTML = '질문을 불러오지 못했습니다. <button type="button" data-equipment-retry>다시 불러오기</button>';
      } finally { loading = null; }
    })();
    return loading;
  }
  function mount(host,callbacks) {
    if (mounted) return;
    mounted = true; root = host; hooks = callbacks;
    root.innerHTML = `<p data-equipment="loading" role="status"></p><div data-equipment="content" hidden>
      <div class="interview-filters equipment-filters">
        <label>회사<select data-equipment="company"></select></label><label>주제<select data-equipment="category"></select></label>
        <label>검색<input type="search" data-equipment="search" placeholder="질문·공정·키워드"></label>
        <label>시기<select data-equipment="period"></select></label>
        <label>외국어<select data-equipment="language">${optionList([['','전체'],['english','영어 답변 요구'],['japanese','일본어 관련']])}</select></label>
        <label>내 기록<select data-equipment="state">${optionList([['','전체'],['starred','북마크'],['review','복습 필요'],['done','정리 완료'],['written','작성한 답변'],['new','미정리']])}</select></label>
      </div><div class="interview-result-line"><p data-equipment="count"></p><button type="button" data-equipment="reset">필터 초기화</button></div>
      <div class="interview-list" data-equipment="list"></div>
      <details class="interview-info"><summary>자료 안내</summary><p data-equipment="info"></p></details></div>`;
    for (const key of ['company','category','period','language','state']) field(key).addEventListener('change',renderList);
    field('search').addEventListener('input',renderList);
    field('reset').addEventListener('click',() => { for (const key of ['company','category','period','language','state','search']) field(key).value = ''; renderList(); });
    root.addEventListener('click',event => { if (event.target.closest('[data-equipment-retry]')) load(); });
    field('list').addEventListener('toggle',event => { if (event.target.matches('[data-equipment-id]') && event.target.open) fillBody(event.target); },true);
    field('list').addEventListener('click',async event => {
      const card = event.target.closest('[data-equipment-id]'); if (!card) return;
      const item = catalog.items.find(i => i.id === card.dataset.equipmentId);
      const id = card.dataset.noteId, note = hooks.getNotes()[id] || empty();
      if (event.target.closest('[data-equipment-star]')) {
        event.preventDefault(); event.stopPropagation();
        hooks.updateNote(id,{...note,starred:!note.starred}); renderList();
        field('list').querySelector('[data-note-id="' + id + '"] [data-equipment-star]')?.focus();
      } else if (event.target.closest('[data-equipment-copy]') || event.target.closest('[data-equipment-copy-example]')) {
        const isExample = Boolean(event.target.closest('[data-equipment-copy-example]'));
        const status = card.querySelector(isExample ? '[data-equipment-example-status]' : '[data-equipment-copy-status]');
        const fallback = card.querySelector(isExample ? '[data-equipment-example-fallback]' : '[data-equipment-fallback]');
        if (!isExample && !note.answer.trim() && !note.memo.trim()) { status.textContent = '정리한 내용을 먼저 적어 주세요.'; return; }
        const content = isExample ? exampleText(item,filters().company) : noteText(item,note,companyName(filters().company));
        const request = ++copyVersion; let timer;
        fallback.hidden = true;
        try {
          await Promise.race([navigator.clipboard.writeText(content),new Promise((_,reject) => { timer = setTimeout(reject,1500); })]);
          if (request === copyVersion && card.isConnected) status.textContent = isExample ? '예시 답변 복사 완료 · 본인 사실로 바꿔 연습하세요.' : '답변 복사 완료';
        } catch (_) {
          if (request !== copyVersion || !card.isConnected) return;
          const box = fallback; box.value = content; box.hidden = false; box.focus(); box.select();
          status.textContent = '선택된 내용을 직접 복사하세요.';
        } finally { clearTimeout(timer); }
      }
    });
    function update(event) {
      const key = event.target.dataset.equipmentNote; if (!key || (key === 'status') !== (event.type === 'change')) return;
      const card = event.target.closest('[data-equipment-id]'), id = card.dataset.noteId;
      copyVersion++;
      hooks.updateNote(id,{...(hooks.getNotes()[id] || empty()),[key]:event.target.value});
      card.querySelector('[data-equipment-copy-status]').textContent = '';
      card.querySelector('[data-equipment-fallback]').hidden = true;
      if (key === 'status') renderList();
    }
    field('list').addEventListener('input',update); field('list').addEventListener('change',update);
    load();
  }
  return {mount,refresh:renderList,validateCatalog,filterItems,matchingSources,noteId,noteText,ranges,guideHtml,exampleText};
});
