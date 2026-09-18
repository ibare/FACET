/**
 * 처음 한 번과 그 뒤 — 무대.
 *
 * 왼쪽에 프롬프트와 낸 토큰이 글로 있고, 가운데에 K·V 셈의 문이, 오른쪽에 캐시가
 * 아래에서 위로 쌓인다. 걸음마다 캐시에 들어갈 자리가 제 낱말 자리에서 떠나 문을
 * 지나 캐시 꼭대기에 판으로 내려앉는다 — 첫 걸음에는 프롬프트 전부가 한꺼번에,
 * 그 뒤로는 방금 낸 토큰 하나만. 걸음마다 들어온 층은 옆 괄호로 남아 두께를 견줄 수 있다.
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
import type { FirstTokenVsRestScene } from './scene.js';

const H = 320;
const SVG = 'http://www.w3.org/2000/svg';

/** 움직임 — 판이 문을 지나 캐시에 앉는 데, 낸 토큰이 문에서 제자리로 가는 데. */
const FEED_MS = 1000;
const EMIT_MS = 400;

const SLAB_H_MAX = 20;
const SLAB_W_MAX = 200;
/** 판이 낱말 자리에서 떠날 때의 크기 비율. */
const CHIP_SCALE = 0.35;

type Pt = { x: number; y: number };

type Geo = {
  margin: number;
  leftW: number;
  gate: Pt;
  gateW: number;
  gateH: number;
  stackX0: number;
  slabW: number;
  pitch: number;
  slabH: number;
  bottom: number;
  bracketX: number;
  headY: number;
  captionY: [number, number];
};

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function geometry(cap: number): Geo {
  const W = PIECE_CANVAS_W;
  const margin = 24;
  const top = 48;
  const bottom = 250;
  const stackX0 = Math.round(W * 0.56);
  const slabW = Math.min(SLAB_W_MAX, Math.round(W * 0.84) - stackX0);
  const pitch = Math.min(SLAB_H_MAX, (bottom - top) / Math.max(1, cap));
  return {
    margin,
    leftW: Math.round(W * 0.36),
    gate: { x: Math.round(W * 0.47), y: r((top + bottom) / 2) },
    gateW: 40,
    gateH: 100,
    stackX0,
    slabW,
    pitch,
    slabH: Math.max(4, pitch - 2),
    bottom,
    bracketX: stackX0 + slabW + 8,
    headY: 30,
    captionY: [H - 42, H - 20],
  };
}

/** 고정폭 글꼴의 글자 폭 어림. */
function charW(px: number): number {
  return px * 0.6;
}

type WordSpot = { x: number; y: number; w: number };

/** 열의 자리마다 왼쪽 글에서의 자리. 프롬프트가 먼저, 낸 토큰은 그 아래 따로. */
function layoutWords(scene: FirstTokenVsRestScene, g: Geo, px: number): {
  spots: WordSpot[];
  emittedHeadY: number;
} {
  const cw = charW(px);
  const lineH = Math.round(px * 1.7);
  const spots: WordSpot[] = [];
  const flow = (list: readonly string[], y0: number): number => {
    let x = g.margin;
    let y = y0;
    for (const w of list) {
      const width = w.length * cw;
      if (x > g.margin && x + width > g.margin + g.leftW) {
        x = g.margin;
        y += lineH;
      }
      spots.push({ x: r(x), y: r(y), w: r(width) });
      x += width + cw;
    }
    return y;
  };
  const lastPromptY = flow(scene.prompt, g.headY + 28);
  const emittedHeadY = lastPromptY + 40;
  flow(scene.continuation, emittedHeadY + 28);
  return { spots, emittedHeadY };
}

function asScene(v: unknown): FirstTokenVsRestScene | null {
  if (v === null || typeof v !== 'object') return null;
  const s = v as Partial<FirstTokenVsRestScene>;
  return Array.isArray(s.prompt) && Array.isArray(s.continuation) && Array.isArray(s.layers)
    ? (s as FirstTokenVsRestScene)
    : null;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

type Handles = {
  slabs: Map<number, SVGGElement>;
  words: Map<number, SVGTextElement>;
  gate: SVGRectElement | null;
};

export const firstTokenVsRestStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<FirstTokenVsRestScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let handles: Handles = { slabs: new Map(), words: new Map(), gate: null };

    const wordPx = parseInt(fontSizes.md, 10);

    function slabTransform(c: Pt, s: number): string {
      return `translate(${r(c.x)} ${r(c.y)}) scale(${r(s)})`;
    }

    function slabCenter(g: Geo, pos: number): Pt {
      return { x: r(g.stackX0 + g.slabW / 2), y: r(g.bottom - (pos + 0.5) * g.pitch) };
    }

    function wordOf(scene: FirstTokenVsRestScene, pos: number): string {
      const p = scene.prompt.length;
      return pos < p ? (scene.prompt[pos] ?? '') : (scene.continuation[pos - p] ?? '');
    }

    function drawStatic(scene: FirstTokenVsRestScene): void {
      svg.textContent = '';
      handles = { slabs: new Map(), words: new Map(), gate: null };
      const P = scene.prompt.length;
      const C = scene.continuation.length;
      if (P + C === 0) return;
      const g = geometry(P + C);
      const layerColors = categorical(C, 'vivid');
      const cached = scene.layers.reduce((a, l) => a + l.count, 0);

      // 제목들
      const head = { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted };
      const { spots, emittedHeadY } = layoutWords(scene, g, wordPx);
      el(svg, 'text', { x: g.margin, y: g.headY, ...head }, t('label.prompt', 'Prompt'));
      el(svg, 'text', { x: g.margin, y: emittedHeadY, ...head }, t('label.emitted', 'Emitted'));
      el(
        svg,
        'text',
        { x: g.stackX0, y: g.headY, ...head },
        t('label.cache', 'Cache: {c} positions', { c: cached }),
      );

      // 왼쪽 글 — 캐시에 든 자리는 옅게, 아직 안 든 것은 짙게
      for (let pos = 0; pos < P + scene.emitted && pos < spots.length; pos += 1) {
        const s = spots[pos];
        if (s === undefined) continue;
        const node = el(
          svg,
          'text',
          {
            x: s.x,
            y: s.y,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: pos < cached ? colors.textMuted : colors.text,
          },
          wordOf(scene, pos),
        );
        handles.words.set(pos, node);
      }

      // K·V 셈의 문
      handles.gate = el(svg, 'rect', {
        x: r(g.gate.x - g.gateW / 2),
        y: r(g.gate.y - g.gateH / 2),
        width: g.gateW,
        height: g.gateH,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      el(
        svg,
        'text',
        {
          x: g.gate.x,
          y: r(g.gate.y - g.gateH / 2 - 8),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        t('label.compute', 'K·V compute'),
      );

      // 캐시 바닥
      el(svg, 'line', {
        x1: g.stackX0 - 4,
        x2: g.stackX0 + g.slabW + 4,
        y1: g.bottom + 1,
        y2: g.bottom + 1,
        stroke: colors.border,
        'stroke-width': 2,
      });

      // 층 — 판과 괄호
      for (const layer of scene.layers) {
        const fill = layerColors[layer.k - 1] ?? colors.primary;
        for (let i = 0; i < layer.count; i += 1) {
          const pos = layer.from + i;
          const grp = el(svg, 'g', { transform: slabTransform(slabCenter(g, pos), 1) });
          el(grp, 'rect', {
            x: r(-g.slabW / 2),
            y: r(-g.slabH / 2),
            width: g.slabW,
            height: r(g.slabH),
            rx: 3,
            fill,
          });
          el(
            grp,
            'text',
            {
              x: 0,
              y: 0,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textInverse,
            },
            wordOf(scene, pos),
          );
          handles.slabs.set(pos, grp);
        }
        const y0 = r(g.bottom - layer.from * g.pitch - 1);
        const y1 = r(g.bottom - (layer.from + layer.count) * g.pitch + 1);
        const bx = g.bracketX;
        el(svg, 'path', {
          d: `M ${bx} ${y0} L ${bx + 5} ${y0} M ${bx + 5} ${y0} L ${bx + 5} ${y1} M ${bx + 5} ${y1} L ${bx} ${y1}`,
          fill: 'none',
          stroke: fill,
          'stroke-width': 2,
        });
        el(
          svg,
          'text',
          {
            x: bx + 12,
            y: r((y0 + y1) / 2),
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.text,
          },
          t('label.added', '+{n}', { n: layer.count }),
        );
      }

      // 캡션 — 지금 일어나는 일만
      const cap = { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text };
      const step = scene.step;
      let line1 = '';
      let line2 = '';
      if (step?.kind === 'feed') {
        line1 =
          step.from < P
            ? t(
                'caption.prefill',
                'Step {k}: all {n} prompt positions go through the K·V compute at once.',
                { k: step.k, n: step.count },
              )
            : t(
                'caption.decode',
                'Step {k}: only the token emitted last, {word}, goes through. New positions: {n}.',
                { k: step.k, word: wordOf(scene, step.from), n: step.count },
              );
        line2 = t('caption.emit', 'Emitted next: {word}', {
          word: scene.continuation[step.emit] ?? '',
        });
      } else if (step?.kind === 'done') {
        const first = scene.layers[0]?.count ?? 0;
        line1 = t(
          'caption.done',
          'Computed {total} positions in all: {first} on step 1, {rest} over the {m} steps after.',
          {
            total: step.total,
            first,
            rest: step.total - first,
            m: Math.max(0, scene.layers.length - 1),
          },
        );
        line2 = t('caption.never', '{word} was emitted last, so its K·V is never computed.', {
          word: scene.continuation[C - 1] ?? '',
        });
      }
      if (line1) el(svg, 'text', { x: g.margin, y: g.captionY[0], ...cap }, line1);
      if (line2) el(svg, 'text', { x: g.margin, y: g.captionY[1], ...cap }, line2);
    }

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /** 한 시계 — duration 동안 frame(경과 ms) 를 부르고 끝나면 푼다. */
    function run(duration: number, mine: number, frame: (ms: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ms = Math.min(duration, now() - start);
          frame(ms);
          if (ms >= duration) {
            finish();
            return;
          }
          const h = setTimeout(() => {
            timers.delete(h);
            tick();
          }, 16);
          timers.add(h);
        };
        tick();
      });
    }

    function ease(u: number): number {
      const c = Math.max(0, Math.min(1, u));
      return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
    }

    function lerp(a: Pt, b: Pt, u: number): Pt {
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }

    async function animateFeed(scene: FirstTokenVsRestScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step?.kind !== 'feed') return;
      const P = scene.prompt.length;
      const C = scene.continuation.length;
      const g = geometry(P + C);
      const { spots } = layoutWords(scene, g, wordPx);
      const h = handles;

      // 이번 층의 판 — 제 낱말 자리에서 출발
      const moving: { node: SVGGElement; src: Pt; dst: Pt }[] = [];
      for (let i = 0; i < step.count; i += 1) {
        const pos = step.from + i;
        const node = h.slabs.get(pos);
        const s = spots[pos];
        if (node === undefined || s === undefined) continue;
        moving.push({
          node,
          src: { x: s.x + s.w / 2, y: s.y - wordPx * 0.35 },
          dst: slabCenter(g, pos),
        });
      }
      // 이번에 낸 토큰 — 문에서 나와 제자리로
      const emitPos = P + step.emit;
      const emitNode = h.words.get(emitPos);
      const emitSpot = spots[emitPos];
      const emitFrom: Pt | null =
        emitSpot === undefined
          ? null
          : {
              x: g.gate.x - (emitSpot.x + emitSpot.w / 2),
              y: g.gate.y + wordPx * 0.35 - emitSpot.y,
            };

      const place = (ms: number): void => {
        const u = ms / FEED_MS;
        for (const m of moving) {
          let c: Pt;
          let s: number;
          if (u < 0.5) {
            c = lerp(m.src, g.gate, ease(u / 0.5));
            s = CHIP_SCALE;
          } else {
            const v = ease((u - 0.5) / 0.5);
            c = lerp(g.gate, m.dst, v);
            s = CHIP_SCALE + (1 - CHIP_SCALE) * v;
          }
          m.node.setAttribute('transform', slabTransform(c, s));
        }
        if (h.gate !== null) {
          const inGate = u > 0.3 && u < 0.7;
          h.gate.setAttribute('stroke', inGate ? colors.accent : colors.border);
        }
        if (emitNode !== undefined && emitFrom !== null) {
          const e = ease((ms - FEED_MS) / EMIT_MS);
          if (ms < FEED_MS) {
            emitNode.setAttribute('opacity', '0');
          } else {
            emitNode.removeAttribute('opacity');
          }
          emitNode.setAttribute(
            'transform',
            `translate(${r(emitFrom.x * (1 - e))} ${r(emitFrom.y * (1 - e))})`,
          );
        }
      };

      await run(FEED_MS + EMIT_MS, mine, place);
    }

    return {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const scene = asScene(next);
        if (scene === null) {
          svg.textContent = '';
          return;
        }
        drawStatic(scene);
        if (!opts.animate) return;
        const step = scene.step;
        if (step?.kind !== 'feed') return;
        // 앞 장면이 바로 한 걸음 앞일 때만 흘린다 — 뛰어넘은 걸음은 곧바로 세운다
        if (prev === null || prev.layers.length !== scene.layers.length - 1) return;
        await animateFeed(scene, mine);
        if (mine === gen && !destroyed) drawStatic(scene);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const h of timers) clearTimeout(h);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
