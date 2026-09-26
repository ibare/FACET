/**
 * query-key-value 의 무대.
 *
 * 토큰마다 한 세로줄. 맨 위 입력 x 에서 복제본이 내려가 물음 · 열쇠 · 값의 줄에 앉는다
 * (갈라진다). 묻는 토큰의 물음이 물음 줄을 따라 미끄러져 열쇠마다 그 위에 서고, 아래에
 * 맞춘 점수가 남는다 (맞춘다). 점수가 무게 막대가 된 뒤 값들이 무게만 한 크기로
 * 묻는 토큰의 결과 자리로 옮겨 온다 (가져온다).
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
} from '@ffacet/core/runtime';
import type { Vec2 } from './algorithm.js';
import type { QkvScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

const HEAD_W = 118;
const TOP_Y = 20;
const ROW0_Y = 58;
const CAPTION_Y = 330;
const CHIP_H = 24;
const CHIP_W_MAX = 120;

const SPLIT_MS = 420;
const MATCH_MS = 780;
const WEIGH_MS = 420;
const FETCH_MS = 700;

type Row = 'x' | 'q' | 'k' | 'match' | 'v' | 'result';
const ROWS: Row[] = ['x', 'q', 'k', 'match', 'v', 'result'];

type Fx =
  | { kind: 'split'; role: 'q' | 'k' | 'v'; p: number }
  | { kind: 'match'; p: number }
  | { kind: 'weigh'; p: number }
  | { kind: 'fetch'; p: number };

function fmt(n: number): string {
  const s = n.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function fmtVec(v: Vec2): string {
  return `(${fmt(v[0])}, ${fmt(v[1])})`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 캡션이 부르는 값이 장면에 없으면 지어내지 않고 던진다. */
function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`query-key-value 무대: 캡션의 ${what} 가 장면에 없다`);
  return v;
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export const queryKeyValueStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const [qColor, kColor, vColor] = categorical(3) as [string, string, string];
    const roleColor = { q: qColor, k: kColor, v: vColor } as const;
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    const W = PIECE_CANVAS_W;
    const rowGap = (CAPTION_Y - 22 - ROW0_Y) / (ROWS.length - 1);
    const rowY = (r: Row): number => ROW0_Y + ROWS.indexOf(r) * rowGap;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    /** 글자 속 `k_B` 꼴을 아래 첨자로 그린다. */
    function text(
      parent: Element,
      s: string,
      x: number,
      y: number,
      opts: { size: number; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): void {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      const parts = s.split(/([A-Za-z])_([A-Za-z0-9]+)/);
      // split 은 [앞, 밑, 첨자, 앞, 밑, 첨자, …, 뒤] 로 나온다
      const drop = opts.size * 0.3;
      let lowered = false;
      const put = (str: string): void => {
        if (!str) return;
        if (lowered) {
          el('tspan', { dy: -drop }, node).textContent = str;
          lowered = false;
        } else {
          node.appendChild(document.createTextNode(str));
        }
      };
      for (let i = 0; i < parts.length; i += 3) {
        const base = parts[i + 1];
        const sub = parts[i + 2];
        put((parts[i] ?? '') + (base ?? ''));
        if (base !== undefined && sub !== undefined) {
          el('tspan', { dy: drop, 'font-size': opts.size * 0.72 }, node).textContent = sub;
          lowered = true;
        }
      }
    }

    function colX(i: number, n: number): number {
      const colW = (W - HEAD_W - 6) / n;
      return HEAD_W + colW * (i + 0.5);
    }

    function chipW(n: number): number {
      return Math.min(CHIP_W_MAX, (W - HEAD_W - 6) / n - 14);
    }

    function chip(
      parent: Element,
      cx: number,
      cy: number,
      w: number,
      label: string,
      style: { stroke: string; fill: string; ink: string; strokeW?: number },
    ): void {
      el(
        'rect',
        {
          x: cx - w / 2,
          y: cy - CHIP_H / 2,
          width: w,
          height: CHIP_H,
          rx: 5,
          fill: style.fill,
          stroke: style.stroke,
          'stroke-width': style.strokeW ?? 1.6,
        },
        parent,
      );
      text(parent, label, cx, cy + 0.5, { size: smPx, fill: style.ink, mono: true });
    }

    function roleVecs(s: QkvScene, role: 'q' | 'k' | 'v'): (Vec2 | null)[] {
      if (role === 'q') return s.tokens.map((tok) => (tok === s.asker ? s.q : null));
      if (role === 'k') return s.keys ?? s.tokens.map(() => null);
      return s.values ?? s.tokens.map(() => null);
    }

    function draw(s: QkvScene, fx: Fx | null): void {
      svg.textContent = '';
      const n = s.tokens.length;
      const cw = chipW(n);
      const askerAt = s.tokens.indexOf(s.asker);
      const root = el('g', {}, svg);

      // 줄 머리
      const head: Record<Row, [string, string]> = {
        x: [t('label.input', 'input'), 'x'],
        q: [t('label.query', 'query'), 'q = x·W_Q'],
        k: [t('label.key', 'key'), 'k = x·W_K'],
        match: [t('label.match', 'match'), 'q·k / √d_k'],
        v: [t('label.value', 'value'), 'v = x·W_V'],
        result: [t('label.result', 'result'), 'Σ w·v'],
      };
      for (const r of ROWS) {
        const y = rowY(r);
        const color = r === 'q' || r === 'k' || r === 'v' ? roleColor[r] : pal.textMuted;
        if (r === 'q' || r === 'k' || r === 'v') {
          el('rect', { x: 4, y: y - 12, width: 4, height: 24, rx: 2, fill: color }, root);
        }
        text(root, head[r][0], 14, y - 6, { size: smPx, fill: pal.text, anchor: 'start', weight: '600' });
        text(root, head[r][1], 14, y + 9, { size: xsPx, fill: pal.textMuted, anchor: 'start', mono: true });
      }

      // 토큰 머리와 세로 줄기
      for (let i = 0; i < n; i++) {
        const cx = colX(i, n);
        const isAsker = i === askerAt;
        const bottom = isAsker ? rowY('result') : rowY('v');
        const spineTo = s.values ? bottom : s.keys ? rowY('k') : s.q && isAsker ? rowY('q') : rowY('x');
        if (spineTo > rowY('x')) {
          el('line', { x1: cx, y1: rowY('x'), x2: cx, y2: spineTo, stroke: pal.border, 'stroke-width': 1.2 }, root);
        }
        el(
          'circle',
          {
            cx,
            cy: TOP_Y,
            r: 12,
            fill: isAsker ? qColor : pal.bgSubtle,
            stroke: isAsker ? qColor : pal.border,
            'stroke-width': 1.4,
          },
          root,
        );
        text(root, s.tokens[i]!, cx, TOP_Y + 0.5, {
          size: smPx,
          fill: isAsker ? pal.textInverse : pal.text,
          weight: '700',
          mono: true,
        });
        if (isAsker) {
          text(root, t('label.asker', 'asks'), cx + 18, TOP_Y + 0.5, {
            size: xsPx,
            fill: pal.textMuted,
            anchor: 'start',
          });
        }
      }

      // 입력 x
      for (let i = 0; i < n; i++) {
        chip(root, colX(i, n), rowY('x'), cw, fmtVec(s.xs[i]!), {
          stroke: pal.border,
          fill: pal.bgSubtle,
          ink: pal.text,
        });
      }

      // 물음 · 열쇠 · 값
      const hiding = fx?.kind === 'split' ? fx.role : null;
      for (const role of ['q', 'k', 'v'] as const) {
        if (role === hiding) continue;
        const vecs = roleVecs(s, role);
        for (let i = 0; i < n; i++) {
          const v = vecs[i];
          if (!v) continue;
          const isBest = s.best === i && (role === 'k' || (role === 'v' && s.result !== null && fx?.kind !== 'fetch'));
          chip(root, colX(i, n), rowY(role), cw, fmtVec(v), {
            stroke: roleColor[role],
            fill: isBest ? pal.accent : pal.bg,
            ink: isBest ? pal.stateInk : pal.text,
            strokeW: isBest ? 2.4 : 1.6,
          });
        }
      }

      // 갈라지는 복제본
      if (fx?.kind === 'split') {
        const e = ease(fx.p);
        const vecs = roleVecs(s, fx.role);
        for (let i = 0; i < n; i++) {
          const v = vecs[i];
          if (!v) continue;
          const cx = colX(i, n);
          const y = rowY('x') + (rowY(fx.role) - rowY('x')) * e;
          const passed = fx.p >= 0.5;
          chip(root, cx, y, cw, passed ? fmtVec(v) : fmtVec(s.xs[i]!), {
            stroke: passed ? roleColor[fx.role] : pal.border,
            fill: pal.bg,
            ink: pal.text,
          });
        }
      }

      // 맞춰 보기 · 무게
      const matchY = rowY('match');
      const reached = fx?.kind === 'match' ? matchReached(fx.p, n, askerAt) : null;
      if (s.scores && s.raw) {
        const dk = need(s.dk, 'dk');
        const barMax = cw;
        for (let i = 0; i < n; i++) {
          if (reached && !reached.has(i)) continue;
          const cx = colX(i, n);
          const score = s.scores[i]!;
          // 세로 줄기가 수를 가로지르지 않게 칸 바탕을 깐다
          el('rect', { x: cx - cw / 2, y: matchY - 14, width: cw, height: 30, fill: pal.bg }, root);
          if (s.weights) {
            const w = s.weights[i]!;
            const grow = fx?.kind === 'weigh' ? ease(fx.p) : 1;
            const isBest = s.best === i;
            text(root, `${fmt(score)} → ${fmt(w)}`, cx, matchY - 6, {
              size: smPx,
              fill: pal.text,
              mono: true,
              weight: isBest ? '700' : '400',
            });
            el(
              'rect',
              { x: cx - barMax / 2, y: matchY + 5, width: barMax, height: 7, rx: 2, fill: pal.bgSubtle },
              root,
            );
            el(
              'rect',
              {
                x: cx - barMax / 2,
                y: matchY + 5,
                width: barMax * w * grow,
                height: 7,
                rx: 2,
                fill: isBest ? pal.accent : pal.textMuted,
              },
              root,
            );
          } else {
            text(root, `${fmt(s.raw[i]!)} / √${dk} = ${fmt(score)}`, cx, matchY, {
              size: smPx,
              fill: pal.text,
              mono: true,
            });
          }
        }
      }

      // 물음이 열쇠 위로 미끄러진다
      if (fx?.kind === 'match' && s.q) {
        const gx = matchGhostX(fx.p, n, askerAt);
        const y = rowY('q');
        el('line', { x1: gx, y1: y + CHIP_H / 2, x2: gx, y2: rowY('k') - CHIP_H / 2, stroke: qColor, 'stroke-width': 2 }, root);
        chip(root, gx, y, cw, fmtVec(s.q), { stroke: qColor, fill: pal.bg, ink: pal.text, strokeW: 2.4 });
      }

      // 결과
      const cxAsker = colX(askerAt, n);
      if (s.result && fx?.kind !== 'fetch') {
        chip(root, cxAsker, rowY('result'), cw, fmtVec(s.result), {
          stroke: vColor,
          fill: pal.bg,
          ink: pal.text,
          strokeW: 2.8,
        });
      }
      if (s.dist && s.best !== null && fx?.kind !== 'fetch') {
        const cx = colX(s.best, n);
        for (const role of ['x', 'k', 'v'] as const) {
          const d = s.dist[role];
          el('rect', { x: cx - cw / 3, y: rowY(role) + CHIP_H / 2 + 1, width: (cw * 2) / 3, height: 14, fill: pal.bg }, root);
          text(root, t('label.dist', 'distance: {d}', { d: fmt(d) }), cx, rowY(role) + CHIP_H / 2 + 8, {
            size: xsPx,
            fill: s.nearest === role ? pal.text : pal.textMuted,
            weight: s.nearest === role ? '700' : '400',
          });
        }
      }

      // 값이 묻는 자리로 옮겨 온다
      if (fx?.kind === 'fetch' && s.values && s.weights) {
        const e = ease(fx.p);
        // 무거운 것을 나중에 그려 위에 오게 한다
        const order = s.tokens.map((_, i) => i).sort((a, b) => s.weights![a]! - s.weights![b]!);
        for (const i of order) {
          const w = s.weights[i]!;
          const scale = 0.25 + 0.75 * w;
          const sx = colX(i, n);
          const sy = rowY('v');
          const x = sx + (cxAsker - sx) * e;
          const y = sy + (rowY('result') - sy) * e;
          const g = el('g', { transform: `translate(${round(x)} ${round(y)}) scale(${round(scale)})` }, root);
          chip(g, 0, 0, cw, fmtVec(s.values[i]!), { stroke: vColor, fill: pal.bg, ink: pal.text });
        }
      }

      // 캡션
      const lines = caption(s);
      lines.forEach((line, k) => {
        text(root, line, W / 2, CAPTION_Y + k * 18, { size: k === 0 ? smPx + 1 : smPx, fill: k === 0 ? pal.text : pal.textMuted });
      });
    }

    /** 물음 복제본은 묻는 자리에서 떠나 토큰 차례대로 열쇠 위를 들른다. 들른 자리들을 돌려준다. */
    function matchStops(n: number, askerAt: number): number[] {
      return [askerAt, ...Array.from({ length: n }, (_, i) => i)];
    }

    function matchGhostX(p: number, n: number, askerAt: number): number {
      const stops = matchStops(n, askerAt).map((i) => colX(i, n));
      const legs = stops.length - 1;
      const at = Math.min(legs - 1e-9, p * legs);
      const leg = Math.floor(at);
      const local = ease(at - leg);
      return stops[leg]! + (stops[leg + 1]! - stops[leg]!) * local;
    }

    function matchReached(p: number, n: number, askerAt: number): Set<number> {
      const stops = matchStops(n, askerAt);
      const legs = stops.length - 1;
      const done = Math.floor(p * legs + 1e-9);
      const out = new Set<number>();
      for (let k = 1; k <= Math.min(done, legs); k++) out.add(stops[k]!);
      return out;
    }

    function caption(s: QkvScene): string[] {
      const asker = s.asker;
      switch (s.step.kind) {
        case 'start':
          return [t('caption.start', 'Each token has one input {x}.', { x: 'x' })];
        case 'query':
          return [
            t('caption.query', '{asker} asks with {q} = {x}·{w}: {vec}', {
              asker,
              q: `q_${asker}`,
              x: `x_${asker}`,
              w: 'W_Q',
              vec: fmtVec(need(s.q, 'q')),
            }),
          ];
        case 'keys':
          return [t('caption.keys', 'Keys for every token: {k} = {x}·{w}', { k: 'k', x: 'x', w: 'W_K' })];
        case 'values':
          return [t('caption.values', 'Values for every token: {v} = {x}·{w}', { v: 'v', x: 'x', w: 'W_V' })];
        case 'match':
          return [
            t('caption.match', 'Matching {q} with each key: {q}·{k} / {root}', {
              q: `q_${asker}`,
              k: 'k',
              root: `√${need(s.dk, 'dk')}`,
            }),
          ];
        case 'weigh':
          return [
            t('caption.weigh', 'softmax. Best-matching key: {key}. Sum of weights: {sum}', {
              key: `k_${need(s.tokens[need(s.best, 'best')], 'best 토큰')}`,
              sum: fmt(need(s.sum, 'sum')),
            }),
          ];
        case 'fetch': {
          const bestTok = need(s.tokens[need(s.best, 'best')], 'best 토큰');
          const nearest = need(s.nearest, 'nearest');
          return [
            t('caption.fetch', 'Arrives at {asker}: Σ w·v = {vec}', {
              asker,
              vec: fmtVec(need(s.result, 'result')),
            }),
            t('caption.nearest', 'Nearest vector of {token}: {name}, distance {d}', {
              token: bestTok,
              name: `${nearest}_${bestTok}`,
              d: fmt(need(s.dist, 'dist')[nearest]),
            }),
          ];
        }
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    const renderer: SceneRenderer<QkvScene> & { destroy(): void } = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (!opts.animate || destroyed) {
          if (!destroyed) draw(next, null);
          return;
        }
        const kind = next.step.kind;
        if (kind === 'query' || kind === 'keys' || kind === 'values') {
          const role = kind === 'query' ? 'q' : kind === 'keys' ? 'k' : 'v';
          await tween(SPLIT_MS, mine, (p) => draw(next, { kind: 'split', role, p }));
        } else if (kind === 'match') {
          await tween(MATCH_MS, mine, (p) => draw(next, { kind: 'match', p }));
        } else if (kind === 'weigh') {
          await tween(WEIGH_MS, mine, (p) => draw(next, { kind: 'weigh', p }));
        } else if (kind === 'fetch') {
          await tween(FETCH_MS, mine, (p) => draw(next, { kind: 'fetch', p }));
        }
        if (mine === gen && !destroyed) draw(next, null);
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
    return renderer;
  },
};
