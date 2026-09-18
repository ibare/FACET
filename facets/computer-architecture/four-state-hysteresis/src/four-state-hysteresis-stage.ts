/**
 * 네 칸을 오간다 — 그림.
 *
 * 네 칸 사다리를 가로로 길게 편다. 칸(상태 0~3)은 가로줄이고, 줄 1 과 2 사이에
 * 가운데 선이 있다. 선 위는 T 짐작, 아래는 N 짐작 구역이다. 분기 하나마다 표시가
 * 한 칸 오른쪽 열로 건너간 뒤 결과대로 한 칸 오르거나 내린다. 끝 칸에서는 천장에
 * 부딪혀 되돌아온다. 표시가 가운데 선을 넘으면 짐작 구역의 음영이 함께 넘어간다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { BranchMark, FourStateHysteresisScene, Guess } from './scene.js';

const H = 266;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 한 걸음의 운동 길이. 앞 40% 는 옆 열로, 뒤 60% 는 위아래 칸으로. */
const MOVE_MS = 640;
const FRAME_MS = 16;
const SIDEWAYS = 0.4;

type Handles = {
  trace: SVGPathElement;
  marker: SVGCircleElement;
  zone: SVGRectElement;
};

function r(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(p: number): number {
  const q = Math.max(0, Math.min(1, p));
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

function narrow(raw: Record<string, unknown> | undefined): { cols: number } {
  const outcomes = raw && Array.isArray(raw.outcomes) ? raw.outcomes : [];
  return { cols: Math.max(1, outcomes.length) };
}

export const fourStateHysteresisStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<FourStateHysteresisScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const { cols } = narrow(params.initialData);

    // 자리 — 캔버스에서 역산한다.
    const edgeL = Math.round(W * 0.02);
    const edgeR = W - edgeL;
    const gutter = Math.round(W * 0.34);
    const plotL = gutter + Math.round(W * 0.025);
    const plotR = edgeR - Math.round(W * 0.02);
    const headY = 26;
    const rungTop = 62;
    const rungGap = 38;
    const lineY = rungTop + rungGap * 1.5;
    const zoneTopT = rungTop - rungGap / 2;
    const zoneH = rungGap * 2;
    const caption1Y = rungTop + rungGap * 3 + 46;
    const caption2Y = caption1Y + 22;
    const bump = rungGap * 0.28;

    const colX = (k: number, n: number): number => r(plotL + ((plotR - plotL) * k) / Math.max(1, n));
    const rungY = (state: number): number => r(rungTop + (3 - state) * rungGap);
    const zoneY = (g: Guess): number => r(g === 'T' ? zoneTopT : zoneTopT + zoneH);

    let destroyed = false;
    let gen = 0;
    let handles: Handles | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; anchor?: string; weight?: number; mono?: boolean },
    ): SVGTextElement {
      const node = el('text', {
        x: r(x),
        y: r(y),
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size,
        'font-weight': opts.weight ?? 400,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      node.textContent = content;
      return node;
    }

    const dirName = (g: Guess): string =>
      g === 'T' ? t('label.taken', 'T') : t('label.notTaken', 'N');

    const stateName = (s: number): string => {
      if (s >= 3) return t('label.state3', 'strongly taken');
      if (s === 2) return t('label.state2', 'weakly taken');
      if (s === 1) return t('label.state1', 'weakly not taken');
      return t('label.state0', 'strongly not taken');
    };

    /** 표시가 지나온 길. `upto` 개의 분기까지 다 그리고, 그 뒤 분기는 그리지 않는다. */
    function traceHead(scene: FourStateHysteresisScene, upto: number, n: number): string {
      let d = `M ${colX(0, n)} ${rungY(scene.start)}`;
      for (let k = 0; k < upto; k += 1) {
        const m = scene.marks[k] as BranchMark;
        d += ` H ${colX(k + 1, n)} V ${rungY(m.to)}`;
      }
      return d;
    }

    function captionLines(scene: FourStateHysteresisScene): [string, string] {
      const step = scene.step;
      const n = scene.outcomes.length;
      if (step && step.kind === 'done') {
        const miss = scene.tally ? scene.tally.misses : 0;
        const flips = scene.marks.filter((m) => m.next !== m.guess).length;
        return [
          t('caption.done', 'All {n} branches seen: {miss} wrong.', { n, miss }),
          t('caption.flips', 'The guess flipped {flips} times.', { flips }),
        ];
      }
      if (step && step.kind === 'branch') {
        const m = scene.marks[step.i];
        if (m) {
          const vars = {
            guess: dirName(m.guess),
            outcome: dirName(m.outcome),
            from: m.from,
            to: m.to,
            next: dirName(m.next),
          };
          const first = m.hit
            ? t('caption.right', 'Guessed {guess}, got {outcome}: right.', vars)
            : t('caption.wrong', 'Guessed {guess}, got {outcome}: wrong.', vars);
          let second: string;
          if (m.from === m.to) {
            second = t('caption.pinned', 'Already at the end rung: state stays {to}.', vars);
          } else if (m.next !== m.guess) {
            second = t('caption.cross', 'State {from} → {to} crosses the line: next guess {next}.', vars);
          } else if (m.hit) {
            second = t('caption.move', 'State {from} → {to}.', vars);
          } else {
            second = t('caption.hold', 'State {from} → {to}, line not crossed: guess stays {next}.', vars);
          }
          return [first, second];
        }
      }
      if (n === 0) return ['', ''];
      return [
        t('caption.start', 'Start at state {state}: {name}.', {
          state: scene.start,
          name: stateName(scene.start),
        }),
        t('caption.guess', 'Current guess: {dir}.', { dir: dirName(scene.startGuess) }),
      ];
    }

    function drawStatic(scene: FourStateHysteresisScene): void {
      svg.textContent = '';
      handles = null;
      const n = scene.outcomes.length || cols;
      const done = scene.marks.length;
      const current: Guess = done > 0 ? (scene.marks[done - 1] as BranchMark).next : scene.startGuess;
      const nowState = done > 0 ? (scene.marks[done - 1] as BranchMark).to : scene.start;

      // 짐작 구역 — 지금 짐작 쪽에 음영.
      const zone = el('rect', {
        x: edgeL,
        y: zoneY(current),
        width: r(edgeR - edgeL),
        height: r(zoneH),
        fill: c.accent,
        'fill-opacity': 0.16,
        rx: 4,
      });

      // 이번 분기의 열.
      const step = scene.step;
      if (step && step.kind === 'branch') {
        const x = colX(step.i + 1, n);
        const half = r((plotR - plotL) / Math.max(1, n) / 2);
        el('rect', {
          x: r(x - half),
          y: 10,
          width: r(half * 2),
          height: r(zoneTopT + zoneH * 2 - 10),
          fill: c.bgSubtle,
          'fill-opacity': 0.9,
        });
      }

      // 짐작 이름 — 가운데 선의 위와 아래.
      for (const g of ['T', 'N'] as const) {
        label(edgeL + 8, zoneY(g) + zoneH / 2, t('label.guess', 'guess {dir}', { dir: dirName(g) }), {
          size: fontSizes.sm,
          fill: g === current ? c.text : c.textMuted,
          weight: g === current ? 700 : 400,
        });
      }

      // 칸 — 가로줄과 이름.
      for (let s = 3; s >= 0; s -= 1) {
        const y = rungY(s);
        el('line', {
          x1: plotL - 6,
          y1: y,
          x2: plotR + 6,
          y2: y,
          stroke: c.border,
          'stroke-width': 1,
        });
        label(gutter - 4, y, t('label.rung', '{n} · {name}', { n: s, name: stateName(s) }), {
          size: fontSizes.xs,
          fill: s === nowState ? c.text : c.textMuted,
          anchor: 'end',
          weight: s === nowState ? 600 : 400,
        });
      }

      // 가운데 선.
      el('line', {
        x1: edgeL,
        y1: r(lineY),
        x2: edgeR,
        y2: r(lineY),
        stroke: c.text,
        'stroke-width': 1.5,
        'stroke-dasharray': '6 4',
      });

      // 결과 열 — 지나간 것은 맞음·틀림으로, 남은 것은 흐리게.
      for (let k = 0; k < scene.outcomes.length; k += 1) {
        const m = scene.marks[k];
        const o = scene.outcomes[k] as Guess;
        label(colX(k + 1, n), headY, dirName(o), {
          size: fontSizes.md,
          fill: m ? (m.hit ? c.text : c.danger) : c.textMuted,
          anchor: 'middle',
          weight: m ? 700 : 400,
          mono: true,
        });
      }

      // 지나온 길.
      const trace = el('path', {
        d: traceHead(scene, done, n),
        fill: 'none',
        stroke: c.text,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      });
      el('circle', { cx: colX(0, n), cy: rungY(scene.start), r: 3, fill: c.text });
      for (let k = 0; k < done - 1; k += 1) {
        const m = scene.marks[k] as BranchMark;
        el('circle', {
          cx: colX(k + 1, n),
          cy: rungY(m.to),
          r: 3,
          fill: m.hit ? c.text : c.danger,
        });
      }

      // 표시.
      const marker = el('circle', {
        cx: colX(done, n),
        cy: rungY(nowState),
        r: 8,
        fill: c.accent,
        stroke: c.text,
        'stroke-width': 1.5,
      });

      // 틀린 수.
      const miss = scene.marks.filter((m) => !m.hit).length;
      if (scene.outcomes.length > 0) {
        label(edgeL + 8, headY, t('label.tally', 'wrong {miss}', { miss }), {
          size: fontSizes.sm,
          fill: miss > 0 ? c.danger : c.textMuted,
          weight: 600,
        });
      }

      const [line1, line2] = captionLines(scene);
      label(W / 2, caption1Y, line1, { size: fontSizes.md, fill: c.text, anchor: 'middle', weight: 600 });
      label(W / 2, caption2Y, line2, { size: fontSizes.sm, fill: c.textMuted, anchor: 'middle' });

      handles = { trace, marker, zone };
    }

    function tween(ms: number, frame: (p: number) => void): Promise<void> {
      const total = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let f = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        frame(0);
        const tick = (): void => {
          if (destroyed) return finish();
          f += 1;
          frame(f / total);
          if (f >= total) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function stepAcross(scene: FourStateHysteresisScene, index: number, mine: number): Promise<void> {
      const m = scene.marks[index];
      const h = handles;
      if (!m || !h) return;
      const n = scene.outcomes.length || cols;
      const xPrev = colX(index, n);
      const xNow = colX(index + 1, n);
      const yFrom = rungY(m.from);
      const yTo = rungY(m.to);
      const head = traceHead(scene, index, n);
      const pinned = m.from === m.to;
      const outward = m.outcome === 'T' ? -1 : 1;
      const flips = m.next !== m.guess;
      const zoneShift = r(zoneY(m.guess) - zoneY(m.next));

      await tween(MOVE_MS, (p) => {
        if (mine !== gen || destroyed) return;
        const a = ease(p / SIDEWAYS);
        const b = ease((p - SIDEWAYS) / (1 - SIDEWAYS));
        const x = xPrev + (xNow - xPrev) * a;
        let y: number;
        if (pinned) y = b >= 1 || b <= 0 ? yTo : yTo + outward * bump * Math.sin(Math.PI * b);
        else y = yFrom + (yTo - yFrom) * b;
        h.marker.setAttribute('transform', `translate(${r(x - xNow)} ${r(y - yTo)})`);
        const tail = p < SIDEWAYS ? ` H ${r(x)}` : ` H ${xNow} V ${r(pinned ? yTo : y)}`;
        h.trace.setAttribute('d', head + tail);
        if (flips) h.zone.setAttribute('transform', `translate(0 ${r(zoneShift * (1 - b))})`);
      });
    }

    return {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || destroyed) return;
        const step = next.step;
        if (!step || step.kind !== 'branch') return;
        // prev 는 흘릴지 고르는 데만 — 바로 앞 분기에서 온 걸음만 흘린다.
        if (!prev || prev.marks.length !== next.marks.length - 1) return;
        await stepAcross(next, step.i, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        handles = null;
        svg.textContent = '';
      },
    };
  },
};
