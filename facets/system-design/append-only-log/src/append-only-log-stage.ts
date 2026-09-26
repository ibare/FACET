/**
 * append-only-log 무대 — 들어올 기록의 맨 앞이 로그의 끝으로 옮겨 가 붙고, 끝 표지가 한 칸 오른다.
 *
 * 동사 "뒤에 붙는다" 를 운동으로 둔다: 새 기록 칸이 오른쪽 대기 줄에서 로그 끝 자리로 날아가고,
 * 끝 표지가 앞 자리에서 새 끝으로 미끄러진다. 앞의 칸은 한 번도 움직이지 않는다.
 * 같은 키의 기록들은 칸 아래 호로 이어 옛 기록이 그대로 남아 있음을 보인다.
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
} from '@ffacet/core/runtime';
import type { AppendOnlyLogScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 — 걸음 = 운동 + stepMs. */
const MOVE_MS = 560;
const FRAME_MS = 16;

// 세로 자리 (가로는 캔버스 폭에서 역산한다)
const CAPTION_Y = 26;
const CAPTION2_Y = 48;
const END_LABEL_Y = 78;
const OFFSET_Y = 106;
const CELL_TOP = 116;
const CELL_H = 52;
const ARC_TOP = CELL_TOP + CELL_H + 6;
const CARD_H = 28;
const PAD = 16;

/** 소수 끝자리와 -0 이 글자를 가르지 않게. */
function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Layout = {
  x0: number;
  slot: number;
  cellW: number;
  qx: number;
  qw: number;
  headY: number;
  pitch: number;
};

function layoutFor(total: number): Layout {
  const W = PIECE_CANVAS_W;
  const qw = Math.min(104, Math.round(W * 0.16));
  const qx = W - PAD - qw;
  const x0 = 76;
  const right = qx - 28;
  const slot = Math.min(96, (right - x0) / total);
  const cellW = slot - 8;
  const headY = CELL_TOP + (CELL_H - CARD_H) / 2;
  const room = H - 8 - headY;
  // 대기 줄 간격은 기록 전체 수로 정한다 — 걸음마다 간격이 바뀌지 않게
  const pitch = total > 1 ? Math.min(CARD_H + 8, (room - CARD_H) / (total - 1)) : CARD_H + 8;
  return { x0, slot, cellW, qx, qw, headY, pitch };
}

type Handles = {
  newCell: SVGGElement | null;
  endMarker: SVGGElement | null;
  queue: SVGGElement;
  arcs: SVGGElement;
};

export const appendOnlyLogStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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
      content: string,
      o: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
          ...(o.weight ? { 'font-weight': o.weight } : {}),
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    function drawStatic(scene: AppendOnlyLogScene): Handles {
      svg.textContent = '';
      const total = scene.log.length + scene.waiting.length;
      const L = layoutFor(total);
      const step = scene.step;
      const highlightKey = step !== null && step.sameKey.length > 1 ? step.key : null;

      // 캡션 — 지금 일어난 일만
      if (step !== null) {
        const rec = scene.log[step.offset];
        if (scene.end === null) throw new Error('append-only-log-stage: 붙은 걸음인데 끝 오프셋이 없다');
        if (rec === undefined) throw new Error(`append-only-log-stage: 이번 오프셋 ${step.offset} 의 기록이 로그에 없다`);
        label(
          svg,
          PIECE_CANVAS_W / 2,
          CAPTION_Y,
          t('caption.append', 'Appended at the end: {key}={value}. Offset {offset} · end {end}', {
            key: rec.key,
            value: rec.value,
            offset: step.offset,
            end: scene.end,
          }),
          { size: fontSizes.md, fill: colors.text, anchor: 'middle', weight: 600 },
        );
        if (highlightKey !== null) {
          label(
            svg,
            PIECE_CANVAS_W / 2,
            CAPTION2_Y,
            t('caption.sameKey', 'Key {key} sits at offsets: {offsets}', {
              key: highlightKey,
              offsets: step.sameKey.join(' · '),
            }),
            { size: fontSizes.sm, fill: colors.textMuted, anchor: 'middle' },
          );
        }
      } else if (scene.end !== null) {
        label(svg, PIECE_CANVAS_W / 2, CAPTION_Y, t('caption.empty', 'Empty log. End offset: {end}', { end: scene.end }), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
          weight: 600,
        });
      }

      // 왼쪽 역할 이름
      label(svg, L.x0 - 10, OFFSET_Y, t('label.offset', 'Offset'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });
      label(svg, L.x0 - 10, CELL_TOP + CELL_H / 2, t('label.log', 'Log'), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'end',
        weight: 600,
      });

      // 로그 바닥 줄 — 칸이 올라앉는 자리
      el(
        'line',
        {
          x1: r2(L.x0),
          y1: CELL_TOP + CELL_H + 1,
          x2: r2(L.x0 + L.slot * total),
          y2: CELL_TOP + CELL_H + 1,
          stroke: colors.border,
          'stroke-width': 2,
        },
        svg,
      );

      // 다음에 붙을 자리 — 끝 오프셋이 가리키는 빈 칸
      if (scene.end !== null && scene.end < total) {
        el(
          'rect',
          {
            x: r2(L.x0 + scene.end * L.slot + 4),
            y: CELL_TOP,
            width: r2(L.cellW),
            height: CELL_H,
            rx: 6,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
      }

      // 붙은 기록
      let newCell: SVGGElement | null = null;
      for (const e of scene.log) {
        const cx = L.x0 + e.offset * L.slot + 4;
        label(svg, cx + L.cellW / 2, OFFSET_Y, String(e.offset), {
          size: fontSizes.sm,
          fill: colors.textMuted,
          anchor: 'middle',
          mono: true,
        });
        const g = el('g', {}, svg);
        const same = highlightKey !== null && e.key === highlightKey;
        const isNew = step !== null && e.offset === step.offset;
        el(
          'rect',
          {
            x: r2(cx),
            y: CELL_TOP,
            width: r2(L.cellW),
            height: CELL_H,
            rx: 6,
            fill: same ? colors.accent : colors.bgSubtle,
            stroke: isNew ? colors.primary : colors.border,
            'stroke-width': isNew ? 2 : 1,
          },
          g,
        );
        label(g, cx + L.cellW / 2, CELL_TOP + 17, e.key, {
          size: fontSizes.xs,
          fill: same ? colors.stateInk : colors.textMuted,
          anchor: 'middle',
          mono: true,
        });
        label(g, cx + L.cellW / 2, CELL_TOP + 36, String(e.value), {
          size: fontSizes.lg,
          fill: same ? colors.stateInk : colors.text,
          anchor: 'middle',
          mono: true,
          weight: 600,
        });
        if (isNew) newCell = g;
      }
      if (step !== null && newCell === null) {
        throw new Error(`append-only-log-stage: 이번 오프셋 ${step.offset} 의 칸을 세우지 못했다`);
      }

      // 같은 키를 잇는 호 — 옛 기록이 제자리에 남아 있다
      const arcs = el('g', {}, svg);
      if (step !== null && highlightKey !== null) {
        const offs = step.sameKey;
        for (let i = 0; i + 1 < offs.length; i += 1) {
          const a = offs[i] as number;
          const b = offs[i + 1] as number;
          const ax = L.x0 + a * L.slot + L.slot / 2;
          const bx = L.x0 + b * L.slot + L.slot / 2;
          const depth = 18 + 7 * (b - a);
          el(
            'path',
            {
              d: `M ${r2(ax)} ${ARC_TOP} Q ${r2((ax + bx) / 2)} ${r2(ARC_TOP + depth * 2)} ${r2(bx)} ${ARC_TOP}`,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 3',
            },
            arcs,
          );
        }
        for (const o of offs) {
          el('circle', { cx: r2(L.x0 + o * L.slot + L.slot / 2), cy: ARC_TOP, r: 3, fill: colors.textMuted }, arcs);
        }
      }

      // 끝 표지 — 다음에 붙을 자리의 왼쪽 경계
      let endMarker: SVGGElement | null = null;
      if (scene.end !== null) {
        const mx = L.x0 + scene.end * L.slot;
        endMarker = el('g', {}, svg);
        el(
          'line',
          {
            x1: r2(mx),
            y1: END_LABEL_Y + 16,
            x2: r2(mx),
            y2: CELL_TOP + CELL_H + 8,
            stroke: colors.primary,
            'stroke-width': 2,
          },
          endMarker,
        );
        el(
          'path',
          {
            d: `M ${r2(mx - 6)} ${END_LABEL_Y + 10} L ${r2(mx + 6)} ${END_LABEL_Y + 10} L ${r2(mx)} ${END_LABEL_Y + 18} Z`,
            fill: colors.primary,
          },
          endMarker,
        );
        label(endMarker, mx, END_LABEL_Y, t('label.end', 'End {end}', { end: scene.end }), {
          size: fontSizes.sm,
          fill: colors.primary,
          anchor: 'middle',
          weight: 600,
        });
      }

      // 들어올 기록 — 맨 앞이 로그 줄 높이에 선다
      label(svg, L.qx + L.qw / 2, OFFSET_Y, t('label.incoming', 'Incoming'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });
      const queue = el('g', {}, svg);
      scene.waiting.forEach((rec, i) => {
        const y = L.headY + i * L.pitch;
        el(
          'rect',
          {
            x: r2(L.qx),
            y: r2(y),
            width: L.qw,
            height: CARD_H,
            rx: 5,
            fill: colors.bg,
            stroke: colors.border,
          },
          queue,
        );
        label(queue, L.qx + L.qw / 2, y + CARD_H / 2, `${rec.key}=${rec.value}`, {
          size: fontSizes.sm,
          fill: colors.text,
          anchor: 'middle',
          mono: true,
        });
      });

      return { newCell, endMarker, queue, arcs };
    }

    function sleepFrame(mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function moveAppend(scene: AppendOnlyLogScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) throw new Error('append-only-log-stage: 붙기 운동에 이번 걸음이 없다');
      const cell = h.newCell;
      if (cell === null) throw new Error('append-only-log-stage: 붙기 운동에 새 칸이 없다');
      const marker = h.endMarker;
      if (marker === null) throw new Error('append-only-log-stage: 붙기 운동에 끝 표지가 없다');
      const total = scene.log.length + scene.waiting.length;
      const L = layoutFor(total);

      // 새 칸의 출발 — 대기 줄 맨 앞 카드의 가운데
      const cellCx = L.x0 + step.offset * L.slot + 4 + L.cellW / 2;
      const cellCy = CELL_TOP + CELL_H / 2;
      const fromDx = L.qx + L.qw / 2 - cellCx;
      const fromDy = L.headY + CARD_H / 2 - cellCy;
      const cardScale = CARD_H / CELL_H;

      const frame = (p: number): void => {
        const q = 1 - p;
        const s = cardScale + (1 - cardScale) * p;
        cell.setAttribute(
          'transform',
          `translate(${r2(cellCx + fromDx * q)} ${r2(cellCy + fromDy * q)}) scale(${r2(s)}) translate(${r2(-cellCx)} ${r2(-cellCy)})`,
        );
        marker.setAttribute('transform', `translate(${r2(-L.slot * q)} 0)`);
        // 남은 카드는 한 칸 아래에서 올라온다 (맨 앞 카드가 빠진 자리를 메운다)
        h.queue.setAttribute('transform', `translate(0 ${r2(L.pitch * q)})`);
        h.arcs.setAttribute('opacity', String(r2(p * p)));
      };

      frame(0);
      const start = Date.now();
      for (;;) {
        if (!(await sleepFrame(mine))) return;
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        frame(ease(p));
        if (p >= 1) break;
      }
    }

    async function render(
      next: AppendOnlyLogScene,
      _prev: AppendOnlyLogScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || next.step === null) return;
      await moveAppend(next, h, mine);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
