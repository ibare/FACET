/**
 * split-until-one-stage — 갈라짐만 있고 움직임은 없는 화면.
 *
 * ── 왜 이 배치인가
 *
 * 이 조각이 말해야 하는 것은 "쪼개는 동안 값은 하나도 움직이지 않는다" 이다.
 * 그래서 값을 층마다 다시 늘어놓지 않는다 — 값은 화면 맨 위에 딱 한 번 적히고,
 * 거기서 아래로 **세로 레일**이 내려간다. 레일은 처음부터 끝까지 자리를 바꾸지
 * 않으므로, 무엇이 움직이지 않는지가 그림 자체로 증명된다.
 *
 * 움직이는 것은 **묶음 상자**뿐이다. 한 상자가 갈라질 때, 부모와 똑같은 상자가
 * 한 층 아래로 내려가면서 가운데가 찢어져 둘이 된다. 상자는 세로로 내려가고
 * 가로로는 안쪽 모서리만 물러난다 — 어떤 것도 좌우로 자리를 옮기지 않는다.
 *
 * 묶음 안의 항목은 레일 위의 **점**으로 그린다. 점 둘 사이에는 가를 자리가
 * 있지만 점 하나짜리 상자에는 없다 — "왜 낱개에서 멈추는가" 가 도형으로 답해진다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * **상자는 장면에서 파생된다.** 몇 번 갈라졌는지(`splitsDone`) 하나로 지금 서 있는
 * 묶음 전부가 나오므로 (`shownGroups`), "어디까지 쪼갰나" 가 DOM 의 자식 수에
 * 적히던 자리가 없어졌다. 층 수도 마찬가지다 — 캔버스의 세로 배치를 정하는
 * `layerCount` 는 `plan.maxDepth` 하나에서 나온다. 자르는 잣대가 두 군데면 갈린다.
 *
 * **운동의 방향이 뒤집힌다.** 정적 그리기가 정본이라 상자는 이미 끝 자리에 서 있고,
 * 걸음은 **아직 못 온 만큼 뒤로 물려** 놓고 출발한다. 정적으로 세운 직후라 그 사이에
 * 타이머도 프레임도 없어 페인트가 끼지 않는다.
 *
 * 색은 design-tokens 결정 트리를 따른다 — 낱개로 확정된 채움(itemSorted, 그 위
 * 잉크는 테마를 따라 뒤집히므로 textInverse), 이번 걸음에 새로 난 테두리
 * (itemActive). **채움은 값의 형편, 테두리는 갈라짐의 표식**이라 둘이 부딪히지
 * 않는다.
 */

import {
  PIECE_CANVAS_W,
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
  justSplitIds,
  lastSplit,
  planOf,
  settledLeaves,
  shownGroups,
  type SplitUntilOneMark,
  type SplitUntilOneScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 그림이 정하는 값이라 그림 곁에 상수로 둔다 (S-piece). */
const H = 248;

/** 값 숫자의 기준선. 레일은 그 아래에서 시작한다. */
const VALUE_BASELINE = 40;
const RAIL_TOP = 52;
const RAIL_TAIL = 6;

/** 층 영역의 위 끝과, 바닥에서 캡션이 쓰는 높이. */
const BANDS_TOP = 72;
const CAPTION_BAND = 40;
const CAPTION_BASELINE = H - 14;

/** 칸 폭은 캔버스에서 역산한다. 상수는 상한과 최소 여백만 정한다 (S-piece). */
const COL_MAX_W = 132;
const SIDE_MIN = 26;

/** 상자가 칸 경계에서 물러나는 만큼. 이웃 상자 사이 틈은 이 값의 두 배가 된다. */
const FRAME_INSET = 10;
const FRAME_RADIUS = 8;

const BAND_GAP = 10;
const BAND_H_MAX = 44;
const BAND_H_MIN = 24;

const DOT_R = 4.5;

const ROOT_MS = 300;
const SPLIT_MS = 460;
/**
 * 낱개 확정이 번지는 데 드는 밑시간.
 *
 * 이 걸음 뒤에는 자동 재생이 멎으므로 `stepMs` 가 더해지지 않는다 — 걸음 벽시계가
 * 곧 이 운동의 길이다. 네 낱개에서 560 × (1 + 0.12 × 4) ≈ 829ms 로, 캡션을 읽을
 * 틈(800ms)을 넘긴다 (S-piece 얇은 걸음).
 */
const SETTLE_MS = 560;
/** 낱개가 확정될 때 왼쪽부터 차례로 번지는 정도 (전체 진행 대비 비율). */
const SETTLE_STAGGER = 0.12;
const SETTLE_NUDGE = 4;

/** 한 묶음 상자의 손잡이. DOM 만 담는다 — 구간도 층도 장면이 말한다. */
type FrameEl = {
  g: SVGGElement;
  rect: SVGRectElement;
  dots: SVGCircleElement[];
};

/**
 * 그림의 밑감. 장면이 말하는 값 개수와 층 수에서 매번 역산한다.
 *
 * mount 때 한 번 재던 것을 정적 그리기가 매번 정하게 옮겼다 — 층이 자라는 조각이라
 * 기준선을 한 번만 재면 첫 그림이 엉뚱한 높이로 선다.
 */
type Layout = {
  n: number;
  bandStride: number;
  bandH: number;
  railBottom: number;
  colCenter(i: number): number;
  frameLeft(lo: number): number;
  frameRight(hi: number): number;
  /** 칸 `i` 의 오른쪽 경계 — 가름이 일어나는 자리. */
  cutX(i: number): number;
  bandY(depth: number): number;
  bandMid(depth: number): number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 장면에서 자리를 셈한다.
 *
 * 장면은 좌표를 모른다 (S-piece). 구간과 층이 구조를 정하고, 그것을 캔버스에
 * 앉히는 것은 여기 몫이다.
 */
function layoutOf(scene: SplitUntilOneScene): Layout {
  const n = Math.max(1, scene.values.length);

  // ── 가로: 칸 폭을 캔버스에서 역산한다.
  const colW = Math.min(COL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / n));
  const originX = Math.round((PIECE_CANVAS_W - n * colW) / 2);

  // ── 세로: 층 수만큼 자리를 나눈다. 깊어지면 간격을 줄여 담는다.
  //
  // 층 수는 `plan.maxDepth` 하나에서 나온다. 여기서 따로 `log2(n)` 을 셈하면
  // 자르는 잣대가 둘이 되어 언젠가 갈린다.
  const layerCount = planOf(scene).maxDepth + 1;
  const bandSpace = H - CAPTION_BAND - BANDS_TOP;
  const bandH = Math.max(
    BAND_H_MIN,
    Math.min(BAND_H_MAX, Math.floor((bandSpace - BAND_GAP * (layerCount - 1)) / layerCount)),
  );
  const bandStride = bandH + BAND_GAP;
  const bandsHeight = bandH * layerCount + BAND_GAP * (layerCount - 1);
  const bandsStart = BANDS_TOP + Math.max(0, Math.floor((bandSpace - bandsHeight) / 2));
  const bandY = (depth: number): number => bandsStart + depth * bandStride;

  return {
    n,
    bandH,
    bandStride,
    railBottom: bandsStart + bandsHeight + RAIL_TAIL,
    colCenter: (i) => originX + colW * i + colW / 2,
    frameLeft: (lo) => originX + lo * colW + FRAME_INSET,
    frameRight: (hi) => originX + (hi + 1) * colW - FRAME_INSET,
    cutX: (i) => originX + (i + 1) * colW,
    bandY,
    bandMid: (depth) => bandY(depth) + bandH / 2,
  };
}

export const splitUntilOneStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SplitUntilOneScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가
    // 먼저 붙여 둔 이 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    // 레이어의 차례가 곧 겹치는 차례다 — 상자는 레일 뒤에 깔린다. 레이어 자체는
    // 다시 짓지 않고 속성도 걸지 않는다. 안에 든 것만 매번 새로 짓는다.
    const framesLayer = el('g');
    const railsLayer = el('g');
    const captionLayer = el('g');
    svg.append(framesLayer, railsLayer, captionLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const rafIds = new Set<number>();
    const pending = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 상자를 매번 새로 짓지만 그 손잡이를 담는 `frameEls` 는
     * **다시 할당되는 클로저 변수**다. 옛 세대의 프레임이 그것을 읽으면 새
     * 손잡이를 타고 살아 있는 화면에 쓴다. 그래서 프레임마다 자기 세대를
     * 확인하고 아니면 손대지 않고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /** t=0..1 프레임마다 onFrame 을 부르는 rAF 트윈. 이 조각의 유일한 시계다. */
    function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          pending.delete(done);
          resolve();
        };
        if (destroyed || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          done();
          return;
        }
        pending.add(done);

        const startedAt = Date.now();
        let id = 0;
        const frame = (): void => {
          rafIds.delete(id);
          const raw = clamp01((Date.now() - startedAt) / durationMs);
          onFrame(easeInOut(raw));
          if (raw >= 1 || destroyed) {
            done();
            return;
          }
          id = requestAnimationFrame(frame);
          rafIds.add(id);
        };
        id = requestAnimationFrame(frame);
        rafIds.add(id);
      });
    }

    /** 이번 장면의 손잡이들. 정적 그리기가 매번 새로 채운다. */
    let frameEls = new Map<string, FrameEl>();

    function setSpan(rect: SVGRectElement, x: number, w: number): void {
      rect.setAttribute('x', String(x));
      rect.setAttribute('width', String(Math.max(0, w)));
    }

    /** 낱개 확정의 칠. 채움은 **값의 형편**을 말한다. */
    function paintSettled(frame: FrameEl, settled: boolean): void {
      frame.rect.setAttribute('fill', settled ? c.itemSorted : c.bgSubtle);
      frame.rect.setAttribute('stroke', settled ? c.itemSorted : c.border);
      for (const dot of frame.dots) dot.setAttribute('fill', settled ? c.textInverse : c.text);
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 늘 비우고 다시 짓는다 — 되돌릴 명령이 필요 없고, 운동이 남긴 transform·
     * opacity·보간 끝자리(`-0` 이나 `4.9e-16` 같은 것)도 함께 사라진다 (S-scene).
     */
    function drawStatic(scene: SplitUntilOneScene): void {
      const L = layoutOf(scene);
      railsLayer.textContent = '';
      framesLayer.textContent = '';
      frameEls = new Map<string, FrameEl>();

      // ── 값 숫자와 레일. 이 둘은 재생 내내 한 번도 움직이지 않는다.
      for (let i = 0; i < L.n; i += 1) {
        const cx = L.colCenter(i);
        const label = el('text', {
          x: cx,
          y: VALUE_BASELINE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': 20,
          'font-weight': 600,
          fill: c.text,
        });
        label.textContent = String(scene.values[i] ?? '');
        railsLayer.appendChild(label);
        railsLayer.appendChild(
          el('line', {
            x1: cx,
            y1: RAIL_TOP,
            x2: cx,
            y2: L.railBottom,
            stroke: c.border,
            'stroke-width': 1.5,
          }),
        );
      }

      // ── 묶음 상자. 어디까지 쪼갰나가 장면에서 풀린다.
      const settledIds = new Set(settledLeaves(scene).map((g) => g.id));
      const freshIds = new Set(justSplitIds(scene));

      for (const g of shownGroups(scene)) {
        const fresh = freshIds.has(g.id);
        const group = el('g', { transform: 'translate(0,0)' });
        const rect = el('rect', {
          x: L.frameLeft(g.lo),
          y: L.bandY(g.depth),
          width: Math.max(0, L.frameRight(g.hi) - L.frameLeft(g.lo)),
          height: L.bandH,
          rx: FRAME_RADIUS,
          fill: c.bgSubtle,
          // 이번 걸음에 새로 난 둘만 테두리가 갈린다. 테두리는 **갈라짐의 표식**이다.
          stroke: fresh ? c.itemActive : c.border,
          'stroke-width': fresh ? 2 : 1.5,
        });
        group.appendChild(rect);
        const dots: SVGCircleElement[] = [];
        for (let i = g.lo; i <= g.hi; i += 1) {
          const dot = el('circle', {
            cx: L.colCenter(i),
            cy: L.bandMid(g.depth),
            r: DOT_R,
            fill: c.text,
          });
          group.appendChild(dot);
          dots.push(dot);
        }
        framesLayer.appendChild(group);
        const frame: FrameEl = { g: group, rect, dots };
        // 갈라짐의 표식(테두리)은 위에서 이미 섰다. 낱개 확정(채움)은 그 위에
        // 얹히므로 둘이 부딪히지 않는다.
        if (settledIds.has(g.id)) paintSettled(frame, true);
        frameEls.set(g.id, frame);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: SplitUntilOneScene): string {
      const cap = scene.caption;
      if (cap === null) return '';
      switch (cap.kind) {
        case 'whole':
          // 값 개수는 화면 맨 위에 적히는 숫자와 같은 배열을 센다 — 한 출처다.
          return tr('caption.whole', 'All {n} values sit in one group. Nothing has been compared.', {
            n: scene.values.length,
          });
        case 'split':
          return tr('caption.split', 'The group is cut in half. No value moves — only a boundary.');
        case 'splitAgain':
          return tr(
            'caption.splitAgain',
            'Each half is cut again. The left-to-right order still holds.',
          );
        case 'leaves':
          return tr(
            'caption.leaves',
            'Each group holds one value — already in order, nothing left to cut.',
          );
      }
    }

    function drawCaption(scene: SplitUntilOneScene): void {
      captionLayer.textContent = '';
      const text = captionTextOf(scene);
      if (text === '') return;
      const node = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        // SVG 속성이라 숫자로 준다 (core views 와 같은 관행). 값은 fontSizes 눈금.
        'font-size': 12,
        fill: c.textMuted,
      });
      node.textContent = text;
      captionLayer.appendChild(node);
    }

    /**
     * 맨 위 묶음이 선다. 상자가 가운데에서 좌우로 벌어지며 네 자리를 품고,
     * 상자가 지나간 자리의 점이 켜진다.
     */
    function flowRoot(scene: SplitUntilOneScene, mine: number): Promise<void> {
      const L = layoutOf(scene);
      const root = planOf(scene).root;
      const frame = frameEls.get(root.id);
      if (frame === undefined) return Promise.resolve();

      const x1 = L.frameLeft(root.lo);
      const x2 = L.frameRight(root.hi);
      const mid = (x1 + x2) / 2;
      const draw = (p: number): void => {
        const x = lerp(mid, x1, p);
        const w = lerp(0, x2 - x1, p);
        setSpan(frame.rect, x, w);
        for (let k = 0; k < frame.dots.length; k += 1) {
          const cx = L.colCenter(root.lo + k);
          const covered = cx >= x && cx <= x + w;
          frame.dots[k]?.setAttribute('opacity', covered ? '1' : '0');
        }
      };

      // 끝 자리에 선 것을 옛 자리로 물려 놓고 출발한다.
      draw(0);
      return tween(ROOT_MS, (p) => {
        if (!alive(mine)) return;
        draw(p);
      });
    }

    /**
     * 한 묶음이 둘로 갈라진다.
     *
     * 부모와 똑같은 상자 둘이 부모 자리에서 출발해 한 층 아래로 내려가고,
     * 내려가는 동안 가른 자리에서 안쪽 모서리가 서로 물러난다. 바깥 모서리는
     * 처음 자리 그대로다 — 어떤 것도 좌우로 옮겨가지 않는다.
     *
     * 출발 자리는 `prev` 가 아니라 장면이 말한다 (S-scene) — 부모 구간과 가른
     * 자리가 `lastSplit` 에서 나온다. 둘은 한 뜻으로 묶인 운동이라 **한 목록,
     * 한 시계**로 흐른다.
     */
    function flowSplit(scene: SplitUntilOneScene, mine: number): Promise<void> {
      const s = lastSplit(scene);
      if (s === null) return Promise.resolve();
      const left = frameEls.get(s.leftId);
      const right = frameEls.get(s.rightId);
      if (left === undefined || right === undefined) return Promise.resolve();

      const L = layoutOf(scene);
      const px1 = L.frameLeft(s.parentLo);
      const px2 = L.frameRight(s.parentHi);
      const cut = L.cutX(s.cutAfter);

      type Span = { x: number; w: number };
      const moves: { frame: FrameEl; from: Span; to: Span }[] = [
        {
          frame: left,
          from: { x: px1, w: cut - px1 },
          to: {
            x: L.frameLeft(s.leftLo),
            w: L.frameRight(s.leftHi) - L.frameLeft(s.leftLo),
          },
        },
        {
          frame: right,
          from: { x: cut, w: px2 - cut },
          to: {
            x: L.frameLeft(s.rightLo),
            w: L.frameRight(s.rightHi) - L.frameLeft(s.rightLo),
          },
        },
      ];

      const draw = (p: number): void => {
        const dy = -L.bandStride * (1 - p);
        const shift = `translate(0,${dy})`;
        for (const m of moves) {
          m.frame.g.setAttribute('transform', shift);
          setSpan(m.frame.rect, lerp(m.from.x, m.to.x, p), lerp(m.from.w, m.to.w, p));
        }
      };

      draw(0);
      return tween(SPLIT_MS, (p) => {
        if (!alive(mine)) return;
        draw(p);
      });
    }

    /**
     * 낱개 확정. 왼쪽부터 차례로 번지며 상자가 채워진다.
     *
     * 정적 그리기가 이미 다 채워 두었으므로, 운동은 **아직 번지지 않은 만큼을
     * 뒤로 물리는** 꼴이 된다.
     */
    function flowLeaves(scene: SplitUntilOneScene, mine: number): Promise<void> {
      const targets = settledLeaves(scene)
        .map((g) => frameEls.get(g.id))
        .filter((f): f is FrameEl => f !== undefined);
      if (targets.length === 0) return Promise.resolve();

      const span = Math.max(0.001, 1 - SETTLE_STAGGER * (targets.length - 1));
      const draw = (p: number): void => {
        for (let k = 0; k < targets.length; k += 1) {
          const frame = targets[k];
          if (frame === undefined) continue;
          const lp = clamp01((p - SETTLE_STAGGER * k) / span);
          paintSettled(frame, lp > 0);
          const nudge = Math.sin(lp * Math.PI) * SETTLE_NUDGE;
          frame.g.setAttribute('transform', `translate(0,${nudge})`);
        }
      };

      draw(0);
      return tween(SETTLE_MS * (1 + SETTLE_STAGGER * targets.length), (p) => {
        if (!alive(mine)) return;
        draw(p);
      });
    }

    function flow(
      scene: SplitUntilOneScene,
      mark: SplitUntilOneMark,
      mine: number,
    ): Promise<void> {
      switch (mark.kind) {
        case 'root':
          return flowRoot(scene, mine);
        case 'split':
          return flowSplit(scene, mine);
        case 'leaves':
          return flowLeaves(scene, mine);
      }
    }

    async function render(
      next: SplitUntilOneScene,
      /** 출발 자리를 장면에서 셈하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: SplitUntilOneScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const mark = next.mark;
      if (mark === null) return;
      await flow(next, mark, mine);

      if (!alive(mine)) return;
      // 운동이 남긴 보간 끝자리와 opacity 를 통째로 거둔다. 되돌릴 목록을 손으로
      // 관리하면 반드시 하나를 빠뜨린다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafIds) cancelAnimationFrame(id);
        }
        rafIds.clear();
        // 걸어 둔 프레임을 거두면 그 tick 은 아예 불리지 않으므로, 기다리던
        // promise 를 여기서 직접 깨운다 (S-piece).
        for (const done of [...pending]) done();
        pending.clear();
        frameEls.clear();
        svg.textContent = '';
      },
    };
  },
};
