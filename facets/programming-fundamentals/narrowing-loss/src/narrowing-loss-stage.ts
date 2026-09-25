/**
 * narrowing-loss stage — 수가 넓은 자리에서 좁은 자리로 옮겨 가며 윗자리가 잘려 떨어진다.
 *
 * 위: 프로그램 글자와 출력. 아래: 선언된 자리마다 비트 칸. 넓은 자리와 좁은 자리의 칸은
 * 아래 비트끼리 세로로 맞춰 둔다 — 좁은 자리가 넓은 자리의 어느 부분만 받는지가 칸의 줄에서 보인다.
 * 변환 걸음에서는 원본 자리의 비트 줄이 복제되어 내려오고, 좁은 자리에 맞는 아래 칸만 남고 나머지는
 * 떨어져 나간다.
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
import type { NarrowingLossScene, NarrowingSlot } from './scene.js';

const H = 420;
const PAD = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

const DECLARE_MS = 350;
const CONVERT_MS = 1100;
const OUTPUT_MS = 380;
/** 변환 운동 가운데 복제 줄이 내려오는 몫. 나머지가 떨어져 나가는 몫이다. */
const DESCEND_SHARE = 0.35;

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 부호 있는 bits 비트 정수의 k 번째 비트 (2 의 보수). */
function bitAt(value: number, bits: number, k: number): number {
  const span = 2 ** bits;
  const u = ((value % span) + span) % span;
  return Math.floor(u / 2 ** k) % 2;
}

type Layout = {
  codeTop: number;
  lineH: number;
  codeX: number;
  codeRight: number;
  outX: number;
  memTop: number;
  rowTop: number;
  rowPitch: number;
  cellW: number;
  cellH: number;
  cellsRight: number;
  narrow: number;
  wide: number;
  captionY: number;
  valueX: number;
};

type RowHandle = { g: SVGGElement; y: number };

export const narrowingLossStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const codePx = parseFloat(fontSizes.sm);
    const valuePx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let rows = new Map<string, RowHandle>();
    let outTexts: SVGTextElement[] = [];
    let layout: Layout | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      node.textContent = body;
      return node;
    }

    function measure(scene: NarrowingLossScene): Layout {
      const W = PIECE_CANVAS_W;
      const lineCount = Math.max(1, scene.lines.length);
      const slotCount = Math.max(1, scene.slots.length);
      const bitsList = scene.slots.map((s) => s.bits).filter((b) => b > 0);
      const wide = bitsList.length ? Math.max(...bitsList) : 32;
      const narrow = bitsList.length ? Math.min(...bitsList) : 8;
      const charW = codePx * 0.6;
      const longest = Math.max(0, ...scene.lines.map((l) => l.text.length + l.indent * 4));
      const codeTop = PAD + 4;
      const lineH = Math.min(20, (H * 0.3) / lineCount);
      const codeX = PAD + codePx * 2;
      const codeRight = codeX + longest * charW + 10;
      const outX = Math.max(codeRight + 24, W * 0.62);
      const memTop = codeTop + lineCount * lineH + 22;
      const rowTop = memTop + 20;
      const captionY = H - 18;
      const rowPitch = Math.min(60, (captionY - 34 - rowTop) / slotCount);
      const cellH = Math.min(22, rowPitch * 0.5);
      const nameW = codePx * 0.6 * 6 + 14;
      const valueW = valuePx * 0.6 * 5;
      const cellsLeft = PAD + nameW;
      const cellsRight = W - PAD - valueW - 10;
      const groups = Math.max(0, Math.ceil(wide / 8) - 1);
      const gap = 4;
      const cellW = Math.min(18, (cellsRight - cellsLeft - groups * gap) / wide);
      return {
        codeTop,
        lineH,
        codeX,
        codeRight,
        outX,
        memTop,
        rowTop,
        rowPitch,
        cellW,
        cellH,
        cellsRight,
        narrow,
        wide,
        captionY,
        valueX: W - PAD,
      };
    }

    /** k 번째 비트(0 이 가장 아래) 칸의 왼쪽 x. 아래 비트가 오른쪽이다. */
    function cellX(L: Layout, k: number): number {
      return L.cellsRight - (k + 1) * L.cellW - Math.floor(k / 8) * 4;
    }

    function rowY(L: Layout, i: number): number {
      return L.rowTop + i * L.rowPitch;
    }

    function drawCells(
      parent: Element,
      L: Layout,
      y: number,
      value: number,
      bits: number,
    ): SVGGElement[] {
      const out: SVGGElement[] = [];
      for (let k = 0; k < bits; k += 1) {
        const bit = bitAt(value, bits, k);
        const g = el('g', {}, parent);
        const x = cellX(L, k);
        el(
          'rect',
          {
            x: x + 0.5,
            y,
            width: L.cellW - 1,
            height: L.cellH,
            rx: 2,
            fill: bit ? c.primary : c.bgSubtle,
          },
          g,
        );
        text(g, x + L.cellW / 2, y + L.cellH / 2 + 0.5, String(bit), {
          size: fontSizes.xs,
          fill: bit ? c.textInverse : c.textMuted,
          mono: true,
          anchor: 'middle',
        });
        out.push(g);
      }
      return out;
    }

    function slotOutline(parent: Element, L: Layout, y: number, bits: number, stroke: string, width: number): void {
      const x0 = cellX(L, bits - 1) - 3;
      const x1 = cellX(L, 0) + L.cellW + 3;
      el(
        'rect',
        { x: x0, y: y - 3, width: x1 - x0, height: L.cellH + 6, rx: 4, fill: 'none', stroke, 'stroke-width': width },
        parent,
      );
    }

    function drawRow(L: Layout, slot: NarrowingSlot, i: number, current: boolean): RowHandle {
      const y = rowY(L, i);
      const g = el('g', {}, svg);
      if (slot.value === null) return { g, y };
      text(g, PAD, y + L.cellH * 0.3, slot.name, { size: fontSizes.sm, fill: c.text, mono: true, weight: '600' });
      text(g, PAD, y + L.cellH * 0.3 + codePx + 2, slot.type, {
        size: fontSizes.xs,
        fill: c.textMuted,
        mono: true,
      });
      slotOutline(g, L, y, slot.bits, current ? c.itemActive : c.border, current ? 2 : 1);
      drawCells(g, L, y, slot.value, slot.bits);
      text(g, L.valueX, y + L.cellH / 2, String(slot.value), {
        size: fontSizes.md,
        fill: c.text,
        mono: true,
        anchor: 'end',
        weight: '600',
      });
      if (slot.conv) {
        const lost = slot.conv.lost;
        text(g, cellX(L, slot.bits - 1) - 10, y + L.cellH / 2, t('label.lost', 'fell off: {n}', { n: lost }), {
          size: fontSizes.xs,
          fill: lost !== 0 ? c.danger : c.textMuted,
          anchor: 'end',
        });
      }
      return { g, y };
    }

    function caption(scene: NarrowingLossScene): string {
      const s = scene.step;
      if (s.kind === 'start') return t('caption.start', 'No line has run yet.');
      if (s.kind === 'declare') {
        const slot = scene.slots.find((x) => x.name === s.name);
        return t('caption.declare', '{name} gets a {bits}-bit slot holding {value}.', {
          name: s.name,
          bits: slot?.bits ?? 0,
          value: s.value,
        });
      }
      if (s.kind === 'convert') {
        const n = scene.slots.find((x) => x.name === s.name)?.bits ?? 0;
        if (s.lost === 0) {
          return t('caption.keep', 'Only the low {n} bits of {from} cross over. Every bit that fell off was 0, so the value stays {value}.', {
            n,
            from: s.from,
            value: s.value,
          });
        }
        return t('caption.cut', 'Only the low {n} bits of {from} cross over. The bits that fell off were worth {lost}: {before} became {value}.', {
          n,
          from: s.from,
          lost: s.lost,
          before: s.before,
          value: s.value,
        });
      }
      return t('caption.output', 'The screen shows {value}.', { value: s.value });
    }

    function drawStatic(scene: NarrowingLossScene): void {
      svg.textContent = '';
      rows = new Map();
      outTexts = [];
      const L = measure(scene);
      layout = L;

      // 프로그램
      scene.lines.forEach((line, i) => {
        const y = L.codeTop + i * L.lineH;
        if (scene.line === i) {
          el(
            'rect',
            {
              x: PAD - 4,
              y: y + 1,
              width: L.codeRight - PAD + 4,
              height: L.lineH - 2,
              rx: 3,
              fill: c.itemActive,
              'fill-opacity': 0.22,
              stroke: c.itemActive,
            },
            svg,
          );
        }
        text(svg, PAD, y + L.lineH / 2, String(i + 1), { size: fontSizes.xs, fill: c.textMuted, mono: true });
        text(svg, L.codeX + line.indent * 4 * codePx * 0.6, y + L.lineH / 2, line.text, {
          size: fontSizes.sm,
          fill: c.text,
          mono: true,
        });
      });

      // 출력
      if (scene.lines.length > 0) {
        const W = PIECE_CANVAS_W;
        el(
          'rect',
          {
            x: L.outX,
            y: L.codeTop,
            width: W - PAD - L.outX,
            height: scene.lines.length * L.lineH,
            rx: 4,
            fill: c.bgSubtle,
            stroke: c.border,
          },
          svg,
        );
        text(svg, L.outX + 10, L.codeTop + L.lineH / 2, t('label.output', 'output'), {
          size: fontSizes.xs,
          fill: c.textMuted,
        });
        scene.out.forEach((v, i) => {
          outTexts.push(
            text(svg, L.outX + 10, L.codeTop + (i + 1.5) * L.lineH, String(v), {
              size: fontSizes.md,
              fill: c.text,
              mono: true,
              weight: '600',
            }),
          );
        });
      }

      // 비트 무리 머리와 좁은 자리의 경계
      if (scene.slots.length > 0) {
        const hy = L.memTop + 6;
        const lowL = cellX(L, L.narrow - 1);
        const lowR = cellX(L, 0) + L.cellW;
        const highL = cellX(L, L.wide - 1);
        const highR = cellX(L, L.narrow) + L.cellW;
        text(svg, (lowL + lowR) / 2, hy, t('label.low', 'low {n} bits', { n: L.narrow }), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'middle',
        });
        text(svg, (highL + highR) / 2, hy, t('label.high', 'upper {n} bits', { n: L.wide - L.narrow }), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'middle',
        });
        const bx = (highR + lowL) / 2;
        el(
          'line',
          {
            x1: bx,
            y1: L.memTop - 2,
            x2: bx,
            y2: rowY(L, scene.slots.length - 1) + L.cellH + 8,
            stroke: c.textMuted,
            'stroke-dasharray': '3 3',
          },
          svg,
        );
      }

      const s = scene.step;
      const currentName = s.kind === 'declare' || s.kind === 'convert' ? s.name : null;
      scene.slots.forEach((slot, i) => {
        rows.set(slot.name, drawRow(L, slot, i, slot.name === currentName));
      });

      text(svg, PAD, L.captionY, caption(scene), { size: fontSizes.md, fill: c.text });
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
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

    async function animateDeclare(mine: number, name: string): Promise<void> {
      const row = rows.get(name);
      if (!row) return;
      const g = row.g;
      await tween(mine, DECLARE_MS, (p) => {
        const q = ease(p);
        g.setAttribute('transform', `translate(0 ${r2((1 - q) * 12)})`);
        g.setAttribute('opacity', String(r2(q)));
      });
    }

    async function animateConvert(
      mine: number,
      scene: NarrowingLossScene,
      name: string,
      from: string,
      before: number,
    ): Promise<void> {
      const L = layout;
      const target = rows.get(name);
      const source = rows.get(from);
      const srcSlot = scene.slots.find((x) => x.name === from);
      const dstSlot = scene.slots.find((x) => x.name === name);
      if (!L || !target || !source || !srcSlot || !dstSlot) return;
      const dy = target.y - source.y;
      const fall = L.rowPitch * 0.9;
      const clone = el('g', {}, svg);
      const cells = drawCells(clone, L, source.y, before, srcSlot.bits);
      const places: (SVGTextElement | null)[] = cells.map((cg, k) => {
        if (k < dstSlot.bits || bitAt(before, srcSlot.bits, k) === 0) return null;
        const rect = cg.querySelector('rect');
        if (rect) rect.setAttribute('fill', c.danger);
        return text(cg, cellX(L, k) + L.cellW / 2, source.y + L.cellH + 9, String(2 ** k), {
          size: fontSizes.xs,
          fill: c.danger,
          mono: true,
          anchor: 'middle',
        });
      });
      target.g.setAttribute('opacity', '0');
      await tween(mine, CONVERT_MS, (p) => {
        const down = ease(Math.min(1, p / DESCEND_SHARE));
        const drop = p <= DESCEND_SHARE ? 0 : (p - DESCEND_SHARE) / (1 - DESCEND_SHARE);
        if (drop > 0) target.g.setAttribute('opacity', '1');
        cells.forEach((cg, k) => {
          if (k < dstSlot.bits) {
            cg.setAttribute('transform', `translate(0 ${r2(dy * down)})`);
            return;
          }
          const tilt = (k % 2 === 0 ? 1 : -1) * 14 * drop;
          const cx = cellX(L, k) + L.cellW / 2;
          const cy = source.y + dy + L.cellH / 2;
          cg.setAttribute(
            'transform',
            `translate(0 ${r2(dy * down + fall * drop * drop)}) rotate(${r2(tilt)} ${r2(cx)} ${r2(cy)})`,
          );
          cg.setAttribute('opacity', String(r2(1 - drop)));
          const place = places[k];
          if (place) place.setAttribute('opacity', drop > 0 ? '1' : '0');
        });
      });
    }

    async function animateOutput(mine: number, name: string | null, value: number): Promise<void> {
      const L = layout;
      const dest = outTexts[outTexts.length - 1];
      const row = name ? rows.get(name) : undefined;
      if (!L || !dest || !row) return;
      const x0 = L.valueX;
      const y0 = row.y + L.cellH / 2;
      const x1 = L.outX + 10;
      const y1 = Number(dest.getAttribute('y'));
      dest.setAttribute('opacity', '0');
      const w = String(value).length * valuePx * 0.6;
      const mover = text(svg, x0 - w, y0, String(value), {
        size: fontSizes.md,
        fill: c.text,
        mono: true,
        weight: '600',
      });
      await tween(mine, OUTPUT_MS, (p) => {
        const q = ease(p);
        mover.setAttribute('x', String(r2(x0 - w * (1 - q) + (x1 - x0) * q)));
        mover.setAttribute('y', String(r2(y0 + (y1 - y0) * q)));
      });
    }

    return {
      async render(
        next: NarrowingLossScene,
        prev: NarrowingLossScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || !prev) return;
        const s = next.step;
        if (s.kind === 'declare') await animateDeclare(mine, s.name);
        else if (s.kind === 'convert') await animateConvert(mine, next, s.name, s.from, s.before);
        else if (s.kind === 'output') await animateOutput(mine, s.name, s.value);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
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
