/**
 * loop-back 무대 — 흐름이 몸의 끝에서 조건 줄로 거슬러 올라가 같은 줄을 되밟는다.
 *
 * - 코드 줄 왼쪽에 흐름이 내려가는 길(레일)이 있고, 흐름 표지가 그 위를 움직인다
 * - 앞 걸음보다 위 줄로 가는 걸음이면 표지가 레일 왼쪽으로 휘는 **되돌이 호**를 타고 올라간다.
 *   호는 남고, 되돌아갈 때마다 한 겹 바깥에 새 호가 쌓인다
 * - 몸을 건너뛰어 아래로 가는 걸음이면 레일 오른쪽의 **빠짐 길**로 내려간다
 * - 줄마다 밟힌 횟수만큼 발자국 점이 쌓인다 — 되밟힌 줄은 점이 늘어난다
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
  type SceneRenderer,
} from '@ffacet/core/runtime';
import { backsBefore, hitsUpTo, isBack, type LoopBackScene } from './scene';

const H = 300;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOTION_MS = 400;
const CAPTION_Y = 22;
const DETAIL_Y = 42;
const ROWS_TOP = 58;
const ROWS_BOTTOM = 16;
const ROW_H_MAX = 40;
const CHAR_W = 8.4; // 고정폭 14px 한 글자 폭 어림
const RAIL_X = 74;
const ARC_BULGE = 20; // 첫 되돌이 호가 레일에서 벌어지는 폭
const ARC_STEP = 14; // 호가 한 겹 쌓일 때마다 더 벌어지는 폭
const SKIP_BULGE = 12;
const NUM_X = 108;
const CODE_X = 128;
const DOT_R = 5;
const DOT_GAP = 14;
const TOKEN_R = 6;
const PANEL_W = 150;
const BADGE_W = 48;

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

const r1 = (v: number): number => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};

function bez(c: Curve, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}

function curveD(c: Curve): string {
  return `M ${r1(c[0].x)} ${r1(c[0].y)} C ${r1(c[1].x)} ${r1(c[1].y)} ${r1(c[2].x)} ${r1(c[2].y)} ${r1(c[3].x)} ${r1(c[3].y)}`;
}

function curveLen(c: Curve): number {
  let len = 0;
  let p = c[0];
  for (let k = 1; k <= 24; k += 1) {
    const q = bez(c, k / 24);
    len += Math.hypot(q.x - p.x, q.y - p.y);
    p = q;
  }
  return len;
}

type Layout = {
  rowH: number;
  rowY: (i: number) => number;
  dotX: number;
  panelX: number;
};

function layoutOf(scene: LoopBackScene): Layout {
  const n = Math.max(1, scene.lines.length);
  const rowH = Math.min(ROW_H_MAX, (H - ROWS_TOP - ROWS_BOTTOM) / n);
  let codeEnd = CODE_X;
  for (const l of scene.lines) {
    const end = CODE_X + (l.indent * 4 + l.text.length) * CHAR_W + (l.cond ? BADGE_W + 12 : 0);
    codeEnd = Math.max(codeEnd, end);
  }
  return {
    rowH,
    rowY: (i) => ROWS_TOP + rowH * (i + 0.5),
    dotX: codeEnd + 24,
    panelX: W - PANEL_W - 16,
  };
}

/** 되돌이 호 — from 줄에서 레일 왼쪽으로 벌어져 to 줄로 올라간다. k 는 몇 번째 호인가. */
function backCurve(lay: Layout, from: number, to: number, k: number): Curve {
  const bulge = ARC_BULGE + k * ARC_STEP;
  const cx = RAIL_X - bulge / 0.75;
  const y0 = lay.rowY(from);
  const y1 = lay.rowY(to);
  return [
    { x: RAIL_X, y: y0 },
    { x: cx, y: y0 },
    { x: cx, y: y1 },
    { x: RAIL_X, y: y1 },
  ];
}

/** 빠짐 길 — 몸을 건너뛰어 레일 오른쪽으로 내려간다. */
function skipCurve(lay: Layout, from: number, to: number): Curve {
  const cx = RAIL_X + SKIP_BULGE / 0.75;
  const y0 = lay.rowY(from);
  const y1 = lay.rowY(to);
  return [
    { x: RAIL_X, y: y0 },
    { x: cx, y: y0 },
    { x: cx, y: y1 },
    { x: RAIL_X, y: y1 },
  ];
}

/** 곧게 내려가는 걸음 (from 이 없으면 레일 꼭대기에서 들어온다). */
function downCurve(lay: Layout, from: number | null, to: number): Curve {
  const y0 = from === null ? ROWS_TOP - 6 : lay.rowY(from);
  const y1 = lay.rowY(to);
  const a = { x: RAIL_X, y: y0 };
  const b = { x: RAIL_X, y: y1 };
  return [a, { x: RAIL_X, y: y0 + (y1 - y0) / 3 }, { x: RAIL_X, y: y0 + (2 * (y1 - y0)) / 3 }, b];
}

type Handles = {
  token: SVGCircleElement | null;
  newDot: SVGCircleElement | null;
  path: SVGPathElement | null;
  pathLen: number;
  curve: Curve | null;
};

export const loopBackStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance & SceneRenderer<LoopBackScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = { token: null, newDot: null, path: null, pathLen: 0, curve: null };

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const n = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      parent.appendChild(n);
      return n;
    };
    const text = (
      s: string,
      x: number,
      y: number,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGTextElement => {
      const n = el('text', { x: r1(x), y: r1(y), ...attrs }, parent);
      n.textContent = s;
      return n;
    };

    function captionOf(scene: LoopBackScene): { head: string; detail: string } {
      const st = scene.step;
      if (!st) return { head: t('caption.start', 'Nothing has run yet.'), detail: '' };
      const at = scene.trail.length - 1;
      const line = st.line + 1;
      let head: string;
      if (st.from === null) {
        head = t('caption.first', 'The flow starts at line {line}.', { line });
      } else if (isBack(scene.trail, at)) {
        const n = hitsUpTo(scene.trail, at, st.line);
        head = t('caption.back', 'Back up to line {line} — stepped on {n} times now.', { line, n });
      } else if (st.line > st.from + 1) {
        head = t('caption.skip', 'Past the body, down to line {line}.', { line });
      } else {
        head = t('caption.down', 'Down to line {line}.', { line });
      }
      let detail: string;
      if (st.act === 'assign') {
        detail = t('detail.assign', '{name} is now {value}.', { name: st.name, value: st.value });
      } else if (st.act === 'cond') {
        detail = st.cond
          ? t('detail.true', 'The condition is true — into the body.')
          : t('detail.false', 'The condition is false — the flow leaves the loop.');
      } else {
        detail = t('detail.print', 'Printed: {out}', { out: st.out });
      }
      return { head, detail };
    }

    function drawStatic(scene: LoopBackScene): void {
      svg.textContent = '';
      handles = { token: null, newDot: null, path: null, pathLen: 0, curve: null };
      if (scene.lines.length === 0) return;
      const lay = layoutOf(scene);
      const st = scene.step;
      const at = scene.trail.length - 1;
      const cur = at >= 0 ? scene.trail[at]! : null;

      // 캡션 — 지금 일어난 일만
      const cap = captionOf(scene);
      text(cap.head, 16, CAPTION_Y, { 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text, 'font-weight': 600 }, svg);
      if (cap.detail) {
        text(cap.detail, 16, DETAIL_Y, { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
      }

      // 지금 밟은 줄의 바탕
      if (cur !== null) {
        el(
          'rect',
          {
            x: RAIL_X + 4,
            y: r1(lay.rowY(cur) - lay.rowH / 2 + 2),
            width: r1(lay.panelX - 24 - RAIL_X - 4),
            height: r1(lay.rowH - 4),
            rx: 4,
            fill: c.bgSubtle,
          },
          svg,
        );
      }

      // 레일 — 흐름이 아래로 내려가는 길
      el(
        'line',
        {
          x1: RAIL_X,
          y1: r1(ROWS_TOP - 6),
          x2: RAIL_X,
          y2: r1(lay.rowY(scene.lines.length - 1)),
          stroke: c.border,
          'stroke-width': 2,
        },
        svg,
      );

      // 흐름이 지나간 되돌이 호 · 빠짐 길 — 자취에서 파생
      const arcs = el('g', {}, svg);
      for (let k = 1; k < scene.trail.length; k += 1) {
        const from = scene.trail[k - 1]!;
        const to = scene.trail[k]!;
        let curve: Curve | null = null;
        let stroke = c.primary;
        if (to < from) curve = backCurve(lay, from, to, backsBefore(scene.trail, k));
        else if (to > from + 1) {
          curve = skipCurve(lay, from, to);
          stroke = c.itemActive;
        }
        if (!curve) continue;
        const isNow = k === at;
        const path = el(
          'path',
          {
            d: curveD(curve),
            fill: 'none',
            stroke,
            'stroke-width': isNow ? 2.5 : 1.5,
            'stroke-linecap': 'round',
            opacity: isNow ? 1 : 0.55,
          },
          arcs,
        );
        // 끝머리 화살 — 레일로 다시 들어오는 방향(오른쪽 또는 왼쪽)
        const end = curve[3];
        const dir = curve[1].x < RAIL_X ? 1 : -1;
        el(
          'path',
          {
            d: `M ${r1(end.x - dir * 7)} ${r1(end.y - 4)} L ${r1(end.x)} ${r1(end.y)} L ${r1(end.x - dir * 7)} ${r1(end.y + 4)}`,
            fill: 'none',
            stroke,
            'stroke-width': 1.5,
            opacity: isNow ? 1 : 0.55,
          },
          arcs,
        );
        if (isNow) {
          handles.path = path;
          handles.pathLen = curveLen(curve);
        }
      }

      // 줄 — 번호 · 코드 글자 · 조건 결과 · 발자국
      for (let i = 0; i < scene.lines.length; i += 1) {
        const l = scene.lines[i]!;
        const y = lay.rowY(i);
        const isCur = i === cur;
        el('circle', { cx: RAIL_X, cy: r1(y), r: 2.5, fill: c.border }, svg);
        text(String(i + 1), NUM_X, y + 4, { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted, 'text-anchor': 'end' }, svg);
        text(l.text, CODE_X + l.indent * 4 * CHAR_W, y + 5, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
          'font-weight': isCur ? 700 : 400,
        }, svg);

        if (isCur && st && st.act === 'cond') {
          const bx = CODE_X + (l.indent * 4 + l.text.length) * CHAR_W + 12;
          const tone = st.cond ? c.primary : c.itemActive;
          el('rect', { x: r1(bx), y: r1(y - 10), width: BADGE_W, height: 20, rx: 10, fill: 'none', stroke: tone, 'stroke-width': 1.5 }, svg);
          text(st.cond ? t('label.true', 'true') : t('label.false', 'false'), bx + BADGE_W / 2, y + 4, {
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: tone,
            'text-anchor': 'middle',
            'font-weight': 600,
          }, svg);
        }

        const hits = at >= 0 ? hitsUpTo(scene.trail, at, i) : 0;
        for (let h = 0; h < hits; h += 1) {
          const newest = isCur && h === hits - 1;
          const dot = el(
            'circle',
            { cx: r1(lay.dotX + h * DOT_GAP), cy: r1(y), r: DOT_R, fill: newest ? c.accent : c.primary },
            svg,
          );
          if (newest) handles.newDot = dot;
        }
      }

      // 변수 · 출력
      const px = lay.panelX;
      const top = ROWS_TOP;
      text(t('label.vars', 'Variables'), px, top + 10, { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
      // 변수 칸 수는 바탕(대입 줄의 변수 이름)에서 셈한다 — 걸음마다 출력 칸이 움직이지 않게
      const names = new Set<string>();
      for (const l of scene.lines) if (l.assigns !== null) names.add(l.assigns);
      for (const v of scene.vars) names.add(v.name);
      const slots = Math.max(1, names.size);
      const room = H - ROWS_BOTTOM - top - 22 - 18 - 8 - 36; // 출력 칸에 최소 36 을 남긴다
      const boxH = Math.max(12, Math.min(28, lay.rowH - 6, room / slots - 8));
      scene.vars.forEach((v, j) => {
        const y = top + 22 + j * (boxH + 8);
        const hot = st?.act === 'assign' && st.name === v.name;
        text(v.name, px, y + boxH / 2 + 5, { 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text }, svg);
        el('rect', {
          x: px + 64,
          y: r1(y),
          width: PANEL_W - 64,
          height: r1(boxH),
          rx: 4,
          fill: c.bg,
          stroke: hot ? c.accent : c.border,
          'stroke-width': hot ? 2 : 1,
        }, svg);
        text(String(v.value), px + 64 + (PANEL_W - 64) / 2, y + boxH / 2 + 5, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
          'text-anchor': 'middle',
          'font-weight': hot ? 700 : 400,
        }, svg);
      });
      const outTop = top + 22 + slots * (boxH + 8) + 18;
      text(t('label.output', 'Output'), px, outTop, { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
      const outH = Math.max(boxH, H - ROWS_BOTTOM - outTop - 10);
      el('rect', {
        x: px,
        y: r1(outTop + 8),
        width: PANEL_W,
        height: r1(outH),
        rx: 4,
        fill: c.bgSubtle,
        stroke: st?.act === 'print' ? c.accent : c.border,
        'stroke-width': st?.act === 'print' ? 2 : 1,
      }, svg);
      scene.output.forEach((o, j) => {
        text(o, px + 10, outTop + 8 + 20 + j * 18, { 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text }, svg);
      });

      // 흐름 표지 — 지금 밟은 줄의 레일 위
      if (cur !== null) {
        handles.token = el('circle', { cx: RAIL_X, cy: r1(lay.rowY(cur)), r: TOKEN_R, fill: c.accent, stroke: c.text, 'stroke-width': 1.5 }, svg);
        if (st) {
          if (st.from === null) handles.curve = downCurve(lay, null, st.line);
          else if (st.line < st.from) handles.curve = backCurve(lay, st.from, st.line, backsBefore(scene.trail, at));
          else if (st.line > st.from + 1) handles.curve = skipCurve(lay, st.from, st.line);
          else handles.curve = downCurve(lay, st.from, st.line);
        }
      }
    }

    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

    return {
      async render(next: LoopBackScene, _prev: LoopBackScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const h = handles;
        const curve = h.curve;
        if (!curve || !h.token) return;
        // 정적 그리기가 끝 자리를 세웠다 — 운동은 아직 못 온 만큼을 그린다
        const place = (p: number): void => {
          const e = ease(p);
          const pt = bez(curve, e);
          h.token?.setAttribute('cx', String(r1(pt.x)));
          h.token?.setAttribute('cy', String(r1(pt.y)));
          if (h.path) {
            h.path.setAttribute('stroke-dasharray', String(r1(h.pathLen)));
            h.path.setAttribute('stroke-dashoffset', String(r1(h.pathLen * (1 - e))));
          }
          if (h.newDot) {
            const q = Math.max(0, (p - 0.7) / 0.3);
            h.newDot.setAttribute('r', String(r1(DOT_R * q)));
          }
        };
        place(0);
        await tween(MOTION_MS, mine, place);
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
