/**
 * scc-stage — 타잔 순회를 한 폭의 SVG 에 그리는 facet 전용 stage.
 *
 * 화면은 셋으로 나뉜다.
 *
 *   왼쪽   정점을 원둘레에 고르게 놓은 그래프. 자리는 정점 번호 차례일 뿐이라
 *          무리를 미리 알려 주지 않는다 — 무리는 알고리즘이 찾아낸 뒤에야
 *          색으로 나타난다. 정점 바깥의 작은 수 둘이 `num · low` 다.
 *   가운데 스택. 밑에서 위로 쌓인다. 무리가 확정되면 그 사이에 대괄호가 쳐지고,
 *          꼭대기부터 하나씩 빠져나간다.
 *   오른쪽 확정된 무리. 대괄호가 쳐지는 순간 빈 칸이 먼저 자리를 잡고
 *          (통째로 정해졌다는 뜻이다), 빠져나온 정점이 그 안에 채워진다.
 *
 * 세로는 mount 시점에 정해지고 그 뒤로 바뀌지 않는다 (S-view). 무리 칸의 줄
 *          높이만 정점 수로 나눠 잡는다 — 최악의 경우 정점 수만큼 무리가 생긴다.
 *
 * 타이머와 프레임 루프를 두지 않는다. 색 전이는 CSS transition 이 맡으므로
 * `destroy()` 가 거둘 뒷일은 붙여 둔 DOM 뿐이다.
 *
 * 색은 전부 design-tokens 경유다 (S-view 결정 트리). 간선·정점의 상태는
 * `state` 어휘, 무리 식별은 `categorical(정점 수)` 의 pastel / vivid 짝이다.
 *
 * `num · low` 가 붉게 남는 것은 그 자리의 낮은값이 한 번이라도 끌어내려졌다는
 * 뜻이다. 끝까지 검게 남은 자리가 곧 무리의 뿌리다 — 낮은값이 자기 번호에서
 * 움직이지 않았다는 말이기 때문이다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

/** 간선이 순회에서 맡은 역할. */
export type SccEdgeKind = 'idle' | 'scan' | 'tree' | 'back' | 'skip';

// ── 자리 잡기 ────────────────────────────────────────────────────────────────
const CANVAS_H = 300;

const CAPTION_X = 12;
const CAPTION_Y = 18;
const LEGEND_Y = 40;

const GRAPH_CX = 168;
const GRAPH_CY = 162;
const GRAPH_R = 88;
const NODE_R = 17;
const NODE_LABEL_R = GRAPH_R + 30;
const EDGE_BOW = 13;
const ARROW_LEN = 8;
const ARROW_HALF = 4;

const PANEL_TOP = 62;
const PANEL_BOTTOM = 288;

const STACK_X = 316;
const STACK_W = 74;
const SLOT_H = 26;
const CHIP_INSET = 2;

const GROUP_X = 404;
const GROUP_PAD = 7;
const CHIP_W = 21;
const CHIP_GAP = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

type NodeParts = {
  disc: SVGCircleElement;
  id: SVGTextElement;
  numbers: SVGTextElement;
};

type EdgeParts = {
  curve: SVGPathElement;
  head: SVGPolygonElement;
};

export const sccStageView: CanvasView = {
  canvas: { height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const doc = canvas.ownerDocument;
    const colors = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback. 러너 안에서는 저작자 문안이 얹힌 것이 온다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs): SVGElementTagNameMap[K] => {
      const node = doc.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      return node;
    };

    const root = el('g', {});
    canvas.appendChild(root);

    const edgeLayer = el('g', {});
    const stackLayer = el('g', {});
    const groupLayer = el('g', {});
    const nodeLayer = el('g', {});
    root.appendChild(edgeLayer);
    root.appendChild(stackLayer);
    root.appendChild(groupLayer);
    root.appendChild(nodeLayer);

    // ── 글자 ─────────────────────────────────────────────────────────────────
    const caption = el('text', {
      x: CAPTION_X,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(caption);

    // `num` / `low` 는 이 알고리즘에서 원어 그대로 통용되는 표기다 (C10 표식).
    const legend = el('text', {
      x: CAPTION_X,
      y: LEGEND_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    legend.textContent = 'num · low';
    root.appendChild(legend);

    const panelLabel = (x: number, text: string): SVGTextElement => {
      const label = el('text', {
        x,
        y: PANEL_TOP - 10,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = text;
      root.appendChild(label);
      return label;
    };
    // 'stack' 은 자료구조 이름 그대로 통용되는 말이라 표식으로 둔다 (C10).
    panelLabel(STACK_X, 'stack');
    panelLabel(GROUP_X, tr('label.groups', 'groups'));

    // ── 상태 ─────────────────────────────────────────────────────────────────
    let vertexCount = 0;
    let positions: { x: number; y: number }[] = [];
    let nodeParts: NodeParts[] = [];
    let stackChips: SVGGElement[] = [];
    let edgeParts = new Map<string, EdgeParts>();
    /** 정점별 무리 번호. -1 이면 아직 무리가 없다. */
    let groupOf: number[] = [];
    /** 방문 번호가 매겨졌는지. */
    let numbered: boolean[] = [];
    /** 무리별로 지금까지 채운 자리 수. */
    let filled: number[] = [];
    let groupRowH = 26;
    let stackDepth = 0;

    const pastel = (index: number): string => {
      const seed = categorical(Math.max(1, vertexCount), 'pastel');
      return seed[index % seed.length] ?? colors.bgSubtle;
    };
    const vivid = (index: number): string => {
      const seed = categorical(Math.max(1, vertexCount), 'vivid');
      return seed[index % seed.length] ?? colors.border;
    };

    // 지금 재귀가 머무는 자리 / 뿌리 후보를 짚는 자리.
    const currentRing = el('circle', {
      r: NODE_R + 4,
      fill: 'none',
      stroke: colors.itemActive,
      'stroke-width': 2.5,
      visibility: 'hidden',
    });
    const probeRing = el('circle', {
      r: NODE_R + 8,
      fill: 'none',
      stroke: colors.auxCursor,
      'stroke-width': 1.2,
      'stroke-dasharray': '3 3',
      visibility: 'hidden',
    });
    nodeLayer.appendChild(probeRing);
    nodeLayer.appendChild(currentRing);

    // 무리가 확정될 때 스택에 쳐지는 대괄호.
    const bracket = el('path', {
      fill: 'none',
      stroke: colors.border,
      'stroke-width': 2,
      visibility: 'hidden',
    });
    stackLayer.appendChild(bracket);

    // ── 그리기 ───────────────────────────────────────────────────────────────

    const slotTop = (depth: number): number => PANEL_BOTTOM - (depth + 1) * SLOT_H;

    /** 정점 하나의 겉모습을 지금 상태에 맞춰 다시 칠한다. */
    const paintNode = (v: number): void => {
      const parts = nodeParts[v];
      if (!parts) return;
      const group = groupOf[v] ?? -1;
      if (group >= 0) {
        parts.disc.setAttribute('fill', pastel(group));
        parts.disc.setAttribute('stroke', vivid(group));
        parts.disc.setAttribute('stroke-width', '2');
        parts.id.setAttribute('fill', colors.text);
      } else if (numbered[v]) {
        parts.disc.setAttribute('fill', colors.bgSubtle);
        parts.disc.setAttribute('stroke', colors.text);
        parts.disc.setAttribute('stroke-width', '1.6');
        parts.id.setAttribute('fill', colors.text);
      } else {
        parts.disc.setAttribute('fill', colors.itemDefault);
        parts.disc.setAttribute('stroke', colors.border);
        parts.disc.setAttribute('stroke-width', '1.2');
        parts.id.setAttribute('fill', colors.textMuted);
      }
      const chip = stackChips[v];
      if (chip) {
        const rect = chip.firstChild as SVGRectElement | null;
        rect?.setAttribute('stroke', group >= 0 ? vivid(group) : colors.text);
      }
    };

    const edgeStyle = (kind: SccEdgeKind): { stroke: string; width: number; dash: string } => {
      if (kind === 'scan') return { stroke: colors.itemComparing, width: 2.2, dash: 'none' };
      if (kind === 'tree') return { stroke: colors.text, width: 2, dash: 'none' };
      if (kind === 'back') return { stroke: colors.itemSwapping, width: 2.6, dash: 'none' };
      if (kind === 'skip') return { stroke: colors.ghostOutline, width: 1.2, dash: '2 3' };
      return { stroke: colors.border, width: 1.2, dash: 'none' };
    };

    const paintEdge = (key: string, kind: SccEdgeKind): void => {
      const parts = edgeParts.get(key);
      if (!parts) return;
      const style = edgeStyle(kind);
      parts.curve.setAttribute('stroke', style.stroke);
      parts.curve.setAttribute('stroke-width', String(style.width));
      parts.curve.setAttribute('stroke-dasharray', style.dash);
      parts.head.setAttribute('fill', style.stroke);
    };

    const buildEdge = (from: number, to: number): void => {
      const a = positions[from];
      const b = positions[to];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const span = Math.hypot(dx, dy) || 1;
      // 모든 간선을 진행 방향의 왼쪽으로 똑같이 휘게 한다. 서로 마주 보는 두
      // 간선(5→6 과 6→5 처럼)이 저절로 갈라져 둘 다 보인다.
      const cx = (a.x + b.x) / 2 + (-dy / span) * EDGE_BOW;
      const cy = (a.y + b.y) / 2 + (dx / span) * EDGE_BOW;

      // 곡선의 끝점 접선은 제어점 쪽을 향한다. 그 방향으로 잘라 내면 원 둘레에
      // 정확히 닿는다.
      const inLen = Math.hypot(cx - a.x, cy - a.y) || 1;
      const outLen = Math.hypot(cx - b.x, cy - b.y) || 1;
      const sx = a.x + ((cx - a.x) / inLen) * NODE_R;
      const sy = a.y + ((cy - a.y) / inLen) * NODE_R;
      const ex = b.x + ((cx - b.x) / outLen) * (NODE_R + ARROW_LEN);
      const ey = b.y + ((cy - b.y) / outLen) * (NODE_R + ARROW_LEN);

      const tipX = b.x + ((cx - b.x) / outLen) * NODE_R;
      const tipY = b.y + ((cy - b.y) / outLen) * NODE_R;
      const hx = (tipX - ex) / (Math.hypot(tipX - ex, tipY - ey) || 1);
      const hy = (tipY - ey) / (Math.hypot(tipX - ex, tipY - ey) || 1);

      const curve = el('path', {
        d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
        fill: 'none',
        'stroke-linecap': 'round',
      });
      const head = el('polygon', {
        points: [
          `${tipX.toFixed(1)},${tipY.toFixed(1)}`,
          `${(ex - hy * ARROW_HALF).toFixed(1)},${(ey + hx * ARROW_HALF).toFixed(1)}`,
          `${(ex + hy * ARROW_HALF).toFixed(1)},${(ey - hx * ARROW_HALF).toFixed(1)}`,
        ].join(' '),
      });
      edgeLayer.appendChild(curve);
      edgeLayer.appendChild(head);
      edgeParts.set(`${from}-${to}`, { curve, head });
      paintEdge(`${from}-${to}`, 'idle');
    };

    const buildNode = (v: number): void => {
      const p = positions[v];
      if (!p) return;
      const disc = el('circle', { cx: p.x, cy: p.y, r: NODE_R });
      disc.setAttribute('style', 'transition: fill 160ms linear, stroke 160ms linear');
      const id = el('text', {
        x: p.x,
        y: p.y + 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
      });
      id.textContent = String(v);
      const angle = -Math.PI / 2 + (v * 2 * Math.PI) / Math.max(1, vertexCount);
      const numbers = el('text', {
        x: GRAPH_CX + Math.cos(angle) * NODE_LABEL_R,
        y: GRAPH_CY + Math.sin(angle) * NODE_LABEL_R + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      nodeLayer.appendChild(disc);
      nodeLayer.appendChild(id);
      nodeLayer.appendChild(numbers);
      nodeParts[v] = { disc, id, numbers };
    };

    const buildStackChip = (v: number): void => {
      const chip = el('g', { visibility: 'hidden' });
      const rect = el('rect', {
        x: STACK_X,
        y: 0,
        width: STACK_W,
        height: SLOT_H - CHIP_INSET * 2,
        rx: 4,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': 1.4,
      });
      const label = el('text', {
        x: STACK_X + STACK_W / 2,
        y: 0,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      label.textContent = String(v);
      chip.appendChild(rect);
      chip.appendChild(label);
      stackLayer.appendChild(chip);
      stackChips[v] = chip;
    };

    const placeChip = (v: number, depth: number): void => {
      const chip = stackChips[v];
      if (!chip) return;
      const top = slotTop(depth);
      const rect = chip.firstChild as SVGRectElement | null;
      const label = chip.lastChild as SVGTextElement | null;
      rect?.setAttribute('y', String(top + CHIP_INSET));
      label?.setAttribute('y', String(top + SLOT_H / 2 + 4));
      chip.setAttribute('visibility', 'visible');
    };

    const clearGraph = (): void => {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      stackLayer.textContent = '';
      groupLayer.textContent = '';
      nodeLayer.appendChild(probeRing);
      nodeLayer.appendChild(currentRing);
      stackLayer.appendChild(bracket);
      nodeParts = [];
      stackChips = [];
      edgeParts = new Map();
    };

    // ── projector 가 부르는 메서드 ──────────────────────────────────────────
    const instance = {
      setGraph(adjacency: number[][]): void {
        clearGraph();
        vertexCount = adjacency.length;
        groupOf = new Array<number>(vertexCount).fill(-1);
        numbered = new Array<boolean>(vertexCount).fill(false);
        filled = [];
        stackDepth = 0;
        groupRowH = Math.min(30, (PANEL_BOTTOM - PANEL_TOP) / Math.max(1, vertexCount));
        positions = [];
        for (let v = 0; v < vertexCount; v += 1) {
          const angle = -Math.PI / 2 + (v * 2 * Math.PI) / Math.max(1, vertexCount);
          positions.push({
            x: GRAPH_CX + Math.cos(angle) * GRAPH_R,
            y: GRAPH_CY + Math.sin(angle) * GRAPH_R,
          });
        }
        for (let v = 0; v < vertexCount; v += 1) {
          for (const w of adjacency[v] ?? []) buildEdge(v, w);
        }
        for (let v = 0; v < vertexCount; v += 1) {
          buildNode(v);
          buildStackChip(v);
          paintNode(v);
        }
        probeRing.setAttribute('visibility', 'hidden');
        currentRing.setAttribute('visibility', 'hidden');
        bracket.setAttribute('visibility', 'hidden');
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      probe(v: number): void {
        const p = positions[v];
        if (!p) return;
        probeRing.setAttribute('cx', String(p.x));
        probeRing.setAttribute('cy', String(p.y));
        probeRing.setAttribute('visibility', 'visible');
      },

      visit(v: number, numValue: number, lowValue: number): void {
        const parts = nodeParts[v];
        if (!parts) return;
        numbered[v] = true;
        parts.numbers.textContent = `${numValue} · ${lowValue}`;
        parts.numbers.setAttribute('fill', colors.text);
        probeRing.setAttribute('visibility', 'hidden');
        paintNode(v);
        instance.focus(v);
      },

      updateLow(v: number, numValue: number, lowValue: number, changed: boolean): void {
        const parts = nodeParts[v];
        if (!parts) return;
        parts.numbers.textContent = `${numValue} · ${lowValue}`;
        parts.numbers.setAttribute('fill', changed ? colors.itemSwapping : colors.text);
        instance.focus(v);
      },

      focus(v: number): void {
        const p = positions[v];
        if (!p) return;
        currentRing.setAttribute('cx', String(p.x));
        currentRing.setAttribute('cy', String(p.y));
        currentRing.setAttribute('visibility', 'visible');
      },

      markEdge(from: number, to: number, kind: SccEdgeKind): void {
        paintEdge(`${from}-${to}`, kind);
      },

      push(v: number): void {
        placeChip(v, stackDepth);
        stackDepth += 1;
        paintNode(v);
      },

      closeGroup(groupIndex: number, members: number[]): void {
        if (members.length === 0) return;
        // 스택에서 이 무리가 차지한 구간에 대괄호를 친다 — 여기부터 위까지가
        // 통째로 한 무리라는 뜻이다.
        const topY = slotTop(stackDepth - 1);
        const bottomY = slotTop(stackDepth - members.length) + SLOT_H;
        const x = STACK_X - 7;
        bracket.setAttribute(
          'd',
          `M ${x + 5} ${topY + CHIP_INSET} H ${x} V ${bottomY - CHIP_INSET} H ${x + 5}`,
        );
        bracket.setAttribute('stroke', vivid(groupIndex));
        bracket.setAttribute('visibility', 'visible');

        // 빈 자리를 먼저 잡는다. 몇이 들어올지는 이미 정해져 있다.
        const rowY = PANEL_TOP + groupIndex * groupRowH;
        const width = GROUP_PAD * 2 + members.length * CHIP_W + (members.length - 1) * CHIP_GAP;
        const pill = el('rect', {
          x: GROUP_X,
          y: rowY,
          width,
          height: groupRowH - 4,
          rx: 5,
          fill: pastel(groupIndex),
          stroke: vivid(groupIndex),
          'stroke-width': 1.4,
        });
        groupLayer.appendChild(pill);
        filled[groupIndex] = 0;
      },

      /** `isRoot` 는 이 정점이 무리의 뿌리라는 뜻 — 마지막으로 빠져나온다. */
      pop(v: number, groupIndex: number, isRoot: boolean): void {
        stackChips[v]?.setAttribute('visibility', 'hidden');
        stackDepth = Math.max(0, stackDepth - 1);
        groupOf[v] = groupIndex;
        paintNode(v);

        const seat = filled[groupIndex] ?? 0;
        filled[groupIndex] = seat + 1;
        const rowY = PANEL_TOP + groupIndex * groupRowH;
        const slot = el('text', {
          x: GROUP_X + GROUP_PAD + seat * (CHIP_W + CHIP_GAP) + CHIP_W / 2,
          y: rowY + groupRowH / 2 + 2,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        slot.textContent = String(v);
        groupLayer.appendChild(slot);

        // 뿌리까지 빠지면 무리가 다 나온 것이라 대괄호를 거둔다.
        if (isRoot) bracket.setAttribute('visibility', 'hidden');
      },

      finish(): void {
        probeRing.setAttribute('visibility', 'hidden');
        currentRing.setAttribute('visibility', 'hidden');
        bracket.setAttribute('visibility', 'hidden');
      },

      destroy(): void {
        root.remove();
      },
    };

    return instance;
  },
};
