/**
 * 겹쳐 자르기의 무대.
 *
 * 글은 문장마다 한 줄로 선다 — 문장이 한 창에 온전히 드는지가 줄 하나로 읽히게.
 * 각 줄 위의 가는 띠는 겹침 없이 자른 창, 아래 두 띠는 겹쳐 자른 창이다 (이웃한 창이
 * 서로 다른 띠를 써서 겹친 낱말 밑에는 띠가 둘 깔린다).
 *
 * 운동
 *   cut     겹침 없는 창들이 글을 따라 앞에서부터 차오른다
 *   window  겹쳐 자른 창이 먼저 이음매(앞 창의 끝)에 섰다가 겹침만큼 뒤로 물러난다.
 *           창은 크기를 지킨 채 물러나므로 줄을 넘어 흐른다. 이음매 자리는 점선으로 남는다
 *
 * 줄 오른쪽 칸은 그 문장을 온전히 담은 창의 번호다. 위 칸은 겹침 없이, 아래 칸은 겹쳐서.
 * 걸친 문장은 두 창 번호 사이에 칼자리 표시가 선다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Span } from './algorithm.js';
import type { OverlapTheSeamScene } from './scene.js';

const H = 324;
const PAD = 12;
const NUM_W = 16;
const GUTTER_W = 46;
const LEGEND_Y = [16, 34] as const;
const ROWS_TOP = 50;
const CAPTION_H = 44;
const ROW_MAX = 46;
const FONT_MAX = 13;
/** 고정폭 글꼴의 글자 폭 (em) */
const MONO_EM = 0.6;
const LANE_H = 4;
const PILL_W = 16;
const PILL_H = 12;

const CUT_MS = 900;
const GROW_MS = 500;
const HOLD_MS = 250;
const SLIDE_MS = 750;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 소수 첫째 자리로 반올림하고 -0 을 0 으로. */
const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
};

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** 흐르는 도중의 덮어쓰기. 없으면 장면 그대로. */
type Motion =
  | { kind: 'sweep'; upto: number }
  | { kind: 'place'; w: number; span: Span; ghost: Span | null };

type Layout = {
  fontPx: number;
  rowH: number;
  /** 낱말마다 [왼, 오른] x */
  wx: Array<[number, number]>;
  /** 낱말이 속한 문장 줄 */
  rowOf: number[];
};

function layoutOf(scene: OverlapTheSeamScene): Layout {
  const textX = PAD + NUM_W;
  const textW = PIECE_CANVAS_W - PAD - GUTTER_W - 8 - textX;
  let maxChars = 1;
  for (const [a, b] of scene.sentences) {
    maxChars = Math.max(maxChars, scene.words.slice(a, b).join(' ').length);
  }
  const charW = Math.min(FONT_MAX * MONO_EM, textW / maxChars);
  const fontPx = r1(charW / MONO_EM);
  const n = Math.max(1, scene.sentences.length);
  const rowH = Math.min(ROW_MAX, (H - ROWS_TOP - CAPTION_H) / n);
  const wx: Array<[number, number]> = [];
  const rowOf: number[] = [];
  scene.sentences.forEach(([a, b], r) => {
    let off = 0;
    for (let i = a; i < b; i += 1) {
      const len = scene.words[i]!.length;
      wx[i] = [textX + off * charW, textX + (off + len) * charW];
      rowOf[i] = r;
      off += len + 1;
    }
  });
  return { fontPx, rowH, wx, rowOf };
}

/** 문장 줄 안의 낱말 경계 k 의 x. 줄 머리 · 꼬리는 낱말 끝에, 사이는 빈칸 가운데에. */
function boundaryX(lay: Layout, sent: Span, k: number): number {
  const [ls, le] = sent;
  if (k <= ls) return lay.wx[ls]![0];
  if (k >= le) return lay.wx[le - 1]![1];
  return (lay.wx[k - 1]![1] + lay.wx[k]![0]) / 2;
}

/** 조각난 낱말 자리 p (소수 허용) 의 x. */
function posX(lay: Layout, sent: Span, p: number): number {
  const k = Math.floor(p);
  const f = p - k;
  const x0 = boundaryX(lay, sent, k);
  if (f === 0) return x0;
  return x0 + f * (boundaryX(lay, sent, k + 1) - x0);
}

/** 대강의 글 폭 — 줄바꿈에만 쓴다. 한글 · 한자 · 가나는 한 em, 나머지는 반 남짓. */
function roughWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x2e80 ? px : px * 0.56;
  }
  return w;
}

function wrap(s: string, px: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const tokens = s.includes(' ') ? s.split(' ') : [...s];
  const joiner = s.includes(' ') ? ' ' : '';
  for (const tok of tokens) {
    const next = cur === '' ? tok : cur + joiner + tok;
    if (cur !== '' && roughWidth(next, px) > maxW) {
      lines.push(cur);
      cur = tok;
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

export const overlapTheSeamStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<OverlapTheSeamScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function node(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size: string; fill: string; family?: string; anchor?: string; weight?: string },
    ): void {
      const e = node(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-size': opts.size,
          'font-family': opts.family ?? fonts.body,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      if (opts.weight !== undefined) e.setAttribute('font-weight', opts.weight);
      e.textContent = s;
    }

    /** 창 하나를 줄마다 끊어 띠로 깐다. */
    function band(
      parent: Element,
      scene: OverlapTheSeamScene,
      lay: Layout,
      span: Span,
      laneY: (r: number) => number,
      paint: { fill?: string; stroke?: string; dash?: boolean },
    ): void {
      scene.sentences.forEach((sent, r) => {
        const lo = Math.max(span[0], sent[0]);
        const hi = Math.min(span[1], sent[1]);
        if (hi - lo <= 1e-6) return;
        let x0 = posX(lay, sent, lo);
        let x1 = posX(lay, sent, hi);
        if (x1 - x0 > 4) {
          x0 += 1;
          x1 -= 1;
        }
        const attrs: Record<string, string | number> = {
          x: r1(x0),
          y: r1(laneY(r)),
          width: r1(x1 - x0),
          height: LANE_H,
          rx: 1.5,
        };
        if (paint.fill !== undefined) attrs.fill = paint.fill;
        else attrs.fill = 'none';
        if (paint.stroke !== undefined) {
          attrs.stroke = paint.stroke;
          attrs['stroke-width'] = 1;
        }
        if (paint.dash === true) attrs['stroke-dasharray'] = '3 2';
        node('rect', attrs, parent);
      });
    }

    function pill(parent: Element, x: number, cy: number, w: number, fill: string): void {
      node(
        'rect',
        { x: r1(x), y: r1(cy - PILL_H / 2), width: PILL_W, height: PILL_H, rx: 3, fill },
        parent,
      );
      label(parent, x + PILL_W / 2, cy + 4, String(w + 1), {
        size: fontSizes.xs,
        fill: pal.textInverse,
        family: fonts.mono,
        anchor: 'middle',
      });
    }

    function captionOf(scene: OverlapTheSeamScene): string {
      const step = scene.step;
      const m = scene.sentences.length;
      if (step === null) return '';
      switch (step.kind) {
        case 'init':
          return t('caption.init', '{n} words in {m} sentences. A window holds {size} words.', {
            n: scene.words.length,
            m,
            size: scene.size,
          });
        case 'cut':
          return t(
            'caption.cut',
            'No overlap: each window starts where the last one ended. {w} windows.',
            { w: scene.plain.windows.length },
          );
        case 'judge': {
          const holders = scene.plain.holders ?? [];
          const r = holders.findIndex((h) => h.kind === 'split');
          const h = holders[r];
          if (h === undefined || h.kind !== 'split') {
            return t('caption.allWhole', 'Every sentence sits whole in one window: {k} of {m}.', {
              k: scene.plain.whole ?? 0,
              m,
            });
          }
          return t(
            'caption.split',
            'The seam after word {at} cuts sentence {s} in two. Only {k} of {m} sentences sit whole in one window.',
            { at: h.at, s: r + 1, k: scene.plain.whole ?? 0, m },
          );
        }
        case 'window': {
          if (step.seam === null) {
            return t('caption.first', 'Overlap {o}: window 1 still starts at word 1.', {
              o: scene.overlap,
            });
          }
          const back = step.seam - step.start;
          const s = step.rescued[0];
          if (s !== undefined) {
            return t(
              'caption.rescue',
              'Window {w} steps back {o} words from the seam and holds sentence {s} whole.',
              { w: step.w + 1, o: back, s: s + 1 },
            );
          }
          return t(
            'caption.back',
            'Window {w} steps back {o} words from the seam: words {a}–{b} now sit in two windows.',
            { w: step.w + 1, o: back, a: step.start + 1, b: step.seam },
          );
        }
        case 'done':
          return t(
            'caption.done',
            '{k} of {m} sentences sit whole in one window. The cost: {n} words stored instead of {p}.',
            {
              k: scene.over.whole ?? 0,
              m,
              n: scene.over.stored ?? 0,
              p: scene.plain.stored ?? 0,
            },
          );
      }
    }

    function draw(scene: OverlapTheSeamScene, motion: Motion | null): void {
      svg.textContent = '';
      if (scene.words.length === 0) return;
      const root = node('g', {}, svg);
      const lay = layoutOf(scene);
      const W = PIECE_CANVAS_W;
      const nColors = Math.max(scene.counts.plain, scene.counts.over);
      const plainColors = categorical(nColors, 'deep');
      const overColors = categorical(nColors, 'vivid');
      const gx = W - PAD - GUTTER_W;

      const rowY = (r: number): number => ROWS_TOP + r * lay.rowH;
      const laneA = (r: number): number => rowY(r) + 1;
      const textTop = (r: number): number => rowY(r) + LANE_H + 4;
      const laneB = (lane: number) => (r: number): number =>
        textTop(r) + lay.fontPx + 4 + lane * (LANE_H + 3);
      const overPillY = (r: number): number => laneB(0)(r) + (LANE_H * 2 + 3) / 2;
      const plainPillY = (r: number): number => laneA(r) + LANE_H / 2;

      // 머리 두 줄 — 띠의 뜻과, 셈이 났으면 그 셈
      const modes = [
        {
          o: 0,
          colors: plainColors,
          n: scene.counts.plain,
          stat:
            scene.plain.whole === null
              ? null
              : { w: scene.plain.windows.length, n: scene.plain.stored ?? 0, k: scene.plain.whole },
        },
        {
          o: scene.overlap,
          colors: overColors,
          n: scene.counts.over,
          stat:
            scene.over.whole === null
              ? null
              : { w: scene.over.windows.length, n: scene.over.stored ?? 0, k: scene.over.whole },
        },
      ];
      modes.forEach((md, i) => {
        const y = LEGEND_Y[i]!;
        for (let c = 0; c < md.n; c += 1) {
          node(
            'rect',
            { x: PAD + c * 7, y: y - 6, width: 5, height: LANE_H, rx: 1, fill: md.colors[c]! },
            root,
          );
        }
        label(
          root,
          PAD + md.n * 7 + 4,
          y,
          t('legend', 'overlap {o} · stride {s}', { o: md.o, s: scene.size - md.o }),
          { size: fontSizes.xs, fill: pal.text },
        );
        if (md.stat !== null) {
          label(
            root,
            W - PAD,
            y,
            t('stat', '{w} windows · {n} words stored · {k}/{m} sentences whole', {
              w: md.stat.w,
              n: md.stat.n,
              k: md.stat.k,
              m: scene.sentences.length,
            }),
            { size: fontSizes.xs, fill: pal.textMuted, anchor: 'end' },
          );
        }
      });

      // 글 — 문장마다 한 줄
      scene.sentences.forEach(([a, b], r) => {
        const base = textTop(r) + lay.fontPx * 0.8;
        label(root, PAD, base, String(r + 1), {
          size: fontSizes.xs,
          fill: pal.textMuted,
          family: fonts.mono,
        });
        for (let i = a; i < b; i += 1) {
          label(root, lay.wx[i]![0], base, scene.words[i]!, {
            size: `${lay.fontPx}px`,
            fill: pal.text,
            family: fonts.mono,
          });
        }
      });

      // 겹침 없는 창 — 줄 위 띠
      const upto = motion?.kind === 'sweep' ? motion.upto : Infinity;
      scene.plain.windows.forEach(([s, e], w) => {
        const hi = Math.min(e, upto);
        if (hi <= s) return;
        band(root, scene, lay, [s, hi], laneA, { fill: plainColors[w]! });
      });

      // 겹쳐 자른 창 — 줄 아래 두 띠를 번갈아
      scene.over.windows.forEach((span, w) => {
        const lane = laneB(w % 2);
        if (motion?.kind === 'place' && motion.w === w) {
          if (motion.ghost !== null) {
            band(root, scene, lay, motion.ghost, lane, { stroke: overColors[w]!, dash: true });
          }
          band(root, scene, lay, motion.span, lane, { fill: overColors[w]! });
          return;
        }
        band(root, scene, lay, span, lane, { fill: overColors[w]! });
      });

      // 줄 오른쪽 칸 — 온전히 담은 창 번호, 걸쳤으면 칼자리
      const plainHolders = scene.plain.holders;
      scene.sentences.forEach((sent, r) => {
        if (plainHolders !== null) {
          const h = plainHolders[r]!;
          if (h.kind === 'whole') {
            pill(root, gx, plainPillY(r), h.w, plainColors[h.w]!);
          } else {
            pill(root, gx, plainPillY(r), h.a, plainColors[h.a]!);
            pill(root, gx + PILL_W + 8, plainPillY(r), h.b, plainColors[h.b]!);
            const mx = gx + PILL_W + 4;
            node(
              'line',
              {
                x1: r1(mx),
                y1: r1(plainPillY(r) - PILL_H / 2 - 1),
                x2: r1(mx),
                y2: r1(plainPillY(r) + PILL_H / 2 + 1),
                stroke: pal.danger,
                'stroke-width': 2,
              },
              root,
            );
            // 글 안의 칼자리
            const cx = boundaryX(lay, sent, h.at);
            node(
              'line',
              {
                x1: r1(cx),
                y1: r1(laneA(r) - 2),
                x2: r1(cx),
                y2: r1(textTop(r) + lay.fontPx + 1),
                stroke: pal.danger,
                'stroke-width': 2,
              },
              root,
            );
          }
        }
        const ow = scene.over.holders[r] ?? -1;
        const hidden = motion?.kind === 'place' && motion.w === ow;
        if (ow >= 0 && !hidden) pill(root, gx, overPillY(r), ow, overColors[ow]!);
      });

      // 지금 일어나는 일
      const cap = captionOf(scene);
      const lines = wrap(cap, 12, W - PAD * 2);
      const capTop = H - CAPTION_H + 16;
      lines.forEach((line, i) => {
        label(root, PAD, capTop + i * 16, line, { size: fontSizes.sm, fill: pal.text });
      });
    }

    /** 프레임을 세어 흐른다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let i = 0;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          i += 1;
          frame(Math.min(1, i / total));
          if (i >= total) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function render(
      next: OverlapTheSeamScene,
      _prev: OverlapTheSeamScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || step === null || (step.kind !== 'cut' && step.kind !== 'window')) {
        draw(next, null);
        return;
      }
      const live = (): boolean => mine === gen && !destroyed;
      if (step.kind === 'cut') {
        const n = next.words.length;
        await tween(CUT_MS, mine, (p) => {
          if (live()) draw(next, { kind: 'sweep', upto: ease(p) * n });
        });
      } else if (step.seam === null) {
        const { w, start, end } = step;
        await tween(GROW_MS, mine, (p) => {
          if (live()) {
            draw(next, { kind: 'place', w, span: [start, start + ease(p) * (end - start)], ghost: null });
          }
        });
      } else {
        const { w, start, seam } = step;
        const n = next.words.length;
        const size = next.size;
        const ghost: Span = [seam, Math.min(seam + size, n)];
        const hold = HOLD_MS / (HOLD_MS + SLIDE_MS);
        await tween(HOLD_MS + SLIDE_MS, mine, (p) => {
          if (!live()) return;
          const q = p <= hold ? 0 : ease((p - hold) / (1 - hold));
          const s = seam - q * (seam - start);
          draw(next, { kind: 'place', w, span: [s, Math.min(s + size, n)], ghost });
        });
      }
      if (live()) draw(next, null);
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
