"""Build rewritten practice prompts and audited source references from supplied screenshots.

One source row can support several practice topics. Source numbering is preserved;
screen overlap is never counted as an additional interview. No OCR text is published.
"""
import json
from pathlib import Path
from equipment_answer_content import build_guidance, REFERENCES, COMPANY_CONTEXTS

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {
    'self': '자기소개·강점', 'motive': '지원동기·기업', 'role': '직무 이해',
    'experience': '경험·문제 해결', 'team': '협업·조직', 'customer': '고객·현장 대응',
    'work': '근무·적응', 'technical': '공정·장비 지식', 'language': '외국어·일상',
}
# Original questions are rewritten into reusable prompts, not transcribed as a question bank.
DEFINITIONS = '''
SI|self|자기소개|지원 직무와 연결되는 경험을 골라 1분 자기소개를 해보세요.|경험 하나와 본인 역할, 입사 후 기여를 연결하세요.
ST|self|강점과 기여|본인의 강점이 현장 업무에 도움이 된 사례를 설명해보세요.|장점의 이름보다 실제 행동과 확인 가능한 결과를 준비하세요.
SW|self|장점·단점|본인의 장단점이 업무에 미칠 영향과 보완 방법을 설명해보세요.|실제 사례와 현재 실천하는 보완 행동을 함께 준비하세요.
WK|self|약점 보완|본인이 개선하고 있는 약점과 구체적인 실천을 설명해보세요.|개선 전후의 행동 차이를 보여주세요.
OT|self|주변의 평가|동료나 친구가 본인을 어떻게 평가하는지 사례로 설명해보세요.|본인의 생각과 타인의 피드백을 구분하세요.
OB|self|사물·키워드로 소개|본인을 사물이나 한 단어에 비유하고 그 이유를 설명해보세요.|비유 뒤에 실제 행동 근거를 붙이세요.
CA|self|성장 목표|입사 후 맡고 싶은 업무와 장기적인 성장 방향을 설명해보세요.|희망 업무에 필요한 역량과 학습 계획을 연결하세요.
VA|self|가치관·일하는 방식|일할 때 중요하게 생각하는 기준과 그 기준이 드러난 경험을 설명해보세요.|추상적인 가치보다 선택과 행동을 준비하세요.
FIN|motive|마지막 말·역질문|면접을 마치며 보충할 내용이나 회사에 묻고 싶은 질문을 정리해보세요.|이미 설명한 내용의 반복을 줄이고 확인할 사항을 구체화하세요.
MV|motive|회사 지원동기|여러 회사 중 이 회사를 선택한 이유를 본인의 경험과 연결해보세요.|제품·업무에 관한 확인된 사실과 개인적인 선택 이유를 구분하세요.
VR|motive|장비사 선택 이유|반도체 제조사나 다른 진로 대신 장비사를 선택한 이유를 설명해보세요.|본인이 선호하는 업무와 장비사 업무의 접점을 설명하세요.
RM|motive|직무 선택 이유|지원 직무에 관심을 갖게 된 계기와 준비 과정을 설명해보세요.|계기, 실제 준비, 업무에 대한 기대를 연결하세요.
AP|motive|다른 지원·이직|다른 지원 현황이나 이직 이유를 일관된 기준으로 설명해보세요.|이전 조직에 대한 평가보다 앞으로 원하는 업무를 중심에 두세요.
CK|motive|회사·제품 이해|지원 회사의 제품과 사업, 기억에 남는 소식을 설명해보세요.|최신 사실은 공식 자료에서 다시 확인하세요.
CE|motive|경쟁사와 차이|다른 장비사와 비교해 이 회사에 주목한 이유를 설명해보세요.|비교 기준과 근거를 명확히 하고 과장된 우열 판단을 피하세요.
CV|motive|기업 가치·문화|회사의 가치나 문화가 실제 업무에서 어떻게 드러날지 설명해보세요.|공식 표현을 암기하는 데서 그치지 말고 행동 사례와 연결하세요.
FK|motive|회사를 알게 된 계기|이 회사를 알게 된 경로와 이후 알아본 내용을 설명해보세요.|관심을 실제 탐색이나 준비로 이어간 과정을 정리하세요.
RK|role|담당 업무 이해|지원 직무가 현장에서 어떤 일을 하는지 설명해보세요.|일의 목적, 주요 업무, 협업 대상을 구분하세요.
SK|role|필요 역량|지원 직무에 필요한 역량을 고르고 본인의 근거를 설명해보세요.|기술 역량과 소통·기록·협업 역량을 구체적인 업무와 연결하세요.
RC|role|직무 간 차이|비슷해 보이는 엔지니어 직무의 업무 범위와 선호 이유를 설명해보세요.|회사와 채용 공고에 따라 역할 범위가 달라질 수 있음을 확인하세요.
PP|role|희망 공정·장비|맡고 싶은 공정이나 장비를 고르고 관심을 갖게 된 이유를 설명해보세요.|관심 대상의 원리와 본인의 경험을 함께 준비하세요.
PL|work|근무지·배치|희망 근무지나 부서와 다른 배치를 받는 상황에 대한 생각을 정리해보세요.|선호 이유와 실제로 수용 가능한 범위를 구분하세요.
PR|experience|프로젝트·경험 검증|프로젝트에서 본인이 맡아 직접 수행한 일을 설명해보세요.|목표, 본인 행동, 팀의 행동, 결과를 구분하고 후속 질문을 준비하세요.
ME|experience|방법 선택 근거|문제 해결에 사용한 방법을 왜 선택했으며 대안은 무엇이었는지 설명해보세요.|조건, 비교한 대안, 선택 기준, 한계를 정리하세요.
LA|experience|쉽게 설명하기|전공이나 프로젝트 내용을 비전공자도 이해할 수 있게 설명해보세요.|목적과 핵심 원리를 먼저 말하고 필요한 용어만 풀어 설명하세요.
TO|experience|장비·도구 경험|직접 사용하거나 조립·정비한 장비와 도구를 설명해보세요.|장비 이름, 사용 목적, 직접 다룬 범위, 문제 경험을 구분하세요.
RP|experience|수리·하드웨어 해결|기기나 하드웨어 문제를 직접 해결한 과정을 설명해보세요.|증상 확인, 원인 가설, 점검, 조치, 재확인을 순서대로 준비하세요.
LE|experience|새 기술 학습|모르는 장비나 기술을 배워야 할 때 어떻게 학습하는지 설명해보세요.|자료 확인, 질문, 실습, 기록, 이해 확인 방법을 정리하세요.
CO|experience|전공·수업 연결|배운 전공 내용이 지원 직무에 어떻게 활용될 수 있는지 설명해보세요.|과목명보다 개념 하나와 적용 예시를 구체적으로 준비하세요.
GR|experience|성적·학업 선택|성적이나 진학·전공 선택에 대한 질문에 근거를 들어 설명해보세요.|사실과 배경을 간결히 말하고 이후의 노력과 연결하세요.
GAP|experience|공백·진로 전환|공백 기간이나 진로를 바꾼 이유와 그동안의 활동을 설명해보세요.|기간별 사실과 선택 이유, 준비 결과를 정리하세요.
IN|experience|인턴·직장 경험|인턴이나 이전 직장에서의 업무와 배운 점을 설명해보세요.|담당 범위와 아쉬웠던 점, 지원 업무와의 연결을 준비하세요.
SU|experience|목표·성공 경험|목표를 달성한 경험에서 본인의 기여를 설명해보세요.|목표 수준, 구체적인 노력, 결과를 확인한 방법을 구분하세요.
FA|experience|실패와 교훈|실패하거나 기대와 다른 결과를 얻은 경험과 이후 변화를 설명해보세요.|본인 책임을 구분하고 다시 한다면 바꿀 행동을 준비하세요.
HA|experience|어려움 극복|힘든 상황을 극복한 과정과 현재 업무에 적용할 배움을 설명해보세요.|어려움 자체보다 대응 행동과 그 이후의 변화를 구체화하세요.
CH|experience|도전·끈기|높은 목표나 오래 걸리는 문제를 끝까지 다룬 경험을 설명해보세요.|목표 설정, 중간 장애물, 조정 과정, 결과를 정리하세요.
PRO|experience|자발적인 개선|지시받기 전에 문제를 발견하고 개선한 경험을 설명해보세요.|문제 발견 근거와 실행 과정에서 얻은 협의를 함께 정리하세요.
ID|experience|새 아이디어·다른 접근|기존과 다른 방법으로 문제를 해결한 경험을 설명해보세요.|기존 방법의 한계, 새로운 접근의 근거, 검증 결과를 준비하세요.
NM|experience|매뉴얼 없는 문제|정해진 방법이 없거나 기존 방식이 통하지 않을 때 어떻게 접근할지 설명해보세요.|증거 수집과 가설 검증, 승인·지원 요청, 결과 기록을 준비하세요.
DE|experience|판단·우선순위 근거|불확실한 상황에서 어떤 근거로 판단하고 결정했는지 설명해보세요.|알고 있던 사실과 가정을 구분하고 판단의 한계를 밝혀주세요.
TE|team|협업 경험|여러 사람과 목표를 달성한 경험에서 본인의 역할을 설명해보세요.|업무 분담, 정보 공유, 조율 과정과 결과를 구분하세요.
TC|team|동료 갈등|동료와 의견이 달랐던 상황과 해결 과정을 설명해보세요.|상대의 관점, 공동 목표, 합의한 행동을 준비하세요.
DC|team|함께 일하기 어려운 유형|협업하기 어려운 행동 유형과 함께 일하기 위한 대응을 설명해보세요.|사람에 대한 단정보다 문제가 되는 행동과 조율 방식을 말하세요.
BC|team|상사·선배와 의견 차이|상사나 선배의 판단과 의견이 다를 때 어떻게 소통할지 설명해보세요.|근거 확인, 질문, 대안 제시, 필요한 보고 경로를 정리하세요.
UN|team|부당한 요구·지시|납득하기 어렵거나 부적절한 지시를 받으면 어떻게 판단하고 대응할지 설명해보세요.|사실과 기준을 확인하고 안전·규정을 지키는 대응을 준비하세요.
CR|team|비판·부정적 피드백|받아들이기 어려운 피드백에 어떻게 반응하고 행동을 바꿨는지 설명해보세요.|당시 감정, 확인한 사실, 수용하거나 설명한 부분을 구분하세요.
IG|team|의견이 받아들여지지 않을 때|본인의 의견이 받아들여지지 않았던 상황과 이후 행동을 설명해보세요.|배제되었다는 해석과 실제 상황을 구분하고 소통 행동을 준비하세요.
RU|team|규칙 위반·팀의 실수|동료의 규칙 위반이나 팀의 실수를 알게 되었을 때 어떻게 행동할지 설명해보세요.|영향을 확인하고 필요한 공유·보고와 재발 방지를 준비하세요.
LF|team|리더십·팔로워십|협업에서 리더나 구성원으로서 기여한 방식을 설명해보세요.|직책과 실제 행동을 구분하고 상황에 따른 역할 변화를 보여주세요.
AD|work|새 조직에 적응|낯선 조직이나 사람들과 신뢰를 쌓는 본인의 방법을 설명해보세요.|상대 이해, 질문, 약속 이행, 정보 공유를 구체화하세요.
SR|work|스트레스 관리|스트레스를 받는 상황과 실제로 사용하는 관리 방법을 설명해보세요.|발생 계기와 대응 행동, 업무 중 조절 방법을 준비하세요.
PH|work|체력·클린룸 적응|체력 부담이나 방진복·클린룸 근무에 대한 준비를 설명해보세요.|경험과 준비 수준, 지속 가능한 관리 방법을 구분하세요.
SH|work|교대·야간 근무|교대나 야간 근무에 대한 이해와 본인의 준비 상태를 설명해보세요.|실제 경험, 생활 관리, 우려 사항과 준비를 정리하세요.
OC|work|온콜·긴급 출근|예정하지 않은 호출이나 긴급 출근 상황에 어떻게 대응할지 설명해보세요.|대기·연락 체계와 업무 인수인계, 실제 대응 범위를 확인하세요.
OV|work|추가 업무·일정 충돌|추가 업무나 개인 일정과 업무가 겹칠 때 어떻게 조율할지 설명해보세요.|긴급도와 영향, 자원, 인수인계와 조율 방식을 정리하세요.
EX|work|현실적인 업무 기대|입사 후 예상되는 어려움이나 기대와 다른 업무에 어떻게 적응할지 설명해보세요.|직무의 어려움을 이해한 근거와 학습·소통 계획을 준비하세요.
PT|customer|고객 요청·우선순위|고객이 촉박한 기한이나 무리한 요구를 하면 어떻게 조율할지 설명해보세요.|요구의 목적, 위험과 자원, 가능한 대안, 진행 공유를 정리하세요.
SA|customer|필요 인원 부족|여럿이 해야 하는 작업을 혼자 요청받으면 어떻게 대응할지 설명해보세요.|안전·작업 기준 확인, 지원 요청, 수행 가능한 범위의 안내를 준비하세요.
OM|customer|본인 실수·장비 다운|본인의 실수로 현장에 문제가 생겼을 때의 대응을 설명해보세요.|영향 확인, 즉시 공유, 승인된 복구, 고객 안내, 재발 방지를 준비하세요.
CS|customer|고객 응대 경험|고객의 불만이나 갈등을 다룬 경험을 설명해보세요.|고객이 원한 것과 실제 해결 행동, 결과 확인을 구분하세요.
HQ|customer|고객과 본사 사이|고객 요구와 본사 판단이 다를 때 어떻게 정보를 전달하고 조율할지 설명해보세요.|요구사항과 기술 사실을 분리하고 합의 가능한 대안을 확인하세요.
TR|customer|신뢰·기술 소통|처음 만난 고객이나 동료와 정확히 소통하고 신뢰를 쌓는 방법을 설명해보세요.|상대의 이해 확인과 약속·진행 상황 공유 방법을 준비하세요.
CU|customer|문화·소통 차이|언어나 문화가 다른 상대와 협업한 경험을 설명해보세요.|오해가 생긴 지점과 이해를 확인한 방식을 정리하세요.
TS|technical|트러블슈팅 흐름|장비 이상을 발견했을 때 점검과 해결의 흐름을 설명해보세요.|증상과 로그, 최근 변경, 가설, 안전한 점검, 복구 확인을 순서대로 준비하세요.
PF|technical|반도체 공정 흐름|반도체 제조의 주요 공정과 공정 간 연결을 설명해보세요.|각 공정의 목적과 다음 단계에 주는 영향을 연결하세요.
DEP|technical|증착·스퍼터링|증착 방식의 원리와 선택 기준을 설명해보세요.|물리 기상 증착(PVD), 화학 기상 증착(CVD), 원자층 증착(ALD)의 차이를 준비하세요.
ET|technical|식각 장비·공정|식각의 목적과 장비 원리, 영향을 주는 조건을 설명해보세요.|직접 다룬 장비와 이론으로 배운 내용을 구분하세요.
PA|technical|플라즈마|플라즈마를 공정에 쓰는 이유와 생성·작동 원리를 설명해보세요.|입자, 에너지 전달, 공정과의 관계를 연결하세요.
VC|technical|진공·예방 정비|진공을 쓰는 이유와 이상 확인·예방 정비 방법을 설명해보세요.|압력, 누설·오염 가능성, 점검과 확인 방법을 준비하세요.
EU|technical|노광·EUV|극자외선(EUV) 노광 장비와 핵심 원리를 설명해보세요.|광원과 광학계, 공정 목적, 관련 부품의 역할을 연결하세요.
MB|technical|DRAM·NAND|메모리 반도체의 구조·동작과 제품 간 차이를 설명해보세요.|디램(DRAM)과 낸드 플래시(NAND)의 저장 방식과 쓰임을 비교하세요.
EL|technical|전자·기계 기초|기판·소자·레이저 등 전공 기초를 장비와 연결해 설명해보세요.|실제로 학습한 원리와 적용 예를 구체적으로 준비하세요.
SN|technical|재료 기초·주석|장비와 관련된 재료의 기본 물성과 역할을 설명해보세요.|자료에 나온 물성 질문은 단위와 조건을 확인해 준비하세요.
CL|technical|세정 공정|세정의 목적과 사용 방식, 장비에서 중요한 요소를 설명해보세요.|건식 세정과 관련 오염 제거 목적을 구분하세요.
IS|technical|장비 설치·조립|장비 설치나 조립에서 우선 확인할 사항을 설명해보세요.|작업 기준, 설치 조건, 점검과 인수인계 항목을 확인하세요.
DT|technical|데이터·도구 활용|데이터 분석이나 업무 도구를 사용한 경험을 설명해보세요.|입력 데이터, 분석 방법, 본인 작업, 판단에 준 도움을 구분하세요.
PG|technical|프로그래밍·AI|프로그래밍이나 인공지능(AI)을 활용한 경험과 한계를 설명해보세요.|직접 구현한 범위, 검증 과정, 다른 방법과의 차이를 준비하세요.
IT|technical|산업·사회 이슈|관심 있는 산업·사회 변화에 대한 생각을 설명해보세요.|확인된 사실, 본인의 해석, 아직 모르는 점을 구분하세요.
EN|language|외국어 소통 수준|업무에서 외국어를 사용한 경험과 현재 준비 수준을 설명해보세요.|사용한 상황과 할 수 있는 범위를 사실대로 정리하세요.
EP|motive|면접·직무 준비|지원 회사와 직무를 알아보고 준비하며 어떤 노력을 했는지 설명해보세요.|준비한 자료와 직접 수행한 활동, 그 과정에서 확인한 내용을 정리하세요.
ER|language|답변을 영어로 정리|준비한 답변이나 앞서 설명한 내용을 영어로 요약해보세요.|핵심 주장, 행동, 결과를 짧은 문장으로 전달하세요.
DA|language|일상·취미 설명|취미나 최근 일상을 구체적인 예와 함께 설명해보세요.|무엇을 했는지와 즐기는 이유를 자연스럽게 전달하세요.
ICE|language|가벼운 질문|예상하지 못한 일상 질문에 간결하고 자연스럽게 답해보세요.|모르는 사실을 꾸미지 말고 질문의 요지에 맞춰 답하세요.
'''

# Tokens correspond exactly to successive source row numbers. '+' retains mixed intents.
MAPPINGS = {
'amat': '''
1: PP ST CE SW OM DA ER OT HA PT CK MV MV EN ST
16: SR CA CR PF PR CK CA PP PP HA PR SH PF SK MV CR PP
33: AP VA PF ER DA BC TR BC SR TO TE PL HA FK RK CH DE OC FK FIN PR CA PL SI SI CK PR PP PP OT ER UN TE IT IT
68: DE LF PA PA HA AD SK SK DA LE TE TE CK RK RC SK DEP ET MB GR DEP PT CE CH TO SU SK GR VA FK DA VR MV IS VC CK
104: RK EX PG RK GAP EP PP OV LF PP ICE SU SW BC UN CK ET VR LE LF SK SK MV UN CU FK PF DT SK
133: PP PL SU FA PR PR PP ER DA RK TE RK PH CE AD HA CK CK PT MV BC+CS SI PF RK CK AP
''',
'asml': '''
1: RU HA SW VA RU SW SI ME ME FK GR SW
13: MV RK TS RM PR RK BC OV CK PRO TC OT VR VR DE EL EL HA SW EX SK ST CA ST CS PT CK OT VA SR DA VA SI TS LF HA
49: RK EX VA LF VR SI DA PL AP CK CE AP AP RM BC TC ST RM CK CA SR DC CR HA RU CH DC CR NM SR MV ST RM RC OT VA
85: VA CO VA PR ME ME DE DE PT VA NOTE NOTE CO IN SR LF IG ME OV CR MV ST UN MV PT FIN SI MV TE SI MV OV SI MV TE SK
121: CO DC SR SK SI ST RM SI DE DA SI RM TS TC SR SA SI SR DC SR SH PR SK CR SR SR ST ST TE DC RK TC SU SR CR DC
157: SA ID ST UN SR DC SI CR SA SI TS RM CR SA OM SH CR TS NM SR DC NM SU ST ST ST DC SH TS TE SI MV SW HA SW RU
193: MV DE DE FIN TS NM SK SH CO SN RK FIN HA MV DE OT CS VR HA ST NM DC RM TS DC TS SI PT PRO FA SI RM LA VR LE DC
229: DA WK HA SN DE ST FIN PT OT BC TS SI TE RM PT ST SA TS PT MV RK PP PF IN SH ST HQ SW HA LF DE FIN TE CA PT OT
265: ST TC SW SI RM MV TC DC DC PT CS PH RP OM TR OT SA HA NM ST ST HA RK LF SH FA DC HA EX SR EX HA TS TC TS HA
301: MV SK DC EP VA CA SI SW ST PRO PR SI RM SK PH TE VA GR TE FA TE FIN CK RM ST DE TC DC NM ID PRO DE MV SK TE HA
337: FIN SK SW DC RK FK VR MV ER TO NM CH DC DE DE DA MV RM SK DE PR DC SI SK EU PR
''',
'tel': '''
1: VR SK ST PR MV ME SU FA DA GR OV PR SK OV MV SU TR TC EN PF ST SR OV SR EP ST SI RK VR VA DE CE TS FIN OV LE AP ST PP HA UN
42: SK RC FIN OV LE AP OB MV RK MV PP TC TC PR OB SI RK PR SI EN DT SI PP PL PH LE SI VA RK RM SR PP RP TO PL CK
78: ME IN RK ST SK HA+PH CA PP VR SW RK PR IN CO OC ST IT HA RP BC FA FA SU PL OB ST TC EN RU AP IN EN EN VR+MV SK MV
114: LE BC MV PH PT RK ST HA VR ST TS SK EN CK ID HA TS SU SI UN TS FA TR MV TC RK PR IN OB CL OC SI TC ME SI SR
150: VC RM BC SK ST CK TS TC PR HA VR VA RC PP PH SI VR ST EX PR RK TC TC DE DE AP HA EN VA ST WK FA ST WK SU SI
186: VA AP CA SI ST PP ST RM RC SW ST NM VA WK ST IN CA SI CU VA ST WK CE MV SW VA ST WK SK MV
''',
'lam': '''
1: PR FIN CK SI ST SU LF CK AP SH RK SU TO CK CV TO EN FK TO ST TO OT PL WK VR LF AP VR SR CS RM WK VA ST SI UN TO
38: ST OT PRO FA TO SI CE LE OV CK HA VA PRO FA TO CE ER CR PR SK TC PA HA ST ST CR SK PR CR CK SW SH SI CS TO CK
74: DA HA CK PR EP RK CK PF MB UN HA SI LF TC SH FIN CK EP PT EN TO LA RK PH ST SI SR ST PL CK PL CU VA EP TO HA
110: IT FIN EX PRO EN OM CE HA CS CO AP CV MB RK RK PH CS PP EX PL MV PP PL VA EN TC TS RK FIN SR CS HA CR OM IN MV
146: RM VR CK WK IN DA TE FIN SI SK SR CE CA TC PR OC TR PT RC PP TR ST PL TO PL PL ID PH PR ET ST FK TS CO SI WK
182: EN CA TO FA HA BC TO AD EX SR TE CS CS CA HA DE VR CK CE CK MV EN SK PR PR VA SU EX PP PRO PR VA RM VA EX ST
218: PR PH DEP PR CV RK SK RP AD PH DA DA OB MV TO TS PR ST RK VA VR UN PG PG ST RK CS SK EL VR RK SI FIN MV CO TS
254: SW ET DC GR PR IN PL DE CE GAP RP CK EP ST BC TR CS OV ST CK CE EX TO HA PR TO VR RK RC AD PH PR ST TC DA CV
290: RK SK
''',
}

COMPANIES = [('amat','AMAT',158),('asml','ASML',362),('tel','TEL',215),('lam','램리서치',291)]
PERIODS = {
    'amat': [(15,'2025 하'),(132,'2026 상'),(158,'2026 하')],
    'asml': [(41,'2025 상'),(193,'2025 하'),(270,'2026 상'),(362,'2026 하')],
    'tel': [(44,'2025 상'),(59,'2025 하'),(180,'2026 상'),(215,'2026 하')],
    'lam': [(54,'2025 상'),(81,'2025 하'),(157,'2026 상'),(291,'2026 하')],
}
ENGLISH = {
    'amat': {1,6,7,30,36,37,49,57,63,68,76,98,140,141,154},
    'asml': {3,4,6,43,47,55,56,99,111,114,115,117,118,119,125,131,134,135,137,138,139,151,163,166,168,187,191,217,219,230,240,244,254,267,268,272,285,307,312,324,327,333,337,339,340,344,345,349,352,357},
    'tel': set(),
    'lam': {13,43,54,229},
}
JAPANESE_RELATED = {'amat':set(), 'asml':set(), 'tel':{19,61,63,105,109,110,126,148,149,177}, 'lam':set()}
# Additional intentions explicitly combined in a single source row.
EXTRA_TOPICS = {
 'amat': {56:['MV'],57:['MV'],62:['SW'],82:['PP'],99:['GR'],105:['HA'],124:['RK'],133:['RM'],142:['ST'],154:['MV']},
 'asml': {14:['RM'],45:['MV','RM'],57:['MV'],80:['SK'],125:['MV'],128:['MV'],137:['SI'],168:['RM'],187:['MV'],191:['PR'],215:['ST'],219:['MV'],224:['ST'],234:['ST'],240:['MV'],244:['ST'],256:['ST'],268:['MV'],280:['SW'],285:['ST'],307:['MV'],312:['MV'],315:['HA'],325:['SK'],339:['SW'],350:['NM'],359:['TE','ST']},
 'tel': {27:['MV'],60:['ST'],64:['PL'],68:['MV'],86:['AP'],88:['RK'],132:['MV'],155:['CV'],163:['PL'],166:['MV'],182:['WK'],189:['MV'],196:['WK'],203:['MV']},
 'lam': {15:['VA'],35:['CS'],69:['PH'],84:['ST'],91:['RM'],107:['EP'],147:['TO'],152:['TC'],156:['PT'],157:['AP'],160:['TS'],174:['TE'],175:['CK'],180:['ST'],186:['PH'],193:['PT'],204:['ST'],206:['TO'],215:['RM'],229:['DA'],235:['RP'],244:['CS'],249:['TC']},
}
# Source occupational labels are metadata from the compilation, not employer role definitions.
ROLE_BLOCKS = {
 'amat': [(3,'반도체/디스플레이'),(6,'AS/서비스/수리'),(9,'생산/제조/설비/조립'),(12,'생산관리/공정관리/품질관리'),(15,'생산/제조/설비/조립'),(18,'경영/사무'),(88,'생산/제조'),(105,'연구개발/설계'),(108,'IT/인터넷'),(125,'서비스'),(129,'무역/유통'),(132,'영업/고객상담'),(144,'생산/제조'),(149,'연구개발/설계'),(158,'서비스')],
 'asml': [(18,'반도체/디스플레이'),(21,'생산/제조/설비/조립'),(24,'생산관리/공정관리/품질관리'),(30,'전기/전자/제어'),(39,'AS/서비스/수리'),(41,'생산/제조/설비/조립'),(47,'AS/서비스/수리'),(50,'전기/전자/제어'),(53,'생산/제조/설비/조립'),(56,'생산관리/공정관리/품질관리'),(59,'AS/서비스/수리'),(62,'생산관리/공정관리/품질관리'),(68,'생산/제조'),(71,'서비스'),(74,'연구개발/설계'),(77,'서비스'),(80,'생산/제조'),(83,'서비스'),(85,'연구개발/설계'),(88,'서비스'),(91,'연구개발/설계'),(94,'서비스'),(96,'연구개발/설계'),(99,'생산/제조'),(104,'연구개발/설계'),(116,'생산/제조'),(119,'연구개발/설계'),(121,'생산/제조'),(124,'서비스'),(127,'연구개발/설계'),(130,'서비스'),(145,'생산/제조'),(148,'연구개발/설계'),(170,'생산/제조'),(172,'서비스'),(181,'생산/제조'),(184,'연구개발/설계'),(187,'생산/제조'),(193,'서비스'),(223,'생산관리/공정관리/품질관리'),(252,'생산/제조/설비/조립'),(268,'반도체/디스플레이'),(270,'영업/고객상담'),(326,'생산/제조'),(342,'연구개발/설계'),(362,'서비스')],
 'tel': [(17,'반도체/디스플레이'),(20,'빅데이터/AI'),(31,'생산/제조/설비/조립'),(34,'전기/전자/제어'),(41,'AS/서비스/수리'),(44,'엔지니어링'),(47,'AS/서비스/수리'),(59,'생산/제조/설비/조립'),(67,'FE'),(72,'FSE'),(78,'영업/고객상담'),(81,'경영/사무'),(124,'생산/제조'),(136,'연구개발/설계'),(139,'IT/인터넷'),(171,'서비스'),(174,'무역/유통'),(177,'건설'),(180,'경영/사무'),(194,'생산/제조'),(204,'연구개발/설계'),(207,'IT/인터넷'),(215,'서비스')],
 'lam': [(1,'AS/서비스/수리'),(18,'반도체/디스플레이'),(35,'생산/제조/설비/조립'),(38,'생산관리/공정관리/품질관리'),(39,'AS/서비스/수리'),(44,'개발'),(47,'엔지니어링'),(49,'연구개발'),(53,'개발'),(54,'생산관리/품질관리'),(57,'AS/서비스/수리'),(60,'생산/제조'),(66,'서비스'),(75,'생산/제조'),(78,'서비스'),(81,'생산/제조'),(84,'영업/고객상담'),(125,'생산/제조'),(137,'연구개발/설계'),(153,'서비스'),(157,'영업/고객상담'),(248,'생산/제조'),(260,'연구개발/설계'),(291,'서비스')],
}

def block_value(blocks, number):
    return next(value for end,value in blocks if number <= end)

def source_page(company, number):
    if company == 'amat':
        return next(p for end,p in [(32,1),(67,2),(103,3),(139,4),(158,5)] if number <= end)
    if company == 'asml':
        return 5 if number <= 12 else 6 + (number-13)//36
    if company == 'tel':
        return 15 if number <= 5 else 16 + (number-6)//36
    return 21 if number == 1 else 22 + (number-2)//36

def parse_mapping(text, total):
    result = {}
    for line in text.strip().splitlines():
        start, tokens = line.split(':',1)
        for number, token in enumerate(tokens.split(),int(start)):
            if number in result:
                raise ValueError(f'Duplicate row {number}')
            result[number] = token.split('+')
    if set(result) != set(range(1,total+1)):
        raise ValueError(f'Coverage differs: missing {set(range(1,total+1))-set(result)}, extra {set(result)-set(range(1,total+1))}')
    return result

ENGLISH_PROMPTS = {
 'LF':'Describe how you contributed as a leader or a team member.',
 'PP':'Which process or equipment would you like to work with, and why?',
 'EP':'How have you prepared to discuss your experience in an English interview?',
 'SI':'Introduce yourself and connect one relevant experience to the role.',
 'ST':'Describe a strength and a situation where it helped you contribute.',
 'SW':'What are your strengths and weaknesses? How do they affect your work?',
 'WK':'What weakness are you working on, and what have you changed?',
 'MV':'Why did you choose this company? Connect your reasons to your experience.',
 'RM':'Why are you interested in this role, and how have you prepared for it?',
 'PL':'Why do you prefer this work location? How would you approach a different assignment?',
 'VA':'What helps you stay motivated at work? Give an example.',
 'TE':'Tell me about a time you worked with others toward a shared goal.',
 'TC':'Describe a disagreement with a colleague and how you handled it.',
 'DC':'What working behaviors do you find difficult, and how do you cooperate?',
 'SR':'What causes you stress, and how do you manage it at work?',
 'DA':'Describe a hobby or something you did recently and explain why you enjoyed it.',
 'RK':'Explain the role you applied for and its main responsibilities.',
 'DE':'Explain the situation, the evidence you used, and the decision you made.',
 'FIN':'What would you like to add before we finish?',
 'PR':'Explain your project, your own responsibilities, and what you achieved.',
 'TO':'Describe equipment you used and explain what you personally did with it.',
 'ER':'Summarize your previous answer in English.',
}

def build():
    definitions = {}
    for line in DEFINITIONS.strip().splitlines():
        code,category,title,prompt,focus = line.split('|')
        definitions[code] = dict(id='equip-'+code.lower(),category=category,title=title,prompt=prompt,focus=focus,sources=[])
    notes = []
    coverage = []
    for company,label,total in COMPANIES:
        mapping = parse_mapping(MAPPINGS[company],total)
        for number,codes in mapping.items():
            page = source_page(company,number)
            source = dict(company=company,number=number,page=page,period=block_value(PERIODS[company],number),
                          role=block_value(ROLE_BLOCKS[company],number),english=number in ENGLISH[company],
                          japaneseRelated=number in JAPANESE_RELATED[company])
            if codes == ['NOTE']:
                notes.append({**source,'kind':'후기 메모','summary':'질문 내용이 아닌 면접 후기 또는 비공개 약정 관련 메모'})
            else:
                codes = list(dict.fromkeys(codes + EXTRA_TOPICS[company].get(number,[])))
                for code in codes:
                    definitions[code]['sources'].append(source)
            coverage.append({**source,'topics':codes,'screenshotIndex':min(page-1,28)})
    items = []
    for code,item in definitions.items():
        if not item['sources']:
            continue
        if any(s['english'] for s in item['sources']):
            if code not in ENGLISH_PROMPTS:
                raise ValueError('Missing English practice prompt for '+code)
            item['englishPrompt'] = ENGLISH_PROMPTS[code]
        items.append(item)
    catalog = dict(version=1, source='사용자 제공 렛유인 장비사 면접기출 모음',
                   sourceType='reported-interview-compilation', collectedAt='2026-11-21',
                   sourceRows=sum(c[2] for c in COMPANIES), questionRows=len(coverage)-len(notes),
                   noteRows=len(notes), sourceImages=29,
                   notice='제공된 후기 모음의 질문 의도를 재구성한 연습 자료입니다. 회사 공식 기출이나 출제 확률을 뜻하지 않습니다. 시기·직무는 원자료 표기를 따릅니다.',
                   companies=[dict(id=c,name=n,sourceRows=t) for c,n,t in COMPANIES],
                   categories=[dict(id=k,name=v) for k,v in CATEGORIES.items()], items=items)
    guides = build_guidance({item['id'][6:] for item in items if 'englishPrompt' in item})
    if set(guides) != {item['id'][6:] for item in items}:
        raise ValueError('Every practice topic must have one reviewed answer guide')
    for item in items:
        item['guide'] = guides[item['id'][6:]]
    catalog['answerGuidance'] = dict(version=1,reviewedAt='2026-11-21',
        notice='평가 관점은 공개 직무·행동 역량 자료를 참고한 해석이며 회사의 공식 평가표나 합격 답안이 아닙니다. 경험 예시는 가상 사례입니다. 본인의 사실과 선택 기준으로 바꿔 연습하세요. 추가 압박 질문과 예문은 연습용으로 작성했습니다.',
        references={key:{**value,'checkedAt':'2026-11-21'} for key,value in REFERENCES.items()},
        companyContexts=COMPANY_CONTEXTS)
    return catalog, dict(version=1,sourceImages=29,rows=coverage,notes=notes)

if __name__ == '__main__':
    catalog,audit = build()
    (ROOT/'docs/interview/equipment.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'config/equipment_interview_audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"{catalog['sourceRows']} source rows, {catalog['questionRows']} question rows, {len(catalog['items'])} practice topics, {catalog['noteRows']} notes")
