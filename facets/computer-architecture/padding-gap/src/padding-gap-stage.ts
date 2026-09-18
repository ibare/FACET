/**
 * 정렬과 패딩 stage — 필드가 대기 줄에서 내려와 앞 끝에 닿고, 제 정렬의 배수 자리까지
 * 오른쪽으로 밀려 앉는다. 지나친 칸은 빗금 친 빈틈으로 남는다. 끝에서는 구조체의 닫는
 * 괄호가 가장 큰 정렬의 배수까지 밀려나며 꼬리 빈틈을 끌고 온다.
 *
 * 바이트 한 칸의 폭은 장면의 `span`(완성 크기) 에서 역산해 캔버스 폭을 채운다. 칸은
 * 지금까지 채워진 끝까지만 그린다 — 완성 크기를 미리 보이지 않는다.
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PaddingGapScene, PaddingGapSceneField } from './scene.js';

const H = 232;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌우 여백 */
const PAD = 24;
/** 바이트 한 칸 폭의 상한 */
const CELL_MAX = 46;
/** 대기 줄 필드 사이 틈의 상한 */
const QUEUE_GAP_MAX = 14;

const CAP_Y = 22;
const QUEUE_Y = 44;
const ROW_Y = 118;
const BLOCK_H = 44;
const MARK_Y = ROW_Y + BLOCK_H + 5;
const RULER_Y = ROW_Y + BLOCK_H + 26;
const BRACE_Y = ROW_Y + BLOCK_H + 38;

/** 운동 길이 (ms) */
const DROP_MS = 400;
const SLIDE_MS = 450;
const TAIL_MS = 500;
const BRACE_MS = 500;

type Geo = {
  cw: number;
  x0: number;
  /** 대기 줄에서 필드마다의 왼쪽 끝 */
  qx: number[];
};

function r2(n: number): number {
  return Math.round(n * 100) / 100 + 0;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function geoOf(s: PaddingGapScene): Geo {
  const span = Math.max(1, s.span);
  const cw = Math.min(CELL_MAX, Math.floor((W - 2 * PAD) / span));
  const x0 = Math.round((W - cw * span) / 2);
  const n = s.fields.length;
  const sumW = s.fields.reduce((acc, f) => acc + f.size * cw, 0);
  const room = W - 2 * PAD - sumW;
  const gap = n > 1 ? Math.max(0, Math.min(QUEUE_GAP_MAX, room / (n - 1))) : 0;
  const qx: number[] = [];
  let x = x0;
  for (const f of s.fields) {
    qx.push(Math.round(x));
    x += f.size * cw + gap;
  }
  return { cw, x0, qx };
}

/** 지금까지 채워진 끝 (바이트) */
function extentOf(s: PaddingGapScene): number {
  if (s.tail !== null) return s.tail.size;
  const n = s.placed.length;
  if (n === 0) return 0;
  const last = s.placed[n - 1]!;
  return last.offset + (s.fields[n - 1]?.size ?? 0);
}

function narrowScene(v: unknown): v is PaddingGapScene {
  return typeof v === 'object' && v !== null && Array.isArray((v as { fields?: unknown }).fields);
}

export const paddingGapStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<PaddingGapScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 남기는 손잡이 — 운동이 만진다. 그리기마다 새로 선다. */
    let mover: SVGGElement | null = null;
    let closer: SVGGElement | null = null;
    let stepGaps: { byte: number; el: SVGGElement }[] = [];
    let brace: { line: SVGLineElement; tick: SVGLineElement; label: SVGTextElement } | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function text(
      content: string,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGTextElement {
      const node = el('text', attrs, parent);
      node.textContent = content;
      return node;
    }

    function caption(s: PaddingGapScene): string {
      const step = s.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'init':
          return t('caption.init', 'Fields come in one at a time: {n} in all.', { n: s.fields.length });
        case 'place': {
          const f = s.fields[step.index];
          if (f === undefined) return '';
          if (step.from === step.offset) {
            return t('caption.fits', '{name} ({type}, alignment {align}) sits right at byte {offset}.', {
              name: f.name,
              type: f.type,
              align: f.align,
              offset: step.offset,
            });
          }
          return t(
            'caption.pushed',
            '{name} ({type}) must start at a multiple of {align}. It slides from byte {from} to {offset}, leaving {gap} bytes empty.',
            {
              name: f.name,
              type: f.type,
              align: f.align,
              from: step.from,
              offset: step.offset,
              gap: step.offset - step.from,
            },
          );
        }
        case 'tail':
          if (step.size === step.end) {
            return t('caption.tailNone', 'The end, {end}, is already a multiple of the largest alignment, {align}. No tail padding.', {
              end: step.end,
              align: step.align,
            });
          }
          return t(
            'caption.tail',
            'The whole must be a multiple of the largest alignment, {align}. The end moves from {end} to {size}: {gap} bytes of tail padding.',
            { align: step.align, end: step.end, size: step.size, gap: step.size - step.end },
          );
        case 'total':
          return t('caption.total', 'Size {size} = fields {sum} + gaps {gaps}.', {
            size: step.size,
            sum: step.sum,
            gaps: step.gaps,
          });
      }
    }

    function drawBlock(f: PaddingGapSceneField, color: string, x: number, y: number, cw: number): SVGGElement {
      const g = el('g', {});
      const w = f.size * cw;
      el('rect', { x, y, width: w, height: BLOCK_H, rx: 4, fill: color, stroke: colors.bg, 'stroke-width': 1.5 }, g);
      text(
        f.name,
        {
          x: x + w / 2,
          y: y + BLOCK_H / 2 - 3,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.stateInk,
        },
        g,
      );
      text(
        f.type,
        {
          x: x + w / 2,
          y: y + BLOCK_H / 2 + 13,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.stateInk,
        },
        g,
      );
      return g;
    }

    function drawGap(byte: number, geo: Geo, ink: string): SVGGElement {
      const g = el('g', {});
      const x = geo.x0 + byte * geo.cw;
      el(
        'rect',
        {
          x: x + 1,
          y: ROW_Y + 1,
          width: geo.cw - 2,
          height: BLOCK_H - 2,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: ink,
          'stroke-dasharray': '3 3',
        },
        g,
      );
      // 빗금 — 칸 안쪽에 대각선 몇 가닥
      const step = 10;
      for (let d = step; d < geo.cw + BLOCK_H; d += step) {
        const xa = x + Math.max(0, d - BLOCK_H);
        const ya = ROW_Y + BLOCK_H - Math.max(0, BLOCK_H - d);
        const xb = x + Math.min(geo.cw, d);
        const yb = ROW_Y + BLOCK_H - Math.min(BLOCK_H, d);
        el('line', { x1: xa + 2, y1: ya - 2, x2: xb - 2, y2: yb + 2, stroke: ink, 'stroke-width': 1, opacity: 0.6 }, g);
      }
      return g;
    }

    function drawStatic(s: PaddingGapScene): void {
      svg.textContent = '';
      mover = null;
      closer = null;
      stepGaps = [];
      brace = null;

      text(caption(s), {
        x: W / 2,
        y: CAP_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      if (s.fields.length === 0) return;

      const geo = geoOf(s);
      const xAt = (b: number): number => geo.x0 + b * geo.cw;
      const palette = categorical(s.fields.length, 'vivid');
      const extent = extentOf(s);
      const step = s.step;
      const gapInk = s.total !== null ? colors.accent : colors.textMuted;

      // 눈금 — 채워진 끝까지만
      const every = geo.cw >= 18 ? 1 : 4;
      for (let b = 0; b <= extent; b += 1) {
        if (b % every !== 0 && b !== extent) continue;
        el('line', { x1: xAt(b), y1: ROW_Y + BLOCK_H, x2: xAt(b), y2: ROW_Y + BLOCK_H + 4, stroke: colors.border });
        text(String(b), {
          x: xAt(b),
          y: RULER_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // 정렬 자리 표지 — 이번 걸음이 맞추는 배수
      const markAlign =
        step?.kind === 'place' ? (s.fields[step.index]?.align ?? 1) : step?.kind === 'tail' ? step.align : 1;
      const markTo = step?.kind === 'place' ? step.offset : step?.kind === 'tail' ? step.size : -1;
      if (markAlign > 1) {
        for (let m = 0; m <= markTo; m += markAlign) {
          const x = xAt(m);
          el('path', { d: `M${r2(x)} ${MARK_Y}l-5 8h10z`, fill: colors.accent });
        }
      }

      // 빈틈 — 필드 앞 빈틈과 꼬리 빈틈
      s.placed.forEach((p, i) => {
        for (let b = p.from; b < p.offset; b += 1) {
          const g = drawGap(b, geo, gapInk);
          if (step?.kind === 'place' && step.index === i) stepGaps.push({ byte: b, el: g });
        }
      });
      if (s.tail !== null) {
        for (let b = s.tail.end; b < s.tail.size; b += 1) {
          const g = drawGap(b, geo, gapInk);
          if (step?.kind === 'tail') stepGaps.push({ byte: b, el: g });
        }
      }

      // 앉은 필드
      s.placed.forEach((p, i) => {
        const f = s.fields[i];
        if (f === undefined) return;
        const g = drawBlock(f, palette[i] ?? colors.primary, xAt(p.offset), ROW_Y, geo.cw);
        if (step?.kind === 'place' && step.index === i) mover = g;
      });

      // 대기 줄 — 아직 앉지 않은 필드
      for (let i = s.placed.length; i < s.fields.length; i += 1) {
        const f = s.fields[i]!;
        drawBlock(f, palette[i] ?? colors.primary, geo.qx[i]!, QUEUE_Y, geo.cw);
      }

      // 구조체 괄호 — 여는 괄호는 0, 닫는 괄호는 채워진 끝
      const top = ROW_Y - 7;
      const bot = ROW_Y + BLOCK_H + 7;
      el('path', {
        d: `M${r2(xAt(0) + 6)} ${top}h-6v${bot - top}h6`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });
      if (extent > 0) {
        closer = el('g', {});
        el(
          'path',
          { d: `M${r2(xAt(extent) - 6)} ${top}h6v${bot - top}h-6`, fill: 'none', stroke: colors.text, 'stroke-width': 2 },
          closer,
        );
      }

      // 크기 괄선
      if (s.total !== null) {
        const xa = xAt(0);
        const xb = xAt(s.total.size);
        el('line', { x1: xa, y1: BRACE_Y - 5, x2: xa, y2: BRACE_Y + 5, stroke: colors.text, 'stroke-width': 1.5 });
        const line = el('line', { x1: xa, y1: BRACE_Y, x2: xb, y2: BRACE_Y, stroke: colors.text, 'stroke-width': 1.5 });
        const tick = el('line', {
          x1: xb,
          y1: BRACE_Y - 5,
          x2: xb,
          y2: BRACE_Y + 5,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        const label = text(t('label.size', 'size {size}', { size: s.total.size }), {
          x: (xa + xb) / 2,
          y: BRACE_Y + 18,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        });
        brace = { line, tick, label };
      }
    }

    /** 한 시계 — p 는 0→1. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function clock(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            wake();
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

    function revealGaps(passedX: number, geo: Geo): void {
      for (const { byte, el: g } of stepGaps) {
        if (geo.x0 + (byte + 1) * geo.cw <= passedX + 0.5) g.removeAttribute('opacity');
        else g.setAttribute('opacity', '0');
      }
    }

    async function animatePlace(
      s: PaddingGapScene,
      step: { index: number; from: number; offset: number },
      mine: number,
    ): Promise<void> {
      const f = s.fields[step.index];
      const block = mover;
      if (f === undefined || block === null) return;
      const geo = geoOf(s);
      const xAt = (b: number): number => geo.x0 + b * geo.cw;
      const fromX = xAt(step.from);
      const finalX = xAt(step.offset);
      const qx = geo.qx[step.index] ?? finalX;
      const slides = step.offset > step.from;
      const total = DROP_MS + (slides ? SLIDE_MS : 0);
      const cut = DROP_MS / total;
      const endX = xAt(step.offset + f.size);
      const handle = closer;

      await clock(total, mine, (p) => {
        let bx: number;
        let by: number;
        let closeX: number;
        if (p < cut) {
          // 대기 줄에서 앞 끝으로 내려온다
          const q = ease(p / cut);
          bx = qx + (fromX - qx) * q;
          by = QUEUE_Y + (ROW_Y - QUEUE_Y) * q;
          closeX = fromX;
        } else {
          // 제 정렬 자리까지 밀려 앉는다
          const q = ease((p - cut) / (1 - cut));
          bx = fromX + (finalX - fromX) * q;
          by = ROW_Y;
          closeX = bx + f.size * geo.cw;
        }
        block.setAttribute('transform', `translate(${r2(bx - finalX)} ${r2(by - ROW_Y)})`);
        if (handle !== null) handle.setAttribute('transform', `translate(${r2(Math.max(closeX, fromX) - endX)} 0)`);
        revealGaps(p < cut ? -Infinity : bx, geo);
      });
    }

    async function animateTail(s: PaddingGapScene, end: number, size: number, mine: number): Promise<void> {
      const handle = closer;
      if (handle === null || size === end) return;
      const geo = geoOf(s);
      const endX = geo.x0 + end * geo.cw;
      const sizeX = geo.x0 + size * geo.cw;
      await clock(TAIL_MS, mine, (p) => {
        const x = endX + (sizeX - endX) * ease(p);
        handle.setAttribute('transform', `translate(${r2(x - sizeX)} 0)`);
        revealGaps(x, geo);
      });
    }

    async function animateBrace(s: PaddingGapScene, mine: number): Promise<void> {
      const b = brace;
      if (b === null || s.total === null) return;
      const geo = geoOf(s);
      const xa = geo.x0;
      const xb = geo.x0 + s.total.size * geo.cw;
      await clock(BRACE_MS, mine, (p) => {
        const x = xa + (xb - xa) * ease(p);
        b.line.setAttribute('x2', String(r2(x)));
        b.tick.setAttribute('transform', `translate(${r2(x - xb)} 0)`);
        if (p < 1) b.label.setAttribute('opacity', '0');
        else b.label.removeAttribute('opacity');
      });
    }

    return {
      async render(next: PaddingGapScene, _prev: PaddingGapScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed || !narrowScene(next)) return;
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step === null) return;
        if (step.kind === 'place') await animatePlace(next, step, mine);
        else if (step.kind === 'tail') await animateTail(next, step.end, step.size, mine);
        else if (step.kind === 'total') await animateBrace(next, mine);
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
