/**
 * frames-stack-up 의 stage — 코드 다섯 줄, 호출 스택, 태스크 줄을 그린다.
 *
 * 동사: 프레임이 스택 위에 한 겹씩 **올라가고**, 위에서부터 한 겹씩 **걷힌다**.
 * `done` 은 스택이 아니라 태스크 줄에 **가만히** 있다가, 스택이 완전히 빈 뒤에야
 * 태스크 줄 맨 앞에서 빈 스택 맨 아래로 **옮겨온다.**
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { FramesStackUpScene, FramesStackUpStep } from './scene.js';

/** 세로는 마운트 뒤 바뀌지 않는다 — 이 조각의 바탕 데이터(사슬 길이 4)에 맞춘 상수. */
const H = 470;
/** 이 조각의 고유 사슬 길이 (script → a → b → c). 동시에 쌓일 수 있는 최대 겹. */
const MAX_DEPTH = 4;
const ANIM_MS = 420;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function easeOutCubic(t: number): number {
  const p = 1 - t;
  return 1 - p * p * p;
}

type Geometry = ReturnType<typeof buildGeometry>;

function buildGeometry(viewW: number) {
  const codeFont = parseFloat(fontSizes.sm);
  const codeLineH = Math.round(codeFont * 1.9);
  const codeTop = 22;
  const codeLeft = 20;
  const codeBottom = codeTop + codeLineH * 5;

  const rowFont = parseFloat(fontSizes.sm);
  const rowH = Math.round(rowFont * 2.6);
  const rowGap = 8;

  const stackLabelY = codeBottom + 26;
  const stackAreaTop = stackLabelY + 14;
  const stackAreaH = MAX_DEPTH * rowH + (MAX_DEPTH - 1) * rowGap;
  const stackBaselineY = stackAreaTop + stackAreaH;

  const queueLabelY = stackBaselineY + 34;
  const queueTop = queueLabelY + 14;

  const captionY = queueTop + rowH + 40;

  const boxW = Math.max(96, Math.min(150, viewW * 0.24));
  const stackX = codeLeft + boxW / 2 + 4;
  const queueLeft = stackX + boxW / 2 + 64;
  const queueGap = 14;

  return {
    codeFont,
    codeLineH,
    codeTop,
    codeLeft,
    rowFont,
    rowH,
    rowGap,
    stackLabelY,
    stackAreaTop,
    stackBaselineY,
    queueLabelY,
    queueTop,
    captionY,
    boxW,
    stackX,
    queueLeft,
    queueGap,
  };
}

/** 스택 칸 i(바닥부터 0) 의 상자 좌상단. */
function stackSlot(g: Geometry, index: number): { x: number; y: number } {
  const bottom = g.stackBaselineY - index * (g.rowH + g.rowGap);
  return { x: g.stackX - g.boxW / 2, y: bottom - g.rowH };
}

/** 태스크 줄 칸 j(앞부터 0) 의 상자 좌상단. */
function queueSlot(g: Geometry, index: number): { x: number; y: number } {
  return { x: g.queueLeft + index * (g.boxW + g.queueGap), y: g.queueTop };
}

export const framesStackUpStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const viewW = canvas.viewBox?.baseVal?.width || PIECE_CANVAS_W;
    const geo = buildGeometry(viewW);

    let destroyed = false;
    let gen = 0;
    const frameIds = new Set<number>();
    const waiters = new Set<() => void>();

    function displayName(id: string): string {
      if (id === 'script') return t('label.script', 'Script');
      return id;
    }

    function currentLine(scene: FramesStackUpScene): number | null {
      const top = scene.stack[scene.stack.length - 1];
      if (top === undefined) return null;
      return scene.lineOf[top] ?? null;
    }

    function frameBox(
      layer: SVGGElement,
      id: string,
      x: number,
      y: number,
      active: boolean,
      opacity: number,
    ): void {
      const g = el('g');
      g.setAttribute('opacity', String(opacity));
      const rect = el('rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(geo.boxW));
      rect.setAttribute('height', String(geo.rowH));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', active ? colors.itemActive : colors.itemDefault);
      rect.setAttribute('stroke', colors.border);
      g.appendChild(rect);

      const text = el('text');
      text.setAttribute('x', String(x + geo.boxW / 2));
      text.setAttribute('y', String(y + geo.rowH / 2 + geo.rowFont * 0.35));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', fonts.mono);
      text.setAttribute('font-size', String(geo.rowFont));
      text.setAttribute('fill', active ? colors.stateInk : colors.text);
      text.textContent = displayName(id);
      g.appendChild(text);
      layer.appendChild(g);
    }

    function drawCode(layer: SVGGElement, scene: FramesStackUpScene): void {
      const line = currentLine(scene);
      scene.code.forEach((sourceLine, i) => {
        const lineNo = i + 1;
        const y = geo.codeTop + i * geo.codeLineH;
        if (line === lineNo) {
          const hl = el('rect');
          hl.setAttribute('x', String(geo.codeLeft - 6));
          hl.setAttribute('y', String(y - geo.codeFont));
          hl.setAttribute('width', String(viewW - (geo.codeLeft - 6) * 2));
          hl.setAttribute('height', String(geo.codeLineH));
          hl.setAttribute('rx', '3');
          hl.setAttribute('fill', colors.itemActive);
          layer.appendChild(hl);
        }
        const text = el('text');
        text.setAttribute('x', String(geo.codeLeft));
        text.setAttribute('y', String(y));
        text.setAttribute('font-family', fonts.mono);
        text.setAttribute('font-size', String(geo.codeFont));
        text.setAttribute('fill', line === lineNo ? colors.stateInk : colors.text);
        text.textContent = sourceLine;
        layer.appendChild(text);
      });
    }

    function labelText(x: number, y: number, value: string, anchor: string): SVGTextElement {
      const text = el('text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', anchor);
      text.setAttribute('font-family', fonts.body);
      text.setAttribute('font-size', String(parseFloat(fontSizes.xs)));
      text.setAttribute('fill', colors.textMuted);
      text.textContent = value;
      return text;
    }

    function captionFor(step: FramesStackUpStep | null): string {
      if (step === null) {
        return t('caption.init', 'Script sits in the task queue. The stack is empty.');
      }
      const name = displayName(step.id);
      if (step.kind === 'push' && step.from === 'call') {
        return t('caption.push.call', '{name}: called, so it goes onto the stack.', { name });
      }
      if (step.kind === 'push' && step.from === 'queue') {
        return t('caption.push.queue', '{name}: moves from the task queue into the empty stack.', { name });
      }
      if (step.kind === 'schedule') {
        return t('caption.schedule', '{name}: handed to the task queue instead of the stack.', { name });
      }
      return t('caption.pop', '{name}: unwinds off the top of the stack.', { name });
    }

    /** 그 장면의 화면 전체. `excludeId` 가 있으면 그 프레임의 상자만 빼고 그린다 (운동 중 겹치지 않게). */
    function drawBase(scene: FramesStackUpScene, excludeId: string | null): SVGGElement {
      canvas.textContent = '';
      const root = el('g');
      canvas.appendChild(root);

      drawCode(root, scene);

      root.appendChild(labelText(geo.codeLeft, geo.stackLabelY, t('label.stack', 'Call stack'), 'start'));
      root.appendChild(
        labelText(
          viewW - geo.codeLeft,
          geo.stackLabelY,
          t('label.depth', 'Depth: {n}', { n: scene.stack.length }),
          'end',
        ),
      );
      root.appendChild(labelText(geo.queueLeft, geo.queueLabelY, t('label.queue', 'Task queue'), 'start'));

      scene.stack.forEach((id, i) => {
        if (id === excludeId) return;
        const slot = stackSlot(geo, i);
        const active = i === scene.stack.length - 1;
        frameBox(root, id, slot.x, slot.y, active, 1);
      });

      scene.queue.forEach((id, i) => {
        if (id === excludeId) return;
        const slot = queueSlot(geo, i);
        frameBox(root, id, slot.x, slot.y, false, 1);
      });

      const caption = el('text');
      caption.setAttribute('x', String(geo.codeLeft));
      caption.setAttribute('y', String(geo.captionY));
      caption.setAttribute('font-family', fonts.body);
      caption.setAttribute('font-size', String(parseFloat(fontSizes.md)));
      caption.setAttribute('fill', colors.text);
      caption.textContent = captionFor(scene.step);
      root.appendChild(caption);

      return root;
    }

    function drawStatic(scene: FramesStackUpScene): void {
      drawBase(scene, null);
    }

    async function animate(next: FramesStackUpScene): Promise<void> {
      const mine = (gen += 1);
      const step = next.step;
      if (step === null) {
        drawStatic(next);
        return;
      }

      let fromXY: { x: number; y: number };
      let toXY: { x: number; y: number };
      let fadeIn: boolean;
      let excludeId: string | null = step.id;

      if (step.kind === 'push' && step.from === 'queue') {
        fromXY = queueSlot(geo, 0);
        toXY = stackSlot(geo, next.stack.length - 1);
        fadeIn = true;
      } else if (step.kind === 'push' && step.from === 'call') {
        toXY = stackSlot(geo, next.stack.length - 1);
        fromXY = { x: toXY.x, y: toXY.y + geo.rowH + geo.rowGap };
        fadeIn = true;
      } else if (step.kind === 'schedule') {
        toXY = queueSlot(geo, next.queue.length - 1);
        fromXY = toXY;
        fadeIn = true;
      } else {
        // pop — 걷힐 때는 next.stack 에 이미 없다. 걷히기 전 자리는 next.stack.length 였다
        // (걷히기 직전 그 프레임은 늘 꼭대기였으므로).
        fromXY = stackSlot(geo, next.stack.length);
        toXY = { x: fromXY.x, y: fromXY.y - (geo.rowH + geo.rowGap) };
        fadeIn = false;
        excludeId = null; // next.stack/queue 에 이미 없어 base 에서 자연히 빠진다
      }

      const base = drawBase(next, excludeId);
      const mover = el('g');
      base.appendChild(mover);
      const movingId = step.id;
      const movingActive = step.kind !== 'schedule';

      await new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const start = performance.now();
        function frame(now: number): void {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const raw = Math.min(1, (now - start) / ANIM_MS);
          const p = easeOutCubic(raw);
          const x = fromXY.x + (toXY.x - fromXY.x) * p;
          const y = fromXY.y + (toXY.y - fromXY.y) * p;
          const opacity = fadeIn ? Math.min(1, raw * 1.4) : Math.max(0, 1 - raw * 1.4);
          mover.textContent = '';
          frameBox(mover, movingId, x, y, movingActive, opacity);
          if (raw >= 1) {
            wake();
            return;
          }
          const id = requestAnimationFrame(frame);
          frameIds.add(id);
        }
        const id = requestAnimationFrame(frame);
        frameIds.add(id);
      });

      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render(next: FramesStackUpScene, _prev: FramesStackUpScene | null, opts: { animate: boolean }) {
        if (destroyed) return;
        if (!opts.animate) {
          gen += 1;
          drawStatic(next);
          return;
        }
        return animate(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frameIds) cancelAnimationFrame(id);
        frameIds.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
