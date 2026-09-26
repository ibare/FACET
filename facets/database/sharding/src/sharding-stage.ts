/**
 * sharding stage — 샤드 기둥 · 떨어지는 새 줄 · 부챗살로 퍼지거나 한 곳으로 가는 범위 질의 화살 · 답 모음 칸.
 *
 * 운동 (손잡이를 돌리면 무엇이 옮겨 가는가):
 *   layout  앞 판의 줄은 기둥 바닥으로 가라앉아 사라지고, 기둥이 새 샤드 수로 자리를 옮겨 다시 늘어선다
 *           (벌어지거나 좁혀지고, 늘어난 기둥은 바닥에서 솟고 줄어든 기둥은 내려앉는다).
 *           앞 판의 줄이 새 판의 샤드로 옮겨 가는 그림은 두지 않는다 — 재배치로 읽힌다.
 *   route   새 줄 하나가 들어오는 자리에서 제 기둥 위로 가 떨어져 쌓인다 — 해시는 기둥을 돌아가며, 구간은 한 기둥만 솟는다.
 *   query   범위 질의에서 연 샤드마다 화살이 뻗는다 — 해시는 부챗살, 구간은 한 줄기.
 *   share   범위 안의 줄이 기둥에서 떠나 답 칸으로 모인다.
 *
 * 무대는 셈하지 않는다 — 쓰기 수 · 연 샤드 · 샤드별 답 줄 · 몫 · 가장 바쁜 샤드는 payload 로 받는다.
 * 운동 길이는 부르는 쪽(projector)이 재생 속도로 나눠 넘긴다. 각 메서드는 운동이 끝나면 풀리는 Promise 를 돌려준다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageBound = { shard: number; lo: number; hi: number | null };
export type LayoutView = {
  mode: number;
  shards: number;
  table: string;
  key: string;
  width: number;
  count: number;
  bounds: StageBound[];
};
export type RouteView = { index: number; key: number; shard: number; load: number[] };
export type QueryView = {
  lo: number;
  hi: number;
  shards: number;
  keys: { key: number; shard: number }[];
  opened: number[];
  touched: number;
};
export type ShareView = {
  rows: number;
  perShard: number[];
  load: number[];
  top: number;
  share: number;
  busiest: number[];
  count: number;
};

/** projector 가 부르는 구조적 표면. */
export type ShardingStage = {
  layout(p: LayoutView, ms: number): Promise<void>;
  route(p: RouteView, ms: number): Promise<void>;
  query(p: QueryView, ms: number): Promise<void>;
  share(p: ShareView, ms: number): Promise<void>;
  clear(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 476;
const MARGIN = 24;
const COL_TOP = 104;
const COL_AREA = 216;
const COL_BOTTOM = COL_TOP + COL_AREA + 4;
const TRAY_Y = COL_BOTTOM + 70;
const QUERY_BOX = { cx: 380, y: 30, w: 150, h: 40 };
const INLET = { x: MARGIN, y: 38 };

type Column = {
  shard: number;
  g: SVGGElement;
  frame: SVGRectElement;
  name: SVGTextElement;
  bound: SVGTextElement;
  head: SVGTextElement;
  cx: number;
  w: number;
  writes: number;
};

type Block = { key: number; shard: number; g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; x: number; y: number };

type Running = { finish(): void };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export const shardingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const xsPx = parseFloat(fontSizes.xs);

    // ── 움직임 — rAF 로 돌리고, 새 걸음이 오면 앞 움직임을 끝 모습으로 마친다
    const running = new Set<Running>();
    const raf: (cb: () => void) => void =
      typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16);
    const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tween = (ms: number, step: (k: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        const start = clock();
        let done = false;
        const run: Running = {
          finish() {
            if (done) return;
            done = true;
            clearTimeout(guard);
            running.delete(run);
            step(1);
            resolve();
          },
        };
        // rAF 가 멈춘 탭 · 테스트에서도 풀리도록 시간이 차면 끝낸다
        const guard = setTimeout(() => run.finish(), ms + 40);
        running.add(run);
        const frame = (): void => {
          if (done) return;
          const k = Math.min(1, (clock() - start) / Math.max(1, ms));
          step(ease(k));
          if (k >= 1) run.finish();
          else raf(frame);
        };
        raf(frame);
      });
    const finishAll = (): void => {
      for (const r of [...running]) r.finish();
    };

    // ── 층
    const titleLayer = el('g');
    const colLayer = el('g');
    const arrowLayer = el('g');
    const blockLayer = el('g');
    const trayLayer = el('g');
    const overLayer = el('g');
    svg.append(titleLayer, colLayer, arrowLayer, blockLayer, trayLayer, overLayer);

    const text = (x: number, y: number, size: string, fill: string, anchor = 'start', family: string = fonts.body): SVGTextElement =>
      el('text', { x, y, 'font-size': size, 'font-family': family, fill, 'text-anchor': anchor });

    // 표 이름과 나누는 규칙 — 한 줄에 이어 쓴다
    const headLine = text(MARGIN, 20, fontSizes.md, c.text, 'start', fonts.mono);
    const tableText = el('tspan', { 'font-weight': 600 });
    const ruleText = el('tspan', { dx: 12, fill: c.textMuted });
    headLine.append(tableText, ruleText);
    const inletLabel = text(INLET.x, INLET.y + 8, fontSizes.xs, c.textMuted);
    const caption = text(W / 2, H - 12, fontSizes.md, c.text, 'middle');
    titleLayer.append(headLine, inletLabel, caption);

    let cols: Column[] = [];
    let blocks: Block[] = [];
    let now: LayoutView | null = null;
    let queryG: SVGGElement | null = null;

    const slotH = (): number => {
      if (!now) throw new Error('sharding-stage: layout 전이다');
      // 기둥 위쪽에 쓰기 수 한 줄 자리를 남긴다 — 줄이 가득 차도 화살 끝과 겹치지 않게
      return Math.min(18, (COL_AREA - 18) / now.count);
    };
    const geometry = (n: number, i: number): { cx: number; w: number } => {
      const slot = (W - 2 * MARGIN) / n;
      return { cx: MARGIN + slot * (i + 0.5), w: Math.min(112, slot * 0.66) };
    };
    const blockY = (level: number): number => COL_BOTTOM - 2 - (level + 1) * slotH();
    const shardColor = (shard: number): string => {
      if (!now) throw new Error('sharding-stage: layout 전이다');
      const pal = categorical(now.shards, 'vivid');
      const col = pal[shard];
      if (col === undefined) throw new Error(`sharding-stage: 모르는 샤드 ${shard}`);
      return col;
    };
    const colOf = (shard: number): Column => {
      const col = cols.find((x) => x.shard === shard);
      if (!col) throw new Error(`sharding-stage: 샤드 ${shard} 기둥이 없다`);
      return col;
    };

    const placeColumn = (col: Column, cx: number, w: number, rise: number): void => {
      col.cx = cx;
      col.w = w;
      col.g.setAttribute('transform', `translate(${cx},0)`);
      const hgt = (COL_BOTTOM - COL_TOP) * rise;
      col.frame.setAttribute('x', String(-w / 2));
      col.frame.setAttribute('width', String(w));
      col.frame.setAttribute('y', String(COL_BOTTOM - hgt));
      col.frame.setAttribute('height', String(hgt));
    };

    const makeColumn = (shard: number): Column => {
      const g = el('g');
      const frame = el('rect', { rx: 4, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1.5 });
      const head = text(0, COL_BOTTOM - 8, fontSizes.sm, c.text, 'middle');
      const name = text(0, COL_BOTTOM + 18, fontSizes.sm, c.text, 'middle');
      name.setAttribute('font-weight', '600');
      const bound = text(0, COL_BOTTOM + 34, fontSizes.xs, c.textMuted, 'middle', fonts.mono);
      g.append(frame, name, bound);
      colLayer.append(g);
      overLayer.append(head);
      return { shard, g, frame, name, bound, head, cx: 0, w: 0, writes: 0 };
    };

    const setHead = (col: Column, writes: number, y: number): void => {
      col.writes = writes;
      col.head.textContent = t('label.writes', 'Writes: {n}', { n: writes });
      col.head.setAttribute('x', String(col.cx));
      col.head.setAttribute('y', String(y));
    };

    const clearQuery = (): void => {
      queryG?.remove();
      queryG = null;
      arrowLayer.replaceChildren();
      trayLayer.replaceChildren();
    };

    const instance: ShardingStage & ViewInstance = {
      async layout(p, ms) {
        finishAll();
        clearQuery();
        const prevCols = cols;
        const prevBlocks = blocks;
        now = p;
        blocks = [];
        inletLabel.textContent = t('label.newRow', 'New row');

        tableText.textContent = p.table;
        const rule =
          p.mode === 0
            ? t('label.ruleHash', '{key} mod {n}', { key: p.key, n: p.shards })
            : t('label.ruleRange', '{key}: range width {w}', { key: p.key, w: p.width });
        ruleText.textContent = rule;
        caption.textContent =
          p.mode === 0
            ? t('caption.layoutHash', 'Hash split: each new row goes to the shard numbered {key} mod {n}.', {
                key: p.key,
                n: p.shards,
              })
            : t('caption.layoutRange', 'Range split: each shard takes one run of {key} values; the last run has no end.', {
                key: p.key,
              });

        // 기둥 — 같은 번호는 자리를 옮기고, 새 번호는 솟고, 없어진 번호는 내려앉는다
        const kept: Column[] = [];
        const from = new Map<number, { cx: number; w: number }>();
        for (const b of p.bounds) {
          const old = prevCols.find((x) => x.shard === b.shard);
          const col = old ?? makeColumn(b.shard);
          if (old) from.set(b.shard, { cx: old.cx, w: old.w });
          col.frame.setAttribute('stroke', c.border);
          col.head.setAttribute('fill', c.text);
          col.head.setAttribute('font-weight', '400');
          col.name.textContent = t('label.shard', 'Shard {n}', { n: b.shard });
          col.bound.textContent =
            p.mode === 0
              ? t('label.boundHash', 'mod {n} = {s}', { n: p.shards, s: b.shard })
              : b.hi === null
                ? t('label.boundOpen', '{lo}..∞', { lo: b.lo })
                : t('label.boundRange', '{lo}..{hi}', { lo: b.lo, hi: b.hi });
          kept.push(col);
        }
        const leaving = prevCols.filter((x) => !p.bounds.some((b) => b.shard === x.shard));
        cols = kept;

        const targets = kept.map((_col, i) => geometry(p.shards, i));
        const leaveFrom = leaving.map((col) => ({ cx: col.cx, w: col.w }));
        const sinkFrom = prevBlocks.map((b) => ({ y: b.y, h: Number(b.rect.getAttribute('height')) }));
        for (const col of leaving) col.head.remove();

        await tween(ms, (k) => {
          kept.forEach((col, i) => {
            const to = targets[i];
            const f = from.get(col.shard);
            if (f) placeColumn(col, lerp(f.cx, to.cx, k), lerp(f.w, to.w, k), 1);
            else placeColumn(col, to.cx, to.w, k);
            setHead(col, 0, COL_BOTTOM - 8);
          });
          leaving.forEach((col, i) => placeColumn(col, leaveFrom[i].cx, leaveFrom[i].w, 1 - k));
          // 앞 판의 줄은 제 기둥 바닥으로 가라앉는다 (다른 샤드로 옮겨 가지 않는다)
          prevBlocks.forEach((b, i) => {
            const s = sinkFrom[i];
            const hgt = s.h * (1 - k);
            const y = lerp(s.y, COL_BOTTOM - 2, k);
            b.rect.setAttribute('y', String(y));
            b.rect.setAttribute('height', String(Math.max(0, hgt)));
            b.label.setAttribute('opacity', String(1 - k));
          });
        });
        for (const col of leaving) col.g.remove();
        for (const b of prevBlocks) b.g.remove();
      },

      async route(p, ms) {
        finishAll();
        if (!now) throw new Error('sharding-stage: layout 전에 route 가 왔다');
        const col = colOf(p.shard);
        const writes = p.load[p.shard];
        if (writes === undefined) throw new Error(`sharding-stage: load 에 샤드 ${p.shard} 가 없다`);
        const bw = col.w - 10;
        const bh = slotH() - 2;
        const g = el('g');
        const rect = el('rect', { width: bw, height: bh, rx: 2, fill: shardColor(p.shard), stroke: c.bg, 'stroke-width': 0.5 });
        const label = text(0, 0, fontSizes.xs, c.stateInk, 'middle', fonts.mono);
        label.textContent = String(p.key);
        g.append(rect, label);
        blockLayer.append(g);
        const block: Block = { key: p.key, shard: p.shard, g, rect, label, x: 0, y: 0 };
        blocks.push(block);
        const put = (x: number, y: number): void => {
          block.x = x;
          block.y = y;
          rect.setAttribute('x', String(x - bw / 2));
          rect.setAttribute('y', String(y));
          label.setAttribute('x', String(x));
          label.setAttribute('y', String(y + bh / 2 + xsPx * 0.35));
        };
        caption.textContent = t('caption.route', 'New row {k} → shard {s}', { k: p.key, s: p.shard });

        const sx = INLET.x + bw / 2;
        const sy = INLET.y + 14;
        const hover = COL_TOP - bh - 6;
        const land = blockY(writes - 1);
        const headFrom = Number(col.head.getAttribute('y'));
        const headTo = land - 6;
        put(sx, sy);
        await tween(ms, (k) => {
          // 앞 절반은 제 기둥 위로, 뒤 절반은 떨어져 쌓인다
          if (k < 0.5) {
            const q = k / 0.5;
            put(lerp(sx, col.cx, q), lerp(sy, hover, q));
          } else {
            const q = (k - 0.5) / 0.5;
            put(col.cx, lerp(hover, land, q));
            setHead(col, writes, lerp(headFrom, headTo, q));
          }
        });
      },

      async query(p, ms) {
        finishAll();
        if (!now) throw new Error('sharding-stage: layout 전에 query 가 왔다');
        clearQuery();
        inletLabel.textContent = '';
        const box = el('g');
        const rect = el('rect', {
          x: QUERY_BOX.cx - QUERY_BOX.w / 2,
          y: QUERY_BOX.y,
          width: QUERY_BOX.w,
          height: QUERY_BOX.h,
          rx: 6,
          fill: c.bg,
          stroke: c.primary,
          'stroke-width': 1.5,
        });
        const title = text(QUERY_BOX.cx, QUERY_BOX.y + 16, fontSizes.xs, c.textMuted, 'middle');
        title.textContent = t('label.query', 'Range query');
        const range = text(QUERY_BOX.cx, QUERY_BOX.y + 32, fontSizes.sm, c.text, 'middle', fonts.mono);
        range.textContent = t('label.boundRange', '{lo}..{hi}', { lo: p.lo, hi: p.hi });
        box.append(rect, title, range);
        overLayer.append(box);
        queryG = box;

        // 범위 안의 줄에 테두리
        const inRange = new Set(p.keys.map((x) => x.key));
        for (const b of blocks) {
          if (inRange.has(b.key)) {
            b.rect.setAttribute('stroke', c.primary);
            b.rect.setAttribute('stroke-width', '2');
          }
        }
        caption.textContent = t('caption.query', 'Range query {lo}..{hi} · Shards opened: {n} / {total}', {
          lo: p.lo,
          hi: p.hi,
          n: p.touched,
          total: p.shards,
        });

        // 연 샤드마다 화살 — 해시는 부챗살, 구간은 한 줄기
        const sx = QUERY_BOX.cx;
        const sy = QUERY_BOX.y + QUERY_BOX.h;
        const paths: { path: SVGPathElement; len: number }[] = [];
        for (const s of p.opened) {
          const col = colOf(s);
          col.frame.setAttribute('stroke', c.primary);
          const ex = col.cx;
          const ey = COL_TOP - 4;
          const mx = (sx + ex) / 2;
          const my = sy + 8;
          const path = el('path', {
            d: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`,
            fill: 'none',
            stroke: c.primary,
            'stroke-width': 2,
            'marker-end': 'url(#sharding-arrow)',
          });
          const len = Math.hypot(ex - sx, ey - sy) * 1.15 + 4;
          path.setAttribute('stroke-dasharray', `${len} ${len}`);
          path.setAttribute('stroke-dashoffset', String(len));
          arrowLayer.append(path);
          paths.push({ path, len });
        }
        await tween(ms, (k) => {
          for (const { path, len } of paths) path.setAttribute('stroke-dashoffset', String(len * (1 - k)));
        });
      },

      async share(p, ms) {
        finishAll();
        if (!now) throw new Error('sharding-stage: layout 전에 share 가 왔다');
        trayLayer.replaceChildren();
        const trayLabel = text(MARGIN, TRAY_Y + 14, fontSizes.sm, c.text);
        trayLabel.textContent = t('label.answer', 'Answer rows: {n}', { n: p.rows });
        trayLayer.append(trayLabel);

        // 연 샤드마다 그 샤드에서 온 답 줄 수 (기둥 이름 아래)
        p.perShard.forEach((rows, s) => {
          if (rows === 0) return;
          const col = colOf(s);
          const tag = text(col.cx, COL_BOTTOM + 52, fontSizes.xs, c.primary, 'middle');
          tag.setAttribute('font-weight', '600');
          tag.textContent = t('label.rows', 'Rows: {n}', { n: rows });
          trayLayer.append(tag);
        });
        // 가장 바쁜 샤드 (동률이면 모두)
        for (const s of p.busiest) {
          const col = colOf(s);
          col.frame.setAttribute('stroke', c.danger);
          col.head.setAttribute('fill', c.danger);
          col.head.setAttribute('font-weight', '700');
        }
        caption.textContent = t('caption.share', 'Answer rows: {rows} · Busiest shard share: {p}% (Writes: {top} / {count})', {
          rows: p.rows,
          p: p.share,
          top: p.top,
          count: p.count,
        });

        // 범위 안의 줄이 기둥을 떠나 답 칸으로 모인다 (번호 차례로)
        const moving = blocks.filter((b) => b.rect.getAttribute('stroke') === c.primary).sort((a, b) => a.key - b.key);
        if (moving.length !== p.rows) throw new Error(`sharding-stage: 범위 안의 줄 ${moving.length} ≠ 답 줄 ${p.rows}`);
        const trayX0 = MARGIN + 150;
        const slotW = Math.min(56, (W - MARGIN - trayX0) / Math.max(1, p.rows));
        const flights = moving.map((b, i) => {
          const w = Number(b.rect.getAttribute('width'));
          const hgt = Number(b.rect.getAttribute('height'));
          const g = el('g');
          const rect = el('rect', { width: slotW - 4, height: 18, rx: 2, fill: shardColor(b.shard), stroke: c.primary, 'stroke-width': 1 });
          const label = text(0, 0, fontSizes.xs, c.stateInk, 'middle', fonts.mono);
          label.textContent = String(b.key);
          g.append(rect, label);
          trayLayer.append(g);
          return { from: { x: b.x, y: b.y, w, h: hgt }, to: { x: trayX0 + slotW * (i + 0.5), y: TRAY_Y }, rect, label };
        });
        await tween(ms, (k) => {
          for (const f of flights) {
            const w = lerp(f.from.w, slotW - 4, k);
            const hgt = lerp(f.from.h, 18, k);
            const x = lerp(f.from.x, f.to.x, k);
            const y = lerp(f.from.y, f.to.y, k);
            f.rect.setAttribute('x', String(x - w / 2));
            f.rect.setAttribute('y', String(y));
            f.rect.setAttribute('width', String(w));
            f.rect.setAttribute('height', String(hgt));
            f.label.setAttribute('x', String(x));
            f.label.setAttribute('y', String(y + hgt / 2 + xsPx * 0.35));
          }
        });
      },

      clear() {
        finishAll();
        clearQuery();
        for (const col of cols) {
          col.g.remove();
          col.head.remove();
        }
        for (const b of blocks) b.g.remove();
        cols = [];
        blocks = [];
        now = null;
        caption.textContent = '';
        ruleText.textContent = '';
        tableText.textContent = '';
        inletLabel.textContent = '';
      },

      destroy() {
        finishAll();
        titleLayer.remove();
        colLayer.remove();
        arrowLayer.remove();
        blockLayer.remove();
        trayLayer.remove();
        overLayer.remove();
        defs.remove();
      },
    };

    // 화살 머리 — 고정 id (인스턴스마다 다른 id 를 두지 않는다)
    const defs = el('defs');
    const marker = el('marker', {
      id: 'sharding-arrow',
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
      orient: 'auto-start-reverse',
    });
    marker.append(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: c.primary }));
    defs.append(marker);
    svg.prepend(defs);

    return instance;
  },
};
