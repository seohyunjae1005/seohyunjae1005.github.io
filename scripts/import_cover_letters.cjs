const fs = require('node:fs');
const path = require('node:path');
const input = process.argv[2];
if (!input) throw new Error('연도별 Markdown 폴더를 지정하세요.');
const groups = [];
for (const year of Array.from({ length: 9 }, (_, index) => 2018 + index)) {
  const source = fs.readFileSync(path.join(input, `${year}.md`), 'utf8').replace(/\r\n/g, '\n');
  const groupPattern = /^## \[([^\]]+)\] (.+?) — (\d{4}) (상반기|하반기) \(([^\n]+)\)\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/gm;
  let parsedAnswers = 0;
  for (const match of source.matchAll(groupPattern)) {
    const [, id, role, groupYear, season, employment, body] = match;
    const questionSection = body.split(/^--- 자소서 /m)[0];
    const questions = [...questionSection.matchAll(/^### 문항 (\d+) \(글자 수 제한: (.*?)\)\n([\s\S]*?)(?=^### 문항 |^---|$(?![\s\S]))/gm)].map(row => ({ number: Number(row[1]), limit: row[2].trim(), text: row[3].trim() }));
    const essays = [];
    for (const essay of body.matchAll(/^--- 자소서 ([^\n]+)\n원문: (https?:\/\/[^\s]+)\n([\s\S]*?)(?=^--- 자소서 |$(?![\s\S]))/gm)) {
      const pieces = essay[1].split(' | ');
      const field = label => pieces.find(value => value.startsWith(label + ' '))?.slice(label.length + 1) || '미확인';
      const answers = [...essay[3].matchAll(/^#### 답변 (\d+)\n([\s\S]*?)(?=^#### 답변 |$(?![\s\S]))/gm)].map(row => ({ number: Number(row[1]), text: row[2].trim() }));
      if (answers.some(answer => !answer.text || !questions.some(q => q.number === answer.number))) throw new Error(`문항·답변 대응 오류 ${id}`);
      parsedAnswers += answers.length;
      essays.push({ id: pieces[0], postId: field('게시물 ID'), source: field('출처'), stage: field('합격 단계'), publishedAt: field('게시일'), collectedAt: field('수집일'), url: essay[2], answers });
    }
    if (!questions.length || !essays.length) throw new Error(`빈 묶음 ${id}`);
    groups.push({ id, company: 'SK하이닉스', role, year: Number(groupYear), season, employment, questions, essays });
  }
  const originalAnswers = [...source.matchAll(/^#### 답변 /gm)].length;
  if (originalAnswers !== parsedAnswers) throw new Error(`${year} 답변 누락 ${parsedAnswers}/${originalAnswers}`);
}
const essayIds = groups.flatMap(group => group.essays.map(essay => essay.id));
if (new Set(essayIds).size !== essayIds.length) throw new Error('중복 게시물 ID');
const counts = { groups: groups.length, essays: essayIds.length, answers: groups.reduce((sum, group) => sum + group.essays.reduce((n, essay) => n + essay.answers.length, 0), 0) };
if (counts.groups !== 39 || counts.essays !== 40 || counts.answers !== 147) throw new Error(`원본 README 집계 불일치 ${JSON.stringify(counts)}`);
const output = path.resolve(__dirname, '../docs/library/skhynix-yangsan.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ version: 1, company: 'SK하이닉스', importedAt: '2026-11-09', counts, groups }, null, 2) + '\n');
console.log(JSON.stringify(counts));
