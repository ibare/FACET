/**
 * 파일 블록 배치 stage — 두 줄(색인 inode · 사슬 FAT)이 한 파일의 k 번째 블록을 찾는다.
 *
 * 줄마다 구조 한 층과 디스크 띠(블록 0..15) 한 줄. 두 디스크 띠는 같은 세로 칸에 놓여 두 줄이
 * 같은 블록에 닿는 것이 세로로 맞는다.
 *
 * 운동
 *   - inode 줄: 판이 바뀌면 inode 칸 고르개 · 번호 블록 칸 고르개가 옆으로 미끄러지고,
 *     경계를 넘을 때만 번호 블록 상자가 하나 더 밀려 나오거나(깊어짐) 앞 상자 뒤로 접혀 들어간다(얕아짐).
 *   - FAT 줄: 표 아래 발자국 사슬(호)이 앞 판 것을 남긴 채 이어 붙거나 끝에서부터 걷힌다.
 *   - 두 줄 모두 데이터 블록을 읽는 걸음에 "닿은 블록" 표지가 디스크 띠 위를 새 블록으로 건너간다.
 *   운동 길이는 projector 가 걸음마다 재생 속도로 나눠 넘긴다.
 *
 * 이 view 는 알고리즘을 모른다. 초기 구조는 initialData 에서, 판의 길과 읽기는 메서드 인자로 받는다.
 */
import {
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
const END_MARK = -1;
const EMPTY_MARK = -2;

const W = 720;
const H = 480;
const X0 = 40;
const COL = 40;
const CELL = 36;

// inode 줄
const INODE_TITLE_Y = 62;
const INODE_DIR_Y = 82;
const IBOX_TOP = 90;
const IBOX_BOTTOM = 150;
const ISLOT_TOP = 110;
const ISLOT_H = 34;
const WIDE_SLOT = 60;
const BOX_A_X = 360;
const BOX_B_X = 540;
const IDISK_TOP = 196;
const ARROW_BEND_Y = 174;

// FAT 줄
const FAT_TITLE_Y = 284;
const FAT_DIR_Y = 304;
const FAT_INDEX_Y = 324;
const FAT_TOP = 330;
const FAT_H = 32;
const FDISK_TOP = 412;
const DISK_H = 30;

type CellState = 'idle' | 'stale' | 'current' | 'read';
type InodeFromView = { kind: 'slot'; slot: number } | { kind: 'cell'; block: number; cell: number };

export interface InodeReadView {
  order: number;
  block: number;
  role: 'direct' | 'one-level' | 'two-level' | 'mid' | 'data';
  from: InodeFromView;
}

export interface FatReadView {
  order: number;
  block: number;
  role: 'hop' | 'data';
  next: number;
}

export interface RoundView {
  k: number;
  target: number;
  fileName: string;
  inodeNumber: number;
  fatFirst: number;
  inodeReads: InodeReadView[];
  fatReads: FatReadView[];
}

/** projector 가 부르는 표면 — 한 타입으로 모은다 (C9). */
export interface FileBlockPlacementStageApi {
  startRound(round: RoundView, ms: number): void;
  readInode(read: InodeReadView, ms: number): void;
  readFat(read: FatReadView, ms: number): void;
  setCaption(text: string): void;
}

interface StageData {
  fileName: string;
  blockCount: number;
  perBlock: number;
  fatFirst: number;
  fat: number[];
  inodeNumber: number;
  direct: number[];
  oneLevel: number;
  twoLevel: number;
  pointerBlocks: { block: number; cells: number[] }[];
}

function readStageData(raw: unknown): StageData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const nums = (x: unknown): number[] | null =>
    Array.isArray(x) && x.every((v) => typeof v === 'number') ? (x as number[]) : null;
  const fat = nums(r.fat);
  const direct = nums(r.direct);
  if (
    typeof r.fileName !== 'string' ||
    typeof r.blockCount !== 'number' ||
    typeof r.perBlock !== 'number' ||
    typeof r.fatFirst !== 'number' ||
    typeof r.inodeNumber !== 'number' ||
    typeof r.oneLevel !== 'number' ||
    typeof r.twoLevel !== 'number' ||
    fat === null ||
    direct === null ||
    !Array.isArray(r.pointerBlocks)
  ) {
    return null;
  }
  const pointerBlocks: { block: number; cells: number[] }[] = [];
  for (const pb of r.pointerBlocks) {
    if (typeof pb !== 'object' || pb === null) return null;
    const p = pb as Record<string, unknown>;
    const cells = nums(p.cells);
    if (typeof p.block !== 'number' || cells === null) return null;
    pointerBlocks.push({ block: p.block, cells });
  }
  return {
    fileName: r.fileName,
    blockCount: r.blockCount,
    perBlock: r.perBlock,
    fatFirst: r.fatFirst,
    fat,
    inodeNumber: r.inodeNumber,
    direct,
    oneLevel: r.oneLevel,
    twoLevel: r.twoLevel,
    pointerBlocks,
  };
}

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

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { size?: string; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
): SVGTextElement {
  const e = el(
    'text',
    {
      x,
      y,
      'font-family': opts.mono ? fonts.mono : fonts.body,
      'font-size': opts.size ?? fontSizes.sm,
      'font-weight': opts.weight ?? 400,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
      fill: opts.fill,
    },
    parent,
  );
  e.textContent = text;
  return e;
}

function colX(b: number): number {
  return X0 + b * COL + (COL - CELL) / 2;
}

/** inode 칸 i 의 왼쪽 x 와 폭 — 직접 칸은 좁게, 간접 칸 둘은 넓게. */
function slotBox(i: number, nDirect: number): { x: number; w: number } {
  if (i < nDirect) return { x: colX(i), w: CELL };
  const base = X0 + nDirect * COL + 8;
  return { x: base + (i - nDirect) * (WIDE_SLOT + 4), w: WIDE_SLOT };
}

interface Cell {
  rect: SVGRectElement;
  text: SVGTextElement;
  state: CellState;
  empty: boolean;
}

interface Footprint {
  from: number;
  to: number;
  path: SVGPathElement;
  fresh: boolean;
}

interface PointerBox {
  group: SVGGElement;
  frame: SVGRectElement;
  title: SVGTextElement;
  cells: Cell[];
  selector: SVGRectElement;
  block: number | null;
  shown: boolean;
}

interface Marker {
  group: SVGGElement;
  text: SVGTextElement;
  at: number | null;
}

/** 화살촉 marker id 를 마운트마다 가른다 — 한 문서에 둘이 떠도 부딪히지 않게. */
let mountSerial = 0;

export const fileBlockPlacementStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params) {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pal: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const data = readStageData(params.initialData);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    /** 새 요소의 첫 모습이 그려진 뒤에 옮긴다 — 같은 틀에서 바꾸면 transition 이 건너뛴다. */
    const afterPaint = (fn: () => void): void => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(fn));
      else later(0, fn);
    };
    const move = (node: SVGElement, x: number, y: number, ms: number): void => {
      node.style.transition = `transform ${Math.round(ms)}ms ease, opacity ${Math.round(ms)}ms ease`;
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: pal.bg }, root);
    const caption = label(root, X0, 26, '', { size: fontSizes.md, fill: pal.text, weight: 600 });

    if (data === null) {
      // initialData 없이 마운트해도 던지지 않는다 — 빈 틀만 둔다.
      const api: FileBlockPlacementStageApi & ViewInstance = {
        startRound() {
          throw new Error('[fileBlockPlacementStage] initialData 가 없어 판을 그릴 수 없다');
        },
        readInode() {
          throw new Error('[fileBlockPlacementStage] initialData 가 없다');
        },
        readFat() {
          throw new Error('[fileBlockPlacementStage] initialData 가 없다');
        },
        setCaption(text: string) {
          caption.textContent = text;
        },
        destroy() {
          root.remove();
        },
      };
      return api;
    }

    const nDirect = data.direct.length;
    const per = data.perBlock;
    const pointerOf = (b: number): number[] => {
      const pb = data.pointerBlocks.find((p) => p.block === b);
      if (!pb) throw new Error(`[fileBlockPlacementStage] 번호 블록 ${b} 의 내용이 initialData 에 없다`);
      return pb.cells;
    };

    const paintCell = (c: Cell, state: CellState): void => {
      c.state = state;
      c.rect.style.transition = 'fill 160ms ease, stroke 160ms ease';
      c.rect.removeAttribute('stroke-dasharray');
      if (state === 'current') {
        c.rect.setAttribute('fill', pal.itemActive);
        c.rect.setAttribute('stroke', pal.itemActive);
        c.text.setAttribute('fill', pal.stateInk);
      } else if (state === 'read') {
        c.rect.setAttribute('fill', pal.itemSorted);
        c.rect.setAttribute('stroke', pal.itemSorted);
        c.text.setAttribute('fill', pal.bg);
      } else if (state === 'stale') {
        c.rect.setAttribute('fill', pal.bg);
        c.rect.setAttribute('stroke', pal.ghostOutline);
        c.rect.setAttribute('stroke-dasharray', '3 2');
        c.text.setAttribute('fill', pal.textMuted);
      } else {
        c.rect.setAttribute('fill', c.empty ? pal.bgSubtle : pal.bg);
        c.rect.setAttribute('stroke', pal.border);
        c.text.setAttribute('fill', pal.text);
      }
    };

    const makeCell = (parent: Element, x: number, y: number, w: number, h: number, text: string, empty: boolean): Cell => {
      const rect = el('rect', { x, y, width: w, height: h, rx: 3, 'stroke-width': 1 }, parent);
      const tx = label(parent, x + w / 2, y + h / 2 + 1, text, { anchor: 'middle', fill: pal.text, mono: true });
      const c: Cell = { rect, text: tx, state: 'idle', empty };
      paintCell(c, 'idle');
      return c;
    };

    const defs = el('defs', {}, root);
    const markerId = `fbp-arrow-${++mountSerial}`;
    const head = el('marker', { id: markerId, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L8,4 L0,8 z', fill: pal.textMuted }, head);

    // ── inode 줄 ───────────────────────────────────────────────────────────
    const inodeLayer = el('g', {}, root);
    label(inodeLayer, X0, INODE_TITLE_Y, t('label.inodeRow', 'Indexed (inode)'), { size: fontSizes.md, fill: pal.text, weight: 700 });
    const inodeCount = label(inodeLayer, W - 20, INODE_TITLE_Y, t('label.reads', 'Reads: {n}', { n: 0 }), {
      size: fontSizes.md,
      fill: pal.text,
      anchor: 'end',
      weight: 600,
    });
    const inodeDir = label(
      inodeLayer,
      X0,
      INODE_DIR_Y,
      t('label.dirInode', '{name} → inode {n}', { name: data.fileName, n: data.inodeNumber }),
      { fill: pal.textMuted, mono: true },
    );

    const lastSlot = slotBox(nDirect + 1, nDirect);
    el(
      'rect',
      { x: X0 - 4, y: IBOX_TOP, width: lastSlot.x + lastSlot.w + 6 - (X0 - 4), height: IBOX_BOTTOM - IBOX_TOP, rx: 6, fill: pal.bgSubtle, stroke: pal.border },
      inodeLayer,
    );
    label(inodeLayer, X0, IBOX_TOP + 11, t('label.inodeBox', 'inode {n}', { n: data.inodeNumber }), {
      size: fontSizes.xs,
      fill: pal.text,
      weight: 700,
    });
    const directEnd = slotBox(nDirect - 1, nDirect);
    label(inodeLayer, (X0 + directEnd.x + directEnd.w) / 2 + 10, IBOX_TOP + 11, t('label.direct', 'direct'), {
      size: fontSizes.xs,
      fill: pal.textMuted,
      anchor: 'middle',
    });
    const one = slotBox(nDirect, nDirect);
    const two = slotBox(nDirect + 1, nDirect);
    label(inodeLayer, one.x + one.w / 2, IBOX_TOP + 11, t('label.oneLevel', 'single'), { size: fontSizes.xs, fill: pal.textMuted, anchor: 'middle' });
    label(inodeLayer, two.x + two.w / 2, IBOX_TOP + 11, t('label.twoLevel', 'double'), { size: fontSizes.xs, fill: pal.textMuted, anchor: 'middle' });
    for (let i = 0; i < nDirect; i++) {
      const s = slotBox(i, nDirect);
      makeCell(inodeLayer, s.x, ISLOT_TOP, s.w, ISLOT_H, String(data.direct[i]), false);
    }
    // 간접 칸 둘에는 번호 블록의 번호가 적혀 있다
    makeCell(inodeLayer, one.x, ISLOT_TOP, one.w, ISLOT_H, `→ ${data.oneLevel}`, false);
    makeCell(inodeLayer, two.x, ISLOT_TOP, two.w, ISLOT_H, `→ ${data.twoLevel}`, false);
    const slotSelector = el(
      'rect',
      { x: 0, y: ISLOT_TOP - 3, width: CELL + 6, height: ISLOT_H + 6, rx: 5, fill: 'none', stroke: pal.primary, 'stroke-width': 2, opacity: 0 },
      inodeLayer,
    );

    const makeBox = (x0: number): PointerBox => {
      const group = el('g', {}, inodeLayer);
      const frame = el('rect', { x: x0 - 4, y: IBOX_TOP, width: per * COL + 8 - (COL - CELL), height: IBOX_BOTTOM - IBOX_TOP, rx: 6, fill: pal.bgSubtle, stroke: pal.ghostOutline, 'stroke-dasharray': '4 3' }, group);
      const title = label(group, x0, IBOX_TOP + 11, '', { size: fontSizes.xs, fill: pal.text, weight: 700 });
      const cells: Cell[] = [];
      for (let j = 0; j < per; j++) cells.push(makeCell(group, x0 + j * COL, ISLOT_TOP, CELL, ISLOT_H, '', true));
      const selector = el('rect', { x: x0 - 3, y: ISLOT_TOP - 3, width: CELL + 6, height: ISLOT_H + 6, rx: 5, fill: 'none', stroke: pal.primary, 'stroke-width': 2 }, group);
      group.style.opacity = '0';
      group.style.transform = `translate(${-(x0 - (lastSlot.x + lastSlot.w))}px, 0px)`;
      return { group, frame, title, cells, selector, block: null, shown: false };
    };
    const boxA = makeBox(BOX_A_X);
    const boxB = makeBox(BOX_B_X);
    // 접혀 있을 때 B 는 A 뒤에 숨는다
    boxB.group.style.transform = `translate(${BOX_A_X - BOX_B_X}px, 0px)`;

    const fillBox = (box: PointerBox, block: number): void => {
      box.block = block;
      box.title.textContent = t('label.block', 'block {n}', { n: block });
      const cells = pointerOf(block);
      box.cells.forEach((c, j) => {
        const v = cells[j];
        if (v === undefined) throw new Error(`[fileBlockPlacementStage] 번호 블록 ${block} 의 칸 ${j + 1} 이 없다`);
        c.empty = v === EMPTY_MARK;
        c.text.textContent = c.empty ? '' : String(v);
        paintCell(c, 'idle');
      });
    };
    const showBox = (box: PointerBox, hiddenDx: number, on: boolean, ms: number): void => {
      box.shown = on;
      move(box.group, on ? 0 : hiddenDx, 0, ms);
      box.group.style.opacity = on ? '1' : '0';
    };
    const frameState = (box: PointerBox, s: 'planned' | 'current' | 'read'): void => {
      if (s === 'planned') {
        box.frame.setAttribute('stroke', pal.ghostOutline);
        box.frame.setAttribute('stroke-dasharray', '4 3');
        box.frame.setAttribute('stroke-width', '1');
      } else {
        box.frame.removeAttribute('stroke-dasharray');
        box.frame.setAttribute('stroke', s === 'current' ? pal.itemActive : pal.itemSorted);
        box.frame.setAttribute('stroke-width', '2');
      }
    };

    const arrows: SVGPathElement[] = [0, 1, 2].map(() =>
      el('path', { d: '', fill: 'none', stroke: pal.textMuted, 'stroke-width': 1.5, 'marker-end': `url(#${markerId})`, opacity: 0 }, inodeLayer),
    );
    const arrowState = (a: SVGPathElement, s: 'hidden' | 'planned' | 'solid'): void => {
      a.setAttribute('opacity', s === 'hidden' ? '0' : '1');
      if (s === 'planned') a.setAttribute('stroke-dasharray', '4 3');
      else a.removeAttribute('stroke-dasharray');
      a.setAttribute('stroke', s === 'solid' ? pal.text : pal.ghostOutline);
    };
    const uCurve = (sx: number, tx: number, ty: number): string =>
      `M${sx},${IBOX_BOTTOM} C${sx},${ARROW_BEND_Y} ${tx},${ARROW_BEND_Y} ${tx},${ty}`;

    const makeDisk = (parent: Element, top: number): Cell[] => {
      const out: Cell[] = [];
      for (let b = 0; b < data.blockCount; b++) out.push(makeCell(parent, colX(b), top, CELL, DISK_H, String(b), false));
      label(parent, colX(data.blockCount - 1) + CELL + 6, top + DISK_H / 2, t('label.disk', 'disk'), { size: fontSizes.xs, fill: pal.textMuted });
      return out;
    };
    const inodeDisk = makeDisk(inodeLayer, IDISK_TOP);

    const makeMarker = (parent: Element, top: number): Marker => {
      const group = el('g', {}, parent);
      el('path', { d: `M${CELL / 2},${top + DISK_H + 4} l-6,9 h12 z`, fill: pal.accent, stroke: pal.stateInk, 'stroke-width': 0.8 }, group);
      const text = label(group, CELL / 2, top + DISK_H + 22, '', { size: fontSizes.xs, fill: pal.text, anchor: 'middle', weight: 700, mono: true });
      group.style.opacity = '0';
      return { group, text, at: null };
    };
    const inodeMarker = makeMarker(inodeLayer, IDISK_TOP);

    // ── 가름줄 ─────────────────────────────────────────────────────────────
    el('line', { x1: X0 - 20, x2: W - 20, y1: 262, y2: 262, stroke: pal.border }, root);

    // ── FAT 줄 ─────────────────────────────────────────────────────────────
    const fatLayer = el('g', {}, root);
    label(fatLayer, X0, FAT_TITLE_Y, t('label.fatRow', 'Linked (FAT)'), { size: fontSizes.md, fill: pal.text, weight: 700 });
    const fatCount = label(fatLayer, W - 20, FAT_TITLE_Y, t('label.reads', 'Reads: {n}', { n: 0 }), {
      size: fontSizes.md,
      fill: pal.text,
      anchor: 'end',
      weight: 600,
    });
    const fatDir = label(
      fatLayer,
      X0,
      FAT_DIR_Y,
      t('label.dirFat', '{name} → first block {n}', { name: data.fileName, n: data.fatFirst }),
      { fill: pal.textMuted, mono: true },
    );
    label(fatLayer, colX(data.blockCount - 1) + CELL + 6, FAT_TOP + FAT_H / 2, t('label.table', 'table'), { size: fontSizes.xs, fill: pal.textMuted });
    const fatCells: Cell[] = [];
    for (let b = 0; b < data.blockCount; b++) {
      label(fatLayer, colX(b) + CELL / 2, FAT_INDEX_Y, String(b), { size: fontSizes.xs, fill: pal.textMuted, anchor: 'middle', mono: true });
      const v = data.fat[b];
      if (v === undefined) throw new Error(`[fileBlockPlacementStage] FAT 칸 ${b} 이 없다`);
      const text = v === EMPTY_MARK ? '' : v === END_MARK ? t('label.end', 'END') : String(v);
      fatCells.push(makeCell(fatLayer, colX(b), FAT_TOP, CELL, FAT_H, text, v === EMPTY_MARK));
    }
    const arcLayer = el('g', {}, fatLayer);
    const fatDisk = makeDisk(fatLayer, FDISK_TOP);
    const fatMarker = makeMarker(fatLayer, FDISK_TOP);
    let footprints: Footprint[] = [];

    /** 발자국 호 — 차례마다 한 줄씩 깊어져 사슬의 순서가 겹치지 않게 읽힌다. */
    const arcPath = (from: number, to: number, order: number): string => {
      const sx = colX(from) + CELL / 2;
      const tx = colX(to) + CELL / 2;
      const depth = Math.min(50, 10 + order * 3.6);
      const y = FAT_TOP + FAT_H;
      return `M${sx},${y + 2} C${sx},${y + depth} ${tx},${y + depth} ${tx},${y + 4}`;
    };
    const arcStyle = (p: SVGPathElement, fresh: boolean): void => {
      p.setAttribute('stroke', fresh ? pal.itemSorted : pal.ghostOutline);
      p.setAttribute('stroke-width', fresh ? '2' : '1.5');
    };

    // ── 상태 ───────────────────────────────────────────────────────────────
    let current: Cell | null = null;
    const setCurrent = (c: Cell): void => {
      if (current && current !== c) paintCell(current, 'read');
      paintCell(c, 'current');
      current = c;
    };
    const diskCell = (disk: Cell[], b: number): Cell => {
      const c = disk[b];
      if (!c) throw new Error(`[fileBlockPlacementStage] 디스크 블록 ${b} 이 없다`);
      return c;
    };
    const landMarker = (m: Marker, b: number, ms: number): void => {
      m.text.textContent = t('label.block', 'block {n}', { n: b });
      const x = colX(b);
      if (m.at === null) {
        m.group.style.transition = 'none';
        m.group.style.transform = `translate(${x}px, 0px)`;
        m.group.style.opacity = '1';
      } else {
        move(m.group, x, 0, ms);
      }
      m.at = b;
    };

    let round: RoundView | null = null;
    let inodePlan: { depth: number; slot: number; cellA: number | null; cellB: number | null } | null = null;

    const api: FileBlockPlacementStageApi & ViewInstance = {
      setCaption(text: string) {
        caption.textContent = text;
      },

      startRound(r: RoundView, ms: number) {
        round = r;
        current = null;
        inodeCount.textContent = t('label.reads', 'Reads: {n}', { n: 0 });
        fatCount.textContent = t('label.reads', 'Reads: {n}', { n: 0 });
        inodeDir.textContent = t('label.dirInode', '{name} → inode {n}', { name: r.fileName, n: r.inodeNumber });
        fatDir.textContent = t('label.dirFat', '{name} → first block {n}', { name: r.fileName, n: r.fatFirst });
        for (const c of inodeDisk) paintCell(c, 'idle');
        for (const c of fatDisk) paintCell(c, 'idle');

        // inode 줄 — 길의 모양을 옮긴다
        const first = r.inodeReads[0];
        if (!first || first.from.kind !== 'slot') throw new Error('[fileBlockPlacementStage] inode 길이 inode 칸에서 시작하지 않는다');
        const depth = r.inodeReads.length - 1;
        if (depth < 0 || depth > 2) throw new Error(`[fileBlockPlacementStage] inode 길 깊이 ${depth} 를 그릴 수 없다`);
        const slot = first.from.slot;
        const cellOf = (i: number): number | null => {
          const rd = r.inodeReads[i];
          if (!rd) return null;
          if (rd.from.kind !== 'cell') throw new Error('[fileBlockPlacementStage] 번호 블록 칸이 아닌 곳에서 읽었다');
          return rd.from.cell;
        };
        inodePlan = { depth, slot, cellA: depth >= 1 ? cellOf(1) : null, cellB: depth >= 2 ? cellOf(2) : null };

        const s = slotBox(slot, nDirect);
        slotSelector.setAttribute('width', String(s.w + 6));
        slotSelector.setAttribute('opacity', '1');
        slotSelector.setAttribute('x', '0');
        move(slotSelector, s.x - 3, 0, ms);

        if (depth >= 1) {
          if (boxA.block !== first.block) fillBox(boxA, first.block);
          else boxA.cells.forEach((c) => paintCell(c, 'idle'));
          frameState(boxA, 'planned');
          move(boxA.selector, (inodePlan.cellA ?? 0) * COL, 0, ms);
        }
        showBox(boxA, -(BOX_A_X - (lastSlot.x + lastSlot.w)), depth >= 1, ms);
        if (depth >= 2) {
          const mid = r.inodeReads[1]!.block;
          if (boxB.block !== mid) fillBox(boxB, mid);
          else boxB.cells.forEach((c) => paintCell(c, 'idle'));
          frameState(boxB, 'planned');
          move(boxB.selector, (inodePlan.cellB ?? 0) * COL, 0, ms);
        }
        showBox(boxB, BOX_A_X - BOX_B_X, depth >= 2, ms);

        // 화살 — 고른 칸에서 다음 상자로, 마지막은 디스크 띠의 닿을 블록으로
        const target = r.inodeReads[depth]!.block;
        const sx = s.x + s.w / 2;
        const aCellX = BOX_A_X + (inodePlan.cellA ?? 0) * COL + CELL / 2;
        const bCellX = BOX_B_X + (inodePlan.cellB ?? 0) * COL + CELL / 2;
        const diskX = colX(target) + CELL / 2;
        const hops: [number, number, number][] =
          depth === 0
            ? [[sx, diskX, IDISK_TOP - 2]]
            : depth === 1
              ? [[sx, BOX_A_X + CELL / 2, IBOX_BOTTOM + 1], [aCellX, diskX, IDISK_TOP - 2]]
              : [[sx, BOX_A_X + CELL / 2, IBOX_BOTTOM + 1], [aCellX, BOX_B_X + CELL / 2, IBOX_BOTTOM + 1], [bCellX, diskX, IDISK_TOP - 2]];
        arrows.forEach((a, i) => {
          const h = hops[i];
          if (!h) {
            arrowState(a, 'hidden');
            return;
          }
          a.setAttribute('d', uCurve(h[0], h[1], h[2]));
          arrowState(a, 'planned');
        });

        // FAT 줄 — 앞 판의 발자국을 남기고, 넘치는 것은 끝에서부터 걷는다
        const hopsFat = r.fatReads.filter((f) => f.role === 'hop');
        const keep = Math.min(footprints.length, hopsFat.length);
        const extra = footprints.slice(keep);
        footprints = footprints.slice(0, keep);
        extra.reverse().forEach((fp, i) => {
          const each = ms / Math.max(1, extra.length);
          later(i * each, () => {
            fp.path.style.transition = `stroke-dashoffset ${Math.round(each)}ms linear`;
            fp.path.style.strokeDashoffset = '1';
            later(each, () => fp.path.remove());
          });
        });
        for (const c of fatCells) paintCell(c, 'idle');
        footprints.forEach((fp, i) => {
          const h = hopsFat[i]!;
          if (fp.from !== h.block || fp.to !== h.next) {
            throw new Error('[fileBlockPlacementStage] 앞 판의 발자국이 이번 사슬과 다르다');
          }
          fp.fresh = false;
          arcStyle(fp.path, false);
          paintCell(fatCells[fp.from]!, 'stale');
        });
      },

      readInode(rd: InodeReadView, ms: number) {
        if (round === null || inodePlan === null) throw new Error('[fileBlockPlacementStage] 판이 시작되지 않았다');
        inodeCount.textContent = t('label.reads', 'Reads: {n}', { n: rd.order });
        setCurrent(diskCell(inodeDisk, rd.block));
        const idx = rd.order - 1;
        const a = arrows[idx];
        if (a) arrowState(a, 'solid');
        if (rd.role === 'one-level' || rd.role === 'two-level') {
          frameState(boxA, 'current');
        } else if (rd.role === 'mid') {
          frameState(boxA, 'read');
          frameState(boxB, 'current');
        } else if (rd.role === 'data') {
          if (inodePlan.depth >= 1) frameState(boxA, 'read');
          if (inodePlan.depth >= 2) frameState(boxB, 'read');
          landMarker(inodeMarker, rd.block, ms);
        } else {
          landMarker(inodeMarker, rd.block, ms);
        }
      },

      readFat(rd: FatReadView, ms: number) {
        if (round === null) throw new Error('[fileBlockPlacementStage] 판이 시작되지 않았다');
        fatCount.textContent = t('label.reads', 'Reads: {n}', { n: rd.order });
        if (rd.role === 'hop') {
          const cell = fatCells[rd.block];
          if (!cell) throw new Error(`[fileBlockPlacementStage] FAT 칸 ${rd.block} 이 없다`);
          setCurrent(cell);
          const i = rd.order - 1;
          const fp = footprints[i];
          if (fp) {
            fp.fresh = true;
            arcStyle(fp.path, true);
          } else {
            const path = el('path', { d: arcPath(rd.block, rd.next, rd.order), fill: 'none', pathLength: 1, 'stroke-dasharray': '1 1', 'marker-end': `url(#${markerId})` }, arcLayer);
            arcStyle(path, true);
            path.style.strokeDashoffset = '1';
            footprints.push({ from: rd.block, to: rd.next, path, fresh: true });
            afterPaint(() => {
              path.style.transition = `stroke-dashoffset ${Math.round(ms)}ms ease`;
              path.style.strokeDashoffset = '0';
            });
          }
        } else {
          setCurrent(diskCell(fatDisk, rd.block));
          landMarker(fatMarker, rd.block, ms);
        }
      },

      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
    void container;
    return api;
  },
};
