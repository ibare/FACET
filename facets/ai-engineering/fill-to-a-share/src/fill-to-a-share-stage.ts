/**
 * fill-to-a-share 무대 — 문맥 둘이 나란히 선다. 문맥마다 그릇 하나와 확률 차례로 선 후보 줄.
 *
 * 동사는 "차오른다". 후보 하나를 담으면 그 조각이 줄의 자리에서 떠나 그릇 안 맨 위로
 * 날아가 제 확률만큼의 켜가 되고, 그릇의 수위(찬 몫)가 그만큼 올라간다. 수위가 p 선에
 * 닿은 걸음에서 담기가 멈추고, 담기지 않은 후보는 줄에 남아 흐려진다.
 * 끝 걸음은 k 로 고정했다면 찼을 높이를 그릇 곁의 괄호로 밀어 올린다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  shiftLightness,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { FillToAShareScene } from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 */
const POUR_MS = 560;
const COMPARE_MS = 600;
const FRAME_MS = 16;

type Motion = { kind: 'pour'; e: number } | { kind: 'compare'; e: number } | null;

function fmt2(x: number): string {
  const r = Math.round(x * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round1(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
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
      'dominant-baseline': 'central',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = content;
  return node;
}

/** 문맥 하나의 자리. 전부 캔버스 폭에서 역산한다. */
function geometry(c: number) {
  const panelW = PIECE_CANVAS_W / 2;
  const x0 = c * panelW;
  const vesselTop = 64;
  const vesselH = 240;
  return {
    x0,
    panelW,
    sentenceY: 32,
    vx: x0 + panelW * 0.17,
    vw: panelW * 0.27,
    vesselTop,
    vesselH,
    vesselBottom: vesselTop + vesselH,
    lx: x0 + panelW * 0.585,
    lw: panelW * 0.39,
    slotH: vesselH / 8,
  };
}

export const fillToAShareStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<FillToAShareScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function layerFill(j: number): string {
      return shiftLightness(colors.primary, j % 2 === 0 ? 0 : 0.08);
    }

    function drawPanel(scene: FillToAShareScene, c: number, motion: Motion): void {
      const ctx = scene.contexts[c];
      if (!ctx) return;
      const g = geometry(c);
      const layer = el('g', {}, svg);
      const cums = scene.cums[c] ?? [];
      const step = scene.step;
      const pouring = motion?.kind === 'pour' && step?.kind === 'pour' && step.c === c ? step : null;
      const arrived = pouring ? cums.length - 1 : cums.length;
      const stopped = (scene.stopped[c] ?? false) && !pouring;

      // 문맥 문장 — 자료 그대로
      label(layer, g.x0 + g.panelW * 0.04, g.sentenceY, ctx.sentence, {
        size: fontSizes.md,
        fill: colors.text,
        mono: true,
      });

      // 그릇
      el(
        'rect',
        {
          x: g.vx,
          y: g.vesselTop,
          width: g.vw,
          height: g.vesselH,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        },
        layer,
      );

      // 담긴 켜들
      const yOf = (share: number): number => g.vesselBottom - share * g.vesselH;
      for (let j = 0; j < arrived; j += 1) {
        const below = j === 0 ? 0 : cums[j - 1]!;
        const top = cums[j]!;
        const crossing = stopped && j === cums.length - 1;
        const fill = crossing ? colors.accent : layerFill(j);
        el(
          'rect',
          { x: g.vx, y: yOf(top), width: g.vw, height: yOf(below) - yOf(top), fill, stroke: colors.bg, 'stroke-width': 1 },
          layer,
        );
      }

      // p 선
      const pY = yOf(scene.p);
      el(
        'line',
        {
          x1: g.vx - 4,
          y1: pY,
          x2: g.vx + g.vw + 4,
          y2: pY,
          stroke: colors.itemComparing,
          'stroke-width': 2,
          'stroke-dasharray': '5 3',
        },
        layer,
      );
      label(layer, g.vx - 8, pY, t('label.threshold', 'p {p}', { p: fmt2(scene.p) }), {
        size: fontSizes.xs,
        fill: colors.itemComparing,
        anchor: 'end',
        weight: '600',
      });

      // 켜 이름은 p 선 위에 — 선이 글자를 긋지 않게
      for (let j = 0; j < arrived; j += 1) {
        const below = j === 0 ? 0 : cums[j - 1]!;
        const top = cums[j]!;
        const crossing = stopped && j === cums.length - 1;
        const cand = ctx.ranked[j]!;
        label(layer, g.vx + g.vw / 2, (yOf(top) + yOf(below)) / 2, `${cand.token} ${fmt2(cand.prob)}`, {
          size: fontSizes.xs,
          fill: crossing ? colors.text : colors.textInverse,
          anchor: 'middle',
          mono: true,
        });
      }

      // 수위 읽개
      let level: number | null = cums.length > 0 ? cums[cums.length - 1]! : null;
      if (pouring) level = lerp(pouring.before, pouring.cum, motion!.e);
      if (level !== null) {
        const ly = yOf(level);
        el('line', { x1: g.vx + g.vw, y1: ly, x2: g.vx + g.vw + 6, y2: ly, stroke: colors.text, 'stroke-width': 1.5 }, layer);
        label(layer, g.vx + g.vw + 8, ly, fmt2(level), {
          size: fontSizes.sm,
          fill: colors.text,
          mono: true,
          weight: '600',
        });
      }

      // 후보 줄 — 확률 큰 차례
      const chipH = g.slotH - 6;
      const chipY = (j: number): number => g.vesselTop + j * g.slotH + 3;
      for (let j = 0; j < ctx.ranked.length; j += 1) {
        const cand = ctx.ranked[j]!;
        const y = chipY(j);
        if (j < cums.length) {
          // 떠난 자리
          el(
            'rect',
            {
              x: g.lx,
              y,
              width: g.lw,
              height: chipH,
              rx: 4,
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '3 3',
            },
            layer,
          );
          continue;
        }
        const chip = el('g', {}, layer);
        if (stopped) chip.setAttribute('opacity', '0.4');
        el(
          'rect',
          { x: g.lx, y, width: g.lw, height: chipH, rx: 4, fill: colors.bg, stroke: colors.border, 'stroke-width': 1 },
          chip,
        );
        label(chip, g.lx + 8, y + chipH / 2, cand.token, {
          size: fontSizes.sm,
          fill: stopped ? colors.textMuted : colors.text,
          mono: true,
        });
        label(chip, g.lx + g.lw - 8, y + chipH / 2, fmt2(cand.prob), {
          size: fontSizes.sm,
          fill: colors.textMuted,
          anchor: 'end',
          mono: true,
        });
      }

      // 날아가는 조각 — 줄의 자리에서 그릇의 켜로
      if (pouring) {
        const e = motion!.e;
        const cand = ctx.ranked[pouring.i]!;
        const fromX = g.lx;
        const fromY = chipY(pouring.i);
        const toY = yOf(pouring.cum);
        const toH = yOf(pouring.before) - toY;
        const x = lerp(fromX, g.vx, e);
        const y = lerp(fromY, toY, e);
        const w = lerp(g.lw, g.vw, e);
        const h = lerp(chipH, toH, e);
        el('rect', { x, y, width: w, height: h, rx: lerp(4, 0, e), fill: layerFill(pouring.i), stroke: colors.bg }, layer);
        label(layer, x + w / 2, y + h / 2, `${cand.token} ${fmt2(cand.prob)}`, {
          size: fontSizes.xs,
          fill: colors.textInverse,
          anchor: 'middle',
          mono: true,
        });
      }

      // 멈춘 뒤 남는 수
      const underX = g.vx + g.vw / 2;
      if (stopped) {
        label(layer, underX, g.vesselBottom + 20, t('label.kept', 'Kept: {n}', { n: cums.length }), {
          size: fontSizes.sm,
          fill: colors.success,
          anchor: 'middle',
          weight: '700',
        });
      }

      // top-k 였다면 — 그릇 곁의 괄호
      const fill = scene.topK?.[c];
      if (fill !== undefined) {
        const e = motion?.kind === 'compare' ? motion.e : 1;
        const topY = yOf(fill * e);
        const bx = g.vx - 3;
        el(
          'path',
          {
            d: `M ${round1(bx - 5)} ${round1(g.vesselBottom)} L ${round1(bx)} ${round1(g.vesselBottom)} L ${round1(bx)} ${round1(topY)} L ${round1(bx + g.vw * 0.35)} ${round1(topY)}`,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 2,
          },
          layer,
        );
        if (motion?.kind !== 'compare') {
          label(
            layer,
            underX,
            g.vesselBottom + 40,
            t('label.topk', 'top-{k}: filled {fill}', { k: scene.k, fill: fmt2(fill) }),
            { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' },
          );
        }
      }
    }

    function caption(scene: FillToAShareScene): string {
      const step = scene.step;
      if (!step) return '';
      if (step.kind === 'show') {
        return t('caption.show', 'Candidates line up by probability. Filling stops once the share is at least p = {p}.', {
          p: fmt2(scene.p),
        });
      }
      if (step.kind === 'pour') {
        const token = scene.contexts[step.c]?.ranked[step.i]?.token ?? '';
        if (step.reached) {
          return t('caption.reached', 'In goes {token}. Filled {cum} ≥ {p} — filling stops. Candidates kept: {n}.', {
            token,
            cum: fmt2(step.cum),
            p: fmt2(scene.p),
            n: step.i + 1,
          });
        }
        return t('caption.pour', 'In goes {token}. Filled {cum}, still below {p}.', {
          token,
          cum: fmt2(step.cum),
          p: fmt2(scene.p),
        });
      }
      const fills = scene.topK ?? [];
      return t('caption.compare', 'Had we kept the top {k} instead — left fills {a}, right fills {b}.', {
        k: scene.k,
        a: fmt2(fills[0] ?? 0),
        b: fmt2(fills[1] ?? 0),
      });
    }

    function drawStatic(scene: FillToAShareScene, motion: Motion = null): void {
      svg.textContent = '';
      for (let c = 0; c < scene.shown; c += 1) drawPanel(scene, c, motion);
      const text = caption(scene);
      if (text) {
        label(svg, PIECE_CANVAS_W / 2, H - 12, text, {
          size: fontSizes.sm,
          fill: colors.text,
          anchor: 'middle',
        });
      }
    }

    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
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
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            wake();
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

    return {
      async render(next, _prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step?.kind === 'pour') {
          await tween(POUR_MS, mine, (e) => drawStatic(next, { kind: 'pour', e }));
        } else if (step?.kind === 'compare') {
          await tween(COMPARE_MS, mine, (e) => drawStatic(next, { kind: 'compare', e }));
        } else {
          return;
        }
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
