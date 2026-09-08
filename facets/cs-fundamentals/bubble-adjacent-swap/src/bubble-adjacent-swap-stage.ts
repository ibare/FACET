/**
 * bubble-adjacent-swap-stage — 인접 교환 조각의 전용 view.
 *
 * ── 이 화면이 무엇을 보이려 하는가
 *
 * 동사는 "떠오른다" 다. 그래서 화면에서 실제로 움직이는 것은 둘뿐이다.
 *
 *   1. **값 타일** — 칸(slot)은 제자리에 붙박여 있고 값만 옮겨 다닌다.
 *      맞바꿈은 큰 값이 **위로 떠올라 이웃을 넘어** 한 칸 오른쪽에 내려앉는 것으로
 *      그린다. 멀리 건너뛰는 그림이 아니라 옆칸 하나를 넘는 그림이다.
 *   2. **선두 표시와 그 자취** — 칸 아래를 달리는 삼각 표시. 견줌 한 번마다
 *      **예외 없이 한 칸** 오른쪽으로 간다. 맞바꿈이면 값을 데리고 가고,
 *      그대로 두면 더 큰 이웃에게 자리를 넘긴다. 어느 쪽이든 한 칸이다.
 *      그 뒤로 자취선이 끊기지 않고 이어져, 훑기가 끝나면 왼쪽 끝에서 오른쪽
 *      끝까지 한 줄로 닿아 있다 — "찾는 걸음 없이 도달했다" 의 증거다.
 *
 * 색 전환은 지금 견주는 짝을 표시하는 데만 쓴다. 운동은 전부 위치 변화다 (S-piece).
 *
 * ── 세로
 *
 * 마운트 뒤 `viewBox` 를 다시 재지 않는다 (S-view). 칸 수가 몇이든 가로만 나뉘고
 * 세로는 고정이라, 글 안에 박혀도 위아래 문단이 밀리지 않는다.
 *
 * ── 뒷일
 *
 * 스스로 다음 회차를 예약하는 루프는 없다. 애니메이션 대기용 유한 타이머만
 * 쓰며, `destroy()` 가 그것들을 모두 걷고 대기 중인 약속을 풀어 준다 —
 * 풀지 않으면 러너가 `reset()` 에서 알고리즘 종료를 기다리다 멈춘다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로 고정값. 캡션 두 줄 + 칸 한 줄 + 선두 자취 한 줄. */
const H = 188;

/** 캡션 — 두 줄까지 자리를 잡아 두고 그 안에서 접는다. */
const CAP_Y1 = 20;
const CAP_Y2 = 38;
const CAP_SIDE = 24;

/** 칸이 놓이는 띠. */
const ROW_Y = 84;
const ROW_H = 62;

/** 맞바꿈에서 큰 값이 떠오르는 높이. */
const LIFT = 26;

/** 선두 표시(삼각형)와 그 자취선. */
const MARK_APEX_Y = 154;
const MARK_BASE_Y = 165;
const MARK_HALF = 7;
const TRAIL_Y = 171;

/** 확정된 꼬리 영역. */
const TAIL_Y = 72;
const TAIL_H = 78;

/** 칸 폭은 캔버스에서 역산한다. 상수는 상한만 정한다 (S-piece). */
const CELL_MAX_W = 104;
const SIDE_MIN = 24;
const CELL_GAP = 8;

/** 견주는 짝이 서로 쪽으로 기울어지는 정도. */
const NUDGE = 4;

const MS_COMPARE = 180;
const MS_RISE = 150;
const MS_TRAVEL = 230;
const MS_DROP = 140;
const MS_KEEP = 200;
const MS_SETTLE = 320;

const EASE = 'cubic-bezier(0.3, 0.7, 0.3, 1)';

type TileState = 'default' | 'comparing' | 'moving' | 'settled';

type Tile = {
  group: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  value: number;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * 글자 폭 어림. 브라우저 밖(테스트 DOM)에서는 `getComputedTextLength` 가 0 을
 * 주므로 잴 수 없다. 한글·한자 폭을 1, 라틴 문자를 0.55 로 어림하면 접는
 * 자리를 정하기에는 충분하다.
 */
function estimateWidth(text: string, px: number): number {
  let units = 0;
  for (const ch of text) units += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : 0.55;
  return units * px;
}

/** 공백에서 두 줄까지 접는다. 넘치면 둘째 줄이 그대로 흘러넘친다. */
function wrapTwoLines(text: string, maxWidth: number, px: number): [string, string] {
  if (!text) return ['', ''];
  if (estimateWidth(text, px) <= maxWidth) return [text, ''];
  const words = text.split(' ');
  let first = '';
  let i = 0;
  while (i < words.length) {
    const candidate = first ? `${first} ${words[i]}` : words[i];
    if (first && estimateWidth(candidate, px) > maxWidth) break;
    first = candidate;
    i += 1;
  }
  return [first, words.slice(i).join(' ')];
}

export const bubbleAdjacentSwapStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const root = params.canvas;
    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    root.textContent = '';

    const capPx = Number.parseFloat(fontSizes.md);
    const capMaxW = PIECE_CANVAS_W - CAP_SIDE * 2;

    // ── 자리 잡기. 칸 폭은 캔버스에서 역산하고 상한만 상수로 둔다.
    let count = 0;
    let pitch = CELL_MAX_W;
    let cellW = CELL_MAX_W - CELL_GAP;
    let originX = 0;

    const layout = (n: number): void => {
      count = Math.max(1, n);
      pitch = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / count));
      cellW = pitch - CELL_GAP;
      originX = Math.round((PIECE_CANVAS_W - pitch * count) / 2);
    };

    const slotX = (slot: number): number => originX + slot * pitch + CELL_GAP / 2;
    const slotCx = (slot: number): number => originX + slot * pitch + pitch / 2;

    // ── 레이어. 뒤에서 앞으로: 꼬리 영역 → 칸 → 값 타일 → 선두 → 캡션.
    const tailLayer = svg('g');
    const slotLayer = svg('g');
    const tileLayer = svg('g');
    const leadLayer = svg('g');
    const capLayer = svg('g');
    root.append(tailLayer, slotLayer, tileLayer, leadLayer, capLayer);

    const cap1 = svg('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAP_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const cap2 = svg('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAP_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    capLayer.append(cap1, cap2);

    // ── 시간. 스스로 도는 루프는 없고 애니메이션 대기 타이머만 있다.
    let destroyed = false;
    const releases = new Set<() => void>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        let timer: ReturnType<typeof setTimeout>;
        const release = (): void => {
          clearTimeout(timer);
          releases.delete(release);
          resolve();
        };
        timer = setTimeout(release, ms);
        releases.add(release);
      });

    const nextFrame = (): Promise<void> =>
      typeof requestAnimationFrame === 'function'
        ? new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        : Promise.resolve();

    const glide = async (el: SVGGElement, transform: string, ms: number): Promise<void> => {
      if (destroyed) return;
      await nextFrame();
      if (destroyed) return;
      el.style.transition = `transform ${ms}ms ${EASE}`;
      el.setAttribute('transform', transform);
      await wait(ms);
      el.style.transition = '';
    };

    // ── 상태.
    /** 칸 번호 → 그 칸에 놓인 값 타일. 맞바꿈마다 자리를 맞바꿔 넣는다. */
    let tiles: Tile[] = [];
    let trail: SVGLineElement | null = null;
    let marker: SVGGElement | null = null;
    let tail: SVGGElement | null = null;

    const tilePose = (slot: number, dx = 0, dy = 0): string =>
      `translate(${slot * pitch + dx}, ${dy})`;

    const paint = (tile: Tile, state: TileState): void => {
      const fill =
        state === 'comparing'
          ? colors.itemComparing
          : state === 'moving'
            ? colors.itemSwapping
            : state === 'settled'
              ? colors.itemSorted
              : colors.itemDefault;
      const ink =
        state === 'comparing' || state === 'moving'
          ? colors.stateInk
          : state === 'settled'
            ? colors.textInverse
            : colors.text;
      tile.rect.setAttribute('fill', fill);
      tile.rect.setAttribute('stroke', state === 'default' ? colors.border : fill);
      tile.label.setAttribute('fill', ink);
    };

    const buildTile = (value: number, slot: number): Tile => {
      const group = svg('g', { transform: tilePose(slot) });
      const rect = svg('rect', {
        x: slotX(0),
        y: ROW_Y,
        width: cellW,
        height: ROW_H,
        rx: 6,
        'stroke-width': 1.5,
      });
      const label = svg('text', {
        x: slotCx(0),
        y: ROW_Y + ROW_H / 2 + 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': '600',
      });
      label.textContent = String(value);
      group.append(rect, label);
      tileLayer.append(group);
      const tile: Tile = { group, rect, label, value };
      paint(tile, 'default');
      return tile;
    };

    const build = (values: number[]): void => {
      layout(values.length);
      tailLayer.textContent = '';
      slotLayer.textContent = '';
      tileLayer.textContent = '';
      leadLayer.textContent = '';

      // 붙박인 칸. 값이 오가도 이것은 움직이지 않는다.
      for (let i = 0; i < values.length; i++) {
        slotLayer.append(
          svg('rect', {
            x: slotX(i),
            y: ROW_Y,
            width: cellW,
            height: ROW_H,
            rx: 6,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
      }

      tiles = values.map((v, i) => buildTile(v, i));
      trail = null;
      marker = null;
      tail = null;
      if (values.length < 2) return;

      // 확정될 꼬리 자리. 훑기가 끝날 때 위에서 내려온다.
      const divider = originX + (values.length - 1) * pitch;
      tail = svg('g', { transform: 'translate(0, -24)', opacity: 0 });
      tail.append(
        svg('rect', {
          x: divider,
          y: TAIL_Y,
          width: pitch,
          height: TAIL_H,
          rx: 8,
          fill: colors.sortedTailBg,
        }),
        svg('line', {
          x1: divider,
          y1: TAIL_Y,
          x2: divider,
          y2: TAIL_Y + TAIL_H,
          stroke: colors.sortedTailBorder,
          'stroke-width': 1.5,
        }),
      );
      tailLayer.append(tail);

      // 선두의 자취. 왼쪽 끝에서 오른쪽 끝까지 한 줄, 처음에는 감춰 두고
      // 견줌 한 번마다 한 칸씩 드러낸다.
      const span = (values.length - 1) * pitch;
      trail = svg('line', {
        x1: slotCx(0),
        y1: TRAIL_Y,
        x2: slotCx(0) + span,
        y2: TRAIL_Y,
        stroke: colors.risingMarker,
        'stroke-width': 4,
        'stroke-linecap': 'round',
        'stroke-dasharray': Math.max(1, span),
        'stroke-dashoffset': Math.max(1, span),
      });
      marker = svg('g', { transform: 'translate(0, 0)' });
      marker.append(
        svg('path', {
          d: `M ${slotCx(0)} ${MARK_APEX_Y} L ${slotCx(0) - MARK_HALF} ${MARK_BASE_Y} L ${slotCx(0) + MARK_HALF} ${MARK_BASE_Y} Z`,
          fill: colors.risingMarker,
        }),
      );
      leadLayer.append(trail, marker);
    };

    /** 선두를 한 칸 옮기고 자취를 그만큼 잇는다. */
    const advanceLead = async (slot: number, ms: number): Promise<void> => {
      const span = (count - 1) * pitch;
      const offset = Math.max(0, span - slot * pitch);
      const moves: Promise<void>[] = [];
      if (marker) moves.push(glide(marker, `translate(${slot * pitch}, 0)`, ms));
      if (trail) {
        const line = trail;
        moves.push(
          (async () => {
            if (destroyed) return;
            await nextFrame();
            if (destroyed) return;
            line.style.transition = `stroke-dashoffset ${ms}ms linear`;
            line.setAttribute('stroke-dashoffset', String(offset));
            await wait(ms);
            line.style.transition = '';
          })(),
        );
      }
      await Promise.all(moves);
    };

    const resetPaint = (settledFrom: number): void => {
      tiles.forEach((tile, slot) => paint(tile, slot >= settledFrom ? 'settled' : 'default'));
    };

    let settledFrom = Number.POSITIVE_INFINITY;

    const seed = params.initialData?.values;
    build(Array.isArray(seed) ? seed.filter((v): v is number => typeof v === 'number') : []);

    return {
      /** 처음 배치를 세운다. 러너의 onInit / onReset 에서 온다. */
      init(values: number[]): void {
        settledFrom = Number.POSITIVE_INFINITY;
        build(values);
        cap1.textContent = '';
        cap2.textContent = '';
      },

      /** 되감기 — 애니메이션 없이 처음 배치로 돌아간다. */
      rewind(values: number[]): void {
        settledFrom = Number.POSITIVE_INFINITY;
        build(values);
        cap1.textContent = '';
        cap2.textContent = '';
      },

      setCaption(text: string): void {
        const [a, b] = wrapTwoLines(text, capMaxW, capPx);
        cap1.textContent = a;
        cap2.textContent = b;
      },

      /** 나란한 두 칸이 서로 쪽으로 기울며 견줌이 시작된다. */
      async showCompare(p: { left: number; right: number }): Promise<void> {
        const left = tiles[p.left];
        const right = tiles[p.right];
        if (!left || !right) return;
        resetPaint(settledFrom);
        paint(left, 'comparing');
        paint(right, 'comparing');
        await Promise.all([
          glide(left.group, tilePose(p.left, NUDGE), MS_COMPARE),
          glide(right.group, tilePose(p.right, -NUDGE), MS_COMPARE),
        ]);
      },

      /**
       * 왼쪽이 더 컸다 — 그 값이 떠올라 이웃을 넘어 한 칸 오른쪽에 내려앉는다.
       * 선두는 값과 함께 간다.
       */
      async carry(p: { left: number; right: number }): Promise<void> {
        const rising = tiles[p.left];
        const sliding = tiles[p.right];
        if (!rising || !sliding) return;

        paint(rising, 'moving');
        tileLayer.append(rising.group); // 넘어가는 쪽이 위로 그려져야 한다.

        await glide(rising.group, tilePose(p.left, NUDGE, -LIFT), MS_RISE);
        await Promise.all([
          glide(rising.group, tilePose(p.right, 0, -LIFT), MS_TRAVEL),
          glide(sliding.group, tilePose(p.left, 0), MS_TRAVEL),
          advanceLead(p.right, MS_TRAVEL),
        ]);
        await glide(rising.group, tilePose(p.right, 0), MS_DROP);

        tiles[p.left] = sliding;
        tiles[p.right] = rising;
        resetPaint(settledFrom);
      },

      /**
       * 오른쪽이 이미 컸다 — 값은 하나도 옮기지 않고 선두만 한 칸 넘어간다.
       * 값이 움직이지 않는데도 선두는 나아간다는 것이 이 걸음의 요점이다.
       */
      async handOver(p: { left: number; right: number }): Promise<void> {
        const left = tiles[p.left];
        const right = tiles[p.right];
        if (!left || !right) return;
        await Promise.all([
          glide(left.group, tilePose(p.left, 0), MS_KEEP),
          glide(right.group, tilePose(p.right, 0), MS_KEEP),
          advanceLead(p.right, MS_KEEP),
        ]);
        resetPaint(settledFrom);
      },

      /** 한 번 훑었다 — 오른쪽 끝 한 자리가 확정된다. */
      async settle(p: { index: number }): Promise<void> {
        settledFrom = p.index;
        resetPaint(settledFrom);
        const zone = tail;
        if (!zone || destroyed) return;
        await nextFrame();
        if (destroyed) return;
        zone.style.transition = `transform ${MS_SETTLE}ms ${EASE}, opacity ${MS_SETTLE}ms ease-out`;
        zone.setAttribute('opacity', '1');
        zone.setAttribute('transform', 'translate(0, 0)');
        await wait(MS_SETTLE);
        zone.style.transition = '';
      },

      destroy(): void {
        destroyed = true;
        for (const release of [...releases]) release();
        releases.clear();
        // 캔버스 안쪽만 비운다. 컨테이너와 캔버스 자체는 러너 소유다 (S-view).
        root.textContent = '';
      },
    };
  },
};
