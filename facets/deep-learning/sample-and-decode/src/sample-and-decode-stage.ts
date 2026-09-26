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
} from '@ffacet/core/runtime';
import type { Vec2 } from './algorithm.js';
import type { SampleAndDecodeScene, SampleDraw } from './scene.js';

const H = 380;
const SVG = 'http://www.w3.org/2000/svg';

/** 뽑기 걸음 — ε 가 뻗었다가 σ 배로 줄며 z 를 놓는다. */
const DRAW_MS = 720;
/** 되돌림 걸음 — z 가 디코더로 들어가 칸 넷으로 펼쳐진다. */
const DECODE_MS = 840;
const FRAME_MS = 16;

/** 잠재 평면이 차지할 가로 상한. 세로는 본문 높이에서 역산한다. */
const PLANE_MAX_W = 210;
const DECODER_W = 72;
const DECODER_H = 96;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
const MONO_ADV = 0.6;

/** 잠재 평면의 자리 — init 이 보낸 테 자리 목록에서만 잡는다. */
type Plane = {
  px0: number;
  py0: number;
  pw: number;
  ph: number;
  minX: number;
  maxY: number;
  s: number;
};

type Layout = {
  bodyTop: number;
  bodyBot: number;
  dx0: number;
  dx1: number;
  dmid: number;
  cellX0: number;
  colW: number;
  barW: number;
  rowH: number;
};

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  const back = Number(s);
  const clean = back === 0 ? Math.abs(back).toFixed(digits) : s;
  return clean.replace('-', '−');
}

function vecText(v: readonly number[], digits: number): string {
  return `[${v.map((x) => fmt(x, digits)).join(', ')}]`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function phase(p: number, from: number, to: number): number {
  if (p <= from) return 0;
  if (p >= to) return 1;
  return ease((p - from) / (to - from));
}

function layoutOf(scene: SampleAndDecodeScene): Layout {
  const W = PIECE_CANVAS_W;
  const pad = 16;
  const bodyTop = 58;
  const bodyBot = H - 86;
  const bodyH = bodyBot - bodyTop;
  const dx0 = pad + PLANE_MAX_W + 28;
  const dx1 = dx0 + DECODER_W;
  const dmid = bodyTop + bodyH / 2;
  const outX0 = dx1 + 34;
  const cellX0 = outX0 + 22;
  const colW = (W - pad - cellX0) / Math.max(1, scene.cellCount);
  const barW = Math.min(36, colW * 0.64);
  const rowH = bodyH / Math.max(1, scene.drawCount);
  return { bodyTop, bodyBot, dx0, dx1, dmid, cellX0, colW, barW, rowH };
}

function planeOf(extent: Vec2[], L: Layout): Plane {
  if (extent.length === 0) throw new Error('sample-and-decode: 평면의 테 자리 목록이 비었다');
  const pad = 16;
  const margin = 0.25;
  const minX = Math.min(...extent.map((q) => q[0])) - margin;
  const maxX = Math.max(...extent.map((q) => q[0])) + margin;
  const minY = Math.min(...extent.map((q) => q[1])) - margin;
  const maxY = Math.max(...extent.map((q) => q[1])) + margin;
  const bodyH = L.bodyBot - L.bodyTop;
  const s = Math.min(bodyH / (maxY - minY), PLANE_MAX_W / (maxX - minX));
  const pw = (maxX - minX) * s;
  const ph = (maxY - minY) * s;
  const px0 = pad + (PLANE_MAX_W - pw) / 2;
  const py0 = L.bodyTop + (bodyH - ph) / 2;
  return { px0, py0, pw, ph, minX, maxY, s };
}

export const sampleAndDecodeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function add(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      content?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG, tag);
      for (const [key, val] of Object.entries(attrs)) {
        node.setAttribute(key, typeof val === 'number' ? String(round(val)) : val);
      }
      if (content !== undefined) node.textContent = content;
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: {
        size?: number;
        fill?: string;
        anchor?: string;
        mono?: boolean;
        weight?: number;
        halo?: boolean;
      } = {},
    ): void {
      add(
        parent,
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? SM,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          ...(opts.weight !== undefined ? { 'font-weight': opts.weight } : {}),
          // 펼침 선이 지나가도 글자가 읽히게 바탕색 테를 두른다
          ...(opts.halo === true
            ? { stroke: colors.bg, 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }
            : {}),
        },
        content,
      );
    }

    /** 끝이 뾰족한 선 — 가운데에서 떼어 놓인 만큼을 그린다. */
    function arrow(
      parent: Element,
      from: [number, number],
      to: [number, number],
      stroke: string,
      width: number,
      dash?: string,
    ): void {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      add(parent, 'line', {
        x1: from[0],
        y1: from[1],
        x2: to[0],
        y2: to[1],
        stroke,
        'stroke-width': width,
        ...(dash !== undefined ? { 'stroke-dasharray': dash } : {}),
      });
      if (len < 8) return;
      const ux = dx / len;
      const uy = dy / len;
      const head = 7;
      const bx = to[0] - ux * head;
      const by = to[1] - uy * head;
      const pts = [
        [to[0], to[1]],
        [bx - uy * 3.5, by + ux * 3.5],
        [bx + uy * 3.5, by - ux * 3.5],
      ]
        .map((q) => `${round(q[0] ?? 0)},${round(q[1] ?? 0)}`)
        .join(' ');
      add(parent, 'polygon', { points: pts, fill: stroke });
    }

    function paint(scene: SampleAndDecodeScene, p: number): void {
      svg.textContent = '';
      const L = layoutOf(scene);
      const palette = categorical(scene.drawCount, 'vivid');
      const tint = (k: number): string => {
        const c = palette[k - 1];
        if (c === undefined) throw new Error(`sample-and-decode: 뽑기 ${k} 의 색이 없다`);
        return c;
      };
      const step = scene.step;
      if (scene.extent === null && step.kind !== 'start') {
        throw new Error('sample-and-decode: init 뒤인데 평면의 테 자리 목록이 없다');
      }
      // init 전(처음 장면)에는 평면을 그리지 않으므로 테도 셈하지 않는다
      const P: Plane | null = scene.extent === null ? null : planeOf(scene.extent, L);
      const plan = (): Plane => {
        if (P === null) throw new Error('sample-and-decode: 평면의 테 자리 목록이 없다');
        return P;
      };
      const X = (v: number): number => plan().px0 + (v - plan().minX) * plan().s;
      const Y = (v: number): number => plan().py0 + (plan().maxY - v) * plan().s;
      const at = (v: Vec2): [number, number] => [X(v[0]), Y(v[1])];
      const root = add(svg, 'g', {});

      // 머리 — 분포의 가운데와 퍼짐
      const muText = `μ = ${vecText(scene.mu, 2)}`;
      const sigmaText = `σ = ${vecText(scene.sigma, 2)}`;
      const headW = Math.max(muText.length, sigmaText.length) * SM * MONO_ADV;
      label(root, 16, 22, muText, { mono: true });
      label(root, 16 + headW + 10, 22, t('label.center', 'center'), { size: XS, fill: colors.textMuted });
      label(root, 16, 42, sigmaText, { mono: true });
      label(root, 16 + headW + 10, 42, t('label.spread', 'spread'), { size: XS, fill: colors.textMuted });

      // 잠재 평면 — 테를 잡을 자리(init)가 온 뒤에만 그린다
      if (P !== null) {
        // 잠재 평면
        const plane = add(root, 'g', {});
        add(plane, 'rect', {
          x: P.px0,
          y: P.py0,
          width: P.pw,
          height: P.ph,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
        const minY = P.maxY - P.ph / P.s;
        const maxX = P.minX + P.pw / P.s;
        if (P.minX < 0 && maxX > 0) {
          add(plane, 'line', { x1: X(0), y1: P.py0, x2: X(0), y2: P.py0 + P.ph, stroke: colors.border });
        }
        if (minY < 0 && P.maxY > 0) {
          add(plane, 'line', { x1: P.px0, y1: Y(0), x2: P.px0 + P.pw, y2: Y(0), stroke: colors.border });
        }
        const axisY = minY < 0 && P.maxY > 0 ? Y(0) - 5 : P.py0 + P.ph - 6;
        label(plane, P.px0 + P.pw - 4, axisY, 'z₁', { size: XS, fill: colors.textMuted, anchor: 'end', mono: true });
        label(plane, P.px0 + 4, P.py0 + 13, 'z₂', { size: XS, fill: colors.textMuted, mono: true });

        // 퍼짐 — 가운데를 둘러싼 σ 테
        const mu = at(scene.mu);
        add(plane, 'ellipse', {
          cx: mu[0],
          cy: mu[1],
          rx: scene.sigma[0] * P.s,
          ry: scene.sigma[1] * P.s,
          fill: colors.textMuted,
          'fill-opacity': 0.14,
          stroke: colors.textMuted,
          'stroke-dasharray': '3 3',
        });

        // 지난 뽑기의 z — 흐리게 남는다
        const current = step.kind === 'start' ? 0 : step.k;
        for (const d of scene.draws) {
          if (d.k === current && step.kind === 'draw') continue;
          const z = at(d.z);
          add(plane, 'line', {
            x1: mu[0],
            y1: mu[1],
            x2: z[0],
            y2: z[1],
            stroke: tint(d.k),
            'stroke-width': 1,
            'stroke-opacity': d.k === current ? 0.9 : 0.45,
          });
        }

        // 이번 뽑기 — ε 가 뻗었다가 σ 배로 줄며 z 를 놓는다
        if (step.kind === 'draw') {
          const d = scene.draws.find((dr) => dr.k === step.k);
          if (d === undefined) throw new Error(`sample-and-decode: 뽑기 ${step.k} 가 장면에 없다`);
          const grow = phase(p, 0, 0.42);
          const shrink = phase(p, 0.5, 1);
          const ghost: [number, number] = [
            mu[0] + (X(d.unscaled[0]) - mu[0]) * grow,
            mu[1] + (Y(d.unscaled[1]) - mu[1]) * grow,
          ];
          arrow(plane, mu, ghost, colors.textMuted, 1.2, '4 3');
          if (grow >= 1) {
            label(plane, ghost[0] + 6, ghost[1] + 4, 'ε', { fill: colors.textMuted, mono: true });
          }
          if (shrink > 0) {
            const z = at(d.z);
            const tip: [number, number] = [
              ghost[0] + (z[0] - ghost[0]) * shrink,
              ghost[1] + (z[1] - ghost[1]) * shrink,
            ];
            arrow(plane, mu, tip, tint(d.k), 2);
            add(plane, 'circle', { cx: tip[0], cy: tip[1], r: 5, fill: tint(d.k), stroke: colors.bg, 'stroke-width': 1.5 });
          }
        }

        // 가운데 표시
        add(plane, 'path', {
          d: `M${round(mu[0] - 5)},${round(mu[1])}H${round(mu[0] + 5)}M${round(mu[0])},${round(mu[1] - 5)}V${round(mu[1] + 5)}`,
          stroke: colors.text,
          'stroke-width': 2,
        });
        label(plane, mu[0] - 7, mu[1] - 6, 'μ', { mono: true, anchor: 'end' });

        // 놓인 z 점 — 이번 뽑기는 위에서 그렸다
        for (const d of scene.draws) {
          if (d.k === current && step.kind === 'draw') continue;
          const z = at(d.z);
          add(plane, 'circle', { cx: z[0], cy: z[1], r: 4.5, fill: tint(d.k), stroke: colors.bg, 'stroke-width': 1.5 });
          label(plane, z[0] + 7, z[1] - 6, String(d.k), { size: XS, fill: tint(d.k), weight: 700 });
        }
        if (step.kind === 'draw' && p >= 1) {
          const d = scene.draws.find((dr) => dr.k === step.k);
          if (d !== undefined) {
            const z = at(d.z);
            label(plane, z[0] + 7, z[1] - 6, String(d.k), { size: XS, fill: tint(d.k), weight: 700 });
          }
        }

      }

      // 디코더
      const decoding = step.kind === 'decode' ? scene.draws.find((dr) => dr.k === step.k) : undefined;
      const fanBase: [number, number] = [L.dx1, L.dmid];
      const layer = add(root, 'g', {});
      if (decoding !== undefined) {
        // z 가 디코더로 들어간다
        const travel = phase(p, 0, 0.34);
        const z = at(decoding.z);
        const inlet: [number, number] = [L.dx0, L.dmid];
        const head: [number, number] = [z[0] + (inlet[0] - z[0]) * travel, z[1] + (inlet[1] - z[1]) * travel];
        add(layer, 'line', {
          x1: z[0],
          y1: z[1],
          x2: head[0],
          y2: head[1],
          stroke: tint(decoding.k),
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3',
        });
        if (travel > 0 && travel < 1) {
          add(layer, 'circle', { cx: head[0], cy: head[1], r: 4.5, fill: tint(decoding.k) });
        }
        // 칸 넷으로 펼쳐진다
        const fan = phase(p, 0.36, 0.62);
        if (fan > 0) {
          const rowTop = L.bodyTop + (decoding.k - 1) * L.rowH;
          const frameMid = rowTop + 6 + (L.rowH - 28) / 2;
          for (let i = 0; i < scene.cellCount; i += 1) {
            const cx = L.cellX0 + (i + 0.5) * L.colW;
            add(layer, 'line', {
              x1: fanBase[0],
              y1: fanBase[1],
              x2: fanBase[0] + (cx - fanBase[0]) * fan,
              y2: fanBase[1] + (frameMid - fanBase[1]) * fan,
              stroke: tint(decoding.k),
              'stroke-width': 1.4,
              'stroke-opacity': 0.75,
            });
          }
        }
      }
      add(root, 'rect', {
        x: L.dx0,
        y: L.dmid - DECODER_H / 2,
        width: DECODER_W,
        height: DECODER_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: decoding !== undefined ? tint(decoding.k) : colors.border,
        'stroke-width': decoding !== undefined ? 2 : 1,
      });
      label(root, (L.dx0 + L.dx1) / 2, L.dmid - DECODER_H / 2 - 8, t('label.decoder', 'decoder'), {
        size: XS,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      label(root, (L.dx0 + L.dx1) / 2, L.dmid + 4, 'σ(W·z + b)', {
        size: XS,
        anchor: 'middle',
        mono: true,
      });

      // 출력 — 뽑기마다 한 줄, 칸마다 한 칸
      for (let i = 0; i < scene.cellCount; i += 1) {
        label(root, L.cellX0 + (i + 0.5) * L.colW, L.bodyTop - 8, String(i), {
          size: XS,
          fill: colors.textMuted,
          anchor: 'middle',
          mono: true,
        });
      }
      for (let r = 0; r < scene.drawCount; r += 1) {
        const k = r + 1;
        const rowTop = L.bodyTop + r * L.rowH;
        const frameTop = rowTop + 6;
        const frameH = L.rowH - 28;
        label(root, L.cellX0 - 10, frameTop + frameH / 2 + 4, String(k), {
          fill: tint(k),
          anchor: 'end',
          weight: 700,
          halo: true,
        });
        const d: SampleDraw | undefined = scene.draws.find((dr) => dr.k === k);
        const cells = d?.cells ?? null;
        const growing = decoding !== undefined && decoding.k === k;
        const fill = growing ? phase(p, 0.62, 1) : 1;
        for (let i = 0; i < scene.cellCount; i += 1) {
          const cx = L.cellX0 + (i + 0.5) * L.colW;
          add(root, 'rect', {
            x: cx - L.barW / 2,
            y: frameTop,
            width: L.barW,
            height: frameH,
            fill: colors.bg,
            stroke: colors.border,
          });
          if (cells === null) continue;
          const v = cells[i];
          if (v === undefined) throw new Error(`sample-and-decode: 출력 ${k} 의 칸 ${i} 가 없다`);
          const h = frameH * v * fill;
          if (h > 0) {
            add(root, 'rect', {
              x: cx - L.barW / 2,
              y: frameTop + frameH - h,
              width: L.barW,
              height: h,
              fill: tint(k),
            });
          }
          if (fill >= 1) {
            label(root, cx, frameTop + frameH + 15, fmt(v, 2), {
              size: XS,
              anchor: 'middle',
              mono: true,
              halo: true,
            });
          }
        }
      }

      // 아래 — 지금 일어나는 일과 그 수
      const capY = H - 58;
      if (step.kind === 'start') {
        label(root, 16, capY, t('caption.start', 'Only the center and spread so far. Nothing drawn yet.'));
      } else if (step.kind === 'draw') {
        const d = scene.draws.find((dr) => dr.k === step.k);
        if (d === undefined) throw new Error(`sample-and-decode: 뽑기 ${step.k} 가 장면에 없다`);
        label(root, 16, capY, t('caption.draw', 'Draw {k}: the noise, shrunk by the spread, moves z off the center.', { k: d.k }));
        label(
          root,
          16,
          capY + 22,
          `ε = ${vecText(d.eps, 1)}    σ·ε = ${vecText(d.scaled, 2)}    z = μ + σ·ε = ${vecText(d.z, 2)}`,
          { mono: true, fill: tint(d.k) },
        );
      } else {
        const d = scene.draws.find((dr) => dr.k === step.k);
        if (d === undefined || d.cells === null) {
          throw new Error(`sample-and-decode: 되돌림 ${step.k} 의 출력이 장면에 없다`);
        }
        label(root, 16, capY, t('caption.decode', 'Decode {k}: the decoder spreads z into four cells.', { k: d.k }));
        label(
          root,
          16,
          capY + 22,
          `z = ${vecText(d.z, 2)}  →  σ(W·z + b) = ${vecText(d.cells, 2)}`,
          { mono: true, fill: tint(d.k) },
        );
        if (scene.gaps.length > 0) {
          const pairs = scene.gaps.map((g) => `${g.a}↔${g.b} ${fmt(g.d, 2)}`).join('  ·  ');
          label(root, 16, capY + 44, t('caption.gap', 'Largest cell difference between outputs: {pairs}', { pairs }), {
            size: XS,
            fill: colors.textMuted,
          });
        }
      }
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const wake = (): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const total = Math.max(1, Math.ceil(ms / FRAME_MS));
        let n = 0;
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          n += 1;
          const p = Math.min(1, n / total);
          frame(p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    return {
      async render(
        next: SampleAndDecodeScene,
        prev: SampleAndDecodeScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moving = opts.animate && next.step.kind !== 'start' && prev !== null;
        if (!moving) {
          paint(next, 1);
          return;
        }
        const ms = next.step.kind === 'draw' ? DRAW_MS : DECODE_MS;
        await tween(mine, ms, (p) => paint(next, p));
        if (destroyed || mine !== gen) return;
        paint(next, 1);
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
