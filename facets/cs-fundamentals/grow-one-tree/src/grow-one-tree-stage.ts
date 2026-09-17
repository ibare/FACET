/**
 * grow-one-tree-stage — 나무가 한 자리씩 자라는 그림.
 *
 * 화면은 둘로 나뉜다.
 *
 *   위  그림 — 정점과 간선. 고른 간선은 나무 쪽 끝에서부터 **그어지며** 자라고,
 *       새로 붙는 정점에서 테가 한 번 퍼진다.
 *   아래 칸판 — 간선마다 칸 하나. 칸은 세 줄(나무 / 고를 수 있다 / 고를 수 없다)
 *       사이를 **오르내린다.** 걸음마다 어느 간선이 후보가 되고 어느 것이 후보에서
 *       빠지는지가 칸의 오르내림으로 보인다. 칸의 가로 자리는 고정이라 같은 간선을
 *       계속 눈으로 좇을 수 있다.
 *
 * ── 두 축을 가른다
 *
 * **채움은 값의 형편** — 나무에 들었나. **테두리는 견줌의 표식** — 이번 걸음에
 * 후보로 올랐나. 한 축에 세 값을 욱여넣으면 (옮기기 전의 `EdgeVisual` 이 그랬다)
 * 고른 간선이 나무가 되는 순간 그것이 **후보 중에서** 골라졌다는 사실이 화면에서
 * 지워진다. 갈라 두면 고른 걸음의 화면에 셋이 함께 선다 — 채워지고 표식을 단 것
 * (방금 골라진 것), 표식만 단 것(후보였다가 진 것), 아무것도 없는 것(닿지 않은 것).
 * 그래야 "가장 가벼운 것" 의 *가장* 이 읽힌다.
 *
 * 셋째 채널은 **accent 로 짚기** 하나뿐이다 — 캡션이 "더 가벼운데 아직 못 고른다"
 * 고 가리키는 그 간선. 형편도 표식도 아니고 지금 말하고 있는 자리를 짚는 것이라,
 * 두 축과 부딪히지 않는다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`seed()` · `showFrontier()` · `grow()` · `markDone()`) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 (S-scene).
 *
 * `prev` 는 들추지 않는다. 칸이 어느 줄에서 출발하는지는 `step.wasShowing` 이 싣고
 * 있고, 그 배치를 셈하는 함수(`lanesOf`)는 도착 배치를 셈하는 것과 같은 하나다.
 *
 * 움직임은 CSS transition 이 아니라 rAF 로 직접 잰다. 되짚기는 `animate:false` 로
 * 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 한다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 캡션은 두 줄 자리를 늘 잡아 두고
 * 문안이 한 줄이든 두 줄이든 그림이 밀리지 않게 한다.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  treeEdgesOf,
  treeNodesOf,
  type GrowOneTreeScene,
  type GrowOneTreeSceneEdge,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg' as const;

const W = PIECE_CANVAS_W;
const H = 380;

// ── 그림 (위)
const GRAPH_SIDE = 78;
const NODE_R = 21;
const ROW_TOP = 62;
const ROW_BOTTOM = 166;
const ROW_MID = (ROW_TOP + ROW_BOTTOM) / 2;
const SEPARATOR_Y = 197;

// ── 칸판 (아래). 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
const LANE_LABEL_RIGHT = 76;
const TRAY_LEFT = 88;
const TRAY_RIGHT_PAD = 14;
const CHIP_MAX_W = 96;
const CHIP_GAP = 8;
const CHIP_H = 26;
const LANE_Y: readonly number[] = [220, 264, 308];

// ── 캡션. 두 줄 자리를 늘 잡는다.
const CAPTION_Y = 348;
const CAPTION_LINE_H = 20;

// ── 채움(값의 형편): 나무에 들었나
const EDGE_W_TREE = 5.5;
const EDGE_W_IDLE = 1.8;
const REST_OPACITY = 0.55;

// ── 테두리(견줌의 표식): 이번 걸음에 후보로 올랐나
const MARK_W = 11;
const MARK_OPACITY = 0.34;
const CHIP_MARK_W = 2.5;
const CHIP_PLAIN_W = 1;

// ── 시간. 걸음 하나는 여기에 stepMs 가 더해진 길이다 (S-piece).
const GROW_MS = 400;
const SHIFT_MS = 300;
const JOIN_MS = 300;
const DONE_MS = 360;

const HALO_SPREAD = 15;
const HALO_OPACITY = 0.7;
const DONE_SWELL = 2.5;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 보간한 수를 속성 문자열로. 두 자리에서 끊는다.
 *
 * 끝자리가 문자열을 가르는 것을 막는다 — `0.55` 를 보간했다 되돌리면
 * `0.5500000000000001` 이 되고, 곱이 아주 작은 음수면 `-0` 이 된다. 반올림하면
 * 끝에서 목표값·상수와 글자 그대로 같아지고 `-0` 도 `0` 으로 떨어진다.
 */
function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 0→1 을 끝에서 부드럽게 놓는다. */
function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

type Point = { x: number; y: number };

/**
 * 장면이 말하는 구조에서 역산한 자리. 그리기 전에 한 번에 셈한다 — 그리면서 재면
 * 순회 순서가 곧 숨은 상태가 된다.
 */
type Geo = {
  pos: Map<string, Point>;
  chipW: number;
  chipX: Map<string, number>;
};

/**
 * 정점 자리. 첫 정점은 왼쪽 가운데에 두고, 나머지는 두 개씩 열을 이뤄 오른쪽으로
 * 나간다. 짝이 없는 마지막 하나는 자기 열 가운데.
 */
function placeNodes(names: string[]): Map<string, Point> {
  const pos = new Map<string, Point>();
  const cols = 1 + Math.ceil(Math.max(0, names.length - 1) / 2);
  const span = cols > 1 ? (W - GRAPH_SIDE * 2) / (cols - 1) : 0;
  names.forEach((name, i) => {
    if (i === 0) {
      pos.set(name, { x: GRAPH_SIDE, y: ROW_MID });
      return;
    }
    const col = 1 + Math.floor((i - 1) / 2);
    const top = (i - 1) % 2 === 0;
    const alone = top && i === names.length - 1;
    pos.set(name, {
      x: GRAPH_SIDE + span * col,
      y: alone ? ROW_MID : top ? ROW_TOP : ROW_BOTTOM,
    });
  });
  return pos;
}

function geometryOf(scene: GrowOneTreeScene): Geo {
  const pos = placeNodes(scene.nodes);
  const count = Math.max(1, scene.edges.length);
  const room = W - TRAY_LEFT - TRAY_RIGHT_PAD;
  // 폭을 채운다 — 칸 폭은 캔버스에서 역산하고 상수는 상한으로만 쓴다 (S-piece).
  const chipW = Math.min(CHIP_MAX_W, Math.floor((room - CHIP_GAP * (count - 1)) / count));
  const rowW = chipW * count + CHIP_GAP * (count - 1);
  const x0 = TRAY_LEFT + Math.round((room - rowW) / 2);
  const chipX = new Map<string, number>();
  scene.edges.forEach((e, i) => chipX.set(e.id, x0 + i * (chipW + CHIP_GAP)));
  return { pos, chipW, chipX };
}

/** 칸판의 줄. 0 나무 · 1 고를 수 있다 · 2 고를 수 없다. */
function laneTop(lane: number): number {
  return (LANE_Y[lane] ?? LANE_Y[2] ?? 0) - CHIP_H / 2;
}

/**
 * 간선마다 어느 줄에 서는가. **출발 배치와 도착 배치를 같은 함수가 셈한다** —
 * 두 벌로 두면 칸이 어디서 출발하는지가 두 자리에서 정해진다.
 *
 * @param pending 아직 나무에 안 든 것으로 칠 간선 (그어지는 중). 없으면 `null`.
 */
function lanesOf(
  scene: GrowOneTreeScene,
  candidates: ReadonlySet<string>,
  pending: string | null,
): Map<string, number> {
  const tree = treeEdgesOf(scene);
  const lanes = new Map<string, number>();
  for (const e of scene.edges) {
    if (tree.has(e.id) && e.id !== pending) lanes.set(e.id, 0);
    else if (candidates.has(e.id)) lanes.set(e.id, 1);
    else lanes.set(e.id, 2);
  }
  return lanes;
}

/**
 * 한 번 그릴 때의 화면 형편. 장면이 말하지 않는 **지나가는 것**만 담는다.
 *
 * 멎어 있을 때는 `restBoard` 가 장면에서 곧바로 만들고, 운동 중에는 프레임마다
 * 새로 만들어진다. 어느 쪽이든 그리는 길은 `paint` 하나다.
 */
type Board = {
  /** 아직 나무에 안 든 것으로 그릴 간선과 그 새 끝. 선이 다 그어져야 든다. */
  pending: { edgeId: string; node: string } | null;
  /** 나무 쪽 끝에서 그어져 나가는 선. 없으면 `null`. */
  drawing: { edgeId: string; t: number } | null;
  /** 붙은 자리에서 한 번 퍼지는 테. */
  halo: { at: Point; t: number } | null;
  /** 칸이 출발한 줄. `null` 이면 제자리에 서 있다. */
  fromLane: Map<string, number> | null;
  /** 칸이 제 줄까지 간 정도. 1 이면 도착. */
  slide: number;
  /** 이번에 새로 후보가 된 간선들의 표식이 벌어진 정도. */
  marking: { ids: ReadonlySet<string>; t: number } | null;
  /** 다 자란 나무가 한 번 부푸는 정도. */
  swell: number;
  /** 나무에 못 든 것이 흐려진 정도. 다 자란 화면에 머무는 형편이다. */
  fade: number;
};

export const growOneTreeStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<GrowOneTreeScene> {
    const c = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 붙인 캔버스가 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const gEdges = el('g');
    const gGrow = el('g');
    // 무게는 그어지는 선보다 위에 있어야 한다 — 아래 두면 자라는 동안 숫자가 덮인다.
    const gWeights = el('g');
    const gNodes = el('g');
    const gTray = el('g');
    const gCaption = el('g');
    canvas.append(gEdges, gGrow, gWeights, gNodes, gTray, gCaption);

    // 캡션만 재건 밖에 있다. 그래서 정적 경로가 **매번 명시로** 쓴다 — 비울 때도
    // 빈 문자열을 쓴다. 나머지는 `paint` 가 매번 새로 짓는다.
    const captionLine1 = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const captionLine2 = el('text', {
      x: W / 2,
      y: CAPTION_Y + CAPTION_LINE_H,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.textMuted,
    });
    gCaption.append(captionLine1, captionLine2);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장. `render` 가 불릴 때마다 오르고, 깨어난 걸음 함수는 자기 세대를
     * 확인한 뒤에만 그린다.
     *
     * 되짚기는 `opts.animate` 가 거짓으로 오므로 프레임을 아예 안 거는 것이 첫
     * 빗장이고 이것이 둘째다. 고르는 걸음은 `await` 를 둘 지난다 (선이 그어진 뒤
     * 테가 퍼지고 칸이 오른다) — 그 사이에 새 `render` 가 오면 살아남은 뒷마디가
     * 이미 새로 선 화면을 덮는다.
     */
    let gen = 0;

    /** 화면에 보이는 간선 이름. 데이터의 id 가 아니라 두 끝으로 짓는다. */
    function nameOf(edge: GrowOneTreeSceneEdge): string {
      return `${edge.u}–${edge.v}`;
    }

    // ── 문안. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10).
    //    수는 전부 그 장면의 `joins` · `round` 에서 셈한다.
    function captionLines(scene: GrowOneTreeScene): [string, string] {
      const caption = scene.caption;
      if (caption === null) return ['', ''];
      switch (caption.kind) {
        case 'seed':
          return [
            tr('caption.seed', 'Start with {node} alone — that is the whole tree.', {
              node: scene.start,
            }),
            '',
          ];
        case 'frontier':
          return [
            tr('caption.frontier', 'Only the {count} edges leading out of the tree can be picked.', {
              count: scene.round?.candidates.length ?? 0,
            }),
            '',
          ];
        case 'pick': {
          const join = scene.joins[scene.joins.length - 1];
          const spec = scene.edges.find((e) => e.id === join?.id);
          if (join === undefined || spec === undefined) return ['', ''];
          const blockedId = scene.round?.blocked ?? null;
          const blocked = scene.edges.find((e) => e.id === blockedId);
          if (blocked === undefined) {
            return [
              tr('caption.pick', 'The lightest of them is {weight} — {node} joins the tree.', {
                weight: spec.w,
                node: join.to,
              }),
              '',
            ];
          }
          // 두 줄짜리 문안이다. 저작자 오버라이드도 줄바꿈을 그대로 쓴다.
          const [first = '', second = ''] = tr(
            'caption.pickBlocked',
            'The lightest of them is {weight} — {node} joins the tree.\n{edge} weighs only {blocked}, but it does not touch the tree yet.',
            {
              weight: spec.w,
              node: join.to,
              edge: nameOf(blocked),
              blocked: blocked.w,
            },
          ).split('\n');
          return [first, second];
        }
        case 'done': {
          // 간선 수도 무게 합도 그림과 **같은 목록**에서 나온다.
          const specs = scene.joins.map((j) => scene.edges.find((e) => e.id === j.id));
          let total = 0;
          for (const spec of specs) total += spec?.w ?? 0;
          return [
            tr('caption.done', 'The tree is full — {count} edges, total weight {total}.', {
              count: scene.joins.length,
              total,
            }),
            '',
          ];
        }
      }
    }

    // ── 그리기 -------------------------------------------------------------

    function restBoard(scene: GrowOneTreeScene): Board {
      return {
        pending: null,
        drawing: null,
        halo: null,
        fromLane: null,
        slide: 1,
        marking: null,
        swell: 0,
        fade: scene.finished ? 1 : 0,
      };
    }

    /** 흐려진 정도를 속성 문자열로. 양 끝은 상수를 그대로 쓴다. */
    function fadedOpacity(t: number): string {
      if (t <= 0) return '1';
      if (t >= 1) return String(REST_OPACITY);
      return fmt(1 + (REST_OPACITY - 1) * t);
    }

    /**
     * 그 장면의 화면을 통째로 세운다. 되돌릴 명령이 없으므로 늘 비우고 시작한다.
     */
    function paint(scene: GrowOneTreeScene, geo: Geo, board: Board): void {
      gEdges.textContent = '';
      gGrow.textContent = '';
      gWeights.textContent = '';
      gNodes.textContent = '';
      gTray.textContent = '';

      const pendingEdge = board.pending?.edgeId ?? null;
      const pendingNode = board.pending?.node ?? null;
      const treeEdges = treeEdgesOf(scene);
      const treeNodes = treeNodesOf(scene);
      const candidates = new Set(scene.round?.candidates ?? []);
      const blocked = scene.round?.blocked ?? null;

      /** 채움 — 나무에 들었나. 그어지는 중인 간선과 그 새 끝은 아직 아니다. */
      const inTree = (id: string): boolean => treeEdges.has(id) && id !== pendingEdge;
      const nodeInTree = (name: string): boolean => treeNodes.has(name) && name !== pendingNode;

      for (const e of scene.edges) {
        const a = geo.pos.get(e.u);
        const b = geo.pos.get(e.v);
        if (!a || !b) continue;
        const joined = inTree(e.id);
        const opacity = joined ? '1' : fadedOpacity(board.fade);

        // 견줌의 표식 — 후보로 오른 간선에만 덧테를 두른다. 아직 없는 것은 짓지 않는다.
        if (candidates.has(e.id)) {
          const grow = board.marking !== null && board.marking.ids.has(e.id) ? board.marking.t : 1;
          gEdges.appendChild(
            el('line', {
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              stroke: c.itemComparing,
              'stroke-width': fmt(MARK_W * grow),
              'stroke-linecap': 'round',
              opacity: MARK_OPACITY,
            }),
          );
        }

        const width = joined ? EDGE_W_TREE + DONE_SWELL * board.swell : EDGE_W_IDLE;
        const line = el('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          'stroke-linecap': 'round',
          'stroke-width': fmt(width),
          // 짚기 — 캡션이 "더 가벼운데 아직 못 고른다" 고 가리키는 그 간선.
          stroke: joined ? c.itemSorted : e.id === blocked ? c.accent : c.border,
          opacity,
        });
        if (!joined) line.setAttribute('stroke-dasharray', '5 5');
        gEdges.appendChild(line);

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        gWeights.append(
          el('rect', { x: mx - 11, y: my - 9, width: 22, height: 18, rx: 4, fill: c.bg, opacity }),
        );
        const label = el('text', {
          x: mx,
          y: my + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: joined ? c.text : e.id === blocked ? c.accent : c.textMuted,
          'font-weight': joined || candidates.has(e.id) || e.id === blocked ? 700 : 400,
          opacity,
        });
        label.textContent = String(e.w);
        gWeights.appendChild(label);
      }

      for (const name of scene.nodes) {
        const p = geo.pos.get(name);
        if (!p) continue;
        const joined = nodeInTree(name);
        gNodes.append(
          el('circle', {
            cx: p.x,
            cy: p.y,
            r: NODE_R,
            fill: joined ? c.itemSorted : c.itemDefault,
            stroke: joined ? c.itemSorted : c.border,
            'stroke-width': joined ? 3 : 2,
          }),
        );
        const text = el('text', {
          x: p.x,
          y: p.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: joined ? c.textInverse : c.text,
        });
        text.textContent = name;
        gNodes.appendChild(text);
      }

      // 그어지는 중인 선과 퍼지는 테. 멎은 화면에는 아예 짓지 않는다.
      if (board.drawing !== null) {
        const join = scene.joins.find((j) => j.id === board.drawing?.edgeId);
        const a = join ? geo.pos.get(join.from) : undefined;
        const b = join ? geo.pos.get(join.to) : undefined;
        if (a && b) {
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          gGrow.appendChild(
            el('line', {
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              stroke: c.itemSorted,
              'stroke-width': EDGE_W_TREE,
              'stroke-linecap': 'round',
              'stroke-dasharray': `${fmt(len)} ${fmt(len)}`,
              'stroke-dashoffset': fmt(len * (1 - board.drawing.t)),
            }),
          );
        }
      }
      if (board.halo !== null) {
        gNodes.appendChild(
          el('circle', {
            cx: board.halo.at.x,
            cy: board.halo.at.y,
            r: fmt(NODE_R + HALO_SPREAD * board.halo.t),
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 3,
            opacity: fmt(HALO_OPACITY * (1 - board.halo.t)),
          }),
        );
      }

      // ── 칸판
      gTray.appendChild(
        el('line', {
          x1: 14,
          y1: SEPARATOR_Y,
          x2: W - 14,
          y2: SEPARATOR_Y,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const laneNames = [
        tr('lane.tree', 'in tree'),
        tr('lane.canPick', 'can pick'),
        tr('lane.blocked', 'cannot'),
      ];
      laneNames.forEach((name, lane) => {
        const label = el('text', {
          x: LANE_LABEL_RIGHT,
          y: (LANE_Y[lane] ?? 0) + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = name;
        gTray.appendChild(label);
      });

      const lanes = lanesOf(scene, candidates, pendingEdge);
      for (const e of scene.edges) {
        const lane = lanes.get(e.id) ?? 2;
        const target = laneTop(lane);
        const from = board.fromLane === null ? target : laneTop(board.fromLane.get(e.id) ?? lane);
        const y = from + (target - from) * board.slide;
        const marked = candidates.has(e.id);
        const filled = lane === 0;
        const ink = filled ? c.textInverse : lane === 1 ? c.text : c.textMuted;

        const group = el('g', { transform: `translate(${geo.chipX.get(e.id) ?? 0}, ${fmt(y)})` });
        group.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width: geo.chipW,
            height: CHIP_H,
            rx: 6,
            // 채움 = 값의 형편, 테두리 = 견줌의 표식. 두 축이 겹쳐도 서로를 안 덮는다.
            fill: filled ? c.itemSorted : c.bg,
            stroke: marked ? c.itemComparing : c.border,
            'stroke-width': marked ? CHIP_MARK_W : CHIP_PLAIN_W,
          }),
        );
        const name = el('text', {
          x: 9,
          y: CHIP_H / 2 + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: ink,
        });
        name.textContent = nameOf(e);
        const weight = el('text', {
          x: geo.chipW - 9,
          y: CHIP_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: e.id === blocked ? c.accent : ink,
        });
        weight.textContent = String(e.w);
        group.append(name, weight);
        gTray.appendChild(group);
      }

      const [first, second] = captionLines(scene);
      captionLine1.textContent = first;
      captionLine2.textContent = second;
    }

    // ── 시간 ---------------------------------------------------------------

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(ms: number, draw: (t: number) => void): Promise<void> {
      const mine = gen;
      if (destroyed || typeof requestAnimationFrame !== 'function' || ms <= 0) {
        if (!destroyed) draw(1);
        return Promise.resolve();
      }
      const t0 = now();
      return new Promise<void>((resolve) => {
        // 푸는 일을 콜백 **밖**에도 둔다. `destroy` 가 프레임을 취소하면 그 콜백은
        // 아예 안 불리므로, 여기 담아 두지 않으면 약속이 영영 안 풀린다 (S-piece).
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const t = Math.min(1, (now() - t0) / ms);
          draw(t);
          if (t >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        draw(0);
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    /** 이번 걸음에 달라진 것만 흐르게 한다. */
    async function flow(scene: GrowOneTreeScene, geo: Geo, live: () => boolean): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const rest = restBoard(scene);
      const candidates = new Set(scene.round?.candidates ?? []);

      // 씨앗이 놓인다. 칸은 아직 아무 데도 안 간다 — 나무 밖 간선이 하나도 없다.
      if (step.kind === 'seed') {
        const at = geo.pos.get(scene.start);
        if (at === undefined) return;
        await animate(JOIN_MS, (t) => paint(scene, geo, { ...rest, halo: { at, t } }));
        return;
      }

      // 후보가 드러나거나(칸이 오른다) 나무가 다 자란다(칸이 내려온다).
      // 한 뜻으로 묶인 운동이라 시계를 하나만 돌린다.
      if (step.kind === 'frontier' || step.kind === 'done') {
        const was = new Set(step.wasShowing);
        const fromLane = lanesOf(scene, was, null);
        const fresh = new Set([...candidates].filter((id) => !was.has(id)));
        const finishing = step.kind === 'done';
        await animate(finishing ? DONE_MS : SHIFT_MS, (t) => {
          const e = easeOut(t);
          paint(scene, geo, {
            ...rest,
            fromLane,
            slide: e,
            marking: fresh.size > 0 ? { ids: fresh, t: e } : null,
            swell: finishing ? Math.sin(Math.PI * t) : 0,
            fade: finishing ? e : rest.fade,
          });
        });
        return;
      }

      // 고른 간선이 나무 쪽 끝에서부터 그어지고, 다 그어지면 테가 퍼지며 칸이 오른다.
      const join = scene.joins[scene.joins.length - 1];
      const at = join === undefined ? undefined : geo.pos.get(join.to);
      if (join === undefined || join.id !== step.edgeId || at === undefined) return;

      await animate(GROW_MS, (t) =>
        paint(scene, geo, {
          ...rest,
          pending: { edgeId: join.id, node: join.to },
          drawing: { edgeId: join.id, t: easeOut(t) },
        }),
      );
      if (!live()) return;

      // 칸의 출발 줄 — 아직 후보 줄에 서 있던 배치를 같은 함수로 셈한다.
      const fromLane = lanesOf(scene, candidates, join.id);
      await animate(JOIN_MS, (t) => {
        const e = easeOut(t);
        paint(scene, geo, { ...rest, fromLane, slide: e, halo: { at, t } });
      });
    }

    async function render(
      next: GrowOneTreeScene,
      /** 이 조각은 출발 배치를 `step` 에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: GrowOneTreeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = geometryOf(next);
      paint(next, geo, restBoard(next));

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, geo, live);
      if (!live()) return;

      // 운동이 끝나면 장면을 통째로 다시 세운다. 보간의 끝자리가 목표값과 문자열로
      // 어긋나는 일이 없어진다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      paint(next, geo, restBoard(next));
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
