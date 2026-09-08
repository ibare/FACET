/**
 * recolor-then-rotate-stage — 레드-블랙 트리를 그리는 이 조각 전용 캔버스.
 *
 * 빨강/검정은 그 자체가 데이터이므로 recolor 는 실제 색 전환(fill transition)
 * 으로, rotate 는 실제 좌표 이동(transform transition)으로 그린다 — 어느 쪽도
 * opacity 페이드로 뭉개지 않는다 (S-piece MUST NOT).
 *
 * 좌표는 각 노드의 뿌리→자신 경로(L/R 비트열)만으로 정해진다
 * (`x = 좌우여백 + 가용폭 * (경로의 이진값 + 0.5) / 2^깊이`). 그래서 회전으로
 * 부모/자식 관계가 바뀌면 좌표가 같은 공식에서 저절로 다시 나오고, 그 차이만큼
 * 실제로 움직인다 — 대본을 미리 적어 재생하는 것이 아니다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Color = 'red' | 'black';

type StageNode = {
  id: string;
  value: number;
  color: Color;
  parentId: string | null;
  /** 뿌리→자신 L/R 비트열. 뿌리는 빈 문자열. */
  path: string;
  depth: number;
};

type UncleInfo =
  | { kind: 'node'; id: string; value: number; color: Color }
  | { kind: 'nil'; path: string; depth: number };

/** 이 조각이 삽입 순서상 만나는 가장 깊은 자리(3이 회전 전에 잠깐 닿는 자리) 까지. */
const MAX_DEPTH = 3;
const ROW_H = 76;
const NODE_R = 25;
const SIDE_MIN = 28;
const CAPTION_H = 28;
const TOP_PAD = 26;
const BOTTOM_PAD = 22;
const TREE_TOP = CAPTION_H + TOP_PAD;

const MOVE_MS = 320;
const COLOR_MS = 240;
const APPEAR_MS = 200;

export const STAGE_HEIGHT = TREE_TOP + MAX_DEPTH * ROW_H + NODE_R + BOTTOM_PAD;

function pathIndex(path: string): number {
  let n = 0;
  for (const ch of path) n = n * 2 + (ch === 'R' ? 1 : 0);
  return n;
}

function xOf(path: string, width: number): number {
  const usable = width - SIDE_MIN * 2;
  const slots = 2 ** path.length;
  return SIDE_MIN + (usable * (pathIndex(path) + 0.5)) / slots;
}

function yOf(depth: number): number {
  return TREE_TOP + depth * ROW_H;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const recolorThenRotateStageView: CanvasView = {
  canvas: { height: STAGE_HEIGHT },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const width = PIECE_CANVAS_W;
    const palette = getColors(params.theme);

    const captionEl = document.createElementNS(SVG_NS, 'text');
    captionEl.setAttribute('x', String(width / 2));
    captionEl.setAttribute('y', String(CAPTION_H));
    captionEl.setAttribute('text-anchor', 'middle');
    captionEl.setAttribute('font-family', fonts.body);
    captionEl.setAttribute('font-size', fontSizes.sm);
    captionEl.setAttribute('fill', palette.text);
    svg.appendChild(captionEl);

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    const markLayer = document.createElementNS(SVG_NS, 'g');
    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(markLayer);
    svg.appendChild(nodeLayer);

    type NodeEls = { g: SVGGElement; circle: SVGCircleElement; text: SVGTextElement; x: number; y: number };
    const nodeEls = new Map<string, NodeEls>();
    const edgeEls = new Map<string, SVGLineElement>();
    let marks: SVGElement[] = [];

    function fillFor(color: Color): string {
      return color === 'red' ? palette.danger : palette.primary;
    }

    /**
     * 노드 위 글자색은 타일이 무엇이냐로 갈린다 (design-tokens 의 결정표).
     *
     *   danger   두 팔레트에서 고정(#dc2626) → stateInk
     *   primary  테마를 따라 뒤집힘          → textInverse
     *
     * 검정 노드에 stateInk(#171717 고정)를 얹으면 light 에서 타일색과 같아져
     * 글자가 사라진다.
     */
    function inkFor(color: Color): string {
      return color === 'red' ? palette.stateInk : palette.textInverse;
    }

    function clearMarks(): void {
      for (const el of marks) el.remove();
      marks = [];
    }

    function drawRing(x: number, y: number): void {
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', String(x));
      ring.setAttribute('cy', String(y));
      ring.setAttribute('r', String(NODE_R + 5));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', palette.itemComparing);
      ring.setAttribute('stroke-width', '2.5');
      markLayer.appendChild(ring);
      marks.push(ring);
    }

    async function render(nodes: StageNode[]): Promise<void> {
      const seen = new Set<string>();
      const appearing: NodeEls[] = [];

      for (const n of nodes) {
        seen.add(n.id);
        const x = xOf(n.path, width);
        const y = yOf(n.depth);
        let el = nodeEls.get(n.id);
        if (!el) {
          const g = document.createElementNS(SVG_NS, 'g');
          g.setAttribute('transform', `translate(${x} ${y})`);
          g.style.opacity = '0';

          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('r', String(NODE_R));
          circle.setAttribute('fill', fillFor(n.color));
          circle.setAttribute('stroke', palette.border);
          circle.setAttribute('stroke-width', '1.5');

          const text = document.createElementNS(SVG_NS, 'text');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.setAttribute('font-family', fonts.body);
          text.setAttribute('font-size', fontSizes.sm);
          text.setAttribute('font-weight', '600');
          text.setAttribute('fill', inkFor(n.color));
          text.textContent = String(n.value);

          g.appendChild(circle);
          g.appendChild(text);
          nodeLayer.appendChild(g);
          el = { g, circle, text, x, y };
          nodeEls.set(n.id, el);
          appearing.push(el);
        } else if (el.x !== x || el.y !== y) {
          el.g.style.transition = `transform ${MOVE_MS}ms ease`;
          el.g.setAttribute('transform', `translate(${x} ${y})`);
          el.x = x;
          el.y = y;
        }

        if (n.parentId) {
          const parentEl = nodeEls.get(n.parentId);
          let line = edgeEls.get(n.id);
          if (!line) {
            line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('stroke', palette.border);
            line.setAttribute('stroke-width', '2');
            edgeLayer.appendChild(line);
            edgeEls.set(n.id, line);
          }
          line.style.transition = `x1 ${MOVE_MS}ms ease, y1 ${MOVE_MS}ms ease, x2 ${MOVE_MS}ms ease, y2 ${MOVE_MS}ms ease`;
          line.setAttribute('x2', String(x));
          line.setAttribute('y2', String(y));
          if (parentEl) {
            line.setAttribute('x1', String(parentEl.x));
            line.setAttribute('y1', String(parentEl.y));
          }
        }
      }

      if (appearing.length > 0) {
        requestAnimationFrame(() => {
          for (const el of appearing) {
            el.g.style.transition = `opacity ${APPEAR_MS}ms ease`;
            el.g.style.opacity = '1';
          }
        });
      }
      await wait(Math.max(MOVE_MS, APPEAR_MS));
    }

    async function recolor(changes: Array<{ id: string; color: Color }>): Promise<void> {
      for (const c of changes) {
        const el = nodeEls.get(c.id);
        if (!el) continue;
        el.circle.style.transition = `fill ${COLOR_MS}ms ease`;
        el.circle.setAttribute('fill', fillFor(c.color));
        // 타일이 바뀌면 잉크도 같이 바뀐다 — 빨강은 stateInk, 검정은 textInverse.
        el.text.style.transition = `fill ${COLOR_MS}ms ease`;
        el.text.setAttribute('fill', inkFor(c.color));
      }
      await wait(COLOR_MS);
    }

    function markViolation(info: { childId: string; parentId: string; uncle: UncleInfo }): void {
      clearMarks();
      for (const id of [info.childId, info.parentId]) {
        const el = nodeEls.get(id);
        if (el) drawRing(el.x, el.y);
      }
      if (info.uncle.kind === 'node') {
        const el = nodeEls.get(info.uncle.id);
        if (el) drawRing(el.x, el.y);
        return;
      }
      // 빈 자리 — 검정 취급이라는 사실을 작은 검정 사각(NIL)으로 못박아 보여준다.
      const x = xOf(info.uncle.path, width);
      const y = yOf(info.uncle.depth);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${x} ${y})`);
      const s = 15;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(-s / 2));
      rect.setAttribute('y', String(-s / 2));
      rect.setAttribute('width', String(s));
      rect.setAttribute('height', String(s));
      rect.setAttribute('fill', palette.primary);
      rect.setAttribute('stroke', palette.border);
      g.appendChild(rect);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('y', String(s + 12));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-size', fontSizes.xs);
      label.setAttribute('fill', palette.textMuted);
      label.textContent = 'NIL';
      g.appendChild(label);
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('r', String(NODE_R + 5));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', palette.itemComparing);
      ring.setAttribute('stroke-width', '2.5');
      g.appendChild(ring);
      markLayer.appendChild(g);
      marks.push(g);
    }

    function setCaption(text: string): void {
      captionEl.textContent = text;
    }

    function reset(): void {
      clearMarks();
      for (const el of nodeEls.values()) el.g.remove();
      nodeEls.clear();
      for (const line of edgeEls.values()) line.remove();
      edgeEls.clear();
      captionEl.textContent = '';
    }

    return {
      render,
      recolor,
      markViolation,
      clearMarks,
      setCaption,
      reset,
      destroy(): void {
        clearMarks();
        svg.replaceChildren();
        nodeEls.clear();
        edgeEls.clear();
      },
    };
  },
};
