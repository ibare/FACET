/**
 * 자르는 자리 — 무대.
 *
 * 글은 흐르는 줄글로 놓이고, 칼자리마다 줄이 끊겨 조각 상자가 갈린다.
 * - `cut`  칼이 낱말 사이로 떨어지고, 그 뒤 낱말들이 아래 상자로 미끄러져 내려간다.
 *          칼자리가 문장 한가운데면 그 문장이 두 상자로 갈라진 채 붉게 남는다.
 * - `move` 칼이 줄글을 따라 문장 끝으로 옮겨 가고, 넘어갔던 꼬리 낱말들이 앞 상자로
 *          되돌아와 문장이 한 상자에 붙는다. 옛 칼자리는 점선 눈금으로 남는다.
 *
 * 자리는 전부 여기서 셈한다. 장면에는 낱말 번호와 칼자리만 있다.
 */
import {
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
  type SceneRenderer,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { Cut, WhereToCutScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 줄글 — 고정폭 글꼴이라 낱말 폭을 글자 수로 셈한다. */
const TEXT_PX = 12;
const CHAR_W = TEXT_PX * 0.6;
const GUTTER = 84;
const RIGHT = 8;
const CAPTION_Y = 20;
const TEXT_TOP = 40;
/** 합계 두 줄이 차지하는 아래 띠. */
const TALLY_BAND = 50;
/** 간격의 상한. 넘치면 비율로 줄인다. */
const ROW_H = 19;
const PAD = 7;
const GAP = 20;

const DROP_MS = 450;
const SLIDE_MS = 550;
const MOVE_MS = 750;
const FRAME = 16;

type WordPos = { x: number; y: number; w: number };
type Box = { x: number; y: number; w: number; h: number; first: number; last: number };
type Layout = { words: WordPos[]; boxes: Box[] };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

/** 칼자리들로 줄글을 조각 상자에 흘린다. */
function flow(words: string[], ats: number[], rowH: number, pad: number, gap: number): Layout {
  const x0 = GUTTER;
  const x1 = PIECE_CANVAS_W - RIGHT;
  const bounds = [...ats].sort((a, b) => a - b).filter((a) => a > 0 && a < words.length);
  const ends = [...bounds, words.length];
  const pos: WordPos[] = [];
  const boxes: Box[] = [];
  let top = TEXT_TOP;
  let start = 0;
  for (const end of ends) {
    if (end <= start) continue;
    let row = 0;
    let x = x0 + pad;
    for (let i = start; i < end; i += 1) {
      const w = words[i]!.length * CHAR_W;
      if (x > x0 + pad && x + w > x1 - pad) {
        row += 1;
        x = x0 + pad;
      }
      pos[i] = { x, y: top + pad + row * rowH + rowH * 0.7, w };
      x += w + CHAR_W;
    }
    const h = (row + 1) * rowH + pad * 2;
    boxes.push({ x: x0, y: top, w: x1 - x0, h, first: start, last: end - 1 });
    top += h + gap;
    start = end;
  }
  return { words: pos, boxes };
}

/** 상한 간격으로 흘려 보고, 합계 띠를 넘으면 간격을 줄여 담는다. */
function layout(words: string[], ats: number[]): Layout {
  const first = flow(words, ats, ROW_H, PAD, GAP);
  const last = first.boxes[first.boxes.length - 1];
  const limit = H - TALLY_BAND;
  if (!last || last.y + last.h <= limit) return first;
  const k = (limit - TEXT_TOP) / (last.y + last.h - TEXT_TOP);
  return flow(words, ats, ROW_H * k, PAD * k, GAP * k);
}

/** 칼자리 `at` 의 자리 — 낱말 at-1 의 오른쪽 끝과 다음 낱말 사이. */
function gapAt(lay: Layout, at: number): { x: number; y: number } {
  const w = lay.words[at - 1];
  if (!w) return { x: GUTTER, y: TEXT_TOP };
  return { x: w.x + w.w + CHAR_W / 2, y: w.y };
}

function chunkSizes(ats: number[], total: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const at of [...ats].sort((a, b) => a - b)) {
    out.push(at - prev);
    prev = at;
  }
  out.push(total - prev);
  return out;
}

type Handles = {
  words: SVGTextElement[];
  boxes: SVGRectElement[];
  /** 운동 동안 가려 두는 층 (밑줄 · 칼자리 표 · 옛 칼자리 · 상자 이름). */
  quiet: SVGGElement;
  lay: Layout;
};

export const whereToCutStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<WhereToCutScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    function label(
      text: string,
      x: number,
      y: number,
      parent: Element,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function headOf(scene: WhereToCutScene, s: number | null): string {
      if (s === null) return '';
      const range = scene.sentences[s];
      if (!range) return '';
      return scene.words.slice(range[0], Math.min(range[0] + 3, range[1] + 1)).join(' ');
    }

    function caption(scene: WhereToCutScene): string {
      const step = scene.step;
      if (!step) return '';
      switch (step.kind) {
        case 'init':
          return t('caption.init', '{words} words · {sentences} sentences · {paragraphs} paragraphs', {
            words: scene.words.length,
            sentences: scene.sentences.length,
            paragraphs: scene.paragraphs,
          });
        case 'cut':
          return step.torn === null
            ? t('caption.cutClean', 'Cut after word {at}: it falls between sentences.', { at: step.at })
            : t('caption.cutTorn', 'Cut after word {at}: "{head} …" is split in two.', {
                at: step.at,
                head: headOf(scene, step.torn),
              });
        case 'move':
          return step.rejoined === null
            ? t('caption.move', 'Cut at the paragraph end, after word {to}.', { to: step.to })
            : t('caption.moveJoin', 'Cut at the paragraph end, after word {to}: "{head} …" is whole again.', {
                to: step.to,
                head: headOf(scene, step.rejoined),
              });
        case 'done':
          return t('caption.done', 'Both ways make {chunks} chunks.', { chunks: step.chunks });
      }
    }

    function blade(parent: Element, x: number, y: number): SVGPathElement {
      // 아래를 향한 쐐기 — 끝이 낱말 사이 밑줄 높이에 닿는다.
      const tipY = y + 5;
      return el(
        'path',
        {
          d: `M ${r2(x - 5)} ${r2(tipY - 22)} L ${r2(x + 5)} ${r2(tipY - 22)} L ${r2(x)} ${r2(tipY)} Z`,
          fill: colors.primary,
          stroke: colors.bg,
          'stroke-width': 1,
        },
        parent,
      );
    }

    function tally(scene: WhereToCutScene, parent: Element): void {
      const total = scene.words.length;
      const x1 = PIECE_CANVAS_W - RIGHT;
      const rows: Array<{ text: string; cuts: Cut[] }> = [];
      if (scene.fixed.length > 0) {
        rows.push({
          text: t('tally.fixed', 'Every {size} words: {sizes}', {
            size: scene.size,
            sizes: chunkSizes(
              scene.fixed.map((c) => c.at),
              total,
            ).join(' · '),
          }),
          cuts: scene.fixed,
        });
      }
      if (scene.finished) {
        rows.push({
          text: t('tally.paragraph', 'By paragraph: {sizes}', {
            sizes: chunkSizes(
              scene.cuts.map((c) => c.at),
              total,
            ).join(' · '),
          }),
          cuts: scene.cuts,
        });
      }
      rows.forEach((row, i) => {
        const y = H - TALLY_BAND + 22 + i * 20;
        label(row.text, GUTTER, y, parent, { fill: colors.text });
        const k = row.cuts.filter((c) => c.torn !== null).length;
        label(
          t('tally.cut', 'sentences cut: {k} / {n}', { k, n: scene.sentences.length }),
          x1,
          y,
          parent,
          { anchor: 'end', fill: k > 0 ? colors.danger : colors.success, weight: 'bold' },
        );
      });
    }

    function drawStatic(scene: WhereToCutScene): Handles | null {
      svg.textContent = '';
      if (scene.words.length === 0) return null;
      const ats = scene.cuts.map((c) => c.at);
      const lay = layout(scene.words, ats);
      const torn = new Set<number>();
      for (const c of scene.cuts) if (c.torn !== null) torn.add(c.torn);
      const sentenceOf: number[] = [];
      scene.sentences.forEach(([a, b], s) => {
        for (let i = a; i <= b; i += 1) sentenceOf[i] = s;
      });

      label(caption(scene), 8, CAPTION_Y, svg, { size: fontSizes.md });

      const boxLayer = el('g', {}, svg);
      const quiet = el('g', {}, svg);
      const textLayer = el('g', {}, svg);

      const boxes = lay.boxes.map((b) =>
        el(
          'rect',
          {
            x: b.x,
            y: b.y,
            width: b.w,
            height: b.h,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          },
          boxLayer,
        ),
      );

      // 상자 이름 — 조각의 낱말 수
      lay.boxes.forEach((b) => {
        label(t('label.words', '{n} words', { n: b.last - b.first + 1 }), GUTTER - 10, b.y + 15, quiet, {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
        });
      });

      // 문장 밑줄 — 줄마다 한 토막. 갈라진 문장은 붉고 굵다.
      scene.sentences.forEach(([a, b], s) => {
        let segStart = a;
        for (let i = a; i <= b; i += 1) {
          const cur = lay.words[i]!;
          const next = i < b ? lay.words[i + 1] : undefined;
          if (!next || next.y !== cur.y) {
            const from = lay.words[segStart]!;
            el(
              'line',
              {
                x1: from.x,
                y1: cur.y + 4,
                x2: cur.x + cur.w,
                y2: cur.y + 4,
                stroke: torn.has(s) ? colors.danger : colors.textMuted,
                'stroke-width': torn.has(s) ? 2 : 1,
                'stroke-linecap': 'butt',
              },
              quiet,
            );
            segStart = i + 1;
          }
        }
      });

      // 칼자리 표 — 상자 사이 틈에 가로 점선과 쐐기
      scene.cuts.forEach((c, j) => {
        const above = lay.boxes[j];
        const below = lay.boxes[j + 1];
        if (!above || !below) return;
        const y = (above.y + above.h + below.y) / 2;
        const ink = c.torn === null ? colors.primary : colors.danger;
        el(
          'line',
          {
            x1: above.x,
            y1: y,
            x2: above.x + above.w,
            y2: y,
            stroke: ink,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          },
          quiet,
        );
        el(
          'path',
          {
            d: `M ${r2(above.x - 14)} ${r2(y - 5)} L ${r2(above.x - 14)} ${r2(y + 5)} L ${r2(above.x - 2)} ${r2(y)} Z`,
            fill: ink,
          },
          quiet,
        );
      });

      // 옛 칼자리 — 고정 자르기가 떨어졌던 자리. 문단 자르기로 옮겨 간 뒤에 남는다.
      if (scene.byParagraph) {
        for (const f of scene.fixed) {
          if (scene.cuts.some((c) => c.at === f.at)) continue;
          const g = gapAt(lay, f.at);
          el(
            'line',
            {
              x1: g.x,
              y1: g.y - 13,
              x2: g.x,
              y2: g.y + 6,
              stroke: colors.textMuted,
              'stroke-width': 1.5,
              'stroke-dasharray': '2 2',
            },
            quiet,
          );
        }
      }

      const words = scene.words.map((w, i) => {
        const p = lay.words[i]!;
        const s = sentenceOf[i];
        const node = el(
          'text',
          {
            x: p.x,
            y: p.y,
            'font-family': fonts.mono,
            'font-size': `${TEXT_PX}px`,
            fill: s !== undefined && torn.has(s) ? colors.danger : colors.text,
          },
          textLayer,
        );
        node.textContent = w;
        return node;
      });

      tally(scene, quiet);
      return { words, boxes, quiet, lay };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function tween(ms: number, mine: number, frame: (e: number) => void): Promise<boolean> {
      const n = Math.max(1, Math.round(ms / FRAME));
      for (let i = 1; i <= n; i += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(FRAME);
        if (mine !== gen || destroyed) return false;
        frame(ease(i / n));
      }
      return true;
    }

    /** 낱말과 상자를 앞 배치(from)에서 끝 배치까지 `e` 만큼 옮겨 둔다. */
    function place(h: Handles, from: Layout, e: number): void {
      h.words.forEach((node, i) => {
        const a = from.words[i];
        const b = h.lay.words[i];
        if (!a || !b) return;
        const dx = r2((a.x - b.x) * (1 - e));
        const dy = r2((a.y - b.y) * (1 - e));
        if (dx === 0 && dy === 0) node.removeAttribute('transform');
        else node.setAttribute('transform', `translate(${dx} ${dy})`);
      });
      h.boxes.forEach((node, j) => {
        const b = h.lay.boxes[j]!;
        // 이 상자의 첫 낱말이 앞 배치에서 들어 있던 상자에서 출발한다.
        const a = from.boxes.find((x) => x.first <= b.first && b.first <= x.last) ?? b;
        node.setAttribute('y', String(r2(lerp(a.y, b.y, e))));
        node.setAttribute('height', String(r2(lerp(a.h, b.h, e))));
      });
    }

    async function render(
      next: WhereToCutScene,
      _prev: WhereToCutScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || destroyed || !h || !step) return;
      if (step.kind !== 'cut' && step.kind !== 'move') return;

      const ats = next.cuts.map((c) => c.at);
      const fromAts =
        step.kind === 'cut'
          ? ats.filter((a) => a !== step.at)
          : ats.map((a) => (a === step.to ? step.from : a));
      const from = layout(next.words, fromAts);

      // 아직 못 온 만큼 — 첫 프레임부터 앞 배치에 서 있게 한다.
      h.quiet.setAttribute('opacity', '0');
      place(h, from, 0);
      const knifeLayer = el('g', {}, svg);

      if (step.kind === 'cut') {
        // 칼이 떨어지는 동안 갈라질 문장은 아직 온전한 빛깔이다.
        const inks = h.words.map((w) => w.getAttribute('fill') ?? colors.text);
        h.words.forEach((w) => w.setAttribute('fill', colors.text));
        const g = gapAt(from, step.at);
        const knife = blade(knifeLayer, g.x, g.y);
        const lift = g.y + 10;
        knife.setAttribute('transform', `translate(0 ${r2(-lift)})`);
        const dropped = await tween(DROP_MS, mine, (e) => {
          knife.setAttribute('transform', `translate(0 ${r2(-lift * (1 - e))})`);
        });
        if (!dropped) return;
        h.words.forEach((w, i) => w.setAttribute('fill', inks[i]!));
        const slid = await tween(SLIDE_MS, mine, (e) => {
          place(h, from, e);
          knife.setAttribute('opacity', String(r2(1 - e)));
        });
        if (!slid) return;
      } else {
        const a = gapAt(from, step.from);
        const b = gapAt(h.lay, step.to);
        const knife = blade(knifeLayer, a.x, a.y);
        const moved = await tween(MOVE_MS, mine, (e) => {
          place(h, from, e);
          knife.setAttribute('transform', `translate(${r2((b.x - a.x) * e)} ${r2((b.y - a.y) * e)})`);
        });
        if (!moved) return;
      }

      if (mine !== gen || destroyed) return;
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
