/**
 * bisect-halving 무대.
 *
 * 줄기 하나에 커밋이 놓이고, 후보 범위가 띠로 감싼다. 시험 걸음에는 가운데 커밋이 줄기에서 **들려 올라가**
 * 시험대에 서고, 치른 시험 한 칸이 시험대에서 **아래 장부로 내려와 쌓인다.** 버림 걸음에는 빠지는 쪽 커밋들이
 * 줄기 아래로 **가라앉고** 후보 띠가 남은 쪽으로 **오그라든다.**
 */
import {
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
import type { BisectHalvingScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 330;
const W = PIECE_CANVAS_W;
const MARGIN = 30;

const CAPTION_Y = 24;
const BENCH_Y = 64;
const LINE_Y = 150;
const SUNK_Y = 212;
const STAT_Y = 266;
const LEDGER_TOP = 276;
const LEDGER_H = 38;
const LEDGER_GAP = 8;

const RISE_MS = 440;
const SETTLE_MS = 380;
const DROP_MS = 560;
const FOUND_MS = 420;
const ANSWER_SCALE = 1.35;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);

const r2 = (v: number): number => {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
};

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** 줄기 위 자리와 크기 — 캔버스 폭에서 역산한다. */
function geometry(n: number): { x: (i: number) => number; r: number } {
  const span = W - 2 * MARGIN;
  const gap = n > 1 ? span / (n - 1) : span;
  return { x: (i: number) => MARGIN + i * gap, r: Math.min(13, gap * 0.36) };
}

type Drawn = {
  nodes: Map<number, SVGGElement>;
  band: SVGRectElement;
  bandLabel: SVGTextElement;
  ledger: SVGGElement[];
};

export const bisectHalvingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const verdictWord = (v: 'good' | 'bad'): string =>
      v === 'good' ? t('verdict.good', 'good') : t('verdict.bad', 'bad');

    const rangeText = (s: BisectHalvingScene, from: number, to: number): string =>
      from === to ? s.commits[from]! : t('fmt.range', '{first}..{last}', { first: s.commits[from]!, last: s.commits[to]! });

    function caption(s: BisectHalvingScene): string {
      const step = s.step;
      if (step === null) {
        return t('caption.start', 'Known ends — good: {good} · bad: {bad}', {
          good: s.commits[s.verdicts[0]!.at]!,
          bad: s.commits[s.verdicts[1]!.at]!,
        });
      }
      if (step.kind === 'test') {
        return t('caption.test', 'Take out {commit}, build, run the tests → {verdict}', {
          commit: s.commits[step.at]!,
          verdict: verdictWord(step.verdict),
        });
      }
      if (step.kind === 'drop') {
        const range = rangeText(s, step.from, step.to);
        return step.verdict === 'good'
          ? t('caption.dropGood', '{commit} is good — it and everything before it leave: {range}', {
              commit: s.commits[step.at]!,
              range,
            })
          : t('caption.dropBad', '{commit} is bad — everything after it leaves: {range}', {
              commit: s.commits[step.at]!,
              range,
            });
      }
      return t('caption.found', 'One candidate left — first broken commit: {commit}', { commit: s.commits[step.at]! });
    }

    function ledgerWidth(s: BisectHalvingScene): number {
      // 가장 많이 치를 시험 수(후보를 반씩 가를 때)로 칸 폭을 정한다 — 상한만 둔다.
      // 바탕(줄기 길이)에서만 정해 걸음마다 폭이 바뀌지 않게 한다.
      const cap = Math.max(1, s.tests.length, Math.ceil(Math.log2(Math.max(2, s.commits.length - 1))));
      return Math.min(130, (W - 2 * MARGIN - (cap - 1) * LEDGER_GAP) / cap);
    }

    function bandSpan(s: BisectHalvingScene, good: number, bad: number): { x0: number; x1: number } {
      const g = geometry(s.commits.length);
      return { x0: g.x(good + 1) - g.r - 6, x1: g.x(bad) + g.r + 6 };
    }

    function rowY(s: BisectHalvingScene, i: number): number {
      if (s.bench === i) return BENCH_Y;
      return i <= s.good || i > s.bad ? SUNK_Y : LINE_Y;
    }

    function drawStatic(s: BisectHalvingScene): Drawn {
      svg.textContent = '';
      const n = s.commits.length;
      const g = geometry(n);
      const known = new Map<number, 'good' | 'bad'>();
      for (const m of s.verdicts) known.set(m.at, m.verdict);

      el(svg, 'text', {
        x: MARGIN,
        y: CAPTION_Y,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      }, caption(s));

      // 후보 띠
      const span = bandSpan(s, s.good, s.bad);
      const bandTop = LINE_Y - g.r - 20;
      const band = el(svg, 'rect', {
        x: span.x0,
        y: bandTop,
        width: span.x1 - span.x0,
        height: 2 * g.r + 40,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      const bandLabel = el(svg, 'text', {
        x: (span.x0 + span.x1) / 2,
        y: bandTop - 6,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      }, t('label.candidates', 'Candidates: {n}', { n: s.bad - s.good }));

      // 이력 줄기 (자리)
      el(svg, 'line', {
        x1: g.x(0),
        y1: LINE_Y,
        x2: g.x(n - 1),
        y2: LINE_Y,
        stroke: c.border,
        'stroke-width': 2,
      });

      // 시험대로 꺼낸 커밋의 빈 자리
      if (s.bench !== null) {
        el(svg, 'circle', {
          cx: g.x(s.bench),
          cy: LINE_Y,
          r: g.r,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        });
      }

      const nodes = new Map<number, SVGGElement>();
      for (let i = 0; i < n; i += 1) {
        const y = rowY(s, i);
        const out = y === SUNK_Y;
        const verdict = known.get(i);
        const isAnswer = s.answer === i;
        const onBench = s.bench === i;
        const r = isAnswer ? g.r * ANSWER_SCALE : g.r;
        const grp = el(svg, 'g', { transform: `translate(${r2(g.x(i))},${r2(y)})` });

        let fill = out ? c.bgSubtle : c.bg;
        let stroke = out ? c.textMuted : c.text;
        let ink = out ? c.textMuted : c.text;
        if (verdict === 'bad') {
          fill = c.danger;
          stroke = c.danger;
          ink = c.stateInk;
        }
        if (isAnswer) {
          fill = c.accent;
          stroke = c.danger;
          ink = c.stateInk;
        }
        el(grp, 'circle', {
          cx: 0,
          cy: 0,
          r,
          fill,
          stroke: onBench ? c.accent : stroke,
          'stroke-width': onBench ? 4 : verdict === 'good' ? 2.5 : 1.5,
          opacity: out && verdict !== 'bad' ? 0.75 : 1,
        });
        el(grp, 'text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: ink,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': verdict || isAnswer ? 700 : 400,
        }, s.commits[i]!);

        if (isAnswer) {
          el(grp, 'text', {
            x: 0,
            y: r + XS + 2,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 700,
          }, t('label.firstBad', 'first broken'));
        } else if (verdict) {
          el(grp, 'text', {
            x: 0,
            y: r + XS + 1,
            'text-anchor': 'middle',
            fill: verdict === 'bad' ? c.danger : c.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': 700,
          }, verdictWord(verdict));
        }
        if (onBench) {
          el(grp, 'text', {
            x: 0,
            y: -r - 8,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          }, t('label.bench', 'under test'));
        }
        nodes.set(i, grp);
      }

      // 치른 값 — 수와 장부
      el(svg, 'text', {
        x: MARGIN,
        y: STAT_Y,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
      }, t('stat.tests', 'Tests: {n}', { n: s.tests.length }));
      el(svg, 'text', {
        x: MARGIN + SM * 10,
        y: STAT_Y,
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
      }, t('stat.minutes', 'Minutes: {n}', { n: s.minutes }));

      const bw = ledgerWidth(s);
      const ledger: SVGGElement[] = [];
      s.tests.forEach((m, k) => {
        const bx = MARGIN + k * (bw + LEDGER_GAP);
        const blk = el(svg, 'g', { transform: `translate(${r2(bx)},${LEDGER_TOP})` });
        el(blk, 'rect', {
          x: 0,
          y: 0,
          width: bw,
          height: LEDGER_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: m.verdict === 'bad' ? c.danger : c.text,
          'stroke-width': m.verdict === 'bad' ? 2 : 1.5,
        });
        el(blk, 'text', {
          x: 8,
          y: SM + 4,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        }, s.commits[m.at]!);
        el(blk, 'text', {
          x: bw - 8,
          y: SM + 4,
          'text-anchor': 'end',
          fill: m.verdict === 'bad' ? c.danger : c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        }, verdictWord(m.verdict));
        el(blk, 'text', {
          x: 8,
          y: LEDGER_H - 7,
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        }, t('ledger.minutes', '+{n} min', { n: s.testMinutes }));
        ledger.push(blk);
      });

      return { nodes, band, bandLabel, ledger };
    }

    /** 한 시계로 흘린다. 세대가 바뀌거나 거둬지면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
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

    const place = (node: Element, x: number, y: number, s = 1): void => {
      node.setAttribute('transform', s === 1 ? `translate(${r2(x)},${r2(y)})` : `translate(${r2(x)},${r2(y)}) scale(${r2(s)})`);
    };
    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
    const phase = (p: number, a: number, b: number): number => ease(Math.min(1, Math.max(0, (p - a) / (b - a))));

    async function animate(next: BisectHalvingScene, d: Drawn, mine: number): Promise<void> {
      const step = next.step;
      if (step === null) return;
      const g = geometry(next.commits.length);

      if (step.kind === 'test') {
        // 줄기에서 들려 올라가 시험대에 서고, 치른 한 칸이 시험대에서 장부로 내려온다.
        const node = d.nodes.get(step.at);
        const blk = d.ledger[d.ledger.length - 1];
        if (!node || !blk) throw new Error('bisect-halving-stage: 시험 걸음의 커밋 · 장부 칸이 그려지지 않았다');
        const x = g.x(step.at);
        const bw = ledgerWidth(next);
        const bx = MARGIN + (d.ledger.length - 1) * (bw + LEDGER_GAP);
        const sx = x - bw / 2;
        const sy = BENCH_Y - LEDGER_H / 2;
        const total = RISE_MS + SETTLE_MS;
        const cut = RISE_MS / total;
        await tween(total, mine, (p) => {
          const a = phase(p, 0, cut);
          const b = phase(p, cut, 1);
          place(node, x, lerp(LINE_Y, BENCH_Y, a));
          if (p < cut) blk.setAttribute('visibility', 'hidden');
          else blk.removeAttribute('visibility');
          place(blk, lerp(sx, bx, b), lerp(sy, LEDGER_TOP, b));
        });
        return;
      }

      if (step.kind === 'drop') {
        // 빠지는 쪽이 가라앉고, 시험대의 커밋은 제 자리로 내려오고, 후보 띠가 오그라든다.
        const from = bandSpan(next, step.wasGood, step.wasBad);
        const to = bandSpan(next, next.good, next.bad);
        const moving: Array<{ node: Element; x: number; y0: number; y1: number }> = [];
        for (let i = step.from; i <= step.to; i += 1) {
          if (i === step.at) continue;
          const node = d.nodes.get(i);
          if (!node) throw new Error(`bisect-halving-stage: 커밋 ${i} 가 그려지지 않았다`);
          moving.push({ node, x: g.x(i), y0: LINE_Y, y1: SUNK_Y });
        }
        const benchNode = d.nodes.get(step.at);
        if (!benchNode) throw new Error('bisect-halving-stage: 시험대의 커밋이 그려지지 않았다');
        moving.push({ node: benchNode, x: g.x(step.at), y0: BENCH_Y, y1: rowY(next, step.at) });
        await tween(DROP_MS, mine, (p) => {
          const e = ease(p);
          for (const m of moving) place(m.node, m.x, lerp(m.y0, m.y1, e));
          const x0 = lerp(from.x0, to.x0, e);
          const x1 = lerp(from.x1, to.x1, e);
          d.band.setAttribute('x', String(r2(x0)));
          d.band.setAttribute('width', String(r2(x1 - x0)));
          d.bandLabel.setAttribute('x', String(r2((x0 + x1) / 2)));
        });
        return;
      }

      // 답: 남은 하나가 부풀어 오른다.
      const node = d.nodes.get(step.at);
      if (!node) throw new Error('bisect-halving-stage: 답 커밋이 그려지지 않았다');
      const x = g.x(step.at);
      await tween(FOUND_MS, mine, (p) => {
        place(node, x, LINE_Y, lerp(1 / ANSWER_SCALE, 1, ease(p)));
      });
    }

    return {
      async render(next: BisectHalvingScene, _prev: BisectHalvingScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animate(next, drawn, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    } as ViewInstance;
  },
};
