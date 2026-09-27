/**
 * mean-and-spread 무대.
 *
 * 값 여덟은 수의 줄(저울대) 위에 쌓인 점이고, 평균은 그 아래 받침이다.
 * 편차는 점에서 떨어져 나와 받침 아래 줄에서 왼쪽 사슬과 오른쪽 사슬로 **맞서고**,
 * 이어 제 길이를 한 변으로 하는 정사각형으로 **부푼다**. 정사각형들이 하나로 모여
 * 넓이가 분산인 정사각형이 되고, 그 한 변(표준편차)이 저울대로 올라가 평균 양쪽에 놓인다.
 */
import {
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type Palette,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import { formatNumber } from './algorithm.js';
import type { MeanAndSpreadScene } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const PAD_X = 24;
const CAP1_Y = 26;
const CAP2_Y = 46;
const AXIS_Y = 150;
const TICK_LABEL_Y = AXIS_Y + 32;
const SD_Y = AXIS_Y + 48;
const TUG_Y = AXIS_Y + 92;
const TUG_H = 16;
const SQ_TOP = TUG_Y + TUG_H / 2 + 2;
const BOTTOM = H - 12;
const MAX_UNIT = 60;
const FRAME_MS = 16;

const MOVE_MEAN_MS = 600;
const MOVE_DEV_MS = 900;
const MOVE_SQ_MS = 800;
const MOVE_VAR_MS = 900;
const MOVE_SD_MS = 900;

const NS = 'http://www.w3.org/2000/svg';

type Geometry = {
  unit: number;
  x(v: number): number;
  dotR: number;
  dotGap: number;
  stack: number[];
  dotY(i: number): number;
  meanLabelY: number;
};

type Handles = {
  dots: SVGCircleElement[];
  fulcrum: SVGPolygonElement | null;
  meanLine: SVGLineElement | null;
  band: SVGRectElement | null;
  tug: Map<number, { rect: SVGRectElement; label: SVGTextElement }>;
  tugNotes: SVGTextElement[];
  squares: Map<number, { rect: SVGRectElement; label: SVGTextElement }>;
  varSquare: { rect: SVGRectElement; label: SVGTextElement } | null;
  sdLines: SVGLineElement[];
  sdLabel: SVGTextElement | null;
};

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function make<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function mix(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function geometryOf(scene: MeanAndSpreadScene): Geometry {
  const frame = scene.frame;
  if (frame === null) throw new Error('mean-and-spread-stage: 수의 줄 범위(init)가 아직 없다');
  const span = frame.hi - frame.lo;
  const byWidth = (W - 2 * PAD_X) / span;
  const byHeight = frame.maxSide > 0 ? (BOTTOM - SQ_TOP) / frame.maxSide : MAX_UNIT;
  const unit = Math.min(MAX_UNIT, byWidth, byHeight);
  const left = (W - span * unit) / 2;
  const x = (v: number): number => left + (v - frame.lo) * unit;

  const dotR = Math.min(8, unit * 0.22);
  const dotGap = dotR * 2 + 3;
  // 같은 값은 위로 쌓는다 — 앞에 같은 값이 몇 번 나왔는가가 층이다
  const stack = scene.values.map((v, i) => scene.values.slice(0, i).filter((w) => w === v).length);
  const tallest = Math.max(...stack);
  const dotY = (i: number): number => {
    const k = stack[i];
    if (k === undefined) throw new Error(`mean-and-spread-stage: 값의 자리 ${i} 가 없다`);
    return AXIS_Y - dotR - 2 - k * dotGap;
  };
  const meanLabelY = AXIS_Y - dotR - 2 - tallest * dotGap - dotR - 12;
  return { unit, x, dotR, dotGap, stack, dotY, meanLabelY };
}

export const meanAndSpreadStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<MeanAndSpreadScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const vivid = categorical(2, 'vivid');
    const soft = categorical(2, 'pastel');
    const leftInk = vivid[0];
    const rightInk = vivid[1];
    const leftFill = soft[0];
    const rightFill = soft[1];
    if (!leftInk || !rightInk || !leftFill || !rightFill) {
      throw new Error('mean-and-spread-stage: categorical(2) 가 두 색을 주지 않았다');
    }

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const inkOf = (d: number): string => (d < 0 ? leftInk : rightInk);
    const fillOf = (d: number): string => (d < 0 ? leftFill : rightFill);

    function text(
      parent: Element,
      x: number,
      y: number,
      content: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'middle',
      weight: 'normal' | 'bold' = 'normal',
    ): SVGTextElement {
      const node = make(parent, 'text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        fill,
      });
      node.textContent = content;
      return node;
    }

    function drawCaption(scene: MeanAndSpreadScene): void {
      let line1 = '';
      let line2 = '';
      switch (scene.step) {
        case 'values':
          line1 = t('caption.values', 'Values: {list}', {
            list: scene.values.map(formatNumber).join('  '),
          });
          line2 = t('caption.count', 'n = {n}', { n: formatNumber(scene.values.length) });
          break;
        case 'mean': {
          const m = scene.mean;
          if (m === null) throw new Error('mean-and-spread-stage: mean 걸음에 평균이 없다');
          line1 = t('caption.mean', 'Sum {sum} / {n} → mean {mean}', {
            sum: formatNumber(m.sum),
            n: formatNumber(m.n),
            mean: formatNumber(m.mean),
          });
          break;
        }
        case 'deviations': {
          const m = scene.mean;
          const d = scene.devs;
          if (m === null || d === null) throw new Error('mean-and-spread-stage: deviations 걸음에 편차가 없다');
          line1 = t('caption.deviations', 'Deviations: value − {mean}', { mean: formatNumber(m.mean) });
          line2 = t('caption.balance', 'Left sum {left} · right sum {right} · total {total}', {
            left: formatNumber(d.left),
            right: formatNumber(d.right),
            total: formatNumber(d.total),
          });
          break;
        }
        case 'squares': {
          const d = scene.devs;
          const s = scene.squares;
          if (d === null || s === null) throw new Error('mean-and-spread-stage: squares 걸음에 제곱이 없다');
          const farValue = scene.values[s.far];
          const farDev = d.dev[s.far];
          const farSq = s.sq[s.far];
          if (farValue === undefined || farDev === undefined || farSq === undefined) {
            throw new Error(`mean-and-spread-stage: squares.far ${s.far} 자리에 값이 없다`);
          }
          line1 = t('caption.squares', 'Squared deviations: total {ss}', { ss: formatNumber(s.ss) });
          line2 = t('caption.far', 'Farthest value {value}: deviation {dev} → square {sq}', {
            value: formatNumber(farValue),
            dev: formatNumber(farDev),
            sq: formatNumber(farSq),
          });
          break;
        }
        case 'variance': {
          const v = scene.variance;
          if (v === null) throw new Error('mean-and-spread-stage: variance 걸음에 분산이 없다');
          line1 = t('caption.variance', 'Variance = {ss} / {n} = {v}', {
            ss: formatNumber(v.ss),
            n: formatNumber(v.n),
            v: formatNumber(v.variance),
          });
          break;
        }
        case 'spread': {
          const s = scene.spread;
          if (s === null) throw new Error('mean-and-spread-stage: spread 걸음에 표준편차가 없다');
          line1 = t('caption.sd', 'Standard deviation √{v} = {sd}', {
            v: formatNumber(s.variance),
            sd: formatNumber(s.sd),
          });
          line2 = t('caption.band', 'μ ± σ = {lo} .. {hi} · values inside: {k}', {
            lo: formatNumber(s.bandLo),
            hi: formatNumber(s.bandHi),
            k: formatNumber(s.inside.length),
          });
          break;
        }
      }
      text(svg, W / 2, CAP1_Y, line1, fontSizes.md, colors.text, 'middle', 'bold');
      if (line2 !== '') text(svg, W / 2, CAP2_Y, line2, fontSizes.sm, colors.textMuted);
    }

    function drawStatic(scene: MeanAndSpreadScene): Handles | null {
      svg.textContent = '';
      const frame = scene.frame;
      if (frame === null) return null; // silent init 앞 — 수의 줄을 셈할 범위가 아직 없다
      const g = geometryOf(scene);
      const h: Handles = {
        dots: [],
        fulcrum: null,
        meanLine: null,
        band: null,
        tug: new Map(),
        tugNotes: [],
        squares: new Map(),
        varSquare: null,
        sdLines: [],
        sdLabel: null,
      };

      drawCaption(scene);

      const m = scene.mean;
      const sp = scene.spread;

      // 한 표준편차 띠 — 점 뒤에 깐다
      if (sp !== null) {
        h.band = make(svg, 'rect', {
          x: g.x(sp.bandLo),
          y: g.meanLabelY + 8,
          width: (sp.bandHi - sp.bandLo) * g.unit,
          height: AXIS_Y - g.meanLabelY - 8,
          fill: colors.border,
        });
      }

      // 평균 선
      if (m !== null) {
        const top = g.meanLabelY + 6;
        h.meanLine = make(svg, 'line', {
          x1: g.x(m.mean),
          y1: top,
          x2: g.x(m.mean),
          y2: TUG_Y - TUG_H / 2 - 18,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        text(svg, g.x(m.mean), g.meanLabelY, t('label.mean', 'μ = {v}', { v: formatNumber(m.mean) }), fontSizes.sm, colors.text, 'middle', 'bold');
      }

      // 저울대(수의 줄)와 눈금
      make(svg, 'line', {
        x1: g.x(frame.lo),
        y1: AXIS_Y,
        x2: g.x(frame.hi),
        y2: AXIS_Y,
        stroke: colors.text,
        'stroke-width': 2,
      });
      for (let v = Math.ceil(frame.lo); v <= frame.hi; v += 1) {
        make(svg, 'line', { x1: g.x(v), y1: AXIS_Y - 3, x2: g.x(v), y2: AXIS_Y + 3, stroke: colors.textMuted, 'stroke-width': 1 });
        text(svg, g.x(v), TICK_LABEL_Y, formatNumber(v), fontSizes.xs, colors.textMuted);
      }

      // 받침
      if (m !== null) {
        const cx = g.x(m.mean);
        h.fulcrum = make(svg, 'polygon', {
          points: `${r2(cx)},${AXIS_Y + 1} ${r2(cx - 10)},${AXIS_Y + 19} ${r2(cx + 10)},${AXIS_Y + 19}`,
          fill: colors.textMuted,
        });
      }

      // 값 여덟
      scene.values.forEach((v, i) => {
        let fill = colors.primary;
        let stroke = colors.bg;
        if (sp !== null) {
          const inside = sp.inside.includes(i);
          fill = inside ? colors.accent : colors.textMuted;
          stroke = inside ? colors.stateInk : colors.bg;
        }
        h.dots.push(make(svg, 'circle', { cx: g.x(v), cy: g.dotY(i), r: g.dotR, fill, stroke, 'stroke-width': 1.5 }));
      });

      // 한 표준편차 — 저울대 아래 받침 양쪽
      if (sp !== null && m !== null) {
        const halves: Array<[number, number]> = [
          [sp.bandLo, m.mean],
          [m.mean, sp.bandHi],
        ];
        for (const [a, b] of halves) {
          h.sdLines.push(
            make(svg, 'line', {
              x1: g.x(a) + 1,
              y1: SD_Y,
              x2: g.x(b) - 1,
              y2: SD_Y,
              stroke: colors.accent,
              'stroke-width': 5,
            }),
          );
        }
        h.sdLabel = text(svg, g.x(sp.bandHi) + 8, SD_Y + 4, t('label.sd', 'σ = {v}', { v: formatNumber(sp.sd) }), fontSizes.sm, colors.text, 'start', 'bold');
      }

      // 편차 사슬 — 받침 아래 한 줄에서 왼쪽과 오른쪽이 맞선다
      const d = scene.devs;
      if (d !== null && m !== null) {
        d.dev.forEach((dv, i) => {
          if (dv === 0) return; // 길이 0 인 편차는 사슬에 칸이 없다 — 위의 '0' 표로 센다
          const from = d.from[i];
          const to = d.to[i];
          if (from === undefined || to === undefined) throw new Error(`mean-and-spread-stage: 편차 ${i} 의 구간이 없다`);
          const rect = make(svg, 'rect', {
            x: g.x(from) + 1,
            y: TUG_Y - TUG_H / 2,
            width: Math.max(0, (to - from) * g.unit - 2),
            height: TUG_H,
            rx: 2,
            fill: inkOf(dv),
          });
          const label = text(svg, (g.x(from) + g.x(to)) / 2, TUG_Y + 4, formatNumber(dv), fontSizes.xs, colors.stateInk, 'middle', 'bold');
          h.tug.set(i, { rect, label });
        });
        const zeros = d.dev.filter((dv) => dv === 0).map(formatNumber);
        if (zeros.length > 0) {
          h.tugNotes.push(text(svg, g.x(m.mean), TUG_Y - TUG_H / 2 - 5, zeros.join(' '), fontSizes.xs, colors.text));
        }
        // 사슬의 두 끝은 칸의 구간에서 읽는다 — 합을 다시 더해 자리를 세지 않는다
        const chainLo = Math.min(...d.from);
        const chainHi = Math.max(...d.to);
        h.tugNotes.push(
          text(svg, g.x(chainLo) - 6, TUG_Y + 4, t('label.sum', 'Σ {v}', { v: formatNumber(d.left) }), fontSizes.sm, leftInk, 'end', 'bold'),
        );
        h.tugNotes.push(
          text(svg, g.x(chainHi) + 6, TUG_Y + 4, t('label.sum', 'Σ {v}', { v: formatNumber(d.right) }), fontSizes.sm, rightInk, 'start', 'bold'),
        );
      }

      // 제곱 — 편차 칸이 한 변인 정사각형
      const s = scene.squares;
      const vr = scene.variance;
      if (s !== null && d !== null) {
        s.sq.forEach((sq, i) => {
          if (sq === 0) return;
          const from = d.from[i];
          const to = d.to[i];
          const dv = d.dev[i];
          if (from === undefined || to === undefined || dv === undefined) {
            throw new Error(`mean-and-spread-stage: 제곱 ${i} 의 편차 칸이 없다`);
          }
          const side = (to - from) * g.unit;
          const ghost = vr !== null;
          const rect = make(svg, 'rect', {
            x: g.x(from) + 1,
            y: SQ_TOP,
            width: Math.max(0, side - 2),
            height: Math.max(0, side - 2),
            fill: ghost ? 'none' : fillOf(dv),
            stroke: ghost ? colors.textMuted : inkOf(dv),
            'stroke-width': ghost ? 1 : 1.5,
            ...(ghost ? { 'stroke-dasharray': '4 3' } : {}),
          });
          const size = `${r2(Math.min(parseFloat(fontSizes.lg), side * 0.4))}px`;
          const label = text(
            svg,
            g.x(from) + side / 2,
            SQ_TOP + side / 2 + parseFloat(size) * 0.35,
            formatNumber(sq),
            size,
            ghost ? colors.textMuted : colors.stateInk,
            'middle',
            'bold',
          );
          if (ghost && m !== null) {
            // 분산 정사각형 밑에 깔리는 흔적의 수는 가린다 — 반쯤 비친 글자가 분산으로 읽히지 않게
            const vSide = vr.side * g.unit;
            const vx0 = g.x(m.mean) - vSide / 2;
            const cx = g.x(from) + side / 2;
            const cy = SQ_TOP + side / 2;
            const pad = parseFloat(size);
            if (cx > vx0 - pad && cx < vx0 + vSide + pad && cy < SQ_TOP + vSide + pad) {
              label.setAttribute('visibility', 'hidden');
            }
          }
          h.squares.set(i, { rect, label });
        });
      }

      // 분산 — 부푼 것들의 평균, 넓이가 분산인 정사각형 하나
      if (vr !== null && m !== null) {
        const side = vr.side * g.unit;
        const x0 = g.x(m.mean) - side / 2;
        const rect = make(svg, 'rect', {
          x: x0,
          y: SQ_TOP,
          width: side,
          height: side,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1.5,
        });
        const label = text(svg, x0 + side / 2, SQ_TOP + side / 2 + 6, formatNumber(vr.variance), fontSizes.xl, colors.stateInk, 'middle', 'bold');
        h.varSquare = { rect, label };
      }

      return h;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.ceil(ms / FRAME_MS));
        let k = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          k += 1;
          const p = Math.min(1, k / total);
          frame(ease(p));
          if (p >= 1) {
            finish();
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

    function hide(nodes: Array<SVGElement | null>): void {
      for (const node of nodes) {
        if (node === null) throw new Error('mean-and-spread-stage: 숨길 손잡이가 없다');
        node.setAttribute('visibility', 'hidden');
      }
    }

    /** 받침이 저울대 아래에서 올라와 평균 자리에 선다. */
    async function moveMean(h: Handles, mine: number): Promise<void> {
      const fulcrum = h.fulcrum;
      const line = h.meanLine;
      if (fulcrum === null || line === null) throw new Error('mean-and-spread-stage: 받침 손잡이가 없다');
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      await tween(MOVE_MEAN_MS, mine, (p) => {
        fulcrum.setAttribute('transform', `translate(0 ${r2((1 - p) * 60)})`);
        line.setAttribute('y2', String(r2(mix(y1, y2, p))));
      });
    }

    /** 편차 칸이 제 점에서 떨어져 나와 받침 아래 줄에서 사슬로 잇는다. */
    async function moveDeviations(h: Handles, scene: MeanAndSpreadScene, mine: number): Promise<void> {
      const d = scene.devs;
      const m = scene.mean;
      if (d === null || m === null) throw new Error('mean-and-spread-stage: 편차 걸음에 편차가 없다');
      const g = geometryOf(scene);
      hide(h.tugNotes);
      const moves: Array<{ rect: SVGRectElement; label: SVGTextElement; x0: number; y0: number; x1: number; y1: number }> = [];
      for (const [i, cell] of h.tug) {
        const v = scene.values[i];
        const from = d.from[i];
        if (v === undefined || from === undefined) throw new Error(`mean-and-spread-stage: 편차 ${i} 의 값이 없다`);
        const start = Math.min(v, m.mean);
        moves.push({
          rect: cell.rect,
          label: cell.label,
          x0: g.x(start) + 1,
          y0: g.dotY(i) - TUG_H / 2,
          x1: g.x(from) + 1,
          y1: TUG_Y - TUG_H / 2,
        });
      }
      await tween(MOVE_DEV_MS, mine, (p) => {
        for (const mv of moves) {
          mv.rect.setAttribute('x', String(r2(mix(mv.x0, mv.x1, p))));
          mv.rect.setAttribute('y', String(r2(mix(mv.y0, mv.y1, p))));
          mv.label.setAttribute(
            'transform',
            `translate(${r2((mv.x0 - mv.x1) * (1 - p))} ${r2((mv.y0 - mv.y1) * (1 - p))})`,
          );
        }
      });
    }

    /** 편차 칸이 제 길이를 한 변으로 아래로 부푼다. */
    async function moveSquares(h: Handles, mine: number): Promise<void> {
      const cells = [...h.squares.values()].map((c) => ({
        rect: c.rect,
        label: c.label,
        full: Number(c.rect.getAttribute('height')),
      }));
      hide(cells.map((c) => c.label));
      await tween(MOVE_SQ_MS, mine, (p) => {
        for (const c of cells) c.rect.setAttribute('height', String(r2(c.full * p)));
      });
    }

    /** 정사각형들이 한자리로 모여 넓이가 그 평균인 정사각형 하나가 된다. */
    async function moveVariance(h: Handles, scene: MeanAndSpreadScene, mine: number): Promise<void> {
      const target = h.varSquare;
      const d = scene.devs;
      if (target === null || d === null) throw new Error('mean-and-spread-stage: 분산 정사각형 손잡이가 없다');
      hide([target.rect, target.label]);
      const tx = Number(target.rect.getAttribute('x'));
      const tw = Number(target.rect.getAttribute('width'));
      const movers: Array<{ node: SVGRectElement; x0: number; w0: number }> = [];
      for (const [i, cell] of h.squares) {
        const dv = d.dev[i];
        if (dv === undefined) throw new Error(`mean-and-spread-stage: 제곱 ${i} 의 편차가 없다`);
        const x0 = Number(cell.rect.getAttribute('x'));
        const w0 = Number(cell.rect.getAttribute('width'));
        const node = make(svg, 'rect', {
          x: x0,
          y: SQ_TOP,
          width: w0,
          height: w0,
          fill: fillOf(dv),
          stroke: inkOf(dv),
          'stroke-width': 1.5,
          'fill-opacity': 0.7,
        });
        movers.push({ node, x0, w0 });
      }
      await tween(MOVE_VAR_MS, mine, (p) => {
        for (const mv of movers) {
          const w = mix(mv.w0, tw, p);
          mv.node.setAttribute('x', String(r2(mix(mv.x0, tx, p))));
          mv.node.setAttribute('width', String(r2(w)));
          mv.node.setAttribute('height', String(r2(w)));
        }
      });
    }

    /** 분산 정사각형의 한 변이 저울대 아래로 올라가 평균 양쪽에 놓인다. */
    async function moveSpread(h: Handles, scene: MeanAndSpreadScene, mine: number): Promise<void> {
      const sq = h.varSquare;
      const sp = scene.spread;
      const m = scene.mean;
      if (sq === null || sp === null || m === null || h.sdLines.length !== 2) {
        throw new Error('mean-and-spread-stage: 표준편차 손잡이가 없다');
      }
      hide([...h.sdLines, h.sdLabel, h.band]);
      const g = geometryOf(scene);
      const ex0 = Number(sq.rect.getAttribute('x'));
      const ew = Number(sq.rect.getAttribute('width'));
      const ends: Array<[number, number]> = [
        [g.x(sp.bandLo) + 1, g.x(m.mean) - 1],
        [g.x(m.mean) + 1, g.x(sp.bandHi) - 1],
      ];
      const movers = ends.map(([a, b]) => ({
        node: make(svg, 'line', {
          x1: ex0,
          y1: SQ_TOP,
          x2: ex0 + ew,
          y2: SQ_TOP,
          stroke: colors.accent,
          'stroke-width': 5,
        }),
        a,
        b,
      }));
      await tween(MOVE_SD_MS, mine, (p) => {
        const y = String(r2(mix(SQ_TOP, SD_Y, p)));
        for (const mv of movers) {
          mv.node.setAttribute('x1', String(r2(mix(ex0, mv.a, p))));
          mv.node.setAttribute('x2', String(r2(mix(ex0 + ew, mv.b, p))));
          mv.node.setAttribute('y1', y);
          mv.node.setAttribute('y2', y);
        }
      });
    }

    const before: Record<MeanAndSpreadScene['step'], MeanAndSpreadScene['step'] | null> = {
      values: null,
      mean: 'values',
      deviations: 'mean',
      squares: 'deviations',
      variance: 'squares',
      spread: 'variance',
    };

    return {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || h === null) return;
        if (before[next.step] !== prev.step || prev.frame === null) return;
        switch (next.step) {
          case 'mean':
            await moveMean(h, mine);
            break;
          case 'deviations':
            await moveDeviations(h, next, mine);
            break;
          case 'squares':
            await moveSquares(h, mine);
            break;
          case 'variance':
            await moveVariance(h, next, mine);
            break;
          case 'spread':
            await moveSpread(h, next, mine);
            break;
          case 'values':
            return;
        }
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
