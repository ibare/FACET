/**
 * 참조 타입 stage — 자리 안의 주소가 갈아 꽂힌다.
 *
 * 위: 프로그램 (밟은 줄을 밝힌다). 아래 왼쪽: 이름의 자리 — 크기가 늘 같고 주소 칩 하나만
 * 든다. 아래 오른쪽: 자리 밖 — 목록이 놓인 차례대로 제 줄에 놓이고 그대로 남는다.
 *
 * 운동 (한 시계): 새 자리면 자리가 먼저 선다 → 목록 칸이 자리 밖 제 줄로 내려앉는다 →
 * 그 목록의 주소표에서 주소 칩이 떨어져 나와 자리로 건너가 꽂히고, 앞 칩은 자리에서 밀려
 * 내려가 사라진다. 목록은 따라가 읽지 않는다 — 칩과 주소표는 글자와 색으로만 짝지어진다.
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
} from '@ffacet/core/runtime';
import type {
  PlacedList,
  ReferenceHoldsAddressScene,
  SceneSlot,
} from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 걸음 운동의 마디 (ms). 한 시계로 흘린다. */
const SLOT_END = 260;
const DROP_START = 120;
const DROP_END = 520;
const HOP_START = 480;
const HOP_END = 980;
const TOTAL = HOP_END;
const FRAME_MS = 16;

const MARGIN = 20;
const CAPTION_ZONE = 50;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  const x = clamp01(v);
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

/** 주소 표기 — 수와 가르려고 `@` 를 붙인다 (코드 표기라 번역하지 않는다). */
function addrText(n: number): string {
  return '@' + String(n);
}

/** 글자 폭 어림 — 한글 · 한자 · 가나는 한 칸, 나머지는 반 칸 남짓. */
function roughWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c > 0x2e80 ? px : px * 0.58;
  }
  return w;
}

type Built = {
  slots: Map<string, { g: SVGGElement; chip: SVGGElement; chipW: number; cx: number; cy: number }>;
  lists: Map<number, { cells: SVGGElement[]; tag: SVGGElement; tagCx: number; tagCy: number }>;
};

function isScene(v: unknown): v is ReferenceHoldsAddressScene {
  return typeof v === 'object' && v !== null && Array.isArray((v as { lines?: unknown }).lines);
}

export const referenceHoldsAddressStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const codePx = parseFloat(fontSizes.md);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      s: string,
      x: number,
      y: number,
      opts: { px: number; fill: string; mono?: boolean; anchor?: string; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          fill: opts.fill,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.px,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = s;
      return node;
    }

    /** 칸 폭이 넘치면 글꼴을 줄여 담는다. */
    function fitPx(s: string, px: number, room: number): number {
      const w = roughWidth(s, px);
      return w <= room ? px : Math.max(9, Math.floor((px * room) / w));
    }

    function geometry(scene: ReferenceHoldsAddressScene) {
      const n = Math.max(scene.lines.length, 1);
      const lineH = Math.min(22, 88 / n);
      const codeTop = 14;
      const codeBottom = codeTop + n * lineH;
      const areaTop = codeBottom + 30;
      const areaBottom = H - CAPTION_ZONE - 6;
      const splitX = Math.round(W * 0.36);
      const slotW = Math.min(150, splitX - 2 * MARGIN - 16);
      const slotH = 44;
      const slotX = (splitX - slotW) / 2;
      const rx0 = splitX + 24;
      const rx1 = W - MARGIN;
      const rows = Math.max(scene.listCount, scene.lists.length, 1);
      const rowGap = Math.min(58, (areaBottom - areaTop) / rows);
      const cellH = Math.min(30, rowGap - 12);
      // 칸 폭은 바탕의 가장 긴 목록에서 — 걸음마다 칸 폭이 바뀌지 않게.
      let widest = Math.max(scene.widest, 1);
      for (const l of scene.lists) widest = Math.max(widest, l.items.length);
      const tagW = roughWidth('@0000', smPx) + 18;
      const cellW = Math.min(46, (rx1 - rx0 - tagW - 10) / widest);
      return { lineH, codeTop, codeBottom, areaTop, areaBottom, splitX, slotW, slotH, slotX, rx0, rx1, rowGap, cellH, tagW, cellW };
    }

    function drawCode(scene: ReferenceHoldsAddressScene, g: ReturnType<typeof geometry>): void {
      const cur = scene.step?.kind === 'place' ? scene.step.line : -1;
      const indentW = roughWidth('    ', codePx);
      scene.lines.forEach((line, i) => {
        const cy = g.codeTop + (i + 0.5) * g.lineH;
        if (i === cur) {
          el('rect', { x: MARGIN - 6, y: r2(cy - g.lineH / 2 + 1), width: W - 2 * MARGIN + 12, height: r2(g.lineH - 2), rx: 3, fill: pal.bgSubtle, stroke: pal.border }, svg);
          el('rect', { x: MARGIN - 6, y: r2(cy - g.lineH / 2 + 1), width: 3, height: r2(g.lineH - 2), fill: pal.accent }, svg);
        }
        text(svg, line.text, MARGIN + 6 + line.indent * indentW, cy, {
          px: codePx,
          mono: true,
          fill: i === cur ? pal.text : pal.textMuted,
          weight: i === cur ? 600 : undefined,
        });
      });
      el('line', { x1: MARGIN, y1: r2(g.codeBottom + 12), x2: W - MARGIN, y2: r2(g.codeBottom + 12), stroke: pal.border }, svg);
    }

    function chipAt(parent: Element, label: string, cx: number, cy: number, w: number, h: number): SVGGElement {
      const chip = el('g', {}, parent);
      el('rect', { x: r2(cx - w / 2), y: r2(cy - h / 2), width: r2(w), height: r2(h), rx: 5, fill: pal.accent, stroke: pal.stateInk, 'stroke-width': 1 }, chip);
      text(chip, label, cx, cy, { px: smPx, mono: true, fill: pal.stateInk, anchor: 'middle', weight: 600 });
      return chip;
    }

    function drawSlots(slots: SceneSlot[], g: ReturnType<typeof geometry>, built: Built): void {
      const span = g.areaBottom - g.areaTop;
      const each = span / Math.max(slots.length, 1);
      slots.forEach((s, i) => {
        const cy = g.areaTop + (i + 0.5) * each;
        const cx = g.slotX + g.slotW / 2;
        const grp = el('g', {}, svg);
        text(grp, s.name, g.slotX, cy - g.slotH / 2 - 12, { px: codePx, mono: true, fill: pal.text, weight: 600 });
        el('rect', { x: r2(g.slotX), y: r2(cy - g.slotH / 2), width: r2(g.slotW), height: g.slotH, rx: 4, fill: pal.bg, stroke: pal.text, 'stroke-width': 1.5 }, grp);
        text(grp, t('label.slot', 'slot {addr}', { addr: addrText(s.addr) }), g.slotX, cy + g.slotH / 2 + 12, { px: xsPx, fill: pal.textMuted });
        const chipW = g.slotW - 28;
        const chip = chipAt(svg, addrText(s.holds), cx, cy, chipW, 26);
        built.slots.set(s.name, { g: grp, chip, chipW, cx, cy });
      });
    }

    function drawLists(scene: ReferenceHoldsAddressScene, g: ReturnType<typeof geometry>, built: Built): void {
      text(svg, t('label.outside', 'outside the slot'), g.rx0, g.areaTop - 12, { px: xsPx, fill: pal.textMuted });
      const held = new Set(scene.slots.map((s) => s.holds));
      scene.lists.forEach((l: PlacedList, i) => {
        const cy = g.areaTop + 4 + (i + 0.5) * g.rowGap;
        const on = held.has(l.addr);
        const tag = el('g', {}, svg);
        el('rect', {
          x: r2(g.rx0),
          y: r2(cy - g.cellH / 2),
          width: r2(g.tagW),
          height: r2(g.cellH),
          rx: 4,
          fill: on ? pal.accent : pal.bgSubtle,
          stroke: on ? pal.stateInk : pal.border,
        }, tag);
        text(tag, addrText(l.addr), g.rx0 + g.tagW / 2, cy, { px: smPx, mono: true, anchor: 'middle', fill: on ? pal.stateInk : pal.textMuted, weight: on ? 600 : undefined });
        const cells: SVGGElement[] = [];
        const x0 = g.rx0 + g.tagW + 10;
        l.items.forEach((v, k) => {
          const cg = el('g', {}, svg);
          const x = x0 + k * g.cellW;
          el('rect', { x: r2(x), y: r2(cy - g.cellH / 2), width: r2(g.cellW), height: r2(g.cellH), fill: pal.bg, stroke: on ? pal.text : pal.border, 'stroke-width': on ? 1.5 : 1 }, cg);
          const s = String(v);
          text(cg, s, x + g.cellW / 2, cy, { px: fitPx(s, codePx, g.cellW - 6), mono: true, anchor: 'middle', fill: on ? pal.text : pal.textMuted });
          cells.push(cg);
        });
        built.lists.set(l.addr, { cells, tag, tagCx: g.rx0 + g.tagW / 2, tagCy: cy });
      });
    }

    function drawCaption(scene: ReferenceHoldsAddressScene): void {
      const step = scene.step;
      if (!step) return;
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(t('caption.start', 'Nothing has run yet.'));
      } else {
        const list = addrText(step.list);
        lines.push(t('caption.placed', 'A new list of {count} items is placed at {list}, outside the slot.', { count: step.count, list }));
        if (step.was === null) {
          lines.push(t('caption.declared', 'The new slot of {name} holds only the address {list}.', { name: step.name, list }));
        } else {
          lines.push(t('caption.swapped', 'Slot of {name}: {was} → {list}. The list at {was} stays as it was.', { name: step.name, was: addrText(step.was), list }));
        }
      }
      const room = W - 2 * MARGIN;
      lines.forEach((s, i) => {
        text(svg, s, MARGIN, H - CAPTION_ZONE + 10 + i * 22, { px: fitPx(s, codePx, room), fill: pal.text });
      });
    }

    function drawStatic(scene: ReferenceHoldsAddressScene): Built {
      svg.textContent = '';
      const built: Built = { slots: new Map(), lists: new Map() };
      if (scene.lines.length === 0) return built;
      const g = geometry(scene);
      drawCode(scene, g);
      el('line', { x1: g.splitX, y1: r2(g.areaTop - 20), x2: g.splitX, y2: r2(g.areaBottom + 4), stroke: pal.border, 'stroke-dasharray': '4 4' }, svg);
      drawLists(scene, g, built);
      drawSlots(scene.slots, g, built);
      drawCaption(scene);
      return built;
    }

    function tween(ms: number, frame: (elapsed: number) => void, mine: number): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return wake();
          const e = Math.min(ms, Date.now() - start);
          frame(e);
          if (e >= ms) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: ReferenceHoldsAddressScene,
      _prev: ReferenceHoldsAddressScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const built = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step?.kind !== 'place') return;
      const slot = built.slots.get(step.name);
      const list = built.lists.get(step.list);
      if (!slot || !list) return;

      const chip = slot.chip;
      const hopDx = list.tagCx - slot.cx;
      const hopDy = list.tagCy - slot.cy;
      const newSlot = step.was === null;
      // 밀려나는 앞 칩 — 정적 그림에는 없다. 운동이 끝나면 drawStatic 이 치운다.
      const old = step.was === null ? null : chipAt(svg, addrText(step.was), slot.cx, slot.cy, slot.chipW, 26);
      if (old) svg.insertBefore(old, chip);

      const cx = slot.cx;
      const cy = slot.cy;
      const frame = (ms: number): void => {
        if (newSlot) {
          const s = ease(ms / SLOT_END);
          slot.g.setAttribute('opacity', String(r2(s)));
          slot.g.setAttribute('transform', `translate(${r2(cx)} ${r2(cy)}) scale(${r2(0.6 + 0.4 * s)}) translate(${r2(-cx)} ${r2(-cy)})`);
        }
        list.cells.forEach((c, k) => {
          const d = ease((ms - DROP_START - k * 40) / (DROP_END - DROP_START - 160));
          c.setAttribute('opacity', String(r2(d)));
          c.setAttribute('transform', `translate(0 ${r2(-22 * (1 - d))})`);
        });
        const tg = ease((ms - DROP_START) / (DROP_END - DROP_START));
        list.tag.setAttribute('opacity', String(r2(tg)));
        const hop = ease((ms - HOP_START) / (HOP_END - HOP_START));
        chip.setAttribute('opacity', ms < HOP_START ? '0' : '1');
        chip.setAttribute('transform', `translate(${r2(hopDx * (1 - hop))} ${r2(hopDy * (1 - hop))})`);
        if (old) {
          const out = ease((ms - HOP_START) / ((HOP_END - HOP_START) * 0.7));
          old.setAttribute('opacity', String(r2(1 - out)));
          old.setAttribute('transform', `translate(${r2(-18 * out)} ${r2(34 * out)})`);
        }
      };
      frame(0);
      await tween(TOTAL, frame, mine);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render(next: unknown, prev: unknown, opts: { animate: boolean }): Promise<void> {
        if (!isScene(next)) return Promise.resolve();
        return render(next, isScene(prev) ? prev : null, opts);
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
