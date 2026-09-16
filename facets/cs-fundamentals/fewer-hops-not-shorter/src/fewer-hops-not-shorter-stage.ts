/**
 * fewer-hops-not-shorter-stage — 두 길을 같은 출발선에서 나란히 눕히고, **화면의
 * 가로 길이가 곧 재고 있는 값**이 되게 하는 무대.
 *
 * 처음에는 간선 하나가 모두 같은 길이다 (간선 수 축척). 그래서 간선을 둘만 밟는
 * 길이 먼저 끝나고, 판정선(세로 점선)이 그 도착점에 선다. 무게를 재기 시작하면
 * 간선이 제 무게만큼 늘거나 줄고, 뒤따르는 정점이 통째로 밀려 도착점이 자리를
 * 바꾼다. 판정선은 "지금 가장 짧다고 주장되는 길" 의 도착점에 붙어 있으므로,
 * 그것이 차선을 옮겨 가는 것이 곧 역전이다.
 *
 * 출발 정점을 원이 아니라 **출발선(세로 막대)** 으로 그린 것은 두 차선이 정확히
 * 같은 x 에서 시작해야 길이 비교가 거짓이 되지 않기 때문이다. 도착 정점은 길마다
 * 다른 자리에서 끝나므로 원 둘로 그린다 — 같은 정점을 두 번 그린 것이며, 그
 * 전제는 글(description)이 밝힌다.
 *
 * 세로는 mount 시 고정이고 재생 중 바뀌지 않는다 (S-view).
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showRoutes()` · `showHops()` · `weighEdge()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다
 * (S-scene).
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 프레임으로
 * 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이 그 길이다.
 * 운동이 끝나면 **그 장면을 통째로 다시 세운다**. 속성을 하나씩 거두는 것보다
 * 안전하다.
 *
 * ## 채움과 테두리를 갈라 둔다
 *
 * 도착점의 **채움**은 *지금 가장 짧다고 주장되는 쪽*, **테두리**는 *간선 수로는
 * 이쪽이 적었다* 는 머무는 표식이다. 한 속성에 두 뜻을 실으면 무게로 재고 난 뒤
 * 앞의 주장이 지워져, 완주 화면이 이 조각이 하려는 말의 절반만 남긴다.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  hopsOf,
  isWeighed,
  maxHopsOf,
  maxWeightOf,
  routeOf,
  verdictRouteOf,
  weighedTotalOf,
  weightOf,
  type FewerHopsNotShorterCaption,
  type FewerHopsNotShorterRoute,
  type FewerHopsNotShorterScene,
  type FewerHopsNotShorterStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 262;

/** 출발선 자리. 두 차선은 정확히 여기서 함께 출발한다. */
const START_X = 24;
const START_BAR_W = 9;
const TRACK_X0 = START_X + START_BAR_W + 8;
/** 도착점 오른쪽 — 간선 수 · 무게 읽음값이 앉는 자리. */
const RIGHT_GUTTER = 92;
/** 가장 긴 길이 쓸 수 있는 폭. 축척은 여기서 역산한다. */
const MAX_SPAN = W - RIGHT_GUTTER - TRACK_X0;

const LANE_TOP = 84;
const LANE_BOTTOM = 172;
const NODE_R = 13;

/** 축척 상한 — 길이 짧을 때 화면이 텅 비지 않게 하는 값이지 못박은 크기가 아니다. */
const HOP_UNIT_MAX = 118;
const WEIGHT_UNIT_MAX = 30;

/** 간선 수로 이긴 쪽에 남는 테. 도착점 원 바깥으로 돈다. */
const RING_GAP = 5;
/** 테가 조여 들기 시작하는 자리. 처음에는 이만큼 헐겁다. */
const RING_SLACK = 4;

/** 읽음값이 도착점에서 미끄러져 들어오는 거리. */
const BADGE_SLIDE = 10;
/** 판정선이 차선 위아래로 삐져 나오는 몫. */
const VERDICT_OVER = 40;
const VERDICT_UNDER = 34;

const REVEAL_MS = 520;
const STRETCH_MS = 340;
const VERDICT_MS = 360;
const BADGE_MS = 220;

const CAPTION_Y = 244;

/** 차선의 간선 하나. DOM 손잡이와 **그 장면에서 셈한** 모습을 함께 쥔다. */
type SegShape = {
  id: string;
  /** 지금 그려지는 길이. 정적 그리기가 장면에서 매번 다시 셈한다. */
  len: number;
  /** 무게 라벨의 진하기. 운동 도중에만 1 이 아니다. */
  alpha: number;
  line: SVGLineElement;
  /** 아직 안 잰 간선에는 라벨을 **짓지 않는다** — 숨기면 앞 값이 속성으로 남는다. */
  label: SVGTextElement | null;
};

type LaneShape = {
  id: string;
  y: number;
  segs: SegShape[];
  circles: SVGCircleElement[];
  nodeTexts: SVGTextElement[];
  hopBadge: SVGTextElement | null;
  weightBadge: SVGTextElement | null;
  /** 간선 수로 이겼다는 테. 그 길에만 지어진다. */
  ring: SVGCircleElement | null;
  badgeDx: number;
  hopAlpha: number;
  weightAlpha: number;
  /** 테가 조여 든 몫. 1 이면 다 섰다. */
  ringIn: number;
  /** 도착점이 한 번 부푸는 몫. 건널 차선이 없을 때만 쓴다. */
  pulse: number;
  /** 지금 그려진 차선의 끝 x. `place` 가 한 번에 셈해 둔다. */
  end: number;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export const fewerHopsNotShorterStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    const frames = new Set<number>();

    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 rAF 콜백은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await ctx.emit`
     * 이 영영 돌아오지 않아 unmount 뒤에도 알고리즘과 SVG 가 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 걸음 함수가 `await` 를 지나 손잡이(`lanes`)를 다시 읽는데, 정적 그리기가 그
     * 손잡이를 통째로 갈아 끼운다. 깨어난 옛 세대가 새 손잡이를 타고 살아 있는
     * 화면에 쓰지 못하게 막는다. `destroy` 도 세대를 올린다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function nextFrame(cb: () => void): number {
      return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => cb())
        : (setTimeout(cb, 16) as unknown as number);
    }

    function dropFrame(id: number): void {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    }

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(durationMs: number, draw: (e: number) => void): Promise<void> {
      const my = gen;
      const paint = (e: number): void => {
        if (alive(my)) draw(e);
      };
      return new Promise<void>((resolve) => {
        if (destroyed || durationMs <= 0) {
          paint(1);
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / durationMs);
          paint(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          id = nextFrame(tick);
          frames.add(id);
        };
        paint(0);
        id = nextFrame(tick);
        frames.add(id);
      });
    }

    // ── 뼈대. mount 에서 한 번 세우고 안쪽만 갈아 끼운다 ────────────────────
    const root = el('g');
    const gStart = el('g');
    const gTracks = el('g');
    const gVerdict = el('g');
    const gNodes = el('g');
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    root.appendChild(gStart);
    root.appendChild(gTracks);
    root.appendChild(gVerdict);
    root.appendChild(gNodes);
    root.appendChild(caption);
    svg.appendChild(root);

    // ── 지금 세워 둔 그림. 전부 `drawStatic` 이 그 장면에서 다시 만든다 ─────
    let lanes: LaneShape[] = [];
    let hopUnit = 0;
    let weightUnit = 0;
    let verdictLine: SVGLineElement | null = null;
    /** 판정선이 떠나온 차선. 건너는 동안만 값이 있다. */
    let verdictFrom: string | null = null;
    let verdictTo: string | null = null;
    let verdictBlend = 1;
    let verdictAlpha = 1;

    function laneOf(routeId: string | null): LaneShape | null {
      if (routeId === null) return null;
      return lanes.find((l) => l.id === routeId) ?? null;
    }

    function laneY(index: number, count: number): number {
      if (count <= 1) return (LANE_TOP + LANE_BOTTOM) / 2;
      return LANE_TOP + ((LANE_BOTTOM - LANE_TOP) * index) / (count - 1);
    }

    // ── 문안. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10) ────────
    function nameOf(scene: FewerHopsNotShorterScene, routeId: string | null): string {
      return routeOf(scene, routeId)?.nodes.join('→') ?? '';
    }

    function hopsAt(scene: FewerHopsNotShorterScene, routeId: string | null): number {
      const route = routeOf(scene, routeId);
      return route ? hopsOf(route) : 0;
    }

    function captionTextOf(scene: FewerHopsNotShorterScene): string {
      const said: FewerHopsNotShorterCaption | null = scene.caption;
      if (!said) return '';
      switch (said.kind) {
        case 'twoRoutes':
          return tr('caption.twoRoutes', 'Two routes lead from {source} to {target}.', {
            source: scene.source,
            target: scene.target,
          });
        case 'countHops':
          return tr('caption.countHops', 'First, count only the edges each route crosses.');
        case 'fewerHops':
          return tr('caption.fewerHops', 'Edges: {route} = {hops}, {rival} = {rivalHops}. Fewer here.', {
            route: nameOf(scene, said.routeId),
            hops: hopsAt(scene, said.routeId),
            rival: nameOf(scene, said.rivalId),
            rivalHops: hopsAt(scene, said.rivalId),
          });
        case 'weighing':
          return tr('caption.weighing', 'Weighing {route}: {total} so far.', {
            route: nameOf(scene, said.routeId),
            total: weighedTotalOf(scene, said.routeId),
          });
        case 'reversed':
          return tr(
            'caption.reversed',
            'Weight: {route} = {total}, {rival} = {rivalTotal}. The order reverses.',
            {
              route: nameOf(scene, said.routeId),
              total: weighedTotalOf(scene, said.routeId),
              rival: nameOf(scene, said.rivalId),
              rivalTotal: weighedTotalOf(scene, said.rivalId),
            },
          );
      }
    }

    // ── 자리잡기. 차선의 끝을 **먼저 다 셈하고** 그 다음 판정선을 세운다 ────
    function paintFinish(lane: LaneShape, filled: boolean, grow: number): void {
      const last = lane.circles.length - 1;
      const finish = lane.circles[last];
      if (!finish) return;
      finish.setAttribute('r', String(NODE_R + 2 * grow + 3 * lane.pulse));
      finish.setAttribute('fill', filled ? c.accent : c.itemDefault);
      lane.nodeTexts[last]?.setAttribute('fill', filled ? c.stateInk : c.text);
    }

    function placeVerdict(): void {
      // 먼저 전부 기본으로 돌리고 그 다음 표식을 얹는다.
      for (const lane of lanes) paintFinish(lane, false, 0);
      const to = laneOf(verdictTo);
      if (!to) return;
      const from = laneOf(verdictFrom);
      if (from && from !== to) paintFinish(from, verdictBlend < 0.5, 1 - verdictBlend);
      paintFinish(to, verdictBlend >= 0.5, verdictBlend);

      if (!verdictLine || lanes.length === 0) return;
      const x = from && from !== to ? from.end + (to.end - from.end) * verdictBlend : to.end;
      verdictLine.setAttribute('x1', String(x));
      verdictLine.setAttribute('x2', String(x));
      verdictLine.setAttribute('y1', String(lanes[0].y - VERDICT_OVER));
      verdictLine.setAttribute('y2', String(lanes[lanes.length - 1].y + VERDICT_UNDER));
      verdictLine.setAttribute('opacity', String(verdictAlpha));
    }

    function place(): void {
      for (const lane of lanes) {
        let x = TRACK_X0;
        lane.segs.forEach((s, k) => {
          const x2 = x + s.len;
          const leftInset = k === 0 ? 0 : NODE_R;
          const visible = x2 - NODE_R > x + leftInset;
          s.line.setAttribute('x1', String(x + leftInset));
          s.line.setAttribute('x2', String(Math.max(x + leftInset, x2 - NODE_R)));
          s.line.setAttribute('y1', String(lane.y));
          s.line.setAttribute('y2', String(lane.y));
          s.line.setAttribute('opacity', visible ? '1' : '0');
          if (s.label) {
            s.label.setAttribute('x', String((x + x2) / 2));
            s.label.setAttribute('y', String(lane.y - 15));
            s.label.setAttribute('opacity', String(s.alpha));
          }
          lane.circles[k]?.setAttribute('cx', String(x2));
          lane.circles[k]?.setAttribute('cy', String(lane.y));
          lane.nodeTexts[k]?.setAttribute('x', String(x2));
          lane.nodeTexts[k]?.setAttribute('y', String(lane.y + 4));
          x = x2;
        });
        lane.end = x;

        const badgeX = x + NODE_R + 8 + lane.badgeDx;
        if (lane.hopBadge) {
          lane.hopBadge.setAttribute('x', String(badgeX));
          lane.hopBadge.setAttribute('y', String(lane.y - 3));
          lane.hopBadge.setAttribute('opacity', String(lane.hopAlpha));
        }
        if (lane.weightBadge) {
          lane.weightBadge.setAttribute('x', String(badgeX));
          lane.weightBadge.setAttribute('y', String(lane.y + 15));
          lane.weightBadge.setAttribute('opacity', String(lane.weightAlpha));
        }
        if (lane.ring) {
          lane.ring.setAttribute('cx', String(x));
          lane.ring.setAttribute('cy', String(lane.y));
          lane.ring.setAttribute(
            'r',
            String(NODE_R + RING_GAP + RING_SLACK * (1 - lane.ringIn)),
          );
          lane.ring.setAttribute('opacity', String(lane.ringIn));
        }
      }

      placeVerdict();
    }

    // ── 정적 그리기. 그 장면의 화면을 빠짐없이 통째로 세운다 ────────────────
    function buildStartGate(sourceLabel: string, count: number): void {
      const top = laneY(0, count) - 22;
      const bottom = laneY(count - 1, count) + 22;
      gStart.appendChild(
        el('rect', {
          x: START_X,
          y: top,
          width: START_BAR_W,
          height: bottom - top,
          rx: 4,
          fill: c.primary,
        }),
      );
      const label = el('text', {
        x: START_X + START_BAR_W / 2,
        y: top - 9,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': '700',
      });
      label.textContent = sourceLabel;
      gStart.appendChild(label);
    }

    function buildLane(
      scene: FewerHopsNotShorterScene,
      route: FewerHopsNotShorterRoute,
      y: number,
    ): LaneShape {
      const segs: SegShape[] = [];
      const circles: SVGCircleElement[] = [];
      const nodeTexts: SVGTextElement[] = [];

      route.edgeIds.forEach((id, k) => {
        const weighed = isWeighed(scene, route.id, id);
        const line = el('line', {
          stroke: weighed ? c.text : c.textMuted,
          'stroke-width': weighed ? 4 : 3,
          'stroke-linecap': 'round',
        });
        // 아직 안 잰 간선은 점선이다 — "이 길이는 아직 간선 수일 뿐" 이라는 뜻.
        if (!weighed) line.setAttribute('stroke-dasharray', '5 5');
        gTracks.appendChild(line);

        let label: SVGTextElement | null = null;
        if (weighed) {
          label = el('text', {
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': '700',
          });
          label.textContent = String(weightOf(scene, id));
          gTracks.appendChild(label);
        }

        segs.push({
          id,
          len: weighed ? weightOf(scene, id) * weightUnit : hopUnit,
          alpha: 1,
          line,
          label,
        });

        const circle = el('circle', {
          r: NODE_R,
          fill: c.itemDefault,
          stroke: c.text,
          'stroke-width': 1.6,
        });
        gNodes.appendChild(circle);
        const nodeText = el('text', {
          'text-anchor': 'middle',
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': '600',
        });
        nodeText.textContent = route.nodes[k + 1] ?? '';
        gNodes.appendChild(nodeText);
        circles.push(circle);
        nodeTexts.push(nodeText);
      });

      let hopBadge: SVGTextElement | null = null;
      if (scene.counted.includes(route.id)) {
        hopBadge = el('text', {
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        hopBadge.textContent = tr('label.hops', '{n} hops', { n: hopsOf(route) });
        gNodes.appendChild(hopBadge);
      }

      let weightBadge: SVGTextElement | null = null;
      if (scene.weighed.some((w) => w.routeId === route.id)) {
        weightBadge = el('text', {
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': '700',
        });
        weightBadge.textContent = tr('label.weight', 'weight {w}', {
          w: weighedTotalOf(scene, route.id),
        });
        gNodes.appendChild(weightBadge);
      }

      // 간선 수로 이긴 쪽에 남는 테. 채움이 옮겨 가도 이것은 남아 "간선은 이쪽이
      // 적었다" 를 끝까지 말한다.
      let ring: SVGCircleElement | null = null;
      if (scene.byHops?.routeId === route.id) {
        ring = el('circle', {
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 2.2,
          'stroke-dasharray': '3 4',
        });
        gNodes.appendChild(ring);
      }

      return {
        id: route.id,
        y,
        segs,
        circles,
        nodeTexts,
        hopBadge,
        weightBadge,
        ring,
        badgeDx: 0,
        hopAlpha: 1,
        weightAlpha: 1,
        ringIn: 1,
        pulse: 0,
        end: TRACK_X0,
      };
    }

    function drawStatic(scene: FewerHopsNotShorterScene): void {
      gStart.textContent = '';
      gTracks.textContent = '';
      gVerdict.textContent = '';
      gNodes.textContent = '';
      lanes = [];
      verdictLine = null;
      verdictFrom = null;
      verdictTo = verdictRouteOf(scene);
      verdictBlend = 1;
      verdictAlpha = 1;
      // 캡션은 재건 밖에 있다 — 그 장면의 문안을 매번 명시로 쓴다.
      caption.textContent = captionTextOf(scene);

      const count = scene.routes.length;
      if (count === 0) return;

      // 축척은 길 목록 전체에서 한 번에 센다. "지금까지 드러난 수" 로 정하면 길이
      // 하나 더 열릴 때 이미 그린 차선의 길이가 통째로 갈린다.
      hopUnit = Math.min(HOP_UNIT_MAX, MAX_SPAN / Math.max(1, maxHopsOf(scene)));
      weightUnit = Math.min(WEIGHT_UNIT_MAX, MAX_SPAN / Math.max(1, maxWeightOf(scene)));

      buildStartGate(scene.source, count);
      lanes = scene.routes.map((r, i) => buildLane(scene, r, laneY(i, count)));

      // 아직 판정이 없으면 판정선을 **짓지 않는다.** 숨겨 두면 앞 걸음의 자리가
      // 속성으로 남아 되짚기 판정이 어긋난다.
      if (verdictTo !== null) {
        verdictLine = el('line', {
          stroke: c.accent,
          'stroke-width': 2.5,
          'stroke-dasharray': '4 6',
        });
        gVerdict.appendChild(verdictLine);
      }

      place();
    }

    // ── 걸음. 정적 그리기가 세운 끝 자리에서 **아직 못 온 만큼을 뒤로 물린다** ──
    async function growLanes(): Promise<void> {
      const target = lanes.map((l) => l.segs.map((s) => s.len));
      await animate(REVEAL_MS, (e) => {
        lanes.forEach((lane, i) => {
          lane.segs.forEach((s, k) => {
            s.len = (target[i]?.[k] ?? 0) * e;
          });
        });
        place();
      });
    }

    async function slideHops(routeId: string, my: number): Promise<void> {
      const lane = laneOf(routeId);
      if (!lane?.hopBadge) return;
      await animate(BADGE_MS, (e) => {
        lane.badgeDx = -BADGE_SLIDE * (1 - e);
        lane.hopAlpha = e;
        place();
      });
      if (!alive(my)) return;
      lane.badgeDx = 0;
      lane.hopAlpha = 1;
      place();
    }

    async function stretchEdge(
      scene: FewerHopsNotShorterScene,
      routeId: string,
      edgeId: string,
      my: number,
    ): Promise<void> {
      const lane = laneOf(routeId);
      const route = routeOf(scene, routeId);
      if (!lane || !route) return;
      const k = route.edgeIds.indexOf(edgeId);
      const seg = lane.segs[k];
      if (!seg) return;

      // 재기 전에는 간선 하나가 모두 같은 길이였다. 끝 자리는 정적 그리기가 이미
      // 무게 축척으로 세워 두었으므로 출발 자리만 셈하면 된다.
      const from = hopUnit;
      const to = seg.len;
      // 무게 읽음값은 그 길에서 **처음** 잴 때만 미끄러져 들어온다. 걸음마다
      // 깜빡이면 "읽음값이 자란다" 가 "다시 나타난다" 로 읽힌다.
      const firstOfLane = scene.weighed.filter((w) => w.routeId === routeId).length === 1;

      await animate(STRETCH_MS, (e) => {
        seg.len = from + (to - from) * e;
        seg.alpha = e;
        if (firstOfLane) {
          lane.weightAlpha = e;
          lane.badgeDx = -BADGE_SLIDE * (1 - e);
        }
        place();
      });
      if (!alive(my)) return;
      // 보간 끝자리가 문자열을 가른다 — 끝에서는 목표값을 그대로 쓴다.
      seg.len = to;
      seg.alpha = 1;
      lane.weightAlpha = 1;
      lane.badgeDx = 0;
      place();
    }

    async function runVerdict(step: FewerHopsNotShorterStep, my: number): Promise<void> {
      if (step.kind !== 'verdict') return;
      const to = laneOf(step.routeId);
      if (!to) return;
      const from = step.from !== null && step.from !== step.routeId ? laneOf(step.from) : null;

      if (from) {
        // 판정선이 차선을 건넌다. 그것이 곧 역전이다.
        verdictFrom = from.id;
        verdictTo = to.id;
        verdictAlpha = 1;
        await animate(VERDICT_MS, (e) => {
          verdictBlend = e;
          place();
        });
        if (!alive(my)) return;
        verdictFrom = null;
        verdictBlend = 1;
        place();
        return;
      }

      if (step.from === step.routeId) {
        // 건널 차선이 없다 — 도착점을 한 번 부풀렸다 돌린다.
        await animate(VERDICT_MS, (e) => {
          to.pulse = Math.sin(Math.PI * e);
          place();
        });
        if (!alive(my)) return;
        to.pulse = 0;
        place();
        return;
      }

      // 판정선이 처음 선다. 테가 조여 들고 선이 함께 짙어진다.
      verdictFrom = null;
      verdictTo = to.id;
      await animate(VERDICT_MS, (e) => {
        verdictAlpha = e;
        verdictBlend = e;
        if (to.ring) to.ringIn = e;
        place();
      });
      if (!alive(my)) return;
      verdictAlpha = 1;
      verdictBlend = 1;
      to.ringIn = 1;
      place();
    }

    async function render(
      next: FewerHopsNotShorterScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: FewerHopsNotShorterScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'routes':
          await growLanes();
          break;
        case 'hops':
          await slideHops(step.routeId, my);
          break;
        case 'weigh':
          await stretchEdge(next, step.routeId, step.edgeId, my);
          break;
        case 'verdict':
          await runVerdict(step, my);
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성·보간 끝자리를 통째로 지운다. 그 사이에 타이머도 프레임도
      // 없어 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) dropFrame(id);
        frames.clear();
        // 프레임을 거두는 것만으로는 기다리던 약속이 풀리지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
