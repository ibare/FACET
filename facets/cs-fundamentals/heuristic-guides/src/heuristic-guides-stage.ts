/**
 * heuristic-guides-stage — 같은 격자 두 판을 나란히 두고 열어 본 칸이 번지는
 * 모양을 견준다.
 *
 * ── 무엇이 화면에 있는가
 *   판 둘        왼쪽은 짐작 없이, 오른쪽은 짐작을 더해. 같은 걸음에 나란히 간다.
 *   막대 둘      열어 본 칸의 수. 막대의 전체 길이가 격자의 모든 칸이다 —
 *                채워지지 않고 남은 몫이 곧 **들여다보지 않아도 됐던 자리**다.
 *   길           끝에 두 판 위로 그어진다. 같은 길이라는 것이 이 조각의 결론이다.
 *
 * ── 움직임
 *   칸이 색만 바뀌는 것이 아니라, 새로 열린 칸이 **꺼낸 칸의 한가운데에서 자기
 *   자리로 자라 나온다.** 왼쪽에서는 그것이 사방으로 고르게 일어나 둥글게
 *   번지고, 오른쪽에서는 목표 쪽으로만 일어나 한 줄로 뻗는다. 동사가 "치우친다"
 *   이므로 번지는 방향 자체가 화면에서 일어나야 한다 (S-piece).
 *
 * ── 어휘를 가른다
 *   **채움 = 칸의 형편** — 아직 손대지 않음(바탕) / 후보로 올라옴 / 지금 꺼냄 /
 *   열어 봄. 이 넷이 한 축에 줄지어 있어 서로 부딪히지 않는다.
 *   **잉크(표식 · 짐작 숫자 · 길) = 타일 위에 얹히는 것** — 타일이 테마를 따라
 *   뒤집히면 잉크도 함께 뒤집는다.
 *   먼저 닿은 판에는 **지금 꺼낸 칸이 없다.** 그래서 오른쪽이 멎어 쉬는 동안
 *   왼쪽만 계속 번지는 것이 칠만 보아도 읽힌다.
 *
 * ── 색 (S-view 결정 트리)
 *   후보(열려서 대기)      itemPivot   — 꺼낼 차례를 기다리는 칸
 *   지금 꺼낸 칸           itemActive
 *   열어 본 칸(처리 끝)    itemSorted
 *   길                     textInverse — itemSorted 타일 위의 잉크
 *   짐작 숫자 · 표식        타일에 따라 text / stateInk / textInverse
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`seed()` · `spread()` · `drawRoute()`) 를 두지 않는다.
 * 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터 다시
 * 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다 (S-scene).
 *
 * 정적 그리기는 `root` 안을 통째로 다시 짓는다. 그래서 "재건 밖 요소" 가 하나도
 * 없다 — 막대 폭도 짐작 숫자의 옅기도 길 글자의 opacity 도 매번 장면에서 새로
 * 나온다. 운동이 끝나면 그 장면을 다시 세워 보간의 끝자리와 임시 속성을 통째로
 * 지운다.
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

import type {
  HeuristicGuidesScene,
  HeuristicGuidesSceneBoard,
  HeuristicGuidesSceneCaption,
  HeuristicGuidesSceneCell,
  HeuristicGuidesSceneMove,
} from './scene.js';

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

/** 칸의 형편. 이제 장면에서 파생되고, 칠은 그 파생값을 따를 뿐이다. */
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

/** 부드럽게 멎는 가속 곡선. */
function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

/** 이번 그림의 손잡이. 정적 그리기가 매번 새로 채운다 — 상태가 아니다. */
type PanelRefs = {
  x: number;
  fills: Map<number, SVGRectElement>;
  bar: SVGRectElement;
  route: { line: SVGPolylineElement; len: number } | null;
};

type Refs = {
  plain: PanelRefs;
  guided: PanelRefs;
  routeText: SVGTextElement;
};

export const heuristicGuidesStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';

    // 장면이 문안을 담지 않으므로 문자는 여기서 만든다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    /** 한 문안이 두 곳에서 쓰이므로 en 원본은 여기 한 번만 둔다 (C10). */
    const openedLabel = (n: number): string => t('label.opened', 'Opened: {n}', { n });

    const root = el('g', {});
    svg.appendChild(root);

    // ── 움직임 ───────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 칸과 길은 매번 새로 짓지만, 운동이 쥔 것은 **그때의 손잡이**
     * 라 되짚기가 가운데 끼어들면 이미 떨어져 나간 노드를 붙들고 있게 된다.
     * 깨어난 운동은 자기 세대를 확인하고 아니면 화면에 손대지 않는다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function tween(ms: number, my: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(my) || ms <= 0) {
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
          raf = 0;
          if (!alive(my)) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - began) / ms);
          apply(easeOut(p));
          if (p < 1) raf = requestAnimationFrame(tick);
          else finish();
        };
        // 첫 프레임을 동기로 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
        // 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        apply(0);
        raf = requestAnimationFrame(tick);
      });
    }

    // ── 자리 셈 ──────────────────────────────────────────────────────
    /**
     * 칸 크기는 폭과 세로 띠 양쪽에서 역산하고 상한을 씌운다. 남는 폭은 두 판
     * 사이의 틈과 좌우 여백으로 나눠 갖는다 (S-piece — 그 폭을 채운다).
     *
     * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 재면 순회 순서가
     * 곧 숨은 상태가 된다.
     */
    function layoutOf(cols: number, rows: number): {
      cell: number;
      gridW: number;
      leftX: number;
      gap: number;
      gridTop: number;
    } {
      const cell = Math.min(
        CELL_MAX,
        Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2 - GAP_MIN) / (cols * 2)),
        Math.floor(GRID_BAND_H / rows),
      );
      const gridW = cols * cell;
      const gridH = rows * cell;
      const gap = Math.max(GAP_MIN, Math.round((PIECE_CANVAS_W - gridW * 2) * 0.45));
      return {
        cell,
        gridW,
        gap,
        leftX: Math.round((PIECE_CANVAS_W - gridW * 2 - gap) / 2),
        gridTop: GRID_BAND_TOP + Math.round((GRID_BAND_H - gridH) / 2),
      };
    }

    /** 타일 위에 얹는 잉크. 타일이 테마를 따라 뒤집으면 잉크도 뒤집는다 (design-tokens). */
    function inkFor(state: CellState): string {
      if (state === 'opened') return c.textInverse;
      if (state === 'frontier' || state === 'active') return c.stateInk;
      return c.text;
    }

    function fillFor(state: CellState): string {
      if (state === 'opened') return c.itemSorted;
      if (state === 'active') return c.itemActive;
      return c.itemPivot;
    }

    /**
     * 한 판의 칸마다 형편을 셈한다.
     *
     * 지금 꺼낸 칸은 **가장 나중에 열어 본 칸**이고, 목표에 닿은 뒤에는 없다 —
     * 옮기기 전에는 그 판이 멎은 뒤에도 마지막 칸이 계속 `itemActive` 로 남아
     * "아직 꺼내는 중" 으로 읽혔다.
     */
    function statesOf(
      board: HeuristicGuidesSceneBoard,
      cols: number,
    ): Map<number, CellState> {
      const states = new Map<number, CellState>();
      for (const at of board.frontier) states.set(at.row * cols + at.col, 'frontier');
      board.examined.forEach((at, i) => {
        const last = i === board.examined.length - 1 && !board.arrived;
        states.set(at.row * cols + at.col, last ? 'active' : 'opened');
      });
      return states;
    }

    function captionText(caption: HeuristicGuidesSceneCaption | null): string {
      if (!caption) return '';
      switch (caption.kind) {
        case 'begin':
          return t(
            'caption.begin',
            'The same grid and the same question: from the dot to the target.',
          );
        case 'arrived':
          return t('caption.arrived', 'The right one is there. The left one is still spreading.');
        case 'same':
          return t(
            'caption.same',
            'Both routes are equally long. What differs is how many cells were opened.',
          );
        case 'spread':
          return t('caption.spread', 'The left spreads evenly; the right leans toward the target.');
      }
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────
    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않고 늘 통째로 짓는다.
     *
     * 되돌릴 명령이 필요 없고, 흐르며 선 화면과 곧바로 세운 화면이 속성의 유무
     * 만큼도 달라지지 않는다 (S-scene).
     */
    function drawStatic(scene: HeuristicGuidesScene): Refs {
      root.textContent = '';

      const { cols, rows, start, goal, guesses } = scene;
      const { cell, gridW, gap, leftX, gridTop } = layoutOf(cols, rows);
      const totalCells = cols * rows;
      // 가장 먼 칸의 짐작. 색판이 아니라 옅기의 자라, 바탕 자료에서 한 번에 센다.
      const maxGuess = guesses.reduce((m, h) => Math.max(m, h), 1);

      const idOf = (col: number, row: number): number => row * cols + col;
      const cellX = (x: number, col: number): number => x + col * cell;
      const cellY = (row: number): number => gridTop + row * cell;

      /** 처음 그렸을 때의 짐작 옅기 — 목표에 가까울수록 짙다. */
      const baseDigitOpacity = (id: number): string =>
        (0.28 + 0.52 * (1 - guesses[id] / maxGuess)).toFixed(2);

      const caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      caption.textContent = captionText(scene.caption);
      root.appendChild(caption);

      function drawPanel(
        x: number,
        guided: boolean,
        heading: string,
        board: HeuristicGuidesSceneBoard,
      ): PanelRefs {
        const group = el('g', {});
        root.appendChild(group);

        const states = statesOf(board, cols);
        const stateAt = (id: number): CellState => states.get(id) ?? 'idle';

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

        // 바닥 칸. 격자선은 늘 보인다. 칠이 없는 칸이 곧 끝내 들여다보지 않은
        // 자리이므로, 그 바닥이 화면에 남아 있어야 "이만큼 안 봐도 됐다" 가 보인다.
        const base = el('g', {});
        group.appendChild(base);
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            base.appendChild(
              el('rect', {
                x: cellX(x, col),
                y: cellY(row),
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

        const fills = new Map<number, SVGRectElement>();
        const tile = (at: HeuristicGuidesSceneCell): void => {
          const id = idOf(at.col, at.row);
          const rect = el('rect', {
            x: cellX(x, at.col) + 1,
            y: cellY(at.row) + 1,
            width: cell - 2,
            height: cell - 2,
            rx: 3,
            fill: fillFor(stateAt(id)),
          });
          fillLayer.appendChild(rect);
          fills.set(id, rect);
        };
        for (const at of board.frontier) tile(at);
        for (const at of board.examined) tile(at);

        if (guided) {
          // 짐작을 숫자로 드러낸다. 목표에 가까울수록 짙어져 기울기가 눈에 잡힌다.
          // 왼쪽 판에는 이 숫자가 없다 — 그것이 두 판의 차이다.
          // 한가운데가 아니라 모서리에 적는다. 가운데는 출발점 표식 · 과녁 · 길이
          // 지나는 자리라, 거기 두면 정작 0 과 6 이 가려진다.
          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const id = idOf(col, row);
              const state = stateAt(id);
              const digit = el('text', {
                x: cellX(x, col) + cell - 4,
                y: cellY(row) + cell - 5,
                'text-anchor': 'end',
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                // 열어 본 칸의 짐작은 더 쓸 일이 없다. 남기면 어두운 타일 위에서
                // 읽히지도 않는다.
                fill: state === 'idle' ? c.textMuted : inkFor(state),
                opacity:
                  state === 'opened' ? '0' : state === 'idle' ? baseDigitOpacity(id) : '1',
              });
              digit.textContent = String(guesses[id]);
              digitLayer.appendChild(digit);
            }
          }
        }

        let route: { line: SVGPolylineElement; len: number } | null = null;
        if (board.route.length >= 2) {
          const pts = board.route
            .map((at) => `${cellX(x, at.col) + cell / 2},${cellY(at.row) + cell / 2}`)
            .join(' ');
          let len = 0;
          for (let i = 1; i < board.route.length; i += 1) {
            const a = board.route[i - 1];
            const b = board.route[i];
            len += (Math.abs(b.col - a.col) + Math.abs(b.row - a.row)) * cell;
          }
          const line = el('polyline', {
            points: pts,
            fill: 'none',
            stroke: c.textInverse,
            'stroke-width': Math.max(3, Math.round(cell * 0.11)),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          });
          routeLayer.appendChild(line);
          route = { line, len };
        }

        const startInk = inkFor(stateAt(idOf(start.col, start.row)));
        markerLayer.appendChild(
          el('circle', {
            cx: cellX(x, start.col) + cell / 2,
            cy: cellY(start.row) + cell / 2,
            r: Math.max(3, Math.round(cell * 0.16)),
            fill: startInk,
          }),
        );

        const goalInk = inkFor(stateAt(idOf(goal.col, goal.row)));
        markerLayer.appendChild(
          el('circle', {
            cx: cellX(x, goal.col) + cell / 2,
            cy: cellY(goal.row) + cell / 2,
            r: Math.max(6, Math.round(cell * 0.3)),
            fill: 'none',
            stroke: goalInk,
            'stroke-width': 2,
          }),
        );
        markerLayer.appendChild(
          el('circle', {
            cx: cellX(x, goal.col) + cell / 2,
            cy: cellY(goal.row) + cell / 2,
            r: Math.max(2, Math.round(cell * 0.11)),
            fill: goalInk,
          }),
        );

        const countText = el('text', {
          x,
          y: COUNT_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        // 화면에 뜨는 수와 타일이 같은 배열에서 나온다.
        countText.textContent = openedLabel(board.examined.length);
        group.appendChild(countText);

        group.appendChild(
          el('rect', { x, y: BAR_Y, width: gridW, height: BAR_H, rx: BAR_H / 2, fill: c.bgSubtle }),
        );
        const bar = el('rect', {
          x,
          y: BAR_Y,
          width: (gridW * board.examined.length) / totalCells,
          height: BAR_H,
          rx: BAR_H / 2,
          fill: c.itemSorted,
        });
        group.appendChild(bar);

        return { x, fills, bar, route };
      }

      const plain = drawPanel(
        leftX,
        false,
        t('label.plainPanel', 'Without the guess'),
        scene.plain,
      );
      const guided = drawPanel(
        leftX + gridW + gap,
        true,
        t('label.guidedPanel', 'With the guess'),
        scene.guided,
      );

      // 길의 걸음 수는 **그어진 길**에서 센다. 결론이 그림과 같은 자료를 쓴다.
      const steps = scene.plain.route.length >= 2 ? scene.plain.route.length - 1 : 0;
      const routeText = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: ROUTE_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
        opacity: steps > 0 ? 1 : 0,
      });
      routeText.textContent = steps > 0 ? t('label.route', 'Route: {n} steps', { n: steps }) : '';
      root.appendChild(routeText);

      return { plain, guided, routeText };
    }

    // ── 운동 ─────────────────────────────────────────────────────────
    /**
     * 칸 하나가 부모의 한가운데에서 자기 자리로 자라는 그림.
     *
     * 정적 그리기가 이미 끝 자리에 세워 두었으므로, 운동은 **아직 못 온 만큼을
     * 뒤로 물리는** 꼴이다.
     */
    function growth(
      rect: SVGRectElement,
      panelX: number,
      cell: number,
      gridTop: number,
      from: HeuristicGuidesSceneCell,
      to: HeuristicGuidesSceneCell,
    ): (p: number) => void {
      const seed = cell * SEED_RATIO;
      const x0 = panelX + from.col * cell + (cell - seed) / 2;
      const y0 = gridTop + from.row * cell + (cell - seed) / 2;
      const x1 = panelX + to.col * cell + 1;
      const y1 = gridTop + to.row * cell + 1;
      return (p: number): void => {
        attr(rect, {
          x: x0 + (x1 - x0) * p,
          y: y0 + (y1 - y0) * p,
          width: seed + (cell - 2 - seed) * p,
          height: seed + (cell - 2 - seed) * p,
        });
      };
    }

    function barGrowth(
      bar: SVGRectElement,
      gridW: number,
      totalCells: number,
      from: number,
      to: number,
    ): (p: number) => void {
      const w0 = (gridW * from) / totalCells;
      const w1 = (gridW * to) / totalCells;
      return (p: number): void => {
        bar.setAttribute('width', String(w0 + (w1 - w0) * p));
      };
    }

    /**
     * 출발 칸이 두 판에 함께 오른다. 부모가 없으므로 제 자리에서 자란다.
     *
     * 두 판이 **한 시계**로 돈다 — 견줄 것이 나란히 있어야 "치우친다" 가 성립한다.
     */
    function flowSeed(scene: HeuristicGuidesScene, refs: Refs, my: number): Promise<void> {
      const { cell, gridTop } = layoutOf(scene.cols, scene.rows);
      const id = scene.start.row * scene.cols + scene.start.col;
      const grows: Array<(p: number) => void> = [];
      for (const panel of [refs.plain, refs.guided]) {
        const rect = panel.fills.get(id);
        if (rect) grows.push(growth(rect, panel.x, cell, gridTop, scene.start, scene.start));
      }
      return tween(SPREAD_MS, my, (p) => {
        for (const g of grows) g(p);
      });
    }

    /**
     * 한 걸음. 두 판이 같은 시간에 움직인다.
     *
     * 흘릴 것을 **한 목록에 모아 한 시계로** 돌린다 — 두 판의 번짐과 두 막대가
     * 한 뜻으로 묶인 운동이라 시계를 나누면 나란함이 우연이 된다.
     */
    function flowSpread(
      scene: HeuristicGuidesScene,
      step: { plain: HeuristicGuidesSceneMove | null; guided: HeuristicGuidesSceneMove | null },
      refs: Refs,
      my: number,
    ): Promise<void> {
      const { cell, gridW, gridTop } = layoutOf(scene.cols, scene.rows);
      const totalCells = scene.cols * scene.rows;
      const grows: Array<(p: number) => void> = [];

      const add = (
        panel: PanelRefs,
        board: HeuristicGuidesSceneBoard,
        move: HeuristicGuidesSceneMove | null,
      ): void => {
        if (!move) return;
        for (const at of move.opened) {
          const rect = panel.fills.get(at.row * scene.cols + at.col);
          if (rect) grows.push(growth(rect, panel.x, cell, gridTop, move.cell, at));
        }
        // 막대의 출발값은 `prev` 가 아니라 이 걸음에서 나온다 — 이번에 하나를
        // 꺼냈으므로 직전 누계는 지금 누계에서 하나를 뺀 수다 (S-scene).
        grows.push(
          barGrowth(panel.bar, gridW, totalCells, board.examined.length - 1, board.examined.length),
        );
      };
      add(refs.plain, scene.plain, step.plain);
      add(refs.guided, scene.guided, step.guided);

      return tween(SPREAD_MS, my, (p) => {
        for (const g of grows) g(p);
      });
    }

    /** 두 길을 동시에 긋는다. 같은 자리에 같은 길이로 닿는 것이 결론이다. */
    function flowRoute(refs: Refs, my: number): Promise<void> {
      const lines = [refs.plain.route, refs.guided.route].filter(
        (r): r is { line: SVGPolylineElement; len: number } => r !== null,
      );
      return tween(ROUTE_MS, my, (p) => {
        for (const { line, len } of lines) {
          attr(line, { 'stroke-dasharray': len, 'stroke-dashoffset': len * (1 - p) });
        }
        refs.routeText.setAttribute('opacity', String(Math.min(1, p * 1.6)));
      });
    }

    async function render(
      next: HeuristicGuidesScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: HeuristicGuidesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'seed':
          await flowSeed(next, refs, my);
          break;
        case 'spread':
          await flowSpread(next, step, refs, my);
          break;
        case 'route':
          await flowRoute(refs, my);
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간의 끝자리를 통째로 지운다. 속성을 하나씩 거두면
      // 반드시 하나를 빠뜨린다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        // 프레임과 타이머를 거두는 것만으로는 모자라다 — 취소된 tick 은 아예
        // 불리지 않으므로, 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
