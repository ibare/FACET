/**
 * 자리값과 진법 stage — 같은 길이를 다르게 쪼갠다.
 *
 * 네 줄이 **모두 같은 폭**을 차지한다. 그것이 이 그림의 주장이다 — 밑이 바뀌어도
 * 길이는 그대로이고, 길이가 그대로라는 것이 같은 수라는 뜻이다. 줄마다 다른
 * 것은 그 폭을 몇 조각으로 끊었느냐뿐이다.
 *
 *   10   한 덩이. 쪼개진 뒤에는 빈 테두리로 남고, 켜진 자리의 합이 그 자리를
 *        다시 채운다.
 *    2   여덟 조각. 자리값과 비트.
 *    8   셋씩 끊은 세 조각.
 *   16   넷씩 끊은 두 조각.
 *
 * 운동은 전부 자리의 변화다 — 덩이가 갈라져 내려앉고, 값이 떠올라 식이 되고,
 * 같은 폭이 다시 내려와 다르게 끊긴다. 색이 바뀌는 것은 켜진 자리 하나뿐이고
 * 그것은 색이 곧 값이기 때문이다 (S-piece).
 *
 * 세로는 그림이 정해 여기 상수로 둔다. 가로는 러너가 준다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 세로. 네 줄과 캡션이 정한 값이며 마운트한 뒤 바뀌지 않는다 (S-view). */
const H = 280;
const SIDE = 24;
/** 왼쪽 진법 표식이 서는 칸. */
const GUTTER = 30;
/** 칸 하나의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 74;
/** 끊긴 자리에 생기는 틈. */
const GAP = 8;
/** 켜진 자리가 들리는 높이. */
const LIFT = 6;

type Row = { y: number; h: number };
const ROW_TEN: Row = { y: 18, h: 44 };
const ROW_TWO: Row = { y: 80, h: 52 };
const ROW_OCT: Row = { y: 150, h: 40 };
const ROW_HEX: Row = { y: 200, h: 40 };
const CAPTION_Y = 262;

const CHIP_H = 26;
const OP_W = 18;
const EQ_W = 22;

/**
 * 진법 표식. 밑을 가리키는 수식 표기이므로 번역하지 않는다 (C10 표식 판정 3).
 */
const RADIX_TEN = '10';
const RADIX_TWO = '2';
const RADIX_OCT = '8';
const RADIX_HEX = '16';

type Scene = { value: number; bitWidth: number };

/**
 * `initialData` 를 좁힌다. 받는 자리가 mount 이므로 좁히개도 여기 있다 (S-piece).
 * `as` 뒤에 필드마다 `typeof` 가 따르는 좁히개다 (C9).
 */
function readScene(data: Record<string, unknown> | undefined): Scene {
  const d = (data ?? {}) as { value?: unknown; bitWidth?: unknown };
  return {
    value: typeof d.value === 'number' ? d.value : 0,
    bitWidth: typeof d.bitWidth === 'number' && d.bitWidth > 0 ? Math.floor(d.bitWidth) : 8,
  };
}

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function label(
  s: string,
  x: number,
  y: number,
  size: string,
  fill: string,
  family: string,
): SVGElement {
  const node = el('text', {
    x,
    y,
    'text-anchor': 'middle',
    'font-family': family,
    'font-size': size,
    fill,
  });
  node.textContent = s;
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);

/** 칩 폭 — 글자 수에서 역산한다. */
const chipW = (v: number): number => 16 + 9 * String(v).length;

type Cell = { g: SVGElement; rect: SVGElement; place: SVGElement; bit: SVGElement };

export const positionalValueStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const scene = readScene(params.initialData);

    const W = PIECE_CANVAS_W;
    const usable = W - SIDE * 2 - GUTTER;
    const cellW = Math.min(CELL_MAX_W, Math.floor(usable / scene.bitWidth));
    const spanW = cellW * scene.bitWidth;
    const originX = SIDE + GUTTER + Math.round((usable - spanW) / 2);

    const gRows = el('g', {});
    const gFly = el('g', {});
    const gGuide = el('g', {});
    const caption = label('', W / 2, CAPTION_Y, fontSizes.sm, c.textMuted, fonts.body);
    svg.appendChild(gRows);
    svg.appendChild(gFly);
    svg.appendChild(gGuide);
    svg.appendChild(caption);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    function frame(fn: () => void): void {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        fn();
      });
      frames.add(id);
    }

    /**
     * 걸어 둔 프레임은 집합에 담아 destroy 에서 일괄로 거두고, 기다리던 것은
     * 깨워서 푼다. 취소된 프레임은 아예 불리지 않으므로 깨우는 길이 따로
     * 있어야 `await ctx.emit` 이 돌아온다 (S-piece).
     */
    function tween(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
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
          if (destroyed) {
            finish();
            return;
          }
          const t = clamp01((Date.now() - started) / ms);
          step(t);
          if (t >= 1) {
            finish();
            return;
          }
          frame(tick);
        };
        frame(tick);
      });
    }

    let cells: Cell[] = [];
    let onIndices: number[] = [];
    let tenRect: SVGElement | null = null;
    let tenNum: SVGElement | null = null;
    let ghost: SVGElement | null = null;

    function clearScene(): void {
      gRows.textContent = '';
      gFly.textContent = '';
      gGuide.textContent = '';
      cells = [];
      onIndices = [];
      tenRect = null;
      tenNum = null;
      ghost = null;
    }

    function radix(mark: string, row: Row): void {
      const node = label(
        mark,
        originX - 10,
        row.y + row.h / 2 + 4,
        fontSizes.xs,
        c.textMuted,
        fonts.mono,
      );
      node.setAttribute('text-anchor', 'end');
      gRows.appendChild(node);
    }

    /** 한 덩이로 선다. 가운데서 좌우로 벌어지며 제 폭을 차지한다. */
    function showNumber(value: number): Promise<void> {
      clearScene();
      radix(RADIX_TEN, ROW_TEN);

      const rect = el('rect', {
        x: originX,
        y: ROW_TEN.y,
        width: spanW,
        height: ROW_TEN.h,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      const num = label(
        String(value),
        originX + spanW / 2,
        ROW_TEN.y + ROW_TEN.h / 2 + 7,
        fontSizes.xl,
        c.text,
        fonts.mono,
      );
      gRows.appendChild(rect);
      gRows.appendChild(num);
      tenRect = rect;
      tenNum = num;

      return tween(320, (t) => {
        const p = ease(t);
        const w = Math.max(2, spanW * p);
        rect.setAttribute('x', String(originX + (spanW - w) / 2));
        rect.setAttribute('width', String(w));
        num.setAttribute('opacity', String(clamp01(p * 2 - 1)));
      });
    }

    /**
     * 덩이가 자리마다 하나씩 쪼개진다.
     *
     * 조각은 덩이가 있던 그 자리에서 그 크기로 시작한다 — 처음 한 칸은 덩이와
     * 완전히 겹치므로, 내려앉으며 왼쪽부터 차례로 틈이 벌어지는 것만 보인다.
     */
    function splitPlaces(bits: number[], places: number[]): Promise<void> {
      radix(RADIX_TWO, ROW_TWO);

      // 덩이가 떠난 자리에는 빈 테두리가 남는다. 합이 이 자리를 다시 채운다.
      const outline = el('rect', {
        x: originX,
        y: ROW_TEN.y,
        width: spanW,
        height: ROW_TEN.h,
        rx: 6,
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
        opacity: 0,
      });
      gRows.insertBefore(outline, gRows.firstChild);
      ghost = outline;

      if (tenRect) {
        tenRect.remove();
        tenRect = null;
      }
      const num = tenNum;

      for (let i = 0; i < bits.length; i += 1) {
        const g = el('g', { transform: `translate(${originX + i * cellW},${ROW_TEN.y})` });
        const rect = el('rect', {
          x: 0,
          y: 0,
          width: cellW,
          height: ROW_TEN.h,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const place = label(
          String(places[i]),
          cellW / 2,
          ROW_TEN.h * 0.32,
          fontSizes.xs,
          c.textMuted,
          fonts.mono,
        );
        const bit = label(
          String(bits[i]),
          cellW / 2,
          ROW_TEN.h * 0.78,
          fontSizes.xl,
          c.text,
          fonts.mono,
        );
        place.setAttribute('opacity', '0');
        bit.setAttribute('opacity', '0');
        g.appendChild(rect);
        g.appendChild(place);
        g.appendChild(bit);
        gRows.appendChild(g);
        cells.push({ g, rect, place, bit });
      }

      return tween(560, (t) => {
        const drop = ease(clamp01(t / 0.62));
        const y = lerp(ROW_TEN.y, ROW_TWO.y, drop);
        const h = lerp(ROW_TEN.h, ROW_TWO.h, drop);
        if (num) num.setAttribute('opacity', String(clamp01(1 - t * 4)));
        outline.setAttribute('opacity', String(clamp01(t * 2.2 - 0.2)));

        cells.forEach((cell, i) => {
          // 왼쪽부터 차례로 갈라진다 — 칼이 지나가는 순서다.
          const slice = ease(clamp01((t - 0.26 - i * 0.035) / 0.42));
          const x = originX + i * cellW + (GAP / 2) * slice;
          const w = cellW - GAP * slice;
          cell.g.setAttribute('transform', `translate(${x},${y})`);
          cell.rect.setAttribute('width', String(w));
          cell.rect.setAttribute('height', String(h));
          cell.place.setAttribute('x', String(w / 2));
          cell.place.setAttribute('y', String(h * 0.32));
          cell.place.setAttribute('opacity', String(slice));
          cell.bit.setAttribute('x', String(w / 2));
          cell.bit.setAttribute('y', String(h * 0.78));
          cell.bit.setAttribute('opacity', String(slice));
        });
      }).then(() => {
        if (num) num.remove();
        tenNum = null;
      });
    }

    /** 켜진 자리가 들린다. 여기서만 색이 바뀐다 — 색이 곧 값이다. */
    function markOn(indices: number[]): Promise<void> {
      onIndices = indices.slice();
      const lifted: Array<{ cell: Cell; index: number }> = [];
      for (const i of indices) {
        const cell = cells[i];
        if (cell === undefined) continue;
        cell.rect.setAttribute('fill', c.itemActive);
        cell.rect.setAttribute('stroke', c.itemActive);
        cell.place.setAttribute('fill', c.stateInk);
        cell.bit.setAttribute('fill', c.stateInk);
        lifted.push({ cell, index: i });
      }

      return tween(280, (t) => {
        const p = ease(t);
        for (const { cell, index } of lifted) {
          const x = originX + index * cellW + GAP / 2;
          cell.g.setAttribute('transform', `translate(${x},${ROW_TWO.y - LIFT * p})`);
        }
      });
    }

    /** 켜진 자리의 값이 떠올라 식이 되고, 덩이가 떠난 자리를 다시 채운다. */
    function sumUp(addends: number[], sum: number): Promise<void> {
      const numText = String(sum);
      const numW = 12 + 11 * numText.length;
      const midY = ROW_TEN.y + ROW_TEN.h / 2;

      let total = EQ_W + numW + OP_W * Math.max(0, addends.length - 1);
      for (const v of addends) total += chipW(v);

      const flights: Array<{ g: SVGElement; fromX: number; fromY: number; toX: number }> = [];
      const glue: SVGElement[] = [];
      const fromY = ROW_TWO.y - LIFT + (ROW_TWO.h - CHIP_H) / 2;

      let x = originX + (spanW - total) / 2;
      addends.forEach((v, k) => {
        const w = chipW(v);
        const index = onIndices[k];
        const centerX = originX + (index === undefined ? 0 : index) * cellW + cellW / 2;
        const g = el('g', { transform: `translate(${centerX - w / 2},${fromY})` });
        g.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width: w,
            height: CHIP_H,
            rx: 4,
            fill: c.itemActive,
            stroke: c.itemActive,
          }),
        );
        g.appendChild(label(String(v), w / 2, CHIP_H / 2 + 4, fontSizes.sm, c.stateInk, fonts.mono));
        gFly.appendChild(g);
        flights.push({ g, fromX: centerX - w / 2, fromY, toX: x });

        x += w;
        if (k < addends.length - 1) {
          glue.push(label('+', x + OP_W / 2, midY + 5, fontSizes.md, c.textMuted, fonts.mono));
          x += OP_W;
        }
      });

      glue.push(label('=', x + EQ_W / 2, midY + 5, fontSizes.md, c.textMuted, fonts.mono));
      x += EQ_W;
      glue.push(label(numText, x + numW / 2, midY + 7, fontSizes.xl, c.text, fonts.mono));
      for (const node of glue) {
        node.setAttribute('opacity', '0');
        gFly.appendChild(node);
      }

      const toY = midY - CHIP_H / 2;
      return tween(640, (t) => {
        const p = ease(t);
        for (const f of flights) {
          f.g.setAttribute(
            'transform',
            `translate(${lerp(f.fromX, f.toX, p)},${lerp(f.fromY, toY, p)})`,
          );
        }
        const show = String(clamp01((t - 0.6) / 0.3));
        for (const node of glue) node.setAttribute('opacity', show);
      }).then(() => {
        // 자리가 다시 찼으니 빈 테두리가 아니다.
        if (ghost) {
          ghost.setAttribute('stroke-dasharray', '');
          ghost.setAttribute('stroke', c.border);
        }
      });
    }

    /**
     * 같은 폭을 다시 가져와 다르게 끊는다.
     *
     * 조각은 비트 줄 위에서 그 칸들을 덮은 채 시작한다 — 어느 비트가 한 묶음이
     * 되는지가 출발 자리로 드러나고, 내려앉으며 끊긴 자리에 틈이 벌어진다.
     */
    function cutInto(row: 'octal' | 'hex', sizes: number[], digits: string[]): Promise<void> {
      const target = row === 'octal' ? ROW_OCT : ROW_HEX;
      radix(row === 'octal' ? RADIX_OCT : RADIX_HEX, target);

      const pieces: Array<{ g: SVGElement; rect: SVGElement; text: SVGElement; at: number; size: number }> = [];
      let at = 0;
      let leading = true;
      sizes.forEach((size, k) => {
        const digit = digits[k] === undefined ? '' : digits[k];
        // 앞의 0 은 적지 않는 자리다. 화면이 "055" 라 말하고 캡션이 "55" 라
        // 말하면 둘 중 하나가 거짓이 되므로, 떼어 읽는 자리임을 흐린 글자로 둔다.
        const dropped = leading && digit === '0' && k < sizes.length - 1;
        if (digit !== '0') leading = false;

        const g = el('g', { transform: `translate(${originX + at * cellW},${ROW_TWO.y})` });
        const rect = el('rect', {
          x: 0,
          y: 0,
          width: size * cellW,
          height: ROW_TWO.h,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const text = label(
          digit,
          (size * cellW) / 2,
          ROW_TWO.h * 0.64,
          fontSizes.lg,
          dropped ? c.textMuted : c.text,
          fonts.mono,
        );
        g.appendChild(rect);
        g.appendChild(text);
        gRows.appendChild(g);
        pieces.push({ g, rect, text, at, size });
        at += size;
      });

      return tween(560, (t) => {
        const drop = ease(clamp01(t / 0.62));
        const y = lerp(ROW_TWO.y, target.y, drop);
        const h = lerp(ROW_TWO.h, target.h, drop);
        pieces.forEach((p, k) => {
          const slice = ease(clamp01((t - 0.26 - k * 0.05) / 0.42));
          const x = originX + p.at * cellW + (GAP / 2) * slice;
          const w = p.size * cellW - GAP * slice;
          p.g.setAttribute('transform', `translate(${x},${y})`);
          p.rect.setAttribute('width', String(w));
          p.rect.setAttribute('height', String(h));
          p.text.setAttribute('x', String(w / 2));
          p.text.setAttribute('y', String(h * 0.64));
        });
      });
    }

    /** 네 줄의 양 끝을 잇는 선이 내려온다. 길이가 같다는 것이 결론이다. */
    function alignAll(): Promise<void> {
      const top = ROW_TEN.y - 6;
      const bottom = ROW_HEX.y + ROW_HEX.h + 6;
      const lines = [originX, originX + spanW].map((x) => {
        const line = el('line', {
          x1: x,
          y1: top,
          x2: x,
          y2: top,
          stroke: c.accent,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        gGuide.appendChild(line);
        return line;
      });

      return tween(520, (t) => {
        const y = lerp(top, bottom, ease(t));
        for (const line of lines) line.setAttribute('y2', String(y));
      });
    }

    return {
      showNumber,
      splitPlaces,
      markOn,
      sumUp,
      cutInto,
      alignAll,

      rewind(): void {
        clearScene();
        caption.textContent = '';
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
