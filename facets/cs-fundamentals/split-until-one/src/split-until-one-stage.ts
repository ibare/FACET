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
 * 세로는 마운트 뒤 바뀌지 않는다. 층이 깊어지면 층 간격과 상자 높이를 줄여
 * 담는다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 마운트 뒤 바뀌지 않는다 (S-view). */
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
const SETTLE_MS = 360;
/** 낱개가 확정될 때 왼쪽부터 차례로 번지는 정도 (전체 진행 대비 비율). */
const SETTLE_STAGGER = 0.12;
const SETTLE_NUDGE = 4;

export type SplitFrameSpec = {
  id: string;
  lo: number;
  hi: number;
  depth: number;
};

export type SplitTearSpec = {
  parentLo: number;
  parentHi: number;
  parentDepth: number;
  cutAfter: number;
  leftId: string;
  leftLo: number;
  leftHi: number;
  rightId: string;
  rightLo: number;
  rightHi: number;
};

type Frame = {
  group: SVGGElement;
  rect: SVGRectElement;
  dots: SVGCircleElement[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
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

function readValues(initialData: Record<string, unknown> | undefined): number[] {
  const raw = initialData?.values;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number');
}

export const splitUntilOneStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가
    // 먼저 붙여 둔 이 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    const values = readValues(params.initialData);
    const n = Math.max(1, values.length);

    // ── 가로: 칸 폭을 캔버스에서 역산한다.
    const colW = Math.min(COL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / n));
    const originX = Math.round((PIECE_CANVAS_W - n * colW) / 2);
    const colCenter = (i: number): number => originX + colW * i + colW / 2;
    const frameLeft = (lo: number): number => originX + lo * colW + FRAME_INSET;
    const frameRight = (hi: number): number => originX + (hi + 1) * colW - FRAME_INSET;
    /** 칸 `i` 의 오른쪽 경계 — 가름이 일어나는 자리. */
    const cutX = (i: number): number => originX + (i + 1) * colW;

    // ── 세로: 층 수만큼 자리를 나눈다. 깊어지면 간격을 줄여 담는다.
    const layerCount = Math.max(1, Math.ceil(Math.log2(n)) + 1);
    const bandSpace = H - CAPTION_BAND - BANDS_TOP;
    const bandH = Math.max(
      BAND_H_MIN,
      Math.min(BAND_H_MAX, Math.floor((bandSpace - BAND_GAP * (layerCount - 1)) / layerCount)),
    );
    const bandStride = bandH + BAND_GAP;
    const bandsHeight = bandH * layerCount + BAND_GAP * (layerCount - 1);
    const bandsStart = BANDS_TOP + Math.max(0, Math.floor((bandSpace - bandsHeight) / 2));
    const bandY = (depth: number): number => bandsStart + depth * bandStride;
    const bandMid = (depth: number): number => bandY(depth) + bandH / 2;
    const railBottom = bandsStart + bandsHeight + RAIL_TAIL;

    // ── 정지 요소: 값 숫자와 레일. 이 둘은 재생 내내 한 번도 움직이지 않는다.
    const gStatic = el('g', {});
    for (let i = 0; i < n; i += 1) {
      const cx = colCenter(i);
      const label = el('text', {
        x: cx,
        y: VALUE_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': 20,
        'font-weight': 600,
        fill: c.text,
      });
      label.textContent = String(values[i] ?? '');
      gStatic.appendChild(label);
      gStatic.appendChild(
        el('line', {
          x1: cx,
          y1: RAIL_TOP,
          x2: cx,
          y2: railBottom,
          stroke: c.border,
          'stroke-width': 1.5,
        }),
      );
    }
    svg.appendChild(gStatic);

    // 상자는 레일 뒤에 깔린다 — 레일이 모든 층을 관통하는 것으로 보여야 한다.
    const gFrames = el('g', {});
    svg.insertBefore(gFrames, gStatic);

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_BASELINE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      // SVG 속성이라 숫자로 준다 (core views 와 같은 관행). 값은 fontSizes 눈금.
      'font-size': 12,
      fill: c.textMuted,
    });
    svg.appendChild(caption);

    const frames = new Map<string, Frame>();

    // ── 애니메이션. destroy 뒤에 살아남는 프레임 예약이 없도록 id 를 들고 있는다.
    let destroyed = false;
    const rafIds = new Set<number>();

    function tween(durationMs: number, onFrame: (p: number) => void): Promise<void> {
      onFrame(0);
      if (destroyed || durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
        onFrame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const stepFrame = (): void => {
          if (destroyed) {
            onFrame(1);
            resolve();
            return;
          }
          const raw = clamp01((Date.now() - startedAt) / durationMs);
          onFrame(easeInOut(raw));
          if (raw >= 1) {
            resolve();
            return;
          }
          const next = requestAnimationFrame(() => {
            rafIds.delete(next);
            stepFrame();
          });
          rafIds.add(next);
        };
        const first = requestAnimationFrame(() => {
          rafIds.delete(first);
          stepFrame();
        });
        rafIds.add(first);
      });
    }

    function makeFrame(spec: SplitFrameSpec): Frame {
      const group = el('g', { transform: 'translate(0,0)' });
      const rect = el('rect', {
        x: frameLeft(spec.lo),
        y: bandY(spec.depth),
        width: Math.max(0, frameRight(spec.hi) - frameLeft(spec.lo)),
        height: bandH,
        rx: FRAME_RADIUS,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      group.appendChild(rect);
      const dots: SVGCircleElement[] = [];
      for (let i = spec.lo; i <= spec.hi; i += 1) {
        const dot = el('circle', {
          cx: colCenter(i),
          cy: bandMid(spec.depth),
          r: DOT_R,
          fill: c.text,
        });
        group.appendChild(dot);
        dots.push(dot);
      }
      gFrames.appendChild(group);
      const frame: Frame = { group, rect, dots };
      frames.set(spec.id, frame);
      return frame;
    }

    function setRectSpan(frame: Frame, x: number, w: number): void {
      frame.rect.setAttribute('x', String(x));
      frame.rect.setAttribute('width', String(Math.max(0, w)));
    }

    return {
      /**
       * 맨 위 묶음이 생긴다. 상자가 가운데에서 좌우로 벌어지며 네 자리를 품고,
       * 상자가 지나간 자리의 점이 켜진다.
       */
      showRoot(spec: SplitFrameSpec): Promise<void> {
        const frame = makeFrame(spec);
        const x1 = frameLeft(spec.lo);
        const x2 = frameRight(spec.hi);
        const mid = (x1 + x2) / 2;
        for (const dot of frame.dots) dot.setAttribute('opacity', '0');
        return tween(ROOT_MS, (p) => {
          const x = lerp(mid, x1, p);
          const w = lerp(0, x2 - x1, p);
          setRectSpan(frame, x, w);
          for (let k = 0; k < frame.dots.length; k += 1) {
            const cx = colCenter(spec.lo + k);
            const covered = cx >= x && cx <= x + w;
            frame.dots[k]?.setAttribute('opacity', covered ? '1' : '0');
          }
        });
      },

      /**
       * 한 묶음이 둘로 갈라진다.
       *
       * 부모와 똑같은 상자 둘이 부모 자리에서 출발해 한 층 아래로 내려가고,
       * 내려가는 동안 가른 자리에서 안쪽 모서리가 서로 물러난다. 바깥 모서리는
       * 처음 자리 그대로다 — 어떤 것도 좌우로 옮겨가지 않는다.
       */
      split(spec: SplitTearSpec): Promise<void> {
        const childDepth = spec.parentDepth + 1;
        const px1 = frameLeft(spec.parentLo);
        const px2 = frameRight(spec.parentHi);
        const cut = cutX(spec.cutAfter);

        const left = makeFrame({
          id: spec.leftId,
          lo: spec.leftLo,
          hi: spec.leftHi,
          depth: childDepth,
        });
        const right = makeFrame({
          id: spec.rightId,
          lo: spec.rightLo,
          hi: spec.rightHi,
          depth: childDepth,
        });
        for (const f of [left, right]) f.rect.setAttribute('stroke', c.itemActive);
        for (const f of [left, right]) f.rect.setAttribute('stroke-width', '2');

        const leftStart = { x: px1, w: cut - px1 };
        const leftEnd = { x: frameLeft(spec.leftLo), w: frameRight(spec.leftHi) - frameLeft(spec.leftLo) };
        const rightStart = { x: cut, w: px2 - cut };
        const rightEnd = {
          x: frameLeft(spec.rightLo),
          w: frameRight(spec.rightHi) - frameLeft(spec.rightLo),
        };

        return tween(SPLIT_MS, (p) => {
          const dy = -bandStride * (1 - p);
          left.group.setAttribute('transform', `translate(0,${dy})`);
          right.group.setAttribute('transform', `translate(0,${dy})`);
          setRectSpan(left, lerp(leftStart.x, leftEnd.x, p), lerp(leftStart.w, leftEnd.w, p));
          setRectSpan(right, lerp(rightStart.x, rightEnd.x, p), lerp(rightStart.w, rightEnd.w, p));
          if (p >= 1) {
            for (const f of [left, right]) {
              f.rect.setAttribute('stroke', c.border);
              f.rect.setAttribute('stroke-width', '1.5');
            }
          }
        });
      },

      /**
       * 낱개 확정. 왼쪽부터 차례로 번지며 상자가 채워진다.
       *
       * 채워진 타일 위의 잉크는 `textInverse` 다 — 타일이 테마를 따라 뒤집히므로
       * 잉크도 뒤집는다 (design-tokens 의 타일/잉크 표).
       */
      settleLeaves(ids: string[]): Promise<void> {
        const targets = ids
          .map((id) => frames.get(id))
          .filter((f): f is Frame => f !== undefined);
        if (targets.length === 0) return Promise.resolve();
        const span = Math.max(0.001, 1 - SETTLE_STAGGER * (targets.length - 1));
        return tween(SETTLE_MS + SETTLE_STAGGER * SETTLE_MS * targets.length, (p) => {
          for (let k = 0; k < targets.length; k += 1) {
            const f = targets[k];
            if (!f) continue;
            const lp = clamp01((p - SETTLE_STAGGER * k) / span);
            if (lp > 0) {
              f.rect.setAttribute('fill', c.itemSorted);
              f.rect.setAttribute('stroke', c.itemSorted);
              for (const dot of f.dots) dot.setAttribute('fill', c.textInverse);
            }
            const nudge = Math.sin(lp * Math.PI) * SETTLE_NUDGE;
            f.group.setAttribute('transform', `translate(0,${nudge})`);
          }
        });
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 처음으로 되감는다. 값과 레일은 그대로 두고 묶음만 걷어낸다. */
      rewind(): void {
        frames.clear();
        gFrames.textContent = '';
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafIds) cancelAnimationFrame(id);
        }
        rafIds.clear();
        frames.clear();
        svg.textContent = '';
        // 타이머는 하나도 두지 않았다 — 이 view 가 예약하는 것은 rAF 뿐이고
        // 위에서 전부 취소한다 (S-view).
      },
    };
  },
};
