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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { BitPerRowScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 340;
const PAD = 16;
/** 줄 하나가 내려와 비트를 찍는 운동 */
const DROP_MS = 400;
/** 운동 가운데 표에서 칸 머리까지 건너가는 몫 */
const LIFT_SHARE = 0.35;

const SM = parseFloat(fontSizes.sm);
/** 고정폭 글자 한 자의 폭 (글자 크기에 대한 비) */
const MONO_ADVANCE = 0.62;

type Layout = {
  tableX: number;
  tableW: number;
  headY: number;
  rowTop: number;
  rowH: number;
  valueX: number;
  labelRight: number;
  slotX: number;
  slotW: number;
  onesX: number;
  colHeadY: number;
  bitTop: number;
  bitH: number;
  bitGap: number;
  captionY: number;
};

function layoutFor(scene: BitPerRowScene): Layout {
  const W = PIECE_CANVAS_W;
  const n = Math.max(1, scene.rows.length);
  const k = Math.max(1, scene.values.length);
  const longest = Math.max(
    scene.column.length,
    ...scene.values.map((v) => v.length),
    ...scene.rows.map((v) => v.length),
  );
  const idW = (String(n).length + 1) * SM * MONO_ADVANCE + 12;
  const valueW = longest * SM * MONO_ADVANCE;
  const tableW = Math.ceil(idW + valueW + 12);
  const labelW = Math.ceil(valueW + 12);
  const onesW = 48;
  const tableX = PAD;
  const labelRight = tableX + tableW + 20 + labelW;
  const slotX = labelRight + 10;
  const slotW = (W - PAD - onesW - slotX) / n;
  const headY = 52;
  const rowTop = 64;
  const tableBottom = 296;
  const rowH = Math.min(24, (tableBottom - rowTop) / n);
  const colHeadY = 84;
  const bitTop = 98;
  const bitGap = 12;
  const bitH = Math.min(44, (tableBottom - 30 - bitTop - bitGap * (k - 1)) / k);
  return {
    tableX,
    tableW,
    headY,
    rowTop,
    rowH,
    valueX: tableX + idW,
    labelRight,
    slotX,
    slotW,
    onesX: W - PAD - onesW / 2,
    colHeadY,
    bitTop,
    bitH,
    bitGap,
    captionY: H - 20,
  };
}

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, v] of Object.entries(attrs)) {
    node.setAttribute(name, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'dominant-baseline': 'central', ...attrs });
  node.textContent = content;
  return node;
}

function rowId(index: number): string {
  return `r${index + 1}`;
}

/** 운동이 만질 손잡이 — 정적 그리기가 매번 새로 짓는다. */
type Handles = {
  /** 이번 줄 자리의 비트 글자들 (values 차례) */
  column: SVGGElement[];
  layer: SVGGElement;
};

function drawStatic(
  svg: SVGSVGElement,
  scene: BitPerRowScene,
  colors: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const L = layoutFor(scene);
  const hues = categorical(Math.max(1, scene.values.length), 'vivid');
  const hueOf = (value: string): string => {
    // init 이 비트 줄 차례를 알리기 전의 장면 — 아직 가를 색이 없다
    if (scene.values.length === 0) return colors.text;
    const k = scene.values.indexOf(value);
    const c = hues[k];
    if (c === undefined) throw new Error(`bit-per-row 그림: 값 ${value} 에 비트 줄이 없다`);
    return c;
  };
  const step = scene.step;
  const current = step.kind === 'row' ? step.index : -1;
  const written = scene.bits.length > 0 ? (scene.bits[0] ?? '').length : 0;

  // 표 — 이름 · 열 머리 · 줄
  label(svg, L.tableX, 26, scene.table, {
    fill: colors.text,
    'font-family': fonts.mono,
    'font-size': fontSizes.md,
    'font-weight': 700,
  });
  label(svg, L.valueX, L.headY, scene.column, {
    fill: colors.textMuted,
    'font-family': fonts.mono,
    'font-size': fontSizes.sm,
    'font-weight': 700,
  });
  el(svg, 'line', {
    x1: L.tableX,
    x2: L.tableX + L.tableW,
    y1: L.headY + 9,
    y2: L.headY + 9,
    stroke: colors.border,
    'stroke-width': 1,
  });
  scene.rows.forEach((value, i) => {
    const cy = L.rowTop + L.rowH * (i + 0.5);
    if (i === current) {
      el(svg, 'rect', {
        x: L.tableX - 4,
        y: cy - L.rowH / 2 + 1,
        width: L.tableW + 8,
        height: L.rowH - 2,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.accent,
        'stroke-width': 1.5,
      });
    }
    const moved = i < written;
    label(svg, L.tableX + 4, cy, rowId(i), {
      fill: colors.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
    });
    label(svg, L.valueX, cy, value, {
      fill: hueOf(value),
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': moved ? 400 : 700,
    });
  });

  // 비트 줄 — 머리
  label(svg, L.slotX, 26, t('label.bitRows', 'Bit rows'), {
    fill: colors.text,
    'font-family': fonts.body,
    'font-size': fontSizes.md,
    'font-weight': 700,
  });
  const lastBitBottom =
    L.bitTop + scene.values.length * L.bitH + Math.max(0, scene.values.length - 1) * L.bitGap;
  scene.rows.forEach((_, i) => {
    label(svg, L.slotX + L.slotW * (i + 0.5), L.colHeadY, rowId(i), {
      fill: i === current ? colors.text : colors.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      'text-anchor': 'middle',
    });
  });
  if (step.kind === 'done') {
    label(svg, L.onesX, L.colHeadY, t('label.ones', 'Ones'), {
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      'text-anchor': 'middle',
    });
  }

  // 비트 줄 — 값마다 하나
  const columnHandles: SVGGElement[] = [];
  scene.values.forEach((value, k) => {
    const top = L.bitTop + k * (L.bitH + L.bitGap);
    const cy = top + L.bitH / 2;
    const hue = hueOf(value);
    label(svg, L.labelRight, cy, value, {
      fill: hue,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': 700,
      'text-anchor': 'end',
    });
    el(svg, 'rect', {
      x: L.slotX,
      y: top,
      width: L.slotW * scene.rows.length,
      height: L.bitH,
      rx: 6,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    const line = scene.bits[k] ?? '';
    scene.rows.forEach((_, i) => {
      const cx = L.slotX + L.slotW * (i + 0.5);
      const g = el(svg, 'g', {});
      const digit = line.charAt(i);
      if (digit === '') {
        // 아직 적히지 않은 자리
        el(g, 'line', {
          x1: cx - 5,
          x2: cx + 5,
          y1: cy + 7,
          y2: cy + 7,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
      } else if (digit === '1') {
        const box = Math.min(L.slotW - 6, L.bitH - 10);
        el(g, 'rect', {
          x: cx - box / 2,
          y: cy - box / 2,
          width: box,
          height: box,
          rx: 4,
          fill: hue,
          'fill-opacity': 0.22,
          stroke: hue,
          'stroke-width': 1.5,
        });
        label(g, cx, cy, '1', {
          fill: hue,
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
      } else {
        label(g, cx, cy, '0', {
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
        });
      }
      if (i === current) columnHandles.push(g);
    });
    if (step.kind === 'done') {
      const n = step.ones[k];
      if (n === undefined) throw new Error(`bit-per-row 그림: 비트 줄 ${value} 의 1 의 수가 없다`);
      label(svg, L.onesX, cy, String(n), {
        fill: hue,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 700,
        'text-anchor': 'middle',
      });
    }
  });

  // 이번 줄의 자리 — 비트 줄들 위에 테만 두른다
  if (current >= 0) {
    const x = L.slotX + L.slotW * current;
    el(svg, 'rect', {
      x: x + 1,
      y: L.colHeadY - 10,
      width: L.slotW - 2,
      height: lastBitBottom - L.colHeadY + 14,
      rx: 4,
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 1.5,
    });
  }

  // 캡션 — 지금 일어나는 일만
  let caption: string;
  if (step.kind === 'start') {
    caption = t('caption.start', 'Column {column}: one empty bit row per value.', {
      column: scene.column,
    });
  } else if (step.kind === 'row') {
    caption = t('caption.row', '{row} holds {value}: 1 in the {value} bit row, 0 in the others.', {
      row: rowId(step.index),
      value: step.value,
    });
  } else {
    caption = t('caption.done', 'Ones: {sum} = {ones}. Rows: {rows}. Bits: {values} × {rows} = {bits}', {
      sum: step.ones.join(' + '),
      ones: step.total,
      values: step.values,
      rows: step.rows,
      bits: step.bits,
    });
  }
  label(svg, L.tableX, L.captionY, caption, {
    fill: colors.text,
    'font-family': fonts.body,
    'font-size': fontSizes.md,
  });

  const layer = el(svg, 'g', {});
  return { column: columnHandles, layer };
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

export const bitPerRowStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    /** 한 시계로 ms 동안 u = 0 → 1 을 흘린다. 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, onFrame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start = -1;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          if (start < 0) start = now;
          const u = Math.min(1, (now - start) / ms);
          onFrame(u);
          if (u >= 1) {
            wake();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    async function drop(scene: BitPerRowScene, handles: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'row') return;
      const L = layoutFor(scene);
      const k = scene.values.indexOf(step.value);
      const hue = categorical(Math.max(1, scene.values.length), 'vivid')[k];
      if (hue === undefined) throw new Error(`bit-per-row 그림: 값 ${step.value} 에 비트 줄이 없다`);

      // 줄 조각 — 표의 제 줄에서 떠나 칸 머리로 건너가 비트 줄들을 지나 내려간다
      const chipW = Math.max(L.slotW - 4, step.value.length * SM * MONO_ADVANCE + 12);
      const chipH = SM + 10;
      const chip = el(handles.layer, 'g', {});
      el(chip, 'rect', {
        x: -chipW / 2,
        y: -chipH / 2,
        width: chipW,
        height: chipH,
        rx: chipH / 2,
        fill: hue,
      });
      label(chip, 0, 0, step.value, {
        fill: colors.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        'text-anchor': 'middle',
      });

      const x0 = L.valueX + (step.value.length * SM * MONO_ADVANCE) / 2;
      const y0 = L.rowTop + L.rowH * (step.index + 0.5);
      const x1 = L.slotX + L.slotW * (step.index + 0.5);
      const y1 = L.colHeadY;
      const bitCy = scene.values.map((_, j) => L.bitTop + j * (L.bitH + L.bitGap) + L.bitH / 2);
      const lastCy = bitCy[bitCy.length - 1] ?? y1;
      const y2 = lastCy + L.bitH / 2 + chipH;

      // 아직 못 온 자리의 비트는 숨겨 두었다가 줄이 지날 때 드러낸다
      for (const g of handles.column) g.setAttribute('opacity', '0');

      const place = (x: number, y: number, opacity: number): void => {
        chip.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
        chip.setAttribute('opacity', String(r2(opacity)));
      };
      place(x0, y0, 1);

      await tween(DROP_MS, mine, (u) => {
        let x: number;
        let y: number;
        if (u < LIFT_SHARE) {
          const a = easeInOut(u / LIFT_SHARE);
          x = x0 + (x1 - x0) * a;
          y = y0 + (y1 - y0) * a;
        } else {
          const a = (u - LIFT_SHARE) / (1 - LIFT_SHARE);
          x = x1;
          y = y1 + (y2 - y1) * a;
        }
        const fade = u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15;
        place(x, y, fade);
        handles.column.forEach((g, j) => {
          const cy = bitCy[j];
          if (cy === undefined || y < cy) return;
          g.removeAttribute('opacity');
          if (j === k) {
            // 제 값의 비트 줄 — 1 이 찍힌다 (지나간 뒤 잠깐 부풀었다 가라앉는다)
            const since = (y - cy) / (y2 - y1);
            const s = 1 + 0.5 * Math.max(0, 1 - since * 4);
            g.setAttribute(
              'transform',
              `translate(${r2(x1)},${r2(cy)}) scale(${r2(s)}) translate(${r2(-x1)},${r2(-cy)})`,
            );
          }
        });
      });
    }

    return {
      async render(
        next: BitPerRowScene,
        prev: BitPerRowScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(svg, next, colors, t);
        const flows =
          opts.animate &&
          next.step.kind === 'row' &&
          prev !== null &&
          prev.step !== next.step;
        if (!flows) return;
        await drop(next, handles, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(svg, next, colors, t);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
