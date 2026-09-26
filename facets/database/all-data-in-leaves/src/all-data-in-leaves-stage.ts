/**
 * all-data-in-leaves 무대 — 찾는 열쇠를 실은 조각이 페이지를 하나씩 지나쳐 내려간다.
 *
 * 모든 페이지는 두 줄이다 — 위는 열쇠, 아래는 값 칸. 안쪽 페이지의 값 칸은 빈 점선이고
 * 잎의 값 칸에만 name 이 들어 있다. 찾는 열쇠가 안쪽 페이지에 보이면 그 빈 칸이 붉게
 * 드러나고 조각은 멈추지 않고 오른쪽 가지로 내려간다. 잎에서야 name 의 사본이 조각에 붙는다.
 *
 * 오른쪽 자에는 찾기마다 세로줄 하나 — 줄의 높이가 트리의 층과 같다. 열쇠를 처음 본 층에
 * 고리, 값을 쥔 층에 점. 셋의 고리 높이는 다르고 점은 모두 맨 아래 줄에 선다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  type AllDataInLeavesScene,
  type ReadMark,
  type ScenePage,
} from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 12;
/** 자의 한 칸 폭 상한 */
const RULER_COL_MAX = 46;
const RULER_GAP = 24;
/** 잎 사이 간격 하한 */
const LEAF_GAP_MIN = 8;
const PAGE_PAD = 3;
/** 안쪽 페이지의 가리킴 자리 폭 */
const PTR_W = 10;
const CELL_MAX = 36;
const KEY_H = 18;
const VAL_H = 16;
const PAGE_H = KEY_H + VAL_H;
const TOP_Y = 72;
const LAST_TOP_Y = 232;
const HEADER_Y = 40;
const CHIP_H = 18;
const CAPTION_Y = 296;
const FOOT_Y = 324;
const LEGEND_Y = 315;

const MOVE_MS = 500;
/** 잎 걸음에서 조각이 닿는 몫 — 나머지는 값 사본이 조각으로 올라오는 몫 */
const LEAF_ARRIVE = 0.65;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
const MONO_ADV = 0.6;

function r(v: number): number {
  return Math.round(v * 10) / 10 + 0;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function monoWidth(text: string, px: number): number {
  return text.length * px * MONO_ADV;
}

type PageBox = { page: ScenePage; x: number; y: number; w: number; depth: number };

type Layout = {
  boxes: Map<string, PageBox>;
  cellW: number;
  rulerX0: number;
  rulerColW: number;
  levelY: number[];
  treeCx: number;
};

/** 구조에서 자리를 셈한다 — 잎은 왼쪽부터 차례로, 안쪽 페이지는 아이들 가운데. */
function layout(scene: AllDataInLeavesScene): Layout | null {
  const byId = new Map(scene.pages.map((p) => [p.id, p]));
  const root = byId.get(scene.root);
  if (!root) return null;

  const depthOf = new Map<string, number>();
  const leaves: ScenePage[] = [];
  const walk = (p: ScenePage, d: number): void => {
    if (depthOf.has(p.id)) return;
    depthOf.set(p.id, d);
    if (p.kind === 'leaf') {
      leaves.push(p);
      return;
    }
    for (const c of p.children) {
      const child = byId.get(c);
      if (child) walk(child, d + 1);
    }
  };
  walk(root, 1);
  const levels = Math.max(...depthOf.values());

  const nLookups = Math.max(1, scene.lookups.length);
  const rulerColW = Math.min(RULER_COL_MAX, (W * 0.24) / nLookups);
  const rulerX0 = W - MARGIN - rulerColW * nLookups;
  const treeX0 = MARGIN;
  const treeX1 = rulerX0 - RULER_GAP;
  const treeW = treeX1 - treeX0;

  const entries = leaves.reduce((s, l) => s + l.keys.length, 0);
  const avail = treeW - (leaves.length - 1) * LEAF_GAP_MIN - leaves.length * 2 * PAGE_PAD;
  const cellW = Math.min(CELL_MAX, avail / Math.max(1, entries));
  const leafW = (l: ScenePage): number => l.keys.length * cellW + 2 * PAGE_PAD;
  const used = leaves.reduce((s, l) => s + leafW(l), 0);
  const gap = leaves.length > 1 ? Math.min(LEAF_GAP_MIN * 3, (treeW - used) / (leaves.length - 1)) : 0;
  const span = used + gap * (leaves.length - 1);

  const levelGap = levels > 1 ? (LAST_TOP_Y - TOP_Y) / (levels - 1) : 0;
  const levelY: number[] = [];
  for (let d = 1; d <= levels; d += 1) levelY.push(TOP_Y + (d - 1) * levelGap);

  const boxes = new Map<string, PageBox>();
  let x = treeX0 + (treeW - span) / 2;
  for (const l of leaves) {
    const d = depthOf.get(l.id)!;
    boxes.set(l.id, { page: l, x, y: levelY[d - 1]!, w: leafW(l), depth: d });
    x += leafW(l) + gap;
  }
  const place = (p: ScenePage): PageBox | undefined => {
    const known = boxes.get(p.id);
    if (known) return known;
    const kids = p.children.map((c) => byId.get(c)).filter((c): c is ScenePage => !!c);
    const kidBoxes = kids.map(place).filter((b): b is PageBox => !!b);
    if (kidBoxes.length === 0) return undefined;
    const cx = kidBoxes.reduce((s, b) => s + b.x + b.w / 2, 0) / kidBoxes.length;
    const w = p.keys.length * cellW + (p.keys.length + 1) * PTR_W;
    const d = depthOf.get(p.id) ?? 1;
    const box = { page: p, x: cx - w / 2, y: levelY[d - 1]!, w, depth: d };
    boxes.set(p.id, box);
    return box;
  };
  const rootBox = place(root);
  if (!rootBox) return null;
  return { boxes, cellW, rulerX0, rulerColW, levelY, treeCx: rootBox.x + rootBox.w / 2 };
}

/** 열쇠 칸 i 의 왼쪽 끝 */
function keyCellX(b: PageBox, i: number, cellW: number): number {
  return b.page.kind === 'leaf' ? b.x + PAGE_PAD + i * cellW : b.x + PTR_W + i * (cellW + PTR_W);
}

/** 안쪽 페이지 가리킴 i 의 가운데 */
function pointerX(b: PageBox, i: number, cellW: number): number {
  return b.x + PTR_W / 2 + i * (cellW + PTR_W);
}

/** 조각이 그 페이지를 읽을 때 서는 자리 (가운데) */
function chipAt(L: Layout, page: string, mark: { kind: 'inner' | 'leaf'; slot: number; hit: number }): { x: number; y: number } | null {
  const b = L.boxes.get(page);
  if (!b) return null;
  const x =
    mark.kind === 'leaf' || mark.hit >= 0
      ? keyCellX(b, mark.kind === 'leaf' ? mark.slot : mark.hit, L.cellW) + L.cellW / 2
      : pointerX(b, mark.slot, L.cellW);
  return { x, y: b.y - CHIP_H / 2 - 3 };
}

function rulerCx(L: Layout, search: number): number {
  return L.rulerX0 + L.rulerColW * (search + 0.5);
}

function levelMidY(L: Layout, depth: number): number {
  return (L.levelY[depth - 1] ?? TOP_Y) + PAGE_H / 2;
}

export const allDataInLeavesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, o: { size?: number; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {}): SVGTextElement {
      return el(
        parent,
        'text',
        {
          x,
          y,
          'text-anchor': o.anchor ?? 'middle',
          'dominant-baseline': 'central',
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': `${o.size ?? SM}px`,
          'font-weight': o.weight ?? 'normal',
          fill: o.fill ?? colors.text,
        },
        text,
      );
    }

    /** 알약 하나 — 가운데 (0,0) 기준 그룹. 옮길 때 transform 만 바꾼다 */
    function pill(parent: Element, text: string, fill: string, ink: string, stroke?: string): { g: SVGGElement; w: number } {
      const g = el(parent, 'g', {});
      const w = Math.max(CHIP_H + 4, monoWidth(text, SM) + 12);
      const rect = el(g, 'rect', { x: -w / 2, y: -CHIP_H / 2, width: w, height: CHIP_H, rx: CHIP_H / 2, fill });
      if (stroke) {
        rect.setAttribute('stroke', stroke);
        rect.setAttribute('stroke-width', '1.5');
      }
      label(g, 0, 0, text, { mono: true, fill: ink, weight: 'bold' });
      return { g, w };
    }

    function moveTo(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${r(x)} ${r(y)})`);
    }

    type Handles = {
      chip: SVGGElement | null;
      chipTo: { x: number; y: number } | null;
      chipFrom: { x: number; y: number } | null;
      /** 잎에서 쥔 값 알약 (조각 오른쪽에 붙는다) */
      valuePill: { g: SVGGElement; x: number; y: number } | null;
      /** 값 사본이 떠나는 자리 (잎의 name 칸 가운데) */
      valueFrom: { x: number; y: number; text: string } | null;
      /** 조각이 닿을 때 드러나는 강조 */
      arriving: SVGElement[];
    };

    function drawStatic(scene: AllDataInLeavesScene): Handles {
      svg.textContent = '';
      const handles: Handles = { chip: null, chipTo: null, chipFrom: null, valuePill: null, valueFrom: null, arriving: [] };
      const L = layout(scene);
      if (!L) return handles;
      const step = scene.step;
      const current = step ? step.search : -1;
      const trail: ReadMark[] = current >= 0 ? (scene.trails[current] ?? []) : [];
      const markOf = new Map(trail.map((m) => [m.page, m]));
      const isNow = (page: string): boolean => step !== null && step.mark.page === page;

      // 인덱스 이름과 지금 찾는 조건 (자료 그대로)
      label(svg, MARGIN, 20, scene.index, { anchor: 'start', mono: true, size: XS, fill: colors.textMuted });
      if (step) {
        const sql = scene.lookups[step.search]?.sql;
        if (sql !== undefined) label(svg, L.treeCx, HEADER_Y - 20, sql, { mono: true, fill: colors.text });
      }

      // 가리킴 선
      const edges = el(svg, 'g', {});
      for (const b of L.boxes.values()) {
        if (b.page.kind !== 'inner') continue;
        const m = markOf.get(b.page.id);
        b.page.children.forEach((c, i) => {
          const cb = L.boxes.get(c);
          if (!cb) return;
          const taken = m !== undefined && m.next === c;
          const line = el(edges, 'line', {
            x1: pointerX(b, i, L.cellW),
            y1: b.y + PAGE_H,
            x2: cb.x + cb.w / 2,
            y2: cb.y,
            stroke: taken ? colors.primary : colors.border,
            'stroke-width': taken ? 2.5 : 1,
          });
          if (taken && m && isNow(m.page)) handles.arriving.push(line);
        });
      }

      // 페이지
      for (const b of L.boxes.values()) {
        const g = el(svg, 'g', {});
        const m = markOf.get(b.page.id);
        const now = isNow(b.page.id);
        el(g, 'rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: PAGE_H,
          rx: 3,
          fill: colors.bg,
          stroke: m ? colors.primary : colors.border,
          'stroke-width': m ? 1.8 : 1,
        });
        el(g, 'line', { x1: b.x, y1: b.y + KEY_H, x2: b.x + b.w, y2: b.y + KEY_H, stroke: colors.border, 'stroke-width': 0.8 });
        if (b.page.kind === 'inner') {
          b.page.children.forEach((_, i) => {
            el(g, 'circle', { cx: pointerX(b, i, L.cellW), cy: b.y + KEY_H / 2, r: 2, fill: colors.textMuted });
          });
        }
        b.page.keys.forEach((k, i) => {
          const cx = keyCellX(b, i, L.cellW);
          const hit = m !== undefined && m.hit === i;
          if (hit) {
            const box = el(g, 'rect', { x: cx + 1, y: b.y + 2, width: L.cellW - 2, height: KEY_H - 3, rx: 2, fill: colors.itemPivot });
            if (now) handles.arriving.push(box);
          }
          label(g, cx + L.cellW / 2, b.y + KEY_H / 2 + 0.5, String(k), { mono: true, fill: hit ? colors.stateInk : colors.text });
          const vy = b.y + KEY_H;
          if (b.page.kind === 'inner') {
            // 값 칸 — 안쪽 페이지에는 비어 있다
            const slot = el(g, 'rect', {
              x: cx + 3,
              y: vy + 3,
              width: L.cellW - 6,
              height: VAL_H - 6,
              rx: 2,
              fill: 'none',
              stroke: hit ? colors.danger : colors.border,
              'stroke-width': hit ? 1.5 : 0.8,
              'stroke-dasharray': '2 2',
            });
            if (hit && now) handles.arriving.push(slot);
          } else {
            const name = b.page.names[i] ?? '';
            if (hit) {
              const got = el(g, 'rect', { x: cx + 1, y: vy + 1, width: L.cellW - 2, height: VAL_H - 3, rx: 2, fill: 'none', stroke: colors.success, 'stroke-width': 1.5 });
              if (now) handles.arriving.push(got);
              if (now) handles.valueFrom = { x: cx + L.cellW / 2, y: vy + VAL_H / 2, text: name };
            }
            label(g, cx + L.cellW / 2, vy + VAL_H / 2, name, { size: XS, fill: hit ? colors.success : colors.textMuted, weight: hit ? 'bold' : 'normal' });
          }
        });
      }

      // 자 — 찾기마다 한 줄, 높이가 층이다
      const ruler = el(svg, 'g', {});
      scene.lookups.forEach((lk, i) => {
        const cx = rulerCx(L, i);
        const marks = scene.trails[i] ?? [];
        const last = marks[marks.length - 1];
        if (last) {
          const line = el(ruler, 'line', { x1: cx, y1: HEADER_Y + CHIP_H / 2, x2: cx, y2: levelMidY(L, last.depth), stroke: colors.textMuted, 'stroke-width': 1.2 });
          if (i === current && marks.length === 1) handles.arriving.push(line);
        }
        marks.forEach((mk, j) => {
          const y = levelMidY(L, mk.depth);
          const nowMark = i === current && j === marks.length - 1;
          const g = el(ruler, 'g', {});
          if (nowMark && marks.length > 1) {
            const prevMark = marks[j - 1]!;
            el(g, 'line', { x1: cx, y1: levelMidY(L, prevMark.depth), x2: cx, y2: y, stroke: colors.textMuted, 'stroke-width': 1.2 });
          }
          if (mk.kind === 'leaf') {
            el(g, 'circle', { cx, cy: y, r: 5.5, fill: colors.success });
            label(g, cx, y + 15, mk.value ?? '', { size: XS, fill: colors.success, weight: 'bold' });
          } else if (mk.hit >= 0) {
            el(g, 'circle', { cx, cy: y, r: 6, fill: colors.bg, stroke: colors.danger, 'stroke-width': 1.8 });
          } else {
            el(g, 'circle', { cx, cy: y, r: 2.5, fill: colors.textMuted });
          }
          if (nowMark) handles.arriving.push(g);
        });
        const active = i === current;
        const head = pill(ruler, String(lk.key), active ? colors.bg : colors.bgSubtle, active ? colors.textMuted : colors.text);
        if (active) head.g.firstElementChild?.setAttribute('stroke', colors.primary);
        if (active) head.g.firstElementChild?.setAttribute('stroke-dasharray', '3 2');
        moveTo(head.g, cx, HEADER_Y);
      });
      // 층 줄 — 자의 가로 눈금이 트리의 층과 같은 높이임을 보인다
      L.levelY.forEach((_, d) => {
        const y = levelMidY(L, d + 1);
        const tick = el(ruler, 'line', {
          x1: L.rulerX0 - RULER_GAP / 2,
          y1: y,
          x2: L.rulerX0 + L.rulerColW * scene.lookups.length,
          y2: y,
          stroke: colors.border,
          'stroke-width': 0.8,
          'stroke-dasharray': '1 3',
        });
        ruler.insertBefore(tick, ruler.firstChild);
      });

      // 조각 — 찾는 열쇠
      if (step) {
        const to = chipAt(L, step.mark.page, step.mark);
        if (to) {
          const from = step.from ? chipAt(L, step.from.page, step.from) : { x: rulerCx(L, step.search), y: HEADER_Y };
          const chip = pill(svg, String(step.key), colors.primary, colors.textInverse);
          moveTo(chip.g, to.x, to.y);
          handles.chip = chip.g;
          handles.chipTo = to;
          handles.chipFrom = from;
          if (step.mark.kind === 'leaf' && step.mark.value !== null) {
            const vp = pill(svg, step.mark.value, colors.bg, colors.success, colors.success);
            const vx = to.x + chip.w / 2 + vp.w / 2 + 2;
            moveTo(vp.g, vx, to.y);
            handles.valuePill = { g: vp.g, x: vx, y: to.y };
          }
        }
      }

      // 캡션 — 지금 일어나는 일
      if (step) {
        const m = step.mark;
        let caption: string;
        if (m.kind === 'leaf') {
          caption = t('caption.leaf', 'Leaf {page}: the row is here. Value: {value}.', { page: m.page, value: m.value ?? '' });
        } else if (m.hit >= 0) {
          caption = t('caption.seen', '{key} is on this page, but no value is stored here. Next page: {next}.', { key: step.key, next: m.next ?? '' });
        } else {
          caption = t('caption.pass', 'No {key} on this page. Next page: {next}.', { key: step.key, next: m.next ?? '' });
        }
        label(svg, MARGIN, CAPTION_Y, caption, { anchor: 'start', size: SM });
        label(svg, MARGIN, FOOT_Y, t('label.pagesRead', 'Pages read: {n}', { n: trail.length }), {
          anchor: 'start',
          size: XS,
          fill: colors.textMuted,
        });
      }

      // 자의 읽는 법 — 두 줄, 자 왼쪽 끝에서 시작
      const lx = L.rulerX0 - RULER_GAP;
      const lg = el(svg, 'g', {});
      el(lg, 'circle', { cx: lx, cy: LEGEND_Y, r: 4.5, fill: colors.bg, stroke: colors.danger, 'stroke-width': 1.6 });
      label(lg, lx + 10, LEGEND_Y, t('legend.seen', 'key seen, no value'), { anchor: 'start', size: XS, fill: colors.textMuted });
      el(lg, 'circle', { cx: lx, cy: LEGEND_Y + 16, r: 4.5, fill: colors.success });
      label(lg, lx + 10, LEGEND_Y + 16, t('legend.value', 'value'), { anchor: 'start', size: XS, fill: colors.textMuted });

      return handles;
    }

    function tween(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed) return done();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: AllDataInLeavesScene, _prev: AllDataInLeavesScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || !h.chip || !h.chipTo || !h.chipFrom) return;

      const chip = h.chip;
      const from = h.chipFrom;
      const to = h.chipTo;
      const isLeaf = h.valuePill !== null && h.valueFrom !== null;
      const arriveAt = isLeaf ? LEAF_ARRIVE : 1;
      for (const a of h.arriving) a.setAttribute('opacity', '0');
      if (h.valuePill) h.valuePill.g.setAttribute('opacity', '0');
      let copy: SVGGElement | null = null;

      await tween(MOVE_MS, (p) => {
        if (mine !== gen || destroyed) return;
        const q = ease(Math.min(1, p / arriveAt));
        moveTo(chip, from.x + (to.x - from.x) * q, from.y + (to.y - from.y) * q);
        if (p < arriveAt) return;
        for (const a of h.arriving) a.removeAttribute('opacity');
        if (h.valuePill && h.valueFrom) {
          // 값의 사본이 잎의 name 칸에서 조각 옆으로 올라온다 — 원본은 잎에 남는다
          if (!copy) {
            copy = pill(svg, h.valueFrom.text, colors.bg, colors.success, colors.success).g;
          }
          const s = ease(Math.min(1, (p - arriveAt) / (1 - arriveAt)));
          const vf = h.valueFrom;
          const vt = h.valuePill;
          moveTo(copy, vf.x + (vt.x - vf.x) * s, vf.y + (vt.y - vf.y) * s);
        }
      });
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
