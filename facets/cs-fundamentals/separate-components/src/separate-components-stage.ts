/**
 * separate-components-stage — 연결 요소 조각의 화면.
 *
 * ── 무엇이 화면에서 일어나는가
 *
 * 정점 여덟이 한 줄로 놓이고 간선이 그 사이를 잇는다. 잇지 않은 자리는 **비어
 * 있다** — 빛이 건너지 못하는 지점이 그 빈 자리다.
 *
 *   출발      출발선(아래 가로선)에서 불씨가 **떠올라** 정점에 닿는다. 출발선에는
 *             번호가 찍힌 도장이 남는다. 도장이 쌓이는 것이 곧 몇 번 출발했는지다.
 *   번짐      불빛이 간선을 **타고 이동한다**. 도착한 정점이 켜지고, 양 끝이 한
 *             무리로 켜진 간선도 함께 켜진다 (밟지 않은 삼각형의 세 번째 변까지).
 *   끝        탐색 커서가 오므라들어 사라지고, **켜지지 않은 것들이 한 번
 *             출렁이고 제자리에 그대로 있는다.** 그리고 화면이 멈춘다.
 *
 * 운동은 전부 위치·크기 변화다. 색 전환은 "어느 무리인가" 가 곧 값인 자리에만 쓴다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`seed()` · `spread()` · `sweepEnd()`) 를 두지 않는다. 그
 * 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터 다시 밟는
 * 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의 화면
 * 전체**를 세운다 (S-scene).
 *
 * 무리의 소속은 `scene.lit` 이 말한다. 색은 여기서 소속을 보고 정한다 — 장면에는
 * 색이 없다. 화면에 뜨는 수(몇 번 출발했나 · 몇 개가 켜졌나 · 무리의 크기)도 전부
 * 같은 소속에서 셈한다. 그래서 "무리 셋" 이라는 글과 실제로 갈린 덩어리가 어긋날
 * 길이 없다.
 *
 * `prev` 는 들추지 않는다. 운동의 출발 자리는 `step.cursorWas` 가 싣고 있다.
 *
 * ── 좌표
 *
 * 정점 반지름과 간격은 캔버스 폭에서 역산한다. 상수는 상한만 잡는다 (S-piece).
 * 자리는 그리기 전에 한 번에 셈해 둔다 (`geometryOf`) — 그리면서 재면 순회 순서가
 * 곧 숨은 상태가 된다.
 *
 * ── 뒷일
 *
 * 타이머는 requestAnimationFrame 뿐이고, 걸어 둔 것과 기다리는 것은 집합에 담아
 * destroy 에서 일괄로 거둔다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  componentOf,
  groupsOf,
  type ComponentGraph,
  type SeparateComponentsCaption,
  type SeparateComponentsScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 캡션 한 줄 + 아치 + 정점 줄 + 출발선. */
const CANVAS_H = 232;
const CAPTION_Y = 26;
const NODE_Y = 132;
const GROUND_Y = 194;

/** 상한만 잡는 상수 — 실제 크기는 폭에서 역산한다. */
const NODE_R_MAX = 26;
const SIDE_MIN = 30;
const ARC_RISE_MAX = 52;

/** 커서가 정점 밖으로 벌어지는 여유. */
const CURSOR_GAP = 9;

/** 걸음 하나의 애니메이션 길이. 걸음 간격(stepMs) 안에 들어가도록 짧게 잡는다. */
const SEED_MS = 300;
const SPREAD_MS = 260;
const POP_MS = 140;
const SETTLE_MS = 280;

/** 출렁임의 진폭. 남은 것들이 "그대로 있다" 고 말하는 몸짓이다. */
const BOB_PX = 7;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

type Point = { x: number; y: number };

/** 간선 하나의 기하. 아치의 제어점은 두 정점의 **차례 차이**가 정한다. */
type EdgeGeo = {
  a: string;
  b: string;
  /** 이웃하지 않은 정점을 잇는 아치의 제어점. 이웃이면 null (곧은 선). */
  ctrl: Point | null;
};

/**
 * 간선을 따라 실제로 이어진 덩어리의 수. **그래프만 본다** — 걸음을 타지 않는다.
 *
 * 색판의 크기가 이것으로 정해진다. 걸음마다 자라는 셈(지금까지 발견한 무리 수)을
 * 씨앗으로 쓰면 무리가 하나 늘 때마다 hue 가 다시 나뉘어 **이미 칠한 무리의 색이
 * 바뀐다.** 그래프에서 세면 첫 그림부터 마지막 그림까지 색판이 같다.
 */
function componentCount(graph: ComponentGraph): number {
  const adj = new Map<string, string[]>();
  for (const id of graph.nodes) adj.set(id, []);
  for (const e of graph.edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }
  const seen = new Set<string>();
  let count = 0;
  for (const id of graph.nodes) {
    if (seen.has(id)) continue;
    count += 1;
    seen.add(id);
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.pop();
      if (cur === undefined) break;
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return count;
}

/** 장면이 말하는 구조에서 역산한 자리와 색판. 그리기 전에 한 번에 셈한다. */
type Geo = {
  nodeR: number;
  x: Map<string, number>;
  edges: EdgeGeo[];
  /**
   * 덩어리 식별 색 (색 결정 트리 3 — n 개 카테고리).
   *
   * 그래프의 덩어리 수만큼 hue 를 나눈다. 정점·간선 선언을 고쳐 덩어리가 넷이 되면
   * 색판도 넷으로 따라 나뉜다 — 상수로 박아 두면 그때 조용히 어긋난다.
   */
  palette: readonly string[];
};

function geometryOf(graph: ComponentGraph): Geo {
  const W = PIECE_CANVAS_W;
  const count = graph.nodes.length;
  const x = new Map<string, number>();
  const palette = categorical(Math.max(1, componentCount(graph)), 'vivid');
  if (count === 0) return { nodeR: NODE_R_MAX, x, edges: [], palette };

  // 폭을 채운다 — 반지름과 간격을 캔버스에서 역산하고 상수는 상한으로만 쓴다.
  // 3.2 는 "정점 하나가 자기 지름의 1.6배를 차지한다" 는 뜻이다. 남는 만큼이
  // 간선이 되므로, 이 값이 커질수록 이어진 자리와 끊긴 자리가 또렷해진다.
  const nodeR = Math.max(
    12,
    Math.min(NODE_R_MAX, Math.floor((W - SIDE_MIN * 2) / Math.max(1, count * 3.2))),
  );
  const pitch = count > 1 ? (W - (SIDE_MIN + nodeR) * 2) / (count - 1) : 0;
  const originX = count > 1 ? SIDE_MIN + nodeR : W / 2;

  const indexOf = new Map<string, number>();
  graph.nodes.forEach((id, i) => {
    x.set(id, originX + pitch * i);
    indexOf.set(id, i);
  });

  const edges: EdgeGeo[] = [];
  for (const raw of graph.edges) {
    if (!x.has(raw.a) || !x.has(raw.b)) continue;
    const distance = Math.abs((indexOf.get(raw.a) ?? 0) - (indexOf.get(raw.b) ?? 0));
    // 이웃끼리는 곧은 선, 건너뛴 사이는 위로 넘어가는 아치.
    const ctrl =
      distance <= 1
        ? null
        : {
            x: ((x.get(raw.a) ?? 0) + (x.get(raw.b) ?? 0)) / 2,
            y: NODE_Y - Math.min(ARC_RISE_MAX, 22 + 14 * distance) * 2,
          };
    edges.push({ a: raw.a, b: raw.b, ctrl });
  }
  return { nodeR, x, edges, palette };
}

/**
 * 한 번 그릴 때의 화면 형편. 장면이 말하지 않는 **지나가는 것**만 담는다.
 *
 * 멎어 있을 때는 `restBoard` 가 장면에서 곧바로 만들고, 운동 중에는 프레임마다
 * 새로 만들어진다. 어느 쪽이든 그리는 길은 `paint` 하나다.
 */
type Board = {
  /** 아직 켜지지 않은 것으로 그릴 정점. 운동이 끝나야 켜지는 도착점이다. */
  pending: string | null;
  /** 맨 나중 도장이 자란 정도. 1 이면 다 자랐다. */
  stampGrow: number;
  /** 탐색 커서. 없으면 null. */
  cursor: { x: number; r: number } | null;
  /** 켜지지 않은 정점들의 세로 오프셋. 간선의 끝점도 이것을 따라간다. */
  bob: number;
  /** 부풀었다 돌아오는 정점. */
  pop: { id: string; scale: number } | null;
  /** 간선 위를 건너가거나 출발선에서 떠오르는 불씨. */
  spark: { x: number; y: number; color: string } | null;
};

export const separateComponentsStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SeparateComponentsScene> {
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const W = PIECE_CANVAS_W;

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const ground = el('line', {
      x1: SIDE_MIN,
      y1: GROUND_Y,
      x2: W - SIDE_MIN,
      y2: GROUND_Y,
      stroke: colors.border,
      'stroke-width': 1.5,
    });
    const gEdges = el('g');
    const gNodes = el('g');
    const gMarks = el('g');
    const gMotion = el('g');
    svg.append(caption, ground, gEdges, gNodes, gMarks, gMotion);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장. `render` 가 불릴 때마다 오르고, 깨어난 걸음 함수는 자기 세대를
     * 확인한 뒤에만 그린다.
     *
     * 되짚기는 `opts.animate` 가 거짓으로 오므로 프레임을 아예 안 거는 것이 첫
     * 빗장이고, 이것이 두 번째다. 이 조각의 걸음은 `await` 를 둘 지난다 (번짐 뒤에
     * 부풀림이 따라온다) — 그 사이에 새 `render` 가 오면 살아남은 뒷마디가 이미
     * 새로 선 화면을 덮는다.
     */
    let gen = 0;

    function componentColor(geo: Geo, index: number): string {
      const size = geo.palette.length;
      if (size === 0) return colors.itemDefault;
      return geo.palette[((index % size) + size) % size] ?? colors.itemDefault;
    }

    // ── 문안. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10).
    //    수는 전부 그 장면의 소속에서 셈한다 — 장면이 실어 온 수를 쓰지 않는다.
    function captionText(c: SeparateComponentsCaption, scene: SeparateComponentsScene): string {
      switch (c.kind) {
        case 'start':
          return tr('caption.start', 'The search starts at {node} and lights up whatever it reaches.', {
            node: c.node,
          });
        case 'restart':
          return tr('caption.restart', 'It cannot cross over — only a fresh start reaches what is left.');
        case 'remains':
          return tr('caption.remains', 'The search is over — {lit} lit, and {remaining} stay dark.', {
            lit: scene.lit.length,
            remaining: scene.graph.nodes.length - scene.lit.length,
          });
        case 'done': {
          // 출발 횟수와 크기가 **같은 목록**에서 나온다. 도장을 세는 자리와도 같다.
          const groups = groupsOf(scene.lit);
          return tr('caption.done', '{starts} starts were needed — {starts} separate groups, sized {sizes}.', {
            starts: groups.length,
            sizes: groups.map((g) => g.size).join(' · '),
          });
        }
      }
    }

    // ── 그리기 -------------------------------------------------------------

    function restBoard(scene: SeparateComponentsScene, geo: Geo): Board {
      const at = scene.cursor === null ? null : geo.x.get(scene.cursor);
      return {
        pending: null,
        stampGrow: 1,
        cursor: at === undefined || at === null ? null : { x: at, r: geo.nodeR + CURSOR_GAP },
        bob: 0,
        pop: null,
        spark: null,
      };
    }

    /**
     * 그 장면의 화면을 통째로 세운다. 되돌릴 명령이 없으므로 늘 비우고 시작한다.
     *
     * 고정 자리의 캡션만 재건 밖에 있고, 그것도 매 번 명시로 쓴다 — 비워야 할 때
     * 빈 문자열을 쓴다. 나머지는 이 함수가 매번 새로 짓는다.
     */
    function paint(scene: SeparateComponentsScene, geo: Geo, board: Board): void {
      gEdges.textContent = '';
      gNodes.textContent = '';
      gMarks.textContent = '';
      gMotion.textContent = '';

      const belongs = componentOf(scene.lit);
      /** 화면에 보이는 소속. 운동 중인 도착점은 아직 켜지지 않은 것으로 친다. */
      const shown = (id: string): number => (id === board.pending ? -1 : (belongs.get(id) ?? -1));
      const yOf = (id: string): number => NODE_Y + (shown(id) < 0 ? board.bob : 0);

      for (const e of geo.edges) {
        const ca = shown(e.a);
        const cb = shown(e.b);
        // 양 끝이 **한 무리로** 켜졌을 때만 간선이 켜진다.
        const joined = ca >= 0 && ca === cb;
        const ax = geo.x.get(e.a) ?? 0;
        const bx = geo.x.get(e.b) ?? 0;
        const d = e.ctrl
          ? `M ${ax} ${yOf(e.a)} Q ${e.ctrl.x} ${e.ctrl.y} ${bx} ${yOf(e.b)}`
          : `M ${ax} ${yOf(e.a)} L ${bx} ${yOf(e.b)}`;
        gEdges.append(
          el('path', {
            d,
            fill: 'none',
            'stroke-linecap': 'round',
            stroke: joined ? componentColor(geo, ca) : colors.border,
            'stroke-width': joined ? 3.5 : 2,
          }),
        );
      }

      for (const id of scene.graph.nodes) {
        const c = shown(id);
        const x = geo.x.get(id) ?? 0;
        const group = el('g', { transform: `translate(${x} ${yOf(id)})` });
        const swell = board.pop !== null && board.pop.id === id ? board.pop.scale : 1;
        const disc = el('circle', { cx: 0, cy: 0, r: geo.nodeR * swell, 'stroke-width': 2 });
        if (c < 0) {
          disc.setAttribute('fill', colors.itemDefault);
          disc.setAttribute('stroke', colors.border);
          disc.setAttribute('stroke-dasharray', '5 4');
        } else {
          const color = componentColor(geo, c);
          disc.setAttribute('fill', color);
          disc.setAttribute('stroke', shiftLightness(color, -0.16));
        }
        const label = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: c < 0 ? colors.textMuted : colors.stateInk,
        });
        label.textContent = id;
        group.append(disc, label);
        gNodes.append(group);
      }

      // 출발선에 남는 도장. 몇 번 출발했는지가 여기 쌓인다 — 소속에서 파생된다.
      const groups = groupsOf(scene.lit);
      groups.forEach((g, i) => {
        const grow = i === groups.length - 1 ? board.stampGrow : 1;
        const x = geo.x.get(g.start) ?? 0;
        const color = componentColor(geo, g.component);
        const group = el('g', { transform: `translate(${x} ${GROUND_Y}) scale(${grow})` });
        const badge = el('circle', {
          cx: 0,
          cy: 0,
          r: 11,
          fill: color,
          stroke: shiftLightness(color, -0.16),
          'stroke-width': 2,
        });
        const text = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: colors.stateInk,
        });
        text.textContent = String(i + 1);
        group.append(badge, text);
        gMarks.append(group);
      });

      if (board.cursor !== null) {
        gMarks.append(
          el('circle', {
            cx: board.cursor.x,
            cy: NODE_Y,
            r: Math.max(0, board.cursor.r),
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 2.5,
            'stroke-dasharray': '6 5',
          }),
        );
      }

      if (board.spark !== null) {
        gMotion.append(
          el('circle', { cx: board.spark.x, cy: board.spark.y, r: 7.5, fill: board.spark.color }),
        );
      }

      caption.textContent = scene.caption === null ? '' : captionText(scene.caption, scene);
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

    /** 간선 위 한 점. `fromId` 쪽에서 반대쪽으로 t 만큼 간 자리. */
    function pointOn(e: EdgeGeo, geo: Geo, fromId: string, t: number): Point {
      const forward = e.a === fromId;
      const p0 = { x: geo.x.get(forward ? e.a : e.b) ?? 0, y: NODE_Y };
      const p1 = { x: geo.x.get(forward ? e.b : e.a) ?? 0, y: NODE_Y };
      if (!e.ctrl) return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * e.ctrl.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * e.ctrl.y + t * t * p1.y,
      };
    }

    /** 방금 켜진 정점이 한 번 부푼다. */
    function popNode(scene: SeparateComponentsScene, geo: Geo, id: string): Promise<void> {
      const rest = restBoard(scene, geo);
      return animate(POP_MS, (t) => {
        paint(scene, geo, { ...rest, pop: { id, scale: 1 + Math.sin(Math.PI * t) * 0.16 } });
      });
    }

    /** 이번 걸음에 달라진 것만 흐르게 한다. */
    async function flow(
      scene: SeparateComponentsScene,
      geo: Geo,
      live: () => boolean,
    ): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const rest = restBoard(scene, geo);
      const belongs = componentOf(scene.lit);

      if (step.kind === 'seed') {
        const nx = geo.x.get(step.node) ?? 0;
        const color = componentColor(geo, belongs.get(step.node) ?? 0);
        // 불씨가 출발선에서 떠올라 정점에 닿는다. 도장이 자라고 커서가 벌어진다.
        await animate(SEED_MS, (t) => {
          const e = easeOut(t);
          paint(scene, geo, {
            ...rest,
            pending: step.node,
            stampGrow: Math.min(1, t * 2.2),
            cursor: { x: nx, r: (geo.nodeR + CURSOR_GAP) * e },
            spark: { x: nx, y: GROUND_Y + (NODE_Y - GROUND_Y) * e, color },
          });
        });
        if (!live()) return;
        await popNode(scene, geo, step.node);
        return;
      }

      if (step.kind === 'spread') {
        const edge = geo.edges.find(
          (e) =>
            (e.a === step.from && e.b === step.to) || (e.a === step.to && e.b === step.from),
        );
        if (edge === undefined) return;
        const color = componentColor(geo, belongs.get(step.to) ?? 0);
        const toX = geo.x.get(step.from) ?? 0;
        // 커서의 출발 자리는 앞 장면이 아니라 걸음이 실어 온 계기값이 말한다.
        const fromX = step.cursorWas === null ? toX : (geo.x.get(step.cursorWas) ?? toX);
        // 불빛이 간선을 타고 건너간다. 커서도 같은 시간에 미끄러져 따라온다.
        await animate(SPREAD_MS, (t) => {
          const e = easeInOut(t);
          const p = pointOn(edge, geo, step.from, e);
          paint(scene, geo, {
            ...rest,
            pending: step.to,
            cursor: { x: fromX + (toX - fromX) * e, r: geo.nodeR + CURSOR_GAP },
            spark: { x: p.x, y: p.y, color },
          });
        });
        if (!live()) return;
        await popNode(scene, geo, step.to);
        return;
      }

      // 한 번의 탐색이 끝났다. 커서가 오므라들고 켜지지 않은 것들이 한 번 출렁인다.
      // 출렁임이 끝나도 그것들은 꺼진 채 제자리에 그대로 있다 — 그게 요점이다.
      const wasAt = step.cursorWas === null ? null : (geo.x.get(step.cursorWas) ?? null);
      const startR = geo.nodeR + CURSOR_GAP;
      await animate(SETTLE_MS, (t) => {
        paint(scene, geo, {
          ...rest,
          cursor: wasAt === null ? null : { x: wasAt, r: startR * (1 - easeOut(t)) },
          bob: Math.sin(Math.PI * t) * BOB_PX,
        });
      });
    }

    async function render(
      next: SeparateComponentsScene,
      /** 이 조각은 출발 자리를 `step` 에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: SeparateComponentsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = geometryOf(next.graph);
      paint(next, geo, restBoard(next, geo));

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, geo, live);
      if (!live()) return;

      // 운동이 끝나면 장면을 통째로 다시 세운다. 보간의 끝자리가 목표값과 문자열로
      // 어긋나는 일이 없어진다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      paint(next, geo, restBoard(next, geo));
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
        svg.textContent = '';
      },
    };
  },
};
