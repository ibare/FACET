/**
 * independent-in-parallel 의 무대 — 시계가 가로로 흐르고, 일꾼마다 한 줄씩 대상이 제 길이만큼 차오른다.
 *
 * 위 줄은 아직 시작하지 않은 대상이 기다리는 자리다. 입력 하나가 끝날 때마다 그 대상 아래 점이 하나씩 찬다.
 * 점이 다 차는 시각에 대상은 기다리는 자리에서 빈 일꾼의 줄로 내려와 제 길이만큼의 상자로 펴진다.
 * 시계 선이 오른쪽으로 가는 동안 일하는 상자들은 한꺼번에 차오른다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import { longestChain, simulateBuild, totalWork, type BuildTarget } from './algorithm.js';
import type { IndependentInParallelScene } from './scene.js';

const H = 320;
const W = PIECE_CANVAS_W;
const PAD = 16;
const LABEL_COL = 64;
const CHIP_H = 40;
const CHIP_TOP = 26;
const CHIP_MAX_W = 112;
const LANES_TOP = 104;
const LANES_BOTTOM = 266;
const LANE_GAP = 10;
const LANE_MAX_H = 34;
const AXIS_Y = 276;
const CAPTION_Y = 310;
const PROGRESS_H = 6;
const DOT_R = 3.5;
/** 시계 1 초가 흐르는 데 드는 벽시계 ms. */
const SWEEP_MS_PER_SECOND = 300;
/** 기다리던 대상이 일꾼 줄로 내려와 펴지는 ms. */
const SLIDE_MS = 450;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Box = { x: number; y: number; w: number; h: number };

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function make(
  parent: Element,
  tag: string,
  attrs: Record<string, string | number>,
  content?: string,
): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, typeof value === 'number' ? String(r(value)) : value);
  }
  if (content !== undefined) node.textContent = content;
  parent.appendChild(node);
  return node;
}

/** 바탕에서 한 번 정해지는 것 — 끝 시각(가로 눈금의 끝). 알고리즘의 셈을 그대로 부른다. */
function horizonOf(targets: readonly BuildTarget[], workers: number): number {
  if (targets.length === 0 || workers < 1) return 1;
  const moments = simulateBuild(targets, workers);
  const last = moments[moments.length - 1];
  return last ? Math.max(1, last.t) : 1;
}

export const independentInParallelStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smallPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let horizonKey: readonly BuildTarget[] | null = null;
    let horizon = 1;

    function horizonFor(scene: IndependentInParallelScene): number {
      if (horizonKey !== scene.targets) {
        horizonKey = scene.targets;
        horizon = horizonOf(scene.targets, scene.workers);
      }
      return horizon;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const wake = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /**
     * 한 장면을 그린다. `clockShown` 은 지금 보이는 시계, `slide` 는 이번 걸음에 오른 대상이
     * 기다리는 자리에서 일꾼 줄까지 온 몫(0..1). 정적 그리기는 `draw(scene, scene.clock, 1)` 이다.
     */
    function draw(scene: IndependentInParallelScene, clockShown: number, slide: number): void {
      svg.textContent = '';
      const targets = scene.targets;
      const workers = scene.workers;
      if (targets.length === 0 || workers < 1) return;
      const span = horizonFor(scene);
      const x0 = PAD + LABEL_COL;
      const x1 = W - PAD;
      const pxs = (x1 - x0) / span;
      const xOf = (sec: number): number => x0 + sec * pxs;
      const laneH = Math.min(LANE_MAX_H, (LANES_BOTTOM - LANES_TOP - (workers - 1) * LANE_GAP) / workers);
      const laneY = (worker: number): number => LANES_TOP + worker * (laneH + LANE_GAP);
      const byName = new Map(targets.map((target) => [target.name, target] as const));
      const sliding = new Set(slide < 1 && scene.step ? scene.step.started : []);
      const endedAt = new Map(scene.finished.map((f) => [f.name, f.at] as const));
      const isDone = (name: string): boolean => {
        const at = endedAt.get(name);
        return at !== undefined && at <= clockShown;
      };

      const slotW = (W - 2 * PAD) / targets.length;
      const chipW = Math.min(CHIP_MAX_W, slotW - 8);
      const chipBox = (i: number): Box => ({
        x: PAD + i * slotW + (slotW - chipW) / 2,
        y: CHIP_TOP,
        w: chipW,
        h: CHIP_H,
      });
      const runBox = (name: string, worker: number, start: number): Box => {
        const target = byName.get(name);
        if (!target) throw new Error(`independent-in-parallel-stage: 규칙에 없는 대상 ${name}`);
        return { x: xOf(start), y: laneY(worker), w: target.seconds * pxs, h: laneH };
      };

      // 위 — 기다리는 자리와 일하는 일꾼 수
      make(
        svg,
        'text',
        { x: PAD, y: 16, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
        t('label.waiting', 'Waiting to start'),
      );
      const busy = scene.runs.filter((run) => !sliding.has(run.name) && !isDone(run.name)).length;
      make(
        svg,
        'text',
        {
          x: W - PAD,
          y: 16,
          'text-anchor': 'end',
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
        },
        t('label.busy', 'Busy workers: {n}', { n: busy }),
      );

      const startedNames = new Set(scene.runs.map((run) => run.name));
      targets.forEach((target, i) => {
        if (startedNames.has(target.name) && !sliding.has(target.name)) return;
        if (sliding.has(target.name) && slide > 0) return; // 내려오는 중인 것은 아래에서 그린다
        const box = chipBox(i);
        const g = make(svg, 'g', {});
        make(g, 'rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 4,
          fill: c.bgSubtle,
          stroke: c.border,
        });
        const hasInputs = target.inputs.length > 0;
        make(
          g,
          'text',
          {
            x: box.x + box.w / 2,
            y: hasInputs ? box.y + 17 : box.y + box.h / 2 + smallPx * 0.35,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          target.name,
        );
        const n = target.inputs.length;
        target.inputs.forEach((input, k) => {
          const cx = box.x + box.w / 2 + (k - (n - 1) / 2) * (DOT_R * 3.4);
          const done = isDone(input);
          make(g, 'circle', {
            cx,
            cy: box.y + 30,
            r: DOT_R,
            fill: done ? c.text : c.bgSubtle,
            stroke: done ? c.text : c.textMuted,
            'stroke-width': 1.2,
          });
        });
      });

      // 가운데 — 일꾼 줄
      for (let worker = 0; worker < workers; worker += 1) {
        const y = laneY(worker);
        const working = scene.runs.some(
          (run) => run.worker === worker && !sliding.has(run.name) && !isDone(run.name),
        );
        make(svg, 'rect', { x: x0, y, width: x1 - x0, height: laneH, fill: c.bgSubtle });
        make(
          svg,
          'text',
          {
            x: PAD,
            y: y + laneH / 2 + smallPx * 0.35,
            fill: working ? c.text : c.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': working ? 600 : 400,
          },
          t('label.worker', 'Worker {n}', { n: worker + 1 }),
        );
      }

      // 가장 긴 사슬 — 모두 끝났을 때만
      const allDone = scene.finished.length === targets.length && clockShown >= scene.clock;
      const chain = allDone ? longestChain(targets) : null;
      const chainSet = new Set(chain ? chain.names : []);

      const boxes = new Map<string, Box>();
      for (const run of scene.runs) {
        const target = byName.get(run.name);
        if (!target) throw new Error(`independent-in-parallel-stage: 규칙에 없는 대상 ${run.name}`);
        const lane = runBox(run.name, run.worker, run.start);
        if (sliding.has(run.name)) {
          if (slide <= 0) continue; // 아직 기다리는 자리에 있다 (위에서 그렸다)
          const from = chipBox(targets.indexOf(target));
          const box: Box = {
            x: lerp(from.x, lane.x, slide),
            y: lerp(from.y, lane.y, slide),
            w: lerp(from.w, lane.w, slide),
            h: lerp(from.h, lane.h, slide),
          };
          drawRun(box, target.name, 0, false, false);
          continue;
        }
        boxes.set(run.name, lane);
        const done = isDone(run.name);
        const filled = Math.max(0, Math.min(target.seconds, clockShown - run.start)) * pxs;
        drawRun(lane, target.name, filled, done, chainSet.has(run.name));
      }

      function drawRun(box: Box, name: string, filled: number, done: boolean, onChain: boolean): void {
        const g = make(svg, 'g', {});
        make(g, 'rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 3,
          fill: done ? c.itemSorted : c.itemDefault,
          stroke: onChain ? c.accent : done ? c.itemSorted : c.textMuted,
          'stroke-width': onChain ? 3 : 1.2,
          ...(done ? {} : { 'stroke-dasharray': '4 3' }),
        });
        if (!done && filled > 0) {
          make(g, 'rect', {
            x: box.x,
            y: box.y + box.h - PROGRESS_H,
            width: filled,
            height: PROGRESS_H,
            fill: c.itemActive,
          });
        }
        make(
          g,
          'text',
          {
            x: box.x + box.w / 2,
            y: box.y + Math.min(box.h, LANE_MAX_H) / 2 + smallPx * 0.3 - (done ? 0 : 1),
            'text-anchor': 'middle',
            fill: done ? c.textInverse : c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          },
          name,
        );
      }

      // 사슬을 잇는 선 — 앞 상자의 끝에서 뒤 상자의 처음으로
      if (chain) {
        for (let k = 1; k < chain.names.length; k += 1) {
          const a = boxes.get(chain.names[k - 1] ?? '');
          const b = boxes.get(chain.names[k] ?? '');
          if (!a || !b) continue;
          make(svg, 'polyline', {
            points: `${r(a.x + a.w)},${r(a.y + a.h / 2)} ${r(b.x)},${r(b.y + b.h / 2)}`,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 3,
          });
        }
      }

      // 아래 — 초 눈금
      make(svg, 'line', { x1: x0, y1: AXIS_Y, x2: x1, y2: AXIS_Y, stroke: c.border });
      for (let sec = 0; sec <= span; sec += 1) {
        make(svg, 'line', { x1: xOf(sec), y1: AXIS_Y, x2: xOf(sec), y2: AXIS_Y + 4, stroke: c.border });
        make(
          svg,
          'text',
          {
            x: xOf(sec),
            y: AXIS_Y + 16,
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          },
          String(sec),
        );
      }

      // 시계 선
      const cx = xOf(clockShown);
      make(svg, 'line', {
        x1: cx,
        y1: LANES_TOP - 6,
        x2: cx,
        y2: AXIS_Y,
        stroke: c.primary,
        'stroke-width': 2,
      });
      make(
        svg,
        'text',
        {
          x: Math.min(Math.max(cx, x0 + 16), x1 - 16),
          y: LANES_TOP - 10,
          'text-anchor': 'middle',
          fill: c.primary,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
        },
        t('label.clock', '{sec} s', { sec: Math.floor(clockShown + 1e-9) }),
      );

      // 캡션 — 이번 걸음에 일어난 일
      make(
        svg,
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
        },
        caption(scene),
      );
    }

    function caption(scene: IndependentInParallelScene): string {
      const step = scene.step;
      if (!step) {
        return t('caption.ready', 'Not started: {count} · Free workers: {n}', {
          count: scene.targets.length,
          n: scene.workers,
        });
      }
      if (scene.finished.length === scene.targets.length) {
        return t('caption.done', 'All built · End: {end} s · Work summed: {sum} s · Longest chain: {chain} s', {
          end: scene.clock,
          sum: totalWork(scene.targets),
          chain: longestChain(scene.targets).seconds,
        });
      }
      const done = step.finished.join(' · ');
      const started = step.started.join(' · ');
      if (step.finished.length > 0 && step.started.length > 0) {
        return t('caption.handoff', '{sec} s — done: {done} → started at once: {started}', {
          sec: step.to,
          done,
          started,
        });
      }
      if (step.started.length > 0) {
        return t('caption.start', '{sec} s — started together: {started}', { sec: step.to, started });
      }
      return t('caption.finish', '{sec} s — done: {done}', { sec: step.to, done });
    }

    async function render(
      next: IndependentInParallelScene,
      prev: IndependentInParallelScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const flows = opts.animate && step !== null && prev !== null && prev.clock === step.from;
      if (!flows || !step) {
        draw(next, next.clock, 1);
        return;
      }
      const live = (): boolean => mine === gen && !destroyed;
      // 시계가 흐른다 — 일하는 상자들이 한꺼번에 차오른다
      if (step.to > step.from) {
        const ms = (step.to - step.from) * SWEEP_MS_PER_SECOND;
        const t0 = performance.now();
        for (;;) {
          if (!live()) return;
          const p = Math.min(1, (performance.now() - t0) / ms);
          draw(next, lerp(step.from, step.to, ease(p)), 0);
          if (p >= 1) break;
          await wait(FRAME_MS);
        }
      }
      // 빈 일꾼을 얻은 대상이 기다리는 자리에서 내려와 제 길이로 펴진다
      if (step.started.length > 0) {
        const t0 = performance.now();
        for (;;) {
          if (!live()) return;
          const p = Math.min(1, (performance.now() - t0) / SLIDE_MS);
          draw(next, step.to, ease(p));
          if (p >= 1) break;
          await wait(FRAME_MS);
        }
      }
      if (!live()) return;
      draw(next, next.clock, 1);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
