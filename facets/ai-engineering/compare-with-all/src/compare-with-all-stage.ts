/**
 * compare-with-all stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 무엇이 어디에 있는가
 *
 * 왼쪽은 **훑는 판**이다. 물음 하나가 가운데에 있고 후보가 호 위에 놓인다. 바늘이
 * 후보를 하나씩 돌며 짚는다 — 하나도 건너뛰지 않는다는 것이 전수 탐색의 전부다.
 * 오른쪽은 **쌓이는 더미**다. 짚은 후보마다 차원 수만큼 곱셈 알갱이가 날아와 한 줄로
 * 앉고, 그 줄이 차곡차곡 올라간다.
 *
 * ── 자는 물러서고, 마지막에는 물러서지 못한다
 *
 * 수를 키우면 더미가 천장을 넘는다. 그때 **자를 다시 잰다** — 곱셈 하나가 차지하는
 * 세로를 줄여 더미를 천장에 맞추고, 앞서 있던 줄들은 눈금으로 남아 함께 내려앉는다.
 * 우리가 손으로 센 32 는 몇 걸음 만에 바닥의 실금이 된다.
 *
 * 다만 물러서는 데에도 끝이 있다. **바로 앞 줄이 3px 아래로 눌리는 자리라면 물러서
 * 봐야 화면이 아무 말도 하지 못한다.** 그때는 자를 그대로 두고 기둥이 화면 밖으로
 * 자라게 둔다 — 천장은 톱니로 잘리고 수만 남는다. 규칙은 데이터가 정하지 사람이
 * 줄을 고르지 않는다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 그 자(`unit`)는 stage 의 `let` 이었다. 게다가 단순한 값이 아니라 **걸어온 줄 전부를
 * 접은 결과**다 — `fitUnit` 이 앞 자와 앞 줄을 함께 읽기 때문이다. 지금은 `geomOf` 가
 * 장면의 `pileRows` 를 매번 접어 낸다. 장면이 담는 것은 픽셀이 아니라 줄의 목록이고
 * 자리는 캔버스에서 역산한다 (S-piece).
 *
 * 눈금 숫자의 세로 자리도 화면에서 되읽지 않는다. 옛 `layoutGhostLabels` 는
 * `Number(g.line.getAttribute('y1'))` 로 제가 방금 쓴 값을 도로 꺼냈다 (④) — 되짚어
 * 세운 직후에는 그것이 옛 화면의 것이라 어느 숫자를 감출지가 틀어진다. 지금은 곱셈
 * 수와 자에서 곧바로 셈한다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편이다** — 후보는 아직 안 본 것 `itemDefault` · 지금 보는 것
 * `itemComparing` · 본 것 `itemSorted`. 더미는 비교가 낳은 값이므로 `itemComparing` 을
 * 그대로 잇고, **자가 더 못 물러서 화면을 벗어난 줄만 `danger`** 다 — 그것이 이 조각이
 * 말하는 실패다. 옛 화면은 머리 주석이 그렇게 적어 두고도 기둥의 칠을 끝내 바꾸지
 * 않아 실패가 톱니와 화살표에만 있었다 (이행이 고친 자리).
 *
 * **테두리는 재는 눈금이다** — 천장의 점선, 바닥의 실선, 지나온 줄의 실금, 지금 줄의
 * 표식선. 두 축을 갈라 두면 "얼마짜리 값인가" 와 "어디까지 재었나" 가 서로를 지우지
 * 않는다.
 *
 * ── destroy
 *
 * 걸어 둔 것은 `timers`, 기다리는 것은 `waiters` 두 집합에만 잔다. 취소된 tick 은 아예
 * 불리지 않으므로 `destroy` 가 기다리던 것을 직접 깨운다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  arcRow,
  captionOf,
  dotsAlive,
  grainCount,
  pileRows,
  totalOf,
  type CompareWithAllScene,
  type CompareWithAllStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정하고(PIECE_CANVAS_W), 세로는 그림이 정한다 (S-piece). */
const W = PIECE_CANVAS_W;
const H = 300;

// ── 훑는 판 ──────────────────────────────────────────────────────────────────
const QX = 62;
const QY = 152;
const ARC_R = 138;
/** 호의 반각(도). 후보는 -ARC_HALF 에서 +ARC_HALF 사이에 고르게 놓인다. */
const ARC_HALF = 50;
const ARC_LEN = ARC_R * ((ARC_HALF * 2 * Math.PI) / 180);
const BAND_W = 9;
const DOT_R = 7;
/** 바늘이 처음 서 있는 자리 — 호 밖이라 첫 걸음에 실제로 돈다. */
const SPOKE_PARK = -ARC_HALF - 16;

// ── 쌓이는 더미 ──────────────────────────────────────────────────────────────
const BASE_Y = 258;
const CEIL_Y = 44;
const CEIL_H = BASE_Y - CEIL_Y;
/**
 * 기둥과 눈금은 캔버스에서 역산한다. 상수로는 **상한**만 둔다 (S-piece "그 폭을
 * 채운다"). 절대 픽셀로 못박으면 `PIECE_CANVAS_W` 가 바뀔 때 눈금선만 제자리에
 * 남아 라벨과 어긋난다.
 */
const COL_W = Math.min(84, Math.round(W * 0.14));
const COL_X = Math.round(W * 0.46);
const LEVEL_X1 = COL_X - 10;
const LEVEL_X2 = W - 64;
const LEVEL_LABEL_X = W - 18;
/** 화면 밖으로 자란 기둥을 자르는 자리. */
const TOP_CUT = 12;
/** 자가 물러설 수 있는 한계 — 바로 앞 줄이 이보다 눌리면 물러서지 않는다. */
const MIN_GHOST_PX = 3;
/** 후보 한 줄의 높이. 곱셈 하나의 세로는 여기서 차원 수로 나눠 나온다. */
const ROW_PITCH = 18;
const TILE_GAP = 2;
/** 눈금 숫자끼리의 최소 간격. 이보다 붙으면 읽을 수 없으므로 감춘다. */
const LABEL_MIN_GAP = 13;

const CAPTION_X = 20;
const CAPTION_Y = H - 10;

const FRAME_MS = 16;
const RAD = Math.PI / 180;

// ── 걸음의 벽시계 ────────────────────────────────────────────────────────────
/** 바늘이 다음 후보로 도는 데 드는 시간. */
const SPOKE_MS = 150;
/** 알갱이 하나가 판에서 더미까지 나는 시간. */
const FLIGHT_MS = 260;
/** 알갱이끼리의 출발 간격. 차원이 한꺼번에가 아니라 하나씩 든다는 말이다. */
const FLIGHT_STAGGER = 45;
/** 낱낱이 한 기둥으로 굳는 시간. */
const FUSE_MS = 320;
/** 호가 다시 차고 더미가 자라는 시간. 한 뜻이라 한 시계로 흘린다. */
const GROW_MS = 520;
/** 천장을 넘은 뒤 눈금이 위로 흘러가는 시간. */
const BURST_MS = 420;

/**
 * 천 단위마다 쉼표. 자릿수가 네 자리를 넘는 순간 눈이 자릿수를 못 세므로
 * 화면의 모든 수가 같은 규칙을 쓴다. 캡션도 이 함수를 쓴다 — 규칙이 두 벌이 되면
 * 한 화면에서 `8192` 와 `8,192` 가 같이 뜬다.
 */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
  return node;
}

function angleAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return -ARC_HALF + (index * ARC_HALF * 2) / (count - 1);
}

function posAt(deg: number): { x: number; y: number } {
  return { x: QX + ARC_R * Math.cos(deg * RAD), y: QY + ARC_R * Math.sin(deg * RAD) };
}

function arcPath(fromDeg: number, toDeg: number): string {
  const a = posAt(fromDeg);
  const b = posAt(toDeg);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${ARC_R} ${ARC_R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function ease(p: number): number {
  return 1 - (1 - p) ** 3;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 자를 다시 잰다.
 *
 * 천장 아래면 그대로 두고, 넘치면 이 줄을 천장에 맞추는 자로 바꾼다. 다만 그렇게
 * 해서 **바로 앞 줄이 보이지 않게 될 자리**라면 물러서지 않는다 — 물러선 화면이
 * 아무 말도 못 하기 때문이다.
 */
function fitUnit(total: number, unit: number, prevTotal: number): number {
  if (total * unit <= CEIL_H) return unit;
  const wanted = CEIL_H / total;
  if (prevTotal > 0 && prevTotal * wanted < MIN_GHOST_PX) return unit;
  return wanted;
}

/**
 * 한 장면의 더미 셈. **그리기 전에 한 번에 셈하고 그 다음에 그린다** (함정 13).
 *
 * 자(`unit`)는 지나온 줄 전부를 접은 결과다 — `fitUnit` 이 앞 자와 앞 줄을 함께 읽기
 * 때문이다. 옛 stage 는 그것을 `let` 에 이어 두어 어느 걸음에서 왔는지가 화면을
 * 갈랐다. 여기서는 어느 걸음에서 오든 같은 값이 나온다.
 */
type PileGeom = {
  /** 지금 줄의 곱셈 수. 기둥의 높이와 표식의 수가 이 하나에서 나온다. */
  total: number;
  /** 앞 줄의 곱셈 수. 자라는 운동의 출발이다. 앞 줄이 없으면 0. */
  prevTotal: number;
  /** 곱셈 하나가 차지하는 세로. */
  unit: number;
  /** 앞 줄을 재던 자. 자가 물러서는 운동의 출발이다. */
  prevUnit: number;
  /** 지나온 줄의 곱셈 수 — 눈금으로 남는다. 선 차례대로. */
  ghosts: number[];
  /** 자가 더 못 물러서 기둥이 화면 밖으로 자랐나. */
  beyond: boolean;
};

function geomOf(scene: CompareWithAllScene): PileGeom {
  const rows = pileRows(scene);
  const start = ROW_PITCH / Math.max(1, scene.board.dims);
  let unit = start;
  let prevUnit = start;
  let total = 0;
  let prevTotal = 0;
  let beyond = false;
  for (const row of rows) {
    const value = totalOf(row);
    prevTotal = total;
    prevUnit = unit;
    // 첫 줄에는 물러설 까닭이 없다 — 판의 조각을 그대로 세운 높이가 그 줄이다.
    if (prevTotal > 0) unit = fitUnit(value, prevUnit, prevTotal);
    beyond = prevTotal > 0 && unit === prevUnit && value * prevUnit > CEIL_H;
    total = value;
  }
  return {
    total,
    prevTotal,
    unit,
    prevUnit,
    ghosts: rows.slice(0, -1).map(totalOf),
    beyond,
  };
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: PileGeom;
  boardG: SVGGElement;
  pileG: SVGGElement;
  flightG: SVGGElement;
  tilesG: SVGGElement;
  spoke: SVGGElement;
  /** 낱낱의 후보. 띠가 지나간 뒤에는 짓지 않으므로 빈 배열이다. */
  dots: SVGCircleElement[];
  /** 마지막으로 훑은 줄의 조각들. 날아와 앉는 자리다. */
  rowTiles: SVGRectElement[];
  /** 호를 덮은 띠. 아직 안 키웠으면 없다. */
  band: SVGPathElement | null;
  /** 굳은 더미. 아직 안 굳었으면 없다. */
  column: SVGRectElement | null;
  markLine: SVGLineElement | null;
  markText: SVGTextElement | null;
  ghostLines: SVGLineElement[];
  ghostTexts: SVGTextElement[];
};

export const compareWithAllStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CompareWithAllScene> {
    const colors = getColors(params.theme ?? 'light');
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';
    const root = el('g', {});
    canvas.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. `destroy` 가 그 가운데 오면 남은 마디가 이미
     * 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디. 건네는 `p` 는 보간되지 않은 벽시계 비율이고 완만함은 걸음이 고른다.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT). 벽시계는
     * `setTimeout` 으로 재고 rAF 를 쓰지 않는다 — 걸음이 프레임 없는 자리에서도
     * 돌아야 하기 때문이다.
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
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
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    /** 조각 하나의 자리. 행은 후보, 열은 차원이다. */
    function tileGeom(
      row: number,
      slot: number,
      dims: number,
    ): { x: number; y: number; w: number; h: number } {
      const w = (COL_W - (dims - 1) * TILE_GAP) / dims;
      const h = ROW_PITCH - TILE_GAP;
      return {
        x: COL_X + slot * (w + TILE_GAP),
        y: BASE_Y - (row + 1) * ROW_PITCH + TILE_GAP / 2,
        w,
        h,
      };
    }

    /** 바늘이 선 각도. 훑은 수가 정하고, 띠가 지나간 뒤에는 호의 끝이다. */
    function spokeDegOf(scene: CompareWithAllScene): number {
      if (!dotsAlive(scene)) return ARC_HALF;
      if (scene.swept === 0) return SPOKE_PARK;
      return angleAt(scene.swept - 1, scene.board.n);
    }

    /** 띠의 점선 간격. 후보 하나가 한 칸을 차지한다. */
    function bandDash(count: number): string {
      const period = ARC_LEN / Math.max(1, count);
      const dash = Math.max(0.4, period * 0.62);
      return `${dash.toFixed(2)} ${Math.max(0.05, period - dash).toFixed(2)}`;
    }

    function spokeTransform(deg: number): string {
      return `rotate(${deg.toFixed(2)} ${QX} ${QY})`;
    }

    // ── 그리기 밑감 ───────────────────────────────────────────────────────

    function placeColumn(column: SVGRectElement, height: number): void {
      const y = Math.max(TOP_CUT, BASE_Y - height);
      column.setAttribute('y', y.toFixed(1));
      column.setAttribute('height', Math.max(0, BASE_Y - y).toFixed(1));
    }

    /**
     * 지금 줄의 표식. 옛 화면은 이것을 `opacity` 로 숨겨 두었다가 굳을 때 켰는데,
     * 굳기 전에는 아예 짓지 않으므로 켜고 끌 것이 없다 (함정 17).
     */
    function placeMark(drawn: Drawn, value: number, y: number, beyond: boolean): void {
      const { markLine, markText } = drawn;
      if (markLine === null || markText === null) return;
      const lineY = Math.max(TOP_CUT, y);
      const ink = beyond ? colors.danger : colors.text;
      markLine.setAttribute('y1', lineY.toFixed(1));
      markLine.setAttribute('y2', lineY.toFixed(1));
      markLine.setAttribute('stroke', ink);
      markText.setAttribute('y', (lineY > 26 ? lineY - 5 : lineY + 16).toFixed(1));
      markText.setAttribute('fill', ink);
      markText.textContent = formatCount(value);
    }

    /**
     * 지나온 줄의 눈금을 자 하나로 앉힌다.
     *
     * 숫자는 서로 붙으면 감춘다. 바닥으로 내려앉은 줄은 선만 남는데, 그 선이 바닥과
     * 겹쳐 보이는 것이 이 조각이 말하려는 바다 — 숫자를 억지로 띄우면 그 자리를
     * 거짓으로 옮기게 된다. **감출지는 곱셈 수와 자에서 셈한다. 화면을 되읽지
     * 않는다** (④).
     */
    function placeGhosts(drawn: Drawn, unit: number): void {
      const rows = drawn.geom.ghosts
        .map((total, i) => ({ i, y: BASE_Y - total * unit }))
        .sort((a, b) => b.y - a.y);
      let lastY = BASE_Y - 4;
      for (const row of rows) {
        const line = drawn.ghostLines[row.i];
        const text = drawn.ghostTexts[row.i];
        if (line === undefined || text === undefined) continue;
        line.setAttribute('y1', row.y.toFixed(1));
        line.setAttribute('y2', row.y.toFixed(1));
        text.setAttribute('y', (row.y - 4).toFixed(1));
        const show = lastY - row.y >= LABEL_MIN_GAP;
        text.setAttribute('opacity', show ? '1' : '0');
        if (show) lastY = row.y;
      }
    }

    function captionText(scene: CompareWithAllScene): string {
      const caption = captionOf(scene);
      switch (caption.kind) {
        case 'none':
          return '';
        case 'sweep':
          return t('caption.sweep', 'Candidate {i} of {n} — multiplications so far: {total}.', {
            i: caption.i,
            n: formatCount(caption.n),
            total: formatCount(caption.total),
          });
        case 'fuse':
          return t('caption.fuse', 'Every candidate checked — multiplications: {total}.', {
            total: formatCount(caption.total),
          });
        case 'grow':
          return t('caption.grow', '{n} candidates × {d} dimensions — multiplications: {total}.', {
            n: formatCount(caption.n),
            d: formatCount(caption.dims),
            total: formatCount(caption.total),
          });
        case 'real':
          return t(
            'caption.real',
            '{n} documents × {d} dimensions — the pile grows past the frame: {total}.',
            {
              n: formatCount(caption.n),
              d: formatCount(caption.dims),
              total: formatCount(caption.total),
            },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────
    //
    // 장면이 말하는 것을 전부 세운다. **`step` 을 읽지 않는다** — 흘려 세우는 길과
    // 곧바로 세우는 길이 같은 화면에 이르러야 하기 때문이고, 그것은 검사가 아니라
    // 규율로만 지킬 수 있다 (S-scene).

    function rewind(): void {
      root.textContent = '';
    }

    function drawStatic(scene: CompareWithAllScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const row = arcRow(scene);
      const pileInk = geom.beyond ? colors.danger : colors.itemComparing;

      // ── 더미 쪽을 먼저 깔고 판을 그 위에 얹는다.
      const pileG = el('g', {});
      pileG.appendChild(
        el('line', {
          x1: LEVEL_X1,
          y1: CEIL_Y,
          x2: LEVEL_X2,
          y2: CEIL_Y,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        }),
      );

      const ghostG = el('g', {});
      pileG.appendChild(ghostG);
      const ghostLines: SVGLineElement[] = [];
      const ghostTexts: SVGTextElement[] = [];
      for (const total of geom.ghosts) {
        const line = el('line', {
          x1: LEVEL_X1,
          y1: BASE_Y,
          x2: LEVEL_X2,
          y2: BASE_Y,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const text = el('text', {
          x: LEVEL_LABEL_X,
          y: BASE_Y - 4,
          'text-anchor': 'end',
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        text.textContent = formatCount(total);
        ghostG.appendChild(line);
        ghostG.appendChild(text);
        ghostLines.push(line);
        ghostTexts.push(text);
      }

      // 굳기 전에는 기둥이 없다 — 숨기지 말고 짓지 않는다 (함정 17).
      let column: SVGRectElement | null = null;
      if (scene.fused) {
        column = el('rect', { x: COL_X, width: COL_W, rx: 2, fill: pileInk });
        placeColumn(column, geom.total * geom.unit);
        pileG.appendChild(column);
      }

      // 굳은 뒤에는 조각이 없다. 굳기 전에는 훑은 만큼 깔린다.
      const tilesG = el('g', {});
      pileG.appendChild(tilesG);
      const rowTiles: SVGRectElement[] = [];
      if (!scene.fused) {
        const dims = scene.board.dims;
        for (let r = 0; r < scene.swept; r += 1) {
          for (let slot = 0; slot < dims; slot += 1) {
            const cell = tileGeom(r, slot, dims);
            const tile = el('rect', {
              x: cell.x.toFixed(1),
              y: cell.y.toFixed(1),
              width: cell.w.toFixed(1),
              height: cell.h.toFixed(1),
              rx: 1.5,
              fill: colors.itemComparing,
            });
            tilesG.appendChild(tile);
            if (r === scene.swept - 1) rowTiles.push(tile);
          }
        }
      }

      pileG.appendChild(
        el('line', {
          x1: LEVEL_X1,
          y1: BASE_Y,
          x2: LEVEL_X2,
          y2: BASE_Y,
          stroke: colors.text,
          'stroke-width': 1.5,
        }),
      );

      let markLine: SVGLineElement | null = null;
      let markText: SVGTextElement | null = null;
      if (scene.fused) {
        markLine = el('line', {
          x1: LEVEL_X1,
          y1: BASE_Y,
          x2: LEVEL_X2,
          y2: BASE_Y,
          stroke: colors.text,
          'stroke-width': 1,
        });
        pileG.appendChild(markLine);
        markText = el('text', {
          x: LEVEL_LABEL_X,
          y: BASE_Y - 5,
          'text-anchor': 'end',
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        pileG.appendChild(markText);
      }

      // 자가 못 따라간 줄 — 천장이 톱니로 잘리고 기둥은 그 너머로 자란다.
      if (geom.beyond) {
        const points: string[] = [];
        for (let i = 0; i * 8 <= COL_W; i += 1) {
          points.push(`${COL_X + i * 8},${i % 2 === 0 ? TOP_CUT : TOP_CUT + 6}`);
        }
        pileG.appendChild(
          el('polyline', {
            points: points.join(' '),
            fill: 'none',
            stroke: colors.danger,
            'stroke-width': 2,
          }),
        );
        pileG.appendChild(
          el('path', {
            d: `M ${COL_X + COL_W + 18} ${TOP_CUT + 18} l 6 11 h -12 z`,
            fill: colors.danger,
          }),
        );
      }
      root.appendChild(pileG);

      // ── 훑는 판.
      const boardG = el('g', {});
      boardG.appendChild(
        el('path', {
          d: arcPath(-ARC_HALF, ARC_HALF),
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // 띠는 낱낱을 삼킨 뒤에만 선다.
      let band: SVGPathElement | null = null;
      if (!dotsAlive(scene)) {
        band = el('path', {
          d: arcPath(-ARC_HALF, ARC_HALF),
          fill: 'none',
          stroke: colors.itemSorted,
          'stroke-width': BAND_W,
          'stroke-linecap': 'butt',
          'stroke-dasharray': bandDash(row.n),
        });
        boardG.appendChild(band);
      }

      const spoke = el('g', { transform: spokeTransform(spokeDegOf(scene)) });
      spoke.appendChild(
        el('line', {
          x1: QX,
          y1: QY,
          x2: QX + ARC_R - 12,
          y2: QY,
          stroke: colors.textMuted,
          'stroke-width': 2,
        }),
      );
      boardG.appendChild(spoke);

      const dots: SVGCircleElement[] = [];
      if (dotsAlive(scene)) {
        for (let i = 0; i < scene.board.n; i += 1) {
          const at = posAt(angleAt(i, scene.board.n));
          // 채움이 값의 형편이다 — 본 것과 아직 안 본 것.
          const seen = i < scene.swept;
          const dot = el('circle', {
            cx: at.x.toFixed(1),
            cy: at.y.toFixed(1),
            r: DOT_R,
            fill: seen ? colors.itemSorted : colors.itemDefault,
            stroke: seen ? colors.itemSorted : colors.border,
            'stroke-width': 1.5,
          });
          boardG.appendChild(dot);
          dots.push(dot);
        }
      }

      // 물음. 이것 하나가 호 위의 모두와 견주어진다.
      boardG.appendChild(
        el('circle', {
          cx: QX,
          cy: QY,
          r: 10,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1.5,
        }),
      );
      root.appendChild(boardG);

      const flightG = el('g', {});
      root.appendChild(flightG);

      const caption = el('text', {
        x: CAPTION_X,
        y: CAPTION_Y,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      caption.textContent = captionText(scene);
      root.appendChild(caption);

      const drawn: Drawn = {
        geom,
        boardG,
        pileG,
        flightG,
        tilesG,
        spoke,
        dots,
        rowTiles,
        band,
        column,
        markLine,
        markText,
        ghostLines,
        ghostTexts,
      };
      if (scene.fused) {
        placeGhosts(drawn, geom.unit);
        placeMark(drawn, geom.total, BASE_Y - geom.total * geom.unit, geom.beyond);
      }
      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이 된다.

    /**
     * 후보 하나를 짚고, 차원마다 곱셈 알갱이를 더미로 보낸다.
     *
     * 알갱이 넷은 한 뜻으로 묶인 운동이라 **시계를 넷으로 나누지 않는다** — 하나의
     * `tween` 안에서 출발만 어긋나게 둔다 (함정 3).
     */
    async function flowSweep(
      scene: CompareWithAllScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const n = scene.board.n;
      const dims = scene.board.dims;
      const index = scene.swept - 1;
      if (index < 0) return;

      // 바늘의 출발은 자취 한 칸을 물려 셈한다 — `prev` 를 들추지 않는다 (S-scene).
      const fromDeg = index === 0 ? SPOKE_PARK : angleAt(index - 1, n);
      const toDeg = angleAt(index, n);

      const at = posAt(toDeg);
      const dot = drawn.dots[index];
      // 아직 날아오지 않은 조각을 뒤로 물린다.
      for (const tile of drawn.rowTiles) tile.setAttribute('opacity', '0');

      if (Math.abs(toDeg - fromDeg) >= 0.01) {
        drawn.spoke.setAttribute('transform', spokeTransform(fromDeg));
        await tween(SPOKE_MS, mine, (p) => {
          drawn.spoke.setAttribute('transform', spokeTransform(lerp(fromDeg, toDeg, ease(p))));
        });
        if (!alive(mine)) return;
      }

      // 지금 보는 것 — 채움이 값의 형편을 말한다.
      if (dot) {
        dot.setAttribute('fill', colors.itemComparing);
        dot.setAttribute('stroke', colors.itemComparing);
        dot.setAttribute('r', String(DOT_R + 2));
      }

      const beads: SVGCircleElement[] = [];
      const targets: { dx: number; dy: number; cx: number; cy: number }[] = [];
      for (let slot = 0; slot < dims; slot += 1) {
        const cell = tileGeom(index, slot, dims);
        const to = { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
        beads.push(
          el('circle', {
            cx: at.x.toFixed(1),
            cy: at.y.toFixed(1),
            r: 4,
            fill: colors.itemComparing,
            opacity: 0,
          }),
        );
        targets.push({
          dx: to.x - at.x,
          dy: to.y - at.y,
          cx: (at.x + to.x) / 2 - at.x,
          cy: Math.min(at.y, to.y) - 74 - at.y,
        });
      }
      for (const bead of beads) drawn.flightG.appendChild(bead);

      const span = (dims - 1) * FLIGHT_STAGGER + FLIGHT_MS;
      await tween(span, mine, (p) => {
        const elapsed = p * span;
        for (let slot = 0; slot < dims; slot += 1) {
          const bead = beads[slot];
          const target = targets[slot];
          const tile = drawn.rowTiles[slot];
          if (bead === undefined || target === undefined) continue;
          const raw = clamp01((elapsed - slot * FLIGHT_STAGGER) / FLIGHT_MS);
          if (raw >= 1) {
            bead.setAttribute('opacity', '0');
            // 앉았다 — 조각이 제 자리에 선다.
            tile?.removeAttribute('opacity');
            continue;
          }
          if (raw <= 0) {
            bead.setAttribute('opacity', '0');
            continue;
          }
          const q = ease(raw);
          const inv = 1 - q;
          bead.setAttribute('opacity', '1');
          bead.setAttribute(
            'transform',
            `translate(${(2 * inv * q * target.cx + q * q * target.dx).toFixed(1)} ${(
              2 * inv * q * target.cy +
              q * q * target.dy
            ).toFixed(1)})`,
          );
        }
      });
      for (const bead of beads) bead.remove();
    }

    /** 낱낱의 알갱이가 한 덩이로 굳는다. 이제부터는 높이로만 말한다. */
    async function flowFuse(
      scene: CompareWithAllScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const { column, geom } = drawn;
      if (column === null) return;

      // 굳기 전의 조각들을 되세운다 — 정적 그리기는 이미 굳은 화면이다.
      const dims = scene.board.dims;
      const grains = grainCount(scene);
      const tiles: SVGRectElement[] = [];
      for (let i = 0; i < grains; i += 1) {
        const cell = tileGeom(Math.floor(i / dims), i % dims, dims);
        const tile = el('rect', {
          x: cell.x.toFixed(1),
          y: cell.y.toFixed(1),
          width: cell.w.toFixed(1),
          height: cell.h.toFixed(1),
          rx: 1.5,
          fill: colors.itemComparing,
        });
        drawn.tilesG.appendChild(tile);
        tiles.push(tile);
      }

      const height = geom.total * geom.unit;
      await tween(FUSE_MS, mine, (p) => {
        const q = ease(p);
        placeColumn(column, height * q);
        // 표식이 기둥의 꼭대기를 타고 오른다 — 수와 높이가 한 자료다.
        placeMark(drawn, geom.total * q, BASE_Y - height * q, geom.beyond);
        const gone = Math.floor(q * tiles.length);
        for (let i = 0; i < gone; i += 1) tiles[i]?.setAttribute('opacity', '0');
      });
      for (const tile of tiles) tile.remove();
    }

    /**
     * 수를 키운다. 호가 다시 차고 더미가 자란다 — 둘이 한 뜻이라 **한 시계**로 흘린다.
     *
     * 넘치면 자가 물러서고, 물러설 수 없으면 기둥이 화면을 벗어난다.
     */
    async function flowGrow(
      scene: CompareWithAllScene,
      drawn: Drawn,
      mine: number,
      hadDots: boolean,
    ): Promise<void> {
      const { geom, band, column } = drawn;
      const row = arcRow(scene);

      // 삼켜질 알갱이는 지나간 화면의 것이라 정적 그리기에 없다. 운동이 스스로 짓고
      // 스스로 거둔다 — 멎은 화면에는 남지 않는다 (함정 27).
      const fading: SVGCircleElement[] = [];
      if (hadDots) {
        for (let i = 0; i < scene.board.n; i += 1) {
          const at = posAt(angleAt(i, scene.board.n));
          const dot = el('circle', {
            cx: at.x.toFixed(1),
            cy: at.y.toFixed(1),
            r: DOT_R,
            fill: colors.itemSorted,
            stroke: colors.itemSorted,
            'stroke-width': 1.5,
          });
          drawn.boardG.appendChild(dot);
          fading.push(dot);
        }
      }

      const dash = bandDash(row.n);
      band?.setAttribute('stroke-dasharray', dash);

      await tween(GROW_MS, mine, (p) => {
        const q = ease(p);
        const to = -ARC_HALF + 2 * ARC_HALF * q;
        band?.setAttribute('d', arcPath(-ARC_HALF, to));
        drawn.spoke.setAttribute('transform', spokeTransform(to));
        // 낱낱의 후보는 띠에 삼켜진다 — 셀 수 있던 것이 셀 수 없게 된다.
        for (const dot of fading) dot.setAttribute('r', ((1 - q) * DOT_R).toFixed(2));

        const unit = lerp(geom.prevUnit, geom.unit, q);
        const total = lerp(geom.prevTotal, geom.total, q);
        if (column !== null) placeColumn(column, total * unit);
        placeGhosts(drawn, unit);
        placeMark(drawn, total, BASE_Y - total * unit, geom.beyond);
      });
      for (const dot of fading) dot.remove();
      if (!alive(mine)) return;

      // 자가 못 따라간 줄 — 눈금이 천장 너머로 흘러간다. 톱니와 화살표는 남는
      // 표식이라 정적 그리기가 이미 세웠다.
      if (!geom.beyond) return;
      const ticks: SVGLineElement[] = [];
      for (let i = 0; i < 5; i += 1) {
        const tick = el('line', {
          x1: COL_X + 10,
          y1: TOP_CUT + 30 + i * 24,
          x2: COL_X + COL_W - 10,
          y2: TOP_CUT + 30 + i * 24,
          stroke: colors.danger,
          'stroke-width': 2,
          opacity: 0.6,
        });
        drawn.pileG.appendChild(tick);
        ticks.push(tick);
      }
      await tween(BURST_MS, mine, (p) => {
        const shift = (-72 * ease(p)).toFixed(1);
        for (const tick of ticks) tick.setAttribute('transform', `translate(0 ${shift})`);
      });
      for (const tick of ticks) tick.remove();
    }

    function flowFor(
      step: CompareWithAllStep,
      scene: CompareWithAllScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'sweep':
          return flowSweep(scene, drawn, mine);
        case 'fuse':
          return flowFuse(scene, drawn, mine);
        case 'grow':
          // 앞 장면에 낱낱이 서 있었나 — 자취에서 셈한다. 첫 키움에서만 참이다.
          return flowGrow(scene, drawn, mine, scene.grown === 1);
        case 'real':
          return flowGrow(scene, drawn, mine, scene.grown === 0);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: CompareWithAllScene,
      _prev: CompareWithAllScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
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
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
