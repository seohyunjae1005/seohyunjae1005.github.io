"""Build a link catalog from user-supplied article metadata; never synthesize source bodies."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ('process', '단위공정'), ('equipment', '장비·공통원리'), ('device', '소자·재료'),
    ('product', '제품·패키징'), ('analysis', '평가·공정관리'), ('interview', '인성·면접'), ('industry', '산업·기업'),
]
TOPICS = [
    ('flow','process','공정 흐름'), ('photo','process','포토'), ('etch','process','식각'),
    ('deposition','process','증착'), ('thermal','process','산화·확산·열처리'), ('implant','process','이온주입'),
    ('cmp','process','CMP'), ('cleaning','process','세정'), ('metal','process','금속배선'),
    ('plasma','equipment','플라즈마'), ('rf','equipment','RF·바이어스'), ('vacuum','equipment','진공·펌프'),
    ('mos','device','MOS 동작·전기특성'), ('short','device','단채널·누설전류'),
    ('structure','device','소자 구조'), ('contact','device','접합·접촉'), ('materials','device','유전·배선 재료'),
    ('dram','product','DRAM'), ('nand','product','NAND'), ('memory','product','메모리·인터페이스'),
    ('packaging','product','HBM·TSV'), ('power','product','시스템·전력반도체'), ('display','product','디스플레이'),
    ('metrology','analysis','측정·분석'), ('yield','analysis','수율·공정제어'),
    ('margin','analysis','공정 마진·코너'), ('reliability','analysis','신뢰성'),
    ('personality','interview','인성·자기소개'), ('experience','interview','이력서·경험'),
    ('answer','interview','답변·면접 전략'), ('roadmap','industry','기술 로드맵'), ('company','industry','기업 이해'),
]
TOPIC_IDS = {row[0] for row in TOPICS}
# Exact filename overrides keep cross-cutting topics out of broad series-based categories.
OVERRIDES = {
    'jeongjuhaeng-deposition-10-debye-length.md': ('plasma',['deposition']),
    'jeongjuhaeng-deposition-11-paschen-law.md': ('plasma',['deposition']),
    'jeongjuhaeng-deposition-12-dc-sputter-sheath.md': ('plasma',['deposition']),
    'jeongjuhaeng-deposition-13-dc-plasma-insulator.md': ('plasma',['deposition']),
    'jeongjuhaeng-deposition-14-rf-plasma-self-bias.md': ('rf',['plasma','deposition']),
    'jeongjuhaeng-deposition-15-electrode-area-self-bias-2.md': ('rf',['plasma','deposition']),
    'jeongjuhaeng-deposition-16-electrode-area-self-bias-3.md': ('rf',['plasma','deposition']),
    'jeongjuhaeng-etch-08-rf-frequency.md': ('rf',['etch','plasma']),
    'master-session-2-06-rf.md': ('rf',['deposition','cleaning','plasma']),
    'master-session-2-07-vacuum.md': ('vacuum',['deposition']),
    'master-session-2-03-carbon-hardmask.md': ('deposition',['photo','materials']),
    'master-session-2-04-lowk.md': ('materials',['metal','deposition']),
    'master-session-1-04-cleaning-unit.md': ('cleaning',['cmp']),
    'master-session-1-06-apc-uniformity.md': ('cmp',['yield']),
    'master-session-1-10-cmp-epd.md': ('cmp',['metrology']),
    'jeongjuhaeng-ion-implant-02-diffusion-vs-implant.md': ('implant',['thermal']),
    'jeongjuhaeng-ion-implant-06-damage-annealing-1.md': ('implant',['thermal']),
    'jeongjuhaeng-ion-implant-07-damage-annealing-2.md': ('implant',['thermal']),
    'jeongjuhaeng-ion-implant-08-evaluation-sims-4probe.md': ('metrology',['implant']),
    'jeongjuhaeng-metal-01-homo-junction.md': ('contact',['metal']),
    'jeongjuhaeng-metal-02-hetero-junction.md': ('contact',['metal']),
    'jeongjuhaeng-metal-03-schottky-ohmic.md': ('contact',['metal']),
    'jeongjuhaeng-metal-04-salicide.md': ('metal',['contact']),
    'master-session-3-01-metal-al.md': ('metal',['reliability','materials']),
    'sokseong-metal-04.md': ('metal',['reliability']),
    'master-session-3-02-cvd-w.md': ('metal',['deposition']),
    'master-session-3-03-lfw.md': ('metal',['nand','deposition']),
    'jeongjuhaeng-cmp-index.md': ('cmp',['cleaning']),
    'sokseong-03-cmp.md': ('cmp',['cleaning']),
    'misc-highk-lowk.md': ('materials',['metal','structure']),
    'misc-cmp-planarization.md': ('cmp',[]),
    'jeongjuhaeng-cmos-process-flow.md': ('flow',[]),
    'sokseong-01-diffusion.md': ('thermal',['implant']),
    'training-sio2-lpcvd-pecvd.md': ('deposition',['materials']),
    'training-si3n4-sion-lpcvd-pecvd.md': ('deposition',['materials']),
    'training-plug-w-cvd.md': ('metal',['deposition','materials']),
    'knowledge-bspdn.md': ('metal',['structure']),
    'knowledge-yield-defect-density.md': ('yield',[]),
    'training-lcr-meter-capacitance.md': ('metrology',['mos']),
    'training-xrd.md': ('metrology',[]),
    'training-inline-monitoring-pcm.md': ('metrology',['yield']),
    'training-yield-correlation-analysis.md': ('yield',[]),
    'training-nbti-pbti-hci.md': ('reliability',['short']),
    'training-shmoo-plot.md': ('margin',['metrology']),
    'training-process-corner-margin.md': ('margin',[]),
    'jeongjuhaeng-process-corners-vlsi.md': ('margin',[]),
    'training-dram-02-hbm-rcat-dcat.md': ('dram',['packaging','structure']),
    'training-ddr-lpddr.md': ('memory',['dram']),
    'training-memory-semiconductor-terms.md': ('memory',[]),
    'training-pim.md': ('memory',[]),
    'training-pmic.md': ('power',[]),
    'training-power-device.md': ('power',['materials']),
    'training-system-semiconductor-terms.md': ('power',[]),
    'sokseong-04-sic-gan.md': ('power',['materials']),
    'sokseong-05-hbm.md': ('packaging',['dram']),
    'training-tsv.md': ('packaging',['metal']),
    'training-oled-passivation-encapsulation.md': ('display',['deposition']),
    'training-leakage-current-1.md': ('short',['mos']),
    'training-leakage-current-2.md': ('short',['mos']),
    'training-vt-roll-off.md': ('short',['mos']),
    'training-subthreshold-swing.md': ('mos',['short']),
    'training-subthreshold-swing-details.md': ('mos',['short']),
    'training-hkmg.md': ('structure',['materials']),
    'company-lx-semicon.md': ('company',['power']),
    'guide-before-interview-checklist.md': ('experience',['answer']),
    'guide-answer-tips-dugwalsik.md': ('answer',[]),
    'guide-one-minute-intro.md': ('personality',[]),
    'guide-personality-must-questions.md': ('personality',[]),
    'guide-resume-travel-map.md': ('experience',[]),
    'guide-common-denominator.md': ('answer',[]),
    'guide-interviewer-intent.md': ('answer',[]),
    'guide-forbidden-expressions.md': ('answer',[]),
    'guide-growth-process-top6.md': ('experience',[]),
    'guide-successful-interview.md': ('answer',[]),
    'guide-resume-attack-questions-top7.md': ('experience',['answer']),
}

def canonical_filename(value):
    return re.sub(r'(?:\.md)+$', '.md', value)

def classify(filename):
    if filename in OVERRIDES:
        return OVERRIDES[filename]
    prefixes = [
        ('jeongjuhaeng-photo-', 'photo'), ('jeongjuhaeng-etch-', 'etch'),
        ('jeongjuhaeng-plasma-', 'plasma'), ('jeongjuhaeng-deposition-', 'deposition'),
        ('jeongjuhaeng-cleaning-', 'cleaning'), ('master-session-1-', 'cmp'),
        ('master-session-2-', 'deposition'), ('master-session-3-', 'metal'),
        ('jeongjuhaeng-ion-implant-', 'implant'), ('jeongjuhaeng-metal-', 'metal'),
        ('sokseong-metal-', 'metal'), ('sokseong-02-metal-', 'metal'),
        ('pcm-', 'metrology'), ('tsmc-2nm-', 'roadmap'), ('jeongjuhaeng-yield-', 'yield'),
        ('training-sce-', 'short'), ('training-dram-', 'dram'), ('training-nand-', 'nand'),
    ]
    for prefix, topic in prefixes:
        if filename.startswith(prefix):
            return topic, []
    if filename in {'training-soi.md','training-fd-soi.md','training-finfet.md','training-3d-mosfet-gaa.md','training-3nm-2nm-gaafet.md','training-imos-tfet-nc-fet.md'}:
        return 'structure', []
    if filename in {'training-mos-capacitor-vs-mosfet.md','training-threshold-voltage-modulation.md','training-body-effect.md','training-output-characteristics.md','training-dynamic-static-power.md','training-dynamic-static-power-current.md'}:
        return 'mos', []
    raise ValueError('Unclassified source: ' + filename)

ALIASES = {
    'photo':'포토 리소그래피 lithography 노광', 'etch':'식각 etch etching',
    'deposition':'증착 박막 deposition thin film', 'thermal':'산화 확산 열처리 oxidation diffusion annealing',
    'implant':'이온주입 implant implantation doping', 'cmp':'연마 평탄화 CMP polishing',
    'cleaning':'세정 cleaning', 'metal':'배선 interconnect metal',
    'plasma':'플라즈마 plasma', 'rf':'고주파 RF radio frequency',
    'vacuum':'진공 vacuum', 'structure':'소자 구조 device structure',
    'contact':'접합 접촉 contact junction', 'metrology':'측정 계측 평가 분석 metrology',
    'yield':'수율 공정제어 yield', 'margin':'마진 코너 margin corner',
    'reliability':'신뢰성 reliability', 'packaging':'패키징 packaging',
    'personality':'인성 자기소개 성격', 'experience':'이력서 경험 성장과정',
}
LEXICAL_ALIASES = [
    (r'\bfinfet\b', '핀펫'), (r'\bgaa(?:fet)?\b', '게이트올어라운드'),
    (r'\bschottky\b', '쇼트키'), (r'\bohmic\b', '오믹'),
    (r'\bsheath\b', '쉬스'), (r'\bself[ -]?bias\b', '자기바이어스'),
    (r'\btsv\b', '실리콘관통전극'), (r'\beuv\b', '극자외선'),
    (r'\bald\b', '원자층증착'), (r'\bale\b', '원자층식각'),
    (r'\bxrd\b', '엑스선회절'), (r'\bpcm\b', '공정모니터'),
]

def display_title(title):
    title = title.replace('\\"','"').strip()
    title = re.sub(r'^※필독※\s*','',title)
    title = re.sub(r'^\[(?:딴딴[^\]]*|딴사관[^\]]*|속성 직무면접 편|반도체 공정|평가 및 분석|반도체 소재)\]\s*','',title, flags=re.I)
    title = re.sub(r'^Session\s+\d+-\d+\.\s*','',title,flags=re.I)
    return title or title

def series_order(filename, title, index):
    # Keep explicit training numbers, even when a collection's file order differs.
    if filename.endswith('-index.md'):
        return [4, index, index]
    training = re.search(r'훈련\s*:?\s*(\d+)', title)
    if training:
        return [0, int(training[1]), index]
    session = re.search(r'Session\s+\d+-(\d+)', title, re.I)
    if session:
        return [1, int(session[1]), index]
    return [2, index, index]

def build(source):
    items = []
    seen = set()
    for index, row in enumerate(source['items']):
        parsed = urlparse(row['url'])
        match = re.fullmatch(r'/(?:m/)?(\d+)', parsed.path)
        if parsed.scheme != 'https' or parsed.hostname != 'sshmyb.tistory.com' or not match:
            raise ValueError('Invalid source URL: ' + row['url'])
        post = match[1]
        if post in seen:
            raise ValueError('Duplicate post ' + post)
        seen.add(post)
        filename = canonical_filename(row['file'])
        primary, related = classify(filename)
        topics = list(dict.fromkeys([primary, *related]))
        assert set(topics) <= TOPIC_IDS
        fmt = 'image' if post in {'362','364','365','366','368','369'} else ('index' if filename.endswith('-index.md') else 'article')
        items.append({
            'id':'ddan-' + post, 'postId':post, 'sourceFile':row['file'], 'file':filename,
            'title':display_title(row['title']), 'originalTitle':row['title'],
            'publishedAt':row['publishedAt'], 'url':row['url'],
            'primary':primary, 'topics':topics, 'format':fmt,
            'aliases':' '.join([*(ALIASES.get(topic,'') for topic in topics), *(alias for pattern,alias in LEXICAL_ALIASES if re.search(pattern,row['title'],re.I))]),
            'order':index, 'sortOrder':series_order(filename,row['title'],index), 'bodyIncluded':False,
        })
    return {
        'version':1, 'source':source['source'], 'sourceUrl':source['sourceUrl'],
        'collectedAt':source['collectedAt'], 'classificationBasis':'첨부 자료의 제목·목록 기준',
        'groups':[{'id':key,'name':name} for key,name in GROUPS],
        'topics':[{'id':key,'group':group,'name':name} for key,group,name in TOPICS],
        'items':items,
    }

def main():
    source_path = ROOT/'config/interview_source_metadata.json'
    source = json.loads(source_path.read_text(encoding='utf-8'))
    catalog = build(source)
    assert len(catalog['items']) == 182
    target = ROOT/'docs/interview/catalog.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Interview catalog:', len(catalog['items']), 'unique links;', dict(Counter(row['primary'] for row in catalog['items'])))

if __name__ == '__main__':
    main()
