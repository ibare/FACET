/**
 * dense-neighborhood-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 화면을 둘로 가른 까닭
 *
 * 왼쪽은 점이 놓인 들판이다. 여기서 일어나는 일은 하나 — **번짐**이다. 불씨가
 * 놓이면 그 자리에서 eps 짜리 원이 자라 이웃을 삼키고, 삼킨 이웃에서 다시 원이
 * 자라며 앞의 원은 오므라든다. 원이 옮겨 다니는 것이 곧 앞자락(frontier)이다.
 *
 * 오른쪽은 산점도가 아니라 **거리 한 축**이다. 번짐이 가른 모든 쌍의 거리가
 * 이 축에 떨어진다. eps 는 축을 가로지르는 한 줄이고, 아래에 떨어진 것은 이어졌고
 * 위에 떨어진 것은 못 이었다. 무리가 둘로 갈리는 까닭 전부가 이 두 무더기 사이의
 * 빈틈이라, 그 빈틈을 눈으로 재게 하려고 축을 따로 세웠다.
 *
 * 들판의 좌표는 자료에서 역산한다 (S-piece). 원이 원으로 보여야 하므로 들판은
 * 정사각이고, 가로세로 축척이 같다.
 *
 * ── 이행이 고친 것 — 화면이 제 칠을 도로 읽고 있었다
 *
 * 옛 `finish()` 는 `node.getAttribute('stroke') === c.textMuted` 로 **불이 끝내 닿지
 * 않은 점**을 가려 건너뛰었다. 그 답은 오직 제가 앞서 칠한 획에만 있었으므로, 걸음을
 * 건너뛰어 맺음 화면을 곧바로 세우면 아직 아무도 칠하지 않은 점들이라 **모두**
 * 건너뛰어졌다 — 무리에 든 점이 하나도 부풀지 않는다. 지금은 `membershipOf(scene)` 이
 * 그 답을 쥔다.
 *
 * 눈금의 가로 자리도 같은 병이었다. `bucket` 맵이 *그려 온 역사*를 세어 칸을 내주던
 * 자리라, 어느 걸음으로 뛰어 왔느냐에 따라 같은 자국이 다른 칸에 앉았다. 지금은
 * `axisMarks(scene)` 가 자취 전체를 정해진 차례로 한 번 훑는다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 어느 무리에 들었나. 아직 불이 안 닿은 점은 속이 비어
 * 있다. **테두리는 짚음의 표식**이다 — 불씨를 놓은 자리는 짙은 선을 두르고,
 * **번짐이 멎은 쌍의 두 끝**은 danger 로 두른다. 두 축을 갈라 두면 나중에 그 점이
 * 다른 무리에 들어 채움이 바뀌어도 "여기서 불이 멎었다" 가 지워지지 않는다.
 *
 * ── 번지지 못한 자리를 일부러 남긴다
 *
 * 옛 화면에서 벌어짐의 자국과 눈금 위쪽 무더기가 살아남은 것은 되돌리는 명령이 없어
 * **칠이 쌓이고** 있었기 때문이다. 장면으로 옮기면 그 누적이 저절로 사라지므로,
 * `blocked` 와 `reject` 를 자취로 올려 정적 그리기가 매번 다시 세운다 — *번지지 못한
 * 자리*가 이 조각 논증의 절반이다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 주므로 여기 적지 않는다.
 *
 * 걸어 둔 프레임은 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
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
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  axisMarks,
  distanceOf,
  frontierAt,
  membersOf,
  membershipOf,
  openFrontier,
  sizesOf,
  type DenseNeighborhoodScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

// ── 캔버스. 가로는 러너가 PIECE_CANVAS_W 로 정하고, 세로는 그림이 정한다 (S-view).
const W = PIECE_CANVAS_W;
const H = 360;
const PAD = 16;
const TOP = 12;
const GAP = 18;
/** 들판은 정사각이다 — 축척이 갈리면 eps 원이 타원이 된다. */
const FIELD = 306;
const PANEL_X = PAD + FIELD + GAP;
const AXIS_X = PANEL_X + 34;
const PLOT_X0 = AXIS_X + 14;
const DOT_STEP = 11;
const DOT_MAX_X = W - PAD - 6;
/** 눈금의 위아래. 축 제목과 눈금 글자가 판 테두리에 물리지 않게 안으로 들인다. */
const PLOT_TOP = TOP + 34;
const PLOT_BOT = TOP + FIELD - 14;
const PLOT_H = PLOT_BOT - PLOT_TOP;
const CAPTION_Y = TOP + FIELD + 28;

// ── 지속시간. 총 재생 길이를 줄이려면 stepMs 가 아니라 여기를 줄인다 (S-piece).
const LINK_MS = 200;
const WAVE_MS = 280;
const GAP_MS = 420;
const SETTLE_MS = 320;

const DOT_BUCKET = 0.07;
const PT_R = 4.5;
const PT_R_ON = 6;
/** 눈금으로 날아가기 전, 자국이 솟아오르는 높이. */
const DROP_RISE = 16;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 토큰 hex 에 알파를 입힌다 — 색 리터럴이 아니라 순수 변환이다 (S-view). */
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m === null) return hex;
  const v = parseInt(m[1] ?? '0', 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
/** 양 끝에서 정확히 0 과 1 을 낸다 — 끝자리가 흘러 화면이 갈리지 않게 (S-scene). */
const ease = (p: number): number => {
  const q = clamp01(p);
  return q >= 1 ? 1 : q * q * (3 - 2 * q);
};

/**
 * 자료 좌표 → 화면 좌표의 척도.
 *
 * 바탕의 점과 eps 만으로 정해지므로 걸음마다 같은 값이 나온다. 적어 두지 않고 매번
 * 셈하는 것이 요점이다 — 척도를 stage 의 `let` 에 적어 두면 정하는 자리와 쓰는
 * 자리가 갈라져, 걸음이 실어 온 것과 그리는 자리가 어긋날 문이 열린다 (S-piece).
 */
function scaleOf(
  points: readonly { x: number; y: number }[],
  eps: number,
): { scale: number; midX: number; midY: number } {
  if (points.length === 0) return { scale: FIELD / (1.02 * 1), midX: 0, midY: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs) - eps;
  const x1 = Math.max(...xs) + eps;
  const y0 = Math.min(...ys) - eps;
  const y1 = Math.max(...ys) + eps;
  const span = Math.max(x1 - x0, y1 - y0, 0.001);
  return { scale: FIELD / (span * 1.02), midX: (x0 + x1) / 2, midY: (y0 + y1) / 2 };
}

/** 벌어짐 그림 한 벌. 번짐이 멎은 무리마다 하나씩 선다. */
type GapDrawn = {
  reach: SVGCircleElement;
  span: SVGLineElement;
  shortfall: SVGLineElement;
  tag: SVGTextElement;
  /** 두 점 사이의 화면 길이와 방향. 운동이 이 자리를 다시 재지 않게 함께 쥔다. */
  x1: number;
  y1: number;
  ux: number;
  uy: number;
  len: number;
};

/** 눈금에 앉은 자국 하나. 나는 자국의 도착 자리가 여기서 나온다. */
type MarkDrawn = { node: SVGCircleElement; x: number; y: number };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  /** 이 장면의 척도. 바탕의 점과 eps 가 정하므로 걸음마다 같은 값이 나온다. */
  epsR: number;
  fx(x: number): number;
  fy(y: number): number;
  inkOf(cluster: number): string;
  dots: SVGCircleElement[];
  /** 이음. `${무리}:${겹}:${차례}` 로 쥔다. */
  links: Map<string, SVGLineElement>;
  /** 눈금의 자국. `axisMarks` 의 key 로 쥔다. */
  marks: Map<string, MarkDrawn>;
  /** 무리마다의 이웃 수 딱지. */
  badges: SVGGElement[];
  /** 지금 열려 있는 eps 원. */
  disks: Map<number, SVGCircleElement>;
  /** 번짐이 멎은 자리의 그림. 무리 차례로 쥔다. */
  gaps: Map<number, GapDrawn>;
};

export const denseNeighborhoodStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DenseNeighborhoodScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    /**
     * 무리 둘을 갈라 보이는 식별색 (S-view 결정 트리 3).
     *
     * 색판의 크기를 **자취에서 드러난 무리 수**로 정하지 않는다 — `categorical` 은
     * 인자가 바뀌면 hue 간격이 통째로 갈려, 무리가 하나 더 붙는 순간 이미 칠한
     * 무리의 색이 바뀐다. 무리 수는 바탕에서 셀 수 없는 값이라 상수로 둔다.
     */
    const clusterInk = categorical(2, 'vivid');

    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gBase = el('g');
    const gDisk = el('g');
    const gLink = el('g');
    const gGap = el('g');
    const gPoint = el('g');
    const gBadge = el('g');
    const gDot = el('g');
    const gAxis = el('g');
    const gCaption = el('g');
    const layers = [gBase, gDisk, gLink, gGap, gPoint, gBadge, gDot, gAxis, gCaption];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
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
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     *
     * 첫 마디를 곧바로 그린다. 프레임을 기다리면 그 사이에 정적 그리기가 세운 **끝
     * 자리**가 한 번 번쩍인다.
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(id);
          // 세대가 바뀌었으면 그리지 않고 물러난다. 기다리던 약속은 풀어 준다.
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
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        tick();
      });
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────
    //
    // 수는 전부 자취에서 나온다. 화면이 세는 것과 캡션이 말하는 것이 같은 함수를
    // 지나므로 갈릴 자리가 없다.

    function captionFor(scene: DenseNeighborhoodScene): string {
      const step = scene.step;
      if (step === null) {
        return t('caption.start', 'Points on a plane, no group yet. Count: {n}.', {
          n: scene.points.length,
        });
      }
      const cluster = scene.clusters[scene.clusters.length - 1];
      switch (step.kind) {
        case 'ignite':
          return scene.clusters.length <= 1
            ? t('caption.ignite', 'A spark here. Neighbours inside eps, itself included: {n}.', {
                n: cluster?.neighborCount ?? 0,
              })
            : t(
                'caption.reignite',
                'A new spark where the fire never reached. Neighbours inside eps: {n}.',
                { n: cluster?.neighborCount ?? 0 },
              );
        case 'spread':
          return t(
            'caption.spread',
            'The fire jumps to the neighbours of neighbours. In the group: {total}.',
            { total: cluster === undefined ? 0 : membersOf(cluster).length },
          );
        case 'blocked': {
          const pair = cluster?.blocked ?? null;
          return t(
            'caption.blocked',
            'Nothing more inside eps. Distance to the nearest point outside: {d}.',
            { d: (pair === null ? 0 : distanceOf(scene, pair)).toFixed(2) },
          );
        }
        case 'settle': {
          const sizes = sizesOf(scene);
          return t('caption.done', 'Groups the fire settled into: {k}. Sizes: {list}.', {
            k: sizes.length,
            list: sizes.join(', '),
          });
        }
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: DenseNeighborhoodScene): Drawn {
      rewind();

      // ── 자료 좌표 → 화면 좌표. 점과 eps 원이 다 들어가게 잡고, 가로세로를 같게 둔다.
      const eps = scene.eps;
      const { scale, midX, midY } = scaleOf(scene.points, eps);
      const epsR = eps * scale;
      const fx = (x: number): number => PAD + FIELD / 2 + (x - midX) * scale;
      const fy = (y: number): number => TOP + FIELD / 2 - (y - midY) * scale;

      // ── 오른쪽 축. 0 부터 eps 의 두 곱까지. eps 가 한가운데 줄이 된다.
      const dMax = Math.max(eps * 2, 0.001);
      const py = (d: number): number => PLOT_BOT - (Math.min(d, dMax) / dMax) * PLOT_H;

      const inkOf = (cluster: number): string =>
        clusterInk[cluster % clusterInk.length] ?? c.text;

      // ── 뼈대
      gBase.appendChild(
        el('rect', {
          x: PAD, y: TOP, width: FIELD, height: FIELD,
          rx: 6, fill: c.bgSubtle, stroke: c.border,
        }),
      );
      gBase.appendChild(
        el('rect', {
          x: PANEL_X, y: TOP, width: W - PAD - PANEL_X, height: FIELD,
          rx: 6, fill: c.bg, stroke: c.border,
        }),
      );

      // ── 축과 눈금
      const axisTitle = el('text', {
        x: PANEL_X + 12, y: TOP + 20,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      axisTitle.textContent = t('label.pairDistance', 'distance between the two points');
      gAxis.appendChild(axisTitle);

      gAxis.appendChild(
        el('line', { x1: AXIS_X, y1: PLOT_BOT, x2: AXIS_X, y2: PLOT_TOP, stroke: c.border }),
      );
      for (const v of [0, eps, dMax]) {
        const y = py(v);
        gAxis.appendChild(el('line', { x1: AXIS_X - 4, y1: y, x2: AXIS_X, y2: y, stroke: c.border }));
        const label = el('text', {
          x: AXIS_X - 7, y: y + 3.5,
          'text-anchor': 'end',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
        });
        label.textContent = v.toFixed(2);
        gAxis.appendChild(label);
      }

      // eps 문턱. 이 줄 하나가 무리를 가른다.
      const epsY = py(eps);
      gAxis.appendChild(
        el('line', {
          x1: AXIS_X, y1: epsY, x2: W - PAD, y2: epsY,
          stroke: c.text, 'stroke-width': 1.2, 'stroke-dasharray': '5 4',
        }),
      );
      const epsTag = el('text', {
        x: AXIS_X + 4, y: epsY - 6,
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text,
      });
      epsTag.textContent = `eps = ${eps.toFixed(2)}`;
      gAxis.appendChild(epsTag);

      const farTag = el('text', {
        x: W - PAD - 4, y: epsY - 6,
        'text-anchor': 'end',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      farTag.textContent = t('label.tooFar', 'too far');
      gAxis.appendChild(farTag);

      const nearTag = el('text', {
        x: W - PAD - 4, y: epsY + 15,
        'text-anchor': 'end',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      nearTag.textContent = t('label.linked', 'linked');
      gAxis.appendChild(nearTag);

      // ── 자취에서 나오는 것들
      const member = membershipOf(scene);
      const seeds = new Set(scene.clusters.map((cluster) => cluster.seed));
      const stoppedEnds = new Set<number>();
      for (const cluster of scene.clusters) {
        if (cluster.blocked === null) continue;
        stoppedEnds.add(cluster.blocked.from);
        stoppedEnds.add(cluster.blocked.to);
      }

      // ── 이음. 불이 실제로 건너간 자리다.
      const links = new Map<string, SVGLineElement>();
      scene.clusters.forEach((cluster, ci) => {
        const ink = inkOf(ci);
        cluster.waves.forEach((wave, wi) => {
          wave.links.forEach((pair, li) => {
            const a = scene.points[pair.from];
            const b = scene.points[pair.to];
            if (a === undefined || b === undefined) return;
            const line = el('line', {
              x1: fx(a.x), y1: fy(a.y), x2: fx(b.x), y2: fy(b.y),
              stroke: ink, 'stroke-width': scene.settled ? 3 : 2,
            });
            gLink.appendChild(line);
            links.set(`${ci}:${wi}:${li}`, line);
          });
        });
      });

      // ── 번짐이 멎은 자리. 완주 화면까지 남는다 — 논증의 절반이다.
      const gaps = new Map<number, GapDrawn>();
      scene.clusters.forEach((cluster, ci) => {
        const pair = cluster.blocked;
        if (pair === null) return;
        const a = scene.points[pair.from];
        const b = scene.points[pair.to];
        if (a === undefined || b === undefined) return;
        const x1 = fx(a.x);
        const y1 = fy(a.y);
        const x2 = fx(b.x);
        const y2 = fy(b.y);
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;

        const reach = el('circle', {
          cx: x1, cy: y1, r: epsR,
          fill: 'none', stroke: c.danger, 'stroke-width': 1.4, 'stroke-dasharray': '3 3',
        });
        gGap.appendChild(reach);
        // 가는 선은 두 점 사이 거리 전체, 굵은 선은 그중 **손이 닿지 않는 만큼**이다.
        const span = el('line', {
          x1, y1, x2, y2,
          stroke: c.danger, 'stroke-width': 1, 'stroke-dasharray': '2 3',
        });
        gGap.appendChild(span);
        const shortfall = el('line', {
          x1: x1 + ux * epsR, y1: y1 + uy * epsR, x2, y2,
          stroke: c.danger, 'stroke-width': 2.4,
        });
        gGap.appendChild(shortfall);
        const tag = el('text', {
          x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 - 6,
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.danger,
        });
        tag.textContent = distanceOf(scene, pair).toFixed(2);
        gGap.appendChild(tag);

        gaps.set(ci, { reach, span, shortfall, tag, x1, y1, ux, uy, len });
      });

      // ── 앞자락의 eps 원. 번짐이 멎었거나 불이 앉았으면 하나도 없다.
      const disks = new Map<number, SVGCircleElement>();
      const openAt = scene.clusters.length - 1;
      for (const index of openFrontier(scene)) {
        const p = scene.points[index];
        if (p === undefined) continue;
        const ink = inkOf(openAt);
        const disk = el('circle', {
          cx: fx(p.x), cy: fy(p.y), r: epsR,
          fill: alpha(ink, 0.12), stroke: ink, 'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
        gDisk.appendChild(disk);
        disks.set(index, disk);
      }

      /*
       * ── 점. 채움은 어느 무리에 들었나, 테두리는 짚음의 표식이다.
       *
       * 불이 끝내 닿지 않은 점을 가리는 물음에 답이 하나뿐이다 — 옛 화면은 제가 칠한
       * `stroke` 를 도로 읽어 그것을 셈했다.
       */
      const dots: SVGCircleElement[] = scene.points.map((p, index) => {
        const at = member[index] ?? null;
        const stopped = stoppedEnds.has(index);
        const node = el('circle', {
          cx: fx(p.x), cy: fy(p.y),
          r: at === null ? PT_R : scene.settled ? PT_R_ON + 1 : PT_R_ON,
          fill: at === null ? c.bg : inkOf(at),
          stroke: stopped ? c.danger : seeds.has(index) ? c.text : c.textMuted,
          'stroke-width': stopped ? 2.2 : seeds.has(index) ? 2 : 1.4,
        });
        gPoint.appendChild(node);
        return node;
      });

      // ── 불씨의 이웃 수 딱지. 무리마다 하나씩 남는다.
      const badges: SVGGElement[] = [];
      scene.clusters.forEach((cluster, ci) => {
        const p = scene.points[cluster.seed];
        if (p === undefined) return;
        const ink = inkOf(ci);
        const g = el('g');
        const bx = fx(p.x) + 11;
        const by = fy(p.y) - 11;
        g.appendChild(
          el('circle', { cx: bx, cy: by, r: 9, fill: ink, stroke: c.bg, 'stroke-width': 1.5 }),
        );
        const numText = el('text', {
          x: bx, y: by + 3.5,
          'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.stateInk,
        });
        numText.textContent = String(cluster.neighborCount);
        g.appendChild(numText);
        gBadge.appendChild(g);
        badges[ci] = g;
      });

      /*
       * ── 거리 눈금의 자국.
       *
       * 같은 거리끼리 옆으로 나란히 설 때 몇 번째 칸인가는 `axisMarks` 의 차례가
       * 정한다. 여기서 세는 통은 이 그리기 안에서만 살므로, 어느 걸음에서 오든 같은
       * 자국이 같은 칸에 앉는다.
       */
      const used = new Map<number, number>();
      const marks = new Map<string, MarkDrawn>();
      for (const mark of axisMarks(scene)) {
        const d = distanceOf(scene, mark.pair);
        const key = Math.round(d / DOT_BUCKET);
        const at = used.get(key) ?? 0;
        used.set(key, at + 1);
        const x = Math.min(PLOT_X0 + at * DOT_STEP, DOT_MAX_X);
        const y = py(d);
        const node =
          mark.kind === 'link'
            ? el('circle', { cx: x, cy: y, r: 3.4, fill: inkOf(mark.cluster) })
            : el('circle', {
                cx: x, cy: y,
                r: mark.kind === 'blocked' ? 4.2 : 3.4,
                fill: 'none', stroke: c.danger,
                'stroke-width': mark.kind === 'blocked' ? 2 : 1.4,
              });
        gDot.appendChild(node);
        marks.set(mark.key, { node, x, y });
      }

      // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: W / 2, y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text,
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      return { epsR, fx, fy, inkOf, dots, links, marks, badges, disks, gaps };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 끝나면 마지막 정적 그리기가 통째로 걷어 간다.
    // 오므라드는 원처럼 끝 화면에 없는 것만 여기서 새로 짓는다.

    /** 오므라들 원을 짓는다. 출발 크기는 언제나 epsR 이라 화면을 되읽을 것이 없다. */
    function makeClosing(
      scene: DenseNeighborhoodScene,
      drawn: Drawn,
      indices: readonly number[],
      cluster: number,
    ): SVGCircleElement[] {
      const ink = drawn.inkOf(cluster);
      const out: SVGCircleElement[] = [];
      for (const index of indices) {
        const p = scene.points[index];
        if (p === undefined) continue;
        const node = el('circle', {
          cx: drawn.fx(p.x), cy: drawn.fy(p.y), r: drawn.epsR,
          fill: alpha(ink, 0.12), stroke: ink, 'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
        gDisk.appendChild(node);
        out.push(node);
      }
      return out;
    }

    /** 불씨가 놓이고 그 자리에서 eps 원이 자란다. 딱지는 원이 다 자란 뒤에 붙는다. */
    function flowIgnite(
      scene: DenseNeighborhoodScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const at = scene.clusters.length - 1;
      const cluster = scene.clusters[at];
      if (cluster === undefined) return Promise.resolve();
      const disk = drawn.disks.get(cluster.seed);
      const badge = drawn.badges[at];
      return tween(WAVE_MS, mine, (p) => {
        const e = ease(p);
        disk?.setAttribute('r', String(drawn.epsR * e));
        badge?.setAttribute('opacity', p >= 1 ? '1' : '0');
      });
    }

    /**
     * 물결 한 겹.
     *
     * 이음이 뻗고, 그 거리가 눈금으로 날아가고, 닿은 자리에서 새 원이 자라며 앞의
     * 원은 오므라든다. 한 뜻으로 묶인 운동이라 **시계를 하나만 둔다** — 마디를 나눠
     * 따로 흘리면 이어짐이 우연히 맞는 꼴이 되고 하나를 `void` 로 던질 여지가
     * 생긴다 (S-scene).
     */
    function flowSpread(
      scene: DenseNeighborhoodScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const at = scene.clusters.length - 1;
      const cluster = scene.clusters[at];
      if (cluster === undefined) return Promise.resolve();
      const wi = cluster.waves.length - 1;
      const wave = cluster.waves[wi];
      if (wave === undefined) return Promise.resolve();

      // 뻗어 나갈 이음. 길이는 두 점에서 셈하므로 화면을 되읽을 것이 없다.
      const growing: { node: SVGLineElement; len: number }[] = [];
      // 눈금으로 날아갈 자국. 정적으로 이미 앉아 있는 것을 숨기고 나는 것을 짓는다.
      const flights: { flier: SVGCircleElement; mark: MarkDrawn; x: number; y: number }[] = [];
      wave.links.forEach((pair, li) => {
        const a = scene.points[pair.from];
        const b = scene.points[pair.to];
        if (a === undefined || b === undefined) return;
        const x1 = drawn.fx(a.x);
        const y1 = drawn.fy(a.y);
        const x2 = drawn.fx(b.x);
        const y2 = drawn.fy(b.y);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const node = drawn.links.get(`${at}:${wi}:${li}`);
        if (node !== undefined) {
          node.setAttribute('stroke-dasharray', `${len} ${len}`);
          growing.push({ node, len });
        }
        const mark = drawn.marks.get(`l:${at}:${wi}:${li}`);
        if (mark === undefined) return;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const flier = el('circle', {
          cx: mx, cy: my, r: 3.4, fill: drawn.inkOf(at),
        });
        gDot.appendChild(flier);
        flights.push({ flier, mark, x: mx, y: my });
      });

      // 이번에 자라는 원과, 자리를 내주고 오므라드는 원. 둘 다 자취에서 나온다 —
      // 앞자락 한 칸을 물려 부르면 되므로 `prev` 를 들출 일이 없다 (S-scene).
      const keep = new Set(frontierAt(cluster, cluster.waves.length));
      const closing = makeClosing(
        scene,
        drawn,
        frontierAt(cluster, cluster.waves.length - 1).filter((i) => !keep.has(i)),
        at,
      );
      const opening: SVGCircleElement[] = [];
      const lighting: SVGCircleElement[] = [];
      for (const index of keep) {
        const disk = drawn.disks.get(index);
        if (disk !== undefined) opening.push(disk);
        const dot = drawn.dots[index];
        if (dot !== undefined) lighting.push(dot);
      }
      const rejectMark = drawn.marks.get(`r:${at}:${wi}`);

      const total = LINK_MS + WAVE_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;

        // 1) 이음이 뻗어 나간다.
        const reach = ease(ms / LINK_MS);
        for (const { node, len } of growing) {
          node.setAttribute('stroke-dashoffset', String(len * (1 - reach)));
        }

        // 2) 그 거리가 눈금으로 날아간다. 시계 전체를 쓴다.
        const flown = ease(p);
        for (const { flier, mark, x, y } of flights) {
          flier.setAttribute('cx', String(x + (mark.x - x) * flown));
          flier.setAttribute('cy', String(y + (mark.y - y) * flown));
          flier.setAttribute('opacity', p >= 1 ? '0' : '1');
          mark.node.setAttribute('opacity', p >= 1 ? '1' : '0');
        }

        // 3) 닿은 자리에서 새 원이 자라고, 앞의 원은 오므라든다.
        const wave2 = ease((ms - LINK_MS) / WAVE_MS);
        for (const node of opening) node.setAttribute('r', String(drawn.epsR * wave2));
        for (const node of closing) node.setAttribute('r', String(drawn.epsR * (1 - wave2)));
        for (const node of lighting) {
          node.setAttribute('r', String(PT_R + (PT_R_ON - PT_R) * wave2));
        }
        if (rejectMark !== undefined) {
          rejectMark.node.setAttribute('cy', String(rejectMark.y - DROP_RISE * (1 - wave2)));
        }
      });
    }

    /** 번짐이 멎는다. 원이 오므라들고, 손이 닿지 않는 만큼이 그어진다. */
    function flowBlocked(
      scene: DenseNeighborhoodScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const at = scene.clusters.length - 1;
      const cluster = scene.clusters[at];
      if (cluster === undefined) return Promise.resolve();
      const gap = drawn.gaps.get(at);
      if (gap === undefined) return Promise.resolve();

      const closing = makeClosing(scene, drawn, frontierAt(cluster, cluster.waves.length), at);
      const mark = drawn.marks.get(`b:${at}`);

      const total = WAVE_MS + GAP_MS + WAVE_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;

        // 1) 앞자락의 원이 오므라든다.
        const shut = ease(ms / WAVE_MS);
        for (const node of closing) node.setAttribute('r', String(drawn.epsR * (1 - shut)));

        // 2) 손이 닿는 데까지의 원이 서고, 그 테두리에서 멈추는 것이 그어진다.
        const e = ease((ms - WAVE_MS) / GAP_MS);
        gap.reach.setAttribute('r', String(drawn.epsR * Math.min(1, e * 2)));
        gap.span.setAttribute('x2', String(gap.x1 + gap.ux * gap.len * e));
        gap.span.setAttribute('y2', String(gap.y1 + gap.uy * gap.len * e));
        const rest = Math.max(0, e * 2 - 1);
        const out = drawn.epsR + (gap.len - drawn.epsR) * rest;
        gap.shortfall.setAttribute('x2', String(gap.x1 + gap.ux * out));
        gap.shortfall.setAttribute('y2', String(gap.y1 + gap.uy * out));
        gap.tag.setAttribute('opacity', e >= 1 ? '1' : '0');

        // 3) 그 거리가 눈금의 위쪽 무더기로 떨어진다.
        const drop = ease((ms - WAVE_MS - GAP_MS) / WAVE_MS);
        if (mark !== undefined) {
          mark.node.setAttribute('cy', String(mark.y - DROP_RISE * (1 - drop)));
        }
      });
    }

    /** 불이 다 앉는다. 남은 원이 오므라들고 이음과 든 점이 굵어진다. */
    function flowSettle(
      scene: DenseNeighborhoodScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const at = scene.clusters.length - 1;
      const cluster = scene.clusters[at];
      // 번짐이 멎은 무리는 이미 원을 닫았다 — 그때 닫힌 것을 다시 닫지 않는다.
      const open =
        cluster === undefined || cluster.blocked !== null
          ? []
          : frontierAt(cluster, cluster.waves.length);
      const closing = makeClosing(scene, drawn, open, Math.max(0, at));

      const member = membershipOf(scene);
      const grown: SVGCircleElement[] = [];
      member.forEach((joined, index) => {
        if (joined === null) return;
        const dot = drawn.dots[index];
        if (dot !== undefined) grown.push(dot);
      });
      const lines = [...drawn.links.values()];

      const total = WAVE_MS + SETTLE_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const shut = ease(ms / WAVE_MS);
        for (const node of closing) node.setAttribute('r', String(drawn.epsR * (1 - shut)));
        const e = ease((ms - WAVE_MS) / SETTLE_MS);
        for (const line of lines) line.setAttribute('stroke-width', String(2 + e));
        for (const dot of grown) dot.setAttribute('r', String(PT_R_ON + e));
      });
    }

    function flowFor(scene: DenseNeighborhoodScene, drawn: Drawn, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'ignite':
          return flowIgnite(scene, drawn, mine);
        case 'spread':
          return flowSpread(scene, drawn, mine);
        case 'blocked':
          return flowBlocked(scene, drawn, mine);
        case 'settle':
          return flowSettle(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: DenseNeighborhoodScene,
      _prev: DenseNeighborhoodScene | null,
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
        svg.textContent = '';
      },
    };
  },
};
