/**
 * timerIsAFloorStageView — 청한 시각과 실제 시각의 벌어짐을 그린다.
 *
 * 두 레인(첫째 줄 first, 둘째 줄 second)에 각각 "청함" 표식을 등록 시각에 두고,
 * 콜백이 태스크 줄에서 꺼내질 때 "실제" 표식이 그 청함 표식에서 **미끄러져** 온다 —
 * 그 미끄러짐의 거리가 곧 늦음이다. 시각 커서(점선)가 걸음마다 오른쪽으로 움직여
 * 시간이 흐르는 것을 보인다. 위에는 다섯 줄 코드가 있고, 지금 도는 줄이 강조된다.
 * 아래에는 태스크 줄과 스택 상태(바쁨/비어 있음)가 있다.
 */
import type { CanvasView, Translate } from '@ffacet/core/runtime';
import { getColors, makeTranslator, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { TimerIsAFloorScene } from './scene.js';
import type { TimerIsAFloorFacetData } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 460;
const PAD = 16;

const CAPTION_TOP = PAD;
const CAPTION_H = 26;

const CODE_TOP = CAPTION_TOP + CAPTION_H;
const CODE_PAD_X = 12;
const CODE_PAD_Y = 8;
const CODE_LINE_H = 18;
const CODE_BOX_W = W - PAD * 2;

const AXIS_LABEL_W = 56;
const AXIS_RIGHT_MARGIN = 40;
const AXIS_X0 = PAD + AXIS_LABEL_W;
const AXIS_X1 = W - PAD - AXIS_RIGHT_MARGIN;

const LANE_TOP_GAP = 46;
const LANE_GAP = 64;
const LANE_BOTTOM_GAP = 64;
const BRACKET_OFFSET = 28;
const REQUESTED_LABEL_OFFSET = 14;
const ACTUAL_LABEL_OFFSET = 20;
const TICK_ROW_OFFSET = 40;
const CURSOR_LABEL_OFFSET = 56;

const QUEUE_GAP_ABOVE = 20;
const QUEUE_LABEL_OFFSET = 12;
const QUEUE_BOX_OFFSET = 20;
const QUEUE_BOX_H = 26;
const QUEUE_BOX_W = 60;
const QUEUE_BOX_GAP = 10;

const STACK_GAP_ABOVE = 20;
const STACK_BOX_H = 22;
const STACK_ROW_H = 30;

const ANIM_MS = 450;

/** `-0` 과 긴 소수점 끝자리가 문자열을 가르지 않게 정리한다. */
function num(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

function lerp(a: number, b: number, frac: number): number {
  return a + (b - a) * frac;
}

function addText(
  svg: SVGSVGElement,
  x: number,
  y: number,
  text: string,
  opts: {
    fill: string;
    fontSize?: string;
    fontFamily?: string;
    anchor?: 'start' | 'middle' | 'end';
    weight?: string;
    italic?: boolean;
  },
): void {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', num(x));
  el.setAttribute('y', num(y));
  el.setAttribute('font-family', opts.fontFamily ?? fonts.body);
  el.setAttribute('font-size', opts.fontSize ?? fontSizes.sm);
  el.setAttribute('fill', opts.fill);
  el.setAttribute('text-anchor', opts.anchor ?? 'start');
  if (opts.weight) el.setAttribute('font-weight', opts.weight);
  if (opts.italic) el.setAttribute('font-style', 'italic');
  el.textContent = text;
  svg.appendChild(el);
}

function addRect(
  svg: SVGSVGElement,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill: string; stroke?: string; strokeWidth?: number },
): void {
  const el = document.createElementNS(SVG_NS, 'rect');
  el.setAttribute('x', num(x));
  el.setAttribute('y', num(y));
  el.setAttribute('width', num(Math.max(0, w)));
  el.setAttribute('height', num(Math.max(0, h)));
  el.setAttribute('fill', opts.fill);
  if (opts.stroke) el.setAttribute('stroke', opts.stroke);
  if (opts.strokeWidth !== undefined) el.setAttribute('stroke-width', num(opts.strokeWidth));
  svg.appendChild(el);
}

function addLine(
  svg: SVGSVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { stroke: string; strokeWidth?: number; dash?: string },
): void {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', num(x1));
  el.setAttribute('y1', num(y1));
  el.setAttribute('x2', num(x2));
  el.setAttribute('y2', num(y2));
  el.setAttribute('stroke', opts.stroke);
  el.setAttribute('stroke-width', num(opts.strokeWidth ?? 1));
  if (opts.dash) el.setAttribute('stroke-dasharray', opts.dash);
  svg.appendChild(el);
}

function addCircle(
  svg: SVGSVGElement,
  cx: number,
  cy: number,
  r: number,
  opts: { fill: string; stroke?: string; strokeWidth?: number },
): void {
  const el = document.createElementNS(SVG_NS, 'circle');
  el.setAttribute('cx', num(cx));
  el.setAttribute('cy', num(cy));
  el.setAttribute('r', num(r));
  el.setAttribute('fill', opts.fill);
  if (opts.stroke) el.setAttribute('stroke', opts.stroke);
  if (opts.strokeWidth !== undefined) el.setAttribute('stroke-width', num(opts.strokeWidth));
  svg.appendChild(el);
}

function narrow(raw: Record<string, unknown> | undefined): TimerIsAFloorFacetData | null {
  if (!raw) return null;
  const code = raw.code;
  const timers = raw.timers;
  const scriptBusyMs = raw.scriptBusyMs;
  const scriptLine = raw.scriptLine;
  if (!Array.isArray(code) || !code.every((l) => typeof l === 'string')) return null;
  if (typeof scriptBusyMs !== 'number' || typeof scriptLine !== 'number') return null;
  if (!Array.isArray(timers)) return null;
  for (const item of timers) {
    if (item === null || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.id !== 'string' ||
      typeof rec.delayMs !== 'number' ||
      typeof rec.busyMs !== 'number' ||
      typeof rec.scheduleLine !== 'number' ||
      typeof rec.callbackLine !== 'number'
    ) {
      return null;
    }
  }
  return raw as unknown as TimerIsAFloorFacetData;
}

function captionFor(scene: TimerIsAFloorScene, t: Translate): string {
  const step = scene.step;
  switch (step.kind) {
    case 'init':
      return t('caption.start', 'Script starts running. t=0ms.');
    case 'schedule':
      return t('caption.schedule', 'Registers a timer: {id}. Requested delay {delayMs}ms.', {
        id: step.id,
        delayMs: step.delayMs,
      });
    case 'due':
      return t('caption.due', 'Timer is due and joins the task queue: {id}.', { id: step.id });
    case 'scriptEnd':
      return t('caption.scriptEnd', 'Script finishes; the stack is empty. t={at}ms.', { at: step.at });
    case 'dequeue':
      return t(
        'caption.dequeue',
        'Dequeued and called: {id}. Requested {requestedMs}ms, actual {actualMs}ms — late by {latenessMs}ms.',
        { id: step.id, requestedMs: step.requestedMs, actualMs: step.actualMs, latenessMs: step.latenessMs },
      );
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

function activeLine(scene: TimerIsAFloorScene): number | null {
  const step = scene.step;
  switch (step.kind) {
    case 'init':
      return null;
    case 'schedule': {
      const timer = scene.timers.find((tm) => tm.id === step.id);
      return timer ? timer.scheduleLine : null;
    }
    case 'due':
    case 'scriptEnd':
      return scene.scriptLine;
    case 'dequeue': {
      const timer = scene.timers.find((tm) => tm.id === step.id);
      return timer ? timer.callbackLine : null;
    }
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

export const timerIsAFloorStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params) {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const data = narrow(params.initialData);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function cancelFrames(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
    }

    if (!data) {
      return {
        render(): void {
          // 자료가 없어도 던지지 않는다 — 빈 캔버스로 둔다 (canvas-attach 전수 검사).
        },
        destroy(): void {
          destroyed = true;
          cancelFrames();
          for (const wake of [...waiters]) wake();
          waiters.clear();
          svg.textContent = '';
        },
      };
    }

    const laneOf = (id: string): 0 | 1 => (data.timers[0] && data.timers[0].id === id ? 0 : 1);
    const codeBoxH = CODE_PAD_Y * 2 + data.code.length * CODE_LINE_H;
    const codeBoxBottom = CODE_TOP + codeBoxH;
    const lane1Y = codeBoxBottom + LANE_TOP_GAP;
    const lane2Y = lane1Y + LANE_GAP;
    const timelineBottom = lane2Y + LANE_BOTTOM_GAP;
    const queueTop = timelineBottom + QUEUE_GAP_ABOVE;
    const queueBoxY = queueTop + QUEUE_BOX_OFFSET;
    const queueBottom = queueBoxY + QUEUE_BOX_H;
    const stackTop = queueBottom + STACK_GAP_ABOVE;

    const axisMax = Math.max(
      10,
      data.scriptBusyMs + data.timers.reduce((sum, timer) => sum + timer.delayMs + timer.busyMs, 0),
    );
    const scale = (ms: number): number => AXIS_X0 + (ms / axisMax) * (AXIS_X1 - AXIS_X0);
    const laneY = (id: string): number => (laneOf(id) === 0 ? lane1Y : lane2Y);

    function paint(scene: TimerIsAFloorScene, travel?: { id: string; frac: number }, nowOverride?: number): void {
      svg.textContent = '';
      const now = nowOverride ?? scene.now;

      // 캡션 — 지금 걸음에서 일어난 일만 말한다.
      addText(svg, PAD, CAPTION_TOP + 14, captionFor(scene, t), {
        fill: colors.text,
        fontSize: fontSizes.md,
        weight: '600',
      });

      // 코드 — 다섯 줄, 지금 도는 줄을 강조한다.
      addRect(svg, PAD, CODE_TOP, CODE_BOX_W, codeBoxH, { fill: colors.bgSubtle, stroke: colors.border });
      const active = activeLine(scene);
      scene.code.forEach((line, i) => {
        const rowTop = CODE_TOP + CODE_PAD_Y + i * CODE_LINE_H;
        if (active === i) {
          addRect(svg, PAD + 4, rowTop - 2, CODE_BOX_W - 8, CODE_LINE_H, { fill: colors.accent });
        }
        addText(svg, PAD + CODE_PAD_X, rowTop + CODE_LINE_H * 0.72, line, {
          fill: active === i ? colors.stateInk : colors.text,
          fontFamily: fonts.mono,
          fontSize: fontSizes.sm,
        });
      });

      // 타임라인 — 두 레인(first, second). 각각 청함 → (미끄러져) 실제.
      scene.timers.forEach((timer) => {
        const y = laneY(timer.id);
        addText(svg, AXIS_X0 - 10, y + 4, timer.id, {
          fill: colors.text,
          fontFamily: fonts.mono,
          fontSize: fontSizes.sm,
          anchor: 'end',
        });
        addLine(svg, AXIS_X0, y, AXIS_X1, y, { stroke: colors.border });

        if (timer.scheduled) {
          const rx = scale(timer.delayMs);
          addCircle(svg, rx, y, 5, {
            fill: timer.queued ? colors.itemDefault : colors.bg,
            stroke: colors.text,
            strokeWidth: 2,
          });
          addText(svg, rx, y - REQUESTED_LABEL_OFFSET, t('label.requested', 'Requested {n}ms', { n: timer.delayMs }), {
            fill: colors.textMuted,
            fontSize: fontSizes.xs,
            anchor: 'middle',
          });
        }

        const isTraveling = travel !== undefined && travel.id === timer.id;
        const trueActual = timer.actualMs;
        if (trueActual !== null || isTraveling) {
          const displayActual = isTraveling ? lerp(timer.delayMs, trueActual ?? timer.delayMs, travel.frac) : trueActual;
          if (displayActual !== null) {
            const rx = scale(timer.delayMs);
            const ax = scale(displayActual);
            const bracketY = y - BRACKET_OFFSET;
            addLine(svg, rx, bracketY, ax, bracketY, { stroke: colors.danger, strokeWidth: 2 });
            addLine(svg, rx, bracketY - 4, rx, bracketY + 4, { stroke: colors.danger });
            addLine(svg, ax, bracketY - 4, ax, bracketY + 4, { stroke: colors.danger });
            const lateNow = Math.max(0, Math.round(displayActual - timer.delayMs));
            addText(svg, (rx + ax) / 2, bracketY - 6, t('label.late', 'Late by {n}ms', { n: lateNow }), {
              fill: colors.danger,
              fontSize: fontSizes.xs,
              anchor: 'middle',
            });
            addCircle(svg, ax, y, 6, { fill: colors.itemActive, stroke: colors.text, strokeWidth: 2 });
            if (!isTraveling) {
              addText(svg, ax, y + ACTUAL_LABEL_OFFSET, t('label.actual', 'Actual {n}ms', { n: displayActual }), {
                fill: colors.textMuted,
                fontSize: fontSizes.xs,
                anchor: 'middle',
              });
              if (timer.runUntil !== null) {
                const rx2 = scale(displayActual);
                const rx3 = scale(timer.runUntil);
                addRect(svg, rx2, y + 6, rx3 - rx2, 5, { fill: colors.itemActive });
              }
            }
          }
        }
      });
      addText(svg, AXIS_X0, lane2Y + TICK_ROW_OFFSET, '0ms', { fill: colors.textMuted, fontSize: fontSizes.xs });
      addText(svg, AXIS_X1, lane2Y + TICK_ROW_OFFSET, `${num(axisMax)}ms`, {
        fill: colors.textMuted,
        fontSize: fontSizes.xs,
        anchor: 'end',
      });

      // 지금 시각 커서 — 걸음마다 오른쪽으로 움직여 시간이 흐르는 것을 보인다. 표는
      // 맨 아래에 둔다 — 위쪽은 레인마다의 청함·늦음 표식이 이미 붐빈다.
      const cursorX = scale(now);
      addLine(svg, cursorX, codeBoxBottom + 8, cursorX, lane2Y + CURSOR_LABEL_OFFSET - 10, {
        stroke: colors.primary,
        strokeWidth: 2,
        dash: '4 3',
      });
      addText(svg, cursorX, lane2Y + CURSOR_LABEL_OFFSET, `t=${num(now)}ms`, {
        fill: colors.primary,
        fontSize: fontSizes.xs,
        weight: '600',
        anchor: 'middle',
      });

      // 태스크 줄
      addText(svg, PAD, queueTop + QUEUE_LABEL_OFFSET, t('label.queue', 'Task queue'), {
        fill: colors.textMuted,
        fontSize: fontSizes.sm,
      });
      if (scene.queue.length === 0) {
        addText(svg, PAD, queueBoxY + QUEUE_BOX_H * 0.7, t('label.queueEmpty', '(empty)'), {
          fill: colors.textMuted,
          fontSize: fontSizes.sm,
          italic: true,
        });
      } else {
        scene.queue.forEach((id, i) => {
          const x = PAD + i * (QUEUE_BOX_W + QUEUE_BOX_GAP);
          addRect(svg, x, queueBoxY, QUEUE_BOX_W, QUEUE_BOX_H, { fill: colors.itemDefault, stroke: colors.border });
          addText(svg, x + QUEUE_BOX_W / 2, queueBoxY + QUEUE_BOX_H * 0.68, id, {
            fill: colors.text,
            fontFamily: fonts.mono,
            fontSize: fontSizes.sm,
            anchor: 'middle',
          });
        });
      }

      // 스택
      addText(svg, PAD, stackTop + STACK_ROW_H * 0.55, t('label.stack', 'Stack'), {
        fill: colors.textMuted,
        fontSize: fontSizes.sm,
      });
      const stackLabelX = PAD + 60;
      addRect(svg, stackLabelX, stackTop, 90, STACK_BOX_H, {
        fill: scene.stackBusy ? colors.itemActive : colors.itemDefault,
        stroke: colors.border,
      });
      addText(
        svg,
        stackLabelX + 45,
        stackTop + STACK_BOX_H * 0.68,
        scene.stackBusy ? t('label.stackBusy', 'Busy') : t('label.stackIdle', 'Idle'),
        {
          fill: scene.stackBusy ? colors.stateInk : colors.text,
          fontSize: fontSizes.sm,
          anchor: 'middle',
        },
      );
    }

    return {
      render(next: unknown, prev: unknown, opts: { animate: boolean }): void | Promise<void> {
        const scene = next as TimerIsAFloorScene;
        const mine = (gen += 1);

        if (!opts.animate || prev === null) {
          paint(scene);
          return;
        }
        const prevScene = prev as TimerIsAFloorScene;
        const travelId = scene.step.kind === 'dequeue' ? scene.step.id : null;
        const startNow = prevScene.now;
        const endNow = scene.now;
        if (travelId === null && startNow === endNow) {
          paint(scene);
          return;
        }

        return new Promise<void>((resolve) => {
          const start = performance.now();
          let done = false;
          const finish = (): void => {
            if (done) return;
            done = true;
            waiters.delete(finish);
            paint(scene);
            resolve();
          };
          waiters.add(finish);

          const step = (now: number): void => {
            if (destroyed || mine !== gen) {
              finish();
              return;
            }
            const frac = Math.min(1, (now - start) / ANIM_MS);
            const curNow = lerp(startNow, endNow, frac);
            paint(scene, travelId !== null ? { id: travelId, frac } : undefined, curNow);
            if (frac < 1) {
              frames.add(requestAnimationFrame(step));
            } else {
              finish();
            }
          };
          frames.add(requestAnimationFrame(step));
        });
      },

      destroy(): void {
        destroyed = true;
        cancelFrames();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
