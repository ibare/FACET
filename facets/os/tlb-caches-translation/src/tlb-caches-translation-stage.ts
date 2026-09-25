/**
 * tlb-caches-translation 의 stage — 표에서 찾아낸 번역 한 줄이 곁(TLB)으로 옮겨 적히고,
 * 같은 페이지의 주소가 다시 오면 표까지 가지 않고 곁에서 돌아온다.
 *
 * 자리: 가상 주소 · TLB · 페이지 표를 왼쪽에서 오른쪽으로 둔다. TLB 는 주소 가까이, 표는 멀리 —
 * 표를 찾아가는 걸음은 먼 길을 가고, 적중하는 걸음은 짧은 길에서 돌아온다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { TlbCachesTranslationScene, TlbStep } from './scene.js';

const H = 344;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 500;
const FRAME_MS = 16;

/** 번역이 온 곳 두 갈래 — 표 · TLB */
const [TABLE_INK, TLB_INK] = categorical(2, 'vivid');

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
const LG = parseFloat(fontSizes.lg);

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

function hexDigit(n: number): string {
  return n.toString(16).toUpperCase();
}
function hexOffset(n: number): string {
  return n.toString(16).toUpperCase().padStart(3, '0');
}
function hexAddress(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** 자리 — 캔버스 폭에서 역산한다 */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geometry {
  pad: number;
  chip: (i: number, n: number) => Box;
  markY: number;
  titleY: number;
  headY: number;
  left: number;
  leftW: number;
  vPage: Box;
  vOffset: Box;
  pPage: Box;
  pOffset: Box;
  vTitleY: number;
  pTitleY: number;
  tlbX: number;
  tableX: number;
  colW: number;
  rowTop: number;
  rowStep: number;
  rowH: number;
  countY: number;
  captionY: number;
}

function geometry(W: number): Geometry {
  const pad = 16;
  const colW = Math.min(172, (W - 2 * pad) / 3.4);
  const tableX = W - pad - colW;
  const leftW = colW;
  const tlbX = pad + leftW + (tableX - (pad + leftW) - colW) * 0.35;
  const prefixW = MD * 1.6;
  const pageW = Math.min(40, leftW * 0.24);
  const vPage = { x: pad + prefixW, y: 102, w: pageW, h: 34 };
  const vOffset = { x: vPage.x + pageW + 6, y: 102, w: leftW - prefixW - pageW - 6, h: 34 };
  const pPage = { ...vPage, y: 218 };
  const pOffset = { ...vOffset, y: 218 };
  return {
    pad,
    chip: (i, n) => {
      const gap = 6;
      const w = (W - 2 * pad - gap * (n - 1)) / n;
      return { x: pad + i * (w + gap), y: 10, w, h: 26 };
    },
    markY: 50,
    titleY: 76,
    headY: 93,
    left: pad,
    leftW,
    vPage,
    vOffset,
    pPage,
    pOffset,
    vTitleY: 76,
    pTitleY: 204,
    tlbX,
    tableX,
    colW,
    rowTop: 102,
    rowStep: 28,
    rowH: 24,
    countY: 296,
    captionY: 328,
  };
}

function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** 표 · TLB 한 줄의 두 칸 (페이지 · 프레임) 가운데 */
function rowCells(x: number, w: number, y: number, h: number): { page: { x: number; y: number }; frame: { x: number; y: number } } {
  return {
    page: { x: x + w * 0.25, y: y + h / 2 },
    frame: { x: x + w * 0.75, y: y + h / 2 },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 0..1 을 [a, b] 구간의 0..1 로 */
function phase(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return ease((t - a) / (b - a));
}

interface Refs {
  /** 이번 걸음이 도착한 곳 — 운동이 닿기 전엔 숨긴다 */
  arrival: SVGElement[];
  /** 이번 걸음에 새로 적힌 TLB 칸의 글자 */
  slotText: SVGElement[];
  /** 실제 주소 글자 */
  physical: SVGElement[];
}

export const tlbCachesTranslationStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const g = geometry(W);
    if (TABLE_INK === undefined || TLB_INK === undefined) throw new Error('tlb-caches-translation stage: 두 갈래 색이 없다');
    const tableInk: string = TABLE_INK;
    const tlbInk: string = TLB_INK;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element = svg, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, text: string, size: number, fill: string, anchor = 'middle', family: string = fonts.body, weight = 'normal', parent: Element = svg): SVGElement {
      return el(
        'text',
        {
          x,
          y,
          'font-family': family,
          'font-size': size,
          'font-weight': weight,
          fill,
          'text-anchor': anchor,
          'dominant-baseline': 'middle',
        },
        parent,
        text,
      );
    }

    /**
     * 표를 찾아가는 길 — TLB 문 앞까지는 적중과 같은 길, 거기서 TLB 아래로 돌아 먼 표의 줄에 닿는다
     */
    function walkRoute(fromY: number, rowY: number, slots: number): Array<{ x: number; y: number }> {
      const laneY = g.rowTop + slots * g.rowStep + 8;
      const door = g.tlbX - 14;
      return [
        { x: g.vOffset.x + g.vOffset.w, y: fromY },
        { x: door, y: fromY },
        { x: door, y: laneY },
        { x: g.tableX - 18, y: laneY },
        { x: g.tableX, y: rowY },
      ];
    }

    function stepColor(step: TlbStep): string {
      if (step.kind === 'hit') return tlbInk;
      return tableInk;
    }

    function drawStatic(scene: TlbCachesTranslationScene): Refs {
      svg.textContent = '';
      const refs: Refs = { arrival: [], slotText: [], physical: [] };
      const step = scene.step;
      const current = step.kind === 'start' ? -1 : step.index;

      // 기다리는 주소와 번역이 온 곳
      const n = scene.addresses.length;
      scene.addresses.forEach((address, i) => {
        const b = g.chip(i, n);
        const isCurrent = i === current;
        el('rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 4,
          fill: isCurrent ? colors.bgSubtle : colors.bg,
          stroke: isCurrent ? colors.accent : colors.border,
          'stroke-width': isCurrent ? 2 : 1,
        });
        label(b.x + b.w / 2, b.y + b.h / 2, hexAddress(address), SM, colors.text, 'middle', fonts.mono);
        const result = scene.results[i];
        if (result) {
          const fromTable = result.source === 'table';
          const mark = label(
            b.x + b.w / 2,
            g.markY,
            fromTable ? t('mark.table', 'table') : t('mark.tlb', 'TLB'),
            XS,
            fromTable ? tableInk : tlbInk,
            'middle',
            fonts.body,
            'bold',
          );
          if (i === current) refs.arrival.push(mark);
        }
      });

      // 가상 주소
      label(g.left, g.vTitleY, t('label.virtual', 'Virtual address'), SM, colors.textMuted, 'start');
      const vActive = step.kind !== 'start';
      for (const b of [g.vPage, g.vOffset]) {
        el('rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: b === g.vPage && vActive ? stepColor(step) : colors.border,
          'stroke-width': b === g.vPage && vActive ? 2 : 1,
        });
      }
      label(g.left, center(g.vPage).y, '0x', LG, colors.textMuted, 'start', fonts.mono);
      if (step.kind !== 'start') {
        label(center(g.vPage).x, center(g.vPage).y, hexDigit(step.page), LG, colors.text, 'middle', fonts.mono, 'bold');
        label(center(g.vOffset).x, center(g.vOffset).y, hexOffset(step.offset), LG, colors.text, 'middle', fonts.mono);
      }

      // 실제 주소
      label(g.left, g.pTitleY, t('label.physical', 'Physical address'), SM, colors.textMuted, 'start');
      for (const b of [g.pPage, g.pOffset]) {
        el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 4, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 });
      }
      label(g.left, center(g.pPage).y, '0x', LG, colors.textMuted, 'start', fonts.mono);
      label(center(g.pPage).x, g.pPage.y + g.pPage.h + 14, t('label.frame', 'frame'), XS, colors.textMuted);
      label(center(g.vPage).x, g.vPage.y + g.vPage.h + 14, t('label.page', 'page'), XS, colors.textMuted);
      label(center(g.vOffset).x, g.vOffset.y + g.vOffset.h + 14, t('label.offset', 'offset'), XS, colors.textMuted);
      label(center(g.pOffset).x, g.pOffset.y + g.pOffset.h + 14, t('label.offset', 'offset'), XS, colors.textMuted);
      if (step.kind === 'fill' || step.kind === 'hit') {
        const text = hexAddress(step.physical);
        // 오프셋은 위에서 아래로 곧장 내려온다
        const line = el('line', {
          x1: center(g.vOffset).x,
          y1: g.vOffset.y + g.vOffset.h,
          x2: center(g.pOffset).x,
          y2: g.pOffset.y,
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        });
        refs.arrival.push(line);
        refs.physical.push(
          label(center(g.pPage).x, center(g.pPage).y, text.slice(2, 3), LG, stepColor(step), 'middle', fonts.mono, 'bold'),
          label(center(g.pOffset).x, center(g.pOffset).y, text.slice(3), LG, colors.text, 'middle', fonts.mono),
        );
      }

      // TLB
      label(g.tlbX, g.titleY, t('label.tlb', 'TLB'), SM, colors.textMuted, 'start', fonts.body, 'bold');
      label(g.tlbX, g.headY, t('label.row', 'page → frame'), XS, colors.textMuted, 'start');
      for (let s = 0; s < scene.tlbSlots; s += 1) {
        const y = g.rowTop + s * g.rowStep;
        const row = scene.tlb[s];
        const isStepSlot = (step.kind === 'fill' || step.kind === 'hit') && step.slot === s;
        const rect = el('rect', {
          x: g.tlbX,
          y,
          width: g.colW,
          height: g.rowH,
          rx: 3,
          fill: row ? colors.bgSubtle : colors.bg,
          stroke: isStepSlot ? stepColor(step) : colors.border,
          'stroke-width': isStepSlot ? 2 : 1,
          ...(row ? {} : { 'stroke-dasharray': '4 3' }),
        });
        if (isStepSlot) refs.arrival.push(rect);
        if (row) {
          const cells = rowCells(g.tlbX, g.colW, y, g.rowH);
          const texts = [
            label(cells.page.x, cells.page.y, hexDigit(row.page), MD, colors.text, 'middle', fonts.mono, 'bold'),
            label(g.tlbX + g.colW / 2, cells.page.y, '→', SM, colors.textMuted),
            label(cells.frame.x, cells.frame.y, hexDigit(row.frame), MD, colors.text, 'middle', fonts.mono, 'bold'),
          ];
          if (step.kind === 'fill' && step.slot === s) refs.slotText.push(...texts);
        }
      }
      label(g.tlbX, g.countY, t('count.hits', 'TLB hits: {n}', { n: scene.hits }), SM, tlbInk, 'start', fonts.body, 'bold');

      // 페이지 표
      label(g.tableX, g.titleY, t('label.table', 'Page table'), SM, colors.textMuted, 'start', fonts.body, 'bold');
      label(g.tableX, g.headY, t('label.row', 'page → frame'), XS, colors.textMuted, 'start');
      scene.pageTable.forEach((row, r) => {
        const y = g.rowTop + r * g.rowStep;
        const isStepRow = (step.kind === 'walk' || step.kind === 'fill') && step.page === row.page;
        const rect = el('rect', {
          x: g.tableX,
          y,
          width: g.colW,
          height: g.rowH,
          rx: 3,
          fill: colors.bg,
          stroke: isStepRow ? tableInk : colors.border,
          'stroke-width': isStepRow ? 2 : 1,
        });
        if (isStepRow && step.kind === 'walk') refs.arrival.push(rect);
        const cells = rowCells(g.tableX, g.colW, y, g.rowH);
        label(cells.page.x, cells.page.y, hexDigit(row.page), MD, colors.text, 'middle', fonts.mono);
        label(g.tableX + g.colW / 2, cells.page.y, '→', SM, colors.textMuted);
        label(cells.frame.x, cells.frame.y, hexDigit(row.frame), MD, colors.text, 'middle', fonts.mono);
      });
      label(g.tableX, g.countY, t('count.walks', 'Table walks: {n}', { n: scene.walks }), SM, tableInk, 'start', fonts.body, 'bold');

      // 이번 걸음이 간 길
      if (step.kind === 'walk') {
        const r = scene.pageTable.findIndex((row) => row.page === step.page);
        if (r < 0) throw new Error(`tlb-caches-translation stage: 페이지 ${step.page} 가 표에 없다`);
        const from = center(g.vPage);
        const rowY = g.rowTop + r * g.rowStep + g.rowH / 2;
        const path = el('polyline', {
          points: walkRoute(from.y, rowY, scene.tlbSlots)
            .map((pt) => `${num(pt.x)},${num(pt.y)}`)
            .join(' '),
          fill: 'none',
          stroke: tableInk,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        });
        refs.arrival.push(path);
      }
      if (step.kind === 'hit') {
        const from = center(g.vPage);
        const slotY = g.rowTop + step.slot * g.rowStep + g.rowH / 2;
        const path = el('polyline', {
          points: [
            `${num(g.vOffset.x + g.vOffset.w)},${num(from.y)}`,
            `${num(g.tlbX - 14)},${num(from.y)}`,
            `${num(g.tlbX)},${num(slotY)}`,
          ].join(' '),
          fill: 'none',
          stroke: tlbInk,
          'stroke-width': 1.5,
        });
        refs.arrival.push(path);
      }

      // 지금 일어나는 일
      label(W / 2, g.captionY, caption(scene), MD, colors.text);
      return refs;
    }

    function caption(scene: TlbCachesTranslationScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Accesses waiting: {n}. The TLB is empty.', { n: scene.addresses.length });
      }
      if (step.kind === 'walk') {
        return t('caption.walk', 'Page {page} is not in the TLB. Walk the page table: {page} → {frame}.', {
          page: hexDigit(step.page),
          frame: hexDigit(step.frame),
        });
      }
      if (step.kind === 'fill') {
        return t('caption.fill', 'Line written to the TLB: {page} → {frame}. Physical address {physical}.', {
          page: hexDigit(step.page),
          frame: hexDigit(step.frame),
          physical: hexAddress(step.physical),
        });
      }
      const row = scene.tlb[step.slot];
      const by = row ? scene.addresses[row.by] : undefined;
      if (by === undefined) throw new Error(`tlb-caches-translation stage: TLB 칸 ${step.slot} 을 적은 접근이 없다`);
      return t('caption.hit', 'TLB hit on page {page}, the line written for {by}. Physical address {physical}.', {
        page: hexDigit(step.page),
        by: hexAddress(by),
        physical: hexAddress(step.physical),
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
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

    /** 한 시계로 MOVE_MS 동안 draw(0..1) 를 부른다 */
    async function tween(mine: number, draw: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      draw(0);
      for (;;) {
        if (destroyed || mine !== gen) return false;
        await wait(FRAME_MS);
        if (destroyed || mine !== gen) return false;
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        draw(p);
        if (p >= 1) return true;
      }
    }

    function ghost(text: string, size: number, fill: string): SVGElement {
      return label(0, 0, text, size, fill, 'middle', fonts.mono, 'bold');
    }

    function place(node: SVGElement, a: { x: number; y: number }, b: { x: number; y: number }, p: number): void {
      node.setAttribute('x', num(lerp(a.x, b.x, p)));
      node.setAttribute('y', num(lerp(a.y, b.y, p)));
    }

    /** 꺾인 길을 따라 — 점 여럿을 길이 비례로 */
    function along(node: SVGElement, points: Array<{ x: number; y: number }>, p: number): void {
      const lens: number[] = [];
      let total = 0;
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        lens.push(len);
        total += len;
      }
      let d = p * total;
      for (let i = 1; i < points.length; i += 1) {
        const len = lens[i - 1]!;
        if (d <= len || i === points.length - 1) {
          place(node, points[i - 1]!, points[i]!, len === 0 ? 1 : Math.min(1, d / len));
          return;
        }
        d -= len;
      }
    }

    function hide(nodes: SVGElement[], hidden: boolean): void {
      for (const node of nodes) {
        if (hidden) node.setAttribute('opacity', '0');
        else node.removeAttribute('opacity');
      }
    }

    async function animate(scene: TlbCachesTranslationScene, refs: Refs, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind === 'start') return;
      const vp = center(g.vPage);
      const vo = center(g.vOffset);
      const pp = center(g.pPage);
      const po = center(g.pOffset);

      if (step.kind === 'walk') {
        // 페이지 번호가 TLB 를 지나쳐 멀리 표까지 간다
        const r = scene.pageTable.findIndex((row) => row.page === step.page);
        if (r < 0) throw new Error(`tlb-caches-translation stage: 페이지 ${step.page} 가 표에 없다`);
        const target = rowCells(g.tableX, g.colW, g.rowTop + r * g.rowStep, g.rowH).page;
        const route = [vp, ...walkRoute(vp.y, target.y, scene.tlbSlots).slice(1, -1), target];
        hide(refs.arrival, true);
        const token = ghost(hexDigit(step.page), LG, tableInk);
        await tween(mine, (p) => along(token, route, ease(p)));
        return;
      }

      if (step.kind === 'fill') {
        // 표의 줄 한 벌이 곁(TLB)으로 옮겨 적히고, 프레임 번호가 실제 주소로 내려간다
        const r = scene.pageTable.findIndex((row) => row.page === step.page);
        if (r < 0) throw new Error(`tlb-caches-translation stage: 페이지 ${step.page} 가 표에 없다`);
        const src = rowCells(g.tableX, g.colW, g.rowTop + r * g.rowStep, g.rowH);
        const dst = rowCells(g.tlbX, g.colW, g.rowTop + step.slot * g.rowStep, g.rowH);
        hide(refs.arrival, true);
        hide(refs.slotText, true);
        hide(refs.physical, true);
        const copyPage = ghost(hexDigit(step.page), MD, tableInk);
        const copyFrame = ghost(hexDigit(step.frame), MD, tableInk);
        const down = ghost(hexDigit(step.frame), LG, tableInk);
        const offset = ghost(hexOffset(step.offset), LG, colors.text);
        hide([down, offset], true);
        await tween(mine, (p) => {
          const a = phase(p, 0, 0.55);
          place(copyPage, src.page, dst.page, a);
          place(copyFrame, src.frame, dst.frame, a);
          if (p >= 0.55) {
            hide([copyPage, copyFrame], true);
            hide(refs.slotText, false);
            hide(refs.arrival, false);
            hide([down, offset], false);
          }
          const b = phase(p, 0.55, 1);
          place(down, dst.frame, pp, b);
          place(offset, vo, po, b);
        });
        return;
      }

      // 적중 — 짧은 길로 곁에 닿고, 그 줄의 프레임 번호가 돌아온다
      const dst = rowCells(g.tlbX, g.colW, g.rowTop + step.slot * g.rowStep, g.rowH);
      hide(refs.arrival, true);
      hide(refs.physical, true);
      const token = ghost(hexDigit(step.page), LG, tlbInk);
      const back = ghost(hexDigit(step.frame), LG, tlbInk);
      const offset = ghost(hexOffset(step.offset), LG, colors.text);
      hide([back, offset], true);
      const route = [vp, { x: g.tlbX - 14, y: vp.y }, dst.page];
      await tween(mine, (p) => {
        along(token, route, phase(p, 0, 0.45));
        if (p >= 0.45) {
          hide([token], true);
          hide(refs.arrival, false);
          hide([back, offset], false);
        }
        const b = phase(p, 0.45, 1);
        place(back, dst.frame, pp, b);
        place(offset, vo, po, b);
      });
    }

    return {
      async render(
        next: TlbCachesTranslationScene,
        prev: TlbCachesTranslationScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const refs = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        await animate(next, refs, mine);
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
