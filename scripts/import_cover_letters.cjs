const fs = require('node:fs');
const path = require('node:path');
const [input, companyId = 'skhynix'] = process.argv.slice(2);
const sources = {
  skhynix: { company: 'SK하이닉스', file: 'skhynix-yangsan.json', start: 2018, totals: [39, 40, 147] },
  samsung: { company: '삼성전자', file: 'samsung-process.json', start: 2015, totals: [84, 113, 310] },
};
if (!input || !Object.hasOwn(sources, companyId)) {
  throw new Error('사용법: node scripts/import_cover_letters.cjs <연도별 Markdown 폴더> [skhynix|samsung]');
}
const { company, file, start, totals } = sources[companyId];
const groups = [];
for (let year = start; year <= 2026; year += 1) {
  const source = fs.readFileSync(path.join(input, `${year}.md`), 'utf8').replace(/\r\n/g, '\n');
  const groupPattern = /^## \[([^\]]+)\] (.+?) — (\d{4}) (상반기|하반기) \(([^\n]+)\)\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/gm;
  const yearlyGroups = [];
  for (const match of source.matchAll(groupPattern)) {
    const [, id, role, groupYear, season, employment, body] = match;
    if (Number(groupYear) !== year) throw new Error(`연도 불일치 ${year}/${id}`);
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
      const jobkorea = ['www.jobkorea.co.kr', 'm.jobkorea.co.kr'].includes(url.host) &&
        /\/passassay\/views?(\/\d+)?$/i.test(url.pathname) &&
        (url.searchParams.get('Job_Epil_No') === postId || url.pathname.endsWith(`/${postId}`));
      if (url.protocol !== 'https:' || url.username || url.password || !/^\d+$/.test(postId) || (!linkareer && !jobkorea)) {
        throw new Error(`출처 주소와 게시물 ID가 일치하지 않습니다. ${id}/${pieces[0]}`);
      }
      const answers = [...essay[3].matchAll(/^#### 답변 (\d+)\n([\s\S]*?)(?=^#### 답변 |$(?![\s\S]))/gm)].map(row => ({ number: Number(row[1]), text: row[2].trim() }));
      if (!answers.length || new Set(answers.map(answer => answer.number)).size !== answers.length || answers.some(answer => !answer.text || !questionNumbers.has(answer.number))) {
        throw new Error(`문항·답변 대응 오류 ${id}/${pieces[0]}`);
      }
      essays.push({ id: pieces[0], postId, source: field('출처'), stage: field('합격 단계'), publishedAt: field('게시일'), collectedAt: field('수집일'), url: essay[2], answers });
    }
    if (!questions.length || !essays.length) throw new Error(`빈 묶음 ${id}`);
    yearlyGroups.push({ id, company, role, year, season, employment, questions, essays });
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
