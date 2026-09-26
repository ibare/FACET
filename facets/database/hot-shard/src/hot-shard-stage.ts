/**
 * hot-shard-stage — 구간 샤드 셋을 바닥에서 쌓아 올린 기둥으로 세운다.
 *
 * 동사는 "한쪽에만 쌓인다". 새 줄은 위의 번호 계수기에서 떨어져 나와 제 구간의 기둥 위로
 * 날아가 그 꼭대기에 내려앉는다. 기둥 높이가 곧 있는 줄 수라, 처음에는 셋이 같은 높이로
 * 서 있고(고르게 나뉨) 걸음마다 한 기둥만 자란다. 점선은 처음 높이 — 나머지 둘이 그
 * 자리에 그대로 서 있다는 것을 끝까지 보인다.
 */
import {
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { HotShardScene } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN_X = 28;
const COL_GAP = 28;
const COUNTER_Y = 16;
const COUNTER_H = 34;
const STACK_TOP = 88;
const FLOOR_Y = H - 118;
const SLAB_MAX = 24;
const SLAB_INSET = 14;
const FLY_MS = 720;

type Geo = {
  colW: number;
  slabH: number;
  colX(i: number): number;
  slabY(level: number): number;
};

function geometry(scene: HotShardScene): Geo {
  const n = Math.max(1, scene.ranges.length);
  const colW = (PIECE_CANVAS_W - 2 * MARGIN_X - (n - 1) * COL_GAP) / n;
  // 한 기둥이 받을 수 있는 가장 많은 줄 = 가장 높은 처음 기둥 + 새 줄 전부
  let startMax = 0;
  for (const s of scene.stacks) startMax = Math.max(startMax, s.filter((r) => !r.fresh).length);
  const capacity = Math.max(1, startMax + scene.newRows);
  const slabH = Math.min(SLAB_MAX, (FLOOR_Y - STACK_TOP) / capacity);
  return {
    colW,
    slabH,
    colX: (i) => MARGIN_X + i * (colW + COL_GAP),
    slabY: (level) => FLOOR_Y - (level + 1) * slabH,
  };
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

export const hotShardStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; family?: string; weight?: string; anchor?: string },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size,
        'font-weight': opts.weight ?? 'normal',
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill,
      });
      node.textContent = text;
      return node;
    }

    function captionOf(scene: HotShardScene): string {
      const step = scene.step;
      if (step === null) return '';
      if (step.kind === 'start') {
        return t('caption.start', 'Existing rows split by {column} range. Rows: {n}', {
          column: scene.column,
          n: step.existing,
        });
      }
      if (step.kind === 'insert') {
        return t('caption.insert', 'New row, {column} {id} → shard {s}', {
          column: scene.column,
          id: step.id,
          s: step.shard,
        });
      }
      return t('caption.done', 'New writes on shard {s}: {count} / {total} · other shards: {others}', {
        s: step.shard,
        count: step.count,
        total: step.total,
        others: step.others,
      });
    }

    function rangeText(g: { lo: number; hi: number | null }): string {
      if (g.hi === null) return t('label.rangeOpen', '{lo} – ∞', { lo: g.lo });
      return t('label.range', '{lo} – {hi}', { lo: g.lo, hi: g.hi });
    }

    /** 장면의 화면 전체를 세운다. 새 줄의 손잡이(날아갈 것)를 돌려준다. */
    function drawStatic(scene: HotShardScene): SVGGElement | null {
      svg.textContent = '';
      const geo = geometry(scene);
      const found: { flyer: SVGGElement | null } = { flyer: null };

      // 번호 계수기 — 새 번호가 나오는 자리
      if (scene.next !== null) {
        const text = t('label.next', 'Next {column} in {table}: {n}', {
          column: scene.column,
          table: scene.table,
          n: scene.next,
        });
        const boxW = Math.min(PIECE_CANVAS_W - 2 * MARGIN_X, text.length * smPx * 0.62 + 32);
        el(svg, 'rect', {
          x: PIECE_CANVAS_W / 2 - boxW / 2,
          y: COUNTER_Y,
          width: boxW,
          height: COUNTER_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        });
        label(svg, PIECE_CANVAS_W / 2, COUNTER_Y + COUNTER_H / 2 + smPx * 0.36, text, {
          size: fontSizes.sm,
          fill: c.text,
          family: fonts.mono,
        });
      }

      // 처음 높이 — 가장 높던 처음 기둥의 꼭대기
      let startMax = 0;
      for (const s of scene.stacks) startMax = Math.max(startMax, s.filter((r) => !r.fresh).length);

      scene.ranges.forEach((g, i) => {
        const x0 = geo.colX(i);
        const stack = scene.stacks[i];
        const writes = scene.writes[i];
        if (stack === undefined || writes === undefined) throw new Error(`hot-shard-stage: 샤드 ${i} 의 자취가 없다`);
        const hot = writes > 0;

        // 기둥 틀
        el(svg, 'rect', {
          x: x0,
          y: STACK_TOP - 6,
          width: geo.colW,
          height: FLOOR_Y - STACK_TOP + 6,
          rx: 4,
          fill: 'none',
          stroke: hot ? c.itemActive : c.border,
          'stroke-width': hot ? 2 : 1,
        });

        // 쌓인 줄 — 아래에서 위로
        stack.forEach((row, level) => {
          const y = geo.slabY(level);
          const grp = el(svg, 'g', {});
          el(grp, 'rect', {
            x: x0 + SLAB_INSET,
            y: y + 1,
            width: geo.colW - 2 * SLAB_INSET,
            height: geo.slabH - 2,
            rx: 3,
            fill: row.fresh ? c.itemActive : c.bgSubtle,
            stroke: row.fresh ? c.itemActive : c.border,
          });
          label(grp, x0 + geo.colW / 2, y + geo.slabH / 2 + Math.min(smPx, geo.slabH - 4) * 0.36, String(row.id), {
            size: `${r2(Math.min(smPx, geo.slabH - 4))}px`,
            fill: row.fresh ? c.stateInk : c.text,
            family: fonts.mono,
          });
          const step = scene.step;
          if (step !== null && step.kind === 'insert' && step.shard === i && step.id === row.id) found.flyer = grp;
        });

        // 바닥
        el(svg, 'line', {
          x1: x0 - 4,
          y1: FLOOR_Y,
          x2: x0 + geo.colW + 4,
          y2: FLOOR_Y,
          stroke: c.text,
          'stroke-width': 2,
        });

        const cx = x0 + geo.colW / 2;
        label(svg, cx, FLOOR_Y + 22, t('label.shard', 'Shard {n}', { n: i }), {
          size: fontSizes.md,
          fill: c.text,
          weight: 'bold',
        });
        label(svg, cx, FLOOR_Y + 40, rangeText(g), { size: fontSizes.sm, fill: c.textMuted, family: fonts.mono });
        label(svg, cx, FLOOR_Y + 62, t('label.rows', 'Rows: {n}', { n: stack.length }), {
          size: fontSizes.sm,
          fill: c.text,
        });
        label(svg, cx, FLOOR_Y + 80, t('label.writes', 'New writes: {n}', { n: writes }), {
          size: fontSizes.sm,
          fill: hot ? c.text : c.textMuted,
          weight: hot ? 'bold' : 'normal',
        });
      });

      // 처음 높이 점선 — 기둥 셋을 가로질러
      if (startMax > 0) {
        const y = FLOOR_Y - startMax * geo.slabH;
        el(svg, 'line', {
          x1: MARGIN_X - 6,
          y1: y,
          x2: PIECE_CANVAS_W - MARGIN_X + 6,
          y2: y,
          stroke: c.textMuted,
          'stroke-dasharray': '4 4',
          'stroke-width': 1,
        });
      }

      const cap = captionOf(scene);
      if (cap !== '') label(svg, PIECE_CANVAS_W / 2, H - 12, cap, { size: fontSizes.md, fill: c.text });

      return found.flyer;
    }

    function frame(): Promise<number> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(performance.now());
        };
        waiters.add(wake);
        const id = requestAnimationFrame((now) => {
          frames.delete(id);
          waiters.delete(wake);
          resolve(now);
        });
        frames.add(id);
      });
    }

    /** 새 줄이 계수기에서 나와 기둥 위로 날아간 뒤 꼭대기에 떨어진다. */
    async function fly(scene: HotShardScene, grp: SVGGElement, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null || step.kind !== 'insert') return;
      const geo = geometry(scene);
      const stack = scene.stacks[step.shard];
      if (stack === undefined || stack.length === 0) throw new Error(`hot-shard-stage: 샤드 ${step.shard} 에 새 줄이 없다`);
      const level = stack.length - 1;
      const endX = geo.colX(step.shard) + geo.colW / 2;
      const endY = geo.slabY(level) + geo.slabH / 2;
      const startX = PIECE_CANVAS_W / 2;
      const startY = COUNTER_Y + COUNTER_H + geo.slabH / 2;
      const hoverY = STACK_TOP - geo.slabH;
      const SPLIT = 0.45;

      const place = (u: number): void => {
        let x: number;
        let y: number;
        if (u < SPLIT) {
          const a = u / SPLIT;
          const e = a * a * (3 - 2 * a);
          x = startX + (endX - startX) * e;
          y = startY + (hoverY - startY) * e;
        } else {
          const b = (u - SPLIT) / (1 - SPLIT);
          x = endX;
          y = hoverY + (endY - hoverY) * b * b;
        }
        grp.setAttribute('transform', `translate(${r2(x - endX)} ${r2(y - endY)})`);
      };

      place(0);
      const t0 = await frame();
      if (mine !== gen || destroyed) return;
      for (;;) {
        if (mine !== gen || destroyed) return;
        const now = await frame();
        if (mine !== gen || destroyed) return;
        const u = Math.min(1, (now - t0) / FLY_MS);
        place(u);
        if (u >= 1) return;
      }
    }

    const renderer: SceneRenderer<HotShardScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const flyer = drawStatic(next);
        const moved = prev === null || prev.next !== next.next;
        if (!opts.animate || flyer === null || !moved) return;
        await fly(next, flyer, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return renderer as unknown as ViewInstance;
  },
};
