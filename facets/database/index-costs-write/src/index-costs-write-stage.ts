/**
 * index-costs-write 무대 — 같은 표 둘을 나란히 두고, 읽기는 좁혀 들어가고 쓰기는 퍼져 나가게 한다.
 *
 * 왼쪽: 인덱스 없음 (표만). 오른쪽: 표 + 인덱스 셋.
 * - scan  : 읽는 선이 왼쪽 표 페이지를 처음부터 끝까지 가로로 훑는다
 * - seek  : 표식 하나가 질의에서 인덱스 뿌리 → 잎 → 표 페이지 하나로 내려간다
 * - write : 새 줄 하나가 왼쪽 표 페이지 한 곳으로 들어간다
 * - fan   : 새 줄 하나가 갈림점에서 넷(표 페이지 · 잎 셋)으로 갈라져 퍼진다
 *
 * 화면은 늘 장면 전체에서 세운다. 운동은 그 위에 "아직 못 온 만큼" 을 덮어 그린 것이다.
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
} from '@ffacet/core/runtime';
import type { IndexCostsWriteScene, Spot, StepKind } from './scene.js';

const H = 384;
const W = PIECE_CANVAS_W;

// 읽기 · 쓰기는 두 갈래 식별이다 (S-view 결정 트리 3). 같은 시드에서 자리만 고른다.
const MARK_COLORS = categorical(2, 'vivid');
const WRITE_TONE = 0;
const READ_TONE = 1;

const SIDE_MARGIN = 16;
const COL_GAP = 28;
const COL_W = (W - SIDE_MARGIN * 2 - COL_GAP) / 2;
const LEFT_X = SIDE_MARGIN;
const RIGHT_X = SIDE_MARGIN + COL_W + COL_GAP;

const QUERY_Y = 26;
const HEADER_Y = 60;
const ENTRY_Y = 72;
const INDEX_NAME_Y = 90;
const ROOT_TOP = 100;
const LEAF_TOP = 150;
const BOX_H = 22;
const LEAF_H = 30;
const TABLE_LABEL_Y = 204;
const PAGES_TOP = 212;
const PAGE_H = 62;
const PAGE_GAP = 6;
const PAGE_W_MAX = 44;
const PAGE_PAD = 6;
const COUNTER_Y = 316;
const COUNTER_GAP = 20;
const CAPTION_Y = 358;
const CAPTION_LINE = 17;
/** 본문 글자 한 자의 평균 폭 ≈ 글자 크기 × 이 몫 — 캡션을 두 줄로 나눌지 가늠하는 데만 쓴다. */
const BODY_ADVANCE = 0.56;

const MOTION_MS: Record<StepKind, number> = {
  none: 0,
  query: 300,
  scan: 800,
  seek: 800,
  write: 700,
  fan: 800,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

/** 운동 중의 한 장면 — 무엇을 아직 덜 보일지. */
type Frame =
  | { kind: 'query'; p: number }
  | { kind: 'scan'; p: number }
  | { kind: 'seek'; p: number }
  | { kind: 'write'; p: number }
  | { kind: 'fan'; p: number };

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function put(parent: Element, tag: string, attrs: Record<string, string | number>): SVGElement {
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
  body: string,
  style: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: string; halo?: string },
): SVGElement {
  const node = put(parent, 'text', {
    x,
    y,
    'font-family': style.mono === true ? fonts.mono : fonts.body,
    'font-size': style.size,
    fill: style.fill,
    'text-anchor': style.anchor ?? 'middle',
  });
  if (style.weight !== undefined) node.setAttribute('font-weight', style.weight);
  if (style.halo !== undefined) {
    node.setAttribute('stroke', style.halo);
    node.setAttribute('stroke-width', '3');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('paint-order', 'stroke');
  }
  node.textContent = body;
  return node;
}

/** 폭을 넘을 만한 캡션은 가운데에 가장 가까운 빈칸에서 두 줄로 나눈다. */
function splitCaption(body: string): string[] {
  const fits = body.length * parseFloat(fontSizes.sm) * BODY_ADVANCE <= W - SIDE_MARGIN * 2;
  if (fits) return [body];
  const mid = body.length / 2;
  let best = -1;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best < 0) return [body];
  return [body.slice(0, best), body.slice(best + 1)];
}

function polyLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return len;
}

/** 꺾은선의 앞 f 만큼 — 끝점과 그때까지의 꼭짓점. */
function polyPrefix(pts: Pt[], f: number): Pt[] {
  const total = polyLength(pts);
  let left = Math.max(0, Math.min(1, f)) * total;
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= seg) {
      out.push(b);
      left -= seg;
      continue;
    }
    const k = seg === 0 ? 0 : left / seg;
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    return out;
  }
  return out;
}

/** 꺾은선 위 꼭짓점 i 에 닿는 몫 (0..1). */
function arrivalAt(pts: Pt[], i: number): number {
  const total = polyLength(pts);
  if (total === 0) return 0;
  return polyLength(pts.slice(0, i + 1)) / total;
}

function pointsAttr(pts: Pt[]): string {
  return pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

/** 한 쪽 표의 페이지 · 자리 좌표. */
function tableGeometry(colX: number, pageCount: number, perPage: number) {
  const pageW = pageCount > 0 ? Math.min(PAGE_W_MAX, (COL_W - (pageCount - 1) * PAGE_GAP) / pageCount) : 0;
  const rowW = pageCount * pageW + Math.max(0, pageCount - 1) * PAGE_GAP;
  const x0 = colX + (COL_W - rowW) / 2;
  const slotGap = 4;
  const slotH = perPage > 0 ? Math.min(10, (PAGE_H - PAGE_PAD * 2 - (perPage - 1) * slotGap) / perPage) : 0;
  const blockH = perPage * slotH + Math.max(0, perPage - 1) * slotGap;
  const slotTop0 = PAGES_TOP + (PAGE_H - blockH) / 2;
  return {
    pageW,
    x0,
    slotH,
    pageX: (page: number) => x0 + (page - 1) * (pageW + PAGE_GAP),
    pageCx: (page: number) => x0 + (page - 1) * (pageW + PAGE_GAP) + pageW / 2,
    slotY: (slot: number) => slotTop0 + (slot - 1) * (slotH + slotGap),
    slotCenter: (s: Spot): Pt => ({
      x: x0 + (s.page - 1) * (pageW + PAGE_GAP) + pageW / 2,
      y: slotTop0 + (s.slot - 1) * (slotH + slotGap) + slotH / 2,
    }),
  };
}

/** 고정폭 글자 한 칸의 폭 ≈ 글자 크기 × 이 몫. */
const MONO_ADVANCE = 0.6;
const INDEX_BOX_W = 60;

/** 오른쪽 인덱스들의 칸 — 이름 글자 폭만큼 나눠 가진다. */
function indexLayout(names: string[]): { cx: number; boxW: number; left: number }[] {
  const charW = parseFloat(fontSizes.xs) * MONO_ADVANCE;
  const need = names.map((n) => Math.max(n.length * charW, INDEX_BOX_W) + 8);
  const total = need.reduce((a, b) => a + b, 0);
  const scale = total > COL_W ? COL_W / total : 1;
  const extra = total < COL_W ? (COL_W - total) / Math.max(1, names.length) : 0;
  const out: { cx: number; boxW: number; left: number }[] = [];
  let x = RIGHT_X;
  for (const w0 of need) {
    const w = w0 * scale + extra;
    out.push({ cx: x + w / 2, boxW: Math.min(INDEX_BOX_W, w - 12), left: x });
    x += w;
  }
  return out;
}

/** 인덱스의 층 i (0 = 뿌리, height-1 = 잎) 윗변 y. */
function levelTop(level: number, height: number): number {
  if (height <= 1) return ROOT_TOP;
  return ROOT_TOP + ((LEAF_TOP - ROOT_TOP) * level) / (height - 1);
}

function levelH(level: number, height: number): number {
  return level === height - 1 ? LEAF_H : BOX_H;
}

export const indexCostsWriteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const readColor = MARK_COLORS[READ_TONE]!;
    const writeColor = MARK_COLORS[WRITE_TONE]!;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ---------------------------------------------------------------- 길 (장면에서 셈)

    const entryLeft: Pt = { x: LEFT_X + COL_W / 2, y: ENTRY_Y };
    const entryRight: Pt = { x: RIGHT_X + COL_W / 2, y: ENTRY_Y };
    const queryFoot = (colEntry: Pt): Pt => ({ x: colEntry.x, y: QUERY_Y + 8 });

    function seekPath(s: IndexCostsWriteScene): { pts: Pt[]; stops: number[] } | null {
      const at = s.base.indexes.findIndex((ix) => ix.name === s.indexed.readIndex);
      const found = s.indexed.found;
      if (at < 0 || found === null) return null;
      const ix = s.base.indexes[at]!;
      const g = indexLayout(s.base.indexes.map((x) => x.name))[at]!;
      const tg = tableGeometry(RIGHT_X, s.base.pages.length, s.base.perPage);
      const pts: Pt[] = [queryFoot(entryRight), entryRight, { x: g.cx, y: ROOT_TOP - 8 }];
      const stops: number[] = [];
      const levels = Math.min(s.indexed.readLevels, ix.height);
      for (let lv = 0; lv < levels; lv += 1) {
        stops.push(pts.length);
        pts.push({ x: g.cx, y: levelTop(lv, ix.height) + levelH(lv, ix.height) / 2 });
      }
      const target = tg.slotCenter(found);
      pts.push({ x: g.cx, y: LEAF_TOP + LEAF_H + 6 });
      pts.push({ x: target.x, y: PAGES_TOP - 8 });
      stops.push(pts.length);
      pts.push(target);
      return { pts, stops };
    }

    function writePathLeft(s: IndexCostsWriteScene): Pt[] | null {
      const w = s.plain.written;
      if (w === null) return null;
      const tg = tableGeometry(LEFT_X, s.base.pages.length, s.base.perPage);
      const target = tg.slotCenter(w);
      return [queryFoot(entryLeft), entryLeft, { x: target.x, y: PAGES_TOP - 8 }, target];
    }

    /** 갈림점까지의 줄기 하나와 거기서 갈라지는 가지들. */
    function fanPaths(s: IndexCostsWriteScene): { trunk: Pt[]; branches: Pt[][] } | null {
      const w = s.indexed.written;
      if (w === null) return null;
      const trunk = [queryFoot(entryRight), entryRight];
      const branches: Pt[][] = [];
      const n = s.base.indexes.length;
      const slots = indexLayout(s.base.indexes.map((x) => x.name));
      for (const name of s.indexed.writtenLeaves) {
        const at = s.base.indexes.findIndex((ix) => ix.name === name);
        if (at < 0) throw new Error(`index-costs-write 무대: 인덱스 ${name} 가 바탕에 없다`);
        const ix = s.base.indexes[at]!;
        const g = slots[at]!;
        const leafLevel = ix.height - 1;
        branches.push([
          entryRight,
          { x: g.cx, y: ROOT_TOP - 8 },
          { x: g.cx, y: levelTop(leafLevel, ix.height) + LEAF_H - 8 },
        ]);
      }
      // 표로 가는 가지는 인덱스 칸 사이의 틈으로 내려간다.
      const tg = tableGeometry(RIGHT_X, s.base.pages.length, s.base.perPage);
      const target = tg.slotCenter(w);
      const gapX = n > 1 ? slots[n - 1]!.left : RIGHT_X + COL_W - 6;
      branches.push([
        entryRight,
        { x: gapX, y: ROOT_TOP - 8 },
        { x: gapX, y: PAGES_TOP - 14 },
        { x: target.x, y: PAGES_TOP - 8 },
        target,
      ]);
      return { trunk, branches };
    }

    // ---------------------------------------------------------------- 그리기

    function drawTable(
      layer: Element,
      s: IndexCostsWriteScene,
      colX: number,
      view: { read: Set<number>; found: Spot | null; written: Spot | null },
    ): void {
      const pages = s.base.pages;
      const perPage = s.base.perPage;
      if (pages.length === 0) return;
      const tg = tableGeometry(colX, pages.length, perPage);
      label(layer, tg.x0, TABLE_LABEL_Y, s.base.tableName, {
        size: fontSizes.xs,
        fill: colors.textMuted,
        mono: true,
        anchor: 'start',
      });
      pages.forEach((filled, i) => {
        const page = i + 1;
        const x = tg.pageX(page);
        const isRead = view.read.has(page);
        const isWritten = view.written !== null && view.written.page === page;
        put(layer, 'rect', { x, y: PAGES_TOP, width: tg.pageW, height: PAGE_H, rx: 3, fill: colors.bg });
        put(layer, 'rect', {
          x,
          y: PAGES_TOP,
          width: tg.pageW,
          height: PAGE_H,
          rx: 3,
          fill: isWritten ? writeColor : colors.bg,
          'fill-opacity': isWritten ? 0.16 : 1,
          stroke: isRead ? readColor : colors.textMuted,
          'stroke-width': isRead ? 2.5 : 1,
        });
        for (let slot = 1; slot <= perPage; slot += 1) {
          const sy = tg.slotY(slot);
          const isFound = view.found !== null && view.found.page === page && view.found.slot === slot;
          const isNew = isWritten && view.written !== null && view.written.slot === slot;
          const holds = slot <= filled || isNew;
          put(layer, 'rect', {
            x: x + PAGE_PAD,
            y: sy,
            width: tg.pageW - PAGE_PAD * 2,
            height: tg.slotH,
            rx: 1.5,
            fill: isNew ? writeColor : isFound ? colors.accent : holds ? colors.textMuted : 'none',
            'fill-opacity': isNew || isFound ? 1 : 0.45,
            stroke: holds ? 'none' : colors.textMuted,
            'stroke-dasharray': holds ? 'none' : '2 2',
            'stroke-width': 1,
          });
        }
        label(layer, x + tg.pageW / 2, PAGES_TOP + PAGE_H + 14, String(page), {
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
      });
    }

    function drawIndexes(
      layer: Element,
      s: IndexCostsWriteScene,
      view: { readLevels: number; leaves: Set<string> },
    ): void {
      const slots = indexLayout(s.base.indexes.map((x) => x.name));
      s.base.indexes.forEach((ix, i) => {
        const g = slots[i]!;
        label(layer, g.cx, INDEX_NAME_Y, ix.name, {
          size: fontSizes.xs,
          fill: colors.text,
          mono: true,
          halo: colors.bg,
        });
        // 층 사이 이음선
        put(layer, 'line', {
          x1: g.cx,
          y1: ROOT_TOP + BOX_H,
          x2: g.cx,
          y2: levelTop(ix.height - 1, ix.height),
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
        for (let lv = 0; lv < ix.height; lv += 1) {
          const top = levelTop(lv, ix.height);
          const h = levelH(lv, ix.height);
          const isLeaf = lv === ix.height - 1;
          const isRead = s.indexed.readIndex === ix.name && lv < view.readLevels;
          const isWritten = isLeaf && view.leaves.has(ix.name);
          put(layer, 'rect', { x: g.cx - g.boxW / 2, y: top, width: g.boxW, height: h, rx: 3, fill: colors.bg });
          put(layer, 'rect', {
            x: g.cx - g.boxW / 2,
            y: top,
            width: g.boxW,
            height: h,
            rx: 3,
            fill: isWritten ? writeColor : colors.bg,
            'fill-opacity': isWritten ? 0.16 : 1,
            stroke: isRead ? readColor : colors.textMuted,
            'stroke-width': isRead ? 2.5 : 1,
          });
          if (lv === 0) {
            label(layer, g.cx, top + h / 2 + 4, t('label.root', 'Root'), { size: fontSizes.xs, fill: colors.textMuted });
          } else if (isLeaf) {
            label(layer, g.cx, top + 13, t('label.leaf', 'Leaf'), { size: fontSizes.xs, fill: colors.textMuted });
            if (isWritten) {
              put(layer, 'rect', {
                x: g.cx - g.boxW / 2 + 8,
                y: top + h - 9,
                width: g.boxW - 16,
                height: 5,
                rx: 1.5,
                fill: writeColor,
              });
            }
          }
        }
      });
    }

    function drawTrail(layer: Element, pts: Pt[], color: string): void {
      if (pts.length < 2) return;
      put(layer, 'polyline', {
        points: pointsAttr(pts),
        fill: 'none',
        stroke: color,
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
        'stroke-opacity': 0.8,
      });
    }

    function drawCounters(layer: Element, colX: number, reads: number | null, writes: number | null): void {
      const x = colX + 6;
      if (reads !== null) {
        put(layer, 'rect', { x, y: COUNTER_Y - 9, width: 10, height: 10, rx: 2, fill: 'none', stroke: readColor, 'stroke-width': 2.5 });
        label(layer, x + 18, COUNTER_Y, t('label.pagesRead', 'Pages read: {n}', { n: reads }), {
          size: fontSizes.sm,
          fill: colors.text,
          anchor: 'start',
        });
      }
      if (writes !== null) {
        const y = COUNTER_Y + COUNTER_GAP;
        put(layer, 'rect', { x, y: y - 9, width: 10, height: 10, rx: 2, fill: writeColor });
        label(layer, x + 18, y, t('label.pagesWritten', 'Pages written: {n}', { n: writes }), {
          size: fontSizes.sm,
          fill: colors.text,
          anchor: 'start',
        });
      }
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`index-costs-write 무대: ${what} 없이 이 걸음의 캡션을 셀 수 없다`);
      return v;
    }

    function captionFor(s: IndexCostsWriteScene): string {
      switch (s.step.kind) {
        case 'none':
          return s.base.pages.length > 0 ? t('caption.start', 'The same table twice, side by side.') : '';
        case 'query':
          return s.query === 'insert'
            ? t('caption.insert', 'One write goes to both tables.')
            : t('caption.select', 'One read goes to both tables.');
        case 'scan': {
          const read = s.plain.readPages;
          if (read.length === 0) throw new Error('index-costs-write 무대: 훑은 페이지가 없다');
          return t('caption.scan', 'No index: table pages read {from}–{to}. Page of the match: {page}', {
            from: read[0]!,
            to: read[read.length - 1]!,
            page: need(s.plain.found, 'found').page,
          });
        }
        case 'seek':
          return t('caption.seek', 'With indexes: {index} root, then leaf, then table page {page}.', {
            index: need(s.indexed.readIndex, 'readIndex'),
            page: need(s.indexed.readPage, 'readPage'),
          });
        case 'write':
          return t('caption.write', 'No index: new row → table page {page}.', {
            page: need(s.plain.written, 'written').page,
          });
        case 'fan':
          return t('caption.fan', 'With indexes: the row splits into table page {page} and one leaf per index.', {
            page: need(s.indexed.written, 'written').page,
          });
      }
    }

    function draw(s: IndexCostsWriteScene, frame: Frame | null): void {
      svg.textContent = '';
      const layer = put(svg, 'g', {});

      // 질의
      const sql = s.query === 'select' ? s.base.sqlSelect : s.query === 'insert' ? s.base.sqlInsert : '';
      if (sql !== '') {
        const q = frame?.kind === 'query' ? ease(frame.p) : 1;
        const node = label(layer, W / 2, QUERY_Y - (1 - q) * 14, sql, { size: fontSizes.sm, fill: colors.text, mono: true });
        if (q < 1) node.setAttribute('opacity', String(round(q)));
      }

      // 두 칸
      put(layer, 'line', {
        x1: W / 2,
        y1: HEADER_Y - 14,
        x2: W / 2,
        y2: COUNTER_Y + COUNTER_GAP + 6,
        stroke: colors.border,
        'stroke-width': 1,
      });
      label(layer, LEFT_X, HEADER_Y, t('label.noIndex', 'No index'), {
        anchor: 'start',
        size: fontSizes.md,
        fill: colors.text,
        weight: '600',
      });
      label(layer, RIGHT_X, HEADER_Y, t('label.withIndexes', 'Indexes: {n}', { n: s.base.indexes.length }), {
        anchor: 'start',
        size: fontSizes.md,
        fill: colors.text,
        weight: '600',
      });

      // ---- 왼쪽이 이번 운동에서 어디까지 왔는가
      let leftRead = new Set(s.plain.readPages);
      let leftFound = s.plain.found;
      let leftReads = s.plain.reads;
      let leftWritten = s.plain.written;
      let leftWrites = s.plain.writes;
      let cursorX: number | null = null;
      if (frame?.kind === 'scan' && s.base.pages.length > 0) {
        const tg = tableGeometry(LEFT_X, s.base.pages.length, s.base.perPage);
        const from = tg.pageX(1) - 6;
        const to = tg.pageX(s.base.pages.length) + tg.pageW + 6;
        cursorX = from + (to - from) * frame.p;
        const reached = s.plain.readPages.filter((pg) => tg.pageCx(pg) <= (cursorX as number));
        leftRead = new Set(reached);
        leftReads = reached.length;
        if (leftFound !== null && !leftRead.has(leftFound.page)) leftFound = null;
      }
      const leftWritePath = writePathLeft(s);
      if (frame?.kind === 'write' && frame.p < 1) {
        leftWritten = null;
        leftWrites = null;
      }

      // ---- 오른쪽
      let rightLevels = s.indexed.readLevels;
      let rightReadPage = s.indexed.readPage;
      let rightFound = s.indexed.found;
      let rightReads = s.indexed.reads;
      let rightWritten = s.indexed.written;
      let rightLeaves = new Set(s.indexed.writtenLeaves);
      let rightWrites = s.indexed.writes;
      const seek = seekPath(s);
      let seekTrail: Pt[] | null = seek === null ? null : seek.pts;
      let seekHead: Pt | null = null;
      if (frame?.kind === 'seek' && seek !== null) {
        const f = ease(frame.p);
        const reachedStops = seek.stops.filter((i) => arrivalAt(seek.pts, i) <= f + 1e-9);
        const levelsReached = Math.min(reachedStops.length, s.indexed.readLevels);
        const pageReached = reachedStops.length > s.indexed.readLevels;
        rightLevels = levelsReached;
        rightReadPage = pageReached ? rightReadPage : null;
        rightFound = pageReached ? rightFound : null;
        rightReads = reachedStops.length;
        const prefix = polyPrefix(seek.pts, f);
        seekTrail = prefix;
        seekHead = prefix[prefix.length - 1]!;
      }
      const fan = fanPaths(s);
      let fanHeads: Pt[] = [];
      let fanTrails: Pt[][] = fan === null ? [] : fan.branches;
      if (frame?.kind === 'fan' && fan !== null) {
        // 앞 3 할은 줄기 하나, 뒤 7 할은 가지 넷이 한꺼번에.
        const SPLIT = 0.3;
        const f = ease(frame.p);
        if (f < SPLIT) {
          const prefix = polyPrefix(fan.trunk, f / SPLIT);
          fanTrails = [prefix];
          fanHeads = [prefix[prefix.length - 1]!];
        } else {
          const g = (f - SPLIT) / (1 - SPLIT);
          fanTrails = [fan.trunk, ...fan.branches.map((b) => polyPrefix(b, g))];
          fanHeads = fan.branches.map((b) => {
            const pre = polyPrefix(b, g);
            return pre[pre.length - 1]!;
          });
        }
        if (frame.p < 1) {
          rightWritten = null;
          rightLeaves = new Set();
          rightWrites = null;
        }
      } else if (fan !== null) {
        fanTrails = [fan.trunk, ...fan.branches];
      }

      // 자취 선이 상자 밑에 깔리도록 먼저
      if (seekTrail !== null) drawTrail(layer, seekTrail, readColor);
      for (const tr of fanTrails) drawTrail(layer, tr, writeColor);
      let leftTrail: Pt[] | null = leftWritePath;
      let leftHead: Pt | null = null;
      if (frame?.kind === 'write' && leftWritePath !== null) {
        const pre = polyPrefix(leftWritePath, ease(frame.p));
        leftTrail = pre;
        leftHead = pre[pre.length - 1]!;
      }
      if (leftTrail !== null) drawTrail(layer, leftTrail, writeColor);

      drawTable(layer, s, LEFT_X, { read: leftRead, found: leftFound, written: leftWritten });
      drawIndexes(layer, s, { readLevels: rightLevels, leaves: rightLeaves });
      drawTable(layer, s, RIGHT_X, {
        read: new Set(rightReadPage === null ? [] : [rightReadPage]),
        found: rightFound,
        written: rightWritten,
      });

      // 운동 표식 — 상자 위에
      if (cursorX !== null) {
        put(layer, 'line', {
          x1: cursorX,
          y1: PAGES_TOP - 8,
          x2: cursorX,
          y2: PAGES_TOP + PAGE_H + 8,
          stroke: readColor,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
      }
      if (seekHead !== null) {
        put(layer, 'circle', { cx: seekHead.x, cy: seekHead.y, r: 6, fill: readColor });
      }
      const heads = leftHead === null ? fanHeads : [leftHead, ...fanHeads];
      for (const hd of heads) {
        put(layer, 'rect', { x: hd.x - 12, y: hd.y - 4, width: 24, height: 8, rx: 2, fill: writeColor });
      }

      drawCounters(layer, LEFT_X, leftReads, leftWrites);
      drawCounters(layer, RIGHT_X, rightReads, rightWrites);

      const caption = captionFor(s);
      if (caption !== '') {
        for (const [i, line] of splitCaption(caption).entries()) {
          label(layer, W / 2, CAPTION_Y + i * CAPTION_LINE, line, { size: fontSizes.sm, fill: colors.text });
        }
      }
    }

    // ---------------------------------------------------------------- 운동

    function play(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: IndexCostsWriteScene, prev: IndexCostsWriteScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const kind = next.step.kind;
        const ms = MOTION_MS[kind];
        if (!opts.animate || prev === null || ms === 0 || kind === 'none') {
          draw(next, null);
          return;
        }
        await play(ms, mine, (p) => draw(next, { kind, p }));
        if (destroyed || mine !== gen) return;
        draw(next, null);
      },
      destroy() {
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
