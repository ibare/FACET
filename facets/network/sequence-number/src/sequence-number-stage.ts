/**
 * sequence-number 의 그림 — 바이트 번호 줄 위의 확인 번호 바늘.
 *
 * 동사는 "멈췄다가 건너뛴다". 받는 쪽 바이트 줄(가로 = 바이트 번호, 조각 너비 = 바이트 수)에
 * 조각이 위에서 떨어져 제자리에 앉는다. 줄 아래의 바늘(확인 번호 = 다음에 기다리는 바이트)은
 * 빈자리 앞에서 떨리기만 하고 서 있다가, 빈자리를 메우는 조각이 앉는 순간 쥐고 있던 조각들을
 * 바이트 거리만큼 한 번에 미끄러져 넘는다. 도착마다 돌려보낸 확인 번호는 아래에 한 줄씩 쌓여,
 * 같은 길이의 줄이 이어지다 한 번에 길어지는 계단으로 남는다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SequenceNumberScene } from './scene.js';
import type { SegmentRange } from './algorithm.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';

/** 바이트 줄의 양 끝 (가로는 캔버스 폭에서 역산) */
const RULER_LEFT = 44;
/** 오른쪽 여백 — 마지막 자취 줄의 번호가 줄 끝 오른쪽에 들어갈 만큼 */
const RULER_RIGHT_PAD = 44;

const CAPTION_Y = 22;
const SUBCAPTION_Y = 42;
const SLOT_Y = 96;
const SLOT_H = 40;
/** 조각이 떨어지기 시작하는 높이 (제자리 위로) */
const DROP = 40;
const TICK_LABEL_Y = 156;
const NEEDLE_TIP_Y = 162;
const NEEDLE_LABEL_Y = 192;
const TRAIL_HEAD_Y = 216;
const TRAIL_TOP = 232;
const TRAIL_BOTTOM = H - 10;
const ROW_STEP_MAX = 14;
/** 멈춘 걸음에서 바늘이 빈자리 쪽으로 떨리는 폭 */
const NUDGE = 7;

const MOTION_MS = 800;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

type SegState = 'missing' | 'held' | 'delivered';

/** 이번 장면에서 운동이 손댈 손잡이 */
type Handles = {
  blocks: Map<number, { group: SVGGElement; rect: SVGRectElement; badge: SVGCircleElement }>;
  needle: SVGGElement;
  needleLabel: SVGTextElement;
  newestRow: SVGGElement | null;
  newestBar: SVGRectElement | null;
  newestMark: SVGGElement | null;
  xOf: (byte: number) => number;
};

export const sequenceNumberStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function fillOf(state: SegState): string {
      if (state === 'delivered') return c.primary;
      if (state === 'held') return c.itemComparing;
      return c.bgSubtle;
    }

    function stateOf(scene: SequenceNumberScene, r: SegmentRange): SegState {
      if (!scene.arrived.includes(r.id)) return 'missing';
      return scene.held.includes(r.id) ? 'held' : 'delivered';
    }

    function paintBlock(
      h: { rect: SVGRectElement; badge: SVGCircleElement },
      state: SegState,
    ): void {
      h.rect.setAttribute('fill', fillOf(state));
      h.rect.setAttribute('stroke', state === 'missing' ? c.border : fillOf(state));
      if (state === 'missing') h.rect.setAttribute('stroke-dasharray', '4 3');
      else h.rect.removeAttribute('stroke-dasharray');
      h.badge.setAttribute('stroke', state === 'missing' ? c.border : c.bg);
    }

    function needleAnchor(x: number, right: number, label: string): { anchor: string; dx: number } {
      const half = (label.length * smPx * 0.6) / 2;
      if (x - half < 4) return { anchor: 'start', dx: -8 };
      if (x + half > right + RULER_RIGHT_PAD - 4) return { anchor: 'end', dx: 8 };
      return { anchor: 'middle', dx: 0 };
    }

    function drawStatic(scene: SequenceNumberScene): Handles {
      svg.textContent = '';
      const W = PIECE_CANVAS_W;
      const right = W - RULER_RIGHT_PAD;
      const first = scene.ranges[0]!.from;
      const last = scene.ranges[scene.ranges.length - 1]!.end;
      const xOf = (byte: number): number =>
        round(RULER_LEFT + ((byte - first) / (last - first)) * (right - RULER_LEFT));

      // 캡션 — 지금 일어난 일만
      const cap = node('text', {
        x: 14, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md,
        'font-weight': 600, fill: c.text,
      }, svg);
      const sub = node('text', {
        x: 14, y: SUBCAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted,
      }, svg);
      if (scene.step === null) {
        cap.textContent = t('caption.start', 'Next expected byte: {ack}', { ack: scene.ack });
      } else {
        const r = scene.ranges[scene.step.seg - 1]!;
        cap.textContent = t('caption.arrive', 'Segment {seg} arrived, bytes {from}–{to}', {
          seg: r.id, from: r.from, to: r.end - 1,
        });
        sub.textContent = t('caption.ack', 'Acknowledgment: {before} → {ack} (bytes moved: {moved})', {
          before: scene.step.before, ack: scene.ack, moved: scene.ack - scene.step.before,
        });
      }

      // 바이트 줄 — 조각 너비가 바이트 수다
      const heldEnd = Math.max(
        0,
        ...scene.ranges.filter((r) => scene.held.includes(r.id)).map((r) => r.end),
      );
      const blocks: Handles['blocks'] = new Map();
      for (const r of scene.ranges) {
        const state = stateOf(scene, r);
        const x0 = xOf(r.from);
        const x1 = xOf(r.end);
        const cx = round((x0 + x1) / 2);
        const group = node('g', {}, svg);
        const rect = node('rect', {
          x: round(x0 + 1), y: SLOT_Y, width: round(x1 - x0 - 2), height: SLOT_H, rx: 4, 'stroke-width': 1.5,
        }, group);
        const badge = node('circle', {
          cx, cy: SLOT_Y + 15, r: 9, fill: c.bg, 'stroke-width': 1.5,
        }, group);
        const id = node('text', {
          x: cx, y: SLOT_Y + 19, 'text-anchor': 'middle', 'font-family': fonts.body,
          'font-size': fontSizes.xs, 'font-weight': 700, fill: c.text,
        }, group);
        id.textContent = String(r.id);
        let word = '';
        if (state === 'held') word = t('label.held', 'held');
        else if (state === 'missing' && r.from < heldEnd) word = t('label.gap', 'gap');
        if (word !== '') {
          const w = node('text', {
            x: cx, y: SLOT_Y + 35, 'text-anchor': 'middle', 'font-family': fonts.body,
            'font-size': fontSizes.xs, fill: state === 'held' ? c.text : c.textMuted,
          }, group);
          w.textContent = word;
        }
        const h = { group, rect, badge };
        paintBlock(h, state);
        blocks.set(r.id, h);
      }

      // 줄 아래 눈금 — 조각이 시작하는 바이트 번호와 마지막 다음 번호
      const marks = [...scene.ranges.map((r) => r.from), last];
      for (const b of marks) {
        const x = xOf(b);
        node('line', {
          x1: x, x2: x, y1: SLOT_Y + SLOT_H + 1, y2: SLOT_Y + SLOT_H + 7, stroke: c.textMuted, 'stroke-width': 1,
        }, svg);
        const lab = node('text', {
          x, y: TICK_LABEL_Y, 'text-anchor': 'middle', 'font-family': fonts.mono,
          'font-size': fontSizes.xs, fill: c.textMuted,
        }, svg);
        lab.textContent = String(b);
      }

      // 바늘 — 다음에 기다리는 바이트
      const needle = node('g', { transform: `translate(${xOf(scene.ack)},0)` }, svg);
      node('line', {
        x1: 0, x2: 0, y1: SLOT_Y - 8, y2: SLOT_Y + SLOT_H + 2, stroke: c.text, 'stroke-width': 2,
      }, needle);
      node('path', {
        d: `M0 ${NEEDLE_TIP_Y} L-7 ${NEEDLE_TIP_Y + 12} L7 ${NEEDLE_TIP_Y + 12} Z`, fill: c.text,
      }, needle);
      const labelText = t('label.ack', 'Acknowledgment: {n}', { n: scene.ack });
      const anchor = needleAnchor(xOf(scene.ack), right, labelText);
      const needleLabel = node('text', {
        x: anchor.dx, y: NEEDLE_LABEL_Y, 'text-anchor': anchor.anchor, 'font-family': fonts.body,
        'font-size': fontSizes.sm, 'font-weight': 700, fill: c.text,
      }, needle);
      needleLabel.textContent = labelText;

      // 자취 — 도착마다 돌려보낸 확인 번호
      let newestRow: SVGGElement | null = null;
      let newestBar: SVGRectElement | null = null;
      let newestMark: SVGGElement | null = null;
      if (scene.arrived.length > 0) {
        const head = node('text', {
          x: 14, y: TRAIL_HEAD_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
        }, svg);
        head.textContent = t('label.trail', 'Acknowledgment sent back on each arrival');
      }
      const rows = scene.ranges.length;
      const rowStep = rows > 1 ? Math.min(ROW_STEP_MAX, (TRAIL_BOTTOM - TRAIL_TOP) / (rows - 1)) : 0;
      scene.arrived.forEach((seg, i) => {
        const ack = scene.acks[i]!;
        const y = round(TRAIL_TOP + i * rowStep);
        const newest = i === scene.arrived.length - 1;
        const tone = newest ? c.primary : c.textMuted;
        const row = node('g', {}, svg);
        node('circle', { cx: 22, cy: y, r: 6, fill: c.bg, stroke: tone, 'stroke-width': 1.2 }, row);
        const idText = node('text', {
          x: 22, y: y + 3, 'text-anchor': 'middle', 'font-family': fonts.body,
          'font-size': fontSizes.xs, fill: c.text,
        }, row);
        idText.textContent = String(seg);
        const x = xOf(ack);
        const bar = node('rect', {
          x: RULER_LEFT, y: y - 2, width: round(x - RULER_LEFT), height: 4, rx: 1, fill: tone,
        }, row);
        const mark = node('g', { transform: `translate(${x},0)` }, row);
        node('line', { x1: 0, x2: 0, y1: y - 5, y2: y + 5, stroke: tone, 'stroke-width': 2 }, mark);
        const val = node('text', {
          x: 6, y: y + 4, 'text-anchor': 'start',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': newest ? 700 : 400, fill: c.text,
        }, mark);
        val.textContent = String(ack);
        if (newest) {
          newestRow = row;
          newestBar = bar;
          newestMark = mark;
        }
      });

      return { blocks, needle, needleLabel, newestRow, newestBar, newestMark, xOf };
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - t0) / ms);
          frame(p);
          if (p >= 1) {
            finish();
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

    async function render(
      next: SequenceNumberScene,
      prev: SequenceNumberScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null) return;
      // prev 는 무엇을 흐르게 할지 고르는 데만 — 새로 닿은 조각이 없으면 흘릴 것이 없다
      if (prev !== null && prev.arrived.length >= next.arrived.length) return;

      const arriving = h.blocks.get(step.seg);
      const xBefore = h.xOf(step.before);
      const xAfter = h.xOf(next.ack);
      const moved = next.ack !== step.before;
      // 바늘이 넘을 조각 — 닿기 전에 쥐고 있었고 이제 넘겨진 것
      const passed = next.ranges.filter(
        (r) => step.wasHeld.includes(r.id) && !next.held.includes(r.id),
      );
      // 바늘이 이 자리에 오기 전의 모습으로 되돌린다 (끝 자리가 번쩍이지 않게)
      h.needleLabel.textContent = t('label.ack', 'Acknowledgment: {n}', { n: step.before });

      await tween(mine, MOTION_MS, (p) => {
        const pa = Math.min(1, p / 0.5);
        const pb = Math.max(0, (p - 0.5) / 0.5);
        // 앞 절반: 조각이 위에서 제자리로 떨어진다
        arriving?.group.setAttribute('transform', `translate(0,${round(-DROP * (1 - ease(pa)))})`);
        // 뒤 절반: 바늘이 넘거나, 빈자리 앞에서 떨고 제자리에 선다
        let xn = xBefore;
        if (moved) xn = round(xBefore + (xAfter - xBefore) * ease(pb));
        else xn = round(xAfter + NUDGE * Math.sin(Math.PI * pb) * (pb < 1 ? 1 : 0));
        h.needle.setAttribute('transform', `translate(${xn},0)`);
        for (const r of passed) {
          const b = h.blocks.get(r.id);
          if (b) paintBlock(b, xn >= h.xOf(r.from) + (h.xOf(r.end) - h.xOf(r.from)) / 2 ? 'delivered' : 'held');
        }
        // 돌려보낸 확인 번호의 새 줄은 바늘을 따라 뻗는다
        if (h.newestRow) h.newestRow.setAttribute('opacity', pa < 1 ? '0' : '1');
        const xRow = moved ? xn : xAfter;
        if (h.newestBar) h.newestBar.setAttribute('width', String(round(Math.max(0, xRow - RULER_LEFT))));
        if (h.newestMark) h.newestMark.setAttribute('transform', `translate(${xRow},0)`);
      });
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
