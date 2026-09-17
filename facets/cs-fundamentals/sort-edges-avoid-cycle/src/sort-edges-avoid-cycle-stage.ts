/**
 * sort-edges-avoid-cycle-stage — 무게 순 줄에서 집은 간선이 그래프에 놓이거나,
 * 놓이지 못하고 떨어져 나가는 화면.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `setLayout()` · `setQueue()` · `pickEdge()` · `keepEdge()` ·
 * `discardEdge()` · `setCaption()` · `rewind()` 일곱이 통째로 사라졌고, 그와 함께
 * `dropOccupied` 를 제자리에서 밀어 넣던 셈도 없어졌다 — 바닥의 자리는 이제 버린
 * 차례에서 **한 번에** 셈해진다.
 *
 * ── CSS transition 을 쓰지 않는다 (S-scene MUST NOT)
 *
 * 옮기기 전에는 움직이는 값이 전부 `style.transition` 이었다. 되짚기는
 * `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 해
 * 흔들림의 직접 원인이 된다. 전부 rAF 보간으로 옮겼고, `FRAME_MS` 로 브라우저에게
 * 전이의 시작점을 잡게 하던 틈도 함께 없어졌다.
 *
 * ── 버린 간선은 자취를 남기되 어휘를 가른다
 *
 * 이 조각의 주장은 **"고리가 되면 버린다"** 다. 옮기기 전에는 버린 간선이
 * 그래프에서 통째로 사라지고 카드만 바닥에 누웠다 — 어디에 놓으려다 버렸는지가
 * 완주 화면에 없었다. 이제 그 자리에 자취가 남는다. 다만 살아 있는 나무 간선과
 * 같은 모양으로 그리면 "나무에 고리가 있다" 로 읽혀 정반대가 되므로 **어휘를
 * 먼저 가른다.**
 *
 *   회색 점선          아직 보지 않은 간선
 *   강조색 굵은 점선   지금 집어 든 간선
 *   실선 + 무게 배지   놓인 간선 (나무)
 *   붉은 점선 + 가위표 버린 간선 (고리를 닫았다)
 *
 * 채움과 테두리도 갈라 둔다 — **정점의 채움은 무리 소속**, **정점의 테두리 링은
 * 지금 견주는 중이거나 고리 위에 있다는 표식**이다. 한 통로에 몰면 합쳐지는
 * 순간에 뜻이 부딪힌다.
 *
 * ── 배치
 * 왼쪽은 무게 순 대기줄, 오른쪽은 그래프, 아래는 떨어진 것이 쌓이는 바닥.
 * 정점은 nodes[0] 을 갓돌로 위에 두고 나머지를 좌상에서 시계 방향으로 타원에
 * 균등 배치한다. 자리는 장면에 담지 않고 여기서 캔버스에서 역산한다 (S-piece).
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 자료에서 온 정점 이름과 무게뿐이다.
 * 문장인 캡션과 두 머리글은 `facet.ts` 의 `messages` 에 있고 여기서는 키와 en
 * 원본으로 `params.t` 를 부른다 (C10). 그 문안이 말하는 수는 `scene.ts` 의
 * `totalWeightOf` 와 `kept`·`discarded` 에서 온다 — 그려진 선과 같은 출처다.
 *
 * View 는 algorithm 의 타입을 참조하지 않는다 (원칙 1) — 장면 타입만 본다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  cyclePathOf,
  edgeById,
  pathEdgesOf,
  queueOrder,
  slotOf,
  statusOf,
  toneIndexOf,
  totalWeightOf,
  type SortEdgesAvoidCycleScene,
  type SortEdgesCaption,
  type SortEdgesEdge,
  type SortEdgesStep,
} from './scene.js';

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

/** 카드가 기울어 떨어지는 각도. 앞뒤로 번갈아 눕힌다. */
const DROP_TILT_DEG = 7;
/** 도형에 새겨진 표식 — 번역 대상이 아니다 (C10). */
const CROSS_HALF = 6;
/** 그래프에 남는 버림 자취의 가위표. 카드의 것보다 작다. */
const MARK_HALF = 5;
/** 간선 이름은 데이터 조립이고 사이의 가로줄은 표식이다. */
const EDGE_NAME_JOINER = '–';

/** 선 굵기 — 아직 안 봄 / 집은 것 / 놓인 것 / 고리를 이루는 중. */
const LINE_WAITING = 1.5;
const LINE_PICKED = 2.5;
const LINE_KEPT = 3;
const LINE_CYCLE = 4.5;

/** 무리를 물들이는 링이 부풀어 오르는 끝 배율. */
const PULSE_TO = 1.9;
const PULSE_FROM_OPACITY = 0.95;

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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

function parseHex(v: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return [
    parseInt(v.slice(1, 3), 16),
    parseInt(v.slice(3, 5), 16),
    parseInt(v.slice(5, 7), 16),
  ];
}

/**
 * 두 색 사이. **끝에서는 보간값이 아니라 목표 문자열을 그대로** 돌려준다 —
 * 보간이 남긴 끝자리가 화면을 가르는 자리다 (S-scene).
 */
function mixHex(a: string, b: string, e: number): string {
  if (e >= 1) return b;
  if (e <= 0) return a;
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (pa === null || pb === null) return e < 0.5 ? a : b;
  const to = (i: number): string =>
    Math.round(lerp(pa[i], pb[i], e))
      .toString(16)
      .padStart(2, '0');
  return `#${to(0)}${to(1)}${to(2)}`;
}

type Point = { x: number; y: number };
type Pose = { left: number; top: number; rotate: number; scale: number };

/**
 * 장면 하나가 정하는 자리들. **그리기 전에 한 번에 셈한다.**
 *
 * 그리면서 이웃의 지금 좌표를 되읽으면 순회 순서가 곧 숨은 상태가 된다. 바닥에
 * 떨어진 카드의 가로 자리가 특히 그 자리였다 — 옮기기 전에는 떨어질 때마다
 * `dropOccupied` 를 밀어 넣어 쌓았다.
 */
type Layout = {
  /** 정점 이름 → 그 정점이 설 자리. */
  at: Map<string, Point>;
  /** 버린 간선 id → 바닥에서 카드가 누울 중심. */
  drops: Map<string, Point>;
};

export const sortEdgesAvoidCycleStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SortEdgesAvoidCycleScene> {
    const svg = params.canvas;
    const palette = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback. 직접 만든 조회기를 쓰면 registerMessages 로
    // 주입된 번들을 못 읽는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    /**
     * 재건의 뿌리. 걸음마다 이 안을 통째로 비우고 다시 세운다.
     *
     * 재건 밖에 남는 요소를 두지 않는다 — 캡션도 머리글도 바닥 선도 전부 여기
     * 안이다. 밖에 두면 마지막 `drawStatic` 이 그 속성을 안 건드려 앞 걸음의 값이
     * 남고 되짚기 판정이 어긋난다 (S-scene 의 "재건 밖 요소").
     */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 버리는 걸음은 마디 셋을 이어 달리므로, 가운데서 끊기면 남은 마디가 깨어나
     * 이미 새로 선 화면을 덮는다.
     */
    let gen = 0;

    /**
     * rAF 보간 한 자락.
     *
     * `finish` 를 `waiters` 에 담아 둔다 — `destroy` 가 프레임을 취소하면 그
     * 콜백이 아예 안 불려 약속이 영영 안 풀리기 때문이다 (S-piece MUST).
     */
    function animate(
      ms: number,
      draw: (e: number) => void,
      live: () => boolean,
    ): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(raw);
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let pendingAt = new Map<string, SVGLineElement>();
    let solidAt = new Map<string, SVGLineElement>();
    let badgeAt = new Map<string, SVGGElement>();
    let markAt = new Map<string, SVGGElement>();
    let cardAt = new Map<string, { g: SVGGElement; rect: SVGRectElement; cross: SVGGElement }>();
    let bodyAt = new Map<string, SVGCircleElement>();
    let ringAt = new Map<string, SVGCircleElement>();
    let overlay: SVGGElement = el('g');

    function rewind(): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      pendingAt = new Map();
      solidAt = new Map();
      badgeAt = new Map();
      markAt = new Map();
      cardAt = new Map();
      bodyAt = new Map();
      ringAt = new Map();
    }

    // ── 자리 셈 (전부 순수, 장면과 캔버스만 본다)

    const cardW = Math.min(CARD_MAX_W, Math.round((W - PAD * 2 - COLUMN_GAP) * 0.3));
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

    function clampX(x: number): number {
      return Math.max(PAD + pickedW / 2, Math.min(W - PAD - pickedW / 2, x));
    }

    function layoutOf(scene: SortEdgesAvoidCycleScene): Layout {
      const nodes = scene.graph.nodes;
      const at = new Map<string, Point>();
      // nodes[0] 은 갓돌, 나머지는 좌상에서 시계 방향으로 타원에 균등 배치.
      const crown = nodes[0];
      if (crown !== undefined) at.set(crown, { x: cx, y: crownY });
      const rest = nodes.slice(1);
      rest.forEach((node, i) => {
        const angle = -0.75 * Math.PI + (i * 2 * Math.PI) / rest.length;
        at.set(node, {
          x: cx + rx * Math.cos(angle),
          y: ringCy + ry * Math.sin(angle),
        });
      });

      // 바닥 자리는 버린 차례대로 한 번에 셈한다. 그려 가며 재면 순회 순서가
      // 곧 자리가 된다.
      const drops = new Map<string, Point>();
      const taken: number[] = [];
      for (const id of scene.discarded) {
        const edge = edgeById(scene, id);
        const a = edge === null ? undefined : at.get(edge.u);
        const b = edge === null ? undefined : at.get(edge.v);
        let x = clampX(a && b ? (a.x + b.x) / 2 : cx);
        while (taken.some((t) => Math.abs(t - x) < pickedW + 8)) x += pickedW + 8;
        x = Math.min(W - PAD - pickedW / 2, x);
        taken.push(x);
        drops.set(id, { x, y: DROP_CENTER_Y });
      }

      return { at, drops };
    }

    function midOf(geo: Layout, edge: SortEdgesEdge): Point {
      const a = geo.at.get(edge.u);
      const b = geo.at.get(edge.v);
      if (!a || !b) return { x: cx, y: ringCy };
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    /** 집어 든 카드가 얹히는 자리 — 간선의 한가운데, 캔버스 안으로 당겨서. */
    function pickCenter(geo: Layout, edge: SortEdgesEdge): Point {
      const mid = midOf(geo, edge);
      return { x: clampX(mid.x), y: mid.y };
    }

    function poseInQueue(index: number): Pose {
      return {
        left: PAD,
        top: BODY_TOP + index * (CARD_H + CARD_GAP),
        rotate: 0,
        scale: 1,
      };
    }

    /** 축소는 중심 기준이라 좌상단을 스케일 1 기준 좌표로 되돌려 둔다. */
    function poseAtCenter(center: Point, scale: number, rotate: number): Pose {
      return {
        left: center.x - (cardW * scale) / 2 - (cardW - cardW * scale) / 2,
        top: center.y - (CARD_H * scale) / 2 - (CARD_H - CARD_H * scale) / 2,
        rotate,
        scale,
      };
    }

    function lerpPose(a: Pose, b: Pose, e: number): Pose {
      if (e >= 1) return b;
      return {
        left: lerp(a.left, b.left, e),
        top: lerp(a.top, b.top, e),
        rotate: lerp(a.rotate, b.rotate, e),
        scale: lerp(a.scale, b.scale, e),
      };
    }

    function applyPose(node: SVGGElement, pose: Pose): void {
      node.style.transform = `translate(${pose.left}px, ${pose.top}px) rotate(${pose.rotate}deg) scale(${pose.scale})`;
    }

    /** 그 간선이 그 장면에서 서야 할 카드 자리. `null` 이면 카드가 없다. */
    function cardPoseOf(
      scene: SortEdgesAvoidCycleScene,
      geo: Layout,
      id: string,
    ): Pose | null {
      const edge = edgeById(scene, id);
      if (edge === null) return null;
      switch (statusOf(scene, id)) {
        case 'waiting':
          return poseInQueue(Math.max(0, slotOf(scene, id)));
        case 'picked':
          return poseAtCenter(pickCenter(geo, edge), PICKED_SCALE, 0);
        // 놓인 간선의 카드는 선 속으로 빨려 들어가 사라졌다. 아직 없는 것은
        // 숨기지 말고 짓지 않는다.
        case 'kept':
          return null;
        case 'discarded': {
          const i = scene.discarded.indexOf(id);
          const tilt = i % 2 === 0 ? -DROP_TILT_DEG : DROP_TILT_DEG;
          const drop = geo.drops.get(id) ?? { x: cx, y: DROP_CENTER_Y };
          return poseAtCenter(drop, PICKED_SCALE, tilt);
        }
      }
    }

    /** 정점의 무리 색. 색판은 **바탕 명부**에서 한 번에 센다. */
    function toneOf(scene: SortEdgesAvoidCycleScene, node: string): string {
      const tones = categorical(Math.max(1, scene.graph.nodes.length), 'pastel');
      return tones[toneIndexOf(scene, node) % tones.length] ?? palette.itemDefault;
    }

    // ── 정적 그리기. 그 장면이 말하는 것을 전부 세운다.

    function buildEdgeLine(geo: Layout, edge: SortEdgesEdge): SVGLineElement | null {
      const a = geo.at.get(edge.u);
      const b = geo.at.get(edge.v);
      if (!a || !b) return null;
      return el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }

    function drawStatic(scene: SortEdgesAvoidCycleScene, geo: Layout): void {
      const pendingLayer = el('g');
      const solidLayer = el('g');
      const badgeLayer = el('g');
      const markLayer = el('g');
      const nodeLayer = el('g');
      const cardLayer = el('g');
      overlay = el('g');

      // ── 간선. 어휘를 넷으로 가른다.
      for (const edge of scene.graph.edges) {
        const status = statusOf(scene, edge.id);
        const line = buildEdgeLine(geo, edge);
        if (line === null) continue;
        const mid = midOf(geo, edge);

        if (status === 'kept') {
          line.setAttribute('stroke', palette.itemSorted);
          line.setAttribute('stroke-width', String(LINE_KEPT));
          line.setAttribute('stroke-linecap', 'round');
          solidLayer.appendChild(line);
          solidAt.set(edge.id, line);

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
          badgeLayer.appendChild(badge);
          badgeAt.set(edge.id, badge);
          continue;
        }

        line.setAttribute('stroke-dasharray', '4 5');
        if (status === 'picked') {
          line.setAttribute('stroke', palette.itemComparing);
          line.setAttribute('stroke-width', String(LINE_PICKED));
        } else if (status === 'discarded') {
          line.setAttribute('stroke', palette.danger);
          line.setAttribute('stroke-width', String(LINE_WAITING));
        } else {
          line.setAttribute('stroke', palette.border);
          line.setAttribute('stroke-width', String(LINE_WAITING));
        }
        pendingLayer.appendChild(line);
        pendingAt.set(edge.id, line);

        // 버린 자취의 가위표. 나무 간선의 무게 배지와 모양이 겹치지 않는다.
        if (status === 'discarded') {
          const mark = el('g', {
            transform: `translate(${mid.x}, ${mid.y})`,
            stroke: palette.danger,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          });
          mark.appendChild(
            el('line', { x1: -MARK_HALF, y1: -MARK_HALF, x2: MARK_HALF, y2: MARK_HALF }),
          );
          mark.appendChild(
            el('line', { x1: MARK_HALF, y1: -MARK_HALF, x2: -MARK_HALF, y2: MARK_HALF }),
          );
          markLayer.appendChild(mark);
          markAt.set(edge.id, mark);
        }
      }

      // ── 정점. 채움은 무리 소속, 링은 지금 짚고 있다는 표식이다.
      const picked = scene.picked === null ? null : edgeById(scene, scene.picked);
      for (const node of scene.graph.nodes) {
        const at = geo.at.get(node);
        if (at === undefined) continue;
        const g = el('g', { transform: `translate(${at.x}, ${at.y})` });

        if (picked !== null && (picked.u === node || picked.v === node)) {
          const ring = el('circle', {
            r: RING_R,
            fill: 'none',
            stroke: palette.itemComparing,
            'stroke-width': 2.5,
          });
          g.appendChild(ring);
          ringAt.set(node, ring);
        }

        const body = el('circle', {
          r: NODE_R,
          fill: toneOf(scene, node),
          stroke: palette.border,
          'stroke-width': 1.5,
        });
        g.appendChild(body);
        bodyAt.set(node, body);

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
        g.appendChild(label);
        nodeLayer.appendChild(g);
      }

      // ── 카드. 줄에 선 것 · 바닥에 누운 것 · 집어 든 것 차례로 쌓는다.
      const order: string[] = [];
      for (const id of queueOrder(scene)) {
        if (statusOf(scene, id) === 'waiting') order.push(id);
      }
      for (const id of scene.discarded) order.push(id);
      if (scene.picked !== null) order.push(scene.picked);

      for (const id of order) {
        const edge = edgeById(scene, id);
        const pose = cardPoseOf(scene, geo, id);
        if (edge === null || pose === null) continue;
        const dropped = statusOf(scene, id) === 'discarded';

        const g = el('g');
        centerOrigin(g);

        const rect = el('rect', {
          x: 0,
          y: 0,
          width: cardW,
          height: CARD_H,
          rx: 6,
          fill: palette.itemDefault,
          stroke: dropped
            ? palette.danger
            : statusOf(scene, id) === 'picked'
              ? palette.itemComparing
              : palette.border,
          'stroke-width': statusOf(scene, id) === 'waiting' ? 1.5 : 2.5,
        });

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
        // 버린 카드에만 가위표가 선다. 없는 것은 숨기지 말고 짓지 않는다.
        if (!dropped) cross.setAttribute('opacity', '0');

        g.appendChild(rect);
        g.appendChild(name);
        g.appendChild(weight);
        g.appendChild(cross);
        applyPose(g, pose);
        cardLayer.appendChild(g);
        cardAt.set(id, { g, rect, cross });
      }

      // ── 바닥과 머리글, 캡션. 전부 재건 안에 있다.
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

      const queueLabel = el('text', {
        x: PAD,
        y: COLUMN_LABEL_BASELINE,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      queueLabel.textContent = tr('label.queue', 'by weight');

      const caption = el('text', {
        x: PAD,
        y: CAPTION_BASELINE,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.text,
      });
      caption.textContent = captionText(scene);

      for (const layer of [
        pendingLayer,
        solidLayer,
        badgeLayer,
        markLayer,
        nodeLayer,
        cardLayer,
        overlay,
        floorLine,
        floorLabel,
        queueLabel,
        caption,
      ]) {
        root.appendChild(layer);
      }
    }

    /**
     * 캡션의 문안. 장면은 무엇을 말할지와 그 인자만 담고 문자는 여기서 만든다 (C10).
     *
     * 완주 캡션의 세 수는 전부 그 장면의 자취에서 나온다 — 그려진 실선과 바닥에
     * 누운 카드가 곧 그 수다.
     */
    function captionText(scene: SortEdgesAvoidCycleScene): string {
      const c: SortEdgesCaption | null = scene.caption;
      if (c === null) return '';
      switch (c.kind) {
        case 'start':
          return tr('caption.start', 'The edges stand in line, lightest first.');
        case 'pick': {
          const e = edgeById(scene, c.id);
          if (e === null) return '';
          return tr('caption.pick', 'Pick up {u}–{v}, weight {weight}.', {
            u: e.u,
            v: e.v,
            weight: e.weight,
          });
        }
        case 'keep': {
          const e = edgeById(scene, c.id);
          if (e === null) return '';
          return tr(
            'caption.keep',
            '{u} and {v} are in different groups — lay the edge down, the two groups become one.',
            { u: e.u, v: e.v },
          );
        }
        case 'discard': {
          const e = edgeById(scene, c.id);
          if (e === null) return '';
          return tr(
            'caption.discard',
            '{u} and {v} are already in one group — this edge would close a loop, so it is dropped.',
            { u: e.u, v: e.v },
          );
        }
        case 'done':
          return tr('caption.done', 'Kept {kept}, dropped {discarded}. Total weight {total}.', {
            kept: scene.kept.length,
            discarded: scene.discarded.length,
            total: totalWeightOf(scene),
          });
      }
    }

    // ── 걸음 하나를 흐르게 한다. 정적 그리기가 정본이므로 요소는 이미 끝 자리에
    //    서 있고, 운동은 아직 못 온 만큼을 뒤로 물리는 꼴이다.

    /**
     * 줄이 무게 순으로 다시 선다.
     *
     * 여섯 장이 함께 자리를 옮기는 **한 뜻**이라 시계를 하나만 쓴다. 카드마다
     * `animate` 를 돌리면 시계가 여섯이 되고 하나를 `void` 로 흘릴 여지가 생긴다.
     */
    function flowOrder(
      scene: SortEdgesAvoidCycleScene,
      live: () => boolean,
    ): Promise<void> {
      const line = queueOrder(scene);
      // 출발 자리는 **선언된 차례**다. 바탕에서 나오므로 `prev` 를 볼 까닭이 없다.
      const declared = scene.graph.edges.map((e) => e.id);
      const moves: Array<{ g: SVGGElement; from: Pose; to: Pose; delay: number }> = [];
      line.forEach((id, index) => {
        const card = cardAt.get(id);
        if (card === undefined) return;
        const was = declared.indexOf(id);
        moves.push({
          g: card.g,
          from: poseInQueue(was < 0 ? index : was),
          to: poseInQueue(index),
          delay: index * SORT_STAGGER_MS,
        });
      });
      if (moves.length === 0) return Promise.resolve();

      const total = SORT_MS + SORT_STAGGER_MS * Math.max(0, moves.length - 1);
      return animate(
        total,
        (t) => {
          const elapsed = t * total;
          for (const m of moves) {
            const local = clamp01((elapsed - m.delay) / SORT_MS);
            applyPose(m.g, lerpPose(m.from, m.to, easeOutCubic(local)));
          }
        },
        live,
      );
    }

    /** 줄 맨 위 카드가 떠서 그래프의 제 자리로 간다. */
    function flowPick(
      scene: SortEdgesAvoidCycleScene,
      geo: Layout,
      id: string,
      live: () => boolean,
    ): Promise<void> {
      const card = cardAt.get(id);
      const edge = edgeById(scene, id);
      if (card === undefined || edge === null) return Promise.resolve();
      const from = poseInQueue(Math.max(0, slotOf(scene, id)));
      const to = poseAtCenter(pickCenter(geo, edge), PICKED_SCALE, 0);
      const line = pendingAt.get(id);
      const rings = [edge.u, edge.v]
        .map((n) => ringAt.get(n))
        .filter((r): r is SVGCircleElement => r !== undefined);

      return animate(
        FLY_MS,
        (t) => {
          const e = easeOutCubic(t);
          applyPose(card.g, lerpPose(from, to, e));
          if (line !== null && line !== undefined) {
            if (e >= 1) line.setAttribute('stroke-width', String(LINE_PICKED));
            else line.setAttribute('stroke-width', String(lerp(LINE_WAITING, LINE_PICKED, e)));
          }
          for (const ring of rings) {
            if (e >= 1) ring.removeAttribute('opacity');
            else ring.setAttribute('opacity', String(clamp01(e * 2)));
          }
        },
        live,
      );
    }

    /**
     * 간선이 놓이고 두 무리가 하나가 된다.
     *
     * 카드가 빨려 들어가는 것 · 선이 자라는 것 · 배지가 뜨는 것 · 진 쪽이 물드는
     * 것은 전부 **한 뜻**이라 한 시계로 흘린다. 진 쪽의 옛 색은 `step.wasRep` 가
     * 말한다 — `prev` 에서 꺼내면 위반이다.
     */
    function flowKeep(
      scene: SortEdgesAvoidCycleScene,
      geo: Layout,
      step: { id: string; wasRep: string; changed: string[] },
      live: () => boolean,
    ): Promise<void> {
      const edge = edgeById(scene, step.id);
      if (edge === null) return Promise.resolve();
      const a = geo.at.get(edge.u);
      const b = geo.at.get(edge.v);
      const solid = solidAt.get(step.id);
      const badge = badgeAt.get(step.id);
      const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;

      // 운동 중에만 있는 것들 — 정지 화면에는 없어야 하므로 여기서 짓는다.
      const ghostCard = el('g');
      centerOrigin(ghostCard);
      ghostCard.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: cardW,
          height: CARD_H,
          rx: 6,
          fill: palette.itemDefault,
          stroke: palette.itemComparing,
          'stroke-width': 2.5,
        }),
      );
      overlay.appendChild(ghostCard);

      const ghostLine = buildEdgeLine(geo, edge);
      if (ghostLine !== null) {
        ghostLine.setAttribute('stroke', palette.itemComparing);
        ghostLine.setAttribute('stroke-width', String(LINE_PICKED));
        ghostLine.setAttribute('stroke-dasharray', '4 5');
        overlay.appendChild(ghostLine);
      }

      const pulses: SVGCircleElement[] = [];
      for (const node of step.changed) {
        const at = geo.at.get(node);
        if (at === undefined) continue;
        const pulse = el('circle', {
          cx: at.x,
          cy: at.y,
          r: NODE_R,
          fill: 'none',
          stroke: toneOf(scene, edge.u),
          'stroke-width': 3,
        });
        centerOrigin(pulse);
        overlay.appendChild(pulse);
        pulses.push(pulse);
      }

      const fromPose = poseAtCenter(pickCenter(geo, edge), PICKED_SCALE, 0);
      const toPose = poseAtCenter(midOf(geo, edge), ABSORB_SCALE, 0);
      // 진 쪽이 걸치고 있던 옛 색. 장면이 계기값으로 말한 것이다.
      const tones = categorical(Math.max(1, scene.graph.nodes.length), 'pastel');
      const wasIndex = scene.graph.nodes.indexOf(step.wasRep);
      const wasTone = tones[(wasIndex < 0 ? 0 : wasIndex) % tones.length] ?? palette.itemDefault;
      const nowTone = toneOf(scene, edge.u);

      return animate(
        KEEP_MS,
        (t) => {
          const e = easeOutCubic(t);
          applyPose(ghostCard, lerpPose(fromPose, toPose, e));
          ghostCard.setAttribute('opacity', e >= 1 ? '0' : String(1 - e));
          if (ghostLine !== null) {
            ghostLine.setAttribute('opacity', e >= 1 ? '0' : String(clamp01(1 - e * 2.5)));
          }
          if (solid !== undefined) {
            if (e >= 1) {
              solid.removeAttribute('stroke-dasharray');
              solid.removeAttribute('stroke-dashoffset');
            } else {
              solid.setAttribute('stroke-dasharray', String(length));
              solid.setAttribute('stroke-dashoffset', String(length * (1 - e)));
            }
          }
          if (badge !== undefined) {
            if (e >= 1) badge.removeAttribute('opacity');
            else badge.setAttribute('opacity', String(clamp01((e - 0.6) / 0.4)));
          }
          for (const node of step.changed) {
            const body = bodyAt.get(node);
            if (body === undefined) continue;
            body.setAttribute('fill', mixHex(wasTone, nowTone, e));
          }
          for (const pulse of pulses) {
            pulse.style.transform = `scale(${lerp(1, PULSE_TO, e)})`;
            pulse.setAttribute('opacity', e >= 1 ? '0' : String(PULSE_FROM_OPACITY * (1 - e)));
          }
        },
        live,
      );
    }

    /**
     * 이미 한 무리라 고리가 된다. 까닭을 먼저 보이고 나서 떨어뜨린다.
     *
     * 마디 셋은 **서로 다른 말**을 한다 — 길이 있다 / 고리가 닫힌다 / 그것만
     * 떨어진다. 그래서 나란히가 아니라 차례로 흐른다.
     */
    async function flowDiscard(
      scene: SortEdgesAvoidCycleScene,
      geo: Layout,
      id: string,
      live: () => boolean,
    ): Promise<void> {
      const edge = edgeById(scene, id);
      if (edge === null) return;
      const card = cardAt.get(id);
      const mark = markAt.get(id);
      const path = cyclePathOf(scene, id);
      const loopLines = pathEdgesOf(scene, path)
        .map((eid) => solidAt.get(eid))
        .filter((l): l is SVGLineElement => l !== undefined);

      // 카드는 아직 집어 든 자리에 있다. 바닥 자리는 마디 3 이 데려간다.
      const fromPose = poseAtCenter(pickCenter(geo, edge), PICKED_SCALE, 0);
      const toPose = cardPoseOf(scene, geo, id) ?? fromPose;
      if (card !== undefined) {
        applyPose(card.g, fromPose);
        card.rect.setAttribute('stroke', palette.itemComparing);
        card.cross.setAttribute('opacity', '0');
      }
      if (mark !== undefined) mark.setAttribute('opacity', '0');

      // 운동 중에만 있는 것 — 고리 위 정점의 붉은 링과, 고리를 닫는 선.
      const rings: SVGCircleElement[] = [];
      for (const node of path) {
        const at = geo.at.get(node);
        if (at === undefined) continue;
        const ring = el('circle', {
          cx: at.x,
          cy: at.y,
          r: RING_R,
          fill: 'none',
          stroke: palette.danger,
          'stroke-width': 2.5,
          opacity: 0,
        });
        overlay.appendChild(ring);
        rings.push(ring);
      }

      const a = geo.at.get(edge.u);
      const b = geo.at.get(edge.v);
      const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      const closing = buildEdgeLine(geo, edge);
      if (closing !== null) {
        closing.setAttribute('stroke', palette.danger);
        closing.setAttribute('stroke-width', String(LINE_CYCLE));
        closing.setAttribute('stroke-linecap', 'round');
        closing.setAttribute('stroke-dasharray', String(length));
        closing.setAttribute('stroke-dashoffset', String(length));
        overlay.appendChild(closing);
      }

      // 1. 이미 이어져 있던 길이 먼저 켜진다. 그것이 버리는 까닭이다.
      await animate(
        CYCLE_PATH_MS,
        (t) => {
          const e = easeOutCubic(t);
          for (const line of loopLines) {
            line.setAttribute('stroke', mixHex(palette.itemSorted, palette.danger, e));
            line.setAttribute('stroke-width', String(lerp(LINE_KEPT, LINE_CYCLE, e)));
          }
          for (const ring of rings) ring.setAttribute('opacity', String(e));
        },
        live,
      );
      if (!live()) return;

      // 2. 집어 든 간선이 그 위에 놓여 고리를 닫는다.
      await animate(
        CYCLE_CLOSE_MS,
        (t) => {
          if (closing !== null) {
            closing.setAttribute('stroke-dashoffset', t >= 1 ? '0' : String(length * (1 - t)));
          }
          if (card !== undefined) {
            card.rect.setAttribute(
              'stroke',
              mixHex(palette.itemComparing, palette.danger, t),
            );
            card.cross.setAttribute('opacity', String(clamp01(t * 1.6)));
          }
        },
        live,
      );
      if (!live()) return;

      // 3. 고리가 풀리고 그 간선만 떨어져 나간다. 그 자리에는 자취가 남는다.
      await animate(
        DROP_MS,
        (t) => {
          const e = easeOutCubic(t);
          for (const line of loopLines) {
            line.setAttribute('stroke', mixHex(palette.danger, palette.itemSorted, e));
            line.setAttribute('stroke-width', String(lerp(LINE_CYCLE, LINE_KEPT, e)));
          }
          for (const ring of rings) ring.setAttribute('opacity', String(1 - e));
          if (closing !== null) closing.setAttribute('opacity', String(clamp01(1 - e * 1.6)));
          if (mark !== undefined) {
            if (e >= 1) mark.removeAttribute('opacity');
            else mark.setAttribute('opacity', String(clamp01((e - 0.35) / 0.65)));
          }
          if (card !== undefined) {
            // 떨어지는 것은 되돌아오지 않으므로 뒤로 갈수록 빨라지는 결로 민다.
            applyPose(card.g, lerpPose(fromPose, toPose, t * t));
            if (t >= 1) card.rect.setAttribute('stroke', palette.danger);
            if (t >= 1) card.cross.removeAttribute('opacity');
          }
        },
        live,
      );
    }

    function flowOf(
      scene: SortEdgesAvoidCycleScene,
      geo: Layout,
      step: SortEdgesStep,
      live: () => boolean,
    ): Promise<void> {
      switch (step.kind) {
        case 'order':
          return flowOrder(scene, live);
        case 'pick':
          return flowPick(scene, geo, step.id, live);
        case 'keep':
          return flowKeep(scene, geo, step, live);
        case 'discard':
          return flowDiscard(scene, geo, step.id, live);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 자리에 필요한 계기값을 장면이 스스로
     * 말하므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: SortEdgesAvoidCycleScene,
      _prev: SortEdgesAvoidCycleScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = layoutOf(next);
      rewind();
      drawStatic(next, geo);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(next, geo, step, live);
      if (!live()) return;

      // 흐르며 남은 보간 끝자리와 운동 전용 요소가 통째로 사라진다. 그 사이에
      // 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next, geo);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 프레임은 아예 불리지
        // 않으므로 기다리던 promise 가 영영 안 풀린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
