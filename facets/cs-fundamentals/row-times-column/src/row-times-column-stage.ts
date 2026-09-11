/**
 * row-times-column stage — 행은 눕고 열은 서서, 둘이 만나는 자리가 결과의 칸이다.
 *
 * ── 배치가 곧 주장이다
 *
 * A 를 왼쪽에, B 를 위에 두면 A 의 행 i 를 오른쪽으로 늘인 띠와 B 의 열 j 를
 * 아래로 늘인 띠가 **꼭 한 곳에서 겹친다.** 그 겹치는 자리에 C[i][j] 를 놓는다.
 * 그래서 "한 칸은 어디서 오는가" 는 움직이기 전에 이미 자리로 답해져 있고,
 * 움직임은 그것을 셈으로 확인하는 일이 된다.
 *
 * 짝은 하나씩 온다. A 쪽 수는 행 위를 **가로로만**, B 쪽 수는 열 위를
 * **세로로만** 달려 칸에서 맞닿는다 (원본 타일은 자리에 남고 복제된 조각이
 * 움직인다). 맞닿은 둘은 하나로 합쳐져 곱이 되고, 그 곱이 칸 아래의 합으로
 * 내려앉는다. 마지막 짝에서 칸이 굳는다.
 *
 * 잰 값을 옆의 계기로 날려 보내지 않는다 — 누적 합은 그 합이 사는 칸 안에 있다
 * (S-piece PREFER).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 칸 크기는 거기서 역산하고 상수로는
 * 상한만 둔다. 세로는 그림이 정하는 값이라 이 파일에 있다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;

// ── 가로. 크기는 캔버스에서 역산하고 상수는 상한·비율만 잡는다 (S-piece).
const SIDE_MIN = 20;
/** A 와 C 사이 — 행이 건너가는 거리. */
const GAP_MID = 28;
const GAP_IN = 8;
const A_TILE_MAX = 96;
/** C 칸이 A 칸보다 넓다 — 만남과 합이 한 칸에 함께 앉아야 한다. */
const C_WIDER = 1.55;

// ── 세로.
const TOP = 12;
const LABEL_H = 18;
const A_TILE_H = 46;
const B_TILE_H = 42;
const B_GAP = 6;
/** B 아래의 숨. A·C 의 이름줄이 여기 앉는다. */
const GAP_BC = 26;
const CELL_H = 88;
const CELL_GAP = 10;
const CAP_GAP = 24;
const CHIP_H = 26;

// ── 걸음의 결. 여기에 선언의 `stepMs` 가 더해져 걸음 벽시계가 된다 (S-piece).
const TRAVEL_MS = 300;
const FUSE_MS = 140;
const DROP_MS = 140;
const SEAL_MS = 180;
const CLEAR_MS = 200;
const FRAME_MS = 16;

type Metrics = {
  height: number;
  bTop: number;
  gridTop: number;
  gridBottom: number;
  capY: number;
};

function vMetrics(rows: number, inner: number): Metrics {
  const bTop = TOP + LABEL_H;
  const bBottom = bTop + inner * B_TILE_H + (inner - 1) * B_GAP;
  const gridTop = bBottom + GAP_BC;
  const gridBottom = gridTop + rows * CELL_H + (rows - 1) * CELL_GAP;
  const capY = gridBottom + CAP_GAP;
  return { height: capY + 16, bTop, gridTop, gridBottom, capY };
}

/**
 * 이 조각이 받는 모양(A 2×3 · B 3×2)에서 나온 세로.
 * 다른 모양이 오면 mount 가 한 번 다시 잰다 — 그 뒤로는 바꾸지 않는다 (S-view).
 */
const CANVAS_H = vMetrics(2, 3).height;

type HLayout = {
  aw: number;
  cw: number;
  bw: number;
  chipW: number;
  aX: number;
  cX: number;
  right: number;
};

function hLayout(aCols: number, cCols: number): HLayout {
  const avail = W - SIDE_MIN * 2 - GAP_MID - GAP_IN * (aCols - 1) - GAP_IN * (cCols - 1);
  const aw = Math.max(28, Math.min(A_TILE_MAX, Math.floor(avail / (aCols + cCols * C_WIDER))));
  const cw = Math.floor(aw * C_WIDER);
  const aWidth = aCols * aw + GAP_IN * (aCols - 1);
  const cWidth = cCols * cw + GAP_IN * (cCols - 1);
  const aX = Math.round((W - aWidth - GAP_MID - cWidth) / 2);
  const cX = aX + aWidth + GAP_MID;
  return {
    aw,
    cw,
    bw: Math.min(cw - 20, 108),
    chipW: Math.min(42, Math.max(24, Math.floor((cw - 14) / 2))),
    aX,
    cX,
    right: cX + cWidth,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, value] of Object.entries(attrs)) node.setAttribute(k, String(value));
  return node;
}

/** 순수 변환 — 입력 hex 는 토큰에서 온다 (S-view Exception). */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

type Scene = { a: number[][]; b: number[][] };

function matrix(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const out: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    const cells: number[] = [];
    for (const cell of row) {
      if (typeof cell !== 'number' || !Number.isFinite(cell)) return null;
      cells.push(cell);
    }
    out.push(cells);
  }
  return out;
}

/**
 * 선언을 좁히는 자리는 여기다 — `params.initialData` 를 받는 유일한 경로이고,
 * projector 가 없어도 반드시 불린다 (S-piece).
 */
function readScene(data: unknown): Scene | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const a = matrix(d.a);
  const b = matrix(d.b);
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  const inner = a[0]?.length ?? 0;
  const cols = b[0]?.length ?? 0;
  if (inner === 0 || cols === 0) return null;
  // 맞물리지 않는 두 행렬은 이 조각이 할 말이 없다.
  if (inner !== b.length) return null;
  if (a.some((row) => row.length !== inner)) return null;
  if (b.some((row) => row.length !== cols)) return null;
  return { a, b };
}

type Tile = { rect: SVGRectElement; text: SVGTextElement };
type Cell = { rect: SVGRectElement; tag: SVGTextElement; sum: SVGTextElement };
type Chip = { group: SVGGElement; rect: SVGRectElement; text: SVGTextElement };

type Step = {
  row: number;
  col: number;
  k: number;
  a: number;
  b: number;
  product: number;
  sum: number;
};

export const rowTimesColumnStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    if (!scene) {
      // 러너 밖에서 데이터 없이 띄운 경우. 그릴 것이 없으니 캔버스를 그대로 둔다.
      return { destroy(): void {} };
    }

    const { a, b } = scene;
    const rows = a.length;
    const inner = b.length;
    const cols = b[0]?.length ?? 0;
    const v = vMetrics(rows, inner);
    const h = hLayout(inner, cols);
    if (v.height !== CANVAS_H) canvas.setAttribute('viewBox', `0 0 ${W} ${v.height}`);

    const bandTint = hexToRgba(colors.accent, 0.16);

    const aTileX = (k: number): number => h.aX + k * (h.aw + GAP_IN);
    const cellX = (col: number): number => h.cX + col * (h.cw + GAP_IN);
    const cellY = (row: number): number => v.gridTop + row * (CELL_H + CELL_GAP);
    /** 행의 중심선 — A 의 타일과 C 의 칸이 이 선을 함께 쓴다. */
    const rowCy = (row: number): number => cellY(row) + CELL_H / 2;
    /** 열의 중심선 — B 의 타일과 C 의 칸이 이 선을 함께 쓴다. */
    const colCx = (col: number): number => cellX(col) + h.cw / 2;
    const bTileY = (k: number): number => v.bTop + k * (B_TILE_H + B_GAP);
    const bCy = (k: number): number => bTileY(k) + B_TILE_H / 2;
    const sumY = (row: number): number => cellY(row) + CELL_H - 18;

    // ── 층. 띠가 맨 아래, 칸을 채우는 막이 칸과 글자 사이, 달리는 조각이 맨 위.
    const gBands = el('g', {});
    const gCells = el('g', {});
    const gSeal = el('g', {});
    const gCellText = el('g', {});
    const gTiles = el('g', {});
    const gChips = el('g', {});
    const gCaption = el('g', {});
    for (const layer of [gBands, gCells, gSeal, gCellText, gTiles, gChips, gCaption]) {
      canvas.appendChild(layer);
    }

    // ── 행 띠와 열 띠. 둘이 겹치는 곳이 곧 지금 만들고 있는 칸이다.
    const bandRow = el('rect', {
      x: h.aX - 8,
      y: cellY(0),
      width: h.right + 8 - (h.aX - 8),
      height: CELL_H,
      rx: 8,
      fill: bandTint,
      opacity: 0,
    });
    const bandCol = el('rect', {
      x: cellX(0),
      y: v.bTop - 8,
      width: h.cw,
      height: v.gridBottom + 8 - (v.bTop - 8),
      rx: 8,
      fill: bandTint,
      opacity: 0,
    });
    gBands.appendChild(bandRow);
    gBands.appendChild(bandCol);

    // ── 이름. 도형에 새겨진 글자이자 수식 표기라 문안이 아니다 (C10).
    const nameAt = (letter: string, shape: string, x: number, y: number): void => {
      const name = el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.text,
      });
      name.textContent = letter;
      const size = el('text', {
        x: x + 14,
        y,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      size.textContent = shape;
      gCaption.appendChild(name);
      gCaption.appendChild(size);
    };
    nameAt('B', `${inner}×${cols}`, colCx(0) - h.bw / 2, TOP + 12);
    nameAt('A', `${rows}×${inner}`, h.aX, v.gridTop - 9);
    nameAt('C', `${rows}×${cols}`, h.cX, v.gridTop - 9);

    const numberText = (x: number, y: number, value: number): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      node.textContent = String(value);
      return node;
    };

    // ── A. 행이 눕는다.
    const aTiles: Tile[][] = [];
    for (let row = 0; row < rows; row += 1) {
      const line: Tile[] = [];
      for (let k = 0; k < inner; k += 1) {
        const rect = el('rect', {
          x: aTileX(k),
          y: rowCy(row) - A_TILE_H / 2,
          width: h.aw,
          height: A_TILE_H,
          rx: 6,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const text = numberText(aTileX(k) + h.aw / 2, rowCy(row), a[row]?.[k] ?? 0);
        gTiles.appendChild(rect);
        gTiles.appendChild(text);
        line.push({ rect, text });
      }
      aTiles.push(line);
    }

    // ── B. 열이 선다.
    const bTiles: Tile[][] = [];
    for (let k = 0; k < inner; k += 1) {
      const line: Tile[] = [];
      for (let col = 0; col < cols; col += 1) {
        const rect = el('rect', {
          x: colCx(col) - h.bw / 2,
          y: bTileY(k),
          width: h.bw,
          height: B_TILE_H,
          rx: 6,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const text = numberText(colCx(col), bCy(k), b[k]?.[col] ?? 0);
        gTiles.appendChild(rect);
        gTiles.appendChild(text);
        line.push({ rect, text });
      }
      bTiles.push(line);
    }

    // ── C. 행 띠와 열 띠가 겹치는 자리.
    const cells: Cell[][] = [];
    for (let row = 0; row < rows; row += 1) {
      const line: Cell[] = [];
      for (let col = 0; col < cols; col += 1) {
        const rect = el('rect', {
          x: cellX(col),
          y: cellY(row),
          width: h.cw,
          height: CELL_H,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        });
        const tag = el('text', {
          x: cellX(col) + 10,
          y: cellY(row) + 17,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        // 수식 표기는 표식이다 — 키를 만들지 않는다 (C10).
        tag.textContent = `C[${row}][${col}]`;
        const sum = el('text', {
          x: colCx(col),
          y: sumY(row),
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: colors.text,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        sum.textContent = '';
        gCells.appendChild(rect);
        gCellText.appendChild(tag);
        gCellText.appendChild(sum);
        line.push({ rect, tag, sum });
      }
      cells.push(line);
    }

    // 칸이 굳을 때 가운데에서 위아래로 번지는 막.
    const seal = el('rect', {
      x: cellX(0),
      y: cellY(0),
      width: h.cw,
      height: 0,
      rx: 8,
      fill: colors.itemSorted,
      opacity: 0,
    });
    gSeal.appendChild(seal);

    const makeChip = (): Chip => {
      const group = el('g', { opacity: 0, transform: 'translate(0,0)' });
      const rect = el('rect', {
        x: -h.chipW / 2,
        y: -CHIP_H / 2,
        width: h.chipW,
        height: CHIP_H,
        rx: 5,
        fill: colors.itemComparing,
        stroke: colors.itemComparing,
        'stroke-width': 1,
      });
      const text = el('text', {
        x: 0,
        y: 0,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.stateInk,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      group.appendChild(rect);
      group.appendChild(text);
      gChips.appendChild(group);
      return { group, rect, text };
    };
    const chipFromRow = makeChip();
    const chipFromCol = makeChip();

    const caption = el('text', {
      x: W / 2,
      y: v.capY,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    caption.textContent = '';
    gCaption.appendChild(caption);

    // ── 기다림. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    async function tween(ms: number, apply: (t: number) => void): Promise<void> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let i = 1; i <= frames; i += 1) {
        await wait(FRAME_MS);
        if (destroyed) {
          apply(1);
          return;
        }
        apply(ease(i / frames));
      }
    }

    // ── 그림 조작
    function paintTile(tile: Tile, active: boolean): void {
      tile.rect.setAttribute('fill', active ? colors.itemComparing : colors.itemDefault);
      tile.rect.setAttribute('stroke', active ? colors.itemComparing : colors.border);
      tile.text.setAttribute('fill', active ? colors.stateInk : colors.text);
    }

    let lit: Tile[] = [];
    function lightPair(row: number, col: number, k: number): void {
      for (const tile of lit) paintTile(tile, false);
      lit = [];
      const left = aTiles[row]?.[k];
      const up = bTiles[k]?.[col];
      if (left) lit.push(left);
      if (up) lit.push(up);
      for (const tile of lit) paintTile(tile, true);
    }

    function placeBands(row: number, col: number): void {
      bandRow.setAttribute('y', String(cellY(row)));
      bandRow.setAttribute('opacity', '1');
      bandCol.setAttribute('x', String(cellX(col)));
      bandCol.setAttribute('opacity', '1');
    }

    function moveChip(chip: Chip, x: number, y: number): void {
      chip.group.setAttribute('transform', `translate(${x},${y})`);
    }

    function showChip(chip: Chip, value: number, x: number, y: number): void {
      chip.text.textContent = String(value);
      chip.rect.setAttribute('fill', colors.itemComparing);
      chip.rect.setAttribute('stroke', colors.itemComparing);
      moveChip(chip, x, y);
      chip.group.setAttribute('opacity', '1');
    }

    function hideChip(chip: Chip): void {
      chip.group.setAttribute('opacity', '0');
    }

    function dressCell(cell: Cell, sealed: boolean): void {
      cell.rect.setAttribute('fill', sealed ? colors.itemSorted : colors.bgSubtle);
      cell.rect.setAttribute('stroke', sealed ? colors.itemSorted : colors.border);
      cell.rect.setAttribute('stroke-dasharray', sealed ? 'none' : '4 4');
      cell.tag.setAttribute('fill', sealed ? colors.textInverse : colors.textMuted);
      cell.sum.setAttribute('fill', sealed ? colors.textInverse : colors.text);
    }

    async function sealCell(row: number, col: number): Promise<void> {
      const cell = cells[row]?.[col];
      if (!cell) return;
      const cy = rowCy(row);
      seal.setAttribute('x', String(cellX(col)));
      seal.setAttribute('opacity', '1');
      await tween(SEAL_MS, (t) => {
        const height = CELL_H * t;
        seal.setAttribute('y', String(cy - height / 2));
        seal.setAttribute('height', String(height));
      });
      dressCell(cell, true);
      seal.setAttribute('opacity', '0');
      seal.setAttribute('height', '0');
    }

    return {
      /** 한 짝이 칸에서 맞물린다. */
      async mesh(step: Step & { closes: boolean; caption: string }): Promise<void> {
        if (destroyed) return;
        const cell = cells[step.row]?.[step.col];
        if (!cell) return;

        caption.textContent = step.caption;
        placeBands(step.row, step.col);
        lightPair(step.row, step.col, step.k);

        const crossX = colCx(step.col);
        const crossY = rowCy(step.row);
        const fromX = aTileX(step.k) + h.aw / 2;
        const fromY = bCy(step.k);
        const restX = crossX - h.chipW - 3;

        showChip(chipFromRow, step.a, fromX, crossY);
        showChip(chipFromCol, step.b, crossX, fromY);

        // 행 위를 가로로, 열 위를 세로로. 둘은 칸에서 맞닿는다.
        await tween(TRAVEL_MS, (t) => {
          moveChip(chipFromRow, lerp(fromX, restX, t), crossY);
          moveChip(chipFromCol, crossX, lerp(fromY, crossY, t));
        });
        if (destroyed) return;

        // 맞닿은 둘이 하나로 — 곱이 된다.
        await tween(FUSE_MS, (t) => {
          moveChip(chipFromRow, lerp(restX, crossX, t), crossY);
        });
        if (destroyed) return;
        hideChip(chipFromRow);
        chipFromCol.text.textContent = String(step.product);
        chipFromCol.rect.setAttribute('fill', colors.accent);
        chipFromCol.rect.setAttribute('stroke', colors.accent);

        // 곱은 제 칸의 합으로 내려앉는다.
        await tween(DROP_MS, (t) => {
          moveChip(chipFromCol, crossX, lerp(crossY, sumY(step.row), t));
        });
        hideChip(chipFromCol);
        cell.sum.textContent = String(step.sum);
        if (destroyed) return;

        if (step.closes) await sealCell(step.row, step.col);
      },

      /** 다 찼다. 띠를 거두고 남은 것은 결과뿐이다. */
      async close(text: string): Promise<void> {
        if (destroyed) return;
        caption.textContent = text;
        for (const tile of lit) paintTile(tile, false);
        lit = [];
        hideChip(chipFromRow);
        hideChip(chipFromCol);
        await tween(CLEAR_MS, (t) => {
          const left = String(1 - t);
          bandRow.setAttribute('opacity', left);
          bandCol.setAttribute('opacity', left);
        });
      },

      /** 처음으로. 한 걸음씩 보기의 첫 누름과 다시 보기가 부른다. */
      rewind(): void {
        caption.textContent = '';
        bandRow.setAttribute('opacity', '0');
        bandCol.setAttribute('opacity', '0');
        hideChip(chipFromRow);
        hideChip(chipFromCol);
        seal.setAttribute('opacity', '0');
        seal.setAttribute('height', '0');
        for (const tile of lit) paintTile(tile, false);
        lit = [];
        for (const line of cells) {
          for (const cell of line) {
            cell.sum.textContent = '';
            dressCell(cell, false);
          }
        }
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const layer of [gBands, gCells, gSeal, gCellText, gTiles, gChips, gCaption]) {
          layer.remove();
        }
      },
    };
  },
};
