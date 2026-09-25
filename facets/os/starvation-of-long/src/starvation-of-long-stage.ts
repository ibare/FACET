/**
 * starvation-of-long 의 stage — 고를 때마다 짧은 것이 줄 앞의 긴 것을 뛰어넘어 CPU 로 오른다.
 *
 * 동사는 "건너뛰어진다". 고른 것은 줄에서 자기보다 앞에 선 것 위로 포물선을 그리며 넘어가고,
 * 건너뛰어진 것의 머리 위에는 넘어간 자취가 활 하나로 남는다. 활은 쌓이기만 하고 긴 것의 몸은
 * 그대로다 — 길이도 자리도 바뀌지 않는다. 몸 아래 대기의 수만 불어난다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { StarvationScene, StarvationSceneProc } from './scene.js';

const H = 312;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 20;
const ROW_Y = 110;
const BOX_H = 36;
const DONE_Y = 216;
const GAP = 10;
const DONE_GAP = 14;
const CPU_GAP = 28;
const CPU_PAD = 10;
const UNIT_MAX = 22;
const ARC_BASE = 8;
const ARC_STEP_MAX = 5;
const ARC_TOP_MAX = 36;
const PHASE_A_MS = 350;
const PHASE_B_MS = 560;

type Pt = { x: number; y: number };

function r(v: number): string {
  const n = Math.round(v * 100) / 100;
  return String(Object.is(n, -0) ? 0 : n);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** 틀 — 캔버스 폭에서 한 틱 길이의 가로 폭과 CPU 칸을 역산한다. */
function frame(procs: StarvationSceneProc[]): {
  unit: number;
  cpuX: number;
  cpuW: number;
  lineR: number;
} {
  const sum = procs.reduce((s, p) => s + p.burst, 0);
  const max = procs.reduce((m, p) => Math.max(m, p.burst), 0);
  const avail = PIECE_CANVAS_W - PAD * 2 - CPU_GAP - CPU_PAD * 2 - GAP * Math.max(0, procs.length - 1);
  const unit = sum + max > 0 ? Math.min(UNIT_MAX, avail / (sum + max)) : UNIT_MAX;
  const cpuW = max * unit + CPU_PAD * 2;
  const cpuX = PIECE_CANVAS_W - PAD - cpuW;
  return { unit, cpuX, cpuW, lineR: cpuX - CPU_GAP };
}

export const starvationOfLongStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const names: Record<string, string> = {
      long: t('label.long', 'Long job'),
    };
    const shown = (id: string): string => names[id] ?? id.toUpperCase();

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    type Built = {
      groups: Map<string, SVGGElement>;
      bodies: Map<string, SVGRectElement>;
      inks: Map<string, SVGTextElement>;
      /** 이번 걸음에 새로 생긴 활 (건너뛰어진 것마다 맨 위 활 하나) */
      freshArcs: Map<string, SVGPathElement>;
    };

    function widthOf(scene: StarvationScene, unit: number, id: string): number {
      const p = scene.procs.find((q) => q.id === id);
      return p === undefined ? 0 : p.burst * unit;
    }

    function linePos(scene: StarvationScene, unit: number, lineR: number, order: string[]): Map<string, Pt> {
      const out = new Map<string, Pt>();
      let right = lineR;
      for (const id of order) {
        const w = widthOf(scene, unit, id);
        out.set(id, { x: right - w, y: ROW_Y });
        right -= w + GAP;
      }
      return out;
    }

    function cpuPos(scene: StarvationScene, unit: number, cpuX: number, cpuW: number, id: string): Pt {
      return { x: cpuX + (cpuW - widthOf(scene, unit, id)) / 2, y: ROW_Y };
    }

    function donePos(scene: StarvationScene, unit: number): Map<string, Pt> {
      const out = new Map<string, Pt>();
      let x = PAD;
      for (const id of scene.done) {
        out.set(id, { x, y: DONE_Y });
        x += widthOf(scene, unit, id) + DONE_GAP;
      }
      return out;
    }

    function arcStep(scene: StarvationScene): number {
      const n = Math.max(1, scene.procs.length - 1);
      return Math.min(ARC_STEP_MAX, (ARC_TOP_MAX - ARC_BASE) / n);
    }

    function arcLift(scene: StarvationScene, k: number): number {
      return ARC_BASE + arcStep(scene) * (k - 1);
    }

    function place(g: SVGGElement, p: Pt): void {
      g.setAttribute('transform', `translate(${r(p.x)},${r(p.y)})`);
    }

    function drawStatic(scene: StarvationScene): Built {
      svg.textContent = '';
      const built: Built = {
        groups: new Map(),
        bodies: new Map(),
        inks: new Map(),
        freshArcs: new Map(),
      };
      const { unit, cpuX, cpuW, lineR } = frame(scene.procs);
      const smPx = parseFloat(fontSizes.sm);
      const mdPx = parseFloat(fontSizes.md);

      // 줄의 바닥선과 이름
      svg.appendChild(
        el('line', {
          x1: r(PAD),
          y1: r(ROW_Y + BOX_H + 3),
          x2: r(lineR),
          y2: r(ROW_Y + BOX_H + 3),
          stroke: colors.border,
          'stroke-width': '2',
        }),
      );
      const lineLabel = el('text', {
        x: r(PAD),
        y: r(ROW_Y - 58),
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      lineLabel.textContent = t('label.line', 'Ready line');
      svg.appendChild(lineLabel);

      // CPU 칸
      svg.appendChild(
        el('rect', {
          x: r(cpuX),
          y: r(ROW_Y - CPU_PAD),
          width: r(cpuW),
          height: r(BOX_H + CPU_PAD * 2),
          rx: '6',
          fill: colors.bgSubtle,
          stroke: colors.textMuted,
          'stroke-width': '1.5',
        }),
      );
      const cpuLabel = el('text', {
        x: r(cpuX),
        y: r(ROW_Y - 58),
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      cpuLabel.textContent = t('label.cpu', 'CPU');
      svg.appendChild(cpuLabel);

      // 끝난 것의 자리 이름
      const doneLabel = el('text', {
        x: r(PAD),
        y: r(DONE_Y - 10),
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      doneLabel.textContent = t('label.done', 'Done');
      svg.appendChild(doneLabel);

      // 프로세스 — 줄 · CPU · 끝난 자리
      const pos = new Map<string, Pt>();
      for (const [id, p] of linePos(scene, unit, lineR, scene.line)) pos.set(id, p);
      if (scene.cpu !== null) pos.set(scene.cpu, cpuPos(scene, unit, cpuX, cpuW, scene.cpu));
      for (const [id, p] of donePos(scene, unit)) pos.set(id, p);

      const fresh = new Set<string>(scene.step.kind === 'pick' ? scene.step.passed : []);

      for (const proc of scene.procs) {
        const at = pos.get(proc.id);
        if (at === undefined) continue;
        const w = proc.burst * unit;
        const where = scene.cpu === proc.id ? 'cpu' : scene.done.includes(proc.id) ? 'done' : 'line';
        const g = el('g', {});
        place(g, at);

        // 머리 위에 쌓인 활 — 뛰어넘긴 횟수
        const n = scene.skips[proc.id] ?? 0;
        for (let k = 1; k <= n; k += 1) {
          const lift = arcLift(scene, k);
          const arc = el('path', {
            d: `M ${r(1)} ${r(-2)} Q ${r(w / 2)} ${r(-2 - lift * 2)} ${r(w - 1)} ${r(-2)}`,
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': '2',
            'stroke-linecap': 'round',
            pathLength: '1',
          });
          g.appendChild(arc);
          if (k === n && fresh.has(proc.id)) built.freshArcs.set(proc.id, arc);
        }

        const body = el('rect', {
          x: '0',
          y: '0',
          width: r(w),
          height: r(BOX_H),
          rx: '4',
          fill:
            where === 'cpu' ? colors.itemActive : where === 'done' ? colors.itemSorted : colors.itemDefault,
          stroke: where === 'line' ? colors.text : 'none',
          'stroke-width': '1.5',
        });
        g.appendChild(body);
        const ink = el('text', {
          x: r(w / 2),
          y: r(BOX_H / 2 + mdPx * 0.35),
          fill: where === 'cpu' ? colors.stateInk : where === 'done' ? colors.textInverse : colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
          'text-anchor': 'middle',
        });
        ink.textContent = shown(proc.id);
        g.appendChild(ink);

        const wait = scene.waits[proc.id];
        if (wait !== undefined) {
          const waitText = el('text', {
            x: r(w / 2),
            y: r(BOX_H + CPU_PAD + 6 + smPx),
            fill: colors.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
          });
          waitText.textContent = t('label.wait', 'Wait: {n}', { n: wait });
          g.appendChild(waitText);
        }

        svg.appendChild(g);
        built.groups.set(proc.id, g);
        built.bodies.set(proc.id, body);
        built.inks.set(proc.id, ink);
      }

      // 캡션 — 지금 일어난 일만
      const caption = el('text', {
        x: r(PAD),
        y: r(H - 12),
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      caption.textContent = captionOf(scene);
      svg.appendChild(caption);
      return built;
    }

    function captionOf(scene: StarvationScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Tick {tick} · Waiting in line: {n}', {
          tick: step.tick,
          n: scene.line.length,
        });
      }
      if (step.kind === 'pick') {
        const skipped = step.passed[0];
        if (skipped === undefined) {
          return t('caption.alone', 'Tick {tick} · Nothing else is in line — {picked} runs. Wait: {w}', {
            tick: step.tick,
            picked: shown(step.picked),
            w: scene.waits[step.picked] ?? 0,
          });
        }
        return t('caption.skip', 'Tick {tick} · {picked} runs first, {skipped} is passed over. Times skipped: {n}', {
          tick: step.tick,
          picked: shown(step.picked),
          skipped: shown(skipped),
          n: scene.skips[skipped] ?? 0,
        });
      }
      if (step.kind === 'finish') {
        return t('caption.finish', 'Tick {tick} · {name} is done. Times skipped: {n} · Wait: {w} · Turnaround: {ta}', {
          tick: step.tick,
          name: shown(step.id),
          n: scene.skips[step.id] ?? 0,
          w: step.wait,
          ta: step.turnaround,
        });
      }
      return '';
    }

    function tween(ms: number, mine: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tickFrame = (now: number): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now - start) / ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          draw(e);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tickFrame(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tickFrame(n);
        });
        frames.add(id);
      });
    }

    function lerp(a: Pt, b: Pt, e: number): Pt {
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }

    function bezier(a: Pt, c: Pt, b: Pt, e: number): Pt {
      const u = 1 - e;
      return {
        x: u * u * a.x + 2 * u * e * c.x + e * e * b.x,
        y: u * u * a.y + 2 * u * e * c.y + e * e * b.y,
      };
    }

    async function animatePick(next: StarvationScene, built: Built, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'pick') return;
      const { unit, cpuX, cpuW, lineR } = frame(next.procs);
      const before = [...step.passed.slice(0, step.over.length), step.picked, ...step.passed.slice(step.over.length)];
      const beforePos = linePos(next, unit, lineR, before);
      const afterLine = linePos(next, unit, lineR, next.line);
      const doneAt = donePos(next, unit);
      const cpuAt = cpuPos(next, unit, cpuX, cpuW, step.picked);

      const pickedG = built.groups.get(step.picked);
      const pickedBody = built.bodies.get(step.picked);
      const pickedInk = built.inks.get(step.picked);
      const pickedFrom = beforePos.get(step.picked);
      if (pickedG === undefined || pickedBody === undefined || pickedInk === undefined || pickedFrom === undefined) {
        return;
      }

      // 고른 것은 아직 줄에 선 모습으로 기다린다
      pickedBody.setAttribute('fill', colors.itemDefault);
      pickedBody.setAttribute('stroke', colors.text);
      pickedInk.setAttribute('fill', colors.text);
      for (const [id, p] of beforePos) {
        const g = built.groups.get(id);
        if (g !== undefined) place(g, p);
      }
      for (const arc of built.freshArcs.values()) arc.setAttribute('stroke-dasharray', '1 1');
      for (const arc of built.freshArcs.values()) arc.setAttribute('stroke-dashoffset', '1');

      // 가 — 끝난 것은 끝난 자리로, 새로 온 것은 왼쪽에서 줄 끝으로
      const moversA: { g: SVGGElement; from: Pt; to: Pt }[] = [];
      if (step.finished !== null) {
        const g = built.groups.get(step.finished);
        const to = doneAt.get(step.finished);
        if (g !== undefined && to !== undefined) {
          moversA.push({ g, from: cpuPos(next, unit, cpuX, cpuW, step.finished), to });
        }
      }
      for (const id of step.arrived) {
        const g = built.groups.get(id);
        const to = beforePos.get(id);
        if (g !== undefined && to !== undefined) {
          moversA.push({ g, from: { x: -widthOf(next, unit, id) - GAP, y: ROW_Y }, to });
        }
      }
      if (moversA.length > 0) {
        for (const m of moversA) place(m.g, m.from);
        await tween(PHASE_A_MS, mine, (e) => {
          for (const m of moversA) place(m.g, lerp(m.from, m.to, e));
        });
        if (destroyed || mine !== gen) return;
      }

      // 나 — 고른 것이 앞에 선 것을 뛰어넘어 CPU 로. 건너뛰어진 것 위에 활이 그어진다
      pickedBody.setAttribute('fill', colors.itemActive);
      pickedBody.setAttribute('stroke', 'none');
      pickedInk.setAttribute('fill', colors.stateInk);
      let topLift = 0;
      for (const id of step.over) topLift = Math.max(topLift, arcLift(next, next.skips[id] ?? 0));
      const apexY = step.over.length > 0 ? ROW_Y - topLift - BOX_H - 12 : ROW_Y;
      const ctrl: Pt = { x: (pickedFrom.x + cpuAt.x) / 2, y: 2 * apexY - ROW_Y };
      const shifts: { g: SVGGElement; from: Pt; to: Pt }[] = [];
      for (const id of step.passed) {
        const g = built.groups.get(id);
        const from = beforePos.get(id);
        const to = afterLine.get(id);
        if (g !== undefined && from !== undefined && to !== undefined && (from.x !== to.x || from.y !== to.y)) {
          shifts.push({ g, from, to });
        }
      }
      await tween(PHASE_B_MS, mine, (e) => {
        place(pickedG, bezier(pickedFrom, ctrl, cpuAt, e));
        for (const s of shifts) place(s.g, lerp(s.from, s.to, e));
        for (const arc of built.freshArcs.values()) arc.setAttribute('stroke-dashoffset', r(1 - e));
      });
    }

    async function animateFinish(next: StarvationScene, built: Built, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'finish') return;
      const { unit, cpuX, cpuW } = frame(next.procs);
      const g = built.groups.get(step.id);
      const to = donePos(next, unit).get(step.id);
      if (g === undefined || to === undefined) return;
      const from = cpuPos(next, unit, cpuX, cpuW, step.id);
      place(g, from);
      await tween(PHASE_A_MS + 150, mine, (e) => place(g, lerp(from, to, e)));
    }

    return {
      async render(next: StarvationScene, _prev: StarvationScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const built = drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'pick') await animatePick(next, built, mine);
        else if (next.step.kind === 'finish') await animateFinish(next, built, mine);
        else return;
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
