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
import type { JustBeforePaintScene } from './scene.js';

const H = 410;
const NS = 'http://www.w3.org/2000/svg';

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);

/** 가장자리 여백 */
const PAD = 16;
/** 운동 길이 — 메시지 · 콜백 · 페인트 */
const MESSAGE_MS = 400;
const CALL_MS = 500;
const PAINT_MS = 600;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: SVGElement,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 표시용 반올림 — 소수 첫째 자리. 셈은 끝까지 한 뒤 여기서만 자른다 */
function fmt(x: number): string {
  const s = (Math.round(x * 10) / 10).toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

function r1(x: number): number {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)는 한 칸, 나머지는 반 칸 남짓 */
function measure(s: string, px: number, mono = false): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x2e80 ? px * 0.95 : mono ? px * 0.6 : px * 0.56;
  }
  return w;
}

/** 폭을 넘는 글자는 눌러 담는다 */
function fit(node: SVGTextElement, s: string, px: number, max: number, mono = false): void {
  if (measure(s, px, mono) > max) {
    node.setAttribute('textLength', String(r1(max)));
    node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
}

/** 캡션을 폭에 맞춰 줄로 나눈다 — 띄어쓰기가 없는 글은 글자로 끊는다 */
function wrap(s: string, px: number, max: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  const push = (w: string): void => {
    const next = line === '' ? w : `${line} ${w}`;
    if (measure(next, px) <= max) {
      line = next;
      return;
    }
    if (line !== '') lines.push(line);
    if (measure(w, px) <= max) {
      line = w;
      return;
    }
    let piece = '';
    for (const ch of w) {
      if (measure(piece + ch, px) > max) {
        lines.push(piece);
        piece = '';
      }
      piece += ch;
    }
    line = piece;
  };
  for (const w of words) push(w);
  if (line !== '') lines.push(line);
  return lines;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** 시계 e 의 [a, b] 구간을 0..1 로 */
function span(e: number, a: number, b: number): number {
  return ease((e - a) / (b - a));
}

type Spot = { g: SVGGElement; x: number; y: number };

type Handles = {
  cursor: Spot | null;
  chips: Map<number, Spot>;
  latest: Spot;
  box: Spot | null;
  screen: Spot | null;
  trail: Map<number, Spot>;
  queued: Spot | null;
  called: Spot | null;
  stages: { rect: SVGRectElement; x: number }[];
  overlay: SVGGElement;
  /** 위치 셈 — 운동이 출발점을 셈할 때 쓴다 */
  xOf: (t: number) => number;
  requestLine: { x: number; y: number };
  latestSlot: { x: number; y: number };
  boxSlot: { x: number; y: number };
  queueSlot: { x: number; y: number };
};

function place(s: Spot, x: number, y: number): void {
  s.g.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
}

function slide(s: Spot, fromX: number, fromY: number, e: number): void {
  place(s, fromX + (s.x - fromX) * e, fromY + (s.y - fromY) * e);
}

export const justBeforePaintStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function chip(parent: SVGElement, value: number, fate: 'waiting' | 'taken' | 'lost'): SVGGElement {
      const g = el('g', {}, parent);
      const stroke = fate === 'taken' ? c.success : fate === 'lost' ? c.border : c.itemComparing;
      el('rect', { x: -14, y: -9, width: 28, height: 18, rx: 4, fill: c.bg, stroke, 'stroke-width': 1.5 }, g);
      el(
        'text',
        {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: fate === 'lost' ? c.textMuted : c.text,
        },
        g,
        String(value),
      );
      if (fate === 'lost') el('line', { x1: -10, y1: 0, x2: 10, y2: 0, stroke: c.textMuted, 'stroke-width': 1.5 }, g);
      return g;
    }

    function token(parent: SVGElement, name: string, beat: number): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', { x: -34, y: -15, width: 68, height: 30, rx: 6, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5 }, g);
      const n = el(
        'text',
        { x: 0, y: -2, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.primary },
        g,
        name,
      );
      fit(n, name, SM, 60, true);
      const label = t('label.beat', 'Beat {beat}', { beat });
      const b = el(
        'text',
        { x: 0, y: 11, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        g,
        label,
      );
      fit(b, label, XS, 60);
      return g;
    }

    function big(parent: SVGElement, value: number, fill: string): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'text',
        { x: 0, y: 7, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 600, fill },
        g,
        String(value),
      );
      return g;
    }

    function caption(s: JustBeforePaintScene): string {
      const st = s.step;
      const fn = s.names.draw;
      const name = s.names.latest;
      if (st.kind === 'start') {
        if (s.pending === null) return '';
        return t('caption.start', 'Queued: {fn}, for beat {beat}. {name} = {value}.', {
          fn,
          beat: s.pending,
          name,
          value: s.latest,
        });
      }
      if (st.kind === 'message') {
        const vars = { t: fmt(st.at), name, was: st.was, value: s.latest, fn, calls: s.counts.calls };
        return st.lost !== null
          ? t('caption.messageLost', '{t} ms, message. {name}: {was} → {value}. Overwritten before any beat: {was}.', vars)
          : t('caption.message', '{t} ms, message. {name}: {was} → {value}. Calls to {fn}: {calls}.', vars);
      }
      if (st.kind === 'call') {
        return t(
          'caption.call',
          'Beat {beat}, {t} ms. {fn} runs: {box} = {value}. Messages since the last beat: {n}. Its new request waits for beat {next}.',
          { beat: st.beat, t: fmt(st.at), fn, box: s.names.box, value: s.box ?? '', n: st.gathered, next: st.next },
        );
      }
      const shown = s.screen[s.screen.length - 1];
      const value = shown === undefined ? '' : shown.value;
      if (st.last) {
        return t(
          'caption.last',
          'Beat {beat}: on screen {value}. Messages: {messages}. Calls to {fn}: {calls}. Paints: {paints}. Never on screen: {unseen}.',
          {
            beat: st.beat,
            value,
            messages: s.counts.messages,
            fn,
            calls: s.counts.calls,
            paints: s.counts.paints,
            unseen: st.unseen.join(', '),
          },
        );
      }
      return t('caption.paint', 'Beat {beat}: style, layout, paint. On screen: {value}. Paints: {paints}.', {
        beat: st.beat,
        value,
        paints: s.counts.paints,
      });
    }

    function drawStatic(s: JustBeforePaintScene): Handles {
      svg.textContent = '';
      const root = el('g', {}, svg);

      // ── 캡션 ──
      const capText = caption(s);
      let capPx = MD;
      let lines = wrap(capText, capPx, W - 2 * PAD);
      if (lines.length > 2) {
        capPx = SM;
        lines = wrap(capText, capPx, W - 2 * PAD);
      }
      lines.forEach((line, i) => {
        el(
          'text',
          { x: PAD, y: 20 + i * (capPx + 4), 'font-family': fonts.body, 'font-size': `${capPx}px`, fill: c.text },
          root,
          line,
        );
      });

      // ── 시간축 ──
      const axisY = 104;
      const chipY = 80;
      const trailY = 152;
      const left = PAD + 8;
      const right = W - PAD - 8;
      const domain = s.until > 0 ? s.until * 1.1 : 1;
      const xOf = (ms: number): number => left + (ms / domain) * (right - left);
      el('line', { x1: left, y1: axisY, x2: right, y2: axisY, stroke: c.border, 'stroke-width': 1.5 }, root);
      const ticks = [{ beat: 0, at: 0 }, ...s.beats];
      for (const b of ticks) {
        const x = r1(xOf(b.at));
        el('line', { x1: x, y1: axisY - 7, x2: x, y2: axisY + 7, stroke: c.textMuted, 'stroke-width': 1.5 }, root);
        el(
          'text',
          { x, y: axisY + 20, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text },
          root,
          t('label.beat', 'Beat {beat}', { beat: b.beat }),
        );
        el(
          'text',
          { x, y: axisY + 32, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
          root,
          t('label.ms', '{t} ms', { t: fmt(b.at) }),
        );
      }
      const chips = new Map<number, Spot>();
      for (const m of s.arrived) {
        const x = xOf(m.at);
        el('line', { x1: r1(x), y1: chipY + 9, x2: r1(x), y2: axisY, stroke: c.border, 'stroke-width': 1 }, root);
        el(
          'text',
          { x: r1(x), y: chipY - 14, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
          root,
          fmt(m.at),
        );
        const g = chip(root, m.value, m.fate);
        const spot = { g, x, y: chipY };
        place(spot, x, chipY);
        chips.set(m.index, spot);
      }
      const trail = new Map<number, Spot>();
      for (const p of s.screen) {
        const at = s.beats.find((b) => b.beat === p.beat)?.at;
        if (at === undefined) continue;
        const g = chip(root, p.value, 'taken');
        const spot = { g, x: xOf(at), y: trailY };
        place(spot, spot.x, spot.y);
        trail.set(p.beat, spot);
      }
      let cursor: Spot | null = null;
      if (s.beats.length > 0) {
        const g = el('g', {}, root);
        el('line', { x1: 0, y1: chipY - 8, x2: 0, y2: axisY + 8, stroke: c.primary, 'stroke-width': 2 }, g);
        el('path', { d: `M -5 ${axisY + 8} L 5 ${axisY + 8} L 0 ${axisY + 1} Z`, fill: c.primary }, g);
        cursor = { g, x: xOf(s.now), y: 0 };
        place(cursor, cursor.x, 0);
      }

      // ── 한 장의 차례: latest → 콜백 → box → 스타일 · 레이아웃 · 페인트 → 화면 ──
      const slotTop = 218;
      const slotH = 38;
      const slotY = slotTop + slotH / 2;
      const widths = [80, 72, 96, 62, 62, 62, 70];
      const gaps = [18, 18, 18, 4, 4, 18];
      const raw = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
      const k = (W - 2 * PAD) / raw;
      const cells: { x: number; w: number }[] = [];
      let cx = PAD;
      widths.forEach((w, i) => {
        cells.push({ x: cx, w: w * k });
        cx += w * k + (gaps[i] ?? 0) * k;
      });
      const cell = (i: number): { x: number; w: number } => {
        const got = cells[i];
        if (got === undefined) throw new Error(`just-before-paint: 칸 ${i} 이 없다`);
        return got;
      };
      const mid = (i: number): number => cell(i).x + cell(i).w / 2;

      const heads: { text: string; mono: boolean }[] = [
        { text: s.names.latest, mono: true },
        { text: t('stage.callback', 'Callbacks'), mono: false },
        { text: s.names.box, mono: true },
        { text: t('stage.style', 'Style'), mono: false },
        { text: t('stage.layout', 'Layout'), mono: false },
        { text: t('stage.paint', 'Paint'), mono: false },
        { text: t('label.screen', 'Screen'), mono: false },
      ];
      const stages: { rect: SVGRectElement; x: number }[] = [];
      const lit = (i: number): boolean =>
        (s.step.kind === 'call' && i === 1) || (s.step.kind === 'paint' && i >= 3 && i <= 5);
      heads.forEach((h, i) => {
        const { x, w } = cell(i);
        const label = el(
          'text',
          {
            x: r1(x + w / 2),
            y: slotTop - 8,
            'text-anchor': 'middle',
            'font-family': h.mono ? fonts.mono : fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          root,
          h.text,
        );
        fit(label, h.text, XS, w, h.mono);
        const on = lit(i);
        const rect = el(
          'rect',
          {
            x: r1(x),
            y: slotTop,
            width: r1(w),
            height: slotH,
            rx: 6,
            fill: i === 6 ? c.bgSubtle : c.bg,
            stroke: on ? c.accent : c.border,
            'stroke-width': on ? 2.5 : 1.5,
          },
          root,
        );
        if (i >= 3 && i <= 5) stages.push({ rect, x: x + w / 2 });
      });
      // 화살
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 3],
        [5, 6],
      ] as const) {
        const x1 = cell(a).x + cell(a).w + 3;
        const x2 = cell(b).x - 3;
        el('line', { x1: r1(x1), y1: slotY, x2: r1(x2 - 4), y2: slotY, stroke: c.textMuted, 'stroke-width': 1.5 }, root);
        el('path', { d: `M ${r1(x2 - 5)} ${slotY - 4} L ${r1(x2)} ${slotY} L ${r1(x2 - 5)} ${slotY + 4} Z`, fill: c.textMuted }, root);
      }
      // 박자 괄호 — 콜백부터 페인트까지가 한 박자 안의 차례
      if (s.step.kind === 'call' || s.step.kind === 'paint') {
        const x1 = cell(1).x;
        const x2 = cell(5).x + cell(5).w;
        const y = slotTop - 24;
        el('path', { d: `M ${r1(x1)} ${y + 5} L ${r1(x1)} ${y} L ${r1(x2)} ${y} L ${r1(x2)} ${y + 5}`, fill: 'none', stroke: c.accent, 'stroke-width': 2 }, root);
        el(
          'text',
          { x: r1((x1 + x2) / 2), y: y - 5, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text },
          root,
          t('label.beatAt', 'Beat {beat} · {t} ms', { beat: s.step.beat, t: fmt(s.step.at) }),
        );
      }

      const latestG = el('g', {}, root);
      el('rect', { x: -17, y: -13, width: 34, height: 26, rx: 5, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 2 }, latestG);
      el(
        'text',
        { x: 0, y: 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text },
        latestG,
        String(s.latest),
      );
      const latest = { g: latestG, x: mid(0), y: slotY };
      place(latest, latest.x, latest.y);

      let called: Spot | null = null;
      if (s.calling !== null) {
        const g = token(root, s.names.draw, s.calling);
        called = { g, x: mid(1), y: slotY };
        place(called, called.x, called.y);
      }
      let box: Spot | null = null;
      if (s.box !== null) {
        box = { g: big(root, s.box, c.text), x: mid(2), y: slotY };
        place(box, box.x, box.y);
      }
      let screen: Spot | null = null;
      const shown = s.screen[s.screen.length - 1];
      if (shown !== undefined) {
        screen = { g: big(root, shown.value, c.success), x: mid(6), y: slotY };
        place(screen, screen.x, screen.y);
      }

      // ── 코드 ──
      const codeTop = 296;
      const lineH = 16;
      const hot = new Set<number>();
      if (s.step.kind === 'start') hot.add(s.roles.kickoff);
      if (s.step.kind === 'message') hot.add(s.roles.handler);
      if (s.step.kind === 'call') {
        hot.add(s.roles.write);
        hot.add(s.roles.request);
      }
      let codeRight = PAD;
      s.code.forEach((line, i) => {
        const y = codeTop + i * lineH;
        const w = measure(line, SM, true);
        codeRight = Math.max(codeRight, PAD + 8 + w);
        if (hot.has(i)) {
          el('rect', { x: PAD, y: y - lineH + 4, width: r1(w + 12), height: lineH, rx: 3, fill: c.bgSubtle }, root);
          el('rect', { x: PAD, y: y - lineH + 4, width: 3, height: lineH, fill: c.accent }, root);
        }
        el(
          'text',
          { x: PAD + 8, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: hot.has(i) ? c.text : c.textMuted, 'xml:space': 'preserve' },
          root,
          line,
        );
      });
      const reqLine = s.code[s.roles.request];
      const requestLine = {
        x: PAD + 8 + (reqLine === undefined ? 0 : measure(reqLine, SM, true)),
        y: codeTop + s.roles.request * lineH - 4,
      };

      // ── 걸린 콜백 · 세는 수 ──
      const rx = Math.min(W - PAD - 190, codeRight + 24);
      const rw = W - PAD - rx;
      const queueTitle = t('label.queue', 'Waiting callbacks');
      const qt = el(
        'text',
        { x: r1(rx), y: codeTop - 12, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        root,
        queueTitle,
      );
      fit(qt, queueTitle, XS, rw);
      el('rect', { x: r1(rx), y: codeTop - 4, width: r1(rw), height: 40, rx: 6, fill: 'none', stroke: c.border, 'stroke-dasharray': '4 3' }, root);
      const queueSlot = { x: rx + 42, y: codeTop + 16 };
      let queued: Spot | null = null;
      if (s.pending !== null && s.beats.length > 0) {
        const g = token(root, s.names.draw, s.pending);
        queued = { g, x: queueSlot.x, y: queueSlot.y };
        place(queued, queued.x, queued.y);
      }
      const rows: [string, number][] = [
        [t('label.messages', 'Messages'), s.counts.messages],
        [t('label.calls', 'Calls to {fn}', { fn: s.names.draw }), s.counts.calls],
        [t('label.paints', 'Paints'), s.counts.paints],
      ];
      rows.forEach(([label, n], i) => {
        const y = codeTop + 62 + i * 20;
        const lt = el('text', { x: r1(rx), y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, root, label);
        fit(lt, label, SM, rw - 40);
        el(
          'text',
          { x: W - PAD, y, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600, fill: c.text },
          root,
          String(n),
        );
      });

      const overlay = el('g', {}, root);
      return {
        cursor,
        chips,
        latest,
        box,
        screen,
        trail,
        queued,
        called,
        stages,
        overlay,
        xOf,
        requestLine,
        latestSlot: { x: latest.x, y: latest.y },
        boxSlot: { x: mid(2), y: slotY },
        queueSlot,
      };
    }

    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animate(s: JustBeforePaintScene, h: Handles, mine: number): Promise<void> {
      const st = s.step;
      if (st.kind === 'message') {
        const drop = h.chips.get(st.index);
        const ghost = el('g', {}, h.overlay);
        el(
          'text',
          { x: 0, y: 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.textMuted },
          ghost,
          String(st.was),
        );
        const ghostSpot = { g: ghost, x: h.latestSlot.x, y: h.latestSlot.y + 30 };
        const fromX = h.xOf(st.from);
        await tween(MESSAGE_MS, mine, (p) => {
          const e1 = span(p, 0, 0.45);
          const e2 = span(p, 0.4, 1);
          if (h.cursor) place(h.cursor, fromX + (h.cursor.x - fromX) * e1, 0);
          if (drop) slide(drop, drop.x, drop.y - 30, e1);
          if (drop) slide(h.latest, drop.x, drop.y, e2);
          slide(ghostSpot, h.latestSlot.x, h.latestSlot.y, e2);
          ghost.setAttribute('opacity', String(r1(1 - e2)));
        });
        return;
      }
      if (st.kind === 'call') {
        const fromX = h.xOf(st.from);
        await tween(CALL_MS, mine, (p) => {
          const e1 = span(p, 0, 0.35);
          if (h.cursor) place(h.cursor, fromX + (h.cursor.x - fromX) * e1, 0);
          if (h.called) slide(h.called, h.queueSlot.x, h.queueSlot.y, span(p, 0, 0.45));
          if (h.box) slide(h.box, h.latestSlot.x, h.latestSlot.y, span(p, 0.35, 0.7));
          if (h.queued) slide(h.queued, h.requestLine.x + 40, h.requestLine.y, span(p, 0.65, 1));
        });
        return;
      }
      if (st.kind === 'paint') {
        const trail = h.trail.get(st.beat);
        await tween(PAINT_MS, mine, (p) => {
          const e1 = span(p, 0, 0.7);
          if (h.screen) {
            slide(h.screen, h.boxSlot.x, h.boxSlot.y, e1);
            const x = h.boxSlot.x + (h.screen.x - h.boxSlot.x) * e1;
            for (const stg of h.stages) {
              const on = x >= stg.x;
              stg.rect.setAttribute('stroke', on ? c.accent : c.border);
              stg.rect.setAttribute('stroke-width', on ? '2.5' : '1.5');
            }
          }
          if (trail && h.screen) slide(trail, h.screen.x, h.screen.y, span(p, 0.7, 1));
        });
      }
    }

    return {
      render(next: JustBeforePaintScene, prev: JustBeforePaintScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        return animate(next, h, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
      },
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
