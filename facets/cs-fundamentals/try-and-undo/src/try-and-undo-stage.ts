/**
 * try-and-undo-stage — 놓는 운동과 걷어내는 운동이 짝을 이루는 판.
 *
 * ## 왜 이 그림인가
 *
 * 이 조각의 주인공은 물림이다. 그래서 화면의 주축은 **세로**다 — 말은 위 행에서
 * 아래로 떨어져 내려앉고, 막히면 방금 앉은 말이 자기 칸의 천장을 뚫고 도로
 * 올라가 사라진다. 지시자(caret)도 같은 축을 따라 내려가고 되올라간다.
 *
 * 판을 정사각으로 그리지 않았다. 행이 가로로 넓은 띠가 되어야 "위 행부터 한 줄에
 * 하나씩" 이라는 절차가 그대로 읽히고, 세로 운동이 띠를 가로지르며 크게 보인다.
 * 정사각으로 잡으면 620 폭 가운데 300 남짓만 쓰고 좌우를 버리게 된다.
 *
 * ## 칸이 지고 있는 네 가지 표시
 *
 * - **말** — 그 행에서 고른 자리. 원반 하나. 이번 걸음에 놓은 것만 `itemActive`
 *   이고 나머지는 `primary` 다 — 채움이 **값의 형편**을 말한다.
 * - **×** — 놓인 말이 못 쓰게 만든 칸. 막힘이 임의로 보이지 않게 하는 근거다.
 *   상태 어휘(itemComparing 류)에 "금지" 가 없으므로 색 결정 트리 2번(severity)
 *   의 `danger` 를 쓴다 (S-view).
 * - **자국** — 지금 그 행에서 이미 가 봤다가 물러난 자리. 말과 같은 크기의 점선
 *   원이라 "여기 말이 있었다" 로 읽힌다. `ghostOutline` (special).
 * - **헛걸음 점** — 한 번이라도 물려 나온 칸의 오른쪽 위 모서리에 찍히는 작은 점.
 *   재생 내내 지워지지 않아 다 끝난 화면에서도 "몇 번을 헛짚었나" 가 보인다.
 *
 * 앞의 셋은 걸음마다 판이 정확히 이전 상태로 돌아가는 것을 말하고, 넷째는 그
 * 돌아감이 **공짜가 아니었다**는 것을 말한다. 채움(값의 형편) · 테두리(지금
 * 막고 있는 것) · 모서리 점(지나간 헛걸음) 이 서로 다른 어휘라 부딪히지 않는다 —
 * 점을 자국과 같은 점선 원으로 그리면 "자국이 안 지워졌다" 로 읽힌다. 그것은 이
 * 조각이 말하려는 것의 정반대다.
 *
 * ## 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 되돌릴 명령이 필요 없고,
 * 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 말은 이미 자기 칸에 서 있고,
 * 걸음은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 반대로 물림에서는 화면에
 * 이미 없는 것(걷어낸 말 · 풀린 ×)을 임시로 지어 흐르게 하고, 끝에서 `drawStatic`
 * 이 통째로 다시 세워 그 임시물을 지운다.
 *
 * **CSS transition 을 쓰지 않는다.** 되짚기는 `animate:false` 로 오는데 transition
 * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 — 흔들림의 원인이다. 시계는 rAF
 * 트윈 하나뿐이다.
 *
 * ## 세로
 *
 * 마운트한 뒤 viewBox 를 다시 재지 않는다 (S-view). 판 크기가 달라져도 칸 높이를
 * 나눠 담을 뿐 캔버스는 그대로다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  activeRow,
  blockedLinks,
  captionOf,
  colOf,
  forbiddenCells,
  forbiddenFor,
  justLifted,
  justPlaced,
  rowOf,
  type TryAndUndoScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 자리. 가로는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
const W = PIECE_CANVAS_W;
const CANVAS_H = 372;
const SIDE_MIN = 23;
/** 행 번호와 지시자가 서는 왼쪽 여백. */
const GUTTER_W = 42;
const CELL_W_MAX = 140;
const BOARD_TOP = 58;
const BOARD_H = 296;
const CAPTION_Y = 26;

// ── 걸음의 길이. stepMs(460) 위에 얹히므로, 가장 얇은 걸음도 읽을 틈(800ms)을
//    넘도록 잡는다 (S-piece 얇은 걸음).
/** 말이 떨어져 내려앉고 못 쓰게 된 칸이 피어나는 데 드는 시간. */
const PLACE_MS = 380;
/** 자국이 한 번 튀고 막은 손들이 뻗어 오는 시간. */
const BLOCKED_MS = 400;
/** 쥐고 · 들어 올리고 · 자국이 남기까지. 이 조각의 주인공이라 가장 길다. */
const UNDO_MS = 560;
/** 넷이 다 섰을 때 위에서 아래로 한 번씩 짚어 주는 시간. */
const SETTLE_MS = 560;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 전체 진행 `p` 안에서 `[a,b]` 구간만 잘라 0..1 로 편다. */
function phase(p: number, a: number, b: number): number {
  return clamp01((p - a) / (b - a));
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** 나갔다 돌아오는 부풀림. 0 에서 시작해 0.5 에서 1 이 되고 1 에서 다시 0 이다. */
function bump(t: number): number {
  return Math.sin(Math.PI * clamp01(t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 소수 끝자리가 문자열을 가르지 않게 셋째 자리에서 끊는다 (S-scene). */
function fx(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}

/**
 * 그림의 밑감. 장면이 말하는 판 크기에서 매번 역산한다.
 *
 * mount 때 한 번 재던 것을 정적 그리기가 매번 정하게 옮겼다 — 판 크기가 장면에서
 * 오므로 밑감도 장면에서 나와야 잣대가 한 군데다.
 */
type Layout = {
  size: number;
  cellW: number;
  cellH: number;
  originX: number;
  boardW: number;
  tokenR: number;
  gutterX: number;
  cellX(cell: number): number;
  cellY(cell: number): number;
  rowY(row: number): number;
};

function layoutOf(size: number): Layout {
  const cellW = Math.min(CELL_W_MAX, Math.floor((W - SIDE_MIN * 2 - GUTTER_W) / size));
  const cellH = Math.floor(BOARD_H / size);
  const boardW = cellW * size;
  const originX = Math.round((W - GUTTER_W - boardW) / 2) + GUTTER_W;
  const tokenR = Math.round(Math.min(cellW, cellH) * 0.27);
  return {
    size,
    cellW,
    cellH,
    originX,
    boardW,
    tokenR,
    gutterX: originX - GUTTER_W,
    cellX: (cell) => originX + (cell % size) * cellW + cellW / 2,
    cellY: (cell) => BOARD_TOP + Math.floor(cell / size) * cellH + cellH / 2,
    rowY: (row) => BOARD_TOP + row * cellH + cellH / 2,
  };
}

export const tryAndUndoStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  // 컨테이너는 쓰지 않는다 — 러너가 만든 캔버스 안에만 그린다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<TryAndUndoScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 레이어의 차례가 곧 겹치는 차례다. 레이어 자체는 다시 짓지 않고 속성도 걸지
    // 않는다 — 안에 든 것만 매번 새로 짓는다.
    const bandsLayer = el('g');
    const tintsLayer = el('g');
    const gridLayer = el('g');
    const marksLayer = el('g');
    const piecesLayer = el('g');
    const linksLayer = el('g');
    const chromeLayer = el('g');
    const captionLayer = el('g');
    svg.append(
      bandsLayer,
      tintsLayer,
      gridLayer,
      marksLayer,
      piecesLayer,
      linksLayer,
      chromeLayer,
      captionLayer,
    );

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const rafIds = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 요소를 매번 새로 짓지만 그 손잡이를 담는 아래 Map 들은
     * **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이 그것을 읽으면 새
     * 손잡이를 타고 살아 있는 화면에 쓴다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const startedAt = Date.now();
        let id = 0;
        const frame = (): void => {
          rafIds.delete(id);
          const raw = clamp01((Date.now() - startedAt) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          rafIds.add(id);
        };
        id = requestAnimationFrame(frame);
        rafIds.add(id);
      });
    }

    // ── 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다.
    let tintEls = new Map<number, SVGRectElement>();
    let crossEls = new Map<number, SVGGElement>();
    let ghostEls = new Map<number, SVGGElement>();
    let traceEls = new Map<number, SVGGElement>();
    let pieceEls = new Map<number, SVGGElement>();
    let linkEls: SVGLineElement[] = [];
    let caretEl: SVGPathElement | null = null;

    function put(node: SVGElement, x: number, y: number, scale = 1): void {
      node.setAttribute('transform', `translate(${fx(x)} ${fx(y)}) scale(${fx(scale)})`);
    }

    /** 못 쓰는 칸의 옅은 바탕. */
    function makeTint(L: Layout, cell: number): SVGRectElement {
      return el('rect', {
        x: L.originX + (cell % L.size) * L.cellW + 3,
        y: BOARD_TOP + Math.floor(cell / L.size) * L.cellH + 3,
        width: L.cellW - 6,
        height: L.cellH - 6,
        rx: 7,
        fill: c.danger,
        'fill-opacity': 0.07,
      });
    }

    /** × 표시. 그룹 원점이 칸 한가운데라 자리와 크기를 transform 으로 준다. */
    function makeCross(L: Layout): SVGGElement {
      const g = el('g');
      const arm = Math.round(L.tokenR * 0.55);
      for (const [x1, y1, x2, y2] of [
        [-arm, -arm, arm, arm],
        [-arm, arm, arm, -arm],
      ]) {
        g.appendChild(
          el('line', {
            x1,
            y1,
            x2,
            y2,
            stroke: c.danger,
            'stroke-width': 2.4,
            'stroke-linecap': 'round',
            'stroke-opacity': 0.5,
          }),
        );
      }
      return g;
    }

    /** 지금 살아 있는 자국 — 말과 같은 크기의 점선 원. */
    function makeGhost(L: Layout): SVGGElement {
      const g = el('g');
      g.appendChild(
        el('circle', {
          cx: 0,
          cy: 0,
          r: L.tokenR,
          fill: 'none',
          stroke: c.ghostOutline,
          'stroke-width': 1.6,
          'stroke-dasharray': '3 4',
        }),
      );
      return g;
    }

    /** 헛걸음 점 — 한 번 물려 나온 자리에 재생이 끝날 때까지 남는다. */
    function makeTrace(): SVGGElement {
      const g = el('g');
      g.appendChild(
        el('circle', { cx: 0, cy: 0, r: 3, fill: c.ghostOutline, 'fill-opacity': 0.6 }),
      );
      return g;
    }

    /** 헛걸음 점이 앉는 자리 — 칸의 오른쪽 위 모서리. */
    function traceAt(L: Layout, cell: number): { x: number; y: number } {
      return { x: L.cellX(cell) + L.cellW / 2 - 12, y: L.cellY(cell) - L.cellH / 2 + 12 };
    }

    /** 말 하나. 가운데를 뚫어 두어 겹쳐도 아래 표시가 비친다. */
    function makePiece(L: Layout, fill: string): SVGGElement {
      const g = el('g');
      g.appendChild(el('circle', { cx: 0, cy: 0, r: L.tokenR, fill }));
      g.appendChild(el('circle', { cx: 0, cy: 0, r: Math.round(L.tokenR * 0.38), fill: c.bg }));
      return g;
    }

    /** 행을 짚는 지시자. */
    function makeCaret(): SVGPathElement {
      return el('path', { d: 'M 0 -8 L 10 0 L 0 8 Z', fill: c.auxCursor });
    }

    function captionText(scene: TryAndUndoScene): string {
      const cap = captionOf(scene);
      switch (cap.kind) {
        case 'start':
          return tr('caption.start', 'An empty board. One piece per row, from the top down.');
        case 'place':
          return tr('caption.place', 'Row {row}: put a piece on column {col}.', {
            row: cap.row,
            col: cap.col,
          });
        case 'blocked':
          return tr('caption.blocked', 'Row {row}: every square left is ruled out.', {
            row: cap.row,
          });
        case 'undo':
          return tr(
            'caption.undo',
            'Take the row {row} piece back. Everything below it returns to what it was.',
            { row: cap.row },
          );
        case 'undoRoot':
          return tr('caption.undoRoot', 'Back past the very first move. The board is empty again.');
        case 'solved':
          return tr('caption.solved', 'All four stand — {placed} placements and {undone} take-backs.', {
            placed: cap.placed,
            undone: cap.undone,
          });
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform ·
     * opacity · 보간 끝자리도 함께 사라진다 (S-scene). **아직 없는 것은 숨기지 말고
     * 짓지 않는다** — 0 으로 눌러 둔 요소는 앞 걸음의 값을 함께 끌고 다닌다.
     */
    function drawStatic(scene: TryAndUndoScene): void {
      const L = layoutOf(scene.size);
      for (const layer of [
        bandsLayer,
        tintsLayer,
        gridLayer,
        marksLayer,
        piecesLayer,
        linksLayer,
        chromeLayer,
        captionLayer,
      ]) {
        layer.textContent = '';
      }
      tintEls = new Map<number, SVGRectElement>();
      crossEls = new Map<number, SVGGElement>();
      ghostEls = new Map<number, SVGGElement>();
      traceEls = new Map<number, SVGGElement>();
      pieceEls = new Map<number, SVGGElement>();
      linkEls = [];
      caretEl = null;

      const solved = scene.step?.kind === 'done';
      const blocked = scene.step?.kind === 'blocked';
      const act = activeRow(scene);

      // ── 지금 채우고 있는 행의 띠. 막혔으면 붉어진다.
      if (act !== null) {
        const band = el('rect', {
          x: L.gutterX,
          y: BOARD_TOP + act * L.cellH,
          width: L.boardW + GUTTER_W,
          height: L.cellH,
          rx: 8,
          fill: blocked ? c.danger : c.bgSubtle,
          'fill-opacity': blocked ? 0.09 : 1,
        });
        bandsLayer.appendChild(band);
      }

      // ── 행·열 번호.
      for (let row = 0; row < L.size; row += 1) {
        const label = el('text', {
          x: L.gutterX + 13,
          y: L.rowY(row) + 4,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = String(row);
        chromeLayer.appendChild(label);
      }
      for (let col = 0; col < L.size; col += 1) {
        const label = el('text', {
          x: L.originX + col * L.cellW + L.cellW / 2,
          y: BOARD_TOP - 10,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = String(col);
        chromeLayer.appendChild(label);
      }

      // ── 칸 테두리.
      for (let cell = 0; cell < L.size * L.size; cell += 1) {
        gridLayer.appendChild(
          el('rect', {
            x: L.originX + (cell % L.size) * L.cellW + 3,
            y: BOARD_TOP + Math.floor(cell / L.size) * L.cellH + 3,
            width: L.cellW - 6,
            height: L.cellH - 6,
            rx: 7,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
      }

      // ── 못 쓰는 칸.
      for (const cell of forbiddenCells(scene)) {
        const tint = makeTint(L, cell);
        tintsLayer.appendChild(tint);
        tintEls.set(cell, tint);

        const cross = makeCross(L);
        put(cross, L.cellX(cell), L.cellY(cell));
        marksLayer.appendChild(cross);
        crossEls.set(cell, cross);
      }

      // ── 헛걸음 테. 물림 한 번이 항목 하나이므로 자리로 추려 그린다.
      for (const cell of new Set(scene.tried)) {
        const trace = makeTrace();
        const at = traceAt(L, cell);
        put(trace, at.x, at.y);
        marksLayer.appendChild(trace);
        traceEls.set(cell, trace);
      }

      // ── 지금 살아 있는 자국.
      for (const cell of scene.abandoned) {
        const ghost = makeGhost(L);
        put(ghost, L.cellX(cell), L.cellY(cell));
        marksLayer.appendChild(ghost);
        ghostEls.set(cell, ghost);
      }

      // ── 답이 섰으면 말이 앉은 칸을 물들인다. 채움이 값의 형편을 말한다.
      if (solved) {
        for (let row = 0; row < scene.queens.length; row += 1) {
          const cell = row * L.size + scene.queens[row];
          const lit = makeTint(L, cell);
          lit.setAttribute('fill', c.accent);
          lit.setAttribute('fill-opacity', '0.24');
          tintsLayer.appendChild(lit);
          tintEls.set(cell, lit);
        }
      }

      // ── 말. 이번 걸음에 놓은 것만 다른 채움이다.
      const fresh = justPlaced(scene);
      for (let row = 0; row < scene.queens.length; row += 1) {
        const cell = row * L.size + scene.queens[row];
        const piece = makePiece(L, cell === fresh ? c.itemActive : c.primary);
        put(piece, L.cellX(cell), L.cellY(cell));
        piecesLayer.appendChild(piece);
        pieceEls.set(cell, piece);
      }

      // ── 막힘의 근거. 애니메이션에만 두지 않는다 — 되짚어 세운 화면에도 어느
      //    말이 어느 칸을 가져갔는지가 있어야 판정에 근거가 선다.
      for (const link of blockedLinks(scene)) {
        const line = el('line', {
          x1: L.cellX(link.from),
          y1: L.cellY(link.from),
          x2: L.cellX(link.to),
          y2: L.cellY(link.to),
          stroke: c.danger,
          'stroke-width': 1.6,
          'stroke-opacity': 0.45,
          'stroke-linecap': 'round',
        });
        linksLayer.appendChild(line);
        linkEls.push(line);
      }

      // ── 지시자.
      if (act !== null) {
        const caret = makeCaret();
        put(caret, L.originX - 13, L.rowY(act));
        chromeLayer.appendChild(caret);
        caretEl = caret;
      }

      // ── 캡션.
      const text = el('text', {
        x: Math.round(W / 2),
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      text.textContent = captionText(scene);
      captionLayer.appendChild(text);
    }

    // ── 걸음의 운동 ────────────────────────────────────────────────────────
    //
    // 출발 그림은 언제나 `next` 에서 셈한다. 앞 장면은 무엇을 흐르게 할지 고르는
    // 데만 쓰므로 여기서는 아예 받지 않는다 (S-scene).

    /** 못 쓰게 된 칸이 피어나거나 풀려 나가는 몫. 두 걸음이 함께 쓴다. */
    function markFrame(
      cells: readonly number[],
      opacity: number,
      scale: number,
      L: Layout,
      tints: Map<number, SVGRectElement>,
      crosses: Map<number, SVGGElement>,
    ): void {
      for (const cell of cells) {
        const tint = tints.get(cell);
        if (tint) tint.setAttribute('opacity', fx(opacity));
        const cross = crosses.get(cell);
        if (cross) {
          cross.setAttribute('opacity', fx(opacity));
          put(cross, L.cellX(cell), L.cellY(cell), scale);
        }
      }
    }

    /** 풀려 나가는 ×. 정적 그림에 없으므로 임시로 짓는다. */
    function makeLeaving(
      cells: readonly number[],
      L: Layout,
    ): { tints: Map<number, SVGRectElement>; crosses: Map<number, SVGGElement> } {
      const tints = new Map<number, SVGRectElement>();
      const crosses = new Map<number, SVGGElement>();
      for (const cell of cells) {
        const tint = makeTint(L, cell);
        tintsLayer.appendChild(tint);
        tints.set(cell, tint);
        const cross = makeCross(L);
        put(cross, L.cellX(cell), L.cellY(cell));
        marksLayer.appendChild(cross);
        crosses.set(cell, cross);
      }
      return { tints, crosses };
    }

    /** 놓는다 — 위 칸에서 떨어져 내려앉고, 못 쓰게 된 칸들이 피어난다. */
    function flowPlace(scene: TryAndUndoScene, mine: number): Promise<void> {
      const cell = justPlaced(scene);
      if (cell === null) return Promise.resolve();
      const L = layoutOf(scene.size);
      const row = rowOf(scene, cell);
      const piece = pieceEls.get(cell) ?? null;
      const caret = caretEl;

      const before = forbiddenFor(scene.size, scene.queens.slice(0, -1));
      const after = forbiddenCells(scene);
      const added = after.filter((x) => !before.includes(x));
      const leaving = makeLeaving(
        before.filter((x) => !after.includes(x)),
        L,
      );

      const x = L.cellX(cell);
      const y = L.cellY(cell);
      const caretTo = activeRow(scene);
      // 마지막 행을 채우면 지시자가 갈 데가 없다. 정적 그림에 없으므로 임시로
      // 지어 물러나는 것까지 보인다 — 없는 것을 숨겨 두면 앞 걸음 값이 따라온다.
      const leavingCaret = caretTo === null ? chromeLayer.appendChild(makeCaret()) : null;

      // 첫 프레임에 끝 자리가 번쩍이지 않도록 물림을 미리 박아 둔다.
      const drop = (p: number): void => {
        const e = easeOut(phase(p, 0, 0.55));
        if (piece) {
          piece.setAttribute('opacity', fx(e));
          put(piece, x, y - L.cellH * (1 - e), lerp(0.88, 1, e));
        }
        if (caret && caretTo !== null) {
          put(caret, L.originX - 13, lerp(L.rowY(row), L.rowY(caretTo), easeInOut(phase(p, 0, 0.6))));
        }
        if (leavingCaret) {
          const out = easeOut(phase(p, 0, 0.6));
          leavingCaret.setAttribute('opacity', fx(1 - out));
          put(leavingCaret, L.originX - 13, L.rowY(row), lerp(1, 0.6, out));
        }
        const q = easeOut(phase(p, 0.45, 1));
        markFrame(added, q, lerp(0.5, 1, q), L, tintEls, crossEls);
        markFrame(
          [...leaving.tints.keys()],
          1 - q,
          lerp(1, 0.5, q),
          L,
          leaving.tints,
          leaving.crosses,
        );
      };

      drop(0);
      return tween(PLACE_MS, (p) => {
        if (!alive(mine)) return;
        drop(p);
      });
    }

    /** 막혔다 — 자국이 한 번 튀고, 놓인 말들이 이 행으로 손을 뻗는다. */
    function flowBlocked(scene: TryAndUndoScene, mine: number): Promise<void> {
      const L = layoutOf(scene.size);
      const row = scene.queens.length;
      const ghosts = scene.abandoned
        .filter((cell) => rowOf(scene, cell) === row)
        .map((cell) => ({ cell, node: ghostEls.get(cell) }))
        .filter((g): g is { cell: number; node: SVGGElement } => g.node !== undefined);

      // 길이는 화면을 되읽지 않고 장면에서 다시 셈한다 — 정적 그리기와 같은
      // 차례로 나오므로 짝이 어긋날 자리가 없다 (S-scene).
      const lines = blockedLinks(scene)
        .map((link, i) => ({
          node: linkEls[i],
          length: Math.round(Math.hypot(L.cellX(link.to) - L.cellX(link.from), L.cellY(link.to) - L.cellY(link.from))) + 2,
        }))
        .filter((line): line is { node: SVGLineElement; length: number } => line.node !== undefined);

      const draw = (p: number): void => {
        const pop = bump(phase(p, 0, 0.36));
        for (const g of ghosts) put(g.node, L.cellX(g.cell), L.cellY(g.cell), 1 + 0.26 * pop);
        lines.forEach((line, i) => {
          // 손이 하나씩 차례로 뻗는다 — 한 시계 안의 어긋냄이라 갈릴 자리가 없다.
          const span = lines.length > 1 ? 0.22 : 0;
          const from = 0.2 + (span * i) / Math.max(1, lines.length - 1);
          const e = easeOut(phase(p, from, 1));
          if (e >= 1) {
            line.node.removeAttribute('stroke-dasharray');
            line.node.removeAttribute('stroke-dashoffset');
            return;
          }
          line.node.setAttribute('stroke-dasharray', String(line.length));
          line.node.setAttribute('stroke-dashoffset', fx(line.length * (1 - e)));
        });
      };

      draw(0);
      return tween(BLOCKED_MS, (p) => {
        if (!alive(mine)) return;
        draw(p);
      });
    }

    /** 걷어낸다 — 방금 놓은 말이 칸의 천장을 뚫고 되올라가 사라진다. */
    function flowUndo(scene: TryAndUndoScene, mine: number): Promise<void> {
      const cell = justLifted(scene);
      if (cell === null) return Promise.resolve();
      const L = layoutOf(scene.size);
      const row = rowOf(scene, cell);
      const col = colOf(scene, cell);

      // 물리기 직전의 판. 앞 장면을 들추지 않고 지금 장면에서 되짚는다.
      const before = forbiddenFor(scene.size, [...scene.queens, col]);
      const after = forbiddenCells(scene);
      const added = after.filter((x) => !before.includes(x));
      const leaving = makeLeaving(
        before.filter((x) => !after.includes(x)),
        L,
      );

      // 걷어내는 말과 막음의 근거는 다음 화면에 없다 — 흐르는 동안만 임시로 짓는다.
      const lifted = makePiece(L, c.itemActive);
      piecesLayer.appendChild(lifted);

      const ghost = ghostEls.get(cell) ?? null;
      const traceSeat = traceAt(L, cell);
      // 헛걸음 점은 이 걸음에 새로 난 것이다. 자국과 같은 박자로 남는다.
      const trace = scene.tried.filter((x) => x === cell).length === 1 ? traceEls.get(cell) ?? null : null;
      const caret = caretEl;
      const x = L.cellX(cell);
      const y = L.cellY(cell);

      const draw = (p: number): void => {
        const grip = easeOut(phase(p, 0, 0.13));
        const rise = easeInOut(phase(p, 0.13, 0.62));
        lifted.setAttribute('opacity', fx(1 - rise));
        put(lifted, x, y - L.cellH * 0.92 * rise, lerp(1 + 0.14 * grip, 0.72, rise));

        const m = easeInOut(phase(p, 0.18, 0.66));
        markFrame(added, m, lerp(0.5, 1, m), L, tintEls, crossEls);
        markFrame([...leaving.tints.keys()], 1 - m, lerp(1, 0.5, m), L, leaving.tints, leaving.crosses);

        if (caret) {
          put(
            caret,
            L.originX - 13,
            lerp(L.rowY(row + 1), L.rowY(row), easeInOut(phase(p, 0.2, 0.62))),
          );
        }

        // 자국은 말이 다 빠져나간 뒤에 남는다.
        const settle = easeOut(phase(p, 0.62, 1));
        if (ghost) {
          ghost.setAttribute('opacity', fx(settle));
          put(ghost, x, y, lerp(1.2, 1, settle));
        }
        if (trace) {
          // 점은 걷어낸 말이 있던 자리에서 모서리로 옮겨 앉는다 — 자리를 옮기는
          // 운동이라 "여기 있던 것이 자취로 접혔다" 로 읽힌다.
          trace.setAttribute('opacity', fx(settle));
          put(trace, lerp(x, traceSeat.x, settle), lerp(y, traceSeat.y, settle), lerp(2.4, 1, settle));
        }
      };

      draw(0);
      return tween(UNDO_MS, (p) => {
        if (!alive(mine)) return;
        draw(p);
      });
    }

    /** 넷이 다 섰다 — 위에서 아래로 한 번씩 짚어 준다. */
    function flowSettle(scene: TryAndUndoScene, mine: number): Promise<void> {
      const L = layoutOf(scene.size);
      const seats = scene.queens.map((col, row) => row * L.size + col);
      if (seats.length === 0) return Promise.resolve();

      const draw = (p: number): void => {
        seats.forEach((cell, i) => {
          const from = (0.5 * i) / seats.length;
          const q = phase(p, from, from + 0.5);
          const piece = pieceEls.get(cell);
          if (piece) put(piece, L.cellX(cell), L.cellY(cell), 1 + 0.18 * bump(q));
          const tint = tintEls.get(cell);
          if (tint) tint.setAttribute('opacity', fx(easeOut(q)));
        });
      };

      draw(0);
      return tween(SETTLE_MS, (p) => {
        if (!alive(mine)) return;
        draw(p);
      });
    }

    function flow(scene: TryAndUndoScene, mine: number): Promise<void> {
      switch (scene.step?.kind) {
        case 'place':
          return flowPlace(scene, mine);
        case 'blocked':
          return flowBlocked(scene, mine);
        case 'undo':
          return flowUndo(scene, mine);
        case 'done':
          return flowSettle(scene, mine);
        default:
          return Promise.resolve();
      }
    }

    async function render(
      next: TryAndUndoScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: TryAndUndoScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      await flow(next, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 opacity · 보간 끝자리 · 임시 노드를 통째로 거둔다. 되돌릴
      // 목록을 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafIds) cancelAnimationFrame(id);
        }
        rafIds.clear();
        // 걸어 둔 프레임을 거두면 그 tick 은 아예 불리지 않으므로, 기다리던
        // promise 를 여기서 직접 깨운다 (S-piece).
        for (const done of [...pending]) done();
        pending.clear();
        tintEls.clear();
        crossEls.clear();
        ghostEls.clear();
        traceEls.clear();
        pieceEls.clear();
        linkEls = [];
        caretEl = null;
        svg.textContent = '';
      },
    };
  },
};
