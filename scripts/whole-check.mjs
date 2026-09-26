#!/usr/bin/env node
/**
 * 완제품 검사 — 완제품(projector facet) 하나(또는 몇)를 좁혀 한 번에 잰다.
 *
 * 완제품 에이전트가 끝내기 전에 스스로 돌린다. `piece-check` 의 짝이다. 2026-09-18 배치에서
 * 완제품 에이전트는 계약 카드도 검사 명령도 없이 돌았다 — 에이전트마다 규칙 문서 · core 소스를
 * 처음부터 읽고(첫 파일까지 4~7 분), 어떤 전수 검사가 있는지 테스트를 읽어 알아내고, 자체 검증을
 * facet 테스트로 새로 짰다 (vitest 187 회 · 합 46 분). 그 공통분을 여기 한 명령으로 둔다.
 *
 * 하는 일:
 *   1. 파일 구성과 선언 — 정적으로 본다 (S-facet · C2 · C3 · C4 · C6 · C8 · C9 · C10 · S-view)
 *   2. tsc — 그 패키지만 (src 와 test)
 *   3. vitest — 전수 검사들을 `FACET_ONLY` 로 좁혀 돌리고, 완제품 자체 검증
 *      (`test/whole-self-check.test.ts` — 손잡이 · 덮이는 phase · 계기 누적 · IR 옮김) 과
 *      facet 자신의 `test/` 를 함께 돌린다
 *
 * 하지 않는 일 (배치를 닫을 때 호스트가 한다):
 *   - 등록 (`scripts/piece-register.mjs`) · 관성 계측 (`scripts/piece-inertia.mjs`)
 *
 * 사용: node scripts/whole-check.mjs facets/<domain>/<name> [...]
 *       --static   정적 검사만 (tsc · vitest 를 건너뛴다)
 *
 * 종료 코드: 오류가 하나라도 있으면 1. 경고는 종료 코드를 바꾸지 않는다.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  checkAlgorithm,
  checkCommon,
  checkDescription,
  checkDrawing,
  checkParticles,
  checkPayload,
  codeOnly,
  read,
  repoRoot,
  run,
  vitestSummary,
} from './check-lib.mjs';

/**
 * 좁혀 돌릴 전수 검사. 완제품 하나로 좁혀도 뜻이 있는 것만.
 * `piece-self-check` · `piece-first-advance` 는 장면 조각 전용이라 뺀다.
 */
const TESTS = [
  'test/whole-self-check.test.ts',
  'packages/core/test/register-names.test.ts',
  'packages/core/test/facet-first-step.test.ts',
  'packages/core/test/canvas-attach.test.ts',
  'packages/core/test/canvas-height.test.ts',
  'packages/core/test/en-original-matches-declaration.test.ts',
  'packages/core/test/control-label-fits.test.ts',
  'packages/core/test/code-panel-phase.test.ts',
  'packages/core/test/destroy-releases-waiters.test.ts',
  'test/facet-i18n.test.ts',
];

const args = process.argv.slice(2);
const staticOnly = args.includes('--static');
const dirs = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\/+$/, ''));
if (dirs.length === 0) {
  console.error('사용: node scripts/whole-check.mjs facets/<domain>/<name> [...] [--static]');
  process.exit(2);
}

function staticCheck(dir) {
  const out = [];
  const err = (rule, msg) => out.push(['오류', rule, msg]);
  const warn = (rule, msg) => out.push(['경고', rule, msg]);
  const name = basename(dir);
  const src = join(repoRoot, dir, 'src');
  if (!existsSync(src)) {
    err('S-facet', `${dir}/src 가 없다`);
    return out;
  }

  // ── 파일 구성
  const STD = ['algorithm.ts', 'projector.ts', 'irs.ts', 'facet.ts', 'index.ts'];
  const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
  for (const f of STD) if (!files.includes(f)) err('S-facet', `src/${f} 가 없다`);
  if (files.includes('scene.ts')) err('S-facet', '완제품은 scene.ts 를 두지 않는다 — projector.ts 가 그 자리다 (scene-migration-protocol "ProjectorFactory 는 걷어내지 않는다")');
  const stages = files.filter((f) => f.endsWith('-stage.ts'));
  if (stages.length !== 1) err('S-facet', `stage 파일은 하나여야 한다 (지금 ${stages.length})`);
  const extra = files.filter((f) => !STD.includes(f) && !f.endsWith('-stage.ts'));
  if (extra.length > 0) err('S-facet', `src 에 표준 밖 파일: ${extra.join(', ')}`);
  for (const f of ['package.json', 'tsconfig.json']) if (!existsSync(join(repoRoot, dir, f))) err('S-facet', `${f} 가 없다`);
  if (!existsSync(join(repoRoot, dir, 'test'))) warn('S-facet', 'test/ 가 없다 — IR ↔ algorithm 전 조합 대조 · 사양 표 대조는 facet 자신의 테스트 몫이다');

  const algorithm = read(join(src, 'algorithm.ts')) ?? '';
  const projector = read(join(src, 'projector.ts')) ?? '';
  const irs = read(join(src, 'irs.ts')) ?? '';
  const facet = read(join(src, 'facet.ts')) ?? '';
  const index = read(join(src, 'index.ts')) ?? '';
  const stage = stages.length === 1 ? (read(join(src, stages[0])) ?? '') : '';

  // ── 선언 (facet.ts)
  const facetCode = codeOnly(facet);
  const id = /id:\s*'(facet:[A-Za-z0-9]+)'/.exec(facet)?.[1];
  if (!id) err('C4', "facet.ts 에서 id: 'facet:<camelCase>' 를 찾지 못했다");
  if (facet.includes('@piece')) err('S-piece', '완제품에 @piece 표식이 있다');
  if (!/projector:\s*'module:[A-Za-z0-9]+Projector'/.test(facet)) err('S-facet', "facet.ts 에 projector: 'module:<camel>Projector' 가 없다");
  if (/^\s*scene:/m.test(facetCode)) err('S-facet', 'facet.ts 가 scene 을 선언한다 — 완제품은 projector 하나');
  const knobs = /widget:\s*'segmented-slider'/.test(facet);
  if (knobs && /segments:\s*\[[\s\S]*?value:\s*['"`]/.test(facet)) err('S-facet', "segments[].value 에 문자열이 있다 — number 다 (식별자면 0.. 순번으로 두고 목록은 initialData 로)");
  if (/label:\s*\{\s*en:\s*'\d[^']*'/.test(facet) && knobs) warn('C10', "구간 라벨이 수·기호면 { en: '16' } 이 아니라 단일 문자열 '16' 으로 둔다 — i18n 감사가 열 언어를 요구한다");
  const initialType = /initialData:\s*\{\s*type:\s*'([^']+)'/.exec(facet)?.[1];
  if (initialType !== undefined && initialType !== name) warn('S-facet', `initialData.type 이 '${initialType}' — 디렉터리 이름 '${name}' 과 맞추는 것이 관례다`);
  checkParticles(facet, { warn });

  // ── 등록 (index.ts)
  const indexCode = codeOnly(index);
  if (knobs && !/mechanismKind:\s*'reactive'/.test(index)) {
    err('S-facet', "손잡이(segmented-slider)가 있는데 index.ts 의 registerAlgorithm 에 mechanismKind: 'reactive' 가 없다 — coroutine 이면 마운트에서 throw 한다");
  }
  if (!/registerProjector\(\s*'[A-Za-z0-9]+Projector'/.test(index)) err('S-facet', "index.ts 에 registerProjector('<camel>Projector', …) 가 없다");
  const viewId = /registerView\(\s*'([^']+)'/.exec(index)?.[1];
  if (!viewId) err('S-facet', 'index.ts 에 registerView 가 없다');
  else if (viewId !== `${name}-stage`) err('C4', `view id 는 <디렉터리명>-stage — 지금 '${viewId}' (전역 레지스트리라 짧은 이름은 부딪힌다)`);
  if (/^register[A-Z]\w*\(\);?\s*$/m.test(indexCode)) err('S-facet', 'index.ts 가 register 를 스스로 부른다 — 호출은 호스트의 몫');
  const registers = [...index.matchAll(/export\s+(?:async\s+)?function\s+(register\w*)/g)].map((m) => m[1]);
  if (registers.length > 1) err('S-facet', `register 로 시작하는 export 가 여럿이다 (${registers.join(', ')}) — 전수 검사가 전부 인자 없이 부른다`);

  // ── 알고리즘
  checkAlgorithm(algorithm, { err, warn });
  const algoCode = codeOnly(algorithm);
  if (/catch\s*(\(\s*\w*\s*\))?\s*\{\s*return\b/.test(algoCode)) err('C8', "catch 가 곧바로 return 한다 — `catch (err) { if (!ctx.cancelled) throw err; }` 가 정본");

  // ── phase (C3) — 집합 대조는 whole-self-check 가 실제로 돌려서 본다. IR 은 도우미(`decl(…, 'cut')`)로
  // phase 를 넘기는 일이 흔해 정규식 대조는 헛짚는다. 여기서는 projector 배선만 본다.
  if (/code-view/.test(facet) && !/case\s+'phase'/.test(projector)) {
    err('C3', "projector 에 case 'phase' 가 없다 — silent 도 projector 에 온다. 코드 패널로 highlightPhase 를 넘긴다");
  }
  // IR 주석은 영어 — 코드 패널은 열 언어 화면에 그대로 뜬다
  for (const m of irs.matchAll(/kind:\s*'comment',\s*text:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (/[가-힣]/.test(m[2])) {
      err('S-facet', `IR 주석이 한국어다 — 영어로 쓴다: "${m[2].slice(0, 40)}"`);
      break;
    }
  }

  // ── projector · stage
  checkPayload('projector.ts', projector, { err });
  checkPayload(stages[0] ?? 'stage', stage, { err });
  checkDrawing('projector.ts', projector, { err, warn });
  checkDrawing(stages[0] ?? 'stage', stage, { err, warn });
  if (/views\.\w+\s+as\s+(?!unknown\b)[A-Z]\w*/.test(codeOnly(projector)) && !/as unknown as/.test(projector)) {
    warn('C9', 'views.<ref> 를 곧바로 단언한다 — `views.stage as unknown as <Stage> | undefined` 로 좁힌다 (mountView 반환형은 오픈 타입)');
  }
  const stageCode = codeOnly(stage);
  if (!/canvas:\s*\{[^}]*height:/.test(stageCode)) warn('S-view', 'stage 에 canvas: { height } 선언이 보이지 않는다 (CanvasView)');

  // ── facet 영역 공통
  checkCommon([['algorithm.ts', algorithm], ['projector.ts', projector], ['irs.ts', irs], ['facet.ts', facet], ['index.ts', index], [stages[0] ?? 'stage', stage]], { err });

  // ── 데모 설명 글
  checkDescription(id, { err }, join, basename);
  return out;
}

let failed = false;
const names = dirs.map((d) => basename(d));

console.log(`== 정적 검사 (${names.join(', ')})`);
for (const dir of dirs) {
  const rows = staticCheck(dir);
  const errors = rows.filter((r) => r[0] === '오류').length;
  if (errors > 0) failed = true;
  console.log(`  ${basename(dir)}: 오류 ${errors} · 경고 ${rows.length - errors}`);
  for (const [lv, rule, msg] of rows) console.log(`    ${lv} [${rule}] ${msg}`);
}

if (!staticOnly) {
  console.log('== tsc');
  for (const dir of dirs) {
    // test/ 까지 본다 — 완제품은 자기 테스트를 두고, 그 타입 오류는 vitest 가 삼킨다.
    // facet 의 tsconfig 를 잇고 include 만 넓힌 설정을 임시 자리에 둔다 (레포에 남기지 않는다).
    const abs = join(repoRoot, dir);
    const hasTest = existsSync(join(abs, 'test'));
    let project = join(dir, 'tsconfig.json');
    let tmp = null;
    if (hasTest) {
      tmp = mkdtempSync(join(tmpdir(), 'whole-check-'));
      project = join(tmp, 'tsconfig.json');
      writeFileSync(project, JSON.stringify({ extends: join(abs, 'tsconfig.json'), include: [join(abs, 'src'), join(abs, 'test')] }));
    }
    const r = await run('npx', ['tsc', '--noEmit', '-p', project], {}, 180_000);
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    const r2 = { ok: true, text: '' };
    const ok = r.ok && r2.ok;
    if (!ok) failed = true;
    const lines = `${r.text}\n${r2.text}`.split('\n').filter((l) => /error TS|시간 초과/.test(l));
    console.log(`  ${basename(dir)}: ${ok ? '통과' : `실패 ${lines.length}`}`);
    for (const l of lines.slice(0, 20)) console.log(`    ${l.trim()}`);
  }

  console.log('== vitest (FACET_ONLY 로 좁힘 + facet 자신의 test/)');
  const own = dirs.filter((d) => existsSync(join(repoRoot, d, 'test')));
  const r = await run('npx', ['vitest', 'run', '--maxWorkers=2', '--minWorkers=1', ...TESTS, ...own], { FACET_ONLY: names.join(','), FORCE_COLOR: '0', NO_COLOR: '1' }, 600_000);
  if (!r.ok) failed = true;
  for (const l of vitestSummary(r.text, /whole-self-check/).slice(0, 80)) console.log(`  ${l.trim().slice(0, 400)}`);
}

console.log(failed ? '== 결과: 실패' : '== 결과: 통과');
process.exit(failed ? 1 : 0);
