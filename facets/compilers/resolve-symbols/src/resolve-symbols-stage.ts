/**
 * resolve-symbols stage — 오브젝트 파일이 링커가 읽는 차례로 나란히 선다.
 *
 * 동사 "기다리다 이어진다" 를 이렇게 그린다.
 *  - 정의가 아직 없는 이름을 쓰는 자리(U)는 빈 자리로 남고, 그 이름 쪽지가 자리에서 떨어져 아래 기다림 줄에 가 선다.
 *  - 뒤 파일에서 같은 이름의 정의(D)가 나오면 기다리던 쪽지가 그 정의로 날아가고, 빈 자리에서 정의까지 선이 뻗는다.
 *  - 이미 나온 정의를 찾는 자리는 기다림 줄을 거치지 않고 곧바로 선이 뻗는다.
 * 그림은 장면이 정본이다 — 늘 장면 전체를 세우고, 운동은 끝 자리에 아직 못 온 만큼으로 그린다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import { countHoles, type EntryRef, type ObjectFile } from './algorithm.js';
import type { HoleLink, ResolveSymbolsScene, WaitingHole } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 296;
const W = PIECE_CANVAS_W;

/** 가로 여백 · 파일 사이 틈(선이 지나는 자리) · 파일 폭 상한 */
const MARGIN = 16;
const COL_GAP = 40;
const CARD_W_MAX = 200;
/** 세로 자리 */
const CAPTION_Y = 24;
const CARD_Y = 42;
const HEAD_H = 28;
const ROW_H_MAX = 30;
const CARDS_ROWS_H = 96;
const CARD_PAD = 6;
const LANE_GAP = 9;
const SHELF_TOP = 208;
const SHELF_H = 44;
const STATUS_Y = 278;

/** 운동 길이 */
const DROP_MS = 520;
const REACH_MS = 520;
const MEET_MS = 820;

const MONO_XS = parseFloat(fontSizes.xs);
const MONO_SM = parseFloat(fontSizes.sm);
const MONO_ADV = 0.61;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Pt {
  readonly x: number;
  readonly y: number;
}

interface Layout {
  readonly x0: number;
  readonly cardW: number;
  readonly rowH: number;
  readonly cardsBottom: number;
}

function r1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size: string; fill: string; family?: string; weight?: string; anchor?: string },
): SVGTextElement {
  const node = el(
    'text',
    {
      x,
      y,
      'font-size': opts.size,
      'font-family': opts.family ?? fonts.body,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
      ...(opts.weight === undefined ? {} : { 'font-weight': opts.weight }),
    },
    parent,
  );
  node.textContent = body;
  return node;
}

function layoutOf(files: readonly ObjectFile[]): Layout {
  const n = files.length;
  const cardW = Math.min(CARD_W_MAX, (W - 2 * MARGIN - (n - 1) * COL_GAP) / n);
  const total = n * cardW + (n - 1) * COL_GAP;
  let rows = 0;
  for (const f of files) rows = Math.max(rows, f.entries.length);
  const rowH = Math.min(ROW_H_MAX, CARDS_ROWS_H / rows);
  return { x0: (W - total) / 2, cardW, rowH, cardsBottom: CARD_Y + HEAD_H + rows * rowH + CARD_PAD };
}

function colX(lay: Layout, file: number): number {
  return lay.x0 + file * (lay.cardW + COL_GAP);
}

function rowBox(lay: Layout, ref: EntryRef): Box {
  return { x: colX(lay, ref.file) + 6, y: CARD_Y + HEAD_H + ref.entry * lay.rowH + 2, w: lay.cardW - 12, h: lay.rowH - 4 };
}

/** 읽는 차례의 번호 — 앞 파일들의 항목 수 + 파일 안 차례. */
function orderOf(files: readonly ObjectFile[], ref: EntryRef): number {
  let n = 0;
  for (let i = 0; i < ref.file; i += 1) {
    const f = files[i];
    if (f === undefined) throw new Error(`resolve-symbols-stage: 없는 파일 ${i}`);
    n += f.entries.length;
  }
  return n + ref.entry;
}

function fileName(files: readonly ObjectFile[], i: number): string {
  const f = files[i];
  if (f === undefined) throw new Error(`resolve-symbols-stage: 없는 파일 ${i}`);
  return f.name;
}

function sameRef(a: EntryRef, b: EntryRef): boolean {
  return a.file === b.file && a.entry === b.entry;
}

function refKey(r: EntryRef): string {
  return `${r.file}:${r.entry}`;
}

/** 기다림 쪽지 크기 — 이름과 그 자리의 파일. */
function chipWidth(files: readonly ObjectFile[], w: WaitingHole): number {
  const chars = w.name.length + fileName(files, w.ref.file).length;
  return chars * MONO_XS * MONO_ADV + 30;
}

function shelfSlots(lay: Layout, files: readonly ObjectFile[], list: readonly WaitingHole[]): Map<string, Box> {
  const out = new Map<string, Box>();
  let x = lay.x0 + 92;
  for (const w of list) {
    const cw = chipWidth(files, w);
    out.set(refKey(w.ref), { x, y: SHELF_TOP + (SHELF_H - 26) / 2, w: cw, h: 26 });
    x += cw + 10;
  }
  return out;
}

/** 모서리를 둥글린 꺾은선을 점으로 편다 — 선이 뻗는 운동이 앞에서부터 잘라 그린다. */
function roundedPolyline(corners: readonly Pt[], radius: number): Pt[] {
  const out: Pt[] = [];
  const first = corners[0];
  if (first === undefined) return out;
  out.push(first);
  for (let i = 1; i < corners.length - 1; i += 1) {
    const a = corners[i - 1];
    const b = corners[i];
    const c = corners[i + 1];
    if (a === undefined || b === undefined || c === undefined) continue;
    const la = Math.hypot(b.x - a.x, b.y - a.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, la / 2, lc / 2);
    if (r <= 0) {
      out.push(b);
      continue;
    }
    const p0 = { x: b.x + ((a.x - b.x) / la) * r, y: b.y + ((a.y - b.y) / la) * r };
    const p2 = { x: b.x + ((c.x - b.x) / lc) * r, y: b.y + ((c.y - b.y) / lc) * r };
    for (let k = 0; k <= 6; k += 1) {
      const s = k / 6;
      out.push({
        x: (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * b.x + s * s * p2.x,
        y: (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * b.y + s * s * p2.y,
      });
    }
  }
  const last = corners[corners.length - 1];
  if (last !== undefined && corners.length > 1) out.push(last);
  return out;
}

function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k <= n; k += 1) {
    const s = k / n;
    const u = 1 - s;
    out.push({
      x: u * u * u * a.x + 3 * u * u * s * c1.x + 3 * u * s * s * c2.x + s * s * s * b.x,
      y: u * u * u * a.y + 3 * u * u * s * c1.y + 3 * u * s * s * c2.y + s * s * s * b.y,
    });
  }
  return out;
}

/**
 * 빈 자리에서 정의까지의 길. 이웃 파일이면 틈을 건너는 곡선, 사이에 파일이 끼면 파일 밑 골을 따라 돈다.
 * lane 은 골 안의 줄 — 골을 도는 선이 겹치지 않게.
 */
function linkPath(lay: Layout, link: HoleLink, lane: number): Pt[] {
  const hb = rowBox(lay, link.hole);
  const db = rowBox(lay, link.def);
  const hy = hb.y + hb.h / 2;
  const dy = db.y + db.h / 2;
  const cardLeft = (f: number): number => colX(lay, f);
  const cardRight = (f: number): number => colX(lay, f) + lay.cardW;
  const dist = link.def.file - link.hole.file;
  if (dist === 0) {
    const x = cardRight(link.hole.file);
    return cubic({ x, y: hy }, { x: x + COL_GAP * 0.7, y: hy }, { x: x + COL_GAP * 0.7, y: dy }, { x, y: dy }, 18);
  }
  const rightward = dist > 0;
  const hx = rightward ? cardRight(link.hole.file) : cardLeft(link.hole.file);
  const dx = rightward ? cardLeft(link.def.file) : cardRight(link.def.file);
  if (Math.abs(dist) === 1) {
    const bend = (dx - hx) * 0.55;
    return cubic({ x: hx, y: hy }, { x: hx + bend, y: hy }, { x: dx - bend, y: dy }, { x: dx, y: dy }, 18);
  }
  const g1 = hx + (rightward ? COL_GAP / 2 : -COL_GAP / 2);
  const g2 = dx + (rightward ? -COL_GAP / 2 : COL_GAP / 2);
  const laneY = lay.cardsBottom + 12 + lane * LANE_GAP;
  return roundedPolyline(
    [
      { x: hx, y: hy },
      { x: g1, y: hy },
      { x: g1, y: laneY },
      { x: g2, y: laneY },
      { x: g2, y: dy },
      { x: dx, y: dy },
    ],
    7,
  );
}

/** 앞에서부터 길이의 몫 part 만큼 자른 점들. */
function partOf(points: readonly Pt[], part: number): Pt[] {
  if (part >= 1) return [...points];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const goal = total * Math.max(0, part);
  const out: Pt[] = [];
  const first = points[0];
  if (first === undefined) return out;
  out.push(first);
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (run + seg >= goal) {
      const s = seg === 0 ? 0 : (goal - run) / seg;
      out.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
      return out;
    }
    run += seg;
    out.push(b);
  }
  return out;
}

function pointsAttr(points: readonly Pt[]): string {
  return points.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
}

/** 골을 도는 선마다 줄을 준다 — 선은 덧붙기만 하므로 앞 선의 줄은 바뀌지 않는다. */
function lanesOf(links: readonly HoleLink[]): number[] {
  let lane = 0;
  return links.map((l) => {
    if (Math.abs(l.def.file - l.hole.file) > 1) {
      lane += 1;
      return lane - 1;
    }
    return 0;
  });
}

/** 선 i 의 골 줄. 줄 목록이 선 목록과 어긋나면 던진다. */
function laneAt(lanes: readonly number[], i: number): number {
  const lane = lanes[i];
  if (lane === undefined) throw new Error(`resolve-symbols-stage: 선 ${i} 의 골 줄이 없다`);
  return lane;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

interface Handles {
  /** 선 — links 의 차례 */
  readonly links: SVGPolylineElement[];
  readonly linkEnds: SVGCircleElement[][];
  /** 기다림 쪽지 — 자리 열쇠 */
  readonly chips: Map<string, SVGGElement>;
  readonly motion: SVGGElement;
}

function drawChip(parent: Element, files: readonly ObjectFile[], w: WaitingHole, box: Box, c: Palette): SVGGElement {
  const g = el('g', {}, parent);
  el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 13, fill: c.itemComparing }, g);
  label(g, box.x + 12, box.y + box.h / 2, w.name, {
    size: fontSizes.xs,
    fill: c.stateInk,
    family: fonts.mono,
    weight: '700',
  });
  label(g, box.x + box.w - 10, box.y + box.h / 2, fileName(files, w.ref.file), {
    size: fontSizes.xs,
    fill: c.stateInk,
    family: fonts.mono,
    anchor: 'end',
  });
  return g;
}

function captionOf(scene: ResolveSymbolsScene, t: Translate): string {
  const s = scene.step;
  if (s.kind === 'start') return t('caption.start', 'The linker reads the files in order. Each U entry is a hole to fill.');
  const file = fileName(scene.files, s.at.file);
  if (s.kind === 'define') {
    if (s.filled.length === 0) {
      return t('caption.define', '{file} defines {name}. No hole was waiting for it.', { file, name: s.name });
    }
    return t('caption.defineFill', '{file} defines {name}. Holes filled by this definition: {n}', {
      file,
      name: s.name,
      n: s.filled.length,
    });
  }
  if (s.def === null) {
    return t('caption.wait', '{file} uses {name}, not defined yet. The hole waits.', { file, name: s.name });
  }
  return t('caption.now', '{file} uses {name}, already defined in {def}. Filled at once.', {
    file,
    name: s.name,
    def: fileName(scene.files, s.def.file),
  });
}

export const resolveSymbolsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function drawStatic(scene: ResolveSymbolsScene): Handles {
      svg.textContent = '';
      const files = scene.files;
      const lay = layoutOf(files);
      const cursorOrder = scene.cursor === null ? -1 : orderOf(files, scene.cursor);
      const step = scene.step;
      const fresh = new Set<number>();
      if (step.kind === 'define') {
        scene.links.forEach((l, i) => {
          if (sameRef(l.def, step.at) && step.filled.some((f) => sameRef(f.ref, l.hole))) fresh.add(i);
        });
      } else if (step.kind === 'use' && step.def !== null) {
        fresh.add(scene.links.length - 1);
      }

      label(svg, MARGIN, CAPTION_Y, captionOf(scene, t), { size: fontSizes.md, fill: c.text });

      // 파일 — 링커가 읽는 차례로 나란히
      const cards = el('g', {}, svg);
      files.forEach((f, fi) => {
        const x = colX(lay, fi);
        const h = HEAD_H + f.entries.length * lay.rowH + CARD_PAD;
        const reading = scene.cursor !== null && scene.cursor.file === fi;
        const started = scene.cursor !== null && scene.cursor.file >= fi;
        el('rect', { x, y: CARD_Y, width: lay.cardW, height: h, rx: 6, fill: c.bg, stroke: c.border }, cards);
        label(cards, x + 10, CARD_Y + HEAD_H / 2, f.name, {
          size: fontSizes.sm,
          fill: started ? c.text : c.textMuted,
          family: fonts.mono,
          weight: '700',
        });
        if (reading) el('rect', { x: x + 1, y: CARD_Y + HEAD_H - 3, width: lay.cardW - 2, height: 3, fill: c.accent }, cards);

        f.entries.forEach((e, ei) => {
          const ref = { file: fi, entry: ei };
          const b = rowBox(lay, ref);
          const ord = orderOf(files, ref);
          const read = ord <= cursorOrder;
          const current = ord === cursorOrder;
          const waiting = scene.waiting.some((w) => sameRef(w.ref, ref));
          const link = scene.links.find((l) => sameRef(l.hole, ref));
          let fill = 'none';
          let stroke = c.border;
          let ink = c.textMuted;
          let dash = e.kind === 'U' ? '4 3' : '';
          if (current) {
            fill = c.accent;
            stroke = c.accent;
            ink = c.stateInk;
          } else if (read && e.kind === 'D') {
            fill = c.bgSubtle;
            stroke = c.text;
            ink = c.text;
          } else if (read && waiting) {
            stroke = c.itemComparing;
            ink = c.itemComparing;
          } else if (read) {
            stroke = c.text;
            ink = c.text;
            dash = '';
          }
          if (current && waiting) {
            stroke = c.itemComparing;
          }
          el(
            'rect',
            {
              x: b.x,
              y: b.y,
              width: b.w,
              height: b.h,
              rx: 4,
              fill,
              stroke,
              'stroke-width': waiting ? 1.6 : 1,
              ...(dash === '' ? {} : { 'stroke-dasharray': dash }),
            },
            cards,
          );
          label(cards, b.x + 10, b.y + b.h / 2, e.kind, {
            size: fontSizes.sm,
            fill: ink,
            family: fonts.mono,
            weight: '700',
          });
          label(cards, b.x + 10 + MONO_SM * MONO_ADV * 2, b.y + b.h / 2, e.name, {
            size: fontSizes.sm,
            fill: ink,
            family: fonts.mono,
          });
          if (link !== undefined) {
            label(cards, b.x + b.w - 8, b.y + b.h / 2, fileName(files, link.def.file), {
              size: fontSizes.xs,
              fill: current ? c.stateInk : c.textMuted,
              family: fonts.mono,
              anchor: 'end',
            });
          }
        });
      });

      // 선 — 메운 자리에서 정의까지
      const wires = el('g', { fill: 'none' }, svg);
      const lanes = lanesOf(scene.links);
      const linkEls: SVGPolylineElement[] = [];
      const linkEnds: SVGCircleElement[][] = [];
      scene.links.forEach((l, i) => {
        const pts = linkPath(lay, l, laneAt(lanes, i));
        const width = fresh.has(i) ? 2.4 : 1.4;
        linkEls.push(
          el(
            'polyline',
            {
              points: pointsAttr(pts),
              stroke: c.primary,
              'stroke-width': width,
              'stroke-linejoin': 'round',
            },
            wires,
          ),
        );
        const a = pts[0];
        const z = pts[pts.length - 1];
        const ends: SVGCircleElement[] = [];
        if (a !== undefined) ends.push(el('circle', { cx: a.x, cy: a.y, r: 3.2, fill: c.bg, stroke: c.primary, 'stroke-width': 1.4 }, wires));
        if (z !== undefined) ends.push(el('circle', { cx: z.x, cy: z.y, r: 3.2, fill: c.primary }, wires));
        linkEnds.push(ends);
      });

      // 기다림 줄
      const shelf = el('g', {}, svg);
      const shelfW = W - 2 * lay.x0;
      el(
        'rect',
        {
          x: lay.x0,
          y: SHELF_TOP,
          width: shelfW,
          height: SHELF_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-dasharray': '5 4',
        },
        shelf,
      );
      label(shelf, lay.x0 + 12, SHELF_TOP + SHELF_H / 2, t('label.waiting', 'Waiting: {n}', { n: scene.waiting.length }), {
        size: fontSizes.sm,
        fill: scene.waiting.length > 0 ? c.text : c.textMuted,
      });
      const slots = shelfSlots(lay, files, scene.waiting);
      const chips = new Map<string, SVGGElement>();
      for (const w of scene.waiting) {
        const box = slots.get(refKey(w.ref));
        if (box === undefined) throw new Error('resolve-symbols-stage: 쪽지 자리가 없다');
        chips.set(refKey(w.ref), drawChip(shelf, files, w, box, c));
      }

      label(
        svg,
        MARGIN,
        STATUS_Y,
        t('label.filled', 'Holes filled: {filled} / {total}', { filled: scene.links.length, total: countHoles(files) }),
        { size: fontSizes.sm, fill: c.textMuted },
      );

      const motion = el('g', {}, svg);
      return { links: linkEls, linkEnds, chips, motion };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
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
    }

    /** 한 시계로 흘린다 — frame(p) 를 0 에서 1 까지. 세대가 바뀌면 손대지 않고 물러난다. */
    async function run(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / 16));
      for (let k = 1; k <= frames; k += 1) {
        await wait(ms / frames);
        if (mine !== gen || destroyed) return false;
        frame(k / frames);
      }
      return true;
    }

    function setLinkPart(h: Handles, lay: Layout, links: readonly HoleLink[], i: number, part: number): void {
      const line = h.links[i];
      const link = links[i];
      if (line === undefined || link === undefined) throw new Error('resolve-symbols-stage: 선이 없다');
      const pts = partOf(linkPath(lay, link, laneAt(lanesOf(links), i)), part);
      line.setAttribute('points', pointsAttr(pts));
      const ends = h.linkEnds[i];
      const tip = ends === undefined ? undefined : ends[1];
      if (tip !== undefined) {
        if (part >= 1) tip.removeAttribute('visibility');
        else tip.setAttribute('visibility', 'hidden');
      }
    }

    return {
      async render(next: ResolveSymbolsScene, _prev: ResolveSymbolsScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        const files = next.files;
        const lay = layoutOf(files);

        if (step.kind === 'use' && step.def === null) {
          // 이름 쪽지가 빈 자리에서 떨어져 기다림 줄 끝에 선다
          const chip = h.chips.get(refKey(step.at));
          const box = shelfSlots(lay, files, next.waiting).get(refKey(step.at));
          if (chip === undefined || box === undefined) throw new Error('resolve-symbols-stage: 기다림 쪽지가 없다');
          const from = rowBox(lay, step.at);
          const dx = from.x + 20 - box.x;
          const dy = from.y + from.h / 2 - (box.y + box.h / 2);
          const frame = (p: number): void => {
            const q = 1 - ease(p);
            if (q <= 0) chip.removeAttribute('transform');
            else chip.setAttribute('transform', `translate(${r1(dx * q)},${r1(dy * q)})`);
          };
          frame(0);
          if (!(await run(DROP_MS, mine, frame))) return;
        } else if (step.kind === 'use' && step.def !== null) {
          // 이미 있던 정의로 곧바로 선이 뻗는다
          const i = next.links.length - 1;
          const frame = (p: number): void => setLinkPart(h, lay, next.links, i, ease(p));
          frame(0);
          if (!(await run(REACH_MS, mine, frame))) return;
        } else if (step.kind === 'define' && step.filled.length > 0) {
          // 기다리던 쪽지가 정의로 날아가 닿고, 남은 쪽지는 앞으로 당겨지고, 빈 자리에서 정의까지 선이 뻗는다
          const oldSlots = shelfSlots(lay, files, step.before);
          const newSlots = shelfSlots(lay, files, next.waiting);
          const target = rowBox(lay, step.at);
          const ghosts = step.filled.map((w) => {
            const box = oldSlots.get(refKey(w.ref));
            if (box === undefined) throw new Error('resolve-symbols-stage: 떠나는 쪽지 자리가 없다');
            return { g: drawChip(h.motion, files, w, box, c), dx: target.x + target.w - box.w - 4 - box.x, dy: target.y + target.h / 2 - (box.y + box.h / 2) };
          });
          const slides = next.waiting.map((w) => {
            const was = oldSlots.get(refKey(w.ref));
            const now = newSlots.get(refKey(w.ref));
            const chip = h.chips.get(refKey(w.ref));
            if (was === undefined || now === undefined || chip === undefined) throw new Error('resolve-symbols-stage: 남은 쪽지 자리가 없다');
            return { chip, dx: was.x - now.x };
          });
          const fillIdx: number[] = [];
          next.links.forEach((l, i) => {
            if (sameRef(l.def, step.at) && step.filled.some((f) => sameRef(f.ref, l.hole))) fillIdx.push(i);
          });
          const frame = (p: number): void => {
            const a = ease(Math.min(1, p / 0.5));
            const b = ease(Math.max(0, (p - 0.5) / 0.5));
            for (const gh of ghosts) {
              if (a >= 1) gh.g.setAttribute('visibility', 'hidden');
              else gh.g.setAttribute('transform', `translate(${r1(gh.dx * a)},${r1(gh.dy * a)})`);
            }
            for (const s of slides) {
              const q = 1 - a;
              if (q <= 0) s.chip.removeAttribute('transform');
              else s.chip.setAttribute('transform', `translate(${r1(s.dx * q)},0)`);
            }
            for (const i of fillIdx) setLinkPart(h, lay, next.links, i, b);
          };
          frame(0);
          if (!(await run(MEET_MS, mine, frame))) return;
        } else {
          return;
        }
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
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
