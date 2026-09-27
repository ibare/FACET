/**
 * global-illumination 무대 — 왼쪽은 방(y 위를 화면 위로 뒤집는다), 오른쪽은 튐마다 한 점씩 뻗는 바닥 평균 그래프.
 *
 * 패치마다 채널 셋(R · G · B)의 가는 막대가 방 바깥쪽으로 선다. 막대 축은 init payload 의 `chart.light` 가 패치
 * 길이 하나다. 빛 패치는 막대 대신 빛 표지를 둔다 (1 을 넘는다). 패치 띠는 그 튐의 빛을 채널마다 1 로 자른 색으로
 * 칠한다 — 선형 RGB, 감마 없음. 막대의 색은 셈의 값이 아니라 "어느 채널인가" 를 가르는 디자인 색이라
 * `categorical(3)` 에서 받고, probe 패치의 막대에 R · G · B 글자 이름을 붙여 가른다.
 *
 * 운동: 걸음마다 막대가 앞 튐의 길이에서 이번 튐의 길이로 자라고 그래프 선이 한 점 뻗는다. 판 머리(init)에서는
 * 막대가 B₀ = E 의 자리(빛 패치만 빛난다 — 나머지는 0)로 줄어들고, 앞 판 막대 끝과 그래프 끝 높이는 점선 눈금
 * (자리)으로만 남는다. 앞 판의 수 · 선 · 멈춤 표지는 init 에서 걷는다.
 *
 * 무대는 알고리즘의 셈을 다시 하지 않는다 — payload 가 준 값만 그리고, 빠진 값은 던진다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type GiPatchView = { id: string; kind: string; ax: number; ay: number; bx: number; by: number; emitter: boolean };

export type GiInitView = {
  rho: number;
  tolerance: number;
  chart: { bounces: number; light: number };
  probe: string;
  patches: GiPatchView[];
  light: number[][];
  floorMean: number;
};

export type GiBounceView = {
  bounce: number;
  light: number[][];
  added: number;
  accumulated: number;
  floorMean: number;
  probeRgb: number[];
  bleed: number;
};

export type GiConvergedView = {
  bounce: number;
  added: number;
  accumulated: number;
  tolerance: number;
  limit: number;
};

/** projector 가 부르는 무대의 표면 */
export type GlobalIlluminationStage = ViewInstance & {
  reset(): void;
  init(p: GiInitView, motionMs: number): void;
  bounce(p: GiBounceView, motionMs: number): void;
  converged(p: GiConvergedView): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 440;
/** 방 한 칸(패치 길이 1)의 화면 길이 */
const UNIT = 50;
/** 방 왼쪽 아래 모서리의 화면 자리 — 바깥쪽 막대 한 칸과 글자 자리를 둔다 */
const ROOM_LEFT = 44 + UNIT;
const ROOM_TOP = 64 + UNIT;
const STRIP = 8;
const BAR_W = 0.18;
const BAR_AT = [0.25, 0.5, 0.75];
const PLOT = { left: 430, right: 660, top: 80, bottom: 320 };
const CAPTION_Y = 408;



/** 표시 반올림 — 절반은 0 에서 먼 쪽, −0 은 0 */
function fmt(x: number, digits: number): string {
  if (!Number.isFinite(x)) throw new Error(`global-illumination-stage: 수가 아닌 값 ${x}`);
  const p = 10 ** digits;
  const r = (Math.sign(x) * Math.round(Math.abs(x) * p)) / p;
  return (r === 0 ? 0 : r).toFixed(digits);
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

/** 선형 RGB(0..1) → 칠할 색. 1 을 넘는 값은 채널마다 1 로 자른다 */
function lightColor(rgb: number[]): string {
  if (rgb.length !== 3) throw new Error('global-illumination-stage: 채널이 셋이 아니다');
  const ch = rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

type BarGeom = { id: string; emitter: boolean; base: [number, number][]; normal: [number, number]; scale: number };

export const globalIlluminationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smallPx = parseFloat(fontSizes.sm);

    const root = el('g', {});
    svg.appendChild(root);

    // ── 운동의 기억 ─────────────────────────────────────────────
    let frame: number | null = null;
    /** 패치 id → 채널 셋의 지금 보이는 막대 값 */
    let barFrom = new Map<string, number[]>();
    let barTo = new Map<string, number[]>();
    let progress = 1;
    let tweenStart = 0;
    let tweenMs = 0;
    /** 그래프 — 이 판에 놓인 점 (튐, 바닥 평균) */
    let points: [number, number][] = [];
    /** 앞 판의 자리 — 막대 끝 · 그래프 끝 */
    let prevTicks: Map<string, number[]> | null = null;
    let prevEnd: [number, number] | null = null;
    let runHadBounce = false;

    // ── 판 자료 (init 이 준다) ───────────────────────────────────
    let geoms: BarGeom[] = [];
    let chart: { bounces: number; light: number } | null = null;
    let probeId = '';

    // ── 요소 ────────────────────────────────────────────────────
    let barRects = new Map<string, SVGPolygonElement[]>();
    let stripRects = new Map<string, SVGRectElement>();
    let lineEl: SVGPolylineElement | null = null;
    let dotsG: SVGGElement | null = null;
    let endText: SVGTextElement | null = null;
    let stopG: SVGGElement | null = null;
    let probeText: SVGTextElement | null = null;
    let caption: SVGTextElement | null = null;
    let caption2: SVGTextElement | null = null;

    const sx = (x: number) => ROOM_LEFT + x * UNIT;
    const sy = (y: number) => ROOM_TOP + 4 * UNIT - y * UNIT;
    const px = (bounce: number) => {
      if (chart === null) throw new Error('global-illumination-stage: init 전에 그래프를 그린다');
      return PLOT.left + (bounce / chart.bounces) * (PLOT.right - PLOT.left);
    };
    const py = (v: number) => {
      if (chart === null) throw new Error('global-illumination-stage: init 전에 그래프를 그린다');
      return PLOT.bottom - (v / chart.light) * (PLOT.bottom - PLOT.top);
    };

    const text = (x: number, y: number, s: string, extra: Record<string, string | number> = {}) => {
      const node = el('text', { x, y, fill: pal.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, ...extra });
      node.textContent = s;
      return node;
    };

    const kindLabel = (kind: string): string => {
      switch (kind) {
        case 'floor':
          return t('label.floor', 'floor');
        case 'ceiling':
          return t('label.ceiling', 'ceiling');
        case 'red':
          return t('label.red', 'red wall');
        case 'green':
          return t('label.green', 'green wall');
        default:
          throw new Error(`global-illumination-stage: 종류 ${kind} 의 이름이 없다`);
      }
    };

    const cancelFrame = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const barPoints = (g: BarGeom, k: number, value: number) => {
      if (chart === null) throw new Error('global-illumination-stage: init 전에 막대를 그린다');
      const len = (value / chart.light) * g.scale;
      const [p0, p1] = [g.base[k * 2], g.base[k * 2 + 1]];
      const q0: [number, number] = [p0[0] + g.normal[0] * len, p0[1] + g.normal[1] * len];
      const q1: [number, number] = [p1[0] + g.normal[0] * len, p1[1] + g.normal[1] * len];
      return [p0, p1, q1, q0].map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    };

    const valueAt = (id: string, c: number, s: number) => {
      const to = barTo.get(id);
      if (to === undefined) throw new Error(`global-illumination-stage: 패치 ${id} 의 막대 값이 없다`);
      const from = barFrom.get(id);
      const f = from === undefined ? 0 : from[c];
      return f + (to[c] - f) * s;
    };

    const draw = () => {
      const s = progress < 1 ? 1 - (1 - progress) * (1 - progress) : 1;
      for (const g of geoms) {
        if (g.emitter) continue;
        const rects = barRects.get(g.id);
        if (rects === undefined) throw new Error(`global-illumination-stage: 패치 ${g.id} 의 막대가 없다`);
        for (let c = 0; c < 3; c += 1) rects[c].setAttribute('points', barPoints(g, c, valueAt(g.id, c, s)));
      }
      if (lineEl !== null) {
        const pts = points.map((p) => [px(p[0]), py(p[1])] as [number, number]);
        if (pts.length >= 2 && s < 1) {
          const a = pts[pts.length - 2];
          const b = pts[pts.length - 1];
          pts[pts.length - 1] = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
        }
        lineEl.setAttribute('points', pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' '));
      }
    };

    const tick = (now: number) => {
      frame = null;
      progress = tweenMs <= 0 ? 1 : Math.min(1, (now - tweenStart) / tweenMs);
      draw();
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    /** 지금 보이는 막대 값을 출발점으로 삼아 새 목표로 옮겨 간다 */
    const startTween = (next: Map<string, number[]>, motionMs: number) => {
      cancelFrame();
      const s = progress < 1 ? 1 - (1 - progress) * (1 - progress) : 1;
      const from = new Map<string, number[]>();
      for (const [id] of next) {
        from.set(id, barTo.has(id) ? [0, 1, 2].map((c) => valueAt(id, c, s)) : [0, 0, 0]);
      }
      barFrom = from;
      barTo = next;
      if (motionMs <= 0 || isInstant()) {
        progress = 1;
        draw();
        return;
      }
      progress = 0;
      tweenStart = performance.now();
      tweenMs = motionMs;
      draw();
      frame = requestAnimationFrame(tick);
    };

    params.onScrubStart?.(() => {
      cancelFrame();
      progress = 1;
      draw();
    });

    const clearAll = () => {
      cancelFrame();
      while (root.firstChild) root.removeChild(root.firstChild);
      barRects = new Map();
      stripRects = new Map();
      lineEl = null;
      dotsG = null;
      endText = null;
      stopG = null;
      probeText = null;
      caption = null;
      caption2 = null;
    };

    const lightOf = (light: number[][], i: number, id: string) => {
      const rgb = light[i];
      if (!Array.isArray(rgb) || rgb.length !== 3) throw new Error(`global-illumination-stage: 패치 ${id} 의 빛이 없다`);
      return rgb;
    };

    const buildBarTargets = (light: number[][]) => {
      if (light.length !== geoms.length) throw new Error(`global-illumination-stage: 빛이 ${light.length} 패치 몫인데 무대는 ${geoms.length}`);
      const next = new Map<string, number[]>();
      geoms.forEach((g, i) => {
        if (!g.emitter) next.set(g.id, lightOf(light, i, g.id).slice());
      });
      return next;
    };

    const paintStrips = (light: number[][]) => {
      geoms.forEach((g, i) => {
        const r = stripRects.get(g.id);
        if (r === undefined) throw new Error(`global-illumination-stage: 패치 ${g.id} 의 띠가 없다`);
        r.setAttribute('fill', lightColor(lightOf(light, i, g.id)));
      });
    };

    const instance: GlobalIlluminationStage = {
      reset() {
        clearAll();
        barFrom = new Map();
        barTo = new Map();
        progress = 1;
        points = [];
        prevTicks = null;
        prevEnd = null;
        runHadBounce = false;
        geoms = [];
        chart = null;
        probeId = '';
      },

      init(p, motionMs) {
        // 앞 판이 튐을 하나라도 그렸으면 그 끝을 자리로 남긴다 (init 을 두 번 먹여도 그대로)
        if (runHadBounce) {
          prevTicks = new Map([...barTo].map(([id, v]) => [id, v.slice()]));
          const last = points[points.length - 1];
          prevEnd = last === undefined ? null : [last[0], last[1]];
        }
        runHadBounce = false;
        clearAll();
        chart = { bounces: p.chart.bounces, light: p.chart.light };
        probeId = p.probe;
        if (!p.patches.some((q) => q.id === probeId)) throw new Error(`global-illumination-stage: probe ${probeId} 가 패치에 없다`);

        // 방의 가운데 — 막대가 방 바깥쪽으로 서게 법선을 고른다
        const xs = p.patches.flatMap((q) => [q.ax, q.bx]);
        const ys = p.patches.flatMap((q) => [q.ay, q.by]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        if (Math.min(...xs) < 0 || Math.max(...xs) > 4 || Math.min(...ys) < 0 || Math.max(...ys) > 4) {
          throw new Error('global-illumination-stage: 방이 무대가 잡은 0..4 칸을 넘는다');
        }

        // 방 안쪽
        const room = el('rect', {
          x: sx(Math.min(...xs)),
          y: sy(Math.max(...ys)),
          width: (Math.max(...xs) - Math.min(...xs)) * UNIT,
          height: (Math.max(...ys) - Math.min(...ys)) * UNIT,
          fill: pal.bgSubtle,
          stroke: pal.border,
        });
        root.appendChild(room);

        // 머리 — 막대 읽는 법과 점선의 뜻
        root.appendChild(text(24, 24, t('legend.bars', 'Bars: R · G · B of each patch · one patch length = {axis}', { axis: fmt(p.chart.light, 2) }), { fill: pal.textMuted }));
        root.appendChild(text(24, 42, t('legend.prev', 'Dashed = previous run'), { fill: pal.textMuted }));

        geoms = p.patches.map((q) => {
          const ux = q.bx - q.ax;
          const uy = q.by - q.ay;
          const len = Math.hypot(ux, uy);
          if (len === 0) throw new Error(`global-illumination-stage: 패치 ${q.id} 의 길이가 0`);
          let nx = uy / len;
          let ny = -ux / len;
          const mx = (q.ax + q.bx) / 2 - cx;
          const my = (q.ay + q.by) / 2 - cy;
          if (nx * mx + ny * my < 0) {
            nx = -nx;
            ny = -ny;
          }
          const snx = nx;
          const sny = -ny;
          const base: [number, number][] = [];
          for (const at of BAR_AT) {
            for (const side of [-1, 1]) {
              const wx = q.ax + ux * (at + (side * BAR_W) / 2);
              const wy = q.ay + uy * (at + (side * BAR_W) / 2);
              base.push([sx(wx) + snx * (STRIP / 2), sy(wy) + sny * (STRIP / 2)]);
            }
          }
          return { id: q.id, emitter: q.emitter, base, normal: [snx, sny], scale: len * UNIT };
        });

        // 앞 판의 자리 — 막대 끝 점선 눈금
        const ticksG = el('g', { stroke: pal.textMuted, 'stroke-dasharray': '3 2', 'stroke-width': 1.2 });
        root.appendChild(ticksG);
        // 막대
        const barsG = el('g', {});
        root.appendChild(barsG);
        const channelFill = categorical(3, 'vivid');
        const channelName = [t('channel.r', 'R'), t('channel.g', 'G'), t('channel.b', 'B')];
        for (const g of geoms) {
          if (g.emitter) {
            const mxp = (g.base[0][0] + g.base[5][0]) / 2 + g.normal[0] * UNIT * 0.45;
            const myp = (g.base[0][1] + g.base[5][1]) / 2 + g.normal[1] * UNIT * 0.45;
            const sun = el('g', {});
            for (let r = 0; r < 8; r += 1) {
              const a = (r * Math.PI) / 4;
              sun.appendChild(el('line', {
                x1: mxp + Math.cos(a) * 9, y1: myp + Math.sin(a) * 9,
                x2: mxp + Math.cos(a) * 14, y2: myp + Math.sin(a) * 14,
                stroke: pal.accent, 'stroke-width': 2,
              }));
            }
            sun.appendChild(el('circle', { cx: mxp, cy: myp, r: 7, fill: pal.accent, stroke: pal.stateInk, 'stroke-width': 1 }));
            barsG.appendChild(sun);
            continue;
          }
          const rects: SVGPolygonElement[] = [];
          for (let c = 0; c < 3; c += 1) {
            const poly = el('polygon', { points: '', fill: channelFill[c], stroke: pal.border, 'stroke-width': 0.5 });
            barsG.appendChild(poly);
            rects.push(poly);
            if (g.id === probeId) {
              // 채널 이름 — 막대 뿌리 반대편(방 안쪽)에 글자로
              const bx = (g.base[c * 2][0] + g.base[c * 2 + 1][0]) / 2 - g.normal[0] * (STRIP + 8);
              const by = (g.base[c * 2][1] + g.base[c * 2 + 1][1]) / 2 - g.normal[1] * (STRIP + 8) + 4;
              barsG.appendChild(text(bx, by, channelName[c], { 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: channelFill[c] }));
            }
            if (prevTicks !== null) {
              const pv = prevTicks.get(g.id);
              if (pv !== undefined) {
                const len = (pv[c] / p.chart.light) * g.scale;
                const p0 = g.base[c * 2];
                const p1 = g.base[c * 2 + 1];
                ticksG.appendChild(el('line', {
                  x1: p0[0] + g.normal[0] * len - g.normal[1] * 2, y1: p0[1] + g.normal[1] * len + g.normal[0] * 2,
                  x2: p1[0] + g.normal[0] * len + g.normal[1] * 2, y2: p1[1] + g.normal[1] * len - g.normal[0] * 2,
                }));
              }
            }
          }
          barRects.set(g.id, rects);
        }
        // 빛 표지의 이름 — 첫 빛 패치 둘 사이
        const emitters = geoms.filter((g) => g.emitter);
        if (emitters.length > 0) {
          const ex = emitters.reduce((s, g) => s + (g.base[0][0] + g.base[5][0]) / 2, 0) / emitters.length;
          const ey = emitters.reduce((s, g) => s + (g.base[0][1] + g.base[5][1]) / 2, 0) / emitters.length;
          const nrm = emitters[0].normal;
          root.appendChild(text(ex + nrm[0] * UNIT * 0.9, ey + nrm[1] * UNIT * 0.9 + 4, t('label.light', 'light'), { 'text-anchor': 'middle' }));
        }

        // 패치 띠 (위에 얹어 막대의 뿌리를 덮는다)
        const stripsG = el('g', {});
        root.appendChild(stripsG);
        for (const q of p.patches) {
          const x0 = Math.min(sx(q.ax), sx(q.bx));
          const x1 = Math.max(sx(q.ax), sx(q.bx));
          const y0 = Math.min(sy(q.ay), sy(q.by));
          const y1 = Math.max(sy(q.ay), sy(q.by));
          const r = el('rect', {
            x: x0 - (x1 - x0 === 0 ? STRIP / 2 : 0),
            y: y0 - (y1 - y0 === 0 ? STRIP / 2 : 0),
            width: x1 - x0 === 0 ? STRIP : x1 - x0,
            height: y1 - y0 === 0 ? STRIP : y1 - y0,
            stroke: q.id === probeId ? pal.text : pal.border,
            'stroke-width': q.id === probeId ? 2 : 1,
            fill: pal.bg,
          });
          stripsG.appendChild(r);
          stripRects.set(q.id, r);
        }

        // 벽 이름 — 종류마다 방 안쪽에
        const kinds = [...new Set(p.patches.map((q) => q.kind))];
        for (const kind of kinds) {
          const ofKind = p.patches.filter((q) => q.kind === kind);
          const kx = ofKind.reduce((s, q) => s + (q.ax + q.bx) / 2, 0) / ofKind.length;
          const ky = ofKind.reduce((s, q) => s + (q.ay + q.by) / 2, 0) / ofKind.length;
          const ix = kx + (cx - kx) * 0.2;
          const iy = ky + (cy - ky) * 0.2;
          const vertical = ofKind.every((q) => q.ax === q.bx);
          const label = kindLabel(kind);
          const node = text(sx(ix), sy(iy) + 4, label, { 'text-anchor': 'middle', fill: pal.textMuted });
          if (vertical) node.setAttribute('transform', `rotate(${kx < cx ? -90 : 90} ${sx(ix)} ${sy(iy)})`);
          root.appendChild(node);
        }
        // 가운데 — 이 판의 반사율
        root.appendChild(text(sx(cx), sy(cy) + 6, t('stage.rho', 'ρ {rho}', { rho: String(p.rho) }), {
          'text-anchor': 'middle', 'font-size': fontSizes.xl, 'font-family': fonts.mono,
        }));

        // probe 글자 — 바닥 왼쪽 패치 바깥쪽 막대 너머
        const pg = geoms.find((g) => g.id === probeId);
        if (pg === undefined) throw new Error(`global-illumination-stage: probe ${probeId} 의 자리가 없다`);
        const pmx = (pg.base[0][0] + pg.base[5][0]) / 2 + pg.normal[0] * (pg.scale + 12);
        const pmy = (pg.base[0][1] + pg.base[5][1]) / 2 + pg.normal[1] * (pg.scale + 12) + 4;
        probeText = text(pmx, pmy, t('probe.name', 'floor 1'), { 'text-anchor': 'start', fill: pal.text });
        root.appendChild(probeText);

        // 그래프 — 축은 고정 (chart)
        const axis = el('g', { stroke: pal.border, 'stroke-width': 1 });
        axis.appendChild(el('line', { x1: PLOT.left, y1: PLOT.bottom, x2: PLOT.right, y2: PLOT.bottom }));
        axis.appendChild(el('line', { x1: PLOT.left, y1: PLOT.top, x2: PLOT.left, y2: PLOT.bottom }));
        root.appendChild(axis);
        for (let b = 0; b <= p.chart.bounces; b += 1) {
          root.appendChild(text(px(b), PLOT.bottom + 16, String(b), { 'text-anchor': 'middle', fill: pal.textMuted, 'font-size': fontSizes.xs }));
        }
        for (let v = 0; v <= p.chart.light + 1e-9; v += 0.1) {
          root.appendChild(el('line', { x1: PLOT.left - 3, y1: py(v), x2: PLOT.right, y2: py(v), stroke: pal.border, 'stroke-width': 0.5 }));
          root.appendChild(text(PLOT.left - 6, py(v) + 4, fmt(v, 1), { 'text-anchor': 'end', fill: pal.textMuted, 'font-size': fontSizes.xs }));
        }
        root.appendChild(text((PLOT.left + PLOT.right) / 2, PLOT.bottom + 34, t('axis.bounce', 'bounce'), { 'text-anchor': 'middle', fill: pal.textMuted }));
        root.appendChild(text(PLOT.left, PLOT.top - 14, t('axis.floorMean', 'floor mean'), { 'text-anchor': 'start', fill: pal.textMuted }));
        if (prevEnd !== null) {
          root.appendChild(el('line', {
            x1: px(prevEnd[0]) - 12, y1: py(prevEnd[1]), x2: px(prevEnd[0]) + 12, y2: py(prevEnd[1]),
            stroke: pal.textMuted, 'stroke-dasharray': '3 2', 'stroke-width': 1.2,
          }));
        }
        lineEl = el('polyline', { points: '', fill: 'none', stroke: pal.primary, 'stroke-width': 2 });
        root.appendChild(lineEl);
        dotsG = el('g', {});
        root.appendChild(dotsG);
        endText = text(0, 0, '', { 'font-family': fonts.mono, 'font-size': fontSizes.xs });
        root.appendChild(endText);
        stopG = el('g', {});
        root.appendChild(stopG);

        caption = text(24, CAPTION_Y, t('caption.init', 'Reflectance ρ {rho} · bounce 0: only the light patches glow', { rho: String(p.rho) }));
        caption2 = text(24, CAPTION_Y + smallPx + 10, '', {});
        root.appendChild(caption);
        root.appendChild(caption2);

        // 걸음 0 — B = E. 그래프는 튐 0 의 점 하나
        points = [[0, p.floorMean]];
        dotsG.appendChild(el('circle', { cx: px(0), cy: py(p.floorMean), r: 3, fill: pal.primary }));
        paintStrips(p.light);
        startTween(buildBarTargets(p.light), motionMs);
      },

      bounce(p, motionMs) {
        if (chart === null || caption === null || dotsG === null || endText === null || probeText === null) {
          throw new Error('global-illumination-stage: init 전에 튐이 왔다');
        }
        if (p.bounce > chart.bounces) throw new Error(`global-illumination-stage: 튐 ${p.bounce} 가 축 ${chart.bounces} 를 넘는다`);
        if (p.floorMean > chart.light) throw new Error(`global-illumination-stage: 바닥 평균 ${p.floorMean} 가 축을 넘는다`);
        const last = points[points.length - 1];
        if (last === undefined || last[0] !== p.bounce - 1) throw new Error(`global-illumination-stage: 튐 ${p.bounce} 앞의 점이 없다`);
        runHadBounce = true;
        points.push([p.bounce, p.floorMean]);
        dotsG.appendChild(el('circle', { cx: px(p.bounce), cy: py(p.floorMean), r: 3, fill: pal.primary }));
        endText.setAttribute('x', String(px(p.bounce) + 9));
        endText.setAttribute('y', String(py(p.floorMean) + 4));
        endText.textContent = fmt(p.floorMean, 3);
        paintStrips(p.light);
        const next = buildBarTargets(p.light);
        for (const [id, v] of next) {
          for (const x of v) if (x > chart.light) throw new Error(`global-illumination-stage: ${id} 의 빛 ${x} 가 막대 축을 넘는다`);
        }
        probeText.textContent = t('probe.bleed', 'floor 1 · R − B {bleed}', { bleed: fmt(p.bleed, 3) });
        caption.textContent = t('caption.bounce', 'Bounce {k} · added {added} · reflected {acc} · floor mean {floor} · floor 1 R − B {bleed}', {
          k: p.bounce,
          added: fmt(p.added, 3),
          acc: fmt(p.accumulated, 3),
          floor: fmt(p.floorMean, 3),
          bleed: fmt(p.bleed, 3),
        });
        startTween(next, motionMs);
      },

      converged(p) {
        if (chart === null || caption2 === null || stopG === null) throw new Error('global-illumination-stage: init 전에 멈춤이 왔다');
        const last = points[points.length - 1];
        if (last === undefined || last[0] !== p.bounce) throw new Error(`global-illumination-stage: 멈춘 튐 ${p.bounce} 의 점이 무대에 없다`);
        while (stopG.firstChild) stopG.removeChild(stopG.firstChild);
        stopG.appendChild(el('line', {
          x1: px(p.bounce), y1: PLOT.bottom, x2: px(p.bounce), y2: py(last[1]) + 5,
          stroke: pal.text, 'stroke-dasharray': '2 3', 'stroke-width': 1,
        }));
        stopG.appendChild(el('circle', { cx: px(p.bounce), cy: py(last[1]), r: 6, fill: 'none', stroke: pal.text, 'stroke-width': 1.5 }));
        stopG.appendChild(text(px(p.bounce), py(last[1]) - 12, t('mark.stop', 'stop'), { 'text-anchor': 'middle' }));
        caption2.textContent = t('caption.converged', 'Stop: bounce {k} added {added} ≤ {tol} × {acc} = {limit}', {
          k: p.bounce,
          added: fmt(p.added, 3),
          tol: String(p.tolerance),
          acc: fmt(p.accumulated, 3),
          limit: fmt(p.limit, 3),
        });
      },

      destroy() {
        cancelFrame();
        root.remove();
      },
    };
    return instance;
  },
};
