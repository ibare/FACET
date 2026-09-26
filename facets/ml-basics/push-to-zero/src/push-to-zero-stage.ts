import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PushToZeroScene } from './scene';

/**
 * push-to-zero 무대 — 무게마다 가로 줄 하나, 가운데 0 의 벽.
 *
 * 동사 "0 에 붙는다": 갱신마다 구슬(무게)이 먼저 데이터 쪽(a)으로 조금 밀려났다가 L1 끌기에
 * 같은 폭만큼 벽 쪽으로 끌려온다. 끌린 자리는 노란 띠로 남아 살아 있는 줄마다 같은 길이다.
 * 벽에 닿은 구슬은 네모로 바뀌어 벽에 붙고, 다음 갱신에서 들렸다가 도로 눌린다.
 */

const H = 376;
const CAPTION_Y = 22;
const SUBCAPTION_Y = 42;
const LEGEND_Y = 66;
const ROWS_TOP = 80;
const ROWS_BOTTOM = 324;
const ROW_H_MAX = 44;
const LABEL_X = 22;
const AXIS_LEFT = 64;
const PULL_COL_W = 72;
const BEAD_R = 7;
const SQUARE = 13;
const BAND_H = 8;
const VALUE_CLEAR = 24;
const WALL_LABEL_Y = 342;
const BADGE_Y = 366;

const MOVE_MS = 600;
const PHASE_SPLIT = 0.47;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

function fmt(v: number): string {
  return v.toFixed(2);
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(q: number): number {
  const c = Math.min(1, Math.max(0, q));
  return c * c * (3 - 2 * c);
}

/** 한 프레임에 그릴 것 — 정적 그리기와 운동이 같은 그리기를 쓴다. */
type Pose = {
  pos: number[];
  /** 띠의 시작(데이터 걸음 뒤 자리). null 이면 띠가 없다 */
  bandFrom: (number | null)[];
  square: boolean[];
  showValues: boolean;
};

export const pushToZeroStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const axisRight = W - PULL_COL_W - 12;
    const pullColX = W - PULL_COL_W / 2 - 6;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function el(name: string, attrs: Record<string, string | number>): SVGElement {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      svg.appendChild(node);
      return node;
    }

    function addText(
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; anchor?: string; weight?: string; mono?: boolean },
    ): void {
      const node = el('text', {
        x: round(x),
        y: round(y),
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
    }

    function xOf(scene: PushToZeroScene, v: number): number {
      const { lo, hi } = scene.span;
      const left = AXIS_LEFT + BEAD_R + 4;
      const right = axisRight - BEAD_R - 4;
      return left + ((v - lo) / (hi - lo)) * (right - left);
    }

    function rowY(scene: PushToZeroScene, i: number): number {
      const rowH = Math.min(ROW_H_MAX, (ROWS_BOTTOM - ROWS_TOP) / scene.ids.length);
      return ROWS_TOP + rowH * (i + 0.5);
    }

    function captionLines(scene: PushToZeroScene): { main: string; sub: string } {
      const step = scene.step;
      if (step.kind === 'start') {
        return {
          main: t('caption.start', 'Update 0 · weights fitted without the penalty'),
          sub: t('caption.pullWidth', 'L1 pull per update: {pull}', { pull: fmt(scene.pull) }),
        };
      }
      const main = t('caption.update', 'Update {t} · pull on live weights: {pull}', {
        t: step.t,
        pull: fmt(step.livePull),
      });
      if (step.newlyZero.length > 0) {
        const ids = step.newlyZero.map((k) => {
          const id = scene.ids[k];
          if (id === undefined) throw new Error(`push-to-zero 무대: 무게 자리 ${k} 가 없다`);
          return id;
        });
        return { main, sub: t('caption.reach', 'Reached 0 this update: {ids}', { ids: ids.join(' · ') }) };
      }
      if (step.held.length > 0) {
        // 붙어 있는 무게마다 이번 갱신에 L1 이 되누른 폭 — 알고리즘이 셈한 l1 을 그대로 읽는다
        const list = step.held.map((k) => {
          const id = scene.ids[k];
          const back = step.l1[k];
          if (id === undefined || back === undefined) throw new Error(`push-to-zero 무대: 무게 자리 ${k} 가 없다`);
          return `${id} ${fmt(back)}`;
        });
        return { main, sub: t('caption.hold', 'Pressed back at 0 by L1: {list}', { list: list.join(' · ') }) };
      }
      return { main, sub: '' };
    }

    function draw(scene: PushToZeroScene, pose: Pose): void {
      svg.textContent = '';
      const n = scene.ids.length;
      const { main, sub } = captionLines(scene);
      addText(LABEL_X, CAPTION_Y, main, { size: fontSizes.md, fill: colors.text, weight: '600' });
      if (sub !== '') addText(LABEL_X, SUBCAPTION_Y, sub, { size: fontSizes.sm, fill: colors.textMuted });

      // 범례 — 빈 고리 = 벌점 없이 맞춘 자리, 노란 띠 = 이번 갱신의 L1 끌기
      el('circle', { cx: LABEL_X + 6, cy: LEGEND_Y, r: 5, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5 });
      addText(LABEL_X + 16, LEGEND_Y, t('legend.fitted', 'fit without penalty (a)'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      const bandLegendX = LABEL_X + 190;
      el('rect', { x: bandLegendX, y: LEGEND_Y - BAND_H / 2, width: 22, height: BAND_H, rx: 2, fill: colors.accent });
      addText(bandLegendX + 30, LEGEND_Y, t('legend.pull', 'L1 pull this update'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      addText(pullColX, LEGEND_Y, t('label.pullColumn', 'L1 pull'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });

      // 줄과 0 의 벽
      const wallX = xOf(scene, 0);
      const top = rowY(scene, 0) - 16;
      const bottom = rowY(scene, n - 1) + 16;
      for (let i = 0; i < n; i += 1) {
        const y = rowY(scene, i);
        el('line', {
          x1: round(xOf(scene, scene.span.lo)),
          y1: round(y),
          x2: round(xOf(scene, scene.span.hi)),
          y2: round(y),
          stroke: colors.border,
          'stroke-width': 1,
        });
      }
      el('line', { x1: round(wallX), y1: round(top), x2: round(wallX), y2: round(bottom), stroke: colors.text, 'stroke-width': 3 });
      addText(wallX, WALL_LABEL_Y, '0', { size: fontSizes.md, fill: colors.text, anchor: 'middle', weight: '700', mono: true });

      for (let i = 0; i < n; i += 1) {
        const y = rowY(scene, i);
        const id = scene.ids[i]!;
        const a = scene.fitted[i]!;
        const w = pose.pos[i]!;
        addText(LABEL_X, y, id, { size: fontSizes.sm, fill: colors.text, mono: true });

        // 벌점 없이 맞춘 자리 a
        el('circle', { cx: round(xOf(scene, a)), cy: round(y), r: BEAD_R + 2, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5 });

        // 이번 갱신의 L1 끌기 띠
        const bandFrom = pose.bandFrom[i];
        if (bandFrom !== null && bandFrom !== undefined) {
          const x1 = xOf(scene, bandFrom);
          const x2 = xOf(scene, w);
          const left = Math.min(x1, x2);
          const width = Math.abs(x2 - x1);
          if (width > 0.01) {
            el('rect', { x: round(left), y: round(y - BAND_H / 2), width: round(width), height: BAND_H, rx: 2, fill: colors.accent });
          }
        }

        // 무게 — 살아 있으면 구슬, 0 에 붙었으면 네모
        const x = xOf(scene, w);
        if (pose.square[i] === true) {
          el('rect', {
            x: round(x - SQUARE / 2),
            y: round(y - SQUARE / 2),
            width: SQUARE,
            height: SQUARE,
            fill: colors.accent,
            stroke: colors.text,
            'stroke-width': 1.5,
          });
        } else {
          el('circle', { cx: round(x), cy: round(y), r: BEAD_R, fill: colors.primary, stroke: colors.bg, 'stroke-width': 1.5 });
        }
        if (pose.showValues) {
          // 벽에 가까운 수는 벽을 가로지르지 않게 무게 쪽으로 비켜 선다 (0 은 오른쪽)
          const nearWall = Math.abs(x - wallX) < VALUE_CLEAR;
          const labelX = nearWall ? (w < 0 ? wallX - 5 : wallX + 5) : x;
          const anchor = nearWall ? (w < 0 ? 'end' : 'start') : 'middle';
          addText(labelX, y - BEAD_R - 9, fmt(w), {
            size: fontSizes.xs,
            fill: pose.square[i] === true ? colors.textMuted : colors.text,
            anchor,
            mono: true,
          });
        }
      }

      // 끌린 폭 열 — 이번 갱신에서 무게마다 L1 이 끈 몫
      const step = scene.step;
      if (step.kind === 'update' && pose.showValues) {
        for (let i = 0; i < n; i += 1) {
          const live = step.to[i] !== 0;
          addText(pullColX, rowY(scene, i), fmt(step.l1[i]!), {
            size: fontSizes.sm,
            fill: live ? colors.text : colors.textMuted,
            anchor: 'middle',
            weight: live ? '600' : '400',
            mono: true,
          });
        }
      }

      addText(W - 16, BADGE_Y, t('badge.zeros', 'Weights at 0: {n}', { n: scene.zeroCount }), {
        size: fontSizes.md,
        fill: colors.text,
        anchor: 'end',
        weight: '700',
      });
    }

    function drawStatic(scene: PushToZeroScene): void {
      const step = scene.step;
      draw(scene, {
        pos: scene.w.slice(),
        bandFrom: step.kind === 'update' ? step.half.slice() : scene.w.map(() => null),
        square: scene.w.map((v) => v === 0),
        showValues: true,
      });
    }

    function poseAt(scene: PushToZeroScene, p: number): Pose {
      const step = scene.step;
      if (step.kind !== 'update') throw new Error('push-to-zero 무대: 갱신 걸음이 아닌데 운동을 그리려 한다');
      const q1 = ease(p / PHASE_SPLIT);
      const q2 = ease((p - (1 - PHASE_SPLIT)) / PHASE_SPLIT);
      const pos = step.from.map((f, i) => {
        const h = step.half[i]!;
        const to = step.to[i]!;
        return q2 > 0 ? h + (to - h) * q2 : f + (h - f) * q1;
      });
      return {
        pos,
        bandFrom: step.half.map((h) => (q2 > 0 ? h : null)),
        square: step.from.map((v) => v === 0),
        showValues: false,
      };
    }

    function clearPending(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function flow(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: PushToZeroScene, prev: PushToZeroScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      clearPending();
      if (destroyed) return;
      const step = next.step;
      // prev 는 흐를지 고르는 데만 — 바로 앞 갱신에서 온 걸음일 때만 흘린다
      const flows = opts.animate && step.kind === 'update' && prev !== null && prev.t === step.t - 1;
      if (!flows) {
        drawStatic(next);
        return;
      }
      await flow(MOVE_MS, mine, (p) => draw(next, poseAt(next, p)));
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        clearPending();
        svg.textContent = '';
      },
    };
  },
};
