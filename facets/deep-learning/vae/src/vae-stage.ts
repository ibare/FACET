/**
 * vae 무대 — 잠재 축 위의 퍼짐 셋(μ ± σ 띠)과 되돌린 칸.
 *
 * 위: 입력마다 한 줄씩 μ ± σ 띠, 그 아래 한 축에 셋을 겹쳐 그리고 겹친 자리를 칠한다.
 * 아래: 입력 칸과 되돌린 칸(z = μ). 되돌린 칸의 진하기가 칸 값이다.
 *
 * 운동 — 걸음마다 띠의 두 끝과 μ 표지가 앞 모습에서 새 모습으로 옮겨 가고(rAF),
 * 되돌린 칸의 진하기가 함께 옮겨 간다. 손잡이를 돌리면 앞 판 끝의 띠가 새 판 걸음 0 의 자리로
 * 옮겨 간 뒤 새 판을 따라 다시 움직인다.
 *
 * 무대는 셈을 다시 하지 않는다 — 띠 끝 · 틈 · 겹침 여부 · 평균은 모두 payload 에서 온다.
 * 기호(μ · σ · z · β)와 입력 이름(A · B · C)은 번역하지 않는 자료다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageBand = { id: string; mu: number; sigma: number; lo: number; hi: number };
export type StageGap = { left: string; right: string; gap: number; overlap: boolean };
export type StageCells = { id: string; x: number[]; q: number[] };
export type StageSnapshot = {
  epoch: number;
  beta: number;
  zRange: [number, number];
  bands: StageBand[];
  order: string[];
  gaps: StageGap[];
  overlapCount: number;
  narrowestGap: number;
  cells: StageCells[];
  recon: number;
  kl: number;
  sigmaMean: number;
  muWidth: number;
};

/** projector 가 부르는 무대의 표면. */
export type VaeStageInstance = ViewInstance & {
  /** 새 모습으로 옮겨 간다 — ms 동안 (0 이면 곧바로). */
  show(snapshot: StageSnapshot, ms: number): void;
  /** 결론(수 글자 · 겹침 표지)을 걷는다. 띠의 자리는 남긴다. */
  clear(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 430;
const PLOT_X0 = 60;
const PLOT_X1 = 540;
const SIDE_X = 560;
const LANE_Y0 = 70;
const LANE_DY = 30;
const LANE_H = 18;
const STRIP_Y = 172;
const STRIP_H = 12;
const AXIS_Y = 192;
const CELL = 28;
const CELL_GAP = 4;
const GROUP_X0 = 60;
const GROUP_DX = 220;
const CELL_LABEL_Y = 234;
const INPUT_Y = 244;
const RECON_Y = 294;
const RECON_VAL_Y = 338;
const READOUT_Y = 374;
const CAPTION_Y = 408;
const MU = 'μ';
const SIGMA = 'σ';
const BETA = 'β';
const KL = 'KL';

/** 표시 규칙 — toFixed, 표시가 0 이 되는 음수는 부호를 떼고, 음수 부호는 U+2212. */
function fmt(v: number, d = 2): string {
  const s = v.toFixed(d);
  const clean = Number(s) === 0 ? s.replace('-', '') : s;
  return clean.replace('-', '−');
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

type Lane = {
  band: SVGRectElement;
  tick: SVGLineElement;
  strip: SVGRectElement;
  label: SVGTextElement;
  value: SVGTextElement;
};

type CellGroup = { title: SVGTextElement; inputs: SVGRectElement[]; recon: SVGRectElement[]; values: SVGTextElement[] };

type Geometry = { lo: number[]; hi: number[]; mu: number[]; q: number[][] };

export const vaeStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): VaeStageInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const body = fonts.body;
    const sm = fontSizes.sm;
    const md = fontSizes.md;
    const xs = fontSizes.xs;

    const root = el('g', {}, svg);
    const header = el('text', { x: PLOT_X0, y: 24, 'font-family': body, 'font-size': md, fill: colors.text }, root);
    const epochText = el(
      'text',
      { x: W - 20, y: 24, 'text-anchor': 'end', 'font-family': body, 'font-size': md, fill: colors.textMuted },
      root,
    );
    el('text', { x: PLOT_X0, y: 50, 'font-family': body, 'font-size': sm, fill: colors.textMuted }, root).textContent =
      t('label.latent', 'Latent axis {z} · spread = {band}', { z: 'z', band: `${MU} ± ${SIGMA}` });

    const axis = el('g', {}, root);
    const overlapLayer = el('g', {}, root);
    const laneLayer = el('g', {}, root);
    const gapLayer = el('g', {}, root);
    const cellLayer = el('g', {}, root);
    el('text', { x: 20, y: INPUT_Y + CELL * 0.7, 'font-family': body, 'font-size': xs, fill: colors.textMuted }, cellLayer)
      .textContent = t('label.input', 'Input');
    el('text', { x: 20, y: RECON_Y + CELL * 0.7, 'font-family': body, 'font-size': xs, fill: colors.textMuted }, cellLayer)
      .textContent = t('label.recon', 'Decoded');
    el('text', { x: 20, y: RECON_Y + CELL * 0.7 + 14, 'font-family': body, 'font-size': xs, fill: colors.textMuted }, cellLayer)
      .textContent = `z = ${MU}`;
    const readout = el('text', { x: PLOT_X0, y: READOUT_Y, 'font-family': body, 'font-size': sm, fill: colors.text }, root);
    const caption = el('text', { x: PLOT_X0, y: CAPTION_Y, 'font-family': body, 'font-size': md, fill: colors.text }, root);

    let range: [number, number] | null = null;
    let lanes: Lane[] = [];
    let groups: CellGroup[] = [];
    let ids: string[] = [];
    let current: Geometry | null = null;
    let frame: number | null = null;
    let pendingMarks: (() => void) | null = null;

    const xOf = (z: number): number => {
      if (range === null) throw new Error('vae-stage: 잠재 축 범위가 아직 없다');
      return PLOT_X0 + ((z - range[0]) / (range[1] - range[0])) * (PLOT_X1 - PLOT_X0);
    };

    const drawAxis = (zr: [number, number]): void => {
      axis.replaceChildren();
      el('line', { x1: PLOT_X0, x2: PLOT_X1, y1: AXIS_Y, y2: AXIS_Y, stroke: colors.textMuted, 'stroke-width': 1 }, axis);
      for (let z = Math.ceil(zr[0]); z <= zr[1]; z += 1) {
        if (z % 2 !== 0) continue;
        const x = xOf(z);
        el('line', { x1: x, x2: x, y1: AXIS_Y, y2: AXIS_Y + 4, stroke: colors.textMuted }, axis);
        el(
          'text',
          { x, y: AXIS_Y + 16, 'text-anchor': 'middle', 'font-family': body, 'font-size': xs, fill: colors.textMuted },
          axis,
        ).textContent = fmt(z, 0);
      }
      // 가운데(0) 기준선 — 띠가 모이는 자리
      el('line', {
        x1: xOf(0), x2: xOf(0), y1: LANE_Y0 - 6, y2: AXIS_Y,
        stroke: colors.border, 'stroke-dasharray': '3 3',
      }, axis);
    };

    const build = (snap: StageSnapshot): void => {
      ids = snap.bands.map((b) => b.id);
      const palette = categorical(ids.length, 'vivid');
      laneLayer.replaceChildren();
      for (const g of groups) g.title.parentNode?.removeChild(g.title);
      cellLayer.querySelectorAll('[data-cell]').forEach((n) => n.parentNode?.removeChild(n));
      lanes = ids.map((id, i) => {
        const color = palette[i];
        const y = LANE_Y0 + i * LANE_DY;
        const label = el('text', { x: PLOT_X0 - 14, y: y + LANE_H * 0.72, 'text-anchor': 'end', 'font-family': body, 'font-size': md, fill: color }, laneLayer);
        label.textContent = id;
        const band = el('rect', { y, height: LANE_H, rx: 4, fill: color, 'fill-opacity': 0.3, stroke: color, 'stroke-width': 1.5 }, laneLayer);
        const tick = el('line', { y1: y - 3, y2: y + LANE_H + 3, stroke: color, 'stroke-width': 2 }, laneLayer);
        const strip = el('rect', { y: STRIP_Y, height: STRIP_H, fill: color, 'fill-opacity': 0.35, stroke: color, 'stroke-width': 1 }, laneLayer);
        const value = el('text', { x: SIDE_X, y: y + LANE_H * 0.72, 'font-family': body, 'font-size': sm, fill: colors.text }, laneLayer);
        return { band, tick, strip, label, value };
      });
      groups = snap.cells.map((c, i) => {
        const gx = GROUP_X0 + 40 + i * GROUP_DX;
        const title = el('text', { x: gx, y: CELL_LABEL_Y, 'font-family': body, 'font-size': md, fill: palette[i], 'data-cell': 1 }, cellLayer);
        title.textContent = c.id;
        const inputs: SVGRectElement[] = [];
        const recon: SVGRectElement[] = [];
        const values: SVGTextElement[] = [];
        for (let k = 0; k < c.x.length; k += 1) {
          const x = gx + k * (CELL + CELL_GAP);
          inputs.push(el('rect', { x, y: INPUT_Y, width: CELL, height: CELL, rx: 3, stroke: colors.border, 'data-cell': 1 }, cellLayer));
          el('rect', { x, y: RECON_Y, width: CELL, height: CELL, rx: 3, fill: colors.bg, stroke: colors.border, 'data-cell': 1 }, cellLayer);
          recon.push(el('rect', { x, y: RECON_Y, width: CELL, height: CELL, rx: 3, fill: colors.text, 'data-cell': 1 }, cellLayer));
          values.push(el('text', { x: x + CELL / 2, y: RECON_VAL_Y, 'text-anchor': 'middle', 'font-family': body, 'font-size': xs, fill: colors.textMuted, 'data-cell': 1 }, cellLayer));
        }
        return { title, inputs, recon, values };
      });
      current = null;
    };

    const place = (geo: Geometry): void => {
      lanes.forEach((lane, i) => {
        const x0 = xOf(geo.lo[i]);
        const x1 = xOf(geo.hi[i]);
        const xm = xOf(geo.mu[i]);
        lane.band.setAttribute('x', String(x0));
        lane.band.setAttribute('width', String(Math.max(0, x1 - x0)));
        lane.strip.setAttribute('x', String(x0));
        lane.strip.setAttribute('width', String(Math.max(0, x1 - x0)));
        lane.tick.setAttribute('x1', String(xm));
        lane.tick.setAttribute('x2', String(xm));
      });
      groups.forEach((g, i) => {
        g.recon.forEach((r, k) => r.setAttribute('fill-opacity', String(geo.q[i][k])));
      });
    };

    const clearMarks = (): void => {
      overlapLayer.replaceChildren();
      gapLayer.replaceChildren();
    };

    const drawMarks = (snap: StageSnapshot): void => {
      clearMarks();
      const byId = new Map(snap.bands.map((b) => [b.id, b]));
      snap.gaps.forEach((gp, n) => {
        const left = byId.get(gp.left);
        const right = byId.get(gp.right);
        if (left === undefined || right === undefined) throw new Error(`vae-stage: 틈의 입력 ${gp.left}·${gp.right} 가 띠에 없다`);
        if (gp.overlap) {
          // 겹친 자리 = 오른쪽 띠의 왼끝 .. 왼쪽 띠의 오른끝
          const x0 = xOf(right.lo);
          const x1 = xOf(left.hi);
          el('rect', {
            x: x0, y: STRIP_Y - 4, width: Math.max(0, x1 - x0), height: STRIP_H + 8,
            fill: colors.danger, 'fill-opacity': 0.25, stroke: colors.danger, 'stroke-width': 1.5, 'stroke-dasharray': '3 2',
          }, overlapLayer);
        }
        el('text', {
          x: SIDE_X, y: STRIP_Y - 2 + n * 16, 'font-family': body, 'font-size': sm,
          fill: gp.overlap ? colors.danger : colors.text, 'font-weight': gp.overlap ? 700 : 400,
        }, gapLayer).textContent = t('label.gap', 'Gap {pair}: {gap}', { pair: `${gp.left}–${gp.right}`, gap: fmt(gp.gap) });
      });
    };

    const writeTexts = (snap: StageSnapshot): void => {
      header.textContent = t('label.beta', 'KL weight {beta}: {value}', { beta: BETA, value: fmt(snap.beta, snap.beta % 1 === 0 ? 0 : 1) });
      epochText.textContent = t('label.epoch', 'Epoch: {n}', { n: snap.epoch });
      lanes.forEach((lane, i) => {
        const b = snap.bands[i];
        lane.value.textContent = `${MU} ${fmt(b.mu)} · ${SIGMA} ${fmt(b.sigma)}`;
      });
      groups.forEach((g, i) => {
        const c = snap.cells[i];
        g.inputs.forEach((r, k) => {
          r.setAttribute('fill', c.x[k] === 1 ? colors.text : colors.bg);
        });
        g.values.forEach((v, k) => {
          v.textContent = fmt(c.q[k]);
        });
      });
      readout.textContent = [
        t('readout.recon', 'Reconstruction error: {v}', { v: fmt(snap.recon) }),
        t('readout.kl', '{sym}: {v}', { sym: KL, v: fmt(snap.kl) }),
        t('readout.sigma', 'Mean {sym}: {v}', { sym: SIGMA, v: fmt(snap.sigmaMean) }),
        t('readout.width', 'Spread of {sym}: {v}', { sym: MU, v: fmt(snap.muWidth) }),
      ].join(' · ');
      caption.textContent =
        snap.overlapCount > 0
          ? t('caption.overlap', 'Neighbouring spreads overlap. Overlapping pairs: {n}', { n: snap.overlapCount })
          : t('caption.apart', 'Every neighbouring spread stands apart. Narrowest gap: {gap}', { gap: fmt(snap.narrowestGap) });
    };

    const stopFrame = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (pendingMarks !== null) {
        const run = pendingMarks;
        pendingMarks = null;
        run();
      }
    };

    const instance: VaeStageInstance = {
      show(snap, ms) {
        stopFrame();
        const zr = snap.zRange;
        if (range === null || range[0] !== zr[0] || range[1] !== zr[1]) {
          range = [zr[0], zr[1]];
          drawAxis(range);
        }
        const same = snap.bands.length === ids.length && snap.bands.every((b, i) => b.id === ids[i]);
        if (!same) build(snap);
        if (snap.cells.length !== ids.length || snap.cells.some((c, i) => c.id !== ids[i])) {
          throw new Error('vae-stage: 칸 목록이 띠 목록과 어긋난다');
        }
        const target: Geometry = {
          lo: snap.bands.map((b) => b.lo),
          hi: snap.bands.map((b) => b.hi),
          mu: snap.bands.map((b) => b.mu),
          q: snap.cells.map((c) => [...c.q]),
        };
        // 앞 모습의 결론은 옮겨 가는 동안 걷고, 도착하면 이 모습의 결론을 칠한다
        clearMarks();
        writeTexts(snap);
        const from = current;
        current = target;
        if (from === null || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          place(target);
          drawMarks(snap);
          return;
        }
        const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
        pendingMarks = () => {
          place(target);
          drawMarks(snap);
        };
        const tick = (now: number): void => {
          const u = Math.min(1, (now - start) / ms);
          const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
          place({
            lo: target.lo.map((v, i) => lerp(from.lo[i], v, e)),
            hi: target.hi.map((v, i) => lerp(from.hi[i], v, e)),
            mu: target.mu.map((v, i) => lerp(from.mu[i], v, e)),
            q: target.q.map((row, i) => row.map((v, k) => lerp(from.q[i][k], v, e))),
          });
          if (u < 1) {
            frame = requestAnimationFrame(tick);
          } else {
            frame = null;
            const run = pendingMarks;
            pendingMarks = null;
            run?.();
          }
        };
        frame = requestAnimationFrame(tick);
      },
      clear() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        pendingMarks = null;
        clearMarks();
        header.textContent = '';
        epochText.textContent = '';
        readout.textContent = '';
        caption.textContent = '';
        for (const lane of lanes) lane.value.textContent = '';
        for (const g of groups) for (const v of g.values) v.textContent = '';
      },
      destroy() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        pendingMarks = null;
        root.remove();
      },
    };
    return instance;
  },
};
