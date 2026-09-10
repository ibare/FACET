/**
 * facet 문안의 locale 실태 점검.
 *
 * 실행: pnpm i18n:audit
 *
 * 세 가지를 본다.
 *
 *  1. **locale 폭** — `FacetJson.messages` · `title` · `description` 이 열 언어를
 *     모두 채웠는가. `S-piece` 는 조각이 en·ko 로 *시작해도* 된다고 하되 20종을
 *     넘거나 외부 호스트에 채택되면 열로 맞추라 했다. 조각은 120 종이고
 *     `@ffacet/*` 는 외부 호스트가 쓰는 배포물이라 두 조건이 모두 걸렸다.
 *  2. **선언 없이 부르는 키** — facet 코드가 `t('caption.empty', 'Nothing…')` 을
 *     부르는데 `facet.ts` 에 그 키가 없으면 조회가 3층(코드의 en 원본)까지
 *     떨어진다. 한국어로 보는 사람 화면에 영어 한 줄이 튄다. 프레임워크 키
 *     (`messages/en.json`) 는 번들이 받아 주므로 대상이 아니다.
 *  3. **description 누락** — 카탈로그 엔트리의 설명이 비어 호스트 목록에서
 *     제목만 뜬다.
 *
 * 2 를 처음 잴 때 `tr(` 만 찾다가 여섯을 놓칠 뻔했다. stage view 는 `params.t` 를
 * 받아 `t(` 로 부른다. 둘 다 본다.
 *
 * 이 스크립트는 소스를 읽어 재는 것이라 facet 을 로드하지 않는다. 검사
 * (`test/facet-i18n.test.ts`) 와 같은 것을 보되, 이쪽은 고치는 동안 진행률을
 * 보려고 쓴다 — 검사는 통과/실패만 말한다.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 저장소가 번역 번들을 갖춘 열 언어. `messages/*.json` 과 같다. */
export const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'] as const;

export type FacetFacts = {
  /** `<domain>/<name>` */
  path: string;
  domain: string;
  piece: boolean;
  /** messages 키 → 그 키가 채운 locale */
  keyLocales: Map<string, Set<string>>;
  titleLocales: Set<string>;
  descLocales: Set<string>;
  /** 코드가 부르는데 facet.ts 에도 프레임워크 번들에도 없는 키 */
  undeclared: string[];
  /** `<키> <locale>` → 그 문안이 쓴 플레이스홀더를 정렬해 이은 것. 없으면 빈 문자열. */
  placeholders: Map<string, string>;
};

/** `이름: {` 블록의 중괄호 균형을 세어 잘라낸다. */
function block(text: string, label: string): string {
  const i = text.indexOf(label);
  if (i < 0) return '';
  const j = text.indexOf('{', i);
  if (j < 0) return '';
  let depth = 0;
  for (let k = j; k < text.length; k += 1) {
    if (text[k] === '{') depth += 1;
    else if (text[k] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(j, k + 1);
    }
  }
  return text.slice(j);
}

function localesIn(seg: string): Set<string> {
  const out = new Set<string>();
  for (const l of LOCALES) if (new RegExp(`\\b${l}\\s*:`).test(seg)) out.add(l);
  return out;
}

/** 한 문안이 쓴 `{이름}` 을 정렬해 잇는다. 번역이 빠뜨렸는지 견주는 자다. */
function placeholdersOf(text: string): string {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort().join(',');
}

/** 한 locale 표에서 `locale: '문안'` 을 뽑는다. 여는 따옴표에 맞춰 닫는 것을 찾는다. */
function entriesOf(table: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of LOCALES) {
    const m = new RegExp(`\\b${l}\\s*:\\s*(['"\`])`).exec(table);
    if (!m) continue;
    const q = m[1]!;
    const from = m.index + m[0].length;
    let s = '';
    for (let i = from; i < table.length; i += 1) {
      if (table[i] === '\\\\') { s += table[i + 1] ?? ''; i += 1; continue; }
      if (table[i] === q) break;
      s += table[i];
    }
    out.set(l, s);
  }
  return out;
}

/**
 * 세그먼트 안의 LocaleStr 표를 전부 찾는다. **이름이 아니라 모양으로 가른다** —
 * `키: { ... }` 블록이 `en:` 을 직접 가지면 LocaleStr 이고, 아니면 그 안으로
 * 한 단계 더 들어간다.
 *
 * 처음에는 `messages` 안의 들여쓰기 4칸 키만 셌는데, `blocks` 안의 메트릭·코드
 * 패널 `label` 도 LocaleStr 이라는 것을 배치 도중에 알았다. 353 개가 거기 있었고
 * 그중 113 개가 두 언어 모자랐다. **한 자리만 이름으로 짚으면 나머지 자리는
 * 영영 안 보인다.**
 *
 * 모양으로 가르되 중괄호 균형을 세어 자른다. `{ ... }` 를 정규식 한 방으로 잡으려
 * 하면 플레이스홀더 `{k}` 가 든 문안에서 끊겨 그 표를 통째로 놓친다.
 */
function scanLocaleTables(
  seg: string,
  prefix: string,
  locales: Map<string, Set<string>>,
  placeholders: Map<string, string>,
): void {
  const re = /(?:'([^']+)'|([A-Za-z][\w.]*))\s*:\s*\{/g;
  for (const m of seg.matchAll(re)) {
    const key = m[1] ?? m[2]!;
    const table = block(seg.slice(m.index! + m[0].length - 1), '');
    if (table === '') continue;
    const name = prefix === '' ? key : `${prefix}.${key}`;
    const here = localesIn(table);
    if (here.has('en')) {
      locales.set(name, here);
      for (const [l, text] of entriesOf(table)) placeholders.set(`${name} ${l}`, placeholdersOf(text));
    } else {
      // LocaleStr 이 아니라 구조다. 한 단계 안으로.
      scanLocaleTables(table.slice(1, -1), name, locales, placeholders);
    }
  }
}

function keyLocalesOf(seg: string, prefix = ''): { locales: Map<string, Set<string>>; placeholders: Map<string, string> } {
  const locales = new Map<string, Set<string>>();
  const placeholders = new Map<string, string>();
  scanLocaleTables(seg, prefix, locales, placeholders);
  return { locales, placeholders };
}

const CALL = /\b(?:tr|t)\(\s*'([^']+)'/g;
const KCALL = /\b(?:tr|t)\(\s*K\.(\w+)/g;

export function collect(): FacetFacts[] {
  const framework = new Set(
    Object.keys(JSON.parse(readFileSync(join(repoRoot, 'messages/en.json'), 'utf8')) as Record<string, unknown>),
  );
  const facetsRoot = join(repoRoot, 'facets');
  const rows: FacetFacts[] = [];

  for (const domain of readdirSync(facetsRoot)) {
    let names: string[];
    try {
      names = readdirSync(join(facetsRoot, domain));
    } catch {
      continue;
    }
    for (const name of names) {
      const src = join(facetsRoot, domain, name, 'src');
      const facetFile = join(src, 'facet.ts');
      if (!existsSync(facetFile)) continue;
      const text = readFileSync(facetFile, 'utf8');
      const messagesSeg = block(text, 'messages:');
      const { locales: keyLocales, placeholders } = keyLocalesOf(messagesSeg);
      // blocks 안의 메트릭·코드 패널 label 도 LocaleStr 이다.
      const fromBlocks = keyLocalesOf(block(text, 'blocks:'), 'blocks');
      for (const [k, v] of fromBlocks.locales) keyLocales.set(k, v);
      for (const [k, v] of fromBlocks.placeholders) placeholders.set(k, v);

      // 코드가 부르는 키를 모은다.
      const used = new Set<string>();
      for (const file of readdirSync(src)) {
        if (!file.endsWith('.ts') || file === 'facet.ts') continue;
        const t = readFileSync(join(src, file), 'utf8');
        for (const m of t.matchAll(CALL)) used.add(m[1]!);
        const km = /const K\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(t);
        const table = new Map<string, string>();
        if (km) for (const e of km[1]!.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) table.set(e[1]!, e[2]!);
        for (const m of t.matchAll(KCALL)) {
          const key = table.get(m[1]!);
          if (key !== undefined) used.add(key);
        }
      }

      rows.push({
        path: `${domain}/${name}`,
        domain,
        piece: text.includes('@piece'),
        keyLocales,
        titleLocales: localesIn(block(text, 'title:')),
        descLocales: localesIn(block(text, 'description:')),
        undeclared: [...used].filter((k) => !keyLocales.has(k) && !framework.has(k)).sort(),
        placeholders,
      });
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/** facet 하나에서 빠진 (키, locale) 짝의 수. title·description 도 한 단위로 센다. */
export function missingCount(f: FacetFacts): number {
  let n = 0;
  for (const set of [f.titleLocales, f.descLocales, ...f.keyLocales.values()]) {
    n += LOCALES.filter((l) => !set.has(l)).length;
  }
  return n;
}

function main(): void {
  const rows = collect();
  const P = (s = '') => process.stdout.write(s + '\n');

  const pieces = rows.filter((r) => r.piece);
  P(`facet ${rows.length} (조각 ${pieces.length} · 완제품 ${rows.length - pieces.length})`);

  const undeclared = rows.filter((r) => r.undeclared.length > 0);
  P(`\n── 선언 없이 부르는 키 (${undeclared.length})`);
  for (const r of undeclared) P(`   ${r.path}: ${r.undeclared.join(', ')}`);

  const noDesc = rows.filter((r) => r.descLocales.size === 0);
  P(`\n── description 없음 (${noDesc.length})`);
  for (const r of noDesc) P(`   ${r.path}`);

  const short = rows.filter((r) => missingCount(r) > 0);
  const total = short.reduce((a, r) => a + missingCount(r), 0);
  P(`\n── locale 미달 facet ${short.length} · 빠진 문안 ${total.toLocaleString()}`);
  const byDomain = new Map<string, { n: number; miss: number }>();
  for (const r of short) {
    const e = byDomain.get(r.domain) ?? { n: 0, miss: 0 };
    e.n += 1;
    e.miss += missingCount(r);
    byDomain.set(r.domain, e);
  }
  for (const [d, e] of [...byDomain].sort((a, b) => b[1].miss - a[1].miss)) {
    P(`   ${d.padEnd(26)} facet ${String(e.n).padStart(3)} · 문안 ${String(e.miss).padStart(5)}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) main();
