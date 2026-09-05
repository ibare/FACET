/**
 * en 메시지 원본 추출기.
 *
 * 실행: pnpm messages:gen
 *
 * 소스에서 `tr(K.<name>, '<en 원본>')` 호출을 스캔해 `messages/en.json` 을 만든다.
 * 이 파일이 호스트 번역 파이프라인의 입력이며, translationTargets (en 을 제외한
 * 9개 언어) 번들이 그 산출물이다.
 *
 * 키는 각 파일의 `const K = { ... } as const` 선언에서 해석한다. 키를 리터럴로
 * 직접 넘긴 호출도 함께 수집한다.
 *
 * 누락 검출: messages/ko.json 처럼 이미 있는 번들과 대조해, en 에 없는 키(고아)와
 * 번역이 빠진 키를 보고한다.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outFile = join(repoRoot, 'messages/en.json');

const SCAN_ROOTS = ['facets', 'packages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test', '.git']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** `const K = { name: 'key.path', ... } as const` → { name: 'key.path' } */
function parseKeyMap(src: string): Record<string, string> {
  const map: Record<string, string> = {};
  const block = /const K = \{([\s\S]*?)\} as const;/.exec(src);
  if (!block) return map;
  for (const m of block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) map[m[1]] = m[2];
  return map;
}

/**
 * `tr(K.name, 'fallback')` / `tr('key', "fallback")` 수집.
 *
 * en 원본에 apostrophe 가 들어가면 큰따옴표로 감싸게 되므로 두 따옴표를 모두 받는다.
 * 백틱은 받지 않는다 — 템플릿 리터럴은 `${}` 보간을 부르는데, 보간은 vars 로만
 * 넘겨야 번역문에서 어순을 바꿀 수 있기 때문이다.
 */
function collect(src: string, keyMap: Record<string, string>): Record<string, string> {
  const found: Record<string, string> = {};
  const call =
    /\btr\(\s*(?:K\.(\w+)|'([^']+)'|"([^"]+)")\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  for (const m of src.matchAll(call)) {
    const key = m[1] ? keyMap[m[1]] : (m[2] ?? m[3]);
    if (!key) continue;
    const raw = m[4] ?? m[5] ?? '';
    found[key] = raw.replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return found;
}

const messages: Record<string, string> = {};
let fileCount = 0;
for (const root of SCAN_ROOTS) {
  const dir = join(repoRoot, root);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('tr(')) continue;
    const found = collect(src, parseKeyMap(src));
    if (Object.keys(found).length === 0) continue;
    fileCount += 1;
    Object.assign(messages, found);
  }
}

const sorted = Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`[messages] ${Object.keys(sorted).length}개 키 / ${fileCount}개 파일 → messages/en.json`);

// 기존 번들과 대조
const messagesDir = join(repoRoot, 'messages');
for (const f of readdirSync(messagesDir)) {
  if (!f.endsWith('.json') || f === 'en.json') continue;
  const locale = f.replace('.json', '');
  const bundle = JSON.parse(readFileSync(join(messagesDir, f), 'utf8')) as Record<string, string>;
  const orphans = Object.keys(bundle).filter((k) => !(k in sorted));
  const missing = Object.keys(sorted).filter((k) => !(k in bundle));
  const parts: string[] = [];
  if (orphans.length) parts.push(`고아 ${orphans.length}건 (${orphans.slice(0, 3).join(', ')}…)`);
  if (missing.length) parts.push(`미번역 ${missing.length}건 (${missing.slice(0, 3).join(', ')}…)`);
  console.log(`[messages] ${locale}: ${parts.length ? parts.join(' / ') : '완전 일치'}`);
}
