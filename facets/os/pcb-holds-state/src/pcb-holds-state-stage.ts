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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PcbEntry, PcbScene, PcbSceneTable, PcbStep } from './scene.js';

/**
 * pcb-holds-state 의 무대.
 *
 * 위는 커널이 나눠 주는 것 — 메모리 칸 한 줄과 열린 파일 한 줄. 아래는 프로세스마다 표 한 장.
 * 받을 때는 칸 · 파일에서 조각 하나가 떨어져 나와 그 표의 목록 끝으로 **내려가 적히고**,
 * 끝날 때는 커널이 그 표에서 제자리까지 이어진 줄을 **따라** 조각이 하나씩 **올라가 풀린다**.
 * 표가 비면 표가 접혀 사라진다. 다른 표는 흐려진 채 그대로 둔다.
 */

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const GAP = 6;
const MOVE_MS = 450;
const FRAME_MS = 16;

const CAPTION_Y = 24;
const MEM_LABEL_Y = 50;
const CELL_TOP = 58;
const CELL_H = 40;
const FILE_LABEL_Y = 120;
const FILE_TOP = 128;
const CHIP_H = 26;
const TABLE_LABEL_Y = 178;
const CARD_TOP = 186;
const CARD_H = H - CARD_TOP - 10;
const CARD_GAP = 16;
const ROW_LABEL_W = 56;
const SLOT_CHIP_W = 34;

/** 긴 글자 한 자의 폭 비 (고정폭 글꼴) */
const MONO_RATIO = 0.6;

type Box = { x: number; y: number; w: number; h: number };
type Row = 'slots' | 'files';

type Geometry = {
  cellW: number;
  fileW: number;
  cardW: number;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const pcbHoldsStateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);
    const MD = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    function write(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: number; fill: string; mono?: boolean; weight?: number; anchor?: string },
    ): void {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opts.fill,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = text;
    }

    function procName(id: string): string {
      switch (id) {
        case 'editor':
          return t('label.proc.editor', 'Editor');
        case 'player':
          return t('label.proc.player', 'Music player');
        default:
          throw new Error(`pcb-holds-state: 이름 문안이 없는 프로세스 — ${id}`);
      }
    }

    // ── 자리 셈 ─────────────────────────────────────────────

    function geometry(scene: PcbScene): Geometry {
      const inner = W - 2 * PAD;
      const n = Math.max(scene.slotCount, 1);
      const cellW = Math.min(56, (inner - GAP * (n - 1)) / n);
      const cards = Math.max(scene.procs.length, 1);
      const cardW = (inner - CARD_GAP * (cards - 1)) / cards;
      let longest = 0;
      for (const tb of scene.tables) for (const f of tb.files) longest = Math.max(longest, f.length);
      for (const o of scene.openFiles) longest = Math.max(longest, o.file.length);
      const natural = Math.max(longest, 6) * SM * MONO_RATIO + 18;
      const places = Math.max(scene.fileCount, 1);
      const fileW = Math.min(natural, (inner - GAP * (places - 1)) / places);
      return { cellW, fileW, cardW };
    }

    function cellBox(g: Geometry, slot: number): Box {
      return { x: PAD + slot * (g.cellW + GAP), y: CELL_TOP, w: g.cellW, h: CELL_H };
    }

    function openFileBox(g: Geometry, at: number): Box {
      return { x: PAD + at * (g.fileW + GAP), y: FILE_TOP, w: g.fileW, h: CHIP_H };
    }

    function cardBox(g: Geometry, scene: PcbScene, pid: number): Box {
      const i = scene.procs.findIndex((p) => p.pid === pid);
      if (i < 0) throw new Error(`pcb-holds-state: 표 ${pid} 의 자리가 없다`);
      return { x: PAD + i * (g.cardW + CARD_GAP), y: CARD_TOP, w: g.cardW, h: CARD_H };
    }

    function rowY(row: Row): number {
      return row === 'slots' ? CARD_TOP + 44 : CARD_TOP + 90;
    }

    function chipW(g: Geometry, row: Row, card: Box, count: number): number {
      const room = card.w - 12 - ROW_LABEL_W - 10;
      const want = row === 'slots' ? SLOT_CHIP_W : g.fileW;
      if (count <= 0) return want;
      return Math.min(want, (room - GAP * (count - 1)) / count);
    }

    function entryBox(g: Geometry, scene: PcbScene, pid: number, row: Row, index: number, count: number): Box {
      const card = cardBox(g, scene, pid);
      const w = chipW(g, row, card, count);
      return { x: card.x + 12 + ROW_LABEL_W + index * (w + GAP), y: rowY(row), w, h: CHIP_H };
    }

    function resourceBox(g: Geometry, scene: PcbScene, entry: PcbEntry, pid: number, openAt: number | null): Box {
      if (entry.kind === 'slot') return cellBox(g, entry.slot);
      if (openAt !== null) return openFileBox(g, openAt);
      const o = scene.openFiles.find((f) => f.pid === pid && f.file === entry.file);
      if (o === undefined) throw new Error(`pcb-holds-state: 열린 파일에 ${entry.file} 가 없다`);
      return openFileBox(g, o.at);
    }

    function ownerColor(scene: PcbScene, pid: number): string {
      const i = scene.procs.findIndex((p) => p.pid === pid);
      if (i < 0) throw new Error(`pcb-holds-state: 번호 ${pid} 의 색이 없다`);
      const palette = categorical(scene.procs.length, 'vivid');
      const c = palette[i];
      if (c === undefined) throw new Error(`pcb-holds-state: 번호 ${pid} 의 색이 없다`);
      return c;
    }

    // ── 조각 하나 (표의 한 줄 · 날아가는 것) ─────────────────

    function drawChip(parent: Element, box: Box, entry: PcbEntry, color: string): void {
      el(
        'rect',
        {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 5,
          fill: colors.bg,
          stroke: color,
          'stroke-width': 1.5,
        },
        parent,
      );
      el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 5, fill: color, 'fill-opacity': 0.22 }, parent);
      const label = entry.kind === 'slot' ? String(entry.slot) : entry.file;
      write(parent, box.x + box.w / 2, box.y + box.h / 2, label, {
        size: SM,
        fill: colors.text,
        mono: true,
        anchor: 'middle',
      });
    }

    function pointer(parent: Element, from: Box, to: Box): void {
      el(
        'line',
        {
          x1: from.x + from.w / 2,
          y1: from.y,
          x2: to.x + to.w / 2,
          y2: to.y + to.h,
          stroke: colors.accent,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        },
        parent,
      );
    }

    // ── 정적 그리기 ─────────────────────────────────────────

    type Skip = { pid: number; row: Row; from: number } | null;

    function caption(scene: PcbScene): string {
      const s: PcbStep | null = scene.step;
      if (s === null) {
        let freeSlots = 0;
        for (const o of scene.owner) if (o === null) freeSlots += 1;
        return t('caption.start', 'One table per process. Free slots: {n}.', { n: freeSlots });
      }
      if (s.kind === 'grant') {
        if (s.entry.kind === 'slot') {
          return t('caption.grantSlot', 'Process {pid} takes slot {slot}. One line is written in its table.', {
            pid: s.pid,
            slot: s.entry.slot,
          });
        }
        return t('caption.grantFile', 'Process {pid} opens {file}. One line is written in its table.', {
          pid: s.pid,
          file: s.entry.file,
        });
      }
      if (s.kind === 'release') {
        if (s.entry.kind === 'slot') {
          if (s.first) {
            return t('caption.exitSlot', 'Process {pid} ends. The kernel follows its table: slot {slot} returned.', {
              pid: s.pid,
              slot: s.entry.slot,
            });
          }
          return t('caption.releaseSlot', 'Following table {pid}: slot {slot} returned.', {
            pid: s.pid,
            slot: s.entry.slot,
          });
        }
        if (s.first) {
          return t('caption.exitFile', 'Process {pid} ends. The kernel follows its table: {file} closed.', {
            pid: s.pid,
            file: s.entry.file,
          });
        }
        return t('caption.releaseFile', 'Following table {pid}: {file} closed.', { pid: s.pid, file: s.entry.file });
      }
      return t('caption.drop', 'Table {pid} emptied and erased. Followed: {n}. Left alone: {m}.', {
        pid: s.pid,
        n: s.followed,
        m: s.untouched,
      });
    }

    function drawTable(root: Element, g: Geometry, scene: PcbScene, tb: PcbSceneTable, skip: Skip): void {
      const card = cardBox(g, scene, tb.pid);
      const color = ownerColor(scene, tb.pid);
      const following = scene.exiting === tb.pid;
      const layer = el('g', {}, root);
      if (scene.exiting !== null && !following) layer.setAttribute('opacity', '0.4');
      el(
        'rect',
        {
          x: card.x,
          y: card.y,
          width: card.w,
          height: card.h,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: following ? colors.accent : colors.border,
          'stroke-width': following ? 2 : 1,
        },
        layer,
      );
      el('rect', { x: card.x, y: card.y + 8, width: 4, height: card.h - 16, rx: 2, fill: color }, layer);
      const rows: [Row, string, PcbEntry[]][] = [
        ['slots', t('label.rowSlots', 'Slots'), tb.slots.map((slot): PcbEntry => ({ kind: 'slot', slot }))],
        ['files', t('label.rowFiles', 'Files'), tb.files.map((file): PcbEntry => ({ kind: 'file', file }))],
      ];
      // 따라가는 표의 줄마다 제자리로 잇는 선 — 글자 · 조각 밑으로 깐다
      if (following) {
        for (const [row, , entries] of rows) {
          entries.forEach((entry, i) => {
            if (skip !== null && skip.pid === tb.pid && skip.row === row && i >= skip.from) return;
            const box = entryBox(g, scene, tb.pid, row, i, entries.length);
            pointer(layer, box, resourceBox(g, scene, entry, tb.pid, null));
          });
        }
      }
      const pidText = String(tb.pid);
      write(layer, card.x + 14, card.y + 20, pidText, { size: MD, fill: colors.text, mono: true, weight: 700 });
      const proc = scene.procs.find((p) => p.pid === tb.pid);
      if (proc === undefined) throw new Error(`pcb-holds-state: 표 ${tb.pid} 의 프로세스가 없다`);
      const nameX = card.x + 14 + pidText.length * MD * MONO_RATIO + 8;
      write(layer, nameX, card.y + 20, procName(proc.id), { size: SM, fill: colors.textMuted });
      if (following) {
        write(layer, card.x + card.w - 12, card.y + 20, t('label.ended', 'ended'), {
          size: XS,
          fill: colors.text,
          anchor: 'end',
          weight: 700,
        });
      }

      for (const [row, label, entries] of rows) {
        const y = rowY(row);
        write(layer, card.x + 14, y + CHIP_H / 2, label, { size: XS, fill: colors.textMuted });
        el(
          'line',
          {
            x1: card.x + 12 + ROW_LABEL_W - 6,
            y1: y + CHIP_H + 6,
            x2: card.x + card.w - 12,
            y2: y + CHIP_H + 6,
            stroke: colors.border,
            'stroke-width': 1,
          },
          layer,
        );
        entries.forEach((entry, i) => {
          if (skip !== null && skip.pid === tb.pid && skip.row === row && i >= skip.from) return;
          const box = entryBox(g, scene, tb.pid, row, i, entries.length);
          drawChip(layer, box, entry, color);
        });
      }
    }

    function drawStatic(scene: PcbScene, skip: Skip): Geometry {
      svg.textContent = '';
      const g = geometry(scene);
      if (scene.slotCount === 0) return g;

      write(svg, PAD, CAPTION_Y, caption(scene), { size: MD, fill: colors.text });

      write(svg, PAD, MEM_LABEL_Y, t('label.memory', 'Memory slots'), { size: XS, fill: colors.textMuted });
      scene.owner.forEach((own, slot) => {
        const box = cellBox(g, slot);
        const color = own === null ? null : ownerColor(scene, own);
        el(
          'rect',
          {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: color ?? colors.border,
            'stroke-width': color === null ? 1 : 1.5,
          },
          svg,
        );
        if (color !== null) {
          el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 4, fill: color, 'fill-opacity': 0.28 }, svg);
          write(svg, box.x + box.w / 2, box.y + box.h / 2 + 5, String(own), {
            size: SM,
            fill: colors.text,
            mono: true,
            anchor: 'middle',
            weight: 700,
          });
        }
        write(svg, box.x + 5, box.y + 9, String(slot), { size: XS, fill: colors.textMuted, mono: true });
      });

      write(svg, PAD, FILE_LABEL_Y, t('label.openFiles', 'Open files'), { size: XS, fill: colors.textMuted });
      for (const o of scene.openFiles) {
        drawChip(svg, openFileBox(g, o.at), { kind: 'file', file: o.file }, ownerColor(scene, o.pid));
      }

      write(svg, PAD, TABLE_LABEL_Y, t('label.tables', 'Process tables'), { size: XS, fill: colors.textMuted });
      // 따라가는 표를 뒤에 그려 그 줄이 다른 표 위로 지나가게 한다
      const order = [...scene.tables].sort((a, b) => Number(a.pid === scene.exiting) - Number(b.pid === scene.exiting));
      for (const tb of order) drawTable(svg, g, scene, tb, skip);
      return g;
    }

    // ── 흐름 ────────────────────────────────────────────────

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
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
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function moveGrant(mine: number, scene: PcbScene, s: Extract<PcbStep, { kind: 'grant' }>): Promise<void> {
      const tb = scene.tables.find((x) => x.pid === s.pid);
      if (tb === undefined) throw new Error(`pcb-holds-state: 표 ${s.pid} 가 없다`);
      const row: Row = s.entry.kind === 'slot' ? 'slots' : 'files';
      const count = row === 'slots' ? tb.slots.length : tb.files.length;
      const g = drawStatic(scene, { pid: s.pid, row, from: count - 1 });
      const from = resourceBox(g, scene, s.entry, s.pid, null);
      const to = entryBox(g, scene, s.pid, row, count - 1, count);
      const color = ownerColor(scene, s.pid);
      const layer = el('g', {}, svg);
      await tween(mine, MOVE_MS, (p) => {
        layer.textContent = '';
        const box: Box = {
          x: lerp(from.x + (from.w - to.w) / 2, to.x, p),
          y: lerp(from.y + (from.h - to.h) / 2, to.y, p),
          w: to.w,
          h: to.h,
        };
        drawChip(layer, box, s.entry, color);
      });
    }

    async function moveRelease(mine: number, scene: PcbScene, s: Extract<PcbStep, { kind: 'release' }>): Promise<void> {
      const tb = scene.tables.find((x) => x.pid === s.pid);
      if (tb === undefined) throw new Error(`pcb-holds-state: 표 ${s.pid} 가 없다`);
      const row: Row = s.entry.kind === 'slot' ? 'slots' : 'files';
      const rest: PcbEntry[] =
        row === 'slots'
          ? tb.slots.map((slot): PcbEntry => ({ kind: 'slot', slot }))
          : tb.files.map((file): PcbEntry => ({ kind: 'file', file }));
      const before = rest.length + 1;
      const g = drawStatic(scene, { pid: s.pid, row, from: 0 });
      const from = entryBox(g, scene, s.pid, row, s.was, before);
      const to = resourceBox(g, scene, s.entry, s.pid, s.place);
      const color = ownerColor(scene, s.pid);
      const layer = el('g', {}, svg);
      await tween(mine, MOVE_MS, (p) => {
        layer.textContent = '';
        rest.forEach((entry, i) => {
          const was = i >= s.was ? i + 1 : i;
          const a = entryBox(g, scene, s.pid, row, was, before);
          const b = entryBox(g, scene, s.pid, row, i, rest.length);
          const box: Box = { x: lerp(a.x, b.x, p), y: b.y, w: lerp(a.w, b.w, p), h: b.h };
          pointer(layer, box, resourceBox(g, scene, entry, s.pid, null));
          drawChip(layer, box, entry, color);
        });
        const box: Box = {
          x: lerp(from.x, to.x + (to.w - from.w) / 2, p),
          y: lerp(from.y, to.y + (to.h - from.h) / 2, p),
          w: from.w,
          h: from.h,
        };
        drawChip(layer, box, s.entry, color);
      });
    }

    async function moveDrop(mine: number, scene: PcbScene, s: Extract<PcbStep, { kind: 'drop' }>): Promise<void> {
      const g = drawStatic(scene, null);
      const card = cardBox(g, scene, s.pid);
      const layer = el('g', {}, svg);
      await tween(mine, MOVE_MS, (p) => {
        layer.textContent = '';
        const h = card.h * (1 - p);
        if (h < 1) return;
        el(
          'rect',
          {
            x: card.x + (card.w * p) / 2,
            y: card.y,
            width: card.w * (1 - p),
            height: h,
            rx: 8,
            fill: colors.bgSubtle,
            stroke: colors.accent,
            'stroke-width': 2,
          },
          layer,
        );
      });
    }

    return {
      async render(next: PcbScene, _prev: PcbScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const s = next.step;
        if (!opts.animate || s === null || next.slotCount === 0) {
          drawStatic(next, null);
          return;
        }
        if (s.kind === 'grant') await moveGrant(mine, next, s);
        else if (s.kind === 'release') await moveRelease(mine, next, s);
        else await moveDrop(mine, next, s);
        if (destroyed || mine !== gen) return;
        drawStatic(next, null);
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
