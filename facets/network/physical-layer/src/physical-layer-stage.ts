/**
 * physical-layer-stage — 데이터 줄 · 선 위 바이트 줄 · 전압 선 · 받는 쪽.
 *
 * 운동:
 *   - showFrame  선 위 바이트 줄이 새 데이터로 다시 선다. 데이터 속 `7E` · `7D` 는 그 아래에서 두 칸(탈출 + 되돌릴 바이트)으로
 *                갈라지고 뒤 칸들이 오른쪽으로 밀린다. 되돌리면 두 칸이 하나로 접힌다
 *   - showLine   전압 선이 반 칸마다 앞 판의 높이에서 새 판의 높이로 옮겨 가 접히고 펴진다. 선 길이 · 반 비트 눈금 ·
 *                가장 긴 평평의 띠도 함께 옮겨 간다
 *   - showRead   받는 쪽이 읽는 바이트의 틀이 앞 바이트에서 옆으로 옮겨 가고, 되찾은 바이트가 줄에 내려앉는다
 * 운동 길이는 projector 가 재생 속도로 셈해 넘긴다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';

const W = 960;
const H = 372;
const GUTTER = 104;
/** 가장 큰 판 — 선 위 12 바이트 · 반 칸 192 */
const MAX_HALF = 192;
const CW = (W - GUTTER - 16) / MAX_HALF;
const BW = CW * 16;

const Y_DATA = 18;
const Y_WIRE = 78;
const BOX_H = 26;
const Y_HIGH = 150;
const Y_LOW = 200;
const Y_TICK_TOP = 138;
const Y_TICK_BOT = 212;
const Y_FLAT_LABEL = 230;
/** 신호 칸 눈금 길이 — 맨체스터에서는 반 비트 눈금도 이만큼 자란다 */
const TICK_BIT = 14;
const Y_RECV = 256;
const Y_GOT = 296;
const Y_CAPTION = 352;

export type ByteKind = 'flag' | 'escape' | 'stuffed' | 'data';

export type FrameView = {
  data: number[];
  wire: number[];
  kinds: ByteKind[];
  dataAt: number[];
  dataSpan: number[];
};

export type LineView = {
  half: number[];
  cellsPerBit: number;
  flatStart: number;
  flatHalf: number;
  flatBits: number;
};

export type ReadView = {
  index: number;
  /** 읽은 뒤 상태. 틀이 닫힌 걸음에서는 null — 칩을 모두 끈다 */
  state: number | null;
  recovered: number[];
  sent: number[];
  closed: boolean;
};

export type PhysicalLayerStage = {
  showFrame(f: FrameView, ms: number): Promise<void>;
  showLine(l: LineView, ms: number): Promise<void>;
  showRead(r: ReadView, ms: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

export function hexByte(b: number): string {
  if (!Number.isInteger(b) || b < 0 || b > 255) throw new Error(`physical-layer-stage: 바이트가 아니다 ${b}`);
  return b.toString(16).toUpperCase().padStart(2, '0');
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  if (parent) parent.appendChild(e);
  return e;
}

type Slot = { x: number; w: number };

/** 선 위 바이트 한 칸 — 데이터 j 에서 나온 자리를 키로 둔다 (f0 · d0 · d0b · … · f1) */
type WireBox = {
  g: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
  tag: SVGTextElement;
  from: Slot;
  to: Slot;
  alive: boolean;
};

type DataBox = {
  g: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
  link: SVGPathElement;
  from: Slot;
  to: Slot;
  wireFrom: Slot;
  wireTo: Slot;
};

export const physicalLayerStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    const root = el('g', { 'font-family': fonts.body }, svg);
    const small = parseFloat(fontSizes.xs);
    const body = parseFloat(fontSizes.sm);

    // ── 줄 이름
    const rowLabel = (text: string, y: number): void => {
      const e = el('text', { x: GUTTER - 10, y, 'text-anchor': 'end', 'font-size': body, fill: c.textMuted }, root);
      e.textContent = text;
    };
    rowLabel(t('label.data', 'Sent data'), Y_DATA + BOX_H / 2 + 4);
    rowLabel(t('label.wire', 'On the wire'), Y_WIRE + BOX_H / 2 + 4);
    rowLabel(t('label.high', 'high'), Y_HIGH + 4);
    rowLabel(t('label.low', 'low'), Y_LOW + 4);
    rowLabel(t('label.receiver', 'Receiver'), Y_RECV + 15);
    rowLabel(t('label.recovered', 'Recovered'), Y_GOT + BOX_H / 2 + 4);

    // ── 층: 링크 · 칸 · 선 · 띠 · 읽는 틀
    const linkLayer = el('g', {}, root);
    const dataLayer = el('g', {}, root);
    const wireLayer = el('g', {}, root);
    const bandRect = el('rect', { y: Y_TICK_TOP - 4, height: Y_TICK_BOT - Y_TICK_TOP + 8, width: 0, x: GUTTER, fill: c.accent, 'fill-opacity': 0.16, stroke: c.accent, 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }, root);
    const bandLabel = el('text', { y: Y_FLAT_LABEL, 'text-anchor': 'middle', 'font-size': body, 'font-weight': 600, fill: c.text }, root);
    const tickLayer = el('g', {}, root);
    el('line', { x1: GUTTER, x2: W - 16, y1: Y_HIGH, y2: Y_HIGH, stroke: c.border, 'stroke-dasharray': '2 4' }, root);
    el('line', { x1: GUTTER, x2: W - 16, y1: Y_LOW, y2: Y_LOW, stroke: c.border, 'stroke-dasharray': '2 4' }, root);
    const linePath = el('path', { d: '', fill: 'none', stroke: c.primary, 'stroke-width': 2.2, 'stroke-linejoin': 'miter' }, root);
    const readFrame = el('rect', { x: GUTTER, y: Y_WIRE - 4, width: BW, height: Y_TICK_BOT - Y_WIRE + 8, fill: 'none', stroke: c.itemActive, 'stroke-width': 2.4, rx: 4, visibility: 'hidden' }, root);

    // 반 칸 경계 눈금 — 바이트 경계 · 비트 경계 · 반 비트(맨체스터에서만 자란다)
    const ticks: SVGLineElement[] = [];
    for (let i = 0; i <= MAX_HALF; i++) {
      const x = GUTTER + i * CW;
      const kind = i % 16 === 0 ? 'byte' : i % 2 === 0 ? 'bit' : 'half';
      ticks.push(
        el('line', {
          x1: x,
          x2: x,
          y1: Y_TICK_TOP,
          y2: kind === 'byte' ? Y_TICK_BOT : kind === 'bit' ? Y_TICK_TOP + TICK_BIT : Y_TICK_TOP,
          stroke: kind === 'byte' ? c.textMuted : c.border,
          'stroke-width': kind === 'byte' ? 1 : 0.8,
          visibility: 'hidden',
        }, tickLayer),
      );
    }

    // ── 받는 쪽 상태 셋
    const stateNames = [t('label.stateBefore', 'before frame'), t('label.stateOpen', 'open'), t('label.stateEscaped', 'after escape')];
    const chips = stateNames.map((name, i) => {
      const g = el('g', {}, root);
      const x = GUTTER + i * 132;
      const rect = el('rect', { x, y: Y_RECV, width: 122, height: 22, rx: 11, fill: c.bg, stroke: c.border, 'stroke-width': 1.2 }, g);
      const text = el('text', { x: x + 61, y: Y_RECV + 15, 'text-anchor': 'middle', 'font-size': body, fill: c.textMuted }, g);
      text.textContent = name;
      return { rect, text };
    });

    // ── 되찾은 줄 · 보낸 줄
    const GOT_W = 46;
    const gotLayer = el('g', {}, root);
    const gotBoxes = Array.from({ length: 12 }, (_, j) => {
      const x = GUTTER + j * (GOT_W + 6);
      const rect = el('rect', { x, y: Y_GOT, width: GOT_W, height: BOX_H, rx: 3, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3', visibility: 'hidden' }, gotLayer);
      const text = el('text', { x: x + GOT_W / 2, y: Y_GOT + BOX_H / 2 + 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': body + 1, fill: c.text }, gotLayer);
      return { rect, text };
    });
    const sentLabel = el('text', { 'text-anchor': 'end', y: Y_GOT + BOX_H / 2 + 4, 'font-size': body, fill: c.textMuted, visibility: 'hidden' }, root);
    sentLabel.textContent = t('label.data', 'Sent data');
    const sentBoxes = Array.from({ length: 12 }, () => {
      const rect = el('rect', { y: Y_GOT, width: GOT_W, height: BOX_H, rx: 3, fill: c.bgSubtle, stroke: c.border, visibility: 'hidden' }, root);
      const text = el('text', { y: Y_GOT + BOX_H / 2 + 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': body + 1, fill: c.textMuted }, root);
      return { rect, text };
    });

    const caption = el('text', { x: GUTTER, y: Y_CAPTION, 'font-size': parseFloat(fontSizes.md), fill: c.text }, root);

    // ── 상태
    const wireBoxes = new Map<string, WireBox>();
    let wireOrder: WireBox[] = [];
    const dataBoxes: DataBox[] = [];
    let curHalf: number[] = [];
    let curManchester = 0;
    let curBand: { x: number; w: number } = { x: GUTTER, w: 0 };
    let readSlot: Slot | null = null;

    // ── 운동 도우미 — 되짚기면 끝 상태로 건너뛴다
    let finishCurrent: (() => void) | null = null;
    const tween = (ms: number, draw: (p: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        finishCurrent?.();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          finishCurrent = null;
          waiters.delete(finish);
          if (!destroyed) draw(1);
          resolve();
        };
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          finish();
          return;
        }
        finishCurrent = finish;
        waiters.add(finish);
        const start = performance.now();
        const tick = (now: number): void => {
          if (done) return;
          if (destroyed || isInstant()) return finish();
          const p = Math.min(1, (now - start) / ms);
          if (p >= 1) return finish();
          draw(ease(p));
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const guard = setTimeout(() => {
          timers.delete(guard);
          finish();
        }, ms + 120);
        timers.add(guard);
        draw(0);
        tick(start);
      });

    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    const styleWire = (b: WireBox, kind: ByteKind, byte: number): void => {
      b.text.textContent = hexByte(byte);
      const accent = kind === 'flag' ? c.primary : kind === 'escape' || kind === 'stuffed' ? c.danger : c.border;
      b.rect.setAttribute('stroke', accent);
      b.rect.setAttribute('stroke-width', kind === 'data' ? '1' : '1.8');
      b.rect.setAttribute('stroke-dasharray', kind === 'stuffed' ? '4 2' : '');
      b.rect.setAttribute('fill', kind === 'flag' ? c.bgSubtle : c.bg);
      b.tag.textContent = kind === 'flag' ? t('label.flag', 'flag') : kind === 'escape' ? t('label.escape', 'escape') : '';
      b.tag.setAttribute('fill', kind === 'flag' ? c.primary : c.danger);
    };

    const placeWire = (b: WireBox, s: Slot): void => {
      b.rect.setAttribute('x', String(s.x + 2));
      b.rect.setAttribute('width', String(Math.max(0, s.w - 4)));
      b.text.setAttribute('x', String(s.x + s.w / 2));
      b.tag.setAttribute('x', String(s.x + s.w / 2));
    };

    const newWireBox = (): WireBox => {
      const g = el('g', {}, wireLayer);
      const rect = el('rect', { y: Y_WIRE, height: BOX_H, rx: 3, fill: c.bg, stroke: c.border }, g);
      const text = el('text', { y: Y_WIRE + BOX_H / 2 + 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': body + 2, fill: c.text }, g);
      const tag = el('text', { y: Y_WIRE + BOX_H + 13, 'text-anchor': 'middle', 'font-size': small, fill: c.textMuted }, g);
      return { g, rect, text, tag, from: { x: GUTTER, w: 0 }, to: { x: GUTTER, w: 0 }, alive: true };
    };

    const linkPath = (d: Slot, w: Slot): string => {
      const x0 = d.x + d.w / 2;
      const y0 = Y_DATA + BOX_H;
      const y1 = Y_WIRE;
      return `M${x0},${y0} L${w.x + 3},${y1} M${x0},${y0} L${w.x + w.w - 3},${y1}`;
    };

    const drawLine = (from: number[], to: number[], fromMan: number, toMan: number, p: number): void => {
      const len = lerp(from.length, to.length, p);
      const n = Math.ceil(len - 1e-9);
      let d = '';
      let prevY = 0;
      for (let i = 0; i < n; i++) {
        const a = from[i] ?? to[i];
        const b = to[i] ?? from[i];
        if (a === undefined || b === undefined) throw new Error('physical-layer-stage: 반 칸이 비었다');
        const y = lerp(a === 1 ? Y_HIGH : Y_LOW, b === 1 ? Y_HIGH : Y_LOW, p);
        const x0 = GUTTER + i * CW;
        const x1 = GUTTER + Math.min(i + 1, len) * CW;
        d += i === 0 ? `M${x0},${y}` : `L${x0},${prevY} L${x0},${y}`;
        d += ` L${x1},${y}`;
        prevY = y;
      }
      linePath.setAttribute('d', d);
      const man = lerp(fromMan, toMan, p);
      for (let i = 0; i <= MAX_HALF; i++) {
        const tk = ticks[i]!;
        const visible = i <= len + 1e-9 && len > 0;
        tk.setAttribute('visibility', visible ? 'visible' : 'hidden');
        if (i % 2 === 1) tk.setAttribute('y2', String(Y_TICK_TOP + TICK_BIT * man));
      }
    };

    const setChip = (state: number | null): void => {
      chips.forEach((ch, i) => {
        const on = state === i;
        ch.rect.setAttribute('fill', on ? c.primary : c.bg);
        ch.rect.setAttribute('stroke', on ? c.primary : c.border);
        ch.rect.setAttribute('stroke-width', on ? '2' : '1.2');
        ch.text.setAttribute('fill', on ? c.textInverse : c.textMuted);
        ch.text.setAttribute('font-weight', on ? '700' : '400');
      });
    };

    const clearGot = (): void => {
      for (const g of gotBoxes) {
        g.rect.setAttribute('visibility', 'hidden');
        g.text.textContent = '';
      }
      sentLabel.setAttribute('visibility', 'hidden');
      for (const s of sentBoxes) {
        s.rect.setAttribute('visibility', 'hidden');
        s.text.textContent = '';
      }
    };

    const stage: PhysicalLayerStage & ViewInstance = {
      async showFrame(f, ms) {
        if (f.wire.length !== f.kinds.length) throw new Error('physical-layer-stage: 선 위 바이트와 종류의 길이가 다르다');
        if (f.data.length !== f.dataAt.length || f.data.length !== f.dataSpan.length) throw new Error('physical-layer-stage: 데이터 자리가 모자라다');
        // 새 판의 선 위 칸 — 키로 앞 판의 칸과 짝을 짓는다
        const keys: { key: string; idx: number; parent?: string }[] = [{ key: 'f0', idx: 0 }];
        f.dataAt.forEach((at, j) => {
          keys.push({ key: `d${j}`, idx: at });
          if (f.dataSpan[j] === 2) keys.push({ key: `d${j}b`, idx: at + 1, parent: `d${j}` });
        });
        keys.push({ key: 'f1', idx: f.wire.length - 1 });
        if (keys.length !== f.wire.length) throw new Error('physical-layer-stage: 선 위 칸 수가 데이터 자리와 맞지 않는다');

        const slotOf = (idx: number, span = 1): Slot => ({ x: GUTTER + idx * BW, w: BW * span });
        const want = new Set(keys.map((k) => k.key));
        for (const [key, b] of wireBoxes) {
          b.from = { ...b.to };
          if (!want.has(key)) {
            // 사라지는 칸은 제 짝(앞 칸) 자리로 접혀 들어간다
            const parentKey = key.endsWith('b') ? key.slice(0, -1) : null;
            const parentIdx = parentKey ? keys.find((k) => k.key === parentKey)?.idx : undefined;
            b.to = parentIdx === undefined ? { x: b.from.x, w: 0 } : { x: slotOf(parentIdx).x + BW, w: 0 };
            b.alive = false;
          }
        }
        for (const k of keys) {
          let b = wireBoxes.get(k.key);
          if (!b) {
            b = newWireBox();
            const parent = k.parent ? wireBoxes.get(k.parent) : undefined;
            b.from = parent ? { x: parent.to.x + parent.to.w, w: 0 } : { x: GUTTER + k.idx * BW, w: 0 };
            wireBoxes.set(k.key, b);
          }
          b.alive = true;
          b.to = slotOf(k.idx);
          const kind = f.kinds[k.idx];
          const byte = f.wire[k.idx];
          if (kind === undefined || byte === undefined) throw new Error('physical-layer-stage: 선 위 칸이 비었다');
          styleWire(b, kind, byte);
        }
        wireOrder = keys.map((k) => {
          const b = wireBoxes.get(k.key);
          if (!b) throw new Error(`physical-layer-stage: 칸 ${k.key} 가 없다`);
          return b;
        });

        // 데이터 칸
        while (dataBoxes.length < f.data.length) {
          const g = el('g', {}, dataLayer);
          const rect = el('rect', { y: Y_DATA, height: BOX_H, rx: 3, fill: c.bgSubtle, stroke: c.border }, g);
          const text = el('text', { y: Y_DATA + BOX_H / 2 + 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': body + 2, fill: c.text }, g);
          const link = el('path', { d: '', fill: 'none', stroke: c.border, 'stroke-width': 1 }, linkLayer);
          const s = { x: GUTTER + BW, w: BW };
          dataBoxes.push({ g, rect, text, link, from: s, to: s, wireFrom: s, wireTo: s });
        }
        f.data.forEach((byte, j) => {
          const d = dataBoxes[j]!;
          const at = f.dataAt[j]!;
          const span = f.dataSpan[j]!;
          d.from = d.to;
          d.wireFrom = d.wireTo;
          d.to = { x: GUTTER + at * BW + (span * BW - (BW - 10)) / 2, w: BW - 10 };
          d.wireTo = slotOf(at, span);
          d.text.textContent = hexByte(byte);
          d.rect.setAttribute('stroke', span === 2 ? c.danger : c.border);
        });

        // 받는 쪽은 새 판에서 열리기 전으로
        readFrame.setAttribute('visibility', 'hidden');
        readSlot = null;
        setChip(0);
        clearGot();

        await tween(ms, (p) => {
          for (const [key, b] of wireBoxes) {
            placeWire(b, { x: lerp(b.from.x, b.to.x, p), w: lerp(b.from.w, b.to.w, p) });
            if (p >= 1 && !b.alive) {
              b.g.remove();
              wireBoxes.delete(key);
            }
          }
          for (const d of dataBoxes) {
            const s = { x: lerp(d.from.x, d.to.x, p), w: lerp(d.from.w, d.to.w, p) };
            d.rect.setAttribute('x', String(s.x));
            d.rect.setAttribute('width', String(s.w));
            d.text.setAttribute('x', String(s.x + s.w / 2));
            d.link.setAttribute('d', linkPath(s, { x: lerp(d.wireFrom.x, d.wireTo.x, p), w: lerp(d.wireFrom.w, d.wireTo.w, p) }));
          }
        });
      },

      async showLine(l, ms) {
        if (l.half.length === 0 || l.half.length > MAX_HALF) throw new Error(`physical-layer-stage: 반 칸 수가 자리 밖이다 ${l.half.length}`);
        if (l.flatStart < 0 || l.flatStart + l.flatHalf > l.half.length) throw new Error('physical-layer-stage: 가장 긴 평평이 선 밖이다');
        const from = curHalf;
        const to = [...l.half];
        const fromMan = curManchester;
        const toMan = l.cellsPerBit === 2 ? 1 : 0;
        const bandFrom = curBand;
        const bandTo = { x: GUTTER + l.flatStart * CW, w: l.flatHalf * CW };
        const bandFromUse = bandFrom.w === 0 ? { x: bandTo.x, w: 0 } : bandFrom;
        bandLabel.textContent = t('label.flatBand', 'Longest flat: {n} bits', { n: l.flatBits });
        await tween(ms, (p) => {
          drawLine(from, to, fromMan, toMan, p);
          const bx = lerp(bandFromUse.x, bandTo.x, p);
          const bw = lerp(bandFromUse.w, bandTo.w, p);
          bandRect.setAttribute('x', String(bx));
          bandRect.setAttribute('width', String(bw));
          const mid = Math.min(Math.max(bx + bw / 2, GUTTER + 80), W - 96);
          bandLabel.setAttribute('x', String(mid));
        });
        curHalf = to;
        curManchester = toMan;
        curBand = bandTo;
      },

      async showRead(r, ms) {
        if (!wireOrder[r.index]) throw new Error(`physical-layer-stage: 선 위 ${r.index} 번째 칸이 없다`);
        const from = readSlot ?? { x: GUTTER + r.index * BW, w: 0 };
        const to = { x: GUTTER + r.index * BW, w: BW };
        readSlot = to;
        readFrame.setAttribute('visibility', 'visible');
        setChip(r.state);
        const n = r.recovered.length;
        if (n > gotBoxes.length) throw new Error('physical-layer-stage: 되찾은 바이트 자리가 모자라다');
        gotBoxes.forEach((g, j) => {
          const has = j < n;
          g.rect.setAttribute('visibility', j < r.sent.length ? 'visible' : 'hidden');
          g.rect.setAttribute('stroke-dasharray', has ? '' : '3 3');
          g.rect.setAttribute('fill', has ? c.bgSubtle : 'none');
          g.text.textContent = has ? hexByte(r.recovered[j]!) : '';
        });
        const fresh = gotBoxes[n - 1];
        if (r.closed) {
          const x0 = GUTTER + r.sent.length * (GOT_W + 6) + 110;
          sentLabel.setAttribute('x', String(x0 - 10));
          sentLabel.setAttribute('visibility', 'visible');
          r.sent.forEach((b, j) => {
            const s = sentBoxes[j];
            if (!s) throw new Error('physical-layer-stage: 보낸 바이트 자리가 모자라다');
            const x = x0 + j * (GOT_W + 6);
            s.rect.setAttribute('x', String(x));
            s.rect.setAttribute('visibility', 'visible');
            s.text.setAttribute('x', String(x + GOT_W / 2));
            s.text.textContent = hexByte(b);
          });
        }
        const landing = r.closed ? null : fresh;
        await tween(ms, (p) => {
          readFrame.setAttribute('x', String(lerp(from.x, to.x, p)));
          readFrame.setAttribute('width', String(lerp(from.w || to.w, to.w, p)));
          if (landing) landing.text.setAttribute('y', String(lerp(Y_GOT - 14, Y_GOT + BOX_H / 2 + 5, p)));
        });
      },

      setCaption(text) {
        caption.textContent = text;
      },

      reset() {
        for (const b of wireBoxes.values()) b.g.remove();
        wireBoxes.clear();
        wireOrder = [];
        for (const d of dataBoxes) {
          d.g.remove();
          d.link.remove();
        }
        dataBoxes.length = 0;
        curHalf = [];
        curManchester = 0;
        curBand = { x: GUTTER, w: 0 };
        drawLine([], [], 0, 0, 1);
        bandRect.setAttribute('width', '0');
        bandLabel.textContent = '';
        readFrame.setAttribute('visibility', 'hidden');
        readSlot = null;
        setChip(null);
        clearGot();
        caption.textContent = '';
      },

      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
    setChip(null);
    return stage;
  },
};
