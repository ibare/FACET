/**
 * spatial-locality-stage — 한 줄이 통째로 올라오는 그림.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세운다 (S-scene). 되돌릴 명령이 없으므로 늘 비우고 다시 짓는다.
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
 * ── 두 축을 가른다 (프로토콜 4 절)
 *
 *   **채움 = 캐시의 형편** — 이 칸이 위층에 올라와 있나. 자리(위층/아래층)가
 *   같은 것을 말하고 칠이 거든다.
 *   **테두리 = 짚음의 표식** — 이 칸을 **내가 실제로 물었나**. 쌓이고 지워지지 않는다.
 *
 * 둘을 한 축에 실으면 **덤으로 올라온 이웃**이 "내가 물은 칸" 으로 읽혀 이 조각의
 * 주장이 뒤집힌다. 옮기기 전 `CellState` 넷(`stored`·`resident`·`hit`·`miss`)이
 * 바로 그 한 축이었다. 갈라 두면 줄이 올라온 직후 화면에 **굵은 테 하나와 민둥 셋**
 * 이 나란히 서서, 넷 중 하나만 물었는데 넷이 다 올라왔다는 것이 한눈에 보인다.
 *
 * ── 내려간 자국은 쌓인다
 *
 * 아래층까지 내려가는 일은 줄이 바뀌는 자리에서만 일어난다. 그 일이 운동으로만
 * 지나가면 다 끝난 화면에서 "여덟 번 짚는 동안 두 번" 이 세어지지 않는다. 그래서
 * 내려간 자리마다 두 층 사이에 **화살 자국**을 남긴다. 짚은 칸은 여덟인데 화살은
 * 둘 — 그것이 이 조각의 결론이고, 화살과 캡션의 수가 같은 자료에서 나온다.
 *
 * ── 문자
 *
 * 장면 방식에서는 문안을 stage 가 만든다 — 장면은 무엇을 말할지만 담는다 (C10).
 * 캡션 넷은 `params.t` 로 짓고, 그 밖에 그리는 글자는 전부 표식이다 (C10 판정
 * 1·2 — 도식에 새겨진 소문자 한 단어 `cache` / `memory`, 코드 표기 `a[0]`,
 * 수 표기인 주소와 `line 0`).
 *
 * 색은 전부 design-tokens 경유다 (S-view). 가로는 러너가 `PIECE_CANVAS_W` 로
 * 정하고, 세로는 이 그림이 정하므로 여기 상수로 둔다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

import { addrOf, cellCountOf, lineOf, spanOf } from './algorithm.js';
import { activeIndex, missCount, type SpatialLocalityScene } from './scene.js';

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

/** 내려간 자국이 걸리는 두 층 사이. */
const TRACE_BOT = MEM_Y - 6;
const TRACE_TOP = CACHE_Y + CELL_H + 6;
const TRACE_HEAD = 6;

/** 커서가 처음 떨어져 내리는 높이. */
const CURSOR_DROP = 14;
const SLIDE_MS = 240;
const LIFT_MS = 420;
const FADE_MS = 240;
const FRAME_MS = 16;

/** 캡션 한 줄에 담는 글자 수. 넘치면 두 줄로 접는다. */
const CAP_WRAP = 62;

/** 짚어 본 칸의 테. 쌓이고 지워지지 않는다. */
const MARK_WIDTH = '3';
const PLAIN_WIDTH = '1.5';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/**
 * 캔버스에서 역산한 자리.
 *
 * 이름이 `Scene` 이면 장면과 부딪히므로 `Layout` 으로 가른다. 줄 묶음은
 * `lineOf` 가 나누고 (그 셈이 이 조각의 요점이라 두 곳에 적지 않는다), 자리는
 * **먼저 한 번에 셈해 두고** 그 다음에 그린다 — 그리면서 이웃의 지금 좌표를
 * 읽으면 순회 순서가 숨은 상태가 된다 (프로토콜 4 절).
 */
type Layout = {
  cells: number;
  lineCount: number;
  /** 한 줄에 함께 실려 오는 원소 수. 캡션의 `{span}` 이 이것이다. */
  perLine: number;
  /** 줄 → 그 줄에 실린 칸 색인들. */
  groups: number[][];
  /** 칸 → 그 칸이 속한 줄. */
  lineOfCell: number[];
  cellW: number;
  cellX: (i: number) => number;
  groupLeft: (g: number) => number;
  groupW: (g: number) => number;
};

function layoutOf(scene: SpatialLocalityScene): Layout {
  const base = scene.base;
  const cells = cellCountOf(base);

  const groups: number[][] = [];
  const lineOfCell: number[] = [];
  for (let i = 0; i < cells; i += 1) {
    const g = lineOf(i, base);
    lineOfCell[i] = g;
    (groups[g] ??= []).push(i);
  }
  const lineCount = groups.length;

  const field = PIECE_CANVAS_W - FIELD_L - SIDE_MIN;
  const gapTotal = (cells - lineCount) * CELL_GAP + (lineCount - 1) * GROUP_GAP;
  const cellW = Math.max(
    MIN_CELL_W,
    Math.min(CELL_MAX_W, Math.floor((field - gapTotal) / cells)),
  );
  const totalW = cells * cellW + gapTotal;
  const originX = Math.round(FIELD_L + (field - totalW) / 2);

  const xs: number[] = [];
  const lefts: number[] = [];
  const widths: number[] = [];
  let x = originX;
  for (let g = 0; g < lineCount; g += 1) {
    lefts[g] = x;
    for (const i of groups[g]) {
      xs[i] = x;
      x += cellW + CELL_GAP;
    }
    widths[g] = x - CELL_GAP - lefts[g];
    x += GROUP_GAP - CELL_GAP;
  }

  return {
    cells,
    lineCount,
    perLine: spanOf(base),
    groups,
    lineOfCell,
    cellW,
    cellX: (i: number): number => xs[i] ?? originX,
    groupLeft: (g: number): number => lefts[g] ?? originX,
    groupW: (g: number): number => widths[g] ?? cellW,
  };
}

/** 긴 캡션을 두 도막으로 나눈다. 자리는 늘 두 줄을 잡아 두므로 높이는 안 변한다. */
function foldCaption(content: string): [string, string] {
  if (content.length <= CAP_WRAP) return [content, ''];
  const cut = content.lastIndexOf(' ', CAP_WRAP);
  if (cut <= 0) return [content.slice(0, CAP_WRAP), content.slice(CAP_WRAP)];
  return [content.slice(0, cut), content.slice(cut + 1)];
}

export const spatialLocalityStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    // 장면 방식에서는 문안을 stage 가 만든다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 러너가 붙여 준 캔버스다. 컨테이너를 비우면 이것이 떨어져 나간다 (S-view).
    const root = params.canvas;
    root.textContent = '';

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 새로 오면 앞 세대의 운동은 화면에 손대지 않고 물러난다.
     *
     * 정적 그리기가 칸을 매번 새로 짓지만 **손잡이 배열을 다시 채우므로**, 앞
     * 세대가 프레임 안에서 그 배열을 읽으면 살아 있는 화면에 옛 값을 쓴다
     * (프로토콜 3-4 절).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * rAF 대신 타이머 보간. CSS transition 은 되짚은 뒤에도 혼자 흘러간다
     * (MUST NOT). 옮기기 전 이 파일은 `style.transition` 을 다섯 곳에서 썼다.
     *
     * **프레임마다 세대를 본다.** `destroy` 가 운동 도중에 오는 길은 실제로
     * 열려 있고, 그때 남은 프레임이 이미 떼어 낸 화면에 쓰면 안 된다.
     */
    function animate(ms: number, mine: number, onFrame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || !alive(mine)) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed || !alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          onFrame(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 레이어. 한 번만 짓고, 그릴 때마다 비운다.
    const gGhost = el('g', {});
    const gBound = el('g', {});
    const gTrace = el('g', {});
    const gLines = el('g', {});
    const gAxis = el('g', {});
    const gCursor = el('g', {});
    const gCaption = el('g', {});
    const layers = [gGhost, gBound, gTrace, gLines, gAxis, gCursor, gCaption];
    for (const g of layers) root.appendChild(g);

    // ── 정적 그리기가 다시 채우는 손잡이들
    let cellRects: SVGRectElement[] = [];
    let cellLabels: SVGTextElement[] = [];
    let groupNodes: SVGGElement[] = [];
    let traceNodes: { stem: SVGLineElement; head: SVGPathElement }[] = [];

    /** 늘 비우고 시작한다. 레이어 자신의 속성도 되돌린다 — 자식을 비워도 남는다. */
    function clear(): void {
      for (const g of layers) {
        g.textContent = '';
        g.removeAttribute('opacity');
        g.removeAttribute('transform');
      }
      cellRects = [];
      cellLabels = [];
      groupNodes = [];
      traceNodes = [];
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────────

    const ghost = (x: number, y: number, w: number): SVGRectElement =>
      el('rect', {
        x,
        y,
        width: w,
        height: CELL_H,
        rx: 7,
        fill: 'none',
        stroke: colors.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 4',
      });

    function drawGhosts(geo: Layout): void {
      // 아래층의 빈 자리 — 줄이 올라간 뒤 드러나 원본이 남아 있음을 보인다.
      for (let i = 0; i < geo.cells; i += 1) {
        gGhost.appendChild(ghost(geo.cellX(i), MEM_Y, geo.cellW));
      }
      // 위층의 빈 자리 — 줄이 올라와 앉을 곳.
      for (let i = 0; i < geo.cells; i += 1) {
        gGhost.appendChild(ghost(geo.cellX(i), CACHE_Y, geo.cellW));
      }
    }

    /** 줄이 바뀌는 경계. 미스가 나는 자리는 여기뿐이다. */
    function drawBounds(geo: Layout): void {
      for (let g = 1; g < geo.lineCount; g += 1) {
        const x = geo.groupLeft(g) - GROUP_GAP / 2;
        gBound.appendChild(
          el('line', {
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
    }

    /** 그 줄을 데리러 내려간 칸. 줄마다 하나뿐이고 미스가 난 그 칸이다. */
    function trigger(scene: SpatialLocalityScene, geo: Layout, line: number): number {
      for (let i = 0; i < scene.outcomes.length; i += 1) {
        if (scene.outcomes[i] === 'miss' && geo.lineOfCell[i] === line) return i;
      }
      return geo.groups[line]?.[0] ?? 0;
    }

    /**
     * 내려간 자국. 올라온 줄마다 하나씩 쌓이고 지워지지 않는다.
     *
     * 아직 안 올라온 줄에는 **짓지 않는다** — 숨기기만 하면 앞 걸음의 길이가
     * 남아 되짚기 판정에서 어긋난다 (프로토콜 4 절).
     */
    function drawTraces(scene: SpatialLocalityScene, geo: Layout): void {
      for (const line of scene.lifted) {
        const cx = geo.cellX(trigger(scene, geo, line)) + geo.cellW / 2;
        const stem = el('line', {
          x1: cx,
          y1: TRACE_BOT,
          x2: cx,
          y2: TRACE_TOP,
          stroke: colors.itemSwapping,
          'stroke-width': 2.5,
        });
        const head = el('path', {
          d: `M ${cx - TRACE_HEAD} ${TRACE_TOP + TRACE_HEAD} L ${cx + TRACE_HEAD} ${TRACE_TOP + TRACE_HEAD} L ${cx} ${TRACE_TOP} Z`,
          fill: colors.itemSwapping,
        });
        gTrace.appendChild(stem);
        gTrace.appendChild(head);
        traceNodes.push({ stem, head });
      }
    }

    /**
     * 칸의 옷.
     *
     * 채움은 **캐시의 형편**(올라와 있나), 테두리는 **짚음의 표식**(물었나).
     * 둘을 갈라 두면 덤으로 올라온 이웃과 내가 물은 칸이 한 화면에 함께 선다.
     */
    function dressCell(i: number, resident: boolean, touched: boolean): void {
      const rect = cellRects[i];
      const label = cellLabels[i];
      if (!rect || !label) return;
      rect.setAttribute('fill', resident ? colors.itemDefault : colors.bgSubtle);
      rect.setAttribute('stroke', touched ? colors.text : colors.border);
      rect.setAttribute('stroke-width', touched ? MARK_WIDTH : PLAIN_WIDTH);
      label.setAttribute('fill', resident ? colors.text : colors.textMuted);
    }

    function drawLines(scene: SpatialLocalityScene, geo: Layout): void {
      const lifted = new Set(scene.lifted);
      for (let g = 0; g < geo.lineCount; g += 1) {
        const node = el('g', {
          transform: `translate(0 ${lifted.has(g) ? CACHE_Y - MEM_Y : 0})`,
        });
        for (const i of geo.groups[g]) {
          const rect = el('rect', {
            x: geo.cellX(i),
            y: MEM_Y,
            width: geo.cellW,
            height: CELL_H,
            rx: 7,
          });
          const label = el('text', {
            x: geo.cellX(i) + geo.cellW / 2,
            y: MEM_Y + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          label.textContent = `a[${i}]`;
          node.appendChild(rect);
          node.appendChild(label);
          cellRects[i] = rect;
          cellLabels[i] = label;
          dressCell(i, lifted.has(g), i < scene.outcomes.length);
        }
        gLines.appendChild(node);
        groupNodes[g] = node;
      }
    }

    /** 주소 · 줄 이름 · 층 이름. 전부 표식이라 키를 만들지 않는다 (C10). */
    function drawAxis(scene: SpatialLocalityScene, geo: Layout): void {
      for (let i = 0; i < geo.cells; i += 1) {
        const node = el('text', {
          x: geo.cellX(i) + geo.cellW / 2,
          y: ADDR_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        node.textContent = String(addrOf(i, scene.base));
        gAxis.appendChild(node);
      }

      for (let g = 0; g < geo.lineCount; g += 1) {
        const node = el('text', {
          x: geo.groupLeft(g) + geo.groupW(g) / 2,
          y: LINE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        node.textContent = `line ${g}`;
        gAxis.appendChild(node);
      }

      for (const [y, name] of [
        [CACHE_Y, 'cache'],
        [MEM_Y, 'memory'],
      ] as const) {
        const node = el('text', {
          x: GUTTER_X,
          y: y + CELL_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        node.textContent = name;
        gAxis.appendChild(node);
      }
    }

    /** 커서. 옆으로 미끄러지는 것이 이 조각의 주 운동이다. */
    function buildCursor(geo: Layout, index: number): void {
      const x = geo.cellX(index);
      const cx = x + geo.cellW / 2;
      gCursor.appendChild(
        el('rect', {
          x: x - 4,
          y: CACHE_Y - 4,
          width: geo.cellW + 8,
          height: CELL_H + 8,
          rx: 10,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 3,
        }),
      );
      gCursor.appendChild(
        el('path', {
          d: `M ${cx - 6} ${CACHE_Y - 16} L ${cx + 6} ${CACHE_Y - 16} L ${cx} ${CACHE_Y - 8} Z`,
          fill: colors.accent,
        }),
      );
    }

    function drawCursor(scene: SpatialLocalityScene, geo: Layout): void {
      // 다 짚고 나면 커서를 거둔다 — 마지막 화면에 남는 것은 칸의 옷과 자국이다.
      if (scene.step === null || scene.step.kind === 'done') return;
      const index = activeIndex(scene);
      if (index === null) return;
      buildCursor(geo, index);
    }

    function captionText(scene: SpatialLocalityScene, geo: Layout): string | null {
      const step = scene.step;
      if (step === null) return null;
      const index = activeIndex(scene);

      if (step.kind === 'lift') {
        return t('caption.lift', 'Miss. A whole line rises — {span} come up together.', {
          span: geo.perLine,
        });
      }
      if (step.kind === 'done') {
        const misses = missCount(scene);
        const touches = scene.outcomes.length;
        return t('caption.done', '{touches} touches: {hits} rode along, {misses} went down.', {
          touches,
          hits: touches - misses,
          misses,
        });
      }
      if (index === null) return null;
      const args = {
        i: index,
        addr: addrOf(index, scene.base),
        line: lineOf(index, scene.base),
      };
      return step.kind === 'probe'
        ? t('caption.probe', 'a[{i}] — address {addr}, line {line}. Not up here.', args)
        : t('caption.hit', 'a[{i}] — address {addr}, line {line}. Already up here.', args);
    }

    function drawCaption(scene: SpatialLocalityScene, geo: Layout): void {
      const content = captionText(scene, geo);
      if (content === null) return;
      const parts = foldCaption(content);
      for (let i = 0; i < parts.length; i += 1) {
        if (!parts[i]) continue;
        const node = el('text', {
          x: PIECE_CANVAS_W / 2,
          y: CAP_Y + i * CAP_LINE_H,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        node.textContent = parts[i];
        gCaption.appendChild(node);
      }
    }

    /** 장면이 말하는 것을 전부 세운다. 어느 걸음에서 오든 결과가 같다. */
    function drawStatic(scene: SpatialLocalityScene): Layout {
      clear();
      const geo = layoutOf(scene);
      drawGhosts(geo);
      drawBounds(geo);
      drawTraces(scene, geo);
      drawLines(scene, geo);
      drawAxis(scene, geo);
      drawCursor(scene, geo);
      drawCaption(scene, geo);
      return geo;
    }

    // ── 운동 ────────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 오지
    // 않은 만큼을 뒤로 물려** 놓고 제자리로 돌려놓는 꼴이 된다.
    //
    // 출발 자리는 **장면에서 셈한다.** 짚기는 a[0] 부터 차례로 하나씩 쌓이므로
    // 지금 칸이 `outcomes.length − 1` 이고 앞 칸이 그 하나 앞이다. 화면의 지금
    // 자리를 따로 적어 둔 표를 되읽으면 되짚어 세운 직후에 그것이 옛 화면의
    // 것이라 엉뚱한 데서 출발한다 (프로토콜 4 절).

    /** 커서가 앞 칸에서 지금 칸으로 미끄러진다. 처음이면 위에서 떨어져 내린다. */
    async function flowSlide(scene: SpatialLocalityScene, geo: Layout, mine: number): Promise<void> {
      const to = activeIndex(scene);
      if (to === null) return;
      const from = to > 0 ? to - 1 : null;
      const dx = from === null ? 0 : geo.cellX(from) - geo.cellX(to);
      const dy = from === null ? -CURSOR_DROP : 0;

      await animate(SLIDE_MS, mine, (e) => {
        if (e >= 1) {
          gCursor.removeAttribute('transform');
          gCursor.removeAttribute('opacity');
          return;
        }
        gCursor.setAttribute('transform', `translate(${dx * (1 - e)} ${dy * (1 - e)})`);
        if (from === null) gCursor.setAttribute('opacity', String(e));
      });
    }

    /**
     * 줄이 통째로 올라오고 내려간 자국이 그만큼 자란다.
     *
     * 한 뜻으로 묶인 운동이라 **시계를 둘로 나누지 않는다** — 옮길 것을 한 목록에
     * 모아 한 `animate` 로 흘린다 (프로토콜 3-4 절).
     */
    async function flowLift(scene: SpatialLocalityScene, mine: number): Promise<void> {
      const line = scene.lifted[scene.lifted.length - 1];
      if (line === undefined) return;
      const node = groupNodes[line];
      const trace = traceNodes[scene.lifted.length - 1];
      if (!node) return;
      const rise = CACHE_Y - MEM_Y;

      await animate(LIFT_MS, mine, (e) => {
        if (e >= 1) {
          node.setAttribute('transform', `translate(0 ${rise})`);
          if (trace) {
            trace.head.setAttribute('transform', 'translate(0 0)');
            trace.stem.setAttribute('y2', String(TRACE_TOP));
          }
          return;
        }
        node.setAttribute('transform', `translate(0 ${rise * e})`);
        if (!trace) return;
        // 자국은 아래층에서 자라 올라온다. 아직 못 온 만큼을 뒤로 물린다.
        const lag = (TRACE_BOT - TRACE_TOP) * (1 - e);
        trace.head.setAttribute('transform', `translate(0 ${lag})`);
        trace.stem.setAttribute('y2', String(TRACE_TOP + lag));
      });
    }

    /** 다 짚었다 — 커서가 물러난다. 정지 화면에는 없으므로 여기서만 짓는다. */
    async function flowDone(scene: SpatialLocalityScene, geo: Layout, mine: number): Promise<void> {
      const index = activeIndex(scene);
      if (index === null) return;
      buildCursor(geo, index);
      await animate(FADE_MS, mine, (e) => {
        if (e >= 1) {
          gCursor.textContent = '';
          gCursor.removeAttribute('opacity');
          return;
        }
        gCursor.setAttribute('opacity', String(1 - e));
      });
    }

    async function flow(
      scene: SpatialLocalityScene,
      geo: Layout,
      mine: number,
    ): Promise<void> {
      switch (scene.step?.kind) {
        case 'probe':
        case 'touch':
          return flowSlide(scene, geo, mine);
        case 'lift':
          return flowLift(scene, mine);
        case 'done':
          return flowDone(scene, geo, mine);
        default:
          return;
      }
    }

    /**
     * 장면을 그린다.
     *
     * `prev` 는 쓰지 않는다 — 무엇을 흐르게 할지는 `step` 이 말하고, 출발 그림은
     * 장면에서 셈으로 복원한다 (S-scene 의 "`prev` 는 고르는 데만").
     */
    async function render(
      next: SpatialLocalityScene,
      _prev: SpatialLocalityScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const geo = drawStatic(next);
      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다 (S-scene MUST).
      if (!opts.animate) return;
      await flow(next, geo, mine);
      if (!alive(mine)) return;
      // 운동이 남긴 속성·보간 끝자리를 통째로 지운다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다. 이것이 없으면 걸음이 붙든 promise 가 영영 안
        // 풀려 알고리즘이 통째로 매달린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
