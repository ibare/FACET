/**
 * index-choice 무대.
 *
 * 세 구조(B+ 트리 · 해시 버킷 · 표 페이지)를 한 화면에 늘 두고, 길마다의 값을 가로 막대로 보인다.
 * 표 훑기 값에 세로 기준선을 그어 막대가 그 선을 넘는지가 보이게 한다.
 *
 * 운동
 *   - 값 걸음: 막대가 앞 판의 길이에서 새 길이로 자란다/준다. B+ 의 내려가기 선이 R→I1→L2 와 R→I2→L3 사이를
 *     옮겨 가고, 읽을 잎을 두른 띠가 잎 사슬을 따라 옆으로 번진다. 해시의 연 버킷 띠가 버킷 하나에서 전부로 번진다.
 *   - 고르기 걸음: "가장 쌈" 표지가 고른 길의 막대 줄로 건너가고, 읽는 점이 질의에서 출발해
 *     인덱스 페이지를 차례로 거쳐 표 페이지로 옮겨 가며 지나간 페이지를 켠다.
 *   - 쓰기 걸음: INSERT 문에서 줄기가 내려와 표 · 잎 · 버킷으로 갈라져 퍼지고, 새 항목이 자리에 들어간다
 *     (잎에서는 뒤 열쇠가 한 칸 밀린다).
 *   걸리지 않은 구조는 흐리게 자리를 지킨다 — 세로는 마운트에서 정해 바꾸지 않는다.
 *
 * 무대는 셈하지 않는다 — 값 · 읽는 차례 · 쓴 뒤의 항목은 모두 projector 가 넘긴 것을 그린다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 920;
const H = 540;

// 구역
const TREE_X0 = 20;
const TREE_X1 = 470;
const HASH_X0 = 500;
const HASH_X1 = 900;
const TOP_Y = 70;
const LEVEL_Y = [92, 138];
const LEAF_Y = 186;
const LEAF_H = 36;
const INNER_H = 26;
const INNER_W = 60;
const BUCKET_TOP = 94;
const BUCKET_H = 54;
const BUCKET_GAP_Y = 10;
const BUCKET_COLS = 4;
const TABLE_TITLE_Y = 252;
const TABLE_Y = 262;
const TABLE_H = 52;
const TRUNK_X = 485;
const SPLIT_Y = 240;
const COST_TITLE_Y = 346;
const COST_ROW_Y = [358, 390, 422];
const BAR_H = 18;
const BAR_X0 = 160;
const BAR_UNIT = 44;
const CAPTION_Y = 478;
const COUNTER_Y = 508;

export type IndexChoicePathId = 'seq' | 'btree' | 'hash';
const PATHS: IndexChoicePathId[] = ['seq', 'btree', 'hash'];

export type IndexChoiceStructure = {
  tableName: string;
  tablePages: { id: string; rows: { row: string; key: number }[] }[];
  rowsPerPage: number;
  btreeName: string;
  root: string;
  leafCapacity: number;
  treePages: { id: string; kind: 'inner' | 'leaf'; keys: number[]; children: string[]; next: string | null }[];
  hashName: string;
  bucketCount: number;
  buckets: { id: string; keys: number[] }[];
};

export type IndexChoiceWriteView = {
  page: string;
  kind: 'table' | 'leaf' | 'bucket';
  at: number;
  entries: { key: number; row: string }[];
};

/** projector 가 부르는 무대의 표면. */
export type IndexChoiceStage = {
  build(s: IndexChoiceStructure): void;
  startRound(p: { sql: string; insertSql: string; hasBtree: boolean; hasHash: boolean }, ms: number): void;
  showCost(p: { path: IndexChoicePathId; pages: number; descent: string[]; leaves: string[] }, ms: number): void;
  pick(p: { path: IndexChoicePathId; read: string[] }, ms: number): void;
  insert(p: { writes: IndexChoiceWriteView[] }, ms: number): void;
  setCaption(text: string): void;
  setCounters(read: string, written: string): void;
  clear(): void;
};

type Box = { x: number; y: number; w: number; h: number };

/** 페이지 안 항목 하나 — 자리를 옮길 수 있게 <g> 로 묶는다. */
type Entry = { key: number; row: string; g: SVGGElement; x: number; y: number; added: boolean };

type Page = {
  id: string;
  kind: 'inner' | 'leaf' | 'bucket' | 'table';
  box: Box;
  rect: SVGRectElement;
  entries: Entry[];
  original: number[];
};

type Tween = { id: number; stop: () => void };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export const indexChoiceStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const pal: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pathColor = categorical(3, 'vivid');
    const colorOf = (p: IndexChoicePathId): string => {
      const c = pathColor[PATHS.indexOf(p)];
      if (c === undefined) throw new Error(`길 색이 없다: ${p}`);
      return c;
    };
    const smPx = parseFloat(fontSizes.sm);
    const monoCharW = smPx * 0.6;
    /** 제목 글자 폭 어림 — 한글 · 한자권 글자는 1em, 나머지는 0.62em */
    const textW = (s: string): number => {
      let w = 0;
      for (const ch of s) w += /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? smPx : smPx * 0.62;
      return w;
    };
    const instant = () => params.isInstant?.() === true;

    // ── 운동 (rAF)
    const tweens = new Set<Tween>();
    let tweenSeq = 0;
    const tween = (ms: number, apply: (k: number) => void): void => {
      const hasRaf = typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';
      if (ms <= 0 || instant() || !hasRaf) {
        apply(1);
        return;
      }
      let raf = 0;
      let start: number | null = null;
      const tw: Tween = { id: (tweenSeq += 1), stop: () => cancelAnimationFrame(raf) };
      tweens.add(tw);
      const frame = (now: number) => {
        if (start === null) start = now;
        const k = Math.min(1, Math.max(0, (now - start) / ms));
        apply(ease(k));
        if (k < 1) raf = requestAnimationFrame(frame);
        else tweens.delete(tw);
      };
      raf = requestAnimationFrame(frame);
    };
    const stopAll = () => {
      for (const tw of tweens) tw.stop();
      tweens.clear();
    };

    const root = el('g', { 'font-family': fonts.body, 'font-size': fontSizes.sm }, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: pal.bg }, root);

    // 머리 두 줄 — 질의와 쓰기
    const head = el('g', {}, root);
    const queryLabel = el('text', { x: 20, y: 30, fill: pal.textMuted }, head);
    queryLabel.textContent = t('label.query', 'Query');
    const querySql = el('text', { x: 90, y: 30, fill: pal.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600 }, head);
    const writeG = el('g', { opacity: 0.35 }, head);
    const writeLabel = el('text', { x: 20, y: 52, fill: pal.textMuted }, writeG);
    writeLabel.textContent = t('label.write', 'Write');
    const writeSql = el('text', { x: 90, y: 52, fill: pal.text, 'font-family': fonts.mono }, writeG);

    // 구조 층 · 덧그림 층
    const structLayer = el('g', {}, root);
    const treeG = el('g', { style: 'transition: opacity 400ms' }, structLayer);
    const hashG = el('g', { style: 'transition: opacity 400ms' }, structLayer);
    const tableG = el('g', {}, structLayer);
    const overlay = el('g', { 'pointer-events': 'none' }, root);

    // 값 막대
    const costG = el('g', {}, root);
    const costTitle = el('text', { x: 20, y: COST_TITLE_Y, fill: pal.textMuted }, costG);
    costTitle.textContent = t('label.costs', 'Pages each path would read');
    const marker = el('rect', {
      x: 12,
      y: (COST_ROW_Y[0] as number) - 5,
      width: W - 30,
      height: BAR_H + 10,
      rx: 6,
      fill: 'none',
      stroke: pal.stateInk,
      'stroke-width': 1.5,
      opacity: 0,
    }, costG);
    const markerText = el('text', { x: W - 26, y: (COST_ROW_Y[0] as number) + 13, 'text-anchor': 'end', fill: pal.stateInk, 'font-weight': 600, opacity: 0 }, costG);
    markerText.textContent = t('label.chosen', 'cheapest');
    let markerY = COST_ROW_Y[0] as number;
    /** 표지가 한 번이라도 자리를 잡았는가 — 처음이면 미끄러지지 않고 그 자리에 뜬다 */
    let markerPlaced = false;
    const bars = new Map<IndexChoicePathId, { rect: SVGRectElement; value: SVGTextElement; label: SVGTextElement; w: number }>();
    const pathLabel = (p: IndexChoicePathId): string =>
      p === 'seq' ? t('label.path.seq', 'Table scan') : p === 'btree' ? t('label.path.btree', 'B+ tree') : t('label.path.hash', 'Hash');
    PATHS.forEach((p, i) => {
      const y = COST_ROW_Y[i] as number;
      const label = el('text', { x: BAR_X0 - 10, y: y + 13, 'text-anchor': 'end', fill: pal.text }, costG);
      label.textContent = pathLabel(p);
      const rect = el('rect', { x: BAR_X0, y, width: 0, height: BAR_H, rx: 3, fill: colorOf(p) }, costG);
      const value = el('text', { x: BAR_X0 + 6, y: y + 13, fill: pal.text, 'font-family': fonts.mono, 'font-weight': 600 }, costG);
      bars.set(p, { rect, value, label, w: 0 });
    });
    const baseline = el('line', {
      x1: BAR_X0,
      x2: BAR_X0,
      y1: (COST_ROW_Y[0] as number) - 8,
      y2: (COST_ROW_Y[2] as number) + BAR_H + 8,
      stroke: pal.textMuted,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 3',
      opacity: 0,
    }, costG);
    let baselineX = BAR_X0;

    const caption = el('text', { x: 20, y: CAPTION_Y, fill: pal.text, 'font-size': fontSizes.md }, root);
    const readCounter = el('text', { x: 20, y: COUNTER_Y, fill: pal.textMuted, 'font-family': fonts.mono }, root);
    const writeCounter = el('text', { x: 260, y: COUNTER_Y, fill: pal.textMuted, 'font-family': fonts.mono }, root);

    // ── 구조 상태
    const pages = new Map<string, Page>();
    let built = false;
    let treeTitleTag: SVGTextElement | null = null;
    let hashTitleTag: SVGTextElement | null = null;

    // 덧그림 (구조가 서면 만든다)
    const descentLine = el('polyline', { points: '', fill: 'none', stroke: colorOf('btree'), 'stroke-width': 3, 'stroke-linejoin': 'round', opacity: 0 }, overlay);
    let descentPts: [number, number][] = [];
    const leafBand = el('rect', { x: 0, y: LEAF_Y - 5, width: 0, height: LEAF_H + 10, rx: 6, fill: colorOf('btree'), 'fill-opacity': 0.12, stroke: colorOf('btree'), 'stroke-width': 2, 'stroke-dasharray': '6 3', opacity: 0 }, overlay);
    let leafBandBox: Box = { x: 0, y: LEAF_Y - 5, w: 0, h: LEAF_H + 10 };
    const bucketBand = el('rect', { x: 0, y: 0, width: 0, height: 0, rx: 6, fill: colorOf('hash'), 'fill-opacity': 0.12, stroke: colorOf('hash'), 'stroke-width': 2, 'stroke-dasharray': '6 3', opacity: 0 }, overlay);
    let bucketBandBox: Box = { x: 0, y: 0, w: 0, h: 0 };
    const tableBand = el('rect', { x: 0, y: TABLE_Y - 5, width: 0, height: TABLE_H + 10, rx: 6, fill: 'none', stroke: colorOf('seq'), 'stroke-width': 2, 'stroke-dasharray': '6 3', opacity: 0 }, overlay);
    const branchG = el('g', {}, overlay);
    const reader = el('circle', { cx: 60, cy: 26, r: 7, fill: pal.itemActive, stroke: pal.bg, 'stroke-width': 2, opacity: 0 }, overlay);
    let readerAt: [number, number] = [60, 26];

    const setBox = (r: SVGRectElement, b: Box) => {
      r.setAttribute('x', String(b.x));
      r.setAttribute('y', String(b.y));
      r.setAttribute('width', String(Math.max(0, b.w)));
      r.setAttribute('height', String(Math.max(0, b.h)));
    };
    const tweenBox = (r: SVGRectElement, from: Box, to: Box, ms: number, onDone?: (b: Box) => void) => {
      tween(ms, (k) => {
        const b = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), w: lerp(from.w, to.w, k), h: lerp(from.h, to.h, k) };
        setBox(r, b);
        if (k >= 1 && onDone) onDone(b);
      });
    };
    const page = (id: string): Page => {
      const p = pages.get(id);
      if (!p) throw new Error(`무대에 없는 페이지: ${id}`);
      return p;
    };
    const centerOf = (id: string): [number, number] => {
      const b = page(id).box;
      return [b.x + b.w / 2, b.y + b.h / 2];
    };
    const unionBox = (ids: string[], pad: number): Box => {
      if (ids.length === 0) throw new Error('띠를 두를 페이지가 없다');
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const id of ids) {
        const b = page(id).box;
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
      }
      return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    };

    // 항목 자리
    const slotOf = (pg: Page, i: number, cap: number): [number, number] => {
      const b = pg.box;
      if (pg.kind === 'table') return [b.x + 8, b.y + 30 + i * 15];
      if (pg.kind === 'bucket') return [b.x + 10 + i * 26, b.y + 40];
      const sw = b.w / cap;
      return [b.x + sw * i + sw / 2, b.y + 24];
    };
    let leafCap = 1;
    const capOf = (pg: Page): number => (pg.kind === 'leaf' ? leafCap : pg.kind === 'table' ? 2 : 3);
    const makeEntry = (pg: Page, key: number, row: string, slot: number, parent: SVGGElement): Entry => {
      const [x, y] = slotOf(pg, slot, capOf(pg));
      const g = el('g', { transform: `translate(${x},${y})` }, parent);
      if (pg.kind === 'table') {
        const r = el('text', { x: 0, y: 0, fill: pal.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, g);
        r.textContent = row;
        const v = el('text', { x: pg.box.w - 16, y: 0, 'text-anchor': 'end', fill: pal.text, 'font-family': fonts.mono }, g);
        v.textContent = String(key);
      } else {
        const anchor = pg.kind === 'leaf' ? 'middle' : 'start';
        const v = el('text', { x: 0, y: 0, 'text-anchor': anchor, fill: pal.text, 'font-family': fonts.mono }, g);
        v.textContent = String(key);
      }
      return { key, row, g, x, y, added: false };
    };
    const moveEntry = (e: Entry, x: number, y: number, ms: number) => {
      const fx = e.x;
      const fy = e.y;
      e.x = x;
      e.y = y;
      tween(ms, (k) => e.g.setAttribute('transform', `translate(${lerp(fx, x, k)},${lerp(fy, y, k)})`));
    };
    const entryLayer = new Map<string, SVGGElement>();

    const addPage = (
      parent: SVGGElement,
      id: string,
      kind: Page['kind'],
      box: Box,
      keys: { key: number; row: string }[],
    ): Page => {
      const g = el('g', {}, parent);
      const rect = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 4, fill: pal.itemDefault, stroke: pal.border, 'stroke-width': 1.5 }, g);
      const tag = el('text', { x: box.x + 5, y: box.y + 12, fill: pal.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono }, g);
      tag.textContent = id;
      if (kind === 'inner') {
        tag.setAttribute('x', String(box.x - 4));
        tag.setAttribute('y', String(box.y + box.h / 2 + 4));
        tag.setAttribute('text-anchor', 'end');
      }
      const pg: Page = { id, kind, box, rect, entries: [], original: keys.map((k) => k.key) };
      const eg = el('g', {}, g);
      entryLayer.set(id, eg);
      if (kind === 'inner') {
        const v = el('text', { x: box.x + box.w / 2, y: box.y + box.h / 2 + 5, 'text-anchor': 'middle', fill: pal.text, 'font-family': fonts.mono, 'font-weight': 600 }, eg);
        v.textContent = keys.map((k) => String(k.key)).join(' ');
      } else {
        if (kind === 'leaf') {
          for (let i = 1; i < leafCap; i += 1) {
            const sx = box.x + (box.w / leafCap) * i;
            el('line', { x1: sx, x2: sx, y1: box.y + 14, y2: box.y + box.h - 4, stroke: pal.border }, g);
          }
        }
        keys.forEach((k, i) => pg.entries.push(makeEntry(pg, k.key, k.row, i, eg)));
      }
      pages.set(id, pg);
      return pg;
    };

    const build = (s: IndexChoiceStructure) => {
      stopAll();
      for (const g of [treeG, hashG, tableG, branchG]) while (g.firstChild) g.removeChild(g.firstChild);
      pages.clear();
      entryLayer.clear();
      leafCap = s.leafCapacity;
      const find = (id: string) => {
        const p = s.treePages.find((x) => x.id === id);
        if (!p) throw new Error(`구조에 없는 트리 페이지: ${id}`);
        return p;
      };

      // ── B+ 트리 — 잎은 사슬 차례로 고르게, 안쪽은 가지들의 가운데
      const treeTitle = el('text', { x: TREE_X0, y: TOP_Y + 10, fill: pal.text, 'font-weight': 600 }, treeG);
      treeTitle.textContent = t('label.btree', 'B+ tree index');
      const treeName = el('text', { x: TREE_X0, y: TOP_Y + 10, fill: pal.textMuted, 'font-family': fonts.mono }, treeG);
      treeName.textContent = s.btreeName;
      treeName.setAttribute('x', String(TREE_X0 + textW(treeTitle.textContent) + 10));
      treeTitleTag = el('text', { x: TREE_X1, y: TOP_Y + 10, 'text-anchor': 'end', fill: pal.danger, 'font-size': fontSizes.xs, opacity: 0 }, treeG);
      treeTitleTag.textContent = t('label.notBuilt', 'not built');

      let first = find(s.root);
      while (first.kind === 'inner') {
        const c = first.children[0];
        if (c === undefined) throw new Error(`안쪽 페이지 ${first.id} 에 가지가 없다`);
        first = find(c);
      }
      const leafOrder: string[] = [];
      for (let cur: string | null = first.id; cur !== null; cur = find(cur).next) leafOrder.push(cur);
      const leafW = 100;
      const gap = leafOrder.length > 1 ? (TREE_X1 - TREE_X0 - leafOrder.length * leafW) / (leafOrder.length - 1) : 0;
      const cx = new Map<string, number>();
      leafOrder.forEach((id, i) => cx.set(id, TREE_X0 + i * (leafW + gap) + leafW / 2));
      const depthOf = new Map<string, number>();
      const walk = (id: string, d: number) => {
        depthOf.set(id, d);
        const p = find(id);
        for (const c of p.children) walk(c, d + 1);
        if (p.kind === 'inner') {
          const xs = p.children.map((c) => {
            const v = cx.get(c);
            if (v === undefined) throw new Error(`가지 ${c} 의 자리가 없다`);
            return v;
          });
          cx.set(id, xs.reduce((a, b) => a + b, 0) / xs.length);
        }
      };
      walk(s.root, 0);
      const edges = el('g', {}, treeG);
      const boxOf = (id: string): Box => {
        const p = find(id);
        const x = cx.get(id);
        if (x === undefined) throw new Error(`트리 페이지 ${id} 의 자리가 없다`);
        if (p.kind === 'leaf') return { x: x - leafW / 2, y: LEAF_Y, w: leafW, h: LEAF_H };
        const d = depthOf.get(id);
        const y = d === undefined ? undefined : LEVEL_Y[d];
        if (y === undefined) throw new Error(`트리가 무대의 층보다 깊다: ${id}`);
        return { x: x - INNER_W / 2, y, w: INNER_W, h: INNER_H };
      };
      for (const p of s.treePages) {
        const b = boxOf(p.id);
        for (const c of p.children) {
          const cb = boxOf(c);
          el('line', { x1: b.x + b.w / 2, y1: b.y + b.h, x2: cb.x + cb.w / 2, y2: cb.y, stroke: pal.border, 'stroke-width': 1.5 }, edges);
        }
        addPage(treeG, p.id, p.kind, b, p.keys.map((k) => ({ key: k, row: '' })));
      }
      for (let i = 0; i + 1 < leafOrder.length; i += 1) {
        const a = page(leafOrder[i] as string).box;
        const b = page(leafOrder[i + 1] as string).box;
        const y = a.y + a.h / 2 + 4;
        el('line', { x1: a.x + a.w + 1, y1: y, x2: b.x - 3, y2: y, stroke: pal.textMuted, 'stroke-width': 1.5 }, edges);
        el('path', { d: `M ${b.x - 3} ${y} l -5 -3 v 6 z`, fill: pal.textMuted }, edges);
      }

      // ── 해시 버킷
      const hashTitle = el('text', { x: HASH_X0, y: TOP_Y + 10, fill: pal.text, 'font-weight': 600 }, hashG);
      hashTitle.textContent = t('label.hash', 'Hash index');
      const hashName = el('text', { x: HASH_X0 + textW(hashTitle.textContent) + 10, y: TOP_Y + 10, fill: pal.textMuted, 'font-family': fonts.mono }, hashG);
      hashName.textContent = s.hashName;
      const rule = el('text', { x: HASH_X1, y: BUCKET_TOP + 2 * BUCKET_H + BUCKET_GAP_Y + 16, 'text-anchor': 'end', fill: pal.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, hashG);
      rule.textContent = t('label.hashRule', 'bucket = price mod {n}', { n: s.bucketCount });
      hashTitleTag = el('text', { x: HASH_X1, y: TOP_Y + 10, 'text-anchor': 'end', fill: pal.danger, 'font-size': fontSizes.xs, opacity: 0 }, hashG);
      hashTitleTag.textContent = t('label.notBuilt', 'not built');
      const bw = (HASH_X1 - HASH_X0 - (BUCKET_COLS - 1) * 10) / BUCKET_COLS;
      s.buckets.forEach((b, i) => {
        const col = i % BUCKET_COLS;
        const row = Math.floor(i / BUCKET_COLS);
        const box = { x: HASH_X0 + col * (bw + 10), y: BUCKET_TOP + row * (BUCKET_H + BUCKET_GAP_Y), w: bw, h: BUCKET_H };
        addPage(hashG, b.id, 'bucket', box, b.keys.map((k) => ({ key: k, row: '' })));
      });

      // ── 표 페이지
      const tableTitle = el('text', { x: TREE_X0, y: TABLE_TITLE_Y, fill: pal.text, 'font-weight': 600 }, tableG);
      tableTitle.textContent = t('label.table', 'Table');
      const tableName = el('text', { x: TREE_X0 + textW(tableTitle.textContent) + 10, y: TABLE_TITLE_Y, fill: pal.textMuted, 'font-family': fonts.mono }, tableG);
      tableName.textContent = s.tableName;
      const n = s.tablePages.length;
      const tw = (HASH_X1 - TREE_X0 - (n - 1) * 8) / Math.max(1, n);
      s.tablePages.forEach((p, i) => {
        const box = { x: TREE_X0 + i * (tw + 8), y: TABLE_Y, w: tw, h: TABLE_H };
        addPage(tableG, p.id, 'table', box, p.rows.map((r) => ({ key: r.key, row: r.row })));
      });

      // 덧그림을 구조 위로
      overlay.parentNode?.appendChild(overlay);
      descentLine.setAttribute('opacity', '0');
      leafBand.setAttribute('opacity', '0');
      bucketBand.setAttribute('opacity', '0');
      tableBand.setAttribute('opacity', '0');
      setBox(tableBand, unionBox(s.tablePages.map((p) => p.id), 4));
      built = true;
    };

    const litFill = (id: string, fill: string, opacity: number) => {
      const r = page(id).rect;
      r.setAttribute('fill', fill);
      r.setAttribute('fill-opacity', String(opacity));
    };
    const unlightAll = () => {
      for (const p of pages.values()) {
        p.rect.setAttribute('fill', pal.itemDefault);
        p.rect.setAttribute('fill-opacity', '1');
        p.rect.setAttribute('stroke', pal.border);
      }
    };

    /** 쓰기로 바뀐 항목을 원래 자리로 되돌린다. */
    const undoWrites = (ms: number) => {
      for (const p of pages.values()) {
        if (p.kind === 'inner') continue;
        const kept: Entry[] = [];
        for (const e of p.entries) {
          if (e.added) e.g.remove();
          else kept.push(e);
        }
        p.entries = kept;
        kept.forEach((e, i) => {
          const [x, y] = slotOf(p, i, capOf(p));
          if (x !== e.x || y !== e.y) moveEntry(e, x, y, ms);
        });
      }
      const old = Array.from(branchG.children);
      tween(ms, (k) => {
        for (const b of old) b.setAttribute('opacity', String(1 - k));
        if (k >= 1) for (const b of old) b.remove();
      });
    };

    let hasBtree = true;
    let hasHash = true;

    const api: IndexChoiceStage = {
      build,
      startRound(p, ms) {
        if (!built) throw new Error('구조가 서기 전에 판이 시작됐다');
        stopAll();
        querySql.textContent = p.sql;
        writeSql.textContent = p.insertSql;
        writeG.setAttribute('opacity', '0.35');
        hasBtree = p.hasBtree;
        hasHash = p.hasHash;
        treeG.setAttribute('opacity', hasBtree ? '1' : '0.28');
        hashG.setAttribute('opacity', hasHash ? '1' : '0.28');
        treeTitleTag?.setAttribute('opacity', hasBtree ? '0' : '1');
        hashTitleTag?.setAttribute('opacity', hasHash ? '0' : '1');
        unlightAll();
        undoWrites(ms);
        // 앞 판의 막대는 흐리게 남겨 새 값이 거기서 자라게 한다. 걸리지 않은 길은 줄어 사라진다
        for (const path of PATHS) {
          const bar = bars.get(path);
          if (!bar) throw new Error(`막대가 없다: ${path}`);
          const present = path === 'seq' || (path === 'btree' ? hasBtree : hasHash);
          bar.rect.setAttribute('fill-opacity', '0.35');
          // 앞 판의 값 글자는 비운다 — 새 판의 값이 오기 전까지 수를 보이지 않는다
          bar.value.textContent = '';
          bar.label.setAttribute('fill', present ? pal.text : pal.textMuted);
          bar.label.setAttribute('opacity', present ? '1' : '0.45');
          if (!present) {
            const from = bar.w;
            bar.w = 0;
            bar.value.textContent = '';
            tween(ms, (k) => bar.rect.setAttribute('width', String(lerp(from, 0, k))));
          }
        }
        if (!hasBtree) {
          descentLine.setAttribute('opacity', '0');
          leafBand.setAttribute('opacity', '0');
        } else {
          descentLine.setAttribute('opacity', '0.3');
          leafBand.setAttribute('opacity', '0.3');
        }
        bucketBand.setAttribute('opacity', hasHash ? '0.3' : '0');
        tableBand.setAttribute('opacity', '0');
        // "가장 쌈" 표지는 고르기 걸음 전까지 감춘다 (자리는 기억해 두었다가 거기서 건너간다)
        marker.setAttribute('opacity', '0');
        markerText.setAttribute('opacity', '0');
        reader.setAttribute('opacity', '0');
      },
      showCost(p, ms) {
        const bar = bars.get(p.path);
        if (!bar) throw new Error(`막대가 없다: ${p.path}`);
        const to = p.pages * BAR_UNIT;
        const from = bar.w;
        bar.w = to;
        bar.rect.setAttribute('fill-opacity', '1');
        bar.value.textContent = String(p.pages);
        tween(ms, (k) => {
          const w = lerp(from, to, k);
          bar.rect.setAttribute('width', String(w));
          bar.value.setAttribute('x', String(BAR_X0 + w + 6));
        });
        if (p.path === 'seq') {
          const fx = baselineX;
          baselineX = BAR_X0 + to;
          baseline.setAttribute('opacity', '1');
          tween(ms, (k) => {
            const x = String(lerp(fx, baselineX, k));
            baseline.setAttribute('x1', x);
            baseline.setAttribute('x2', x);
          });
          tableBand.setAttribute('opacity', '1');
        } else if (p.path === 'btree') {
          // 내려가기 선 — 점 수가 같으면 옮겨 가고, 다르면 새로 긋는다
          // 가지를 따라 긋는다 — 페이지 아래 가운데 → 다음 페이지 위 가운데 (열쇠 글자를 가리지 않게)
          const target: [number, number][] = [];
          p.descent.forEach((id, i) => {
            const b = page(id).box;
            if (i > 0) target.push([b.x + b.w / 2, b.y]);
            if (i < p.descent.length - 1) target.push([b.x + b.w / 2, b.y + b.h]);
          });
          const from0 = descentPts.length === target.length ? descentPts : target.map((pt) => [pt[0], (LEVEL_Y[0] as number) + INNER_H / 2] as [number, number]);
          descentPts = target;
          descentLine.setAttribute('opacity', '1');
          tween(ms, (k) => {
            descentLine.setAttribute('points', target.map((pt, i) => {
              const f = from0[i] ?? pt;
              return `${lerp(f[0], pt[0], k)},${lerp(f[1], pt[1], k)}`;
            }).join(' '));
          });
          const toBox = unionBox(p.leaves, 5);
          const fromBox = leafBandBox.w > 0 ? leafBandBox : { ...toBox, w: 0 };
          leafBandBox = toBox;
          leafBand.setAttribute('opacity', '1');
          tweenBox(leafBand, fromBox, toBox, ms);
        } else {
          const toBox = unionBox(p.leaves, 5);
          const fromBox = bucketBandBox.w > 0 ? bucketBandBox : { ...toBox, w: 0, h: 0 };
          bucketBandBox = toBox;
          bucketBand.setAttribute('opacity', '1');
          tweenBox(bucketBand, fromBox, toBox, ms);
        }
      },
      pick(p, ms) {
        const i = PATHS.indexOf(p.path);
        const toY = (COST_ROW_Y[i] as number) - 5;
        const fromY = markerY;
        markerY = toY;
        if (p.read.length === 0) throw new Error(`읽을 페이지가 없는 길: ${p.path}`);
        const wasHidden = !markerPlaced;
        markerPlaced = true;
        marker.setAttribute('opacity', '1');
        markerText.setAttribute('opacity', '1');
        marker.setAttribute('stroke', colorOf(p.path));
        const half = ms * 0.35;
        tween(wasHidden ? 0 : half, (k) => {
          const y = lerp(fromY, toY, k);
          marker.setAttribute('y', String(y));
          markerText.setAttribute('y', String(y + 18));
        });
        for (const path of PATHS) {
          const bar = bars.get(path);
          if (bar) bar.rect.setAttribute('fill-opacity', path === p.path ? '1' : '0.45');
        }
        // 읽는 점 — 질의 자리에서 출발해 읽는 페이지를 차례로 지난다
        const pts: [number, number][] = [readerAt, ...p.read.map((id) => centerOf(id))];
        readerAt = pts[pts.length - 1] ?? readerAt;
        reader.setAttribute('opacity', '1');
        const hops = pts.length - 1;
        let litCount = 0;
        tween(ms, (k) => {
          const pos = k * hops;
          const seg = Math.min(hops - 1, Math.floor(pos));
          const a = pts[seg];
          const b = pts[seg + 1];
          if (!a || !b) throw new Error(`읽는 점의 구간이 없다: ${seg}`);
          const f = pos - seg;
          reader.setAttribute('cx', String(lerp(a[0], b[0], f)));
          reader.setAttribute('cy', String(lerp(a[1], b[1], f)));
          const reached = k >= 1 ? hops : Math.floor(pos);
          while (litCount < reached) {
            const id = p.read[litCount];
            if (id === undefined) throw new Error(`읽는 차례 밖: ${litCount}`);
            litFill(id, pal.itemActive, 0.35);
            page(id).rect.setAttribute('stroke', pal.itemActive);
            litCount += 1;
          }
        });
      },
      insert(p, ms) {
        writeG.setAttribute('opacity', '1');
        reader.setAttribute('opacity', '0');
        const textEnd = 90 + (writeSql.textContent ?? '').length * monoCharW + 8;
        const startY = 48;
        const grow = ms * 0.6;
        for (const w of p.writes) {
          const pg = page(w.page);
          const tx = pg.box.x + pg.box.w / 2;
          const ty = w.kind === 'table' ? pg.box.y : pg.box.y + pg.box.h;
          const d = `M ${textEnd} ${startY} H ${TRUNK_X} V ${SPLIT_Y} H ${tx} V ${ty}`;
          const len = Math.abs(TRUNK_X - textEnd) + Math.abs(SPLIT_Y - startY) + Math.abs(tx - TRUNK_X) + Math.abs(ty - SPLIT_Y);
          const line = el('path', { d, fill: 'none', stroke: pal.accent, 'stroke-width': 2.5, 'stroke-dasharray': `${len} ${len}`, 'stroke-dashoffset': len }, branchG);
          tween(grow, (k) => line.setAttribute('stroke-dashoffset', String(len * (1 - k))));
          // 줄기가 닿으면 항목이 자리에 든다
          const eg = entryLayer.get(w.page);
          if (!eg) throw new Error(`항목 층이 없다: ${w.page}`);
          const settle = () => {
            litFill(w.page, pal.accent, 0.45);
            const olds = [...pg.entries];
            const next: Entry[] = [];
            w.entries.forEach((en, i) => {
              if (i === w.at) {
                const e = makeEntry(pg, en.key, en.row, i, eg);
                e.added = true;
                const [x, y] = [e.x, e.y];
                e.x = x;
                e.y = y - 14;
                e.g.setAttribute('transform', `translate(${x},${y - 14})`);
                moveEntry(e, x, y, ms - grow);
                next.push(e);
                return;
              }
              const idx = olds.findIndex((o) => o.key === en.key);
              const old = olds[idx];
              if (idx < 0 || old === undefined) throw new Error(`쓰기 전 항목에 없는 열쇠: ${en.key} (${w.page})`);
              olds.splice(idx, 1);
              const [x, y] = slotOf(pg, i, capOf(pg));
              if (x !== old.x || y !== old.y) moveEntry(old, x, y, ms - grow);
              next.push(old);
            });
            pg.entries = next;
          };
          tween(grow, (k) => {
            if (k >= 1) settle();
          });
        }
      },
      setCaption(text) {
        caption.textContent = text;
      },
      setCounters(read, written) {
        readCounter.textContent = read;
        writeCounter.textContent = written;
      },
      clear() {
        stopAll();
        querySql.textContent = '';
        writeSql.textContent = '';
        caption.textContent = '';
        readCounter.textContent = '';
        writeCounter.textContent = '';
        for (const bar of bars.values()) {
          bar.w = 0;
          bar.rect.setAttribute('width', '0');
          bar.value.textContent = '';
        }
        baseline.setAttribute('opacity', '0');
        marker.setAttribute('opacity', '0');
        markerText.setAttribute('opacity', '0');
        markerPlaced = false;
        reader.setAttribute('opacity', '0');
        readerAt = [60, 26];
        descentPts = [];
        leafBandBox = { x: 0, y: LEAF_Y - 5, w: 0, h: LEAF_H + 10 };
        bucketBandBox = { x: 0, y: 0, w: 0, h: 0 };
        if (built) {
          unlightAll();
          undoWrites(0);
        }
        for (const r of [descentLine, leafBand, bucketBand, tableBand]) r.setAttribute('opacity', '0');
      },
    };

    return {
      ...api,
      destroy() {
        stopAll();
        root.remove();
      },
    };
  },
};
