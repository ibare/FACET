/**
 * two-color-conflict-stage — 고리를 한 줄로 펴 놓고, 되돌아오는 변을 아래로
 * 걸어 두 색이 그 변에서 부딪히는 것을 보인다.
 *
 * ── 배치가 이렇게 나온 이유
 * 질문의 동사는 "부딪힌다" 다. 부딪히려면 두 물체가 서로를 향해 **움직여야**
 * 하고, 부딪히는 자리가 화면에서 한눈에 보여야 한다. 그래서 정점을 캔버스 폭
 * 가득 한 줄로 펴고 (칠하기가 왼쪽에서 오른쪽으로 흘러가게), 고리를 닫는
 * 마지막 변만 아래로 크게 휘어 걸었다. 그 활의 한가운데가 충돌 지점이다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`paintStep()` · `closeStep()` · `markConflict()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 (S-scene).
 *
 * 칠한 색도, 밟은 변도, 부딪힌 두 끝도 전부 `scene.painted` 와 `scene.closing` 이
 * 말한다. 한때 `closeStep()` 은 정점의 색을 stage 의 `painted` 맵에서 **도로 읽어**
 * 마지막 두 알을 칠했는데, 되짚어 세운 직후에는 그 맵이 옛 화면의 것이었다.
 *
 * `prev` 는 들추지 않는다. 이 조각의 운동은 전부 `painted` 의 끝 두 항에서
 * 출발하므로 그 장면 자체가 출발 자리를 말한다.
 *
 * ── 색이 곧 값이다
 * 두 칠감은 `categorical(2)` 로 받는다 (S-view 결정 트리 3번 — n 개 범주 식별).
 * 두 색은 알고리즘의 형편(견주는 중 · 정렬됨)이 아니라 **매겨지는 값 자체**라
 * state 어휘가 아니다. 색판의 크기는 "지금까지 드러난 색 수" 가 아니라 **두 색
 * 칠하기라는 조각의 바탕**이 정하는 2 다 — 걸음마다 자라는 셈을 씨앗으로 쓰면
 * 색이 하나 늘 때 이미 칠한 정점의 빛깔이 통째로 갈린다.
 *
 * 갈라 두어 부딪히지 않게 한다 — **채움은 값**(무슨 색으로 칠했나 / 아직 안
 * 칠했나), **테두리·덧링은 짚음과 부딪힘의 표식**(지금 보는 자리 · 같은 색으로
 * 맞선 두 끝). 두 뜻이 한 속성에 실리지 않는다.
 *
 * ── 세로
 * 마운트한 뒤 viewBox 를 다시 재지 않는다 (S-view). 정점 한 줄 + 활 + 캡션의
 * 높이는 정점 개수와 무관하다.
 *
 * ── 뒷일
 * 걸어 둔 프레임과 기다리는 약속은 집합에 담아 destroy 가 일괄로 거둔다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  colorOf,
  conflictOf,
  edgeStateOf,
  sameEdge,
  type TwoColorConflictCaption,
  type TwoColorConflictScene,
  type TwoColorRing,
  type TwoColorSceneEdge,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_H = 232;
/** 정점 한 줄의 중심 높이. */
const ROW_Y = 60;
/** 정점 반지름의 상한. 실제 값은 캔버스 폭에서 역산한다 (S-piece). */
const NODE_R_MAX = 28;
/** 좌우 최소 여백. */
const SIDE_MIN = 52;
/** 이웃 정점 사이에 남겨 둘 최소 변 길이 — 칠감 방울이 지나갈 길. */
const EDGE_MIN_GAP = 56;
/** 고리를 닫는 활이 내려가는 깊이 (제어점 기준). */
const ARC_DROP = 128;
/** 활이 양 끝에서 바깥으로 부푸는 폭. */
const ARC_BULGE = 86;
const CAPTION_Y = 214;

const EDGE_W_IDLE = 2.5;
const EDGE_W_SETTLED = 3;
const EDGE_W_CONFLICT = 4.5;

/** 커서 링이 정점 밖으로 벌어지는 여유. */
const CURSOR_GAP = 7;
/** 부딪힌 두 끝을 두르는 덧링의 여유. */
const DANGER_GAP = 6;

const TRAVEL_MS = 430;
const ABSORB_MS = 190;
const APPROACH_MS = 520;
const RECOIL_MS = 460;
const PULSE_MS = 420;

/** 부딪힌 자국이 뻗는 방향의 수. 맞부딪힌 두 알을 비껴 나가도록 대각선 넷이다. */
const RAY_COUNT = 4;
/** 덧링이 한 번 부푸는 폭. */
const PULSE_SWELL = 7;

/**
 * 색판의 크기. **두 색 칠하기라는 조각의 바탕**이 정하는 수이지 "지금까지 드러난
 * 색 수" 가 아니다 — 걸음마다 자라는 셈을 씨앗으로 쓰면 hue 간격이 통째로 갈린다.
 *
 * 시드의 0 번과 1 번은 "첫 색 / 다음 색" 이라는 뜻 외에 다른 의미가 없다. 같은
 * 뜻을 재현할 다른 view 가 없으므로 view-local 상수로 둔다 (S-view Exception).
 */
const PAINT_COUNT = 2;
/** 색이 아직 없을 때 기대는 자리. 온전한 장면이면 닿지 않는다. */
const PAINT_FIRST = 0;

type Pt = { x: number; y: number };

/** 변 하나의 기하. 활이냐 곧은 선이냐는 두 정점의 **차례 차이**가 정한다. */
type EdgeGeo = {
  a: string;
  b: string;
  d: string;
  /** 변 위 한 점. `a` 쪽에서 `b` 쪽으로 t 만큼 간 자리. */
  at(t: number): Pt;
};

/** 장면이 말하는 구조에서 역산한 자리. 그리기 전에 한 번에 셈한다. */
type Geo = {
  nodeR: number;
  pos: Map<string, Pt>;
  edges: EdgeGeo[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y,
  };
}

/**
 * 정점의 자리와 변의 모양을 한 번에 셈한다.
 *
 * 그리면서 재면 순회 순서가 곧 숨은 상태가 되므로, 자리를 먼저 다 정하고 그
 * 다음에 그린다. 폭은 캔버스에서 역산하고 상수는 상한으로만 쓴다 (S-piece).
 */
function geometryOf(ring: TwoColorRing): Geo {
  const W = PIECE_CANVAS_W;
  const count = ring.nodes.length;
  const pos = new Map<string, Pt>();
  if (count === 0) return { nodeR: NODE_R_MAX, pos, edges: [] };

  const pitch = count > 1 ? Math.floor((W - SIDE_MIN * 2) / (count - 1)) : 0;
  const nodeR = Math.max(
    12,
    Math.min(NODE_R_MAX, count > 1 ? Math.floor((pitch - EDGE_MIN_GAP) / 2) : NODE_R_MAX),
  );
  const originX = Math.round((W - pitch * (count - 1)) / 2);

  const index = new Map<string, number>();
  ring.nodes.forEach((id, i) => {
    index.set(id, i);
    pos.set(id, { x: originX + pitch * i, y: ROW_Y });
  });

  const edges: EdgeGeo[] = [];
  for (const e of ring.edges) {
    const ia = index.get(e.a);
    const ib = index.get(e.b);
    const p0 = pos.get(e.a);
    const p3 = pos.get(e.b);
    if (ia === undefined || ib === undefined || p0 === undefined || p3 === undefined) continue;
    if (Math.abs(ia - ib) === 1) {
      // 줄에서 이웃한 두 정점 — 곧은 변.
      edges.push({
        a: e.a,
        b: e.b,
        d: `M ${p0.x} ${p0.y} L ${p3.x} ${p3.y}`,
        at: (u: number): Pt => ({ x: lerp(p0.x, p3.x, u), y: lerp(p0.y, p3.y, u) }),
      });
      continue;
    }
    // 줄의 끝과 끝을 잇는 변 — 고리를 닫는 활. 아래로 크게 휘어 건다.
    const dir = p0.x > p3.x ? 1 : -1;
    const c1: Pt = { x: p0.x + ARC_BULGE * dir, y: ROW_Y + ARC_DROP };
    const c2: Pt = { x: p3.x - ARC_BULGE * dir, y: ROW_Y + ARC_DROP };
    edges.push({
      a: e.a,
      b: e.b,
      d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`,
      at: (u: number): Pt => cubicAt(p0, c1, c2, p3, u),
    });
  }
  return { nodeR, pos, edges };
}

function findEdge(geo: Geo, a: string, b: string): EdgeGeo | undefined {
  return geo.edges.find((e) => sameEdge(e, { a, b }));
}

/** 닫는 활 위에서 두 알이 어디서 출발해 어디서 멈추나. 활 모양이 달라져도 통한다. */
type CloseGeo = {
  edge: EdgeGeo;
  tokenR: number;
  startA: number;
  startB: number;
  stopA: number;
  stopB: number;
  mid: Pt;
  /** 반동으로 물러나는 폭 (t 자리로 환산). */
  recoilT: number;
  /** A 쪽 알이 물러나는 방향. B 는 반대다. */
  dirA: number;
};

function closeGeoOf(geo: Geo, closing: TwoColorSceneEdge): CloseGeo | null {
  const edge = findEdge(geo, closing.a, closing.b);
  if (edge === undefined) return null;
  const tokenR = Math.max(10, Math.round(geo.nodeR * 0.54));
  const startA = edge.a === closing.a ? 0 : 1;
  const startB = 1 - startA;
  // 한가운데에서 서로 맞닿아 멈추도록, 그 지점의 진행 속도로 반지름을 t 로 환산한다.
  const mid = edge.at(0.5);
  const probe = edge.at(0.51);
  const speed = Math.max(1, Math.hypot(probe.x - mid.x, probe.y - mid.y) / 0.01);
  const gapT = tokenR / speed;
  return {
    edge,
    tokenR,
    startA,
    startB,
    stopA: startA < 0.5 ? 0.5 - gapT : 0.5 + gapT,
    stopB: startB < 0.5 ? 0.5 - gapT : 0.5 + gapT,
    mid,
    recoilT: (tokenR * 0.9) / speed,
    dirA: startA < 0.5 ? -1 : 1,
  };
}

/**
 * 한 번 그릴 때의 화면 형편. 장면이 말하지 않는 **지나가는 것**만 담는다.
 *
 * 멎어 있을 때는 `restBoard` 가 장면에서 곧바로 만들고, 운동 중에는 프레임마다
 * 새로 만들어진다. 어느 쪽이든 그리는 길은 `paint` 하나다.
 */
type Board = {
  /** 아직 칠하지 않은 것으로 그릴 정점. 방울이 닿아야 칠해진다. */
  pending: string | null;
  /** 변을 타고 오는 칠감 방울. */
  drop: { at: Pt; r: number; color: string } | null;
  /** 방울을 삼키며 부푸는 정점. */
  swell: { id: string; scale: number } | null;
  /** 닫는 활 위 두 알의 자리. 닫는 변이 아직 없으면 null. */
  tokens: { ta: number; tb: number } | null;
  /** 충돌 판정이 화면에 섰나 — 부러진 변 · 덧링 · 튄 자국. */
  verdictShown: boolean;
  /** 튄 자국이 뻗은 정도 0~1. 0 이면 짓지 않는다 (길이 0 짜리 선은 점이 된다). */
  burst: number;
  /** 덧링이 부푼 덧폭. */
  ringGrow: number;
};

export const twoColorConflictStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<TwoColorConflictScene> {
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const paints = categorical(PAINT_COUNT, 'vivid');
    const paintOf = (color: number): string =>
      paints[((color % PAINT_COUNT) + PAINT_COUNT) % PAINT_COUNT] ?? palette.accent;

    const W = PIECE_CANVAS_W;

    const gEdges = el('g');
    const gNodes = el('g');
    const gRings = el('g');
    const gTokens = el('g');
    const gMarks = el('g');
    svg.append(gEdges, gNodes, gRings, gTokens, gMarks);

    /** 고정 자리의 캡션. 재건 밖에 있으므로 정적 경로가 글자와 칠을 매번 명시로 쓴다. */
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장. `render` 가 불릴 때마다 오르고, 깨어난 걸음 함수는 자기 세대를
     * 확인한 뒤에만 그린다.
     *
     * 되짚기는 `opts.animate` 가 거짓으로 오므로 프레임을 아예 안 거는 것이 첫
     * 빗장이고, 이것이 두 번째다. 이 조각의 걸음은 `await` 를 둘 지나므로
     * (건너오기 뒤에 삼킴이, 다가가기 뒤에 튕김이 따라온다) 그 사이에 새 `render`
     * 가 오면 살아남은 뒷마디가 이미 새로 선 화면을 덮는다.
     *
     * `isInstant` · `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => fn())
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };
    const nowMs = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(duration: number, mine: number, apply: (t: number) => void): Promise<void> {
      const draw = (t: number): void => {
        if (alive(mine)) apply(t);
      };
      draw(0);
      if (destroyed || duration <= 0) {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const startedAt = nowMs();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const t = Math.min(1, (nowMs() - startedAt) / duration);
          draw(t);
          if (t >= 1) {
            finish();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });
    }

    // ── 문안. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10).
    //    수와 이름은 전부 그 장면에서 셈한다 — 장면이 실어 온 것을 쓰지 않는다.
    function captionOf(kind: TwoColorConflictCaption['kind'], scene: TwoColorConflictScene): {
      text: string;
      alert: boolean;
    } {
      const painted = scene.painted;
      const closing = scene.closing;
      const a = closing?.a ?? '';
      const b = closing?.b ?? '';
      switch (kind) {
        case 'start':
          return {
            text: tr('caption.start', 'A ring of vertices, none of them painted yet.'),
            alert: false,
          };
        case 'first':
          return {
            text: tr('caption.first', 'Start at {node} with the first color.', {
              node: painted[0]?.id ?? '',
            }),
            alert: false,
          };
        case 'alternate':
          return {
            text: tr('caption.alternate', '{prev} to {node} — neighbors differ, so the color flips.', {
              prev: painted[painted.length - 2]?.id ?? '',
              node: painted[painted.length - 1]?.id ?? '',
            }),
            alert: false,
          };
        case 'lastEdge':
          return { text: tr('caption.lastEdge', 'One edge is left: {a}-{b}.', { a, b }), alert: false };
        case 'collide':
          return {
            text: tr('caption.collide', '{a} and {b} meet in the same color. This edge cannot hold.', {
              a,
              b,
            }),
            alert: true,
          };
        case 'verdict': {
          // 고리의 길이도 홀짝도 그림과 같은 자료에서 나온다 — 칠해진 정점의 수다.
          const n = painted.length;
          if (n % 2 === 1) {
            return {
              text: tr('caption.odd', 'A ring of {n} is odd, so the alternation never closes.', { n }),
              alert: true,
            };
          }
          return {
            text: tr('caption.even', 'A ring of {n} is even, so the two colors close the ring.', { n }),
            alert: false,
          };
        }
      }
    }

    // ── 그리기 -------------------------------------------------------------

    /** 멎어 있을 때의 형편. 그 장면이 말하는 것을 그대로 옮긴다. */
    function restBoard(scene: TwoColorConflictScene, geo: Geo): Board {
      const close = scene.closing === null ? null : closeGeoOf(geo, scene.closing);
      return {
        pending: null,
        drop: null,
        swell: null,
        tokens: close === null ? null : { ta: close.stopA, tb: close.stopB },
        verdictShown: true,
        burst: 1,
        ringGrow: 0,
      };
    }

    /**
     * 그 장면의 화면을 통째로 세운다. 되돌릴 명령이 없으므로 늘 비우고 시작한다.
     *
     * 고정 자리의 캡션만 재건 밖에 있고, 그것도 글자와 칠을 매번 명시로 쓴다.
     * 나머지는 이 함수가 매번 새로 짓는다.
     */
    function paint(scene: TwoColorConflictScene, geo: Geo, board: Board): void {
      gEdges.textContent = '';
      gNodes.textContent = '';
      gRings.textContent = '';
      gTokens.textContent = '';
      gMarks.textContent = '';

      // 방울이 아직 닿지 않은 정점은 칠해지지 않은 것으로 친다. 그 정점은 늘
      // 맨 나중에 칠해진 것이므로, 화면이 보는 장면은 끝 하나를 뺀 것이다.
      const shown: TwoColorConflictScene =
        board.pending === null
          ? scene
          : { ...scene, painted: scene.painted.filter((n) => n.id !== board.pending) };
      const color = colorOf(shown.painted);
      const conflict = conflictOf(shown);

      // ── 변. 밟은 변은 또렷해지고, 부러진 변은 굵은 danger 다.
      for (const e of geo.edges) {
        const isClosing = shown.closing !== null && sameEdge(shown.closing, e);
        // 판정이 아직 안 섰으면 닫는 변은 아무 일도 없는 변으로 그린다.
        const state = isClosing && !board.verdictShown ? 'idle' : edgeStateOf(shown, e);
        const stroke =
          state === 'conflict' ? palette.danger : state === 'settled' ? palette.text : palette.border;
        const width =
          state === 'conflict' ? EDGE_W_CONFLICT : state === 'settled' ? EDGE_W_SETTLED : EDGE_W_IDLE;
        gEdges.append(
          el('path', {
            d: e.d,
            fill: 'none',
            stroke,
            'stroke-width': width,
            'stroke-linecap': 'round',
          }),
        );
      }

      // ── 정점. 채움이 값이다 — 무슨 색으로 칠했나, 아직 안 칠했나.
      for (const id of shown.ring.nodes) {
        const at = geo.pos.get(id);
        if (at === undefined) continue;
        const c = color.get(id);
        const scale = board.swell !== null && board.swell.id === id ? board.swell.scale : 1;
        const disc = el('circle', { cx: at.x, cy: at.y, r: geo.nodeR * scale, 'stroke-width': 2 });
        if (c === undefined) {
          // 아직 값이 없다는 뜻이지 상태색이 아니다.
          disc.setAttribute('fill', palette.bg);
          disc.setAttribute('stroke', palette.ghostOutline);
          disc.setAttribute('stroke-dasharray', '5 4');
        } else {
          // 칠한 타일은 테마를 따라 뒤집히지 않는 고정색이므로 잉크도 고정한다 (S-view).
          disc.setAttribute('fill', paintOf(c));
          disc.setAttribute('stroke', 'none');
        }
        const label = el('text', {
          x: at.x,
          y: at.y + 6,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: c === undefined ? palette.textMuted : palette.stateInk,
        });
        label.textContent = id;
        gNodes.append(disc, label);
      }

      // ── 짚음의 표식. 지금 보는 자리 = 맨 나중에 칠한 정점. 답사가 끝나면 걷는다.
      const last = shown.painted[shown.painted.length - 1];
      const cursorAt = shown.closing === null && last !== undefined ? geo.pos.get(last.id) : undefined;
      if (cursorAt !== undefined) {
        gRings.append(
          el('circle', {
            cx: cursorAt.x,
            cy: cursorAt.y,
            r: geo.nodeR + CURSOR_GAP,
            fill: 'none',
            // 칠감과 헷갈리지 않게 중성 회색을 쓴다.
            stroke: palette.auxCursor,
            'stroke-width': 3,
          }),
        );
      }

      // ── 부딪힘의 표식. 같은 색으로 맞선 두 끝을 두른다.
      if (conflict && board.verdictShown && shown.closing !== null) {
        for (const id of [shown.closing.a, shown.closing.b]) {
          const at = geo.pos.get(id);
          if (at === undefined) continue;
          gRings.append(
            el('circle', {
              cx: at.x,
              cy: at.y,
              r: geo.nodeR + DANGER_GAP + board.ringGrow,
              fill: 'none',
              stroke: palette.danger,
              'stroke-width': 3,
            }),
          );
        }
      }

      // ── 닫는 활 위의 두 알. 맞선 채로 **남는다** — 그것이 이 조각의 결론이다.
      if (board.tokens !== null && shown.closing !== null) {
        const close = closeGeoOf(geo, shown.closing);
        if (close !== null) {
          const pairs: [number, string][] = [
            [board.tokens.ta, shown.closing.a],
            [board.tokens.tb, shown.closing.b],
          ];
          for (const [t, id] of pairs) {
            const at = close.edge.at(Math.max(0, Math.min(1, t)));
            gTokens.append(
              el('circle', {
                cx: at.x,
                cy: at.y,
                r: close.tokenR,
                fill: paintOf(color.get(id) ?? PAINT_FIRST),
                stroke: palette.stateInk,
                'stroke-width': 1,
              }),
            );
          }
          // 부딪힌 자국 — 맞닿은 자리에서 대각선 넷으로 튄다.
          if (conflict && board.verdictShown && board.burst > 0) {
            const e = board.burst;
            for (let i = 0; i < RAY_COUNT; i += 1) {
              const angle = (Math.PI * 2 * i) / RAY_COUNT + Math.PI / RAY_COUNT;
              const inner = lerp(geo.nodeR * 0.9, geo.nodeR * 0.98, e);
              const outer = lerp(geo.nodeR * 0.9, geo.nodeR * 1.5, e);
              gMarks.append(
                el('line', {
                  x1: close.mid.x + Math.cos(angle) * inner,
                  y1: close.mid.y + Math.sin(angle) * inner,
                  x2: close.mid.x + Math.cos(angle) * outer,
                  y2: close.mid.y + Math.sin(angle) * outer,
                  stroke: palette.danger,
                  'stroke-width': 3,
                  'stroke-linecap': 'round',
                }),
              );
            }
          }
        }
      }

      // ── 지나가는 칠감 방울.
      if (board.drop !== null) {
        gTokens.append(
          el('circle', {
            cx: board.drop.at.x,
            cy: board.drop.at.y,
            r: board.drop.r,
            fill: board.drop.color,
          }),
        );
      }

      const said = scene.caption === null ? null : captionOf(scene.caption.kind, scene);
      caption.textContent = said === null ? '' : said.text;
      caption.setAttribute('fill', said !== null && said.alert ? palette.danger : palette.text);
    }

    // ── 운동 ---------------------------------------------------------------

    /** 칠감 방울이 앞 정점에서 변을 타고 건너와 이 정점을 물들인다. */
    async function flowPaint(
      scene: TwoColorConflictScene,
      geo: Geo,
      rest: Board,
      node: string,
      mine: number,
    ): Promise<void> {
      const index = scene.painted.findIndex((n) => n.id === node);
      const me = scene.painted[index];
      const target = geo.pos.get(node);
      if (me === undefined || target === undefined) return;
      const prev = index > 0 ? (scene.painted[index - 1] ?? null) : null;
      const edge = prev === null ? undefined : findEdge(geo, prev.id, node);
      const color = paintOf(me.color);
      const dropR = Math.max(8, Math.round(geo.nodeR * 0.44));
      // 출발점에는 건너올 변이 없다 — 칠감이 위에서 떨어진다.
      const from: Pt =
        prev === null
          ? { x: target.x, y: target.y - (geo.nodeR + 24) }
          : (geo.pos.get(prev.id) ?? target);
      const forward = prev !== null && edge?.a === prev.id;

      await animate(TRAVEL_MS, mine, (t) => {
        const e = easeOut(t);
        const at: Pt =
          edge === undefined
            ? { x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e) }
            : edge.at(forward ? e : 1 - e);
        paint(scene, geo, { ...rest, pending: node, drop: { at, r: dropR, color } });
      });
      if (!alive(mine)) return;
      // 방울이 스며들고 정점이 한 번 부푼다. 이 정점이 값을 얻는 순간이다.
      await animate(ABSORB_MS, mine, (t) => {
        paint(scene, geo, {
          ...rest,
          drop: { at: target, r: dropR * (1 - t), color },
          swell: { id: node, scale: 1 + 0.14 * Math.sin(t * Math.PI) },
        });
      });
    }

    /** 마지막 변. 양 끝의 색이 각자 활을 타고 와 한가운데서 만난다. */
    async function flowClose(
      scene: TwoColorConflictScene,
      geo: Geo,
      rest: Board,
      mine: number,
    ): Promise<void> {
      if (scene.closing === null) return;
      const close = closeGeoOf(geo, scene.closing);
      if (close === null) return;

      // 부딪히러 가는 길이므로 가속해서 들어간다. 두 알은 **한 시계**로 흐른다 —
      // 나눠 돌리면 맞닿는 순간이 우연히 맞는 꼴이 되고, 하나를 던질 여지가 생긴다.
      await animate(APPROACH_MS, mine, (t) => {
        const e = easeIn(t);
        paint(scene, geo, {
          ...rest,
          verdictShown: false,
          burst: 0,
          tokens: { ta: lerp(close.startA, close.stopA, e), tb: lerp(close.startB, close.stopB, e) },
        });
      });
      if (!alive(mine) || !conflictOf(scene)) return;

      // 튕겨 나갔다가 잦아든다. 같은 색끼리는 서로를 통과하지 못한다.
      // 튄 자국도 같은 시계에서 뻗는다 — 따로 띄워 보내면 걸음이 끝난 뒤에도 자란다.
      await animate(RECOIL_MS, mine, (t) => {
        const damp = Math.exp(-4.5 * t) * Math.cos(9 * t);
        paint(scene, geo, {
          ...rest,
          burst: easeOut(t),
          tokens: {
            ta: close.stopA - close.dirA * close.recoilT * damp,
            tb: close.stopB + close.dirA * close.recoilT * damp,
          },
        });
      });
    }

    /** 결론. 같은 색으로 맞선 두 끝을 한 번 더 두드려 준다. */
    async function flowVerdict(
      scene: TwoColorConflictScene,
      geo: Geo,
      rest: Board,
      mine: number,
    ): Promise<void> {
      if (!conflictOf(scene)) return;
      await animate(PULSE_MS, mine, (t) => {
        paint(scene, geo, { ...rest, ringGrow: PULSE_SWELL * Math.sin(t * Math.PI) });
      });
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: TwoColorConflictScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: TwoColorConflictScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const geo = geometryOf(next.ring);
      const rest = restBoard(next, geo);
      paint(next, geo, rest);

      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step === null) return;

      if (step.kind === 'paint') await flowPaint(next, geo, rest, step.node, mine);
      else if (step.kind === 'close') await flowClose(next, geo, rest, mine);
      else await flowVerdict(next, geo, rest, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리를 거두고 그 장면을 통째로 다시 세운다. 속성을
      // 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도 프레임도 없어
      // 페인트가 끼지 않는다.
      paint(next, geo, rest);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 약속은 여기서 전부 푼다 — 남기면 알고리즘이 깨어나지 못한
        // 채로 멈추고 SVG 까지 통째로 붙들린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
