/**
 * hop-count-metric 의 무대.
 *
 * 동사 "하나씩 불어나며 건너간다": 라운드마다 라우터가 제 수를 이웃에게 알리면 그 수가 선을 따라
 * 건너가고, 선의 가운데를 지나며 1 이 더해진다. 받아 적힌 수는 받는 라우터의 수 자리로 들어가고,
 * 적힌 수보다 크거나 같아 버려진 수는 선 끝에서 떨어져 사라진다.
 * 마지막 걸음에서는 지켜보는 라우터에 이웃들의 수가 닿아 나란히 서고, 큰 쪽이 아래로 밀려나 그어진다.
 *
 * 라우터는 고리 위에 선다 — 망이 붙은 라우터를 오른쪽 끝에 두고, 거기서부터 이웃을 이름 차례로
 * 따라가며 위쪽으로 돈다. 자리는 캔버스 크기에서 역산한다.
 */
import {
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
import type { HopCountMetricScene, SceneCandidate, SceneEntry, SceneOffer } from './scene.js';

const H = 400;
const PAD = 16;
const TOP = 42;
const CAPTION_BAND = 48;
/** 맨 아래 라우터의 동그라미와 캡션 사이 */
const BOTTOM = 34;
const NODE_R = 22;
const BADGE_R = 12;
const TOKEN_R = 11;
const NET_GAP = 60;
const CHIP_GAP = 14;
const CHIP_H = 24;
const CHIP_DROP = 10;
const MAX_RING_R = 180;

const TRAVEL_MS = 520;
const SETTLE_MS = 220;
const SLIDE_MS = 260;

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Pt {
  x: number;
  y: number;
}

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  parent.appendChild(node);
  return node;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function lerp(a: Pt, b: Pt, k: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** 망이 붙은 라우터에서 시작해 이웃을 이름 차례로 따라가는 고리 차례. 닿지 않는 라우터는 뒤에 붙인다. */
function ringOrder(scene: HopCountMetricScene): string[] {
  const nbr = new Map<string, string[]>(scene.routers.map((r) => [r, [] as string[]]));
  for (const [a, b] of scene.links) {
    nbr.get(a)?.push(b);
    nbr.get(b)?.push(a);
  }
  for (const list of nbr.values()) list.sort();
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (r: string): void => {
    if (seen.has(r) || !nbr.has(r)) return;
    seen.add(r);
    order.push(r);
    for (const n of nbr.get(r) ?? []) visit(n);
  };
  visit(scene.attached);
  for (const r of scene.routers) visit(r);
  return order;
}

interface Layout {
  pos: Map<string, Pt>;
  center: Pt;
  net: { x: number; y: number; w: number; h: number };
}

function layout(scene: HopCountMetricScene, monoPx: number): Layout {
  const W = PIECE_CANVAS_W;
  const order = ringOrder(scene);
  const n = Math.max(order.length, 1);
  const angles = order.map((_, i) => (-2 * Math.PI * i) / n);
  const minCos = Math.min(1, ...angles.map((a) => Math.cos(a)));
  const maxSin = Math.max(0.5, ...angles.map((a) => Math.abs(Math.sin(a))));

  const netW = scene.net.length * monoPx * 0.62 + 24;
  const netH = 34;
  const netX = W - PAD - netW;
  const rightX = netX - NET_GAP;
  const chipW = chipWidth(monoPx);
  const byWidth = (rightX - PAD - NODE_R - CHIP_GAP - chipW) / Math.max(1 - minCos, 1e-6);
  const band = H - CAPTION_BAND - TOP - BOTTOM;
  const byHeight = band / (2 * maxSin);
  const R = Math.max(40, Math.min(MAX_RING_R, byWidth, byHeight));
  const cy = TOP + band / 2;
  const cx = rightX - R;
  const pos = new Map<string, Pt>();
  order.forEach((r, i) => {
    const a = angles[i] ?? 0;
    pos.set(r, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  });
  return { pos, center: { x: cx, y: cy }, net: { x: netX, y: cy - netH / 2, w: netW, h: netH } };
}

function chipWidth(px: number): number {
  return px * 5.2 + 16;
}

function badgeAt(p: Pt): Pt {
  return { x: p.x + NODE_R * 0.9, y: p.y - NODE_R * 0.9 };
}

/** s 에서 r 로 가는 선 위 수의 출발점 · 도착점. 맞선 두 수가 비껴가도록 옆으로 조금 민다. */
function lane(a: Pt, b: Pt): { from: Pt; to: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const off = 9;
  const nx = -uy * off;
  const ny = ux * off;
  return {
    from: { x: a.x + ux * (NODE_R + 6) + nx, y: a.y + uy * (NODE_R + 6) + ny },
    to: { x: b.x - ux * (NODE_R + 14) + nx, y: b.y - uy * (NODE_R + 14) + ny },
  };
}

interface ChipSpot {
  cand: SceneCandidate;
  kept: boolean;
  at: Pt;
}

function chipSpots(
  lay: Layout,
  router: string,
  candidates: SceneCandidate[],
  keptVia: string,
  monoPx: number,
): ChipSpot[] {
  const p = lay.pos.get(router);
  if (!p) return [];
  const w = chipWidth(monoPx);
  const left = p.x <= lay.center.x;
  const x = left ? p.x - NODE_R - CHIP_GAP - w / 2 : p.x + NODE_R + CHIP_GAP + w / 2;
  const kept = candidates.filter((c) => c.via === keptVia);
  const others = candidates.filter((c) => c.via !== keptVia);
  const spots: ChipSpot[] = [];
  const total = kept.length + others.length;
  const top = p.y - ((total - 1) * (CHIP_H + 6)) / 2 - CHIP_DROP / 2;
  [...kept, ...others].forEach((c, i) => {
    const isKept = c.via === keptVia;
    spots.push({ cand: c, kept: isKept, at: { x, y: top + i * (CHIP_H + 6) + (isKept ? 0 : CHIP_DROP) } });
  });
  return spots;
}

export const hopCountMetricStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    svg.textContent = '';
    const base = el('g', {}, svg);
    const over = el('g', {}, svg);

    function viaLabel(c: SceneCandidate): string {
      return t('label.via', 'via {r}: {n}', { r: c.via, n: c.value });
    }

    function caption(scene: HopCountMetricScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        const i = scene.routers.indexOf(scene.attached);
        const e = i >= 0 ? scene.table[i] : null;
        if (!e) return '';
        return t('caption.start', 'Network {net} sits directly on router {router}. Count: {n}', {
          net: scene.net,
          router: scene.attached,
          n: e.dist,
        });
      }
      if (step.kind === 'round') {
        const k = step.offers.filter((o) => o.kept).length;
        const d = step.offers.length - k;
        if (k === 0) {
          return t('caption.settled', 'Round {n}: nothing written, dropped: {d}. The tables stop changing.', {
            n: step.round,
            d,
          });
        }
        return t('caption.round', 'Round {n}: each count crosses a link and gains 1. Written: {k} · dropped: {d}', {
          n: step.round,
          k,
          d,
        });
      }
      const kept = step.candidates.find((c) => c.via === step.keptVia);
      if (!kept) return '';
      return t('caption.choose', 'At router {router} the smallest count stays: {kept} via {via}', {
        router: step.router,
        kept: kept.value,
        via: kept.via,
      });
    }

    function arrowHead(parent: Element, at: Pt, dir: Pt, color: string): void {
      const len = Math.hypot(dir.x, dir.y) || 1;
      const ux = dir.x / len;
      const uy = dir.y / len;
      const s = 7;
      const tip = { x: at.x + ux * s, y: at.y + uy * s };
      const l = { x: at.x - ux * s - uy * s * 0.8, y: at.y - uy * s + ux * s * 0.8 };
      const r = { x: at.x - ux * s + uy * s * 0.8, y: at.y - uy * s - ux * s * 0.8 };
      el('polygon', { points: `${num(tip.x)},${num(tip.y)} ${num(l.x)},${num(l.y)} ${num(r.x)},${num(r.y)}`, fill: color }, parent);
    }

    function drawToken(parent: Element, at: Pt, value: number, stroke: string): { g: SVGElement; c: SVGElement; txt: SVGElement } {
      const g = el('g', {}, parent);
      const c = el('circle', { cx: at.x, cy: at.y, r: TOKEN_R, fill: colors.bg, stroke, 'stroke-width': 2 }, g);
      const txt = el(
        'text',
        {
          x: at.x,
          y: at.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        },
        g,
      );
      txt.textContent = String(value);
      return { g, c, txt };
    }

    function moveToken(tok: { c: SVGElement; txt: SVGElement }, at: Pt, r: number): void {
      tok.c.setAttribute('cx', num(at.x));
      tok.c.setAttribute('cy', num(at.y));
      tok.c.setAttribute('r', num(r));
      tok.txt.setAttribute('x', num(at.x));
      tok.txt.setAttribute('y', num(at.y));
    }

    /**
     * 바탕 그리기. table 은 보일 표, fresh 는 이번 걸음에 새로 적힌 라우터, chips 는 견줌 칸(없으면 그리지 않음).
     */
    function drawBase(
      scene: HopCountMetricScene,
      lay: Layout,
      table: ReadonlyArray<SceneEntry | null>,
      fresh: ReadonlySet<string>,
      chips: ChipSpot[] | null,
      text: string,
    ): void {
      base.textContent = '';
      const entryOf = (r: string): SceneEntry | null => {
        const i = scene.routers.indexOf(r);
        return i >= 0 ? (table[i] ?? null) : null;
      };

      // 망
      const net = lay.net;
      el('rect', { x: net.x, y: net.y, width: net.w, height: net.h, rx: 6, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1.5 }, base);
      const netText = el(
        'text',
        {
          x: net.x + net.w / 2,
          y: net.y + net.h / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        },
        base,
      );
      netText.textContent = scene.net;

      // 선
      for (const [a, b] of scene.links) {
        const pa = lay.pos.get(a);
        const pb = lay.pos.get(b);
        if (!pa || !pb) continue;
        el('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-opacity': 0.6 }, base);
      }

      // 다음 홉 — 라우터에서 다음 홉 쪽으로 굵은 선과 화살촉
      for (const r of scene.routers) {
        const e = entryOf(r);
        const p = lay.pos.get(r);
        if (!e || !p) continue;
        if (e.via === null) {
          const from = { x: p.x + NODE_R, y: p.y };
          const to = { x: net.x - 2, y: net.y + net.h / 2 };
          el('line', { x1: from.x, y1: from.y, x2: to.x - 6, y2: to.y, stroke: colors.primary, 'stroke-width': 3, 'stroke-linecap': 'round' }, base);
          arrowHead(base, { x: to.x - 7, y: to.y }, { x: to.x - from.x, y: to.y - from.y }, colors.primary);
          continue;
        }
        const q = lay.pos.get(e.via);
        if (!q) continue;
        const mid = lerp(p, q, 0.5);
        el('line', { x1: p.x, y1: p.y, x2: mid.x, y2: mid.y, stroke: colors.primary, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, base);
        arrowHead(base, mid, { x: q.x - p.x, y: q.y - p.y }, colors.primary);
      }

      // 라우터와 수 자리
      for (const r of scene.routers) {
        const p = lay.pos.get(r);
        if (!p) continue;
        el('circle', { cx: p.x, cy: p.y, r: NODE_R, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, base);
        const name = el(
          'text',
          {
            x: p.x,
            y: p.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: colors.text,
          },
          base,
        );
        name.textContent = r;

        const b = badgeAt(p);
        const e = entryOf(r);
        if (!e) {
          el('circle', { cx: b.x, cy: b.y, r: BADGE_R, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, base);
          continue;
        }
        const isFresh = fresh.has(r);
        el(
          'circle',
          {
            cx: b.x,
            cy: b.y,
            r: BADGE_R,
            fill: isFresh ? colors.accent : colors.primary,
            stroke: isFresh ? colors.text : colors.primary,
            'stroke-width': isFresh ? 1.5 : 1,
          },
          base,
        );
        const bt = el(
          'text',
          {
            x: b.x,
            y: b.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: isFresh ? colors.text : colors.textInverse,
          },
          base,
        );
        bt.textContent = String(e.dist);
      }

      // 견줌 칸
      if (chips) {
        const w = chipWidth(monoPx);
        for (const s of chips) {
          const x = s.at.x - w / 2;
          const y = s.at.y - CHIP_H / 2;
          el(
            'rect',
            {
              x,
              y,
              width: w,
              height: CHIP_H,
              rx: 5,
              fill: s.kept ? colors.bg : colors.bgSubtle,
              stroke: s.kept ? colors.primary : colors.danger,
              'stroke-width': s.kept ? 2.5 : 1.2,
            },
            base,
          );
          const ct = el(
            'text',
            {
              x: s.at.x,
              y: s.at.y,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': s.kept ? 700 : 400,
              fill: s.kept ? colors.text : colors.textMuted,
            },
            base,
          );
          ct.textContent = viaLabel(s.cand);
          if (!s.kept) {
            el('line', { x1: x + 6, y1: s.at.y, x2: x + w - 6, y2: s.at.y, stroke: colors.danger, 'stroke-width': 1.5 }, base);
          }
        }
      }

      // 캡션
      if (text) {
        const cap = el(
          'text',
          {
            x: PIECE_CANVAS_W / 2,
            y: H - CAPTION_BAND / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: colors.text,
          },
          base,
        );
        cap.textContent = text;
      }
    }

    function freshOf(scene: HopCountMetricScene): Set<string> {
      const out = new Set<string>();
      if (scene.step.kind !== 'round') return out;
      for (const o of scene.step.offers) if (o.kept) out.add(o.to);
      return out;
    }

    function chipsOf(scene: HopCountMetricScene, lay: Layout): ChipSpot[] | null {
      const step = scene.step;
      if (step.kind !== 'choose') return null;
      return chipSpots(lay, step.router, step.candidates, step.keptVia, monoPx);
    }

    function drawStatic(scene: HopCountMetricScene): void {
      over.textContent = '';
      const lay = layout(scene, monoPx);
      drawBase(scene, lay, scene.table, freshOf(scene), chipsOf(scene, lay), caption(scene));
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
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
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const k = Math.min(1, (performance.now() - start) / ms);
          frame(k);
          if (k >= 1) {
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

    /** 수가 선을 건너며 가운데서 1 이 는다. k 는 0..1 */
    function travelFrame(
      tok: { c: SVGElement; txt: SVGElement },
      from: Pt,
      to: Pt,
      sent: number,
      value: number,
      k: number,
    ): void {
      const e = ease(k);
      const bump = Math.max(0, 1 - Math.abs(k - 0.5) / 0.12);
      moveToken(tok, lerp(from, to, e), TOKEN_R * (1 + 0.35 * bump));
      tok.txt.textContent = String(e < 0.5 ? sent : value);
    }

    async function flowRound(scene: HopCountMetricScene, offers: SceneOffer[], before: Array<SceneEntry | null>, mine: number): Promise<void> {
      const lay = layout(scene, monoPx);
      drawBase(scene, lay, before, new Set<string>(), null, caption(scene));
      over.textContent = '';
      const toks = offers.flatMap((o) => {
        const a = lay.pos.get(o.from);
        const b = lay.pos.get(o.to);
        if (!a || !b) return [];
        const ln = lane(a, b);
        return [{ o, ln, badge: badgeAt(b), tok: drawToken(over, ln.from, o.sent, colors.itemComparing) }];
      });
      const ok = await tween(TRAVEL_MS, mine, (k) => {
        for (const x of toks) travelFrame(x.tok, x.ln.from, x.ln.to, x.o.sent, x.o.value, k);
      });
      if (!ok) return;
      for (const x of toks) if (!x.o.kept) x.tok.c.setAttribute('stroke', colors.danger);
      await tween(SETTLE_MS, mine, (k) => {
        const e = ease(k);
        for (const x of toks) {
          if (x.o.kept) {
            moveToken(x.tok, lerp(x.ln.to, x.badge, e), TOKEN_R + (BADGE_R - TOKEN_R) * e);
          } else {
            moveToken(x.tok, { x: x.ln.to.x, y: x.ln.to.y + 26 * e }, TOKEN_R * (1 - 0.4 * e));
            x.tok.g.setAttribute('opacity', num(1 - e));
          }
        }
      });
    }

    async function flowChoose(scene: HopCountMetricScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'choose') return;
      const lay = layout(scene, monoPx);
      const target = lay.pos.get(step.router);
      if (!target) return;
      drawBase(scene, lay, scene.table, new Set<string>(), null, caption(scene));
      over.textContent = '';
      const spots = chipsOf(scene, lay) ?? [];
      const toks = spots.flatMap((s) => {
        const a = lay.pos.get(s.cand.via);
        const i = scene.routers.indexOf(s.cand.via);
        const sent = i >= 0 ? scene.table[i] : null;
        if (!a || !sent) return [];
        const ln = lane(a, target);
        const row = { x: s.at.x, y: s.kept ? s.at.y : s.at.y - CHIP_DROP };
        return [{ s, ln, row, sent: sent.dist, tok: drawToken(over, ln.from, sent.dist, colors.itemComparing) }];
      });
      if (!(await tween(TRAVEL_MS, mine, (k) => {
        for (const x of toks) travelFrame(x.tok, x.ln.from, x.ln.to, x.sent, x.s.cand.value, k);
      }))) return;
      if (!(await tween(SLIDE_MS, mine, (k) => {
        const e = ease(k);
        for (const x of toks) moveToken(x.tok, lerp(x.ln.to, x.row, e), TOKEN_R);
      }))) return;
      for (const x of toks) if (!x.s.kept) x.tok.c.setAttribute('stroke', colors.danger);
      await tween(SETTLE_MS, mine, (k) => {
        const e = ease(k);
        for (const x of toks) if (!x.s.kept) moveToken(x.tok, { x: x.row.x, y: x.row.y + CHIP_DROP * e }, TOKEN_R);
      });
    }

    const renderer: SceneRenderer<HopCountMetricScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'round') await flowRound(next, step.offers, step.before, mine);
        else if (step.kind === 'choose') await flowChoose(next, mine);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };

    // initialData 는 좁히지 않는다 — 바탕은 장면에서 읽으므로 initialData 가 없어도 던지지 않는다.
    const instance: ViewInstance = { render: renderer.render, destroy: renderer.destroy };
    return instance;
  },
};
