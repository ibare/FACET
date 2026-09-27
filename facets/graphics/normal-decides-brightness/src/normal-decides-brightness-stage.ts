import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { faceNormal, normalize } from './algorithm.js';
import type { NdbResult, NormalDecidesBrightnessScene } from './scene.js';

const H = 456;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 흘림 한 번의 길이 — 면이 돌아서는 몫과 빛줄기가 떨어져 퍼지는 몫 */
const MOTION_MS = 700;
const ROTATE_SHARE = 0.4;
const FRAME_MS = 16;

/** 빛줄기 광선 수 (양 끝 포함) */
const RAY_COUNT = 7;

type Pt = { x: number; y: number };

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fmt3(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toFixed(3);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
}

function pts(list: Pt[]): string {
  return list.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
}

export const normalDecidesBrightnessStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const sm = parseFloat(fontSizes.sm);
    const md = parseFloat(fontSizes.md);

    // 큰 무대 — 빛줄기가 기운 면 하나에 떨어진다
    const PX = W / 2;
    const PY = 204;
    const HALF = Math.min(100, (W - 80) / 5);
    const BEAM_PX = Math.min(48, HALF / 2);
    const LIGHT_Y = 58;
    const FLOOR_Y = 314;
    const BAND = 7;
    // 아래 띠 — 면마다 받은 밝기가 남는다
    const STRIP_X0 = 112;
    const STRIP_X1 = W - 16;
    const GLYPH_Y = 350;
    const BASE_Y = 428;
    const BAR_MAX = 46;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    function label(x: number, y: number, s: string, opts: { size?: number; fill?: string; anchor?: string; weight?: number; font?: string }): void {
      el(
        'text',
        {
          x: round2(x),
          y: round2(y),
          'font-family': opts.font ?? fonts.body,
          'font-size': opts.size ?? sm,
          'font-weight': opts.weight ?? 400,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'middle',
        },
        s,
      );
    }

    /** 수학 좌표(피벗 기준, y 위)를 SVG 로 */
    function toSvg(x: number, y: number): Pt {
      return { x: PX + x, y: PY - y };
    }

    function assertVerticalLight(scene: NormalDecidesBrightnessScene): void {
      const L = normalize(scene.base.lightDirection);
      if (Math.abs(L[0]) > 1e-9 || Math.abs(L[2]) > 1e-9 || L[1] <= 0) {
        throw new Error('normal-decides-brightness-stage: 이 그림은 빛이 바로 위(0, 1, 0)에서 올 때만 그린다');
      }
    }

    /** 광선 xo(피벗에서 가로 거리, px)가 기운 면(중심선)에 닿는 자리. 면 밖을 지나면 null */
    function hitOnFace(tiltDeg: number, xo: number): { s: number; p: Pt } | null {
      const [sin, cos] = faceNormal(tiltDeg);
      if (Math.abs(cos) < 1e-9) {
        // 면이 빛줄기와 나란하다 — 면의 위 끝에 닿는 광선만 멈춘다
        if (Math.abs(xo) > 1.5) return null;
        return { s: -HALF, p: { x: xo, y: HALF } };
      }
      // 광선 (xo, u) 가 면 {s·(cos, −sin)} 위에 있으려면 N·p = 0 → u = −xo·sin/cos
      const u = (-xo * sin) / cos;
      const s = xo * cos - u * sin;
      if (Math.abs(s) > HALF) return null;
      return { s, p: { x: xo, y: u } };
    }

    function rayOffsets(): number[] {
      const out: number[] = [];
      for (let i = 0; i < RAY_COUNT; i += 1) out.push(-BEAM_PX / 2 + (BEAM_PX * i) / (RAY_COUNT - 1));
      return out;
    }

    function drawLight(scene: NormalDecidesBrightnessScene): void {
      const top = { x: PX - BEAM_PX / 2 - 10, y: LIGHT_Y - 12 };
      el('rect', {
        x: round2(top.x),
        y: round2(top.y),
        width: round2(BEAM_PX + 20),
        height: 10,
        rx: 3,
        fill: c.accent,
        stroke: c.text,
        'stroke-width': 1,
      });
      label(top.x - 8, LIGHT_Y - 3, t('label.light', 'Light'), { anchor: 'end', fill: c.text, weight: 600 });
      // 빛줄기 폭 표시 — 가로 괄호
      const by = LIGHT_Y - 22;
      el('path', {
        d: `M ${round2(PX - BEAM_PX / 2)} ${by + 4} V ${by} H ${round2(PX + BEAM_PX / 2)} V ${by + 4}`,
        fill: 'none',
        stroke: c.textMuted,
        'stroke-width': 1,
      });
      label(PX + BEAM_PX / 2 + 8, by + 4, t('label.width', 'Width: {w}', { w: scene.base.beamWidth }), {
        anchor: 'start',
        fill: c.textMuted,
        size: parseFloat(fontSizes.xs),
      });
    }

    function drawBeam(tilt: number, fall: number): Pt[] {
      // 빛줄기 몸 — 촘촘히 잰 끝자리로 아랫변을 그린다
      const top = LIGHT_Y - 2;
      const bottom: Pt[] = [];
      const N = 96;
      for (let i = 0; i <= N; i += 1) {
        const xo = -BEAM_PX / 2 + (BEAM_PX * i) / N;
        const h = hitOnFace(tilt, xo);
        const endY = h ? toSvg(0, h.p.y).y : FLOOR_Y;
        bottom.push({ x: PX + xo, y: top + (endY - top) * fall });
      }
      const poly = [{ x: PX - BEAM_PX / 2, y: top }, { x: PX + BEAM_PX / 2, y: top }, ...bottom.reverse()];
      el('polygon', { points: pts(poly), fill: c.accent, 'fill-opacity': 0.26, stroke: 'none' });
      const hits: Pt[] = [];
      for (const xo of rayOffsets()) {
        const h = hitOnFace(tilt, xo);
        const endY = h ? toSvg(0, h.p.y).y : FLOOR_Y;
        const y2 = top + (endY - top) * fall;
        el('line', {
          x1: round2(PX + xo),
          y1: top,
          x2: round2(PX + xo),
          y2: round2(y2),
          stroke: c.accent,
          'stroke-width': 2,
        });
        if (h && fall >= 1) hits.push(toSvg(h.p.x, h.p.y));
      }
      return hits;
    }

    function drawFace(tilt: number): void {
      const [sin, cos] = faceNormal(tilt);
      const a = toSvg(-HALF * cos, HALF * sin);
      const b = toSvg(HALF * cos, -HALF * sin);
      el('line', {
        x1: round2(a.x),
        y1: round2(a.y),
        x2: round2(b.x),
        y2: round2(b.y),
        stroke: c.text,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });
    }

    function drawBand(r: NdbResult, spread: number, scale: number): void {
      if (r.cover === null) return;
      const [sin, cos] = faceNormal(r.tilt);
      const half = (r.cover * scale * spread) / 2;
      const T = { x: cos, y: -sin };
      const Nn = { x: sin, y: cos };
      const at = (s: number, k: number): Pt => toSvg(s * T.x + k * Nn.x, s * T.y + k * Nn.y);
      el('polygon', {
        points: pts([at(-half, 0), at(half, 0), at(half, BAND), at(-half, BAND)]),
        fill: c.accent,
        'fill-opacity': round2(r.brightness),
        stroke: c.text,
        'stroke-width': 1,
      });
    }

    function drawNormalAndAngle(tilt: number): void {
      const [sin, cos] = faceNormal(tilt);
      const len = 70;
      // 빛 쪽 기준선
      const up = toSvg(0, len);
      el('line', {
        x1: PX,
        y1: PY,
        x2: round2(up.x),
        y2: round2(up.y),
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      // 법선
      const tip = toSvg(len * sin, len * cos);
      el('line', {
        x1: PX,
        y1: PY,
        x2: round2(tip.x),
        y2: round2(tip.y),
        stroke: c.text,
        'stroke-width': 2,
      });
      const hx = sin;
      const hy = -cos; // SVG 방향
      const back = { x: tip.x - hx * 8, y: tip.y - hy * 8 };
      const side = { x: -hy * 4, y: hx * 4 };
      el('polygon', {
        points: pts([tip, { x: back.x + side.x, y: back.y + side.y }, { x: back.x - side.x, y: back.y - side.y }]),
        fill: c.text,
      });
      label(tip.x + 8, tip.y + 4, t('label.normal', 'Normal'), { fill: c.text, anchor: 'start' });
      if (Math.round(tilt) !== 0) {
        const R = 30;
        const e = toSvg(R * sin, R * cos);
        const large = tilt > 180 ? 1 : 0;
        el('path', {
          d: `M ${PX} ${PY - R} A ${R} ${R} 0 ${large} 1 ${round2(e.x)} ${round2(e.y)}`,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.2,
        });
        const mid = (tilt * Math.PI) / 360;
        const m = toSvg(46 * Math.sin(mid), 46 * Math.cos(mid));
        label(m.x, m.y + 4, t('label.deg', '{deg}°', { deg: Math.round(tilt) }), { fill: c.textMuted, size: parseFloat(fontSizes.xs) });
      }
    }

    function drawStrip(scene: NormalDecidesBrightnessScene, grow: number): void {
      const faces = scene.base.faces;
      const cellW = (STRIP_X1 - STRIP_X0) / faces.length;
      label(STRIP_X0 - 14, BASE_Y - BAR_MAX / 2, t('label.brightness', 'Brightness'), { anchor: 'end', fill: c.textMuted });
      el('line', { x1: STRIP_X0, y1: BASE_Y, x2: STRIP_X1, y2: BASE_Y, stroke: c.border, 'stroke-width': 1 });
      const current = scene.step ? scene.step.face : null;
      faces.forEach((f, i) => {
        const cx = STRIP_X0 + cellW * (i + 0.5);
        const r = scene.results.find((x) => x.face === f.id);
        if (f.id === current) {
          el('rect', {
            x: round2(cx - cellW / 2 + 3),
            y: GLYPH_Y - 18,
            width: round2(cellW - 6),
            height: BASE_Y + 20 - (GLYPH_Y - 18),
            rx: 6,
            fill: c.bgSubtle,
            stroke: c.border,
            'stroke-width': 1,
          });
        }
        // 작은 면 — 그 면의 기울기
        const [sin, cos] = faceNormal(f.tilt);
        const g = 12;
        el('line', {
          x1: round2(cx - g * cos),
          y1: round2(GLYPH_Y - g * sin),
          x2: round2(cx + g * cos),
          y2: round2(GLYPH_Y + g * sin),
          stroke: r ? c.text : c.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        el('line', {
          x1: round2(cx),
          y1: GLYPH_Y,
          x2: round2(cx + 8 * sin),
          y2: round2(GLYPH_Y - 8 * cos),
          stroke: r ? c.text : c.textMuted,
          'stroke-width': 1,
        });
        label(cx, BASE_Y + 15, t('label.deg', '{deg}°', { deg: Math.round(f.tilt) }), {
          fill: r ? c.text : c.textMuted,
          size: parseFloat(fontSizes.xs),
        });
        if (!r) return;
        const g2 = f.id === current ? grow : 1;
        const h = BAR_MAX * r.brightness * g2;
        const bw = Math.min(26, cellW * 0.4);
        if (h > 0.5) {
          el('rect', {
            x: round2(cx - bw / 2),
            y: round2(BASE_Y - h),
            width: round2(bw),
            height: round2(h),
            fill: c.accent,
            stroke: c.text,
            'stroke-width': 1,
          });
        } else {
          el('line', {
            x1: round2(cx - bw / 2),
            y1: BASE_Y,
            x2: round2(cx + bw / 2),
            y2: BASE_Y,
            stroke: c.text,
            'stroke-width': 2,
          });
        }
        if (g2 >= 1) {
          label(cx, BASE_Y - h - 5, fmt3(r.brightness), { font: fonts.mono, size: parseFloat(fontSizes.xs), fill: c.text });
        }
      });
    }

    function caption(scene: NormalDecidesBrightnessScene): string {
      const step = scene.step;
      if (!step) {
        return t('caption.start', 'Faces waiting below: {n} · Beam width: {w}', {
          n: scene.base.faces.length,
          w: scene.base.beamWidth,
        });
      }
      const r = scene.results.find((x) => x.face === step.face);
      if (!r) throw new Error(`normal-decides-brightness-stage: 이번 걸음의 면 '${step.face}' 결과가 장면에 없다`);
      const vars = { deg: Math.round(r.tilt), b: fmt3(r.brightness) };
      if (r.cover === null) {
        return t('caption.away', 'Tilt: {deg}°. The face turns its back on the light; the beam never reaches its front. Brightness: {b}', vars);
      }
      if (Math.round(r.tilt) === 0) {
        return t('caption.facing', 'Tilt: {deg}°. The face looks straight at the light. Brightness: {b}', vars);
      }
      return t('caption.tilted', 'Tilt: {deg}°. The same beam lies along a longer stretch of the face. Brightness: {b}', vars);
    }

    /** p = 1 이 정본(정적 그리기). p < 1 은 아직 못 온 만큼 */
    function draw(scene: NormalDecidesBrightnessScene, p: number): void {
      assertVerticalLight(scene);
      svg.textContent = '';
      label(W / 2, 24, caption(scene), { size: md, weight: 600 });
      drawLight(scene);
      const step = scene.step;
      if (!step) {
        el('circle', { cx: PX, cy: PY, r: 3, fill: c.textMuted });
        drawStrip(scene, 1);
        return;
      }
      const r = scene.results.find((x) => x.face === step.face);
      if (!r) throw new Error(`normal-decides-brightness-stage: 이번 걸음의 면 '${step.face}' 결과가 장면에 없다`);
      const from = step.from ?? r.tilt;
      const pr = ease(clamp01(p / ROTATE_SHARE));
      const pb = ease(clamp01((p - ROTATE_SHARE) / (1 - ROTATE_SHARE)));
      const tilt = from + (r.tilt - from) * pr;
      const rotating = pr < 1;
      const scale = BEAM_PX / scene.base.beamWidth;
      let hits: Pt[] = [];
      if (!rotating) hits = drawBeam(r.tilt, pb);
      drawFace(tilt);
      if (!rotating && pb > 0) drawBand(r, pb, scale);
      for (const h of hits) el('circle', { cx: round2(h.x), cy: round2(h.y), r: 2.5, fill: c.text });
      drawNormalAndAngle(tilt);
      drawStrip(scene, rotating ? 0 : pb);
    }

    function sleepFrame(): Promise<void> {
      return new Promise((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(resolve);
          resolve();
        }, FRAME_MS);
        timers.add(id);
        waiters.add(resolve);
      });
    }

    async function animate(next: NormalDecidesBrightnessScene, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = clamp01((Date.now() - start) / MOTION_MS);
        draw(next, p);
        if (p >= 1) return;
        await sleepFrame();
      }
    }

    return {
      async render(
        next: NormalDecidesBrightnessScene,
        prev: NormalDecidesBrightnessScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moves = opts.animate && next.step !== null && (prev === null || prev.step?.face !== next.step.face);
        if (!moves) {
          draw(next, 1);
          return;
        }
        await animate(next, mine);
        if (mine !== gen || destroyed) return;
        draw(next, 1);
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
