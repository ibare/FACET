/**
 * 뒤로 뛰면 반복 — 무대.
 *
 * 동사는 "방향이 짐작을 정한다". 프로그램 목록 오른쪽에 분기마다 화살이 휜다 — 뒤로 가는
 * 화살은 위로 크게, 앞으로 가는 화살은 아래로. 흐름(점)이 분기에 닿기 전에 그 화살의
 * 방향만 보고 짐작이 선다 (탄다면 화살이, 안 탄다면 다음 줄로 떨어지는 길이 굵어진다).
 * 그다음 점이 결과대로 **실제로 그 길을 탄다** — 반복이 돌 때마다 뒤로 가는 화살을
 * 되풀이해 타고 올라간다. 아래 판은 만난 분기마다 결과와 짐작을 쌓고, 끝에서 같은
 * 결과 열을 "언제나 안 탐" · "언제나 탐" 으로 짐작한 줄이 결과 줄에서 내려와 견준다.
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

import {
  jumpsBack,
  standingAt,
  type BackwardTakenScene,
  type Encounter,
  type SceneOutcome,
} from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms). */
const WALK_MS = 300;
const HOLD_MS = 200;
const RIDE_MS = 500;
const DROP_MS = 520;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 자리 셈 — 캔버스 폭과 세로에서 역산한다. */
function geometry(scene: BackwardTakenScene) {
  const W = PIECE_CANVAS_W;
  const n = Math.max(1, scene.program.length);
  const top = 34;
  const listBottom = 190;
  const gap = Math.min(30, (listBottom - top) / n);
  const lineY = (i: number) => top + i * gap;
  const rail = Math.min(350, W * 0.57);
  const room = W - rail - 96;
  const bulgeOf = (at: number, target: number) => Math.min(room, 40 + 36 * Math.abs(at - target));
  const boardX = 150;
  const total = Math.max(1, scene.total);
  const cellW = Math.min(52, Math.floor((W - boardX - 72) / total));
  const headerY = 216;
  const rowY = (r: number) => 238 + r * 26;
  return { W, n, gap, lineY, rail, bulgeOf, boardX, cellW, headerY, rowY };
}

type Geo = ReturnType<typeof geometry>;

/** 분기 화살 — 분기 줄에서 오른쪽으로 휘어 목표 줄로 든다. */
function arcPoints(g: Geo, at: number, target: number) {
  const y1 = g.lineY(at);
  const y2 = g.lineY(target);
  const b = g.bulgeOf(at, target);
  return { x0: g.rail, y1, cx: g.rail + b, y2 };
}

function onArc(g: Geo, at: number, target: number, p: number): [number, number] {
  const { x0, y1, cx, y2 } = arcPoints(g, at, target);
  const q = 1 - p;
  const x = q * q * q * x0 + 3 * q * q * p * cx + 3 * q * p * p * cx + p * p * p * x0;
  const y = q * q * q * y1 + 3 * q * q * p * y1 + 3 * q * p * p * y2 + p * p * p * y2;
  return [r2(x), r2(y)];
}

type Handles = {
  token: SVGCircleElement | null;
  drops: SVGGElement[];
};

export const backwardTakenStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<BackwardTakenScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const dir = categorical(2, 'vivid');
    const backColor = dir[0]!;
    const fwdColor = dir[1]!;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const alive = (mine: number) => mine === gen && !destroyed;

    function mark(o: SceneOutcome): string {
      return o === 'T' ? t('mark.T', 'T') : t('mark.N', 'N');
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (!alive(mine)) return finish();
        waiters.add(finish);
        const start = Date.now();
        const tick = () => {
          if (!alive(mine)) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    /**
     * 장면의 화면 전체. `before` 가 참이면 이번 분기의 결과가 아직 안 난 화면이다 —
     * 짐작은 서 있고, 점은 앞 걸음이 떨어진 자리에 있으며, 판과 화살 횟수에는 이번
     * 분기가 아직 없다. 운동이 그 자리에서 출발한다.
     */
    function drawStatic(scene: BackwardTakenScene, before: boolean): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      const current: Encounter | null =
        step && step.kind === 'branch' ? (scene.trail[step.index] ?? null) : null;
      const shown = current && before ? scene.trail.slice(0, -1) : scene.trail;

      // 이번 분기 줄의 띠
      if (current) {
        el(svg, 'rect', {
          x: 10,
          y: g.lineY(current.at) - g.gap / 2 + 2,
          width: g.rail + 14 - 10,
          height: g.gap - 4,
          rx: 4,
          fill: colors.bgSubtle,
        });
      }

      // 차례대로 흐르는 길 (레일)
      if (scene.program.length > 0) {
        el(svg, 'line', {
          x1: g.rail,
          y1: g.lineY(0),
          x2: g.rail,
          y2: g.lineY(g.n),
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 4',
        });
      }

      // 목록
      scene.program.forEach((ins, i) => {
        const y = g.lineY(i);
        el(svg, 'text', {
          x: 118,
          y,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }, String(i));
        if (ins.label) {
          el(svg, 'text', {
            x: 130,
            y,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          }, `${ins.label}:`);
        }
        el(svg, 'text', {
          x: 184,
          y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
          'font-weight': ins.target !== undefined ? 600 : 400,
        }, `${ins.op} ${ins.args}`);
        el(svg, 'circle', { cx: g.rail, cy: y, r: 2.5, fill: colors.border });
      });
      if (scene.program.length > 0) {
        el(svg, 'text', {
          x: 184,
          y: g.lineY(g.n),
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, t('label.exit', 'loop exit'));
      }

      // 짐작이 "안 탄다" 면 다음 줄로 떨어지는 길이 굵어진다
      if (current && current.guess === 'N') {
        el(svg, 'line', {
          x1: g.rail,
          y1: g.lineY(current.at),
          x2: g.rail,
          y2: g.lineY(current.at + 1),
          stroke: jumpsBack(current.at, current.target) ? backColor : fwdColor,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
      }

      // 분기 화살
      const bulges = scene.program.map((ins, i) => (ins.target === undefined ? 0 : g.bulgeOf(i, ins.target)));
      const outer = Math.max(0, ...bulges);
      scene.program.forEach((ins, i) => {
        if (ins.target === undefined) return;
        const back = jumpsBack(i, ins.target);
        const color = back ? backColor : fwdColor;
        const guessed = current !== null && current.at === i && current.guess === 'T';
        const { x0, y1, cx, y2 } = arcPoints(g, i, ins.target);
        el(svg, 'path', {
          d: `M ${r2(x0)} ${r2(y1)} C ${r2(cx)} ${r2(y1)} ${r2(cx)} ${r2(y2)} ${r2(x0 + 10)} ${r2(y2)}`,
          fill: 'none',
          stroke: color,
          'stroke-width': guessed ? 4 : 1.8,
        });
        el(svg, 'polygon', {
          points: `${r2(x0 + 2)},${r2(y2)} ${r2(x0 + 12)},${r2(y2 - 5)} ${r2(x0 + 12)},${r2(y2 + 5)}`,
          fill: color,
        });
        const rode = shown.filter((e) => e.at === i && e.outcome === 'T').length;
        const apex = x0 + 0.75 * (cx - x0);
        const isOuter = bulges[i] === outer;
        el(svg, 'text', {
          x: isOuter ? apex + 8 : apex - 8,
          y: (y1 + y2) / 2,
          'text-anchor': isOuter ? 'start' : 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: color,
        }, back ? t('arc.back', 'back ×{n}', { n: rode }) : t('arc.ahead', 'ahead ×{n}', { n: rode }));
      });

      // 짐작 표 — 분기 줄 왼쪽 끝. 화살의 색을 그대로 입는다
      if (current) {
        const color = jumpsBack(current.at, current.target) ? backColor : fwdColor;
        const y = g.lineY(current.at);
        el(svg, 'rect', { x: 14, y: y - 10, width: 80, height: 20, rx: 10, fill: color });
        el(svg, 'text', {
          x: 54,
          y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: colors.textInverse,
        }, t('badge.guess', 'guess {g}', { g: mark(current.guess) }));
      }

      // 흐름의 점
      let token: SVGCircleElement | null = null;
      if (scene.program.length > 0) {
        const at = current && before ? current.from : standingAt(scene);
        token = el(svg, 'circle', {
          cx: g.rail,
          cy: g.lineY(at),
          r: 7,
          fill: colors.primary,
          stroke: colors.bg,
          'stroke-width': 2,
        });
      }

      // 아래 판
      const drops: SVGGElement[] = [];
      if (scene.total > 0) {
        const cellX = (k: number) => g.boardX + k * g.cellW;
        const cw = g.cellW - 6;
        const cellText = (parent: Element, k: number, y: number, s: string, fill: string) =>
          el(parent, 'text', {
            x: cellX(k) + g.cellW / 2 - 3,
            y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': 700,
            fill,
          }, s);
        const rowLabel = (r: number, s: string) =>
          el(svg, 'text', {
            x: 18,
            y: g.rowY(r),
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.text,
          }, s);
        const rowCount = (r: number, a: number, n: number) =>
          el(svg, 'text', {
            x: g.W - 18,
            y: g.rowY(r),
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: colors.text,
          }, t('score', '{a}/{n}', { a, n }));

        if (current) {
          const k = scene.trail.indexOf(current);
          el(svg, 'rect', {
            x: cellX(k) - 2,
            y: g.headerY - 10,
            width: cw + 4,
            height: g.rowY(1) + 12 - (g.headerY - 10),
            rx: 5,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
          });
        }
        shown.forEach((e, k) => {
          el(svg, 'text', {
            x: cellX(k) + g.cellW / 2 - 3,
            y: g.headerY,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }, scene.program[e.at]?.op ?? '');
        });

        rowLabel(0, t('row.outcome', 'actual'));
        rowLabel(1, t('row.direction', 'by direction'));
        for (let k = 0; k < scene.total; k += 1) {
          for (const r of [0, 1]) {
            el(svg, 'rect', {
              x: cellX(k),
              y: g.rowY(r) - 10,
              width: cw,
              height: 20,
              rx: 3,
              fill: 'none',
              stroke: colors.border,
            });
          }
        }
        shown.forEach((e, k) => {
          el(svg, 'rect', { x: cellX(k), y: g.rowY(0) - 10, width: cw, height: 20, rx: 3, fill: colors.bgSubtle, stroke: colors.border });
          cellText(svg, k, g.rowY(0), mark(e.outcome), colors.text);
          const hit = e.guess === e.outcome;
          el(svg, 'rect', { x: cellX(k), y: g.rowY(1) - 10, width: cw, height: 20, rx: 3, fill: hit ? colors.success : colors.danger });
          cellText(svg, k, g.rowY(1), mark(e.guess), colors.textInverse);
        });
        const last = shown[shown.length - 1];
        if (last) rowCount(1, last.hits, shown.length);

        // 견줌 — 같은 결과 열을 방향 없이 짐작한 두 줄
        if (scene.tally) {
          const rules: Array<{ r: number; guess: SceneOutcome; label: string; hits: number }> = [
            { r: 2, guess: 'N', label: t('row.alwaysN', 'always N'), hits: scene.tally.alwaysN },
            { r: 3, guess: 'T', label: t('row.alwaysT', 'always T'), hits: scene.tally.alwaysT },
          ];
          for (const rule of rules) {
            rowLabel(rule.r, rule.label);
            const grp = el(svg, 'g', {});
            scene.trail.forEach((e, k) => {
              const hit = rule.guess === e.outcome;
              el(grp, 'rect', { x: cellX(k), y: g.rowY(rule.r) - 10, width: cw, height: 20, rx: 3, fill: hit ? colors.success : colors.danger });
              cellText(grp, k, g.rowY(rule.r), mark(rule.guess), colors.textInverse);
            });
            drops.push(grp);
            rowCount(rule.r, rule.hits, scene.tally.total);
          }
        }
      }

      // 캡션 — 지금 일어나는 일만
      const lines: string[] = [];
      if (step?.kind === 'start') {
        lines.push(t('caption.start', 'Each branch is guessed before it resolves, from the way its arrow points.'));
      } else if (current) {
        const vars = { op: scene.program[current.at]?.op ?? '', at: current.at, target: current.target };
        lines.push(
          current.guess === 'T'
            ? t('caption.back', '{op} at {at} jumps back to {target}: guess taken.', vars)
            : t('caption.ahead', '{op} at {at} jumps ahead to {target}: guess not taken.', vars),
        );
        if (!before) {
          const hit = current.guess === current.outcome;
          if (current.outcome === 'T') {
            lines.push(hit ? t('result.takenHit', 'It is taken. The guess was right.') : t('result.takenMiss', 'It is taken. The guess was wrong.'));
          } else {
            lines.push(hit ? t('result.notTakenHit', 'It falls through. The guess was right.') : t('result.notTakenMiss', 'It falls through. The guess was wrong.'));
          }
        }
      } else if (step?.kind === 'compare' && scene.tally) {
        const tl = scene.tally;
        lines.push(t('caption.compare', 'Guessing by direction alone: {a} of {n} right.', { a: tl.btfn, n: tl.total }));
        lines.push(t('caption.baseline', 'Ignoring direction: always taken {c} of {n}, always not taken {b} of {n}.', { b: tl.alwaysN, c: tl.alwaysT, n: tl.total }));
      }
      lines.forEach((s, i) => {
        el(svg, 'text', {
          x: g.W / 2,
          y: 350 + i * 20,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': i === 0 ? 600 : 400,
          fill: i === 0 ? colors.text : colors.textMuted,
        }, s);
      });

      return { token, drops };
    }

    async function playBranch(next: BackwardTakenScene, enc: Encounter, mine: number): Promise<void> {
      const g = geometry(next);
      const h = drawStatic(next, true);
      const token = h.token;
      if (token) {
        const y0 = g.lineY(enc.from);
        const y1 = g.lineY(enc.at);
        if (enc.from !== enc.at) {
          await tween(WALK_MS, mine, (p) => token.setAttribute('cy', String(r2(y0 + (y1 - y0) * p))));
          if (!alive(mine)) return;
        }
        await tween(HOLD_MS, mine, () => undefined);
        if (!alive(mine)) return;
        if (enc.outcome === 'T') {
          await tween(RIDE_MS, mine, (p) => {
            const [x, y] = onArc(g, enc.at, enc.target, p);
            token.setAttribute('cx', String(x));
            token.setAttribute('cy', String(y));
          });
        } else {
          const y2 = g.lineY(enc.at + 1);
          await tween(RIDE_MS, mine, (p) => token.setAttribute('cy', String(r2(y1 + (y2 - y1) * p))));
        }
        if (!alive(mine)) return;
      }
      drawStatic(next, false);
    }

    async function playCompare(next: BackwardTakenScene, mine: number): Promise<void> {
      const g = geometry(next);
      const h = drawStatic(next, false);
      // 결과 줄에서 제 줄로 내려온다 — 이미 끝 자리에 서 있으니 못 온 만큼만 끌어올린다
      const lifts = h.drops.map((grp, i) => ({ grp, dy: g.rowY(0) - g.rowY(i + 2) }));
      for (const { grp, dy } of lifts) grp.setAttribute('transform', `translate(0 ${r2(dy)})`);
      await tween(DROP_MS, mine, (p) => {
        for (const { grp, dy } of lifts) grp.setAttribute('transform', `translate(0 ${r2(dy * (1 - p))})`);
      });
      if (!alive(mine)) return;
      drawStatic(next, false);
    }

    drawStatic({ program: [], total: 0, trail: [], tally: null, step: null }, false);

    return {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || !step || step.kind === 'start') {
          drawStatic(next, false);
          return;
        }
        if (step.kind === 'branch') {
          const enc = next.trail[step.index];
          if (!enc) {
            drawStatic(next, false);
            return;
          }
          await playBranch(next, enc, mine);
          return;
        }
        await playCompare(next, mine);
      },
      destroy() {
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
