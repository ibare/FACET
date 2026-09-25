/**
 * 2차 기회 stage — 칸 넷이 시계 판처럼 둘러서고 가운데 바늘이 한 방향으로 돈다.
 *
 * 동사 "돌며 지운다" 를 그대로 그린다.
 *   - 짚고 넘어감(spare) — 켜진 표시가 오그라들어 꺼지고, 바늘이 다음 칸으로 한 칸 돈다
 *   - 내보냄(evict) — 나가는 페이지가 칸에서 빠져 오른쪽 아래 더미로 가고, 기다리던 페이지가
 *     그 칸으로 들어가며 표시가 켜진다. 그리고 바늘이 한 칸 돈다
 *   - 적중(hit) — 참조가 제 칸으로 날아가 닿고 표시가 켜진다. 바늘은 그대로
 *   - 폴트 알아챔(miss) — 참조가 줄에서 내려와 칸을 기다린다
 *
 * 화면은 늘 장면 전체에서 새로 세운다(drawStatic). 운동은 그 위에서 아직 못 온 만큼을 그린다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SecondChanceScene } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 소수 끝자리와 -0 을 걷는다 */
function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
  weight = '400',
  family: string = fonts.body,
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-size': size,
    'font-family': family,
    'font-weight': weight,
    fill,
    'text-anchor': anchor,
    'dominant-baseline': 'middle',
  });
  node.textContent = body;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Pt = { x: number; y: number };

/** 자리 셈 — 캔버스 폭에서 거꾸로 푼다 */
function geometry(slotCount: number, refCount: number) {
  const W = PIECE_CANVAS_W;
  const captionY = 24;
  const clockW = Math.round(W * 0.52);
  const top = 48;
  const bottom = H - 8;
  const boxW = Math.min(76, Math.round(clockW * 0.23));
  const boxH = Math.min(56, Math.round((bottom - top) * 0.2));
  const cx = Math.round(clockW / 2);
  const cy = Math.round((top + bottom) / 2);
  const radius = Math.min(clockW / 2 - boxW / 2 - 10, (bottom - top) / 2 - boxH / 2);
  const slotAt = (i: number): Pt => {
    const a = (i * 2 * Math.PI) / slotCount;
    return { x: r2(cx + radius * Math.sin(a)), y: r2(cy - radius * Math.cos(a)) };
  };

  const px0 = clockW + 24;
  const px1 = W - 16;
  const panelW = px1 - px0;
  const tokGap = 10;
  const tokW = Math.min(52, (panelW - tokGap * (refCount - 1)) / refCount);
  const tokH = 40;
  const refsLabelY = 70;
  const refsY = 88;
  const refAt = (i: number): Pt => ({ x: r2(px0 + tokW / 2 + i * (tokW + tokGap)), y: refsY + tokH / 2 });
  const pendingY = refsY + tokH + 44;
  const pendingAt = (i: number): Pt => ({ x: refAt(i).x, y: pendingY });
  const countY = pendingY + tokH / 2 + 30;
  const evictedLabelY = countY + 28;
  const trayY = evictedLabelY + 18 + tokH / 2;
  const trayAt = (i: number): Pt => ({ x: r2(px0 + tokW / 2 + i * (tokW + tokGap)), y: trayY });
  return {
    W,
    captionY,
    cx,
    cy,
    radius,
    boxW,
    boxH,
    slotAt,
    px0,
    px1,
    tokW,
    tokH,
    refsLabelY,
    refAt,
    pendingAt,
    countY,
    evictedLabelY,
    trayAt,
  };
}

type Geo = ReturnType<typeof geometry>;

type Handles = {
  hand: SVGGElement | null;
  lampOn: SVGCircleElement[];
  lampDigit: SVGTextElement[];
  pages: SVGGElement[];
  pending: SVGGElement | null;
  lastEvicted: SVGGElement | null;
  motion: SVGGElement | null;
};

const LAMP_R = 9;

export const secondChanceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const xs = fontSizes.xs;
    const sm = fontSizes.sm;
    const md = fontSizes.md;
    const lg = fontSizes.lg;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let h: Handles = emptyHandles();

    function emptyHandles(): Handles {
      return { hand: null, lampOn: [], lampDigit: [], pages: [], pending: null, lastEvicted: null, motion: null };
    }

    function pageToken(
      parent: Element,
      at: Pt,
      g: Geo,
      page: number,
      stroke: string,
      fill: string,
      ink: string,
      dashed = false,
    ): SVGGElement {
      const grp = el(parent, 'g', { transform: `translate(${r2(at.x)},${r2(at.y)})` });
      el(grp, 'rect', {
        x: -g.tokW / 2,
        y: -g.tokH / 2,
        width: g.tokW,
        height: g.tokH,
        rx: 6,
        fill,
        stroke,
        'stroke-width': 1.5,
        ...(dashed ? { 'stroke-dasharray': '4 3' } : {}),
      });
      if (!dashed) label(grp, 0, 1, String(page), lg, ink, 'middle', '600', fonts.mono);
      return grp;
    }

    function caption(s: SecondChanceScene): string {
      const st = s.step;
      switch (st.kind) {
        case 'start':
          return t('caption.start', 'The hand rests on slot {slot}.', { slot: s.hand });
        case 'hit':
          return t('caption.hit', 'Page {page} is already in slot {slot}. Hit: its mark turns on, the hand stays.', {
            page: st.page,
            slot: st.slot,
          });
        case 'miss':
          return t('caption.miss', 'Page {page} is in no slot. Fault: the hand starts to turn.', { page: st.page });
        case 'spare':
          return t('caption.spare', 'Slot {slot} holds page {page} with its mark on. Clear the mark, move on.', {
            slot: st.slot,
            page: st.page,
          });
        case 'evict':
          return t('caption.evict', 'Slot {slot} holds page {out} with no mark. Evict it; page {page} goes in.', {
            slot: st.slot,
            out: st.out,
            page: st.page,
          });
      }
    }

    function drawStatic(s: SecondChanceScene): void {
      svg.textContent = '';
      h = emptyHandles();
      const g = geometry(s.slots.length, s.refs.length);
      const st = s.step;

      el(svg, 'rect', { x: 0, y: 0, width: g.W, height: H, fill: c.bg });
      label(svg, g.W / 2, g.captionY, caption(s), md, c.text, 'middle', '500');

      // 바늘이 도는 길 — 한 방향임을 길 위의 꺾쇠로 보인다
      el(svg, 'circle', { cx: g.cx, cy: g.cy, r: g.radius, fill: 'none', stroke: c.border, 'stroke-width': 1.5 });
      const n = s.slots.length;
      for (let i = 0; i < n; i += 1) {
        const a = ((i + 0.5) * 360) / n;
        const rad = (a * Math.PI) / 180;
        const x = g.cx + g.radius * Math.sin(rad);
        const y = g.cy - g.radius * Math.cos(rad);
        el(svg, 'path', {
          d: 'M -5 -6 L 4 0 L -5 6',
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.5,
          transform: `translate(${r2(x)},${r2(y)}) rotate(${r2(a)})`,
        });
      }

      // 칸
      const stepSlot = st.kind === 'hit' || st.kind === 'spare' || st.kind === 'evict' ? st.slot : -1;
      const ring = st.kind === 'hit' ? c.primary : c.itemComparing;
      for (let i = 0; i < n; i += 1) {
        const at = g.slotAt(i);
        const slot = s.slots[i]!;
        el(svg, 'rect', {
          x: at.x - g.boxW / 2,
          y: at.y - g.boxH / 2,
          width: g.boxW,
          height: g.boxH,
          rx: 8,
          fill: c.bgSubtle,
          stroke: i === stepSlot ? ring : c.border,
          'stroke-width': i === stepSlot ? 2.5 : 1.5,
        });
        label(svg, at.x - g.boxW / 2 + 7, at.y - g.boxH / 2 + 10, t('label.slot', 'slot {n}', { n: i }), xs, c.textMuted, 'start');
        const pg = el(svg, 'g', {});
        label(pg, at.x, at.y + 7, String(slot.page), lg, c.text, 'middle', '600', fonts.mono);
        h.pages.push(pg);

        const lx = at.x + g.boxW / 2 - 2;
        const ly = at.y - g.boxH / 2 + 2;
        el(svg, 'circle', { cx: lx, cy: ly, r: LAMP_R, fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.5 });
        h.lampOn.push(el(svg, 'circle', { cx: lx, cy: ly, r: slot.bit === 1 ? LAMP_R : 0, fill: c.accent }));
        h.lampDigit.push(label(svg, lx, ly + 1, String(slot.bit), xs, slot.bit === 1 ? c.stateInk : c.textMuted, 'middle', '700', fonts.mono));
      }

      // 바늘
      const reach = g.radius - g.boxH / 2 - 8;
      const hand = el(svg, 'g', { transform: `rotate(${r2((s.hand * 360) / n)},${g.cx},${g.cy})` });
      el(hand, 'line', {
        x1: g.cx,
        y1: g.cy,
        x2: g.cx,
        y2: g.cy - reach,
        stroke: c.text,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });
      el(hand, 'path', {
        d: `M ${r2(g.cx - 7)} ${r2(g.cy - reach + 10)} L ${g.cx} ${r2(g.cy - reach - 2)} L ${r2(g.cx + 7)} ${r2(g.cy - reach + 10)} Z`,
        fill: c.text,
      });
      h.hand = hand;
      el(svg, 'circle', { cx: g.cx, cy: g.cy, r: 6, fill: c.text });
      // 바늘은 네 곧은 방향으로만 서므로 비낀 자리에 이름을 두면 겹치지 않는다
      label(svg, g.cx - 10, g.cy + 16, t('label.hand', 'hand'), xs, c.textMuted, 'end');

      // 참조 줄
      label(svg, g.px0, g.refsLabelY, t('label.refs', 'References'), sm, c.textMuted, 'start');
      for (let i = 0; i < s.refs.length; i += 1) {
        const page = s.refs[i]!;
        const at = g.refAt(i);
        if (i === s.cursor && s.pending !== null) {
          pageToken(svg, at, g, page, c.border, 'none', c.text, true);
        } else if (i === s.cursor) {
          pageToken(svg, at, g, page, c.primary, c.bgSubtle, c.text);
        } else if (i < s.cursor) {
          pageToken(svg, at, g, page, c.border, c.bg, c.textMuted);
        } else {
          pageToken(svg, at, g, page, c.textMuted, c.bg, c.text);
        }
      }
      if (s.pending !== null && s.cursor >= 0) {
        h.pending = pageToken(svg, g.pendingAt(s.cursor), g, s.pending, c.itemComparing, c.bgSubtle, c.text);
      }

      // 짚은 칸 수 · 표시 풀이
      label(svg, g.px0, g.countY, t('label.looked', 'Slots checked: {n}', { n: s.looked }), sm, c.text, 'start');
      const legendX = g.px1 - LAMP_R;
      el(svg, 'circle', { cx: legendX, cy: g.refsLabelY, r: LAMP_R - 2, fill: c.accent });
      label(svg, legendX - LAMP_R - 4, g.refsLabelY, t('label.mark', 'reference mark'), xs, c.textMuted, 'end');

      // 내보낸 페이지
      label(svg, g.px0, g.evictedLabelY, t('label.evicted', 'Evicted'), sm, c.textMuted, 'start');
      for (let i = 0; i < s.evicted.length; i += 1) {
        const grp = pageToken(svg, g.trayAt(i), g, s.evicted[i]!, c.itemSwapping, c.bg, c.textMuted);
        if (i === s.evicted.length - 1) h.lastEvicted = grp;
      }

      h.motion = el(svg, 'g', {});
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
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
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
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

    function place(node: SVGGElement | null, at: Pt): void {
      node?.setAttribute('transform', `translate(${r2(at.x)},${r2(at.y)})`);
    }

    function lamp(i: number, r: number, bit: 0 | 1): void {
      h.lampOn[i]?.setAttribute('r', String(r2(r)));
      const d = h.lampDigit[i];
      if (d) {
        d.textContent = String(bit);
        d.setAttribute('fill', bit === 1 ? c.stateInk : c.textMuted);
      }
    }

    function turn(from: number, count: number, p: number, g: Geo): void {
      const a = ((from + p) * 360) / count;
      h.hand?.setAttribute('transform', `rotate(${r2(a)},${g.cx},${g.cy})`);
    }

    async function motion(next: SecondChanceScene, mine: number): Promise<void> {
      const st = next.step;
      const g = geometry(next.slots.length, next.refs.length);
      const n = next.slots.length;
      const live = (): boolean => mine === gen && !destroyed;

      if (st.kind === 'hit') {
        const from = g.refAt(next.cursor);
        const to = g.slotAt(st.slot);
        const ghost = h.motion ? pageToken(h.motion, from, g, st.page, c.primary, c.bgSubtle, c.text) : null;
        // 표시가 이미 켜져 있던 적중이면 켜진 채로 둔다 (이 데이터에는 없다)
        if (st.was === 0) lamp(st.slot, 0, 0);
        if (!(await tween(380, mine, (p) => place(ghost, { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p })))) return;
        if (!live()) return;
        ghost?.remove();
        if (st.was === 0) await tween(240, mine, (p) => lamp(st.slot, LAMP_R * p, 1));
        return;
      }

      if (st.kind === 'miss') {
        const from = g.refAt(next.cursor);
        const to = g.pendingAt(next.cursor);
        await tween(380, mine, (p) => place(h.pending, { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }));
        return;
      }

      if (st.kind === 'spare') {
        turn(st.from, n, 0, g);
        if (!(await tween(300, mine, (p) => lamp(st.slot, LAMP_R * (1 - p), p < 0.5 ? 1 : 0)))) return;
        if (!live()) return;
        await tween(380, mine, (p) => turn(st.from, n, p, g));
        return;
      }

      if (st.kind === 'evict') {
        const slotPt = g.slotAt(st.slot);
        const trayPt = g.trayAt(next.evicted.length - 1);
        const waitPt = g.pendingAt(next.cursor);
        // 나가는 페이지 — 더미 자리의 토큰을 칸에서 출발시킨다
        const out = h.lastEvicted;
        // 들어올 페이지는 아직 기다리는 자리에 있다 — 칸의 글자는 닿을 때까지 가려 두고 토큰이 옮겨 간다
        const inPage = h.pages[st.slot] ?? null;
        inPage?.setAttribute('visibility', 'hidden');
        const incoming = h.motion ? pageToken(h.motion, waitPt, g, st.page, c.itemComparing, c.bgSubtle, c.text) : null;
        lamp(st.slot, 0, 0);
        turn(st.from, n, 0, g);
        if (
          !(await tween(420, mine, (p) =>
            place(out, { x: slotPt.x + (trayPt.x - slotPt.x) * p, y: slotPt.y + (trayPt.y - slotPt.y) * p }),
          ))
        ) {
          return;
        }
        if (!live()) return;
        if (
          !(await tween(420, mine, (p) =>
            place(incoming, { x: waitPt.x + (slotPt.x - waitPt.x) * p, y: waitPt.y + (slotPt.y - waitPt.y) * p }),
          ))
        ) {
          return;
        }
        if (!live()) return;
        incoming?.remove();
        inPage?.removeAttribute('visibility');
        lamp(st.slot, LAMP_R, 1);
        await tween(360, mine, (p) => turn(st.from, n, p, g));
      }
    }

    return {
      async render(next: SecondChanceScene, prev: SecondChanceScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        await motion(next, mine);
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
