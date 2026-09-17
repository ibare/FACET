/**
 * k-changes-boundary stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 왼쪽은 무대다. 이름표 없는 물음점이 가운데 서고 이름표 있는 점 열이 흩어져 있다.
 * 그 위로 **테두리가 자란다** — 반지름은 k 번째 이웃과 k+1 번째 이웃 거리의 한가운데라,
 * 자라는 동안 담기는 이웃의 수가 딱 k 가 된다.
 *
 * 오른쪽이 주인공이 서는 자리다. 테두리에 든 이웃은 표 하나를 저울로 날려 보내고,
 * 표가 쌓이면 **저울이 기운다.** 기운 쪽이 답이고, 그 답은 물음점의 카드에 새겨진다.
 * k 가 커져 저울이 반대로 넘어가는 순간 카드가 뒤집힌다.
 *
 * ── 이행이 고친 화면 — 앞의 답이 지워지고 있었다
 *
 * 옛 화면은 카드 한 장이 답을 갈아 끼웠다. 그래서 **k = 1 일 때 답이 A 였다는 사실이
 * 다음 걸음에 지워졌고**, 맺음 화면에는 마지막 답 하나만 남았다. "같은 점, 같은
 * 데이터인데 답이 둘" 이 이 조각의 주장인데 그 둘을 한 화면에서 견줄 수 없었다 —
 * 오직 캡션의 글자만 그렇게 말했다.
 *
 * 지금은 **세는 자리의 k 마다 그때의 답이 표로 남는다.** 맺음 화면에 1→A · 3→B ·
 * 5→B · 7→B 가 나란히 서고, 답이 넘어간 자리에는 테두리가 둘린다. 주장이 캡션이
 * 아니라 화면에 선다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 점과 표와 답표의 채움은 그 이름표의 색이다.
 * **테두리는 짚음의 표식**이다 — 테두리에 든 점만 짙은 선을 두르고, 맺음에서 짚은
 * 가장 가까운 하나는 더 굵어지며, 답이 넘어간 k 의 답표에만 선이 둘린다. 두 축을
 * 갈라 두면 "무엇이라 답했나" 와 "거기서 뒤집혔나" 가 서로를 지우지 않는다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 연속 좌표의 척도(`scale` · `qx` · `qy`)를 stage 의 `let` 에 적어 두면 걸음이 실어 온
 * 것과 그리는 자리가 갈라진다. 여기서는 바탕의 점과 물음점에서 **매번** 셈한다 —
 * 장면이 담는 것은 픽셀이 아니라 값의 범위다 (S-piece).
 *
 * 색판도 바탕의 이름표 열에서 한 번에 센다. `categorical` 은 인자가 바뀌면 hue 간격이
 * 통째로 갈리므로 *지금까지 드러난 수*로 정하면 안 된다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 주므로 여기 적지 않고, 그 폭을 좌우 여백 없이 둘로 나눠 쓴다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
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
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  countsUpTo,
  currentK,
  currentSlot,
  currentVerdict,
  flippedAt,
  kAt,
  labelsOf,
  settledCounts,
  type KChangesBoundaryScene,
  type KStep,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다. */
const H = 356;

/** 산점도 판 — 정사각형이라야 테두리가 원으로 보인다. */
const PLOT_X = 22;
const PLOT_Y = 16;
const PLOT_SIZE = 300;
/** 가장 먼 점이 판 안에 여유 있게 들어오도록 데이터 반경에 곱하는 여백. */
const DOMAIN_PAD = 1.13;

/** 저울이 서는 오른쪽 폭. 남는 폭을 여백으로 버리지 않고 둘로 나눠 쓴다. */
const RIGHT_X = 346;
const RIGHT_W = 252;
const AXIS_CX = RIGHT_X + RIGHT_W / 2;

const K_ROW_Y = 60;
const K_SLOT_GAP = 54;
const K_PILL_W = 40;
const K_PILL_H = 34;
/** 그 k 가 낸 답이 앉는 줄. 세는 자리 바로 아래다. */
const ANSWER_Y = 94;
const ANSWER_R = 12;

const PIVOT_Y = 200;
const BEAM_L = 98;
const ROD = 34;
const PAN_HALF = 32;
const TOKEN_R = 6;
const TOKEN_GAP = 16;
const TOKEN_ROW = 4;
const TOKEN_Y = -5;
const TILT_BASE = 12;
const TILT_STEP = 3;
const TILT_MAX = 20;

const POINT_R = 7.5;
/** 아직 묻지 않은 점의 흐리기. 물으면 1 로 또렷해진다. */
const DIM = 0.42;
const CARD = 36;
const CAPTION_Y = 338;

/**
 * 걸음마다 붙는 운동의 길이. 걸음 벽시계 = 이 값 + (문을 지나면) `stepMs` 다.
 */
const POSE_MS = 560;
const GROW_MS = 480;
const SPOKE_MS = 170;
const POP_MS = 150;
const FLIGHT_MS = 300;
const TILT_MS = 400;
const FLIP_MS = 360;
const CONCLUDE_MS = 700;
const FRAME_MS = 16;

/** 이름표 없는 물음점에 새기는 글리프. 도형에 각인된 표식이라 문안이 아니다 (C10). */
const UNKNOWN_GLYPH = '?';
/** 몇을 묻는지 세는 자리의 표식. 수식 기호라 문안이 아니다 (C10). */
const K_MARK = 'k';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

/** 토큰 색을 옅게 깔 때 쓰는 순수 변환. 입력 hex 는 토큰 경유다 (S-view 예외). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
/** 넘어갔다 되돌아오는 맺음. 뒤집히는 순간에만 쓴다. */
const backOut = (p: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
};

/** 표 차이가 저울을 기울이는 각. 차이가 없으면 수평이다. */
function tiltOf(counts: readonly number[]): number {
  const left = counts[0] ?? 0;
  const right = counts[1] ?? 0;
  const diff = right - left;
  if (diff === 0) return 0;
  return Math.sign(diff) * Math.min(TILT_MAX, TILT_BASE + TILT_STEP * (Math.abs(diff) - 1));
}

/** 저울대 한쪽 끝의 자리. 각이 정하므로 화면을 되읽을 것이 없다. */
function endOf(angle: number, side: -1 | 1): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x: AXIS_CX + side * BEAM_L * Math.cos(rad),
    y: PIVOT_Y + side * BEAM_L * Math.sin(rad),
  };
}

/** 접시 안에서 i 번째 표가 앉는 자리. 접시 원점 기준이다. */
function tokenSlot(i: number): { x: number; y: number } {
  const row = Math.floor(i / TOKEN_ROW);
  const col = i % TOKEN_ROW;
  return {
    x: -((TOKEN_ROW - 1) * TOKEN_GAP) / 2 + col * TOKEN_GAP,
    y: TOKEN_Y - row * (TOKEN_R * 2 + 2),
  };
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type PointDrawn = { group: SVGGElement; dot: SVGCircleElement };
type PanDrawn = { group: SVGGElement; side: -1 | 1 };
type Drawn = {
  /** 이 장면의 척도. 걸음 함수가 자리를 셈할 때 쓴다. */
  qx: number;
  qy: number;
  scale: number;
  toX(v: number): number;
  toY(v: number): number;
  colorOf(label: string): string;
  ring: SVGCircleElement | null;
  pill: SVGRectElement | null;
  spokes: Map<number, SVGLineElement>;
  points: PointDrawn[];
  card: { group: SVGGElement; rect: SVGRectElement; text: SVGTextElement };
  beamBar: SVGGElement;
  pans: Map<string, PanDrawn>;
  /** 점 인덱스 → 그 점이 던진 표. 접시에 이미 앉아 있다. */
  tokenOf: Map<number, SVGCircleElement>;
  /** 저울이 지금 서 있는 각. 기우는 운동의 도착 각이다. */
  angle: number;
};

export const kChangesBoundaryStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<KChangesBoundaryScene> {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gPlot = el('g');
    const gRing = el('g');
    const gSpoke = el('g');
    const gPoint = el('g');
    const gCard = el('g');
    const gK = el('g');
    const gBeam = el('g');
    const gFlight = el('g');
    const gCaption = el('g');
    const layers = [gPlot, gRing, gSpoke, gPoint, gCard, gK, gBeam, gFlight, gCaption];
    for (const layer of layers) svg.appendChild(layer);

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
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT). 벽시계는
     * `setTimeout` 으로 재고 rAF 를 쓰지 않는다 — 걸음이 doc 없는 자리에서도 돌아야
     * 하기 때문이다.
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

    /** 세는 자리에서 슬롯 i 의 가로 자리. 칸 수는 선언의 `ks` 가 정한다. */
    function slotX(scene: KChangesBoundaryScene, i: number): number {
      const count = Math.max(1, scene.ks.length);
      const start = AXIS_CX - ((count - 1) * K_SLOT_GAP) / 2;
      return start + Math.max(0, i) * K_SLOT_GAP;
    }

    // ── 카드 ─────────────────────────────────────────────────────────────

    function paintCard(drawn: Drawn, label: string | null): void {
      if (label === null) {
        drawn.card.rect.setAttribute('fill', c.bg);
        drawn.card.rect.setAttribute('stroke', c.ghostOutline);
        drawn.card.rect.setAttribute('stroke-dasharray', '4 3');
        drawn.card.text.setAttribute('fill', c.text);
        drawn.card.text.textContent = UNKNOWN_GLYPH;
        return;
      }
      drawn.card.rect.setAttribute('fill', drawn.colorOf(label));
      drawn.card.rect.setAttribute('stroke', c.text);
      drawn.card.rect.setAttribute('stroke-dasharray', 'none');
      drawn.card.text.setAttribute('fill', c.stateInk);
      drawn.card.text.textContent = label;
    }

    function setCardScale(drawn: Drawn, sx: number, sy: number): void {
      drawn.card.group.setAttribute(
        'transform',
        `translate(${drawn.qx} ${drawn.qy}) scale(${sx} ${sy})`,
      );
    }

    /** 저울대와 접시를 그 각에 세운다. 접시에 앉은 표는 접시를 따라간다. */
    function setBeam(drawn: Drawn, angle: number): void {
      drawn.beamBar.setAttribute('transform', `rotate(${angle} ${AXIS_CX} ${PIVOT_Y})`);
      for (const pan of drawn.pans.values()) {
        const end = endOf(angle, pan.side);
        pan.group.setAttribute('transform', `translate(${end.x} ${end.y + ROD})`);
      }
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /** 표를 세어 낸 걸음이 하는 말. 수는 전부 자취에서 나온다. */
    function settleCaption(scene: KChangesBoundaryScene): string {
      const labels = labelsOf(scene);
      const slot = scene.verdicts.length - 1;
      const verdict = scene.verdicts[slot];
      if (labels.length < 2 || verdict === undefined) {
        return t('caption.grow', 'The boundary grows until it holds the nearest {k}.', {
          k: currentK(scene),
        });
      }
      const counts = settledCounts(scene);
      const vars = {
        la: labels[0],
        ca: counts[0] ?? 0,
        lb: labels[1],
        cb: counts[1] ?? 0,
        verdict,
      };
      if (slot === 0) {
        return t('caption.first', 'Votes {la} {ca} : {lb} {cb} — the answer reads {verdict}.', vars);
      }
      return flippedAt(scene, slot)
        ? t('caption.flip', 'Votes {la} {ca} : {lb} {cb} — the answer flips to {verdict}.', vars)
        : t('caption.hold', 'Votes {la} {ca} : {lb} {cb} — the answer stays {verdict}.', vars);
    }

    /** 맺음이 하는 말. 가장 가까운 하나와 마지막 답이 다른 것이 이 조각의 맺음이다. */
    function doneCaption(scene: KChangesBoundaryScene): string {
      const nearest = scene.nearest === null ? undefined : scene.points[scene.nearest];
      const verdict = currentVerdict(scene);
      if (nearest === undefined || verdict === null) return '';
      return t(
        'caption.done',
        'The nearest one is {nearest}. Ask a few more and the answer becomes {verdict}.',
        { nearest: nearest.label, verdict },
      );
    }

    function captionFor(scene: KChangesBoundaryScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'pose':
          return t(
            'caption.start',
            'The point in the middle has no label. Its neighbours will vote.',
          );
        // 이웃이 담기는 동안에도 말은 그대로다 — 한 걸음 안에 함께 담기는 것이 k 의 뜻이다.
        case 'grow':
        case 'capture':
          return t('caption.grow', 'The boundary grows until it holds the nearest {k}.', {
            k: currentK(scene),
          });
        case 'settle':
          return settleCaption(scene);
        case 'conclude':
          return doneCaption(scene);
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: KChangesBoundaryScene): Drawn {
      rewind();

      // ── 색판. 바탕의 이름표 열에서 한 번에 센다 — 늘어나는 수로 정하지 않는다.
      const labels = labelsOf(scene);
      const tones = categorical(Math.max(2, labels.length), 'vivid');
      const colorOf = (label: string): string => {
        const at = labels.indexOf(label);
        return at >= 0 ? (tones[at] ?? c.textMuted) : c.textMuted;
      };

      // ── 척도. 바탕의 점이 정하므로 걸음마다 같은 값이 나온다.
      let reach = 0;
      for (const p of scene.points) {
        reach = Math.max(reach, Math.abs(p.x - scene.query.x), Math.abs(p.y - scene.query.y));
      }
      const half = (reach > 0 ? reach : 1) * DOMAIN_PAD;
      const scale = PLOT_SIZE / (2 * half);
      const qx = PLOT_X + PLOT_SIZE / 2;
      const qy = PLOT_Y + PLOT_SIZE / 2;
      const toX = (v: number): number => qx + (v - scene.query.x) * scale;
      const toY = (v: number): number => qy - (v - scene.query.y) * scale;

      const captured = new Set(scene.captured);
      const verdict = currentVerdict(scene);
      const angle = tiltOf(settledCounts(scene));

      // ── 판
      gPlot.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_Y,
          width: PLOT_SIZE,
          height: PLOT_SIZE,
          rx: 12,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      // ── 테두리. 아직 안 자랐으면 짓지 않는다 (숨기는 것과 다르다).
      let ring: SVGCircleElement | null = null;
      const radius = scene.rings[scene.rings.length - 1];
      if (radius !== undefined) {
        ring = el('circle', {
          cx: qx,
          cy: qy,
          r: radius * scale,
          fill: withAlpha(c.accent, 0.16),
          stroke: c.text,
          'stroke-width': 1.6,
          'stroke-dasharray': '6 4',
        });
        gRing.appendChild(ring);
      }

      // ── 살. 테두리에 든 점만 물음점과 이어진다.
      const spokes = new Map<number, SVGLineElement>();
      for (const index of scene.captured) {
        const point = scene.points[index];
        if (point === undefined) continue;
        const nearest = index === scene.nearest;
        const spoke = el('line', {
          x1: qx,
          y1: qy,
          x2: toX(point.x),
          y2: toY(point.y),
          stroke: nearest ? c.text : c.textMuted,
          'stroke-width': nearest ? 2.4 : 1.3,
        });
        gSpoke.appendChild(spoke);
        spokes.set(index, spoke);
      }

      // ── 점. 채움은 이름표의 색, 테두리는 짚었다는 표식이다.
      const points: PointDrawn[] = [];
      scene.points.forEach((p, index) => {
        const taken = captured.has(index);
        const nearest = index === scene.nearest;
        const group = el('g', { opacity: taken ? 1 : DIM });
        const dot = el('circle', {
          cx: toX(p.x),
          cy: toY(p.y),
          r: nearest ? POINT_R * 1.2 : POINT_R,
          fill: colorOf(p.label),
          stroke: taken ? c.text : c.bg,
          'stroke-width': nearest ? 2 : 1.2,
        });
        const mark = el('text', {
          x: toX(p.x),
          y: toY(p.y),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: c.stateInk,
        });
        mark.textContent = p.label;
        group.appendChild(dot);
        group.appendChild(mark);
        gPoint.appendChild(group);
        points.push({ group, dot });
      });

      // ── 물음점의 카드
      const cardGroup = el('g');
      const cardRect = el('rect', {
        x: -CARD / 2,
        y: -CARD / 2,
        width: CARD,
        height: CARD,
        rx: 9,
        'stroke-width': 2,
      });
      const cardText = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 700,
      });
      cardGroup.appendChild(cardRect);
      cardGroup.appendChild(cardText);
      gCard.appendChild(cardGroup);

      // ── 저울. 각은 **세어 낸** 표가 정한다 — 표가 얹히는 동안에는 아직 기울지 않는다.
      gBeam.appendChild(
        el('path', {
          d: `M ${AXIS_CX - 16} ${PIVOT_Y + 30} L ${AXIS_CX + 16} ${PIVOT_Y + 30} L ${AXIS_CX} ${PIVOT_Y} Z`,
          fill: c.bgSubtle,
          stroke: c.text,
          'stroke-width': 1.4,
          'stroke-linejoin': 'round',
        }),
      );
      const beamBar = el('g');
      beamBar.appendChild(
        el('line', {
          x1: AXIS_CX - BEAM_L,
          y1: PIVOT_Y,
          x2: AXIS_CX + BEAM_L,
          y2: PIVOT_Y,
          stroke: c.text,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        }),
      );
      gBeam.appendChild(beamBar);

      const pans = new Map<string, PanDrawn>();
      labels.slice(0, 2).forEach((label, i) => {
        const side: -1 | 1 = i === 0 ? -1 : 1;
        const group = el('g');
        group.appendChild(
          el('line', {
            x1: 0,
            y1: -ROD,
            x2: 0,
            y2: -14,
            stroke: c.textMuted,
            'stroke-width': 1.2,
          }),
        );
        group.appendChild(
          el('path', {
            d: `M ${-PAN_HALF} -14 L ${PAN_HALF} -14 L ${PAN_HALF - 8} 2 L ${-PAN_HALF + 8} 2 Z`,
            fill: c.bg,
            stroke: c.text,
            'stroke-width': 1.4,
            'stroke-linejoin': 'round',
          }),
        );
        const letter = el('text', {
          x: 0,
          y: 24,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: label === verdict ? colorOf(label) : c.textMuted,
        });
        letter.textContent = label;
        group.appendChild(letter);
        gBeam.appendChild(group);
        pans.set(label, { group, side });
      });

      // ── 접시에 앉은 표. 담긴 차례가 그 자리를 정한다.
      const tokenOf = new Map<number, SVGCircleElement>();
      const seated = new Map<string, number>();
      for (const index of scene.captured) {
        const point = scene.points[index];
        if (point === undefined) continue;
        const pan = pans.get(point.label);
        if (pan === undefined) continue;
        const at = seated.get(point.label) ?? 0;
        seated.set(point.label, at + 1);
        const slot = tokenSlot(at);
        const token = el('circle', {
          cx: slot.x,
          cy: slot.y,
          r: TOKEN_R,
          fill: colorOf(point.label),
          stroke: c.text,
          'stroke-width': 1,
        });
        pan.group.appendChild(token);
        tokenOf.set(index, token);
      }

      // ── 몇을 묻는지 세는 자리
      let pill: SVGRectElement | null = null;
      const slot = currentSlot(scene);
      if (slot >= 0) {
        pill = el('rect', {
          x: slotX(scene, slot) - K_PILL_W / 2,
          y: K_ROW_Y - K_PILL_H / 2,
          width: K_PILL_W,
          height: K_PILL_H,
          rx: 9,
          fill: c.accent,
        });
        gK.appendChild(pill);
      }

      const kMark = el('text', {
        x: slotX(scene, 0) - K_SLOT_GAP,
        y: K_ROW_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.textMuted,
      });
      kMark.textContent = K_MARK;
      gK.appendChild(kMark);

      scene.ks.forEach((_value, i) => {
        const label = el('text', {
          x: slotX(scene, i),
          y: K_ROW_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: i === slot ? c.stateInk : c.textMuted,
        });
        label.textContent = String(kAt(scene, i));
        gK.appendChild(label);
      });

      /*
       * 그 k 가 낸 답. **이행이 화면을 고친 자리다** — 옛 화면은 카드 하나가 답을
       * 갈아 끼워 앞의 답이 지워졌고, 그래서 "k 하나로 답이 둘" 을 한 화면에서 견줄
       * 수 없었다. 답이 넘어간 자리에만 테두리를 둘러 형편과 표식을 가른다.
       */
      scene.verdicts.forEach((answer, i) => {
        const flipped = flippedAt(scene, i);
        gK.appendChild(
          el('circle', {
            cx: slotX(scene, i),
            cy: ANSWER_Y,
            r: ANSWER_R,
            fill: colorOf(answer),
            stroke: flipped ? c.text : c.bg,
            'stroke-width': flipped ? 2.4 : 1,
          }),
        );
        const letter = el('text', {
          x: slotX(scene, i),
          y: ANSWER_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: c.stateInk,
        });
        letter.textContent = answer;
        gK.appendChild(letter);
      });

      // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      const drawn: Drawn = {
        qx,
        qy,
        scale,
        toX,
        toY,
        colorOf,
        ring,
        pill,
        spokes,
        points,
        card: { group: cardGroup, rect: cardRect, text: cardText },
        beamBar,
        pans,
        tokenOf,
        angle,
      };

      paintCard(drawn, verdict);
      setCardScale(drawn, 1, 1);
      setBeam(drawn, angle);
      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 끝나면 마지막 정적 그리기가 통째로 걷어 간다.

    /** 이름표가 없다는 것을 한 번 두드려 보인다. */
    function flowPose(drawn: Drawn, mine: number): Promise<void> {
      return tween(POSE_MS, mine, (p) => {
        const s = 1 + 0.24 * Math.sin(Math.PI * p);
        setCardScale(drawn, s, s);
      });
    }

    /** 테두리가 앞의 크기에서 이번 크기까지 자라고 알약이 그 칸으로 옮겨 간다. */
    function flowGrow(scene: KChangesBoundaryScene, drawn: Drawn, mine: number): Promise<void> {
      const slot = currentSlot(scene);
      const to = (scene.rings[slot] ?? 0) * drawn.scale;
      // 앞 테두리의 크기는 자취 한 칸을 물려 셈한다 — `prev` 를 들추지 않는다.
      const from = (scene.rings[slot - 1] ?? 0) * drawn.scale;
      const toX = slotX(scene, slot);
      const fromX = slotX(scene, slot - 1);
      const ring = drawn.ring;
      const pill = drawn.pill;
      return tween(GROW_MS, mine, (p) => {
        const e = easeOut(p);
        const r = from + (to - from) * e;
        ring?.setAttribute('r', r.toFixed(2));
        pill?.setAttribute('x', (fromX + (toX - fromX) * e - K_PILL_W / 2).toFixed(2));
      });
    }

    /**
     * 살이 뻗고 점이 또렷해지고 표 하나가 접시로 날아간다.
     *
     * 셋이 한 뜻의 운동이라 **시계를 하나만 둔다** — 마디를 나눠 따로 흘리면 이어짐이
     * 우연히 맞는 꼴이 되고 하나를 `void` 로 던질 여지가 생긴다 (S-scene).
     */
    function flowCapture(scene: KChangesBoundaryScene, drawn: Drawn, mine: number): Promise<void> {
      const index = scene.captured[scene.captured.length - 1];
      const point = index === undefined ? undefined : scene.points[index];
      if (index === undefined || point === undefined) return Promise.resolve();

      const spoke = drawn.spokes.get(index);
      const part = drawn.points[index];
      const token = drawn.tokenOf.get(index);
      const tx = drawn.toX(point.x);
      const ty = drawn.toY(point.y);

      /*
       * 표가 날아가는 동안에는 앉을 자리를 비워 둔다.
       *
       * 도착 자리를 화면에서 되읽지 않는다 (`getAttribute`). 몇 번째 표인가는 **앞서
       * 담긴 같은 이름표의 수**이고 접시의 각은 세어 낸 표가 정하므로, 둘 다 자취에서
       * 나온다 — 되짚어 세운 직후에도 같은 자리로 날아간다 (S-scene).
       */
      let target: { x: number; y: number } | null = null;
      const pan = drawn.pans.get(point.label);
      if (token !== undefined && pan !== undefined) {
        let seated = 0;
        for (const before of scene.captured.slice(0, -1)) {
          if (scene.points[before]?.label === point.label) seated += 1;
        }
        const seat = tokenSlot(seated);
        const end = endOf(drawn.angle, pan.side);
        target = { x: end.x + seat.x, y: end.y + ROD + seat.y };
      }

      const flier =
        target === null
          ? null
          : el('circle', { cx: tx, cy: ty, r: TOKEN_R, fill: drawn.colorOf(point.label) });
      if (flier !== null) gFlight.appendChild(flier);

      const total = SPOKE_MS + POP_MS + FLIGHT_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;

        const reach = easeOut(clamp01(ms / SPOKE_MS));
        spoke?.setAttribute('x2', (drawn.qx + (tx - drawn.qx) * reach).toFixed(2));
        spoke?.setAttribute('y2', (drawn.qy + (ty - drawn.qy) * reach).toFixed(2));

        const popped = clamp01((ms - SPOKE_MS) / POP_MS);
        part?.group.setAttribute('opacity', ms < SPOKE_MS ? String(DIM) : '1');
        part?.dot.setAttribute(
          'r',
          (POINT_R * (1 + 0.4 * Math.sin(Math.PI * popped))).toFixed(2),
        );

        if (flier === null || target === null) return;
        const flown = clamp01((ms - SPOKE_MS - POP_MS) / FLIGHT_MS);
        token?.setAttribute('opacity', flown >= 1 ? '1' : '0');
        flier.setAttribute('opacity', flown >= 1 ? '0' : '1');
        const e = easeInOut(flown);
        flier.setAttribute('cx', (tx + (target.x - tx) * e).toFixed(2));
        flier.setAttribute(
          'cy',
          (ty + (target.y - ty) * e - 28 * Math.sin(Math.PI * flown)).toFixed(2),
        );
      });
    }

    /**
     * 저울이 기울고, 답이 달라지면 카드가 뒤집힌다.
     *
     * 앞의 각도 앞의 답도 자취 한 칸을 물려 셈한다 — 되짚어 와도 같은 자리에서
     * 출발한다 (S-scene).
     */
    function flowSettle(scene: KChangesBoundaryScene, drawn: Drawn, mine: number): Promise<void> {
      const settled = scene.verdicts.length;
      const answer = scene.verdicts[settled - 1] ?? null;
      const before = scene.verdicts[settled - 2] ?? null;
      const flipped = flippedAt(scene, settled - 1);
      const swaps = answer !== before;

      const to = drawn.angle;
      const from = tiltOf(countsUpTo(scene, kAt(scene, settled - 2)));
      const lean = flipped ? backOut : easeOut;

      const total = TILT_MS + (swaps ? FLIP_MS : 0);
      return tween(total, mine, (p) => {
        const ms = p * total;
        const leaned = clamp01(ms / TILT_MS);
        setBeam(drawn, from + (to - from) * lean(leaned));

        if (!swaps) return;
        const turn = clamp01((ms - TILT_MS) / FLIP_MS);
        if (turn < 0.5) {
          paintCard(drawn, before);
          setCardScale(drawn, 1 - turn * 2, 1);
          return;
        }
        paintCard(drawn, answer);
        const out = (turn - 0.5) * 2;
        setCardScale(drawn, flipped ? backOut(out) : out, 1);
      });
    }

    /** 가장 가까운 하나를 두드린다. 카드에는 다른 이름표가 새겨져 있다. */
    function flowConclude(scene: KChangesBoundaryScene, drawn: Drawn, mine: number): Promise<void> {
      const part = scene.nearest === null ? undefined : drawn.points[scene.nearest];
      if (part === undefined) return Promise.resolve();
      return tween(CONCLUDE_MS, mine, (p) => {
        part.dot.setAttribute(
          'r',
          (POINT_R * (1 + 0.5 * Math.abs(Math.sin(2 * Math.PI * p)))).toFixed(2),
        );
      });
    }

    function flowFor(
      step: KStep,
      scene: KChangesBoundaryScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'pose':
          return flowPose(drawn, mine);
        case 'grow':
          return flowGrow(scene, drawn, mine);
        case 'capture':
          return flowCapture(scene, drawn, mine);
        case 'settle':
          return flowSettle(scene, drawn, mine);
        case 'conclude':
          return flowConclude(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: KChangesBoundaryScene,
      _prev: KChangesBoundaryScene | null,
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
        svg.textContent = '';
      },
    };
  },
};
