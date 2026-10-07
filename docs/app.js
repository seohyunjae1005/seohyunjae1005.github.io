const state = {
  articles: [],
  company: "all",
  relevance: "all",
  job: "all",
  domain: "all",
  signal: "all",
  days: "all",
  query: "",
  language: "original",
  translatedCount: 0,
  trendDays: "30",
  trendSummary: null,
  monthlyTrendReport: null,
  processFocus: false,
  chapter: "trend",
  jdAnalysis: null,
};

const grid = document.querySelector("#article-grid");
const empty = document.querySelector("#empty");
const resultLine = document.querySelector("#result-line");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "날짜 미상";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 미상";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function withinDays(value, days) {
  if (days === "all") return true;
  const published = new Date(value).getTime();
  if (Number.isNaN(published)) return false;
  const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
  return published >= cutoff;
}

function includesValue(values, selected) {
  return selected === "all" || (values || []).includes(selected);
}

function visibleArticles() {
  const query = state.query.trim().toLocaleLowerCase("ko");
  return state.articles.filter((article) => {
    const searchable = [
      article.title,
      article.summary,
      article.title_ko,
      article.summary_ko,
      article.company,
      ...(article.matched_keywords || []),
      ...(article.tech_domains || []),
      ...(article.job_roles || []),
      ...(article.signal_types || []),
      ...(article.process_evidence || []),
    ].join(" ").toLocaleLowerCase("ko");

    return (state.company === "all" || article.company === state.company)
      && (state.relevance === "all" || article.relevance === state.relevance)
      && includesValue(article.job_roles, state.job)
      && includesValue(article.tech_domains, state.domain)
      && includesValue(article.signal_types, state.signal)
      && (!state.processFocus || ["direct", "indirect"].includes(article.process_fit))
      && withinDays(article.published_at, state.days)
      && (!query || searchable.includes(query));
  }).sort((left, right) => {
    if (!state.processFocus) return 0;
    const rank = { direct: 0, indirect: 1, background: 2 };
    const fitDifference = (rank[left.process_fit] ?? 2) - (rank[right.process_fit] ?? 2);
    if (fitDifference !== 0) return fitDifference;
    return new Date(right.published_at).getTime() - new Date(left.published_at).getTime();
  });
}

function badgeList(values, className, limit = 3) {
  return (values || []).slice(0, limit)
    .map((value) => `<span class="badge ${className}">${escapeHtml(value)}</span>`)
    .join("");
}

function confidenceLabel(value) {
  return { high: "높음", medium: "보통", low: "낮음" }[value] || "미표시";
}

function rankingList(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<li class="trend-empty">집계할 신호가 아직 없습니다.</li>';
  }
  const maximum = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return rows.map((row) => {
    const count = Number(row.count || 0);
    const width = Math.max(8, Math.round((count / maximum) * 100));
    return `
      <li>
        <div class="rank-label"><span>${escapeHtml(row.name)}</span><strong>${count}건</strong></div>
        <span class="rank-bar" aria-hidden="true"><i style="width:${width}%"></i></span>
      </li>
    `;
  }).join("");
}

function momentumList(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<li class="trend-empty">뚜렷하게 증가한 신호가 없습니다.</li>';
  }
  return rows.map((row) => `
    <li><span>${escapeHtml(row.name)}</span><strong>+${Number(row.delta || 0)}건</strong></li>
  `).join("");
}

function profileTags(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '<span class="profile-empty">분류 없음</span>';
  return rows.map((row) => `
    <span>${escapeHtml(row.name)} <small>${Number(row.count || 0)}</small></span>
  `).join("");
}

function renderCompanyProfiles(rows) {
  const container = document.querySelector("#company-profile-list");
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = '<p class="trend-empty">최근 30일 핵심 기업 신호가 없습니다.</p>';
    return;
  }
  container.innerHTML = rows.map((row) => `
    <button class="company-profile" type="button" data-profile-company="${escapeHtml(row.company)}">
      <span class="profile-title"><strong>${escapeHtml(row.company)}</strong><em>${Number(row.high_relevance_count || 0)}건</em></span>
      <span class="profile-label">기술</span>
      <span class="profile-tags">${profileTags(row.top_tech_domains)}</span>
      <span class="profile-label">직무</span>
      <span class="profile-tags">${profileTags(row.top_job_roles)}</span>
    </button>
  `).join("");
}

function renderMonthlyReport() {
  const payload = state.monthlyTrendReport;
  const container = document.querySelector("#monthly-ai-report");
  const report = payload?.report;
  if (!report) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  document.querySelector("#monthly-report-title").textContent = report.headline_ko || "최근 30일 공정 직무 동향";
  document.querySelector("#monthly-report-date").textContent = `분석 ${formatDate(payload.generated_at)}`;
  document.querySelector("#monthly-report-summary").textContent = report.summary_ko || "";
  const metrics = new Map((payload.evidence?.metrics || []).map((row) => [row.id, row.text_ko]));
  const articles = new Map((payload.evidence?.articles || []).map((row) => [row.id, row]));
  document.querySelector("#monthly-findings").innerHTML = (report.key_findings || []).map((row) => `
    <article>
      <strong>${escapeHtml(row.title_ko)}</strong>
      <p>${escapeHtml(row.interpretation_ko)}</p>
      <div class="evidence-chips">${(row.evidence_metric_ids || []).map((id) => `<span title="${escapeHtml(metrics.get(id) || "")}">${escapeHtml(id)}</span>`).join("")}</div>
    </article>
  `).join("");
  const processActions = (report.role_actions || []).filter((row) => row.role === "공정기술·양산기술");
  document.querySelector("#monthly-role-actions").innerHTML = processActions.map((row) => `
    <article>
      <strong>${escapeHtml(row.role)}</strong>
      <span>현업에서 볼 것</span>
      <ul>${(row.watch_points_ko || []).map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
      <span>취업 준비 학습</span>
      <ul>${(row.study_points_ko || []).map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
    </article>
  `).join("") || '<p class="trend-empty">공정 직무 제안이 검증되지 않아 표시하지 않습니다.</p>';
  document.querySelector("#monthly-company-insights").innerHTML = (report.company_insights || []).map((row) => `
    <article>
      <strong>${escapeHtml(row.company)}</strong>
      <p>${escapeHtml(row.observation_ko)}</p>
      <div class="evidence-chips">${(row.evidence_article_ids || []).map((id) => `<span>${escapeHtml(id)}</span>`).join("")}</div>
    </article>
  `).join("");
  const citedMetricIds = new Set((report.key_findings || []).flatMap((row) => row.evidence_metric_ids || []));
  const citedArticleIds = new Set((report.company_insights || []).flatMap((row) => row.evidence_article_ids || []));
  document.querySelector("#monthly-evidence-list").innerHTML = [
    ...[...citedMetricIds].map((id) => metrics.has(id) ? `<p><strong>${escapeHtml(id)}</strong> ${escapeHtml(metrics.get(id))}</p>` : ""),
    ...[...citedArticleIds].map((id) => {
      const row = articles.get(id);
      return row ? `<p><strong>${escapeHtml(id)}</strong> <a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.company)} — ${escapeHtml(row.title)}</a></p>` : "";
    }),
  ].join("");
  document.querySelector("#monthly-limitations").innerHTML = (report.limitations_ko || []).map((value) => `<li>${escapeHtml(value)}</li>`).join("");
}

function renderTrendSummary() {
  const summary = state.trendSummary;
  const board = document.querySelector("#trend-board");
  const windowData = summary?.windows?.[state.trendDays];
  if (!windowData) {
    board.hidden = true;
    return;
  }

  board.hidden = false;
  document.querySelector("#trend-article-count").textContent = windowData.article_count ?? 0;
  document.querySelector("#trend-high-count").textContent = windowData.high_relevance_count ?? 0;
  document.querySelector("#trend-company-count").textContent = windowData.company_count ?? 0;
  document.querySelector("#trend-tech-list").innerHTML = rankingList(windowData.top_tech_domains);
  document.querySelector("#trend-job-list").innerHTML = rankingList(windowData.top_job_roles);
  document.querySelector("#trend-company-list").innerHTML = rankingList(windowData.top_companies);
  document.querySelector("#momentum-tech-list").innerHTML = momentumList(summary.momentum_30d?.tech_domains);
  document.querySelector("#momentum-job-list").innerHTML = momentumList(summary.momentum_30d?.job_roles);
  renderCompanyProfiles(summary.company_profiles_30d);
  document.querySelector("#trend-methodology").textContent = summary.methodology || "";
}

function bindTrendPeriodTabs() {
  document.querySelector("#trend-period-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trend-days]");
    if (!button) return;
    document.querySelectorAll("#trend-period-tabs button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    state.trendDays = button.dataset.trendDays;
    renderTrendSummary();
  });
}

function showChapter(chapter) {
  state.chapter = chapter;
  document.querySelector("#trend-chapter").hidden = chapter !== "trend";
  document.querySelector("#news-chapter").hidden = chapter !== "news";
  document.querySelector("#profile-chapter").hidden = chapter !== "profile";
  document.querySelector("#jd-chapter").hidden = chapter !== "jd";
  document.querySelectorAll("button[data-chapter]").forEach((button) => {
    const active = button.dataset.chapter === chapter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function jdLevelLabel(value) {
  return { required: "필수", required_unspecified: "자격 관련·표시 미확정", preferred: "우대", duty: "담당 업무", unspecified: "구분 없음" }[value] || "구분 없음";
}

function jdStrengthLabel(value) {
  return { strong: "공통 역량 2개 이상", partial: "공통 역량 1개", none: "경험 근거 없음" }[value] || "경험 근거 없음";
}

function jdCompetencyNames(ids) {
  const lookup = new Map((window.JDAnalyzer?.TAXONOMY || []).map((row) => [row.id, row.name]));
  return (ids || []).map((id) => lookup.get(id) || id);
}

const JD_CONTEXT_ROLE_MAP = {
  "공정·양산 엔지니어링": ["공정기술·양산기술"],
  "공정설계·R&D": ["R&D공정·공정설계"],
  "설비·장비 엔지니어링": ["설비기술·기반기술", "FSE·CE·장비기술"],
  "패키지·테스트": ["P&T·패키지개발", "평가분석·품질·PE"],
  "평가·분석·품질": ["평가분석·품질·PE"],
  "소자·회로": ["소자", "회로설계"],
  "소프트웨어·데이터·AI": ["SW·데이터·AI"],
};

const JD_CONTEXT_TECH_MAP = {
  wafer_processes: ["노광·마스크", "파운드리·로직·소자", "소재·부품"],
  yield_process: ["장비·Fab·인프라", "파운드리·로직·소자"],
  equipment: ["장비·Fab·인프라"],
  amhs: ["장비·Fab·인프라", "AI·데이터"],
  semiconductor_fundamentals: ["파운드리·로직·소자", "소재·부품"],
  semiconductor_experiment: ["소재·부품", "계측·검사"],
  programming: ["AI·데이터", "계측·검사"],
  data_ai: ["AI·데이터"],
};

function intersect(values, allowed) {
  const set = new Set(allowed || []);
  return (values || []).filter((value) => set.has(value));
}

function trackedCompanyName(input) {
  const detected = window.RoleNormalizer.detectCompany(input);
  if (detected) return detected;
  const normalized = String(input || "").trim().toLocaleLowerCase("ko");
  return [...new Set(state.articles.map((row) => row.company).filter(Boolean))]
    .find((value) => value.toLocaleLowerCase("ko") === normalized) || "";
}

function buildJdCompanyContext(companyInput, roleInput, result) {
  const company = trackedCompanyName(companyInput);
  if (!company) return { mode: "external", company: companyInput, articles: [] };
  const roleCategory = window.RoleNormalizer.mapRole(roleInput).category;
  const allowedRoles = JD_CONTEXT_ROLE_MAP[roleCategory] || [];
  const allowedTech = [...new Set((result.topStrategies || []).flatMap((row) => JD_CONTEXT_TECH_MAP[row.skillId] || []))];
  const scored = state.articles.filter((article) => article.company === company).map((article) => {
    const roleHits = intersect(article.job_roles, allowedRoles);
    const techHits = intersect(article.tech_domains, allowedTech);
    const processScore = article.process_fit === "direct" ? 2 : article.process_fit === "indirect" ? 1 : 0;
    return { article, roleHits, techHits, score: roleHits.length * 3 + techHits.length * 2 + processScore };
  }).filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.article.published_at) - new Date(left.article.published_at))
    .slice(0, 3)
    .map((row, index) => ({ ...row, id: `N${index + 1}` }));
  return { mode: "tracked", company, roleCategory, articles: scored };
}

function renderJdCompanyContext(company, role, result) {
  const container = document.querySelector("#jd-company-context");
  const context = buildJdCompanyContext(company, role, result);
  if (context.mode === "external") {
    container.innerHTML = `
      <div class="jd-context-status external">
        <span class="jd-interpretation-label">외부 회사 조사 모드</span>
        <strong>입력한 회사(${escapeHtml(company || "회사명 미입력")})는 현재 자동 추적 기업이 아닙니다.</strong>
        <p>JD 분석 결과는 그대로 사용할 수 있지만 회사 동향은 아직 결합하지 않습니다. 향후 공식 채용 페이지·뉴스룸·IR 자료를 조사하고 출처 등급과 확인일을 저장한 뒤 연결해야 합니다.</p>
      </div>`;
    return;
  }
  if (!context.articles.length) {
    container.innerHTML = `
      <div class="jd-context-status">
        <span class="jd-fact-label">추적 기업 · ${escapeHtml(context.company)}</span>
        <strong>현재 저장된 공식 기사 중 이 JD와 직접 연결할 근거를 찾지 못했습니다.</strong>
        <p>관련성이 약한 뉴스를 억지로 붙이지 않았습니다. JD 요구사항 분석은 위 결과대로 유지됩니다.</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="jd-context-status">
      <span class="jd-fact-label">추적 기업 · ${escapeHtml(context.company)}</span>
      <strong>JD 직무·기술 분류와 겹치는 최근 공식 기사 ${context.articles.length}건</strong>
      <p>기사 건수는 발표 빈도이며 채용 중요도·시장점유율을 뜻하지 않습니다.</p>
    </div>
    <div class="jd-context-list">${context.articles.map((row) => {
      const article = row.article;
      const connections = [...new Set([...row.roleHits, ...row.techHits, ...(article.process_fit && article.process_fit !== "background" ? [`공정 연결 ${article.process_fit}`] : [])])];
      return `<article>
        <div><span class="jd-fact-label">공식 동향 · ${row.id}</span><time>${escapeHtml(formatDate(article.published_at))}</time></div>
        <h4><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title_ko || article.title)}</a></h4>
        <p><b>자동 연결 근거</b> ${connections.map(escapeHtml).join(" · ")}</p>
        <p><span class="jd-interpretation-label">학습 제안 · ${row.id}</span> 이 발표에서 확인되는 ${escapeHtml(connections.slice(0, 2).join("·"))} 내용을 지원 직무의 실제 업무와 어떻게 연결할지 원문을 읽고 정리하세요. 이를 JD의 필수 역량으로 단정하면 안 됩니다.</p>
      </article>`;
    }).join("")}</div>`;
}

function renderJdAnalysis(result) {
  const results = document.querySelector("#jd-results");
  const company = document.querySelector("#jd-company").value.trim();
  const role = document.querySelector("#jd-role").value.trim();
  const sourceType = document.querySelector("#jd-source-type").value;
  const sourceLabels = {
    official: "A · 기업 공식 채용공고",
    platform: "B · 채용 플랫폼·대행사",
    unknown: "C · 출처 미확인 복사본",
  };
  document.querySelector("#jd-result-title").textContent = [company, role].filter(Boolean).join(" · ") || "JD 분석 결과";
  document.querySelector("#jd-source-grade").textContent = `${sourceLabels[sourceType]} · 사용자 선택`;
  const collectedAt = document.querySelector("#jd-collected-at").value;
  const sourceUrl = document.querySelector("#jd-source-url").value.trim();
  document.querySelector("#jd-source-meta").textContent = [
    collectedAt ? `원문 확인일 ${collectedAt}` : "원문 확인일 미입력",
    sourceUrl ? `공고 주소 ${sourceUrl}` : "공고 주소 미입력",
  ].join(" · ");
  document.querySelector("#jd-limitations").innerHTML = result.limitations.length
    ? `<strong>분석 범위 확인</strong><ul>${result.limitations.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : "<strong>분석 범위 확인</strong><p>입력된 JD 원문과 저장된 프로필만 사용했습니다.</p>";

  document.querySelector("#jd-required-list").innerHTML = result.requiredChecklist.length
    ? result.requiredChecklist.map((row) => `
      <article class="jd-required-card">
        <div><span class="jd-fact-label">사실 · ${escapeHtml(row.id)}</span><strong>${row.explicit ? "원문 필수 구역" : "자격 관련·필수 여부 미확정"}</strong></div>
        <blockquote>${escapeHtml(row.quote)}</blockquote>
      </article>`).join("")
    : '<p class="jd-empty-result">원문에서 필수·Minimum 자격 구역을 찾지 못했습니다. 필수요건을 임의로 만들지 않았습니다.</p>';

  document.querySelector("#jd-role-summary").innerHTML = `<span class="jd-interpretation-label">해석</span> ${escapeHtml(result.summary)}`;
  document.querySelector("#jd-work-blocks").innerHTML = result.workBlocks.length
    ? result.workBlocks.map((row) => `
      <article><span>${escapeHtml(row.id)}</span><strong>${escapeHtml(row.title)}</strong><small>${jdCompetencyNames(row.competencyIds).map(escapeHtml).join(" · ") || "분류 미정"}</small><blockquote>${escapeHtml(row.quote)}</blockquote></article>
    `).join("")
    : '<p class="jd-empty-result">담당 업무 블록을 구분하지 못했습니다. 정리 미리보기에서 소제목과 글머리표를 확인해 주세요.</p>';

  document.querySelector("#jd-top-strategies").innerHTML = result.topStrategies.length
    ? result.topStrategies.map((row) => `
        <article class="jd-strategy-card">
          <header><span>TOP ${row.rank}</span><h4>${escapeHtml(row.name)}</h4><small>${escapeHtml(row.scope || "원문 기반")}</small></header>
          <div class="jd-strategy-fact"><span class="jd-fact-label">사실 · ${escapeHtml(row.requirementId)}</span><blockquote>${escapeHtml(row.evidence)}</blockquote></div>
          <dl>
            <div><dt><span class="jd-interpretation-label">해석</span> 왜 중요한가</dt><dd>${escapeHtml(row.importance)}</dd></div>
            <div><dt><span class="jd-interpretation-label">제안</span> 이력서 작성 방향</dt><dd>${escapeHtml(row.resume)}</dd></div>
          </dl>
        </article>`).join("")
    : '<p class="jd-empty-result">원문에서 구체적인 업무 역량을 찾지 못했습니다. 추출된 업무 문장은 아래 근거 영역에 그대로 보존했습니다.</p>';

  document.querySelector("#jd-feature-list").innerHTML = result.features.length
    ? result.features.map((row) => `
      <article><p><span class="jd-fact-label">사실 · ${escapeHtml(row.requirementId)}</span> ${escapeHtml(row.fact)}</p><p><span class="jd-interpretation-label">해석</span> ${escapeHtml(row.interpretation)}</p></article>
    `).join("")
    : '<p class="jd-empty-result">지원 자격·우대사항에서 해석 가능한 특징을 찾지 못했습니다.</p>';

  renderJdCompanyContext(company, role, result);

  document.querySelector("#jd-study-list").innerHTML = result.studyTopics.length
    ? result.studyTopics.map((row) => `
      <article><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.topic)}</p><small>근거 연결: ${escapeHtml(row.basedOn)}</small></article>
    `).join("")
    : '<p class="jd-empty-result">담당 업무에서 구체적인 학습 주제를 만들지 못했습니다.</p>';

  document.querySelector("#jd-question-list").innerHTML = result.suggestedQuestions.length
    ? result.suggestedQuestions.map((row) => `
      <article class="jd-question-card">
        <div><strong>${escapeHtml(row.id)}</strong><span>${escapeHtml(row.label)}</span></div>
        <h4>${escapeHtml(row.question)}</h4>
        <p><b>JD 근거</b> ${escapeHtml(row.requirementId)}</p>
      </article>
    `).join("")
    : '<p class="jd-empty-result">JD 요구사항이 추출되면 근거가 연결된 추천 문항을 표시합니다.</p>';

  document.querySelector("#jd-requirement-list").innerHTML = result.requirements.length
    ? result.requirements.map((row) => `
      <article class="jd-evidence-card">
        <div><strong>${escapeHtml(row.id)}</strong><span class="jd-level ${escapeHtml(row.level)}">${jdLevelLabel(row.level)}</span>${row.quoteVerified ? '<span class="quote-ok">원문 확인</span>' : '<span class="quote-fail">검증 실패</span>'}</div>
        <blockquote>${escapeHtml(row.text)}</blockquote>
        <div class="jd-competencies">${jdCompetencyNames(row.competencies).map((name) => `<span>${escapeHtml(name)}</span>`).join("") || "<small>분류 없음</small>"}</div>
        <p class="jd-classification-reason">${escapeHtml(row.classificationReason)}</p>
      </article>
    `).join("")
    : '<p class="jd-empty-result">추출된 의미 단위가 없습니다.</p>';
  document.querySelector("#jd-profile-connections").hidden = true;
  document.querySelector("#jd-profile-connections").innerHTML = "";
  state.jdAnalysis = result;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProfileConnections(connectionResult) {
  const container = document.querySelector("#jd-profile-connections");
  if (!connectionResult.profileProvided) {
    container.innerHTML = '<p class="jd-empty-result">저장된 경험이 없습니다. 내 프로필에서 경험을 먼저 입력해 주세요.</p>';
    container.hidden = false;
    return;
  }
  container.innerHTML = connectionResult.connections.map((row) => {
    const labels = { direct: "직접 근거", indirect: "간접 연결", none: "근거 없음" };
    const reason = row.mode === "direct" ? "JD와 경험에서 두 개 이상의 같은 역량 표현이 확인됐습니다."
      : row.mode === "indirect" ? "공통 역량 표현은 하나지만 같은 업무라고 단정할 수 없어 추가 설명이 필요합니다."
        : "프로필에 적힌 내용만으로는 이 요구사항과 연결할 근거를 찾지 못했습니다.";
    return `<article class="jd-match-card ${row.mode === "none" ? "none" : ""}">
      <div class="jd-match-status"><strong>${escapeHtml(row.requirement.id)} · ${labels[row.mode]}</strong><span>${jdCompetencyNames(row.shared).map(escapeHtml).join(" · ")}</span></div>
      <div class="jd-quote-pair"><div><small>JD 원문</small><blockquote>${escapeHtml(row.requirement.quote || row.requirement.text)}</blockquote></div><div><small>내 경험 원문</small><blockquote>${row.experience ? escapeHtml(row.experience.text) : "연결 근거 없음"}</blockquote></div></div>
      <p><span class="jd-interpretation-label">자동 연결 해석</span> ${escapeHtml(reason)}</p>
    </article>`;
  }).join("");
  container.hidden = false;
}

function jdEvidenceButtons(ids) {
  return (ids || []).length
    ? ids.map((id) => `<button class="jd-evidence-link" type="button" data-evidence-id="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join(" ")
    : '<span class="jd-no-evidence">원문 근거 없음</span>';
}

function jdFactValues(rows, emptyText = "원문에 없음") {
  if (!rows || !rows.length) return `<span class="jd-none">${emptyText}</span>`;
  return `<ul>${rows.map((row) => `<li>${escapeHtml(row.value)}</li>`).join("")}</ul>`;
}

function renderJdAnalysisV4(result) {
  const results = document.querySelector("#jd-results");
  const company = document.querySelector("#jd-company").value.trim();
  const role = document.querySelector("#jd-role").value.trim();
  const sourceType = document.querySelector("#jd-source-type").value;
  const sourceLabels = { official: "A · 기업 공식 채용공고", platform: "B · 채용 플랫폼·대행사", unknown: "C · 출처 미확인 복사본" };
  const selectedRole = result.scope?.selectedLabel || role;
  document.querySelector("#jd-result-title").textContent = [company, selectedRole].filter(Boolean).join(" · ") || "JD 분석 결과";
  document.querySelector("#jd-source-grade").textContent = `${sourceLabels[sourceType]} · 사용자 선택`;
  const collectedAt = document.querySelector("#jd-collected-at").value;
  const sourceUrl = document.querySelector("#jd-source-url").value.trim();
  document.querySelector("#jd-source-meta").textContent = [collectedAt ? `원문 확인일 ${collectedAt}` : "원문 확인일 미입력", sourceUrl ? `공고 주소 ${sourceUrl}` : "공고 주소 미입력"].join(" · ");
  document.querySelector("#jd-limitations").innerHTML = result.warnings.length
    ? `<strong>분석 전 확인</strong><ul>${result.warnings.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : `<strong>근거 연결·보호 용어 검사 통과</strong><p>표시된 Fact가 JD 의미 단위에 연결됐으며, 보호 용어 ${result.validation?.checkedTerms?.length || 0}종의 원문 존재 여부를 확인했습니다. 전체 해석의 완전성을 보증하는 표시는 아닙니다.</p>`;

  const facts = result.facts;
  const career = result.careerAnalysis;
  document.querySelector("#jd-career-definition").innerHTML = career.definition.status === "supported"
    ? `${facts.productContext.length ? `<div class="jd-product-context"><b>JD Fact · 제품·사업 맥락</b><span>${facts.productContext.map((row) => escapeHtml(row.value)).join(" · ")}</span></div>` : ""}<span class="jd-interpretation-label">자동 해석</span><p>${escapeHtml(career.definition.value)}</p>`
    : '<p class="jd-empty-result">업무와 성과 목표를 함께 연결할 근거가 부족합니다.</p>';
  document.querySelector("#jd-work-axes").innerHTML = career.workAxes.length
    ? career.workAxes.map((axis, index) => `<article><div class="jd-axis-number">0${index + 1}</div><h4>${escapeHtml(axis.title)}</h4><ul>${axis.actualWork.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p><b>이 업무의 목적</b>${escapeHtml(axis.purpose)}</p></article>`).join("")
    : '<p class="jd-empty-result">묶을 수 있는 주요 업무 문장을 찾지 못했습니다.</p>';
  document.querySelector("#jd-problems").innerHTML = career.problems.length
    ? career.problems.map((row) => `<article><div><small>문제 상황</small><strong>${escapeHtml(row.problem)}</strong></div><div><small>살펴볼 대상</small><span>${escapeHtml(row.target)}</span></div><div><small>업무 방향</small><span>${escapeHtml(row.direction)}</span></div><div><small>기대 결과</small><span>${escapeHtml(row.result)}</span></div></article>`).join("")
    : '<p class="jd-empty-result">JD가 직접 언급한 문제·성과 표현만으로는 문제 해결 구조를 만들기 어렵습니다.</p>';
  document.querySelector("#jd-competency-links").innerHTML = career.competencyLinks.length
    ? career.competencyLinks.map((row) => `<article><div><small>JD 요구</small><strong>${escapeHtml(row.requirement)}</strong></div><span class="jd-connection-arrow">→</span><div><small>연결 업무</small><strong>${escapeHtml(row.axisTitle)}</strong><p>${escapeHtml(row.reason)}</p></div></article>`).join("")
    : '<p class="jd-empty-result">업무와 직접 연결할 수 있는 요구 역량 문장을 찾지 못했습니다.</p>';
  document.querySelector("#jd-performance-groups").innerHTML = career.performanceGroups.length
    ? career.performanceGroups.map((row) => `<article><small>성과 관점</small><h4>${escapeHtml(row.category)}</h4><div class="jd-chip-row">${row.items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><p>${escapeHtml(row.connection)}</p></article>`).join("")
    : '<p class="jd-empty-result">원문에서 직접 확인되는 성과 목표나 지표가 없습니다.</p>';
  document.querySelector("#jd-delivery-goals").innerHTML = career.deliveryGoals.length
    ? career.deliveryGoals.map((row) => `<article><small>과업·산출물</small><h4>${escapeHtml(row.category)}</h4><p>${escapeHtml(row.description)}</p></article>`).join("")
    : '<p class="jd-empty-result">성과지표와 분리해 표시할 구축·설계 산출물이 없습니다.</p>';
  document.querySelector("#jd-emphasis").innerHTML = career.emphasis.length
    ? career.emphasis.map((row) => `<article><span class="jd-emphasis-level">${escapeHtml(row.level)}</span><div><strong>${escapeHtml(row.label)}</strong><p>${escapeHtml(row.reason)}</p></div></article>`).join("")
    : '<p class="jd-empty-result">강조도를 판단할 직접 표현이 부족합니다.</p>';
  const renderPreparation = (rows, emptyText) => rows.length
    ? rows.map((row) => `<article><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.detail)}</p></article>`).join("")
    : `<p class="jd-empty-result">${escapeHtml(emptyText)}</p>`;
  document.querySelector("#jd-prep-must").innerHTML = renderPreparation(career.preparation.must, "원문에 명시된 필수 조건이 없습니다.");
  document.querySelector("#jd-prep-strengths").innerHTML = renderPreparation(career.preparation.strengths, "직접 확인되는 우대·역량 조건이 없습니다.");
  document.querySelector("#jd-prep-study").innerHTML = renderPreparation(career.preparation.study, "근거가 충분한 공부 후보를 만들지 않았습니다.");

  const factRows = [
    ["직무명", facts.jobTitle.value === "원문에 없음" ? [] : [{ value: facts.jobTitle.value, evidenceIds: facts.jobTitle.evidenceIds }]],
    ["제품·사업 맥락", facts.productContext],
    ["주요 업무", facts.duties], ["요구 역량", facts.competencies], ["필수 조건", facts.required], ["우대 조건", facts.preferred],
    ["필요 전공·기술지식", facts.knowledge], ["Tool·Software·언어", facts.tools], ["협업 대상", facts.collaborators], ["성과 목표·지표", facts.metrics],
    ["JD 핵심 키워드", facts.keywords.map((row) => ({ value: row.original, evidenceIds: row.evidenceIds }))],
  ];
  document.querySelector("#jd-fact-table").innerHTML = factRows.map(([label, rows]) => `<tr><th>${label}</th><td>${jdFactValues(rows)}</td><td>${rows?.length ? jdEvidenceButtons([...new Set(rows.flatMap((row) => row.evidenceIds || []))]) : '<span class="jd-no-evidence">원문에 없음</span>'}</td></tr>`).join("");

  document.querySelector("#jd-keyword-table").innerHTML = facts.keywords.length
    ? facts.keywords.map((row) => `<tr><td><span class="jd-fact-label">원문</span> ${escapeHtml(row.original)}</td><td><span class="jd-interpretation-label">자동 표준화</span> ${escapeHtml(row.standardized)}</td><td>${jdEvidenceButtons(row.evidenceIds)}</td></tr>`).join("")
    : '<tr><td colspan="3"><span class="jd-none">원문에 없음</span></td></tr>';
  document.querySelector("#jd-direct-tools").innerHTML = facts.tools.length
    ? facts.tools.map((row) => `<article><strong>${escapeHtml(row.value)}</strong>${jdEvidenceButtons(row.evidenceIds)}</article>`).join("")
    : '<p class="jd-empty-result">JD에 직접 적힌 Tool이 없습니다.</p>';
  document.querySelector("#jd-study-tools").innerHTML = result.studySuggestions.length
    ? result.studySuggestions.map((row) => `<article><strong>${escapeHtml(row.name)}</strong><p>${escapeHtml(row.reason)}</p>${jdEvidenceButtons(row.evidenceIds)}<small>공고의 요구 Tool이 아니라 공부 후보입니다.</small></article>`).join("")
    : '<p class="jd-empty-result">근거가 충분한 Tool 공부 후보를 만들지 않았습니다.</p>';
  document.querySelector("#jd-evidence-list").innerHTML = result.units.map((row) => `<article class="jd-evidence-card" id="evidence-${escapeHtml(row.id)}"><div><strong>${escapeHtml(row.id)}</strong><span class="jd-level">${escapeHtml(row.section)}</span>${row.verified ? '<span class="quote-ok">원문 확인</span>' : '<span class="quote-fail">검증 실패</span>'}</div><blockquote>${escapeHtml(row.text)}</blockquote></article>`).join("");
  document.querySelector(".jd-evidence-details").open = false;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function profileEntryId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function profileOptions(values, selected) {
  const options = selected && !values.includes(selected) ? [selected, ...values] : values;
  return options.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value || "선택")}</option>`).join("");
}

function educationEntryTemplate(row = {}, index = 0) {
  const id = row.id || profileEntryId("education");
  const levels = ["", "고등학교", "검정고시", "전문대학", "대학(학사)", "대학원(석사)", "대학원(박사)"];
  const statuses = ["", "재학", "휴학", "졸업예정", "졸업", "수료", "중퇴"];
  const transfers = ["", "비해당", "편입 전", "편입 후"];
  return `
    <article class="profile-entry-card profile-education-entry" data-entry-id="${escapeHtml(id)}">
      <div class="profile-entry-heading"><strong>학력 ${index + 1}</strong><button type="button" data-remove-entry>삭제</button></div>
      <div class="profile-field-grid profile-entry-fields">
        <label><span>학력 구분</span><select data-field="level">${profileOptions(levels, row.level || "")}</select></label>
        <label><span>학교명</span><input data-field="school" type="text" value="${escapeHtml(row.school || "")}" placeholder="학교명을 입력하세요" /></label>
        <label><span>재학 상태</span><select data-field="status">${profileOptions(statuses, row.status || "")}</select></label>
        <label><span>전공</span><input data-field="major" type="text" value="${escapeHtml(row.major || "")}" placeholder="학과·전공명" /></label>
        <label><span>시작</span><input data-field="startDate" type="month" value="${escapeHtml(row.startDate || "")}" /></label>
        <label><span>종료·예정</span><input data-field="endDate" type="month" value="${escapeHtml(row.endDate || "")}" /></label>
        <label><span>복수·부·세부전공 <small>해당 시</small></span><input data-field="secondaryMajor" type="text" value="${escapeHtml(row.secondaryMajor || "")}" /></label>
        <label><span>편입 여부 <small>해당 시</small></span><select data-field="transfer">${profileOptions(transfers, row.transfer || "")}</select></label>
        <label><span>학교 소재지</span><input data-field="region" type="text" value="${escapeHtml(row.region || "")}" placeholder="예: 경기도" /></label>
        <label><span>평점 / 기준 평점</span><span class="profile-inline-fields"><input data-field="gpa" type="number" min="0" step="0.01" value="${escapeHtml(row.gpa || "")}" placeholder="4.16" /><input data-field="gpaScale" type="number" min="0" step="0.1" value="${escapeHtml(row.gpaScale || "")}" placeholder="4.5" /></span></label>
        <label><span>총 이수학점</span><input data-field="credits" type="number" min="0" step="0.5" value="${escapeHtml(row.credits || "")}" placeholder="예: 130" /></label>
      </div>
      <details class="profile-entry-details">
        <summary>과목·연구 세부정보</summary>
        <label><span>전공 과목·성적 <small>한 줄에 하나, 교양·Pass 제외</small></span><textarea data-field="coursework" rows="5" placeholder="반도체공정 · 3학점 · A+\n재료분석 · 3학점 · A0">${escapeHtml(row.coursework || "")}</textarea></label>
        <div class="profile-field-grid profile-graduate-fields">
          <label><span>지도교수 <small>대학원</small></span><input data-field="advisor" type="text" value="${escapeHtml(row.advisor || "")}" /></label>
          <label><span>LAB명 <small>대학원</small></span><input data-field="lab" type="text" value="${escapeHtml(row.lab || "")}" /></label>
        </div>
        <label class="profile-graduate-fields"><span>연구분야 <small>대학원</small></span><textarea data-field="research" rows="3">${escapeHtml(row.research || "")}</textarea></label>
        <label class="profile-graduate-fields"><span>논문 실적 <small>한 줄에 하나</small></span><textarea data-field="theses" rows="3" placeholder="논문명 · 저널 · SCIE 여부 · 저자 · 출판일 · IF">${escapeHtml(row.theses || "")}</textarea></label>
        <label class="profile-graduate-fields"><span>학회 경험 <small>한 줄에 하나</small></span><textarea data-field="conferences" rows="3" placeholder="학회명 · 발표 주제 · 발표 내용 · 발표일 · Oral 여부">${escapeHtml(row.conferences || "")}</textarea></label>
      </details>
    </article>`;
}

function experienceEntryTemplate(row = {}, index = 0) {
  const id = row.id || profileEntryId("experience");
  const types = ["", "프로젝트", "공정·분석 실습", "인턴", "연구", "공모전", "학회", "동아리", "봉사", "아르바이트", "기타"];
  return `
    <article class="profile-entry-card profile-experience-entry" data-entry-id="${escapeHtml(id)}">
      <div class="profile-entry-heading"><strong>경험 ${index + 1}</strong><button type="button" data-remove-entry>삭제</button></div>
      <div class="profile-field-grid profile-entry-fields">
        <label><span>경험 유형</span><select data-field="type">${profileOptions(types, row.type || "")}</select></label>
        <label><span>경험명</span><input data-field="title" type="text" value="${escapeHtml(row.title || "")}" placeholder="예: 반도체 소자 제작 실습" /></label>
        <label><span>기관·팀</span><input data-field="organization" type="text" value="${escapeHtml(row.organization || "")}" /></label>
        <label><span>기간</span><span class="profile-inline-fields"><input data-field="startDate" type="month" value="${escapeHtml(row.startDate || "")}" /><input data-field="endDate" type="month" value="${escapeHtml(row.endDate || "")}" /></span></label>
      </div>
      <label><span>내 역할</span><textarea data-field="role" rows="2" placeholder="팀 전체가 아니라 내가 맡은 역할을 적으세요.">${escapeHtml(row.role || "")}</textarea></label>
      <label><span>문제·목표</span><textarea data-field="situation" rows="2" placeholder="어떤 문제나 목표가 있었는지 적으세요.">${escapeHtml(row.situation || "")}</textarea></label>
      <label><span>내가 한 행동</span><textarea data-field="action" rows="3" placeholder="분석, 실험, 조정, 의사결정 등 구체적인 행동을 적으세요.">${escapeHtml(row.action || "")}</textarea></label>
      <label><span>결과·배운 점</span><textarea data-field="result" rows="3" placeholder="수치, 산출물, 개선 효과와 배운 점을 적으세요.">${escapeHtml(row.result || "")}</textarea></label>
      <label><span>사용 기술·장비·도구</span><input data-field="tools" type="text" value="${escapeHtml(row.tools || "")}" placeholder="예: SEM, Excel, Python" /></label>
    </article>`;
}

function readProfileEntries(selector) {
  return [...document.querySelectorAll(`${selector} [data-entry-id]`)].map((card) => {
    const row = { id: card.dataset.entryId };
    card.querySelectorAll("[data-field]").forEach((field) => { row[field.dataset.field] = field.value; });
    return row;
  });
}

function profileFromForm() {
  return {
    targetRoles: document.querySelector("#profile-target-roles").value,
    skills: document.querySelector("#profile-skills").value,
    certificates: document.querySelector("#profile-certificates").value,
    languages: document.querySelector("#profile-languages").value,
    educations: readProfileEntries("#profile-education-list"),
    experiences: readProfileEntries("#profile-experience-list"),
    aiExperience: {
      title: document.querySelector("#profile-ai-title").value,
      context: document.querySelector("#profile-ai-context").value,
      period: document.querySelector("#profile-ai-period").value,
      role: document.querySelector("#profile-ai-role").value,
      aiUse: document.querySelector("#profile-ai-use").value,
      verification: document.querySelector("#profile-ai-verification").value,
      result: document.querySelector("#profile-ai-result").value,
    },
  };
}

function fillProfileForm(profile) {
  document.querySelector("#profile-target-roles").value = profile.targetRoles || "";
  document.querySelector("#profile-skills").value = profile.skills || "";
  document.querySelector("#profile-certificates").value = profile.certificates || "";
  document.querySelector("#profile-languages").value = profile.languages || "";
  const educations = profile.educations?.length ? profile.educations : [{}];
  const experiences = profile.experiences?.length ? profile.experiences : [{}];
  document.querySelector("#profile-education-list").innerHTML = educations.map(educationEntryTemplate).join("");
  document.querySelector("#profile-experience-list").innerHTML = experiences.map(experienceEntryTemplate).join("");
  const ai = profile.aiExperience || {};
  ["title", "context", "period", "role", "use", "verification", "result"].forEach((key) => {
    const profileKey = key === "use" ? "aiUse" : key;
    document.querySelector(`#profile-ai-${key}`).value = ai[profileKey] || "";
  });
}

function renumberProfileEntries(containerSelector, label) {
  document.querySelectorAll(`${containerSelector} .profile-entry-heading strong`).forEach((node, index) => { node.textContent = `${label} ${index + 1}`; });
}

function refreshJdProfileLink() {
  const profile = window.CareerProfile.load(window.localStorage);
  const summary = window.CareerProfile.summary(profile);
  const container = document.querySelector("#jd-profile-link");
  // JD 1단계는 프로필과 완전히 분리되어 이 영역이 없는 것이 정상이다.
  if (!container) return;
  const title = container.querySelector("strong");
  const copy = container.querySelector("span");
  const button = container.querySelector("button");
  if (summary.ready) {
    container.classList.add("ready");
    title.textContent = `내 프로필 경험 ${summary.experienceCount}개 사용`;
    copy.textContent = "이 기기에 저장된 경험과 JD 요구사항을 비교합니다.";
    button.textContent = "프로필 수정";
  } else {
    container.classList.remove("ready");
    title.textContent = "저장된 내 프로필 없음";
    copy.textContent = "요구사항 분석은 가능하지만 경험 매칭은 제한됩니다.";
    button.textContent = "내 프로필 작성";
  }
}

function bindProfileForm() {
  const form = document.querySelector("#profile-form");
  const status = document.querySelector("#profile-save-status");
  fillProfileForm(window.CareerProfile.load(window.localStorage));
  refreshJdProfileLink();

  document.querySelector("#profile-add-education").addEventListener("click", () => {
    const list = document.querySelector("#profile-education-list");
    list.insertAdjacentHTML("beforeend", educationEntryTemplate({}, list.children.length));
    list.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.querySelector("#profile-add-experience").addEventListener("click", () => {
    const list = document.querySelector("#profile-experience-list");
    list.insertAdjacentHTML("beforeend", experienceEntryTemplate({}, list.children.length));
    list.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  [
    ["#profile-education-list", "학력"],
    ["#profile-experience-list", "경험"],
  ].forEach(([selector, label]) => {
    document.querySelector(selector).addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-entry]");
      if (!button) return;
      button.closest("[data-entry-id]").remove();
      renumberProfileEntries(selector, label);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const profile = window.CareerProfile.save(profileFromForm(), window.localStorage);
    const summary = window.CareerProfile.summary(profile);
    status.className = "profile-save-status success";
    status.textContent = `이 기기에 저장했습니다. 학력 ${summary.educationCount}개와 경험 ${summary.experienceCount}개를 이후 JD·자소서 기능에 사용합니다.`;
    refreshJdProfileLink();
  });

  document.querySelector("#profile-export").addEventListener("click", () => {
    const profile = window.CareerProfile.normalize(profileFromForm());
    const blob = new Blob([JSON.stringify({ version: 2, profile }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `career-profile-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    status.className = "profile-save-status success";
    status.textContent = "현재 입력 내용을 백업 파일로 만들었습니다.";
  });

  document.querySelector("#profile-import").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const profile = window.CareerProfile.save(parsed.profile || parsed, window.localStorage);
      fillProfileForm(profile);
      refreshJdProfileLink();
      status.className = "profile-save-status success";
      status.textContent = "백업 파일을 불러와 이 기기에 저장했습니다.";
    } catch (_error) {
      status.className = "profile-save-status error";
      status.textContent = "이 사이트에서 만든 프로필 백업 파일인지 확인해 주세요.";
    }
    event.target.value = "";
  });

  document.querySelector("#profile-delete").addEventListener("click", () => {
    if (!window.confirm("이 기기에 저장한 취업 프로필을 모두 삭제할까요?")) return;
    const profile = window.CareerProfile.clear(window.localStorage);
    fillProfileForm(profile);
    refreshJdProfileLink();
    status.className = "profile-save-status";
    status.textContent = "이 기기에 저장한 프로필을 삭제했습니다.";
  });

  document.querySelectorAll("[data-open-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      showChapter("profile");
      document.querySelector("#profile-chapter").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function updateRoleMapping() {
  const roleName = document.querySelector("#jd-role").value;
  const mapping = window.RoleNormalizer.mapRole(roleName);
  const container = document.querySelector("#jd-role-map");
  container.hidden = !roleName.trim();
  document.querySelector("#jd-role-category").textContent = mapping.category;
}

function showDetectedRoles(roles) {
  const wrapper = document.querySelector("#jd-role-choice-wrap");
  const select = document.querySelector("#jd-role-choice");
  const uniqueRoles = Array.isArray(roles) ? roles : [];
  wrapper.hidden = uniqueRoles.length < 2;
  select.innerHTML = uniqueRoles.map((row) => `<option value="${escapeHtml(row.original)}">${escapeHtml(row.original)} · ${escapeHtml(row.category)}</option>`).join("");
}

function renderJdSourcePreview() {
  const rawText = document.querySelector("#jd-text").value;
  const preview = window.JDAnalyzer.previewSource(rawText);
  const panel = document.querySelector("#jd-clean-preview");
  document.querySelector("#jd-cleaned-text").value = preview.cleanedText;
  document.querySelector("#jd-preview-count").textContent = `소제목 ${preview.headingCount}개 · 의미 단위 ${preview.semanticUnitCount}개`;
  const subrolePicker = document.querySelector("#jd-subrole-picker");
  const subroleSelect = document.querySelector("#jd-subrole-select");
  subrolePicker.hidden = preview.subroles.length < 2;
  subroleSelect.innerHTML = preview.subroles.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)} · 업무 ${row.dutyCount}개</option>`).join("");
  document.querySelector("#jd-ocr-warnings").innerHTML = preview.warnings.length
    ? `<strong>OCR 확인 필요</strong><ul>${preview.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "<span>뚜렷한 OCR 오류 신호는 찾지 못했습니다. 그래도 회사명·직무명·공정명은 원본과 대조하세요.</span>";
  panel.hidden = false;
  document.querySelector("#jd-analyze-button").hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindJdAnalyzer() {
  const dateInput = document.querySelector("#jd-collected-at");
  const endpointInput = document.querySelector("#jd-ai-endpoint");
  const connectionState = document.querySelector("#jd-ai-connection-state");
  const refreshConnectionState = () => {
    const endpoint = window.JDAiClient.loadEndpoint(window.localStorage);
    endpointInput.value = endpoint;
    connectionState.textContent = endpoint ? "이 기기에 연결됨" : "연결 전";
  };
  refreshConnectionState();
  document.querySelector("#jd-ai-save").addEventListener("click", () => {
    try {
      window.JDAiClient.saveEndpoint(endpointInput.value, window.localStorage);
      refreshConnectionState();
      window.alert(endpointInput.value.trim() ? "AI 분석 연결 주소를 이 기기에 저장했습니다." : "저장된 연결 주소를 지웠습니다.");
    } catch (error) {
      window.alert(error.message || "연결 주소를 저장하지 못했습니다.");
    }
  });
  dateInput.value = new Date().toISOString().slice(0, 10);
  document.querySelector("#jd-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const analyzeButton = document.querySelector("#jd-analyze-button");
    try {
      if (document.querySelector("#jd-clean-preview").hidden) {
        renderJdSourcePreview();
        return;
      }
      const endpoint = window.JDAiClient.loadEndpoint(window.localStorage);
      analyzeButton.disabled = true;
      analyzeButton.textContent = endpoint ? "원문 근거를 확인하며 분석 중…" : "임시 분석 중…";
      const selectedSubrole = document.querySelector("#jd-subrole-picker").hidden ? "" : document.querySelector("#jd-subrole-select").selectedOptions[0]?.textContent.split(" · ")[0] || "";
      const input = {
        jdText: document.querySelector("#jd-cleaned-text").value,
        company: document.querySelector("#jd-company").value,
        role: selectedSubrole || document.querySelector("#jd-role").value,
        sourceType: document.querySelector("#jd-source-type").value,
      };
      const result = endpoint
        ? await window.JDAiClient.analyze(input, { endpoint })
        : window.JDAnalyzer.analyze({ jdText: input.jdText, roleName: input.role, selectedSubrole: document.querySelector("#jd-subrole-picker").hidden ? "" : document.querySelector("#jd-subrole-select").value });
      if (!endpoint) result.warnings.unshift("AI 분석 서버가 연결되지 않아 기존 규칙 기반 임시 분석을 표시합니다. 직무가 달라지면 해석이 부정확할 수 있습니다.");
      renderJdAnalysisV4(result);
    } catch (error) {
      window.alert(error.message || "분석 중 문제가 발생했습니다.");
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = "2. JD 단독 분석";
    }
  });
  document.querySelector("#jd-preview-button").addEventListener("click", () => {
    try {
      renderJdSourcePreview();
    } catch (error) {
      window.alert(error.message || "원문을 정리하지 못했습니다.");
    }
  });
  document.querySelector("#jd-text").addEventListener("input", () => {
    document.querySelector("#jd-clean-preview").hidden = true;
    document.querySelector("#jd-analyze-button").hidden = true;
    document.querySelector("#jd-results").hidden = true;
    document.querySelector("#jd-subrole-picker").hidden = true;
  });
  document.querySelector("#jd-reset").addEventListener("click", () => {
    document.querySelector("#jd-form").reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    document.querySelector("#jd-results").hidden = true;
    document.querySelector("#jd-clean-preview").hidden = true;
    document.querySelector("#jd-analyze-button").hidden = true;
    document.querySelector("#jd-cleaned-text").value = "";
    document.querySelector("#jd-subrole-picker").hidden = true;
  });
  document.querySelector("#jd-results").addEventListener("click", (event) => {
    const button = event.target.closest("[data-evidence-id]");
    if (!button) return;
    const details = document.querySelector(".jd-evidence-details");
    details.open = true;
    const target = document.querySelector(`#evidence-${CSS.escape(button.dataset.evidenceId)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function bindChapterTabs() {
  document.querySelector(".chapter-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chapter]");
    if (!button) return;
    showChapter(button.dataset.chapter);
  });
}

function bindCompanyProfiles() {
  document.querySelector("#company-profile-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-profile-company]");
    if (!button) return;
    state.company = button.dataset.profileCompany;
    state.days = "30";
    document.querySelectorAll("#company-filters button").forEach((item) => {
      item.classList.toggle("active", item.dataset.company === state.company);
    });
    document.querySelector("#days-filter").value = "30";
    showChapter("news");
    render();
    document.querySelector("#result-line").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function bindProcessFocusButton() {
  document.querySelector("#process-focus-button").addEventListener("click", () => {
    state.company = "all";
    state.relevance = "high";
    state.job = "공정기술·양산기술";
    state.days = "30";
    state.query = "";
    state.processFocus = true;
    document.querySelector("#search").value = "";
    document.querySelector("#job-filter").value = state.job;
    document.querySelector("#days-filter").value = state.days;
    document.querySelectorAll("#company-filters button").forEach((button) => {
      button.classList.toggle("active", button.dataset.company === "all");
    });
    document.querySelectorAll("#importance-filters button").forEach((button) => {
      button.classList.toggle("active", button.dataset.relevance === "high");
    });
    updateProcessFocusButton();
    showChapter("news");
    render();
    document.querySelector("#result-line").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function updateProcessFocusButton() {
  const button = document.querySelector("#process-only-toggle");
  button.classList.toggle("active", state.processFocus);
  button.setAttribute("aria-pressed", String(state.processFocus));
  button.textContent = state.processFocus ? "집중 보기 해제" : "공정·양산 집중 보기";
}

function bindProcessOnlyToggle() {
  document.querySelector("#process-only-toggle").addEventListener("click", () => {
    state.processFocus = !state.processFocus;
    updateProcessFocusButton();
    render();
  });
}

function processFitLabel(value) {
  return {
    direct: "공정 직접 관련",
    indirect: "공정 간접 관련",
    background: "산업 배경 동향",
  }[value] || "산업 배경 동향";
}

function renderProcessFit(article) {
  const fit = article.process_fit || "background";
  const evidence = article.process_evidence || [];
  const description = evidence.length
    ? `판단 근거: ${evidence.slice(0, 4).join(" · ")}`
    : "공정·양산 직접 근거 없음. 산업 흐름을 이해하는 참고 자료입니다.";
  return `
    <div class="process-fit-panel ${escapeHtml(fit)}">
      <span class="badge process-fit ${escapeHtml(fit)}">${processFitLabel(fit)}</span>
      <span class="process-fit-copy">${escapeHtml(description)}</span>
    </div>
  `;
}

function renderAiAnalysis(item) {
  if (!item?.analysis || item.validation_status !== "PASS") return "";
  const analysis = item.analysis;
  const roles = (analysis.role_insights || []).map((insight) => `
    <section class="role-insight">
      <h4>${escapeHtml(insight.role || "관련 직무")}</h4>
      <p>${escapeHtml(insight.why_relevant_ko || "")}</p>
      ${(insight.considerations_ko || []).length ? `
        <strong>현업에서 생각할 점</strong>
        <ul>${insight.considerations_ko.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
      ` : ""}
      ${(insight.study_points_ko || []).length ? `
        <strong>취업 준비 학습 포인트</strong>
        <ul>${insight.study_points_ko.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
      ` : ""}
    </section>
  `).join("");
  const facts = (analysis.facts || []).map((fact) => `
    <li>
      ${escapeHtml(fact.statement_ko || "")}
      ${fact.evidence_en ? `<small>원문 근거: “${escapeHtml(fact.evidence_en)}”</small>` : ""}
    </li>
  `).join("");
  const implications = (analysis.company_implications || []).map((value) => `
    <li><strong>${escapeHtml(value.target_company || "대상 기업")}</strong> — ${escapeHtml(value.inference_ko || "")}
      ${value.basis_ko ? `<small>판단 근거: ${escapeHtml(value.basis_ko)}</small>` : ""}
    </li>
  `).join("");

  return `
    <details class="ai-analysis">
      <summary>AI 직무 인사이트 보기</summary>
      <div class="analysis-body">
        <div class="analysis-notice">
          <span>공식 원문 기반 · 자동 근거검사 통과</span>
          <span>신뢰도 ${confidenceLabel(analysis.overall_confidence)}</span>
        </div>
        <p class="analysis-summary">${escapeHtml(analysis.summary_ko || "")}</p>
        ${(analysis.technology_signals || []).length ? `
          <div class="technology-signals" aria-label="핵심 기술 신호">
            ${badgeList(analysis.technology_signals, "technology", 8)}
          </div>
        ` : ""}
        ${roles ? `<div class="role-insights"><h3>직무별 인사이트</h3>${roles}</div>` : ""}
        ${implications ? `<div class="analysis-section"><h3>기업 관점의 의미</h3><ul>${implications}</ul></div>` : ""}
        ${facts ? `<details class="evidence-details"><summary>확인된 사실과 원문 근거</summary><ul>${facts}</ul></details>` : ""}
        ${(analysis.uncertainties_ko || []).length ? `
          <div class="analysis-section uncertainty"><h3>추가 확인이 필요한 부분</h3>
            <ul>${analysis.uncertainties_ko.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
          </div>
        ` : ""}
        <p class="ai-disclaimer">AI가 작성한 참고용 초안입니다. 지원서·업무 판단에 사용하기 전 공식 원문을 확인하세요.</p>
      </div>
    </details>
  `;
}

function render() {
  const rows = visibleArticles();
  resultLine.textContent = state.processFocus
    ? `공정·양산 관련 기술 신호 ${rows.length}개를 직접 관련 순으로 표시합니다.`
    : `${rows.length}개의 기술 신호를 표시합니다.`;
  empty.hidden = rows.length !== 0;
  grid.innerHTML = rows.map((article) => {
    const showKorean = state.language === "ko" && article.title_ko;
    const displayTitle = showKorean ? article.title_ko : article.title;
    const translatedSummary = showKorean ? article.summary_ko : "";
    return `
    <article class="article-card">
      <div class="card-meta">
        <span class="company">${escapeHtml(article.company)}</span>
        <time datetime="${escapeHtml(article.published_at)}">${formatDate(article.published_at)}</time>
      </div>
      <h2>${escapeHtml(displayTitle)}</h2>
      ${showKorean ? `<p class="original-title">원문: ${escapeHtml(article.title)}</p>` : ""}
      ${translatedSummary ? `<p class="translated-summary">${escapeHtml(translatedSummary)}</p>` : ""}
      <div class="classification" aria-label="직무와 기술 분류">
        <span class="badge relevance ${article.relevance === "high" ? "high" : "context"}">
          ${article.relevance === "high" ? "핵심 기술" : "참고 동향"}
        </span>
        ${badgeList(article.job_roles, "job")}
        ${badgeList(article.tech_domains, "domain")}
        ${badgeList(article.signal_types, "signal", 2)}
      </div>
      ${renderProcessFit(article)}
      <div class="keywords" aria-label="분류 근거">
        ${((article.matched_keywords || []).length
          ? article.matched_keywords
          : [article.source_category || "공식 발표"]
        ).slice(0, 6).map((word) => `<span class="keyword">${escapeHtml(word)}</span>`).join("")}
      </div>
      ${renderAiAnalysis(article.ai_analysis)}
      <a class="source-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">공식 원문 보기</a>
    </article>
  `;
  }).join("");
}

function updateLanguageButton() {
  const button = document.querySelector("#language-toggle");
  button.disabled = state.translatedCount === 0;
  if (state.translatedCount === 0) {
    button.textContent = "한국어 번역 준비 중";
  } else if (state.language === "ko") {
    button.textContent = "영문 원문 보기";
  } else {
    button.textContent = `한국어 번역 보기 (${state.translatedCount})`;
  }
}

function createCompanyFilters(companies) {
  const container = document.querySelector("#company-filters");
  companies.forEach((company) => {
    const button = document.createElement("button");
    button.className = "filter";
    button.type = "button";
    button.dataset.company = company;
    button.textContent = company;
    container.append(button);
  });
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-company]");
    if (!button) return;
    container.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    state.company = button.dataset.company;
    render();
  });
}

function fillSelect(selector, values, field) {
  const select = document.querySelector(selector);
  const counts = new Map();
  state.articles.forEach((article) => {
    (article[field] || []).forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });
  values.filter((value) => counts.has(value)).forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${value} (${counts.get(value)})`;
    select.append(option);
  });
}

function bindFilters() {
  document.querySelector("#importance-filters").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-relevance]");
    if (!button) return;
    document.querySelectorAll("#importance-filters button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    state.relevance = button.dataset.relevance;
    render();
  });

  const selectBindings = {
    "#job-filter": "job",
    "#domain-filter": "domain",
    "#signal-filter": "signal",
    "#days-filter": "days",
  };
  Object.entries(selectBindings).forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("change", (event) => {
      state[key] = event.target.value;
      render();
    });
  });

  document.querySelector("#reset-filters").addEventListener("click", () => {
    state.company = "all";
    state.relevance = "all";
    state.job = "all";
    state.domain = "all";
    state.signal = "all";
    state.days = "all";
    state.query = "";
    state.processFocus = false;
    document.querySelector("#search").value = "";
    document.querySelectorAll("#company-filters button").forEach((button) => {
      button.classList.toggle("active", button.dataset.company === "all");
    });
    document.querySelectorAll("#importance-filters button").forEach((button) => {
      button.classList.toggle("active", button.dataset.relevance === "all");
    });
    ["#job-filter", "#domain-filter", "#signal-filter", "#days-filter"].forEach((selector) => {
      document.querySelector(selector).value = "all";
    });
    updateProcessFocusButton();
    render();
  });
}

async function loadData() {
  try {
    const response = await fetch("data/latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.articles = data.articles || [];
    const companies = Object.keys(data.company_counts || {});
    const options = data.filter_options || {};
    state.trendSummary = data.trend_summary || null;
    state.monthlyTrendReport = data.monthly_trend_report || null;
    state.translatedCount = Number(data.translation?.translated_count || 0);
    document.querySelector("#total-count").textContent = data.article_count ?? state.articles.length;
    document.querySelector("#company-count").textContent = companies.length;
    document.querySelector("#analysis-count").textContent = Number(data.ai_analysis?.analyzed_count || 0);
    document.querySelector("#updated").textContent = `최근 갱신 ${formatDate(data.generated_at)}`;
    createCompanyFilters(companies);
    fillSelect("#job-filter", options.job_roles || [], "job_roles");
    fillSelect("#domain-filter", options.tech_domains || [], "tech_domains");
    fillSelect("#signal-filter", options.signal_types || [], "signal_types");
    updateLanguageButton();
    renderTrendSummary();
    renderMonthlyReport();
    render();
  } catch (error) {
    resultLine.textContent = "데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.";
    empty.hidden = false;
    empty.querySelector("h2").textContent = "데이터 연결을 확인하고 있습니다.";
    console.error(error);
  }
}

document.querySelector("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

document.querySelector("#language-toggle").addEventListener("click", () => {
  state.language = state.language === "ko" ? "original" : "ko";
  updateLanguageButton();
  render();
});

bindFilters();
bindChapterTabs();
bindTrendPeriodTabs();
bindCompanyProfiles();
bindProcessFocusButton();
bindProcessOnlyToggle();
bindProfileForm();
bindJdAnalyzer();
updateProcessFocusButton();
showChapter("trend");
loadData();
