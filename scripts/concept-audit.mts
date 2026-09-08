/**
 * 개념(concept) 선언 감사기.
 *
 * `useWhen` 이 생기면서 개념 선언에 기계로 잡을 수 있는 실패가 셋 생겼다.
 * 손으로 쉰 개를 훑는 대신 여기서 잡는다.
 *
 *  1. 되풀이 — `useWhen` 이 개념마다 다른 문장이어야 한다는 제약. 두 개념이
 *     같은 말을 하면 그것은 분류 필드에 말을 입힌 것이고, 소비자는 그 분류를
 *     알 이유가 없다.
 *  2. 구성 관여 — "한 절의 얼마를 채워라" 류. 우리는 재료를 줄 뿐이고 그것으로
 *     무엇을 얼마나 만들지는 쓰는 쪽의 결정이다.
 *  3. 분류 어휘 누출 — "piece" / "complete facet" 같은 FACET 내부 말. 소비자는
 *     여러 시각화 제공자를 함께 다루므로 이쪽 사정을 알 이유가 없다.
 *
 * 셋 다 **후보를 뽑아 사람에게 보이는** 도구다. 자동 판정이 아니다 — 낱말이
 * 걸렸다고 위반인 것은 아니어서 (라우팅 테이블의 "several entries" 는 항목
 * 수이지 글의 분량이 아니다) 마지막 판단은 사람이 한다.
 *
 * 실행: pnpm concept:audit
 */

import { CONCEPT_SOURCES } from '../packages/authoring/src/concepts/index.js';

/** 문장 비교용 정규화 — 서식 차이로 되풀이를 놓치지 않게. */
const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 낱말 겹침 비율. 짧은 쪽 기준이라 한쪽이 길어도 포함 관계를 잡는다. */
function overlap(a: string, b: string): number {
  const x = new Set(norm(a).split(' '));
  const y = new Set(norm(b).split(' '));
  let hit = 0;
  for (const w of x) if (y.has(w)) hit += 1;
  return hit / Math.max(1, Math.min(x.size, y.size));
}

// 글의 분량·자리를 가리키는 말만 잡는다. "how many rows" 처럼 화면이 세는
// 것은 분량이 아니므로 낱말 하나로 잡으면 오검출만 쌓인다 (실측 8건 전부
// 그랬다). 글의 단위 명사와 붙어 있을 때만 걸리게 한다.
const CONSTRUCTION =
  /\b(paragraphs?|word count|(a |one |two |three |several )?(sections?|paragraphs?) (of|in) the (article|post|piece)|the (opening|closing|conclusion) of the|the rest of the (article|post)|fill (a|the|one) (section|paragraph|slot in the)|use (it|this) (once|twice|\w+ times)|(at least|at most|no more than) \w+ (of these|screens|visuals))\b/i;
const TAXONOMY = /\b(piece facet|a piece\b|complete facet|finished facet|reactive|projector|facetjson|조각|완제품)\b/i;

type Hit = { where: string; text: string };

const repeats: string[] = [];
const construction: Hit[] = [];
const taxonomy: Hit[] = [];

// ── 1. useWhen 되풀이
const all: { id: string; text: string }[] = [];
for (const c of CONCEPT_SOURCES) {
  for (const u of c.briefing.useWhen) all.push({ id: c.id, text: u });
}
for (let i = 0; i < all.length; i += 1) {
  for (let j = i + 1; j < all.length; j += 1) {
    const a = all[i]!;
    const b = all[j]!;
    if (a.id === b.id && norm(a.text) === norm(b.text)) {
      repeats.push(`${a.id} 안에서 같은 문장이 두 번`);
      continue;
    }
    const r = overlap(a.text, b.text);
    if (r >= 0.7) repeats.push(`${(r * 100) | 0}%  ${a.id} ↔ ${b.id}\n      ${a.text}\n      ${b.text}`);
  }
}

// ── 2·3. 어휘 검사 (briefing 의 모든 문자열)
for (const c of CONCEPT_SOURCES) {
  const fields: [string, string[]][] = [
    ['useWhen', c.briefing.useWhen],
    ['avoidWhen', c.briefing.avoidWhen],
    ['observable', c.briefing.observable],
    ['affordances', c.briefing.screen.affordances],
    ['definition', [c.surface.definition]],
  ];
  for (const [name, list] of fields) {
    for (const text of list) {
      if (CONSTRUCTION.test(text)) construction.push({ where: `${c.id}.${name}`, text });
      if (TAXONOMY.test(text)) taxonomy.push({ where: `${c.id}.${name}`, text });
    }
  }
}

// ── 4. contrastWith 참조 무결성 (index 의 materialize 도 검사하지만 먼저 본다)
const known = new Set(CONCEPT_SOURCES.map((c) => c.id));
const dangling: string[] = [];
for (const c of CONCEPT_SOURCES) {
  for (const x of c.briefing.contrastWith) {
    if (!known.has(x.concept)) dangling.push(`${c.id} → ${x.concept}`);
  }
  if (!known.has(c.id)) continue;
}

// ── 5. 채워지지 않은 자리
const thin: string[] = [];
for (const c of CONCEPT_SOURCES) {
  if (c.briefing.useWhen.length === 0) thin.push(`${c.id}: useWhen 이 비었다`);
  if (c.briefing.avoidWhen.length === 0) thin.push(`${c.id}: avoidWhen 이 비었다`);
  if (c.briefing.observable.length === 0) thin.push(`${c.id}: observable 이 비었다`);
  if (c.briefing.contrastWith.length === 0) thin.push(`${c.id}: contrastWith 가 비었다`);
}

const show = (title: string, lines: string[]): void => {
  console.log(`\n── ${title} (${lines.length})`);
  if (lines.length === 0) console.log('   없음');
  else for (const l of lines) console.log(`   ${l}`);
};

console.log(`개념 ${CONCEPT_SOURCES.length}개 · useWhen ${all.length}항목`);
show('useWhen 되풀이 (겹침 70% 이상)', repeats);
show('글의 구성에 관여하는 말', construction.map((h) => `${h.where}\n      ${h.text}`));
show('분류 어휘 누출', taxonomy.map((h) => `${h.where}\n      ${h.text}`));
show('contrastWith 미선언 참조', dangling);
show('빈 자리', thin);

const failed = repeats.length + dangling.length + thin.length;
console.log(`\n${failed === 0 ? '기계 판정 통과' : `확인 필요 ${failed}건`} · 어휘 후보 ${construction.length + taxonomy.length}건은 사람이 본다`);
process.exit(dangling.length + thin.length > 0 ? 1 : 0);
