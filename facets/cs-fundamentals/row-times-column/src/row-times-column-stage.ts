/**
 * row-times-column stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다
 * (S-scene).
 *
 * ── 배치가 곧 주장이다
 *
 * A 를 왼쪽에, B 를 위에 두면 A 의 행 i 를 오른쪽으로 늘인 띠와 B 의 열 j 를
 * 아래로 늘인 띠가 **꼭 한 곳에서 겹친다.** 그 겹치는 자리에 C[i][j] 를 놓는다.
 * 그래서 "한 칸은 어디서 오는가" 는 움직이기 전에 이미 자리로 답해져 있고,
 * 움직임은 그것을 셈으로 확인하는 일이 된다.
 *
 * 짝은 하나씩 온다. A 쪽 수는 행 위를 **가로로만**, B 쪽 수는 열 위를
 * **세로로만** 달려 칸에서 맞닿는다 (원본 타일은 자리에 남고 복제된 알갱이가
 * 움직인다). 맞닿은 둘은 하나로 합쳐져 곱이 되고, 그 곱이 칸 안의 **항 줄**로
 * 내려앉는다. 마지막 짝에서 칸이 굳는다.
 *
 * ── 이행이 고친 것 — 합이 어떻게 쌓였는지가 남는다
 *
 * 옛 화면은 칸 안의 한 글자에 누적 합만 덮어썼다. 그래서 다 끝난 화면에는 `58` 만
 * 있고 그것이 `7 + 18 + 33` 이었다는 자국이 없었다 — **이 조각이 하려는 말이 바로 그
 * 덧셈인데** 걸음마다 지우고 있었다. 이제 장면이 쌓인 곱을 들고 있고 정적 그리기가
 * 항 줄과 합을 함께 세운다. 완주한 화면에서 네 칸 모두 제 항 셋을 달고 있다
 * (프로토콜 4 절 "조각의 주장이 마지막 화면에 안 남아 있는 수가 있다").
 *
 * ── 칠은 두 축으로 갈라 둔다
 *
 * 한 축에 두 뜻을 실으면 결론이 형편을 덮는다.
 *
 * - **채움 = 값의 형편** — 비었다(`bgSubtle`) / 쌓이는 중(accent 옅은 tint) /
 *   굳었다(`itemSorted`).
 * - **테두리 = 짚음의 표식** — 지금 맞물림이 일어나는 칸이면 `accent` 2px, 아니면
 *   `border` 1px.
 *
 * 굳는 걸음에서 칸은 굳은 채움과 짚음의 테두리를 **함께** 단다. 답을 강조하는 칠이
 * "여기서 맞물렸다" 를 덮지 않는다.
 *
 * 잰 값을 옆의 계기로 날려 보내지 않는다 — 항도 합도 그것이 사는 칸 안에 있다
 * (S-piece PREFER).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 칸 크기는 거기서 역산하고 상수로는
 * 상한만 둔다. 세로는 그림이 정하는 값이라 이 파일에 있다 (S-piece · S-view).
 * `init` 이 없으므로 캔버스 세로도 정적 그리기가 매번 정한다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  colsOf,
  innerOf,
  isSealed,
  sumOf,
  termsAt,
  type CellTerms,
  type RowTimesColumnScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;

// ── 가로. 크기는 캔버스에서 역산하고 상수는 상한·비율만 잡는다 (S-piece).
const SIDE_MIN = 20;
/** A 와 C 사이 — 행이 건너가는 거리. */
const GAP_MID = 28;
const GAP_IN = 8;
const A_TILE_MAX = 96;
/** C 칸이 A 칸보다 넓다 — 맞물림과 항 줄과 합이 한 칸에 함께 앉아야 한다. */
const C_WIDER = 1.55;

// ── 세로.
const TOP = 12;
const LABEL_H = 18;
const A_TILE_H = 46;
const B_TILE_H = 42;
const B_GAP = 6;
/** B 아래의 숨. A·C 의 이름줄이 여기 앉는다. */
const GAP_BC = 26;
const CELL_H = 108;
const CELL_GAP = 10;
const CAP_GAP = 24;
const CHIP_H = 26;

// ── 칸 안의 세로 자리. 칸 위 끝에서 잰다.
/** `C[i][j]` 표식. */
const TAG_DY = 16;
/** 행과 열이 맞닿는 선. A 타일이 이 선을 함께 쓴다. */
const MEET_DY = 44;
/** 쌓인 곱들이 늘어서는 줄. */
const TERMS_DY = 70;
/** 그 항들의 합. */
const SUM_DY = 92;

/** 항 줄의 mono 글자 하나가 차지하는 가로. 알갱이가 내려앉을 자리를 여기서 셈한다. */
const TERM_CHAR_W = 7.2;

// ── 걸음의 결. 여기에 선언의 `stepMs` 가 더해져 걸음 벽시계가 된다 (S-piece).
const TRAVEL_MS = 300;
const FUSE_MS = 140;
const DROP_MS = 140;
const SEAL_MS = 180;
/**
 * 다 찬 뒤 행 띠와 열 띠가 한꺼번에 스치는 시간.
 *
 * `done` 은 흐를 것이 없어 걸음 벽시계가 `stepMs` 그대로 620ms 였다 — 얇은 걸음의
 * 잣대(800ms) 아래다. `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로 이 걸음에만
 * 얇은 운동을 얹는다 (S-piece).
 */
const SWEEP_MS = 320;
const FRAME_MS = 16;

type VMetrics = {
  height: number;
  bTop: number;
  gridTop: number;
  gridBottom: number;
  capY: number;
};

function vMetrics(rows: number, inner: number): VMetrics {
  const bTop = TOP + LABEL_H;
  const bBottom = bTop + inner * B_TILE_H + (inner - 1) * B_GAP;
  const gridTop = bBottom + GAP_BC;
  const gridBottom = gridTop + rows * CELL_H + (rows - 1) * CELL_GAP;
  const capY = gridBottom + CAP_GAP;
  return { height: capY + 16, bTop, gridTop, gridBottom, capY };
}

/**
 * 이 조각이 받는 모양(A 2×3 · B 3×2)에서 나온 세로.
 * 다른 모양이 오면 정적 그리기가 매번 다시 잰다 (S-view).
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

/**
 * 자리 셈. 장면의 두 행렬 하나에서 캔버스를 역산한다.
 *
 * 그리면서 재지 않고 **먼저 한 번에 셈하고 그 다음에 그린다** — 그리며 이웃의 지금
 * 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다 (S-scene).
 */
type Geom = {
  rows: number;
  inner: number;
  cols: number;
  h: HLayout;
  v: VMetrics;
  aTileX(k: number): number;
  bTileY(k: number): number;
  bCy(k: number): number;
  cellX(col: number): number;
  cellY(row: number): number;
  colCx(col: number): number;
  meetY(row: number): number;
  termsY(row: number): number;
  sumY(row: number): number;
};

function geomOf(scene: RowTimesColumnScene): Geom {
  const rows = scene.a.length;
  const inner = innerOf(scene);
  const cols = colsOf(scene.b);
  const h = hLayout(Math.max(1, inner), Math.max(1, cols));
  const v = vMetrics(rows, inner);
  const cellX = (col: number): number => h.cX + col * (h.cw + GAP_IN);
  const cellY = (row: number): number => v.gridTop + row * (CELL_H + CELL_GAP);
  return {
    rows,
    inner,
    cols,
    h,
    v,
    aTileX: (k) => h.aX + k * (h.aw + GAP_IN),
    bTileY: (k) => v.bTop + k * (B_TILE_H + B_GAP),
    bCy: (k) => v.bTop + k * (B_TILE_H + B_GAP) + B_TILE_H / 2,
    cellX,
    cellY,
    colCx: (col) => cellX(col) + h.cw / 2,
    meetY: (row) => cellY(row) + MEET_DY,
    termsY: (row) => cellY(row) + TERMS_DY,
    sumY: (row) => cellY(row) + SUM_DY,
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

/** 항 줄의 글자. 제 글자를 도로 읽어 덧붙이지 않는다 — 늘 장면에서 만든다 (S-scene). */
function termsLine(terms: CellTerms): string {
  return terms.map((term) => String(term)).join(' + ');
}

/**
 * 항 `k` 의 글자가 줄 안에서 차지하는 가운데 자리 (줄 중심에서 잰 치우침).
 *
 * 화면을 되읽지 않으려고 글자 수로 센다 — `getBBox` 로 재면 되짚어 세운 직후에는
 * 그 값이 아직 옛 화면의 것이다 (S-scene).
 */
function termOffset(terms: CellTerms, k: number): number {
  const line = termsLine(terms);
  const head = termsLine(terms.slice(0, k));
  const start = k === 0 ? 0 : head.length + 3;
  const own = String(terms[k] ?? 0).length;
  return (start + own / 2 - line.length / 2) * TERM_CHAR_W;
}

/** 칸의 형편 — 채움 축. 굳음은 항이 다 찬 것이고, 쌓이는 중은 항이 있는 것이다. */
type CellFill = 'empty' | 'filling' | 'full';

/** 정적 그리기가 세워 둔 칸 하나. `render` 안에서만 산다. */
type DrawnCell = {
  rect: SVGRectElement;
  tag: SVGTextElement;
  terms: SVGTextElement;
  sum: SVGTextElement;
};

/** 정적 그리기가 세워 둔 것. 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  cells: DrawnCell[][];
};

/** 달리는 값 알갱이. 운동 안에서만 살고 정지 화면에는 없다. */
type Chip = { group: SVGGElement; rect: SVGRectElement; text: SVGTextElement };

export const rowTimesColumnStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RowTimesColumnScene> {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const bandTint = hexToRgba(colors.accent, 0.16);
    const fillingTint = hexToRgba(colors.accent, 0.14);

    // ── 켜. 띠가 맨 아래, 칸을 채우는 막이 칸과 글자 사이, 달리는 알갱이가 맨 위.
    const gBands = el('g', {});
    const gCells = el('g', {});
    const gSeal = el('g', {});
    const gCellText = el('g', {});
    const gTiles = el('g', {});
    const gChips = el('g', {});
    const gCaption = el('g', {});
    const layers = [gBands, gCells, gSeal, gCellText, gTiles, gChips, gCaption];
    for (const layer of layers) canvas.appendChild(layer);

    // ── 기다림. 걸어 둔 것은 집합에 담아 destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 이 조각의 운동은 마디 넷을 이어 달린다 (미끄러짐 → 맞닿음 → 내려앉음 → 굳음).
     * 가운데 되짚기나 끊김이 끼면 남은 마디가 깨어나 이미 새로 선 화면을 덮는다.
     * 마디마다 자기 번호가 아직 유효한지 보고 물러난다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

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

    /**
     * 취소 가능한 시간 진행.
     *
     * 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧 덮어쓰기다.
     */
    async function tween(ms: number, mine: number, apply: (e: number) => void): Promise<void> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let i = 1; i <= frames; i += 1) {
        await wait(FRAME_MS);
        if (!alive(mine)) return;
        apply(ease(i / frames));
      }
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────

    function rewind(): void {
      for (const layer of layers) layer.replaceChildren();
    }

    function numberText(x: number, y: number, value: number): SVGTextElement {
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
    }

    /** 이름. 도형에 새겨진 글자이자 수식 표기라 문안이 아니다 (C10). */
    function nameAt(letter: string, shape: string, x: number, y: number): void {
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
    }

    /** 타일의 칠 — 지금 맞대고 있는 짝인가. 지나가는 강조다. */
    function paintTile(rect: SVGRectElement, text: SVGTextElement, active: boolean): void {
      rect.setAttribute('fill', active ? colors.itemComparing : colors.itemDefault);
      rect.setAttribute('stroke', active ? colors.itemComparing : colors.border);
      text.setAttribute('fill', active ? colors.stateInk : colors.text);
    }

    /** 칸의 칠 — 채움은 값의 형편, 테두리는 짚음의 표식. 두 축이 부딪히지 않는다. */
    function dressCell(cell: DrawnCell, fill: CellFill, pointed: boolean): void {
      const full = fill === 'full';
      cell.rect.setAttribute(
        'fill',
        full ? colors.itemSorted : fill === 'filling' ? fillingTint : colors.bgSubtle,
      );
      cell.rect.setAttribute('stroke', pointed ? colors.accent : colors.border);
      cell.rect.setAttribute('stroke-width', pointed ? '2' : '1');
      cell.tag.setAttribute('fill', full ? colors.textInverse : colors.textMuted);
      cell.terms.setAttribute('fill', full ? colors.textInverse : colors.textMuted);
      cell.sum.setAttribute('fill', full ? colors.textInverse : colors.text);
    }

    /** 칸에 적히는 항과 합. 늘 장면의 항 목록에서 만든다. */
    function writeTerms(cell: DrawnCell, terms: CellTerms): void {
      cell.terms.textContent = termsLine(terms);
      cell.sum.textContent = terms.length === 0 ? '' : String(sumOf(terms));
    }

    function captionFor(scene: RowTimesColumnScene): string {
      if (scene.finished) {
        return t(
          'caption.done',
          'Every cell of C comes from one row of A and one column of B.',
        );
      }
      const meet = scene.meet;
      if (meet === null) return '';
      const terms = termsAt(scene, meet.row, meet.col);
      if (isSealed(scene, meet.row, meet.col)) {
        return t('caption.cellFormed', 'C[{row}][{col}] = {value} — {count} products, one cell.', {
          row: meet.row,
          col: meet.col,
          value: sumOf(terms),
          // 안쪽 치수를 문안에 못박지 않는다 — 쌓인 항의 수가 곧 맞물린 항의 수다.
          count: terms.length,
        });
      }
      return t(
        'caption.pairMeet',
        'Row {row} of A and column {col} of B mesh — running total {sum}.',
        { row: meet.row, col: meet.col, sum: sumOf(terms) },
      );
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 띠도 알갱이도 막도 **있을 때만 짓는다** — 숨기기만 하면 앞 걸음의 자리가
     * 그대로 남아 되짚기 판정이 어긋난다 (S-scene).
     */
    function drawStatic(scene: RowTimesColumnScene): Drawn {
      const g = geomOf(scene);
      canvas.setAttribute('viewBox', `0 0 ${W} ${g.v.height}`);
      rewind();

      const drawn: Drawn = { geom: g, cells: [] };
      if (g.rows === 0 || g.inner === 0 || g.cols === 0) return drawn;

      // ── 행 띠와 열 띠. 둘이 겹치는 곳이 곧 지금 만들고 있는 칸이다.
      const meet = scene.meet;
      if (meet !== null) {
        gBands.appendChild(
          el('rect', {
            x: g.h.aX - 8,
            y: g.cellY(meet.row),
            width: g.h.right + 8 - (g.h.aX - 8),
            height: CELL_H,
            rx: 8,
            fill: bandTint,
          }),
        );
        gBands.appendChild(
          el('rect', {
            x: g.cellX(meet.col),
            y: g.v.bTop - 8,
            width: g.h.cw,
            height: g.v.gridBottom + 8 - (g.v.bTop - 8),
            rx: 8,
            fill: bandTint,
          }),
        );
      }

      // 몇 번째 짝인가는 그 칸에 쌓인 항의 수가 말한다 — 걸음이 싣지 않는다.
      const meetK = meet === null ? -1 : termsAt(scene, meet.row, meet.col).length - 1;

      nameAt('B', `${g.inner}×${g.cols}`, g.colCx(0) - g.h.bw / 2, TOP + 12);
      nameAt('A', `${g.rows}×${g.inner}`, g.h.aX, g.v.gridTop - 9);
      nameAt('C', `${g.rows}×${g.cols}`, g.h.cX, g.v.gridTop - 9);

      // ── A. 행이 눕는다.
      for (let row = 0; row < g.rows; row += 1) {
        for (let k = 0; k < g.inner; k += 1) {
          const rect = el('rect', {
            x: g.aTileX(k),
            y: g.meetY(row) - A_TILE_H / 2,
            width: g.h.aw,
            height: A_TILE_H,
            rx: 6,
            'stroke-width': 1,
          });
          const text = numberText(g.aTileX(k) + g.h.aw / 2, g.meetY(row), scene.a[row]?.[k] ?? 0);
          paintTile(rect, text, meet !== null && meet.row === row && k === meetK);
          gTiles.appendChild(rect);
          gTiles.appendChild(text);
        }
      }

      // ── B. 열이 선다.
      for (let k = 0; k < g.inner; k += 1) {
        for (let col = 0; col < g.cols; col += 1) {
          const rect = el('rect', {
            x: g.colCx(col) - g.h.bw / 2,
            y: g.bTileY(k),
            width: g.h.bw,
            height: B_TILE_H,
            rx: 6,
            'stroke-width': 1,
          });
          const text = numberText(g.colCx(col), g.bCy(k), scene.b[k]?.[col] ?? 0);
          paintTile(rect, text, meet !== null && meet.col === col && k === meetK);
          gTiles.appendChild(rect);
          gTiles.appendChild(text);
        }
      }

      // ── C. 행 띠와 열 띠가 겹치는 자리.
      for (let row = 0; row < g.rows; row += 1) {
        const line: DrawnCell[] = [];
        for (let col = 0; col < g.cols; col += 1) {
          const rect = el('rect', {
            x: g.cellX(col),
            y: g.cellY(row),
            width: g.h.cw,
            height: CELL_H,
            rx: 8,
          });
          const tag = el('text', {
            x: g.cellX(col) + 10,
            y: g.cellY(row) + TAG_DY,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
          // 수식 표기는 표식이다 — 키를 만들지 않는다 (C10).
          tag.textContent = `C[${row}][${col}]`;
          const terms = el('text', {
            x: g.colCx(col),
            y: g.termsY(row),
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          });
          const sum = el('text', {
            x: g.colCx(col),
            y: g.sumY(row),
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
            'font-weight': 700,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
          });
          const cell: DrawnCell = { rect, tag, terms, sum };
          const held = termsAt(scene, row, col);
          writeTerms(cell, held);
          dressCell(
            cell,
            isSealed(scene, row, col) ? 'full' : held.length === 0 ? 'empty' : 'filling',
            meet !== null && meet.row === row && meet.col === col,
          );
          gCells.appendChild(rect);
          gCellText.appendChild(tag);
          gCellText.appendChild(terms);
          gCellText.appendChild(sum);
          line.push(cell);
        }
        drawn.cells.push(line);
      }

      const caption = el('text', {
        x: W / 2,
        y: g.v.capY,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.textMuted,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      return drawn;
    }

    // ── 운동 ───────────────────────────────────────────────────────────────

    function makeChip(width: number, value: number, fill: string): Chip {
      const group = el('g', { transform: 'translate(0,0)' });
      const rect = el('rect', {
        x: -width / 2,
        y: -CHIP_H / 2,
        width,
        height: CHIP_H,
        rx: 5,
        fill,
        stroke: fill,
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
      text.textContent = String(value);
      group.appendChild(rect);
      group.appendChild(text);
      gChips.appendChild(group);
      return { group, rect, text };
    }

    function moveChip(chip: Chip, x: number, y: number): void {
      chip.group.setAttribute('transform', `translate(${x},${y})`);
    }

    /**
     * 한 짝이 칸에서 맞물리고 곱이 항으로 내려앉는다.
     *
     * 출발 그림은 **`next` 에서 셈한다** — 아직 안 온 항 하나를 뒤로 물려 두었다가
     * 알갱이가 닿을 때 세운다. `prev` 는 들추지 않는다 (S-scene).
     */
    async function flowMeet(
      scene: RowTimesColumnScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const meet = scene.meet;
      if (meet === null) return;
      const cell = drawn.cells[meet.row]?.[meet.col];
      if (!cell) return;
      const g = drawn.geom;
      const terms = termsAt(scene, meet.row, meet.col);
      const k = terms.length - 1;
      const product = terms[k];
      if (product === undefined) return;
      const closes = isSealed(scene, meet.row, meet.col);

      // 아직 안 온 항을 뒤로 물린다. 굳음도 막이 번진 뒤에 온다.
      const before = terms.slice(0, k);
      writeTerms(cell, before);
      dressCell(cell, before.length === 0 ? 'empty' : 'filling', true);

      const crossX = g.colCx(meet.col);
      const crossY = g.meetY(meet.row);
      const fromX = g.aTileX(k) + g.h.aw / 2;
      const fromY = g.bCy(k);
      const restX = crossX - g.h.chipW - 3;

      const chipRow = makeChip(g.h.chipW, scene.a[meet.row]?.[k] ?? 0, colors.itemComparing);
      const chipCol = makeChip(g.h.chipW, scene.b[k]?.[meet.col] ?? 0, colors.itemComparing);
      moveChip(chipRow, fromX, crossY);
      moveChip(chipCol, crossX, fromY);

      // 행 위를 가로로, 열 위를 세로로. 한 뜻으로 묶인 운동이라 시계가 하나다.
      await tween(TRAVEL_MS, mine, (e) => {
        moveChip(chipRow, lerp(fromX, restX, e), crossY);
        moveChip(chipCol, crossX, lerp(fromY, crossY, e));
      });
      if (!alive(mine)) return;

      // 맞닿은 둘이 하나로 — 곱이 된다.
      await tween(FUSE_MS, mine, (e) => {
        moveChip(chipRow, lerp(restX, crossX, e), crossY);
      });
      if (!alive(mine)) return;
      chipRow.group.remove();
      chipCol.text.textContent = String(product);
      chipCol.rect.setAttribute('fill', colors.accent);
      chipCol.rect.setAttribute('stroke', colors.accent);

      // 곱은 제 칸의 항 줄로 내려앉는다.
      const landX = crossX + termOffset(terms, k);
      const landY = g.termsY(meet.row);
      await tween(DROP_MS, mine, (e) => {
        moveChip(chipCol, lerp(crossX, landX, e), lerp(crossY, landY, e));
      });
      if (!alive(mine)) return;
      chipCol.group.remove();
      writeTerms(cell, terms);

      if (!closes) return;

      // 칸이 굳는다 — 막이 가운데에서 위아래로 번진다.
      const seal = el('rect', {
        x: g.cellX(meet.col),
        y: crossY,
        width: g.h.cw,
        height: 0,
        rx: 8,
        fill: colors.itemSorted,
      });
      gSeal.appendChild(seal);
      await tween(SEAL_MS, mine, (e) => {
        const height = CELL_H * e;
        seal.setAttribute('y', String(crossY - height / 2));
        seal.setAttribute('height', String(height));
      });
      if (!alive(mine)) return;
      seal.remove();
      dressCell(cell, 'full', true);
    }

    /**
     * 다 찼다 — 행 띠 전부와 열 띠 전부가 한꺼번에 스쳤다 사라진다.
     *
     * 이 걸음이 하는 말이 "C 의 **모든** 칸이 행 하나와 열 하나에서 나온다" 이므로,
     * 그동안 하나씩 옮겨 다니던 띠를 한 번에 겹쳐 보인다 — 걸음의 말과 같은 동사다
     * (S-piece 의 얇은 걸음). 진폭이 `e` 로만 정해져 양 끝에서 0 이라, 멎은 화면은
     * 정적 그리기가 세운 것과 글자 하나 다르지 않다.
     */
    async function flowSweep(drawn: Drawn, mine: number): Promise<void> {
      const g = drawn.geom;
      const bands: SVGRectElement[] = [];
      for (let row = 0; row < g.rows; row += 1) {
        bands.push(
          el('rect', {
            x: g.h.aX - 8,
            y: g.cellY(row),
            width: g.h.right + 8 - (g.h.aX - 8),
            height: CELL_H,
            rx: 8,
            fill: bandTint,
            opacity: 0,
          }),
        );
      }
      for (let col = 0; col < g.cols; col += 1) {
        bands.push(
          el('rect', {
            x: g.cellX(col),
            y: g.v.bTop - 8,
            width: g.h.cw,
            height: g.v.gridBottom + 8 - (g.v.bTop - 8),
            rx: 8,
            fill: bandTint,
            opacity: 0,
          }),
        );
      }
      for (const band of bands) gBands.appendChild(band);
      await tween(SWEEP_MS, mine, (e) => {
        const amp = Math.sin(Math.PI * e);
        for (const band of bands) band.setAttribute('opacity', String(amp));
      });
      for (const band of bands) band.remove();
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: RowTimesColumnScene,
      _prev: RowTimesColumnScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      // 무엇을 흐르게 할지는 장면이 이미 말한다. 맞대고 있는 짝이 있으면 그 짝이
      // 오는 길이고, 없는데 다 찼으면 띠를 거두는 길이다. 둘 다 아니면(되감기)
      // 흐를 것이 없다.
      if (next.meet !== null) await flowMeet(next, drawn, mine);
      else if (next.finished) await flowSweep(drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 `opacity`, 달려온 알갱이가 통째로 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 타이머는 콜백을 아예 안 부르므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const layer of layers) layer.remove();
      },
    };
  },
};
