(function (root) {
  "use strict";

  const STORAGE_KEY = "career-profile-v2";
  const LEGACY_STORAGE_KEY = "semiconductor-career-profile-v1";
  const EMPTY_PROFILE = Object.freeze({
    targetRoles: "", skills: "", certificates: "", languages: "",
    educations: [], experiences: [],
    aiExperience: { title: "", context: "", period: "", role: "", aiUse: "", verification: "", result: "" },
    updatedAt: "",
  });
  const EDUCATION_FIELDS = ["id", "level", "school", "status", "startDate", "endDate", "major", "secondaryMajor", "transfer", "region", "gpa", "gpaScale", "credits", "coursework", "advisor", "lab", "research", "theses", "conferences"];
  const EXPERIENCE_FIELDS = ["id", "type", "title", "organization", "startDate", "endDate", "role", "situation", "action", "result", "tools"];
  const AI_FIELDS = ["title", "context", "period", "role", "aiUse", "verification", "result"];

  function clean(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
  }

  function lines(value) {
    return clean(value).split("\n").map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function cleanRecord(record, fields) {
    return Object.fromEntries(fields.map((field) => [field, clean(record?.[field])]));
  }

  function hasRecordValue(record, ignored = ["id"]) {
    return Object.entries(record || {}).some(([key, value]) => !ignored.includes(key) && clean(value));
  }

  function normalize(profile) {
    return {
      targetRoles: clean(profile?.targetRoles),
      skills: clean(profile?.skills),
      certificates: clean(profile?.certificates),
      languages: clean(profile?.languages),
      educations: Array.isArray(profile?.educations) ? profile.educations.map((row) => cleanRecord(row, EDUCATION_FIELDS)).filter((row) => hasRecordValue(row)) : [],
      experiences: Array.isArray(profile?.experiences) ? profile.experiences.map((row) => cleanRecord(row, EXPERIENCE_FIELDS)).filter((row) => hasRecordValue(row)) : [],
      aiExperience: cleanRecord(profile?.aiExperience, AI_FIELDS),
      updatedAt: clean(profile?.updatedAt),
    };
  }

  function parseLegacyEducation(value, major) {
    const raw = clean(value);
    const statuses = ["졸업예정", "재학", "휴학", "졸업", "수료", "중퇴"];
    const status = statuses.find((item) => raw.includes(item)) || "";
    const school = status ? raw.replace(status, "").trim() : raw;
    let level = "";
    if (/검정고시/.test(raw)) level = "검정고시";
    else if (/고등학교/.test(raw)) level = "고등학교";
    else if (/전문대/.test(raw)) level = "전문대학";
    else if (/대학원/.test(raw)) level = "대학원(석사)";
    else if (/대학교|대학/.test(raw)) level = "대학(학사)";
    return { id: "legacy-education", level, school, status, major: clean(major) };
  }

  function splitLegacyQualifications(value) {
    const languagePattern = /(toeic|opic|toefl|teps|토익|오픽|토플|텝스|영어s*말하기|토익스피킹)/i;
    const all = lines(value);
    return {
      certificates: all.filter((item) => !languagePattern.test(item)).join("\n"),
      languages: all.filter((item) => languagePattern.test(item)).join("\n"),
    };
  }

  function migrateLegacy(legacy) {
    if (!legacy || typeof legacy !== "object") return normalize(EMPTY_PROFILE);
    const education = clean(legacy.education);
    const major = clean(legacy.major);
    const qualifications = splitLegacyQualifications(legacy.certificates);
    return normalize({
      targetRoles: legacy.targetRoles,
      skills: legacy.skills,
      certificates: qualifications.certificates,
      languages: qualifications.languages,
      educations: education || major ? [parseLegacyEducation(education, major)] : [],
      experiences: lines(legacy.experiences).map((text, index) => ({ id: `legacy-experience-${index + 1}`, type: "기존 입력", title: text })),
    });
  }

  function load(storage) {
    try {
      const current = storage?.getItem(STORAGE_KEY);
      if (current) return normalize(JSON.parse(current));
      const legacy = storage?.getItem(LEGACY_STORAGE_KEY);
      return legacy ? migrateLegacy(JSON.parse(legacy)) : normalize(EMPTY_PROFILE);
    } catch (_error) {
      return normalize(EMPTY_PROFILE);
    }
  }

  function save(profile, storage) {
    const normalized = normalize({ ...profile, updatedAt: new Date().toISOString() });
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function clear(storage) {
    storage?.removeItem(STORAGE_KEY);
    storage?.removeItem(LEGACY_STORAGE_KEY);
    return normalize(EMPTY_PROFILE);
  }

  function compact(values) {
    return values.map(clean).filter(Boolean).join(" · ");
  }

  function educationText(row) {
    return compact([
      row.level, row.school, row.status, row.major, row.secondaryMajor,
      row.startDate || row.endDate ? `${row.startDate || "?"}~${row.endDate || "?"}` : "",
      row.gpa ? `학점 ${row.gpa}/${row.gpaScale || "?"}` : "",
      row.credits ? `이수학점 ${row.credits}` : "",
      row.coursework ? `관련 과목 ${lines(row.coursework).join(", ")}` : "",
      row.research ? `연구 ${row.research}` : "",
    ]);
  }

  function experienceText(row) {
    return compact([
      row.type, row.title, row.organization,
      row.startDate || row.endDate ? `${row.startDate || "?"}~${row.endDate || "?"}` : "",
      row.role ? `역할 ${row.role}` : "",
      row.situation ? `문제·목표 ${row.situation}` : "",
      row.action ? `행동 ${row.action}` : "",
      row.result ? `결과 ${row.result}` : "",
      row.tools ? `기술·도구 ${row.tools}` : "",
    ]);
  }

  function aiExperienceText(row) {
    if (!hasRecordValue(row)) return "";
    return compact([
      "AI 문제해결 경험", row.title,
      row.context ? `경험 ${row.context}` : "", row.period ? `기간 ${row.period}` : "",
      row.role ? `역할 ${row.role}` : "", row.aiUse ? `AI 활용 ${row.aiUse}` : "",
      row.verification ? `검증 ${row.verification}` : "", row.result ? `결과 ${row.result}` : "",
    ]);
  }

  function toExperienceText(profile) {
    const normalized = normalize(profile);
    return [
      ...normalized.experiences.map(experienceText),
      aiExperienceText(normalized.aiExperience),
      ...normalized.educations.map(educationText).filter(Boolean).map((value) => `학력·전공: ${value}`),
      ...lines(normalized.skills).map((value) => `보유 기술 및 교육: ${value}`),
      ...lines(normalized.certificates).map((value) => `자격: ${value}`),
      ...lines(normalized.languages).map((value) => `어학: ${value}`),
    ].filter(Boolean).join("\n");
  }

  function toEvidenceEntries(profile) {
    const normalized = normalize(profile);
    const rows = [];
    normalized.experiences.forEach((row, index) => {
      const text = experienceText(row);
      if (text) rows.push({ id: row.id || `experience-${index + 1}`, kind: "경험", label: row.title || row.type || `경험 ${index + 1}`, text });
    });
    const aiText = aiExperienceText(normalized.aiExperience);
    if (aiText) rows.push({ id: "ai-experience", kind: "AI 활용 경험", label: normalized.aiExperience.title || "AI 문제해결 경험", text: aiText });
    normalized.educations.forEach((row, index) => {
      const text = educationText(row);
      if (text) rows.push({ id: row.id || `education-${index + 1}`, kind: "학력·전공", label: row.major || row.school || `학력 ${index + 1}`, text });
    });
    lines(normalized.skills).forEach((text, index) => rows.push({ id: `skill-${index + 1}`, kind: "기술·교육", label: text, text: `보유 기술 및 교육: ${text}` }));
    lines(normalized.certificates).forEach((text, index) => rows.push({ id: `certificate-${index + 1}`, kind: "자격", label: text, text: `자격: ${text}` }));
    lines(normalized.languages).forEach((text, index) => rows.push({ id: `language-${index + 1}`, kind: "어학", label: text, text: `어학: ${text}` }));
    return rows;
  }

  function summary(profile) {
    const normalized = normalize(profile);
    const aiCount = hasRecordValue(normalized.aiExperience) ? 1 : 0;
    const experienceCount = normalized.experiences.length + aiCount;
    const filled = [normalized.targetRoles, normalized.skills, normalized.certificates, normalized.languages, normalized.educations.length, experienceCount].filter(Boolean).length;
    return { filled, educationCount: normalized.educations.length, experienceCount, ready: experienceCount > 0 };
  }

  root.CareerProfile = { STORAGE_KEY, LEGACY_STORAGE_KEY, EMPTY_PROFILE, normalize, migrateLegacy, load, save, clear, lines, toExperienceText, toEvidenceEntries, summary };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CareerProfile;
})(typeof window !== "undefined" ? window : globalThis);
