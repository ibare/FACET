/**
 * 그림 — 정적 그리기(`drawStatic`)가 정본이다. 운동은 매 프레임 그 정본을 다시 세운 뒤
 * (사라진·새로 생긴 자리만 빼고) 그 위에 움직이는 겹을 얹는다.
 *
 * - 지운 가지: 이번 장면(`next`)에는 이미 없다. `prev` 에 남아 있던 모양 그대로를
 *   가져와 아래로 떨어지며 옅어지는 것으로 그린다 — "끊기고" 를 잇는 선이 즉시
 *   사라지는 것과, 노드 자체가 한 덩이로 떨어지는 것이 함께 "끊긴다" 를 말한다.
 * - 새 노드: 이번 장면에는 있지만 지난 장면에는 없다. 부모의 자리에서 시작해
 *   제 자리까지 자라나며(옮겨 가며 커지며) 나타난다 — "새로 자란다".
 * - 자리(좌표)는 `capacity`(장면에 실린, 절대 흔들리지 않는 자리 수)에서만 셈한다.
 *   지금 살아 있는 형제 수로 셈하면 무관한 이웃(footer)이 걸음마다 옆으로 밀린다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

import type { NodeState, TypeChangeRebuildScene } from './scene.js';

const H = 420;
const MARGIN = 26;
const TOP_PAD = 54;
const LEVEL_GAP = 100;
const NODE_H = 44;
const NODE_MAX_W = 132;
const MOTION_MS = 480;
const FALL_PX = 34;
const CAPTION_Y = 344;
const TALLY_Y = 376;

type Pos = { x: number; y: number; w: number };

function weight(capacity: Record<string, number>, path: string): number {
  const cap = capacity[path] ?? 0;
  if (cap === 0) return 1;
  let total = 0;
  for (let i = 0; i < cap; i += 1) total += weight(capacity, `${path}/${i}`);
  return total;
}

/** 자리(x, y, 폭)를 `capacity` 하나에서만 셈한다 — 지금 살아 있는 자식 수와 무관하다. */
function layoutTree(capacity: Record<string, number>): Record<string, Pos> {
  const pos: Record<string, Pos> = {};
  function assign(path: string, x0: number, x1: number, depth: number): void {
    const w = Math.min(NODE_MAX_W, (x1 - x0) * 0.82);
    pos[path] = { x: (x0 + x1) / 2, y: TOP_PAD + depth * LEVEL_GAP, w };
    const cap = capacity[path] ?? 0;
    if (cap === 0) return;
    const total = weight(capacity, path);
    let cursor = x0;
    for (let i = 0; i < cap; i += 1) {
      const childPath = `${path}/${i}`;
      const share = weight(capacity, childPath) / total;
      const cw = (x1 - x0) * share;
      assign(childPath, cursor, cursor + cw, depth + 1);
      cursor += cw;
    }
  }
  assign('0', MARGIN, PIECE_CANVAS_W - MARGIN, 0);
  return pos;
}

function isComparing(scene: TypeChangeRebuildScene, path: string): boolean {
  return scene.step !== null && scene.step.kind === 'compare' && scene.step.path === path;
}

export const typeChangeRebuildStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    svg.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${H}`);

    let destroyed = false;
    let gen = 0;
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
      return document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElementTagNameMap[K];
    }

    function clearSvg(): void {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    }

    /** 취소되면 곧바로 풀리고, 아니면 한 프레임씩 `tick(진행률)` 을 불러 durationMs 뒤에 풀린다. */
    function animate(durationMs: number, tick: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        let raf = 0;
        const start = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          if (raf) cancelAnimationFrame(raf);
          resolve();
        };
        waiters.add(finish);
        const frame = (now: number): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (now - start) / durationMs);
          tick(p);
          if (p >= 1) {
            finish();
            return;
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      });
    }

    function drawBackground(): void {
      const bg = el('rect');
      bg.setAttribute('x', '0');
      bg.setAttribute('y', '0');
      bg.setAttribute('width', String(PIECE_CANVAS_W));
      bg.setAttribute('height', String(H));
      bg.setAttribute('fill', colors.bg);
      svg.appendChild(bg);
    }

    function drawEdge(container: SVGElement, a: Pos, b: { x: number; y: number }, opacity = 1): void {
      const line = el('line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y + NODE_H / 2));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y - NODE_H / 2));
      line.setAttribute('stroke', colors.border);
      line.setAttribute('stroke-width', '2');
      if (opacity < 1) line.setAttribute('opacity', String(opacity));
      container.appendChild(line);
    }

    function drawNode(
      container: SVGElement,
      n: NodeState,
      p: Pos,
      opts: { comparing: boolean; forceDanger?: boolean; opacity?: number },
    ): SVGGElement {
      const g = el('g');
      if (opts.opacity !== undefined) g.setAttribute('opacity', String(Math.max(0, opts.opacity)));

      const fill = opts.forceDanger ? colors.danger : n.gen === 'orig' ? colors.itemSorted : colors.itemActive;
      const ink = opts.forceDanger ? colors.stateInk : n.gen === 'orig' ? colors.textInverse : colors.stateInk;

      const rect = el('rect');
      rect.setAttribute('x', String(p.x - p.w / 2));
      rect.setAttribute('y', String(p.y - NODE_H / 2));
      rect.setAttribute('width', String(Math.max(0, p.w)));
      rect.setAttribute('height', String(NODE_H));
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', opts.comparing ? colors.itemComparing : colors.border);
      rect.setAttribute('stroke-width', opts.comparing ? '3' : '1');
      g.appendChild(rect);

      const label = el('text');
      label.setAttribute('x', String(p.x));
      label.setAttribute('y', String(p.y - 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', ink);
      label.setAttribute('font-family', fonts.body);
      label.setAttribute('font-size', fontSizes.sm);
      label.setAttribute('font-weight', '600');
      label.textContent = n.type;
      g.appendChild(label);

      if (n.props.length > 0) {
        const propsText = el('text');
        propsText.setAttribute('x', String(p.x));
        propsText.setAttribute('y', String(p.y + 13));
        propsText.setAttribute('text-anchor', 'middle');
        propsText.setAttribute('fill', ink);
        propsText.setAttribute('font-family', fonts.mono);
        propsText.setAttribute('font-size', fontSizes.xs);
        propsText.textContent = n.props.map(([k, v]) => `${k}=${v}`).join(' ');
        g.appendChild(propsText);
      }

      if (!opts.forceDanger) {
        const tag = el('text');
        tag.setAttribute('x', String(p.x));
        tag.setAttribute('y', String(p.y + NODE_H / 2 + 14));
        tag.setAttribute('text-anchor', 'middle');
        tag.setAttribute('fill', colors.textMuted);
        tag.setAttribute('font-family', fonts.body);
        tag.setAttribute('font-size', fontSizes.xs);
        tag.textContent = n.gen === 'orig' ? t('label.kept', 'kept') : t('label.new', 'new');
        g.appendChild(tag);
      }

      container.appendChild(g);
      return g;
    }

    function captionFor(scene: TypeChangeRebuildScene): string {
      const s = scene.step;
      if (s === null) return t('caption.initial', 'Tree before the walk begins.');
      if (s.kind === 'compare') {
        if (s.same) {
          const hasChildren = (scene.capacity[s.path] ?? 0) > 0;
          return hasChildren
            ? t('caption.compareSame', 'Same slot, same type: {type}. Continue into children.', { type: s.oldType })
            : t('caption.compareSameLeaf', 'Same slot, same type: {type}. No children here.', { type: s.oldType });
        }
        return t(
          'caption.compareDiff',
          'Same slot, different type: {oldType} to {newType}. Stop — do not compare below.',
          { oldType: s.oldType, newType: s.newType },
        );
      }
      if (s.kind === 'removeBranch') {
        return t('caption.remove', 'Old {oldType} branch discarded at once. Nodes removed: {count}.', {
          oldType: s.removedTags[0] ?? '',
          count: s.removedCount,
        });
      }
      return t('caption.create', 'New node grown: {type}.', { type: s.type });
    }

    function tallyFor(scene: TypeChangeRebuildScene): string {
      return t('caption.tally', 'So far — compared: {compare}. removed: {remove}. created: {create}.', {
        compare: scene.n.compare,
        remove: scene.n.remove,
        create: scene.n.create,
      });
    }

    function drawCaptionAndTally(scene: TypeChangeRebuildScene): void {
      const caption = el('text');
      caption.setAttribute('x', String(PIECE_CANVAS_W / 2));
      caption.setAttribute('y', String(CAPTION_Y));
      caption.setAttribute('text-anchor', 'middle');
      caption.setAttribute('fill', colors.text);
      caption.setAttribute('font-family', fonts.body);
      caption.setAttribute('font-size', fontSizes.md);
      caption.textContent = captionFor(scene);
      svg.appendChild(caption);

      const tally = el('text');
      tally.setAttribute('x', String(PIECE_CANVAS_W / 2));
      tally.setAttribute('y', String(TALLY_Y));
      tally.setAttribute('text-anchor', 'middle');
      tally.setAttribute('fill', colors.textMuted);
      tally.setAttribute('font-family', fonts.body);
      tally.setAttribute('font-size', fontSizes.sm);
      tally.textContent = tallyFor(scene);
      svg.appendChild(tally);
    }

    function drawStatic(scene: TypeChangeRebuildScene, pos: Record<string, Pos>, skip?: ReadonlySet<string>): void {
      clearSvg();
      drawBackground();
      const paths = Object.keys(scene.nodes).sort();
      for (const path of paths) {
        if (path === '0' || skip?.has(path)) continue;
        const parentPath = path.slice(0, path.lastIndexOf('/'));
        if (!(parentPath in scene.nodes)) continue;
        const parentPos = pos[parentPath];
        const childPos = pos[path];
        if (!parentPos || !childPos) continue;
        drawEdge(svg, parentPos, childPos);
      }
      for (const path of paths) {
        if (skip?.has(path)) continue;
        const n = scene.nodes[path];
        const p = pos[path];
        if (!n || !p) continue;
        drawNode(svg, n, p, { comparing: isComparing(scene, path) });
      }
      drawCaptionAndTally(scene);
    }

    async function animateGrowth(scene: TypeChangeRebuildScene, pos: Record<string, Pos>, path: string): Promise<void> {
      const parentPath = path.slice(0, path.lastIndexOf('/'));
      const parentP = pos[parentPath];
      const finalP = pos[path];
      const nodeData = scene.nodes[path];
      if (!parentP || !finalP || !nodeData) return;
      const skip = new Set([path]);
      await animate(MOTION_MS, (p) => {
        drawStatic(scene, pos, skip);
        const overlay = el('g');
        svg.appendChild(overlay);
        const x = parentP.x + (finalP.x - parentP.x) * p;
        const y = parentP.y + (finalP.y - parentP.y) * p;
        const w = Math.max(6, finalP.w * p);
        drawEdge(overlay, parentP, { x, y }, p);
        drawNode(overlay, nodeData, { x, y, w }, { comparing: false });
      });
    }

    async function animateRemoval(
      scene: TypeChangeRebuildScene,
      prevNodes: Record<string, NodeState>,
      pos: Record<string, Pos>,
      removedPaths: string[],
    ): Promise<void> {
      await animate(MOTION_MS, (p) => {
        drawStatic(scene, pos);
        const overlay = el('g');
        svg.appendChild(overlay);
        const dy = FALL_PX * p;
        const opacity = 1 - p;
        for (const path of removedPaths) {
          const n = prevNodes[path];
          const base = pos[path];
          if (!n || !base) continue;
          drawNode(overlay, n, { x: base.x, y: base.y + dy, w: base.w }, { comparing: false, forceDanger: true, opacity });
        }
      });
    }

    async function render(
      next: TypeChangeRebuildScene,
      prev: TypeChangeRebuildScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const pos = layoutTree(next.capacity);
      if (destroyed) return;

      if (!opts.animate || !prev) {
        drawStatic(next, pos);
        return;
      }

      const removedPaths = Object.keys(prev.nodes).filter((p) => !(p in next.nodes));
      const createdPaths = Object.keys(next.nodes).filter((p) => !(p in prev.nodes));

      if (removedPaths.length > 0) {
        await animateRemoval(next, prev.nodes, pos, removedPaths);
      } else if (createdPaths.length > 0) {
        const created = createdPaths[0];
        if (created) await animateGrowth(next, pos, created);
      }

      if (destroyed || mine !== gen) return;
      drawStatic(next, pos);
    }

    function destroy(): void {
      destroyed = true;
      for (const wake of [...waiters]) wake();
      waiters.clear();
      clearSvg();
    }

    return { render, destroy };
  },
};
