import type {
  CanvasView,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { MoveWithoutRepaintScene } from './scene.js';

const HEIGHT = 284;
const MARGIN_X = 40;
const TRACK_WIDTH = PIECE_CANVAS_W - MARGIN_X * 2;

const CHIP_GAP = 16;
const CHIP_Y = 38;
const CHIP_H = 50;
const CHIP_W = (TRACK_WIDTH - CHIP_GAP * 2) / 3;

const TRACK_Y = CHIP_Y + CHIP_H + 22;
const TRACK_H = 92;
const BOX_W = 88;
const BOX_H = 46;

const CODE_LABEL_Y = TRACK_Y + TRACK_H + 18;
const CODE_Y = TRACK_Y + TRACK_H + 24;
const CODE_H = 40;

/** 한 걸음의 밀림이 걸리는 시간 — stepMs 의 정지 시간과는 별개다. */
const MOVE_MS = 500;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/** 데이터의 x(px) 를 트랙 안 상자의 화면 좌표로 옮긴다. */
function visualX(x: number, maxX: number): number {
  const travel = TRACK_WIDTH - BOX_W;
  if (maxX <= 0) return MARGIN_X;
  return MARGIN_X + (travel * x) / maxX;
}

export const moveWithoutRepaintStageView: CanvasView = {
  canvas: { height: HEIGHT },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const svg = params.canvas;
    svg.textContent = '';

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    let boxEl: SVGGElement | null = null;

    function caption(scene: MoveWithoutRepaintScene): string {
      if (scene.step.kind === 'init') {
        return t(
          'caption.init',
          'The box is already painted once (paint count {painted}) before the animation starts.',
          { painted: scene.paintedCount },
        );
      }
      return t(
        'caption.frame',
        'Frame {frame} — the same painted box slides to {x}px. Composite count {composites}.',
        { frame: scene.step.frame, x: scene.step.x, composites: scene.step.composites },
      );
    }

    function draw(scene: MoveWithoutRepaintScene, boxVisX: number): void {
      svg.textContent = '';
      const maxX = scene.frames * scene.perFramePx;

      const captionEl = el('text');
      captionEl.setAttribute('x', String(PIECE_CANVAS_W / 2));
      captionEl.setAttribute('y', '22');
      captionEl.setAttribute('text-anchor', 'middle');
      captionEl.setAttribute('font-family', fonts.body);
      captionEl.setAttribute('font-size', fontSizes.md);
      captionEl.setAttribute('fill', colors.text);
      captionEl.textContent = caption(scene);
      svg.appendChild(captionEl);

      const paintedLabel = t('label.painted', 'Paint count');
      const compositesLabel = t('label.composites', 'Composite count');
      const layoutLabel = t('label.layout', 'Layout count');
      const chips: Array<{ label: string; value: number }> = [
        { label: paintedLabel, value: scene.paintedCount },
        { label: compositesLabel, value: scene.composites },
        { label: layoutLabel, value: scene.layoutCount },
      ];
      chips.forEach((chip, i) => {
        const x = MARGIN_X + i * (CHIP_W + CHIP_GAP);

        const rect = el('rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(CHIP_Y));
        rect.setAttribute('width', String(CHIP_W));
        rect.setAttribute('height', String(CHIP_H));
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', colors.bgSubtle);
        rect.setAttribute('stroke', colors.border);
        svg.appendChild(rect);

        const label = el('text');
        label.setAttribute('x', String(x + CHIP_W / 2));
        label.setAttribute('y', String(CHIP_Y + 18));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', fonts.body);
        label.setAttribute('font-size', fontSizes.xs);
        label.setAttribute('fill', colors.textMuted);
        label.textContent = chip.label;
        svg.appendChild(label);

        const value = el('text');
        value.setAttribute('x', String(x + CHIP_W / 2));
        value.setAttribute('y', String(CHIP_Y + 40));
        value.setAttribute('text-anchor', 'middle');
        value.setAttribute('font-family', fonts.mono);
        value.setAttribute('font-size', fontSizes.lg);
        value.setAttribute('fill', colors.text);
        value.textContent = String(chip.value);
        svg.appendChild(value);
      });

      const lane = el('rect');
      lane.setAttribute('x', String(MARGIN_X));
      lane.setAttribute('y', String(TRACK_Y));
      lane.setAttribute('width', String(TRACK_WIDTH));
      lane.setAttribute('height', String(TRACK_H));
      lane.setAttribute('rx', '8');
      lane.setAttribute('fill', colors.bgSubtle);
      lane.setAttribute('stroke', colors.border);
      svg.appendChild(lane);

      const layerLabel = el('text');
      layerLabel.setAttribute('x', String(MARGIN_X));
      layerLabel.setAttribute('y', String(TRACK_Y - 8));
      layerLabel.setAttribute('font-family', fonts.body);
      layerLabel.setAttribute('font-size', fontSizes.xs);
      layerLabel.setAttribute('fill', colors.textMuted);
      layerLabel.textContent = t('label.layer', 'Painted layer');
      svg.appendChild(layerLabel);

      const tickStart = el('text');
      tickStart.setAttribute('x', String(MARGIN_X + 8));
      tickStart.setAttribute('y', String(TRACK_Y + TRACK_H - 10));
      tickStart.setAttribute('font-family', fonts.mono);
      tickStart.setAttribute('font-size', fontSizes.xs);
      tickStart.setAttribute('fill', colors.textMuted);
      tickStart.textContent = '0px';
      svg.appendChild(tickStart);

      const tickEnd = el('text');
      tickEnd.setAttribute('x', String(MARGIN_X + TRACK_WIDTH - 8));
      tickEnd.setAttribute('y', String(TRACK_Y + TRACK_H - 10));
      tickEnd.setAttribute('text-anchor', 'end');
      tickEnd.setAttribute('font-family', fonts.mono);
      tickEnd.setAttribute('font-size', fontSizes.xs);
      tickEnd.setAttribute('fill', colors.textMuted);
      tickEnd.textContent = `${maxX}px`;
      svg.appendChild(tickEnd);

      const boxY = TRACK_Y + (TRACK_H - BOX_H) / 2;
      const group = el('g');
      group.setAttribute('transform', `translate(${boxVisX}, 0)`);
      const box = el('rect');
      box.setAttribute('x', '0');
      box.setAttribute('y', String(boxY));
      box.setAttribute('width', String(BOX_W));
      box.setAttribute('height', String(BOX_H));
      box.setAttribute('rx', '6');
      box.setAttribute('fill', colors.bg);
      box.setAttribute('stroke', colors.border);
      box.setAttribute('stroke-width', '2');
      group.appendChild(box);
      svg.appendChild(group);
      boxEl = group;

      const panel = el('rect');
      panel.setAttribute('x', String(MARGIN_X));
      panel.setAttribute('y', String(CODE_Y));
      panel.setAttribute('width', String(TRACK_WIDTH));
      panel.setAttribute('height', String(CODE_H));
      panel.setAttribute('rx', '6');
      panel.setAttribute('fill', colors.bgSubtle);
      panel.setAttribute('stroke', colors.border);
      svg.appendChild(panel);

      const declLabel = el('text');
      declLabel.setAttribute('x', String(MARGIN_X));
      declLabel.setAttribute('y', String(CODE_LABEL_Y));
      declLabel.setAttribute('font-family', fonts.body);
      declLabel.setAttribute('font-size', fontSizes.xs);
      declLabel.setAttribute('fill', colors.textMuted);
      declLabel.textContent = t('label.declaration', 'Declaration');
      svg.appendChild(declLabel);

      const codeEl = el('text');
      codeEl.setAttribute('x', String(MARGIN_X + 12));
      codeEl.setAttribute('y', String(CODE_Y + CODE_H / 2 + 5));
      codeEl.setAttribute('font-family', fonts.mono);
      codeEl.setAttribute('font-size', fontSizes.sm);
      codeEl.setAttribute('fill', colors.text);
      codeEl.textContent = scene.codeTemplate.replace('{x}', String(scene.x));
      svg.appendChild(codeEl);
    }

    function moveBox(x: number): void {
      boxEl?.setAttribute('transform', `translate(${x}, 0)`);
    }

    function animate(mine: number, fromX: number, toX: number): Promise<void> {
      return new Promise((resolve) => {
        let rafId: number | null = null;
        const start = Date.now();
        const finish = (): void => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            frames.delete(rafId);
          }
          waiters.delete(finish);
          resolve();
        };
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / MOVE_MS);
          moveBox(fromX + (toX - fromX) * p);
          if (p >= 1) {
            finish();
            return;
          }
          rafId = requestAnimationFrame(tick);
          frames.add(rafId);
        };
        waiters.add(finish);
        rafId = requestAnimationFrame(tick);
        frames.add(rafId);
      });
    }

    async function render(
      next: MoveWithoutRepaintScene,
      _prev: MoveWithoutRepaintScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const maxX = next.frames * next.perFramePx;
      const finalVis = visualX(next.x, maxX);
      draw(next, finalVis);
      if (!opts.animate || next.step.kind !== 'advance') return;
      const fromVis = visualX(next.step.from, maxX);
      moveBox(fromVis);
      await animate(mine, fromVis, finalVis);
      if (destroyed || mine !== gen) return;
      draw(next, finalVis);
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

    return { render, destroy };
  },
};
