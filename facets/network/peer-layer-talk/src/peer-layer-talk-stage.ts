/**
 * peer-layer-talk stage — 왼쪽 기둥이 보낸 쪽, 오른쪽 기둥이 받는 쪽의 층이다.
 * 층마다 가로 한 줄을 차지한다. 맨 아래 줄만 실제 선으로 이어져 있다.
 *
 * 한 걸음의 운동:
 *  1. 봉한 짐이 받는 쪽 기둥을 따라 한 층 올라온다 (첫 걸음은 선을 건너와서 오른다)
 *  2. 맨 바깥 머리 하나가 짐에서 떨어져 나와 그 층의 줄 가운데서 펼쳐진다 — 적힌 것이 보인다
 *  3. 그 줄을 따라 선이 왼쪽으로 뻗어 보낸 쪽의 같은 층에 닿는다 — 쓴 쪽이 짝으로 드러난다
 * 이 머리를 열지 않고 나른 층들(양쪽의 아래 층과 물리 층)은 점선 테로 머문다.
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
} from '@ffacet/core/runtime';
import type { PeerLayerTalkScene, PeerSceneLayer } from './scene';

const H = 392;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 10;
const CELL_W_MAX = 136;
const TITLE_Y = 26;
const LANES_TOP = 42;
const LANE_H_MAX = 56;
const CAPTION_H = 64;
const SEG_W = 30;
const SEG_H = 26;
const SEG_GAP = 3;

const MS_RISE = 600;
const MS_OPEN = 550;
const MS_PAIR = 450;

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Geo = {
  cellW: number;
  sx: number;
  rx: number;
  laneH: number;
  /** 층 식별자 → 줄 가운데 y */
  cy: Map<string, number>;
  midL: number;
  contentCx: number;
  contentMaxW: number;
  charW: number;
  physicalY: number;
  captionY: number;
};

function packetW(m: number): number {
  return m <= 0 ? 0 : m * SEG_W + (m - 1) * SEG_GAP;
}

function headerLayers(stack: PeerSceneLayer[]): PeerSceneLayer[] {
  return stack.filter((l) => l.header !== null);
}

function geometry(stack: PeerSceneLayer[]): Geo {
  const W = PIECE_CANVAS_W;
  const cellW = Math.min(CELL_W_MAX, Math.round(W * 0.22));
  const sx = PAD;
  const rx = W - PAD - cellW;
  const laneH = Math.min(LANE_H_MAX, (H - LANES_TOP - CAPTION_H) / Math.max(1, stack.length));
  const cy = new Map<string, number>();
  stack.forEach((l, i) => cy.set(l.layer, LANES_TOP + i * laneH + laneH / 2));
  const midL = sx + cellW;
  const heads = headerLayers(stack).length;
  // 머리를 연 뒤 받는 쪽 곁에 남는 짐이 가장 클 때를 비켜 가운데를 잡는다
  const freeR = rx - 10 - packetW(heads - 1) - 10;
  const contentCx = (midL + freeR) / 2;
  const contentMaxW = 2 * (contentCx - midL - 8);
  const physical = stack.find((l) => l.header === null);
  const physicalY = physical === undefined ? LANES_TOP + stack.length * laneH : (cy.get(physical.layer) ?? 0);
  return {
    cellW,
    sx,
    rx,
    laneH,
    cy,
    midL,
    contentCx,
    contentMaxW,
    charW: parseFloat(fontSizes.sm) * 0.62,
    physicalY,
    captionY: LANES_TOP + stack.length * laneH + 22,
  };
}

function laneY(g: Geo, layer: string): number {
  const y = g.cy.get(layer);
  if (y === undefined) throw new Error(`peer-layer-talk: 줄을 모른다 — ${layer}`);
  return y;
}

export const peerLayerTalkStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
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
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? r1(v) : v));
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const e = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono === true ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'start',
          'font-weight': o.weight ?? '400',
        },
        parent,
      );
      e.textContent = s;
      return e;
    }

    function layerName(id: string): string {
      switch (id) {
        case 'application':
          return t('layer.application', 'Application');
        case 'transport':
          return t('layer.transport', 'Transport');
        case 'network':
          return t('layer.network', 'Network');
        case 'link':
          return t('layer.link', 'Link');
        case 'physical':
          return t('layer.physical', 'Physical');
        default:
          throw new Error(`peer-layer-talk: 층 이름을 모른다 — ${id}`);
      }
    }

    function fieldName(id: string): string {
      switch (id) {
        case 'requestLine':
          return t('field.requestLine', 'Request line');
        case 'seq':
          return t('field.seq', 'Sequence number');
        case 'dstIp':
          return t('field.dstIp', 'Destination address');
        case 'dstMac':
          return t('field.dstMac', 'Destination MAC');
        default:
          throw new Error(`peer-layer-talk: 항목 이름을 모른다 — ${id}`);
      }
    }

    /** 층마다의 짝 색 — 머리 쓰는 층의 수로 정한다 (바탕이라 걸음마다 바뀌지 않는다) */
    function pairColors(stack: PeerSceneLayer[]): { vivid: Map<string, string>; soft: Map<string, string> } {
      const heads = headerLayers(stack);
      const v = categorical(heads.length, 'vivid');
      const s = categorical(heads.length, params.theme === 'dark' ? 'deep' : 'pastel');
      const vivid = new Map<string, string>();
      const soft = new Map<string, string>();
      heads.forEach((l, i) => {
        vivid.set(l.layer, v[i] ?? c.primary);
        soft.set(l.layer, s[i] ?? c.bgSubtle);
      });
      return { vivid, soft };
    }

    function contentBox(g: Geo, value: string): { x: number; w: number } {
      const w = Math.min(g.contentMaxW, value.length * g.charW + 20);
      return { x: g.contentCx - w / 2, w };
    }

    /** 봉한 머리 한 칸 — 번호만 보인다. 적힌 것은 열기 전엔 읽히지 않는다 */
    function drawSeg(
      parent: Element,
      x: number,
      y: number,
      l: PeerSceneLayer,
      col: { vivid: Map<string, string>; soft: Map<string, string> },
    ): void {
      el(
        'rect',
        {
          x,
          y,
          width: SEG_W,
          height: SEG_H,
          rx: 3,
          fill: col.soft.get(l.layer) ?? c.bgSubtle,
          stroke: col.vivid.get(l.layer) ?? c.border,
          'stroke-width': 1.5,
        },
        parent,
      );
      label(parent, x + SEG_W / 2, y + SEG_H / 2 + 4, String(l.n), {
        size: fontSizes.sm,
        fill: c.text,
        anchor: 'middle',
        mono: true,
        weight: '600',
      });
    }

    type Refs = {
      packet: SVGGElement | null;
      content: SVGGElement | null;
      pair: SVGLineElement | null;
      author: SVGRectElement | null;
    };

    function drawStatic(s: PeerLayerTalkScene): Refs {
      svg.textContent = '';
      const refs: Refs = { packet: null, content: null, pair: null, author: null };
      const g = geometry(s.stack);
      const col = pairColors(s.stack);
      const step = s.step;
      // 받는 쪽은 연 층, 보낸 쪽은 그 머리를 쓴 층 — 둘은 알고리즘이 따로 셈했다
      const openedRecv = new Set<string>(s.opened.map((o) => o.layer));
      const writers = new Set<string>(s.opened.map((o) => o.writer));
      const current = step.kind === 'open' ? step.layer : null;
      const currentWriter = step.kind === 'open' ? step.writer : null;

      // 호스트 이름
      label(svg, g.sx + g.cellW / 2, TITLE_Y, t('host.sender', 'Sender'), {
        size: fontSizes.md,
        fill: c.text,
        anchor: 'middle',
        weight: '600',
      });
      label(svg, g.rx + g.cellW / 2, TITLE_Y, t('host.receiver', 'Receiver'), {
        size: fontSizes.md,
        fill: c.text,
        anchor: 'middle',
        weight: '600',
      });

      // 선 — 두 물리 층만 실제로 잇는다
      el(
        'line',
        {
          x1: g.midL,
          y1: g.physicalY,
          x2: g.rx,
          y2: g.physicalY,
          stroke: c.textMuted,
          'stroke-width': 2.5,
        },
        svg,
      );

      // 이번 머리를 열지 않고 나른 층 — 번호 1..carried* 의 층과 물리 층
      const carriedSender = new Set<string>();
      const carriedReceiver = new Set<string>();
      if (step.kind === 'open') {
        for (const l of s.stack) {
          if (l.header === null) {
            if (step.carriedPhysical > 0) {
              carriedSender.add(l.layer);
              carriedReceiver.add(l.layer);
            }
          } else {
            if (l.n <= step.carriedSender) carriedSender.add(l.layer);
            if (l.n <= step.carriedReceiver) carriedReceiver.add(l.layer);
          }
        }
      }

      // 짝의 줄 — 연 층마다 적힌 것과 그 줄
      const pairLayer = el('g', {}, svg);

      // 층 기둥
      for (const l of s.stack) {
        const y = laneY(g, l.layer);
        const top = y - g.laneH / 2 + 5;
        const h = g.laneH - 10;
        for (const side of ['sender', 'receiver'] as const) {
          const x = side === 'sender' ? g.sx : g.rx;
          el(
            'rect',
            { x, y: top, width: g.cellW, height: h, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 },
            svg,
          );
          if (l.header !== null) {
            el('rect', { x, y: top, width: 5, height: h, fill: col.vivid.get(l.layer) ?? c.border }, svg);
          }
          label(svg, x + 18, y + 5, String(l.n), {
            size: fontSizes.md,
            fill: c.textMuted,
            anchor: 'middle',
            mono: true,
          });
          label(svg, x + 32, y + 5, layerName(l.layer), { size: fontSizes.sm, fill: c.text });

          const carried = side === 'sender' ? carriedSender.has(l.layer) : carriedReceiver.has(l.layer);
          if (carried) {
            el(
              'rect',
              {
                x: x - 3,
                y: top - 3,
                width: g.cellW + 6,
                height: h + 6,
                rx: 8,
                fill: 'none',
                stroke: c.accent,
                'stroke-width': 2,
                'stroke-dasharray': '5 4',
              },
              svg,
            );
          }
          const lit = side === 'sender' ? writers.has(l.layer) : openedRecv.has(l.layer);
          const isCurCell = l.layer === (side === 'sender' ? currentWriter : current);
          if (lit) {
            const ring = el(
              'rect',
              {
                x,
                y: top,
                width: g.cellW,
                height: h,
                rx: 6,
                fill: 'none',
                stroke: col.vivid.get(l.layer) ?? c.primary,
                'stroke-width': isCurCell ? 3 : 2,
              },
              svg,
            );
            if (side === 'sender' && isCurCell) refs.author = ring;
          }
        }
      }

      // 짝의 선 — 보낸 쪽 쓴 층의 줄에서 받는 쪽 연 층의 줄로. 적힌 것은 받는 쪽이 연 줄에 펼친다
      for (const o of s.opened) {
        const l = s.stack.find((x) => x.layer === o.writer);
        if (l === undefined || l.header === null) throw new Error(`peer-layer-talk: 쓴 층의 머리가 없다 — ${o.writer}`);
        const y = laneY(g, o.layer);
        const wy = laneY(g, o.writer);
        const color = col.vivid.get(l.layer) ?? c.primary;
        const isCur = o.layer === current;
        const line = el(
          'line',
          {
            x1: g.midL,
            y1: wy + 4,
            x2: g.rx,
            y2: y + 4,
            stroke: color,
            'stroke-width': isCur ? 2.5 : 1.5,
            'stroke-dasharray': '6 4',
          },
          pairLayer,
        );
        const box = contentBox(g, l.header.value);
        const cg = el('g', {}, pairLayer);
        label(cg, g.contentCx, y - 13, fieldName(l.header.field), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'middle',
        });
        el(
          'rect',
          {
            x: box.x,
            y: y - 8,
            width: box.w,
            height: 24,
            rx: 4,
            fill: c.bg,
            stroke: color,
            'stroke-width': isCur ? 2 : 1.2,
          },
          cg,
        );
        label(cg, g.contentCx, y + 8, l.header.value, {
          size: fontSizes.sm,
          fill: c.text,
          anchor: 'middle',
          mono: true,
        });
        if (isCur) {
          refs.pair = line;
          refs.content = cg;
        }
      }

      // 아직 봉한 짐 — 연 층이 없으면 선 위 보낸 쪽 곁, 있으면 마지막으로 연 층의 줄 받는 쪽 곁
      const sealed = headerLayers(s.stack)
        .filter((l) => !writers.has(l.layer))
        .sort((a, b) => a.n - b.n);
      if (sealed.length > 0) {
        const pg = el('g', {}, svg);
        const last = s.opened[s.opened.length - 1]?.layer;
        const y = (last === undefined ? g.physicalY : laneY(g, last)) - SEG_H / 2;
        const x0 = last === undefined ? g.midL + 14 : g.rx - 10 - packetW(sealed.length);
        sealed.forEach((l, i) => drawSeg(pg, x0 + i * (SEG_W + SEG_GAP), y, l, col));
        refs.packet = pg;
      }

      // 캡션 — 지금 일어나는 일만
      if (step.kind === 'start') {
        label(svg, PAD, g.captionY, t('caption.start', 'Count of headers the sender wrote: {n}. They go onto the wire sealed.', { n: step.headers }), {
          size: fontSizes.md,
          fill: c.text,
        });
      } else {
        const name = layerName(step.layer);
        label(
          svg,
          PAD,
          g.captionY,
          t('caption.open', 'Receiver {layer}: opens only its own header. Written by: sender {writer}.', {
            layer: name,
            writer: layerName(step.writer),
          }),
          { size: fontSizes.md, fill: c.text },
        );
        label(svg, PAD, g.captionY + 24, t('caption.carried', 'Count of layers that carried it without opening: {n}', { n: step.carried }), {
          size: fontSizes.sm,
          fill: c.textMuted,
        });
      }
      return refs;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: PeerLayerTalkScene, _prev: PeerLayerTalkScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const refs = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step.kind !== 'open') return;

      const g = geometry(next.stack);
      const col = pairColors(next.stack);
      // 벗겨진 머리 — 쓴 층의 것
      const openedLayer = next.stack.find((l) => l.layer === step.writer);
      if (openedLayer === undefined || openedLayer.header === null) return;

      // 운동 동안 끝 자리의 것들은 숨겨 둔다
      const hide = (e: Element | null): void => e?.setAttribute('visibility', 'hidden');
      const show = (e: Element | null): void => e?.removeAttribute('visibility');
      hide(refs.packet);
      hide(refs.content);
      hide(refs.pair);
      hide(refs.author);

      // 1. 오른다 — 이 머리를 포함한 봉한 짐
      const peeledBefore = new Set<string>(next.opened.slice(0, -1).map((o) => o.writer));
      const moving = headerLayers(next.stack)
        .filter((l) => !peeledBefore.has(l.layer))
        .sort((a, b) => a.n - b.n);
      const toX = g.rx - 10 - packetW(moving.length);
      const toY = laneY(g, step.layer) - SEG_H / 2;
      const fromX = step.from === null ? g.midL + 14 : toX;
      const fromY = (step.from === null ? g.physicalY : laneY(g, step.from)) - SEG_H / 2;
      const ghost = el('g', {}, svg);
      moving.forEach((l, i) => drawSeg(ghost, i * (SEG_W + SEG_GAP), 0, l, col));
      const across = step.from === null ? 0.5 : 0;
      const place = (p: number): void => {
        let x = toX;
        let y = toY;
        if (p < across) {
          x = fromX + (toX - fromX) * (p / across);
          y = fromY;
        } else {
          const q = across >= 1 ? 1 : (p - across) / (1 - across);
          x = toX;
          y = fromY + (toY - fromY) * q;
        }
        ghost.setAttribute('transform', `translate(${r1(x)},${r1(y)})`);
      };
      place(0);
      if (!(await tween(MS_RISE, mine, place))) return;
      ghost.remove();
      show(refs.packet);

      // 2. 열린다 — 맨 바깥 머리 하나가 떨어져 나와 줄 가운데서 펼쳐진다
      const box = contentBox(g, openedLayer.header.value);
      const y = laneY(g, step.layer);
      const lid = el('g', {}, svg);
      const lidRect = el(
        'rect',
        {
          rx: 3,
          fill: col.soft.get(step.layer) ?? c.bgSubtle,
          stroke: col.vivid.get(step.layer) ?? c.primary,
          'stroke-width': 1.5,
        },
        lid,
      );
      const lidNum = label(lid, 0, 0, String(openedLayer.n), {
        size: fontSizes.sm,
        fill: c.text,
        anchor: 'middle',
        mono: true,
        weight: '600',
      });
      const unfold = (p: number): void => {
        const x = toX + (box.x - toX) * p;
        const yy = toY + (y - 8 - toY) * p;
        const w = SEG_W + (box.w - SEG_W) * p;
        const h = SEG_H + (24 - SEG_H) * p;
        lidRect.setAttribute('x', String(r1(x)));
        lidRect.setAttribute('y', String(r1(yy)));
        lidRect.setAttribute('width', String(r1(w)));
        lidRect.setAttribute('height', String(r1(h)));
        lidNum.setAttribute('x', String(r1(x + w / 2)));
        lidNum.setAttribute('y', String(r1(yy + h / 2 + 4)));
      };
      unfold(0);
      if (!(await tween(MS_OPEN, mine, unfold))) return;
      lid.remove();
      show(refs.content);

      // 3. 짝을 찾는다 — 줄이 받는 쪽에서 그 머리를 쓴 보낸 쪽 층으로 뻗는다
      const pair = refs.pair;
      show(pair);
      const recvY = y + 4;
      const writerY = laneY(g, step.writer) + 4;
      const reach = (p: number): void => {
        pair?.setAttribute('x1', String(r1(g.rx + (g.midL - g.rx) * p)));
        pair?.setAttribute('y1', String(r1(recvY + (writerY - recvY) * p)));
      };
      reach(0);
      if (!(await tween(MS_PAIR, mine, reach))) return;
      if (mine !== gen || destroyed) return;
      drawStatic(next);
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
