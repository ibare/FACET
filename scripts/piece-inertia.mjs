#!/usr/bin/env node
/**
 * 조각 관성 계측기.
 *
 * 조각을 여러 개 한꺼번에 만들면 앞 조각의 골격이 복제된다. 두 번 겪었고
 * (발췌 15종, 조각 6종) 둘 다 눈이 아니라 실측으로 잡았다. 그 실측을 스크립트로
 * 옮긴 것이다 — 사람에게 보이기 전에 여기서 먼저 거른다.
 *
 * 재는 것 넷:
 *   1. 코드 유사도   — stage 파일을 정규화해 토큰 3-gram 자카드
 *   2. 좌표 겹침     — 숫자 상수 집합의 자카드
 *   3. 그림 어휘     — 묶음 전체가 쓴 SVG 원소 종류
 *   4. 운동          — 위치/변형 애니메이션을 쓰는 조각 수
 *
 * 사용: node scripts/piece-inertia.mjs <stage 파일...>
 *       node scripts/piece-inertia.mjs facets/security/*&#47;src/*-stage.ts
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const SVG_ELEMENTS = ['rect', 'text', 'line', 'circle', 'ellipse', 'path', 'polyline', 'polygon', 'g'];
// 요소가 실제로 자리를 옮기거나 모양이 변하는 신호. opacity 만으로는 운동이 아니다 (S-piece).
const MOTION = /transform|translate|\bcx\b|\bcy\b|\.x\s*=|\.y\s*=|setAttribute\(\s*['"](x|y|cx|cy|d|points|transform)['"]/;

function normalize(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, ' STR ')
    .replace(/\b\d+(\.\d+)?\b/g, ' NUM ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ngrams = (s, n = 3) => {
  const t = s.split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(' '));
  return out;
};

const jaccard = (a, b) => {
  if (a.size === 0 && b.size === 0) return 1;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / (a.size + b.size - hit);
};

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('stage 파일을 둘 이상 넘겨야 한다.');
  process.exit(2);
}

const items = files.map((f) => {
  const src = readFileSync(f, 'utf8');
  const norm = normalize(src);
  return {
    name: basename(f).replace(/-stage\.ts$/, ''),
    grams: ngrams(norm),
    nums: new Set((src.match(/\b\d{2,}\b/g) ?? []).map(Number).filter((n) => n >= 10 && n <= 2000)),
    elements: new Set(SVG_ELEMENTS.filter((e) => new RegExp(`['"]${e}['"]`).test(src))),
    motion: MOTION.test(src),
  };
});

let worstSim = 0, worstPair = '', worstNum = 0, worstNumPair = '';
const pairs = [];
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const sim = jaccard(items[i].grams, items[j].grams);
    const num = jaccard(items[i].nums, items[j].nums);
    pairs.push({ a: items[i].name, b: items[j].name, sim, num });
    if (sim > worstSim) { worstSim = sim; worstPair = `${items[i].name} ↔ ${items[j].name}`; }
    if (num > worstNum) { worstNum = num; worstNumPair = `${items[i].name} ↔ ${items[j].name}`; }
  }
}

const vocab = new Set(items.flatMap((i) => [...i.elements]));
const moving = items.filter((i) => i.motion).length;
const avgSim = pairs.reduce((s, p) => s + p.sim, 0) / pairs.length;

console.log(`조각 ${items.length}개 · 짝 ${pairs.length}개\n`);
console.log('상위 5쌍 (코드 유사도)');
for (const p of [...pairs].sort((x, y) => y.sim - x.sim).slice(0, 5)) {
  console.log(`  ${p.sim.toFixed(2)}  좌표 ${p.num.toFixed(2)}  ${p.a} ↔ ${p.b}`);
}
console.log(`\n평균 코드 유사도   ${avgSim.toFixed(2)}`);
console.log(`최고 코드 유사도   ${worstSim.toFixed(2)}  (${worstPair})`);
console.log(`최고 좌표 겹침     ${worstNum.toFixed(2)}  (${worstNumPair})`);
console.log(`그림 어휘          ${vocab.size}종  [${[...vocab].join(' ')}]`);
console.log(`운동 있는 조각     ${moving}/${items.length}`);

// 임계의 근거: 서로 복제하지 않고 만들어진 완결형 stage 다섯을 조각과 같은
// 길이(326줄)로 잘라 재면 평균 0.29 · 최고 0.43 · 어휘 6종 · 운동 4/5 였다.
// 거기에 여유를 준 값이다. 조각 아홉(2026-09-07)은 평균 0.49 · 최고 0.69 로
// 이 선을 넘는다 — 임계는 현재 상태가 아니라 목표선이다.
const THRESHOLD = { maxSim: 0.50, avgSim: 0.35, maxNum: 0.60, minVocab: 5, minMotionRatio: 0.7 };
const fail = [];
if (worstSim > THRESHOLD.maxSim) fail.push(`최고 코드 유사도 ${worstSim.toFixed(2)} > ${THRESHOLD.maxSim}`);
if (avgSim > THRESHOLD.avgSim) fail.push(`평균 코드 유사도 ${avgSim.toFixed(2)} > ${THRESHOLD.avgSim}`);
if (worstNum > THRESHOLD.maxNum) fail.push(`최고 좌표 겹침 ${worstNum.toFixed(2)} > ${THRESHOLD.maxNum}`);
if (vocab.size < THRESHOLD.minVocab) fail.push(`그림 어휘 ${vocab.size}종 < ${THRESHOLD.minVocab}`);
if (moving / items.length < THRESHOLD.minMotionRatio) fail.push(`운동 ${moving}/${items.length} < ${THRESHOLD.minMotionRatio}`);

console.log();
if (fail.length === 0) {
  console.log('PASS — 관성 징후 없음');
} else {
  console.log('FAIL — 관성 징후');
  for (const f of fail) console.log(`  · ${f}`);
  process.exitCode = 1;
}
