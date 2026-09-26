/**
 * one-function-per-rule 무대 — 문법 규칙마다 파서 함수 하나를 칸으로 세우고, 흐름(점 하나)이 부름을 따라
 * 불린 함수의 머리 줄로 **들어가고**, 몸을 다 따라가면 부른 자리로 **돌아 나오는** 것을 그린다.
 *
 * - 함수 칸: 규칙 글자 · 파서 코드(pseudo-notation) · 그 함수가 먹은 토큰이 쌓이는 받침
 * - 칸 왼쪽 여백: 살아 있는 부름마다 한 줄기 — 깊이 d 의 부름은 d 번째 세로 자리에 선다.
 *   같은 함수가 두 번 불려도(괄호 안의 expr) 줄기가 둘로 갈려 멈춰 둔 바깥 부름이 남는다
 * - 부름 끈: 부른 자리에서 불린 함수의 머리 줄로 — 부를 때 자라고 돌아올 때 걷힌다
 * - 입력 띠: 먹힌 토큰은 띠를 떠나 먹은 함수의 받침으로 날아가 남는다
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { functionName, ruleText, tokenLabel, type FunctionCode } from './algorithm.js';
import type { OneFunctionPerRuleScene } from './scene.js';

const H = 410;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 300;

const MARGIN = 10;
const COL_GAP = 16;
const TOP_LEFT = 72;
const TOP_RIGHT = 38;
const OUT_Y = 38;
const OUT_H = 24;
const PANEL_GAP = 10;
const PAD = 6;
const RULE_H = 18;
const TRAY_H = 34;
const PANEL_FIXED = PAD + RULE_H + 4 + TRAY_H + PAD;
const LH_MAX = 18;
const GUTTER = 64;
const PIN_X0 = 14;
const PIN_STEP_MAX = 9;
const CHIP_H = 34;
const CHIP_PITCH_MAX = 58;
const STRIP_LABEL_W = 62;
const TRAY_PITCH_MAX = 48;
const TRAY_SLOTS_MIN = 5;

type Pt = { x: number; y: number };

type Panel = {
  code: FunctionCode;
  index: number;
  /** 왼쪽 열의 칸은 여백을 오른쪽(가운데 통로 쪽)에, 오른쪽 열의 칸은 왼쪽에 둔다 */
  side: 'left' | 'right';
  /** 코드 · 받침이 놓이는 구역 */
  areaX: number;
  areaW: number;
  textX: number;
  x: number;
  y: number;
  w: number;
  h: number;
  codeTop: number;
  trayY: number;
};

type Layout = {
  panels: Map<string, Panel>;
  lh: number;
  outside: Pt;
  /** 두 열 사이 통로의 가운데 x */
  aisle: number;
  colW: number;
  chipTop: number;
  chipPitch: number;
  chipX0: number;
  colors: readonly string[];
};

const r2 = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};

const ease = (u: number): number => u * u * (3 - 2 * u);
const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));

const layoutCache = new WeakMap<readonly FunctionCode[], { tokens: number; layout: Layout }>();

/** 자리만 셈한다 — 파서 코드는 장면이 한 번 지어 둔 것(scene.codes)을 받는다. */
function makeLayout(codes: readonly FunctionCode[], tokenCount: number): Layout {
  const hit = layoutCache.get(codes);
  if (hit !== undefined && hit.tokens === tokenCount) return hit.layout;
  const total = codes.reduce((s, c) => s + c.lines.length, 0);
  const left: FunctionCode[] = [];
  const right: FunctionCode[] = [];
  let sum = 0;
  for (const c of codes) {
    if (right.length === 0 && (left.length === 0 || sum + c.lines.length <= total / 2)) {
      left.push(c);
      sum += c.lines.length;
    } else right.push(c);
  }
  const chipTop = H - MARGIN - CHIP_H;
  const colBottom = chipTop - 12;
  const fit = (col: FunctionCode[], top: number): number => {
    if (col.length === 0) return LH_MAX;
    const lines = col.reduce((s, c) => s + c.lines.length, 0);
    return (colBottom - top - col.length * PANEL_FIXED - (col.length - 1) * PANEL_GAP) / lines;
  };
  const lh = Math.min(LH_MAX, fit(left, TOP_LEFT), fit(right, TOP_RIGHT));
  const colW = (PIECE_CANVAS_W - 2 * MARGIN - COL_GAP) / 2;
  const panels = new Map<string, Panel>();
  const place = (col: FunctionCode[], x: number, top: number, side: 'left' | 'right'): void => {
    let y = top;
    for (const c of col) {
      const h = PANEL_FIXED + c.lines.length * lh;
      const codeTop = y + PAD + RULE_H;
      panels.set(c.lhs, {
        code: c,
        index: codes.indexOf(c),
        side,
        areaX: side === 'left' ? x + 8 : x + GUTTER - 4,
        areaW: colW - GUTTER - 6,
        textX: side === 'left' ? x + 14 : x + GUTTER,
        x,
        y,
        w: colW,
        h,
        codeTop,
        trayY: codeTop + c.lines.length * lh + 4,
      });
      y += h + PANEL_GAP;
    }
  };
  place(left, MARGIN, TOP_LEFT, 'left');
  place(right, MARGIN + colW + COL_GAP, TOP_RIGHT, 'right');
  const slots = tokenCount + 1;
  const chipX0 = MARGIN + STRIP_LABEL_W;
  const chipPitch = Math.min(CHIP_PITCH_MAX, (PIECE_CANVAS_W - MARGIN - chipX0) / slots);
  const layout: Layout = {
    panels,
    lh,
    outside: { x: MARGIN + colW - PIN_X0, y: OUT_Y + OUT_H / 2 },
    aisle: MARGIN + colW + COL_GAP / 2,
    colW,
    chipTop,
    chipPitch,
    chipX0,
    colors: categorical(codes.length),
  };
  layoutCache.set(codes, { tokens: tokenCount, layout });
  return layout;
}

function colorOf(lay: Layout, p: Panel): string {
  const c = lay.colors[p.index];
  if (c === undefined) throw new Error(`one-function-per-rule 무대: ${p.code.lhs} 의 색이 없다 (자리 ${p.index})`);
  return c;
}

function panelOf(lay: Layout, fn: string): Panel {
  const p = lay.panels.get(fn);
  if (p === undefined) throw new Error(`one-function-per-rule 무대: ${fn} 의 칸이 없다`);
  return p;
}

function lineY(lay: Layout, fn: string, line: number): number {
  const p = panelOf(lay, fn);
  if (line < 0 || line >= p.code.lines.length) throw new Error(`one-function-per-rule 무대: ${fn} 에 줄 ${line} 이 없다`);
  return p.codeTop + line * lay.lh + lay.lh / 2;
}

function pinX(lay: Layout, fn: string, depth: number, maxDepth: number): number {
  const step = Math.min(PIN_STEP_MAX, (GUTTER - PIN_X0 - 6) / Math.max(1, maxDepth - 1));
  const p = panelOf(lay, fn);
  return p.side === 'left' ? p.x + p.w - PIN_X0 - (depth - 1) * step : p.x + PIN_X0 + (depth - 1) * step;
}

/** 부름 끈 — 부른 자리 a 에서 불린 함수의 머리 b 로. */
function curvePoint(lay: Layout, a: Pt, b: Pt, s: number): Pt {
  const mx = Math.abs(b.x - a.x) < 40 ? lay.aisle : (a.x + b.x) / 2;
  const c1 = { x: mx, y: a.y };
  const c2 = { x: mx, y: b.y };
  const k = 1 - s;
  return {
    x: k * k * k * a.x + 3 * k * k * s * c1.x + 3 * k * s * s * c2.x + s * s * s * b.x,
    y: k * k * k * a.y + 3 * k * k * s * c1.y + 3 * k * s * s * c2.y + s * s * s * b.y,
  };
}

function curvePath(lay: Layout, a: Pt, b: Pt, s0: number, s1: number): string {
  const n = 24;
  const pts: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const p = curvePoint(lay, a, b, s0 + ((s1 - s0) * i) / n);
    pts.push(`${i === 0 ? 'M' : 'L'}${r2(p.x)} ${r2(p.y)}`);
  }
  return pts.join(' ');
}

/** 줄 자리 목록을 따라 진행률 u 만큼 간 y. */
function alongLines(lay: Layout, fn: string, path: readonly number[], u: number): number {
  const first = path[0];
  if (first === undefined) throw new Error('one-function-per-rule 무대: 지나간 줄이 비었다');
  if (path.length === 1) return lineY(lay, fn, first);
  const seg = u * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(seg));
  const a = path[i];
  const b = path[i + 1];
  if (a === undefined || b === undefined) throw new Error('one-function-per-rule 무대: 지나간 줄 자리가 어긋난다');
  const f = seg - i;
  return lineY(lay, fn, a) + (lineY(lay, fn, b) - lineY(lay, fn, a)) * f;
}

export const oneFunctionPerRuleStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);
    const charW = smPx * 0.6;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function caption(scene: OneFunctionPerRuleScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'No function called yet. Tokens: {n}', { n: scene.tokens.length });
      const eaten = step.eaten
        .map((i) => {
          const tok = scene.tokens[i];
          if (tok === undefined) throw new Error(`one-function-per-rule 무대: 없는 토큰 자리 ${i}`);
          return tokenLabel(tok);
        })
        .join(' · ');
      const nameOf = (fn: string): string => `${functionName(fn)}()`;
      if (step.kind === 'call') {
        const to = nameOf(step.to);
        if (step.from === null) return t('caption.enter', 'Outside calls {to}.', { to });
        const from = nameOf(step.from);
        if (step.eaten.length === 0) return t('caption.call', '{from} calls {to}.', { from, to });
        return t('caption.callAte', '{from} eats {eaten}, then calls {to}.', { from, to, eaten });
      }
      const from = nameOf(step.from);
      if (step.to !== null) {
        const to = nameOf(step.to);
        if (step.eaten.length === 0) return t('caption.return', '{from} is done — back into {to}.', { from, to });
        return t('caption.returnAte', '{from} eats {eaten} and is done — back into {to}.', { from, to, eaten });
      }
      if (!step.eof) throw new Error('one-function-per-rule 무대: 바깥으로 돌아왔는데 다음 토큰이 EOF 가 아니다');
      const k = scene.owner.filter((o) => o !== null).length;
      const n = scene.tokens.length;
      if (step.eaten.length === 0) return t('caption.leave', '{from} is done — back outside. Next: EOF · Eaten: {k} / {n}', { from, k, n });
      return t('caption.leaveAte', '{from} eats {eaten} and is done — back outside. Next: EOF · Eaten: {k} / {n}', { from, eaten, k, n });
    }

    /** 장면 하나를 통째로 세운다. u 가 있으면 이번 걸음의 운동이 그만큼 진행된 화면이다. */
    function draw(scene: OneFunctionPerRuleScene, u: number | null): void {
      svg.textContent = '';
      const lay = makeLayout(scene.codes, scene.tokens.length);
      const step = scene.step;
      const moving = u !== null && step !== null;
      const stack = scene.stack;
      const returning = moving && step.kind === 'return';
      const liveDepth = stack.length + (returning ? 1 : 0);
      const maxDepth = Math.max(5, liveDepth);

      // 운동의 두 토막 — (가) 함수 안에서 줄을 따라 내려감 · 토큰 먹기, (나) 끈을 따라 옮겨 감
      const split = step !== null && step.path.length > 1 ? 0.4 : 0;
      const uu = u ?? 1;
      const pa = split > 0 ? ease(clamp01(uu / split)) : 1;
      const pb = split < 1 ? ease(clamp01((uu - split) / (1 - split))) : 1;
      const fly = split > 0 ? pa : ease(clamp01(uu / 0.5));

      // 캡션
      el('text', { x: MARGIN, y: 22, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }, svg, caption(scene));

      // 바깥 자리 · 깊이
      el('rect', { x: MARGIN, y: OUT_Y, width: lay.colW, height: OUT_H, rx: 4, fill: colors.bgSubtle, stroke: colors.border }, svg);
      el(
        'text',
        { x: MARGIN + 12, y: OUT_Y + OUT_H / 2 + 4, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
        svg,
        t('label.outside', 'outside'),
      );
      el(
        'text',
        { x: MARGIN + lay.colW - GUTTER, y: OUT_Y + OUT_H / 2 + 4, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
        svg,
        t('label.depth', 'Depth: {d}', { d: stack.length }),
      );

      // 함수 칸
      const topFn = stack[stack.length - 1] ?? null;
      for (const p of lay.panels.values()) {
        const color = colorOf(lay, p);
        el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, fill: colors.bg, stroke: colors.border }, svg);
        el('rect', { x: p.side === 'left' ? p.x : p.x + p.w - 4, y: p.y, width: 4, height: p.h, fill: color }, svg);
        el(
          'text',
          { x: p.textX, y: p.y + PAD + RULE_H - 5, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted },
          svg,
          ruleText(scene.rules, p.code.lhs),
        );
        if (topFn !== null && topFn.fn === p.code.lhs) {
          el(
            'rect',
            { x: p.areaX, y: p.codeTop + topFn.line * lay.lh, width: p.areaW, height: lay.lh, rx: 3, fill: colors.accent, 'fill-opacity': 0.3 },
            svg,
          );
        }
        p.code.lines.forEach((line, i) => {
          const body = line.replace(/^ +/, '');
          const indent = line.length - body.length;
          el(
            'text',
            {
              x: p.textX + indent * charW,
              y: p.codeTop + i * lay.lh + lay.lh / 2 + smPx * 0.35,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: colors.text,
            },
            svg,
            body,
          );
        });
        el(
          'rect',
          { x: p.areaX, y: p.trayY, width: p.areaW, height: TRAY_H, rx: 4, fill: colors.bgSubtle, stroke: colors.border, 'stroke-dasharray': '3 3' },
          svg,
        );
      }

      // 토큰 자리 — 띠와 받침
      const stripPos = (i: number): Pt => ({ x: lay.chipX0 + i * lay.chipPitch, y: lay.chipTop });
      const trayPitch = (p: Panel): number => {
        const owned = scene.owner.filter((o) => o === p.code.lhs).length;
        return Math.min(TRAY_PITCH_MAX, (p.areaW - 4) / Math.max(TRAY_SLOTS_MIN, owned));
      };
      const trayPos = (i: number, fn: string): Pt => {
        const p = panelOf(lay, fn);
        let k = 0;
        for (let j = 0; j < i; j += 1) if (scene.owner[j] === fn) k += 1;
        return { x: p.areaX + 3 + k * trayPitch(p), y: p.trayY + 2 };
      };
      const chip = (at: Pt, w: number, h: number, kind: string, text: string, stroke: string, strokeW: number): void => {
        el('rect', { x: at.x, y: at.y, width: w, height: h, rx: 4, fill: colors.bg, stroke, 'stroke-width': strokeW }, svg);
        el(
          'text',
          { x: at.x + w / 2, y: at.y + h * 0.36, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
          svg,
          kind,
        );
        if (text !== '') {
          el(
            'text',
            { x: at.x + w / 2, y: at.y + h * 0.82, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text },
            svg,
            text,
          );
        }
      };

      el(
        'text',
        { x: MARGIN, y: lay.chipTop + CHIP_H / 2 + 4, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
        svg,
        t('label.input', 'Input'),
      );
      const chipW = lay.chipPitch - 4;
      scene.tokens.forEach((tok, i) => {
        const at = stripPos(i);
        if (scene.owner[i] === null) chip(at, chipW, CHIP_H, tok.kind, tok.text, colors.border, 1);
        else el('rect', { x: at.x, y: at.y, width: chipW, height: CHIP_H, rx: 4, fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3' }, svg);
      });
      const done = step !== null && step.kind === 'return' && step.to === null && step.eof;
      chip(stripPos(scene.tokens.length), chipW, CHIP_H, tokenLabel(null), '', done ? colors.accent : colors.border, done ? 2.5 : 1);

      const flying = new Set(moving ? step.eaten : []);
      scene.tokens.forEach((tok, i) => {
        const fn = scene.owner[i];
        if (fn === undefined) throw new Error(`one-function-per-rule 무대: 토큰 #${i} 의 먹은 함수 칸이 없다`);
        if (fn === null) return;
        const p = panelOf(lay, fn);
        const w = trayPitch(p) - 4;
        const end = trayPos(i, fn);
        const color = colorOf(lay, p);
        if (flying.has(i)) {
          const from = stripPos(i);
          const at = { x: from.x + (end.x - from.x) * fly, y: from.y + (end.y - from.y) * fly };
          const hh = CHIP_H + (TRAY_H - 4 - CHIP_H) * fly;
          const ww = chipW + (w - chipW) * fly;
          chip(at, ww, hh, tok.kind, tok.text, color, 2);
        } else chip(end, w, TRAY_H - 4, tok.kind, tok.text, color, 2);
      });

      // 살아 있는 부름 — 끈 · 줄기 · 자리 표
      const anchorOf = (depth: number, fn: string, y: number): Pt => ({ x: pinX(lay, fn, depth, maxDepth), y });
      const pinAt = (i: number): Pt => {
        const a = stack[i];
        if (a === undefined) throw new Error(`one-function-per-rule 무대: 스택 칸 ${i} 이 없다`);
        return anchorOf(i + 1, a.fn, lineY(lay, a.fn, a.line));
      };
      const callerAnchor = (i: number): Pt => (i === 0 ? lay.outside : pinAt(i - 1));
      const headOf = (depth: number, fn: string): Pt => anchorOf(depth, fn, lineY(lay, fn, 0));
      const linkAttrs = { fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5 };
      const trailAttrs = { stroke: colors.textMuted, 'stroke-width': 2, 'stroke-linecap': 'butt' };
      let marker: Pt = lay.outside;

      stack.forEach((a, i) => {
        const depth = i + 1;
        const head = headOf(depth, a.fn);
        const isTop = i === stack.length - 1;
        let y = lineY(lay, a.fn, a.line);
        // 부르는 걸음의 (가) 토막 — 부르는 쪽이 아직 줄을 따라 내려가는 중
        if (moving && step.kind === 'call' && i === stack.length - 2) y = alongLines(lay, a.fn, step.path, pa);
        if (moving && step.kind === 'call' && isTop) {
          // 불린 쪽 — 끈이 자라는 중. 머리에 닿기 전에는 줄기도 자리 표도 없다
          const start = callerAnchor(i);
          if (pb > 0) el('path', { d: curvePath(lay, start, head, 0, pb), ...linkAttrs }, svg);
          const caller = stack[i - 1];
          const walking = caller === undefined ? start : anchorOf(i, caller.fn, alongLines(lay, caller.fn, step.path, pa));
          marker = pb > 0 ? curvePoint(lay, start, head, pb) : walking;
          return;
        }
        el('path', { d: curvePath(lay, callerAnchor(i), head, 0, 1), ...linkAttrs }, svg);
        if (y > head.y) el('line', { x1: head.x, y1: head.y, x2: head.x, y2: y, ...trailAttrs }, svg);
        if (isTop && !returning) marker = { x: head.x, y };
        else el('circle', { cx: head.x, cy: y, r: 4, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, svg);
      });

      if (moving && step.kind === 'return') {
        // 돌아 나오는 쪽 — 장면에서는 이미 빠졌다. 운동 동안만 그린다
        const depth = stack.length + 1;
        const head = headOf(depth, step.from);
        const anchor = stack.length === 0 ? lay.outside : pinAt(stack.length - 1);
        if (pb < 1) el('path', { d: curvePath(lay, anchor, head, 0, 1 - pb), ...linkAttrs }, svg);
        const endY = alongLines(lay, step.from, step.path, 1);
        const y = alongLines(lay, step.from, step.path, pa);
        const trailEnd = head.y + (y - head.y) * (1 - pb);
        if (trailEnd > head.y) el('line', { x1: head.x, y1: head.y, x2: head.x, y2: trailEnd, ...trailAttrs }, svg);
        marker = pb > 0 ? curvePoint(lay, { x: head.x, y: endY }, anchor, pb) : { x: head.x, y };
      }

      el('circle', { cx: marker.x, cy: marker.y, r: 6, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 }, svg);
    }

    function run(mine: number, scene: OneFunctionPerRuleScene): Promise<void> {
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let t0: number | null = null;
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          if (t0 === null) t0 = now;
          const u = Math.min(1, (now - t0) / MOTION_MS);
          draw(scene, u);
          if (u >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    return {
      async render(next: OneFunctionPerRuleScene, _prev: OneFunctionPerRuleScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          draw(next, null);
          return;
        }
        draw(next, 0);
        await run(mine, next);
        if (destroyed || mine !== gen) return;
        draw(next, null);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
