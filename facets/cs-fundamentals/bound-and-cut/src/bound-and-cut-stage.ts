/**
 * bound-and-cut-stage — 자를 대어 재는 판.
 *
 * 화면의 중심은 **재는 장면**이다. 갈래마다 자리 하나가 서고, 그 자리에 막대가
 * 두 토막으로 선다 — 아래는 이미 담기로 한 값(찬 것), 위는 남은 것을 쪼개서라도
 * 채웠을 때의 몫(내다본 것, 점선). 두 토막의 끝이 그 갈래의 **한계**다.
 *
 * 판 전체를 가로지르는 노란 줄이 지금까지의 **최고**이고, 오른쪽 칸에 값이
 * 상주한다. 새 최고가 나오면 줄과 칸이 함께 **올라간다** — 자르는 기준이 재생
 * 도중에 올라간다는 것이 이 화면의 시계다.
 *
 * 막대 끝이 줄에 못 미치면 밑동에 칼이 지나가고 막대가 주저앉는다. 잰 기록
 * (눈금과 숫자, 점선 윤곽) 은 자리에 남는다.
 *
 * 색은 전부 design-tokens 경유 (S-view). 문자는 params.t 경유 (C10).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_H = 282;
const SIDE_MIN = 24;

/** 물건 띠 */
const STRIP_Y = 8;
const STRIP_H = 30;
const CAP_PILL_W = 116;
const STRIP_GAP = 10;

/** 자 (눈금판) */
const AXIS_LABEL_X = 28;
const BOARD_X = 36;
const BOARD_W = 504;
const BOARD_TOP = 54;
const BASE_Y = 204;
const BOARD_H = BASE_Y - BOARD_TOP;
const TICK_STEP = 10;

/** 최고가 상주하는 칸 */
const BEST_BOX_X = BOARD_X + BOARD_W + 8;
const BEST_BOX_W = PIECE_CANVAS_W - 6 - BEST_BOX_X;
const BEST_BOX_H = 30;

/** 갈래 자리 */
const COL_MAX_W = 96;
const BAR_MAX_W = 48;
const CHIP_Y = BASE_Y + 8;
const CHIP_H = 17;
const CHIP_MAX_W = 22;
const CHIP_GAP = 3;
const MARK_Y = CHIP_Y + CHIP_H + 14;
const CAPTION_Y = 268;

/** 걸음 안의 시간. stepMs 위에 얹히므로 짧게 유지한다 (S-piece). */
const FILL_MS = 120;
const RISE_MS = 260;
const BEST_MS = 300;
const BLADE_MS = 150;
const FALL_MS = 220;

export type StageDecision = 'in' | 'out' | 'open';

export type StagePlan = {
  columns: number;
  scaleMax: number;
  order: string[];
};

export type StageBranch = {
  order: number;
  decisions: StageDecision[];
  value: number;
  weight: number;
  bound: number;
  splitItem: string | null;
  splitNum: number;
  splitDen: number;
  complete: boolean;
};

export type StageCut = {
  order: number;
  bound: number;
  best: number;
};

type StageItem = { id: string; weight: number; value: number };

type Column = {
  group: SVGGElement;
  solid: SVGRectElement;
  spec: SVGRectElement;
  cap: SVGLineElement;
  boundLabel: SVGTextElement;
  chips: SVGGElement;
  barX: number;
  centerX: number;
  value: number;
  bound: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function label(content: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

function readItems(src: unknown): StageItem[] {
  if (!Array.isArray(src)) return [];
  const out: StageItem[] = [];
  for (const raw of src) {
    if (typeof raw !== 'object' || raw === null) continue;
    const it = raw as { id?: unknown; weight?: unknown; value?: unknown };
    if (typeof it.id !== 'string') continue;
    if (typeof it.weight !== 'number' || typeof it.value !== 'number') continue;
    out.push({ id: it.id, weight: it.weight, value: it.value });
  }
  return out;
}

/** 한계는 쪼갠 값이라 소수 한 자리로, 실제로 담은 값은 정수로 적는다. */
const fmtBound = (n: number): string => n.toFixed(1);

export const boundAndCutStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const initial = (params.initialData ?? {}) as { capacity?: unknown; items?: unknown };
    const items = readItems(initial.items);
    const capacity = typeof initial.capacity === 'number' ? initial.capacity : 0;

    let destroyed = false;
    const rafIds = new Set<number>();

    const root = el('g', {});
    svg.appendChild(root);

    const stripLayer = el('g', {});
    const boardLayer = el('g', {});
    const columnLayer = el('g', {});
    const bestLayer = el('g', {});
    // 한계 숫자는 최고 줄보다 위에 온다. 한계가 최고에 가까울수록 둘이 겹치는데,
    // 하필 그때가 읽어야 할 순간이다.
    const numberLayer = el('g', {});
    root.appendChild(stripLayer);
    root.appendChild(boardLayer);
    root.appendChild(columnLayer);
    root.appendChild(bestLayer);
    root.appendChild(numberLayer);

    const caption = label('', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 시간 ────────────────────────────────────────────────────────────
    // 스스로 다음 회차를 예약하는 루프이므로 destroy 가 반드시 멈춘다 (S-view).
    const hasRaf = typeof requestAnimationFrame === 'function';

    function tween(duration: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || duration <= 0 || !hasRaf) {
          if (!destroyed) apply(1);
          resolve();
          return;
        }
        const start = Date.now();
        const frame = (): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / duration);
          apply(1 - (1 - raw) ** 3);
          if (raw >= 1) {
            resolve();
            return;
          }
          const next = requestAnimationFrame(frame);
          rafIds.add(next);
        };
        const id = requestAnimationFrame(frame);
        rafIds.add(id);
      });
    }

    // ── 판 ──────────────────────────────────────────────────────────────
    let scaleMax = TICK_STEP;
    let colW = COL_MAX_W;
    let barW = BAR_MAX_W;
    let originX = BOARD_X;
    let chipW = CHIP_MAX_W;
    let itemOrder: string[] = items.map((it) => it.id);

    const yOf = (value: number): number => BASE_Y - (value / scaleMax) * BOARD_H;

    const columns = new Map<number, Column>();
    let best = 0;

    const bestLine = el('line', {
      x1: BOARD_X,
      y1: BASE_Y,
      x2: BEST_BOX_X,
      y2: BASE_Y,
      stroke: c.accent,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    });
    const bestBox = el('rect', {
      x: BEST_BOX_X,
      y: BASE_Y - BEST_BOX_H / 2,
      width: BEST_BOX_W,
      height: BEST_BOX_H,
      rx: 4,
      fill: c.accent,
    });
    const bestCaption = label(t('label.best', 'Best'), {
      x: BEST_BOX_X + BEST_BOX_W / 2,
      y: BASE_Y - BEST_BOX_H / 2 + 11,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.stateInk,
    });
    const bestValue = label('0', {
      x: BEST_BOX_X + BEST_BOX_W / 2,
      y: BASE_Y - BEST_BOX_H / 2 + 25,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      'font-weight': '700',
      fill: c.stateInk,
    });
    bestLayer.appendChild(bestLine);
    bestLayer.appendChild(bestBox);
    bestLayer.appendChild(bestCaption);
    bestLayer.appendChild(bestValue);

    function placeBest(y: number): void {
      bestLine.setAttribute('y1', String(y));
      bestLine.setAttribute('y2', String(y));
      bestBox.setAttribute('y', String(y - BEST_BOX_H / 2));
      bestCaption.setAttribute('y', String(y - BEST_BOX_H / 2 + 11));
      bestValue.setAttribute('y', String(y - BEST_BOX_H / 2 + 25));
    }

    function drawStrip(): void {
      stripLayer.textContent = '';
      if (items.length === 0) return;

      const usable = PIECE_CANVAS_W - SIDE_MIN * 2;
      const cardW = Math.floor((usable - CAP_PILL_W - STRIP_GAP * items.length) / items.length);

      const pill = el('rect', {
        x: SIDE_MIN,
        y: STRIP_Y,
        width: CAP_PILL_W,
        height: STRIP_H,
        rx: 15,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      stripLayer.appendChild(pill);
      stripLayer.appendChild(
        label(t('label.capacity', 'Capacity {c}', { c: capacity }), {
          x: SIDE_MIN + CAP_PILL_W / 2,
          y: STRIP_Y + 20,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        }),
      );

      const ordered = itemOrder
        .map((id) => items.find((it) => it.id === id))
        .filter((it): it is StageItem => it !== undefined);
      const list = ordered.length === items.length ? ordered : items;

      list.forEach((it, i) => {
        const x = SIDE_MIN + CAP_PILL_W + STRIP_GAP + i * (cardW + STRIP_GAP);
        stripLayer.appendChild(
          el('rect', {
            x,
            y: STRIP_Y,
            width: cardW,
            height: STRIP_H,
            rx: 5,
            fill: c.bgSubtle,
            stroke: c.border,
          }),
        );
        stripLayer.appendChild(
          label(it.id, {
            x: x + 13,
            y: STRIP_Y + 21,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': '700',
            fill: c.text,
          }),
        );
        stripLayer.appendChild(
          label(t('label.itemSpec', 'w {w} · v {v}', { w: it.weight, v: it.value }), {
            x: x + 28,
            y: STRIP_Y + 20,
            'text-anchor': 'start',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }),
        );
      });
    }

    function drawBoard(): void {
      boardLayer.textContent = '';
      for (let v = 0; v <= scaleMax; v += TICK_STEP) {
        const y = yOf(v);
        boardLayer.appendChild(
          el('line', {
            x1: BOARD_X,
            y1: y,
            x2: BOARD_X + BOARD_W,
            y2: y,
            stroke: c.border,
            'stroke-width': v === 0 ? 1.5 : 1,
          }),
        );
        boardLayer.appendChild(
          label(String(v), {
            x: AXIS_LABEL_X,
            y: y + 4,
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }),
        );
      }
    }

    drawStrip();
    drawBoard();

    // ── 갈래 자리 ───────────────────────────────────────────────────────
    function chipsFor(decisions: StageDecision[], left: number): SVGGElement {
      const g = el('g', {});
      const n = Math.max(1, decisions.length);
      const total = n * chipW + (n - 1) * CHIP_GAP;
      const startX = left + Math.round((colW - total) / 2);
      decisions.forEach((d, i) => {
        const x = startX + i * (chipW + CHIP_GAP);
        const id = itemOrder[i] ?? '';
        g.appendChild(
          el('rect', {
            x,
            y: CHIP_Y,
            width: chipW,
            height: CHIP_H,
            rx: 3,
            fill: d === 'in' ? c.itemSorted : 'none',
            stroke: d === 'in' ? c.itemSorted : c.border,
            'stroke-dasharray': d === 'open' ? '2 2' : 'none',
          }),
        );
        g.appendChild(
          label(id, {
            x: x + chipW / 2,
            y: CHIP_Y + 12,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': d === 'in' ? '700' : '400',
            fill: d === 'in' ? c.textInverse : c.textMuted,
            opacity: d === 'open' ? 0.5 : 1,
          }),
        );
        if (d === 'out') {
          // 대각선으로 그으면 22px 칸에서 글자를 덮는다. 가로로 긋는다.
          g.appendChild(
            el('line', {
              x1: x + 3,
              y1: CHIP_Y + CHIP_H / 2,
              x2: x + chipW - 3,
              y2: CHIP_Y + CHIP_H / 2,
              stroke: c.textMuted,
              'stroke-width': 1.2,
            }),
          );
        }
      });
      return g;
    }

    return {
      plan(spec: StagePlan): void {
        if (destroyed) return;
        scaleMax = Math.max(TICK_STEP, spec.scaleMax);
        itemOrder = [...spec.order];
        const count = Math.max(1, spec.columns);
        colW = Math.min(COL_MAX_W, Math.floor(BOARD_W / count));
        barW = Math.min(BAR_MAX_W, Math.round(colW * 0.58));
        chipW = Math.min(
          CHIP_MAX_W,
          Math.max(12, Math.floor((colW - 10 - CHIP_GAP * 2) / Math.max(1, itemOrder.length))),
        );
        originX = BOARD_X + Math.round((BOARD_W - count * colW) / 2);
        drawStrip();
        drawBoard();
        placeBest(yOf(0));
      },

      /** 자를 대어 잰다 — 찬 것이 먼저 서고, 내다본 몫이 그 위로 자라 오른다. */
      async measure(b: StageBranch): Promise<void> {
        if (destroyed) return;
        const left = originX + b.order * colW;
        const barX = left + Math.round((colW - barW) / 2);
        const centerX = barX + barW / 2;

        const group = el('g', {});
        const solid = el('rect', {
          x: barX,
          y: BASE_Y,
          width: barW,
          height: 0,
          fill: c.itemSorted,
        });
        const spec = el('rect', {
          x: barX + 0.5,
          y: BASE_Y,
          width: barW - 1,
          height: 0,
          fill: 'none',
          stroke: c.itemComparing,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
        const cap = el('line', {
          x1: barX - 7,
          y1: BASE_Y,
          x2: barX + barW + 7,
          y2: BASE_Y,
          stroke: c.itemComparing,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
        const boundLabel = label(fmtBound(0), {
          x: centerX,
          y: BASE_Y - 9,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': '700',
          fill: c.text,
          // 최고 줄 위에 얹혀도 읽히도록 바탕색으로 테를 두른다.
          stroke: c.bg,
          'stroke-width': 3.5,
          'paint-order': 'stroke',
        });
        const chips = chipsFor(b.decisions, left);

        group.appendChild(solid);
        group.appendChild(spec);
        group.appendChild(cap);
        group.appendChild(chips);
        columnLayer.appendChild(group);
        numberLayer.appendChild(boundLabel);

        const column: Column = {
          group,
          solid,
          spec,
          cap,
          boundLabel,
          chips,
          barX,
          centerX,
          value: b.value,
          bound: b.bound,
        };
        columns.set(b.order, column);

        const setTop = (top: number): void => {
          const y = yOf(top);
          cap.setAttribute('y1', String(y));
          cap.setAttribute('y2', String(y));
          boundLabel.setAttribute('y', String(Math.max(BOARD_TOP - 4, y - 9)));
          boundLabel.textContent = fmtBound(top);
        };

        // 1) 이미 담기로 한 값이 찬다.
        await tween(b.value > 0 ? FILL_MS : 0, (p) => {
          const v = b.value * p;
          solid.setAttribute('y', String(yOf(v)));
          solid.setAttribute('height', String(BASE_Y - yOf(v)));
          setTop(v);
        });
        if (destroyed) return;

        // 2) 쪼개서라도 채웠을 때의 몫이 그 위로 자라 오른다 — 이것이 재는 동작이다.
        const solidTopY = yOf(b.value);
        await tween(b.bound > b.value ? RISE_MS : 0, (p) => {
          const top = b.value + (b.bound - b.value) * p;
          const y = yOf(top);
          spec.setAttribute('y', String(y));
          spec.setAttribute('height', String(Math.max(0, solidTopY - y)));
          setTop(top);
        });
        if (destroyed) return;

        spec.setAttribute('stroke', c.ghostOutline);
        cap.setAttribute('stroke', b.complete ? c.itemSorted : c.text);

        const specH = solidTopY - yOf(b.bound);
        if (b.splitItem !== null && specH >= 20) {
          group.appendChild(
            label(`${b.splitItem} ${b.splitNum}/${b.splitDen}`, {
              x: centerX,
              y: yOf(b.bound) + specH / 2 + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            }),
          );
        }
      },

      /** 새 최고가 나왔다 — 자르는 기준이 올라간다. */
      async raiseBest(next: number): Promise<void> {
        if (destroyed) return;
        const from = best;
        best = next;
        bestValue.textContent = String(next);
        await tween(BEST_MS, (p) => {
          placeBest(yOf(from + (next - from) * p));
        });
      },

      /** 한계가 최고에 못 미친다 — 밑동을 자르고 갈래가 주저앉는다. */
      async cut(info: StageCut): Promise<void> {
        if (destroyed) return;
        const column = columns.get(info.order);
        if (!column) return;

        // 못 미친 만큼이 먼저 보인다 — 자르는 이유다.
        column.group.appendChild(
          el('line', {
            x1: column.centerX,
            y1: yOf(info.bound),
            x2: column.centerX,
            y2: yOf(info.best),
            stroke: c.danger,
            'stroke-width': 1.5,
            'stroke-dasharray': '3 3',
            opacity: 0.55,
          }),
        );

        const bladeW = barW + 20;
        const blade = el('line', {
          x1: column.barX - 10,
          y1: BASE_Y,
          x2: column.barX + barW + 10,
          y2: BASE_Y,
          stroke: c.danger,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
          'stroke-dasharray': `${bladeW} ${bladeW}`,
          'stroke-dashoffset': bladeW,
        });
        column.group.appendChild(blade);
        await tween(BLADE_MS, (p) => {
          blade.setAttribute('stroke-dashoffset', String(bladeW * (1 - p)));
        });
        if (destroyed) return;

        // 잰 기록은 자리에 남는다.
        const ghost = el('rect', {
          x: column.barX + 0.5,
          y: yOf(column.bound),
          width: barW - 1,
          height: Math.max(0, BASE_Y - yOf(column.bound)),
          fill: 'none',
          stroke: c.ghostOutline,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
          opacity: 0,
        });
        column.group.insertBefore(ghost, column.group.firstChild);
        // 잘린 자리에도 찬 것과 내다본 몫의 경계는 남긴다.
        const ghostSplit =
          column.value > 0
            ? el('line', {
                x1: column.barX + 0.5,
                y1: yOf(column.value),
                x2: column.barX + barW - 0.5,
                y2: yOf(column.value),
                stroke: c.ghostOutline,
                'stroke-width': 1,
                'stroke-dasharray': '2 3',
                opacity: 0,
              })
            : null;
        if (ghostSplit) column.group.insertBefore(ghostSplit, column.group.firstChild);

        const solidH = BASE_Y - yOf(column.value);
        const specTopY = yOf(column.bound);
        const specH = Math.max(0, yOf(column.value) - specTopY);
        await tween(FALL_MS, (p) => {
          ghost.setAttribute('opacity', String(0.5 * p));
          ghostSplit?.setAttribute('opacity', String(0.5 * p));
          const shrink = 1 - p;
          column.solid.setAttribute('y', String(BASE_Y - solidH * shrink));
          column.solid.setAttribute('height', String(solidH * shrink));
          column.solid.setAttribute('opacity', String(shrink));
          column.spec.setAttribute('y', String(BASE_Y - (specH + solidH) * shrink));
          column.spec.setAttribute('height', String(specH * shrink));
          column.spec.setAttribute('opacity', String(shrink));
          column.chips.setAttribute('opacity', String(1 - 0.55 * p));
          blade.setAttribute('opacity', String(1 - p));
        });
        if (destroyed) return;

        column.cap.setAttribute('stroke', c.textMuted);
        column.cap.setAttribute('stroke-dasharray', '3 2');
        column.boundLabel.setAttribute('fill', c.textMuted);
        blade.remove();
        column.group.appendChild(
          label('×', {
            x: column.centerX,
            y: MARK_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': '700',
            fill: c.danger,
          }),
        );
      },

      /** 자르고도 답을 놓치지 않았다 — 답을 든 갈래에 테를 두른다. */
      finish(answerOrder: number): void {
        if (destroyed) return;
        const column = columns.get(answerOrder);
        if (!column) return;
        const n = Math.max(1, itemOrder.length);
        const total = n * chipW + (n - 1) * CHIP_GAP;
        column.group.appendChild(
          el('rect', {
            x: column.centerX - total / 2 - 4,
            y: CHIP_Y - 4,
            width: total + 8,
            height: CHIP_H + 8,
            rx: 5,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2.5,
          }),
        );
      },

      setCaption(text: string): void {
        if (destroyed) return;
        caption.textContent = text;
      },

      rewind(): void {
        if (destroyed) return;
        columnLayer.textContent = '';
        numberLayer.textContent = '';
        columns.clear();
        best = 0;
        bestValue.textContent = '0';
        placeBest(yOf(0));
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of rafIds) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        }
        rafIds.clear();
        root.remove();
      },
    };
  },
};
