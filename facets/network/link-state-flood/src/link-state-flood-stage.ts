/**
 * link-state-flood 무대 — 알림 카드가 사본으로 떨어져 나와 선을 따라 이웃 라우터로 건너간다.
 *
 * 라우터는 알림 한 장을 꽂는 칸을 가진 상자다. 보낸 쪽의 카드는 그대로 남고 **같은 글자의 사본**이
 * 선을 타고 간다. 빈 칸에 닿으면 꽂히고, 이미 카드가 꽂힌 상자에 닿으면 문 앞에서 구겨져 떨어지며
 * 그 선 끝에 × 가 남는다. 처음 받은 선은 굵게 남는다 — 알림이 실제로 지나간 길.
 *
 * 자리는 만든 이에서 몇 선 떨어졌는가(너비 우선 깊이)로 세로 줄을 나눈다. 번지는 물결이 왼쪽에서
 * 오른쪽으로 읽힌다. 크기는 캔버스 폭에서 역산하고 상수는 상한만 둔다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { LinkStateFloodScene, SceneLsa, SceneSend } from './scene.js';

const H = 400;
const PAD = 10;
const BOX_W_MAX = 116;
const GAP_MIN = 40;
const BOX_H = 86;
const HEAD_H = 22;
const CAPTION_H = 58;
/** 한 라운드의 운동 — 사본이 건너가고 버려지는 데까지 */
const MOTION_MS = 700;
const FRAME_MS = 16;
/** 운동 안의 몫 (전체 1). 같은 라우터에 둘째로 닿는 사본은 STAGGER 만큼 늦게 떠난다 */
const TRAVEL = 0.6;
const STAGGER = 0.12;
const DISCARD = 0.25;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };

function num(n: number): string {
  const r = Math.round(n * 10) / 10;
  return String(r === 0 ? 0 : r);
}

/** 배율 · 투명도처럼 0..1 사이 값 — 소수 셋째 자리까지 */
function fine(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function node<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? num(v) : v);
  parent.appendChild(e);
  return e;
}

/** 만든 이에서 몇 선 떨어졌는가로 세로 줄을 나누고, 줄 안은 이름 차례로 세운다. */
function layout(scene: LinkStateFloodScene): { boxes: Map<string, Box>; w: number } {
  const nbr = new Map<string, string[]>();
  for (const r of scene.routers) nbr.set(r, []);
  for (const { a, b } of scene.links) {
    nbr.get(a)?.push(b);
    nbr.get(b)?.push(a);
  }
  const depth = new Map<string, number>([[scene.origin, 0]]);
  const queue = [scene.origin];
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i];
    if (cur === undefined) break;
    const d = depth.get(cur) ?? 0;
    for (const n of [...(nbr.get(cur) ?? [])].sort()) {
      if (!depth.has(n)) {
        depth.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  // 닿지 않는 라우터는 맨 끝 줄 뒤에 둔다 (알고리즘이 먼저 던지지만 그림은 멎지 않게)
  for (const r of scene.routers) if (!depth.has(r)) depth.set(r, maxDepth + 1);
  const cols: string[][] = [];
  for (const r of [...scene.routers].sort()) {
    const d = depth.get(r) ?? 0;
    while (cols.length <= d) cols.push([]);
    cols[d]?.push(r);
  }
  const n = Math.max(1, cols.length);
  const usable = PIECE_CANVAS_W - PAD * 2;
  const w = Math.min(BOX_W_MAX, (usable - GAP_MIN * (n - 1)) / n);
  const step = n > 1 ? (usable - w) / (n - 1) : 0;
  const top = PAD + BOX_H / 2;
  const bottom = H - CAPTION_H - PAD - BOX_H / 2;
  let maxRows = 1;
  for (const c of cols) maxRows = Math.max(maxRows, c.length);
  const boxes = new Map<string, Box>();
  cols.forEach((col, ci) => {
    const cx = n > 1 ? PAD + w / 2 + ci * step : PIECE_CANVAS_W / 2;
    col.forEach((r, ri) => {
      const cy = col.length > 1 ? top + ((bottom - top) * ri) / (col.length - 1) : (top + bottom) / 2;
      boxes.set(r, { x: cx - w / 2, y: cy - BOX_H / 2, w, h: BOX_H, cx, cy });
    });
  });
  return { boxes, w };
}

function cardRect(b: Box): Box {
  const x = b.x + 6;
  const y = b.y + HEAD_H + 2;
  const w = b.w - 12;
  const h = b.h - HEAD_H - 8;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/** 상자 c 의 둘레에서 toward 쪽으로 난 점 */
function rim(c: Box, toward: Pt): Pt {
  const dx = toward.x - c.cx;
  const dy = toward.y - c.cy;
  const sx = dx === 0 ? Infinity : c.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : c.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.cx + dx * s, y: c.cy + dy * s };
}

function toward(a: Pt, b: Pt, dist: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...a };
  return { x: a.x + (dx / len) * dist, y: a.y + (dy / len) * dist };
}

type Timing = { start: number; arrive: number; end: number };

/** 한 라운드의 사본마다 떠나고 닿고 버려지는 몫. 같은 받는 이에 앞서 닿은 수만큼 늦게 떠난다 */
function timings(sends: readonly SceneSend[]): Timing[] {
  const seen = new Map<string, number>();
  const raw = sends.map((s) => {
    const k = seen.get(s.to) ?? 0;
    seen.set(s.to, k + 1);
    const start = k * STAGGER;
    const arrive = start + TRAVEL;
    return { start, arrive, end: s.fresh ? arrive : arrive + DISCARD };
  });
  let last = 0;
  for (const r of raw) last = Math.max(last, r.end);
  const k = last > 1 ? 1 / last : 1;
  return raw.map((r) => ({ start: r.start * k, arrive: r.arrive * k, end: r.end * k }));
}

export const linkStateFloodStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const XS = parseFloat(fontSizes.xs);
    const SM = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawCard(parent: Element, r: Box, copy: SceneLsa, stroke: string, fill: string): void {
      node(parent, 'rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, fill, stroke, 'stroke-width': 1.5 });
      const lines = [
        t('card.head', '{origin} · seq {seq}', { origin: copy.origin, seq: copy.seq }),
        ...copy.entries.map((e) => t('card.link', '{name} cost {cost}', { name: e.to, cost: e.cost })),
      ];
      const lineH = Math.min(XS + 3, (r.h - 6) / Math.max(1, lines.length));
      lines.forEach((line, i) => {
        const tx = node(parent, 'text', {
          x: r.x + 7,
          y: r.y + 4 + lineH * (i + 1) - 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': i === 0 ? 600 : 400,
          fill: colors.text,
        });
        tx.textContent = line;
      });
    }

    /**
     * 장면 하나를 세운다. p 는 이번 걸음 운동의 몫 — 1 이면 정적 그림(정본)이다.
     * 운동 중에는 아직 닿지 않은 사본의 카드 · 굵은 선 · × 를 그 몫만큼만 그린다.
     */
    function draw(scene: LinkStateFloodScene, p: number): void {
      svg.textContent = '';
      const { boxes } = layout(scene);
      const moving = p < 1 && scene.step.kind === 'round' ? scene.step : null;
      const times = moving ? timings(moving.sends) : [];

      const linkLayer = node(svg, 'g', {});
      const boxLayer = node(svg, 'g', {});
      const markLayer = node(svg, 'g', {});
      const flyLayer = node(svg, 'g', {});
      const capLayer = node(svg, 'g', {});

      // 운동 중인 사본의 몫
      const landing = new Map<string, number>(); // 받는 이 → 새 카드가 꽂힌 몫 (0..1)
      const sendAt = (from: string, to: string): number => {
        if (!moving) return -1;
        return moving.sends.findIndex((s) => s.from === from && s.to === to);
      };
      if (moving) {
        moving.sends.forEach((s, i) => {
          const tm = times[i];
          if (s.fresh && tm) landing.set(s.to, p >= tm.arrive ? 1 : 0);
        });
      }

      // 선
      const treeOf = new Map<string, string>(); // 받는 이 → 처음 받은 곳
      for (const h of scene.held) if (h.from !== null) treeOf.set(h.router, h.from);
      for (const { a, b } of scene.links) {
        const ba = boxes.get(a);
        const bb = boxes.get(b);
        if (!ba || !bb) continue;
        node(linkLayer, 'line', {
          x1: ba.cx, y1: ba.cy, x2: bb.cx, y2: bb.cy,
          stroke: colors.border, 'stroke-width': 2,
        });
      }
      for (const h of scene.held) {
        if (h.from === null) continue;
        const from = boxes.get(h.from);
        const to = boxes.get(h.router);
        if (!from || !to) continue;
        const i = sendAt(h.from, h.router);
        const tm = i >= 0 ? times[i] : undefined;
        let u = 1;
        if (tm) u = ease(clamp01((p - tm.start) / (tm.arrive - tm.start)));
        if (u <= 0) continue;
        const fc = cardRect(from);
        const tc = cardRect(to);
        const end = u >= 1 ? { x: to.cx, y: to.cy } : { x: fc.cx + (tc.cx - fc.cx) * u, y: fc.cy + (tc.cy - fc.cy) * u };
        node(linkLayer, 'line', {
          x1: from.cx, y1: from.cy, x2: end.x, y2: end.y,
          stroke: colors.primary, 'stroke-width': 4, 'stroke-linecap': 'round',
        });
        if (u >= 1) {
          // 처음 받은 쪽을 가리키는 작은 촉 — 받는 상자 둘레에
          const tip = rim(to, { x: from.cx, y: from.cy });
          const back = toward(tip, { x: from.cx, y: from.cy }, 9);
          const dx = tip.x - back.x;
          const dy = tip.y - back.y;
          node(markLayer, 'polygon', {
            points: [
              `${num(tip.x)},${num(tip.y)}`,
              `${num(back.x - dy * 0.55)},${num(back.y + dx * 0.55)}`,
              `${num(back.x + dy * 0.55)},${num(back.y - dx * 0.55)}`,
            ].join(' '),
            fill: colors.primary,
          });
        }
      }

      // 라우터 상자와 꽂힌 카드
      const heldBy = new Map(scene.held.map((h) => [h.router, h]));
      const sendingNow = new Set(moving ? moving.sends.map((s) => s.from) : []);
      for (const r of scene.routers) {
        const b = boxes.get(r);
        if (!b) continue;
        const h = heldBy.get(r);
        const landed = landing.has(r) ? landing.get(r) === 1 : true;
        const ringed = moving
          ? sendingNow.has(r) || (scene.frontier.includes(r) && landed)
          : scene.frontier.includes(r);
        node(boxLayer, 'rect', {
          x: b.x, y: b.y, width: b.w, height: b.h, rx: 7,
          fill: colors.bg,
          stroke: ringed ? colors.itemActive : colors.border,
          'stroke-width': ringed ? 3 : 1.5,
        });
        const name = node(boxLayer, 'text', {
          x: b.x + 8, y: b.y + HEAD_H - 6,
          'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700, fill: colors.text,
        });
        name.textContent = r;
        if (r === scene.origin) {
          const tag = node(boxLayer, 'text', {
            x: b.x + b.w - 8, y: b.y + HEAD_H - 7, 'text-anchor': 'end',
            'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted,
          });
          tag.textContent = t('label.origin', 'origin');
        }
        const slot = cardRect(b);
        if (h && landed) {
          drawCard(boxLayer, slot, h.copy, colors.primary, colors.bgSubtle);
        } else {
          node(boxLayer, 'rect', {
            x: slot.x, y: slot.y, width: slot.w, height: slot.h, rx: 4,
            fill: 'none', stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 3',
          });
        }
      }

      // 버린 사본 — 받는 상자 문 앞의 ×
      for (const d of scene.dropped) {
        const from = boxes.get(d.from);
        const to = boxes.get(d.to);
        if (!from || !to) continue;
        const i = sendAt(d.from, d.to);
        const tm = i >= 0 ? times[i] : undefined;
        const s = tm ? clamp01((p - tm.arrive) / (tm.end - tm.arrive)) : 1;
        if (s <= 0) continue;
        const at = toward(rim(to, { x: from.cx, y: from.cy }), { x: from.cx, y: from.cy }, 11);
        // 이번 라운드에 버린 것은 채워 두고, 지난 라운드의 것은 테두리만 남긴다
        const now = scene.step.kind === 'round' && d.round === scene.step.round;
        const ink = now ? colors.textInverse : colors.danger;
        const k = 6 * s;
        const g = node(markLayer, 'g', {});
        node(g, 'circle', { cx: at.x, cy: at.y, r: (now ? 10 : 9) * s, fill: now ? colors.danger : colors.bg, stroke: colors.danger, 'stroke-width': 1.5 });
        node(g, 'line', { x1: at.x - k * 0.7, y1: at.y - k * 0.7, x2: at.x + k * 0.7, y2: at.y + k * 0.7, stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round' });
        node(g, 'line', { x1: at.x - k * 0.7, y1: at.y + k * 0.7, x2: at.x + k * 0.7, y2: at.y - k * 0.7, stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round' });
      }

      // 건너가는 사본 — 보낸 쪽의 카드 자리에서 떨어져 나와 받는 쪽 칸으로
      if (moving) {
        moving.sends.forEach((s, i) => {
          const tm = times[i];
          const from = boxes.get(s.from);
          const to = boxes.get(s.to);
          if (!tm || !from || !to || p < tm.start) return;
          const fc = cardRect(from);
          const tc = cardRect(to);
          const u = ease(clamp01((p - tm.start) / (tm.arrive - tm.start)));
          if (s.fresh && u >= 1) return; // 꽂혔다 — 정적 카드가 이어받는다
          const x = fc.x + (tc.x - fc.x) * u;
          const y = fc.y + (tc.y - fc.y) * u;
          let scale = 1;
          let drop = 0;
          let fade = 1;
          if (!s.fresh && p >= tm.arrive) {
            const d = clamp01((p - tm.arrive) / (tm.end - tm.arrive));
            if (d >= 1) return;
            scale = 1 - 0.8 * d;
            drop = 22 * d;
            fade = 1 - d;
          }
          const w = tc.w * scale;
          const h = tc.h * scale;
          const g = node(flyLayer, 'g', {
            transform: `translate(${num(x + (tc.w - w) / 2)},${num(y + (tc.h - h) / 2 + drop)}) scale(${fine(scale)})`,
            opacity: fine(fade),
          });
          drawCard(g, { x: 0, y: 0, w: tc.w, h: tc.h, cx: tc.w / 2, cy: tc.h / 2 }, s.copy, s.fresh ? colors.primary : colors.danger, colors.bg);
        });
      }

      drawCaption(capLayer, scene);
    }

    function drawCaption(layer: Element, scene: LinkStateFloodScene): void {
      const lines: { text: string; strong: boolean }[] = [];
      const step = scene.step;
      if (step.kind === 'start') {
        lines.push({ text: t('caption.start', 'Router {origin} writes its neighbor list into one notice.', { origin: scene.origin }), strong: true });
        lines.push({ text: t('caption.next', 'Sending next round: {names}', { names: scene.frontier.join(' · ') }), strong: false });
      } else if (step.kind === 'round') {
        const fresh = step.sends.filter((s) => s.fresh).length;
        lines.push({
          text: t('caption.round', 'Round {round} — sent: {sent} · kept as new: {fresh} · dropped (already held): {dropped}', {
            round: step.round,
            sent: step.sends.length,
            fresh,
            dropped: step.sends.length - fresh,
          }),
          strong: true,
        });
        lines.push(
          scene.frontier.length > 0
            ? { text: t('caption.next', 'Sending next round: {names}', { names: scene.frontier.join(' · ') }), strong: false }
            : { text: t('caption.stop', 'No router got it new — nobody sends next round.'), strong: false },
        );
      } else {
        lines.push({
          text: t('caption.done', 'Routers holding a copy identical to the one {origin} wrote: {same} / {total}', {
            origin: scene.origin,
            same: step.same,
            total: step.total,
          }),
          strong: true,
        });
        lines.push({
          text: t('caption.totals', 'Last round: {rounds} · copies sent: {sent} · dropped: {dropped}', {
            rounds: step.rounds,
            sent: step.sent,
            dropped: step.dropped,
          }),
          strong: false,
        });
      }
      const y0 = H - CAPTION_H + SM + 6;
      lines.forEach((l, i) => {
        const tx = node(layer, 'text', {
          x: PIECE_CANVAS_W / 2,
          y: y0 + i * (SM + 10),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': l.strong ? 600 : 400,
          fill: l.strong ? colors.text : colors.textMuted,
        });
        tx.textContent = l.text;
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function play(scene: LinkStateFloodScene, mine: number): Promise<void> {
      // 한 시계 — 프레임마다 FRAME_MS 씩 셈한다
      for (let elapsed = 0; elapsed < MOTION_MS; elapsed += FRAME_MS) {
        if (destroyed || mine !== gen) return;
        draw(scene, elapsed / MOTION_MS);
        await wait(FRAME_MS);
      }
      if (destroyed || mine !== gen) return;
      draw(scene, 1);
    }

    return {
      render(next: LinkStateFloodScene, _prev: LinkStateFloodScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind !== 'round') {
          draw(next, 1);
          return;
        }
        return play(next, mine);
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
