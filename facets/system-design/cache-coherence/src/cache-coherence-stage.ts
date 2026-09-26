/**
 * 캐시 일관성 무대.
 *
 * 위 — 서버 넷의 캐시 칸(쓰는 서버에 표지). 가운데 — DB 하나. 아래 — 줄 셋:
 * 건너간 통 · DB 에 간 읽기 · 옛값 읽기. 한 칸 = 하나, 세 줄이 같은 칸 폭을 쓴다(축은 algorithm 이 사다리 전체에서 셈해 싣는다).
 *
 * 운동:
 *   쓰기 — 쓰는 서버 칸에서 DB 로 점이 내려가 DB 값이 바뀌고, 통이 다른 서버로 건너간다.
 *          갱신 통은 값을 싣고 날아 받은 칸의 값을 바꾸고, 무효화 통은 값 없이 날아 받은 칸을 비운다.
 *          통 하나마다 통 줄에 한 칸이 자라난다.
 *   읽기 — 빈 칸이면 DB 에서 화살이 올라와 칸을 채우고 DB 읽기 줄이 한 칸 자란다.
 *          돌려준 값이 옛값이면 칸 테두리가 붉어지고 옛값 줄이 한 칸 자란다.
 *   판 머리 — 줄은 비우고, 앞 판이 닿은 길이를 점선 틀로 남긴다(자리만, 값 글자는 없다).
 *
 * 무대는 판정(누가 통을 받나 · 옛값인가 · DB 에 갔나)을 다시 하지 않는다 — payload 로 받는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type CoherenceSetup = {
  servers: string[];
  writer: number;
  readers: number[];
  key: string;
  db: number;
  cache: (number | null)[];
  run: number;
  rounds: number;
  tileAxis: number;
};

export type CoherenceWrite = {
  round: number;
  index: number;
  run: number;
  writer: number;
  db: number;
  targets: number[];
  carry: number | null;
  cache: (number | null)[];
  messages: number;
  dbReads: number;
  staleReads: number;
};

export type CoherenceRead = {
  round: number;
  reader: number;
  value: number;
  db: number;
  refill: boolean;
  stale: boolean;
  cache: (number | null)[];
  messages: number;
  dbReads: number;
  staleReads: number;
};

export type CoherenceStage = ViewInstance & {
  setup(s: CoherenceSetup): void;
  write(w: CoherenceWrite, durationMs: number): void;
  read(r: CoherenceRead, durationMs: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 400;

const BOX_TOP = 44;
const BOX_H = 104;
const CELL_TOP = BOX_TOP + 32;
const CELL_H = 38;
const DB_TOP = 206;
const DB_H = 52;
const DB_W = 200;
const ROW_TOP = 290;
const ROW_H = 22;
const ROW_GAP = 14;
const ROW_X = 132;
const ROW_END = W - 24;

type Row = { name: 'messages' | 'dbReads' | 'staleReads'; y: number; tiles: SVGRectElement[]; ghost: SVGRectElement };

type ServerNode = {
  box: SVGRectElement;
  cell: SVGRectElement;
  value: SVGTextElement;
  empty: SVGTextElement;
  said: SVGTextElement;
  cx: number;
};

type Tween = { frame: number | null; start: number; dur: number; draw: (p: number) => void; done?: () => void };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export const cacheCoherenceStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const root = el('g', {}, svg);
    const live = new Set<Tween>();
    let destroyed = false;

    // 판 사이에 남기는 것 — 앞 판이 닿은 줄 길이(자리)만.
    let reached: Record<Row['name'], number> | null = null;

    let setupData: CoherenceSetup | null = null;
    let servers: ServerNode[] = [];
    let rows: Row[] = [];
    let unit = 0;
    let caption: SVGTextElement | null = null;
    let dbValue: SVGTextElement | null = null;
    let transient: SVGGElement | null = null;

    function animate(dur: number, draw: (p: number) => void, done?: () => void): void {
      if (destroyed || isInstant() || dur <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        done?.();
        return;
      }
      const tw: Tween = { frame: null, start: -1, dur, draw, done };
      live.add(tw);
      draw(0);
      const tick = (now: number): void => {
        if (tw.start < 0) tw.start = now;
        const p = Math.min(1, (now - tw.start) / tw.dur);
        tw.draw(ease(p));
        if (p < 1) {
          tw.frame = requestAnimationFrame(tick);
        } else {
          tw.frame = null;
          live.delete(tw);
          tw.done?.();
        }
      };
      tw.frame = requestAnimationFrame(tick);
    }

    /** 돌던 운동을 끝 상태로 건너뛴다(걷히던 통도 지운다). */
    function settleAll(): void {
      for (const tw of [...live]) {
        if (tw.frame !== null) cancelAnimationFrame(tw.frame);
        tw.frame = null;
        live.delete(tw);
        tw.draw(1);
        tw.done?.();
      }
    }

    /** 돌던 운동을 끊고 버린다(무대를 다시 지을 때). */
    function dropAll(): void {
      for (const tw of live) if (tw.frame !== null) cancelAnimationFrame(tw.frame);
      live.clear();
    }

    params.onScrubStart?.(() => settleAll());

    function need(): { s: CoherenceSetup; tr: SVGGElement } {
      if (!setupData || !transient) throw new Error('cache-coherence-stage: setup 전에 걸음이 왔다');
      return { s: setupData, tr: transient };
    }

    function server(i: number): ServerNode {
      const node = servers[i];
      if (!node) throw new Error(`cache-coherence-stage: 서버 ${i} 가 무대에 없다`);
      return node;
    }

    function paintCell(i: number, value: number | null): void {
      const node = server(i);
      if (value === null) {
        node.value.textContent = '';
        node.empty.setAttribute('display', 'inline');
        node.cell.setAttribute('stroke-dasharray', '4 3');
        node.cell.setAttribute('fill', c.bg);
      } else {
        node.value.textContent = String(value);
        node.empty.setAttribute('display', 'none');
        node.cell.removeAttribute('stroke-dasharray');
        node.cell.setAttribute('fill', c.bg);
      }
    }

    function cellsFrom(cache: (number | null)[], skip: Set<number>): void {
      const s = need().s;
      if (cache.length !== s.servers.length) throw new Error('cache-coherence-stage: 캐시 길이가 서버 수와 다르다');
      cache.forEach((v, i) => {
        if (!skip.has(i)) paintCell(i, v);
      });
    }

    function serverName(s: CoherenceSetup, i: number): string {
      const name = s.servers[i];
      if (name === undefined) throw new Error(`cache-coherence-stage: 서버 ${i} 의 이름이 없다`);
      return name;
    }

    function row(name: Row['name']): Row {
      const r = rows.find((x) => x.name === name);
      if (!r) throw new Error(`cache-coherence-stage: 줄 ${name} 가 무대에 없다`);
      return r;
    }

    /** 줄을 n 칸으로 기른다. 새 칸은 폭이 0 에서 자란다. */
    function grow(name: Row['name'], count: number, dur: number, style: 'fill' | 'outline'): void {
      const r = row(name);
      if (count < r.tiles.length) throw new Error(`cache-coherence-stage: ${name} 줄이 줄어들 수 없다`);
      const tone = name === 'messages' ? c.primary : name === 'dbReads' ? c.itemComparing : c.danger;
      const w = Math.max(1, unit - 2);
      while (r.tiles.length < count) {
        const x = ROW_X + r.tiles.length * unit + 1;
        const tile = el(
          'rect',
          {
            x,
            y: r.y + 2,
            width: 0,
            height: ROW_H - 4,
            rx: 1.5,
            fill: style === 'fill' ? tone : c.bg,
            stroke: tone,
            'stroke-width': style === 'fill' ? 0 : 1.2,
          },
          root,
        );
        r.tiles.push(tile);
        animate(dur, (p) => tile.setAttribute('width', String(w * p)));
      }
    }

    function slot(cache: (number | null)[], i: number): number | null {
      if (!Number.isInteger(i) || i < 0 || i >= cache.length) {
        throw new Error(`cache-coherence-stage: 캐시 칸 ${i} 가 payload 에 없다`);
      }
      return cache[i] as number | null;
    }

    function clearTransient(writer: number): void {
      if (transient) transient.replaceChildren();
      servers.forEach((node, i) => {
        node.box.setAttribute('stroke', i === writer ? c.text : c.border);
        node.cell.setAttribute('stroke', c.border);
        node.cell.setAttribute('stroke-width', '1.4');
      });
    }

    function build(s: CoherenceSetup): void {
      dropAll();
      root.replaceChildren();
      servers = [];
      rows = [];
      setupData = s;
      if (s.cache.length !== s.servers.length) throw new Error('cache-coherence-stage: 캐시 길이가 서버 수와 다르다');
      if (s.tileAxis < 1) throw new Error('cache-coherence-stage: tileAxis 가 1 보다 작다');
      unit = (ROW_END - ROW_X) / s.tileAxis;

      caption = el(
        'text',
        { x: 24, y: 24, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md },
        root,
      );

      const n = s.servers.length;
      const gap = 16;
      const boxW = (W - 48 - gap * (n - 1)) / n;
      s.servers.forEach((name, i) => {
        const x = 24 + i * (boxW + gap);
        const writer = i === s.writer;
        const box = el(
          'rect',
          {
            x,
            y: BOX_TOP,
            width: boxW,
            height: BOX_H,
            rx: 6,
            fill: c.bgSubtle,
            stroke: writer ? c.text : c.border,
            'stroke-width': writer ? 2 : 1.2,
          },
          root,
        );
        el('text', { x: x + 12, y: BOX_TOP + 20, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, root)
          .textContent = name;
        if (writer) {
          el(
            'text',
            {
              x: x + boxW - 12,
              y: BOX_TOP + 20,
              'text-anchor': 'end',
              fill: c.textMuted,
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
            },
            root,
          ).textContent = t('label.writer', 'writer');
        }
        const cell = el(
          'rect',
          { x: x + 14, y: CELL_TOP, width: boxW - 28, height: CELL_H, rx: 4, fill: c.bg, stroke: c.border, 'stroke-width': 1.4 },
          root,
        );
        const value = el(
          'text',
          {
            x: x + boxW / 2,
            y: CELL_TOP + CELL_H / 2 + 6,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
          },
          root,
        );
        const empty = el(
          'text',
          {
            x: x + boxW / 2,
            y: CELL_TOP + CELL_H / 2 + 4,
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            display: 'none',
          },
          root,
        );
        empty.textContent = t('label.empty', 'empty');
        const said = el(
          'text',
          {
            x: x + boxW / 2,
            y: BOX_TOP + BOX_H - 12,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          },
          root,
        );
        servers.push({ box, cell, value, empty, said, cx: x + boxW / 2 });
      });

      const dbX = (W - DB_W) / 2;
      el('rect', { x: dbX, y: DB_TOP, width: DB_W, height: DB_H, rx: 6, fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.6 }, root);
      el('text', { x: dbX + 14, y: DB_TOP + 21, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 }, root)
        .textContent = t('label.db', 'DB');
      el('text', { x: dbX + 14, y: DB_TOP + 40, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, root)
        .textContent = s.key;
      dbValue = el(
        'text',
        {
          x: dbX + DB_W - 16,
          y: DB_TOP + DB_H / 2 + 8,
          'text-anchor': 'end',
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
        },
        root,
      );
      dbValue.textContent = String(s.db);

      const rowNames: [Row['name'], string][] = [
        ['messages', t('label.messages', 'Messages')],
        ['dbReads', t('label.dbReads', 'DB reads')],
        ['staleReads', t('label.staleReads', 'Stale reads')],
      ];
      rowNames.forEach(([name, text], i) => {
        const y = ROW_TOP + i * (ROW_H + ROW_GAP);
        el(
          'text',
          {
            x: ROW_X - 10,
            y: y + ROW_H / 2 + 4,
            'text-anchor': 'end',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
          },
          root,
        ).textContent = text;
        el('line', { x1: ROW_X, y1: y + ROW_H, x2: ROW_END, y2: y + ROW_H, stroke: c.border, 'stroke-width': 1 }, root);
        const before = reached ? reached[name] : 0;
        const ghost = el(
          'rect',
          {
            x: ROW_X,
            y,
            width: Math.max(0, before * unit),
            height: ROW_H,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '3 3',
            'stroke-width': 1,
            display: before > 0 ? 'inline' : 'none',
          },
          root,
        );
        rows.push({ name, y, tiles: [], ghost });
      });

      transient = el('g', {}, root);
      s.cache.forEach((v, i) => paintCell(i, v));
      caption.textContent = t('caption.start', 'Start value: {value}', { value: s.db });
    }

    function moveDot(dot: SVGGElement, from: [number, number], to: [number, number], bend: number, p: number): void {
      const mx = (from[0] + to[0]) / 2;
      const my = Math.max(from[1], to[1]) + bend;
      const q = 1 - p;
      const x = q * q * from[0] + 2 * q * p * mx + p * p * to[0];
      const y = q * q * from[1] + 2 * q * p * my + p * p * to[1];
      dot.setAttribute('transform', `translate(${x} ${y})`);
    }

    function envelope(parent: SVGGElement, carry: number | null): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x: -17,
          y: -11,
          width: 34,
          height: 22,
          rx: 2,
          fill: carry === null ? c.bg : c.primary,
          stroke: c.primary,
          'stroke-width': 1.5,
        },
        g,
      );
      el(
        'path',
        { d: 'M -17 -11 L 0 1 L 17 -11', fill: 'none', stroke: carry === null ? c.primary : c.textInverse, 'stroke-width': 1.2 },
        g,
      );
      if (carry !== null) {
        el(
          'text',
          {
            x: 0,
            y: 9,
            'text-anchor': 'middle',
            fill: c.textInverse,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': 600,
          },
          g,
        ).textContent = String(carry);
      }
      return g;
    }

    const inst: CoherenceStage = {
      setup(s) {
        // 되짚기 · 새 판 — 비우고 다시 짓는다(멱등). 앞 판이 닿은 길이만 자리로 남긴다.
        if (rows.length > 0) {
          reached = {
            messages: row('messages').tiles.length,
            dbReads: row('dbReads').tiles.length,
            staleReads: row('staleReads').tiles.length,
          };
        }
        build(s);
      },

      write(w, dur) {
        settleAll();
        const { s, tr } = need();
        clearTransient(s.writer);
        if (w.writer !== s.writer) throw new Error('cache-coherence-stage: 쓰는 서버가 판 머리와 다르다');
        const src = server(w.writer);
        if (!caption || !dbValue) throw new Error('cache-coherence-stage: 무대가 지어지지 않았다');
        caption.textContent = `${t('caption.write', 'Round {k} · write {i}/{run}', { k: w.round, i: w.index, run: w.run })}  ·  ${t(
          'caption.writeSent',
          'Messages from this write: {n}',
          { n: w.targets.length },
        )}`;
        for (const node of servers) node.said.textContent = '';

        // 쓰는 서버 칸이 바뀌고 점이 DB 로 내려간다(write-through).
        paintCell(w.writer, slot(w.cache, w.writer));
        const from: [number, number] = [src.cx, CELL_TOP + CELL_H];
        const dbTop: [number, number] = [W / 2, DB_TOP];
        const dot = el('g', {}, tr);
        el('circle', { r: 5, fill: c.textMuted }, dot);
        const dbv = dbValue;
        animate(
          dur * 0.5,
          (p) => moveDot(dot, from, dbTop, 0, p),
          () => {
            dbv.textContent = String(w.db);
            dot.remove();
          },
        );

        // 통이 건너간다 — 받은 칸은 도착에 맞춰 바뀐다.
        const pending = new Set(w.targets);
        for (const target of w.targets) {
          if (target === w.writer) throw new Error('cache-coherence-stage: 쓰는 서버가 제게 통을 보냈다');
          const dst = server(target);
          const env = envelope(tr, w.carry);
          const a: [number, number] = [src.cx, CELL_TOP + CELL_H / 2];
          const b: [number, number] = [dst.cx, CELL_TOP + CELL_H / 2];
          animate(
            dur,
            (p) => moveDot(env, a, b, 110, p),
            () => {
              env.remove();
              paintCell(target, slot(w.cache, target));
            },
          );
        }
        cellsFrom(w.cache, new Set([...pending, w.writer]));
        grow('messages', w.messages, dur, w.carry === null ? 'outline' : 'fill');
        grow('dbReads', w.dbReads, dur, 'fill');
        grow('staleReads', w.staleReads, dur, 'fill');
      },

      read(r, dur) {
        settleAll();
        const { s, tr } = need();
        clearTransient(s.writer);
        if (!s.readers.includes(r.reader)) throw new Error(`cache-coherence-stage: 서버 ${r.reader} 는 읽는 차례에 없다`);
        const node = server(r.reader);
        if (!caption) throw new Error('cache-coherence-stage: 무대가 지어지지 않았다');
        caption.textContent = t('caption.read', 'Round {k} · {server} reads', { k: r.round, server: serverName(s, r.reader) });
        node.box.setAttribute('stroke', c.itemActive);
        node.said.setAttribute('fill', r.stale ? c.danger : c.text);
        const said = r.refill
          ? t('caption.readRefill', 'from DB → {value}', { value: r.value })
          : t('caption.readValue', 'read → {value}', { value: r.value });
        node.said.textContent = r.stale ? `${said} · ${t('label.stale', 'stale')}` : said;
        node.cell.setAttribute('stroke', r.stale ? c.danger : c.border);
        node.cell.setAttribute('stroke-width', r.stale ? '2.4' : '1.4');

        if (r.refill) {
          // DB 에서 화살이 올라와 빈 칸을 채운다.
          const a: [number, number] = [W / 2 + (node.cx - W / 2) * 0.25, DB_TOP];
          const b: [number, number] = [node.cx, BOX_TOP + BOX_H + 2];
          const line = el('line', { x1: a[0], y1: a[1], x2: a[0], y2: a[1], stroke: c.itemComparing, 'stroke-width': 2.4 }, tr);
          const head = el('path', { d: 'M -6 6 L 0 -4 L 6 6 Z', fill: c.itemComparing }, tr);
          const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90;
          animate(
            dur,
            (p) => {
              const x = a[0] + (b[0] - a[0]) * p;
              const y = a[1] + (b[1] - a[1]) * p;
              line.setAttribute('x2', String(x));
              line.setAttribute('y2', String(y));
              head.setAttribute('transform', `translate(${x} ${y}) rotate(${angle})`);
            },
            () => paintCell(r.reader, slot(r.cache, r.reader)),
          );
          cellsFrom(r.cache, new Set([r.reader]));
        } else {
          cellsFrom(r.cache, new Set());
        }
        grow('messages', r.messages, dur, 'fill');
        grow('dbReads', r.dbReads, dur, 'fill');
        grow('staleReads', r.staleReads, dur, 'fill');
      },

      reset() {
        dropAll();
        root.replaceChildren();
        servers = [];
        rows = [];
        reached = null;
        setupData = null;
        caption = null;
        dbValue = null;
        transient = null;
      },

      destroy() {
        destroyed = true;
        dropAll();
        root.remove();
      },
    };
    return inst;
  },
};
