/**
 * layers-compose 무대 — 입력 평면은 그대로 두고, 둘째 층의 합에 단위가 하나씩 들 때마다
 * 켜짐과 꺼짐을 가르는 경계가 움직이며 새 모서리를 얻는다.
 *
 * 운동: 이번 단위의 무게를 0 에서 제 값까지 키운 모습들(알고리즘이 셈해 실었다)을 한 시계로 차례로 세운다 —
 * 경계가 밀려 들어오고 꺾임선에서 꺾인다. 같은 시계로 그 단위의 항이 대기 줄에서 합의 줄로 미끄러져 든다.
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
import type { Pt, Snapshot } from './algorithm.js';
import type { LayersComposeScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 800;

const PLANE_LEFT = 44;
const PLANE_TOP = 28;
const PLANE_BOTTOM_ROOM = 74;
const PANEL_GAP = 36;
const PANEL_RIGHT_PAD = 12;
/** 대기 중인 항이 합의 줄에서 비켜 선 거리 */
const PENDING_SHIFT = 30;

const SUBS = '₀₁₂₃₄₅₆₇₈₉';

function sub(n: number): string {
  return String(n)
    .split('')
    .map((ch) => {
      const s = SUBS[Number(ch)];
      if (s === undefined) throw new Error(`layers-compose 무대: 아래 첨자로 못 쓰는 글자 ${ch}`);
      return s;
    })
    .join('');
}

function num(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (/^-0\.?0*$/.test(s)) throw new Error(`layers-compose 무대: ${v} 가 −0 으로 찍힌다`);
  return s.replace('-', '−');
}

/** 계수 글자 — 끝의 0 을 덜어 낸다 (1 · 0.5 · −1) */
function coef(v: number): string {
  return num(v, 2).replace(/\.?0+$/, '');
}

function linearText(a: number, b: number, d: number): string {
  const parts: string[] = [];
  const push = (k: number, sym: string): void => {
    if (k === 0) return;
    const mag = Math.abs(k);
    const body = sym === '' ? coef(mag) : mag === 1 ? sym : `${coef(mag)}·${sym}`;
    if (parts.length === 0) parts.push(k < 0 ? `−${body}` : body);
    else parts.push(k < 0 ? `− ${body}` : `+ ${body}`);
  };
  push(a, 'x₁');
  push(b, 'x₂');
  push(d, '');
  return parts.join(' ');
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

export const layersComposeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<boolean> {
      return new Promise((resolve) => {
        const done = (ok: boolean): void => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => done(false);
        const id = setTimeout(() => done(true), ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    /** 한 모습을 통째로 세운다. slide = 이번에 드는 항이 대기 줄에서 합의 줄로 온 몫 (0..1) */
    function draw(scene: LayersComposeScene, snap: Snapshot | null, moving: { unit: number; slide: number } | null): void {
      svg.textContent = '';
      const W = PIECE_CANVAS_W;
      const side = Math.min(H - PLANE_TOP - PLANE_BOTTOM_ROOM, W * 0.55);
      const scale = side / (2 * scene.box);
      const px = (p: Pt): [number, number] => [
        r2(PLANE_LEFT + (p[0] + scene.box) * scale),
        r2(PLANE_TOP + (scene.box - p[1]) * scale),
      ];
      const path = (pts: Pt[], close: boolean): string =>
        pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p).join(' ')}`).join(' ') + (close ? ' Z' : '');
      const unitColors = categorical(scene.units.length);
      const colorOf = (j: number): string => {
        const c = unitColors[j];
        if (c === undefined) throw new Error(`layers-compose 무대: 단위 ${j + 1} 의 색이 없다`);
        return c;
      };
      // 이번 단위가 드는 중이면 그 항과 꺾임선도 이미 보인다
      const shown = moving ? moving.unit : scene.added;

      // ── 평면 ──
      const plane = el('g', {}, svg);
      el('rect', { x: PLANE_LEFT, y: PLANE_TOP, width: r2(side), height: r2(side), fill: colors.bgSubtle }, plane);
      const lit = el('g', {}, plane);
      if (snap) {
        for (const poly of snap.on) {
          el('path', { d: path(poly, true), fill: colors.accent, 'fill-opacity': 0.55, stroke: colors.accent, 'stroke-width': 0.5 }, lit);
        }
      }
      const grid = el('g', { stroke: colors.border, 'stroke-width': 1 }, plane);
      const ticks = el('g', { fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, plane);
      const lo = Math.ceil(-scene.box);
      const hi = Math.floor(scene.box);
      for (let v = lo; v <= hi; v += 1) {
        const [gx] = px([v, 0]);
        const [, gy] = px([0, v]);
        el('line', { x1: gx, y1: PLANE_TOP, x2: gx, y2: r2(PLANE_TOP + side), 'stroke-opacity': v === 0 ? 0.9 : 0.35 }, grid);
        el('line', { x1: PLANE_LEFT, y1: gy, x2: r2(PLANE_LEFT + side), y2: gy, 'stroke-opacity': v === 0 ? 0.9 : 0.35 }, grid);
        el('text', { x: gx, y: r2(PLANE_TOP + side + 14), 'text-anchor': 'middle' }, ticks, num(v, 0));
        el('text', { x: PLANE_LEFT - 6, y: r2(gy + 4), 'text-anchor': 'end' }, ticks, num(v, 0));
      }
      el('rect', { x: PLANE_LEFT, y: PLANE_TOP, width: r2(side), height: r2(side), fill: 'none', stroke: colors.border, 'stroke-width': 1 }, plane);
      el('text', { x: r2(PLANE_LEFT + side), y: r2(PLANE_TOP + side + 30), 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, plane, t('label.axisX1', 'x₁'));
      el('text', { x: PLANE_LEFT - 6, y: PLANE_TOP - 12, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, plane, t('label.axisX2', 'x₂'));

      // ── 꺾임선 (합에 든 단위만) ──
      if (scene.hinges) {
        const hingeLayer = el('g', { fill: 'none', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, plane);
        for (let j = 0; j < shown; j += 1) {
          const seg = scene.hinges[j];
          if (seg === undefined) throw new Error(`layers-compose 무대: 단위 ${j + 1} 의 꺾임선이 없다`);
          el('path', { d: path(seg, false), stroke: colorOf(j) }, hingeLayer);
        }
      }

      // ── 경계 · 모서리 · 짚는 자리 ──
      if (snap) {
        const edge = el('g', { fill: 'none', stroke: colors.text, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, plane);
        for (const line of snap.lines) el('path', { d: path(line, false) }, edge);
        const marks = el('g', {}, plane);
        for (const cpt of snap.corners) {
          const [cx, cy] = px(cpt);
          el('circle', { cx, cy, r: 5, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 }, marks);
        }
        const probeLayer = el('g', { 'font-family': fonts.mono, 'font-size': fontSizes.xs }, plane);
        scene.probes.forEach((p, i) => {
          const o = snap.probeO[i];
          if (o === undefined) throw new Error(`layers-compose 무대: 짚는 자리 ${i + 1} 의 o 가 없다`);
          const [cx, cy] = px(p);
          const on = o > 0;
          el('rect', {
            x: r2(cx - 3.5), y: r2(cy - 3.5), width: 7, height: 7,
            fill: on ? colors.text : colors.bg, stroke: colors.text, 'stroke-width': 1.5,
          }, probeLayer);
          el('text', { x: r2(cx + 7), y: r2(cy - 6), fill: colors.text }, probeLayer, num(o, 2));
        });
      }

      // ── 둘째 층의 합 ──
      const panelX = r2(PLANE_LEFT + side + PANEL_GAP);
      const panelW = W - PANEL_RIGHT_PAD - panelX;
      const panel = el('g', {}, svg);
      el('text', { x: panelX, y: PLANE_TOP + 12, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, panel, t('label.layer2', 'Second-layer sum'));
      el('text', { x: panelX, y: PLANE_TOP + 40, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.lg }, panel, `o = ${coef(scene.c)}`);
      const rowsTop = PLANE_TOP + 68;
      const rowGap = Math.min(46, (H - PLANE_BOTTOM_ROOM - 60 - rowsTop) / scene.units.length);
      scene.units.forEach((u, j) => {
        const n = j + 1;
        const inSum = j < scene.added || (moving !== null && moving.unit === n);
        const share = moving !== null && moving.unit === n ? ease(moving.slide) : inSum ? 1 : 0;
        const x = r2(panelX + PENDING_SHIFT * (1 - share));
        const y = r2(rowsTop + j * rowGap);
        const row = el('g', { opacity: r2(0.3 + 0.7 * share) }, panel);
        const h = `h${sub(n)}`;
        const weight = u.v === 1 ? h : `${coef(Math.abs(u.v))}·${h}`;
        el('text', { x, y, fill: colorOf(j), 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 600 }, row, `${u.v < 0 ? '−' : '+'} ${weight}`);
        el('line', { x1: x, y1: r2(y + 12), x2: r2(x + 16), y2: r2(y + 12), stroke: colorOf(j), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, row);
        el('text', { x: r2(x + 22), y: r2(y + 16), fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, row, `${h} = max(0, ${linearText(u.a, u.b, u.d)})`);
      });

      // 범례 — 켜진 쪽 · 모서리
      const legendY = r2(rowsTop + scene.units.length * rowGap + 4);
      el('rect', { x: panelX, y: legendY - 10, width: 14, height: 12, fill: colors.accent, 'fill-opacity': 0.55 }, panel);
      el('text', { x: panelX + 20, y: legendY, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm }, panel, t('label.on', 'On: o > 0'));
      el('circle', { cx: panelX + 7, cy: legendY + 17, r: 5, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 }, panel);
      el('text', { x: panelX + 20, y: legendY + 21, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm }, panel, t('label.corner', 'Corner'));

      // 모서리 수 — 멈춘 화면의 계기
      if (snap && snap.lines.length > 0) {
        const big = Math.min(parseFloat(fontSizes.xl), panelW / 6);
        el('text', { x: panelX, y: r2(legendY + 54), fill: colors.text, 'font-family': fonts.body, 'font-size': `${r2(big)}px`, 'font-weight': 700 }, panel, t('label.corners', 'Corners: {n}', { n: snap.corners.length }));
      }

      // ── 캡션 ──
      const step = scene.step;
      if (step) {
        const caption =
          step.kind === 'start'
            ? t('caption.start', 'Nothing in the sum yet: o = {c} across the whole plane.', { c: num(scene.c, 2) })
            : t('caption.add', 'Added to the sum: {unit}.', { unit: `h${sub(step.unit)}` });
        el('text', { x: PLANE_LEFT, y: H - 16, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, svg, caption);
      }
    }

    function drawStatic(scene: LayersComposeScene): void {
      draw(scene, scene.shape, null);
    }

    return {
      async render(next: LayersComposeScene, _prev: LayersComposeScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step === null || step.kind !== 'add') {
          drawStatic(next);
          return;
        }
        const frames = step.frames;
        const last = frames.length - 1;
        const first = frames[0];
        if (first === undefined) throw new Error('layers-compose 무대: 운동할 모습이 없다');
        draw(next, first, { unit: step.unit, slide: 0 });
        for (let i = 1; i <= last; i += 1) {
          const ok = await wait(MOTION_MS / last);
          if (!ok || mine !== gen || destroyed) return;
          const f = frames[i];
          if (f === undefined) throw new Error(`layers-compose 무대: 모습 ${i} 가 없다`);
          draw(next, f, { unit: step.unit, slide: i / last });
        }
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
