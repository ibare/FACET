/**
 * exact-match-only 의 무대.
 *
 * 위에는 질의 글자(SQL), 가운데에는 열쇠를 값의 차례대로 놓은 줄, 아래에는 버킷 다섯(페이지 다섯).
 * 줄 위의 열쇠마다 제 버킷으로 가는 실이 걸려 있다 — 이웃한 열쇠의 실이 서로 먼 버킷으로 흩어진다.
 *
 * - `=` 질의: 열쇠 하나가 제 실을 타고 버킷 하나로 떨어지고, 그 버킷 뚜껑만 들린다
 * - 범위 질의: 줄 위에 범위가 한 덩어리로 걸리지만, 버킷은 전부 들린다. 맞은 항목은 흩어진 버킷에서
 *   줄 위의 제자리로 올라온다
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import {
  exactMatchOnlyScene,
  type ExactMatchScene,
  type ExactMatchScenePredicate,
} from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로 여백 상한. */
const MARGIN = 20;
/** 버킷 페이지 사이 틈. */
const PAGE_GAP = 14;
/** 뚜껑이 들리는 높이. */
const LID_LIFT = 6;

/** 세로 자리 — 캔버스 높이에서 나눈다. */
const Y = {
  sql: 30,
  sqlGap: 44,
  indexLabel: 122,
  axis: 168,
  bucketTop: 238,
  bucketBottom: 356,
  caption: 384,
  caption2: 406,
} as const;

/** 운동 길이 (ms). */
const MS = {
  drop: 500,
  lid: 150,
  scanRow: 110,
  rise: 300,
  bracket: 400,
} as const;

type Pt = { x: number; y: number };

type Handles = {
  lids: Map<number, SVGGElement>;
  rowMarks: Map<number, SVGRectElement>;
  axisMarks: Map<number, SVGCircleElement>;
  entryPos: Map<number, Pt>;
  axisPos: Map<number, Pt>;
  lidTop: Map<number, Pt>;
  rowBox: { x: number; w: number; h: number };
  bracket: SVGRectElement | null;
  overlay: SVGGElement;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = text;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function predicateOf(scene: ExactMatchScene, q: number): ExactMatchScenePredicate | null {
  return scene.base.predicates?.[q] ?? null;
}

export const exactMatchOnlyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const fsXs = parseFloat(fontSizes.xs);
    const fsSm = parseFloat(fontSizes.sm);
    const fsMd = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, onFrame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          timers.delete(id);
          if (mine !== gen || destroyed) {
            finish(false);
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          onFrame(ease(p));
          if (p >= 1) {
            finish(true);
            return;
          }
          id = setTimeout(tick, 16);
          timers.add(id);
        };
        let id = setTimeout(tick, 16);
        timers.add(id);
      });
    }

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    /** 장면 하나의 화면 전체를 세운다. */
    function drawStatic(scene: ExactMatchScene): Handles {
      svg.textContent = '';
      const root = el('g', {}, svg);
      const overlay = el('g', {}, svg);
      const handles: Handles = {
        lids: new Map(),
        rowMarks: new Map(),
        axisMarks: new Map(),
        entryPos: new Map(),
        axisPos: new Map(),
        lidTop: new Map(),
        rowBox: { x: 0, w: 0, h: 0 },
        bracket: null,
        overlay,
      };
      const { base } = scene;

      // 질의 글자와 그 셈
      for (let q = 0; q < scene.shown && q < base.sql.length; q += 1) {
        const y = Y.sql + q * Y.sqlGap;
        const active = !scene.done && q === scene.current;
        label(root, MARGIN, y, base.sql[q] ?? '', {
          'font-family': fonts.mono,
          'font-size': fsMd,
          fill: active ? c.text : c.textMuted,
          'font-weight': active ? 600 : 400,
        });
        const tally = scene.tallies[q];
        if (tally !== null && tally !== undefined) {
          label(
            root,
            MARGIN,
            y + 18,
            t('tally', 'Pages read: {pages} · Entries compared: {compared} · Matches: {matched}', {
              pages: tally.pages,
              compared: tally.compared,
              matched: tally.matched,
            }),
            {
              'font-family': fonts.body,
              'font-size': fsSm,
              fill: scene.done ? c.text : c.textMuted,
              'font-weight': scene.done ? 600 : 400,
            },
          );
        }
      }

      const modulus = base.modulus;
      const buckets = base.buckets;
      if (modulus === null || buckets === null) return handles;

      label(
        root,
        MARGIN,
        Y.indexLabel,
        t('label.index', 'Hash index on {table}({column}) · h(k) = k mod {m}', {
          table: base.table,
          column: base.column,
          m: modulus,
        }),
        { 'font-family': fonts.body, 'font-size': fsSm, fill: c.textMuted },
      );

      // 열쇠의 차례 줄 — 값의 크기로 자리를 잡는다
      const keys = base.entries.map((e) => e.key);
      const pred = predicateOf(scene, scene.current);
      const rangeShown = pred !== null && pred.kind === 'range' && scene.shown > scene.current;
      // 자리가 걸음마다 흔들리지 않게 모든 질의의 끝값을 처음부터 담는다
      const domain = [...keys];
      for (const p of base.predicates ?? []) {
        if (p.kind === 'range') domain.push(p.lo, p.hi);
        else domain.push(p.key);
      }
      const dMin = Math.min(...domain);
      const dMax = Math.max(...domain);
      const axisL = MARGIN + 24;
      const axisR = W - MARGIN - 24;
      const xOf = (v: number): number =>
        dMax === dMin ? (axisL + axisR) / 2 : axisL + ((v - dMin) / (dMax - dMin)) * (axisR - axisL);

      if (rangeShown && pred.kind === 'range') {
        const x0 = xOf(pred.lo);
        const x1 = xOf(pred.hi);
        handles.bracket = el(
          'rect',
          {
            x: x0 - 6,
            y: Y.axis - 26,
            width: x1 - x0 + 12,
            height: 36,
            rx: 6,
            fill: c.accent,
            'fill-opacity': 0.18,
            stroke: c.accent,
            'stroke-width': 1.5,
          },
          root,
        );
      }

      el('line', { x1: axisL - 10, y1: Y.axis, x2: axisR + 10, y2: Y.axis, stroke: c.border, 'stroke-width': 1.5 }, root);
      label(root, axisR + 10, Y.axis - 30, t('label.order', '{column} in order', { column: base.column }), {
        'font-family': fonts.body,
        'font-size': fsXs,
        fill: c.textMuted,
        'text-anchor': 'end',
      });

      // 버킷 페이지 자리
      const pageW = (W - 2 * MARGIN - PAGE_GAP * (modulus - 1)) / modulus;
      const lidH = 24;
      const maxRows = Math.max(1, ...buckets.map((b) => b.entries.length));
      const rowH = Math.min(24, (Y.bucketBottom - Y.bucketTop - lidH - 8) / maxRows);
      const pageH = lidH + maxRows * rowH + 8;
      const pageX = (b: number): number => MARGIN + b * (pageW + PAGE_GAP);
      handles.rowBox = { x: 0, w: pageW - 12, h: rowH - 4 };

      const matchedKeys = new Set(scene.matched.map((e) => e.key));
      const comparedKeys = new Set(scene.compared);
      const opened = new Set(scene.opened);

      // 실 — 줄 위의 열쇠에서 제 버킷으로
      const threads = el('g', {}, root);
      for (const bucket of buckets) {
        const n = bucket.entries.length;
        bucket.entries.forEach((e, i) => {
          const from: Pt = { x: xOf(e.key), y: Y.axis + 5 };
          const to: Pt = { x: pageX(bucket.bucket) + pageW / 2 + (i - (n - 1) / 2) * 16, y: Y.bucketTop - 2 };
          const hot = scene.hashed !== null && scene.hashed.key === e.key;
          const hit = matchedKeys.has(e.key);
          el(
            'line',
            {
              x1: from.x,
              y1: from.y,
              x2: to.x,
              y2: to.y,
              stroke: hit ? c.success : hot ? c.accent : c.border,
              'stroke-width': hit || hot ? 2 : 1,
              'stroke-opacity': hit || hot ? 1 : 0.8,
            },
            threads,
          );
        });
      }

      // 열쇠 표식 — 차례 줄 위
      for (const e of base.entries) {
        const x = xOf(e.key);
        handles.axisPos.set(e.key, { x, y: Y.axis });
        const hit = matchedKeys.has(e.key);
        const hot = scene.hashed !== null && scene.hashed.key === e.key;
        const mark = el(
          'circle',
          {
            cx: x,
            cy: Y.axis,
            r: hit ? 6 : 4.5,
            fill: hit ? c.success : hot ? c.accent : c.bg,
            stroke: hit ? c.success : hot ? c.accent : c.textMuted,
            'stroke-width': 1.5,
          },
          root,
        );
        handles.axisMarks.set(e.key, mark);
        label(root, x, Y.axis - 12, String(e.key), {
          'font-family': fonts.mono,
          'font-size': fsSm,
          fill: hit || hot ? c.text : c.textMuted,
          'font-weight': hit || hot ? 600 : 400,
          'text-anchor': 'middle',
        });
      }

      // 버킷 페이지
      for (const bucket of buckets) {
        const b = bucket.bucket;
        const x = pageX(b);
        const isOpen = opened.has(b);
        const isTarget = scene.hashed !== null && scene.hashed.bucket === b;
        const page = el('g', {}, root);
        el(
          'rect',
          {
            x,
            y: Y.bucketTop,
            width: pageW,
            height: pageH,
            rx: 4,
            fill: isOpen ? c.bg : c.bgSubtle,
            stroke: isOpen ? c.primary : isTarget ? c.accent : c.border,
            'stroke-width': isOpen || isTarget ? 2 : 1,
          },
          page,
        );
        bucket.entries.forEach((e, i) => {
          const ry = Y.bucketTop + lidH + 4 + i * rowH;
          const hit = matchedKeys.has(e.key);
          const seen = comparedKeys.has(e.key);
          const mark = el(
            'rect',
            {
              x: x + 6,
              y: ry + 2,
              width: pageW - 12,
              height: rowH - 4,
              rx: 3,
              fill: hit ? c.success : c.itemComparing,
              'fill-opacity': hit ? 0.3 : 0.22,
              opacity: hit || seen ? 1 : 0,
            },
            page,
          );
          handles.rowMarks.set(e.key, mark);
          handles.entryPos.set(e.key, { x: x + pageW / 2, y: ry + rowH / 2 });
          const ty = ry + rowH / 2 + fsSm * 0.35;
          label(page, x + 12, ty, String(e.key), {
            'font-family': fonts.mono,
            'font-size': fsSm,
            fill: isOpen ? c.text : c.textMuted,
            'font-weight': hit ? 600 : 400,
          });
          label(page, x + pageW - 12, ty, e.row, {
            'font-family': fonts.mono,
            'font-size': fsXs,
            fill: c.textMuted,
            'text-anchor': 'end',
          });
        });

        // 뚜껑 — 열리면 들린다
        const lid = el('g', { transform: `translate(0,${isOpen ? -LID_LIFT : 0})` }, page);
        el(
          'rect',
          {
            x,
            y: Y.bucketTop,
            width: pageW,
            height: lidH,
            rx: 4,
            fill: isOpen ? c.primary : isTarget ? c.accent : c.border,
            'fill-opacity': isOpen ? 0.9 : 0.6,
          },
          lid,
        );
        label(lid, x + pageW / 2, Y.bucketTop + lidH / 2 + fsSm * 0.35, t('label.bucket', 'Bucket {b}', { b }), {
          'font-family': fonts.body,
          'font-size': fsSm,
          fill: isOpen ? c.textInverse : c.text,
          'text-anchor': 'middle',
          'font-weight': 600,
        });
        handles.lids.set(b, lid);
        handles.lidTop.set(b, { x: x + pageW / 2, y: Y.bucketTop });
      }

      // 캡션 — 지금 일어나는 일
      const lines = captionOf(scene);
      lines.forEach((line, i) => {
        label(root, W / 2, i === 0 ? Y.caption : Y.caption2, line, {
          'font-family': fonts.body,
          'font-size': i === 0 ? fsMd : fsSm,
          fill: i === 0 ? c.text : c.textMuted,
          'text-anchor': 'middle',
        });
      });

      return handles;
    }

    function captionOf(scene: ExactMatchScene): string[] {
      const { base, step } = scene;
      if (base.modulus === null) return [];
      if (step === null) {
        return [t('caption.start', 'Each key goes to bucket key mod {m}.', { m: base.modulus })];
      }
      if (step.kind === 'hash') {
        return [
          t('caption.hash', '{key} mod {m} = {b}: straight to bucket {b}.', {
            key: step.key,
            m: step.modulus,
            b: step.bucket,
          }),
        ];
      }
      if (step.kind === 'read') {
        const pred = predicateOf(scene, scene.current);
        if (pred !== null && pred.kind === 'eq') {
          return [
            t('caption.eqRead', 'Only bucket {b} is read. Matches: {n}.', {
              b: step.bucket,
              n: step.matched.length,
            }),
          ];
        }
        return [
          t('caption.rangeRead', 'Bucket {b} read. Matches in it: {n}.', {
            b: step.bucket,
            n: step.matched.length,
          }),
        ];
      }
      if (step.kind === 'show') {
        const pred = predicateOf(scene, step.query);
        if (pred !== null && pred.kind === 'range') {
          return [
            t('caption.range', 'A hash keeps no order. Keys from {lo} to {hi} could be in any bucket.', {
              lo: pred.lo,
              hi: pred.hi,
            }),
          ];
        }
        if (pred !== null && pred.kind === 'eq') {
          return [t('caption.next', 'Next: look up {key}.', { key: pred.key })];
        }
        return [];
      }
      // 끝 — 두 질의의 페이지 수를 나란히
      const preds = base.predicates ?? [];
      const eqAt = preds.findIndex((p) => p.kind === 'eq');
      const rangeAt = preds.findIndex((p) => p.kind === 'range');
      const eqTally = eqAt >= 0 ? scene.tallies[eqAt] : null;
      const rangeTally = rangeAt >= 0 ? scene.tallies[rangeAt] : null;
      const out: string[] = [];
      if (eqTally && rangeTally) {
        out.push(
          t('caption.done', 'Pages read: {eq} for =, {range} for the range.', {
            eq: eqTally.pages,
            range: rangeTally.pages,
          }),
        );
      }
      if (rangeAt === scene.current) {
        out.push(
          t('caption.spread', 'Buckets holding a match: {k} of {n}.', {
            k: scene.matchedBuckets.length,
            n: base.modulus,
          }),
        );
      }
      return out;
    }

    async function animate(scene: ExactMatchScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null || step.kind === 'done') return;

      if (step.kind === 'hash') {
        // 열쇠 하나가 제 실을 타고 버킷으로 떨어진다
        const from = h.axisPos.get(step.key);
        const to = h.lidTop.get(step.bucket);
        if (from === undefined || to === undefined) return;
        const token = el('g', {}, h.overlay);
        el('circle', { cx: 0, cy: 0, r: 13, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, token);
        label(token, 0, fsSm * 0.35, String(step.key), {
          'font-family': fonts.mono,
          'font-size': fsSm,
          fill: c.text,
          'text-anchor': 'middle',
          'font-weight': 600,
        });
        const place = (p: number): void => {
          token.setAttribute(
            'transform',
            `translate(${round(from.x + (to.x - from.x) * p)},${round(from.y + (to.y - from.y) * p)})`,
          );
        };
        place(0);
        await tween(MS.drop, mine, place);
        return;
      }

      if (step.kind === 'show') {
        // 범위가 줄 위에 한 덩어리로 걸린다
        const bracket = h.bracket;
        if (bracket === null) return;
        const x = Number(bracket.getAttribute('x'));
        const w = Number(bracket.getAttribute('width'));
        const grow = (p: number): void => {
          bracket.setAttribute('width', String(round(w * p)));
        };
        bracket.setAttribute('x', String(round(x)));
        grow(0);
        await tween(MS.bracket, mine, grow);
        return;
      }

      // 버킷 하나를 연다 — 뚜껑이 들리고, 커서가 항목을 하나씩 훑는다
      const lid = h.lids.get(step.bucket);
      if (lid === undefined) return;
      const isRange = predicateOf(scene, scene.current)?.kind === 'range';
      for (const key of step.compared) h.rowMarks.get(key)?.setAttribute('opacity', '0');
      // 올라올 항목의 줄 위 표식은 아직 비어 있다 — 끝의 drawStatic 이 채운다
      const risen: Array<{ from: Pt; to: Pt }> = [];
      if (isRange) {
        for (const key of step.matched) {
          const mark = h.axisMarks.get(key);
          const from = h.entryPos.get(key);
          const to = h.axisPos.get(key);
          if (mark === undefined || from === undefined || to === undefined) continue;
          risen.push({ from, to });
          mark.setAttribute('r', '4.5');
          mark.setAttribute('fill', c.bg);
          mark.setAttribute('stroke', c.textMuted);
        }
      }
      const lift = (p: number): void => {
        lid.setAttribute('transform', `translate(0,${round(-LID_LIFT * p)})`);
      };
      lift(0);
      if (!(await tween(MS.lid, mine, lift))) return;

      const first = step.compared[0];
      const firstPos = first === undefined ? undefined : h.entryPos.get(first);
      if (firstPos !== undefined) {
        const cursor = el(
          'rect',
          {
            x: firstPos.x - h.rowBox.w / 2 - 2,
            y: firstPos.y - h.rowBox.h / 2 - 2,
            width: h.rowBox.w + 4,
            height: h.rowBox.h + 4,
            rx: 4,
            fill: 'none',
            stroke: c.itemComparing,
            'stroke-width': 2,
          },
          h.overlay,
        );
        for (let i = 0; i < step.compared.length; i += 1) {
          const key = step.compared[i];
          if (key === undefined) continue;
          const pos = h.entryPos.get(key);
          const prevKey = i > 0 ? step.compared[i - 1] : key;
          const prevPos = prevKey === undefined ? undefined : h.entryPos.get(prevKey);
          if (pos === undefined || prevPos === undefined) continue;
          const move = (p: number): void => {
            const y = prevPos.y + (pos.y - prevPos.y) * p;
            cursor.setAttribute('y', String(round(y - h.rowBox.h / 2 - 2)));
          };
          if (!(await tween(MS.scanRow, mine, move))) return;
          h.rowMarks.get(key)?.setAttribute('opacity', '1');
        }
        cursor.remove();
      }

      if (risen.length === 0) return;
      // 맞은 항목이 흩어진 버킷에서 줄 위의 제자리로 올라온다
      const dots = risen.map(({ from, to }) => ({
        from,
        to,
        dot: el('circle', { cx: from.x, cy: from.y, r: 6, fill: c.success }, h.overlay),
      }));
      const rise = (p: number): void => {
        for (const d of dots) {
          d.dot.setAttribute('cx', String(round(d.from.x + (d.to.x - d.from.x) * p)));
          d.dot.setAttribute('cy', String(round(d.from.y + (d.to.y - d.from.y) * p)));
        }
      };
      await tween(MS.rise, mine, rise);
    }

    let current: ExactMatchScene = exactMatchOnlyScene.initial(params.initialData);
    drawStatic(current);

    return {
      async render(next: ExactMatchScene, _prev: ExactMatchScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        current = next;
        const handles = drawStatic(next);
        if (!opts.animate) return;
        await animate(next, handles, mine);
        if (live(mine)) drawStatic(current);
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
