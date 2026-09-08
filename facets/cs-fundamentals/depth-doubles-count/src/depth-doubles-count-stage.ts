/**
 * depth-doubles-count 전용 stage view.
 *
 * ── 이 그림이 무엇을 하려 하는가
 *
 * 동사는 "배로 벌어진다" 다. 그래서 **자리의 크기와 간격을 층마다 고정** 하고,
 * 한 층 내려갈 때 자리마다 둘로 갈라지게 한다. 자리의 중심은 가운데로부터의
 * 거리가 두 배가 되면서 좌우로 반 칸씩 갈라지므로 (`cx' = C + 2(cx - C) ± P/2`),
 * 걸음마다 줄 전체가 바깥으로 쏟아져 나간다.
 *
 * 축척을 줄이지 않는 것이 요점이다. 4층(16자리) 까지는 줄이 화면에 온전히
 * 들어오고, 그 아래부터는 **화면 밖으로 넘쳐 나간다.** 잘리는 것이 곧 논증이다 —
 * 층은 하나씩 느는데 자리는 곱으로 늘어서 몇 층 만에 담을 수 없게 된다.
 * 자리 수는 오른쪽 눈금이 계속 말해 주므로 화면이 거짓을 말하지 않는다.
 *
 * ── 움직임
 *
 * 새 자리는 어미 자리의 위치에서 태어나 제 자리로 미끄러지고 (transform),
 * 어미와 잇는 선은 어미 쪽에서부터 그려진다 (stroke-dashoffset). 애니메이션은
 * 걸음 간격보다 짧게 잡아 다음 걸음과 겹치지 않게 하고, 메서드는 DOM 반영이
 * 끝난 시점에 resolve 한다 — 전이가 끝날 때까지 기다리면 걸음 간격이 두 배가 된다.
 */

import { PIECE_CANVAS_W, fontSizes, fonts, getColors } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로 골격. 캔버스 폭에서 역산하고 상수는 상한만 둔다.
const W = PIECE_CANVAS_W;
/** 층 번호가 서는 왼쪽 여백. */
const LEFT_GUTTER = 34;
/** 자리 수 · 합 괄호가 서는 오른쪽 여백. */
const RIGHT_GUTTER = 96;
const BAND_X0 = LEFT_GUTTER;
const BAND_X1 = W - RIGHT_GUTTER;
const BAND_W = BAND_X1 - BAND_X0;
const BAND_CX = BAND_X0 + BAND_W / 2;

const DEPTH_X = LEFT_GUTTER - 10;
const COUNT_X = BAND_X1 + 28;
const BRACE_X = W - 58;
const BRACE_ARM = 5;
const TOTAL_X = W - 4;

/** 자리 하나가 차지하는 칸. 4층(16자리) 이 띠를 거의 채우도록 역산한다. */
const SLOT_PITCH_MAX = 34;
const SLOT_PITCH = Math.min(SLOT_PITCH_MAX, Math.floor(BAND_W / 17));
const SLOT_GAP = 8;
const SLOT_W = SLOT_PITCH - SLOT_GAP;
const SLOT_H = 12;
const SLOT_RX = 3;

// ── 세로 골격.
const HEADER_Y = 16;
const ROW0_CY = 40;
const ROW_PITCH = 30;
const CAPTION_GAP = 36;
const BOTTOM_PAD = 20;

/** initialData 가 없을 때의 기본 깊이. 캔버스 높이의 초기값도 여기서 나온다. */
const DEFAULT_MAX_DEPTH = 9;
const DEFAULT_STEP_MS = 700;

const SETTLE_MS = 240;
const BRACE_MS = 420;

/** 화면에 새겨진 도식 라벨. 번역하면 눈금과 어긋난다 (C10 표식). */
const HEADER_DEPTH = 'depth';
const HEADER_SLOTS = 'slots';

/** clip-path id 가 한 문서에서 겹치지 않게 한다 (한 글에 조각이 여럿 박힌다). */
let instanceSeq = 0;

const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  }
  return node;
};

/** 브라우저가 초기 위치를 한 번 반영한 뒤에 전이를 켜야 미끄러짐이 보인다. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
      return;
    }
    setTimeout(() => resolve(), 0);
  });

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number => {
  const raw = source?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
};

/** projector 가 좁혀서 넘기는 한 층의 사실 (C9). */
export type DepthRow = {
  depth: number;
  count: number;
  total: number;
};

type Slot = { cx: number; rect: SVGRectElement };

export const depthDoublesCountStageView: CanvasView = {
  canvas: { height: ROW0_CY + ROW_PITCH * DEFAULT_MAX_DEPTH + CAPTION_GAP + BOTTOM_PAD },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const svg = params.canvas;

    const maxDepth = Math.max(1, Math.trunc(readNumber(params.initialData, 'maxDepth', DEFAULT_MAX_DEPTH)));
    const stepMs = readNumber(params.initialData, 'stepMs', DEFAULT_STEP_MS);
    const animMs = Math.max(180, Math.min(560, Math.round(stepMs * 0.7)));

    const rowCy = (depth: number): number => ROW0_CY + ROW_PITCH * depth;
    const captionY = rowCy(maxDepth) + CAPTION_GAP;
    const height = captionY + BOTTOM_PAD;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

    const clipId = `ddc-band-${(instanceSeq += 1)}`;
    const defs = svgEl('defs');
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('rect', { x: BAND_X0, y: 0, width: BAND_W, height }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    /** 눈금 — 층 번호와 자리 수. 띠 바깥이라 잘리지 않는다. */
    const gutterGroup = svgEl('g');
    /** 자리와 이음선. 넘치는 것은 여기서 잘린다. */
    const bandGroup = svgEl('g', { 'clip-path': `url(#${clipId})` });
    /** 마지막에 모든 층을 하나로 묶는 괄호. */
    const braceGroup = svgEl('g');
    svg.appendChild(gutterGroup);
    svg.appendChild(bandGroup);
    svg.appendChild(braceGroup);

    const label = (
      x: number,
      y: number,
      anchor: 'start' | 'middle' | 'end',
      size: string,
      family: string,
      fill: string,
    ): SVGTextElement =>
      svgEl('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': family,
        'font-size': size,
        fill,
      });

    const headerDepth = label(2, HEADER_Y, 'start', fontSizes.xs, fonts.body, colors.textMuted);
    headerDepth.textContent = HEADER_DEPTH;
    const headerSlots = label(COUNT_X, HEADER_Y, 'end', fontSizes.xs, fonts.body, colors.textMuted);
    headerSlots.textContent = HEADER_SLOTS;
    svg.appendChild(headerDepth);
    svg.appendChild(headerSlots);

    const caption = label(W / 2, captionY, 'middle', fontSizes.md, fonts.body, colors.textMuted);
    svg.appendChild(caption);

    let current: Slot[] = [];
    let liveCount: SVGTextElement | null = null;
    let disposed = false;

    const clearGroup = (group: SVGGElement): void => {
      while (group.firstChild) group.removeChild(group.firstChild);
    };

    const makeSlot = (cx: number, cy: number): SVGRectElement =>
      svgEl('rect', {
        x: cx - SLOT_W / 2,
        y: cy - SLOT_H / 2,
        width: SLOT_W,
        height: SLOT_H,
        rx: SLOT_RX,
        fill: colors.itemActive,
      });

    const makeEdge = (fromCx: number, fromCy: number, toCx: number, toCy: number): SVGLineElement =>
      svgEl('line', {
        x1: fromCx,
        y1: fromCy,
        x2: toCx,
        y2: toCy,
        stroke: colors.textMuted,
        'stroke-width': 1,
      });

    /** 층 눈금 두 짝을 만든다 — 왼쪽 층 번호, 오른쪽 자리 수. */
    const makeGutter = (row: DepthRow): SVGTextElement[] => {
      const depthText = label(
        DEPTH_X,
        rowCy(row.depth) + 4,
        'end',
        fontSizes.sm,
        fonts.mono,
        colors.textMuted,
      );
      depthText.textContent = String(row.depth);
      const countText = label(
        COUNT_X,
        rowCy(row.depth) + 4,
        'end',
        fontSizes.sm,
        fonts.mono,
        colors.text,
      );
      countText.textContent = String(row.count);
      gutterGroup.appendChild(depthText);
      gutterGroup.appendChild(countText);
      if (liveCount) liveCount.setAttribute('fill', colors.textMuted);
      liveCount = countText;
      return [depthText, countText];
    };

    /**
     * 태어난 자리에서 제 자리로 미끄러지게 한다. 어미 위치에서 시작해
     * 한 층 위에서 내려온다.
     */
    const slideIn = async (
      movers: { node: SVGElement; dx: number; dy: number }[],
      drawers: { node: SVGElement; length: number }[],
    ): Promise<void> => {
      for (const m of movers) {
        m.node.style.transition = 'none';
        m.node.style.transform = `translate(${m.dx}px, ${m.dy}px)`;
      }
      for (const d of drawers) {
        d.node.style.transition = 'none';
        d.node.style.strokeDasharray = `${d.length}`;
        d.node.style.strokeDashoffset = `${d.length}`;
      }
      await nextFrame();
      if (disposed) return;
      for (const m of movers) {
        m.node.style.transition = `transform ${animMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
        m.node.style.transform = 'translate(0px, 0px)';
      }
      for (const d of drawers) {
        d.node.style.transition = `stroke-dashoffset ${animMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
        d.node.style.strokeDashoffset = '0';
      }
    };

    /** 지난 층은 가라앉는다 — 지금 벌어지는 층만 살아 있는 색이다. */
    const settle = (slots: Slot[]): void => {
      for (const slot of slots) {
        slot.rect.style.transition = `fill ${SETTLE_MS}ms linear`;
        slot.rect.setAttribute('fill', colors.itemSorted);
      }
    };

    /** 띠 밖으로 완전히 나간 자리는 더 그릴 것이 없다. */
    const inBand = (cx: number): boolean =>
      cx >= BAND_X0 - SLOT_PITCH && cx <= BAND_X1 + SLOT_PITCH;

    const reset = (): void => {
      clearGroup(gutterGroup);
      clearGroup(bandGroup);
      clearGroup(braceGroup);
      current = [];
      liveCount = null;
      caption.textContent = '';
    };

    return {
      /** 0층 — 자리 하나가 위에서 내려온다. */
      async showRoot(row: DepthRow, text: string): Promise<void> {
        if (disposed) return;
        reset();
        const rect = makeSlot(BAND_CX, rowCy(0));
        bandGroup.appendChild(rect);
        current = [{ cx: BAND_CX, rect }];
        caption.textContent = text;
        const gutter = makeGutter(row);
        await slideIn(
          [
            { node: rect, dx: 0, dy: -ROW_PITCH },
            ...gutter.map((node) => ({ node, dx: 0, dy: -ROW_PITCH })),
          ],
          [],
        );
      },

      /** 한 층 내려간다 — 자리마다 둘로 갈라지고 줄 전체가 바깥으로 벌어진다. */
      async splitInto(row: DepthRow, text: string): Promise<void> {
        if (disposed) return;
        for (const slot of current) {
          if (!inBand(slot.cx)) slot.rect.remove();
        }
        const parents = current.filter((slot) => inBand(slot.cx));
        settle(parents);

        const cy = rowCy(row.depth);
        const parentCy = rowCy(row.depth - 1);
        const next: Slot[] = [];
        const movers: { node: SVGElement; dx: number; dy: number }[] = [];
        const drawers: { node: SVGElement; length: number }[] = [];

        for (const parent of parents) {
          const spread = BAND_CX + 2 * (parent.cx - BAND_CX);
          for (const cx of [spread - SLOT_PITCH / 2, spread + SLOT_PITCH / 2]) {
            const rect = makeSlot(cx, cy);
            const edge = makeEdge(parent.cx, parentCy + SLOT_H / 2, cx, cy - SLOT_H / 2);
            bandGroup.appendChild(edge);
            bandGroup.appendChild(rect);
            next.push({ cx, rect });
            movers.push({ node: rect, dx: parent.cx - cx, dy: -ROW_PITCH });
            drawers.push({
              node: edge,
              length: Math.hypot(cx - parent.cx, ROW_PITCH - SLOT_H),
            });
          }
        }

        current = next;
        caption.textContent = text;
        const gutter = makeGutter(row);
        movers.push(...gutter.map((node) => ({ node, dx: 0, dy: -ROW_PITCH })));
        await slideIn(movers, drawers);
      },

      /** 모든 층을 하나로 묶는다 — 괄호가 위에서 아래로 그어지며 합이 선다. */
      async gatherTotal(row: DepthRow, text: string): Promise<void> {
        if (disposed) return;
        settle(current);
        if (liveCount) liveCount.setAttribute('fill', colors.textMuted);

        const top = rowCy(0) - SLOT_H / 2 - 4;
        const bottom = rowCy(row.depth) + SLOT_H / 2 + 4;
        const mid = (top + bottom) / 2;
        const brace = svgEl('path', {
          d:
            `M ${BRACE_X - BRACE_ARM} ${top} H ${BRACE_X} V ${mid - BRACE_ARM} ` +
            `L ${BRACE_X + BRACE_ARM} ${mid} L ${BRACE_X} ${mid + BRACE_ARM} ` +
            `V ${bottom} H ${BRACE_X - BRACE_ARM}`,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        });
        const totalText = label(TOTAL_X, mid + 5, 'end', fontSizes.md, fonts.mono, colors.text);
        totalText.textContent = String(row.total);
        braceGroup.appendChild(brace);
        braceGroup.appendChild(totalText);

        const braceLen = bottom - top + BRACE_ARM * 6;
        brace.style.transition = 'none';
        brace.style.strokeDasharray = `${braceLen}`;
        brace.style.strokeDashoffset = `${braceLen}`;
        totalText.style.transition = 'none';
        totalText.style.transform = `translate(${BRACE_ARM * 3}px, 0px)`;
        totalText.style.opacity = '0';
        await nextFrame();
        if (disposed) return;
        brace.style.transition = `stroke-dashoffset ${BRACE_MS}ms ease-out`;
        brace.style.strokeDashoffset = '0';
        totalText.style.transition = `transform ${BRACE_MS}ms ease-out, opacity ${BRACE_MS}ms ease-out`;
        totalText.style.transform = 'translate(0px, 0px)';
        totalText.style.opacity = '1';
        caption.textContent = text;
      },

      /** 처음으로 되돌린다. */
      rewind(): void {
        if (disposed) return;
        reset();
      },

      destroy(): void {
        disposed = true;
        reset();
        for (const node of [defs, gutterGroup, bandGroup, braceGroup, headerDepth, headerSlots, caption]) {
          node.remove();
        }
      },
    };
  },
};
