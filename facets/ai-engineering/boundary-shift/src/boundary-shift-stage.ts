/**
 * boundary-shift stage — 통째로 서 있던 낱말의 경계가 갈라져 조각이 벌어진다.
 *
 * 그림이 하는 일은 하나다. **글자는 그대로 있는데 글자 사이의 자리만 벌어진다.**
 * 그래서 운동은 전부 가로 좌표에 있다 — 조각이 벌어질 때 글자와 타일이 실제로
 * 옮겨 가고, 무너지는 느낌을 주려 조각마다 다른 깊이로 잠깐 내려앉았다 선다.
 *
 * 조각 하나는 글자와 **끝자리 표시**로 이뤄진다. 낱말의 끝을 문 조각은 오른쪽에
 * 표시를 하나 더 달고 다니며, 그것도 그 조각의 일부라 함께 옮겨 간다 — 없는
 * 것처럼 그리면 낱말이 왜 그 수로 갈리는지 설명이 한 조각 모자라게 된다.
 *
 * 좌표는 캔버스에서 역산한다 (S-piece). 세로는 그림이 정하는 값이라 이 파일의
 * 상수로 둔다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 달라진 줄 하나만 흐르게 한다 (S-scene).
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

import type {
  BoundaryCaption,
  BoundaryPiece,
  BoundaryShiftScene,
  LaneScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 낱말 끝자리에 새기는 표시.
 *
 * 도형에 각인된 글자이자 그 분야에서 원어 그대로 통용되는 표기라 표식이다 —
 * 번역하지 않고 상수로 둔다 (C10).
 */
const END_GLYPH = '</w>';

/** 캔버스 세로. 쌍 둘을 위아래로 놓고 아래에 캡션 한 줄을 둔 높이다. */
const STAGE_H = 276;
/** 캡션이 쓰는 아래쪽 띠. */
const CAPTION_BAND = 56;
/** 낱말 타일의 높이. */
const TILE_H = 64;
/** 글자 한 칸의 **상한**. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 118;
/** 좌우로 최소한 남겨 둘 여백. */
const SIDE_MIN = 44;
/** 끝자리 표시가 차지하는 폭. */
const END_W = 34;
/** 조각이 갈라졌을 때 벌어지는 틈. */
const GAP = 18;
/** 폭을 역산할 때 미리 비워 두는 틈의 수 (조각 넷까지). */
const GAP_ALLOWANCE = 3;
/** 글자 크기. 타일 높이가 정하는 값이라 토큰이 아니라 그림의 기하다 (S-view). */
const LETTER_SIZE = 40;
/** 끝자리 표시의 글자 크기. */
const END_SIZE = 13;
/** 조각이 벌어지는 데 드는 시간. */
const MOVE_MS = 520;
/** 글자 하나가 바뀌는 데 드는 시간. */
const SWAP_MS = 360;
/** 낱말이 내려앉는 데 드는 시간. */
const ENTER_MS = 340;
/** 무너질 때 조각이 내려앉는 깊이. */
const DROP = 10;
/** 글자가 들어올 때 위에서 떨어지는 높이. */
const RISE = 26;
/** 글자가 바뀔 때 위아래로 빠지는 거리. */
const SWAP_LIFT = 26;
/** 한 프레임. */
const FRAME_MS = 16;

/** 조각 하나 — 글자와, 그 조각이 낱말의 끝을 물고 있는지. 장면이 정하는 모양이다. */
type Piece = BoundaryPiece;

type Lane = {
  cy: number;
  pieces: Piece[];
  /** 조각별 왼쪽 모서리. */
  boxX: number[];
  /** 글자별 가운데 x. 운동은 이 두 배열 위에서 일어난다. */
  letterX: number[];
  /** 조각별 세로 밀림. */
  drop: number[];
  root: SVGGElement;
  gGhost: SVGGElement;
  gBody: SVGGElement;
  gMark: SVGGElement;
  gGlyph: SVGGElement;
  rects: SVGRectElement[];
  endNodes: (SVGTextElement | null)[];
  glyphs: SVGTextElement[];
  markRect: SVGRectElement | null;
  markIndex: number;
};

/** 캔버스를 몇 줄로 나눌지, 칸 폭을 얼마로 잡을지 정하는 데 필요한 것. */
type Geometry = { lanes: number; maxLen: number };

/**
 * `initialData` 를 좁히는 자리는 여기다 — 장면이 비어 있어도 반드시 불리는 유일한
 * 경로이므로 (S-piece).
 */
function readGeometry(initialData: Record<string, unknown> | undefined): Geometry {
  const raw = initialData ?? {};
  const pairs = Array.isArray(raw.pairs) ? raw.pairs : [];
  let lanes = 0;
  let maxLen = 1;
  for (const entry of pairs) {
    if (typeof entry !== 'object' || entry === null) continue;
    const p = entry as Record<string, unknown>;
    const left = typeof p.left === 'string' ? p.left : '';
    const right = typeof p.right === 'string' ? p.right : '';
    if (left === '' || right === '') continue;
    lanes += 1;
    maxLen = Math.max(maxLen, left.length, right.length);
  }
  return { lanes: Math.max(1, lanes), maxLen };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const pieceW = (p: Piece, cellW: number): number =>
  p.text.length * cellW + (p.end ? END_W : 0);

/** 조각들을 가운데 정렬해 늘어놓는다. gap 이 0 이면 붙어 선 한 덩어리가 된다. */
function layoutPieces(
  pieces: Piece[],
  cellW: number,
  gap: number,
): { boxX: number[]; letterX: number[] } {
  const total =
    pieces.reduce((a, p) => a + pieceW(p, cellW), 0) +
    gap * Math.max(0, pieces.length - 1);
  let x = Math.round((PIECE_CANVAS_W - total) / 2);
  const boxX: number[] = [];
  const letterX: number[] = [];
  for (const p of pieces) {
    boxX.push(x);
    for (let m = 0; m < p.text.length; m += 1) letterX.push(x + (m + 0.5) * cellW);
    x += pieceW(p, cellW) + gap;
  }
  return { boxX, letterX };
}

/** 글자 자리 → 그 글자가 속한 조각의 번호. */
function pieceOwners(pieces: Piece[]): number[] {
  const out: number[] = [];
  pieces.forEach((p, j) => {
    for (let m = 0; m < p.text.length; m += 1) out.push(j);
  });
  return out;
}

const ease = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export const boundaryShiftStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const geometry = readGeometry(params.initialData);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10 의 조회는
    // 저작자 오버라이드가 얹힌 `params.t` 로).
    const t = params.t ?? makeTranslator(params.locale);

    // 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). 끝자리 표시와
    // 벌어질 틈의 자리를 먼저 빼 두어야 다 벌어졌을 때도 폭 안에 담긴다.
    const budget =
      PIECE_CANVAS_W - SIDE_MIN * 2 - END_W - GAP * GAP_ALLOWANCE;
    const cellW = Math.min(CELL_MAX_W, Math.floor(budget / geometry.maxLen));
    const band = (STAGE_H - CAPTION_BAND) / geometry.lanes;

    const root = el('g', {});
    svg.appendChild(root);

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: STAGE_H - 20,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    root.appendChild(caption);

    const lanes: Lane[] = [];
    for (let i = 0; i < geometry.lanes; i += 1) {
      const laneRoot = el('g', {});
      const gGhost = el('g', {});
      const gBody = el('g', {});
      const gMark = el('g', {});
      const gGlyph = el('g', {});
      laneRoot.appendChild(gGhost);
      laneRoot.appendChild(gBody);
      laneRoot.appendChild(gMark);
      laneRoot.appendChild(gGlyph);
      root.appendChild(laneRoot);
      lanes.push({
        cy: band * (i + 0.5),
        pieces: [],
        boxX: [],
        letterX: [],
        drop: [],
        root: laneRoot,
        gGhost,
        gBody,
        gMark,
        gGlyph,
        rects: [],
        endNodes: [],
        glyphs: [],
        markRect: null,
        markIndex: -1,
      });
    }

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 운동이 줄의 좌표 배열을 프레임마다 고쳐 쓰는 짜임이라, 되짚기가 화면을 새로
     * 세운 뒤에도 앞 걸음의 운동이 살아 있으면 새 줄에 옛 좌표를 덮어쓴다 — 되짚은
     * 직후가 아니라 반 초쯤 뒤에 무너지므로 눈으로도 늦게야 잡힌다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 와 같은 모양).
    params.onScrubStart?.(() => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    function animate(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) {
          onFrame(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          onFrame(ease(raw));
          if (raw >= 1) {
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

    /** 지금 들고 있는 좌표대로 줄을 다시 놓는다. */
    function sync(lane: Lane): void {
      const owner = pieceOwners(lane.pieces);
      const top = (j: number): number => lane.cy - TILE_H / 2 + (lane.drop[j] ?? 0);

      for (let j = 0; j < lane.pieces.length; j += 1) {
        const piece = lane.pieces[j];
        const rect = lane.rects[j];
        if (rect) {
          rect.setAttribute('x', String(lane.boxX[j]));
          rect.setAttribute('width', String(pieceW(piece, cellW)));
          rect.setAttribute('y', String(top(j)));
        }
        const endNode = lane.endNodes[j];
        if (endNode) {
          endNode.setAttribute(
            'x',
            String(lane.boxX[j] + piece.text.length * cellW + END_W / 2),
          );
          endNode.setAttribute('y', String(lane.cy + END_SIZE * 0.35 + (lane.drop[j] ?? 0)));
        }
      }

      for (let i = 0; i < lane.glyphs.length; i += 1) {
        const j = owner[i] ?? 0;
        lane.glyphs[i].setAttribute('x', String(lane.letterX[i]));
        lane.glyphs[i].setAttribute(
          'y',
          String(lane.cy + LETTER_SIZE * 0.35 + (lane.drop[j] ?? 0)),
        );
      }

      if (lane.markRect && lane.markIndex >= 0) {
        const j = owner[lane.markIndex] ?? 0;
        lane.markRect.setAttribute(
          'x',
          String(lane.letterX[lane.markIndex] - cellW / 2),
        );
        lane.markRect.setAttribute('y', String(top(j)));
      }
    }

    function clearGroup(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function clearLane(lane: Lane): void {
      clearGroup(lane.gGhost);
      clearGroup(lane.gBody);
      clearGroup(lane.gMark);
      clearGroup(lane.gGlyph);
      lane.rects = [];
      lane.endNodes = [];
      lane.glyphs = [];
      lane.markRect = null;
      lane.markIndex = -1;
      lane.pieces = [];
      lane.boxX = [];
      lane.letterX = [];
      lane.drop = [];
      lane.root.setAttribute('opacity', '1');
    }

    /** 조각 타일과 끝자리 표시를 새로 세운다. 글자는 건드리지 않는다. */
    function buildBody(lane: Lane): void {
      clearGroup(lane.gBody);
      lane.rects = [];
      lane.endNodes = [];
      for (const piece of lane.pieces) {
        const rect = el('rect', {
          x: 0,
          y: 0,
          width: pieceW(piece, cellW),
          height: TILE_H,
          rx: 8,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        lane.gBody.appendChild(rect);
        lane.rects.push(rect);

        if (piece.end) {
          const endNode = el('text', {
            x: 0,
            y: 0,
            'text-anchor': 'middle',
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': END_SIZE,
          });
          endNode.textContent = END_GLYPH;
          lane.gBody.appendChild(endNode);
          lane.endNodes.push(endNode);
        } else {
          lane.endNodes.push(null);
        }
      }
    }

    function buildGlyphs(lane: Lane, word: string): void {
      clearGroup(lane.gGlyph);
      lane.glyphs = word.split('').map((ch) => {
        const node = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': LETTER_SIZE,
        });
        node.textContent = ch;
        lane.gGlyph.appendChild(node);
        return node;
      });
    }

    function laneAt(index: number): Lane | undefined {
      return index >= 0 && index < lanes.length ? lanes[index] : undefined;
    }

    /** 조각이 비어 오면 낱말 하나를 통째로 든 조각으로 친다. */
    function orWhole(pieces: Piece[], word: string): Piece[] {
      return pieces.length > 0 ? pieces : [{ text: word, end: true }];
    }

    /**
     * 바뀐 글자에 남는 표시.
     *
     * 반짝이고 사라지는 강조가 아니라 **머무는** 강조다 — 어느 한 자리 때문에
     * 경계가 무너졌는지가 이 조각의 주장이라 갈라진 뒤에도 그 자리에 남는다.
     * 정적 그리기에 넣지 않으면 되짚었을 때 사라진다 (S-scene).
     */
    function markSwapped(lane: Lane, index: number): void {
      lane.markIndex = index;
      const mark = el('rect', {
        x: 0,
        y: 0,
        width: cellW,
        height: TILE_H,
        rx: 8,
        fill: colors.itemSwapping,
        opacity: 1,
      });
      clearGroup(lane.gMark);
      lane.gMark.appendChild(mark);
      lane.markRect = mark;
      lane.glyphs[index]?.setAttribute('fill', colors.stateInk);
    }

    /**
     * 통째로 서 있던 자리에 남기는 점선.
     *
     * 조각이 벌어진 뒤에도 어디가 한 덩어리였는지를 볼 수 있게 한다. 틈 없이 붙여
     * 놓았을 때의 폭이라 지금 든 조각들로 셈이 선다.
     */
    function drawGhost(lane: Lane): void {
      clearGroup(lane.gGhost);
      if (lane.pieces.length === 0) return;
      const tight = layoutPieces(lane.pieces, cellW, 0);
      const last = lane.pieces.length - 1;
      lane.gGhost.appendChild(
        el('rect', {
          x: tight.boxX[0],
          y: lane.cy - TILE_H / 2,
          width: tight.boxX[last] + pieceW(lane.pieces[last], cellW) - tight.boxX[0],
          height: TILE_H,
          rx: 8,
          fill: 'none',
          stroke: colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 5',
        }),
      );
    }

    // ── 장면 그리기 ─────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 줄들을 다시 세운다. 되돌릴 명령을 따로 둘 필요가
    // 없고, 어느 걸음에서 어느 걸음으로 가든 같은 길이다.

    /** 줄 하나를 그 장면대로 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawLane(lane: Lane, s: LaneScene): void {
      lane.pieces = orWhole(s.pieces, s.word);
      lane.drop = lane.pieces.map(() => 0);
      const placed = layoutPieces(lane.pieces, cellW, GAP);
      lane.boxX = placed.boxX;
      lane.letterX = placed.letterX;
      buildBody(lane);
      buildGlyphs(lane, s.word);
      if (s.swapped) markSwapped(lane, s.swapped.index);
      if (s.broken) drawGhost(lane);
      sync(lane);
    }

    /** 낱말이 제 조각 수로 선다. 위에서 한 번 내려앉는다. */
    function enterLane(lane: Lane): Promise<void> {
      return animate(ENTER_MS, (p) => {
        lane.drop = lane.pieces.map(() => -(1 - p) * RISE);
        lane.root.setAttribute('opacity', String(p));
        sync(lane);
      }).then(() => {
        lane.drop = lane.pieces.map(() => 0);
        lane.root.setAttribute('opacity', '1');
        sync(lane);
      });
    }

    /**
     * 글자 하나가 바뀐다. 옛 글자는 위로 빠지고 새 글자가 아래에서 올라온다.
     *
     * 정적 그리기가 이미 새 글자를 세워 두었으므로, 흐르게 할 때만 앞 글자로
     * 되돌려 놓고 시작한다.
     */
    function swapGlyph(lane: Lane, index: number, prevLetter: string): Promise<void> {
      const glyph = lane.glyphs[index];
      if (!glyph) return Promise.resolve();
      const letter = glyph.textContent ?? '';
      const mark = lane.markRect;
      const owner = pieceOwners(lane.pieces);
      const baseY = lane.cy + LETTER_SIZE * 0.35 + (lane.drop[owner[index] ?? 0] ?? 0);

      glyph.textContent = prevLetter;
      mark?.setAttribute('opacity', '0');

      return animate(SWAP_MS, (p) => {
        mark?.setAttribute('opacity', String(Math.min(1, p * 1.6)));
        if (p < 0.5) {
          const q = p * 2;
          glyph.setAttribute('y', String(baseY - SWAP_LIFT * q));
          glyph.setAttribute('opacity', String(1 - q));
        } else {
          const q = (p - 0.5) * 2;
          if (glyph.textContent !== letter) glyph.textContent = letter;
          glyph.setAttribute('y', String(baseY + SWAP_LIFT * (1 - q)));
          glyph.setAttribute('opacity', String(q));
        }
      }).then(() => {
        glyph.textContent = letter;
        // 지운다 — `1` 로 되돌리지 않는다. 흐르지 않고 곧바로 세운 화면에는 이
        // 속성이 아예 없어, 남겨 두면 같은 걸음인데 화면이 갈린다.
        glyph.removeAttribute('opacity');
        mark?.setAttribute('opacity', '1');
        sync(lane);
      });
    }

    /**
     * 경계가 갈라진다.
     *
     * 글자는 그대로 있고 자리만 벌어진다. 정적 그리기가 이미 벌어진 자리에 세워
     * 두었으므로, 흐르게 할 때만 붙어 있던 자리로 되돌려 놓고 시작한다 — 금이 먼저
     * 보이고 그 다음 벌어진다.
     */
    function spreadLane(lane: Lane): Promise<void> {
      const pieces = lane.pieces;
      const tight = layoutPieces(pieces, cellW, 0);
      const spread = layoutPieces(pieces, cellW, GAP);

      lane.boxX = tight.boxX.slice();
      lane.letterX = tight.letterX.slice();
      lane.drop = pieces.map(() => 0);
      sync(lane);

      return animate(MOVE_MS, (p) => {
        for (let i = 0; i < lane.letterX.length; i += 1) {
          lane.letterX[i] = tight.letterX[i] + (spread.letterX[i] - tight.letterX[i]) * p;
        }
        for (let j = 0; j < lane.boxX.length; j += 1) {
          lane.boxX[j] = tight.boxX[j] + (spread.boxX[j] - tight.boxX[j]) * p;
        }
        const dip = Math.sin(Math.PI * p);
        lane.drop = pieces.map((_, j) => dip * DROP * (0.6 + j * 0.35));
        sync(lane);
      }).then(() => {
        lane.boxX = spread.boxX.slice();
        lane.letterX = spread.letterX.slice();
        lane.drop = pieces.map(() => 0);
        sync(lane);
      });
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: BoundaryCaption | null): void {
      if (!cap) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'whole':
          caption.textContent = t(
            'caption.whole',
            '"{word}" — pieces: {n}. It holds together.',
            { word: cap.word, n: cap.pieces },
          );
          return;
        case 'swap':
          caption.textContent = t(
            'caption.swap',
            'One letter changes: "{from}" becomes "{to}".',
            { from: cap.from, to: cap.to },
          );
          return;
        case 'shatter':
          caption.textContent = t('caption.shatter', 'The boundary gives way — pieces: {n}.', {
            n: cap.pieces,
          });
          return;
        case 'done':
          caption.textContent = t(
            'caption.done',
            'One letter apart, yet the cuts fall differently.',
          );
          return;
      }
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const lane of lanes) clearLane(lane);
      caption.textContent = '';
    }

    async function render(
      next: BoundaryShiftScene,
      prev: BoundaryShiftScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      rewind();

      // 선 줄은 걷히지 않는다 — 이미 갈라진 줄도 갈라진 채로 다시 세운다.
      next.lanes.forEach((s, i) => {
        if (!s) return;
        const lane = laneAt(i);
        if (lane) drawLane(lane, s);
      });

      drawCaption(next.caption);

      if (!opts.animate) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 왔으면 `step` 이
      // 이어지지 않으므로 그 경우도 여기서 걸러진다.
      const step = next.step;
      if (!step || step === prev?.step) return;
      const lane = laneAt(step.lane);
      const s = next.lanes[step.lane];
      if (!lane || !s) return;

      switch (step.kind) {
        case 'stands':
          await enterLane(lane);
          return;
        case 'swapped':
          if (s.swapped) await swapGlyph(lane, s.swapped.index, s.swapped.prevLetter);
          return;
        case 'broken':
          await spreadLane(lane);
          return;
      }
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
