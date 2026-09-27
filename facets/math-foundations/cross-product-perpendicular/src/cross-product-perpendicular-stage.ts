/**
 * 외적 조각의 무대.
 *
 * 왼쪽은 3차원 정사영 — a · b 가 벌린 판(원판)을 비스듬히 내려다본다. c = a × b 는 판을
 * 뚫고 곧게 서고(선다), 차례를 바꾼 b × a 는 c 의 머리에서 원점을 지나 같은 줄의 반대쪽으로
 * 넘어간다(뒤집힌다). a 에서 b 로 도는 호의 화살 머리도 그때 b 쪽에서 a 쪽으로 옮겨 간다.
 * 오른쪽은 셈의 장부 — 걸음마다 한 묶음씩 쌓인다.
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  arcPoint,
  discPoint,
  formatFactor,
  formatFixed,
  formatInt,
  formatVec,
  project,
  viewSpec,
  type Vec3,
} from './algorithm.js';
import type { CrossScene } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 번의 길이 — 걸음당 600 안쪽 */
const MOTION_MS = 600;
const FRAME_MS = 16;
/** 한 칸 축척의 상한 (px / 단위) */
const MAX_UNIT_PX = 60;
const DISC_SEGMENTS = 64;
const ARC_SEGMENTS = 28;
/** 판 반지름에 대한 호 반지름의 비 */
const ARC_AB = 0.38;
const ARC_AC = 0.44;
const ARC_BC = 0.56;
const SUBSCRIPTS = ['₁', '₂', '₃'] as const;

type Pt = { x: number; y: number };
type Motion = { kind: 'cross' | 'dot' | 'swap'; s: number };

function ease(s: number): number {
  return s * s * (3 - 2 * s);
}

export const crossProductPerpendicularStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const hues = categorical(4, params.theme === 'dark' ? 'vivid' : 'deep');
    const colorA = hues[0];
    const colorB = hues[1];
    const colorC = hues[2];
    const colorD = hues[3];
    if (colorA === undefined || colorB === undefined || colorC === undefined || colorD === undefined) {
      throw new Error('categorical(4): 색 넷을 얻지 못했다');
    }

    const fsSm = parseFloat(fontSizes.sm);
    const fsMd = parseFloat(fontSizes.md);
    const W = PIECE_CANVAS_W;
    const figRight = Math.round(W * 0.52);
    const ledgerX = figRight + 16;
    const figTop = 14;
    const figBottom = H - 46;
    const captionY = H - 16;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function writeText(x: number, y: number, body: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fsSm, ...attrs });
      node.textContent = body;
      return node;
    }

    function drawArrow(from: Pt, to: Pt, color: string, width: number, dash?: string): void {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      const head = Math.min(10, len * 0.5);
      const ux = len > 0 ? dx / len : 0;
      const uy = len > 0 ? dy / len : 0;
      const baseX = to.x - ux * head;
      const baseY = to.y - uy * head;
      el('line', {
        x1: from.x,
        y1: from.y,
        x2: baseX,
        y2: baseY,
        stroke: color,
        'stroke-width': width,
        'stroke-linecap': 'butt',
        ...(dash === undefined ? {} : { 'stroke-dasharray': dash }),
      });
      if (head < 2) return; // 길이 0 을 지나는 프레임 — 머리를 달 방향이 없다
      drawHead(to, ux, uy, head, color);
    }

    function drawHead(to: Pt, ux: number, uy: number, size: number, color: string): void {
      const baseX = to.x - ux * size;
      const baseY = to.y - uy * size;
      const px = -uy * size * 0.45;
      const py = ux * size * 0.45;
      el('polygon', {
        points: `${to.x.toFixed(2)},${to.y.toFixed(2)} ${(baseX + px).toFixed(2)},${(baseY + py).toFixed(2)} ${(baseX - px).toFixed(2)},${(baseY - py).toFixed(2)}`,
        fill: color,
      });
    }

    function drawStatic(scene: CrossScene, motion: Motion | null): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return; // init 앞 — 그릴 바탕이 아직 없다
      const view = viewSpec(scene.a.v, scene.b.v);
      const b = view.bounds;
      const spanX = b.maxX - b.minX;
      const spanY = b.maxY - b.minY;
      const padX = 28;
      const padY = 18;
      const k = Math.min(MAX_UNIT_PX, (figRight - 2 * padX) / spanX, (figBottom - figTop - 2 * padY) / spanY);
      const cx = figRight / 2;
      const cy = (figTop + figBottom) / 2;
      const midX = (b.minX + b.maxX) / 2;
      const midY = (b.minY + b.maxY) / 2;
      const screen = (p: Vec3): Pt => {
        const q = project(p, view.frame);
        return { x: cx + k * (q.x - midX), y: cy - k * (q.y - midY) };
      };
      const origin = screen([0, 0, 0]);
      const R = view.plane.radius;

      const aV = scene.a.v;
      const bV = scene.b.v;
      const cross = scene.cross;
      const swap = scene.swap;

      // ── 판 아래: 차례를 바꾼 b × a (원판이 덮어 아래에 있음을 보인다)
      if (swap !== null) {
        if (cross === null) throw new Error('swap 이 cross 없이 왔다');
        const m = motion?.kind === 'swap' ? ease(motion.s) : 1;
        const tip: Vec3 = [
          cross.v[0] + (swap.v[0] - cross.v[0]) * m,
          cross.v[1] + (swap.v[1] - cross.v[1]) * m,
          cross.v[2] + (swap.v[2] - cross.v[2]) * m,
        ];
        drawArrow(origin, screen(tip), colorD, 3);
      }

      // ── 판
      const ring: string[] = [];
      for (let i = 0; i < DISC_SEGMENTS; i += 1) {
        const p = screen(discPoint(view.plane, i, DISC_SEGMENTS));
        ring.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      }
      el('polygon', {
        points: ring.join(' '),
        fill: colors.border,
        'fill-opacity': 0.5,
        stroke: colors.textMuted,
        'stroke-width': 1,
      });

      // ── 호: a → b (차례), 그리고 내적마다 c 와의 사이각
      const arcPath = (u: Vec3, w: Vec3, radius: number, upto: number): Pt[] => {
        const pts: Pt[] = [];
        const n = Math.max(2, Math.ceil(ARC_SEGMENTS * upto));
        for (let i = 0; i <= n; i += 1) pts.push(screen(arcPoint(u, w, radius, (upto * i) / n)));
        return pts;
      };
      const polyline = (pts: Pt[], color: string, width: number): void => {
        el('polyline', {
          points: pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': width,
        });
      };

      const abArc = arcPath(aV, bV, ARC_AB * R, 1);
      polyline(abArc, colors.textMuted, 1.4);
      // 화살 머리 — 차례를 바꾸기 전엔 b 끝에서 b 쪽으로, 바꾼 뒤엔 a 끝에서 a 쪽으로
      {
        const back = swap !== null;
        const m = motion?.kind === 'swap' ? ease(motion.s) : back ? 1 : 0;
        const pos = 1 - m; // 0 이면 a 끝, 1 이면 b 끝
        const at = screen(arcPoint(aV, bV, ARC_AB * R, pos));
        // 호의 접선 — a 에서 b 로 가는 쪽. 차례를 바꾸면(혹은 바꾸는 중이면) 거꾸로
        const eps = 0.04;
        const lo = screen(arcPoint(aV, bV, ARC_AB * R, Math.max(0, pos - eps)));
        const hi = screen(arcPoint(aV, bV, ARC_AB * R, Math.min(1, pos + eps)));
        const sign = back ? -1 : 1;
        const hx = (hi.x - lo.x) * sign;
        const hy = (hi.y - lo.y) * sign;
        const hl = Math.hypot(hx, hy);
        if (hl < 1e-6) throw new Error('호의 화살 머리: 방향을 잴 수 없다');
        drawHead(at, hx / hl, hy / hl, 8, colors.textMuted);
      }

      if (cross !== null) {
        scene.dots.forEach((d, i) => {
          const u = d.with === scene.a.name ? aV : bV;
          const last = i === scene.dots.length - 1;
          const upto = last && motion?.kind === 'dot' ? ease(motion.s) : 1;
          if (upto <= 0) return; // 운동 첫 프레임 — 아직 한 점도 쓸리지 않았다
          const radius = (d.with === scene.a.name ? ARC_AC : ARC_BC) * R;
          polyline(arcPath(u, cross.v, radius, upto), last && scene.step === 'dot' ? colors.text : colors.textMuted, 1.6);
        });
      }

      // ── 판 위: a · b
      const aTip = screen(aV);
      const bTip = screen(bV);
      drawArrow(origin, aTip, colorA, 3);
      drawArrow(origin, bTip, colorB, 3);

      // ── c = a × b — 판을 뚫고 선다
      let cTip: Pt | null = null;
      if (cross !== null) {
        const m = motion?.kind === 'cross' ? ease(motion.s) : 1;
        cTip = screen([cross.v[0] * m, cross.v[1] * m, cross.v[2] * m]);
        drawArrow(origin, cTip, colorC, 3);
      }
      el('circle', { cx: origin.x, cy: origin.y, r: 2.6, fill: colors.text });

      // ── 머리 이름표
      const tipLabel = (tip: Pt, body: string, color: string): void => {
        const dx = tip.x - origin.x;
        const dy = tip.y - origin.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return; // 길이 0 — 운동이 원점을 지나는 한 프레임
        writeText(tip.x + (dx / len) * 14, tip.y + (dy / len) * 14 + fsMd * 0.35, body, {
          'text-anchor': 'middle',
          'font-size': fsMd,
          'font-weight': 700,
          'font-style': 'italic',
          fill: color,
        });
      };
      tipLabel(aTip, scene.a.name, colorA);
      tipLabel(bTip, scene.b.name, colorB);
      if (cross !== null && cTip !== null) tipLabel(cTip, cross.name, colorC);
      if (swap !== null && cross !== null && motion?.kind !== 'swap') tipLabel(screen(swap.v), swap.label, colorD);

      drawLedger(scene);

      // ── 캡션 — 이번 걸음이 하는 일
      let caption = '';
      switch (scene.step) {
        case 'start':
          caption = t('caption.start', 'The plane spanned by {a} and {b}', { a: scene.a.name, b: scene.b.name });
          break;
        case 'cross': {
          if (cross === null) throw new Error('step cross 인데 cross 가 없다');
          caption = t('caption.cross', '{c} = {expr} stands out of the plane', { c: cross.name, expr: cross.label });
          break;
        }
        case 'dot': {
          const d = scene.dots[scene.dots.length - 1];
          if (d === undefined) throw new Error('step dot 인데 내적이 없다');
          caption = t('caption.dot', 'Dot product {expr}: {value}', { expr: d.expr, value: formatInt(d.value) });
          break;
        }
        case 'swap': {
          if (swap === null) throw new Error('step swap 인데 swap 이 없다');
          caption = t('caption.swap', 'Order swapped: {expr}', { expr: swap.label });
          break;
        }
        case null:
          throw new Error('바탕이 섰는데 step 이 없다');
      }
      writeText(W / 2, captionY, caption, { 'text-anchor': 'middle', 'font-size': fsMd, fill: colors.text });
    }

    function drawLedger(scene: CrossScene): void {
      const base = scene.base;
      if (base === null) throw new Error('drawLedger: 바탕 없이 불렸다');
      const lineH = Math.round(fsSm * 1.6);
      const gap = 8;
      let y = figTop + fsSm;
      const row = (body: string, color: string, bold = false, indent = 0): void => {
        writeText(ledgerX + indent, y, body, { fill: color, 'font-weight': bold ? 700 : 400 });
        y += lineH;
      };
      const groupColor = (current: boolean): string => (current ? colors.text : colors.textMuted);

      // 걸음 0
      const a = scene.a;
      const b = scene.b;
      row(`${a.name} = ${formatVec(a.v)}`, colorA, true);
      row(`${b.name} = ${formatVec(b.v)}`, colorB, true);
      row(
        t('label.angle', 'Angle ({u}, {v}): {deg}°', { u: a.name, v: b.name, deg: formatFixed(base.angle, 1) }),
        groupColor(scene.step === 'start'),
      );
      y += gap;

      // 걸음 1
      const cross = scene.cross;
      if (cross === null) return;
      row(`${cross.name} = ${cross.label} = ${formatVec(cross.v)}`, colorC, true);
      cross.rows.forEach((r, i) => {
        const sub = SUBSCRIPTS[i];
        if (sub === undefined) throw new Error(`cross.rows[${i}]: 성분은 셋뿐이다`);
        row(
          `${cross.name}${sub} = ${formatFactor(r.p)}×${formatFactor(r.q)} − ${formatFactor(r.r)}×${formatFactor(r.s)} = ${formatInt(r.value)}`,
          groupColor(scene.step === 'cross'),
          false,
          fsSm,
        );
      });
      y += gap;

      // 걸음 2 · 3
      scene.dots.forEach((d, i) => {
        const current = scene.step === 'dot' && i === scene.dots.length - 1;
        const sum = d.terms.map(([x, w]) => `${formatFactor(x)}×${formatFactor(w)}`).join(' + ');
        row(`${d.expr} = ${sum} = ${formatInt(d.value)}`, groupColor(current), current);
        row(
          t('label.angle', 'Angle ({u}, {v}): {deg}°', { u: d.with, v: cross.name, deg: formatFixed(d.angle, 1) }),
          groupColor(current),
        );
        y += gap;
      });

      // 걸음 4
      const swap = scene.swap;
      if (swap === null) return;
      row(
        swap.opposite
          ? `${swap.label} = ${formatVec(swap.v)} = ${swap.negLabel}`
          : `${swap.label} = ${formatVec(swap.v)}`,
        colorD,
        true,
      );
      for (const check of swap.checks) row(`${check.expr} = ${formatInt(check.value)}`, groupColor(true));
    }

    function tween(mine: number, kind: Motion['kind'], next: CrossScene): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const s = Math.min(1, (Date.now() - start) / MOTION_MS);
          drawStatic(next, { kind, s });
          if (s >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function motionFor(next: CrossScene, prev: CrossScene): Motion['kind'] | null {
      if (next.swap !== null && prev.swap === null) return 'swap';
      if (next.dots.length > prev.dots.length) return 'dot';
      if (next.cross !== null && prev.cross === null) return 'cross';
      return null;
    }

    return {
      async render(next: CrossScene, prev: CrossScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next, null);
        if (!opts.animate || prev === null || destroyed) return;
        const kind = motionFor(next, prev);
        if (kind === null) return;
        await tween(mine, kind, next);
        if (mine === gen && !destroyed) drawStatic(next, null);
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
