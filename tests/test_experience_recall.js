const assert = require('node:assert/strict');
const recall = require('../docs/experience-recall.js');
const profile = require('../docs/profile-store-v2.js');
const draft = {
  Equipment0: { status: 'yes', detail: '누락 서류를 확인하고 담당자에게 전달했다.' },
  Equipment1: { status: 'unsure', detail: '수리 경험이 있었던 것 같다.' },
  Equipment2: { status: 'yes', detail: '' },
  Quality0: { status: 'no', detail: '검사 경험 없음' },
};
const confirmed = recall.confirmedAnswers(draft);
assert.match(confirmed, /누락 서류/);
assert.doesNotMatch(confirmed, /수리 경험|검사 경험/);
const normalized = profile.normalize({ experiences: [{ title: '행정 지원', recallDraft: JSON.stringify(draft), confirmedRecall: confirmed, angleEquipment: '장비 고객 이슈 전달 관점으로 작성' }] });
assert.equal(normalized.experiences[0].angleEquipment, '장비 고객 이슈 전달 관점으로 작성');
const text = profile.toExperienceText(normalized);
assert.match(text, /누락 서류/);
assert.doesNotMatch(text, /장비 고객|수리 경험|Equipment0/);
assert.match(recall.template(normalized.experiences[0]), /기억 꺼내기/);
assert.match(recall.template({ title: '<script>' , confirmedRecall: '<img onerror=x>'}), /&lt;img/);
console.log('Experience recall: confirmation boundaries and profile preservation passed');
