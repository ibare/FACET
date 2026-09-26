/**
 * 문서와 키-값 무대 — 왼쪽은 저장소, 오른쪽은 앱. 덩어리(줄 · 문서 · 값)가 저장소에서 앱으로 **들려 나온다.**
 *
 * - 표 셋에서는 세 표의 줄이, 문서에서는 문서 카드가, 키-값에서는 닫힌 값이 앱 쪽으로 옮겨 간다
 * - 키-값의 값은 저장소 안에서는 속이 보이지 않는 막대다. 앱으로 나온 뒤에야 펼쳐져 JSON 글자가 보인다
 * - 고친 것은 저장소 제자리로 내려앉는다 — 표 · 문서는 고칠 칸 하나가, 키-값은 값 통째가
 * - 담는 법이 바뀌면 같은 주문에 딸린 덩어리끼리 자리를 옮겨 새 모양이 된다 (판 사이의 짧은 옮김)
 * - 아래 줄은 같은 질의를 세 담는 법이 몇 덩어리로 치렀는지 — 알고리즘이 센 값을 그대로 그린다
 *
 * 무대는 셈을 하지 않는다. 덩어리의 내용 · 읽기 · 쓰기 수 · 가장 적은 쪽 표시는 모두 payload 로 온다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StoreTable = { name: string; columns: string[]; rows: { id: string; cells: string[]; link: number | null }[] };
export type StoreDoc = { id: string; link: number; lines: string[] };
export type StoreEntry = { id: string; key: string; link: number; size: number };
export type StoreContent = { layout: number; tables: StoreTable[]; docs: StoreDoc[]; entries: StoreEntry[] };
export type TallyCell = { layout: number; reads: number; writes: number; total: number; fewest: boolean };
export type Verdict = { field: string; found: string; hit: boolean } | null;

/** projector 가 부르는 무대의 표면. */
export type DocumentKvStage = {
  setTitle(text: string): void;
  setCaption(text: string): void;
  setCounts(reads: number, writes: number): void;
  setStore(content: StoreContent, ms: number): void;
  lift(id: string, label: string | null, ms: number): void;
  openValue(id: string, lines: string[], verdict: Verdict, ms: number): void;
  patch(id: string, chip: string, texts: string[], ms: number): void;
  putBack(id: string, lines: string[], ms: number): void;
  dimTally(): void;
  setTally(cells: TallyCell[], ms: number): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 800;
const H = 480;
const PAD = 16;
const DIVIDER_X = 440;
const APP_X = 452;
const TOP = 82;
const ROW_H = 20;
const LINE_H = 14;
const TALLY_Y = 404;
const CELL_W = 256;
const MAX_SQUARES = 8;
const SQ_X = 96;

type Chunk = {
  id: string;
  kind: 'row' | 'doc' | 'kv';
  link: number | null;
  g: SVGGElement;
  rect: SVGRectElement;
  texts: SVGTextElement[];
  home: { x: number; y: number };
  at: { x: number; y: number };
  w: number;
  h: number;
  // 키-값만
  card?: SVGGElement;
  tag?: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function place(g: SVGGElement, x: number, y: number, ms: number, opacity?: number): void {
  g.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out` : 'none';
  g.style.transform = `translate(${x}px, ${y}px)`;
  g.setAttribute('transform', `translate(${x} ${y})`);
  if (opacity !== undefined) {
    g.style.opacity = String(opacity);
    g.setAttribute('opacity', String(opacity));
  }
}

function jump(g: SVGGElement, x: number, y: number, opacity?: number): void {
  place(g, x, y, 0, opacity);
  // 시작 자리를 먼저 굳힌다 — 다음 place 가 여기서부터 옮겨 가도록
  g.getBoundingClientRect();
}

function fade(node: SVGElement, opacity: number, ms: number): void {
  node.style.transition = ms > 0 ? `opacity ${ms}ms ease-in-out` : 'none';
  node.style.opacity = String(opacity);
  node.setAttribute('opacity', String(opacity));
}

function scaleY(g: SVGGElement, dy: number, s: number, ms: number): void {
  g.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out` : 'none';
  g.style.transform = `translate(0px, ${dy}px) scale(1, ${s})`;
  g.setAttribute('transform', `translate(0 ${dy}) scale(1 ${s})`);
  const op = s < 0.5 ? '0' : '1';
  g.style.opacity = op;
  g.setAttribute('opacity', op);
}

export const documentKvStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const xs = parseFloat(fontSizes.xs);
    const charW = xs * 0.6;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const root = el('g', {}, svg);
    const text = (parent: Element, x: number, y: number, s: string, opts: Record<string, string | number> = {}): SVGTextElement => {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...opts }, parent);
      node.textContent = s;
      return node;
    };

    // ── 머리: 담는 법 · 질의, 이번 걸음
    const title = text(root, PAD, 20, '', { 'font-size': fontSizes.md, 'font-weight': 600 });
    const caption = text(root, PAD, 44, '', { fill: c.textMuted });

    // ── 두 구역
    text(root, PAD, 68, t('stage.store', 'Store'), { 'font-weight': 600 });
    text(root, APP_X, 68, t('stage.app', 'App'), { 'font-weight': 600 });
    const counts = text(root, W - PAD, 68, '', { 'text-anchor': 'end', fill: c.textMuted });
    el('line', { x1: DIVIDER_X, y1: 56, x2: DIVIDER_X, y2: TALLY_Y - 12, stroke: c.border, 'stroke-dasharray': '4 4' }, root);

    const headerLayer = el('g', {}, root);
    const chunkLayer = el('g', {}, root);
    const appLayer = el('g', {}, root);

    // ── 아래 줄: 같은 질의를 세 담는 법이 치른 덩어리 수
    const tally = el('g', {}, root);
    el('line', { x1: PAD, y1: TALLY_Y - 4, x2: W - PAD, y2: TALLY_Y - 4, stroke: c.border }, tally);
    text(tally, PAD, TALLY_Y + 16, t('stage.tally', 'Chunks this query touched, per way of storing'), { fill: c.textMuted });
    // 범례 — 채운 네모의 색이 읽기 · 쓰기
    const legend = el('g', {}, tally);
    el('rect', { x: W - PAD - 150, y: TALLY_Y + 6, width: 11, height: 11, rx: 2, fill: c.primary }, legend);
    text(legend, W - PAD - 135, TALLY_Y + 16, t('label.reads', 'Reads'), { 'font-size': fontSizes.xs, fill: c.textMuted });
    el('rect', { x: W - PAD - 70, y: TALLY_Y + 6, width: 11, height: 11, rx: 2, fill: c.accent }, legend);
    text(legend, W - PAD - 55, TALLY_Y + 16, t('label.writes', 'Writes'), { 'font-size': fontSizes.xs, fill: c.textMuted });
    const layoutName = (layout: number): string => {
      if (layout === 0) return t('label.layout.tables', 'Tables');
      if (layout === 1) return t('label.layout.documents', 'Documents');
      if (layout === 2) return t('label.layout.kv', 'Key-value');
      throw new Error(`document-kv-stage: 모르는 담는 법 ${layout}`);
    };
    const cellX = (i: number): number => PAD + i * CELL_W;
    const cells = [0, 1, 2].map((i) => {
      const g = el('g', {}, tally);
      const name = text(g, cellX(i) + 8, TALLY_Y + 50, layoutName(i));
      const squares = Array.from({ length: MAX_SQUARES }, (_, j) => {
        const sq = el('g', {}, g);
        el('rect', { x: 0, y: 0, width: 13, height: 13, rx: 2 }, sq);
        jump(sq, cellX(i) + SQ_X + j * 17, TALLY_Y + 39, 0);
        return sq;
      });
      const num = text(g, cellX(i) + SQ_X, TALLY_Y + 50, '', { 'font-family': fonts.mono, fill: c.textMuted });
      return { g, name, squares, num };
    });
    // 가장 적은 쪽 표지 — 동률이면 여럿. 표지는 칸 사이를 옮겨 다닌다
    const badges = [0, 1, 2].map(() => {
      const g = el('g', {}, tally);
      el('rect', { x: 0, y: 0, width: CELL_W - 12, height: 28, rx: 6, fill: 'none', stroke: c.primary, 'stroke-width': 2 }, g);
      text(g, CELL_W - 20, 18, t('stage.fewest', 'Fewest'), { 'text-anchor': 'end', fill: c.primary, 'font-size': fontSizes.xs, 'font-weight': 600 });
      jump(g, cellX(0), TALLY_Y + 30, 0);
      return g;
    });

    // ── 저장소 덩어리
    let chunks = new Map<string, Chunk>();
    let layoutNow: number | null = null;
    let appCursor = TOP;

    const chunkFrame = (kind: Chunk['kind'], id: string, link: number | null, w: number, h: number): Chunk => {
      const g = el('g', {}, chunkLayer);
      const rect = el('rect', { x: 0, y: 0, width: w, height: h, rx: kind === 'row' ? 2 : 6, fill: c.bgSubtle, stroke: c.border }, g);
      return { id, kind, link, g, rect, texts: [], home: { x: 0, y: 0 }, at: { x: 0, y: 0 }, w, h };
    };
    const mark = (ch: Chunk, how: 'read' | 'write' | 'none'): void => {
      const stroke = how === 'read' ? c.primary : how === 'write' ? c.accent : c.border;
      ch.rect.setAttribute('stroke', stroke);
      ch.rect.setAttribute('stroke-width', how === 'none' ? '1' : '2');
    };
    const monoLines = (parent: Element, lines: string[], x: number, y0: number): SVGTextElement[] =>
      lines.map((s, i) => {
        const node = text(parent, x, y0 + i * LINE_H, s, { 'font-family': fonts.mono, 'font-size': fontSizes.xs });
        node.setAttribute('xml:space', 'preserve');
        node.style.whiteSpace = 'pre';
        return node;
      });
    /** 덩어리의 글자를 새 것으로 — 줄 · 칸 수가 다르면 던진다. */
    const retext = (ch: Chunk, next: string[]): void => {
      if (next.length !== ch.texts.length) throw new Error(`document-kv-stage: 덩어리 ${ch.id} 의 글자 수가 다르다`);
      next.forEach((v, i) => {
        const node = ch.texts[i];
        if (node) node.textContent = v;
      });
    };
    const widthOf = (lines: string[]): number => Math.max(...lines.map((s) => s.length)) * charW + 16;

    /** 새 담는 법의 덩어리와 머리를 만든다. 자리만 정하고 옮기는 것은 부르는 쪽이 한다. */
    const build = (content: StoreContent): Map<string, Chunk> => {
      const out = new Map<string, Chunk>();
      if (content.layout === 0) {
        let x = PAD;
        let y = TOP;
        let rowBottom = TOP;
        for (const table of content.tables) {
          const colW = table.columns.map((col, i) =>
            Math.max(col.length, ...table.rows.map((r) => {
              const cell = r.cells[i];
              if (cell === undefined) throw new Error(`document-kv-stage: ${r.id} 에 ${col} 칸이 없다`);
              return cell.length;
            })) * charW + 14,
          );
          const tw = colW.reduce((a, b) => a + b, 0);
          if (x + tw > DIVIDER_X - 8) {
            x = PAD;
            y = rowBottom + 14;
          }
          const hg = el('g', {}, headerLayer);
          text(hg, x, y + 10, table.name, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 });
          el('rect', { x, y: y + 16, width: tw, height: ROW_H, fill: c.bg, stroke: c.border }, hg);
          let cx = x;
          table.columns.forEach((col, i) => {
            text(hg, cx + 7, y + 16 + 14, col, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
            cx += colW[i] ?? 0;
          });
          table.rows.forEach((r, i) => {
            if (r.cells.length !== table.columns.length) throw new Error(`document-kv-stage: ${r.id} 의 칸 수가 열 수와 다르다`);
            const ch = chunkFrame('row', r.id, r.link, tw, ROW_H);
            let ox = 0;
            ch.texts = r.cells.map((s, k) => {
              const node = text(ch.g, ox + 7, 14, s, { 'font-family': fonts.mono, 'font-size': fontSizes.xs });
              ox += colW[k] ?? 0;
              return node;
            });
            ch.home = { x, y: y + 16 + ROW_H * (i + 1) };
            out.set(r.id, ch);
          });
          rowBottom = Math.max(rowBottom, y + 16 + ROW_H * (table.rows.length + 1));
          x += tw + 20;
        }
      } else if (content.layout === 1) {
        let y = TOP;
        for (const d of content.docs) {
          const w = widthOf(d.lines);
          const h = d.lines.length * LINE_H + 10;
          const ch = chunkFrame('doc', d.id, d.link, w, h);
          ch.texts = monoLines(ch.g, d.lines, 8, 15);
          ch.home = { x: PAD, y };
          out.set(d.id, ch);
          y += h + 8;
        }
      } else if (content.layout === 2) {
        const keyW = Math.max(...content.entries.map((e) => e.key.length)) * charW + 14;
        const maxSize = Math.max(...content.entries.map((e) => e.size));
        const k = Math.min(1.6, (DIVIDER_X - PAD - keyW - 16) / maxSize);
        content.entries.forEach((e, i) => {
          const g = el('g', {}, chunkLayer);
          text(g, 0, 15, e.key, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600 });
          // 닫힌 값 — 속이 보이지 않는 막대. 길이만 값 글자 길이를 따른다
          const rect = el('rect', { x: keyW, y: 3, width: e.size * k, height: 16, rx: 3, fill: c.textMuted, stroke: c.border }, g);
          const tag = text(g, keyW, 15, '', { 'font-size': fontSizes.xs, 'font-weight': 600 });
          fade(tag, 0, 0);
          const card = el('g', {}, g);
          scaleY(card, 24, 0.05, 0);
          const ch: Chunk = {
            id: e.id,
            kind: 'kv',
            link: e.link,
            g,
            rect,
            texts: [],
            home: { x: PAD, y: TOP + i * 34 },
            at: { x: 0, y: 0 },
            w: keyW + e.size * k,
            h: 22,
            card,
            tag,
          };
          out.set(e.id, ch);
        });
      } else {
        throw new Error(`document-kv-stage: 모르는 담는 법 ${content.layout}`);
      }
      return out;
    };

    const clearApp = (): void => {
      appLayer.replaceChildren();
      appCursor = TOP;
    };

    const closeCard = (ch: Chunk, ms: number): void => {
      if (!ch.card || !ch.tag) return;
      scaleY(ch.card, 24, 0.05, ms);
      fade(ch.tag, 0, ms);
      fade(ch.rect, 1, ms);
    };

    const chunkOf = (id: string): Chunk => {
      const ch = chunks.get(id);
      if (!ch) throw new Error(`document-kv-stage: 덩어리 ${id} 가 없다`);
      return ch;
    };
    const moveChunk = (ch: Chunk, x: number, y: number, ms: number, opacity?: number): void => {
      ch.at = { x, y };
      place(ch.g, x, y, ms, opacity);
    };

    const api: DocumentKvStage & ViewInstance = {
      setTitle(s) {
        title.textContent = s;
      },
      setCaption(s) {
        caption.textContent = s;
      },
      setCounts(reads, writes) {
        counts.textContent = t('stage.counts', 'Reads: {reads} · Writes: {writes}', { reads, writes });
      },

      setStore(content, ms) {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        clearApp();
        if (layoutNow === content.layout) {
          // 같은 모양 — 들려 나간 덩어리가 제자리로 돌아가고 글자는 이번 판의 자료로
          const fresh = new Map<string, string[]>();
          for (const tb of content.tables) for (const r of tb.rows) fresh.set(r.id, r.cells);
          for (const d of content.docs) fresh.set(d.id, d.lines);
          for (const ch of chunks.values()) {
            const s = fresh.get(ch.id);
            if (ch.kind !== 'kv') {
              if (!s) throw new Error(`document-kv-stage: 덩어리 ${ch.id} 의 내용이 없다`);
              retext(ch, s);
            } else {
              closeCard(ch, ms / 2);
            }
            mark(ch, 'none');
            moveChunk(ch, ch.home.x, ch.home.y, ms, 1);
          }
          return;
        }
        // 모양이 바뀐다 — 같은 주문에 딸린 덩어리끼리 자리를 옮겨 간다
        const old = chunks;
        const oldHeaders = [...headerLayer.children];
        const next = build(content);
        const firstByLink = (m: Map<string, Chunk>, link: number | null, pos: 'at' | 'home'): { x: number; y: number } | null => {
          if (link === null) return null;
          for (const ch of m.values()) if (ch.link === link) return ch[pos];
          return null;
        };
        for (const ch of next.values()) {
          const from = layoutNow === null ? null : firstByLink(old, ch.link, 'at');
          if (from) jump(ch.g, from.x, from.y, 0.3);
          else jump(ch.g, ch.home.x, ch.home.y - 14, 0);
          moveChunk(ch, ch.home.x, ch.home.y, ms, 1);
        }
        for (const ch of old.values()) {
          const to = firstByLink(next, ch.link, 'home') ?? { x: ch.at.x, y: ch.at.y + 14 };
          place(ch.g, to.x, to.y, ms, 0);
        }
        for (const h of oldHeaders) if (h instanceof SVGElement) fade(h, 0, ms);
        later(ms, () => {
          for (const ch of old.values()) ch.g.remove();
          for (const h of oldHeaders) h.remove();
        });
        chunks = next;
        layoutNow = content.layout;
      },

      lift(id, label, ms) {
        const ch = chunkOf(id);
        const y = appCursor;
        const x = label === null ? APP_X : APP_X + 72;
        if (label !== null) {
          const tag = text(appLayer, APP_X, y + 14, label, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
          fade(tag, 0, 0);
          later(ms / 2, () => fade(tag, 1, ms / 2));
        }
        appCursor += ch.h + 6;
        mark(ch, 'read');
        chunkLayer.appendChild(ch.g); // 옮겨 가는 덩어리를 맨 위로
        moveChunk(ch, x, y, ms);
      },

      openValue(id, lines, verdict, ms) {
        const ch = chunkOf(id);
        if (!ch.card || !ch.tag) throw new Error(`document-kv-stage: ${id} 는 키-값 덩어리가 아니다`);
        const y = appCursor;
        const cardW = widthOf(lines);
        const cardH = lines.length * LINE_H + 10;
        ch.h = 24 + cardH;
        appCursor += ch.h + 6;
        mark(ch, 'read');
        chunkLayer.appendChild(ch.g);
        moveChunk(ch, APP_X, y, ms * 0.55);
        const card = ch.card;
        const tag = ch.tag;
        card.replaceChildren();
        el('rect', { x: 0, y: 0, width: cardW, height: cardH, rx: 6, fill: c.bgSubtle, stroke: c.primary }, card);
        ch.texts = monoLines(card, lines, 8, 15);
        if (verdict) {
          tag.textContent = t('stage.verdict', '{field} = {found} · {verdict}', {
            field: verdict.field,
            found: verdict.found,
            verdict: verdict.hit ? t('label.match', 'match') : t('label.miss', 'no match'),
          });
          tag.setAttribute('fill', verdict.hit ? c.success : c.textMuted);
        } else {
          tag.textContent = '';
        }
        // 밖에 나온 뒤에 연다 — 저장소 안에서는 닫힌 채다
        later(ms * 0.55, () => {
          fade(ch.rect, 0, ms * 0.45);
          fade(tag, 1, ms * 0.45);
          scaleY(card, 24, 1, ms * 0.45);
        });
      },

      patch(id, chipText, texts, ms) {
        const ch = chunkOf(id);
        const chip = el('g', {}, appLayer);
        const cw = chipText.length * charW + 14;
        el('rect', { x: 0, y: 0, width: cw, height: 18, rx: 9, fill: c.bg, stroke: c.accent, 'stroke-width': 2 }, chip);
        text(chip, 7, 13, chipText, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.accent });
        jump(chip, APP_X, appCursor, 1);
        // 고칠 것 하나가 저장소 제자리로 내려앉는다
        place(chip, ch.home.x + Math.max(0, ch.w - cw) / 2, ch.home.y + Math.max(0, ch.h - 18) / 2, ms * 0.7);
        later(ms * 0.7, () => {
          retext(ch, texts);
          mark(ch, 'write');
          place(chip, ch.home.x + Math.max(0, ch.w - cw) / 2, ch.home.y + Math.max(0, ch.h - 18) / 2, ms * 0.3, 0);
        });
      },

      putBack(id, lines, ms) {
        const ch = chunkOf(id);
        if (!ch.card) throw new Error(`document-kv-stage: ${id} 는 키-값 덩어리가 아니다`);
        retext(ch, lines);
        mark(ch, 'write');
        // 값 통째가 닫혀 제자리로 내려앉는다
        later(ms * 0.35, () => {
          closeCard(ch, ms * 0.3);
          moveChunk(ch, ch.home.x, ch.home.y, ms * 0.65);
        });
      },

      dimTally() {
        // 이번 질의의 수와 결론은 판 끝에 온다 — 앞 판의 네모 · 수 · 표지를 모두 숨긴다.
        // 표지는 숨은 자리에 남아 있다가 setTally 에서 새 칸으로 옮겨 간다
        fade(tally, 0.35, 200);
        for (const badge of badges) fade(badge, 0, 200);
        for (const view of cells) {
          for (const sq of view.squares) fade(sq, 0, 200);
          view.num.textContent = '';
          view.name.setAttribute('font-weight', '400');
        }
      },

      setTally(list, ms) {
        fade(tally, 1, 200);
        let b = 0;
        list.forEach((cell) => {
          const view = cells[cell.layout];
          if (!view) throw new Error(`document-kv-stage: 모르는 담는 법 ${cell.layout}`);
          const n = cell.total;
          if (n > MAX_SQUARES) throw new Error(`document-kv-stage: 덩어리 ${n} 는 칸에 다 들어가지 않는다`);
          view.squares.forEach((sq, j) => {
            const rect = sq.firstElementChild;
            if (rect) rect.setAttribute('fill', j < cell.reads ? c.primary : c.accent);
            fade(sq, j < n ? 1 : 0, ms);
          });
          view.num.textContent = String(n);
          view.num.setAttribute('x', String(cellX(cell.layout) + SQ_X + n * 17 + 4));
          view.name.setAttribute('font-weight', cell.fewest ? '600' : '400');
          if (cell.fewest) {
            const badge = badges[b];
            if (!badge) throw new Error('document-kv-stage: 가장 적은 쪽 표지가 모자란다');
            place(badge, cellX(cell.layout), TALLY_Y + 30, ms, 1);
            b += 1;
          }
        });
        // 쓰지 않는 표지는 마지막 자리에서 숨는다
        for (; b < badges.length; b += 1) {
          const badge = badges[b];
          if (badge) fade(badge, 0, ms);
        }
      },

      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
    // 처음에는 표지를 숨긴다
    for (const badge of badges) fade(badge, 0, 0);
    return api;
  },
};
