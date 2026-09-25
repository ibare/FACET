/**
 * closure-captures 의 그림.
 *
 * 동사는 "틀은 걷히고 변수는 따라간다" 다. 그래서 움직이는 것은 자리 그 자체다 —
 * `count` 자리는 `makeCounter` 의 틀 안에서 서고, 틀이 걷히는 걸음에 틀은 오그라들어 사라지는데
 * `count` 자리는 `next` 에 매인 줄째 바깥으로 옮겨 가 그 아래에 매달린다. 그 뒤 `tick()` 을
 * 부르면 새 틀에서 그 자리까지 점선이 닿고, 새 값이 그 자리로 날아들어 앞 값은 옆에 그어진 채 남는다.
 *
 * 왼쪽은 코드, 오른쪽 위는 바깥, 오른쪽 아래는 선 틀. 자리는 캔버스 폭에서 역산한다.
 *
 * 그리기는 늘 장면 전체를 세운다 (`draw(scene, pose)`). 운동은 `pose` — 아직 못 온 만큼의
 * 자리 · 오그라드는 틀 · 날아가는 값 — 를 얹어 같은 그리기를 프레임마다 다시 부르는 것이다.
 * 운동이 끝나면 `pose` 없이 한 번 더 그린다.
 */
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
import type { CcFn, CcFrame, CcSlot, CcStep, CcVal, ClosureCapturesScene } from './scene.js';

const H = 316;
const W = PIECE_CANVAS_W;
const PAD = 16;
const MOTION_MS = 380;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

type Pose = {
  slotAt: Map<number, Pt>;
  fnAt: Map<number, Pt>;
  /** 값이 아직 안 들어온 자리 — 앞 값과 그 앞 자취를 보인다 */
  slotWas: Map<number, { value: CcVal; history: CcVal[] }>;
  /** 서는 틀의 높이 비율 */
  grow: Map<number, number>;
  /** 걷히는 틀 — 높이 비율 */
  ghost: { frame: CcFrame; scale: number } | null;
  chip: { text: string; at: Pt } | null;
  outShown: number | null;
};

function noPose(): Pose {
  return { slotAt: new Map(), fnAt: new Map(), slotWas: new Map(), grow: new Map(), ghost: null, chip: null, outShown: null };
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 글자 폭 어림 — 글꼴 크기는 토큰에서 받는다. 한글 · 한자 같은 넓은 글자는 한 칸 가득 친다. */
function textW(s: string, px: number, mono: boolean): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? px : px * (mono ? 0.6 : 0.56);
  return w;
}

function wrap(s: string, px: number, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const tryLine = line ? `${line} ${word}` : word;
    if (line && textW(tryLine, px, false) > maxW) {
      out.push(line);
      line = word;
    } else line = tryLine;
  }
  if (line) out.push(line);
  return out;
}

function fmt(v: CcVal, t: Translate): string {
  if (v.t === 'num') return String(v.n);
  if (v.t === 'str') return `"${v.s}"`;
  if (v.t === 'fn') return v.name;
  return t('label.none', 'nothing');
}

function narrow(raw: Record<string, unknown> | undefined): { maxChars: number } {
  let maxChars = 24;
  const lines = raw?.lines;
  if (Array.isArray(lines)) {
    for (const l of lines) {
      if (typeof l !== 'object' || l === null) continue;
      const o = l as { indent?: unknown; text?: unknown };
      const n = (typeof o.indent === 'number' ? o.indent * 4 : 0) + (typeof o.text === 'string' ? o.text.length : 0);
      maxChars = Math.max(maxChars, n);
    }
  }
  return { maxChars };
}

export const closureCapturesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const codePx = parseFloat(fontSizes.sm);
    const smallPx = parseFloat(fontSizes.xs);
    const valuePx = parseFloat(fontSizes.md);
    const cw = codePx * 0.6;
    const LH = Math.round(codePx * 1.85);
    const CODE_TOP = 44;
    const codeTextX = PAD + 10;
    const { maxChars } = narrow(params.initialData);
    const codeRight = codeTextX + maxChars * cw + 10;
    const RX = Math.round(codeRight + 20);
    const RW = W - PAD - RX;
    const GAP = 28;
    const ITEM_W = Math.min(170, Math.floor((RW - 24 - GAP) / 2));
    const SLOT_H = 36;
    const CARD_H = 26;
    const OUT_W = Math.min(110, ITEM_W - 20);
    const TOP_Y = 30;
    const FT = 128;
    const FH = 96;
    const OUT_Y = 240;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(e);
      return e;
    }

    function label(parent: Element, x: number, y: number, s: string, o: { px: number; fill: string; mono?: boolean; anchor?: string; weight?: string }): SVGTextElement {
      const e = el(
        'text',
        {
          x,
          y,
          fill: o.fill,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.px,
          'text-anchor': o.anchor ?? 'start',
          ...(o.weight ? { 'font-weight': o.weight } : {}),
        },
        parent,
      );
      e.textContent = s;
      return e;
    }

    // ── 자리 셈 — 장면에서만 나온다

    function lineY(i: number): number {
      return CODE_TOP + i * LH;
    }

    function lineEnd(s: ClosureCapturesScene, i: number): Pt {
      const l = s.lines[i];
      const n = l ? l.indent * 4 + l.text.length : 0;
      return { x: codeTextX + n * cw + 6, y: lineY(i) - 16 };
    }

    function frameBox(f: CcFrame): Box {
      const d = Math.max(0, f.depth - 1);
      return { x: RX + d * 10, y: FT + d * 14, w: RW - d * 10, h: FH };
    }

    function inFrame(depth: number, order: number, fn: boolean): Pt {
      const d = Math.max(0, depth - 1);
      const x = RX + d * 10 + 12 + order * (ITEM_W + GAP);
      const y = FT + d * 14 + 34;
      return { x, y: fn ? y + (SLOT_H - CARD_H) / 2 : y };
    }

    function exitOf(f: CcFrame): Pt {
      const b = frameBox(f);
      return { x: b.x + b.w / 2 - 20, y: b.y - 10 };
    }

    function looseFns(s: ClosureCapturesScene): CcFn[] {
      return s.fns.filter((f) => f.owner === null);
    }

    function fnHome(s: ClosureCapturesScene, fn: CcFn): Pt {
      if (fn.owner !== null) return inFrame(fn.ownerDepth, fn.order, true);
      const j = looseFns(s).indexOf(fn);
      return { x: W - PAD - ITEM_W - j * (ITEM_W + GAP), y: TOP_Y };
    }

    function slotHome(s: ClosureCapturesScene, sl: CcSlot): Pt {
      if (sl.owner !== null) return inFrame(sl.ownerDepth, sl.order, false);
      if (sl.carriedBy !== null) {
        const fn = s.fns.find((f) => f.id === sl.carriedBy);
        if (fn) {
          const at = fnHome(s, fn);
          const m = s.slots.filter((x) => x.owner === null && x.carriedBy === fn.id).indexOf(sl);
          return { x: at.x, y: at.y + CARD_H + 10 + m * (SLOT_H + 6) };
        }
      }
      const k = s.slots.filter((x) => x.owner === null && x.carriedBy === null).indexOf(sl);
      return { x: RX + k * (OUT_W + 16), y: TOP_Y };
    }

    function slotW(sl: CcSlot): number {
      return sl.owner === null && sl.carriedBy === null ? OUT_W : ITEM_W;
    }

    function outAt(k: number): Pt {
      return { x: PAD + k * 44, y: OUT_Y + 6 };
    }

    // ── 그리기

    function drawSlot(g: Element, s: ClosureCapturesScene, sl: CcSlot, at: Pt, pose: Pose, fnAt: Map<number, Pt>): void {
      const w = slotW(sl);
      const carried = sl.carriedBy !== null || s.fns.some((f) => f.captures.includes(sl.id));
      el(
        'rect',
        { x: at.x, y: at.y, width: w, height: SLOT_H, rx: 5, fill: c.bg, stroke: carried ? c.primary : c.border, 'stroke-width': carried ? 1.6 : 1 },
        g,
      );
      label(g, at.x + 8, at.y + 14, sl.name, { px: smallPx, fill: c.textMuted, mono: true });
      const was = pose.slotWas.get(sl.id);
      const value = was ? was.value : sl.value;
      const history = was ? was.history : sl.history;
      if (value.t === 'fn') {
        const target = fnAt.get(value.fn);
        const from = { x: at.x + w - 12, y: at.y + SLOT_H / 2 };
        el('circle', { cx: from.x, cy: from.y, r: 3, fill: c.text }, g);
        if (target) {
          const to = { x: target.x - 4, y: target.y + CARD_H / 2 };
          el('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: c.text, 'stroke-width': 1.2 }, g);
          el('path', { d: `M ${r1(to.x)} ${r1(to.y)} l -7 -4 l 0 8 z`, fill: c.text }, g);
        }
        return;
      }
      const vs = fmt(value, t);
      const vx = at.x + w - 10;
      label(g, vx, at.y + 27, vs, { px: valuePx, fill: c.text, mono: true, anchor: 'end', weight: '600' });
      let hx = vx - textW(vs, valuePx, true) - 10;
      for (let k = history.length - 1; k >= 0; k -= 1) {
        const hs = fmt(history[k]!, t);
        const hw = textW(hs, smallPx, true);
        label(g, hx, at.y + 27, hs, { px: smallPx, fill: c.textMuted, mono: true, anchor: 'end' });
        el('line', { x1: hx - hw - 1, y1: at.y + 23, x2: hx + 1, y2: at.y + 23, stroke: c.textMuted, 'stroke-width': 1 }, g);
        hx -= hw + 8;
      }
    }

    function drawCard(g: Element, fn: CcFn, at: Pt): void {
      el('rect', { x: at.x, y: at.y, width: ITEM_W, height: CARD_H, rx: 4, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.6 }, g);
      label(g, at.x + 8, at.y + 17, t('label.fnValue', 'function {name}', { name: fn.name }), { px: codePx, fill: c.text, mono: true });
    }

    function drawTether(g: Element, card: Pt, slot: Pt, w: number): void {
      let a: Pt;
      let b: Pt;
      if (slot.x + w <= card.x) {
        a = { x: card.x, y: card.y + CARD_H / 2 };
        b = { x: slot.x + w, y: slot.y + SLOT_H / 2 };
      } else {
        a = { x: card.x + 18, y: card.y + CARD_H };
        b = { x: slot.x + 18, y: slot.y };
      }
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: c.primary, 'stroke-width': 2 }, g);
      el('circle', { cx: a.x, cy: a.y, r: 3, fill: c.primary }, g);
      el('circle', { cx: b.x, cy: b.y, r: 3, fill: c.primary }, g);
    }

    function drawFrame(g: Element, f: CcFrame, scale: number, muted: boolean): void {
      const b = frameBox(f);
      const h = Math.max(0, b.h * scale);
      el('rect', { x: b.x, y: b.y, width: b.w, height: h, rx: 6, fill: c.bgSubtle, stroke: muted ? c.textMuted : c.border, 'stroke-dasharray': muted ? '4 3' : 'none' }, g);
      if (h < 20) return;
      label(g, b.x + 10, b.y + 18, t('label.frame', 'frame of {name}', { name: f.callee }), { px: smallPx, fill: c.textMuted });
      if (f.as !== f.callee) {
        label(g, b.x + b.w - 10, b.y + 18, t('label.calledAs', 'called as {name}', { name: f.as }), { px: smallPx, fill: c.textMuted, anchor: 'end' });
      }
    }

    function drawChip(g: Element, text: string, at: Pt): void {
      const w = textW(text, codePx, true) + 16;
      el('rect', { x: at.x, y: at.y, width: w, height: 20, rx: 10, fill: c.bg, stroke: c.itemActive, 'stroke-width': 1.6 }, g);
      label(g, at.x + w / 2, at.y + 14, text, { px: codePx, fill: c.text, mono: true, anchor: 'middle' });
    }

    function stepLine(step: CcStep): number | null {
      return step.k === 'start' ? null : step.line;
    }

    function caption(s: ClosureCapturesScene): string {
      const st = s.step;
      if (st.k === 'start') return t('caption.start', 'Nothing has run yet.');
      if (st.k === 'call') {
        const f = s.frames.find((x) => x.id === st.frame);
        if (!f) return '';
        if (f.as === f.callee) return t('caption.call', 'Call {name}() — a frame for it opens.', { name: f.callee });
        return t('caption.callAs', 'Call {as}() — the body of {name} runs in a new frame.', { as: f.as, name: f.callee });
      }
      if (st.k === 'make') {
        const fn = s.fns.find((x) => x.id === st.fn);
        if (!fn) return '';
        const names = fn.captures.map((id) => s.slots.find((x) => x.id === id)?.name ?? '').filter((x) => x);
        if (names.length === 0) return t('caption.makePlain', 'Function {name} is made here.', { name: fn.name });
        return t('caption.make', 'Function {name} is made here and holds on to the slot: {captures}.', {
          name: fn.name,
          captures: names.join(', '),
        });
      }
      if (st.k === 'stmt') return thenCaption(s, st.then);
      const closed = st.closed;
      if (st.kept.length > 0 && st.then?.k === 'set') {
        const th = st.then;
        const to = s.slots.find((x) => x.id === th.slot)?.name ?? '';
        const kept = st.kept.map((id) => s.slots.find((x) => x.id === id)?.name ?? '').join(', ');
        const byFn = s.slots.find((x) => x.id === st.kept[0])?.carriedBy;
        const fn = s.fns.find((x) => x.id === byFn)?.name ?? '';
        return t('caption.arriveKept', '{name} is done and its frame is gone. The slot {kept} does not vanish — it leaves attached to {fn}, and {to} now holds {fn}.', {
          name: closed.callee,
          kept,
          fn,
          to,
        });
      }
      const value = fmt(st.value, t);
      if (st.then?.k === 'show') {
        return t('caption.arriveShow', '{as}() comes back with {value} and its frame is gone. Shown: {value}.', { as: closed.as, value });
      }
      if (st.then?.k === 'set') {
        const th = st.then;
        const to = s.slots.find((x) => x.id === th.slot)?.name ?? '';
        return t('caption.arriveSet', '{as}() comes back with {value}: {to} = {value}.', { as: closed.as, value, to });
      }
      return t('caption.arrive', '{as}() comes back with {value}.', { as: closed.as, value });
    }

    function thenCaption(s: ClosureCapturesScene, th: Extract<CcStep, { k: 'stmt' }>['then']): string {
      if (th.k === 'set') {
        const sl = s.slots.find((x) => x.id === th.slot);
        if (!sl) return '';
        const value = fmt(sl.value, t);
        if (th.declare) return t('caption.declare', 'A new slot {name} opens here, holding {value}.', { name: sl.name, value });
        const was = fmt(th.was, t);
        const fn = s.fns.find((f) => f.id === sl.carriedBy);
        if (fn) {
          return t('caption.updateCarried', 'The call reaches the slot that {fn} carries — {name}: {was} → {value}.', {
            fn: fn.name,
            name: sl.name,
            was,
            value,
          });
        }
        return t('caption.update', '{name}: {was} → {value}.', { name: sl.name, was, value });
      }
      if (th.k === 'return') return t('caption.return', 'return hands back {value}.', { value: fmt(th.value, t) });
      if (th.k === 'show') return t('caption.show', 'Shown: {value}.', { value: fmt(th.value, t) });
      return '';
    }

    function draw(s: ClosureCapturesScene, pose: Pose): void {
      svg.textContent = '';
      const root = el('g', {}, svg);

      // 코드
      const cur = stepLine(s.step);
      if (cur !== null) {
        el('rect', { x: PAD, y: lineY(cur) - 15, width: codeRight - PAD, height: 20, rx: 3, fill: c.accent, 'fill-opacity': 0.35 }, root);
      }
      s.lines.forEach((l, i) => {
        const e = label(root, codeTextX + l.indent * 4 * cw, lineY(i), l.text, { px: codePx, fill: c.text, mono: true });
        e.setAttribute('xml:space', 'preserve');
      });

      // 출력
      if (s.lines.length > 0) {
        label(root, PAD, OUT_Y, t('label.output', 'shown'), { px: smallPx, fill: c.textMuted });
        const n = pose.outShown ?? s.out.length;
        for (let k = 0; k < n && k < s.out.length; k += 1) drawChip(root, fmt(s.out[k]!, t), outAt(k));
        label(root, RX, TOP_Y - 12, t('label.outer', 'outside'), { px: smallPx, fill: c.textMuted });
      }

      // 틀
      const frames = el('g', {}, root);
      if (pose.ghost) drawFrame(frames, pose.ghost.frame, pose.ghost.scale, true);
      for (const f of s.frames) drawFrame(frames, f, pose.grow.get(f.id) ?? 1, false);

      // 함수 · 자리의 자리
      const fnAt = new Map<number, Pt>();
      for (const fn of s.fns) fnAt.set(fn.id, pose.fnAt.get(fn.id) ?? fnHome(s, fn));
      const slotAt = new Map<number, Pt>();
      for (const sl of s.slots) slotAt.set(sl.id, pose.slotAt.get(sl.id) ?? slotHome(s, sl));

      // 부른 틀이 붙잡은 자리를 찾아가는 점선
      for (const f of s.frames) {
        if (f.fn === null || (pose.grow.get(f.id) ?? 1) < 1) continue;
        const fn = s.fns.find((x) => x.id === f.fn);
        if (!fn) continue;
        const b = frameBox(f);
        fn.captures.forEach((id, k) => {
          const sl = s.slots.find((x) => x.id === id);
          const to = slotAt.get(id);
          if (!sl || !to) return;
          const at = { x: b.x + 12 + k * 90, y: b.y + 58 };
          label(frames, at.x, at.y, sl.name, { px: codePx, fill: c.primary, mono: true });
          const fx = at.x + textW(sl.name, codePx, true) + 6;
          el('path', { d: `M ${r1(fx)} ${r1(at.y - 4)} C ${r1(fx + 40)} ${r1(at.y - 4)} ${r1(to.x + 24)} ${r1(to.y + SLOT_H + 30)} ${r1(to.x + 24)} ${r1(to.y + SLOT_H + 3)}`, fill: 'none', stroke: c.primary, 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }, frames);
          el('path', { d: `M ${r1(to.x + 24)} ${r1(to.y + SLOT_H + 1)} l -4 7 l 8 0 z`, fill: c.primary }, frames);
        });
      }

      const items = el('g', {}, root);
      for (const fn of s.fns) {
        const at = fnAt.get(fn.id)!;
        for (const id of fn.captures) {
          const sl = s.slots.find((x) => x.id === id);
          const sp = slotAt.get(id);
          if (sl && sp) drawTether(items, at, sp, slotW(sl));
        }
      }
      for (const sl of s.slots) drawSlot(items, s, sl, slotAt.get(sl.id)!, pose, fnAt);
      for (const fn of s.fns) drawCard(items, fn, fnAt.get(fn.id)!);

      // 돌려주는 값은 틀의 윗변에 머문다
      const st = s.step;
      const top = s.frames[s.frames.length - 1];
      if (st.k === 'stmt' && st.then.k === 'return' && top && !pose.chip) drawChip(items, fmt(st.then.value, t), exitOf(top));
      if (pose.chip) drawChip(items, pose.chip.text, pose.chip.at);

      // 캡션
      const lines = wrap(caption(s), codePx, W - 2 * PAD);
      lines.slice(0, 2).forEach((ln, k) => {
        label(root, PAD, H - 22 + k * 16, ln, { px: codePx, fill: c.text });
      });
    }

    /** 이 걸음의 운동 — 요소는 이미 끝 자리에 서 있고, 아직 못 온 만큼을 p 로 그린다. */
    function poseAt(s: ClosureCapturesScene, p: number): Pose {
      const pose = noPose();
      const st = s.step;
      if (st.k === 'call') {
        pose.grow.set(st.frame, p);
      } else if (st.k === 'make') {
        const fn = s.fns.find((x) => x.id === st.fn);
        if (fn) pose.fnAt.set(fn.id, lerp(lineEnd(s, st.line), fnHome(s, fn), p));
      } else if (st.k === 'stmt') {
        const th = st.then;
        if (th.k === 'set') {
          const sl = s.slots.find((x) => x.id === th.slot);
          if (sl && th.declare) pose.slotAt.set(sl.id, lerp(lineEnd(s, st.line), slotHome(s, sl), p));
          else if (sl && p < 1) {
            pose.slotWas.set(sl.id, { value: th.was, history: sl.history.slice(0, -1) });
            const home = slotHome(s, sl);
            pose.chip = { text: fmt(sl.value, t), at: lerp(lineEnd(s, st.line), { x: home.x + slotW(sl) - 40, y: home.y + 8 }, p) };
          }
        } else if (th.k === 'return') {
          const top = s.frames[s.frames.length - 1];
          if (top) {
            let from = lineEnd(s, st.line);
            const src = th.srcSlot !== null ? s.slots.find((x) => x.id === th.srcSlot) : undefined;
            if (src) {
              const h = slotHome(s, src);
              from = { x: h.x + slotW(src) - 40, y: h.y + 8 };
            } else if (th.value.t === 'fn') {
              const v = th.value;
              const fn = s.fns.find((x) => x.id === v.fn);
              if (fn) from = fnHome(s, fn);
            }
            pose.chip = { text: fmt(th.value, t), at: lerp(from, exitOf(top), p) };
          }
        } else if (th.k === 'show' && p < 1) {
          pose.outShown = s.out.length - 1;
          pose.chip = { text: fmt(th.value, t), at: lerp(lineEnd(s, st.line), outAt(s.out.length - 1), p) };
        }
      } else if (st.k === 'arrive') {
        if (p < 1) pose.ghost = { frame: st.closed, scale: 1 - p };
        for (const id of st.kept) {
          const sl = s.slots.find((x) => x.id === id);
          if (sl) pose.slotAt.set(id, lerp(inFrame(sl.ownerDepth, sl.order, false), slotHome(s, sl), p));
        }
        for (const id of st.keptFns) {
          const fn = s.fns.find((x) => x.id === id);
          if (fn) pose.fnAt.set(id, lerp(inFrame(fn.ownerDepth, fn.order, true), fnHome(s, fn), p));
        }
        const th = st.then;
        const exit = exitOf(st.closed);
        const carriedFn = st.value.t === 'fn' && st.keptFns.includes(st.value.fn);
        if (th?.k === 'set') {
          const sl = s.slots.find((x) => x.id === th.slot);
          if (sl && th.declare) pose.slotAt.set(sl.id, lerp(lineEnd(s, st.line), slotHome(s, sl), p));
          else if (sl && p < 1) pose.slotWas.set(sl.id, { value: th.was, history: sl.history.slice(0, -1) });
          if (sl && !carriedFn && p < 1) {
            const home = slotHome(s, sl);
            pose.chip = { text: fmt(st.value, t), at: lerp(exit, { x: home.x + slotW(sl) - 40, y: home.y + 8 }, p) };
          }
        } else if (th?.k === 'show' && p < 1) {
          pose.outShown = s.out.length - 1;
          pose.chip = { text: fmt(st.value, t), at: lerp(exit, outAt(s.out.length - 1), p) };
        }
      }
      return pose;
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let elapsed = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const p = Math.min(1, elapsed / MOTION_MS);
          frame(ease(p));
          if (p >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            elapsed += 16;
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function hasMotion(s: ClosureCapturesScene): boolean {
      const st = s.step;
      if (st.k === 'start') return false;
      if (st.k === 'stmt') return st.then.k !== 'expr';
      return true;
    }

    return {
      async render(next: ClosureCapturesScene, prev: ClosureCapturesScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        draw(next, noPose());
        if (!opts.animate || prev === null || !hasMotion(next)) return;
        await tween(mine, (p) => draw(next, poseAt(next, p)));
        if (destroyed || mine !== gen) return;
        draw(next, noPose());
      },
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
