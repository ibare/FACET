/**
 * 외부 단편화 stage.
 *
 * 한 줄 메모리 위로 덩어리가 들어와 앉고, 몇이 떠나며 떨어진 자리에 틈이 남는다.
 * 마지막 덩어리는 틈마다 내려앉아 보다가 넘쳐서 물러난다. 아래 두 막대는 같은 축척으로
 * 빈 몫의 합(흩어진 틈을 이어 붙인 길이)과 가장 큰 틈을 나란히 잰다.
 *
 * 자리는 모두 캔버스 폭에서 역산한다. 세로는 고정.
 */
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { FragScene, SceneHole } from './scene.js';

const H = 296;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 세로 자리
const CAPTION_Y = 24;
const LANE_Y = 42;
const BLOCK_H = 40;
const STRIP_Y = 110;
const TICK_Y = STRIP_Y + BLOCK_H + 16;
const SUM_LABEL_Y = 196;
const SUM_BAR_Y = 204;
const LARGEST_LABEL_Y = 248;
const LARGEST_BAR_Y = 256;
const BAR_H = 20;
const MARGIN = 20;

// 운동 (ms)
const SLIDE_MS = 300;
const DROP_MS = 250;
const LIFT_MS = 400;
const TRY_SLIDE_MS = 220;
const TRY_DIP_MS = 260;
const DIP_DEPTH = 22;
const FRAME_MS = 16;

type Mover = { id: string; x: number; y: number; w: number; danger: boolean };

type Overlay = {
  /** 정적 그림에서 빼 둘 덩어리 (움직이는 사본이 대신 선다) */
  hideId?: string;
  mover?: Mover;
  sum?: number;
  largest?: number;
  /** 대어 본 틈 가운데 몇 개까지 드러낼지 */
  triedShown?: number;
  /** 지금 대어 보는 틈 */
  flash?: SceneHole | null;
  /** 못 들어간 덩어리의 길이 표시를 막대 위에 둘지 */
  rejectOnBars?: boolean;
};

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const externalFragmentationStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const stripW = W - MARGIN * 2;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function kib(scene: FragScene): number {
      return scene.total > 0 ? stripW / scene.total : 0;
    }

    function xAt(scene: FragScene, addr: number): number {
      return r1(MARGIN + addr * kib(scene));
    }

    function colorOf(scene: FragScene, id: string): string {
      const palette = categorical(Math.max(1, scene.ids.length));
      const i = scene.ids.indexOf(id);
      return palette[i < 0 ? 0 : i % palette.length] ?? colors.primary;
    }

    function symbol(id: string): string {
      return id.toUpperCase();
    }

    /** 못 들어간 덩어리가 틈에 대어 볼 때의 왼쪽 끝 (메모리 밖으로 넘지 않게 당긴다) */
    function tryStart(scene: FragScene, hole: SceneHole, size: number): number {
      return Math.max(0, Math.min(hole.start, scene.total - size));
    }

    function captionOf(scene: FragScene): string {
      const s = scene.step;
      if (s.kind === 'start') return t('caption.start', 'Memory: {n} KiB, all free.', { n: scene.total });
      if (s.kind === 'load') {
        return t('caption.load', '{id} in: {size} KiB at {start}–{end}.', {
          id: symbol(s.id),
          size: s.size,
          start: s.start,
          end: s.start + s.size,
        });
      }
      if (s.kind === 'free') {
        return t('caption.free', '{id} out: {start}–{end} is free again.', {
          id: symbol(s.id),
          start: s.start,
          end: s.start + s.size,
        });
      }
      return t('caption.reject', '{id} wants {size} KiB: no gap is large enough.', {
        id: symbol(s.id),
        size: s.size,
      });
    }

    function drawBlock(parent: Element, scene: FragScene, id: string, x: number, y: number, w: number, danger: boolean): void {
      el(parent, 'rect', {
        x: r1(x),
        y: r1(y),
        width: r1(w),
        height: BLOCK_H,
        rx: 3,
        fill: colorOf(scene, id),
        stroke: danger ? colors.danger : colors.bg,
        'stroke-width': danger ? 2.5 : 1.5,
      });
      el(
        parent,
        'text',
        {
          x: r1(x + w / 2),
          y: r1(y + BLOCK_H / 2 + 5),
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.stateInk,
        },
        symbol(id),
      );
    }

    function drawFrame(scene: FragScene, o: Overlay): void {
      svg.textContent = '';
      if (scene.total <= 0) return;
      const u = kib(scene);

      // 캡션 — 지금 일어나는 일
      el(
        svg,
        'text',
        {
          x: MARGIN,
          y: CAPTION_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        captionOf(scene),
      );

      // 메모리 띠 — 바탕은 빈 자리 색, 덩어리가 그 위에 앉는다
      el(
        svg,
        'text',
        {
          x: MARGIN,
          y: STRIP_Y - 6,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        t('label.memory', 'Memory (KiB)'),
      );
      el(svg, 'rect', {
        x: MARGIN,
        y: STRIP_Y,
        width: r1(stripW),
        height: BLOCK_H,
        fill: colors.accent,
        'fill-opacity': 0.3,
        stroke: colors.border,
        'stroke-width': 1,
      });

      // 틈의 길이
      for (const h of scene.holes) {
        el(
          svg,
          'text',
          {
            x: r1(xAt(scene, h.start + h.len / 2)),
            y: STRIP_Y + BLOCK_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          String(h.len),
        );
      }

      for (const b of scene.blocks) {
        if (b.id === o.hideId) continue;
        drawBlock(svg, scene, b.id, xAt(scene, b.start), STRIP_Y, b.size * u, false);
      }

      // 대어 본 틈 — 넘친 자리로 남는다
      const rej = scene.rejected;
      if (rej !== null) {
        const shown = o.triedShown ?? rej.tried.length;
        rej.tried.slice(0, shown).forEach((h) => {
          el(svg, 'rect', {
            x: xAt(scene, h.start),
            y: STRIP_Y,
            width: r1(h.len * u),
            height: BLOCK_H,
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': 2.5,
          });
        });
      }
      if (o.flash) {
        el(svg, 'rect', {
          x: xAt(scene, o.flash.start),
          y: STRIP_Y,
          width: r1(o.flash.len * u),
          height: BLOCK_H,
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 2.5,
        });
      }

      // 주소 눈금 — 덩어리와 틈의 경계
      const marks = new Set<number>([0, scene.total]);
      for (const b of scene.blocks) {
        if (b.id === o.hideId) continue;
        marks.add(b.start);
        marks.add(b.start + b.size);
      }
      for (const m of [...marks].sort((a, b) => a - b)) {
        el(svg, 'line', {
          x1: xAt(scene, m),
          x2: xAt(scene, m),
          y1: STRIP_Y + BLOCK_H,
          y2: STRIP_Y + BLOCK_H + 4,
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
        el(
          svg,
          'text',
          {
            x: xAt(scene, m),
            y: TICK_Y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          String(m),
        );
      }

      // 두 막대 — 같은 축척
      const sum = o.sum ?? scene.freeSum;
      const largest = o.largest ?? scene.largest;
      el(
        svg,
        'text',
        { x: MARGIN, y: SUM_LABEL_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
        t('label.freeSum', 'Free in total: {n} KiB', { n: scene.freeSum }),
      );
      el(svg, 'rect', {
        x: MARGIN,
        y: SUM_BAR_Y,
        width: r1(stripW),
        height: BAR_H,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
      // 흩어진 틈을 차례로 이어 붙인다 — 조각마다 이음매가 보인다
      let cursor = 0;
      for (const h of scene.holes) {
        if (cursor >= sum) break;
        const len = Math.min(h.len, sum - cursor);
        el(svg, 'rect', {
          x: xAt(scene, cursor),
          y: SUM_BAR_Y,
          width: r1(len * u),
          height: BAR_H,
          fill: colors.accent,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
        cursor += len;
      }
      if (cursor < sum) {
        // 막대가 줄어드는 중에는 앞 걸음의 몫이 아직 남아 있다
        el(svg, 'rect', {
          x: xAt(scene, cursor),
          y: SUM_BAR_Y,
          width: r1((sum - cursor) * u),
          height: BAR_H,
          fill: colors.accent,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
      }

      el(
        svg,
        'text',
        { x: MARGIN, y: LARGEST_LABEL_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
        t('label.largest', 'Largest gap: {n} KiB', { n: scene.largest }),
      );
      el(svg, 'rect', {
        x: MARGIN,
        y: LARGEST_BAR_Y,
        width: r1(stripW),
        height: BAR_H,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
      if (largest > 0) {
        el(svg, 'rect', {
          x: MARGIN,
          y: LARGEST_BAR_Y,
          width: r1(largest * u),
          height: BAR_H,
          fill: colors.accent,
        });
      }

      // 못 들어간 덩어리의 길이를 두 막대에 대어 본다
      if (rej !== null && (o.rejectOnBars ?? true)) {
        for (const [y, filled] of [
          [SUM_BAR_Y, sum],
          [LARGEST_BAR_Y, largest],
        ] as const) {
          const w = r1(rej.size * u);
          // 기호는 점선과 막대 가운데 더 긴 쪽 끝 뒤에 — 막대 위에 겹치지 않게
          const labelX = r1(MARGIN + Math.max(rej.size, filled) * u + 6);
          el(svg, 'rect', {
            x: MARGIN,
            y: y - 3,
            width: w,
            height: BAR_H + 6,
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': 2,
            'stroke-dasharray': '5 3',
          });
          el(
            svg,
            'text',
            {
              x: labelX,
              y: y + BAR_H / 2 + 5,
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              'font-weight': 700,
              fill: colors.danger,
            },
            symbol(rej.id),
          );
        }
      }

      // 못 들어간 덩어리 — 마지막으로 대어 본 자리 위에 머문다
      if (o.mover) {
        drawBlock(svg, scene, o.mover.id, o.mover.x, o.mover.y, o.mover.w, o.mover.danger);
      } else if (rej !== null) {
        const last = rej.tried[rej.tried.length - 1];
        const at = last === undefined ? 0 : tryStart(scene, last, rej.size);
        drawBlock(svg, scene, rej.id, xAt(scene, at), LANE_Y, rej.size * u, true);
      }
    }

    function drawStatic(scene: FragScene): void {
      drawFrame(scene, {});
    }

    /** 한 시계 — p 는 0..1. 끝나거나 거두어지면 풀린다 */
    function run(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
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
          const p = Math.min(1, elapsed / ms);
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

    async function animate(next: FragScene, mine: number): Promise<void> {
      const s = next.step;
      const u = kib(next);
      if (s.kind === 'load') {
        const slide = s.start > 0 ? SLIDE_MS : 0;
        const total = slide + DROP_MS;
        await run(total, mine, (p) => {
          const ms = p * total;
          const ps = slide > 0 ? Math.min(1, ms / slide) : 1;
          const pd = Math.max(0, Math.min(1, (ms - slide) / DROP_MS));
          const x = lerp(xAt(next, 0), xAt(next, s.start), ease(ps));
          const y = lerp(LANE_Y, STRIP_Y, ease(pd));
          drawFrame(next, {
            hideId: s.id,
            mover: { id: s.id, x, y, w: s.size * u, danger: false },
            sum: lerp(s.wasSum, next.freeSum, ease(p)),
            largest: lerp(s.wasLargest, next.largest, ease(p)),
          });
        });
        return;
      }
      if (s.kind === 'free') {
        await run(LIFT_MS, mine, (p) => {
          const y = lerp(STRIP_Y, -BLOCK_H - 4, ease(p));
          drawFrame(next, {
            mover: { id: s.id, x: xAt(next, s.start), y, w: s.size * u, danger: false },
            sum: lerp(s.wasSum, next.freeSum, ease(p)),
            largest: lerp(s.wasLargest, next.largest, ease(p)),
          });
        });
        return;
      }
      if (s.kind === 'reject') {
        const rej = next.rejected;
        if (rej === null) return;
        const tries = rej.tried;
        const per = TRY_SLIDE_MS + TRY_DIP_MS;
        const total = Math.max(per, tries.length * per);
        await run(total, mine, (p) => {
          const ms = p * total;
          const i = Math.min(tries.length - 1, Math.floor(ms / per));
          const hole = tries[i];
          if (hole === undefined) {
            drawFrame(next, { rejectOnBars: p >= 1 });
            return;
          }
          const local = ms - i * per;
          const fromAddr = i === 0 ? 0 : tryStart(next, tries[i - 1] ?? hole, rej.size);
          const toAddr = tryStart(next, hole, rej.size);
          const ps = Math.min(1, local / TRY_SLIDE_MS);
          const pd = Math.max(0, Math.min(1, (local - TRY_SLIDE_MS) / TRY_DIP_MS));
          const dip = pd === 0 || p >= 1 ? 0 : Math.sin(Math.PI * pd) * DIP_DEPTH;
          const x = lerp(xAt(next, fromAddr), xAt(next, toAddr), ease(ps));
          const reached = ps >= 1;
          drawFrame(next, {
            triedShown: reached ? i + 1 : i,
            flash: reached && p < 1 ? hole : null,
            rejectOnBars: p >= 1,
            mover: { id: rej.id, x, y: LANE_Y + dip, w: rej.size * u, danger: reached },
          });
        });
      }
    }

    function clearAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    return {
      async render(next: FragScene, _prev: FragScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        clearAll();
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        await animate(next, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        clearAll();
        svg.textContent = '';
      },
    };
  },
};
