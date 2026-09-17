/**
 * bagging-sample-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 화면의 짜임
 *
 *   캡션
 *   주머니       원본 여덟. 빈 점선 홈 위에 번호 타일이 얹힌다.
 *   눈금         타일 아래. 지금 벌에서 그 번호가 몇 번 나왔나.
 *   벌 셋        배지 · 여덟 칸 · 남은 것 자리 · 남은 비율.
 *
 * 화면의 동사는 **왕복**이다. 번호 타일 하나가 주머니에서 떠올라 아래 벌의 빈
 * 칸으로 날아가 **복제본을 남기고 제자리로 되돌아온다.** 떠난 동안 점선 홈이
 * 드러나고 되돌아오면 다시 메워진다 — 그 메워짐이 "도로 넣는다" 의 증거다.
 *
 * ── 어휘를 가른다 — 셋이 한 화면에 함께 선다
 *
 * 이 조각은 **뽑힌 것 · 여러 번 뽑힌 것 · 한 번도 안 뽑힌 것** 셋을 한 화면에
 * 세워야 한다. 뜻이 셋이므로 축을 가른다 (프로토콜 4 절 23 · 29).
 *
 * - **채움 = 값의 형편** — 주머니 타일은 이 벌에서 나왔는가(옅은 벌 색) 아닌가
 *   (바탕색), 날고 있는가(`itemActive`). 벌의 칸은 찼는가(벌 색) 비었는가(없음).
 * - **테두리 = 표식** — 벌의 칸이 **또 나온 번호**를 담으면 `accent` 로 굵어지고,
 *   주머니 타일이 **한 번도 안 나온 것으로 드러나면** 같은 `accent` 로 굵어진다.
 *   표식을 같은 색으로 두는 것은 둘이 한 사실의 양면이기 때문이다 — 이것이 두 번
 *   나온 탓에 저것이 한 번도 안 나온다. 같은 표식이 그 짝을 보인다.
 * - **눈금(점)** 은 제 축이다 — 몇 번 나왔나.
 *
 * 옛 화면은 주머니 타일의 **채움 하나에 넷**(`idle`·`flying`·`drawn`·`leftOut`)을
 * 실었다. "나왔나" 와 "한 번도 안 나왔다" 가 같은 축에서 서로를 지웠다.
 *
 * ── 이행이 고친 것 — 세 벌의 자취가 완주 화면에 남는다
 *
 * 옛 `beginSet(s)` 는 새 벌이 시작될 때 주머니 눈금을 통째로 지웠다. "여러 번
 * 뽑혔다" 가 벌마다 사라져 **완주 화면에는 마지막 벌의 눈금만** 남았다. 지금은 또
 * 나온 자리가 **벌의 칸에 표식으로** 남으므로 세 벌이 각자 제 자취를 지닌다
 * (프로토콜 4 절 7).
 *
 * ── 좌표
 *
 * 전부 여기서 셈한다. 장면에는 주머니의 번호와 벌마다 뽑은 순서라는 구조만 있고
 * 자리는 그림의 몫이다 (S-piece). 격자의 척도(`geomOf`)도 바탕 자료에서 매번 새로
 * 낸다 — 옛 `let cols`·`cellW`·`tileW`·`rowPitch` 가 화면의 모든 좌표를 쥐고
 * 있던 자리다. 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고 세로만 여기
 * 둔다. 색은 전부 design-tokens 경유다 (S-view).
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
  captionFor,
  countsIn,
  currentSet,
  drawsIn,
  leftOutIn,
  positionAt,
  ratioIn,
  repeatedIn,
  type BaggingSampleScene,
  type BaggingStep,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

// ── 자리 잡기 ────────────────────────────────────────────────────────────
// 폭은 캔버스에서 역산한다. 상수는 상한만 준다 (S-piece).

const W = PIECE_CANVAS_W;
const SIDE = 10;
/** 왼쪽 열 — 주머니 라벨과 벌 배지가 선다. */
const GUTTER_W = 46;
const GRID_GAP = 12;
/** 남은 것을 담는 오른쪽 자리. */
const TRAY_W = 92;
const TRAY_GAP = 8;
const RATIO_W = 44;
const CELL_MAX_W = 56;
const TILE_H = 34;
/** 칸과 타일 사이의 숨. cellW 에서 이만큼 뺀 것이 타일 폭이다. */
const TILE_INSET = 7;

const CAP_Y = 18;
const POOL_Y = 32;
const TALLY_Y = POOL_Y + TILE_H + 12;
const ROW_Y0 = 98;
const ROW_PITCH_MAX = 46;
const BOTTOM_PAD = 12;
/** 벌 셋을 담는 세로. 넘치면 줄 간격을 좁힌다. */
const STAGE_H = ROW_Y0 + ROW_PITCH_MAX * 2 + TILE_H + BOTTOM_PAD;

const BADGE_W = 26;
const BADGE_H = 22;
const TRAY_TILE_MAX = 24;
const TRAY_TILE_H = 22;
const TRAY_TILE_GAP = 4;
const DOT_R = 2.6;
const DOT_PITCH = 7.5;

/** 평소 테두리와 **표식** 테두리의 굵기. 굵은 쪽이 짚음·겹침을 말한다. */
const EDGE_W = 1.4;
const MARK_W = 2.6;

const DASH_EMPTY = '3 3';
const DASH_LEFT_OUT = '3 2';

// ── 걸음의 길이 ──────────────────────────────────────────────────────────
// 걸음 하나는 이 애니메이션 + stepMs 다. 왕복이 보이는 최소로 잡았다.

const OUT_MS = 165;
const SETTLE_MS = 35;
const BACK_MS = 145;
const LEFT_HOLD_MS = 140;
const TRAY_MS = 240;
/** 마지막 걸음 — 벌 셋의 남은 비율을 차례로 짚어 견준다. */
const DONE_MS = 300;
const DONE_LIFT = 5;
const FRAME_MS = 16;
/** 날아오를 때의 활 높이. */
const ARC_UP = 16;

const gridLeft = SIDE + GUTTER_W + GRID_GAP;
const ratioRight = W - SIDE;
const ratioLeft = ratioRight - RATIO_W;
const trayRight = ratioLeft - TRAY_GAP;
const trayLeft = trayRight - TRAY_W;
const gridRight = trayLeft - GRID_GAP;
const gridSpan = gridRight - gridLeft;

/**
 * 격자의 척도. **바탕 자료만으로 정해진다.**
 *
 * 옛 stage 는 이것을 `build` 에서 한 번 셈해 `let` 넷에 적어 두었고 화면의 모든
 * 좌표가 거기서 나왔다. 지금은 매번 낸다 — 같은 바탕이면 같은 값이다.
 */
type Geom = {
  cellW: number;
  tileW: number;
  rowPitch: number;
  /** 격자의 왼 끝. 남는 폭을 좌우로 나눠 가운데 세운다. */
  gridX: number;
};

function geomOf(base: { pool: readonly number[]; sets: readonly (readonly number[])[] }): Geom {
  const cols = Math.max(1, base.pool.length, ...base.sets.map((row) => row.length));
  const cellW = Math.min(CELL_MAX_W, Math.floor(gridSpan / cols));
  const rowsSpan = STAGE_H - BOTTOM_PAD - ROW_Y0 - TILE_H;
  return {
    cellW,
    tileW: Math.max(12, cellW - TILE_INSET),
    rowPitch:
      base.sets.length > 1
        ? Math.min(ROW_PITCH_MAX, Math.floor(rowsSpan / (base.sets.length - 1)))
        : ROW_PITCH_MAX,
    gridX: gridLeft + Math.round((gridSpan - cellW * cols) / 2),
  };
}

function tileX(geom: Geom, i: number): number {
  return geom.gridX + i * geom.cellW + Math.round((geom.cellW - geom.tileW) / 2);
}

function rowTop(geom: Geom, s: number): number {
  return ROW_Y0 + s * geom.rowPitch;
}

function attr(node: Element, map: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(map)) node.setAttribute(k, String(v));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  map: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  attr(node, map);
  return node;
}

/** 시작과 끝을 눅인 가속. 왕복이 툭 끊기지 않게 한다. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 비율을 백분율 표기로. 0.25 → "25", 0.34360891 → "34.4". */
function percent(x: number): string {
  return String(Math.round(x * 1000) / 10);
}

/** 주머니 타일의 채움 — **값의 형편** 하나만 말한다. 표식은 테두리에 있다. */
type TileFill = 'empty' | 'drawn' | 'flying';

/**
 * 벌의 식별 색 (S-view 결정 트리 3 — categorical).
 *
 * 수를 **바탕의 벌 수**에서 잡으므로 걸음이 나아가도 hue 간격이 갈리지 않는다
 * (프로토콜 4 절 12). 이 시드를 다른 view 가 같은 뜻으로 재현할 일이 없어 인덱스는
 * view-local 이다.
 */
function inksOf(scene: BaggingSampleScene): readonly string[] {
  return categorical(Math.max(1, scene.sets.length), 'vivid');
}

type Tile = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };
type Slot = { rect: SVGRectElement; text: SVGTextElement };
/** 남은 것의 복제본. `dx`/`dy` 는 주머니의 제 자리까지의 거리 — 운동의 출발이다. */
type TrayTile = { g: SVGGElement; dx: number; dy: number };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  tiles: Tile[];
  tallies: SVGGElement[];
  slots: Slot[][];
  trays: TrayTile[][];
  trayGroups: SVGGElement[];
  ratios: SVGTextElement[];
};

export const baggingSampleStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BaggingSampleScene> {
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const canvas = params.canvas;
    // 러너가 붙여 준 캔버스는 그대로 두고 **안쪽만** 비운다 (S-view).
    canvas.textContent = '';

    // ── 층. 그리는 순서가 곧 겹치는 순서다. 걸음마다 통째로 다시 세운다.
    const gCaption = el('g');
    const gHoles = el('g');
    const gTally = el('g');
    const gPool = el('g');
    const gRows = el('g');
    const gFlight = el('g');
    const layers = [gCaption, gHoles, gTally, gPool, gRows, gFlight];
    for (const g of layers) canvas.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 왕복 하나가 타이머를 세 번 지난다. 가운데에 되짚기나 `destroy` 가 끼어들면
     * 남은 마디가 **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 멈춤. 걸어 둔 타이머는 `timers`, 기다리는 약속은 `waiters` 에 담아
     * `destroy` 가 일괄로 거두고 **깨운다** (S-piece).
     */
    function wait(ms: number, mine: number): Promise<void> {
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

    /**
     * 운동은 `setTimeout` 으로 흐른다. rAF 가 아닌 까닭은 검사 때문이다 — 프레임이
     * 돌지 않는 환경에서는 "흘려 세운 화면" 과 "곧바로 세운 화면" 이 같아지는 것이
     * 당연해져 검사가 이빨을 잃는다.
     */
    function tween(
      duration: number,
      eased: boolean,
      mine: number,
      draw: (e: number) => void,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 마디가 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : Math.min(1, (Date.now() - started) / duration);
          draw(eased ? ease(p) : p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 칠하기. 정적 그리기와 운동이 함께 쓴다 ────────────────────────────

    /**
     * 주머니 타일 하나.
     *
     * `fill` 은 **값의 형편**(이 벌에서 나왔나 · 날고 있나), `mark` 는 **표식**
     * (한 번도 안 나온 것으로 드러났나)이다. 두 축이 서로를 지우지 않는다.
     */
    function paintTile(tile: Tile, fill: TileFill, mark: boolean, ink: string): void {
      // 세 값을 먼저 정하고 한 번에 쓴다 — 화면을 도로 읽어 다음 칠을 정하지 않는다.
      const body =
        fill === 'flying'
          ? { bg: c.itemActive, edge: shiftLightness(c.itemActive, -0.14), ink: c.stateInk }
          : fill === 'drawn'
            ? { bg: shiftLightness(ink, 0.22), edge: ink, ink: c.text }
            : { bg: c.bg, edge: c.border, ink: c.text };
      attr(tile.rect, {
        fill: body.bg,
        stroke: mark ? c.accent : body.edge,
        'stroke-width': mark ? MARK_W : EDGE_W,
        'stroke-dasharray': 'none',
      });
      tile.text.setAttribute('fill', body.ink);
    }

    /** 타일 아래 눈금 — 이 벌에서 그 번호가 몇 번 나왔나. 제 축이다. */
    function paintTally(
      node: SVGGElement,
      geom: Geom,
      i: number,
      count: number,
      ink: string,
    ): void {
      node.textContent = '';
      if (count <= 0) return;
      const cx = tileX(geom, i) + geom.tileW / 2;
      const cap = Math.max(1, Math.floor((geom.tileW - 4) / DOT_PITCH));
      if (count > cap) {
        // 점으로 담기지 않는 수는 숫자로 말한다. 잘라 보이면 화면이 거짓이 된다.
        const label = el('text', {
          x: cx,
          y: TALLY_Y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: ink,
        });
        // 곱셈 표기라 표식이다 (C10 표식 판정 3).
        label.textContent = `×${count}`;
        node.appendChild(label);
        return;
      }
      const span = (count - 1) * DOT_PITCH;
      for (let k = 0; k < count; k += 1) {
        node.appendChild(
          el('circle', {
            cx: cx - span / 2 + k * DOT_PITCH,
            cy: TALLY_Y,
            r: DOT_R,
            fill: ink,
          }),
        );
      }
    }

    /** 아직 안 찬 칸 — 점선 홈. */
    function emptySlot(slot: Slot): void {
      attr(slot.rect, {
        fill: 'none',
        stroke: c.border,
        'stroke-width': EDGE_W,
        'stroke-dasharray': DASH_EMPTY,
      });
      slot.text.textContent = '';
    }

    /**
     * 찬 칸. 채움은 그 벌의 색이고, 테두리는 **또 나왔다는 표식**이다.
     *
     * 이 표식이 완주 화면까지 남아 "도로 넣기 때문에 같은 것이 또 나온다" 를 세 벌
     * 모두에서 말한다.
     */
    function fillSlot(slot: Slot, value: number, ink: string, repeated: boolean): void {
      attr(slot.rect, {
        fill: ink,
        stroke: repeated ? c.accent : ink,
        'stroke-width': repeated ? MARK_W : EDGE_W,
        'stroke-dasharray': 'none',
      });
      slot.text.setAttribute('fill', c.stateInk);
      // 뽑힌 번호 — 수 표기라 표식이다 (C10 표식 판정 3).
      slot.text.textContent = String(value);
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /**
     * 그 벌이 남긴 것의 복제본을 오른쪽 자리에 세운다.
     *
     * 아직 드러나지 않은 벌에는 **아무것도 짓지 않는다** — 숨겨 두면 앞 걸음의
     * 자리와 칠이 함께 남는다 (프로토콜 4 절 17 · 27).
     */
    function buildTray(
      host: SVGGElement,
      scene: BaggingSampleScene,
      geom: Geom,
      s: number,
      ink: string,
    ): TrayTile[] {
      const indices = leftOutIn(scene, s);
      const count = indices.length;
      if (count === 0) return [];
      const tw = Math.max(
        10,
        Math.min(
          TRAY_TILE_MAX,
          Math.floor((TRAY_W - TRAY_TILE_GAP * (count - 1)) / count),
        ),
      );
      const total = count * tw + TRAY_TILE_GAP * (count - 1);
      const startX = trayLeft + Math.round((TRAY_W - total) / 2);
      const ty = rowTop(geom, s) + Math.round((TILE_H - TRAY_TILE_H) / 2);
      const out: TrayTile[] = [];
      for (let k = 0; k < count; k += 1) {
        const x = startX + k * (tw + TRAY_TILE_GAP);
        const g = el('g');
        // 점선 테두리 = 여기 남았다는 표식. 채움은 비어 있다.
        g.appendChild(
          el('rect', {
            x,
            y: ty,
            width: tw,
            height: TRAY_TILE_H,
            rx: 4,
            fill: c.bg,
            stroke: ink,
            'stroke-width': EDGE_W,
            'stroke-dasharray': DASH_LEFT_OUT,
          }),
        );
        const label = el('text', {
          x: x + tw / 2,
          y: ty + TRAY_TILE_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        // 남은 번호 — 수 표기라 표식이다 (C10 표식 판정 3).
        label.textContent = String(scene.pool[indices[k]]);
        g.appendChild(label);
        host.appendChild(g);
        // 주머니의 제 자리에서 내려온다. 출발 그림도 셈에서 나온다 — DOM 을
        // 되읽지도, `prev` 를 들추지도 않는다 (S-scene).
        const srcX = tileX(geom, indices[k]) + (geom.tileW - tw) / 2;
        const srcY = POOL_Y + (TILE_H - TRAY_TILE_H) / 2;
        out.push({ g, dx: srcX - x, dy: srcY - ty });
      }
      return out;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: BaggingSampleScene): Drawn {
      rewind();
      const geom = geomOf({ pool: scene.pool, sets: scene.sets });
      const inks = inksOf(scene);
      const cur = currentSet(scene);
      const curInk = cur === null ? c.text : inks[cur] ?? c.text;
      const curCounts = cur === null ? [] : countsIn(scene, cur);
      const curLeft = cur === null ? [] : leftOutIn(scene, cur);

      const drawn: Drawn = {
        tiles: [],
        tallies: [],
        slots: [],
        trays: [],
        trayGroups: [],
        ratios: [],
      };

      // ── 라벨 둘. 주머니와 남은 것 자리의 머리말.
      const poolLabel = el('text', {
        x: SIDE + GUTTER_W / 2,
        y: POOL_Y + TILE_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      poolLabel.textContent = t('label.pool', 'Data');
      gRows.appendChild(poolLabel);

      const trayLabel = el('text', {
        x: trayLeft + TRAY_W / 2,
        y: POOL_Y + TILE_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      trayLabel.textContent = t('label.leftOut', 'Left out');
      gRows.appendChild(trayLabel);

      // ── 주머니 — 빈 홈과 그 위의 타일, 그리고 눈금.
      for (let i = 0; i < scene.pool.length; i += 1) {
        const x = tileX(geom, i);
        gHoles.appendChild(
          el('rect', {
            x,
            y: POOL_Y,
            width: geom.tileW,
            height: TILE_H,
            rx: 5,
            fill: 'none',
            stroke: c.border,
            'stroke-width': EDGE_W,
            'stroke-dasharray': DASH_EMPTY,
          }),
        );

        const g = el('g');
        const rect = el('rect', {
          x,
          y: POOL_Y,
          width: geom.tileW,
          height: TILE_H,
          rx: 5,
        });
        const text = el('text', {
          x: x + geom.tileW / 2,
          y: POOL_Y + TILE_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        // 주머니의 번호 — 수 표기라 표식이다 (C10 표식 판정 3).
        text.textContent = String(scene.pool[i]);
        g.appendChild(rect);
        g.appendChild(text);
        gPool.appendChild(g);

        const tile: Tile = { g, rect, text };
        const count = curCounts[i] ?? 0;
        paintTile(tile, count > 0 ? 'drawn' : 'empty', curLeft.includes(i), curInk);
        drawn.tiles.push(tile);

        const tally = el('g');
        gTally.appendChild(tally);
        paintTally(tally, geom, i, count, curInk);
        drawn.tallies.push(tally);
      }

      // ── 벌 — 배지 · 칸들 · 남은 것 자리 · 비율.
      for (let s = 0; s < scene.sets.length; s += 1) {
        const top = rowTop(geom, s);
        const ink = inks[s] ?? c.text;
        const row = scene.sets[s];
        const filled = drawsIn(scene, s);
        const repeated = repeatedIn(scene, s);

        gRows.appendChild(
          el('rect', {
            x: SIDE + (GUTTER_W - BADGE_W) / 2,
            y: top + (TILE_H - BADGE_H) / 2,
            width: BADGE_W,
            height: BADGE_H,
            rx: 6,
            fill: ink,
          }),
        );
        const badge = el('text', {
          x: SIDE + GUTTER_W / 2,
          y: top + TILE_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.stateInk,
        });
        // 벌 번호 — 수 표기라 표식이다 (C10 표식 판정 3).
        badge.textContent = String(s + 1);
        gRows.appendChild(badge);

        const slots: Slot[] = [];
        for (let k = 0; k < row.length; k += 1) {
          const x = tileX(geom, k);
          const rect = el('rect', {
            x,
            y: top,
            width: geom.tileW,
            height: TILE_H,
            rx: 5,
          });
          const text = el('text', {
            x: x + geom.tileW / 2,
            y: top + TILE_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
          });
          gRows.appendChild(rect);
          gRows.appendChild(text);
          const slot: Slot = { rect, text };
          if (k < filled) fillSlot(slot, row[k], ink, repeated[k]);
          else emptySlot(slot);
          slots.push(slot);
        }
        drawn.slots.push(slots);

        const trayGroup = el('g');
        gRows.appendChild(trayGroup);
        drawn.trayGroups.push(trayGroup);
        drawn.trays.push(buildTray(trayGroup, scene, geom, s, ink));

        const shown = s < scene.revealed;
        const ratio = el('text', {
          x: ratioRight,
          y: top + TILE_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: shown ? c.text : c.textMuted,
          'font-weight': scene.done ? 600 : 400,
        });
        // 백분율 표기라 표식이다 (C10 표식 판정 3).
        ratio.textContent = shown ? `${percent(ratioIn(scene, s))}%` : '';
        gRows.appendChild(ratio);
        drawn.ratios.push(ratio);
      }

      drawCaption(scene);
      return drawn;
    }

    /** 캡션. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: BaggingSampleScene): void {
      const node = el('text', {
        x: SIDE,
        y: CAP_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      const say = captionFor(scene);
      if (say !== null) {
        switch (say.kind) {
          case 'setBegin':
            node.textContent = t(
              'caption.setBegin',
              'Bag {set}: draw one and put it back, {k} times.',
              { set: say.set, k: say.k },
            );
            break;
          case 'draw':
            node.textContent = t(
              'caption.draw',
              'Drawn, copied into the bag, then put back: {value}',
              { value: say.value },
            );
            break;
          case 'drawAgain':
            node.textContent = t('caption.drawAgain', 'Put back, so out it comes again: {value}', {
              value: say.value,
            });
            break;
          case 'leftOut':
            node.textContent = t('caption.leftOut', 'What never came out stays behind: {values}', {
              values: say.values.join(', '),
            });
            break;
          case 'done':
            node.textContent = t(
              'caption.done',
              'Every bag leaves out something different. The chance of never being drawn is {theory}%.',
              { theory: percent(say.theory) },
            );
            break;
        }
      }
      gCaption.appendChild(node);
    }

    // ── 운동. 정적 그리기가 정본이므로 **아직 오지 않은 만큼을 되돌린다** ──

    /**
     * 왕복 — 하나가 떠올라 칸에 복제본을 남기고 제자리로 돌아온다.
     *
     * 정적 그리기는 이미 칸을 채우고 눈금을 올려 두었으므로, 시작에서 그 마지막
     * 한 몫을 되물린다: 칸을 비우고 눈금을 한 점 덜고 타일을 나는 칠로 바꾼다.
     */
    async function flowDraw(
      drawn: Drawn,
      scene: BaggingSampleScene,
      geom: Geom,
      mine: number,
    ): Promise<void> {
      const pos = positionAt(scene, scene.draws - 1);
      if (pos === null) return;
      const row = scene.sets[pos.set];
      const value = row[pos.slot];
      const poolIndex = scene.pool.indexOf(value);
      const tile = drawn.tiles[poolIndex];
      const slot = drawn.slots[pos.set]?.[pos.slot];
      if (tile === undefined || slot === undefined) return;

      const ink = inksOf(scene)[pos.set] ?? c.text;
      const count = countsIn(scene, pos.set)[poolIndex] ?? 1;
      const repeated = repeatedIn(scene, pos.set)[pos.slot] ?? false;

      const dx = tileX(geom, pos.slot) - tileX(geom, poolIndex);
      const dy = rowTop(geom, pos.set) - POOL_Y;

      emptySlot(slot);
      paintTally(drawn.tallies[poolIndex], geom, poolIndex, count - 1, ink);
      paintTile(tile, 'flying', false, ink);
      gFlight.appendChild(tile.g);

      // 뽑혀 나간다 — 주머니에 점선 홈이 드러난다.
      await tween(OUT_MS, true, mine, (e) => {
        const lift = -ARC_UP * Math.sin(Math.PI * e);
        tile.g.setAttribute('transform', `translate(${dx * e} ${dy * e + lift})`);
      });
      if (!alive(mine)) return;

      // 복제본이 칸에 굳는다.
      fillSlot(slot, value, ink, repeated);
      await wait(SETTLE_MS, mine);
      if (!alive(mine)) return;

      // 그리고 도로 넣는다 — 홈이 다시 메워진다.
      await tween(BACK_MS, true, mine, (e) => {
        const u = 1 - e;
        const lift = -ARC_UP * 0.6 * Math.sin(Math.PI * e);
        tile.g.setAttribute('transform', `translate(${dx * u} ${dy * u + lift})`);
      });
    }

    /**
     * 남겨진 것이 드러난다 — 주머니에 표식이 서고, 그 복제본이 오른쪽 자리로
     * 내려앉는다. 비율 글자는 다 앉은 뒤에 뜬다.
     */
    async function flowLeftOut(
      drawn: Drawn,
      scene: BaggingSampleScene,
      mine: number,
    ): Promise<void> {
      const s = scene.revealed - 1;
      const tiles = drawn.trays[s] ?? [];
      const ratio = drawn.ratios[s];
      ratio?.setAttribute('opacity', '0');
      if (tiles.length > 0) {
        for (const m of tiles) m.g.setAttribute('transform', `translate(${m.dx} ${m.dy})`);
        // 표식이 먼저 서고 잠깐 머문다 — 무엇이 남았는지 읽을 틈이다.
        await wait(LEFT_HOLD_MS, mine);
        if (!alive(mine)) return;
        await tween(TRAY_MS, true, mine, (e) => {
          const u = 1 - e;
          for (const m of tiles) {
            m.g.setAttribute('transform', `translate(${m.dx * u} ${m.dy * u})`);
          }
        });
        if (!alive(mine)) return;
      }
      ratio?.removeAttribute('opacity');
    }

    /**
     * 벌마다 남은 것을 차례로 짚어 견준다 — 이 걸음이 하는 말과 같은 동사다.
     *
     * 이미 서 있는 것들이라 나타나게 하지 않고 **한 번 들었다 놓는다.** 파도가
     * 양 끝에서 0 이므로 멎은 화면은 어느 걸음에서 오든 같다.
     */
    function flowDone(drawn: Drawn, mine: number): Promise<void> {
      const n = drawn.trayGroups.length;
      if (n === 0) return Promise.resolve();
      return tween(DONE_MS, false, mine, (p) => {
        for (let s = 0; s < n; s += 1) {
          const center = (s + 0.5) / n;
          const k = Math.max(0, 1 - Math.abs(p - center) * n * 1.6);
          drawn.trayGroups[s].setAttribute('transform', `translate(0 ${-DONE_LIFT * k})`);
        }
      });
    }

    function flowFor(
      step: BaggingStep,
      drawn: Drawn,
      scene: BaggingSampleScene,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'draw':
          return flowDraw(drawn, scene, geomOf({ pool: scene.pool, sets: scene.sets }), mine);
        case 'leftOut':
          return flowLeftOut(drawn, scene, mine);
        case 'done':
          return flowDone(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: BaggingSampleScene,
      _prev: BaggingSampleScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, next, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 `transform` · `opacity` 와 보간의 끝자리가 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
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
        canvas.textContent = '';
      },
    };
  },
};
