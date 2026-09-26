/**
 * microtask-starvation 의 stage — 오르는 DOM 수와 멎은 화면 수의 벌어짐, 그리고
 * 렌더 없이 지나가는 프레임 경계를 그린다. 코드는 `@notation native` — 사양의
 * 자바스크립트 그대로 (`facet.ts` JSDoc 참고).
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type Translate,
} from '@ffacet/core/runtime';
import type { MicrotaskStarvationScene, MicrotaskStarvationStep } from './scene.js';
import { frameBoundaryMarks } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const PAD = 28;

const MONO_PX = parseFloat(fontSizes.sm);
const CODE_LINE_H = Math.round(MONO_PX * 1.6);
const CODE_BLOCK_PAD = 10;

const BAR_MAX_H = 70;
const BAR_W = 56;

// 세로 좌표 — 위에서 아래로 순서대로 쌓는다. 코드 줄 수(7)에 맞춰 한 번만 셈한다.
const CODE_TOP = 60;
const CODE_LINES = 7;
const CODE_BLOCK_BOTTOM = CODE_TOP - CODE_BLOCK_PAD + CODE_LINES * CODE_LINE_H + CODE_BLOCK_PAD * 2;
const QUEUE_Y = CODE_BLOCK_BOTTOM + 24;
const GAP_LABEL_Y = QUEUE_Y + 40;
const NUMBER_Y = GAP_LABEL_Y + 20;
const BASELINE_Y = NUMBER_Y + 10 + BAR_MAX_H;
const LABEL_Y = BASELINE_Y + 16;
const TIMELINE_Y = LABEL_Y + 28;
const TIMELINE_LABEL_Y = TIMELINE_Y + 18;
const H = TIMELINE_LABEL_Y + 14;

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function svgText(
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number> = {},
): SVGTextElement {
  const e = svgEl('text', { x, y, ...attrs }) as SVGTextElement;
  e.textContent = content;
  return e;
}

/** 코드에서 지금 걸음이 돌리는 줄 구간 (0-based, [from, to] 포함). 없으면 강조 없음. */
function codeHighlightRange(step: MicrotaskStarvationStep): [number, number] | null {
  if (step.kind === 'click') return [6, 6];
  if (step.kind === 'step') return [1, 5];
  return null;
}

function barHeight(value: number, count: number): number {
  if (count <= 0) return 0;
  return (value / count) * BAR_MAX_H;
}

type BoundaryState = 'pending' | 'missed' | 'rendered';

function boundaryState(scene: MicrotaskStarvationScene, index: number): BoundaryState {
  if (scene.renderedBoundaries?.some((b) => b.index === index)) return 'rendered';
  if (scene.passed.some((b) => b.index === index)) return 'missed';
  return 'pending';
}

function captionLines(scene: MicrotaskStarvationScene, t: Translate): [string, string] {
  const step = scene.step;
  switch (step.kind) {
    case 'initial':
      return [
        t('caption.initial', 'Start — DOM {dom}, screen {screen}.', { dom: scene.dom, screen: scene.screen }),
        t('caption.initialNote', 'The microtask queue is empty.', {}),
      ];
    case 'click':
      return [
        t('caption.click', 'The click task queues one run on the microtask queue.', {}),
        t('caption.clickNote', 'It empties the queue once the task ends.', {}),
      ];
    case 'step': {
      const first = t('caption.step', 'A run holds the stack for {workMs}ms — DOM {n}.', {
        workMs: scene.workMs,
        n: step.n,
      });
      if (step.justPassed.length > 0) {
        const mark = step.justPassed[0];
        return [
          first,
          t('caption.boundaryMissed', 'Boundary {ms}ms passes with no render — screen stays {screen}.', {
            ms: mark.ms.toFixed(1),
            screen: scene.screen,
          }),
        ];
      }
      if (step.queued) {
        return [first, t('caption.stepRequeue', 'It requeues itself before finishing — the queue never empties.', {})];
      }
      return [first, t('caption.stepLast', 'It stops requeuing — the queue is about to empty.', {})];
    }
    case 'render':
      return [
        t('caption.render', 'The queue empties and the turn ends — {count} passed boundaries become one paint.', {
          count: scene.renderedBoundaries?.length ?? 0,
        }),
        t('caption.renderJump', 'The screen jumps to {screen} — the values in between never appeared.', {
          screen: scene.screen,
        }),
      ];
  }
}

export const microtaskStarvationStageView: CanvasView = {
  canvas: { height: H },
  mount(container, params): ViewInstance {
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: MicrotaskStarvationScene, domVal: number, screenVal: number): void {
      svg.textContent = '';

      svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }));

      const [capA, capB] = captionLines(scene, t);
      svg.appendChild(
        svgText(PAD, 26, capA, {
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        }),
      );
      svg.appendChild(
        svgText(PAD, 46, capB, {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }),
      );

      // 코드 판 — @notation native (facet.ts JSDoc)
      const codeBoxTop = CODE_TOP - CODE_BLOCK_PAD;
      const codeBoxHeight = scene.code.length * CODE_LINE_H + CODE_BLOCK_PAD * 2;
      svg.appendChild(
        svgEl('rect', {
          x: PAD,
          y: codeBoxTop,
          width: W - PAD * 2,
          height: codeBoxHeight,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
        }),
      );
      const hi = codeHighlightRange(scene.step);
      if (hi) {
        const [from, to] = hi;
        svg.appendChild(
          svgEl('rect', {
            x: PAD + 4,
            y: codeBoxTop + 4 + from * CODE_LINE_H,
            width: W - PAD * 2 - 8,
            height: (to - from + 1) * CODE_LINE_H,
            rx: 4,
            fill: colors.itemActive,
            opacity: '0.2',
          }),
        );
      }
      scene.code.forEach((line, i) => {
        svg.appendChild(
          svgText(PAD + 14, CODE_TOP + i * CODE_LINE_H, line, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          }),
        );
      });

      // 마이크로태스크 줄
      svg.appendChild(
        svgText(PAD, QUEUE_Y, t('label.microQueue', 'Microtask queue'), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }),
      );
      const chipX = PAD + 108;
      svg.appendChild(
        svgEl('rect', {
          x: chipX,
          y: QUEUE_Y - 16,
          width: 66,
          height: 22,
          rx: 11,
          fill: scene.queued ? colors.itemActive : 'none',
          stroke: scene.queued ? colors.itemActive : colors.border,
          'stroke-dasharray': scene.queued ? '0' : '4 3',
        }),
      );
      if (scene.queued) {
        svg.appendChild(
          svgText(chipX + 33, QUEUE_Y - 1, 'step', {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textInverse,
            'text-anchor': 'middle',
          }),
        );
      }

      // DOM / 화면 막대
      const domCX = W * 0.32;
      const screenCX = W * 0.68;
      const domH = barHeight(domVal, scene.count);
      const screenH = barHeight(screenVal, scene.count);

      const gap = scene.dom - scene.screen;
      if (gap > 0) {
        svg.appendChild(
          svgEl('line', {
            x1: domCX,
            y1: GAP_LABEL_Y,
            x2: screenCX,
            y2: GAP_LABEL_Y,
            stroke: colors.danger,
            'stroke-dasharray': '4 3',
          }),
        );
        svg.appendChild(
          svgText((domCX + screenCX) / 2, GAP_LABEL_Y - 8, t('label.gap', 'Gap {n}', { n: gap }), {
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.danger,
            'text-anchor': 'middle',
          }),
        );
      }

      svg.appendChild(
        svgText(domCX, NUMBER_Y, String(scene.dom), {
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          fill: colors.text,
          'text-anchor': 'middle',
        }),
      );
      svg.appendChild(
        svgText(screenCX, NUMBER_Y, String(scene.screen), {
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          fill: colors.text,
          'text-anchor': 'middle',
        }),
      );

      svg.appendChild(
        svgEl('rect', {
          x: domCX - BAR_W / 2,
          y: BASELINE_Y - domH,
          width: BAR_W,
          height: domH,
          fill: colors.itemActive,
        }),
      );
      svg.appendChild(
        svgEl('rect', {
          x: screenCX - BAR_W / 2,
          y: BASELINE_Y - screenH,
          width: BAR_W,
          height: screenH,
          fill: colors.primary,
        }),
      );
      svg.appendChild(
        svgEl('line', { x1: PAD, y1: BASELINE_Y, x2: W - PAD, y2: BASELINE_Y, stroke: colors.border }),
      );

      svg.appendChild(
        svgText(domCX, LABEL_Y, t('label.dom', 'DOM'), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        }),
      );
      svg.appendChild(
        svgText(screenCX, LABEL_Y, t('label.screen', 'Screen'), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        }),
      );

      // 프레임 경계 타임라인
      const trackX0 = PAD;
      const trackX1 = W - PAD;
      svg.appendChild(svgEl('line', { x1: trackX0, y1: TIMELINE_Y, x2: trackX1, y2: TIMELINE_Y, stroke: colors.border }));

      const maxElapsed = scene.workMs * scene.count;
      for (const b of frameBoundaryMarks(scene.workMs, scene.count)) {
        const x = trackX0 + (b.ms / maxElapsed) * (trackX1 - trackX0);
        const state = boundaryState(scene, b.index);
        const color = state === 'missed' ? colors.danger : state === 'rendered' ? colors.success : colors.border;
        svg.appendChild(
          svgEl('line', { x1: x, y1: TIMELINE_Y - 8, x2: x, y2: TIMELINE_Y + 8, stroke: color, 'stroke-width': 2 }),
        );
        svg.appendChild(
          svgText(x, TIMELINE_LABEL_Y, b.ms.toFixed(1), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
            'text-anchor': 'middle',
          }),
        );
      }

      const elapsed = domVal * scene.workMs;
      const cursorX = trackX0 + Math.min(1, maxElapsed > 0 ? elapsed / maxElapsed : 0) * (trackX1 - trackX0);
      svg.appendChild(
        svgEl('line', {
          x1: cursorX,
          y1: TIMELINE_Y - 14,
          x2: cursorX,
          y2: TIMELINE_Y + 14,
          stroke: colors.accent,
          'stroke-width': 2,
        }),
      );
    }

    function render(
      next: MicrotaskStarvationScene,
      prev: MicrotaskStarvationScene | null,
      opts: { animate: boolean },
    ): void | Promise<void> {
      const mine = (gen += 1);

      if (!opts.animate || destroyed) {
        drawStatic(next, next.dom, next.screen);
        return;
      }

      const fromDom = prev ? prev.dom : next.dom;
      const fromScreen = prev ? prev.screen : next.screen;
      const toDom = next.dom;
      const toScreen = next.screen;

      if (fromDom === toDom && fromScreen === toScreen) {
        drawStatic(next, toDom, toScreen);
        return;
      }

      // 정적 그리기가 정본 — 끝 자리를 먼저 세우고, 아직 못 온 만큼으로 되돌린다.
      drawStatic(next, toDom, toScreen);
      drawStatic(next, fromDom, fromScreen);

      return new Promise<void>((resolve) => {
        const duration = 400;
        const start = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);

        function frame(now: number): void {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const t01 = Math.min(1, (now - start) / duration);
          const domVal = fromDom + (toDom - fromDom) * t01;
          const screenVal = fromScreen + (toScreen - fromScreen) * t01;
          drawStatic(next, domVal, screenVal);
          if (t01 >= 1) {
            drawStatic(next, toDom, toScreen);
            finish();
            return;
          }
          const id = requestAnimationFrame(frame);
          frames.add(id);
        }
        const id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    void container;
    return { render, destroy };
  },
};
