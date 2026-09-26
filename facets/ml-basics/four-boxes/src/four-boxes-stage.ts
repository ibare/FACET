/**
 * four-boxes 무대 — 위에 기다리는 항목 열, 그 아래 두 번 갈라지는 길, 맨 아래 네 칸.
 *
 * 한 걸음에 항목 하나가 제자리에서 나와 "실제는?" 에서 한 번, "예측은?" 에서 또 한 번
 * 꺾여 제 칸 바닥의 빈 자리로 떨어진다. 칸 안에서는 아래 줄부터 채워 쌓는다.
 * 틀림을 담는 두 칸(놓침 · 헛짚음)은 테두리와 이름을 danger 로 가른다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { BOX_KEYS, boxOf, isWrongBox, type BoxKey } from './algorithm.js';
import type { FourBoxesScene } from './scene.js';

const H = 420;
/** 한 걸음의 운동 — 사양의 "운동 400 안쪽" */
const MOVE_MS = 380;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = { x: number; y: number };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** 꺾은선 위에서 길이 비율 u 인 자리. */
function along(points: readonly Point[], u: number): Point {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) throw new Error('four-boxes 무대: 길의 점이 비었다');
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  const first = points[0];
  if (first === undefined) throw new Error('four-boxes 무대: 길이 비었다');
  if (total === 0) return first;
  let rest = Math.min(Math.max(u, 0), 1) * total;
  for (let i = 0; i < lens.length; i += 1) {
    const len = lens[i];
    const a = points[i];
    const b = points[i + 1];
    if (len === undefined || a === undefined || b === undefined) break;
    if (rest <= len || i === lens.length - 1) {
      const k = len === 0 ? 1 : Math.min(rest / len, 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    rest -= len;
  }
  throw new Error('four-boxes 무대: 길 위의 자리를 찾지 못했다');
}

export const fourBoxesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const XS = parseFloat(fontSizes.xs);
    const SM = parseFloat(fontSizes.sm);
    const XL = parseFloat(fontSizes.xl);

    // ── 자리 — 캔버스 폭에서 역산한다 ──
    const W = PIECE_CANVAS_W;
    const MARGIN = 16;
    const CHIP_H = 20;
    const CHIP_GAP = 6;
    const QUEUE_Y = 26;
    const FORK1_Y = 78;
    const FORK2_Y = 140;
    const PILL_H = 24;
    const BOX_TOP = 198;
    const BOX_BOTTOM = 334;
    const COUNT_Y = BOX_BOTTOM + 24;
    const LABEL_Y = BOX_BOTTOM + 42;
    const CAPTION1_Y = H - 26;
    const CAPTION2_Y = H - 8;

    const colW = W / BOX_KEYS.length;
    const boxW = Math.min(150, colW - 12);
    const boxX = (k: BoxKey): number => colW * (BOX_KEYS.indexOf(k) + 0.5);
    const sideX = (actual: 0 | 1): number => (actual === 1 ? W / 4 : (3 * W) / 4);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, typeof value === 'number' ? String(r2(value)) : value);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      size: number,
      fill: string,
      opts: { anchor?: string; weight?: string; family?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          'font-family': opts.family ?? fonts.body,
          'font-size': size,
          'font-weight': opts.weight ?? 'normal',
          fill,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    function boxName(k: BoxKey): string {
      switch (k) {
        case 'TP':
          return t('box.TP', 'TP · true positive');
        case 'FN':
          return t('box.FN', 'FN · miss');
        case 'FP':
          return t('box.FP', 'FP · false alarm');
        case 'TN':
          return t('box.TN', 'TN · true negative');
      }
    }

    function className(c: 0 | 1): string {
      return c === 1 ? t('class.pos', 'positive') : t('class.neg', 'negative');
    }

    // ── 칸 안의 쌓는 자리 ──
    function stackGeom(total: number): { cols: number; pitchY: number } {
      const cols = Math.max(1, Math.floor((boxW - 8) / (chipW(total) + 4)));
      const rows = Math.ceil(total / cols);
      const room = BOX_BOTTOM - BOX_TOP - 10 - CHIP_H;
      const pitchY = rows <= 1 ? CHIP_H + 4 : Math.min(CHIP_H + 4, room / (rows - 1));
      return { cols, pitchY };
    }

    function chipW(total: number): number {
      return Math.min(40, (W - 2 * MARGIN - (total - 1) * CHIP_GAP) / total);
    }

    function queuePos(index: number, total: number): Point {
      const w = chipW(total);
      const rowW = total * w + (total - 1) * CHIP_GAP;
      const start = (W - rowW) / 2;
      return { x: start + index * (w + CHIP_GAP) + w / 2, y: QUEUE_Y };
    }

    function slotPos(box: BoxKey, slot: number, total: number): Point {
      const { cols, pitchY } = stackGeom(total);
      const w = chipW(total);
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const gridW = cols * w + (cols - 1) * 4;
      const x = boxX(box) - gridW / 2 + col * (w + 4) + w / 2;
      const y = BOX_BOTTOM - 6 - CHIP_H / 2 - row * pitchY;
      return { x, y };
    }

    function routeOf(index: number, actual: 0 | 1, box: BoxKey, slot: number, total: number): Point[] {
      return [
        queuePos(index, total),
        { x: W / 2, y: FORK1_Y },
        { x: sideX(actual), y: FORK2_Y },
        { x: boxX(box), y: BOX_TOP - 4 },
        slotPos(box, slot, total),
      ];
    }

    function chip(
      parent: Element,
      at: Point,
      id: string,
      total: number,
      look: 'queue' | 'right' | 'wrong' | 'current',
    ): SVGGElement {
      const w = chipW(total);
      const g = el('g', {}, parent);
      const fill = look === 'current' ? colors.accent : look === 'queue' ? colors.bgSubtle : colors.bg;
      const stroke =
        look === 'current'
          ? colors.stateInk
          : look === 'wrong'
            ? colors.danger
            : look === 'queue'
              ? colors.textMuted
              : colors.text;
      el(
        'rect',
        {
          x: at.x - w / 2,
          y: at.y - CHIP_H / 2,
          width: w,
          height: CHIP_H,
          rx: 4,
          fill,
          stroke,
          'stroke-width': look === 'current' ? 2 : 1.2,
        },
        g,
      );
      label(g, at.x, at.y + 0.5, id, XS, look === 'current' ? colors.stateInk : colors.text, {
        family: fonts.mono,
      });
      return g;
    }

    function pill(parent: Element, x: number, y: number, content: string): void {
      const w = Math.max(76, content.length * SM * 0.62 + 22);
      el(
        'rect',
        {
          x: x - w / 2,
          y: y - PILL_H / 2,
          width: w,
          height: PILL_H,
          rx: PILL_H / 2,
          fill: colors.bgSubtle,
          stroke: colors.textMuted,
          'stroke-width': 1,
        },
        parent,
      );
      label(parent, x, y + 0.5, content, SM, colors.text, { weight: '600' });
    }

    function edge(parent: Element, a: Point, b: Point, taken: boolean): void {
      el(
        'line',
        {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: taken ? colors.accent : colors.border,
          'stroke-width': taken ? 4 : 1.5,
          'stroke-linecap': 'round',
        },
        parent,
      );
    }

    type Drawn = { mover: SVGGElement | null; count: SVGTextElement | null };

    /** 그 장면의 화면 전체. 정본이라 요소는 이미 끝 자리에 서 있다. */
    function drawStatic(scene: FourBoxesScene): Drawn {
      svg.textContent = '';
      const total = scene.items.length;
      const step = scene.step;
      const root = el('g', {}, svg);

      // 길 — 첫 갈림(실제) 과 두 번째 갈림(예측)
      const edges = el('g', {}, root);
      const fork1Bottom = { x: W / 2, y: FORK1_Y + PILL_H / 2 };
      for (const actual of [1, 0] as const) {
        const fx = sideX(actual);
        const takenSide = step !== null && step.actual === actual;
        edge(edges, fork1Bottom, { x: fx, y: FORK2_Y - PILL_H / 2 }, takenSide);
        const midX = (W / 2 + fx) / 2;
        const midY = (FORK1_Y + FORK2_Y) / 2;
        label(edges, midX + (actual === 1 ? -14 : 14), midY, className(actual), XS, colors.textMuted, {
          anchor: actual === 1 ? 'end' : 'start',
        });
        for (const predicted of [1, 0] as const) {
          const box = boxOf(actual, predicted);
          const bx = boxX(box);
          const taken = step !== null && step.box === box;
          edge(edges, { x: fx, y: FORK2_Y + PILL_H / 2 }, { x: bx, y: BOX_TOP }, taken);
          const lx = (fx + bx) / 2 + (bx < fx ? -8 : 8);
          label(edges, lx, (FORK2_Y + BOX_TOP) / 2 + 2, className(predicted), XS, colors.textMuted, {
            anchor: bx < fx ? 'end' : 'start',
          });
        }
      }

      const forks = el('g', {}, root);
      pill(forks, W / 2, FORK1_Y, t('fork.actual', 'Actual?'));
      pill(forks, sideX(1), FORK2_Y, t('fork.predicted', 'Predicted?'));
      pill(forks, sideX(0), FORK2_Y, t('fork.predicted', 'Predicted?'));

      // 네 칸
      const boxes = el('g', {}, root);
      let count: SVGTextElement | null = null;
      for (const k of BOX_KEYS) {
        const wrong = isWrongBox(k);
        const cx = boxX(k);
        el(
          'rect',
          {
            x: cx - boxW / 2,
            y: BOX_TOP,
            width: boxW,
            height: BOX_BOTTOM - BOX_TOP,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: wrong ? colors.danger : colors.text,
            'stroke-width': 1.5,
          },
          boxes,
        );
        if (scene.counts !== null) {
          const node = label(boxes, cx, COUNT_Y, String(scene.counts[k]), XL, wrong ? colors.danger : colors.text, {
            weight: '700',
          });
          if (step !== null && step.box === k) count = node;
        }
        label(boxes, cx, LABEL_Y, boxName(k), XS, wrong ? colors.danger : colors.textMuted);
      }

      // 떨어진 항목 — 칸 안에 쌓였다
      const chips = el('g', {}, root);
      let mover: SVGGElement | null = null;
      for (const landed of scene.landed) {
        const current = step !== null && step.id === landed.id;
        const g = chip(
          chips,
          slotPos(landed.box, landed.slot, total),
          landed.id,
          total,
          current ? 'current' : isWrongBox(landed.box) ? 'wrong' : 'right',
        );
        if (current) mover = g;
      }
      // 기다리는 항목 — 제자리에 남아 있다
      for (const [index, item] of scene.items.entries()) {
        if (index < scene.landed.length) continue;
        chip(chips, queuePos(index, total), item.id, total, 'queue');
      }

      // 캡션 — 지금 일어난 일
      const caption = el('g', {}, root);
      if (scene.counts !== null) {
        if (step === null) {
          label(caption, W / 2, CAPTION1_Y, t('caption.start', 'Items waiting: {n}', { n: total }), SM, colors.text);
        } else {
          label(
            caption,
            W / 2,
            CAPTION1_Y,
            t('caption.drop', '{id} — actual: {actual} · predicted: {predicted} → {box}', {
              id: step.id,
              actual: className(step.actual),
              predicted: className(step.predicted),
              box: boxName(step.box),
            }),
            SM,
            colors.text,
          );
        }
        if (scene.summary !== null) {
          const s = scene.summary;
          label(
            caption,
            W / 2,
            CAPTION2_Y,
            t('caption.done', 'Right: {right} (TP + TN) · Wrong: {wrong} (FP: {fp} + FN: {fn}) · Accuracy: {acc}', {
              right: s.right,
              wrong: s.wrong,
              fp: s.fp,
              fn: s.fn,
              acc: s.accuracy.toFixed(2),
            }),
            SM,
            colors.text,
            { weight: '600' },
          );
        }
      }
      return { mover, count };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function fall(scene: FourBoxesScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) throw new Error('four-boxes 무대: 떨어질 항목이 없다');
      const drawn = drawStatic(scene);
      if (drawn.mover === null) throw new Error(`four-boxes 무대: '${step.id}' 의 칩을 찾지 못했다`);
      if (drawn.count === null) throw new Error(`four-boxes 무대: ${step.box} 칸의 수를 찾지 못했다`);
      const mover = drawn.mover;
      const count = drawn.count;
      const total = scene.items.length;
      const route = routeOf(step.index, step.actual, step.box, step.was, total);
      const end = route[route.length - 1];
      if (end === undefined) throw new Error('four-boxes 무대: 길의 끝이 없다');

      // 아직 못 온 만큼 — 첫 프레임은 제자리(기다리던 줄)에 있고, 칸의 수는 떨어지기 전 값이다
      const place = (u: number): void => {
        const at = along(route, easeInOut(u));
        mover.setAttribute('transform', `translate(${r2(at.x - end.x)} ${r2(at.y - end.y)})`);
      };
      place(0);
      count.textContent = String(step.was);

      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const u = Math.min((Date.now() - start) / MOVE_MS, 1);
        place(u);
        if (u >= 1) break;
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      drawStatic(scene);
    }

    return {
      render(next: FourBoxesScene, prev: FourBoxesScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const arriving =
          opts.animate && next.step !== null && prev !== null && prev.landed.length === next.landed.length - 1;
        if (!arriving) {
          drawStatic(next);
          return;
        }
        return fall(next, mine);
      },
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
