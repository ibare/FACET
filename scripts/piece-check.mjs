#!/usr/bin/env node
/**
 * 조각 검사 — 조각 하나(또는 몇)를 좁혀 한 번에 잰다.
 *
 * 조각 에이전트가 끝내기 전에 스스로 돌린다. 전에는 에이전트마다 테스트 파일을
 * 읽어 어떤 검사가 있는지 알아내고, 자체 검증을 임시 파일로 새로 짰다. 배치를 닫을 때
 * rule-guard 가 되풀이해 잡던 것(루프 진입 검사 · 등록 이름 · 문안)도 호스트가 조각
 * 열 개를 손으로 고쳤다. 그 셋을 여기로 옮겼다.
 *
 * 하는 일:
 *   1. 파일 구성과 선언 — 정적으로 본다 (S-facet · S-piece · S-scene · C2 · C4 · C6 · C8)
 *   2. tsc — 그 패키지만
 *   3. vitest — 전수 검사들을 `FACET_ONLY` 로 좁혀 돌린다. 장면 자체 검증
 *      (`packages/core/test/piece-self-check.test.ts`) 이 여기 들어 있다
 *
 * 하지 않는 일 (배치를 닫을 때 호스트가 한다):
 *   - 등록 (`scripts/piece-register.mjs`) — 여럿이 동시에 도는 중에 등록 파일을
 *     건드리면 부딪힌다
 *   - 관성 계측 (`scripts/piece-inertia.mjs`) — 묶음을 모아야 뜻이 있다
 *   - 브라우저 되짚기 감사 (`scripts/scene-audit.mjs`) — dev 서버를 띄워야 한다
 *
 * 사용: node scripts/piece-check.mjs facets/<domain>/<name> [...]
 *       --static   정적 검사만 (tsc · vitest 를 건너뛴다)
 *
 * 종료 코드: 오류가 하나라도 있으면 1. 경고는 종료 코드를 바꾸지 않는다.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  checkAlgorithm,
  checkCommon,
  checkDescription,
  checkDrawing,
  checkNotation,
  checkParticles,
  checkPayload,
  codeOnly,
  noComments,
  read,
  repoRoot,
  run,
  vitestSummary,
} from './check-lib.mjs';

/**
 * 좁혀 돌릴 전수 검사. 조각 하나로 좁혀도 뜻이 있는 것만.
 *
 * `control-label-fits` 는 뺀다 — 손으로 쓴 컨트롤 라벨만 재는데 조각은 프리셋을
 * 쓰므로 잴 것이 0 이 되어 하한에 걸린다.
 */
const TESTS = [
  'packages/core/test/piece-self-check.test.ts',
  'packages/core/test/register-names.test.ts',
  'packages/core/test/facet-first-step.test.ts',
  'packages/core/test/piece-first-advance.test.ts',
  'packages/core/test/canvas-attach.test.ts',
  'packages/core/test/canvas-height.test.ts',
  'packages/core/test/en-original-matches-declaration.test.ts',
  'test/facet-i18n.test.ts',
];

const args = process.argv.slice(2);
const staticOnly = args.includes('--static');
const dirs = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\/+$/, ''));
if (dirs.length === 0) {
  console.error('사용: node scripts/piece-check.mjs facets/<domain>/<name> [...] [--static]');
  process.exit(2);
}

/** 파일 구성과 선언을 본다. 돌려주는 것은 [수준, 규칙, 말] 의 목록. */
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
  const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
  for (const f of ['algorithm.ts', 'scene.ts', 'irs.ts', 'facet.ts', 'index.ts']) {
    if (!files.includes(f)) err('S-facet', `src/${f} 가 없다`);
  }
  if (files.includes('projector.ts')) err('S-scene', '조각은 projector.ts 를 두지 않는다 — scene.ts 가 그 자리다');
  const stages = files.filter((f) => f.endsWith('-stage.ts'));
  if (stages.length !== 1) err('S-facet', `stage 파일은 하나여야 한다 (지금 ${stages.length})`);
  const extra = files.filter(
    (f) => !['algorithm.ts', 'scene.ts', 'irs.ts', 'facet.ts', 'index.ts'].includes(f) && !f.endsWith('-stage.ts'),
  );
  if (extra.length > 0) err('S-facet', `src 에 표준 밖 파일: ${extra.join(', ')}`);
  for (const f of ['package.json', 'tsconfig.json']) {
    if (!existsSync(join(repoRoot, dir, f))) err('S-facet', `${f} 가 없다`);
  }

  const algorithm = read(join(src, 'algorithm.ts')) ?? '';
  const scene = read(join(src, 'scene.ts')) ?? '';
  const facet = read(join(src, 'facet.ts')) ?? '';
  const index = read(join(src, 'index.ts')) ?? '';
  const stage = stages.length === 1 ? (read(join(src, stages[0])) ?? '') : '';

  // ── 선언 (facet.ts)
  const facetCode = codeOnly(facet);
  const id = /id:\s*'(facet:[A-Za-z0-9]+)'/.exec(facet)?.[1];
  if (!id) err('C4', "facet.ts 에서 id: 'facet:<camelCase>' 를 찾지 못했다");
  if (!facet.includes('@piece')) err('S-piece', 'facet.ts JSDoc 에 @piece 표식이 없다');
  if (!/scene:\s*'module:[A-Za-z0-9]+Scene'/.test(facet)) err('S-scene', "facet.ts 에 scene: 'module:<이름>Scene' 이 없다");
  if (/^\s*projector:/m.test(facetCode)) err('S-scene', 'facet.ts 가 projector 를 선언한다 — 조각은 scene 하나만');
  // 컨트롤 — pieceScrub 이거나, 그것을 펼쳐 라벨을 덮어쓴 것 (S-piece 는 `{ ...CONTROL.replay, label }` 을 허용한다).
  const scrub = facet.includes('CONTROL_SET.pieceScrub');
  const spread = /CONTROL\.replay/.test(facet) && /CONTROL\.timeline/.test(facet);
  if (!scrub && !spread) err('S-piece', 'controls 는 CONTROL_SET.pieceScrub (다시 보기 + 띠) 이어야 한다');
  if (/CONTROL\.advance/.test(facet)) err('S-piece', '띠와 advance 를 함께 두지 않는다');
  if (!scrub && spread && !/\.\.\.CONTROL\./.test(facet)) warn('S-piece', '프리셋을 펼쳐 적었다 — 덮어쓸 것이 없으면 CONTROL_SET.pieceScrub 으로 통일한다');
  if (!/stepMs:\s*[\w.]+/.test(facetCode)) err('S-piece', 'initialData 에 stepMs 가 없다');
  // FacetJson 의 최상위(두 칸 들여쓰기) 키와 header 블록만 본다 — initialData 안의 같은 이름 필드는 자료다.
  if (/^ {2}(metrics|layout):/m.test(facetCode)) err('S-piece', '조각은 metrics · layout 을 선언하지 않는다');
  if (/\bheader:\s*\{\s*type:/.test(facetCode)) err('S-piece', '조각은 header (title-block) 를 두지 않는다');
  if (/^ {2}canvas:/m.test(facetCode)) warn('S-piece', 'facet.ts 에 canvas 선언이 있다 — 세로는 stage 가 상수로 갖는다');
  checkParticles(facet, { warn });
  checkNotation(facet, { err });

  // ── 등록 (index.ts)
  const indexCode = codeOnly(index);
  if (!/mechanismKind:\s*'reactive'/.test(index)) err('S-piece', "index.ts 의 registerAlgorithm 에 mechanismKind: 'reactive' 가 없다");
  if (!/registerScenePlan\(\s*'[A-Za-z0-9]+Scene'/.test(index)) err('S-facet', "index.ts 에 registerScenePlan('<이름>Scene', …) 이 없다");
  const viewId = /registerView\(\s*'([^']+)'/.exec(index)?.[1];
  if (!viewId) err('S-facet', 'index.ts 에 registerView 가 없다');
  else if (viewId !== `${name}-stage`) err('C4', `view id 는 <디렉터리명>-stage — 지금 '${viewId}' (전역 레지스트리라 짧은 이름은 부딪힌다)`);
  // 최상위(들여쓰기 없는) 호출만 본다. 함수 안에서 부르는 register* 는 등록 함수 자신의 일이다.
  if (/^register[A-Z]\w*\(\);?\s*$/m.test(indexCode)) err('S-facet', 'index.ts 가 register 를 스스로 부른다 — 호출은 호스트의 몫');

  // ── 알고리즘
  const algoCode = codeOnly(algorithm);
  checkAlgorithm(algorithm, { err, warn });
  if (/waitForInput/.test(algoCode)) warn('S-piece', '손짚기 루프(waitForInput)는 pieceScrub 조각에서 도달하지 않는다 — 새 조각은 두지 않는 것이 배치 관례다 (이행 프로토콜 7 절)');
  if (/\.metric\(/.test(algoCode)) err('S-piece', '조각은 ctx.metric 을 부르지 않는다');

  // ── 장면
  const sceneCode = codeOnly(scene);
  checkPayload('scene.ts', scene, { err });
  if (/\bdocument\.|\bsetTimeout\(|\bMath\.random\(|\brequestAnimationFrame\(/.test(sceneCode)) {
    err('S-scene', 'scene.ts 가 DOM · 타이머 · 무작위를 쓴다 — reduce 는 순수해야 한다');
  }

  // ── stage
  const stageCode = codeOnly(stage);
  // 자료 필드 `transition:` 은 걸리지 않게 CSS 로 쓰는 모양만 본다.
  const stageNoComment = noComments(stage);
  if (/\bstyle\.transition\b|setProperty\(\s*['"]transition['"]|['"`][^'"`\n]*\btransition\s*:\s*[a-z-]+\s+[\d.]+m?s/.test(stageNoComment)) {
    err('이행 4절', 'stage 가 CSS transition 을 쓴다 — 되짚기가 animate:false 로 와도 저 혼자 흐른다 (scene-migration-protocol 4 절 MUST NOT)');
  }
  if (!/canvas:\s*\{\s*height:/.test(stageCode)) warn('S-piece', 'stage 에 canvas: { height: H } 선언이 보이지 않는다 (CanvasView)');
  if (!/\brender\s*[(:]/.test(stageCode)) err('S-scene', 'stage 가 render 를 내놓지 않는다');
  if (/\b(isInstant|onScrubStart)\b/.test(stageCode)) warn('S-scene', 'isInstant · onScrubStart 는 장면 조각에서 불리지 않는다 — 빗장은 animate 검사와 세대(gen)다');
  if (!/Set<\s*\(\)\s*=>\s*void\s*>/.test(stage) && /setTimeout|requestAnimationFrame/.test(stageCode)) {
    warn('S-piece', 'stage 가 타이머를 거는데 waiters 집합이 안 보인다 — destroy 가 기다리던 Promise 를 풀어야 한다');
  }
  if (!/\bgen\b/.test(stageCode) && /await/.test(stageCode)) warn('S-scene', '세대 빗장(gen/alive)이 안 보인다 — 바탕이 바뀔 때만 짓고 속성만 덮어쓰는 요소를 await 뒤에 만지면 필요하다');
  checkDrawing(stages[0] ?? 'stage', stage, { err, warn });

  // ── facet 영역 공통
  checkCommon([['algorithm.ts', algorithm], ['scene.ts', scene], ['facet.ts', facet], ['index.ts', index], [stages[0] ?? 'stage', stage]], { err });

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
    const r = run('npx', ['tsc', '--noEmit', '-p', join(dir, 'tsconfig.json')], {}, 180_000);
    if (!r.ok) failed = true;
    const lines = r.text.split('\n').filter((l) => /error TS|시간 초과/.test(l));
    console.log(`  ${basename(dir)}: ${r.ok ? '통과' : `실패 ${lines.length}`}`);
    for (const l of lines.slice(0, 20)) console.log(`    ${l.trim()}`);
  }

  console.log('== vitest (FACET_ONLY 로 좁힘)');
  const r = run('npx', ['vitest', 'run', ...TESTS], { FACET_ONLY: names.join(','), FORCE_COLOR: '0', NO_COLOR: '1' }, 600_000);
  if (!r.ok) failed = true;
  const keep = vitestSummary(r.text, /piece-self-check/);
  for (const l of keep.slice(0, 80)) console.log(`  ${l.trim().slice(0, 400)}`);
}

console.log(failed ? '== 결과: 실패' : '== 결과: 통과');
process.exit(failed ? 1 : 0);
