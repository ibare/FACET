/**
 * eventually-agrees stage — 사본 넷이 네모의 네 귀에 선다. 리더 자리는 없다.
 *
 * 동사 "모인다":
 *   쓰기 — 새 값 칩이 위에서 한 사본으로 떨어지고, 그 자리의 옛 칩은 줄어 사라진다.
 *   주고받기 — 두 사본의 칩이 선을 따라 서로를 향해 나선다. 도장이 작은 쪽 칩은 가운데서 줄어 사라지고,
 *              큰 쪽 칩은 끝까지 건너가 진 사본의 자리를 덮는다.
 * 오른쪽 칸은 지금 사본들에 있는 서로 다른 값과 그 값을 든 사본 수다 (알고리즘이 셈해 싣는다).
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { EventuallyAgreesScene, Held } from './scene.js';

const H = 340;
const NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 600;

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function lerp(a: Pt, b: Pt, u: number): Pt {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export const eventuallyAgreesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const SM = parseFloat(fontSizes.sm);
    const MD = parseFloat(fontSizes.md);

    // 자리 — 캔버스에서 역산한다
    const ringW = Math.round(W * 0.6);
    const nodeW = Math.min(140, Math.round(ringW * 0.34));
    const nodeH = 84;
    const chipW = Math.min(60, Math.round(nodeW * 0.44));
    const chipH = 30;
    const topY = 72;
    const panelX = ringW + 28;
    const panelW = W - panelX - 16;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 걸음 함수가 만지는 손잡이 — drawStatic 이 매번 새로 짓는다
    let chips = new Map<string, SVGGElement>();
    let overlay: SVGGElement | null = null;

    function centers(scene: EventuallyAgreesScene): Map<string, Pt> {
      const rows = Math.ceil(scene.order.length / 2);
      const bottom = H - 20 - nodeH / 2;
      const top = topY + nodeH / 2;
      const gapY = rows > 1 ? (bottom - top) / (rows - 1) : 0;
      const out = new Map<string, Pt>();
      scene.order.forEach((id, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        out.set(id, { x: r2(ringW * (col === 0 ? 0.25 : 0.75) + 10), y: r2(top + gapY * row) });
      });
      return out;
    }

    function colorOf(scene: EventuallyAgreesScene, stamp: number): string {
      const i = scene.stamps.indexOf(stamp);
      if (i < 0) throw new Error(`eventually-agrees stage: 도장 ${stamp} 의 판이 바탕에 없다`);
      const c = categorical(scene.stamps.length, 'vivid')[i];
      if (c === undefined) throw new Error(`eventually-agrees stage: 도장 ${stamp} 의 색이 없다`);
      return c;
    }

    function at(map: Map<string, Pt>, id: string): Pt {
      const p = map.get(id);
      if (!p) throw new Error(`eventually-agrees stage: 사본 ${id} 의 자리가 없다`);
      return p;
    }

    /** 값 칩 + 도장 — 원점이 사본 칸의 가운데. 옮겨지는 것은 이 묶음째다. */
    function chip(parent: Element, scene: EventuallyAgreesScene, h: Held, p: Pt): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${r2(p.x)},${r2(p.y)})` });
      el(g, 'rect', {
        x: r2(-chipW / 2 + 12),
        y: -chipH / 2 - 4,
        width: chipW,
        height: chipH,
        rx: 6,
        fill: colorOf(scene, h.stamp),
        stroke: colors.border,
        'stroke-width': 1,
      });
      const v = el(g, 'text', {
        x: 12,
        y: 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        fill: colors.stateInk,
      });
      v.textContent = String(h.value);
      const s = el(g, 'text', {
        x: 12,
        y: r2(chipH / 2 + 12),
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      s.textContent = t('label.stamp', 'stamp {s}', { s: h.stamp });
      return g;
    }

    function drawStatic(scene: EventuallyAgreesScene): void {
      svg.textContent = '';
      chips = new Map();
      const pos = centers(scene);
      const step = scene.step;
      const active = new Set<string>();
      if (step?.kind === 'write') active.add(step.at);
      if (step?.kind === 'gossip') {
        active.add(step.a);
        active.add(step.b);
      }

      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      // 캡션 두 줄 — 지금 일어나는 일
      const n = scene.order.length;
      let line1 = '';
      let line2 = '';
      if (step === null) {
        line1 = t('caption.start', 'Replicas: {n}. No leader — any replica takes a write.', { n });
      } else if (step.kind === 'write') {
        line1 = t('caption.write', 'A write lands on {at}.', { at: step.at });
        line2 = step.last
          ? t('detail.writeLast', '{key} = {value}, stamp {stamp} — no writes after this', {
              key: scene.key,
              value: step.value,
              stamp: step.stamp,
            })
          : t('detail.write', '{key} = {value}, stamp {stamp}', { key: scene.key, value: step.value, stamp: step.stamp });
      } else {
        line1 = t('caption.gossip', '{a} ↔ {b} exchange values. The larger stamp wins.', { a: step.a, b: step.b });
        line2 = step.settling
          ? t('detail.settle', 'Both now {key} = {value}, stamp {stamp} · holding it: {k} of {n}', {
              key: scene.key,
              value: step.value,
              stamp: step.stamp,
              k: step.holders,
              n,
            })
          : t('detail.gossip', 'Both now {key} = {value}, stamp {stamp}', {
              key: scene.key,
              value: step.value,
              stamp: step.stamp,
            });
      }
      const c1 = el(svg, 'text', {
        x: 16,
        y: 24,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: colors.text,
      });
      c1.textContent = line1;
      if (line2) {
        const c2 = el(svg, 'text', { x: 16, y: r2(24 + MD + 6), 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted });
        c2.textContent = line2;
      }

      // 주고받기 선 — 데이터에 나오는 짝
      for (const [a, b] of scene.pairs) {
        const pa = at(pos, a);
        const pb = at(pos, b);
        const on = step?.kind === 'gossip' && ((step.a === a && step.b === b) || (step.a === b && step.b === a));
        el(svg, 'line', {
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          stroke: on ? colors.accent : colors.border,
          'stroke-width': on ? 4 : 1.5,
          'stroke-dasharray': on ? '0' : '4 4',
        });
      }

      // 사본 칸
      for (const id of scene.order) {
        const p = at(pos, id);
        const h = scene.held[id];
        if (!h) throw new Error(`eventually-agrees stage: 사본 ${id} 의 값이 없다`);
        const on = active.has(id);
        el(svg, 'rect', {
          x: r2(p.x - nodeW / 2),
          y: r2(p.y - nodeH / 2),
          width: nodeW,
          height: nodeH,
          rx: 10,
          fill: colors.bg,
          stroke: on ? colors.accent : colors.border,
          'stroke-width': on ? 3 : 1.5,
        });
        const idText = el(svg, 'text', {
          x: r2(p.x - nodeW / 2 + 10),
          y: r2(p.y - nodeH / 2 + 16),
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        });
        idText.textContent = id;
        const keyText = el(svg, 'text', {
          x: r2(p.x - chipW / 2 - 6),
          y: r2(p.y + 2),
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.textMuted,
        });
        keyText.textContent = `${scene.key} =`;
        chips.set(id, chip(svg, scene, h, p));
      }

      // 서로 다른 값 칸
      const title = el(svg, 'text', { x: panelX, y: topY + 4, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted });
      title.textContent = t('label.distinct', 'Distinct values');
      if (scene.distinct !== null) {
        const count = el(svg, 'text', {
          x: panelX,
          y: r2(topY + 4 + SM + 26),
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          fill: colors.text,
        });
        count.textContent = String(scene.distinct.length);
        const rowTop = topY + SM + 58;
        const rowH = Math.min(40, (H - 20 - rowTop) / Math.max(1, scene.stamps.length));
        const dotR = 6;
        const dotsX = panelX + 56;
        const dotGap = Math.min(22, (panelW - 56 - dotR) / Math.max(1, n));
        scene.distinct.forEach((v, i) => {
          const y = rowTop + rowH * i;
          el(svg, 'rect', { x: panelX, y: r2(y - 13), width: 42, height: 26, rx: 5, fill: colorOf(scene, v.stamp), stroke: colors.border, 'stroke-width': 1 });
          const vt = el(svg, 'text', {
            x: panelX + 21,
            y: r2(y + 1),
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: colors.stateInk,
          });
          vt.textContent = String(v.value);
          for (let k = 0; k < n; k += 1) {
            const filled = k < v.holders;
            el(svg, 'circle', {
              cx: r2(dotsX + dotR + dotGap * k),
              cy: r2(y),
              r: dotR,
              fill: filled ? colorOf(scene, v.stamp) : colors.bg,
              stroke: filled ? colors.text : colors.border,
              'stroke-width': 1,
            });
          }
        });
      }

      overlay = el(svg, 'g', {});
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = () => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 한 시계로 흘린다 — u 는 0→1 */
    async function run(mine: number, frame: (u: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const u = Math.min(1, (Date.now() - start) / MOVE_MS);
        frame(u);
        if (u >= 1) return true;
        await wait(16);
      }
    }

    function place(g: SVGGElement, p: Pt, scale: number): void {
      g.setAttribute('transform', `translate(${r2(p.x)},${r2(p.y)}) scale(${r2(scale)})`);
    }

    async function animate(scene: EventuallyAgreesScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const layer = overlay;
      if (!layer) throw new Error('eventually-agrees stage: 덧그림 층이 없다');
      const pos = centers(scene);

      if (step.kind === 'write') {
        const target = chips.get(step.at);
        if (!target) throw new Error(`eventually-agrees stage: ${step.at} 의 칩이 없다`);
        const home = at(pos, step.at);
        const from: Pt = { x: home.x, y: home.y - nodeH * 0.9 };
        target.setAttribute('opacity', '0');
        const old = chip(layer, scene, step.was, home);
        const fresh = chip(layer, scene, { value: step.value, stamp: step.stamp }, from);
        await run(mine, (u) => {
          place(fresh, lerp(from, home, ease(u)), 1);
          place(old, home, 1 - ease(Math.max(0, (u - 0.55) / 0.45)));
        });
        return;
      }

      const target = chips.get(step.loser);
      if (!target) throw new Error(`eventually-agrees stage: ${step.loser} 의 칩이 없다`);
      const pw = at(pos, step.winner);
      const pl = at(pos, step.loser);
      const mid = lerp(pw, pl, 0.5);
      target.setAttribute('opacity', '0');
      const losing = chip(layer, scene, step.loserWas, pl);
      const crossing = chip(layer, scene, { value: step.value, stamp: step.stamp }, pw);
      await run(mine, (u) => {
        // 진 칩은 가운데로 나섰다가 거기서 줄어 사라진다
        place(losing, lerp(pl, mid, ease(u / 0.5)), 1 - ease((u - 0.4) / 0.2));
        // 이긴 칩은 끝까지 건너가 진 사본의 자리를 덮는다
        place(crossing, lerp(pw, pl, ease(u)), 1);
      });
    }

    return {
      async render(next: EventuallyAgreesScene, _prev: EventuallyAgreesScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animate(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
