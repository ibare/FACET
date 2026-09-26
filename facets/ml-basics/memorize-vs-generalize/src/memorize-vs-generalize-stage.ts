import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate, ViewInstance } from '@ffacet/core/runtime';
import type { Answerer, Label, Phase } from './algorithm.js';
import type { MemorizeVsGeneralizeScene } from './scene.js';

const H = 372;
const NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;

// 수직선
const AXIS_Y = 104;
const AXIS_PAD = 44;
const DOT_R = 10;
// 답안자 자리 둘 (위가 앞선 쪽)
const HEADER_Y = 170;
const ROW_Y: readonly [number, number] = [214, 276];
const ROW_H = 52;
const CAPTION_Y = 344;

type Colors = Palette;

type Built = {
  pin: SVGGElement | null;
  arc: SVGPathElement | null;
  ring: SVGCircleElement | null;
  rows: Record<Answerer, SVGGElement>;
  /** 이번 걸음에 한 칸 나아간 토큰과 그 출발 · 도착 x */
  tokens: { el: SVGCircleElement; from: number; to: number }[];
};

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function write(
  parent: Element,
  s: string,
  x: number,
  y: number,
  opt: { size?: string; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r2(x),
    y: r2(y),
    fill: opt.fill,
    'font-family': opt.mono === true ? fonts.mono : fonts.body,
    'font-size': opt.size ?? fontSizes.sm,
    'text-anchor': opt.anchor ?? 'start',
    'dominant-baseline': 'central',
  });
  if (opt.weight !== undefined) node.setAttribute('font-weight', String(opt.weight));
  node.textContent = s;
  return node;
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fx(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function fx1(v: number): string {
  return v.toFixed(1);
}

function ease(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function span(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}

/** 트랙 칸 자리 — 캔버스 폭에서 역산한다 */
function trackGeom(): { seenX0: number; freshX0: number; slot: number; scoreGap: number } {
  const seenX0 = 222;
  const right = PIECE_CANVAS_W - 18;
  const scoreGap = 20;
  const scoreW = 30 + scoreGap;
  const gap = 14;
  const slot = Math.min(32, (right - seenX0 - 2 * scoreW - gap) / 11);
  return { seenX0, freshX0: seenX0 + 6 * slot + scoreW + gap, slot, scoreGap };
}

function classFill(y: Label, c: Colors): { fill: string; ink: string; stroke: string } {
  return y === 1
    ? { fill: c.text, ink: c.textInverse, stroke: c.text }
    : { fill: c.bg, ink: c.text, stroke: c.textMuted };
}

export const memorizeVsGeneralizeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [memoColor, ruleColor] = categorical(2, 'vivid');
    if (memoColor === undefined || ruleColor === undefined) throw new Error('categorical(2): 색이 둘이 아니다');
    const who: Record<Answerer, string> = { memo: memoColor, rule: ruleColor };

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function nameOf(a: Answerer): string {
      return a === 'memo' ? t('label.memo', 'Memorizer') : t('label.rule', 'Learner');
    }

    function drawStatic(s: MemorizeVsGeneralizeScene): Built | null {
      svg.textContent = '';
      if (s.threshold === null || s.axis === null) return null;
      const axis = s.axis;
      const threshold = s.threshold;
      const X0 = AXIS_PAD;
      const X1 = PIECE_CANVAS_W - AXIS_PAD;
      const px = (v: number): number => X0 + ((v - axis.min) / (axis.max - axis.min)) * (X1 - X0);
      const step = s.step;

      // ── 수직선과 눈금
      const line = el(svg, 'g', {});
      el(line, 'line', { x1: X0 - 12, y1: AXIS_Y, x2: X1 + 12, y2: AXIS_Y, stroke: c.border, 'stroke-width': 2 });
      for (let v = Math.ceil(axis.min); v <= axis.max; v += 1) {
        el(line, 'line', { x1: r2(px(v)), y1: AXIS_Y - 4, x2: r2(px(v)), y2: AXIS_Y + 4, stroke: c.border });
        write(line, String(v), px(v), AXIS_Y + 22, { fill: c.textMuted, size: fontSizes.xs, anchor: 'middle' });
      }

      // ── 배운 쪽의 문턱 — 왼쪽은 0, 오른쪽은 1
      const tx = px(threshold);
      el(line, 'line', {
        x1: r2(tx), y1: AXIS_Y - 56, x2: r2(tx), y2: AXIS_Y + 40,
        stroke: ruleColor, 'stroke-width': 2, 'stroke-dasharray': '5 4',
      });
      write(line, t('label.threshold', 't = {t}', { t: fx(threshold) }), tx, AXIS_Y - 70, {
        fill: ruleColor, anchor: 'middle', weight: 600, mono: true,
      });
      write(line, '0', tx - 10, AXIS_Y - 50, { fill: ruleColor, anchor: 'end', size: fontSizes.xs, mono: true });
      write(line, '1', tx + 10, AXIS_Y - 50, { fill: ruleColor, anchor: 'start', size: fontSizes.xs, mono: true });

      // ── 지나간 새 문제 — 작은 표식으로 남는다
      const freshAsked = Math.max(0, s.asked - s.seen.length);
      const currentFresh = step !== null && step.phase === 'fresh' ? step.index : -1;
      for (let i = 0; i < freshAsked; i += 1) {
        if (i === currentFresh) continue;
        const q = s.fresh[i];
        if (q === undefined) throw new Error(`fresh[${i}]: 물은 새 문제가 바탕에 없다`);
        const qx = px(q.x);
        el(line, 'path', {
          d: `M ${r2(qx - 5)} ${AXIS_Y - 16} L ${r2(qx + 5)} ${AXIS_Y - 16} L ${r2(qx)} ${AXIS_Y - 8} Z`,
          fill: c.textMuted,
        });
      }

      // ── 외운 쪽이 찾은 가까운 예
      let arc: SVGPathElement | null = null;
      let ring: SVGCircleElement | null = null;
      if (step !== null) {
        const qx = px(step.x);
        const nx = px(step.memo.near);
        if (step.x === step.memo.near) {
          ring = el(line, 'circle', {
            cx: r2(nx), cy: AXIS_Y, r: DOT_R + 5, fill: 'none', stroke: memoColor, 'stroke-width': 2.5,
          });
        } else {
          const midX = (qx + nx) / 2;
          const depth = Math.min(40, 10 + Math.abs(nx - qx) * 0.7);
          arc = el(line, 'path', {
            d: `M ${r2(qx)} ${AXIS_Y + 4} Q ${r2(midX)} ${r2(AXIS_Y + 4 + 2 * depth)} ${r2(nx)} ${AXIS_Y + DOT_R + 2}`,
            fill: 'none', stroke: memoColor, 'stroke-width': 2.5, 'stroke-linecap': 'round', pathLength: 1,
          });
        }
      }

      // ── 본 것 여섯 — 외운 쪽의 표이자 배운 쪽이 문턱을 고른 자료
      for (const e of s.seen) {
        const k = classFill(e.y, c);
        const x = px(e.x);
        el(line, 'circle', { cx: r2(x), cy: AXIS_Y, r: DOT_R, fill: k.fill, stroke: k.stroke, 'stroke-width': 1.5 });
        write(line, String(e.y), x, AXIS_Y + 0.5, { fill: k.ink, anchor: 'middle', size: fontSizes.xs, weight: 700, mono: true });
      }

      // ── 이번 문제 — 핀이 수직선 위로 내려온다
      let pin: SVGGElement | null = null;
      if (step !== null) {
        const qx = px(step.x);
        pin = el(svg, 'g', {});
        el(pin, 'path', {
          d: `M ${r2(qx - 7)} ${AXIS_Y - 26} L ${r2(qx + 7)} ${AXIS_Y - 26} L ${r2(qx)} ${AXIS_Y - 13} Z`,
          fill: c.accent, stroke: c.text, 'stroke-width': 1.2, 'stroke-linejoin': 'round',
        });
        write(pin, t('label.question', 'x = {x}', { x: fx1(step.x) }), qx, AXIS_Y - 36, {
          fill: c.text, anchor: 'middle', weight: 600, mono: true,
        });
      }

      // ── 답안자 자리
      const g = trackGeom();
      const activePhase: Phase | null = step === null ? null : step.phase;
      write(svg, t('label.seen', 'Seen questions'), g.seenX0 + 3 * g.slot, HEADER_Y, {
        fill: activePhase === 'seen' ? c.text : c.textMuted, anchor: 'middle', weight: activePhase === 'seen' ? 600 : 400,
      });
      write(svg, t('label.fresh', 'New questions'), g.freshX0 + 2.5 * g.slot, HEADER_Y, {
        fill: activePhase === 'fresh' ? c.text : c.textMuted, anchor: 'middle', weight: activePhase === 'fresh' ? 600 : 400,
      });

      const rows = {} as Record<Answerer, SVGGElement>;
      const tokens: Built['tokens'] = [];
      s.order.forEach((a, slotIndex) => {
        const y = ROW_Y[slotIndex === 0 ? 0 : 1];
        const row = el(svg, 'g', { transform: `translate(0 ${y})` });
        rows[a] = row;
        el(row, 'rect', {
          x: 8, y: -ROW_H / 2, width: PIECE_CANVAS_W - 16, height: ROW_H, rx: 8,
          fill: c.bgSubtle, stroke: c.border,
        });
        el(row, 'rect', { x: 8, y: -ROW_H / 2, width: 5, height: ROW_H, rx: 2, fill: who[a] });
        write(row, nameOf(a), 22, -7, { fill: c.text, size: fontSizes.md, weight: 600 });

        // 지금 쪽에서 앞서 있으면 그 표를 단다
        if (activePhase !== null) {
          const sc = s.hits[activePhase];
          const other: Answerer = a === 'memo' ? 'rule' : 'memo';
          if (sc[a] > sc[other]) {
            const tag = t('label.ahead', 'Ahead');
            const tagW = Math.max(36, tag.length * parseFloat(fontSizes.xs) * 0.62 + 14);
            el(row, 'rect', { x: 22, y: 5, width: r2(tagW), height: 16, rx: 8, fill: c.accent });
            write(row, tag, 22 + tagW / 2, 13, { fill: c.stateInk, anchor: 'middle', size: fontSizes.xs, weight: 600 });
          }
        }

        // 이번 답
        if (step !== null) {
          const guess = a === 'memo' ? step.memo.guess : step.rule.guess;
          const right = a === 'memo' ? step.memo.right : step.rule.right;
          const k = classFill(guess, c);
          const bx = 146;
          el(row, 'circle', {
            cx: bx, cy: 0, r: 12, fill: k.fill,
            stroke: right ? k.stroke : c.danger, 'stroke-width': right ? 1.5 : 3,
          });
          write(row, String(guess), bx, 0.5, { fill: k.ink, anchor: 'middle', weight: 700, mono: true });
          write(row, right ? t('label.right', 'Right') : t('label.wrong', 'Wrong'), bx + 18, 0, {
            fill: right ? c.text : c.danger, weight: right ? 400 : 700,
          });
        }

        // 두 경주 — 본 문제 칸 여섯, 새 문제 칸 다섯. 토큰은 맞힌 수만큼 나아간다
        const tracks: { phase: Phase; x0: number; total: number }[] = [
          { phase: 'seen', x0: g.seenX0, total: s.seen.length },
          { phase: 'fresh', x0: g.freshX0, total: s.fresh.length },
        ];
        for (const track of tracks) {
          const started = track.phase === 'seen' ? step !== null : activePhase === 'fresh';
          const hitsN = s.hits[track.phase][a];
          const xEnd = track.x0 + track.total * g.slot;
          el(row, 'line', {
            x1: track.x0, y1: 0, x2: r2(xEnd), y2: 0,
            stroke: c.border, 'stroke-width': 2,
          });
          for (let i = 0; i <= track.total; i += 1) {
            const sx = track.x0 + i * g.slot;
            el(row, 'line', { x1: r2(sx), y1: -4, x2: r2(sx), y2: 4, stroke: c.border });
          }
          write(row, t('label.score', '{n}/{total}', { n: hitsN, total: track.total }), xEnd + g.scoreGap, 0, {
            fill: started ? c.text : c.textMuted, weight: started ? 600 : 400, mono: true,
          });
          const tokX = track.x0 + hitsN * g.slot;
          const tok = el(row, 'circle', {
            cx: r2(tokX), cy: 0, r: 8,
            fill: started ? who[a] : c.bg, stroke: who[a], 'stroke-width': 2,
          });
          if (step !== null && step.phase === track.phase) {
            const right = a === 'memo' ? step.memo.right : step.rule.right;
            if (right) tokens.push({ el: tok, from: tokX - g.slot, to: tokX });
          }
        }
      });

      // ── 캡션 — 지금 일어나는 일만
      let caption: string;
      if (step === null) {
        caption = t('caption.ready', 'Both answerers studied the same seen questions. Learned threshold: t = {t}', {
          t: fx(threshold),
        });
      } else if (step.phase === 'seen') {
        caption = t('caption.seen', 'Seen question {i} — x = {x} · true answer: {y}', {
          i: step.index + 1, x: fx1(step.x), y: step.answer,
        });
      } else {
        caption = t('caption.fresh', 'New question {i} — x = {x} · true answer: {y}', {
          i: step.index + 1, x: fx1(step.x), y: step.answer,
        });
      }
      write(svg, caption, PIECE_CANVAS_W / 2, CAPTION_Y, { fill: c.text, size: fontSizes.md, anchor: 'middle' });

      return { pin, arc, ring, rows, tokens };
    }

    /** 흘림의 한 프레임 — 끝 자리에 아직 못 온 만큼으로 그린다 */
    function frame(b: Built, s: MemorizeVsGeneralizeScene, p: number): void {
      const drop = span(p, 0, 0.45);
      if (b.pin) b.pin.setAttribute('transform', `translate(0 ${r2(-34 * (1 - drop))})`);
      const reach = span(p, 0.4, 1);
      if (b.arc) {
        b.arc.setAttribute('stroke-dasharray', '1 1');
        b.arc.setAttribute('stroke-dashoffset', String(r2(1 - reach)));
      }
      if (b.ring) b.ring.setAttribute('r', String(r2(4 + (DOT_R + 1) * reach)));
      const move = span(p, 0.35, 1);
      for (const tok of b.tokens) tok.el.setAttribute('cx', String(r2(tok.from + (tok.to - tok.from) * move)));
      if (s.step !== null && s.step.swapped) {
        s.order.forEach((a, i) => {
          const own = ROW_Y[i === 0 ? 0 : 1];
          const other = ROW_Y[i === 0 ? 1 : 0];
          const y = other + (own - other) * move;
          b.rows[a].setAttribute('transform', `translate(0 ${r2(y)})`);
        });
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function render(
      next: MemorizeVsGeneralizeScene,
      prev: MemorizeVsGeneralizeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const built = drawStatic(next);
      // 같은 걸음을 다시 받았으면 흐르지 않는다 (prev 는 고르는 데만)
      const moved = prev === null || prev.asked !== next.asked;
      if (!opts.animate || built === null || next.step === null || !moved) return;
      frame(built, next, 0);
      const start = Date.now();
      let p = 0;
      while (p < 1) {
        if (mine !== gen || destroyed) return;
        await wait(16);
        if (mine !== gen || destroyed) return;
        p = Math.min(1, (Date.now() - start) / MOVE_MS);
        if (p < 1) frame(built, next, p);
      }
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
