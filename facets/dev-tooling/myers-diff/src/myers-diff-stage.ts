/**
 * myers-diff 무대 — 편집 격자(A 줄 × B 줄) 위에서 D 층마다 넓어지는 끝점 부채,
 * 곁의 막대 둘(표 칸 · Myers 일), 끝에 한 번에 접혀 내려오는 편집 목록.
 *
 * 운동:
 *   - 파일 길이가 바뀌면 격자가 커지며 칸이 촘촘해진다 (격자 선이 새 자리로 옮겨 간다).
 *     세로는 가장 큰 격자 자리를 처음부터 잡아 두고 바꾸지 않는다.
 *   - 고친 줄이 바뀌면 바꾼 줄 표시가 두 축을 따라 새 자리로 옮겨 간다.
 *   - 한 층의 끝점이 모두 함께 한 칸 치르고(아래 = 넣음 · 오른쪽 = 지움), 모두 함께 미끄러진다.
 *   - 표 칸 막대는 파일 길이의 제곱으로 자라고, Myers 일 막대는 걸음마다 조금씩 자란다.
 *   - 끝 경로의 줄들이 격자의 제자리에서 편집 목록 자리로 접혀 내려온다.
 *
 * 무대는 셈하지 않는다 — 끝점 · 경로 · 목록 줄 · 막대 값은 모두 payload 로 받는다.
 * 애니메이션은 CSS transition 에 맡긴다 (되짚기에서는 마지막 값이 이긴다).
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 880;
const H = 470;
/** 격자 왼쪽 위 */
const GX = 96;
const GY = 92;
/** 격자 한 변 = GRID_BASE + GRID_PER_LINE × N — N 이 크면 격자도 커지고 칸은 촘촘해진다 */
const GRID_BASE = 120;
const GRID_PER_LINE = 6;
/** 오른쪽 판 */
const RX = 500;
const BAR_W = 340;
const LIST_Y = 170;
const ROW_H = 19;
/** 목록 마지막 줄의 글자 바닥이 넘지 않을 자리 — 범례(H − 10) 위 */
const LIST_BOTTOM = H - 30;

/** 목록 줄 간격 — 줄이 많으면 좁혀 범례 위에 담는다 */
export function listRowGap(rows: number): number {
  if (rows <= 1) return ROW_H;
  return Math.min(ROW_H, (LIST_BOTTOM - LIST_Y) / (rows - 1));
}

/** 목록 i 번째 줄(0 부터)의 글자 바닥 */
export function listRowY(i: number, rows: number): number {
  return LIST_Y + i * listRowGap(rows);
}

export type Pt = { x: number; y: number };
export type RoundStartView = {
  k: number;
  n: number;
  m: number;
  delSpots: number[];
  insSpots: number[];
  matches: Pt[];
  tableCells: number;
  cellsScale: number;
};
export type PayView = {
  d: number;
  moves: { k: number; fromX: number; fromY: number; toX: number; toY: number; dir: 'del' | 'ins' }[];
  work: number;
};
export type SlideView = {
  d: number;
  runs: { k: number; fromX: number; fromY: number; toX: number; toY: number; len: number }[];
  layerSlides: number;
  reached: boolean;
  work: number;
};
export type FoldRowView = {
  kind: 'keep' | 'del' | 'ins' | 'run';
  mark: string;
  text: string;
  count: number;
  x: number;
  y: number;
};
export type FoldView = {
  points: Pt[];
  kinds: ('keep' | 'del' | 'ins')[];
  rows: FoldRowView[];
  kept: number;
  deleted: number;
  inserted: number;
};

/** projector 가 부르는 무대 표면 */
export type MyersDiffStage = ViewInstance & {
  reset(): void;
  roundStart(p: RoundStartView, ms: number): Promise<void>;
  layerPay(p: PayView, ms: number): Promise<void>;
  layerSlide(p: SlideView, ms: number): Promise<void>;
  fold(p: FoldView, ms: number): Promise<void>;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (parent) parent.appendChild(node);
  return node;
}

function place(node: SVGElement, x: number, y: number, extra = ''): void {
  node.style.transform = `translate(${x}px, ${y}px)${extra}`;
}

function motion(node: SVGElement, ms: number, props = 'transform, opacity'): void {
  node.style.transition = ms > 0 ? props.split(', ').map((p) => `${p} ${ms}ms ease-in-out`).join(', ') : 'none';
}

/** 지금 스타일을 확정해 다음 값이 transition 을 타게 한다 */
function settle(node: SVGElement): void {
  void node.getBoundingClientRect();
}

export const myersDiffStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const [delColor, insColor] = categorical(2, 'deep');
    if (delColor === undefined || insColor === undefined) throw new Error('myers-diff-stage: categorical 색이 모자라다');
    const mono = fonts.mono;
    const body = fonts.body;
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          resolve();
          return;
        }
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    const dropPending = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(dropPending);

    const root = el('g', {}, svg);
    root.setAttribute('font-family', body);

    const caption = el('text', { x: 20, y: 26, fill: c.text, 'font-size': fontSizes.md }, root);

    // ── 격자
    const beforeLabel = el('text', { x: GX, y: GY - 40, fill: c.textMuted, 'font-size': fontSizes.sm }, root);
    beforeLabel.textContent = `A · ${t('label.before', 'Before')}`;
    const afterLabel = el(
      'text',
      { x: 0, y: 0, fill: c.textMuted, 'font-size': fontSizes.sm, 'text-anchor': 'end' },
      root,
    );
    afterLabel.setAttribute('transform', `translate(${GX - 52}, ${GY}) rotate(-90)`);
    afterLabel.textContent = `B · ${t('label.after', 'After')}`;

    const gridG = el('g', {}, root);
    const frame = el('rect', { x: 0, y: 0, width: 1, height: 1, fill: c.bgSubtle, stroke: c.border }, gridG);
    frame.setAttribute('vector-effect', 'non-scaling-stroke');
    place(frame, GX, GY, ' scale(0.001)');
    frame.style.transformOrigin = '0 0';
    const colLines: SVGLineElement[] = [];
    const rowLines: SVGLineElement[] = [];
    const matchG = el('g', {}, gridG);
    const fanG = el('g', {}, root);
    const pathG = el('g', {}, root);
    const dotG = el('g', {}, root);
    const markG = el('g', {}, root);

    let cell = 1;
    let gridN = 0;
    let gridM = 0;
    const gx = (x: number): number => GX + x * cell;
    const gy = (y: number): number => GY + y * cell;

    const gridLine = (pool: SVGLineElement[], i: number): SVGLineElement => {
      const found = pool[i];
      if (found) return found;
      const line = el('line', { x1: 0, y1: 0, x2: 0, y2: 1, stroke: c.border, 'stroke-width': 1 }, gridG);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      line.style.transformOrigin = '0 0';
      line.style.opacity = '0';
      pool[i] = line;
      return line;
    };

    // ── 바꾼 줄 표시 (축 위) — 자리를 옮겨 간다
    type Marker = { g: SVGGElement; label: SVGTextElement };
    const makeMarker = (color: string): Marker => {
      const g = el('g', {}, markG);
      g.style.opacity = '0';
      el('circle', { cx: 0, cy: 0, r: 11, fill: c.bg, stroke: color, 'stroke-width': 1.5 }, g);
      const label = el(
        'text',
        {
          x: 0,
          y: 4,
          fill: color,
          'font-size': fontSizes.xs,
          'font-family': mono,
          'text-anchor': 'middle',
          'font-weight': 600,
        },
        g,
      );
      return { g, label };
    };
    const delMarks: Marker[] = [];
    const insMarks: Marker[] = [];

    // ── 오른쪽 판 — 막대 둘
    const barG = el('g', {}, root);
    const tableName = el('text', { x: RX, y: 64, fill: c.textMuted, 'font-size': fontSizes.sm }, barG);
    tableName.textContent = t('label.tableCells', 'Table cells');
    const tableBar = el('rect', { x: 0, y: 0, width: BAR_W, height: 14, fill: c.itemSorted, rx: 2 }, barG);
    place(tableBar, RX, 72, ' scaleX(0)');
    tableBar.style.transformOrigin = '0 0';
    const workName = el('text', { x: RX, y: 110, fill: c.textMuted, 'font-size': fontSizes.sm }, barG);
    workName.textContent = t('label.myersWork', 'Myers work');
    const workBar = el('rect', { x: 0, y: 0, width: BAR_W, height: 14, fill: c.itemActive, rx: 2 }, barG);
    place(workBar, RX, 118, ' scaleX(0)');
    workBar.style.transformOrigin = '0 0';
    const workValue = el(
      'text',
      { x: 0, y: 0, fill: c.text, 'font-size': fontSizes.sm, 'font-family': mono },
      barG,
    );
    place(workValue, RX + 6, 130);
    let scale = 0;

    // ── 편집 목록 · 범례
    const listG = el('g', {}, root);
    const legendG = el('g', {}, root);
    const legend = (i: number, color: string, dx: number, dy: number, text: string): void => {
      const x = RX + i * 110;
      const y = H - 10;
      el('line', { x1: x, y1: y - 4, x2: x + dx, y2: y - 4 + dy, stroke: color, 'stroke-width': 2.5 }, legendG);
      const label = el('text', { x: x + 18, y, fill: c.textMuted, 'font-size': fontSizes.xs }, legendG);
      label.textContent = text;
    };
    legend(0, delColor, 12, 0, t('label.del', 'delete'));
    legend(1, insColor, 0, 10, t('label.ins', 'insert'));
    legend(2, c.text, 10, 10, t('label.keep', 'keep'));

    // 지금 층의 끝점 (k → 원)
    let current = new Map<number, SVGCircleElement>();

    const retireDots = (ms: number): void => {
      for (const dot of current.values()) {
        motion(dot, ms, 'transform, opacity, r');
        dot.setAttribute('r', '2.5');
        dot.setAttribute('fill', c.textMuted);
        dot.setAttribute('stroke', 'none');
      }
      current = new Map();
    };

    const newDot = (x: number, y: number): SVGCircleElement => {
      const dot = el('circle', { cx: 0, cy: 0, r: 5, fill: c.accent, stroke: c.text, 'stroke-width': 1.5 }, dotG);
      motion(dot, 0);
      place(dot, gx(x), gy(y));
      return dot;
    };

    const growLine = (x1: number, y1: number, x2: number, y2: number, color: string, width: number, ms: number) => {
      const line = el(
        'line',
        { x1: gx(x1), y1: gy(y1), x2: gx(x2), y2: gy(y2), stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' },
        fanG,
      );
      line.setAttribute('pathLength', '1');
      line.style.strokeDasharray = '1';
      line.style.strokeDashoffset = '1';
      settle(line);
      motion(line, ms, 'stroke-dashoffset');
      line.style.strokeDashoffset = '0';
      return line;
    };

    const setWork = (work: number, ms: number): void => {
      if (scale <= 0) throw new Error('myers-diff-stage: 막대 눈금이 없다 — round-start 전에 불렸다');
      motion(workBar, ms);
      place(workBar, RX, 118, ` scaleX(${work / scale})`);
      motion(workValue, ms);
      place(workValue, RX + (work / scale) * BAR_W + 6, 130);
      workValue.textContent = String(work);
    };

    const clearRound = (): void => {
      fanG.replaceChildren();
      pathG.replaceChildren();
      dotG.replaceChildren();
      listG.replaceChildren();
      current = new Map();
      fanG.style.opacity = '1';
      caption.textContent = '';
    };

    const instance: MyersDiffStage = {
      reset(): void {
        dropPending();
        clearRound();
        workValue.textContent = '';
        place(workBar, RX, 118, ' scaleX(0)');
      },

      async roundStart(p: RoundStartView, ms: number): Promise<void> {
        clearRound();
        const side = GRID_BASE + GRID_PER_LINE * Math.max(p.n, p.m);
        const nextCell = side / Math.max(p.n, p.m, 1);
        cell = nextCell;
        gridN = p.n;
        gridM = p.m;
        // 격자 틀과 선이 새 자리로 옮겨 간다
        motion(frame, ms);
        place(frame, GX, GY, ` scale(${gridN * cell}, ${gridM * cell})`);
        const maxCols = Math.max(colLines.length, gridN + 1);
        for (let i = 0; i < maxCols; i += 1) {
          const line = gridLine(colLines, i);
          motion(line, ms);
          const on = i <= gridN;
          const x = GX + Math.min(i, gridN) * cell;
          place(line, x, GY, ` scale(1, ${gridM * cell})`);
          line.style.opacity = on ? '1' : '0';
        }
        const maxRows = Math.max(rowLines.length, gridM + 1);
        for (let i = 0; i < maxRows; i += 1) {
          const line = gridLine(rowLines, i);
          line.setAttribute('x2', '1');
          line.setAttribute('y2', '0');
          motion(line, ms);
          const on = i <= gridM;
          const y = GY + Math.min(i, gridM) * cell;
          place(line, GX, y, ` scale(${gridN * cell}, 1)`);
          line.style.opacity = on ? '1' : '0';
        }
        // 같은 줄 칸의 대각선 — 바꾼 자리에서 끊긴다
        matchG.replaceChildren();
        for (const mt of p.matches) {
          el(
            'line',
            {
              x1: gx(mt.x) + cell * 0.2,
              y1: gy(mt.y) + cell * 0.2,
              x2: gx(mt.x + 1) - cell * 0.2,
              y2: gy(mt.y + 1) - cell * 0.2,
              stroke: c.textMuted,
              'stroke-width': 1,
              'stroke-opacity': 0.5,
            },
            matchG,
          );
        }
        matchG.style.opacity = '0';
        settle(matchG);
        motion(matchG, ms, 'opacity');
        matchG.style.opacity = '1';

        // 바꾼 줄 표시가 축을 따라 새 자리로
        const moveMarks = (pool: Marker[], spots: number[], color: string, sign: string, onTop: boolean) => {
          while (pool.length < spots.length) {
            const mk = makeMarker(color);
            place(mk.g, onTop ? GX : GX - 18, onTop ? GY - 18 : GY);
            pool.push(mk);
          }
          pool.forEach((mk, i) => {
            motion(mk.g, ms);
            const spot = spots[i];
            if (spot === undefined) {
              mk.g.style.opacity = '0';
              return;
            }
            // 줄 번호는 1 부터
            mk.label.textContent = `${sign}${spot + 1}`;
            mk.g.style.opacity = '1';
            if (onTop) place(mk.g, gx(spot + 0.5), GY - 18);
            else place(mk.g, GX - 22, gy(spot + 0.5));
          });
        };
        moveMarks(delMarks, p.delSpots, delColor, '-', true);
        moveMarks(insMarks, p.insSpots, insColor, '+', false);

        // 막대 — 표 칸은 이 판의 값으로, Myers 일은 0 으로
        scale = p.cellsScale;
        if (scale <= 0) throw new Error('myers-diff-stage: cellsScale 이 0 이다');
        motion(tableBar, ms);
        place(tableBar, RX, 72, ` scaleX(${p.tableCells / scale})`);
        setWork(0, ms);
        workValue.textContent = '';

        caption.textContent = t('caption.start', 'A {n} lines · B {m} lines · {k} lines edited', {
          n: p.n,
          m: p.m,
          k: p.k,
        });
        await wait(ms);
      },

      async layerPay(p: PayView, ms: number): Promise<void> {
        const prev = current;
        retireDots(ms);
        const next = new Map<number, SVGCircleElement>();
        for (const mv of p.moves) {
          growLine(mv.fromX, mv.fromY, mv.toX, mv.toY, mv.dir === 'del' ? delColor : insColor, 2.5, ms);
          const dot = newDot(mv.fromX, mv.fromY);
          settle(dot);
          motion(dot, ms);
          place(dot, gx(mv.toX), gy(mv.toY));
          next.set(mv.k, dot);
        }
        if (prev.size === 0 && p.d > 0) throw new Error(`myers-diff-stage: D=${p.d} 치름 앞에 끝점이 없다`);
        current = next;
        setWork(p.work, ms);
        caption.textContent = t('caption.pay', 'D {d} · {n} endpoints each pay one step', {
          d: p.d,
          n: p.moves.length,
        });
        await wait(ms);
      },

      async layerSlide(p: SlideView, ms: number): Promise<void> {
        for (const run of p.runs) {
          let dot = current.get(run.k);
          if (dot === undefined) {
            if (p.d !== 0) throw new Error(`myers-diff-stage: D=${p.d} k=${run.k} 의 끝점이 없다`);
            dot = newDot(run.fromX, run.fromY);
            settle(dot);
            current.set(run.k, dot);
          }
          if (run.len > 0) growLine(run.fromX, run.fromY, run.toX, run.toY, c.text, 2.5, ms);
          motion(dot, ms);
          place(dot, gx(run.toX), gy(run.toY));
          if (p.reached && run.toX === gridN && run.toY === gridM) {
            dot.setAttribute('r', '7');
          }
        }
        setWork(p.work, ms);
        caption.textContent = p.reached
          ? t('caption.reach', 'D {d} · slid free {s} · reached the end', { d: p.d, s: p.layerSlides })
          : t('caption.slide', 'D {d} · slid free {s}', { d: p.d, s: p.layerSlides });
        await wait(ms);
      },

      async fold(p: FoldView, ms: number): Promise<void> {
        // 끝 경로 — 칸마다 손질 색
        motion(fanG, ms, 'opacity');
        fanG.style.opacity = '0.35';
        for (let i = 0; i < p.kinds.length; i += 1) {
          const a = p.points[i];
          const b = p.points[i + 1];
          const kind = p.kinds[i];
          if (a === undefined || b === undefined || kind === undefined) {
            throw new Error(`myers-diff-stage: 끝 경로 ${i} 번째 칸이 비었다`);
          }
          const color = kind === 'del' ? delColor : kind === 'ins' ? insColor : c.text;
          const seg = el(
            'line',
            { x1: gx(a.x), y1: gy(a.y), x2: gx(b.x), y2: gy(b.y), stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round' },
            pathG,
          );
          seg.setAttribute('stroke-opacity', '0.9');
        }
        // 목록 줄이 격자의 제자리에서 목록 자리로 접혀 내려온다
        p.rows.forEach((row, i) => {
          const g = el('g', {}, listG);
          motion(g, 0);
          place(g, gx(row.x), gy(row.y));
          g.style.opacity = '0';
          const color = row.kind === 'del' ? delColor : row.kind === 'ins' ? insColor : c.text;
          if (row.kind === 'del' || row.kind === 'ins') {
            el('rect', { x: -4, y: -13, width: BAR_W + 8, height: listRowGap(p.rows.length) - 2, fill: color, 'fill-opacity': 0.1, rx: 2 }, g);
          }
          const mark = el('text', { x: 0, y: 0, fill: color, 'font-family': mono, 'font-size': fontSizes.sm }, g);
          mark.textContent = row.mark;
          mark.setAttribute('xml:space', 'preserve');
          const text = el(
            'text',
            {
              x: smPx * 1.5,
              y: 0,
              fill: row.kind === 'run' ? c.textMuted : color,
              'font-family': row.kind === 'run' ? body : mono,
              'font-size': fontSizes.sm,
            },
            g,
          );
          text.setAttribute('xml:space', 'preserve');
          text.textContent =
            row.kind === 'run' ? t('label.run', '… {n} unchanged lines', { n: row.count }) : row.text;
          settle(g);
          motion(g, ms);
          place(g, RX, listRowY(i, p.rows.length));
          g.style.opacity = '1';
        });
        caption.textContent = t('caption.fold', 'Edit script: keep {keep} · delete {del} · insert {ins}', {
          keep: p.kept,
          del: p.deleted,
          ins: p.inserted,
        });
        await wait(ms);
      },

      destroy(): void {
        destroyed = true;
        dropPending();
        root.remove();
      },
    };
    return instance;
  },
};
