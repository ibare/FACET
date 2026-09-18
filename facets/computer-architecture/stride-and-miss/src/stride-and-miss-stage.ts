/**
 * 건너뛰는 간격 — 무대.
 *
 * 동사는 "버려진다". 읽을 때마다 커서가 보폭만큼 뛰고, 캐시에 없는 줄이면 메모리의 줄이
 * 통째로 복제되어 캐시로 올라온다(원본은 남는다). 쓰는 칸만 켜진다. 보폭이 끝나면 캐시의
 * 칸들이 아래 장부로 내려가며 쓴 칸과 버린 칸으로 갈린다 — 보폭 셋의 줄이 끝까지 남아
 * 버린 몫의 길이를 견준다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { lineCells, rowBytes, type LedgerRow, type StrideAndMissScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 12;
const LABEL_W = 72;
const LINE_GAP = 10;
const CELL_MAX = 34;
const LEDGER_CELL_MAX = 22;
const LEDGER_PITCH_GAP = 2;
const LEDGER_GROUP_GAP = 10;
const TALLY_W = 110;
const RISE_GAP = 40;

const READ_MISS_MS = 550;
const READ_HIT_MS = 350;
const SETTLE_MS = 700;
const FRAME_MS = 16;

type Geometry = {
  x0: number;
  cs: number;
  cacheY: number;
  memY: number;
  ledgerHeadY: number;
  ledgerTop: number;
  rowH: number;
  ls: number;
  lpitch: number;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 전체 t 에서 [a, b] 구간의 진행 0..1 */
function phase(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return (t - a) / (b - a);
}

function geometry(scene: StrideAndMissScene): Geometry {
  const { count, lineElems, strides, reads } = scene.base;
  const n = Math.max(1, count);
  const nLines = Math.max(1, Math.ceil(n / lineElems));
  const x0 = PAD + LABEL_W;
  const avail = PIECE_CANVAS_W - PAD - x0;
  const cs = Math.max(8, Math.min(CELL_MAX, Math.floor((avail - (nLines - 1) * LINE_GAP) / n)));
  const cacheY = 44;
  const memY = cacheY + cs + RISE_GAP;
  const ledgerHeadY = memY + cs + 34;
  const ledgerTop = ledgerHeadY + 10;
  const lAvail = PIECE_CANVAS_W - PAD - TALLY_W - x0 - LEDGER_GROUP_GAP;
  const lpitch = Math.max(6, Math.floor(lAvail / Math.max(n, reads + 1)));
  const rows = Math.max(1, strides.length);
  const rowH = Math.min(LEDGER_CELL_MAX + 10, Math.floor((H - 6 - ledgerTop) / rows));
  const ls = Math.max(4, Math.min(LEDGER_CELL_MAX, lpitch - LEDGER_PITCH_GAP, rowH - 8));
  return { x0, cs, cacheY, memY, ledgerHeadY, ledgerTop, rowH, ls, lpitch };
}

function memX(scene: StrideAndMissScene, g: Geometry, i: number): number {
  return g.x0 + i * g.cs + Math.floor(i / scene.base.lineElems) * LINE_GAP;
}

/** 캐시 칸 slot 의 왼쪽 끝 — 캐시는 올라온 순서대로 채운다 */
function slotX(scene: StrideAndMissScene, g: Geometry, slot: number): number {
  return g.x0 + slot * (scene.base.lineElems * g.cs + LINE_GAP);
}

function cacheX(scene: StrideAndMissScene, g: Geometry, slot: number, i: number): number {
  return slotX(scene, g, slot) + (i % scene.base.lineElems) * g.cs;
}

function ledgerY(g: Geometry, strideIndex: number): number {
  return g.ledgerTop + strideIndex * g.rowH;
}

function ledgerUsedX(g: Geometry, j: number): number {
  return g.x0 + j * g.lpitch;
}

function ledgerDroppedX(scene: StrideAndMissScene, g: Geometry, j: number): number {
  return g.x0 + scene.base.reads * g.lpitch + LEDGER_GROUP_GAP + j * g.lpitch;
}

export const strideAndMissStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<StrideAndMissScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 정적 그리기가 매번 새로 짓는 손잡이
    let cacheCells = new Map<number, SVGGElement>();
    let cacheFills = new Map<number, SVGRectElement>();
    let ledgerCells = new Map<string, SVGGElement>();
    let tallies = new Map<number, SVGTextElement>();
    let cursor: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { anchor?: string; size?: string; fill?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'start',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    /** 원소 한 칸 — (0,0) 기준으로 짓고 자리는 transform 으로 */
    function cell(
      parent: Element,
      x: number,
      y: number,
      size: number,
      index: number,
      look: { fill: string; stroke: string; ink: string; strokeWidth?: number; strike?: string },
    ): { g: SVGGElement; rect: SVGRectElement } {
      const g = el('g', { transform: `translate(${round(x)},${round(y)})` }, parent);
      const rect = el(
        'rect',
        {
          x: 0,
          y: 0,
          width: size,
          height: size,
          rx: 3,
          fill: look.fill,
          stroke: look.stroke,
          'stroke-width': look.strokeWidth ?? 1,
        },
        g,
      );
      if (look.strike) {
        el('line', { x1: 3, y1: size - 3, x2: size - 3, y2: 3, stroke: look.strike, 'stroke-width': 1.2 }, g);
      }
      label(g, size / 2, size / 2 + 4, String(index), {
        anchor: 'middle',
        size: size >= 26 ? fontSizes.sm : fontSizes.xs,
        fill: look.ink,
        mono: true,
      });
      return { g, rect };
    }

    function caption(scene: StrideAndMissScene): string {
      const step = scene.step;
      if (!step) return t('caption.idle', 'The cache is empty.');
      if (step.kind === 'read') {
        if (step.miss) {
          const cells = lineCells(scene.base, step.line);
          return t('caption.miss', 'Read [{index}]: not in the cache. The whole line comes up: elements {first}–{last}.', {
            index: step.index,
            first: cells[0] ?? step.index,
            last: cells[cells.length - 1] ?? step.index,
          });
        }
        return t('caption.hit', 'Read [{index}]: its line is already up. Nothing new comes up.', {
          index: step.index,
        });
      }
      const row = scene.ledger.find((r) => r.strideIndex === step.strideIndex);
      const bytes = row ? rowBytes(scene.base, row) : { used: 0, loaded: 0, dropped: 0 };
      return t('caption.settle', 'Stride {stride}: {loaded} B came up, {used} B used. {dropped} B thrown away.', {
        stride: scene.base.strides[step.strideIndex] ?? 0,
        loaded: bytes.loaded,
        used: bytes.used,
        dropped: bytes.dropped,
      });
    }

    function drawLedgerRow(parent: Element, scene: StrideAndMissScene, g: Geometry, row: LedgerRow): void {
      const y = ledgerY(g, row.strideIndex) + (g.rowH - g.ls) / 2;
      row.used.forEach((i, j) => {
        const c = cell(parent, ledgerUsedX(g, j), y, g.ls, i, {
          fill: colors.accent,
          stroke: colors.accent,
          ink: colors.stateInk,
        });
        ledgerCells.set(`${row.strideIndex}:${i}`, c.g);
      });
      row.dropped.forEach((i, j) => {
        const c = cell(parent, ledgerDroppedX(scene, g, j), y, g.ls, i, {
          fill: colors.bg,
          stroke: colors.danger,
          ink: colors.textMuted,
          strike: colors.danger,
        });
        ledgerCells.set(`${row.strideIndex}:${i}`, c.g);
      });
      const bytes = rowBytes(scene.base, row);
      const pct = bytes.loaded > 0 ? Math.round((bytes.used / bytes.loaded) * 100) : 0;
      const tally = label(
        parent,
        PIECE_CANVAS_W - PAD,
        ledgerY(g, row.strideIndex) + g.rowH / 2 + 4,
        t('label.tally', '{used} / {loaded} B · {pct}%', { used: bytes.used, loaded: bytes.loaded, pct }),
        { anchor: 'end', mono: true },
      );
      tallies.set(row.strideIndex, tally);
    }

    function drawStatic(scene: StrideAndMissScene): void {
      svg.textContent = '';
      cacheCells = new Map();
      cacheFills = new Map();
      ledgerCells = new Map();
      tallies = new Map();
      cursor = null;
      const g = geometry(scene);
      const { base, current } = scene;
      const used = new Set(current ? current.used : []);
      const root = el('g', {}, svg);

      label(root, PAD, 24, caption(scene), { size: fontSizes.md });

      // 캐시
      label(root, PAD, g.cacheY + g.cs / 2 + 4, t('label.cache', 'Cache'), { fill: colors.textMuted });
      const nLines = Math.ceil(base.count / base.lineElems);
      for (let s = 0; s < nLines; s += 1) {
        const width = lineCells(base, s).length * g.cs;
        el(
          'rect',
          {
            x: slotX(scene, g, s) - 2,
            y: g.cacheY - 2,
            width: width + 4,
            height: g.cs + 4,
            rx: 4,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '4 3',
          },
          root,
        );
      }

      // 메모리 (원본)
      label(root, PAD, g.memY + g.cs / 2 + 4, t('label.memory', 'Memory'), { fill: colors.textMuted });
      for (let i = 0; i < base.count; i += 1) {
        const read = used.has(i);
        cell(root, memX(scene, g, i), g.memY, g.cs, i, {
          fill: colors.bgSubtle,
          stroke: read ? colors.accent : colors.border,
          strokeWidth: read ? 2 : 1,
          ink: colors.textMuted,
        });
      }

      // 올라온 줄 (복제본)
      const cacheLayer = el('g', {}, root);
      if (current) {
        current.lines.forEach((line, slot) => {
          for (const i of lineCells(base, line)) {
            const lit = used.has(i);
            const c = cell(cacheLayer, cacheX(scene, g, slot, i), g.cacheY, g.cs, i, {
              fill: lit ? colors.accent : colors.bg,
              stroke: lit ? colors.accent : colors.text,
              ink: lit ? colors.stateInk : colors.text,
            });
            cacheCells.set(i, c.g);
            cacheFills.set(i, c.rect);
          }
        });
      }

      // 읽기 커서 — 지금 읽는 칸 아래
      const at =
        scene.step && scene.step.kind === 'read'
          ? scene.step.index
          : current
            ? current.used[current.used.length - 1]
            : undefined;
      if (at !== undefined) {
        const cx = memX(scene, g, at) + g.cs / 2;
        const top = g.memY + g.cs + 4;
        cursor = el('g', { transform: `translate(${round(cx)},${round(top)})` }, root);
        el('path', { d: 'M0 0 L7 11 L-7 11 Z', fill: colors.primary }, cursor);
      }

      // 장부 — 보폭마다 쓴 칸 / 버린 칸
      label(root, ledgerUsedX(g, 0), g.ledgerHeadY, t('label.used', 'used'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      label(root, ledgerDroppedX(scene, g, 0), g.ledgerHeadY, t('label.dropped', 'thrown away'), {
        size: fontSizes.xs,
        fill: colors.danger,
      });
      const running = current ? current.strideIndex : -1;
      base.strides.forEach((stride, si) => {
        label(root, PAD, ledgerY(g, si) + g.rowH / 2 + 4, t('label.stride', 'Stride {stride}', { stride }), {
          fill: si === running ? colors.text : colors.textMuted,
          weight: si === running ? 'bold' : 'normal',
        });
      });
      const ledgerLayer = el('g', {}, root);
      for (const row of scene.ledger) drawLedgerRow(ledgerLayer, scene, g, row);
    }

    function run(duration: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let elapsed = 0;
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
          const p = Math.min(1, elapsed / duration);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            elapsed += FRAME_MS;
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateRead(scene: StrideAndMissScene, mine: number): Promise<void> {
      const step = scene.step;
      if (!step || step.kind !== 'read') return;
      const g = geometry(scene);
      const hopEnd = step.miss ? 0.3 : 0.5;
      const riseA = 0.3;
      const riseB = 0.8;
      const pulseA = step.miss ? 0.8 : 0.5;
      const toCx = memX(scene, g, step.index) + g.cs / 2;
      const top = g.memY + g.cs + 4;
      const fromCx = step.from === null ? toCx : memX(scene, g, step.from) + g.cs / 2;
      const distance = step.from === null ? 0 : Math.abs(step.index - step.from);
      const arc = Math.min(18, 6 + 3 * distance);
      const slot = scene.current ? scene.current.lines.indexOf(step.line) : -1;
      const lineIdx = lineCells(scene.base, step.line);
      const litFill = cacheFills.get(step.index);
      const litG = cacheCells.get(step.index);
      const lx = slot >= 0 ? cacheX(scene, g, slot, step.index) : 0;
      const dy = g.memY - g.cacheY;

      await run(step.miss ? READ_MISS_MS : READ_HIT_MS, mine, (p) => {
        // 커서가 보폭만큼 뛴다 — 멀수록 높이
        const h = ease(phase(p, 0, hopEnd));
        if (cursor) {
          const x = fromCx + (toCx - fromCx) * h;
          const y = top + Math.sin(Math.PI * h) * arc;
          cursor.setAttribute('transform', `translate(${round(x)},${round(y)})`);
        }
        // 줄이 통째로 올라온다 — 아직 못 온 만큼 아래에
        if (step.miss && slot >= 0) {
          const r = ease(phase(p, riseA, riseB));
          for (const i of lineIdx) {
            const node = cacheCells.get(i);
            if (!node) continue;
            const x = cacheX(scene, g, slot, i);
            node.setAttribute('transform', `translate(${round(x)},${round(g.cacheY + dy * (1 - r))})`);
          }
        }
        // 쓰는 칸만 켜진다
        if (litFill && litG && slot >= 0) {
          const q = phase(p, pulseA, 1);
          if (q <= 0) {
            litFill.setAttribute('fill', colors.bg);
          } else {
            litFill.setAttribute('fill', colors.accent);
            const k = 1 + 0.3 * (1 - ease(q));
            const off = (g.cs / 2) * (1 - k);
            litG.setAttribute(
              'transform',
              `translate(${round(lx + off)},${round(g.cacheY + off)}) scale(${round(k)})`,
            );
          }
        }
      });
    }

    async function animateSettle(scene: StrideAndMissScene, mine: number): Promise<void> {
      const step = scene.step;
      if (!step || step.kind !== 'settle') return;
      const row = scene.ledger.find((r) => r.strideIndex === step.strideIndex);
      if (!row) return;
      const g = geometry(scene);
      const y1 = ledgerY(g, row.strideIndex) + (g.rowH - g.ls) / 2;
      type Flight = { node: SVGGElement; x0: number; y0: number; x1: number; drop: boolean };
      const flights: Flight[] = [];
      const push = (i: number, x1: number, drop: boolean): void => {
        const node = ledgerCells.get(`${row.strideIndex}:${i}`);
        const slot = step.lines.indexOf(Math.floor(i / scene.base.lineElems));
        if (!node || slot < 0) return;
        flights.push({ node, x0: cacheX(scene, g, slot, i), y0: g.cacheY, x1, drop });
      };
      row.used.forEach((i, j) => push(i, ledgerUsedX(g, j), false));
      row.dropped.forEach((i, j) => push(i, ledgerDroppedX(scene, g, j), true));
      const tally = tallies.get(row.strideIndex);

      await run(SETTLE_MS, mine, (p) => {
        for (const f of flights) {
          // 쓴 칸은 곧게, 버린 칸은 뒤처져 떨어진다
          const q = f.drop ? Math.pow(phase(p, 0.15, 1), 2) : ease(phase(p, 0, 0.85));
          const size = g.cs + (g.ls - g.cs) * q;
          const x = f.x0 + (f.x1 - f.x0) * q;
          const y = f.y0 + (y1 - f.y0) * q;
          f.node.setAttribute('transform', `translate(${round(x)},${round(y)}) scale(${round(size / g.ls)})`);
        }
        if (tally) tally.setAttribute('opacity', String(round(phase(p, 0.85, 1))));
      });
    }

    const instance: ViewInstance & SceneRenderer<StrideAndMissScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || !next.step) return;
        if (next.step.kind === 'read') await animateRead(next, mine);
        else await animateSettle(next, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
    return instance;
  },
};
