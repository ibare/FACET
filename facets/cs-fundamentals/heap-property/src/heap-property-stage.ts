/**
 * heap-property-stage — "짝지어 견준다" 를 그리는 SVG 캔버스.
 *
 * 빌트인 `tree-layout` 을 쓰지 않는다. 이 조각은 두 가지가 필요한데 둘 다
 * `tree-layout` 어휘 밖이다:
 *   1. 부모→자식으로 실제로 이동하는 비교 표식 (트리의 간선을 짚어 가는 움직임).
 *   2. 트리 간선이 아닌 형제 사이의 임시 연결(견주지 않는다는 것 자체를 그려야
 *      하는데, 형제끼리는 애초에 간선이 없다) — `setEdgeState` 는 부모-자식
 *      간선만 알고 형제 쌍은 모른다.
 *
 * 값·좌표는 모두 장면의 `nodes[]` 에서 계산한다 (완전 이진트리, 배열 차례 = 힙
 * 인덱스). View 는 algorithm 의 타입을 모른다 — 아는 것은 `scene.ts` 가 선언한
 * 장면 모양뿐이다.
 *
 * ── 장면(Scene) 방식
 *
 * 걸음마다 부르는 메서드를 두지 않고 `render(next, prev, { animate })` 하나가
 * **그 장면의 화면 전체**를 세운다 (S-scene). 되돌릴 명령이 없으므로 어느 걸음으로
 * 건너뛰어도 같은 화면이 선다.
 *
 * 특히 이 조각은 **쌓인 판정이 곧 주장**이다 — 부모-자식 짝 여섯의 ✓ 와 형제 짝
 * 셋의 점선 표식이 화면에 남아야 "부모는 앞서고 형제끼리는 약속이 없다" 가 보인다.
 * 그래서 그 표식들은 반짝이고 사라지는 것이 아니라 **정적 그리기가 매번 다시
 * 세운다.** 흐름은 그 위에 얹힌 얇은 한 겹이다 — 아직 견주기 전으로 잠깐 되물렸다
 * 제자리로 돌려놓는다.
 */

import type {
  CanvasView,
  SceneRenderer,
  Theme,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { HeapPropertyScene, HeapSceneNode, HeapStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 380;
const TOP_MARGIN = 56;
const LEVEL_GAP = 108;
const SIDE_MARGIN = 40;
const NODE_R_MAX = 34;

/** 형제 짝의 호가 마디 위로 뜨는 높이. 표식도 그 꼭대기에 앉는다. */
const ARC_LIFT = 34;

const POINTER_MS = 260;
const ARC_MS = 300;
const SETTLE_MS = 260;
const CONFIRM_MS = 420;
const FRAME_MS = 16;

type LaidOutNode = HeapSceneNode & { x: number; y: number; level: number };

function layoutNodes(nodes: readonly HeapSceneNode[]): LaidOutNode[] {
  const n = nodes.length;
  const usableW = W - SIDE_MARGIN * 2;
  return nodes.map((node, i) => {
    const level = Math.floor(Math.log2(i + 1));
    const levelStart = 2 ** level - 1;
    const countAtLevel = Math.min(2 ** level, n - levelStart);
    const posInLevel = i - levelStart;
    const slot = usableW / countAtLevel;
    return {
      ...node,
      x: SIDE_MARGIN + slot * (posInLevel + 0.5),
      y: TOP_MARGIN + level * LEVEL_GAP,
      level,
    };
  });
}

function parentIndexOf(i: number): number {
  return Math.floor((i - 1) / 2);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function edgeKey(parentId: string, childId: string): string {
  return `${parentId}>${childId}`;
}

/** 표식 손잡이의 이름. 확인됨과 약속 없음은 뜻이 반대라 이름부터 가른다. */
function checkMarkKey(parentId: string, childId: string): string {
  return `check:${parentId}>${childId}`;
}
function skipMarkKey(aId: string, bId: string): string {
  return `skip:${aId}>${bId}`;
}

export const heapPropertyStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HeapPropertyScene> {
    const svg = params.canvas;
    svg.textContent = '';
    const theme: Theme | undefined = params.theme;
    const colors = getColors(theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const markLayer = el('g'); // 머무는 표식 — 정적 그리기가 매번 다시 세운다.
    const pointerLayer = el('g'); // 이동 중인 표식 — 흐름이 끝나면 거둔다.
    const captionLayer = el('g');
    svg.append(edgeLayer, nodeLayer, markLayer, pointerLayer, captionLayer);

    const captionText = el('text', {
      x: W / 2,
      y: H - 20,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    captionLayer.appendChild(captionText);

    // ── 시간 자원. destroy 에서 모두 거둔다 (S-view).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    /**
     * 기다리다 만 것을 깨우는 자리. 타이머를 거두는 것만으로는 모자란다 — 취소된
     * tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 `render` 의
     * Promise 를 기다리므로 걸음이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();
    let disposed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 마디·간선·표식은 `drawStatic` 이 매번 새로 지으므로 살아남은 옛 흐름이 쥔
     * 것은 이미 떨어져 나간 노드라 무해하다. 그러나 **흐름 끝의
     * `drawStatic(next)`** 와 재건 밖에 있는 `captionText` 는 살아 있는 화면에
     * 쓴다. 그 자리를 막는 것이 이 빗장이다 (S-scene).
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !disposed && myGen === gen;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });

    /**
     * 시간 기반 tick 애니메이션.
     *
     * 스스로 다음 회차를 예약하는 루프이므로 세대가 갈리거나 destroy 되면 멈춘다 —
     * 떨어져 나간 노드를 16ms 마다 건드리면 유한하더라도 "관찰 가능한 뒷일" 이
     * 남는다 (S-view).
     */
    const animate = (ms: number, onTick: (t: number) => void, myGen: number): Promise<void> =>
      new Promise((resolve) => {
        if (ms <= 0) {
          if (alive(myGen)) onTick(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(myGen)) {
            finish();
            return;
          }
          const t = Math.min(1, (Date.now() - start) / ms);
          onTick(t);
          if (t >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });

    // ── 정적 그리기가 다시 채우는 손잡이들. 배치는 장면의 `nodes` 에서만 나오므로
    // 여기 쥐는 것은 손잡이와 그 배치가 정한 반지름뿐이다.
    const nodeById = new Map<string, LaidOutNode>();
    const circleById = new Map<string, SVGCircleElement>();
    const textById = new Map<string, SVGTextElement>();
    const edgeByKey = new Map<string, SVGLineElement>();
    const markByKey = new Map<string, SVGGElement>();
    let confirmRing: SVGCircleElement | null = null;
    let nodeR = NODE_R_MAX;

    function paintNode(id: string, fill: string, textFill: string): void {
      const c = circleById.get(id);
      if (c) c.setAttribute('fill', fill);
      const t = textById.get(id);
      if (t) t.setAttribute('fill', textFill);
    }

    function drawCheckBadge(x: number, y: number, holds: boolean): SVGGElement {
      const tone = holds ? colors.accent : colors.danger;
      const badge = el('g', { transform: `translate(${x}, ${y})` });
      badge.appendChild(el('circle', { cx: 0, cy: 0, r: 12, fill: tone }));
      if (holds) {
        badge.appendChild(
          el('path', {
            d: 'M -6 0 L -2 5 L 7 -6',
            stroke: colors.stateInk,
            'stroke-width': 2.5,
            fill: 'none',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        );
      } else {
        badge.append(
          el('line', {
            x1: -5,
            y1: -5,
            x2: 5,
            y2: 5,
            stroke: colors.stateInk,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }),
          el('line', {
            x1: 5,
            y1: -5,
            x2: -5,
            y2: 5,
            stroke: colors.stateInk,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }),
        );
      }
      markLayer.appendChild(badge);
      return badge;
    }

    function drawSkipBadge(x: number, y: number): SVGGElement {
      const badge = el('g', { transform: `translate(${x}, ${y})` });
      badge.append(
        el('circle', {
          cx: 0,
          cy: 0,
          r: 11,
          fill: 'none',
          stroke: colors.ghostOutline,
          'stroke-width': 2,
          'stroke-dasharray': '3 3',
        }),
        el('line', {
          x1: -4,
          y1: -4,
          x2: 4,
          y2: 4,
          stroke: colors.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
        el('line', {
          x1: 4,
          y1: -4,
          x2: -4,
          y2: 4,
          stroke: colors.textMuted,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
      markLayer.appendChild(badge);
      return badge;
    }

    /** 장면이 말할 것을 문자로 만든다. 장면은 문안을 모른다 (C10). */
    function captionFor(scene: HeapPropertyScene): string {
      const c = scene.caption;
      if (!c) return '';
      switch (c.kind) {
        case 'pairCheck':
          return tr('caption.pairCheck', 'Parent {p} must come before child {c}.', {
            p: c.parentValue,
            c: c.childValue,
          });
        case 'siblingSkip':
          return tr('caption.siblingSkip', '{a} and {b} are siblings — never compared.', {
            a: c.aValue,
            b: c.bValue,
          });
        case 'confirmed':
          return tr('caption.confirmed', 'The smallest value, {v}, sits at the top.', {
            v: c.rootValue,
          });
      }
    }

    /**
     * 그 장면의 화면 **전체**를 세운다.
     *
     * 늘 비우고 다시 그린다. 되짚기가 지나온 걸음을 되밟을 필요가 없는 것이 이
     * 함수 하나 때문이다 — 쌓인 판정도, 간선의 칠도, 꼭대기의 물듦도 전부 장면이
     * 말하는 대로 여기서 다시 선다.
     */
    function drawStatic(scene: HeapPropertyScene): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      markLayer.textContent = '';
      pointerLayer.textContent = '';
      nodeById.clear();
      circleById.clear();
      textById.clear();
      edgeByKey.clear();
      markByKey.clear();
      confirmRing = null;

      const laidOut = layoutNodes(scene.nodes);
      for (const n of laidOut) nodeById.set(n.id, n);

      let deepestCount = 1;
      for (const n of laidOut) deepestCount = Math.max(deepestCount, 2 ** n.level);
      const usableW = W - SIDE_MARGIN * 2;
      nodeR = Math.max(14, Math.min(NODE_R_MAX, Math.floor(usableW / deepestCount / 2) - 6));

      // 간선 — 바탕 칠로 먼저 전부 세운다.
      for (let i = 1; i < laidOut.length; i += 1) {
        const child = laidOut[i];
        const parent = laidOut[parentIndexOf(i)];
        if (!parent || !child) continue;
        const line = el('line', {
          x1: parent.x,
          y1: parent.y,
          x2: child.x,
          y2: child.y,
          stroke: colors.border,
          'stroke-width': 2,
        });
        edgeLayer.appendChild(line);
        edgeByKey.set(edgeKey(parent.id, child.id), line);
      }

      // 마디.
      for (const n of laidOut) {
        const circle = el('circle', {
          cx: n.x,
          cy: n.y,
          r: nodeR,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 2,
        });
        const text = el('text', {
          x: n.x,
          y: n.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: colors.text,
        });
        text.textContent = String(n.value);
        nodeLayer.append(circle, text);
        circleById.set(n.id, circle);
        textById.set(n.id, text);
      }

      // 견주어 본 짝 — 간선이 물들고 가운데 판정이 앉는다. 되짚어도 살아나야 하는
      // 것이 바로 이것이다 (S-scene PREFER: 남는 강조는 정적 그리기에도).
      for (const pair of scene.checked) {
        const parent = nodeById.get(pair.parentId);
        const child = nodeById.get(pair.childId);
        if (!parent || !child) continue;
        const edge = edgeByKey.get(edgeKey(pair.parentId, pair.childId));
        if (edge) {
          edge.setAttribute('stroke', pair.holds ? colors.accent : colors.danger);
          edge.setAttribute('stroke-width', '3');
        }
        const badge = drawCheckBadge((parent.x + child.x) / 2, (parent.y + child.y) / 2, pair.holds);
        markByKey.set(checkMarkKey(pair.parentId, pair.childId), badge);
      }

      // 짚고 지나친 형제 짝 — 간선이 없으므로 칠할 것도 없다. 점선 표식만 뜬 자리에
      // 남아 "견주지 않았다" 를 말한다.
      for (const pair of scene.skipped) {
        const a = nodeById.get(pair.aId);
        const b = nodeById.get(pair.bId);
        if (!a || !b) continue;
        const badge = drawSkipBadge((a.x + b.x) / 2, Math.min(a.y, b.y) - ARC_LIFT);
        markByKey.set(skipMarkKey(pair.aId, pair.bId), badge);
      }

      // 확인된 꼭대기.
      const rootId = scene.confirmedRootId;
      if (rootId !== null) {
        const root = nodeById.get(rootId);
        if (root) {
          confirmRing = el('circle', {
            cx: root.x,
            cy: root.y,
            r: nodeR + 4,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 3,
          });
          markLayer.appendChild(confirmRing);
          paintNode(rootId, colors.itemPivot, colors.stateInk);
        }
      }

      captionText.textContent = captionFor(scene);
    }

    /** 부모→자식으로 실제로 이동하는 비교 표식. */
    async function movePointerAlongEdge(
      from: LaidOutNode,
      to: LaidOutNode,
      myGen: number,
    ): Promise<void> {
      const pointer = el('circle', { cx: from.x, cy: from.y, r: 6, fill: colors.itemComparing });
      pointerLayer.appendChild(pointer);
      await animate(
        POINTER_MS,
        (t) => {
          pointer.setAttribute('cx', String(t >= 1 ? to.x : from.x + (to.x - from.x) * t));
          pointer.setAttribute('cy', String(t >= 1 ? to.y : from.y + (to.y - from.y) * t));
        },
        myGen,
      );
      pointer.remove();
    }

    /**
     * 형제 사이엔 간선이 없다 — 위로 살짝 뜬 호를 그려 "짚어 봤지만 견주지 않는다"
     * 를 보인다. 호가 지나간 꼭대기에 점선 표식이 앉는다.
     */
    async function movePointerAlongArc(
      from: LaidOutNode,
      to: LaidOutNode,
      myGen: number,
    ): Promise<void> {
      const midX = (from.x + to.x) / 2;
      const arcY = Math.min(from.y, to.y) - ARC_LIFT;
      const pointer = el('circle', { cx: from.x, cy: from.y, r: 6, fill: colors.ghostOutline });
      pointerLayer.appendChild(pointer);
      await animate(
        ARC_MS,
        (t) => {
          const x = t >= 1 ? to.x : (1 - t) ** 2 * from.x + 2 * (1 - t) * t * midX + t ** 2 * to.x;
          const y = t >= 1 ? to.y : (1 - t) ** 2 * from.y + 2 * (1 - t) * t * arcY + t ** 2 * to.y;
          pointer.setAttribute('cx', String(x));
          pointer.setAttribute('cy', String(y));
        },
        myGen,
      );
      pointer.remove();
    }

    /**
     * 부모-자식 짝 하나를 견주는 걸음.
     *
     * 정적 그리기가 이미 판정을 세워 두었으므로 **아직 견주기 전으로 되물린 뒤**
     * 표식을 타고 가서 제자리로 돌려놓는다. 되물림과 흐름 사이에 타이머도 프레임도
     * 없어 페인트가 끼지 않는다 (프로토콜 4 절).
     */
    async function runPair(
      step: Extract<HeapStep, { kind: 'pair' }>,
      myGen: number,
    ): Promise<void> {
      const parent = nodeById.get(step.parentId);
      const child = nodeById.get(step.childId);
      if (!parent || !child) return;
      const badge = markByKey.get(checkMarkKey(step.parentId, step.childId)) ?? null;
      const edge = edgeByKey.get(edgeKey(step.parentId, step.childId)) ?? null;

      if (badge) badge.setAttribute('opacity', '0');
      if (edge) {
        edge.setAttribute('stroke', colors.border);
        edge.setAttribute('stroke-width', '2');
      }
      paintNode(parent.id, colors.itemComparing, colors.stateInk);
      paintNode(child.id, colors.itemComparing, colors.stateInk);

      await movePointerAlongEdge(parent, child, myGen);
      if (!alive(myGen)) return;

      // 속성을 되돌릴 때는 지운다 — 값을 다시 쓰면 정적으로 세운 화면과 속성 하나가
      // 달라져 되짚기 판정에서 어긋난다 (프로토콜 4 절).
      if (badge) badge.removeAttribute('opacity');
      if (edge) {
        edge.setAttribute('stroke', step.holds ? colors.accent : colors.danger);
        edge.setAttribute('stroke-width', '3');
      }
      await wait(SETTLE_MS);
    }

    /** 형제 짝 하나를 짚고 지나가는 걸음. 판정이 붙지 않는 것이 요점이다. */
    async function runSibling(
      step: Extract<HeapStep, { kind: 'sibling' }>,
      myGen: number,
    ): Promise<void> {
      const a = nodeById.get(step.aId);
      const b = nodeById.get(step.bId);
      if (!a || !b) return;
      const badge = markByKey.get(skipMarkKey(step.aId, step.bId)) ?? null;

      if (badge) badge.setAttribute('opacity', '0');
      paintNode(a.id, colors.bgSubtle, colors.textMuted);
      paintNode(b.id, colors.bgSubtle, colors.textMuted);

      await movePointerAlongArc(a, b, myGen);
      if (!alive(myGen)) return;

      if (badge) badge.removeAttribute('opacity');
      await wait(SETTLE_MS);
    }

    /** 꼭대기가 물드는 걸음. 원이 한 번 부풀었다 제 크기로 돌아온다. */
    async function runConfirm(
      step: Extract<HeapStep, { kind: 'confirm' }>,
      myGen: number,
    ): Promise<void> {
      const root = nodeById.get(step.rootId);
      const circle = circleById.get(step.rootId);
      if (!root || !circle) return;
      const ring = confirmRing;

      if (ring) ring.setAttribute('opacity', '0');
      paintNode(step.rootId, colors.itemDefault, colors.text);

      await animate(
        CONFIRM_MS,
        (t) => {
          // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 — sin(π) 가 0 이 아니라
          // 1.2e-16 이라 반지름 문자열이 정적 그리기와 갈린다 (프로토콜 4 절).
          const r = t >= 1 ? nodeR : nodeR * (1 + 0.16 * Math.sin(t * Math.PI));
          circle.setAttribute('r', String(r));
        },
        myGen,
      );
      if (!alive(myGen)) return;

      circle.setAttribute('r', String(nodeR));
      if (ring) ring.removeAttribute('opacity');
      paintNode(step.rootId, colors.itemPivot, colors.stateInk);
    }

    async function render(
      next: HeapPropertyScene,
      /** 흐를 것을 `step` 이 말하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: HeapPropertyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      drawStatic(next);

      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다.
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'pair':
          await runPair(step, myGen);
          break;
        case 'sibling':
          await runSibling(step, myGen);
          break;
        case 'confirm':
          await runConfirm(step, myGen);
          break;
      }

      // 흐름이 끝나면 그 장면을 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운
      // 화면이 속성 하나까지 같아진다 (S-scene). 옛 세대면 손대지 않고 물러난다.
      if (!alive(myGen)) return;
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        disposed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        nodeById.clear();
        circleById.clear();
        textById.clear();
        edgeByKey.clear();
        markByKey.clear();
        confirmRing = null;
        svg.textContent = '';
      },
    };
  },
};
