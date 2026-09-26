/**
 * pattern-matches-set 무대.
 *
 * 위에는 무늬 글자, 가운데는 무늬를 길 그림(갈림마다 갈래가 벌어지는 선로)으로 편 것, 아래는 모임.
 * 한 걸음에 길 하나 — 점 하나가 출발에서 골라진 갈래를 따라 끝까지 가며 지나는 칸의 글자를 베껴
 * 싣고(칸의 글자는 그대로 남는다), 끝에 닿으면 실은 글줄이 떨어져 모임 속 제 자리로 내려앉는다.
 * 무늬는 그대로이고 모임만 하나씩 불어난다.
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
} from '@ffacet/core/runtime';
import { decisionPoints, printPattern, type Choice, type DecisionPoint, type PatternNode } from './algorithm';
import type { Member, PatternScene } from './scene';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 380;
const W = PIECE_CANVAS_W;
const MARGIN = 20;

/** 세로 띠 */
const HEAD_Y = 30;
const DIAG_TOP = 66;
const DIAG_BOTTOM = 226;
const CAPTION_Y = 254;
const SET_TOP = 272;
const SET_BOTTOM = H - 10;

/** 길 그림의 본디 단위 (캔버스에 맞춰 한 배율로 늘린다) */
const BOX = 30;
const FORK = 64;
const JOINT = 16;
const BAND_GAP = 12;
const LEAD = 20;
const SKIP_ROOM = 8;

/** 운동 */
const TRAVEL_MS = 700;
const DROP_MS = 400;
const FRAME_MS = 16;

type Pt = { x: number; y: number };
type Size = { w: number; up: number; dn: number };
type Visit = { at: Pt; ch: string };
type Rail = Pt[];
type BoxMark = { at: Pt; ch: string; id: string };

/** 좌표 끝자리와 -0 을 걷는다 */
function rd(v: number): number {
  return Math.round(v * 10) / 10 || 0;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function pointsAttr(pts: Pt[]): string {
  return pts.map((p) => `${rd(p.x)},${rd(p.y)}`).join(' ');
}

// ───────────── 길 그림의 셈 (본디 단위, 가로 x · 선로 높이 y) ─────────────

function measure(n: PatternNode): Size {
  switch (n.kind) {
    case 'lit':
      return { w: BOX, up: BOX / 2, dn: BOX / 2 };
    case 'seq': {
      const sizes = n.items.map(measure);
      return {
        w: sizes.reduce((a, s) => a + s.w, 0) + JOINT * (sizes.length - 1),
        up: Math.max(...sizes.map((s) => s.up)),
        dn: Math.max(...sizes.map((s) => s.dn)),
      };
    }
    case 'alt': {
      const sizes = n.options.map(measure);
      const total = sizes.reduce((a, s) => a + s.up + s.dn, 0) + BAND_GAP * (sizes.length - 1);
      return { w: Math.max(...sizes.map((s) => s.w)) + 2 * FORK, up: total / 2, dn: total / 2 };
    }
    case 'opt': {
      const s = measure(n.item);
      return { w: s.w + 2 * FORK, up: s.up + BAND_GAP + SKIP_ROOM, dn: s.dn };
    }
  }
}

/** 갈래마다 선로 높이 */
function bandCenters(n: PatternNode & { kind: 'alt' }, y: number): number[] {
  const sizes = n.options.map(measure);
  const total = sizes.reduce((a, s) => a + s.up + s.dn, 0) + BAND_GAP * (sizes.length - 1);
  let top = y - total / 2;
  return sizes.map((s) => {
    const c = top + s.up;
    top += s.up + s.dn + BAND_GAP;
    return c;
  });
}

function skipY(n: PatternNode & { kind: 'opt' }, y: number): number {
  return y - measure(n.item).up - BAND_GAP;
}

/** 무늬 전체의 선로와 칸을 늘어놓는다 */
function layRails(n: PatternNode, x: number, y: number, id: string, rails: Rail[], boxes: BoxMark[], skips: Pt[]): void {
  const size = measure(n);
  switch (n.kind) {
    case 'lit':
      rails.push([{ x, y }, { x: x + BOX, y }]);
      boxes.push({ at: { x: x + BOX / 2, y }, ch: n.ch, id });
      return;
    case 'seq': {
      let cx = x;
      n.items.forEach((it, i) => {
        const w = measure(it).w;
        layRails(it, cx, y, `${id}.${i}`, rails, boxes, skips);
        cx += w;
        if (i < n.items.length - 1) {
          rails.push([{ x: cx, y }, { x: cx + JOINT, y }]);
          cx += JOINT;
        }
      });
      return;
    }
    case 'alt': {
      const centers = bandCenters(n, y);
      const inner = size.w - 2 * FORK;
      n.options.forEach((opt, i) => {
        const yb = centers[i];
        if (yb === undefined) throw new Error(`길 그림: ${id} 의 갈래 ${i} 높이가 없다`);
        const w = measure(opt).w;
        const ox = x + FORK + (inner - w) / 2;
        rails.push([{ x, y }, { x: x + FORK / 2, y: yb }, { x: ox, y: yb }]);
        layRails(opt, ox, yb, `${id}.${i}`, rails, boxes, skips);
        rails.push([{ x: ox + w, y: yb }, { x: x + size.w - FORK / 2, y: yb }, { x: x + size.w, y }]);
      });
      return;
    }
    case 'opt': {
      const sy = skipY(n, y);
      const w = measure(n.item).w;
      rails.push([{ x, y }, { x: x + FORK / 2, y: sy }, { x: x + size.w - FORK / 2, y: sy }, { x: x + size.w, y }]);
      skips.push({ x: x + size.w / 2, y: sy });
      rails.push([{ x, y }, { x: x + FORK, y }]);
      layRails(n.item, x + FORK, y, `${id}.0`, rails, boxes, skips);
      rails.push([{ x: x + FORK + w, y }, { x: x + size.w, y }]);
      return;
    }
  }
}

/** 고른 것을 따라 길 하나를 긋는다. 지나는 칸의 글자를 차례로 모은다. */
function trace(n: PatternNode, x: number, y: number, id: string, picks: Map<string, Choice>, pts: Pt[], visits: Visit[]): void {
  const size = measure(n);
  switch (n.kind) {
    case 'lit':
      pts.push({ x, y }, { x: x + BOX, y });
      visits.push({ at: { x: x + BOX / 2, y }, ch: n.ch });
      return;
    case 'seq': {
      let cx = x;
      n.items.forEach((it, i) => {
        trace(it, cx, y, `${id}.${i}`, picks, pts, visits);
        cx += measure(it).w + JOINT;
      });
      return;
    }
    case 'alt': {
      const c = picks.get(id);
      if (c === undefined || c.kind !== 'alt') throw new Error(`길 그림: ${id} 에서 고른 갈래가 없다`);
      const opt = n.options[c.pick];
      const yb = bandCenters(n, y)[c.pick];
      if (opt === undefined || yb === undefined) throw new Error(`길 그림: ${id} 에 갈래 ${c.pick} 가 없다`);
      const inner = size.w - 2 * FORK;
      const w = measure(opt).w;
      const ox = x + FORK + (inner - w) / 2;
      pts.push({ x, y }, { x: x + FORK / 2, y: yb });
      trace(opt, ox, yb, `${id}.${c.pick}`, picks, pts, visits);
      pts.push({ x: x + size.w - FORK / 2, y: yb }, { x: x + size.w, y });
      return;
    }
    case 'opt': {
      const c = picks.get(id);
      if (c === undefined || c.kind !== 'opt') throw new Error(`길 그림: ${id} 에서 있음/없음을 고르지 않았다`);
      if (c.take) {
        pts.push({ x, y });
        trace(n.item, x + FORK, y, `${id}.0`, picks, pts, visits);
        pts.push({ x: x + size.w, y });
      } else {
        const sy = skipY(n, y);
        pts.push({ x, y }, { x: x + FORK / 2, y: sy }, { x: x + size.w - FORK / 2, y: sy }, { x: x + size.w, y });
      }
      return;
    }
  }
}

// ───────────── 무늬 한 벌의 배치 (바탕에서 한 번) ─────────────

type Layout = {
  pattern: PatternNode;
  text: string;
  decisions: DecisionPoint[];
  scale: number;
  map: (p: Pt) => Pt;
  rails: Rail[];
  boxes: BoxMark[];
  skips: Pt[];
  start: Pt;
  end: Pt;
  boxPx: number;
};

function makeLayout(pattern: PatternNode): Layout {
  const size = measure(pattern);
  const natW = size.w + 2 * LEAD;
  const natH = size.up + size.dn;
  const scale = Math.min((W - 2 * MARGIN) / natW, (DIAG_BOTTOM - DIAG_TOP) / natH);
  const ox = (W - natW * scale) / 2;
  const oy = DIAG_TOP + (DIAG_BOTTOM - DIAG_TOP - natH * scale) / 2 + size.up * scale;
  const map = (p: Pt): Pt => ({ x: rd(ox + p.x * scale), y: rd(oy + p.y * scale) });
  const rails: Rail[] = [[{ x: 0, y: 0 }, { x: LEAD, y: 0 }], [{ x: LEAD + size.w, y: 0 }, { x: natW, y: 0 }]];
  const boxes: BoxMark[] = [];
  const skips: Pt[] = [];
  layRails(pattern, LEAD, 0, 'r', rails, boxes, skips);
  return {
    pattern,
    text: printPattern(pattern),
    decisions: decisionPoints(pattern),
    scale,
    map,
    rails: rails.map((r) => r.map(map)),
    boxes: boxes.map((b) => ({ ...b, at: map(b.at) })),
    skips: skips.map(map),
    start: map({ x: 0, y: 0 }),
    end: map({ x: natW, y: 0 }),
    boxPx: rd(BOX * scale),
  };
}

function tracePath(lay: Layout, choices: Choice[]): { pts: Pt[]; visits: Visit[] } {
  const picks = new Map(choices.map((c) => [c.at, c] as const));
  const pts: Pt[] = [{ x: 0, y: 0 }];
  const visits: Visit[] = [];
  trace(lay.pattern, LEAD, 0, 'r', picks, pts, visits);
  pts.push({ x: measure(lay.pattern).w + 2 * LEAD, y: 0 });
  return { pts: pts.map(lay.map), visits: visits.map((v) => ({ ch: v.ch, at: lay.map(v.at) })) };
}

/** 모임 속 자리 — 첫 갈림이 칸, 나머지 갈림이 줄. 떨군 차례와 무관하다 */
function slotOf(lay: Layout, choices: Choice[]): { col: number; row: number; cols: number; rows: number } {
  const value = (d: DecisionPoint): number => {
    const c = choices.find((x) => x.at === d.at);
    if (c === undefined) throw new Error(`모임 자리: ${d.at} 에서 고른 것이 없다`);
    return c.kind === 'alt' ? c.pick : c.take ? 1 : 0;
  };
  const [first, ...rest] = lay.decisions;
  if (first === undefined) return { col: 0, row: 0, cols: 1, rows: 1 };
  let row = 0;
  let rows = 1;
  for (const d of rest) {
    row = row * d.arity + value(d);
    rows *= d.arity;
  }
  return { col: value(first), row, cols: first.arity, rows };
}

function polyLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** 길 위 비율 f 의 점과, 거기까지 지난 거리 */
function pointAt(pts: Pt[], f: number): Pt {
  const total = polyLength(pts);
  let left = total * f;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg && seg > 0) {
      const k = left / seg;
      return { x: rd(a.x + (b.x - a.x) * k), y: rd(a.y + (b.y - a.y) * k) };
    }
    left -= seg;
  }
  const lastPt = pts[pts.length - 1];
  if (lastPt === undefined) throw new Error('길 그림: 빈 길');
  return lastPt;
}

/** 길 위에 놓인 점 p 가 길의 몇 비율 자리인가. 길 위에 없으면 던진다 */
function fractionOf(pts: Pt[], p: Pt): number {
  const total = polyLength(pts);
  let walked = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const da = Math.hypot(p.x - a.x, p.y - a.y);
    const db = Math.hypot(b.x - p.x, b.y - p.y);
    if (Math.abs(da + db - seg) < 0.5) return (walked + da) / total;
    walked += seg;
  }
  throw new Error('길 그림: 칸이 길 위에 없다');
}

export const patternMatchesSetStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let layout: Layout | null = null;
    let layoutFor: PatternNode | null = null;

    function layoutOf(pattern: PatternNode): Layout {
      if (layout === null || layoutFor !== pattern) {
        layout = makeLayout(pattern);
        layoutFor = pattern;
      }
      return layout;
    }

    type Handles = { member: SVGGElement | null; path: SVGPolylineElement | null; dot: SVGCircleElement | null };

    function memberPill(parent: Element, m: Member, center: Pt, fresh: boolean, width: number): SVGGElement {
      const g = el(parent, 'g', {});
      el(g, 'rect', {
        x: rd(center.x - width / 2),
        y: rd(center.y - 14),
        width: rd(width),
        height: 28,
        rx: 6,
        fill: fresh ? colors.accent : colors.bg,
        stroke: fresh ? colors.accent : colors.border,
        'stroke-width': 1.5,
      });
      const tx = el(g, 'text', {
        x: rd(center.x),
        y: rd(center.y + monoPx * 0.36),
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
        fill: fresh ? colors.stateInk : colors.text,
      });
      tx.textContent = m.text;
      return g;
    }

    function slotCenter(lay: Layout, m: Member): { at: Pt; width: number } {
      const s = slotOf(lay, m.choices);
      const left = MARGIN + 36;
      const right = W - MARGIN - 36;
      const top = SET_TOP + 26;
      const bottom = SET_BOTTOM - 8;
      const cellW = (right - left) / s.cols;
      const cellH = (bottom - top) / s.rows;
      return {
        at: { x: rd(left + cellW * (s.col + 0.5)), y: rd(top + cellH * (s.row + 0.5)) },
        width: Math.min(cellW - 16, 96),
      };
    }

    function brace(x: number, top: number, bottom: number, dir: 1 | -1): void {
      const mid = (top + bottom) / 2;
      const d = [
        `M${rd(x + 8 * dir)},${rd(top)}`,
        `Q${rd(x)},${rd(top)} ${rd(x)},${rd(top + 10)}`,
        `L${rd(x)},${rd(mid - 7)}`,
        `Q${rd(x)},${rd(mid)} ${rd(x - 7 * dir)},${rd(mid)}`,
        `Q${rd(x)},${rd(mid)} ${rd(x)},${rd(mid + 7)}`,
        `L${rd(x)},${rd(bottom - 10)}`,
        `Q${rd(x)},${rd(bottom)} ${rd(x + 8 * dir)},${rd(bottom)}`,
      ].join(' ');
      el(svg, 'path', { d, fill: 'none', stroke: colors.textMuted, 'stroke-width': 2, 'stroke-linecap': 'round' });
    }

    function drawStatic(scene: PatternScene): Handles {
      svg.textContent = '';
      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });
      const handles: Handles = { member: null, path: null, dot: null };
      if (scene.pattern === null) return handles;
      const lay = layoutOf(scene.pattern);

      // 머리 — 무늬 글자
      const label = el(svg, 'text', {
        x: MARGIN,
        y: HEAD_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      label.textContent = t('label.pattern', 'Pattern');
      const pat = el(svg, 'text', {
        x: W / 2,
        y: HEAD_Y + 2,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 600,
        fill: colors.text,
      });
      pat.textContent = lay.text;

      // 선로
      for (const r of lay.rails) {
        el(svg, 'polyline', {
          points: pointsAttr(r),
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-opacity': 0.55,
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        });
      }
      for (const s of lay.skips) {
        const sk = el(svg, 'text', {
          x: s.x,
          y: rd(s.y - 6),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        sk.textContent = t('label.skip', 'skip');
      }

      // 이번 걸음의 길
      const step = scene.step;
      const walked = step.kind === 'path' ? tracePath(lay, step.choices) : null;
      if (walked !== null) {
        handles.path = el(svg, 'polyline', {
          points: pointsAttr(walked.pts),
          fill: 'none',
          stroke: colors.primary,
          'stroke-width': 4,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        });
      }
      const onPath = new Set((walked?.visits ?? []).map((v) => `${v.at.x},${v.at.y}`));

      // 칸 — 글자는 늘 제자리에 남는다
      for (const b of lay.boxes) {
        const hit = onPath.has(`${b.at.x},${b.at.y}`);
        el(svg, 'rect', {
          x: rd(b.at.x - lay.boxPx / 2),
          y: rd(b.at.y - lay.boxPx / 2),
          width: lay.boxPx,
          height: lay.boxPx,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: hit ? colors.primary : colors.textMuted,
          'stroke-width': hit ? 2.5 : 1.5,
        });
        const g = el(svg, 'text', {
          x: b.at.x,
          y: rd(b.at.y + parseFloat(fontSizes.xl) * 0.36),
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
          fill: colors.text,
        });
        g.textContent = b.ch;
      }

      // 출발 · 끝
      for (const p of [lay.start, lay.end]) {
        el(svg, 'circle', { cx: p.x, cy: p.y, r: 5, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 2 });
      }
      if (walked !== null) {
        handles.dot = el(svg, 'circle', { cx: lay.end.x, cy: lay.end.y, r: 7, fill: colors.primary });
      }

      // 캡션 — 지금 일어난 일
      const cap = el(svg, 'text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      cap.textContent =
        step.kind === 'start'
          ? t('caption.start', 'Only the pattern for now. No string has been gathered.')
          : step.last
            ? t('caption.last', 'The last path spells {text}. No path is left.', { text: step.text })
            : t('caption.path', 'This path spells {text}.', { text: step.text });

      // 모임
      const setLabel = el(svg, 'text', {
        x: MARGIN,
        y: SET_TOP + 8,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      setLabel.textContent = t('label.set', 'Strings the pattern means');
      const size = el(svg, 'text', {
        x: W - MARGIN,
        y: SET_TOP + 8,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      size.textContent = t('label.size', 'Size: {n}', { n: scene.members.length });
      brace(MARGIN + 14, SET_TOP + 18, SET_BOTTOM, 1);
      brace(W - MARGIN - 14, SET_TOP + 18, SET_BOTTOM, -1);
      scene.members.forEach((m, i) => {
        const fresh = step.kind === 'path' && i === scene.members.length - 1;
        const slot = slotCenter(lay, m);
        const g = memberPill(svg, m, slot.at, fresh, slot.width);
        if (fresh) handles.member = g;
      });
      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계로 ms 동안 흘린다. 세대가 바뀌면 물러난다 */
    async function tween(ms: number, mine: number, frame: (f: number) => void): Promise<boolean> {
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const f = Math.min(1, (Date.now() - t0) / ms);
        frame(f);
        if (f >= 1) return true;
        await wait(FRAME_MS);
      }
    }

    async function play(next: PatternScene, handles: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'path' || next.pattern === null || handles.member === null || handles.path === null || handles.dot === null) return;
      const lay = layoutOf(next.pattern);
      const walked = tracePath(lay, step.choices);
      const len = rd(polyLength(walked.pts));
      const pathEl = handles.path;
      const dot = handles.dot;
      const member = handles.member;
      const slot = slotCenter(lay, { text: step.text, choices: step.choices });

      // 아직 못 온 만큼 — 길은 그어지지 않았고, 점은 출발에, 글줄은 아직 모임에 없다
      pathEl.setAttribute('stroke-dasharray', `${len} ${len}`);
      pathEl.setAttribute('stroke-dashoffset', String(len));
      member.setAttribute('visibility', 'hidden');

      // 실은 글자 — 점 위에 뜬다
      const carry = el(svg, 'g', {});
      const carryBg = el(carry, 'rect', { height: 24, rx: 5, fill: colors.accent });
      const carryText = el(carry, 'text', {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: colors.stateInk,
      });
      // 칸마다 길 위 어디서 글자를 싣는가 (비율)
      const pickAt = walked.visits.map((v) => fractionOf(walked.pts, v.at));
      // 싣는 글자는 알고리즘이 보낸 글줄의 앞머리다. 길 그림의 칸 글자를 이은 것과 어긋나면 그림이 틀렸다
      const spelled = walked.visits.map((v) => v.ch).join('');
      if (spelled !== step.text) throw new Error(`길 그림: 칸 글자 "${spelled}" 가 떨군 글줄 "${step.text}" 과 다르다`);
      const glyphs = [...step.text];
      const placeCarry = (p: Pt, txt: string): void => {
        const w = Math.max(24, txt.length * monoPx * 0.62 + 14);
        carry.setAttribute('visibility', txt.length === 0 ? 'hidden' : 'visible');
        carryBg.setAttribute('x', String(rd(p.x - w / 2)));
        carryBg.setAttribute('y', String(rd(p.y - 40)));
        carryBg.setAttribute('width', String(rd(w)));
        carryText.setAttribute('x', String(rd(p.x)));
        carryText.setAttribute('y', String(rd(p.y - 28 + monoPx * 0.36)));
        carryText.textContent = txt;
      };

      const ok = await tween(TRAVEL_MS, mine, (f) => {
        const p = pointAt(walked.pts, f);
        pathEl.setAttribute('stroke-dashoffset', String(rd(len * (1 - f))));
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
        const k = pickAt.filter((at) => at <= f).length;
        const txt = glyphs.slice(0, k).join('');
        placeCarry(p, txt);
      });
      if (!ok) return;

      // 떨어져 모임 속 제 자리로
      carry.setAttribute('visibility', 'hidden');
      member.removeAttribute('visibility');
      const from = { x: lay.end.x - slot.at.x, y: lay.end.y - 28 - slot.at.y };
      await tween(DROP_MS, mine, (f) => {
        const e = 1 - (1 - f) * (1 - f);
        member.setAttribute('transform', `translate(${rd(from.x * (1 - e))},${rd(from.y * (1 - e))})`);
      });
    }

    return {
      async render(next: PatternScene, _prev: PatternScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate) return;
        await play(next, handles, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
