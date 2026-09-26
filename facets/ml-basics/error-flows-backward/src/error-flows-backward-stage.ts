/**
 * error-flows-backward 무대.
 *
 * 망을 왼쪽(입력) → 오른쪽(출력)으로 눕히고, 틀림은 오른쪽에서 왼쪽으로 흐른다.
 * 가지의 굵기는 |무게|, 음수 무게는 끊긴 선. 틀림의 몫은 원판이다 — 크기는 |값|,
 * 채움은 부호(음수 primary · 양수 accent)이고 안에 부호 글자를 둔다.
 *
 *   걸음 1  출력 마디 둘레에 틀림 δ 의 고리가 부푼다
 *   걸음 2  틀림이 세 가지로 갈라져 은닉으로 흐른다. 몫의 크기는 가지 무게에 비례하고,
 *           음수 가지의 무게 표식(×w)을 지나는 순간 부호가 뒤집힌다. 지나간 가지에는
 *           그 가지 무게의 기울기 ∂L/∂w2 표가 남는다
 *   걸음 3  은닉의 몫이 다시 입력 가지 둘로 갈라져 앞쪽 무게 여섯에 닿아 기울기 표가 된다
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ErrorFlowsBackwardScene } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const NODE_R = 17;
/** 틀림 원판의 반지름 — 최소 + |값| / |δ_out| 의 제곱근 비례 (넓이가 값에 비례) */
const DISC_MIN = 3;
const DISC_GROW = 9;
const STROKE_MIN = 1;
const STROKE_GROW = 6;
const NET_TOP = 80;
const NET_BOTTOM_PAD = 40;
const CHIP_H = 16;
const CHIP_PAD = 5;

/** 걸음 2 에서 출력→은닉 가지 위의 자리 (은닉 쪽 0, 출력 쪽 1) */
const GATE_T = 0.62;
const GRAD2_T = 0.3;
/** 걸음 3 에서 입력→은닉 가지 위의 기울기 표 자리 (입력 쪽 0). 은닉 곁에 부채꼴로 모여 어느 몫이 갈라졌는지 읽힌다 */
const GRAD1_T = 0.76;
/** 마디 둘레 고리의 가장 큰 반지름 — 위아래 글자를 그 바깥에 둔다 */
const HALO_MAX = NODE_R + DISC_MIN + DISC_GROW;

const MS_ERROR = 600;
const MS_HIDDEN = 1000;
const MS_INPUTS = 900;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Layout = {
  inputs: Pt[];
  hidden: Pt[];
  out: Pt;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const q = Math.round(v * 100) / 100;
  return Object.is(q, -0) ? 0 : q;
}

/** 표시 — 셈은 전 정밀도, 찍을 때만 toFixed. 빼기표는 − */
function fmt(v: number, digits = 2): string {
  let s = v.toFixed(digits);
  if (/^-0\.0*$/.test(s)) s = s.slice(1);
  return s.replace('-', '−');
}

function lerp(a: Pt, b: Pt, k: number): Pt {
  return { x: r2(a.x + (b.x - a.x) * k), y: r2(a.y + (b.y - a.y) * k) };
}

function spread(count: number, top: number, bottom: number): number[] {
  const gap = (bottom - top) / count;
  return Array.from({ length: count }, (_, k) => r2(top + gap * (k + 0.5)));
}

function layoutOf(scene: ErrorFlowsBackwardScene): Layout {
  const bottom = H - NET_BOTTOM_PAD;
  const x0 = Math.round(W * 0.13);
  const x1 = Math.round(W * 0.5);
  const x2 = Math.round(W * 0.84);
  return {
    inputs: spread(scene.x.length, NET_TOP, bottom).map((y) => ({ x: x0, y })),
    hidden: spread(scene.w2.length, NET_TOP, bottom).map((y) => ({ x: x1, y })),
    out: { x: x2, y: r2((NET_TOP + bottom) / 2) },
  };
}

function signFill(v: number, colors: Palette): { fill: string; ink: string; glyph: string } {
  if (v < 0) return { fill: colors.primary, ink: colors.textInverse, glyph: '−' };
  if (v > 0) return { fill: colors.accent, ink: colors.stateInk, glyph: '+' };
  return { fill: colors.bgSubtle, ink: colors.textMuted, glyph: '0' };
}

function discR(v: number, ref: number): number {
  if (!(ref > 0)) throw new Error('δ_out 의 크기가 0 이라 몫의 크기를 잴 수 없다');
  return r2(DISC_MIN + DISC_GROW * Math.sqrt(Math.abs(v) / ref));
}

function at<T>(arr: readonly T[], k: number, path: string): T {
  const v = arr[k];
  if (v === undefined) throw new Error(`${path}[${k}] 가 없다`);
  return v;
}


export const errorFlowsBackwardStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const mono = fonts.mono;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /** 프레임을 수로 센다 — 벽시계를 읽지 않아 흘림이 늘 같은 자리를 지난다 */
    async function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return false;
        frame(f / frames);
      }
      return true;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; family?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'central',
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill ?? colors.text,
        },
        parent,
      );
      node.textContent = body;
      return node;
    }

    function disc(parent: Element, p: Pt, r: number, v: number): SVGGElement {
      const s = signFill(v, colors);
      const g = el('g', { transform: `translate(${p.x} ${p.y})` }, parent);
      el('circle', { cx: 0, cy: 0, r, fill: s.fill, stroke: colors.bg, 'stroke-width': 1 }, g);
      if (r >= 7) {
        text(g, 0, 0, s.glyph, { fill: s.ink, size: fontSizes.xs, weight: '700' });
      }
      return g;
    }

    function chip(parent: Element, p: Pt, v: number): void {
      const s = signFill(v, colors);
      const body = fmt(v);
      const w = Math.ceil(body.length * smPx * 0.62) + CHIP_PAD * 2;
      el(
        'rect',
        {
          x: r2(p.x - w / 2),
          y: r2(p.y - CHIP_H / 2),
          width: w,
          height: CHIP_H,
          rx: 3,
          fill: s.fill,
          stroke: colors.bg,
          'stroke-width': 1,
        },
        parent,
      );
      text(parent, p.x, p.y, body, { fill: s.ink, family: mono, weight: '600' });
    }

    function halo(parent: Element, p: Pt, v: number, ref: number): void {
      const s = signFill(v, colors);
      el('circle', { cx: p.x, cy: p.y, r: r2(NODE_R + discR(v, ref)), fill: s.fill }, parent);
    }

    function caption(scene: ErrorFlowsBackwardScene): void {
      const g = el('g', {}, svg);
      const line1 = (s: string): void => {
        text(g, W / 2, 24, s, { size: fontSizes.md, weight: '600' });
      };
      const line2 = (s: string): void => {
        text(g, W / 2, 46, s, { fill: colors.textMuted });
      };
      const f = scene.forward;
      if (f === null) return;
      if (scene.step === 'none') {
        line1(
          t('caption.forward', 'Forward pass done — ŷ: {yhat} · target y: {y} · loss L: {loss}', {
            yhat: fmt(f.yhat),
            y: fmt(scene.y),
            loss: fmt(f.loss),
          }),
        );
        return;
      }
      if (scene.step === 'error') {
        if (scene.deltaOut === null) throw new Error('error 걸음인데 deltaOut 이 없다');
        line1(t('caption.error', 'Error at the output: δ = ŷ − y = {d}', { d: fmt(scene.deltaOut) }));
        return;
      }
      if (scene.step === 'toHidden') {
        if (scene.flipped === null) throw new Error('toHidden 걸음인데 flipped 가 없다');
        if (scene.flipped.length > 0) {
          line1(
            t('caption.hidden', 'It splits by branch weight: δ_h = w · δ — sign flipped at: {ids}', {
              ids: scene.flipped.map((j) => `h${j + 1}`).join(', '),
            }),
          );
        } else {
          line1(t('caption.hiddenNoFlip', 'It splits by branch weight: δ_h = w · δ'));
        }
        line2(t('caption.hiddenGrad', 'Left on each branch: ∂L/∂w = δ · h'));
        return;
      }
      line1(t('caption.inputs', 'Each share splits again over its input branches'));
      line2(t('caption.inputsGrad', 'Left on each branch: ∂L/∂W1 = δ_h · x'));
    }

    /**
     * 그 장면의 화면 전체. `hide` 가 참이면 이번 걸음이 새로 놓는 것(운동이 데려올 것)을 비운다.
     * 돌려주는 것은 운동을 얹을 층.
     */
    function drawStatic(scene: ErrorFlowsBackwardScene, hide: boolean): SVGGElement {
      svg.textContent = '';
      const L = layoutOf(scene);
      const allW = [...scene.w2, ...scene.W1.flat()].map((w) => Math.abs(w));
      const maxW = Math.max(...allW);
      const strokeOf = (w: number): number =>
        maxW > 0 ? r2(STROKE_MIN + (STROKE_GROW * Math.abs(w)) / maxW) : STROKE_MIN;

      const branches = el('g', {}, svg);
      scene.W1.forEach((row, j) => {
        const hp = at(L.hidden, j, 'hidden');
        row.forEach((w, i) => {
          const ip = at(L.inputs, i, 'inputs');
          el(
            'line',
            {
              x1: ip.x,
              y1: ip.y,
              x2: hp.x,
              y2: hp.y,
              stroke: colors.textMuted,
              'stroke-width': strokeOf(w),
              'stroke-opacity': 0.55,
              ...(w < 0 ? { 'stroke-dasharray': '5 4' } : {}),
            },
            branches,
          );
        });
      });
      scene.w2.forEach((w, j) => {
        const hp = at(L.hidden, j, 'hidden');
        el(
          'line',
          {
            x1: hp.x,
            y1: hp.y,
            x2: L.out.x,
            y2: L.out.y,
            stroke: colors.textMuted,
            'stroke-width': strokeOf(w),
            'stroke-opacity': 0.8,
            ...(w < 0 ? { 'stroke-dasharray': '6 4' } : {}),
          },
          branches,
        );
      });

      // 출력 가지의 무게 표식 — 틀림이 지나며 곱해지는 자리
      const gates = el('g', {}, svg);
      scene.w2.forEach((w, j) => {
        const p = lerp(at(L.hidden, j, 'hidden'), L.out, GATE_T);
        text(gates, p.x, p.y - 11, `×${fmt(w)}`, {
          family: mono,
          fill: w < 0 ? colors.text : colors.textMuted,
          weight: w < 0 ? '700' : 'normal',
        });
      });

      const ref = scene.deltaOut === null ? 0 : Math.abs(scene.deltaOut);
      const halos = el('g', {}, svg);
      const nodes = el('g', {}, svg);
      const labels = el('g', {}, svg);
      const chips = el('g', {}, svg);

      // 틀림의 고리 — 마디 뒤에
      if (scene.deltaOut !== null && !(hide && scene.step === 'error')) {
        halo(halos, L.out, scene.deltaOut, ref);
      }
      if (scene.deltaHidden !== null && !(hide && scene.step === 'toHidden')) {
        scene.deltaHidden.forEach((d, j) => halo(halos, at(L.hidden, j, 'hidden'), d, ref));
      }

      const node = (p: Pt, label: string): void => {
        el('circle', { cx: p.x, cy: p.y, r: NODE_R, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, nodes);
        text(nodes, p.x, p.y, label, { size: fontSizes.md, weight: '600' });
      };
      const above = (p: Pt, body: string): void => {
        text(labels, p.x, p.y - HALO_MAX - 8, body, { family: mono, fill: colors.textMuted });
      };
      const below = (p: Pt, v: number): void => {
        text(labels, p.x, p.y + HALO_MAX + 10, `δ ${fmt(v)}`, {
          family: mono,
          weight: '700',
        });
      };

      L.inputs.forEach((p, i) => {
        node(p, `x${i + 1}`);
        above(p, fmt(at(scene.x, i, 'x')));
      });
      L.hidden.forEach((p, j) => {
        node(p, `h${j + 1}`);
        if (scene.forward !== null) above(p, fmt(at(scene.forward.h, j, 'forward.h')));
      });
      node(L.out, 'ŷ');
      if (scene.forward !== null) above(L.out, fmt(scene.forward.yhat));
      text(labels, L.out.x + HALO_MAX + 6, L.out.y, `y ${fmt(scene.y)}`, {
        family: mono,
        anchor: 'start',
      });

      if (scene.deltaOut !== null && !(hide && scene.step === 'error')) below(L.out, scene.deltaOut);
      if (scene.deltaHidden !== null && !(hide && scene.step === 'toHidden')) {
        scene.deltaHidden.forEach((d, j) => below(at(L.hidden, j, 'hidden'), d));
      }

      if (scene.gradW2 !== null && !(hide && scene.step === 'toHidden')) {
        scene.gradW2.forEach((g, j) => chip(chips, lerp(at(L.hidden, j, 'hidden'), L.out, GRAD2_T), g));
      }
      if (scene.gradW1 !== null && !(hide && scene.step === 'toInputs')) {
        scene.gradW1.forEach((row, j) => {
          row.forEach((g, i) => {
            const p = lerp(at(L.inputs, i, 'inputs'), at(L.hidden, j, 'hidden'), GRAD1_T);
            chip(chips, p, g);
          });
        });
      }

      caption(scene);
      return el('g', {}, svg);
    }

    async function moveError(scene: ErrorFlowsBackwardScene, layer: SVGGElement, mine: number): Promise<void> {
      if (scene.deltaOut === null) throw new Error('error 걸음인데 deltaOut 이 없다');
      const d = scene.deltaOut;
      const L = layoutOf(scene);
      const s = signFill(d, colors);
      const full = discR(d, Math.abs(d));
      const ring = el('circle', { cx: L.out.x, cy: L.out.y, r: NODE_R, fill: s.fill }, layer);
      // 고리는 마디 뒤에 있어야 한다 — 층의 맨 앞으로 옮긴다
      svg.insertBefore(layer, svg.firstChild);
      await tween(MS_ERROR, mine, (k) => {
        const e = 1 - (1 - k) ** 3;
        ring.setAttribute('r', String(r2(NODE_R + full * e)));
      });
    }

    async function moveToHidden(scene: ErrorFlowsBackwardScene, layer: SVGGElement, mine: number): Promise<void> {
      const { deltaOut, deltaHidden, gradW2 } = scene;
      if (deltaOut === null || deltaHidden === null || gradW2 === null) {
        throw new Error('toHidden 걸음인데 몫이 없다');
      }
      const L = layoutOf(scene);
      const ref = Math.abs(deltaOut);
      const chipLayer = el('g', {}, layer);
      const pieces = deltaHidden.map((d, j) => {
        const hp = at(L.hidden, j, 'hidden');
        const r = discR(d, ref);
        // 갈라진 순간의 몫: 크기는 |w · δ|, 부호는 아직 δ 의 것
        const before = disc(layer, L.out, r, Math.sign(deltaOut) * Math.abs(d));
        const after = disc(layer, L.out, r, d);
        after.setAttribute('visibility', 'hidden');
        return { hp, before, after, chipShown: false, grad: at(gradW2, j, 'gradW2') };
      });
      await tween(MS_HIDDEN, mine, (k) => {
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const along = 1 - e; // 출력 쪽 1 → 은닉 쪽 0
        for (const p of pieces) {
          const pos = lerp(p.hp, L.out, along);
          const tr = `translate(${pos.x} ${pos.y})`;
          p.before.setAttribute('transform', tr);
          p.after.setAttribute('transform', tr);
          const passedGate = along <= GATE_T;
          p.before.setAttribute('visibility', passedGate ? 'hidden' : 'visible');
          p.after.setAttribute('visibility', passedGate ? 'visible' : 'hidden');
          if (!p.chipShown && along <= GRAD2_T) {
            p.chipShown = true;
            chip(chipLayer, lerp(p.hp, L.out, GRAD2_T), p.grad);
          }
        }
      });
    }

    async function moveToInputs(scene: ErrorFlowsBackwardScene, layer: SVGGElement, mine: number): Promise<void> {
      const { deltaOut, deltaHidden, gradW1 } = scene;
      if (deltaOut === null || deltaHidden === null || gradW1 === null) {
        throw new Error('toInputs 걸음인데 몫이 없다');
      }
      const L = layoutOf(scene);
      const ref = Math.abs(deltaOut);
      const pieces = gradW1.flatMap((row, j) => {
        const hp = at(L.hidden, j, 'hidden');
        const dh = at(deltaHidden, j, 'deltaHidden');
        return row.map((g, i) => {
          const end = lerp(at(L.inputs, i, 'inputs'), hp, GRAD1_T);
          const r = discR(g, ref);
          const before = disc(layer, hp, r, dh);
          const after = disc(layer, hp, r, g);
          after.setAttribute('visibility', 'hidden');
          return { hp, end, before, after };
        });
      });
      await tween(MS_INPUTS, mine, (k) => {
        const e = 1 - (1 - k) ** 2;
        for (const p of pieces) {
          const pos = lerp(p.hp, p.end, e);
          const tr = `translate(${pos.x} ${pos.y})`;
          p.before.setAttribute('transform', tr);
          p.after.setAttribute('transform', tr);
          const half = e >= 0.5;
          p.before.setAttribute('visibility', half ? 'hidden' : 'visible');
          p.after.setAttribute('visibility', half ? 'visible' : 'hidden');
        }
      });
    }

    return {
      async render(
        next: ErrorFlowsBackwardScene,
        prev: ErrorFlowsBackwardScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moves = opts.animate && prev !== null && next.step !== 'none';
        if (!moves) {
          drawStatic(next, false);
          return;
        }
        const layer = drawStatic(next, true);
        if (next.step === 'error') await moveError(next, layer, mine);
        else if (next.step === 'toHidden') await moveToHidden(next, layer, mine);
        else await moveToInputs(next, layer, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next, false);
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
