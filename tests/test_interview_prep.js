const assert = require('node:assert/strict');
const fs = require('node:fs');
const prep = require('../docs/interview-prep.js');
const catalog = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../docs/interview/catalog.json'),'utf8'));
prep.validateCatalog(catalog);
assert.equal(catalog.items.length,182);
assert.equal(new Set(catalog.items.map(item => item.id)).size,182);
assert(catalog.items.every(item => item.bodyIncluded === false));
assert.equal(catalog.items.filter(item => item.format === 'image').length,6);
const byId = id => catalog.items.find(item => item.id === 'ddan-' + id);
assert.equal(byId(133).primary,'plasma'); // Debye length is not a deposition method.
assert.equal(byId(410).primary,'rf');
assert.equal(byId(411).primary,'vacuum');
assert.equal(byId(398).primary,'cleaning');
assert(byId(398).topics.includes('cmp'));
assert.equal(byId(235).primary,'contact');
assert(byId(235).topics.includes('metal'));
assert.equal(byId(83).primary,'deposition');
assert.equal(byId(85).primary,'metal');
assert.equal(byId(323).primary,'metal');
assert.equal(byId(25).primary,'packaging');
assert.equal(byId(34).primary,'reliability');
assert.equal(byId(280).primary,'photo'); // Low-k1 lithography must not become low-k dielectric material.
assert(!byId(280).topics.includes('materials'));
assert.equal(byId(110).originalTitle.includes('훈련 8'),true); // Training numbers come from titles, not file counters.
assert.equal(byId(9).originalTitle.includes('훈련 5'),true);
assert.equal(byId(7).originalTitle.includes('훈련 4'),true);
const photoSequence = prep.filterItems(catalog,{ topic:'photo' }).filter(item => /훈련\s*:?\s*\d+/.test(item.originalTitle)).map(item => Number(item.originalTitle.match(/훈련\s*:?\s*(\d+)/)[1]));
assert.deepEqual(photoSequence,[1,2,3,4,5,6,7,8,9,10]);
const cmp = prep.filterItems(catalog,{ topic:'cmp' });
assert(cmp.some(item => item.id === 'ddan-398'));
assert.equal(new Set(cmp.map(item => item.id)).size,cmp.length);
assert(prep.filterItems(catalog,{ group:'equipment', topic:'rf' }).every(item => item.topics.includes('rf')));
assert.deepEqual(prep.filterItems(catalog,{search:'핀펫'}).map(item => item.id),['ddan-66']);
assert.deepEqual(prep.filterItems(catalog,{search:'LCR'}).map(item => item.id),['ddan-33']);
assert.deepEqual(prep.filterItems(catalog,{search:'TSV'}).map(item => item.id),['ddan-25']);
assert.equal(prep.filterItems(catalog,{search:'존재하지않는검색어'}).length,0);
assert(prep.filterItems(catalog,{topic:'photo',search:'EUV'}).length > 1);

// Learning routes select existing material in a deliberate reading order.
assert.equal(catalog.studyGuide.priorities.length,6);
assert.equal(catalog.studyGuide.reviewedPostIds.length,27);
for (const stage of catalog.studyGuide.stages) {
  assert.deepEqual(prep.filterItems(catalog,{stage:stage.id}).map(item => item.id),stage.posts.map(post => 'ddan-' + post));
}
assert.equal(prep.filterItems(catalog,{stage:'core',topic:'photo'}).length,1);
assert(prep.filterItems(catalog,{stage:'core',search:'존재하지않는검색어'}).length === 0);
assert.match(byId(308).title,/산화·확산·열처리/);
assert.match(byId(213).reviewNote.text,/양·음/);
assert.match(byId(197).reviewNote.text,/저자가 만든 예시/);
assert.equal(catalog.items.filter(item => item.reviewNote).length,4);
assert(prep.filterItems(catalog,{search:'Diffusion'}).some(item => item.id === 'ddan-308')); // Original title remains searchable after retitling.
const badRoute = JSON.parse(JSON.stringify(catalog)); badRoute.studyGuide.stages[0].posts.push(999999);
assert.throws(() => prep.validateCatalog(badRoute));
const badGuideSource = JSON.parse(JSON.stringify(catalog)); badGuideSource.studyGuide.sources[0].url='javascript:alert(1)';
assert.throws(() => prep.validateCatalog(badGuideSource));
const badReviewSource = JSON.parse(JSON.stringify(catalog)); badReviewSource.items.find(item => item.reviewNote).reviewNote.sources.push('missing');
assert.throws(() => prep.validateCatalog(badReviewSource));

// Notes are user-owned material, never article bodies or automatically graded answers.
const current = { version:1, notes:{ 'ddan-4': { answer:'직접 정리한 첫 답변', memo:'분해능 조건 다시 확인', status:'review', starred:true } } };
assert.equal(prep.filterItems(catalog,{state:'starred'},current.notes).length,1);
assert.equal(prep.filterItems(catalog,{state:'written'},current.notes).length,1);
assert.equal(prep.filterItems(catalog,{state:'done'},current.notes).length,0);
assert.match(prep.noteText(byId(4),current.notes['ddan-4']),/\[내 답변\]\n직접 정리한 첫 답변/);
assert.doesNotMatch(prep.noteText(byId(4),current.notes['ddan-4']),/모범답안|정답|원문 전문/);
const incoming = { version:1, notes:{ 'ddan-4':{ answer:'백업의 다른 답변', memo:'백업 메모', status:'done', starred:false } } };
const merged = prep.mergeState(current,incoming);
assert.match(merged.notes['ddan-4'].answer,/직접 정리한 첫 답변/);
assert.match(merged.notes['ddan-4'].answer,/백업의 다른 답변/);
assert.equal(merged.notes['ddan-4'].status,'review');
assert.equal(merged.notes['ddan-4'].starred,true);
assert.equal(current.notes['ddan-4'].answer,'직접 정리한 첫 답변');
assert.equal(prep.mergeState(merged,incoming).notes['ddan-4'].answer,merged.notes['ddan-4'].answer);
assert.throws(() => prep.mergeState(current,{ version:2, notes:{} }));
assert.throws(() => prep.normalizeState({ version:1, notes:{ '__proto__':null, bad:{ answer:1 } } }));
const malicious = JSON.parse(JSON.stringify(catalog)); malicious.items[0].url='javascript:alert(1)';
assert.throws(() => prep.validateCatalog(malicious));
console.log('Interview prep: catalog classification, source-only boundaries, filters and non-destructive notes backup passed');
