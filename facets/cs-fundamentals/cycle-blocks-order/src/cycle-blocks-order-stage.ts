/**
 * cycle-blocks-order-stage — 꺼내다가 멈추는 화면.
 *
 * ── 왜 이 모양인가
 *
 * 동사가 "멈춘다" 다. 멈춤을 보이려면 먼저 **나아가는 것**이 보여야 하므로, 화면을
 * 위아래 둘로 가른다. 위는 정점들이 놓인 판이고 아래는 꺼낸 것을 담는 자리 다섯이다.
 * 꺼낼 수 있는 정점은 제 자리에서 **아래로 내려가** 자리를 채운다 — 색이 바뀌는 것이
 * 아니라 실제로 옮겨 간다.
 *
 * 두 번 내려가고 나면 아무도 내려가지 못한다. 남은 것들은 흔들리기만 하고 제자리다.
 * 그 다음이 이 조각의 몫이다 — 왜 못 가는지를 **화살표를 거슬러 올라가며** 보인다.
 * 점 하나가 기다리는 쪽에서 기다림을 받는 쪽으로 거슬러 가고, 그것이 제자리로
 * 돌아오는 순간 고리가 닫힌다. 아래 자리 셋은 끝내 빈 채로 남고, 그 빈 자리가
 * "순서가 없다" 는 말의 그림이다.
 *
 * ── 끝 화면이 멈춤을 말한다
 *
 * 다 끝난 화면에 **남은 것 셋이 각각 1 을 이고 선다.** 0 이 되지 않는다는 것이 이
 * 조각의 주장이라, 그 수가 끝까지 배지에 떠 있어야 한다. 고리는 붉은 한 바퀴로
 * 감기고, 고리 뒤에 매달린 것은 **파선**으로 갈라 그린다 — 같은 모양으로 그리면
 * "고리에 든 것" 과 "고리에 걸린 것" 이 한 말이 되는데 이 조각은 그 둘이 다르다고
 * 말한다. 아래 빈 자리 셋에는 막대가 서서 끝내 아무것도 못 들어왔음을 남긴다.
 *
 * 칠은 뜻을 갈라 둔다 (프로토콜 4 절).
 *
 * - **채움 = 값의 형편** — 그대로 있다 / 꺼낼 수 있다 / 꺼내졌다.
 * - **테두리 = 짚음의 표식** — 멈춤에 걸렸다(붉은 실선) / 고리 뒤에 매달렸다(파선).
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그 장면의
 * 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다 (S-scene).
 * 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다. 운동이 끝나면 장면을
 * 통째로 다시 세워, 흐르며 남은 보간 끝자리와 임시 노드를 한꺼번에 지운다.
 *
 * 흐르게 할 것이 여럿인 걸음(꺼내기 — 마디가 내려가고 짐 조각이 떨어진다, 고리
 * 닫기 — 점이 거슬러 가고 렌즈가 그려진다)도 **시계는 하나다.** 한 뜻으로 묶인
 * 운동이라 목록 하나에 모아 한 `animate` 로 흘리면 `render` 의 Promise 가 전부 선
 * 뒤에 구조적으로 풀린다.
 *
 * `prev` 는 들추지 않는다. 내려가는 마디의 출발 자리도, 줄기 전의 짐도 전부 `next`
 * 에서 되셈된다 (S-scene).
 *
 * ── 수와 자리
 *
 * 화면에 뜨는 수는 전부 `scene.ts` 의 셈 함수를 지난다 (`loadsOf` · `readyOf` ·
 * `stuckOf` · `releasedBy`). 배지의 수도 캡션의 수도 같은 출처라 갈릴 자리가 없다.
 * 가로 좌표는 여기서 캔버스로부터 역산한다 — 장면에는 좌표가 없다 (S-piece).
 * 세로는 내용으로 변하지 않으므로 `viewBox` 를 다시 재지 않는다 (S-view).
 *
 * ── 뒷일
 *
 * 프레임 루프 하나만 쓰고 `destroy()` 에서 세운다. 대기 중인 애니메이션 Promise 는
 * destroy 시 전부 즉시 결과를 낸다 — **취소된 tick 은 아예 불리지 않으므로** 걸린
 * 채로 두면 알고리즘이 멈춘 자리에서 영영 깨어나지 못한다 (S-piece).
 *
 * 지연 발화를 막는 것은 **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant` 와
 * `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다 (S-scene).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  isTrailing,
  lastTakenOf,
  lastWaitOf,
  loadsOf,
  readingOrderOf,
  releasedBy,
  stuckOf,
  type CycleBlocksOrderScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 판의 크기. 세로는 마운트한 뒤 바뀌지 않는다 (S-view).
const W = PIECE_CANVAS_W;
const H = 268;

const CAPTION_Y = 21;
const SIDE_MIN = 30;
const COL_MAX_W = 112;
const NODE_CY = 110;
const NODE_R = 27;
const BADGE_DY = -46;
const BADGE_W = 26;
const BADGE_H = 20;
const BADGE_RISE = 22;
const LANE_LABEL_Y = 186;
const LANE_TOP = 196;
const LANE_H = 48;
const SLOT_MAX_W = 96;
const SLOT_R = 17;
const ARC_BOW = 66;
const ARC_TILT = 0.62;
const CHIP_DROP = 30;
const LIFT = 9;
const SHAKE = 4;
const SETTLE = 5;

// ── 걸음마다의 지속시간. 걸음 하나는 `여기 + stepMs` 다 (S-piece).
const SURVEY_MS = 300;
const READY_MS = 280;
const STALL_MS = 400;
const TRAVEL_MS = 460;
const RELEASE_MS = 240;
const TRACE_MS = 420;
const LENS_MS = 420;
const HALT_MS = 360;

type Pt = { x: number; y: number };

/** 간선 하나의 기하. SVG 의 길이/점 조회 API 를 쓰지 않고 직접 셈한다. */
type Geom = { kind: 'line'; p0: Pt; p2: Pt } | { kind: 'quad'; p0: Pt; p1: Pt; p2: Pt };

/** 토큰 hex 에 알파를 얹는 순수 변환 (S-view Exception — 색 리터럴이 아니다). */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pointAt(g: Geom, t: number): Pt {
  if (g.kind === 'line') {
    return { x: g.p0.x + (g.p2.x - g.p0.x) * t, y: g.p0.y + (g.p2.y - g.p0.y) * t };
  }
  const u = 1 - t;
  return {
    x: u * u * g.p0.x + 2 * u * t * g.p1.x + t * t * g.p2.x,
    y: u * u * g.p0.y + 2 * u * t * g.p1.y + t * t * g.p2.y,
  };
}

function tangentAtEnd(g: Geom): Pt {
  if (g.kind === 'line') return { x: g.p2.x - g.p0.x, y: g.p2.y - g.p0.y };
  return { x: 2 * (g.p2.x - g.p1.x), y: 2 * (g.p2.y - g.p1.y) };
}

function geomPath(g: Geom): string {
  if (g.kind === 'line') return `M ${g.p0.x} ${g.p0.y} L ${g.p2.x} ${g.p2.y}`;
  return `M ${g.p0.x} ${g.p0.y} Q ${g.p1.x} ${g.p1.y} ${g.p2.x} ${g.p2.y}`;
}

/** 샘플링으로 대략 길이를 잰다. `getTotalLength` 는 환경에 따라 없다. */
function geomLength(g: Geom): number {
  let total = 0;
  let prev = pointAt(g, 0);
  for (let i = 1; i <= 24; i += 1) {
    const cur = pointAt(g, i / 24);
    total += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return total;
}

function arrowHead(g: Geom): string {
  const tip = g.p2;
  const dir = tangentAtEnd(g);
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const back = { x: tip.x - ux * 10, y: tip.y - uy * 10 };
  const nx = -uy * 5;
  const ny = ux * 5;
  return `M ${tip.x} ${tip.y} L ${back.x + nx} ${back.y + ny} L ${back.x - nx} ${back.y - ny} Z`;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

const edgeKey = (from: string, to: string): string => `${from}>${to}`;

/**
 * 자리. 장면의 **구조**에서 한 번에 셈한다.
 *
 * 그리면서 재지 않는다 — 이웃의 지금 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다
 * (프로토콜 4 절). 좌우 차례도 바탕에서만 나오므로 걸음이 지나도 흔들리지 않는다.
 */
type Layout = {
  order: readonly string[];
  colW: number;
  slotW: number;
  nodeHome(id: string): Pt;
  badgeHome(id: string): Pt;
  slotCenter(index: number): Pt;
  geomOf(from: string, to: string): Geom;
};

function layoutOf(scene: CycleBlocksOrderScene): Layout {
  const order = readingOrderOf(scene);
  const n = order.length;
  const colW = Math.min(COL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, n)));
  const left = Math.round((W - n * colW) / 2);
  const colX = (i: number): number => left + colW / 2 + i * colW;
  const indexOf = (id: string): number => Math.max(0, order.indexOf(id));

  const geomOf = (from: string, to: string): Geom => {
    const ia = indexOf(from);
    const ib = indexOf(to);
    const xa = colX(ia);
    const xb = colX(ib);
    const dir = ib >= ia ? 1 : -1;
    const span = Math.abs(ib - ia);
    const mutual = scene.edges.some((e) => e.from === to && e.to === from);

    if (!mutual && span <= 1) {
      return {
        kind: 'line',
        p0: { x: xa + dir * (NODE_R + 3), y: NODE_CY },
        p2: { x: xb - dir * (NODE_R + 11), y: NODE_CY },
      };
    }
    // 서로 가리키는 짝은 위아래로 갈라 두 활을 만든다 — 둘이 모여 고리가 된다.
    const bow = mutual ? (dir > 0 ? -ARC_BOW : ARC_BOW) : -(ARC_BOW - 10 + span * 22);
    const side = bow < 0 ? -1 : 1;
    const sa = dir > 0 ? side * ARC_TILT : Math.PI - side * ARC_TILT;
    const ea = dir > 0 ? Math.PI - side * ARC_TILT : side * ARC_TILT;
    return {
      kind: 'quad',
      p0: { x: xa + NODE_R * Math.cos(sa), y: NODE_CY + NODE_R * Math.sin(sa) },
      p1: { x: (xa + xb) / 2, y: NODE_CY + bow },
      p2: { x: xb + (NODE_R + 9) * Math.cos(ea), y: NODE_CY + (NODE_R + 9) * Math.sin(ea) },
    };
  };

  return {
    order,
    colW,
    slotW: Math.min(SLOT_MAX_W, colW - 18),
    nodeHome: (id) => ({ x: colX(indexOf(id)), y: NODE_CY }),
    badgeHome: (id) => ({ x: colX(indexOf(id)), y: NODE_CY + BADGE_DY }),
    slotCenter: (index) => ({ x: colX(index), y: LANE_TOP + LANE_H / 2 }),
    geomOf,
  };
}

/** 정적 그리기가 내주는 손잡이. 뜻도 수치도 담지 않는다 — 그것은 장면이 쥔다. */
type Drawn = {
  at: Layout;
  nodes: Map<string, SVGGElement>;
  ghosts: Map<string, SVGCircleElement>;
  badges: Map<string, SVGGElement>;
  slots: SVGRectElement[];
  lens: SVGPathElement | null;
};

/** 한 시계로 흐르는 운동 하나. 여럿이 함께 움직여도 시계는 나누지 않는다. */
type Motion = { duration: number; apply(t: number): void };

export const cycleBlocksOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CycleBlocksOrderScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 러너 밖 마운트를 위한 fallback. 러너가 주면 저작자 문안이 얹힌 조회기다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const root = el('g');
    svg.appendChild(root);

    // ── 애니메이션 동력 ──────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await ctx.emit`
     * 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가 통째로 붙들린다
     * (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 모든 요소를 매번 새로 만드므로 살아남은 옛 운동이 쥔 것은 이미
     * 떨어져 나간 노드다. 그래도 빗장을 둔다 — 깨어난 프레임이 헛일을 하는 것을
     * 여기서 끊고, 무엇이 유효한 세대인지가 코드에 적힌다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
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
    function animate(duration: number, my: number, apply: (t: number) => void): Promise<void> {
      const paint = (t: number): void => {
        if (alive(my)) apply(t);
      };
      paint(0);
      if (destroyed || duration <= 0) {
        paint(1);
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
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const t = Math.min(1, (nowMs() - startedAt) / duration);
          paint(t);
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

    // ── 그리기 밑감 ──────────────────────────────────────────────────────

    function setNodeAt(g: SVGGElement, at: Pt, scale: number): void {
      g.setAttribute('transform', `translate(${at.x}, ${at.y}) scale(${scale})`);
    }

    function setBadgeAt(g: SVGGElement, at: Pt): void {
      g.setAttribute('transform', `translate(${at.x}, ${at.y})`);
    }

    /**
     * 이 걸음이 무슨 말을 하는가.
     *
     * 수와 이름은 장면에서 꺼낸다 — 캡션이 그림과 다른 출처를 갖지 않게 한다.
     * 문안 자체는 저작 선언에 있고 여기에는 키만 남는다 (C10).
     */
    function captionOf(scene: CycleBlocksOrderScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'survey':
          return tr('caption.survey', 'Each vertex carries the number of arrows aimed at it');
        case 'ready':
          return tr('caption.ready', '{ids} carries 0 — it can come out', {
            ids: [...scene.ready].join(', '),
          });
        case 'stall':
          return tr('caption.stall', 'Nothing carries 0 anymore. Nothing can come out.');
        case 'extract':
          return tr('caption.extract', 'Take {id} out — the arrows it aimed are gone', {
            id: lastTakenOf(scene) ?? '',
          });
        case 'wait':
        case 'ring':
        case 'trail': {
          const wait = lastWaitOf(scene);
          const a = wait?.from ?? '';
          const b = wait?.on ?? '';
          if (step.kind === 'ring') {
            return tr('caption.ringClosed', '{a} waits for {b}, and {b} waits for {a}', { a, b });
          }
          if (step.kind === 'trail') {
            return tr('caption.trail', '{a} waits for {b}, which is caught in the ring', { a, b });
          }
          return tr('caption.wait', '{a} cannot move: it waits for {b}', { a, b });
        }
        case 'halt':
          return tr('caption.halt', 'Only {out} of {total} came out — a ring leaves no order', {
            out: scene.taken.length,
            total: scene.vertices.length,
          });
      }
    }

    /** 캡션이 붉게 물드는가 — 멈춤을 말하는 걸음부터다. */
    function alarmed(scene: CycleBlocksOrderScene): boolean {
      const kind = scene.step?.kind;
      return kind === 'stall' || kind === 'wait' || kind === 'ring' || kind === 'trail' || kind === 'halt';
    }

    /**
     * 장면이 말하는 것을 전부 세운다.
     *
     * 걸음마다 통째로 다시 짓는다. 되돌릴 명령이 필요 없고, 흐르던 운동이 남긴 속성도
     * 남을 자리가 없다 (S-scene). 숨기기만 해서 앞 걸음의 값이 남는 자리도 생기지
     * 않는다 — 아직 없는 것도, 이미 없어진 것도 짓지 않는다.
     */
    function drawStatic(scene: CycleBlocksOrderScene): Drawn {
      const at = layoutOf(scene);
      const load = loadsOf(scene);
      const stuck = scene.stalled ? stuckOf(scene) : [];
      const stuckSet = new Set(stuck);
      const ring = scene.ring ?? [];

      // 화살표의 어휘. 고리와 매달림을 갈라 둔다 — 두 말이 한 모양이 되면 안 된다.
      const ringEdges = new Set<string>();
      for (let i = 0; i < ring.length; i += 1) {
        ringEdges.add(edgeKey(ring[(i + 1) % ring.length]!, ring[i]!));
      }
      const trailEdges = new Set<string>();
      const trailNodes = new Set<string>();
      for (const wait of scene.waits) {
        if (!isTrailing(scene, wait)) continue;
        trailEdges.add(edgeKey(wait.on, wait.from));
        trailNodes.add(wait.from);
      }
      // 고리가 아직 닫히지 않은 동안 딛은 발도 붉게 남는다 — 거슬러 온 자취다.
      const walkedEdges = new Set<string>();
      for (const wait of scene.waits) walkedEdges.add(edgeKey(wait.on, wait.from));

      root.textContent = '';

      const nodes = new Map<string, SVGGElement>();
      const ghosts = new Map<string, SVGCircleElement>();
      const badges = new Map<string, SVGGElement>();
      const slots: SVGRectElement[] = [];
      let lens: SVGPathElement | null = null;

      const n = at.order.length;
      if (n === 0) return { at, nodes, ghosts, badges, slots, lens };

      // ── 고리 렌즈. 간선 아래에 깔아 한 바퀴를 물들인다.
      if (ring.length >= 2) {
        const parts: Geom[] = [];
        for (let i = 0; i < ring.length; i += 1) {
          parts.push(at.geomOf(ring[(i + 1) % ring.length]!, ring[i]!));
        }
        // 활을 이어 붙인다. 이음매는 L 로 건너뛰는데, 그 자리는 정점 원판 아래라
        // 보이지 않는다. 이어 놓으면 두 활이 닫힌 한 바퀴가 된다.
        const d =
          parts
            .map((g, i) =>
              i === 0 ? geomPath(g) : `L ${g.p0.x} ${g.p0.y} ${geomPath(g).replace(/^M [^A-Z]*/, '')}`,
            )
            .join(' ') + ' Z';
        lens = el('path', {
          d,
          fill: withAlpha(c.danger, 0.08),
          stroke: c.danger,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        });
        root.appendChild(lens);
      }

      // ── 가운데 — 간선.
      for (const e of scene.edges) {
        const key = edgeKey(e.from, e.to);
        const geom = at.geomOf(e.from, e.to);
        const path = el('path', { d: geomPath(geom), fill: 'none', 'stroke-linecap': 'round' });
        const head = el('path', { d: arrowHead(geom) });
        if (ringEdges.has(key)) {
          // 고리 — 서로를 기다리는 한 바퀴.
          path.setAttribute('stroke', c.danger);
          path.setAttribute('stroke-width', '3');
          head.setAttribute('fill', c.danger);
        } else if (trailEdges.has(key)) {
          // 고리 뒤에 매달린 기다림 — 같은 붉은색이되 모양을 가른다.
          path.setAttribute('stroke', c.danger);
          path.setAttribute('stroke-width', '2');
          path.setAttribute('stroke-dasharray', '6 4');
          head.setAttribute('fill', c.danger);
        } else if (walkedEdges.has(key)) {
          // 아직 고리인지 모르는 채 거슬러 온 발자국.
          path.setAttribute('stroke', c.danger);
          path.setAttribute('stroke-width', '2.4');
          head.setAttribute('fill', c.danger);
        } else if (scene.taken.includes(e.from)) {
          // 꺼낸 것이 겨누던 화살표는 풀렸다.
          path.setAttribute('stroke', c.border);
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('stroke-dasharray', '3 5');
          head.setAttribute('fill', c.border);
        } else {
          path.setAttribute('stroke', c.textMuted);
          path.setAttribute('stroke-width', '1.8');
          head.setAttribute('fill', c.textMuted);
        }
        root.append(path, head);
      }

      // ── 아래 — 꺼낸 것을 담는 자리. 정점 수만큼 두어, 끝내 비는 자리가 곧 답이다.
      const laneLabel = el('text', {
        x: Math.round((W - n * at.colW) / 2),
        y: LANE_LABEL_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      laneLabel.textContent = tr('label.order', 'Order taken out');
      root.appendChild(laneLabel);

      for (let i = 0; i < n; i += 1) {
        const center = at.slotCenter(i);
        const filled = i < scene.taken.length;
        // 끝내 못 채운 자리. 다 보이고 난 뒤에 붉게 굳는다 — 이 조각의 답이다.
        const barren = scene.closed && !filled;
        const box = el('rect', {
          x: center.x - at.slotW / 2,
          y: LANE_TOP,
          width: at.slotW,
          height: LANE_H,
          rx: 8,
          fill: c.bg,
          stroke: filled ? c.itemSorted : barren ? c.danger : c.border,
          'stroke-width': 1.5,
        });
        if (!filled) box.setAttribute('stroke-dasharray', '4 4');
        const ordinal = el('text', {
          x: center.x - at.slotW / 2 + 7,
          y: LANE_TOP + 14,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        ordinal.textContent = String(i + 1);
        root.append(box, ordinal);
        if (barren) {
          root.appendChild(
            el('path', {
              d: `M ${center.x - 11} ${center.y} L ${center.x + 11} ${center.y}`,
              stroke: c.danger,
              'stroke-width': 3,
              'stroke-linecap': 'round',
            }),
          );
        }
        slots.push(box);
      }

      // ── 위 — 정점과 그것이 이고 있는 수.
      for (const v of at.order) {
        const home = at.nodeHome(v);
        const slot = scene.taken.indexOf(v);
        const taken = slot >= 0;

        // 판을 떠난 자리에 남는 빈 테두리.
        if (taken) {
          const ghost = el('circle', {
            cx: home.x,
            cy: home.y,
            r: NODE_R,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '3 5',
          });
          root.appendChild(ghost);
          ghosts.set(v, ghost);
        }

        // 채움은 값의 형편, 테두리는 짚음의 표식. 둘을 갈라 두면 부딪히지 않는다.
        const ready = !taken && scene.ready.includes(v);
        const fill = ready ? c.accent : taken ? c.itemSorted : c.bg;
        const ink = ready ? c.stateInk : taken ? c.textInverse : c.text;
        const caught = stuckSet.has(v);
        const group = el('g');
        const disc = el('circle', {
          cx: 0,
          cy: 0,
          r: NODE_R,
          fill,
          stroke: caught ? c.danger : c.border,
          'stroke-width': caught ? 2.5 : 2,
        });
        if (trailNodes.has(v)) disc.setAttribute('stroke-dasharray', '5 4');
        const label = el('text', {
          x: 0,
          y: 6,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: ink,
        });
        label.textContent = v;
        group.append(disc, label);
        root.appendChild(group);
        setNodeAt(group, taken ? at.slotCenter(slot) : home, taken ? SLOT_R / NODE_R : 1);
        nodes.set(v, group);

        // 이고 있는 수. 꺼낸 것에게는 질 짐이 없으므로 짓지 않는다.
        if (!scene.surveyed || taken) continue;
        const value = load.get(v) ?? 0;
        const zero = value === 0;
        const bgroup = el('g');
        const box = el('rect', {
          x: -BADGE_W / 2,
          y: -BADGE_H / 2,
          width: BADGE_W,
          height: BADGE_H,
          rx: 6,
          'stroke-width': 1.5,
          fill: zero ? c.accent : c.bgSubtle,
          stroke: caught ? c.danger : c.border,
        });
        const blabel = el('text', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: zero ? c.stateInk : caught ? c.danger : c.text,
        });
        blabel.textContent = String(value);
        bgroup.append(box, blabel);
        setBadgeAt(bgroup, at.badgeHome(v));
        root.appendChild(bgroup);
        badges.set(v, bgroup);
      }

      // ── 캡션은 맨 위에. 색까지 매번 명시로 쓴다 (재건 밖 요소를 두지 않는다).
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: alarmed(scene) ? c.danger : c.text,
      });
      caption.textContent = captionOf(scene);
      root.appendChild(caption);

      return { at, nodes, ghosts, badges, slots, lens };
    }

    /**
     * 이 걸음에 흐를 것.
     *
     * 흐를 것이 여럿이어도 **목록 하나에 모아 한 시계로** 돌린다. 출발 자리는 전부
     * 장면에서 되셈하므로 `prev` 를 들추지 않는다 (S-scene).
     */
    function motionFor(scene: CycleBlocksOrderScene, drawn: Drawn): Motion | null {
      const step = scene.step;
      if (step === null) return null;
      const at = drawn.at;

      switch (step.kind) {
        /* 짐이 위에서 내려앉는다 — 나타나는 것이 아니라 얹히는 것이다. */
        case 'survey': {
          const rising = [...drawn.badges].map(([id, g]) => ({ g, home: at.badgeHome(id) }));
          if (rising.length === 0) return null;
          return {
            duration: SURVEY_MS,
            apply(t) {
              const k = ease(t);
              for (const one of rising) {
                one.g.setAttribute('opacity', k.toFixed(3));
                setBadgeAt(one.g, { x: one.home.x, y: one.home.y - (1 - k) * BADGE_RISE });
              }
            },
          };
        }

        /* 꺼낼 수 있는 것은 한 번 떠오른다. */
        case 'ready': {
          const lifting = scene.ready
            .filter((id) => !scene.taken.includes(id))
            .flatMap((id) => {
              const g = drawn.nodes.get(id);
              return g ? [{ g, home: at.nodeHome(id) }] : [];
            });
          if (lifting.length === 0) return null;
          return {
            duration: READY_MS,
            apply(t) {
              const lift = Math.sin(t * Math.PI) * LIFT;
              for (const one of lifting) setNodeAt(one.g, { x: one.home.x, y: one.home.y - lift }, 1);
            },
          };
        }

        /* 아무도 못 나간다. 흔들리기만 하고 제자리다 — 이것이 멈춤이다. */
        case 'stall': {
          const shaking = stuckOf(scene).flatMap((id) => {
            const g = drawn.nodes.get(id);
            return g ? [{ g, home: at.nodeHome(id) }] : [];
          });
          if (shaking.length === 0) return null;
          return {
            duration: STALL_MS,
            apply(t) {
              const dx = Math.sin(t * Math.PI * 6) * (1 - t) * SHAKE;
              for (const one of shaking) setNodeAt(one.g, { x: one.home.x + dx, y: one.home.y }, 1);
            },
          };
        }

        /*
         * 판에서 자리로 내려가고, 그 바람에 짐 한 조각이 떨어져 나간다.
         *
         * 한 뜻으로 묶인 운동이라 시계를 나누지 않는다 — 내려앉은 뒤에 짐이 준다.
         */
        case 'extract': {
          const id = lastTakenOf(scene);
          if (id === null) return null;
          const group = drawn.nodes.get(id);
          if (!group) return null;
          const slot = scene.taken.length - 1;
          const from = at.nodeHome(id);
          const to = at.slotCenter(slot);
          const box = drawn.slots[slot];
          const ghost = drawn.ghosts.get(id);
          const targetScale = SLOT_R / NODE_R;

          // 짐 조각은 운동 중에만 있는 것이라 정적 그리기가 짓지 않는다. 마지막
          // 정적 그리기가 화면을 다시 세울 때 함께 사라진다.
          const chips = releasedBy(scene, id).flatMap((rel) => {
            const home = at.badgeHome(rel.to);
            const chip = el('rect', {
              x: home.x - 5,
              y: home.y - 5,
              width: 10,
              height: 10,
              rx: 2,
              fill: c.textMuted,
              opacity: 0,
            });
            root.appendChild(chip);
            return [chip];
          });

          const duration = TRAVEL_MS + (chips.length > 0 ? RELEASE_MS : 0);
          const split = TRAVEL_MS / duration;
          return {
            duration,
            apply(t) {
              const a = Math.min(1, t / split);
              const k = ease(a);
              setNodeAt(
                group,
                { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k },
                1 + (targetScale - 1) * k,
              );
              if (ghost) ghost.setAttribute('opacity', k.toFixed(3));
              // 자리가 채워지는 것은 다 내려앉은 뒤다.
              if (box) {
                if (a < 1) {
                  box.setAttribute('stroke', c.border);
                  box.setAttribute('stroke-dasharray', '4 4');
                } else {
                  box.setAttribute('stroke', c.itemSorted);
                  box.removeAttribute('stroke-dasharray');
                }
              }
              const b = t <= split ? 0 : (t - split) / (1 - split);
              for (const chip of chips) {
                chip.setAttribute('opacity', t <= split ? '0' : (1 - b).toFixed(3));
                chip.setAttribute('transform', `translate(0, ${(ease(b) * CHIP_DROP).toFixed(2)})`);
              }
            },
          };
        }

        /*
         * 기다리는 쪽에서 기다림을 받는 쪽으로 화살표를 **거슬러** 올라간다.
         * 고리가 닫히는 걸음이면 그 뒤에 한 바퀴가 이어 그려진다 — 한 시계다.
         */
        case 'wait':
        case 'trail':
        case 'ring': {
          const wait = lastWaitOf(scene);
          if (wait === null) return null;
          const geom = scene.edges.some((e) => e.from === wait.on && e.to === wait.from)
            ? at.geomOf(wait.on, wait.from)
            : null;
          const lens = step.kind === 'ring' ? drawn.lens : null;
          if (geom === null && lens === null) return null;

          // 걷는 점도 운동 중에만 있는 것이라 정적 그리기에는 없다.
          const dot = geom === null ? null : el('circle', { r: 5.5, fill: c.danger });
          if (dot) root.appendChild(dot);

          const length = lens === null ? 0 : Math.round(lensLength(at, scene));
          if (lens !== null) {
            lens.setAttribute('stroke-dasharray', `${length} ${length}`);
            lens.setAttribute('stroke-dashoffset', String(length));
            lens.setAttribute('fill-opacity', '0');
          }

          const duration = (geom === null ? 0 : TRACE_MS) + (lens === null ? 0 : LENS_MS);
          const split = geom === null ? 0 : TRACE_MS / duration;
          return {
            duration,
            apply(t) {
              if (dot !== null && geom !== null) {
                const a = split <= 0 ? 1 : Math.min(1, t / split);
                const spot = pointAt(geom, 1 - ease(a));
                dot.setAttribute('cx', spot.x.toFixed(2));
                dot.setAttribute('cy', spot.y.toFixed(2));
                dot.setAttribute('opacity', a >= 1 ? '0' : '1');
              }
              if (lens !== null) {
                const b = split >= 1 ? 1 : Math.max(0, (t - split) / (1 - split));
                const k = ease(Math.min(1, b));
                lens.setAttribute('stroke-dashoffset', (length * (1 - k)).toFixed(2));
                lens.setAttribute('fill-opacity', k.toFixed(3));
              }
            },
          };
        }

        /* 남은 것들이 한 번 내려앉고 굳는다. */
        case 'halt': {
          const settling = stuckOf(scene).flatMap((id) => {
            const g = drawn.nodes.get(id);
            return g ? [{ g, home: at.nodeHome(id) }] : [];
          });
          if (settling.length === 0) return null;
          return {
            duration: HALT_MS,
            apply(t) {
              const dy = Math.sin(t * Math.PI) * SETTLE;
              for (const one of settling) setNodeAt(one.g, { x: one.home.x, y: one.home.y + dy }, 1);
            },
          };
        }
      }
    }

    /** 고리 한 바퀴의 대략 길이. 렌즈를 그려 나가는 눈금이다. */
    function lensLength(at: Layout, scene: CycleBlocksOrderScene): number {
      const ring = scene.ring ?? [];
      let total = 0;
      for (let i = 0; i < ring.length; i += 1) {
        total += geomLength(at.geomOf(ring[(i + 1) % ring.length]!, ring[i]!));
      }
      return total;
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다. 되짚기는
     * `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: CycleBlocksOrderScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: CycleBlocksOrderScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const drawn = drawStatic(next);
      if (!opts.animate) return;

      const motion = motionFor(next, drawn);
      if (!motion || motion.duration <= 0) return;

      await animate(motion.duration, my, (t) => motion.apply(t));

      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리와 임시 노드를 거두고 그 장면을 통째로 다시 세운다.
      // 속성을 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도 프레임도 없어
      // 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이 깨어나지
        // 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
