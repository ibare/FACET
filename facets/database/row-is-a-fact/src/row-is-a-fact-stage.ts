/**
 * 줄은 사실이다 — stage.
 *
 * 아래에 표가 있고, 그 위에 문장 틀이 있고, 맨 위에 사실이 쌓인다.
 *   - 틀: 표 머리의 열 이름이 위로 올라가 문장의 빈칸이 된다.
 *   - 사실: 줄의 값이 곧장 위로 올라가 빈칸을 채우고, 채워진 문장이 더 올라가 사실 줄에 앉는다.
 *   - 물음: 값이 채워진 틀이 표로 내려와 줄을 지난다. 맞는 줄에서 멈칫하고, 표 아래 답 자리에 앉는다.
 *
 * 빈칸은 표의 열 바로 위에 선다 — 값이 옆으로 비껴가지 않고 곧게 올라가도록.
 * 문장 틀의 글자는 빈칸 사이 · 앞 · 뒤에 앵커로 붙여, 글자 폭을 재지 않는다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { RowIsAFactScene } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';
const TICK_MS = 16;
const FRAME_MS = 620;
const RISE_MS = 460;
const SEAT_MS = 400;
const ASK_MS = 940;

type Layout = {
  u: number;
  boxW: number;
  boxH: number;
  left: number;
  right: number;
  colW: number;
  colX: number[];
  factY: (k: number) => number;
  moldY: number;
  nameY: number;
  headY: number;
  rowY: (i: number) => number;
  askY: (k: number) => number;
};

/** 문장 틀을 조각낸 것 — 빈칸 k 에 들어갈 열 번호와 빈칸 앞 · 사이 · 뒤의 글자. */
type Frame = { slots: number[]; pieces: string[] };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function layoutOf(nCols: number, nRows: number, nQueries: number): Layout {
  const W = PIECE_CANVAS_W;
  const left = W * 0.24;
  const right = W * 0.86;
  const colW = (right - left) / nCols;
  const top = 62;
  const lines = 2 * nRows + Math.max(nQueries, 1) - 1 + 4.2;
  const u = Math.min(30, (H - top - 20) / lines);
  const moldY = top + nRows * u + 0.6 * u;
  const nameY = moldY + 1.2 * u;
  const headY = nameY + 0.8 * u;
  const lastRow = headY + nRows * u;
  return {
    u,
    boxW: Math.min(100, colW * 0.55),
    boxH: u * 0.8,
    left,
    right,
    colW,
    colX: Array.from({ length: nCols }, (_, c) => left + (c + 0.5) * colW),
    factY: (k) => top + k * u,
    moldY,
    nameY,
    headY,
    rowY: (i) => headY + (i + 1) * u,
    askY: (k) => lastRow + 1.6 * u + k * u,
  };
}

/** 문안의 틀을 `{열 이름}` 자리로 쪼갠다. 열마다 자리가 꼭 하나 있어야 한다. */
function parseFrame(template: string, columns: string[]): Frame {
  const slots: number[] = [];
  const pieces: string[] = [];
  let rest = template;
  for (;;) {
    const m = /\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(rest);
    if (m === null) break;
    const name = m[1];
    const c = columns.indexOf(name ?? '');
    if (c < 0) throw new Error(`row-is-a-fact: 문장 틀의 자리 {${name}} 가 열이 아니다`);
    if (slots.includes(c)) throw new Error(`row-is-a-fact: 문장 틀에 {${name}} 가 둘이다`);
    pieces.push(rest.slice(0, m.index));
    slots.push(c);
    rest = rest.slice(m.index + m[0].length);
  }
  pieces.push(rest);
  if (slots.length !== columns.length) {
    throw new Error(`row-is-a-fact: 문장 틀의 빈칸 ${slots.length} 이 열 수 ${columns.length} 와 다르다`);
  }
  return { slots, pieces: pieces.map((s) => s.trim()) };
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
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
  text: string,
  opts: { anchor?: string; size?: string; fill: string; mono?: boolean; weight?: string },
): SVGElement {
  const node = el(
    'text',
    {
      x,
      y,
      'text-anchor': opts.anchor ?? 'middle',
      'dominant-baseline': 'central',
      'font-family': opts.mono === true ? fonts.mono : fonts.body,
      'font-size': opts.size ?? fontSizes.md,
      'font-weight': opts.weight ?? 'normal',
      fill: opts.fill,
    },
    parent,
  );
  node.textContent = text;
  return node;
}

type SentenceStyle = {
  /** 빈칸에 앉은 값 — 열 순서. null 이면 빈 틀 (빈칸에 열 이름을 흐리게 둔다) */
  values: string[] | null;
  stroke: string;
  valueFill: string;
  dashed: boolean;
  chip: { text: string; color: string } | null;
};

export const rowIsAFactStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function sentence(parent: Element, y: number, lay: Layout, frame: Frame, columns: string[], s: SentenceStyle): SVGElement {
      const g = el('g', {}, parent);
      const half = lay.boxW / 2;
      const slotX = frame.slots.map((col) => {
        const x = lay.colX[col];
        if (x === undefined) throw new Error(`row-is-a-fact: 열 ${col} 의 자리가 없다`);
        return x;
      });
      // 빈칸은 열 번호의 자리에 서므로, 틀 글자는 왼쪽부터 빈칸 차례대로 붙인다.
      const order = slotX.map((x, k) => ({ x, k })).sort((a, b) => a.x - b.x);
      const firstX = order[0]?.x;
      const lastX = order[order.length - 1]?.x;
      if (firstX === undefined || lastX === undefined) throw new Error('row-is-a-fact: 빈칸이 없다');
      const words = { size: fontSizes.md, fill: c.text };
      const prefix = frame.pieces[0] ?? '';
      if (prefix !== '') label(g, firstX - half - 8, y, prefix, { ...words, anchor: 'end' });
      for (let k = 1; k < order.length; k += 1) {
        const a = order[k - 1];
        const b = order[k];
        const piece = frame.pieces[k] ?? '';
        if (a !== undefined && b !== undefined && piece !== '') label(g, (a.x + b.x) / 2, y, piece, words);
      }
      const suffix = frame.pieces[frame.pieces.length - 1] ?? '';
      if (suffix !== '' && frame.pieces.length > 1) label(g, lastX + half + 8, y, suffix, { ...words, anchor: 'start' });
      for (const [k, col] of frame.slots.entries()) {
        const x = slotX[k];
        if (x === undefined) throw new Error(`row-is-a-fact: 빈칸 ${k} 의 자리가 없다`);
        el(
          'rect',
          {
            x: x - half,
            y: y - lay.boxH / 2,
            width: lay.boxW,
            height: lay.boxH,
            rx: 5,
            fill: s.values === null ? c.bg : c.bgSubtle,
            stroke: s.stroke,
            'stroke-width': 1.4,
            ...(s.dashed ? { 'stroke-dasharray': '4 3' } : {}),
          },
          g,
        );
        const v = s.values?.[col];
        if (s.values === null) {
          label(g, x, y, columns[col] ?? '', { size: fontSizes.sm, fill: c.textMuted, mono: true });
        } else if (v !== undefined) {
          label(g, x, y, v, { fill: s.valueFill, weight: '600' });
        }
      }
      if (s.chip !== null) {
        const cw = 72;
        el('rect', { x: 20, y: y - lay.boxH / 2, width: cw, height: lay.boxH, rx: lay.boxH / 2, fill: s.chip.color }, g);
        label(g, 20 + cw / 2, y, s.chip.text, { size: fontSizes.sm, fill: c.textInverse, weight: '600' });
      }
      return g;
    }

    type Handles = {
      lay: Layout;
      frame: Frame;
      mold: SVGElement | null;
      facts: SVGElement[];
      asks: SVGElement[];
      motion: SVGElement;
    };

    function captionOf(s: RowIsAFactScene): string {
      const step = s.step;
      if (step.kind === 'start') return t('caption.table', 'Table {name}. Rows: {n}', { name: s.table, n: s.rows.length });
      if (step.kind === 'frame') {
        return t('caption.frame', 'The heading becomes a sentence frame. Blanks: {n}', { n: s.columns.length });
      }
      if (step.kind === 'fact') {
        return t('caption.fact', 'Each row fills the blanks and becomes a true sentence. Facts: {n}', { n: s.facts.length });
      }
      const a = s.asked[s.asked.length - 1];
      if (a === undefined) throw new Error('row-is-a-fact: 물음 걸음인데 답이 없다');
      const n = a.matches.length;
      const verdict = n > 0 ? t('label.true', 'true') : t('label.false', 'false');
      if (n > 0) return t('caption.found', 'A row pairs these values. Matching rows: {n} → {verdict}', { n, verdict });
      if (a.hits.every((h) => h.length > 0)) {
        return t('caption.unpaired', 'Each value exists, but no row pairs them. Matching rows: {n} → {verdict}', {
          n,
          verdict,
        });
      }
      return t('caption.absent', 'No row holds these values. Matching rows: {n} → {verdict}', { n, verdict });
    }

    function drawStatic(s: RowIsAFactScene): Handles {
      svg.textContent = '';
      const lay = layoutOf(s.columns.length, s.rows.length, s.queries.length);
      const frame = parseFrame(
        t('frame', '{person} lives in {city}'),
        s.columns,
      );
      const W = PIECE_CANVAS_W;
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
      label(svg, W / 2, 26, captionOf(s), { fill: c.text, size: fontSizes.md, weight: '600' });

      // 표 — 이번 물음이 있으면 열마다 같은 칸 · 모든 열이 같은 줄을 머물러 둔다.
      const tableLayer = el('g', {}, svg);
      const lastAsk = s.step.kind === 'ask' ? s.asked[s.asked.length - 1] : undefined;
      const currentRow = s.step.kind === 'fact' ? s.step.row : -1;
      label(tableLayer, lay.left, lay.nameY, s.table, { anchor: 'start', size: fontSizes.sm, fill: c.textMuted, mono: true, weight: '600' });
      const cellW = lay.colW - 8;
      const cellH = lay.u - 4;
      for (const [col, name] of s.columns.entries()) {
        const x = lay.colX[col];
        if (x === undefined) throw new Error(`row-is-a-fact: 열 ${col} 의 자리가 없다`);
        el('rect', { x: x - cellW / 2, y: lay.headY - cellH / 2, width: cellW, height: cellH, rx: 3, fill: c.bgSubtle, stroke: c.border }, tableLayer);
        label(tableLayer, x, lay.headY, name, { size: fontSizes.sm, fill: c.textMuted, mono: true, weight: '600' });
      }
      for (const [i, row] of s.rows.entries()) {
        const y = lay.rowY(i);
        const whole = lastAsk?.matches.includes(i) === true;
        if (whole) {
          el('rect', { x: lay.left, y: y - lay.u / 2, width: lay.right - lay.left, height: lay.u, rx: 4, fill: c.success, 'fill-opacity': 0.18 }, tableLayer);
        }
        for (const [col, v] of row.entries()) {
          const x = lay.colX[col];
          if (x === undefined) throw new Error(`row-is-a-fact: 열 ${col} 의 자리가 없다`);
          const hit = lastAsk?.hits[col]?.includes(i) === true;
          const cur = i === currentRow;
          el(
            'rect',
            {
              x: x - cellW / 2,
              y: y - cellH / 2,
              width: cellW,
              height: cellH,
              rx: 3,
              fill: 'none',
              stroke: hit ? c.itemComparing : cur ? c.accent : c.border,
              'stroke-width': hit || cur ? 2 : 1,
            },
            tableLayer,
          );
          label(tableLayer, x, y, v, { fill: c.text });
        }
      }

      // 틀 · 사실 · 물음
      const mold = s.framed
        ? sentence(svg, lay.moldY, lay, frame, s.columns, { values: null, stroke: c.textMuted, valueFill: c.text, dashed: true, chip: null })
        : null;
      const facts = s.facts.map((row, k) => {
        const values = s.rows[row];
        if (values === undefined) throw new Error(`row-is-a-fact: 사실의 줄 ${row} 이 없다`);
        return sentence(svg, lay.factY(k), lay, frame, s.columns, {
          values,
          stroke: c.success,
          valueFill: c.text,
          dashed: false,
          chip: { text: t('label.true', 'true'), color: c.success },
        });
      });
      const asks = s.asked.map((a, k) => {
        const values = s.queries[a.query];
        if (values === undefined) throw new Error(`row-is-a-fact: 물음 ${a.query} 이 없다`);
        const yes = a.matches.length > 0;
        return sentence(svg, lay.askY(k), lay, frame, s.columns, {
          values,
          stroke: c.primary,
          valueFill: c.primary,
          dashed: false,
          chip: { text: yes ? t('label.true', 'true') : t('label.false', 'false'), color: yes ? c.success : c.danger },
        });
      });
      const motion = el('g', {}, svg);
      return { lay, frame, mold, facts, asks, motion };
    }

    /** 틱으로 흐르는 시계. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function run(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const total = Math.max(1, Math.ceil(ms / TICK_MS));
        let n = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          n += 1;
          frame(Math.min(1, n / total));
          if (n >= total) {
            waiters.delete(wake);
            resolve(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 0);
        timers.add(id);
      });
    }

    function shift(node: SVGElement, dx: number, dy: number): void {
      node.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    function progress(s: RowIsAFactScene): number {
      return (s.framed ? 1 : 0) + s.facts.length + s.asked.length;
    }

    async function animate(next: RowIsAFactScene, h: Handles, mine: number): Promise<void> {
      const { lay, frame } = h;
      const live = (): boolean => mine === gen && !destroyed;
      const step = next.step;

      if (step.kind === 'frame') {
        // 열 이름이 표 머리에서 틀의 빈칸으로 올라간다.
        if (h.mold !== null) h.mold.setAttribute('visibility', 'hidden');
        const flying = frame.slots.map((col, k) => {
          const from = lay.colX[col];
          const to = lay.colX[frame.slots[k] ?? col];
          if (from === undefined || to === undefined) throw new Error('row-is-a-fact: 열 자리가 없다');
          const node = label(h.motion, from, lay.headY, next.columns[col] ?? '', { size: fontSizes.sm, fill: c.textMuted, mono: true, weight: '600' });
          return { node, dx: to - from };
        });
        await run(FRAME_MS, mine, (p) => {
          const e = ease(p);
          for (const f of flying) shift(f.node, f.dx * e, (lay.moldY - lay.headY) * e);
        });
        return;
      }

      if (step.kind === 'fact') {
        const line = h.facts[h.facts.length - 1];
        const values = next.rows[step.row];
        if (line === undefined || values === undefined) throw new Error('row-is-a-fact: 사실 걸음인데 사실 줄이 없다');
        // 1) 줄의 값이 곧장 올라가 빈칸을 채운다.
        line.setAttribute('visibility', 'hidden');
        const fromY = lay.rowY(step.row);
        const flying = values.map((v, col) => {
          const x = lay.colX[col];
          if (x === undefined) throw new Error('row-is-a-fact: 열 자리가 없다');
          return label(h.motion, x, fromY, v, { fill: c.text, weight: '600' });
        });
        const ok = await run(RISE_MS, mine, (p) => {
          const e = ease(p);
          for (const node of flying) shift(node, 0, (lay.moldY - fromY) * e);
        });
        if (!ok || !live()) return;
        // 2) 채워진 문장이 틀에서 떨어져 사실 줄로 올라가 앉는다.
        h.motion.textContent = '';
        line.removeAttribute('visibility');
        const dy = lay.moldY - lay.factY(next.facts.length - 1);
        shift(line, 0, dy);
        await run(SEAT_MS, mine, (p) => shift(line, 0, dy * (1 - ease(p))));
        return;
      }

      if (step.kind === 'ask') {
        // 값이 채워진 틀이 표로 내려와 줄을 지난다. 맞는 줄이 있으면 거기서 멈칫한다.
        const line = h.asks[h.asks.length - 1];
        const a = next.asked[next.asked.length - 1];
        if (line === undefined || a === undefined) throw new Error('row-is-a-fact: 물음 걸음인데 답이 없다');
        const endY = lay.askY(next.asked.length - 1);
        const startDy = lay.moldY - endY;
        const stopRow = a.matches[0];
        shift(line, 0, startDy);
        if (stopRow === undefined) {
          await run(ASK_MS, mine, (p) => shift(line, 0, startDy * (1 - ease(p))));
          return;
        }
        const stopDy = lay.rowY(stopRow) - endY;
        await run(ASK_MS, mine, (p) => {
          // 앞 절반은 맞는 줄까지, 가운데 잠깐 머물고, 남은 길을 내려간다.
          if (p < 0.5) shift(line, 0, startDy + (stopDy - startDy) * ease(p / 0.5));
          else if (p < 0.68) shift(line, 0, stopDy);
          else shift(line, 0, stopDy * (1 - ease((p - 0.68) / 0.32)));
        });
      }
    }

    return {
      async render(next: RowIsAFactScene, prev: RowIsAFactScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || progress(prev) + 1 !== progress(next)) return;
        await animate(next, h, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
