/**
 * evict-least-frequent 무대 — "세고, 밀려난다".
 *
 * 위: 온 차례대로의 요청 줄. 가운데: 캐시의 자리들 — 자리마다 키의 횟수만큼 칸이 쌓인다.
 * 오른쪽: 밀려난 키가 차례대로 모이는 곳.
 *
 * 운동
 *   - 적중: 요청 칩이 내려와 그 키의 더미 위에 한 칸으로 얹힌다 (횟수가 하나 는다)
 *   - 들어옴: 요청 칩이 빈 자리 바닥에 첫 칸으로 내려앉는다
 *   - 밀려남: 버릴 키가 자리에서 오른쪽 모음으로 밀려 나간 뒤, 요청 칩이 그 자리에 첫 칸으로 내려앉는다
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { EvictLeastFrequentScene } from './scene.js';

const H = 352;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;

// 요청 줄
const STRIP_TOP = 22;
const STRIP_H = 28;
const STRIP_GAP = 6;
const STRIP_CHIP_MAX = 72;

// 캐시와 모음
const FRAME_TOP = 66;
const FRAME_BOTTOM = 294;
const STACK_TOP = 108;
const FLOOR = 234;
const UNIT_MAX = 34;
const COL_MAX = 120;
const COL_GAP = 18;
const TRAY_W = 132;
const TRAY_GAP = 24;
const TRAY_ITEM_H = 28;
const TRAY_ITEM_MAX_STEP = 38;

// 캡션
const CAPTION_Y = 322;
const CAPTION2_Y = 342;

// 운동
const DROP_MS = 460;
const PUSH_MS = 240;
const LAND_MS = 240;
const FRAME_MS = 16;

type Layout = {
  chipW: number;
  chipX: (i: number) => number;
  colW: number;
  colX: (slot: number) => number;
  unitW: number;
  unitH: number;
  cacheX0: number;
  cacheX1: number;
  trayX: number;
  trayStep: number;
};

function layoutOf(scene: EvictLeastFrequentScene): Layout {
  const W = PIECE_CANVAS_W;
  const n = scene.requests.length;
  const chipW = Math.min(STRIP_CHIP_MAX, (W - 2 * PAD - (n - 1) * STRIP_GAP) / n);
  const stripW = n * chipW + (n - 1) * STRIP_GAP;
  const stripX0 = (W - stripW) / 2;

  const trayX = W - PAD - TRAY_W;
  const cacheX0 = PAD;
  const cacheX1 = trayX - TRAY_GAP;
  const inner = cacheX1 - cacheX0 - 24;
  const c = scene.capacity;
  const colW = Math.min(COL_MAX, (inner - (c - 1) * COL_GAP) / c);
  const colsW = c * colW + (c - 1) * COL_GAP;
  const colX0 = cacheX0 + (cacheX1 - cacheX0 - colsW) / 2;

  const maxCount = Math.max(1, ...scene.slots.map((s) => (s === null ? 0 : s.count)));
  const unitH = Math.min(UNIT_MAX, (FLOOR - STACK_TOP) / maxCount);

  const trayRoom = FRAME_BOTTOM - 8 - (FRAME_TOP + 34);
  const trayStep = Math.min(TRAY_ITEM_MAX_STEP, trayRoom / Math.max(1, scene.evicted.length));

  return {
    chipW,
    chipX: (i) => stripX0 + i * (chipW + STRIP_GAP),
    colW,
    colX: (slot) => colX0 + slot * (colW + COL_GAP),
    unitW: Math.max(24, colW - 30),
    unitH,
    cacheX0,
    cacheX1,
    trayX,
    trayStep,
  };
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function addText(
  parent: Element,
  x: number,
  y: number,
  body: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = body;
  return node;
}

/** 경로 글자가 칸 폭을 넘지 않게 글자 크기를 줄인다 (고정폭 글꼴의 한 글자 ≈ 0.62em). */
function monoSize(body: string, room: number): number {
  const base = parseFloat(fontSizes.sm);
  const fit = room / Math.max(1, body.length * 0.62);
  return Math.min(base, fit);
}

type Handles = {
  /** 이번 걸음에 얹히거나 내려앉는 칸 */
  landing: SVGGElement | null;
  /** 밀려남 걸음에서 새 키가 선 자리의 내용 전체 */
  enteredSlot: SVGGElement | null;
  /** 이번 걸음에 모음에 들어간 칩 */
  pushed: SVGGElement | null;
};

export const evictLeastFrequentStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: EvictLeastFrequentScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const step = scene.step;
      const handles: Handles = { landing: null, enteredSlot: null, pushed: null };

      // ── 요청 줄
      scene.requests.forEach((path, i) => {
        const index = i + 1;
        const x = L.chipX(i);
        const current = step.kind !== 'start' && index === scene.served;
        const past = index < scene.served;
        addText(svg, x + L.chipW / 2, STRIP_TOP - 6, String(index), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        el(svg, 'rect', {
          x,
          y: STRIP_TOP,
          width: L.chipW,
          height: STRIP_H,
          rx: 5,
          fill: current ? c.accent : c.bg,
          stroke: current ? c.accent : past ? c.border : c.text,
          'stroke-width': current ? 1.5 : 1,
        });
        addText(svg, x + L.chipW / 2, STRIP_TOP + STRIP_H / 2 + 4, path, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': `${r1(monoSize(path, L.chipW - 6))}px`,
          fill: current ? c.stateInk : past ? c.textMuted : c.text,
        });
      });

      // ── 캐시 틀
      el(svg, 'rect', {
        x: L.cacheX0,
        y: FRAME_TOP,
        width: L.cacheX1 - L.cacheX0,
        height: FRAME_BOTTOM - FRAME_TOP,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      addText(svg, L.cacheX0 + 12, FRAME_TOP + 20, t('label.cache', 'Cache'), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: c.text,
      });
      el(svg, 'line', {
        x1: L.cacheX0 + 12,
        x2: L.cacheX1 - 12,
        y1: FLOOR,
        y2: FLOOR,
        stroke: c.text,
        'stroke-width': 1.5,
      });

      const tieKeys = new Set(
        step.kind === 'evict' ? step.ties.map((x) => x.key).filter((k) => k !== step.victim.key) : [],
      );

      scene.slots.forEach((s, slot) => {
        const g = el(svg, 'g', {});
        const cx = L.colX(slot) + L.colW / 2;
        const ux = cx - L.unitW / 2;
        if (s === null) {
          el(g, 'rect', {
            x: ux,
            y: FLOOR - L.unitH,
            width: L.unitW,
            height: L.unitH,
            rx: 4,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '4 3',
          });
          addText(g, cx, FLOOR + 20, t('label.empty', 'empty'), {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          });
          return;
        }
        const here = step.kind !== 'start' && step.slot === slot;
        const tied = tieKeys.has(s.key);
        for (let u = 0; u < s.count; u += 1) {
          const top = u === s.count - 1;
          const landing = here && top;
          const ug = el(g, 'g', {});
          el(ug, 'rect', {
            x: ux,
            y: FLOOR - (u + 1) * L.unitH + 1,
            width: L.unitW,
            height: L.unitH - 2,
            rx: 4,
            fill: landing ? c.accent : c.bg,
            stroke: tied ? c.itemComparing : landing ? c.accent : c.text,
            'stroke-width': tied ? 2.5 : 1,
          });
          if (landing) handles.landing = ug;
        }
        addText(g, cx, FLOOR - s.count * L.unitH - 8, String(s.count), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: tied ? c.itemComparing : c.text,
        });
        addText(g, cx, FLOOR + 20, s.key, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': `${r1(monoSize(s.key, L.colW))}px`,
          'font-weight': here ? 700 : 400,
          fill: c.text,
        });
        addText(g, cx, FLOOR + 38, t('label.lastUsed', 'last used: #{n}', { n: s.lastUsed }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': tied ? 700 : 400,
          fill: tied ? c.itemComparing : c.textMuted,
        });
        if (step.kind === 'evict' && step.slot === slot) handles.enteredSlot = g;
      });

      // ── 밀려난 것의 모음
      addText(svg, L.trayX, FRAME_TOP + 20, t('label.evicted', 'Evicted'), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: c.text,
      });
      scene.evicted.forEach((e, i) => {
        const latest = step.kind === 'evict' && i === scene.evicted.length - 1;
        const y = FRAME_TOP + 34 + i * L.trayStep;
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x: L.trayX,
          y,
          width: TRAY_W,
          height: TRAY_ITEM_H,
          rx: 5,
          fill: c.bg,
          stroke: latest ? c.danger : c.textMuted,
          'stroke-width': latest ? 2 : 1,
        });
        addText(g, L.trayX + 8, y + TRAY_ITEM_H / 2 + 4, e.key, {
          'font-family': fonts.mono,
          'font-size': `${r1(monoSize(e.key, TRAY_W * 0.5))}px`,
          fill: c.text,
        });
        addText(g, L.trayX + TRAY_W - 8, y + TRAY_ITEM_H / 2 + 4, t('label.hadCount', 'count: {n}', { n: e.count }), {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        if (latest) handles.pushed = g;
      });

      // ── 캡션
      const cap = (body: string, y: number, strong: boolean): void => {
        addText(svg, PIECE_CANVAS_W / 2, y, body, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': strong ? fontSizes.md : fontSizes.sm,
          'font-weight': strong ? 600 : 400,
          fill: strong ? c.text : c.textMuted,
        });
      };
      switch (step.kind) {
        case 'start':
          cap(t('caption.start', 'Cache is empty · capacity: {n}', { n: scene.capacity }), CAPTION_Y, true);
          break;
        case 'hit': {
          const s = scene.slots[step.slot];
          if (!s) throw new Error('evict-least-frequent 무대: 적중한 자리가 비었다');
          cap(t('caption.hit', 'Hit: {key} · count: {count}', { key: step.key, count: s.count }), CAPTION_Y, true);
          break;
        }
        case 'admit': {
          const s = scene.slots[step.slot];
          if (!s) throw new Error('evict-least-frequent 무대: 들어온 자리가 비었다');
          cap(t('caption.admit', 'Miss: {key} · enters with count: {count}', { key: step.key, count: s.count }), CAPTION_Y, true);
          break;
        }
        case 'evict':
          cap(t('caption.evict', 'Miss: {key} · evicted: {victim}', { key: step.key, victim: step.victim.key }), CAPTION_Y, true);
          if (step.ties.length > 1) {
            cap(
              t('caption.tie', 'Tied at lowest count: {count} · oldest last use: #{n}', {
                count: step.least,
                n: step.victim.lastUsed,
              }),
              CAPTION2_Y,
              false,
            );
          } else {
            cap(t('caption.least', 'Lowest count: {count} · held by one key', { count: step.least }), CAPTION2_Y, false);
          }
          break;
      }
      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
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

    /** 한 시계로 0→1 을 흘린다. 세대가 바뀌거나 거두어지면 멈춘다. */
    async function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return false;
        const p = f / frames;
        frame(1 - (1 - p) * (1 - p));
      }
      return true;
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`evict-least-frequent 무대: 운동할 ${what} 가 없다`);
      return v;
    }

    /** 요청 칩 자리에서 칸의 끝 자리까지 — 아직 못 온 만큼을 transform 으로 준다. */
    function dropOffset(scene: EvictLeastFrequentScene, slot: number, count: number): { dx: number; dy: number } {
      const L = layoutOf(scene);
      const fromX = L.chipX(scene.served - 1) + L.chipW / 2;
      const fromY = STRIP_TOP + STRIP_H / 2;
      const toX = L.colX(slot) + L.colW / 2;
      const toY = FLOOR - (count - 0.5) * L.unitH;
      return { dx: fromX - toX, dy: fromY - toY };
    }

    async function animate(scene: EvictLeastFrequentScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind === 'start') return;
      const s = scene.slots[step.slot];
      if (!s) throw new Error('evict-least-frequent 무대: 이번 걸음의 자리가 비었다');
      const landing = need(h.landing, '칸');
      const drop = dropOffset(scene, step.slot, s.count);
      const place = (node: SVGGElement, dx: number, dy: number, k: number): void => {
        node.setAttribute('transform', `translate(${r1(dx * (1 - k))} ${r1(dy * (1 - k))})`);
      };

      if (step.kind === 'evict') {
        const pushed = need(h.pushed, '밀려난 칩');
        const entered = need(h.enteredSlot, '새 자리');
        const L = layoutOf(scene);
        const i = scene.evicted.length - 1;
        const fromX = L.colX(step.slot) + L.colW / 2 - TRAY_W / 2;
        const fromY = FLOOR - TRAY_ITEM_H;
        const toY = FRAME_TOP + 34 + i * L.trayStep;
        const px = fromX - L.trayX;
        const py = fromY - toY;
        entered.setAttribute('visibility', 'hidden');
        place(pushed, px, py, 0);
        if (!(await tween(mine, PUSH_MS, (k) => place(pushed, px, py, k)))) return;
        entered.removeAttribute('visibility');
        place(landing, drop.dx, drop.dy, 0);
        await tween(mine, LAND_MS, (k) => place(landing, drop.dx, drop.dy, k));
        return;
      }
      place(landing, drop.dx, drop.dy, 0);
      await tween(mine, DROP_MS, (k) => place(landing, drop.dx, drop.dy, k));
    }

    return {
      async render(
        next: EvictLeastFrequentScene,
        prev: EvictLeastFrequentScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        await animate(next, handles, mine);
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
