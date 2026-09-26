/**
 * nfa-to-dfa 무대.
 *
 * 위는 NFA, 아래는 자라는 DFA. 한 걸음마다 닿는 NFA 자리들의 **복제**가 제 자리에서 떨어져 나와
 * 아래로 날아가 한 덩이로 뭉친다. 새 모임이면 그 둘레에 새 DFA 자리가 서고, 이미 선 덩이와 모임이
 * 같으면 그 덩이의 알갱이 위에 그대로 포개지고 옮김만 그리로 난다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import { dName, formatSet, type Nfa } from './algorithm.js';
import type { DArc, DState, NfaToDfaScene } from './scene.js';

const H = 470;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 번의 길이 (ms) — 걸음 = 운동 + stepMs */
const MOTION_MS = 600;

const PAD = 14;
const NFA_TOP = 58;
const NFA_ROW_PITCH = 64;
const NFA_R = 16;
const DIVIDER_Y = 190;
const DFA_TOP = 250;
const DFA_ROW_PITCH_MAX = 100;
const DFA_ROWS_SPAN = 100;
const DFA_COL_PITCH_MAX = 200;
const CHIP_R = 10;
const CHIP_PITCH = 24;
const BLOB_HH = 18;
const CAPTION_Y = 438;

type Pt = { x: number; y: number };

const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
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

function label(parent: Element, x: number, y: number, body: string, opts: Record<string, string | number>): SVGTextElement {
  const node = el('text', { x, y, ...opts }, parent);
  node.textContent = body;
  return node;
}

// ───────── 자리 셈 (좌표는 여기서만) ─────────

/** 없으면 던지는 조회 — 좌표 · 손잡이가 빠진 채 그리거나 운동을 건너뛰지 않는다 (C6) */
function need<K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V {
  const v = map.get(key);
  if (v === undefined) throw new Error(`nfa-to-dfa 무대: ${what} (${String(key)}) 가 없다`);
  return v;
}

/** NFA 자리 — 시작에서 너비 우선으로 깊이가 칸, 가지 차례가 줄 */
function nfaLayout(nfa: Nfa): Map<number, Pt> {
  const col = new Map<number, number>([[nfa.start, 0]]);
  const row = new Map<number, number>([[nfa.start, 0]]);
  const taken = new Set<string>([`0:0`]);
  const queue = [nfa.start];
  for (let qi = 0; qi < queue.length; qi += 1) {
    const x = queue[qi];
    if (x === undefined) break;
    let branch = 0;
    for (const e of nfa.edges) {
      if (e.from !== x || col.has(e.to)) continue;
      const c = need(col, x, 'NFA 칸') + 1;
      let r = need(row, x, 'NFA 줄') + branch;
      while (taken.has(`${c}:${r}`)) r += 1;
      taken.add(`${c}:${r}`);
      col.set(e.to, c);
      row.set(e.to, r);
      queue.push(e.to);
      branch += 1;
    }
  }
  for (const s of nfa.states) {
    if (!col.has(s)) throw new Error(`nfa-to-dfa 무대: NFA 자리 ${s} 가 시작에서 닿지 않는다`);
  }
  const cols = Math.max(...col.values()) + 1;
  const rows = Math.max(...row.values()) + 1;
  const left = PAD + 56;
  const right = W - 150;
  const pitch = cols > 1 ? (right - left) / (cols - 1) : 0;
  const rowPitch = rows > 1 ? Math.min(NFA_ROW_PITCH, (DIVIDER_Y - 70 - NFA_TOP) / (rows - 1)) : 0;
  const out = new Map<number, Pt>();
  for (const s of nfa.states) {
    const c = need(col, s, 'NFA 칸');
    const onlyInCol = [...col.values()].filter((v) => v === c).length === 1;
    const y = onlyInCol && c === 0 ? NFA_TOP + (rowPitch * (rows - 1)) / 2 : NFA_TOP + need(row, s, 'NFA 줄') * rowPitch;
    out.set(s, { x: left + c * pitch, y });
  }
  return out;
}

/** DFA 덩이 자리 — 세운 덩이의 칸 + 1 이 칸, 칸 안에서 선 차례가 줄 */
function dfaLayout(dstates: readonly DState[]): Map<number, Pt> {
  const col = new Map<number, number>();
  const row = new Map<number, number>();
  const perCol = new Map<number, number>();
  for (const d of dstates) {
    const c = d.parent === null ? 0 : need(col, d.parent, 'DFA 칸') + 1;
    const r = perCol.has(c) ? need(perCol, c, 'DFA 칸의 줄 수') : 0;
    perCol.set(c, r + 1);
    col.set(d.id, c);
    row.set(d.id, r);
  }
  const cols = Math.max(1, ...perCol.keys()) + 1;
  const maxRows = Math.max(1, ...perCol.values());
  const colPitch = Math.min(DFA_COL_PITCH_MAX, (W - 2 * PAD - 160) / Math.max(1, cols - 1));
  const rowPitch = maxRows > 1 ? Math.min(DFA_ROW_PITCH_MAX, DFA_ROWS_SPAN / (maxRows - 1)) : 0;
  const out = new Map<number, Pt>();
  for (const d of dstates) {
    const c = need(col, d.id, 'DFA 칸');
    const single = need(perCol, c, 'DFA 칸의 줄 수') === 1 && c === 0;
    const y = single ? DFA_TOP + DFA_ROWS_SPAN / 2 : DFA_TOP + need(row, d.id, 'DFA 줄') * rowPitch;
    out.set(d.id, { x: PAD + 96 + c * colPitch, y });
  }
  return out;
}

function blobHalfW(n: number): number {
  return (n * CHIP_PITCH + 12) / 2;
}

/** 덩이 안 알갱이 하나의 자리 */
function chipPos(center: Pt, set: readonly number[], s: number): Pt {
  const i = set.indexOf(s);
  if (i < 0) throw new Error(`nfa-to-dfa 무대: 자리 ${s} 가 덩이에 없다`);
  return { x: center.x - ((set.length - 1) * CHIP_PITCH) / 2 + i * CHIP_PITCH, y: center.y };
}

function unit(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** 둥근 네모 둘레까지 */
function rectExit(c: Pt, hw: number, hh: number, u: Pt, gap: number): Pt {
  const tx = Math.abs(u.x) > 1e-6 ? hw / Math.abs(u.x) : Infinity;
  const ty = Math.abs(u.y) > 1e-6 ? hh / Math.abs(u.y) : Infinity;
  const t = Math.min(tx, ty) + gap;
  return { x: c.x + u.x * t, y: c.y + u.y * t };
}

/** 한 쌍(출발, 도착) 의 이름표를 모은다 — `i, f` */
function groupEdges<E extends { from: number; to: number }>(edges: readonly E[], name: (e: E) => string) {
  const out: { from: number; to: number; names: string[]; ids: number[] }[] = [];
  edges.forEach((e, i) => {
    const hit = out.find((g) => g.from === e.from && g.to === e.to);
    if (hit) {
      hit.names.push(name(e));
      hit.ids.push(i);
    } else out.push({ from: e.from, to: e.to, names: [name(e)], ids: [i] });
  });
  return out;
}

// ───────── 그리기 ─────────

type Handles = {
  /** 덩이의 둘레(알갱이 제외) */
  frames: Map<number, SVGGElement>;
  /** 덩이의 알갱이 묶음 */
  chipSets: Map<number, SVGGElement>;
  /** 옮김 한 쌍 — `from>to` */
  arcs: Map<string, SVGGElement>;
  overlay: SVGGElement;
  nfaPos: Map<number, Pt>;
  dfaPos: Map<number, Pt>;
};

function arrowHead(parent: Element, tip: Pt, u: Pt, fill: string): void {
  const n = { x: -u.y, y: u.x };
  const b = { x: tip.x - u.x * 8, y: tip.y - u.y * 8 };
  el(
    'polygon',
    {
      points: [tip, { x: b.x + n.x * 4, y: b.y + n.y * 4 }, { x: b.x - n.x * 4, y: b.y - n.y * 4 }]
        .map((p) => `${r1(p.x)},${r1(p.y)}`)
        .join(' '),
      fill,
    },
    parent,
  );
}

function edgeLabel(parent: Element, at: Pt, body: string, fill: string, c: Palette): void {
  label(parent, at.x, at.y, body, {
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': fonts.mono,
    'font-size': fontSizes.sm,
    fill,
    stroke: c.bg,
    'stroke-width': 3,
    'paint-order': 'stroke',
  });
}

/** 곧은 옮김 */
function straight(parent: Element, a: Pt, b: Pt, names: string, stroke: string, width: number, c: Palette): void {
  el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke, 'stroke-width': width }, parent);
  const u = unit(a, b);
  arrowHead(parent, b, u, stroke);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let n = { x: u.y, y: -u.x };
  if (n.y > 0 || (Math.abs(n.y) < 1e-6 && n.x > 0)) n = { x: -n.x, y: -n.y };
  edgeLabel(parent, { x: mid.x + n.x * 10, y: mid.y + n.y * 10 }, names, stroke, c);
}

/** 제자리 옮김 — 아래로 도는 고리 */
function loop(parent: Element, cx: number, bottom: number, names: string, stroke: string, width: number, c: Palette): void {
  const a = { x: cx - 8, y: bottom };
  const b = { x: cx + 8, y: bottom };
  const c1 = { x: cx - 26, y: bottom + 30 };
  const c2 = { x: cx + 26, y: bottom + 30 };
  el(
    'path',
    {
      d: `M ${r1(a.x)} ${r1(a.y)} C ${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(b.x)} ${r1(b.y)}`,
      fill: 'none',
      stroke,
      'stroke-width': width,
    },
    parent,
  );
  arrowHead(parent, b, unit(c2, b), stroke);
  edgeLabel(parent, { x: cx, y: bottom + 32 }, names, stroke, c);
}

function drawChip(parent: Element, at: Pt, s: number, fill: string, stroke: string, ink: string): SVGGElement {
  const g = el('g', {}, parent);
  el('circle', { cx: at.x, cy: at.y, r: CHIP_R, fill, stroke, 'stroke-width': 1.5 }, g);
  label(g, at.x, at.y, String(s), {
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': fonts.mono,
    'font-size': fontSizes.xs,
    fill: ink,
  });
  return g;
}

function fitSize(body: string, max: number): string {
  const room = W - 2 * PAD;
  const est = body.length * max * 0.56;
  return `${r1(est > room ? (max * room) / est : max)}px`;
}

function drawStatic(svg: SVGSVGElement, scene: NfaToDfaScene, c: Palette, t: Translate): Handles {
  svg.textContent = '';
  const root = el('g', {}, svg);
  const { nfa, step } = scene;
  const nfaPos = nfaLayout(nfa);
  const dfaPos = dfaLayout(scene.dstates);

  // 이번 걸음에 나서는 NFA 자리 · 닿는 자리 · 탄 옮김 — 전부 알고리즘이 보낸 값
  const fromSet = step.kind === 'move' ? step.source : step.kind === 'open' ? step.seed : [];
  const reached = step.kind === 'start' ? [] : step.set;
  const litIds = step.kind === 'start' ? [] : step.edges;

  // ── 구역 이름
  label(root, PAD, 24, t('label.nfa', 'NFA'), { 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.textMuted });
  el('line', { x1: PAD, y1: DIVIDER_Y, x2: W - PAD, y2: DIVIDER_Y, stroke: c.border, 'stroke-width': 1 }, root);
  label(root, PAD, DIVIDER_Y + 22, t('label.dfa', 'DFA'), { 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.textMuted });

  // ── NFA 옮김
  const nfaEdges = el('g', {}, root);
  const groups = groupEdges(nfa.edges, (e) => (e.on === null ? 'ε' : e.on));
  for (const g of groups) {
    const lit = g.ids.some((i) => litIds.includes(i));
    const stroke = lit ? c.itemComparing : c.textMuted;
    const width = lit ? 2.5 : 1.25;
    const a = need(nfaPos, g.from, 'NFA 자리 좌표');
    const b = need(nfaPos, g.to, 'NFA 자리 좌표');
    if (g.from === g.to) loop(nfaEdges, a.x, a.y + NFA_R - 2, g.names.join(', '), stroke, width, c);
    else {
      const u = unit(a, b);
      straight(
        nfaEdges,
        { x: a.x + u.x * NFA_R, y: a.y + u.y * NFA_R },
        { x: b.x - u.x * (NFA_R + 2), y: b.y - u.y * (NFA_R + 2) },
        g.names.join(', '),
        stroke,
        width,
        c,
      );
    }
  }
  // 시작 화살
  const s0 = need(nfaPos, nfa.start, '시작 자리 좌표');
  el('line', { x1: s0.x - NFA_R - 26, y1: s0.y, x2: s0.x - NFA_R - 2, y2: s0.y, stroke: c.text, 'stroke-width': 1.5 }, root);
  arrowHead(root, { x: s0.x - NFA_R - 2, y: s0.y }, { x: 1, y: 0 }, c.text);

  // ── NFA 자리
  for (const s of nfa.states) {
    const p = need(nfaPos, s, 'NFA 자리 좌표');
    const on = reached.includes(s);
    const leaving = fromSet.includes(s);
    const g = el('g', {}, root);
    el('circle', {
      cx: p.x,
      cy: p.y,
      r: NFA_R,
      fill: on ? c.accent : c.bg,
      stroke: leaving ? c.itemComparing : c.text,
      'stroke-width': leaving ? 3 : 1.5,
    }, g);
    const acc = nfa.accepts.find((a) => a.state === s);
    if (acc) el('circle', { cx: p.x, cy: p.y, r: NFA_R - 4, fill: 'none', stroke: on ? c.stateInk : c.text, 'stroke-width': 1.25 }, g);
    label(g, p.x, p.y, String(s), {
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: on ? c.stateInk : c.text,
    });
    if (acc) {
      const rule = scene.rules.find((r) => r.kind === acc.kind);
      const kx = p.x + NFA_R + 10;
      label(g, kx, p.y, acc.kind, {
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: c.text,
      });
      if (rule) {
        label(g, kx + acc.kind.length * SM * 0.62 + 8, p.y, rule.pattern, {
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
      }
    }
  }

  // ── DFA 옮김
  const frames = new Map<number, SVGGElement>();
  const chipSets = new Map<number, SVGGElement>();
  const arcs = new Map<string, SVGGElement>();
  const dfaArcs = el('g', {}, root);
  const findD = (id: number): DState => {
    const d = scene.dstates.find((x) => x.id === id);
    if (!d) throw new Error(`nfa-to-dfa 무대: D${id} 가 없다`);
    return d;
  };
  for (const g of groupEdges<DArc>(scene.arcs, (a) => a.ch)) {
    const lit = step.kind === 'move' && step.from === g.from && step.to === g.to;
    const stroke = lit ? c.itemComparing : c.text;
    const width = lit ? 2.5 : 1.5;
    const a = need(dfaPos, g.from, 'DFA 덩이 좌표');
    const b = need(dfaPos, g.to, 'DFA 덩이 좌표');
    const grp = el('g', {}, dfaArcs);
    arcs.set(`${g.from}>${g.to}`, grp);
    if (g.from === g.to) loop(grp, a.x, a.y + BLOB_HH, g.names.join(', '), stroke, width, c);
    else {
      const u = unit(a, b);
      const da = findD(g.from);
      const db = findD(g.to);
      straight(
        grp,
        rectExit(a, blobHalfW(da.set.length), BLOB_HH, u, 2),
        rectExit(b, blobHalfW(db.set.length), BLOB_HH, { x: -u.x, y: -u.y }, 3),
        g.names.join(', '),
        stroke,
        width,
        c,
      );
    }
  }

  // ── DFA 덩이
  for (const d of scene.dstates) {
    const p = need(dfaPos, d.id, 'DFA 덩이 좌표');
    const target = step.kind !== 'start' && (step.kind === 'open' ? step.d : step.to) === d.id;
    const source = step.kind === 'move' && step.from === d.id;
    const hw = blobHalfW(d.set.length);
    const frame = el('g', {}, root);
    frames.set(d.id, frame);
    el('rect', {
      x: p.x - hw,
      y: p.y - BLOB_HH,
      width: hw * 2,
      height: BLOB_HH * 2,
      rx: BLOB_HH,
      fill: c.bgSubtle,
      stroke: source ? c.itemComparing : target ? c.text : c.textMuted,
      'stroke-width': source || target ? 3 : 1.5,
    }, frame);
    if (d.accept !== null) {
      el('rect', {
        x: p.x - hw + 4,
        y: p.y - BLOB_HH + 4,
        width: hw * 2 - 8,
        height: BLOB_HH * 2 - 8,
        rx: BLOB_HH - 4,
        fill: 'none',
        stroke: c.text,
        'stroke-width': 1,
      }, frame);
    }
    // 이름은 가운데 왼쪽, 받는 종류는 오른쪽 — 위에서 곧게 내려오는 옮김이 둘 사이로 지난다
    label(frame, p.x - 8, p.y - BLOB_HH - 7, dName(d.id), {
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      'font-weight': 700,
      fill: c.text,
    });
    if (d.accept !== null) {
      label(frame, p.x + 8, p.y - BLOB_HH - 7, d.accept, {
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: c.textMuted,
      });
    }
    const chips = el('g', {}, root);
    chipSets.set(d.id, chips);
    for (const s of d.set) {
      drawChip(chips, chipPos(p, d.set, s), s, target ? c.accent : c.bg, c.text, target ? c.stateInk : c.text);
    }
  }

  // ── 할 일
  const todo = scene.todo;
  const todoText =
    scene.dstates.length === 0
      ? ''
      : todo.length === 0
        ? t('label.todoNone', 'To do: none')
        : t('label.todo', 'To do: {list}', { list: todo.map((d) => dName(d)).join(', ') });
  if (todoText !== '') {
    label(root, PAD + 44, DIVIDER_Y + 22, todoText, {
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
  }

  // ── 캡션
  const lines = captionLines(scene, t);
  lines.forEach((body, i) => {
    label(root, W / 2, CAPTION_Y + i * (MD + 8), body, {
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fitSize(body, MD),
      'font-weight': i === 0 ? 500 : 400,
      fill: i === 0 ? c.text : c.textMuted,
    });
  });

  const overlay = el('g', {}, root);
  return { frames, chipSets, arcs, overlay, nfaPos, dfaPos };
}

function captionLines(scene: NfaToDfaScene, t: Translate): string[] {
  const { step } = scene;
  if (step.kind === 'start') return [t('caption.start', 'Start state: {start}. The DFA is still empty.', { start: scene.nfa.start })];
  if (step.kind === 'open') {
    return [
      t('caption.open', 'Gather every state reachable from {seed} by ε alone: {set}. New state: {d}.', {
        seed: formatSet(step.seed),
        set: formatSet(step.set),
        d: dName(step.d),
      }),
    ];
  }
  const vars = {
    from: dName(step.from),
    ch: step.ch,
    moved: formatSet(step.moved),
    set: formatSet(step.set),
    to: dName(step.to),
  };
  const closed = step.added.length > 0;
  const first = step.fresh
    ? closed
      ? t('caption.newClosure', 'From {from} on {ch}: {moved}, ε-closure {set}. New state: {to}.', vars)
      : t('caption.new', 'From {from} on {ch}: {set}. New state: {to}.', vars)
    : closed
      ? t('caption.sameClosure', 'From {from} on {ch}: {moved}, ε-closure {set}. Already a state: {to}.', vars)
      : t('caption.same', 'From {from} on {ch}: {set}. Already a state: {to}.', vars);
  if (scene.todo.length > 0) return [first];
  return [
    first,
    t('caption.summary', 'DFA states: {n} · transitions: {m}. Nothing left to do.', {
      n: scene.dstates.length,
      m: scene.arcs.length,
    }),
  ];
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
}

function windowed(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}

export const nfaToDfaStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function frame(): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, 16);
        timers.add(id);
      });
    }

    async function animate(next: NfaToDfaScene, prev: NfaToDfaScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind === 'start') return;
      const h = drawStatic(svg, next, c, t);
      const targetId = step.kind === 'open' ? step.d : step.to;
      const fresh = step.kind === 'open' || step.fresh;
      const center = need(h.dfaPos, targetId, 'DFA 덩이 좌표');
      const pairNew = step.kind === 'move' && !prev.arcs.some((a) => a.from === step.from && a.to === step.to);
      const arc = step.kind === 'move' ? need(h.arcs, `${step.from}>${step.to}`, 'DFA 옮김 손잡이') : null;
      const frameEl = need(h.frames, targetId, '덩이 둘레 손잡이');
      const realChips = need(h.chipSets, targetId, '덩이 알갱이 손잡이');

      // 날아가는 복제 — 원본(NFA 자리)은 남는다
      const first = step.kind === 'open' ? step.seed : step.moved;
      const ghosts: { g: SVGGElement; from: Pt; to: Pt; a: number; b: number }[] = [];
      for (const s of step.set) {
        const from = need(h.nfaPos, s, 'NFA 자리 좌표');
        const to = chipPos(center, step.set, s);
        const g = drawChip(h.overlay, to, s, c.accent, c.text, c.stateInk);
        const early = first.includes(s);
        ghosts.push({ g, from, to, a: early ? 0 : 0.3, b: early ? 0.55 : 0.8 });
      }
      if (fresh) realChips.setAttribute('opacity', '0');
      if (fresh) frameEl.setAttribute('opacity', '0');
      if (pairNew && arc) arc.setAttribute('opacity', '0');

      const t0 = performance.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (performance.now() - t0) / MOTION_MS);
        for (const gh of ghosts) {
          const k = 1 - windowed(p, gh.a, gh.b);
          gh.g.setAttribute('transform', `translate(${r1((gh.from.x - gh.to.x) * k)} ${r1((gh.from.y - gh.to.y) * k)})`);
        }
        if (fresh) {
          const k = windowed(p, 0.45, 0.8);
          const s = 0.3 + 0.7 * k;
          frameEl.setAttribute('opacity', String(r1(k)));
          frameEl.setAttribute(
            'transform',
            `translate(${r1(center.x)} ${r1(center.y)}) scale(${Math.round(s * 1000) / 1000}) translate(${r1(-center.x)} ${r1(-center.y)})`,
          );
        }
        if (pairNew && arc) arc.setAttribute('opacity', String(r1(windowed(p, 0.75, 1))));
        if (p >= 1) break;
        await frame();
      }
    }

    return {
      render(next: NfaToDfaScene, prev: NfaToDfaScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step.kind === 'start') {
          drawStatic(svg, next, c, t);
          return;
        }
        return animate(next, prev, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(svg, next, c, t);
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
