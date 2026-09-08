/**
 * try-and-undo stage — 놓는 운동과 걷어내는 운동이 짝을 이루는 판.
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
 * ## 칸이 지고 있는 세 가지 표시
 *
 * - **말** — 그 행에서 고른 자리. 원반 하나.
 * - **×** — 놓인 말이 못 쓰게 만든 칸. 막힘이 임의로 보이지 않게 하는 근거다.
 *   상태 어휘(itemComparing 류)에 "금지" 가 없으므로 색 결정 트리 2번(severity)
 *   의 `danger` 를 쓴다 (S-view).
 * - **자국** — 놓아 봤다가 물려 나온 자리. 말과 같은 크기의 점선 원이라
 *   "여기 말이 있었다" 로 읽힌다. `ghostOutline` (special).
 *
 * 표시는 걸음마다 algorithm 이 셈해 보낸 집합으로 통째로 다시 맞춘다. 그래서
 * 물릴 때 표시가 반쯤 남는 일이 구조적으로 생기지 않는다 — 판이 정확히 이전
 * 상태로 돌아간다는 것이 이 조각의 매듭이다.
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
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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

// ── 걸음의 길이. stepMs 위에 얹히므로 짧게 잡는다 (S-piece).
/** 말이 위 칸에서 떨어져 내려앉는 시간. */
const DROP_MS = 200;
/** 표시가 피어나거나 거두어지는 시간. */
const MARK_MS = 130;
/** 지시자가 한 행을 옮겨 가는 시간. */
const CARET_MS = 220;
/** 걷어내기 직전, 말을 쥐는 짧은 사이. */
const GRIP_MS = 80;
/** 말이 칸을 뚫고 올라가 사라지는 시간. 놓기보다 길다 — 주인공이다. */
const LIFT_MS = 270;
/** 빈 자리에 자국이 남는 시간. */
const GHOST_MS = 130;
/** 놓인 말들이 막힌 행으로 손을 뻗는 시간. */
const LINK_MS = 210;
/** 답이 섰을 때 말이 하나씩 튀는 사이. */
const SETTLE_STEP_MS = 70;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

type CellParts = {
  /** 못 쓰는 칸의 옅은 바탕. */
  tint: SVGRectElement;
  /** × 표시. */
  cross: SVGGElement;
  /** 가 봤다가 물려 나온 자국. */
  ghost: SVGGElement;
};

type Piece = {
  group: SVGGElement;
  disc: SVGCircleElement;
};

export type TryAndUndoStageInit = {
  /** 판의 한 변. */
  size: number;
};

export type TryAndUndoPlaceSpec = {
  row: number;
  col: number;
  /** 앞으로 갈 행들 가운데 못 쓰게 된 칸 전부. */
  forbidden: number[];
  /** 물려 나온 자국이 남은 칸 전부. */
  abandoned: number[];
};

export type TryAndUndoBlockSpec = {
  row: number;
  /** linkFrom[i] 의 말이 linkTo[i] 칸을 막고 있다. */
  linkFrom: number[];
  linkTo: number[];
};

export type TryAndUndoUndoSpec = TryAndUndoPlaceSpec & {
  /** 걷어내고 남은 말의 수. 0 이면 판이 처음처럼 빈 것이다. */
  remaining: number;
};

export const tryAndUndoStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  // 컨테이너는 쓰지 않는다 — 러너가 만든 캔버스 안에만 그린다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);

    // 컨테이너를 비우지 않는다 — 러너가 붙여 준 캔버스가 떨어져 나간다 (S-view).
    const root = el('g');
    svg.appendChild(root);

    const layerBands = el('g');
    const layerTints = el('g');
    const layerGrid = el('g');
    const layerMarks = el('g');
    const layerPieces = el('g');
    const layerLinks = el('g');
    const layerChrome = el('g');
    root.append(layerBands, layerTints, layerGrid, layerMarks, layerPieces, layerLinks, layerChrome);

    const caption = el('text', {
      x: Math.round(W / 2),
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    root.appendChild(caption);

    // ── 기다림. destroy 가 걸린 타이머를 모두 거두고 기다리던 약속을 풀어 준다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const releases = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const release = (): void => {
          releases.delete(release);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          release();
        }, ms);
        timers.add(id);
        releases.add(release);
      });
    }

    function nextFrame(): Promise<void> {
      if (typeof requestAnimationFrame === 'function') {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
      return wait(16);
    }

    // ── 판. init 에서 정해진다.
    let size = 0;
    let cellW = 0;
    let cellH = 0;
    let originX = 0;
    let tokenR = 0;
    let cells: CellParts[] = [];
    let bands: SVGRectElement[] = [];
    const pieces = new Map<number, Piece>();
    const links: SVGLineElement[] = [];
    let caret: SVGPathElement | null = null;

    const cellX = (index: number): number => originX + (index % size) * cellW + cellW / 2;
    const cellY = (index: number): number =>
      BOARD_TOP + Math.floor(index / size) * cellH + cellH / 2;

    function place(node: SVGElement, index: number, scale: number): void {
      node.style.transform = `translate(${cellX(index)}px, ${cellY(index)}px) scale(${scale})`;
    }

    function makePiece(): Piece {
      const group = el('g');
      const disc = el('circle', { cx: 0, cy: 0, r: tokenR });
      const hole = el('circle', { cx: 0, cy: 0, r: Math.round(tokenR * 0.38), fill: c.bg });
      disc.style.fill = c.itemActive;
      disc.style.transition = `fill ${MARK_MS * 2}ms linear`;
      group.append(disc, hole);
      return { group, disc };
    }

    function buildBoard(spec: TryAndUndoStageInit): void {
      size = Math.max(1, Math.floor(spec.size));
      cellW = Math.min(CELL_W_MAX, Math.floor((W - SIDE_MIN * 2 - GUTTER_W) / size));
      cellH = Math.floor(BOARD_H / size);
      const boardW = cellW * size;
      originX = Math.round((W - GUTTER_W - boardW) / 2) + GUTTER_W;
      tokenR = Math.round(Math.min(cellW, cellH) * 0.27);

      for (const layer of [layerBands, layerTints, layerGrid, layerMarks, layerPieces, layerLinks, layerChrome]) {
        layer.textContent = '';
      }
      pieces.clear();
      links.length = 0;
      cells = [];
      bands = [];

      const gutterX = originX - GUTTER_W;
      const arm = Math.round(tokenR * 0.55);

      for (let row = 0; row < size; row += 1) {
        const band = el('rect', {
          x: gutterX,
          y: BOARD_TOP + row * cellH,
          width: boardW + GUTTER_W,
          height: cellH,
          rx: 8,
        });
        band.style.fill = c.bgSubtle;
        band.style.fillOpacity = '0';
        band.style.transition = `fill 160ms linear, fill-opacity 160ms linear`;
        layerBands.appendChild(band);
        bands.push(band);

        const rowLabel = el('text', {
          x: gutterX + 13,
          y: BOARD_TOP + row * cellH + cellH / 2 + 4,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        rowLabel.textContent = String(row);
        layerChrome.appendChild(rowLabel);
      }

      for (let col = 0; col < size; col += 1) {
        const colLabel = el('text', {
          x: originX + col * cellW + cellW / 2,
          y: BOARD_TOP - 10,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        colLabel.textContent = String(col);
        layerChrome.appendChild(colLabel);
      }

      for (let index = 0; index < size * size; index += 1) {
        const x = originX + (index % size) * cellW;
        const y = BOARD_TOP + Math.floor(index / size) * cellH;

        const tint = el('rect', {
          x: x + 3,
          y: y + 3,
          width: cellW - 6,
          height: cellH - 6,
          rx: 7,
          fill: c.danger,
          'fill-opacity': 0.07,
        });
        tint.style.opacity = '0';
        tint.style.transition = `opacity ${MARK_MS}ms ease-out`;
        layerTints.appendChild(tint);

        const frame = el('rect', {
          x: x + 3,
          y: y + 3,
          width: cellW - 6,
          height: cellH - 6,
          rx: 7,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1,
        });
        layerGrid.appendChild(frame);

        const cross = el('g');
        for (const [x1, y1, x2, y2] of [
          [-arm, -arm, arm, arm],
          [-arm, arm, arm, -arm],
        ]) {
          cross.appendChild(
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
        cross.style.opacity = '0';
        cross.style.transition = `transform ${MARK_MS}ms ease-out, opacity ${MARK_MS}ms ease-out`;
        place(cross, index, 0.5);
        layerMarks.appendChild(cross);

        const ghost = el('g');
        ghost.appendChild(
          el('circle', {
            cx: 0,
            cy: 0,
            r: tokenR,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1.6,
            'stroke-dasharray': '3 4',
          }),
        );
        ghost.style.opacity = '0';
        ghost.style.transition = `transform ${MARK_MS}ms ease-out, opacity ${MARK_MS}ms ease-out`;
        place(ghost, index, 1.15);
        layerMarks.appendChild(ghost);

        cells.push({ tint, cross, ghost });
      }

      caret = el('path', {
        d: `M 0 -8 L 10 0 L 0 8 Z`,
        fill: c.auxCursor,
      });
      caret.style.transition = `transform ${CARET_MS}ms cubic-bezier(0.3, 0.7, 0.3, 1), opacity ${CARET_MS}ms linear`;
      caret.style.opacity = '0';
      layerChrome.appendChild(caret);
      moveCaret(0, true);
      setBand(0, false);
    }

    function moveCaret(row: number, instant = false): void {
      if (!caret) return;
      if (instant) caret.style.transition = 'none';
      if (row < 0 || row >= size) {
        caret.style.opacity = '0';
      } else {
        caret.style.opacity = '1';
        caret.style.transform = `translate(${originX - 13}px, ${
          BOARD_TOP + row * cellH + cellH / 2
        }px)`;
      }
      if (instant) {
        // 다음 걸음부터는 다시 미끄러지게 둔다.
        void nextFrame().then(() => {
          if (caret) {
            caret.style.transition = `transform ${CARET_MS}ms cubic-bezier(0.3, 0.7, 0.3, 1), opacity ${CARET_MS}ms linear`;
          }
        });
      }
    }

    /** 지금 살아 있는 행 띠. null 이면 모두 끈다. */
    function setBand(row: number | null, blocked: boolean): void {
      bands.forEach((band, index) => {
        const on = index === row;
        band.style.fill = blocked ? c.danger : c.bgSubtle;
        band.style.fillOpacity = on ? (blocked ? '0.09' : '1') : '0';
      });
    }

    /**
     * 표시를 통째로 다시 맞춘다.
     *
     * 지운 것 · 남긴 것을 따로 세지 않고 매번 집합 전체를 받아 맞추므로, 물릴 때
     * 표시가 반쯤 남을 길이 없다.
     */
    function applyMarks(forbidden: readonly number[], abandoned: readonly number[]): void {
      const forbiddenSet = new Set(forbidden);
      const abandonedSet = new Set(abandoned);
      cells.forEach((cell, index) => {
        const isForbidden = forbiddenSet.has(index);
        cell.tint.style.opacity = isForbidden ? '1' : '0';
        cell.cross.style.opacity = isForbidden ? '1' : '0';
        place(cell.cross, index, isForbidden ? 1 : 0.5);

        const isAbandoned = abandonedSet.has(index);
        cell.ghost.style.opacity = isAbandoned ? '1' : '0';
        place(cell.ghost, index, isAbandoned ? 1 : 1.15);
      });
    }

    function fadeLinks(): void {
      for (const line of links) line.style.opacity = '0';
    }

    function purgeLinks(): void {
      for (const line of links) line.remove();
      links.length = 0;
    }

    function clearBoard(): void {
      purgeLinks();
      for (const piece of pieces.values()) piece.group.remove();
      pieces.clear();
      for (const cell of cells) {
        // settle 이 얹은 강조를 걷어 attribute 기본값(못 쓰는 칸의 옅은 바탕)으로 되돌린다.
        cell.tint.style.fill = '';
        cell.tint.style.fillOpacity = '';
      }
      applyMarks([], []);
      setBand(0, false);
      moveCaret(0, true);
    }

    const instance: ViewInstance = {
      init(spec: TryAndUndoStageInit): void {
        buildBoard(spec);
      },

      reset(): void {
        if (cells.length > 0) clearBoard();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 놓는다 — 위 칸에서 떨어져 내려앉고, 못 쓰게 된 칸들이 피어난다. */
      async dropIn(spec: TryAndUndoPlaceSpec): Promise<void> {
        const index = spec.row * size + spec.col;
        setBand(spec.row, false);

        const piece = makePiece();
        piece.group.style.opacity = '0';
        piece.group.style.transition = 'none';
        piece.group.style.transform = `translate(${cellX(index)}px, ${
          cellY(index) - cellH
        }px) scale(0.88)`;
        layerPieces.appendChild(piece.group);
        pieces.set(index, piece);

        await nextFrame();
        piece.group.style.transition = `transform ${DROP_MS}ms cubic-bezier(0.34, 0.9, 0.4, 1), opacity ${Math.round(
          DROP_MS * 0.5,
        )}ms linear`;
        piece.group.style.opacity = '1';
        place(piece.group, index, 1);
        // 지시자는 다음 행으로 내려간다. 마지막 행이면 물러난다.
        moveCaret(spec.row + 1);
        await wait(DROP_MS);

        piece.disc.style.fill = c.primary;
        setBand(spec.row + 1 < size ? spec.row + 1 : null, false);
        applyMarks(spec.forbidden, spec.abandoned);
        await wait(MARK_MS);
      },

      /** 막혔다 — 놓인 말들이 이 행으로 손을 뻗어 남은 칸을 가져간다. */
      async showDeadEnd(spec: TryAndUndoBlockSpec): Promise<void> {
        setBand(spec.row, true);

        // 이미 가 봤다가 물려 나온 자리도 한 번 튄다 — 그것도 못 쓰는 까닭이다.
        for (let col = 0; col < size; col += 1) {
          const index = spec.row * size + col;
          const ghost = cells[index]?.ghost;
          if (!ghost || ghost.style.opacity !== '1') continue;
          place(ghost, index, 1.22);
        }
        await wait(90);
        for (let col = 0; col < size; col += 1) {
          const index = spec.row * size + col;
          const ghost = cells[index]?.ghost;
          if (!ghost || ghost.style.opacity !== '1') continue;
          place(ghost, index, 1);
        }

        const pairs = Math.min(spec.linkFrom.length, spec.linkTo.length);
        for (let i = 0; i < pairs; i += 1) {
          const from = spec.linkFrom[i];
          const to = spec.linkTo[i];
          const x1 = cellX(from);
          const y1 = cellY(from);
          const x2 = cellX(to);
          const y2 = cellY(to);
          const length = Math.round(Math.hypot(x2 - x1, y2 - y1)) + 2;
          const line = el('line', {
            x1,
            y1,
            x2,
            y2,
            stroke: c.danger,
            'stroke-width': 1.6,
            'stroke-opacity': 0.45,
            'stroke-linecap': 'round',
          });
          line.style.strokeDasharray = `${length}`;
          line.style.strokeDashoffset = `${length}`;
          line.style.transition = `stroke-dashoffset ${LINK_MS}ms ease-out, opacity ${MARK_MS}ms linear`;
          layerLinks.appendChild(line);
          links.push(line);
        }
        await nextFrame();
        for (const line of links) line.style.strokeDashoffset = '0';
        await wait(LINK_MS);
      },

      /** 걷어낸다 — 방금 놓은 말이 칸의 천장을 뚫고 되올라가 사라진다. */
      async takeBack(spec: TryAndUndoUndoSpec): Promise<void> {
        const index = spec.row * size + spec.col;
        fadeLinks();
        setBand(spec.row, false);

        const piece = pieces.get(index);
        if (piece) {
          piece.disc.style.fill = c.itemActive;
          piece.group.style.transition = `transform ${GRIP_MS}ms ease-out`;
          place(piece.group, index, 1.12);
          await wait(GRIP_MS);
          piece.group.style.transition = `transform ${LIFT_MS}ms cubic-bezier(0.4, 0, 0.7, 0.6), opacity ${LIFT_MS}ms ease-in`;
          piece.group.style.opacity = '0';
          piece.group.style.transform = `translate(${cellX(index)}px, ${
            cellY(index) - cellH * 0.92
          }px) scale(0.72)`;
        }

        // 말이 올라가는 동안 그 말이 묶어 두었던 칸들이 함께 풀린다. 이 자리의
        // 자국은 아직이다 — 말이 다 빠져나간 뒤에 남아야 한다.
        applyMarks(
          spec.forbidden,
          spec.abandoned.filter((cell) => cell !== index),
        );
        moveCaret(spec.row);
        await wait(LIFT_MS);

        piece?.group.remove();
        pieces.delete(index);
        purgeLinks();

        applyMarks(spec.forbidden, spec.abandoned);
        await wait(GHOST_MS);
      },

      /** 넷이 다 섰다 — 위에서 아래로 한 번씩 짚어 준다. */
      async settle(): Promise<void> {
        setBand(null, false);
        moveCaret(-1);
        const ordered = [...pieces.entries()].sort((a, b) => a[0] - b[0]);
        for (const [index, piece] of ordered) {
          piece.group.style.transition = `transform ${SETTLE_STEP_MS}ms ease-out`;
          place(piece.group, index, 1.16);
          const cell = cells[index];
          if (cell) {
            cell.tint.style.fill = c.accent;
            cell.tint.style.fillOpacity = '0.24';
            cell.tint.style.opacity = '1';
          }
          await wait(SETTLE_STEP_MS);
          place(piece.group, index, 1);
        }
        await wait(SETTLE_STEP_MS * 2);
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const release of [...releases]) release();
        releases.clear();
        // 걸어 둔 것은 위 타이머뿐이다. rAF 는 스스로 다음 회차를 예약하지 않는
        // 한 번짜리라 루프로 남지 않는다 (S-view).
        root.remove();
      },
    };

    return instance;
  },
};
