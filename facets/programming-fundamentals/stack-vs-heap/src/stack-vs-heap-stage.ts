import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { SceneFrame, SceneVal, StackVsHeapScene } from './scene.js';

/**
 * 스택과 힙 — 걷히는 틀과 남는 칸.
 *
 * 왼쪽에 프로그램, 가운데에 아래에서 위로 쌓이는 스택, 오른쪽에 힙. 부르면 틀이 위에서 내려와
 * 스택 꼭대기에 얹히고, 돌려주면 틀이 통째로 들려 올라가 사라지며 꼭대기 선이 부르기 전 높이로
 * 내려온다. 힙 칸은 빌린 자리에서 자라나 그 자리에 그대로 남고, 그것을 잇는 것은 이름 칸에서
 * 뻗은 화살 하나뿐이다.
 */

const H = 300;
const W = PIECE_CANVAS_W;
const MOVE_MS = 420;
const SVG = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CAP1_Y = 22;
const CAP2_Y = 42;
const TITLE_Y = 74;
const CODE_TOP = 88;
const FOOT_Y = H - 14;
/** 스택 · 힙 글자와 칸 크기의 상한. 실제 크기는 캔버스에서 역산한다. */
const SLOT_H_MAX = 28;
const HEAD_H = 16;
const FRAME_GAP = 6;
const CELL_MAX = 48;

const SMALL = parseFloat(fontSizes.sm);
const TINY = parseFloat(fontSizes.xs);
const CHAR_W = SMALL * 0.6;

const r1 = (x: number): number => {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v;
};

type Box = { x: number; y: number; w: number; h: number };
type SlotBox = { name: string; addr: number; y: number; h: number; vx: number; vw: number };
type FrameBox = Box & { fn: string; slots: SlotBox[] };

/** 자리 셈 — 장면만 보고 정해진다. */
function geometry(scene: StackVsHeapScene) {
  const codeW = W * 0.36;
  const stackX = PAD + codeW + 8;
  const stackW = W * 0.26;
  const heapX = stackX + stackW + 44;
  const heapW = W - PAD - heapX;
  const stackBottom = FOOT_Y - 26;
  const stackCeil = TITLE_Y + 22;
  const nLines = Math.max(1, scene.lines.length);
  const lineH = Math.min(26, (stackBottom - CODE_TOP) / nLines);
  const cellGap = 14;
  const perRow = 3;
  const cellW = Math.min(CELL_MAX, (heapW - cellGap * (perRow - 1)) / perRow);
  return { codeW, stackX, stackW, heapX, heapW, stackBottom, stackCeil, lineH, cellW, cellGap, perRow };
}
type Geo = ReturnType<typeof geometry>;

/** 틀을 아래에서 위로 쌓는다. 칸 높이는 가진 칸 수에서 역산하되 상한을 둔다. */
function stackBoxes(frames: SceneFrame[], g: Geo): { boxes: FrameBox[]; top: number } {
  const slots = frames.reduce((n, f) => n + f.slots.length, 0);
  const room = g.stackBottom - g.stackCeil - frames.length * (HEAD_H + FRAME_GAP);
  const slotH = Math.min(SLOT_H_MAX, slots > 0 ? room / slots : SLOT_H_MAX);
  const boxes: FrameBox[] = [];
  let bottom = g.stackBottom;
  for (const f of frames) {
    const h = HEAD_H + f.slots.length * slotH;
    const top = bottom - h;
    const vw = Math.min(52, g.stackW * 0.36);
    const slotBoxes = f.slots.map((s, i) => ({
      name: s.name,
      addr: s.addr,
      y: bottom - (i + 1) * slotH,
      h: slotH,
      vx: g.stackX + g.stackW - vw - 8,
      vw,
    }));
    boxes.push({ x: g.stackX, y: top, w: g.stackW, h, fn: f.fn, slots: slotBoxes });
    bottom = top - FRAME_GAP;
  }
  return { boxes, top: boxes.length > 0 ? boxes[boxes.length - 1]!.y : g.stackBottom };
}

function cellBox(i: number, g: Geo): Box {
  const col = i % g.perRow;
  const row = Math.floor(i / g.perRow);
  const h = g.cellW * 0.8;
  // 힙은 차례로 쌓이지 않는다 — 칸마다 높이를 어긋나게 두어 흩어진 자리로 읽히게 한다
  const base = (g.stackCeil + g.stackBottom) / 2 + 6;
  const y = base - row * (h * 2 + 60) - (col % 2) * (h + 24);
  return { x: g.heapX + col * (g.cellW + g.cellGap), y, w: g.cellW, h };
}

function show(v: SceneVal | null): string {
  if (!v) return '';
  if (v.k === 'num') return String(v.n);
  if (v.k === 'addr') return String(v.a);
  return 'null';
}

function same(a: SceneVal | null, b: SceneVal | null): boolean {
  return a !== null && b !== null && show(a) === show(b) && a.k === b.k;
}

const ease = (k: number): number => 1 - (1 - k) * (1 - k);

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

type Refs = {
  cursor: SVGRectElement | null;
  frames: SVGGElement[];
  marker: SVGGElement;
  cells: Map<number, SVGGElement>;
  cellText: Map<number, SVGTextElement>;
  arrows: Map<number, SVGPathElement>;
  outText: SVGTextElement[];
  fx: SVGGElement;
};

function lineY(i: number, g: Geo): number {
  return CODE_TOP + i * g.lineH;
}

function caption(scene: StackVsHeapScene, t: Translate): [string, string] {
  const s = scene.step;
  if (!s) {
    const empty = scene.frames.reduce((n, f) => n + f.slots.filter((x) => x.value === null).length, 0);
    return [t('caption.start', 'Start. Empty slots: {n}', { n: empty }), ''];
  }
  const topFrame = scene.frames[scene.frames.length - 1];
  const stand = (): string => {
    const slots = topFrame?.slots ?? [];
    return t('caption.stand', 'A {fn} frame stands on the stack — slots {lo} to {hi}.', {
      fn: topFrame?.fn ?? '',
      lo: slots[0]?.addr ?? 0,
      hi: slots[slots.length - 1]?.addr ?? 0,
    });
  };
  switch (s.kind) {
    case 'call':
      return [t('caption.call', 'Calling: {call}', { call: `${s.fn}(${s.args.map(show).join(', ')})` }), ''];
    case 'assign': {
      const second =
        s.alloc !== null
          ? t('caption.alloc', 'Borrowed from the heap: cell {addr}. {name} = {addr}', { addr: s.alloc, name: s.name })
          : t('caption.assign', '{name} = {value}', { name: s.name, value: show(s.value) });
      return s.stood ? [stand(), second] : [second, ''];
    }
    case 'store': {
      const line = t('caption.store', 'Into heap cell {addr}: {value}', { addr: s.addr, value: show(s.value) });
      return s.stood ? [stand(), line] : [line, ''];
    }
    case 'return': {
      const line = t('caption.return', 'Returning: {value}', { value: show(s.value) });
      return s.stood ? [stand(), line] : [line, ''];
    }
    case 'finish': {
      const gone = t('caption.gone', 'The {fn} frame is taken down, slots and all.', { fn: s.was.fn });
      const v = s.value;
      if (v.k === 'addr') {
        const held = scene.heap.find((c) => c.addr === v.a)?.value ?? null;
        return [
          gone,
          t('caption.finish', '{name} = {value} · heap cell {value} holds: {held}', {
            name: s.name,
            value: show(v),
            held: show(held),
          }),
        ];
      }
      return [gone, t('caption.assign', '{name} = {value}', { name: s.name, value: show(v) })];
    }
    case 'show': {
      const hop = s.hops[s.hops.length - 1];
      const line = hop
        ? t('caption.show', 'Followed the address to heap cell {addr}. Output: {value}', {
            addr: hop.addr,
            value: show(s.value),
          })
        : t('caption.out', 'Output: {value}', { value: show(s.value) });
      return s.stood ? [stand(), line] : [line, ''];
    }
  }
}

export const stackVsHeapStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: StackVsHeapScene): Refs {
      svg.textContent = '';
      const g = geometry(scene);
      const s = scene.step;
      const root = el(svg, 'g', {});

      const [c1, c2] = caption(scene, t);
      el(root, 'text', { x: PAD, y: CAP1_Y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, c1);
      if (c2) el(root, 'text', { x: PAD, y: CAP2_Y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm }, c2);

      // ── 프로그램
      let cursor: SVGRectElement | null = null;
      if (s) {
        cursor = el(root, 'rect', {
          x: PAD,
          y: lineY(s.line, g),
          width: g.codeW,
          height: g.lineH - 3,
          rx: 3,
          fill: c.accent,
          opacity: 0.35,
        });
      }
      scene.lines.forEach((ln, i) => {
        el(
          root,
          'text',
          {
            x: PAD + 8 + ln.indent * 4 * CHAR_W,
            y: lineY(i, g) + g.lineH / 2 + SMALL * 0.35 - 1,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'xml:space': 'preserve',
          },
          ln.text,
        );
      });

      // ── 제목 · 셈
      const stackMid = g.stackX + g.stackW / 2;
      const heapMid = g.heapX + g.heapW / 2;
      const title = { fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'text-anchor': 'middle' };
      el(root, 'text', { ...title, x: stackMid, y: TITLE_Y }, t('title.stack', 'Stack'));
      el(root, 'text', { ...title, x: heapMid, y: TITLE_Y }, t('title.heap', 'Heap'));
      const slotCount = scene.frames.reduce((n, f) => n + f.slots.length, 0);
      const foot = { fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'text-anchor': 'middle' };
      el(root, 'text', { ...foot, x: stackMid, y: FOOT_Y }, t('count.stack', 'Stack slots: {n}', { n: slotCount }));
      // 힙 셈은 문안이 길다(열 언어 중 가장 긴 것이 힙 폭을 넘는다) — 오른쪽 끝에 맞춘다
      el(root, 'text', { ...foot, x: W - PAD, y: FOOT_Y, 'text-anchor': 'end' }, t('count.heap', 'Heap cells in use: {n}', { n: scene.heap.length }));

      // ── 출력
      el(
        root,
        'text',
        { x: PAD + 64, y: FOOT_Y, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'text-anchor': 'end' },
        t('label.output', 'Output'),
      );
      const outText = scene.out.map((v, i) =>
        el(
          root,
          'text',
          {
            x: PAD + 74 + i * 40,
            y: FOOT_Y,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': s?.kind === 'show' && i === scene.out.length - 1 ? 'bold' : 'normal',
          },
          show(v),
        ),
      );

      // ── 힙
      const lit = new Set<number>();
      if (s?.kind === 'assign' && s.alloc !== null) lit.add(s.alloc);
      if (s?.kind === 'store') lit.add(s.addr);
      if (s?.kind === 'finish' && s.value.k === 'addr') lit.add(s.value.a);
      if (s?.kind === 'show') for (const h of s.hops) lit.add(h.addr);
      const cells = new Map<number, SVGGElement>();
      const cellText = new Map<number, SVGTextElement>();
      const cellAt = new Map<number, Box>();
      scene.heap.forEach((cell, i) => {
        const b = cellBox(i, g);
        cellAt.set(cell.addr, b);
        const grp = el(root, 'g', {});
        el(grp, 'rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 4,
          fill: c.bgSubtle,
          stroke: lit.has(cell.addr) ? c.itemActive : c.textMuted,
          'stroke-width': lit.has(cell.addr) ? 2.5 : 1.2,
        });
        cellText.set(
          cell.addr,
          el(
            grp,
            'text',
            {
              x: b.x + b.w / 2,
              y: b.y + b.h / 2 + 5,
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'text-anchor': 'middle',
            },
            show(cell.value),
          ),
        );
        el(
          grp,
          'text',
          {
            x: b.x + b.w / 2,
            y: b.y + b.h + TINY + 3,
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
          },
          String(cell.addr),
        );
        cells.set(cell.addr, grp);
      });

      // ── 스택
      const { boxes, top } = stackBoxes(scene.frames, g);
      const litSlot = new Set<number>();
      const topFrame = scene.frames[scene.frames.length - 1];
      const bottomFrame = scene.frames[0];
      const slotOf = (f: SceneFrame | undefined, name: string): number | undefined =>
        f?.slots.find((x) => x.name === name)?.addr;
      if (s?.kind === 'assign') {
        const a = slotOf(topFrame, s.name);
        if (a !== undefined) litSlot.add(a);
      }
      if (s?.kind === 'finish') {
        const a = slotOf(bottomFrame, s.name);
        if (a !== undefined) litSlot.add(a);
      }
      const frames: SVGGElement[] = [];
      const arrows = new Map<number, SVGPathElement>();
      const arrowLayer = el(root, 'g', {});
      boxes.forEach((b, fi) => {
        const f = scene.frames[fi]!;
        const grp = el(root, 'g', {});
        frames.push(grp);
        drawFrame(grp, b, f, litSlot);
        f.slots.forEach((slot, si) => {
          const v = slot.value;
          const sb = b.slots[si]!;
          if (v?.k !== 'addr') return;
          const target = cellAt.get(v.a);
          if (!target) return;
          arrows.set(slot.addr, arrow(arrowLayer, sb.vx + sb.vw, sb.y + sb.h / 2, target.x, target.y + target.h / 2));
        });
      });

      const marker = el(root, 'g', {});
      el(marker, 'line', {
        x1: g.stackX - 6,
        x2: g.stackX + g.stackW + 6,
        y1: top - 3,
        y2: top - 3,
        stroke: c.textMuted,
        'stroke-width': 1.2,
        'stroke-dasharray': '4 3',
      });
      el(
        marker,
        'text',
        { x: g.stackX, y: top - 7, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
        t('label.top', 'top'),
      );

      const fx = el(root, 'g', {});
      return { cursor, frames, marker, cells, cellText, arrows, outText, fx };
    }

    function drawFrame(grp: SVGGElement, b: FrameBox, f: SceneFrame, litSlot: Set<number>): void {
      el(grp, 'rect', {
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
        rx: 4,
        fill: c.bgSubtle,
        stroke: f.fn === '' ? c.border : c.primary,
        'stroke-width': f.fn === '' ? 1.2 : 1.8,
      });
      el(
        grp,
        'text',
        { x: b.x + 8, y: b.y + HEAD_H - 4, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
        f.fn === '' ? t('label.outer', 'outer') : f.fn,
      );
      f.slots.forEach((slot, si) => {
        const sb = b.slots[si]!;
        const mid = sb.y + sb.h / 2;
        el(
          grp,
          'text',
          { x: b.x + 8, y: mid + 4, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
          String(slot.addr),
        );
        el(
          grp,
          'text',
          { x: b.x + 8 + TINY * 2.6, y: mid + 4, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm },
          slot.name,
        );
        const lit = litSlot.has(slot.addr);
        el(grp, 'rect', {
          x: sb.vx,
          y: sb.y + 3,
          width: sb.vw,
          height: sb.h - 6,
          rx: 3,
          fill: c.bg,
          stroke: lit ? c.itemActive : c.border,
          'stroke-width': lit ? 2.2 : 1,
          ...(slot.value === null ? { 'stroke-dasharray': '3 3' } : {}),
        });
        if (slot.value !== null) {
          el(
            grp,
            'text',
            {
              x: sb.vx + sb.vw / 2,
              y: mid + 4,
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
            },
            show(slot.value),
          );
        }
      });
    }

    function arrow(layer: SVGGElement, x1: number, y1: number, x2: number, y2: number): SVGPathElement {
      const bend = Math.max(24, (x2 - x1) * 0.5);
      const d = `M ${r1(x1)} ${r1(y1)} C ${r1(x1 + bend)} ${r1(y1)}, ${r1(x2 - bend)} ${r1(y2)}, ${r1(x2 - 6)} ${r1(y2)}`;
      const p = el(layer, 'path', { d, fill: 'none', stroke: c.primary, 'stroke-width': 1.6 });
      el(layer, 'path', {
        d: `M ${r1(x2)} ${r1(y2)} L ${r1(x2 - 7)} ${r1(y2 - 4)} L ${r1(x2 - 7)} ${r1(y2 + 4)} Z`,
        fill: c.primary,
      });
      return p;
    }

    function token(fx: SVGGElement, text: string): (x: number, y: number) => void {
      const w = Math.max(22, text.length * CHAR_W + 10);
      const grp = el(fx, 'g', {});
      el(grp, 'rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 10, fill: c.accent });
      el(
        grp,
        'text',
        { x: 0, y: 4, fill: c.stateInk, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'middle' },
        text,
      );
      return (x, y) => grp.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
    }

    function wait(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    /** 이번 걸음의 운동 — 요소는 이미 끝 자리에 서 있고, 운동은 아직 못 온 만큼을 그린다. */
    function motions(scene: StackVsHeapScene, refs: Refs): ((k: number) => void)[] {
      const s = scene.step;
      if (!s) return [];
      const g = geometry(scene);
      const out: ((k: number) => void)[] = [];
      const setT = (e: Element, dx: number, dy: number): void => {
        e.setAttribute('transform', `translate(${r1(dx)} ${r1(dy)})`);
      };

      // 읽는 자리가 줄을 건너간다
      if (refs.cursor && s.fromLine !== null && s.fromLine !== s.line) {
        const d = lineY(s.fromLine, g) - lineY(s.line, g);
        const cur = refs.cursor;
        out.push((k) => setT(cur, 0, d * (1 - k)));
      }

      const { boxes, top } = stackBoxes(scene.frames, g);
      const valueCenter = (fb: FrameBox | undefined, name: string): [number, number] | null => {
        const sb = fb?.slots.find((x) => x.name === name);
        return sb ? [sb.vx + sb.vw / 2, sb.y + sb.h / 2] : null;
      };
      const cellCenter = (addr: number): [number, number] | null => {
        const i = scene.heap.findIndex((x) => x.addr === addr);
        if (i < 0) return null;
        const b = cellBox(i, g);
        return [b.x + b.w / 2, b.y + b.h / 2];
      };
      const growCell = (addr: number): void => {
        const grp = refs.cells.get(addr);
        const at = cellCenter(addr);
        if (!grp || !at) return;
        out.push((k) => {
          const q = Math.max(0.02, k);
          grp.setAttribute(
            'transform',
            `translate(${r1(at[0])} ${r1(at[1])}) scale(${r1(q * 100) / 100}) translate(${r1(-at[0])} ${r1(-at[1])})`,
          );
        });
      };
      const drawIn = (slotAddr: number, from: number): void => {
        const p = refs.arrows.get(slotAddr);
        if (!p) return;
        p.setAttribute('pathLength', '1');
        p.setAttribute('stroke-dasharray', '1');
        out.push((k) => {
          const q = Math.max(0, Math.min(1, (k - from) / (1 - from)));
          p.setAttribute('stroke-dashoffset', String(r1((1 - q) * 100) / 100));
        });
      };
      const fly = (text: string, path: [number, number][], hide?: Element): void => {
        if (path.length < 2) return;
        const move = token(refs.fx, text);
        if (hide) hide.setAttribute('opacity', '0');
        out.push((k) => {
          const seg = Math.min(path.length - 2, Math.floor(k * (path.length - 1)));
          const local = k * (path.length - 1) - seg;
          const a = path[seg]!;
          const b = path[seg + 1]!;
          move(a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local);
          if (hide && k >= 1) hide.removeAttribute('opacity');
        });
      };

      // 틀이 선다 — 위에서 내려와 꼭대기에 얹힌다
      const stood = 'stood' in s && s.stood;
      if (stood && refs.frames.length > 0) {
        const grp = refs.frames[refs.frames.length - 1]!;
        const below = stackBoxes(scene.frames.slice(0, -1), g).top;
        const marker = refs.marker;
        out.push((k) => {
          setT(grp, 0, -34 * (1 - k));
          grp.setAttribute('opacity', String(r1(k * 100) / 100));
          setT(marker, 0, (below - top) * (1 - k));
        });
      }

      const topBox = boxes[boxes.length - 1];
      switch (s.kind) {
        case 'assign': {
          if (s.alloc !== null) {
            growCell(s.alloc);
            const slot = scene.frames[scene.frames.length - 1]?.slots.find((x) => x.name === s.name);
            if (slot) drawIn(slot.addr, 0.4);
          }
          break;
        }
        case 'store': {
          const src = s.from !== null ? valueCenter(topBox, s.from) : null;
          const dst = cellCenter(s.addr);
          if (src && dst) fly(show(s.value), [src, dst], refs.cellText.get(s.addr));
          break;
        }
        case 'finish': {
          // 걷힌 틀 — 지금 쌓인 틀 위, 있던 자리에서 들려 올라가 사라진다
          const withWas = stackBoxes([...scene.frames, s.was], g);
          const wasBox = withWas.boxes[withWas.boxes.length - 1]!;
          const ghost = el(refs.fx, 'g', {});
          drawFrame(ghost, wasBox, s.was, new Set());
          const marker = refs.marker;
          out.push((k) => {
            setT(ghost, 0, -40 * k);
            ghost.setAttribute('opacity', String(r1((1 - k) * 100) / 100));
            setT(marker, 0, (withWas.top - top) * (1 - k));
          });
          const fromSlot = s.was.slots.find((x) => same(x.value, s.value));
          const src = fromSlot ? valueCenter(wasBox, fromSlot.name) : null;
          const dst = valueCenter(boxes[0], s.name);
          const dstSlot = scene.frames[0]?.slots.find((x) => x.name === s.name);
          if (src && dst) fly(show(s.value), [src, dst]);
          if (dstSlot) drawIn(dstSlot.addr, 0.55);
          break;
        }
        case 'show': {
          const path: [number, number][] = [];
          const first = s.hops[0];
          if (first) {
            const holder = scene.frames[0]?.slots.find((x) => x.value?.k === 'addr' && x.value.a === first.addr);
            const src = holder ? valueCenter(boxes[0], holder.name) : null;
            if (src) path.push(src);
          }
          for (const h of s.hops) {
            const at = cellCenter(h.addr);
            if (at) path.push(at);
          }
          const last = refs.outText[refs.outText.length - 1];
          if (last) path.push([PAD + 74 + (refs.outText.length - 1) * 40 + 6, FOOT_Y - 5]);
          fly(show(s.value), path, last);
          break;
        }
        default:
          break;
      }
      return out;
    }

    async function render(next: StackVsHeapScene, prev: StackVsHeapScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      const refs = drawStatic(next);
      if (!opts.animate || prev === null || next.step === null) return;
      const moves = motions(next, refs);
      if (moves.length === 0) return;
      for (const m of moves) m(0);
      await wait(MOVE_MS, mine, (k) => {
        for (const m of moves) m(k);
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
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
