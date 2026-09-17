/**
 * crowd-the-tails stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 화면의 짜임 (위에서 아래로)
 *
 *   캡션
 *   k 자          눈금이 고른 간격으로 박힌 자. 자르는 쪽의 자리다.
 *   부채살        눈금 하나가 q 의 어디에 내려앉는지 잇는 선.
 *   q 선          분위 0…1 의 자. 그 아래가 그릇이다.
 *   그릇 여섯     경계 사이의 통. 폭이 곧 그 뭉치가 덮는 q 폭이다.
 *   점 예순       제 분위 자리에 선다. 담기면 그릇 바닥에 쌓인다.
 *   자국          뭉치마다 하나. 굵기는 그 뭉치가 삼킨 점의 수다.
 *
 * ── 무엇이 움직이는가
 *
 * 동사는 "몰린다 — 끝으로 갈수록" 이다. 그래서 자르는 선이 **자리를 옮긴다** —
 * 고르게 내려앉았던 여섯이 척도를 거치며 저마다 가까운 끝으로 미끄러지고, 그릇의
 * 폭이 그에 맞춰 꼬리에서 좁아지고 가운데에서 벌어진다. 점은 제자리에 있고 그릇이
 * 움직인다. 담기는 걸음에서는 점이 제 그릇 바닥으로 쏟아져 기둥이 된다.
 *
 * **두 잣대의 자름은 한 시계로 흐른다.** 경계 여섯과 그릇 여섯이 같은 `p` 를 쓰는
 * 한 `tween` 안에서 함께 옮겨 앉는다 — 시계를 나누면 "같은 자료를 두 잣대로 자른
 * 것" 이 나란히 놓인 그림이 아니라 우연히 맞아 든 그림이 된다 (S-scene).
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 지금 경계는 `let bounds` 에, 점이 담겼는지는 점의 `cx`/`cy`/`fill` 속성에, 그
 * 그릇의 셈이 끝났는지는 `Vessel.floor` 의 `stroke` 에 있었다. 이제 `cut` ·
 * `poured` · `digested` 가 말하고 좌표와 칠은 전부 그 셋에서 파생되므로, 화면을
 * 되읽는 자리(`Number(dot.getAttribute('cx'))`)가 통째로 사라졌다.
 *
 * ── 화면에 나란히 뜨는 수
 *
 * 경계의 백분율 · 뭉치마다 든 점의 수 · 자국의 굵기 · 캡션의 세 수가 한 화면에
 * 함께 뜬다. 그 전부가 `layoutOf` 가 한 번에 셈한 `bounds` 와 `counts` 에서 나온다
 * (`scene.ts` 의 "수는 한 출처에서만"). 자리를 **먼저 한 번에 셈하고 그 다음에
 * 그린다** — 그리면서 이웃의 지금 좌표를 재면 순회 순서가 곧 숨은 상태가 된다.
 *
 * ── 좌표
 *
 * 전부 여기서 셈한다. 장면에는 분위와 뭉치 번호라는 구조만 있고 자리는 그림의
 * 몫이다 (S-piece). 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로만
 * 여기 둔다. 색은 전부 design-tokens 경유다 (S-view).
 *
 * 화면의 글자 중 `q` 와 `k` 는 도형에 새긴 기호라 번역하지 않는다 (C10). 문장인
 * 캡션은 `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  boundsFor,
  boundsOf,
  centroidsIn,
  countsIn,
  filledOf,
  lastPairOf,
  partsOf,
  quantileAt,
  type CrowdStep,
  type CrowdTheTailsScene,
  type CutKind,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 정한다 (S-view). */
const CANVAS_H = 274;

const LANE_X0 = 34;
const LANE_X1 = 594;
const LANE_W = LANE_X1 - LANE_X0;

const CAPTION_Y = 20;
const K_AXIS_Y = 57;
const K_TICK_H = 5;
const FAN_TOP = 63;
const Q_AXIS_Y = 126;
const PCT_Y = 141;
const DOTS_Y = 159;
const PILE_BASE = 236;
const PILE_PITCH = 4.2;
const FLOOR_Y = 244;
const COUNT_Y = 260;
const MARK_Y = 204;

const DOT_R = 2;
const MARK_R_BASE = 2.2;
const MARK_R_PER = 0.44;

const DROP_MS = 760;
const SLIDE_MS = 820;
const POUR_MS = 740;
const MERGE_MS = 640;

/** 도형에 새긴 기호 — 문안이 아니다 (C10). */
const Q_GLYPH = 'q';
const K_GLYPH = 'k';

/**
 * 한 번에 셈해 둔 자리.
 *
 * 장면에는 좌표가 없으므로 그릴 때마다 여기서 낸다. **그리기 전에 전부 낸다** —
 * 그리면서 이웃을 재면 순회 순서가 화면을 가른다 (S-scene 의 함정).
 */
type Layout = {
  /** 뭉치 수. δ 가 정하므로 자르기 전에도 안다. */
  parts: number;
  /** 지금 잣대의 경계. 아직 자르지 않았으면 빈 배열. */
  bounds: number[];
  /** 뭉치마다 드는 점의 수. 경계가 없으면 빈 배열. */
  counts: number[];
  /** 뭉치 b 의 첫 점 번호 — `counts` 의 앞쪽 누적. */
  offsets: number[];
  /** 뭉치마다 자국이 앉을 분위. */
  centroids: number[];
  /** 담긴 뭉치. */
  filled: boolean[];
};

/** 자르는 선 하나 — 부채살, 그릇 벽, 경계의 백분율. */
type Cut = { fan: SVGLineElement; wall: SVGLineElement; pct: SVGTextElement };

/** 그릇 하나 — 통과 바닥. */
type Vessel = { body: SVGRectElement; floor: SVGLineElement };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  layout: Layout;
  dots: SVGCircleElement[];
  cuts: Cut[];
  vessels: Vessel[];
  marks: SVGCircleElement[];
  countLabels: Array<SVGTextElement | null>;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  const t = clamp01(p);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function xOf(q: number): number {
  return LANE_X0 + q * LANE_W;
}

/** i 번째 눈금의 자리. 자 위에서는 언제나 고른 간격이다 — 자르는 쪽은 안 몰린다. */
function kxOf(i: number, total: number): number {
  return total <= 1 ? LANE_X0 : LANE_X0 + (LANE_W * i) / (total - 1);
}

/** 그 장면의 자리를 한 번에 셈한다. */
function layoutOf(scene: CrowdTheTailsScene): Layout {
  const parts = partsOf(scene.delta);
  const bounds = boundsOf(scene);
  const counts = countsIn(bounds, scene.count);
  const offsets: number[] = [];
  let acc = 0;
  for (const n of counts) {
    offsets.push(acc);
    acc += n;
  }
  return {
    parts,
    bounds,
    counts,
    offsets,
    centroids: centroidsIn(bounds, scene.count),
    filled: filledOf(scene),
  };
}

/** 뭉치의 가운데 가로. 기둥이 서고 점 수 라벨이 앉는 자리다. */
function centerOf(bounds: number[], b: number): number {
  return (xOf(bounds[b] ?? 0) + xOf(bounds[b + 1] ?? 0)) / 2;
}

/**
 * 점 i 가 서는 자리.
 *
 * 담긴 뭉치의 점은 그릇 바닥에 쌓이고, 나머지는 q 선 위 제집에 선다. 화면을
 * 되읽지 않고 장면에서 셈하므로 되짚어 와도 자리가 같다.
 */
function dotSpotOf(
  layout: Layout,
  i: number,
  count: number,
): { x: number; y: number; piled: boolean } {
  const home = { x: xOf(quantileAt(i, count)), y: DOTS_Y, piled: false };
  if (layout.bounds.length < 2) return home;
  let b = 0;
  while (b < layout.counts.length - 1 && i >= (layout.offsets[b] ?? 0) + (layout.counts[b] ?? 0)) {
    b += 1;
  }
  if (layout.filled[b] !== true) return home;
  const m = i - (layout.offsets[b] ?? 0);
  return { x: centerOf(layout.bounds, b), y: PILE_BASE - m * PILE_PITCH, piled: true };
}

/** 자국의 반지름. 그 뭉치가 삼킨 점의 수가 굵기다. */
function markRadius(layout: Layout, b: number): number {
  return MARK_R_BASE + (layout.counts[b] ?? 0) * MARK_R_PER;
}

export const crowdTheTailsStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CrowdTheTailsScene> {
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
    svg.textContent = '';

    // ── 층. 그리는 순서가 곧 겹치는 순서다. 걸음마다 통째로 다시 세운다.
    const gAxis = el('g', {});
    const gRuler = el('g', {});
    const gVessel = el('g', {});
    const gCuts = el('g', {});
    const gDots = el('g', {});
    const gMarks = el('g', {});
    const gFlow = el('g', {});
    const gCounts = el('g', {});
    const gCaption = el('g', {});
    const layers = [gAxis, gRuler, gVessel, gCuts, gDots, gMarks, gFlow, gCounts, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 프레임이
     * **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    function text(
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        fill,
        'font-family': fonts.body,
        'font-size': size,
        'text-anchor': anchor,
      });
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 장면에 캡션 필드를 두지 않는다 — `cut` · `poured` · `digested` 셋에서 전부
     * 파생되므로 따로 실으면 같은 것을 두 번 말하는 꼴이 된다. 수도 `layout` 의
     * `counts` 하나에서 나오므로 화면의 라벨·자국과 갈릴 자리가 없다.
     */
    function captionFor(scene: CrowdTheTailsScene, layout: Layout): string {
      if (scene.cut === null || layout.counts.length === 0) return '';

      if (scene.digested) {
        const tail = Math.min(...layout.counts);
        const middle = Math.max(...layout.counts);
        const ratio = tail === 0 ? 0 : middle / tail;
        return t(
          'caption.digest',
          'One mark per bucket: {middle} points in the middle, {tail} at the tails — {ratio}x finer.',
          { middle, tail, ratio: ratio.toFixed(1) },
        );
      }

      const pair = lastPairOf(scene);
      if (pair !== null) {
        const held = layout.counts[pair.left] ?? 0;
        const middle = Math.floor((layout.parts - 1) / 2);
        if (pair.left === 0) {
          return t('caption.fillTail', 'Each tail bucket holds only {count}.', { count: held });
        }
        if (pair.left === middle) {
          return t(
            'caption.fillMiddle',
            'The middle buckets swallow {count} points each — coarse, and no harm done.',
            { count: held },
          );
        }
        return t('caption.fillOuter', 'The next pair out holds {count} each.', { count: held });
      }

      if (scene.cut === 'scaled') {
        return t(
          'caption.scale',
          'Cut k in equal steps instead: near the ends one step covers far less of q.',
          {},
        );
      }
      return t(
        'caption.even',
        'Cut the quantile line into {parts} equal buckets: {count} points in each.',
        { parts: layout.parts, count: layout.counts[0] ?? 0 },
      );
    }

    // ── 자리 놓기. 정적 경로와 걸음 함수가 함께 쓴다 ────────────────────────

    /**
     * 자르는 선을 놓는다.
     *
     * `drop` 은 눈금에서 바닥까지 내려온 정도다. 부채살은 q 자까지, 벽은 그 아래로
     * 이어진다 — 한 번의 내려옴이 자르는 일이자 그릇을 세우는 일이다.
     */
    function placeCuts(drawn: Drawn, bs: number[], drop: number): void {
      const total = drawn.cuts.length;
      const tip = FAN_TOP + clamp01(drop) * (FLOOR_Y - FAN_TOP);
      const fanEnd = Math.min(tip, Q_AXIS_Y);
      const u = (fanEnd - FAN_TOP) / (Q_AXIS_Y - FAN_TOP);
      for (let i = 0; i < total; i += 1) {
        const cut = drawn.cuts[i];
        const kx = kxOf(i, total);
        const cx = xOf(bs[i] ?? 0);
        cut.fan.setAttribute('x1', String(kx));
        cut.fan.setAttribute('y1', String(FAN_TOP));
        cut.fan.setAttribute('x2', String(kx + (cx - kx) * u));
        cut.fan.setAttribute('y2', String(fanEnd));
        const wallBottom = Math.max(Q_AXIS_Y, tip);
        cut.wall.setAttribute('x1', String(cx));
        cut.wall.setAttribute('y1', String(Q_AXIS_Y));
        cut.wall.setAttribute('x2', String(cx));
        cut.wall.setAttribute('y2', String(wallBottom));
        cut.pct.setAttribute('x', String(cx));
        cut.pct.setAttribute('opacity', tip > Q_AXIS_Y ? '1' : '0');
        cut.pct.textContent = `${Math.round((bs[i] ?? 0) * 100)}%`;
      }
    }

    function placeVessels(drawn: Drawn, bs: number[], drop: number, grow: number): void {
      const tip = FAN_TOP + clamp01(drop) * (FLOOR_Y - FAN_TOP);
      const height = Math.max(0, Math.min(FLOOR_Y, tip) - Q_AXIS_Y);
      for (let i = 0; i < drawn.vessels.length; i += 1) {
        const x0 = xOf(bs[i] ?? 0);
        const w = Math.max(0, xOf(bs[i + 1] ?? 0) - x0);
        const v = drawn.vessels[i];
        v.body.setAttribute('x', String(x0));
        v.body.setAttribute('width', String(w));
        v.body.setAttribute('height', String(height));
        v.floor.setAttribute('x1', String(x0));
        v.floor.setAttribute('x2', String(x0 + w * clamp01(grow)));
      }
    }

    /** 담긴 그릇은 바닥을 짙게 — 셈이 끝난 자리다. */
    function paintFloor(drawn: Drawn, b: number, done: boolean): void {
      drawn.vessels[b]?.floor.setAttribute('stroke', done ? c.text : c.border);
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: CrowdTheTailsScene): Drawn {
      rewind();
      const layout = layoutOf(scene);

      // ── q 자. 처음부터 끝까지 서 있다.
      gAxis.appendChild(
        el('line', {
          x1: LANE_X0,
          y1: Q_AXIS_Y,
          x2: LANE_X1,
          y2: Q_AXIS_Y,
          stroke: c.text,
          'stroke-width': 1.2,
        }),
      );
      const qGlyph = text(LANE_X0 - 10, Q_AXIS_Y + 4, fontSizes.sm, c.textMuted, 'end');
      qGlyph.textContent = Q_GLYPH;
      gAxis.appendChild(qGlyph);

      const cut = scene.cut;
      const bs = layout.bounds;
      const cuts: Cut[] = [];
      const vessels: Vessel[] = [];

      if (cut !== null && bs.length >= 2) {
        // ── k 자. 눈금은 언제나 고른 간격이다.
        gRuler.appendChild(
          el('line', {
            x1: LANE_X0,
            y1: K_AXIS_Y,
            x2: LANE_X1,
            y2: K_AXIS_Y,
            stroke: c.textMuted,
            'stroke-width': 1,
          }),
        );
        for (let i = 0; i < bs.length; i += 1) {
          const x = kxOf(i, bs.length);
          gRuler.appendChild(
            el('line', {
              x1: x,
              y1: K_AXIS_Y - K_TICK_H,
              x2: x,
              y2: K_AXIS_Y + K_TICK_H,
              stroke: c.textMuted,
              'stroke-width': 1.4,
            }),
          );
        }
        const kGlyph = text(LANE_X0 - 10, K_AXIS_Y + 4, fontSizes.sm, c.textMuted, 'end');
        kGlyph.textContent = K_GLYPH;
        gRuler.appendChild(kGlyph);

        // ── 그릇. 먼저 세워야 자르는 선이 그 위에 온다.
        for (let i = 0; i < layout.parts; i += 1) {
          const body = el('rect', { x: 0, y: Q_AXIS_Y, width: 0, height: 0, fill: c.bgSubtle });
          const floor = el('line', {
            x1: 0,
            y1: FLOOR_Y,
            x2: 0,
            y2: FLOOR_Y,
            stroke: c.border,
            'stroke-width': 2,
            'stroke-linecap': 'round',
          });
          gVessel.appendChild(body);
          gVessel.appendChild(floor);
          vessels.push({ body, floor });
        }

        // ── 자르는 선.
        for (let i = 0; i < bs.length; i += 1) {
          const fan = el('line', {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0,
            stroke: c.border,
            'stroke-width': 1,
          });
          const wall = el('line', {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0,
            stroke: c.itemActive,
            'stroke-width': 1.6,
          });
          const pct = text(0, PCT_Y, fontSizes.xs, c.textMuted, 'middle');
          gCuts.appendChild(fan);
          gCuts.appendChild(wall);
          gCuts.appendChild(pct);
          cuts.push({ fan, wall, pct });
        }
      }

      // ── 점. 담긴 뭉치의 점은 그릇 바닥에 쌓이고 나머지는 제집에 선다.
      //    자국으로 접힌 뒤에는 따로 서 있지 않으므로 아예 짓지 않는다.
      const dots: SVGCircleElement[] = [];
      if (!scene.digested) {
        for (let i = 0; i < scene.count; i += 1) {
          const spot = dotSpotOf(layout, i, scene.count);
          const dot = el('circle', {
            cx: spot.x,
            cy: spot.y,
            r: DOT_R,
            fill: spot.piled ? c.text : c.textMuted,
          });
          dots.push(dot);
          gDots.appendChild(dot);
        }
      }

      // ── 자국. 뭉치마다 하나, 굵기는 삼킨 점의 수다.
      const marks: SVGCircleElement[] = [];
      if (scene.digested) {
        for (let b = 0; b < layout.parts; b += 1) {
          const q = layout.centroids[b];
          const x = typeof q === 'number' ? xOf(q) : centerOf(bs, b);
          const node = el('circle', { cx: x, cy: MARK_Y, r: markRadius(layout, b), fill: c.text });
          gMarks.appendChild(node);
          marks.push(node);
        }
      }

      const drawn: Drawn = { layout, dots, cuts, vessels, marks, countLabels: [] };

      if (cut !== null && bs.length >= 2) {
        placeCuts(drawn, bs, 1);
        placeVessels(drawn, bs, 1, 1);
        for (let b = 0; b < layout.parts; b += 1) paintFloor(drawn, b, layout.filled[b] === true);
      }

      /*
       * ── 뭉치마다 든 점의 수.
       *
       * 고르게 자른 걸음에서는 여섯이 다 같음을 보이려 전부 뜨고, 척도로 자른
       * 뒤에는 담은 그릇에만 뜬다 — 셈이 끝난 자리라는 표식이다.
       */
      for (let b = 0; b < layout.parts; b += 1) {
        const show = cut === 'even' || layout.filled[b] === true;
        if (!show || layout.counts.length === 0) {
          drawn.countLabels.push(null);
          continue;
        }
        const node = text(centerOf(bs, b), COUNT_Y, fontSizes.xs, c.text, 'middle');
        node.textContent = String(layout.counts[b] ?? 0);
        gCounts.appendChild(node);
        drawn.countLabels.push(node);
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = text(PIECE_CANVAS_W / 2, CAPTION_Y, fontSizes.md, c.text, 'middle');
      caption.textContent = captionFor(scene, layout);
      gCaption.appendChild(caption);

      return drawn;
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면과 걸음의 계기값이 말하고
    // `prev` 를 들추지 않는다 (S-scene).

    type Job = {
      dot: SVGCircleElement;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      order: number;
    };

    /** 한꺼번에 쏟지 않고 조금씩 어긋나게 — 쏟아지는 것으로 보이게 한다. */
    function runJobs(jobs: Job[], p: number, settledInk: string, flyingInk: string): void {
      const n = jobs.length;
      const span = 0.5;
      const stride = n > 1 ? span / (n - 1) : 0;
      for (const job of jobs) {
        const u = ease(clamp01((p - job.order * stride) / (1 - span)));
        job.dot.setAttribute('cx', String(job.x0 + (job.x1 - job.x0) * u));
        job.dot.setAttribute('cy', String(job.y0 + (job.y1 - job.y0) * u));
        job.dot.setAttribute('fill', u >= 1 ? settledInk : flyingInk);
      }
    }

    /** 자르는 선 여섯이 눈금에서 한꺼번에 내려온다. 한 시계다. */
    function flowDrop(drawn: Drawn, mine: number): Promise<void> {
      const bs = drawn.layout.bounds;
      return tween(DROP_MS, mine, (p) => {
        const d = ease(Math.min(1, p / 0.72));
        placeCuts(drawn, bs, d);
        placeVessels(drawn, bs, d, clamp01((p - 0.58) / 0.42));
        const fade = String(clamp01((p - 0.7) / 0.3));
        for (const node of drawn.countLabels) node?.setAttribute('opacity', fade);
      });
    }

    /**
     * 잣대가 바뀌어 경계가 미끄러진다 — 이 조각의 동사.
     *
     * 경계 여섯과 그릇 여섯이 **한 시계**로 함께 옮겨 앉는다. 시계를 나누면 두
     * 잣대의 나란함이 우연히 맞아 든 꼴이 된다 (S-scene). 출발 경계는 걸음이 실어
     * 온 잣대의 이름에서 같은 함수로 낸다 — `prev` 를 들추지 않는다.
     */
    function flowSlide(
      drawn: Drawn,
      scene: CrowdTheTailsScene,
      from: CutKind,
      mine: number,
    ): Promise<void> {
      const to = drawn.layout.bounds;
      const start = boundsFor(from, scene.delta);
      return tween(SLIDE_MS, mine, (p) => {
        const e = ease(p);
        const at = to.map((q, i) => {
          const s = start[i] ?? q;
          return s + (q - s) * e;
        });
        placeCuts(drawn, at, 1);
        placeVessels(drawn, at, 1, 1);
      });
    }

    /**
     * 마주 보는 두 그릇으로 점이 쏟아진다.
     *
     * 두 그릇이 함께 차는 것이 이 걸음의 말이므로 옮길 점을 **한 목록**에 모아 한
     * 시계로 흘린다. 어느 그릇인지는 `poured` 가 말하고, 출발 자리(제집)와 도착
     * 자리(기둥)는 둘 다 장면에서 셈한다 — 화면을 되읽지 않는다.
     */
    function flowPour(drawn: Drawn, scene: CrowdTheTailsScene, mine: number): Promise<void> {
      const pair = lastPairOf(scene);
      if (pair === null) return Promise.resolve();
      const buckets = pair.left === pair.right ? [pair.left] : [pair.left, pair.right];
      const layout = drawn.layout;

      const jobs: Job[] = [];
      for (const b of buckets) {
        const from = layout.offsets[b] ?? 0;
        const n = layout.counts[b] ?? 0;
        for (let m = 0; m < n; m += 1) {
          const dot = drawn.dots[from + m];
          if (dot === undefined) continue;
          const spot = dotSpotOf(layout, from + m, scene.count);
          jobs.push({
            dot,
            x0: xOf(quantileAt(from + m, scene.count)),
            y0: DOTS_Y,
            x1: spot.x,
            y1: spot.y,
            order: m,
          });
        }
      }

      return tween(POUR_MS, mine, (p) => {
        runJobs(jobs, p, c.text, c.textMuted);
        for (const b of buckets) paintFloor(drawn, b, p >= 1);
        const fade = String(clamp01((p - 0.6) / 0.4));
        for (const b of buckets) drawn.countLabels[b]?.setAttribute('opacity', fade);
      });
    }

    /**
     * 삼킨 점들이 자국 하나로 접힌다.
     *
     * 정적 그리기는 자국만 세우고 점을 짓지 않으므로, 접히기 전의 점을 임시 층에
     * 되세워 자국으로 모은다. 그 자리도 장면에서 셈한 것이라 `prev` 가 필요 없다.
     * 점과 자국이 **한 시계**로 움직인다 — 모이는 것과 굵어지는 것이 한 말이다.
     */
    function flowMerge(drawn: Drawn, scene: CrowdTheTailsScene, mine: number): Promise<void> {
      const layout = drawn.layout;
      if (layout.bounds.length < 2) return Promise.resolve();

      const jobs: Job[] = [];
      for (let b = 0; b < layout.parts; b += 1) {
        const from = layout.offsets[b] ?? 0;
        const n = layout.counts[b] ?? 0;
        const q = layout.centroids[b];
        const x1 = typeof q === 'number' ? xOf(q) : centerOf(layout.bounds, b);
        for (let m = 0; m < n; m += 1) {
          const spot = dotSpotOf(layout, from + m, scene.count);
          const dot = el('circle', { cx: spot.x, cy: spot.y, r: DOT_R, fill: c.text });
          gFlow.appendChild(dot);
          jobs.push({ dot, x0: spot.x, y0: spot.y, x1, y1: MARK_Y, order: m });
        }
      }

      const radii = drawn.marks.map((_, b) => markRadius(layout, b));
      for (let b = 0; b < drawn.marks.length; b += 1) drawn.marks[b].setAttribute('r', '0');

      return tween(MERGE_MS, mine, (p) => {
        runJobs(jobs, p, c.text, c.text);
        const e = ease(p);
        for (let b = 0; b < drawn.marks.length; b += 1) {
          drawn.marks[b].setAttribute('r', String((radii[b] ?? 0) * e));
        }
      });
    }

    function flowFor(
      step: CrowdStep,
      drawn: Drawn,
      scene: CrowdTheTailsScene,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'drop':
          return flowDrop(drawn, mine);
        case 'slide':
          return flowSlide(drawn, scene, step.from, mine);
        case 'pour':
          return flowPour(drawn, scene, mine);
        case 'merge':
          return flowMerge(drawn, scene, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: CrowdTheTailsScene,
      _prev: CrowdTheTailsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawScene(next);
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
