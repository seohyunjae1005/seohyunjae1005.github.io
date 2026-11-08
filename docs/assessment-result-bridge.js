(function (root) {
  "use strict";

  // 인적성 결과 → 프로필 연동 브릿지 (호스트 측).
  // 결정 (2026-11-04 4회차, docs/assessment-linking-design.md 참조):
  // - assessment.html(7.6MB 단일 파일)은 localStorage 참조가 0건이라
  //   저장 키 공유 방식으로는 연동이 안 된다. 그래서 iframe postMessage
  //   방식을 쓴다. 인적성 앱이 검사 완료 시 결과를 postMessage로 보내면,
  //   이 브릿지가 검증·정규화해서 별도 키에 저장하고, 프로필에서
  //   참고용 메모로 읽는다.
  // - 검사 결과는 "참고용"이다. 면접 답변의 근거·실적으로 쓰지 않는다.
  // - 발신 측: 인성은 6회차에 assessment.html의 sendAssessmentResult로
  //   붙였다. 적성은 7회차에 별도 타입(aiproject.aptitudeResult)으로 붙였다.
  //   이 파일은 수신·검증·저장·포맷만 한다. 발신 스니펫은 설계 문서에 있다.

  const RESULT_KEY = "aiproject.assessmentResult.v1";
  const RESULT_VERSION = 1;
  const MESSAGE_TYPE = "aiproject.assessmentResult";

  // 적성 결과 (7회차, docs/assessment-linking-design.md 참조):
  // 적성 영역은 회사·과목별이라 인성 5영역 스키마에 끼워 맞추지 않는다.
  // 별도 메시지 타입·별도 저장 키로, 회사·과목별 정답률을 그대로 보낸다.
  const APTITUDE_RESULT_KEY = "aiproject.aptitudeResult.v1";
  const APTITUDE_MESSAGE_TYPE = "aiproject.aptitudeResult";
  const APTITUDE_MODES = ["study", "mock"];

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  // 결과 스키마: { version: 1, source: "assessment", takenAt: ISO 문자열,
  //   areas: [{ id, name, score(0~100), level("상"|"중"|"하") }] }
  // areas는 1개 이상, score는 숫자 0~100이어야 한다.
  function validateResult(value) {
    if (!isPlainObject(value)) return { ok: false, reason: "결과가 객체가 아닙니다." };
    if (value.version !== RESULT_VERSION) return { ok: false, reason: "결과 버전이 맞지 않습니다." };
    if (typeof value.takenAt !== "string" || !value.takenAt) return { ok: false, reason: "검사 일시(takenAt)가 없습니다." };
    if (!Array.isArray(value.areas) || !value.areas.length) return { ok: false, reason: "검사 영역(areas)이 없습니다." };
    for (const area of value.areas) {
      if (!isPlainObject(area) || typeof area.id !== "string" || !area.id) return { ok: false, reason: "영역 id가 없습니다." };
      if (typeof area.name !== "string" || !area.name) return { ok: false, reason: "영역 이름이 없습니다." };
      if (typeof area.score !== "number" || Number.isNaN(area.score) || area.score < 0 || area.score > 100) {
        return { ok: false, reason: `영역 ${area.id}의 점수가 0~100 숫자가 아닙니다.` };
      }
      if (area.level !== undefined && !["상", "중", "하"].includes(area.level)) {
        return { ok: false, reason: `영역 ${area.id}의 수준(level)이 상·중·하가 아닙니다.` };
      }
    }
    return { ok: true };
  }

  function normalizeResult(value) {
    const check = validateResult(value);
    if (!check.ok) throw new Error(check.reason);
    return {
      version: RESULT_VERSION,
      source: "assessment",
      takenAt: String(value.takenAt).slice(0, 30),
      areas: value.areas.map((area) => ({
        id: String(area.id).slice(0, 40),
        name: String(area.name).slice(0, 40),
        score: Math.round(area.score),
        level: area.level || (area.score >= 70 ? "상" : area.score >= 40 ? "중" : "하"),
      })),
    };
  }

  function saveResult(value, storage) {
    const normalized = normalizeResult(value);
    storage?.setItem(RESULT_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function loadResult(storage) {
    try {
      const raw = storage?.getItem(RESULT_KEY);
      if (!raw) return null;
      return normalizeResult(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function clearResult(storage) {
    storage?.removeItem(RESULT_KEY);
    return null;
  }

  // 프로필에 붙는 참고용 메모 1줄. 점수를 실적으로 포장하지 않는다.
  // 적성 결과 스키마: { version: 1, source: "assessment", kind: "aptitude",
  //   takenAt: ISO 문자열, mode: "study"|"mock"|null,
  //   summary: { total, graded, correct, wrong, skipped, excluded,
  //              accuracy(0~100, 채점된 문항이 없으면 null) },
  //   subjects: [{ id("회사|과목"), company, category, area,
  //              total, graded, correct, accuracy(없으면 null) }] }
  // - total = graded + skipped + excluded, graded = correct + wrong.
  // - accuracy는 graded가 0이면 null이다 (0%로 포장하지 않는다).
  // - subjects는 채점·미응답·제외를 합쳐 1문항 이상 푼 과목만 들어간다.
  function isNonNegInt(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }

  function validateAccuracy(value) {
    return value === null || (typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 100);
  }

  function validateAptitudeResult(value) {
    if (!isPlainObject(value)) return { ok: false, reason: "결과가 객체가 아닙니다." };
    if (value.version !== RESULT_VERSION) return { ok: false, reason: "결과 버전이 맞지 않습니다." };
    if (value.kind !== "aptitude") return { ok: false, reason: "적성 결과(kind: aptitude)가 아닙니다." };
    if (typeof value.takenAt !== "string" || !value.takenAt) return { ok: false, reason: "검사 일시(takenAt)가 없습니다." };
    if (value.mode !== null && value.mode !== undefined && !APTITUDE_MODES.includes(value.mode)) {
      return { ok: false, reason: "적성 모드(mode)가 study·mock이 아닙니다." };
    }
    const s = value.summary;
    if (!isPlainObject(s)) return { ok: false, reason: "적성 요약(summary)이 없습니다." };
    for (const key of ["total", "graded", "correct", "wrong", "skipped", "excluded"]) {
      if (!isNonNegInt(s[key])) return { ok: false, reason: `적성 요약 ${key}가 0 이상의 정수가 아닙니다.` };
    }
    if (!validateAccuracy(s.accuracy)) return { ok: false, reason: "적성 요약 정답률이 0~100 숫자가 아닙니다." };
    if (s.graded !== s.correct + s.wrong) return { ok: false, reason: "채점 문항 수와 정답·오답 합이 맞지 않습니다." };
    if (s.total !== s.graded + s.skipped + s.excluded) return { ok: false, reason: "전체 문항 수와 채점·미응답·제외 합이 맞지 않습니다." };
    if (s.graded > 0 && s.accuracy === null) return { ok: false, reason: "채점된 문항이 있는데 정답률이 없습니다." };
    if (s.graded === 0 && s.accuracy !== null) return { ok: false, reason: "채점된 문항이 없는데 정답률이 있습니다." };
    if (!Array.isArray(value.subjects)) return { ok: false, reason: "적성 과목별(subjects)이 없습니다." };
    for (const subject of value.subjects) {
      if (!isPlainObject(subject) || typeof subject.id !== "string" || !subject.id) return { ok: false, reason: "과목 id가 없습니다." };
      if (typeof subject.company !== "string" || !subject.company) return { ok: false, reason: "과목 회사(company)가 없습니다." };
      if (typeof subject.category !== "string" || !subject.category) return { ok: false, reason: "과목(category)이 없습니다." };
      if (typeof subject.area !== "string") return { ok: false, reason: "과목 영역(area)이 문자열이 아닙니다." };
      for (const key of ["total", "graded", "correct"]) {
        if (!isNonNegInt(subject[key])) return { ok: false, reason: `과목 ${subject.id}의 ${key}가 0 이상의 정수가 아닙니다.` };
      }
      if (!validateAccuracy(subject.accuracy)) return { ok: false, reason: `과목 ${subject.id}의 정답률이 0~100 숫자가 아닙니다.` };
      if (subject.correct > subject.graded || subject.graded > subject.total) return { ok: false, reason: `과목 ${subject.id}의 문항 수가 맞지 않습니다.` };
      if (subject.graded > 0 && subject.accuracy === null) return { ok: false, reason: `과목 ${subject.id}에 정답률이 없습니다.` };
      if (subject.graded === 0 && subject.accuracy !== null) return { ok: false, reason: `과목 ${subject.id}에 정답률이 있으면 안 됩니다.` };
    }
    return { ok: true };
  }

  function normalizeAptitudeResult(value) {
    const check = validateAptitudeResult(value);
    if (!check.ok) throw new Error(check.reason);
    return {
      version: RESULT_VERSION,
      source: "assessment",
      kind: "aptitude",
      takenAt: String(value.takenAt).slice(0, 30),
      mode: value.mode || null,
      summary: {
        total: value.summary.total,
        graded: value.summary.graded,
        correct: value.summary.correct,
        wrong: value.summary.wrong,
        skipped: value.summary.skipped,
        excluded: value.summary.excluded,
        accuracy: value.summary.accuracy === null ? null : Math.round(value.summary.accuracy),
      },
      subjects: value.subjects.map((subject) => ({
        id: String(subject.id).slice(0, 80),
        company: String(subject.company).slice(0, 40),
        category: String(subject.category).slice(0, 40),
        area: String(subject.area).slice(0, 40),
        total: subject.total,
        graded: subject.graded,
        correct: subject.correct,
        accuracy: subject.accuracy === null ? null : Math.round(subject.accuracy),
      })),
    };
  }

  function saveAptitudeResult(value, storage) {
    const normalized = normalizeAptitudeResult(value);
    storage?.setItem(APTITUDE_RESULT_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function loadAptitudeResult(storage) {
    try {
      const raw = storage?.getItem(APTITUDE_RESULT_KEY);
      if (!raw) return null;
      return normalizeAptitudeResult(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function clearAptitudeResult(storage) {
    storage?.removeItem(APTITUDE_RESULT_KEY);
    return null;
  }

  // 적성 프로필 메모 1줄. 정답률을 실적으로 포장하지 않는다.
  function formatAptitudeForProfile(result) {
    const normalized = normalizeAptitudeResult(result);
    const date = normalized.takenAt.slice(0, 10);
    const s = normalized.summary;
    const modeLabel = normalized.mode === "mock" ? "실전 모의고사" : normalized.mode === "study" ? "학습 모드" : "적성검사";
    const head = s.graded > 0
      ? `${modeLabel} 정답률 ${s.accuracy}% (${s.graded}문항 중 ${s.correct}문항)`
      : `${modeLabel} — 채점된 문항 없음 (전체 ${s.total}문항)`;
    const parts = normalized.subjects
      .filter((subject) => subject.graded > 0)
      .map((subject) => `${subject.area || subject.company + " " + subject.category} ${subject.accuracy}%`)
      .join(" · ");
    return `적성 결과(${date}) 참고용: ${head}${parts ? " · " + parts : ""} — 검사 결과는 참고용이며, 면접 답변의 근거·실적이 아닙니다.`;
  }

  function formatForProfile(result) {
    const normalized = normalizeResult(result);
    const date = normalized.takenAt.slice(0, 10);
    const parts = normalized.areas.map((a) => `${a.name} ${a.score}점(${a.level})`).join(" · ");
    return `인적성 결과(${date}) 참고용: ${parts} — 검사 결과는 참고용이며, 면접 답변의 근거·실적이 아닙니다.`;
  }

  // iframe postMessage 수신. 같은 출처에서 온 메시지 타입별로 받는다.
  // event: { origin, data } 형태. origin이 다르면 무시하고 null을 반환한다.
  // type이 aiproject.assessmentResult면 인성, aiproject.aptitudeResult면
  // 적성을 저장하고, 그 외 타입은 무시한다.
  function receiveMessage(event, storage, origin) {
    const expected = typeof origin === "string" && origin ? origin : (typeof location !== "undefined" ? location.origin : "");
    if (expected && event?.origin && event.origin !== expected) return null;
    const data = event?.data;
    if (!isPlainObject(data)) return null;
    try {
      if (data.type === MESSAGE_TYPE) return saveResult(data.result, storage);
      if (data.type === APTITUDE_MESSAGE_TYPE) return saveAptitudeResult(data.result, storage);
    } catch (_) {
      return null;
    }
    return null;
  }

  const api = { RESULT_KEY, RESULT_VERSION, MESSAGE_TYPE, validateResult, normalizeResult, saveResult, loadResult, clearResult, formatForProfile, receiveMessage,
    APTITUDE_RESULT_KEY, APTITUDE_MESSAGE_TYPE, validateAptitudeResult, normalizeAptitudeResult, saveAptitudeResult, loadAptitudeResult, clearAptitudeResult, formatAptitudeForProfile };
  root.AssessmentResultBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
