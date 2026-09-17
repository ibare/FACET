/**
 * vote-by-neighbors stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 화면의 짜임
 *
 *   캡션
 *   왼쪽  자리판 — 이웃이 제 좌표에 앉는다. 물음점에서 살이 뻗고 고리가 자란다.
 *   오른쪽 표 상자 — 이름표마다 하나. 위에 투입구가 뚫려 있고 표가 바닥에 쌓인다.
 *
 * ── 무엇이 움직이는가
 *
 * 동사는 "불려 나와 표를 놓는다" 이다. 불린 이웃은 자리를 뜨고(유령 테두리만
 * 남는다) 호를 그리며 날아가 투입구를 지나 아래로 떨어져 표가 된다. 부름을 받지
 * 못한 이웃은 자리에서 쪼그라들어 밖으로 밀릴 뿐 상자 쪽으로 아무것도 보내지
 * 못한다.
 *
 * ── 어휘를 가른다 (자취를 남기되 섞지 않는다)
 *
 * 한 화면에 남는 자국이 둘이라 모양을 먼저 갈랐다.
 *
 *   불려 나갔다   = 자리에 **점선 테두리만** (속이 비었다) + 살이 이름표 색으로
 *                   굵어진다 + 상자에 표 딱지가 앉는다
 *   잠잠해졌다    = **속이 찬 마커가 쪼그라들어 밖으로 밀린다** + 살이 거의 사라진다
 *                   + 고리 **바깥**에 남는다
 *
 * 고리는 부름이 닿은 데까지의 거리다. 잠잠해지는 걸음에서 점선이 실선이 되어
 * **안팎을 가르는 선**이 된다 — "k 밖은 말하지 않는다" 는 이 조각의 주장이 그
 * 선 하나로 완주 화면에 남는다. 정적 그리기가 그것을 세우므로 어느 걸음으로
 * 되짚어 와도 같다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 부름이 닿은 데는 `Scene.ringR` 에, 표가 앉을 칸은 `Column.filled` 에, 표의
 * 수는 `count` 의 글자에, 불려 나갔나는 `seat.g` 의 `opacity` 0 에, 안팎이
 * 갈렸나는 `ring` 의 `stroke-dasharray` 에 있었다. 이제 `votes` · `silenced` ·
 * `decided` 가 말하고 좌표와 칠은 전부 거기서 파생된다 (`scene.ts` 참조).
 *
 * ── 좌표
 *
 * 전부 여기서 셈한다. 장면에는 점의 값과 거리라는 구조만 있고 자리는 그림의
 * 몫이다 (S-piece). **두 축의 배율을 같게 잡는 것이 이 그림의 전제다** — 거리로
 * 부르는 그림에서 축 배율이 갈리면 화면이 거짓말을 한다. 자리는 **먼저 한 번에
 * 셈하고 그 다음에 그린다.**
 *
 * 색은 전부 design-tokens 경유다 (S-view). 이름표 색은 부류 식별이므로
 * `categorical` 이고, 색판의 크기는 **바탕 점 목록 전체**에서 한 번에 센다 —
 * 지금까지 드러난 이름표 수로 정하면 무리가 늘 때 hue 간격이 통째로 갈린다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  calledOf,
  captionFor,
  hushedOf,
  isRanked,
  rankOf,
  reachAt,
  reachOf,
  slipsOf,
  tallyOf,
  winnerOf,
  type VoteByNeighborsScene,
  type VoteStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 가로는 러너가 정한다 (S-view). */
const H = 320;

const PAD = 16;
const CAPTION_Y = 22;
const PANEL_LABEL_Y = 46;
const PANEL_TOP = 56;
const SEAT_SIDE = 246;
const SEAT_INSET = 26;
const GUTTER = 28;
const MARKER_R = 11;

const BOX_BOTTOM = 248;
const PLATE_TOP = 254;
const PLATE_BOTTOM = 302;
const COL_GAP = 38;
const COL_MAX_W = 150;
const SLIP_PAD = 8;
const SLIP_GAP = 7;
const SLIP_MAX_H = 30;
const SLIT_W = 46;
const SLIT_H = 5;

const SLIT_Y = PANEL_TOP - SLIT_H / 2;
/** 호가 끝나는 자리 = 투입구. 더 높이 띄우면 패널 이름표 줄을 지운다. */
const HOVER_Y = PANEL_TOP;

/** 물음점 마커에 새겨진 표식 — 아직 이름표가 없다는 뜻. */
const UNKNOWN_MARK = '?';

const ARRIVE_MS = 340;
const ARRIVE_POP_MS = 200;
const MEASURE_STAGGER = 46;
const MEASURE_GROW = 210;
const CALL_MS = 240;
const FLY_MS = 420;
const DROP_MS = 230;
const SETTLE_MS = 200;
const HUSH_MS = 460;
const CROWN_MS = 220;
const RETURN_MS = 480;
const CROWN_POP_MS = 300;
const CROWN_HOLD_MS = 120;

/** 잠잠해진 이웃이 자리에서 밖으로 밀리는 거리 (픽셀). */
const HUSH_PUSH = 7;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 이차 베지에 한 점 — 자리에서 투입구까지 호를 그리며 날아가는 길. */
function arcPoint(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * ax + 2 * u * t * bx + t * t * cx,
    u * u * ay + 2 * u * t * by + t * t * cy,
  ];
}

/**
 * 한 번에 셈해 둔 자리.
 *
 * 장면에는 좌표가 없으므로 그릴 때마다 여기서 낸다. **그리기 전에 전부 낸다** —
 * 그리면서 이웃을 재면 순회 순서가 화면을 가른다 (S-scene 의 함정).
 */
type Layout = {
  /** 값 한 칸이 몇 픽셀인가. 두 축이 같은 값을 쓴다. */
  scale: number;
  qx: number;
  qy: number;
  /** 점마다의 화면 자리. 자리 번호가 바탕 점 목록과 같다. */
  seats: readonly { x: number; y: number }[];
  /** 바탕에 나온 순서대로의 이름표. 색판의 크기가 이 길이에서 한 번에 정해진다. */
  labels: readonly string[];
  palette: readonly string[];
  colW: number;
  /** 이름표 자리 번호마다 상자의 왼쪽 가로. */
  colXs: readonly number[];
  slipW: number;
  slipH: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  layout: Layout;
  /** 부름이 닿는 고리. 아직 아무도 안 불렀으면 짓지 않는다. */
  ring: SVGCircleElement | null;
  /** 점 자리 번호마다. 아직 재지 않았으면 전부 null. */
  spokes: readonly (SVGLineElement | null)[];
  ghosts: readonly (SVGCircleElement | null)[];
  markers: readonly (SVGGElement | null)[];
  ranks: readonly (SVGTextElement | null)[];
  queryG: SVGGElement | null;
  queryCircle: SVGCircleElement | null;
  queryMark: SVGTextElement | null;
  boxes: readonly SVGRectElement[];
  plates: readonly SVGRectElement[];
  counts: readonly SVGTextElement[];
  /** 순위 순서대로의 표 딱지. */
  slips: readonly SVGGElement[];
};

export const voteByNeighborsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<VoteByNeighborsScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
    svg.textContent = '';

    // ── 층. 그리는 순서가 곧 겹치는 순서다. 걸음마다 통째로 다시 세운다.
    const gFrame = el('g');
    const gRing = el('g');
    const gSpoke = el('g');
    const gGhost = el('g');
    const gMarker = el('g');
    const gRank = el('g');
    const gQuery = el('g');
    const gBox = el('g');
    const gSlip = el('g');
    const gFly = el('g');
    const gCaption = el('g');
    const layers = [gFrame, gRing, gSpoke, gGhost, gMarker, gRank, gQuery, gBox, gSlip, gFly, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 한 걸음이 rAF 마디를 넷까지 이어 달린다. 가운데에 `destroy` 나 다음 걸음이
     * 끼어들면 남은 마디가 **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다
     * 그리고 프레임마다 자기 번호가 아직 유효한지 보고 물러난다. `isInstant` 는
     * 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    /** 마지막 화면을 잠깐 그대로 둔다. 운동이 아니라 쉼이다. */
    function hold(ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    /** 그 장면의 자리를 한 번에 셈한다. 바탕만 쓰므로 어느 걸음에서든 같다. */
    function layoutOf(scene: VoteByNeighborsScene): Layout {
      const pts = scene.points;
      const xs = [...pts.map((p) => p.x), scene.query.x];
      const ys = [...pts.map((p) => p.y), scene.query.y];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const span = Math.max(maxX - minX, maxY - minY) || 1;
      const scale = (SEAT_SIDE - SEAT_INSET * 2) / span;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const seatCx = PAD + SEAT_SIDE / 2;
      const seatCy = PANEL_TOP + SEAT_SIDE / 2;
      const px = (x: number): number => seatCx + (x - midX) * scale;
      const py = (y: number): number => seatCy - (y - midY) * scale;

      const labels: string[] = [];
      for (const p of pts) if (!labels.includes(p.label)) labels.push(p.label);
      if (labels.length === 0) labels.push('');

      const tallyX = PAD + SEAT_SIDE + GUTTER;
      const tallyW = W - PAD - tallyX;
      const colW = Math.min(
        COL_MAX_W,
        Math.floor((tallyW - COL_GAP * (labels.length - 1)) / labels.length),
      );
      const colsW = colW * labels.length + COL_GAP * (labels.length - 1);
      const colX0 = tallyX + Math.round((tallyW - colsW) / 2);
      const colXs = labels.map((_, i) => colX0 + i * (colW + COL_GAP));

      const capacity = Math.max(1, scene.k);
      const slipH = Math.max(
        12,
        Math.min(
          SLIP_MAX_H,
          Math.floor(
            (BOX_BOTTOM - PANEL_TOP - SLIP_PAD * 2 - SLIP_GAP * (capacity - 1)) / capacity,
          ),
        ),
      );

      return {
        scale,
        qx: px(scene.query.x),
        qy: py(scene.query.y),
        seats: pts.map((p) => ({ x: px(p.x), y: py(p.y) })),
        labels,
        // 색판의 크기는 바탕 전체에서 한 번에 센다 (프로토콜 4 절 12).
        palette: categorical(Math.max(2, labels.length), 'vivid'),
        colW,
        colXs,
        slipW: colW - SLIP_PAD * 2,
        slipH,
      };
    }

    const labelIndex = (layout: Layout, label: string): number => {
      const i = layout.labels.indexOf(label);
      return i < 0 ? 0 : i;
    };
    const labelColor = (layout: Layout, label: string): string =>
      layout.palette[labelIndex(layout, label)] ?? c.itemDefault;
    const colCx = (layout: Layout, i: number): number =>
      (layout.colXs[i] ?? 0) + layout.colW / 2;
    /** 아래에서부터 쌓인다 — 표는 상자 바닥에 앉는다. */
    const slipY = (layout: Layout, slot: number): number =>
      BOX_BOTTOM - SLIP_PAD - (slot + 1) * layout.slipH - slot * SLIP_GAP;

    /** 자리에서 밖으로 밀린 만큼. 잠잠해진 이웃이 고리 바깥으로 물러나는 자리다. */
    function hushSpot(layout: Layout, index: number, e: number): { x: number; y: number } {
      const seat = layout.seats[index] ?? { x: layout.qx, y: layout.qy };
      const d = Math.hypot(seat.x - layout.qx, seat.y - layout.qy) || 1;
      return {
        x: seat.x + ((seat.x - layout.qx) / d) * HUSH_PUSH * e,
        y: seat.y + ((seat.y - layout.qy) / d) * HUSH_PUSH * e,
      };
    }

    /** 순위 숫자가 앉는 자리 — 물음점에서 그 점 쪽으로 뻗은 살의 끝. */
    function rankSpot(layout: Layout, index: number, e: number): { x: number; y: number } {
      const seat = layout.seats[index] ?? { x: layout.qx, y: layout.qy };
      const d = Math.hypot(seat.x - layout.qx, seat.y - layout.qy) || 1;
      const reach = (d + MARKER_R + 9) * e;
      return {
        x: layout.qx + ((seat.x - layout.qx) / d) * reach,
        y: layout.qy + ((seat.y - layout.qy) / d) * reach,
      };
    }

    // ── 조각 만들기 ───────────────────────────────────────────────────────

    /** 이름표를 단 알 하나. 자리에도, 날아가는 동안에도 같은 모양이다. */
    function makeToken(layout: Layout, label: string): SVGGElement {
      const g = el('g');
      const ink = labelColor(layout, label);
      g.appendChild(
        el('circle', { r: MARKER_R, fill: ink, stroke: shiftLightness(ink, -0.16), 'stroke-width': 1 }),
      );
      const letter = el('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: c.stateInk,
      });
      letter.textContent = label;
      g.appendChild(letter);
      return g;
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    function captionText(scene: VoteByNeighborsScene): string {
      const said = captionFor(scene);
      if (said === null) return '';
      switch (said.kind) {
        case 'arrive':
          return t('caption.arrive', 'A new point arrives with no label of its own.');
        case 'ranked':
          return t('caption.ranked', 'Every neighbor is measured and lined up, nearest first.');
        case 'call':
          return t(
            'caption.call',
            'Neighbor #{rank} is called out and drops a vote into box {label}.',
            { rank: said.rank, label: said.label },
          );
        case 'silenced':
          return t('caption.silenced', 'The rest cast nothing — for being far, and nothing else.');
        case 'verdict':
          return t(
            'caption.verdict',
            'Box {winner} holds more votes. The new point is labeled {winner}.',
            { winner: said.winner },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: VoteByNeighborsScene): Drawn {
      rewind();
      const layout = layoutOf(scene);
      const { qx, qy } = layout;

      // ── 두 구역의 테두리와 이름.
      gFrame.appendChild(
        el('rect', {
          x: PAD, y: PANEL_TOP, width: SEAT_SIDE, height: SEAT_SIDE, rx: 8,
          fill: 'none', stroke: c.border, 'stroke-width': 1,
        }),
      );
      const seatLabel = el('text', {
        x: PAD, y: PANEL_LABEL_Y,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      seatLabel.textContent = t('label.seats', 'Neighbors');
      gFrame.appendChild(seatLabel);

      const voteLabel = el('text', {
        x: layout.colXs[0] ?? PAD, y: PANEL_LABEL_Y,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      voteLabel.textContent = t('label.votes', 'Ballot boxes');
      gFrame.appendChild(voteLabel);

      /*
       * ── 부름이 닿는 고리.
       *
       * 아직 아무도 안 불렀으면 **짓지 않는다** — 반지름 0 짜리를 숨겨 두면 앞
       * 걸음의 속성이 함께 남는다 (프로토콜 4 절 17). 잠잠해진 뒤에는 점선이
       * 실선이 되어 안팎을 가르는 선이 된다.
       */
      const hushed = hushedOf(scene);
      let ring: SVGCircleElement | null = null;
      if (scene.votes > 0) {
        ring = el('circle', {
          cx: qx, cy: qy, r: reachOf(scene) * layout.scale,
          fill: c.bgSubtle, stroke: c.text,
          'stroke-width': scene.silenced ? 1.9 : 1,
          opacity: 0.9,
        });
        if (!scene.silenced) ring.setAttribute('stroke-dasharray', '4 4');
        gRing.appendChild(ring);
      }

      // ── 살 · 유령 · 마커 · 순위. 잰 뒤에야 살과 순위가 선다.
      const called = new Set(calledOf(scene));
      const hushedSet = new Set(hushed);
      const spokes: (SVGLineElement | null)[] = [];
      const ghosts: (SVGCircleElement | null)[] = [];
      const markers: (SVGGElement | null)[] = [];
      const ranks: (SVGTextElement | null)[] = [];

      for (let i = 0; i < scene.points.length; i += 1) {
        const point = scene.points[i];
        const seat = layout.seats[i];
        if (point === undefined || seat === undefined) {
          spokes.push(null); ghosts.push(null); markers.push(null); ranks.push(null);
          continue;
        }
        const ink = labelColor(layout, point.label);

        // 살 — 잰 적이 있어야 있다.
        if (isRanked(scene)) {
          const voted = called.has(i);
          const spoke = el('line', {
            x1: qx, y1: qy, x2: seat.x, y2: seat.y,
            stroke: voted ? shiftLightness(ink, -0.12) : c.textMuted,
            'stroke-width': voted ? 1.6 : 1,
            opacity: voted ? 1 : hushedSet.has(i) ? 0.1 : 0.55,
          });
          gSpoke.appendChild(spoke);
          spokes.push(spoke);
        } else {
          spokes.push(null);
        }

        /*
         * 불려 나간 이웃은 자리를 뜨고 **점선 테두리만** 남는다. 속이 빈 테두리와
         * 속이 찬 마커가 두 자국을 가르는 어휘다 (자취를 남기되 섞지 않는다).
         */
        if (called.has(i)) {
          const ghost = el('circle', {
            cx: seat.x, cy: seat.y, r: MARKER_R,
            fill: 'none', stroke: ink, 'stroke-width': 1,
            'stroke-dasharray': '3 3', opacity: 0.85,
          });
          gGhost.appendChild(ghost);
          ghosts.push(ghost);
          // 자리를 떴으므로 마커를 짓지 않는다 — 숨기면 앞 걸음의 변형이 남는다.
          markers.push(null);
        } else {
          ghosts.push(null);
          const marker = makeToken(layout, point.label);
          if (hushedSet.has(i)) {
            const spot = hushSpot(layout, i, 1);
            marker.setAttribute('transform', `translate(${spot.x},${spot.y}) scale(0.7)`);
            marker.setAttribute('opacity', '0.45');
          } else {
            marker.setAttribute('transform', `translate(${seat.x},${seat.y})`);
          }
          gMarker.appendChild(marker);
          markers.push(marker);
        }

        // 순위 — 잰 뒤에만 뜬다.
        if (isRanked(scene)) {
          const spot = rankSpot(layout, i, 1);
          const rank = el('text', {
            x: spot.x, y: spot.y,
            'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': fonts.mono, 'font-size': fontSizes.xs,
            fill: c.textMuted,
            // 살과 고리 위에 얹히는 자리라 배경색 테두리를 둘러 글자를 살린다.
            stroke: c.bg, 'stroke-width': 3, 'paint-order': 'stroke',
          });
          if (hushedSet.has(i)) rank.setAttribute('opacity', '0.35');
          rank.textContent = String(rankOf(scene, i));
          gRank.appendChild(rank);
          ranks.push(rank);
        } else {
          ranks.push(null);
        }
      }

      // ── 물음점. 아직 오지 않았으면 짓지 않는다.
      const winner = winnerOf(scene);
      let queryG: SVGGElement | null = null;
      let queryCircle: SVGCircleElement | null = null;
      let queryMark: SVGTextElement | null = null;
      if (scene.arrived) {
        queryG = el('g', { transform: `translate(${qx},${qy})` });
        queryCircle = el('circle', {
          r: MARKER_R + 2,
          fill: winner === null ? c.itemDefault : labelColor(layout, winner),
          stroke: winner === null ? c.text : shiftLightness(labelColor(layout, winner), -0.16),
          'stroke-width': 1.6,
        });
        if (winner === null) queryCircle.setAttribute('stroke-dasharray', '3 3');
        queryG.appendChild(queryCircle);
        queryMark = el('text', {
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700,
          fill: winner === null ? c.text : c.stateInk,
        });
        queryMark.textContent = winner === null ? UNKNOWN_MARK : winner;
        queryG.appendChild(queryMark);
        gQuery.appendChild(queryG);
      }

      // ── 표 상자. 이름표마다 하나, 위에 투입구가 뚫려 있다.
      const boxes: SVGRectElement[] = [];
      const plates: SVGRectElement[] = [];
      const counts: SVGTextElement[] = [];
      for (let i = 0; i < layout.labels.length; i += 1) {
        const label = layout.labels[i] ?? '';
        const x = layout.colXs[i] ?? 0;
        const ink = labelColor(layout, label);
        const won = winner !== null && winner === label;

        const box = el('rect', {
          x, y: PANEL_TOP, width: layout.colW, height: BOX_BOTTOM - PANEL_TOP, rx: 8,
          fill: 'none',
          stroke: won ? c.text : c.border,
          'stroke-width': won ? 2.2 : 1,
        });
        if (!won) box.setAttribute('stroke-dasharray', '5 4');
        gBox.appendChild(box);
        boxes.push(box);

        gBox.appendChild(
          el('rect', {
            x: colCx(layout, i) - SLIT_W / 2, y: SLIT_Y, width: SLIT_W, height: SLIT_H, rx: 2.5,
            fill: c.text,
          }),
        );

        const plate = el('rect', {
          x, y: PLATE_TOP, width: layout.colW, height: PLATE_BOTTOM - PLATE_TOP, rx: 8,
          fill: ink,
          stroke: won ? c.text : shiftLightness(ink, -0.16),
          'stroke-width': won ? 2.2 : 1,
        });
        gBox.appendChild(plate);
        plates.push(plate);

        const plateLetter = el('text', {
          x: x + 18, y: (PLATE_TOP + PLATE_BOTTOM) / 2,
          'dominant-baseline': 'central',
          'font-family': fonts.body, 'font-size': fontSizes.xl, 'font-weight': 700,
          fill: c.stateInk,
        });
        plateLetter.textContent = label;
        gBox.appendChild(plateLetter);

        const count = el('text', {
          x: x + layout.colW - 18, y: (PLATE_TOP + PLATE_BOTTOM) / 2,
          'text-anchor': 'end', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 700,
          fill: c.stateInk,
        });
        count.textContent = String(tallyOf(scene, label));
        gBox.appendChild(count);
        counts.push(count);
      }

      // ── 표 딱지. 순위와 거리를 달고 상자 바닥부터 쌓인다.
      const slips: SVGGElement[] = [];
      for (const cast of slipsOf(scene)) {
        const ci = labelIndex(layout, cast.label);
        const ink = labelColor(layout, cast.label);
        const slipX = (layout.colXs[ci] ?? 0) + SLIP_PAD;
        const slipTop = slipY(layout, cast.slot);
        const slip = el('g');
        slip.appendChild(
          el('rect', {
            x: slipX, y: slipTop, width: layout.slipW, height: layout.slipH, rx: 5,
            fill: shiftLightness(ink, 0.08), stroke: ink, 'stroke-width': 1.2,
          }),
        );
        slip.appendChild(
          el('circle', { cx: slipX + 17, cy: slipTop + layout.slipH / 2, r: 9, fill: c.primary }),
        );
        const badge = el('text', {
          x: slipX + 17, y: slipTop + layout.slipH / 2,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 700,
          fill: c.textInverse,
        });
        badge.textContent = String(cast.rank);
        slip.appendChild(badge);
        const dist = el('text', {
          x: slipX + layout.slipW - 12, y: slipTop + layout.slipH / 2,
          'text-anchor': 'end', 'dominant-baseline': 'central',
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
          fill: c.stateInk,
        });
        dist.textContent = cast.distance.toFixed(2);
        slip.appendChild(dist);
        gSlip.appendChild(slip);
        slips.push(slip);
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: PAD, y: CAPTION_Y,
        'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text,
      });
      caption.textContent = captionText(scene);
      gCaption.appendChild(caption);

      return {
        layout, ring, spokes, ghosts, markers, ranks,
        queryG, queryCircle, queryMark, boxes, plates, counts, slips,
      };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면에서 셈한다 — `prev` 를
    // 들추지 않는다 (S-scene).

    /** 이름표 없는 점이 위에서 내려앉는다. */
    async function flowArrive(drawn: Drawn, mine: number): Promise<void> {
      const g = drawn.queryG;
      if (g === null) return;
      const { qx, qy } = drawn.layout;
      await tween(ARRIVE_MS, mine, (p) => {
        const e = easeOut(p);
        g.setAttribute('opacity', String(e));
        g.setAttribute('transform', `translate(${qx},${qy - 30 * (1 - e)})`);
      });
      if (!alive(mine)) return;
      await tween(ARRIVE_POP_MS, mine, (p) => {
        const s = 1 + 0.22 * (1 - easeOut(p));
        g.setAttribute('transform', `translate(${qx},${qy}) scale(${s})`);
      });
    }

    /**
     * 거리를 재는 걸음 — 살이 물음점에서 뻗어 나가고 순위가 그 끝으로 실려 간다.
     *
     * 가까운 순으로 조금씩 어긋나게 뻗는다. 한 뜻으로 묶인 운동이므로 시계를
     * 나누지 않고 **한 `tween`** 안에서 아홉을 함께 흘린다 (S-scene).
     */
    function flowMeasure(
      drawn: Drawn,
      scene: VoteByNeighborsScene,
      mine: number,
    ): Promise<void> {
      const order = scene.order;
      const { qx, qy } = drawn.layout;
      const total = MEASURE_STAGGER * Math.max(0, order.length - 1) + MEASURE_GROW;
      return tween(total, mine, (p) => {
        const elapsed = p * total;
        for (let at = 0; at < order.length; at += 1) {
          const i = order[at] ?? 0;
          const seat = drawn.layout.seats[i];
          if (seat === undefined) continue;
          const e = easeOut(clamp01((elapsed - at * MEASURE_STAGGER) / MEASURE_GROW));
          const spoke = drawn.spokes[i];
          spoke?.setAttribute('opacity', e > 0 ? '0.55' : '0');
          spoke?.setAttribute('x2', String(qx + (seat.x - qx) * e));
          spoke?.setAttribute('y2', String(qy + (seat.y - qy) * e));
          const spot = rankSpot(drawn.layout, i, e);
          const rank = drawn.ranks[i];
          rank?.setAttribute('x', String(spot.x));
          rank?.setAttribute('y', String(spot.y));
          rank?.setAttribute('opacity', String(e));
        }
      });
    }

    /**
     * 불려 나와 표를 던지는 한 걸음. 이 조각의 동사가 통째로 여기 있다.
     *
     * 네 마디가 한 줄기다 — 호명 · 자리 뜨기 · 날기 · 떨어지기 · 앉기. 마디마다
     * 세대 빗장을 지나고, 끊기면 임시 알을 거두고 물러난다.
     */
    async function flowCast(
      drawn: Drawn,
      scene: VoteByNeighborsScene,
      mine: number,
    ): Promise<void> {
      const cast = slipsOf(scene)[scene.votes - 1];
      if (cast === undefined) return;
      const layout = drawn.layout;
      const seat = layout.seats[cast.index];
      if (seat === undefined) return;
      const ci = labelIndex(layout, cast.label);
      const slipNode = drawn.slips[cast.rank - 1];
      const countNode = drawn.counts[ci];
      const ghost = drawn.ghosts[cast.index];
      const spoke = drawn.spokes[cast.index];
      const ring = drawn.ring;

      // 아직 오지 않은 것들을 뒤로 물린다 — 표도 유령도 상자의 셈도.
      slipNode?.setAttribute('opacity', '0');
      ghost?.setAttribute('opacity', '0');
      if (countNode !== undefined) countNode.textContent = String(cast.tally - 1);

      // 자리에 알을 세운다. 정적 그리기는 떠난 뒤를 그리므로 여기서만 산다.
      const token = makeToken(layout, cast.label);
      token.setAttribute('transform', `translate(${seat.x},${seat.y})`);
      gFly.appendChild(token);

      // 1) 호명 — 고리가 그 이웃까지 자라고 알이 부풀어 오른다.
      //    출발 반지름은 한 걸음 앞의 장면에서 같은 함수로 낸다 (`prev` 아님).
      const from = reachAt(scene, scene.votes - 1) * layout.scale;
      const to = reachOf(scene) * layout.scale;
      await tween(CALL_MS, mine, (p) => {
        const e = easeOut(p);
        ring?.setAttribute('r', String(from + (to - from) * e));
        spoke?.setAttribute('opacity', String(0.55 + 0.45 * e));
        spoke?.setAttribute('stroke-width', String(1 + 0.6 * e));
        token.setAttribute('transform', `translate(${seat.x},${seat.y}) scale(${1 + 0.24 * e})`);
      });
      if (!alive(mine)) return void token.remove();

      // 2) 자리를 뜬다 — 점선 테두리만 남는다.
      ghost?.setAttribute('opacity', '0.85');

      // 3) 투입구까지 호를 그리며 날아간다.
      const slitX = colCx(layout, ci);
      const ctlX = (seat.x + slitX) / 2;
      const ctlY = Math.min(seat.y, HOVER_Y) - 34;
      await tween(FLY_MS, mine, (p) => {
        const e = easeInOut(p);
        const [x, y] = arcPoint(seat.x, seat.y, ctlX, ctlY, slitX, HOVER_Y, e);
        token.setAttribute('transform', `translate(${x},${y}) scale(${1.24 - 0.24 * e})`);
      });
      if (!alive(mine)) return void token.remove();

      // 4) 투입구를 지나 상자 안으로 떨어진다.
      const restY = slipY(layout, cast.slot) + layout.slipH / 2;
      await tween(DROP_MS, mine, (p) => {
        const e = easeIn(p);
        token.setAttribute('transform', `translate(${slitX},${HOVER_Y + (restY - HOVER_Y) * e})`);
      });
      token.remove();
      if (!alive(mine)) return;

      // 5) 표가 바닥에 앉는다 — 그때 상자의 셈이 하나 는다.
      slipNode?.removeAttribute('opacity');
      if (countNode !== undefined) countNode.textContent = String(cast.tally);
      if (slipNode === undefined) return;
      const cx = (layout.colXs[ci] ?? 0) + SLIP_PAD + layout.slipW / 2;
      const cy = slipY(layout, cast.slot) + layout.slipH / 2;
      await tween(SETTLE_MS, mine, (p) => {
        const k = Math.sin(Math.PI * p);
        slipNode.setAttribute(
          'transform',
          `translate(${cx},${cy}) scale(${1 + 0.06 * k},${1 - 0.22 * k}) translate(${-cx},${-cy})`,
        );
      });
    }

    /**
     * 부름을 받지 못한 이웃들 — 자리에서 쪼그라들고 밖으로 조금 밀린다.
     *
     * 같은 마디에 고리의 점선이 실선이 된다. 둘이 한 말이므로 **한 시계**다 —
     * 물러나는 것과 안팎이 갈리는 것이 같은 사건이다.
     */
    function flowHush(drawn: Drawn, scene: VoteByNeighborsScene, mine: number): Promise<void> {
      const hushed = hushedOf(scene);
      const ring = drawn.ring;
      ring?.setAttribute('stroke-dasharray', '4 4');
      return tween(HUSH_MS, mine, (p) => {
        const e = easeOut(p);
        for (const i of hushed) {
          const spot = hushSpot(drawn.layout, i, e);
          const marker = drawn.markers[i];
          marker?.setAttribute('transform', `translate(${spot.x},${spot.y}) scale(${1 - 0.3 * e})`);
          marker?.setAttribute('opacity', String(1 - 0.55 * e));
          drawn.ranks[i]?.setAttribute('opacity', String(1 - 0.65 * e));
          drawn.spokes[i]?.setAttribute('opacity', String(0.55 - 0.45 * e));
        }
        ring?.setAttribute('stroke-width', String(1 + 0.9 * e));
      });
    }

    /** 표가 많은 쪽의 이름표가 물음점으로 되돌아온다. */
    async function flowCrown(
      drawn: Drawn,
      scene: VoteByNeighborsScene,
      mine: number,
    ): Promise<void> {
      const winner = winnerOf(scene);
      if (winner === null) return;
      const layout = drawn.layout;
      const { qx, qy } = layout;
      const ci = labelIndex(layout, winner);
      const box = drawn.boxes[ci];
      const plate = drawn.plates[ci];

      // 이긴 상자의 테두리가 굵어진다. 점선을 도로 걸었다 놓아 준다.
      box?.setAttribute('stroke-dasharray', '5 4');
      await tween(CROWN_MS, mine, (p) => {
        const e = easeOut(p);
        box?.setAttribute('stroke-width', String(1 + 1.2 * e));
        plate?.setAttribute('stroke-width', String(1 + 1.2 * e));
      });
      if (!alive(mine)) return;
      box?.removeAttribute('stroke-dasharray');

      /*
       * 물음점을 아직 이름표 없는 모습으로 되돌린다 — 정적 그리기는 이미 답이
       * 붙은 뒤를 그리므로, 알이 날아와 앉아야 이름표가 붙는 순서를 여기서 되살린다.
       */
      const qc = drawn.queryCircle;
      const qm = drawn.queryMark;
      const ink = labelColor(layout, winner);
      qc?.setAttribute('fill', c.itemDefault);
      qc?.setAttribute('stroke', c.text);
      qc?.setAttribute('stroke-dasharray', '3 3');
      if (qm !== null) {
        qm.textContent = UNKNOWN_MARK;
        qm.setAttribute('fill', c.text);
      }

      const token = makeToken(layout, winner);
      const fromX = colCx(layout, ci);
      const fromY = (PLATE_TOP + PLATE_BOTTOM) / 2;
      token.setAttribute('transform', `translate(${fromX},${fromY})`);
      gFly.appendChild(token);
      const ctlX = (fromX + qx) / 2;
      const ctlY = Math.min(fromY, qy) - 96;
      await tween(RETURN_MS, mine, (p) => {
        const e = easeInOut(p);
        const [x, y] = arcPoint(fromX, fromY, ctlX, ctlY, qx, qy, e);
        token.setAttribute('transform', `translate(${x},${y})`);
      });
      token.remove();
      if (!alive(mine)) return;

      qc?.setAttribute('fill', ink);
      qc?.setAttribute('stroke', shiftLightness(ink, -0.16));
      qc?.removeAttribute('stroke-dasharray');
      if (qm !== null) {
        qm.textContent = winner;
        qm.setAttribute('fill', c.stateInk);
      }

      const g = drawn.queryG;
      if (g !== null) {
        await tween(CROWN_POP_MS, mine, (p) => {
          const s = 1 + 0.36 * Math.sin(Math.PI * p);
          g.setAttribute('transform', `translate(${qx},${qy}) scale(${s})`);
        });
      }
      if (!alive(mine)) return;
      await hold(CROWN_HOLD_MS, mine);
    }

    function flowFor(
      step: VoteStep,
      drawn: Drawn,
      scene: VoteByNeighborsScene,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'arrive':
          return flowArrive(drawn, mine);
        case 'measure':
          return flowMeasure(drawn, scene, mine);
        case 'cast':
          return flowCast(drawn, scene, mine);
        case 'hush':
          return flowHush(drawn, scene, mine);
        case 'crown':
          return flowCrown(drawn, scene, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: VoteByNeighborsScene,
      _prev: VoteByNeighborsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, next, mine);
      if (!alive(mine)) return;

      /*
       * 운동이 남긴 속성·보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
       * 관리하지 않는다 (S-scene). 정적 경로가 두 번 그려도 그 사이에 타이머도
       * 프레임도 없어 깜빡이지 않는다.
       */
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
