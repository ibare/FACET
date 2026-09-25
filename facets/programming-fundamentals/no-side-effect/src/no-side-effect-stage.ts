/**
 * no-side-effect 의 stage — 함수 몸을 벽으로 두른 프로그램 지도.
 *
 * 프로그램 글자가 그대로 지도가 된다. 함수 정의 줄들은 벽을 두른 방이고, 방 밖은 전부 바깥이다.
 * 바깥 이름(`calls`)은 선언한 줄 옆 칸에 산다. 부르기마다 인자가 부른 줄에서 방으로 올라가고,
 * 돌려준 값이 방을 나와 그 줄의 출력 칸에 선다. 몸 안의 대입이 바깥 이름에 쓰면 그 줄에서 방의
 * 벽을 뚫고 바깥 칸까지 선이 뻗고, 그 선은 지워지지 않는다 — 바깥에 남은 자국이다.
 * 부른 줄 옆에는 부르기 전과 뒤의 바깥이 나란히 선다.
 *
 * 화면 전체는 장면에서 늘 새로 선다 (drawStatic). 운동은 그 위에 "아직 못 온 만큼" 만 그린다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { NamedValue, NoSideEffectScene, SceneWrite } from './scene.js';

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가장자리 여백 · 머리 칸 · 캡션 띠. */
const PAD = 14;
const HEAD = 34;
const FOOT = 50;
/** 줄 높이 상한 — 줄이 많으면 줄인다. */
const ROW_MAX = 26;
/** 운동 시간 (ms) — 올라감 · 뻗음 · 나옴. */
const T_IN = 150;
const T_WRITE = 180;
const T_OUT = 170;
const T_ONE = 260;

type Attrs = Record<string, string | number>;

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 한 부르기의 바깥 전/뒤 — 이름마다 "전 → 뒤". */
function beforeAfter(before: readonly NamedValue[], after: readonly NamedValue[]): { text: string; changed: boolean } {
  let changed = false;
  const parts = after.map((a) => {
    const b = before.find((x) => x.name === a.name);
    const was = b ? b.value : a.value;
    if (was !== a.value) changed = true;
    return `${a.name} ${was} → ${a.value}`;
  });
  return { text: parts.join(', '), changed };
}

function writesText(writes: readonly SceneWrite[]): string {
  return writes.map((w) => `${w.name} ${w.before} → ${w.after}`).join(', ');
}

/** 자리 셈 — 캔버스와 줄 수에서 역산한다. */
function layoutOf(scene: NoSideEffectScene) {
  const codePx = parseFloat(fontSizes.md);
  const smallPx = parseFloat(fontSizes.sm);
  const cw = codePx * 0.6;
  const n = Math.max(1, scene.lines.length);
  const rowH = Math.min(ROW_MAX, (H - HEAD - FOOT) / n);
  const codeX = PAD + 32;
  const indentW = 4 * cw;
  let maxChars = 0;
  for (const ln of scene.lines) maxChars = Math.max(maxChars, ln.indent * 4 + ln.text.length);
  const codeRight = codeX + maxChars * cw;
  const boxLeft = codeX - 8;
  const boxRight = codeRight + 14;
  const outerX = boxRight + 48;
  const outX = W - PAD - 56;
  const rowY = (i: number) => HEAD + rowH * (i + 0.5);
  const rowTop = (i: number) => HEAD + rowH * i;
  const lineEnd = (i: number) => {
    const ln = scene.lines[i];
    return ln ? codeX + (ln.indent * 4 + ln.text.length) * cw : codeX;
  };
  return { codePx, smallPx, cw, rowH, codeX, indentW, boxLeft, boxRight, outerX, outX, rowY, rowTop, lineEnd };
}

type Layout = ReturnType<typeof layoutOf>;

/** 쓰기 선의 꺾인 점들 — 몸의 줄 끝에서 벽을 넘어 바깥 이름 칸까지. k 는 몇 번째 쓰기인가. */
function trailPoints(L: Layout, scene: NoSideEffectScene, w: SceneWrite, k: number): [number, number][] {
  const home = scene.outer.find((o) => o.name === w.name);
  const targetRow = home ? home.line : 0;
  const sx = L.lineEnd(w.line) + 6;
  const y0 = L.rowY(w.line) + (k % 2 === 0 ? -3 : 3);
  const vx = L.boxRight + 14 + k * 9;
  const y1 = L.rowY(targetRow) + 4 + Math.min(k, 3) * 2;
  return [
    [sx, y0],
    [vx, y0],
    [vx, y1],
    [L.outerX - 6, y1],
  ];
}

function pathOf(pts: readonly [number, number][]): { d: string; len: number } {
  let d = '';
  let len = 0;
  pts.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)} `;
    if (i > 0) {
      const [px, py] = pts[i - 1]!;
      len += Math.hypot(x - px, y - py);
    }
  });
  return { d: d.trim(), len: r1(len) };
}

function captionOf(scene: NoSideEffectScene, t: Translate): string {
  const s = scene.step;
  if (s.kind === 'start') return t('caption.start', 'Start — no line has run yet.');
  if (s.kind === 'declare') {
    return t('caption.declare', 'Outer name {name} starts at {value}.', { name: s.name, value: s.value });
  }
  if (s.kind === 'call') {
    const call = `${s.call.fn}(${s.call.args.join(', ')})`;
    if (s.writes.length === 0) {
      return t('caption.clean', '{call} returned {out}. Outside: {change}.', {
        call,
        out: s.call.value,
        change: beforeAfter(s.call.before, s.call.after).text,
      });
    }
    return t('caption.marked', '{call} returned {out}. Its body wrote to the outside — {writes}.', {
      call,
      out: s.call.value,
      writes: writesText(s.writes),
    });
  }
  const marked = scene.calls.filter((c) => scene.writes.some((w) => w.callLine === c.line)).length;
  return t('caption.show', '{code} printed {out}. Calls that marked the outside: {marked} · calls that did not: {clean}.', {
    code: scene.lines[s.line]?.text ?? '',
    out: s.value,
    marked,
    clean: scene.calls.length - marked,
  });
}

/** 캡션이 넘치면 가운데 가까운 빈칸에서 두 줄로 가른다. */
function wrap(text: string, px: number, maxW: number): string[] {
  const est = [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? px : px * 0.55), 0);
  if (est <= maxW) return [text];
  const mid = Math.floor(text.length / 2);
  let cut = -1;
  for (let d = 0; d < mid; d += 1) {
    if (text[mid + d] === ' ') { cut = mid + d; break; }
    if (text[mid - d] === ' ') { cut = mid - d; break; }
  }
  if (cut < 0) return [text];
  return [text.slice(0, cut), text.slice(cut + 1)];
}

type Handles = {
  /** 이번 걸음에 새로 선 것 — 운동이 "아직 못 온 만큼" 으로 가린다. */
  newOutput: SVGGElement | null;
  newTrails: { path: SVGPathElement; len: number; notch: SVGCircleElement }[];
  newCellValue: SVGTextElement | null;
  newSnapshot: SVGTextElement | null;
  motion: SVGGElement;
};

function drawStatic(root: SVGSVGElement, scene: NoSideEffectScene, colors: Palette, t: Translate): Handles {
  root.textContent = '';
  el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, root);
  const L = layoutOf(scene);
  const step = scene.step;
  const here = step.kind === 'start' ? -1 : step.line;
  const handles: Omit<Handles, 'motion'> = { newOutput: null, newTrails: [], newCellValue: null, newSnapshot: null };

  // 머리 — 바깥 · 출력 칸
  const headY = HEAD - 12;
  const head = { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm };
  el('text', { ...head, x: L.outerX, y: headY }, root, t('label.outer', 'Outside'));
  el('text', { ...head, x: L.outX, y: headY, 'text-anchor': 'middle' }, root, t('label.output', 'Output'));

  // 지금 줄의 띠 — 줄 전체를 가로질러 코드 · 바깥 · 출력을 한 줄로 잇는다
  if (here >= 0) {
    el('rect', { x: PAD - 6, y: L.rowTop(here) + 1, width: W - 2 * PAD + 12, height: L.rowH - 2, rx: 4, fill: colors.accent, 'fill-opacity': 0.22 }, root);
  }

  // 함수 몸 — 벽을 두른 방
  const called = step.kind === 'call' ? step.call.fn : null;
  for (const f of scene.functions) {
    const active = f.name === called;
    el('rect', {
      x: L.boxLeft,
      y: L.rowTop(f.header) + 2,
      width: L.boxRight - L.boxLeft,
      height: L.rowH * (f.last - f.header + 1) - 4,
      rx: 6,
      fill: colors.bgSubtle,
      'fill-opacity': 0.7,
      stroke: active ? colors.primary : colors.border,
      'stroke-width': active ? 2 : 1.5,
    }, root);
  }
  if (step.kind === 'call') {
    for (const w of step.writes) {
      el('rect', { x: L.boxLeft + 3, y: L.rowTop(w.line) + 3, width: L.boxRight - L.boxLeft - 6, height: L.rowH - 6, rx: 3, fill: colors.itemComparing, 'fill-opacity': 0.18 }, root);
    }
  }

  // 코드 글자
  const code = { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'dominant-baseline': 'central' };
  scene.lines.forEach((ln, i) => {
    el('text', { x: PAD + 14, y: L.rowY(i), fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'end', 'dominant-baseline': 'central' }, root, String(i + 1));
    el('text', { ...code, x: L.codeX + ln.indent * L.indentW, y: L.rowY(i), 'xml:space': 'preserve' }, root, ln.text);
  });

  // 자국 — 몸에서 바깥으로 뻗은 쓰기. 지워지지 않는다
  scene.writes.forEach((w, k) => {
    const pts = trailPoints(L, scene, w, k);
    const { d, len } = pathOf(pts);
    const path = el('path', { d, fill: 'none', stroke: colors.itemComparing, 'stroke-width': 2, 'stroke-linejoin': 'round' }, root);
    const [ax, ay] = pts[pts.length - 1]!;
    el('path', { d: `M${r1(ax - 6)} ${r1(ay - 4)} L${r1(ax)} ${r1(ay)} L${r1(ax - 6)} ${r1(ay + 4)}`, fill: 'none', stroke: colors.itemComparing, 'stroke-width': 2 }, root);
    const notch = el('circle', { cx: L.boxRight, cy: pts[0]![1], r: 3.5, fill: colors.itemComparing }, root);
    if (step.kind === 'call' && step.writes.some((x) => x === w)) handles.newTrails.push({ path, len, notch });
  });

  // 바깥 이름 칸 — 선언한 줄 옆
  const valueW = 36;
  for (const o of scene.outer) {
    const y = L.rowY(o.line);
    const nameW = o.name.length * L.cw;
    el('text', { ...code, x: L.outerX, y }, root, o.name);
    const bx = L.outerX + nameW + 10;
    el('rect', { x: bx, y: y - (L.rowH - 6) / 2, width: valueW, height: L.rowH - 6, rx: 4, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, root);
    const v = el('text', { ...code, x: bx + valueW / 2, y, 'text-anchor': 'middle' }, root, String(o.value));
    const touched =
      (step.kind === 'call' && step.writes.some((w) => w.name === o.name)) ||
      (step.kind === 'declare' && step.name === o.name);
    if (touched) handles.newCellValue = v;
  }

  // 부른 줄 옆 — 부르기 전과 뒤의 바깥
  for (const c of scene.calls) {
    const ba = beforeAfter(c.before, c.after);
    const snap = el('text', {
      x: L.outerX,
      y: L.rowY(c.line),
      fill: ba.changed ? colors.itemComparing : colors.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': ba.changed ? 700 : 400,
      'dominant-baseline': 'central',
    }, root, ba.text);
    if (step.kind === 'call' && step.call === c) handles.newSnapshot = snap;
  }

  // 출력 칸
  scene.outputs.forEach((o, k) => {
    const g = el('g', { transform: `translate(${r1(L.outX)} ${r1(L.rowY(o.line))})` }, root);
    const text = String(o.value);
    const w = Math.max(30, text.length * L.cw + 14);
    el('rect', { x: -w / 2, y: -(L.rowH - 6) / 2, width: w, height: L.rowH - 6, rx: 4, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.2 }, g);
    el('text', { ...code, x: 0, y: 0, 'text-anchor': 'middle' }, g, text);
    if (k === scene.outputs.length - 1 && here === o.line) handles.newOutput = g;
  });

  // 캡션
  const capPx = parseFloat(fontSizes.md);
  const lines = wrap(captionOf(scene, t), capPx, W - 2 * PAD);
  const capBase = H - FOOT / 2 - ((lines.length - 1) * (capPx + 4)) / 2;
  lines.forEach((ln, i) => {
    el('text', { x: W / 2, y: capBase + i * (capPx + 4), fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, root, ln);
  });

  return { ...handles, motion: el('g', {}, root) };
}

export const noSideEffectStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const root = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const alive = (mine: number) => mine === gen && !destroyed;

    /** 한 시계로 흘린다. 끝나거나 거둬지면 풀린다. */
    function tween(mine: number, ms: number, draw: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) { resolve(); return; }
        const start = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (!alive(mine)) { finish(); return; }
          const k = Math.min(1, (Date.now() - start) / ms);
          draw(ease(k));
          if (k >= 1) { finish(); return; }
          const id = setTimeout(() => { timers.delete(id); tick(); }, 16);
          timers.add(id);
        };
        draw(0);
        const id = setTimeout(() => { timers.delete(id); tick(); }, 16);
        timers.add(id);
      });
    }

    /** 움직이는 값 조각 하나. */
    function chip(parent: SVGGElement, text: string, fill: string, ink: string, L: Layout): SVGGElement {
      const g = el('g', {}, parent);
      const w = Math.max(30, text.length * L.cw + 14);
      el('rect', { x: -w / 2, y: -(L.rowH - 6) / 2, width: w, height: L.rowH - 6, rx: 4, fill }, g);
      el('text', { x: 0, y: 0, fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g, text);
      return g;
    }

    function place(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
    }

    async function glide(mine: number, g: SVGGElement, from: [number, number], to: [number, number], ms: number): Promise<void> {
      await tween(mine, ms, (k) => place(g, from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k));
    }

    async function animateStep(next: NoSideEffectScene, mine: number): Promise<void> {
      const h = drawStatic(root, next, colors, t);
      const L = layoutOf(next);
      const s = next.step;
      const hide = (node: Element | null) => node?.setAttribute('visibility', 'hidden');
      const show = (node: Element | null) => node?.removeAttribute('visibility');

      if (s.kind === 'declare') {
        hide(h.newCellValue);
        const home = next.outer.find((o) => o.name === s.name);
        const c = chip(h.motion, String(s.value), colors.primary, colors.textInverse, L);
        const tx = L.outerX + s.name.length * L.cw + 10 + 18;
        await glide(mine, c, [L.lineEnd(s.line) + 20, L.rowY(s.line)], [tx, L.rowY(home ? home.line : s.line)], T_ONE);
        if (!alive(mine)) return;
        show(h.newCellValue);
        c.remove();
        return;
      }

      if (s.kind === 'show') {
        hide(h.newOutput);
        const home = s.readOuter ? next.outer.find((o) => o.name === s.readOuter) : undefined;
        const from: [number, number] = home
          ? [L.outerX + home.name.length * L.cw + 28, L.rowY(home.line)]
          : [L.lineEnd(s.line) + 20, L.rowY(s.line)];
        const c = chip(h.motion, String(s.value), colors.primary, colors.textInverse, L);
        await glide(mine, c, from, [L.outX, L.rowY(s.line)], T_ONE);
        if (!alive(mine)) return;
        show(h.newOutput);
        c.remove();
        return;
      }

      if (s.kind !== 'call') return;
      hide(h.newOutput);
      hide(h.newSnapshot);
      if (h.newTrails.length > 0) hide(h.newCellValue);
      for (const tr of h.newTrails) {
        tr.path.setAttribute('stroke-dasharray', `${tr.len} ${tr.len}`);
        tr.path.setAttribute('stroke-dashoffset', String(tr.len));
        hide(tr.notch);
      }

      // 인자가 부른 줄에서 방의 머리줄로 올라간다
      const args = chip(h.motion, `(${s.call.args.join(', ')})`, colors.primary, colors.textInverse, L);
      await glide(mine, args, [L.lineEnd(s.line) - 30, L.rowY(s.line)], [L.lineEnd(s.call.header) - 30, L.rowY(s.call.header)], T_IN);
      if (!alive(mine)) return;
      args.remove();

      // 몸 안의 대입이 벽을 뚫고 바깥 칸까지 뻗는다
      if (h.newTrails.length > 0) {
        await tween(mine, T_WRITE, (k) => {
          for (const tr of h.newTrails) {
            tr.path.setAttribute('stroke-dashoffset', String(r1(tr.len * (1 - k))));
            if (k > 0.2) show(tr.notch);
          }
        });
        if (!alive(mine)) return;
        show(h.newCellValue);
      }
      show(h.newSnapshot);

      // 돌려준 값이 방을 나와 그 줄의 출력 칸에 선다
      const ret = chip(h.motion, String(s.call.value), colors.primary, colors.textInverse, L);
      await glide(mine, ret, [L.lineEnd(s.call.returnLine) + 20, L.rowY(s.call.returnLine)], [L.outX, L.rowY(s.line)], T_OUT);
      if (!alive(mine)) return;
      ret.remove();
    }

    return {
      async render(next: NoSideEffectScene, prev: NoSideEffectScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moving = opts.animate && prev !== null && prev.step !== next.step && next.step.kind !== 'start';
        if (!moving) {
          drawStatic(root, next, colors, t);
          return;
        }
        await animateStep(next, mine);
        if (!alive(mine)) return;
        drawStatic(root, next, colors, t);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
