/**
 * keep-neighbors-close stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 무대는 2차원 점 무리가 아니다. 고리 위에 놓인 점들을 **한 줄로 펴는** 일 자체가
 * 그림이다. 펴는 방법은 꺾임만 줄이는 것이다 — 변의 길이는 한 프레임도 건드리지 않고
 * 꼭짓점의 꺾임 각만 `(1-t)` 배로 줄인다. 그래서 이웃 간격이 지켜지는 것이 눈으로
 * 보이고, 닫힌 고리를 열린 줄로 만들려면 어딘가 한 곳이 찢어질 수밖에 없다는 것도
 * 눈으로 보인다.
 *
 * ── 자리 잡기
 *
 * 가로 자는 **펴진 줄**이 정한다. 줄이 좌우 여백을 뺀 폭을 꽉 채우도록 자를 정하고,
 * 고리는 같은 자로 그린다 — 두 그림이 같은 자를 써야 "아홉 배" 가 눈금으로 읽힌다.
 * 세로는 체인의 바닥을 줄 높이에 붙여 두어, 고리가 아래로 납작해지며 줄이 되는 것으로
 * 보이게 한다.
 *
 * 바깥 법선(변을 90도 돌린 방향)은 고리에서 바깥쪽이고, 다 펴지면 줄의 아래쪽이 된다.
 * 거리 숫자를 그 방향에 매달아 두면 고리 바깥을 돌던 열 개의 숫자가 줄 아래 한 줄로
 * 내려앉는다. 끊긴 변만 방향이 뒤집혀 위로 올라가므로, 찢어진 쌍은 저절로 줄 위쪽에
 * 자기 자리를 갖는다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 옛 무대는 `buildChain` 이 낸 `ChainModel` 을 mount 에 쥐고 `unroll` 이 그 안의
 * `scale` 을 제자리에서 고쳤다. 화면의 모든 가로 길이가 거기서 나왔는데 되감기는
 * 그것을 되돌리지 않았다. 여기서는 `geomOf(scene)` 가 **매번** 바탕과 자취에서
 * 역산한다 — 장면이 담는 것은 픽셀이 아니라 값의 자리다 (S-piece).
 *
 * ── 채움과 테두리를 가른다
 *
 * 이 조각은 **지킨 이웃과 찢어진 이웃이 한 화면에 나란히 서야** 주장이 선다. 둘을
 * 같은 축에 실으면 서로를 지우므로 어휘를 먼저 가른다.
 *
 * - **채움(선 색 · 점의 채움 · 숫자의 색) = 값의 형편.** 성한 이음과 그 거리는 기본
 *   잉크이고, 끊긴 이음과 그 두 끝과 그 거리는 `danger` 다. 끊기는 순간부터 마지막
 *   화면까지 그대로 남는다.
 * - **테두리(선 굵기 · 딱지의 테두리 · 점의 테두리 굵기) = 견줌·짚음의 표식.** 이미
 *   짚어 확인한 쌍에만 선다 — 지켜진 아홉은 `kept` 가 훑고 지나간 뒤, 찢어진 하나는
 *   `torn` 뒤, 마주 보는 둘은 `far` 뒤다.
 *
 * 그래서 완주 화면에서 "지켜진 아홉" 과 "찢어진 하나" 가 색으로 갈리고, 그 둘이 다
 * *짚어 확인된 것*이라는 사실은 테두리가 따로 말한다.
 *
 * 세로(`CANVAS_H`)는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import { PIECE_CANVAS_W, fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  farGap,
  gapOf,
  nextOf,
  phaseOf,
  tornGap,
  type KeepNeighborsCloseScene,
  type KeepNeighborsCloseStep,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다 (S-view). 마운트한 뒤로 바꾸지 않는다. */
const CANVAS_H = 300;
const PAD_X = 46;
/**
 * 체인의 바닥이 앉는 높이. 고리일 때는 아래로 내려가 있고 다 펴지면 조금 올라온다 —
 * 고리는 세로로 190 남짓을 쓰고 줄은 쓰지 않으므로, 바닥을 한 곳에 못박으면 둘 중
 * 하나는 반드시 한쪽으로 쏠린다.
 */
const RING_BOTTOM_Y = 252;
const LINE_Y = 208;
const CAPTION_Y = 22;
const BEAD_R = 10;
/** 거리 숫자가 변에서 바깥 법선으로 물러나는 거리. */
const LABEL_GAP = 22;
/** 끊긴 쌍의 숫자가 활 마루에서 더 물러나는 거리. */
const TORN_LABEL_GAP = 17;
/** 끊긴 쌍을 잇는 활의 높이 — 고리에서, 그리고 다 펴졌을 때. */
const ARCH_MIN = 5;
const ARCH_MAX = 100;
/** 활 마루가 넘어서지 않는 위쪽 한계. 펴지는 도중에 캡션을 밀지 않게 한다. */
const ARCH_TOP_Y = 58;
/** 찢어진 자리의 빈틈 (픽셀). */
const TEAR_PX = 9;
/** 마주 보는 쌍을 견주는 두 자의 높이. */
const FAR_ROW_A = LINE_Y + 48;
const FAR_ROW_B = LINE_Y + 66;

// ── 어휘. 채움은 값의 형편, 테두리는 짚음의 표식이다.
/** 성한 이음의 굵기. */
const LINK_W = 2.2;
/** 끊긴 이음의 굵기 — 아직 짚기 전. */
const TORN_W = 2.4;
/** 이미 짚어 확인한 이음의 굵기. */
const MARK_W = 3.2;
/** 짚는 박동이 굵기에 더하는 몫. */
const PULSE_W = 2.6;
const BEAD_STROKE_W = 1.5;
/** 이미 짚어 확인한 점의 테두리 굵기. */
const BEAD_MARK_W = 2.6;

const RING_MS = 560;
const CUT_MS = 460;
const UNROLL_MS = 1700;
const KEPT_MS = 780;
const TORN_MS = 520;
/** 마주 보는 쌍의 자가 서기 전의 뜸. */
const FAR_HOLD_MS = 160;
const FAR_MS = 640;
/** 보간 한 마디. CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). */
const FRAME_MS = 16;

type Pt = { x: number; y: number };

function el<T extends SVGElement>(name: string, attrs: Record<string, string>): T {
  const node = document.createElementNS(NS, name) as T;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** (-π, π] 로 감는다. */
function wrap(a: number): number {
  return ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 짚는 박동. 0 에서 올랐다 0 으로 돌아온다.
 *
 * `Math.sin(Math.PI)` 는 0 이 아니라 1.2246e-16 이라 끝자리가 흘러 "흘려 세운 화면"
 * 과 "곧바로 세운 화면" 이 갈린다. 끝에서는 보간값 대신 상수를 그대로 쓴다.
 */
function bump(p: number): number {
  return p >= 1 ? 0 : Math.sin(Math.PI * p);
}

function fmt(v: number): string {
  return v.toFixed(2);
}

function quad(a: Pt, c: Pt, b: Pt, s: number): Pt {
  const u = 1 - s;
  return {
    x: u * u * a.x + 2 * u * s * c.x + s * s * b.x,
    y: u * u * a.y + 2 * u * s * c.y + s * s * b.y,
  };
}

function polyline(a: Pt, c: Pt, b: Pt, from: number, to: number): string {
  const steps = 14;
  const out: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = quad(a, c, b, from + ((to - from) * i) / steps);
    out.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return out.join(' ');
}

// ── 자리 셈 ───────────────────────────────────────────────────────────────

/**
 * 그 장면의 자리 셈. **매번 바탕과 자취에서 역산한다.**
 *
 * 변의 길이와 꼭짓점의 꺾임을 바탕의 좌표에서 읽고, 가로 자는 펴진 줄이 좌우 여백을
 * 뺀 폭을 꽉 채우도록 잡는다. 아직 펴지기 전에도 같은 자를 쓰므로 고리와 줄이 한
 * 눈금 위에 선다.
 */
type Geom = {
  n: number;
  /** 끊은 자리 다음 점부터의 차례. `order[i]` 가 체인의 i 번째 점이다. */
  order: number[];
  /** 점 번호 → 체인에서의 차례. */
  slot: number[];
  /** 체인의 변 길이 (데이터 단위). */
  seg: number[];
  /** 체인의 누적 꺾임 각. */
  cum: number[];
  mid: number;
  /** 데이터 단위 → 픽셀. */
  scale: number;
  /** 다 편 뒤 점들이 서는 가로 자리 (픽셀). 아직 고리면 null. */
  lineX: number[] | null;
  ringCx: number;
  ringCy: number;
  ringR: number;
};

function chainAt(geo: Geom, unrolled: number): Pt[] {
  const out: Pt[] = [];
  const lineX = geo.lineX;
  // 다 펴졌으면 자리는 알고리즘이 낸 답 그대로다 — 보간값을 쓰지 않는다.
  if (unrolled >= 1 && lineX !== null) {
    for (let i = 0; i < lineX.length; i += 1) out[i] = { x: lineX[i], y: LINE_Y };
    return out;
  }
  const xs = [0];
  const ys = [0];
  for (let k = 0; k < geo.seg.length; k += 1) {
    const th = (1 - unrolled) * (geo.cum[k] - geo.mid);
    xs.push(xs[k] + geo.seg[k] * Math.cos(th));
    ys.push(ys[k] + geo.seg[k] * Math.sin(th));
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const cx = (minX + maxX) / 2;
  const bottom = RING_BOTTOM_Y + (LINE_Y - RING_BOTTOM_Y) * unrolled;
  for (let i = 0; i < geo.order.length; i += 1) {
    out[geo.order[i]] = {
      x: W / 2 + (xs[i] - cx) * geo.scale,
      y: bottom - (ys[i] - minY) * geo.scale,
    };
  }
  return out;
}

function geomOf(scene: KeepNeighborsCloseScene): Geom | null {
  const n = scene.points.length;
  if (n < 3) return null;

  const order: number[] = [];
  for (let i = 0; i < n; i += 1) order.push((scene.cutAt + 1 + i) % n);
  const slot: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) slot[order[i]] = i;

  const seg: number[] = [];
  const dir: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p = scene.points[order[i]];
    const q = scene.points[order[i + 1]];
    seg.push(Math.hypot(q.x - p.x, q.y - p.y));
    dir.push(Math.atan2(q.y - p.y, q.x - p.x));
  }
  const cum: number[] = [0];
  for (let i = 1; i < dir.length; i += 1) cum.push(cum[i - 1] + wrap(dir[i] - dir[i - 1]));
  const mid = (cum[0] + cum[cum.length - 1]) / 2;

  // 줄의 길이가 자를 정한다. 아직 펴지기 전이면 체인의 전체 길이가 곧 그 길이다.
  const total = seg.reduce((a, b) => a + b, 0);
  const span = scene.line === null ? total : Math.max(total, ...scene.line);
  const scale = span > 0 ? (W - PAD_X * 2) / span : 1;
  const lineX = scene.line === null ? null : scene.line.map((v) => PAD_X + v * scale);

  const geo: Geom = {
    n,
    order,
    slot,
    seg,
    cum,
    mid,
    scale,
    lineX,
    ringCx: W / 2,
    ringCy: LINE_Y,
    ringR: 0,
  };
  // 안내 고리는 t=0 의 체인에서 역산한다 — 어디에도 적어 두지 않는다.
  const at0 = chainAt(geo, 0);
  const ys = at0.map((p) => p.y);
  geo.ringCy = (Math.min(...ys) + Math.max(...ys)) / 2;
  geo.ringR =
    at0.reduce((acc, p) => acc + Math.hypot(p.x - geo.ringCx, p.y - geo.ringCy), 0) / at0.length;
  return geo;
}

// ── 한 프레임의 흐르는 몫 ─────────────────────────────────────────────────

/**
 * 그리기의 흐르는 몫. **장면이 아니라 운동이 정하는 수만 담는다.**
 *
 * 정적 그리기는 `frameOf(scene)` 가 낸 끝 자리를 쓰고, 걸음의 운동은 그 가운데
 * 자기가 흐르게 할 것만 덮어쓴다. 그래서 운동이 끝난 프레임과 곧바로 세운 프레임이
 * 같은 수를 본다.
 */
type Frame = {
  /** 얼마나 펴졌나. 0 이면 고리, 1 이면 줄. */
  t: number;
  /** 점이 얼마나 자랐나. */
  grow: number;
  /** 안내 고리의 진하기. */
  guide: number;
  /** 끊긴 자리가 얼마나 벌어졌나. */
  tear: number;
  /** 짚는 박동의 세기. */
  pulse: number;
  /** 박동이 실리는 점들. */
  pulseAt: readonly number[];
  /** 지켜진 쌍을 어디까지 훑었나. 1 이면 전부. */
  keptWave: number;
  /** 마주 보는 쌍의 자가 얼마나 자랐나. */
  farGrow: number;
};

/**
 * 그 장면이 멎어 있을 때의 프레임.
 *
 * **`step` 을 읽지 않는다.** 머무는 표식을 걸음으로 가리면 흘려 세운 경로와 곧바로
 * 세운 경로가 같은 걸음을 보므로 어긋남이 검사를 통과해 버린다 — 규율로만 지킨다
 * (S-scene).
 */
function frameOf(scene: KeepNeighborsCloseScene): Frame {
  return {
    t: scene.line !== null ? 1 : 0,
    grow: scene.raised ? 1 : 0,
    guide: scene.raised && scene.line === null ? 1 : 0,
    tear: scene.cut ? 1 : 0,
    pulse: 0,
    pulseAt: [],
    keptWave: scene.keptMarked ? 1 : 0,
    farGrow: scene.farMarked ? 1 : 0,
  };
}

type Row = { group: SVGGElement; chip: SVGRectElement; text: SVGTextElement };

type FarParts = {
  guideA: SVGLineElement;
  guideB: SVGLineElement;
  barBefore: SVGLineElement;
  barAfter: SVGRectElement;
  textBefore: SVGTextElement;
  textAfter: SVGTextElement;
};

type Drawn = {
  guide: SVGCircleElement;
  links: SVGLineElement[];
  flashes: SVGLineElement[];
  /** 앞의 `n-1` 이 지켜지는 변의 것이고 마지막 하나가 끊긴 쌍의 것이다. */
  labels: Row[];
  beads: { dot: SVGCircleElement; num: SVGTextElement }[];
  tornHead: SVGPolylineElement;
  tornTail: SVGPolylineElement;
  /** 마주 보는 쌍을 아직 안 견주었으면 null — 없는 것은 짓지 않는다. */
  far: FarParts | null;
};

export const keepNeighborsCloseStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<KeepNeighborsCloseScene> {
    const c: Palette = getColors(params.theme);
    const canvas = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    canvas.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gGuide = el<SVGGElement>('g', {});
    const gFlash = el<SVGGElement>('g', {});
    const gLink = el<SVGGElement>('g', {});
    const gTorn = el<SVGGElement>('g', {});
    const gFar = el<SVGGElement>('g', {});
    const gLabel = el<SVGGElement>('g', {});
    const gBead = el<SVGGElement>('g', {});
    const gCaption = el<SVGGElement>('g', {});
    const layers = [gGuide, gFlash, gLink, gTorn, gFar, gLabel, gBead, gCaption];
    for (const layer of layers) canvas.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이 이미
     * 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function wait(ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
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

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 지금 화면이 할 말.
     *
     * `step` 이 아니라 **국면**에서 낸다. 수는 전부 자취에서 셈해 나오므로 (`gapOf` ·
     * `tornGap` · `farGap`) 화면의 숫자와 캡션의 숫자가 갈릴 자리가 없다.
     */
    function captionFor(scene: KeepNeighborsCloseScene): string {
      const phase = phaseOf(scene);
      switch (phase.kind) {
        case 'blank':
          return '';
        case 'ring':
          return t(
            'caption.ring',
            '{n} points on a ring: every neighboring pair sits the same distance apart, {d}.',
            { n: scene.points.length, d: fmt(phase.gap) },
          );
        case 'cut':
          return t('caption.cut', 'A ring is closed, a line is open. So one link has to go: {a}-{b}.', {
            a: phase.a,
            b: phase.b,
          });
        case 'unroll':
          return t(
            'caption.unroll',
            'The ring straightens into a line. Every neighbor gap is carried over as it was.',
          );
        case 'kept':
          return t('caption.kept', '{kept} of the {total} neighbor pairs keep their distance exactly.', {
            kept: phase.kept,
            total: phase.total,
          });
        case 'torn':
          return t(
            'caption.torn',
            'The cut pair pays for all of it: {before} becomes {after}, a factor of {ratio}.',
            { before: fmt(phase.before), after: fmt(phase.after), ratio: phase.ratio.toFixed(1) },
          );
        case 'far':
          return t(
            'caption.far',
            'Distant pairs are not exact either. {a} and {b}: was {before}, now {after}.',
            { a: phase.a, b: phase.b, before: fmt(phase.before), after: fmt(phase.after) },
          );
        case 'done':
          return t('caption.done', 'You can choose where to cut. You cannot choose not to cut.');
      }
    }

    /** 끊긴 쌍의 딱지에 적는 글. 짚기 전에는 그저 지금 거리다. */
    function tornLabelText(scene: KeepNeighborsCloseScene, now: number): string {
      if (!scene.tornMarked) return fmt(now);
      const { before, after, ratio } = tornGap(scene);
      return t('label.torn', '{before} - {after} ({ratio}x)', {
        before: fmt(before),
        after: fmt(after),
        ratio: ratio.toFixed(1),
      });
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function clear(): void {
      for (const layer of layers) layer.textContent = '';
    }

    function placeLabel(
      row: Row,
      at: Pt,
      text: string,
      ink: string,
      mark: string,
      shown: number,
    ): void {
      row.text.textContent = text;
      row.text.setAttribute('x', at.x.toFixed(1));
      row.text.setAttribute('y', at.y.toFixed(1));
      // 채움은 값의 형편 — 성한 거리인가 찢어진 거리인가.
      row.text.setAttribute('fill', ink);
      const w = text.length * 6.4 + 9;
      row.chip.setAttribute('x', (at.x - w / 2).toFixed(1));
      row.chip.setAttribute('y', (at.y - 7.5).toFixed(1));
      row.chip.setAttribute('width', w.toFixed(1));
      // 테두리는 짚음의 표식 — 이미 견주어 확인했는가.
      row.chip.setAttribute('stroke', mark);
      row.group.setAttribute('opacity', shown.toFixed(3));
    }

    /**
     * 그 장면과 그 프레임이 말하는 것을 노드에 적는다.
     *
     * 정적 경로와 흐르는 경로가 **한 함수**를 지난다. 그래서 운동이 끝난 화면과 곧바로
     * 세운 화면이 갈릴 자리가 없다.
     */
    function paint(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      f: Frame,
    ): void {
      const n = geo.n;
      const edges = n - 1;
      const pts = chainAt(geo, f.t);
      const cutA = scene.cutAt;
      const cutB = nextOf(scene, cutA);
      // 아직 흐르는 중이면 숫자도 그 도중의 것이다. 멎으면 자취가 낸 답을 그대로 쓴다.
      const flowing = scene.line !== null && f.t < 1;

      drawn.guide.setAttribute('cx', geo.ringCx.toFixed(1));
      drawn.guide.setAttribute('cy', geo.ringCy.toFixed(1));
      drawn.guide.setAttribute('r', geo.ringR.toFixed(1));
      drawn.guide.setAttribute('opacity', f.guide.toFixed(3));

      const grown = (ring: number): number => clamp01((f.grow * (n + 3) - geo.slot[ring]) / 2.5);

      // ── 지켜지는 변들
      for (let i = 0; i < edges; i += 1) {
        const a = geo.order[i];
        const b = geo.order[i + 1];
        const pa = pts[a];
        const pb = pts[b];
        const shown = Math.min(grown(a), grown(b));
        const marked = f.keptWave > 0 && i / edges <= f.keptWave;

        const line = drawn.links[i];
        line.setAttribute('x1', pa.x.toFixed(1));
        line.setAttribute('y1', pa.y.toFixed(1));
        line.setAttribute('x2', pb.x.toFixed(1));
        line.setAttribute('y2', pb.y.toFixed(1));
        line.setAttribute('opacity', shown.toFixed(3));
        // 색은 형편(성한 이음), 굵기는 표식(짚어 확인했다).
        line.setAttribute('stroke-width', String(marked ? MARK_W : LINK_W));

        const head = f.keptWave * (edges + 3) - 1.5;
        const wave = f.keptWave <= 0 ? 0 : Math.max(0, 1 - Math.abs(head - i) / 1.6);
        const flash = drawn.flashes[i];
        flash.setAttribute('x1', pa.x.toFixed(1));
        flash.setAttribute('y1', pa.y.toFixed(1));
        flash.setAttribute('x2', pb.x.toFixed(1));
        flash.setAttribute('y2', pb.y.toFixed(1));
        flash.setAttribute('opacity', (wave * shown).toFixed(3));

        // 거리 숫자는 바깥 법선에 매달려 변과 함께 옮겨 다닌다.
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const value = flowing ? len / geo.scale : gapOf(scene, a);
        placeLabel(
          drawn.labels[i],
          { x: (pa.x + pb.x) / 2 + nx * LABEL_GAP, y: (pa.y + pb.y) / 2 + ny * LABEL_GAP },
          fmt(value),
          c.text,
          marked ? c.text : 'none',
          shown,
        );
      }

      // ── 끊기는 변
      const ta = pts[cutA];
      const tb = pts[cutB];
      const tdx = tb.x - ta.x;
      const tdy = tb.y - ta.y;
      const chord = Math.hypot(tdx, tdy) || 1;
      const tnx = -tdy / chord;
      const tny = tdx / chord;
      const mx = (ta.x + tb.x) / 2;
      const my = (ta.y + tb.y) / 2;
      let depth = scene.cut ? ARCH_MIN + (ARCH_MAX - ARCH_MIN) * f.t : 0;
      // 아직 덜 펴졌을 때는 끊긴 두 점이 위쪽에 있다. 활을 그대로 올리면 캡션을
      // 뚫으므로 한계에서 멈춘다 — 다 펴져 두 점이 내려앉으면 저절로 커진다.
      if (tny < 0 && my + tny * depth < ARCH_TOP_Y) {
        depth = Math.max(0, (my - ARCH_TOP_Y) / -tny);
      }
      const ctrl = { x: mx + tnx * depth * 2, y: my + tny * depth * 2 };
      const half = f.tear * Math.min(0.34, TEAR_PX / chord);
      const tornShown = Math.min(grown(cutA), grown(cutB));
      const tornBase = scene.tornMarked ? MARK_W : scene.cut ? TORN_W : LINK_W;
      const tornWidth = tornBase + PULSE_W * f.pulse;
      drawn.tornHead.setAttribute('points', polyline(ta, ctrl, tb, 0, Math.max(0, 0.5 - half)));
      drawn.tornTail.setAttribute('points', polyline(ta, ctrl, tb, Math.min(1, 0.5 + half), 1));
      for (const part of [drawn.tornHead, drawn.tornTail]) {
        // 색과 점선은 형편(끊겼다), 굵기는 표식(짚어 확인했다).
        part.setAttribute('stroke', scene.cut ? c.danger : c.text);
        part.setAttribute('stroke-width', tornWidth.toFixed(2));
        part.setAttribute('stroke-dasharray', scene.cut ? '6 4' : 'none');
        part.setAttribute('opacity', tornShown.toFixed(3));
      }
      const apexGap = depth + (scene.cut ? TORN_LABEL_GAP : LABEL_GAP);
      const tornNow = flowing ? chord / geo.scale : gapOf(scene, cutA);
      placeLabel(
        drawn.labels[edges],
        { x: mx + tnx * apexGap, y: my + tny * apexGap },
        tornLabelText(scene, tornNow),
        scene.cut ? c.danger : c.text,
        scene.tornMarked ? c.danger : 'none',
        tornShown,
      );

      // ── 점
      for (let i = 0; i < n; i += 1) {
        const p = pts[i];
        const atCut = scene.cut && (i === cutA || i === cutB);
        const probed =
          (scene.tornMarked && (i === cutA || i === cutB)) ||
          (scene.farMarked && (i === scene.farPair[0] || i === scene.farPair[1]));
        const beat = f.pulseAt.includes(i) ? f.pulse : 0;
        const r = BEAD_R * grown(i) * (1 + 0.3 * beat);
        const { dot, num } = drawn.beads[i];
        dot.setAttribute('cx', p.x.toFixed(1));
        dot.setAttribute('cy', p.y.toFixed(1));
        dot.setAttribute('r', r.toFixed(2));
        // 채움은 형편(끊긴 쌍의 끝인가), 테두리 굵기는 표식(짚어 확인했다).
        dot.setAttribute('fill', atCut ? c.danger : c.itemDefault);
        dot.setAttribute('stroke-width', String(probed ? BEAD_MARK_W : BEAD_STROKE_W));
        num.setAttribute('x', p.x.toFixed(1));
        num.setAttribute('y', p.y.toFixed(1));
        num.setAttribute('fill', atCut ? c.stateInk : c.text);
        num.setAttribute('opacity', clamp01(grown(i) * 1.6 - 0.6).toFixed(3));
      }

      // ── 마주 보는 쌍을 견주는 두 자
      const far = drawn.far;
      if (far === null) return;
      const [fa, fb] = scene.farPair;
      const { before, after } = farGap(scene);
      const xa = pts[fa].x;
      const xb = pts[fb].x;
      const x0 = Math.min(xa, xb);
      const beforeEnd = x0 + before * geo.scale;
      const nowLen = after * f.farGrow;
      const afterEnd = x0 + nowLen * geo.scale;
      for (const [guide, gx] of [
        [far.guideA, xa],
        [far.guideB, xb],
      ] as Array<[SVGLineElement, number]>) {
        guide.setAttribute('x1', gx.toFixed(1));
        guide.setAttribute('x2', gx.toFixed(1));
        guide.setAttribute('y1', String(LINE_Y + BEAD_R + 3));
        guide.setAttribute('y2', String(FAR_ROW_A + 5));
      }
      // 견줌의 기준은 점선(테두리 어휘), 지금 값은 채운 막대다.
      far.barBefore.setAttribute('x1', x0.toFixed(1));
      far.barBefore.setAttribute('x2', beforeEnd.toFixed(1));
      far.barBefore.setAttribute('y1', String(FAR_ROW_B));
      far.barBefore.setAttribute('y2', String(FAR_ROW_B));
      far.barAfter.setAttribute('x', x0.toFixed(1));
      far.barAfter.setAttribute('y', String(FAR_ROW_A - 2.5));
      far.barAfter.setAttribute('width', Math.max(0, afterEnd - x0).toFixed(1));
      far.textBefore.textContent = fmt(before);
      far.textBefore.setAttribute('x', (beforeEnd + 7).toFixed(1));
      far.textBefore.setAttribute('y', String(FAR_ROW_B));
      far.textAfter.textContent = fmt(nowLen);
      far.textAfter.setAttribute('x', (afterEnd + 7).toFixed(1));
      far.textAfter.setAttribute('y', String(FAR_ROW_A));
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: KeepNeighborsCloseScene): { geo: Geom; drawn: Drawn } | null {
      clear();

      gCaption.appendChild(
        (() => {
          const node = el<SVGTextElement>('text', {
            x: String(W / 2),
            y: String(CAPTION_Y),
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.text,
          });
          node.textContent = captionFor(scene);
          return node;
        })(),
      );

      const geo = geomOf(scene);
      // 아직 고리가 서지 않았으면 아무것도 짓지 않는다 — 숨기는 것과 다르다.
      if (geo === null || !scene.raised) return null;

      const n = geo.n;
      const guide = el<SVGCircleElement>('circle', {
        fill: 'none',
        stroke: c.border,
        'stroke-width': '1.4',
        r: '0',
        cx: '0',
        cy: '0',
        opacity: '0',
      });
      gGuide.appendChild(guide);

      const links: SVGLineElement[] = [];
      const flashes: SVGLineElement[] = [];
      for (let i = 0; i < n - 1; i += 1) {
        flashes.push(
          gFlash.appendChild(
            el<SVGLineElement>('line', {
              stroke: c.accent,
              'stroke-width': '7',
              'stroke-linecap': 'round',
              opacity: '0',
              x1: '0',
              y1: '0',
              x2: '0',
              y2: '0',
            }),
          ),
        );
        links.push(
          gLink.appendChild(
            el<SVGLineElement>('line', {
              stroke: c.text,
              'stroke-linecap': 'round',
              'stroke-width': String(LINK_W),
              x1: '0',
              y1: '0',
              x2: '0',
              y2: '0',
            }),
          ),
        );
      }

      const tornHead = gTorn.appendChild(
        el<SVGPolylineElement>('polyline', {
          fill: 'none',
          stroke: c.text,
          'stroke-width': String(LINK_W),
          'stroke-linecap': 'round',
          points: '',
        }),
      );
      const tornTail = gTorn.appendChild(
        el<SVGPolylineElement>('polyline', {
          fill: 'none',
          stroke: c.text,
          'stroke-width': String(LINK_W),
          'stroke-linecap': 'round',
          points: '',
        }),
      );

      const labels: Row[] = [];
      const beads: { dot: SVGCircleElement; num: SVGTextElement }[] = [];
      for (let i = 0; i < n; i += 1) {
        const group = el<SVGGElement>('g', { opacity: '0' });
        const chip = el<SVGRectElement>('rect', {
          fill: c.bg,
          stroke: 'none',
          'stroke-width': '1',
          rx: '3',
          x: '0',
          y: '0',
          width: '0',
          height: '15',
        });
        const text = el<SVGTextElement>('text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.text,
          x: '0',
          y: '0',
        });
        group.appendChild(chip);
        group.appendChild(text);
        gLabel.appendChild(group);
        labels.push({ group, chip, text });

        const bead = el<SVGGElement>('g', {});
        const dot = el<SVGCircleElement>('circle', {
          fill: c.itemDefault,
          stroke: c.text,
          'stroke-width': String(BEAD_STROKE_W),
          r: '0',
          cx: '0',
          cy: '0',
        });
        const num = el<SVGTextElement>('text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.text,
          x: '0',
          y: '0',
        });
        num.textContent = String(i);
        bead.appendChild(dot);
        bead.appendChild(num);
        gBead.appendChild(bead);
        beads.push({ dot, num });
      }

      const far: FarParts | null = !scene.farMarked
        ? null
        : {
            guideA: gFar.appendChild(
              el<SVGLineElement>('line', {
                stroke: c.textMuted,
                'stroke-width': '1',
                'stroke-dasharray': '2 3',
                opacity: '0.9',
                x1: '0',
                y1: '0',
                x2: '0',
                y2: '0',
              }),
            ),
            guideB: gFar.appendChild(
              el<SVGLineElement>('line', {
                stroke: c.textMuted,
                'stroke-width': '1',
                'stroke-dasharray': '2 3',
                opacity: '0.9',
                x1: '0',
                y1: '0',
                x2: '0',
                y2: '0',
              }),
            ),
            barBefore: gFar.appendChild(
              el<SVGLineElement>('line', {
                stroke: c.textMuted,
                'stroke-width': '2',
                'stroke-dasharray': '5 4',
                x1: '0',
                y1: '0',
                x2: '0',
                y2: '0',
              }),
            ),
            barAfter: gFar.appendChild(
              el<SVGRectElement>('rect', {
                fill: c.accent,
                stroke: c.text,
                'stroke-width': '0.8',
                rx: '2',
                x: '0',
                y: '0',
                width: '0',
                height: '5',
              }),
            ),
            textBefore: gFar.appendChild(
              el<SVGTextElement>('text', {
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                'dominant-baseline': 'middle',
                fill: c.textMuted,
                x: '0',
                y: '0',
              }),
            ),
            textAfter: gFar.appendChild(
              el<SVGTextElement>('text', {
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                'dominant-baseline': 'middle',
                fill: c.text,
                x: '0',
                y: '0',
              }),
            ),
          };

      const drawn: Drawn = { guide, links, flashes, labels, beads, tornHead, tornTail, far };
      paint(scene, geo, drawn, frameOf(scene));
      return { geo, drawn };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 끝 자리는 전부 `frameOf(scene)` 와 같다. 그래서 흘려 세운 화면과 곧바로 세운
    // 화면이 글자 하나 다르지 않다.

    /** 점들이 차례로 자라고 안내 고리가 뜬다. */
    function flowRing(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const base = frameOf(scene);
      return tween(RING_MS, mine, (p) => {
        paint(scene, geo, drawn, { ...base, grow: p, guide: p });
      });
    }

    /** 이음 한 곳이 벌어지고 두 끝이 한 번 뛴다. */
    function flowCut(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const base = frameOf(scene);
      const ends = [scene.cutAt, nextOf(scene, scene.cutAt)];
      return tween(CUT_MS, mine, (p) => {
        paint(scene, geo, drawn, { ...base, tear: ease(p), pulse: bump(p), pulseAt: ends });
      });
    }

    /** 꺾임이 풀리며 고리가 줄이 된다. 안내 고리는 그 사이에 스러진다. */
    function flowUnroll(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const base = frameOf(scene);
      return tween(UNROLL_MS, mine, (p) => {
        const e = ease(p);
        paint(scene, geo, drawn, { ...base, t: e, guide: Math.max(0, 1 - e * 2.4) });
      });
    }

    /** 지켜진 쌍을 왼쪽부터 훑는다. 훑고 지나간 자리에 표식이 남는다. */
    function flowKept(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const base = frameOf(scene);
      return tween(KEPT_MS, mine, (p) => {
        paint(scene, geo, drawn, { ...base, keptWave: p });
      });
    }

    /** 찢어진 쌍이 한 번 뛴다. 딱지는 그때 원래 거리와 지금 거리를 함께 말한다. */
    function flowTorn(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const base = frameOf(scene);
      const ends = [scene.cutAt, nextOf(scene, scene.cutAt)];
      return tween(TORN_MS, mine, (p) => {
        paint(scene, geo, drawn, { ...base, pulse: bump(p), pulseAt: ends });
      });
    }

    /** 마주 보는 쌍의 자가 자란다. 뜸을 한 번 들이고 나서야 자란다. */
    async function flowFar(
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const base = frameOf(scene);
      paint(scene, geo, drawn, { ...base, farGrow: 0 });
      await wait(FAR_HOLD_MS, mine);
      if (!alive(mine)) return;
      await tween(FAR_MS, mine, (p) => {
        paint(scene, geo, drawn, { ...base, farGrow: ease(p) });
      });
    }

    function flowFor(
      step: KeepNeighborsCloseStep,
      scene: KeepNeighborsCloseScene,
      geo: Geom,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'ring':
          return flowRing(scene, geo, drawn, mine);
        case 'cut':
          return flowCut(scene, geo, drawn, mine);
        case 'unroll':
          return flowUnroll(scene, geo, drawn, mine);
        case 'kept':
          return flowKept(scene, geo, drawn, mine);
        case 'torn':
          return flowTorn(scene, geo, drawn, mine);
        case 'far':
          return flowFar(scene, geo, drawn, mine);
        case 'finish':
          // 마지막 걸음은 캡션만 바뀐다. 흐를 것이 없다.
          return Promise.resolve();
      }
    }

    async function render(
      next: KeepNeighborsCloseScene,
      _prev: KeepNeighborsCloseScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const built = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || built === null) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, built.geo, built.drawn, mine);
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
        canvas.textContent = '';
      },
    };
  },
};
