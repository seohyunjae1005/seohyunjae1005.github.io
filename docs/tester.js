const form = document.querySelector("#tester-form");
const result = document.querySelector("#tester-result");
const output = document.querySelector("#feedback-output");
const copyButton = document.querySelector("#copy-feedback");
const copyStatus = document.querySelector("#copy-status");
const trackSelect = document.querySelector("#tester-track");

const TRACKS = {
  trend: {
    label: "산업 동향·뉴스",
    tasks: [
      ["최근 갱신일과 전체 기사 수를 찾았다.", "첫 화면 위쪽을 확인하세요."],
      ["삼성전자 기사만 골라 보았다.", "최신 뉴스의 회사 버튼을 사용하세요."],
      ["공정·양산 관련 기사만 골라 보았다.", "공정·양산 집중 보기를 사용하세요."],
      ["기사 한 건의 공정 관련 판단 근거를 찾았다.", "기사 카드의 직접·간접 관련 표시를 확인하세요."],
      ["AI 직무 인사이트와 공식 원문을 구분했다.", "자동 분석과 공식 원문 링크를 각각 확인하세요."],
    ],
  },
  career: {
    label: "JD·취업 준비",
    tasks: [
      ["내 프로필에서 경험 정리 도우미를 찾았다.", "내 프로필 탭의 경험 입력 영역을 확인하세요."],
      ["관찰·직접 수행·진행 중·예정의 차이를 이해했다.", "경험 정리 결과가 과장 방지에 도움이 되는지 확인하세요."],
      ["JD 분석에서 회사명·직무명·공고 원문 입력 위치를 찾았다.", "JD 분석 탭 위쪽을 확인하세요."],
      ["JD Fact와 자동 해석이 서로 다른 영역임을 확인했다.", "분석 결과의 라벨과 원문 근거 영역을 확인하세요."],
      ["지원 작업 저장·백업 위치를 찾았다.", "JD 입력 위의 지원 작업 영역을 확인하세요."],
    ],
  },
};

function renderTrack(value) {
  const track = TRACKS[value] || TRACKS.trend;
  track.tasks.forEach(([title, help], index) => {
    document.querySelector(`#tester-task${index + 1}-title`).textContent = `${index + 1}. ${title}`;
    document.querySelector(`#tester-task${index + 1}-help`).textContent = help;
  });
}

function buildSummary(data) {
  const tasks = [1, 2, 3, 4, 5].map((number) => `${number}:${data.get(`task${number}`)}`);
  const successes = tasks.filter((task) => task.endsWith(":성공")).length;
  return [
    `[반도체 산업 동향 사용성 테스트]`,
    `구분: ${data.get("testerCode")}`,
    `확인 기능: ${TRACKS[data.get("testerTrack")]?.label || data.get("testerTrack")}`,
    `기능 수행: ${successes}/5개 성공 (${tasks.join(", ")})`,
    `찾기 쉬움: ${data.get("ease")}/5`,
    `취업 준비 도움: ${data.get("usefulness")}/5`,
    `근거 신뢰도: ${data.get("trust")}/5`,
    `개선 의견: ${String(data.get("note")).trim()}`,
  ].join("\n");
}

trackSelect.addEventListener("change", () => renderTrack(trackSelect.value));
renderTrack("trend");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  output.textContent = buildSummary(new FormData(form));
  result.hidden = false;
  copyStatus.textContent = "";
  result.scrollIntoView({ behavior: "smooth", block: "start" });
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.textContent);
    copyStatus.textContent = "복사되었습니다. 담당자에게 붙여넣어 보내 주세요.";
  } catch (error) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(output);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = "자동 복사가 차단되었습니다. 선택된 문장을 직접 복사해 주세요.";
    console.error(error);
  }
});
