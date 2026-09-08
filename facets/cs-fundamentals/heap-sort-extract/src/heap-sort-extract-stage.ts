/**
 * heap-sort-extract-stage — 한 줄이 둘로 갈리고, 그 경계가 왼쪽으로 밀려간다.
 *
 * 화면은 칸 다섯짜리 줄 하나가 전부다. 줄 안쪽 어딘가에 세로 막대가 서 있고,
 * 그 왼쪽이 아직 다룰 힙, 오른쪽이 이미 끝난 것이다. 줄 아래의 두 가로 자가
 * 각 영역의 길이를 그대로 보여 준다 — 하나는 줄고 하나는 자란다.
 *
 * 한 걸음의 운동:
 *   1. 0번 칸의 값이 위 차선으로 떠오른다 (꺼냄).
 *   2. 경계 막대가 한 칸 왼쪽으로 미끄러지고, 떠 있던 값이 방금 힙이 내놓은
 *      칸으로 날아가 앉는다. 같은 시각 남은 힙의 값들은 가운데 차선을 지나
 *      제 새 칸으로 옮겨 앉는다.
 *
 * 위 차선과 가운데 차선은 높이가 갈라져 있어 서로 스치지 않는다. 꺼낸 것은
 * 높이 뜨고, 자리만 바꾸는 것은 낮게 돈다.
 *
 * 세로는 마운트에서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view). 가로는
 * PIECE_CANVAS_W 에서 역산하고 상수는 상한으로만 둔다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 240;

/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 104;
/** 줄 좌우로 남겨 둘 최소 여백. */
const SIDE_MIN = 30;

const ROW_Y = 110;
const CELL_H = 58;
const ROW_BOTTOM = ROW_Y + CELL_H;
const CELL_CY = ROW_Y + CELL_H / 2;

/** 경계 막대가 줄 위아래로 삐져나오는 길이. */
const BAR_OVER = 12;
const BAR_W = 3;

const BRACKET_Y = ROW_BOTTOM + 20;
const BRACKET_H = 3;
const LABEL_Y = BRACKET_Y + 20;
const CAPTION_Y = H - 12;

/** 꺼낸 값이 지나는 위 차선 / 자리만 바꾸는 값이 지나는 가운데 차선. */
const LANE_HIGH = ROW_Y - 74;
const LANE_MID = ROW_Y - 24;
const CHIP_H = 34;

const LIFT_MS = 320;
const MOVE_MS = 560;
const FINISH_MS = 420;

/** 자가 이 폭보다 짧아지면 라벨을 감춘다 (글자가 자보다 길어지는 구간). */
const LABEL_MIN_W = 52;

type Attrs = Record<string, string | number>;

function node<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) * (2 - 2 * p) / 2);

type Chip = {
  place(cx: number, cy: number): void;
  remove(): void;
};

type Mover = { chip: Chip; from: number; to: number };

export type HeapSortExtractStageInstance = ViewInstance & {
  reset(values: number[]): void;
  setCaption(text: string): void;
  liftTop(value: number): Promise<void>;
  placeAndShrink(step: { boundary: number; value: number; order: number[] }): Promise<void>;
  finish(values: number[]): Promise<void>;
};

export const heapSortExtractStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): HeapSortExtractStageInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    const initial = readValues(params.initialData);
    const n = Math.max(1, initial.length);

    // 폭은 캔버스에서 역산한다. 상수는 상한일 뿐 자리를 못박지 않는다.
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
    const rowW = cellW * n;
    const originX = Math.round((W - rowW) / 2);
    const rowRight = originX + rowW;
    const chipW = cellW - 20;
    const cornerR = Number.parseFloat(radii.md);

    const xAt = (k: number): number => originX + k * cellW;
    const cellCX = (i: number): number => originX + i * cellW + cellW / 2;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const root = node('g', {});
    // 칸 색이 둥근 테두리 밖으로 삐져나오지 않게 줄 모양으로 오려 낸다.
    const clipId = `hse-row-${Math.random().toString(36).slice(2, 9)}`;
    const defs = node('defs', {});
    const clip = node('clipPath', { id: clipId });
    clip.appendChild(
      node('rect', { x: originX, y: ROW_Y, width: rowW, height: CELL_H, rx: cornerR }),
    );
    defs.appendChild(clip);
    root.appendChild(defs);
    const cellLayer = node('g', { 'clip-path': `url(#${clipId})` });
    const frameLayer = node('g', {});
    const dividerLayer = node('g', {});
    const airLayer = node('g', {});
    root.appendChild(cellLayer);
    root.appendChild(frameLayer);
    root.appendChild(dividerLayer);
    root.appendChild(airLayer);
    svg.appendChild(root);

    // ── 줄. 칸은 제자리에 붙박여 있고 값만 움직인다.
    const cellRects: SVGRectElement[] = [];
    const cellTexts: SVGTextElement[] = [];
    for (let i = 0; i < n; i++) {
      const r = node('rect', {
        x: xAt(i),
        y: ROW_Y,
        width: cellW,
        height: CELL_H,
        fill: colors.itemDefault,
      });
      cellLayer.appendChild(r);
      cellRects.push(r);
    }
    for (let i = 1; i < n; i++) {
      cellLayer.appendChild(
        node('line', {
          x1: xAt(i),
          y1: ROW_Y,
          x2: xAt(i),
          y2: ROW_BOTTOM,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
    }
    // 바깥 테두리 하나 — 이 그림이 줄 하나로 끝난다는 말이다.
    // clip 안에 두면 stroke 가 반만 남으므로 오려 내지 않는 자리에 그린다.
    frameLayer.appendChild(
      node('rect', {
        x: originX,
        y: ROW_Y,
        width: rowW,
        height: CELL_H,
        rx: cornerR,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      }),
    );
    for (let i = 0; i < n; i++) {
      const t = node('text', {
        x: cellCX(i),
        y: CELL_CY,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': '600',
        fill: colors.text,
      });
      frameLayer.appendChild(t);
      cellTexts.push(t);
    }

    // ── 경계와 두 영역의 자.
    const heapBracket = node('rect', {
      x: originX,
      y: BRACKET_Y,
      width: rowW,
      height: BRACKET_H,
      rx: BRACKET_H / 2,
      fill: colors.textMuted,
    });
    const doneBracket = node('rect', {
      x: rowRight,
      y: BRACKET_Y,
      width: 0,
      height: BRACKET_H,
      rx: BRACKET_H / 2,
      fill: colors.sortedTailBorder,
    });
    const bar = node('rect', {
      x: rowRight - BAR_W / 2,
      y: ROW_Y - BAR_OVER,
      width: BAR_W,
      height: CELL_H + BAR_OVER * 2,
      rx: BAR_W / 2,
      fill: colors.sortedTailBorder,
    });
    const heapLabel = node('text', {
      x: originX + rowW / 2,
      y: LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'letter-spacing': '0.08em',
      fill: colors.textMuted,
    });
    const doneLabel = node('text', {
      x: rowRight,
      y: LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'letter-spacing': '0.08em',
      fill: colors.textMuted,
      opacity: 0,
    });
    heapLabel.textContent = tr('label.heap', 'heap');
    doneLabel.textContent = tr('label.done', 'sorted');
    dividerLayer.appendChild(heapBracket);
    dividerLayer.appendChild(doneBracket);
    dividerLayer.appendChild(bar);
    dividerLayer.appendChild(heapLabel);
    dividerLayer.appendChild(doneLabel);

    const caption = node('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.appendChild(caption);

    // ── 상태.
    let slots: number[] = [...initial];
    let boundary = n; // 힙은 0..boundary-1
    const hidden = new Set<number>(); // 공중에 있어 칸에서 감춘 자리
    let flying: Chip | null = null;
    let movers: Mover[] = [];

    /** 되돌림이 일어나면 올라간다. 뒤늦게 끝난 애니메이션의 마무리를 막는다. */
    let generation = 0;
    let destroyed = false;
    const frames = new Set<number>();

    function animate(durationMs: number, apply: (p: number) => void): Promise<void> {
      const mine = generation;
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        apply(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let start = -1;
        const tick = (now: number): void => {
          if (destroyed || generation !== mine) {
            resolve();
            return;
          }
          if (start < 0) start = now;
          const p = clamp01((now - start) / durationMs);
          apply(p);
          if (p < 1) {
            frames.add(requestAnimationFrame(tick));
          } else {
            resolve();
          }
        };
        frames.add(requestAnimationFrame(tick));
      });
    }

    function makeChip(value: number, fill: string, ink: string): Chip {
      const g = node('g', {});
      g.appendChild(
        node('rect', {
          x: -chipW / 2,
          y: -CHIP_H / 2,
          width: chipW,
          height: CHIP_H,
          rx: cornerR,
          fill,
          stroke: colors.text,
          'stroke-width': 1.2,
        }),
      );
      const t = node('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': '600',
        fill: ink,
      });
      t.textContent = String(value);
      g.appendChild(t);
      airLayer.appendChild(g);
      return {
        place(cx: number, cy: number): void {
          g.setAttribute('transform', `translate(${cx},${cy})`);
        },
        remove(): void {
          g.remove();
        },
      };
    }

    /** 경계 위치(픽셀)를 받아 막대·두 자·두 라벨을 한꺼번에 놓는다. */
    function layoutDivider(bx: number): void {
      bar.setAttribute('x', String(bx - BAR_W / 2));
      const heapW = Math.max(0, bx - originX);
      const doneW = Math.max(0, rowRight - bx);
      heapBracket.setAttribute('width', String(heapW));
      doneBracket.setAttribute('x', String(bx));
      doneBracket.setAttribute('width', String(doneW));
      heapLabel.setAttribute('x', String(originX + heapW / 2));
      heapLabel.setAttribute('opacity', heapW >= LABEL_MIN_W ? '1' : '0');
      doneLabel.setAttribute('x', String(bx + doneW / 2));
      doneLabel.setAttribute('opacity', doneW >= LABEL_MIN_W ? '1' : '0');
    }

    function paint(): void {
      for (let i = 0; i < n; i++) {
        const done = i >= boundary;
        const isTop = !done && i === 0;
        cellRects[i].setAttribute(
          'fill',
          done ? colors.itemSorted : isTop ? colors.itemPivot : colors.itemDefault,
        );
        cellTexts[i].setAttribute(
          'fill',
          done ? colors.textInverse : isTop ? colors.stateInk : colors.text,
        );
        const v = slots[i];
        cellTexts[i].textContent = hidden.has(i) || typeof v !== 'number' ? '' : String(v);
      }
      layoutDivider(xAt(boundary));
    }

    function clearAir(): void {
      flying?.remove();
      flying = null;
      for (const m of movers) m.chip.remove();
      movers = [];
      hidden.clear();
    }

    function reset(values: number[]): void {
      generation += 1;
      clearAir();
      slots = values.length === n ? [...values] : [...initial];
      boundary = n;
      paint();
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    async function liftTop(value: number): Promise<void> {
      const mine = generation;
      flying?.remove();
      hidden.add(0);
      paint();
      const chip = makeChip(value, colors.itemPivot, colors.stateInk);
      flying = chip;
      const cx = cellCX(0);
      chip.place(cx, CELL_CY);
      await animate(LIFT_MS, (p) => {
        chip.place(cx, lerp(CELL_CY, LANE_HIGH, ease(p)));
      });
      if (generation !== mine) return;
      chip.place(cx, LANE_HIGH);
    }

    async function placeAndShrink(step: {
      boundary: number;
      value: number;
      order: number[];
    }): Promise<void> {
      const mine = generation;
      const nb = step.boundary;
      const prev = [...slots];

      // 자리를 바꾸는 값들 — 힙이 모양을 되찾은 결과만 옮겨 앉는다.
      movers = [];
      for (let i = 0; i < nb; i++) {
        const src = step.order[i];
        if (typeof src !== 'number' || src === i) continue;
        const chip = makeChip(prev[src], colors.itemDefault, colors.text);
        chip.place(cellCX(src), CELL_CY);
        movers.push({ chip, from: cellCX(src), to: cellCX(i) });
        hidden.add(src);
      }
      // 힙이 내놓는 칸. 꺼낸 값이 바로 여기 앉는다.
      hidden.add(nb);
      paint();

      const chip = flying;
      const fromX = cellCX(0);
      const toX = cellCX(nb);
      const bx0 = xAt(boundary);
      const bx1 = xAt(nb);
      const held = movers;

      await animate(MOVE_MS, (p) => {
        const travelHigh = ease(clamp01(p / 0.6));
        const fall = ease(clamp01((p - 0.55) / 0.45));
        chip?.place(lerp(fromX, toX, travelHigh), lerp(LANE_HIGH, CELL_CY, fall));

        const rise = ease(clamp01(p / 0.28));
        const drop = ease(clamp01((p - 0.68) / 0.32));
        const midY = CELL_CY + (LANE_MID - CELL_CY) * rise * (1 - drop);
        const travelMid = ease(clamp01((p - 0.22) / 0.5));
        for (const m of held) m.chip.place(lerp(m.from, m.to, travelMid), midY);

        layoutDivider(lerp(bx0, bx1, ease(clamp01((p - 0.1) / 0.6))));
      });

      if (generation !== mine) return;

      const next = [...slots];
      for (let i = 0; i < nb; i++) {
        const src = step.order[i];
        if (typeof src === 'number') next[i] = prev[src];
      }
      next[nb] = step.value;
      clearAir();
      slots = next;
      boundary = nb;
      paint();
    }

    async function finish(values: number[]): Promise<void> {
      const mine = generation;
      const bx0 = xAt(boundary);
      const bx1 = xAt(0);
      await animate(FINISH_MS, (p) => {
        layoutDivider(lerp(bx0, bx1, ease(p)));
      });
      if (generation !== mine) return;
      clearAir();
      if (values.length === n) slots = [...values];
      boundary = 0;
      paint();
    }

    paint();

    return {
      reset,
      setCaption,
      liftTop,
      placeAndShrink,
      finish,
      /**
       * 스스로 다음 회차를 예약하는 rAF 루프가 있으므로 반드시 멈춘다.
       * 예약한 프레임을 전부 거두고 붙인 노드를 뗀다 — 뒷일이 남지 않는다 (S-view).
       */
      destroy(): void {
        destroyed = true;
        generation += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        root.remove();
      },
    };
  },
};

function readValues(initialData: Record<string, unknown> | undefined): number[] {
  const raw = initialData?.values;
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number') return [];
    out.push(v);
  }
  return out;
}
