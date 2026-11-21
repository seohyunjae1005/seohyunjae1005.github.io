(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => {
    const stamp = new Date(value);
    return Number.isFinite(stamp.getTime()) ? new Intl.DateTimeFormat('ko-KR', {year:'numeric',month:'numeric',day:'numeric',timeZone:'Asia/Seoul'}).format(stamp) : '날짜 미확인';
  };
  const url = value => {
    try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : ''; }
    catch { return ''; }
  };

  function render(data) {
    const root = document.querySelector('#industry-briefing');
    const status = root.querySelector('[data-brief-status]');
    const body = root.querySelector('[data-brief-body]');
    if (data?.version !== 'industry_briefing_v1' || !Array.isArray(data.sources)
      || !Array.isArray(data.facts) || !Array.isArray(data.overview) || !Array.isArray(data.issues)
      || data.overview.length !== 4 || data.issues.length !== 3) throw new Error('브리핑 형식 오류');
    const sources = new Map(data.sources.map(row => [row.id, row]));
    const facts = new Map(data.facts.map(row => [row.id, row]));
    const allRefs = [...data.overview, ...data.issues].flatMap(row => row.fact_ids || []);
    if (allRefs.some(id => !facts.has(id)) || data.facts.some(fact => !sources.has(fact.source_id))) throw new Error('브리핑 출처 오류');
    const sourceLink = source => {
      const target = url(source?.url);
      const label = `${source?.publisher || ''} · ${date(source?.published_at)}`;
      return target ? `<a href="${escape(target)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(label);
    };
    const fact = row => `<li><p>${row.nature === '전망' ? '<span class="brief-label">전망</span> ' : ''}${escape(row.statement_ko)}</p>
      <div class="brief-source-link">${sourceLink(sources.get(row.source_id))}</div></li>`;
    root.querySelector('[data-brief-date]').textContent = `확인 ${date(data.checked_at)}`;
    const old = Date.now() - Date.parse(data.checked_at) > 7 * 86400000;
    status.hidden = !old && data.refresh_status === 'complete';
    status.textContent = data.refresh_status === 'failed' || old
      ? '갱신이 지연되어 마지막 확인 자료를 보여줍니다. 출처의 발표일을 확인해 주세요.'
      : data.refresh_status === 'partial' ? '일부 출처는 원문을 확인한 발췌를 사용합니다.' : '';
    root.querySelector('[data-brief-overview]').innerHTML = data.overview.map(row => `
      <div><h4>${escape(row.area)}</h4><p>${escape(row.text_ko)}</p>
      ${row.fact_ids.length ? `<details class="brief-overview-evidence"><summary>근거</summary><ul>${row.fact_ids.map(id => fact(facts.get(id))).join('')}</ul></details>` : ''}</div>`).join('');
    root.querySelector('[data-brief-issues]').innerHTML = data.issues.map((row, index) => `
      <details class="brief-issue" data-brief-issue="${index}">
        <summary>${escape(row.title_ko)}</summary>
        <div class="brief-issue-body">
          <section><h4>확인된 사실</h4><ul class="brief-facts">${row.fact_ids.map(id => fact(facts.get(id))).join('')}</ul></section>
          <section><h4>AI 해석</h4><p>${escape(row.why_ko)}</p>
            <ul>${row.perspectives.map(text => `<li>${escape(text)}</li>`).join('')}</ul>
            <p class="brief-samsung"><strong>삼성과의 접점</strong> ${escape(row.samsung_connection_ko)}</p></section>
          <section class="brief-questions"><h4>생각해볼 질문</h4><ul>${row.questions.map(text => `<li>${escape(text)}</li>`).join('')}</ul></section>
        </div>
      </details>`).join('');
    const usedSourceIds = new Set(data.facts.map(row => row.source_id));
    root.querySelector('[data-brief-sources]').innerHTML = [...sources.values()].filter(s => usedSourceIds.has(s.id)).map(source => `
      <li><p>${sourceLink(source)} <span class="brief-label">${escape(source.kind)}</span></p>
        <p>${escape(source.title)}</p>
        <p class="brief-source-meta">${source.scope === 'reviewed_excerpt' ? `원문 발췌 확인 ${date(source.reviewed_at)}` : `본문 확인 ${date(source.checked_at)}`}${source.period_label ? ` · ${escape(source.period_label)}` : ''}</p>
        <details><summary>인용 확인</summary>${data.facts.filter(f => f.source_id === source.id).map(f => `<blockquote>${escape(f.quote)}</blockquote>`).join('')}</details>
      </li>`).join('');
    root.querySelector('[data-brief-generated]').textContent = `분석 ${date(data.generated_at)} · 최근 자료와 확인된 배경자료를 함께 사용한 AI 브리핑입니다.`;
    body.hidden = false;
    root.dataset.loaded = 'true';
  }

  async function init() {
    const root = document.querySelector('#industry-briefing');
    if (!root) return;
    try {
      const response = await fetch('data/industry-briefing.json', {cache:'no-cache'});
      if (!response.ok) throw new Error('브리핑 로드 실패');
      render(await response.json());
    } catch {
      root.querySelector('[data-brief-body]').hidden = true;
      root.querySelector('[data-brief-status]').hidden = false;
      root.querySelector('[data-brief-status]').textContent = '브리핑을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
