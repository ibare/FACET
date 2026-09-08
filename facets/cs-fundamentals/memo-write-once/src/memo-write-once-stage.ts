/**
 * memo-write-once-stage — 적히는 운동과 읽히는 운동을 서로 반대 방향으로 그린다.
 *
 * 화면은 둘로 나뉜다. 왼쪽은 정의대로 뻗는 가지, 오른쪽은 표(`memo`)다.
 *
 *   가지        위에서 아래로, 그리고 왼쪽으로 내려간다.
 *   적힘        답을 얻은 값의 **복제본이 오른쪽으로** 건너가 표의 제 칸에 앉는다.
 *               원본은 노드에 남는다.
 *   읽힘        이미 적힌 항을 다시 만나면 값이 **왼쪽으로 되돌아 나와** 그 자리를
 *               채운다. 그 노드에서 가지는 더 뻗지 않는다.
 *
 * 두 운동이 같은 축 위에서 방향만 반대라 눈으로 갈린다. 표의 칸은 위가 큰 항,
 * 아래가 작은 항이라 가지가 깊어지는 방향과 표가 내려가는 방향이 맞물린다.
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤 바꾸지 않는다 (S-view). 항이 늘어나면
 * 칸 높이와 층 간격을 줄여 담는다.
 *
 * 화면에 그리는 글자는 표식뿐이다 — `memo[n]` · `f(3)` · `f(3)=2` · 칸 번호.
 * 캡션 문안은 projector 가 번역해 넘긴다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  radii,
  space,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 마운트 뒤 바뀌지 않는 세로 (S-view). */
export const MEMO_WRITE_ONCE_STAGE_H = 330;

const DEFAULT_N = 5;

/** 걸음 하나의 지속시간. stepMs 위에 이만큼이 더해진다 (S-piece). */
const BRANCH_MS = 230;
const VALUE_MS = 130;
const WRITE_MS = 340;
const READ_MS = 360;
const SETTLE_MS = 110;
const FINISH_MS = 240;

export type MemoBranchSpec = {
  id: string;
  n: number;
  depth: number;
  parentId: string | null;
  side: 'root' | 'L' | 'R';
};

export type MemoWriteOnceStageInstance = ViewInstance & {
  branch(spec: MemoBranchSpec): Promise<void>;
  writeToMemo(id: string, n: number, value: number): Promise<void>;
  readFromMemo(id: string, n: number, value: number): Promise<void>;
  finish(): Promise<void>;
  setCaption(text: string): void;
  clear(): void;
};

type NodeState = 'pending' | 'active' | 'solved' | 'hit';

type NodeEntry = {
  id: string;
  n: number;
  x: number;
  y: number;
  state: NodeState;
  group: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  edge: SVGLineElement | null;
};

type CellEntry = {
  rect: SVGRectElement;
  value: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, String(val));
  return node;
}

function px(token: string): number {
  const v = Number.parseFloat(token);
  return Number.isFinite(v) ? v : 0;
}

export const memoWriteOnceStageView: CanvasView = {
  canvas: { height: MEMO_WRITE_ONCE_STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 준 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);

    const rawN = params.initialData?.n;
    const n = typeof rawN === 'number' && rawN >= 2 ? Math.floor(rawN) : DEFAULT_N;

    // ── 기하. 상수는 상한만 두고 나머지는 캔버스에서 역산한다 (S-piece).
    const W = PIECE_CANVAS_W;
    const H = MEMO_WRITE_ONCE_STAGE_H;
    const MARGIN = px(space.xl);
    const CELL_GAP = px(space.xs);
    const RX = px(radii.sm);

    const cellCount = n + 1; // 0 .. n
    const levels = n; // 뿌리 f(n) 부터 f(1) 까지
    const spanUnits = n; // 가장 왼쪽 f(1) 에서 첫 히트까지의 가로 칸 수

    const tableW = Math.min(94, Math.round((W - MARGIN * 2) * 0.16));
    const tableX = W - MARGIN - tableW;
    const tableTop = 28;
    const tableBottom = H - 42;
    const cellH = Math.max(
      18,
      Math.min(
        40,
        Math.floor((tableBottom - tableTop - CELL_GAP * (cellCount - 1)) / cellCount),
      ),
    );
    const tableH = cellCount * cellH + CELL_GAP * (cellCount - 1);
    /** 위가 큰 항, 아래가 작은 항. 가지가 깊어지는 방향과 맞물린다. */
    const cellTop = (k: number) => tableTop + (cellCount - 1 - k) * (cellH + CELL_GAP);
    const cellCx = tableX + tableW / 2;
    const cellCy = (k: number) => cellTop(k) + cellH / 2;

    const treeL = MARGIN;
    const treeR = tableX - 30;
    const nodeW = Math.min(62, Math.floor((treeR - treeL) / (spanUnits + 1)));
    const nodeH = 28;
    const dx = Math.max(24, Math.floor((treeR - treeL - nodeW) / spanUnits));
    const rootX = treeL + nodeW / 2 + (spanUnits - 1) * dx;
    const treeTopY = 46;
    const levelH = Math.max(
      nodeH + 6,
      Math.min(60, Math.floor((tableTop + tableH - nodeH / 2 - treeTopY) / Math.max(1, levels - 1))),
    );
    const minX = treeL + nodeW / 2;
    const maxX = treeR - nodeW / 2;

    const CHIP_W = Math.min(34, Math.floor(tableW * 0.4));
    const CHIP_H = 20;

    // ── 층. 표 → 간선 → 노드 → 나는 값 → 캡션 순으로 겹친다.
    const gTable = el('g', {});
    const gEdges = el('g', {});
    const gNodes = el('g', {});
    const gFly = el('g', {});
    svg.appendChild(gTable);
    svg.appendChild(gEdges);
    svg.appendChild(gNodes);
    svg.appendChild(gFly);

    // ── 표. 구조는 한 번만 짓고, 비울 때는 칸의 내용만 되돌린다.
    const header = el('text', {
      x: cellCx,
      y: 18,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    header.textContent = 'memo[n]';
    gTable.appendChild(header);

    const cells: CellEntry[] = [];
    for (let k = 0; k < cellCount; k += 1) {
      const rect = el('rect', {
        x: tableX,
        y: cellTop(k),
        width: tableW,
        height: cellH,
        rx: RX,
        fill: c.bg,
        stroke: c.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      const value = el('text', {
        x: cellCx,
        y: cellCy(k),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.stateInk,
      });
      const index = el('text', {
        x: tableX - 8,
        y: cellCy(k),
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      index.textContent = String(k);
      gTable.appendChild(rect);
      gTable.appendChild(index);
      gTable.appendChild(value);
      cells.push({ rect, value });
    }

    const caption = el('text', {
      x: W / 2,
      y: H - 14,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    svg.appendChild(caption);

    // ── 시간. 유한 타이머만 쓰고 destroy 에서 전부 거둔다 (S-view).
    //    requestAnimationFrame 한 프레임은 취소하지 않는다 — 깨어나도
    //    destroyed 플래그에 걸려 아무것도 건드리지 않는다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      if (destroyed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });
    }

    function nextFrame(): Promise<void> {
      if (destroyed) return Promise.resolve();
      if (typeof requestAnimationFrame === 'function') {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
      return wait(16);
    }

    const nodes = new Map<string, NodeEntry>();
    let rootId: string | null = null;

    function paintNode(entry: NodeEntry, state: NodeState): void {
      entry.state = state;
      if (state === 'solved') {
        entry.box.setAttribute('fill', c.itemSorted);
        entry.box.setAttribute('stroke', c.itemSorted);
        entry.box.setAttribute('stroke-width', '1');
        entry.label.setAttribute('fill', c.textInverse);
        return;
      }
      if (state === 'hit') {
        entry.box.setAttribute('fill', c.accent);
        entry.box.setAttribute('stroke', c.accent);
        entry.box.setAttribute('stroke-width', '1');
        entry.label.setAttribute('fill', c.stateInk);
        return;
      }
      entry.box.setAttribute('fill', c.itemDefault);
      entry.box.setAttribute('stroke', state === 'active' ? c.itemActive : c.textMuted);
      entry.box.setAttribute('stroke-width', state === 'active' ? '2' : '1');
      entry.label.setAttribute('fill', c.text);
    }

    function setNodeText(entry: NodeEntry, value?: number): void {
      entry.label.textContent =
        value === undefined ? `f(${entry.n})` : `f(${entry.n})=${value}`;
    }

    function fillCell(k: number, value: number): void {
      const cell = cells[k];
      if (!cell) return;
      cell.rect.setAttribute('fill', c.accent);
      cell.rect.setAttribute('stroke', c.accent);
      cell.rect.removeAttribute('stroke-dasharray');
      cell.value.textContent = String(value);
    }

    function emptyCell(k: number): void {
      const cell = cells[k];
      if (!cell) return;
      cell.rect.setAttribute('fill', c.bg);
      cell.rect.setAttribute('stroke', c.border);
      cell.rect.setAttribute('stroke-dasharray', '3 3');
      cell.value.textContent = '';
    }

    /** 값 하나가 한 곳에서 다른 곳으로 건너간다. 원본은 그대로 남는다. */
    async function flyChip(
      text: string,
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      ms: number,
    ): Promise<void> {
      const group = el('g', {});
      const rect = el('rect', {
        x: toX - CHIP_W / 2,
        y: toY - CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: RX,
        fill: c.accent,
        stroke: c.accent,
      });
      const label = el('text', {
        x: toX,
        y: toY,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.stateInk,
      });
      label.textContent = text;
      group.appendChild(rect);
      group.appendChild(label);
      group.style.transform = `translate(${fromX - toX}px, ${fromY - toY}px)`;
      gFly.appendChild(group);

      await nextFrame();
      group.style.transition = `transform ${ms}ms cubic-bezier(0.3, 0.7, 0.3, 1)`;
      group.style.transform = 'translate(0px, 0px)';
      await wait(ms);
      group.remove();
    }

    async function branch(spec: MemoBranchSpec): Promise<void> {
      if (destroyed || nodes.has(spec.id)) return;

      const parent = spec.parentId === null ? null : nodes.get(spec.parentId) ?? null;
      const depth = Math.max(0, Math.min(levels - 1, Math.floor(spec.depth)));
      const rawX = parent === null ? rootX : parent.x + (spec.side === 'R' ? dx : -dx);
      const x = Math.max(minX, Math.min(maxX, rawX));
      const y = treeTopY + depth * levelH;

      const group = el('g', {});
      const box = el('rect', {
        x: x - nodeW / 2,
        y: y - nodeH / 2,
        width: nodeW,
        height: nodeH,
        rx: RX,
      });
      const label = el('text', {
        x,
        y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      group.appendChild(box);
      group.appendChild(label);

      let edge: SVGLineElement | null = null;
      let length = 0;
      if (parent !== null) {
        const x1 = parent.x;
        const y1 = parent.y + nodeH / 2;
        const y2 = y - nodeH / 2;
        edge = el('line', {
          x1,
          y1,
          x2: x,
          y2,
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
        });
        length = Math.hypot(x - x1, y2 - y1);
        edge.style.strokeDasharray = String(length);
        edge.style.strokeDashoffset = String(length);
        gEdges.appendChild(edge);
      }

      const entry: NodeEntry = { id: spec.id, n: spec.n, x, y, state: 'pending', group, box, label, edge };
      setNodeText(entry);
      paintNode(entry, 'active');
      for (const other of nodes.values()) {
        if (other.state === 'active') paintNode(other, 'pending');
      }
      nodes.set(spec.id, entry);
      if (rootId === null) rootId = spec.id;

      // 가지는 부모 자리에서 떨어져 나와 제자리로 내려간다. 자리 이동이 곧 뻗음이다.
      const startX = parent === null ? 0 : parent.x - x;
      const startY = parent === null ? -16 : parent.y - y;
      group.style.transform = `translate(${startX}px, ${startY}px)`;
      gNodes.appendChild(group);

      await nextFrame();
      group.style.transition = `transform ${BRANCH_MS}ms ease-out`;
      group.style.transform = 'translate(0px, 0px)';
      if (edge !== null) {
        edge.style.transition = `stroke-dashoffset ${BRANCH_MS}ms ease-out`;
        edge.style.strokeDashoffset = '0';
      }
      await wait(BRANCH_MS);
      group.style.transition = '';
      if (edge !== null) edge.style.transition = '';
    }

    async function writeToMemo(id: string, k: number, value: number): Promise<void> {
      const entry = nodes.get(id);
      if (destroyed || !entry) return;

      setNodeText(entry, value);
      paintNode(entry, 'solved');
      await wait(VALUE_MS);
      if (destroyed) return;

      await flyChip(String(value), entry.x, entry.y, cellCx, cellCy(k), WRITE_MS);
      if (destroyed) return;
      fillCell(k, value);
    }

    async function readFromMemo(id: string, k: number, value: number): Promise<void> {
      const entry = nodes.get(id);
      if (destroyed || !entry) return;

      await flyChip(String(value), cellCx, cellCy(k), entry.x, entry.y, READ_MS);
      if (destroyed) return;

      setNodeText(entry, value);
      paintNode(entry, 'hit');
      // 표에서 온 값임을 간선까지 이어 표시한다. 이 가지는 여기서 끝난다.
      entry.edge?.setAttribute('stroke', c.accent);
      await wait(SETTLE_MS);
    }

    async function finish(): Promise<void> {
      if (destroyed) return;
      const root = rootId === null ? undefined : nodes.get(rootId);
      if (root) {
        root.box.setAttribute('stroke', c.text);
        root.box.setAttribute('stroke-width', '2.5');
      }
      await wait(FINISH_MS);
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    function clear(): void {
      gEdges.textContent = '';
      gNodes.textContent = '';
      gFly.textContent = '';
      nodes.clear();
      rootId = null;
      for (let k = 0; k < cellCount; k += 1) emptyCell(k);
      caption.textContent = '';
    }

    const instance: MemoWriteOnceStageInstance = {
      branch,
      writeToMemo,
      readFromMemo,
      finish,
      setCaption,
      clear,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
