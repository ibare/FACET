/**
 * all-suffixes-sorted-stage — 꼬리들이 줄을 서는 그림.
 *
 * 화면은 두 자리로 갈린다.
 *   왼쪽  원본 문자열과 거기서 떨어져 나온 꼬리들. 꼬리 i 는 문자열의 칸 i 바로
 *         아래에서 시작하므로 처음에는 계단 모양이 된다.
 *   오른쪽 줄. 사전 순으로 다음 차례인 꼬리가 하나씩 건너와 제 자리에 선다.
 *
 * 동사가 "줄 선다" 이므로 운동은 전부 자리 옮김이다 — 문자열에서 떨어지고(세로),
 * 왼끝을 맞추고(가로), 줄로 건너간다(가로+세로). 색은 그 위에 얹히는 표시일 뿐이다.
 *
 * 가로는 러너가 PIECE_CANVAS_W 로 정하므로 여기 적지 않고, 칸 크기는 그 폭에서
 * 역산한다. 세로만 이 파일의 상수다 (S-piece).
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

/** 세로는 내용이 정한다 — 글자 칸 한 줄 + 꼬리 여섯 줄 + 캡션 한 줄. */
const CANVAS_H = 348;

const PAD_X = 22;
const LANE_GAP = 44;
const CHIP_W = 26;
const CHIP_GAP = 8;
const CELL_MAX_W = 40;
const ROW_H = 30;
const ROW_GAP = 8;

const NUM_Y = 22;
const SOURCE_Y = 28;
const LABEL_Y = 80;
const ROWS_Y = 90;
const CAPTION_Y = 334;

const FRAME_MS = 16;
const CUT_MS = 620;
const ALIGN_MS = 460;
const TRAVEL_MS = 480;
const CLUSTER_MS = 380;
/** 줄로 건너갈 때 살짝 떠오르는 높이 — 자리를 뜨는 몸짓. */
const LIFT = 12;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

type TextSpec = {
  x: number;
  y: number;
  size: string;
  fill: string;
  family: string;
  anchor?: 'start' | 'middle';
};

function textNode(spec: TextSpec, content: string): SVGTextElement {
  const node = el('text', {
    x: spec.x,
    y: spec.y,
    fill: spec.fill,
    'font-family': spec.family,
    'font-size': spec.size,
    'text-anchor': spec.anchor ?? 'middle',
    'dominant-baseline': 'middle',
  });
  node.textContent = content;
  return node;
}

export type AllSuffixesSortedScene = { text: string };

/**
 * initialData 를 좁히는 자리는 여기 하나다 (S-piece). projector 가 같은 값을
 * 쓸 일이 생기면 이 함수를 부른다 — 좁히는 규칙이 두 벌이 되지 않게.
 */
export function readAllSuffixesSortedScene(initialData: unknown): AllSuffixesSortedScene {
  if (typeof initialData !== 'object' || initialData === null) return { text: '' };
  const data = initialData as Record<string, unknown>;
  return { text: typeof data.text === 'string' ? data.text : '' };
}

type RowState = 'default' | 'active' | 'placed';

export const allSuffixesSortedStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    // 캔버스 *안쪽* 만 비운다. 컨테이너를 비우면 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const text = readAllSuffixesSortedScene(params.initialData).text;
    const n = text.length;

    const laneW = Math.floor((PIECE_CANVAS_W - PAD_X * 2 - LANE_GAP) / 2);
    const chipBlock = CHIP_W + CHIP_GAP;
    const cellW = Math.min(CELL_MAX_W, Math.floor((laneW - chipBlock) / Math.max(1, n)));
    const poolCellsX = PAD_X + chipBlock;
    const lineCellsX = PAD_X + laneW + LANE_GAP + chipBlock;
    const rowY = (k: number): number => ROWS_Y + k * (ROW_H + ROW_GAP);

    // ── 줄 자리를 미리 그어 둔다. 건너올 곳이 보여야 "줄" 로 읽힌다.
    for (let k = 0; k < n; k += 1) {
      canvas.appendChild(
        el('line', {
          x1: lineCellsX - chipBlock,
          y1: rowY(k) + ROW_H + 3,
          x2: lineCellsX + n * cellW,
          y2: rowY(k) + ROW_H + 3,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 5',
        }),
      );
    }

    // ── 앞머리가 같은 구간을 덮을 띠. 줄보다 뒤에 있어야 하므로 먼저 붙인다.
    const band = el('rect', {
      x: lineCellsX - chipBlock - 6,
      y: rowY(0) - 6,
      width: chipBlock + n * cellW + 12,
      height: 0,
      rx: 8,
      fill: c.sortedTailBg,
      stroke: c.sortedTailBorder,
      'stroke-width': 1,
      opacity: 0,
    });
    canvas.appendChild(band);

    // ── 원본 문자열. 꼬리들은 이 칸들 바로 아래에서 시작한다.
    for (let i = 0; i < n; i += 1) {
      const x = poolCellsX + i * cellW;
      canvas.appendChild(
        textNode(
          {
            x: x + cellW / 2,
            y: NUM_Y,
            size: fontSizes.xs,
            fill: c.textMuted,
            family: fonts.mono,
          },
          String(i),
        ),
      );
      canvas.appendChild(
        el('rect', {
          x,
          y: SOURCE_Y,
          width: cellW,
          height: ROW_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      canvas.appendChild(
        textNode(
          {
            x: x + cellW / 2,
            y: SOURCE_Y + ROW_H / 2,
            size: fontSizes.lg,
            fill: c.text,
            family: fonts.mono,
          },
          text.charAt(i),
        ),
      );
    }

    // ── 두 자리의 이름.
    canvas.appendChild(
      textNode(
        {
          x: PAD_X,
          y: LABEL_Y,
          size: fontSizes.sm,
          fill: c.textMuted,
          family: fonts.body,
          anchor: 'start',
        },
        t('label.byPosition', 'By position'),
      ),
    );
    canvas.appendChild(
      textNode(
        {
          x: lineCellsX - chipBlock,
          y: LABEL_Y,
          size: fontSizes.sm,
          fill: c.textMuted,
          family: fonts.body,
          anchor: 'start',
        },
        t('label.inOrder', 'In order'),
      ),
    );

    // ── 꼬리 여섯. 처음에는 문자열 위에 겹쳐 숨어 있다가 거기서 떨어져 나온다.
    const rows: SVGGElement[] = [];
    const cellRects: SVGRectElement[][] = [];
    const cellTexts: SVGTextElement[][] = [];
    const chipTexts: SVGTextElement[] = [];
    const pos: { x: number; y: number }[] = [];
    const placedAt: number[] = [];

    for (let i = 0; i < n; i += 1) {
      const group = el('g', {
        transform: `translate(${poolCellsX + i * cellW}, ${SOURCE_Y})`,
        opacity: 0,
      });
      group.appendChild(
        el('rect', {
          x: -chipBlock,
          y: 4,
          width: CHIP_W,
          height: ROW_H - 8,
          rx: 5,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const chip = textNode(
        {
          x: -chipBlock + CHIP_W / 2,
          y: ROW_H / 2,
          size: fontSizes.xs,
          fill: c.textMuted,
          family: fonts.mono,
        },
        String(i),
      );
      group.appendChild(chip);
      chipTexts.push(chip);

      const rects: SVGRectElement[] = [];
      const glyphs: SVGTextElement[] = [];
      for (let j = 0; j < n - i; j += 1) {
        const rect = el('rect', {
          x: j * cellW,
          y: 0,
          width: cellW,
          height: ROW_H,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const glyph = textNode(
          {
            x: j * cellW + cellW / 2,
            y: ROW_H / 2,
            size: fontSizes.lg,
            fill: c.text,
            family: fonts.mono,
          },
          text.charAt(i + j),
        );
        group.appendChild(rect);
        group.appendChild(glyph);
        rects.push(rect);
        glyphs.push(glyph);
      }
      canvas.appendChild(group);
      rows.push(group);
      cellRects.push(rects);
      cellTexts.push(glyphs);
      pos.push({ x: poolCellsX + i * cellW, y: SOURCE_Y });
    }

    const caption = textNode(
      {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        size: fontSizes.md,
        fill: c.text,
        family: fonts.body,
      },
      '',
    );
    canvas.appendChild(caption);

    // ── 시간. 걸어 둔 것은 집합에 담고 destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;
    /** 되감기가 지나간 뒤에도 옛 애니메이션이 화면을 건드리지 않게 하는 표. */
    let epoch = 0;

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

    /** apply 는 0→1 의 날 진행을 받는다. 어떻게 휘게 할지는 부르는 쪽이 정한다. */
    async function tween(duration: number, apply: (p: number) => void): Promise<void> {
      const mine = epoch;
      const frames = Math.max(1, Math.round(duration / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        await wait(FRAME_MS);
        if (destroyed || epoch !== mine) return;
        apply(f / frames);
      }
    }

    function place(i: number, x: number, y: number): void {
      rows[i]?.setAttribute('transform', `translate(${Math.round(x)}, ${Math.round(y)})`);
    }

    function setRowState(i: number, state: RowState): void {
      const fill =
        state === 'active' ? c.itemActive : state === 'placed' ? c.itemSorted : c.itemDefault;
      const ink =
        state === 'active' ? c.stateInk : state === 'placed' ? c.textInverse : c.text;
      const stroke = state === 'placed' ? c.itemSorted : c.border;
      for (const rect of cellRects[i] ?? []) {
        rect.setAttribute('fill', fill);
        rect.setAttribute('stroke', stroke);
      }
      for (const glyph of cellTexts[i] ?? []) glyph.setAttribute('fill', ink);
      chipTexts[i]?.setAttribute('fill', state === 'default' ? c.textMuted : c.text);
    }

    async function cutTails(): Promise<void> {
      // 자리마다 한 줄씩 흘려 떨어뜨린다 — 여섯이 한꺼번에 쏟아지면 세기지 않는다.
      const window = 0.45;
      await tween(CUT_MS, (p) => {
        for (let i = 0; i < n; i += 1) {
          const begin = n > 1 ? (i / (n - 1)) * (1 - window) : 0;
          const q = ease(clamp01((p - begin) / window));
          rows[i]?.setAttribute('opacity', String(q));
          place(i, poolCellsX + i * cellW, SOURCE_Y + (rowY(i) - SOURCE_Y) * q);
        }
      });
      for (let i = 0; i < n; i += 1) {
        rows[i]?.setAttribute('opacity', '1');
        place(i, poolCellsX + i * cellW, rowY(i));
        pos[i] = { x: poolCellsX + i * cellW, y: rowY(i) };
      }
    }

    async function alignLeft(): Promise<void> {
      const from = pos.map((p) => p.x);
      await tween(ALIGN_MS, (p) => {
        const e = ease(p);
        for (let i = 0; i < n; i += 1) {
          const x0 = from[i] ?? poolCellsX;
          place(i, x0 + (poolCellsX - x0) * e, rowY(i));
        }
      });
      for (let i = 0; i < n; i += 1) {
        place(i, poolCellsX, rowY(i));
        pos[i] = { x: poolCellsX, y: rowY(i) };
      }
    }

    async function takePlace(spot: { from: number; rank: number }): Promise<void> {
      const i = spot.from;
      const k = spot.rank;
      if (i < 0 || i >= n) return;
      const start = pos[i] ?? { x: poolCellsX, y: rowY(i) };
      const endY = rowY(k);
      setRowState(i, 'active');
      await tween(TRAVEL_MS, (p) => {
        const e = ease(p);
        const lift = -LIFT * Math.sin(Math.PI * p);
        place(i, start.x + (lineCellsX - start.x) * e, start.y + (endY - start.y) * e + lift);
      });
      place(i, lineCellsX, endY);
      pos[i] = { x: lineCellsX, y: endY };
      placedAt[k] = i;
      setRowState(i, 'placed');
    }

    async function markCluster(run: { ranks: number[]; prefix: string }): Promise<void> {
      const ranks = run.ranks.filter((r) => r >= 0 && r < n);
      if (ranks.length === 0) return;
      const top = rowY(Math.min(...ranks)) - 6;
      const bottom = rowY(Math.max(...ranks)) + ROW_H + 6;
      const full = bottom - top;
      band.setAttribute('y', String(top));
      band.setAttribute('opacity', '1');
      await tween(CLUSTER_MS, (p) => {
        band.setAttribute('height', String(Math.round(full * ease(p))));
      });
      band.setAttribute('height', String(full));
      // 함께 가진 앞머리를 짚는다 — 이 칸들이 같아서 한데 모인 것이다.
      const shared = Math.max(1, run.prefix.length);
      for (const r of ranks) {
        const i = placedAt[r];
        if (i === undefined) continue;
        for (let j = 0; j < shared; j += 1) {
          cellRects[i]?.[j]?.setAttribute('fill', c.accent);
          cellRects[i]?.[j]?.setAttribute('stroke', c.accent);
          cellTexts[i]?.[j]?.setAttribute('fill', c.stateInk);
        }
      }
    }

    function reset(): void {
      epoch += 1;
      for (let i = 0; i < n; i += 1) {
        rows[i]?.setAttribute('opacity', '0');
        place(i, poolCellsX + i * cellW, SOURCE_Y);
        pos[i] = { x: poolCellsX + i * cellW, y: SOURCE_Y };
        setRowState(i, 'default');
      }
      placedAt.length = 0;
      band.setAttribute('opacity', '0');
      band.setAttribute('height', '0');
      caption.textContent = '';
    }

    return {
      cutTails,
      alignLeft,
      takePlace,
      markCluster,
      reset,
      setCaption(value: string): void {
        caption.textContent = value;
      },
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 emit 이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
