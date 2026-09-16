/**
 * reduce-to-known 의 그림 — 문제가 자리를 옮기는 장면.
 *
 * 왼쪽 판에 시험 시간표가 선다: 과목 카드 다섯과, 겹치는 두 과목을 묶는 괄호 여섯.
 * 오른쪽에는 **빈 자리 다섯**이 고리로 놓여 기다린다.
 *
 * 걸음마다 과목 카드가 제 줄을 떠나 빈 자리로 날아가며 좁아진다 — 카드가 곧
 * 마디가 된다. 그때 두 끝이 다 건너간 괄호는 곧게 펴져 두 마디를 잇는 선이 된다.
 * 떠난 자리에는 점선 자국이 남아 왼쪽 판이 비어 가는 것이 보인다. 마지막에 그
 * 빈 판으로 답이 돌아와 교시별 줄로 앉는다.
 *
 * ── 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showBoard()` · `seat()` · `paint()` · `readBack()`)를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 (S-scene).
 *
 * 그리는 길은 하나뿐이다 — `paint(scene, geo, motion)` 이 매 프레임 화면을 통째로
 * 다시 짓는다. `motion` 이 쉬는 값이면 그것이 곧 정지 화면이라, 흘려 세운 화면과
 * 곧바로 세운 화면이 갈릴 자리가 구조적으로 없다.
 *
 * **`prev` 는 들추지 않는다.** 이 조각의 운동은 전부 `seated` 가 말하는 자리에서
 * 출발한다. 한때 `Card.at` 이 "그 카드가 지금 어디 서 있나" 를 따로 적어 두고
 * 날아가는 운동의 출발값으로 쓰였는데 (`const from = card.at`), 되짚어 세운 직후에는
 * 그 표가 옛 화면의 것이었다.
 *
 * ── 갈라 두어 부딪히지 않게 한다
 *
 * **채움은 값** — 아직 교시가 없나(`itemDefault`), 몇 교시인가(색판의 그 색).
 * **테두리는 환원의 표식** — 아직 시간표 칸인가(옅은 테, 1), 이미 마디인가(짙은 테,
 * 1.8). 겹침도 같다: 골에 접힌 괄호는 옅고, 선이 된 것은 짙다. 한때 칠하는 순간
 * `stroke: 'none'` 으로 테두리를 지워 **건너왔다는 사실**이 색에 덮였다.
 * 날아가는 중의 `accent` 만 지나가는 강조다.
 *
 * ── 환원의 대응이 마지막 화면에 남는다
 *
 * 이 조각의 주장은 "옮겨 놓으면 아는 문제가 된다" 인데, 옮기는 운동만 보이고 끝나면
 * 남는 것은 "그래프를 색칠했다" 뿐이었다. 캡션이 걸음마다 "선이 된 겹침: {count}" 를
 * 잠깐 말했다 지웠고, 다 끝난 화면에는 무엇이 무엇이 되었는지가 없었다. 이제 판
 * 아래 셈줄이 **마디가 된 과목**과 **선이 된 겹침**을 세어 그대로 남는다. 그 수는
 * 그림과 같은 자료에서 나온다 (`seated` · `edgeIndicesAt`).
 *
 * ── 색판
 *
 * `categorical(교시 수)` 로 받는다. 교시 수는 **바탕이 정하는 수**이지 "지금까지
 * 드러난 색 수" 가 아니다 — 걸음마다 자라는 셈을 씨앗으로 쓰면 색이 하나 늘 때
 * 이미 칠한 마디의 빛깔이 통째로 갈린다.
 *
 * 세로는 이 파일이 갖는다 (S-piece). 가로는 러너가 `PIECE_CANVAS_W` 로 준다.
 *
 * ── 뒷일
 * 걸어 둔 프레임과 기다리는 약속은 집합에 담아 destroy 가 일괄로 거둔다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
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
  edgeIndicesAt,
  edgesOpenedAt,
  periodsOf,
  slotCount,
  type ReduceToKnownBoard,
  type ReduceToKnownScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 304;

const PAD = 14;
const ZONE_GAP = 46;

/** 왼쪽 판 — 시험 시간표. */
const PANEL_X = PAD;
const PANEL_W = Math.round((W - PAD * 2 - ZONE_GAP) * 0.45);
const PANEL_Y = 40;
const PANEL_H = 196;

/** 과목 카드가 서는 줄. 괄호는 카드 왼쪽의 좁은 골에 겹쳐 그린다. */
const CARD_X = PANEL_X + 62;
const CARD_W = PANEL_W - 72;
const CARD_H = 26;
const ROW_GAP = 8;
const ROW_TOP = PANEL_Y + 12;
const LANE_X = CARD_X - 12;
const LANE_GAP = 8;

/** 오른쪽 고리 — 그래프. 마디는 좁아진 카드다. */
const RING_X = PANEL_X + PANEL_W + ZONE_GAP;
const CX = RING_X + (W - PAD - RING_X) / 2;
const CY = 146;
const RING_R = 88;
const NODE_W = 92;

/** 답이 돌아와 앉는 줄. */
const PLAN_TOP = PANEL_Y + 32;
const PLAN_H = 30;
const PLAN_GAP = 12;
const SWATCH_X = PANEL_X + 14;
const SWATCH_W = 66;

/** 환원의 셈줄 — 무엇이 무엇이 되었나. 판 아래 한 줄로 남는다. */
const TALLY_Y = 258;
const CAPTION_Y = 286;

/** 아직 시간표 칸인 것과 이미 마디인 것을 테두리로 가른다. */
const EDGE_W_CARD = 1;
const EDGE_W_NODE = 1.8;
const LINK_W_GUTTER = 1.5;
const LINK_W_EDGE = 2;
const LINK_W_OPENING = 2.5;

/** 판을 세우는 걸음 — 카드가 차례로 들어오고, 다 서면 괄호가 차례로 벌어진다. */
const CARD_IN_MS = 380;
const CARD_IN_GAP = 70;
const SPREAD_MS = 240;
const SPREAD_GAP = 40;
const BOARD_MS = 4 * CARD_IN_GAP + CARD_IN_MS + 5 * SPREAD_GAP + SPREAD_MS;
/** 카드가 제 줄을 떠나 마디 자리로 건너가는 데 걸리는 시간. */
const FLY_MS = 540;
/** 칠하는 걸음 — 마디가 차례로 색을 받으며 한 번 부푼다. */
const SWELL_MS = 260;
const SWELL_GAP = 90;
const SWELL_AMP = 0.12;
/** 시간표가 돌아오는 걸음. */
const GHOST_FADE_MS = 220;
const ROW_IN_MS = 420;
const ROW_IN_GAP = 120;
const ROW_POP_MS = 240;
const ROW_POP_AMP = 0.14;

type Pt = { x: number; y: number };

function draw<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** 시계 하나를 마디별 창으로 나눈다 — 운동 둘을 시계 둘로 가르지 않기 위해서다. */
function phase(elapsedMs: number, startMs: number, durMs: number): number {
  return clamp01((elapsedMs - startMs) / durMs);
}

function pointsOf(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/** 끝에서는 보간값이 아니라 목표를 그대로 쓴다 — 부동소수 끝자리가 문자열을 가른다. */
function between(from: readonly Pt[], to: readonly Pt[], p: number): readonly Pt[] {
  if (p >= 1) return to;
  if (p <= 0) return from;
  return from.map((f, i) => {
    const t = to[i] ?? f;
    return { x: f.x + (t.x - f.x) * p, y: f.y + (t.y - f.y) * p };
  });
}

function lerpPt(from: Pt, to: Pt, p: number): Pt {
  if (p >= 1) return to;
  if (p <= 0) return from;
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
}

function rowCenterY(index: number): number {
  return ROW_TOP + index * (CARD_H + ROW_GAP) + CARD_H / 2;
}

function seatOf(index: number, count: number): Pt {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, count);
  return { x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle) };
}

/**
 * 장면이 말하는 구조에서 역산한 자리와 셈. **그리기 전에 한 번에 셈한다** —
 * 그리면서 이웃의 지금 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다.
 */
type Geo = {
  /** 과목 차례별 제 줄의 중심. */
  homes: Pt[];
  /** 과목 차례별 마디 자리. */
  seats: Pt[];
  /** 겹침 차례별 — 접힌 모양 · 골 모양 · 곧은 선. */
  collapsed: Pt[][];
  gutters: Pt[][];
  straights: Pt[][];
  /** 과목 차례별 교시. 바탕에서 한 번에 나온다. */
  periods: number[];
  /** 교시별 과목 차례. */
  rows: number[][];
  palette: readonly string[];
};

function geometryOf(board: ReduceToKnownBoard): Geo {
  const n = board.subjects.length;
  const homes = board.subjects.map((_, i) => ({ x: CARD_X + CARD_W / 2, y: rowCenterY(i) }));
  const seats = board.subjects.map((_, i) => seatOf(i, n));

  const collapsed: Pt[][] = [];
  const gutters: Pt[][] = [];
  const straights: Pt[][] = [];
  board.overlaps.forEach(([a, b], k) => {
    const ia = board.subjects.indexOf(a);
    const ib = board.subjects.indexOf(b);
    const ya = rowCenterY(ia);
    const yb = rowCenterY(ib);
    const laneX = LANE_X - k * LANE_GAP;
    const gutter: Pt[] = [
      { x: CARD_X, y: ya },
      { x: laneX, y: ya },
      { x: laneX, y: yb },
      { x: CARD_X, y: yb },
    ];
    const seatA = seats[ia] ?? { x: CX, y: CY };
    const seatB = seats[ib] ?? { x: CX, y: CY };
    const mid = (ya + yb) / 2;
    collapsed.push(gutter.map((p) => ({ x: p.x, y: mid })));
    gutters.push(gutter);
    straights.push([
      seatA,
      { x: seatA.x + (seatB.x - seatA.x) / 3, y: seatA.y + (seatB.y - seatA.y) / 3 },
      { x: seatA.x + ((seatB.x - seatA.x) * 2) / 3, y: seatA.y + ((seatB.y - seatA.y) * 2) / 3 },
      seatB,
    ]);
  });

  const periods = periodsOf(board);
  const slots = slotCount(board);
  const rows: number[][] = [];
  for (let slot = 1; slot <= slots; slot += 1) {
    rows.push(board.subjects.map((_, i) => i).filter((i) => periods[i] === slot));
  }

  return {
    homes,
    seats,
    collapsed,
    gutters,
    straights,
    periods,
    rows,
    // 색판의 크기는 바탕이 정하는 교시 수다. 걸음마다 자라는 셈을 쓰지 않는다.
    palette: categorical(Math.max(1, slots), 'vivid'),
  };
}

/**
 * 지금 흐르는 중인 것. 전부 `null`/기본이면 그것이 곧 **정지 화면**이다.
 *
 * 한 걸음의 운동은 시계 **하나**로 흐르고, 차례로 일어나는 것은 여기 담긴 배열의
 * 자리별 진행률로 갈린다. 시계를 나누면 lockstep 이 우연히 맞는 꼴이 된다.
 */
type Motion = {
  /** 카드가 판 밖에서 제 줄로 들어오는 진행. 과목 차례별 0~1. */
  entry: number[] | null;
  /** 괄호가 가운데에서 위아래로 벌어지는 진행. 겹침 차례별 0~1. */
  spread: number[] | null;
  /** 지금 마디 자리로 건너가는 과목과 그 진행. */
  flight: { index: number; e: number } | null;
  /** 한 번 부푸는 정도. 과목 차례별 0~. */
  swell: number[] | null;
  /** 시간표 줄이 왼쪽에서 들어오는 진행. 교시별 0~1. */
  rowIn: number[] | null;
  /** 떠난 자리 자국의 짙기. `null` 이면 장면이 정한다. */
  ghost: number | null;
};

const REST: Motion = {
  entry: null,
  spread: null,
  flight: null,
  swell: null,
  rowIn: null,
  ghost: null,
};

export const reduceToKnownStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ReduceToKnownScene> {
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 층. 선은 마디 아래, 자국은 그보다 아래. 글은 맨 위.
    const frame = draw('g', {});
    const ghosts = draw('g', {});
    const links = draw('g', {});
    const cardLayer = draw('g', {});
    const plan = draw('g', {});
    const textLayer = draw('g', {});
    const layers = [frame, ghosts, links, cardLayer, plan, textLayer];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장. `render` 가 불릴 때마다 오르고, 깨어난 걸음 함수는 자기 세대를
     * 확인한 뒤에만 그린다. `destroy` 도 올린다.
     *
     * `isInstant` · `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene). 실효 있는 것은 `opts.animate` 검사와 이것뿐이다.
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
     * 한 걸음의 운동을 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     *
     * 약속은 `waiters` 에 담는다 — `destroy` 가 프레임을 취소하면 콜백이 아예 안
     * 불려 약속이 영영 안 풀리고, 그러면 `await ctx.emit` 이 돌아오지 못한다
     * (S-piece MUST).
     */
    function animate(duration: number, mine: number, apply: (p: number) => void): Promise<void> {
      const paintAt = (p: number): void => {
        if (alive(mine)) apply(p);
      };
      paintAt(0);
      if (destroyed || duration <= 0) {
        paintAt(1);
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
          const p = Math.min(1, (nowMs() - startedAt) / duration);
          paintAt(p);
          if (p >= 1) {
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

    /**
     * 과목 이름은 문안이다 (C10). 호출부에 리터럴로 둬야 추출기와 대조 검사가
     * 본다 — 키를 셈해 부르면 그 문안이 검사에서 사라진다.
     */
    function nameOf(id: string): string {
      switch (id) {
        case 'language':
          return t('label.language', 'Language');
        case 'math':
          return t('label.math', 'Math');
        case 'english':
          return t('label.english', 'English');
        case 'science':
          return t('label.science', 'Science');
        case 'history':
          return t('label.history', 'History');
        default:
          return id;
      }
    }

    /** 캡션의 문안. 장면은 무엇을 말할지만 말하고 수와 이름은 여기서 셈한다 (C10). */
    function captionText(scene: ReduceToKnownScene, geo: Geo): string {
      const cap = scene.caption;
      if (cap === null) return '';
      switch (cap.kind) {
        case 'board':
          return t('caption.board', 'Exam scheduling: five subjects, six overlapping pairs.');
        case 'seat': {
          const subject = nameOf(scene.board.subjects[scene.seated - 1] ?? '');
          const opened = edgesOpenedAt(scene.board, scene.seated).length;
          return opened === 0
            ? t('caption.seat', 'A subject takes a node seat: {subject}.', { subject })
            : t(
                'caption.seatLinked',
                'A subject takes a node seat: {subject}. Overlaps turned into edges: {count}.',
                { subject, count: opened },
              );
        }
        case 'color':
          return t(
            'caption.color',
            'Now it is a problem we know — linked nodes take different colors.',
          );
        case 'schedule':
          return t('caption.schedule', 'One color is one slot. Slots needed: {total}.', {
            total: geo.rows.length,
          });
      }
    }

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    // ── 그리기. 이 함수 하나가 화면의 정본이다.

    /** 판 테두리 · 두 머리말 · 빈 자리 다섯. 바탕만으로 정해진다. */
    function drawFrame(scene: ReduceToKnownScene, geo: Geo): void {
      frame.appendChild(
        draw('rect', {
          x: PANEL_X,
          y: PANEL_Y,
          width: PANEL_W,
          height: PANEL_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );

      const left = draw('text', {
        x: PANEL_X + 2,
        y: PANEL_Y - 12,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      left.textContent = t('label.problem', 'Exam scheduling');
      frame.appendChild(left);

      const right = draw('text', {
        x: RING_X,
        y: PANEL_Y - 12,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      right.textContent = t('label.target', 'Graph coloring');
      frame.appendChild(right);

      // 빈 자리 다섯 — 옮겨 앉을 곳이 처음부터 보인다.
      scene.board.subjects.forEach((_, i) => {
        const seat = geo.seats[i];
        if (seat === undefined) return;
        frame.appendChild(
          draw('rect', {
            x: (seat.x - NODE_W / 2).toFixed(1),
            y: (seat.y - CARD_H / 2).toFixed(1),
            width: NODE_W,
            height: CARD_H,
            rx: 6,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-dasharray': '4 4',
          }),
        );
      });
    }

    /** 겹침 여섯. 두 끝이 다 건너간 것만 곧은 선이다. */
    function drawLinks(scene: ReduceToKnownScene, geo: Geo, m: Motion): void {
      if (!scene.shown) return;
      const opened = new Set(edgeIndicesAt(scene.board, scene.seated));
      const openingNow =
        m.flight === null ? new Set<number>() : new Set(edgesOpenedAt(scene.board, scene.seated));

      scene.board.overlaps.forEach((_, k) => {
        const gutter = geo.gutters[k];
        const straight = geo.straights[k];
        const collapsed = geo.collapsed[k];
        if (gutter === undefined || straight === undefined || collapsed === undefined) return;

        let pts: readonly Pt[];
        let stroke = c.textMuted;
        let width = LINK_W_GUTTER;
        if (openingNow.has(k) && m.flight !== null) {
          // 지금 펴지는 중. 지나가는 강조다.
          pts = between(gutter, straight, m.flight.e);
          stroke = c.accent;
          width = LINK_W_OPENING;
        } else if (opened.has(k)) {
          pts = straight;
          stroke = c.text;
          width = LINK_W_EDGE;
        } else if (m.spread !== null) {
          pts = between(collapsed, gutter, m.spread[k] ?? 1);
        } else {
          pts = gutter;
        }

        links.appendChild(
          draw('polyline', {
            points: pointsOf(pts),
            fill: 'none',
            stroke,
            'stroke-width': width,
          }),
        );
      });
    }

    /** 떠난 자리에 남는 점선 자국. 판이 비어 가는 것이 보인다. */
    function drawGhosts(scene: ReduceToKnownScene, geo: Geo, m: Motion): void {
      if (!scene.shown) return;
      const alpha = m.ghost ?? (scene.planned ? 0 : 1);
      if (alpha <= 0) return;
      for (let i = 0; i < scene.seated; i += 1) {
        const home = geo.homes[i];
        if (home === undefined) continue;
        const mark = draw('rect', {
          x: (home.x - CARD_W / 2).toFixed(1),
          y: (home.y - CARD_H / 2).toFixed(1),
          width: CARD_W,
          height: CARD_H,
          rx: 6,
          fill: 'none',
          stroke: c.ghostOutline,
          'stroke-dasharray': '4 4',
        });
        // 온전할 때는 속성을 아예 쓰지 않는다 — 운동이 남긴 `opacity="1"` 하나가
        // 흘려 세운 화면과 곧바로 세운 화면을 가른다.
        if (alpha < 1) mark.setAttribute('opacity', alpha.toFixed(2));
        ghosts.appendChild(mark);
      }
    }

    /**
     * 과목 카드 다섯. 건너간 것은 마디로, 아직인 것은 제 줄에.
     *
     * 채움은 값(교시), 테두리는 환원의 표식(건너왔나). 두 뜻이 한 속성에 실리지
     * 않는다.
     */
    function drawCards(scene: ReduceToKnownScene, geo: Geo, m: Motion): void {
      if (!scene.shown) return;
      scene.board.subjects.forEach((id, i) => {
        const home = geo.homes[i];
        const seat = geo.seats[i];
        if (home === undefined || seat === undefined) return;

        const flying = m.flight !== null && m.flight.index === i;
        const crossed = i < scene.seated;

        let at: Pt;
        let width: number;
        if (flying && m.flight !== null) {
          at = lerpPt(home, seat, m.flight.e);
          width = CARD_W + (NODE_W - CARD_W) * m.flight.e;
        } else if (crossed) {
          at = seat;
          width = NODE_W;
        } else if (m.entry !== null) {
          const e = m.entry[i] ?? 1;
          at = { x: -CARD_W + (home.x + CARD_W) * e, y: home.y };
          width = CARD_W;
        } else {
          at = home;
          width = CARD_W;
        }

        const slot = geo.periods[i] ?? 1;
        const painted = scene.colored && crossed;
        const group = draw('g', {});
        const swell = m.swell?.[i] ?? 0;
        const transform =
          swell === 0
            ? `translate(${at.x.toFixed(1)},${at.y.toFixed(1)})`
            : `translate(${at.x.toFixed(1)},${at.y.toFixed(1)}) scale(${(1 + swell).toFixed(3)})`;
        group.setAttribute('transform', transform);

        group.appendChild(
          draw('rect', {
            x: (-width / 2).toFixed(1),
            y: -CARD_H / 2,
            width: width.toFixed(1),
            height: CARD_H,
            rx: 6,
            fill: painted ? (geo.palette[(slot - 1) % geo.palette.length] ?? c.itemDefault) : c.itemDefault,
            stroke: flying ? c.accent : crossed ? c.text : c.border,
            'stroke-width': flying ? 2 : crossed ? EDGE_W_NODE : EDGE_W_CARD,
          }),
        );

        const label = draw('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: painted ? c.stateInk : c.text,
        });
        label.textContent = nameOf(id);
        group.appendChild(label);
        cardLayer.appendChild(group);
      });
    }

    /** 돌아온 시간표 — 색 하나가 교시 하나다. */
    function drawPlan(scene: ReduceToKnownScene, geo: Geo, m: Motion): void {
      if (!scene.planned) return;
      geo.rows.forEach((members, i) => {
        const top = PLAN_TOP + i * (PLAN_H + PLAN_GAP);
        const group = draw('g', {});
        const dx = m.rowIn === null ? 0 : (-PANEL_W - PANEL_X) * (1 - (m.rowIn[i] ?? 1));
        if (dx !== 0) group.setAttribute('transform', `translate(${dx.toFixed(1)},0)`);

        group.appendChild(
          draw('rect', {
            x: SWATCH_X,
            y: top + 3,
            width: SWATCH_W,
            height: PLAN_H - 6,
            rx: 5,
            fill: geo.palette[i % geo.palette.length] ?? c.itemDefault,
          }),
        );

        const slotLabel = draw('text', {
          x: SWATCH_X + SWATCH_W / 2,
          y: top + PLAN_H / 2 + 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: c.stateInk,
        });
        slotLabel.textContent = t('label.period', 'Slot {n}', { n: i + 1 });
        group.appendChild(slotLabel);

        const names = draw('text', {
          x: SWATCH_X + SWATCH_W + 12,
          y: top + PLAN_H / 2 + 4,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        names.textContent = members
          .map((idx) => nameOf(scene.board.subjects[idx] ?? ''))
          .join(' · ');
        group.appendChild(names);

        plan.appendChild(group);
      });
    }

    /**
     * 환원의 셈줄과 캡션. 둘 다 이 층에서 매번 새로 짓는다 — 고정 자리에 두고
     * 글자만 갈아 끼우면 재건 밖 요소가 되어 남은 속성이 화면을 가른다.
     */
    function drawText(scene: ReduceToKnownScene, geo: Geo): void {
      if (scene.shown) {
        const tally = draw('text', {
          x: W / 2,
          y: TALLY_Y,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        tally.textContent = t(
          'label.moved',
          'Subjects moved to nodes: {nodes}. Overlaps turned into edges: {edges}.',
          {
            nodes: scene.seated,
            edges: edgeIndicesAt(scene.board, scene.seated).length,
          },
        );
        textLayer.appendChild(tally);
      }

      const caption = draw('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      caption.textContent = captionText(scene, geo);
      textLayer.appendChild(caption);
    }

    /**
     * 그 장면의 화면을 통째로 세운다. `m` 이 `REST` 면 그것이 정지 화면이다.
     *
     * 층을 먼저 비우고 다시 짓는다 — 되돌릴 명령을 따로 둘 필요가 없고, 운동이
     * 남긴 속성·보간 끝자리가 함께 사라진다.
     */
    function paint(scene: ReduceToKnownScene, geo: Geo, m: Motion): void {
      for (const layer of layers) clearLayer(layer);
      drawFrame(scene, geo);
      drawGhosts(scene, geo, m);
      drawLinks(scene, geo, m);
      drawCards(scene, geo, m);
      drawPlan(scene, geo, m);
      drawText(scene, geo);
    }

    // ── 걸음의 운동. 한 걸음에 시계 하나다.

    /** 판이 선다 — 카드가 차례로 들어와 서고, 다 서면 괄호가 차례로 벌어져 문다. */
    function flowBoard(scene: ReduceToKnownScene, geo: Geo, mine: number): Promise<void> {
      return animate(BOARD_MS, mine, (p) => {
        const ms = p * BOARD_MS;
        paint(scene, geo, {
          ...REST,
          entry: scene.board.subjects.map((_, i) =>
            ease(phase(ms, i * CARD_IN_GAP, CARD_IN_MS)),
          ),
          spread: scene.board.overlaps.map((_, k) =>
            ease(
              phase(
                ms,
                4 * CARD_IN_GAP + CARD_IN_MS + k * SPREAD_GAP,
                SPREAD_MS,
              ),
            ),
          ),
        });
      });
    }

    /**
     * 과목이 제 줄을 떠나 마디 자리로 건너간다.
     *
     * 카드의 비행과 그때 펴지는 괄호는 **한 뜻**이라 한 시계로 흐른다 — 나누면
     * 겹침이 선이 되는 순간이 카드가 앉는 순간과 어긋난다.
     */
    function flowSeat(scene: ReduceToKnownScene, geo: Geo, mine: number): Promise<void> {
      const index = scene.seated - 1;
      if (index < 0) return Promise.resolve();
      return animate(FLY_MS, mine, (p) => {
        paint(scene, geo, { ...REST, flight: { index, e: ease(p) } });
      });
    }

    /** 마디가 차례로 색을 받으며 한 번 부푼다. */
    function flowColor(scene: ReduceToKnownScene, geo: Geo, mine: number): Promise<void> {
      const total = (scene.board.subjects.length - 1) * SWELL_GAP + SWELL_MS;
      return animate(total, mine, (p) => {
        const ms = p * total;
        paint(scene, geo, {
          ...REST,
          swell: scene.board.subjects.map(
            (_, i) => Math.sin(phase(ms, i * SWELL_GAP, SWELL_MS) * Math.PI) * SWELL_AMP,
          ),
        });
      });
    }

    /** 자국이 걷히고 그 자리로 시간표 줄이 들어와 앉으며 제 마디를 짚는다. */
    function flowPlan(scene: ReduceToKnownScene, geo: Geo, mine: number): Promise<void> {
      const rows = geo.rows;
      const total = Math.max(
        GHOST_FADE_MS,
        (rows.length - 1) * ROW_IN_GAP + ROW_IN_MS + ROW_POP_MS,
      );
      return animate(total, mine, (p) => {
        const ms = p * total;
        const swell = scene.board.subjects.map(() => 0);
        rows.forEach((members, i) => {
          const amp =
            Math.sin(phase(ms, i * ROW_IN_GAP + ROW_IN_MS, ROW_POP_MS) * Math.PI) * ROW_POP_AMP;
          for (const idx of members) swell[idx] = amp;
        });
        paint(scene, geo, {
          ...REST,
          ghost: 1 - ease(phase(ms, 0, GHOST_FADE_MS)),
          rowIn: rows.map((_, i) => ease(phase(ms, i * ROW_IN_GAP, ROW_IN_MS))),
          swell,
        });
      });
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 일어난 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: ReduceToKnownScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: ReduceToKnownScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const geo = geometryOf(next.board);
      paint(next, geo, REST);

      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step === null) return;

      if (step.kind === 'board') await flowBoard(next, geo, mine);
      else if (step.kind === 'seat') await flowSeat(next, geo, mine);
      else if (step.kind === 'color') await flowColor(next, geo, mine);
      else await flowPlan(next, geo, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리와 지나가는 강조를 거두고 그 장면을 통째로 다시
      // 세운다. 속성을 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도
      // 프레임도 없어 페인트가 끼지 않는다.
      paint(next, geo, REST);
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
