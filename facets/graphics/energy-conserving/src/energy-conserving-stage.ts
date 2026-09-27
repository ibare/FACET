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
import { direction, type EnergySplit } from './algorithm.js';
import type { EnergyBase, EnergyScene } from './scene.js';

/**
 * 들어온 빛 한 줄기가 표면에서 갈라지는 흐름.
 *
 * 줄기의 폭이 곧 양이다 — 들어온 줄기의 폭이 1 이고, 갈라진 줄기들의 폭을 모으면 다시 1 이다.
 * 정반사 몫은 표면에 닿아 곧장 되돌아 오르고, 나머지는 표면 아래로 들어가 한 번 더 갈라져
 * 퍼짐은 되올라오고 흡수는 안에서 멈춘다. 왼쪽 작은 그림은 지금 들어오는 각을 가리킨다.
 */

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CAPTION_Y = 22;
const ROW_IN = 48;
const ROW_OUT = 66;
/** 줄기 윗끝 */
const TOP = 78;
/** 되도는 줄기의 안쪽 반지름 */
const R0 = 10;
/** 표면 아래에서 둘째 갈림까지 */
const DEPTH = 24;
const DIAL_W = 140;
const U_MAX = 140;

const MOTION_MS = 900;
const ROT_END = 1 / 3;
const SPLIT1_END = 2 / 3;

type Layout = {
  u: number;
  a: number;
  sy: number;
  cyD: number;
  yEnd: number;
  dialX: number;
  dialR: number;
};

type Progress = { rot: number; first: number; second: number };

type Pt = { x: number; y: number };
type Seg =
  | { kind: 'line'; from: Pt; to: Pt }
  | { kind: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number };

function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function fmt3(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toFixed(3);
}

function fmtAmount(v: number): string {
  return Number.isInteger(v) ? String(v) : fmt3(v);
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function layoutFor(base: EnergyBase): Layout {
  const leftMin = PAD + DIAL_W + PAD;
  const avail = PIECE_CANVAS_W - PAD - leftMin;
  const widthU = (avail - 4 * R0) / (2 + base.rho);
  const heightU = (H - 4 - 18 - TOP - 8 - R0 - DEPTH - R0) / (1 + base.rho);
  const u = Math.min(U_MAX, widthU, heightU);
  if (!(u > 0)) throw new Error('energy-conserving stage: 줄기 폭을 셈할 수 없다');
  const total = u + 2 * R0 + u + 2 * R0 + base.rho * u;
  const left = leftMin + (avail - total) / 2;
  const a = left + u + 2 * R0;
  const sy = TOP + u + R0 + 8;
  const cyD = sy + DEPTH;
  const yEnd = cyD + R0 + base.rho * u;
  const dialX = PAD + 44;
  const dialR = Math.min(sy - TOP, left - 12 - dialX);
  return { u, a, sy, cyD, yEnd, dialX, dialR };
}

type Sample = { x: number; y: number; tx: number; ty: number };

/** 가운데 줄을 따라 촘촘히 찍은 점과 그 자리의 접선 — 접선은 식에서 곧바로 얻는다 */
function sample(segs: Seg[]): Sample[] {
  const pts: Sample[] = [];
  for (const seg of segs) {
    if (seg.kind === 'line') {
      const len = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y);
      if (!(len > 0)) throw new Error('energy-conserving stage: 길이 0 인 줄기 토막');
      const tx = (seg.to.x - seg.from.x) / len;
      const ty = (seg.to.y - seg.from.y) / len;
      if (pts.length === 0) pts.push({ x: seg.from.x, y: seg.from.y, tx, ty });
      pts.push({ x: seg.to.x, y: seg.to.y, tx, ty });
    } else {
      const n = 32;
      const sign = seg.a1 >= seg.a0 ? 1 : -1;
      for (let i = pts.length === 0 ? 0 : 1; i <= n; i += 1) {
        const ang = seg.a0 + ((seg.a1 - seg.a0) * i) / n;
        pts.push({
          x: seg.cx + seg.r * Math.cos(ang),
          y: seg.cy + seg.r * Math.sin(ang),
          tx: -Math.sin(ang) * sign,
          ty: Math.cos(ang) * sign,
        });
      }
    }
  }
  return pts;
}

/** 가운데 줄의 앞쪽 p 만큼을 폭 w 의 줄기로 — 모자란 만큼은 아직 흐르지 않은 것이다 */
function bandPath(segs: Seg[], w: number, p: number): string | null {
  if (p <= 0 || w <= 0) return null;
  const pts = sample(segs);
  if (pts.length < 2) throw new Error('energy-conserving stage: 줄기의 가운데 줄이 짧다');
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const q0 = pts[i - 1] as Sample;
    const q1 = pts[i] as Sample;
    lens.push((lens[i - 1] as number) + Math.hypot(q1.x - q0.x, q1.y - q0.y));
  }
  const total = lens[lens.length - 1] as number;
  const want = total * Math.min(1, p);
  const cut: Sample[] = [pts[0] as Sample];
  for (let i = 1; i < pts.length; i += 1) {
    const q0 = pts[i - 1] as Sample;
    const q1 = pts[i] as Sample;
    const l0 = lens[i - 1] as number;
    const l1 = lens[i] as number;
    if (l1 >= want) {
      const f = l1 > l0 ? (want - l0) / (l1 - l0) : 1;
      const tx = q0.tx + (q1.tx - q0.tx) * f;
      const ty = q0.ty + (q1.ty - q0.ty) * f;
      const tl = Math.hypot(tx, ty);
      cut.push({ x: q0.x + (q1.x - q0.x) * f, y: q0.y + (q1.y - q0.y) * f, tx: tx / tl, ty: ty / tl });
      break;
    }
    cut.push(q1);
  }
  const half = w / 2;
  const left = cut.map((c) => ({ x: c.x - c.ty * half, y: c.y + c.tx * half }));
  const right = cut.map((c) => ({ x: c.x + c.ty * half, y: c.y - c.tx * half })).reverse();
  const all = [...left, ...right];
  return all.map((q, i) => `${i === 0 ? 'M' : 'L'}${num(q.x)} ${num(q.y)}`).join(' ') + ' Z';
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  parent.appendChild(node);
  return node;
}

type Draw = {
  svg: SVGSVGElement;
  colors: Palette;
  t: Translate;
  hues: readonly string[];
};

function labelWithValue(
  d: Draw,
  x: number,
  y: number,
  anchor: 'start' | 'middle' | 'end',
  name: string,
  value: string,
): void {
  const text = el(d.svg, 'text', {
    x,
    y,
    'text-anchor': anchor,
    'font-family': fonts.body,
    'font-size': fontSizes.sm,
    fill: d.colors.text,
  });
  const a = el(text, 'tspan', {});
  a.textContent = name;
  const b = el(text, 'tspan', { dx: 6, 'font-family': fonts.mono, 'font-weight': 600 });
  b.textContent = value;
}

function drawScene(d: Draw, scene: EnergyScene, prog: Progress | null): void {
  const { svg, colors, t } = d;
  svg.textContent = '';
  const L = layoutFor(scene.base);
  const cur: EnergySplit | undefined = scene.trail[scene.trail.length - 1];
  const W = PIECE_CANVAS_W;
  const incomingColor = colors.accent;
  const specularColor = d.hues[1] as string;
  const diffuseColor = d.hues[2] as string;
  const absorbedColor = colors.textMuted;

  // 캡션 — 지금 일어나는 일
  const caption = el(svg, 'text', {
    x: PAD,
    y: CAPTION_Y,
    'font-family': fonts.body,
    'font-size': fontSizes.md,
    fill: colors.text,
  });
  caption.textContent =
    cur === undefined
      ? t('caption.start', 'Light reaches the surface.')
      : t('caption.split', 'Angle: {deg}° · out total: {out}', {
          deg: String(Math.round(cur.deg)),
          out: fmt3(cur.out),
        });

  // 표면과 그 아래
  el(svg, 'rect', { x: PAD, y: L.sy, width: W - 2 * PAD, height: H - 4 - L.sy, fill: colors.bgSubtle });
  el(svg, 'line', { x1: PAD, y1: L.sy, x2: W - PAD, y2: L.sy, stroke: colors.text, 'stroke-width': 1.5 });
  labelWithValue(
    d,
    PAD + 6,
    H - 14,
    'start',
    t('label.surface', 'Surface'),
    `F0 ${num(scene.base.f0)} · ρ ${num(scene.base.rho)}`,
  );

  // 들어오는 각 — 법선과 빛줄기
  const P = { x: L.dialX, y: L.sy };
  el(svg, 'line', {
    x1: P.x,
    y1: P.y,
    x2: P.x,
    y2: P.y - L.dialR,
    stroke: colors.textMuted,
    'stroke-width': 1,
    'stroke-dasharray': '4 4',
  });
  if (cur !== undefined) {
    const step = scene.step;
    if (step === null) throw new Error('energy-conserving stage: 가른 몫이 있는데 걸음이 없다');
    const rot = prog === null ? 1 : prog.rot;
    const from = step.fromDeg;
    const deg = from === null ? cur.deg : from + (cur.deg - from) * rot;
    const len = from === null ? L.dialR * rot : L.dialR;
    const dir = direction(deg);
    const sx = dir.x;
    const sy = -dir.y;
    if (len > 0) {
      const tip = { x: P.x + sx * len, y: P.y + sy * len };
      const head = 10;
      const base = { x: P.x + sx * head, y: P.y + sy * head };
      el(svg, 'line', {
        x1: tip.x,
        y1: tip.y,
        x2: base.x,
        y2: base.y,
        stroke: incomingColor,
        'stroke-width': 3,
        'stroke-linecap': 'butt',
      });
      el(svg, 'path', {
        d: `M${num(P.x)} ${num(P.y)} L${num(base.x - sy * 5)} ${num(base.y + sx * 5)} L${num(base.x + sy * 5)} ${num(base.y - sx * 5)} Z`,
        fill: incomingColor,
      });
    }
    if (rot >= 1) {
      const arcR = 34;
      if (Math.abs(Math.round(cur.deg)) >= 1) {
        const end = { x: P.x + sx * arcR, y: P.y + sy * arcR };
        el(svg, 'path', {
          d: `M${num(P.x)} ${num(P.y - arcR)} A${arcR} ${arcR} 0 0 ${cur.deg > 0 ? 1 : 0} ${num(end.x)} ${num(end.y)}`,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1,
        });
      }
      const mid = direction(cur.deg / 2);
      const deg = el(svg, 'text', {
        x: P.x + mid.x * 52 + (cur.deg >= 0 ? 4 : -4),
        y: P.y - mid.y * 52,
        'text-anchor': cur.deg >= 0 ? 'start' : 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      deg.textContent = `${Math.round(cur.deg)}°`;
    }
  }

  const { u, a } = L;
  const scale = u / scene.base.incoming;

  // 들어온 줄기 — 폭이 곧 1
  if (cur === undefined) {
    el(svg, 'rect', { x: a, y: TOP, width: u, height: L.sy - TOP, fill: incomingColor });
  } else {
    const ws = cur.specular * scale;
    const cyS = L.sy - R0 - ws;
    el(svg, 'path', {
      d: `M${num(a)} ${num(TOP)} L${num(a + u)} ${num(TOP)} L${num(a + u)} ${num(L.sy)} L${num(a + ws)} ${num(L.sy)} L${num(a + ws)} ${num(cyS)} L${num(a)} ${num(cyS)} Z`,
      fill: incomingColor,
    });
  }
  labelWithValue(d, a + u / 2, ROW_IN, 'middle', t('label.incoming', 'Incoming light'), fmtAmount(scene.base.incoming));

  if (cur === undefined) return;

  const first = prog === null ? 1 : prog.first;
  const second = prog === null ? 1 : prog.second;
  const ws = cur.specular * scale;
  const wi = cur.inward * scale;
  const wd = cur.diffuse * scale;
  const wa = cur.absorbed * scale;
  const cyS = L.sy - R0 - ws;

  // 첫 갈림 — 정반사는 표면에 닿아 곧장 되오르고, 나머지는 안으로
  const specular = bandPath(
    [
      { kind: 'arc', cx: a - R0, cy: cyS, r: R0 + ws / 2, a0: 0, a1: Math.PI },
      { kind: 'line', from: { x: a - 2 * R0 - ws / 2, y: cyS }, to: { x: a - 2 * R0 - ws / 2, y: TOP } },
    ],
    ws,
    first,
  );
  if (specular !== null) el(svg, 'path', { d: specular, fill: specularColor });
  const inward = bandPath(
    [{ kind: 'line', from: { x: a + ws + wi / 2, y: L.sy }, to: { x: a + ws + wi / 2, y: L.cyD } }],
    wi,
    first,
  );
  if (inward !== null) el(svg, 'path', { d: inward, fill: incomingColor });

  // 둘째 갈림 — 안에서 퍼짐은 되올라오고 흡수는 멈춘다
  const diffuse = bandPath(
    [
      { kind: 'arc', cx: a + u + R0, cy: L.cyD, r: R0 + wd / 2, a0: Math.PI, a1: 0 },
      { kind: 'line', from: { x: a + u + 2 * R0 + wd / 2, y: L.cyD }, to: { x: a + u + 2 * R0 + wd / 2, y: TOP } },
    ],
    wd,
    second,
  );
  if (diffuse !== null) el(svg, 'path', { d: diffuse, fill: diffuseColor });
  const absorbed = bandPath(
    [{ kind: 'line', from: { x: a + ws + wa / 2, y: L.cyD }, to: { x: a + ws + wa / 2, y: L.yEnd } }],
    wa,
    second,
  );
  if (absorbed !== null) el(svg, 'path', { d: absorbed, fill: absorbedColor });

  if (prog !== null) return;

  // 멈춘 끝 — 흡수는 여기서 그친다
  el(svg, 'line', {
    x1: a + ws - 4,
    y1: L.yEnd,
    x2: a + ws + wa + 4,
    y2: L.yEnd,
    stroke: colors.text,
    'stroke-width': 2,
  });
  labelWithValue(d, a - 2 * R0 - ws / 2, ROW_OUT, 'middle', t('label.specular', 'Specular'), fmt3(cur.specular));
  labelWithValue(d, a + u + 2 * R0 + wd / 2, ROW_OUT, 'middle', t('label.diffuse', 'Diffuse'), fmt3(cur.diffuse));
  labelWithValue(d, a + ws - 10, L.yEnd + 4, 'end', t('label.absorbed', 'Absorbed'), fmt3(cur.absorbed));
}

export const energyConservingStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const d: Draw = { svg, colors: getColors(params.theme), t, hues: categorical(3, 'vivid') };

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const started = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed) return wake();
          const p = Math.min(1, (Date.now() - started) / ms);
          frame(p);
          if (p >= 1) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    const drawStatic = (scene: EnergyScene): void => drawScene(d, scene, null);

    return {
      async render(next: EnergyScene, _prev: EnergyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          drawStatic(next);
          return;
        }
        await tween(MOTION_MS, (p) => {
          if (mine !== gen || destroyed) return;
          const e = p;
          drawScene(d, next, {
            rot: ease(e / ROT_END),
            first: ease((e - ROT_END) / (SPLIT1_END - ROT_END)),
            second: ease((e - SPLIT1_END) / (1 - SPLIT1_END)),
          });
        });
        if (mine !== gen || destroyed) return;
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
  },
};
