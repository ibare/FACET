/**
 * merkle-stage View — 머클 트리 단일 캔버스.
 *
 * 잎 넷이 아래에, 중간 둘이 그 위에, 꼭대기 하나가 맨 위에 있다. 접히는 순서를
 * 아래에서 위로 보인 뒤 잎 하나를 바꾸고, 갈린 노드만 물들인다.
 *
 * 성한 노드를 성한 색으로 남기는 것이 이 조각의 요점이다. 전부 물들이면
 * "한 줄만 바뀐다" 가 보이지 않는다 — 해시 사슬 조각과 갈리는 지점이 거기다.
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
    svg.append(captionBase, captionEvent, edgesGroup, nodesGroup, note);

    /** 노드 하나 — 해시 글자 하나로 그린다. 상자를 두면 트리 모양이 묻힌다. */
    type Node = { hash: SVGTextElement };
    let rootNode: Node | null = null;
    let midNodes: Node[] = [];
    let leafNodes: Node[] = [];
    let leafNames: SVGTextElement[] = [];
    let edges: SVGLineElement[] = [];
    let snapshot: InitPayload | null = null;

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
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        captionEvent.textContent = '';
        if (!snapshot) return;
        build(snapshot.before);
      },

      init(p: InitPayload) {
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

      /** 아래에서 위로 접힌다. 중간이 먼저, 꼭대기가 나중. */
      combineUp() {
        for (let i = 0; i < 4; i++) {
          const e = edges[i];
          if (e) e.style.opacity = '1';
        }
        for (const n of midNodes) n.hash.style.opacity = '1';
        for (let i = 4; i < 6; i++) {
          const e = edges[i];
          if (e) e.style.opacity = '1';
        }
        if (rootNode) rootNode.hash.style.opacity = '1';
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

      /** 잎에서 꼭대기까지 한 줄만 갈린다. 나머지 가지는 성한 색으로 남는다. */
      markPath() {
        if (!snapshot) return;
        const i = snapshot.changedLeaf;
        const side = i < 2 ? 0 : 1;
        const leaf = leafNodes[i];
        const afterLeaf = snapshot.after.leaves[i];
        if (leaf && afterLeaf) {
          leaf.hash.textContent = afterLeaf.hash.slice(0, HEX_HEAD);
          leaf.hash.setAttribute('fill', BAD);
        }
        const mid = midNodes[side];
        if (mid) {
          mid.hash.textContent = (side === 0 ? snapshot.after.left : snapshot.after.right).slice(
            0,
            HEX_HEAD,
          );
          mid.hash.setAttribute('fill', BAD);
        }
        if (rootNode) {
          rootNode.hash.textContent = snapshot.after.root.slice(0, HEX_HEAD);
          rootNode.hash.setAttribute('fill', BAD);
        }
        const leafEdge = edges[i];
        if (leafEdge) leafEdge.setAttribute('stroke', BAD);
        const midEdge = edges[4 + side];
        if (midEdge) midEdge.setAttribute('stroke', BAD);
      },
    };
  },
};
