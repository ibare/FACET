/**
 * recursion-self-call 무대 — 제 몸으로 다시 들어간다.
 *
 * 왼쪽 위에 프로그램 원본이 그대로 있다. 함수를 부를 때마다 원본의 몸이 한 장 베껴져
 * 부르는 자리에서 떨어져 나온다 (바깥에서 부르면 원본에서, 몸 안에서 부르면 부르는 몸에서).
 * 흐름은 부르는 줄에서 호를 그리며 새 몸의 첫 줄로 **거슬러 올라** 들어가고, 부르는 줄에서
 * 셈한 값이 그 호를 따라 새 몸의 머리에 가 앉는다. 앞서 들어간 몸들은 부르는 줄에 멈춤
 * 표시를 단 채 뒤에 겹쳐 남는다.
 *
 * 자리는 전부 캔버스 폭·높이와 장면의 바탕(줄 수 · 가장 깊은 깊이)에서 셈한다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Frame, RecursionSelfCallScene, Row } from './scene.js';

const H = 390;
const NS = 'http://www.w3.org/2000/svg';

const M = 10;
const CAP_H = 66;
const OUT_H = 30;
const GAP = 10;
const PAD_Y = 6;
const SRC_PAD_X = 16;
const DOT_X = 8;
const TEXT_X = 18;
const CARD_PAD_R = 10;
const ROW_MAX = 24;
const SHIFT_MAX = 170;
/** 코드 글자 크기 — 글자 폭 셈이 그리는 토큰과 같은 값을 쓰게 토큰에서 끌어온다 */
const CODE_PX = parseFloat(fontSizes.sm);
const CH = CODE_PX * 0.6;
const INDENT_CH = 4;
/** 계단 한 칸 — 새 몸은 부른 몸보다 머리줄·첫 줄 두 줄만큼 위에 선다 */
const RISE_ROWS = 2;

const MOVE_MS = 280;
const ENTER_MS = 400;
const SLIDE_MS = 380;

type Pt = { x: number; y: number };
type Bez = [Pt, Pt, Pt, Pt];

type Geo = {
  r: number;
  s: number;
  srcW: number;
  cardW: number;
  cardH: number;
  body: number[];
  bodyBase: number;
  top1: number;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (parent) parent.appendChild(el);
  return el;
}

function rnd(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function bez(b: Bez, t: number): Pt {
  const u = 1 - t;
  const [a, c, d, e] = b;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t * t * t * e.x,
    y: u * u * u * a.y + 3 * u * u * t * c.y + 3 * u * t * t * d.y + t * t * t * e.y,
  };
}

function bezLength(b: Bez): number {
  let len = 0;
  let prev = b[0];
  for (let i = 1; i <= 24; i += 1) {
    const p = bez(b, i / 24);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

function bezPath(b: Bez): string {
  const [a, c, d, e] = b;
  return `M${rnd(a.x)},${rnd(a.y)} C${rnd(c.x)},${rnd(c.y)} ${rnd(d.x)},${rnd(d.y)} ${rnd(e.x)},${rnd(e.y)}`;
}

function textWidth(chars: number): number {
  return chars * CH;
}

function geometry(scene: RecursionSelfCallScene): Geo {
  const rows = scene.rows;
  const body = rows.map((r, i) => (r.role === 'body' ? i : -1)).filter((i) => i >= 0);
  const bodyBase = body.length > 0 ? Math.min(...body.map((i) => rows[i]!.indent)) : 1;
  const srcChars = Math.max(1, ...rows.map((r) => r.indent * INDENT_CH + r.text.length));
  const cardChars = Math.max(1, ...body.map((i) => (rows[i]!.indent - bodyBase) * INDENT_CH + rows[i]!.text.length));
  const srcW = textWidth(srcChars) + SRC_PAD_X * 2;
  const cardW = textWidth(cardChars) + TEXT_X + CARD_PAD_R;
  const depth = Math.max(1, scene.maxDepth);
  const s = depth > 1 ? Math.min(SHIFT_MAX, (PIECE_CANVAS_W - 2 * M - cardW) / (depth - 1)) : 0;
  // 원본과 가로로 겹치는 몸 가운데 가장 깊은 것 — 그 몸의 윗변이 원본 아래에 와야 한다
  let kOver = 1;
  for (let k = 1; k <= depth; k += 1) if (M + (k - 1) * s < M + srcW + GAP) kOver = k;
  const cardRows = 1 + body.length;
  const riseRows = Math.max(RISE_ROWS * (depth - 1), rows.length + RISE_ROWS * (kOver - 1));
  const fixed = CAP_H + (PAD_Y * 2 + GAP) * 2 + OUT_H + M;
  const r = Math.min(ROW_MAX, (H - fixed) / (riseRows + cardRows));
  const top1 = CAP_H + Math.max(RISE_ROWS * r * (depth - 1), rows.length * r + PAD_Y * 2 + GAP + RISE_ROWS * r * (kOver - 1));
  const cardH = PAD_Y * 2 + cardRows * r;
  return { r, s, srcW, cardW, cardH, body, bodyBase, top1 };
}

const cardX = (g: Geo, k: number): number => M + (k - 1) * g.s;
const cardTop = (g: Geo, k: number): number => g.top1 - RISE_ROWS * g.r * (k - 1);

/** 깊이 depth 에서 줄 line 의 가운데 높이 */
function rowY(g: Geo, depth: number, line: number): number {
  if (depth === 0) return CAP_H + PAD_Y + (line + 0.5) * g.r;
  const j = g.body.indexOf(line);
  return cardTop(g, depth) + PAD_Y + (1 + Math.max(0, j) + 0.5) * g.r;
}

function textX(g: Geo, rows: Row[], depth: number, line: number): number {
  const row = rows[line];
  const ind = row ? row.indent : 0;
  if (depth === 0) return M + SRC_PAD_X + textWidth(ind * INDENT_CH);
  return cardX(g, depth) + TEXT_X + textWidth((ind - g.bodyBase) * INDENT_CH);
}

function dotX(g: Geo, depth: number): number {
  return depth === 0 ? M + SRC_PAD_X / 2 : cardX(g, depth) + DOT_X;
}

/** 출력 알약 i 의 왼쪽 끝 */
function outX(output: string[], i: number): number {
  let x = M + 84;
  for (let j = 0; j < i; j += 1) x += textWidth(output[j]!.length) + 14 + 6;
  return x;
}

function argText(f: Frame): string {
  return f.args.map(String).join(', ');
}

function binding(scene: RecursionSelfCallScene, f: Frame, filled: boolean): string {
  return scene.params.map((p, i) => (filled && f.args[i] !== undefined ? `${p} = ${String(f.args[i])}` : `${p} =`)).join(', ');
}

/** 부르는 줄 끝에 붙는 값 알약의 자리 */
function pillBox(g: Geo, scene: RecursionSelfCallScene, depth: number, line: number, label: string) {
  const row = scene.rows[line];
  const x = textX(g, scene.rows, depth, line) + textWidth(row ? row.text.length : 0) + 8;
  const w = textWidth(label.length) + 12;
  const h = g.r * 0.82;
  return { x, y: rowY(g, depth, line) - h / 2, w, h };
}

/** 깊이 k 의 몸으로 들어간 호 — 부르는 줄의 값 알약에서 새 몸의 첫 줄로 */
function arcOf(g: Geo, scene: RecursionSelfCallScene, k: number): Bez | null {
  const f = scene.frames[k - 1];
  const first = f?.visited[0];
  if (!f || first === undefined) return null;
  const pb = pillBox(g, scene, k - 1, f.callLine, argText(f));
  const end = { x: dotX(g, k), y: rowY(g, k, first) };
  const up = end.y < pb.y;
  const start = { x: pb.x + pb.w / 2, y: up ? pb.y : pb.y + pb.h };
  const bend = g.r * 1.4;
  return [
    start,
    { x: start.x, y: start.y + (up ? -bend : bend) },
    { x: end.x, y: end.y + (up ? bend : -bend) },
    { x: end.x, y: end.y + (up ? 6 : -6) },
  ];
}

type Handles = {
  dot: SVGElement | null;
  band: SVGElement | null;
  newCard: SVGGElement | null;
  arc: SVGPathElement | null;
  arrow: SVGElement | null;
  headChip: SVGGElement | null;
  outChip: SVGGElement | null;
};

export const recursionSelfCallStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<RecursionSelfCallScene> {
    const root = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function label(x: number, y: number, str: string, opts: Record<string, string | number>, parent: Element) {
      const el = svg('text', { x: rnd(x), y: rnd(y), 'dominant-baseline': 'central', ...opts }, parent);
      el.textContent = str;
      return el;
    }

    function code(x: number, y: number, str: string, fill: string, parent: Element) {
      return label(x, y, str, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill, 'xml:space': 'preserve' }, parent);
    }

    function chip(x: number, y: number, w: number, h: number, str: string, stroke: string, ink: string, parent: Element) {
      const g = svg('g', {}, parent);
      svg('rect', { x: rnd(x), y: rnd(y), width: rnd(w), height: rnd(h), rx: 4, fill: c.bg, stroke, 'stroke-width': 1.4 }, g);
      label(x + w / 2, y + h / 2, str, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: ink, 'text-anchor': 'middle' }, g);
      return g;
    }

    function pauseMark(x: number, y: number, parent: Element) {
      svg('rect', { x: rnd(x - 3.5), y: rnd(y - 4.5), width: 2.5, height: 9, fill: c.textMuted }, parent);
      svg('rect', { x: rnd(x + 1), y: rnd(y - 4.5), width: 2.5, height: 9, fill: c.textMuted }, parent);
    }

    /** 자식 틀이 선 부르는 줄 — 그 몸은 여기서 멈춰 기다린다 */
    function waitingLine(scene: RecursionSelfCallScene, depth: number): number | null {
      const child = scene.frames[depth];
      return child ? child.callLine : null;
    }

    function drawCaption(scene: RecursionSelfCallScene, parent: Element) {
      const step = scene.step;
      let main = '';
      let sub = '';
      let note = '';
      if (step.kind === 'start') {
        main = t('caption.start', 'No line has run yet.');
      } else if (step.kind === 'call') {
        const f = scene.frames[step.depth];
        const vars = { fn: f?.fn ?? scene.fn, arg: f ? argText(f) : '' };
        main = step.self
          ? t('caption.callSelf', 'Inside its own body, {fn} calls itself: {fn}({arg}).', vars)
          : t('caption.call', 'Calls {fn}({arg}).', vars);
      } else {
        const f = step.depth > 0 ? scene.frames[step.depth - 1] : undefined;
        if (step.kind === 'enter' && f) {
          const vars = { fn: f.fn, binding: binding(scene, f, true), depth: step.depth };
          main = step.again
            ? t('caption.reenter', 'Enters the first line of the same {fn} again, with {binding} — depth {depth}.', vars)
            : t('caption.enter', 'Enters the first line of {fn} with {binding} — depth {depth}.', vars);
        } else if (step.kind === 'line' && step.printed) {
          main = t('caption.print', 'print adds {value} to the output.', { value: scene.output[scene.output.length - 1] ?? '' });
        }
        const cond = f?.cond;
        if (cond && cond.line === step.line) {
          const shown = `${String(cond.l)} ${cond.op} ${String(cond.r)}`;
          sub = cond.value
            ? t('cond.true', 'Condition {cond}: true.', { cond: shown })
            : t('cond.false', 'Condition {cond}: false — no deeper call.', { cond: shown });
          if (!cond.value) note = t('caption.paused', 'Earlier bodies paused on their call line: {paused}.', { paused: step.depth - 1 });
        }
      }
      label(M, 16, main, { 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, parent);
      if (sub) label(M, 37, sub, { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, parent);
      if (note) label(M, 55, note, { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, parent);
    }

    function drawStatic(scene: RecursionSelfCallScene): Handles {
      root.textContent = '';
      const h: Handles = { dot: null, band: null, newCard: null, arc: null, arrow: null, headChip: null, outChip: null };
      if (scene.rows.length === 0) return h;
      const g = geometry(scene);
      const cur = scene.cursor;
      const step = scene.step;

      drawCaption(scene, root);

      // 원본 — 프로그램 전체. 맨 바깥(깊이 0)의 줄은 여기서 밟힌다
      const src = svg('g', {}, root);
      svg('rect', { x: M, y: CAP_H, width: rnd(g.srcW), height: rnd(scene.rows.length * g.r + PAD_Y * 2), rx: 6, fill: c.bgSubtle, stroke: c.border }, src);
      const srcWait = waitingLine(scene, 0);
      scene.rows.forEach((row, i) => {
        const y = rowY(g, 0, i);
        if (cur && cur.depth === 0 && cur.line === i) {
          h.band = svg('rect', { x: M + 2, y: rnd(y - g.r / 2), width: rnd(g.srcW - 4), height: rnd(g.r), fill: c.accent, 'fill-opacity': 0.35 }, src);
        } else if (srcWait === i) {
          // 맨 바깥은 함수의 몸이 아니다 — 멈춤 표시(몸이 부르는 줄에서 기다림)를 달지 않고 옅은 띠만 둔다
          svg('rect', { x: M + 2, y: rnd(y - g.r / 2), width: rnd(g.srcW - 4), height: rnd(g.r), fill: c.textMuted, 'fill-opacity': 0.14 }, src);
        }
        const stepped = scene.topVisited.includes(i);
        code(textX(g, scene.rows, 0, i), y, row.text, row.role === 'top' || stepped ? c.text : c.textMuted, src);
      });

      // 베껴 낸 몸들 — 깊이 1 부터 차례로, 깊을수록 위에 겹친다
      scene.frames.forEach((f, idx) => {
        const k = idx + 1;
        const x = cardX(g, k);
        const top = cardTop(g, k);
        const entered = f.visited.length > 0;
        const isCur = cur?.depth === k;
        const card = svg('g', {}, root);
        svg('rect', {
          x: rnd(x),
          y: rnd(top),
          width: rnd(g.cardW),
          height: rnd(g.cardH),
          rx: 6,
          fill: c.bg,
          stroke: isCur ? c.text : c.textMuted,
          'stroke-width': isCur ? 1.6 : 1,
          ...(entered ? {} : { 'stroke-dasharray': '4 3' }),
        }, card);
        const wait = waitingLine(scene, k);
        for (const line of g.body) {
          const y = rowY(g, k, line);
          if (isCur && cur?.line === line) {
            h.band = svg('rect', { x: rnd(x + 2), y: rnd(y - g.r / 2), width: rnd(g.cardW - 4), height: rnd(g.r), fill: c.accent, 'fill-opacity': 0.35 }, card);
          } else if (wait === line) {
            svg('rect', { x: rnd(x + 2), y: rnd(y - g.r / 2), width: rnd(g.cardW - 4), height: rnd(g.r), fill: c.textMuted, 'fill-opacity': 0.14 }, card);
            pauseMark(dotX(g, k), y, card);
          }
          const ink = entered && f.visited.includes(line) ? c.text : c.textMuted;
          code(textX(g, scene.rows, k, line), y, scene.rows[line]!.text, ink, card);
        }
        // 머리 — 이 몸이 들고 온 값
        const head = binding(scene, f, entered);
        const hy = top + PAD_Y + g.r * 0.1;
        const hc = chip(x + TEXT_X + 8, hy, textWidth(head.length) + 12, g.r * 0.8, head, isCur ? c.accent : c.border, entered ? c.text : c.textMuted, card);
        // 조건 — 양쪽 값을 넣은 식과 참거짓
        if (f.cond) {
          const shown = `${String(f.cond.l)} ${f.cond.op} ${String(f.cond.r)}`;
          const row = scene.rows[f.cond.line];
          const bx = textX(g, scene.rows, k, f.cond.line) + textWidth(row ? row.text.length : 0) + 8;
          const ink = f.cond.value ? c.success : c.danger;
          chip(bx, rowY(g, k, f.cond.line) - g.r * 0.4, textWidth(shown.length) + 12, g.r * 0.8, shown, ink, ink, card);
        }
        if (step.kind === 'call' && step.depth === idx) h.newCard = card;
        if (step.kind === 'enter' && step.depth === k) h.headChip = hc;
      });

      // 흐름이 지나간 호 — 부르는 줄에서 새 몸의 첫 줄로
      const arcs = svg('g', { fill: 'none' }, root);
      scene.frames.forEach((_f, idx) => {
        const k = idx + 1;
        const b = arcOf(g, scene, k);
        if (!b) return;
        const ink = cur?.depth === k ? c.text : c.textMuted;
        svg('path', { d: bezPath(b), stroke: c.bg, 'stroke-width': 4.5 }, arcs);
        const path = svg('path', { d: bezPath(b), stroke: ink, 'stroke-width': 1.5 }, arcs);
        const tip = b[3];
        const dir = Math.sign(tip.y - b[2].y) || 1;
        const arrow = svg('path', {
          d: `M${rnd(tip.x - 4)},${rnd(tip.y - dir * 6)} L${rnd(tip.x)},${rnd(tip.y)} L${rnd(tip.x + 4)},${rnd(tip.y - dir * 6)}`,
          stroke: ink,
          'stroke-width': 1.5,
        }, arcs);
        if (step.kind === 'enter' && step.depth === k) {
          h.arc = path;
          h.arrow = arrow;
        }
      });

      // 부르는 줄에서 셈한 값 — 아직 새 몸에 들어가지 않았을 때만 줄 끝에 달려 있다
      scene.frames.forEach((f, idx) => {
        if (f.visited.length > 0) return;
        const pb = pillBox(g, scene, idx, f.callLine, argText(f));
        chip(pb.x, pb.y, pb.w, pb.h, argText(f), c.accent, c.text, root);
      });

      // 지금 밟은 자리
      if (cur) {
        h.dot = svg('circle', { cx: rnd(dotX(g, cur.depth)), cy: rnd(rowY(g, cur.depth, cur.line)), r: 4.5, fill: c.accent, stroke: c.text, 'stroke-width': 1.2 }, root);
      }

      // 출력
      const oy = H - M - OUT_H / 2;
      label(M, oy, t('label.output', 'Output'), { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
      scene.output.forEach((o, i) => {
        const oc = chip(outX(scene.output, i), oy - g.r * 0.42, textWidth(o.length) + 14, g.r * 0.84, o, c.border, c.text, root);
        if (i === scene.output.length - 1 && step.kind === 'line' && step.printed) h.outChip = oc;
      });
      return h;
    }

    function play(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const raw = Math.min(1, (Date.now() - start) / ms);
          frame(ease(raw));
          if (raw >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function move(el: Element | null, dx: number, dy: number): void {
      if (!el) return;
      if (dx === 0 && dy === 0) el.removeAttribute('transform');
      else el.setAttribute('transform', `translate(${rnd(dx)},${rnd(dy)})`);
    }

    async function animateStep(scene: RecursionSelfCallScene, h: Handles, mine: number): Promise<void> {
      const g = geometry(scene);
      const step = scene.step;
      const cur = scene.cursor;
      if (!cur) return;

      if (step.kind === 'call') {
        // 부르는 줄로 한 칸 내려오고, 같은 몸이 한 장 베껴져 부르는 자리에서 떨어져 나온다
        const k = step.depth + 1;
        const fromDy = step.from !== null ? rowY(g, step.depth, step.from) - rowY(g, step.depth, step.line) : 0;
        const first = g.body[0] ?? 0;
        const dx0 = step.depth === 0 ? textX(g, scene.rows, 0, first) - textX(g, scene.rows, k, first) : cardX(g, k - 1) - cardX(g, k);
        const dy0 = step.depth === 0 ? rowY(g, 0, first) - rowY(g, k, first) : cardTop(g, k - 1) - cardTop(g, k);
        await play(SLIDE_MS, mine, (e) => {
          move(h.dot, 0, fromDy * (1 - e));
          move(h.band, 0, fromDy * (1 - e));
          move(h.newCard, dx0 * (1 - e), dy0 * (1 - e));
        });
        return;
      }

      if (step.kind === 'enter') {
        // 흐름이 부르는 줄에서 호를 타고 새 몸의 첫 줄로 거슬러 들어가고, 값이 머리로 옮겨 앉는다
        const b = arcOf(g, scene, step.depth);
        const f = scene.frames[step.depth - 1];
        if (!b || !f) return;
        const dotEnd = { x: dotX(g, step.depth), y: rowY(g, step.depth, step.line) };
        const path: Bez = [b[0], b[1], b[2], dotEnd];
        const len = bezLength(b);
        const pb = pillBox(g, scene, step.depth - 1, f.callLine, argText(f));
        const head = binding(scene, f, true);
        const headAt = { x: cardX(g, step.depth) + TEXT_X + 8, y: cardTop(g, step.depth) + PAD_Y + g.r * 0.1 };
        const pillFrom = { x: pb.x, y: pb.y };
        const lift = headAt.y < pillFrom.y ? -g.r * 1.4 : g.r * 1.4;
        const pillPath: Bez = [pillFrom, { x: pillFrom.x, y: pillFrom.y + lift }, { x: headAt.x, y: headAt.y - lift }, headAt];
        const fly = svg('g', {}, root);
        const pill = chip(0, 0, textWidth(head.length) + 12, g.r * 0.8, head, c.accent, c.text, fly);
        if (h.arc) h.arc.setAttribute('stroke-dasharray', `${rnd(len)} ${rnd(len)}`);
        await play(ENTER_MS, mine, (e) => {
          const p = bez(path, e);
          move(h.dot, p.x - dotEnd.x, p.y - dotEnd.y);
          move(h.band, 0, 0);
          if (h.band) h.band.setAttribute('fill-opacity', String(rnd(0.35 * e)));
          if (h.arc) h.arc.setAttribute('stroke-dashoffset', String(rnd(len * (1 - e))));
          if (h.arrow) h.arrow.setAttribute('opacity', e >= 1 ? '1' : '0');
          if (h.headChip) h.headChip.setAttribute('opacity', e >= 1 ? '1' : '0');
          const q = bez(pillPath, e);
          pill.setAttribute('transform', `translate(${rnd(q.x)},${rnd(q.y)})`);
        });
        return;
      }

      if (step.kind === 'line') {
        // 같은 몸 안에서 한 줄 아래로
        const fromDy = step.from !== null ? rowY(g, step.depth, step.from) - rowY(g, step.depth, step.line) : 0;
        let outFrom: Pt | null = null;
        let outTo: Pt | null = null;
        if (step.printed && h.outChip) {
          const row = scene.rows[step.line];
          const open = row ? row.text.indexOf('(') + 1 : 0;
          outFrom = { x: textX(g, scene.rows, step.depth, step.line) + textWidth(open), y: rowY(g, step.depth, step.line) };
          outTo = { x: outX(scene.output, scene.output.length - 1), y: H - M - OUT_H / 2 };
        }
        await play(MOVE_MS + (outFrom ? 100 : 0), mine, (e) => {
          move(h.dot, 0, fromDy * (1 - e));
          move(h.band, 0, fromDy * (1 - e));
          if (outFrom && outTo) move(h.outChip, (outFrom.x - outTo.x) * (1 - e), (outFrom.y - outTo.y) * (1 - e));
        });
      }
    }

    return {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || !prev) return;
        await animateStep(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
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
