/**
 * support-vectors-only-stage — 지워도 안 움직인다 ↔ 건드리면 따라온다.
 *
 * 이 조각의 어려움은 **아무 일도 일어나지 않는 것을 보이는 일**이다. 선이 안
 * 움직였다는 것은 화면에서 정지와 구별되지 않으므로, 손질마다 선을 **다시 푸는
 * 장면**을 실제로 보인다. 탐침이 무리의 무게중심을 축으로 방향을 훑다가 자리를
 * 잡는데, 처음 선이 유령 띠로 그 자리에 남아 있어 탐침이 **그 위로 되돌아오는지
 * 아래로 내려앉는지**가 보인다. 움직임이 있었는데 결과가 같은 것 — 그것이 이
 * 조각이 말하려는 바다.
 *
 * 화면은 둘로 갈린다.
 *   왼쪽   점이 놓인 무대. 산점도는 주인공이 아니라 손질이 벌어지는 자리다.
 *   오른쪽 선의 자리 기록. 풀이가 끝날 때마다 선의 단면(띠 가장자리 둘과 그
 *          한가운데)이 무대에서 떨어져 나와 기둥으로 날아가 쌓인다. 처음 자리에
 *          가로 점선이 그어져 있어, 그대로인 것은 점선에 얹히고 움직인 것은
 *          점선 아래로 어긋난 채 짧아진다. 손질 셋의 결과가 한눈에 나란히 선다.
 *
 * ── 장면 방식이라 달라진 것
 *
 * 걸음마다 부르는 메서드가 없다. `render` 하나가 그 장면이 말하는 것을 통째로
 * 세우고, 흐르게 할 것이 있으면 그 다음에 흘린다. 그래서 되돌릴 명령이 없다.
 *
 * **척도를 변수로 쥐지 않는다.** `gaugeLo` · `gaugeHi` 가 `let` 으로 앉아 기록
 * 기둥의 모든 세로 자리를 정하던 자리였는데, 지금은 `layoutOf` 가 장면의 `first`
 * 에서 매번 셈해 그 `render` 안에서만 산다. 무대의 배율도 `base` 와 `moveTargets`
 * 에서 나온다. 장면은 값의 범위를 말하고 픽셀은 여기서 나온다 (S-piece).
 *
 * **견줌의 기준을 stage 가 적어 두지 않는다.** 처음 선이 어디였나는 `ghostSet` 과
 * `baseIntercept` 가 쥐고 있었는데 그것이 곧 이 조각의 주장이다. 지금은
 * `scene.first` 가 말하고, 유령 띠도 기록의 점선도 어느 걸음에서 오든 같은 자리에
 * 선다.
 *
 * **운동의 출발값을 화면에서 되읽지 않는다.** 고리의 지난 투명도 · 되돌리기 전의
 * 점 자리 · 옮기기 전의 점 자리 셋이 화면(과 그 거울)에서 나오던 자리였다. 지금은
 * `step.wasSupports` · `step.from` · `step.wasDropped` 가 말한다 (S-scene).
 *
 * 화면의 문자는 두 갈래다. 무리 이름표(`A` · `B`)와 띠 두께의 수치는 표식이라
 * 번역 대상이 아니고, 캡션과 기록의 이름표만 `params.t` 를 지난다 (C10).
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
  interceptOf,
  isAlive,
  liveCentroid,
  marginOf,
  wasSupport,
  type SupportVectorsOnlyScene,
  type SvoPoint,
  type SvoSolution,
} from './scene.js';

// ── 판

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view). */
const H = 430;
const W = PIECE_CANVAS_W;

const EDGE = 14;
const CAPTION_BASELINE = 23;
const PANEL_TOP = 38;
const PANEL_BOTTOM = 416;
/** 무대는 좁고 높다 — 자료가 x 로 여섯 칸, y 로 열한 칸이라 가로를 더 줘도 남는다. */
const PLOT_L = EDGE;
const PLOT_R = 228;
const LEDGER_L = 252;
const LEDGER_R = W - EDGE;

const LEDGER_TITLE_BASELINE = 57;
const LEDGER_LEGEND_Y = 72;
const BADGE_CY = 97;
const BADGE_R = 11;
const GAUGE_TOP = 120;
const GAUGE_BOTTOM = 386;
const COLUMN_LABEL_BASELINE = 403;

const DOT_R = 5.5;
const RING_R = 10;
/** 무대 둘레에 두는 자료 쪽 여백 (칸 단위). */
const PAD = 0.5;

const PLACE_MS = 460;
const SWEEP_MS = 620;
const BAND_MS = 280;
const FLY_MS = 520;
const RING_MS = 260;
const PULSE_MS = 420;
const DROP_MS = 480;
const RESTORE_MS = 440;
const MOVE_MS = 560;
const CONCLUDE_MS = 420;

/** 보간 한 마디의 길이. */
const FRAME_MS = 16;

/** 탐침이 훑고 오는 각. 이만큼 어긋난 데서 시작해 답으로 좁혀 든다. */
const SWEEP_ARC = 1.25;

const SVG_NS = 'http://www.w3.org/2000/svg';

let mountSeq = 0;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 칸 수는 정수로 떨어지는 것이 보통이라 꼬리 0 을 달지 않는다. */
function stepText(steps: number): string {
  return Number.isInteger(steps) ? String(steps) : steps.toFixed(2);
}

/**
 * 무대와 기록의 척도. **장면에서 매번 셈한다** — stage 가 변수로 쥐면 그것이 곧
 * 숨은 상태이고 되짚은 화면이 옛 척도로 선다.
 */
type Layout = {
  dataX0: number;
  dataX1: number;
  dataY0: number;
  dataY1: number;
  spanX: number;
  spanY: number;
  unit: number;
  plotOx: number;
  plotOy: number;
  /** 기록 기둥이 설 칸 수. 손질 수 + 처음 하나. */
  columnCount: number;
  /** 기록 눈금의 범위. 아직 푼 것이 없으면 null 이라 기둥도 점선도 없다. */
  gauge: { lo: number; hi: number } | null;
};

/** 점 하나의 손잡이. 정적 그리기가 매번 새로 짓는다. */
type NodeDrawn = { wrap: SVGGElement; ring: SVGCircleElement };

/** 무대에 선 선 한 벌. 아직 푼 것이 없으면 통째로 없다. */
type LineDrawn = {
  band: SVGPolygonElement;
  bandLo: SVGLineElement;
  bandHi: SVGLineElement;
  boundary: SVGLineElement;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  layout: Layout;
  /** 살아 있는 점만. 버려진 자리는 `null` 이다 — 없는 것은 짓지 않는다. */
  nodes: (NodeDrawn | null)[];
  line: LineDrawn | null;
  ghost: SVGLineElement | null;
  columns: SVGGElement[];
};

export const supportVectorsOnlyStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SupportVectorsOnlyScene> {
    const svg = params.canvas;
    const palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // 무리를 가르는 식별색. 수가 바뀔 일이 없으므로 상수 둘이다 (함정 12 무대상).
    const classTone = categorical(2, 'vivid');
    const colorOf = (group: 'A' | 'B'): string => (group === 'A' ? classTone[0] : classTone[1]);

    const clipId = `svo-plot-${(mountSeq += 1)}`;

    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    // ── 켜켜이. 층과 clip 은 mount 가 한 번 세우고 안쪽만 매번 다시 짓는다.
    const root = el('g', {});
    svg.appendChild(root);

    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(
      el('rect', {
        x: PLOT_L,
        y: PANEL_TOP,
        width: PLOT_R - PLOT_L,
        height: PANEL_BOTTOM - PANEL_TOP,
      }),
    );
    defs.appendChild(clip);
    root.appendChild(defs);

    const chrome = el('g', {});
    const plotInk = el('g', { 'clip-path': `url(#${clipId})` });
    const pointLayer = el('g', {});
    const ledgerLayer = el('g', {});
    const flyLayer = el('g', {});
    const layers = [chrome, plotInk, pointLayer, ledgerLayer, flyLayer];
    for (const g of layers) root.appendChild(g);

    // 재건 밖에 있는 하나. 자리는 고정이고 글자만 정적 그리기가 매번 다시 쓴다.
    const caption = el('text', {
      x: PLOT_L,
      y: CAPTION_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    root.appendChild(caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 한 걸음이 훑기 · 띠 열기 · 고리 · 날아가기 넉 마디를 이어 달린다. `destroy` 가
     * 그 가운데 오면 남은 마디가 **살아 있는 층**에 탐침과 날아가는 도막을 덧붙이므로,
     * 마디마다 자기 번호가 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 —
     * 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS transition 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition 은
     * 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
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

    // ── 척도 ─────────────────────────────────────────────────────────────

    function layoutOf(scene: SupportVectorsOnlyScene): Layout {
      const allX = [...scene.base.map((p) => p.x), ...scene.moveTargets.map((p) => p.x)];
      const allY = [...scene.base.map((p) => p.y), ...scene.moveTargets.map((p) => p.y)];
      const dataX0 = allX.length > 0 ? Math.min(...allX) - PAD : 0;
      const dataX1 = allX.length > 0 ? Math.max(...allX) + PAD : 1;
      const dataY0 = allY.length > 0 ? Math.min(...allY) - PAD : 0;
      const dataY1 = allY.length > 0 ? Math.max(...allY) + PAD : 1;
      const spanX = Math.max(1e-6, dataX1 - dataX0);
      const spanY = Math.max(1e-6, dataY1 - dataY0);
      const unit = Math.min((PLOT_R - PLOT_L) / spanX, (PANEL_BOTTOM - PANEL_TOP) / spanY);

      // 기록 눈금은 처음 선의 띠에 여유를 두고 잡는다. 어느 걸음에서 오든 같은 값이다.
      let gauge: { lo: number; hi: number } | null = null;
      if (scene.first !== null) {
        const height = Math.max(1e-6, scene.first.upper - scene.first.lower);
        gauge = { lo: scene.first.lower - 0.32 * height, hi: scene.first.upper + 0.32 * height };
      }

      return {
        dataX0,
        dataX1,
        dataY0,
        dataY1,
        spanX,
        spanY,
        unit,
        plotOx: PLOT_L + (PLOT_R - PLOT_L - spanX * unit) / 2,
        plotOy: PANEL_TOP + (PANEL_BOTTOM - PANEL_TOP - spanY * unit) / 2,
        columnCount: Math.max(1, scene.editCount + 1),
        gauge,
      };
    }

    const px = (l: Layout, x: number): number => l.plotOx + (x - l.dataX0) * l.unit;
    const py = (l: Layout, y: number): number => l.plotOy + (l.dataY1 - y) * l.unit;

    const gy = (l: Layout, v: number): number => {
      const g = l.gauge;
      if (g === null) return GAUGE_BOTTOM;
      return GAUGE_BOTTOM - ((v - g.lo) / (g.hi - g.lo)) * (GAUGE_BOTTOM - GAUGE_TOP);
    };

    const columnX = (l: Layout, slot: number): number =>
      LEDGER_L + ((LEDGER_R - LEDGER_L) * (slot + 0.5)) / l.columnCount;

    function lineEnds(l: Layout, slope: number, intercept: number): [number, number, number, number] {
      const xa = l.dataX0 - l.spanX;
      const xb = l.dataX1 + l.spanX;
      return [px(l, xa), py(l, slope * xa + intercept), px(l, xb), py(l, slope * xb + intercept)];
    }

    function straightAttrs(
      l: Layout,
      slope: number,
      intercept: number,
    ): Record<string, number> {
      const [x1, y1, x2, y2] = lineEnds(l, slope, intercept);
      return { x1, y1, x2, y2 };
    }

    function bandPoints(l: Layout, slope: number, lo: number, hi: number): string {
      const xa = l.dataX0 - l.spanX;
      const xb = l.dataX1 + l.spanX;
      return (
        `${px(l, xa)},${py(l, slope * xa + lo)} ${px(l, xb)},${py(l, slope * xb + lo)} ` +
        `${px(l, xb)},${py(l, slope * xb + hi)} ${px(l, xa)},${py(l, slope * xa + hi)}`
      );
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function clearLayer(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    /** 무대 테두리와 축, 무리 이름표, 기록 칸. 장면과 무관한 바탕이다. */
    function drawChrome(l: Layout): void {
      chrome.appendChild(
        el('rect', {
          x: PLOT_L,
          y: PANEL_TOP,
          width: PLOT_R - PLOT_L,
          height: PANEL_BOTTOM - PANEL_TOP,
          rx: 6,
          fill: 'none',
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );
      if (l.dataY0 < 0 && l.dataY1 > 0) {
        chrome.appendChild(
          el('line', {
            x1: PLOT_L + 4,
            y1: py(l, 0),
            x2: PLOT_R - 4,
            y2: py(l, 0),
            stroke: palette.border,
            'stroke-width': 1,
          }),
        );
      }
      if (l.dataX0 < 0 && l.dataX1 > 0) {
        chrome.appendChild(
          el('line', {
            x1: px(l, 0),
            y1: PANEL_TOP + 4,
            x2: px(l, 0),
            y2: PANEL_BOTTOM - 4,
            stroke: palette.border,
            'stroke-width': 1,
          }),
        );
        for (let v = Math.ceil(l.dataY0); v <= Math.floor(l.dataY1); v += 1) {
          if (v === 0) continue;
          chrome.appendChild(
            el('line', {
              x1: px(l, 0) - 3,
              y1: py(l, v),
              x2: px(l, 0) + 3,
              y2: py(l, v),
              stroke: palette.border,
              'stroke-width': 1,
            }),
          );
        }
      }
      if (l.dataY0 < 0 && l.dataY1 > 0) {
        for (let v = Math.ceil(l.dataX0); v <= Math.floor(l.dataX1); v += 1) {
          if (v === 0) continue;
          chrome.appendChild(
            el('line', {
              x1: px(l, v),
              y1: py(l, 0) - 3,
              x2: px(l, v),
              y2: py(l, 0) + 3,
              stroke: palette.border,
              'stroke-width': 1,
            }),
          );
        }
      }

      // 무리 이름표. 도형에 새긴 글자라 문안이 아니라 표식이다 (C10).
      const legendSpots: Array<{ dx: number; group: 'A' | 'B' }> = [
        { dx: 12, group: 'A' },
        { dx: 52, group: 'B' },
      ];
      for (const spot of legendSpots) {
        chrome.appendChild(
          el('circle', {
            cx: PLOT_L + spot.dx,
            cy: PANEL_TOP + 16,
            r: 4.5,
            fill: colorOf(spot.group),
          }),
        );
        const mark = el('text', {
          x: PLOT_L + spot.dx + 9,
          y: PANEL_TOP + 20,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: palette.textMuted,
        });
        mark.textContent = spot.group;
        chrome.appendChild(mark);
      }

      chrome.appendChild(
        el('rect', {
          x: LEDGER_L,
          y: PANEL_TOP,
          width: LEDGER_R - LEDGER_L,
          height: PANEL_BOTTOM - PANEL_TOP,
          rx: 6,
          fill: palette.bgSubtle,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );
      const ledgerTitle = el('text', {
        x: LEDGER_L + 14,
        y: LEDGER_TITLE_BASELINE,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.text,
      });
      ledgerTitle.textContent = t('label.record', 'Where the line sits');
      chrome.appendChild(ledgerTitle);
    }

    /** 처음 선의 자국. 견줄 짝이라 지우지 않고 끝까지 남는다. */
    function drawGhost(l: Layout, first: SvoSolution): SVGLineElement {
      const ghost = el('line', {
        ...straightAttrs(l, first.slope, interceptOf(first)),
        stroke: palette.ghostOutline,
        'stroke-width': 9,
        'stroke-linecap': 'round',
        opacity: 0.5,
      });
      plotInk.appendChild(ghost);
      return ghost;
    }

    /** 무대에 선 선과 그 띠. */
    function drawLine(l: Layout, sol: SvoSolution): LineDrawn {
      const band = el('polygon', {
        points: bandPoints(l, sol.slope, sol.lower, sol.upper),
        fill: palette.accent,
        'fill-opacity': 0.14,
      });
      const bandLo = el('line', {
        ...straightAttrs(l, sol.slope, sol.lower),
        stroke: palette.accent,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      });
      const bandHi = el('line', {
        ...straightAttrs(l, sol.slope, sol.upper),
        stroke: palette.accent,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      });
      const boundary = el('line', {
        ...straightAttrs(l, sol.slope, interceptOf(sol)),
        stroke: palette.text,
        'stroke-width': 2.4,
      });
      plotInk.appendChild(band);
      plotInk.appendChild(bandLo);
      plotInk.appendChild(bandHi);
      plotInk.appendChild(boundary);
      return { band, bandLo, bandHi, boundary };
    }

    /**
     * 점 하나.
     *
     * 채움은 **무리**를 말하고 (값이 어느 쪽 것인가), 고리는 **닿았다는 표식**이다
     * (선을 정했는가). 두 축을 갈라 두어야 닿은 점이 어느 무리인지가 함께 읽힌다
     * (함정 29).
     */
    function drawNode(l: Layout, p: SvoPoint, support: boolean, dim: boolean): NodeDrawn {
      const wrap = el('g', {
        transform: `translate(${px(l, p.x)}, ${py(l, p.y)})`,
        opacity: dim ? 0.28 : 1,
      });
      const ring = el('circle', {
        cx: 0,
        cy: 0,
        r: RING_R,
        fill: 'none',
        stroke: palette.accent,
        'stroke-width': 2.5,
        opacity: support ? 1 : 0,
      });
      const dot = el('circle', {
        cx: 0,
        cy: 0,
        r: DOT_R,
        fill: colorOf(p.group),
        stroke: palette.bg,
        'stroke-width': 1.5,
      });
      wrap.appendChild(ring);
      wrap.appendChild(dot);
      pointLayer.appendChild(wrap);
      return { wrap, ring };
    }

    function placeNode(node: NodeDrawn, l: Layout, x: number, y: number, lift: number): void {
      node.wrap.setAttribute('transform', `translate(${px(l, x)}, ${py(l, y) - lift})`);
    }

    /** 기록 눈금의 바탕 — 처음 자리의 가로 점선과 그 이름표. */
    function drawBaseline(l: Layout, first: SvoSolution): void {
      ledgerLayer.appendChild(
        el('line', {
          x1: LEDGER_L + 10,
          y1: gy(l, interceptOf(first)),
          x2: LEDGER_R - 8,
          y2: gy(l, interceptOf(first)),
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      ledgerLayer.appendChild(
        el('line', {
          x1: LEDGER_L + 14,
          y1: LEDGER_LEGEND_Y,
          x2: LEDGER_L + 32,
          y2: LEDGER_LEGEND_Y,
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      const legend = el('text', {
        x: LEDGER_L + 38,
        y: LEDGER_LEGEND_Y + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      legend.textContent = t('label.origin', 'first position');
      ledgerLayer.appendChild(legend);
    }

    /** 기록 기둥 하나. 길이가 띠 두께이고 주황 눈금이 선의 자리다. */
    function drawColumn(
      l: Layout,
      index: number,
      sol: SvoSolution,
      first: SvoSolution,
    ): SVGGElement {
      const cx = columnX(l, index);
      const group = el('g', {});
      const center = interceptOf(sol);

      group.appendChild(
        el('line', {
          x1: cx,
          y1: gy(l, sol.upper),
          x2: cx,
          y2: gy(l, sol.lower),
          stroke: palette.text,
          'stroke-width': 7,
          'stroke-linecap': 'round',
        }),
      );
      group.appendChild(
        el('line', {
          x1: cx - 11,
          y1: gy(l, center),
          x2: cx + 11,
          y2: gy(l, center),
          stroke: palette.accent,
          'stroke-width': 2.5,
        }),
      );

      // 처음 자리에서 얼마나 어긋났나. 그대로면 잴 것이 없어 그리지 않는다.
      const base = interceptOf(first);
      if (Math.abs(center - base) > 1e-6) {
        const barX = cx - 18;
        group.appendChild(
          el('line', {
            x1: barX,
            y1: gy(l, base),
            x2: barX,
            y2: gy(l, center),
            stroke: palette.accent,
            'stroke-width': 2.5,
          }),
        );
        for (const v of [base, center]) {
          group.appendChild(
            el('line', {
              x1: barX - 4,
              y1: gy(l, v),
              x2: barX + 4,
              y2: gy(l, v),
              stroke: palette.accent,
              'stroke-width': 2.5,
            }),
          );
        }
      }

      // 띠 두께. 화면의 띠와 같은 자료에서 셈한다 (함정 10).
      const width = el('text', {
        x: cx,
        y: gy(l, sol.lower) + 20,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
        'text-anchor': 'middle',
      });
      width.textContent = marginOf(sol).toFixed(3);
      group.appendChild(width);

      group.appendChild(
        el('circle', {
          cx,
          cy: BADGE_CY,
          r: BADGE_R,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 1.5,
        }),
      );
      const badge = el('text', {
        x: cx,
        y: BADGE_CY + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.text,
        'text-anchor': 'middle',
      });
      badge.textContent = String(sol.supports.length);
      group.appendChild(badge);

      const label = el('text', {
        x: cx,
        y: COLUMN_LABEL_BASELINE,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
        'text-anchor': 'middle',
      });
      label.textContent =
        index === 0 ? t('label.original', 'start') : t('label.trial', 'edit {n}', { n: index });
      group.appendChild(label);

      ledgerLayer.appendChild(group);
      return group;
    }

    /** 다시 푼 뒤의 말. 되돌리기 걸음도 이 말을 잇는다 — 선은 아직 앞 풀이의 것이다. */
    function solveCaption(scene: SupportVectorsOnlyScene): string {
      const sol = scene.solution;
      if (sol === null) return '';
      if (sol.verdict === 'first') {
        return t('caption.solve', 'Sweeping every direction for the widest gap between the groups.');
      }
      const n = sol.supports.length;
      return sol.verdict === 'same'
        ? t(
            'caption.same',
            'Solved again — the line lands right back on its first place. Touching: {n}.',
            { n },
          )
        : t(
            'caption.moved',
            'Solved again — the line followed, and the band narrowed. Touching: {n}.',
            { n },
          );
    }

    /**
     * 캡션. 무엇을 말할지는 `step` 이 정하고 인자는 장면이 센다 — 화면의 고리와 같은
     * 목록을 세므로 둘이 어긋날 자리가 없다 (C10).
     */
    function captionText(scene: SupportVectorsOnlyScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'place':
          return t('caption.place', 'Points on the board: {n}. Group A below, group B above.', {
            n: scene.points.length,
          });
        case 'solve':
          return solveCaption(scene);
        case 'mark': {
          const n = scene.solution === null ? 0 : scene.solution.supports.length;
          return t('caption.touching', 'Touching the edge: {n}. The other {rest} had no say.', {
            n,
            rest: scene.points.length - n,
          });
        }
        case 'drop':
          return t('caption.drop', 'Throw away everything that was not touching: {n}.', {
            n: step.indices.length,
          });
        case 'restore':
          return solveCaption(scene);
        case 'move': {
          const to = scene.points[step.index];
          const moved =
            to === undefined ? 0 : Math.hypot(to.x - step.from.x, to.y - step.from.y);
          return wasSupport(scene, step.index)
            ? t('caption.moveSupport', 'Back to the start, then one touching point moves {n} steps.', {
                n: stepText(moved),
              })
            : t('caption.moveFree', 'Back to the start, then one non-touching point moves {n} steps.', {
                n: stepText(moved),
              });
        }
        case 'done':
          return t('caption.done', 'Only the points sitting on the edge decide where the line goes.');
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene). */
    function drawStatic(scene: SupportVectorsOnlyScene): Drawn {
      for (const g of layers) clearLayer(g);
      caption.textContent = captionText(scene);

      const layout = layoutOf(scene);
      drawChrome(layout);

      const ghost = scene.first === null ? null : drawGhost(layout, scene.first);
      const line = scene.solution === null ? null : drawLine(layout, scene.solution);

      const supports = scene.solution === null ? [] : scene.solution.supports;
      const nodes: (NodeDrawn | null)[] = scene.points.map((p, i) => {
        // 버린 점은 숨기지 않고 짓지 않는다 (함정 17).
        if (!isAlive(scene, i)) return null;
        const support = supports.includes(i);
        return drawNode(layout, p, support, scene.concluded && !support);
      });

      const columns: SVGGElement[] = [];
      if (scene.first !== null) {
        drawBaseline(layout, scene.first);
        for (let i = 0; i < scene.records.length; i += 1) {
          const rec = scene.records[i];
          if (rec === undefined) continue;
          columns.push(drawColumn(layout, i, rec, scene.first));
        }
      }

      return { layout, nodes, line, ghost, columns };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 점이 하나씩 차례로 내려앉는다. */
    function flowPlace(scene: SupportVectorsOnlyScene, drawn: Drawn, mine: number): Promise<void> {
      const count = Math.max(1, drawn.nodes.length - 1);
      return tween(PLACE_MS, mine, (p) => {
        for (let i = 0; i < drawn.nodes.length; i += 1) {
          const node = drawn.nodes[i];
          const pt = scene.points[i];
          if (node === null || node === undefined || pt === undefined) continue;
          const share = 0.55;
          const from = (i / count) * (1 - share);
          const e = smooth(clamp01((p - from) / share));
          placeNode(node, drawn.layout, pt.x, pt.y, 16 * (1 - e));
          node.wrap.setAttribute('opacity', String(e));
        }
      });
    }

    /** 고리를 지금 이 장면이 말하는 자리로 세운다. 흐르기 전의 밑그림이다. */
    function setRings(drawn: Drawn, shown: readonly number[]): void {
      for (let i = 0; i < drawn.nodes.length; i += 1) {
        const node = drawn.nodes[i];
        if (node === null || node === undefined) continue;
        node.ring.setAttribute('opacity', shown.includes(i) ? '1' : '0');
      }
    }

    /**
     * 방향을 훑어 선을 다시 푼다. 네 마디가 한 걸음이다 —
     * 훑기 → 띠 열기 → 고리 → 기록으로 날아가기.
     */
    async function flowSolve(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      step: { kind: 'solve'; wasSupports: readonly number[] },
      mine: number,
    ): Promise<void> {
      const sol = scene.solution;
      const line = drawn.line;
      const l = drawn.layout;
      if (sol === null || line === null) return;

      // 다시 푸는 동안 남는 것은 처음 자리의 유령뿐이다. 그 유령이 처음 풀이에서
      // 막 생긴 것이면 아직 없던 것이라 훑는 동안에는 짓지 않는다.
      const firstSolve = scene.records.length <= 1;
      if (firstSolve) drawn.ghost?.setAttribute('opacity', '0');
      for (const target of [line.band, line.bandLo, line.bandHi, line.boundary]) {
        target.setAttribute('opacity', '0');
      }
      setRings(drawn, step.wasSupports);

      // 기록 기둥은 무대에서 떨어져 나와 날아간 뒤에 선다.
      const landing = drawn.columns[drawn.columns.length - 1];
      landing?.setAttribute('opacity', '0');

      const center = interceptOf(sol);
      const normalX = sol.slope / Math.hypot(sol.slope, 1);
      const normalY = -1 / Math.hypot(sol.slope, 1);
      let endTheta = Math.atan2(normalY, normalX);
      if (endTheta < 0) endTheta += Math.PI;
      const endOffset = Math.sin(endTheta) * center;
      const pivot = liveCentroid(scene);

      const probe = el('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        stroke: palette.text,
        'stroke-width': 1.4,
        'stroke-dasharray': '3 4',
      });
      plotInk.appendChild(probe);

      /** 법선각과 원점 거리로 탐침을 놓는다. 세로에 가까운 각도 그려야 해서 일반형을 쓴다. */
      const drawProbe = (theta: number, offset: number): void => {
        const wx = Math.cos(theta);
        const wy = Math.sin(theta);
        const cx = px(l, offset * wx);
        const cy = py(l, offset * wy);
        const dx = -wy;
        const dy = -wx;
        const reach = 900;
        probe.setAttribute('x1', String(cx - reach * dx));
        probe.setAttribute('y1', String(cy - reach * dy));
        probe.setAttribute('x2', String(cx + reach * dx));
        probe.setAttribute('y2', String(cy + reach * dy));
      };

      // 첫 프레임이 오기 전의 묵은 좌표가 한 번 번쩍이지 않게 미리 놓는다.
      const startTheta = endTheta - SWEEP_ARC;
      drawProbe(startTheta, Math.cos(startTheta) * pivot.x + Math.sin(startTheta) * pivot.y);
      await tween(SWEEP_MS, mine, (p) => {
        const e = smooth(p);
        const theta = endTheta - (1 - e) * SWEEP_ARC;
        const through = Math.cos(theta) * pivot.x + Math.sin(theta) * pivot.y;
        drawProbe(theta, through * (1 - e * e) + endOffset * e * e);
      });
      probe.remove();
      if (!alive(mine)) return;

      // 띠가 선에서 양쪽으로 열린다.
      if (firstSolve) drawn.ghost?.setAttribute('opacity', '0.5');
      for (const target of [line.band, line.bandLo, line.bandHi, line.boundary]) {
        target.removeAttribute('opacity');
      }
      await tween(BAND_MS, mine, (p) => {
        const e = smooth(p);
        const lo = center + (sol.lower - center) * e;
        const hi = center + (sol.upper - center) * e;
        line.band.setAttribute('points', bandPoints(l, sol.slope, lo, hi));
        const loEnds = straightAttrs(l, sol.slope, lo);
        const hiEnds = straightAttrs(l, sol.slope, hi);
        for (const [k, v] of Object.entries(loEnds)) line.bandLo.setAttribute(k, String(v));
        for (const [k, v] of Object.entries(hiEnds)) line.bandHi.setAttribute(k, String(v));
      });
      if (!alive(mine)) return;

      // 닿은 점에 고리가 선다. 출발 그림은 `step.wasSupports` 가 말한다.
      await tween(RING_MS, mine, (p) => {
        const e = smooth(p);
        for (let i = 0; i < drawn.nodes.length; i += 1) {
          const node = drawn.nodes[i];
          if (node === null || node === undefined) continue;
          const from = step.wasSupports.includes(i) ? 1 : 0;
          const to = sol.supports.includes(i) ? 1 : 0;
          node.ring.setAttribute('opacity', String(from + (to - from) * e));
          if (to === 1) node.ring.setAttribute('r', String(RING_R + 6 * (1 - e)));
        }
      });
      if (!alive(mine)) return;

      await flyToLedger(scene, drawn, sol, mine);
    }

    /** 선의 단면이 무대에서 떨어져 나와 기록 기둥으로 날아간다. */
    async function flyToLedger(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      sol: SvoSolution,
      mine: number,
    ): Promise<void> {
      const l = drawn.layout;
      const slot = scene.records.length - 1;
      if (slot < 0) return;

      const center = interceptOf(sol);
      const fromCenter = py(l, center);
      const fromHalf = Math.abs(py(l, sol.lower) - py(l, sol.upper)) / 2;
      const fromX = px(l, Math.max(l.dataX0, Math.min(l.dataX1, 0)));
      const toCenter = gy(l, center);
      const toHalf = Math.abs(gy(l, sol.lower) - gy(l, sol.upper)) / 2;
      const toX = columnX(l, slot);

      const flier = el('line', {
        x1: fromX,
        y1: fromCenter - fromHalf,
        x2: fromX,
        y2: fromCenter + fromHalf,
        stroke: palette.text,
        'stroke-width': 7,
        'stroke-linecap': 'round',
      });
      flyLayer.appendChild(flier);

      await tween(FLY_MS, mine, (p) => {
        const e = smooth(p);
        const cx = fromX + (toX - fromX) * e;
        const cy = fromCenter + (toCenter - fromCenter) * e;
        const half = fromHalf + (toHalf - fromHalf) * e;
        flier.setAttribute('x1', String(cx));
        flier.setAttribute('y1', String(cy - half));
        flier.setAttribute('x2', String(cx));
        flier.setAttribute('y2', String(cy + half));
      });
      flier.remove();
      if (!alive(mine)) return;
      drawn.columns[drawn.columns.length - 1]?.removeAttribute('opacity');
    }

    /** 닿은 점의 고리가 한 번 부푼다. */
    function flowMark(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const supports = scene.solution === null ? [] : scene.solution.supports;
      if (supports.length === 0) return Promise.resolve();
      return tween(PULSE_MS, mine, (p) => {
        const swell = Math.sin(p * Math.PI);
        for (const i of supports) {
          const node = drawn.nodes[i];
          if (node === null || node === undefined) continue;
          node.ring.setAttribute('r', String(RING_R + 5 * swell));
          node.ring.setAttribute('stroke-width', String(2.5 + 1.5 * swell));
        }
      });
    }

    /**
     * 닿지 않은 점을 버린다.
     *
     * 정적 그리기가 이미 그 점들을 짓지 않으므로, 떠나는 몸짓만 임시로 세웠다 거둔다.
     * 자리는 장면이 말하는 값에서 나온다 — 화면을 되읽지 않는다.
     */
    async function flowDrop(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      step: { kind: 'drop'; indices: readonly number[] },
      mine: number,
    ): Promise<void> {
      const l = drawn.layout;
      const supports = scene.solution === null ? [] : scene.solution.supports;
      const leaving: { node: NodeDrawn; p: SvoPoint }[] = [];
      for (const i of step.indices) {
        const p = scene.points[i];
        if (p === undefined) continue;
        leaving.push({ node: drawNode(l, p, supports.includes(i), false), p });
      }
      if (leaving.length === 0) return;

      await tween(DROP_MS, mine, (q) => {
        const e = smooth(q);
        for (const item of leaving) {
          placeNode(item.node, l, item.p.x, item.p.y, -34 * e);
          item.node.wrap.setAttribute('opacity', String(1 - e));
        }
      });
      for (const item of leaving) item.node.wrap.remove();
    }

    /** 앞 손질을 되돌린다. 떠나온 자리는 `step.from` 이 말한다. */
    function flowRestore(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      step: { kind: 'restore'; from: readonly SvoPoint[]; wasDropped: readonly number[] },
      mine: number,
    ): Promise<void> {
      return tween(RESTORE_MS, mine, (q) => {
        const e = smooth(q);
        for (let i = 0; i < drawn.nodes.length; i += 1) {
          const node = drawn.nodes[i];
          const to = scene.points[i];
          const from = step.from[i];
          if (node === null || node === undefined || to === undefined || from === undefined) continue;
          placeNode(node, drawn.layout, from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, 0);
          node.wrap.setAttribute('opacity', step.wasDropped.includes(i) ? String(e) : '1');
        }
      });
    }

    /** 점 하나가 옮겨 간다. 떠난 자리는 `step.from` 이 말한다. */
    function flowMove(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      step: { kind: 'move'; index: number; from: SvoPoint },
      mine: number,
    ): Promise<void> {
      const node = drawn.nodes[step.index];
      const to = scene.points[step.index];
      if (node === null || node === undefined || to === undefined) return Promise.resolve();
      return tween(MOVE_MS, mine, (q) => {
        const e = smooth(q);
        placeNode(
          node,
          drawn.layout,
          step.from.x + (to.x - step.from.x) * e,
          step.from.y + (to.y - step.from.y) * e,
          0,
        );
      });
    }

    /** 닿지 않은 점이 옅어지고, 남은 버팀목을 한 번 두드린다. */
    async function flowDone(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const supports = scene.solution === null ? [] : scene.solution.supports;
      await tween(CONCLUDE_MS, mine, (p) => {
        const e = smooth(p);
        for (let i = 0; i < drawn.nodes.length; i += 1) {
          const node = drawn.nodes[i];
          if (node === null || node === undefined || supports.includes(i)) continue;
          node.wrap.setAttribute('opacity', String(1 - 0.72 * e));
        }
      });
      if (!alive(mine)) return;
      await flowMark(scene, drawn, mine);
    }

    function flowFor(
      scene: SupportVectorsOnlyScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'place':
          return flowPlace(scene, drawn, mine);
        case 'solve':
          return flowSolve(scene, drawn, step, mine);
        case 'mark':
          return flowMark(scene, drawn, mine);
        case 'drop':
          return flowDrop(scene, drawn, step, mine);
        case 'restore':
          return flowRestore(scene, drawn, step, mine);
        case 'move':
          return flowMove(scene, drawn, step, mine);
        case 'done':
          return flowDone(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SupportVectorsOnlyScene,
      _prev: SupportVectorsOnlyScene | null,
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
