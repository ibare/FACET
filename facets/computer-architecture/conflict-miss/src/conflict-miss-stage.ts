/**
 * conflict-miss stage view — 충돌 실패를 그리는 전용 캔버스.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사는 **밀어낸다** 이다. 하나가 들어올 때마다 다른 하나가 쫓겨난다. 그래서
 * 캐시의 줄을 가로로 눕히지 않고 **세로 기둥 넷**으로 세웠다.
 *
 *   - 들어오는 주소는 위에서 대기하다가 **가로로 미끄러져** 자기 인덱스의
 *     기둥 위로 간다. 여섯 번 모두 같은 기둥으로 간다 — 그 반복이 논증이다.
 *   - 그 다음 **아래로 내려앉으면서**, 살던 것을 기둥 **아래로 밀어낸다.**
 *     둘이 같은 방향으로 함께 움직이므로 밀려나는 것으로 읽힌다.
 *   - 나머지 기둥 셋은 처음부터 끝까지 점선인 채로 **내내 비어 있다.** 바로
 *     그 곁에 "빈 줄" 셈을 놓아, 자리가 모자란 것이 아님을 같은 눈길에 담는다.
 *
 * 밀려난 것은 사라지지 않고 기둥 아래에 조각으로 쌓인다. 태그가 0 · 1 · 0 · 1 …
 * 로 번갈아 찍히는 것이 곧 서로 밀어내고 있다는 증거다.
 *
 * ── 자리
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않는다. 세로만 이 파일이
 * 상수로 갖고, 마운트한 뒤로는 바꾸지 않는다 (S-view). 기둥 너비는 캔버스에서
 * 역산하고 상수로는 상한만 둔다 (S-piece: 그 폭을 채운다).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

/** 세로. 내용이 정하는 값이라 그림 곁에 둔다. */
const H = 272;

const W = PIECE_CANVAS_W;

// ── 가로 배치 (기둥 너비는 캔버스에서 역산하고 상수는 상한만)
const COL_MAX_W = 124;
const SIDE_MIN = 26;
const COL_GAP = 14;

// ── 세로 배치
const WAIT_Y = 14; // 들어오는 타일이 기다리는 높이
const TILE_H = 34;
const FRAME_Y = 74;
const FRAME_H = 94;
const HEAD_BASELINE = 92; // 인덱스 숫자
const SLOT_Y = 100;
const SLOT_H = 50;
const SEATED_Y = 108; // 줄에 앉은 타일의 높이
const EXIT_Y = 190; // 밀려난 타일이 프레임 밖으로 빠지는 높이
const BRACE_TOP = 172;
const BRACE_Y = 181;
const CHIP_Y = 182;
const CHIP_H = 20;
const EMPTY_BASELINE = 199;
const PUSHED_BASELINE = 218;
const CAPTION_BASELINE = 250;

// ── 걸음의 길이. 걸음 벽시계 = 이 둘의 합 + stepMs (S-piece).
const ROUTE_MS = 260;
const DROP_MS = 380;

/** 도형에 새겨진 판정 글리프 — 번역하지 않는다 (C10 표식). */
const STAMP_MISS = 'MISS';
const STAMP_HIT = 'HIT';
/** 빈 줄에 놓는 표식. */
const EMPTY_MARK = '—';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function glyph(
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

function move(node: SVGElement, x: number, y: number): void {
  node.setAttribute('transform', `translate(${x} ${y})`);
}

function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

// ── 선언 좁히개. mount 가 `initialData` 를 받는 자리이므로 여기 둔다 (S-piece).

type Scene = {
  lineCount: number;
  lineSize: number;
};

function readScene(data: Record<string, unknown> | undefined): Scene {
  const lineCount = data?.lineCount;
  const lineSize = data?.lineSize;
  return {
    lineCount:
      typeof lineCount === 'number' && Number.isFinite(lineCount) && lineCount > 0
        ? Math.floor(lineCount)
        : 4,
    lineSize:
      typeof lineSize === 'number' && Number.isFinite(lineSize) && lineSize > 0
        ? Math.floor(lineSize)
        : 16,
  };
}

type AccessView = {
  order: number;
  address: number;
  lineNo: number;
  index: number;
  tag: number;
  hit: boolean;
  evictedAddress: number | null;
  evictedTag: number | null;
  emptyIndices: number[];
  emptyLines: number;
  evictionCount: number;
};

type SummaryView = {
  total: number;
  hitCount: number;
  emptyLines: number;
};

type Tone = 'incoming' | 'seated' | 'leaving';

export const conflictMissStageView: CanvasView = {
  canvas: { height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    void container; // 러너가 캔버스를 이미 붙였다 — 컨테이너는 건드리지 않는다 (S-view).

    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const scene = readScene(params.initialData);

    // ── 자리 셈. 기둥 너비는 캔버스에서 역산한다.
    const colCount = Math.max(1, scene.lineCount);
    const colW = Math.min(
      COL_MAX_W,
      Math.floor((W - SIDE_MIN * 2 - COL_GAP * (colCount - 1)) / colCount),
    );
    const gridW = colW * colCount + COL_GAP * (colCount - 1);
    const originX = Math.round((W - gridW) / 2);
    const colX = (i: number): number => originX + i * (colW + COL_GAP);
    const colCx = (i: number): number => colX(i) + colW / 2;

    const tileW = colW - 16;
    const seatX = (i: number): number => colX(i) + 8;
    /** 들어오는 타일이 기다리는 자리 — 기둥 줄에서 떨어진 오른쪽 위. */
    const waitX = Math.round(W * 0.52);

    const root = el('g');
    params.canvas.appendChild(root);

    // ── 고정 부분

    root.appendChild(
      el('rect', {
        x: originX - 10,
        y: FRAME_Y,
        width: gridW + 20,
        height: FRAME_H,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );

    root.appendChild(
      glyph('index', {
        x: originX,
        y: FRAME_Y - 8,
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      }),
    );

    const emptyMarks: SVGTextElement[] = [];
    const slots: SVGRectElement[] = [];

    for (let i = 0; i < colCount; i += 1) {
      root.appendChild(
        glyph(String(i), {
          x: colCx(i),
          y: HEAD_BASELINE,
          fill: c.textMuted,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        }),
      );

      const slot = el('rect', {
        x: colX(i) + 4,
        y: SLOT_Y,
        width: colW - 8,
        height: SLOT_H,
        rx: 6,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
      root.appendChild(slot);
      slots.push(slot);

      const mark = glyph(EMPTY_MARK, {
        x: colCx(i),
        y: SLOT_Y + SLOT_H / 2 + 6,
        fill: c.textMuted,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      root.appendChild(mark);
      emptyMarks.push(mark);
    }

    // ── 움직이는 부분을 담는 층

    const guideLayer = el('g');
    const chipLayer = el('g');
    const braceLayer = el('g');
    const tileLayer = el('g');
    const badgeLayer = el('g');
    root.appendChild(guideLayer);
    root.appendChild(chipLayer);
    root.appendChild(braceLayer);
    root.appendChild(tileLayer);
    root.appendChild(badgeLayer);

    // 주소가 왜 그 줄로 가는지 — 수식 표기라 번역 대상이 아니다 (C10).
    const sums: SVGTextElement[] = [0, 1, 2].map((row) => {
      const node = glyph('', {
        x: W - 16,
        y: 22 + row * 16,
        fill: c.textMuted,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      root.appendChild(node);
      return node;
    });

    const pushedLabel = glyph('', {
      x: 0,
      y: PUSHED_BASELINE,
      fill: c.textMuted,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    root.appendChild(pushedLabel);

    const emptyLabel = glyph('', {
      x: 0,
      y: EMPTY_BASELINE,
      fill: c.textMuted,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    root.appendChild(emptyLabel);

    const caption = glyph('', {
      x: W / 2,
      y: CAPTION_BASELINE,
      fill: c.text,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    root.appendChild(caption);

    // ── 애니메이션 자원. destroy 가 기다리던 것을 반드시 푼다 (S-piece).

    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);

        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          onFrame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };

        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 그리기

    const seated: Array<SVGGElement | null> = new Array<SVGGElement | null>(colCount).fill(
      null,
    );
    const chipsByCol = new Map<number, number[]>();

    function tone(tile: SVGGElement, next: Tone): void {
      const box = tile.firstElementChild;
      const addr = tile.children.item(1);
      const tagText = tile.children.item(2);
      if (!(box instanceof SVGRectElement)) return;

      const fill =
        next === 'incoming' ? c.itemActive : next === 'leaving' ? c.itemSwapping : c.itemDefault;
      const ink = next === 'seated' ? c.text : c.stateInk;
      box.setAttribute('fill', fill);
      box.setAttribute('stroke', next === 'seated' ? c.border : fill);
      addr?.setAttribute('fill', ink);
      tagText?.setAttribute('fill', ink);
    }

    function makeTile(address: number, tag: number, next: Tone): SVGGElement {
      const tile = el('g');
      tile.appendChild(
        el('rect', {
          width: tileW,
          height: TILE_H,
          rx: 6,
          'stroke-width': 1,
        }),
      );
      tile.appendChild(
        glyph(`addr ${address}`, {
          x: 9,
          y: 15,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        }),
      );
      tile.appendChild(
        glyph(`tag ${tag}`, {
          x: 9,
          y: 27,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          opacity: 0.75,
        }),
      );
      tone(tile, next);
      return tile;
    }

    /** 들어오는 타일이 지날 길 — 언제나 같은 기둥으로 꺾인다. */
    function drawGuide(index: number): void {
      guideLayer.textContent = '';
      const fromX = waitX + tileW / 2;
      const toX = colCx(index);
      const midY = WAIT_Y + TILE_H / 2;
      guideLayer.appendChild(
        el('path', {
          d: `M ${fromX} ${midY} H ${toX} V ${SLOT_Y - 6}`,
          fill: 'none',
          stroke: c.auxCursor,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
          opacity: 0.8,
        }),
      );
      guideLayer.appendChild(
        el('polygon', {
          points: `${toX - 5},${SLOT_Y - 12} ${toX + 5},${SLOT_Y - 12} ${toX},${SLOT_Y - 3}`,
          fill: c.auxCursor,
          opacity: 0.8,
        }),
      );
    }

    function stamp(index: number, hit: boolean): void {
      badgeLayer.textContent = '';
      const w = 44;
      const x = colX(index) + 4;
      badgeLayer.appendChild(
        el('rect', {
          x,
          y: 84,
          width: w,
          height: 18,
          rx: 4,
          fill: hit ? c.success : c.danger,
        }),
      );
      badgeLayer.appendChild(
        glyph(hit ? STAMP_HIT : STAMP_MISS, {
          x: x + w / 2,
          y: 97,
          fill: hit ? c.textInverse : c.stateInk,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }),
      );
    }

    /** 밀려난 것을 기둥 아래에 쌓는다. 너비는 개수에서 역산해 넘치지 않게. */
    function renderChips(): void {
      chipLayer.textContent = '';
      let labelAt: number | null = null;
      let total = 0;

      for (const [index, tags] of chipsByCol) {
        if (tags.length === 0) continue;
        total += tags.length;
        if (labelAt === null) labelAt = index;

        const chipW = Math.min(22, Math.floor((colW - 4) / tags.length));
        const startX = colX(index) + Math.round((colW - chipW * tags.length) / 2);

        tags.forEach((tag, k) => {
          const x = startX + k * chipW;
          chipLayer.appendChild(
            el('rect', {
              x,
              y: CHIP_Y,
              width: Math.max(4, chipW - 3),
              height: CHIP_H,
              rx: 3,
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
            }),
          );
          chipLayer.appendChild(
            glyph(String(tag), {
              x: x + Math.max(4, chipW - 3) / 2,
              y: CHIP_Y + 14,
              fill: c.textMuted,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
            }),
          );
        });
      }

      if (labelAt === null || total === 0) {
        pushedLabel.textContent = '';
        return;
      }
      pushedLabel.setAttribute('x', String(colCx(labelAt)));
      pushedLabel.textContent = t('label.pushedOut', 'Pushed out: {n}', { n: total });
    }

    /** 비어 있는 기둥을 묶어 셈을 그 곁에 남긴다. */
    function renderEmpty(indices: number[], count: number): void {
      braceLayer.textContent = '';
      if (indices.length === 0) {
        emptyLabel.textContent = '';
        return;
      }

      const first = colCx(indices[0] ?? 0);
      const last = colCx(indices[indices.length - 1] ?? 0);
      braceLayer.appendChild(
        el('line', {
          x1: first,
          y1: BRACE_Y,
          x2: last,
          y2: BRACE_Y,
          stroke: c.textMuted,
          'stroke-width': 1,
          opacity: 0.55,
        }),
      );
      for (const i of indices) {
        braceLayer.appendChild(
          el('line', {
            x1: colCx(i),
            y1: BRACE_TOP,
            x2: colCx(i),
            y2: BRACE_Y,
            stroke: c.textMuted,
            'stroke-width': 1,
            opacity: 0.55,
          }),
        );
      }

      emptyLabel.setAttribute('x', String((first + last) / 2));
      emptyLabel.textContent = t('label.emptyLines', 'Empty lines: {n}', { n: count });
    }

    function showSums(access: AccessView): void {
      const lines = [
        `addr ${access.address} ÷ ${scene.lineSize} = line ${access.lineNo}`,
        `line ${access.lineNo} mod ${colCount} = index ${access.index}`,
        `line ${access.lineNo} ÷ ${colCount} = tag ${access.tag}`,
      ];
      sums.forEach((node, i) => {
        node.textContent = lines[i] ?? '';
      });
    }

    async function showAccess(access: AccessView): Promise<void> {
      if (destroyed) return;

      const index = Math.min(colCount - 1, Math.max(0, access.index));

      // 앞 걸음의 흔적을 거둔다.
      badgeLayer.textContent = '';
      const resident = seated[index] ?? null;
      if (resident !== null) tone(resident, 'seated');

      caption.textContent =
        access.evictedAddress === null
          ? t('caption.fill', 'This address can sit in only one line: {index}.', {
              index: access.index,
            })
          : t('caption.evict', 'The same line again, so the older block is pushed out: {evicted}.', {
              evicted: access.evictedAddress,
            });

      showSums(access);
      drawGuide(index);

      const tile = makeTile(access.address, access.tag, 'incoming');
      move(tile, waitX, WAIT_Y);
      tileLayer.appendChild(tile);

      // 1. 언제나 같은 기둥으로 미끄러진다.
      await tween(ROUTE_MS, (p) => {
        move(tile, lerp(waitX, seatX(index), p), WAIT_Y);
      });
      if (destroyed) return;

      stamp(index, access.hit);

      // 2. 내려앉으면서 살던 것을 아래로 밀어낸다.
      const leaving = access.hit ? null : resident;
      if (leaving !== null) tone(leaving, 'leaving');

      await tween(DROP_MS, (p) => {
        move(tile, seatX(index), lerp(WAIT_Y, SEATED_Y, p));
        if (leaving !== null) {
          move(leaving, seatX(index), lerp(SEATED_Y, EXIT_Y, p));
          leaving.setAttribute('opacity', String(Math.max(0, 1 - p)));
        }
      });
      if (destroyed) return;

      if (leaving !== null) {
        leaving.remove();
        const tags = chipsByCol.get(index) ?? [];
        tags.push(access.evictedTag ?? 0);
        chipsByCol.set(index, tags);
      }

      seated[index] = tile;
      const mark = emptyMarks[index];
      if (mark) mark.setAttribute('opacity', '0');
      slots[index]?.setAttribute('stroke-dasharray', 'none');

      guideLayer.textContent = '';
      renderChips();
      renderEmpty(access.emptyIndices, access.emptyLines);
    }

    function showSummary(summary: SummaryView): void {
      if (destroyed) return;
      badgeLayer.textContent = '';
      caption.textContent = t(
        'caption.done',
        'Lookups: {total}, hits: {hits}. Lines still empty: {empty}.',
        { total: summary.total, hits: summary.hitCount, empty: summary.emptyLines },
      );
    }

    function resetScene(): void {
      if (destroyed) return;
      guideLayer.textContent = '';
      chipLayer.textContent = '';
      braceLayer.textContent = '';
      tileLayer.textContent = '';
      badgeLayer.textContent = '';
      chipsByCol.clear();
      seated.fill(null);
      caption.textContent = '';
      pushedLabel.textContent = '';
      emptyLabel.textContent = '';
      for (const node of sums) node.textContent = '';
      for (const mark of emptyMarks) mark.setAttribute('opacity', '1');
      for (const slot of slots) slot.setAttribute('stroke-dasharray', '4 4');
    }

    return {
      showAccess,
      showSummary,
      resetScene,

      /**
       * 걸어 둔 프레임을 거두고, **기다리던 promise 를 푼다.** 취소된 프레임은
       * 아예 불리지 않으므로 거두기만 해서는 `await ctx.emit` 이 영영 돌아오지
       * 않는다 (S-piece).
       */
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
