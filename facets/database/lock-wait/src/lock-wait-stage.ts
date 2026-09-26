/**
 * lock-wait 무대 — 줄 앞에 멈춰 섰다가 넘겨받아 이어 가는 요청.
 *
 * 오른쪽 상자가 잠기는 줄이고, 그 왼쪽 문설주가 X 잠금이다. 잠금을 쥔 트랜잭션은 문설주에 붙어 서고,
 * 뒤에 온 요청은 그 왼쪽으로 온 차례대로 멈춰 선다. 줄에 선 걸음마다 발밑에 점이 하나씩 쌓인다.
 * 커밋이 잠금을 놓으면 쥔 이는 아래 커밋한 자리로 내려가고, 맨 앞이 문설주로 들어서며 뒤는 한 칸씩 당겨진다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, SceneRenderer, Translate, ViewInstance } from '@ffacet/core/runtime';
import type { LockWaitScene } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const R = 19;
const MID_Y = 140;
const BOX_W = Math.round(W * 0.24);
const BOX_H = 72;
const BOX_RIGHT = W - PAD;
const BOX_LEFT = BOX_RIGHT - BOX_W;
const GATE_X = BOX_LEFT - 10;
const HOLDER_X = GATE_X - 8 - R;
/** 줄 칸 사이 — 상한. 트랜잭션이 많으면 좁힌다 */
const QUEUE_GAP_MAX = 2 * R + 30;
const POOL_X = PAD + R;
const POOL_GAP = 52;
const DONE_Y = 250;
const DONE_GAP = 76;
const DOT_R = 2.5;
const DOT_GAP = 8;

const MOVE_MS = 560;
const WRITE_MS = 520;

interface Pt {
  x: number;
  y: number;
}

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

function opLabel(prefix: string, txn: string, rest: string): string {
  return `${prefix}${txn.slice(1)}${rest}`;
}

export const lockWaitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<LockWaitScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function make<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function words(content: string, attrs: Record<string, string | number>, parent: Element): SVGTextElement {
      const node = make('text', { 'font-family': fonts.body, fill: colors.text, ...attrs }, parent);
      node.textContent = content;
      return node;
    }

    // ── 자리 ────────────────────────────────────────────────
    function poolPos(scene: LockWaitScene, txn: string): Pt {
      const i = scene.txns.indexOf(txn);
      const n = scene.txns.length;
      const gap = Math.min(POOL_GAP, (DONE_Y - 60) / Math.max(1, n - 1));
      return { x: POOL_X, y: round(MID_Y + (i - (n - 1) / 2) * gap) };
    }
    function queueGap(scene: LockWaitScene): number {
      const slots = Math.max(1, scene.txns.length - 1);
      const room = HOLDER_X - (POOL_X + 2 * R + 24) - R;
      return Math.min(QUEUE_GAP_MAX, room / slots);
    }
    function queuePos(scene: LockWaitScene, q: number): Pt {
      return { x: round(HOLDER_X - 10 - (q + 1) * queueGap(scene)), y: MID_Y };
    }
    function holderPos(): Pt {
      return { x: HOLDER_X, y: MID_Y };
    }
    function donePos(scene: LockWaitScene, d: number): Pt {
      const n = scene.txns.length;
      const center = (HOLDER_X + BOX_RIGHT) / 2;
      const gap = Math.min(DONE_GAP, (BOX_RIGHT - R - 24 - (HOLDER_X - 60)) / Math.max(1, n - 1));
      return { x: round(center + (d - (n - 1) / 2) * gap), y: DONE_Y };
    }
    function placeOf(scene: LockWaitScene, txn: string): Pt {
      if (scene.holder !== null && scene.holder.txn === txn) return holderPos();
      const q = scene.queue.findIndex((e) => e.txn === txn);
      if (q >= 0) return queuePos(scene, q);
      const d = scene.done.findIndex((e) => e.txn === txn);
      if (d >= 0) return donePos(scene, d);
      return poolPos(scene, txn);
    }

    // ── 정적 그리기 ─────────────────────────────────────────
    interface Drawn {
      tokens: Map<string, SVGGElement>;
      value: SVGTextElement;
      layer: SVGGElement;
    }

    function caption(scene: LockWaitScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'Row {row}: nobody holds the lock.', { row: scene.row });
      if (step.kind === 'grant') {
        return t('caption.grant', '{op}: granted. Lock holder: {txn}.', {
          op: opLabel('X', step.txn, `(${scene.row})`),
          txn: step.txn,
        });
      }
      if (step.kind === 'wait') {
        if (scene.holder === null) throw new Error(`lock-wait 무대: ${step.txn} 이 기다리는데 잠금을 쥔 이가 없다`);
        return t('caption.wait', '{op}: held by {holder}, so the request stops in line.', {
          op: opLabel('X', step.txn, `(${scene.row})`),
          holder: scene.holder.txn,
        });
      }
      if (step.kind === 'write') {
        return t('caption.write', '{op}: read {before}, wrote {after}.', {
          op: opLabel('W', step.txn, `(${scene.row}=${step.after})`),
          before: step.before,
          after: step.after,
        });
      }
      const op = opLabel('C', step.txn, '');
      if (step.granted === null) return t('caption.release', '{op}: the commit releases the lock. The line is empty.', { op });
      return t('caption.handoff', '{op}: the commit releases the lock. Taken over by: {to}. Steps waited: {n}.', {
        op,
        to: step.granted.txn,
        n: step.granted.waited,
      });
    }

    function drawToken(
      scene: LockWaitScene,
      txn: string,
      waited: number,
      role: 'pool' | 'holder' | 'queue' | 'done',
      layer: SVGGElement,
      palette: readonly string[],
    ): SVGGElement {
      const at = placeOf(scene, txn);
      const g = make('g', { transform: `translate(${at.x},${at.y})` }, layer);
      const fill = palette[scene.txns.indexOf(txn)] ?? colors.itemDefault;
      const ring =
        role === 'holder' ? colors.accent : role === 'queue' ? colors.itemComparing : colors.border;
      make(
        'circle',
        {
          r: R,
          fill,
          stroke: ring,
          'stroke-width': role === 'holder' || role === 'queue' ? 3 : 1.5,
          ...(role === 'queue' ? { 'stroke-dasharray': '4 3' } : {}),
          ...(role === 'done' || role === 'pool' ? { 'fill-opacity': 0.55 } : {}),
        },
        g,
      );
      words(txn, {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: colors.textInverse,
      }, g);
      // 줄에 서 있던 걸음마다 점 하나 — 트랜잭션과 함께 움직인다
      for (let k = 0; k < waited; k += 1) {
        make('circle', {
          cx: round((k - (waited - 1) / 2) * DOT_GAP),
          cy: R + 9,
          r: DOT_R,
          fill: colors.itemComparing,
        }, g);
      }
      if (role === 'done') {
        words(t('label.waited', 'Waited: {n}', { n: waited }), {
          x: 0,
          y: R + 26,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, g);
      }
      return g;
    }

    function drawStatic(scene: LockWaitScene): Drawn {
      svg.textContent = '';
      const layer = make('g', {}, svg);
      const palette = categorical(scene.txns.length);

      words(caption(scene), { x: PAD, y: 30, 'font-size': fontSizes.md }, layer);

      // 아직 요청 전
      const poolTop = poolPos(scene, scene.txns[0] ?? '').y - R - 12;
      words(t('label.pool', 'Not yet requested'), {
        x: PAD,
        y: poolTop,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }, layer);
      for (const txn of scene.txns) {
        make('circle', {
          cx: poolPos(scene, txn).x,
          cy: poolPos(scene, txn).y,
          r: R,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '2 3',
        }, layer);
      }

      // 기다림 줄 — 칸 자리
      const slots = Math.max(1, scene.txns.length - 1);
      const first = queuePos(scene, 0);
      const last = queuePos(scene, slots - 1);
      make('line', {
        x1: round(last.x - R - 6),
        y1: MID_Y + R + 20,
        x2: round(first.x + R + 6),
        y2: MID_Y + R + 20,
        stroke: colors.border,
      }, layer);
      words(t('label.queue', 'Waiting line'), {
        x: round((first.x + last.x) / 2),
        y: MID_Y - R - 14,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }, layer);

      // 줄 상자와 X 잠금 문설주
      make('rect', {
        x: BOX_LEFT,
        y: MID_Y - BOX_H / 2,
        width: BOX_W,
        height: BOX_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
      }, layer);
      words(scene.row, {
        x: round(BOX_LEFT + BOX_W / 2),
        y: MID_Y - 12,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      }, layer);
      const value = words(String(scene.value), {
        x: round(BOX_LEFT + BOX_W / 2),
        y: MID_Y + 20,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 600,
      }, layer);
      const held = scene.holder !== null;
      make('rect', {
        x: GATE_X - 3,
        y: MID_Y - BOX_H / 2 - 4,
        width: 6,
        height: BOX_H + 8,
        rx: 3,
        fill: held ? colors.accent : colors.border,
      }, layer);
      words(t('label.lock', 'X lock'), {
        x: GATE_X,
        y: MID_Y - BOX_H / 2 - 12,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: held ? colors.text : colors.textMuted,
      }, layer);
      if (scene.holder !== null && scene.wrote) {
        words(t('status.written', 'Written, not committed'), {
          x: HOLDER_X,
          y: MID_Y + R + 36,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.text,
        }, layer);
      }

      // 커밋한 자리
      const d0 = donePos(scene, 0);
      words(t('label.done', 'Committed'), {
        x: round(d0.x - R - 10),
        y: DONE_Y,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }, layer);

      const tokens = new Map<string, SVGGElement>();
      for (const txn of scene.txns) {
        let role: 'pool' | 'holder' | 'queue' | 'done' = 'pool';
        let waited = 0;
        const q = scene.queue.find((e) => e.txn === txn);
        const d = scene.done.find((e) => e.txn === txn);
        if (scene.holder !== null && scene.holder.txn === txn) {
          role = 'holder';
          waited = scene.holder.waited;
        } else if (q !== undefined) {
          role = 'queue';
          waited = q.waited;
        } else if (d !== undefined) {
          role = 'done';
          waited = d.waited;
        }
        tokens.set(txn, drawToken(scene, txn, waited, role, layer, palette));
      }
      return { tokens, value, layer };
    }

    // ── 운동 ────────────────────────────────────────────────
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
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

    function placeAt(g: SVGGElement, from: Pt, to: Pt, e: number): void {
      g.setAttribute('transform', `translate(${round(from.x + (to.x - from.x) * e)},${round(from.y + (to.y - from.y) * e)})`);
    }

    async function animate(next: LockWaitScene, drawn: Drawn, mine: number): Promise<void> {
      const step = next.step;
      if (step === null) return;
      if (step.kind === 'grant' || step.kind === 'wait') {
        const g = drawn.tokens.get(step.txn);
        if (g === undefined) return;
        const from = poolPos(next, step.txn);
        const to = placeOf(next, step.txn);
        placeAt(g, from, to, 0);
        await tween(MOVE_MS, mine, (p) => placeAt(g, from, to, easeOut(p)));
        return;
      }
      if (step.kind === 'write') {
        const from = holderPos();
        const to: Pt = { x: round(BOX_LEFT + BOX_W / 2), y: MID_Y + 12 };
        const delta = step.after - step.before;
        drawn.value.textContent = String(step.before);
        const chip = words(delta > 0 ? `+${delta}` : String(delta), {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: colors.danger,
          transform: `translate(${from.x},${from.y})`,
        }, drawn.layer);
        await tween(WRITE_MS, mine, (p) => {
          const e = ease(p);
          // 위로 살짝 떠서 상자 속 값으로 떨어진다
          const lift = Math.sin(Math.PI * e) * 26;
          chip.setAttribute('transform', `translate(${round(from.x + (to.x - from.x) * e)},${round(from.y + (to.y - from.y) * e - lift)})`);
          if (p >= 1) drawn.value.textContent = String(step.after);
        });
        return;
      }
      // commit — 쥔 이는 커밋한 자리로 내려가고, 맨 앞은 문설주로, 뒤는 한 칸씩 당겨진다
      const moves: { g: SVGGElement; from: Pt; to: Pt }[] = [];
      const leaver = drawn.tokens.get(step.txn);
      if (leaver !== undefined) moves.push({ g: leaver, from: holderPos(), to: placeOf(next, step.txn) });
      const shift = step.granted === null ? 0 : 1;
      if (step.granted !== null) {
        const g = drawn.tokens.get(step.granted.txn);
        if (g !== undefined) moves.push({ g, from: queuePos(next, 0), to: holderPos() });
      }
      next.queue.forEach((e, i) => {
        const g = drawn.tokens.get(e.txn);
        if (g !== undefined) moves.push({ g, from: queuePos(next, i + shift), to: queuePos(next, i) });
      });
      for (const m of moves) placeAt(m.g, m.from, m.to, 0);
      await tween(MOVE_MS, mine, (p) => {
        const e = ease(p);
        for (const m of moves) placeAt(m.g, m.from, m.to, e);
      });
    }

    return {
      async render(next: LockWaitScene, _prev: LockWaitScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const drawn = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animate(next, drawn, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
