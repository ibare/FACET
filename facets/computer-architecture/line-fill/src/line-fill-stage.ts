/**
 * line-fill-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이
 * 필요 없다 (S-scene).
 *
 * ── 그림의 뼈대
 *
 * 두 층이다. 아래가 메모리, 위가 캐시다. 아래층에는 원소가 줄 단위로 묶여
 * 늘어서 있고, 위층에는 그 줄이 들어앉을 자리가 비어 있다. 한 칸을 부르면 그
 * 칸 위에 표가 내려앉고, 곧 그 칸이 **속한 줄 전체**가 한 덩어리로 위층까지
 * 올라간다.
 *
 * 운동은 실제 이동이다. 페이드로 바꾸면 "딸려 온다" 가 "나타난다" 가 된다.
 *
 * ── 칠의 축을 가른다 (S-scene · 프로토콜 4 절)
 *
 *   채움   = **이 칸이 캐시에 있나.** 위층에 올라온 칸은 찬 칠(`itemActive`),
 *            아래층의 원본은 빈 칠(`itemDefault`). 층이 곧 형편이므로 두 층의
 *            채움이 갈린다.
 *   테두리 = **이번에 실제로 물은 칸인가.** 물은 칸은 굵은 실선(`primary`),
 *            묻지 않았는데 딸려 온 칸은 가는 점선(`ghostOutline`).
 *
 * 이 조각의 주장이 바로 그 갈림에 있다 — 위층의 열두 칸은 채움이 모두 같고
 * (열둘 다 캐시에 올라왔다) 테두리는 셋만 굵다 (부른 것은 셋뿐이다). 한 축에
 * 얹으면 덤으로 온 칸이 "내가 물은 칸" 으로 읽힌다.
 *
 * 아래층의 굵은 테두리는 **지워지지 않고 쌓인다.** 두 번째 물음이 첫 번째의
 * 자국을 덮으면 "세 번 물었다" 가 완주 화면에서 사라진다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 올라온 줄은 이미 위층에 서 있다. 걸음은 **아직 못 온
 * 만큼을 아래로 물려** 두었다가 놓아 준다. 줄 하나는 한 덩어리로 움직이므로
 * 시계를 칸마다 나누지 않고 `<g>` 하나를 한 보간으로 흘린다 (S-scene).
 * 앉고 나서야 덤 칸의 덮개가 걷히며 부른 칸과 갈라 보인다 — 같은 보간의
 * 뒷구간이라 시계는 여전히 하나다.
 *
 * 세로는 그림이 정해 여기 상수로 둔다. 가로는 러너가 준다 (S-view).
 * 층 이름(`cache` · `memory`) 과 바이트 범위 · 칸 이름은 도식 표식이라 키를
 * 만들지 않는다 (C10). 문장인 캡션만 `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  indicesOfLine,
  linesIn,
  movingOf,
  perLineIn,
  type LineFillCaption,
  type LineFillScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * 층 이름. 소문자 도식 라벨 한 단어는 표식이라 키를 만들지 않는다 (C10).
 * 바이트 범위(`0–15`)와 칸 이름(`a[3]`)도 같은 까닭으로 셈해서 그대로 새긴다.
 */
const FLOOR_UPPER = 'cache';
const FLOOR_LOWER = 'memory';

/** 세로. 두 층과 캡션이 정한 값이며 마운트한 뒤 바뀌지 않는다 (S-view). */
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
/** 칸 하나의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 54;

/** 표가 내려앉는 거리. 그만큼 위에서 떨어진다. */
const MARK_DROP = 10;
const MARK_MS = 220;

/** 줄이 올라오고, 앉은 뒤 덤 칸이 갈라져 보이기까지. 한 시계다. */
const RISE_MS = 660;
/** 그 시계 안에서 올라오기가 끝나는 자리. 나머지가 갈라짐이다. */
const RISE_MOVE_END = 0.7;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 자리 셈. 그리기 전에 한 번에 낸다 — 그리면서 재면 순회 순서가 숨은 상태가 된다. */
type Layout = {
  perLine: number;
  lines: number[];
  cellW: number;
  groupX: (slot: number) => number;
  originX: number;
};

/**
 * 칸 하나를 그리는 데 드는 것 전부.
 *
 * 두 축이 여기서 갈린다 — `inCache` 가 채움을, `asked` 가 테두리를 정한다.
 * 칸 폭도 인자로 받는다. 그리는 동안만 서는 변수를 바깥에 두면 그것이 곧
 * 숨은 상태가 된다.
 */
type CellSpec = {
  cellW: number;
  index: number;
  elemSize: number;
  inCache: boolean;
  asked: boolean;
};

/** 한 줄이 위층에 선 모습. 운동이 이 손잡이를 쓴다. */
type RisenGroup = { g: SVGElement; covers: SVGElement[] };

/** 정적 그리기가 세운 것 가운데 운동이 다시 찾아야 하는 것. */
type Drawn = {
  layout: Layout;
  risen: Map<number, RisenGroup>;
  mark: SVGElement | null;
  markX: number;
};

export const lineFillStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<LineFillScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const W = PIECE_CANVAS_W;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기나 unmount 가 끼어들면
     * 남은 프레임이 **이미 새로 선 화면**을 덮을 수 있으므로, 프레임마다 자기
     * 번호가 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는
     * 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을
          // 덮는 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function layoutOf(scene: LineFillScene): Layout {
      const perLine = perLineIn(scene);
      const lines = linesIn(scene);
      const groups = Math.max(1, lines.length);
      const cellCount = Math.max(1, lines.length * perLine);
      // 남는 폭을 여백으로 버리지 않는다. 상수로는 상한만 둔다 (S-piece).
      const room = W - SIDE_MIN * 2 - GROUP_GAP * (groups - 1);
      const cellW = Math.max(1, Math.min(CELL_MAX_W, Math.floor(room / cellCount)));
      const spanW = cellCount * cellW + GROUP_GAP * (groups - 1);
      const originX = Math.round((W - spanW) / 2);
      return {
        perLine,
        lines,
        cellW,
        originX,
        groupX: (slot: number): number => originX + slot * (perLine * cellW + GROUP_GAP),
      };
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function floorLabel(parent: SVGElement, x: number, y: number, text: string): void {
      const node = el('text', {
        x,
        y,
        'text-anchor': 'start',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      node.textContent = text;
      parent.appendChild(node);
    }

    /**
     * 칸 하나.
     *
     * `inCache` 가 채움을 정하고 `asked` 가 테두리를 정한다 — 두 축이 서로를
     * 덮지 않으므로 "올라왔다" 와 "물었다" 가 한 화면에 함께 선다.
     */
    function drawCell(parent: SVGElement, x: number, y: number, cell: CellSpec): void {
      const { cellW, index, elemSize, inCache, asked } = cell;
      const box = el('rect', {
        x,
        y,
        width: cellW,
        height: CELL_H,
        rx: 3,
        fill: inCache ? c.itemActive : c.itemDefault,
        stroke: asked ? c.primary : inCache ? c.ghostOutline : c.border,
        'stroke-width': asked ? 2 : 1,
      });
      if (inCache && !asked) box.setAttribute('stroke-dasharray', '3 3');
      const name = el('text', {
        x: x + cellW / 2,
        y: y + 19,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: inCache ? c.stateInk : c.text,
      });
      name.textContent = `a[${index}]`;
      const addr = el('text', {
        x: x + cellW / 2,
        y: y + 33,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: inCache ? c.stateInk : c.textMuted,
      });
      addr.textContent = String(index * elemSize);
      parent.appendChild(box);
      parent.appendChild(name);
      parent.appendChild(addr);
    }

    function captionText(cap: LineFillCaption | null): string {
      if (cap === null) return '';
      if (cap.kind === 'ask') {
        return t('caption.ask', 'You name one cell: a[{i}], at byte {addr}.', {
          i: cap.index,
          addr: cap.addr,
        });
      }
      if (cap.kind === 'rise') {
        return t('caption.rise', 'The whole line comes — bytes {lo}–{hi}. Three neighbours tag along.', {
          lo: cap.lo,
          hi: cap.hi,
        });
      }
      return t('caption.tally', 'Cells named: {asked}. Cells arrived: {arrived}.', {
        asked: cap.asked,
        arrived: cap.arrived,
      });
    }

    /**
     * 장면 하나를 통째로 세운다.
     *
     * 캔버스를 비우고 다시 짓는다 — 고정 자리에 남는 요소를 하나도 두지 않으므로
     * "재건 밖 요소" 가 없다 (S-scene). 표(mark)도 부르는 걸음에서만 지어지므로
     * 앞 걸음의 좌표가 남을 자리가 없다.
     */
    function drawScene(scene: LineFillScene): Drawn {
      svg.textContent = '';
      const layout = layoutOf(scene);
      const moving = movingOf(scene);
      const askedSet = new Set(scene.asks);

      const gFrames = el('g', {});
      const gLower = el('g', {});
      const gUpper = el('g', {});
      const gMark = el('g', {});
      const gCaption = el('g', {});
      svg.appendChild(gFrames);
      svg.appendChild(gLower);
      svg.appendChild(gUpper);
      svg.appendChild(gMark);
      svg.appendChild(gCaption);

      floorLabel(gFrames, layout.originX, UPPER_LABEL_Y, FLOOR_UPPER);
      floorLabel(gFrames, layout.originX, LOWER_LABEL_Y, FLOOR_LOWER);

      // 위층의 자리. 그 줄이 이미 올라왔으면 실선, 아직이면 점선이다 —
      // 옛 stage 가 `stroke-dasharray` 속성 하나에만 두던 말이다.
      for (const [slot, line] of layout.lines.entries()) {
        const here = scene.risen.includes(line);
        const frame = el('rect', {
          x: layout.groupX(slot) - FRAME_PAD,
          y: FRAME_Y,
          width: layout.perLine * layout.cellW + FRAME_PAD * 2,
          height: CELL_H + FRAME_PAD * 2,
          rx: 5,
          fill: 'none',
          stroke: here ? c.border : c.ghostOutline,
          'stroke-width': 1,
        });
        if (!here) frame.setAttribute('stroke-dasharray', '4 4');
        gFrames.appendChild(frame);

        const lo = line * scene.lineSize;
        const range = el('text', {
          x: layout.groupX(slot) + (layout.perLine * layout.cellW) / 2,
          y: RANGE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        range.textContent = `${lo}–${lo + scene.lineSize - 1}`;
        gFrames.appendChild(range);
      }

      // 아래층. 원본은 여기 남는다 — 위로 간 것은 복제본이다. 물은 자국은
      // 지워지지 않고 쌓인다.
      for (const [slot, line] of layout.lines.entries()) {
        for (const [k, index] of indicesOfLine(scene, line).entries()) {
          drawCell(gLower, layout.groupX(slot) + k * layout.cellW, LOWER_CELL_Y, {
            cellW: layout.cellW,
            index,
            elemSize: scene.elemSize,
            inCache: false,
            asked: askedSet.has(index),
          });
        }
      }

      // 위층. 올라온 줄만. 줄 하나가 `<g>` 하나라 한 덩어리로 움직인다.
      const risen = new Map<number, RisenGroup>();
      for (const line of scene.risen) {
        const slot = layout.lines.indexOf(line);
        if (slot < 0) continue;
        const g = el('g', {});
        const covers: SVGElement[] = [];
        for (const [k, index] of indicesOfLine(scene, line).entries()) {
          const x = layout.groupX(slot) + k * layout.cellW;
          const asked = askedSet.has(index);
          drawCell(g, x, UPPER_CELL_Y, {
            cellW: layout.cellW,
            index,
            elemSize: scene.elemSize,
            inCache: true,
            asked,
          });
          // 올라오는 동안 줄은 한 모습이다. 앉고 나서야 덤 칸의 덮개가 걷히며
          // 갈라 보인다. 덮개는 그 걸음에만 지어지고 정지 화면에서는 투명하다.
          if (!asked && moving !== null && moving.kind === 'rise' && moving.fresh && moving.line === line) {
            const cover = el('rect', {
              x,
              y: UPPER_CELL_Y,
              width: layout.cellW,
              height: CELL_H,
              rx: 3,
              fill: 'none',
              stroke: c.primary,
              'stroke-width': 2,
              opacity: 0,
            });
            covers.push(cover);
            g.appendChild(cover);
          }
        }
        gUpper.appendChild(g);
        risen.set(line, { g, covers });
      }

      // 지금 부르는 칸을 가리키는 표. 부르는 걸음에만 있다.
      let mark: SVGElement | null = null;
      let markX = 0;
      if (moving !== null && moving.kind === 'ask') {
        const line = Math.floor((moving.index * scene.elemSize) / scene.lineSize);
        const slot = layout.lines.indexOf(line);
        if (slot >= 0) {
          const column = moving.index - line * layout.perLine;
          markX = layout.groupX(slot) + column * layout.cellW + layout.cellW / 2;
          mark = el('path', {
            d: `M 0 ${MARK_DROP} L -6 0 L 6 0 Z`,
            fill: c.primary,
            transform: `translate(${markX.toFixed(1)} ${MARK_Y.toFixed(1)})`,
            opacity: 1,
          });
          gMark.appendChild(mark);
        }
      }

      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      caption.textContent = captionText(captionOf(scene));
      gCaption.appendChild(caption);

      return { layout, risen, mark, markX };
    }

    // ── 운동 ─────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 운동은 출발 자리로
    // **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 보간의 첫 호출에서 하고
    // 그 호출이 `tween` 안에서 곧바로 도므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /** 표가 위에서 내려앉는다 — 부른다는 말과 같은 동사다. */
    function flowAsk(d: Drawn, mine: number): Promise<void> {
      const mark = d.mark;
      if (mark === null) return Promise.resolve();
      const x = d.markX.toFixed(1);
      return tween(MARK_MS, mine, (p) => {
        const e = ease(p);
        mark.setAttribute('transform', `translate(${x} ${(MARK_Y - MARK_DROP * (1 - e)).toFixed(1)})`);
        mark.setAttribute('opacity', e.toFixed(2));
      });
    }

    /**
     * 줄 하나가 통째로 올라온다. 그리고 앉은 뒤 덤 칸이 갈라져 보인다.
     *
     * 한 뜻으로 묶인 운동이므로 시계를 나누지 않는다 — `<g>` 를 옮기는 일과
     * 덮개를 걷는 일이 한 보간의 앞구간·뒷구간이다 (S-scene).
     */
    function flowRise(d: Drawn, line: number, mine: number): Promise<void> {
      const group = d.risen.get(line);
      if (group === undefined) return Promise.resolve();
      const dy = LOWER_CELL_Y - UPPER_CELL_Y;
      return tween(RISE_MS, mine, (p) => {
        const m = ease(clamp01(p / RISE_MOVE_END));
        group.g.setAttribute('transform', `translate(0 ${(dy * (1 - m)).toFixed(2)})`);
        const s = clamp01((p - RISE_MOVE_END) / (1 - RISE_MOVE_END));
        const o = (1 - s).toFixed(2);
        for (const cover of group.covers) cover.setAttribute('opacity', o);
      });
    }

    function flowFor(d: Drawn, scene: LineFillScene, mine: number): Promise<void> {
      const moving = movingOf(scene);
      if (moving === null) return Promise.resolve();
      if (moving.kind === 'ask') return flowAsk(d, mine);
      // 이미 올라와 있던 줄을 다시 물으면 흐를 것이 없다 — 그것이 맞는 화면이다.
      if (moving.kind === 'rise') return moving.fresh ? flowRise(d, moving.line, mine) : Promise.resolve();
      return Promise.resolve();
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: LineFillScene,
      _prev: LineFillScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      await flowFor(drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 물려 둔 `transform` · 덮개의 `opacity` 가
      // 노드째 사라진다. 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
