const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bank = require('../docs/experience-question-bank.js');
const organizer = require('../docs/experience-organizer.js');

// A single experience keeps both professional views and each question type without mixing facts in export.
const draft = organizer.createDraft();
draft.title = '진행 중인 제작 과제';
draft.answers = {
  context: '패턴 제작을 함께 배우고 있다.', role: '제작 제안과 공동 관찰을 했다.',
  'expertise.action': '노광량 변경을 제안했다. 비교는 아직 진행 중이다.',
  'chip.criterion': '패턴 선폭과 균일도를 비교하려 한다.',
  'equipment.sequence': '장비 고장 점검은 수행하지 않았다.',
  'teamwork.proposal': '팀원에게 비교 조건을 함께 정하자고 제안했다.',
  result: '현재까지 현상 후 모양만 관찰했다.', next: '추가 제작과 측정은 이후 계획이다.',
};
let state = { version: 2, active: draft.id, drafts: [draft] };
state = organizer.normalizeState(JSON.parse(JSON.stringify(state)));
assert.equal(state.drafts[0].answers['equipment.sequence'], draft.answers['equipment.sequence']);
let output = organizer.buildText(draft);
assert.match(output, /칩메이커/);
assert.match(output, /패턴 선폭과 균일도/);
assert.doesNotMatch(output, /장비 고장 점검|팀원에게 비교 조건/);
assert.match(output, /계획·미확인/);
assert.match(output, /현재까지 현상 후 모양만 관찰/);
draft.track = 'equipment';
output = organizer.buildText(draft);
assert.match(output, /장비 고장 점검은 수행하지 않았다/);
assert.doesNotMatch(output, /패턴 선폭과 균일도/);
assert.equal(draft.answers['chip.criterion'], '패턴 선폭과 균일도를 비교하려 한다.');
draft.theme = 'teamwork';
output = organizer.buildText(draft);
assert.match(output, /팀원에게 비교 조건/);
assert.doesNotMatch(output, /장비 고장 점검|노광량 변경을 제안했다/);

// Personality and service experiences do not acquire factory repair questions through the target switch.
for (const theme of ['teamwork', 'challenge', 'personality', 'communication']) {
  draft.theme = theme;
  const chip = bank.questionGroups({ ...draft, track: 'chipmaker' }).flatMap(g => g.questions.map(q => q.id));
  const equipment = bank.questionGroups({ ...draft, track: 'equipment' }).flatMap(g => g.questions.map(q => q.id));
  assert.deepEqual(chip, equipment);
  assert(!chip.some(key => /^(chip|equipment)\./.test(key)));
}
const service = bank.questionGroups({ ...draft, theme: 'expertise', activity: 'work' });
assert(!service.some(group => group.id === 'track'));

// Read-only references are not applicant facts; the AI package preserves scope and plans.
draft.theme = 'expertise';
draft.company = '지원 회사';
draft.question = '문제를 해결한 경험을 설명해 주세요.';
const prompt = organizer.buildAiPrompt(draft);
assert.match(prompt, /답할 문항: 문제를 해결한 경험/);
assert.match(prompt, /입력한 사실/);
assert.match(prompt, /진행 중인 일을 완료한 성과로 바꾸지/);
assert.match(prompt, /추가 제작과 측정은 이후 계획/);
assert.doesNotMatch(prompt, /500|5\.36|30114|36333|https:\/\/linkareer/);
draft.stage = 'complete';
assert.match(organizer.buildText(draft), /\[계획·미확인\]/);

// Earlier four-field notes are retained verbatim, with the original incomplete-stage meaning.
const legacy = { version: 1, active: 'old', drafts: [{ id: 'old', title: '이전 경험', theme: 'expertise', activity: 'academic', stage: 'proposal',
  notes: ['맡은 일 원문', '판단 원문', '제안 원문', '현재 반응 원문'], next: '앞으로 실제 실험' }] };
const migrated = organizer.migrateLegacy(legacy);
assert.deepEqual(migrated.drafts[0].legacy.notes, legacy.drafts[0].notes);
assert.match(organizer.buildText(migrated.drafts[0]), /완료한 준비·제안\n제안 원문/);
assert.match(organizer.buildText(migrated.drafts[0]), /현재까지 확인한 내용\n현재 반응 원문/);
assert(!Object.values(migrated.drafts[0].answers).length);
const storage = { getItem(key) { return key === organizer.legacyKey ? JSON.stringify(legacy) : null; } };
assert.equal(organizer.loadState(storage).state.drafts[0].id, 'old');
assert.equal(organizer.loadState({ getItem() { throw new Error('blocked'); } }).readError, true);
assert.equal(organizer.loadState({ getItem() { return '{broken'; } }).readError, true);
assert.throws(() => organizer.migrateLegacy({ ...legacy, drafts: [{ ...legacy.drafts[0], notes: ['missing'] }] }));

// Imports merge instead of replacing an existing experience; invalid input is rejected before mutation.
const incoming = JSON.parse(JSON.stringify(state));
incoming.drafts[0].answers.context = '이름은 같지만 수정된 백업';
const merged = organizer.mergeState(state, incoming);
assert.equal(merged.drafts.length, 2);
assert.equal(merged.drafts[0].answers.context, '패턴 제작을 함께 배우고 있다.');
assert.equal(merged.drafts[1].answers.context, '이름은 같지만 수정된 백업');
assert.notEqual(merged.drafts[0].id, merged.drafts[1].id);
assert.equal(organizer.mergeState(state, JSON.parse(JSON.stringify(state))).drafts.length, 1);
assert.throws(() => organizer.mergeState(state, { version: 2, drafts: [] }));
assert.equal(state.drafts.length, 1);
assert.equal(organizer.hasContent(organizer.createDraft()), false);

// Every question and its source points to an answer actually present in the stored library.
const companyFiles = { 'SK하이닉스': 'skhynix-yangsan', '삼성전자': 'samsung-process', AMAT: 'amat-service', ASML: 'asml-service', TEL: 'tel-service' };
for (const source of Object.values(bank.sources)) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/library', companyFiles[source.company] + '.json'), 'utf8'));
  const essay = data.groups.flatMap(group => group.essays).find(row => String(row.postId) === source.post);
  assert(essay, `source post ${source.post}`);
  assert(essay.answers.some(answer => answer.number === source.number), `source answer ${source.post} Q${source.number}`);
}
for (const theme of Object.keys(bank.themes)) for (const activity of Object.keys(bank.activities)) for (const track of Object.keys(bank.tracks)) {
  const groups = bank.questionGroups({ ...organizer.createDraft(), theme, activity, track });
  const questions = groups.flatMap(group => group.questions);
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  assert(questions.every(q => q.refs.length && q.refs.every(ref => bank.sources[ref])));
}
console.log('Experience organizer: view boundaries, plans, migration, backup merge and source references passed');
