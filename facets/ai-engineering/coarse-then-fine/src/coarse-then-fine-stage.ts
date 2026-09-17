/**
 * coarse-then-fine-stage View — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 왜 이 그림인가
 *
 * 물음의 동사가 "내려온다" 라서 층이 실제로 아래에 있어야 하고, "자리를 물려준다"
 * 라서 같은 좌표가 층마다 같은 자리에 있어야 한다. 그래서 층 셋을 **같은 축척의
 * 판 세 장**으로 그리고 아래층으로 갈수록 일정한 낙차만큼 내려 깐다. 한 점이
 * 아래층으로 내려가는 길은 언제나 같은 벡터라, 걸어가는 것과 물려주는 것이
 * 화면에서 다른 몸짓이 된다.
 *
 * 판을 눕혀(비스듬히) 얇게 만들면 세로로 훨씬 짧아지지만, 그러면 거리가 방향마다
 * 다르게 찌그러져 **"어느 것이 더 가까운가" 가 화면에서 거짓이 된다.** 이 조각은
 * 가장 가까운 점을 찾는 이야기라 그 왜곡을 받을 수 없다. 판을 찌그러뜨리지 않고
 * 계단처럼 어긋 쌓는 것은 그 때문이다.
 *
 * ── 본 점을 세는 법 (화면이 거짓을 말하지 않게)
 *
 * 한 점은 **처음 거리를 잰 층에서만** 켜진다. 아래층으로 물려받은 자리는 다시
 * 재지 않으므로 표시도 늘지 않는다 — 그것이 층을 쌓아 아끼는 바로 그 몫이다.
 * 켜지는 점도 캡션의 "본 점" 도 `scene.ts` 의 `measuredAt` 하나를 지나므로 **화면을
 * 세어 캡션을 반증할 수 있다.**
 *
 * ── 이행이 고친 화면 하나 — 견줄 짝이 사라지고 있었다 (함정 7)
 *
 * 옛 `flat()` 은 마지막 걸음에서 **판을 통째로 비웠다** — 층마다의 자취를 지우고
 * 켜진 점을 전부 끄고 물려줌 점선까지 걷어낸 뒤 맨 아래 판에서 다시 걸었다. 그래서
 * 완주 화면에는 *한 층만 쓴 쪽*만 남고, 이 조각의 주장인 **"여덟 대 열다섯"** 의
 * 앞엣것이 화면에서 사라졌다. 두 수를 견주는 일이 시간차를 둔 캡션 둘에만 있었다.
 *
 * 지금은 지우지 않고 **어휘를 가른다** — 아래 "채움과 테두리" 를 보라. 세 판에 걸친
 * 채운 점 여덟과 맨 아래 판의 고리 열다섯이 완주 화면에 함께 서서, 둘 다 세어 볼 수
 * 있다.
 *
 * ── 이행이 고친 화면 둘 — 멈추는 근거가 지워지고 있었다
 *
 * `stop` 은 "여기서 멈춘다" 는 판정인데, 그 근거인 방사선(견준 이웃들)을 걸음 끝에
 * `clearSpokes` 가 지웠다. 지금은 **마지막 견줌의 방사선이 화면에 남는다** — 넷을 다
 * 재 보았는데 십자에 더 가까운 것이 없더라는 것이 그림에 선다.
 *
 * ── 이행이 고친 화면 셋 — 걷는 이의 출발 자리를 화면에서 되읽었다 (함정 28)
 *
 * 옛 `flat()` 은 `Number(walker.getAttribute('cx'))` 로 걷는 이가 서 있던 자리를
 * 도로 읽어 거기서부터 움직였다. 되짚어 세운 직후에는 그 값이 옛 화면의 것이라
 * 엉뚱한 데서 걷기 시작한다. 지금은 자취 한 칸을 물려 셈한다 (`layeredNodeOf`).
 *
 * ── 채움과 테두리를 가른다 (함정 23 · 29)
 *
 * - **채움(fill) = 값의 형편** — 층을 내려오며 **거리를 잰 점**이 `itemComparing` 으로
 *   채워지고 조금 커진다. 세 판에 걸쳐 남으므로 완주 화면에서 세면 여덟이다.
 * - **테두리(stroke) = 견줌의 표식** — 한 층만 쓰는 견줌이 짚은 점에는 `auxCursor`
 *   고리가 둘린다. 맨 아래 판에만 서고, 세면 열다섯이다.
 * - 걷는 이는 `accent` 고리다 — 주 커서와 보조 견줌을 색으로 가른다.
 *
 * 셋 다 **머무는 표식**이라 정적 그리기가 세우고, 되짚어도 남는다 (S-scene PREFER).
 * 방사선(점선)과 물려줌 점선은 `textMuted` — 표식이 아니라 몸짓의 자국이다.
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게
 * 한다 (S-scene MUST NOT). 원래도 `transition` 은 없었고 `setTimeout` 보간이었다 —
 * 그대로 두되 세대 빗장을 달았다. rAF 로 옮기지 않는 까닭은 걸음이 프레임 없는
 * 자리에서도 돌아야 하기 때문이다.
 *
 * 한 걸음에서 흐르는 것이 여럿이면 **시계를 나누지 않고** 한 `tween` 안에서 마디마다
 * 시차를 준다 — 이웃을 보는 것과 옮기는 것은 한 뜻으로 묶인 운동이라 그래야
 * `render` 의 Promise 도 전부 선 뒤에 구조적으로 풀린다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다. 판 크기는 캔버스에서 역산하고 상수로는 **상한**만 둔다
 * (S-piece).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  freshlyMeasuredOf,
  lastProbeOf,
  layeredNodeOf,
  measuredAt,
  walkerLayerOf,
  walkerNodeOf,
  type CoarseCaption,
  type CoarseThenFineScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 가로는 러너가 정한다 (S-view). 세로는 이 그림이 정한다. */
const CANVAS_W = PIECE_CANVAS_W;
const CANVAS_H = 402;

/** 좌우 최소 여백. 판 크기는 여기서 역산한다 — 상수로는 상한만 둔다. */
const SIDE_MIN = 24;
/** 판과 판 사이 가로 틈. */
const SHEET_GAP = 6;
/** 판 테두리와 점 사이. */
const SHEET_PAD = 16;
/** 평면 한 칸의 화면 길이 상한. */
const UNIT_MAX = 16;
/** 층 하나만큼의 낙차. */
const DROP = 88;
const TOP = 12;
/** 판 아래 캡션이 차지하는 몫 (첫 줄까지의 틈 + 둘째 줄 + 꼬리). */
const CAPTION_GAP = 18;
const CAPTION_LINE = 17;
const CAPTION_BLOCK = CAPTION_GAP + CAPTION_LINE + 12;

const DOT_R = 4.5;
/** 거리를 잰 점. 채움이 바뀌고 조금 커진다. */
const SEEN_R = 5.5;
/** 한 층만 쓰는 견줌이 짚은 점을 두르는 고리. */
const FLAT_R = 8.4;
const WALKER_R = 9.5;
/** 답의 고리가 부푼 끝. */
const FOUND_R = WALKER_R + 6;
/** 멈춤에서 고리가 부푸는 폭. */
const STOP_BUMP = 4;
/** 들어설 때 걷는 이가 떨어지는 높이. */
const ENTER_DY = 26;
/** 한 층만 쓰는 견줌에서 위층이 물러나는 만큼. */
const DIM = 0.55;

// ── 박자 ────────────────────────────────────────────────────────────────
/** 들어서는 데 드는 시간 (ms). */
const ENTER_MS = 320;
/** 이웃을 둘러보는 데 드는 시간 (ms). */
const LOOK_HOP_MS = 200;
const LOOK_DOWN_MS = 240;
const LOOK_STOP_MS = 260;
/** 한 칸 옮기는 데 드는 시간 (ms). */
const MOVE_MS = 420;
/** 층을 내려가는 데 드는 시간 (ms). */
const DOWN_MS = 560;
/** 갈 곳이 없어 고리가 한 번 부풀었다 돌아오는 시간 (ms). */
const PULSE_MS = 340;
/** 답의 고리가 부푸는 시간 (ms). */
const FOUND_MS = 420;
/** 위층이 물러나는 시간 (ms). */
const DIM_MS = 240;
/** 맨 아래 판의 출발점까지 건너가는 시간 (ms). */
const APPROACH_MS = 360;
/** 한 층만으로 쓸어 가는 시간 (ms). */
const SWEEP_MS = 1400;
/** 보간 한 프레임. rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

/**
 * 사이의 한 자리.
 *
 * 양 끝에서는 보간값이 아니라 **목표값을 그대로** 쓴다. `a + (b - a) * 1` 은 부동
 * 소수 끝자리가 흘러 `250.70000000000005` 가 되고, 그러면 흘려 세운 화면과 곧바로
 * 세운 화면이 글자 하나 어긋난다 (프로토콜 4 절).
 */
function at(a: number, b: number, e: number): number {
  if (e >= 1) return b;
  if (e <= 0) return a;
  return a + (b - a) * e;
}

/**
 * 보간이 끝나면 속성을 **지운다**.
 *
 * `setAttribute(…, '1')` 로 되돌리면 흘려 세운 화면에만 그 속성이 남아 곧바로 세운
 * 화면과 글자 하나가 어긋난다 (프로토콜 4 절).
 */
function fade(node: Element, e: number): void {
  if (e >= 1) node.removeAttribute('opacity');
  else node.setAttribute('opacity', String(e));
}

type Spot = { x: number; y: number };

/**
 * 자리와 치수. 바탕에서 매번 셈하므로 걸음마다 같은 값이 나온다.
 *
 * 척도를 `mount` 이 한 번 재어 클로저에 적어 두면 정하는 자리와 쓰는 자리가
 * 갈라진다 — 장면이 담는 것은 픽셀이 아니라 구조다 (S-piece).
 */
type Geom = {
  /** 층이 몇 장인가. */
  depth: number;
  sheetW: number;
  sheetH: number;
  /** 판 하나에서 다음 판까지의 가로 거리. */
  stride: number;
  originX: number;
  captionY: number;
  captionW: number;
  sheetX(li: number): number;
  sheetY(li: number): number;
  /** 그 판에서 그 점이 앉는 자리. 없는 점이면 판 한가운데. */
  spotOf(li: number, id: string): Spot;
  /** 그 판에서 자료 좌표가 앉는 자리. */
  place(li: number, x: number, y: number): Spot;
};

function geomOf(scene: CoarseThenFineScene): Geom | null {
  const depth = scene.layers.length;
  if (depth === 0 || scene.points.length === 0) return null;

  const byId = new Map(scene.points.map((p) => [p.id, p]));
  const xs = scene.points.map((p) => p.x).concat(scene.query.x);
  const ys = scene.points.map((p) => p.y).concat(scene.query.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  const sheetWMax = (CANVAS_W - SIDE_MIN * 2 - (depth - 1) * SHEET_GAP) / depth;
  const roomH = CANVAS_H - TOP - (depth - 1) * DROP - CAPTION_BLOCK;
  const unit = Math.max(
    6,
    Math.floor(
      Math.min(UNIT_MAX, (sheetWMax - SHEET_PAD * 2) / spanX, (roomH - SHEET_PAD * 2) / spanY),
    ),
  );
  const sheetW = spanX * unit + SHEET_PAD * 2;
  const sheetH = spanY * unit + SHEET_PAD * 2;
  const stride = sheetW + SHEET_GAP;
  const originX = Math.round((CANVAS_W - (depth * sheetW + (depth - 1) * SHEET_GAP)) / 2);

  const sheetX = (li: number): number => originX + li * stride;
  const sheetY = (li: number): number => TOP + li * DROP;
  const place = (li: number, x: number, y: number): Spot => ({
    x: sheetX(li) + SHEET_PAD + (x - minX) * unit,
    y: sheetY(li) + SHEET_PAD + (maxY - y) * unit,
  });

  return {
    depth,
    sheetW,
    sheetH,
    stride,
    originX,
    captionY: TOP + (depth - 1) * DROP + sheetH + CAPTION_GAP,
    captionW: depth * sheetW + (depth - 1) * SHEET_GAP,
    sheetX,
    sheetY,
    place,
    spotOf(li: number, id: string): Spot {
      const p = byId.get(id);
      if (!p) return { x: sheetX(li) + sheetW / 2, y: sheetY(li) + sheetH / 2 };
      return place(li, p.x, p.y);
    },
  };
}

/**
 * 정적 그리기가 세워 둔 손잡이들.
 *
 * `render` 안에서만 살고 밖으로 새지 않는다 — 걸음을 건너 살아남지 않으므로
 * 상태가 아니다 (함정 24).
 */
type Drawn = {
  geom: Geom | null;
  /** 판마다의 점 손잡이. 새로 잰 점이 커지는 자리다. */
  dots: Map<string, SVGCircleElement>[];
  /** 마지막 견줌의 방사선. */
  spokes: SVGLineElement[];
  /** 마지막 자취 선 — 지금 걸음이 그은 것. */
  trail: SVGLineElement | null;
  /** 마지막 물려줌 점선. */
  drop: SVGLineElement | null;
  /** 답의 고리. */
  foundRing: SVGCircleElement | null;
  walker: SVGCircleElement | null;
  walkerTag: SVGTextElement | null;
  /** 한 층만 쓰는 견줌의 쓸기 자국. */
  sweep: SVGPolylineElement | null;
  /** 그 견줌이 짚은 점을 두른 고리들, 짚은 차례대로. */
  flatRings: SVGCircleElement[];
  /** 그 견줌에서 물러나는 것들 — 위층들과 물려줌 점선. */
  dimmed: SVGElement[];
};

const EMPTY_DRAWN: Drawn = {
  geom: null,
  dots: [],
  spokes: [],
  trail: null,
  drop: null,
  foundRing: null,
  walker: null,
  walkerTag: null,
  sweep: null,
  flatRings: [],
  dimmed: [],
};

export const coarseThenFineStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CoarseThenFineScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    /** 걸음마다 통째로 다시 세우는 층. 정적 그리기가 비우고 채운다. */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * `resolve` 를 `waiters` 에 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던
     * 약속이 함께 풀린다 — 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이
     * 영영 안 풀린다 (S-piece).
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

    function captionText(cap: CoarseCaption): string {
      switch (cap.kind) {
        case 'enter':
          return t(
            'caption.enter',
            'The top layer holds only a few points. The cross is the target; start at {node}.',
            { node: cap.node },
          );
        case 'hop':
          return t('caption.hop', 'A neighbor sits nearer the cross. Move {from} to {to}.', {
            from: cap.from,
            to: cap.to,
          });
        case 'handDown':
          return t(
            'caption.handDown',
            'No neighbor here is nearer. Hand the spot down to {layer}. Seen so far: {n}.',
            { layer: cap.layer, n: cap.n },
          );
        case 'stop':
          return t(
            'caption.stop',
            'The bottom layer has no nearer neighbor either. Seen so far: {n}.',
            { n: cap.n },
          );
        case 'found':
          return t('caption.found', 'Nearest is {node}. Points measured: {n} of {total}.', {
            node: cap.node,
            n: cap.n,
            total: cap.total,
          });
        case 'flat':
          return t(
            'caption.flat',
            'One layer alone lands on the same {node}, measuring {n} of {total}.',
            { node: cap.node, n: cap.n, total: cap.total },
          );
      }
    }

    /** SVG 는 스스로 줄을 바꾸지 않으므로 폭을 어림해 두 줄로 나눈다. */
    function splitCaption(text: string, width: number): [string, string] {
      const widthOf = (s: string): number => {
        let w = 0;
        for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 12 : 6.6;
        return w;
      };
      let head = '';
      let tail = '';
      for (const word of text.split(' ')) {
        const next = head === '' ? word : `${head} ${word}`;
        if (tail === '' && widthOf(next) <= width) head = next;
        else tail = tail === '' ? word : `${tail} ${word}`;
      }
      return [head, tail];
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * `step` 을 읽지 않는다 — 읽으면 흘려 세운 경로와 곧바로 세운 경로가 같은
     * 걸음을 달리 그릴 여지가 생기고, 그것을 자체 검증이 못 잡는다 (S-scene).
     * 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
     */
    function drawStatic(scene: CoarseThenFineScene): Drawn {
      root.textContent = '';
      const geom = geomOf(scene);
      if (geom === null) return EMPTY_DRAWN;

      const drawn: Drawn = {
        geom,
        dots: [],
        spokes: [],
        trail: null,
        drop: null,
        foundRing: null,
        walker: null,
        walkerTag: null,
        sweep: null,
        flatRings: [],
        dimmed: [],
      };

      const measured = measuredAt(scene);
      const probe = lastProbeOf(scene);
      const bottom = geom.depth - 1;
      const flat = scene.flat;

      // ── 판 세 장. 같은 축척 · 같은 자리 · 다른 것은 찍힌 점의 수뿐이다.
      for (let li = 0; li < geom.depth; li += 1) {
        const layer = scene.layers[li];
        if (layer === undefined) continue;
        const sheet = el('g');
        // 한 층만 쓰는 견줌에서는 위층이 물러난다 — 쓰이지 않는다는 뜻이다.
        if (flat !== null && li < bottom) {
          sheet.setAttribute('opacity', String(DIM));
          drawn.dimmed.push(sheet);
        }

        sheet.appendChild(
          el('rect', {
            x: geom.sheetX(li),
            y: geom.sheetY(li),
            width: geom.sheetW,
            height: geom.sheetH,
            rx: 8,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );

        // 층 이름은 데이터이자 표식이다 — 키를 만들지 않는다 (C10).
        const name = el('text', {
          x: geom.sheetX(li) + 7,
          y: geom.sheetY(li) + 12,
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        name.textContent = layer.id;
        sheet.appendChild(name);

        // ── 걸어온 자취. 이 층에서 옮긴 걸음마다 선 하나다.
        const trails = el('g');
        for (const walk of scene.probes) {
          if (walk.layer !== li || walk.outcome !== 'hop' || walk.to === null) continue;
          const a = geom.spotOf(li, walk.at);
          const b = geom.spotOf(li, walk.to);
          const line = el('line', {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: colors.text,
            'stroke-width': 1.8,
          });
          trails.appendChild(line);
          drawn.trail = line;
        }
        // 한 층만 쓰는 견줌의 쓸기 자국. 맨 아래 판에만 선다.
        if (flat !== null && li === bottom && flat.path.length > 0) {
          const stops = flat.path.map((id) => geom.spotOf(li, id));
          const sweep = el('polyline', {
            points: stops.map((s) => `${s.x},${s.y}`).join(' '),
            fill: 'none',
            stroke: colors.auxCursor,
            'stroke-width': 1.8,
          });
          trails.appendChild(sweep);
          drawn.sweep = sweep;
        }
        sheet.appendChild(trails);

        // ── 지금 자리에서 견주고 있는 이웃들. 멈춤의 근거가 화면에 남는다.
        const spokes = el('g');
        if (probe !== null && probe.layer === li) {
          const a = geom.spotOf(li, probe.at);
          for (const id of probe.cands) {
            const b = geom.spotOf(li, id);
            const line = el('line', {
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            });
            spokes.appendChild(line);
            drawn.spokes.push(line);
          }
        }
        sheet.appendChild(spokes);

        // ── 점. 처음 거리를 잰 층에서만 켜진다 (채움 = 값의 형편).
        const dots = new Map<string, SVGCircleElement>();
        for (const id of layer.members) {
          const spot = geom.spotOf(li, id);
          const lit = measured.get(id) === li;
          const dot = el('circle', {
            cx: spot.x,
            cy: spot.y,
            r: lit ? SEEN_R : DOT_R,
            fill: lit ? colors.itemComparing : colors.itemDefault,
            stroke: lit ? colors.itemComparing : colors.border,
            'stroke-width': 1.2,
          });
          dots.set(id, dot);
          sheet.appendChild(dot);
        }
        drawn.dots.push(dots);

        // ── 한 층만 쓰는 견줌이 짚은 점 (테두리 = 견줌의 표식).
        if (flat !== null && li === bottom) {
          for (const id of flat.seen) {
            const spot = geom.spotOf(li, id);
            const ring = el('circle', {
              cx: spot.x,
              cy: spot.y,
              r: FLAT_R,
              fill: 'none',
              stroke: colors.auxCursor,
              'stroke-width': 1.6,
            });
            sheet.appendChild(ring);
            drawn.flatRings.push(ring);
          }
        }

        // ── 찾는 자리. 층마다 같은 평면이므로 같은 자리에 놓인다.
        const q = geom.place(li, scene.query.x, scene.query.y);
        sheet.appendChild(
          el('path', {
            d: `M ${q.x - 7} ${q.y} H ${q.x + 7} M ${q.x} ${q.y - 7} V ${q.y + 7}`,
            stroke: colors.text,
            'stroke-width': 1.5,
            fill: 'none',
          }),
        );
        sheet.appendChild(
          el('circle', {
            cx: q.x,
            cy: q.y,
            r: 3.2,
            fill: 'none',
            stroke: colors.text,
            'stroke-width': 1.2,
          }),
        );

        root.appendChild(sheet);
      }

      // ── 층에서 층으로 물려준 자리. 판 사이를 가로지르므로 판 위에 얹는다.
      const drops = el('g');
      if (flat !== null) {
        drops.setAttribute('opacity', String(DIM));
        drawn.dimmed.push(drops);
      }
      for (const walk of scene.probes) {
        if (walk.outcome !== 'hand-down') continue;
        const a = geom.spotOf(walk.layer, walk.at);
        const b = geom.spotOf(Math.min(bottom, walk.layer + 1), walk.at);
        const line = el('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: colors.textMuted,
          'stroke-width': 1.4,
          'stroke-dasharray': '5 4',
        });
        drops.appendChild(line);
        drawn.drop = line;
      }
      root.appendChild(drops);

      // ── 답. 맨 아래 판의 그 자리에 고리가 남는다.
      const answer = scene.found ? layeredNodeOf(scene) : null;
      if (answer !== null) {
        const spot = geom.spotOf(bottom, answer);
        const ring = el('circle', {
          cx: spot.x,
          cy: spot.y,
          r: FOUND_R,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2,
        });
        root.appendChild(ring);
        drawn.foundRing = ring;
      }

      // ── 걷는 이. 점이 아니라 그 위에 씌운 고리로 보인다.
      const standing = walkerNodeOf(scene);
      if (standing !== null) {
        const walker = el('circle', {
          cx: 0,
          cy: 0,
          r: WALKER_R,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2.6,
        });
        const tag = el('text', {
          x: 0,
          y: 0,
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        tag.textContent = standing;
        root.append(walker, tag);
        drawn.walker = walker;
        drawn.walkerTag = tag;
        const spot = geom.spotOf(walkerLayerOf(scene), standing);
        placeWalker(drawn, spot.x, spot.y);
      }

      // ── 캡션. 자취가 정하므로 되짚어도 같은 자리에 같은 말이 선다.
      const cap = captionOf(scene);
      const [head, tail] = cap === null ? ['', ''] : splitCaption(captionText(cap), geom.captionW);
      for (const [i, line] of [head, tail].entries()) {
        const node = el('text', {
          x: geom.originX,
          y: geom.captionY + i * CAPTION_LINE,
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        node.textContent = line;
        root.appendChild(node);
      }

      return drawn;
    }

    /** 걷는 이와 그 이름표를 그 자리에 놓는다. 이름표는 판 밖으로 나가지 않게 붙는다. */
    function placeWalker(drawn: Drawn, x: number, y: number): void {
      const geom = drawn.geom;
      if (geom === null || drawn.walker === null || drawn.walkerTag === null) return;
      drawn.walker.setAttribute('cx', String(x));
      drawn.walker.setAttribute('cy', String(y));
      const li = Math.max(0, Math.min(geom.depth - 1, Math.round((x - geom.originX) / geom.stride)));
      const rightHalf = x > geom.sheetX(li) + geom.sheetW / 2;
      drawn.walkerTag.setAttribute('x', String(x + (rightHalf ? -13 : 13)));
      drawn.walkerTag.setAttribute('y', String(y - 11));
      drawn.walkerTag.setAttribute('text-anchor', rightHalf ? 'end' : 'start');
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 아직 못 온 만큼을
    // 뒤로 물리는 꼴이 된다. 출발 그림은 `prev` 를 들추지 않고 자취에서 셈한다
    // (S-scene).

    /** 이번 걸음에 처음 잰 점들이 커진다. 재는 일이 곧 커지는 일이다. */
    function growFresh(scene: CoarseThenFineScene, drawn: Drawn, li: number, e: number): void {
      const dots = drawn.dots[li];
      if (dots === undefined) return;
      for (const id of freshlyMeasuredOf(scene)) {
        const dot = dots.get(id);
        if (dot === undefined) continue;
        dot.setAttribute('r', String(e >= 1 ? SEEN_R : at(DOT_R, SEEN_R, e)));
      }
    }

    /** 방사선이 하나씩이 아니라 한 번에 뻗는다 — 한 자리에서 이웃을 다 본다. */
    function showSpokes(drawn: Drawn, e: number): void {
      for (const line of drawn.spokes) fade(line, e);
    }

    /** 들어선다 — 위에서 내려앉으며 나타난다. */
    function flowEnter(scene: CoarseThenFineScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const node = walkerNodeOf(scene);
      if (geom === null || node === null) return Promise.resolve();
      const spot = geom.spotOf(walkerLayerOf(scene), node);

      return tween(ENTER_MS, mine, (p) => {
        const e = ease(p);
        placeWalker(drawn, spot.x, at(spot.y - ENTER_DY, spot.y, e));
        if (drawn.walker !== null) fade(drawn.walker, e);
        if (drawn.walkerTag !== null) fade(drawn.walkerTag, e);
        growFresh(scene, drawn, walkerLayerOf(scene), e);
      });
    }

    /** 이웃을 둘러본 뒤 더 가까운 쪽으로 옮긴다. 자취가 뒤따라 그어진다. */
    function flowHop(scene: CoarseThenFineScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const probe = lastProbeOf(scene);
      if (geom === null || probe === null || probe.to === null) return Promise.resolve();
      const a = geom.spotOf(probe.layer, probe.at);
      const b = geom.spotOf(probe.layer, probe.to);
      const total = LOOK_HOP_MS + MOVE_MS;

      return tween(total, mine, (p) => {
        const now = p * total;
        const look = clamp01(now / LOOK_HOP_MS);
        showSpokes(drawn, look);
        growFresh(scene, drawn, probe.layer, look);

        const go = ease(clamp01((now - LOOK_HOP_MS) / MOVE_MS));
        const x = at(a.x, b.x, go);
        const y = at(a.y, b.y, go);
        placeWalker(drawn, x, y);
        if (drawn.trail !== null) {
          drawn.trail.setAttribute('x2', String(x));
          drawn.trail.setAttribute('y2', String(y));
        }
      });
    }

    /** 자리를 아래층에 물려준다 — 점선이 판을 가로질러 내려간다. */
    function flowHandDown(scene: CoarseThenFineScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const probe = lastProbeOf(scene);
      if (geom === null || probe === null) return Promise.resolve();
      const below = Math.min(geom.depth - 1, probe.layer + 1);
      const a = geom.spotOf(probe.layer, probe.at);
      const b = geom.spotOf(below, probe.at);
      const total = LOOK_DOWN_MS + DOWN_MS;

      return tween(total, mine, (p) => {
        const now = p * total;
        const look = clamp01(now / LOOK_DOWN_MS);
        showSpokes(drawn, look);
        growFresh(scene, drawn, probe.layer, look);

        const go = ease(clamp01((now - LOOK_DOWN_MS) / DOWN_MS));
        const x = at(a.x, b.x, go);
        const y = at(a.y, b.y, go);
        placeWalker(drawn, x, y);
        if (drawn.drop !== null) {
          drawn.drop.setAttribute('x2', String(x));
          drawn.drop.setAttribute('y2', String(y));
        }
      });
    }

    /** 갈 곳이 없다 — 고리가 한 번 부풀었다 제자리로 돌아온다. */
    function flowStop(scene: CoarseThenFineScene, drawn: Drawn, mine: number): Promise<void> {
      const probe = lastProbeOf(scene);
      if (probe === null) return Promise.resolve();
      const total = LOOK_STOP_MS + PULSE_MS;

      return tween(total, mine, (p) => {
        const now = p * total;
        const look = clamp01(now / LOOK_STOP_MS);
        showSpokes(drawn, look);
        growFresh(scene, drawn, probe.layer, look);

        const q = clamp01((now - LOOK_STOP_MS) / PULSE_MS);
        // 양 끝에서는 상수를 그대로 쓴다 — `sin(π)` 는 0 이 아니다 (함정 35).
        const bump = q <= 0 || q >= 1 ? 0 : STOP_BUMP * Math.sin(Math.PI * q);
        if (drawn.walker !== null) drawn.walker.setAttribute('r', String(WALKER_R + bump));
      });
    }

    /** 답이 난다 — 그 자리에 고리가 한 겹 더 두른다. */
    function flowFound(drawn: Drawn, mine: number): Promise<void> {
      const ring = drawn.foundRing;
      if (ring === null) return Promise.resolve();
      return tween(FOUND_MS, mine, (p) => {
        ring.setAttribute('r', String(at(WALKER_R, FOUND_R, ease(p))));
      });
    }

    /**
     * 한 층만 쓰는 견줌.
     *
     * 위층이 물러나고, 걷는 이가 같은 진입점으로 건너가 맨 아래 판만으로 다시
     * 걷는다. **앞의 결과는 지우지 않는다** — 세 판에 남은 채운 점 여덟과 여기서
     * 둘리는 고리 열다섯이 한 화면에 함께 서는 것이 이 조각의 결론이다.
     */
    function flowFlat(scene: CoarseThenFineScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const flat = scene.flat;
      if (geom === null || flat === null || flat.path.length === 0) return Promise.resolve();

      const bottom = geom.depth - 1;
      const stops = flat.path.map((id) => geom.spotOf(bottom, id));
      const head = stops[0];
      const tail = stops[stops.length - 1];
      const landed = layeredNodeOf(scene);
      if (head === undefined || tail === undefined || landed === null) return Promise.resolve();
      // 층을 내려와 멈춘 자리에서 출발한다. 화면을 되읽지 않는다 (함정 28).
      const from = geom.spotOf(bottom, landed);

      const legs = Math.max(1, stops.length - 1);
      const total = DIM_MS + APPROACH_MS + SWEEP_MS;

      return tween(total, mine, (p) => {
        const now = p * total;

        const back = clamp01(now / DIM_MS);
        for (const node of drawn.dimmed) node.setAttribute('opacity', String(at(1, DIM, back)));

        const sweep = clamp01((now - DIM_MS - APPROACH_MS) / SWEEP_MS);
        if (sweep <= 0) {
          const go = ease(clamp01((now - DIM_MS) / APPROACH_MS));
          placeWalker(drawn, at(from.x, head.x, go), at(from.y, head.y, go));
          if (drawn.sweep !== null) drawn.sweep.setAttribute('points', `${head.x},${head.y}`);
          for (const ring of drawn.flatRings) fade(ring, 0);
          return;
        }

        // 걸음이 지나간 만큼 짚은 점이 둘린다.
        const lit = Math.round(drawn.flatRings.length * sweep);
        drawn.flatRings.forEach((ring, i) => fade(ring, i < lit ? 1 : 0));

        const travel = sweep * legs;
        const leg = Math.min(legs - 1, Math.floor(travel));
        const a = stops[leg];
        const b = stops[leg + 1] ?? a;
        if (a === undefined || b === undefined) return;
        const x = at(a.x, b.x, travel - leg);
        const y = at(a.y, b.y, travel - leg);
        placeWalker(drawn, x, y);
        if (drawn.sweep !== null) {
          drawn.sweep.setAttribute(
            'points',
            stops
              .slice(0, leg + 1)
              .map((s) => `${s.x},${s.y}`)
              .concat(`${x},${y}`)
              .join(' '),
          );
        }
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: CoarseThenFineScene,
      _prev: CoarseThenFineScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'enter':
          await flowEnter(next, drawn, mine);
          break;
        case 'hop':
          await flowHop(next, drawn, mine);
          break;
        case 'handDown':
          await flowHandDown(next, drawn, mine);
          break;
        case 'stop':
          await flowStop(next, drawn, mine);
          break;
        case 'found':
          await flowFound(drawn, mine);
          break;
        case 'flat':
          await flowFlat(next, drawn, mine);
          break;
      }

      if (!alive(mine)) return;
      // 흐르며 남은 속성과 보간의 끝자리가 통째로 사라진다. 되돌릴 목록을 손으로
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
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
