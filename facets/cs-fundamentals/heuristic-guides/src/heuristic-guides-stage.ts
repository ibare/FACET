/**
 * heuristic-guides-stage — 같은 격자 두 판을 나란히 두고 열어 본 칸이 번지는
 * 모양을 견준다.
 *
 * ── 무엇이 화면에 있는가
 *   판 둘        왼쪽은 짐작 없이, 오른쪽은 짐작을 더해. 같은 걸음에 나란히 간다.
 *   막대 둘      열어 본 칸의 수. 막대의 전체 길이가 격자의 모든 칸이다.
 *   길           끝에 두 판 위로 그어진다. 같은 길이라는 것이 이 조각의 결론이다.
 *
 * ── 움직임
 *   칸이 색만 바뀌는 것이 아니라, 새로 열린 칸이 **꺼낸 칸의 한가운데에서 자기
 *   자리로 자라 나온다.** 왼쪽에서는 그것이 사방으로 고르게 일어나 둥글게
 *   번지고, 오른쪽에서는 목표 쪽으로만 일어나 한 줄로 뻗는다. 동사가 "치우친다"
 *   이므로 번지는 방향 자체가 화면에서 일어나야 한다 (S-piece).
 *
 * ── 색 (S-view 결정 트리)
 *   후보(열려서 대기)      itemPivot   — 꺼낼 차례를 기다리는 칸
 *   지금 꺼낸 칸           itemActive
 *   열어 본 칸(처리 끝)    itemSorted
 *   길                     textInverse — itemSorted 타일 위의 잉크
 *   짐작 숫자 · 표식        타일에 따라 text / stateInk / textInverse
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 칸 크기는 캔버스에서 역산하고
 * 상수는 상한으로만 둔다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 격자 다섯 줄 + 막대 + 두 줄의 글. */
const CANVAS_H = 320;

/** 칸 한 변의 상한. 실제 크기는 캔버스 폭과 격자 크기에서 역산한다. */
const CELL_MAX = 40;
/** 좌우 여백의 하한. */
const SIDE_MIN = 22;
/** 두 판 사이 틈의 하한. */
const GAP_MIN = 34;
/** 격자 두 판이 쓸 수 있는 세로 띠. */
const GRID_BAND_TOP = 56;
const GRID_BAND_H = 190;

const CAPTION_Y = 20;
const HEAD_Y = 46;
const COUNT_Y = GRID_BAND_TOP + GRID_BAND_H + 22;
const BAR_Y = GRID_BAND_TOP + GRID_BAND_H + 30;
const BAR_H = 8;
const ROUTE_Y = GRID_BAND_TOP + GRID_BAND_H + 60;

/** 새로 열린 칸이 부모에게서 자라 나오는 시간. */
const SPREAD_MS = 150;
/** 길이 그어지는 시간. */
const ROUTE_MS = 820;
/** 자라 나오기 시작하는 씨앗 크기의 비율. */
const SEED_RATIO = 0.18;

export type StageCell = { col: number; row: number };
export type StageMove = { cell: StageCell; opened: StageCell[]; count: number };

type CellState = 'idle' | 'frontier' | 'active' | 'opened';

function attr(node: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  attr(node, attrs);
  return node;
}

function readInt(source: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const v = source?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function readCell(
  source: Record<string, unknown> | undefined,
  key: string,
  fallback: StageCell,
): StageCell {
  const v = source?.[key];
  if (!v || typeof v !== 'object') return fallback;
  const rec = v as Record<string, unknown>;
  const col = rec.col;
  const row = rec.row;
  if (typeof col !== 'number' || typeof row !== 'number') return fallback;
  return { col, row };
}

/** 부드럽게 멎는 가속 곡선. */
function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

export const heuristicGuidesStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';

    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    const data = params.initialData;
    const cols = Math.max(2, readInt(data, 'cols', 7));
    const rows = Math.max(2, readInt(data, 'rows', 5));
    const start = readCell(data, 'start', { col: 0, row: Math.floor(rows / 2) });
    const goal = readCell(data, 'goal', { col: cols - 1, row: Math.floor(rows / 2) });

    // 칸 크기는 폭과 세로 띠 양쪽에서 역산하고 상한을 씌운다. 남는 폭은 두 판
    // 사이의 틈과 좌우 여백으로 나눠 갖는다 (S-piece — 그 폭을 채운다).
    const cell = Math.min(
      CELL_MAX,
      Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2 - GAP_MIN) / (cols * 2)),
      Math.floor(GRID_BAND_H / rows),
    );
    const gridW = cols * cell;
    const gridH = rows * cell;
    const gap = Math.max(GAP_MIN, Math.round((PIECE_CANVAS_W - gridW * 2) * 0.45));
    const leftX = Math.round((PIECE_CANVAS_W - gridW * 2 - gap) / 2);
    const gridTop = GRID_BAND_TOP + Math.round((GRID_BAND_H - gridH) / 2);
    const totalCells = cols * rows;

    const idOf = (col: number, row: number): number => row * cols + col;
    const guessOf = (col: number, row: number): number =>
      Math.abs(goal.col - col) + Math.abs(goal.row - row);
    const maxGuess = Math.max(1, guessOf(0, 0), guessOf(cols - 1, rows - 1), guessOf(0, rows - 1));

    const root = el('g', {});
    svg.appendChild(root);

    // ── 걸치는 글 ─────────────────────────────────────────────────────
    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    root.appendChild(caption);

    const routeText = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: ROUTE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
      opacity: 0,
    });
    root.appendChild(routeText);

    /** 표식 하나와 그것이 잉크를 받는 속성. 과녁의 바깥 링만 stroke 로 칠한다. */
    type Marker = { node: SVGElement; paint: 'fill' | 'stroke' };

    type Panel = {
      x: number;
      fillLayer: SVGGElement;
      routeLayer: SVGGElement;
      fills: Map<number, SVGRectElement>;
      digits: Map<number, SVGTextElement>;
      markers: Map<number, Marker[]>;
      bar: SVGRectElement;
      countText: SVGTextElement;
      current: number | null;
      count: number;
    };

    /** 한 문안이 세 곳에서 쓰이므로 en 원본은 여기 한 번만 둔다 (C10). */
    const openedLabel = (n: number): string => t('label.opened', 'Opened: {n}', { n });

    const cellX = (panel: Panel, col: number): number => panel.x + col * cell;
    const cellY = (row: number): number => gridTop + row * cell;

    /** 타일 위에 얹는 잉크. 타일이 테마를 따라 뒤집으면 잉크도 뒤집는다 (design-tokens). */
    const inkFor = (state: CellState): string => {
      if (state === 'opened') return c.textInverse;
      if (state === 'frontier' || state === 'active') return c.stateInk;
      return c.text;
    };

    const fillFor = (state: CellState): string => {
      if (state === 'opened') return c.itemSorted;
      if (state === 'active') return c.itemActive;
      return c.itemPivot;
    };

    function buildPanel(x: number, guided: boolean, heading: string): Panel {
      const group = el('g', {});
      root.appendChild(group);

      const head = el('text', {
        x: x + gridW / 2,
        y: HEAD_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: c.text,
      });
      head.textContent = heading;
      group.appendChild(head);

      // 바닥 칸. 격자선은 늘 보인다.
      const base = el('g', {});
      group.appendChild(base);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          base.appendChild(
            el('rect', {
              x: x + col * cell,
              y: gridTop + row * cell,
              width: cell,
              height: cell,
              fill: c.bg,
              stroke: c.border,
              'stroke-width': 1,
            }),
          );
        }
      }

      // 표식(출발점 · 과녁)이 맨 위다. 길이 그 위를 덮으면 어디에서 어디까지인지가
      // 가려진다 — 길은 표식 아래로 지나간다.
      const fillLayer = el('g', {});
      const digitLayer = el('g', {});
      const routeLayer = el('g', {});
      const markerLayer = el('g', {});
      group.appendChild(fillLayer);
      group.appendChild(digitLayer);
      group.appendChild(routeLayer);
      group.appendChild(markerLayer);

      const digits = new Map<number, SVGTextElement>();
      if (guided) {
        // 짐작을 숫자로 드러낸다. 목표에 가까울수록 짙어져 기울기가 눈에 잡힌다.
        // 왼쪽 판에는 이 숫자가 없다 — 그것이 두 판의 차이다.
        // 한가운데가 아니라 모서리에 적는다. 가운데는 출발점 표식 · 과녁 · 길이
        // 지나는 자리라, 거기 두면 정작 0 과 6 이 가려진다.
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const h = guessOf(col, row);
            const digit = el('text', {
              x: x + (col + 1) * cell - 4,
              y: gridTop + (row + 1) * cell - 5,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
              opacity: baseDigitOpacity(idOf(col, row)),
            });
            digit.textContent = String(h);
            digitLayer.appendChild(digit);
            digits.set(idOf(col, row), digit);
          }
        }
      }

      const markers = new Map<number, Marker[]>();
      const startDot = el('circle', {
        cx: x + start.col * cell + cell / 2,
        cy: gridTop + start.row * cell + cell / 2,
        r: Math.max(3, Math.round(cell * 0.16)),
        fill: c.text,
      });
      markerLayer.appendChild(startDot);
      markers.set(idOf(start.col, start.row), [{ node: startDot, paint: 'fill' }]);

      const goalOuter = el('circle', {
        cx: x + goal.col * cell + cell / 2,
        cy: gridTop + goal.row * cell + cell / 2,
        r: Math.max(6, Math.round(cell * 0.3)),
        fill: 'none',
        stroke: c.text,
        'stroke-width': 2,
      });
      const goalInner = el('circle', {
        cx: x + goal.col * cell + cell / 2,
        cy: gridTop + goal.row * cell + cell / 2,
        r: Math.max(2, Math.round(cell * 0.11)),
        fill: c.text,
      });
      markerLayer.appendChild(goalOuter);
      markerLayer.appendChild(goalInner);
      markers.set(idOf(goal.col, goal.row), [
        { node: goalOuter, paint: 'stroke' },
        { node: goalInner, paint: 'fill' },
      ]);

      const countText = el('text', {
        x,
        y: COUNT_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      countText.textContent = openedLabel(0);
      group.appendChild(countText);

      group.appendChild(
        el('rect', { x, y: BAR_Y, width: gridW, height: BAR_H, rx: BAR_H / 2, fill: c.bgSubtle }),
      );
      const bar = el('rect', {
        x,
        y: BAR_Y,
        width: 0,
        height: BAR_H,
        rx: BAR_H / 2,
        fill: c.itemSorted,
      });
      group.appendChild(bar);

      return {
        x,
        fillLayer,
        routeLayer,
        fills: new Map(),
        digits,
        markers,
        bar,
        countText,
        current: null,
        count: 0,
      };
    }

    const plainPanel = buildPanel(leftX, false, t('label.plainPanel', 'Without the guess'));
    const guidedPanel = buildPanel(
      leftX + gridW + gap,
      true,
      t('label.guidedPanel', 'With the guess'),
    );
    const panels = [plainPanel, guidedPanel];

    // ── 움직임 ───────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          resolve();
          return;
        }
        let raf = 0;
        const finish = (): void => {
          waiters.delete(finish);
          if (raf !== 0) cancelAnimationFrame(raf);
          raf = 0;
          resolve();
        };
        waiters.add(finish);
        const began = performance.now();
        const tick = (): void => {
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - began) / ms);
          apply(easeOut(p));
          if (p < 1) raf = requestAnimationFrame(tick);
          else finish();
        };
        apply(0);
        raf = requestAnimationFrame(tick);
      });
    }

    function inkMarkers(panel: Panel, id: number, state: CellState): void {
      const ink = inkFor(state);
      for (const marker of panel.markers.get(id) ?? []) marker.node.setAttribute(marker.paint, ink);
    }

    /** 처음 그렸을 때의 짐작 옅기 — 목표에 가까울수록 짙다. */
    function baseDigitOpacity(id: number): string {
      const col = id % cols;
      const row = (id - col) / cols;
      return (0.28 + 0.52 * (1 - guessOf(col, row) / maxGuess)).toFixed(2);
    }

    function setState(panel: Panel, id: number, state: CellState): void {
      const rect = panel.fills.get(id);
      if (rect) rect.setAttribute('fill', fillFor(state));
      inkMarkers(panel, id, state);
      const digit = panel.digits.get(id);
      if (digit) {
        // 열어 본 칸의 짐작은 더 쓸 일이 없다. 남기면 어두운 타일 위에서 읽히지도 않는다.
        digit.setAttribute('opacity', state === 'opened' ? '0' : '1');
        digit.setAttribute('fill', inkFor(state));
      }
    }

    /** 새 칸을 부모의 한가운데에 씨앗으로 놓는다. 자라는 것은 tween 이 한다. */
    function sprout(panel: Panel, from: StageCell | null, to: StageCell): SVGRectElement {
      const rect = el('rect', { rx: 3, fill: fillFor('frontier') });
      panel.fillLayer.appendChild(rect);
      panel.fills.set(idOf(to.col, to.row), rect);
      const origin = from ?? to;
      const seed = cell * SEED_RATIO;
      attr(rect, {
        x: cellX(panel, origin.col) + (cell - seed) / 2,
        y: cellY(origin.row) + (cell - seed) / 2,
        width: seed,
        height: seed,
      });
      return rect;
    }

    function growth(
      panel: Panel,
      rect: SVGRectElement,
      from: StageCell | null,
      to: StageCell,
    ): (p: number) => void {
      const origin = from ?? to;
      const seed = cell * SEED_RATIO;
      const x0 = cellX(panel, origin.col) + (cell - seed) / 2;
      const y0 = cellY(origin.row) + (cell - seed) / 2;
      const x1 = cellX(panel, to.col) + 1;
      const y1 = cellY(to.row) + 1;
      return (p: number): void => {
        attr(rect, {
          x: x0 + (x1 - x0) * p,
          y: y0 + (y1 - y0) * p,
          width: seed + (cell - 2 - seed) * p,
          height: seed + (cell - 2 - seed) * p,
        });
      };
    }

    function setCount(panel: Panel, count: number): void {
      panel.count = count;
      panel.countText.textContent = openedLabel(count);
    }

    function barGrowth(panel: Panel, from: number, to: number): (p: number) => void {
      const w0 = (gridW * from) / totalCells;
      const w1 = (gridW * to) / totalCells;
      return (p: number): void => {
        panel.bar.setAttribute('width', String(w0 + (w1 - w0) * p));
      };
    }

    function clearPanel(panel: Panel): void {
      panel.fillLayer.textContent = '';
      panel.routeLayer.textContent = '';
      panel.fills.clear();
      panel.current = null;
      panel.count = 0;
      panel.bar.setAttribute('width', '0');
      panel.countText.textContent = openedLabel(0);
      for (const id of panel.markers.keys()) inkMarkers(panel, id, 'idle');
      for (const [id, digit] of panel.digits) {
        digit.setAttribute('fill', c.textMuted);
        digit.setAttribute('opacity', baseDigitOpacity(id));
      }
    }

    const instance: ViewInstance = {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      rewind(): void {
        for (const panel of panels) clearPanel(panel);
        routeText.setAttribute('opacity', '0');
        routeText.textContent = '';
      },

      /** 출발 칸이 후보로 올라간다. 부모가 없으므로 제 자리에서 자란다. */
      async seed(cells: StageCell[]): Promise<void> {
        const grows: Array<(p: number) => void> = [];
        for (const panel of panels) {
          for (const at of cells) {
            const rect = sprout(panel, null, at);
            grows.push(growth(panel, rect, null, at));
            setState(panel, idOf(at.col, at.row), 'frontier');
          }
        }
        await tween(SPREAD_MS, (p) => {
          for (const g of grows) g(p);
        });
      },

      /**
       * 한 걸음. 두 판이 같은 시간에 움직인다 — 견줄 것이 나란히 있어야
       * "치우친다" 가 성립한다.
       */
      async spread(plain: StageMove | null, guided: StageMove | null): Promise<void> {
        const grows: Array<(p: number) => void> = [];
        const apply = (panel: Panel, move: StageMove | null): void => {
          if (!move) return;
          if (panel.current !== null) setState(panel, panel.current, 'opened');
          const popped = idOf(move.cell.col, move.cell.row);
          if (!panel.fills.has(popped)) {
            const rect = sprout(panel, null, move.cell);
            grows.push(growth(panel, rect, null, move.cell));
          }
          setState(panel, popped, 'active');
          panel.current = popped;
          for (const at of move.opened) {
            const rect = sprout(panel, move.cell, at);
            grows.push(growth(panel, rect, move.cell, at));
          }
          grows.push(barGrowth(panel, panel.count, move.count));
          setCount(panel, move.count);
        };
        apply(plainPanel, plain);
        apply(guidedPanel, guided);
        await tween(SPREAD_MS, (p) => {
          for (const g of grows) g(p);
        });
      },

      /** 두 길을 동시에 긋는다. 같은 자리에 같은 길이로 닿는 것이 결론이다. */
      async drawRoute(plain: StageCell[], guided: StageCell[], label: string): Promise<void> {
        const lines: Array<{ line: SVGPolylineElement; len: number }> = [];
        const draw = (panel: Panel, route: StageCell[]): void => {
          if (panel.current !== null) setState(panel, panel.current, 'opened');
          panel.current = null;
          if (route.length < 2) return;
          const pts = route
            .map((at) => `${cellX(panel, at.col) + cell / 2},${cellY(at.row) + cell / 2}`)
            .join(' ');
          let len = 0;
          for (let i = 1; i < route.length; i += 1) {
            const a = route[i - 1];
            const b = route[i];
            len += (Math.abs(b.col - a.col) + Math.abs(b.row - a.row)) * cell;
          }
          const line = el('polyline', {
            points: pts,
            fill: 'none',
            stroke: c.textInverse,
            'stroke-width': Math.max(3, Math.round(cell * 0.11)),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-dasharray': len,
            'stroke-dashoffset': len,
          });
          panel.routeLayer.appendChild(line);
          lines.push({ line, len });
        };
        draw(plainPanel, plain);
        draw(guidedPanel, guided);
        routeText.textContent = label;
        await tween(ROUTE_MS, (p) => {
          for (const { line, len } of lines) {
            line.setAttribute('stroke-dashoffset', String(len * (1 - p)));
          }
          routeText.setAttribute('opacity', String(Math.min(1, p * 1.6)));
        });
      },

      destroy(): void {
        destroyed = true;
        // 프레임과 타이머를 거두는 것만으로는 모자라다 — 취소된 tick 은 아예
        // 불리지 않으므로, 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };

    return instance;
  },
};
