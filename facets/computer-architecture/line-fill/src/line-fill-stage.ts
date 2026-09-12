/**
 * line-fill-stage — 두 층. 아래가 메모리, 위가 캐시다.
 *
 * 아래층에는 원소가 줄 단위로 묶여 늘어서 있고, 위층에는 그 줄이 들어앉을 빈
 * 자리가 점선으로 비어 있다. 한 칸을 부르면 그 칸 위에 표가 하나 내려앉고,
 * 곧 그 칸이 **속한 줄 전체**가 한 덩어리로 위층까지 올라간다. 올라간 뒤에야
 * 부르지 않은 셋이 점선으로 갈라져 보인다 — 함께 온 것과 부른 것이 다르다.
 *
 * 운동은 실제 이동이다. 페이드로 바꾸면 "딸려 온다" 가 "나타난다" 가 된다.
 *
 * 세로는 이 파일이 정한다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-piece).
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

const NS = 'http://www.w3.org/2000/svg';

/**
 * 층 이름. 소문자 도식 라벨 한 단어는 표식이라 키를 만들지 않는다 (C10).
 * 바이트 범위(`0–15`)와 칸 이름(`a[3]`)도 같은 까닭으로 셈해서 그대로 새긴다.
 */
const FLOOR_UPPER = 'cache';
const FLOOR_LOWER = 'memory';

const CANVAS_H = 224;

const UPPER_LABEL_Y = 14;
const RANGE_Y = 30;
const FRAME_Y = 36;
const FRAME_PAD = 4;
const CELL_H = 42;
const UPPER_CELL_Y = FRAME_Y + FRAME_PAD;
const LOWER_LABEL_Y = 122;
const MARK_Y = 128;
const LOWER_CELL_Y = 142;
const CAPTION_Y = 206;

const GROUP_GAP = 14;
const SIDE_MIN = 22;
const CELL_MAX_W = 54;

const LIFT_MS = 460;
const SETTLE_MS = 150;
const MARK_MS = 220;
/** 표가 내려앉는 거리. 그만큼 위에서 떨어진다. */
const MARK_DROP = 10;

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type Scene = { lineSize: number; elemSize: number; requests: number[] };

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이고, 좁히는 규칙이 두 벌이 되지 않게 한 곳에 둔다 (S-piece).
 */
function readScene(value: unknown): Scene | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const lineSize = raw.lineSize;
  const elemSize = raw.elemSize;
  const requests = raw.requests;
  if (typeof lineSize !== 'number' || typeof elemSize !== 'number') return null;
  if (!(lineSize > 0) || !(elemSize > 0) || !Array.isArray(requests)) return null;
  return {
    lineSize,
    elemSize,
    requests: requests.filter((v): v is number => typeof v === 'number' && v >= 0),
  };
}

type Cell = { g: SVGElement; box: SVGElement; name: SVGElement; addr: SVGElement };
type Tone = 'plain' | 'asked' | 'tagalong';

export const lineFillStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const root = el('g', {});
    params.canvas.appendChild(root);

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: palette.text,
    });

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const raf = new Set<number>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /**
     * 프레임마다 `step(0…1)` 을 부른다.
     *
     * 마감 타이머를 함께 걸어 둔다 — 프레임이 오지 않는 환경에서도 promise 가
     * 반드시 풀려야 한다. 풀리지 않으면 `await ctx.emit` 이 돌아오지 않는다.
     */
    function animate(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const startedAt = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const guard = setTimeout(() => {
          timers.delete(guard);
          step(1);
          finish();
        }, ms + 80);
        timers.add(guard);
        let id = 0;
        const tick = (): void => {
          raf.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const t = Math.min(1, (Date.now() - startedAt) / ms);
          step(t);
          if (t >= 1) {
            clearTimeout(guard);
            timers.delete(guard);
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          raf.add(id);
        };
        id = requestAnimationFrame(tick);
        raf.add(id);
      });
    }

    const scene = readScene(params.initialData);
    if (scene === null || scene.requests.length === 0) {
      root.appendChild(caption);
      return {
        destroy(): void {
          destroyed = true;
          root.remove();
        },
      };
    }

    // `makeCell` 은 function 선언이라 호이스팅된다 — 위 가드를 지나기 전에도 부를 수
    // 있는 자리라서, 그 안에서는 `scene` 의 null 좁힘이 따라오지 않는다. 가드를 지난
    // 여기서 값을 떠 두고 쓴다. (화살표 함수인 `lineOf` 는 좁힘이 따라와 그대로 쓴다.)
    const elemSize = scene.elemSize;
    const perLine = Math.max(1, Math.floor(scene.lineSize / elemSize));
    const lineOf = (index: number): number => Math.floor((index * scene.elemSize) / scene.lineSize);
    /** 화면에 세우는 줄 — 부르는 색인이 건드리는 줄만. 데이터가 정한다. */
    const lines = [...new Set(scene.requests.map(lineOf))].sort((a, b) => a - b);

    // 남는 폭을 여백으로 버리지 않는다. 칸 크기는 캔버스에서 역산하고 상수로는
    // 상한만 둔다 (S-piece).
    const cellCount = lines.length * perLine;
    const room = PIECE_CANVAS_W - SIDE_MIN * 2 - GROUP_GAP * (lines.length - 1);
    const cellW = Math.min(CELL_MAX_W, Math.floor(room / cellCount));
    const spanW = cellCount * cellW + GROUP_GAP * (lines.length - 1);
    const originX = Math.round((PIECE_CANVAS_W - spanW) / 2);
    const groupX = (slot: number): number => originX + slot * (perLine * cellW + GROUP_GAP);
    const slotOf = (line: number): number => lines.indexOf(line);

    const frameLayer = el('g', {});
    const upperLayer = el('g', {});
    const lowerLayer = el('g', {});
    const markLayer = el('g', {});
    const flyLayer = el('g', {});
    root.appendChild(frameLayer);
    root.appendChild(lowerLayer);
    root.appendChild(upperLayer);
    root.appendChild(markLayer);
    root.appendChild(flyLayer);
    root.appendChild(caption);

    function floorLabel(y: number, content: string): SVGElement {
      const node = el('text', {
        x: originX,
        y,
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      node.textContent = content;
      return node;
    }
    root.appendChild(floorLabel(UPPER_LABEL_Y, FLOOR_UPPER));
    root.appendChild(floorLabel(LOWER_LABEL_Y, FLOOR_LOWER));

    function makeCell(x: number, y: number, index: number): Cell {
      const g = el('g', {});
      const box = el('rect', { x, y, width: cellW, height: CELL_H, rx: 3, 'stroke-width': 1 });
      const name = el('text', {
        x: x + cellW / 2,
        y: y + 19,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      name.textContent = `a[${index}]`;
      const addr = el('text', {
        x: x + cellW / 2,
        y: y + 33,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      addr.textContent = String(index * elemSize);
      g.appendChild(box);
      g.appendChild(name);
      g.appendChild(addr);
      return { g, box, name, addr };
    }

    function paint(cell: Cell, tone: Tone): void {
      if (tone === 'asked') {
        cell.box.setAttribute('fill', palette.itemActive);
        cell.box.setAttribute('stroke', palette.itemActive);
        cell.box.removeAttribute('stroke-dasharray');
        cell.name.setAttribute('fill', palette.stateInk);
        cell.addr.setAttribute('fill', palette.stateInk);
        return;
      }
      if (tone === 'tagalong') {
        cell.box.setAttribute('fill', 'none');
        cell.box.setAttribute('stroke', palette.border);
        cell.box.setAttribute('stroke-dasharray', '3 3');
        cell.name.setAttribute('fill', palette.textMuted);
        cell.addr.setAttribute('fill', palette.textMuted);
        return;
      }
      cell.box.setAttribute('fill', palette.itemDefault);
      cell.box.setAttribute('stroke', palette.border);
      cell.box.removeAttribute('stroke-dasharray');
      cell.name.setAttribute('fill', palette.text);
      cell.addr.setAttribute('fill', palette.textMuted);
    }

    /** 위층의 빈 자리. 줄이 들어앉기 전에는 점선으로만 있다. */
    const slotFrames: SVGElement[] = [];
    for (const [slot, line] of lines.entries()) {
      const frame = el('rect', {
        x: groupX(slot) - FRAME_PAD,
        y: FRAME_Y,
        width: perLine * cellW + FRAME_PAD * 2,
        height: CELL_H + FRAME_PAD * 2,
        rx: 5,
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
      slotFrames.push(frame);
      frameLayer.appendChild(frame);

      const lo = line * scene.lineSize;
      const range = el('text', {
        x: groupX(slot) + (perLine * cellW) / 2,
        y: RANGE_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      range.textContent = `${lo}–${lo + scene.lineSize - 1}`;
      frameLayer.appendChild(range);
    }

    /** 아래층. 원본은 여기 남는다 — 위로 가는 것은 복제본이다. */
    const lowerCells = new Map<number, Cell>();
    for (const [slot, line] of lines.entries()) {
      for (let k = 0; k < perLine; k += 1) {
        const index = line * perLine + k;
        const cell = makeCell(groupX(slot) + k * cellW, LOWER_CELL_Y, index);
        paint(cell, 'plain');
        lowerLayer.appendChild(cell.g);
        lowerCells.set(index, cell);
      }
    }

    /** 부른 칸을 가리키는 표. 아래를 향한다. */
    const mark = el('path', {
      d: `M 0 ${MARK_DROP} L -6 0 L 6 0 Z`,
      fill: palette.itemActive,
      opacity: 0,
    });
    markLayer.appendChild(mark);

    const upperCells: Cell[] = [];

    function clearMark(): void {
      mark.setAttribute('opacity', '0');
    }

    async function ask(p: { index: number; addr: number; line: number }): Promise<void> {
      const slot = slotOf(p.line);
      if (slot < 0) return;
      const cell = lowerCells.get(p.index);
      if (cell) paint(cell, 'asked');
      const column = p.index - p.line * perLine;
      const cx = groupX(slot) + column * cellW + cellW / 2;
      await animate(MARK_MS, (t) => {
        const eased = ease(t);
        mark.setAttribute('transform', `translate(${cx.toFixed(1)} ${(MARK_Y - MARK_DROP * (1 - eased)).toFixed(1)})`);
        mark.setAttribute('opacity', eased.toFixed(2));
      });
    }

    async function rise(p: { line: number; first: number; count: number; asked: number }): Promise<void> {
      const slot = slotOf(p.line);
      if (slot < 0) return;
      clearMark();

      // 줄 하나가 한 덩어리로 움직인다. 넷이 따로 움직이면 "줄 단위" 가 아니다.
      const flock = el('g', {});
      for (let k = 0; k < p.count; k += 1) {
        const index = p.first + k;
        const copy = makeCell(groupX(slot) + k * cellW, LOWER_CELL_Y, index);
        paint(copy, index === p.asked ? 'asked' : 'plain');
        flock.appendChild(copy.g);
      }
      flyLayer.appendChild(flock);

      const dy = UPPER_CELL_Y - LOWER_CELL_Y;
      await animate(LIFT_MS, (t) => {
        flock.setAttribute('transform', `translate(0 ${(dy * ease(t)).toFixed(2)})`);
      });
      if (destroyed) return;
      flock.remove();

      const landed: Array<{ cell: Cell; index: number }> = [];
      for (let k = 0; k < p.count; k += 1) {
        const index = p.first + k;
        const cell = makeCell(groupX(slot) + k * cellW, UPPER_CELL_Y, index);
        paint(cell, index === p.asked ? 'asked' : 'plain');
        upperLayer.appendChild(cell.g);
        upperCells.push(cell);
        landed.push({ cell, index });
      }
      const frame = slotFrames[slot];
      if (frame) {
        frame.setAttribute('stroke', palette.border);
        frame.removeAttribute('stroke-dasharray');
      }

      // 앉고 나서야 갈라 보인다 — 넷이 왔다, 그중 셋은 아무도 부르지 않았다.
      await wait(SETTLE_MS);
      if (destroyed) return;
      for (const item of landed) {
        if (item.index !== p.asked) paint(item.cell, 'tagalong');
      }
    }

    function reset(): void {
      clearMark();
      caption.textContent = '';
      for (const cell of upperCells) cell.g.remove();
      upperCells.length = 0;
      for (const cell of lowerCells.values()) paint(cell, 'plain');
      for (const frame of slotFrames) {
        frame.setAttribute('stroke', palette.ghostOutline);
        frame.setAttribute('stroke-dasharray', '4 4');
      }
    }

    return {
      ask,
      rise,
      reset,
      setCaption(text: string): void {
        caption.textContent = text;
      },
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of raf) cancelAnimationFrame(id);
        raf.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
