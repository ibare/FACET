/**
 * chain-stage View — 해시 사슬 단일 캔버스.
 *
 * 칸 넷을 가로로 늘어놓는다. 칸마다 세 줄이다 — 품고 있는 앞 칸의 해시(prev),
 * 내용(data), 자기 해시(hash). 아래로 흐르는 연결선이 hash → 다음 칸의 prev 로
 * 이어져, 품는다는 말이 선으로 보인다.
 *
 * 손댄 뒤에는 바뀐 값만 물들인다. 성한 칸이 성한 색으로 남아 있어야 번져 나간
 * 자리가 어디까지인지 보인다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 바뀐 값 / 어긋난 연결 — palette.danger
 *   - 손댄 내용 — palette.accent
 *   - 성한 값 — palette.textMuted
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 250;

const BLOCK_W = 138;
const BLOCK_H = 84;
const BLOCK_GAP = 22;
const BLOCK_Y = 84;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const INDEX_Y = 74;
const NOTE_Y = 236;

/** 해시는 앞 8자만 인쇄한다. 같은지 다른지만 보면 되는 자리다. */
const HEX_HEAD = 8;

type Block = { data: string; prev: string; hash: string };
type InitPayload = {
  blocks: Block[];
  tamper: { index: number; data: string; blocks: Block[] };
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const chainStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const BAD = palette.danger;
    const HOT = palette.accent;

    const svg = params.canvas;

    function text(
      x: number,
      y: number,
      opts: { anchor?: string; fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'start',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    const captionBase = text(W / 2, CAPTION_BASE_Y, {
      anchor: 'middle',
      size: fontSizes.sm,
    });
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, {
      anchor: 'middle',
      fill: HOT,
      size: fontSizes.sm,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, {
      anchor: 'middle',
      fill: palette.textMuted,
    });
    const blocksGroup = el('g');
    const linksGroup = el('g');
    svg.append(captionBase, captionEvent, linksGroup, blocksGroup, note);

    type BlockNodes = {
      group: SVGGElement;
      box: SVGRectElement;
      prev: SVGTextElement;
      data: SVGTextElement;
      hash: SVGTextElement;
    };
    let nodes: BlockNodes[] = [];
    let links: SVGPathElement[] = [];
    let snapshot: InitPayload | null = null;

    function leftOf(i: number): number {
      const total = 4 * BLOCK_W + 3 * BLOCK_GAP;
      const start = Math.round((W - total) / 2);
      return start + i * (BLOCK_W + BLOCK_GAP);
    }

    function build(blocks: Block[], labels: { prev: string; hash: string }): void {
      blocksGroup.textContent = '';
      linksGroup.textContent = '';
      nodes = [];
      links = [];

      blocks.forEach((b, i) => {
        const x = leftOf(i);
        const group = el('g');
        const box = el('rect', {
          x,
          y: BLOCK_Y,
          width: BLOCK_W,
          height: BLOCK_H,
          rx: 4,
          fill: palette.bgSubtle,
          stroke: 'none',
          'stroke-width': 1.5,
        });
        box.style.transition = 'stroke 200ms ease-out';

        const idx = text(x + 8, INDEX_Y, { fill: palette.textMuted });
        idx.textContent = `#${i + 1}`;

        const prevLabel = text(x + 8, BLOCK_Y + 20, { fill: palette.textMuted });
        prevLabel.textContent = labels.prev;
        const prev = text(x + 46, BLOCK_Y + 20, {
          family: fonts.mono,
          fill: palette.textMuted,
        });
        prev.textContent = b.prev.slice(0, HEX_HEAD);
        prev.style.transition = 'fill 200ms ease-out';

        const data = text(x + 8, BLOCK_Y + 46, { family: fonts.mono, size: fontSizes.sm });
        data.textContent = b.data;
        data.style.transition = 'fill 200ms ease-out';

        const hashLabel = text(x + 8, BLOCK_Y + 70, { fill: palette.textMuted });
        hashLabel.textContent = labels.hash;
        const hash = text(x + 46, BLOCK_Y + 70, {
          family: fonts.mono,
          fill: palette.textMuted,
        });
        hash.textContent = b.hash.slice(0, HEX_HEAD);
        hash.style.transition = 'fill 200ms ease-out';

        group.append(box, idx, prevLabel, prev, data, hashLabel, hash);
        group.style.opacity = '0';
        group.style.transition = 'opacity 220ms ease-out';
        blocksGroup.appendChild(group);
        nodes.push({ group, box, prev, data, hash });

        // 자기 hash 에서 다음 칸의 prev 로 흐르는 연결선.
        if (i < blocks.length - 1) {
          const x1 = x + BLOCK_W;
          const x2 = leftOf(i + 1);
          const path = el('path', {
            d: `M ${x1} ${BLOCK_Y + 66} C ${x1 + 12} ${BLOCK_Y + 66}, ${x2 - 12} ${BLOCK_Y + 16}, ${x2} ${BLOCK_Y + 16}`,
            fill: 'none',
            stroke: palette.border,
            'stroke-width': 1.4,
          });
          path.style.transition = 'stroke 200ms ease-out';
          path.style.opacity = '0';
          linksGroup.appendChild(path);
          links.push(path);
        }
      });
    }

    return {
      destroy() {
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        captionEvent.textContent = '';
        if (!snapshot) return;
        snapshot.blocks.forEach((b, i) => {
          const n = nodes[i];
          if (!n) return;
          n.group.style.opacity = '0';
          n.data.textContent = b.data;
          n.data.setAttribute('fill', palette.text);
          n.prev.textContent = b.prev.slice(0, HEX_HEAD);
          n.prev.setAttribute('fill', palette.textMuted);
          n.hash.textContent = b.hash.slice(0, HEX_HEAD);
          n.hash.setAttribute('fill', palette.textMuted);
          n.box.setAttribute('stroke', 'none');
        });
        for (const l of links) {
          l.style.opacity = '0';
          l.setAttribute('stroke', palette.border);
        }
      },

      init(p: InitPayload, labels: { prev: string; hash: string }) {
        snapshot = p;
        build(p.blocks, labels);
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

      revealChain() {
        for (const n of nodes) n.group.style.opacity = '1';
        for (const l of links) l.style.opacity = '1';
      },

      /** 가운데 한 칸의 내용만 바꾼다. 아직 해시는 그대로 두어 원인과 결과를 나눈다. */
      tamper() {
        if (!snapshot) return;
        const { index, data } = snapshot.tamper;
        const n = nodes[index];
        if (!n) return;
        n.data.textContent = data;
        n.data.setAttribute('fill', HOT);
        n.box.setAttribute('stroke', HOT);
      },

      /** 손댄 칸의 해시가 바뀌고, 그것을 품고 있던 다음 칸의 prev 와 어긋난다. */
      breakLink() {
        if (!snapshot) return;
        const { index, blocks } = snapshot.tamper;
        const n = nodes[index];
        const after = blocks[index];
        if (n && after) {
          n.hash.textContent = after.hash.slice(0, HEX_HEAD);
          n.hash.setAttribute('fill', BAD);
        }
        const link = links[index];
        if (link) link.setAttribute('stroke', BAD);
        const next = nodes[index + 1];
        if (next) {
          next.prev.setAttribute('fill', BAD);
          next.box.setAttribute('stroke', BAD);
        }
      },

      /** 어긋남이 끝까지 번진다 — 뒤쪽 칸의 prev 와 hash 가 모두 갈린다. */
      cascade() {
        if (!snapshot) return;
        const { index, blocks } = snapshot.tamper;
        for (let i = index + 1; i < blocks.length; i++) {
          const n = nodes[i];
          const after = blocks[i];
          if (!n || !after) continue;
          n.prev.textContent = after.prev.slice(0, HEX_HEAD);
          n.prev.setAttribute('fill', BAD);
          n.hash.textContent = after.hash.slice(0, HEX_HEAD);
          n.hash.setAttribute('fill', BAD);
          n.box.setAttribute('stroke', BAD);
          const link = links[i];
          if (link) link.setAttribute('stroke', BAD);
        }
      },
    };
  },
};
