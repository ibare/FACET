/**
 * svd 무대 — 좌표평면 없이 네모 표 둘(원래 표 · 쌓은 표)과 σ 막대 여섯.
 *
 * - 칸 값은 **크기**로 그린다: 칸마다 한 변이 |값| 에 비례하는 네모. 값이 −0.05 보다 작으면 속이 빈 네모.
 *   잣대(cellScale)는 알고리즘이 싣는다 — 무대는 셈하지 않는다.
 * - 겹 하나를 쌓을 때: 겹 L_j 의 작은 표가 σ 막대 j 자리에서 나와 쌓은 표로 미끄러져 와 포개지고,
 *   쌓은 표의 네모가 A_{j−1} 크기에서 A_j 크기로 자라거나 준다. σ 막대 j 는 "남은 겹" 선반에서 "쌓은 겹" 선반으로 내려간다.
 * - 판 머리: 원래 표의 네모가 새 그림 크기로 바뀌어 가고, σ 막대가 새 높이로 늘고 줄며 모두 위 선반으로 돌아가고,
 *   쌓은 표는 빈 칸 틀로 줄어든다. 쌓을 몫 표지가 새 k 로 옮겨 간다.
 *
 * 요소는 마운트 때 한 번 짓는다 — 판 머리를 몇 번 먹여도 요소 수가 늘지 않는다(되짚기 멱등).
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const W = 720;
const H = 380;
const ROWS = 6;
const COLS = 7;
const PITCH = 24;
const INSET = 3;
const ORIG_X = 24;
const STACK_X = 236;
const TABLE_Y = 44;
const BAR_X0 = 448;
const BAR_SLOT = 42;
const BAR_W = 26;
const BAR_MAX = 64;
const TOP_BASE = 118;
const BOTTOM_BASE = 278;
const SHELF_DROP = BOTTOM_BASE - TOP_BASE;
const TILE_START_SCALE = 0.2;
const HOLLOW_BELOW = -0.05;
const CAPTION_Y = [312, 336, 360] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

export type SvdStageBoard = {
  cells: number[][];
  sigmas: number[];
  sigmaTexts: string[];
  sigmaNames: string[];
  keep: number;
  cellScale: number;
  sigmaScale: number;
  name: string;
  durationMs: number;
};

export type SvdStageLayer = {
  layer: number;
  layerName: string;
  layerCells: number[][];
  from: number[][] | null;
  to: number[][];
  stackName: string;
  durationMs: number;
};

export type SvdStage = ViewInstance & {
  reset(): void;
  setBoard(board: SvdStageBoard): void;
  stackLayer(step: SvdStageLayer): void;
  setCaption(lines: string[]): void;
};

function flat(grid: number[][], what: string): number[] {
  if (grid.length !== ROWS) throw new Error(`svd-stage: ${what} 가 ${ROWS} 행이 아니다`);
  const out: number[] = [];
  for (const row of grid) {
    if (row.length !== COLS) throw new Error(`svd-stage: ${what} 의 행이 ${COLS} 칸이 아니다`);
    for (const x of row) {
      if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`svd-stage: ${what} 에 수가 아닌 칸이 있다`);
      out.push(x);
    }
  }
  return out;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const clamp01 = (p: number): number => Math.min(1, Math.max(0, p));
/** 구간 [a, b] 안의 진행률. */
const span = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));

export const svdStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): SvdStage {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, size: string, fill: string, parent: Element, anchor = 'start') =>
      el('text', { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor }, parent);

    const root = el('g', { class: 'svd-stage' }, svg);

    // ── 머리글
    const origHead = text(ORIG_X, 28, fontSizes.sm, pal.text, root);
    const stackHead = text(STACK_X, 28, fontSizes.sm, pal.text, root);
    const leftHead = text(BAR_X0, 28, fontSizes.sm, pal.textMuted, root);
    leftHead.textContent = t('label.left', 'Layers left');
    const doneHead = text(BAR_X0, 184, fontSizes.sm, pal.textMuted, root);
    doneHead.textContent = t('label.done', 'Layers stacked');

    // ── 표 틀과 네모
    const table = (x0: number, fill: string) => {
      const g = el('g', {}, root);
      const squares: SVGRectElement[] = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          el('rect', { x: x0 + c * PITCH, y: TABLE_Y + r * PITCH, width: PITCH, height: PITCH, fill: 'none', stroke: pal.border }, g);
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          squares.push(el('rect', { x: x0 + (c + 0.5) * PITCH, y: TABLE_Y + (r + 0.5) * PITCH, width: 0, height: 0, fill }, g));
        }
      }
      return squares;
    };
    const origSquares = table(ORIG_X, pal.text);
    const stackSquares = table(STACK_X, pal.primary);

    // ── 겹 타일 (하나를 두고 다시 쓴다)
    const tile = el('g', { opacity: 0 }, root);
    el('rect', { x: 0, y: 0, width: COLS * PITCH, height: ROWS * PITCH, fill: 'none', stroke: pal.itemActive, 'stroke-width': 2 }, tile);
    const tileSquares: SVGRectElement[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        tileSquares.push(el('rect', { x: (c + 0.5) * PITCH, y: (r + 0.5) * PITCH, width: 0, height: 0, fill: pal.itemActive }, tile));
      }
    }
    const tileLabel = text(COLS * PITCH + 6, 14, fontSizes.md, pal.itemActive, tile);

    // ── σ 선반
    el('line', { x1: BAR_X0 - 6, y1: TOP_BASE, x2: BAR_X0 + 6 * BAR_SLOT, y2: TOP_BASE, stroke: pal.border }, root);
    el('line', { x1: BAR_X0 - 6, y1: BOTTOM_BASE, x2: BAR_X0 + 6 * BAR_SLOT, y2: BOTTOM_BASE, stroke: pal.border }, root);
    const bars = Array.from({ length: 6 }, (_, i) => {
      const g = el('g', {}, root);
      const x = BAR_X0 + i * BAR_SLOT;
      const rect = el('rect', { x, y: TOP_BASE, width: BAR_W, height: 0, fill: pal.textMuted }, g);
      const value = text(x + BAR_W / 2, TOP_BASE - 4, fontSizes.xs, pal.textMuted, g, 'middle');
      const name = text(x + BAR_W / 2, TOP_BASE + 14, fontSizes.sm, pal.text, g, 'middle');
      return { g, rect, value, name };
    });
    const keepLine = el('line', { x1: BAR_X0, y1: TOP_BASE + 24, x2: BAR_X0, y2: TOP_BASE + 24, stroke: pal.textMuted, 'stroke-width': 2 }, root);
    const keepLabel = text(BAR_X0, TOP_BASE + 40, fontSizes.xs, pal.textMuted, root);

    // ── 캡션
    const captions = CAPTION_Y.map((y, i) => text(ORIG_X, y, i === 0 ? fontSizes.md : fontSizes.sm, i === 0 ? pal.text : pal.textMuted, root));

    // ── 보이는 상태
    let cellScale = 0;
    let sigmaScale = 0;
    let orig = new Array<number>(ROWS * COLS).fill(0);
    let stack = new Array<number>(ROWS * COLS).fill(0);
    let barValue = new Array<number>(6).fill(0);
    let barDown = new Array<number>(6).fill(0);
    let keepShown = 0;
    let tileCells = new Array<number>(ROWS * COLS).fill(0);
    let boardReady = false;

    const drawSquare = (rect: SVGRectElement, x0: number, idx: number, v: number, color: string) => {
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const side = cellScale > 0 ? (Math.abs(v) / cellScale) * (PITCH - 2 * INSET) : 0;
      rect.setAttribute('x', String(x0 + (c + 0.5) * PITCH - side / 2));
      rect.setAttribute('y', String(TABLE_Y + (r + 0.5) * PITCH - side / 2));
      rect.setAttribute('width', String(side));
      rect.setAttribute('height', String(side));
      if (v < HOLLOW_BELOW) {
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', '1.5');
      } else {
        rect.setAttribute('fill', color);
        rect.setAttribute('stroke', 'none');
      }
    };
    const drawTables = () => {
      orig.forEach((v, i) => drawSquare(origSquares[i]!, ORIG_X, i, v, pal.text));
      stack.forEach((v, i) => drawSquare(stackSquares[i]!, STACK_X, i, v, pal.primary));
    };
    const drawTile = () => {
      tileCells.forEach((v, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const rect = tileSquares[i]!;
        const side = cellScale > 0 ? (Math.abs(v) / cellScale) * (PITCH - 2 * INSET) : 0;
        rect.setAttribute('x', String((c + 0.5) * PITCH - side / 2));
        rect.setAttribute('y', String((r + 0.5) * PITCH - side / 2));
        rect.setAttribute('width', String(side));
        rect.setAttribute('height', String(side));
        if (v < HOLLOW_BELOW) {
          rect.setAttribute('fill', 'none');
          rect.setAttribute('stroke', pal.itemActive);
          rect.setAttribute('stroke-width', '1.5');
        } else {
          rect.setAttribute('fill', pal.itemActive);
          rect.setAttribute('stroke', 'none');
        }
      });
    };
    const drawBars = () => {
      bars.forEach((b, i) => {
        const h = sigmaScale > 0 ? (barValue[i]! / sigmaScale) * BAR_MAX : 0;
        const x = BAR_X0 + i * BAR_SLOT;
        b.rect.setAttribute('y', String(TOP_BASE - h));
        b.rect.setAttribute('height', String(h));
        b.rect.setAttribute('fill', barDown[i]! > 0.5 ? pal.primary : pal.textMuted);
        b.value.setAttribute('y', String(TOP_BASE - h - 4));
        b.g.setAttribute('transform', `translate(0 ${barDown[i]! * SHELF_DROP})`);
        b.name.setAttribute('x', String(x + BAR_W / 2));
      });
      const right = BAR_X0 + (keepShown - 1) * BAR_SLOT + BAR_W;
      keepLine.setAttribute('x2', String(keepShown >= 1 ? right : BAR_X0));
    };

    // ── 운동 — 하나만 돈다. 새 운동이 오면 앞 것을 끝 자리로 붙이고 시작한다
    let frame: number | null = null;
    let running: ((p: number) => void) | null = null;
    const stop = (finish: boolean) => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const fn = running;
      running = null;
      if (finish && fn) fn(1);
    };
    const run = (durationMs: number, draw: (p: number) => void) => {
      stop(true);
      if (isInstant() || durationMs <= 0) {
        draw(1);
        return;
      }
      running = draw;
      const start = performance.now();
      const tick = (now: number) => {
        const p = clamp01((now - start) / durationMs);
        draw(p);
        if (p < 1) frame = requestAnimationFrame(tick);
        else {
          frame = null;
          running = null;
        }
      };
      frame = requestAnimationFrame(tick);
    };
    params.onScrubStart?.(() => stop(true));

    const tileAt = (layer: number, p: number) => {
      const s = lerp(TILE_START_SCALE, 1, p);
      const cx0 = BAR_X0 + (layer - 1) * BAR_SLOT + BAR_W / 2;
      const x = lerp(cx0 - (COLS * PITCH * TILE_START_SCALE) / 2, STACK_X, p);
      const y = lerp(TOP_BASE - (ROWS * PITCH * TILE_START_SCALE) / 2 - BAR_MAX / 2, TABLE_Y, p);
      tile.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
    };

    const reset = () => {
      stop(false);
      boardReady = false;
      cellScale = 0;
      sigmaScale = 0;
      orig = orig.map(() => 0);
      stack = stack.map(() => 0);
      tileCells = tileCells.map(() => 0);
      barValue = barValue.map(() => 0);
      barDown = barDown.map(() => 0);
      keepShown = 0;
      tile.setAttribute('opacity', '0');
      tileLabel.textContent = '';
      origHead.textContent = '';
      stackHead.textContent = '';
      keepLabel.textContent = '';
      for (const b of bars) {
        b.value.textContent = '';
        b.name.textContent = '';
      }
      for (const c of captions) c.textContent = '';
      drawTables();
      drawTile();
      drawBars();
    };

    const setBoard = (board: SvdStageBoard) => {
      if (!(board.cellScale > 0) || !(board.sigmaScale > 0)) throw new Error('svd-stage: 잣대가 양수가 아니다');
      if (board.sigmas.length !== 6 || board.sigmaTexts.length !== 6 || board.sigmaNames.length !== 6) {
        throw new Error('svd-stage: σ 가 여섯이 아니다');
      }
      if (!Number.isInteger(board.keep) || board.keep < 1 || board.keep > 6) throw new Error('svd-stage: keep 이 1..6 밖이다');
      const target = flat(board.cells, '원래 표');
      stop(true);
      cellScale = board.cellScale;
      sigmaScale = board.sigmaScale;
      boardReady = true;
      origHead.textContent = `${t('label.original', 'Original table')} · ${board.name}`;
      stackHead.textContent = t('label.stacked', 'Stacked table');
      keepLabel.textContent = t('label.keep', 'To stack: {k}', { k: board.keep });
      tile.setAttribute('opacity', '0');
      tileLabel.textContent = '';
      bars.forEach((b, i) => {
        b.value.textContent = board.sigmaTexts[i]!;
        b.name.textContent = board.sigmaNames[i]!;
      });
      const fromOrig = [...orig];
      const fromStack = [...stack];
      const fromBar = [...barValue];
      const fromDown = [...barDown];
      const fromKeep = keepShown === 0 ? board.keep : keepShown;
      run(board.durationMs, (raw) => {
        const p = ease(raw);
        orig = fromOrig.map((a, i) => lerp(a, target[i]!, p));
        stack = fromStack.map((a) => lerp(a, 0, p));
        barValue = fromBar.map((a, i) => lerp(a, board.sigmas[i]!, p));
        barDown = fromDown.map((a) => lerp(a, 0, p));
        keepShown = lerp(fromKeep, board.keep, p);
        drawTables();
        drawBars();
      });
    };

    const stackLayer = (step: SvdStageLayer) => {
      if (!boardReady) throw new Error('svd-stage: 판 머리 전에 겹이 왔다');
      if (!Number.isInteger(step.layer) || step.layer < 1 || step.layer > 6) throw new Error('svd-stage: 겹 번호가 1..6 밖이다');
      const layerCells = flat(step.layerCells, '겹');
      const to = flat(step.to, '쌓은 표');
      const from = step.from === null ? to.map(() => 0) : flat(step.from, '앞 쌓은 표');
      stop(true);
      const j = step.layer - 1;
      tileCells = layerCells;
      tileLabel.textContent = step.layerName;
      drawTile();
      stackHead.textContent = `${t('label.stacked', 'Stacked table')} ${step.stackName}`;
      const fromDown = barDown[j]!;
      run(step.durationMs, (raw) => {
        // 앞 절반: 겹이 σ 막대 자리에서 쌓은 표로 미끄러져 온다. 뒤 절반: 쌓은 표가 A_j 로 자라고 준다
        const slide = ease(span(raw, 0, 0.5));
        const grow = ease(span(raw, 0.45, 1));
        tileAt(step.layer, slide);
        tile.setAttribute('opacity', String(raw >= 1 ? 0 : 1 - span(raw, 0.6, 1)));
        stack = from.map((a, i) => lerp(a, to[i]!, grow));
        barDown[j] = lerp(fromDown, 1, ease(raw));
        drawTables();
        drawBars();
      });
    };

    const setCaption = (lines: string[]) => {
      if (lines.length > captions.length) throw new Error('svd-stage: 캡션 줄이 너무 많다');
      captions.forEach((c, i) => {
        c.textContent = i < lines.length ? lines[i]! : '';
      });
    };

    reset();

    return {
      reset,
      setBoard,
      stackLayer,
      setCaption,
      destroy() {
        stop(false);
        root.remove();
      },
    };
  },
};
