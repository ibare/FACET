/**
 * 빌트인 `graph-layout` 을 쓰지 않은 이유: 이 조각이 그리는 것은 그래프가
 * 아니라 **그래프를 담는 두 그릇**이다. 목록이 자라는 것과 표가 채워지는 것을
 * 나란히 놓아야 하는데, 그 view 는 정점과 간선을 그릴 뿐 담는 자료구조 자체를
 * 그릴 어휘가 없다 (원칙 6 의 예외 조건).
 *
 * adjacency-list-vs-matrix-stage — 장면(Scene) 하나를 받아 그 걸음의 화면을
 * 통째로 세운다. 앞 화면과 견주지 않으므로 되돌릴 명령이 없고, 어느 걸음에서
 * 오든 결과가 같다 (S-scene).
 *
 * ── 형태가 어디서 나왔는가
 *
 * 왼쪽은 인접 리스트. 정점마다 빈 줄로 시작해 간선이 놓일 때마다 칸이 하나씩
 * **폭이 자라며** 옆에 붙는다 — 든 만큼만 자리를 쓴다. 오른쪽은 인접 행렬.
 * 정점 수 × 정점 수 칸이 처음부터 전부 서 있고, 간선이 놓이면 이미 있던 칸의
 * 값만 0 에서 1 로 뒤집힌다 — 자리는 처음부터 다 잡혀 있다.
 *
 * ── 두 칠이 부딪히지 않게 축을 가른다
 *   · **채움 = 값의 형편** — 이 자리에 간선이 있나 (primary) 없나 (itemDefault)
 *   · **테두리(표식) = 짚음의 자취** — 이 물음에서 들여다본 칸에 accent 테를 두른다.
 *     한 번 두르면 그 물음이 끝날 때까지 남는다 — **표식의 수가 곧 비용**이다
 *   · **커서 = 지금 짚는 칸** — 표식 바깥에 itemComparing 링으로 선다. 물음이
 *     매듭지어지면 꺼진다
 *
 * 옛 화면은 커서 하나가 옮겨 다닐 뿐이라 "몇 번 봤나" 가 자취로 남지 않았고,
 * 커서 테두리 한 축에 "지금 보는 중" 과 "이 칸이 답이다" 두 뜻이 함께 실려
 * 있었다. 축을 가르니 두 물음의 대비가 한 화면에 선다.
 *
 * ── 결과 줄
 *
 * 물음이 매듭지어질 때마다 아래에 줄이 하나씩 앉는다 — 물음의 문장과 두 비용.
 * 싼 쪽이 accent 로 물든다. 옛 화면은 두 물음의 배지를 **같은 자리에** 그려
 * 물음 2 가 물음 1 을 덮었고, 그래서 이 조각이 자랑하려던 네 수 중 둘이
 * 완주 화면에서 사라지고 있었다. 이제 넷이 나란히 남는다.
 *
 * 캔버스 가로는 러너가 `PIECE_CANVAS_W` 로 준다. 세로는 그림이 정하므로 장면을
 * 받을 때마다 `viewBox` 를 다시 세운다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { queryVertexOf, targetVertexOf } from './algorithm.js';
import {
  costOf,
  listsOf,
  reservedCells,
  type AdjacencyListVsMatrixScene,
  type AdjacencyProbe,
  type AdjacencySceneStep,
  type AdjacencySide,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 정점 다섯 + 결과 줄 둘이 들어가는 크기다. */
const H = 420;
const CELL_RADIUS = Number.parseInt(radii.sm, 10) || 3;

const SIDE = 16;
const GAP = 20;
const CAPTION_Y = 24;
const PANEL_TOP = 54;
const TITLE_H = 20;

const ROW_H = 34;
const CHIP_R = 12;
const LIST_CELL_MAX = 46;

const HEADER = 20;
const MATRIX_CELL_MAX = 46;

/** 결과가 앉을 자리. 물음이 몇이든 이 띠 안에 눕는다 — 줄이 늘어도 캔버스는 안 흔들린다. */
const FOOTER_H = 60;
const RESULT_ROW_MAX = 26;
const RESULT_GAP = 8;
const BADGE_W = 96;
const BADGE_GAP = 8;

/** 표식은 칸에 바싹 붙고, 커서는 그 바깥에 선다 — 둘이 겹쳐 읽히지 않게. */
const MARK_STROKE = 2;
const CURSOR_PAD = 3;
const CURSOR_STROKE = 2.5;

const EDGE_MS = 260;
const SCAN_MS = 240;

type Box = { x: number; y: number; w: number; h: number };

/**
 * 자리 셈의 결과. 바탕(정점 수 · 가장 큰 이웃 수)만 있으면 정해진다.
 *
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다. 그리면서 재면 순회 순서가 곧
 * 숨은 상태가 된다.
 */
type Layout = {
  n: number;
  panelW: number;
  listX: number;
  matrixX: number;
  listStartX: number;
  listCellW: number;
  listCellH: number;
  gridX: number;
  gridY: number;
  cell: number;
  footerY: number;
  totalH: number;
};

function layoutOf(vertexCount: number, maxDegree: number): Layout {
  const n = Math.max(1, vertexCount);
  const panelW = Math.floor((W - SIDE * 2 - GAP) / 2);
  const listX = SIDE;
  const matrixX = SIDE + panelW + GAP;
  const chipAreaW = CHIP_R * 2 + 10;
  const listCellW = Math.min(
    LIST_CELL_MAX,
    Math.max(24, Math.floor((panelW - chipAreaW - 8) / Math.max(1, maxDegree))),
  );
  const cell = Math.min(MATRIX_CELL_MAX, Math.max(20, Math.floor((panelW - HEADER - 8) / n)));
  const listPanelH = TITLE_H + n * ROW_H;
  const matrixPanelH = TITLE_H + HEADER + n * cell;
  const footerY = PANEL_TOP + Math.max(listPanelH, matrixPanelH) + 22;
  return {
    n,
    panelW,
    listX,
    matrixX,
    listStartX: listX + chipAreaW + 4,
    listCellW,
    listCellH: ROW_H - 12,
    gridX: matrixX + HEADER,
    gridY: PANEL_TOP + TITLE_H + HEADER,
    cell,
    footerY,
    totalH: footerY + FOOTER_H + 14,
  };
}

const listRowY = (row: number): number => PANEL_TOP + TITLE_H + row * ROW_H + ROW_H / 2;

const listCellBox = (L: Layout, row: number, index: number): Box => ({
  x: L.listStartX + index * L.listCellW,
  y: listRowY(row) - L.listCellH / 2,
  w: L.listCellW - 3,
  h: L.listCellH,
});

const matrixCellBox = (L: Layout, row: number, col: number): Box => ({
  x: L.gridX + col * L.cell,
  y: L.gridY + row * L.cell,
  w: L.cell - 2,
  h: L.cell - 2,
});

/** 칸 하나의 손잡이. 값의 형편은 `fill` 에, 짚음의 표식은 따로 선 테에 실린다. */
type MatrixRef = { fill: SVGElement | null; text: SVGElement; box: Box };
type ListRef = { rect: SVGElement; label: SVGElement; box: Box };

/** 한 번의 정적 그리기가 내놓는 손잡이들. 운동이 이것을 쥐고 흐른다. */
type Refs = {
  layout: Layout;
  listCells: Map<string, ListRef[]>;
  matrixCells: Map<string, MatrixRef>;
  /** 짚음의 표식. `current.probes` 와 같은 차례다. */
  marks: SVGElement[];
  cursor: SVGElement | null;
  transient: SVGElement;
};

export const adjacencyListVsMatrixStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const c = getColors(params.theme);
    // 문안을 만드는 것이 이제 그리는 쪽의 일이다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 붙여 준
    // 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    // ── 시간 ─────────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const clock = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 칸을 매번 새로 짓지만 운동이 쥔 것은 **그때의 손잡이**다.
     * 되짚기나 `destroy` 가 가운데 끼어들면 이미 떨어져 나간 노드를 붙들고 있게
     * 되므로, 깨어난 운동은 자기 세대를 확인하고 아니면 손대지 않는다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(run: () => void): void {
      if (hasRaf) {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          run();
        });
        frames.add(id);
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        run();
      }, 16);
      timers.add(id);
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

    function tween(ms: number, my: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(my) || ms <= 0) {
          resolve();
          return;
        }
        const started = clock();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(my)) {
            finish();
            return;
          }
          const raw = Math.min(1, (clock() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          nextFrame(tick);
        };
        // 첫 프레임을 동기로 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
        // 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        draw(0);
        nextFrame(tick);
      });
    }

    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    // ── 그리기 도구 ──────────────────────────────────────────────────
    function put(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    const root = put(canvas, 'g', {});

    // ── 문안 ────────────────────────────────────────────────────────
    function questionText(scene: AdjacencyListVsMatrixScene, question: 1 | 2): string {
      const a = queryVertexOf(scene.vertices);
      if (question === 1) {
        return t('caption.q1', 'Are {a} and {b} neighbors?', {
          a,
          b: targetVertexOf(scene.vertices),
        });
      }
      return t('caption.q2', 'List all of {a}’s neighbors.', { a });
    }

    function captionText(scene: AdjacencyListVsMatrixScene): string {
      switch (scene.caption.kind) {
        case 'init':
          return t(
            'caption.init',
            'The list starts with no cells; the matrix already holds {cells} reserved cells.',
            { cells: reservedCells(scene) },
          );
        case 'ask':
          return questionText(scene, scene.caption.question);
        case 'result': {
          const last = scene.runs[scene.runs.length - 1] ?? null;
          return t(
            'caption.result',
            'List touched {list} cell(s) · Matrix touched {matrix} cell(s).',
            { list: costOf(last, 'list'), matrix: costOf(last, 'matrix') },
          );
        }
      }
    }

    const badgeText = (side: AdjacencySide, n: number): string =>
      side === 'list'
        ? t('badge.list', 'list {n}', { n })
        : t('badge.matrix', 'matrix {n}', { n });

    // ── 짚은 칸의 자리 ───────────────────────────────────────────────
    /**
     * 표식과 커서가 설 자리. 두 물음 모두 `queryVertex` 의 줄과 행만 짚으므로
     * 칸 번호 하나면 자리가 정해진다.
     */
    function probeBox(
      L: Layout,
      scene: AdjacencyListVsMatrixScene,
      probe: AdjacencyProbe,
    ): Box | null {
      const row = scene.vertices.indexOf(queryVertexOf(scene.vertices));
      if (row < 0) return null;
      if (probe.side === 'matrix') {
        return probe.cellIndex < L.n ? matrixCellBox(L, row, probe.cellIndex) : null;
      }
      const own = listsOf(scene).get(queryVertexOf(scene.vertices)) ?? [];
      return probe.cellIndex < own.length ? listCellBox(L, row, probe.cellIndex) : null;
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────
    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않고 늘 통째로 짓는다 —
     * 그래서 되돌릴 명령이 필요 없고, 어느 걸음에서 오든 결과가 같다 (S-scene).
     */
    function drawStatic(scene: AdjacencyListVsMatrixScene): Refs {
      root.textContent = '';
      const L = layoutOf(scene.vertices.length, scene.maxDegree);
      // `init()` 이 없으므로 캔버스 세로도 매번 여기서 정한다.
      canvas.setAttribute('viewBox', `0 0 ${W} ${L.totalH}`);

      // 그림이 아래 층, 운동에만 사는 것들이 위 층. 정적 그리기는 위 층을 비운 채로 둔다.
      const cellLayer = put(root, 'g', {});
      const refs: Refs = {
        layout: L,
        listCells: new Map(),
        matrixCells: new Map(),
        marks: [],
        cursor: null,
        transient: put(root, 'g', {}),
      };
      put(cellLayer, 'rect', { x: 0, y: 0, width: W, height: L.totalH, fill: c.bg });

      const lists = listsOf(scene);
      const queryVertex = queryVertexOf(scene.vertices);
      const asking = scene.current !== null;

      // ── 캡션.
      put(
        cellLayer,
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        },
        captionText(scene),
      );

      // ── 패널 이름과, 이 물음이 지금까지 짚은 수.
      put(
        cellLayer,
        'text',
        {
          x: L.listX,
          y: PANEL_TOP - 4,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        },
        t('label.list', 'Adjacency list'),
      );
      put(
        cellLayer,
        'text',
        {
          x: L.matrixX,
          y: PANEL_TOP - 4,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        },
        t('label.matrix', 'Adjacency matrix'),
      );
      if (asking) {
        for (const [side, x] of [
          ['list', L.listX + L.panelW],
          ['matrix', L.matrixX + L.panelW],
        ] as const) {
          put(
            cellLayer,
            'text',
            {
              x,
              y: PANEL_TOP - 4,
              'text-anchor': 'end',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.text,
            },
            badgeText(side, costOf(scene.current, side)),
          );
        }
      }

      // ── 리스트 패널. 정점마다 줄 하나, 든 만큼만 칸이 붙는다.
      scene.vertices.forEach((v, i) => {
        const rowY = listRowY(i);
        const chipCx = L.listX + CHIP_R + 2;
        const isQuery = asking && v === queryVertex;
        put(cellLayer, 'circle', {
          cx: chipCx,
          cy: rowY,
          r: CHIP_R,
          fill: c.bgSubtle,
          stroke: isQuery ? c.text : c.border,
          'stroke-width': isQuery ? 2 : 1,
        });
        put(
          cellLayer,
          'text',
          {
            x: chipCx,
            y: rowY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.text,
          },
          v,
        );

        const own = lists.get(v) ?? [];
        const cells: ListRef[] = own.map((neighbor, k) => {
          const box = listCellBox(L, i, k);
          const rect = put(cellLayer, 'rect', {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: CELL_RADIUS,
            fill: c.primary,
          });
          const label = put(
            cellLayer,
            'text',
            {
              x: box.x + box.w / 2,
              y: rowY + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textInverse,
            },
            neighbor,
          );
          return { rect, label, box };
        });
        refs.listCells.set(v, cells);
      });

      // ── 행렬 패널. 칸은 처음부터 전부 서 있고 값만 뒤집힌다.
      scene.vertices.forEach((v, j) => {
        put(
          cellLayer,
          'text',
          {
            x: L.gridX + j * L.cell + L.cell / 2,
            y: PANEL_TOP + TITLE_H + HEADER / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          v,
        );
      });
      scene.vertices.forEach((rowV, i) => {
        const isQuery = asking && rowV === queryVertex;
        put(
          cellLayer,
          'text',
          {
            x: L.matrixX + HEADER / 2,
            y: L.gridY + i * L.cell + L.cell / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: isQuery ? c.text : c.textMuted,
          },
          rowV,
        );

        const own = lists.get(rowV) ?? [];
        scene.vertices.forEach((colV, j) => {
          const box = matrixCellBox(L, i, j);
          const on = own.includes(colV);
          put(cellLayer, 'rect', {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: CELL_RADIUS,
            fill: c.itemDefault,
            stroke: c.border,
            'stroke-width': 1,
          });
          const fill = on
            ? put(cellLayer, 'rect', {
                x: box.x,
                y: box.y,
                width: box.w,
                height: box.h,
                rx: CELL_RADIUS,
                fill: c.primary,
              })
            : null;
          const text = put(
            cellLayer,
            'text',
            {
              x: box.x + box.w / 2,
              y: box.y + box.h / 2 + 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: on ? c.textInverse : c.text,
            },
            on ? '1' : '0',
          );
          refs.matrixCells.set(`${rowV}-${colV}`, { fill, text, box });
        });
      });

      // ── 짚음의 표식. 이 물음에서 들여다본 칸마다 하나씩, 그 물음이 끝날 때까지 남는다.
      const markLayer = put(cellLayer, 'g', {});
      for (const probe of scene.current?.probes ?? []) {
        const box = probeBox(L, scene, probe);
        if (!box) continue;
        refs.marks.push(
          put(markLayer, 'rect', {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: CELL_RADIUS,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': MARK_STROKE,
          }),
        );
      }

      // ── 커서. 지금 짚는 칸에만 선다. 물음이 매듭지어지면 꺼진다.
      const last = scene.current?.probes[scene.current.probes.length - 1] ?? null;
      if (scene.step?.kind === 'scan' && last) {
        const box = probeBox(L, scene, last);
        if (box) {
          refs.cursor = put(cellLayer, 'rect', {
            x: box.x - CURSOR_PAD,
            y: box.y - CURSOR_PAD,
            width: box.w + CURSOR_PAD * 2,
            height: box.h + CURSOR_PAD * 2,
            rx: CELL_RADIUS + 2,
            fill: 'none',
            stroke: c.itemComparing,
            'stroke-width': CURSOR_STROKE,
          });
        }
      }

      // ── 결과 줄. 매듭지어진 물음마다 하나씩, 끝까지 나란히 남는다.
      const rows = scene.runs.length;
      if (rows > 0) {
        const rowH = Math.min(
          RESULT_ROW_MAX,
          Math.floor((FOOTER_H - RESULT_GAP * (rows - 1)) / rows),
        );
        scene.runs.forEach((run, k) => {
          const y = L.footerY + k * (rowH + RESULT_GAP);
          put(
            cellLayer,
            'text',
            {
              x: SIDE + 4,
              y: y + rowH / 2 + 4,
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            questionText(scene, run.question),
          );
          const listCost = costOf(run, 'list');
          const matrixCost = costOf(run, 'matrix');
          const cheaper: AdjacencySide = listCost <= matrixCost ? 'list' : 'matrix';
          for (const [side, x] of [
            ['list', W - SIDE - BADGE_W * 2 - BADGE_GAP],
            ['matrix', W - SIDE - BADGE_W],
          ] as const) {
            const won = side === cheaper;
            put(cellLayer, 'rect', {
              x,
              y,
              width: BADGE_W,
              height: rowH,
              rx: CELL_RADIUS,
              fill: won ? c.accent : c.bgSubtle,
              stroke: c.border,
              'stroke-width': 1,
            });
            put(
              cellLayer,
              'text',
              {
                x: x + BADGE_W / 2,
                y: y + rowH / 2 + 4,
                'text-anchor': 'middle',
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                fill: won ? c.stateInk : c.textMuted,
              },
              badgeText(side, side === 'list' ? listCost : matrixCost),
            );
          }
        });
      }

      return refs;
    }

    // ── 운동 ────────────────────────────────────────────────────────
    /**
     * 간선 하나가 두 그릇에 동시에 놓인다.
     *
     * 목록 칸이 자라는 것과 표의 칸이 켜지는 것은 **한 뜻**이라 시계를 하나만
     * 둔다 — 나누면 나란함이 우연히 맞는 꼴이 된다.
     */
    function flowEdge(
      scene: AdjacencyListVsMatrixScene,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const placed = scene.placed[scene.placed.length - 1];
      if (!placed) return Promise.resolve();
      const [a, b] = placed;

      const grown: ListRef[] = [];
      for (const owner of [a, b]) {
        const cells = refs.listCells.get(owner);
        const cell = cells?.[cells.length - 1];
        if (cell) grown.push(cell);
      }

      const lit: MatrixRef[] = [];
      for (const key of [`${a}-${b}`, `${b}-${a}`]) {
        const cell = refs.matrixCells.get(key);
        if (cell?.fill) lit.push(cell);
      }

      // 꺼져 있던 '0' 은 정적 그림에 없으므로 임시 레이어에서만 산다.
      const ghosts = lit.map((cell) =>
        put(
          refs.transient,
          'text',
          {
            x: cell.box.x + cell.box.w / 2,
            y: cell.box.y + cell.box.h / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
          },
          '0',
        ),
      );

      return tween(EDGE_MS, my, (e) => {
        for (const cell of grown) {
          const w = cell.box.w * e;
          cell.rect.setAttribute('width', String(w));
          cell.label.setAttribute('x', String(cell.box.x + w / 2));
          cell.label.setAttribute('opacity', String(Math.max(0, e * 2 - 1)));
        }
        for (const cell of lit) {
          cell.fill?.setAttribute('opacity', String(e));
          cell.text.setAttribute('opacity', String(e));
        }
        for (const ghost of ghosts) ghost.setAttribute('opacity', String(1 - e));
      });
    }

    /**
     * 칸 하나를 짚는다.
     *
     * 커서가 앞 표식에서 이번 칸으로 옮겨 가고, 그 사이에 새 표식이 배어 나온다 —
     * 한 뜻이라 한 시계에 얹는다. 출발 자리는 `step.from` 이 싣는다. 화면의 지금
     * 자리를 되읽으면 되짚어 세운 직후에 옛 자리에서 출발한다.
     */
    function flowScan(
      scene: AdjacencyListVsMatrixScene,
      step: Extract<AdjacencySceneStep, { kind: 'scan' }>,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const cursor = refs.cursor;
      const probes = scene.current?.probes ?? [];
      const here = probes[probes.length - 1];
      if (!cursor || !here) return Promise.resolve();
      const to = probeBox(refs.layout, scene, here);
      if (!to) return Promise.resolve();

      const fromBox = step.from ? probeBox(refs.layout, scene, step.from) : null;
      // 첫 짚음이면 옮겨 올 자리가 없다 — 칸 한가운데서 자라 나온다.
      const start: Box = fromBox ?? { x: to.x + to.w / 2, y: to.y + to.h / 2, w: 0, h: 0 };
      const mark = refs.marks[refs.marks.length - 1] ?? null;

      return tween(SCAN_MS, my, (e) => {
        cursor.setAttribute('x', String(lerp(start.x, to.x, e) - CURSOR_PAD));
        cursor.setAttribute('y', String(lerp(start.y, to.y, e) - CURSOR_PAD));
        cursor.setAttribute('width', String(lerp(start.w, to.w, e) + CURSOR_PAD * 2));
        cursor.setAttribute('height', String(lerp(start.h, to.h, e) + CURSOR_PAD * 2));
        mark?.setAttribute('opacity', String(e));
      });
    }

    async function render(
      next: AdjacencyListVsMatrixScene,
      /** 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: AdjacencyListVsMatrixScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'edge':
          await flowEdge(next, refs, my);
          break;
        case 'scan':
          await flowScan(next, step, refs, my);
          break;
        // 묻기와 매듭은 흐를 것이 없다 — 캡션과 결과 줄이 곧바로 선다.
        case 'ask':
        case 'settle':
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간의 끝자리를 통째로 지운다. 속성을 하나씩 거두면
      // 반드시 하나를 빠뜨린다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        if (hasRaf) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지
        // 않으므로, 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
