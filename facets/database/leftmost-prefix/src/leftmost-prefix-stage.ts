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
import { bracketOf, type LeftmostPrefixScene } from './scene.js';

const H = 364;
const SVG = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const SQL_Y = 30;
const INDEX_Y = 64;
const TILE_TOP = 120;
const TILE_H = 56;
const RISE = 36;
const NUM_Y = TILE_TOP + TILE_H + 16;
const BRACKET_Y = NUM_Y + 14;
const BRACKET_LABEL_Y = BRACKET_Y + 20;
const CAPTION_Y = BRACKET_LABEL_Y + 32;
const LEDGER_TOP = CAPTION_Y + 26;
const LEDGER_ROW = 26;
const MINI = 14;

const SHOW_MS = 450;
const NARROW_MS = 900;
const SCAN_MS = 900;
const FRAME_MS = 16;

const SM = parseFloat(fontSizes.sm);

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(el);
  return el;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Attrs): SVGTextElement {
  const el = node('text', { x, y, ...attrs }, parent);
  el.textContent = s;
  return el;
}

/** 한 장면의 화면에서 운동이 붙잡는 손잡이 */
type Handles = {
  tiles: { g: SVGGElement; rect: SVGRectElement }[];
  bracket: SVGGElement | null;
  bracketLine: SVGLineElement | null;
  bracketLeft: SVGLineElement | null;
  bracketRight: SVGLineElement | null;
  bracketLabel: SVGTextElement | null;
  sql: SVGGElement | null;
  lastLedger: SVGGElement | null;
  anim: SVGGElement;
};

export const leftmostPrefixStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const slotW = (n: number): number => (PIECE_CANVAS_W - 2 * MARGIN) / Math.max(1, n);
    const centerOf = (pos: number, n: number): number => MARGIN + slotW(n) * (pos - 0.5);
    const leftOf = (pos: number, n: number): number => MARGIN + slotW(n) * (pos - 1) + 2;
    const rightOf = (pos: number, n: number): number => MARGIN + slotW(n) * pos - 2;

    function caption(scene: LeftmostPrefixScene): string {
      const cur = scene.current;
      if (!cur) {
        if (scene.entries.length === 0) return '';
        return t('caption.idle', 'Index entries in {columns} order.', { columns: scene.columns.join(', ') });
      }
      const q = scene.queries[cur.q]?.id ?? '';
      const lead = scene.columns[0] ?? '';
      if (cur.mode === 'shown') {
        return cur.lead > 0
          ? t('caption.lead', '{q}: leading column {column} is given, so the search can jump in.', { q, column: lead })
          : t('caption.noLead', '{q}: leading column {column} is not given, so there is nowhere to jump in.', { q, column: lead });
      }
      const range = bracketOf(scene);
      const from = range ? range[0] : 0;
      const to = range ? range[1] : 0;
      if (cur.mode === 'scanned') {
        return t('caption.scan', '{q}: read every entry from {from} to {to}.', { q, from, to });
      }
      if (cur.outer) {
        return t('caption.narrowInside', '{q}: inside entries {lo}–{hi}, jumped to entry {from} and stopped at entry {to}.', {
          q,
          lo: cur.outer[0],
          hi: cur.outer[1],
          from,
          to,
        });
      }
      return t('caption.narrow', '{q}: jumped to entry {from} and stopped at entry {to}.', { q, from, to });
    }

    function drawStatic(scene: LeftmostPrefixScene): Handles {
      svg.textContent = '';
      const root = node('g', {}, svg);
      const n = scene.entries.length;
      const handles: Handles = {
        tiles: [],
        bracket: null,
        bracketLine: null,
        bracketLeft: null,
        bracketRight: null,
        bracketLabel: null,
        sql: null,
        lastLedger: null,
        anim: root,
      };
      if (n === 0) {
        handles.anim = node('g', {}, root);
        return handles;
      }
      const cur = scene.current;
      const examined = new Set(cur ? cur.examined : []);
      const hits = new Set(cur ? cur.hits : []);

      // 질의 글자 (SQL 그대로)
      if (cur) {
        const qd = scene.queries[cur.q];
        if (qd) {
          const g = node('g', {}, root);
          label(g, MARGIN, SQL_Y, qd.id, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: colors.text,
          });
          label(g, MARGIN + SM * 2.6, SQL_Y, qd.sql, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
          handles.sql = g;
        }
      }

      // 인덱스 이름과 열 — 자료 그대로
      label(root, MARGIN, INDEX_Y, `${scene.indexName} (${scene.columns.join(', ')})`, {
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });

      // 정렬된 항목 — 맞는 항목은 떠오른다
      const w = slotW(n) - 4;
      scene.entries.forEach((e, i) => {
        const pos = i + 1;
        const hit = hits.has(pos);
        const seen = examined.has(pos);
        const g = node('g', hit ? { transform: `translate(0,${-RISE})` } : {}, root);
        const x = leftOf(pos, n);
        const rect = node(
          'rect',
          {
            x,
            y: TILE_TOP,
            width: w,
            height: TILE_H,
            rx: 4,
            fill: hit ? colors.accent : colors.bgSubtle,
            stroke: hit ? colors.accent : seen ? colors.itemComparing : colors.border,
            'stroke-width': seen && !hit ? 2 : 1,
          },
          g,
        );
        const ink = hit ? colors.stateInk : colors.text;
        const cx = x + w / 2;
        e.values.forEach((v, k) => {
          label(g, cx, TILE_TOP + 17 + k * 15, v, {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': k === 0 ? 700 : 400,
            fill: ink,
          });
        });
        label(g, cx, TILE_TOP + TILE_H - 7, e.row, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: hit ? colors.stateInk : colors.textMuted,
        });
        handles.tiles.push({ g, rect });
        label(root, centerOf(pos, n), NUM_Y, String(pos), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      });

      // 괄호 — 이번 질의가 들여다보는 자리
      const range = bracketOf(scene);
      if (range && cur) {
        const g = node('g', {}, root);
        const x1 = leftOf(range[0], n);
        const x2 = rightOf(range[1], n);
        if (cur.mode === 'narrowed' && cur.outer) {
          // 앞 열이 맞는 덩어리 — 둘째 열이 그 안에서 더 좁힌다
          const o1 = leftOf(cur.outer[0], n);
          const o2 = rightOf(cur.outer[1], n);
          const dashed = { stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' };
          const oy = BRACKET_Y + 5;
          node('line', { x1: o1, y1: oy, x2: o2, y2: oy, ...dashed }, g);
          node('line', { x1: o1, y1: oy, x2: o1, y2: BRACKET_Y - 7, ...dashed }, g);
          node('line', { x1: o2, y1: oy, x2: o2, y2: BRACKET_Y - 7, ...dashed }, g);
        }
        const stroke = { stroke: colors.primary, 'stroke-width': 2, 'stroke-linecap': 'butt' };
        handles.bracketLine = node('line', { x1, y1: BRACKET_Y, x2, y2: BRACKET_Y, ...stroke }, g);
        handles.bracketLeft = node('line', { x1, y1: BRACKET_Y, x2: x1, y2: BRACKET_Y - 7, ...stroke }, g);
        handles.bracketRight = node('line', { x1: x2, y1: BRACKET_Y, x2, y2: BRACKET_Y - 7, ...stroke }, g);
        if (cur.mode !== 'shown') {
          handles.bracketLabel = label(
            g,
            (x1 + x2) / 2,
            BRACKET_LABEL_Y,
            t('label.scanned', 'Entries scanned: {n}', { n: cur.examined.length }),
            { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
          );
        }
        handles.bracket = g;
      }

      label(root, MARGIN, CAPTION_Y, caption(scene), {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });

      // 자취 — 마친 질의마다 훑은 자리와 맞은 자리를 한 줄로 남긴다
      const miniGap = 2;
      scene.ledger.forEach((row, li) => {
        const y = LEDGER_TOP + li * LEDGER_ROW;
        const g = node('g', {}, root);
        const qd = scene.queries[row.q];
        label(g, MARGIN, y + MINI - 3, qd ? qd.id : '', {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        });
        const x0 = MARGIN + SM * 2.6;
        const seenSet = new Set(row.examined);
        const hitSet = new Set(row.hits);
        for (let pos = 1; pos <= n; pos += 1) {
          const hit = hitSet.has(pos);
          const seen = seenSet.has(pos);
          node(
            'rect',
            {
              x: x0 + (pos - 1) * (MINI + miniGap),
              y,
              width: MINI,
              height: MINI,
              rx: 2,
              fill: hit ? colors.accent : colors.bgSubtle,
              stroke: hit ? colors.accent : seen ? colors.itemComparing : colors.border,
              'stroke-width': seen && !hit ? 2 : 1,
            },
            g,
          );
        }
        label(
          g,
          x0 + n * (MINI + miniGap) + 12,
          y + MINI - 3,
          t('ledger.counts', 'Scanned: {n} · Matches: {m}', { n: row.examined.length, m: row.hits.length }),
          { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
        );
        handles.lastLedger = g;
      });

      handles.anim = node('g', {}, root);
      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      const total = Math.max(1, Math.round(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let k = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          frame(k / total);
          if (k >= total) return finish();
          k += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function setBracket(h: Handles, lo: number, hi: number): void {
      if (!h.bracketLine || !h.bracketLeft || !h.bracketRight) return;
      h.bracketLine.setAttribute('x1', String(r2(lo)));
      h.bracketLine.setAttribute('x2', String(r2(hi)));
      h.bracketLeft.setAttribute('x1', String(r2(lo)));
      h.bracketLeft.setAttribute('x2', String(r2(lo)));
      h.bracketRight.setAttribute('x1', String(r2(hi)));
      h.bracketRight.setAttribute('x2', String(r2(hi)));
    }

    function offsetTile(h: Handles, pos: number, dy: number): void {
      const tile = h.tiles[pos - 1];
      if (!tile) return;
      tile.g.setAttribute('transform', `translate(0,${r2(dy)})`);
    }

    async function animate(next: LeftmostPrefixScene, h: Handles, mine: number): Promise<void> {
      const n = next.entries.length;
      const step = next.step;
      const cur = next.current;
      if (n === 0 || !cur) return;
      const fullLo = leftOf(1, n);
      const fullHi = rightOf(n, n);

      if (step.kind === 'show') {
        // 앞 질의가 띄운 항목이 내려앉고, 괄호가 인덱스 전체로 다시 넓어진다
        const from = step.wasRange ?? [Math.ceil(n / 2), Math.ceil(n / 2)];
        const fLo = leftOf(from[0], n);
        const fHi = rightOf(from[1], n);
        await tween(SHOW_MS, mine, (p) => {
          const e = ease(p);
          for (const pos of step.wasHits) offsetTile(h, pos, -RISE * (1 - e));
          setBracket(h, lerp(fLo, fullLo, e), lerp(fHi, fullHi, e));
          if (h.sql) h.sql.setAttribute('transform', `translate(${r2(-24 * (1 - e))},0)`);
        });
        return;
      }

      if (step.kind === 'narrow') {
        // 괄호가 양쪽에서 조여 들어 이어진 한 덩어리에 멈추고, 그 안의 맞는 항목이 떠오른다
        const range = bracketOf(next);
        if (!range) return;
        const endLo = leftOf(range[0], n);
        const endHi = rightOf(range[1], n);
        const outer = cur.outer;
        const hitList = cur.hits;
        const seen = cur.examined.filter((pos) => !cur.hits.includes(pos));
        if (h.bracketLabel) h.bracketLabel.setAttribute('opacity', '0');
        for (const pos of hitList) offsetTile(h, pos, RISE);
        for (const pos of seen) h.tiles[pos - 1]?.rect.setAttribute('stroke', colors.border);
        if (h.lastLedger) h.lastLedger.setAttribute('opacity', '0');
        await tween(NARROW_MS, mine, (p) => {
          const closeEnd = 0.6;
          if (outer) {
            const oLo = leftOf(outer[0], n);
            const oHi = rightOf(outer[1], n);
            if (p < closeEnd / 2) {
              const e = ease(p / (closeEnd / 2));
              setBracket(h, lerp(fullLo, oLo, e), lerp(fullHi, oHi, e));
            } else {
              const e = ease((p - closeEnd / 2) / (closeEnd / 2));
              setBracket(h, lerp(oLo, endLo, e), lerp(oHi, endHi, e));
            }
          } else {
            const e = ease(p / closeEnd);
            setBracket(h, lerp(fullLo, endLo, e), lerp(fullHi, endHi, e));
          }
          if (p >= closeEnd) for (const pos of seen) h.tiles[pos - 1]?.rect.setAttribute('stroke', colors.itemComparing);
          const rp = ease((p - closeEnd) / (1 - closeEnd));
          for (const pos of hitList) offsetTile(h, pos, RISE * (1 - rp));
        });
        return;
      }

      if (step.kind === 'scan') {
        // 괄호는 전체 그대로 — 훑는 눈금이 처음부터 끝까지 지나가며 맞는 항목을 곳곳에서 띄운다
        const cursor = node(
          'line',
          {
            x1: centerOf(1, n),
            y1: TILE_TOP - RISE - 6,
            x2: centerOf(1, n),
            y2: TILE_TOP + TILE_H + 4,
            stroke: colors.itemComparing,
            'stroke-width': 2,
          },
          h.anim,
        );
        if (h.bracketLabel) h.bracketLabel.setAttribute('opacity', '0');
        if (h.lastLedger) h.lastLedger.setAttribute('opacity', '0');
        const hitSet = new Set(cur.hits);
        const seenSet = new Set(cur.examined);
        const passAt = (pos: number): number => (pos - 1) / Math.max(1, n - 1);
        const sweepEnd = 0.8;
        await tween(SCAN_MS, mine, (p) => {
          const sweep = Math.min(1, p / sweepEnd);
          const x = lerp(centerOf(1, n), centerOf(n, n), sweep);
          cursor.setAttribute('x1', String(r2(x)));
          cursor.setAttribute('x2', String(r2(x)));
          for (let pos = 1; pos <= n; pos += 1) {
            const tile = h.tiles[pos - 1];
            if (!tile) continue;
            const passed = sweep >= passAt(pos) - 1e-9;
            if (hitSet.has(pos)) {
              const local = ease((p - sweepEnd * passAt(pos)) / (1 - sweepEnd));
              offsetTile(h, pos, RISE * (1 - local));
            } else if (seenSet.has(pos)) {
              tile.rect.setAttribute('stroke', passed ? colors.itemComparing : colors.border);
              tile.rect.setAttribute('stroke-width', passed ? '2' : '1');
            }
          }
        });
      }
    }

    return {
      render(next: LeftmostPrefixScene, _prev: LeftmostPrefixScene | null, opts: { animate: boolean }): Promise<void> | void {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate || next.step.kind === 'none') return;
        return animate(next, h, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
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
