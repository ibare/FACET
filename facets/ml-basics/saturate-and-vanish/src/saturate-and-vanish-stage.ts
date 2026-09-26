/**
 * saturate-and-vanish 무대.
 *
 * 위 판: σ 곡선과 짚은 자리의 접선. 아래 판: 짚은 자리마다 세운 기울기 막대.
 * 짚는 자리가 옮겨 갈 때 점이 곡선을 타고 가고, 접선이 그 자리의 기울기로 누우며,
 * 아래 막대가 함께 따라가며 σ′ 높이로 가라앉는다 — 밖으로 갈수록 바닥에 붙는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { readCurve } from './algorithm.js';
import type { Probe, SaturateAndVanishScene, SaturateBase } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 번의 길이 (ms). 사양 상한 600. */
const MOVE_MS = 600;
/** 접선의 반폭 — z 단위. 같은 가로 폭이라 눕는 정도가 곧 기울기다. */
const TANGENT_HALF_Z = 1.5;

type Motion = { z: number; grow: number };

function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  const zero = (0).toFixed(digits);
  if (s === `-${zero}`) return zero;
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

function fmtZ(z: number): string {
  return Number.isInteger(z) ? fmt(z, 0) : fmt(z, 1);
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export const saturateAndVanishStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    // 자리 — 캔버스 폭에서 역산한다.
    const W = PIECE_CANVAS_W;
    const left = Math.round(W * 0.09);
    const right = W - Math.round(W * 0.04);
    const captionY = 26;
    const topY0 = 58; // σ = 1
    const topY1 = 206; // σ = 0
    const botTop = 268; // σ′ = 꼭대기
    const botBase = 354; // σ′ = 0
    const axisLabelY = botBase + smPx + 10;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function xOf(base: SaturateBase, z: number): number {
      return round(left + ((z - base.zMin) / (base.zMax - base.zMin)) * (right - left));
    }
    function ySig(s: number): number {
      return round(topY1 - s * (topY1 - topY0));
    }
    function yGrad(base: SaturateBase, g: number): number {
      return round(botBase - (g / base.peak) * (botBase - botTop));
    }

    function drawAxes(base: SaturateBase): void {
      const g = el(svg, 'g', {});
      // 위 판 — σ 0 · 0.5 · 1 눈금
      for (const s of [0, 0.5, 1]) {
        el(g, 'line', {
          x1: left, x2: right, y1: ySig(s), y2: ySig(s),
          stroke: colors.border, 'stroke-width': 1,
          'stroke-dasharray': s === 0 ? 'none' : '2 4',
        });
        el(g, 'text', {
          x: left - 8, y: ySig(s) + smPx * 0.35, 'text-anchor': 'end',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
        }, fmt(s, s === 0.5 ? 1 : 0));
      }
      // z = 0 세로 기준선 (두 판을 가로지른다)
      el(g, 'line', {
        x1: xOf(base, 0), x2: xOf(base, 0), y1: topY0, y2: botBase,
        stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '2 4',
      });
      // 아래 판 — 바닥과 꼭대기
      el(g, 'line', {
        x1: left, x2: right, y1: botBase, y2: botBase,
        stroke: colors.textMuted, 'stroke-width': 1,
      });
      el(g, 'line', {
        x1: left, x2: right, y1: botTop, y2: botTop,
        stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 4',
      });
      el(g, 'text', {
        x: right, y: botTop - 6, 'text-anchor': 'end',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      }, t('label.peak', 'Peak: {v}', { v: fmt(base.peak, 4) }));
      el(g, 'text', {
        x: left - 8, y: botBase + smPx * 0.35, 'text-anchor': 'end',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
      }, '0');
      // z 눈금
      for (let z = base.zMin; z <= base.zMax; z += 2) {
        el(g, 'line', {
          x1: xOf(base, z), x2: xOf(base, z), y1: botBase, y2: botBase + 4,
          stroke: colors.textMuted, 'stroke-width': 1,
        });
        el(g, 'text', {
          x: xOf(base, z), y: axisLabelY, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
        }, fmtZ(z));
      }
      el(g, 'text', {
        x: right + 10, y: axisLabelY, 'text-anchor': 'start',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
      }, t('label.z', 'z'));
      // 판 이름 — 식
      el(g, 'text', {
        x: left + 4, y: topY0 - 12,
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
      }, t('label.sigma', 'σ(z) = 1 / (1 + e^−z)'));
      el(g, 'text', {
        x: left + 4, y: botTop - 30,
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
      }, t('label.slope', 'σ′(z) = σ(z)·(1 − σ(z))'));
    }

    function drawCurve(base: SaturateBase): void {
      const pts = base.curve.map((c) => `${xOf(base, c.z)},${ySig(c.s)}`).join(' ');
      el(svg, 'polyline', {
        points: pts, fill: 'none', stroke: colors.text, 'stroke-width': 2,
        'stroke-linejoin': 'round',
      });
    }

    /** 지나간 자리 — 곡선 위 빈 점과 아래 막대, 막대 위 σ′ 값. */
    function drawTrace(base: SaturateBase, p: Probe): void {
      const x = xOf(base, p.z);
      el(svg, 'circle', {
        cx: x, cy: ySig(p.s), r: 4, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5,
      });
      const top = yGrad(base, p.g);
      el(svg, 'rect', {
        x: round(x - 5), y: top, width: 10, height: round(Math.max(botBase - top, 0)),
        fill: colors.textMuted,
      });
      el(svg, 'line', {
        x1: round(x - 9), x2: round(x + 9), y1: top, y2: top,
        stroke: colors.textMuted, 'stroke-width': 2,
      });
      el(svg, 'text', {
        x, y: round(top - 8), 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
      }, fmt(p.g, 4));
    }

    /**
     * 지금 짚은 자리 — 곡선 위 점 · 접선 · 따라온 막대. `m` 이 있으면 운동 도중의 자리로
     * 그리고 값 글자는 두지 않는다 (지나가는 자리의 값은 셈한 값이 아니다).
     */
    function drawCurrent(base: SaturateBase, p: Probe, m: Motion | null): void {
      const z = m === null ? p.z : m.z;
      const at = m === null ? { s: p.s, g: p.g } : readCurve(base.curve, z);
      const grow = m === null ? 1 : m.grow;
      const x = xOf(base, z);
      const y = ySig(at.s);
      const half = TANGENT_HALF_Z * grow;
      el(svg, 'line', {
        x1: xOf(base, z - half), y1: ySig(at.s - at.g * half),
        x2: xOf(base, z + half), y2: ySig(at.s + at.g * half),
        stroke: colors.itemActive, 'stroke-width': 3, 'stroke-linecap': 'round',
      });
      // 짚은 자리에서 아래 판으로 내린 줄
      el(svg, 'line', {
        x1: x, x2: x, y1: y, y2: topY1,
        stroke: colors.itemActive, 'stroke-width': 1, 'stroke-dasharray': '2 3',
      });
      el(svg, 'circle', {
        cx: x, cy: y, r: 6, fill: colors.itemActive, stroke: colors.bg, 'stroke-width': 2,
      });
      const top = round(botBase - (at.g / base.peak) * (botBase - botTop) * grow);
      el(svg, 'rect', {
        x: round(x - 7), y: top, width: 14, height: round(Math.max(botBase - top, 0)),
        fill: colors.itemActive,
      });
      el(svg, 'line', {
        x1: round(x - 12), x2: round(x + 12), y1: top, y2: top,
        stroke: colors.itemActive, 'stroke-width': 3, 'stroke-linecap': 'round',
      });
      if (m !== null) return;

      // 값 글자 — 무엇의 값인지 이름을 붙인다 (σ 와 σ′ 가 같은 글자로 찍히는 자리가 있다).
      const below = p.z >= 0;
      el(svg, 'text', {
        x: below ? x + 12 : x - 12, y: below ? y + smPx + 10 : y - 12,
        'text-anchor': below ? 'start' : 'end',
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
        'font-weight': 600,
      }, t('label.sValue', 'σ = {v}', { v: fmt(p.s, 4) }));
      el(svg, 'text', {
        x, y: round(top - 8), 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text,
        'font-weight': 600,
      }, t('label.gValue', 'σ′ = {v}', { v: fmt(p.g, 4) }));
      el(svg, 'text', {
        x, y: round(top - 8 - smPx - 4), 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
      }, t('label.share', 'Share: {pct}%', { pct: fmt(p.ratio * 100, 1) }));
    }

    function drawCaption(scene: SaturateAndVanishScene): void {
      let text: string;
      const step = scene.step;
      if (step.kind === 'start') {
        text = t('caption.start', 'No point probed yet.');
      } else {
        const p = scene.probes[step.index];
        if (p === undefined) throw new Error(`saturate-and-vanish 무대: probes[${step.index}] 가 없다`);
        if (p.mirror === null) {
          text = t('caption.probe', 'z = {z} · slope σ′ = {g} · share of the peak: {pct}%', {
            z: fmtZ(p.z), g: fmt(p.g, 4), pct: fmt(p.ratio * 100, 1),
          });
        } else {
          text = t('caption.mirror', 'z = {z} · slope σ′ = {g} · share of the peak: {pct}% · at z = {m}: {mg}', {
            z: fmtZ(p.z), g: fmt(p.g, 4), pct: fmt(p.ratio * 100, 1),
            m: fmtZ(p.mirror.z), mg: fmt(p.mirror.g, 4),
          });
        }
      }
      el(svg, 'text', {
        x: W / 2, y: captionY, 'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text,
      }, text);
    }

    function drawStatic(scene: SaturateAndVanishScene, m: Motion | null): void {
      svg.textContent = '';
      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });
      const base = scene.base;
      if (base === null) return; // 바탕이 오기 전 — silent init 이 곧 갈아 끼운다
      drawAxes(base);
      drawCurve(base);
      const current = scene.step.kind === 'probe' ? scene.probes[scene.step.index] : undefined;
      scene.probes.forEach((p, i) => {
        if (scene.step.kind === 'probe' && i === scene.step.index) return;
        drawTrace(base, p);
      });
      if (current !== undefined) drawCurrent(base, current, m);
      drawCaption(scene);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    function ease(u: number): number {
      return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    }

    async function move(scene: SaturateAndVanishScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'probe') return;
      const p = scene.probes[step.index];
      if (p === undefined) throw new Error(`saturate-and-vanish 무대: probes[${step.index}] 가 없다`);
      const from = step.fromZ;
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const u = Math.min((Date.now() - t0) / MOVE_MS, 1);
        const k = ease(u);
        const m: Motion = from === null ? { z: p.z, grow: k } : { z: from + (p.z - from) * k, grow: 1 };
        drawStatic(scene, u < 1 ? m : null);
        if (u >= 1) return;
        await wait(16);
      }
    }

    return {
      async render(
        next: SaturateAndVanishScene,
        _prev: SaturateAndVanishScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next, null);
        if (!opts.animate || next.step.kind !== 'probe') return;
        await move(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next, null);
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
