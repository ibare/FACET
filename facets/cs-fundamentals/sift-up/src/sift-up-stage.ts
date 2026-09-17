/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각의 동사는 두 노드가 자리를
 * 맞바꾸며 한 칸 오르는 것이다. 그 view 에는 노드 둘의 위치를 맞교환하는
 * 어휘가 없고, 상태를 바꾸면 즉시 다시 그려 이동이 보이지 않는다
 * (원칙 6 의 예외 조건).
 *
 * sift-up-stage — 상향 재배치 조각의 전용 SVG 캔버스.
 *
 * 최소 힙을 트리로 그린다. 새 값이 맨 끝자리에 나타나고, 부모와 견주어 앞서면
 * 그 두 원이 실제로 자리를 맞바꾸며 (위/아래로 옮겨가며) 오른다. 더 앞서지
 * 못하는 부모를 만나면 거기서 멈추고, 멈춘 자리가 색으로 표시된다 — 꼭대기까지
 * 가는 것이 아니라 멈추는 지점이 요점이다 (S-piece).
 *
 * 좌표는 완전 이진 트리의 인덱스 규칙 (i 의 부모는 ⌊(i-1)/2⌋) 을 그대로 화면
 * 격자에 옮긴 것이다 — 깊이 d 는 2^d 개의 균등한 칸으로 나뉘고, 이 나눔을
 * 재귀적으로 반씩 쪼갠 것과 수학적으로 같아 부모 자리 바로 아래 자식이 온다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * 어느 칸에 어느 값이 앉았는지 · 오르는 값이 어느 것인지 · 어디서 멈췄는지는 전부
 * 장면이 말한다 (`scene.ts`). 여기서는 그것을 자리로 옮겨 그릴 뿐이다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 원들은 이미 끝 자리에 서 있고,
 * 맞바꾸는 운동은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 그 출발 그림은
 * `prev` 가 아니라 `step` 이 말해 준다 — 지금 부모 칸에 선 값은 자식 칸에서
 * 올라온 것이고, 지금 자식 칸에 선 값은 부모 칸에서 내려온 것이다 (S-scene).
 *
 * 색은 design-tokens 만 쓴다 (S-view).
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { SiftUpCaption, SiftUpScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE_MARGIN = 26;
const TOP_Y = 44;
const ROW_H = 78;
const RADIUS = 22;
const CAPTION_GAP = 40;
const CAPTION_H = 28;
/** 이 조각의 데이터가 채우는 깊이 (0~3) — 일곱 칸 + 삽입 한 칸 고정. */
const DEPTH_COUNT = 4;
/** 두 원이 자리를 맞바꾸는 데 걸리는 시간. */
const SWAP_MS = 520;
/** 새 값이 맨 끝자리에 자라 나오는 시간. */
const ENTER_MS = 240;

export const SIFT_UP_STAGE_HEIGHT =
  TOP_Y + (DEPTH_COUNT - 1) * ROW_H + RADIUS + CAPTION_GAP + CAPTION_H;

function depthOf(index: number): number {
  return Math.floor(Math.log2(index + 1));
}

function parentOf(index: number): number {
  return Math.floor((index - 1) / 2);
}

function slotInfo(index: number): { depth: number; slot: number; slotsAtDepth: number } {
  const depth = depthOf(index);
  const slotsAtDepth = 2 ** depth;
  return { depth, slot: index - (slotsAtDepth - 1), slotsAtDepth };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type NodeVisual = {
  group: SVGGElement;
  circle: SVGCircleElement;
  text: SVGTextElement;
};

/**
 * 원 하나가 지금 무엇으로 짚여 있나.
 *
 * 전부 장면에서 셈한다 — 예전에는 이 역할이 원의 `fill` 속성에만 있어, 되감으면
 * "오르는 값은 이것" 과 "여기서 멈췄다" 가 함께 사라졌다.
 */
type NodeRole = 'default' | 'active' | 'comparing' | 'swapping' | 'settled';

export const siftUpStageView: CanvasView = {
  canvas: { height: SIFT_UP_STAGE_HEIGHT },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SiftUpScene> {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    const svg = params.canvas;
    svg.textContent = '';

    const palette: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const usableW = PIECE_CANVAS_W - SIDE_MARGIN * 2;

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('x', String(PIECE_CANVAS_W / 2));
    captionText.setAttribute(
      'y',
      String(TOP_Y + (DEPTH_COUNT - 1) * ROW_H + RADIUS + CAPTION_GAP),
    );
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.md);
    captionText.setAttribute('fill', palette.text);
    svg.appendChild(captionText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 운동이 끝난 뒤 장면을 통째로 다시 세우는 길이 있어 (`render` 끝의 `drawStatic`)
     * **살아 있는 화면에 쓰는 손**이 남는다. 되짚기가 그 사이에 끼어들면 옛 세대의
     * 마무리가 새로 선 화면을 덮으므로, `await` 를 지난 뒤에는 자기 세대를 확인하고
     * 아니면 화면에 손대지 않고 물러난다 (S-scene).
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed) {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const start = performance.now();
        let id = 0;
        const frame = (now: number): void => {
          frames.delete(id);
          const raw = Math.min(1, (now - start) / durationMs);
          onFrame(raw);
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    // ── 자리 셈. 값과 인덱스가 자리를 정하므로 좌표는 장면에 없다 (S-piece).

    function xFor(index: number): number {
      const { slot, slotsAtDepth } = slotInfo(index);
      return SIDE_MARGIN + (slot + 0.5) * (usableW / slotsAtDepth);
    }

    function yFor(index: number): number {
      return TOP_Y + slotInfo(index).depth * ROW_H;
    }

    function roleFill(role: NodeRole): string {
      switch (role) {
        case 'active':
          return palette.itemActive;
        case 'comparing':
          return palette.itemComparing;
        case 'swapping':
          return palette.itemSwapping;
        case 'settled':
          return palette.itemSorted;
        default:
          return palette.itemDefault;
      }
    }

    function roleInk(role: NodeRole): string {
      switch (role) {
        case 'active':
        case 'comparing':
        case 'swapping':
          return palette.stateInk;
        case 'settled':
          return palette.textInverse;
        default:
          return palette.text;
      }
    }

    function setRole(node: NodeVisual, role: NodeRole): void {
      node.circle.setAttribute('fill', roleFill(role));
      node.text.setAttribute('fill', roleInk(role));
    }

    /**
     * 그 칸이 지금 무엇으로 짚이나.
     *
     * 멈춘 자리가 가장 세다 — 그것이 이 조각의 결론이고, 되짚어도 남아야 한다.
     * 견줌은 다음 걸음이 덮기 전까지 머무는 강조이며, 그 밖에 오르는 값 하나가
     * 늘 짚여 있다.
     */
    function roleOf(scene: SiftUpScene, index: number): NodeRole {
      if (scene.settledIndex === index) return 'settled';
      const cmp = scene.compare;
      if (cmp && (cmp.childIndex === index || cmp.parentIndex === index)) return 'comparing';
      if (scene.climberIndex === index) return 'active';
      return 'default';
    }

    /** 원 하나를 제 칸에 세운다. 자리는 transform 으로만 준다 (맞바꿈이 그것을 민다). */
    function makeNode(index: number, value: number): NodeVisual {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('transform', `translate(${xFor(index)}, ${yFor(index)})`);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', String(RADIUS));
      circle.setAttribute('fill', palette.itemDefault);
      circle.setAttribute('stroke', palette.border);
      circle.setAttribute('stroke-width', '2');

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-family', fonts.mono);
      text.setAttribute('font-size', fontSizes.md);
      text.setAttribute('fill', palette.text);
      text.textContent = String(value);

      group.appendChild(circle);
      group.appendChild(text);
      nodeLayer.appendChild(group);
      return { group, circle, text };
    }

    function makeEdge(parentIndex: number, childIndex: number): SVGLineElement {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(xFor(parentIndex)));
      line.setAttribute('y1', String(yFor(parentIndex)));
      line.setAttribute('x2', String(xFor(childIndex)));
      line.setAttribute('y2', String(yFor(childIndex)));
      line.setAttribute('stroke', palette.border);
      line.setAttribute('stroke-width', '2');
      edgeLayer.appendChild(line);
      return line;
    }

    /** 칸 번호로 찾는 손잡이. 정적 그리기가 걸음마다 새로 채운다. */
    let nodes: (NodeVisual | null)[] = [];
    let edges: (SVGLineElement | null)[] = [];

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform·속성도
     * 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: SiftUpScene): void {
      nodeLayer.textContent = '';
      edgeLayer.textContent = '';
      nodes = new Array<NodeVisual | null>(scene.cells.length).fill(null);
      edges = new Array<SVGLineElement | null>(scene.cells.length).fill(null);

      // 가지는 양 끝 칸이 다 차 있을 때만 있다 — 새 값이 앉아야 그 가지가 생긴다.
      for (let i = 1; i < scene.cells.length; i += 1) {
        if (scene.cells[i] == null) continue;
        const p = parentOf(i);
        if (scene.cells[p] == null) continue;
        edges[i] = makeEdge(p, i);
      }

      for (let i = 0; i < scene.cells.length; i += 1) {
        const value = scene.cells[i];
        if (value == null) continue;
        const node = makeNode(i, value);
        setRole(node, roleOf(scene, i));
        nodes[i] = node;
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: SiftUpCaption | null): void {
      if (!cap) {
        captionText.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'insert':
          captionText.textContent = tr(
            'caption.insert',
            'The new value {value} takes the last open slot.',
            { value: cap.value },
          );
          return;
        case 'compareSwap':
          captionText.textContent = tr(
            'caption.compareSwap',
            '{child} comes before its parent {parent} — they swap places.',
            { child: cap.child, parent: cap.parent },
          );
          return;
        case 'compareStop':
          captionText.textContent = tr(
            'caption.compareStop',
            '{child} does not come before its parent {parent} — it stops here.',
            { child: cap.child, parent: cap.parent },
          );
          return;
        case 'settle':
          captionText.textContent = tr('caption.settle', 'This is its place.');
          return;
      }
    }

    // ── 걸음 함수 ───────────────────────────────────────────────────────────
    //
    // 둘 다 정적 그리기가 세워 둔 끝 자리에서 **뒤로 물려** 출발한다. 물리는 그림은
    // 장면의 `step` 에서 셈하므로 `prev` 를 들추지 않는다 (S-scene).
    //
    // 정적으로 세운 직후에 물려 놓아도 그 사이에 타이머도 프레임도 없어 페인트가
    // 끼지 않는다 — 끝 자리가 번쩍이지 않는다.

    /** 새 값이 맨 끝자리에 자라 나온다. 가지도 부모에서 함께 뻗는다. */
    function growIn(index: number, myGen: number): Promise<void> {
      const node = nodes[index];
      if (!node) return Promise.resolve();
      // 가지는 뿌리 칸에는 없다 — 그럴 때는 원만 자란다.
      const line = edges[index] ?? null;
      const from = line ? { x: xFor(parentOf(index)), y: yFor(parentOf(index)) } : null;
      const to = { x: xFor(index), y: yFor(index) };

      node.circle.setAttribute('r', '0');
      node.text.setAttribute('opacity', '0');
      if (line && from) {
        line.setAttribute('x2', String(from.x));
        line.setAttribute('y2', String(from.y));
      }

      return tween(ENTER_MS, (raw) => {
        if (!alive(myGen)) return;
        const e = easeOutCubic(raw);
        node.circle.setAttribute('r', String(RADIUS * e));
        node.text.setAttribute('opacity', String(e));
        if (line && from) {
          line.setAttribute('x2', String(from.x + (to.x - from.x) * e));
          line.setAttribute('y2', String(from.y + (to.y - from.y) * e));
        }
      });
    }

    /**
     * 두 값이 자리를 맞바꾸며 하나가 한 칸 오른다.
     *
     * 한 걸음에 둘이 함께 움직이고 그것이 이 조각의 주장이므로, **시계를 둘로 나누지
     * 않는다** — 옮길 것을 한 목록에 모아 한 트윈으로 흘린다. 그래야 두 원이 서로를
     * 스쳐 지나가는 순간이 한 화면에서 어긋나지 않는다.
     */
    function swapFlow(childIndex: number, parentIndex: number, myGen: number): Promise<void> {
      // 올라온 값은 지금 부모 칸에 서 있고 자식 칸에서 왔다. 내려간 값은 그 반대다.
      const moves: { node: NodeVisual; from: number; to: number }[] = [];
      const up = nodes[parentIndex];
      const down = nodes[childIndex];
      if (up) moves.push({ node: up, from: childIndex, to: parentIndex });
      if (down) moves.push({ node: down, from: parentIndex, to: childIndex });
      if (moves.length === 0) return Promise.resolve();

      for (const m of moves) {
        setRole(m.node, 'swapping');
        m.node.group.setAttribute(
          'transform',
          `translate(${xFor(m.from)}, ${yFor(m.from)})`,
        );
      }

      return tween(SWAP_MS, (raw) => {
        if (!alive(myGen)) return;
        const e = easeInOut(raw);
        for (const m of moves) {
          const x = xFor(m.from) + (xFor(m.to) - xFor(m.from)) * e;
          const y = yFor(m.from) + (yFor(m.to) - yFor(m.from)) * e;
          m.node.group.setAttribute('transform', `translate(${x}, ${y})`);
        }
      });
    }

    async function render(
      next: SiftUpScene,
      /** 출발 그림을 `step` 에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: SiftUpScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const myGen = (gen += 1);
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;
      if (step.kind === 'insert') {
        await growIn(step.index, myGen);
      } else if (step.kind === 'swap') {
        await swapFlow(step.childIndex, step.parentIndex, myGen);
      } else {
        // 견줌과 멈춤은 짚이는 색만 달라진다 — 흐를 것이 없다.
        return;
      }

      if (!alive(myGen)) return;
      // 운동이 남긴 보간 끝자리와 임시 속성을 통째로 거둔다. 되돌릴 목록을 손으로
      // 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const done of [...pending]) done();
        pending.clear();
        svg.textContent = '';
      },
    };
  },
};
