/**
 * mac-is-local stage — 주소 쌍 두 벌.
 *
 * 위: 패킷. 안쪽 IP 쌍은 처음부터 끝까지 같은 상자로 건너간다. 바깥 MAC 쌍은 링크마다 붙는다.
 * 가운데: 지나는 장치와 그 인터페이스(인터페이스의 MAC 은 뒤 두 묶음만).
 * 아래: 링크마다 남겨진 MAC 쌍. 라우터에 닿으면 그 링크의 쌍이 패킷에서 떨어져 제 링크 밑으로 내려앉는다.
 *
 * 정본은 장면이다. render 는 늘 그 장면의 화면 전체를 세우고, 운동은 끝 자리에 아직 못 온 만큼을 그린다.
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
import type { MacIsLocalPair, MacIsLocalSceneState } from './scene.js';

const H = 318;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 8;
const CARD_TOP = 12;
const LINE = 16;
const BAND_INSET = 6;
const TEXT_PAD = 8;
const CORE_H = 4 + LINE * 2 + 4;
const BAND_H = BAND_INSET + LINE * 2 + 4 + CORE_H + BAND_INSET;
const DEV_TOP = 128;
const DEV_H = 64;
const BOX_W_MAX = 124;
const LINK_LABEL_Y = DEV_TOP + DEV_H + 18;
const TAG_TOP = LINK_LABEL_Y + 8;
const TAG_H = 6 + LINE * 2 + 2;
const CAPTION_Y = 284;
const CAPTION2_Y = 304;
/** 콜론으로 이은 여섯 묶음 */
const MAC_CHARS = 17;
/** 뒤 두 묶음 + 말줄임 */
const SHORT_CHARS = 6;

const ATTACH_MS = 450;
const MOVE_MS = 650;
const SWAP_MS = 850;
const DELIVER_MS = 750;

type Rect = { x: number; y: number; w: number; h: number };

function rd(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function lerpRect(a: Rect, b: Rect, p: number): Rect {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}

/** 글자 폭 어림 — 한글 · 한자 · 가나는 한 글자 폭, 나머지는 0.6 */
function estWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? px : px * 0.6;
  return w;
}

function shortMac(mac: string): string {
  const parts = mac.split(':');
  return `…:${parts.slice(-2).join(':')}`;
}

type Refs = {
  card: SVGGElement;
  bandRect: SVGRectElement | null;
  bandText: SVGGElement | null;
  highlight: SVGGElement;
  tags: Map<number, SVGGElement>;
  overlay: SVGGElement;
};

type Layout = {
  n: number;
  boxW: number;
  cx: (i: number) => number;
  cardW: number;
  cardX: (i: number) => number;
  labelW: number;
  macW: number;
  chipW: number;
  tagW: number;
  linkMid: (hop: number) => number;
};

export const macIsLocalStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const xsPx = parseFloat(fontSizes.xs);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let refs: Refs | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(rd(v)) : v);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    }

    function setRect(r: SVGRectElement, b: Rect): void {
      r.setAttribute('x', String(rd(b.x)));
      r.setAttribute('y', String(rd(b.y)));
      r.setAttribute('width', String(rd(b.w)));
      r.setAttribute('height', String(rd(b.h)));
    }

    function deviceName(i: number, n: number): string {
      if (i === 0) return t('label.sender', 'Sending host');
      if (i === n - 1) return t('label.receiver', 'Receiving host');
      return t('label.router', 'Router {n}', { n: i });
    }

    function layoutOf(n: number): Layout {
      const labelW = Math.max(
        estWidth(t('label.from', 'from'), xsPx),
        estWidth(t('label.to', 'to'), xsPx),
      );
      const tagTextW = Math.max(estWidth(t('label.mac', 'MAC'), xsPx), estWidth(t('label.ip', 'IP'), xsPx));
      const macW = MAC_CHARS * xsPx * 0.6;
      const cardW = BAND_INSET + TEXT_PAD + labelW + 6 + macW + 10 + tagTextW + TEXT_PAD + BAND_INSET;
      const boxW = Math.min(BOX_W_MAX, (W - 2 * PAD) / n - 24);
      const spacing = n > 1 ? (W - 2 * PAD - boxW) / (n - 1) : 0;
      const cx = (i: number): number => PAD + boxW / 2 + spacing * i;
      const cardX = (i: number): number => Math.max(PAD, Math.min(W - PAD - cardW, cx(i) - cardW / 2));
      return {
        n,
        boxW,
        cx,
        cardW,
        cardX,
        labelW,
        macW,
        chipW: SHORT_CHARS * xsPx * 0.6 + 12,
        tagW: macW + 16,
        linkMid: (hop: number) => cx(hop) + spacing / 2,
      };
    }

    function bandRectAt(L: Layout, i: number): Rect {
      return { x: L.cardX(i), y: CARD_TOP, w: L.cardW, h: BAND_H };
    }
    function coreRectAt(L: Layout, i: number): Rect {
      const b = bandRectAt(L, i);
      return { x: b.x + BAND_INSET, y: b.y + BAND_INSET + LINE * 2 + 4, w: b.w - 2 * BAND_INSET, h: CORE_H };
    }
    function tagRect(L: Layout, hop: number): Rect {
      return { x: L.linkMid(hop) - L.tagW / 2, y: TAG_TOP, w: L.tagW, h: TAG_H };
    }
    /** 쌍의 두 값이 앉는 자리 (글자의 왼쪽 · 바탕선) */
    function bandValuePos(L: Layout, b: Rect): [number, number][] {
      const x = b.x + BAND_INSET + TEXT_PAD + L.labelW + 6;
      return [
        [x, b.y + BAND_INSET + LINE - 4],
        [x, b.y + BAND_INSET + LINE * 2 - 4],
      ];
    }
    function tagValuePos(r: Rect): [number, number][] {
      return [
        [r.x + 8, r.y + 6 + LINE - 4],
        [r.x + 8, r.y + 6 + LINE * 2 - 4],
      ];
    }

    function linkColor(links: readonly string[], link: string): string {
      const colors = categorical(links.length);
      const i = links.indexOf(link);
      return colors[i] ?? c.border;
    }

    function monoText(parent: Element, x: number, y: number, s: string, fill: string): SVGTextElement {
      return el(parent, 'text', { x, y, fill, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, s);
    }

    function drawStatic(s: MacIsLocalSceneState): Refs | null {
      svg.textContent = '';
      const base = s.base;
      if (base === null) return null;
      const n = base.path.length;
      const L = layoutOf(n);
      const step = s.step;

      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: c.bg });

      // 링크 선 · 링크 이름
      const midY = DEV_TOP + DEV_H / 2;
      base.links.forEach((link, hop) => {
        el(svg, 'line', {
          x1: L.cx(hop) + L.boxW / 2,
          y1: midY,
          x2: L.cx(hop + 1) - L.boxW / 2,
          y2: midY,
          stroke: linkColor(base.links, link),
          'stroke-width': 3,
        });
        el(
          svg,
          'text',
          {
            x: L.linkMid(hop),
            y: LINK_LABEL_Y,
            fill: c.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
          },
          t('label.link', 'link {n}', { n: hop + 1 }),
        );
      });

      // 장치와 인터페이스
      const chipOf = new Map<string, Rect>();
      base.path.forEach((id, i) => {
        const bx = L.cx(i) - L.boxW / 2;
        el(svg, 'rect', {
          x: bx,
          y: DEV_TOP,
          width: L.boxW,
          height: DEV_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        });
        el(
          svg,
          'text',
          {
            x: L.cx(i),
            y: DEV_TOP + 17,
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            'text-anchor': 'middle',
          },
          deviceName(i, n),
        );
        const isHost = i === 0 || i === n - 1;
        if (isHost) {
          const ip = i === 0 ? base.srcIp : base.dstIp;
          el(
            svg,
            'text',
            {
              x: L.cx(i),
              y: DEV_TOP + 34,
              fill: c.textMuted,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
            },
            ip,
          );
        }
        for (const port of base.ports) {
          if (port.node !== id) continue;
          const left = i > 0 && base.links[i - 1] === port.link;
          const right = i < n - 1 && base.links[i] === port.link;
          if (!left && !right) continue;
          const y = isHost ? DEV_TOP + 42 : left ? DEV_TOP + 25 : DEV_TOP + 43;
          const x = left ? bx + 4 : bx + L.boxW - 4 - L.chipW;
          const r: Rect = { x, y, w: L.chipW, h: 16 };
          chipOf.set(`${id}|${port.link}`, r);
          el(svg, 'rect', {
            x,
            y,
            width: L.chipW,
            height: 16,
            rx: 3,
            fill: c.bg,
            stroke: linkColor(base.links, port.link),
            'stroke-width': 1.5,
          });
          el(
            svg,
            'text',
            {
              x: x + L.chipW / 2,
              y: y + 12,
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
            },
            shortMac(port.mac),
          );
        }
      });

      // 링크마다 남겨진 쌍
      const tags = new Map<number, SVGGElement>();
      for (const pair of s.stranded) {
        const g = el(svg, 'g', {});
        const r = tagRect(L, pair.hop);
        const justLeft =
          (step.kind === 'swap' || step.kind === 'deliver') && step.left === pair.hop;
        el(g, 'rect', {
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          rx: 4,
          fill: c.bgSubtle,
          stroke: linkColor(base.links, pair.link),
          'stroke-width': 2,
          'stroke-dasharray': '4 3',
        });
        if (justLeft) {
          el(g, 'rect', {
            x: r.x - 3,
            y: r.y - 3,
            width: r.w + 6,
            height: r.h + 6,
            rx: 6,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2,
          });
        }
        const [p0, p1] = tagValuePos(r);
        if (p0 && p1) {
          monoText(g, p0[0], p0[1], pair.srcMac, c.textMuted);
          monoText(g, p1[0], p1[1], pair.dstMac, c.textMuted);
        }
        tags.set(pair.hop, g);
      }

      // 패킷
      const card = el(svg, 'g', {});
      let bandRect: SVGRectElement | null = null;
      let bandText: SVGGElement | null = null;
      const b = bandRectAt(L, s.at);
      const core = coreRectAt(L, s.at);
      const labelX = b.x + BAND_INSET + TEXT_PAD;
      const tagX = b.x + b.w - BAND_INSET - TEXT_PAD;
      const valueX = labelX + L.labelW + 6;
      const labelAttrs = (x: number, y: number, anchor: string): Record<string, string | number> => ({
        x,
        y,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'text-anchor': anchor,
      });
      const pair = s.pair;
      if (pair !== null) {
        bandRect = el(card, 'rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 8,
          fill: c.bgSubtle,
          stroke: linkColor(base.links, pair.link),
          'stroke-width': 2.5,
        });
        bandText = el(card, 'g', {});
        const [v0, v1] = bandValuePos(L, b);
        if (v0 && v1) {
          el(bandText, 'text', labelAttrs(labelX, v0[1], 'start'), t('label.from', 'from'));
          el(bandText, 'text', labelAttrs(labelX, v1[1], 'start'), t('label.to', 'to'));
          el(bandText, 'text', labelAttrs(tagX, v0[1], 'end'), t('label.mac', 'MAC'));
          monoText(bandText, v0[0], v0[1], pair.srcMac, c.text);
          monoText(bandText, v1[0], v1[1], pair.dstMac, c.text);
        }
      }
      if (s.ip !== null) {
        el(card, 'rect', {
          x: core.x,
          y: core.y,
          width: core.w,
          height: core.h,
          rx: 5,
          fill: c.bg,
          stroke: c.primary,
          'stroke-width': 2,
        });
        const y0 = core.y + 4 + LINE - 4;
        const y1 = core.y + 4 + LINE * 2 - 4;
        el(card, 'text', labelAttrs(labelX, y0, 'start'), t('label.from', 'from'));
        el(card, 'text', labelAttrs(labelX, y1, 'start'), t('label.to', 'to'));
        el(card, 'text', labelAttrs(tagX, y0, 'end'), t('label.ip', 'IP'));
        monoText(card, valueX, y0, s.ip.src, c.text);
        monoText(card, valueX, y1, s.ip.dst, c.text);
      }

      // 이번 걸음의 머무는 강조 — 받는 이 MAC 과 그 주인 인터페이스
      const highlight = el(svg, 'g', {});
      if (step.kind === 'frame' && pair !== null) {
        const toId = base.path[step.to];
        const chip = toId === undefined ? undefined : chipOf.get(`${toId}|${pair.link}`);
        const [, v1] = bandValuePos(L, b);
        if (v1) {
          el(highlight, 'rect', {
            x: v1[0] - 3,
            y: v1[1] - LINE + 4,
            width: L.macW + 6,
            height: LINE,
            rx: 3,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2,
          });
        }
        if (chip !== undefined) {
          el(highlight, 'rect', {
            x: chip.x - 2,
            y: chip.y - 2,
            width: chip.w + 4,
            height: chip.h + 4,
            rx: 4,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2.5,
          });
          if (v1) {
            const sx = Math.max(b.x + 12, Math.min(b.x + b.w - 12, chip.x + chip.w / 2));
            el(highlight, 'line', {
              x1: sx,
              y1: b.y + b.h,
              x2: chip.x + chip.w / 2,
              y2: chip.y - 2,
              stroke: c.accent,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 3',
            });
          }
        }
      }

      // 캡션
      const who = (i: number): string => deviceName(i, n);
      let line1 = '';
      let line2 = '';
      if (step.kind === 'hold' && s.ip !== null) {
        line1 = t('caption.hold', 'Packet at {who} · IP from {srcIp} to {dstIp}', {
          who: who(s.at),
          srcIp: s.ip.src,
          dstIp: s.ip.dst,
        });
      } else if (step.kind === 'frame') {
        line1 = step.final
          ? t('caption.frameLast', 'Link {n}: only now does the destination MAC belong to {to}', {
              n: step.hop + 1,
              to: who(step.to),
            })
          : t('caption.frameNext', 'Link {n}: the destination MAC belongs to {to}, not {dst}', {
              n: step.hop + 1,
              to: who(step.to),
              dst: who(n - 1),
            });
      } else if (step.kind === 'swap') {
        line1 = t('caption.swap', 'At {at}: the link {n} MAC pair stays behind; a new pair for link {m} goes on', {
          at: who(step.at),
          n: step.left + 1,
          m: step.hop + 1,
        });
      } else if (step.kind === 'deliver') {
        line1 = t('caption.deliver', '{at} receives the packet; the link {n} MAC pair stays behind too', {
          at: who(step.at),
          n: step.left + 1,
        });
      }
      if (s.tally !== null) {
        line2 = t('caption.tally', 'Links: {links} · MAC pairs: {macPairs} · MAC addresses: {macs} · IP pairs: {ipPairs}', {
          links: s.tally.links,
          macPairs: s.tally.macPairs,
          macs: s.tally.macs,
          ipPairs: s.tally.ipPairs,
        });
      }
      const capAttrs = (y: number, fill: string): Record<string, string | number> => ({
        x: W / 2,
        y,
        fill,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      if (line1 !== '') el(svg, 'text', capAttrs(CAPTION_Y, c.text), line1);
      if (line2 !== '') el(svg, 'text', { ...capAttrs(CAPTION2_Y, c.text), 'font-weight': 600 }, line2);

      const overlay = el(svg, 'g', {});
      return { card, bandRect, bandText, highlight, tags, overlay };
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        draw(0);
        let start: number | null = null;
        let id = 0;
        const wake = (): void => {
          waiters.delete(wake);
          frames.delete(id);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          draw(ease(p));
          if (p >= 1) wake();
          else {
            id = requestAnimationFrame(tick);
            frames.add(id);
          }
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    /** 떨어져 나가는 쌍 — 패킷의 바깥 상자에서 제 링크 밑의 자리로 */
    function ghostPair(R: Refs, L: Layout, links: readonly string[], pair: MacIsLocalPair, from: Rect): (p: number) => void {
      const g = el(R.overlay, 'g', {});
      const rect = el(g, 'rect', {
        rx: 6,
        fill: c.bgSubtle,
        stroke: linkColor(links, pair.link),
        'stroke-width': 2,
      });
      const a = monoText(g, 0, 0, pair.srcMac, c.text);
      const b = monoText(g, 0, 0, pair.dstMac, c.text);
      const to = tagRect(L, pair.hop);
      const fp = bandValuePos(L, from);
      const tp = tagValuePos(to);
      return (p: number) => {
        setRect(rect, lerpRect(from, to, p));
        const texts: [SVGTextElement, number][] = [
          [a, 0],
          [b, 1],
        ];
        for (const [node, k] of texts) {
          const f = fp[k];
          const tt = tp[k];
          if (!f || !tt) continue;
          node.setAttribute('x', String(rd(lerp(f[0], tt[0], p))));
          node.setAttribute('y', String(rd(lerp(f[1], tt[1], p))));
        }
      };
    }

    /** 새 쌍이 붙는다 — 바깥 상자가 IP 상자에서 자라 나온다 */
    function growBand(R: Refs, L: Layout, at: number): (p: number) => void {
      const core = coreRectAt(L, at);
      const band = bandRectAt(L, at);
      return (p: number) => {
        if (R.bandRect) setRect(R.bandRect, lerpRect(core, band, p));
        if (R.bandText) {
          const k = Math.max(0, (p - 0.4) / 0.6);
          R.bandText.setAttribute('opacity', String(rd(k)));
          R.bandText.setAttribute('transform', `translate(0 ${rd((1 - k) * 10)})`);
        }
      };
    }

    async function animateStep(next: MacIsLocalSceneState, mine: number): Promise<void> {
      const R = refs;
      const base = next.base;
      if (R === null || base === null) return;
      const L = layoutOf(base.path.length);
      const step = next.step;
      R.highlight.setAttribute('visibility', 'hidden');

      if (step.kind === 'frame') {
        const dx = L.cardX(step.from) - L.cardX(step.to);
        R.card.setAttribute('transform', `translate(${rd(dx)} 0)`);
        if (step.attach) {
          await tween(ATTACH_MS, mine, growBand(R, L, step.to));
          if (mine !== gen || destroyed) return;
        }
        await tween(MOVE_MS, mine, (p) => {
          R.card.setAttribute('transform', `translate(${rd(dx * (1 - p))} 0)`);
        });
        return;
      }

      if (step.kind === 'swap' || step.kind === 'deliver') {
        const left = next.stranded[next.stranded.length - 1];
        if (left === undefined) return;
        const tag = R.tags.get(left.hop);
        if (tag) tag.setAttribute('visibility', 'hidden');
        const ghost = ghostPair(R, L, base.links, left, bandRectAt(L, step.at));
        const grow = step.kind === 'swap' ? growBand(R, L, step.at) : null;
        await tween(step.kind === 'swap' ? SWAP_MS : DELIVER_MS, mine, (p) => {
          ghost(p);
          if (grow) grow(p);
        });
      }
    }

    return {
      render(next: MacIsLocalSceneState, prev: MacIsLocalSceneState | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        refs = drawStatic(next);
        if (!opts.animate || prev === null || next.base === null || next.step.kind === 'hold') return;
        return animateStep(next, mine).then(() => {
          if (mine === gen && !destroyed) refs = drawStatic(next);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
        refs = null;
      },
    };
  },
};
