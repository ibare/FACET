/**
 * attention-weights 의 stage — 동사 "나뉘어 쌓인다".
 *
 * 왼쪽: 물음 하나와 열쇠 · 값 넷의 줄. 무게 칸 머리의 "1" 자리(온 막대)가 점수를 지나
 *   넷으로 갈라지고, 조각이 제 줄로 내려앉는다 — 조각의 길이가 무게다.
 * 오른쪽: 값 넷이 점으로 놓인 평면. 값마다 원점에서 v 로 뻗은 화살이 제 무게만큼
 *   줄어든 뒤 결과의 끝으로 옮겨 붙고, 결과 점이 그만큼 끌려간다.
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { AttentionWeightsScene } from './scene.js';

const H = 420;
const PAD = 16;
const SCORE_MS = 500;
const WEIGH_MS = 900;
const SHARE_MS = 800;
const SVG_NS = 'http://www.w3.org/2000/svg';

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

/** 표시만 소수 둘째 자리. -0 은 0 으로. */
function fmt(x: number): string {
  const s = x.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function fmtVec(v: readonly number[]): string {
  return `(${v.map(fmt).join(', ')})`;
}

/** 정수로 주어진 입력은 정수로 보인다. */
function intVec(v: readonly number[]): string {
  return `(${v.map((x) => String(x)).join(', ')})`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function sub(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

type Anim =
  | { kind: 'score'; p: number }
  | { kind: 'weigh'; p: number }
  | { kind: 'share'; p: number; index: number; from: number[] };

export const attentionWeightsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const charW = smPx * 0.62;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    function label(x: number, y: number, text: string, opt: {
      size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string;
    } = {}): void {
      el('text', {
        x, y,
        'font-family': opt.mono === false ? fonts.body : fonts.mono,
        'font-size': opt.size ?? fontSizes.sm,
        fill: opt.fill ?? colors.text,
        'text-anchor': opt.anchor ?? 'start',
        'dominant-baseline': 'middle',
        ...(opt.weight ? { 'font-weight': opt.weight } : {}),
      }, text);
    }

    function arrow(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): void {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      const head = Math.min(8, len * 0.6);
      const ux = dx / len;
      const uy = dy / len;
      const bx = x2 - ux * head;
      const by = y2 - uy * head;
      el('line', { x1, y1, x2: bx, y2: by, stroke, 'stroke-width': width });
      const hw = head * 0.5;
      el('polygon', {
        points: [
          `${r2(x2)},${r2(y2)}`,
          `${r2(bx - uy * hw)},${r2(by + ux * hw)}`,
          `${r2(bx + uy * hw)},${r2(by - ux * hw)}`,
        ].join(' '),
        fill: stroke,
      });
    }

    function drawScene(scene: AttentionWeightsScene, anim: Anim | null): void {
      svg.textContent = '';
      const W = PIECE_CANVAS_W;
      const { query, items } = scene.base;
      const n = items.length;
      const dim = (items[0] as { value: number[] }).value.length;
      if (dim !== 2) {
        throw new Error(`attention-weights stage: 평면은 2 차원 값만 그린다 (받은 차원 ${dim})`);
      }
      const palette = categorical(n);
      const colorOf = (j: number): string => {
        const c = palette[j];
        if (c === undefined) throw new Error(`attention-weights stage: ${j} 번째 색이 없다`);
        return c;
      };

      // ── 왼쪽 판: 줄의 칸 너비는 글자에서 역산한다
      const leftR = Math.round(W * 0.62);
      const kW = Math.max(...items.map((it) => intVec(it.key).length)) * charW;
      const vW = Math.max(...items.map((it) => intVec(it.value).length)) * charW;
      const sW = 9 * charW;
      const gap = 14;
      const chip = 22;
      const colK = PAD + chip + 12;
      const colV = colK + kW + gap;
      const colS = colV + vW + gap;
      const colW = colS + sW + gap;
      const weightLabelW = 4 * charW + 8;
      const L = Math.max(20, leftR - colW - weightLabelW);

      const yQ = 26;
      const yHead = 62;
      const ySlot = 86;
      const barH = 12;
      const rowsTop = 108;
      const rowsBottom = 330;
      const rowH = (rowsBottom - rowsTop) / n;
      const rowY = (j: number): number => rowsTop + rowH * (j + 0.5);

      const cur = scene.step.kind === 'share' ? scene.step.index : -1;

      // 물음
      label(PAD, yQ, t('label.query', 'Query {q}', { q: 'q' }), { mono: false, fill: colors.textMuted });
      const qX = PAD + 96;
      label(qX, yQ, intVec(query), { fill: colors.primary, weight: '600' });

      // 머리줄
      label(colK, yHead, t('label.key', 'Key {k}', { k: 'k' }), { mono: false, fill: colors.textMuted, size: fontSizes.xs });
      label(colV, yHead, t('label.value', 'Value {v}', { v: 'v' }), { mono: false, fill: colors.textMuted, size: fontSizes.xs });
      label(colS, yHead, t('label.score', 'Score'), { mono: false, fill: colors.textMuted, size: fontSizes.xs });
      label(colW, yHead, t('label.weight', 'Weight'), { mono: false, fill: colors.textMuted, size: fontSizes.xs });

      // 온 막대 "1" 의 자리 — 무게가 서면 테두리와 합이 남는다
      const weighP = anim?.kind === 'weigh' ? anim.p : 1;
      if (scene.weights !== null) {
        el('rect', {
          x: colW, y: ySlot - barH / 2, width: L, height: barH,
          fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3',
        });
        if (weighP >= 1 && scene.sum !== null) {
          label(colW + L + 8, ySlot, t('label.sum', 'Sum {sum}', { sum: fmt(scene.sum) }), {
            size: fontSizes.xs, fill: colors.text,
          });
        }
      }

      // 줄
      const scoreP = anim?.kind === 'score' ? anim.p : 1;
      for (let j = 0; j < n; j += 1) {
        const it = items[j];
        if (it === undefined) throw new Error(`attention-weights stage: ${j} 번째 토큰이 없다`);
        const cy = rowY(j);
        if (j === cur) {
          el('rect', {
            x: PAD - 6, y: cy - rowH / 2 + 2, width: leftR - PAD + 12, height: rowH - 4,
            rx: 4, fill: colors.bgSubtle,
          });
        }
        el('rect', { x: PAD, y: cy - chip / 2, width: chip, height: chip, rx: 4, fill: colorOf(j) });
        label(PAD + chip / 2, cy, it.id, { anchor: 'middle', fill: colors.stateInk, weight: '700' });
        label(colK, cy, intVec(it.key));
        label(colV, cy, intVec(it.value));

        if (scene.scores !== null && scene.dots !== null && scoreP >= 1) {
          const d = scene.dots[j];
          const s = scene.scores[j];
          if (d === undefined || s === undefined) throw new Error(`attention-weights stage: ${it.id} 의 점수가 없다`);
          label(colS, cy - 8, t('label.dot', '{qk} {d}', { qk: 'q·k', d: String(d) }), {
            size: fontSizes.xs, fill: colors.textMuted,
          });
          label(colS, cy + 7, fmt(s), { weight: '600' });
        }

        if (scene.weights !== null && weighP >= 1) {
          const w = scene.weights[j];
          if (w === undefined) throw new Error(`attention-weights stage: ${it.id} 의 무게가 없다`);
          el('rect', { x: colW, y: cy - barH / 2, width: w * L, height: barH, fill: colorOf(j) });
          label(colW + w * L + 6, cy, fmt(w), {
            weight: j === scene.top ? '700' : '400',
          });
        }
      }

      // 점수 운동 — 물음이 줄마다 내려가 열쇠와 맞춰 본다
      if (anim?.kind === 'score') {
        const e = ease(anim.p);
        for (let j = 0; j < n; j += 1) {
          label(lerp(qX, colS, e), lerp(yQ, rowY(j), e), 'q', { fill: colors.primary, weight: '700' });
        }
      }

      // 나뉨 운동 — 온 막대가 갈라지고 조각이 제 줄로 내려앉는다
      if (anim?.kind === 'weigh' && scene.weights !== null) {
        const split = ease(sub(anim.p, 0, 0.35));
        const drop = ease(sub(anim.p, 0.4, 1));
        let acc = 0;
        for (let j = 0; j < n; j += 1) {
          const w = scene.weights[j];
          if (w === undefined) throw new Error('attention-weights stage: 무게가 모자란다');
          const gapX = split * 3 * j;
          const sx = colW + acc * L + gapX;
          const x = lerp(sx, colW, drop);
          const y = lerp(ySlot, rowY(j), drop);
          el('rect', {
            x, y: y - barH / 2, width: w * L, height: barH,
            fill: split > 0 ? colorOf(j) : colors.textMuted,
          });
          acc += w;
        }
      }

      // ── 오른쪽 판: 값의 평면
      const pL = leftR + 20;
      const pR = W - PAD;
      const pT = 20;
      const pB = 340;
      const xs = [0, ...items.map((it) => it.value[0] as number)];
      const ys = [0, ...items.map((it) => it.value[1] as number)];
      const x0 = Math.min(...xs) - 0.5;
      const x1 = Math.max(...xs) + 0.5;
      const y0 = Math.min(...ys) - 0.5;
      const y1 = Math.max(...ys) + 0.5;
      const unit = Math.min((pR - pL) / (x1 - x0), (pB - pT) / (y1 - y0));
      const cx = (pL + pR) / 2 - ((x0 + x1) / 2) * unit;
      const cyP = (pT + pB) / 2 + ((y0 + y1) / 2) * unit;
      const px = (v: number): number => cx + v * unit;
      const py = (v: number): number => cyP - v * unit;

      el('line', { x1: px(x0), y1: py(0), x2: px(x1), y2: py(0), stroke: colors.border, 'stroke-width': 1 });
      el('line', { x1: px(0), y1: py(y0), x2: px(0), y2: py(y1), stroke: colors.border, 'stroke-width': 1 });

      // 이번 걸음의 값 — 원점에서 v 까지 (몫은 이것을 무게만큼 줄인 것)
      if (cur >= 0) {
        const it = items[cur];
        if (it === undefined) throw new Error('attention-weights stage: 이번 토큰이 없다');
        el('line', {
          x1: px(0), y1: py(0), x2: px(it.value[0] as number), y2: py(it.value[1] as number),
          stroke: colorOf(cur), 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
        });
      }

      for (let j = 0; j < n; j += 1) {
        const it = items[j];
        if (it === undefined) throw new Error('attention-weights stage: 토큰이 모자란다');
        const vx = px(it.value[0] as number);
        const vy = py(it.value[1] as number);
        el('circle', { cx: vx, cy: vy, r: 6, fill: colorOf(j) });
        label(vx + 10, vy - 8, it.id, { fill: colors.text, weight: '600' });
      }

      // 결과 점
      let movingArrow: [number, number, number, number] | null = null;
      const res = scene.result;
      let rx = res === null ? 0 : (res[0] as number);
      let ry = res === null ? 0 : (res[1] as number);
      if (anim?.kind === 'share') {
        const sh = scene.shares[anim.index];
        const it = items[anim.index];
        if (!sh || it === undefined) throw new Error('attention-weights stage: 움직일 몫이 없다');
        const shrink = ease(sub(anim.p, 0, 0.45));
        const move = ease(sub(anim.p, 0.5, 1));
        const vx = it.value[0] as number;
        const vy = it.value[1] as number;
        const lenX = lerp(vx, sh.share[0] as number, shrink);
        const lenY = lerp(vy, sh.share[1] as number, shrink);
        const ox = lerp(0, anim.from[0] as number, move);
        const oy = lerp(0, anim.from[1] as number, move);
        movingArrow = [px(ox), py(oy), px(ox + lenX), py(oy + lenY)];
        rx = anim.from[0] as number;
        ry = anim.from[1] as number;
        if (move >= 1) {
          rx = sh.to[0] as number;
          ry = sh.to[1] as number;
        }
      }

      if (res !== null) {
        el('circle', { cx: px(rx), cy: py(ry), r: 5, fill: colors.accent, stroke: colors.stateInk, 'stroke-width': 1.5 });
      }

      // 쌓인 몫의 사슬
      const moving = anim?.kind === 'share' ? anim.index : -1;
      for (let j = 0; j < n; j += 1) {
        const sh = scene.shares[j];
        if (sh === null || sh === undefined || j === moving) continue;
        arrow(px(sh.from[0] as number), py(sh.from[1] as number), px(sh.to[0] as number), py(sh.to[1] as number), colorOf(j), 3);
      }

      if (movingArrow !== null && anim?.kind === 'share') {
        const [ax1, ay1, ax2, ay2] = movingArrow;
        arrow(ax1, ay1, ax2, ay2, colorOf(anim.index), 3);
      }

      // 결과 읽음
      const shownResult = anim?.kind === 'share' && anim.p < 1 ? anim.from : res;
      if (shownResult !== null) {
        el('circle', { cx: pL + 6, cy: pB + 22, r: 5, fill: colors.accent, stroke: colors.stateInk, 'stroke-width': 2 });
        label(pL + 18, pB + 22, t('label.result', 'Result {vec}', { vec: fmtVec(shownResult) }), {
          mono: false, weight: '600',
        });
      }

      // ── 캡션 — 지금 일어나는 일
      const capY = 388;
      const done = scene.shares.every((s) => s !== null);
      const step = scene.step;
      let line1 = '';
      if (step.kind === 'start') {
        if (res !== null) line1 = t('caption.start', 'The query is about to be matched against every key. Result: {vec}', {
          vec: fmtVec(res),
        });
      } else if (step.kind === 'score') {
        line1 = t('caption.score', 'Score = {qk} / {root}, one per key.', { qk: 'q·k', root: `√${query.length}` });
      } else if (step.kind === 'weigh') {
        if (scene.sum === null) throw new Error('attention-weights stage: 무게의 합이 없다');
        line1 = t('caption.weigh', 'The scores split one whole into weights ({softmax}). Sum of weights: {sum}', {
          softmax: 'softmax',
          sum: fmt(scene.sum),
        });
      } else {
        const sh = scene.shares[step.index];
        const it = items[step.index];
        const w = scene.weights?.[step.index];
        if (!sh || it === undefined || w === undefined) {
          throw new Error('attention-weights stage: 이번 몫을 읽을 수 없다');
        }
        line1 = t('caption.share', '{token} adds its share: {w} × {v} = {share}', {
          token: it.id, w: fmt(w), v: intVec(it.value), share: fmtVec(sh.share),
        });
      }
      label(PAD, capY, line1, { mono: false, size: fontSizes.md });
      if (done && scene.top !== null && scene.weights !== null) {
        const topItem = items[scene.top];
        const topW = scene.weights[scene.top];
        if (topItem === undefined || topW === undefined) throw new Error('attention-weights stage: 가장 큰 무게를 읽을 수 없다');
        label(PAD, capY + 22, t('caption.done', 'Largest weight: {token} {w}', { token: topItem.id, w: fmt(topW) }), {
          mono: false, size: fontSizes.sm, fill: colors.textMuted,
        });
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
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

    async function render(
      next: AttentionWeightsScene,
      prev: AttentionWeightsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      let anim: ((p: number) => Anim) | null = null;
      let ms = 0;
      if (opts.animate && prev !== null) {
        if (step.kind === 'score' && prev.scores === null) {
          anim = (p) => ({ kind: 'score', p });
          ms = SCORE_MS;
        } else if (step.kind === 'weigh' && prev.weights === null) {
          anim = (p) => ({ kind: 'weigh', p });
          ms = WEIGH_MS;
        } else if (step.kind === 'share' && prev.shares[step.index] === null) {
          const { index, from } = step;
          anim = (p) => ({ kind: 'share', p, index, from });
          ms = SHARE_MS;
        }
      }
      if (anim === null) {
        drawScene(next, null);
        return;
      }
      const make = anim;
      await tween(ms, mine, (p) => drawScene(next, make(p)));
      if (mine === gen && !destroyed) drawScene(next, null);
    }

    return {
      render,
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
