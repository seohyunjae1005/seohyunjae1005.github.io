# 인적성–프로필 연동 설계 — 2026-11-04 4회차 결정

## 현황

- `docs/assessment.html`(7.6MB 단일 파일)은 `localStorage` 참조가 0건이다. 검사 결과를
  브라우저 저장소에 저장하지 않고, 현재 탭 기준(인메모리)으로만 다룬다.
- 프로필 저장 키는 `career-profile-v2`다. 저장 키를 공유하는 방식으로는 연동이 안 된다.

## 결정: iframe postMessage 방식

두 가지 중 postMessage를 골랐다.

| 방식 | 내용 | 판단 |
|---|---|---|
| (1) 파일 내보내기·가져오기 | 인적성 앱에서 결과 JSON을 다운로드·복사하고, 프로필에서 파일로 가져오기 | 매번 사용자 손이 필요하고, 결과와 프로필이 금방 어긋난다 |
| (2) iframe postMessage | 인적성 앱이 검사 완료 시 결과를 postMessage로 보내면, 메인 페이지가 검증·저장 | 메인 페이지가 이미 assessment를 iframe으로 열고 있다. 한 번 붙이면 자동으로 전달된다 |

## 계약 (contract)

- 메시지 타입: `aiproject.assessmentResult`
- 출처: 같은 origin만 받는다 (`event.origin === location.origin`). 다른 출처는 무시한다.
- 페이로드: `{ type, result }`, result 스키마는
  `{ version: 1, source: "assessment", takenAt: ISO 문자열, areas: [{ id, name, score(0~100), level("상"|"중"|"하") }] }`
- 저장 키: `aiproject.assessmentResult.v1` (프로필 키와 별도 — 검사 결과를 프로필 원문에 섞지 않는다)
- 결과는 "참고용"이다. 면접 답변의 근거·실적으로 쓰지 않는다. 프로필 메모 포맷에도 그렇게 명시한다.

## 4회차에 한 것 (호스트 측 최소 구현)

- `docs/assessment-result-bridge.js` 신규: `validateResult` / `normalizeResult` /
  `saveResult` / `loadResult` / `clearResult` / `formatForProfile` / `receiveMessage`.
  잘못된 결과(버전·점수 범위·level 위반)는 저장하지 않고, 손상된 저장값은 null로 읽는다.
- `docs/index.html`: 브릿지 script 추가, 인적성 탭 툴바에 `#assessment-result-status` 추가.
- `docs/app.js`: `bindAssessmentResultBridge()` — 메시지 수신 시 검증·저장하고,
  받은 날짜·영역 수만 상태 줄에 표시한다.
- `tests/test_assessment_result_bridge.js` 신규: 검증·저장·불러오기·포맷·출처 거부를 확인한다.

## 6회차에 한 것 — 발신 측 + 프로필 표시 (2026-11-04 10:15~10:35)

- **선행 작업 완료: 실제 채점 함수.** `assessment.html`에 `scorePersonality()`
  추가 (6점 척도, 역채점 7−응답, 영역 평균 → 0~100 환산, T·백분위는 척도
  기준 환산값이며 규준 집단이 없음을 화면에 명시). `renderResults()`는
  응답이 있으면 실제 점수를, 없으면 기존 예시 미리보기를 보여준다.
  테스트 `tests/test_personality_scoring.js` 16개 그룹 통과.
  E2E(30문항 클릭): 답 [6,2,5,3,4] → 성실성 63·협업 50·정서적 안정성
  57·상호작용 50·개방성 40, 전부 1점 → 0·0·0·33·33으로 답에 따라 바뀐다.
  예시 버튼(0개 응답)은 예시 값(86 등) 그대로, 발신 없음.
- **발신 측 붙였다.** `renderResults()`에서 실제 결과가 있을 때만
  postMessage를 보낸다 (같은 결과 중복 발신 방지, iframe이 아닐 때는
  보내지 않는다). 호스트 브릿지가 받아 저장하는 것까지 E2E로 확인했다.
- **프로필 화면 표시 붙였다.** `index.html` 프로필 6번 섹션
  "인적성 결과" + `app.js` `renderProfileAssessmentResult()`:
  저장된 결과를 참고용 메모 + 영역별 점수로 보여주고, 지우기 버튼이 있다.
  프로필 탭을 열 때와 메시지를 받을 때 갱신된다. E2E로 확인했다.

## 7회차에 한 것 — 적성 발신 (2026-11-04 10:30~)

- **설계: 5영역 스키마에 끼워 맞추지 않는다.** 적성 결과는 회사·과목별이라
  인성 areas 스키마와 맞지 않는다. 별도 메시지 타입
  `aiproject.aptitudeResult` + 별도 저장 키
  `aiproject.aptitudeResult.v1`로, 회사·과목별 정답률을 그대로 보낸다.
- **계약 (적성):** 페이로드 `{ type, result }`, result 스키마는
  `{ version: 1, source: "assessment", kind: "aptitude", takenAt: ISO,
  mode: "study"|"mock"|null,
  summary: { total, graded, correct, wrong, skipped, excluded,
  accuracy(0~100, 채점된 문항이 없으면 null) },
  subjects: [{ id("회사|과목"), company, category, area,
  total, graded, correct, accuracy(없으면 null) }] }`
  - total = graded + skipped + excluded, graded = correct + wrong.
  - correct가 null이면 채점 제외, skipped면 미응답이다.
  - 정답률은 채점된 문항이 있을 때만 계산하고, 없으면 null이다 (0%로 포장 금지).
- **구현:**
  - `docs/assessment-result-bridge.js`: `validateAptitudeResult` /
    `normalizeAptitudeResult` / `save/load/clearAptitudeResult` /
    `formatAptitudeForProfile` 추가. `receiveMessage`는 type으로 라우팅한다
    (인성/적성 별개 저장, 서로 덮지 않는다).
  - `docs/assessment.html`: `// --- 적성 발신 ---` 블록에
    `buildAptitudeResult(attempts, session, mode)`(순수 함수) +
    `sendAptitudeResult(result)`(중복 발신 방지, iframe일 때만) 추가.
    live `renderAptResult`(마지막 정의)에서 결과 화면을 그린 뒤 보낸다.
    구버전 renderAptResult(첫 번째 정의)는 dead code라 건드리지 않았다.
  - `docs/app.js`: 프로필 6번 섹션에 적성 결과 블록 추가(전체 정답률 +
    과목별 정답률 + 검사 일시 + 지우기 버튼). 인성 블록과 별개로 표시된다.
    상태 줄에도 "적성 결과 받음 (정답률 …)"으로 표시한다.
  - `docs/index.html`: 브릿지·app.js 캐시 버전만 올렸다
    (`assessment-result-bridge.js?v=20261104-2`, `app.js?v=20261104-3`).
- **테스트:** `tests/test_aptitude_result_bridge.js` 신규,
  `tests/test_aptitude_sender.js` 신규 (발신 블록을 HTML에서 그대로 읽어 평가).

## 440문항 은행 출처 — 7회차 정정 (6회차 판단이 틀렸다)

- 6회차에서는 `INSIGHTFIT_QUESTION_BANK` 전역 변수가 리포에 없다고 했다.
  **틀렸다.** 은행은 `docs/assessment.html` 173번 줄에 base64 data
  스크립트로 내장돼 있다:
  `<script src="data:application/javascript;base64,...">`를 풀면
  `window.INSIGHTFIT_QUESTION_BANK=[...440문항...]` + 뒤에
  `window.INSIGHTFIT_QUESTION_REFERENCES="..."` 참고 근거 문서가 나온다.
  소스 파일에서 전역 할당을 grep으로 찾는 방식으로는 base64 안에 있는
  할당을 못 찾는다. 그래서 놓쳤다.
- **전수 검증 완료** (`tests/test_aptitude_bank_440.js` 신규): 440문항 전부
  유효 — id 유일, 문제·선택지 5개·정답 1~5·정석/빠른 풀이·난이도·주제·
  출제 근거 빠짐없음, 중복 문제 없음. 회사별 GSAT 90, SKCT/HMAT/PAT/DCAT/
  LG인적성 각 70. 사이트의 "440문항" 표기는 사실과 맞는다. 고칠 문구 없음.
- 참고 근거 문서는 "100% 신규 창작"임을 명시한다.

## 아직 안 한 것 (다음 회차)

- (없음 — 적성 발신은 7회차에 끝냈다. 응답 품질 페이지도 6회차에 실제
  값으로 연결됐다. 설계 문서의 낡은 "아직 안 한 것" 항목은 7회차에 정리했다.)
- 파일 내보내기 방식(1)은 대안으로 남겨둔다. postMessage가 막히면 그때 만든다.

## 5회차 결정: 발신 측을 붙이지 않았다 — 이유 (2026-11-04 10:05~10:13, JD_RECALL_ROUND5_HANDOVER.md 참조)

`assessment.html`의 인성검사 결과 화면(`renderResults()`, "결과 보기"로 도달)은
실제 채점 결과가 아니라 **고정된 예시 값**이다: `ref=[90,82,78,65,72]`,
`demo.traits`(성실성 86·협업 79·정서적 안정성 74·상호작용 67·개방성 77),
화면에 "예시 결과 · 실제 결과 아님", "가상 값", "현재 응답으로 실제 산출된 결과가
아닙니다"가 명시돼 있다. `state.answers`에서 Big Five 점수를 계산하는 함수는
파일 안에 존재하지 않는다 (확인: `renderResults`·`demo`·`data-next` 핸들러 전수 확인).
그래서 위 스니펫을 그대로 붙이면 예시 점수가 사용자 본인의 실제 결과인 것처럼
프로필로 넘어간다. 취업준비 품질 기준에 어긋나므로 **발신 측을 붙이지 않았다.**
`assessment.html`은 이번 회차에 건드리지 않았다 (백업과 diff 일치, 변경 0건).

선행 작업 (이것이 먼저다): `state.answers`에서 Big Five 5영역 점수를 실제로
계산하는 함수(역채점 문항 처리 포함)를 만들고, 결과 화면이 예시 값이 아니라
실제 산출 값을 보여주게 한 뒤에야 발신 스니펫을 붙일 수 있다. 적성검사 쪽은
`renderAptResult()`가 시도 기록(`state.apt.attempts`)에서 정답률 등을 실제로
계산하지만, 영역이 회사·과목별이라 브릿지의 5영역 스키마와 바로 맞지 않는다 —
발신 영역을 정하는 설계가 따로 필요하다.
