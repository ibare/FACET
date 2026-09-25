/**
 * ask-who-has stage — 물음 하나가 퍼지고, 답 하나만 돌아온다.
 *
 * 묻는 이는 왼쪽에, 나머지 호스트는 묻는 이를 가운데 둔 타원 위에 선다. 그래서 방송의
 * 물결이 넷에게 **같은 순간** 닿는다. 저마다 받은 물음표(찾는 IP)를 제 IP 바로 위에 두고
 * 견주며, 아닌 곳은 물음표를 떨어뜨린다. 주인 하나에서 묻는 이까지 한 줄만 돌아온다.
 * 아래 띠는 지금 선 위에 있는 프레임의 칸이다.
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
import type { ArpFrame } from './algorithm.js';
import type { AskWhoHasScene } from './scene.js';

const H = 432;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CAPTION_Y = 22;
const HOSTS_TOP = 36;
const HOSTS_BOTTOM = 312;
const PANEL_TOP = 330;
const BOX_W_MAX = 170;
const BOX_H = 72;
const ARC_DEG_MAX = 62;

const MS_SPREAD = 850;
const MS_COMPARE = 700;
const MS_REPLY = 850;
const MS_LEARN = 600;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Handles = {
  boxes: Map<string, SVGGElement>;
  tags: Map<string, SVGGElement>;
  spokes: Map<string, SVGLineElement>;
  replyLine: SVGLineElement | null;
  replyTag: SVGGElement | null;
  slotMac: SVGTextElement | null;
  overlay: SVGGElement;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const askWhoHasStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const monoPx = parseFloat(fontSizes.xs);
    const charW = monoPx * 0.62;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; fill?: string; mono?: boolean; weight?: string; anchor?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = str;
      return node;
    }

    /** 가운데가 (cx, cy) 인 주소 알약. 폭은 글자 수에서 셈한다. */
    function pill(parent: Element, cx: number, cy: number, value: string, stroke: string): SVGGElement {
      const g = el('g', {}, parent);
      const w = value.length * charW + 12;
      const h = monoPx + 7;
      el(
        'rect',
        { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, fill: colors.bg, stroke, 'stroke-width': 1.5 },
        g,
      );
      text(g, cx, cy + monoPx * 0.36, value, { mono: true, fill: colors.text, anchor: 'middle' });
      return g;
    }

    // ---------------------------------------------------------------- 자리

    type Layout = {
      boxW: number;
      asker: Pt;
      /** 나머지 호스트가 서는 타원의 반지름. 가운데는 묻는 이 */
      rx: number;
      ry: number;
      spots: Map<string, Pt>;
      slotTop: number;
      replyRest: Pt;
    };

    function layout(s: AskWhoHasScene): Layout {
      const boxW = Math.min(BOX_W_MAX, (W - 2 * PAD) * 0.27);
      const ay = (HOSTS_TOP + HOSTS_BOTTOM) / 2;
      const asker: Pt = { x: PAD + boxW / 2, y: ay };
      const others = s.hosts.filter((h) => h.id !== s.asker);
      const rx = W - PAD - boxW / 2 - asker.x;
      const halfSpan = (HOSTS_BOTTOM - HOSTS_TOP) / 2 - BOX_H / 2;
      const deg = others.length > 1 ? ARC_DEG_MAX : 0;
      const ry = deg > 0 ? halfSpan / Math.sin((deg * Math.PI) / 180) : 0;
      const spots = new Map<string, Pt>();
      others.forEach((h, i) => {
        const a = others.length > 1 ? -deg + (2 * deg * i) / (others.length - 1) : 0;
        const rad = (a * Math.PI) / 180;
        spots.set(h.id, { x: asker.x + rx * Math.cos(rad), y: ay + ry * Math.sin(rad) });
      });
      const slotTop = asker.y + BOX_H / 2 + 12;
      const replyRest: Pt = { x: asker.x + boxW / 2 + 70, y: asker.y - BOX_H / 2 + 6 };
      return { boxW, asker, rx, ry, spots, slotTop, replyRest };
    }

    /** 호스트 상자 안, 제 IP 바로 위 줄 — 받은 물음표가 앉는 자리. */
    function tagCenter(L: Layout, center: Pt, value: string): Pt {
      return { x: center.x - L.boxW / 2 + 4 + (value.length * charW + 12) / 2, y: center.y - BOX_H / 2 + 30 };
    }

    /** 답이 떠나는 곳(주인 상자 왼쪽)과 닿는 곳(묻는 이 상자 오른쪽 위). */
    function replyEnds(L: Layout, from: Pt, to: Pt): { a: Pt; b: Pt } {
      return {
        a: { x: from.x - L.boxW / 2, y: from.y + 8 },
        b: { x: to.x + L.boxW / 2, y: to.y - BOX_H / 2 + 6 },
      };
    }

    // ---------------------------------------------------------------- 정적 그리기 (정본)

    function drawStatic(s: AskWhoHasScene): Handles {
      svg.textContent = '';
      const L = layout(s);
      const handles: Handles = {
        boxes: new Map(),
        tags: new Map(),
        spokes: new Map(),
        replyLine: null,
        replyTag: null,
        slotMac: null,
        overlay: el('g', {}, svg),
      };
      const lines = el('g', {}, svg);
      const bodies = el('g', {}, svg);
      svg.appendChild(handles.overlay);

      const heard = new Set(s.requestHeard);
      const verdictOf = new Map(s.verdicts.map((v) => [v.id, v.owner] as const));
      const others = s.hosts.filter((h) => h.id !== s.asker);
      const askerHost = s.hosts.find((h) => h.id === s.asker);
      const askerEdge: Pt = { x: L.asker.x + L.boxW / 2, y: L.asker.y };

      // 캡션 — 지금 일어난 일만
      text(svg, PAD, CAPTION_Y, caption(s), { size: fontSizes.md, fill: colors.text });

      // 방송이 지나간 길
      for (const h of others) {
        if (!heard.has(h.id)) continue;
        const p = L.spots.get(h.id);
        if (!p) continue;
        const line = el(
          'line',
          {
            x1: askerEdge.x,
            y1: askerEdge.y,
            x2: p.x - L.boxW / 2,
            y2: p.y,
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '4 4',
            opacity: 0.7,
          },
          lines,
        );
        handles.spokes.set(h.id, line);
      }

      // 답이 돌아온 길
      if (s.reply && s.replyFrom) {
        const from = L.spots.get(s.replyFrom);
        for (const id of s.replyHeard) {
          const to = id === s.asker ? L.asker : L.spots.get(id);
          if (!from || !to) continue;
          const ends = replyEnds(L, from, to);
          handles.replyLine = el(
            'line',
            {
              x1: ends.a.x,
              y1: ends.a.y,
              x2: ends.b.x,
              y2: ends.b.y,
              stroke: colors.success,
              'stroke-width': 2.5,
            },
            lines,
          );
        }
      }

      // 묻는 이
      if (askerHost) {
        const g = el('g', {}, bodies);
        const x0 = L.asker.x - L.boxW / 2;
        const y0 = L.asker.y - BOX_H / 2;
        el(
          'rect',
          { x: x0, y: y0, width: L.boxW, height: BOX_H, rx: 6, fill: colors.bgSubtle, stroke: colors.primary, 'stroke-width': 2 },
          g,
        );
        text(g, x0 + 10, y0 + 16, t('label.asker', 'Asker'), { size: fontSizes.sm, weight: '600' });
        text(g, x0 + 10, y0 + 42, askerHost.ip, { mono: true });
        text(g, x0 + 10, y0 + 60, askerHost.mac, { mono: true, fill: colors.textMuted });
        handles.boxes.set(askerHost.id, g);

        // 묻는 이가 쥔 것: 찾는 IP 와 (아직 모르는) MAC
        const sy = L.slotTop;
        const slot = el('g', {}, bodies);
        el(
          'rect',
          {
            x: x0,
            y: sy,
            width: L.boxW,
            height: 58,
            rx: 6,
            fill: colors.bg,
            stroke: s.learned ? colors.success : colors.border,
            'stroke-width': 1.5,
            'stroke-dasharray': s.learned ? '0' : '4 3',
          },
          slot,
        );
        text(slot, x0 + 10, sy + 16, t('slot.title', 'Wanted'), { size: fontSizes.sm, weight: '600' });
        text(slot, x0 + 10, sy + 34, t('slot.ip', 'IP'), { fill: colors.textMuted });
        text(slot, x0 + 40, sy + 34, s.targetIp, { mono: true });
        text(slot, x0 + 10, sy + 50, t('slot.mac', 'MAC'), { fill: colors.textMuted });
        handles.slotMac = text(
          slot,
          x0 + 40,
          sy + 50,
          s.learned ? s.learned.mac : t('slot.unknown', '?'),
          { mono: true, fill: s.learned ? colors.success : colors.textMuted, weight: s.learned ? '600' : 'normal' },
        );
      }

      // 나머지 호스트
      others.forEach((h, i) => {
        const p = L.spots.get(h.id);
        if (!p) return;
        const verdict = verdictOf.get(h.id);
        const g = el('g', { opacity: verdict === false ? 0.4 : 1 }, bodies);
        const x0 = p.x - L.boxW / 2;
        const y0 = p.y - BOX_H / 2;
        el(
          'rect',
          {
            x: x0,
            y: y0,
            width: L.boxW,
            height: BOX_H,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: verdict === true ? colors.success : colors.border,
            'stroke-width': verdict === true ? 2.5 : 1.5,
          },
          g,
        );
        text(g, x0 + 10, y0 + 16, t('label.host', 'Host {n}', { n: i + 1 }), { size: fontSizes.sm, weight: '600' });
        if (verdict === false) {
          text(g, x0 + L.boxW - 10, y0 + 16, t('label.dropped', 'dropped'), { fill: colors.textMuted, anchor: 'end' });
        } else if (verdict === true) {
          text(g, x0 + L.boxW - 10, y0 + 16, t('label.owner', 'mine'), {
            fill: colors.success,
            anchor: 'end',
            weight: '600',
          });
        }
        text(g, x0 + 10, y0 + 54, h.ip, { mono: true });
        text(g, x0 + 10, y0 + 67, h.mac, { mono: true, fill: colors.textMuted });
        handles.boxes.set(h.id, g);

        // 받은 물음 — 버린 곳에는 남지 않는다
        if (s.request && heard.has(h.id) && verdict !== false) {
          const c = tagCenter(L, p, s.request.targetIp);
          const tag = pill(
            svg,
            c.x,
            c.y,
            s.request.targetIp,
            verdict === true ? colors.success : colors.primary,
          );
          handles.tags.set(h.id, tag);
        }
      });

      // 돌아온 답 — 묻는 이에게 닿아 아직 손에 넣기 전
      if (s.reply && !s.learned) {
        handles.replyTag = pill(svg, L.replyRest.x, L.replyRest.y, s.reply.senderMac, colors.success);
      }

      drawFrame(s);
      svg.appendChild(handles.overlay);
      return handles;
    }

    function caption(s: AskWhoHasScene): string {
      switch (s.step) {
        case 'start':
          return t('caption.start', 'The asker knows an IP but not its MAC. Wanted: {ip}', { ip: s.targetIp });
        case 'request':
          return t('caption.request', 'The broadcast request spreads. Received: {n}', {
            n: s.requestHeard.length,
          });
        case 'compare': {
          const ownerIds = s.verdicts.filter((v) => v.owner).map((v) => v.id);
          const owners = s.hosts.filter((h) => ownerIds.includes(h.id)).map((h) => h.ip);
          return t('caption.compare', 'Each compares the wanted IP with its own. Dropped: {dropped} · Owner: {owner}', {
            dropped: s.verdicts.filter((v) => !v.owner).length,
            owner: owners.join(', '),
          });
        }
        case 'reply':
          return t('caption.reply', 'The owner answers straight to the asker’s MAC. Received: {n}', {
            n: s.replyHeard.length,
          });
        case 'learn':
          if (!s.learned) return '';
          return t('caption.learn', 'Learned: {ip} → {mac} · Frames on the wire: {frames}', {
            ip: s.learned.ip,
            mac: s.learned.mac,
            frames: s.learned.frames,
          });
      }
    }

    /** 아래 띠 — 지금 선 위에 있는 프레임의 칸. */
    function drawFrame(s: AskWhoHasScene): void {
      const frame: ArpFrame | null = s.reply ?? s.request;
      if (!frame) return;
      const g = el('g', {}, svg);
      el('line', { x1: PAD, y1: PANEL_TOP - 8, x2: W - PAD, y2: PANEL_TOP - 8, stroke: colors.border, 'stroke-width': 1 }, g);
      const rowH = 16;
      const labelW = 92;
      const leftX = PAD;
      const rightX = PAD + (W - 2 * PAD) * 0.46;
      const titleY = PANEL_TOP + 10;
      text(g, leftX, titleY, t('group.eth', 'Ethernet header'), { size: fontSizes.sm, weight: '600' });
      text(
        g,
        rightX,
        titleY,
        frame.op === 1 ? t('group.request', 'ARP request') : t('group.reply', 'ARP reply'),
        { size: fontSizes.sm, weight: '600' },
      );
      const row = (x: number, i: number, label: string, value: string, fill: string): void => {
        const y = titleY + rowH * (i + 1) + 2;
        text(g, x, y, label, { fill: colors.textMuted });
        text(g, x + labelW, y, value, { mono: true, fill });
      };
      const dstFill = colors.primary;
      row(leftX, 0, t('field.ethDst', 'Dest MAC'), frame.ethDst, dstFill);
      row(leftX, 1, t('field.ethSrc', 'Source MAC'), frame.ethSrc, colors.text);
      row(rightX, 0, t('field.op', 'op'), String(frame.op), colors.text);
      row(rightX, 1, t('field.senderMac', 'Sender MAC'), frame.senderMac, colors.text);
      row(rightX, 2, t('field.senderIp', 'Sender IP'), frame.senderIp, colors.text);
      row(rightX, 3, t('field.targetMac', 'Target MAC'), frame.targetMac, colors.textMuted);
      row(rightX, 4, t('field.targetIp', 'Target IP'), frame.targetIp, colors.text);
    }

    // ---------------------------------------------------------------- 운동

    /** 한 시계. 틀 수로 셈해 흘림과 곧바로가 같은 끝에 닿는다. */
    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      const total = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          frame(ease(i / total));
          if (i >= total) return finish();
          i += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function offset(g: SVGGElement, dx: number, dy: number): void {
      g.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    async function animateSpread(s: AskWhoHasScene, h: Handles, mine: number): Promise<void> {
      const L = layout(s);
      const origin = L.asker;
      const request = s.request;
      if (!request) return;
      const wave = el(
        'ellipse',
        { cx: origin.x, cy: origin.y, rx: 0, ry: 0, fill: 'none', stroke: colors.primary, 'stroke-width': 2 },
        h.overlay,
      );
      const moves: { g: SVGGElement; dx: number; dy: number }[] = [];
      for (const [id, g] of h.tags) {
        const p = L.spots.get(id);
        if (!p) continue;
        const c = tagCenter(L, p, request.targetIp);
        moves.push({ g, dx: origin.x - c.x, dy: origin.y - c.y });
      }
      const spokes: { line: SVGLineElement; x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const [id, line] of h.spokes) {
        const p = L.spots.get(id);
        if (!p) continue;
        spokes.push({ line, x1: origin.x + L.boxW / 2, y1: origin.y, x2: p.x - L.boxW / 2, y2: p.y });
      }
      await tween(MS_SPREAD, mine, (k) => {
        wave.setAttribute('rx', String(r2(L.rx * k)));
        wave.setAttribute('ry', String(r2(L.ry * k)));
        wave.setAttribute('opacity', String(r2(1 - 0.8 * k)));
        for (const m of moves) offset(m.g, m.dx * (1 - k), m.dy * (1 - k));
        for (const sp of spokes) {
          sp.line.setAttribute('x2', String(r2(lerp(sp.x1, sp.x2, k))));
          sp.line.setAttribute('y2', String(r2(lerp(sp.y1, sp.y2, k))));
        }
      });
    }

    async function animateCompare(s: AskWhoHasScene, h: Handles, mine: number): Promise<void> {
      const L = layout(s);
      const request = s.request;
      if (!request) return;
      const dropped = s.verdicts.filter((v) => !v.owner);
      const falling = dropped.flatMap((v) => {
        const p = L.spots.get(v.id);
        if (!p) return [];
        const c = tagCenter(L, p, request.targetIp);
        return [pill(h.overlay, c.x, c.y, request.targetIp, colors.textMuted)];
      });
      const dimmed = dropped.flatMap((v) => {
        const g = h.boxes.get(v.id);
        return g ? [g] : [];
      });
      await tween(MS_COMPARE, mine, (k) => {
        for (const g of falling) {
          offset(g, 0, 34 * k);
          g.setAttribute('opacity', String(r2(1 - k)));
        }
        for (const g of dimmed) g.setAttribute('opacity', String(r2(1 - 0.6 * k)));
      });
    }

    async function animateReply(s: AskWhoHasScene, h: Handles, mine: number): Promise<void> {
      const L = layout(s);
      const from = s.replyFrom ? L.spots.get(s.replyFrom) : undefined;
      if (!from) return;
      const { a: start, b: end } = replyEnds(L, from, L.asker);
      const line = h.replyLine;
      const tag = h.replyTag;
      await tween(MS_REPLY, mine, (k) => {
        if (line) {
          line.setAttribute('x2', String(r2(lerp(start.x, end.x, k))));
          line.setAttribute('y2', String(r2(lerp(start.y, end.y, k))));
        }
        if (tag) offset(tag, (start.x - L.replyRest.x) * (1 - k), (start.y - L.replyRest.y) * (1 - k));
      });
    }

    async function animateLearn(s: AskWhoHasScene, h: Handles, mine: number): Promise<void> {
      const L = layout(s);
      const reply = s.reply;
      if (!reply) return;
      const mover = pill(h.overlay, L.replyRest.x, L.replyRest.y, reply.senderMac, colors.success);
      const target: Pt = {
        x: L.asker.x - L.boxW / 2 + 40 + (reply.senderMac.length * charW) / 2,
        y: L.slotTop + 50 - monoPx * 0.36,
      };
      const slotMac = h.slotMac;
      await tween(MS_LEARN, mine, (k) => {
        offset(mover, (target.x - L.replyRest.x) * k, (target.y - L.replyRest.y) * k);
        mover.setAttribute('opacity', String(r2(1 - 0.9 * k)));
        if (slotMac) slotMac.setAttribute('opacity', String(r2(k)));
      });
    }

    // ---------------------------------------------------------------- 렌더러

    return {
      async render(next: AskWhoHasScene, prev: AskWhoHasScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || (prev && prev.step === next.step)) return;
        switch (next.step) {
          case 'request':
            await animateSpread(next, h, mine);
            break;
          case 'compare':
            await animateCompare(next, h, mine);
            break;
          case 'reply':
            await animateReply(next, h, mine);
            break;
          case 'learn':
            await animateLearn(next, h, mine);
            break;
          case 'start':
            return;
        }
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
