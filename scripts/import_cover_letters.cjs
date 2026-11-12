const fs = require('node:fs');
const path = require('node:path');
const [input, companyId = 'skhynix'] = process.argv.slice(2);
const sources = {
  skhynix: { company: 'SK하이닉스', file: 'skhynix-yangsan.json', start: 2018, end: 2026, totals: [39, 40, 147] },
  samsung: { company: '삼성전자', file: 'samsung-process.json', start: 2015, end: 2026, totals: [84, 113, 310] },
  asml: { company: 'ASML', file: 'asml-service.json', start: 2017, end: 2025, totals: [32, 33, 80] },
  kla: { company: 'KLA', file: 'kla-service.json', start: 2020, end: 2024, totals: [7, 7, 25] },
  amat: { company: 'Applied Materials', file: 'amat-service.json', years: [2018, 2020, 2021, 2022, 2023, 2024, 2025, 2026], totals: [18, 21, 85] },
  tel: { company: '도쿄일렉트론(TEL)', file: 'tel-service.json', years: [2017, 2018, 2020, 2021, 2024, 2026], totals: [9, 13, 52] },
  lam: { company: 'Lam Research', file: 'lam-service.json', years: [2017, 2020, 2024, 2025, 2026], totals: [5, 6, 27] },
  'hyundai-quality': { company: '현대자동차', category: '품질', file: 'hyundai-quality.json', years: [2015, 2016, 2017, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026], totals: [21, 21, 55] },
  'hyundai-production': { company: '현대자동차', category: '생산기술', file: 'hyundai-production.json', years: [2015, 2016, 2019, 2020, 2022, 2023, 2024, 2025, 2026], totals: [14, 16, 38] },
  'hanwha-quality': { company: '한화에어로스페이스', category: '품질', file: 'hanwha-quality.json', years: [2015, 2023, 2024, '미확인'], totals: [5, 5, 19] },
  'hanwha-production': { company: '한화에어로스페이스', category: '생산기술', file: 'hanwha-production.json', years: [2016, 2018, 2023], totals: [4, 4, 14] },
  'lig-production': { company: 'LIG넥스원', category: '생산기술', file: 'lig-production.json', years: [2015, 2021], totals: [3, 3, 13] },
};
const questionNotes = {
  amat: { '36144': { 4: '수집 자료에서 3번과 4번의 문항·답변이 동일하게 표시됩니다.' } },
  tel: { '196285': {
    2: '수집 자료의 추정 문항입니다.',
    3: '수집 자료의 추정 문항입니다.',
    4: '수집 자료의 추정 문항입니다.',
  } },
  'hyundai-quality': { '241725': {
    2: '수집 자료의 추정 문항입니다.',
    3: '수집 자료의 추정 문항입니다.',
    4: '수집 자료의 추정 문항입니다.',
  } },
};
if (!input || !Object.hasOwn(sources, companyId)) {
  throw new Error(`사용법: node scripts/import_cover_letters.cjs <연도별 Markdown 폴더> [${Object.keys(sources).join('|')}]`);
}
const { company, category, file, start, end, years = Array.from({ length: end - start + 1 }, (_, index) => start + index), totals } = sources[companyId];
const groups = [];
for (const year of years) {
  const source = fs.readFileSync(path.join(input, `${year}.md`), 'utf8').replace(/\r\n/g, '\n');
  const groupPattern = /^## \[([^\]]+)\] (.+?) — (\d{4}(?:년)? (?:상반기|하반기)|미확인 미확인) \(([^\n]+)\)\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/gm;
  const yearlyGroups = [];
  for (const match of source.matchAll(groupPattern)) {
    const [, id, role, period, employment, body] = match;
    const [groupYear, season] = period.replace('년', '').split(' ');
    if (groupYear !== String(year)) throw new Error(`연도 불일치 ${year}/${id}`);
    const questionSection = body.split(/^--- 자소서 /m)[0];
    const questions = [...questionSection.matchAll(/^### 문항 (\d+) \(글자 수 제한: (.*?)\)\n([\s\S]*?)(?=^### 문항 |^---|$(?![\s\S]))/gm)].map(row => ({ number: Number(row[1]), limit: row[2].trim(), text: row[3].trim() }));
    const questionNumbers = new Set(questions.map(question => question.number));
    if (questionNumbers.size !== questions.length || questions.some(question => !question.text)) {
      throw new Error(`중복 또는 빈 문항 ${id}`);
    }
    const essays = [];
    for (const essay of body.matchAll(/^--- 자소서 ([^\n]+)\n원문: (https?:\/\/[^\s]+)\n([\s\S]*?)(?=^--- 자소서 |$(?![\s\S]))/gm)) {
      const pieces = essay[1].split(' | ');
      const field = label => pieces.find(value => value.startsWith(label + ' '))?.slice(label.length + 1) || '미확인';
      const url = new URL(essay[2]);
      const postId = field('게시물 ID');
      const linkareer = ['linkareer.com', 'www.linkareer.com'].includes(url.host) && url.pathname === `/cover-letter/${postId}`;
      const jobkorea = ['www.jobkorea.co.kr', 'm.jobkorea.co.kr'].includes(url.host) && (
        (/\/passassay\/views?(\/\d+)?$/i.test(url.pathname) &&
          (url.searchParams.get('Job_Epil_No') === postId || url.pathname.endsWith(`/${postId}`))) ||
        (url.pathname === '/SelfIntroduction/PassAssayView' && url.searchParams.get('PflNo') === postId));
      const weport = url.host === 'community.weport.co.kr' &&
        [`/best/${postId}`, `/board_DwNG04/${postId}`].includes(url.pathname);
      const deep = url.host === '457deep.com' && /^[a-z0-9]{24,32}$/.test(postId) &&
        url.pathname === `/resources/detail/${postId}`;
      const supported = deep || (/^\d+$/.test(postId) && (linkareer || jobkorea || weport));
      if (url.protocol !== 'https:' || url.username || url.password || !supported) {
        throw new Error(`출처 주소와 게시물 ID가 일치하지 않습니다. ${id}/${pieces[0]}`);
      }
      const answers = [...essay[3].matchAll(/^#### 답변 (\d+)\n([\s\S]*?)(?=^#### 답변 |$(?![\s\S]))/gm)].map(row => ({ number: Number(row[1]), text: row[2].trim() }));
      if (!answers.length || new Set(answers.map(answer => answer.number)).size !== answers.length || answers.some(answer => !answer.text || !questionNumbers.has(answer.number))) {
        throw new Error(`문항·답변 대응 오류 ${id}/${pieces[0]}`);
      }
      const notes = questionNotes[companyId]?.[postId];
      if (notes && Object.keys(notes).some(number => !answers.some(answer => answer.number === Number(number)))) {
        throw new Error(`메모에 해당하는 답변을 찾지 못했습니다. ${id}/${postId}`);
      }
      let details;
      if (category) {
        const header = essay[3].split(/^#### 답변 /m, 1)[0];
        const row = /^원문 직무명: (.+) \| 세부 업무: (.+) \| 사업부·조직: (.+) \| 사업장: (.+)$/m.exec(header.replace(/^원문 회사명: [^|\n]+ \| /m, ''));
        const status = pieces.find(value => value.startsWith('수집 상태: '))?.slice('수집 상태: '.length);
        if (!row || !status) throw new Error(`직무 정보 또는 수집 상태 누락 ${id}/${postId}`);
        const [, originalRole, duties, organization, site] = row;
        const originalCompany = /^원문 회사명: ([^|\n]+)/m.exec(header)?.[1].trim();
        details = { originalRole, duties, organization, site, status, originalCompany };
      }
      essays.push({ id: pieces[0], postId, source: field('출처'), stage: field('합격 단계'), publishedAt: field('게시일'), collectedAt: field('수집일'), url: essay[2], answers, questionNotes: notes, details });
    }
    if (!questions.length || !essays.length) throw new Error(`빈 묶음 ${id}`);
    yearlyGroups.push({ id, company, category, role, year: year === '미확인' ? null : year, season, employment, questions, essays });
  }
  const original = [/^## \[/gm, /^--- 자소서 /gm, /^#### 답변 /gm].map(pattern => [...source.matchAll(pattern)].length);
  const essays = yearlyGroups.flatMap(group => group.essays);
  const parsed = [yearlyGroups.length, essays.length, essays.reduce((sum, essay) => sum + essay.answers.length, 0)];
  if (parsed.some((count, index) => count !== original[index])) {
    throw new Error(`${year} 원본 집계 불일치: 변환 ${parsed}, 원본 ${original}`);
  }
  groups.push(...yearlyGroups);
}
const essays = groups.flatMap(group => group.essays);
if (new Set(essays.map(essay => `${essay.source}:${essay.postId}`)).size !== essays.length) throw new Error('중복 게시물 ID');
const counts = { groups: groups.length, essays: essays.length, answers: essays.reduce((sum, essay) => sum + essay.answers.length, 0) };
if (Object.values(counts).some((count, index) => count !== totals[index])) {
  throw new Error(`원본 README 집계 불일치 ${JSON.stringify(counts)}`);
}
const output = path.resolve(__dirname, '../docs/library', file);
fs.mkdirSync(path.dirname(output), { recursive: true });
const importedAt = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
fs.writeFileSync(output, JSON.stringify({ version: 1, company, importedAt, counts, groups }, null, 2) + '\n');
console.log(JSON.stringify(counts));
