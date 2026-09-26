import type { CanvasView, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { SideBySideTreesScene } from './scene.js';
import type { TreeNode } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 자리 셈 (좌표는 여기서만 정한다) ─────────────────────────────────────────
const MARGIN_X = 24;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 16;
const CAPTION_LINE_H = 20;
const CAPTION_GAP = 12;
const CAPTION_H = CAPTION_LINE_H * 2 + CAPTION_GAP;
const BAND_LABEL_H = 18;
const ROW_H = 42;
const ROWS = 3; // 이 조각의 데이터는 깊이 0·1·2 고정 (div → header/footer → img/b/button)
const BAND_TREE_H = ROW_H * ROWS;
const BAND_H = BAND_LABEL_H + BAND_TREE_H;
const BAND_GAP = 16;
const BOX_W_MAX = 140;
const BOX_H = 30;
const ANIM_MS = 400;

const H = MARGIN_TOP + CAPTION_H + BAND_H * 3 + BAND_GAP * 2 + MARGIN_BOTTOM;

function bandTop(bandIndex: number): number {
  return MARGIN_TOP + CAPTION_H + bandIndex * (BAND_H + BAND_GAP);
}

function nodeYPixel(bandIndex: number, depth: number): number {
  return bandTop(bandIndex) + BAND_LABEL_H + depth * ROW_H + ROW_H / 2;
}

type Pos = { x: number; depth: number };
type Layout = { positions: Map<string, Pos>; leafCount: number };

function computeLayout(root: TreeNode): Layout {
  const positions = new Map<string, Pos>();
  let nextLeafX = 0;

  function visit(node: TreeNode, path: string, depth: number): number {
    if (node.children.length === 0) {
      const x = nextLeafX;
      nextLeafX += 1;
      positions.set(path, { x, depth });
      return x;
    }
    const childXs = node.children.map((c, i) => visit(c, `${path}/${i}`, depth + 1));
    const x = childXs.reduce((a, b) => a + b, 0) / childXs.length;
    positions.set(path, { x, depth });
    return x;
  }

  visit(root, '0', 0);
  return { positions, leafCount: Math.max(1, nextLeafX) };
}

function slotWidth(leafCount: number): number {
  return (PIECE_CANVAS_W - MARGIN_X * 2) / leafCount;
}

function nodeXPixel(xUnit: number, leafCount: number): number {
  return MARGIN_X + (xUnit + 0.5) * slotWidth(leafCount);
}

function boxWidth(leafCount: number): number {
  return Math.min(BOX_W_MAX, slotWidth(leafCount) - 16);
}

function lookupPos(layout: Layout, path: string): Pos {
  const pos = layout.positions.get(path);
  if (!pos) throw new Error(`side-by-side-trees: 자리 '${path}' 의 좌표가 없다`);
  return pos;
}

function nodeCenter(layout: Layout, bandIndex: number, path: string): { cx: number; cy: number; boxW: number } {
  const pos = lookupPos(layout, path);
  return {
    cx: nodeXPixel(pos.x, layout.leafCount),
    cy: nodeYPixel(bandIndex, pos.depth),
    boxW: boxWidth(layout.leafCount),
  };
}

// ── SVG 헬퍼 ─────────────────────────────────────────────────────────────
function svgGroup(): SVGGElement {
  return document.createElementNS(SVG_NS, 'g');
}

function svgRect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('rx', '6');
  el.setAttribute('fill', fill);
  if (stroke) {
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', '1.5');
  }
  return el;
}

function svgCursorRect(x: number, y: number, w: number, h: number, stroke: string): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('rx', '9');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', '3');
  el.setAttribute('data-role', 'cursor');
  return el;
}

function svgLine(x1: number, y1: number, x2: number, y2: number, stroke: string): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', '1.5');
  return el;
}

function svgText(
  x: number,
  y: number,
  content: string,
  opts: { anchor?: 'start' | 'middle'; size: string; fill: string; family: string; weight?: string },
): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', opts.anchor ?? 'start');
  el.setAttribute('font-size', opts.size);
  el.setAttribute('font-family', opts.family);
  el.setAttribute('fill', opts.fill);
  if (opts.weight) el.setAttribute('font-weight', opts.weight);
  el.textContent = content;
  return el;
}

// ── 마운트 ─────────────────────────────────────────────────────────────
export const sideBySideTreesStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${H}`);
    canvas.setAttribute('preserveAspectRatio', 'xMidYMin meet');

    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function tween(durationMs: number, onFrame: (progress: number) => void, mine: number): Promise<void> {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        function frame(now: number): void {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const progress = Math.min(1, (now - start) / durationMs);
          onFrame(progress);
          if (progress < 1) {
            const id = requestAnimationFrame(frame);
            frames.add(id);
          } else {
            finish();
          }
        }
        const id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function drawBandLabel(parent: SVGGElement, bandIndex: number, label: string): void {
      const top = bandTop(bandIndex);
      parent.appendChild(
        svgText(MARGIN_X, top + 13, label, {
          anchor: 'start',
          size: fontSizes.xs,
          fill: colors.textMuted,
          family: fonts.body,
          weight: '600',
        }),
      );
    }

    function drawNode(
      parent: SVGGElement,
      tree: TreeNode,
      path: string,
      bandIndex: number,
      layout: Layout,
      scene: SideBySideTreesScene,
    ): void {
      const { cx, cy, boxW } = nodeCenter(layout, bandIndex, path);

      for (let i = 0; i < tree.children.length; i += 1) {
        const childCenter = nodeCenter(layout, bandIndex, `${path}/${i}`);
        parent.appendChild(svgLine(cx, cy + BOX_H / 2, childCenter.cx, childCenter.cy - BOX_H / 2, colors.border));
      }

      parent.appendChild(svgRect(cx - boxW / 2, cy - BOX_H / 2, boxW, BOX_H, colors.bgSubtle, colors.border));

      const isCurrent = scene.current !== null && scene.current.path === path;
      if (isCurrent) {
        const isPatch = scene.current!.changes.length > 0;
        const ring = isPatch ? colors.itemSwapping : colors.itemComparing;
        parent.appendChild(svgCursorRect(cx - boxW / 2 - 4, cy - BOX_H / 2 - 4, boxW + 8, BOX_H + 8, ring));
      }

      const propsText = tree.props.map(([k, v]) => `${k}=${v}`).join(' ');
      if (propsText) {
        parent.appendChild(
          svgText(cx, cy - 4, tree.type, {
            anchor: 'middle',
            size: fontSizes.sm,
            fill: colors.text,
            family: fonts.mono,
            weight: '600',
          }),
        );
        parent.appendChild(
          svgText(cx, cy + 10, propsText, {
            anchor: 'middle',
            size: fontSizes.xs,
            fill: colors.textMuted,
            family: fonts.mono,
          }),
        );
      } else {
        parent.appendChild(
          svgText(cx, cy + 4, tree.type, {
            anchor: 'middle',
            size: fontSizes.sm,
            fill: colors.text,
            family: fonts.mono,
            weight: '600',
          }),
        );
      }

      for (let i = 0; i < tree.children.length; i += 1) {
        drawNode(parent, tree.children[i]!, `${path}/${i}`, bandIndex, layout, scene);
      }
    }

    function drawCaptions(parent: SVGGElement, scene: SideBySideTreesScene): void {
      const mainY = MARGIN_TOP + 14;
      const tallyY = mainY + CAPTION_LINE_H + CAPTION_GAP - 6;

      let mainText: string;
      const current = scene.current;
      if (!current) {
        mainText = t(
          'caption.start',
          'Two virtual trees and one real tree — still the same shape.',
        );
      } else if (current.changes.length === 0) {
        mainText = t('caption.same', "'{tag}' matches — moving on.", { tag: current.nodeType });
      } else if (current.changes.length === 1) {
        const c = current.changes[0]!;
        mainText = t(
          'caption.patchOne',
          "'{tag}': '{prop}' written to the real node ({from} → {to}).",
          { tag: current.nodeType, prop: c.prop, from: c.from, to: c.to },
        );
      } else {
        mainText = t(
          'caption.patchMany',
          "'{tag}' — attributes written to the real node: {count}.",
          { tag: current.nodeType, count: current.changes.length },
        );
      }
      parent.appendChild(
        svgText(MARGIN_X, mainY, mainText, {
          anchor: 'start',
          size: fontSizes.md,
          fill: colors.text,
          family: fonts.body,
        }),
      );

      const tallyText = t(
        'caption.tally',
        'Compared {compared} of {total} · patched {patched}.',
        { compared: scene.compared, total: scene.totalPairs, patched: scene.patched },
      );
      parent.appendChild(
        svgText(MARGIN_X, tallyY, tallyText, {
          anchor: 'start',
          size: fontSizes.sm,
          fill: colors.textMuted,
          family: fonts.body,
        }),
      );
    }

    function drawStatic(scene: SideBySideTreesScene, layout: Layout): void {
      canvas.textContent = '';

      const captionLayer = svgGroup();
      canvas.appendChild(captionLayer);
      drawCaptions(captionLayer, scene);

      const bandsLayer = svgGroup();
      canvas.appendChild(bandsLayer);

      drawBandLabel(bandsLayer, 0, t('label.old', 'Old virtual tree'));
      drawNode(bandsLayer, scene.oldTree, '0', 0, layout, scene);

      drawBandLabel(bandsLayer, 1, t('label.new', 'New virtual tree'));
      drawNode(bandsLayer, scene.newTree, '0', 1, layout, scene);

      drawBandLabel(bandsLayer, 2, t('label.real', 'Real tree'));
      drawNode(bandsLayer, scene.realTree, '0', 2, layout, scene);
    }

    async function animateStep(
      next: SideBySideTreesScene,
      prev: SideBySideTreesScene | null,
      layout: Layout,
      mine: number,
    ): Promise<void> {
      const nextCurrent = next.current;
      if (!nextCurrent) return;

      const motionLayer = svgGroup();
      canvas.appendChild(motionLayer);
      const tasks: Promise<void>[] = [];

      const prevCurrent = prev?.current ?? null;
      if (prevCurrent && prevCurrent.path !== nextCurrent.path) {
        // 걸음이 옮겨갔다 — 짚은 자리를 옛/새/실제 세 트리에서 함께 숨기고
        // 겉면에 유령 표지를 두어 옛 자리에서 새 자리로 흐르게 한다.
        for (const el of Array.from(canvas.querySelectorAll('[data-role="cursor"]'))) {
          el.setAttribute('opacity', '0');
        }
        const isPatch = nextCurrent.changes.length > 0;
        const ring = isPatch ? colors.itemSwapping : colors.itemComparing;
        const ghosts: SVGRectElement[] = [];
        for (let bandIndex = 0; bandIndex < 3; bandIndex += 1) {
          const from = nodeCenter(layout, bandIndex, prevCurrent.path);
          const to = nodeCenter(layout, bandIndex, nextCurrent.path);
          const ghost = svgCursorRect(from.cx - from.boxW / 2 - 4, from.cy - BOX_H / 2 - 4, from.boxW + 8, BOX_H + 8, ring);
          ghost.removeAttribute('data-role');
          motionLayer.appendChild(ghost);
          ghosts.push(ghost);
          tasks.push(
            tween(
              ANIM_MS,
              (p) => {
                const cx = from.cx + (to.cx - from.cx) * p;
                const cy = from.cy + (to.cy - from.cy) * p;
                const boxW = from.boxW + (to.boxW - from.boxW) * p;
                ghost.setAttribute('x', String(cx - boxW / 2 - 4));
                ghost.setAttribute('y', String(cy - BOX_H / 2 - 4));
                ghost.setAttribute('width', String(boxW + 8));
              },
              mine,
            ),
          );
        }
      }

      if (nextCurrent.changes.length > 0) {
        for (const change of nextCurrent.changes) {
          const from = nodeCenter(layout, 1, nextCurrent.path);
          const to = nodeCenter(layout, 2, nextCurrent.path);
          const chipW = 44;
          const chipH = 18;
          const chip = svgGroup();
          const chipRect = svgRect(from.cx - chipW / 2, from.cy - chipH / 2, chipW, chipH, colors.itemSwapping);
          const chipText = svgText(from.cx, from.cy + 4, change.to, {
            anchor: 'middle',
            size: fontSizes.xs,
            fill: colors.stateInk,
            family: fonts.mono,
            weight: '600',
          });
          chip.appendChild(chipRect);
          chip.appendChild(chipText);
          motionLayer.appendChild(chip);
          tasks.push(
            tween(
              ANIM_MS,
              (p) => {
                const cx = from.cx + (to.cx - from.cx) * p;
                const cy = from.cy + (to.cy - from.cy) * p;
                chipRect.setAttribute('x', String(cx - chipW / 2));
                chipRect.setAttribute('y', String(cy - chipH / 2));
                chipText.setAttribute('x', String(cx));
                chipText.setAttribute('y', String(cy + 4));
              },
              mine,
            ),
          );
        }
      }

      if (tasks.length === 0) {
        canvas.removeChild(motionLayer);
        return;
      }
      await Promise.all(tasks);
      if (mine === gen && !destroyed && motionLayer.parentNode === canvas) {
        canvas.removeChild(motionLayer);
      }
    }

    function render(
      next: SideBySideTreesScene,
      prev: SideBySideTreesScene | null,
      opts: { animate: boolean },
    ): void | Promise<void> {
      if (destroyed) return;
      const layout = computeLayout(next.oldTree);
      drawStatic(next, layout);
      if (!opts.animate) return;
      const mine = (gen += 1);
      return animateStep(next, prev, layout, mine).then(() => {
        if (mine === gen && !destroyed) drawStatic(next, layout);
      });
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      canvas.textContent = '';
    }

    return { render, destroy };
  },
};
