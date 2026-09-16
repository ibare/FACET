/**
 * memo-write-once-stage — 적히는 운동과 읽히는 운동을 서로 반대 방향으로 그린다.
 *
 * 화면은 둘로 나뉜다. 왼쪽은 정의대로 뻗는 가지, 오른쪽은 표(`memo`)다.
 *
 *   가지        위에서 아래로, 그리고 왼쪽으로 내려간다.
 *   적힘        답을 얻은 값의 **복제본이 오른쪽으로** 건너가 표의 제 칸에 앉는다.
 *               원본은 마디에 남는다.
 *   읽힘        이미 적힌 항을 다시 만나면 값이 **왼쪽으로 되돌아 나와** 그 자리를
 *               채운다. 그 마디에서 가지는 더 뻗지 않는다.
 *
 * 두 운동이 같은 축 위에서 방향만 반대라 눈으로 갈린다. 표의 칸은 위가 큰 항,
 * 아래가 작은 항이라 가지가 깊어지는 방향과 표가 내려가는 방향이 맞물린다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **표에 무엇이 적혀 있나가 이 화면의 축이다.** 명령형 stage 에서는 그 답이 칸의
 * `textContent` 와 `rect` 의 칠에만 있었고 `fillCell`/`emptyCell` 이 제자리에서
 * 고쳤다. 이제 `scene.memo` 가 그것을 말하고, **마디에 뜨는 수도 같은 표에서
 * 읽는다** (`answerOf`) — 화면에 나란히 뜨는 두 수가 갈릴 자리가 없다.
 *
 * ── 다시 읽은 자취는 마지막 화면에 남는다
 *
 * 되읽은 자리마다 **표의 칸과 마디를 잇는 선**이 하나씩 선다 (`reuseLinks`). 지우는
 * 명령이 없으므로 다 끝난 화면에 그 선들이 그대로 남고, 몇 번이나 표에서 꺼내
 * 썼는지가 한눈에 보인다. 그것이 "한 번만 셈하고 계속 쓴다" 라는 이 조각의 주장이다.
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * - **채움은 값의 형편** — 아직 모름(`itemDefault`) / 값이 적혔음(`itemSorted`).
 * - **테두리는 읽음의 표식** — 그 값이 표에서 되돌아 나온 것이면 `accent` 로 굵다.
 *   부모로 잇는 가지도 같은 뜻으로 함께 물든다.
 *
 * 한 속성에 두 뜻을 겹쳐 얹지 않는다. 그래서 "지금 부른 자리" 와 "다 폈다" 는
 * 테두리를 건드리지 않고 **따로 선 고리**로 그린다 — 옛 코드는 둘 다 마디의
 * `stroke` 를 덮어써서 읽음의 표식과 부딪혔다.
 *
 * 좌표는 장면에 없다. 항과 부모가 구조를 정하고, 그것을 캔버스에 앉히는 것은
 * 여기 몫이다 (S-piece). 자리는 **한 번에 다 셈한 뒤에 그린다** — 그리면서 이웃의
 * 지금 자리를 재면 순회 순서가 곧 숨은 상태가 된다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  space,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  answerOf,
  reuseLinks,
  reusedCount,
  solvedCount,
  type MemoWriteOnceScene,
  type MemoWriteOnceStep,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 상수로 둔다 (S-piece). */
export const MEMO_WRITE_ONCE_STAGE_H = 330;

/** 표의 자리. 폭은 상한만 두고 나머지는 캔버스에서 역산한다 (S-piece). */
const TABLE_MAX_W = 94;
const TABLE_W_RATIO = 0.16;
const TABLE_TOP = 28;
const TABLE_BOTTOM_PAD = 42;
const CELL_MAX_H = 40;
const CELL_MIN_H = 18;
const CELL_DASH = '3 3';

/** 나무의 자리. */
const TREE_TABLE_GAP = 30;
const NODE_MAX_W = 62;
const NODE_H = 28;
const MIN_DX = 24;
const TREE_TOP = 46;
const LEVEL_MAX_H = 60;

/** 뿌리가 떨어져 내리는 높이. 부모가 없으니 위에서 온다. */
const ROOT_DROP = 20;

/** 되읽은 길이 아래로 늘어지는 정도. */
const ARC_SAG = 16;
const ARC_W = 1.5;
const ARC_PULSE = 1.6;

/** 따로 선 고리 — 테두리에 뜻을 겹쳐 얹지 않으려고 둔다. */
const RING_PAD = 4;
const RING_GROW = 7;

/** 나는 딱지. */
const CHIP_MAX_W = 34;
const CHIP_H = 20;

/**
 * 걸음의 운동 길이. `stepMs`(460) 위에 이만큼이 더해지는 것이 걸음 벽시계다.
 *
 * 가장 얇은 걸음이 800ms 아래로 떨어지면 캡션을 읽을 틈이 사라진다 (S-piece).
 * 가지 뻗기가 230ms 라 690ms 였던 것을 360ms 로 두텁게 했다 — `stepMs` 를
 * 올리면 이미 긴 걸음이 함께 길어진다.
 */
const CALL_MS = 360;
const WRITE_MS = 470;
const READ_MS = 470;
const DONE_MS = 420;
const DONE_STAGGER = 0.16;

/** 값이 마디에 적히는 시점 / 표에서 마디에 닿는 시점 (진행 대비 비율). */
const WRITE_MARK_AT = 0.12;
const READ_MARK_AT = 0.88;

type CallEl = {
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  edge: SVGLineElement | null;
  edgeLen: number;
};

type CellEl = {
  rect: SVGRectElement;
  value: SVGTextElement;
};

type ChipEl = { g: SVGGElement };

/** 되읽은 길 하나의 기하. 표의 칸에서 나와 마디로 간다. */
type ArcGeom = {
  ax: number;
  ay: number;
  mx: number;
  my: number;
  bx: number;
  by: number;
  len: number;
};

type ArcEl = { path: SVGPathElement; geom: ArcGeom };

/** 마디 하나가 설 자리. 장면에는 없고 여기서 셈한다. */
type Slot = { x: number; y: number; depth: number };

/**
 * 그림의 밑감. 장면이 말하는 항 수와 자리 목록에서 매번 역산한다.
 *
 * mount 때 한 번 재지 않는다 — 나무가 자라는 조각이라 기준선을 한 번만 재면
 * 되짚어 세운 첫 그림이 엉뚱한 자리에 선다.
 */
type Layout = {
  cellCount: number;
  tableX: number;
  tableW: number;
  cellH: number;
  cellCx: number;
  cellTop(k: number): number;
  cellCy(k: number): number;
  nodeW: number;
  chipW: number;
  slots: Slot[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function px(token: string): number {
  const v = Number.parseFloat(token);
  return Number.isFinite(v) ? v : 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 이차 베지에 위의 한 점. 화면을 되읽지 않고 셈으로만 얻는다. */
function quadPoint(g: ArcGeom, t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * g.ax + 2 * u * t * g.mx + t * t * g.bx,
    y: u * u * g.ay + 2 * u * t * g.my + t * t * g.by,
  };
}

/**
 * 되읽은 길의 길이.
 *
 * `getTotalLength()` 를 부르지 않는다 — 화면을 도로 읽어 셈을 가르면 되짚어 세운
 * 직후에 그 값이 옛 화면의 것이 된다. 스물넷으로 잘라 재는 것으로 충분하다.
 */
function quadLength(g: ArcGeom): number {
  const STEPS = 24;
  let total = 0;
  let prev = quadPoint(g, 0);
  for (let i = 1; i <= STEPS; i += 1) {
    const p = quadPoint(g, i / STEPS);
    total += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return total;
}

/**
 * 장면에서 자리를 셈한다.
 *
 * 마디의 자리는 부모의 자리와 몇째 자식인가에서 나온다. **부모는 늘 목록에서
 * 앞에 있으므로** (호출이 열린 차례 그대로 쌓인다) 한 번 훑으면 전부 정해진다.
 * 그리면서 이웃의 자리를 되읽지 않는 까닭이다.
 */
function layoutOf(scene: MemoWriteOnceScene): Layout {
  const term = Math.max(2, scene.term);
  const W = PIECE_CANVAS_W;
  const H = MEMO_WRITE_ONCE_STAGE_H;
  const MARGIN = px(space.xl);
  const CELL_GAP = px(space.xs);

  const cellCount = term + 1;
  const tableW = Math.min(TABLE_MAX_W, Math.round((W - MARGIN * 2) * TABLE_W_RATIO));
  const tableX = W - MARGIN - tableW;
  const tableBottom = H - TABLE_BOTTOM_PAD;
  const cellH = Math.max(
    CELL_MIN_H,
    Math.min(
      CELL_MAX_H,
      Math.floor((tableBottom - TABLE_TOP - CELL_GAP * (cellCount - 1)) / cellCount),
    ),
  );
  const tableH = cellCount * cellH + CELL_GAP * (cellCount - 1);
  /** 위가 큰 항, 아래가 작은 항. 가지가 깊어지는 방향과 맞물린다. */
  const cellTop = (k: number): number => TABLE_TOP + (cellCount - 1 - k) * (cellH + CELL_GAP);
  const cellCy = (k: number): number => cellTop(k) + cellH / 2;

  const treeL = MARGIN;
  const treeR = tableX - TREE_TABLE_GAP;
  const nodeW = Math.min(NODE_MAX_W, Math.floor((treeR - treeL) / (term + 1)));
  const dx = Math.max(MIN_DX, Math.floor((treeR - treeL - nodeW) / term));
  const rootX = treeL + nodeW / 2 + (term - 1) * dx;
  const minX = treeL + nodeW / 2;
  const maxX = treeR - nodeW / 2;
  const levelH = Math.max(
    NODE_H + 6,
    Math.min(
      LEVEL_MAX_H,
      Math.floor((TABLE_TOP + tableH - NODE_H / 2 - TREE_TOP) / Math.max(1, term - 1)),
    ),
  );

  // 자리를 먼저 한 번에 정하고 그 다음에 그린다 (순회 순서가 화면을 가르지 않게).
  const slots: Slot[] = [];
  const childCount: number[] = [];
  for (let i = 0; i < scene.calls.length; i += 1) {
    const parent = scene.calls[i].parent;
    childCount.push(0);
    if (parent === null || slots[parent] === undefined) {
      slots.push({ x: rootX, y: TREE_TOP, depth: 0 });
      continue;
    }
    const ps = slots[parent];
    const nth = childCount[parent];
    childCount[parent] = nth + 1;
    const depth = Math.min(term - 1, ps.depth + 1);
    // 왼쪽 자식이 먼저 열리고 오른쪽 자식이 뒤에 열린다 — 차례가 곧 좌우다.
    const rawX = ps.x + (nth === 0 ? -dx : dx);
    slots.push({
      x: Math.max(minX, Math.min(maxX, rawX)),
      y: TREE_TOP + depth * levelH,
      depth,
    });
  }

  return {
    cellCount,
    tableX,
    tableW,
    cellH,
    cellCx: tableX + tableW / 2,
    cellTop,
    cellCy,
    nodeW,
    chipW: Math.min(CHIP_MAX_W, Math.floor(tableW * 0.4)),
    slots,
  };
}

/** 되읽은 길 하나. 칸 한가운데에서 나와 마디의 오른쪽 옆구리에 닿는다. */
function arcGeomOf(L: Layout, cell: number, slot: Slot): ArcGeom {
  const ax = L.cellCx;
  const ay = L.cellCy(cell);
  const bx = slot.x + L.nodeW / 2;
  const by = slot.y;
  const geom: ArcGeom = {
    ax,
    ay,
    mx: (ax + bx) / 2,
    my: (ay + by) / 2 + ARC_SAG,
    bx,
    by,
    len: 0,
  };
  geom.len = quadLength(geom);
  return geom;
}

export const memoWriteOnceStageView: CanvasView = {
  canvas: { height: MEMO_WRITE_ONCE_STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MemoWriteOnceScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 준 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const RX = px(radii.sm);

    // 레이어의 차례가 곧 겹치는 차례다. 되읽은 길은 표 **아래**에 깔려, 칸
    // 한가운데에서 나와 칸의 왼쪽 옆구리로 빠져나오는 것처럼 보인다.
    const gArcs = el('g');
    const gTable = el('g');
    const gEdges = el('g');
    const gNodes = el('g');
    const gFly = el('g');
    const gCaption = el('g');
    svg.append(gArcs, gTable, gEdges, gNodes, gFly, gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const rafIds = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 마디를 매번 새로 짓지만 그 손잡이를 담는 `callEls` 는
     * **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이 그것을 읽으면 새
     * 손잡이를 타고 살아 있는 화면에 쓴다. 그래서 프레임마다 자기 세대를
     * 확인하고 아니면 손대지 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const startedAt = Date.now();
        let id = 0;
        const frame = (): void => {
          rafIds.delete(id);
          const raw = clamp01((Date.now() - startedAt) / durationMs);
          onFrame(easeInOut(raw));
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          rafIds.add(id);
        };
        id = requestAnimationFrame(frame);
        rafIds.add(id);
      });
    }

    // ── 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다.
    let callEls: CallEl[] = [];
    let cellEls: CellEl[] = [];
    let arcEls = new Map<number, ArcEl>();
    let rootRing: SVGRectElement | null = null;

    /** 채움은 **값의 형편**, 테두리는 **읽음의 표식**. 둘이 부딪히지 않는다. */
    function paintCall(e: CallEl, known: boolean, fromMemo: boolean): void {
      e.box.setAttribute('fill', known ? c.itemSorted : c.itemDefault);
      e.box.setAttribute('stroke', fromMemo ? c.accent : known ? c.itemSorted : c.textMuted);
      e.box.setAttribute('stroke-width', fromMemo ? '2.5' : '1');
      e.label.setAttribute('fill', known ? c.textInverse : c.text);
    }

    /** 부모로 잇는 가지도 읽음의 표식을 함께 진다 — 같은 뜻이지 두 번째 뜻이 아니다. */
    function paintEdge(edge: SVGLineElement, fromMemo: boolean): void {
      edge.setAttribute('stroke', fromMemo ? c.accent : c.textMuted);
      edge.setAttribute('stroke-width', fromMemo ? '2.5' : '1.5');
    }

    function setCallLabel(e: CallEl, n: number, value: number | null): void {
      e.label.textContent = value === null ? `f(${n})` : `f(${n})=${value}`;
    }

    /** 칸의 채움도 **값의 형편**이다 — 비었나, 적혔나. */
    function paintCell(cell: CellEl, written: boolean, text: string): void {
      cell.rect.setAttribute('fill', written ? c.accent : c.bg);
      cell.rect.setAttribute('stroke', written ? c.accent : c.border);
      if (written) cell.rect.removeAttribute('stroke-dasharray');
      else cell.rect.setAttribute('stroke-dasharray', CELL_DASH);
      cell.value.textContent = text;
    }

    function ringAt(L: Layout, at: number, grow: number): {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null {
      const slot = L.slots[at];
      if (slot === undefined) return null;
      const pad = RING_PAD + grow;
      return {
        x: slot.x - L.nodeW / 2 - pad,
        y: slot.y - NODE_H / 2 - pad,
        width: L.nodeW + pad * 2,
        height: NODE_H + pad * 2,
      };
    }

    function setRing(rect: SVGRectElement, L: Layout, at: number, grow: number): void {
      const box = ringAt(L, at, grow);
      if (box === null) return;
      for (const [k, v] of Object.entries(box)) rect.setAttribute(k, String(v));
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    function drawTable(scene: MemoWriteOnceScene, L: Layout): void {
      const header = el('text', {
        x: L.cellCx,
        y: 18,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      header.textContent = 'memo[n]';
      gTable.appendChild(header);

      for (let k = 0; k < L.cellCount; k += 1) {
        const rect = el('rect', {
          x: L.tableX,
          y: L.cellTop(k),
          width: L.tableW,
          height: L.cellH,
          rx: RX,
        });
        // 칸 번호는 칸 **안쪽** 왼쪽에 둔다. 밖에 두면 되읽은 길이 그 위를 지난다.
        const index = el('text', {
          x: L.tableX + 5,
          y: L.cellCy(k),
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        index.textContent = String(k);
        const value = el('text', {
          x: L.cellCx + 6,
          y: L.cellCy(k),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.stateInk,
        });
        gTable.append(rect, index, value);

        const cell: CellEl = { rect, value };
        const written = scene.memo[k];
        paintCell(cell, written !== null && written !== undefined, written == null ? '' : String(written));
        cellEls.push(cell);
      }
    }

    function drawTree(scene: MemoWriteOnceScene, L: Layout): void {
      for (let i = 0; i < scene.calls.length; i += 1) {
        const call = scene.calls[i];
        const slot = L.slots[i];
        if (slot === undefined) continue;

        let edge: SVGLineElement | null = null;
        let edgeLen = 0;
        const parent = call.parent;
        const ps = parent === null ? undefined : L.slots[parent];
        if (ps !== undefined) {
          const y1 = ps.y + NODE_H / 2;
          const y2 = slot.y - NODE_H / 2;
          edge = el('line', {
            x1: ps.x,
            y1,
            x2: slot.x,
            y2,
            'stroke-linecap': 'round',
          });
          edgeLen = Math.hypot(slot.x - ps.x, y2 - y1);
          paintEdge(edge, call.outcome === 'read');
          gEdges.appendChild(edge);
        }

        const g = el('g');
        const box = el('rect', {
          x: slot.x - L.nodeW / 2,
          y: slot.y - NODE_H / 2,
          width: L.nodeW,
          height: NODE_H,
          rx: RX,
        });
        const label = el('text', {
          x: slot.x,
          y: slot.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        g.append(box, label);
        gNodes.appendChild(g);

        const e: CallEl = { g, box, label, edge, edgeLen };
        setCallLabel(e, call.n, answerOf(scene, i));
        paintCall(e, call.outcome !== 'open', call.outcome === 'read');
        callEls.push(e);
      }
    }

    /**
     * 되읽은 길들. **지워지지 않고 쌓인다** — 이 조각의 주장이 여기 남는다.
     */
    function drawReuse(scene: MemoWriteOnceScene, L: Layout): void {
      for (const link of reuseLinks(scene)) {
        const slot = L.slots[link.call];
        if (slot === undefined) continue;
        const geom = arcGeomOf(L, link.cell, slot);
        const path = el('path', {
          d: `M ${geom.ax} ${geom.ay} Q ${geom.mx} ${geom.my} ${geom.bx} ${geom.by}`,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': ARC_W,
          'stroke-linecap': 'round',
        });
        gArcs.appendChild(path);
        arcEls.set(link.call, { path, geom });
      }
    }

    /** 지금 부른 자리와 다 편 뿌리. 마디의 테두리를 건드리지 않고 따로 선다. */
    function drawRings(scene: MemoWriteOnceScene, L: Layout): void {
      const step = scene.step;
      if (step !== null && step.kind === 'call') {
        const box = ringAt(L, step.at, 0);
        if (box !== null) {
          gNodes.appendChild(
            el('rect', {
              ...box,
              rx: RX + RING_PAD,
              fill: 'none',
              stroke: c.itemActive,
              'stroke-width': 2,
            }),
          );
        }
      }
      if (scene.finished && scene.calls.length > 0) {
        const box = ringAt(L, 0, 0);
        if (box !== null) {
          const ring = el('rect', {
            ...box,
            rx: RX + RING_PAD,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 2.5,
          });
          gNodes.appendChild(ring);
          rootRing = ring;
        }
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: MemoWriteOnceScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'call': {
          const call = scene.calls[step.at];
          if (call === undefined) return '';
          return tr('caption.call', 'Call f({n}).', { n: call.n });
        }
        case 'write': {
          const call = scene.calls[step.at];
          const value = answerOf(scene, step.at);
          if (call === undefined || value === null) return '';
          return tr('caption.write', 'f({n}) = {value}. Write it into memo[{n}].', {
            n: call.n,
            value,
          });
        }
        case 'read': {
          const call = scene.calls[step.at];
          const value = answerOf(scene, step.at);
          if (call === undefined || value === null) return '';
          return tr(
            'caption.read',
            'f({n}) is already written — read {value}, branch no further.',
            { n: call.n, value },
          );
        }
        case 'done': {
          const root = scene.calls[0];
          const value = answerOf(scene, 0);
          if (root === undefined || value === null) return '';
          // 푼 항과 읽은 항의 수는 화면에 선 마디들을 그대로 센다 — 한 출처다.
          return tr(
            'caption.done',
            '{solved} terms solved, {reused} read back from memo. f({n}) = {value}.',
            { solved: solvedCount(scene), reused: reusedCount(scene), n: root.n, value },
          );
        }
      }
    }

    function drawCaption(scene: MemoWriteOnceScene): void {
      const text = captionTextOf(scene);
      if (text === '') return;
      const node = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: MEMO_WRITE_ONCE_STAGE_H - 14,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      node.textContent = text;
      gCaption.appendChild(node);
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform ·
     * dashoffset · 보간 끝자리도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: MemoWriteOnceScene): Layout {
      const L = layoutOf(scene);
      for (const layer of [gArcs, gTable, gEdges, gNodes, gFly, gCaption]) {
        layer.textContent = '';
      }
      callEls = [];
      cellEls = [];
      arcEls = new Map<number, ArcEl>();
      rootRing = null;

      drawReuse(scene, L);
      drawTable(scene, L);
      drawTree(scene, L);
      drawRings(scene, L);
      drawCaption(scene);
      return L;
    }

    // ── 걸음의 운동 ─────────────────────────────────────────────────────────

    function makeChip(L: Layout, text: string): ChipEl {
      const g = el('g');
      g.appendChild(
        el('rect', {
          x: -L.chipW / 2,
          y: -CHIP_H / 2,
          width: L.chipW,
          height: CHIP_H,
          rx: RX,
          fill: c.accent,
          stroke: c.accent,
        }),
      );
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.stateInk,
      });
      label.textContent = text;
      g.appendChild(label);
      gFly.appendChild(g);
      return { g };
    }

    function placeChip(chip: ChipEl, x: number, y: number, shown: boolean): void {
      chip.g.setAttribute('transform', `translate(${x} ${y})`);
      chip.g.setAttribute('opacity', shown ? '1' : '0');
    }

    /**
     * 가지가 한 칸 뻗는다. 마디가 부모 자리에서 떨어져 나와 제자리로 내려가고
     * 가지가 그 뒤를 따라 그어진다.
     *
     * 정적 그리기가 정본이라 마디는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
     * 만큼을 뒤로 물리는** 꼴이 된다.
     */
    function flowCall(scene: MemoWriteOnceScene, L: Layout, at: number, mine: number): Promise<void> {
      const e = callEls[at];
      const slot = L.slots[at];
      const call = scene.calls[at];
      if (e === undefined || slot === undefined || call === undefined) return Promise.resolve();

      const ps = call.parent === null ? undefined : L.slots[call.parent];
      const fromX = ps === undefined ? slot.x : ps.x;
      const fromY = ps === undefined ? slot.y - ROOT_DROP : ps.y;
      const ddx = fromX - slot.x;
      const ddy = fromY - slot.y;
      if (e.edge !== null) e.edge.setAttribute('stroke-dasharray', String(e.edgeLen));

      const draw = (t: number): void => {
        const back = 1 - t;
        e.g.setAttribute('transform', `translate(${ddx * back} ${ddy * back})`);
        if (e.edge !== null) e.edge.setAttribute('stroke-dashoffset', String(e.edgeLen * back));
      };

      draw(0);
      return tween(CALL_MS, (t) => {
        if (!alive(mine)) return;
        draw(t);
      });
    }

    /**
     * 답이 나와 표로 건너간다. 값이 마디에 적히고, 그 **복제본**이 오른쪽으로
     * 건너가 칸에 앉는다. 원본은 마디에 남는다.
     */
    function flowWrite(scene: MemoWriteOnceScene, L: Layout, at: number, mine: number): Promise<void> {
      const e = callEls[at];
      const slot = L.slots[at];
      const call = scene.calls[at];
      const value = answerOf(scene, at);
      if (e === undefined || slot === undefined || call === undefined || value === null) {
        return Promise.resolve();
      }
      const cell = cellEls[call.n];
      const toX = L.cellCx;
      const toY = L.cellCy(call.n);
      const chip = makeChip(L, String(value));

      const draw = (t: number): void => {
        const marked = t >= WRITE_MARK_AT;
        setCallLabel(e, call.n, marked ? value : null);
        paintCall(e, marked, false);
        const ct = clamp01((t - WRITE_MARK_AT) / (1 - WRITE_MARK_AT));
        placeChip(chip, lerp(slot.x, toX, ct), lerp(slot.y, toY, ct), marked);
        if (cell !== undefined) {
          const landed = ct >= 1;
          paintCell(cell, landed, landed ? String(value) : '');
        }
      };

      draw(0);
      return tween(WRITE_MS, (t) => {
        if (!alive(mine)) return;
        draw(t);
      });
    }

    /**
     * 이미 적힌 항이다. 값이 표에서 **되돌아 나와** 그 자리를 채운다.
     *
     * 딱지는 되읽은 길 위를 달리고 길은 그 뒤로 그어진다 — 적히는 운동과 방향이
     * 정확히 반대라 눈으로 갈린다. 길은 걸음이 끝나도 남는다.
     */
    function flowRead(scene: MemoWriteOnceScene, L: Layout, at: number, mine: number): Promise<void> {
      const e = callEls[at];
      const slot = L.slots[at];
      const call = scene.calls[at];
      const value = answerOf(scene, at);
      if (e === undefined || slot === undefined || call === undefined || value === null) {
        return Promise.resolve();
      }
      const arc = arcEls.get(at);
      const geom = arc?.geom ?? arcGeomOf(L, call.n, slot);
      if (arc !== undefined) arc.path.setAttribute('stroke-dasharray', String(geom.len));
      const chip = makeChip(L, String(value));

      const draw = (t: number): void => {
        if (arc !== undefined) {
          arc.path.setAttribute('stroke-dashoffset', String(geom.len * (1 - t)));
        }
        const marked = t >= READ_MARK_AT;
        const p = quadPoint(geom, t);
        placeChip(chip, p.x, p.y, !marked);
        setCallLabel(e, call.n, marked ? value : null);
        paintCall(e, marked, marked);
        if (e.edge !== null) paintEdge(e.edge, marked);
      };

      draw(0);
      return tween(READ_MS, (t) => {
        if (!alive(mine)) return;
        draw(t);
      });
    }

    /**
     * 다 폈다. 되읽은 길들이 차례로 훑이고 뿌리에 고리가 죈다.
     *
     * 짚기만 하는 걸음이라 그냥 두면 벽시계가 얇다. 얹는 운동은 **그 걸음이 하는
     * 말과 같은 동사**로 고른다 — 이 조각이 끝에 하는 말이 "이만큼을 표에서 다시
     * 읽었다" 이므로, 그 길들을 다시 한 번 훑는 것이 맞다.
     */
    function flowDone(scene: MemoWriteOnceScene, L: Layout, mine: number): Promise<void> {
      const links = reuseLinks(scene);
      const arcs = links
        .map((link) => arcEls.get(link.call))
        .filter((a): a is ArcEl => a !== undefined);
      for (const a of arcs) a.path.setAttribute('stroke-dasharray', String(a.geom.len));
      const span = Math.max(0.001, 1 - DONE_STAGGER * Math.max(0, arcs.length - 1));

      const draw = (t: number): void => {
        for (let j = 0; j < arcs.length; j += 1) {
          const a = arcs[j];
          const lt = clamp01((t - DONE_STAGGER * j) / span);
          a.path.setAttribute('stroke-dashoffset', String(a.geom.len * (1 - lt)));
          a.path.setAttribute('stroke-width', String(ARC_W + ARC_PULSE * Math.sin(lt * Math.PI)));
        }
        if (rootRing !== null) setRing(rootRing, L, 0, RING_GROW * (1 - t));
      };

      draw(0);
      return tween(DONE_MS * (1 + DONE_STAGGER * arcs.length), (t) => {
        if (!alive(mine)) return;
        draw(t);
      });
    }

    function flow(
      scene: MemoWriteOnceScene,
      L: Layout,
      step: MemoWriteOnceStep,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'call':
          return flowCall(scene, L, step.at, mine);
        case 'write':
          return flowWrite(scene, L, step.at, mine);
        case 'read':
          return flowRead(scene, L, step.at, mine);
        case 'done':
          return flowDone(scene, L, mine);
      }
    }

    async function render(
      next: MemoWriteOnceScene,
      /** 출발 자리를 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: MemoWriteOnceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const L = drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      if (step === null) return;
      await flow(next, L, step, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 dashoffset · transform · 딱지를 통째로 거둔다. 되돌릴 목록을
      // 손으로 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafIds) cancelAnimationFrame(id);
        }
        rafIds.clear();
        // 걸어 둔 프레임을 거두면 그 tick 은 아예 불리지 않으므로, 기다리던
        // promise 를 여기서 직접 깨운다 (S-piece).
        for (const done of [...pending]) done();
        pending.clear();
        callEls = [];
        cellEls = [];
        arcEls.clear();
        rootRing = null;
        svg.textContent = '';
      },
    };
  },
};
