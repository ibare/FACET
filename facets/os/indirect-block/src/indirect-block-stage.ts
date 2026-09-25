/**
 * indirect-block stage — 동사: 넘쳐 내려간다.
 *
 * 새 번호가 왼쪽에서 inode 의 칸 줄을 따라 미끄러져 첫 빈 직접 칸에 앉는다. 직접 칸이 다 차면
 * 번호는 찬 칸들을 지나 간접 칸까지 가고, 거기서 가리키는 줄을 타고 아래의 번호 블록으로
 * 떨어진다. 간접 블록을 잡는 걸음에는 번호 블록이 간접 칸에서 아래로 내려와 펼쳐진다.
 * 디스크 줄은 맨 아래에서 어느 블록이 잡혔는지를 보인다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { IndirectBlockScene } from './scene.js';

const H = 344;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 20;
/** inode 칸 가로의 상한 */
const CELL_MAX = 72;
const CELL_H = 40;
const CELL_GAP = 4;
/** 직접 칸과 간접 칸 사이 */
const SPLIT_GAP = 20;
/** 새 번호 자리와 inode 사이 */
const ENTRY_GAP = 36;
const FRAME_PAD = 6;

const ROW_A = 100;
const ROW_B = 196;
const DISK_Y = 272;
const DISK_H = 26;
const DISK_GAP = 2;

const MOVE_PLACE_MS = 700;
const MOVE_INDIRECT_MS = 1000;
const MOVE_SPILL_MS = 500;
const DROP_BOX_MS = 450;

type Pt = { x: number; y: number };

type Layout = {
  cw: number;
  entry: Pt;
  frameX: number;
  frameW: number;
  direct: (i: number) => Pt;
  indirectCell: Pt;
  boxX: number;
  boxW: number;
  bw: number;
  boxCell: (i: number) => Pt;
  dw: number;
  disk: (b: number) => Pt;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 칸 수에서 자리를 셈한다. 좌표는 전부 칸의 한가운데. */
function layoutOf(scene: IndirectBlockScene): Layout {
  const slots = Math.max(scene.directSlots, 1);
  const ptrs = Math.max(scene.ptrsPerBlock, 1);
  const disk = Math.max(scene.diskSize, 1);
  // 새 번호 자리 1 + 직접 칸 + 간접 칸 1 이 한 줄에 선다
  const fixed = 2 * MARGIN + ENTRY_GAP + 2 * FRAME_PAD + (slots - 1) * CELL_GAP + SPLIT_GAP;
  const cw = Math.min(CELL_MAX, (W - fixed) / (slots + 2));
  const frameW = 2 * FRAME_PAD + slots * cw + (slots - 1) * CELL_GAP + SPLIT_GAP + cw;
  const total = cw + ENTRY_GAP + frameW;
  const left = (W - total) / 2;
  const frameX = left + cw + ENTRY_GAP;
  const cellsX = frameX + FRAME_PAD;
  const direct = (i: number): Pt => ({
    x: round(cellsX + i * (cw + CELL_GAP) + cw / 2),
    y: ROW_A + CELL_H / 2,
  });
  const indirectCell: Pt = {
    x: round(cellsX + slots * cw + (slots - 1) * CELL_GAP + SPLIT_GAP + cw / 2),
    y: ROW_A + CELL_H / 2,
  };
  const bw = Math.min(CELL_MAX * 0.8, cw * 0.8);
  const boxW = 2 * FRAME_PAD + ptrs * bw + (ptrs - 1) * CELL_GAP;
  const boxX = Math.max(MARGIN, Math.min(indirectCell.x - boxW / 2, W - MARGIN - boxW));
  const boxCell = (i: number): Pt => ({
    x: round(boxX + FRAME_PAD + i * (bw + CELL_GAP) + bw / 2),
    y: ROW_B + CELL_H / 2,
  });
  const dw = (W - 2 * MARGIN - (disk - 1) * DISK_GAP) / disk;
  const diskAt = (b: number): Pt => ({
    x: round(MARGIN + b * (dw + DISK_GAP) + dw / 2),
    y: DISK_Y + DISK_H / 2,
  });
  return {
    cw,
    entry: { x: round(left + cw / 2), y: ROW_A + CELL_H / 2 },
    frameX,
    frameW,
    direct,
    indirectCell,
    boxX,
    boxW,
    bw,
    boxCell,
    dw,
    disk: diskAt,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
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
  opts: { size: string; fill: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'font-size': opts.size,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

/** 번호 하나를 담은 칸. 비었으면 번호 없이 테두리만. */
function slotBox(
  parent: Element,
  c: Pt,
  w: number,
  value: number | null,
  fill: string,
  ink: string,
  colors: Palette,
): SVGGElement {
  const g = el(parent, 'g', {});
  el(g, 'rect', {
    x: c.x - w / 2,
    y: c.y - CELL_H / 2,
    width: w,
    height: CELL_H,
    rx: 4,
    fill: value === null ? colors.bg : fill,
    stroke: value === null ? colors.border : fill,
    'stroke-width': 1,
  });
  if (value !== null) {
    label(g, c.x, c.y + 1, String(value), {
      size: fontSizes.lg,
      fill: ink,
      anchor: 'middle',
      weight: '600',
      mono: true,
    });
  }
  return g;
}

/** 칸 아래에서 디스크 블록 위로 떨어지는 가리킴 */
function pointer(parent: Element, from: Pt, to: Pt, stroke: string): SVGPathElement {
  const y0 = from.y + CELL_H / 2;
  const y1 = to.y - DISK_H / 2;
  const mid = (y0 + y1) / 2;
  return el(parent, 'path', {
    d: `M${round(from.x)} ${round(y0)} C${round(from.x)} ${round(mid)} ${round(to.x)} ${round(mid)} ${round(to.x)} ${round(y1)}`,
    fill: 'none',
    stroke,
    'stroke-width': 1.2,
    'stroke-opacity': 0.7,
  });
}

type Drawn = {
  /** 이번 걸음에 새로 적힌 번호의 칸 속 (운동 동안 가린다) */
  landing: SVGElement[];
  /** 번호 블록 묶음 (없으면 null) */
  box: SVGGElement | null;
};

function narrowScene(v: unknown): IndirectBlockScene | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Partial<IndirectBlockScene>;
  if (!Array.isArray(s.direct) || !Array.isArray(s.indirect)) return null;
  return v as IndirectBlockScene;
}

export const indirectBlockStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: IndirectBlockScene): Drawn {
      svg.textContent = '';
      const drawn: Drawn = { landing: [], box: null };
      if (scene.diskSize <= 0 || scene.directSlots <= 0) return drawn;
      const L = layoutOf(scene);
      const step = scene.step;
      const others = new Set(scene.usedByOthers);
      const mine = new Set([...scene.direct, ...scene.indirect]);

      // 글줄
      const file = scene.file;
      let line1: string;
      let line2: string | null = null;
      if (step === null) {
        line1 = t('caption.empty', 'The inode of {file} is empty. Direct slots: {d}', {
          file,
          d: scene.directSlots,
        });
      } else if (step.kind === 'place') {
        line1 = t('caption.place', 'Data {k} → block {b}. Its number goes in direct slot {s}.', {
          k: step.k,
          b: step.block,
          s: step.slot,
        });
        line2 = t('caption.reads', 'Disk reads to reach data {k}: {r}', { k: step.k, r: step.reads });
      } else if (step.kind === 'spill') {
        line1 = t(
          'caption.spill',
          'Direct slots are full. Block {b} becomes the indirect block: it will hold numbers.',
          { b: step.block },
        );
        line2 = t('caption.capacity', 'Data blocks the inode can reach: {from} → {to}', {
          from: step.capBefore,
          to: step.capAfter,
        });
      } else {
        line1 = t(
          'caption.placeIndirect',
          'Data {k} → block {b}. No room in the inode — its number goes in slot {s} of block {ib}.',
          { k: step.k, b: step.block, s: step.slot, ib: step.indirectAt },
        );
        line2 = t('caption.reads', 'Disk reads to reach data {k}: {r}', { k: step.k, r: step.reads });
      }
      label(svg, MARGIN, 18, line1, { size: fontSizes.md, fill: colors.text, weight: '600' });
      if (line2 !== null) {
        label(svg, MARGIN, 38, line2, { size: fontSizes.sm, fill: colors.primary });
      }
      const numberBlocks = scene.indirectAt === null ? 0 : 1;
      label(
        svg,
        MARGIN,
        56,
        t('caption.used', 'Disk blocks used: {n} (data {d} + number blocks {p})', {
          n: mine.size + numberBlocks,
          d: mine.size,
          p: numberBlocks,
        }),
        { size: fontSizes.sm, fill: colors.textMuted },
      );

      // 가리킴 — 칸 뒤에 깐다
      const wires = el(svg, 'g', {});
      scene.direct.forEach((b, i) => {
        const p = pointer(wires, L.direct(i), L.disk(b), colors.primary);
        if (step?.kind === 'place' && step.slot === i) drawn.landing.push(p);
      });
      scene.indirect.forEach((b, i) => {
        const p = pointer(wires, L.boxCell(i), L.disk(b), colors.primary);
        if (step?.kind === 'placeIndirect' && step.slot === i) drawn.landing.push(p);
      });

      // 새 번호 자리
      label(svg, L.entry.x, ROW_A - 12, t('label.next', 'New number'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      el(svg, 'rect', {
        x: L.entry.x - L.cw / 2,
        y: ROW_A,
        width: L.cw,
        height: CELL_H,
        rx: 4,
        fill: 'none',
        stroke: colors.border,
        'stroke-dasharray': '4 3',
      });

      // inode
      el(svg, 'rect', {
        x: L.frameX,
        y: ROW_A - FRAME_PAD,
        width: L.frameW,
        height: CELL_H + 2 * FRAME_PAD,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.textMuted,
        'stroke-width': 1.2,
      });
      label(svg, L.frameX, ROW_A - 18, t('label.inode', 'inode of {file}', { file }), {
        size: fontSizes.sm,
        fill: colors.text,
        weight: '600',
      });
      for (let i = 0; i < scene.directSlots; i += 1) {
        const v = i < scene.direct.length ? (scene.direct[i] ?? null) : null;
        const g = slotBox(svg, L.direct(i), L.cw, v, colors.primary, colors.textInverse, colors);
        if (step?.kind === 'place' && step.slot === i) {
          drawn.landing.push(g);
          markCurrent(g);
        }
      }
      const indG = slotBox(
        svg,
        L.indirectCell,
        L.cw,
        scene.indirectAt,
        colors.accent,
        colors.text,
        colors,
      );
      if (step?.kind === 'spill') {
        drawn.landing.push(indG);
        markCurrent(indG);
      }
      const underY = ROW_A + CELL_H + FRAME_PAD + 12;
      const d0 = L.direct(0);
      const dLast = L.direct(scene.directSlots - 1);
      label(svg, (d0.x + dLast.x) / 2, underY, t('label.direct', 'Direct'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      // 간접 칸 아래로 번호 블록에 닿는 줄이 지나가므로 이름은 줄 오른편에 둔다
      label(svg, L.indirectCell.x + 6, underY, t('label.indirect', 'Indirect'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      // 번호 블록 — 간접 칸에서 내려와 선다
      if (scene.indirectAt !== null) {
        const box = el(svg, 'g', {});
        drawn.box = box;
        el(box, 'line', {
          x1: L.indirectCell.x,
          y1: ROW_A + CELL_H + FRAME_PAD,
          x2: L.indirectCell.x,
          y2: ROW_B - FRAME_PAD,
          stroke: colors.accent,
          'stroke-width': 2,
        });
        el(box, 'rect', {
          x: L.boxX,
          y: ROW_B - FRAME_PAD,
          width: L.boxW,
          height: CELL_H + 2 * FRAME_PAD,
          rx: 6,
          fill: colors.bg,
          stroke: colors.accent,
          'stroke-width': 2,
        });
        // 직접 칸의 가리킴이 이 자리를 지나므로 바탕색 테두리로 글자를 띄운다
        const name = label(
          box,
          L.indirectCell.x - 8,
          ROW_B - FRAME_PAD - 10,
          t('label.numberBlock', 'Block {b} — numbers, not data', { b: scene.indirectAt }),
          { size: fontSizes.xs, fill: colors.text, anchor: 'end' },
        );
        name.setAttribute('stroke', colors.bg);
        name.setAttribute('stroke-width', '4');
        name.setAttribute('paint-order', 'stroke');
        for (let i = 0; i < scene.ptrsPerBlock; i += 1) {
          const v = i < scene.indirect.length ? (scene.indirect[i] ?? null) : null;
          const g = slotBox(box, L.boxCell(i), L.bw, v, colors.primary, colors.textInverse, colors);
          if (step?.kind === 'placeIndirect' && step.slot === i) {
            drawn.landing.push(g);
            markCurrent(g);
          }
        }
        // 번호 블록은 디스크의 한 블록이다
        const home = L.disk(scene.indirectAt);
        el(box, 'line', {
          x1: L.boxX + L.boxW / 2,
          y1: ROW_B + CELL_H + FRAME_PAD,
          x2: home.x,
          y2: home.y - DISK_H / 2,
          stroke: colors.accent,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
      }

      // 디스크
      label(svg, MARGIN, DISK_Y - 10, t('label.disk', 'Disk'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      for (let b = 0; b < scene.diskSize; b += 1) {
        const c = L.disk(b);
        let fill = colors.bg;
        let stroke = colors.border;
        if (b === scene.indirectAt) {
          fill = colors.accent;
          stroke = colors.accent;
        } else if (mine.has(b)) {
          fill = colors.primary;
          stroke = colors.primary;
        } else if (others.has(b)) {
          fill = colors.bgSubtle;
          stroke = colors.textMuted;
        }
        const r = el(svg, 'rect', {
          x: c.x - L.dw / 2,
          y: DISK_Y,
          width: L.dw,
          height: DISK_H,
          rx: 2,
          fill,
          stroke,
          'stroke-width': 1,
        });
        if (step !== null && step.block === b) {
          r.setAttribute('stroke', colors.itemActive);
          r.setAttribute('stroke-width', '2');
        }
        if (others.has(b)) {
          // 다른 파일의 칸은 빗금 대신 가운데 줄 하나로 막는다
          el(svg, 'line', {
            x1: c.x - L.dw / 2 + 4,
            y1: c.y,
            x2: c.x + L.dw / 2 - 4,
            y2: c.y,
            stroke: colors.textMuted,
            'stroke-width': 1,
          });
        }
        label(svg, c.x, DISK_Y + DISK_H + 11, String(b), {
          size: fontSizes.xs,
          fill: mine.has(b) || b === scene.indirectAt ? colors.text : colors.textMuted,
          anchor: 'middle',
          mono: true,
        });
      }

      // 범례
      const legendY = H - 12;
      const items: { fill: string; stroke: string; text: string }[] = [
        { fill: colors.bgSubtle, stroke: colors.textMuted, text: t('legend.other', 'Other files') },
        { fill: colors.primary, stroke: colors.primary, text: t('legend.data', 'Data of {file}', { file }) },
        { fill: colors.accent, stroke: colors.accent, text: t('legend.numbers', 'Number block') },
      ];
      const slotW = (W - 2 * MARGIN) / items.length;
      items.forEach((it, i) => {
        const x = MARGIN + i * slotW;
        el(svg, 'rect', { x, y: legendY - 5, width: 10, height: 10, rx: 2, fill: it.fill, stroke: it.stroke });
        label(svg, x + 16, legendY, it.text, { size: fontSizes.xs, fill: colors.textMuted });
      });

      return drawn;
    }

    function markCurrent(g: SVGGElement): void {
      const r = g.querySelector('rect');
      if (r) {
        r.setAttribute('stroke', colors.itemActive);
        r.setAttribute('stroke-width', '2');
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계로 흘린다. 매 틱마다 세대를 본다. */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        frame(e);
        if (p >= 1) return true;
        await wait(16);
      }
    }

    /** 꺾인 길을 길이에 비례해 나눠 걷는다. */
    function along(path: Pt[], e: number): Pt {
      const lens: number[] = [];
      let total = 0;
      for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        lens.push(d);
        total += d;
      }
      let rest = e * total;
      for (let i = 0; i < lens.length; i += 1) {
        const d = lens[i]!;
        if (rest <= d || i === lens.length - 1) {
          const a = path[i]!;
          const b = path[i + 1]!;
          const f = d === 0 ? 1 : Math.min(1, rest / d);
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        }
        rest -= d;
      }
      return path[path.length - 1]!;
    }

    function token(value: number, w: number, fill: string, ink: string): SVGGElement {
      const g = el(svg, 'g', {});
      el(g, 'rect', {
        x: -w / 2,
        y: -CELL_H / 2,
        width: w,
        height: CELL_H,
        rx: 4,
        fill,
        stroke: colors.itemActive,
        'stroke-width': 2,
      });
      label(g, 0, 1, String(value), {
        size: fontSizes.lg,
        fill: ink,
        anchor: 'middle',
        weight: '600',
        mono: true,
      });
      return g;
    }

    function place(g: SVGGElement, p: Pt): void {
      g.setAttribute('transform', `translate(${round(p.x)} ${round(p.y)})`);
    }

    async function render(
      next: unknown,
      _prev: unknown,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const scene = narrowScene(next);
      if (scene === null) {
        svg.textContent = '';
        return;
      }
      const drawn = drawStatic(scene);
      const step = scene.step;
      if (!opts.animate || step === null || destroyed) return;
      const L = layoutOf(scene);

      for (const n of drawn.landing) n.setAttribute('visibility', 'hidden');

      if (step.kind === 'place') {
        const tok = token(step.block, L.cw, colors.primary, colors.textInverse);
        const path = [L.entry, L.direct(step.slot)];
        place(tok, L.entry);
        if (!(await tween(MOVE_PLACE_MS, mine, (e) => place(tok, along(path, e))))) return;
      } else if (step.kind === 'placeIndirect') {
        const tok = token(step.block, L.cw, colors.primary, colors.textInverse);
        const target = L.boxCell(step.slot);
        // 찬 직접 칸들을 지나 간접 칸까지 가고, 거기서 가리킴을 타고 아래로 떨어진다
        const path = [
          L.entry,
          L.indirectCell,
          { x: L.indirectCell.x, y: target.y },
          target,
        ];
        place(tok, L.entry);
        if (!(await tween(MOVE_INDIRECT_MS, mine, (e) => place(tok, along(path, e))))) return;
      } else {
        const box = drawn.box;
        if (box) box.setAttribute('visibility', 'hidden');
        const tok = token(step.block, L.cw, colors.accent, colors.text);
        const path = [L.entry, L.indirectCell];
        place(tok, L.entry);
        if (!(await tween(MOVE_SPILL_MS, mine, (e) => place(tok, along(path, e))))) return;
        if (box) {
          // 번호 블록이 간접 칸 자리에서 제 자리까지 내려온다 — 아직 못 온 만큼 위에 있다
          const lift = ROW_A - ROW_B;
          box.setAttribute('transform', `translate(0 ${round(lift)})`);
          box.removeAttribute('visibility');
          const ok = await tween(DROP_BOX_MS, mine, (e) =>
            box.setAttribute('transform', `translate(0 ${round(lift * (1 - e))})`),
          );
          if (!ok) return;
        }
      }
      if (destroyed || mine !== gen) return;
      drawStatic(scene);
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
