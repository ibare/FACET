/**
 * space-error-tradeoff-stage — 표가 갈라지고 막대가 내려앉는 그림.
 *
 * 동사는 "좁아지고 부푼다" 다. 화면에서 그것이 일어나는 방식은 둘이다.
 *
 *   1. 표가 **갈라진다.** 폭이 2 → 4 → 8 로 가면 칸 하나가 둘로 나뉘어 좌우로
 *      미끄러져 나간다. 칸 폭은 그대로이므로 표 자체가 가운데에서 바깥으로
 *      넓어진다 — 좁았다는 사실이 넓어지는 운동으로 드러난다.
 *   2. 막대가 **내려앉는다.** 읽힌 값은 참값 선 위로 솟아 있고, 표가 넓어질
 *      때마다 제자리에서 아래로 흘러내린다. 내려앉기 전 높이는 흐린 눈금으로
 *      남아, 부풀었던 만큼이 같은 자 위에 남는다 (S-piece "잰 값은 재는 그
 *      자리에 남긴다" — 견줌의 기준이 같은 계기 위에 있어야 한다).
 *
 * 막대의 세로 축척은 마운트 때 한 번 정하고 바꾸지 않는다. 축척이 걸음마다
 * 달라지면 흐린 눈금이 거짓말을 하게 된다. 상한은 `keys × repeats` — 칸 하나가
 * 스트림 전부를 이고 있는 경우이며, 어떤 읽힌 값도 이것을 넘을 수 없다.
 */

import {
  PIECE_CANVAS_W,
  getColors,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const CANVAS_H = 338;

const CAPTION_X = 24;
const CAPTION_Y1 = 20;
const CAPTION_Y2 = 38;
const CAPTION_LINES = 2;

const CELL_MAX_W = 62;
const CELL_H = 32;
const TABLE_SIDE_MIN = 30;
const TABLE_TOP = 54;
const LOAD_STRIP_H = 4;

const BAR_BASE_Y = 306;
const BAR_MAX_H = 148;
const BAR_SIDE = 56;
const BAR_MAX_W = 48;
const KEY_LABEL_Y = 322;

const SPLIT_MS = 420;
const FILL_MS = 460;
const BAR_MS = 520;

/** 줄 이름은 해시 첨자 표기라 번역하지 않는다 (C10 — 수식·기호는 표식). */
const ROW_LABEL_PREFIX = 'r';

export type SpaceErrorTradeoffScene = {
  keys: string[];
  repeats: number;
  depth: number;
  widths: number[];
  /** 스트림의 길이. 막대 축척의 상한이기도 하다. */
  total: number;
};

export type SpaceErrorTradeoffStageArgs = {
  index: number;
  width: number;
  counts: number[][];
};

export type SpaceErrorTradeoffReadArgs = {
  estimates: number[];
  truth: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이기 때문이다 (S-piece).
 */
function readScene(initialData: Record<string, unknown> | undefined): SpaceErrorTradeoffScene {
  const raw = (initialData ?? {}) as Record<string, unknown>;
  const keys = Array.isArray(raw.keys)
    ? raw.keys.filter((k): k is string => typeof k === 'string')
    : [];
  const widths = Array.isArray(raw.widths)
    ? raw.widths.map((w) => num(w, 1)).filter((w) => w > 0)
    : [];
  const repeats = Math.max(1, num(raw.repeats, 1));
  const depth = Math.max(1, num(raw.depth, 1));
  return {
    keys,
    repeats,
    depth,
    widths: widths.length > 0 ? widths : [1],
    total: Math.max(1, keys.length * repeats),
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 한글·한자·가나는 라틴보다 넓다. 캡션 줄바꿈을 재기 위한 어림이다. */
function charWidth(ch: string): number {
  return /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿︰-﹏＀-｠]/.test(ch)
    ? 13.5
    : 7.2;
}

function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let curWidth = 0;
  let lastSpace = -1;

  for (const ch of text) {
    const w = charWidth(ch);
    if (cur !== '' && curWidth + w > maxWidth) {
      if (lastSpace > 0) {
        lines.push(cur.slice(0, lastSpace));
        cur = cur.slice(lastSpace + 1);
      } else {
        lines.push(cur);
        cur = '';
      }
      curWidth = 0;
      for (const c of cur) curWidth += charWidth(c);
      lastSpace = -1;
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
    if (ch === ' ') lastSpace = cur.length;
    cur += ch;
    curWidth += w;
  }
  if (cur !== '') lines.push(cur);
  return lines.slice(0, maxLines);
}

type CellNode = {
  rect: SVGRectElement;
  label: SVGTextElement;
  strip: SVGRectElement;
  birthX: number;
  finalX: number;
  count: number;
};

type BarNode = {
  base: SVGRectElement;
  over: SVGRectElement;
  value: SVGTextElement;
};

export const spaceErrorTradeoffStageView: CanvasView = {
  canvas: { height: CANVAS_H, fit: 'fill' },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    void container;
    const svg = params.canvas;
    const C = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          apply(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);

        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          apply(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 기하 ────────────────────────────────────────────────────────────
    const maxWidth = Math.max(...scene.widths);
    const cellW = Math.min(
      CELL_MAX_W,
      Math.floor((PIECE_CANVAS_W - TABLE_SIDE_MIN * 2) / maxWidth),
    );
    const slotW = (PIECE_CANVAS_W - BAR_SIDE * 2) / Math.max(1, scene.keys.length);
    const barW = Math.max(12, Math.min(BAR_MAX_W, Math.floor(slotW - 16)));

    const originX = (width: number): number =>
      width <= 0
        ? (PIECE_CANVAS_W - cellW) / 2
        : Math.round((PIECE_CANVAS_W - width * cellW) / 2);
    const barCenter = (i: number): number => BAR_SIDE + slotW * i + slotW / 2;
    const valueY = (v: number): number => BAR_BASE_Y - (v / scene.total) * BAR_MAX_H;

    const root = el('g', {});
    svg.appendChild(root);

    // ── 캡션 ────────────────────────────────────────────────────────────
    const captionLines = [CAPTION_Y1, CAPTION_Y2].map((y) => {
      const node = el('text', {
        x: CAPTION_X,
        y,
        fill: C.text,
        'font-size': fontSizes.md,
        'text-anchor': 'start',
      });
      root.appendChild(node);
      return node;
    });

    // ── 표 ──────────────────────────────────────────────────────────────
    const tableGroup = el('g', {});
    root.appendChild(tableGroup);

    const rowLabels: SVGTextElement[] = [];
    for (let r = 0; r < scene.depth; r += 1) {
      const node = el('text', {
        x: originX(0) - 10,
        y: TABLE_TOP + r * CELL_H + CELL_H / 2 + 4,
        fill: C.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'end',
      });
      node.textContent = `${ROW_LABEL_PREFIX}${r}`;
      root.appendChild(node);
      rowLabels.push(node);
    }

    // ── 막대 자리 ───────────────────────────────────────────────────────
    root.appendChild(
      el('line', {
        x1: BAR_SIDE - 10,
        y1: BAR_BASE_Y,
        x2: PIECE_CANVAS_W - BAR_SIDE + 10,
        y2: BAR_BASE_Y,
        stroke: C.border,
        'stroke-width': 1,
      }),
    );

    const truthY = valueY(scene.repeats);
    root.appendChild(
      el('line', {
        x1: BAR_SIDE - 10,
        y1: truthY,
        x2: PIECE_CANVAS_W - BAR_SIDE - 10,
        y2: truthY,
        stroke: C.success,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      }),
    );
    const truthLabel = el('text', {
      x: PIECE_CANVAS_W - BAR_SIDE - 4,
      y: truthY + 4,
      fill: C.success,
      'font-size': fontSizes.xs,
      'text-anchor': 'start',
    });
    truthLabel.textContent = t('label.trueValue', 'true = {truth}', { truth: scene.repeats });
    root.appendChild(truthLabel);

    const readLabel = el('text', {
      x: 8,
      y: valueY(scene.total) + 14,
      fill: C.textMuted,
      'font-size': fontSizes.xs,
      'text-anchor': 'start',
    });
    readLabel.textContent = t('label.readValue', 'read value');
    root.appendChild(readLabel);

    const ghostGroup = el('g', {});
    root.appendChild(ghostGroup);

    const bars: BarNode[] = scene.keys.map((key, i) => {
      const cx = barCenter(i);
      const base = el('rect', {
        x: cx - barW / 2,
        y: BAR_BASE_Y,
        width: barW,
        height: 0,
        fill: C.itemSorted,
        rx: 2,
      });
      const over = el('rect', {
        x: cx - barW / 2,
        y: BAR_BASE_Y,
        width: barW,
        height: 0,
        fill: C.danger,
        rx: 2,
      });
      const value = el('text', {
        x: cx,
        y: BAR_BASE_Y - 6,
        fill: C.text,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      const name = el('text', {
        x: cx,
        y: KEY_LABEL_Y,
        fill: C.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      name.textContent = key;
      root.appendChild(base);
      root.appendChild(over);
      root.appendChild(value);
      root.appendChild(name);
      return { base, over, value };
    });

    // ── 상태 ────────────────────────────────────────────────────────────
    let cells: CellNode[] = [];
    let curWidth = 0;
    let curEstimates: number[] = scene.keys.map(() => 0);

    function setCellX(cell: CellNode, x: number): void {
      cell.rect.setAttribute('x', String(x));
      cell.label.setAttribute('x', String(x + cellW / 2));
      cell.strip.setAttribute('x', String(x + 1));
    }

    function setCellCount(cell: CellNode, shown: number): void {
      const rounded = Math.round(shown);
      cell.label.textContent = String(rounded);
      cell.label.setAttribute(
        'fill',
        rounded === 0 ? C.textMuted : rounded > scene.repeats ? C.danger : C.text,
      );
      const ratio = Math.min(1, shown / scene.total);
      cell.strip.setAttribute('width', String(Math.max(0, ratio * (cellW - 2))));
    }

    function drawBar(i: number, v: number): void {
      const bar = bars[i];
      if (bar === undefined) return;
      const solid = Math.min(v, scene.repeats);
      const solidTop = valueY(solid);
      const top = valueY(v);
      bar.base.setAttribute('y', String(solidTop));
      bar.base.setAttribute('height', String(Math.max(0, BAR_BASE_Y - solidTop)));
      bar.over.setAttribute('y', String(top));
      bar.over.setAttribute('height', String(Math.max(0, solidTop - top)));
      bar.value.setAttribute('y', String(top - 6));
      bar.value.textContent = v <= 0 ? '' : String(Math.round(v));
    }

    function addGhost(i: number, v: number): void {
      const cx = barCenter(i);
      const y = valueY(v);
      ghostGroup.appendChild(
        el('line', {
          x1: cx - barW / 2 - 3,
          y1: y,
          x2: cx + barW / 2 + 3,
          y2: y,
          stroke: C.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        }),
      );
    }

    function setCaption(text: string): void {
      const lines = wrapText(text, PIECE_CANVAS_W - CAPTION_X * 2, CAPTION_LINES);
      captionLines.forEach((node, i) => {
        node.textContent = lines[i] ?? '';
      });
    }

    function clearBoard(): void {
      tableGroup.textContent = '';
      ghostGroup.textContent = '';
      cells = [];
      curWidth = 0;
      curEstimates = scene.keys.map(() => 0);
      for (let i = 0; i < bars.length; i += 1) drawBar(i, 0);
      const startX = originX(0) - 10;
      for (const label of rowLabels) label.setAttribute('x', String(startX));
    }

    return {
      setCaption,

      /** 표가 width 칸으로 갈라진 뒤, 스트림이 칸에 담긴다. */
      async showStage(args: SpaceErrorTradeoffStageArgs): Promise<void> {
        const prevWidth = curWidth;
        const prevOrigin = originX(prevWidth);
        const width = Math.max(1, args.width);
        const origin = originX(width);

        tableGroup.textContent = '';
        cells = [];

        for (let r = 0; r < scene.depth; r += 1) {
          const row = Array.isArray(args.counts[r]) ? args.counts[r] : [];
          const top = TABLE_TOP + r * CELL_H;
          for (let j = 0; j < width; j += 1) {
            // 갈라지기 전의 어느 칸에서 나왔는가 — 그 자리에서 출발해 제자리로 민다.
            const birthX =
              prevWidth <= 0
                ? (PIECE_CANVAS_W - cellW) / 2
                : prevOrigin + Math.floor((j * prevWidth) / width) * cellW;
            const finalX = origin + j * cellW;

            const rect = el('rect', {
              x: birthX,
              y: top,
              width: cellW,
              height: CELL_H,
              fill: C.bg,
              stroke: C.border,
              'stroke-width': 1,
              rx: 3,
            });
            const strip = el('rect', {
              x: birthX + 1,
              y: top + CELL_H - LOAD_STRIP_H - 1,
              width: 0,
              height: LOAD_STRIP_H,
              fill: C.danger,
              rx: 1,
            });
            const label = el('text', {
              x: birthX + cellW / 2,
              y: top + 19,
              fill: C.textMuted,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
            });
            label.textContent = '0';

            tableGroup.appendChild(rect);
            tableGroup.appendChild(strip);
            tableGroup.appendChild(label);
            cells.push({ rect, label, strip, birthX, finalX, count: num(row[j], 0) });
          }
        }

        const fromLabelX = prevOrigin - 10;
        const toLabelX = origin - 10;
        await tween(SPLIT_MS, (p) => {
          for (const cell of cells) setCellX(cell, lerp(cell.birthX, cell.finalX, p));
          const lx = lerp(fromLabelX, toLabelX, p);
          for (const label of rowLabels) label.setAttribute('x', String(lx));
        });
        curWidth = width;

        await tween(FILL_MS, (p) => {
          for (const cell of cells) setCellCount(cell, cell.count * p);
        });
      },

      /** 막대가 새 높이로 옮겨 가고, 떠난 자리에 흐린 눈금이 남는다. */
      async showReads(args: SpaceErrorTradeoffReadArgs): Promise<void> {
        const from = curEstimates.slice();
        const to = args.estimates;
        for (let i = 0; i < bars.length; i += 1) {
          const prev = num(from[i], 0);
          if (prev > 0) addGhost(i, prev);
        }
        await tween(BAR_MS, (p) => {
          for (let i = 0; i < bars.length; i += 1) {
            drawBar(i, lerp(num(from[i], 0), num(to[i], 0), p));
          }
        });
        curEstimates = bars.map((_bar, i) => num(to[i], 0));
      },

      /** 처음 상태로. 자동 재생이 끝난 뒤 첫 advance 가 이것을 부른다. */
      rewind(): void {
        clearBoard();
        setCaption('');
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode !== null) root.parentNode.removeChild(root);
      },
    };
  },
};
