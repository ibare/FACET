/**
 * negative-edge-breaks stage — 굳는 자리, 그리고 굳어서 못 나가는 소식.
 *
 * 화면의 동사는 "깨진다" 다. 그래서 두 운동이 그림의 뼈대다.
 *   1. 굳기 — 뚜껑이 거리 칸 위로 **내려앉아** 값을 물린다.
 *   2. 튕김 — 더 짧은 후보가 간선을 따라 **날아가** 굳은 정점에 부딪히고,
 *      들어가지 못한 채 옆으로 튕겨 나가 가위표를 단 채 남는다.
 *      그 뒤 그 소식이 밖으로 나가려 하면 막이 앞을 막고 되밀린다.
 * 색만 바뀌는 자리는 굳음의 결과(정점이 채워지는 것)뿐이다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 — viewBox 는 러너가 CanvasView 선언으로 한 번
 * 잡고 여기서 다시 재지 않는다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 322;

const SIDE = 56; // 좌우 여백. 출발/도착 열의 중심이 여기 선다.
const NODE_R = 25;
const MID_Y = 152; // 출발·도착 열의 높이
const SPREAD = 66; // 가운데 열이 위아래로 벌어지는 폭
const CHIP_W = 48;
const CHIP_H = 24;
const CHIP_GAP = 44; // 정점 중심에서 거리 칸 중심까지
const MINI_W = 36;
const MINI_H = 20;
const CAP_Y1 = 296;
const CAP_Y2 = 312;

const TRAVEL_MS = 520;
const SEAL_MS = 340;
const BOUNCE_MS = 220;
const PUSH_MS = 260;
const LEG_MS = 420;

// 막이 서는 자리와, 소식이 나가려다 되밀리는 거리 (정점 중심에서 잰다).
const GHOST_W = 34;
const GHOST_HOME = NODE_R + 6;
const GHOST_OUT = NODE_R + 40;
const BARRIER_AT = NODE_R + 56;

// 도형에 새기는 기호. 번역 대상이 아니다 (C10 표식).
const INF = '∞';
const MINUS = '−';
const CROSS = '✗';

export type NegativeEdgeSpec = { from: string; to: string; w: number };

export type NegativeGraphSpec = {
  nodes: string[];
  edges: NegativeEdgeSpec[];
  start: string;
  goal: string;
};

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function drop(node: Element | null): void {
  node?.parentNode?.removeChild(node);
}

/** 수를 화면 표기로. 음부호는 하이픈이 아니라 수식 기호를 쓴다. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return INF;
  return v < 0 ? `${MINUS}${Math.abs(v)}` : String(v);
}

/** 글자 폭 어림 — 한글·한자·가나는 두 칸, 나머지는 한 칸으로 센다. */
function width(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return n;
}

/** 캡션을 두 줄까지 담는다. 공백에서 끊고, 끊을 데가 없으면 글자로 끊는다. */
function wrap(text: string, cap: number): [string, string] {
  if (width(text) <= cap) return [text, ''];
  const words = text.split(' ');
  let head = '';
  let rest = '';
  for (const word of words) {
    const next = head === '' ? word : `${head} ${word}`;
    if (rest === '' && width(next) <= cap) {
      head = next;
      continue;
    }
    rest = rest === '' ? word : `${rest} ${word}`;
  }
  if (head === '') {
    // 공백이 없는 문장 — 폭이 찰 때까지 글자로 자른다.
    let acc = '';
    for (const ch of text) {
      if (width(acc + ch) > cap) break;
      acc += ch;
    }
    head = acc;
    rest = text.slice(acc.length);
  }
  return [head, rest];
}

export const negativeEdgeBreaksStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    // 캔버스 '안쪽' 만 비운다. 컨테이너를 비우면 러너가 붙여 준 캔버스가 떨어져
    // 나가고 화면이 통째로 빈다 (S-view).
    svg.textContent = '';

    const layers = {
      edge: el('g', {}),
      truth: el('g', {}),
      node: el('g', {}),
      chip: el('g', {}),
      fx: el('g', {}),
      caption: el('g', {}),
    };
    for (const g of Object.values(layers)) svg.appendChild(g);

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 유한 타이머 하나로 기다린다. 스스로 다음 회차를 예약하는 루프는 두지 않는다.
     * destroy 는 타이머를 거두고 **기다리던 것을 깨운다** — 매달아 두면 러너의
     * reset 이 algorithm 을 기다리다 함께 멎는다.
     */
    function wait(ms: number): Promise<void> {
      if (destroyed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    function place(g: SVGGElement, x: number, y: number): void {
      g.style.transition = 'none';
      g.style.transform = `translate(${x}px, ${y}px)`;
    }

    async function glide(g: SVGGElement, x: number, y: number, ms: number): Promise<void> {
      await wait(20); // 놓인 자리가 먼저 적용되게 한 틱 넘긴다
      if (destroyed) return;
      g.style.transition = `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      g.style.transform = `translate(${x}px, ${y}px)`;
      await wait(ms);
    }

    // ── 그래프 상태 ─────────────────────────────────────────────────────
    let graph: NegativeGraphSpec | null = null;
    const pos = new Map<string, Pt>();
    const distVal = new Map<string, number>();
    const chipBox = new Map<string, SVGRectElement>();
    const chipInk = new Map<string, SVGTextElement>();
    const disc = new Map<string, SVGCircleElement>();
    const discInk = new Map<string, SVGTextElement>();
    const sealed = new Set<string>();

    const capLine1 = el('text', {
      x: W / 2,
      y: CAP_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    const capLine2 = el('text', {
      x: W / 2,
      y: CAP_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    layers.caption.appendChild(capLine1);
    layers.caption.appendChild(capLine2);

    function clear(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function above(node: string): boolean {
      return (pos.get(node)?.y ?? MID_Y) <= MID_Y;
    }

    function chipCenter(node: string): Pt {
      const p = pos.get(node) ?? { x: W / 2, y: MID_Y };
      return { x: p.x, y: above(node) ? p.y - CHIP_GAP : p.y + CHIP_GAP };
    }

    /** 출발은 왼쪽, 도착은 오른쪽, 나머지는 가운데 열에 차례대로 쌓는다. */
    function layout(g: NegativeGraphSpec): void {
      pos.clear();
      const xs = SIDE;
      const xg = W - SIDE;
      const mids = g.nodes.filter((n) => n !== g.start && n !== g.goal);
      pos.set(g.start, { x: xs, y: MID_Y });
      pos.set(g.goal, { x: xg, y: MID_Y });
      const span = mids.length > 1 ? (SPREAD * 2) / (mids.length - 1) : 0;
      mids.forEach((n, i) => {
        const y = mids.length > 1 ? MID_Y - SPREAD + span * i : MID_Y;
        pos.set(n, { x: (xs + xg) / 2, y });
      });
    }

    function setChip(node: string, value: number): void {
      const ink = chipInk.get(node);
      if (ink) ink.textContent = fmt(value);
      distVal.set(node, value);
      const box = chipBox.get(node);
      if (box && Number.isFinite(value) && !sealed.has(node)) {
        box.setAttribute('stroke-dasharray', 'none');
        box.setAttribute('stroke', c.text);
      }
    }

    function markSealed(node: string): void {
      sealed.add(node);
      const d = disc.get(node);
      if (d) {
        d.setAttribute('fill', c.itemSorted);
        d.setAttribute('stroke', c.itemSorted);
        d.setAttribute('stroke-width', '4');
      }
      discInk.get(node)?.setAttribute('fill', c.textInverse);
      const box = chipBox.get(node);
      if (box) {
        box.setAttribute('fill', c.itemSorted);
        box.setAttribute('stroke', c.itemSorted);
        box.setAttribute('stroke-dasharray', 'none');
      }
      chipInk.get(node)?.setAttribute('fill', c.textInverse);
    }

    type Token = { g: SVGGElement; box: SVGRectElement; ink: SVGTextElement };

    function makeToken(text: string, fill: string, inkColor: string, w = 42, h = 24): Token {
      const g = el('g', {});
      const box = el('rect', {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        rx: 7,
        fill,
        stroke: fill,
        'stroke-width': 2,
      });
      const ink = el('text', {
        x: 0,
        y: 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: inkColor,
      });
      ink.textContent = text;
      g.appendChild(box);
      g.appendChild(ink);
      return { g, box, ink };
    }

    /** from → to 방향의 단위벡터와 왼쪽 법선. */
    function axis(from: string, to: string): { a: Pt; b: Pt; ux: number; uy: number; nx: number; ny: number } | null {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      return { a, b, ux: dx / L, uy: dy / L, nx: -dy / L, ny: dx / L };
    }

    function build(): void {
      if (!graph) return;
      clear(layers.edge);
      clear(layers.truth);
      clear(layers.node);
      clear(layers.chip);
      clear(layers.fx);
      chipBox.clear();
      chipInk.clear();
      disc.clear();
      discInk.clear();
      sealed.clear();
      distVal.clear();

      for (const e of graph.edges) {
        const ax = axis(e.from, e.to);
        if (!ax) continue;
        const p1 = { x: ax.a.x + ax.ux * NODE_R, y: ax.a.y + ax.uy * NODE_R };
        const p2 = { x: ax.b.x - ax.ux * (NODE_R + 10), y: ax.b.y - ax.uy * (NODE_R + 10) };
        layers.edge.appendChild(
          el('line', {
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            stroke: c.textMuted,
            'stroke-width': 2,
          }),
        );
        const tipX = p2.x + ax.ux * 9;
        const tipY = p2.y + ax.uy * 9;
        layers.edge.appendChild(
          el('polygon', {
            points: [
              `${tipX},${tipY}`,
              `${p2.x + ax.nx * 5},${p2.y + ax.ny * 5}`,
              `${p2.x - ax.nx * 5},${p2.y - ax.ny * 5}`,
            ].join(' '),
            fill: c.textMuted,
          }),
        );
        const mx = (p1.x + p2.x) / 2 + ax.nx * 18;
        const my = (p1.y + p2.y) / 2 + ax.ny * 18;
        layers.edge.appendChild(
          el('rect', { x: mx - 15, y: my - 10, width: 30, height: 20, rx: 5, fill: c.bg }),
        );
        const wt = el('text', {
          x: mx,
          y: my + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: e.w < 0 ? c.danger : c.text,
        });
        wt.textContent = fmt(e.w);
        layers.edge.appendChild(wt);
      }

      for (const n of graph.nodes) {
        const p = pos.get(n);
        if (!p) continue;
        const circle = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 2,
        });
        const ink = el('text', {
          x: p.x,
          y: p.y + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: c.text,
        });
        ink.textContent = n;
        layers.node.appendChild(circle);
        layers.node.appendChild(ink);
        disc.set(n, circle);
        discInk.set(n, ink);

        const cc = chipCenter(n);
        const box = el('rect', {
          x: cc.x - CHIP_W / 2,
          y: cc.y - CHIP_H / 2,
          width: CHIP_W,
          height: CHIP_H,
          rx: 6,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-dasharray': '4 3',
        });
        const val = el('text', {
          x: cc.x,
          y: cc.y + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.textMuted,
        });
        layers.chip.appendChild(box);
        layers.chip.appendChild(val);
        chipBox.set(n, box);
        chipInk.set(n, val);

        const startValue = n === graph.start ? 0 : Infinity;
        distVal.set(n, startValue);
        val.textContent = fmt(startValue);
        if (n === graph.start) {
          box.setAttribute('stroke-dasharray', 'none');
          box.setAttribute('stroke', c.text);
          val.setAttribute('fill', c.text);
        }
      }
    }

    /** 굳은 정점에 부딪혀 튕겨 나가는 후보. 들어가지 못한 채 화면에 남는다. */
    async function bounceOff(from: string, to: string, label: string, hardSeal: boolean): Promise<void> {
      const ax = axis(from, to);
      if (!ax) return;
      const tok = makeToken(label, c.itemComparing, c.stateInk);
      layers.fx.appendChild(tok.g);
      place(tok.g, ax.a.x, ax.a.y);
      const hitX = ax.b.x - ax.ux * (NODE_R + 16);
      const hitY = ax.b.y - ax.uy * (NODE_R + 16);
      await glide(tok.g, hitX, hitY, TRAVEL_MS);
      if (destroyed) return;
      if (hardSeal) {
        const ring = disc.get(to);
        ring?.setAttribute('stroke', c.danger);
        const boxOfTarget = chipBox.get(to);
        boxOfTarget?.setAttribute('stroke', c.danger);
        // 굳은 껍질은 그대로다 — 잠깐 붉게 울렸다가 제 색으로 돌아온다.
        await wait(260);
        ring?.setAttribute('stroke', c.itemSorted);
        boxOfTarget?.setAttribute('stroke', c.itemSorted);
      }
      await glide(tok.g, hitX - ax.ux * 26 - ax.nx * 46, hitY - ax.uy * 26 - ax.ny * 46, BOUNCE_MS);
      if (destroyed) return;
      tok.box.setAttribute('fill', c.danger);
      tok.box.setAttribute('stroke', c.danger);
      const strike = el('line', {
        x1: -17,
        y1: 0,
        x2: 17,
        y2: 0,
        stroke: c.stateInk,
        'stroke-width': 2,
      });
      tok.g.appendChild(strike);
    }

    // ── projector 가 부르는 표면 ────────────────────────────────────────
    const api = {
      setGraph(g: NegativeGraphSpec): void {
        if (destroyed) return;
        graph = g;
        layout(g);
        build();
      },

      reset(): void {
        if (destroyed) return;
        build();
        capLine1.textContent = '';
        capLine2.textContent = '';
      },

      setCaption(text: string): void {
        if (destroyed) return;
        const [a, b] = wrap(text, 92);
        capLine1.textContent = a;
        capLine2.textContent = b;
      },

      /** 뚜껑이 거리 칸 위로 내려앉아 값을 물린다. */
      async settle(node: string, dist: number): Promise<void> {
        if (destroyed) return;
        setChip(node, dist);
        const cc = chipCenter(node);
        const up = above(node);
        const lidG = el('g', {});
        lidG.appendChild(
          el('rect', {
            x: -(CHIP_W / 2 + 5),
            y: -5,
            width: CHIP_W + 10,
            height: 10,
            rx: 5,
            fill: c.itemSorted,
          }),
        );
        layers.chip.appendChild(lidG);
        const restY = up ? cc.y - CHIP_H / 2 - 4 : cc.y + CHIP_H / 2 + 4;
        place(lidG, cc.x, up ? restY - 48 : restY + 48);
        await glide(lidG, cc.x, restY, SEAL_MS);
        if (destroyed) return;
        markSealed(node);
      },

      /** 후보가 간선을 따라 날아가 거리 칸에 앉는다. */
      async relaxAccept(p: { from: string; to: string; candidate: number }): Promise<void> {
        if (destroyed) return;
        const a = pos.get(p.from);
        if (!a) return;
        const target = chipCenter(p.to);
        const tok = makeToken(fmt(p.candidate), c.itemComparing, c.stateInk);
        layers.fx.appendChild(tok.g);
        place(tok.g, a.x, a.y);
        await glide(tok.g, target.x, target.y, TRAVEL_MS);
        if (destroyed) return;
        setChip(p.to, p.candidate);
        chipInk.get(p.to)?.setAttribute('fill', c.text);
        // 값이 칸에 앉았으니 나르던 것은 사라진다. 운반 자체는 자리 이동으로 보였다.
        tok.g.style.transition = 'opacity 150ms linear';
        tok.g.style.opacity = '0';
        await wait(160);
        drop(tok.g);
      },

      /** 더 짧은데도 굳어 있어 받지 않는다. */
      relaxSealed(p: { from: string; to: string; candidate: number }): Promise<void> {
        return bounceOff(p.from, p.to, fmt(p.candidate), true);
      },

      /** 지금 값보다 낫지 않아 그대로 둔다. */
      relaxKept(p: { from: string; to: string; candidate: number }): Promise<void> {
        return bounceOff(p.from, p.to, fmt(p.candidate), false);
      },

      /** 막힌 소식이 밖으로 나가려다 되밀린다. */
      async blockNews(p: { node: string; to: string; wouldBe: number }): Promise<void> {
        if (destroyed) return;
        const ax = axis(p.node, p.to);
        if (!ax) return;
        const gx = ax.a.x + ax.ux * BARRIER_AT;
        const gy = ax.a.y + ax.uy * BARRIER_AT;
        layers.fx.appendChild(
          el('line', {
            x1: gx + ax.nx * 16,
            y1: gy + ax.ny * 16,
            x2: gx - ax.nx * 16,
            y2: gy - ax.ny * 16,
            stroke: c.danger,
            'stroke-width': 5,
            'stroke-linecap': 'round',
          }),
        );
        const ghost = makeToken(fmt(p.wouldBe), c.bg, c.danger, GHOST_W);
        ghost.box.setAttribute('stroke', c.danger);
        ghost.box.setAttribute('stroke-dasharray', '4 3');
        layers.fx.appendChild(ghost.g);
        const home = { x: ax.a.x + ax.ux * GHOST_HOME, y: ax.a.y + ax.uy * GHOST_HOME };
        place(ghost.g, home.x, home.y);
        await glide(ghost.g, ax.a.x + ax.ux * GHOST_OUT, ax.a.y + ax.uy * GHOST_OUT, PUSH_MS);
        await glide(ghost.g, home.x, home.y, PUSH_MS);
        if (destroyed) return;
        ghost.g.style.transition = 'opacity 150ms linear';
        ghost.g.style.opacity = '0';
        await wait(160);
        drop(ghost.g);
      },

      /** 참 최단 경로를 한 다리씩 밟으며 누계를 나른다. */
      async traceTruth(p: { path: string[]; running: number[]; total: number }): Promise<void> {
        if (destroyed || p.path.length === 0) return;
        const first = pos.get(p.path[0]);
        if (!first) return;
        const tok = makeToken(fmt(p.running[0]), c.accent, c.stateInk);
        layers.fx.appendChild(tok.g);
        place(tok.g, first.x, first.y);

        for (let i = 1; i < p.path.length; i += 1) {
          const to = p.path[i];
          const ax = axis(p.path[i - 1], to);
          if (!ax) continue;
          layers.truth.appendChild(
            el('line', {
              x1: ax.a.x + ax.ux * NODE_R,
              y1: ax.a.y + ax.uy * NODE_R,
              x2: ax.b.x - ax.ux * NODE_R,
              y2: ax.b.y - ax.uy * NODE_R,
              stroke: c.accent,
              'stroke-width': 6,
              'stroke-linecap': 'round',
            }),
          );
          await glide(tok.g, ax.b.x, ax.b.y, LEG_MS);
          if (destroyed) return;
          const val = p.running[i];
          tok.ink.textContent = fmt(val);
          // 굳혀 둔 수와 다른 자리에만 참값을 남긴다 — 어긋난 곳이 곧 논점이다.
          if (to !== (graph?.goal ?? '') && val !== distVal.get(to)) {
            const cc = chipCenter(to);
            const mx = cc.x - CHIP_W / 2 - 4 - MINI_W / 2;
            layers.chip.appendChild(
              el('rect', {
                x: mx - MINI_W / 2,
                y: cc.y - MINI_H / 2,
                width: MINI_W,
                height: MINI_H,
                rx: 5,
                fill: c.accent,
                stroke: c.accent,
                'stroke-width': 2,
              }),
            );
            const mini = el('text', {
              x: mx,
              y: cc.y + 1,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              'font-weight': 600,
              fill: c.stateInk,
            });
            mini.textContent = fmt(val);
            layers.chip.appendChild(mini);
          }
        }

        // 마지막 다리를 마친 누계가 도착점 아래 내려앉아 참값 칸이 된다.
        const gp = graph ? pos.get(graph.goal) : undefined;
        if (gp) await glide(tok.g, gp.x, gp.y + CHIP_GAP, LEG_MS * 0.7);
        if (destroyed) return;
        tok.ink.textContent = fmt(p.total);
      },

      /** 굳혀 놓은 수와 참값을 나란히 세운다. 틀린 수는 지우지 않고 남긴다. */
      showVerdict(goal: string): void {
        if (destroyed) return;
        const cc = chipCenter(goal);
        const mark = el('text', {
          x: cc.x + CHIP_W / 2 + 10,
          y: cc.y + 1,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: c.danger,
        });
        mark.textContent = CROSS;
        layers.chip.appendChild(mark);

        const settledTag = el('text', {
          x: cc.x,
          y: cc.y - CHIP_H / 2 - 8,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        settledTag.textContent = tr('label.settled', 'settled');
        layers.chip.appendChild(settledTag);

        const gp = pos.get(goal);
        if (gp) {
          const trueTag = el('text', {
            x: gp.x,
            y: gp.y + CHIP_GAP + CHIP_H / 2 + 16,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          });
          trueTag.textContent = tr('label.true', 'true');
          layers.chip.appendChild(trueTag);
        }
        // 굳힌 수와 참값이 각각 얼마인지는 캡션이 말한다 (C10).
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨워 보낸다. 매달아 두면 러너의 reset 이 함께 멎는다.
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return api;
  },
};
