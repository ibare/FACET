/**
 * sixteen-milliseconds 의 그림.
 *
 * 가로는 시간이다. 위 줄은 예산(박자 0 ~ 박자 1), 아래 줄은 한 장의 일.
 * 단계가 하나 지날 때마다 그 몫이 예산 줄에서 잘려 일 줄로 떨어지고, 예산 막대의 왼끝이
 * 그만큼 오른쪽으로 깎여 들어온다. 박자 1 이 페인트 도중에 오면 박자 0 의 화면(앞 장)이
 * 박자 1 자리로 밀려와 다시 놓인다. 페인트가 박자를 넘겨 마저 끝나면 넘친 몫이 박자 선의
 * 반대쪽(남은 시간이 있던 쪽의 맞은편)에 자라고, 끝난 장은 그 뒤 첫 박자의 화면 자리로 간다.
 *
 * 장면이 정본이다. render 는 늘 drawStatic(next) 로 화면 전체를 세우고, 운동은 그 위에
 * "아직 못 온 만큼" 을 덧그린 뒤 drawStatic(next) 로 한 번 더 덮는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { SixteenMillisecondsScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 화면 칸의 가로 상한 (캔버스 폭에서 역산하고 이 값을 넘지 않는다) */
const SCREEN_W_MAX = 100;
const SCREEN_H = 34;
const SCREEN_Y = 10;

const BUDGET_Y = 82;
const BUDGET_H = 24;
const WORK_Y = 150;
const WORK_H = 28;
const LABEL_ROW_A = WORK_Y + WORK_H + 15;
const LABEL_ROW_GAP = 30;
const AXIS_Y = 256;
const CAPTION_Y = H - 12;

const FALL_MS = 450;
const SECOND_MS = 450;

/** 표시용 — 소수 첫째 자리까지. 셈은 끝까지 하고 여기서만 반올림한다. */
function fmt(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r === 0 ? 0 : r).toFixed(1);
}

/** 정수 좌표로 — -0 과 끝자리 부동소수를 걷어 낸다 */
function px(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 단계 식별자 → 표시 이름. 키는 리터럴로 적는다 */
const STAGE_NAME: Record<string, (t: Translate) => string> = {
  script: (t) => t('stage.script', 'Script'),
  style: (t) => t('stage.style', 'Style'),
  layout: (t) => t('stage.layout', 'Layout'),
  paint: (t) => t('stage.paint', 'Paint'),
};

function stageName(t: Translate, id: string): string {
  const name = STAGE_NAME[id];
  if (name === undefined) throw new Error(`sixteen-milliseconds-stage: 모르는 단계 ${id}`);
  return name(t);
}

type Refs = {
  blocks: Map<number, SVGGElement>;
  overWork: SVGRectElement | null;
  overBudget: SVGRectElement | null;
  remain: SVGRectElement | null;
  wait: SVGLineElement | null;
  beatLine: Map<number, SVGLineElement>;
  screens: Map<number, SVGGElement>;
};

type Geo = {
  x: (ms: number) => number;
  screenW: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
  weight = '400',
): SVGTextElement {
  const node = el(parent, 'text', {
    x: px(x),
    y: px(y),
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    fill,
    'text-anchor': anchor,
  });
  node.textContent = text;
  return node;
}

export const sixteenMillisecondsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let refs: Refs = emptyRefs();

    function emptyRefs(): Refs {
      return {
        blocks: new Map(),
        overWork: null,
        overBudget: null,
        remain: null,
        wait: null,
        beatLine: new Map(),
        screens: new Map(),
      };
    }

    function geometry(scene: SixteenMillisecondsScene): Geo | null {
      const base = scene.base;
      if (base === null) return null;
      const lastBeat = base.beats[base.beats.length - 1];
      if (lastBeat === undefined || !(lastBeat > 0)) {
        throw new Error('sixteen-milliseconds-stage: 박자가 둘 이상 있어야 한다');
      }
      const screenW = Math.min(SCREEN_W_MAX, W * 0.16);
      const x0 = screenW / 2 + 10;
      const x1 = W - screenW / 2 - 10;
      return { x: (ms: number) => x0 + ((x1 - x0) * ms) / lastBeat, screenW };
    }

    function drawScreen(g: Element, cx: number, kind: 'old' | 'new' | 'empty', w: number): SVGGElement {
      const grp = el(g, 'g', {});
      const x = cx - w / 2;
      if (kind === 'empty') {
        el(grp, 'rect', {
          x: px(x), y: px(SCREEN_Y), width: px(w), height: px(SCREEN_H), rx: '4',
          fill: 'none', stroke: c.border, 'stroke-dasharray': '4 3',
        });
        return grp;
      }
      el(grp, 'rect', {
        x: px(x), y: px(SCREEN_Y), width: px(w), height: px(SCREEN_H), rx: '4',
        fill: kind === 'old' ? c.bgSubtle : c.bg,
        stroke: kind === 'old' ? c.textMuted : c.primary,
        'stroke-width': kind === 'old' ? '1' : '2',
      });
      const text = kind === 'old' ? t('label.oldFrame', 'Old frame') : t('label.thisFrame', 'This frame');
      label(grp, cx, SCREEN_Y + SCREEN_H / 2 + 4, text, fontSizes.xs, kind === 'old' ? c.textMuted : c.text, 'middle', '600');
      return grp;
    }

    function drawStatic(scene: SixteenMillisecondsScene): void {
      svg.textContent = '';
      refs = emptyRefs();
      const geo = geometry(scene);
      const base = scene.base;
      if (geo === null || base === null) return;
      const { x } = geo;
      const deadline = base.beats[1];
      if (deadline === undefined) throw new Error('sixteen-milliseconds-stage: 박자 1 이 없다');
      const colors = categorical(base.stages.length);

      const root = el(svg, 'g', {});

      // 박자 선과 축
      el(root, 'line', {
        x1: px(x(0)), y1: px(AXIS_Y), x2: px(x(base.beats[base.beats.length - 1] ?? 0)), y2: px(AXIS_Y),
        stroke: c.border, 'stroke-width': '1',
      });
      for (const [k, at] of base.beats.entries()) {
        const hit = scene.arrived !== null && scene.arrived.beat === k;
        const line = el(root, 'line', {
          x1: px(x(at)), y1: px(SCREEN_Y + SCREEN_H), x2: px(x(at)), y2: px(AXIS_Y + 4),
          stroke: hit ? c.accent : c.textMuted,
          'stroke-width': hit ? '2' : '1',
        });
        if (!hit) line.setAttribute('stroke-dasharray', '3 3');
        refs.beatLine.set(k, line);
        label(root, x(at), AXIS_Y + 18, t('label.beat', 'Vsync {k}', { k }), fontSizes.xs, c.text, 'middle', '600');
        label(root, x(at), AXIS_Y + 32, t('label.ms', '{ms} ms', { ms: fmt(at) }), fontSizes.xs, c.textMuted, 'middle');
      }

      // 박자마다 화면에 무엇이 나와 있나
      for (const [k] of base.beats.entries()) {
        let kind: 'old' | 'new' | 'empty' = 'empty';
        if (k === 0) kind = 'old';
        else if (scene.arrived !== null && scene.arrived.beat === k) kind = scene.arrived.newFrames === 0 ? 'old' : 'new';
        else if (scene.shown !== null && scene.shown.beat === k) kind = 'new';
        const at = base.beats[k];
        if (at === undefined) continue;
        refs.screens.set(k, drawScreen(root, x(at), kind, geo.screenW));
      }

      // 예산 줄 — 박자 0 ~ 박자 1 의 틀, 깎이고 남은 막대, 넘친 몫
      label(root, x(0) + 4, BUDGET_Y - 8, t('label.budget', 'Budget'), fontSizes.sm, c.textMuted, 'start', '600');
      el(root, 'rect', {
        x: px(x(0)), y: px(BUDGET_Y), width: px(x(deadline) - x(0)), height: px(BUDGET_H),
        fill: 'none', stroke: c.border, 'stroke-dasharray': '4 3',
      });
      refs.remain = el(root, 'rect', {
        x: px(x(scene.cut)), y: px(BUDGET_Y), width: px(Math.max(0, x(deadline) - x(scene.cut))), height: px(BUDGET_H),
        fill: c.primary,
      });
      label(root, x(deadline) - 6, BUDGET_Y - 8, t('label.left', 'Left: {ms} ms', { ms: fmt(scene.left) }),
        fontSizes.sm, c.text, 'end', '600');
      if (scene.over !== null && scene.shown !== null) {
        const lastBlock = scene.blocks[scene.blocks.length - 1];
        if (lastBlock === undefined) throw new Error('sixteen-milliseconds-stage: 넘친 몫에 막대가 없다');
        refs.overBudget = el(root, 'rect', {
          x: px(x(deadline)), y: px(BUDGET_Y), width: px(x(lastBlock.end) - x(deadline)), height: px(BUDGET_H),
          fill: c.danger,
        });
        label(root, x(deadline) + 6, BUDGET_Y - 8, t('label.over', 'Over: {ms} ms', { ms: fmt(scene.over) }),
          fontSizes.sm, c.danger, 'start', '600');
      }

      // 일 줄 — 떨어져 놓인 단계 막대
      label(root, x(0) + 4, WORK_Y - 8, t('label.work', 'Work'), fontSizes.sm, c.textMuted, 'start', '600');
      for (const b of scene.blocks) {
        const s = base.stages[b.index];
        const color = colors[b.index];
        if (s === undefined || color === undefined) throw new Error(`sixteen-milliseconds-stage: 단계 ${b.index} 가 없다`);
        const g = el(root, 'g', {});
        const inEnd = Math.min(b.end, deadline);
        el(g, 'rect', {
          x: px(x(b.start)), y: px(WORK_Y), width: px(x(inEnd) - x(b.start)), height: px(WORK_H),
          fill: color, stroke: c.bg, 'stroke-width': '1',
        });
        refs.blocks.set(b.index, g);
        if (b.end > deadline) {
          refs.overWork = el(root, 'rect', {
            x: px(x(deadline)), y: px(WORK_Y), width: px(x(b.end) - x(deadline)), height: px(WORK_H),
            fill: color, stroke: c.danger, 'stroke-width': '2',
          });
        }
        // 이름과 몫 — 이웃과 겹치지 않게 두 줄을 번갈아 쓴다
        const cx = (x(b.start) + x(b.end)) / 2;
        const row = LABEL_ROW_A + (b.index % 2) * LABEL_ROW_GAP;
        if (b.index % 2 === 1) {
          el(root, 'line', {
            x1: px(cx), y1: px(WORK_Y + WORK_H + 2), x2: px(cx), y2: px(row - 11),
            stroke: c.border, 'stroke-width': '1',
          });
        }
        label(root, cx, row, stageName(t, s.id), fontSizes.xs, c.text, 'middle', '600');
        label(root, cx, row + 13, t('label.ms', '{ms} ms', { ms: fmt(s.ms) }), fontSizes.xs, c.textMuted, 'middle');
      }

      // 끝난 장이 나올 박자까지 기다리는 자리
      if (scene.shown !== null) {
        const lastBlock = scene.blocks[scene.blocks.length - 1];
        if (lastBlock === undefined) throw new Error('sixteen-milliseconds-stage: 나올 장에 막대가 없다');
        refs.wait = el(root, 'line', {
          x1: px(x(lastBlock.end)), y1: px(WORK_Y + WORK_H / 2),
          x2: px(x(scene.shown.at)), y2: px(WORK_Y + WORK_H / 2),
          stroke: c.textMuted, 'stroke-width': '2', 'stroke-dasharray': '2 4',
        });
      }

      // 캡션 — 지금 일어난 일만
      label(root, W / 2, CAPTION_Y, caption(scene), fontSizes.md, c.text, 'middle', '600');
    }

    function caption(scene: SixteenMillisecondsScene): string {
      const base = scene.base;
      if (base === null) return '';
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Budget for one frame: {budget} ms', { budget: fmt(base.budget) });
      }
      const s = base.stages[step.index];
      if (s === undefined) throw new Error(`sixteen-milliseconds-stage: 단계 ${step.index} 가 없다`);
      const stage = stageName(t, s.id);
      if (step.kind === 'stage') {
        return t('caption.stage', 'Spent on {stage}: {ms} ms · Left: {left} ms', {
          stage,
          ms: fmt(step.to - step.from),
          left: fmt(scene.left),
        });
      }
      if (step.kind === 'beat') {
        if (scene.arrived === null) throw new Error('sixteen-milliseconds-stage: 박자 걸음에 도착 기록이 없다');
        return t('caption.beat', 'Vsync {beat} arrives mid-{stage} ({done} of {ms} ms) · New frames: {n}', {
          beat: step.beat,
          stage,
          done: fmt(step.done),
          ms: fmt(step.ms),
          n: scene.arrived.newFrames,
        });
      }
      return t('caption.late', '{stage} ends at {end} ms · Late: {late} ms · Shown at vsync {beat} ({at} ms)', {
        stage,
        end: fmt(step.to),
        late: fmt(step.late),
        beat: step.shownBeat,
        at: fmt(step.shownAt),
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 한 시계로 p = 0 → 1 을 흘린다. 세대가 바뀌거나 거두어지면 false. */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - t0) / ms);
        frame(ease(p));
        if (p >= 1) return true;
        await wait(16);
      }
    }

    async function render(
      next: SixteenMillisecondsScene,
      _prev: SixteenMillisecondsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;
      const geo = geometry(next);
      const base = next.base;
      if (geo === null || base === null) return;
      const { x } = geo;
      const step = next.step;
      const deadline = base.beats[1];
      if (deadline === undefined) return;

      if (step.kind === 'stage' || step.kind === 'beat') {
        // 예산에서 그 몫이 잘려 일 줄로 떨어진다. 예산 막대의 왼끝이 깎여 들어온다
        const block = refs.blocks.get(step.index);
        const remain = refs.remain;
        const lift = BUDGET_Y - WORK_Y;
        const ok = await tween(FALL_MS, mine, (p) => {
          block?.setAttribute('transform', `translate(0 ${px(lift * (1 - p))})`);
          if (remain !== null) {
            const cut = step.from + (step.to - step.from) * p;
            remain.setAttribute('x', px(x(cut)));
            remain.setAttribute('width', px(Math.max(0, x(deadline) - x(cut))));
          }
        });
        if (!ok) return;
      }
      if (step.kind === 'beat') {
        // 박자가 온다 — 박자 선이 번쩍이고, 박자 0 의 화면이 박자 1 자리로 밀려와 다시 놓인다
        const line = refs.beatLine.get(step.beat);
        const screen = refs.screens.get(step.beat);
        const b0 = base.beats[0];
        const bk = base.beats[step.beat];
        if (b0 === undefined || bk === undefined) return;
        const shift = x(b0) - x(bk);
        const ok = await tween(SECOND_MS, mine, (p) => {
          line?.setAttribute('stroke-width', px(2 + 4 * (1 - p)));
          screen?.setAttribute('transform', `translate(${px(shift * (1 - p))} 0)`);
        });
        if (!ok) return;
      }
      if (step.kind === 'late') {
        // 페인트가 박자를 넘겨 마저 끝난다 — 넘친 몫이 박자 선 반대쪽에 자란다
        const overWork = refs.overWork;
        const overBudget = refs.overBudget;
        const full = x(step.to) - x(step.from);
        const ok = await tween(FALL_MS, mine, (p) => {
          overWork?.setAttribute('width', px(full * p));
          overBudget?.setAttribute('width', px(full * p));
        });
        if (!ok) return;
        // 끝난 장이 그 뒤 첫 박자의 화면 자리로 간다
        const screen = refs.screens.get(step.shownBeat);
        if (screen !== undefined) {
          const sx = x(step.shownAt);
          const dx = x(step.to) - sx;
          const dy = WORK_Y + WORK_H / 2 - (SCREEN_Y + SCREEN_H / 2);
          const wait = refs.wait;
          const ok2 = await tween(SECOND_MS, mine, (p) => {
            const q = 1 - p;
            wait?.setAttribute('x2', px(x(step.to) + (sx - x(step.to)) * p));
            const s = 0.4 + 0.6 * p;
            // 칸의 가운데를 기준으로 줄였다 키운다
            const cx = sx + dx * q;
            const cy = SCREEN_Y + SCREEN_H / 2 + dy * q;
            screen.setAttribute(
              'transform',
              `translate(${px(cx)} ${px(cy)}) scale(${px(s)}) translate(${px(-sx)} ${px(-(SCREEN_Y + SCREEN_H / 2))})`,
            );
          });
          if (!ok2) return;
        }
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
