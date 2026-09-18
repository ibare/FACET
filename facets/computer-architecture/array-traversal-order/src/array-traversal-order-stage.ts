/**
 * array-traversal-order-stage — 걸음 커서 · 캐시 줄 · 행 수별 미스 비율.
 *
 * 세 자리가 한 캔버스에 선다.
 *   배열     행 우선으로 저장된 R×8 칸. 한 행이 캐시 줄 둘(원소 넷씩)로 묶인다. 커서가
 *            걸음마다 칸을 옮겨 가고, 지나온 몇 걸음이 자취로 남는다 — 행 우선이면 옆으로
 *            한 칸씩, 열 우선이면 행을 건너뛰며 아래로 내려간다.
 *   캐시     최근에 쓴 줄이 맨 위. 미스로 가져온 줄은 배열의 제자리에서 날아와 맨 위에 서고
 *            나머지는 한 칸씩 밀려 내려간다. 넘친 줄은 아래 "밀려남" 자리로 떨어져 사라진다.
 *   비율     행 수(사다리)마다 두 순서의 미스 비율 막대. 도는 판의 막대가 걸음마다 자라고,
 *            판이 끝나면 그 자리에 남는다. 캐시 줄 수에 절벽 표시가 선다.
 *
 * 움직임은 전부 CSS transition 이다 — 되짚기 띠가 없는 reactive 완제품이라 속성을
 * 덮어쓰면 마지막 값이 이긴다.
 *
 * 문안은 projector 가 넘기는 캡션과, 여기서 `tr` 로 조회하는 라벨뿐이다.
 */

import { categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 420;

// 배열
const GX = 52;
const GY = 84;
const CW = 28;
const CH = 18;
const ROW_PITCH = 20;
const LINE_GAP = 6;

// 캐시
const CX = 318;
const CY = 84;
const SLOT_PITCH = 34;
const SLOT_H = 28;
const SLOT_W = 150;

// 비율 막대
const KX = 564;
const PT = 96;
const PB = 256;
const GROUP_PITCH = 38;
const BAR_W = 13;

/** 자취로 남기는 걸음 수. */
const TRAIL = 8;

export type ArrayTraversalOrderStage = ViewInstance & {
  setPace(ms: number): void;
  startRun(run: { rows: number; cols: number; order: number; lineElems: number; cacheLines: number }, caption: string): void;
  /** 커서를 칸으로 옮긴다 — 걸음의 첫 박자. */
  moveCursor(v: { r: number; c: number }, caption: string): void;
  /** 찾는 줄을 배열과 캐시에서 짚는다 — 걸음의 둘째 박자. */
  markLookup(line: number, caption: string): void;
  showAccess(
    a: {
      line: number;
      hit: boolean;
      evicted: number;
      refetch: boolean;
      cache: number[];
      percent: number;
    },
    caption: string,
  ): void;
  endRun(run: { rows: number; order: number; missPercent: number; sum: number }, caption: string): void;
  clearAll(): void;
};

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function numList(v: unknown, fallback: number[]): number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : fallback;
}

export const arrayTraversalOrderStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const [ROW_COLOR, COL_COLOR] = categorical(2, 'vivid') as [string, string];
    const init = params.initialData ?? {};
    const cols = num(init.cols, 8);
    const lineElems = num(init.lineElems, 4);
    const cacheLines = num(init.cacheLines, 8);
    const ladder = numList(init.rowLadder, [4, 8, 12, 16]);
    const maxRows = Math.max(...ladder);
    const linesPerRow = Math.ceil(cols / lineElems);

    let pace = 160;
    let rows = num(init.rows, maxRows);
    let order = num(init.order, 0);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = root,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }
    function text(parent: Element, x: number, y: number, s: string, opts: Record<string, string | number> = {}) {
      const t = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted, ...opts }, parent);
      t.textContent = s;
      return t;
    }
    function ease(e: SVGElement, props = 'transform'): void {
      e.style.transition = props
        .split(',')
        .map((p) => `${p.trim()} ${pace}ms ease`)
        .join(', ');
    }
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    }

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: pal.bg });

    // ── 캡션
    const caption = text(root, 20, 26, '', { 'font-size': fontSizes.md, fill: pal.text });

    // ── 배열
    const cellX = (c: number) => GX + c * CW + Math.floor(c / lineElems) * LINE_GAP;
    const rowY = (r: number) => GY + r * ROW_PITCH;
    const arrayTitle = text(root, 20, 58, '', { 'font-size': fontSizes.sm, fill: pal.text });
    for (let c = 0; c < cols; c++) text(root, cellX(c) + CW / 2, GY - 6, String(c), { 'text-anchor': 'middle' });

    const trail = el('polyline', {
      points: '',
      fill: 'none',
      stroke: pal.itemActive,
      'stroke-width': 2,
      'stroke-opacity': 0.45,
      'stroke-linejoin': 'round',
    });
    const rowGroups: SVGGElement[] = [];
    /** 줄 번호 → 배열 위의 줄 테두리. */
    const lineRects = new Map<number, SVGRectElement>();
    for (let r = 0; r < maxRows; r++) {
      const g = el('g', {});
      g.style.transform = `translate(0px, ${rowY(r)}px)`;
      rowGroups.push(g);
      text(g, GX - 8, CH / 2 + 4, String(r), { 'text-anchor': 'end' });
      for (let k = 0; k < linesPerRow; k++) {
        const x0 = cellX(k * lineElems) - 2;
        const span = Math.min(lineElems, cols - k * lineElems);
        const rect = el(
          'rect',
          { x: x0, y: -2, width: span * CW + 4, height: CH + 4, rx: 4, fill: 'none', stroke: pal.border, 'stroke-width': 1 },
          g,
        );
        lineRects.set(Math.floor((r * cols + k * lineElems) / lineElems), rect);
      }
      for (let c = 0; c < cols; c++) {
        el('rect', { x: cellX(c), y: 0, width: CW - 2, height: CH, rx: 2, fill: pal.bgSubtle, stroke: pal.border }, g);
        text(g, cellX(c) + (CW - 2) / 2, CH / 2 + 4, String(r * cols + c + 1), { 'text-anchor': 'middle', 'font-family': fonts.mono });
      }
    }
    // 커서는 행들 위에 선다.
    const cursor = el('rect', {
      x: 0,
      y: 0,
      width: CW - 2,
      height: CH,
      rx: 3,
      fill: 'none',
      stroke: pal.itemActive,
      'stroke-width': 3,
      opacity: 0,
    });
    root.appendChild(trail);
    root.appendChild(cursor);
    const trailPts: string[] = [];

    function layoutRows(): void {
      for (let r = 0; r < maxRows; r++) {
        const g = rowGroups[r]!;
        ease(g, 'transform, opacity');
        const on = r < rows;
        // 사라지는 행은 위로 접혀 들어가고, 새로 생기는 행은 아래로 펼쳐진다.
        g.style.transform = `translate(0px, ${on ? rowY(r) : rowY(Math.max(0, rows - 1))}px)`;
        g.style.opacity = on ? '1' : '0';
      }
      arrayTitle.textContent = tr('label.array', 'Array {rows} × {cols} · stored row by row', { rows, cols });
    }

    // ── 캐시
    text(root, CX, 58, tr('label.cache', 'Cache · {lines} lines · LRU', { lines: cacheLines }), {
      'font-size': fontSizes.sm,
      fill: pal.text,
    });
    text(root, CX + SLOT_W, CY - 6, tr('label.recent', 'most recent'), { 'text-anchor': 'end' });
    for (let i = 0; i < cacheLines; i++) {
      el('rect', {
        x: CX,
        y: CY + i * SLOT_PITCH,
        width: SLOT_W,
        height: SLOT_H,
        rx: 4,
        fill: 'none',
        stroke: pal.border,
        'stroke-dasharray': '4 3',
      });
    }
    const pushedY = CY + cacheLines * SLOT_PITCH + 6;
    text(root, CX + SLOT_W / 2, pushedY + SLOT_H + 14, tr('label.pushed', 'pushed out'), {
      'text-anchor': 'middle',
      fill: pal.danger,
    });
    const tileLayer = el('g', {});
    /** 줄 번호 → 캐시 타일. */
    const tiles = new Map<number, SVGGElement>();

    function makeTile(line: number): SVGGElement {
      const g = el('g', {}, tileLayer);
      el('rect', { x: 0, y: 0, width: SLOT_W, height: SLOT_H, rx: 4, fill: pal.bgSubtle, stroke: pal.text, 'stroke-width': 1.2 }, g);
      const r = Math.floor((line * lineElems) / cols);
      const c0 = (line * lineElems) % cols;
      text(g, 10, SLOT_H / 2 + 4, tr('label.tile', 'line {line}', { line }), { fill: pal.text, 'font-size': fontSizes.sm });
      text(g, SLOT_W - 10, SLOT_H / 2 + 4, tr('label.tileSpan', 'r{r} · c{c0}–{c1}', { r, c0, c1: c0 + lineElems - 1 }), {
        'text-anchor': 'end',
        'font-family': fonts.mono,
      });
      return g;
    }
    function lineOrigin(line: number): [number, number] {
      const r = Math.floor((line * lineElems) / cols);
      const c0 = (line * lineElems) % cols;
      return [cellX(c0) - 2, rowY(r) - 5];
    }
    function evictTile(line: number): void {
      const t = tiles.get(line);
      if (!t) return;
      tiles.delete(line);
      ease(t, 'transform, opacity');
      t.style.transform = `translate(${CX}px, ${pushedY}px)`;
      t.style.opacity = '0.2';
      later(() => t.remove(), pace * 3);
    }
    function placeTiles(cache: number[]): void {
      cache.forEach((line, i) => {
        let t = tiles.get(line);
        if (!t) {
          t = makeTile(line);
          const [ox, oy] = lineOrigin(line);
          t.style.transform = `translate(${ox}px, ${oy}px)`;
          t.style.opacity = '0.4';
          tiles.set(line, t);
          // 출발 자리를 한 번 확정한 뒤 옮겨야 transition 이 걸린다.
          void t.getBoundingClientRect();
        }
        ease(t, 'transform, opacity');
        t.style.transform = `translate(${CX}px, ${CY + i * SLOT_PITCH}px)`;
        t.style.opacity = '1';
        const box = t.firstElementChild as SVGRectElement | null;
        box?.setAttribute('stroke', i === 0 ? pal.itemActive : pal.text);
        box?.setAttribute('stroke-width', i === 0 ? '2.5' : '1.2');
      });
    }
    /** 배열 위 줄 테두리 — 캐시에 있음 · 밀려남 · 아직 안 옴. */
    const everLoaded = new Set<number>();
    function paintLines(cache: number[]): void {
      const inCache = new Set(cache);
      for (const [line, rect] of lineRects) {
        if (inCache.has(line)) {
          rect.setAttribute('fill', pal.subtreeShadeRight);
          rect.setAttribute('stroke', pal.accent);
          rect.setAttribute('stroke-dasharray', '');
        } else if (everLoaded.has(line)) {
          rect.setAttribute('fill', 'none');
          rect.setAttribute('stroke', pal.ghostOutline);
          rect.setAttribute('stroke-dasharray', '3 3');
        } else {
          rect.setAttribute('fill', 'none');
          rect.setAttribute('stroke', pal.border);
          rect.setAttribute('stroke-dasharray', '');
        }
      }
    }

    // ── 비율 막대
    text(root, KX - 28, 58, tr('label.chart', 'Miss rate by row count'), { 'font-size': fontSizes.sm, fill: pal.text });
    const plotH = PB - PT;
    for (const p of [0, 50, 100]) {
      const y = PB - (plotH * p) / 100;
      el('line', { x1: KX, x2: KX + ladder.length * GROUP_PITCH, y1: y, y2: y, stroke: pal.border });
      text(root, KX - 4, y + 4, `${p}%`, { 'text-anchor': 'end' });
    }
    const groupX = (i: number) => KX + 6 + i * GROUP_PITCH;
    const bars = new Map<string, { bar: SVGRectElement; label: SVGTextElement }>();
    ladder.forEach((rv, i) => {
      text(root, groupX(i) + BAR_W, PB + 16, String(rv), { 'text-anchor': 'middle', fill: pal.text });
      for (let o = 0; o < 2; o++) {
        const x = groupX(i) + o * (BAR_W + 2);
        const bar = el('rect', { x, y: PT, width: BAR_W, height: plotH, fill: o === 0 ? ROW_COLOR : COL_COLOR });
        bar.style.transformBox = 'fill-box';
        bar.style.transformOrigin = '50% 100%';
        bar.style.transform = 'scaleY(0)';
        const label = text(root, x + BAR_W / 2, PB - 3, '', { 'text-anchor': 'middle', 'font-size': '9px' });
        bars.set(`${o}:${rv}`, { bar, label });
      }
    });
    text(root, KX + (ladder.length * GROUP_PITCH) / 2, PB + 32, tr('label.rowsAxis', 'rows'), { 'text-anchor': 'middle' });
    // 절벽 — 캐시 줄 수 이하와 초과 사이.
    const cliffIdx = ladder.findIndex((rv) => rv > cacheLines);
    if (cliffIdx > 0) {
      const x = groupX(cliffIdx) - (GROUP_PITCH - 2 * BAR_W - 2) / 2;
      el('line', { x1: x, x2: x, y1: PT - 8, y2: PB, stroke: pal.danger, 'stroke-dasharray': '4 3' });
      text(root, x, PT - 14, tr('label.cliff', 'rows > cache lines'), { 'text-anchor': 'middle', fill: pal.danger });
    }
    // 지금 도는 판의 표식 — 손잡이를 돌리면 옆으로 옮겨 간다.
    const marker = el('path', { d: `M0,0 L-5,8 L5,8 Z`, fill: pal.itemActive });
    // 범례와 합
    el('rect', { x: KX - 28, y: PB + 44, width: 10, height: 10, fill: ROW_COLOR });
    text(root, KX - 14, PB + 53, tr('label.rowOrder', 'row-major'), { fill: pal.text });
    el('rect', { x: KX - 28, y: PB + 62, width: 10, height: 10, fill: COL_COLOR });
    text(root, KX - 14, PB + 71, tr('label.colOrder', 'column-major'), { fill: pal.text });
    const sumRowText = text(root, KX - 28, PB + 100, '', { fill: pal.text, 'font-family': fonts.mono });
    const sumColText = text(root, KX - 28, PB + 118, '', { fill: pal.text, 'font-family': fonts.mono });

    const results = new Map<string, number>();
    const sums = new Map<string, number>();

    function setBar(o: number, rv: number, percent: number): void {
      const b = bars.get(`${o}:${rv}`);
      if (!b) return;
      ease(b.bar);
      ease(b.label);
      b.bar.style.transform = `scaleY(${Math.max(0, Math.min(100, percent)) / 100})`;
      b.label.style.transform = `translate(0px, ${-(plotH * percent) / 100}px)`;
      b.label.textContent = `${percent}`;
    }
    function placeMarker(): void {
      const i = Math.max(0, ladder.indexOf(rows));
      ease(marker);
      marker.style.transform = `translate(${groupX(i) + order * (BAR_W + 2) + BAR_W / 2}px, ${PB + 2}px)`;
    }
    function paintSums(): void {
      const rs = sums.get(`0:${rows}`);
      const cs = sums.get(`1:${rows}`);
      sumRowText.textContent = rs === undefined ? '' : tr('label.sumRow', 'row-major sum {sum}', { sum: rs });
      sumColText.textContent = cs === undefined ? '' : tr('label.sumCol', 'column-major sum {sum}', { sum: cs });
    }

    function reset(): void {
      for (const line of [...tiles.keys()]) evictTile(line);
      everLoaded.clear();
      paintLines([]);
      trailPts.length = 0;
      trail.setAttribute('points', '');
      cursor.setAttribute('opacity', '0');
    }

    layoutRows();
    placeMarker();
    paintLines([]);

    const instance: ArrayTraversalOrderStage = {
      setPace(ms: number) {
        pace = Math.max(40, Math.min(600, ms));
      },
      startRun(run, cap) {
        rows = run.rows;
        order = run.order;
        caption.textContent = cap;
        reset();
        layoutRows();
        placeMarker();
        paintSums();
        // 새 판의 막대는 0 에서 다시 자란다.
        setBar(order, rows, 0);
      },
      moveCursor(v, cap) {
        caption.textContent = cap;
        const x = cellX(v.c);
        const y = rowY(v.r);
        cursor.setAttribute('opacity', '1');
        cursor.setAttribute('stroke', pal.itemActive);
        ease(cursor);
        cursor.style.transform = `translate(${x}px, ${y}px)`;
        trailPts.push(`${x + (CW - 2) / 2},${y + CH / 2}`);
        if (trailPts.length > TRAIL) trailPts.shift();
        trail.setAttribute('points', trailPts.join(' '));
      },
      markLookup(line, cap) {
        caption.textContent = cap;
        lineRects.get(line)?.setAttribute('stroke', pal.itemActive);
        const t = tiles.get(line)?.firstElementChild as SVGRectElement | null | undefined;
        t?.setAttribute('stroke', pal.itemActive);
      },
      showAccess(a, cap) {
        caption.textContent = cap;
        cursor.setAttribute('stroke', a.hit ? pal.accent : pal.danger);

        if (a.evicted >= 0) evictTile(a.evicted);
        placeTiles(a.cache);
        everLoaded.add(a.line);
        paintLines(a.cache);
        if (a.refetch) lineRects.get(a.line)?.setAttribute('stroke', pal.danger);
        setBar(order, rows, a.percent);
      },
      endRun(run, cap) {
        caption.textContent = cap;
        results.set(`${run.order}:${run.rows}`, run.missPercent);
        sums.set(`${run.order}:${run.rows}`, run.sum);
        setBar(run.order, run.rows, run.missPercent);
        paintSums();
      },
      clearAll() {
        reset();
        caption.textContent = '';
        for (const key of results.keys()) {
          const [o, rv] = key.split(':').map(Number) as [number, number];
          setBar(o, rv, 0);
        }
        results.clear();
        sums.clear();
        paintSums();
      },
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
    return instance;
  },
};
