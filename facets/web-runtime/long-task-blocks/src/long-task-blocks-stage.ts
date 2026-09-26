/**
 * long-task-blocks stage — 태스크 줄이 길어지고(1·2·3), 긴 일이 끝나면 클릭마다
 * 기다린 ms(100·72·44)가 붙으며 줄이 줄어드는 모습을 그린다.
 *
 * 렌더 · 프레임은 다루지 않는다 (사양). 움직이는 것은 클릭 상자의 자리뿐이다 —
 * 태스크 줄에 서고, 벽(긴 일)이 걷히며 당겨지고, 처리되며 아래 줄로 건너간다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { LongTaskBlocksClick, LongTaskBlocksScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN_X = 24;
const GAP = 12;
const BOX_H = 56;
const CAPTION_Y = 30;
const ROW_LABEL_GAP = 18;
const ROW_A_LABEL_Y = 58;
const ROW_A_Y = ROW_A_LABEL_Y + ROW_LABEL_GAP;
const ROW_GAP = 30;
const ROW_B_LABEL_Y = ROW_A_Y + BOX_H + ROW_GAP;
const ROW_B_Y = ROW_B_LABEL_Y + ROW_LABEL_GAP;
const BOTTOM_PAD = 20;
const CANVAS_H = ROW_B_Y + BOX_H + BOTTOM_PAD;
const ANIM_MS = 400;

function cellWidth(maxSlots: number): number {
  const trackWidth = PIECE_CANVAS_W - MARGIN_X * 2;
  return (trackWidth - maxSlots * GAP) / (maxSlots + 1);
}

function colX(col: number, cellW: number): number {
  return MARGIN_X + col * (cellW + GAP);
}

function findClick(base: LongTaskBlocksScene['base'], id: string): LongTaskBlocksClick {
  const found = base.clicks.find((c) => c.id === id);
  if (!found) throw new Error(`long-task-blocks: 모르는 클릭 id: ${id}`);
  return found;
}

function ease(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

type Box = { id: string; no: number; kind: 'queue' | 'processed'; x: number; y: number; waitMs?: number };

/** 줄과 처리됨 상자의 자리 — 장면에서 순수하게 셈한다. 좌표는 stage 만 안다. */
function computeBoxes(scene: LongTaskBlocksScene, cellW: number): Box[] {
  const out: Box[] = [];
  const wallCol = scene.trace.longRunning ? 1 : 0;
  scene.trace.queueIds.forEach((id, i) => {
    const click = findClick(scene.base, id);
    out.push({ id, no: click.no, kind: 'queue', x: colX(i + wallCol, cellW), y: ROW_A_Y });
  });
  scene.trace.processed.forEach((p, i) => {
    const click = findClick(scene.base, p.id);
    out.push({ id: p.id, no: click.no, kind: 'processed', x: colX(i, cellW), y: ROW_B_Y, waitMs: p.waitMs });
  });
  return out;
}

function captionFor(scene: LongTaskBlocksScene, t: Translate): string {
  const step = scene.step;
  switch (step.kind) {
    case 'init':
      return t('caption.init', 'The task queue is empty.');
    case 'longStart':
      return t('caption.longStart', 'The long calc starts. It blocks the queue for {durationMs}ms.', {
        durationMs: step.durationMs,
      });
    case 'arrive': {
      const click = findClick(scene.base, step.id);
      return t('caption.arrive', 'Click {no} arrives. Queue length {len}.', {
        no: click.no,
        len: scene.trace.queueIds.length,
      });
    }
    case 'longEnd':
      return t('caption.longEnd', 'The long calc ends. Queue length {len}.', {
        len: scene.trace.queueIds.length,
      });
    case 'process': {
      const click = findClick(scene.base, step.id);
      return t('caption.process', 'Click {no} starts processing. Wait {waitMs}ms.', {
        no: click.no,
        waitMs: step.waitMs,
      });
    }
    default: {
      const exhaustive: never = step;
      throw new Error(`long-task-blocks: 모르는 걸음 종류: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function drawStatic(
  root: SVGElement,
  scene: LongTaskBlocksScene,
  t: Translate,
  colors: Palette,
  cellW: number,
): void {
  root.textContent = '';

  const caption = document.createElementNS(SVG_NS, 'text');
  caption.setAttribute('x', String(PIECE_CANVAS_W / 2));
  caption.setAttribute('y', String(CAPTION_Y));
  caption.setAttribute('text-anchor', 'middle');
  caption.setAttribute('font-family', fonts.body);
  caption.setAttribute('font-size', fontSizes.md);
  caption.setAttribute('fill', colors.text);
  caption.textContent = captionFor(scene, t);
  root.appendChild(caption);

  const rowALabel = document.createElementNS(SVG_NS, 'text');
  rowALabel.setAttribute('x', String(MARGIN_X));
  rowALabel.setAttribute('y', String(ROW_A_LABEL_Y));
  rowALabel.setAttribute('font-family', fonts.body);
  rowALabel.setAttribute('font-size', fontSizes.xs);
  rowALabel.setAttribute('fill', colors.textMuted);
  rowALabel.textContent = t('label.queue', 'Task queue');
  root.appendChild(rowALabel);

  const rowBLabel = document.createElementNS(SVG_NS, 'text');
  rowBLabel.setAttribute('x', String(MARGIN_X));
  rowBLabel.setAttribute('y', String(ROW_B_LABEL_Y));
  rowBLabel.setAttribute('font-family', fonts.body);
  rowBLabel.setAttribute('font-size', fontSizes.xs);
  rowBLabel.setAttribute('fill', colors.textMuted);
  rowBLabel.textContent = t('label.done', 'Done');
  root.appendChild(rowBLabel);

  if (scene.trace.longRunning) {
    const wall = document.createElementNS(SVG_NS, 'g');
    wall.setAttribute('transform', `translate(${colX(0, cellW)}, ${ROW_A_Y})`);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(cellW));
    rect.setAttribute('height', String(BOX_H));
    rect.setAttribute('rx', radii.md);
    rect.setAttribute('fill', colors.itemActive);
    wall.appendChild(rect);
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(cellW / 2));
    label.setAttribute('y', String(BOX_H / 2 + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-family', fonts.body);
    label.setAttribute('font-size', fontSizes.sm);
    label.setAttribute('fill', colors.stateInk);
    label.textContent = t('label.long', 'Long calc');
    wall.appendChild(label);
    root.appendChild(wall);
  }

  for (const box of computeBoxes(scene, cellW)) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-box-id', box.id);
    g.setAttribute('transform', `translate(${box.x}, ${box.y})`);

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(cellW));
    rect.setAttribute('height', String(BOX_H));
    rect.setAttribute('rx', radii.md);
    if (box.kind === 'processed') {
      rect.setAttribute('fill', colors.itemSorted);
    } else {
      rect.setAttribute('fill', colors.itemDefault);
      rect.setAttribute('stroke', colors.border);
    }
    g.appendChild(rect);

    const line1 = document.createElementNS(SVG_NS, 'text');
    line1.setAttribute('x', String(cellW / 2));
    line1.setAttribute('text-anchor', 'middle');
    line1.setAttribute('font-family', fonts.body);
    line1.setAttribute('font-size', fontSizes.sm);
    line1.setAttribute('fill', box.kind === 'processed' ? colors.textInverse : colors.text);
    line1.textContent = t('label.click', 'Click {no}', { no: box.no });

    if (box.kind === 'processed') {
      line1.setAttribute('y', String(BOX_H * 0.4));
      const line2 = document.createElementNS(SVG_NS, 'text');
      line2.setAttribute('x', String(cellW / 2));
      line2.setAttribute('y', String(BOX_H * 0.72));
      line2.setAttribute('text-anchor', 'middle');
      line2.setAttribute('font-family', fonts.body);
      line2.setAttribute('font-size', fontSizes.xs);
      line2.setAttribute('fill', colors.textInverse);
      line2.textContent = t('label.wait', 'Wait: {waitMs}ms', { waitMs: box.waitMs ?? 0 });
      g.appendChild(line1);
      g.appendChild(line2);
    } else {
      line1.setAttribute('y', String(BOX_H / 2 + 4));
      g.appendChild(line1);
    }

    root.appendChild(g);
  }
}

export const longTaskBlocksStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      canvas.textContent = '';
    }

    function render(
      next: LongTaskBlocksScene,
      prev: LongTaskBlocksScene | null,
      opts: { animate: boolean },
    ): void | Promise<void> {
      const mine = (gen += 1);
      const cellW = cellWidth(next.base.clicks.length);
      drawStatic(canvas, next, t, colors, cellW);

      if (!opts.animate || !prev) return;

      const nextBoxes = computeBoxes(next, cellW);
      const prevBoxes = computeBoxes(prev, cellW);
      const prevById = new Map(prevBoxes.map((b) => [b.id, b]));

      type Move = { el: SVGGElement; fromX: number; fromY: number; toX: number; toY: number };
      const moves: Move[] = [];
      for (const nb of nextBoxes) {
        const el = canvas.querySelector(`[data-box-id="${nb.id}"]`);
        if (!(el instanceof SVGGElement)) continue;
        const pb = prevById.get(nb.id);
        const fromX = pb ? pb.x : PIECE_CANVAS_W + cellW;
        const fromY = pb ? pb.y : nb.y;
        if (fromX === nb.x && fromY === nb.y) continue;
        el.setAttribute('transform', `translate(${round(fromX)}, ${round(fromY)})`);
        moves.push({ el, fromX, fromY, toX: nb.x, toY: nb.y });
      }

      if (moves.length === 0) return;

      return new Promise<void>((resolve) => {
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
          const e = ease(raw);
          for (const m of moves) {
            const x = m.fromX + (m.toX - m.fromX) * e;
            const y = m.fromY + (m.toY - m.fromY) * e;
            m.el.setAttribute('transform', `translate(${round(x)}, ${round(y)})`);
          }
          if (raw < 1) {
            frames.add(requestAnimationFrame(frame));
            return;
          }
          if (mine === gen && !destroyed) drawStatic(canvas, next, t, colors, cellW);
          wake();
        }

        frames.add(requestAnimationFrame(frame));
      });
    }

    return { render, destroy };
  },
};
