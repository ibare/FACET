/**
 * page-table-lookup 무대.
 *
 * 가운데 페이지 표, 왼쪽 위 번역할 가상 주소, 오른쪽 위 번역을 마친 실제 주소.
 * 아래 한 줄이 작업대다 — 왼쪽 끝에서 가상 주소가 갈라지고, 오른쪽 끝에서 실제 주소로 붙는다.
 *
 *   갈라짐  목록의 주소가 작업대로 내려와 앞쪽(페이지 번호)과 뒤쪽(오프셋) 사이가 벌어진다
 *   바뀜    앞쪽만 표의 제 줄로 올라가, 줄을 가로질러 프레임 번호로 바뀐다
 *   붙음    프레임 번호는 표에서 내려오고, 오프셋은 손대지 않은 채 표 밑을 옆으로 건너와 붙는다
 *
 * 세로는 고정이다. 표 줄 · 주소 수가 늘면 간격을 줄여 담는다.
 */
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
import type { PageTableLookupScene, PageTableStep } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 자리 상한 — 실제 크기는 캔버스 폭에서 역산한다
const MARGIN = 24;
const CELL_MAX = 34;
const CELL_GAP = 4;
const SPLIT_GAP = 22;
const PREFIX_W = 26;
const COL_GAP = 52;

// 세로 띠
const HEAD_Y = 18;
const COL_HEAD_Y = 38;
const TABLE_TOP = 48;
const TABLE_BOTTOM = 208;
const TRACK_TOP = 240;
const PART_LABEL_Y = 294;
const CAPTION_Y = 326;

// 운동 길이
const FRAME_MS = 16;
const SPLIT_MS = 600;
const LOOKUP_MS = 800;
const JOIN_MS = 700;

type Movers = {
  page?: SVGGElement;
  offset?: SVGGElement;
  frame?: SVGGElement;
  labels?: SVGGElement;
};

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - ((-2 * c + 2) ** 2) / 2;
}

function hexDigits(n: number, digits: number): string {
  return n.toString(16).toUpperCase().padStart(digits, '0');
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  if (parent) parent.appendChild(node);
  return node;
}

/** 이 장면의 주소 모양에서 셈한 자리 */
type Geometry = {
  totalDigits: number;
  pageDigits: number;
  offsetDigits: number;
  cell: number;
  pitch: number;
  leftX: number;
  rightX: number;
  pageColX: number;
  frameColX: number;
  rowPitch: number;
  listPitch: number;
  charW: number;
};

function geometry(scene: PageTableLookupScene): Geometry {
  const W = PIECE_CANVAS_W;
  const totalDigits = scene.addressBits / 4;
  const offsetDigits = Math.round(Math.log(scene.pageSize) / Math.log(16));
  const pageDigits = totalDigits - offsetDigits;
  // 표 너비가 셀 크기에 달려 있으니, 작업대 한쪽이 절반 폭 안에 들도록 셀을 먼저 정한다
  const half = W / 2 - MARGIN - PREFIX_W - SPLIT_GAP;
  const tableHalfUnits = pageDigits + COL_GAP / 2 / CELL_MAX;
  const pitchFit = Math.floor(half / (totalDigits + tableHalfUnits));
  const pitch = Math.min(CELL_MAX + CELL_GAP, pitchFit);
  const rows = Math.max(1, scene.table.length);
  const rowPitch = Math.min(pitch + 4, (TABLE_BOTTOM - TABLE_TOP) / rows);
  const cell = Math.min(pitch - CELL_GAP, rowPitch - 4);
  const groupW = (n: number): number => n * pitch - CELL_GAP;
  const tableW = 2 * groupW(pageDigits) + COL_GAP;
  const pageColX = W / 2 - tableW / 2;
  const frameColX = pageColX + groupW(pageDigits) + COL_GAP;
  const leftX = MARGIN + PREFIX_W;
  const rightX = W - MARGIN - groupW(totalDigits);
  const listPitch = Math.min(30, (TABLE_BOTTOM - TABLE_TOP) / Math.max(1, scene.addresses.length));
  const charW = parseFloat(fontSizes.md) * 0.6;
  return { totalDigits, pageDigits, offsetDigits, cell, pitch, leftX, rightX, pageColX, frameColX, rowPitch, listPitch, charW };
}

function rowCenter(g: Geometry, i: number): number {
  return TABLE_TOP + g.rowPitch * i + g.rowPitch / 2;
}

function listCenter(g: Geometry, i: number): number {
  return TABLE_TOP + g.listPitch * i + g.listPitch / 2;
}

export const pageTableLookupStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const root = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function text(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number },
    ): SVGTextElement {
      const node = svg(
        'text',
        {
          x,
          y,
          fill: opts.fill ?? colors.text,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    /** 16진 자리 칸 묶음. 칸 하나에 한 자리 */
    function digitGroup(
      parent: Element,
      g: Geometry,
      x: number,
      y: number,
      digits: string,
      fill: string,
      ink: string,
      stroke: string,
    ): SVGGElement {
      const group = svg('g', {}, parent);
      [...digits].forEach((d, i) => {
        const cx = x + i * g.pitch;
        svg('rect', { x: cx, y, width: g.cell, height: g.cell, rx: 4, fill, stroke, 'stroke-width': 1 }, group);
        text(group, cx + g.cell / 2, y + g.cell / 2, d, {
          size: fontSizes.xl,
          fill: ink,
          anchor: 'middle',
          mono: true,
          weight: 600,
        });
      });
      return group;
    }

    /** 이미 선 묶음의 자리 글자와 색을 갈아 끼운다 (바뀜 운동 도중에만) */
    function repaint(group: SVGGElement, digits: string, fill: string, ink: string): void {
      const rects = group.querySelectorAll('rect');
      const texts = group.querySelectorAll('text');
      [...digits].forEach((d, i) => {
        const rect = rects[i];
        const label = texts[i];
        if (rect) {
          rect.setAttribute('fill', fill);
          rect.setAttribute('stroke', fill);
        }
        if (label) {
          label.textContent = d;
          label.setAttribute('fill', ink);
        }
      });
    }

    /** 주소 글자를 페이지 쪽과 오프셋 쪽 색으로 나눠 쓴다 */
    function splitAddressText(
      parent: Element,
      x: number,
      y: number,
      value: number,
      g: Geometry,
      frontColor: string,
      anchor: 'start' | 'end',
    ): void {
      const all = hexDigits(value, g.totalDigits);
      const node = text(parent, x, y, '', { size: fontSizes.md, mono: true, anchor, weight: 600 });
      const pre = svg('tspan', { fill: colors.textMuted }, node);
      pre.textContent = '0x';
      const front = svg('tspan', { fill: frontColor }, node);
      front.textContent = all.slice(0, g.pageDigits);
      const back = svg('tspan', { fill: colors.text }, node);
      back.textContent = all.slice(g.pageDigits);
    }

    function caption(scene: PageTableLookupScene, g: Geometry): string {
      const step = scene.step;
      if (!step) return t('caption.start', 'Addresses to translate: {n}', { n: scene.addresses.length });
      const offset = `0x${hexDigits(step.offset, g.offsetDigits)}`;
      if (step.kind === 'split') {
        const address = scene.addresses[step.index];
        if (address === undefined) throw new Error(`page-table-lookup: 주소 ${step.index} 번이 없다`);
        return t('caption.split', 'Split: {address} → page {page} · offset {offset}', {
          address: `0x${hexDigits(address, g.totalDigits)}`,
          page: hexDigits(step.page, g.pageDigits),
          offset,
        });
      }
      if (step.kind === 'lookup') {
        return t('caption.lookup', 'Table row {page} → frame {frame}', {
          page: hexDigits(step.page, g.pageDigits),
          frame: hexDigits(step.frame, g.pageDigits),
        });
      }
      return t('caption.join', 'Joined: frame {frame} + offset {offset} → {physical}', {
        frame: hexDigits(step.frame, g.pageDigits),
        offset,
        physical: `0x${hexDigits(step.physical, g.totalDigits)}`,
      });
    }

    function drawStatic(scene: PageTableLookupScene): Movers {
      root.textContent = '';
      const W = PIECE_CANVAS_W;
      const g = geometry(scene);
      const step = scene.step;
      const movers: Movers = {};
      const cellTop = (center: number): number => center - g.cell / 2;
      const groupW = (n: number): number => n * g.pitch - CELL_GAP;

      // 머리말 셋
      text(root, MARGIN, HEAD_Y, t('label.virtual', 'Virtual address'), { fill: colors.textMuted, size: fontSizes.xs });
      text(root, W / 2, HEAD_Y, t('label.table', 'Page table'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'middle',
      });
      text(root, W - MARGIN, HEAD_Y, t('label.physical', 'Physical address'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
      });

      // 표
      const pageColW = groupW(g.pageDigits);
      text(root, g.pageColX + pageColW / 2, COL_HEAD_Y, t('label.page', 'Page'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'middle',
      });
      text(root, g.frameColX + pageColW / 2, COL_HEAD_Y, t('label.frame', 'Frame'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'middle',
      });
      const litRow = step && step.kind !== 'split' ? step.page : null;
      scene.table.forEach((row, i) => {
        const cy = rowCenter(g, i);
        const lit = row.page === litRow;
        if (lit) {
          svg(
            'rect',
            {
              x: g.pageColX - 6,
              y: cy - g.cell / 2 - 3,
              width: g.frameColX + pageColW - g.pageColX + 12,
              height: g.cell + 6,
              rx: 6,
              fill: 'none',
              stroke: colors.primary,
              'stroke-width': 2,
            },
            root,
          );
        }
        digitGroup(root, g, g.pageColX, cellTop(cy), hexDigits(row.page, g.pageDigits), colors.bgSubtle, colors.primary, colors.border);
        text(root, g.pageColX + pageColW + COL_GAP / 2, cy, '→', {
          fill: lit ? colors.primary : colors.textMuted,
          size: fontSizes.md,
          anchor: 'middle',
        });
        digitGroup(root, g, g.frameColX, cellTop(cy), hexDigits(row.frame, g.pageDigits), colors.bgSubtle, colors.itemActive, colors.border);
      });

      // 번역할 주소 목록 — 지금 것은 테를 두른다
      const listW = g.charW * (g.totalDigits + 2);
      scene.addresses.forEach((a, i) => {
        const cy = listCenter(g, i);
        if (step && step.index === i) {
          svg(
            'rect',
            { x: MARGIN - 6, y: cy - 11, width: listW + 12, height: 22, rx: 4, fill: colors.bgSubtle, stroke: colors.primary, 'stroke-width': 1 },
            root,
          );
        }
        splitAddressText(root, MARGIN, cy, a, g, colors.primary, 'start');
      });

      // 번역을 마친 주소 목록
      scene.results.forEach((r, i) => {
        if (r === null) return;
        splitAddressText(root, W - MARGIN, listCenter(g, i), r, g, colors.itemActive, 'end');
      });

      // 작업대
      const trackMid = TRACK_TOP + g.cell / 2;
      const splitOffsetX = g.leftX + g.pageDigits * g.pitch + SPLIT_GAP;
      const joinOffsetX = g.rightX + g.pageDigits * g.pitch;
      const offsetW = groupW(g.offsetDigits);
      if (step) {
        const offsetHex = hexDigits(step.offset, g.offsetDigits);
        if (step.kind === 'split' || step.kind === 'lookup') {
          text(root, g.leftX - 4, trackMid, '0x', { fill: colors.textMuted, size: fontSizes.md, anchor: 'end', mono: true });
          movers.offset = digitGroup(root, g, splitOffsetX, TRACK_TOP, offsetHex, colors.bgSubtle, colors.text, colors.border);
          const labels = svg('g', {}, root);
          text(labels, splitOffsetX + offsetW / 2, PART_LABEL_Y, t('label.offset', 'Offset'), {
            fill: colors.textMuted,
            size: fontSizes.xs,
            anchor: 'middle',
          });
          if (step.kind === 'split') {
            const pageHex = hexDigits(step.page, g.pageDigits);
            movers.page = digitGroup(root, g, g.leftX, TRACK_TOP, pageHex, colors.primary, colors.textInverse, colors.primary);
            text(labels, g.leftX + pageColW / 2, PART_LABEL_Y, t('label.page', 'Page'), {
              fill: colors.textMuted,
              size: fontSizes.xs,
              anchor: 'middle',
            });
            movers.labels = labels;
          } else {
            // 앞쪽이 떠난 자리
            svg(
              'rect',
              {
                x: g.leftX,
                y: TRACK_TOP,
                width: pageColW,
                height: g.cell,
                rx: 4,
                fill: 'none',
                stroke: colors.border,
                'stroke-dasharray': '4 3',
              },
              root,
            );
            const rowIdx = scene.table.findIndex((r) => r.page === step.page);
            if (rowIdx < 0) throw new Error(`page-table-lookup: 페이지 ${step.page} 가 표에 없다`);
            movers.frame = digitGroup(
              root,
              g,
              g.frameColX,
              cellTop(rowCenter(g, rowIdx)),
              hexDigits(step.frame, g.pageDigits),
              colors.itemActive,
              colors.textInverse,
              colors.itemActive,
            );
          }
        } else {
          text(root, g.rightX - 4, trackMid, '0x', { fill: colors.textMuted, size: fontSizes.md, anchor: 'end', mono: true });
          movers.frame = digitGroup(
            root,
            g,
            g.rightX,
            TRACK_TOP,
            hexDigits(step.frame, g.pageDigits),
            colors.itemActive,
            colors.textInverse,
            colors.itemActive,
          );
          movers.offset = digitGroup(root, g, joinOffsetX, TRACK_TOP, offsetHex, colors.bgSubtle, colors.text, colors.border);
          const labels = svg('g', {}, root);
          text(labels, g.rightX + pageColW / 2, PART_LABEL_Y, t('label.frame', 'Frame'), {
            fill: colors.textMuted,
            size: fontSizes.xs,
            anchor: 'middle',
          });
          text(labels, joinOffsetX + offsetW / 2, PART_LABEL_Y, t('label.offset', 'Offset'), {
            fill: colors.textMuted,
            size: fontSizes.xs,
            anchor: 'middle',
          });
          movers.labels = labels;
        }
      }

      text(root, W / 2, CAPTION_Y, caption(scene, g), { size: fontSizes.md, anchor: 'middle' });
      return movers;
    }

    function place(node: SVGGElement | undefined, dx: number, dy: number): void {
      if (!node) return;
      node.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    /** 한 시계로 흘린다. 끝까지 흘렀으면 true, 밀려났으면 false */
    function tween(ms: number, mine: number, onFrame: (u: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
        const finish = (ok: boolean): void => {
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          i += 1;
          onFrame(i / total);
          if (i >= total) {
            finish(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        onFrame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    function animate(scene: PageTableLookupScene, step: PageTableStep, movers: Movers, mine: number): Promise<boolean> {
      const g = geometry(scene);
      const splitOffsetX = g.leftX + g.pageDigits * g.pitch + SPLIT_GAP;
      const rowIdx = scene.table.findIndex((r) => r.page === step.page);

      if (step.kind === 'split') {
        // 목록의 제 줄에서 작업대로 내려온 뒤, 앞쪽과 뒤쪽 사이가 벌어진다
        const listDigitX = MARGIN + g.charW * 2 + (g.charW * g.pageDigits) / 2;
        const sx = listDigitX - (g.leftX + (g.pageDigits * g.pitch - CELL_GAP) / 2);
        const sy = listCenter(g, step.index) - (TRACK_TOP + g.cell / 2);
        const labels = movers.labels;
        return tween(SPLIT_MS, mine, (u) => {
          const a = ease(u / 0.6);
          const b = ease((u - 0.6) / 0.4);
          place(movers.page, sx * (1 - a), sy * (1 - a));
          place(movers.offset, sx * (1 - a) - SPLIT_GAP * (1 - b), sy * (1 - a));
          if (labels) labels.setAttribute('opacity', String(r2(b)));
        });
      }

      if (rowIdx < 0) throw new Error(`page-table-lookup: 페이지 ${step.page} 가 표에 없다`);
      const rowTop = rowCenter(g, rowIdx) - g.cell / 2;

      if (step.kind === 'lookup') {
        // 앞쪽이 표의 제 줄로 올라가고, 줄을 가로질러 프레임 번호로 바뀐다
        const frameGroup = movers.frame;
        const startX = g.leftX - g.frameColX;
        const startY = TRACK_TOP - rowTop;
        const midX = g.pageColX - g.frameColX;
        const pageHex = hexDigits(step.page, g.pageDigits);
        const frameHex = hexDigits(step.frame, g.pageDigits);
        let showing: 'page' | 'frame' | null = null;
        return tween(LOOKUP_MS, mine, (u) => {
          if (!frameGroup) return;
          if (u < 0.5) {
            const a = ease(u / 0.5);
            place(frameGroup, startX + (midX - startX) * a, startY * (1 - a));
          } else {
            const b = ease((u - 0.5) / 0.5);
            place(frameGroup, midX * (1 - b), 0);
          }
          const want = u < 0.75 ? 'page' : 'frame';
          if (want !== showing) {
            showing = want;
            if (want === 'page') repaint(frameGroup, pageHex, colors.primary, colors.textInverse);
            else repaint(frameGroup, frameHex, colors.itemActive, colors.textInverse);
          }
        });
      }

      // 프레임 번호는 표에서 내려오고, 오프셋은 표 밑을 옆으로 건너온다
      const fx = g.frameColX - g.rightX;
      const fy = rowTop - TRACK_TOP;
      const ox = splitOffsetX - (g.rightX + g.pageDigits * g.pitch);
      const labels = movers.labels;
      return tween(JOIN_MS, mine, (u) => {
        const a = ease(u);
        place(movers.frame, fx * (1 - a), fy * (1 - a));
        place(movers.offset, ox * (1 - a), 0);
        if (labels) labels.setAttribute('opacity', String(r2(ease((u - 0.7) / 0.3))));
      });
    }

    return {
      async render(next: PageTableLookupScene, prev: PageTableLookupScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const movers = drawStatic(next);
        const step = next.step;
        if (!opts.animate || !step || !prev || prev.seq !== next.seq - 1) return;
        const ok = await animate(next, step, movers, mine);
        if (ok && mine === gen && !destroyed) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
