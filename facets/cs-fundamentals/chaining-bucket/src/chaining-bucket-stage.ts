/**
 * chaining-bucket-stage — 체이닝 조각 전용 시각화.
 *
 * 동사가 "매달린다" 이므로 화면의 축은 **세로**다.
 *
 *   ┌ 들어오는 길(lane) ─ 키가 왼쪽 밖에서 들어와 자기 자리 위까지 가로로 온다
 *   ├ 자리 줄(bar)      ─ 버킷 여덟이 캔버스 폭을 채우고, 칸마다 고리가 달려 있다
 *   └ 사슬(chain)       ─ 고리 아래로 칸이 세로로 이어진다
 *
 * 빈 자리에는 곧장 내려가 걸리고, 이미 무언가 매달린 자리에는 **옆 칸으로 내려가
 * 사슬 끝에 걸어 넣는다.** 먼저 온 것은 한 픽셀도 움직이지 않는다 — 그것이 이
 * 조각이 하는 주장이다.
 *
 * 찾기는 반대 방향의 운동이다. 질의 표는 왼쪽 밖에서 포물선을 그리며 다른 자리를
 * 건너뛰고 목표 자리로 날아온 뒤, 그 사슬만 한 칸씩 내려가며 견준다.
 *
 * 문안은 하나도 여기 있지 않다. 캡션은 projector 가 `runtime.t` 로 해석해 넘긴다 (C10).
 * 자리 번호(0..7)는 도형에 새겨진 표식이라 키를 만들지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  radii,
  space,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** '12px' 같은 CSS 토큰을 SVG 좌표계의 수로. 토큰 경유를 유지하기 위한 변환만 한다. */
const px = (token: string): number => Number.parseFloat(token);

// ── 가로. 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
const CANVAS_W = PIECE_CANVAS_W;
const SIDE_MIN = px(space.xl);
const SLOT_MAX_W = 78;
const NODE_INSET = 2;
const CELL_INSET = 3;
const PROBE_MAX_W = 62;
const PROBE_GAP = px(space.sm);

// ── 세로. 내용이 정한다.
const LANE_Y = px(space.md);
const NODE_H = 34;
const KEY_BASELINE = 14;
const HASH_BASELINE = 27;
const BAR_Y = 60;
const BAR_H = 26;
const HOOK_H = 14;
const HOOK_STUB = 6;
const LINK_GAP = 14;
const PITCH = NODE_H + LINK_GAP;
const CHAIN_TOP = BAR_Y + BAR_H + HOOK_H;
/** 이 조각이 보이는 가장 긴 사슬. 자리 하나에 셋이 걸린다. */
const MAX_DEPTH = 3;
const CHAIN_BOTTOM = CHAIN_TOP + (MAX_DEPTH - 1) * PITCH + NODE_H;
const CAPTION_Y = CHAIN_BOTTOM + px(space.xl) - 2;
const STAGE_H = CAPTION_Y + px(space.md);
const PROBE_H = 22;
const PROBE_BASELINE = 15;
const ARC_RISE = 28;

// ── 걸음 안의 운동 시간. 걸음 간격(stepMs)과 별개로 짧게 유지한다.
const TRAVEL_MS = 300;
const DROP_MS = 320;
const HOOK_MS = 180;
const LINK_MS = 150;
const JUMP_MS = 340;
const PROBE_MS = 240;

const DEFAULT_BUCKETS = 8;

const STROKE_W = 1.5;
const CHAIN_STROKE_W = 2;
const ACTIVE_STROKE_W = 2;

type NodeState = 'default' | 'comparing' | 'visited' | 'match';

type ChainNode = {
  g: SVGGElement;
  box: SVGRectElement;
  keyText: SVGTextElement;
  hashText: SVGTextElement;
};

type BucketCell = {
  box: SVGRectElement;
  label: SVGTextElement;
};

export type HangKeyInput = {
  key: string;
  hash: number;
  bucket: number;
  depth: number;
  caption: string;
};

export type JumpInput = { key: string; bucket: number; caption: string };

export type CompareInput = { bucket: number; depth: number; match: boolean; caption: string };

export type SettleInput = { caption: string };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const nowMs = (): number =>
  typeof performance === 'object' && performance !== null ? performance.now() : Date.now();

export const chainingBucketStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container, params): ViewInstance {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;

    const rawCount = params.initialData?.bucketCount;
    const bucketCount =
      typeof rawCount === 'number' && rawCount > 0 ? Math.floor(rawCount) : DEFAULT_BUCKETS;

    // 남는 폭을 좌우로 버리지 않는다. 칸 폭은 캔버스에서 역산한다.
    const slotW = Math.min(SLOT_MAX_W, Math.floor((CANVAS_W - SIDE_MIN * 2) / bucketCount));
    const originX = Math.round((CANVAS_W - bucketCount * slotW) / 2);
    const nodeW = slotW - NODE_INSET * 2;
    const probeW = Math.min(PROBE_MAX_W, nodeW);
    const laneStartX = -nodeW;

    const cx = (b: number): number => originX + b * slotW + slotW / 2;
    const nodeTop = (depth: number): number => CHAIN_TOP + depth * PITCH;

    /** 이미 매달린 것을 밀치지 않으려면 옆 칸으로 내려간다. 오른쪽이 없으면 왼쪽. */
    const descentX = (b: number): number => {
      const right = cx(b) + slotW;
      return right + nodeW / 2 <= CANVAS_W ? right : cx(b) - slotW;
    };

    /** 질의 표가 사슬을 훑을 때 서는 자리 — 사슬 왼쪽, 없으면 오른쪽. */
    const probeLaneX = (b: number): number => {
      const left = cx(b) - nodeW / 2 - PROBE_GAP - probeW / 2;
      return left - probeW / 2 >= 0 ? left : cx(b) + nodeW / 2 + PROBE_GAP + probeW / 2;
    };

    // ── 레이어. 사슬은 칸 뒤에, 질의 표는 맨 앞에.
    const root = el('g');
    const barLayer = el('g');
    const linkLayer = el('g');
    const nodeLayer = el('g');
    const probeLayer = el('g');
    root.append(barLayer, linkLayer, nodeLayer, probeLayer);
    svg.appendChild(root);

    // ── 자리 줄. 칸마다 번호와 고리.
    const cells: BucketCell[] = [];
    for (let b = 0; b < bucketCount; b += 1) {
      const box = el('rect', {
        x: originX + b * slotW + CELL_INSET,
        y: BAR_Y,
        width: slotW - CELL_INSET * 2,
        height: BAR_H,
        rx: px(radii.sm),
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': STROKE_W,
      });
      const label = el('text', {
        x: cx(b),
        y: BAR_Y + BAR_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': px(fontSizes.sm),
        fill: c.textMuted,
      });
      label.textContent = String(b);
      const hook = el('line', {
        x1: cx(b),
        y1: BAR_Y + BAR_H,
        x2: cx(b),
        y2: BAR_Y + BAR_H + HOOK_STUB,
        stroke: c.border,
        'stroke-width': CHAIN_STROKE_W,
        'stroke-linecap': 'round',
      });
      barLayer.append(box, label, hook);
      cells.push({ box, label });
    }

    // ── 질의 표. 찾을 때만 나온다.
    const probeG = el('g', { display: 'none' });
    const probeBox = el('rect', {
      x: -probeW / 2,
      y: 0,
      width: probeW,
      height: PROBE_H,
      rx: px(radii.lg),
      fill: c.risingMarker,
    });
    const probeText = el('text', {
      x: 0,
      y: PROBE_BASELINE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': px(fontSizes.sm),
      'font-weight': 600,
      fill: c.bg,
    });
    probeG.append(probeBox, probeText);
    probeLayer.appendChild(probeG);

    const caption = el('text', {
      x: CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': px(fontSizes.sm),
      fill: c.textMuted,
    });
    root.appendChild(caption);

    // ── 진행 중인 운동. rewind / destroy 에서 전부 걷어낸다.
    const running = new Set<() => void>();
    const stopAll = (): void => {
      for (const cancel of [...running]) cancel();
      running.clear();
    };

    const animate = (durationMs: number, apply: (t: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
          apply(1);
          resolve();
          return;
        }
        const started = nowMs();
        let handle = 0;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          running.delete(cancel);
          apply(1);
          resolve();
        };
        const cancel = (): void => {
          cancelAnimationFrame(handle);
          finish();
        };
        const tick = (): void => {
          const t = Math.min(1, (nowMs() - started) / durationMs);
          apply(easeInOut(t));
          if (t >= 1) {
            finish();
            return;
          }
          handle = requestAnimationFrame(tick);
        };
        running.add(cancel);
        handle = requestAnimationFrame(tick);
      });

    const place = (g: SVGGElement, x: number, y: number): void => {
      g.setAttribute('transform', `translate(${x} ${y})`);
    };

    const chains: ChainNode[][] = Array.from({ length: bucketCount }, () => []);
    let lastCompared: ChainNode | null = null;

    // 질의 표의 현재 자리. 다음 운동의 출발점이라 좌표로 들고 있는다.
    let probePos = { x: laneStartX, y: LANE_Y };
    const placeProbe = (x: number, y: number): void => {
      probePos = { x, y };
      place(probeG, x, y);
    };

    const setCaption = (text: string): void => {
      caption.textContent = text;
    };

    const setCellActive = (b: number, active: boolean): void => {
      const cell = cells[b];
      if (!cell) return;
      cell.box.setAttribute('stroke', active ? c.itemActive : c.border);
      cell.box.setAttribute('stroke-width', String(active ? ACTIVE_STROKE_W : STROKE_W));
      cell.label.setAttribute('fill', active ? c.text : c.textMuted);
    };

    const setNodeState = (node: ChainNode, state: NodeState): void => {
      const chip = state === 'comparing' ? c.itemComparing : state === 'match' ? c.itemPivot : null;
      node.box.setAttribute('fill', chip ?? c.bg);
      node.box.setAttribute(
        'stroke',
        chip ?? (state === 'visited' ? c.textMuted : c.border),
      );
      node.keyText.setAttribute('fill', chip === null ? c.text : c.stateInk);
      node.hashText.setAttribute('fill', chip === null ? c.textMuted : c.stateInk);
    };

    const makeNode = (key: string, hash: number): ChainNode => {
      const g = el('g');
      const box = el('rect', {
        x: -nodeW / 2,
        y: 0,
        width: nodeW,
        height: NODE_H,
        rx: px(radii.md),
        fill: c.bg,
        stroke: c.border,
        'stroke-width': STROKE_W,
      });
      const keyText = el('text', {
        x: 0,
        y: KEY_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': px(fontSizes.sm),
        'font-weight': 600,
        fill: c.text,
      });
      keyText.textContent = key;
      const hashText = el('text', {
        x: 0,
        y: HASH_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': px(fontSizes.xs),
        fill: c.textMuted,
      });
      hashText.textContent = String(hash);
      g.append(box, keyText, hashText);
      nodeLayer.appendChild(g);
      return { g, box, keyText, hashText };
    };

    /** 고리(또는 앞 칸)에서 새 칸까지 사슬이 자라난다. */
    const growLink = async (b: number, depth: number): Promise<void> => {
      const from = depth === 0 ? BAR_Y + BAR_H : nodeTop(depth - 1) + NODE_H;
      const to = nodeTop(depth);
      const line = el('line', {
        x1: cx(b),
        y1: from,
        x2: cx(b),
        y2: from,
        stroke: c.textMuted,
        'stroke-width': CHAIN_STROKE_W,
        'stroke-linecap': 'round',
      });
      linkLayer.appendChild(line);
      await animate(LINK_MS, (t) => line.setAttribute('y2', String(lerp(from, to, t))));
    };

    const clampBucket = (b: number): number =>
      Math.max(0, Math.min(bucketCount - 1, Math.floor(b)));

    const clampDepth = (d: number): number => Math.max(0, Math.min(MAX_DEPTH - 1, Math.floor(d)));

    return {
      /**
       * 키 하나가 들어와 매달린다.
       * 빈 자리면 곧장 내려가고, 이미 무언가 있으면 옆 칸으로 내려가 사슬 끝에 건다.
       */
      async hangKey(input: HangKeyInput): Promise<void> {
        setCaption(input.caption);
        const b = clampBucket(input.bucket);
        const depth = clampDepth(input.depth);
        const node = makeNode(input.key, input.hash);
        const landX = cx(b);
        const dropX = depth === 0 ? landX : descentX(b);
        const landY = nodeTop(depth);

        place(node.g, laneStartX, LANE_Y);
        await animate(TRAVEL_MS, (t) => place(node.g, lerp(laneStartX, dropX, t), LANE_Y));
        await animate(DROP_MS, (t) => place(node.g, dropX, lerp(LANE_Y, landY, t)));
        if (depth > 0) {
          await animate(HOOK_MS, (t) => place(node.g, lerp(dropX, landX, t), landY));
        }
        chains[b]?.push(node);
        await growLink(b, depth);
      },

      /** 찾는 키가 다른 자리를 건너뛰고 목표 자리로 곧장 날아온다. */
      async jumpToBucket(input: JumpInput): Promise<void> {
        setCaption(input.caption);
        const b = clampBucket(input.bucket);
        probeText.textContent = input.key;
        probeG.removeAttribute('display');
        const toX = probeLaneX(b);
        const toY = LANE_Y + (NODE_H - PROBE_H) / 2;
        const ctrlX = (laneStartX + toX) / 2;
        const ctrlY = toY - ARC_RISE;
        placeProbe(laneStartX, toY);
        await animate(JUMP_MS, (t) => {
          const u = 1 - t;
          placeProbe(
            u * u * laneStartX + 2 * u * t * ctrlX + t * t * toX,
            u * u * toY + 2 * u * t * ctrlY + t * t * toY,
          );
        });
        setCellActive(b, true);
      },

      /** 그 사슬만 한 칸씩 내려가며 견준다. */
      async compareLink(input: CompareInput): Promise<void> {
        setCaption(input.caption);
        const b = clampBucket(input.bucket);
        const depth = clampDepth(input.depth);
        const node = chains[b]?.[depth];
        if (!node) return;
        if (lastCompared && lastCompared !== node) setNodeState(lastCompared, 'visited');
        const fromY = probePos.y;
        const toY = nodeTop(depth) + (NODE_H - PROBE_H) / 2;
        const toX = probeLaneX(b);
        await animate(PROBE_MS, (t) => placeProbe(toX, lerp(fromY, toY, t)));
        setNodeState(node, input.match ? 'match' : 'comparing');
        lastCompared = input.match ? null : node;
      },

      /** 다 말했다. 마지막 한 마디만 얹는다. */
      settle(input: SettleInput): void {
        setCaption(input.caption);
      },

      /** 판을 비운다. 한 걸음씩 다시 볼 때 처음으로 돌린다. */
      rewind(): void {
        stopAll();
        for (const chain of chains) {
          for (const node of chain) node.g.remove();
          chain.length = 0;
        }
        while (linkLayer.firstChild) linkLayer.removeChild(linkLayer.firstChild);
        lastCompared = null;
        probeG.setAttribute('display', 'none');
        placeProbe(laneStartX, LANE_Y);
        for (let b = 0; b < bucketCount; b += 1) setCellActive(b, false);
        setCaption('');
      },

      destroy(): void {
        stopAll();
        root.remove();
      },
    };
  },
};
