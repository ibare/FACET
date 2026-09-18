/**
 * 빈자리 채우기 — 무대.
 *
 * 위에 대기열이 한 줄로 서 있고, 아래에 자리 셋이 가로 줄(자리마다 한 줄)로 누워 있다.
 * 줄의 왼끝이 자리이고 오른쪽은 걸음마다 한 칸씩 쌓이는 칸-걸음 기록이다.
 *
 * 한 걸음의 운동은 셋이다.
 *   1. 밀려 들어감 — 빈 자리가 있으면 대기열 맨 앞 카드가 그 자리로 내려앉고 대기열이 한 칸씩 당겨진다
 *   2. 토큰 — 앉은 카드마다 점 하나가 떨어져 나와 이번 걸음의 칸으로 날아간다
 *   3. 비움 — 낼 수를 다 채운 카드가 자리를 떠난다. 빈자리는 다음 걸음 1 에서 채워진다
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
import type { RefillScene } from './scene.js';

const H = 380;
const NS = 'http://www.w3.org/2000/svg';

const FILL_MS = 560;
const TOKEN_MS = 520;
const LEAVE_MS = 420;

/** 자리 셈 — 전부 캔버스 폭과 바탕에서 역산한다. 상수는 상한뿐이다. */
type Geometry = {
  qX: number;
  qY: number;
  pitch: number;
  cw: number;
  ch: number;
  laneTop: number;
  laneGap: number;
  x0: number;
  colW: number;
  dotGap: number;
  dotR: number;
  headerY: number;
  tallyY: number;
};

function geometryOf(scene: RefillScene): Geometry {
  const W = PIECE_CANVAS_W;
  const qX = 76;
  const n = Math.max(1, scene.requests.length);
  const pitch = Math.min(76, (W - qX - 16) / n);
  const cw = Math.min(68, pitch - 8);
  const ch = 44;
  const x0 = qX + cw + 24;
  const colW = Math.min(76, (W - 16 - x0) / Math.max(1, scene.steps));
  const maxTokens = Math.max(1, ...scene.requests.map((r) => r.tokens));
  const dotGap = Math.min(10, (cw - 16) / maxTokens);
  // 줄 간격은 남은 세로에서 나눈다 — 세로는 고정이고 자리 수가 늘면 줄이 좁아진다.
  const laneTop = 132;
  const laneGap = Math.min(56, (292 - laneTop) / Math.max(1, scene.slots));
  return {
    qX,
    qY: 32,
    pitch,
    cw,
    ch: Math.min(ch, laneGap - 8),
    laneTop,
    laneGap,
    x0,
    colW,
    dotGap,
    dotR: Math.min(3.5, dotGap * 0.36),
    headerY: laneTop - 10,
    tallyY: laneTop + laneGap * Math.max(1, scene.slots) + 14,
  };
}

const r2 = (v: number): number => {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
};

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

function queuePos(g: Geometry, index: number): [number, number] {
  return [g.qX + index * g.pitch, g.qY];
}

function seatPos(g: Geometry, slot: number): [number, number] {
  return [g.qX, g.laneTop + (slot - 1) * g.laneGap];
}

function dotPos(g: Geometry, index: number): [number, number] {
  return [8 + g.dotR + index * g.dotGap, g.ch - 11];
}

function cellCenter(g: Geometry, slot: number, t: number): [number, number] {
  const [, y] = seatPos(g, slot);
  return [g.x0 + (t - 0.5) * g.colW, y + g.ch / 2];
}

type Handles = {
  cards: Map<string, SVGGElement>;
  cells: Map<string, SVGGElement>;
  overlay: SVGGElement;
};

export const refillTheEmptySlotStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance & SceneRenderer<RefillScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

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
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      body: string,
      style: { size?: string; fill?: string; anchor?: string; weight?: number; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': style.mono ? fonts.mono : fonts.body,
          'font-size': style.size ?? fontSizes.sm,
          fill: style.fill ?? c.text,
          'text-anchor': style.anchor ?? 'start',
          'font-weight': style.weight ?? 400,
        },
        parent,
      );
      node.textContent = body;
      return node;
    }

    function colorOf(scene: RefillScene, id: string): string {
      const palette = categorical(Math.max(1, scene.requests.length));
      const i = scene.requests.findIndex((r) => r.id === id);
      return palette[i < 0 ? 0 : i] ?? c.primary;
    }

    function tokensOf(scene: RefillScene, id: string): number {
      return scene.requests.find((r) => r.id === id)?.tokens ?? 0;
    }

    /** 요청 카드 — 이름과 낼 토큰 점. 찬 점이 남은 것, 빈 점이 이미 낸 것. */
    function card(
      parent: Element,
      scene: RefillScene,
      g: Geometry,
      id: string,
      left: number,
      x: number,
      y: number,
    ): SVGGElement {
      const color = colorOf(scene, id);
      const group = el('g', { transform: `translate(${r2(x)},${r2(y)})` }, parent);
      el('rect', { x: 0, y: 0, width: r2(g.cw), height: r2(g.ch), rx: 6, fill: c.bg, stroke: color, 'stroke-width': 2 }, group);
      label(group, 8, 16, id, { mono: true, weight: 700, size: fontSizes.sm });
      const total = tokensOf(scene, id);
      for (let i = 0; i < total; i += 1) {
        const [cx, cy] = dotPos(g, i);
        el(
          'circle',
          {
            cx: r2(cx),
            cy: r2(cy),
            r: r2(g.dotR),
            fill: i < left ? color : 'none',
            stroke: color,
            'stroke-width': 1,
          },
          group,
        );
      }
      return group;
    }

    function captions(scene: RefillScene): [string, string] {
      const s = scene.step;
      if (s === null) {
        if (scene.slots === 0) return ['', ''];
        return [
          t('caption.ready', '{n} requests wait in the queue; {k} slots are empty.', {
            n: scene.requests.length,
            k: scene.slots,
          }),
          '',
        ];
      }
      let first: string;
      const firstFill = s.fills[0];
      if (s.t === 1 && s.fills.length > 0) {
        first = t('caption.fillStart', 'Step {t}: the batch starts — requests taken from the head of the queue: {n}.', {
          t: s.t,
          n: s.fills.length,
        });
      } else if (s.fills.length === 1 && firstFill !== undefined) {
        first = t('caption.fillOne', 'Step {t}: slot {slot} opened at the end of the last step — {req}, first in the queue, moves in now.', {
          t: s.t,
          slot: firstFill.slot,
          req: firstFill.req,
        });
      } else if (s.fills.length > 1) {
        first = t('caption.fillMany', 'Step {t}: {n} empty slots take the first {n} requests in the queue.', {
          t: s.t,
          n: s.fills.length,
        });
      } else if (s.idle.length > 0) {
        first = t('caption.idle', 'Step {t}: the queue is empty, so idle slots this step: {n}.', {
          t: s.t,
          n: s.idle.length,
        });
      } else {
        first = t('caption.full', 'Step {t}: no slot is free — each seated request emits one token.', { t: s.t });
      }

      const allDone = scene.queue.length === 0 && scene.seats.every((x) => x === null);
      let second = '';
      const done = s.finished[0];
      if (allDone) {
        const used = scene.cells.filter((x) => x.req !== null).length;
        second = t('caption.end', 'All {n} requests done in {steps} steps: {cells} slot-steps, {idle} of them idle.', {
          n: scene.requests.length,
          steps: s.t,
          cells: scene.cells.length,
          idle: scene.cells.length - used,
        });
      } else if (s.finished.length === 1 && done !== undefined) {
        second = t('caption.doneOne', '{req} is done and leaves slot {slot} at the end of this step.', {
          req: done.req,
          slot: done.slot,
        });
      } else if (s.finished.length > 1) {
        second = t('caption.doneMany', 'Requests finishing at the end of this step: {n}.', { n: s.finished.length });
      }
      return [first, second];
    }

    function drawStatic(scene: RefillScene): Handles {
      svg.textContent = '';
      const root = el('g', {}, svg);
      const cards = new Map<string, SVGGElement>();
      const cells = new Map<string, SVGGElement>();
      if (scene.slots === 0) {
        return { cards, cells, overlay: el('g', {}, root) };
      }
      const g = geometryOf(scene);
      const now = scene.step?.t ?? 0;
      const laneBottom = g.laneTop + g.laneGap * scene.slots - (g.laneGap - g.ch);

      // 이번 걸음의 세로 띠
      if (now > 0) {
        el(
          'rect',
          {
            x: r2(g.x0 + (now - 1) * g.colW),
            y: r2(g.headerY - 14),
            width: r2(g.colW),
            height: r2(laneBottom - g.headerY + 18),
            rx: 4,
            fill: c.bgSubtle,
          },
          root,
        );
      }

      // 머리 — 대기열 이름과 걸음 번호
      label(root, g.qX, g.qY - 8, t('label.queue', 'Queue'), { size: fontSizes.xs, fill: c.textMuted });
      if (scene.queue.length === 0) {
        label(root, g.qX + 4, g.qY + g.ch / 2 + 4, t('label.queueEmpty', 'empty'), {
          size: fontSizes.xs,
          fill: c.textMuted,
        });
      }
      for (let k = 1; k <= scene.steps; k += 1) {
        label(root, g.x0 + (k - 0.5) * g.colW, g.headerY, t('label.stepCol', 'step {t}', { t: k }), {
          size: fontSizes.xs,
          anchor: 'middle',
          fill: k === now ? c.text : c.textMuted,
          weight: k === now ? 700 : 400,
        });
      }

      // 자리 — 이름과 빈 틀
      for (let s = 1; s <= scene.slots; s += 1) {
        const [sx, sy] = seatPos(g, s);
        label(root, 20, sy + g.ch / 2 + 4, t('label.slot', 'Slot {n}', { n: s }), {
          size: fontSizes.xs,
          fill: c.textMuted,
        });
        el(
          'rect',
          {
            x: r2(sx),
            y: r2(sy),
            width: r2(g.cw),
            height: r2(g.ch),
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 3',
          },
          root,
        );
        if (scene.seats[s - 1] === null) {
          label(root, sx + g.cw / 2, sy + g.ch / 2 + 4, t('label.empty', 'free'), {
            size: fontSizes.xs,
            fill: c.textMuted,
            anchor: 'middle',
          });
        }
        el(
          'line',
          {
            x1: r2(g.x0),
            y1: r2(sy + g.ch / 2),
            x2: r2(g.x0 + g.colW * scene.steps),
            y2: r2(sy + g.ch / 2),
            stroke: c.border,
            'stroke-width': 1,
          },
          root,
        );
      }

      // 칸-걸음 기록. 요청이 처음 들어온 칸에는 들어온 표식(왼 모서리 삼각)을 둔다.
      const firstT = new Map<string, number>();
      for (const cell of scene.cells) {
        if (cell.req === null) continue;
        const was = firstT.get(cell.req);
        if (was === undefined || cell.t < was) firstT.set(cell.req, cell.t);
      }
      const cellLayer = el('g', {}, root);
      const cw = g.colW - 6;
      const chh = g.ch - 8;
      for (const cell of scene.cells) {
        const [cx, cy] = cellCenter(g, cell.slot, cell.t);
        const group = el('g', { transform: `translate(${r2(cx)},${r2(cy)})` }, cellLayer);
        if (cell.req === null) {
          el(
            'rect',
            {
              x: r2(-cw / 2),
              y: r2(-chh / 2),
              width: r2(cw),
              height: r2(chh),
              rx: 4,
              fill: 'none',
              stroke: c.danger,
              'stroke-dasharray': '3 3',
            },
            group,
          );
          label(group, 0, 4, t('label.idleCell', 'idle'), { size: fontSizes.xs, fill: c.danger, anchor: 'middle' });
        } else {
          const color = colorOf(scene, cell.req);
          el(
            'rect',
            {
              x: r2(-cw / 2),
              y: r2(-chh / 2),
              width: r2(cw),
              height: r2(chh),
              rx: 4,
              fill: color,
              'fill-opacity': 0.35,
              stroke: color,
            },
            group,
          );
          label(group, 0, 4, cell.req, { size: fontSizes.xs, anchor: 'middle', mono: true });
          if (firstT.get(cell.req) === cell.t) {
            const lx = -cw / 2;
            el(
              'path',
              {
                d: `M${r2(lx)},${r2(-6)} L${r2(lx + 7)},0 L${r2(lx)},6 Z`,
                fill: c.accent,
                stroke: c.text,
                'stroke-width': 0.5,
              },
              group,
            );
          }
        }
        cells.set(`${cell.slot}:${cell.t}`, group);
      }

      // 카드 — 대기열에 선 것과 자리에 앉은 것
      const cardLayer = el('g', {}, root);
      scene.queue.forEach((id, i) => {
        const [x, y] = queuePos(g, i);
        cards.set(id, card(cardLayer, scene, g, id, scene.left[id] ?? 0, x, y));
      });
      scene.seats.forEach((id, i) => {
        if (id === null) return;
        const [x, y] = seatPos(g, i + 1);
        cards.set(id, card(cardLayer, scene, g, id, scene.left[id] ?? 0, x, y));
      });

      // 합 — 기록에서 센다
      if (scene.cells.length > 0) {
        const used = scene.cells.filter((x) => x.req !== null).length;
        label(
          root,
          g.x0 + g.colW * scene.steps,
          g.tallyY,
          t('label.tally', 'slot-steps {cells} = used {used} + idle {idle}', {
            cells: scene.cells.length,
            used,
            idle: scene.cells.length - used,
          }),
          { size: fontSizes.sm, anchor: 'end', fill: c.textMuted },
        );
      }

      const [line1, line2] = captions(scene);
      label(root, 20, H - 38, line1, { size: fontSizes.md });
      label(root, 20, H - 14, line2, { size: fontSizes.md, fill: c.textMuted });

      return { cards, cells, overlay: el('g', {}, root) };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const start = performance.now();
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish(true);
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

    const place = (node: Element, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
    };

    async function play(scene: RefillScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const g = geometryOf(scene);

      // 운동 1 — 밀려 들어감. 카드는 이미 끝 자리에 서 있으니 못 온 만큼 되돌려 둔다.
      const moves: { node: SVGGElement; from: [number, number]; to: [number, number] }[] = [];
      for (const f of step.fills) {
        const node = h.cards.get(f.req);
        if (node) moves.push({ node, from: queuePos(g, f.from), to: seatPos(g, f.slot) });
      }
      if (step.fills.length > 0) {
        scene.queue.forEach((id, j) => {
          const node = h.cards.get(id);
          if (node) moves.push({ node, from: queuePos(g, j + step.fills.length), to: queuePos(g, j) });
        });
      }

      // 이번 걸음 끝에 떠나는 카드는 장면에 없다 — 떠나기 전까지 겉그림으로 세운다.
      const ghosts: SVGGElement[] = [];
      for (const f of step.finished) {
        const [x, y] = seatPos(g, f.slot);
        ghosts.push(card(h.overlay, scene, g, f.req, 0, x, y));
      }

      // 토큰을 낼 점 — 떨어져 나가기 전까지 카드 안에 찬 점으로 붙어 있다.
      const pending: { dot: SVGCircleElement; e: (typeof step.emits)[number] }[] = [];
      for (const e of step.emits) {
        const host = step.finished.some((f) => f.req === e.req)
          ? ghosts[step.finished.findIndex((f) => f.req === e.req)]
          : h.cards.get(e.req);
        if (!host) continue;
        const [dx, dy] = dotPos(g, e.left);
        const dot = el('circle', { cx: r2(dx), cy: r2(dy), r: r2(g.dotR), fill: colorOf(scene, e.req) }, host);
        pending.push({ dot, e });
      }

      const fresh: [string, SVGGElement][] = [];
      for (const [key, node] of h.cells) {
        if (key.endsWith(`:${step.t}`)) fresh.push([key, node]);
      }
      /** 칸은 제 칸 가운데에 선다 — 자리는 장면에서 셈한다. */
      const cellAt = (node: SVGGElement, key: string, scale: number): void => {
        const [slot, tt] = key.split(':').map(Number);
        const [cx, cy] = cellCenter(g, slot ?? 1, tt ?? step.t);
        node.setAttribute('transform', `translate(${r2(cx)},${r2(cy)}) scale(${r2(scale)})`);
      };
      for (const [key, node] of fresh) cellAt(node, key, 0);

      for (const m of moves) place(m.node, m.from[0], m.from[1]);
      if (moves.length > 0) {
        const ok = await tween(FILL_MS, mine, (p) => {
          const k = ease(p);
          for (const m of moves) {
            place(m.node, m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k);
          }
        });
        if (!ok) return;
      }

      // 운동 2 — 토큰. 점이 카드에서 떨어져 이번 걸음의 칸으로 날아간다.
      const flights = pending.map(({ dot, e }) => {
        dot.remove();
        const [sx, sy] = seatPos(g, e.slot);
        const [dx, dy] = dotPos(g, e.left);
        const from: [number, number] = [sx + dx, sy + dy];
        const to = cellCenter(g, e.slot, step.t);
        const fly = el('circle', { cx: r2(from[0]), cy: r2(from[1]), r: r2(g.dotR), fill: colorOf(scene, e.req) }, h.overlay);
        return { fly, from, to };
      });
      const ok2 = await tween(TOKEN_MS, mine, (p) => {
        const k = ease(Math.min(1, p / 0.7));
        for (const f of flights) {
          f.fly.setAttribute('cx', String(r2(f.from[0] + (f.to[0] - f.from[0]) * k)));
          f.fly.setAttribute('cy', String(r2(f.from[1] + (f.to[1] - f.from[1]) * k)));
        }
        const s = Math.max(0, Math.min(1, (p - 0.55) / 0.45));
        for (const [key, node] of fresh) cellAt(node, key, s);
      });
      for (const f of flights) f.fly.remove();
      if (!ok2) return;
      for (const [key, node] of fresh) cellAt(node, key, 1);

      // 운동 3 — 비움. 다 낸 카드가 자리를 떠나 빈 틀이 드러난다.
      if (ghosts.length > 0) {
        const starts = step.finished.map((f) => seatPos(g, f.slot));
        await tween(LEAVE_MS, mine, (p) => {
          const k = ease(p);
          ghosts.forEach((node, i) => {
            const s = starts[i];
            if (!s) return;
            place(node, s[0] - 40 * k, s[1]);
            node.setAttribute('opacity', String(r2(1 - k)));
          });
        });
      }
    }

    return {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await play(next, h, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
