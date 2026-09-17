/**
 * mergeNearestPair 의 그림 — 장면 하나를 받아 화면을 **통째로** 세운다.
 *
 * 화면은 둘로 나뉜다. 왼쪽은 점들이 실제로 놓인 자리 — 거리가 어디서 나오는지를
 * 보이는 무대다. 오른쪽이 주인공으로, **합쳐진 자리가 그 거리만큼 올라가 걸리는**
 * 사다리꼴 나무다. 낮은 가로대는 가까운 것들이고 높은 가로대는 억지로 붙인 것이다.
 *
 * 왼쪽 아래의 띠는 지금 몇 무리인지를 칸으로 보인다. 글자는 자리를 지키고 칸만
 * 자라 서로를 삼킨다 — 합쳐지는 것은 점이 아니라 무리라는 뜻이다.
 *
 * 맺음에서 걸린 높이들이 매듭에서 떨어져 나와 자로 옮겨 붙는다. 한 줄에 모이면
 * 낮은 것들이 바닥에 뭉치고 높은 것들이 훌쩍 떨어져 있는 것이 한눈에 들어온다 —
 * 이 조각이 말하는 것은 나무를 짓는 데까지다. 어디서 자를지는 다른 이야기다.
 *
 * ── 어휘를 두 축으로 가른다
 *
 *   **채움** = 값의 형편 (이 점이 아직 저 혼자인가 · 무리에 들었나).
 *   **테두리·선의 결** = 견줌의 표식 (이번에 재어 보았다 / 이것을 골랐다).
 *
 * 그래서 진 후보가 이긴 짝을 덮지 않는다. 이 조각의 주장은 "**가장** 가까운 둘" 이라
 * 재 보고 진 것이 화면에 남아 있어야 *가장* 이 읽힌다 — 옛 화면은 후보 실을 뻗어
 * 본 뒤 전부 지워 그 사실이 캡션 글자에만 있었다. 가로대마다 그 위에 나란히 걸린
 * 옅은 점선 가로대가 그때 **다음으로 가까웠던 높이**라, 완주 화면에서도 여섯 번 다
 * 견줄 수 있다 (마지막 합침은 잴 쌍이 하나뿐이라 견줄 것이 없다).
 *
 * 좌표는 전부 여기서 캔버스로부터 역산한다. 장면이 쥔 것은 점의 값과 무엇이
 * 무엇과 합쳐졌는가라는 **구조**뿐이다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  beforeTreeOf,
  gapOf,
  heightsOf,
  lastJoinOf,
  lowHighOf,
  remainingOf,
  runnerUpOf,
  standingTreeOf,
  type MergeNearestPairScene,
  type MergeTree,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-view). */
const H = 336;

const PAD = 16;
const CAPTION_Y = 24;

// ── 왼쪽: 점이 놓인 자리 + 무리 띠
const MAP_X = PAD;
const MAP_Y = 44;
const MAP_W = 210;
const MAP_H = 190;
const MAP_INSET = 20;
const STRIP_X = MAP_X + MAP_INSET;
const STRIP_W = MAP_W - MAP_INSET * 2;
const STRIP_LABEL_Y = 264;
const STRIP_Y = 278;
const STRIP_H = 16;
const CHIP_GAP = 6;

// ── 오른쪽: 나무와 높이 자
const AXIS_X = 254;
const AXIS_TOP_Y = 56;
const AXIS_LABEL_Y = 38;
const BASE_Y = 300;
const COL_X0 = 280;
const COL_X1 = PIECE_CANVAS_W - PAD;
const LEAF_LABEL_Y = 316;

/**
 * 자의 위 끝.
 *
 * 선언된 여덟 점은 가장 높은 합침이 3.75 라 4 로 끊는다 — 낮은 가로대들이 바닥에
 * 몰려 보이는 것이 이 조각의 요점이므로, 자를 데이터 최대에 딱 맞추지 않고 눈금
 * 단위로 끊어 위쪽에 숨 쉴 자리를 남긴다. 자를 넘는 높이가 들어오면 위 끝에 붙여
 * 그린다 (프레임 밖으로 나가지 않게). 재생 도중에 자가 다시 눈금을 잡으면 앞서
 * 걸린 가로대가 자리를 옮기므로, 자라나는 값에서 척도를 잡지 않는다.
 */
const AXIS_MAX = 4;

const DOT_R = 3.5;
const DOT_R_ACTIVE = 5.7;
const NODE_R = 3.2;
/** 자에 옮겨 붙는 높이 표의 반 길이. 자 눈금은 왼쪽, 이 표는 오른쪽에 선다. */
const MARK_HALF = 5;
/**
 * "그때 다음으로 가까웠던 높이" 의 짙기.
 *
 * 재 보고 **진** 것이라 이긴 자국보다 옅고 점선이다. 가로대와 같은 폭으로 그 위에
 * 나란히 걸어 둔다 — 짧은 눈금으로 두면 두 높이가 거의 같았던 매듭에서 매듭 알에
 * 가려 안 보이는데, 하필 거기가 "둘이 거의 비등했다" 를 말해야 하는 자리다.
 */
const GHOST_OPACITY = 0.55;

// ── 걸음 하나 안의 지속 시간. 총 재생 길이는 여기에 stepMs 가 더해진 값이다.
//
// 처음에는 이 여섯의 합이 1,250ms 였다. 걸음당 2.1초가 되어 자동 재생이 16.6초 —
// 같은 배치의 다른 넷(9.6~14.3초)보다 눈에 띄게 길었다. `stepMs` 를 줄이는 것은
// 역효과라(애니메이션이 끝나기 전에 다음 걸음이 온다) 여기를 30% 깎았다.
const MS_SCAN = 140;
const MS_PICK = 105;
const MS_RISE = 265;
const MS_BAR = 120;
const MS_CAP = 105;
const MS_FUSE = 140;
const MS_MARKS = 630;

/** 띠의 칸 하나가 차지하는 가로 구간. */
type Slot = { x: number; w: number };

/** 뻗는 실 하나 — 양 끝의 화면 자리. */
type Thread = { line: SVGLineElement; ax: number; ay: number; bx: number; by: number };

/** 정적 그리기가 세운 것들. 운동은 여기 담긴 노드만 만진다. */
type Drawn = {
  /** 이번 걸음에 재어 보고 진 후보들. */
  scan: Thread[];
  /** 이번 걸음에 고른 실. */
  pick: Thread | null;
  /** 고른 짝의 두 점. */
  pickDots: SVGCircleElement[];
  /** 새 매듭의 두 기둥 — 아래 매듭의 높이에서 걸린 높이까지. */
  risers: { line: SVGLineElement; from: number; to: number }[];
  /** 새 가로대 — 가운데에서 양쪽 아래 매듭까지. */
  bar: { line: SVGLineElement; mid: number; left: number; right: number } | null;
  knot: SVGCircleElement | null;
  tag: { node: SVGTextElement; top: number } | null;
  /** 그때 다음으로 가까웠던 높이의 가로대. 잰 쌍이 하나뿐이면 없다. */
  ghost: { line: SVGLineElement; mid: number; left: number; right: number } | null;
  /** 이번에 생긴 무리의 칸과, 그것을 이룬 두 칸의 출발 자리. */
  fuse: { rect: SVGRectElement; fromLeft: Slot; fromRight: Slot; to: Slot } | null;
  /** 자로 옮겨 붙는 높이 표. */
  marks: { line: SVGLineElement; fromX: number; toX: number; y: number }[];
};

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

/**
 * 부풀었다 돌아오는 진폭. **양 끝에서 정확히 0 이다.**
 *
 * `Math.sin(Math.PI)` 는 0 이 아니라 1.2246e-16 이라, 그대로 쓰면 운동의 끝자리가
 * 속성 문자열에 남아 흘려 세운 화면과 곧바로 세운 화면이 갈린다.
 */
function bump(e: number): number {
  return e <= 0 || e >= 1 ? 0 : Math.sin(Math.PI * e);
}

export const mergeNearestPairStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MergeNearestPairScene> {
    // 컨테이너는 건드리지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const canvas = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 그림의 층위. 쌓는 차례가 곧 가리는 차례다.
    const root = document.createElementNS(SVG_NS, 'g');
    canvas.appendChild(root);
    const gMapBox = document.createElementNS(SVG_NS, 'g');
    const gEdges = document.createElementNS(SVG_NS, 'g');
    const gScan = document.createElementNS(SVG_NS, 'g');
    const gDots = document.createElementNS(SVG_NS, 'g');
    const gStrip = document.createElementNS(SVG_NS, 'g');
    const gChips = document.createElementNS(SVG_NS, 'g');
    const gChipInk = document.createElementNS(SVG_NS, 'g');
    const gTree = document.createElementNS(SVG_NS, 'g');
    const gBranches = document.createElementNS(SVG_NS, 'g');
    const gMarks = document.createElementNS(SVG_NS, 'g');
    const gCaption = document.createElementNS(SVG_NS, 'g');
    const layers = [
      gMapBox,
      gEdges,
      gScan,
      gDots,
      gStrip,
      gChips,
      gChipInk,
      gTree,
      gBranches,
      gMarks,
      gCaption,
    ];
    for (const layer of layers) root.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디와 프레임을 지난다. `destroy` 가 그 가운데 오면 남은
     * 프레임이 이미 떨어져 나간 화면에 쓰므로, 마디마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /**
     * 보간 한 마디.
     *
     * CSS transition 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition 은
     * 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     */
    function tween(
      durMs: number,
      mine: number,
      draw: (e: number) => void,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = durMs <= 0 ? 1 : Math.min(1, (now() - started) / durMs);
          draw(easeOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      value: string,
      size: string,
      fill: string,
      anchor: string,
      parent: SVGElement,
    ): SVGTextElement {
      const node = el(
        'text',
        { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor },
        parent,
      );
      node.textContent = value;
      return node;
    }

    // ── 자리 셈. 전부 장면의 값과 캔버스에서 역산한다 ─────────────────────────

    /** 왼쪽 무대의 축척. 점의 값 전체에서 매번 다시 잡는다. */
    type MapScale = { x: (v: number) => number; y: (v: number) => number };

    function scaleOf(scene: MergeNearestPairScene): MapScale {
      const xs = scene.dots.map((d) => d.x);
      const ys = scene.dots.map((d) => d.y);
      const minX = xs.length > 0 ? Math.min(...xs) : 0;
      const maxX = xs.length > 0 ? Math.max(...xs) : 1;
      const minY = ys.length > 0 ? Math.min(...ys) : 0;
      const maxY = ys.length > 0 ? Math.max(...ys) : 1;
      const spanX = Math.max(1e-6, maxX - minX);
      const spanY = Math.max(1e-6, maxY - minY);
      const innerW = MAP_W - MAP_INSET * 2;
      const innerH = MAP_H - MAP_INSET * 2;
      // 거리가 그림의 뜻이므로 가로세로 축척을 같게 잡는다 — 늘이면 가까운 쌍이
      // 뒤바뀐다.
      const scale = Math.min(innerW / spanX, innerH / spanY);
      const ox = MAP_X + (MAP_W - spanX * scale) / 2;
      const oy = MAP_Y + (MAP_H - spanY * scale) / 2;
      return {
        x: (v: number): number => ox + (v - minX) * scale,
        y: (v: number): number => oy + (maxY - v) * scale,
      };
    }

    function colXOf(n: number): (i: number) => number {
      const step = n > 1 ? (COL_X1 - COL_X0) / (n - 1) : 0;
      return (i: number): number => COL_X0 + i * step;
    }

    function yOfHeight(h: number): number {
      return Math.max(AXIS_TOP_Y, BASE_Y - (h / AXIS_MAX) * (BASE_Y - AXIS_TOP_Y));
    }

    function chipGeomOf(n: number): { w: number; x: (i: number) => number } {
      const w = n > 0 ? (STRIP_W - CHIP_GAP * (n - 1)) / n : 0;
      return { w, x: (i: number): number => STRIP_X + i * (w + CHIP_GAP) };
    }

    /**
     * 매듭마다의 화면 자리.
     *
     * 자리를 **먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 이웃의 지금
     * 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
     */
    function spotsOf(
      scene: MergeNearestPairScene,
      tree: MergeTree,
    ): Map<string, { x: number; y: number }> {
      const colX = colXOf(scene.dots.length);
      const spots = new Map<string, { x: number; y: number }>();
      for (let i = 0; i < scene.dots.length; i += 1) {
        const dot = scene.dots[i];
        if (dot) spots.set(dot.id, { x: colX(i), y: BASE_Y });
      }
      // `joins` 차례가 곧 아래에서 위로 쌓는 차례라 한 번 훑으면 전부 정해진다.
      for (const join of scene.joins) {
        const knot = tree.knots.get(join.nodeId);
        if (!knot?.children) continue;
        const a = spots.get(knot.children[0]);
        const b = spots.get(knot.children[1]);
        if (!a || !b) continue;
        spots.set(join.nodeId, { x: (a.x + b.x) / 2, y: yOfHeight(knot.height) });
      }
      return spots;
    }

    function slotOf(leaves: readonly number[], n: number): Slot {
      const { w, x } = chipGeomOf(n);
      const lo = leaves[0] ?? 0;
      const hi = leaves[leaves.length - 1] ?? lo;
      return { x: x(lo), w: x(hi) + w - x(lo) };
    }

    function placeSlot(rect: SVGRectElement, slot: Slot): void {
      rect.setAttribute('x', String(slot.x));
      rect.setAttribute('width', String(slot.w));
    }

    function placeMark(line: SVGLineElement, cx: number, y: number): void {
      line.setAttribute('x1', String(cx - MARK_HALF));
      line.setAttribute('x2', String(cx + MARK_HALF));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
    }

    /** 재 보는 중인 실의 차림 — 점선에 옅다. */
    function wearScanned(line: SVGLineElement): void {
      line.setAttribute('stroke', c.textMuted);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-opacity', '0.5');
      line.setAttribute('stroke-dasharray', '3 3');
    }

    /** 고른 실의 차림 — 성한 선. `active` 면 이번 걸음에 막 고른 것이다. */
    function wearPicked(line: SVGLineElement, active: boolean): void {
      line.setAttribute('stroke', active ? c.itemActive : c.text);
      line.setAttribute('stroke-width', active ? '2' : '1.4');
      line.setAttribute('stroke-opacity', '1');
      line.removeAttribute('stroke-dasharray');
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────
    //
    // 무엇을 말할지는 **장면 상태**가 정한다. `step` 을 읽지 않는다 — 읽으면 흘려
    // 세우는 경로와 곧바로 세우는 경로가 같은 `step` 을 보게 되어 검사가 눈이 먼다.

    function captionFor(scene: MergeNearestPairScene): string {
      if (scene.gathered) {
        const { low, high } = lowHighOf(heightsOf(scene));
        return t(
          'caption.done',
          '{low} bars huddle low, {high} leap high — the height is how far apart they were.',
          { low, high },
        );
      }
      const join = lastJoinOf(scene);
      if (join) {
        return t(
          'caption.merge',
          'The nearest two join, and the joint hangs at the height of that gap. Height: {d}',
          { d: gapOf(scene.dots, join.pick).toFixed(2) },
        );
      }
      return t('caption.start', '{n} points, and each is a cluster of its own.', {
        n: scene.dots.length,
      });
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: MergeNearestPairScene): Drawn {
      rewind();
      const drawn: Drawn = {
        scan: [],
        pick: null,
        pickDots: [],
        risers: [],
        bar: null,
        knot: null,
        tag: null,
        ghost: null,
        fuse: null,
        marks: [],
      };

      const n = scene.dots.length;
      const s = scaleOf(scene);
      const tree = standingTreeOf(scene);
      const spots = spotsOf(scene, tree);
      const colX = colXOf(n);
      const { w: chipW } = chipGeomOf(n);
      const join = lastJoinOf(scene);

      label(PAD, CAPTION_Y, captionFor(scene), fontSizes.md, c.text, 'start', gCaption);

      // ── 왼쪽 무대
      el(
        'rect',
        {
          x: MAP_X,
          y: MAP_Y,
          width: MAP_W,
          height: MAP_H,
          rx: radii.md,
          fill: c.bgSubtle,
          stroke: c.border,
        },
        gMapBox,
      );

      const at = (id: string): { x: number; y: number } | null => {
        const dot = scene.dots.find((d) => d.id === id);
        return dot ? { x: s.x(dot.x), y: s.y(dot.y) } : null;
      };

      // 고른 실은 걸음마다 쌓여 무리의 모양이 된다. 마지막 하나만 이번 걸음의
      // 표식(굵고 짙은 선)을 단다 — `step` 이 아니라 자취의 마지막이 그것을 말한다.
      for (let k = 0; k < scene.joins.length; k += 1) {
        const j = scene.joins[k];
        if (!j) continue;
        const a = at(j.pick.from);
        const b = at(j.pick.to);
        if (!a || !b) continue;
        const line = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, gEdges);
        wearPicked(line, k === scene.joins.length - 1);
        if (k === scene.joins.length - 1) {
          drawn.pick = { line, ax: a.x, ay: a.y, bx: b.x, by: b.y };
        }
      }

      // 이번 걸음에 재어 보고 **진** 후보들. 옛 화면은 이것을 지웠고, 그래서
      // 어느 정지 화면에도 "다른 짝들이 더 멀었다" 가 없었다.
      if (join) {
        for (const link of join.links) {
          const same =
            (link.from === join.pick.from && link.to === join.pick.to) ||
            (link.from === join.pick.to && link.to === join.pick.from);
          if (same) continue;
          const a = at(link.from);
          const b = at(link.to);
          if (!a || !b) continue;
          const line = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, gScan);
          wearScanned(line);
          drawn.scan.push({ line, ax: a.x, ay: a.y, bx: b.x, by: b.y });
        }
      }

      // 점. 채움이 값의 형편(저 혼자인가 · 무리에 들었나)이고, 테두리가 짚음의
      // 표식(이번에 고른 둘인가)이다.
      const holder = new Map<string, string>();
      for (const id of tree.standing) {
        for (const leaf of tree.knots.get(id)?.leaves ?? []) {
          const dot = scene.dots[leaf];
          if (dot) holder.set(dot.id, id);
        }
      }
      for (const dot of scene.dots) {
        const own = tree.knots.get(holder.get(dot.id) ?? '');
        const grouped = (own?.leaves.length ?? 1) > 1;
        const chosen = join !== null && (join.pick.from === dot.id || join.pick.to === dot.id);
        const node = el(
          'circle',
          {
            cx: s.x(dot.x),
            cy: s.y(dot.y),
            r: DOT_R,
            fill: grouped ? c.text : c.bg,
            stroke: chosen ? c.itemActive : c.text,
            'stroke-width': chosen ? 2 : 1.2,
          },
          gDots,
        );
        if (chosen) drawn.pickDots.push(node);
        label(s.x(dot.x) + 7, s.y(dot.y) - 5, dot.id, fontSizes.xs, c.textMuted, 'start', gDots);
      }

      // ── 무리 띠. 글자는 자리를 지키고 칸만 자란다.
      label(
        STRIP_X,
        STRIP_LABEL_Y,
        t('label.remaining', 'clusters left'),
        fontSizes.sm,
        c.textMuted,
        'start',
        gStrip,
      );
      label(
        STRIP_X + STRIP_W,
        STRIP_LABEL_Y,
        String(remainingOf(scene)),
        fontSizes.xl,
        c.text,
        'end',
        gStrip,
      );
      for (const id of tree.standing) {
        const knot = tree.knots.get(id);
        if (!knot) continue;
        const slot = slotOf(knot.leaves, n);
        const fresh = join !== null && id === join.nodeId;
        const rect = el(
          'rect',
          {
            x: slot.x,
            y: STRIP_Y,
            width: slot.w,
            height: STRIP_H,
            rx: radii.sm,
            fill: c.bgSubtle,
            stroke: fresh ? c.itemActive : c.border,
          },
          gChips,
        );
        if (fresh && knot.children) {
          const before = beforeTreeOf(scene);
          const left = before.knots.get(knot.children[0]);
          const right = before.knots.get(knot.children[1]);
          if (left && right) {
            drawn.fuse = {
              rect,
              fromLeft: slotOf(left.leaves, n),
              fromRight: slotOf(right.leaves, n),
              to: slot,
            };
          }
        }
      }
      for (let i = 0; i < n; i += 1) {
        const dot = scene.dots[i];
        if (!dot) continue;
        const { x } = chipGeomOf(n);
        label(
          x(i) + chipW / 2,
          STRIP_Y + STRIP_H - 4,
          dot.id,
          fontSizes.xs,
          c.text,
          'middle',
          gChipInk,
        );
      }

      // ── 높이 자와 잎
      label(
        AXIS_X,
        AXIS_LABEL_Y,
        t('label.axis', 'height = distance'),
        fontSizes.sm,
        c.textMuted,
        'start',
        gTree,
      );
      el('line', { x1: AXIS_X, y1: AXIS_TOP_Y, x2: AXIS_X, y2: BASE_Y, stroke: c.border }, gTree);
      for (let k = 0; k <= AXIS_MAX; k += 1) {
        const y = yOfHeight(k);
        el('line', { x1: AXIS_X - 4, y1: y, x2: AXIS_X, y2: y, stroke: c.border }, gTree);
        label(AXIS_X - 8, y + 4, String(k), fontSizes.xs, c.textMuted, 'end', gTree);
      }
      el('line', { x1: AXIS_X, y1: BASE_Y, x2: COL_X1, y2: BASE_Y, stroke: c.border }, gTree);
      for (let i = 0; i < n; i += 1) {
        const dot = scene.dots[i];
        if (!dot) continue;
        el('circle', { cx: colX(i), cy: BASE_Y, r: 2.4, fill: c.text }, gTree);
        label(colX(i), LEAF_LABEL_Y, dot.id, fontSizes.sm, c.text, 'middle', gTree);
      }

      // ── 자란 나무. 매듭마다 기둥 둘 · 가로대 하나 · 매듭 · 높이 · 진 후보의 눈금.
      for (let k = 0; k < scene.joins.length; k += 1) {
        const j = scene.joins[k];
        if (!j) continue;
        const knot = tree.knots.get(j.nodeId);
        const here = spots.get(j.nodeId);
        if (!knot?.children || !here) continue;
        const a = spots.get(knot.children[0]);
        const b = spots.get(knot.children[1]);
        if (!a || !b) continue;
        const lo = a.x <= b.x ? a : b;
        const hi = a.x <= b.x ? b : a;
        const newest = k === scene.joins.length - 1;
        const ink = newest ? c.itemActive : c.text;
        const width = newest ? 2 : 1.4;

        const risers = [lo, hi].map((child) =>
          el(
            'line',
            { x1: child.x, y1: child.y, x2: child.x, y2: here.y, stroke: ink, 'stroke-width': width },
            gBranches,
          ),
        );
        const bar = el(
          'line',
          { x1: lo.x, y1: here.y, x2: hi.x, y2: here.y, stroke: ink, 'stroke-width': width },
          gBranches,
        );
        const dot = el('circle', { cx: here.x, cy: here.y, r: NODE_R, fill: c.text }, gBranches);
        const tag = label(
          here.x,
          here.y - 7,
          knot.height.toFixed(2),
          fontSizes.xs,
          c.textMuted,
          'middle',
          gBranches,
        );
        tag.setAttribute('font-family', fonts.mono);

        // 그때 다음으로 가까웠던 높이. 고른 가로대가 그 아래에 나란히 서므로
        // "가장" 이 정지 화면에서도 읽힌다.
        const runner = runnerUpOf(scene, j);
        if (runner !== null) {
          const gy = yOfHeight(runner);
          const ghost = el(
            'line',
            {
              x1: lo.x,
              y1: gy,
              x2: hi.x,
              y2: gy,
              stroke: c.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '3 2',
              opacity: GHOST_OPACITY,
            },
            gBranches,
          );
          if (newest) drawn.ghost = { line: ghost, mid: here.x, left: lo.x, right: hi.x };
        }

        if (!newest) continue;
        drawn.risers = [
          { line: risers[0] as SVGLineElement, from: lo.y, to: here.y },
          { line: risers[1] as SVGLineElement, from: hi.y, to: here.y },
        ];
        drawn.bar = { line: bar, mid: here.x, left: lo.x, right: hi.x };
        drawn.knot = dot;
        drawn.tag = { node: tag, top: here.y };
      }

      // ── 맺음. 걸린 높이들이 자로 모여 벌어짐이 한 줄에 선다.
      if (scene.gathered) {
        for (const j of scene.joins) {
          const knot = tree.knots.get(j.nodeId);
          const here = spots.get(j.nodeId);
          if (!knot || !here) continue;
          const line = el(
            'line',
            { stroke: c.itemActive, 'stroke-width': 2 },
            gMarks,
          );
          placeMark(line, AXIS_X + MARK_HALF, here.y);
          drawn.marks.push({ line, fromX: here.x, toX: AXIS_X + MARK_HALF, y: here.y });
        }
      }

      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 운동은 아직 못 온
    // 만큼을 뒤로 물리는 꼴이 된다.

    /**
     * 무리쌍을 재고, 가장 가까운 둘이 그 거리만큼 올라가 걸리고, 띠의 두 칸이
     * 한 칸이 된다. 한 뜻으로 묶인 여섯 마디라 시계를 나누지 않고 차례로 잇는다.
     */
    async function flowMerge(drawn: Drawn, mine: number): Promise<void> {
      const threads = drawn.pick ? [...drawn.scan, drawn.pick] : [...drawn.scan];
      for (const th of threads) {
        th.line.setAttribute('x2', String(th.ax));
        th.line.setAttribute('y2', String(th.ay));
      }
      // 아직 고르기 전이다 — 고른 실도 후보의 차림으로 선다.
      if (drawn.pick) wearScanned(drawn.pick.line);
      for (const dot of drawn.pickDots) dot.setAttribute('stroke-width', '1.2');
      for (const riser of drawn.risers) riser.line.setAttribute('y2', String(riser.from));
      if (drawn.bar) {
        drawn.bar.line.setAttribute('x1', String(drawn.bar.mid));
        drawn.bar.line.setAttribute('x2', String(drawn.bar.mid));
      }
      drawn.knot?.setAttribute('r', '0');
      drawn.tag?.node.setAttribute('opacity', '0');
      drawn.ghost?.line.setAttribute('opacity', '0');

      // 띠의 칸은 둘에서 하나가 된다. 정적 그리기가 세운 것이 합쳐진 뒤의 한 칸이라
      // 나머지 하나를 잠깐 짓는다 — 마지막 `drawStatic` 이 통째로 거둔다.
      let ghostChip: SVGRectElement | null = null;
      if (drawn.fuse) {
        placeSlot(drawn.fuse.rect, drawn.fuse.fromLeft);
        ghostChip = el(
          'rect',
          {
            x: drawn.fuse.fromRight.x,
            y: STRIP_Y,
            width: drawn.fuse.fromRight.w,
            height: STRIP_H,
            rx: radii.sm,
            fill: c.bgSubtle,
            stroke: c.itemActive,
          },
          gChips,
        );
      }

      // 1) 남은 무리쌍을 전부 잰다 — 실이 뻗는다.
      await tween(MS_SCAN, mine, (e) => {
        for (const th of threads) {
          th.line.setAttribute('x2', String(th.ax + (th.bx - th.ax) * e));
          th.line.setAttribute('y2', String(th.ay + (th.by - th.ay) * e));
        }
      });
      if (!alive(mine)) return;

      // 2) 그중 가장 짧은 하나를 고른다 — 실이 굵어지고 두 점이 부푼다.
      if (drawn.pick) wearPicked(drawn.pick.line, true);
      for (const dot of drawn.pickDots) dot.setAttribute('stroke-width', '2');
      await tween(MS_PICK, mine, (e) => {
        const r = DOT_R + (DOT_R_ACTIVE - DOT_R) * bump(e);
        for (const dot of drawn.pickDots) dot.setAttribute('r', String(r));
      });
      if (!alive(mine)) return;

      // 3) 두 무리가 그 거리만큼 올라간다.
      await tween(MS_RISE, mine, (e) => {
        for (const riser of drawn.risers) {
          riser.line.setAttribute('y2', String(riser.from + (riser.to - riser.from) * e));
        }
      });
      if (!alive(mine)) return;

      // 4) 가로대가 가운데에서 양쪽으로 뻗어 둘을 묶는다.
      const bar = drawn.bar;
      if (bar) {
        await tween(MS_BAR, mine, (e) => {
          bar.line.setAttribute('x1', String(bar.mid - (bar.mid - bar.left) * e));
          bar.line.setAttribute('x2', String(bar.mid + (bar.right - bar.mid) * e));
        });
        if (!alive(mine)) return;
      }

      // 5) 매듭이 맺히고 높이가 뜬다. 그때 다음으로 가까웠던 눈금도 함께 선다.
      const tag = drawn.tag;
      const ghost = drawn.ghost;
      await tween(MS_CAP, mine, (e) => {
        drawn.knot?.setAttribute('r', String(NODE_R * e));
        if (tag) {
          tag.node.setAttribute('opacity', String(e));
          tag.node.setAttribute('y', String(tag.top - 2 - 5 * e));
        }
        if (ghost) {
          // 가로대와 같은 동사로 — 가운데에서 양쪽으로 뻗는다.
          ghost.line.setAttribute('opacity', String(GHOST_OPACITY * e));
          ghost.line.setAttribute('x1', String(ghost.mid - (ghost.mid - ghost.left) * e));
          ghost.line.setAttribute('x2', String(ghost.mid + (ghost.right - ghost.mid) * e));
        }
      });
      if (!alive(mine)) return;

      // 6) 띠의 두 칸이 서로에게 자라 한 칸이 된다.
      const fuse = drawn.fuse;
      if (fuse) {
        const chip = ghostChip;
        await tween(MS_FUSE, mine, (e) => {
          placeSlot(fuse.rect, {
            x: fuse.fromLeft.x + (fuse.to.x - fuse.fromLeft.x) * e,
            w: fuse.fromLeft.w + (fuse.to.w - fuse.fromLeft.w) * e,
          });
          if (chip) {
            placeSlot(chip, {
              x: fuse.fromRight.x + (fuse.to.x - fuse.fromRight.x) * e,
              w: fuse.fromRight.w + (fuse.to.w - fuse.fromRight.w) * e,
            });
          }
        });
      }
      ghostChip?.remove();
    }

    /**
     * 맺음 — 걸린 높이들이 매듭에서 떨어져 나와 자로 옮겨 붙는다.
     *
     * 벌어짐은 이미 화면에 있다. 낮은 것들은 바닥 가까이 붙어 있고 높은 것들은
     * 훌쩍 떨어져 있는데, 가로대가 저마다 다른 자리에 있어 그것이 한눈에 들어오지
     * 않는다. 표를 한 줄로 모으면 뭉친 것과 뛴 것이 그대로 드러난다.
     */
    async function flowGather(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.marks.length === 0) return;
      for (const mark of drawn.marks) placeMark(mark.line, mark.fromX, mark.y);
      // 캡션이 바뀐 것을 읽을 틈을 준다.
      await tween(MS_CAP, mine, () => {});
      if (!alive(mine)) return;
      await tween(MS_MARKS, mine, (e) => {
        for (const mark of drawn.marks) {
          placeMark(mark.line, mark.fromX + (mark.toX - mark.fromX) * e, mark.y);
        }
      });
    }

    function flowFor(scene: MergeNearestPairScene, drawn: Drawn, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'merge':
          return flowMerge(drawn, mine);
        case 'gather':
          return flowGather(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: MergeNearestPairScene,
      _prev: MergeNearestPairScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flowFor(next, drawn, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
