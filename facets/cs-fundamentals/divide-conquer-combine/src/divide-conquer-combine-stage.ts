/**
 * divideConquerCombine 전용 stage view — 재귀 나무를 왕복하는 화면.
 *
 * ── 무엇이 움직이는가
 *
 * 이 조각의 동사는 **왕복**이라 화면의 운동도 왕복이어야 한다. 값 칸이 실제로
 * 자리를 옮긴다. 내려갈 때는 부모 칸에서 떨어져 나온 복제본이 벌어지며 아래
 * 자식 자리로 내려가고, 올라올 때는 자식 칸의 복제본이 부모 자리로 되짚어
 * 오른다. 올라오는 길에 값이 **엇갈린다** — 줄이 서는 것은 올라오는 동안이다.
 *
 * ── 같은 자리, 두 번, 다른 내용
 *
 * 자리(프레임)는 한 번 생기면 사라지지 않는다. 내려갈 때 받은 것은 **문제**라
 * 테두리만 있는 빈 칸이고, 올라올 때 받는 것은 **답**이라 채워진 칸이다.
 * 부모 프레임의 칸 수는 자식 둘의 합이라 크기가 변하지 않는다 — 자리는 그대로고
 * 들고 있는 것만 바뀐다.
 *
 * ── 순서 표식
 *
 * 갈래 자리마다 `↓n` (몇 번째로 쪼개졌는지) 와 `↑n` (몇 번째로 합쳐졌는지) 을
 * 남긴다. 재생이 끝난 뒤에도 남으므로, 뿌리의 `↓1 ↑3` 이 이 조각의 주장을
 * 정지 화면으로 말한다. 화살표와 숫자는 도형에 새긴 표식이라 번역하지 않는다 (C10).
 *
 * ── 세로
 *
 * mount 에서 잎 개수를 보고 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view).
 * 재생 중 viewBox 를 다시 재면 글 안에 박힌 그림의 아래 문단이 밀린다.
 *
 * ── destroy
 *
 * 애니메이션은 스스로 다음 회차를 예약하는 rAF 루프다. `destroyed` 플래그와
 * 예약 목록으로 전부 거둔다 — 남기는 타이머는 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece "그 폭을 채운다"). */
const CELL_MAX_W = 52;
const CELL_H = 36;
const SIDE_MIN = 30;
const TOP_Y = 42;
const ROW_GAP = 86;
const CAPTION_GAP = 26;
const CAPTION_LINE = 17;
const BOTTOM_PAD = 15;
const DEFAULT_LEAF_COUNT = 4;

const BADGE_W = 26;
const BADGE_H = 16;
const BADGE_OFFSET = 10;

const MOVE_MS = 460;
const SEED_MS = 300;
const SETTLE_MS = 170;
const RING_MS = 300;
const SPLIT_BOW = 16;
const MERGE_BOW = -18;

/** 도형에 새긴 표식 — 방향 화살표. 번역 대상이 아니다 (C10). */
const MARK_DOWN = '↓';
const MARK_UP = '↑';

/** SVG 의 rx 는 수치라 토큰 문자열('6px')에서 값을 꺼내 쓴다. */
const CELL_R = Number.parseInt(radii.md, 10);
const RING_R = Number.parseInt(radii.lg, 10);

function stageHeight(maxDepth: number): number {
  return TOP_Y + maxDepth * ROW_GAP + CELL_H / 2 + CAPTION_GAP + CAPTION_LINE + BOTTOM_PAD;
}

export type DcSplitSpec = {
  nodeId: string;
  leftId: string;
  leftValues: number[];
  rightId: string;
  rightValues: number[];
  order: number;
};

export type DcMergeSpec = {
  nodeId: string;
  leftId: string;
  rightId: string;
  values: number[];
  /** values[k] 가 온 쪽 — 'L' 또는 'R'. */
  fromSide: string[];
  /** values[k] 가 온 자식의 칸 번호. */
  fromSlot: number[];
  order: number;
};

type NodeState = 'problem' | 'answer';

type StageNode = {
  id: string;
  depth: number;
  index: number;
  values: number[];
  state: NodeState;
  splitOrder: number;
  mergeOrder: number;
  group: SVGGElement;
};

type Pending = { id: number; raf: boolean };

function attr(node: Element, attrs: Record<string, string | number>): void {
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
}

function shape<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  attr(node, attrs);
  return node;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function stamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * 글자 폭 어림. SVG 는 줄바꿈이 없어 캡션을 손으로 접어야 하는데, 한글은 한 글자가
 * 거의 글자 크기만 하고 라틴 문자는 그 절반쯤이라 문자별로 나눠 잰다.
 */
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.54;
  return w;
}

function wrapTwoLines(text: string, size: number, maxWidth: number): string[] {
  if (textWidth(text, size) <= maxWidth) return [text];
  const words = text.split(' ');
  let head = '';
  let tail = '';
  for (const word of words) {
    const next = head === '' ? word : `${head} ${word}`;
    if (tail === '' && textWidth(next, size) <= maxWidth) head = next;
    else tail = tail === '' ? word : `${tail} ${word}`;
  }
  return head === '' ? [text] : [head, tail];
}

export const divideConquerCombineStageView: CanvasView = {
  canvas: { height: stageHeight(Math.round(Math.log2(DEFAULT_LEAF_COUNT))) },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const palette = getColors(params.theme);

    // ── 잎 개수는 초기 데이터가 정한다. 세로는 여기서 한 번 정하고 다시 재지 않는다.
    const initial = params.initialData ?? {};
    const seedValues = initial.values;
    const leafCount =
      Array.isArray(seedValues) && seedValues.length > 0 ? seedValues.length : DEFAULT_LEAF_COUNT;
    const maxDepth = Math.max(1, Math.round(Math.log2(leafCount)));
    const height = stageHeight(maxDepth);
    attr(svg, { viewBox: `0 0 ${PIECE_CANVAS_W} ${height}` });

    // ── 격자. 칸 폭은 캔버스에서 역산하고 남는 폭은 나무가 벌어지는 틈으로 쓴다.
    const usable = PIECE_CANVAS_W - SIDE_MIN * 2;
    const cellW = Math.min(CELL_MAX_W, Math.floor(usable / (leafCount * 2)));
    const slack = Math.max(0, usable - cellW * leafCount);

    // 잎 사이 틈은 두 잎의 최소 공통 조상이 얕을수록 넓다 — 나무가 아래로 벌어진다.
    const gapWeights: number[] = [];
    for (let i = 0; i + 1 < leafCount; i += 1) {
      let shared = 0;
      for (let bit = maxDepth - 1; bit >= 0; bit -= 1) {
        if (((i >> bit) & 1) !== (((i + 1) >> bit) & 1)) break;
        shared += 1;
      }
      gapWeights.push(Math.pow(2, maxDepth - 1 - shared));
    }
    const weightSum = gapWeights.reduce((acc, w) => acc + w, 0) || 1;
    const unit = slack / weightSum;

    const span = cellW * leafCount + slack;
    const originX = Math.round((PIECE_CANVAS_W - span) / 2);

    const leafX: number[] = [];
    let cursorX = originX;
    for (let i = 0; i < leafCount; i += 1) {
      leafX.push(cursorX + cellW / 2);
      cursorX += cellW + (gapWeights[i] ?? 0) * unit;
    }

    // 자리의 가로 중심 — 잎에서 위로 접어 올린다. 부모는 두 자식의 한가운데다.
    const centers: number[][] = [];
    centers[maxDepth] = leafX;
    for (let d = maxDepth - 1; d >= 0; d -= 1) {
      const below = centers[d + 1];
      const row: number[] = [];
      for (let i = 0; i * 2 + 1 < below.length; i += 1) {
        row.push((below[i * 2] + below[i * 2 + 1]) / 2);
      }
      centers[d] = row;
    }

    const rowY = (depth: number): number => TOP_Y + depth * ROW_GAP;
    const cellCount = (depth: number): number => Math.max(1, Math.round(leafCount / Math.pow(2, depth)));
    const nodeCenter = (depth: number, index: number): number => centers[depth]?.[index] ?? PIECE_CANVAS_W / 2;
    const nodeLeft = (node: StageNode): number =>
      nodeCenter(node.depth, node.index) - (cellCount(node.depth) * cellW) / 2;
    const slotX = (node: StageNode, slot: number): number =>
      nodeLeft(node) + slot * cellW + cellW / 2;

    // ── 그림 층. 뒤에 붙는 것이 위에 온다.
    const root = shape('g', {});
    const linkLayer = shape('g', {});
    const frameLayer = shape('g', {});
    const flyLayer = shape('g', {});
    const captionLayer = shape('g', {});
    root.appendChild(linkLayer);
    root.appendChild(frameLayer);
    root.appendChild(flyLayer);
    root.appendChild(captionLayer);
    svg.appendChild(root);

    const captionSize = Number.parseInt(fontSizes.sm, 10);
    const captionY = TOP_Y + maxDepth * ROW_GAP + CELL_H / 2 + CAPTION_GAP;

    // ── 상태
    const nodes = new Map<string, StageNode>();
    const links = new Map<string, SVGLineElement>();
    let rootId = '';
    let emphasized = false;
    let destroyed = false;
    const pending = new Set<Pending>();

    function schedule(fn: () => void): void {
      if (destroyed) return;
      const entry: Pending = { id: 0, raf: typeof requestAnimationFrame === 'function' };
      const run = (): void => {
        pending.delete(entry);
        fn();
      };
      entry.id = entry.raf
        ? requestAnimationFrame(run)
        : (setTimeout(run, 16) as unknown as number);
      pending.add(entry);
    }

    function clearPending(): void {
      for (const entry of pending) {
        if (entry.raf) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(entry.id);
        } else {
          clearTimeout(entry.id as unknown as ReturnType<typeof setTimeout>);
        }
      }
      pending.clear();
    }

    function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const begun = stamp();
        const tick = (): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const raw = Math.min(1, (stamp() - begun) / ms);
          onFrame(easeInOut(raw));
          if (raw >= 1) {
            resolve();
            return;
          }
          schedule(tick);
        };
        schedule(tick);
      });
    }

    // ── 그리기

    function paintBadge(
      parent: SVGGElement,
      mark: string,
      order: number,
      centerX: number,
      centerY: number,
      lit: boolean,
    ): void {
      const badge = shape('g', {});
      badge.appendChild(
        shape('rect', {
          x: centerX - BADGE_W / 2,
          y: centerY - BADGE_H / 2,
          width: BADGE_W,
          height: BADGE_H,
          rx: BADGE_H / 2,
          fill: lit ? palette.accent : 'none',
        }),
      );
      const label = shape('text', {
        x: centerX,
        y: centerY + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: lit ? palette.stateInk : palette.textMuted,
      });
      label.textContent = `${mark}${order}`;
      badge.appendChild(label);
      parent.appendChild(badge);
    }

    function paintNode(node: StageNode, active: boolean): void {
      clear(node.group);
      const y = rowY(node.depth) - CELL_H / 2;
      const answered = node.state === 'answer';
      const count = cellCount(node.depth);

      for (let slot = 0; slot < count; slot += 1) {
        const x = slotX(node, slot) - cellW / 2;
        node.group.appendChild(
          shape('rect', {
            x,
            y,
            width: cellW,
            height: CELL_H,
            rx: CELL_R,
            fill: answered ? palette.itemSorted : palette.itemDefault,
            stroke: active ? palette.itemActive : palette.border,
            'stroke-width': active ? 2 : 1,
          }),
        );
        const value = node.values[slot];
        if (typeof value !== 'number') continue;
        const text = shape('text', {
          x: x + cellW / 2,
          y: y + CELL_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: answered ? palette.textInverse : palette.text,
        });
        text.textContent = String(value);
        node.group.appendChild(text);
      }

      const lit = emphasized && node.id === rootId;
      const left = nodeLeft(node);
      const right = left + count * cellW;
      const midY = rowY(node.depth);
      if (node.splitOrder > 0) {
        paintBadge(node.group, MARK_DOWN, node.splitOrder, left - BADGE_OFFSET - BADGE_W / 2, midY, lit);
      }
      if (node.mergeOrder > 0) {
        paintBadge(node.group, MARK_UP, node.mergeOrder, right + BADGE_OFFSET + BADGE_W / 2, midY, lit);
      }
    }

    function makeNode(id: string, depth: number, index: number, values: number[], state: NodeState): StageNode {
      const group = shape('g', {});
      frameLayer.appendChild(group);
      const node: StageNode = {
        id,
        depth,
        index,
        values: values.slice(),
        state,
        splitOrder: 0,
        mergeOrder: 0,
        group,
      };
      nodes.set(id, node);
      return node;
    }

    function makeLink(parent: StageNode, child: StageNode): SVGLineElement {
      const x1 = nodeCenter(parent.depth, parent.index);
      const y1 = rowY(parent.depth) + CELL_H / 2;
      const line = shape('line', {
        x1,
        y1,
        x2: x1,
        y2: y1,
        stroke: palette.itemActive,
        'stroke-width': 1.5,
      });
      linkLayer.appendChild(line);
      links.set(child.id, line);
      return line;
    }

    function growLink(line: SVGLineElement, parent: StageNode, child: StageNode, p: number): void {
      const x1 = nodeCenter(parent.depth, parent.index);
      const y1 = rowY(parent.depth) + CELL_H / 2;
      const x2 = nodeCenter(child.depth, child.index);
      const y2 = rowY(child.depth) - CELL_H / 2;
      attr(line, { x2: x1 + (x2 - x1) * p, y2: y1 + (y2 - y1) * p });
    }

    /** 날아가는 복제본 하나. 원본은 제자리에 남는다. */
    function makeFlyer(value: number, answered: boolean): SVGGElement {
      const flyer = shape('g', {});
      flyer.appendChild(
        shape('rect', {
          x: -cellW / 2,
          y: -CELL_H / 2,
          width: cellW,
          height: CELL_H,
          rx: CELL_R,
          fill: answered ? palette.itemSorted : palette.itemDefault,
          stroke: palette.itemActive,
          'stroke-width': 2,
        }),
      );
      const text = shape('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: answered ? palette.textInverse : palette.text,
      });
      text.textContent = String(value);
      flyer.appendChild(text);
      flyLayer.appendChild(flyer);
      return flyer;
    }

    function place(flyer: SVGGElement, x: number, y: number): void {
      attr(flyer, { transform: `translate(${x} ${y})` });
    }

    function paintCaption(lines: string[]): void {
      clear(captionLayer);
      lines.forEach((line, i) => {
        const text = shape('text', {
          x: PIECE_CANVAS_W / 2,
          y: captionY + i * CAPTION_LINE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: palette.textMuted,
        });
        text.textContent = line;
        captionLayer.appendChild(text);
      });
    }

    // ── projector 가 부르는 표면

    /** 나무만 비운다. 캡션은 남긴다 — 걸음은 캡션을 먼저 걸고 그림을 그린다. */
    function clearTree(): void {
      clear(linkLayer);
      clear(frameLayer);
      clear(flyLayer);
      nodes.clear();
      links.clear();
      rootId = '';
      emphasized = false;
    }

    function reset(): void {
      clearTree();
      clear(captionLayer);
    }

    async function seed(values: number[]): Promise<void> {
      clearTree();
      const node = makeNode('r', 0, 0, values, 'problem');
      rootId = node.id;
      paintNode(node, false);
      // 문제 하나가 위에서 내려와 자리를 잡는다.
      await tween(SEED_MS, (p) => {
        attr(node.group, { transform: `translate(0 ${(1 - p) * -18})`, opacity: p });
      });
      attr(node.group, { transform: 'translate(0 0)', opacity: 1 });
    }

    async function split(spec: DcSplitSpec): Promise<void> {
      const parent = nodes.get(spec.nodeId);
      if (!parent) return;
      parent.splitOrder = spec.order;
      paintNode(parent, true);

      const childDepth = parent.depth + 1;
      const left = makeNode(spec.leftId, childDepth, parent.index * 2, spec.leftValues, 'problem');
      const right = makeNode(spec.rightId, childDepth, parent.index * 2 + 1, spec.rightValues, 'problem');
      paintNode(left, false);
      paintNode(right, false);
      attr(left.group, { opacity: 0 });
      attr(right.group, { opacity: 0 });

      const leftLink = makeLink(parent, left);
      const rightLink = makeLink(parent, right);

      // 부모 칸에서 복제본이 떨어져 나와 벌어지며 내려간다.
      const flights: Array<{ flyer: SVGGElement; x0: number; y0: number; x1: number; y1: number }> = [];
      const parentY = rowY(parent.depth);
      const childY = rowY(childDepth);
      const total = spec.leftValues.length + spec.rightValues.length;
      for (let slot = 0; slot < total; slot += 1) {
        const toLeft = slot < spec.leftValues.length;
        const child = toLeft ? left : right;
        const childSlot = toLeft ? slot : slot - spec.leftValues.length;
        const value = child.values[childSlot];
        if (typeof value !== 'number') continue;
        const flyer = makeFlyer(value, false);
        const x0 = slotX(parent, slot);
        const x1 = slotX(child, childSlot);
        place(flyer, x0, parentY);
        flights.push({ flyer, x0, y0: parentY, x1, y1: childY });
      }

      await tween(MOVE_MS, (p) => {
        const bow = Math.sin(Math.PI * p) * SPLIT_BOW;
        for (const f of flights) {
          place(f.flyer, f.x0 + (f.x1 - f.x0) * p, f.y0 + (f.y1 - f.y0) * p + bow);
        }
        growLink(leftLink, parent, left, p);
        growLink(rightLink, parent, right, p);
      });

      for (const f of flights) f.flyer.remove();
      attr(leftLink, { stroke: palette.border });
      attr(rightLink, { stroke: palette.border });
      attr(left.group, { opacity: 1 });
      attr(right.group, { opacity: 1 });
      paintNode(parent, false);
    }

    /** 바닥. 낱개는 이미 답이라, 그 층이 한꺼번에 채워지며 방향이 바뀐다. */
    async function settle(nodeIds: string[]): Promise<void> {
      const targets = nodeIds.map((id) => nodes.get(id)).filter((n): n is StageNode => n !== undefined);
      if (targets.length === 0) return;
      await tween(SETTLE_MS, (p) => {
        for (const node of targets) attr(node.group, { transform: `translate(0 ${p * -7})` });
      });
      for (const node of targets) {
        node.state = 'answer';
        paintNode(node, false);
        attr(node.group, { transform: 'translate(0 -7)' });
      }
      await tween(SETTLE_MS, (p) => {
        for (const node of targets) attr(node.group, { transform: `translate(0 ${(1 - p) * -7})` });
      });
      for (const node of targets) attr(node.group, { transform: 'translate(0 0)' });
    }

    async function merge(spec: DcMergeSpec): Promise<void> {
      const parent = nodes.get(spec.nodeId);
      const left = nodes.get(spec.leftId);
      const right = nodes.get(spec.rightId);
      if (!parent || !left || !right) return;

      paintNode(parent, true);
      const leftLink = links.get(spec.leftId);
      const rightLink = links.get(spec.rightId);
      if (leftLink) attr(leftLink, { stroke: palette.itemActive });
      if (rightLink) attr(rightLink, { stroke: palette.itemActive });

      // 자식 칸의 복제본이 부모 자리로 오른다. 오르는 길에 값이 엇갈린다.
      const flights: Array<{ flyer: SVGGElement; x0: number; y0: number; x1: number; y1: number }> = [];
      const childY = rowY(parent.depth + 1);
      const parentY = rowY(parent.depth);
      for (let slot = 0; slot < spec.values.length; slot += 1) {
        const value = spec.values[slot];
        const source = spec.fromSide[slot] === 'R' ? right : left;
        const sourceSlot = spec.fromSlot[slot];
        if (typeof value !== 'number' || typeof sourceSlot !== 'number') continue;
        const flyer = makeFlyer(value, true);
        const x0 = slotX(source, sourceSlot);
        const x1 = slotX(parent, slot);
        place(flyer, x0, childY);
        flights.push({ flyer, x0, y0: childY, x1, y1: parentY });
      }

      await tween(MOVE_MS, (p) => {
        const bow = Math.sin(Math.PI * p) * MERGE_BOW;
        for (const f of flights) {
          place(f.flyer, f.x0 + (f.x1 - f.x0) * p, f.y0 + (f.y1 - f.y0) * p + bow);
        }
      });

      for (const f of flights) f.flyer.remove();
      // 자리는 그대로고 들고 있는 것만 바뀐다 — 문제가 답으로.
      parent.values = spec.values.slice();
      parent.state = 'answer';
      parent.mergeOrder = spec.order;
      paintNode(parent, false);
      if (leftLink) attr(leftLink, { stroke: palette.border });
      if (rightLink) attr(rightLink, { stroke: palette.border });
    }

    /** 맨 처음 쪼갠 자리가 맨 마지막에 합쳐졌다는 것을 정지 화면으로 남긴다. */
    async function finish(): Promise<void> {
      const node = nodes.get(rootId);
      if (!node) return;
      emphasized = true;
      paintNode(node, false);
      const count = cellCount(node.depth);
      const ring = shape('rect', {
        x: nodeLeft(node) - 5,
        y: rowY(node.depth) - CELL_H / 2 - 5,
        width: count * cellW + 10,
        height: CELL_H + 10,
        rx: RING_R,
        fill: 'none',
        stroke: palette.accent,
        'stroke-width': 2,
        opacity: 0,
      });
      frameLayer.appendChild(ring);
      await tween(RING_MS, (p) => {
        attr(ring, { opacity: p });
      });
      attr(ring, { opacity: 1 });
    }

    function setCaption(text: string): void {
      if (text === '') {
        clear(captionLayer);
        return;
      }
      paintCaption(wrapTwoLines(text, captionSize, PIECE_CANVAS_W - SIDE_MIN * 2));
    }

    return {
      reset,
      seed,
      split,
      settle,
      merge,
      finish,
      setCaption,
      destroy(): void {
        destroyed = true;
        clearPending();
        root.remove();
      },
    };
  },
};
