/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이미 그려진 간선의 끝점을 옛 부모
 * 에서 뿌리로 **보간해 옮기는** 것이 "접힌다" 는 동사다. 그 view 는 구조가
 * 바뀌면 다시 그릴 뿐이라 접히는 과정이 보이지 않는다 (원칙 6 의 예외 조건).
 *
 * 경로 압축 무대 — 자리 다섯을 한 줄로 그리고, 부모를 가리키는 곡선 화살을 얹는다.
 *
 * "타고 오른다" 는 커서가 그 곡선을 따라 실제로 이동하는 것으로 표현하고,
 * "접힌다" 는 그 곡선 자체가 뿌리로 다시 붙는 것 — 좌표가 실제로 바뀌는 것으로
 * 표현한다. 둘 다 opacity 전환이 아니라 좌표 변화다 (S-piece MUST NOT).
 *
 * View 는 algorithm 의 타입을 모른다 — 이 파일이 받는 모양은 여기서 동형으로
 * 다시 선언한다 (원칙 1).
 */

import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W, radii } from '@ffacet/core/runtime';
import type { CanvasView, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

export type StageInit = { parent: number[]; query: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 기하 상수. 폭은 캔버스에서 역산하고, 여기 상수는 상한만 둔다 (S-piece).
const CELL_MAX_W = 96;
const SIDE_MIN = 26;
const BOX_TOP = 132;
const BOX_H = 56;
const CAPTION_Y = 22;
const TALLY_Y = 22;
const POINTER_Y = BOX_TOP + BOX_H + 16;
const RESULT_START_Y = 224;
const RESULT_ROW_H = 22;
const RESULT_ROWS_MAX = 4;
const SUMMARY_Y = RESULT_START_Y + RESULT_ROWS_MAX * RESULT_ROW_H + 26;
const CANVAS_H = SUMMARY_Y + 24;
const ANIM_MS = 360;
const ANIM_STEPS = 18;

type Pt = { x: number; y: number };

function centersFor(n: number, width: number): number[] {
  const cellW = Math.min(CELL_MAX_W, Math.floor((width - SIDE_MIN * 2) / n));
  const originX = Math.round((width - n * cellW) / 2);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(originX + cellW * i + cellW / 2);
  return out;
}

function boxWidthFor(n: number, width: number): number {
  const cellW = Math.min(CELL_MAX_W, Math.floor((width - SIDE_MIN * 2) / n));
  return Math.min(64, Math.round(cellW * 0.66));
}

function arcControl(x0: number, x1: number, distance: number): Pt {
  const peakY = BOX_TOP - 30 - 12 * distance;
  return { x: (x0 + x1) / 2, y: Math.max(peakY, 26) };
}

function quadPoint(t: number, p0: Pt, p1: Pt, p2: Pt): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pathD(p0: Pt, ctrl: Pt, p1: Pt): string {
  return `M ${p0.x} ${p0.y} Q ${ctrl.x} ${ctrl.y} ${p1.x} ${p1.y}`;
}

let instanceSeq = 0;

export const pathCompressionStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    // 캔버스는 러너가 이미 컨테이너에 붙였다 — 안쪽만 비운다 (S-view).
    svg.textContent = '';

    function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
      return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
    }

    const markerId = `pc-arrow-${++instanceSeq}`;
    const defs = el('defs');
    const marker = el('marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowHead = el('path');
    arrowHead.setAttribute('d', 'M0,0 L10,5 L0,10 Z');
    arrowHead.setAttribute('fill', colors.textMuted);
    marker.appendChild(arrowHead);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const edgeLayer = el('g');
    const boxLayer = el('g');
    const cursorLayer = el('g');
    svg.appendChild(edgeLayer);
    svg.appendChild(boxLayer);
    svg.appendChild(cursorLayer);

    const captionEl = el('text');
    captionEl.setAttribute('x', String(W / 2));
    captionEl.setAttribute('y', String(CAPTION_Y));
    captionEl.setAttribute('text-anchor', 'middle');
    captionEl.setAttribute('font-size', fontSizes.md);
    captionEl.setAttribute('font-family', fonts.body);
    captionEl.setAttribute('fill', colors.text);
    svg.appendChild(captionEl);

    const tallyEl = el('text');
    tallyEl.setAttribute('x', String(W - SIDE_MIN));
    tallyEl.setAttribute('y', String(TALLY_Y));
    tallyEl.setAttribute('text-anchor', 'end');
    tallyEl.setAttribute('font-size', fontSizes.sm);
    tallyEl.setAttribute('font-family', fonts.mono);
    tallyEl.setAttribute('fill', colors.textMuted);
    svg.appendChild(tallyEl);

    const resultLayer = el('g');
    svg.appendChild(resultLayer);
    const resultRows: SVGTextElement[] = [];
    for (let i = 0; i < RESULT_ROWS_MAX; i++) {
      const row = el('text');
      row.setAttribute('x', String(W / 2));
      row.setAttribute('y', String(RESULT_START_Y + i * RESULT_ROW_H));
      row.setAttribute('text-anchor', 'middle');
      row.setAttribute('font-size', fontSizes.sm);
      row.setAttribute('font-family', fonts.mono);
      row.setAttribute('fill', colors.text);
      row.setAttribute('opacity', '0');
      resultLayer.appendChild(row);
      resultRows.push(row);
    }

    const summaryEl = el('text');
    summaryEl.setAttribute('x', String(W / 2));
    summaryEl.setAttribute('y', String(SUMMARY_Y));
    summaryEl.setAttribute('text-anchor', 'middle');
    summaryEl.setAttribute('font-size', fontSizes.lg);
    summaryEl.setAttribute('font-family', fonts.body);
    summaryEl.setAttribute('font-weight', '700');
    summaryEl.setAttribute('fill', colors.text);
    summaryEl.setAttribute('opacity', '0');
    svg.appendChild(summaryEl);

    let n = 0;
    let centers: number[] = [];
    let boxW = 0;
    let root = 0;
    let parentOf: number[] = [];
    let originalParent: number[] = [];
    let hopCount = 0;
    let resultCount = 0;
    let boxRects: SVGRectElement[] = [];
    let pointerTexts: SVGTextElement[] = [];
    let edgePaths = new Map<number, SVGPathElement>();
    let cursorEl: SVGCircleElement | null = null;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 기다리다 만 것을 깨우는 자리. 타이머를 거두는 것만으로는 모자란다 — 취소된
     * tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, projector 가 그것을
     * 기다리므로 `await ctx.emit` 이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();

    /** 위 집합에 담아 두고 한 번만 부르는 resolve 를 만든다. */
    function wakeable(resolve: () => void): () => void {
      const finish = (): void => {
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      return finish;
    }

    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    }

    function pointerLabel(node: number, parent: number): string {
      return node === root ? 'root' : `→${parent}`;
    }

    function clearDiagram(): void {
      edgeLayer.textContent = '';
      boxLayer.textContent = '';
      cursorLayer.textContent = '';
      edgePaths = new Map();
      boxRects = [];
      pointerTexts = [];
      cursorEl = null;
    }

    function edgeGeometry(child: number, parent: number): { p0: Pt; ctrl: Pt; p1: Pt } {
      const p0 = { x: centers[child], y: BOX_TOP };
      const p1 = { x: centers[parent], y: BOX_TOP };
      const ctrl = arcControl(p0.x, p1.x, Math.abs(child - parent));
      return { p0, ctrl, p1 };
    }

    function drawBoxes(): void {
      for (let i = 0; i < n; i++) {
        const cx = centers[i];
        const rect = el('rect');
        rect.setAttribute('x', String(cx - boxW / 2));
        rect.setAttribute('y', String(BOX_TOP));
        rect.setAttribute('width', String(boxW));
        rect.setAttribute('height', String(BOX_H));
        rect.setAttribute('rx', radii.md.replace('px', ''));
        rect.setAttribute('fill', colors.itemDefault);
        rect.setAttribute('stroke', i === root ? colors.accent : colors.border);
        rect.setAttribute('stroke-width', i === root ? '2' : '1');
        boxLayer.appendChild(rect);
        boxRects.push(rect);

        const idx = el('text');
        idx.setAttribute('x', String(cx));
        idx.setAttribute('y', String(BOX_TOP + BOX_H / 2 + 5));
        idx.setAttribute('text-anchor', 'middle');
        idx.setAttribute('font-size', fontSizes.lg);
        idx.setAttribute('font-family', fonts.mono);
        idx.setAttribute('fill', colors.text);
        idx.textContent = String(i);
        boxLayer.appendChild(idx);

        const pointer = el('text');
        pointer.setAttribute('x', String(cx));
        pointer.setAttribute('y', String(POINTER_Y));
        pointer.setAttribute('text-anchor', 'middle');
        pointer.setAttribute('font-size', fontSizes.xs);
        pointer.setAttribute('font-family', fonts.mono);
        pointer.setAttribute('fill', colors.textMuted);
        pointer.textContent = pointerLabel(i, parentOf[i]);
        boxLayer.appendChild(pointer);
        pointerTexts.push(pointer);
      }
    }

    function drawEdges(): void {
      for (let i = 0; i < n; i++) {
        if (i === root) continue;
        const { p0, ctrl, p1 } = edgeGeometry(i, parentOf[i]);
        const path = el('path');
        path.setAttribute('d', pathD(p0, ctrl, p1));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', colors.textMuted);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('marker-end', `url(#${markerId})`);
        edgeLayer.appendChild(path);
        edgePaths.set(i, path);
      }
    }

    function ensureCursor(): SVGCircleElement {
      if (cursorEl) return cursorEl;
      const c = el('circle');
      c.setAttribute('r', '8');
      c.setAttribute('fill', colors.itemActive);
      c.setAttribute('stroke', colors.stateInk);
      c.setAttribute('stroke-width', '1.5');
      cursorLayer.appendChild(c);
      cursorEl = c;
      return c;
    }

    function pulseBoxStart(node: number): void {
      if (node === root) return;
      const rect = boxRects[node];
      rect.setAttribute('stroke', colors.accent);
      rect.setAttribute('stroke-width', '2');
      later(() => {
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '1');
      }, ANIM_MS);
    }

    function resetVisualState(data: { parent: number[]; query: number }): void {
      n = data.parent.length;
      centers = centersFor(n, W);
      boxW = boxWidthFor(n, W);
      parentOf = [...data.parent];
      originalParent = [...data.parent];
      const found = parentOf.findIndex((p, i) => p === i);
      root = found >= 0 ? found : 0;
      hopCount = 0;
      resultCount = 0;

      clearDiagram();
      drawBoxes();
      drawEdges();

      captionEl.textContent = '';
      tallyEl.textContent = '';
      for (const row of resultRows) {
        row.textContent = '';
        row.setAttribute('opacity', '0');
      }
      summaryEl.textContent = '';
      summaryEl.setAttribute('opacity', '0');
    }

    function init(data: StageInit): void {
      resetVisualState(data);
    }

    function beginQuery(node: number, caption: string): void {
      hopCount = 0;
      const cursor = ensureCursor();
      cursor.setAttribute('cx', String(centers[node]));
      cursor.setAttribute('cy', String(BOX_TOP));
      cursor.setAttribute('opacity', '1');
      captionEl.textContent = caption;
      tallyEl.textContent = t('label.hopCount', 'hop {n}', { n: hopCount });
      pulseBoxStart(node);
    }

    function climb(from: number, to: number, caption: string): Promise<void> {
      captionEl.textContent = caption;
      hopCount += 1;
      tallyEl.textContent = t('label.hopCount', 'hop {n}', { n: hopCount });
      const cursor = ensureCursor();
      const { p0, ctrl, p1 } = edgeGeometry(from, to);
      return new Promise((resolve) => {
        const finish = wakeable(resolve);
        let step = 0;
        const tick = () => {
          step += 1;
          const tt = Math.min(1, step / ANIM_STEPS);
          const pt = quadPoint(tt, p0, ctrl, p1);
          cursor.setAttribute('cx', String(pt.x));
          cursor.setAttribute('cy', String(pt.y));
          if (tt < 1) {
            later(tick, ANIM_MS / ANIM_STEPS);
          } else {
            finish();
          }
        };
        tick();
      });
    }

    function rootFound(
      _root: number,
      _queriedNode: number,
      _hops: number,
      hopsBefore: number | undefined,
      caption: string,
    ): void {
      captionEl.textContent = caption;
      if (hopsBefore !== undefined && resultCount < resultRows.length) {
        const row = resultRows[resultCount];
        row.textContent = caption;
        row.setAttribute('opacity', '1');
        resultCount += 1;
      }
    }

    function animateEdge(node: number, oldParent: number, newParent: number): Promise<void> {
      const path = edgePaths.get(node);
      if (!path) return Promise.resolve();
      const from = edgeGeometry(node, oldParent);
      const to = edgeGeometry(node, newParent);
      path.setAttribute('stroke', colors.accent);
      return new Promise((resolve) => {
        const finish = wakeable(resolve);
        let step = 0;
        const tick = () => {
          step += 1;
          const tt = Math.min(1, step / ANIM_STEPS);
          const p0 = lerpPt(from.p0, to.p0, tt);
          const ctrl = lerpPt(from.ctrl, to.ctrl, tt);
          const p1 = lerpPt(from.p1, to.p1, tt);
          path.setAttribute('d', pathD(p0, ctrl, p1));
          if (tt < 1) {
            later(tick, ANIM_MS / ANIM_STEPS);
          } else {
            path.setAttribute('stroke', colors.textMuted);
            finish();
          }
        };
        tick();
      });
    }

    function flashStatic(node: number): Promise<void> {
      const rect = boxRects[node];
      rect.setAttribute('stroke', colors.accent);
      rect.setAttribute('stroke-width', '2');
      return new Promise((resolve) => {
        const finish = wakeable(resolve);
        later(() => {
          rect.setAttribute('stroke', node === root ? colors.accent : colors.border);
          rect.setAttribute('stroke-width', node === root ? '2' : '1');
          finish();
        }, ANIM_MS);
      });
    }

    function compress(rootId: number, nodes: number[], caption: string): Promise<void> {
      captionEl.textContent = caption;
      const animations: Promise<void>[] = [];
      for (const node of nodes) {
        const prevParent = parentOf[node];
        animations.push(
          prevParent === rootId ? flashStatic(node) : animateEdge(node, prevParent, rootId),
        );
      }
      return Promise.all(animations).then(() => {
        for (const node of nodes) {
          parentOf[node] = rootId;
          pointerTexts[node].textContent = pointerLabel(node, rootId);
        }
      });
    }

    function done(_totalBefore: number, _totalAfter: number, caption: string): void {
      captionEl.textContent = caption;
      summaryEl.textContent = caption;
      summaryEl.setAttribute('opacity', '1');
      if (cursorEl) cursorEl.setAttribute('opacity', '0');
    }

    function rewind(caption: string): void {
      resetVisualState({ parent: originalParent, query: 0 });
      captionEl.textContent = caption;
    }

    function destroy(): void {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return {
      init,
      beginQuery,
      climb,
      rootFound,
      compress,
      done,
      rewind,
      destroy,
    };
  },
};
