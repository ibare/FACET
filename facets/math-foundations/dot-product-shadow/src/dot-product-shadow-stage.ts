/**
 * dot-product-shadow 무대.
 *
 * 왼쪽 판 — 격자 없이 b 의 줄(눈금 달린 곧은 줄) 하나와 길이 5 의 궤도. a 가 궤도를 따라
 * 돌면 a 의 머리에서 줄로 내린 수선의 발까지가 그림자(두꺼운 띠)다. 도는 동안 띠가 실제로
 * 줄어들고, 사이각이 90° 를 넘으면 띠가 원점 너머 반대쪽으로 뒤집혀 자란다. 지나간 걸음의
 * 그림자 끝은 줄 위 눈금으로 남는다.
 * 오른쪽 — 두 셈이 나란히: 성분 곱의 합 a·b 와 |b| × 그림자.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { angleOf, footOf, lengthOf, shadowOf, snap, type Vec2 } from './algorithm.js';
import type { DotProductShadowScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';
const CAPTION_BAND = 40;
const PLANE = H - CAPTION_BAND;
const PLANE_PAD = 24;
const MAX_UNIT = 34;
/** b 의 줄을 틀보다 얼마나 더 뻗을지 (틀의 배수). */
const LINE_REACH = 1.14;
const PANEL_GAP = 20;
const EDGE = 12;
const TURN_MS = 600;
const FRAME_MS = 16;

const MINUS = '−';

/** 화면 수 — 0 을 붙이고 빼기 기호로. `−0.0` 이 나오지 않게 한다. */
function fixed(x: number, digits: number): string {
  const s = snap(x).toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace('-', MINUS);
}

/** 1차 자료 그대로의 수 (좌표 · 성분 · 정수 내적). */
function plain(x: number): string {
  const v = snap(x);
  return String(v).replace('-', MINUS);
}

function term(x: number): string {
  return x < 0 ? `(${plain(x)})` : plain(x);
}

function pair(v: Vec2): string {
  return `(${plain(v[0])}, ${plain(v[1])})`;
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

function r1(x: number): number {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v;
}

type Geometry = {
  unit: number;
  cx: number;
  cy: number;
  /** b 방향 단위 벡터 (수학 좌표). */
  u: Vec2;
  /** u 를 반시계로 90° 돌린 것. */
  n: Vec2;
};

function geometryOf(extent: number, b: Vec2): Geometry {
  const unit = Math.min(MAX_UNIT, (PLANE / 2 - PLANE_PAD) / (extent * LINE_REACH));
  const len = lengthOf(b);
  const u: Vec2 = [b[0] / len, b[1] / len];
  return { unit, cx: PLANE / 2, cy: PLANE / 2, u, n: [-u[1], u[0]] };
}

export const dotProductShadowStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const sm = parseFloat(fontSizes.sm);
    const md = parseFloat(fontSizes.md);
    const lg = parseFloat(fontSizes.lg);
    const xl = parseFloat(fontSizes.xl);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      o: { size: number; fill: string; family?: string; weight?: string; anchor?: string; halo?: boolean },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: r1(x),
        y: r1(y),
        'font-family': o.family ?? fonts.body,
        'font-size': o.size,
        fill: o.fill,
        'text-anchor': o.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
      if (o.halo === true) {
        node.setAttribute('stroke', colors.bg);
        node.setAttribute('stroke-width', '4');
        node.setAttribute('stroke-linejoin', 'round');
        node.setAttribute('paint-order', 'stroke');
      }
      node.textContent = body;
      return node;
    }

    function px(g: Geometry, v: Vec2): [number, number] {
      return [g.cx + v[0] * g.unit, g.cy - v[1] * g.unit];
    }

    /** 줄 위 s 자리 (수학 좌표). */
    function onLine(g: Geometry, s: number): Vec2 {
      return [g.u[0] * s, g.u[1] * s];
    }

    function arrow(parent: Element, from: [number, number], to: [number, number], color: string, width: number): void {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) throw new Error('dot-product-shadow stage: 길이 0 인 화살표');
      const ux = dx / len;
      const uy = dy / len;
      const head = 10;
      const bx = to[0] - ux * head;
      const by = to[1] - uy * head;
      el(parent, 'line', {
        x1: r1(from[0]),
        y1: r1(from[1]),
        x2: r1(bx),
        y2: r1(by),
        stroke: color,
        'stroke-width': width,
        'stroke-linecap': 'round',
      });
      const wx = -uy * 5;
      const wy = ux * 5;
      el(parent, 'polygon', {
        points: `${r1(to[0])},${r1(to[1])} ${r1(bx + wx)},${r1(by + wy)} ${r1(bx - wx)},${r1(by - wy)}`,
        fill: color,
      });
    }

    /**
     * 도는 것들 — a · 수선 · 직각 표시 · 그림자 띠 · 사이각 호 · 그 글자.
     * 정지 화면과 운동의 한 프레임이 같은 함수로 선다.
     */
    function drawMoving(
      layer: Element,
      scene: DotProductShadowScene,
      a: Vec2,
      shadow: number,
      sep: number,
      /** 운동 중엔 거짓 — 수는 멈춘 뒤 payload 값으로만 찍는다. */
      numbers: boolean,
    ): void {
      const base = scene.base;
      if (base === null) throw new Error('dot-product-shadow stage: 바탕 없이 그리려 했다');
      const g = geometryOf(base.extent, base.b);
      const origin = px(g, [0, 0]);
      const foot = footOf(shadow, base.b);
      const footPx = px(g, foot);
      const headPx = px(g, a);

      // 그림자 띠 — 원점에서 발까지. 0 이면 원점의 한 점.
      const bandLen = Math.abs(shadow) * g.unit;
      if (bandLen > 1) {
        el(layer, 'line', {
          x1: r1(origin[0]),
          y1: r1(origin[1]),
          x2: r1(footPx[0]),
          y2: r1(footPx[1]),
          stroke: colors.accent,
          'stroke-width': 11,
          'stroke-linecap': 'butt',
        });
        const dir = Math.sign(shadow);
        const tipBack = px(g, onLine(g, shadow - (dir * 7) / g.unit));
        const wx = g.n[0] * 8;
        const wy = -g.n[1] * 8;
        el(layer, 'polygon', {
          points: `${r1(footPx[0])},${r1(footPx[1])} ${r1(tipBack[0] + wx)},${r1(tipBack[1] + wy)} ${r1(tipBack[0] - wx)},${r1(tipBack[1] - wy)}`,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1,
        });
      } else {
        el(layer, 'circle', {
          cx: r1(origin[0]),
          cy: r1(origin[1]),
          r: 6,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1,
        });
      }

      // b — 띠 위에 얹는다.
      arrow(layer, origin, px(g, base.b), colors.primary, 2);

      // 수선과 직각 표시.
      const drop = Math.hypot(headPx[0] - footPx[0], headPx[1] - footPx[1]);
      if (drop > 2) {
        el(layer, 'line', {
          x1: r1(headPx[0]),
          y1: r1(headPx[1]),
          x2: r1(footPx[0]),
          y2: r1(footPx[1]),
          stroke: colors.textMuted,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3',
        });
        const dx = (headPx[0] - footPx[0]) / drop;
        const dy = (headPx[1] - footPx[1]) / drop;
        const along = shadow > 0 ? -1 : 1;
        const ax = g.u[0] * along;
        const ay = -g.u[1] * along;
        const s = Math.min(8, drop / 2);
        el(layer, 'polyline', {
          points: `${r1(footPx[0] + ax * s)},${r1(footPx[1] + ay * s)} ${r1(footPx[0] + ax * s + dx * s)},${r1(footPx[1] + ay * s + dy * s)} ${r1(footPx[0] + dx * s)},${r1(footPx[1] + dy * s)}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.2,
        });
      }

      // 사이각 호 — b 에서 a 쪽으로.
      const angB = angleOf(base.b);
      const signed = ((angleOf(a) - angB + 540) % 360) - 180;
      const turn = Math.abs(signed) > 179.999 ? -sep : Math.sign(signed) * sep;
      const rArc = Math.min(30, g.unit * 1.2);
      if (sep > 0.05) {
        const steps = Math.max(2, Math.ceil(sep / 6));
        const pts: string[] = [];
        for (let i = 0; i <= steps; i += 1) {
          const ang = ((angB + (turn * i) / steps) * Math.PI) / 180;
          pts.push(`${r1(origin[0] + Math.cos(ang) * rArc)},${r1(origin[1] - Math.sin(ang) * rArc)}`);
        }
        el(layer, 'polyline', {
          points: pts.join(' '),
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 1.5,
        });
      }
      // 호가 좁으면 글자가 두 화살표 위에 앉는다 — a 쪽으로 조금 더 비킨다.
      const side = turn === 0 ? -1 : Math.sign(turn);
      const mid = ((angB + side * Math.max(Math.abs(turn) / 2, 20)) * Math.PI) / 180;
      const rLabel = rArc + 22;
      if (numbers) {
        text(layer, origin[0] + Math.cos(mid) * rLabel, origin[1] - Math.sin(mid) * rLabel, `${fixed(sep, 1)}°`, {
          size: sm,
          fill: colors.text,
          anchor: 'middle',
          halo: true,
        });
      }

      // a — 궤도 위의 화살표.
      arrow(layer, origin, headPx, colors.itemActive, 2.5);
      const la = lengthOf(a);
      if (la < 1e-9) throw new Error('dot-product-shadow stage: 길이 0 인 a');
      const aCw: Vec2 = [a[1] / la, -a[0] / la];
      const aLabel = px(g, [a[0] * 0.9 + (aCw[0] * 14) / g.unit, a[1] * 0.9 + (aCw[1] * 14) / g.unit]);
      text(layer, aLabel[0], aLabel[1], base.symbols.a, {
        size: lg,
        fill: colors.itemActive,
        family: fonts.body,
        weight: '700',
        anchor: 'middle',
        halo: true,
      });

      // 그림자의 수 — 띠 가운데, 줄의 반시계 쪽.
      if (!numbers) return;
      const midLine = onLine(g, shadow / 2);
      const pill = px(g, [midLine[0] + (g.n[0] * 20) / g.unit, midLine[1] + (g.n[1] * 20) / g.unit]);
      const label = fixed(shadow, 1);
      const wPill = label.length * md * 0.62 + 12;
      el(layer, 'rect', {
        x: r1(pill[0] - wPill / 2),
        y: r1(pill[1] - md * 0.8),
        width: r1(wPill),
        height: r1(md * 1.6),
        rx: 4,
        fill: colors.accent,
      });
      text(layer, pill[0], pill[1], label, {
        size: md,
        fill: colors.stateInk,
        family: fonts.mono,
        weight: '700',
        anchor: 'middle',
      });
    }

    function drawStatic(scene: DotProductShadowScene, moving: { a: Vec2; shadow: number; sep: number } | null): Element | null {
      svg.textContent = '';
      const base = scene.base;
      const now = scene.current;
      if (base === null || now === null) return null;
      const g = geometryOf(base.extent, base.b);
      const root = el(svg, 'g', {});

      // 궤도 — a 의 길이.
      el(root, 'circle', {
        cx: g.cx,
        cy: g.cy,
        r: r1(now.aLen * g.unit),
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1.2,
        'stroke-dasharray': '3 4',
      });

      // b 의 줄과 정수 눈금.
      const reach = base.extent * LINE_REACH;
      const p0 = px(g, onLine(g, -reach));
      const p1 = px(g, onLine(g, reach));
      el(root, 'line', {
        x1: r1(p0[0]),
        y1: r1(p0[1]),
        x2: r1(p1[0]),
        y2: r1(p1[1]),
        stroke: colors.textMuted,
        'stroke-width': 1,
      });
      const nx = g.n[0];
      const ny = -g.n[1];
      for (let k = -Math.floor(base.extent); k <= Math.floor(base.extent); k += 1) {
        const c = px(g, onLine(g, k));
        const half = k === 0 ? 6 : 3.5;
        el(root, 'line', {
          x1: r1(c[0] - nx * half),
          y1: r1(c[1] - ny * half),
          x2: r1(c[0] + nx * half),
          y2: r1(c[1] + ny * half),
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
      }

      // 자취 — 지나간 걸음의 그림자 끝.
      for (const s of scene.trail) {
        const c = px(g, onLine(g, s));
        el(root, 'line', {
          x1: r1(c[0] - nx * 9),
          y1: r1(c[1] - ny * 9),
          x2: r1(c[0] + nx * 9),
          y2: r1(c[1] + ny * 9),
          stroke: colors.text,
          'stroke-width': 1.5,
          opacity: 0.45,
        });
      }

      // b 의 기호 — 머리 곁, 줄의 반시계 쪽.
      const bTag = px(g, [base.b[0] + (g.n[0] * 16) / g.unit, base.b[1] + (g.n[1] * 16) / g.unit]);
      text(root, bTag[0], bTag[1], base.symbols.b, {
        size: lg,
        fill: colors.primary,
        weight: '700',
        anchor: 'middle',
        halo: true,
      });

      const layer = el(root, 'g', {});
      if (moving === null) drawMoving(layer, scene, now.a, now.shadow, now.sep, true);
      else drawMoving(layer, scene, moving.a, moving.shadow, moving.sep, false);

      drawPanel(root, scene);
      drawCaption(root, scene);
      return layer;
    }

    function drawPanel(root: Element, scene: DotProductShadowScene): void {
      const base = scene.base;
      const now = scene.current;
      if (base === null || now === null) throw new Error('dot-product-shadow stage: 바탕 없이 판을 그리려 했다');
      const x0 = PLANE + PANEL_GAP;
      const x1 = W - EDGE;
      const { a: sa, b: sb } = base.symbols;
      const top = 30;

      // 두 벡터.
      el(root, 'line', { x1: x0, y1: top, x2: x0 + 14, y2: top, stroke: colors.primary, 'stroke-width': 2.5 });
      text(root, x0 + 22, top, `${sb} = ${pair(base.b)}`, { size: md, fill: colors.text, family: fonts.mono });
      text(root, x1, top, `|${sb}| = ${fixed(base.bLen, 1)}`, { size: md, fill: colors.textMuted, family: fonts.mono, anchor: 'end' });
      el(root, 'line', { x1: x0, y1: top + 24, x2: x0 + 14, y2: top + 24, stroke: colors.itemActive, 'stroke-width': 2.5 });
      text(root, x0 + 22, top + 24, `${sa} = ${pair(now.a)}`, { size: md, fill: colors.text, family: fonts.mono });
      text(root, x1, top + 24, `|${sa}| = ${fixed(now.aLen, 1)}`, { size: md, fill: colors.textMuted, family: fonts.mono, anchor: 'end' });
      text(root, x0, top + 52, t('label.angle', 'Angle: {deg}', { deg: `${fixed(now.sep, 1)}°` }), {
        size: md,
        fill: colors.text,
      });

      el(root, 'line', { x1: x0, y1: top + 74, x2: x1, y2: top + 74, stroke: colors.border, 'stroke-width': 1 });

      // ① 성분 곱의 합.
      const y1 = top + 100;
      text(root, x0, y1, t('label.sum', 'Sum of component products'), { size: sm, fill: colors.textMuted });
      text(
        root,
        x0,
        y1 + 24,
        `${sa}·${sb} = ${term(now.a[0])}×${term(base.b[0])} + ${term(now.a[1])}×${term(base.b[1])}`,
        { size: md, fill: colors.text, family: fonts.mono },
      );
      text(root, x1, y1 + 54, `= ${plain(now.dot)}`, {
        size: xl,
        fill: colors.text,
        family: fonts.mono,
        weight: '700',
        anchor: 'end',
      });

      // ② 길이 × 그림자.
      const y2 = y1 + 90;
      text(root, x0, y2, t('label.lengthTimesShadow', '{len} × shadow', { len: `|${sb}|` }), {
        size: sm,
        fill: colors.textMuted,
      });
      const lenText = `${fixed(base.bLen, 1)} × `;
      text(root, x0, y2 + 24, lenText, { size: md, fill: colors.text, family: fonts.mono });
      const shadowText = fixed(now.shadow, 1);
      const sx = x0 + lenText.length * md * 0.6;
      const sw = shadowText.length * md * 0.6 + 8;
      el(root, 'rect', {
        x: r1(sx - 4),
        y: r1(y2 + 24 - md * 0.75),
        width: r1(sw),
        height: r1(md * 1.5),
        rx: 3,
        fill: colors.accent,
      });
      text(root, sx, y2 + 24, shadowText, { size: md, fill: colors.stateInk, family: fonts.mono, weight: '700' });
      text(root, x1, y2 + 54, `= ${fixed(now.product, 1)}`, {
        size: xl,
        fill: colors.text,
        family: fonts.mono,
        weight: '700',
        anchor: 'end',
      });
    }

    function drawCaption(root: Element, scene: DotProductShadowScene): void {
      const base = scene.base;
      const now = scene.current;
      const step = scene.step;
      if (base === null || now === null || step === null) {
        throw new Error('dot-product-shadow stage: 걸음 없이 캡션을 그리려 했다');
      }
      const y = H - CAPTION_BAND / 2;
      const x = EDGE;
      const style = { size: md, fill: colors.text };
      const sym = { a: base.symbols.a, b: base.symbols.b };
      if (step.kind === 'start') {
        text(
          root,
          x,
          y,
          t('caption.start', 'Start — angle: {deg} · shadow on the line of {b}: {s}', {
            deg: `${fixed(now.sep, 1)}°`,
            b: sym.b,
            s: fixed(now.shadow, 1),
          }),
          style,
        );
        return;
      }
      const vars = {
        from: fixed(step.fromShadow, 1),
        to: fixed(now.shadow, 1),
        deg: `${fixed(now.sep, 1)}°`,
        b: sym.b,
      };
      // 갈래는 알고리즘이 앞뒤를 견줘 정했다 — 무대는 읽기만 한다.
      switch (step.change) {
        case 'shorter':
          text(root, x, y, t('caption.shorter', 'Shadow: {from} → {to} — shorter · angle: {deg}', vars), style);
          return;
        case 'zero':
          text(root, x, y, t('caption.zero', 'Shadow: {from} → {to} — shrunk to the origin · angle: {deg}', vars), style);
          return;
        case 'cross':
          text(
            root,
            x,
            y,
            t('caption.cross', 'Shadow: {from} → {to} — it crosses to the far side of the origin from {b}', vars),
            style,
          );
          return;
        case 'farLonger':
          text(
            root,
            x,
            y,
            t('caption.farLonger', 'Shadow: {from} → {to} — longer on the far side from {b}', vars),
            style,
          );
          return;
      }
    }

    async function turn(scene: DotProductShadowScene, from: Vec2, mine: number): Promise<void> {
      const base = scene.base;
      const now = scene.current;
      if (base === null || now === null) throw new Error('dot-product-shadow stage: 바탕 없이 돌리려 했다');
      const angFrom = angleOf(from);
      const delta = ((angleOf(now.a) - angFrom + 540) % 360) - 180;
      const lenFrom = lengthOf(from);
      const frames = Math.ceil(TURN_MS / FRAME_MS);
      for (let i = 0; i <= frames; i += 1) {
        if (mine !== gen || destroyed) return;
        const p = i / frames;
        const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        const ang = ((angFrom + delta * e) * Math.PI) / 180;
        const len = lenFrom + (now.aLen - lenFrom) * e;
        const a: Vec2 = [len * Math.cos(ang), len * Math.sin(ang)];
        const { sep, shadow } = shadowOf(a, base.b);
        drawStatic(scene, { a, shadow, sep });
        if (i < frames) await wait(FRAME_MS);
      }
    }

    const renderer: SceneRenderer<DotProductShadowScene> & { destroy(): void } = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        const step = next.step;
        if (!opts.animate || step === null || step.kind !== 'turn') {
          drawStatic(next, null);
          return;
        }
        // 정본은 끝 자리 — 운동은 아직 못 온 만큼(출발값 from)에서 흐른다.
        drawStatic(next, null);
        await turn(next, step.from, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next, null);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
