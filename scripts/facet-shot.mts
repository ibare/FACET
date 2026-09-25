/**
 * facet 스크린샷 — facet 하나를 happy-dom 에서 돌려 걸음마다 화면을 뜨고, 모음 한 장으로 찍는다.
 *
 * 왜 있나: 2026-09-18 배치에서 에이전트마다 렌더 스크립트를 새로 짰다. 완제품 쪽만 40 회 합 77 분
 * (한 번에 평균 116 초), 한 번은 Chrome 이 26 분 멎었다 — 타임아웃 없이 여럿이 동시에 기본 프로필로
 * Chrome 을 띄운 탓이다. 찍을 때마다 PNG 를 한 장씩 읽어 토큰도 컸다. 그 공통분을 여기 한 벌로 둔다.
 *
 * 두 길:
 *   장면(scene) facet    알고리즘을 곧바로 돌려 발신을 모으고 `SceneTrack` 규칙으로 장면을 쌓아
 *                        `render(scene, prev, { animate: false })` 로 뜬다. 되짚기와 같은 길이라
 *                        결정적이고 1 초 안팎이다.
 *   projector facet      발신을 projector 에 차례로 먹이고 걸음 경계마다 `--settle` ms 기다려 뜬다.
 *                        stage 만 실제로 그리고 코드 패널 · 계기 · 컨트롤은 스텁이다.
 *
 * 조작을 받는 완제품은 `--input` 을 순서대로 준다. 알고리즘이 `waitForInput` 에 닿을 때마다 하나씩
 * 꺼내 주고, 다 떨어지면 거기서 멈춘다. 입력을 받기 직전 화면은 늘 뜬다.
 *
 * 사용:
 *   npx tsx scripts/facet-shot.mts facets/<domain>/<name> [옵션]
 *     --locale ko            문안 언어 (기본 en)
 *     --theme dark           팔레트 (기본 light)
 *     --frames 12            모음에 넣을 화면 수 상한. 처음 · 끝 · 입력 직전을 먼저 넣고 나머지를 고르게 (기본 12)
 *     --frames all           전부
 *     --input size=16        조작 하나. 여럿이면 순서대로. 값이 수면 수로 넘긴다 → { type: 'size', payload: { value: 16 } }
 *     --settle 400           projector 길의 걸음 뒤 기다림 ms (기본 400)
 *     --no-png               PNG 를 찍지 않는다 — 글자 요약과 SVG 만
 *     --out <dir>            산출 자리 (기본 $TMPDIR/facet-shot/<name>)
 *
 * 산출: <out>/NN.svg · <out>/frames.txt(화면별 글자) · <out>/sheet-<locale>-<theme>.png (모음 한 장)
 * stdout 에는 화면별 글자 요약과 PNG 경로가 찍힌다. **글자만으로 판단이 서면 PNG 를 열지 않는다.**
 *
 * 레포 파일을 건드리지 않고, dev 서버도 등록도 필요 없다 — 배치 도중 여럿이 동시에 돌려도 된다.
 */
const TIMEOUT_MS = 120_000;
const timeoutId = setTimeout(() => {
  console.error(`[timeout] facet-shot 이 ${TIMEOUT_MS}ms 를 넘겼다`);
  cleanup(124);
}, TIMEOUT_MS);
timeoutId.unref();

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const children = new Set<ChildProcess>();
function cleanup(code = 0): never {
  for (const c of children) {
    try {
      if (c.pid) process.kill(-c.pid, 'SIGKILL');
    } catch {
      try {
        c.kill('SIGKILL');
      } catch {
        /* 이미 끝났다 */
      }
    }
  }
  process.exit(code);
}
process.on('disconnect', () => cleanup(0));
process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', (e) => {
  console.error(e);
  cleanup(1);
});
process.on('unhandledRejection', (e) => {
  console.error(e);
  cleanup(1);
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── 인자
const argv = process.argv.slice(2);
function flag(name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--') ? argv[i + 1]! : null;
}
function flags(name: string): string[] {
  const out: string[] = [];
  argv.forEach((a, i) => {
    if (a === name && argv[i + 1] !== undefined) out.push(argv[i + 1]!);
  });
  return out;
}
const VALUED = new Set(['--locale', '--theme', '--frames', '--input', '--settle', '--out']);
const dirArg = argv.find((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));
if (!dirArg) {
  console.error('사용: npx tsx scripts/facet-shot.mts facets/<domain>/<name> [--locale ko] [--theme dark] [--frames 12|all] [--input k=v ...] [--no-png]');
  process.exit(2);
}
const facetDir = resolve(repoRoot, dirArg.replace(/\/+$/, ''));
const name = basename(facetDir);
const locale = flag('--locale') ?? 'en';
const theme = (flag('--theme') ?? 'light') as 'light' | 'dark';
const framesArg = flag('--frames') ?? '12';
const settleMs = Number(flag('--settle') ?? '400');
const noPng = argv.includes('--no-png');
const outDir = resolve(flag('--out') ?? join(tmpdir(), 'facet-shot', name));
const inputs = flags('--input').map((raw) => {
  const eq = raw.indexOf('=');
  const type = eq < 0 ? raw : raw.slice(0, eq);
  const v = eq < 0 ? undefined : raw.slice(eq + 1);
  const value = v === undefined ? undefined : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  return value === undefined ? { type } : { type, payload: { value } };
});

// ── happy-dom 을 전역으로 — core 를 가져오기 전에 세운다
const { Window } = await import('happy-dom');
const win = new Window({ width: 1200, height: 900 });
const g = globalThis as Record<string, unknown>;
for (const key of [
  'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Text',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'DOMParser',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver',
]) {
  const v = (win as unknown as Record<string, unknown>)[key];
  if (v !== undefined && g[key] === undefined) g[key] = typeof v === 'function' && /^[a-z]/.test(key) ? (v as (...a: unknown[]) => unknown).bind(win) : v;
}
g.window = win;

type Ev = { type: string; payload?: unknown; silent?: boolean };
type Renderer = { render(next: unknown, prev: unknown, opts: { animate: boolean }): unknown; destroy(): void };

const core = (await import('@ffacet/core/runtime')) as Record<string, unknown> & {
  getFacetById(id: string): Record<string, unknown> | undefined;
  listFacets(): string[];
  getScenePlan(n: string): { initial(d: unknown): unknown; reduce(s: unknown, e: Ev): unknown } | undefined;
  getAlgorithm(n: string): ((ctx: unknown) => Promise<void>) | undefined;
  getProjector(n: string): ((views: Record<string, unknown>, rt: unknown) => { onInit?(d: unknown): void; onEvent(e: Ev): unknown; onDestroy?(): void }) | undefined;
  getView(t: string): unknown;
  mountView(v: unknown, c: unknown, p: unknown): unknown;
  makeTranslator(locale: string, messages?: unknown): unknown;
  getColors(theme: string): Record<string, string>;
  stripPrefix(s: string, p: string): string;
};

// ── facet 을 싣는다
const entry = join(facetDir, 'src', 'index.ts');
if (!existsSync(entry)) {
  console.error(`index.ts 가 없다: ${entry}`);
  process.exit(2);
}
const before = new Set(core.listFacets());
const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
for (const [k, v] of Object.entries(mod)) {
  if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
}
const facetId = core.listFacets().find((id) => !before.has(id));
const facet = facetId ? core.getFacetById(facetId) : undefined;
if (!facet) {
  console.error(`등록된 facet 을 찾지 못했다 — ${name} 의 register* 가 registerFacets 를 부르는가`);
  process.exit(1);
}
const blocks = facet.blocks as Record<string, { type?: string }>;
const messages = facet.messages;
const t = core.makeTranslator(locale, messages);
const initialData = facet.initialData;
const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));

// 그릴 블록 — 컨트롤 · 코드 패널 · 계기 · 머리글이 아닌 첫 블록
const SKIP = new Set(['control-bar', 'code-view', 'metric-bar', 'metrics', 'title-block', 'header']);
const stageRef = Object.keys(blocks).find((ref) => !SKIP.has(String(blocks[ref]?.type)));
if (!stageRef) {
  console.error('그릴 stage 블록을 찾지 못했다');
  process.exit(1);
}
const stageType = String(blocks[stageRef]!.type);

// ── 발신을 모은다 (sleep 은 곧바로, 입력은 --input 순서대로)
const algorithm = core.getAlgorithm(core.stripPrefix(String(facet.algorithm), 'module'));
if (!algorithm) {
  console.error(`알고리즘 미등록: ${String(facet.algorithm)}`);
  process.exit(1);
}
const events: Ev[] = [];
/** 입력을 기다리기 시작한 순간의 발신 수 — 그 직전 화면을 늘 뜬다. */
const inputMarks: { at: number; label: string }[] = [];
{
  let idle!: () => void;
  const waiting = new Promise<void>((r) => (idle = r));
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: clone(initialData),
    get cancelled() {
      return cancelled;
    },
    metric() {},
    async emit(e: Ev) {
      events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      inputMarks.push({ at: events.length, label: next ? `입력 전 → ${next.type}=${String((next.payload as { value?: unknown })?.value ?? '')}` : '입력 대기' });
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  let cap: ReturnType<typeof setTimeout> | undefined;
  const capped = new Promise<void>((_, reject) => {
    cap = setTimeout(() => reject(new Error('알고리즘이 20 초 안에 끝나지 않았다 (sleep 없이 도는 루프?)')), 20_000);
  });
  try {
    await Promise.race([algorithm(ctx), waiting, capped]);
  } finally {
    clearTimeout(cap);
    cancelled = true;
  }
}

// ── 화면을 뜬다
type Frame = { step: number; label: string; svg: string; text: string };
const all: Frame[] = [];
const container = document.createElement('div');
document.body.appendChild(container);
const svgOf = (): string => container.querySelector('svg')?.outerHTML ?? '';
function hiddenInTree(n: Element): boolean {
  for (let e: Element | null = n; e && e !== container; e = e.parentElement) {
    const vis = e.getAttribute('visibility') ?? (e as HTMLElement).style?.visibility;
    const disp = e.getAttribute('display') ?? (e as HTMLElement).style?.display;
    const op = e.getAttribute('opacity') ?? (e as HTMLElement).style?.opacity;
    if (vis === 'hidden' || disp === 'none' || op === '0') return true;
  }
  return false;
}
const textOf = (): string =>
  Array.from(container.querySelectorAll('text'))
    // 숨긴 글자는 화면에 없다 — 자기나 조상이 visibility=hidden · display=none · opacity 0 이면 뺀다
    .filter((n) => !hiddenInTree(n))
    .map((n) => (n.textContent ?? '').trim())
    .filter((s) => s.length > 0)
    .join(' · ');
const view = core.getView(stageType);
if (!view) {
  console.error(`view 미등록: ${stageType}`);
  process.exit(1);
}
const mountParams = { config: { ...blocks[stageRef] }, initialData: clone(initialData), t, locale, theme };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const markAt = new Map(inputMarks.map((m) => [m.at, m.label]));

if (typeof facet.scene === 'string') {
  const plan = core.getScenePlan(core.stripPrefix(facet.scene, 'module'));
  if (!plan) {
    console.error(`장면 설계 미등록: ${facet.scene}`);
    process.exit(1);
  }
  const inst = core.mountView(view, container, mountParams) as Renderer;
  let scene = plan.initial(clone(initialData));
  let prev: unknown = null;
  let step = 0;
  const shoot = async (label: string) => {
    await inst.render(scene, prev, { animate: false });
    all.push({ step, label, svg: svgOf(), text: textOf() });
  };
  await shoot('처음');
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]!;
    const next = plan.reduce(scene, e);
    if (e.silent === true) {
      // 러너의 SceneTrack 처럼 지금 걸음의 장면을 갈아 끼우고 다시 찍는다 — 걸음은 늘지 않는다
      scene = next;
      const last = all[all.length - 1]!;
      await inst.render(scene, prev, { animate: false });
      all[all.length - 1] = { ...last, svg: svgOf(), text: textOf() };
    } else {
      prev = scene;
      scene = next;
      step += 1;
      await shoot(`#${step} ${e.type}`);
    }
    const mark = markAt.get(i + 1);
    if (mark) all[all.length - 1]!.label += ` (${mark})`;
  }
  inst.destroy();
} else {
  const factory = core.getProjector(core.stripPrefix(String(facet.projector), 'module'));
  if (!factory) {
    console.error(`projector 미등록: ${String(facet.projector)}`);
    process.exit(1);
  }
  const stub = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => undefined) });
  const views: Record<string, unknown> = {};
  for (const ref of Object.keys(blocks)) views[ref] = stub();
  views[stageRef] = core.mountView(view, container, mountParams);
  const projector = factory(views, { getSpeed: () => 1, t });
  projector.onInit?.(clone(initialData));
  await wait(settleMs);
  let step = 0;
  all.push({ step, label: '처음', svg: svgOf(), text: textOf() });
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]!;
    await projector.onEvent(e);
    const mark = markAt.get(i + 1);
    if (e.silent !== true || mark) {
      if (e.silent !== true) step += 1;
      await wait(settleMs);
      all.push({ step, label: `#${step} ${e.type}${mark ? ` (${mark})` : ''}`, svg: svgOf(), text: textOf() });
    }
  }
  projector.onDestroy?.();
}

// ── 고른다 — 처음 · 끝 · 입력 직전을 먼저, 나머지를 고르게
function pick(frames: Frame[]): Frame[] {
  if (framesArg === 'all') return frames;
  const cap = Math.max(2, Number(framesArg) || 12);
  if (frames.length <= cap) return frames;
  const keep = new Set<number>([0, frames.length - 1]);
  frames.forEach((f, i) => {
    if (/입력/.test(f.label)) keep.add(i);
  });
  const rest = cap - keep.size;
  for (let k = 1; k <= rest; k += 1) keep.add(Math.round((k * (frames.length - 1)) / (rest + 1)));
  return [...keep].sort((a, b) => a - b).slice(0, Math.max(cap, keep.size)).map((i) => frames[i]!);
}
const chosen = pick(all);

// ── 쓴다
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^\d+\.svg$|^frames\.txt$/.test(f)) rmSync(join(outDir, f));
chosen.forEach((f, i) => writeFileSync(join(outDir, `${String(i).padStart(2, '0')}.svg`), f.svg));
const summary = all.map((f) => `${f.label}\n  ${f.text || '(글자 없음)'}`).join('\n');
writeFileSync(join(outDir, 'frames.txt'), summary + '\n');

console.log(`== ${facetId} · ${stageType} · ${typeof facet.scene === 'string' ? '장면' : 'projector'} · 걸음 ${all[all.length - 1]!.step} · 발신 ${events.length} · 모음 ${chosen.length}/${all.length}`);
for (const f of chosen) console.log(`${f.label}\n  ${(f.text || '(글자 없음)').slice(0, 300)}`);

if (!noPng) {
  const palette = core.getColors(theme);
  const widthOf = (svg: string) => Number(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) [\d.]+"/.exec(svg)?.[1] ?? /width="([\d.]+)"/.exec(svg)?.[1] ?? 620);
  const heightOf = (svg: string) => Number(/viewBox="[\d.-]+ [\d.-]+ [\d.]+ ([\d.]+)"/.exec(svg)?.[1] ?? /height="([\d.]+)"/.exec(svg)?.[1] ?? 400);
  const w = Math.max(...chosen.map((f) => widthOf(f.svg)));
  const h = Math.max(...chosen.map((f) => heightOf(f.svg)));
  const cols = chosen.length > 4 ? 3 : 2;
  const rows = Math.ceil(chosen.length / cols);
  const cellW = w + 16;
  const cellH = h + 40;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:${palette.bg};color:${palette.text};font:13px -apple-system,sans-serif}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:0}
    .c{width:${cellW}px;height:${cellH}px;box-sizing:border-box;padding:6px 8px;border:1px solid ${palette.border}}
    .c b{display:block;height:22px;overflow:hidden;white-space:nowrap}
    .c svg{width:${w}px;height:auto;max-height:${h}px}
  </style></head><body><div class="g">${chosen.map((f) => `<div class="c"><b>${esc(f.label)}</b>${f.svg}</div>`).join('')}</div></body></html>`;
  const htmlPath = join(outDir, 'sheet.html');
  writeFileSync(htmlPath, html);
  const png = join(outDir, `sheet-${locale}-${theme}.png`);
  if (!existsSync(CHROME)) {
    console.log(`(Chrome 이 없어 PNG 를 건너뛴다 — ${htmlPath})`);
  } else {
    // 프로필을 따로 — 기본 프로필을 여럿이 함께 쓰면 잠금에 걸려 멎는다 (2026-09-18 의 26 분)
    const profile = mkdtempSync(join(tmpdir(), 'facet-shot-'));
    rmSync(png, { force: true });
    // PNG 는 1~2 초면 써지는데 Chrome 은 새 프로필의 updater 때문에 수십 초 남는다.
    // 파일이 생겨 크기가 멈추면 프로세스 묶음째 끊는다.
    const ok = await new Promise<boolean>((done) => {
      const child = spawn(
        CHROME,
        [
          '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
          '--disable-background-networking', '--disable-component-update', '--no-default-browser-check',
          `--user-data-dir=${profile}`, `--window-size=${cols * cellW},${rows * cellH}`,
          `--screenshot=${png}`, pathToFileURL(htmlPath).href,
        ],
        { detached: true, stdio: 'ignore' },
      );
      children.add(child);
      const killGroup = () => {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* 이미 끝났다 */
        }
        children.delete(child);
      };
      let last = -1;
      const started = Date.now();
      const poll = setInterval(() => {
        const size = existsSync(png) ? statSync(png).size : 0;
        const settled = size > 0 && size === last;
        last = size;
        if (settled || Date.now() - started > 30_000) {
          clearInterval(poll);
          killGroup();
          done(settled);
        }
      }, 250);
      child.on('exit', () => {
        clearInterval(poll);
        children.delete(child);
        done(existsSync(png) && statSync(png).size > 0);
      });
    });
    rmSync(profile, { recursive: true, force: true });
    console.log(ok ? `PNG ${png}` : `(PNG 실패 — 30 초 안에 끝나지 않았다. ${htmlPath} 를 보라)`);
  }
}
console.log(`산출 ${outDir}`);
clearTimeout(timeoutId);
cleanup(0);
