/**
 * consumer-offset 무대 — 한 줄 로그 위아래로 두 그룹이 각자의 오프셋을 들고 선다.
 *
 * 로그는 가운데 한 줄. 첫 그룹은 위, 둘째 그룹은 아래에서 로그를 가리킨다. 표식은
 * 칸과 칸 사이(= 다음에 읽을 자리)에 서고, 읽은 칸에는 그 그룹 쪽 가장자리에 띠가
 * 남는다 — 기록은 로그에 그대로 있고 "누가 어디까지 읽었나" 만 쌓인다.
 *
 * 운동
 * - 읽기: 그 그룹의 표식만 칸을 건너 미끄러지고, 읽힌 값의 사본이 그 그룹 쪽으로
 *   빠져나간다. 원본 칸은 제자리
 * - 붙이기: 새 칸이 오른쪽에서 밀려 들어와 끝을 한 칸 밀고, 두 밀림 괄호가 함께 늘어난다
 */

import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ConsumerOffsetScene } from './scene.js';

const H = 306;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 왼쪽 이름 칸과 오른쪽 "끝" 글자 자리를 뺀 것이 로그 폭 */
const LOG_X0 = 104;
const LOG_X1 = W - 58;
const CELL_MAX = 80;
/** 로그 한가운데 · 칸 반높이 */
const MID = 152;
const HALF = 24;
const STRIP = 6;

const READ_MS = 560;
const APPEND_MS = 520;

type Frame = {
  /** 그룹 차례의 표식 자리 (칸 단위, 소수 가능) */
  offsets: number[];
  /** 로그 끝 자리 (칸 단위) */
  end: number;
  /** 밀려 들어오는 칸 — 제자리까지 남은 거리 (칸 단위) */
  incoming: { index: number; shift: number } | null;
  /** 빠져나가는 사본 */
  lift: { gi: number; from: number; values: number[]; p: number } | null;
};

function r(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const consumerOffsetStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

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

    function groupName(id: string): string {
      switch (id) {
        case 'billing':
          return t('label.billing', 'Billing');
        case 'audit':
          return t('label.audit', 'Audit');
        default:
          throw new Error(`consumer-offset stage: 표시 이름이 없는 그룹 ${id}`);
      }
    }

    function at<T>(xs: readonly T[], i: number, path: string): T {
      const v = xs[i];
      if (v === undefined) throw new Error(`consumer-offset stage: ${path}[${i}] 가 없다`);
      return v;
    }

    function caption(scene: ConsumerOffsetScene): string | null {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return null;
        case 'init':
          return t('caption.start', 'Two groups read one log. End: {end}.', {
            end: scene.records.length,
          });
        case 'read': {
          if (scene.offsets === null) throw new Error('consumer-offset stage: 읽기 장면에 오프셋이 없다');
          const gi = scene.groups.findIndex((g) => g.id === step.group);
          const oi = gi === 0 ? 1 : 0;
          const vars = {
            group: groupName(step.group),
            from: step.from,
            last: step.from + step.count - 1,
            offset: at(scene.offsets, gi, 'offsets'),
            other: groupName(at(scene.groups, oi, 'groups').id),
            otherOffset: at(scene.offsets, oi, 'offsets'),
          };
          return step.count === 1
            ? t('caption.readOne', 'Read by {group}: offset {from}. Its offset → {offset}; {other} stays at {otherOffset}.', vars)
            : t('caption.read', 'Read by {group}: offsets {from}–{last}. Its offset → {offset}; {other} stays at {otherOffset}.', vars);
        }
        case 'append': {
          if (scene.offsets === null || scene.lags === null) {
            throw new Error('consumer-offset stage: 붙이기 장면에 오프셋 · 밀림이 없다');
          }
          return t('caption.append', 'Record {value} at offset {offset}, end → {end}. Offsets {a} {ao} · {b} {bo}; lag {al} · {bl}.', {
            value: step.value,
            offset: step.offset,
            end: scene.records.length,
            a: groupName(at(scene.groups, 0, 'groups').id),
            ao: at(scene.offsets, 0, 'offsets'),
            al: at(scene.lags, 0, 'lags'),
            b: groupName(at(scene.groups, 1, 'groups').id),
            bo: at(scene.offsets, 1, 'offsets'),
            bl: at(scene.lags, 1, 'lags'),
          });
        }
      }
    }

    function staticFrame(scene: ConsumerOffsetScene): Frame {
      return {
        offsets: scene.offsets === null ? [] : [...scene.offsets],
        end: scene.records.length,
        incoming: null,
        lift: null,
      };
    }

    function draw(scene: ConsumerOffsetScene, f: Frame): void {
      svg.textContent = '';
      const cellW = Math.min(CELL_MAX, (LOG_X1 - LOG_X0) / scene.slots);
      const xAt = (slot: number): number => r(LOG_X0 + slot * cellW);
      const hues = categorical(scene.groups.length, 'vivid');
      const top = MID - HALF;
      const bottom = MID + HALF;

      const cap = caption(scene);
      if (cap !== null) {
        el(svg, 'text', {
          x: W / 2,
          y: 20,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        }, cap);
      }

      el(svg, 'text', {
        x: 14,
        y: MID,
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      }, t('label.log', 'Log'));

      // 기록 칸 — 읽어도 그대로 남는다
      for (const [i, value] of scene.records.entries()) {
        const shift = f.incoming !== null && f.incoming.index === i ? f.incoming.shift : 0;
        const x = r(xAt(i) + shift * cellW);
        const g = el(svg, 'g', { transform: `translate(${x} 0)` });
        el(g, 'rect', {
          x: 1,
          y: top,
          width: r(cellW - 2),
          height: HALF * 2,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
        el(g, 'text', {
          x: r(cellW / 2),
          y: top + 15,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, String(i));
        el(g, 'text', {
          x: r(cellW / 2),
          y: MID + 8,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: colors.text,
        }, String(value));
      }

      // 끝 — 다음 기록이 붙을 자리
      const xEnd = xAt(f.end);
      el(svg, 'line', {
        x1: xEnd,
        y1: top - 10,
        x2: xEnd,
        y2: bottom + 10,
        stroke: colors.text,
        'stroke-width': 2,
      });
      el(svg, 'text', {
        x: r(xEnd + 6),
        y: MID,
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      }, t('label.end', 'End {n}', { n: scene.records.length }));

      if (scene.offsets === null || scene.lags === null || scene.gap === null) return;

      for (const [gi, group] of scene.groups.entries()) {
        const side = gi === 0 ? -1 : 1;
        const y = (d: number): number => MID + side * d;
        const hue = at(hues, gi, 'categorical');
        const off = at(f.offsets, gi, 'frame.offsets');
        const xo = xAt(off);

        // 읽은 칸의 띠 — 그 그룹 쪽 가장자리
        if (off > 0) {
          el(svg, 'rect', {
            x: r(LOG_X0 + 1),
            y: side < 0 ? top : bottom - STRIP,
            width: r(Math.max(0, xo - LOG_X0 - 2)),
            height: STRIP,
            fill: hue,
          });
        }

        // 이름과 한 번에 읽는 개수
        el(svg, 'circle', { cx: 18, cy: y(60), r: 5, fill: hue });
        el(svg, 'text', {
          x: 28,
          y: y(60),
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        }, groupName(group.id));
        el(svg, 'text', {
          x: 28,
          y: r(y(60) + 17),
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, t('label.maxPoll', 'Per read: {n}', { n: group.maxPoll }));

        // 오프셋 표식 — 칸 사이에 선다
        el(svg, 'line', {
          x1: xo,
          y1: y(HALF + 2),
          x2: xo,
          y2: y(50),
          stroke: hue,
          'stroke-width': 2,
        });
        el(svg, 'path', {
          d: `M ${xo} ${y(HALF + 2)} L ${r(xo - 7)} ${y(HALF + 14)} L ${r(xo + 7)} ${y(HALF + 14)} Z`,
          fill: hue,
        });
        el(svg, 'text', {
          x: xo,
          y: y(60),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.text,
        }, t('label.offset', 'Offset {n}', { n: at(scene.offsets, gi, 'offsets') }));

        // 밀림 괄호 — 오프셋에서 끝까지
        const lag = at(scene.lags, gi, 'lags');
        if (xEnd - xo > 1) {
          el(svg, 'path', {
            d: `M ${xo} ${y(82)} L ${xo} ${y(88)} L ${xEnd} ${y(88)} L ${xEnd} ${y(82)}`,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
          });
        }
        el(svg, 'text', {
          x: r((xo + xEnd) / 2),
          y: y(100),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }, t('label.lag', 'Lag {n}', { n: lag }));
      }

      // 두 오프셋의 벌어짐
      const xa = xAt(Math.min(...f.offsets));
      const xb = xAt(Math.max(...f.offsets));
      const gy = 278;
      if (xb - xa > 1) {
        el(svg, 'path', {
          d: `M ${xa} ${gy - 6} L ${xa} ${gy} L ${xb} ${gy} L ${xb} ${gy - 6}`,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
        });
      }
      el(svg, 'text', {
        x: r((xa + xb) / 2),
        y: gy + 14,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      }, t('label.gap', 'Apart: {n}', { n: scene.gap }));

      // 빠져나가는 사본 — 원본 칸은 그대로다
      if (f.lift !== null) {
        const { gi, from, values, p } = f.lift;
        const side = gi === 0 ? -1 : 1;
        const hue = at(hues, gi, 'categorical');
        const chipW = Math.min(cellW - 10, smPx * 4);
        for (const [k, v] of values.entries()) {
          const cx = r(xAt(from + k) + cellW / 2);
          const cy = r(MID + side * (8 + p * 64));
          const chip = el(svg, 'g', {
            transform: `translate(${cx} ${cy})`,
            opacity: r(1 - p * p),
          });
          el(chip, 'rect', {
            x: r(-chipW / 2),
            y: -11,
            width: r(chipW),
            height: 22,
            rx: 4,
            fill: colors.bg,
            stroke: hue,
            'stroke-width': 2,
          });
          el(chip, 'text', {
            x: 0,
            y: 0,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          }, String(v));
        }
      }
    }

    function drawStatic(scene: ConsumerOffsetScene): void {
      draw(scene, staticFrame(scene));
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: ConsumerOffsetScene,
      _prev: ConsumerOffsetScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || step.kind === 'start' || step.kind === 'init') {
        drawStatic(next);
        return;
      }
      const base = staticFrame(next);
      if (step.kind === 'read') {
        const gi = next.groups.findIndex((g) => g.id === step.group);
        if (gi < 0) throw new Error(`consumer-offset stage: 없는 그룹 ${step.group}`);
        await tween(READ_MS, mine, (p) => {
          const offsets = [...base.offsets];
          offsets[gi] = step.from + step.count * p;
          draw(next, { ...base, offsets, lift: { gi, from: step.from, values: step.values, p } });
        });
      } else {
        await tween(APPEND_MS, mine, (p) => {
          draw(next, {
            ...base,
            end: step.offset + p,
            incoming: { index: step.offset, shift: (1 - p) * 1.5 },
          });
        });
      }
      if (mine === gen && !destroyed) drawStatic(next);
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
