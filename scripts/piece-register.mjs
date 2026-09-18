#!/usr/bin/env node
/**
 * 조각 등록 — 배치를 닫을 때 호스트가 한 번 부른다.
 *
 * 전에는 배치마다 호스트가 python/node 한 줄짜리를 새로 짜서 네 파일을 고쳤다
 * (5~10 분, 한 번은 catalog.json 을 잘못 고쳐 되돌렸다). 판단이 필요 없는 일이라
 * 여기 한 벌로 둔다.
 *
 * 고치는 것:
 *   1. apps/playground/src/catalog.json  — 계획 항목(topic)에 facetId 를 단다
 *   2. taxonomy/taxonomy.json            — 그 하위 분야의 facets 를 카탈로그 순서대로
 *   3. packages/bootstrap/package.json   — devDependencies 에 패키지
 *   4. packages/bootstrap/src/index.ts   — registerFacetLoader 한 줄
 * 그리고 돌리는 것: pnpm install (한 번) · pnpm catalog:gen · pnpm screen:gen
 *
 * 이름은 짐작하지 않고 조각의 파일에서 읽는다 — 패키지 이름은 package.json,
 * facet id 는 facet.ts, 등록 함수는 index.ts.
 *
 * 카탈로그 항목은 디렉터리 이름과 같은 topic id 로 찾는다. 다르면
 * `--topic <디렉터리명>=<topic id>` 로 짝을 준다. 항목이 없으면 멈춘다 — 계획서에
 * 없는 조각을 몰래 넣지 않는다 (`tasks/catalog-scope.md`).
 *
 * 사용: node scripts/piece-register.mjs facets/<domain>/<name> [...]
 *         [--topic <name>=<topicId> ...] [--no-gen]
 *
 * 여러 번 불러도 같은 결과다 — 이미 있는 것은 건너뛴다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(repoRoot, 'apps/playground/src/catalog.json');
const TAXONOMY = join(repoRoot, 'taxonomy/taxonomy.json');
const BOOT_PKG = join(repoRoot, 'packages/bootstrap/package.json');
const BOOT_INDEX = join(repoRoot, 'packages/bootstrap/src/index.ts');

const argv = process.argv.slice(2);
const noGen = argv.includes('--no-gen');
const topicOverride = new Map();
const dirs = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--topic') {
    const [k, v] = (argv[++i] ?? '').split('=');
    if (!k || !v) fail('--topic 은 <디렉터리명>=<topic id> 꼴이다');
    topicOverride.set(k, v);
  } else if (!a.startsWith('--')) dirs.push(a.replace(/\/+$/, ''));
}
if (dirs.length === 0) fail('사용: node scripts/piece-register.mjs facets/<domain>/<name> [...] [--topic name=topicId] [--no-gen]');

function fail(msg) {
  console.error(`piece-register: ${msg}`);
  process.exit(1);
}

/** 조각 파일에서 이름 셋을 읽는다. */
function identify(dir) {
  const name = basename(dir);
  const pkgPath = join(repoRoot, dir, 'package.json');
  if (!existsSync(pkgPath)) fail(`${dir}/package.json 이 없다`);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')).name;
  const facetSrc = readFileSync(join(repoRoot, dir, 'src/facet.ts'), 'utf8');
  const id = /id:\s*'(facet:[A-Za-z0-9]+)'/.exec(facetSrc)?.[1];
  if (!id) fail(`${dir}/src/facet.ts 에서 facet id 를 못 찾았다`);
  const indexSrc = readFileSync(join(repoRoot, dir, 'src/index.ts'), 'utf8');
  const fn = /export function (register[A-Z]\w*)\(\)/.exec(indexSrc)?.[1];
  if (!fn) fail(`${dir}/src/index.ts 에서 export function register…() 를 못 찾았다`);
  return { dir, name, pkg, id, fn, topic: topicOverride.get(name) ?? name };
}

const pieces = dirs.map(identify);

// ── 1. catalog.json
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const touchedSubdomains = new Set();
for (const p of pieces) {
  let found = null;
  for (const d of catalog.domains) {
    for (const s of d.subdomains) {
      for (const t of s.topics) if (t.id === p.topic) found = { d, s, t };
    }
  }
  if (!found) fail(`카탈로그에 topic '${p.topic}' 이 없다 (${p.dir}). 다른 id 면 --topic ${p.name}=<topic id>`);
  const { d, s, t } = found;
  if (t.facetId && t.facetId !== p.id) fail(`topic '${p.topic}' 에 이미 다른 facet 이 있다: ${t.facetId}`);
  if (!t.facetId) t.facetId = p.id;
  touchedSubdomains.add(`${d.id}/${s.id}`);
  p.where = `${d.id}/${s.id}`;
}
writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);

// ── 2. taxonomy.json — 이름이 한 줄에 적힌 손글씨 서식이라 facets 배열만 글자로 갈아 끼운다.
let taxonomy = readFileSync(TAXONOMY, 'utf8');
for (const key of touchedSubdomains) {
  const [domainId, subId] = key.split('/');
  const domain = catalog.domains.find((d) => d.id === domainId);
  const sub = domain.subdomains.find((s) => s.id === subId);
  const ids = sub.topics.flatMap((t) => (t.facetId ? [t.facetId] : []));
  // 분야 안에서 하위 분야를 찾는다 — id 가 전역에서 유일하다는 것에 기대지 않는다.
  const domainAt = taxonomy.indexOf(`"id": "${domainId}"`);
  if (domainAt < 0) fail(`taxonomy.json 에 분야 '${domainId}' 가 없다`);
  const subAt = taxonomy.indexOf(`"id": "${subId}"`, domainAt);
  if (subAt < 0) fail(`taxonomy.json 의 '${domainId}' 에 하위 분야 '${subId}' 가 없다`);
  const open = taxonomy.indexOf('"facets": [', subAt);
  const close = taxonomy.indexOf(']', open);
  const lineStart = taxonomy.lastIndexOf('\n', open) + 1;
  const indent = taxonomy.slice(lineStart, open);
  const body =
    ids.length === 0 ? '[]' : `[\n${ids.map((id) => `${indent}  "${id}"`).join(',\n')}\n${indent}]`;
  taxonomy = `${taxonomy.slice(0, open)}"facets": ${body}${taxonomy.slice(close + 1)}`;
}
writeFileSync(TAXONOMY, taxonomy);

// ── 3. bootstrap package.json
const bootPkg = JSON.parse(readFileSync(BOOT_PKG, 'utf8'));
const dev = bootPkg.devDependencies ?? {};
for (const p of pieces) dev[p.pkg] = 'workspace:*';
bootPkg.devDependencies = Object.fromEntries(Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(BOOT_PKG, `${JSON.stringify(bootPkg, null, 2)}\n`);

// ── 4. bootstrap index.ts — 함수의 마지막 닫는 괄호 앞에 붙인다.
let index = readFileSync(BOOT_INDEX, 'utf8');
const added = [];
for (const p of pieces) {
  if (index.includes(`registerFacetLoader('${p.id}'`)) continue;
  const line = `  registerFacetLoader('${p.id}', () =>\n    import('${p.pkg}').then((m) => m.${p.fn}()),\n  );\n`;
  const end = index.lastIndexOf('\n}');
  if (end < 0) fail('bootstrap index.ts 에서 함수의 끝을 못 찾았다');
  index = `${index.slice(0, end + 1)}${line}${index.slice(end + 1)}`;
  added.push(p.id);
}
writeFileSync(BOOT_INDEX, index);

for (const p of pieces) console.log(`  ${p.id}  ${p.pkg}  ${p.fn}  → ${p.where}/${p.topic}`);
console.log(`등록 ${pieces.length} (새 loader ${added.length})`);

if (!noGen) {
  for (const [cmd, args] of [
    ['pnpm', ['install', '--prefer-offline']],
    ['pnpm', ['catalog:gen']],
    ['pnpm', ['screen:gen']],
  ]) {
    console.log(`== ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', timeout: 300_000, killSignal: 'SIGKILL' });
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-4).join('\n');
    console.log(text);
    if (r.status !== 0) fail(`${cmd} ${args.join(' ')} 실패`);
  }
}
