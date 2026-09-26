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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { BothTouchedSameLineScene } from './scene.js';
import type { MergedFrom, Side } from './algorithm.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 여백 · 칸 사이 · 머리말 자리. 칸 폭과 줄 높이는 캔버스에서 역산한다. */
const MARGIN = 12;
const COL_GAP = 18;
const HEAD_Y = 20;
const TOP_ROWS_Y = 30;
const ROW_H_MAX = 22;
const RESULT_HEAD_GAP = 30;
const CAPTION_H = 34;

const SLIDE_MS = 650;
const RISE_MS = 750;
const FRAME_MS = 16;

type Col = 'ours' | 'base' | 'theirs';
const COLS: readonly Col[] = ['ours', 'base', 'theirs'];

type Layout = {
  colW: number;
  gutter: number;
  colX: Record<Col, number>;
  rowH: number;
  rowY(row: number): number;
  resultHeadY: number;
  resultRowH: number;
  resultY(k: number): number;
  captionY: number;
};

type Handles = {
  bands: Map<string, SVGRectElement>;
  outline: SVGRectElement | null;
  unequal: { g: SVGGElement; cx: number }[];
  resultLines: SVGGElement[];
};

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return n === 0 ? 0 : n;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function sideColor(side: Side): string {
  const pair = categorical(2, 'vivid');
  const c = side === 'ours' ? pair[0] : pair[1];
  if (c === undefined) throw new Error('categorical(2) 가 두 색을 주지 않았다');
  return c;
}

function layout(scene: BothTouchedSameLineScene): Layout {
  const W = PIECE_CANVAS_W;
  const colW = (W - 2 * MARGIN - 2 * COL_GAP) / 3;
  // 위 세 파일의 줄 높이는 파일만으로 정한다 — 결과가 서도 위가 흔들리지 않는다.
  const topRows = Math.max(scene.base.length, scene.ours.length, scene.theirs.length, 1);
  const captionY = H - 14;
  const rowH = Math.min(ROW_H_MAX, (H - TOP_ROWS_Y - CAPTION_H) / (2 * topRows + 1));
  const topEnd = TOP_ROWS_Y + topRows * rowH;
  const resultTop = topEnd + RESULT_HEAD_GAP;
  // 결과는 남은 세로에 담는다 — 줄이 많으면 줄 높이를 줄인다.
  const resultRows = Math.max(scene.result ? scene.result.lines.length : 0, 1);
  const resultRowH = Math.min(ROW_H_MAX, (captionY - 22 - resultTop) / resultRows);
  return {
    colW,
    gutter: 26,
    colX: {
      ours: MARGIN,
      base: MARGIN + colW + COL_GAP,
      theirs: MARGIN + 2 * (colW + COL_GAP),
    },
    rowH,
    rowY: (row) => TOP_ROWS_Y + row * rowH,
    resultHeadY: resultTop - 12,
    resultRowH,
    resultY: (k) => resultTop + k * resultRowH,
    captionY,
  };
}

export const bothTouchedSameLineStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opts.fill,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      if (opts.mono) {
        node.setAttribute('xml:space', 'preserve');
        node.setAttribute('style', 'white-space: pre');
      }
      node.textContent = content;
      return node;
    }

    const sideName = (col: Col): string =>
      col === 'ours'
        ? t('label.ours', 'ours')
        : col === 'theirs'
          ? t('label.theirs', 'theirs')
          : t('label.base', 'base');

    function linesText(rows: readonly number[]): string {
      return rows.map((r) => String(r + 1)).join(' · ');
    }

    function caption(scene: BothTouchedSameLineScene): string {
      if (scene.step === 'start') return t('caption.start', 'One base, two edited copies.');
      if (scene.step === 'ours') {
        const touch = scene.touched.ours;
        if (!touch) throw new Error('ours 걸음인데 장면에 ours 의 손댄 줄이 없다');
        return t('caption.ours', 'Base lines ours touched: {lines}', { lines: linesText(touch.base) });
      }
      if (scene.step === 'theirs') {
        const touch = scene.touched.theirs;
        if (!touch) throw new Error('theirs 걸음인데 장면에 theirs 의 손댄 줄이 없다');
        return t('caption.theirs', 'Base lines theirs touched: {lines}', { lines: linesText(touch.base) });
      }
      if (scene.step === 'overlap') {
        const o = scene.overlap;
        if (!o) throw new Error('overlap 걸음인데 장면에 겹침이 없다');
        return t('caption.overlap', 'Base lines touched by both: {lines} · different versions: {n}', {
          lines: linesText(o.lines),
          n: o.versions,
        });
      }
      const res = scene.result;
      if (!res) throw new Error('merged 걸음인데 장면에 결과가 없다');
      const open = res.lines.findIndex((l) => l.from === 'open');
      if (open < 0) throw new Error('merged 걸음인데 결과에 여는 충돌 표식(open)이 없다');
      return t('caption.merged', 'Result lines: {n} · conflicts: {c} · stopped at line {line}', {
        n: res.lines.length,
        c: res.conflicts,
        line: open + 1,
      });
    }

    /** 출처 칸 → 결과 줄이 떠나는 자리. */
    function sourceX(L: Layout, from: MergedFrom): number {
      if (from === 'ours') return L.colX.ours;
      if (from === 'theirs') return L.colX.theirs;
      return L.colX.base;
    }

    function drawStatic(scene: BothTouchedSameLineScene): Handles {
      svg.textContent = '';
      const L = layout(scene);
      const handles: Handles = { bands: new Map(), outline: null, unequal: [], resultLines: [] };
      const root = el('g', {}, svg);
      const bandLayer = el('g', {}, root);
      const textLayer = el('g', {}, root);
      const markLayer = el('g', {}, root);

      const files: Record<Col, string[]> = { ours: scene.ours, base: scene.base, theirs: scene.theirs };
      const cellH = L.rowH - 3;

      // 세 파일 — 칸 머리 · 줄 번호 · 줄
      for (const col of COLS) {
        const x = L.colX[col];
        label(textLayer, x + L.colW / 2, HEAD_Y, sideName(col), {
          size: fontSizes.sm,
          fill: col === 'base' ? c.text : c.textMuted,
          anchor: 'middle',
          weight: '600',
        });
        el('rect', { x, y: TOP_ROWS_Y - 2, width: L.colW, height: files[col].length * L.rowH + 2, rx: 4, fill: 'none', stroke: c.border }, bandLayer);
        files[col].forEach((line, row) => {
          const cy = L.rowY(row) + L.rowH / 2;
          label(textLayer, x + L.gutter - 8, cy, String(row + 1), { size: fontSizes.xs, fill: c.textMuted, anchor: 'end' });
          label(textLayer, x + L.gutter, cy, line, { size: fontSizes.sm, fill: c.text, mono: true });
        });
      }

      // 한 쪽이 제 파일에서 고친 줄 — 원본 자리에 남는 옅은 칠
      for (const side of ['ours', 'theirs'] as const) {
        const touch = scene.touched[side];
        if (!touch) continue;
        for (const row of touch.own) {
          el('rect', { x: L.colX[side] + 2, y: L.rowY(row) + 1, width: L.colW - 4, height: cellH, rx: 3, fill: sideColor(side), 'fill-opacity': 0.22 }, bandLayer);
        }
      }

      // 조상 줄 위로 건너온 표시 — ours 는 왼쪽 끝, theirs 는 오른쪽 끝에 손잡이를 단다
      for (const side of ['ours', 'theirs'] as const) {
        const touch = scene.touched[side];
        if (!touch) continue;
        for (const row of touch.base) {
          const band = el('rect', {
            x: L.colX.base + 2,
            y: L.rowY(row) + 1,
            width: L.colW - 4,
            height: cellH,
            rx: 3,
            fill: sideColor(side),
            'fill-opacity': 0.26,
          }, bandLayer);
          handles.bands.set(`${side}:${row}`, band);
          const tabX = side === 'ours' ? L.colX.base + 2 : L.colX.base + L.colW - 6;
          const tab = el('rect', { x: tabX, y: L.rowY(row) + 1, width: 4, height: cellH, rx: 2, fill: sideColor(side) }, bandLayer);
          handles.bands.set(`${side}:${row}:tab`, tab);
        }
      }

      // 겹친 줄 — 한 줄 전체를 가로지르는 테두리와 칸 사이의 "같지 않음"
      if (scene.overlap) {
        for (const row of scene.overlap.lines) {
          const y = L.rowY(row);
          handles.outline = el('rect', {
            x: L.colX.ours - 4,
            y: y - 1,
            width: L.colX.theirs + L.colW - L.colX.ours + 8,
            height: L.rowH + 1,
            rx: 4,
            fill: 'none',
            stroke: c.danger,
            'stroke-width': 2,
          }, markLayer);
          for (const gapX of [L.colX.ours + L.colW + COL_GAP / 2, L.colX.base + L.colW + COL_GAP / 2]) {
            const g = el('g', {}, markLayer);
            const cy = y + L.rowH / 2;
            el('line', { x1: gapX - 5, y1: cy - 2.5, x2: gapX + 5, y2: cy - 2.5, stroke: c.danger, 'stroke-width': 1.6 }, g);
            el('line', { x1: gapX - 5, y1: cy + 2.5, x2: gapX + 5, y2: cy + 2.5, stroke: c.danger, 'stroke-width': 1.6 }, g);
            el('line', { x1: gapX + 3, y1: cy - 6, x2: gapX - 3, y2: cy + 6, stroke: c.danger, 'stroke-width': 1.6 }, g);
            handles.unequal.push({ g, cx: gapX });
          }
        }
      }

      // 병합 결과 — 조상 칸 아래에 한 번에 선다
      if (scene.result) {
        const x = L.colX.base;
        label(textLayer, x + L.colW / 2, L.resultHeadY, t('label.result', 'merged'), {
          size: fontSizes.sm,
          fill: c.text,
          anchor: 'middle',
          weight: '600',
        });
        const lines = scene.result.lines;
        el('rect', { x, y: L.resultY(0) - 2, width: L.colW, height: lines.length * L.resultRowH + 2, rx: 4, fill: 'none', stroke: c.border }, bandLayer);
        lines.forEach((line, k) => {
          const cy = L.resultY(k) + L.resultRowH / 2;
          label(textLayer, x + L.gutter - 8, cy, String(k + 1), { size: fontSizes.xs, fill: c.textMuted, anchor: 'end' });
          const g = el('g', { transform: `translate(${r1(x)},${r1(L.resultY(k))})` }, markLayer);
          if (line.from === 'ours' || line.from === 'theirs') {
            el('rect', { x: 2, y: 1, width: L.colW - 4, height: L.resultRowH - 3, rx: 3, fill: sideColor(line.from), 'fill-opacity': 0.22 }, g);
          }
          const isMarker = line.from === 'open' || line.from === 'mid' || line.from === 'close';
          label(g, L.gutter, L.resultRowH / 2, line.text, {
            size: fontSizes.sm,
            fill: isMarker ? c.danger : c.text,
            mono: true,
            ...(isMarker ? { weight: '600' } : {}),
          });
          handles.resultLines.push(g);
        });
        // 멈춘 자리 — 표식 사이를 오른쪽에서 묶는다
        const open = lines.findIndex((l) => l.from === 'open');
        const close = lines.findIndex((l) => l.from === 'close');
        if (open < 0) throw new Error('결과에 여는 충돌 표식(open)이 없다');
        if (close <= open) throw new Error(`결과의 닫는 충돌 표식(close)이 여는 표식 뒤에 없다 — open ${open + 1}, close ${close + 1}`);
        {
          const bx = x + L.colW + 8;
          const y1 = L.resultY(open) + 3;
          const y2 = L.resultY(close + 1) - 3;
          el('path', { d: `M${r1(bx)},${r1(y1)} h6 V${r1(y2)} h-6`, fill: 'none', stroke: c.danger, 'stroke-width': 2 }, markLayer);
          label(markLayer, bx + 14, (y1 + y2) / 2, t('label.stopped', 'stopped'), {
            size: fontSizes.md,
            fill: c.danger,
            weight: '600',
          });
        }
      }

      label(root, PIECE_CANVAS_W / 2, L.captionY, caption(scene), { size: fontSizes.md, fill: c.text, anchor: 'middle' });
      return handles;
    }

    function run(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
        let i = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          i += 1;
          frame(ease(Math.min(1, i / frames)));
          if (i >= frames) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function animate(next: BothTouchedSameLineScene, h: Handles, mine: number): Promise<void> {
      const L = layout(next);
      if (next.step === 'ours' || next.step === 'theirs') {
        // 제 칸에서 조상 칸으로 가로질러 건너온다
        const side: Side = next.step;
        const touch = next.touched[side];
        if (!touch) throw new Error(`${side} 걸음인데 장면에 손댄 줄이 없다`);
        const rows = touch.base;
        const dx = L.colX[side] - L.colX.base;
        const moving = rows.flatMap((row) => [`${side}:${row}`, `${side}:${row}:tab`]).map((key) => {
          const m = h.bands.get(key);
          if (!m) throw new Error(`건너올 띠가 없다: ${key}`);
          return m;
        });
        await run(SLIDE_MS, mine, (k) => {
          const off = r1(dx * (1 - k));
          for (const m of moving) m.setAttribute('transform', `translate(${off},0)`);
        });
        return;
      }
      if (next.step === 'overlap') {
        // 테두리가 조상 칸에서 줄 전체로 벌어진다
        const o = h.outline;
        if (!o) throw new Error('overlap 걸음인데 겹친 줄의 테두리가 없다');
        const fullX = L.colX.ours - 4;
        const fullW = L.colX.theirs + L.colW - L.colX.ours + 8;
        const fromX = L.colX.base;
        const fromW = L.colW;
        for (const u of h.unequal) u.g.setAttribute('transform', `translate(${r1(u.cx)},0) scale(0,1)`);
        await run(SLIDE_MS, mine, (k) => {
          o.setAttribute('x', String(r1(fromX + (fullX - fromX) * k)));
          o.setAttribute('width', String(r1(fromW + (fullW - fromW) * k)));
          const s = Math.round(k * 100) / 100;
          for (const u of h.unequal) u.g.setAttribute('transform', `translate(${r1(u.cx * (1 - s))},0) scale(${s},1)`);
        });
        return;
      }
      if (next.step === 'merged' && next.result) {
        // 줄마다 제 출처 칸의 자리에서 결과 자리로 내려온다. 표식은 제자리에서 벌어진다.
        const lines = next.result.lines;
        const starts = lines.map((line) => {
          if (line.row < 0) return null;
          return { x: sourceX(L, line.from), y: L.rowY(line.row) };
        });
        const endX = L.colX.base;
        await run(RISE_MS, mine, (k) => {
          lines.forEach((_, i) => {
            const g = h.resultLines[i];
            if (!g) throw new Error(`결과 줄 ${i + 1} 의 핸들이 없다`);
            const endY = L.resultY(i);
            const s = starts[i];
            if (s) {
              const x = r1(s.x + (endX - s.x) * k);
              const y = r1(s.y + (endY - s.y) * k);
              g.setAttribute('transform', `translate(${x},${y})`);
            } else {
              g.setAttribute('transform', `translate(${r1(endX)},${r1(endY)}) scale(${Math.round(k * 100) / 100},1)`);
            }
          });
        });
      }
    }

    return {
      async render(next: BothTouchedSameLineScene, prev: BothTouchedSameLineScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || prev.step === next.step) return;
        await animate(next, h, mine);
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
