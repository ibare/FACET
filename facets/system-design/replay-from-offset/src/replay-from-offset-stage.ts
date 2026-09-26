/**
 * 오프셋 재생의 무대.
 *
 * 동사는 "되감긴다". 위에는 한 번도 바뀌지 않는 로그 칸 줄, 그 아래 그룹의 읽는 자리(오프셋)가
 * 칸 사이의 경계에 서 있다. 읽을 때 자리는 앞으로 미끄러지고 읽힌 기록의 **사본**이 칸에서
 * 떨어져 그룹 상자의 그 기록 세로줄에 쌓인다 — 세로줄의 사본 수가 곧 읽힌 횟수다.
 * 되감기 걸음에서 자리는 로그 위로 호를 그리며 뒤로 건너가고, 그 뒤의 읽기는 같은 세로줄에
 * 같은 값의 사본을 한 층 더 쌓는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { ReplayScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 312;

/** 가로 */
const GUTTER = 104;
const RIGHT_PAD = 16;
const CELL_MAX = 64;
const CELL_GAP = 6;
/** 세로 */
const ARC_PEAK_Y = 10;
const CELL_TOP = 46;
const CELL_H = 40;
const CURSOR_TOP = 40;
const CURSOR_TIP = 98;
const CURSOR_BASE = 110;
const CURSOR_LABEL_Y = 126;
const BOX_TOP = 140;
const BOX_BOTTOM = 258;
const COUNT_Y = 280;
const CAPTION_Y = 304;
/** 운동 */
const READ_MS = 520;
const COPY_MS = 400;
const COPY_STAGGER = 120;
const REWIND_MS = 600;
const FRAME_MS = 16;

const px = (s: string): number => parseFloat(s);
const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
};
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const clamp01 = (p: number): number => Math.max(0, Math.min(1, p));

type Handles = {
  cursor: SVGGElement | null;
  /** 이번 걸음에 떨어진 사본: 오프셋 → 요소와 칸까지의 세로 거리 */
  copies: Array<{ el: SVGGElement; rise: number }>;
};

export const replayFromOffsetStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let handles: Handles = { cursor: null, copies: [] };

    function groupName(id: string): string {
      switch (id) {
        case 'stats':
          return t('label.stats', 'Stats');
        default:
          throw new Error(`replay-from-offset-stage: 표시 이름이 없는 그룹 ${id}`);
      }
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; anchor?: string; weight?: number; mono?: boolean },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    /** 폭에서 역산한 칸 자리 */
    function geometry(n: number): { cellW: number; x0: number; bx: (b: number) => number } {
      const avail = W - GUTTER - RIGHT_PAD;
      const cellW = Math.min(CELL_MAX, avail / n);
      const x0 = GUTTER + (avail - cellW * n) / 2;
      return { cellW, x0, bx: (b: number) => x0 + b * cellW };
    }

    function drawStatic(scene: ReplayScene): Handles {
      svg.textContent = '';
      const out: Handles = { cursor: null, copies: [] };
      const n = scene.values.length;
      const { cellW, x0, bx } = geometry(n);
      const g = scene.gauge;
      const step = scene.step;
      const sm = fontSizes.sm;
      const xs = fontSizes.xs;
      const md = fontSizes.md;

      // 로그 — 칸 줄. 걸음 내내 같다.
      label(svg, 12, CELL_TOP + CELL_H / 2 + px(md) / 3, t('label.log', 'Log'), {
        size: md,
        fill: colors.text,
        weight: 600,
      });
      scene.values.forEach((v, o) => {
        const x = bx(o) + CELL_GAP / 2;
        const w = cellW - CELL_GAP;
        el('rect', { x: r1(x), y: CELL_TOP, width: r1(w), height: CELL_H, rx: 4, fill: colors.bgSubtle, stroke: colors.border }, svg);
        label(svg, x + 4, CELL_TOP + px(xs) + 2, String(o), { size: xs, fill: colors.textMuted, mono: true });
        label(svg, x + w / 2, CELL_TOP + CELL_H / 2 + px(md) / 2 + 3, String(v), {
          size: md,
          fill: colors.text,
          anchor: 'middle',
          weight: 600,
          mono: true,
        });
      });

      if (!g) return out;

      // 끝 — 로그 길이 자리의 눈금
      const xe = bx(g.end);
      el('line', { x1: r1(xe), y1: CELL_TOP - 6, x2: r1(xe), y2: CELL_TOP + CELL_H + 6, stroke: colors.textMuted, 'stroke-width': 1.5 }, svg);
      label(svg, xe + 4, CELL_TOP - 8, t('label.end', 'End {n}', { n: g.end }), { size: xs, fill: colors.textMuted });

      // 이번 읽기의 범위
      if (step.kind === 'read') {
        el(
          'rect',
          {
            x: r1(bx(step.from) + 1),
            y: CELL_TOP - 3,
            width: r1((step.next - step.from) * cellW - 2),
            height: CELL_H + 6,
            rx: 6,
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 2,
          },
          svg,
        );
      }

      // 되감기의 자취 — 옛 자리에서 새 자리로 넘어간 호
      if (step.kind === 'rewind') {
        const a = bx(step.from);
        const b = bx(step.to);
        const mid = (a + b) / 2;
        el(
          'path',
          {
            d: `M ${r1(a)} ${CURSOR_TOP} Q ${r1(mid)} ${ARC_PEAK_Y * 2 - CURSOR_TOP} ${r1(b)} ${CURSOR_TOP}`,
            fill: 'none',
            stroke: colors.itemComparing,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 4',
          },
          svg,
        );
        el('circle', { cx: r1(a), cy: CURSOR_TOP, r: 3, fill: 'none', stroke: colors.itemComparing, 'stroke-width': 1.5 }, svg);
      }

      // 그룹 상자 — 기록마다 세로줄, 읽힌 만큼 사본이 쌓인다
      label(svg, 12, BOX_TOP + 20, t('label.group', 'Group'), { size: xs, fill: colors.textMuted });
      label(svg, 12, BOX_TOP + 20 + px(md) + 6, groupName(scene.group), { size: md, fill: colors.text, weight: 600 });
      el(
        'rect',
        {
          x: r1(x0 - 4),
          y: BOX_TOP,
          width: r1(cellW * n + 8),
          height: BOX_BOTTOM - BOX_TOP,
          rx: 6,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '3 3',
        },
        svg,
      );
      const rows = Math.max(1, g.passes);
      const rowH = Math.min(CELL_H + 6, (BOX_BOTTOM - BOX_TOP - 8) / rows);
      const slotH = rowH - 6;
      const fresh = step.kind === 'read' ? step.offsets : [];
      g.times.forEach((count, o) => {
        if (count > rows) throw new Error(`replay-from-offset-stage: 오프셋 ${o} 의 읽힌 횟수 ${count} 가 줄 수 ${rows} 를 넘는다`);
        const v = scene.values[o];
        if (v === undefined) throw new Error(`replay-from-offset-stage: 오프셋 ${o} 의 기록이 없다`);
        for (let k = 0; k < count; k += 1) {
          const isNew = k === count - 1 && fresh.includes(o);
          const x = bx(o) + CELL_GAP / 2 + 3;
          const w = cellW - CELL_GAP - 6;
          const y = BOX_TOP + 6 + k * rowH;
          const cg = el('g', {}, svg);
          el(
            'rect',
            {
              x: r1(x),
              y: r1(y),
              width: r1(w),
              height: r1(slotH),
              rx: 4,
              fill: isNew ? colors.accent : colors.bg,
              stroke: isNew ? colors.accent : colors.border,
            },
            cg,
          );
          label(cg, x + w / 2, y + slotH / 2 + px(sm) / 2 - 1, String(v), {
            size: sm,
            fill: isNew ? colors.stateInk : colors.text,
            anchor: 'middle',
            weight: 600,
            mono: true,
          });
          if (isNew) out.copies.push({ el: cg, rise: CELL_TOP - y });
        }
      });

      // 읽힌 횟수 — 세로줄의 사본 수를 수로
      label(svg, 12, COUNT_Y, t('label.times', 'Times read'), { size: xs, fill: colors.textMuted });
      g.times.forEach((count, o) => {
        const changed = fresh.includes(o);
        label(svg, bx(o) + cellW / 2, COUNT_Y, String(count), {
          size: sm,
          fill: changed ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: changed ? 700 : 400,
          mono: true,
        });
      });

      // 오프셋 — 다음에 읽을 자리. 칸 사이의 경계에 선다
      const xc = bx(g.offset);
      const cur = el('g', {}, svg);
      el('line', { x1: r1(xc), y1: CURSOR_TOP, x2: r1(xc), y2: CURSOR_TIP, stroke: colors.itemComparing, 'stroke-width': 2.5 }, cur);
      el(
        'polygon',
        {
          points: `${r1(xc)},${CURSOR_TIP} ${r1(xc - 7)},${CURSOR_BASE} ${r1(xc + 7)},${CURSOR_BASE}`,
          fill: colors.itemComparing,
        },
        cur,
      );
      label(cur, xc, CURSOR_LABEL_Y, t('label.offset', 'Offset {n}', { n: g.offset }), {
        size: sm,
        fill: colors.text,
        anchor: 'middle',
        weight: 600,
      });
      out.cursor = cur;

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Group {group} starts at offset {offset}. Log end: {end}.', {
          group: groupName(scene.group),
          offset: g.offset,
          end: g.end,
        });
      } else if (step.kind === 'read') {
        caption = t('caption.read', 'Read offsets {from}–{last}: {values}. Next offset: {next}.', {
          from: step.from,
          last: step.next - 1,
          values: step.values.join(' '),
          next: step.next,
        });
      } else {
        caption = t('caption.rewind', 'Rewind: offset {from} → {to}. Log records: {records}.', {
          from: step.from,
          to: step.to,
          records: step.records,
        });
      }
      label(svg, W / 2, CAPTION_Y, caption, { size: md, fill: colors.text, anchor: 'middle' });
      return out;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
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
          const p = clamp01((performance.now() - start) / ms);
          frame(p);
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

    async function render(next: ReplayScene, _prev: ReplayScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      handles = drawStatic(next);
      if (!opts.animate) return;
      const step = next.step;
      const g = next.gauge;
      if (step.kind === 'start' || !g) return;
      const cursor = handles.cursor;
      if (!cursor) throw new Error('replay-from-offset-stage: 오프셋 표식이 없다');
      const { cellW } = geometry(next.values.length);

      if (step.kind === 'read') {
        const back = -(step.next - step.from) * cellW;
        const copies = handles.copies;
        if (copies.length !== step.offsets.length) {
          throw new Error(`replay-from-offset-stage: 사본 ${copies.length} 이 읽은 개수 ${step.offsets.length} 와 다르다`);
        }
        await tween(READ_MS, mine, (p) => {
          cursor.setAttribute('transform', `translate(${r1(back * (1 - ease(p)))} 0)`);
          copies.forEach((c, k) => {
            const q = ease(clamp01((p * READ_MS - k * COPY_STAGGER) / COPY_MS));
            c.el.setAttribute('transform', `translate(0 ${r1(c.rise * (1 - q))})`);
          });
        });
      } else {
        const dx = (step.from - step.to) * cellW;
        const lift = CURSOR_TOP - ARC_PEAK_Y - 8;
        await tween(REWIND_MS, mine, (p) => {
          const e = ease(p);
          cursor.setAttribute('transform', `translate(${r1(dx * (1 - e))} ${r1(-lift * Math.sin(Math.PI * e))})`);
        });
      }
      if (destroyed || mine !== gen) return;
      handles = drawStatic(next);
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
