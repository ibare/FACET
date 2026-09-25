/**
 * 문맥 전환 비용의 무대.
 *
 * 움직이는 것은 캐시의 덩이와 쌓이는 시각이다.
 *   - 없는 것 읽기: 제 덩이가 메모리에서 느리게 올라와 캐시 끝으로 들어서며 줄을 민다.
 *     먼저 든 남의 덩이가 캐시 밖으로 밀려 떨어진다.
 *   - 있는 것 읽기: 그 덩이가 CPU 쪽으로 잠깐 들린다.
 *   - 바꿈: CPU 의 이름이 갈린다. 캐시는 그대로다.
 *   - 시간 띠는 걸음의 틱만큼 자란다. 그중 일이 아닌 몫은 아래 띠로 떨어져 따로 쌓인다.
 *
 * 운동의 길이는 그 걸음의 틱에 비례한다 — 10 틱 읽기는 1 틱 읽기보다 눈에 띄게 길다.
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
import type { SwitchCostsScene, SwitchCostsSegKind } from './scene.js';

const H = 350;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 20;
const CAPTION_Y = 24;
const FRAME_Y = 62;
const SLOT_H = 48;
const MEM_Y = 190;
const MEM_H = 30;
const ROW1_Y = 252;
const ROW2_Y = 288;
const ROW_H = 18;
const LEGEND_Y = 336;

/** 한 틱이 운동에 쓰는 ms, 운동의 바닥 ms, 떨어지는 몫의 ms */
const TICK_MS = 45;
const BASE_MS = 150;
const DROP_MS = 300;

const KIND_ORDER: readonly SwitchCostsSegKind[] = ['work', 'switch', 'cold'];

const r = (v: number): number => Math.round(v * 10) / 10 || 0;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  s: string,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
  family: string = fonts.body,
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r(x),
    y: r(y),
    fill,
    'font-size': size,
    'font-family': family,
    'text-anchor': anchor,
  });
  node.textContent = s;
  return node;
}

type Geo = {
  slotW: number;
  gap: number;
  frameX: number;
  frameW: number;
  cpuX: number;
  cpuW: number;
  barX: number;
  barW: number;
};

function geometry(capacity: number): Geo {
  const W = PIECE_CANVAS_W;
  const gap = 14;
  const cpuW = Math.min(150, W * 0.22);
  const cpuX = W - PAD - cpuW;
  // 캐시 틀 왼쪽에는 밀려난 덩이가 빠져나갈 자리를 한 칸만큼 둔다
  const room = cpuX - 40 - PAD;
  const slotW = Math.min(110, (room - 24 - gap * capacity) / (capacity + 1));
  const frameW = capacity * slotW + (capacity - 1) * gap + 24;
  const frameX = cpuX - 40 - frameW;
  const barX = PAD + 160;
  return { slotW, gap, frameX, frameW, cpuX, cpuW, barX, barW: W - PAD - barX };
}

function slotX(g: Geo, i: number): number {
  return g.frameX + 12 + i * (g.slotW + g.gap);
}

const SLOT_Y = FRAME_Y + 14;

export const switchCostsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const procName = (id: string): string => {
      if (id === 'a') return t('label.a', 'A');
      if (id === 'b') return t('label.b', 'B');
      return id;
    };

    const kindName = (k: SwitchCostsSegKind, n: number): string => {
      if (k === 'work') return t('label.work', 'Work: {n}', { n });
      if (k === 'switch') return t('label.switch', 'Switching: {n}', { n });
      return t('label.cold', 'Cold cache: {n}', { n });
    };

    function palette(s: SwitchCostsScene): { owner: Map<string, string>; kind: Record<SwitchCostsSegKind, string> } {
      const hues = categorical(s.procs.length + KIND_ORDER.length, 'vivid');
      const owner = new Map<string, string>();
      s.procs.forEach((p, i) => owner.set(p, hues[i] ?? colors.text));
      const base = s.procs.length;
      return {
        owner,
        kind: {
          work: hues[base] ?? colors.textMuted,
          switch: hues[base + 1] ?? colors.textMuted,
          cold: hues[base + 2] ?? colors.textMuted,
        },
      };
    }

    function caption(s: SwitchCostsScene): string {
      const st = s.step;
      if (st.kind === 'start') {
        return t('caption.start', 'Running: {proc}. In the cache: {blocks}.', {
          proc: procName(s.running),
          blocks: s.cache.join(' · '),
        });
      }
      if (st.kind === 'switch') {
        return t('caption.switch', 'Switch {from} → {to}. +{cost} · In the cache: {blocks}', {
          from: procName(st.from),
          to: procName(st.to),
          cost: st.cost,
          blocks: s.cache.join(' · '),
        });
      }
      if (st.hit) {
        return t('caption.hit', '{proc} reads {block}: in the cache. +{cost}', {
          proc: procName(st.proc),
          block: st.block,
          cost: st.cost,
        });
      }
      if (st.gone !== null) {
        return t('caption.miss', '{proc} reads {block}: not in the cache, fetched from memory. Pushed out: {gone}. +{cost}', {
          proc: procName(st.proc),
          block: st.block,
          gone: st.gone,
          cost: st.cost,
        });
      }
      return t('caption.missFree', '{proc} reads {block}: not in the cache, fetched from memory. +{cost}', {
        proc: procName(st.proc),
        block: st.block,
        cost: st.cost,
      });
    }

    function drawBlock(parent: Element, id: string, fill: string, g: Geo, x: number, y: number, h: number): SVGGElement {
      const grp = el(parent, 'g', { transform: `translate(${r(x)} ${r(y)})` });
      el(grp, 'rect', { x: 0, y: 0, width: r(g.slotW), height: h, rx: 6, fill: colors.bgSubtle, stroke: fill, 'stroke-width': 2 });
      el(grp, 'rect', { x: 0, y: 0, width: 8, height: h, rx: 3, fill });
      label(grp, g.slotW / 2 + 4, h / 2 + 5, id, fontSizes.md, colors.text, 'middle', fonts.mono);
      return grp;
    }

    type Handles = {
      g: Geo;
      blocks: Map<string, SVGGElement>;
      memX: Map<string, number>;
      cpuName: SVGTextElement;
      cpuMid: number;
      cpuY: number;
      layer: SVGGElement;
      ownerColor: Map<string, string>;
      readLine: SVGLineElement | null;
      fresh: { node: SVGRectElement; width: number; ticks: number }[];
      drop: { node: SVGRectElement; dx: number; dy: number } | null;
    };

    function drawStatic(s: SwitchCostsScene): Handles {
      svg.textContent = '';
      const g = geometry(s.capacity);
      const pal = palette(s);
      const W = PIECE_CANVAS_W;

      label(svg, PAD, CAPTION_Y, caption(s), fontSizes.md, colors.text);

      // 캐시 틀
      label(svg, g.frameX, FRAME_Y - 6, t('label.cache', 'Cache'), fontSizes.sm, colors.textMuted);
      el(svg, 'rect', {
        x: r(g.frameX), y: FRAME_Y, width: r(g.frameW), height: SLOT_H + 28, rx: 8,
        fill: 'none', stroke: colors.border, 'stroke-width': 1.5,
      });
      for (let i = 0; i < s.capacity; i += 1) {
        el(svg, 'rect', {
          x: r(slotX(g, i)), y: SLOT_Y, width: r(g.slotW), height: SLOT_H, rx: 6,
          fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 4',
        });
      }

      // 메모리 — 덩이 전부가 늘 있다
      const memCount = s.blocks.length;
      const memSpan = g.frameW + 40;
      const memGap = 10;
      const chipW = memCount > 0 ? Math.min(g.slotW, (memSpan - memGap * (memCount - 1)) / memCount) : 0;
      const memX0 = g.frameX + g.frameW / 2 - (memCount * chipW + (memCount - 1) * memGap) / 2;
      label(svg, memX0, MEM_Y - 8, t('label.memory', 'Memory'), fontSizes.sm, colors.textMuted);
      const memX = new Map<string, number>();
      s.blocks.forEach((b, i) => {
        const x = memX0 + i * (chipW + memGap);
        memX.set(b.id, x + chipW / 2);
        const fill = pal.owner.get(b.owner) ?? colors.border;
        el(svg, 'rect', { x: r(x), y: MEM_Y, width: r(chipW), height: MEM_H, rx: 5, fill: colors.bg, stroke: fill, 'stroke-width': 1.5 });
        label(svg, x + chipW / 2, MEM_Y + MEM_H / 2 + 4, b.id, fontSizes.sm, colors.textMuted, 'middle', fonts.mono);
      });

      // 읽기 선은 덩이 뒤로 지나간다
      const back = el(svg, 'g', {});
      // 캐시 안의 덩이 — 먼저 든 것이 왼쪽
      const layer = el(svg, 'g', {});
      const ownerOf = new Map(s.blocks.map((b) => [b.id, b.owner]));
      const blocks = new Map<string, SVGGElement>();
      s.cache.forEach((id, i) => {
        const owner = ownerOf.get(id);
        const fill = owner === undefined ? colors.border : (pal.owner.get(owner) ?? colors.border);
        blocks.set(id, drawBlock(layer, id, fill, g, slotX(g, i), SLOT_Y, SLOT_H));
      });

      // CPU
      const cpuY = FRAME_Y;
      const cpuH = SLOT_H + 28;
      const runFill = pal.owner.get(s.running) ?? colors.border;
      label(svg, g.cpuX, FRAME_Y - 6, t('label.cpu', 'CPU'), fontSizes.sm, colors.textMuted);
      el(svg, 'rect', { x: r(g.cpuX), y: cpuY, width: r(g.cpuW), height: cpuH, rx: 8, fill: colors.bgSubtle, stroke: runFill, 'stroke-width': 2.5 });
      const cpuMid = g.cpuX + g.cpuW / 2;
      const cpuName = label(svg, cpuMid, cpuY + cpuH / 2 + 8, procName(s.running), fontSizes.xl, runFill, 'middle');
      cpuName.setAttribute('font-weight', '700');

      // 이번 읽기 — CPU 에서 그 덩이로 닿는 선과 테두리 강조
      let readLine: SVGLineElement | null = null;
      if (s.step.kind === 'read') {
        const idx = s.cache.indexOf(s.step.block);
        if (idx >= 0) {
          const bx = slotX(g, idx) + g.slotW;
          readLine = el(back, 'line', {
            x1: r(g.cpuX), y1: r(cpuY + cpuH / 2), x2: r(bx), y2: r(SLOT_Y + SLOT_H / 2),
            stroke: colors.accent, 'stroke-width': 2, 'stroke-dasharray': '5 4',
          });
          const target = blocks.get(s.step.block);
          if (target !== undefined) {
            el(target, 'rect', {
              x: -3, y: -3, width: r(g.slotW + 6), height: SLOT_H + 6, rx: 8,
              fill: 'none', stroke: colors.accent, 'stroke-width': 2.5,
            });
          }
        }
      }

      // 시간 띠 둘 — 위는 시각 전체, 아래는 일이 아닌 몫만
      const lost = s.switching + s.cold;
      label(svg, PAD, ROW1_Y + ROW_H - 4, t('label.clock', 'Clock: {n}', { n: s.clock }), fontSizes.sm, colors.text);
      label(svg, PAD, ROW2_Y + ROW_H - 4, t('label.lost', 'Not work: {n} / {total}', { n: lost, total: s.clock }), fontSizes.sm, colors.text);
      el(svg, 'line', { x1: r(g.barX), y1: ROW1_Y - 4, x2: r(g.barX), y2: ROW2_Y + ROW_H + 4, stroke: colors.border });
      const scale = s.span > 0 ? g.barW / s.span : 0;
      let x1 = g.barX;
      let x2 = g.barX;
      const fresh: Handles['fresh'] = [];
      let drop: Handles['drop'] = null;
      const firstFresh = s.segs.length - s.fresh;
      s.segs.forEach((seg, i) => {
        const w = seg.ticks * scale;
        const node = el(svg, 'rect', {
          x: r(x1), y: ROW1_Y, width: r(w), height: ROW_H,
          fill: pal.kind[seg.kind], stroke: colors.bg, 'stroke-width': 1,
        });
        if (i >= firstFresh) fresh.push({ node, width: w, ticks: seg.ticks });
        if (seg.kind !== 'work') {
          const low = el(svg, 'rect', {
            x: r(x2), y: ROW2_Y, width: r(w), height: ROW_H,
            fill: pal.kind[seg.kind], stroke: colors.bg, 'stroke-width': 1,
          });
          if (i >= firstFresh) drop = { node: low, dx: x1 - x2, dy: ROW1_Y - ROW2_Y };
          x2 += w;
        }
        x1 += w;
      });

      // 범례 — 셋의 누적
      const sums: Record<SwitchCostsSegKind, number> = { work: s.work, switch: s.switching, cold: s.cold };
      const colW = (W - PAD - g.barX) / KIND_ORDER.length;
      KIND_ORDER.forEach((k, i) => {
        const lx = g.barX + i * colW;
        el(svg, 'rect', { x: r(lx), y: LEGEND_Y - 10, width: 12, height: 12, rx: 2, fill: pal.kind[k] });
        label(svg, lx + 18, LEGEND_Y, kindName(k, sums[k]), fontSizes.sm, colors.text);
      });

      return { g, blocks, memX, cpuName, cpuMid, cpuY, layer, ownerColor: pal.owner, readLine, fresh, drop };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
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
          const p = ms <= 0 ? 1 : clamp01((Date.now() - start) / ms);
          frame(p);
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

    /** 시간 띠의 새 조각을 틱 차례로 자라게 한다 (p 는 0..1) */
    function growFresh(h: Handles, p: number): void {
      const total = h.fresh.reduce((a, f) => a + f.ticks, 0);
      let before = 0;
      for (const f of h.fresh) {
        const lo = total > 0 ? before / total : 0;
        const hi = total > 0 ? (before + f.ticks) / total : 1;
        const q = hi > lo ? clamp01((p - lo) / (hi - lo)) : 1;
        f.node.setAttribute('width', String(r(f.width * q)));
        before += f.ticks;
      }
    }

    function placeDrop(h: Handles, q: number): void {
      if (h.drop === null) return;
      const e = ease(q);
      h.drop.node.setAttribute('transform', `translate(${r(h.drop.dx * (1 - e))} ${r(h.drop.dy * (1 - e))})`);
    }

    async function animate(s: SwitchCostsScene, h: Handles, mine: number): Promise<void> {
      const st = s.step;
      if (st.kind === 'start') return;
      const ms = BASE_MS + TICK_MS * st.cost;
      const g = h.g;

      // 아래 띠로 떨어질 몫은 위 띠가 다 자랄 때까지 숨겨 둔다
      if (h.drop !== null) h.drop.node.setAttribute('visibility', 'hidden');
      growFresh(h, 0);

      let frame: (p: number) => void;
      if (st.kind === 'switch') {
        const old = label(svg, h.cpuMid, Number(h.cpuName.getAttribute('y')), procName(st.from), fontSizes.xl,
          h.ownerColor.get(st.from) ?? colors.text, 'middle');
        old.setAttribute('font-weight', '700');
        frame = (p) => {
          const e = ease(p);
          old.setAttribute('transform', `translate(0 ${r(-24 * e)})`);
          old.setAttribute('opacity', String(r(1 - e)));
          h.cpuName.setAttribute('transform', `translate(0 ${r(24 * (1 - e))})`);
          h.cpuName.setAttribute('opacity', String(r(e)));
          growFresh(h, p);
        };
      } else if (st.hit) {
        const node = h.blocks.get(st.block);
        const idx = s.cache.indexOf(st.block);
        frame = (p) => {
          if (node !== undefined && idx >= 0) {
            const lift = Math.sin(Math.PI * p);
            node.setAttribute('transform', `translate(${r(slotX(g, idx) + 10 * lift)} ${r(SLOT_Y - 8 * lift)})`);
          }
          growFresh(h, p);
        };
      } else {
        // 없는 것 읽기: 올라오기(앞 55%) → 줄 밀기(뒤 45%)
        const entryX = slotX(g, s.capacity);
        const memCenter = h.memX.get(st.block);
        const fromX = memCenter === undefined ? entryX : memCenter - g.slotW / 2;
        const moves: { node: SVGGElement; from: number; to: number }[] = [];
        s.cache.forEach((id, i) => {
          const node = h.blocks.get(id);
          if (node === undefined || id === st.block) return;
          const was = st.before.indexOf(id);
          moves.push({ node, from: was >= 0 ? slotX(g, was) : slotX(g, i), to: slotX(g, i) });
        });
        const incoming = h.blocks.get(st.block);
        const incomingTo = slotX(g, s.cache.indexOf(st.block));
        const incomingEntry = s.cache.length < st.before.length + 1 ? entryX : incomingTo;
        let ghost: SVGGElement | null = null;
        if (st.gone !== null) {
          const goneId = st.gone;
          const wasAt = st.before.indexOf(goneId);
          const owner = s.blocks.find((b) => b.id === goneId)?.owner;
          const fill = owner === undefined ? colors.border : (h.ownerColor.get(owner) ?? colors.border);
          ghost = drawBlock(h.layer, goneId, fill, g, slotX(g, wasAt < 0 ? 0 : wasAt), SLOT_Y, SLOT_H);
        }
        const ghostFrom = st.gone === null ? 0 : slotX(g, Math.max(0, st.before.indexOf(st.gone)));
        if (h.readLine !== null) h.readLine.setAttribute('visibility', 'hidden');
        frame = (p) => {
          const rise = ease(clamp01(p / 0.55));
          const push = ease(clamp01((p - 0.55) / 0.45));
          if (incoming !== undefined) {
            const x = p < 0.55 ? fromX + (incomingEntry - fromX) * rise : incomingEntry + (incomingTo - incomingEntry) * push;
            const y = p < 0.55 ? MEM_Y + (SLOT_Y - MEM_Y) * rise : SLOT_Y;
            incoming.setAttribute('transform', `translate(${r(x)} ${r(y)})`);
          }
          for (const m of moves) {
            m.node.setAttribute('transform', `translate(${r(m.from + (m.to - m.from) * push)} ${SLOT_Y})`);
          }
          if (ghost !== null) {
            const gx = ghostFrom - (g.slotW + g.gap) * push;
            const gy = SLOT_Y + 70 * push * push;
            ghost.setAttribute('transform', `translate(${r(gx)} ${r(gy)})`);
            ghost.setAttribute('opacity', String(r(1 - push)));
          }
          growFresh(h, p);
        };
      }

      frame(0);
      if (!(await tween(ms, mine, frame))) return;
      if (h.drop === null) return;
      h.drop.node.removeAttribute('visibility');
      placeDrop(h, 0);
      await tween(DROP_MS, mine, (q) => placeDrop(h, q));
    }

    return {
      async render(next: SwitchCostsScene, _prev: SwitchCostsScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || next.step.kind === 'start') return;
        await animate(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
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
