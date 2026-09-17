/**
 * probe-a-few-cells-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 그림의 골자
 *
 * 평면의 나뉨이다. 대표 넷이 평면을 나눠 가지므로 칸의 경계는 대표끼리의
 * 수직이등분선이고, 그것을 캔버스에서 직접 잘라 낸다 — 칸은 캔버스 끝까지 뻗으므로
 * 그림이 폭을 통째로 쓴다.
 *
 * 운동은 넷이다. 질의가 위에서 내려앉고(translate), 자가 질의에서 대표까지 뻗고(x2/y2),
 * 뚜껑이 바깥으로 밀려 나가며 칸을 드러내고(translate), 드러난 점마다 살이 하나씩
 * 뻗는다. 뚜껑은 자기 칸으로 clip 되어 있어, 밀리는 만큼 질의 쪽부터 벗겨진다.
 *
 * ── 이행이 고친 것 — 조각의 결론이 점의 칠에만 있었다
 *
 * 옛 stage 는 견준 점의 `fill` 을 갈아 끼우기만 하고 되돌리는 명령이 없었다. 그래서
 * *손대지 않은 점*은 "아직 아무도 안 칠한 점" 이라는 부재로만 화면에 있었고, 걸음을
 * 건너뛰어 맺음 화면을 곧바로 세우면 그 칠이 하나도 없어 **스물넷이 전부 손대지 않은
 * 점**이 되었다 — 조각의 주장이 통째로 뒤집히는 자리다. 지금은 `comparedPoints(scene)`
 * 가 그 답을 쥔다. `opened` 집합이 stage 안에 있어 "끝내 안 연 칸" 을 화면이 혼자
 * 알던 것도 같은 병이었다.
 *
 * 척도도 상수로 박혀 있었다 (`PLOT_H / Y_SPAN`, `DATA_CX`, `DATA_CY`). 점이 1~12 에
 * 있다는 것을 사람이 읽고 적어 둔 수라 바탕이 바뀌면 그림이 거짓을 말한다. 지금은
 * 점·대표·질의를 전부 담게 `geomOf` 가 매번 셈한다 (S-piece).
 *
 * ── 채움과 표식을 가른다
 *
 * **채움은 형편**이다 — 칸은 뚜껑이 덮였나 벗겨졌나, 점은 질의와 견줘졌나 손도 안
 * 댔나. **표식은 짚음**이다 — 자와 거리 글자는 *재어 본 칸*을, 순위 글자의 짙기는
 * *열어 본 자리와 건너뛴 자리*를 말한다. 두 축을 갈라 두면 **넷을 다 재 보고 둘만
 * 열었다**가 한 화면에 함께 선다. 점은 채움 한 축만 쓴다 — 견줌과 소속이 여기서는
 * 같은 집합이라, 테두리까지 물들이면 같은 말을 두 번 하는 것이 된다 (S-scene).
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 주므로 어디에도 적지 않는다.
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
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  comparedPoints,
  distanceTo,
  isOpened,
  ringSpan,
  untouchedCount,
  type ProbeAFewCellsScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다. 평면이 주인공이라 가로에 견줘 넉넉히 잡는다. */
const H = 340;
/** 캡션이 앉는 아래 띠. */
const CAPTION_BAND = 46;
const PLOT_H = H - CAPTION_BAND;
const W = PIECE_CANVAS_W;
/** 자료가 캔버스 가장자리에 닿지 않게 두는 여백 비율. */
const FIT = 1.18;
/** 가로로 남겨 두는 최소 여백. 칸 이름표가 앉는 자리다. */
const SIDE_MIN = 40;

/** 지속시간. 총 재생 길이를 줄이려면 stepMs 가 아니라 여기를 줄인다 (S-piece). */
const PLACE_MS = 420;
const SPLIT_MS = 460;
const MEASURE_MS = 380;
const RANK_MS = 520;
const LID_MS = 600;
const SPOKE_MS = 90;
const STOP_MS = 420;
/** 보간 한 프레임. rAF 가 아니라 타이머로 짠다 — 어디서든 실제로 돈다. */
const FRAME_MS = 16;

/** 질의가 내려앉기 전에 떠 있는 높이. */
const DROP = 36;
const DOT_R = 4.4;

/** clip·pattern 의 id 가 한 문서 안에서 겹치지 않게 하는 번호. */
let seq = 0;

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

/** 양 끝에서 정확히 0 과 1 을 낸다 — 끝자리가 흘러 화면이 갈리지 않게 (S-scene). */
const ease = (p: number): number => {
  const q = clamp01(p);
  return q >= 1 ? 1 : 1 - (1 - q) * (1 - q) * (1 - q);
};

function mix(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** `keep` 에 가까운 반평면만 남긴다 — 두 대표의 수직이등분선으로 자른다. */
function bisectorClip(poly: Pt[], keep: Pt, away: Pt): Pt[] {
  const mx = (keep.x + away.x) / 2;
  const my = (keep.y + away.y) / 2;
  const nx = away.x - keep.x;
  const ny = away.y - keep.y;
  const side = (p: Pt): number => (p.x - mx) * nx + (p.y - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    if (cur === undefined || prev === undefined) continue;
    const dc = side(cur);
    const dp = side(prev);
    if (dc <= 0) {
      if (dp > 0) out.push(mix(prev, cur, dp / (dp - dc)));
      out.push(cur);
    } else if (dp <= 0) {
      out.push(mix(prev, cur, dp / (dp - dc)));
    }
  }
  return out;
}

/** 캔버스를 대표들이 나눠 가진 몫. 칸은 캔버스 끝까지 뻗는다. */
function cellPolygon(sites: readonly Pt[], i: number): Pt[] {
  const here = sites[i];
  if (here === undefined) return [];
  let poly: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: PLOT_H },
    { x: 0, y: PLOT_H },
  ];
  for (let j = 0; j < sites.length; j += 1) {
    const other = sites[j];
    if (j === i || other === undefined) continue;
    poly = bisectorClip(poly, here, other);
  }
  return poly;
}

function polyPoints(poly: readonly Pt[]): string {
  return poly.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
}

/** 자료 좌표 → 화면 좌표의 척도. */
type Geom = {
  /** 자료 한 단위의 화면 길이. 거리가 차례를 정하는 그림이라 가로세로가 같다. */
  s: number;
  x(v: number): number;
  y(v: number): number;
};

/**
 * 바탕의 점·대표·질의를 전부 담는 척도.
 *
 * 적어 두지 않고 매번 셈하는 것이 요점이다 — 척도를 stage 의 상수나 `let` 에 적어
 * 두면 정하는 자리와 쓰는 자리가 갈라져, 바탕이 바뀌어도 그림이 따라오지 못한다
 * (S-piece). 가로세로 배율이 다르면 자가 거짓을 말하므로 배율은 하나다.
 */
function geomOf(scene: ProbeAFewCellsScene): Geom {
  const xs = [...scene.points.map((p) => p.x), ...scene.centroids.map((c) => c.x), scene.query.x];
  const ys = [...scene.points.map((p) => p.y), ...scene.centroids.map((c) => c.y), scene.query.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.001) * FIT;
  const spanY = Math.max(maxY - minY, 0.001) * FIT;
  const s = Math.min(PLOT_H / spanY, (W - SIDE_MIN * 2) / spanX);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    s,
    x: (v: number): number => W / 2 + (v - midX) * s,
    y: (v: number): number => PLOT_H / 2 - (v - midY) * s,
  };
}

/** 칸 하나의 기하. 대표·질의·캔버스에서 곧바로 나오므로 적어 둘 것이 없다. */
type CellGeom = {
  site: Pt;
  /** 바깥 방향 단위 벡터 — 뚜껑이 밀려 나가는 쪽. */
  out: Pt;
  /** 뚜껑이 칸을 완전히 벗어나는 거리. */
  span: number;
  /** 칸의 테두리. */
  pts: string;
  /** 이름표가 앉는 자리. 칸이 캔버스 귀를 나눠 가지므로 이름표도 귀로 흩어진다. */
  label: Pt;
};

function cellGeomOf(scene: ProbeAFewCellsScene, geom: Geom, qp: Pt): CellGeom[] {
  const sites = scene.centroids.map((c) => ({ x: geom.x(c.x), y: geom.y(c.y) }));
  return sites.map((site, i) => {
    const poly = cellPolygon(sites, i);
    const dx = site.x - qp.x;
    const dy = site.y - qp.y;
    const len = Math.hypot(dx, dy) || 1;
    const out: Pt = { x: dx / len, y: dy / len };
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of poly) {
      const t = v.x * out.x + v.y * out.y;
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    const span = poly.length === 0 ? 0 : hi - lo + 28;
    return {
      site,
      out,
      span,
      pts: polyPoints(poly),
      label: {
        x: site.x < W / 2 ? 86 : W - 86,
        y: Math.max(58, Math.min(PLOT_H - 58, site.y)),
      },
    };
  });
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  cells: CellGeom[];
  qp: Pt;
  geom: Geom;
  queryMark: SVGGElement | null;
  /** 칸 테두리. 갈라짐이 드러난 뒤에만 선다. */
  edges: Map<number, SVGPolygonElement>;
  /** 대표 표식. */
  marks: Map<number, SVGGElement>;
  /** 자와 거리 글자 — 재어 본 칸의 표식. */
  rulers: Map<number, { line: SVGLineElement; text: SVGTextElement }>;
  /** 덮여 있는 뚜껑. 열린 칸에는 없다. */
  lids: Map<number, SVGGElement>;
  /** 질의에서 견준 점으로 뻗은 살. 점 색인으로 쥔다. */
  spokes: Map<number, SVGLineElement>;
  dots: SVGCircleElement[];
  ring: SVGPathElement | null;
};

export const probeAFewCellsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ProbeAFewCellsScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const uid = `pafc${(seq += 1)}`;

    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    //    점은 뚜껑 아래에 깔린다 — 덮인 칸의 점은 결 너머로만 비친다.
    const gDefs = el('defs');
    const gPoints = el('g');
    const gLids = el('g');
    const gEdges = el('g');
    const gRing = el('g');
    const gSpokes = el('g');
    const gRulers = el('g');
    const gMarks = el('g');
    const gLabels = el('g');
    const gCaption = el('g');
    const layers = [
      gDefs,
      gPoints,
      gLids,
      gEdges,
      gRing,
      gSpokes,
      gRulers,
      gMarks,
      gLabels,
      gCaption,
    ];
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
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
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
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const label = (
      content: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      weight = '400',
    ): SVGTextElement => {
      const node = el('text', {
        x: r2(x),
        y: r2(y),
        fill,
        'font-family': fonts.mono,
        'font-size': size,
        'font-weight': weight,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      node.textContent = content;
      return node;
    };

    const circleAt = (center: Pt, radius: number): string =>
      `M ${r2(center.x - radius)},${r2(center.y)}` +
      ` a ${r2(radius)},${r2(radius)} 0 1,0 ${r2(radius * 2)},0` +
      ` a ${r2(radius)},${r2(radius)} 0 1,0 ${r2(-radius * 2)},0`;

    // ── 캡션 ──────────────────────────────────────────────────────────────
    //
    // 수는 전부 바탕과 자취에서 나온다. 화면이 세는 것과 캡션이 말하는 것이 같은
    // 함수를 지나므로 갈릴 자리가 없다.

    function captionFor(scene: ProbeAFewCellsScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'place':
          return t('caption.query', 'A query lands on the plane. Points in all: {total}.', {
            total: scene.points.length,
          });
        case 'split':
          return t(
            'caption.split',
            'The plane is already split into {cells} cells, each around one centroid.',
            { cells: scene.counts?.length ?? 0 },
          );
        case 'measure': {
          // 사람이 읽는 번호는 1 부터다. 장면이 쥔 `cell` 은 배열 색인이라 0 부터다.
          const cell = scene.measured[scene.measured.length - 1] ?? 0;
          return t('caption.measure', 'Query to the centroid of cell {cell}: {dist}.', {
            cell: cell + 1,
            dist: distanceTo(scene, cell).toFixed(2),
          });
        }
        case 'rank': {
          const order = scene.order ?? [];
          return t(
            'caption.rank',
            'All {cells} centroids sit in one thin ring. Nearest first: {order}.',
            { cells: order.length, order: order.map((c) => c + 1).join(' → ') },
          );
        }
        case 'open': {
          const last = scene.opened[scene.opened.length - 1];
          return t('caption.open', 'Cell {cell} opens. Points compared so far: {seen}.', {
            cell: (last?.cell ?? 0) + 1,
            seen: comparedPoints(scene).length,
          });
        }
        case 'stop':
          return t(
            'caption.stop',
            'Opened {opened} of {cells}. Compared: {seen}. Untouched: {untouched}.',
            {
              opened: scene.opened.length,
              cells: scene.centroids.length,
              seen: comparedPoints(scene).length,
              untouched: untouchedCount(scene),
            },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 덮인 뚜껑 하나. 열리는 운동도 같은 모양을 쓰므로 한 자리에서 짓는다. */
    function makeLid(cell: CellGeom, i: number): SVGGElement {
      const holder = el('g', { 'clip-path': `url(#${uid}-cell${i})` });
      const lid = el('g');
      lid.appendChild(
        el('polygon', { points: cell.pts, fill: colors.text, 'fill-opacity': 0.05 }),
      );
      lid.appendChild(el('polygon', { points: cell.pts, fill: `url(#${uid}-hatch)` }));
      holder.appendChild(lid);
      gLids.appendChild(holder);
      return lid;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: ProbeAFewCellsScene): Drawn {
      rewind();

      const geom = geomOf(scene);
      const qp: Pt = { x: geom.x(scene.query.x), y: geom.y(scene.query.y) };
      const cells = cellGeomOf(scene, geom, qp);
      const split = scene.counts !== null;
      const compared = comparedPoints(scene);

      // ── 결과 무늬와 칸 clip. 칸마다 같은 위상이라 열기 전에는 이음매가 안 보인다.
      const hatch = el('pattern', {
        id: `${uid}-hatch`,
        width: 14,
        height: 14,
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(-45)',
      });
      hatch.appendChild(
        el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 14,
          stroke: colors.text,
          'stroke-opacity': 0.16,
          'stroke-width': 1,
        }),
      );
      gDefs.appendChild(hatch);
      cells.forEach((cell, i) => {
        const clip = el('clipPath', { id: `${uid}-cell${i}` });
        clip.appendChild(el('polygon', { points: cell.pts }));
        gDefs.appendChild(clip);
      });

      // ── 점. **채움이 형편이다** — 견줘졌나, 아직 손도 안 댔나.
      const dots = scene.points.map((p, i) => {
        const seen = compared.includes(i);
        const dot = el('circle', {
          cx: r2(geom.x(p.x)),
          cy: r2(geom.y(p.y)),
          r: DOT_R,
          fill: seen ? colors.itemComparing : colors.bg,
          stroke: colors.textMuted,
          'stroke-width': 1.3,
        });
        gPoints.appendChild(dot);
        return dot;
      });

      // ── 뚜껑. 덮인 칸에만 있다 — 열린 칸은 뚜껑이 아예 없는 것이 그 형편이다.
      const lids = new Map<number, SVGGElement>();
      cells.forEach((cell, i) => {
        if (isOpened(scene, i)) return;
        lids.set(i, makeLid(cell, i));
      });

      // ── 갈라짐. 드러나기 전에는 짓지 않는다 (아직 없는 것을 숨겨 두지 않는다).
      const edges = new Map<number, SVGPolygonElement>();
      const marks = new Map<number, SVGGElement>();
      if (split) {
        cells.forEach((cell, i) => {
          const edge = el('polygon', {
            points: cell.pts,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-opacity': 0.7,
            'stroke-width': 1.2,
          });
          gEdges.appendChild(edge);
          edges.set(i, edge);

          const mark = el('g', {
            transform: `translate(${r2(cell.site.x)},${r2(cell.site.y)})`,
          });
          mark.appendChild(
            el('polygon', {
              points: '0,-7 7,0 0,7 -7,0',
              fill: colors.bg,
              stroke: colors.text,
              'stroke-width': 1.4,
            }),
          );
          gMarks.appendChild(mark);
          marks.set(i, mark);
        });
      }

      // ── 자와 거리 글자. **재어 본 칸의 표식이다** — 넷을 다 재고 둘만 여는 것이
      //    한 화면에 서려면 이 표식이 열림과 다른 축에 있어야 한다.
      const rulers = new Map<number, { line: SVGLineElement; text: SVGTextElement }>();
      for (const i of scene.measured) {
        const cell = cells[i];
        if (cell === undefined) continue;
        const line = el('line', {
          x1: r2(qp.x),
          y1: r2(qp.y),
          x2: r2(cell.site.x),
          y2: r2(cell.site.y),
          stroke: colors.text,
          'stroke-opacity': 0.55,
          'stroke-width': 1.3,
        });
        gRulers.appendChild(line);
        // 잰 값은 재는 자리에 남긴다 — 자의 한복판, 바깥 법선 쪽에 매단다 (S-piece).
        const midX = (qp.x + cell.site.x) / 2;
        const midY = (qp.y + cell.site.y) / 2;
        const text = label(
          distanceTo(scene, i).toFixed(2),
          midX - cell.out.y * 13,
          midY + cell.out.x * 13,
          fontSizes.xs,
          colors.text,
        );
        gRulers.appendChild(text);
        rulers.set(i, { line, text });
      }

      // ── 대표까지의 거리가 엇비슷하다는 것을 보이는 띠.
      let ring: SVGPathElement | null = null;
      const span = ringSpan(scene);
      if (span !== null) {
        ring = el('path', {
          d: `${circleAt(qp, span.far * geom.s)} ${circleAt(qp, span.near * geom.s)}`,
          'fill-rule': 'evenodd',
          fill: colors.accent,
          'fill-opacity': 0.18,
          stroke: colors.accent,
          'stroke-opacity': 0.55,
          'stroke-width': 1,
        });
        gRing.appendChild(ring);
      }

      // ── 살. 질의와 실제로 견준 점에만 뻗어 있다.
      const spokes = new Map<number, SVGLineElement>();
      for (const index of compared) {
        const p = scene.points[index];
        if (p === undefined) continue;
        const spoke = el('line', {
          x1: r2(qp.x),
          y1: r2(qp.y),
          x2: r2(geom.x(p.x)),
          y2: r2(geom.y(p.y)),
          stroke: colors.itemComparing,
          'stroke-opacity': 0.22,
          'stroke-width': 1,
        });
        gSpokes.appendChild(spoke);
        spokes.set(index, spoke);
      }

      // ── 칸 이름표. 번호 · 담긴 점 수 · 순위.
      if (split) {
        cells.forEach((cell, i) => {
          // 사람이 읽는 번호는 1 부터 센다. 같은 네 칸을 다루는 완제품
          // (`invertedFileIndex`)이 그 규약을 쓰므로 두 화면이 한 글에 나란히 놓일 때
          // "칸 2" 가 서로 다른 칸을 가리키지 않게 맞춘다.
          gLabels.appendChild(
            label(String(i + 1), cell.label.x, cell.label.y - 17, fontSizes.lg, colors.text, '600'),
          );
          const count = scene.counts?.[i];
          if (count !== undefined) {
            gLabels.appendChild(
              label(`n=${count}`, cell.label.x, cell.label.y + 3, fontSizes.xs, colors.textMuted),
            );
          }
          const rank = scene.order?.indexOf(i) ?? -1;
          if (rank >= 0) {
            // **순위 글자의 짙기가 짚음의 표식이다** — 열어 본 자리와 끝내 건너뛴
            // 자리가 갈려야 "그만해도 됐다" 가 읽힌다.
            const taken = isOpened(scene, i);
            gLabels.appendChild(
              label(
                `#${rank + 1}`,
                cell.label.x,
                cell.label.y + 22,
                fontSizes.sm,
                taken ? colors.text : colors.textMuted,
                taken ? '600' : '400',
              ),
            );
          }
        });
      }

      // ── 질의.
      let queryMark: SVGGElement | null = null;
      if (scene.placed) {
        queryMark = el('g', { transform: `translate(${r2(qp.x)},${r2(qp.y)})` });
        queryMark.appendChild(
          el('circle', {
            r: 6.5,
            fill: colors.accent,
            stroke: colors.stateInk,
            'stroke-width': 1.2,
          }),
        );
        queryMark.appendChild(label('q', 13, 1, fontSizes.sm, colors.text, '600'));
        gMarks.appendChild(queryMark);
      }

      // ── 캡션. 고정 자리에 두지 않고 층위 안에서 매번 다시 세운다 (S-scene).
      const caption = el('text', {
        x: W / 2,
        y: H - 22,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      return { cells, qp, geom, queryMark, edges, marks, rulers, lids, spokes, dots, ring };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 끝나면 마지막 정적 그리기가 통째로 걷어 간다.
    // 밀려 나가는 뚜껑처럼 끝 화면에 없는 것만 여기서 새로 짓는다.

    /** 질의가 위에서 평면으로 내려앉는다. */
    function flowPlace(drawn: Drawn, mine: number): Promise<void> {
      const mark = drawn.queryMark;
      if (mark === null) return Promise.resolve();
      return tween(PLACE_MS, mine, (p) => {
        const e = ease(p);
        mark.setAttribute(
          'transform',
          `translate(${r2(drawn.qp.x)},${r2(drawn.qp.y - DROP * (1 - e))})`,
        );
      });
    }

    /** 경계가 드러나고 대표가 선다. 뚜껑이 이음매에서 한 번 들썩인다. */
    function flowSplit(drawn: Drawn, mine: number): Promise<void> {
      return tween(SPLIT_MS, mine, (p) => {
        const e = ease(p);
        const jolt = Math.sin(clamp01(p) * Math.PI) * 4;
        drawn.cells.forEach((cell, i) => {
          drawn.edges.get(i)?.setAttribute('stroke-opacity', String(r2(0.7 * e)));
          drawn.marks
            .get(i)
            ?.setAttribute(
              'transform',
              `translate(${r2(cell.site.x)},${r2(cell.site.y)}) scale(${r2(e)})`,
            );
          drawn.lids
            .get(i)
            ?.setAttribute(
              'transform',
              `translate(${r2(cell.out.x * jolt)},${r2(cell.out.y * jolt)})`,
            );
        });
      });
    }

    /** 자가 질의에서 대표까지 뻗는다. */
    function flowMeasure(
      scene: ProbeAFewCellsScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const at = scene.measured[scene.measured.length - 1];
      if (at === undefined) return Promise.resolve();
      const cell = drawn.cells[at];
      const ruler = drawn.rulers.get(at);
      if (cell === undefined || ruler === undefined) return Promise.resolve();
      return tween(MEASURE_MS, mine, (p) => {
        const e = ease(p);
        ruler.line.setAttribute('x2', String(r2(drawn.qp.x + (cell.site.x - drawn.qp.x) * e)));
        ruler.line.setAttribute('y2', String(r2(drawn.qp.y + (cell.site.y - drawn.qp.y) * e)));
        ruler.text.setAttribute('opacity', String(r2(e)));
      });
    }

    /** 네 대표가 든 얇은 띠가 자란다. 차례는 그 띠 안에서 갈린다. */
    function flowRank(scene: ProbeAFewCellsScene, drawn: Drawn, mine: number): Promise<void> {
      const ring = drawn.ring;
      const span = ringSpan(scene);
      if (ring === null || span === null) return Promise.resolve();
      const inner = span.near * drawn.geom.s;
      const outer = span.far * drawn.geom.s;
      return tween(RANK_MS, mine, (p) => {
        const e = ease(p);
        ring.setAttribute(
          'd',
          `${circleAt(drawn.qp, outer * e)} ${circleAt(drawn.qp, inner * e)}`,
        );
      });
    }

    /**
     * 뚜껑이 바깥으로 밀려 나가고, 드러난 점을 하나씩 견준다.
     *
     * 한 뜻으로 묶인 운동이라 **시계를 하나만 둔다** — 살마다 따로 흘리면 이어짐이
     * 우연히 맞는 꼴이 되고 하나를 `void` 로 던질 여지가 생긴다 (S-scene).
     */
    function flowOpen(scene: ProbeAFewCellsScene, drawn: Drawn, mine: number): Promise<void> {
      const last = scene.opened[scene.opened.length - 1];
      if (last === undefined) return Promise.resolve();
      const cell = drawn.cells[last.cell];
      if (cell === undefined) return Promise.resolve();

      // 열린 칸의 뚜껑은 끝 화면에 없다. 밀려 나가는 동안만 짓는다.
      const lid = makeLid(cell, last.cell);

      const members = last.members.filter((index) => drawn.spokes.has(index));
      const total = LID_MS + SPOKE_MS * Math.max(1, members.length);
      return tween(total, mine, (p) => {
        const ms = p * total;

        // 1) 뚜껑이 질의 반대쪽으로 밀려 나가며 칸이 드러난다.
        const push = ease(ms / LID_MS);
        lid.setAttribute(
          'transform',
          `translate(${r2(cell.out.x * cell.span * push)},${r2(cell.out.y * cell.span * push)})`,
        );

        // 2) 드러난 점마다 살이 차례로 뻗는다. 살이 닿아야 그 점이 견준 점이 된다.
        members.forEach((index, at) => {
          const spoke = drawn.spokes.get(index);
          const dot = drawn.dots[index];
          const point = scene.points[index];
          if (spoke === undefined || dot === undefined || point === undefined) return;
          const reach = ease((ms - LID_MS - SPOKE_MS * at) / SPOKE_MS);
          const tx = drawn.geom.x(point.x);
          const ty = drawn.geom.y(point.y);
          spoke.setAttribute('x2', String(r2(drawn.qp.x + (tx - drawn.qp.x) * reach)));
          spoke.setAttribute('y2', String(r2(drawn.qp.y + (ty - drawn.qp.y) * reach)));
          spoke.setAttribute('stroke-opacity', reach >= 1 ? '0.22' : '0.5');
          dot.setAttribute('fill', reach >= 1 ? colors.itemComparing : colors.bg);
        });
      });
    }

    /** 멈춘다. 남은 뚜껑이 한 번 되눌린다 — 열리지 않는다는 뜻으로. */
    function flowStop(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.lids.size === 0) return Promise.resolve();
      return tween(STOP_MS, mine, (p) => {
        const press = Math.sin(clamp01(p) * Math.PI) * -5;
        for (const [i, lid] of drawn.lids) {
          const cell = drawn.cells[i];
          if (cell === undefined) continue;
          lid.setAttribute(
            'transform',
            `translate(${r2(cell.out.x * press)},${r2(cell.out.y * press)})`,
          );
        }
      });
    }

    function flowFor(scene: ProbeAFewCellsScene, drawn: Drawn, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'place':
          return flowPlace(drawn, mine);
        case 'split':
          return flowSplit(drawn, mine);
        case 'measure':
          return flowMeasure(scene, drawn, mine);
        case 'rank':
          return flowRank(scene, drawn, mine);
        case 'open':
          return flowOpen(scene, drawn, mine);
        case 'stop':
          return flowStop(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: ProbeAFewCellsScene,
      _prev: ProbeAFewCellsScene | null,
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
        svg.textContent = '';
      },
    };
  },
};
