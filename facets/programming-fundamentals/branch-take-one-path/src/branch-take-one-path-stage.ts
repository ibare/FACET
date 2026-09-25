/**
 * branch-take-one-path-stage — 갈림길 모양으로 선 프로그램.
 *
 * 줄들이 길 위에 선다. 맨 바깥 줄은 가운데 줄기에, if 의 몸은 왼 갈래에, else 의 몸은
 * 오른 갈래에. 흐름(점)은 길을 따라 움직이고 지나온 길에 자취를 남긴다. 조건 줄에서
 * 점은 참인 갈래 쪽으로 꺾여 들어가고, 다른 갈래는 줄 하나 옮겨지지 않은 채 그 자리에
 * 남는다. 두 갈래 뒤의 줄에서 길은 다시 하나로 모인다.
 *
 * 대입 · 출력 걸음에서는 그 줄이 만든 값이 줄에서 아래 칸으로 흘러내린다.
 */
import {
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { BranchScene, Expr, Line, Value } from './scene.js';

const H = 420;
const W = PIECE_CANVAS_W;
const MOVE_MS = 400;
const FRAME_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CAPTION_Y = 28;
const CODE_TOP = 62;
const CODE_BOTTOM = H - 112;
const VARS_Y = H - 64;
const OUT_Y = H - 28;
const CARD_H_MAX = 30;
const RAIL_GAP = 14;
const CHAR_W = 8.4; // 고정폭 14px 한 글자 폭 (근사)
const SMALL_CHAR_W = 7.8; // 고정폭 13px

type Pt = { x: number; y: number };

/** 줄이 서는 기둥 — 줄기 · 참 갈래 · 거짓 갈래. */
type Col = 'trunk' | 'yes' | 'no';

type Fork = {
  head: number;
  yes: number[];
  elseLine: number | null;
  no: number[];
  after: number | null;
};

type Layout = {
  col: Map<number, Col>;
  y: Map<number, number>;
  fork: Fork | null;
  elseY: number;
  cardW: number;
  cardH: number;
  centerX: Record<Col, number>;
  railX: Record<Col, number>;
  entry: Pt;
};

function fix(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function bodyOf(lines: readonly Line[], i: number): number[] {
  const head = lines[i];
  if (!head) return [];
  const out: number[] = [];
  for (let j = i + 1; j < lines.length; j += 1) {
    const l = lines[j]!;
    if (l.indent <= head.indent) break;
    if (l.indent === head.indent + 1) out.push(j);
  }
  return out;
}

function findFork(lines: readonly Line[]): Fork | null {
  const top: number[] = [];
  lines.forEach((l, i) => {
    if (l.indent === 0) top.push(i);
  });
  for (let k = 0; k < top.length; k += 1) {
    const i = top[k]!;
    if (lines[i]!.stmt.k !== 'if') continue;
    const nxt = top[k + 1];
    const elseLine = nxt !== undefined && lines[nxt]!.stmt.k === 'else' ? nxt : null;
    const afterK = elseLine === null ? k + 1 : k + 2;
    const after = top[afterK] ?? null;
    return {
      head: i,
      yes: bodyOf(lines, i),
      elseLine,
      no: elseLine === null ? [] : bodyOf(lines, elseLine),
      after,
    };
  }
  return null;
}

function layoutOf(lines: readonly Line[]): Layout {
  const fork = findFork(lines);
  const col = new Map<number, Col>();
  const units = new Map<number, number>();
  let u = 0;
  let first = true;
  let elseU = 0;
  lines.forEach((l, i) => {
    if (l.indent !== 0 || l.stmt.k === 'else') return;
    if (!first) u += 1;
    first = false;
    // 갈래 몸의 마지막 줄에서 한 칸 반쯤 아래 — 모이는 길이 설 자리
    if (fork && i === fork.after) u += 1.1 + Math.max(1, fork.yes.length, fork.no.length);
    col.set(i, 'trunk');
    units.set(i, u);
    if (fork && i === fork.head) {
      const start = u + 1.6;
      elseU = start - 0.7;
      fork.yes.forEach((j, n) => {
        col.set(j, 'yes');
        units.set(j, start + n);
      });
      fork.no.forEach((j, n) => {
        col.set(j, 'no');
        units.set(j, start + n);
      });
    }
  });
  // 갈래 몸이 이어지지 않는 줄은 (이 조각의 자료에는 없다) 줄기 끝에 둔다
  let maxU = 0;
  for (const v of units.values()) maxU = Math.max(maxU, v);
  const gap = maxU > 0 ? Math.min(46, (CODE_BOTTOM - CODE_TOP) / maxU) : 46;
  const y = new Map<number, number>();
  for (const [i, v] of units) y.set(i, fix(CODE_TOP + v * gap));
  const cardW = Math.min(176, W * 0.28);
  const centerX: Record<Col, number> = { trunk: W * 0.5, yes: W * 0.26, no: W * 0.74 };
  const railX: Record<Col, number> = {
    trunk: fix(centerX.trunk - cardW / 2 - RAIL_GAP),
    yes: fix(centerX.yes - cardW / 2 - RAIL_GAP),
    no: fix(centerX.no - cardW / 2 - RAIL_GAP),
  };
  const firstTop = lines.findIndex((l) => l.indent === 0);
  const firstY = y.get(firstTop) ?? CODE_TOP;
  return {
    col,
    y,
    fork,
    elseY: fix(CODE_TOP + elseU * gap),
    cardW,
    // 줄이 많아 간격이 좁아지면 카드도 낮춘다 — 세로는 늘리지 않는다
    cardH: fix(Math.min(CARD_H_MAX, gap - 5)),
    centerX,
    railX,
    entry: { x: railX.trunk, y: fix(firstY - 20) },
  };
}

function pointOf(lay: Layout, i: number): Pt {
  const c = lay.col.get(i) ?? 'trunk';
  return { x: lay.railX[c], y: lay.y.get(i) ?? CODE_TOP };
}

function bezier(p: Pt, q: Pt): Pt[] {
  const dy = q.y - p.y;
  const c1 = { x: p.x, y: p.y + dy * 0.55 };
  const c2 = { x: q.x, y: q.y - dy * 0.55 };
  const out: Pt[] = [];
  const n = 20;
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    const a = (1 - t) * (1 - t) * (1 - t);
    const b = 3 * (1 - t) * (1 - t) * t;
    const c = 3 * (1 - t) * t * t;
    const d = t * t * t;
    out.push({
      x: fix(a * p.x + b * c1.x + c * c2.x + d * q.x),
      y: fix(a * p.y + b * c1.y + c * c2.y + d * q.y),
    });
  }
  return out;
}

/** a 에서 b 로 가는 길. a 가 없으면 맨 위 들머리에서. */
function route(lay: Layout, a: number | null, b: number): Pt[] {
  const q = pointOf(lay, b);
  if (a === null) return [lay.entry, q];
  const p = pointOf(lay, a);
  const ca = lay.col.get(a) ?? 'trunk';
  const cb = lay.col.get(b) ?? 'trunk';
  if (ca === cb) return [p, q];
  if (ca === 'trunk') {
    // 갈림 — 조건 줄에서 갈래 쪽으로 꺾여 들어간다
    if (cb === 'no' && lay.fork?.elseLine !== null) {
      const e = { x: lay.railX.no, y: lay.elseY };
      return [...bezier(p, e), q];
    }
    return bezier(p, q);
  }
  // 모임 — 갈래 끝에서 줄기로
  return bezier(p, q);
}

function length(pts: readonly Pt[]): number {
  let s = 0;
  for (let k = 1; k < pts.length; k += 1) {
    s += Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y);
  }
  return s;
}

/** 길의 앞 f 만큼 (0..1, 길이 비율). */
function cut(pts: readonly Pt[], f: number): Pt[] {
  if (f >= 1 || pts.length < 2) return [...pts];
  const total = length(pts) * Math.max(0, f);
  const out: Pt[] = [pts[0]!];
  let run = 0;
  for (let k = 1; k < pts.length; k += 1) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (run + seg >= total) {
      const r = seg > 0 ? (total - run) / seg : 0;
      out.push({ x: fix(a.x + (b.x - a.x) * r), y: fix(a.y + (b.y - a.y) * r) });
      return out;
    }
    run += seg;
    out.push(b);
  }
  return out;
}

function pathD(pts: readonly Pt[]): string {
  return pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${fix(p.x)} ${fix(p.y)}`).join(' ');
}

function showValue(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

function opOf(e: Expr): string | null {
  return 'op' in e ? e.op : null;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return fix(a + (b - a) * p);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = parent.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 운동의 진행 — 1 이면 정적(끝 자리). */
type Motion = { p: number };

function draw(
  svg: SVGSVGElement,
  scene: BranchScene,
  colors: Palette,
  t: Translate,
  motion: Motion,
): void {
  svg.textContent = '';
  const lines = scene.lines;
  if (lines.length === 0) return;
  const lay = layoutOf(lines);
  const fork = lay.fork;
  const p = motion.p;
  const step = scene.step;
  const current = step ? step.line : null;
  const stepped = new Set(scene.trail);

  const headMark = fork ? scene.conds.find((c) => c.line === fork.head) : undefined;
  const takenCol: Col | null = headMark ? (headMark.cond ? 'yes' : 'no') : null;
  const leftCol: Col | null = takenCol === 'yes' ? 'no' : takenCol === 'no' ? 'yes' : null;
  const leftBehind = (c: Col | undefined): boolean => leftCol !== null && c === leftCol;

  // ── 캡션 (지금 일어나는 일) ──
  let caption: string;
  if (!step) {
    caption = t('caption.start', 'Nothing has run yet. The flow starts at the top.');
  } else if (step.kind === 'cond') {
    const verdict = step.cond ? t('label.true', 'true') : t('label.false', 'false');
    caption = t(
      'caption.cond',
      'The condition is {verdict}. The flow turns into that branch; the other branch stays where it is.',
      { verdict },
    );
  } else if (step.kind === 'assign') {
    caption = step.created
      ? t('caption.create', 'New variable {name}, holding {value}.', {
          name: step.name,
          value: showValue(step.value),
        })
      : t('caption.assign', '{name} now holds {value}.', {
          name: step.name,
          value: showValue(step.value),
        });
  } else if (step.kind === 'show') {
    caption = step.rejoin
      ? t('caption.rejoin', 'The two branches meet again here. Shown: {out}', { out: step.out })
      : t('caption.show', 'Shown: {out}', { out: step.out });
  } else {
    caption = t('caption.line', 'This line runs.');
  }
  el(
    svg,
    'text',
    {
      x: fix(W / 2),
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    },
    caption,
  );

  // ── 길 (갈래 전체) ──
  const roads: Array<{ pts: Pt[]; col: Col }> = [];
  const firstTop = lines.findIndex((l) => l.indent === 0 && l.stmt.k !== 'else');
  if (firstTop >= 0) roads.push({ pts: route(lay, null, firstTop), col: 'trunk' });
  const trunk = [...lay.col.entries()].filter(([, c]) => c === 'trunk').map(([i]) => i);
  for (let k = 1; k < trunk.length; k += 1) {
    const a = trunk[k - 1]!;
    const b = trunk[k]!;
    if (fork && a === fork.head && b === fork.after) continue;
    roads.push({ pts: route(lay, a, b), col: 'trunk' });
  }
  if (fork) {
    const arms: Array<[Col, number[]]> = [
      ['yes', fork.yes],
      ['no', fork.no],
    ];
    for (const [c, body] of arms) {
      if (body.length === 0) continue;
      roads.push({ pts: route(lay, fork.head, body[0]!), col: c });
      for (let k = 1; k < body.length; k += 1) {
        roads.push({ pts: route(lay, body[k - 1]!, body[k]!), col: c });
      }
      if (fork.after !== null) {
        roads.push({ pts: route(lay, body[body.length - 1]!, fork.after), col: c });
      }
    }
  }
  const roadLayer = el(svg, 'g', {});
  for (const r of roads) {
    const behind = leftBehind(r.col);
    el(roadLayer, 'path', {
      d: pathD(r.pts),
      fill: 'none',
      stroke: colors.border,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      ...(behind ? { 'stroke-dasharray': '4 5' } : {}),
    });
  }

  // 갈래 이름 (참 · 거짓) — 갈림의 두 팔 가운데쯤
  if (fork) {
    const arms: Array<[Col, number | null]> = [
      ['yes', fork.yes[0] ?? null],
      ['no', fork.elseLine !== null ? fork.elseLine : (fork.no[0] ?? null)],
    ];
    for (const [c, target] of arms) {
      if (target === null) continue;
      const q = c === 'no' && fork.elseLine !== null
        ? { x: lay.railX.no, y: lay.elseY }
        : pointOf(lay, target);
      // 참 쪽은 팔 가운데의 바깥, 거짓 쪽은 조건 줄 카드를 피해 팔 끝 가까이의 안쪽
      const mid = bezier(pointOf(lay, fork.head), q)[c === 'yes' ? 10 : 15]!;
      const taken = takenCol === c;
      el(
        svg,
        'text',
        {
          x: fix(mid.x - 12),
          y: fix(mid.y + 4),
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': taken ? 700 : 400,
          fill: taken ? colors.primary : colors.textMuted,
        },
        c === 'yes' ? t('label.true', 'true') : t('label.false', 'false'),
      );
    }
  }

  // ── 자취 (지나온 길) ──
  const trailLayer = el(svg, 'g', {});
  let dot: Pt = lay.entry;
  const segs: Pt[][] = [];
  for (let k = 0; k < scene.trail.length; k += 1) {
    segs.push(route(lay, k === 0 ? null : scene.trail[k - 1]!, scene.trail[k]!));
  }
  segs.forEach((pts, k) => {
    const last = k === segs.length - 1;
    const shown = last && step ? cut(pts, p) : pts;
    if (shown.length >= 2 && length(shown) > 0.5) {
      el(trailLayer, 'path', {
        d: pathD(shown),
        fill: 'none',
        stroke: colors.primary,
        'stroke-width': 4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
    }
    if (last) dot = shown[shown.length - 1] ?? dot;
  });

  // ── 줄 (길 위의 카드) ──
  const cardLayer = el(svg, 'g', {});
  const textX = (i: number): number => {
    const c = lay.col.get(i) ?? 'trunk';
    return fix(lay.centerX[c] - lay.cardW / 2 + 10);
  };
  lines.forEach((l, i) => {
    if (l.stmt.k === 'else') {
      el(
        cardLayer,
        'text',
        {
          x: fix(lay.centerX.no - lay.cardW / 2 + 10),
          y: fix(lay.elseY + 5),
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.textMuted,
        },
        l.text,
      );
      return;
    }
    const c = lay.col.get(i);
    if (c === undefined) return;
    const y = lay.y.get(i) ?? CODE_TOP;
    const behind = leftBehind(c);
    const isCur = i === current;
    const isStepped = stepped.has(i);
    // 지금 줄의 테두리는 점이 닿는 만큼 켜진다
    const curOn = isCur && p >= 0.85;
    el(cardLayer, 'rect', {
      x: fix(lay.centerX[c] - lay.cardW / 2),
      y: fix(y - lay.cardH / 2),
      width: fix(lay.cardW),
      height: lay.cardH,
      rx: 6,
      fill: isStepped && (!isCur || curOn) ? colors.bgSubtle : colors.bg,
      stroke: curOn ? colors.itemActive : isStepped && !isCur ? colors.primary : colors.border,
      'stroke-width': curOn ? 2.5 : 1.5,
      ...(behind ? { 'stroke-dasharray': '4 4' } : {}),
    });
    el(
      cardLayer,
      'text',
      {
        x: textX(i),
        y: fix(y + 5),
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: behind ? colors.textMuted : colors.text,
      },
      l.text,
    );
  });

  // 조건 줄 곁의 판정 — 셈한 두 값과 참/거짓
  for (const m of scene.conds) {
    const src = lines[m.line];
    if (!src || (src.stmt.k !== 'if' && src.stmt.k !== 'elif')) continue;
    const c = lay.col.get(m.line) ?? 'trunk';
    const y = lay.y.get(m.line) ?? CODE_TOP;
    const verdict = m.cond ? t('label.true', 'true') : t('label.false', 'false');
    const op = opOf(src.stmt.cond);
    const expr =
      m.operands && op ? `${showValue(m.operands[0])} ${op} ${showValue(m.operands[1])}` : src.text;
    const fresh = step?.kind === 'cond' && step.line === m.line;
    const q = fresh ? p : 1;
    const x0 = lay.centerX[c] + lay.cardW / 2 + 12;
    el(
      svg,
      'text',
      {
        x: lerp(x0 - 14, x0, q),
        y: fix(y + 5),
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: colors.primary,
        ...(q < 1 ? { opacity: fix(q) } : {}),
      },
      t('tag.cond', '{expr} → {verdict}', { expr, verdict }),
    );
  }

  // 가지 않은 갈래 — 그 자리에 남은 채 밟은 줄을 센다
  if (fork && leftCol !== null) {
    const body = leftCol === 'yes' ? fork.yes : fork.no;
    if (body.length > 0) {
      const lastY = lay.y.get(body[body.length - 1]!) ?? CODE_TOP;
      const n = body.filter((j) => stepped.has(j)).length;
      el(
        svg,
        'text',
        {
          x: fix(lay.centerX[leftCol]),
          y: fix(lastY + lay.cardH / 2 + 18),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        t('label.notTaken', 'branch not taken · lines run: {n}', { n }),
      );
    }
  }

  // ── 변수 칸 ──
  const labelX = 24;
  const slotX0 = 110;
  el(
    svg,
    'text',
    {
      x: labelX,
      y: fix(VARS_Y + 5),
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    },
    t('label.vars', 'variables'),
  );
  // 프로그램이 끝났을 때 — 가지 않은 갈래에서만 값을 바꾸는 이름 가운데 처음 값 그대로인 것
  const kept = new Set<string>();
  if (scene.done && fork && leftCol !== null) {
    const leftBody = new Set(leftCol === 'yes' ? fork.yes : fork.no);
    const onlyThere = new Set<string>();
    const elsewhere = new Set<string>();
    lines.forEach((l, i) => {
      if (l.stmt.k !== 'assign' || l.stmt.declare) return;
      (leftBody.has(i) ? onlyThere : elsewhere).add(l.stmt.to);
    });
    for (const v of scene.vars) {
      if (onlyThere.has(v.name) && !elsewhere.has(v.name) && v.value === v.first) kept.add(v.name);
    }
  }
  let sx = slotX0;
  const flowing = step && step.kind === 'assign' && p < 1 ? step : null;
  for (const v of scene.vars) {
    const text = `${v.name} = ${showValue(v.value)}`;
    const w = fix(text.length * SMALL_CHAR_W + 18);
    let x = sx;
    let y = VARS_Y;
    if (flowing && flowing.name === v.name) {
      const from = { x: textX(flowing.line) - 9, y: lay.y.get(flowing.line) ?? CODE_TOP };
      x = lerp(from.x, sx, p);
      y = lerp(from.y, VARS_Y, p);
    }
    const g = el(svg, 'g', { transform: `translate(${fix(x)} ${fix(y)})` });
    el(g, 'rect', {
      x: 0,
      y: -13,
      width: w,
      height: 26,
      rx: 5,
      fill: colors.bgSubtle,
      stroke: step?.kind === 'assign' && step.name === v.name ? colors.itemActive : colors.border,
      'stroke-width': 1.5,
      // 가지 않은 갈래가 바꾸려던 이름 — 그 갈래의 점선을 이어받는다
      ...(kept.has(v.name) ? { 'stroke-dasharray': '4 4' } : {}),
    });
    if (kept.has(v.name)) {
      el(
        g,
        'text',
        {
          x: fix(w / 2),
          y: -20,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        t('label.unchanged', 'still its first value'),
      );
    }
    el(
      g,
      'text',
      { x: 9, y: 5, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text },
      text,
    );
    sx = fix(sx + w + 10);
  }
  // ── 출력 ──
  el(
    svg,
    'text',
    {
      x: labelX,
      y: fix(OUT_Y + 5),
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    },
    t('label.output', 'output'),
  );
  const showing = step && step.kind === 'show' && p < 1 ? step : null;
  let ox = slotX0;
  scene.output.forEach((o, k) => {
    const last = k === scene.output.length - 1;
    let x = ox;
    let y = OUT_Y;
    if (showing && last) {
      x = lerp(textX(showing.line), ox, p);
      y = lerp(lay.y.get(showing.line) ?? CODE_TOP, OUT_Y, p);
    }
    el(
      svg,
      'text',
      {
        x: fix(x),
        y: fix(y + 5),
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: colors.text,
      },
      o,
    );
    ox = fix(ox + o.length * CHAR_W + 16);
  });

  // ── 흐름 (점) ──
  el(svg, 'circle', {
    cx: fix(dot.x),
    cy: fix(dot.y),
    r: 7,
    fill: colors.primary,
    stroke: colors.bg,
    'stroke-width': 2,
  });
}

export const branchTakeOnePathStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<BranchScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function drawStatic(scene: BranchScene): void {
      draw(svg, scene, colors, t, { p: 1 });
    }

    function flow(scene: BranchScene, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const t0 = Date.now();
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            done();
            return;
          }
          const raw = Math.min(1, (Date.now() - t0) / MOVE_MS);
          draw(svg, scene, colors, t, { p: ease(raw) });
          if (raw >= 1) {
            done();
            return;
          }
          const h = setTimeout(() => {
            timers.delete(h);
            tick();
          }, FRAME_MS);
          timers.add(h);
        };
        tick();
      });
    }

    return {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        // 흘릴지는 앞 장면으로 고른다 — 한 걸음 나아갔을 때만
        const moves =
          opts.animate &&
          next.step !== null &&
          prev !== null &&
          prev.lines.length === next.lines.length &&
          next.trail.length === prev.trail.length + 1;
        if (!moves) {
          drawStatic(next);
          return;
        }
        await flow(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const h of timers) clearTimeout(h);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
