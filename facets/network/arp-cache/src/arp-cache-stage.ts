/**
 * arp-cache-stage — 호스트마다 ARP 표가 있고, 아래로 보낸 프레임과 물음이 시간 차례로 쌓인다.
 *
 * 동사 "적히고, 꺼내 쓴다":
 *  - 물음 걸음 — 새 줄이 그 IP 의 주인 카드에서 떠나 표의 빈 칸으로 **옮겨 가 적힌다**
 *  - 보냄 걸음 — 프레임 칩이 보내는 이의 표 줄에서 **꺼내져** 보냄 줄의 제 칸으로 내려간다
 *
 * 세로는 고정. 표의 칸 수(호스트 수 − 1)와 보냄 칸 수는 폭과 높이에서 역산한다.
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
} from '@ffacet/core/runtime';
import type { ArpCacheScene, SceneHost } from './scene.js';

const H = 376;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 12;
const COL_GAP = 10;
const CARD_Y = 10;
const CARD_H = 58;
const TABLE_Y = 74;
const TABLE_H = 98;
const TABLE_HEAD = 18;
const ROW_GAP = 3;
const ROW_H_MAX = 22;
const FRAMES_TITLE_Y = 190;
const FRAMES_Y = 198;
const FRAMES_H = 40;
const ASKS_TITLE_Y = 256;
const ASKS_Y = 264;
const ASKS_H = 26;
const SLOT_GAP = 8;
const SLOT_W_MAX = 120;
const COUNT_Y = 308;
const HEAD_Y = 330;
const BODY_Y = 349;
const BODY_LINE = 17;
const MOVE_MS = 620;
const TICK_MS = 16;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
/** 고정폭 글꼴 한 글자의 폭 (em 비율) */
const MONO_EM = 0.6;
/** 본문 글꼴의 어림 폭 (em 비율) — 넓은 글자(한글 · 한자 · 가나)와 나머지 */
const WIDE_EM = 1.0;
const NARROW_EM = 0.56;

function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? WIDE_EM : NARROW_EM;
  return w * px;
}

/** 폭 안에 들도록 낱말(띄어쓰기 없는 글은 글자) 단위로 줄을 나눈다. */
function wrapLines(s: string, px: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  const push = (piece: string, sep: string): void => {
    const trial = line === '' ? piece : line + sep + piece;
    if (textWidth(trial, px) <= maxW || line === '') {
      line = trial;
    } else {
      lines.push(line);
      line = piece;
    }
  };
  for (const word of words) {
    if (textWidth(word, px) <= maxW) {
      push(word, ' ');
      continue;
    }
    // 띄어쓰기 없이 긴 글 — 글자 단위로 나눈다
    let first = true;
    for (const ch of word) {
      push(ch, first ? ' ' : '');
      first = false;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

type Pt = { x: number; y: number };
type Handle = { g: SVGGElement; at: Pt };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function shortMac(mac: string): string {
  const parts = mac.split(':');
  if (parts.length !== 6) return mac;
  return `…:${parts[4]}:${parts[5]}`;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Geometry = {
  colW: number;
  colX: (i: number) => number;
  rowH: number;
  rowY: (i: number) => number;
  slotW: number;
  slotX: (k: number) => number;
};

function geometry(nHosts: number, nSends: number): Geometry {
  const nh = Math.max(1, nHosts);
  const colW = (W - 2 * MARGIN - (nh - 1) * COL_GAP) / nh;
  const cap = Math.max(1, nh - 1);
  const rowH = Math.min(ROW_H_MAX, (TABLE_H - TABLE_HEAD - 6 - (cap - 1) * ROW_GAP) / cap);
  const ns = Math.max(1, nSends);
  const slotW = Math.min(SLOT_W_MAX, (W - 2 * MARGIN - (ns - 1) * SLOT_GAP) / ns);
  const slotsW = ns * slotW + (ns - 1) * SLOT_GAP;
  const slotLeft = (W - slotsW) / 2;
  return {
    colW,
    colX: (i) => MARGIN + i * (colW + COL_GAP),
    rowH,
    rowY: (i) => TABLE_Y + TABLE_HEAD + i * (rowH + ROW_GAP),
    slotW,
    slotX: (k) => slotLeft + k * (slotW + SLOT_GAP),
  };
}

export const arpCacheStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles = new Map<string, Handle>();

    const hostName = (hosts: readonly SceneHost[], id: string): string => {
      const i = hosts.findIndex((h) => h.id === id);
      return t('label.host', 'Host {name}', { name: i < 0 ? '?' : String.fromCharCode(65 + i) });
    };
    const letter = (hosts: readonly SceneHost[], id: string): string => {
      const i = hosts.findIndex((h) => h.id === id);
      return i < 0 ? '?' : String.fromCharCode(65 + i);
    };

    function text(parent: Element, x: number, y: number, s: string, opts: {
      size?: string; fill?: string; mono?: boolean; weight?: number; anchor?: string;
    } = {}): SVGTextElement {
      const node = el('text', {
        x, y,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      }, parent);
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = s;
      return node;
    }

    function drawStatic(scene: ArpCacheScene): void {
      svg.textContent = '';
      handles = new Map();
      const { hosts, sends, tables, frames, asks, step } = scene;
      if (hosts.length === 0) return;
      const g = geometry(hosts.length, sends.length);
      const hue = categorical(hosts.length);
      const hueOf = (id: string): string => hue[hosts.findIndex((h) => h.id === id)] ?? colors.border;
      const hueOfMac = (mac: string): string => {
        const i = hosts.findIndex((h) => h.mac === mac);
        return hue[i] ?? colors.border;
      };

      // 호스트 카드와 표
      hosts.forEach((h, i) => {
        const x = g.colX(i);
        const lit = step.kind === 'ask' && (step.asker === h.id || step.owner === h.id);
        const card = el('g', {}, svg);
        el('rect', {
          x, y: CARD_Y, width: g.colW, height: CARD_H, rx: 6,
          fill: colors.bgSubtle,
          stroke: lit ? colors.itemComparing : colors.border,
          'stroke-width': lit ? 2 : 1,
        }, card);
        el('rect', { x, y: CARD_Y, width: g.colW, height: 4, rx: 2, fill: hueOf(h.id) }, card);
        text(card, x + 8, CARD_Y + 21, hostName(hosts, h.id), { size: fontSizes.md, weight: 600 });
        text(card, x + 8, CARD_Y + 38, h.ip, { mono: true });
        const macFits = h.mac.length * XS * MONO_EM <= g.colW - 16;
        text(card, x + 8, CARD_Y + 52, macFits ? h.mac : shortMac(h.mac), {
          mono: true, size: fontSizes.xs, fill: colors.textMuted,
        });

        el('rect', {
          x, y: TABLE_Y, width: g.colW, height: TABLE_H, rx: 6,
          fill: 'none', stroke: colors.border,
        }, svg);
        text(svg, x + 8, TABLE_Y + 13, t('label.table', 'ARP table'), {
          size: fontSizes.xs, fill: colors.textMuted,
        });

        const table = tables.find((tb) => tb.host === h.id);
        const rows = table?.rows ?? [];
        const cap = Math.max(1, hosts.length - 1);
        for (let r = 0; r < Math.max(cap, rows.length); r += 1) {
          const ry = g.rowY(r);
          const row = rows[r];
          if (row === undefined) {
            el('rect', {
              x: x + 5, y: ry, width: g.colW - 10, height: g.rowH, rx: 3,
              fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3', opacity: 0.6,
            }, svg);
            continue;
          }
          const used = step.kind === 'send' && step.from === h.id && step.row === r;
          const fresh = step.kind === 'ask' && step.wrote.some((w) => w.host === h.id && w.row === r);
          const rg = el('g', {}, svg);
          el('rect', {
            x: x + 5, y: ry, width: g.colW - 10, height: g.rowH, rx: 3,
            fill: colors.bg,
            stroke: used ? colors.accent : fresh ? colors.itemComparing : colors.border,
            'stroke-width': used || fresh ? 2 : 1,
          }, rg);
          el('rect', { x: x + 5, y: ry, width: 4, height: g.rowH, rx: 2, fill: hueOfMac(row.mac) }, rg);
          const ty = ry + g.rowH / 2 + SM * 0.35;
          text(rg, x + 13, ty, row.ip, { mono: true });
          text(rg, x + g.colW - 10, ty, shortMac(row.mac), { mono: true, anchor: 'end', fill: colors.textMuted });
          handles.set(`row:${h.id}:${r}`, { g: rg, at: { x: x + g.colW / 2, y: ry + g.rowH / 2 } });
        }
      });

      // 보낸 프레임 — 시간 차례로 한 칸씩
      text(svg, MARGIN, FRAMES_TITLE_Y, t('label.frames', 'Frames sent'), {
        size: fontSizes.xs, fill: colors.textMuted,
      });
      text(svg, MARGIN, ASKS_TITLE_Y, t('label.asks', 'ARP requests'), {
        size: fontSizes.xs, fill: colors.textMuted,
      });
      sends.forEach((_s, k) => {
        const sx = g.slotX(k);
        const cx = sx + g.slotW / 2;
        const frame = frames.find((f) => f.n === k + 1);
        if (frame === undefined) {
          el('rect', {
            x: sx, y: FRAMES_Y, width: g.slotW, height: FRAMES_H, rx: 5,
            fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3', opacity: 0.6,
          }, svg);
        } else {
          const now = step.kind === 'send' && step.n === frame.n;
          const fg = el('g', {}, svg);
          el('rect', {
            x: sx, y: FRAMES_Y, width: g.slotW, height: FRAMES_H, rx: 5,
            fill: colors.bgSubtle,
            stroke: now ? colors.accent : colors.border,
            'stroke-width': now ? 2 : 1,
          }, fg);
          el('rect', { x: sx, y: FRAMES_Y + FRAMES_H - 4, width: g.slotW, height: 4, rx: 2, fill: hueOf(frame.to) }, fg);
          text(fg, cx, FRAMES_Y + 16, t('label.frame', '#{n} {from} → {to}', {
            n: frame.n, from: letter(hosts, frame.from), to: letter(hosts, frame.to),
          }), { anchor: 'middle', weight: 600 });
          text(fg, cx, FRAMES_Y + 30, shortMac(frame.mac), {
            mono: true, size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle',
          });
          handles.set(`frame:${k}`, { g: fg, at: { x: cx, y: FRAMES_Y + FRAMES_H / 2 } });
        }

        const ask = asks.find((a) => a.n === k + 1);
        if (ask !== undefined) {
          const now = step.kind === 'ask' && step.n === ask.n;
          const ag = el('g', {}, svg);
          el('rect', {
            x: sx, y: ASKS_Y, width: g.slotW, height: ASKS_H, rx: 5,
            fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': now ? 2 : 1.5,
          }, ag);
          text(ag, cx, ASKS_Y + ASKS_H / 2 + SM * 0.35, t('label.ask', 'Asked'), {
            anchor: 'middle', fill: colors.itemComparing, weight: 600,
          });
          handles.set(`ask:${k}`, { g: ag, at: { x: cx, y: ASKS_Y + ASKS_H / 2 } });
        } else if (frame !== undefined && frame.via === 'table') {
          text(svg, cx, ASKS_Y + ASKS_H / 2 + XS * 0.35, t('label.fromTable', 'from table'), {
            anchor: 'middle', size: fontSizes.xs, fill: colors.textMuted,
          });
        }
      });

      // 수 — 보냄은 쌓이고 물음은 멈춘다
      const count = text(svg, MARGIN, COUNT_Y, '', { size: fontSizes.sm, fill: colors.textMuted });
      const parts = [
        t('count.sent', 'Frames sent: {n}', { n: frames.length }),
        t('count.asked', 'ARP requests: {n}', { n: asks.length }),
      ];
      if (sends.length > 0 && frames.length === sends.length) {
        parts.push(t('count.without', 'Requests without a table: {n}', { n: frames.length }));
      }
      parts.forEach((s, i) => {
        if (i > 0) el('tspan', { dx: 0 }, count).textContent = ' · ';
        el('tspan', {}, count).textContent = s;
      });

      // 캡션 — 지금 일어나는 일
      if (step.kind === 'start') {
        text(svg, MARGIN, HEAD_Y, t('caption.start', 'Every ARP table starts empty.'), {
          size: fontSizes.md, weight: 600,
        });
        return;
      }
      const from = step.kind === 'ask' ? step.asker : step.from;
      text(svg, MARGIN, HEAD_Y, t('caption.send', 'Send #{n}: {host} → {ip}', {
        n: step.n, host: hostName(hosts, from), ip: step.ip,
      }), { size: fontSizes.md, weight: 600 });
      let body: string;
      if (step.kind === 'ask') {
        const ownerWrote = step.wrote.some((w) => w.host === step.owner);
        body = ownerWrote
          ? t('caption.ask', "No row for {ip} in the table, so it asks. The reply writes one row into the asker's table and one into the owner's.", { ip: step.ip })
          : t('caption.askKnown', "No row for {ip} in the table, so it asks. The reply writes a row into the asker's table; the owner already had one.", { ip: step.ip });
      } else if (step.via === 'asked') {
        body = t('caption.sendAsked', 'It leaves with the MAC it just wrote down.');
      } else {
        const table = tables.find((tb) => tb.host === step.from);
        const row = table?.rows[step.row];
        body = row !== undefined && row.by !== step.from
          ? t('caption.sendReverse', 'The MAC comes out of the table — a row written when {host} asked. No request.', {
              host: hostName(hosts, row.by),
            })
          : t('caption.sendTable', 'The MAC comes out of the table — no request.');
      }
      wrapLines(body, SM, W - 2 * MARGIN).forEach((line, i) => {
        text(svg, MARGIN, BODY_Y + i * BODY_LINE, line, { size: fontSizes.sm, fill: colors.textMuted });
      });
    }

    /** 0→1 을 한 시계로 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const ticks = Math.max(1, Math.ceil(MOVE_MS / TICK_MS));
        let i = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) { done(); return; }
          i += 1;
          apply(ease(Math.min(1, i / ticks)));
          if (i >= ticks) { done(); return; }
          const id = setTimeout(() => { timers.delete(id); tick(); }, TICK_MS);
          timers.add(id);
        };
        apply(0);
        const id = setTimeout(() => { timers.delete(id); tick(); }, TICK_MS);
        timers.add(id);
      });
    }

    function place(h: Handle, from: Pt, p: number, scale = 1): void {
      const dx = r2((from.x - h.at.x) * (1 - p));
      const dy = r2((from.y - h.at.y) * (1 - p));
      if (scale === 1) {
        h.g.setAttribute('transform', `translate(${dx} ${dy})`);
        return;
      }
      const s = r2(scale);
      h.g.setAttribute('transform',
        `translate(${r2(h.at.x + dx)} ${r2(h.at.y + dy)}) scale(${s}) translate(${r2(-h.at.x)} ${r2(-h.at.y)})`);
    }

    async function animate(mine: number, next: ArpCacheScene): Promise<void> {
      const { step, hosts } = next;
      if (step.kind === 'start' || hosts.length === 0) return;
      const g = geometry(hosts.length, next.sends.length);
      const cardAt = (id: string): Pt => {
        const i = hosts.findIndex((h) => h.id === id);
        return { x: g.colX(Math.max(0, i)) + g.colW / 2, y: CARD_Y + CARD_H / 2 };
      };

      if (step.kind === 'ask') {
        // 새 줄은 그 IP 의 주인 카드에서 떠나 표의 칸으로 옮겨 가 적힌다
        const moves: { h: Handle; from: Pt }[] = [];
        for (const w of step.wrote) {
          const h = handles.get(`row:${w.host}:${w.row}`);
          const row = next.tables.find((tb) => tb.host === w.host)?.rows[w.row];
          const src = row === undefined ? undefined : hosts.find((x) => x.ip === row.ip);
          if (h !== undefined && src !== undefined) moves.push({ h, from: cardAt(src.id) });
        }
        const chip = handles.get(`ask:${step.n - 1}`);
        await tween(mine, (p) => {
          for (const m of moves) place(m.h, m.from, p);
          if (chip !== undefined) place(chip, chip.at, 1, Math.max(0.01, p));
        });
        return;
      }

      // 보냄 — 프레임이 보내는 이의 표 줄에서 꺼내져 제 칸으로 내려간다
      const frame = handles.get(`frame:${step.n - 1}`);
      const row = handles.get(`row:${step.from}:${step.row}`);
      if (frame === undefined || row === undefined) return;
      await tween(mine, (p) => place(frame, row.at, p));
    }

    return {
      async render(next: ArpCacheScene, _prev: ArpCacheScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        await animate(mine, next);
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

