/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 꼭대기를 빼내 옆으로 물리고, 맨 끝
 * 값이 대각선으로 올라오고, 두 노드가 자리를 맞바꾸며 내려가는 세 운동이 모두
 * 좌표 이동이다. 그 view 는 상태 색만 바꿀 뿐 이동 어휘가 없다
 * (원칙 6 의 예외 조건).
 *
 * sift-down-stage — 최소 힙을 트리로 그리고, 꼭대기 추출 → 맨 끝 값 승격 →
 * 두 자식 중 더 작은 쪽과 맞바꾸며 내려가는 하향 재배치를 보인다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 그 다음에 방금 달라진 것만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 없고, 되짚기가 앞으로 가기와 같은 길을 탄다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값은 이미 끝 자리에 서 있고,
 * 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는 장면의
 * `step` 이 실어 온 자리 번호에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 *
 * 화면 문자는 캡션뿐이고 전부 `params.t` 로 만든다 — 문안은 `facet.ts` 의
 * `messages` 에 있다 (C10). 마디에 적힌 값은 숫자 표식이라 문안이 아니다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { SiftDownCaption, SiftDownScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const W = PIECE_CANVAS_W;
const H = 340;
const TOP_Y = 54;
const LEVEL_H = 92;
const SIDE_MARGIN_MIN = 34;
const NODE_R_MAX = 28;
const EXTRACT_X = W - SIDE_MARGIN_MIN - 6;
const EXTRACT_Y = 24;
const EXTRACT_R = 18;
/** 나무 밖으로 물린 값이 뒤로 물러나는 정도. */
const ASIDE_OPACITY = 0.55;
const CAPTION_Y = H - 24;
const MOVE_MS = 420;
const PULSE_MS = 340;
/** 마디 테두리 — 기본 / 견준 짝 / 고른 쪽. */
const STROKE_PLAIN = 2;
const STROKE_COMPARED = 3.5;
const STROKE_WINNER = 5;
/** 견주는 순간 테두리가 잠깐 부푸는 폭. */
const RING_SWELL = 3;
/** 멈추는 순간 마디가 잠깐 커지는 비율. */
const SETTLE_SWELL = 0.12;
/** 내려간 변이 굵어지는 정도. */
const EDGE_PLAIN = 2;
const EDGE_TAKEN = 5;

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** 마디 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type NodeEl = { g: SVGGElement; circle: SVGCircleElement; text: SVGTextElement };

export const siftDownStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SiftDownScene> {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // ── 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 다시 짓는다.
    const edgesLayer = el('g', {});
    const nodesLayer = el('g', {});
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.append(edgesLayer, nodesLayer, captionText);

    // ── 기하 — 완전이진트리 좌표. 자식 자리 인덱스 산식(2i+1, 2i+2) 그대로
    //    "잎 자리 개수" 를 기준으로 등간격 배치해 부모가 두 자식의 가운데 오게
    //    한다. 장면의 `origin` 길이가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    let maxDepth = 0;
    let unit = 0;
    let nodeR = NODE_R_MAX;

    function layout(n0: number): void {
      maxDepth = n0 <= 1 ? 0 : Math.floor(Math.log2(n0));
      const leafSlots = 2 ** maxDepth;
      const usableW = W - SIDE_MARGIN_MIN * 2;
      unit = usableW / leafSlots;
      nodeR = Math.max(10, Math.min(NODE_R_MAX, Math.floor(unit / 2) - 8));
    }

    function depthOf(i: number): number {
      return Math.floor(Math.log2(i + 1));
    }
    function nodeCenterX(i: number): number {
      const depth = depthOf(i);
      const posInLevel = i - (2 ** depth - 1);
      const span = 2 ** (maxDepth - depth);
      const leafUnits = posInLevel * span + span / 2;
      return SIDE_MARGIN_MIN + leafUnits * unit;
    }
    function nodeCenterY(i: number): number {
      return TOP_Y + depthOf(i) * LEVEL_H;
    }
    /** 옆으로 물린 값은 같은 마디를 줄여 세운다 — 반지름도 글자도 함께 작아진다. */
    function asideScale(): number {
      return EXTRACT_R / nodeR;
    }

    // ── 이번 장면이 세운 DOM 손잡이.
    let nodeEls = new Map<number, NodeEl>();
    let edgeEls = new Map<number, SVGLineElement>(); // key: 자식 자리 인덱스
    let asideEl: NodeEl | null = null;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 마디를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로 다시
    // 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미 새로
    // 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고,
    // 운동은 `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다. */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    function place(node: NodeEl, x: number, y: number, scale: number): void {
      node.g.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
    }

    /** 값 하나를 담은 마디. 자리와 크기는 부르는 쪽이 정한다. */
    function makeNode(value: number): NodeEl {
      const g = el('g', {});
      const circle = el('circle', {
        r: nodeR,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': STROKE_PLAIN,
      });
      const text = el('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: c.text,
      });
      // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
      text.textContent = String(value);
      g.append(circle, text);
      nodesLayer.appendChild(g);
      return { g, circle, text };
    }

    // ── 장면이 정하는 칠. 채움은 **값의 형편**, 테두리는 **견줌의 표식**이다.
    //    둘을 갈라 두어야 맞바꾼 뒤에도 "누구와 견주어 누구를 골랐는지" 가 남는다.

    function strokeFor(s: SiftDownScene, i: number): { color: string; width: number } {
      const cmp = s.compared;
      if (cmp !== null && i === cmp.winner) return { color: c.itemPivot, width: STROKE_WINNER };
      if (cmp !== null && (i === cmp.left || i === cmp.right)) {
        return { color: c.itemComparing, width: STROKE_COMPARED };
      }
      return { color: c.border, width: STROKE_PLAIN };
    }

    function paintNode(node: NodeEl, s: SiftDownScene, i: number): void {
      if (s.settled === i) {
        node.circle.setAttribute('fill', c.itemSorted);
        node.text.setAttribute('fill', c.textInverse);
      } else if (s.sinking === i) {
        node.circle.setAttribute('fill', c.itemComparing);
        node.text.setAttribute('fill', c.stateInk);
      } else {
        node.circle.setAttribute('fill', c.itemDefault);
        node.text.setAttribute('fill', c.text);
      }
      const stroke = strokeFor(s, i);
      node.circle.setAttribute('stroke', stroke.color);
      node.circle.setAttribute('stroke-width', String(stroke.width));
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      edgesLayer.replaceChildren();
      nodesLayer.replaceChildren();
      nodeEls = new Map();
      edgeEls = new Map();
      asideEl = null;
      captionText.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 변 · 빈 자리 · 마디 · 옆으로 물린 값 · 견줌의 표식이 모두 여기서 난다. 남는
     * 강조(견준 짝 · 고른 쪽 · 멈춘 자리)를 여기 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(s: SiftDownScene): void {
      layout(Math.max(1, s.origin.length));

      // 변 — 나무에 남은 자리까지만. 맨 끝 자리가 빠지면 그 변도 함께 없어진다.
      for (let i = 0; i < s.size; i += 1) {
        for (const child of [2 * i + 1, 2 * i + 2]) {
          if (child >= s.size) continue;
          const taken = s.compared !== null && s.compared.moved && s.compared.winner === child;
          const line = el('line', {
            x1: nodeCenterX(i),
            y1: nodeCenterY(i),
            x2: nodeCenterX(child),
            y2: nodeCenterY(child),
            stroke: taken ? c.itemPivot : c.border,
            'stroke-width': taken ? EDGE_TAKEN : EDGE_PLAIN,
          });
          edgesLayer.appendChild(line);
          edgeEls.set(child, line);
        }
      }

      // 자리 — 값이 있으면 마디, 없으면 점선 자국.
      for (let i = 0; i < s.size; i += 1) {
        const value = s.values[i];
        if (typeof value !== 'number') {
          nodesLayer.appendChild(
            el('circle', {
              cx: nodeCenterX(i),
              cy: nodeCenterY(i),
              r: nodeR,
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': STROKE_PLAIN,
              'stroke-dasharray': '4 4',
            }),
          );
          continue;
        }
        const node = makeNode(value);
        place(node, nodeCenterX(i), nodeCenterY(i), 1);
        paintNode(node, s, i);
        nodeEls.set(i, node);
      }

      // 나무 밖으로 물린 값. 같은 마디를 줄여 옆에 세운다.
      if (s.aside !== null) {
        const node = makeNode(s.aside);
        place(node, EXTRACT_X, EXTRACT_Y, asideScale());
        node.g.setAttribute('opacity', String(ASIDE_OPACITY));
        asideEl = node;
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: SiftDownCaption | null): void {
      if (cap === null) {
        captionText.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'extract':
          captionText.textContent = tr('caption.extract', 'Remove the top value {v}', {
            v: cap.value,
          });
          return;
        case 'fill':
          captionText.textContent = tr(
            'caption.fill',
            'Move the last value {v} into the empty top',
            { v: cap.value },
          );
          return;
        case 'compareTwo':
          captionText.textContent = tr(
            'caption.compareTwo',
            'Compare children {l} and {r} — {w} is smaller',
            { l: cap.leftValue, r: cap.rightValue, w: cap.winnerValue },
          );
          return;
        case 'compareOne':
          captionText.textContent = tr('caption.compareOne', 'Only one child, {l} — compare with it', {
            l: cap.leftValue,
          });
          return;
        case 'swap':
          captionText.textContent = tr('caption.swap', 'Swap places and sink down', {});
          return;
        case 'settle':
          captionText.textContent = tr(
            'caption.settle',
            'Smaller than both children (or none left) — stop here',
            {},
          );
          return;
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 `step` 이 실어 온 자리
    //    번호에서 셈한다 — `prev` 에서 꺼내지 않는다 (S-scene).

    /** 값 여럿이 한 걸음에 자리를 바꾼다. 한 뜻의 운동이므로 **한 시계**로 돌린다. */
    function slide(moves: readonly { at: number; from: number }[], mine: number): Promise<void> {
      const live: { node: NodeEl; x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const m of moves) {
        const node = nodeEls.get(m.at);
        if (!node) continue;
        live.push({
          node,
          x0: nodeCenterX(m.from),
          y0: nodeCenterY(m.from),
          x1: nodeCenterX(m.at),
          y1: nodeCenterY(m.at),
        });
      }
      if (live.length === 0) return Promise.resolve();
      return animate(MOVE_MS, mine, (p) => {
        for (const m of live) {
          place(m.node, m.x0 + (m.x1 - m.x0) * p, m.y0 + (m.y1 - m.y0) * p, 1);
        }
      });
    }

    /** 꼭대기 값이 나무를 떠나 옆으로 물린다 — 자리를 옮기며 함께 줄어든다. */
    function leave(from: number, mine: number): Promise<void> {
      const node = asideEl;
      if (node === null) return Promise.resolve();
      const x0 = nodeCenterX(from);
      const y0 = nodeCenterY(from);
      const k = asideScale();
      return animate(MOVE_MS, mine, (p) => {
        place(node, x0 + (EXTRACT_X - x0) * p, y0 + (EXTRACT_Y - y0) * p, 1 + (k - 1) * p);
        node.g.setAttribute('opacity', String(1 - (1 - ASIDE_OPACITY) * p));
      });
    }

    /** 견주는 순간 — 두 자식의 테두리가 잠깐 부풀었다 제 굵기로 돌아온다. */
    function weigh(
      s: SiftDownScene,
      pair: readonly (number | null)[],
      mine: number,
    ): Promise<void> {
      const marks: { circle: SVGCircleElement; width: number }[] = [];
      for (const i of pair) {
        if (i === null) continue;
        const node = nodeEls.get(i);
        if (!node) continue;
        // 제 굵기는 장면에서 셈한다 — 화면을 도로 읽으면 되짚은 직후 값이 갈린다.
        marks.push({ circle: node.circle, width: strokeFor(s, i).width });
      }
      if (marks.length === 0) return Promise.resolve();
      return animate(PULSE_MS, mine, (p) => {
        const swell = Math.sin(p * Math.PI) * RING_SWELL;
        for (const m of marks) m.circle.setAttribute('stroke-width', String(m.width + swell));
      });
    }

    /** 멈추는 순간 — 그 마디가 잠깐 커졌다 돌아온다. */
    function rest(index: number, mine: number): Promise<void> {
      const node = nodeEls.get(index);
      if (!node) return Promise.resolve();
      const x = nodeCenterX(index);
      const y = nodeCenterY(index);
      return animate(PULSE_MS, mine, (p) => {
        place(node, x, y, 1 + Math.sin(p * Math.PI) * SETTLE_SWELL);
      });
    }

    function flow(s: SiftDownScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'extract':
          return leave(step.from, mine);
        case 'fill':
          return slide([{ at: step.to, from: step.from }], mine);
        case 'compare':
          return weigh(s, [step.left, step.right], mine);
        case 'swap':
          // 두 값이 서로의 자리로 간다. 한 걸음에 둘이 움직이지만 한 뜻이라
          // 시계를 둘로 나누지 않는다 (S-scene).
          return slide(
            [
              { at: step.a, from: step.b },
              { at: step.b, from: step.a },
            ],
            mine,
          );
        case 'settle':
          return rest(step.index, mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성이 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 자리
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: SiftDownScene,
      _prev: SiftDownScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
      },
    };
  },
};
