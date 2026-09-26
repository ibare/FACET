/**
 * shrink-all 무대 — 무게 둘을 가로 · 세로 변으로 삼은 네모 하나.
 *
 * 원점 모서리를 붙박고 맞은편 모서리가 원점과 a 를 잇는 선을 따라 미끄러진다.
 * 갱신마다 네모는 같은 꼴 그대로 오그라들고(두 변이 같은 비율로 줄어든다),
 * 깎여 나간 ㄱ 자 띠는 긴 변 쪽이 두껍고 짧은 변 쪽이 얇다. 모서리는 원점에
 * 닿지 않는다. 가로 · 세로는 같은 축척이라 변의 길이가 곧 무게다.
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
} from '@ffacet/core/runtime';
import { narrowShrinkAllData, type Pair } from './algorithm.js';
import type { ShrinkAllScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 20;
/** 왼쪽 눈금 글자 자리 */
const TICK_ROOM = 40;
/** 오른쪽 축 이름 자리 */
const RIGHT_ROOM = 44;
const ROW = 24;
/** a 너머로 선을 늘이는 몫 */
const RAY_OVER = 1.1;
const MOVE_MS = 600;
const FRAME_MS = 16;
/** 눈금 글자 둘이 떨어져야 하는 폭 */
const TICK_GAP = 28;

type Layout = {
  ox: number;
  oy: number;
  s: number;
  tableTop: number;
};

function layoutFor(fit: Pair): Layout {
  const tableTop = H - 3 * ROW - 8;
  const oy = tableTop - 40;
  const top = 72;
  const ox = PAD + TICK_ROOM;
  const byW = (PIECE_CANVAS_W - ox - RIGHT_ROOM) / (fit[0] * RAY_OVER);
  const byH = (oy - top) / (fit[1] * RAY_OVER);
  return { ox, oy, s: Math.min(byW, byH), tableTop };
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r1(v) : v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  style: { size: string; fill: string; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; weight?: number },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': style.mono === true ? fonts.mono : fonts.body,
    'font-size': style.size,
    fill: style.fill,
    'text-anchor': style.anchor ?? 'start',
    'font-weight': style.weight ?? 400,
  });
  node.textContent = body;
  return node;
}

export const shrinkAllStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // initialData 가 있으면 좁혀 둔다 — 없으면 빈 캔버스로 기다린다. 자리는 장면의 바탕에서 셈한다
    if (params.initialData !== undefined) narrowShrinkAllData(params.initialData);

    function px(l: Layout, w: Pair): [number, number] {
      return [l.ox + w[0] * l.s, l.oy - w[1] * l.s];
    }

    /** 장면 하나의 화면 전체. `corner` 는 지금 네모의 맞은편 모서리 (운동 중엔 가는 길의 한 점). */
    function draw(scene: ShrinkAllScene, corner: Pair): void {
      svg.textContent = '';
      const l = layoutFor(scene.fit);
      const [ax, ay] = px(l, scene.fit);
      const [cx, cy] = px(l, corner);
      const smPx = fontSizes.sm;

      // 문안
      const step = scene.step;
      const caption =
        step.kind === 'start'
          ? t('caption.start', 'Start: both weights sit at the no-penalty fit a.')
          : t('caption.update', 'Update {k}: the L2 term takes η·λ·w from each weight.', { k: step.k });
      label(svg, PAD, 28, caption, { size: fontSizes.md, fill: colors.text, weight: 600 });
      label(svg, PAD, 50, t('formula.update', 'w ← w − η·(w − a) − η·λ·w'), {
        size: smPx,
        fill: colors.textMuted,
      });
      label(
        svg,
        PIECE_CANVAS_W - PAD,
        50,
        t('formula.params', 'η = {eta} · λ = {lam}', { eta: String(scene.eta), lam: String(scene.lambda) }),
        { size: smPx, fill: colors.textMuted, anchor: 'end' },
      );

      // 축
      const xEnd = l.ox + scene.fit[0] * RAY_OVER * l.s;
      const yEnd = l.oy - scene.fit[1] * RAY_OVER * l.s;
      el(svg, 'line', { x1: l.ox, y1: l.oy, x2: xEnd + 12, y2: l.oy, stroke: colors.textMuted, 'stroke-width': 1 });
      el(svg, 'line', { x1: l.ox, y1: l.oy, x2: l.ox, y2: yEnd - 8, stroke: colors.textMuted, 'stroke-width': 1 });
      label(svg, xEnd + 16, l.oy + 4, scene.ids[0], { size: smPx, fill: colors.textMuted, mono: true });
      label(svg, l.ox + 6, yEnd - 6, scene.ids[1], { size: smPx, fill: colors.textMuted, mono: true });

      // 같은 비의 선 — 원점과 a 를 잇는다
      const [rx, ry] = px(l, [scene.fit[0] * RAY_OVER, scene.fit[1] * RAY_OVER]);
      el(svg, 'line', {
        x1: l.ox,
        y1: l.oy,
        x2: rx,
        y2: ry,
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
      if (scene.quotient !== null) {
        label(
          svg,
          rx,
          ry - 8,
          t('label.quotient', '{a} / {b}: {q}', { a: scene.ids[0], b: scene.ids[1], q: scene.quotient.toFixed(2) }),
          { size: smPx, fill: colors.text, anchor: 'end', mono: true },
        );
      }

      // a — 벌점 없이 맞춘 자리
      el(svg, 'rect', {
        x: l.ox,
        y: ay,
        width: ax - l.ox,
        height: l.oy - ay,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '2 3',
      });
      label(svg, ax + 5, ay - 4, t('label.fit', 'a'), { size: smPx, fill: colors.textMuted, mono: true });
      // a 의 눈금 — 지금 무게 눈금과 겹칠 만큼 가까우면 지금 것만 둔다
      if (Math.abs(ax - cx) >= TICK_GAP) {
        label(svg, ax, l.oy + 16, scene.fit[0].toFixed(2), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
          mono: true,
        });
      }
      if (Math.abs(ay - cy) >= TICK_GAP / 2) {
        label(svg, l.ox - 6, ay + 4, scene.fit[1].toFixed(2), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
          mono: true,
        });
      }

      // 지나온 네모 — 안으로 겹쳐 든다
      for (const past of scene.trail) {
        const [qx, qy] = px(l, past);
        el(svg, 'rect', {
          x: l.ox,
          y: qy,
          width: qx - l.ox,
          height: l.oy - qy,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        });
      }

      // 이번 갱신에 깎인 ㄱ 자 띠
      if (step.kind === 'update') {
        const [fx, fy] = px(l, step.from);
        el(svg, 'path', {
          d: [
            `M ${r1(l.ox)} ${r1(fy)}`,
            `L ${r1(fx)} ${r1(fy)}`,
            `L ${r1(fx)} ${r1(l.oy)}`,
            `L ${r1(cx)} ${r1(l.oy)}`,
            `L ${r1(cx)} ${r1(cy)}`,
            `L ${r1(l.ox)} ${r1(cy)}`,
            'Z',
          ].join(' '),
          fill: colors.accent,
          stroke: 'none',
        });
      }

      // 지금 네모
      el(svg, 'rect', {
        x: l.ox,
        y: cy,
        width: cx - l.ox,
        height: l.oy - cy,
        fill: colors.primary,
        'fill-opacity': 0.12,
        stroke: colors.primary,
        'stroke-width': 1.5,
      });

      // 지나온 모서리 · 지금 모서리 · 원점
      for (const past of scene.trail) {
        const [qx, qy] = px(l, past);
        el(svg, 'circle', { cx: qx, cy: qy, r: 2.5, fill: colors.textMuted });
      }
      el(svg, 'circle', { cx, cy, r: 4.5, fill: colors.primary });
      el(svg, 'circle', { cx: l.ox, cy: l.oy, r: 3.5, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 });
      label(svg, l.ox - 6, l.oy + 16, t('label.zero', '0'), {
        size: fontSizes.xs,
        fill: colors.text,
        anchor: 'end',
        mono: true,
      });

      // 지금 무게 눈금 — 모서리를 따라간다
      label(svg, cx, l.oy + 16, corner[0].toFixed(2), {
        size: smPx,
        fill: colors.text,
        anchor: 'middle',
        mono: true,
        weight: 600,
      });
      label(svg, l.ox - 6, cy + 4, corner[1].toFixed(2), {
        size: smPx,
        fill: colors.text,
        anchor: 'end',
        mono: true,
        weight: 600,
      });

      // 읽음표 — 무게마다 지금 값 · L2 몫 · 처음 대비 남은 비율
      const colW = PAD + 170;
      const colD = PAD + 360;
      const colR = PIECE_CANVAS_W - PAD;
      const hy = l.tableTop + 14;
      label(svg, colW, hy, t('head.value', 'Weight now'), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' });
      label(svg, colD, hy, t('head.decay', 'L2 share η·λ·w'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });
      label(svg, colR, hy, t('head.ratio', 'Left of start w / a'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });
      el(svg, 'line', {
        x1: PAD,
        y1: hy + 7,
        x2: colR,
        y2: hy + 7,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const dash = t('label.none', '—');
      for (let i = 0; i < 2; i += 1) {
        const y = hy + ROW * (i + 1);
        label(svg, PAD, y, scene.ids[i === 0 ? 0 : 1], { size: fontSizes.md, fill: colors.text, mono: true });
        label(svg, colW, y, scene.w[i === 0 ? 0 : 1].toFixed(2), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'end',
          mono: true,
        });
        const decayText = step.kind === 'update' ? step.decay[i === 0 ? 0 : 1].toFixed(3) : dash;
        label(svg, colD, y, decayText, {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'end',
          mono: true,
        });
        const ratioText = scene.ratio === null ? dash : scene.ratio[i === 0 ? 0 : 1].toFixed(2);
        if (scene.ratio !== null) {
          el(svg, 'rect', {
            x: colR - 44,
            y: y - 15,
            width: 48,
            height: 20,
            rx: 3,
            fill: colors.accent,
          });
        }
        label(svg, colR, y, ratioText, {
          size: fontSizes.md,
          fill: scene.ratio === null ? colors.text : colors.stateInk,
          anchor: 'end',
          mono: true,
          weight: 600,
        });
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function slide(scene: ShrinkAllScene, from: Pair, mine: number): Promise<void> {
      const frames = Math.max(1, Math.round(MOVE_MS / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (destroyed || mine !== gen) return;
        const p = ease(f / frames);
        draw(scene, [from[0] + (scene.w[0] - from[0]) * p, from[1] + (scene.w[1] - from[1]) * p]);
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: ShrinkAllScene, _prev: ShrinkAllScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step.kind !== 'update') {
          draw(next, next.w);
          return;
        }
        // 정본은 끝 자리 — 운동은 아직 못 온 만큼(from 쪽)에서 시작한다
        draw(next, step.from);
        await slide(next, step.from, mine);
        if (destroyed || mine !== gen) return;
        draw(next, next.w);
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
