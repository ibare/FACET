/**
 * power-iteration-drift 무대 — 벡터 하나가 곱해져 늘어나고 돌았다가 길이 1 로 되돌아온다.
 *
 * 왼쪽: 첫 사분면. 길이 1 의 호(v 가 사는 자리)와 길이 λ₁ 의 호(늘어난 배수가 다가갈 자리),
 *       큰 고유 방향의 선, 그 선과 v 사이의 틈(부채꼴), 지나온 방향의 눈금.
 * 오른쪽: 틈을 로그 눈금으로 — 걸음마다 같은 비로 내려앉는 점.
 *
 * 운동 (한 시계, 500ms): 앞 0.6 은 v 가 A·v 로 늘며 돈다 (곱하는 도중의 벡터),
 * 뒤 0.4 는 A·v 가 길이 1 로 줄어든다. 틈 그래프의 점은 화살의 방향을 따라 내려간다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import {
  angleDeg,
  gapDeg,
  lengthOf,
  type Basis,
  type Sample,
  type Vec2,
} from './algorithm.js';
import type { PowerIterationDriftScene } from './scene.js';

const H = 390;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 500;
/** 한 시계 가운데 곱하는 몫 — 나머지는 길이를 1 로 되돌리는 몫 */
const TURN_SHARE = 0.6;

const CAPTION_TOP = 22;
const ORIGIN_X = 44;
const ORIGIN_Y = H - 30;
const PLANE_TOP = 88;
const PANEL_L = Math.round(W * 0.6);
const CHART_L = PANEL_L + 38;
const CHART_R = W - 20;
const CHART_TOP = 212;
const CHART_BOTTOM = ORIGIN_Y - 6;

type Pose = {
  /** 화살 끝 (단위 좌표) */
  tip: Vec2;
  /** 곱한 직후의 A·v 를 흐리게 남길지 */
  ghost: Vec2 | null;
  /** 틈 그래프에서 점의 걸음 자리 (분수 가능) */
  chartK: number;
  /** 화살의 각 · 틈 (도) — 멈춘 화면은 표본의 값, 운동 도중에만 화살에서 다시 잰다 */
  angle: number;
  gap: number;
  /** 읽는 칸에 보일 표본 */
  readout: Sample;
};

function fmt(x: number, digits: number): string {
  const s = x.toFixed(digits);
  const clean = /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
  return clean.replace('-', '−');
}

function fmtValue(x: number): string {
  return Math.abs(x - Math.round(x)) < 1e-9 ? fmt(Math.round(x), 0) : fmt(x, 3);
}

function fmtPower(p: number): string {
  return p >= 1 ? fmt(p, 0) : fmt(p, Math.round(-Math.log10(p)));
}

function r2(x: number): string {
  return (Math.round(x * 100) / 100).toString();
}

function wideChar(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) >= 0x2e80;
}

/** 글자 폭 어림 — 한중일 글자는 한 칸, 나머지는 반 칸 남짓 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += wideChar(ch) ? px : px * 0.56;
  return w;
}

function wrap(s: string, px: number, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  const tokens = s.split(/(\s+)/).filter((x) => x.length > 0);
  const pieces: string[] = [];
  for (const tok of tokens) {
    if (textWidth(tok, px) <= maxW) pieces.push(tok);
    else for (const ch of tok) pieces.push(ch);
  }
  for (const piece of pieces) {
    const next = line + piece;
    if (textWidth(next.trimEnd(), px) > maxW && line.trim().length > 0) {
      lines.push(line.trimEnd());
      line = piece.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim().length > 0) lines.push(line.trimEnd());
  return lines;
}

export const powerIterationDriftStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);

    let gen = 0;
    let destroyed = false;
    let dynamicLayer: SVGGElement | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      parent.appendChild(el);
      return el;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const el = node(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      el.textContent = text;
      return el;
    }

    /** 단위 좌표 → 화면 좌표 */
    function geometry(basis: Basis) {
      const unit = (ORIGIN_Y - PLANE_TOP) / (basis.lambda1 * 1.06);
      const radius = basis.lambda1 * unit;
      const at = (v: Vec2): [number, number] => [ORIGIN_X + v[0] * unit, ORIGIN_Y - v[1] * unit];
      const polar = (deg: number, r: number): [number, number] => {
        const rad = (deg * Math.PI) / 180;
        return [ORIGIN_X + Math.cos(rad) * r, ORIGIN_Y - Math.sin(rad) * r];
      };
      const logTop = Math.log10(basis.gapTop);
      const logBottom = Math.log10(basis.gapBottom);
      if (!(logTop > logBottom)) {
        throw new Error('power-iteration-drift-stage: 틈 범위의 위아래가 같다');
      }
      const chartY = (gap: number): number => {
        if (!(gap > 0)) throw new Error(`power-iteration-drift-stage: 틈이 0 이하다 (${String(gap)})`);
        return CHART_TOP + 8 + ((logTop - Math.log10(gap)) / (logTop - logBottom)) * (CHART_BOTTOM - CHART_TOP - 22);
      };
      const chartX = (k: number): number => CHART_L + (k / basis.count) * (CHART_R - CHART_L);
      return { unit, radius, at, polar, chartY, chartX };
    }

    type Geometry = ReturnType<typeof geometry>;

    function arcPath(g: Geometry, r: number, from: number, to: number): string {
      const [x0, y0] = g.polar(from, r);
      const [x1, y1] = g.polar(to, r);
      const sweep = to > from ? 0 : 1;
      const large = Math.abs(to - from) > 180 ? 1 : 0;
      return `M ${r2(x0)} ${r2(y0)} A ${r2(r)} ${r2(r)} 0 ${large} ${sweep} ${r2(x1)} ${r2(y1)}`;
    }

    function arrow(parent: Element, g: Geometry, tip: Vec2, color: string, width: number, dashed: boolean): void {
      const [x0, y0] = g.at([0, 0]);
      const [x1, y1] = g.at(tip);
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (!(len > 0)) throw new Error('power-iteration-drift-stage: 길이 0 인 화살');
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const head = 9;
      const bx = x1 - ux * head;
      const by = y1 - uy * head;
      node(
        'line',
        {
          x1: r2(x0),
          y1: r2(y0),
          x2: r2(bx),
          y2: r2(by),
          stroke: color,
          'stroke-width': width,
          ...(dashed ? { 'stroke-dasharray': '5 4' } : {}),
        },
        parent,
      );
      const px = -uy * head * 0.5;
      const py = ux * head * 0.5;
      node(
        'polygon',
        {
          points: `${r2(x1)},${r2(y1)} ${r2(bx + px)},${r2(by + py)} ${r2(bx - px)},${r2(by - py)}`,
          fill: color,
          ...(dashed ? { 'fill-opacity': '0.55' } : {}),
        },
        parent,
      );
    }

    function inQuadrant(v: Vec2, what: string): void {
      if (v[0] < -1e-9 || v[1] < -1e-9) {
        throw new Error(`power-iteration-drift-stage: 이 무대는 첫 사분면만 그린다 — ${what} (${String(v[0])}, ${String(v[1])})`);
      }
    }

    function currentSample(scene: PowerIterationDriftScene, basis: Basis): Sample {
      if (scene.step.kind === 'start') return basis.start;
      const last = scene.trail[scene.trail.length - 1];
      if (last === undefined || last.k !== scene.step.k) {
        throw new Error('power-iteration-drift-stage: 이번 걸음의 표본이 자취 끝에 없다');
      }
      return last;
    }

    function samplesOf(scene: PowerIterationDriftScene, basis: Basis): Sample[] {
      return [basis.start, ...scene.trail];
    }

    function drawCaption(parent: Element, scene: PowerIterationDriftScene, basis: Basis, cur: Sample): void {
      let text: string;
      if (scene.step.kind === 'start') {
        text = t('caption.start', 'Start: v at {angle}°, λ₁ direction at {target}°, gap {gap}°.', {
          angle: fmt(cur.angle, 2),
          target: fmt(basis.targetAngle, 1),
          gap: fmt(cur.gap, 2),
        });
      } else {
        if (cur.stretch === null) throw new Error('power-iteration-drift-stage: 곱한 걸음에 배수가 없다');
        if (cur.k === basis.count) {
          if (cur.ratio === null) throw new Error('power-iteration-drift-stage: 마지막 걸음에 틈 비가 없다');
          text = t(
            'caption.final',
            'Multiplication {k}: |Av| = {stretch} (λ₁ = {l1}) · gap {gap}° · gap ratio {ratio} (λ₂ / λ₁ = {q}).',
            {
              k: cur.k,
              stretch: fmt(cur.stretch, 3),
              l1: fmtValue(basis.lambda1),
              gap: fmt(cur.gap, 2),
              ratio: fmt(cur.ratio, 3),
              q: fmt(basis.lambda2 / basis.lambda1, 3),
            },
          );
        } else {
          text = t('caption.multiply', 'Multiplication {k}: |Av| = {stretch}, scaled back to length 1 — gap {gap}°.', {
            k: cur.k,
            stretch: fmt(cur.stretch, 3),
            gap: fmt(cur.gap, 2),
          });
        }
      }
      let px = mdPx;
      let lines = wrap(text, px, W - 32);
      if (lines.length > 2) {
        px = smPx;
        lines = wrap(text, px, W - 32);
      }
      if (lines.length > 3) throw new Error('power-iteration-drift-stage: 캡션이 세 줄을 넘는다');
      lines.forEach((line, i) => {
        label(parent, 16, CAPTION_TOP + i * (px + 5), line, { size: `${String(px)}px`, fill: colors.text });
      });
    }

    function drawMatrix(parent: Element, scene: PowerIterationDriftScene, g: Geometry): void {
      const cellW = 20;
      const rowH = smPx + 6;
      const left = ORIGIN_X + g.radius * 0.9;
      const top = PLANE_TOP + 12;
      label(parent, left - 4, top + rowH + 4, t('label.matrix', 'A ='), { anchor: 'end', mono: true });
      const bx0 = left + 2;
      const bx1 = left + 2 + cellW * 2 + 10;
      const by0 = top;
      const by1 = top + rowH * 2 + 6;
      node('path', { d: `M ${r2(bx0 + 5)} ${r2(by0)} H ${r2(bx0)} V ${r2(by1)} H ${r2(bx0 + 5)}`, fill: 'none', stroke: colors.text, 'stroke-width': 1.2 }, parent);
      node('path', { d: `M ${r2(bx1 - 5)} ${r2(by0)} H ${r2(bx1)} V ${r2(by1)} H ${r2(bx1 - 5)}`, fill: 'none', stroke: colors.text, 'stroke-width': 1.2 }, parent);
      scene.matrix.forEach((row, i) => {
        row.forEach((value, j) => {
          label(parent, bx0 + 5 + cellW * j + cellW / 2, top + rowH * (i + 1), fmtValue(value), { anchor: 'middle', mono: true });
        });
      });
    }

    function drawPlane(parent: Element, scene: PowerIterationDriftScene, basis: Basis, g: Geometry, cur: Sample): void {
      const [ox, oy] = g.at([0, 0]);
      const reach = g.radius + 16;
      node('line', { x1: ox - 6, y1: oy, x2: r2(ox + reach), y2: oy, stroke: colors.border, 'stroke-width': 1 }, parent);
      node('line', { x1: ox, y1: oy + 6, x2: ox, y2: r2(oy - reach), stroke: colors.border, 'stroke-width': 1 }, parent);

      // 눈금 1 .. λ₁
      for (let i = 1; i <= Math.floor(basis.lambda1 + 1e-9); i += 1) {
        const x = ox + i * g.unit;
        node('line', { x1: r2(x), y1: oy, x2: r2(x), y2: oy + 4, stroke: colors.border, 'stroke-width': 1 }, parent);
        label(parent, x, oy + 16, fmt(i, 0), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      }

      node('path', { d: arcPath(g, g.unit, 0, 90), fill: 'none', stroke: colors.border, 'stroke-width': 1.2 }, parent);
      node(
        'path',
        { d: arcPath(g, g.radius, 0, 90), fill: 'none', stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 4' },
        parent,
      );

      // 큰 고유 방향
      const [rx, ry] = g.polar(basis.targetAngle, g.radius * 1.06);
      node(
        'line',
        { x1: ox, y1: oy, x2: r2(rx), y2: r2(ry), stroke: colors.text, 'stroke-width': 1.2, 'stroke-dasharray': '6 4' },
        parent,
      );
      label(parent, rx + 6, ry - 2, t('label.lambda1', 'λ₁ = {l}', { l: fmtValue(basis.lambda1) }), { anchor: 'start' });

      // 지나온 방향의 눈금 — 이번 표본은 운동 층이 그린다
      for (const s of samplesOf(scene, basis)) {
        if (s === cur) continue;
        inQuadrant(s.v, `v${String(s.k)}`);
        const [x0, y0] = g.polar(s.angle, g.radius + 3);
        const [x1, y1] = g.polar(s.angle, g.radius + 11);
        node('line', { x1: r2(x0), y1: r2(y0), x2: r2(x1), y2: r2(y1), stroke: colors.textMuted, 'stroke-width': 1.5 }, parent);
      }
    }

    function drawChart(parent: Element, scene: PowerIterationDriftScene, basis: Basis, g: Geometry, cur: Sample): void {
      label(parent, PANEL_L, CHART_TOP - 18, t('label.gapAxis', 'Gap to λ₁ direction (log scale)'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      for (let p = 10 ** Math.floor(Math.log10(basis.gapTop)); p >= basis.gapBottom; p /= 10) {
        const y = g.chartY(p);
        node('line', { x1: CHART_L, y1: r2(y), x2: CHART_R, y2: r2(y), stroke: colors.border, 'stroke-width': 1 }, parent);
        label(parent, CHART_L - 6, y + 4, t('label.degrees', '{d}°', { d: fmtPower(p) }), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
        });
      }
      label(parent, CHART_L - 6, CHART_BOTTOM + 20, t('label.step', 'Step'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });
      for (let k = 0; k <= basis.count; k += 1) {
        label(parent, g.chartX(k), CHART_BOTTOM + 20, fmt(k, 0), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      }
      const past = samplesOf(scene, basis).filter((s) => s !== cur);
      if (past.length > 1) {
        node(
          'polyline',
          {
            points: past.map((s) => `${r2(g.chartX(s.k))},${r2(g.chartY(s.gap))}`).join(' '),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.2,
          },
          parent,
        );
      }
      for (const s of past) {
        node('circle', { cx: r2(g.chartX(s.k)), cy: r2(g.chartY(s.gap)), r: 3, fill: colors.textMuted }, parent);
      }
    }

    /** 움직이는 것 — 틈 부채꼴 · 이번 눈금 · A·v 흔적 · 화살 · 그래프의 이번 점 · 읽는 칸 */
    function drawPose(
      parent: Element,
      scene: PowerIterationDriftScene,
      basis: Basis,
      g: Geometry,
      cur: Sample,
      pose: Pose,
    ): void {
      inQuadrant(pose.tip, 'v');
      const { angle, gap } = pose;
      const [ox, oy] = g.at([0, 0]);

      // 틈 — 큰 고유 방향과 지금 방향 사이의 부채꼴
      if (gap > 1e-9) {
        const [ax, ay] = g.polar(basis.targetAngle, g.radius);
        node(
          'path',
          {
            d: `M ${r2(ox)} ${r2(oy)} L ${r2(ax)} ${r2(ay)} ${arcPath(g, g.radius, basis.targetAngle, angle).replace(/^M [^A]+/, '')} Z`,
            fill: colors.accent,
            'fill-opacity': '0.4',
            stroke: colors.accent,
            'stroke-width': 1.5,
          },
          parent,
        );
      }
      const [tx0, ty0] = g.polar(angle, g.radius + 3);
      const [tx1, ty1] = g.polar(angle, g.radius + 13);
      node('line', { x1: r2(tx0), y1: r2(ty0), x2: r2(tx1), y2: r2(ty1), stroke: colors.itemActive, 'stroke-width': 2.5 }, parent);

      if (pose.ghost !== null) {
        inQuadrant(pose.ghost, 'Av');
        arrow(parent, g, pose.ghost, colors.itemActive, 1.5, true);
        const [gx, gy] = g.at(pose.ghost);
        label(parent, gx + 8, gy + 14, t('label.av', 'Av'), { fill: colors.itemActive, mono: true });
      }
      arrow(parent, g, pose.tip, colors.itemActive, 3, false);
      const [vx, vy] = g.at(pose.tip);
      label(parent, vx - 10, vy - 6, t('label.vec', 'v'), { fill: colors.itemActive, anchor: 'end', weight: 'bold', mono: true });

      // 그래프의 이번 점 — 지난 점에서 이어진다
      const cx = g.chartX(pose.chartK);
      const cy = g.chartY(gap);
      if (cur.k > 0) {
        const before = cur.k === 1 ? basis.start : scene.trail[cur.k - 2];
        if (before === undefined) throw new Error('power-iteration-drift-stage: 앞 표본이 자취에 없다');
        node(
          'line',
          {
            x1: r2(g.chartX(before.k)),
            y1: r2(g.chartY(before.gap)),
            x2: r2(cx),
            y2: r2(cy),
            stroke: colors.itemActive,
            'stroke-width': 1.5,
          },
          parent,
        );
      }
      node('circle', { cx: r2(cx), cy: r2(cy), r: 5, fill: colors.itemActive }, parent);
      const nearRight = cx > CHART_R - 40;
      label(parent, nearRight ? cx - 4 : cx + 9, nearRight ? cy + 16 : cy + 4, t('label.degrees', '{d}°', { d: fmt(gap, 2) }), {
        size: fontSizes.xs,
        fill: colors.text,
        anchor: nearRight ? 'end' : 'start',
      });

      // 읽는 칸
      const rows: string[] = [
        t('label.v', 'v = ({x}, {y})', { x: fmtValue(pose.readout.v[0]), y: fmtValue(pose.readout.v[1]) }),
      ];
      if (pose.readout.stretch !== null) {
        rows.push(t('label.stretch', 'Stretch |Av| = {s}', { s: fmt(pose.readout.stretch, 3) }));
      }
      if (pose.readout.ratio !== null) {
        rows.push(t('label.ratio', 'Gap ratio {r}', { r: fmt(pose.readout.ratio, 3) }));
      }
      rows.push(
        t('label.lambdaRatio', 'λ₂ / λ₁ = {l2} / {l1} = {q}', {
          l2: fmtValue(basis.lambda2),
          l1: fmtValue(basis.lambda1),
          q: fmt(basis.lambda2 / basis.lambda1, 3),
        }),
      );
      rows.forEach((row, i) => {
        label(parent, PANEL_L, PLANE_TOP + 8 + i * (smPx + 10), row, { fill: i === rows.length - 1 ? colors.textMuted : colors.text });
      });
    }

    function finalPose(cur: Sample): Pose {
      return { tip: cur.v, ghost: cur.w, chartK: cur.k, angle: cur.angle, gap: cur.gap, readout: cur };
    }

    function drawStatic(scene: PowerIterationDriftScene): void {
      svg.textContent = '';
      dynamicLayer = null;
      const staticLayer = node('g', {}, svg);
      const basis = scene.basis;
      if (basis === null) return;
      const g = geometry(basis);
      const cur = currentSample(scene, basis);
      drawCaption(staticLayer, scene, basis, cur);
      drawPlane(staticLayer, scene, basis, g, cur);
      drawMatrix(staticLayer, scene, g);
      drawChart(staticLayer, scene, basis, g, cur);
      dynamicLayer = node('g', {}, svg);
      drawPose(dynamicLayer, scene, basis, g, cur, finalPose(cur));
    }

    function tween(mine: number, ms: number, frame: (s: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const started = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            waiters.delete(wake);
            resolve(false);
            return;
          }
          const s = Math.min(1, (Date.now() - started) / ms);
          frame(s);
          if (s >= 1) {
            waiters.delete(wake);
            resolve(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function moveMultiply(mine: number, scene: PowerIterationDriftScene): Promise<void> {
      const basis = scene.basis;
      if (basis === null) throw new Error('power-iteration-drift-stage: 바탕 없이 곱하는 걸음');
      const g = geometry(basis);
      const cur = currentSample(scene, basis);
      const before = cur.k === 1 ? basis.start : scene.trail[cur.k - 2];
      if (before === undefined) throw new Error('power-iteration-drift-stage: 앞 표본이 자취에 없다');
      const w = cur.w;
      if (w === null) throw new Error('power-iteration-drift-stage: 곱한 걸음에 A·v 가 없다');
      const wLen = lengthOf(w);

      await tween(mine, MOVE_MS, (s) => {
        const layer = dynamicLayer;
        if (layer === null) throw new Error('power-iteration-drift-stage: 운동 층이 없다');
        layer.textContent = '';
        let pose: Pose;
        if (s < TURN_SHARE) {
          const u = s / TURN_SHARE;
          // 곱하는 도중의 벡터 — v_{k−1} 에서 실려 온 A·v_{k−1} (cur.w) 로 곧게 간다
          const tip: Vec2 = [before.v[0] + u * (w[0] - before.v[0]), before.v[1] + u * (w[1] - before.v[1])];
          const angle = angleDeg(tip);
          pose = {
            tip,
            angle,
            gap: gapDeg(angle, basis.targetAngle),
            ghost: null,
            chartK: before.k + u,
            readout: before,
          };
        } else {
          const u = (s - TURN_SHARE) / (1 - TURN_SHARE);
          const len = wLen + (1 - wLen) * u;
          pose = { tip: [(w[0] / wLen) * len, (w[1] / wLen) * len], ghost: w, chartK: cur.k, angle: cur.angle, gap: cur.gap, readout: before };
        }
        drawPose(layer, scene, basis, g, cur, pose);
      });
    }

    async function render(
      next: PowerIterationDriftScene,
      _prev: PowerIterationDriftScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate || next.step.kind !== 'multiply') return;
      await moveMultiply(mine, next);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
