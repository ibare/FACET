/**
 * merkle-stage View — 머클 트리 단일 캔버스.
 *
 * 이 조각의 동사는 **접힌다** 이므로, 값이 실제로 위로 올라가야 한다 (S-piece).
 * 잎의 해시가 복제되어 부모 자리로 이동하고, 도착한 뒤에야 그 자리에 새 값이
 * 나타난다. 위층 노드를 그냥 페이드인시키면 "접힌다" 가 "생긴다" 가 된다.
 *
 * 잎은 제자리에 남고 복제본만 올라간다 — 해시 트리의 실제 동작이 그렇다.
 * 아래 것이 사라져 위가 되는 게 아니라, 아래를 재료로 위가 새로 생긴다.
 *
 * 잎 하나가 바뀐 뒤에는 그 경로만 다시 올라간다. **다른 가지가 움직이지 않는
 * 것**이 이 조각이 말하는 전부라, 두 번째 상승의 범위가 곧 논증이다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 갈린 노드와 그 선 — palette.danger
 *   - 바뀐 잎 이름 — palette.accent
 *   - 성한 노드 — palette.textMuted
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 244;

const ROOT_Y = 76;
const MID_Y = 128;
const LEAF_Y = 180;
const NAME_Y = 202;

const ROOT_CX = 310;
const MID_CX = [160, 460];
const LEAF_CX = [90, 230, 390, 530];

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const NOTE_Y = 232;

/** 해시는 앞 8자만 인쇄한다. 같은지 다른지만 보면 되는 자리다. */
const HEX_HEAD = 8;

/**
 * 값 하나가 부모 자리까지 올라가는 시간 (ms).
 *
 * 두 층이 이어 오르므로 전체는 대략 RISE_MS * 2 + 스태거가 된다. facet 의
 * stepMs 는 그보다 넉넉해야 다음 걸음이 이 운동을 자르지 않는다.
 */
const RISE_MS = 380;
/** 같은 층의 둘째 상승을 조금 늦춰 짝지어 오르는 것이 보이게 한다. */
const RISE_STAGGER_MS = 70;

type Leaf = { label: string; hash: string };
type Snapshot = { leaves: Leaf[]; left: string; right: string; root: string };
type InitPayload = { before: Snapshot; after: Snapshot; changedLeaf: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const merkleStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const BAD = palette.danger;
    const HOT = palette.accent;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    container.appendChild(svg);

    function text(
      x: number,
      y: number,
      opts: { fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    const captionBase = text(W / 2, CAPTION_BASE_Y, { size: fontSizes.sm });
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, {
      fill: HOT,
      size: fontSizes.sm,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, { fill: palette.textMuted });
    const edgesGroup = el('g');
    const nodesGroup = el('g');
    /** 올라가는 중인 복제본들. reset 때 통째로 비운다. */
    const risingGroup = el('g');
    svg.append(captionBase, captionEvent, edgesGroup, nodesGroup, risingGroup, note);

    /** 노드 하나 — 해시 글자 하나로 그린다. 상자를 두면 트리 모양이 묻힌다. */
    type Node = { hash: SVGTextElement };
    let rootNode: Node | null = null;
    let midNodes: Node[] = [];
    let leafNodes: Node[] = [];
    let leafNames: SVGTextElement[] = [];
    let edges: SVGLineElement[] = [];
    let snapshot: InitPayload | null = null;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function clearRising(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      risingGroup.textContent = '';
    }

    /**
     * 값 하나를 복제해 부모 자리까지 올려 보낸다.
     *
     * 잎은 제자리에 남고 복제본만 이동한다 — 아래 것이 사라져 위가 되는 게
     * 아니라, 아래를 재료로 위가 새로 생기기 때문이다. 도착하면 복제본을 거두고
     * `onArrive` 가 그 자리의 값을 세운다.
     */
    function rise(
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      hash: string,
      delayMs: number,
      onArrive: () => void,
      color?: string,
    ): void {
      later(() => {
        const ghost = text(fromX, fromY, {
          family: fonts.mono,
          fill: color ?? palette.textMuted,
        });
        ghost.textContent = hash.slice(0, HEX_HEAD);
        ghost.style.transition = `transform ${RISE_MS}ms ease-in-out, opacity ${RISE_MS}ms ease-in`;
        risingGroup.appendChild(ghost);
        // 다음 틱에 목표로 옮긴다 — 같은 틱에 바꾸면 전환이 일어나지 않는다.
        later(() => {
          ghost.style.transform = `translate(${toX - fromX}px, ${toY - fromY}px)`;
          ghost.style.opacity = '0';
        }, 16);
        later(() => {
          ghost.remove();
          onArrive();
        }, RISE_MS + 16);
      }, delayMs);
    }

    function makeNode(cx: number, y: number, hash: string): Node {
      const t = text(cx, y, { family: fonts.mono, fill: palette.textMuted });
      t.textContent = hash.slice(0, HEX_HEAD);
      t.style.opacity = '0';
      t.style.transition = 'opacity 220ms ease-out, fill 200ms ease-out';
      nodesGroup.appendChild(t);
      return { hash: t };
    }

    function makeEdge(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
      const line = el('line', {
        x1,
        y1,
        x2,
        y2,
        stroke: palette.border,
        'stroke-width': 1.4,
      });
      line.style.opacity = '0';
      line.style.transition = 'opacity 220ms ease-out, stroke 200ms ease-out';
      edgesGroup.appendChild(line);
      return line;
    }

    function build(s: Snapshot): void {
      nodesGroup.textContent = '';
      edgesGroup.textContent = '';
      leafNames = [];
      edges = [];

      leafNodes = s.leaves.map((leaf, i) => makeNode(LEAF_CX[i] ?? 0, LEAF_Y, leaf.hash));
      s.leaves.forEach((leaf, i) => {
        const name = text(LEAF_CX[i] ?? 0, NAME_Y, { family: fonts.mono, size: fontSizes.sm });
        name.textContent = leaf.label;
        name.style.opacity = '0';
        name.style.transition = 'opacity 220ms ease-out, fill 200ms ease-out';
        nodesGroup.appendChild(name);
        leafNames.push(name);
      });
      midNodes = [makeNode(MID_CX[0] ?? 0, MID_Y, s.left), makeNode(MID_CX[1] ?? 0, MID_Y, s.right)];
      rootNode = makeNode(ROOT_CX, ROOT_Y, s.root);

      // 잎 → 중간 (4개), 중간 → 꼭대기 (2개). 순서가 인덱스 규약이다.
      for (let i = 0; i < 4; i++) {
        edges.push(
          makeEdge(LEAF_CX[i] ?? 0, LEAF_Y - 12, MID_CX[i < 2 ? 0 : 1] ?? 0, MID_Y + 4),
        );
      }
      for (let i = 0; i < 2; i++) {
        edges.push(makeEdge(MID_CX[i] ?? 0, MID_Y - 12, ROOT_CX, ROOT_Y + 4));
      }
    }

    return {
      destroy() {
        clearRising();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        clearRising();
        captionEvent.textContent = '';
        if (!snapshot) return;
        build(snapshot.before);
      },

      init(p: InitPayload) {
        clearRising();
        snapshot = p;
        build(p.before);
        captionEvent.textContent = '';
      },

      setBaseCaption(value: string) {
        captionBase.textContent = value;
      },

      setCaption(value: string) {
        captionEvent.textContent = value;
      },

      setNote(value: string) {
        note.textContent = value;
      },

      buildLeaves() {
        for (const n of leafNodes) n.hash.style.opacity = '1';
        for (const n of leafNames) n.style.opacity = '1';
      },

      /**
       * 아래에서 위로 접힌다. 잎 둘이 짝지어 부모 자리로 올라가고, 도착한 뒤에
       * 부모 값이 나타난다. 그 다음 중간 둘이 같은 식으로 꼭대기까지 오른다.
       */
      combineUp() {
        const snap = snapshot;
        if (!snap) return;

        // 1층 — 잎 넷이 둘씩 부모에게로.
        [0, 1, 2, 3].forEach((i, k) => {
          const side = i < 2 ? 0 : 1;
          rise(
            LEAF_CX[i] ?? 0,
            LEAF_Y,
            MID_CX[side] ?? 0,
            MID_Y,
            snap.before.leaves[i]?.hash ?? '',
            k * RISE_STAGGER_MS,
            () => {
              const e = edges[i];
              if (e) e.style.opacity = '1';
              const mid = midNodes[side];
              if (mid) mid.hash.style.opacity = '1';
            },
          );
        });

        // 2층 — 중간 둘이 꼭대기로. 1층이 닿은 뒤에 오른다.
        const secondFloorAt = RISE_MS + 2 * RISE_STAGGER_MS;
        [0, 1].forEach((side, k) => {
          rise(
            MID_CX[side] ?? 0,
            MID_Y,
            ROOT_CX,
            ROOT_Y,
            side === 0 ? snap.before.left : snap.before.right,
            secondFloorAt + k * RISE_STAGGER_MS,
            () => {
              const e = edges[4 + side];
              if (e) e.style.opacity = '1';
              if (rootNode) rootNode.hash.style.opacity = '1';
            },
          );
        });
      },

      /** 잎 하나가 바뀐다. 아직 위쪽은 옛 값이라 원인과 결과가 나뉜다. */
      changeLeaf() {
        if (!snapshot) return;
        const i = snapshot.changedLeaf;
        const name = leafNames[i];
        const after = snapshot.after.leaves[i];
        if (name && after) {
          name.textContent = after.label;
          name.setAttribute('fill', HOT);
        }
      },

      /**
       * 바뀐 값이 꼭대기까지 다시 올라간다. **다른 가지는 움직이지 않는다** —
       * 그 정지가 이 조각이 말하려는 전부다.
       */
      markPath() {
        const snap = snapshot;
        if (!snap) return;
        const i = snap.changedLeaf;
        const side = i < 2 ? 0 : 1;
        const afterMid = side === 0 ? snap.after.left : snap.after.right;

        const leaf = leafNodes[i];
        const afterLeaf = snap.after.leaves[i];
        if (leaf && afterLeaf) {
          leaf.hash.textContent = afterLeaf.hash.slice(0, HEX_HEAD);
          leaf.hash.setAttribute('fill', BAD);
        }

        // 바뀐 잎 → 부모.
        rise(
          LEAF_CX[i] ?? 0,
          LEAF_Y,
          MID_CX[side] ?? 0,
          MID_Y,
          afterLeaf?.hash ?? '',
          0,
          () => {
            const mid = midNodes[side];
            if (mid) {
              mid.hash.textContent = afterMid.slice(0, HEX_HEAD);
              mid.hash.setAttribute('fill', BAD);
            }
            const e = edges[i];
            if (e) e.setAttribute('stroke', BAD);
          },
          BAD,
        );

        // 부모 → 꼭대기.
        rise(
          MID_CX[side] ?? 0,
          MID_Y,
          ROOT_CX,
          ROOT_Y,
          afterMid,
          RISE_MS,
          () => {
            if (rootNode) {
              rootNode.hash.textContent = snap.after.root.slice(0, HEX_HEAD);
              rootNode.hash.setAttribute('fill', BAD);
            }
            const e = edges[4 + side];
            if (e) e.setAttribute('stroke', BAD);
          },
          BAD,
        );
      },
    };
  },
};
