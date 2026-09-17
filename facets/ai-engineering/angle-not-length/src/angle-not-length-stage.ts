/**
 * 각도로 재는 닮음 — 조각의 그림.
 *
 * 장면 하나를 받아 그 화면을 **통째로** 세운다 (`render`). 걸음마다 부르는
 * 메서드를 두지 않는다 — 그 메서드들이 곧 되돌릴 수 없는 명령이었다 (S-scene).
 *
 * ── 좌표는 캔버스에서 역산한다 (S-piece)
 *
 * 선언에 있는 것은 점 넷의 정수 좌표뿐이고, 한 칸을 몇 픽셀로 할지는 여기서
 * 캔버스 높이에서 나눠 정한다. **가로세로 축척이 반드시 같아야 한다** — 한쪽만
 * 늘리면 화면의 각이 실제 각이 아니게 되어 이 조각이 하는 말이 거짓이 된다.
 * 그래서 그림이 가로를 다 채우지 못한다. 남는 폭은 못박은 상수의 결과가 아니라
 * 축척을 지킨 결과이고, 대신 평면(눈금 점과 축)을 캔버스 끝까지 깔아 둔다.
 *
 * ── 부채꼴의 반지름
 *
 * 반지름에는 뜻이 없다. 셋이 겹쳐 보이지 않게 띄워 둔 것뿐이라, **가장 짧은
 * 화살에 가장 큰 반지름**을 준다. 짧은 화살에 큰 반지름을 주지 않으면 부채꼴과
 * 그 값이 점 바로 위에 얹혀 글자끼리 포개진다. 견주는 것은 반지름이 아니라
 * 벌어진 각이다.
 *
 * ── 형편과 표식을 갈랐다 (함정 7 · 29)
 *
 * 옛 화면은 `opacity` 한 축에 예닐곱 뜻을 실었고, 결론을 말하는 마지막 걸음에서
 * **이긴 하나만 남기고 나머지 부채꼴과 현을 0.18 · 0.22 로 지웠다.** 그런데 이
 * 조각의 주장은 *두 줄이 어긋난다* 이고, 그 말은 **두 자가 한 화면에 나란히
 * 읽혀야** 성립한다. 견줄 것을 지우면서 견줌의 결론을 말하고 있었던 것이다.
 *
 * - **채움(무리 지은 짙기) = 값의 형편** — 지금 무대 앞에 선 자가 어느 쪽인가
 *   (`focusOf`). 길이 → 각 → 거리로 넘어가고, **결론에서는 각과 거리가 함께
 *   앞으로 나온다.** 그 불러오는 것 자체가 마지막 걸음의 운동이다.
 * - **테두리 = 견줌의 표식** — 두 줄이 어긋난 그 하나에만 고리가 둘린다. 다른
 *   후보를 어둡게 해서 말하지 않으므로, 완주 화면에 부채꼴 셋과 현 셋과 표 여섯이
 *   전부 읽히는 채로 남는다.
 *
 * ── 끝자리
 *
 * 각으로 좌표를 셈하므로 보간의 끝자리가 흐른다 (`Math.sin(Math.PI)` 는 0 이
 * 아니라 1.2246e-16 이다). 그래서 **정적 그리기와 걸음의 운동이 같은 자세 함수를
 * 지나고**, 그 함수가 `k >= 1` 에서 보간을 아예 건너뛰고 목표값을 그대로 쓴다
 * (`along` · `arcPose`). 운동이 끝나면 `drawStatic(next)` 가 층을 통째로 다시
 * 세워 남은 속성까지 지운다 (S-scene). 되돌릴 때는 `setAttribute(…, '1')` 이
 * 아니라 `removeAttribute(…)` 다 (함정 6).
 *
 * 운동은 `setTimeout` 프레임으로 돈다. CSS `transition` 도 상시 rAF 루프도 두지
 * 않는다 — 되짚기는 `animate:false` 로 오는데 그 둘은 그 뒤에도 화면을 저 혼자
 * 흘러가게 한다 (S-scene MUST NOT).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  flipOf,
  focusOf,
  lastSweptOf,
  lengthOf,
  rankIn,
  type AngleNotLengthPoint,
  type AngleNotLengthScene,
  type AngleNotLengthStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정해 자기 파일에 둔다. 가로는 러너가 PIECE_CANVAS_W 로 준다. */
const CANVAS_H = 420;

const W = PIECE_CANVAS_W;
const PAD_TOP = 26;
const PAD_LEFT = 46;
const PAD_RIGHT = 16;
const CAPTION_BAND = 56;
const TICK_BAND = 18;
/** 세로로 담을 칸 수 — 가장 높은 점(y=7) 위에 라벨이 설 자리까지. */
const Y_UNITS = 7.5;

/** 한 칸의 픽셀. 가로세로가 같아야 각이 참이다. */
const UNIT = Math.floor((CANVAS_H - PAD_TOP - CAPTION_BAND - TICK_BAND) / Y_UNITS);
const OX = PAD_LEFT;
const OY = PAD_TOP + Math.round(Y_UNITS * UNIT);
const GRID_X = Math.floor((W - PAD_RIGHT - OX) / UNIT);
const GRID_Y = Math.floor((OY - PAD_TOP) / UNIT);

const FRAME_MS = 16;
const RAY_MS = 560;
const SWEEP_MS = 620;
const LABEL_MS = 180;
const GROW_MS = 460;
const BADGE_MS = 300;
const PULSE_MS = 720;

const DOT_R = 5;
const BADGE_R = 10;
const DIM_GAP = 11;
const DIM_TEXT_GAP = 24;
const CHORD_TEXT_GAP = 26;
/** 부채꼴 반지름 — 칸 단위. 짧은 화살일수록 큰 것을 받는다. */
const ARC_BASE = 2.2;
const ARC_STEP = 1.1;
/** 벌어지는 동안만 서는 변이 부채꼴 밖으로 나오는 길이. */
const EDGE_OUT = 18;

const BADGE_DY = 2;
const ANGLE_BADGE_DX = 15;
const DIST_BADGE_DX = 33;
/** 두 줄이 어긋난 그 하나에 둘리는 고리. */
const RING_R = DOT_R + 6;
/** 무대 뒤로 물러난 자의 짙기. 지우는 것이 아니라 물러나는 것이다. */
const BACKSTAGE = 0.45;
/** 각이 순위를 진 뒤의 길이 자. 제 몫을 다했지만 화면에 남는다. */
const LENGTH_BACK = 0.3;

const el = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

function place(node: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

const sx = (x: number): number => OX + x * UNIT;
const sy = (y: number): number => OY - y * UNIT;

/** 원점에서 각 a(수학 좌표, 라디안), 반지름 r 인 점의 화면 좌표. */
function polar(r: number, a: number): { x: number; y: number } {
  return { x: OX + r * Math.cos(a), y: OY - r * Math.sin(a) };
}

/**
 * 보간의 한 자리. **`k >= 1` 이면 보간하지 않고 목표를 그대로 준다** — 각으로
 * 좌표를 셈하면 `from + (to - from) * 1` 이 `to` 와 끝자리가 갈린다 (함정 35).
 */
const along = (from: number, to: number, k: number): number =>
  k >= 1 ? to : from + (to - from) * k;

/** a0 에서 a1 까지의 호. 화면은 y 가 뒤집혀 있어 sweep-flag 가 반대다. */
function arcPath(r: number, a0: number, a1: number): string {
  const from = polar(r, a0);
  const to = polar(r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 0 : 1;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/**
 * 선 곁에 글자를 놓을 방향. 늘 같은 쪽(오른쪽)으로 밀되 세로선이면 위로 민다 —
 * 규칙 하나로 정하지 않으면 선마다 눈대중이 되어 다음 사람이 고칠 수 없다.
 */
function sideOf(dx: number, dy: number): { nx: number; ny: number } {
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len;
  let ny = -dx / len;
  if (nx < -0.01 || (Math.abs(nx) <= 0.01 && ny > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

/**
 * 한 후보가 화면에서 차지하는 자리. **전부 바탕에서 나온다** — 걸음이 쌓이는 동안
 * 달라지지 않으므로 그릴 때마다 셈하면 되고, 장면에는 담지 않는다 (S-piece).
 */
type Spot = {
  id: string;
  x: number;
  y: number;
  color: string;
  px: number;
  py: number;
  /** 수학 좌표에서의 방향 (라디안). */
  ang: number;
  /** 방향이 계속된다는 뜻의 점선이 닿는 끝. 옛 코드가 `dataset` 에 적어 두던 것이다. */
  farX: number;
  farY: number;
  arcR: number;
  /** 화살 곁에 자와 글자를 놓을 방향. */
  nx: number;
  ny: number;
};

/** 견줌의 기준. 카테고리 색에 끼지 않고 본문 잉크를 쓴다. */
type QuerySpot = {
  id: string;
  x: number;
  y: number;
  px: number;
  py: number;
  ang: number;
  farX: number;
  farY: number;
};

type DimPose = { x1: number; y1: number; x2: number; y2: number; tx: number; ty: number };

function dimPose(s: Spot, k: number): DimPose {
  return {
    x1: OX + s.nx * DIM_GAP,
    y1: OY + s.ny * DIM_GAP,
    x2: along(OX, s.px, k) + s.nx * DIM_GAP,
    y2: along(OY, s.py, k) + s.ny * DIM_GAP,
    tx: along(OX, (OX + s.px) / 2, k) + s.nx * DIM_TEXT_GAP,
    ty: along(OY, (OY + s.py) / 2, k) + s.ny * DIM_TEXT_GAP,
  };
}

function chordPose(q: QuerySpot, s: Spot, k: number): DimPose {
  const side = sideOf(s.px - q.px, s.py - q.py);
  return {
    x1: q.px,
    y1: q.py,
    x2: along(q.px, s.px, k),
    y2: along(q.py, s.py, k),
    tx: along(q.px, (q.px + s.px) / 2, k) + side.nx * CHORD_TEXT_GAP,
    ty: along(q.py, (q.py + s.py) / 2, k) + side.ny * CHORD_TEXT_GAP,
  };
}

function arcPose(a0: number, s: Spot, k: number): { d: string; tipX: number; tipY: number } {
  const a = k >= 1 ? s.ang : a0 + (s.ang - a0) * k;
  const tip = polar(s.arcR + EDGE_OUT, a);
  return { d: `${arcPath(s.arcR, a0, a)} L ${OX} ${OY} Z`, tipX: tip.x, tipY: tip.y };
}

const badgeTransform = (s: Spot, dx: number, scale: number): string =>
  scale >= 1
    ? `translate(${s.px + dx},${s.py + BADGE_DY})`
    : `translate(${s.px + dx},${s.py + BADGE_DY}) scale(${scale})`;

/** 정적 그리기가 세운 손잡이들. 걸음의 운동이 이것을 움직인다. */
type Drawn = {
  spots: Spot[];
  query: QuerySpot | null;
  /** 원점에서 자라는 선들. 목표 자리를 함께 진다. */
  rays: Array<{ node: SVGLineElement; tx: number; ty: number }>;
  /** 화살이 다 자란 뒤에 드는 것들. */
  fades: SVGElement[];
  dims: Array<{ line: SVGLineElement; txt: SVGTextElement; spot: Spot }>;
  arcs: Array<{
    group: SVGGElement;
    path: SVGPathElement;
    degText: SVGTextElement;
    cosText: SVGTextElement;
    spot: Spot;
  }>;
  chords: Array<{ line: SVGLineElement; txt: SVGTextElement; spot: Spot }>;
  angleBadges: Array<{ node: SVGGElement; spot: Spot }>;
  distBadges: Array<{ node: SVGGElement; spot: Spot }>;
  /** 두 줄이 어긋난 그 하나. 없으면 null. */
  flip: Spot | null;
};

export const angleNotLengthStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<AngleNotLengthScene> {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    canvas.appendChild(root);

    // ── 층. 붙인 차례가 곧 겹치는 차례다.
    const frameLayer = el('g', {});
    const extLayer = el('g', {});
    const dimLayer = el('g', {});
    const arcLayer = el('g', {});
    const chordLayer = el('g', {});
    const rayLayer = el('g', {});
    const pointLayer = el('g', {});
    const badgeLayer = el('g', {});
    for (const layer of [
      frameLayer,
      extLayer,
      dimLayer,
      arcLayer,
      chordLayer,
      rayLayer,
      pointLayer,
      badgeLayer,
    ]) {
      root.appendChild(layer);
    }
    /** 정적 그리기가 매번 자식을 갈아 끼우는 층. 눈금판은 바뀌지 않으니 뺀다. */
    const rebuilt = [extLayer, dimLayer, arcLayer, chordLayer, rayLayer, pointLayer, badgeLayer];

    function text(
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: string,
      family: string,
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
      });
    }

    // 재건 밖에 있는 하나. 자리는 고정이고 글자만 정적 그리기가 매번 다시 쓴다.
    const caption = text(W / 2, CANVAS_H - 20, fontSizes.md, c.text, 'middle', fonts.body);
    root.appendChild(caption);

    /** 눈금 점과 축. 재생 내내 바뀌지 않는 바탕이라 한 번만 짓는다. */
    function drawFrame(): void {
      for (let gx = 1; gx <= GRID_X; gx += 1) {
        for (let gy = 1; gy <= GRID_Y; gy += 1) {
          frameLayer.appendChild(
            el('circle', { cx: sx(gx), cy: sy(gy), r: 1.2, fill: c.border }),
          );
        }
      }
      frameLayer.appendChild(
        el('line', {
          x1: OX,
          y1: OY,
          x2: W - PAD_RIGHT,
          y2: OY,
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );
      frameLayer.appendChild(
        el('line', {
          x1: OX,
          y1: OY,
          x2: OX,
          y2: PAD_TOP - 8,
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );
      frameLayer.appendChild(
        el('polygon', {
          points: `${W - PAD_RIGHT + 7},${OY} ${W - PAD_RIGHT - 2},${OY - 4} ${W - PAD_RIGHT - 2},${OY + 4}`,
          fill: c.border,
        }),
      );
      frameLayer.appendChild(
        el('polygon', {
          points: `${OX},${PAD_TOP - 15} ${OX - 4},${PAD_TOP - 4} ${OX + 4},${PAD_TOP - 4}`,
          fill: c.border,
        }),
      );
      // 눈금의 수는 수식 표기라 문안이 아니다 (C10 표식 판정 3).
      for (let gx = 2; gx <= GRID_X; gx += 2) {
        const label = text(sx(gx), OY + 15, fontSizes.xs, c.textMuted, 'middle', fonts.mono);
        label.textContent = String(gx);
        frameLayer.appendChild(label);
      }
      for (let gy = 2; gy <= GRID_Y; gy += 2) {
        const label = text(OX - 10, sy(gy) + 4, fontSizes.xs, c.textMuted, 'end', fonts.mono);
        label.textContent = String(gy);
        frameLayer.appendChild(label);
      }
    }

    drawFrame();

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지나므로 `destroy` 가 그 가운데 올 수 있다.
     * 프레임마다 자기 번호가 아직 유효한지 보고 아니면 화면에 손대지 않는다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 보간 한 마디. 끝나거나 끊기면 반드시 풀린다 (S-piece). */
    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
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
          const p = duration <= 0 ? 1 : Math.min(1, (Date.now() - started) / duration);
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

    // ── 바탕에서 나오는 자리 ───────────────────────────────────────────────

    function spotsOf(scene: AngleNotLengthScene): Spot[] {
      const list = scene.candidates;
      // 색판은 **바탕의 후보 수**에서 한 번에 정한다. 지금까지 드러난 수로 정하면
      // 하나 짚일 때마다 hue 간격이 통째로 갈린다 (함정 12).
      const hues = categorical(Math.max(1, list.length), 'vivid');
      // 짧은 화살일수록 큰 반지름. 길이 내림차순으로 나눠 준다.
      const byLength = [...list].sort((a, b) => lengthOf(b) - lengthOf(a));
      return list.map((p, i) => {
        const px = sx(p.x);
        const py = sy(p.y);
        const ang = Math.atan2(p.y, p.x);
        const far = polar(W * 1.5, ang);
        const rank = byLength.findIndex((o) => o.id === p.id);
        const side = sideOf(px - OX, py - OY);
        return {
          id: p.id,
          x: p.x,
          y: p.y,
          color: hues[i % hues.length] ?? c.text,
          px,
          py,
          ang,
          farX: far.x,
          farY: far.y,
          arcR: UNIT * (ARC_BASE + ARC_STEP * Math.max(0, rank)),
          nx: side.nx,
          ny: side.ny,
        };
      });
    }

    function querySpotOf(q: AngleNotLengthPoint | null): QuerySpot | null {
      if (q === null) return null;
      const ang = Math.atan2(q.y, q.x);
      const far = polar(W * 1.5, ang);
      return { id: q.id, x: q.x, y: q.y, px: sx(q.x), py: sy(q.y), ang, farX: far.x, farY: far.y };
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 이 장면이 지금 무엇을 말하는가. `step` 을 읽지 않는다 (S-scene). */
    function captionText(scene: AngleNotLengthScene): string {
      // 뒤집힘이 없는 좌표라면 결론을 말하지 않고 앞 캡션을 그대로 둔다 — 화면이
      // 없는 말을 하지 않게.
      const flip = scene.concluded ? flipOf(scene) : null;
      if (flip !== null) {
        return t('caption.flip', '{id}: first by angle, last by distance.', { id: flip });
      }
      if (scene.distOrder.length > 0) {
        return t('caption.distRank', 'By distance: {order}.', {
          order: scene.distOrder.join(' > '),
        });
      }
      if (scene.chords !== null) {
        return t('caption.chords', 'Now the straight-line gap between the tips.');
      }
      if (scene.angleOrder.length > 0) {
        return t('caption.angleRank', 'By angle: {order}. Narrower means more alike.', {
          order: scene.angleOrder.join(' > '),
        });
      }
      const swept = lastSweptOf(scene);
      const reading = scene.sweeps.at(-1);
      if (swept !== null && reading !== undefined) {
        return t('caption.sweep', 'q to {id} — the angle opens to {deg}°.', {
          id: swept.id,
          deg: reading.deg.toFixed(1),
        });
      }
      if (scene.lengthsShown) return t('caption.lengths', 'Their lengths are far apart.');
      if (scene.placed) {
        return t('caption.place', 'Query q and three candidates from the origin.');
      }
      return '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene).
     *
     * 아직 없는 것은 **숨기지 않고 짓지 않는다** — 길이 0 짜리 선에 둥근 마구리를
     * 두면 점이 되고, 숨기기만 하면 앞 걸음의 속성이 함께 남는다 (함정 17 · 18).
     */
    function drawStatic(scene: AngleNotLengthScene): Drawn {
      for (const layer of rebuilt) layer.textContent = '';
      caption.textContent = captionText(scene);

      const spots = spotsOf(scene);
      const q = querySpotOf(scene.query);
      const focus = focusOf(scene);
      const flipId = scene.concluded ? flipOf(scene) : null;
      const d: Drawn = {
        spots,
        query: q,
        rays: [],
        fades: [],
        dims: [],
        arcs: [],
        chords: [],
        angleBadges: [],
        distBadges: [],
        flip: spots.find((s) => s.id === flipId) ?? null,
      };
      if (!scene.placed) return d;

      // ── 화살. 점선은 그 방향이 계속된다는 뜻이다.
      if (q !== null) {
        const qExt = el('line', {
          x1: OX,
          y1: OY,
          x2: q.farX,
          y2: q.farY,
          stroke: c.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
          opacity: 0.45,
        });
        extLayer.appendChild(qExt);
        d.rays.push({ node: qExt, tx: q.farX, ty: q.farY });

        const qRay = el('line', {
          x1: OX,
          y1: OY,
          x2: q.px,
          y2: q.py,
          stroke: c.text,
          'stroke-width': 2.6,
          'stroke-linecap': 'round',
        });
        rayLayer.appendChild(qRay);
        d.rays.push({ node: qRay, tx: q.px, ty: q.py });

        const qDot = el('circle', { cx: q.px, cy: q.py, r: DOT_R, fill: c.text });
        pointLayer.appendChild(qDot);
        const qTag = text(q.px + 13, q.py - 11, fontSizes.sm, c.text, 'start', fonts.mono);
        qTag.textContent = `${q.id} (${q.x},${q.y})`;
        pointLayer.appendChild(qTag);
        d.fades.push(qDot, qTag);
      }

      for (const s of spots) {
        const ext = el('line', {
          x1: OX,
          y1: OY,
          x2: s.farX,
          y2: s.farY,
          stroke: s.color,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
          opacity: 0.4,
        });
        extLayer.appendChild(ext);
        d.rays.push({ node: ext, tx: s.farX, ty: s.farY });

        const ray = el('line', {
          x1: OX,
          y1: OY,
          x2: s.px,
          y2: s.py,
          stroke: s.color,
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
        });
        rayLayer.appendChild(ray);
        d.rays.push({ node: ray, tx: s.px, ty: s.py });

        const dot = el('circle', {
          cx: s.px,
          cy: s.py,
          r: DOT_R,
          fill: s.color,
          stroke: c.bg,
          'stroke-width': 1.5,
        });
        pointLayer.appendChild(dot);
        const len = Math.hypot(s.px - OX, s.py - OY) || 1;
        const tag = text(
          s.px + ((s.px - OX) / len) * 17,
          s.py + ((s.py - OY) / len) * 17 - 2,
          fontSizes.sm,
          c.text,
          'start',
          fonts.mono,
        );
        tag.textContent = `${s.id} (${s.x},${s.y})`;
        pointLayer.appendChild(tag);
        d.fades.push(dot, tag);
      }

      // ── 길이를 재는 자. 각이 순위를 진 뒤로는 뒤로 물러나되 사라지지는 않는다.
      if (scene.lengthsShown) {
        const dim = focus === 'length' ? 1 : LENGTH_BACK;
        for (const s of spots) {
          const group = el('g', { opacity: dim });
          const pose = dimPose(s, 1);
          const line = el('line', {
            x1: pose.x1,
            y1: pose.y1,
            x2: pose.x2,
            y2: pose.y2,
            stroke: s.color,
            'stroke-width': 1.2,
            'stroke-dasharray': '2 3',
          });
          const txt = text(pose.tx, pose.ty, fontSizes.xs, c.textMuted, 'middle', fonts.mono);
          // 길이와 코사인과 거리는 수식 표기라 문안이 아니다 (C10 표식 판정 3).
          txt.textContent = `|${s.id}| = ${lengthOf(s).toFixed(2)}`;
          group.appendChild(line);
          group.appendChild(txt);
          dimLayer.appendChild(group);
          d.dims.push({ line, txt, spot: s });
        }
      }

      // ── 부채꼴. 짚어 본 만큼만 선다.
      if (q !== null) {
        const lit = focus === 'angle' || focus === 'both' ? 1 : BACKSTAGE;
        for (let i = 0; i < scene.sweeps.length; i += 1) {
          const s = spots[i];
          const reading = scene.sweeps[i];
          if (s === undefined || reading === undefined) continue;
          const group = el('g', { opacity: lit });
          const pose = arcPose(q.ang, s, 1);
          const path = el('path', {
            d: pose.d,
            fill: s.color,
            'fill-opacity': 0.12,
            stroke: s.color,
            'stroke-width': 1.8,
          });
          const mid = polar(s.arcR + 16, s.ang);
          const degText = text(mid.x, mid.y - 10, fontSizes.sm, c.text, 'middle', fonts.mono);
          degText.textContent = `${reading.deg.toFixed(1)}°`;
          const cosText = text(mid.x, mid.y + 2, fontSizes.xs, c.textMuted, 'middle', fonts.mono);
          cosText.textContent = `cos = ${reading.cos.toFixed(2)}`;
          group.appendChild(path);
          group.appendChild(degText);
          group.appendChild(cosText);
          arcLayer.appendChild(group);
          d.arcs.push({ group, path, degText, cosText, spot: s });
        }
      }

      // ── 현. 끝점에서 끝점으로 — 이쪽이 유클리드 거리다.
      if (q !== null && scene.chords !== null) {
        for (let i = 0; i < spots.length; i += 1) {
          const s = spots[i];
          const dist = scene.chords[i];
          if (s === undefined || dist === undefined) continue;
          const pose = chordPose(q, s, 1);
          const line = el('line', {
            x1: pose.x1,
            y1: pose.y1,
            x2: pose.x2,
            y2: pose.y2,
            stroke: s.color,
            'stroke-width': 1.8,
            'stroke-dasharray': '5 4',
          });
          const txt = text(pose.tx, pose.ty, fontSizes.xs, c.text, 'middle', fonts.mono);
          txt.textContent = `d = ${dist.toFixed(2)}`;
          chordLayer.appendChild(line);
          chordLayer.appendChild(txt);
          d.chords.push({ line, txt, spot: s });
        }
      }

      // ── 두 줄의 표. 동그란 것이 각이고 마름모가 거리다.
      for (const s of spots) {
        const rank = rankIn(scene.angleOrder, s.id);
        if (rank === null) continue;
        const node = el('g', { transform: badgeTransform(s, ANGLE_BADGE_DX, 1) });
        node.appendChild(el('circle', { cx: 0, cy: 0, r: BADGE_R, fill: s.color }));
        const num = text(0, 4, fontSizes.xs, c.stateInk, 'middle', fonts.body);
        num.textContent = String(rank);
        node.appendChild(num);
        badgeLayer.appendChild(node);
        d.angleBadges.push({ node, spot: s });
      }
      for (const s of spots) {
        const rank = rankIn(scene.distOrder, s.id);
        if (rank === null) continue;
        const node = el('g', { transform: badgeTransform(s, DIST_BADGE_DX, 1) });
        node.appendChild(
          el('polygon', {
            points: `0,${-BADGE_R - 1} ${BADGE_R + 1},0 0,${BADGE_R + 1} ${-BADGE_R - 1},0`,
            fill: c.bg,
            stroke: s.color,
            'stroke-width': 2,
          }),
        );
        const num = text(0, 4, fontSizes.xs, c.text, 'middle', fonts.body);
        num.textContent = String(rank);
        node.appendChild(num);
        badgeLayer.appendChild(node);
        d.distBadges.push({ node, spot: s });
      }

      // ── 견줌의 표식. 두 줄이 어긋난 그 하나에만 고리가 둘린다. 다른 후보를
      //    어둡게 해서 말하지 않으므로 견줄 것이 화면에 그대로 남는다 (함정 7).
      if (d.flip !== null) {
        badgeLayer.appendChild(
          el('circle', {
            cx: d.flip.px,
            cy: d.flip.py,
            r: RING_R,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 2,
          }),
        );
      }
      return d;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 원점에서 화살이 자라고, 다 자란 뒤에 점과 이름표가 든다. */
    function flowPlace(d: Drawn, mine: number): Promise<void> {
      if (d.rays.length === 0) return Promise.resolve();
      return tween(RAY_MS, mine, (p) => {
        const done = p >= 1;
        const e = done ? 1 : 1 - (1 - p) * (1 - p);
        for (const r of d.rays) {
          place(r.node, { x2: along(OX, r.tx, e), y2: along(OY, r.ty, e) });
        }
        if (done) {
          // 되돌릴 때는 '1' 을 쓰지 않고 속성을 걷는다 (함정 6).
          for (const node of d.fades) node.removeAttribute('opacity');
          return;
        }
        const appear = String(Math.max(0, (e - 0.55) / 0.45));
        for (const node of d.fades) node.setAttribute('opacity', appear);
      });
    }

    /** 길이를 재는 자가 화살을 따라 자란다. */
    function flowLengths(d: Drawn, mine: number): Promise<void> {
      if (d.dims.length === 0) return Promise.resolve();
      return tween(GROW_MS, mine, (p) => {
        const done = p >= 1;
        for (const row of d.dims) {
          const pose = dimPose(row.spot, done ? 1 : p);
          place(row.line, { x2: pose.x2, y2: pose.y2 });
          place(row.txt, { x: pose.tx, y: pose.ty });
          if (done) row.txt.removeAttribute('opacity');
          else row.txt.setAttribute('opacity', String(p));
        }
      });
    }

    /**
     * 질의의 방향에서 후보의 방향까지 부채꼴이 벌어진다.
     *
     * 출발 각은 **질의의 방향**이라 바탕이 말한다 — `prev` 를 들출 까닭이 없다
     * (S-scene). 벌어지는 동안만 서는 변은 여기서 짓고 여기서 걷는다 (함정 27).
     */
    async function flowSweep(d: Drawn, mine: number): Promise<void> {
      const arc = d.arcs.at(-1);
      const q = d.query;
      if (arc === undefined || q === null) return;
      const edge = el('line', {
        x1: OX,
        y1: OY,
        x2: OX,
        y2: OY,
        stroke: arc.spot.color,
        'stroke-width': 1.2,
        opacity: 0.9,
      });
      arc.group.appendChild(edge);
      arc.degText.setAttribute('opacity', '0');
      arc.cosText.setAttribute('opacity', '0');

      await tween(SWEEP_MS, mine, (p) => {
        const done = p >= 1;
        const pose = arcPose(q.ang, arc.spot, done ? 1 : p * p * (3 - 2 * p));
        arc.path.setAttribute('d', pose.d);
        if (done) {
          edge.remove();
          return;
        }
        place(edge, { x2: pose.tipX, y2: pose.tipY });
      });
      if (!alive(mine)) return;

      // 벌어지고 나서 값이 든다. 같은 걸음의 두 마디라 한 약속으로 이어 흘린다.
      await tween(LABEL_MS, mine, (p) => {
        if (p >= 1) {
          arc.degText.removeAttribute('opacity');
          arc.cosText.removeAttribute('opacity');
          return;
        }
        arc.degText.setAttribute('opacity', String(p));
        arc.cosText.setAttribute('opacity', String(p));
      });
    }

    /** 표가 후보 곁에서 부풀어 선다. */
    function flowBadges(
      rows: Array<{ node: SVGGElement; spot: Spot }>,
      dx: number,
      mine: number,
    ): Promise<void> {
      if (rows.length === 0) return Promise.resolve();
      return tween(BADGE_MS, mine, (p) => {
        const done = p >= 1;
        const e = done ? 1 : 1 - (1 - p) * (1 - p);
        for (const row of rows) row.node.setAttribute('transform', badgeTransform(row.spot, dx, e));
      });
    }

    /** 끝점에서 끝점으로 줄이 뻗는다. */
    function flowChords(d: Drawn, mine: number): Promise<void> {
      const q = d.query;
      if (q === null || d.chords.length === 0) return Promise.resolve();
      return tween(GROW_MS, mine, (p) => {
        const done = p >= 1;
        for (const row of d.chords) {
          const pose = chordPose(q, row.spot, done ? 1 : p);
          place(row.line, { x2: pose.x2, y2: pose.y2 });
          place(row.txt, { x: pose.tx, y: pose.ty });
          if (done) row.txt.removeAttribute('opacity');
          else row.txt.setAttribute('opacity', String(p));
        }
      });
    }

    /**
     * 두 자를 나란히 놓는다 — 뒤로 물러나 있던 부채꼴이 현 곁으로 다시 나오고,
     * 두 줄이 어긋난 그 하나에서 맥이 뛴다.
     *
     * 한 뜻으로 묶인 운동이라 시계를 둘로 나누지 않는다 (프로토콜 3-4).
     */
    function flowConclude(d: Drawn, mine: number): Promise<void> {
      const flip = d.flip;
      const pulse =
        flip === null
          ? null
          : el('circle', {
              cx: flip.px,
              cy: flip.py,
              r: DOT_R,
              fill: 'none',
              stroke: flip.color,
              'stroke-width': 2,
            });
      if (pulse !== null) badgeLayer.appendChild(pulse);
      if (d.arcs.length === 0 && pulse === null) return Promise.resolve();

      return tween(PULSE_MS, mine, (p) => {
        const done = p >= 1;
        for (const arc of d.arcs) {
          // 끝에서는 정적 그리기와 **같은 글자**를 쓴다 (함정 6).
          place(arc.group, {
            opacity: done ? 1 : BACKSTAGE + (1 - BACKSTAGE) * Math.min(1, p * 2.2),
          });
        }
        if (pulse === null) return;
        if (done) {
          pulse.remove();
          return;
        }
        const cycle = (p * 2) % 1;
        place(pulse, { r: DOT_R + cycle * 22, opacity: (1 - cycle) * 0.85 });
      });
    }

    function flowFor(step: AngleNotLengthStep, d: Drawn, mine: number): Promise<void> {
      switch (step.kind) {
        case 'place':
          return flowPlace(d, mine);
        case 'lengths':
          return flowLengths(d, mine);
        case 'sweep':
          return flowSweep(d, mine);
        case 'rank-angle':
          return flowBadges(d.angleBadges, ANGLE_BADGE_DX, mine);
        case 'chords':
          return flowChords(d, mine);
        case 'rank-dist':
          return flowBadges(d.distBadges, DIST_BADGE_DX, mine);
        case 'conclude':
          return flowConclude(d, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: AngleNotLengthScene,
      _prev: AngleNotLengthScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간의 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
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
        if (root.parentNode !== null) root.parentNode.removeChild(root);
      },
    };
  },
};
