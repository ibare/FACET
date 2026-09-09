/**
 * sort-edges-avoid-cycle-stage — 무게 순 줄에서 집은 간선이 그래프에 놓이거나,
 * 놓이지 못하고 떨어져 나가는 화면.
 *
 * ── 화면이 답하는 것
 * 버리는 까닭은 "집어 든 간선의 양 끝이 이미 같은 무리인가" 다. 그래서 두 가지가
 * 늘 보여야 한다.
 *   1. 무리 — 정점의 채움색이 곧 무리 정체성이다. 간선을 놓을 때마다 진 쪽 무리의
 *      정점들이 이긴 쪽 색으로 물들고, 물든 정점마다 링이 퍼져 나간다.
 *   2. 이미 이어져 있던 길 — 버리기 직전 그 길이 먼저 붉게 켜지고, 집어 든 간선이
 *      그 위에 놓여 고리를 닫는다. 그러고 나서야 카드가 떨어진다.
 *
 * ── 배치
 * 왼쪽은 무게 순 대기줄, 오른쪽은 그래프, 아래는 떨어진 것이 쌓이는 바닥.
 * 정점은 nodes[0] 을 갓돌로 위에 두고 나머지를 좌상에서 시계 방향으로 타원에
 * 균등 배치한다. 이 조각의 데이터는 정점 다섯이라 나머지 넷이 사각형이 되고,
 * 여섯 간선이 하나도 교차하지 않는다.
 *
 * ── 움직이는 값은 전부 style 로 준다
 * CSS transition 이 확실히 걸리도록 stroke / stroke-dashoffset / transform /
 * opacity 는 attribute 가 아니라 inline style 로 쓴다.
 *
 * ── 뒷일
 * setTimeout 을 쓴다. 전부 waits 에 담아 destroy 에서 걷고, 걷을 때 대기 중인
 * Promise 를 resolve 해 projector 가 매달리지 않게 한다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageEdge = { id: string; u: string; v: string; weight: number };

type Point = { x: number; y: number };

type NodeParts = {
  ring: SVGCircleElement;
  pulse: SVGCircleElement;
  body: SVGCircleElement;
};

type EdgeParts = {
  edge: StageEdge;
  pending: SVGLineElement;
  solid: SVGLineElement;
  badge: SVGGElement;
  length: number;
};

type CardPose = { left: number; top: number; rotate: number; scale: number };

type CardParts = {
  g: SVGGElement;
  rect: SVGRectElement;
  cross: SVGGElement;
  pose: CardPose;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 348;

const PAD = 14;
const CAPTION_BASELINE = 20;
const COLUMN_LABEL_BASELINE = 38;
const BODY_TOP = 46;
const BODY_BOTTOM = 278;
const FLOOR_Y = 318;
const FLOOR_LABEL_BASELINE = 334;
const DROP_CENTER_Y = 304;

const NODE_R = 21;
const RING_R = NODE_R + 5;
const CROWN_GAP = 24;

const CARD_H = 32;
const CARD_GAP = 8;
const CARD_MAX_W = 172;
const COLUMN_GAP = 18;
/** 집어 든 카드는 간선 자리에 얹히므로 줄에 섰을 때보다 작다. */
const PICKED_SCALE = 0.62;
/** 놓이는 순간 카드가 선 속으로 빨려 들어간다. */
const ABSORB_SCALE = 0.24;

const SORT_MS = 420;
/** 줄이 위에서부터 차례로 앉게 하는 카드별 시작 차. */
const SORT_STAGGER_MS = 25;
const FLY_MS = 340;
const KEEP_MS = 460;
const CYCLE_PATH_MS = 190;
const CYCLE_CLOSE_MS = 230;
const DROP_MS = 460;
/** 방금 바꾼 값을 브라우저가 전이의 시작점으로 잡게 하는 최소 틈. */
const FRAME_MS = 20;

const EASE = 'cubic-bezier(0.34, 0.9, 0.3, 1)';
const FALL_EASE = 'cubic-bezier(0.5, 0, 0.75, 0.4)';
/** 카드가 기울어 떨어지는 각도. 앞뒤로 번갈아 눕힌다. */
const DROP_TILT_DEG = 7;
/** 도형에 새겨진 표식 — 번역 대상이 아니다 (C10). */
const CROSS_HALF = 6;
/** 간선 이름은 데이터 조립이고 사이의 가로줄은 표식이다. */
const EDGE_NAME_JOINER = '–';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/** scale / rotate 를 요소 자기 중심 기준으로 돌린다. */
function centerOrigin(node: SVGElement): void {
  node.style.setProperty('transform-box', 'fill-box');
  node.style.setProperty('transform-origin', '50% 50%');
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const sortEdgesAvoidCycleStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const palette = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback. 직접 만든 조회기를 쓰면 registerMessages 로
    // 주입된 번들을 못 읽는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 폭은 캔버스에서 역산한다. 상수는 상한만 정한다 (S-piece).
    const cardW = Math.min(
      CARD_MAX_W,
      Math.round((W - PAD * 2 - COLUMN_GAP) * 0.3),
    );
    const pickedW = cardW * PICKED_SCALE;
    const graphX = PAD + cardW + COLUMN_GAP;
    const graphW = W - PAD - graphX;
    const cx = graphX + graphW / 2;
    const crownY = BODY_TOP + NODE_R + 2;
    const ringTop = crownY + NODE_R + CROWN_GAP + NODE_R;
    const ringBottom = BODY_BOTTOM - NODE_R - 2;
    const ringCy = (ringTop + ringBottom) / 2;
    const ry = (ringBottom - ringTop) / 2 / Math.SQRT1_2;
    const rx = (graphW / 2 - NODE_R - 8) / Math.SQRT1_2;

    const pendingLayer = el('g');
    const solidLayer = el('g');
    const badgeLayer = el('g');
    const nodeLayer = el('g');
    const cardLayer = el('g');

    const caption = el('text', {
      x: PAD,
      y: CAPTION_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });

    const queueLabel = el('text', {
      x: PAD,
      y: COLUMN_LABEL_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: palette.textMuted,
    });
    queueLabel.textContent = tr('label.queue', 'by weight');

    const floorLine = el('line', {
      x1: PAD,
      y1: FLOOR_Y,
      x2: W - PAD,
      y2: FLOOR_Y,
      stroke: palette.border,
      'stroke-width': 1,
      'stroke-dasharray': '3 5',
    });

    const floorLabel = el('text', {
      x: PAD,
      y: FLOOR_LABEL_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: palette.textMuted,
    });
    floorLabel.textContent = tr('label.discarded', 'discarded');

    const roots: SVGElement[] = [
      pendingLayer,
      solidLayer,
      badgeLayer,
      nodeLayer,
      cardLayer,
      floorLine,
      floorLabel,
      queueLabel,
      caption,
    ];
    for (const node of roots) svg.appendChild(node);

    // ── 시간
    let destroyed = false;
    let waitSeq = 0;
    const waits = new Map<
      number,
      { timer: ReturnType<typeof setTimeout>; resolve: () => void }
    >();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const key = (waitSeq += 1);
        const timer = setTimeout(() => {
          waits.delete(key);
          resolve();
        }, ms);
        waits.set(key, { timer, resolve });
      });

    // ── 상태
    let nodeOrder: string[] = [];
    let edgeList: StageEdge[] = [];
    const positions = new Map<string, Point>();
    const nodeParts = new Map<string, NodeParts>();
    const edgeParts = new Map<string, EdgeParts>();
    const cardParts = new Map<string, CardParts>();
    const edgeIdByPair = new Map<string, string>();
    const groupTone = new Map<string, string>();
    const nodeTone = new Map<string, string>();
    const keptIds = new Set<string>();
    let dropOccupied: number[] = [];
    let dropCount = 0;

    const clearLayer = (layer: SVGGElement): void => {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };

    const midpointOf = (edge: StageEdge): Point => {
      const a = positions.get(edge.u);
      const b = positions.get(edge.v);
      if (!a || !b) return { x: cx, y: ringCy };
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const applyPose = (parts: CardParts): void => {
      const p = parts.pose;
      parts.g.style.transform = `translate(${p.left}px, ${p.top}px) rotate(${p.rotate}deg) scale(${p.scale})`;
    };

    const poseInQueue = (parts: CardParts, index: number): void => {
      parts.pose = {
        left: PAD,
        top: BODY_TOP + index * (CARD_H + CARD_GAP),
        rotate: 0,
        scale: 1,
      };
      applyPose(parts);
    };

    /** 축소는 중심 기준이라 좌상단을 스케일 1 기준 좌표로 되돌려 둔다. */
    const poseAtCenter = (
      parts: CardParts,
      center: Point,
      scale: number,
      rotate: number,
    ): void => {
      parts.pose = {
        left: center.x - (cardW * scale) / 2 - (cardW - cardW * scale) / 2,
        top: center.y - (CARD_H * scale) / 2 - (CARD_H - CARD_H * scale) / 2,
        rotate,
        scale,
      };
      applyPose(parts);
    };

    const setNodeTone = (node: string, tone: string): void => {
      nodeTone.set(node, tone);
      const parts = nodeParts.get(node);
      if (!parts) return;
      parts.body.style.transition = `fill ${KEEP_MS}ms ease`;
      parts.body.style.fill = tone;
    };

    const showRing = (node: string, tone: string): void => {
      const parts = nodeParts.get(node);
      if (!parts) return;
      parts.ring.style.stroke = tone;
      parts.ring.style.transition = 'opacity 160ms linear';
      parts.ring.style.opacity = '1';
    };

    const hideRing = (node: string): void => {
      const parts = nodeParts.get(node);
      if (!parts) return;
      parts.ring.style.transition = 'opacity 200ms linear';
      parts.ring.style.opacity = '0';
    };

    const buildNode = (node: string, at: Point, tone: string): void => {
      const g = el('g', { transform: `translate(${at.x}, ${at.y})` });

      const ring = el('circle', { r: RING_R, fill: 'none', 'stroke-width': 2.5 });
      ring.style.stroke = palette.itemComparing;
      ring.style.opacity = '0';

      const pulse = el('circle', { r: NODE_R, fill: 'none', 'stroke-width': 3 });
      pulse.style.stroke = tone;
      pulse.style.opacity = '0';
      centerOrigin(pulse);

      const body = el('circle', {
        r: NODE_R,
        stroke: palette.border,
        'stroke-width': 1.5,
      });
      body.style.fill = tone;

      const label = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 700,
        // 무리 색은 테마를 따라 뒤집지 않는 고정 타일이라 잉크도 고정한다 (S-view).
        fill: palette.stateInk,
      });
      label.textContent = node;

      g.appendChild(ring);
      g.appendChild(pulse);
      g.appendChild(body);
      g.appendChild(label);
      nodeLayer.appendChild(g);
      nodeParts.set(node, { ring, pulse, body });
    };

    const buildEdge = (edge: StageEdge): void => {
      const a = positions.get(edge.u);
      const b = positions.get(edge.v);
      if (!a || !b) return;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const geometry = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };

      const pending = el('line', {
        ...geometry,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 5',
      });
      pending.style.stroke = palette.border;
      pendingLayer.appendChild(pending);

      const solid = el('line', { ...geometry, 'stroke-linecap': 'round' });
      solid.style.stroke = palette.itemSorted;
      solid.style.strokeWidth = '3';
      solid.style.strokeDasharray = String(length);
      solid.style.strokeDashoffset = String(length);
      solid.style.opacity = '0';
      solidLayer.appendChild(solid);

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const badge = el('g', { transform: `translate(${mid.x}, ${mid.y})` });
      badge.appendChild(
        el('circle', {
          r: 11,
          fill: palette.bg,
          stroke: palette.itemSorted,
          'stroke-width': 1.5,
        }),
      );
      const badgeText = el('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: palette.text,
      });
      badgeText.textContent = String(edge.weight);
      badge.appendChild(badgeText);
      badge.style.opacity = '0';
      badgeLayer.appendChild(badge);

      edgeParts.set(edge.id, { edge, pending, solid, badge, length });
      edgeIdByPair.set(pairKey(edge.u, edge.v), edge.id);
    };

    const buildCard = (edge: StageEdge, index: number): void => {
      const g = el('g');
      centerOrigin(g);

      const rect = el('rect', {
        x: 0,
        y: 0,
        width: cardW,
        height: CARD_H,
        rx: 6,
        fill: palette.itemDefault,
        'stroke-width': 1.5,
      });
      rect.style.stroke = palette.border;

      const name = el('text', {
        x: 12,
        y: CARD_H / 2 + 5,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: palette.text,
      });
      name.textContent = `${edge.u}${EDGE_NAME_JOINER}${edge.v}`;

      const weight = el('text', {
        x: cardW - 16,
        y: CARD_H / 2 + 5,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: palette.text,
      });
      weight.textContent = String(edge.weight);

      const cross = el('g', {
        transform: `translate(${cardW - 16}, ${CARD_H / 2})`,
        stroke: palette.danger,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      });
      cross.appendChild(
        el('line', { x1: -CROSS_HALF, y1: -CROSS_HALF, x2: CROSS_HALF, y2: CROSS_HALF }),
      );
      cross.appendChild(
        el('line', { x1: CROSS_HALF, y1: -CROSS_HALF, x2: -CROSS_HALF, y2: CROSS_HALF }),
      );
      cross.style.opacity = '0';

      g.appendChild(rect);
      g.appendChild(name);
      g.appendChild(weight);
      g.appendChild(cross);
      cardLayer.appendChild(g);

      const parts: CardParts = {
        g,
        rect,
        cross,
        pose: { left: PAD, top: BODY_TOP, rotate: 0, scale: 1 },
      };
      cardParts.set(edge.id, parts);
      poseInQueue(parts, index);
    };

    const render = (nodes: string[], edges: StageEdge[]): void => {
      nodeOrder = [...nodes];
      edgeList = edges.map((e) => ({ ...e }));

      clearLayer(pendingLayer);
      clearLayer(solidLayer);
      clearLayer(badgeLayer);
      clearLayer(nodeLayer);
      clearLayer(cardLayer);
      positions.clear();
      nodeParts.clear();
      edgeParts.clear();
      cardParts.clear();
      edgeIdByPair.clear();
      groupTone.clear();
      nodeTone.clear();
      keptIds.clear();
      dropOccupied = [];
      dropCount = 0;

      // 무리 식별 색. 처음에는 정점 하나가 곧 무리 하나다.
      const tones = categorical(Math.max(1, nodeOrder.length), 'pastel');
      nodeOrder.forEach((node, i) => {
        groupTone.set(node, tones[i % tones.length] ?? palette.itemDefault);
      });

      // nodes[0] 은 갓돌, 나머지는 좌상에서 시계 방향으로 타원에 균등 배치.
      const crown = nodeOrder[0];
      if (crown !== undefined) positions.set(crown, { x: cx, y: crownY });
      const rest = nodeOrder.slice(1);
      rest.forEach((node, i) => {
        const angle = -0.75 * Math.PI + (i * 2 * Math.PI) / rest.length;
        positions.set(node, {
          x: cx + rx * Math.cos(angle),
          y: ringCy + ry * Math.sin(angle),
        });
      });

      for (const edge of edgeList) buildEdge(edge);
      for (const node of nodeOrder) {
        const at = positions.get(node);
        const tone = groupTone.get(node) ?? palette.itemDefault;
        nodeTone.set(node, tone);
        if (at) buildNode(node, at, tone);
      }
      // 카드는 선언된 순서 그대로 선다. 무게 순으로 서는 것은 setQueue 의 일이다.
      edgeList.forEach((edge, i) => buildCard(edge, i));
    };

    return {
      setLayout(nodes: string[], edges: StageEdge[]): void {
        render(nodes, edges);
      },

      /**
       * 무게 순으로 줄이 다시 선다.
       *
       * 첫 틈을 반드시 둔다 — 되감기 직후에는 카드가 방금 새로 만들어진 것이라,
       * 같은 프레임에 새 자리를 주면 브라우저가 전이의 시작점을 잡지 못하고
       * 순간이동으로 보인다. 그러면 이 걸음은 죽은 걸음이 된다.
       */
      async setQueue(order: StageEdge[]): Promise<void> {
        await wait(FRAME_MS);
        order.forEach((item, index) => {
          const parts = cardParts.get(item.id);
          if (!parts) return;
          parts.g.style.transition = `transform ${SORT_MS}ms ${EASE} ${index * SORT_STAGGER_MS}ms`;
          poseInQueue(parts, index);
        });
        await wait(SORT_MS + SORT_STAGGER_MS * Math.max(0, order.length - 1));
      },

      /** 줄 맨 위 카드가 떠서 그래프의 제 자리로 간다. */
      async pickEdge(pick: { id: string; u: string; v: string }): Promise<void> {
        const parts = cardParts.get(pick.id);
        const found = edgeParts.get(pick.id);
        if (found) {
          found.pending.style.transition = 'stroke 160ms linear';
          found.pending.style.stroke = palette.itemComparing;
          found.pending.style.strokeWidth = '2.5';
        }
        showRing(pick.u, palette.itemComparing);
        showRing(pick.v, palette.itemComparing);
        if (parts) {
          // 맨 위로 올려 그래프 위를 지나가게 한다.
          cardLayer.appendChild(parts.g);
          parts.rect.style.transition = 'stroke 160ms linear';
          parts.rect.style.stroke = palette.itemComparing;
          parts.rect.style.strokeWidth = '2.5';
          parts.g.style.transition = `transform ${FLY_MS}ms ${EASE}`;
          if (found) {
            const mid = midpointOf(found.edge);
            const clampedX = Math.max(
              PAD + pickedW / 2,
              Math.min(W - PAD - pickedW / 2, mid.x),
            );
            poseAtCenter(parts, { x: clampedX, y: mid.y }, PICKED_SCALE, 0);
          }
        }
        await wait(FLY_MS);
      },

      /** 양 끝이 다른 무리라 간선이 놓이고, 두 무리가 하나가 된다. */
      async keepEdge(keep: {
        id: string;
        u: string;
        v: string;
        groupId: string;
        members: string[];
      }): Promise<void> {
        const found = edgeParts.get(keep.id);
        const card = cardParts.get(keep.id);
        const tone = groupTone.get(keep.groupId) ?? palette.itemDefault;

        hideRing(keep.u);
        hideRing(keep.v);

        if (card && found) {
          // 카드가 간선 자리로 빨려 들어가고 그 자리에서 선이 자란다.
          card.g.style.transition = `transform ${KEEP_MS}ms ${EASE}, opacity ${KEEP_MS}ms linear`;
          const mid = midpointOf(found.edge);
          poseAtCenter(card, mid, ABSORB_SCALE, 0);
          card.g.style.opacity = '0';
        }
        if (found) {
          found.pending.style.transition = 'opacity 200ms linear';
          found.pending.style.opacity = '0';
          found.solid.style.opacity = '1';
          found.solid.style.transition = `stroke-dashoffset ${KEEP_MS}ms ${EASE}`;
          found.solid.style.strokeDashoffset = '0';
          found.badge.style.transition = `opacity 220ms linear ${Math.round(KEEP_MS * 0.6)}ms`;
          found.badge.style.opacity = '1';
          keptIds.add(keep.id);
        }

        // 진 쪽 무리가 이긴 쪽 색으로 물든다 — 색이 곧 무리 정체성이다.
        const changed = keep.members.filter((m) => nodeTone.get(m) !== tone);
        for (const member of keep.members) setNodeTone(member, tone);

        await wait(FRAME_MS);
        for (const member of changed) {
          const parts = nodeParts.get(member);
          if (!parts) continue;
          parts.pulse.style.transition = 'none';
          parts.pulse.style.stroke = tone;
          parts.pulse.style.transform = 'scale(1)';
          parts.pulse.style.opacity = '0.95';
        }
        await wait(FRAME_MS);
        for (const member of changed) {
          const parts = nodeParts.get(member);
          if (!parts) continue;
          parts.pulse.style.transition = `transform ${KEEP_MS}ms ease-out, opacity ${KEEP_MS}ms ease-out`;
          parts.pulse.style.transform = 'scale(1.9)';
          parts.pulse.style.opacity = '0';
        }
        await wait(Math.max(FRAME_MS, KEEP_MS - FRAME_MS * 2));
      },

      /** 이미 한 무리라 고리가 된다. 까닭을 먼저 보이고 나서 떨어뜨린다. */
      async discardEdge(discard: {
        id: string;
        u: string;
        v: string;
        cyclePath: string[];
      }): Promise<void> {
        const found = edgeParts.get(discard.id);
        const card = cardParts.get(discard.id);

        // 1. 이미 이어져 있던 길이 먼저 켜진다. 그것이 버리는 까닭이다.
        const pathEdges: EdgeParts[] = [];
        for (let i = 0; i + 1 < discard.cyclePath.length; i += 1) {
          const a = discard.cyclePath[i];
          const b = discard.cyclePath[i + 1];
          if (a === undefined || b === undefined) continue;
          const id = edgeIdByPair.get(pairKey(a, b));
          const part = id === undefined ? undefined : edgeParts.get(id);
          if (part && keptIds.has(part.edge.id)) pathEdges.push(part);
        }
        for (const part of pathEdges) {
          part.solid.style.transition = 'stroke 160ms linear, stroke-width 160ms linear';
          part.solid.style.stroke = palette.danger;
          part.solid.style.strokeWidth = '4.5';
        }
        for (const node of discard.cyclePath) showRing(node, palette.danger);
        await wait(CYCLE_PATH_MS);

        // 2. 집어 든 간선이 그 위에 놓여 고리를 닫는다.
        if (found) {
          found.solid.style.stroke = palette.danger;
          found.solid.style.strokeWidth = '4.5';
          found.solid.style.opacity = '1';
          found.solid.style.transition = `stroke-dashoffset ${CYCLE_CLOSE_MS}ms linear`;
          found.solid.style.strokeDashoffset = '0';
          found.pending.style.transition = 'opacity 160ms linear';
          found.pending.style.opacity = '0';
        }
        if (card) {
          card.rect.style.stroke = palette.danger;
          card.cross.style.transition = 'opacity 160ms linear';
          card.cross.style.opacity = '1';
        }
        await wait(CYCLE_CLOSE_MS);

        // 3. 고리를 풀고, 그 간선만 떨어져 나간다.
        for (const part of pathEdges) {
          part.solid.style.transition = `stroke ${DROP_MS}ms linear, stroke-width ${DROP_MS}ms linear`;
          part.solid.style.stroke = palette.itemSorted;
          part.solid.style.strokeWidth = '3';
        }
        for (const node of discard.cyclePath) hideRing(node);
        if (found) {
          found.solid.style.transition = 'opacity 200ms linear';
          found.solid.style.opacity = '0';
        }
        if (card) {
          const mid = found ? midpointOf(found.edge) : { x: cx, y: ringCy };
          let dropX = Math.max(
            PAD + pickedW / 2,
            Math.min(W - PAD - pickedW / 2, mid.x),
          );
          while (dropOccupied.some((taken) => Math.abs(taken - dropX) < pickedW + 8)) {
            dropX += pickedW + 8;
          }
          dropX = Math.min(W - PAD - pickedW / 2, dropX);
          dropOccupied.push(dropX);
          const tilt = dropCount % 2 === 0 ? -DROP_TILT_DEG : DROP_TILT_DEG;
          dropCount += 1;
          card.g.style.transition = `transform ${DROP_MS}ms ${FALL_EASE}`;
          poseAtCenter(
            card,
            { x: dropX, y: DROP_CENTER_Y },
            PICKED_SCALE,
            tilt,
          );
        }
        await wait(DROP_MS);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 처음으로 되돌린다. 가장 정직한 방법은 다시 세우는 것이다. */
      rewind(): void {
        render(nodeOrder, edgeList);
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const entry of waits.values()) {
          clearTimeout(entry.timer);
          entry.resolve();
        }
        waits.clear();
        clearLayer(pendingLayer);
        clearLayer(solidLayer);
        clearLayer(badgeLayer);
        clearLayer(nodeLayer);
        clearLayer(cardLayer);
        for (const node of roots) node.remove();
      },
    };
  },
};
