const state = {
  articles: [],
  company: "all",
  job: "all",
  domain: "all",
  days: "all",
  query: "",
  language: "ko",
  translatedCount: 0,
  trendDays: "30",
  trendSummary: null,
  monthlyTrendReport: null,
  processFocus: false,
  chapter: "trend",
  jdAnalysis: null,
  jdRecallQuestions: null,
  profileConnections: null,
  questionMap: null,
  questionProfileEntries: [],
};

const grid = document.querySelector("#article-grid");
const empty = document.querySelector("#empty");
const resultLine = document.querySelector("#result-line");
const APPLICATION_DRAFT_KEY = "aiproject.applicationDrafts.v1";
const APPLICATION_DRAFT_HISTORY_KEY = "aiproject.applicationDraftHistory.v1";
const APPLICATION_WORKSPACE_KEY = "aiproject.applicationWorkspace.v1";
const APPLICATION_WORKSPACE_LIBRARY_KEY = "aiproject.applicationWorkspaceLibrary.v1";
const JDQ_ANSWERS_KEY = "aiproject.jdqAnswers.v1";
const JDQ_PLACEMENTS_KEY = "aiproject.jdqPlacements.v1";

// JDQ 답변·배치 저장소 (8회차): JDQ 카드에 쓴 답변은 JD(회사·직무·원문) 범위별로
// 저장하고, "지원서 초안에 보내기"로 만든 배치는 저장해 두었다가 문항 배치표를
// 렌더링할 때마다 다시 합친다. 배치표(AI)를 다시 실행해도 JDQ 배치가 사라지지 않는다.
function jdqScope() {
  return window.ApplicationWorkspace.workspaceScope({
    company: document.querySelector("#jd-company").value,
    role: document.querySelector("#jd-role").value,
    jdText: document.querySelector("#jd-cleaned-text").value || document.querySelector("#jd-text").value,
  });
}

function loadJdqAnswers() {
  try { return JSON.parse(window.localStorage.getItem(JDQ_ANSWERS_KEY) || "{}"); } catch (_error) { return {}; }
}

function saveJdqAnswer(scope, qid, value) {
  try {
    const answers = loadJdqAnswers();
    const key = `${scope}::${qid}`;
    if (String(value || "").trim()) answers[key] = value;
    else delete answers[key];
    window.localStorage.setItem(JDQ_ANSWERS_KEY, JSON.stringify(answers));
    return true;
  } catch (_error) { return false; }
}

function loadJdqPlacements() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(JDQ_PLACEMENTS_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((row) => row && typeof row === "object" && row.question?.text) : [];
  } catch (_error) { return []; }
}

function saveJdqPlacement(placement) {
  try {
    // 43회차: 문장 기준 중복 제거에 더해, 같은 문항(안정 키 + 채용공고
    // 인용문)이면 문구가 바뀌어도 같은 문항으로 본다. 질문 문구가
    // 바뀌면(43회차 한화 Q3 중립 문구) 옛 문구 행이 남아 9번 표에
    // 같은 역량 행이 두 개 뜨는 것을 막는다. 안정 키(JD-01…)는 분석
    // 때마다 다시 매겨져 다른 채용공고와 겹칠 수 있어 인용문까지
    // 같이 본다. 키·인용문이 없는 옛 저장 행은 문장 기준으로만 본다.
    const sameQuestion = (row) => {
      if (row.workspaceScope !== placement.workspaceScope) return false;
      if (row.question.text === placement.question.text) return true;
      const key = String(row.jdqId || "");
      const quote = String(row.jdRequirement?.text || "");
      return Boolean(key) && key === String(placement.jdqId || "") && Boolean(quote) && quote === String(placement.jdRequirement?.text || "");
    };
    const rows = loadJdqPlacements().filter((row) => !sameQuestion(row));
    rows.push(placement);
    window.localStorage.setItem(JDQ_PLACEMENTS_KEY, JSON.stringify(rows.slice(-20)));
    return true;
  } catch (_error) { return false; }
}

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
      && includesValue(article.job_roles, state.job)
      && includesValue(article.tech_domains, state.domain)
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
    return '<li class="trend-empty">집계된 기사가 없습니다.</li>';
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
    return '<li class="trend-empty">기사 수가 늘어난 항목이 없습니다.</li>';
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
  document.querySelector("#trend-company-count").textContent = windowData.company_count ?? 0;
  document.querySelector("#trend-tech-list").innerHTML = rankingList(windowData.top_tech_domains);
  document.querySelector("#trend-job-list").innerHTML = rankingList(windowData.top_job_roles);
  document.querySelector("#trend-company-list").innerHTML = rankingList(windowData.top_companies);
  document.querySelector("#momentum-tech-list").innerHTML = momentumList(summary.momentum_30d?.tech_domains);
  document.querySelector("#momentum-job-list").innerHTML = momentumList(summary.momentum_30d?.job_roles);
  renderCompanyProfiles(summary.company_profiles_30d);
  const top = windowData.top_tech_domains?.[0];
  const leaders = (windowData.top_tech_domains || []).filter(row => row.count === top?.count);
  const labels = leaders.map(row => row.name).join(', ');
  document.querySelector("#trend-current").textContent = top
    ? `최근 ${state.trendDays}일에는 ${labels} 분야의 기사가 가장 많았습니다(${leaders.length > 1 ? "각 " : ""}${top.count}건).`
    : windowData.article_count ? `최근 ${state.trendDays}일에 수집된 기사에는 집계할 기술 분야가 없습니다.`
      : `최근 ${state.trendDays}일에 수집된 기사가 없습니다.`;
  document.querySelector("#momentum-panel").hidden = state.trendDays !== "30";
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
  document.querySelector("#jd-chapter").hidden = true;
  document.querySelector("#library-chapter").hidden = chapter !== "jd";
  if (chapter === "jd") window.CoverLetterLibrary.open();
  document.querySelector("#assessment-chapter").hidden = chapter !== "assessment";
  if (chapter === "assessment") {
    const frame = document.querySelector("#assessment-frame");
    if (!frame.hasAttribute("src")) frame.src = frame.dataset.src;
  }
  if (chapter === "profile") refreshProfileJdHints();
  document.querySelectorAll("button[data-chapter]").forEach((button) => {
    const active = button.dataset.chapter === chapter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (chapter === "profile") renderProfileAssessmentResult();
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
        <p>채용공고 분석 결과는 그대로 사용할 수 있지만 회사 동향은 아직 결합하지 않습니다. 향후 공식 채용 페이지·뉴스룸·IR 자료를 조사하고 출처 등급과 확인일을 저장한 뒤 연결해야 합니다.</p>
      </div>`;
    return;
  }
  if (!context.articles.length) {
    container.innerHTML = `
      <div class="jd-context-status">
        <span class="jd-fact-label">추적 기업 · ${escapeHtml(context.company)}</span>
        <strong>현재 저장된 공식 기사 중 이 채용공고와 직접 연결할 근거를 찾지 못했습니다.</strong>
        <p>관련성이 약한 뉴스를 억지로 붙이지 않았습니다. 채용공고 요구사항 분석은 위 결과대로 유지됩니다.</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="jd-context-status">
      <span class="jd-fact-label">추적 기업 · ${escapeHtml(context.company)}</span>
      <strong>채용공고 직무·기술 분류와 겹치는 최근 공식 기사 ${context.articles.length}건</strong>
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
  document.querySelector("#jd-result-title").textContent = [company, role].filter(Boolean).join(" · ") || "채용공고 분석 결과";
  document.querySelector("#jd-source-grade").textContent = `${sourceLabels[sourceType]} · 사용자 선택`;
  const collectedAt = document.querySelector("#jd-collected-at").value;
  const sourceUrl = document.querySelector("#jd-source-url").value.trim();
  document.querySelector("#jd-source-meta").textContent = [
    collectedAt ? `원문 확인일 ${collectedAt}` : "원문 확인일 미입력",
    sourceUrl ? `공고 주소 ${sourceUrl}` : "공고 주소 미입력",
  ].join(" · ");
  document.querySelector("#jd-limitations").innerHTML = result.limitations.length
    ? `<strong>분석 범위 확인</strong><ul>${result.limitations.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : "<strong>분석 범위 확인</strong><p>입력된 채용공고 원문과 저장된 프로필만 사용했습니다.</p>";

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
        <p><b>채용공고 근거</b> ${escapeHtml(row.requirementId)}</p>
      </article>
    `).join("")
    : '<p class="jd-empty-result">채용공고 요구사항이 추출되면 근거가 연결된 추천 문항을 표시합니다.</p>';

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

function jdProfileRequirements(result) {
  if (!result?.facts) return [];
  // 46회차 (45회차 객관 검토 B9): 여기서 자르지 않는다. 상한(40개)은
  // 매칭 함수(로컬 matchProfileLocal·서버 jdMatchProfile_)가 적용하고,
  // 잘린 개수는 totalRequirementCount로 돌려줘 화면에 밝힌다. 여기서
  // 20개로 자르면 현대차 실전 JD의 도구 6개가 조용히 사라졌다.
  const evidence = new Map((result.units || []).map((row) => [row.id, row.text]));
  const groups = [
    ["주요 업무", result.facts.duties], ["필수 조건", result.facts.required],
    ["우대 조건", result.facts.preferred], ["명시된 도구", result.facts.tools],
  ];
  const seen = new Set();
  return groups.flatMap(([kind, rows]) => (rows || []).map((row) => {
    const key = String(row.value || "").replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) return null;
    const evidenceQuote = (row.evidenceIds || []).map((id) => evidence.get(id)).find(Boolean) || "";
    if (!evidenceQuote) return null;
    seen.add(key);
    return { kind, text: row.value, evidenceQuote };
  }).filter(Boolean));
}

function renderProfileConnections(connectionResult) {
  const container = document.querySelector("#jd-profile-connections");
  const summary = document.querySelector("#jd-match-summary");
  const labels = { direct: "직접 근거", indirect: "간접 연결", none: "근거 없음" };
  const reuse = {};
  connectionResult.matches.forEach((row) => { if (row.experience?.id) reuse[row.experience.id] = (reuse[row.experience.id] || 0) + 1; });
  const connected = connectionResult.matches
    .filter((row) => row.status !== "none")
    .sort((left, right) => ({ direct: 0, indirect: 1 }[left.status] - { direct: 0, indirect: 1 }[right.status]));
  const missing = connectionResult.matches.filter((row) => row.status === "none");
  // 46회차 (45회차 객관 검토 B9): 요구사항이 상한(40개)을 넘기면 잘린
  // 개수를 밝힌다. 조용히 자르면 도구 같은 요구사항이 사라진다.
  const totalReqs = Number(connectionResult.totalRequirementCount || 0);
  const shownReqs = Number(connectionResult.requirementCount || connectionResult.matches.length);
  const truncatedNote = totalReqs > shownReqs
    ? `<p>채용공고 요구사항 ${totalReqs}개 중 ${shownReqs}개만 연결했습니다. 나머지 ${totalReqs - shownReqs}개는 표시하지 않았습니다.</p>`
    : "";
  summary.innerHTML = `<div><strong>경험 연결 요약</strong><p>지원 적합도 점수가 아니라, 저장한 경험에서 확인되는 근거만 셌습니다.</p>${connectionResult.source === "local" ? "<p>서버 없이 이 기기에서 규칙으로 연결했습니다. 프로필 원문은 외부로 전송되지 않았습니다.</p>" : ""}${truncatedNote}</div><span>직접 ${connectionResult.counts.direct}개</span><span>간접 ${connectionResult.counts.indirect}개</span><span>추가 근거 필요 ${connectionResult.counts.none}개</span>`;
  summary.hidden = false;
  const connectedCards = connected.map((row) => {
    const repeated = row.experience?.id && reuse[row.experience.id] > 1 ? `<small class="jd-reuse-note">같은 경험이 ${reuse[row.experience.id]}개 요구사항에 연결됨</small>` : "";
    return `<article class="jd-match-card ${escapeHtml(row.status)}">
      <div class="jd-match-status"><strong>${labels[row.status]}</strong><span>${escapeHtml(row.requirement.kind)}</span></div>
      <div class="jd-match-requirement"><small>채용공고에서 요구한 내용</small><strong>${escapeHtml(row.requirement.text)}</strong></div>
      <div class="jd-match-experience"><small>연결할 경험</small><strong>${row.experience ? escapeHtml(`${row.experience.kind} · ${row.experience.label}`) : "연결 경험 없음"}</strong><blockquote>${escapeHtml(row.profileEvidenceQuote)}</blockquote>${repeated}</div>
      <div class="jd-match-guidance"><p><span class="jd-interpretation-label">연결 판단</span>${escapeHtml(row.reasoning)}</p>${row.writingDirection ? `<p><span class="jd-fact-label">자소서 작성 방향</span>${escapeHtml(row.writingDirection)}</p>` : ""}</div>
    </article>`;
  }).join("");
  const connectedSection = connectedCards
    ? `<section class="jd-connected-section"><div class="jd-match-heading"><strong>우선 활용할 경험</strong><span>채용공고 문장과 경험 원문을 함께 확인한 뒤 작성 방향을 참고하세요.</span></div>${connectedCards}</section>`
    : '<p class="jd-empty-result">현재 저장된 경험에서 연결할 근거를 찾지 못했습니다. 없는 경험을 만들지 말고 실제로 수행한 활동을 추가해 주세요.</p>';
  const missingSection = missing.length
    ? `<details class="jd-missing-requirements"><summary>추가 근거가 필요한 채용공고 요구사항 ${missing.length}개</summary><p>경험이 없다는 판정이 아니라, 현재 저장된 프로필 원문에서 근거를 찾지 못했다는 뜻입니다.</p><ul>${missing.map((row) => `<li><span>${escapeHtml(row.requirement.kind)}</span><strong>${escapeHtml(row.requirement.text)}</strong></li>`).join("")}</ul></details>`
    : '<p class="jd-match-complete">모든 채용공고 요구사항에서 직접 또는 간접 연결 근거를 확인했습니다.</p>';
  container.innerHTML = `${connectedSection}${missingSection}`;
  container.hidden = false;
  updateJdSteps();
}

function parseApplicationQuestions(value) {
  return window.JDAiClient.parseQuestions(value);
}

function applicationDraftId(placement) {
  return window.ApplicationWorkspace.draftId(placement);
}

function loadApplicationDrafts() {
  try {
    return JSON.parse(window.localStorage.getItem(APPLICATION_DRAFT_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function loadApplicationDraft(placement) {
  return window.ApplicationWorkspace.readDraft(loadApplicationDrafts(), placement);
}

function saveApplicationDraft(placement, value) {
  try {
    const drafts = JSON.parse(window.localStorage.getItem(APPLICATION_DRAFT_KEY) || "{}");
    const id = applicationDraftId(placement);
    if (value) drafts[id] = value;
    else delete drafts[id];
    window.localStorage.setItem(APPLICATION_DRAFT_KEY, JSON.stringify(drafts));
    return true;
  } catch (_error) {
    return false;
  }
}

function loadApplicationDraftHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(APPLICATION_DRAFT_HISTORY_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function saveApplicationWorkspace() {
  if (!state.jdAnalysis) return false;
  try {
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      company: document.querySelector("#jd-company").value.trim(),
      role: document.querySelector("#jd-role").value.trim(),
      sourceType: document.querySelector("#jd-source-type").value,
      collectedAt: document.querySelector("#jd-collected-at").value,
      sourceUrl: document.querySelector("#jd-source-url").value.trim(),
      jdText: document.querySelector("#jd-text").value,
      cleanedText: document.querySelector("#jd-cleaned-text").value,
      questions: document.querySelector("#jd-application-questions").value,
      jdAnalysis: state.jdAnalysis,
      profileConnections: state.profileConnections,
      questionMap: state.questionMap,
      questionProfileEntries: state.questionProfileEntries,
    };
    const id = window.ApplicationWorkspace.workspaceScope({ company: snapshot.company, role: snapshot.role, jdText: snapshot.cleanedText || snapshot.jdText });
    snapshot.id = id;
    const library = window.ApplicationWorkspace.upsertWorkspace(loadApplicationWorkspaceLibrary(), snapshot, 8);
    window.localStorage.setItem(APPLICATION_WORKSPACE_LIBRARY_KEY, JSON.stringify(library));
    window.localStorage.setItem(APPLICATION_WORKSPACE_KEY, JSON.stringify(snapshot));
    refreshApplicationWorkspaceOptions(id);
    return true;
  } catch (_error) {
    return false;
  }
}

function loadApplicationWorkspaceLibrary() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(APPLICATION_WORKSPACE_LIBRARY_KEY) || "null");
    if (stored) return window.ApplicationWorkspace.normalizeWorkspaceLibrary(stored);
  } catch (_error) {
    // 손상된 목록은 빈 목록으로 다시 시작한다.
  }
  return window.ApplicationWorkspace.normalizeWorkspaceLibrary();
}

function refreshApplicationWorkspaceOptions(selectedId = "") {
  const library = loadApplicationWorkspaceLibrary();
  renderWorkspaceCards(library);
  renderCommonWorkspaceFacts(library);
}

// 24회차: 저장한 지원 작업을 카드 목록으로 보여준다. 드롭다운에는
// 회사·직무·날짜만 보여서 어느 작업이 어디까지 진행됐는지 알 수 없었다.
// 카드에는 회사·직무, 저장 날짜, 진행 상태(분석/경험 연결/초안 개수)를
// 한눈에 보이고, 열기·삭제를 카드에서 바로 한다.
function renderWorkspaceCards(library) {
  const list = document.querySelector("#jd-workspace-list");
  if (!list) return;
  const rows = Object.values(library.items || {}).sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));
  const count = document.querySelector("#jd-workspace-count");
  if (count) count.textContent = rows.length ? `저장한 지원 작업 · ${rows.length}개` : "저장한 지원 작업";
  if (!rows.length) {
    list.innerHTML = '<p class="jd-workspace-empty">아직 저장한 작업이 없습니다.</p>';
    return;
  }
  const drafts = loadApplicationDrafts();
  list.innerHTML = rows.map((row) => {
    const summary = window.ApplicationWorkspace.summarizeWorkspace(row, drafts);
    const savedAt = new Date(row.savedAt);
    const date = Number.isNaN(savedAt.getTime()) ? "" : savedAt.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
    const connParts = [];
    if (summary.connectionCounts.direct) connParts.push(`직접 ${summary.connectionCounts.direct}개`);
    if (summary.connectionCounts.indirect) connParts.push(`간접 ${summary.connectionCounts.indirect}개`);
    if (summary.connectionCounts.none) connParts.push(`추가 근거 필요 ${summary.connectionCounts.none}개`);
    const progress = summary.step === 4
      ? `분석 완료 · 경험 연결 완료 · 초안 ${summary.draftCount}/${summary.questionCount}개`
      : summary.step === 3
        ? `분석 완료 · 경험 연결 ${connParts.join(" · ") || "완료"}`
        : "분석 완료";
    const active = library.activeId === row.id;
    return `<article class="jd-workspace-card" data-workspace-id="${escapeHtml(row.id)}">
      <div><strong>${escapeHtml(`${row.company || "회사 미입력"} · ${row.role || "직무 미입력"}`)}</strong><span>${escapeHtml([date ? `${date} 저장` : "", progress].filter(Boolean).join(" · "))}</span></div>
      <div>${active ? '<span class="jd-workspace-active">지금 보고 있는 작업</span>' : ""}<button type="button" data-workspace-open="${escapeHtml(row.id)}">열기</button><button type="button" data-workspace-delete="${escapeHtml(row.id)}">삭제</button></div>
    </article>`;
  }).join("");
}

function openWorkspaceCard(id = "") {
  if (!id || !restoreApplicationWorkspace(id)) window.alert("불러올 지원 작업이 없습니다.");
}

function deleteWorkspaceCard(id = "", label = "") {
  if (!id) return;
  if (!window.confirm(`“${label || "선택한 작업"}”을 이 기기에서 삭제할까요? 초안 백업 파일은 삭제되지 않습니다.`)) return;
  clearApplicationWorkspace(id);
  document.querySelector("#jd-reset").click();
}

function renderCommonWorkspaceFacts(library) {
  const details = document.querySelector("#jd-common-facts");
  if (!details) return;
  const comparison = window.ApplicationWorkspace.compareWorkspaceFacts(Object.values(library.items));
  details.hidden = comparison.comparedCount < 2;
  document.querySelector("#jd-common-facts-count").textContent = comparison.comparedCount >= 2 ? `${comparison.comparedCount}개 공고 비교` : "";
  const output = document.querySelector("#jd-common-facts-list");
  if (!comparison.common.length) {
    output.innerHTML = '<p class="jd-empty-result">두 공고 이상에서 반복된 표준 키워드나 직접 요구된 도구가 없습니다.</p>';
    return;
  }
  output.innerHTML = comparison.common.map((row) => `<article><div><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.kind)} · ${row.count}개 공고</span></div><small>${escapeHtml(row.companies.join(" / "))}</small></article>`).join("");
}

function clearApplicationWorkspace(id = "") {
  try {
    const current = loadApplicationWorkspaceLibrary();
    const library = window.ApplicationWorkspace.removeWorkspace(current, id || current.activeId);
    window.localStorage.setItem(APPLICATION_WORKSPACE_LIBRARY_KEY, JSON.stringify(library));
    window.localStorage.removeItem(APPLICATION_WORKSPACE_KEY);
    refreshApplicationWorkspaceOptions(library.activeId);
  } catch (_error) {
    // 저장소를 사용할 수 없는 환경에서도 입력 초기화는 계속한다.
  }
}

function applyQuestionMapScope(result) {
  if (!result?.placements) return result;
  const scope = window.ApplicationWorkspace.workspaceScope({
    company: document.querySelector("#jd-company").value,
    role: document.querySelector("#jd-role").value,
    jdText: document.querySelector("#jd-cleaned-text").value || document.querySelector("#jd-text").value,
  });
  return {
    ...result,
    placements: result.placements.map((placement) => ({ ...placement, workspaceScope: placement.workspaceScope || scope })),
  };
}

function restoreApplicationWorkspace(id = "") {
  try {
    const library = loadApplicationWorkspaceLibrary();
    let snapshot = library.items[id || library.activeId] || null;
    if (!snapshot) snapshot = JSON.parse(window.localStorage.getItem(APPLICATION_WORKSPACE_KEY) || "null");
    if (!snapshot || snapshot.version !== 1 || !snapshot.jdAnalysis) return false;
    const snapshotId = snapshot.id || window.ApplicationWorkspace.workspaceScope({ company: snapshot.company, role: snapshot.role, jdText: snapshot.cleanedText || snapshot.jdText });
    snapshot.id = snapshotId;
    library.activeId = snapshotId;
    library.items[snapshotId] = snapshot;
    window.localStorage.setItem(APPLICATION_WORKSPACE_LIBRARY_KEY, JSON.stringify(library));
    document.querySelector("#jd-company").value = snapshot.company || "";
    document.querySelector("#jd-role").value = snapshot.role || "";
    document.querySelector("#jd-source-type").value = snapshot.sourceType || "official";
    document.querySelector("#jd-collected-at").value = snapshot.collectedAt || new Date().toISOString().slice(0, 10);
    document.querySelector("#jd-source-url").value = snapshot.sourceUrl || "";
    document.querySelector("#jd-text").value = snapshot.jdText || "";
    document.querySelector("#jd-cleaned-text").value = snapshot.cleanedText || snapshot.jdText || "";
    document.querySelector("#jd-application-questions").value = snapshot.questions || "";
    document.querySelector("#jd-clean-preview").hidden = !(snapshot.cleanedText || snapshot.jdText);
    document.querySelector("#jd-analyze-button").hidden = false;
    renderJdAnalysisV4(snapshot.jdAnalysis);
    if (snapshot.profileConnections?.matches?.length) {
      state.profileConnections = snapshot.profileConnections;
      renderProfileConnections(snapshot.profileConnections);
    }
    if (snapshot.questionMap?.placements?.length) {
      state.questionMap = applyQuestionMapScope(snapshot.questionMap);
      state.questionProfileEntries = Array.isArray(snapshot.questionProfileEntries) ? snapshot.questionProfileEntries : [];
      renderQuestionPlacements(state.questionMap);
    }
    refreshApplicationWorkspaceOptions(snapshotId);
    openJdStep(state.questionMap ? 4 : state.profileConnections ? 3 : 2, { scroll: false });
    return true;
  } catch (_error) {
    clearApplicationWorkspace();
    return false;
  }
}

function saveApplicationDraftVersion(placement, value) {
  try {
    const next = window.ApplicationWorkspace.addHistory(loadApplicationDraftHistory(), placement, value);
    window.localStorage.setItem(APPLICATION_DRAFT_HISTORY_KEY, JSON.stringify(next));
    return window.ApplicationWorkspace.historyFor(next, placement);
  } catch (_error) {
    return null;
  }
}

function applicationDraftHistoryOptions(placement) {
  const history = window.ApplicationWorkspace.historyFor(loadApplicationDraftHistory(), placement);
  const options = history.map((row, index) => {
    const savedAt = new Date(row.savedAt);
    const label = Number.isNaN(savedAt.getTime()) ? `이전 버전 ${index + 1}` : savedAt.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const preview = row.value.replace(/\s+/g, " ").slice(0, 24);
    return `<option value="${index}">${escapeHtml(`${label} · ${preview}${row.value.length > 24 ? "…" : ""}`)}</option>`;
  }).join("");
  return `<option value="">${history.length ? "보관한 버전 선택" : "보관한 버전 없음"}</option>${options}`;
}

function refreshDraftHistoryControls(output, placement) {
  const select = output.querySelector("[data-draft-history]");
  if (!select) return;
  select.innerHTML = applicationDraftHistoryOptions(placement);
}

function renderQuestionPlacements(result) {
  const container = document.querySelector("#jd-question-map-results");
  // 8회차: JDQ에서 보낸 배치는 저장소에서 합친다. 문항 배치를 다시 실행하거나
  // 저장 작업을 불러와도 JDQ 배치가 사라지지 않는다. 같은 문항은 한 번만 합친다.
  const placementScope = result.placements?.[0]?.workspaceScope || jdqScope();
  if (placementScope && window.ApplicationWorkspace?.mergeJdqPlacements) {
    const storedJdq = loadJdqPlacements().filter((row) => row.workspaceScope === placementScope);
    result.placements = window.ApplicationWorkspace.mergeJdqPlacements(result.placements, storedJdq);
    result.counts = window.ApplicationWorkspace.countPlacementStatuses(result.placements);
  }
  const labels = { strong: "우선 연결", usable: "보조 후보", missing: "근거 부족" };
  const workspace = window.ApplicationWorkspace.summarize(result.placements);
  const usageWarnings = workspace.warnings.length
    ? `<div class="application-workspace-warnings">${workspace.warnings.map((row) => `<p class="${escapeHtml(row.type)}">${escapeHtml(row.message)}</p>`).join("")}</div>`
    : '<p class="application-workspace-clear">경험 반복·근거 부족·채용공고 연결 누락 경고가 없습니다.</p>';
  const matrix = result.placements.map((row, index) => `<article class="application-workspace-card">
    <header><span>Q${index + 1}</span><strong>${labels[row.status]}</strong>${row.fromJdq ? "<small>연습 문항</small>" : ""}</header>
    <h4>${escapeHtml(row.question.text)}</h4>
    <p><b>${row.experience ? escapeHtml(row.experience.label) : "근거 부족"}</b></p>
    <p>${row.jdRequirement ? escapeHtml(row.jdRequirement.text) : "채용공고와 직접 연결 없음"}</p>
  </article>`).join("");
  const dashboard = `<section class="application-workspace">
    <div class="application-workspace-head"><div><strong>지원서 전체 연결</strong><span data-application-progress>초안 0/${workspace.questionCount}</span></div><div><button type="button" data-copy-application-plan>연결표 복사</button><button type="button" data-download-application-drafts>초안 백업</button></div></div>
    ${result.source === "local" ? '<p class="jd-local-note">서버 없이 이 기기에서 규칙으로 연결했습니다. 프로필 원문은 외부로 전송되지 않았습니다. 초안 뼈대는 원문 근거만 보여줍니다.</p>' : ""}
    <div class="application-workspace-stats"><span><b>${workspace.questionCount}</b>문항</span><span><b>${workspace.uniqueExperienceCount}</b>개 경험</span><span><b>${workspace.repeatedExperienceCount}</b>개 반복</span><span><b>${workspace.missingCount}</b>개 근거 부족</span>${workspace.jdqCount ? `<span><b>${workspace.jdqCount}</b>개 연습 문항</span>` : ""}</div>
    ${usageWarnings}<div class="application-package-checks" data-package-checks></div><div class="application-draft-overlaps" data-draft-overlaps></div>
    <section class="application-submission-checklist">
      <div class="application-submission-head"><div><strong>최종 제출 점검</strong><span data-submission-status>작성 중</span></div><small>실제 채용 페이지의 문항·글자 수는 마지막에 직접 확인하세요.</small></div>
      <div class="application-submission-stats">
        <span><b data-submission-completed>0/${workspace.questionCount}</b>초안</span><span><b data-submission-evidence>0</b>근거 부족</span><span><b data-submission-anchor>0</b>채용공고 미연결</span><span><b data-submission-facts>0</b>수치 확인</span><span><b data-submission-overlaps>0</b>표현 반복</span><span><b data-submission-limit>0</b>글자 초과</span><span><b data-submission-company>0</b>회사명 확인</span><span><b data-submission-placeholder>0</b>임시 표기</span>
      </div>
      <p data-submission-note>문항별 초안을 작성하면 제출 전 점검 결과가 표시됩니다.</p>
      <div class="application-submission-actions"><label><span>내보내기 형식</span><select data-submission-format><option value="sectioned">문항·답변형</option><option value="numbered">번호형</option><option value="answers">답변만</option></select></label><button type="button" data-copy-submission>제출본 복사</button><button type="button" data-download-submission-review>검토본 받기</button></div>
    </section>
    <div class="application-workspace-cards">${matrix}</div>
  </section>`;
  const cards = result.placements.map((row, index) => {
    const evidence = row.status === "missing" ? "" : `<blockquote>${escapeHtml(row.profileEvidenceQuote)}</blockquote>`;
    const experience = row.experience ? `<strong>${escapeHtml(`${row.experience.kind} · ${row.experience.label}`)}</strong>${evidence}` : '<strong class="jd-none">연결할 경험 없음</strong>';
    const jdLink = row.jdRequirement ? `<p><span>채용공고 연결</span>${escapeHtml(row.jdRequirement.text)}</p>` : "";
    const reasoning = row.reasoning ? `<p><span>연결 판단</span>${escapeHtml(row.reasoning)}</p>` : "";
    const angle = row.writingAngle ? `<p><span>작성 방향</span>${escapeHtml(row.writingAngle)}</p>` : "";
    const missing = row.missingInfo ? `<p><span>보완할 내용</span>${escapeHtml(row.missingInfo)}</p>` : "";
    // 24회차: 저장한 작업을 다시 열면 쓴 초안이 카드에 바로 보인다.
    // 초안 입력란은 각 문항의 개요 안에만 있어서, 복원 뒤에는 개수를
    // 세는 표시만 있고 내가 쓴 문장은 일일이 열어봐야 했다. 카드에
    // 앞부분 120자를 미리 보여주고, 초안이 있으면 버튼을 "쓴 초안 보기"로
    // 바꿔 개요 안의 초안 입력란으로 바로 가게 한다.
    const savedDraft = loadApplicationDraft(row).trim();
    const draftPreview = savedDraft ? `<p><span>쓴 초안</span>${escapeHtml(savedDraft.slice(0, 120))}${savedDraft.length > 120 ? "…" : ""}</p>` : "";
    // JDQ에서 보낸 배치는 "작성 개요 만들기"를 달지 않는다. 개요 만들기는
    // AI 배치의 경험 원문(E번호)으로 여는 기능인데, JDQ 답변은 JDQ 카드의
    // 답변란에서 직접 고치고, 초안은 거기서 저장·동기화한다.
    // 14회차: 로컬 배치는 서버 개요 대신 "초안 뼈대 보기"를 단다. 뼈대는
    // 원문 발췌만 보여주고 행동·결과는 직접 채우는 안내 문구다.
    const outlineLabel = savedDraft ? "쓴 초안 보기" : (result.source === "local" ? "초안 뼈대 보기" : "작성 개요 만들기");
    const outlineButton = row.status === "missing" || row.fromJdq ? "" : result.source === "local"
      ? `<button class="jd-outline-button" type="button" data-build-local-outline>${outlineLabel}</button>`
      : `<button class="jd-outline-button" type="button" data-build-outline>${outlineLabel}</button>`;
    return `<article class="jd-question-placement ${escapeHtml(row.status)}" data-placement-index="${index}">
      <header><span>Q${index + 1}</span><strong>${labels[row.status]}</strong>${row.fromJdq ? `<small>연습 문항 · 실제 지원 문항이 아니므로 제출용 초안에 안 들어갑니다</small>` : ""}${row.reuseCount > 1 ? `<small>같은 경험 ${row.reuseCount}회 사용</small>` : ""}</header>
      <h4>${escapeHtml(row.question.text)}</h4>
      <div class="jd-question-intent"><span>문항 의도</span>${escapeHtml(row.intent)}</div>
      <div class="jd-question-experience"><span>연결한 경험</span>${experience}</div>
      <div class="jd-question-guidance">${jdLink}${reasoning}${angle}${missing}${draftPreview}</div>
      ${outlineButton}<div class="jd-outline-result" data-outline-result hidden></div>
    </article>`;
  }).join("");
  container.innerHTML = `${dashboard}<div class="jd-question-map-summary"><strong>문항별 상세</strong><span>우선 ${result.counts.strong} · 보조 ${result.counts.usable} · 부족 ${result.counts.missing}</span></div>${cards}`;
  container.hidden = false;
  updateApplicationProgress();
  updateJdSteps();
}

function updateApplicationProgress() {
  const progress = document.querySelector("[data-application-progress]");
  if (!progress || !state.questionMap) return;
  const drafts = loadApplicationDrafts();
  // 15회차: 진행률·최종 점검은 실제 지원 문항만 센다. JDQ 연습 문항은
  // 배치표에만 남기고 제출본·진행률에서는 빼니, JDQ 초안이 "초안 x/y"를
  // 부풀리거나 제출 점검에 JDQ 문항을 넣지 못한다.
  // 표 차원의 수치·표현 반복 점검(reviewPackage)은 합친 전체 배치로
  // 계속 돌려 JDQ 초안과 실제 초안 사이의 수치 불일치도 잡는다.
  const submissionOnly = window.ApplicationWorkspace.submissionPlacements(state.questionMap.placements);
  const completed = submissionOnly.filter((row) => window.ApplicationWorkspace.readDraft(drafts, row).trim()).length;
  progress.textContent = `초안 ${completed}/${submissionOnly.length}`;
  const packageOutput = document.querySelector("[data-package-checks]");
  const packageReview = window.ApplicationWorkspace.reviewPackage(state.questionMap.placements, drafts, state.questionProfileEntries);
  const submissionReview = window.ApplicationWorkspace.buildSubmissionChecklist({
    placements: submissionOnly,
    drafts,
    profileEntries: state.questionProfileEntries,
    currentCompany: document.querySelector("#jd-company").value.trim(),
    knownCompanies: Object.values(loadApplicationWorkspaceLibrary().items).map((row) => row.company),
  });
  const submissionStatusLabels = { writing: "작성 중", review: "검토 필요", basic_pass: "기본 점검 통과" };
  const submissionStatus = document.querySelector("[data-submission-status]");
  if (submissionStatus) {
    submissionStatus.textContent = submissionStatusLabels[submissionReview.status];
    submissionStatus.dataset.status = submissionReview.status;
    document.querySelector("[data-submission-completed]").textContent = `${submissionReview.completedCount}/${submissionReview.questionCount}`;
    document.querySelector("[data-submission-evidence]").textContent = submissionReview.evidenceMissingCount;
    document.querySelector("[data-submission-anchor]").textContent = submissionReview.jdAnchorMissingCount;
    document.querySelector("[data-submission-facts]").textContent = submissionReview.unsupportedNumberCount + submissionReview.numericConflictCount;
    document.querySelector("[data-submission-overlaps]").textContent = submissionReview.overlapCount;
    document.querySelector("[data-submission-limit]").textContent = submissionReview.overLimitCount;
    document.querySelector("[data-submission-company]").textContent = submissionReview.companyMentionCount;
    document.querySelector("[data-submission-placeholder]").textContent = submissionReview.placeholderCount;
    const note = document.querySelector("[data-submission-note]");
    if (submissionReview.status === "basic_pass") note.textContent = "저장된 채용공고·경험 원문 기준의 자동 점검을 통과했습니다. 제출 화면의 제한 조건만 마지막으로 대조하세요.";
    else if (submissionReview.status === "review") note.textContent = "초안은 모두 작성됐지만 근거·수치·반복 표현 중 다시 확인할 항목이 있습니다.";
    else note.textContent = `미작성 초안 ${submissionReview.questionCount - submissionReview.completedCount}개가 남았습니다.`;
  }
  if (packageOutput) {
    const unsupported = packageReview.unsupportedNumbers.map((row) => `<li><b>Q${row.questionIndex + 1}</b><span>“${escapeHtml(row.value)}”은 연결한 경험 원문에서 확인되지 않습니다.</span><small>${escapeHtml(row.context)}</small></li>`).join("");
    const conflicts = packageReview.numericConflicts.map((row) => `<li><b>Q${row.leftIndex + 1}·Q${row.rightIndex + 1}</b><span>같은 경험에 ${escapeHtml(row.leftValue)}와 ${escapeHtml(row.rightValue)}가 사용되었습니다.</span><small>서로 다른 지표라면 설명하고, 같은 지표라면 원문 기록을 확인하세요.</small></li>`).join("");
    if (unsupported || conflicts) {
      packageOutput.innerHTML = `<strong>제출 전 사실 확인</strong><ul>${unsupported}${conflicts}</ul><p>수치가 틀렸다는 확정 판정이 아니라, 현재 저장한 경험 원문에서 자동으로 확인하지 못했다는 뜻입니다.</p>`;
      packageOutput.classList.add("has-warning");
    } else {
      packageOutput.innerHTML = `<span>${completed ? "현재 초안의 수치 표현이 저장한 경험 원문과 충돌하지 않습니다." : "초안을 작성하면 수치·성과의 경험 원문 일치 여부를 확인합니다."}</span>`;
      packageOutput.classList.remove("has-warning");
    }
  }
  const overlapOutput = document.querySelector("[data-draft-overlaps]");
  if (!overlapOutput) return;
  const overlaps = window.ApplicationWorkspace.findDraftOverlaps(state.questionMap.placements, drafts);
  if (overlaps.length) {
    overlapOutput.innerHTML = `<strong>문항 간 반복 표현 확인</strong>${overlaps.map((row) => `<p><b>Q${row.leftIndex + 1}·Q${row.rightIndex + 1}</b><span>공통 표현 ${escapeHtml(row.sharedTerms.join(" · "))}</span><small>같은 사례를 쓰더라도 문항별 핵심 행동과 결론이 겹치지 않는지 확인하세요.</small></p>`).join("")}`;
    overlapOutput.classList.add("has-warning");
  } else {
    overlapOutput.innerHTML = `<span>${completed >= 2 ? "현재 저장된 초안에서 뚜렷한 문항 간 반복 표현을 찾지 못했습니다." : "초안을 2개 이상 작성하면 문항 간 반복 표현을 확인합니다."}</span>`;
    overlapOutput.classList.remove("has-warning");
  }
}

function applicationWorkspaceText(includeDrafts = false) {
  return window.ApplicationWorkspace.buildText({
    company: document.querySelector("#jd-company").value.trim(),
    role: document.querySelector("#jd-role").value.trim(),
    placements: state.questionMap?.placements || [],
    drafts: loadApplicationDrafts(),
    includeDrafts,
  });
}

function downloadApplicationDrafts() {
  const content = applicationWorkspaceText(true);
  const company = document.querySelector("#jd-company").value.trim() || "지원회사";
  const role = document.querySelector("#jd-role").value.trim() || "지원직무";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${company}_${role}_지원서_작업본.txt`.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function submissionExportText(includeReview = false) {
  // 15회차: 제출본은 실제 지원 문항만 싣는다 (buildSubmissionText도
  // 안에서 한 번 더 거른다 — 방어 목적).
  return window.ApplicationWorkspace.buildSubmissionText({
    company: document.querySelector("#jd-company").value.trim(),
    role: document.querySelector("#jd-role").value.trim(),
    placements: window.ApplicationWorkspace.submissionPlacements(state.questionMap?.placements || []),
    drafts: loadApplicationDrafts(),
    profileEntries: state.questionProfileEntries || [],
    knownCompanies: Object.values(loadApplicationWorkspaceLibrary().items).map((row) => row.company),
    format: document.querySelector("[data-submission-format]")?.value || "sectioned",
    includeReview,
  });
}

function downloadSubmissionReview() {
  const company = document.querySelector("#jd-company").value.trim() || "지원회사";
  const role = document.querySelector("#jd-role").value.trim() || "지원직무";
  const blob = new Blob([submissionExportText(true)], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${company}_${role}_제출전_검토본.txt`.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function downloadJdAnalysisReport() {
  const company = document.querySelector("#jd-company").value.trim() || "지원회사";
  const role = document.querySelector("#jd-role").value.trim() || "지원직무";
  const content = window.ApplicationWorkspace.buildJdReportText({
    company,
    role,
    sourceUrl: document.querySelector("#jd-source-url").value.trim(),
    collectedAt: document.querySelector("#jd-collected-at").value,
    analysis: state.jdAnalysis,
    profileConnections: state.profileConnections,
    questionMap: state.questionMap,
  });
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${company}_${role}_JD분석.txt`.replace(/[\\/:*?"<>|]/g, "_");
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function downloadApplicationWorkspaceBackup() {
  const backup = window.ApplicationWorkspace.buildWorkspaceBackup({
    library: loadApplicationWorkspaceLibrary(),
    drafts: loadApplicationDrafts(),
    history: loadApplicationDraftHistory(),
  });
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `지원작업_백업_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

async function importApplicationWorkspaceBackup(file) {
  if (!file) return false;
  if (file.size > 2 * 1024 * 1024) throw new Error("백업 파일이 2MB를 넘습니다. 올바른 지원 작업 백업인지 확인해 주세요.");
  const imported = window.ApplicationWorkspace.normalizeWorkspaceBackup(JSON.parse(await file.text()));
  const library = window.ApplicationWorkspace.mergeWorkspaceLibraries(loadApplicationWorkspaceLibrary(), imported.library, 8);
  const drafts = { ...loadApplicationDrafts(), ...imported.drafts };
  const history = { ...loadApplicationDraftHistory(), ...imported.history };
  window.localStorage.setItem(APPLICATION_WORKSPACE_LIBRARY_KEY, JSON.stringify(library));
  window.localStorage.setItem(APPLICATION_DRAFT_KEY, JSON.stringify(drafts));
  window.localStorage.setItem(APPLICATION_DRAFT_HISTORY_KEY, JSON.stringify(history));
  const active = library.items[library.activeId];
  if (active) window.localStorage.setItem(APPLICATION_WORKSPACE_KEY, JSON.stringify(active));
  refreshApplicationWorkspaceOptions(library.activeId);
  return restoreApplicationWorkspace(library.activeId);
}

function renderQuestionOutline(result, placement) {
  const labels = { situation: "상황·문제", role: "내 역할", action: "직접 행동", result: "결과·배운 점" };
  const rows = Object.entries(labels).map(([key, label]) => {
    const row = result.fields[key];
    const value = row.value || "근거 부족";
    const quotes = row.evidenceQuotes.length ? `<small>근거: ${row.evidenceQuotes.map(escapeHtml).join(" / ")}</small>` : "";
    return `<div><strong>${label}</strong><p>${escapeHtml(value)}</p>${quotes}</div>`;
  }).join("");
  const questions = result.missingQuestions.length
    ? `<div class="jd-outline-missing"><strong>더 확인할 내용</strong><ul>${result.missingQuestions.map((row) => `<li>${escapeHtml(row.question)}</li>`).join("")}</ul></div>` : "";
  // 34회차: 로컬 뼈대에만 있는 항목(서버 개요에는 없어서 없으면 안 보인다).
  const claim = result.claim?.value
    ? `<div class="jd-outline-claim"><strong>핵심 주장 한 줄</strong><p>${escapeHtml(result.claim.value)}</p></div>` : "";
  const opening = result.opening?.value
    ? `<div class="jd-outline-opening"><strong>첫 문단</strong><p>${escapeHtml(result.opening.value)}</p></div>` : "";
  const related = (result.relatedExperiences || []).length
    ? `<div class="jd-outline-related"><strong>같은 역량의 다른 경험</strong><p>${result.relatedExperiences.map((row) => escapeHtml(`${row.kind} · ${row.label}`)).join(" / ")} — 소제목으로 추가해 보세요. 같은 문항에 경험을 2~3개 묶으면 답변이 얇아지지 않습니다.</p></div>` : "";
  const upgrade = result.upgrade?.value
    ? `<div class="jd-outline-upgrade"><strong>직접으로 올리려면</strong><p>${escapeHtml(result.upgrade.value)}</p></div>` : "";
  // 35회차: 직접 문항 보강 안내(숫자가 없을 때만)와 입사 후 목표 로드맵 안내.
  const reinforce = result.reinforce?.value
    ? `<div class="jd-outline-reinforce"><strong>더 탄탄하게 하려면</strong><p>${escapeHtml(result.reinforce.value)}</p></div>` : "";
  const roadmap = result.roadmap?.value
    ? `<div class="jd-outline-roadmap"><strong>입사 후 목표는 연차별로</strong><p>${escapeHtml(result.roadmap.value)}</p></div>` : "";
  // 36회차: 확인한 수치 — 연결한 경험에 적어 둔 측정·기록 수치. 결과
  // 부분에 쓸 수 있는 근거다. 없으면 안 보인다.
  const verifiedNumbers = result.verifiedNumbers?.value
    ? `<div class="jd-outline-verified-numbers"><strong>확인한 수치</strong><p>${escapeHtml(result.verifiedNumbers.value)}</p></div>` : "";
  const savedDraft = loadApplicationDraft(placement);
  const characterLimit = window.ApplicationWorkspace.inferCharacterLimit(placement?.question?.text);
  const countLabel = characterLimit ? `${savedDraft.length}/${characterLimit}자` : `${savedDraft.length}자`;
  const countClass = characterLimit && savedDraft.length > characterLimit ? " over-limit" : "";
  return `<div class="jd-outline-head"><span>근거 기반 작성 개요</span><button type="button" data-copy-outline>개요 복사</button></div><h5>${escapeHtml(result.headline.value || "핵심 메시지 근거 부족")}</h5>${claim}${opening}<div class="jd-outline-grid">${rows}</div>${verifiedNumbers}${related}${upgrade}${reinforce}${roadmap}${questions}<div class="jd-draft-review-input"><strong>작성한 답변 검토</strong><textarea rows="5" data-application-draft placeholder="위 개요를 참고해 직접 쓴 답변을 붙여넣으세요.">${escapeHtml(savedDraft)}</textarea><div class="jd-draft-meta"><small data-draft-save-status>${savedDraft ? "이 기기에 임시 저장됨" : "입력하면 이 기기에 자동 저장됩니다."}</small><span class="${countClass.trim()}" data-draft-count data-character-limit="${characterLimit || ""}">${countLabel}</span></div><div class="jd-draft-history"><button type="button" data-save-draft-version>현재 버전 보관</button><select data-draft-history aria-label="보관한 자기소개서 버전">${applicationDraftHistoryOptions(placement)}</select><button type="button" data-restore-draft>선택 버전 복원</button></div><small>검토를 누르면 답변과 연결한 경험 원문이 AI 분석 서버로 전송됩니다.</small><button type="button" data-review-draft>근거·구조 검토</button></div><div class="jd-draft-review-result" data-draft-review-result hidden></div>`;
}

function renderDraftReview(result) {
  const status = result.status === "grounded" ? "근거 확인" : "수정 필요";
  const supported = result.supportedPoints.length ? `<div><strong>경험 근거가 연결된 내용</strong><ul>${result.supportedPoints.map((row) => `<li><span>답변 “${escapeHtml(row.draftQuote)}”</span><small>경험 근거 “${escapeHtml(row.evidenceQuote)}”</small></li>`).join("")}</ul></div>` : "";
  const unsupported = result.unsupportedClaims.length ? `<div class="needs-review"><strong>근거를 확인하지 못한 표현</strong><ul>${result.unsupportedClaims.map((row) => `<li><span>“${escapeHtml(row.draftQuote)}”</span><small>${escapeHtml(row.reason)}</small></li>`).join("")}</ul></div>` : "";
  const gaps = result.structureGaps.length ? `<div><strong>빠진 구성</strong><ul>${result.structureGaps.map((row) => `<li>${escapeHtml(row.message)}</li>`).join("")}</ul></div>` : "";
  const plan = result.revisionPlan.length ? `<div><strong>수정 순서</strong><ol>${result.revisionPlan.map((row) => `<li>${escapeHtml(row.instruction)}</li>`).join("")}</ol></div>` : "";
  return `<div class="jd-draft-review-status ${escapeHtml(result.status)}"><strong>${status}</strong><span>${escapeHtml(result.summary)}</span></div>${supported}${unsupported}${gaps}${plan}`;
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

function renderJdRecallQuestions(result) {
  const container = document.querySelector("#jd-recall-questions");
  if (!container) return;
  const demoKind = jdqDemoKind();
  const demo = demoKind !== null;
  if (!window.JdRecallQuestions) {
    container.innerHTML = '<p class="jd-empty-result">채용공고에서 나온 질문을 만들지 못했습니다. 페이지를 새로고침해 주세요.</p>';
    state.jdRecallQuestions = null;
    return;
  }
  // 데모 모드에서는 1회차 테스트와 같은 확인된 데모 프로필만 메모리에서 쓴다.
  // 저장된 내 프로필(localStorage)은 읽지도 바꾸지도 않는다. 평소에는 저장된 프로필을 쓴다.
  // 13회차: 계획 중인 프로젝트도 함께 넘긴다. gap 문항의 다음 행동
  // 후보는 프로필의 계획에서 고른다 (없으면 없다는 사실을 밝힌다).
  const normalizedProfile = demo
    ? window.CareerProfile.normalize(demoKind === "hyundai" ? JDQ_DEMO_HYUNDAI_PROFILE : JDQ_DEMO_PROFILE)
    : window.CareerProfile.load(window.localStorage);
  const profileEntries = window.CareerProfile.toEvidenceEntries(normalizedProfile);
  const plans = window.CareerProfile.toPlanEntries(normalizedProfile);
  state.jdRecallProfileEntries = profileEntries;
  const recall = window.JdRecallQuestions.buildRecallQuestions(result, profileEntries, { plans });
  state.jdRecallQuestions = recall;
  // 8회차: 이 JD 범위(scope)에 저장된 JDQ 답변을 카드에 미리 채운다.
  const scope = jdqScope();
  const storedAnswers = loadJdqAnswers();
  const savedAnswers = {};
  recall.questions.forEach((q) => {
    // 11회차: 답변은 순서와 무관한 안정 키(key = 첫 JD 근거 번호)로 찾는다.
    // 표시 번호(JDQ-01)는 순서가 바뀌면 다른 문항을 가리키게 되지만,
    // key는 같은 JD 문항이면 순서와 무관하게 같다.
    const value = storedAnswers[`${scope}::${q.key || q.id}`];
    if (typeof value === "string" && value) savedAnswers[q.id] = value;
  });
  const demoNote = !demo ? ""
    : demoKind === "hyundai"
      ? '<p class=\"jd-recall-warning\">예시 채용공고(현대자동차 생산기술, 실제 공고 원문이 아닌 예시 문장)와 데모 프로필로 표시합니다. 저장된 내 프로필은 바꾸지 않았습니다.</p>'
      : '<p class=\"jd-recall-warning\">실제 공고 원문 · [\'26년 하반기] Talent hy-way (SK Careers R261762, 2026-08-20~08-26, 마감됨) 양산기술 채용공고 전문과 데모 프로필로 표시합니다. 저장된 내 프로필은 바꾸지 않았습니다.</p>';
  container.innerHTML = demoNote + (window.ExperienceRecall?.jdqTemplate
    ? window.ExperienceRecall.jdqTemplate(recall, savedAnswers)
    : '<p class="jd-empty-result">채용공고에서 나온 질문을 만들지 못했습니다. 페이지를 새로고침해 주세요.</p>');
}

function renderJdAnalysisV4(result) {
  const results = document.querySelector("#jd-results");
  const company = document.querySelector("#jd-company").value.trim();
  const role = document.querySelector("#jd-role").value.trim();
  const sourceType = document.querySelector("#jd-source-type").value;
  const sourceLabels = { official: "A · 기업 공식 채용공고", platform: "B · 채용 플랫폼·대행사", unknown: "C · 출처 미확인 복사본" };
  const selectedRole = result.scope?.selectedLabel || role;
  document.querySelector("#jd-result-title").textContent = [company, selectedRole].filter(Boolean).join(" · ") || "채용공고 분석 결과";
  document.querySelector("#jd-source-grade").textContent = `${sourceLabels[sourceType]} · 사용자 선택`;
  const collectedAt = document.querySelector("#jd-collected-at").value;
  const sourceUrl = document.querySelector("#jd-source-url").value.trim();
  document.querySelector("#jd-source-meta").textContent = [collectedAt ? `원문 확인일 ${collectedAt}` : "원문 확인일 미입력", sourceUrl ? `공고 주소 ${sourceUrl}` : "공고 주소 미입력"].join(" · ");
  document.querySelector("#jd-limitations").innerHTML = result.warnings.length
    ? `<strong>분석 전 확인</strong><ul>${result.warnings.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : `<strong>근거 연결·보호 용어 검사 통과</strong><p>표시된 내용이 채용공고 문장에 연결됐으며, 주의할 단어 ${result.validation?.checkedTerms?.length || 0}종의 원문 존재 여부를 확인했습니다. 전체 해석의 완전성을 보증하는 표시는 아닙니다.</p>`;

  const facts = result.facts;
  const career = result.careerAnalysis;
  document.querySelector("#jd-career-definition").innerHTML = career.definition.status === "supported"
    ? `${facts.productContext.length ? `<div class="jd-product-context"><b>채용공고 내용 · 제품·사업 맥락</b><span>${facts.productContext.map((row) => escapeHtml(row.value)).join(" · ")}</span></div>` : ""}<span class="jd-interpretation-label">자동 해석</span><p>${escapeHtml(career.definition.value)}</p>`
    : '<p class="jd-empty-result">업무와 성과 목표를 함께 연결할 근거가 부족합니다.</p>';
  document.querySelector("#jd-work-axes").innerHTML = career.workAxes.length
    ? career.workAxes.map((axis, index) => `<article><div class="jd-axis-number">0${index + 1}</div><h4>${escapeHtml(axis.title)}</h4><ul>${axis.actualWork.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p><b>이 업무의 목적</b>${escapeHtml(axis.purpose)}</p></article>`).join("")
    : '<p class="jd-empty-result">묶을 수 있는 주요 업무 문장을 찾지 못했습니다.</p>';
  document.querySelector("#jd-problems").innerHTML = career.problems.length
    ? career.problems.map((row) => `<article><div><small>문제 상황</small><strong>${escapeHtml(row.problem)}</strong></div><div><small>살펴볼 대상</small><span>${escapeHtml(row.target)}</span></div><div><small>업무 방향</small><span>${escapeHtml(row.direction)}</span></div><div><small>기대 결과</small><span>${escapeHtml(row.result)}</span></div></article>`).join("")
    : '<p class="jd-empty-result">JD가 직접 언급한 문제·성과 표현만으로는 문제 해결 구조를 만들기 어렵습니다.</p>';
  document.querySelector("#jd-competency-links").innerHTML = career.competencyLinks.length
    ? career.competencyLinks.map((row) => `<article><div><small>${escapeHtml(row.sourceKind || "채용공고 언급 항목")}</small><strong>${escapeHtml(row.requirement)}</strong></div><span class="jd-connection-arrow">→</span><div><small>${escapeHtml(row.connectionType || "해석 연결")}</small><strong>${escapeHtml(row.axisTitle || "사용 맥락 미명시")}</strong><p>${escapeHtml(row.reason)}</p></div></article>`).join("")
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
    ["필요 전공·기술지식", facts.knowledge], ["도구·소프트웨어·언어", facts.tools], ["협업 대상", facts.collaborators], ["성과 목표·지표", facts.metrics],
    ["채용공고 핵심 키워드", facts.keywords.map((row) => ({ value: row.original, evidenceIds: row.evidenceIds }))],
  ];
  document.querySelector("#jd-fact-table").innerHTML = factRows.map(([label, rows]) => `<tr><th>${label}</th><td>${jdFactValues(rows)}</td><td>${rows?.length ? jdEvidenceButtons([...new Set(rows.flatMap((row) => row.evidenceIds || []))]) : '<span class="jd-no-evidence">원문에 없음</span>'}</td></tr>`).join("");

  document.querySelector("#jd-keyword-table").innerHTML = facts.keywords.length
    ? facts.keywords.map((row) => `<tr><td><span class="jd-fact-label">원문</span> ${escapeHtml(row.original)}</td><td><span class="jd-interpretation-label">자동 표준화</span> ${escapeHtml(row.standardized)}</td><td>${jdEvidenceButtons(row.evidenceIds)}</td></tr>`).join("")
    : '<tr><td colspan="3"><span class="jd-none">원문에 없음</span></td></tr>';
  document.querySelector("#jd-direct-tools").innerHTML = facts.tools.length
    ? facts.tools.map((row) => `<article><strong>${escapeHtml(row.value)}</strong>${jdEvidenceButtons(row.evidenceIds)}</article>`).join("")
    : '<p class="jd-empty-result">채용공고에 직접 적힌 도구가 없습니다.</p>';
  document.querySelector("#jd-study-tools").innerHTML = result.studySuggestions.length
    ? result.studySuggestions.map((row) => `<article><strong>${escapeHtml(row.name)}</strong><p>${escapeHtml(row.reason)}</p>${jdEvidenceButtons(row.evidenceIds)}<small>채용공고에서 요구한 도구가 아니라 공부 후보입니다.</small></article>`).join("")
    : '<p class="jd-empty-result">근거가 충분한 도구 공부 후보를 만들지 않았습니다.</p>';
  document.querySelector("#jd-evidence-list").innerHTML = result.units.map((row) => `<article class="jd-evidence-card" id="evidence-${escapeHtml(row.id)}"><div><strong>${escapeHtml(row.id)}</strong><span class="jd-level">${escapeHtml(row.section)}</span>${row.verified ? '<span class="quote-ok">원문 확인</span>' : '<span class="quote-fail">검증 실패</span>'}</div><blockquote>${escapeHtml(row.text)}</blockquote></article>`).join("");
  renderJdRecallQuestions(result);
  state.jdAnalysis = result;
  document.querySelector("#jd-profile-connections").hidden = true;
  document.querySelector("#jd-profile-connections").innerHTML = "";
  document.querySelector("#jd-match-summary").hidden = true;
  refreshJdProfileLink();
  document.querySelector(".jd-evidence-details").open = false;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
  updateJdSteps();
  openJdStep(2, { scroll: false });
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
    <details class="profile-entry-card profile-education-entry" data-entry-id="${escapeHtml(id)}"${!row.id && index === 0 ? " open" : ""}>
      <summary class="profile-entry-heading"><span><strong>학력 ${index + 1}</strong><small>${escapeHtml(row.school || row.level || "내용 입력")}</small></span></summary>
      <div class="profile-entry-body">
      <div class="profile-field-grid profile-entry-fields">
        <label><span>학력 구분</span><select data-field="level">${profileOptions(levels, row.level || "")}</select></label>
        <label><span>학교명</span><input data-field="school" type="text" value="${escapeHtml(row.school || "")}" placeholder="학교명을 입력하세요" /></label>
        <label><span>재학 상태</span><select data-field="status">${profileOptions(statuses, row.status || "")}</select></label>
        <label><span>전공</span><input data-field="major" type="text" value="${escapeHtml(row.major || "")}" placeholder="학과·전공명" /></label>
        <label><span>입학</span><input data-field="startDate" value="${escapeHtml(row.startDate || "")}" placeholder="YYYY.MM" /></label>
        <label><span>졸업·예정</span><input data-field="endDate" value="${escapeHtml(row.endDate || "")}" placeholder="YYYY.MM" /></label>
        <div class="profile-inline-fields">
          <label><span>평균 학점</span><input data-field="gpa" inputmode="decimal" value="${escapeHtml(row.gpa || "")}" placeholder="4.16" /></label>
          <label><span>기준 평점</span><input data-field="gpaScale" inputmode="decimal" value="${escapeHtml(row.gpaScale || "")}" placeholder="4.5" /></label>
        </div>
        <label><span>총 이수학점</span><input data-field="credits" inputmode="decimal" value="${escapeHtml(row.credits || "")}" /></label>
      </div>
      <details class="profile-entry-details">
        <summary>세부정보</summary>
        <div class="profile-field-grid">
          <label><span>복수·부·세부전공</span><input data-field="secondaryMajor" value="${escapeHtml(row.secondaryMajor || "")}" /></label>
          <label><span>편입 여부</span><select data-field="transfer">${profileOptions(transfers, row.transfer || "")}</select></label>
          <label><span>학교 소재지</span><input data-field="region" value="${escapeHtml(row.region || "")}" /></label>
        </div>
        <label><span>전공 과목·성적</span><textarea data-field="coursework" rows="5" placeholder="반도체공정 · 3학점 · A+\n재료분석 · 3학점 · A0">${escapeHtml(row.coursework || "")}</textarea></label>
        <div class="profile-field-grid profile-graduate-fields">
          <label><span>지도교수 <small>대학원</small></span><input data-field="advisor" type="text" value="${escapeHtml(row.advisor || "")}" /></label>
          <label><span>LAB명 <small>대학원</small></span><input data-field="lab" type="text" value="${escapeHtml(row.lab || "")}" /></label>
        </div>
        <label class="profile-graduate-fields"><span>연구분야 <small>대학원</small></span><textarea data-field="research" rows="3">${escapeHtml(row.research || "")}</textarea></label>
        <label class="profile-graduate-fields"><span>논문 실적</span><textarea data-field="theses" rows="3" placeholder="논문명 · 저널 · SCIE 여부 · 저자 · 출판일 · IF">${escapeHtml(row.theses || "")}</textarea></label>
        <label class="profile-graduate-fields"><span>학회 경험</span><textarea data-field="conferences" rows="3" placeholder="학회명 · 발표 주제 · 발표 내용 · 발표일 · Oral 여부">${escapeHtml(row.conferences || "")}</textarea></label>
      </details>
      <button class="profile-entry-remove" type="button" data-remove-entry>학력 삭제</button>
      </div>
    </details>`;
}

function experienceEntryTemplate(row = {}, index = 0) {
  const id = row.id || profileEntryId("experience");
  const types = ["", "경력", "인턴", "프로젝트", "공정·분석 실습", "연구", "교육", "공모전", "학회", "교내 활동", "동아리", "봉사", "아르바이트", "기타"];
  const notes = [
    ["rawNotes", "경험 메모"], ["recallDraft", "정리 중인 메모"], ["confirmedRecall", "추가로 확인한 경험"],
    ["angleChip", "칩메이커"], ["angleEquipment", "장비사"], ["angleQuality", "품질"], ["angleProduction", "생산기술"],
  ];
  return `
    <details class="profile-entry-card profile-experience-entry" data-entry-id="${escapeHtml(id)}"${!row.id && index === 0 ? " open" : ""}>
      <summary class="profile-entry-heading"><span><strong>경험 ${index + 1}</strong><small>${escapeHtml(row.title || row.type || "내용 입력")}</small></span></summary>
      <div class="profile-entry-body">
        <div class="profile-field-grid profile-entry-fields">
          <label><span>구분</span><select data-field="type">${profileOptions(types, row.type || "")}</select></label>
          <label><span>활동명</span><input data-field="title" value="${escapeHtml(row.title || "")}" /></label>
          <label><span>회사·기관</span><input data-field="organization" value="${escapeHtml(row.organization || "")}" /></label>
          <label><span>역할·직책</span><textarea data-field="role" rows="1">${escapeHtml(row.role || "")}</textarea></label>
          <label><span>시작</span><input data-field="startDate" value="${escapeHtml(row.startDate || "")}" placeholder="YYYY.MM" /></label>
          <label><span>종료</span><input data-field="endDate" value="${escapeHtml(row.endDate || "")}" placeholder="YYYY.MM 또는 진행 중" /></label>
        </div>
        <label><span>활동 내용</span><textarea data-field="action" rows="3" placeholder="실제로 맡아서 한 일">${escapeHtml(row.action || "")}</textarea></label>
        <label><span>결과</span><textarea data-field="result" rows="2" placeholder="산출물 또는 확인한 결과">${escapeHtml(row.result || "")}</textarea></label>
        <details class="profile-entry-details">
          <summary>세부정보</summary>
          <label><span>활동 배경·목표</span><textarea data-field="situation" rows="2">${escapeHtml(row.situation || "")}</textarea></label>
          <label><span>사용 기술·장비</span><input data-field="tools" value="${escapeHtml(row.tools || "")}" /></label>
          <label><span>확인한 수치</span><input data-field="verifiedNumbers" value="${escapeHtml(row.verifiedNumbers || "")}" /></label>
        </details>
        ${notes.some(([key]) => row[key]) ? `<details class="profile-entry-details">
          <summary>기존 경험 메모</summary>
          ${notes.filter(([key]) => row[key]).map(([key, label]) => `<label><span>${label}</span><textarea data-field="${key}" rows="2">${escapeHtml(row[key])}</textarea></label>`).join("")}
        </details>` : ""}
        <button class="profile-entry-remove" type="button" data-remove-entry>경험 삭제</button>
      </div>
    </details>`;
}

function planEntryTemplate(row = {}, index = 0) {
  // 13회차: 계획 중인 프로젝트 입력 카드. 수행한 경험이 아니므로
  // 경험 템플릿(S-A-R)과 다르게, 채울 역량·활동만 적는다.
  const id = row.id || profileEntryId("plan");
  return `
    <details class="profile-entry-card profile-plan-entry" data-entry-id="${escapeHtml(id)}"${index === 0 ? " open" : ""}>
      <summary class="profile-entry-heading"><span><strong>계획 ${index + 1}</strong><small>${escapeHtml(row.title || "내용 입력")}</small></span><button type="button" data-remove-entry>삭제</button></summary>
      <div class="profile-entry-body">
      <div class="profile-field-grid profile-entry-fields">
        <label><span>계획 중인 프로젝트명</span><input data-field="title" type="text" value="${escapeHtml(row.title || "")}" placeholder="예: B1500 전기 측정 실습" /></label>
        <label><span>시기</span><input data-field="period" type="text" value="${escapeHtml(row.period || "")}" placeholder="예: 2027-1학기" /></label>
      </div>
      <label><span>채울 역량·활동 <small>'측정·품질·장비·프로그램' 같은 핵심 어휘로 적어 주세요 — '열심히 하기' 같은 말은 연결이 안 됩니다</small></span><textarea data-field="covers" rows="3" placeholder="예: 전기 측정·CTQ 추출·분포·변동·이상치·고장 패턴·축소 측정 검증">${escapeHtml(row.covers || "")}</textarea></label>
      <label><span>메모 <small>선택</small></span><textarea data-field="note" rows="2" placeholder="예: 실습 과목과 함께 진행">${escapeHtml(row.note || "")}</textarea></label>
      </div>
    </details>`;
}

function readProfileEntries(selector) {
  return [...document.querySelectorAll(`${selector} [data-entry-id]`)].map((card) => {
    const row = { id: card.dataset.entryId };
    card.querySelectorAll("[data-field]").forEach((field) => { row[field.dataset.field] = field.value; });
    return row;
  });
}

// 19회차: 프로필 경험 카드에 채용공고 질문 연결 힌트.
// 20회차: 학력 카드와 AI 문제해결 경험에도 같은 힌트를 확장한다.
// 학력·AI 경험도 연결 대상이다 (toEvidenceEntries의 education-N,
// ai-experience id로 질문과 연결된다). 저장된 항목 id로 맞추므로,
// 저장하지 않은 새 카드는 저장 뒤 다시 분석해야 힌트가 맞는다
// (경험 카드도 같은 기준이다).
// 22회차: 데모 모드(?jdq-demo=skhynix) 힌트 id 불일치 수정. 데모
// 모드에서는 분석이 데모 프로필(exp-kfp 등)로 되는데 폼에는 저장된
// 프로필 카드가 보여서, id로는 힌트가 절대 맞지 않았다 (19회차부터
// 알려진 것). 데모 모드에서만, id가 안 맞으면 경험명·전공·학교명으로
// 한 번 더 맞춘다. 제목이 다르면 힌트가 안 뜨는 게 맞다 (오연결
// 방지). 평소 모드에서는 id만 쓴다. AI 경험은 양쪽 다
// "ai-experience"라 id가 맞아서 바꿀 게 없다.
// 마지막 채용공고 분석(state.jdRecallQuestions)의 질문별 연결 경험 id를
// 모아, 연결된 경험 카드에 "채용공고 질문 1번·3번과 연결됩니다"를 단다.
// 연결되지 않은 경험에는 달지 않는다. 힌트는 마지막 분석 기준이며,
// 프로필을 고친 뒤에는 다시 분석해야 최신 연결이 반영된다.
function jdqDemoKind() {
  const kind = new URLSearchParams(window.location.search).get("jdq-demo");
  return kind === "skhynix" || kind === "hyundai" ? kind : null;
}

function isJdqDemo() {
  return jdqDemoKind() !== null;
}

function jdQuestionLinksByEntry() {
  const map = new Map();
  (state.jdRecallQuestions?.questions || []).forEach((question, index) => {
    const id = question.linkedExperience?.id;
    if (!id) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(index + 1);
  });
  return map;
}

// 데모 모드 전용: 질문별 연결 경험명을 모은다. id가 안 맞는 데모
// 모드에서 카드 제목으로 맞출 때 쓴다.
function jdQuestionLinksByLabel() {
  const map = new Map();
  (state.jdRecallQuestions?.questions || []).forEach((question, index) => {
    const label = question.linkedExperience?.label;
    if (!label) return;
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(index + 1);
  });
  return map;
}

function refreshProfileJdHints() {
  const links = jdQuestionLinksByEntry();
  refreshProfileEntryHints("#profile-experience-section", "#profile-experience-list .profile-experience-entry", "경험", links);
  refreshProfileEntryHints("#profile-education-section", "#profile-education-list .profile-education-entry", "학력", links);
  refreshProfileAiHint(links);
}

// 카드 목록(경험·학력) 힌트: 연결된 카드에 질문 번호를 달고, 섹션 위에
// "채용공고 질문과 연결된 경험/학력 M개 / 전체 N개"를 보여준다.
// 분석이 없으면 힌트·요약을 지운다.
function refreshProfileEntryHints(sectionSelector, cardSelector, label, links) {
  const section = document.querySelector(sectionSelector);
  if (!section) return;
  const labelLinks = isJdqDemo() ? jdQuestionLinksByLabel() : null;
  const cards = [...document.querySelectorAll(cardSelector)];
  let linkedCount = 0;
  cards.forEach((card) => {
    let numbers = links.get(card.dataset.entryId) || [];
    if (!numbers.length && labelLinks) {
      // 데모 모드에서만: id가 안 맞으면 카드 제목으로 맞춘다.
      // 경험 카드는 경험명, 학력 카드는 전공(없으면 학교명)이다.
      // toEvidenceEntries의 경험·학력 라벨과 같은 기준이다.
      const cardLabel = card.querySelector('[data-field="title"]')?.value.trim()
        || card.querySelector('[data-field="major"]')?.value.trim()
        || card.querySelector('[data-field="school"]')?.value.trim()
        || "";
      if (cardLabel) numbers = labelLinks.get(cardLabel) || [];
    }
    if (numbers.length) linkedCount += 1;
    let hint = card.querySelector(".profile-jd-hint");
    if (!numbers.length) {
      if (hint) hint.remove();
      return;
    }
    const text = `채용공고 질문 ${numbers.map((n) => `${n}번`).join("·")}과 연결됩니다`;
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "profile-jd-hint";
      card.querySelector(".profile-entry-body").prepend(hint);
    }
    hint.textContent = text;
  });
  let summary = section.querySelector(".profile-jd-summary");
  if (!state.jdRecallQuestions) {
    if (summary) summary.remove();
    return;
  }
  if (!summary) {
    summary = document.createElement("p");
    summary.className = "profile-jd-summary";
    section.querySelector(".profile-section-heading").after(summary);
  }
  summary.textContent = `채용공고 질문과 연결된 ${label} ${linkedCount}개 / 전체 ${cards.length}개`;
}

// AI 문제해결 경험은 카드 목록이 아니라 단일 입력란이라, 섹션 제목 아래에
// 힌트 한 줄만 단다. 요약은 카드가 1개뿐이라 달지 않는다.
function refreshProfileAiHint(links) {
  const section = document.querySelector("#profile-ai-section");
  if (!section) return;
  const numbers = links.get("ai-experience") || [];
  let hint = section.querySelector(".profile-jd-hint");
  if (!numbers.length || !state.jdRecallQuestions) {
    if (hint) hint.remove();
    return;
  }
  const text = `채용공고 질문 ${numbers.map((n) => `${n}번`).join("·")}과 연결됩니다`;
  if (!hint) {
    hint = document.createElement("p");
    hint.className = "profile-jd-hint";
    section.querySelector(".profile-section-heading").after(hint);
  }
  hint.textContent = text;
}

function profileFromForm() {
  return {
    name: document.querySelector("#profile-name").value,
    email: document.querySelector("#profile-email").value,
    phone: document.querySelector("#profile-phone").value,
    targetRoles: document.querySelector("#profile-target-roles").value,
    skills: document.querySelector("#profile-skills").value,
    certificates: document.querySelector("#profile-certificates").value,
    languages: document.querySelector("#profile-languages").value,
    awards: document.querySelector("#profile-awards").value,
    educations: readProfileEntries("#profile-education-list"),
    experiences: readProfileEntries("#profile-experience-list"),
    plans: readProfileEntries("#profile-plan-list"),
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
  ["name", "email", "phone", "awards"].forEach((key) => {
    document.querySelector(`#profile-${key}`).value = profile[key] || "";
  });
  document.querySelector("#profile-target-roles").value = profile.targetRoles || "";
  document.querySelector("#profile-skills").value = profile.skills || "";
  document.querySelector("#profile-certificates").value = profile.certificates || "";
  document.querySelector("#profile-languages").value = profile.languages || "";
  const educations = profile.educations || [];
  const experiences = profile.experiences || [];
  const plans = profile.plans?.length ? profile.plans : [{}];
  document.querySelector("#profile-education-list").innerHTML = educations.map(educationEntryTemplate).join("");
  document.querySelector("#profile-experience-list").innerHTML = experiences.map(experienceEntryTemplate).join("");
  document.querySelector("#profile-plan-list").innerHTML = plans.map(planEntryTemplate).join("");
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
  // 39회차: 데모 모드에서는 저장된 프로필이 아니라 데모 프로필(메모리)을
  // 보여준다. 처음 여는 브라우저(localStorage 비어 있음)에서도 3·4단계가
  // 돌아가야 하고, "저장된 내 프로필 없음" 표시는 데모에서는 거짓말이
  // 되기 때문이다. 저장된 프로필은 읽지도 바꾸지도 않는다.
  const demoEntries = isJdqDemo() && Array.isArray(state.jdRecallProfileEntries)
    ? state.jdRecallProfileEntries : [];
  const profile = window.CareerProfile.load(window.localStorage);
  const summary = window.CareerProfile.summary(profile);
  const evidenceEntries = demoEntries.length
    ? demoEntries : window.CareerProfile.toEvidenceEntries(profile);
  const container = document.querySelector("#jd-profile-link");
  if (!container) return;
  const title = container.querySelector("strong");
  const copy = container.querySelector("span");
  const button = container.querySelector("button");
  if (evidenceEntries.length) {
    container.classList.add("ready");
    if (demoEntries.length) {
      title.textContent = `데모 프로필 근거 ${evidenceEntries.length}개`;
      copy.textContent = "데모 프로필의 경험·학력 원문을 요구사항별로 비교합니다. 저장된 내 프로필은 바꾸지 않았습니다.";
      button.textContent = "내 프로필 작성";
    } else {
      title.textContent = `연결 가능한 프로필 근거 ${evidenceEntries.length}개`;
      copy.textContent = `경험 ${summary.experienceCount}개와 학력·기술·자격·어학 원문을 요구사항별로 비교합니다.`;
      button.textContent = "프로필 수정";
    }
  } else {
    container.classList.remove("ready");
    title.textContent = "저장된 내 프로필 없음";
    copy.textContent = "요구사항 분석은 가능하지만 경험 연결은 제한됩니다.";
    button.textContent = "내 프로필 작성";
  }
}

// 39회차: 3·4단계(경험 연결·문항 배치)가 쓸 프로필 근거 항목.
// 데모 모드에서는 저장된 프로필(localStorage)이 아니라 분석 당시의
// 데모 프로필 항목(state.jdRecallProfileEntries, 메모리)을 쓴다.
// 처음 여는 브라우저에서도 데모 흐름이 끝까지 돌아가게 하기 위해서다.
// 데모 항목이 없으면(분석 전) 저장된 프로필로 떨어진다.
function jdStepProfileEntries() {
  if (isJdqDemo() && Array.isArray(state.jdRecallProfileEntries) && state.jdRecallProfileEntries.length) {
    return state.jdRecallProfileEntries;
  }
  const profile = window.CareerProfile.load(window.localStorage);
  return window.CareerProfile.toEvidenceEntries(profile);
}

// 21회차: 프로필 섹션 이동 — 긴 폼이라 위아래로만 스크롤해야 하는 문제를,
// 화면 위에 단 섹션 목록으로 푼다. 누르면 해당 섹션으로 스크롤만 한다.
// 단계 내비게이션처럼 무겁게 만들지 않는다: 완료 기준·상태 표시 없음.
// 버튼 순서는 화면에 보이는 순서(경험이 맨 위)대로다.
function bindProfileForm() {
  const form = document.querySelector("#profile-form");
  const status = document.querySelector("#profile-save-status");
  fillProfileForm(window.CareerProfile.load(window.localStorage));
  refreshJdProfileLink();

  document.querySelector("#profile-add-education").addEventListener("click", () => {
    const list = document.querySelector("#profile-education-list");
    list.insertAdjacentHTML("beforeend", educationEntryTemplate({}, list.children.length));
    list.lastElementChild.open = true;
    list.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
    refreshProfileJdHints(); // 20회차: "전체 N개" 요약이 늘어난 카드 수를 반영한다.
  });

  document.querySelector("#profile-add-experience").addEventListener("click", () => {
    const list = document.querySelector("#profile-experience-list");
    list.insertAdjacentHTML("beforeend", experienceEntryTemplate({}, list.children.length));
    list.lastElementChild.open = true;
    list.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
    refreshProfileJdHints();
  });

  document.querySelector("#profile-add-plan").addEventListener("click", () => {
    const list = document.querySelector("#profile-plan-list");
    list.insertAdjacentHTML("beforeend", planEntryTemplate({}, list.children.length));
    list.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  [
    ["#profile-education-list", "학력"],
    ["#profile-experience-list", "경험"],
    ["#profile-plan-list", "계획"],
  ].forEach(([selector, label]) => {
    const container = document.querySelector(selector);
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-entry]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      button.closest("[data-entry-id]").remove();
      renumberProfileEntries(selector, label);
      refreshProfileJdHints();
      form.dispatchEvent(new Event("input"));
    });
    container.addEventListener("input", (event) => {
      const card = event.target.closest("[data-entry-id]");
      if (!card) return;
      const summary = card.querySelector(".profile-entry-heading small");
      const primary = card.querySelector(`[data-field="${label === "학력" ? "school" : "title"}"]`)?.value.trim();
      const fallback = card.querySelector(`[data-field="${label === "학력" ? "level" : "type"}"]`)?.value.trim();
      if (summary) summary.textContent = primary || fallback || "내용 입력";
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      window.CareerProfile.save(profileFromForm(), window.localStorage);
      status.className = "profile-save-status success";
      status.textContent = "이 브라우저에 저장했습니다.";
      refreshJdProfileLink();
      refreshProfileJdHints();
    } catch (_error) {
      status.className = "profile-save-status error";
      status.textContent = "브라우저에 저장하지 못했습니다. 내용을 복사해 보관해 주세요.";
    }
  });

  bindMasterResumePreview(form);

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
      form.dispatchEvent(new Event("input"));
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
    form.dispatchEvent(new Event("input"));
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

function bindMasterResumePreview(form) {
  const preview = document.querySelector("#profile-resume-section");
  const toggle = document.querySelector("#profile-resume-preview");
  const content = document.querySelector("#profile-resume-content");
  const copyAll = document.querySelector("#profile-resume-copy");
  const status = document.querySelector("#profile-resume-status");
  const fallback = document.querySelector("#profile-resume-copy-text");
  let sections = [];
  let copyVersion = 0;
  const current = () => window.CareerProfile.normalize(profileFromForm());

  function resetCopy() {
    copyVersion += 1;
    fallback.hidden = true;
    fallback.value = "";
    status.textContent = "";
  }

  function render() {
    if (preview.hidden) return;
    resetCopy();
    sections = window.ApplicationWorkspace.buildResumeSections(current());
    copyAll.disabled = !sections.length;
    content.innerHTML = sections.map(({ title, entries }, index) => `
      <section class="master-resume-copy-section">
        <header><h3>${escapeHtml(title)}</h3><button class="jd-secondary" type="button" data-copy-resume-section="${index}">항목 복사</button></header>
        ${entries.map((entry, entryIndex) => `
          <div class="master-resume-copy-entry">
            <p>${escapeHtml(entry)}</p>
            ${entries.length > 1 ? `<button class="jd-secondary" type="button" data-copy-resume-section="${index}" data-copy-resume-entry="${entryIndex}">이 내용 복사</button>` : ""}
          </div>`).join("")}
      </section>`).join("") || '<p class="master-resume-empty">입력한 내용이 여기에 표시됩니다.</p>';
  }

  async function copy(text) {
    resetCopy();
    const version = copyVersion;
    let timer;
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => { timer = setTimeout(reject, 1500); }),
      ]);
      if (version === copyVersion) status.textContent = "복사했습니다.";
    } catch (_error) {
      if (version !== copyVersion) return;
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      status.textContent = "선택된 내용을 직접 복사해 주세요.";
    } finally {
      clearTimeout(timer);
    }
  }

  toggle.addEventListener("click", () => {
    preview.hidden = !preview.hidden;
    toggle.setAttribute("aria-expanded", String(!preview.hidden));
    toggle.textContent = preview.hidden ? "미리보기·복사" : "미리보기 닫기";
    if (preview.hidden) resetCopy();
    else {
      render();
      preview.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  form.addEventListener("input", render);
  copyAll.addEventListener("click", () => copy(window.ApplicationWorkspace.buildResumeText(current())));
  content.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-resume-section]");
    if (!button) return;
    const entries = sections[Number(button.dataset.copyResumeSection)].entries;
    const index = button.dataset.copyResumeEntry;
    copy(index === undefined ? entries.join("\n\n") : entries[Number(index)]);
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
  // 38회차: "전체로 분석"을 맨 앞에 둔다. 내용 기반 분류는 추정치라
  // 사용자가 구분 없이 전체로 분석할 수 있어야 한다. 값이 ""이면
  // 전체 분석이다 (analyze의 selectedSubrole이 ""인 경우와 같다).
  subroleSelect.innerHTML = `<option value="">전체로 분석</option>` + preview.subroles.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)} · 업무 ${row.dutyCount}개</option>`).join("");
  document.querySelector("#jd-ocr-warnings").innerHTML = preview.warnings.length
    ? `<strong>글자가 잘못 읽혔을 수 있어요</strong><ul>${preview.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "<span>글자가 잘못 읽힌 흔적은 찾지 못했습니다. 그래도 회사명·직무명·공정명은 원본과 대조하세요.</span>";
  panel.hidden = false;
  document.querySelector("#jd-analyze-button").hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 18회차: 채용공고 분석 4단계 흐름. 한 번에 한 단계만 열고, 각 단계
// 완료 상태를 네비와 단계 머리에서 보여준다. 상태는 저장된 분석·연결
// 결과에서만 따오고, 없는 단계는 비활성화한다.
function jdStepStates() {
  return {
    1: state.jdAnalysis ? "완료" : "입력 전",
    2: state.jdAnalysis ? "완료" : "분석 전",
    3: state.profileConnections ? "연결됨" : "연결 전",
    4: state.questionMap ? "연결됨" : "연결 전",
  };
}

function updateJdSteps() {
  const states = jdStepStates();
  document.querySelectorAll("[data-jd-step-state]").forEach((el) => {
    const step = el.dataset.jdStepState;
    el.textContent = states[step];
    el.dataset.done = step === "1" ? String(!!state.jdAnalysis)
      : step === "2" ? String(!!state.jdAnalysis)
      : step === "3" ? String(!!state.profileConnections)
      : String(!!state.questionMap);
  });
  document.querySelectorAll("[data-jd-step-nav]").forEach((btn) => {
    btn.disabled = btn.dataset.jdStepNav !== "1" && !state.jdAnalysis;
  });
}

function openJdStep(step, { scroll = true } = {}) {
  document.querySelectorAll(".jd-step").forEach((section) => {
    const open = section.dataset.jdStep === String(step);
    section.dataset.open = open ? "true" : "false";
    const head = section.querySelector("[data-jd-step-toggle]");
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
  });
  if (!scroll) return;
  const target = document.querySelector(`.jd-step[data-jd-step="${step}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindJdSteps() {
  document.querySelectorAll("[data-jd-step-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => openJdStep(btn.dataset.jdStepToggle));
  });
  document.querySelectorAll("[data-jd-step-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!btn.disabled) openJdStep(btn.dataset.jdStepNav);
    });
  });
  document.querySelectorAll("[data-jd-step-goto]").forEach((btn) => {
    btn.addEventListener("click", () => openJdStep(btn.dataset.jdStepGoto));
  });
  updateJdSteps();
}

function bindJdAnalyzer() {
  const dateInput = document.querySelector("#jd-collected-at");
  const endpointInput = document.querySelector("#jd-ai-endpoint");
  const connectionState = document.querySelector("#jd-ai-connection-state");
  const refreshConnectionState = () => {
    const endpoint = window.JDAiClient.loadEndpoint(window.localStorage);
    endpointInput.value = endpoint;
    connectionState.textContent = endpoint ? "이 기기에 연결됨" : "연결 전";
    // 14회차: 엔드포인트가 없으면 8번은 서버가 아니라 로컬 규칙으로
    // 연결한다. 동의 문구가 서버 전송을 말하면 거짓말이 되니 바꾼다.
    const consent = document.querySelector("#jd-profile-consent");
    if (consent) {
      consent.textContent = endpoint
        ? "버튼을 누르면 저장된 프로필이 AI 분석 서버로 전송됩니다. 없는 경험은 만들지 않습니다."
        : "AI 분석 연결 주소가 설정되지 않았습니다. 아래 버튼을 누르면 서버 없이 이 기기에서 규칙으로만 연결합니다. 프로필 원문은 외부로 전송되지 않습니다.";
    }
    const linkNote = document.querySelector("#jd-profile-link-note");
    if (linkNote) {
      linkNote.textContent = endpoint
        ? "프로필은 버튼을 누르기 전까지 AI 분석 서버로 전송되지 않습니다."
        : "연결 주소가 없어 프로필은 이 기기에서만 확인합니다.";
    }
  };
  refreshConnectionState();
  refreshApplicationWorkspaceOptions();
  document.querySelector("#jd-workspace-list").addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-workspace-open]");
    if (openButton) {
      openWorkspaceCard(openButton.getAttribute("data-workspace-open"));
      return;
    }
    const deleteButton = event.target.closest("[data-workspace-delete]");
    if (deleteButton) {
      const card = deleteButton.closest("[data-workspace-card]") || deleteButton.closest(".jd-workspace-card");
      deleteWorkspaceCard(deleteButton.getAttribute("data-workspace-delete"), card?.querySelector("strong")?.textContent || "");
    }
  });
  document.querySelector("#jd-workspace-export").addEventListener("click", () => {
    if (!Object.keys(loadApplicationWorkspaceLibrary().items).length) {
      window.alert("백업할 지원 작업이 없습니다.");
      return;
    }
    downloadApplicationWorkspaceBackup();
  });
  document.querySelector("#jd-workspace-import").addEventListener("change", async (event) => {
    const input = event.target;
    try {
      const restored = await importApplicationWorkspaceBackup(input.files?.[0]);
      window.alert(restored ? "지원 작업 백업을 불러왔습니다." : "백업에서 복원할 지원 작업을 찾지 못했습니다.");
    } catch (error) {
      window.alert(error.message || "지원 작업 백업을 불러오지 못했습니다.");
    } finally {
      input.value = "";
    }
  });
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
      // 38회차: "전체로 분석"을 고르면 값은 ""이다. 이전에는 선택된
      // 옵션의 표시 문구("전체로 분석")를 직무명으로 써서, 직무명이
      // "전체로 분석"이 되는 버그가 생길 수 있었다. 값이 있을 때만
      // 표시 문구를 직무명으로 쓰고, 없으면 입력한 직무명을 쓴다.
      const subrolePicker = document.querySelector("#jd-subrole-picker");
      const subroleSelect = document.querySelector("#jd-subrole-select");
      const subroleValue = subrolePicker.hidden ? "" : subroleSelect.value;
      const selectedSubrole = subroleValue ? subroleSelect.selectedOptions[0]?.textContent.split(" · ")[0] || "" : "";
      const input = {
        jdText: document.querySelector("#jd-cleaned-text").value,
        company: document.querySelector("#jd-company").value,
        role: selectedSubrole || document.querySelector("#jd-role").value,
        sourceType: document.querySelector("#jd-source-type").value,
      };
      const result = endpoint
        ? await window.JDAiClient.analyze(input, { endpoint })
        : window.JDAnalyzer.analyze({ jdText: input.jdText, roleName: input.role, selectedSubrole: subroleValue });
      if (!endpoint) result.warnings.unshift("AI 분석 서버가 연결되지 않아 기존 규칙 기반 임시 분석을 표시합니다. 직무가 달라지면 해석이 부정확할 수 있습니다.");
      renderJdAnalysisV4(result);
      saveApplicationWorkspace();
    } catch (error) {
      window.alert(error.message || "분석 중 문제가 발생했습니다.");
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = "2. 채용공고만 분석";
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
    document.querySelector("#jd-question-map-results").hidden = true;
    state.jdAnalysis = null;
    state.profileConnections = null;
    state.questionMap = null;
    state.questionProfileEntries = [];
    updateJdSteps();
    openJdStep(1, { scroll: false });
  });
  document.querySelector("#jd-reset").addEventListener("click", () => {
    document.querySelector("#jd-form").reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    document.querySelector("#jd-results").hidden = true;
    document.querySelector("#jd-clean-preview").hidden = true;
    document.querySelector("#jd-analyze-button").hidden = true;
    document.querySelector("#jd-cleaned-text").value = "";
    document.querySelector("#jd-subrole-picker").hidden = true;
    document.querySelector("#jd-question-map-results").hidden = true;
    document.querySelector("#jd-application-questions").value = "";
    state.jdAnalysis = null;
    state.profileConnections = null;
    state.questionMap = null;
    state.questionProfileEntries = [];
    refreshApplicationWorkspaceOptions();
    updateJdSteps();
    openJdStep(1, { scroll: false });
  });
  document.querySelector("#jd-match-profile-button").addEventListener("click", async () => {
    const button = document.querySelector("#jd-match-profile-button");
    try {
      if (!state.jdAnalysis) throw new Error("먼저 채용공고만 분석해 주세요.");
      const endpoint = window.JDAiClient.loadEndpoint(window.localStorage);
      const profileEntries = jdStepProfileEntries();
      if (!profileEntries.length) throw new Error("내 프로필에 경험·학력·기술 중 하나 이상을 저장해 주세요.");
      const requirements = jdProfileRequirements(state.jdAnalysis);
      if (!requirements.length) throw new Error("연결할 채용공고 내용을 찾지 못했습니다. 채용공고를 다시 분석해 주세요.");
      button.disabled = true;
      button.textContent = "프로필 원문 근거를 확인하며 연결 중…";
      if (!endpoint) {
        // 14회차: 엔드포인트가 없으면 로컬 규칙으로 연결한다 (서버 전송 없음).
        // 서버 결과와 같은 형태라 렌더러를 그대로 쓴다.
        if (!window.JdLocalFallback) throw new Error("연결 기능이 로드되지 않았습니다. 페이지를 새로고침해 주세요.");
        const result = window.JdLocalFallback.matchProfileLocal({ requirements, profileEntries });
        state.profileConnections = result;
        renderProfileConnections(result);
        return;
      }
      const result = await window.JDAiClient.matchProfile({
        jdText: document.querySelector("#jd-cleaned-text").value,
        requirements, profileEntries,
      }, { endpoint });
      state.profileConnections = result;
      renderProfileConnections(result);
    } catch (error) {
      window.alert(error.message || "채용공고와 프로필을 연결하지 못했습니다.");
    } finally {
      button.disabled = false;
      button.textContent = "내 경험과 연결하기";
    }
  });
  document.querySelector("#jd-map-questions-button").addEventListener("click", async () => {
    const button = document.querySelector("#jd-map-questions-button");
    try {
      if (!state.jdAnalysis) throw new Error("먼저 채용공고만 분석해 주세요.");
      const endpoint = window.JDAiClient.loadEndpoint(window.localStorage);
      const questions = parseApplicationQuestions(document.querySelector("#jd-application-questions").value);
      if (!questions.length) throw new Error("자기소개서 문항을 한 개 이상 입력해 주세요.");
      const profileEntries = jdStepProfileEntries();
      if (!profileEntries.length) throw new Error("내 프로필에 경험·학력·기술 중 하나 이상을 저장해 주세요.");
      const requirements = jdProfileRequirements(state.jdAnalysis);
      button.disabled = true;
      button.textContent = "문항과 경험 근거를 비교 중…";
      if (!endpoint) {
        // 14회차: 엔드포인트가 없으면 로컬 규칙으로 배치한다 (서버 전송 없음).
        // JDQ 답변·배치는 renderQuestionPlacements가 저장된 JDQ 배치를 합친다.
        if (!window.JdLocalFallback) throw new Error("연결 기능이 로드되지 않았습니다. 페이지를 새로고침해 주세요.");
        const rawResult = window.JdLocalFallback.mapQuestionsLocal({ questions, requirements, profileEntries });
        const result = applyQuestionMapScope(rawResult);
        state.questionMap = result;
        state.questionProfileEntries = profileEntries;
        renderQuestionPlacements(result);
        saveApplicationWorkspace();
        return;
      }
      const rawResult = await window.JDAiClient.mapQuestions({
        jdText: document.querySelector("#jd-cleaned-text").value,
        questions, requirements, profileEntries,
      }, { endpoint });
      const result = applyQuestionMapScope(rawResult);
      state.questionMap = result;
      state.questionProfileEntries = profileEntries;
      renderQuestionPlacements(result);
      saveApplicationWorkspace();
    } catch (error) {
      window.alert(error.message || "문항별 경험 연결을 만들지 못했습니다.");
    } finally {
      button.disabled = false;
      button.textContent = "경험 연결하기";
    }
  });
  document.querySelector("#jd-question-map-results").addEventListener("click", async (event) => {
    const copyPlanButton = event.target.closest("[data-copy-application-plan]");
    if (copyPlanButton) {
      try {
        await navigator.clipboard.writeText(applicationWorkspaceText(false));
        copyPlanButton.textContent = "복사됨";
      } catch (_error) {
        window.alert("브라우저가 복사를 허용하지 않았습니다. 초안 백업을 이용해 주세요.");
      }
      return;
    }
    if (event.target.closest("[data-download-application-drafts]")) {
      downloadApplicationDrafts();
      return;
    }
    const copySubmissionButton = event.target.closest("[data-copy-submission]");
    if (copySubmissionButton) {
      try {
        await navigator.clipboard.writeText(submissionExportText(false));
        copySubmissionButton.textContent = "복사됨";
        window.setTimeout(() => { copySubmissionButton.textContent = "제출본 복사"; }, 1400);
      } catch (_error) {
        window.alert("브라우저가 복사를 허용하지 않았습니다. 검토본을 내려받아 답변 부분을 사용해 주세요.");
      }
      return;
    }
    if (event.target.closest("[data-download-submission-review]")) {
      downloadSubmissionReview();
      return;
    }
    const card = event.target.closest("[data-placement-index]");
    if (!card) return;
    const output = card.querySelector("[data-outline-result]");
    const placement = state.questionMap?.placements[Number(card.dataset.placementIndex)];
    const saveVersionButton = event.target.closest("[data-save-draft-version]");
    if (saveVersionButton) {
      const textarea = output.querySelector("[data-application-draft]");
      if (!textarea?.value.trim()) {
        window.alert("보관할 초안을 먼저 작성해 주세요.");
        return;
      }
      const history = saveApplicationDraftVersion(placement, textarea.value);
      if (!history) {
        window.alert("이 기기에 버전을 저장하지 못했습니다.");
        return;
      }
      refreshDraftHistoryControls(output, placement);
      output.querySelector("[data-draft-save-status]").textContent = `현재 버전을 보관했습니다. (${history.length}/5)`;
      return;
    }
    const restoreButton = event.target.closest("[data-restore-draft]");
    if (restoreButton) {
      const select = output.querySelector("[data-draft-history]");
      const history = window.ApplicationWorkspace.historyFor(loadApplicationDraftHistory(), placement);
      const selected = select?.value === "" ? null : history[Number(select?.value)];
      if (!selected) {
        window.alert("복원할 버전을 선택해 주세요.");
        return;
      }
      const textarea = output.querySelector("[data-application-draft]");
      if (textarea.value.trim()) saveApplicationDraftVersion(placement, textarea.value);
      textarea.value = selected.value;
      saveApplicationDraft(placement, selected.value);
      refreshDraftHistoryControls(output, placement);
      const countOutput = output.querySelector("[data-draft-count]");
      const characterLimit = Number(countOutput.dataset.characterLimit || 0);
      countOutput.textContent = characterLimit ? `${selected.value.length}/${characterLimit}자` : `${selected.value.length}자`;
      countOutput.classList.toggle("over-limit", Boolean(characterLimit && selected.value.length > characterLimit));
      output.querySelector("[data-draft-save-status]").textContent = "선택한 버전을 복원했습니다.";
      const reviewOutput = output.querySelector("[data-draft-review-result]");
      reviewOutput.hidden = true;
      reviewOutput.innerHTML = "";
      updateApplicationProgress();
      return;
    }
    if (event.target.closest("[data-copy-outline]")) {
      try {
        await navigator.clipboard.writeText(output.innerText.replace("개요 복사", "").trim());
        event.target.textContent = "복사됨";
      } catch (_error) {
        window.alert("브라우저가 복사를 허용하지 않았습니다.");
      }
      return;
    }
    const reviewButton = event.target.closest("[data-review-draft]");
    if (reviewButton) {
      try {
        const entryIndex = Number(String(placement?.experience?.id || "").replace("E", "")) - 1;
        const entry = state.questionProfileEntries[entryIndex];
        const draft = output.querySelector("[data-application-draft]")?.value.trim() || "";
        if (!draft) throw new Error("검토할 자기소개서 답변을 입력해 주세요.");
        if (!placement || !entry) throw new Error("연결한 경험 원문을 찾지 못했습니다. 경험 연결을 다시 실행해 주세요.");
        reviewButton.disabled = true;
        reviewButton.textContent = "근거 대조 중…";
        // 21회차: 연결 주소가 있으면 서버 검토, 없으면 이 기기에서 규칙으로만
        // 확인한다. 서버 검토와 같은 형태를 반환해 아래 렌더러를 그대로 쓴다.
        // 35회차: 뼈대가 복수 경험을 권장하므로, 검토에도 배치된 다른 경험
        // 원문(relatedExperiences)을 함께 넘긴다. 주 경험만 대조하면 다른
        // 경험의 확인된 수치를 거짓으로 지적한다. 서버는 아직 이 값을
        // 안 쓰므로(Apps Script 미반영), 서버 경로에서는 무시된다.
        const otherExperienceTexts = (placement.relatedExperiences || []).map((rel) => {
          const idx = Number(String(rel.id || "").replace("E", "")) - 1;
          const e = state.questionProfileEntries[idx];
          return e && e.text ? e.text : "";
        }).filter(Boolean);
        const endpoint = window.JDAiClient.loadEndpoint(window.localStorage);
        const result = endpoint
          ? await window.JDAiClient.reviewApplicationDraft({
              experienceText: entry.text, otherExperienceTexts, draftText: draft, questionText: placement.question.text,
              jdRequirement: placement.jdRequirement?.text || "",
            }, { endpoint })
          : (() => {
              if (!window.JdLocalFallback) throw new Error("연결 기능이 로드되지 않았습니다. 페이지를 새로고침해 주세요.");
              return window.JdLocalFallback.reviewDraftLocal({
                experienceText: entry.text, otherExperienceTexts, draftText: draft, questionText: placement.question.text,
                jdRequirement: placement.jdRequirement?.text || "",
                characterLimit: Number(output.querySelector("[data-draft-count]")?.dataset.characterLimit || 0) || undefined,
              });
            })();
        const reviewOutput = output.querySelector("[data-draft-review-result]");
        reviewOutput.innerHTML = renderDraftReview(result);
        reviewOutput.hidden = false;
        reviewButton.textContent = "다시 검토";
      } catch (error) {
        window.alert(error.message || "작성 답변을 검토하지 못했습니다.");
        reviewButton.textContent = "근거·구조 검토";
      } finally {
        reviewButton.disabled = false;
      }
      return;
    }
    // 14회차: 로컬 배치의 초안 뼈대. 서버 개요와 같은 틀을 쓰되, 로컬임을 밝힌다.
    // 21회차: 근거·구조 검토 버튼은 이제 빼지 않는다. 연결 주소가 없어도
    // 이 기기에서 규칙으로만 확인하는 로컬 검토가 뜬다.
    const localOutlineButton = event.target.closest("[data-build-local-outline]");
    if (localOutlineButton) {
      try {
        if (!placement) throw new Error("연결한 문항을 찾지 못했습니다. 경험 연결을 다시 실행해 주세요.");
        if (output.hasChildNodes() && !output.hidden) {
          output.hidden = true;
          localOutlineButton.textContent = "초안 뼈대 보기";
          return;
        }
        if (!window.JdLocalFallback) throw new Error("연결 기능이 로드되지 않았습니다. 페이지를 새로고침해 주세요.");
        // 35회차: 직접 문항 보강 안내에 쓸 경험 원문(전체)을 넘긴다.
        // 발췌만으로는 숫자가 뒤에 있는지 알 수 없다.
        const outlineEntryIndex = Number(String(placement?.experience?.id || "").replace("E", "")) - 1;
        const outlineEntry = state.questionProfileEntries[outlineEntryIndex];
        const outline = window.JdLocalFallback.buildLocalOutline(placement, {
          company: document.querySelector("#jd-company").value.trim(),
          role: document.querySelector("#jd-role").value.trim(),
          experienceText: outlineEntry ? outlineEntry.text : undefined,
        });
        output.innerHTML = renderQuestionOutline(outline, placement);
        output.querySelectorAll(".jd-draft-review-input small").forEach((note) => {
          if (note.textContent.includes("AI 분석 서버")) {
            note.textContent = "이 기기에서 만든 뼈대입니다. 검토는 이 기기에서 규칙으로만 확인합니다.";
          }
        });
        output.hidden = false;
        localOutlineButton.textContent = "초안 뼈대 닫기";
      } catch (error) {
        window.alert(error.message || "초안 뼈대를 만들지 못했습니다.");
      }
      return;
    }
    const button = event.target.closest("[data-build-outline]");
    if (!button) return;
    try {
      const entryIndex = Number(String(placement?.experience?.id || "").replace("E", "")) - 1;
      const entry = state.questionProfileEntries[entryIndex];
      if (!placement || !entry) throw new Error("연결한 경험 원문을 찾지 못했습니다. 경험 연결을 다시 실행해 주세요.");
      button.disabled = true;
      button.textContent = "근거 확인 중…";
      const result = await window.JDAiClient.buildQuestionOutline({
        experienceText: entry.text, experienceLabel: entry.label, questionText: placement.question.text,
        evidenceQuote: placement.profileEvidenceQuote, jdRequirement: placement.jdRequirement?.text || "",
        writingAngle: placement.writingAngle || "",
      }, { endpoint: window.JDAiClient.loadEndpoint(window.localStorage) });
      output.innerHTML = renderQuestionOutline(result, placement);
      output.hidden = false;
      button.textContent = "개요 다시 만들기";
    } catch (error) {
      window.alert(error.message || "작성 개요를 만들지 못했습니다.");
      button.textContent = "작성 개요 만들기";
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector("#jd-question-map-results").addEventListener("input", (event) => {
    const textarea = event.target.closest("[data-application-draft]");
    if (!textarea) return;
    const card = textarea.closest("[data-placement-index]");
    const placement = state.questionMap?.placements[Number(card?.dataset.placementIndex)];
    const output = textarea.closest("[data-outline-result]");
    const saved = saveApplicationDraft(placement, textarea.value);
    const countOutput = output.querySelector("[data-draft-count]");
    const characterLimit = Number(countOutput.dataset.characterLimit || 0);
    countOutput.textContent = characterLimit ? `${textarea.value.length}/${characterLimit}자` : `${textarea.value.length}자`;
    countOutput.classList.toggle("over-limit", Boolean(characterLimit && textarea.value.length > characterLimit));
    output.querySelector("[data-draft-save-status]").textContent = saved ? "이 기기에 임시 저장됨" : "임시 저장 실패";
    updateApplicationProgress();
  });

  // JDQ 답변 → 지원서 초안 흐름 (8회차).
  // 답변 입력은 JD 범위별로 이 기기에 자동 저장하고, 이미 보낸 문항이면
  // 지원서 초안도 함께 고친다. "지원서 초안에 보내기"는 JDQ 문항을 배치로
  // 만들어 초안에 저장하고, 배치표가 있으면 바로 합쳐서 보여준다.
  document.querySelector("#jd-recall-questions").addEventListener("input", (event) => {
    const textarea = event.target.closest("[data-jdq-answer]");
    if (!textarea) return;
    const card = textarea.closest("[data-question-id]");
    const qid = card?.dataset.questionId;
    if (!qid) return;
    const scope = jdqScope();
    // 11회차: 답변·배치는 안정 키로 저장한다 (표시 번호는 순서가 바뀌면 의미가 바뀐다).
    const key = card?.dataset.jdqKey || qid;
    saveJdqAnswer(scope, key, textarea.value);
    const status = card.querySelector("[data-jdq-save-status]");
    if (status) status.textContent = textarea.value.trim() ? "이 기기에 임시 저장됨" : "입력하면 이 기기에 자동 저장됩니다.";
    const sent = loadJdqPlacements().find((row) => row.workspaceScope === scope && row.jdqId === key);
    if (sent) saveApplicationDraft(sent, textarea.value);
  });
  document.querySelector("#jd-recall-questions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-send-to-workspace]");
    if (!button) return;
    const card = button.closest("[data-question-id]");
    const statusEl = card?.querySelector("[data-jdq-send-status]");
    const qid = card?.dataset.questionId;
    const q = state.jdRecallQuestions?.questions.find((row) => row.id === qid);
    if (!q) {
      if (statusEl) statusEl.textContent = "문항을 찾지 못했습니다. 채용공고를 다시 분석해 주세요.";
      return;
    }
    const answer = card.querySelector("[data-jdq-answer]")?.value.trim() || "";
    if (!answer) {
      if (statusEl) statusEl.textContent = "답변을 먼저 작성해 주세요.";
      return;
    }
    const scope = jdqScope();
    // 연결된 경험을 E번호로 바꾼다: 배치의 수치 점검·경험 재사용 집계가
    // AI 배치와 같은 기준으로 동작하게 한다. 못 찾으면 원래 id를 쓴다.
    let experience;
    if (q.linkedExperience) {
      const entryIndex = (state.jdRecallProfileEntries || []).findIndex((row) => row.id === q.linkedExperience.id);
      experience = entryIndex >= 0
        ? { id: `E${entryIndex + 1}`, label: q.linkedExperience.label, kind: q.linkedExperience.kind }
        : { id: q.linkedExperience.id, label: q.linkedExperience.label, kind: q.linkedExperience.kind };
    } else {
      experience = null;
    }
    const placement = window.ApplicationWorkspace.buildJdqPlacement(q, scope, experience);
    // 11회차: 답변도 안정 키로 저장한다 (buildJdqPlacement의 jdqId도 key다).
    saveJdqAnswer(scope, q.key || qid, answer);
    saveJdqPlacement(placement);
    saveApplicationDraft(placement, answer);
    saveApplicationDraftVersion(placement, answer);
    const alreadyPlaced = state.questionMap?.placements?.some((row) => row.question?.text === q.question);
    if (state.questionMap?.placements && !alreadyPlaced) {
      renderQuestionPlacements(state.questionMap);
      if (statusEl) statusEl.textContent = "지원서 초안에 반영됐어요. '자기소개서 문항에 경험 연결하기'에서 확인하세요.";
    } else if (alreadyPlaced) {
      updateApplicationProgress();
      if (statusEl) statusEl.textContent = "이미 반영된 문항입니다 — 초안을 업데이트했습니다.";
    } else {
      if (statusEl) statusEl.textContent = "지원서 초안으로 저장했습니다. '자기소개서 문항에 경험 연결하기'를 실행하면 연결표에도 나타납니다.";
    }
  });
  document.querySelector("#jd-results").addEventListener("click", (event) => {
    if (event.target.closest("[data-download-jd-report]")) {
      try {
        downloadJdAnalysisReport();
      } catch (error) {
        window.alert(error.message || "채용공고 분석 요약을 만들지 못했습니다.");
      }
      return;
    }
    const button = event.target.closest("[data-evidence-id]");
    if (!button) return;
    openJdStep(2, { scroll: false });
    const details = document.querySelector(".jd-evidence-details");
    details.open = true;
    const target = document.querySelector(`#evidence-${CSS.escape(button.dataset.evidenceId)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  bindJdSteps();
  restoreApplicationWorkspace();
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
    document.querySelector("#news-company").value = state.company;
    document.querySelector("#days-filter").value = "30";
    showChapter("news");
    render();
    document.querySelector("#result-line").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function bindProcessFocusButton() {
  document.querySelector("#process-focus-button").addEventListener("click", () => {
    state.company = "all";
    state.job = "공정기술·양산기술";
    state.domain = "all";
    state.days = "30";
    state.query = "";
    state.processFocus = true;
    syncNewsFilters();
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
    ? `공정·양산 관련 기사 ${rows.length}건`
    : `기사 ${rows.length}건`;
  const activeFilters = [state.job, state.domain, state.days].filter(value => value !== "all").length + Number(state.processFocus);
  document.querySelector("#news-active-filters").textContent = activeFilters ? `${activeFilters}개 적용` : "";
  empty.hidden = rows.length !== 0;
  grid.innerHTML = rows.map((article) => {
    const showKorean = state.language === "ko" && article.title_ko;
    const displayTitle = showKorean ? article.title_ko : article.title;
    const summary = showKorean ? (article.summary_ko || "").trim() : "";
    const translatedSummary = /^(?:태그\s*:|.+ 공식 뉴스룸 기사[.!]?$)/.test(summary) ? "" : summary;
    const tags = badgeList((article.job_roles || []).filter(value => value !== "산업·사업 공통"), "job", 1)
      + badgeList((article.tech_domains || []).filter(value => value !== "기업·산업 일반"), "domain", 1);
    return `
    <article class="article-card">
      <div class="card-meta">
        <span class="company">${escapeHtml(article.company)}</span>
        <time datetime="${escapeHtml(article.published_at)}">${formatDate(article.published_at)}</time>
      </div>
      <h2>${escapeHtml(displayTitle)}</h2>
      ${translatedSummary ? `<p class="translated-summary">${escapeHtml(translatedSummary)}</p>` : ""}
      ${tags ? `<div class="classification" aria-label="직무와 기술 분야">${tags}</div>` : ""}
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
    button.textContent = "한국어 번역 없음";
  } else if (state.language === "ko") {
    button.textContent = "원문 제목 보기";
  } else {
    button.textContent = "한국어 보기";
  }
}

function createCompanyFilters(companies) {
  const select = document.querySelector("#news-company");
  companies.forEach((company) => select.add(new Option(company, company)));
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

const newsFilterFields = {
  "#news-company": "company",
  "#job-filter": "job",
  "#domain-filter": "domain",
  "#days-filter": "days",
};

function syncNewsFilters() {
  Object.entries(newsFilterFields).forEach(([selector, key]) => {
    document.querySelector(selector).value = state[key];
  });
  document.querySelector("#search").value = state.query;
}

function bindFilters() {
  Object.entries(newsFilterFields).forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("change", (event) => {
      state[key] = event.target.value;
      render();
    });
  });
  document.querySelector("#reset-filters").addEventListener("click", () => {
    Object.values(newsFilterFields).forEach((key) => { state[key] = "all"; });
    state.query = "";
    state.processFocus = false;
    syncNewsFilters();
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
    document.querySelector("#updated").textContent = `최근 갱신 ${formatDate(data.generated_at)}`;
    createCompanyFilters(companies);
    fillSelect("#job-filter", options.job_roles || [], "job_roles");
    fillSelect("#domain-filter", options.tech_domains || [], "tech_domains");
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

// JDQ 검증용 데모 훅: ?jdq-demo=skhynix 일 때만 동작한다.
// 실제 공고 원문 ['26년 하반기] Talent hy-way 기술사무직 신입
// (SK Careers R261762, 접수 2026-08-20~08-26, 마감됨) 양산기술 JD 전문.
// 원본은 docs/SKhynix_2026H2_Yangsan_JD.txt. 로컬 규칙 기반 분석만
// 실행한다. 저장된 프로필·지원 작업을 바꾸지 않는다.
const JDQ_DEMO_JD_TEXT = `직무명: 양산기술
근무지: 이천/청주/용인
About Us
개발 완료된 제품이 최고의 품질과 성능을 갖춰 안정적으로 생산될 수 있도록, 생산 공정과 테스트를 구현하고 최적화하는 역할을 담당합니다.
What You'll Experience
• 공정 운영 및 최적화: Photolithography, Etch, Ion Implant & Diffusion, Thin Film, Cleaning & CMP 등 핵심 양산 공정을 안정적으로 운영하고, 조건을 최적화하여 생산 품질과 수율을 높입니다.
• 장비 Set-up 관리 및 개선: 반도체 장비를 Set-up하고 지속적인 개조·개선을 수행하며, 장비 업체와 협업함으로써 공정 성능과 생산성을 극대화합니다.
• 파생제품 및 요소기술 개발: 신규 파생 제품과 핵심 요소 기술을 개발하여 경쟁력을 강화하고, 차세대 제품 대응 기반을 마련합니다.
• AMHS 설계/구축/운영/제어: OHT, Stocker, Conveyor, AMR 등의 자동반송 H/W Solution의 Layout 설계/구축/운영 및 반송 제어(MCS) 최적화(Throughput/Utilization) 업무를 수행합니다.
Who we're Looking for
이런 역량이나 경험이 있다면 더 좋습니다.
• 전자, 전기, 화공, 화학, 재료, 물리, 반도체, 기계, 산업공학 등 관련 분야에 경험과 역량이 있는 분
• 반도체 공정 전반의 흐름과 원리를 이해하고 있는 분
• 반도체 관련 실험이나 프로젝트를 통해 학습해본 경험이 있는 분
• TEST/분석 프로그램 개발 등 프로그래밍을 활용해본 경험이 있는 분`;

// 데모 프로필: 1회차 테스트와 같은 확인된 경험만 사용한다.
// LabVIEW/B1500은 [USER TARGET]·계획 중이라 경험에는 포함하지 않고,
// 13회차부터 "계획 중인 프로젝트"로만 둔다. gap 문항의 다음 행동
// 후보는 이 계획에서 고른다.
const JDQ_DEMO_PROFILE = {
  targetRoles: "SK hynix 양산기술",
  educations: [{ level: "대학(학사)", school: "경북대학교", status: "재학", major: "전자공학부", gpa: "4.2", gpaScale: "4.5" }],
  experiences: [
    // 38회차: CMOS 공정 흐름 부분은 참관(관찰) 수준이라 "교육·실습"이
    // 과장이다. 사용자 직접 정정(2026-11-06) — CMOS 언급 부분만
    // "교육·참관"·"참관·학습"으로 바꾼다. 제목·타입은 전체 Fab
    // 교육 프로그램이라 그대로 둔다.
    { id: "exp-kfp", type: "교육·실습", title: "KFP 대학 Fab 실습", organization: "경북대 Fab", situation: "Cleanroom CMOS 공정 흐름 교육·참관 ~8개월", action: "공정·장비 교육 이수, CMOS 공정 흐름 참관·학습", result: "대학 Fab 교육 이수" },
    { id: "exp-ebeam", type: "실습·분석", title: "E-beam lithography 실습", situation: "23nm 패턴 형성", action: "Dose-CD-Resolution 관계 분석", result: "패턴 형성·분석", verifiedNumbers: "23nm 패턴" },
    { id: "exp-stob", type: "조사·분석", title: "STOB League", situation: "3D NAND 고적층 스케일링 조사", action: "GIDL/Retention/Endurance 조사·분석, Reflow 영향 Arrhenius 해석", result: "조사·분석 보고서" },
    { id: "exp-wonik", type: "직무마스터프로젝트", title: "원익QNC Quartz 이동 Robot 동선 최적화", organization: "원익QNC", situation: "Quartz 이동 Robot 동선 최적화 ~1개월", action: "동선 분석·최적안 도출", result: "프로젝트 초기 단계" },
    { id: "exp-ai", type: "연구", title: "AI Research Agent", situation: "Paper/Patent 조사 ~13주", action: "RAG → Summary → Trend → Recommendation", result: "요약·트렌드·추천 보고서" },
  ],
  plans: [
    { id: "plan-b1500", title: "B1500 전기 측정 실습", covers: "전기 측정·CTQ 추출·분포·변동·이상치·고장 패턴·축소 측정 검증", period: "2027-1학기" },
    { id: "plan-labview", title: "LabVIEW + Keithley 자동 측정", covers: "통신·시퀀스·상태머신·타임아웃·재시도·에러 처리·안전 정지·로깅·반복성 검증·수동/자동 측정 비교", period: "2027-1학기" },
    { id: "plan-wonik", title: "원익QNC 심화", covers: "동선 최적화를 넘어 실제 개선 전후를 측정·기록하고 인수인계까지", period: "2027-1학기" },
  ],
};

// 25회차: 반도체가 아닌 채용공고 데모(?jdq-demo=hyundai). 예시
// 채용공고 문장(실제 공고 원문이 아님)과 기계공학 데모 프로필.
// SK hynix 데모와 같은 검증용 훅이라 저장된 프로필·지원 작업을
// 바꾸지 않는다. 데모 JD·프로필 내용은 tests/test_jd_cross_industry.js
// 픽스처와 같다.
const JDQ_DEMO_HYUNDAI_JD_TEXT = `직무명: 생산기술
근무지: 울산
About Us
자동차를 안정적으로 생산할 수 있도록 생산 설비와 공정을 구현하고 최적화하는 역할을 담당합니다.
What You'll Experience
• 생산기술: 프레스·차체·도장·조립 라인의 자동화 설비를 고도화하고, Smart Factory를 구축·운영하여 생산성과 가동률을 높입니다.
• 설비 관리: 생산 설비의 예방보전 계획을 세우고 돌발고장에 대응하며, 설비 가동 상태를 점검하고 개선합니다.
• 신차 양산 준비: 신규 차종의 생산라인을 구축하고 시생산을 진행하며, 양산 전환 과정에서 발생하는 문제를 해결합니다.
• 품질 개선: 공정에서 발생하는 불량의 근본 원인을 분석하고, 재발 방지 대책을 수립합니다.
Who we're Looking for
이런 역량이나 경험이 있다면 더 좋습니다.
• 기계·전기·전자·산업공학 등 관련 분야에 경험과 역량이 있는 분
• 자동화 설비와 로봇을 활용해본 경험이 있는 분
• 데이터 분석과 프로그래밍을 활용해본 경험이 있는 분
• CAD를 활용한 설계 경험이 있는 분`;

const JDQ_DEMO_HYUNDAI_PROFILE = {
  targetRoles: "현대자동차 생산기술",
  educations: [{ level: "대학(학사)", school: "경북대학교", status: "재학", major: "기계공학부", coursework: "기계설계 · 생산자동화 · CAD 실습" }],
  experiences: [
    { id: "exp-press", type: "현장실습", title: "자동차 부품 공장 현장실습", organization: "자동차 부품 공장", situation: "프레스 라인 설비 점검 보조 ~2개월", action: "설비 예방보전 점검 보조, 가동률 데이터 정리", result: "점검 기록 정리" },
    { id: "exp-capstone", type: "프로젝트", title: "캡스톤 디자인 — 컨베이어 라인 설계", situation: "컨베이어 라인 설계 프로젝트 ~4개월", action: "CAD로 컨베이어 라인 설계, 동선·배치 최적화", result: "설계안 도출" },
    { id: "exp-robot", type: "동아리", title: "로봇 동아리", situation: "모터 제어 실습", action: "아두이노로 모터 제어 프로그램 작성", result: "모터 제어 시연" },
  ],
  plans: [
    { id: "plan-plc", title: "PLC 실습", covers: "PLC 프로그래밍·시퀀스 제어·센서 연동", period: "2027-1학기" },
    { id: "plan-smart", title: "스마트팩토리 데이터 분석", covers: "설비 데이터 수집·가동률 분석·이상치 확인", period: "2027-1학기" },
  ],
};

function runJdqDemo() {
  const kind = jdqDemoKind();
  if (!kind) return;
  const isHyundai = kind === "hyundai";
  const jdText = isHyundai ? JDQ_DEMO_HYUNDAI_JD_TEXT : JDQ_DEMO_JD_TEXT;
  const company = isHyundai ? "현대자동차" : "SK hynix";
  const role = isHyundai ? "생산기술" : "양산기술";
  try {
    document.querySelector("#jd-company").value = company;
    document.querySelector("#jd-role").value = role;
    document.querySelector("#jd-source-type").value = "unknown";
    document.querySelector("#jd-text").value = jdText;
    showChapter("jd");
    renderJdSourcePreview();
    const result = window.JDAnalyzer.analyze({ jdText, roleName: role });
    result.warnings.unshift(isHyundai
      ? "예시 채용공고: 현대자동차 생산기술 예시 문장입니다. 실제 공고 원문이 아닙니다. 저장된 내 프로필은 바꾸지 않았습니다."
      : "실제 공고 원문: ['26년 하반기] Talent hy-way 기술사무직 신입 (SK Careers R261762, 접수 2026-08-20~08-26, 마감됨) 양산기술 채용공고 전문입니다. 저장된 내 프로필은 바꾸지 않았습니다.");
    renderJdAnalysisV4(result);
  } catch (error) {
    console.error(error);
  }
}
runJdqDemo();

// 인적성 결과 수신 (4회차, 최소 연결; 6회차에 발신 측 연결 완료):
// assessment iframe이 postMessage로 검사 결과를 보내면
// AssessmentResultBridge가 검증·저장하고, 인적성 탭에 받은 날짜·영역
// 수를 표시하고, 프로필 화면(6. 인적성 결과)에도 참고용 메모를 보여준다.
// 결과가 없어도, 잘못된 메시지가 와도 아무 일도 하지 않는다.
function renderProfileAssessmentResult() {
  const box = document.querySelector("#profile-assessment-result");
  if (!box || !window.AssessmentResultBridge) return;
  const result = window.AssessmentResultBridge.loadResult(window.localStorage);
  const aptResult = window.AssessmentResultBridge.loadAptitudeResult(window.localStorage);
  let html = "";
  if (!result) {
    html += `<p class="profile-assessment-empty">아직 받은 인적성 결과가 없습니다. 인적성 탭에서 검사를 완료하면 여기에 표시됩니다.</p>`;
  } else {
    const memo = window.AssessmentResultBridge.formatForProfile(result);
    html += `<p class="profile-assessment-memo">${escapeHtml(memo)}</p>`
      + `<ul class="profile-assessment-areas">${result.areas.map((a) => `<li><span>${escapeHtml(a.name)}</span><b>${a.score}점 (${escapeHtml(a.level)})</b></li>`).join("")}</ul>`
      + `<p class="profile-assessment-date">검사 일시: ${escapeHtml(result.takenAt.slice(0, 10))}</p>`
      + `<button class="jd-secondary" type="button" id="profile-assessment-clear">인적성 결과 지우기</button>`;
  }
  // 적성 결과 (7회차): 회사·과목별 정답률을 그대로 보여준다. 인성 결과와
  // 별개로 저장되며, 둘 중 하나만 있어도 각각 표시된다.
  if (aptResult) {
    const aptMemo = window.AssessmentResultBridge.formatAptitudeForProfile(aptResult);
    const s = aptResult.summary;
    html += `<p class="profile-assessment-memo">${escapeHtml(aptMemo)}</p>`
      + `<ul class="profile-assessment-areas">${aptResult.subjects.filter((subject) => subject.graded > 0).map((subject) => `<li><span>${escapeHtml(subject.area || subject.company + " " + subject.category)}</span><b>${subject.accuracy}% (${subject.correct}/${subject.graded}문항)</b></li>`).join("")}</ul>`
      + `<p class="profile-assessment-date">검사 일시: ${escapeHtml(aptResult.takenAt.slice(0, 10))} · ${s.graded > 0 ? `전체 정답률 ${s.accuracy}%` : "채점된 문항 없음"}</p>`
      + `<button class="jd-secondary" type="button" id="profile-aptitude-clear">적성 결과 지우기</button>`;
  }
  box.innerHTML = html;
}
function bindAssessmentResultBridge() {
  if (!window.AssessmentResultBridge) return;
  window.addEventListener("message", (event) => {
    const saved = window.AssessmentResultBridge.receiveMessage(event, window.localStorage, window.location.origin);
    if (!saved) return;
    const status = document.querySelector("#assessment-result-status");
    if (status) {
      status.hidden = false;
      if (saved.kind === "aptitude") {
        const s = saved.summary;
        status.textContent = `적성 결과 받음 (${saved.takenAt.slice(0, 10)}, ${s.graded > 0 ? `정답률 ${s.accuracy}%` : "채점된 문항 없음"}) — 참고용으로 저장했습니다. 면접 답변의 근거·실적이 아닙니다.`;
      } else {
        status.textContent = `인적성 결과 받음 (${saved.takenAt.slice(0, 10)}, 영역 ${saved.areas.length}개) — 참고용으로 저장했습니다. 면접 답변의 근거·실적이 아닙니다.`;
      }
    }
    renderProfileAssessmentResult();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("#profile-assessment-clear")) {
      window.AssessmentResultBridge.clearResult(window.localStorage);
      renderProfileAssessmentResult();
      return;
    }
    if (event.target.closest("#profile-aptitude-clear")) {
      window.AssessmentResultBridge.clearAptitudeResult(window.localStorage);
      renderProfileAssessmentResult();
    }
  });
  renderProfileAssessmentResult();
}
bindAssessmentResultBridge();
