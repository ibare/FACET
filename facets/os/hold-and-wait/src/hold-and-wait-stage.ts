/**
 * hold-and-wait 무대 — 쥔 채 잠든 손.
 *
 * 스레드마다 카드 하나(프로그램 줄 · 다음 줄 표시 · 손). 자물쇠는 물건이다 — 비었으면 맨 위 제자리에 있고,
 * 잡히면 잡은 스레드의 손으로 날아가 거기 머문다. 잠든 스레드는 카드가 흐려지지만 손에 든 자물쇠는 그대로
 * 남아 테두리가 붉어진다. 기다리는 스레드에서는 기다리는 자물쇠가 있는 곳(대개 남의 손)으로 화살이 뻗는다.
 * CPU 표지는 이번 틱을 받은 카드 위로 옮겨 간다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { HoldAndWaitScene, HawThreadNow } from './scene.js';

const W = PIECE_CANVAS_W;
const H = 388;
const NS = 'http://www.w3.org/2000/svg';

const M = 12;
const GAP = 16;
const TOK_H = 26;
const TOK_MAX_W = 72;
const TOP_Y = 14;
const CPU_Y = 54;
const CARD_Y = 80;
const LINES_Y = CARD_Y + 44;
const LINES_H = 104;
const HAND_LABEL_Y = LINES_Y + LINES_H + 4;
const HAND_Y = HAND_LABEL_Y + 8;
const CARD_BOTTOM = HAND_Y + TOK_H + 10;
const DIP = 34;
const CAPTION_Y = 334;
const CAPTION_GAP = 20;
const MOVE_MS = 400;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function quadAt(a: Pt, c: Pt, b: Pt, u: number): Pt {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
}

type Layout = {
  colW: number;
  tokW: number;
  cardX: Map<string, number>;
  lockIndex: Map<string, number>;
  lineH: number;
  homeX: (i: number) => number;
};

function makeLayout(scene: HoldAndWaitScene): Layout {
  const n = Math.max(1, scene.base.threads.length);
  const nl = Math.max(1, scene.base.locks.length);
  const colW = (W - 2 * M - (n - 1) * GAP) / n;
  const tokW = Math.min(TOK_MAX_W, (colW - 24 - 8 * (nl - 1)) / nl);
  const cardX = new Map<string, number>();
  scene.base.threads.forEach((th, i) => cardX.set(th.id, M + i * (colW + GAP)));
  const lockIndex = new Map<string, number>();
  scene.base.locks.forEach((m, i) => lockIndex.set(m, i));
  const maxLines = Math.max(1, ...scene.base.threads.map((th) => th.lines.length));
  const lineH = Math.min(20, LINES_H / maxLines);
  const areaX = 110;
  const areaW = (W - M - areaX) / nl;
  return { colW, tokW, cardX, lockIndex, lineH, homeX: (i) => areaX + i * areaW };
}

type Handles = {
  tokens: Map<string, SVGGElement>;
  arrows: Map<string, { path: SVGPathElement; head: SVGPathElement; label: SVGTextElement; a: Pt; c: Pt; b: Pt }>;
  cards: Map<string, SVGGElement>;
  carets: Map<string, SVGTextElement>;
  cpu: SVGGElement | null;
};

export const holdAndWaitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function write(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number> = {}): SVGTextElement {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text, ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    function stateWord(th: HawThreadNow, running: boolean): string {
      if (th.state === 'blocked') return t('state.blocked', 'asleep');
      if (th.state === 'done') return t('state.done', 'done');
      if (running) return t('state.running', 'running');
      if (th.state === 'new') return t('state.new', 'not here yet');
      return t('state.ready', 'ready');
    }

    function captionLines(scene: HoldAndWaitScene): string[] {
      const step = scene.step;
      if (step === null) return [t('caption.start', 'Nobody holds a lock yet.')];
      const lines: string[] = [];
      const lock = step.lock ?? '';
      if (step.kind === 'take') {
        lines.push(t('caption.take', '{thread} takes {lock}.', { thread: step.thread, lock }));
      } else if (step.kind === 'block') {
        const held = scene.locks.filter((l) => l.owner === step.thread).map((l) => l.id);
        const ownerNow = scene.threads.find((th) => th.id === step.owner);
        if (held.length > 0) {
          lines.push(t('caption.blockHolding', '{thread} sleeps at {lock}, still holding {held}.', { thread: step.thread, lock, held: held.join(', ') }));
        } else if (ownerNow !== undefined && ownerNow.state === 'blocked') {
          lines.push(t('caption.blockSleepingOwner', '{thread} sleeps at {lock}. Holder {owner} is asleep too.', { thread: step.thread, lock, owner: ownerNow.id }));
        } else {
          lines.push(t('caption.block', '{thread} sleeps at {lock}. Holder: {owner}.', { thread: step.thread, lock, owner: step.owner ?? '' }));
        }
      } else if (step.kind === 'work') {
        lines.push(t('caption.work', '{thread} runs work().', { thread: step.thread }));
      } else if (step.to !== null) {
        lines.push(t('caption.releaseTo', '{thread} releases {lock}. {to} wakes up holding it.', { thread: step.thread, lock, to: step.to }));
      } else {
        lines.push(t('caption.releaseFree', '{thread} releases {lock}. It is free.', { thread: step.thread, lock }));
      }
      if (step.arrived.length > 0) {
        lines.push(t('caption.arrive', '{thread} arrives.', { thread: step.arrived.join(', ') }));
      } else if (step.kind !== 'block') {
        for (const l of scene.locks) {
          const holder = scene.threads.find((th) => th.id === l.owner);
          if (holder !== undefined && holder.state === 'blocked') {
            lines.push(t('caption.idle', '{lock} stays in the hand of {owner}, who is asleep.', { lock: l.id, owner: holder.id }));
          }
        }
      }
      if (scene.threads.length > 0 && scene.threads.every((th) => th.state === 'done')) {
        lines.push(t('caption.allDone', 'Every thread has finished.'));
      }
      return lines;
    }

    function lockColors(scene: HoldAndWaitScene): readonly string[] {
      return categorical(Math.max(1, scene.base.locks.length));
    }

    /** 자물쇠가 서야 할 자리 — 주인이 있으면 그 손, 없으면 제자리. */
    function handPos(lay: Layout, thread: string, lock: string): Pt | null {
      const x = lay.cardX.get(thread);
      const i = lay.lockIndex.get(lock);
      if (x === undefined || i === undefined) return null;
      return { x: x + 12 + i * (lay.tokW + 8), y: HAND_Y };
    }

    function homePos(lay: Layout, lock: string): Pt | null {
      const i = lay.lockIndex.get(lock);
      if (i === undefined) return null;
      return { x: lay.homeX(i), y: TOP_Y };
    }

    function drawStatic(scene: HoldAndWaitScene): Handles {
      svg.textContent = '';
      const handles: Handles = { tokens: new Map(), arrows: new Map(), cards: new Map(), carets: new Map(), cpu: null };
      if (scene.base.threads.length === 0) return handles;
      const lay = makeLayout(scene);
      const palette = lockColors(scene);
      const step = scene.step;
      const stateOf = new Map(scene.threads.map((th) => [th.id, th] as const));

      const top = el('g', {}, svg);
      const cardLayer = el('g', {}, svg);
      const arrowLayer = el('g', {}, svg);
      const tokenLayer = el('g', {}, svg);
      const cpuLayer = el('g', {}, svg);
      const captionLayer = el('g', {}, svg);

      // 맨 위 — 틱과 자물쇠의 제자리 · 수
      write(
        top,
        M,
        TOP_Y + 18,
        step === null ? t('label.start', 'Start') : t('label.tick', 'Tick {n}', { n: step.tick }),
        { 'font-size': fontSizes.lg, 'font-weight': 700 },
      );
      scene.base.locks.forEach((m, i) => {
        const home = { x: lay.homeX(i), y: TOP_Y };
        el('rect', { x: home.x, y: home.y, width: lay.tokW, height: TOK_H, rx: 6, fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 3' }, top);
        write(top, home.x + lay.tokW / 2, home.y + TOK_H / 2 + smPx / 3, m, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          fill: colors.textMuted,
        });
        const now = scene.locks.find((l) => l.id === m);
        const idle = now?.idle ?? 0;
        const used = now?.used ?? 0;
        write(top, home.x + lay.tokW + 10, home.y + 10, t('label.idle', 'Held by a sleeper: {n}', { n: idle }), {
          'font-size': fontSizes.xs,
          fill: idle > 0 ? colors.danger : colors.textMuted,
          'font-weight': idle > 0 ? 700 : 400,
        });
        write(top, home.x + lay.tokW + 10, home.y + 25, t('label.used', 'Work lines: {n}', { n: used }), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      });

      // 카드
      for (const base of scene.base.threads) {
        const x = lay.cardX.get(base.id);
        const now = stateOf.get(base.id);
        if (x === undefined || now === undefined) continue;
        const running = step !== null && step.thread === base.id;
        const asleep = now.state === 'blocked';
        const faded = now.state === 'new' || now.state === 'done';
        const g = el('g', {}, cardLayer);
        handles.cards.set(base.id, g);
        el(
          'rect',
          {
            x,
            y: CARD_Y,
            width: lay.colW,
            height: CARD_BOTTOM - CARD_Y,
            rx: 10,
            fill: asleep || faded ? colors.bgSubtle : colors.bg,
            stroke: running ? colors.primary : colors.border,
            'stroke-width': running ? 2.5 : 1,
            ...(asleep || now.state === 'new' ? { 'stroke-dasharray': '5 4' } : {}),
          },
          g,
        );
        const ink = asleep || faded ? colors.textMuted : colors.text;
        write(g, x + 12, CARD_Y + 26, base.id, { 'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 700, fill: ink });
        write(g, x + lay.colW - 12, CARD_Y + 24, stateWord(now, running), {
          'text-anchor': 'end',
          fill: asleep ? colors.danger : running && now.state !== 'done' ? colors.primary : colors.textMuted,
          'font-weight': (running && now.state !== 'done') || asleep ? 700 : 400,
        });

        base.lines.forEach((line, i) => {
          const y = LINES_Y + i * lay.lineH;
          if (running && step !== null && step.line === i) {
            el('rect', { x: x + 20, y: y - lay.lineH * 0.72, width: lay.colW - 28, height: lay.lineH, rx: 4, fill: colors.accent, 'fill-opacity': 0.3 }, g);
          }
          write(g, x + 28, y, line, { 'font-family': fonts.mono, fill: ink });
        });
        if (now.state === 'ready' || now.state === 'blocked') {
          const caret = write(g, x + 10, LINES_Y + now.pc * lay.lineH, '▸', {
            fill: asleep ? colors.danger : colors.text,
            'font-weight': 700,
          });
          handles.carets.set(base.id, caret);
        }

        write(g, x + 12, HAND_LABEL_Y, t('label.hand', 'Holding'), { 'font-size': fontSizes.xs, fill: colors.textMuted });
        if (now.state === 'new') {
          write(g, x + lay.colW - 12, HAND_LABEL_Y, t('label.arrives', 'Arrives at tick {n}', { n: base.arrive }), {
            'text-anchor': 'end',
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
        } else if (now.waited > 0) {
          write(g, x + lay.colW - 12, HAND_LABEL_Y, t('label.waited', 'Ticks asleep: {n}', { n: now.waited }), {
            'text-anchor': 'end',
            'font-size': fontSizes.xs,
            fill: asleep ? colors.danger : colors.textMuted,
          });
        }
      }

      // 기다림 화살 — 기다리는 카드에서 그 자물쇠가 지금 있는 자리로
      for (const l of scene.locks) {
        if (l.owner === null) continue;
        const target = handPos(lay, l.owner, l.id);
        if (target === null) continue;
        for (const waiter of l.queue) {
          const wx = lay.cardX.get(waiter);
          if (wx === undefined) continue;
          const b = { x: target.x + lay.tokW / 2, y: target.y + TOK_H + 3 };
          const a = { x: wx + (b.x < wx ? lay.colW * 0.3 : lay.colW * 0.7), y: CARD_BOTTOM };
          const c = { x: (a.x + b.x) / 2, y: CARD_BOTTOM + DIP };
          const path = el('path', { d: '', fill: 'none', stroke: colors.danger, 'stroke-width': 2, 'stroke-dasharray': '6 4' }, arrowLayer);
          const head = el('path', { d: '', fill: colors.danger }, arrowLayer);
          const mid = quadAt(a, c, b, 0.5);
          const label = write(arrowLayer, mid.x, mid.y + 14, t('label.waits', 'waits'), {
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            fill: colors.danger,
          });
          const arrow = { path, head, label, a, c, b };
          setArrow(arrow, 1);
          handles.arrows.set(waiter, arrow);
        }
      }

      // 자물쇠 — 주인의 손 또는 제자리
      scene.base.locks.forEach((m, i) => {
        const now = scene.locks.find((l) => l.id === m);
        const owner = now?.owner ?? null;
        const pos = owner === null ? homePos(lay, m) : handPos(lay, owner, m);
        if (pos === null) return;
        const g = el('g', { transform: `translate(${r1(pos.x)} ${r1(pos.y)})` }, tokenLayer);
        const holder = owner === null ? undefined : stateOf.get(owner);
        if (holder !== undefined && holder.state === 'blocked') {
          el('rect', { x: -3, y: -3, width: lay.tokW + 6, height: TOK_H + 6, rx: 8, fill: 'none', stroke: colors.danger, 'stroke-width': 2.5 }, g);
        }
        el('rect', { x: 0, y: 0, width: lay.tokW, height: TOK_H, rx: 6, fill: palette[i % palette.length] ?? colors.primary }, g);
        write(g, lay.tokW / 2, TOK_H / 2 + smPx / 3, m, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-weight': 700,
          fill: colors.textInverse,
        });
        handles.tokens.set(m, g);
      });

      // CPU 표지
      if (step !== null) {
        const x = lay.cardX.get(step.thread);
        if (x !== undefined) {
          const g = el('g', {}, cpuLayer);
          const cx = x + lay.colW / 2;
          el('rect', { x: cx - 24, y: CPU_Y, width: 48, height: 20, rx: 5, fill: colors.primary }, g);
          write(g, cx, CPU_Y + 14, t('label.cpu', 'CPU'), {
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            'font-weight': 700,
            fill: colors.textInverse,
          });
          el('path', { d: `M ${r1(cx - 5)} ${CPU_Y + 20} L ${r1(cx + 5)} ${CPU_Y + 20} L ${r1(cx)} ${CPU_Y + 25} Z`, fill: colors.primary }, g);
          handles.cpu = g;
        }
      }

      captionLines(scene).forEach((line, i) => {
        write(captionLayer, W / 2, CAPTION_Y + i * CAPTION_GAP, line, {
          'text-anchor': 'middle',
          'font-size': i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? colors.text : colors.textMuted,
        });
      });
      return handles;
    }

    function setArrow(arrow: { path: SVGPathElement; head: SVGPathElement; label: SVGTextElement; a: Pt; c: Pt; b: Pt }, u: number): void {
      const { a, c, b } = arrow;
      const c1 = { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u };
      const end = quadAt(a, c, b, u);
      arrow.path.setAttribute('d', `M ${r1(a.x)} ${r1(a.y)} Q ${r1(c1.x)} ${r1(c1.y)} ${r1(end.x)} ${r1(end.y)}`);
      const dx = end.x - c1.x;
      const dy = end.y - c1.y;
      const len = Math.hypot(dx, dy);
      if (u <= 0 || len === 0) {
        arrow.head.setAttribute('d', '');
      } else {
        const ux = dx / len;
        const uy = dy / len;
        const s = 7;
        const p1 = { x: end.x - ux * s - uy * s * 0.6, y: end.y - uy * s + ux * s * 0.6 };
        const p2 = { x: end.x - ux * s + uy * s * 0.6, y: end.y - uy * s - ux * s * 0.6 };
        arrow.head.setAttribute('d', `M ${r1(end.x)} ${r1(end.y)} L ${r1(p1.x)} ${r1(p1.y)} L ${r1(p2.x)} ${r1(p2.y)} Z`);
      }
      if (u < 1) arrow.label.setAttribute('visibility', 'hidden');
      else arrow.label.removeAttribute('visibility');
    }

    /** p (0→1) 만큼 끝 자리로 온 화면. 0 이면 아직 출발 자리. */
    function applyMotion(scene: HoldAndWaitScene, handles: Handles, p: number): void {
      const step = scene.step;
      if (step === null) return;
      const lay = makeLayout(scene);
      const left = 1 - p;

      if (step.lock !== null && (step.kind === 'take' || step.kind === 'release')) {
        const g = handles.tokens.get(step.lock);
        const now = scene.locks.find((l) => l.id === step.lock);
        const from = step.kind === 'take' ? homePos(lay, step.lock) : handPos(lay, step.thread, step.lock);
        const to = now === undefined ? null : now.owner === null ? homePos(lay, step.lock) : handPos(lay, now.owner, step.lock);
        if (g !== undefined && from !== null && to !== null) {
          const x = to.x + (from.x - to.x) * left;
          const y = to.y + (from.y - to.y) * left;
          g.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
        }
      }

      if (step.kind === 'block') {
        const arrow = handles.arrows.get(step.thread);
        if (arrow !== undefined) setArrow(arrow, p);
      }

      if (handles.cpu !== null && step.was !== null && step.was !== step.thread) {
        const fromX = lay.cardX.get(step.was);
        const toX = lay.cardX.get(step.thread);
        if (fromX !== undefined && toX !== undefined) {
          handles.cpu.setAttribute('transform', `translate(${r1((fromX - toX) * left)} 0)`);
        }
      }

      for (const id of step.arrived) {
        const g = handles.cards.get(id);
        if (g !== undefined) g.setAttribute('transform', `translate(0 ${r1(28 * left)})`);
      }

      if (step.kind !== 'block') {
        const caret = handles.carets.get(step.thread);
        const now = scene.threads.find((th) => th.id === step.thread);
        if (caret !== undefined && now !== undefined) {
          caret.setAttribute('transform', `translate(0 ${r1((step.line - now.pc) * lay.lineH * left)})`);
        }
      }
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      const total = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const go = (k: number): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          frame(ease(k / total));
          if (k >= total) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            go(k + 1);
          }, FRAME_MS);
          timers.add(id);
        };
        go(0);
      });
    }

    return {
      async render(next: HoldAndWaitScene, _prev: HoldAndWaitScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await tween(mine, (p) => applyMotion(next, handles, p));
        if (destroyed || mine !== gen) return;
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
