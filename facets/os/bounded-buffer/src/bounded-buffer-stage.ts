/**
 * bounded-buffer stage — 가운데 칸 줄(버퍼), 왼쪽에 넣는 쪽의 손, 오른쪽에 꺼내는 쪽의 손과 꺼낸 것.
 *
 * 동사 "튕겨 나온다":
 *   - 넣기: 손의 물건이 입구로 들어가 맨 뒤 칸에 선다. 손에는 다음 번호가 온다.
 *   - 가득 찼을 때 넣기: 물건이 입구 벽에 부딪혀 호를 그리며 손으로 튕겨 돌아온다.
 *   - 꺼내기: 손이 출구로 들어가 맨 앞 물건을 쥐고 나오고, 남은 물건은 한 칸씩 앞으로 당겨진다.
 *   - 비었을 때 꺼내기: 손이 맨 앞 칸까지 들어갔다 빈손으로 돌아온다.
 *
 * 버퍼는 앞(먼저 넣은 것)을 출구 쪽(오른쪽)으로 모아 그린다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { BoundedBufferScene } from './scene.js';

const H = 310;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 700;

function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function clamp01(u: number): number {
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function easeIn(u: number): number {
  return u * u;
}

function easeOut(u: number): number {
  return 1 - (1 - u) * (1 - u);
}

/** 구간 [a, b] 안에서의 진행 비율 */
function span(t: number, a: number, b: number): number {
  return clamp01((t - a) / (b - a));
}

type Geometry = {
  m: number;
  zoneW: number;
  bx0: number;
  bx1: number;
  slotW: number;
  itemSize: number;
  bufY: number;
  bufH: number;
  pHandX: number;
  pSupplyX: number;
  cHomeX: number;
  handW: number;
  handH: number;
  trayX0: number;
  trayY: number;
  traySize: number;
  trayGap: number;
  stripX0: number;
  stripY: number;
  stripCell: number;
  captionY: number;
};

function layout(scene: BoundedBufferScene): Geometry {
  const W = PIECE_CANVAS_W;
  const m = W * 0.03;
  const zoneW = W * 0.2;
  const gap = W * 0.05;
  const bx0 = m + zoneW + gap;
  const bx1 = W - m - zoneW - gap;
  const slotW = (bx1 - bx0) / scene.capacity;
  const itemSize = Math.min(slotW * 0.7, 56);
  const bufY = 150;
  const bufH = itemSize + 20;
  const handW = itemSize + 12;
  const handH = itemSize + 12;
  const takeTurns = Math.max(1, scene.turns.filter((w) => w === scene.consumer).length);
  const trayGap = 6;
  // 꺼낸 것 줄은 버퍼 가운데부터 오른쪽 끝까지 — 꺼낼 수 있는 차례 수만큼 들어가게
  const trayX0 = (bx0 + bx1) / 2;
  const trayW = W - m - trayX0;
  const traySize = Math.min((trayW - trayGap * (takeTurns - 1)) / takeTurns, 40);
  const stripX0 = m + W * 0.12;
  const stripCell = Math.min((W - m - stripX0) / Math.max(1, scene.turns.length), 34);
  return {
    m,
    zoneW,
    bx0,
    bx1,
    slotW,
    itemSize,
    bufY,
    bufH,
    pHandX: m + zoneW * 0.62,
    pSupplyX: m + itemSize * 0.2,
    cHomeX: W - m - zoneW + handW / 2,
    handW,
    handH,
    trayX0,
    trayY: bufY + bufH / 2 + 64,
    traySize,
    trayGap,
    stripX0,
    stripY: 34,
    stripCell,
    captionY: H - 18,
  };
}

/** 버퍼 안 i 번째(0 = 맨 앞) 물건의 가운데 x */
function slotX(g: Geometry, scene: BoundedBufferScene, i: number): number {
  const s = scene.capacity - 1 - i;
  return g.bx0 + g.slotW * (s + 0.5);
}

/** 꺼낸 것 k 번째의 가운데 x */
function trayX(g: Geometry, k: number): number {
  return g.trayX0 + g.traySize / 2 + k * (g.traySize + g.trayGap);
}

type Handles = {
  items: Map<number, SVGGElement>;
  handItem: SVGGElement | null;
  cHand: SVGGElement;
  entrance: SVGLineElement;
};

export const boundedBufferStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { anchor?: string; size?: string; fill?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'dominant-baseline': 'central',
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 'normal',
        fill: opts.fill ?? colors.text,
      });
      node.textContent = text;
      return node;
    }

    /** 물건 하나 — 가운데 0,0 에 기준 크기로 그리고 transform 으로 옮긴다 */
    function drawItem(parent: Element, g: Geometry, n: number, stroke: string): SVGGElement {
      const grp = el(parent, 'g', {});
      const s = g.itemSize;
      el(grp, 'rect', {
        x: -s / 2,
        y: -s / 2,
        width: s,
        height: s,
        rx: 6,
        fill: colors.primary,
        stroke,
        'stroke-width': 2,
      });
      label(grp, 0, 0, String(n), {
        size: fontSizes.lg,
        fill: colors.textInverse,
        weight: 'bold',
        mono: true,
      });
      return grp;
    }

    function place(grp: Element, g: Geometry, x: number, y: number, size: number): void {
      const k = size / g.itemSize;
      grp.setAttribute('transform', `translate(${num(x)} ${num(y)}) scale(${num(k)})`);
    }

    function drawStatic(scene: BoundedBufferScene): Handles {
      svg.textContent = '';
      const g = layout(scene);
      const step = scene.step;
      const stepTurn = step.kind === 'start' ? -1 : step.turn;

      // 차례 줄
      label(svg, g.m, g.stripY, t('label.turns', 'Turns'), {
        anchor: 'start',
        fill: colors.textMuted,
      });
      const blocked = new Set(scene.blocked);
      scene.turns.forEach((who, i) => {
        const cx = g.stripX0 + g.stripCell * (i + 0.5);
        const current = i === stepTurn;
        const done = i <= stepTurn;
        const isBlocked = blocked.has(i);
        if (current) {
          el(svg, 'rect', {
            x: cx - g.stripCell / 2 + 2,
            y: g.stripY - g.stripCell / 2 + 2,
            width: g.stripCell - 4,
            height: g.stripCell - 4,
            rx: 4,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
          });
        }
        label(svg, cx, g.stripY, who, {
          mono: true,
          size: fontSizes.md,
          weight: current ? 'bold' : 'normal',
          fill: isBlocked ? colors.danger : done ? colors.text : colors.textMuted,
        });
        if (isBlocked) {
          el(svg, 'line', {
            x1: cx - g.stripCell * 0.25,
            y1: g.stripY + g.stripCell * 0.32,
            x2: cx + g.stripCell * 0.25,
            y2: g.stripY + g.stripCell * 0.32,
            stroke: colors.danger,
            'stroke-width': 2,
          });
        }
      });

      // 버퍼
      label(
        svg,
        (g.bx0 + g.bx1) / 2,
        g.bufY - g.bufH / 2 - 14,
        t('label.slots', 'Buffer slots: {n}', { n: scene.capacity }),
        { fill: colors.textMuted },
      );
      el(svg, 'rect', {
        x: g.bx0,
        y: g.bufY - g.bufH / 2,
        width: g.bx1 - g.bx0,
        height: g.bufH,
        fill: colors.bgSubtle,
        stroke: 'none',
      });
      for (let s = 1; s < scene.capacity; s += 1) {
        const x = g.bx0 + g.slotW * s;
        el(svg, 'line', {
          x1: x,
          y1: g.bufY - g.bufH / 2 + 6,
          x2: x,
          y2: g.bufY + g.bufH / 2 - 6,
          stroke: colors.border,
          'stroke-dasharray': '4 4',
        });
      }
      for (const yy of [g.bufY - g.bufH / 2, g.bufY + g.bufH / 2]) {
        el(svg, 'line', { x1: g.bx0, y1: yy, x2: g.bx1, y2: yy, stroke: colors.border, 'stroke-width': 2 });
      }
      const bounced = step.kind === 'putBlocked';
      const entrance = el(svg, 'line', {
        x1: g.bx0,
        y1: g.bufY - g.bufH / 2,
        x2: g.bx0,
        y2: g.bufY + g.bufH / 2,
        stroke: bounced ? colors.danger : colors.border,
        'stroke-width': bounced ? 4 : 2,
        'stroke-dasharray': bounced ? 'none' : '3 5',
      });
      el(svg, 'line', {
        x1: g.bx1,
        y1: g.bufY - g.bufH / 2,
        x2: g.bx1,
        y2: g.bufY + g.bufH / 2,
        stroke: colors.border,
        'stroke-width': 2,
        'stroke-dasharray': '3 5',
      });

      const items = new Map<number, SVGGElement>();
      scene.buffer.forEach((n, i) => {
        const grp = drawItem(svg, g, n, colors.primary);
        place(grp, g, slotX(g, scene, i), g.bufY, g.itemSize);
        items.set(n, grp);
      });

      // 넣는 쪽
      const pCx = g.m + g.zoneW / 2;
      label(svg, pCx, g.bufY - g.bufH / 2 - 14, t('label.producer', 'Producer {id}', { id: scene.producer }), {
        weight: 'bold',
      });
      const handItem = drawItem(svg, g, scene.hand, bounced ? colors.danger : colors.primary);
      place(handItem, g, g.pHandX, g.bufY, g.itemSize);
      const bouncedCount = scene.blocked.filter((i) => scene.turns[i] === scene.producer).length;
      label(
        svg,
        pCx,
        g.bufY + g.bufH / 2 + 20,
        t('label.bounced', 'Bounced: {n}', { n: bouncedCount }),
        { fill: bouncedCount > 0 ? colors.danger : colors.textMuted },
      );

      // 꺼내는 쪽
      const cCx = PIECE_CANVAS_W - g.m - g.zoneW / 2;
      label(svg, cCx, g.bufY - g.bufH / 2 - 14, t('label.consumer', 'Consumer {id}', { id: scene.consumer }), {
        weight: 'bold',
      });
      const emptyHand = step.kind === 'takeBlocked';
      const cHand = el(svg, 'g', {});
      el(cHand, 'path', {
        d: `M ${num(-g.handW / 2)} ${num(-g.handH / 2)} L ${num(g.handW / 2)} ${num(-g.handH / 2)} L ${num(
          g.handW / 2,
        )} ${num(g.handH / 2)} L ${num(-g.handW / 2)} ${num(g.handH / 2)}`,
        fill: 'none',
        stroke: emptyHand ? colors.danger : colors.text,
        'stroke-width': 3,
        'stroke-linejoin': 'round',
      });
      place(cHand, g, g.cHomeX, g.bufY, g.itemSize);
      const emptyCount = scene.blocked.filter((i) => scene.turns[i] === scene.consumer).length;
      label(
        svg,
        cCx,
        g.bufY + g.bufH / 2 + 20,
        t('label.emptyHanded', 'Empty-handed: {n}', { n: emptyCount }),
        { fill: emptyCount > 0 ? colors.danger : colors.textMuted },
      );
      label(svg, g.trayX0, g.trayY - g.traySize / 2 - 12, t('label.taken', 'Taken'), {
        anchor: 'start',
        fill: colors.textMuted,
      });
      scene.taken.forEach((n, k) => {
        const grp = drawItem(svg, g, n, colors.primary);
        place(grp, g, trayX(g, k), g.trayY, g.traySize);
        items.set(n, grp);
      });

      // 캡션
      label(svg, PIECE_CANVAS_W / 2, g.captionY, caption(scene), { size: fontSizes.md });

      return { items, handItem, cHand, entrance };
    }

    function caption(scene: BoundedBufferScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Empty slots: {n}. Each turn, one side tries once.', {
            n: scene.capacity - scene.buffer.length,
          });
        case 'put':
          return t('caption.put', 'Put item {item}.', { item: step.item });
        case 'putBlocked':
          return t('caption.putBlocked', 'All slots full — item {item} bounces back.', { item: step.item });
        case 'take':
          return t('caption.take', 'Take item {item}.', { item: step.item });
        case 'takeBlocked':
          return t('caption.takeBlocked', 'All slots empty — the hand comes back empty.');
      }
    }

    function tween(mine: number, ms: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start = -1;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          if (start < 0) start = now;
          const u = clamp01((now - start) / ms);
          frame(u);
          if (u >= 1) {
            wake();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    async function animate(next: BoundedBufferScene, h: Handles, mine: number): Promise<void> {
      const g = layout(next);
      const step = next.step;
      if (step.kind === 'put') {
        const moving = h.items.get(step.item);
        if (moving === undefined) throw new Error(`bounded-buffer stage: 넣은 물건 ${step.item} 이 화면에 없다`);
        const toX = slotX(g, next, next.buffer.length - 1);
        const hand = h.handItem;
        await tween(mine, MOVE_MS, (u) => {
          const e = easeInOut(u);
          place(moving, g, lerp(g.pHandX, toX, e), g.bufY, g.itemSize);
          if (hand !== null) {
            const a = easeOut(span(u, 0.35, 1));
            place(hand, g, lerp(g.pSupplyX, g.pHandX, a), g.bufY, g.itemSize * lerp(0.4, 1, a));
          }
        });
      } else if (step.kind === 'putBlocked') {
        const hand = h.handItem;
        if (hand === null) return;
        const wallX = g.bx0 - g.itemSize / 2;
        const entrance = h.entrance;
        await tween(mine, MOVE_MS, (u) => {
          if (u < 0.4) {
            const a = easeIn(u / 0.4);
            place(hand, g, lerp(g.pHandX, wallX, a), g.bufY, g.itemSize);
            entrance.setAttribute('stroke', colors.border);
          } else {
            const a = easeOut(span(u, 0.4, 1));
            const hop = Math.sin(Math.PI * a) * g.itemSize * 0.7;
            place(hand, g, lerp(wallX, g.pHandX, a), g.bufY - hop, g.itemSize);
            entrance.setAttribute('stroke', colors.danger);
          }
        });
      } else if (step.kind === 'take') {
        const moving = h.items.get(step.item);
        if (moving === undefined) throw new Error(`bounded-buffer stage: 꺼낸 물건 ${step.item} 이 화면에 없다`);
        const frontX = slotX(g, next, 0);
        const rest = next.buffer.map((n, i) => {
          const grp = h.items.get(n);
          if (grp === undefined) throw new Error(`bounded-buffer stage: 버퍼 물건 ${n} 이 화면에 없다`);
          return { grp, fromX: slotX(g, next, i + 1), toX: slotX(g, next, i) };
        });
        const toX = trayX(g, next.taken.length - 1);
        const cHand = h.cHand;
        await tween(mine, MOVE_MS, (u) => {
          const reach = easeInOut(span(u, 0, 0.35));
          const back = easeInOut(span(u, 0.35, 0.65));
          const drop = easeInOut(span(u, 0.65, 1));
          const handX = u < 0.35 ? lerp(g.cHomeX, frontX, reach) : lerp(frontX, g.cHomeX, back);
          place(cHand, g, handX, g.bufY, g.itemSize);
          if (u < 0.65) {
            place(moving, g, u < 0.35 ? frontX : handX, g.bufY, g.itemSize);
          } else {
            place(moving, g, lerp(g.cHomeX, toX, drop), lerp(g.bufY, g.trayY, drop), lerp(g.itemSize, g.traySize, drop));
          }
          for (const r of rest) place(r.grp, g, lerp(r.fromX, r.toX, back), g.bufY, g.itemSize);
        });
      } else if (step.kind === 'takeBlocked') {
        const frontX = slotX(g, next, 0);
        const cHand = h.cHand;
        await tween(mine, MOVE_MS, (u) => {
          const a = u < 0.5 ? easeInOut(u / 0.5) : 1 - easeInOut((u - 0.5) / 0.5);
          place(cHand, g, lerp(g.cHomeX, frontX, a), g.bufY, g.itemSize);
        });
      }
    }

    function render(
      next: BoundedBufferScene,
      _prev: BoundedBufferScene | null,
      opts: { animate: boolean },
    ): Promise<void> | void {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(next);
      if (!opts.animate || next.step.kind === 'start') return;
      return animate(next, h, mine).then(() => {
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      });
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
