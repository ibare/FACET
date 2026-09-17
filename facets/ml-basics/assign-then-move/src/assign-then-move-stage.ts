/**
 * assign-then-move stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 화면은 셋이다.
 *
 *   위     번갈이 저울. 지금이 '붙는다' 인지 '옮긴다' 인지를 손잡이가 좌우로
 *          미끄러지며 말한다. 걸음마다 반대쪽으로 건너가므로, 이 왕복 자체가
 *          알고리즘의 몸짓이다.
 *   왼쪽   들판. 점이 가장 가까운 중심을 향해 살(spoke)을 뻗어 붙잡고, 그 다음
 *          걸음에 중심이 살에 끌려 가운데로 옮겨 간다. 떠난 자리에는 유령 고리가
 *          남고 지나온 길은 점선으로 이어진다.
 *   오른쪽 장부. 회마다 중심 셋이 옮긴 거리를 막대로 적는다. 막대가 짧아지다
 *          아무것도 안 남으면 멎은 것이다 — 멎는 것이 곧 답을 찾았다는 신호다.
 *
 * 산점도는 무대이지 주인공이 아니다. 주인공은 살을 뻗고 끌려가는 왕복이다.
 *
 * ── 이행이 고친 화면 하나 — 지나온 길이 지워지고 있었다
 *
 * 옛 화면은 `attach` 의 첫 줄이 `ghostLayer.textContent = ''` 였다. 그래서 회마다의
 * 유령 고리와 자취가 **다음 회의 첫 몸짓에 통째로 지워졌고**, 완주 화면에는 마지막
 * 회의 것만 남았다. 마지막 회는 아무도 움직이지 않는 회라 그 자취가 길이 0 이다 —
 * 곧 **완주 화면에 지나온 길이 하나도 없었다.** 이 조각의 주장이 "붙이고 옮기기를
 * 되풀이하면 중심이 자리를 잡는다" 인데, 자리를 잡았다는 말을 받쳐 줄 **처음 자리와
 * 견줄 짝**이 화면에 없었던 것이다.
 *
 * 지금은 자취가 장면(`paths`)에 있으므로 정적 그리기가 매번 **출발 자리의 유령 고리
 * 부터 지금 자리까지 전부** 세운다. 완주 화면에서 중심 셋이 가운데에서 저마다의 덩이로
 * 걸어간 길이 보이고, 마지막 도막이 길이 0 인 것이 곧 멎었다는 표다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 점의 채움은 그 점이 지금 어느 무리에 들었나이고, 아직
 * 아무 데도 안 붙었으면 기본색이다.
 * **테두리는 표식**이다 — **이번 회에 붙는 자리가 달라진 점**만 짙은 선을 두른다.
 * 되풀이가 멈추지 않는 까닭이 그 점들이고, 아무도 손을 바꾸지 않는 회에는 테두리가
 * 하나도 서지 않는다. 그 회에 막대도 비므로 "붙는 자리가 그대로면 가운데도 그대로"
 * 라는 결론이 두 자리에서 같은 자취를 근거로 선다.
 *
 * 두 축을 갈라 두면 "어느 무리인가" 와 "이번에 손이 바뀌었나" 가 서로를 지우지 않는다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 점의 값에서 화면 자리를 역산하는 척도(`unit` · `px` · `py`)를 mount 의 변수에 적어
 * 두면 그리는 자리와 장면이 갈라진다. 여기서는 바탕의 점과 출발 중심에서 **매번**
 * 셈한다 — 장면이 담는 것은 픽셀이 아니라 값의 자리다 (S-piece).
 *
 * 색판도 바탕의 중심 수에서 한 번에 센다. `categorical` 은 인자가 바뀌면 hue 간격이
 * 통째로 갈리므로 *지금까지 드러난 수*로 정하면 안 된다.
 *
 * 세로(H)는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  centersAt,
  countsAt,
  currentAssign,
  currentCenters,
  longestMove,
  movedAt,
  phaseOf,
  switchedAt,
  type AssignThenMoveScene,
  type AssignThenMoveStep,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다. */
const H = 372;

const PAD = 18;
const GAUGE_TOP = 14;
const GAUGE_H = 30;
const BODY_TOP = 58;
const BODY_H = 264;
const CAPTION_Y = 348;

/** 들판과 장부 사이. */
const PANEL_GAP = 20;
/** 들판 테두리와 점 사이의 숨. */
const FIELD_INSET = 18;
/** 들판이 가로로 가져갈 수 있는 몫의 상한. 남는 폭은 장부가 쓴다 (S-piece). */
const FIELD_MAX_RATIO = 0.52;

const ROW_LABEL_W = 44;
const ROW_NUM_W = 44;
/** 장부가 미리 잡아 두는 줄 수. 더 오면 줄 높이를 줄여 담는다 (세로는 안 늘린다). */
const LEDGER_SLOTS = 4;

const POINT_R = 4.5;
const CENTER_R = 11;
const SPOKE_OPACITY = 0.4;
const KNOB_IDLE_OPACITY = 0.3;
/** 붙는 자리가 안 바뀐 점의 테두리 굵기. 바뀐 점은 아래 굵기로 두른다. */
const DOT_STROKE_W = 1.2;
const SWITCH_STROKE_W = 2.4;
/** 지나온 자리에 남기는 작은 매듭. */
const TRAIL_KNOT_R = 2.4;

const ATTACH_MS = 700;
const MOVE_MS = 640;
/** 도장이 앉는 데 쓰는 짧은 마디. 멎는 걸음이 얇아지지 않게 한다 (S-piece). */
const SETTLE_MS = 240;
/** 도장이 얼마나 위에서 내려앉나. */
const SETTLE_RISE = 8;
/** 앞머리에서 손잡이가 건너가고, 그 다음에 들판의 몸짓이 시작한다. */
const KNOB_PART = 0.28;
const ACT_START = 0.2;
/** 한 점이 붙는 데 쓰는 몫. 나머지는 점에서 점으로 번지는 시차가 가져간다. */
const ATTACH_SPAN = 0.5;
/** 살을 놓고 다시 잡는 순간 — 이 지점에서 색이 새 무리로 넘어간다. */
const GRIP_AT = 0.55;
/** 보간 한 마디의 벽시계. rAF 가 아니라 타이머로 재어 doc 없는 자리에서도 돌게 한다. */
const FRAME_MS = 16;

/** 중심에 새기는 표식. 장부의 범례가 같은 글자를 쓴다 (C10 — 도형에 새긴 글자). */
const CENTER_MARKS = ['A', 'B', 'C', 'D', 'E', 'F'];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
/**
 * 사이값. **끝에서는 보간하지 않고 목표값을 그대로 쓴다** — 보간의 부동소수 끝자리가
 * 남으면 흘려 세운 화면과 곧바로 세운 화면이 글자 하나 어긋난다 (S-scene 함정).
 */
const lerp = (a: number, b: number, p: number): number => (p >= 1 ? b : a + (b - a) * p);

/** 수를 나란히 적는다. 뒤에 조사가 붙지 않는 자리에만 쓴다 (S-piece). */
const lineUp = (values: readonly number[], digits: number): string =>
  values.map((v) => v.toFixed(digits)).join(' / ');

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  /** 이 장면의 척도. 걸음 함수가 자리를 셈할 때 쓴다. */
  px(v: number): number;
  py(v: number): number;
  hue: readonly string[];
  gaugeHalf: number;
  knobLeft: number;
  knobRight: number;
  knob: SVGRectElement;
  gaugeInk: SVGTextElement[];
  /** 중심의 지금 픽셀 자리. 장면의 자취에서 셈한 값이라 화면을 되읽지 않는다. */
  centers: { x: number; y: number }[];
  rings: { ring: SVGCircleElement; mark: SVGTextElement }[];
  /** 중심마다 가장 최근 자취 도막. 아직 안 옮겼으면 null. */
  trailTips: (SVGLineElement | null)[];
  /** 점마다의 살. 아직 아무 데도 안 붙었으면 null — 길이 0 짜리를 짓지 않는다. */
  spokes: (SVGLineElement | null)[];
  dots: SVGCircleElement[];
  /** 회마다의 막대와 그 도착 너비. `bars[r - 1][c]`. */
  bars: { bar: SVGRectElement; width: number }[][];
  /** 멎었다는 도장. 멎지 않았으면 null. */
  stamp: { node: SVGTextElement; y: number } | null;
};

export const assignThenMoveStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<AssignThenMoveScene> {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const rx = parseFloat(radii.md);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gShell = el('g');
    const gTrail = el('g');
    const gSpoke = el('g');
    const gPoint = el('g');
    const gCenter = el('g');
    const gLedger = el('g');
    const gCaption = el('g');
    const layers = [gShell, gTrail, gSpoke, gPoint, gCenter, gLedger, gCaption];
    for (const layer of layers) svg.appendChild(layer);

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

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
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

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 지금 화면이 할 말.
     *
     * `step` 이 아니라 **국면**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
     * 나와야 한다. 수는 전부 자취를 셈해 나온다 (`countsAt` · `movedAt`).
     */
    function captionFor(scene: AssignThenMoveScene): string {
      const phase = phaseOf(scene);
      switch (phase.kind) {
        case 'start':
          return t('caption.start', 'Three centers sit where no cluster is.');
        case 'attach':
          return t(
            'caption.attach',
            'Round {round} · attach: every point grabs its nearest center. Sizes {sizes}.',
            { round: phase.round, sizes: lineUp(countsAt(scene, phase.round), 0) },
          );
        case 'move':
          return t(
            'caption.move',
            'Round {round} · move: each center slides to the middle of its own points. Moved {dists}.',
            { round: phase.round, dists: lineUp(movedAt(scene, phase.round), 2) },
          );
        case 'done':
          return phase.settled
            ? t('caption.settled', 'Nobody moved, so it stops. Rounds: {rounds}.', {
                rounds: phase.rounds,
              })
            : t('caption.capped', 'Still moving. Rounds: {rounds}.', { rounds: phase.rounds });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 번갈이 저울의 이름 둘 중 하나를 짙게 한다. `-1` 이면 둘 다 흐리다. */
    function inkGauge(drawn: Drawn, active: number): void {
      drawn.gaugeInk.forEach((node, i) => {
        node.setAttribute('fill', i === active ? c.stateInk : c.textMuted);
      });
    }

    /** 중심 하나를 그 자리에 세운다. 표식이 함께 따라간다. */
    function placeRing(drawn: Drawn, i: number, x: number, y: number): void {
      const parts = drawn.rings[i];
      if (parts === undefined) return;
      parts.ring.setAttribute('cx', String(x));
      parts.ring.setAttribute('cy', String(y));
      parts.mark.setAttribute('x', String(x));
      parts.mark.setAttribute('y', String(y + 4));
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: AssignThenMoveScene): Drawn {
      rewind();

      const phase = phaseOf(scene);
      const points = scene.points;
      const seeds = scene.seeds;
      const rounds = scene.paths.length;
      // 색판은 바탕의 중심 수에서 한 번에 센다 (지금까지 드러난 수로 정하지 않는다).
      const hue = categorical(Math.max(seeds.length, 3), 'vivid');

      // ── 자리 셈. 들판은 세로에 매이므로 남는 가로는 장부가 가져간다.
      const all = [...points, ...seeds];
      const minX = all.length > 0 ? Math.min(...all.map((p) => p.x)) : 0;
      const maxX = all.length > 0 ? Math.max(...all.map((p) => p.x)) : 1;
      const minY = all.length > 0 ? Math.min(...all.map((p) => p.y)) : 0;
      const maxY = all.length > 0 ? Math.max(...all.map((p) => p.y)) : 1;
      const dx = Math.max(maxX - minX, 1e-6);
      const dy = Math.max(maxY - minY, 1e-6);
      const fieldMaxW = Math.round((W - PAD * 2) * FIELD_MAX_RATIO);
      const unit = Math.min((fieldMaxW - FIELD_INSET * 2) / dx, (BODY_H - FIELD_INSET * 2) / dy);
      const fieldW = Math.round(dx * unit + FIELD_INSET * 2);
      const ledgerX = PAD + fieldW + PANEL_GAP;
      const ledgerW = W - PAD - ledgerX;
      const barX = ledgerX + 12 + ROW_LABEL_W;
      const barMaxW = ledgerW - 12 - ROW_LABEL_W - ROW_NUM_W - 12;
      const rowsTop = BODY_TOP + 30;
      const rowsH = BODY_H - 40;

      const px = (x: number): number => PAD + FIELD_INSET + (x - minX) * unit;
      const py = (y: number): number => BODY_TOP + BODY_H - FIELD_INSET - (y - minY) * unit;

      // ── 껍데기 · 번갈이 저울
      const gaugeHalf = (W - PAD * 2) / 2;
      const knobLeft = PAD + 3;
      const knobRight = PAD + 3 + gaugeHalf;
      gShell.appendChild(
        el('rect', {
          x: PAD,
          y: GAUGE_TOP,
          width: W - PAD * 2,
          height: GAUGE_H,
          rx: GAUGE_H / 2,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      // 손잡이의 자리는 국면이 정한다. 옛 화면은 이것을 DOM 에서 되읽었다 (함정 25).
      const onMove = phase.kind === 'move' || phase.kind === 'done';
      const knob = el('rect', {
        x: onMove ? knobRight : knobLeft,
        y: GAUGE_TOP + 3,
        width: gaugeHalf - 6,
        height: GAUGE_H - 6,
        rx: (GAUGE_H - 6) / 2,
        fill: c.accent,
        opacity: phase.kind === 'start' ? KNOB_IDLE_OPACITY : 1,
      });
      gShell.appendChild(knob);

      const gaugeInk = [t('label.attach', 'attach'), t('label.move', 'move')].map((text, i) => {
        const node = el('text', {
          x: PAD + gaugeHalf * (i + 0.5),
          y: GAUGE_TOP + GAUGE_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        node.textContent = text;
        gShell.appendChild(node);
        return node;
      });

      // ── 껍데기 · 두 판과 장부의 머리
      gShell.appendChild(
        el('rect', {
          x: PAD,
          y: BODY_TOP,
          width: fieldW,
          height: BODY_H,
          rx,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      gShell.appendChild(
        el('rect', {
          x: ledgerX,
          y: BODY_TOP,
          width: ledgerW,
          height: BODY_H,
          rx,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );

      const ledgerTitle = el('text', {
        x: ledgerX + 12,
        y: BODY_TOP + 19,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      ledgerTitle.textContent = t('label.ledger', 'how far each center moved');
      gShell.appendChild(ledgerTitle);

      seeds.forEach((_, i) => {
        const cx = ledgerX + ledgerW - 14 - (seeds.length - 1 - i) * 20;
        gShell.appendChild(el('circle', { cx, cy: BODY_TOP + 15, r: 7, fill: hue[i] }));
        const mark = el('text', {
          x: cx,
          y: BODY_TOP + 19,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.stateInk,
        });
        mark.textContent = CENTER_MARKS[i] ?? String(i + 1);
        gShell.appendChild(mark);
      });

      // ── 지나온 길. 출발 자리의 유령 고리부터 지금 자리까지 전부 남는다.
      const trailTips: (SVGLineElement | null)[] = seeds.map(() => null);
      if (rounds > 0) {
        seeds.forEach((_, i) => {
          const from0 = centersAt(scene, 0)[i];
          gTrail.appendChild(
            el('circle', {
              cx: px(from0.x),
              cy: py(from0.y),
              r: CENTER_R,
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': 1.2,
              'stroke-dasharray': '3 3',
            }),
          );
          for (let round = 1; round <= rounds; round += 1) {
            const from = centersAt(scene, round - 1)[i];
            const to = centersAt(scene, round)[i];
            const seg = el('line', {
              x1: px(from.x),
              y1: py(from.y),
              x2: px(to.x),
              y2: py(to.y),
              stroke: c.ghostOutline,
              'stroke-width': 1.2,
              'stroke-dasharray': '4 3',
            });
            gTrail.appendChild(seg);
            if (round < rounds) {
              gTrail.appendChild(
                el('circle', {
                  cx: px(to.x),
                  cy: py(to.y),
                  r: TRAIL_KNOT_R,
                  fill: c.ghostOutline,
                }),
              );
            } else {
              trailTips[i] = seg;
            }
          }
        });
      }

      // ── 살과 점. 채움은 어느 무리인가, 테두리는 이번 회에 손이 바뀌었나다.
      const centers = currentCenters(scene).map((p) => ({ x: px(p.x), y: py(p.y) }));
      const assign = currentAssign(scene);
      const switched = new Set(switchedAt(scene, scene.assigns.length));
      const spokes: (SVGLineElement | null)[] = points.map(() => null);
      const dots: SVGCircleElement[] = [];
      points.forEach((p, i) => {
        const which = assign === null ? -1 : assign[i];
        const tip = which >= 0 ? centers[which] : undefined;
        if (tip !== undefined) {
          const line = el('line', {
            x1: px(p.x),
            y1: py(p.y),
            x2: tip.x,
            y2: tip.y,
            stroke: hue[which],
            'stroke-width': 1.3,
            'stroke-opacity': SPOKE_OPACITY,
          });
          gSpoke.appendChild(line);
          spokes[i] = line;
        }
        const marked = switched.has(i);
        const dot = el('circle', {
          cx: px(p.x),
          cy: py(p.y),
          r: POINT_R,
          fill: which >= 0 ? hue[which] : c.itemDefault,
          stroke: marked ? c.text : c.border,
          'stroke-width': marked ? SWITCH_STROKE_W : DOT_STROKE_W,
        });
        gPoint.appendChild(dot);
        dots.push(dot);
      });

      // ── 중심
      const rings = seeds.map((_, i) => {
        const at = centers[i] ?? { x: px(0), y: py(0) };
        const ring = el('circle', {
          cx: at.x,
          cy: at.y,
          r: CENTER_R,
          fill: c.bg,
          stroke: hue[i],
          'stroke-width': 2.5,
        });
        const mark = el('text', {
          x: at.x,
          y: at.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: hue[i],
        });
        mark.textContent = CENTER_MARKS[i] ?? String(i + 1);
        gCenter.appendChild(ring);
        gCenter.appendChild(mark);
        return { ring, mark };
      });

      // ── 장부. 막대의 척도도 회마다의 거리도 자취에서 나온다.
      const longest = longestMove(scene);
      const slotH = rowsH / Math.max(LEDGER_SLOTS, rounds);
      const barWidth = (distance: number): number =>
        longest <= 0 ? 0 : Math.min(barMaxW, (distance / longest) * barMaxW);
      const bars: { bar: SVGRectElement; width: number }[][] = [];
      for (let round = 1; round <= rounds; round += 1) {
        const group = el('g', { transform: `translate(0, ${rowsTop + slotH * (round - 1)})` });
        const label = el('text', {
          x: ledgerX + 12,
          y: 12,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = t('label.round', 'round {n}', { n: round });
        group.appendChild(label);

        const row: { bar: SVGRectElement; width: number }[] = [];
        movedAt(scene, round).forEach((distance, i) => {
          const y = 17 + i * 11;
          group.appendChild(
            el('rect', {
              x: barX,
              y,
              width: barMaxW,
              height: 7,
              rx: 3.5,
              fill: c.border,
              opacity: 0.5,
            }),
          );
          const width = barWidth(distance);
          const bar = el('rect', { x: barX, y, width, height: 7, rx: 3.5, fill: hue[i] });
          group.appendChild(bar);
          row.push({ bar, width });
          const num = el('text', {
            x: barX + barMaxW + 8,
            y: y + 6.5,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          });
          num.textContent = distance.toFixed(2);
          group.appendChild(num);
        });
        gLedger.appendChild(group);
        bars.push(row);
      }

      // 도장은 아무도 안 움직여 멎었을 때만 선다. 그 판정도 같은 자취를 지난다.
      let stamp: { node: SVGTextElement; y: number } | null = null;
      if (phase.kind === 'done' && phase.settled) {
        const y = rowsTop + slotH * rounds + 12;
        const node = el('text', {
          x: ledgerX + 12,
          y,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        node.textContent = t('label.settled', 'no movement');
        gLedger.appendChild(node);
        stamp = { node, y };
      }

      // ── 캡션
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      const drawn: Drawn = {
        px,
        py,
        hue,
        gaugeHalf,
        knobLeft,
        knobRight,
        knob,
        gaugeInk,
        centers,
        rings,
        trailTips,
        spokes,
        dots,
        bars,
        stamp,
      };
      inkGauge(
        drawn,
        phase.kind === 'start' ? -1 : phase.kind === 'attach' ? 0 : 1,
      );
      return drawn;
    }

    // ── 몸짓 하나: 붙는다 ────────────────────────────────────────────────

    /**
     * 살이 앞서 잡고 있던 자리에서 떨어져 새 중심으로 건너간다.
     *
     * 출발 자리를 화면에서도 `prev` 에서도 꺼내지 않는다 — 앞 회의 붙음(`assigns` 의
     * 한 칸 앞)과 지금 중심 자리만 있으면 셈으로 나온다 (S-scene).
     */
    async function flowAttach(
      scene: AssignThenMoveScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const round = scene.assigns.length;
      const assign = scene.assigns[round - 1];
      if (assign === undefined) return;
      const before = scene.assigns[round - 2];
      const switched = new Set(switchedAt(scene, round));

      const from = scene.points.map((p, i) => {
        const was = before === undefined ? undefined : before[i];
        return was === undefined
          ? { x: drawn.px(p.x), y: drawn.py(p.y) }
          : drawn.centers[was];
      });
      const to = assign.map((which) => drawn.centers[which]);
      // 첫 회는 손잡이가 이미 왼쪽에 있고 흐리다. 그 뒤로는 오른쪽에서 건너온다.
      const knobFrom = before === undefined ? drawn.knobLeft : drawn.knobRight;
      const opacityFrom = before === undefined ? KNOB_IDLE_OPACITY : 1;
      const count = scene.points.length;
      const spread = count > 1 ? (1 - ATTACH_SPAN) / (count - 1) : 0;

      await tween(ATTACH_MS, mine, (p) => {
        const knobP = ease(clamp01(p / KNOB_PART));
        const x = lerp(knobFrom, drawn.knobLeft, knobP);
        drawn.knob.setAttribute('x', String(x));
        drawn.knob.setAttribute('opacity', String(lerp(opacityFrom, 1, knobP)));
        inkGauge(drawn, x - drawn.knobLeft > drawn.gaugeHalf / 2 ? 1 : 0);

        const acted = clamp01((p - ACT_START) / (1 - ACT_START));
        for (let i = 0; i < count; i += 1) {
          const local = ease(clamp01((acted - i * spread) / ATTACH_SPAN));
          const gripped = local >= GRIP_AT;
          const which = gripped ? assign[i] : before === undefined ? undefined : before[i];
          const tone = which === undefined ? c.border : drawn.hue[which];

          const spoke = drawn.spokes[i];
          const start = from[i];
          const end = to[i];
          if (spoke !== null && start !== undefined && end !== undefined) {
            spoke.setAttribute('x2', String(lerp(start.x, end.x, local)));
            spoke.setAttribute('y2', String(lerp(start.y, end.y, local)));
            spoke.setAttribute('stroke', tone);
          }

          const dot = drawn.dots[i];
          if (dot === undefined) continue;
          dot.setAttribute('fill', which === undefined ? c.itemDefault : drawn.hue[which]);
          const marked = gripped && switched.has(i);
          dot.setAttribute('stroke', marked ? c.text : c.border);
          dot.setAttribute('stroke-width', String(marked ? SWITCH_STROKE_W : DOT_STROKE_W));
        }
      });
    }

    // ── 몸짓 둘: 옮긴다 ──────────────────────────────────────────────────

    /**
     * 중심이 살에 끌려 무리의 가운데로 미끄러진다.
     *
     * 출발 자리는 자취 한 칸을 물린 `centersAt(round - 1)` 이다. 자취의 마지막 도막이
     * 중심을 따라 늘어나고, 장부의 막대도 같은 시계로 자란다 — 시계를 둘로 나누지 않는다.
     */
    async function flowMove(
      scene: AssignThenMoveScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const round = scene.paths.length;
      if (round === 0) return;
      const assign = currentAssign(scene);
      const fromPx = centersAt(scene, round - 1).map((p) => ({
        x: drawn.px(p.x),
        y: drawn.py(p.y),
      }));
      const row = drawn.bars[round - 1] ?? [];

      await tween(MOVE_MS, mine, (p) => {
        const knobP = ease(clamp01(p / KNOB_PART));
        const x = lerp(drawn.knobLeft, drawn.knobRight, knobP);
        drawn.knob.setAttribute('x', String(x));
        inkGauge(drawn, x - drawn.knobLeft > drawn.gaugeHalf / 2 ? 1 : 0);

        const glide = ease(clamp01((p - ACT_START) / (1 - ACT_START)));
        const now = drawn.centers.map((target, i) => {
          const start = fromPx[i] ?? target;
          return { x: lerp(start.x, target.x, glide), y: lerp(start.y, target.y, glide) };
        });

        now.forEach((at, i) => {
          placeRing(drawn, i, at.x, at.y);
          const tip = drawn.trailTips[i];
          if (tip !== null && tip !== undefined) {
            tip.setAttribute('x2', String(at.x));
            tip.setAttribute('y2', String(at.y));
          }
          const bar = row[i];
          if (bar !== undefined) bar.bar.setAttribute('width', String(bar.width * glide));
        });

        if (assign === null) return;
        drawn.spokes.forEach((spoke, i) => {
          if (spoke === null) return;
          const at = now[assign[i]];
          if (at === undefined) return;
          spoke.setAttribute('x2', String(at.x));
          spoke.setAttribute('y2', String(at.y));
        });
      });
    }

    // ── 몸짓 셋: 멎는다 ──────────────────────────────────────────────────

    /**
     * 도장이 장부 아래로 내려앉는다.
     *
     * 이 걸음에는 흐를 것이 없어 벽시계가 `stepMs` 뿐이었다. 처음 뜨는 글자는 앉는
     * 꼴이 맞으므로 (나타나는 깜빡임이 아니라) 위에서 내려오게 한다 (S-piece 얇은 걸음).
     */
    async function flowFinish(drawn: Drawn, mine: number): Promise<void> {
      const stamp = drawn.stamp;
      // 상한까지 돌고도 움직이는 중이면 도장이 없다. 흐를 것도 없다.
      if (stamp === null) return;
      await tween(SETTLE_MS, mine, (p) => {
        const e = easeOut(clamp01(p));
        stamp.node.setAttribute('y', String(lerp(stamp.y - SETTLE_RISE, stamp.y, e)));
        stamp.node.setAttribute('opacity', String(e));
      });
    }

    function flowFor(
      step: AssignThenMoveStep,
      scene: AssignThenMoveScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'attach':
          return flowAttach(scene, drawn, mine);
        case 'move':
          return flowMove(scene, drawn, mine);
        case 'finish':
          return flowFinish(drawn, mine);
      }
    }

    async function render(
      next: AssignThenMoveScene,
      _prev: AssignThenMoveScene | null,
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
