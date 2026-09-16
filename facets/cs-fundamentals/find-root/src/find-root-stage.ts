/**
 * 빌트인 `graph-layout` / `tree-layout` 을 쓰지 않은 이유: 가리킴을 거리에
 * 비례한 높이의 곡선으로 그리고 그 곡선 위를 표식이 실제로 타고 오르는 것이
 * 이 조각의 동사다. 두 view 모두 간선을 직선으로만 그리고 그 위를 따라가는
 * 운동이 없다 (원칙 6 의 예외 조건).
 *
 * find-root-stage — 자리 일곱을 한 줄에 늘어놓고, 가리킴을 활 모양 곡선으로
 * 위에 그린다. 질의가 시작되면 마커가 그 곡선을 실제로 타고 올라가 부모
 * 자리로 이동한다 (opacity 전환이 아니라 좌표가 바뀌는 이동). 자기 자신을
 * 가리키는 자리에 닿으면 멈추고, 그 자리와 출발 자리가 같은 색 테두리를
 * 얻는다 — 같은 색이 곧 같은 이름(무리)이다.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와
 * 같은 길로 온다. `init()` · `walkStart()` · `hop()` · `rootReached()` ·
 * `compare()` · `rewind()` 여섯이 통째로 사라졌고, 그와 함께 `clearProgress()` 가
 * 손으로 되돌리던 목록도 없어졌다.
 *
 * ── 올라온 길은 남는 강조다
 *
 * 이 조각의 주장이 **"뿌리까지 몇 번 올라갔나"** 이므로, 타고 오른 곡선과 닿은
 * 이름은 정적 그리기에도 들어간다. 옮기기 전에는 그 길이 `let currentPath` 와
 * 곡선의 `stroke` 속성 안에만 있어, 되짚으면 주장 자체가 화면에서 사라졌다.
 *
 * 세 통로를 갈라 쓴다 — **곡선의 칠**은 *타고 올랐나*, **동그라미의 테두리**는
 * *어느 이름에 매였나*, **마커**는 *지금 어디에 서 있나*. 셋을 한 통로에 몰면
 * 뿌리 자리에서 뜻이 부딪힌다.
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 자료에서 온 자리 번호와 가리킴뿐이다.
 * 문장인 캡션과 딱지는 `facet.ts` 의 `messages` 에 있고 여기서는 키와 en 원본으로
 * `params.t` 를 부른다 (C10). 그 문안이 말하는 수는 `scene.ts` 의 `hopsOf` ·
 * `pointsTo` · `rootOfStart` 에서 온다 — 화면에 그려진 곡선과 같은 출처다.
 *
 * View 는 algorithm 의 타입을 참조하지 않는다 (원칙 1) — 장면 타입만 본다.
 */

import {
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
  getColors,
  categorical,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';

import {
  arcsOf,
  groupIndexOf,
  hopsOf,
  nameCount,
  pointsTo,
  rootOfStart,
  type FindRootCaption,
  type FindRootScene,
  type FindRootStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

const NODE_R = 22;
const MARKER_R = 8;
const ARC_BASE_LIFT = 24;
const ARC_PER_UNIT = 32;
const CELL_MAX_W = 80;
const SIDE_MIN = 26;
const HOP_DURATION_MS = 460;
const POP_DURATION_MS = 200;
const PULSE_DURATION_MS = 420;

/** 마커가 튀어나올 때의 처음 크기. 끝에서는 보간값이 아니라 `MARKER_R` 을 쓴다. */
const POP_FROM_SCALE = 0.4;
/** 뿌리가 부풀 때 불어나는 지름의 양. */
const PULSE_GROW = 5;

const CANVAS_H = 230;
const NODE_CY = 92;
const LABEL_Y = NODE_CY + NODE_R + 14;
const CAPTION_Y = LABEL_Y + 26;
const RESULTS_Y = CAPTION_Y + 30;

/**
 * 딱지 글자 하나의 가로 — 11px 고정폭의 어림값. 이름 색 점을 글자 왼쪽에 놓는
 * 데만 쓴다. 정확히 재려면 화면을 되읽어야 하는데, 그러면 되감은 직후 아직 옛
 * 화면인 값으로 자리가 정해진다 (S-scene 의 ④).
 */
const CHIP_CHAR_W = 6.6;
/** 점과 글자 사이 틈. */
const CHIP_DOT_GAP = 9;

/** 테두리 굵기 — 예사 / 이름에 매인 자리. */
const STROKE_PLAIN = '2';
const STROKE_NAMED = '3.5';
/** 곡선 굵기 — 예사 / 지금 오르는 중 / 다 오른 길. */
const ARC_PLAIN = '2';
const ARC_CLIMBING = '3';
const ARC_CLIMBED = '2.5';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

function text(
  x: number,
  y: number,
  content: string,
  attrs?: Record<string, string | number>,
): SVGTextElement {
  const t = el('text', { x, y, ...attrs });
  t.textContent = content;
  return t;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 자리 개수로부터 x 좌표를 뽑는다 — 캔버스 폭을 채우고, 칸 폭은 상한만 둔다. */
function layoutX(count: number): number[] {
  if (count <= 0) return [];
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / count));
  const originX = Math.round((W - count * cellW) / 2);
  const xs: number[] = [];
  for (let i = 0; i < count; i += 1) xs.push(originX + cellW * (i + 0.5));
  return xs;
}

function qPoint(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

/** 곡선 하나의 생김새. 캔버스에서 역산한 것이라 장면은 이것을 모른다 (S-piece). */
type ArcGeom = {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
};

/** 자리와 곡선의 자리. 장면이 아니라 그리는 쪽이 매 걸음 다시 셈한다. */
type Geometry = {
  xs: number[];
  arcs: Map<string, ArcGeom>;
};

function arcKey(child: number, parent: number): string {
  return `${child}->${parent}`;
}

/**
 * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다.
 *
 * 그리면서 이웃의 지금 좌표를 되읽으면 순회 순서가 곧 숨은 상태가 된다 (S-scene).
 */
function layoutOf(scene: FindRootScene): Geometry {
  const xs = layoutX(scene.parent.length);
  const arcs = new Map<string, ArcGeom>();
  const y0 = NODE_CY - NODE_R;

  for (let i = 0; i < scene.parent.length; i += 1) {
    const p = scene.parent[i];
    // 자기 자신을 가리키는 자리(뿌리)는 곡선이 없다.
    if (p === i || p < 0 || p >= xs.length) continue;
    const lift = ARC_BASE_LIFT + ARC_PER_UNIT * Math.abs(i - p);
    arcs.set(arcKey(i, p), {
      x0: xs[i],
      y0,
      cx: (xs[i] + xs[p]) / 2,
      cy: y0 - lift,
      x1: xs[p],
      y1: y0,
    });
  }
  return { xs, arcs };
}

/** 마커가 그 자리에 설 때의 좌표. 자리 위에 살짝 떠 있다. */
function markerAt(geo: Geometry, node: number): { x: number; y: number } | null {
  if (node < 0 || node >= geo.xs.length) return null;
  return { x: geo.xs[node], y: NODE_CY - NODE_R - 6 };
}

export const findRootStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<FindRootScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    /**
     * 장면마다 통째로 다시 짓는 뿌리.
     *
     * 고정 자리에 남겨 두는 요소를 하나도 두지 않는다. 남겨 두면 정적 경로가 그
     * 속성을 **매번 명시로** 쓰는지 따로 확인해야 하고, 빠뜨린 속성 하나가 되짚기
     * 판정을 가른다 (S-scene 의 "재건 밖 요소"). 옮기기 전 이 조각의 마커와 캡션이
     * 그런 요소였다 — `opacity` 와 `r` 이 앞 걸음의 값으로 남았다.
     */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 이 조각은 흐름이 끝난 뒤 장면을 **다시 세우는 길**을 지나므로, 살아남은 앞
     * 세대가 그 길로 들어가면 새로 선 화면을 통째로 덮는다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeOutCubic(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let circleAt = new Map<number, SVGCircleElement>();
    let arcPathAt = new Map<string, SVGPathElement>();
    let marker: SVGCircleElement | null = null;

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.replaceChildren();
      circleAt = new Map<number, SVGCircleElement>();
      arcPathAt = new Map<string, SVGPathElement>();
      marker = null;
    }

    // ── 무리 색 ─────────────────────────────────────────────────────────────

    /**
     * 이름마다의 색.
     *
     * 색판의 크기를 **바탕 자료**에서 한 번에 정한다. 옮기기 전에는 drawn-so-far 인
     * `groupCount` 를 넣어, 둘째 이름이 드러나는 순간 첫 이름의 색이 바뀌었다.
     */
    function colorOfRoot(scene: FindRootScene, rootSlot: number): string {
      const palette = categorical(Math.max(2, nameCount(scene)), 'vivid');
      const idx = groupIndexOf(scene, rootSlot);
      return palette[(idx < 0 ? 0 : idx) % palette.length];
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    /** 곡선마다의 형편 — 다 오른 길(이름 색) / 지금 오르는 중 / 예사. */
    function arcPaint(scene: FindRootScene): Map<string, { stroke: string; width: string }> {
      const paint = new Map<string, { stroke: string; width: string }>();

      // 끝난 오름들 — 남는 강조. 정적 그리기에 들어가야 되짚었을 때 살아난다.
      for (const walk of scene.walks) {
        const named = walk.path[walk.path.length - 1];
        const color = colorOfRoot(scene, named);
        for (const a of arcsOf(walk.path)) {
          paint.set(arcKey(a.child, a.parent), { stroke: color, width: ARC_CLIMBED });
        }
      }
      // 지금 오르는 중인 길 — 아직 이름을 모르므로 활성 색으로 남는다.
      if (scene.climbing !== null) {
        for (const a of arcsOf(scene.climbing)) {
          paint.set(arcKey(a.child, a.parent), {
            stroke: colors.itemActive,
            width: ARC_CLIMBING,
          });
        }
      }
      return paint;
    }

    /** 자리마다의 테두리 — 어느 이름에 매였나. 출발 자리와 뿌리가 같은 색을 얻는다. */
    function nodePaint(scene: FindRootScene): Map<number, string> {
      const paint = new Map<number, string>();
      for (const walk of scene.walks) {
        if (walk.path.length === 0) continue;
        const named = walk.path[walk.path.length - 1];
        const color = colorOfRoot(scene, named);
        paint.set(walk.start, color);
        paint.set(named, color);
      }
      return paint;
    }

    function drawArcs(scene: FindRootScene, geo: Geometry): void {
      const paint = arcPaint(scene);
      for (const [key, g] of geo.arcs) {
        const style = paint.get(key);
        const path = el('path', {
          d: `M ${g.x0} ${g.y0} Q ${g.cx} ${g.cy} ${g.x1} ${g.y1}`,
          fill: 'none',
          stroke: style?.stroke ?? colors.border,
          'stroke-width': style?.width ?? ARC_PLAIN,
        });
        root.appendChild(path);
        arcPathAt.set(key, path);
      }
    }

    function drawNodes(scene: FindRootScene, geo: Geometry): void {
      const paint = nodePaint(scene);
      for (let i = 0; i < geo.xs.length; i += 1) {
        const named = paint.get(i);
        const circle = el('circle', {
          cx: geo.xs[i],
          cy: NODE_CY,
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: named ?? colors.border,
          'stroke-width': named ? STROKE_NAMED : STROKE_PLAIN,
        });
        root.appendChild(circle);
        circleAt.set(i, circle);

        root.appendChild(
          text(geo.xs[i], NODE_CY + 5, String(i), {
            'text-anchor': 'middle',
            fill: colors.text,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': '600',
          }),
        );
        // 가리킴은 자료 그대로다. 곡선과 같은 배열에서 나온다.
        root.appendChild(
          text(geo.xs[i], LABEL_Y, `→${scene.parent[i]}`, {
            'text-anchor': 'middle',
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
      }
    }

    /** 지금 선 자리. 오르는 길의 끝이 곧 마커다 — 따로 쥐는 상태가 아니다. */
    function drawMarker(scene: FindRootScene, geo: Geometry): void {
      const path = scene.climbing;
      if (path === null || path.length === 0) return;
      const at = markerAt(geo, path[path.length - 1]);
      if (at === null) return;
      marker = el('circle', {
        cx: at.x,
        cy: at.y,
        r: MARKER_R,
        fill: colors.risingMarker,
      });
      root.appendChild(marker);
    }

    /** 캡션이 말하는 수는 장면에서 셈해 온다 — 화면의 곡선과 같은 출처다. */
    function captionOf(scene: FindRootScene, caption: FindRootCaption | null): string {
      if (caption === null) return '';
      switch (caption.kind) {
        case 'start':
          return t('caption.start', 'Start at slot {n}.', { n: caption.node });
        case 'hop': {
          const to = pointsTo(scene, caption.from);
          if (to === null) return '';
          return t('caption.hop', 'Slot {from} points to slot {to} — climb up.', {
            from: caption.from,
            to,
          });
        }
        case 'root':
          return t('caption.root', 'Slot {n} points to itself — the root. Its name is {n}.', {
            n: caption.node,
          });
        case 'compare': {
          const nameA = rootOfStart(scene, caption.a);
          const nameB = rootOfStart(scene, caption.b);
          if (nameA === null || nameB === null) return '';
          // 한 무리인지는 두 이름이 같은지다. 걸음이 실어 온 판정을 믿지 않는다.
          if (nameA === nameB) {
            return t(
              'caption.compareSame',
              'Slot {a} and slot {b} both reach name {name} — same group.',
              { a: caption.a, b: caption.b, name: nameA },
            );
          }
          return t(
            'caption.compareDiff',
            'Slot {a} reaches name {nameA}, slot {b} reaches name {nameB} — different groups.',
            { a: caption.a, b: caption.b, nameA, nameB },
          );
        }
      }
    }

    function drawCaption(scene: FindRootScene): void {
      root.appendChild(
        text(W / 2, CAPTION_Y, captionOf(scene, scene.caption), {
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        }),
      );
    }

    /**
     * 끝난 오름마다 딱지 한 장 — 올라온 길과 **그 길이**.
     *
     * 몇 번 올라갔나는 `hopsOf` 하나에서만 나온다. 걸음이 수를 실어 오게 해 두고
     * 여기서 길도 함께 그리면 언젠가 둘이 갈린다.
     */
    function drawChips(scene: FindRootScene): void {
      const slots = Math.max(1, scene.queries.length);
      const slotW = W / slots;
      for (let i = 0; i < scene.walks.length; i += 1) {
        const walk = scene.walks[i];
        if (walk.path.length === 0) continue;
        const named = walk.path[walk.path.length - 1];
        const color = colorOfRoot(scene, named);
        const label = t('chip.walk', '{path} · {hops} hops', {
          path: walk.path.join('→'),
          hops: hopsOf(walk.path),
        });
        const cx = slotW * (i + 0.5);
        const dotX = cx - (label.length * CHIP_CHAR_W) / 2 - CHIP_DOT_GAP;
        root.appendChild(el('circle', { cx: dotX, cy: RESULTS_Y - 4, r: 4, fill: color }));
        root.appendChild(
          text(cx, RESULTS_Y, label, {
            'text-anchor': 'middle',
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
      }
    }

    function drawStatic(scene: FindRootScene, geo: Geometry): void {
      drawArcs(scene, geo);
      drawNodes(scene, geo);
      drawCaption(scene);
      drawChips(scene);
      // 마커는 맨 위에. 곡선과 동그라미를 가리고 타고 오른다.
      drawMarker(scene, geo);
    }

    // ── 흐르게 하기 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 흐를 때만 **출발 그림으로
    // 도로 물려 놓고** 시작하며, 그 물림은 첫 프레임이 그려지기 전에 동기로 끝난다.

    /** 마커가 그 자리에 톡 튀어나온다. */
    function flowStart(live: () => boolean): Promise<void> {
      const dot = marker;
      if (dot === null) return Promise.resolve();
      return animate(
        POP_DURATION_MS,
        (p) => {
          // 끝에서는 보간값이 아니라 상수를 쓴다 — 부동소수 끝자리가 화면을 가른다.
          if (p >= 1) dot.setAttribute('r', String(MARKER_R));
          else dot.setAttribute('r', String(MARKER_R * (POP_FROM_SCALE + (1 - POP_FROM_SCALE) * p)));
        },
        live,
      );
    }

    /**
     * 마커가 곡선을 타고 오른다.
     *
     * 출발 자리는 `step.from` 이 싣고 온다 — `prev` 에서 꺼내면 "`prev` 는 고르는
     * 데만" 을 어긴다 (S-scene). 닿을 자리는 `parent[from]` 이라 자료가 정한다.
     */
    function flowHop(from: number, scene: FindRootScene, geo: Geometry, live: () => boolean): Promise<void> {
      const dot = marker;
      const to = pointsTo(scene, from);
      if (dot === null || to === null) return Promise.resolve();
      const arc = geo.arcs.get(arcKey(from, to));
      const end = markerAt(geo, to);
      if (arc === undefined || end === null) return Promise.resolve();

      // 곡선은 자리 테두리에서 자리 테두리로 가지만 마커는 그 위에 떠 있으므로,
      // 시작과 끝만 마커의 자리로 맞춰 준다.
      const start = markerAt(geo, from);
      if (start === null) return Promise.resolve();
      const lift = end.y - arc.y1;

      return animate(
        HOP_DURATION_MS,
        (p) => {
          if (p >= 1) {
            dot.setAttribute('cx', String(end.x));
            dot.setAttribute('cy', String(end.y));
            return;
          }
          const q = qPoint(p, start.x, arc.y0 + lift, arc.cx, arc.cy + lift, end.x, end.y);
          dot.setAttribute('cx', String(q.x));
          dot.setAttribute('cy', String(q.y));
        },
        live,
      );
    }

    /**
     * 자리들이 한 번 부풀었다 가라앉는다.
     *
     * 뿌리 하나든 견주는 둘이든 **한 시계로** 돈다. 시계를 둘로 나누면 lockstep 이
     * 우연히 맞는 꼴이 되고 하나를 `void` 로 흘릴 여지가 생긴다 (S-scene).
     */
    function flowPulse(nodes: number[], live: () => boolean): Promise<void> {
      const circles = nodes
        .map((n) => circleAt.get(n))
        .filter((c): c is SVGCircleElement => c !== undefined);
      if (circles.length === 0) return Promise.resolve();
      return animate(
        PULSE_DURATION_MS,
        (p) => {
          const r = p >= 1 ? NODE_R : NODE_R + Math.sin(p * Math.PI) * PULSE_GROW;
          for (const c of circles) c.setAttribute('r', String(r));
        },
        live,
      );
    }

    function flowOf(
      step: FindRootStep,
      scene: FindRootScene,
      geo: Geometry,
      live: () => boolean,
    ): Promise<void> {
      switch (step.kind) {
        case 'start':
          return flowStart(live);
        case 'hop':
          return flowHop(step.from, scene, geo, live);
        case 'root':
          return flowPulse([step.node], live);
        case 'compare':
          return flowPulse([step.a, step.b], live);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 자리에 필요한 계기값을 `step` 이 싣고 오므로
     * 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: FindRootScene,
      _prev: FindRootScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      const geo = layoutOf(next);
      rewind();
      drawStatic(next, geo);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(step, next, geo, live);
      if (!live()) return;

      // 흐르며 남은 보간 좌표 문자열과 부푼 반지름이 통째로 사라진다. 그 사이에
      // 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next, geo);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 프레임은 아예 불리지
        // 않으므로 기다리던 promise 가 영영 안 풀린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
