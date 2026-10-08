(function attachJdAiClient(root) {
  "use strict";

  const ENDPOINT_KEY = "aiproject.jdAiEndpoint";

  function normalizeEndpoint(value) {
    const endpoint = String(value || "").trim();
    if (!endpoint) return "";
    const url = new URL(endpoint);
    if (url.protocol !== "https:") throw new Error("AI 분석 연결 주소는 https 주소여야 합니다.");
    if (!/script\.google\.com$/.test(url.hostname)) throw new Error("현재는 Google Apps Script 웹 앱 주소만 지원합니다.");
    return url.toString();
  }

  function loadEndpoint(storage) {
    return String(storage?.getItem(ENDPOINT_KEY) || "").trim();
  }

  function saveEndpoint(value, storage) {
    const endpoint = normalizeEndpoint(value);
    if (endpoint) storage?.setItem(ENDPOINT_KEY, endpoint);
    else storage?.removeItem(ENDPOINT_KEY);
    return endpoint;
  }

  function assertResult(result) {
    if (!result || typeof result !== "object") throw new Error("AI 분석 결과 형식이 올바르지 않습니다.");
    if (!result.facts || !result.careerAnalysis || !Array.isArray(result.units)) throw new Error("AI 분석 결과의 필수 항목이 누락되었습니다.");
    const evidenceIds = new Set(result.units.map((row) => row.id));
    const checkIds = (row) => (row?.evidenceIds || []).every((id) => evidenceIds.has(id));
    const factArrays = ["productContext", "duties", "competencies", "required", "preferred", "knowledge", "tools", "collaborators", "metrics", "keywords"];
    factArrays.forEach((key) => {
      if (!Array.isArray(result.facts[key])) throw new Error(`AI 분석 결과의 ${key} 형식이 올바르지 않습니다.`);
      if (!result.facts[key].every(checkIds)) throw new Error(`AI 분석 결과의 ${key}에 존재하지 않는 근거 번호가 있습니다.`);
    });
    return result;
  }

  async function analyze(input, options = {}) {
    const endpoint = normalizeEndpoint(options.endpoint);
    if (!endpoint) throw new Error("AI 분석 연결 주소가 설정되지 않았습니다.");
    const fetcher = options.fetcher || root.fetch.bind(root);
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(input),
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`AI 분석 서버 연결 실패 (${response.status})`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "AI 분석 서버가 결과를 만들지 못했습니다.");
    return assertResult(payload.result);
  }

  function assertMatchResult(result) {
    if (!result || !Array.isArray(result.matches) || !result.counts) throw new Error("경험 연결 결과 형식이 올바르지 않습니다.");
    result.matches.forEach((row) => {
      if (!row.requirement || !["direct", "indirect", "none"].includes(row.status)) throw new Error("경험 연결 상태가 올바르지 않습니다.");
      if (row.status !== "none" && (!row.experience || !row.profileEvidenceQuote)) throw new Error("경험 연결 근거가 누락되었습니다.");
    });
    return result;
  }

  async function matchProfile(input, options = {}) {
    const endpoint = normalizeEndpoint(options.endpoint);
    if (!endpoint) throw new Error("AI 분석 연결 주소가 설정되지 않았습니다.");
    const fetcher = options.fetcher || root.fetch.bind(root);
    const response = await fetcher(endpoint, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...input, action: "matchProfile" }), redirect: "follow",
    });
    if (!response.ok) throw new Error(`AI 분석 서버 연결 실패 (${response.status})`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "AI가 경험 연결 결과를 만들지 못했습니다.");
    return assertMatchResult(payload.result);
  }

  root.JDAiClient = { ENDPOINT_KEY, normalizeEndpoint, loadEndpoint, saveEndpoint, assertResult, assertMatchResult, analyze, matchProfile };
  if (typeof module !== "undefined" && module.exports) module.exports = root.JDAiClient;
})(typeof window !== "undefined" ? window : globalThis);

