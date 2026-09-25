/**
 * TTL 만료 stage — 탐침마다 한 줄. 줄은 탐침이 간 만큼 오른쪽으로 뻗고, 답이 그 끝에서
 * 보내는 이 쪽으로 되돌아온다. 줄이 쌓일수록 닿는 자리가 한 칸씩 멀어진다.
 *
 * 맨 위는 길(보내는 이 · 라우터 · 목적지)이고, 그 아래 줄들이 탐침의 자취다.
 * 마지막 걸음에서 답에 실려 온 주소들이 길 위 라우터 자리로 올라가 알아낸 길이 된다.
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
} from '@ffacet/core/runtime';
import type { TtlAnswer, TtlBase, TtlExpiredReportsScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 시간 (ms) */
const HOP_MS = 280;
const HOLD_MS = 160;
const DROP_MS = 260;
const RETURN_BASE_MS = 220;
const RETURN_PER_HOP_MS = 140;
const RISE_MS = 700;

type Layout = {
  laneY: number;
  addrY: number;
  roleY: number;
  nodeR: number;
  xs: number[];
  rowTop: number;
  rowH: number;
  caption1Y: number;
  caption2Y: number;
  labelX: number;
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function layoutFor(base: TtlBase): Layout {
  const W = PIECE_CANVAS_W;
  const stops = base.routers.length + 2;
  const labelX = 14;
  const left = Math.min(150, W * 0.24);
  const right = W - 44;
  const gap = (right - left) / (stops - 1);
  const xs: number[] = [];
  for (let i = 0; i < stops; i += 1) xs.push(round(left + gap * i));
  const caption2Y = H - 14;
  const caption1Y = caption2Y - 20;
  const rowTop = 112;
  const rowBottom = caption1Y - 22;
  const rows = base.routers.length + 1;
  const rowH = Math.min(46, (rowBottom - rowTop) / rows);
  return {
    laneY: 52,
    addrY: 86,
    roleY: 22,
    nodeR: Math.min(15, gap * 0.16),
    xs,
    rowTop,
    rowH,
    caption1Y,
    caption2Y,
    labelX,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
  parent.appendChild(node);
  return node;
}

type RowHandles = {
  outLine: SVGLineElement;
  retLine: SVGLineElement;
  arrow: SVGPathElement;
  mark: SVGGElement;
  label: SVGTextElement;
  ring: SVGCircleElement | null;
  outY: number;
  retY: number;
  labelY: number;
};

function reachX(lay: Layout, a: TtlAnswer): number {
  const x = lay.xs[a.at + 1];
  if (x === undefined) throw new Error(`ttl-expired-reports: 자리 ${a.at} 가 길에 없다`);
  return x;
}

function rowCenter(lay: Layout, i: number): number {
  return lay.rowTop + lay.rowH * (i + 0.5);
}

/** 답의 종류마다 한 색 — 시간 초과는 상태색, 목적지의 다른 답은 강조색 */
function replyColor(c: Palette, a: TtlAnswer): string {
  return a.fate === 'expired' ? c.itemComparing : c.accent;
}

/** 배경 위에 쓰는 답의 주소 글자. 노랑은 흰 배경에서 읽히지 않아 글자색으로 둔다 */
function replyTextColor(c: Palette, a: TtlAnswer): string {
  return a.fate === 'expired' ? c.itemComparing : c.text;
}

export const ttlExpiredReportsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const monoXs = parseFloat(fontSizes.xs);
    const monoSm = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
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
          const p = Math.min(1, (Date.now() - start) / ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          frame(e);
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

    function hold(ms: number, mine: number): Promise<boolean> {
      return tween(ms, mine, () => undefined);
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    }

    function captionLines(scene: TtlExpiredReportsScene, base: TtlBase): [string, string] {
      const step = scene.step;
      if (step.kind === 'ready') {
        return [
          t('caption.ready', 'Destination: {dst}', { dst: base.destination }),
          t('caption.readyHow', 'Probes go out with TTL 1 first, then one more each time.'),
        ];
      }
      if (step.kind === 'done') {
        return [
          t('caption.done', 'The destination answered, so probing stops.'),
          t('caption.doneCount', 'Probes sent: {n} · routers that sent Time Exceeded: {m}', {
            n: step.probes,
            m: step.routers,
          }),
        ];
      }
      const a = scene.answers[step.index];
      if (a === undefined) throw new Error(`ttl-expired-reports: 답 ${step.index} 가 장면에 없다`);
      if (a.fate === 'expired') {
        const router = base.routers[a.at];
        if (router === undefined) throw new Error(`ttl-expired-reports: 라우터 ${a.at} 가 없다`);
        return [
          t('caption.expired', 'Probe TTL {ttl}: its life runs out at {router} and it is dropped.', {
            ttl: a.ttl,
            router: router.name,
          }),
          t('caption.expiredReply', 'Answer back: Time Exceeded · {addr}', { addr: a.from }),
        ];
      }
      return [
        t('caption.arrived', 'Probe TTL {ttl}: it reaches the destination. TTL left: {left}.', {
          ttl: a.ttl,
          left: a.left,
        }),
        t('caption.arrivedReply', 'Answer back: Port Unreachable · {addr}', { addr: a.from }),
      ];
    }

    /** 장면 전체를 세운다. 이번 걸음 줄의 손잡이를 돌려준다. */
    function drawStatic(
      scene: TtlExpiredReportsScene,
    ): { lay: Layout; row: RowHandles | null; laneAddrs: SVGTextElement[] } | null {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return null;
      const lay = layoutFor(base);
      const step = scene.step;
      const current = step.kind === 'probe' ? step.index : -1;
      const nRows = base.routers.length + 1;
      const rowsBottom = lay.rowTop + lay.rowH * nRows;
      const lastX = lay.xs[lay.xs.length - 1] ?? 0;
      const firstX = lay.xs[0] ?? 0;

      // 세로 안내선 — 줄의 끝이 어느 라우터인지 읽게 한다
      const guides = el(svg, 'g', {});
      for (let i = 1; i < lay.xs.length; i += 1) {
        const x = lay.xs[i] ?? 0;
        el(guides, 'line', {
          x1: x,
          y1: lay.addrY + 12,
          x2: x,
          y2: rowsBottom,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 4',
        });
      }

      // 길
      const lane = el(svg, 'g', {});
      el(lane, 'line', { x1: firstX, y1: lay.laneY, x2: lastX, y2: lay.laneY, stroke: c.border, 'stroke-width': 2 });
      text(lane, firstX, lay.roleY, t('label.sender', 'Sender'), { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
      text(lane, lastX, lay.roleY, t('label.destination', 'Destination'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'middle',
      });
      const box = lay.nodeR * 2;
      el(lane, 'rect', {
        x: firstX - box / 2,
        y: lay.laneY - box / 2,
        width: box,
        height: box,
        rx: 3,
        fill: c.bgSubtle,
        stroke: c.primary,
        'stroke-width': 2,
      });
      text(lane, firstX, lay.addrY, base.sender, { size: fontSizes.xs, fill: c.text, anchor: 'middle', mono: true });

      const answeredAt = new Map<number, TtlAnswer>();
      for (const a of scene.answers) answeredAt.set(a.at, a);
      const reachNow = current >= 0 ? scene.answers[current]?.at ?? -1 : -1;

      let ring: SVGCircleElement | null = null;
      const laneAddrs: SVGTextElement[] = [];
      for (let i = 0; i < base.routers.length; i += 1) {
        const r = base.routers[i];
        const x = lay.xs[i + 1];
        if (r === undefined || x === undefined) continue;
        const a = answeredAt.get(i);
        if (i === reachNow) {
          ring = el(lane, 'circle', {
            cx: x,
            cy: lay.laneY,
            r: lay.nodeR + 5,
            fill: 'none',
            stroke: c.danger,
            'stroke-width': 2,
          });
        }
        el(lane, 'circle', {
          cx: x,
          cy: lay.laneY,
          r: lay.nodeR,
          fill: c.bg,
          stroke: a !== undefined ? c.itemComparing : c.textMuted,
          'stroke-width': 2,
        });
        text(lane, x, lay.laneY + 1, r.name, { size: fontSizes.sm, fill: c.text, anchor: 'middle', weight: '600' });
        if (step.kind === 'done' && a !== undefined) {
          laneAddrs.push(
            text(lane, x, lay.addrY, a.from, { size: fontSizes.xs, fill: c.itemComparing, anchor: 'middle', mono: true }),
          );
        }
      }
      const destIdx = base.routers.length;
      if (destIdx === reachNow) {
        ring = el(lane, 'circle', {
          cx: lastX,
          cy: lay.laneY,
          r: lay.nodeR + 5,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 2,
        });
      }
      el(lane, 'rect', {
        x: lastX - box / 2,
        y: lay.laneY - box / 2,
        width: box,
        height: box,
        rx: 3,
        fill: c.bgSubtle,
        stroke: answeredAt.has(destIdx) ? c.accent : c.textMuted,
        'stroke-width': 2,
      });
      text(lane, lastX, lay.addrY, base.destination, { size: fontSizes.xs, fill: c.text, anchor: 'middle', mono: true });

      // 탐침 줄
      let row: RowHandles | null = null;
      scene.answers.forEach((a, i) => {
        const yc = rowCenter(lay, i);
        const outY = yc - 9;
        const retY = yc + 1;
        const labelY = yc + 15;
        const rx = reachX(lay, a);
        const g = el(svg, 'g', {});
        if (current >= 0 && i !== current) g.setAttribute('opacity', '0.55');
        const rc = replyColor(c, a);

        text(g, lay.labelX, yc - 5, t('label.ttl', 'TTL {ttl}', { ttl: a.ttl }), {
          size: fontSizes.sm,
          fill: c.primary,
          mono: true,
          weight: '600',
        });
        text(g, lay.labelX, yc + 11, t('label.port', 'port {port}', { port: a.port }), {
          size: fontSizes.xs,
          fill: c.textMuted,
          mono: true,
        });

        const outLine = el(g, 'line', {
          x1: firstX,
          y1: outY,
          x2: rx,
          y2: outY,
          stroke: c.primary,
          'stroke-width': 2,
        });
        const retLine = el(g, 'line', {
          x1: rx,
          y1: retY,
          x2: firstX + 6,
          y2: retY,
          stroke: rc,
          'stroke-width': 2,
          'stroke-dasharray': '5 3',
        });
        const arrow = el(g, 'path', {
          d: `M ${round(firstX)} ${round(retY)} l 7 -4 l 0 8 z`,
          fill: rc,
        });
        const mark = el(g, 'g', {});
        if (a.fate === 'expired') {
          const s = 5;
          el(mark, 'path', {
            d: `M ${round(rx - s)} ${round(outY - s)} L ${round(rx + s)} ${round(outY + s)} M ${round(rx + s)} ${round(outY - s)} L ${round(rx - s)} ${round(outY + s)}`,
            stroke: c.danger,
            'stroke-width': 2,
          });
        } else {
          el(mark, 'circle', { cx: rx, cy: outY, r: 5, fill: c.accent, stroke: c.text, 'stroke-width': 1 });
        }
        const label = el(g, 'text', {
          x: firstX + 6,
          y: labelY,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'dominant-baseline': 'middle',
        });
        const addr = el(label, 'tspan', { fill: replyTextColor(c, a), 'font-weight': '600' });
        addr.textContent = a.from;
        const kind = el(label, 'tspan', { fill: c.textMuted, dx: 8 });
        kind.textContent = t('label.icmp', 'type {type} code {code}', { type: a.icmpType, code: a.icmpCode });

        if (i === current) row = { outLine, retLine, arrow, mark, label, ring, outY, retY, labelY };
      });

      // 캡션
      const [line1, line2] = captionLines(scene, base);
      text(svg, PIECE_CANVAS_W / 2, lay.caption1Y, line1, { size: fontSizes.md, fill: c.text, anchor: 'middle' });
      text(svg, PIECE_CANVAS_W / 2, lay.caption2Y, line2, { size: fontSizes.sm, fill: c.textMuted, anchor: 'middle' });
      return { lay, row, laneAddrs };
    }

    function chip(
      x: number,
      y: number,
      body: string,
      fill: string,
      ink: string,
      size: number,
    ): { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement } {
      const w = body.length * size * 0.62 + 12;
      const h = size + 8;
      const g = el(svg, 'g', { transform: `translate(${round(x)} ${round(y)})` });
      const rect = el(g, 'rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4, fill });
      const tx = el(g, 'text', {
        x: 0,
        y: 1,
        'font-family': fonts.mono,
        'font-size': `${size}px`,
        fill: ink,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      tx.textContent = body;
      return { g, rect, label: tx };
    }

    function place(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${round(x)} ${round(y)})`);
    }

    /** 탐침 하나가 가서 답이 돌아온다. */
    async function playProbe(scene: TtlExpiredReportsScene, mine: number): Promise<void> {
      const drawn = drawStatic(scene);
      if (drawn === null || drawn.row === null || scene.step.kind !== 'probe') return;
      const { lay, row } = drawn;
      const a = scene.answers[scene.step.index];
      if (a === undefined) return;
      const x0 = lay.xs[0] ?? 0;
      const rx = reachX(lay, a);
      const rc = replyColor(c, a);

      // 아직 못 온 만큼으로 되돌려 둔다
      row.outLine.setAttribute('x2', String(round(x0)));
      row.retLine.setAttribute('visibility', 'hidden');
      row.arrow.setAttribute('visibility', 'hidden');
      row.mark.setAttribute('visibility', 'hidden');
      row.label.setAttribute('visibility', 'hidden');
      row.ring?.setAttribute('visibility', 'hidden');

      const probe = chip(x0, row.outY, t('label.ttl', 'TTL {ttl}', { ttl: a.ttl }), c.primary, c.textInverse, monoSm);
      let x = x0;

      async function travel(to: number): Promise<boolean> {
        const from = x;
        const ok = await tween(HOP_MS, mine, (p) => {
          const now = from + (to - from) * p;
          place(probe.g, now, row.outY);
          row.outLine.setAttribute('x2', String(round(now)));
        });
        x = to;
        return ok;
      }

      for (let i = 0; i < a.trail.length; i += 1) {
        const hopX = lay.xs[i + 1];
        const ttlAfter = a.trail[i];
        if (hopX === undefined || ttlAfter === undefined) return;
        if (!(await travel(hopX))) return;
        probe.label.textContent = t('label.ttl', 'TTL {ttl}', { ttl: ttlAfter });
        if (!(await hold(HOLD_MS, mine))) return;
      }

      if (a.fate === 'expired') {
        probe.rect.setAttribute('fill', c.danger);
        probe.label.setAttribute('fill', c.stateInk);
        row.ring?.removeAttribute('visibility');
        row.mark.removeAttribute('visibility');
        const ok = await tween(DROP_MS, mine, (p) => {
          place(probe.g, rx, row.outY + 14 * p);
          probe.g.setAttribute('opacity', String(round(1 - p)));
        });
        if (!ok) return;
      } else {
        if (!(await travel(rx))) return;
        probe.rect.setAttribute('fill', c.accent);
        probe.label.setAttribute('fill', c.stateInk);
        row.ring?.removeAttribute('visibility');
        row.mark.removeAttribute('visibility');
        if (!(await hold(HOLD_MS, mine))) return;
      }
      probe.g.remove();

      // 답이 되돌아온다 — 주소를 싣고
      const reply = chip(rx, row.retY, a.from, rc, c.stateInk, monoXs);
      row.retLine.setAttribute('x2', String(round(rx)));
      row.retLine.removeAttribute('visibility');
      const hops = a.at + 1;
      const ok = await tween(RETURN_BASE_MS + RETURN_PER_HOP_MS * hops, mine, (p) => {
        const now = rx + (x0 + 6 - rx) * p;
        place(reply.g, now, row.retY);
        row.retLine.setAttribute('x2', String(round(now)));
      });
      if (!ok) return;
      reply.g.remove();
    }

    /** 답에 실려 온 주소가 길 위 라우터 자리로 올라간다. */
    async function playRise(scene: TtlExpiredReportsScene, mine: number): Promise<void> {
      const drawn = drawStatic(scene);
      if (drawn === null) return;
      const { lay } = drawn;
      const x0 = lay.xs[0] ?? 0;
      const movers: { node: SVGTextElement; fx: number; fy: number; tx: number; ty: number }[] = [];
      // 정적 그림의 길 위 주소는 아직 못 온 것이므로 가린다
      for (const n of drawn.laneAddrs) n.setAttribute('visibility', 'hidden');
      scene.answers.forEach((a, i) => {
        if (a.fate !== 'expired') return;
        const fy = rowCenter(lay, i) + 15;
        const w = a.from.length * monoXs * 0.62;
        const node = text(svg, x0 + 6 + w / 2, fy, a.from, {
          size: fontSizes.xs,
          fill: c.itemComparing,
          anchor: 'middle',
          mono: true,
        });
        movers.push({ node, fx: x0 + 6 + w / 2, fy, tx: reachX(lay, a), ty: lay.addrY });
      });
      const ok = await tween(RISE_MS, mine, (p) => {
        for (const m of movers) {
          m.node.setAttribute('x', String(round(m.fx + (m.tx - m.fx) * p)));
          m.node.setAttribute('y', String(round(m.fy + (m.ty - m.fy) * p)));
        }
      });
      if (!ok) return;
      for (const m of movers) m.node.remove();
    }

    return {
      async render(next: TtlExpiredReportsScene, prev: TtlExpiredReportsScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (
          opts.animate &&
          step.kind === 'probe' &&
          prev !== null &&
          prev.answers.length === next.answers.length - 1
        ) {
          await playProbe(next, mine);
        } else if (opts.animate && step.kind === 'done' && prev !== null && prev.step.kind === 'probe') {
          await playRise(next, mine);
        }
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of Array.from(waiters)) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
