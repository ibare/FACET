/**
 * 공간 지역성 조각의 그림.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사는 "이어진다" 다. 그래서 화면을 두 층으로 가르고 커서의 운동을 **가로**로,
 * 줄이 올라오는 운동을 **세로**로 나눠 두었다. 열한 걸음 중 세로 운동은 두
 * 번뿐이고 나머지는 전부 옆으로 미끄러진다 — 그 비율이 이 조각이 하는 주장
 * 그대로다. 내려가는 일이 드물다는 말을 화면이 몸으로 한다.
 *
 * 줄이 올라올 때 칸 넷은 **한 덩어리로 함께** 움직인다. 낱개로 하나씩 올리면
 * "함께 온다" 가 사라지므로 묶음 하나를 통째로 옮긴다. 아래층에는 점선 자리가
 * 남아 원본이 그대로 있음을 보인다 (올라간 것은 사본이다).
 *
 * 줄이 바뀌는 자리를 눈으로 찾을 수 있게 두 묶음 사이에 점선을 세웠고, 칸 아래에
 * 바이트 주소를 적어 12 다음이 16 이라는 것 — 16 으로 나눈 몫이 거기서 바뀐다는
 * 것 — 을 셀 수 있게 했다.
 *
 * ── 문자
 *
 * 이 파일은 translator 를 쓰지 않는다. 그리는 글자가 전부 표식이기 때문이다
 * (C10 판정 1·2 — 도식에 새겨진 소문자 한 단어 `cache` / `memory`, 코드 표기
 * `a[0]`, 수 표기인 주소와 `line 0`). 문장은 캡션 하나뿐이고 그것은 projector 가
 * 해석해 넘긴다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const H = 248;

/** 층 이름이 앉는 왼쪽 여백의 오른쪽 끝. */
const GUTTER_X = 56;
/** 칸이 놓일 수 있는 왼쪽 끝. */
const FIELD_L = 64;
/** 오른쪽 여백. */
const SIDE_MIN = 26;
/** 줄과 줄 사이 — 여기가 경계다. */
const GROUP_GAP = 18;
/** 한 줄 안에서 칸과 칸 사이. */
const CELL_GAP = 4;
/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 84;
const MIN_CELL_W = 18;
const CELL_H = 46;

const CACHE_Y = 30;
const MEM_Y = 116;
const ADDR_Y = 178;
const LINE_Y = 198;
const CAP_Y = 220;
const CAP_LINE_H = 17;

/** 커서가 처음 떨어져 내리는 높이. */
const CURSOR_DROP = 14;
const SLIDE_MS = 240;
const LIFT_MS = 420;

/** 캡션 한 줄에 담는 글자 수. 넘치면 두 줄로 접는다. */
const CAP_WRAP = 62;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function set<T extends SVGElement>(node: T, attrs: Attrs): T {
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const makeRect = (attrs: Attrs): SVGRectElement =>
  set(document.createElementNS(SVG_NS, 'rect'), attrs);

const makeLine = (attrs: Attrs): SVGLineElement =>
  set(document.createElementNS(SVG_NS, 'line'), attrs);

const makePath = (attrs: Attrs): SVGPathElement =>
  set(document.createElementNS(SVG_NS, 'path'), attrs);

const makeGroup = (): SVGGElement => document.createElementNS(SVG_NS, 'g');

function makeText(attrs: Attrs, content: string): SVGTextElement {
  const node = set(document.createElementNS(SVG_NS, 'text'), attrs);
  node.textContent = content;
  return node;
}

type Scene = { lineBytes: number; elemBytes: number; count: number };

/**
 * `initialData` 를 좁히는 자리는 여기 하나다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이기 때문이다 (S-piece).
 */
function readScene(raw: Record<string, unknown> | undefined): Scene {
  const src = raw ?? {};
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  return {
    lineBytes: Math.floor(num(src.lineBytes, 16)),
    elemBytes: Math.floor(num(src.elemBytes, 4)),
    count: Math.max(1, Math.floor(num(src.count, 8))),
  };
}

/** 긴 캡션을 두 도막으로 나눈다. 자리는 늘 두 줄을 잡아 두므로 높이는 안 변한다. */
function foldCaption(content: string): [string, string] {
  if (content.length <= CAP_WRAP) return [content, ''];
  const cut = content.lastIndexOf(' ', CAP_WRAP);
  if (cut <= 0) return [content.slice(0, CAP_WRAP), content.slice(CAP_WRAP)];
  return [content.slice(0, cut), content.slice(cut + 1)];
}

type CellState = 'stored' | 'resident' | 'hit' | 'miss';

export const spatialLocalityStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    // 러너가 붙여 준 캔버스다. 컨테이너를 비우면 이것이 떨어져 나간다 (S-view).
    const root = params.canvas;

    const perLine = Math.max(1, Math.floor(scene.lineBytes / scene.elemBytes));
    const lines = Math.max(1, Math.ceil(scene.count / perLine));
    // 줄 단위로 올라오므로 마지막 줄도 통째로 그린다.
    const cells = lines * perLine;

    const innerGap = (perLine - 1) * CELL_GAP;
    const field = PIECE_CANVAS_W - FIELD_L - SIDE_MIN;
    const cellW = Math.max(
      MIN_CELL_W,
      Math.min(
        CELL_MAX_W,
        Math.floor((field - GROUP_GAP * (lines - 1) - innerGap * lines) / cells),
      ),
    );
    const groupW = perLine * cellW + innerGap;
    const totalW = groupW * lines + GROUP_GAP * (lines - 1);
    const originX = Math.round(FIELD_L + (field - totalW) / 2);

    const cellX = (index: number): number => {
      const group = Math.floor(index / perLine);
      const slot = index - group * perLine;
      return originX + group * (groupW + GROUP_GAP) + slot * (cellW + CELL_GAP);
    };

    const ghost = (x: number, y: number): SVGRectElement =>
      makeRect({
        x,
        y,
        width: cellW,
        height: CELL_H,
        rx: 7,
        fill: 'none',
        stroke: colors.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 4',
      });

    // 1. 아래층의 빈 자리 — 줄이 올라간 뒤 드러나 원본이 남아 있음을 보인다.
    for (let i = 0; i < cells; i += 1) root.appendChild(ghost(cellX(i), MEM_Y));
    // 2. 위층의 빈 자리 — 줄이 올라와 앉을 곳.
    for (let i = 0; i < cells; i += 1) root.appendChild(ghost(cellX(i), CACHE_Y));

    // 3. 줄이 바뀌는 경계. 미스가 나는 자리는 여기뿐이다.
    for (let g = 1; g < lines; g += 1) {
      const x = originX + g * (groupW + GROUP_GAP) - GROUP_GAP / 2;
      root.appendChild(
        makeLine({
          x1: x,
          y1: CACHE_Y - 12,
          x2: x,
          y2: MEM_Y + CELL_H + 8,
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 5',
        }),
      );
    }

    // 4. 줄 묶음. 한 묶음이 통째로 움직이는 단위다.
    const lineGroups: SVGGElement[] = [];
    const cellFills: SVGRectElement[] = [];
    const cellLabels: SVGTextElement[] = [];

    for (let g = 0; g < lines; g += 1) {
      const group = makeGroup();
      for (let slot = 0; slot < perLine; slot += 1) {
        const index = g * perLine + slot;
        const box = makeRect({
          x: cellX(index),
          y: MEM_Y,
          width: cellW,
          height: CELL_H,
          rx: 7,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        const label = makeText(
          {
            x: cellX(index) + cellW / 2,
            y: MEM_Y + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          `a[${index}]`,
        );
        group.appendChild(box);
        group.appendChild(label);
        cellFills[index] = box;
        cellLabels[index] = label;
      }
      lineGroups[g] = group;
      root.appendChild(group);
    }

    // 5. 주소 · 줄 이름 · 층 이름. 전부 표식이라 키를 만들지 않는다 (C10).
    for (let i = 0; i < cells; i += 1) {
      root.appendChild(
        makeText(
          {
            x: cellX(i) + cellW / 2,
            y: ADDR_Y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          String(i * scene.elemBytes),
        ),
      );
    }

    for (let g = 0; g < lines; g += 1) {
      root.appendChild(
        makeText(
          {
            x: originX + g * (groupW + GROUP_GAP) + groupW / 2,
            y: LINE_Y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          `line ${g}`,
        ),
      );
    }

    const tier = (y: number, name: string): SVGTextElement =>
      makeText(
        {
          x: GUTTER_X,
          y: y + CELL_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        name,
      );
    root.appendChild(tier(CACHE_Y, 'cache'));
    root.appendChild(tier(MEM_Y, 'memory'));

    // 6. 커서. 옆으로 미끄러지는 것이 이 조각의 주 운동이다.
    const cursor = makeGroup();
    const caretX = cellX(0) + cellW / 2;
    cursor.appendChild(
      makeRect({
        x: cellX(0) - 4,
        y: CACHE_Y - 4,
        width: cellW + 8,
        height: CELL_H + 8,
        rx: 10,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 3,
      }),
    );
    cursor.appendChild(
      makePath({
        d: `M ${caretX - 6} ${CACHE_Y - 16} L ${caretX + 6} ${CACHE_Y - 16} L ${caretX} ${CACHE_Y - 8} Z`,
        fill: colors.accent,
      }),
    );
    cursor.style.opacity = '0';
    cursor.style.transform = `translate(0px, ${-CURSOR_DROP}px)`;
    root.appendChild(cursor);

    // 7. 캡션. 두 줄 자리를 늘 잡아 두어 세로가 재생 중에 바뀌지 않게 한다 (S-view).
    const caption = makeText(
      {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      },
      '',
    );
    const capTop = set(document.createElementNS(SVG_NS, 'tspan'), {
      x: PIECE_CANVAS_W / 2,
      y: CAP_Y,
    });
    const capBottom = set(document.createElementNS(SVG_NS, 'tspan'), {
      x: PIECE_CANVAS_W / 2,
      y: CAP_Y + CAP_LINE_H,
    });
    caption.appendChild(capTop);
    caption.appendChild(capBottom);
    root.appendChild(caption);

    // ── 기다림. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    function paint(index: number, state: CellState): void {
      const box = cellFills[index];
      const label = cellLabels[index];
      if (!box || !label) return;
      if (state === 'stored') {
        box.setAttribute('fill', colors.bgSubtle);
        box.setAttribute('stroke', colors.border);
        label.setAttribute('fill', colors.textMuted);
        return;
      }
      if (state === 'resident') {
        box.setAttribute('fill', colors.itemDefault);
        box.setAttribute('stroke', colors.text);
        label.setAttribute('fill', colors.text);
        return;
      }
      if (state === 'hit') {
        box.setAttribute('fill', colors.itemSorted);
        box.setAttribute('stroke', colors.itemSorted);
        label.setAttribute('fill', colors.textInverse);
        return;
      }
      box.setAttribute('fill', colors.itemSwapping);
      box.setAttribute('stroke', colors.itemSwapping);
      label.setAttribute('fill', colors.stateInk);
    }

    let cursorShown = false;
    let cursorAt = 0;

    /** 커서를 index 로 옮긴다. 실제로 움직였으면 true. */
    function placeCursor(index: number): boolean {
      const dx = cellX(index) - cellX(0);
      if (cursorShown && index === cursorAt) return false;
      cursor.style.transition = `transform ${SLIDE_MS}ms ease-out, opacity ${SLIDE_MS}ms ease-out`;
      cursor.style.transform = `translate(${dx}px, 0px)`;
      cursor.style.opacity = '1';
      cursorShown = true;
      cursorAt = index;
      return true;
    }

    const setCaption = (content: string): void => {
      const [top, bottom] = foldCaption(content);
      capTop.textContent = top;
      capBottom.textContent = bottom;
    };

    const probe = async (index: number): Promise<void> => {
      if (placeCursor(index)) await wait(SLIDE_MS);
    };

    const lift = async (line: number, index: number): Promise<void> => {
      const group = lineGroups[line];
      if (group) {
        group.style.transition = `transform ${LIFT_MS}ms cubic-bezier(0.2, 0.8, 0.25, 1)`;
        group.style.transform = `translate(0px, ${CACHE_Y - MEM_Y}px)`;
        // 올라오면서 아래층의 옅은 칸이 위층의 또렷한 칸이 된다.
        for (let slot = 0; slot < perLine; slot += 1) paint(line * perLine + slot, 'resident');
        await wait(LIFT_MS);
      }
      paint(index, 'miss');
    };

    const touch = async (index: number): Promise<void> => {
      if (placeCursor(index)) await wait(SLIDE_MS);
      paint(index, 'hit');
    };

    const finish = (): void => {
      // 커서를 거둔다. 마지막 화면에 남는 것은 칸들의 색 — 그것이 곧 셈이다.
      cursor.style.transition = `opacity ${SLIDE_MS}ms ease-out`;
      cursor.style.opacity = '0';
      cursorShown = false;
    };

    const rewind = (): void => {
      cursor.style.transition = 'none';
      cursor.style.opacity = '0';
      cursor.style.transform = `translate(0px, ${-CURSOR_DROP}px)`;
      cursorShown = false;
      cursorAt = 0;
      for (let g = 0; g < lines; g += 1) {
        const group = lineGroups[g];
        if (!group) continue;
        group.style.transition = 'none';
        group.style.transform = 'translate(0px, 0px)';
      }
      for (let i = 0; i < cells; i += 1) paint(i, 'stored');
      setCaption('');
      // 되돌린 자리를 한 번 굳힌다 — 이어지는 걸음이 옛 자리에서 미끄러지지 않게.
      root.getBoundingClientRect();
    };

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다. 이것이 없으면 projector 가 붙든 promise 가
        // 영영 안 풀려 알고리즘이 통째로 매달린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.textContent = '';
      },
      setCaption,
      probe,
      lift,
      touch,
      finish,
      rewind,
    };
  },
};
