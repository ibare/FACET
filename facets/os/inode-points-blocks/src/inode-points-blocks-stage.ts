/**
 * inode-points-blocks 의 stage — 동사는 "모인다".
 *
 * 위에는 디스크 블록 한 줄, 아래 왼쪽에는 inode 의 칸, 아래 오른쪽에는 모인 글.
 * 한 걸음에 칸 하나에서 번호를 따라 블록까지 선이 뻗고(짚기), 그 블록의 글자가 빠져나와
 * 모인 글의 다음 자리로 날아가 붙는다. 디스크 위에서 앞 블록과 이번 블록을 잇는 호가
 * 앞뒤로 건너뛰는 자취를 남긴다 — 이어 붙는 글은 칸 차례대로 한 번도 흐트러지지 않는다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { InodePointsBlocksScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 290;
const PAD = 16;
const HEAD_Y = 14;
const DISK_TOP = 72;
const DISK_GAP = 4;
const DISK_CELL_MAX = 40;
const HOP_RISE_MIN = 8;
const HOP_RISE_MAX = 40;
const HOP_RISE_SLOPE = 0.11;
const LOWER_LABEL_Y = 170;
const ROW_TOP = 180;
const ROW_H = 40;
const ROW_GAP = 4;
const ROW_CELL_MAX = 36;
const CAPTION_Y = H - 16;
const LEGEND_OTHER_FROM_RIGHT = 230;
const LEGEND_FREE_FROM_RIGHT = 100;
const SWATCH = 10;
const REACH_MS = 380;
const CARRY_MS = 620;
const FRAME_MS = 16;

const W = PIECE_CANVAS_W;

/** 좌표를 글자로 — 끝자리와 -0 을 걷는다. */
function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

type Pt = { x: number; y: number };

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

/** 이차 곡선 p0-c-p2 의 앞 `p` 만큼을 잘라 낸 경로. */
function partialCurve(p0: Pt, c: Pt, p2: Pt, p: number): string {
  const c1 = lerp(p0, c, p);
  const end = lerp(c1, lerp(c, p2, p), p);
  return `M ${num(p0.x)} ${num(p0.y)} Q ${num(c1.x)} ${num(c1.y)} ${num(end.x)} ${num(end.y)}`;
}

function curvePoint(p0: Pt, c: Pt, p2: Pt, p: number): Pt {
  return lerp(lerp(p0, c, p), lerp(c, p2, p), p);
}

type Geometry = {
  diskCell: number;
  diskX0: number;
  rowCell: number;
  inodeX0: number;
  gatherX0: number;
};

function geometryOf(scene: InodePointsBlocksScene): Geometry {
  const n = scene.disk.length;
  const diskCell = Math.min(DISK_CELL_MAX, (W - 2 * PAD - (n - 1) * DISK_GAP) / n);
  const diskW = n * diskCell + (n - 1) * DISK_GAP;
  const m = Math.max(1, scene.slots.length);
  // 아래 두 줄(inode · 모인 글)이 반씩 나눠 쓴다. 가운데 틈은 한 칸 폭.
  const half = (W - 2 * PAD) / 2 - ROW_CELL_MAX / 2;
  const rowCell = Math.min(ROW_CELL_MAX, (half - (m - 1) * ROW_GAP) / m);
  const rowW = m * rowCell + (m - 1) * ROW_GAP;
  return {
    diskCell,
    diskX0: (W - diskW) / 2,
    rowCell,
    inodeX0: PAD,
    gatherX0: W - PAD - rowW,
  };
}

function diskLeft(g: Geometry, b: number): number {
  return g.diskX0 + b * (g.diskCell + DISK_GAP);
}

function rowLeft(x0: number, g: Geometry, i: number): number {
  return x0 + i * (g.rowCell + ROW_GAP);
}

/** 디스크 위 두 블록을 잇는 호 — 멀수록 높이 뜬다. */
function hopOf(g: Geometry, from: number, to: number): { p0: Pt; c: Pt; p2: Pt } {
  const y = DISK_TOP - 2;
  const x0 = diskLeft(g, from) + g.diskCell / 2;
  const x2 = diskLeft(g, to) + g.diskCell / 2;
  const rise = Math.min(HOP_RISE_MAX, HOP_RISE_MIN + Math.abs(x2 - x0) * HOP_RISE_SLOPE);
  return { p0: { x: x0, y }, c: { x: (x0 + x2) / 2, y: y - 2 * rise }, p2: { x: x2, y } };
}

type Handles = {
  pointer: SVGLineElement | null;
  pointerFrom: Pt;
  pointerTo: Pt;
  hop: SVGPathElement | null;
  hopCurve: { p0: Pt; c: Pt; p2: Pt } | null;
  letter: SVGTextElement | null;
  letterFrom: Pt;
  letterTo: Pt;
};

export const inodePointsBlocksStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const pxXs = parseFloat(fontSizes.xs);
    const pxMd = parseFloat(fontSizes.md);

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
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; anchor?: string; family?: string; weight?: string; halo?: boolean },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
          // 뻗은 선이 글자 밑을 지날 때 글자가 묻히지 않게 바탕색 테를 두른다
          ...(opts.halo ? { stroke: colors.bg, 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' } : {}),
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    /** 다른 파일의 블록 — 속을 빗금으로 가려 주인이 다르다는 것만 보인다. */
    function hatch(parent: Element, x: number, y: number, s: number): void {
      const step = s / 4;
      for (let k = step; k < 2 * s; k += step) {
        const a: Pt = k <= s ? { x, y: y + k } : { x: x + k - s, y: y + s };
        const b: Pt = k <= s ? { x: x + k, y } : { x: x + s, y: y + k - s };
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: colors.border, 'stroke-width': 1 }, parent);
      }
    }

    function drawStatic(scene: InodePointsBlocksScene): Handles {
      svg.textContent = '';
      const g = geometryOf(scene);
      const read = scene.gathered.length;
      const cur = scene.step.kind === 'read' ? scene.step.slot : -1;
      const curBlock = scene.step.kind === 'read' ? scene.step.block : -1;
      const readBlocks = new Set(scene.slots.slice(0, read));

      const hopLayer = el('g', {}, svg);
      const pointerLayer = el('g', {}, svg);
      const diskLayer = el('g', {}, svg);
      const rowLayer = el('g', {}, svg);
      const textLayer = el('g', {}, svg);
      const flyLayer = el('g', {}, svg);

      // 머리줄 — 디스크 이름과 두 가지 블록의 표
      label(textLayer, PAD, HEAD_Y, t('label.disk', 'Disk blocks'), {
        size: fontSizes.sm,
        fill: colors.textMuted,
      });
      const legendY = HEAD_Y - SWATCH + 1;
      const otherX = W - PAD - LEGEND_OTHER_FROM_RIGHT;
      el('rect', { x: otherX, y: legendY, width: SWATCH, height: SWATCH, fill: colors.bgSubtle, stroke: colors.border }, textLayer);
      hatch(textLayer, otherX, legendY, SWATCH);
      label(textLayer, otherX + SWATCH + 5, HEAD_Y, t('legend.other', 'Other file'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      const freeX = W - PAD - LEGEND_FREE_FROM_RIGHT;
      el(
        'rect',
        { x: freeX, y: legendY, width: SWATCH, height: SWATCH, fill: 'none', stroke: colors.border, 'stroke-dasharray': '2 2' },
        textLayer,
      );
      label(textLayer, freeX + SWATCH + 5, HEAD_Y, t('legend.free', 'Free'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      // 디스크 블록
      const s = g.diskCell;
      scene.disk.forEach((block, b) => {
        const x = diskLeft(g, b);
        const active = b === curBlock;
        if (block.owner === 'other') {
          el('rect', { x, y: DISK_TOP, width: s, height: s, rx: 3, fill: colors.bgSubtle, stroke: colors.border }, diskLayer);
          hatch(diskLayer, x, DISK_TOP, s);
        } else if (block.owner === 'free') {
          el(
            'rect',
            { x, y: DISK_TOP, width: s, height: s, rx: 3, fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3' },
            diskLayer,
          );
        } else {
          el(
            'rect',
            {
              x,
              y: DISK_TOP,
              width: s,
              height: s,
              rx: 3,
              fill: colors.bg,
              stroke: active ? colors.itemActive : colors.text,
              'stroke-width': active ? 2.5 : 1.2,
            },
            diskLayer,
          );
          if (block.letter !== null) {
            label(diskLayer, x + s / 2, DISK_TOP + s / 2 + pxMd * 0.36, block.letter, {
              size: fontSizes.md,
              fill: readBlocks.has(b) && !active ? colors.textMuted : colors.text,
              anchor: 'middle',
              family: fonts.mono,
              weight: '600',
            });
          }
        }
        label(diskLayer, x + s / 2, DISK_TOP + s + pxXs + 3, String(b), {
          size: fontSizes.xs,
          fill: active ? colors.itemActive : colors.textMuted,
          anchor: 'middle',
          family: fonts.mono,
        });
      });

      // inode 의 칸
      const c = g.rowCell;
      label(textLayer, g.inodeX0, LOWER_LABEL_Y, t('label.inode', 'inode · {file}', { file: scene.file }), {
        size: fontSizes.sm,
        fill: colors.text,
        weight: '600',
        halo: true,
      });
      scene.slots.forEach((block, i) => {
        const x = rowLeft(g.inodeX0, g, i);
        const active = i === cur;
        el(
          'rect',
          {
            x,
            y: ROW_TOP,
            width: c,
            height: ROW_H,
            rx: 3,
            fill: i < read ? colors.bgSubtle : colors.bg,
            stroke: active ? colors.itemActive : colors.text,
            'stroke-width': active ? 2.5 : 1.2,
          },
          rowLayer,
        );
        label(rowLayer, x + c / 2, ROW_TOP + ROW_H / 2 + pxMd * 0.36, String(block), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
          family: fonts.mono,
        });
        label(rowLayer, x + c / 2, ROW_TOP + ROW_H + pxXs + 3, String(i), {
          size: fontSizes.xs,
          fill: active ? colors.itemActive : colors.textMuted,
          anchor: 'middle',
          family: fonts.mono,
        });
      });

      // 모인 글의 자리
      label(textLayer, g.gatherX0, LOWER_LABEL_Y, t('label.contents', 'File contents'), {
        size: fontSizes.sm,
        fill: colors.text,
        weight: '600',
        halo: true,
      });
      scene.slots.forEach((_block, i) => {
        const x = rowLeft(g.gatherX0, g, i);
        el(
          'rect',
          {
            x,
            y: ROW_TOP,
            width: c,
            height: ROW_H,
            rx: 3,
            fill: 'none',
            stroke: i === cur ? colors.itemActive : colors.border,
            'stroke-width': i === cur ? 2 : 1,
            ...(i < read ? {} : { 'stroke-dasharray': '3 3' }),
          },
          rowLayer,
        );
      });
      label(
        textLayer,
        g.gatherX0,
        ROW_TOP + ROW_H + pxXs + 3,
        t('label.read', 'Slots read: {n}/{total}', { n: read, total: scene.slots.length }),
        { size: fontSizes.xs, fill: colors.textMuted },
      );

      // 짚은 칸에서 블록으로 뻗은 선 — 앞 걸음 것은 옅게 남는다
      const numberBottom = DISK_TOP + s + pxXs + 7;
      const handles: Handles = {
        pointer: null,
        pointerFrom: { x: 0, y: 0 },
        pointerTo: { x: 0, y: 0 },
        hop: null,
        hopCurve: null,
        letter: null,
        letterFrom: { x: 0, y: 0 },
        letterTo: { x: 0, y: 0 },
      };
      for (let i = 0; i < read; i += 1) {
        const block = scene.slots[i]!;
        const from: Pt = { x: rowLeft(g.inodeX0, g, i) + c / 2, y: ROW_TOP };
        const to: Pt = { x: diskLeft(g, block) + s / 2, y: numberBottom };
        const active = i === cur;
        const line = el(
          'line',
          {
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            stroke: active ? colors.itemActive : colors.border,
            'stroke-width': active ? 2 : 1.2,
          },
          pointerLayer,
        );
        el('circle', { cx: from.x, cy: from.y, r: 2.5, fill: active ? colors.itemActive : colors.border }, pointerLayer);
        if (active) {
          handles.pointer = line;
          handles.pointerFrom = from;
          handles.pointerTo = to;
        }
      }

      // 디스크 위에서 건너뛴 자취
      for (let i = 1; i < read; i += 1) {
        const curve = hopOf(g, scene.slots[i - 1]!, scene.slots[i]!);
        const active = i === cur;
        const path = el(
          'path',
          {
            d: partialCurve(curve.p0, curve.c, curve.p2, 1),
            fill: 'none',
            stroke: active ? colors.itemActive : colors.textMuted,
            'stroke-width': active ? 2 : 1.2,
            'stroke-linecap': 'round',
          },
          hopLayer,
        );
        if (active) {
          handles.hop = path;
          handles.hopCurve = curve;
        }
      }

      // 모인 글자 — 칸 차례대로
      scene.gathered.forEach((letter, i) => {
        const x = rowLeft(g.gatherX0, g, i) + c / 2;
        const y = ROW_TOP + ROW_H / 2 + pxMd * 0.36;
        const node = label(i === cur ? flyLayer : rowLayer, x, y, letter, {
          size: fontSizes.lg,
          fill: colors.text,
          anchor: 'middle',
          family: fonts.mono,
          weight: '600',
        });
        if (i === cur) {
          const block = scene.slots[i]!;
          handles.letter = node;
          handles.letterTo = { x, y };
          handles.letterFrom = { x: diskLeft(g, block) + s / 2, y: DISK_TOP + s / 2 + pxMd * 0.36 };
        }
      });

      // 캡션 — 지금 일어나는 일만
      let caption: string;
      if (scene.step.kind === 'read') {
        const got = scene.gathered[scene.step.slot];
        if (got === undefined) throw new Error(`inode-points-blocks: 칸 ${scene.step.slot} 의 글자가 장면에 없다`);
        caption = t('caption.read', 'Slot {slot} → block {block} · {letter}', {
          slot: scene.step.slot,
          block: scene.step.block,
          letter: got,
        });
      } else {
        caption = t('caption.show', 'To read the file, follow the inode slot by slot.');
      }
      label(textLayer, W / 2, CAPTION_Y, caption, { size: fontSizes.md, fill: colors.text, anchor: 'middle' });

      return handles;
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: InodePointsBlocksScene,
      _prev: InodePointsBlocksScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || next.step.kind !== 'read' || !h.pointer || !h.letter) return;
      const { pointer, letter, hop, hopCurve } = h;

      // 운동은 끝 자리에 아직 못 온 만큼으로 — 글자는 블록 위에서 기다린다
      const place = (pt: Pt): void => {
        letter.setAttribute('transform', `translate(${num(pt.x - h.letterTo.x)} ${num(pt.y - h.letterTo.y)})`);
      };
      place(h.letterFrom);

      // 짚기 — 칸에서 블록으로 선이 뻗고, 디스크 위에서는 앞 블록에서 이번 블록으로 건너뛴다
      await tween(mine, REACH_MS, (p) => {
        const end = lerp(h.pointerFrom, h.pointerTo, p);
        pointer.setAttribute('x2', num(end.x));
        pointer.setAttribute('y2', num(end.y));
        if (hop && hopCurve) hop.setAttribute('d', partialCurve(hopCurve.p0, hopCurve.c, hopCurve.p2, p));
      });
      if (destroyed || mine !== gen) return;

      // 모으기 — 블록의 글자가 빠져나와 모인 글의 다음 자리로 간다
      const bend: Pt = { x: h.letterTo.x, y: h.letterFrom.y };
      await tween(mine, CARRY_MS, (p) => place(curvePoint(h.letterFrom, bend, h.letterTo, p)));
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
