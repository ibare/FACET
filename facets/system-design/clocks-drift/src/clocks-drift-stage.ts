/**
 * clocks-drift 무대.
 *
 * 가로는 참 시각, 세로는 어긋남(ms). 가운데 가로줄이 시간 서버의 참 시각이다.
 * 한 시간마다 두 시계의 끝이 서로 반대쪽으로 **벌어지고**, 그 사이를 잇는 괄호가 늘어난다.
 * 맞추기에서 끝이 가운데 줄 가까이로 뛰어 내려오되 닿지 않고, 같은 기울기로 다시 벌어져 톱니가 된다.
 * 가운데 줄 가까이 남은 몫은 확대 칸이 보인다.
 */
import {
  type CanvasView,
  type ViewMountParams,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { ClocksDriftScene, DriftPoint, DriftTrail } from './scene.js';

const H = 340;
const MOTION_MS = 700;
const FRAME_MS = 16;
const SVG = 'http://www.w3.org/2000/svg';

const PAD_L = 58;
const PAD_R = 132;
const PLOT_TOP = 94;
const PLOT_BOTTOM = H - 40;

function signed(ms: number): string {
  const r = Math.round(ms * 10) / 10;
  if (r === 0) return '+0.0';
  return r > 0 ? `+${r.toFixed(1)}` : `−${(-r).toFixed(1)}`;
}

function plain(ms: number): string {
  const r = Math.round(ms * 10) / 10;
  if (r === 0) return '0.0';
  return r > 0 ? r.toFixed(1) : `−${(-r).toFixed(1)}`;
}

function tickText(ms: number): string {
  if (ms === 0) return '0';
  return ms > 0 ? `+${ms}` : `\u2212${-ms}`;
}

function ppmText(ppm: number): string {
  if (ppm === 0) return '0';
  return ppm > 0 ? `+${ppm}` : `−${-ppm}`;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 세로 눈금 간격 — 축 범위(알고리즘이 준 값)를 넷 안팎으로 나누는 둥근 수 */
function tickStep(range: number): number {
  const raw = range / 2.5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

export const clocksDriftStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const clockColors = categorical(2);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function clockName(id: string): string {
      switch (id) {
        case 'A':
          return t('label.A', 'Clock A');
        case 'B':
          return t('label.B', 'Clock B');
        default:
          throw new Error(`clocks-drift-stage: 표시 이름이 없는 시계 ${id}`);
      }
    }

    function serverName(id: string): string {
      if (id !== 'S') throw new Error(`clocks-drift-stage: 표시 이름이 없는 서버 ${id}`);
      return t('label.S', 'Time server S');
    }

    function colorOf(i: number): string {
      const c = clockColors[i];
      if (c === undefined) throw new Error(`clocks-drift-stage: 시계 ${i} 의 색이 없다`);
      return c;
    }

    /** 움직이는 시계의 끝 — 자취의 끝 둘 사이를 p 만큼 */
    function tipOf(trail: DriftTrail, moving: boolean, p: number): DriftPoint {
      const last = trail.points[trail.points.length - 1];
      if (last === undefined) throw new Error(`clocks-drift-stage: ${trail.clock} 의 자취가 비었다`);
      if (!moving || p >= 1) return last;
      const from = trail.points[trail.points.length - 2];
      if (from === undefined) throw new Error(`clocks-drift-stage: ${trail.clock} 의 앞 점이 없다`);
      return { hour: lerp(from.hour, last.hour, p), ms: lerp(from.ms, last.ms, p) };
    }

    function draw(scene: ClocksDriftScene, p: number): void {
      svg.textContent = '';
      if (scene.yMaxMs === null || scene.nowHour === null || scene.gapMs === null || scene.step === null) return;
      const step = scene.step;
      const W = PIECE_CANVAS_W;
      const plotR = W - PAD_R;
      const range = scene.yMaxMs * 1.12;
      const midY = (PLOT_TOP + PLOT_BOTTOM) / 2;
      const half = (PLOT_BOTTOM - PLOT_TOP) / 2;
      const X = (hour: number): number => round2(PAD_L + (hour / scene.endHour) * (plotR - PAD_L));
      const Y = (ms: number): number => round2(midY - (ms / range) * half);

      // 캡션 — 지금 일어나는 일
      if (step.kind === 'sync') {
        el(svg, 'text', { x: 16, y: 22, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 },
          t('caption.sync', 'Sync {name} ↔ {server}: correction θ {theta} ms', {
            name: clockName(step.clock), server: serverName(step.server), theta: signed(step.thetaMs),
          }));
        el(svg, 'text', { x: 16, y: 42, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm },
          t('caption.syncOffset', 'Offset of {name}: {before} → {after} ms', {
            name: clockName(step.clock), before: signed(step.beforeMs), after: signed(step.afterMs),
          }));
      } else {
        el(svg, 'text', { x: 16, y: 22, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 },
          t('caption.hour', 'True time: {h} h', { h: scene.nowHour }));
        el(svg, 'text', { x: 16, y: 42, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm },
          t('caption.gap', 'Gap between the clocks: {g} ms', { g: plain(scene.gapMs) }));
      }

      // 범례 — 시계 이름과 빠르기
      let lx = 16;
      scene.trails.forEach((trail, i) => {
        el(svg, 'circle', { cx: lx + 5, cy: 62, r: 5, fill: colorOf(i) });
        const name = clockName(trail.clock);
        const rate = t('label.rate', 'Rate: {ppm} ppm', { ppm: ppmText(trail.ppm) });
        el(svg, 'text', { x: lx + 15, y: 66, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, name);
        el(svg, 'text', { x: round2(lx + 15 + name.length * smPx * 0.62 + 8), y: 66, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, rate);
        lx = round2(lx + 15 + (name.length + rate.length) * smPx * 0.62 + 34);
      });
      el(svg, 'line', { x1: lx, y1: 62, x2: lx + 14, y2: 62, stroke: colors.text, 'stroke-width': 2 });
      el(svg, 'text', { x: lx + 20, y: 66, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, serverName(scene.server));

      // 세로 눈금
      const tick = tickStep(range);
      for (let v = -Math.floor(range / tick) * tick; v <= range; v += tick) {
        const y = Y(v);
        el(svg, 'line', { x1: PAD_L, y1: y, x2: plotR, y2: y, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': v === 0 ? 'none' : '2 4' });
        el(svg, 'text', { x: PAD_L - 6, y: round2(y + xsPx * 0.35), fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'end' }, tickText(round2(v)));
      }
      el(svg, 'text', { x: 8, y: PLOT_TOP - 6, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, t('axis.offset', 'Offset (ms)'));

      // 가로 눈금 — 참 시각
      for (let h = 0; h <= scene.endHour; h += 1) {
        const x = X(h);
        el(svg, 'line', { x1: x, y1: PLOT_BOTTOM, x2: x, y2: PLOT_BOTTOM + 4, stroke: colors.textMuted, 'stroke-width': 1 });
        el(svg, 'text', { x, y: PLOT_BOTTOM + 18, fill: h <= scene.nowHour ? colors.text : colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'text-anchor': 'middle' }, t('axis.hour', '{h} h', { h }));
      }
      el(svg, 'text', { x: plotR, y: PLOT_BOTTOM + 34, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'text-anchor': 'end' }, t('axis.true', 'True time'));

      // 참 시각 — 시간 서버
      el(svg, 'line', { x1: PAD_L, y1: midY, x2: plotR, y2: midY, stroke: colors.text, 'stroke-width': 2 });

      // 자취 — 움직이는 시계는 끝 점이 p 만큼만 와 있다
      const movingIdx = (i: number): boolean =>
        step.kind === 'hour' || (step.kind === 'sync' && scene.trails[i]?.clock === step.clock);
      const tips = scene.trails.map((trail, i) => tipOf(trail, movingIdx(i), p));
      scene.trails.forEach((trail, i) => {
        const tip = tips[i] as DriftPoint;
        const pts = trail.points.slice(0, -1).concat([tip]);
        if (pts.length > 1) {
          el(svg, 'polyline', {
            points: pts.map((q) => `${X(q.hour)},${Y(q.ms)}`).join(' '),
            fill: 'none', stroke: colorOf(i), 'stroke-width': 2.5, 'stroke-linejoin': 'round',
          });
        }
      });

      // 맞추기 걸음 — θ 만큼 뛰는 화살표
      if (step.kind === 'sync') {
        const i = scene.trails.findIndex((tr) => tr.clock === step.clock);
        const tip = tips[i] as DriftPoint;
        const x = X(tip.hour) - 16;
        const y0 = Y(step.beforeMs);
        const y1 = Y(lerp(step.beforeMs, step.afterMs, p));
        const dir = y1 > y0 ? 1 : -1;
        el(svg, 'line', { x1: x, y1: y0, x2: x, y2: y1, stroke: colors.primary, 'stroke-width': 2 });
        if (Math.abs(y1 - y0) > 8) {
          el(svg, 'path', { d: `M${x - 5},${round2(y1 - dir * 8)} L${x},${y1} L${x + 5},${round2(y1 - dir * 8)}`, fill: 'none', stroke: colors.primary, 'stroke-width': 2 });
        }
        // 뛰기 시작한 끝의 바깥쪽 — 선과 겹치지 않는 자리
        el(svg, 'text', { x: x + 4, y: round2(dir > 0 ? y0 - 8 : y0 + smPx + 6), fill: colors.primary, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'end' },
          t('label.theta', 'θ {theta} ms', { theta: signed(step.thetaMs) }));
      }

      // 두 끝 사이 벌어짐 — 괄호
      const [ta, tb] = tips;
      if (ta === undefined || tb === undefined) throw new Error('clocks-drift-stage: 시계가 둘이 아니다');
      const bx = Math.max(X(ta.hour), X(tb.hour)) + 12;
      const ya = Y(ta.ms);
      const yb = Y(tb.ms);
      el(svg, 'line', { x1: bx, y1: ya, x2: bx, y2: yb, stroke: colors.accent, 'stroke-width': 3 });
      for (const y of [ya, yb]) el(svg, 'line', { x1: bx - 4, y1: y, x2: bx + 4, y2: y, stroke: colors.accent, 'stroke-width': 3 });
      const gapLabel = t('label.gap', 'Gap {g} ms', { g: plain(scene.gapMs) });
      const gy = round2((ya + yb) / 2 + smPx * 0.35);
      el(svg, 'rect', { x: bx + 7, y: round2(gy - smPx), width: round2(gapLabel.length * smPx * 0.6 + 6), height: round2(smPx + 5), fill: colors.bg });
      el(svg, 'text', { x: bx + 10, y: gy, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, gapLabel);

      // 끝 점과 값
      // 괄호 글자와 겹치지 않게 위 끝 값은 그보다 위로, 아래 끝 값은 그보다 아래로 민다
      const upper = ta.ms >= tb.ms ? 0 : 1;
      scene.trails.forEach((trail, i) => {
        const tip = tips[i] as DriftPoint;
        const x = X(tip.hour);
        const y = Y(tip.ms);
        el(svg, 'circle', { cx: x, cy: y, r: 5, fill: colorOf(i), stroke: colors.bg, 'stroke-width': 1.5 });
        const ly = i === upper ? Math.min(y - 10, gy - smPx - 8) : Math.max(y + 10 + smPx, gy + smPx + 8);
        el(svg, 'text', { x: x + 7, y: round2(ly), fill: colorOf(i), 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600 },
          t('label.offset', '{name}: {ms} ms', { name: clockName(trail.clock), ms: signed(tip.ms) }));
      });

      // 확대 칸 — 맞춘 뒤 참 시각 가까이 남은 몫
      if (scene.residuals.length > 0) {
        if (scene.residMaxMs === null) throw new Error('clocks-drift-stage: 남은 어긋남이 있는데 확대 범위가 없다');
        const zoom = Math.max(1, Math.ceil((scene.residMaxMs * 1.6) / 5) * 5);
        const bx0 = PAD_L + 10;
        const bw = 168;
        const bh = 56;
        const by0 = PLOT_BOTTOM - bh - 4;
        el(svg, 'rect', { x: bx0, y: by0, width: bw, height: bh, fill: colors.bgSubtle, stroke: colors.border, rx: 4 });
        el(svg, 'text', { x: bx0 + 8, y: by0 + 14, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
          t('label.zoom', 'Left after sync · scale ±{r} ms', { r: zoom }));
        const zMid = by0 + 36;
        const zHalf = 16;
        el(svg, 'line', { x1: bx0 + 8, y1: zMid, x2: bx0 + 44, y2: zMid, stroke: colors.text, 'stroke-width': 1.5 });
        scene.residuals.forEach((r, k) => {
          const i = scene.trails.findIndex((tr) => tr.clock === r.clock);
          if (i < 0) throw new Error(`clocks-drift-stage: 바탕에 없는 시계 ${r.clock}`);
          const grow = step.kind === 'sync' && k === scene.residuals.length - 1 ? p : 1;
          const cx = bx0 + 18 + k * 16;
          const h = round2((r.ms / zoom) * zHalf * grow);
          el(svg, 'rect', { x: cx - 5, y: round2(Math.min(zMid, zMid - h)), width: 10, height: Math.abs(h), fill: colorOf(i) });
          el(svg, 'text', { x: bx0 + 52, y: round2(by0 + 32 + k * (xsPx + 5)), fill: colorOf(i), 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 },
            t('label.offset', '{name}: {ms} ms', { name: clockName(r.clock), ms: signed(r.ms) }));
        });
      }
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        let pending: ReturnType<typeof setTimeout> | null = null;
        const wake = (): void => {
          waiters.delete(wake);
          if (pending !== null) {
            clearTimeout(pending);
            timers.delete(pending);
          }
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (pending !== null) timers.delete(pending);
          pending = null;
          if (destroyed || mine !== gen) return wake();
          const raw = Math.min(1, (Date.now() - start) / MOTION_MS);
          frame(ease(raw));
          if (raw >= 1) return wake();
          pending = setTimeout(tick, FRAME_MS);
          timers.add(pending);
        };
        tick();
      });
    }

    return {
      async render(next: ClocksDriftScene, prev: ClocksDriftScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moves = next.step !== null && next.step.kind !== 'start';
        if (!opts.animate || prev === null || !moves) {
          draw(next, 1);
          return;
        }
        await tween(mine, (p) => draw(next, p));
        if (mine === gen && !destroyed) draw(next, 1);
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
