/**
 * 무대 — 오른쪽은 옆에서 본 모습(가로 = 눈에서 멀어지는 쪽 −z, 세로 = y), 왼쪽은 화면을 정면으로 본 모습.
 * 두 쪽이 같은 배율 · 같은 높이 기준선을 쓴다. 그래서 꼭짓점이 비춰지는 길(수평선)이 옆모습에서
 * 화면 선을 지나 정면 화면의 제자리까지 곧게 이어진다 — y 는 남고 z 만 버려진다.
 *
 * 걸음의 운동: 상자가 옆모습에서 다음 거리로 미끄러져 가고(첫 걸음은 제자리), 꼭짓점마다 점이
 * 수평으로 날아와 화면에 앉는다. 두 번째부터는 앉는 자리가 이미 그려진 모습의 꼭짓점과 같다 —
 * 정면 화면의 그림은 운동 내내 손대지 않는다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { OrthographicKeepsSizeScene } from './scene.js';

const H = 256;
const NS = 'http://www.w3.org/2000/svg';

const SLIDE_MS = 900;
const SHOOT_MS = 700;
const SETTLE_MS = 300;

type Layout = {
  s: number;
  cy: number;
  /** 화면 선(z = 0)의 가로 자리 */
  sx0: number;
  /** 정면 화면 한가운데 */
  pcx: number;
  panelL: number;
  panelR: number;
  panelT: number;
  panelB: number;
  /** 그림 띠 아래 끝 */
  bandB: number;
  rightEnd: number;
};

type Handles = {
  box: SVGGElement | null;
  rays: SVGGElement | null;
  image: SVGGElement | null;
  dims: SVGGElement | null;
  pulse: SVGGElement | null;
};

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fmt3(v: number): string {
  const s = v.toFixed(3);
  return s === '-0.000' ? '0.000' : s;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, color: string, size: string, anchor = 'start', weight = '400'): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill: color,
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    'text-anchor': anchor,
  });
  node.textContent = text;
  return node;
}

function layoutOf(scene: OrthographicKeepsSizeScene): Layout | null {
  const local = scene.local;
  if (local === null) return null;
  const dMax = scene.distances[scene.distances.length - 1];
  if (dMax === undefined) throw new Error('orthographic-keeps-size-stage: 거리 목록이 비었다');
  const xMax = Math.max(...local.map((p) => Math.abs(p[0])));
  const yMax = Math.max(...local.map((p) => Math.abs(p[1])));
  const zExt = Math.max(...local.map((p) => Math.abs(p[2])));
  const W = PIECE_CANVAS_W;
  const left = 16;
  const pad = 14;
  const gap = 26;
  const rightRoom = 20;
  const top = 44;
  const bandMax = 120;
  const sW = (W - left - 2 * pad - gap - rightRoom) / (2 * xMax + dMax + zExt);
  const sH = bandMax / (2 * yMax);
  const s = Math.min(sW, sH, 60);
  const cy = top + yMax * s;
  const panelL = left;
  const panelR = left + 2 * xMax * s + 2 * pad;
  const pcx = (panelL + panelR) / 2;
  const sx0 = panelR + gap;
  return {
    s,
    cy,
    sx0,
    pcx,
    panelL,
    panelR,
    panelT: cy - yMax * s - 10,
    panelB: cy + yMax * s + 10,
    bandB: cy + yMax * s,
    rightEnd: sx0 + (dMax + zExt) * s,
  };
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const orthographicKeepsSizeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const groupColors = categorical(3);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = { box: null, rays: null, image: null, dims: null, pulse: null };

    function groupColor(axis: number): string {
      const c = groupColors[axis];
      if (c === undefined) throw new Error(`orthographic-keeps-size-stage: 축 ${axis} 의 색이 없다`);
      return c;
    }

    function drawStatic(scene: OrthographicKeepsSizeScene): void {
      svg.textContent = '';
      handles = { box: null, rays: null, image: null, dims: null, pulse: null };
      const L = layoutOf(scene);
      if (L === null || scene.edges === null || scene.placed === null) return;
      const { s, cy, sx0, pcx } = L;
      const edges = scene.edges;
      const placed = scene.placed;
      const shot = scene.shot;

      // 제목 둘
      label(svg, (L.panelL + L.panelR) / 2, 22, t('label.screen', 'Screen, face on'), colors.textMuted, fontSizes.sm, 'middle');
      label(svg, sx0, 22, t('label.side', 'Side view'), colors.textMuted, fontSizes.sm);

      // 정면 화면 틀
      el(svg, 'rect', {
        x: L.panelL,
        y: L.panelT,
        width: L.panelR - L.panelL,
        height: L.panelB - L.panelT,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });

      // 옆모습: 멀어지는 축과 거리 눈금
      el(svg, 'line', { x1: sx0, y1: cy, x2: L.rightEnd, y2: cy, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '3 4' });
      label(svg, L.rightEnd, 22, t('label.away', 'away (−z)'), colors.textMuted, fontSizes.xs, 'end');
      const tickY = L.bandB + 14;
      for (const [i, d] of scene.distances.entries()) {
        const x = sx0 + d * s;
        const here = i === placed.index;
        el(svg, 'line', { x1: x, y1: tickY - 5, x2: x, y2: tickY + 3, stroke: here ? colors.text : colors.border, 'stroke-width': here ? 2 : 1 });
        label(svg, x, tickY + 16, String(d), here ? colors.text : colors.textMuted, fontSizes.sm, 'middle', here ? '700' : '400');
      }
      label(svg, sx0, tickY + 16, t('label.distance', 'Center distance'), colors.textMuted, fontSizes.xs);

      // 화면 선 (옆에서 보면 선이다)
      el(svg, 'line', { x1: sx0, y1: L.panelT, x2: sx0, y2: L.panelB, stroke: colors.text, 'stroke-width': 2, 'stroke-linecap': 'round' });

      // 비추는 길 — 꼭짓점에서 수평으로 화면 선을 지나 정면 화면의 제자리까지
      if (shot !== null) {
        const rays = el(svg, 'g', {});
        for (const [k, p] of placed.camera.entries()) {
          const q = shot.screen[k];
          if (!q) throw new Error(`orthographic-keeps-size-stage: 화면 꼭짓점 ${k} 가 없다`);
          el(rays, 'line', {
            x1: sx0 + -p[2] * s,
            y1: cy - p[1] * s,
            x2: pcx + q[0] * s,
            y2: cy - q[1] * s,
            stroke: colors.textMuted,
            'stroke-width': 0.8,
            'stroke-dasharray': '2 3',
            opacity: 0.7,
          });
        }
        handles.rays = rays;
      }

      // 옆모습의 상자 — 모서리를 (−z, y) 로
      const box = el(svg, 'g', {});
      for (const [a, b, axis] of edges) {
        const pa = placed.camera[a];
        const pb = placed.camera[b];
        if (!pa || !pb) throw new Error(`orthographic-keeps-size-stage: 모서리 ${a}-${b} 의 꼭짓점이 없다`);
        el(box, 'line', {
          x1: sx0 + -pa[2] * s,
          y1: cy - pa[1] * s,
          x2: sx0 + -pb[2] * s,
          y2: cy - pb[1] * s,
          stroke: groupColor(axis),
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
      }
      for (const p of placed.camera) {
        el(box, 'circle', { cx: sx0 + -p[2] * s, cy: cy - p[1] * s, r: 2.5, fill: colors.text });
      }
      el(box, 'circle', { cx: sx0 + placed.d * s, cy, r: 3, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1 });
      handles.box = box;

      // 캡션
      const capY = H - 34;
      if (shot === null) {
        label(
          svg,
          PIECE_CANVAS_W / 2,
          capY,
          t('caption.start', 'Box with side {side}, turned {yaw}° about y, then {pitch}° about x.', {
            side: String(scene.side),
            yaw: String(scene.yawDeg),
            pitch: String(scene.pitchDeg),
          }),
          colors.text,
          fontSizes.md,
          'middle',
        );
        label(svg, PIECE_CANVAS_W / 2, capY + 20, t('caption.idle', 'The screen is still empty.'), colors.textMuted, fontSizes.sm, 'middle');
        return;
      }

      // 정면 화면의 모습
      const image = el(svg, 'g', {});
      for (const [a, b, axis] of edges) {
        const qa = shot.screen[a];
        const qb = shot.screen[b];
        if (!qa || !qb) throw new Error(`orthographic-keeps-size-stage: 모서리 ${a}-${b} 의 화면 꼭짓점이 없다`);
        el(image, 'line', {
          x1: pcx + qa[0] * s,
          y1: cy - qa[1] * s,
          x2: pcx + qb[0] * s,
          y2: cy - qb[1] * s,
          stroke: groupColor(axis),
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
      }
      for (const q of shot.screen) {
        el(image, 'circle', { cx: pcx + q[0] * s, cy: cy - q[1] * s, r: 2.5, fill: colors.text });
      }
      handles.image = image;
      handles.pulse = el(svg, 'g', {});

      // 너비 · 높이 — 화면 아래
      const dims = el(svg, 'g', {});
      label(dims, pcx, tickY + 16, t('label.width', 'Width: {w}', { w: fmt3(shot.width) }), colors.text, fontSizes.sm, 'middle');
      label(dims, pcx, tickY + 16 + smPx + 5, t('label.height', 'Height: {h}', { h: fmt3(shot.height) }), colors.text, fontSizes.sm, 'middle');
      handles.dims = dims;

      // 모서리 세 묶음의 화면 길이
      const legendY = tickY + 40;
      const axisNames = ['x', 'y', 'z'];
      const slot = (L.rightEnd - sx0) / 3;
      for (const axis of [0, 1, 2]) {
        const x = sx0 + axis * slot;
        const len = shot.lengths[axis];
        const name = axisNames[axis];
        if (len === undefined || name === undefined) throw new Error(`orthographic-keeps-size-stage: 묶음 ${axis} 의 길이가 없다`);
        el(svg, 'line', { x1: x, y1: legendY - 4, x2: x + 18, y2: legendY - 4, stroke: groupColor(axis), 'stroke-width': 3, 'stroke-linecap': 'round' });
        label(svg, x + 24, legendY, t('legend.edges', '{axis} edges: {len}', { axis: name, len: fmt3(len) }), colors.text, fontSizes.sm);
      }

      label(
        svg,
        PIECE_CANVAS_W / 2,
        capY,
        t('caption.project', 'Center distance: {d} · z from {zMin} to {zMax}', {
          d: String(placed.d),
          zMin: fmt3(shot.zMin),
          zMax: fmt3(shot.zMax),
        }),
        colors.text,
        fontSizes.md,
        'middle',
      );
      label(svg, PIECE_CANVAS_W / 2, capY + 20, t('caption.drop', 'Each corner keeps its x and y. Its z is dropped.'), colors.textMuted, fontSizes.sm, 'middle');
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
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
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
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

    function alive(mine: number): boolean {
      return !destroyed && mine === gen;
    }

    async function animate(scene: OrthographicKeepsSizeScene, mine: number): Promise<void> {
      if (scene.step.kind !== 'project') return;
      const L = layoutOf(scene);
      const { box, rays, image, dims, pulse } = handles;
      if (L === null || scene.placed === null || scene.shot === null || !box || !rays || !image || !dims || !pulse) {
        throw new Error('orthographic-keeps-size-stage: 비추는 걸음인데 무대 손잡이가 없다');
      }
      const { s, cy, sx0, pcx } = L;
      const camera = scene.placed.camera;
      const screen = scene.shot.screen;
      const first = scene.step.from === null;

      // 아직 못 온 만큼으로 시작한다: 길은 숨기고, 첫 비춤이면 정면 모습도 숨긴다
      rays.setAttribute('opacity', '0');
      if (first) {
        image.setAttribute('opacity', '0');
        dims.setAttribute('opacity', '0');
      }

      // 1) 상자가 다음 거리로 미끄러져 간다
      const from = scene.step.from;
      if (from !== null) {
        const back = (from - scene.placed.d) * s;
        box.setAttribute('transform', `translate(${r2(back)} 0)`);
        await tween(SLIDE_MS, mine, (p) => box.setAttribute('transform', `translate(${r2(back * (1 - p))} 0)`));
        if (!alive(mine)) return;
        box.removeAttribute('transform');
      }

      // 2) 꼭짓점마다 점이 수평으로 날아와 화면에 앉는다
      const dots = camera.map((p, k) => {
        const q = screen[k];
        if (!q) throw new Error(`orthographic-keeps-size-stage: 화면 꼭짓점 ${k} 가 없다`);
        const x0 = sx0 + -p[2] * s;
        const x1 = pcx + q[0] * s;
        const y = cy - q[1] * s;
        const trail = el(pulse, 'line', { x1: x0, y1: y, x2: x0, y2: y, stroke: colors.textMuted, 'stroke-width': 0.8, 'stroke-dasharray': '2 3' });
        const dot = el(pulse, 'circle', { cx: x0, cy: y, r: 3.5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
        return { x0, x1, y, trail, dot };
      });
      await tween(SHOOT_MS, mine, (p) => {
        for (const d of dots) {
          const x = d.x0 + (d.x1 - d.x0) * p;
          d.dot.setAttribute('cx', String(r2(x)));
          d.trail.setAttribute('x2', String(r2(x)));
        }
      });
      if (!alive(mine)) return;

      // 3) 앉은 자리 — 첫 비춤이면 모습이 선다, 그다음부터는 이미 선 모습의 꼭짓점에 겹친다
      await tween(SETTLE_MS, mine, (p) => {
        for (const d of dots) d.dot.setAttribute('r', String(r2(3.5 + 4 * p)));
        for (const d of dots) d.dot.setAttribute('opacity', String(r2(1 - p)));
        rays.setAttribute('opacity', String(r2(p)));
        if (first) {
          image.setAttribute('opacity', String(r2(p)));
          dims.setAttribute('opacity', String(r2(p)));
        }
      });
    }

    const instance = {
      async render(next: OrthographicKeepsSizeScene, _prev: OrthographicKeepsSizeScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'project') return;
        await animate(next, mine);
        if (!alive(mine)) return;
        drawStatic(next);
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
    return instance;
  },
};
