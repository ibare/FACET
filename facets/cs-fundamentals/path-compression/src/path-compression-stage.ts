/**
 * 경로 압축 무대 — 자리 다섯을 한 줄로 그리고, 부모를 가리키는 곡선 화살을 얹는다.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이미 그려진 간선의 끝점을 옛 부모에서
 * 뿌리로 **보간해 옮기는** 것이 "접힌다" 는 동사다. 그 view 는 구조가 바뀌면 다시
 * 그릴 뿐이라 접히는 과정이 보이지 않는다 (원칙 6 의 예외 조건).
 *
 * "타고 오른다" 는 커서가 그 곡선을 따라 실제로 이동하는 것으로, "접힌다" 는 그
 * 곡선 자체가 뿌리로 다시 붙는 것 — 좌표가 실제로 바뀌는 것으로 표현한다. 둘 다
 * opacity 전환이 아니라 좌표 변화다 (S-piece MUST NOT).
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`init()` · `beginQuery()` · `climb()` · `compress()` …) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었고, 무엇보다 **어느 자리가 어디를 가리키나가 화살의 `d`
 * 속성과 딱지의 `textContent` 에만** 있었다. 이제 `render(next, prev, { animate })`
 * 하나가 그 장면의 화면 전체를 세운다 (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 화살도 딱지도 칸 수도 장면의 `parent` · `origin` 에서 **셈해진다**. 그러니 화살을
 * 하나씩 고쳐 쓰는 코드도, 앞 줄을 찾아 지우는 코드도 없다. 화면에 나란히 뜨는 두
 * 수 — 지금 몇 칸이고 전에 몇 칸이었나 — 는 같은 `hopsToRoot` 를 지난다.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에 서
 * 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그 장면을
 * 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도 다르면
 * 되짚기 판정이 어긋나기 때문이다.
 *
 * View 는 algorithm 의 타입을 모른다 — 이 파일이 받는 모양은 `scene.ts` 가 준다
 * (원칙 1).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import { hopsToRoot } from './scene.js';
import type {
  PathCompressionCaption,
  PathCompressionScene,
  PathCompressionStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 도식에 각인된 표식 — 번역 대상이 아니다 (C10 표식 판정 1·2). */
const MARK_ROOT = 'root';
const MARK_ARROW = '→';

// ── 기하 상수. 폭은 캔버스에서 역산하고, 여기 상수는 상한만 둔다 (S-piece).
const W = PIECE_CANVAS_W;
const CELL_MAX_W = 96;
const SIDE_MIN = 26;
const BOX_TOP = 132;
const BOX_H = 56;
const CAPTION_Y = 22;
const TALLY_Y = 22;
const POINTER_Y = BOX_TOP + BOX_H + 16;
const RESULT_START_Y = 224;
const RESULT_ROW_H = 22;
const RESULT_ROWS_MAX = 4;
const SUMMARY_Y = RESULT_START_Y + RESULT_ROWS_MAX * RESULT_ROW_H + 26;
const CANVAS_H = SUMMARY_Y + 24;
const ANIM_MS = 360;
/**
 * 말만 하는 걸음의 표식이 제자리에 앉는 시간.
 *
 * 뿌리에 닿았다·다 물어 보았다 는 가리킴을 바꾸지 않아 흐를 것이 없었고, 그래서
 * 걸음 벽시계가 `stepMs`(680ms) 그대로였다 — S-piece 의 얇은 걸음 잣대(800ms)
 * 아래다. `stepMs` 를 올리면 이미 흐르는 걸음까지 함께 늘어지므로, 그 걸음에만
 * 얇은 운동을 준다.
 */
const SETTLE_MS = 240;
/** 처음 뜨는 줄이 앉기 전에 물려 있는 세로 거리. */
const SETTLE_RISE = 6;
/** 커서의 반지름. 뿌리에 닿는 순간 이만큼 부풀었다 돌아온다. */
const CURSOR_R = 8;
const CURSOR_POP = 3;

type Pt = { x: number; y: number };

/** 자리 셈에 필요한 것. 장면은 좌표를 모르므로 (S-piece) 걸음마다 여기서 역산한다. */
type Geom = {
  readonly centers: readonly number[];
  readonly boxW: number;
};

function buildGeom(n: number): Geom {
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
  const originX = Math.round((W - n * cellW) / 2);
  const centers: number[] = [];
  for (let i = 0; i < n; i += 1) centers.push(originX + cellW * i + cellW / 2);
  return { centers, boxW: Math.min(64, Math.round(cellW * 0.66)) };
}

function arcControl(x0: number, x1: number, distance: number): Pt {
  return { x: (x0 + x1) / 2, y: Math.max(BOX_TOP - 30 - 12 * distance, 26) };
}

function quadPoint(t: number, p0: Pt, p1: Pt, p2: Pt): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pathD(p0: Pt, ctrl: Pt, p1: Pt): string {
  return `M ${p0.x} ${p0.y} Q ${ctrl.x} ${ctrl.y} ${p1.x} ${p1.y}`;
}

/** 한 자리에서 그 부모로 뻗는 곡선. 자리 번호만 있으면 나온다. */
type Arc = { p0: Pt; ctrl: Pt; p1: Pt };

function arcOf(g: Geom, child: number, parent: number): Arc {
  const p0 = { x: g.centers[child], y: BOX_TOP };
  const p1 = { x: g.centers[parent], y: BOX_TOP };
  return { p0, ctrl: arcControl(p0.x, p1.x, Math.abs(child - parent)), p1 };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

// window 경유로 부르면 반환형이 number 로 통일돼 캐스팅이 필요 없다 (C9).
const schedule = (fn: () => void): number =>
  typeof requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(() => fn())
    : window.setTimeout(fn, 16);

const unschedule = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
  else window.clearTimeout(id);
};

let instanceSeq = 0;

/**
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면이 말하는 화면을 통째로
 * 세우므로, 되돌릴 명령이 있을 자리가 없다 (S-scene).
 */
export type PathCompressionStage = ViewInstance & SceneRenderer<PathCompressionScene>;

export const pathCompressionStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PathCompressionScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // 캔버스는 러너가 이미 컨테이너에 붙였다 — 안쪽만 비운다 (S-view).
    svg.textContent = '';

    function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
      return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
    }

    function attr(node: Element, attrs: Record<string, string | number>): void {
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    }

    // ── mount 에서 한 번 세우는 것. 걸음마다 비워지는 것은 층 **안쪽**이다.
    const markerId = `pc-arrow-${(instanceSeq += 1)}`;
    const defs = el('defs');
    const marker = el('marker');
    attr(marker, {
      id: markerId,
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: 'auto-start-reverse',
    });
    const arrowHead = el('path');
    attr(arrowHead, { d: 'M0,0 L10,5 L0,10 Z', fill: colors.textMuted });
    marker.appendChild(arrowHead);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const edgeLayer = el('g');
    const boxLayer = el('g');
    const cursorLayer = el('g');
    const resultLayer = el('g');
    svg.appendChild(edgeLayer);
    svg.appendChild(boxLayer);
    svg.appendChild(cursorLayer);
    svg.appendChild(resultLayer);

    // 재건 밖에 있는 둘. 그래서 정적 경로가 **매번 명시로** 문자를 쓴다 — 빈 문자열도
    // 쓴다. 안 쓰면 앞 걸음의 문자가 남아 되짚기 판정이 어긋난다.
    const captionEl = el('text');
    attr(captionEl, {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      fill: colors.text,
    });
    svg.appendChild(captionEl);

    const tallyEl = el('text');
    attr(tallyEl, {
      x: W - SIDE_MIN,
      y: TALLY_Y,
      'text-anchor': 'end',
      'font-size': fontSizes.sm,
      'font-family': fonts.mono,
      fill: colors.textMuted,
    });
    svg.appendChild(tallyEl);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 깨어난 운동이 다음 세대의 화면에 손대지 않게 하는 빗장이다. `isInstant` 와
     * `onScrubStart` 는 빗장이 아니다 — **러너는 장면 조각에서 그 둘을 부르지
     * 않는다** (S-scene). 실효 있는 것은 `opts.animate` 검사와 이 빗장 둘뿐이라
     * 여기 달지 않았다.
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !destroyed && myGen === gen;

    /** 프레임마다 `apply` 를 부르며 `dur` 동안 흐른다. 세대가 끊기면 곧바로 접는다. */
    function animate(dur: number, myGen: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(myGen) || dur <= 0) {
          resolve();
          return;
        }
        const t0 = now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);

        const tick = (): void => {
          if (!alive(myGen)) {
            finish();
            return;
          }
          const raw = Math.min(1, (now() - t0) / dur);
          apply(easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          queue();
        };
        const queue = (): void => {
          const id = schedule(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        queue();
      });
    }

    // ── 문안 ──────────────────────────────────────────────────────────────
    //
    // 장면은 무엇을 말할지와 그 인자만 담는다. 문자도, 칸 수도 여기서 만든다 (C10).
    //
    // **수는 한 출처에서만 나온다.** 지금 몇 칸인가는 `parent` 를, 전에 몇 칸이었나는
    // `origin` 을 같은 `hopsToRoot` 로 밟아 낸다. 총계는 그 셈의 합이다.

    function hopsNow(s: PathCompressionScene, node: number): number {
      return hopsToRoot(s.parent, node);
    }

    function hopsBefore(s: PathCompressionScene, node: number): number {
      return hopsToRoot(s.origin, node);
    }

    /** 접은 뒤 한 자리의 답 — 캡션과 아래 결과 줄이 같은 문장을 쓴다. */
    function rootAfterText(s: PathCompressionScene, node: number): string {
      return tr(
        'caption.rootAfter',
        '{node} now reaches {root} in {hops} hop — it used to take {hopsBefore}',
        { node, root: s.root, hops: hopsNow(s, node), hopsBefore: hopsBefore(s, node) },
      );
    }

    function summaryText(s: PathCompressionScene): string {
      let before = 0;
      let after = 0;
      for (const node of s.answered) {
        before += hopsBefore(s, node);
        after += hopsNow(s, node);
      }
      return tr('caption.summary', '{before} hops become {after}', { before, after });
    }

    function captionText(s: PathCompressionScene, c: PathCompressionCaption | null): string {
      if (c === null) return '';
      switch (c.kind) {
        case 'queryBegin':
          return tr('caption.queryBegin', 'Ask where {node} leads, all the way to the root', {
            node: c.node,
          });
        case 'climb':
          return tr('caption.climb', '{from} points up to {to}', { from: c.from, to: c.to });
        case 'rootFirst':
          return tr('caption.rootFirst', '{node} reached root {root} after {hops} hops', {
            node: c.node,
            root: s.root,
            hops: hopsNow(s, c.node),
          });
        case 'rootAfter':
          return rootAfterText(s, c.node);
        case 'compress':
          return tr(
            'caption.compress',
            'Compressing — every node on the path now points straight to {root}',
            { root: s.root },
          );
        case 'summary':
          return summaryText(s);
        case 'rewind':
          return tr('caption.rewind', 'Replaying from the start');
      }
    }

    /** 상자 밑에 붙는 딱지. 가리키는 곳이 곧 문자다 — 따로 쥔 상태가 아니다. */
    function pointerLabel(node: number, parent: number): string {
      return node === parent ? MARK_ROOT : `${MARK_ARROW}${parent}`;
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────
    //
    // 늘 비우고 시작해 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않으므로
    // 되돌릴 명령이 있을 자리가 없다.

    /** 걸음마다 다시 만들어지는 것들. 장면에서 셈해 세우므로 쥔 상태가 아니다. */
    let geom: Geom | null = null;
    let boxRects: SVGRectElement[] = [];
    let pointerTexts: SVGTextElement[] = [];
    let edgePaths = new Map<number, SVGPathElement>();
    let cursorEl: SVGCircleElement | null = null;
    let resultRows: SVGTextElement[] = [];
    let summaryEl: SVGTextElement | null = null;

    function clearLayers(): void {
      edgeLayer.textContent = '';
      boxLayer.textContent = '';
      cursorLayer.textContent = '';
      resultLayer.textContent = '';
      boxRects = [];
      pointerTexts = [];
      edgePaths = new Map();
      cursorEl = null;
      resultRows = [];
      summaryEl = null;
    }

    function drawEdges(s: PathCompressionScene, g: Geom): void {
      for (let i = 0; i < s.parent.length; i += 1) {
        const up = s.parent[i];
        if (up === undefined || up === i) continue;
        const arc = arcOf(g, i, up);
        const path = el('path');
        attr(path, {
          d: pathD(arc.p0, arc.ctrl, arc.p1),
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'marker-end': `url(#${markerId})`,
        });
        edgeLayer.appendChild(path);
        edgePaths.set(i, path);
      }
    }

    function drawBoxes(s: PathCompressionScene, g: Geom): void {
      for (let i = 0; i < s.parent.length; i += 1) {
        const cx = g.centers[i];
        const isRoot = i === s.root;

        const rect = el('rect');
        attr(rect, {
          x: cx - g.boxW / 2,
          y: BOX_TOP,
          width: g.boxW,
          height: BOX_H,
          rx: radii.md.replace('px', ''),
          fill: colors.itemDefault,
          // 뿌리의 테두리는 머무는 강조다 — 정적으로도 그린다 (S-scene).
          stroke: isRoot ? colors.accent : colors.border,
          'stroke-width': isRoot ? 2 : 1,
        });
        boxLayer.appendChild(rect);
        boxRects.push(rect);

        const idx = el('text');
        attr(idx, {
          x: cx,
          y: BOX_TOP + BOX_H / 2 + 5,
          'text-anchor': 'middle',
          'font-size': fontSizes.lg,
          'font-family': fonts.mono,
          fill: colors.text,
        });
        idx.textContent = String(i);
        boxLayer.appendChild(idx);

        const pointer = el('text');
        attr(pointer, {
          x: cx,
          y: POINTER_Y,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          'font-family': fonts.mono,
          fill: colors.textMuted,
        });
        pointer.textContent = pointerLabel(i, s.parent[i] ?? i);
        boxLayer.appendChild(pointer);
        pointerTexts.push(pointer);
      }
    }

    function drawCursor(s: PathCompressionScene, g: Geom): void {
      if (!s.cursorOn || s.path.length === 0) return;
      const at = s.path[s.path.length - 1];
      const cx = g.centers[at];
      if (cx === undefined) return;
      const c = el('circle');
      attr(c, {
        cx,
        cy: BOX_TOP,
        r: CURSOR_R,
        fill: colors.itemActive,
        stroke: colors.stateInk,
        'stroke-width': 1.5,
      });
      cursorLayer.appendChild(c);
      cursorEl = c;
    }

    /** 답이 난 자리들과 총계. 남는 것이라 정적으로 그린다. */
    function drawResults(s: PathCompressionScene): void {
      const rows = s.answered.slice(0, RESULT_ROWS_MAX);
      for (let i = 0; i < rows.length; i += 1) {
        const row = el('text');
        attr(row, {
          x: W / 2,
          y: RESULT_START_Y + i * RESULT_ROW_H,
          'text-anchor': 'middle',
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          fill: colors.text,
        });
        row.textContent = rootAfterText(s, rows[i]);
        resultLayer.appendChild(row);
        resultRows.push(row);
      }
      if (!s.summary) return;
      const summary = el('text');
      attr(summary, {
        x: W / 2,
        y: SUMMARY_Y,
        'text-anchor': 'middle',
        'font-size': fontSizes.lg,
        'font-family': fonts.body,
        'font-weight': 700,
        fill: colors.text,
      });
      summary.textContent = summaryText(s);
      resultLayer.appendChild(summary);
      summaryEl = summary;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function stand(s: PathCompressionScene): void {
      clearLayers();
      captionEl.textContent = captionText(s, s.caption);
      tallyEl.textContent =
        s.path.length > 0 ? tr('label.hopCount', 'hop {n}', { n: s.path.length - 1 }) : '';

      const n = s.parent.length;
      if (n === 0) {
        geom = null;
        return;
      }
      // 자리를 먼저 한 번에 셈하고 그 다음에 그린다. 그리면서 재면 순회 순서가 곧
      // 숨은 상태가 된다.
      const g = buildGeom(n);
      geom = g;
      drawEdges(s, g);
      drawBoxes(s, g);
      drawCursor(s, g);
      drawResults(s);
    }

    // ── 흐르게 하기 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 운동은 끝 자리에 선 것을 출발 자리로 **물렸다가**
    // 되돌리는 꼴이다. 끝나면 `render` 가 장면을 통째로 다시 세워 거둔다.

    /** 물음이 열린 자리를 한 번 짚어 준다. 뿌리는 이미 강조가 있어 건너뛴다. */
    async function runBegin(s: PathCompressionScene, node: number, myGen: number): Promise<void> {
      if (node === s.root) return;
      const rect = boxRects[node];
      if (rect === undefined) return;
      attr(rect, { stroke: colors.accent, 'stroke-width': 2 });
      await animate(ANIM_MS, myGen, () => {
        /* 짚은 채로 머문다 — 거두는 것은 뒤따르는 `stand` 다. */
      });
    }

    /** 커서가 곡선을 따라 한 칸 오른다. 출발 자리는 두 번호에서 셈해진다. */
    async function runClimb(g: Geom, from: number, to: number, myGen: number): Promise<void> {
      const cursor = cursorEl;
      if (cursor === null) return;
      const arc = arcOf(g, from, to);
      // 정적 그리기는 커서를 이미 도착 자리에 세워 두었다. 첫 프레임 전에 출발
      // 자리로 물려 두지 않으면 끝 자리가 한 번 번쩍인다.
      attr(cursor, { cx: arc.p0.x, cy: arc.p0.y });
      await animate(ANIM_MS, myGen, (t) => {
        const pt = quadPoint(t, arc.p0, arc.ctrl, arc.p1);
        attr(cursor, { cx: pt.x, cy: pt.y });
      });
    }

    /**
     * 지나온 자리 전부가 한 번에 뿌리로 다시 붙는다.
     *
     * **한 뜻의 운동이라 시계도 하나다.** 화살들이 따로 돌면 "한 번의 수고" 라는
     * 단호함이 흩어진다. 출발 그림은 걸음이 실어 온 `was` 에서 셈한다 — 앞 장면을
     * 들추지 않는다 (S-scene).
     */
    async function runCompress(
      s: PathCompressionScene,
      g: Geom,
      moves: readonly { readonly node: number; readonly was: number }[],
      myGen: number,
    ): Promise<void> {
      type Swing = { path: SVGPathElement; from: Arc; to: Arc };
      const swings: Swing[] = [];

      for (const m of moves) {
        // 이미 뿌리를 가리키던 자리는 옮길 것이 없다 — 한 번 짚어 주기만 한다.
        if (m.was === s.root) {
          const rect = boxRects[m.node];
          if (rect !== undefined) attr(rect, { stroke: colors.accent, 'stroke-width': 2 });
          continue;
        }
        const path = edgePaths.get(m.node);
        if (path === undefined) continue;
        const from = arcOf(g, m.node, m.was);
        const to = arcOf(g, m.node, s.root);
        // 끝 자리에 선 것을 출발 자리로 물린다. 첫 프레임에 끝 자리가 번쩍이지
        // 않도록 여기서 미리 박아 둔다.
        attr(path, { d: pathD(from.p0, from.ctrl, from.p1), stroke: colors.accent });
        const label = pointerTexts[m.node];
        if (label !== undefined) label.textContent = pointerLabel(m.node, m.was);
        swings.push({ path, from, to });
      }

      await animate(ANIM_MS, myGen, (t) => {
        for (const sw of swings) {
          const p0 = lerpPt(sw.from.p0, sw.to.p0, t);
          const ctrl = lerpPt(sw.from.ctrl, sw.to.ctrl, t);
          const p1 = lerpPt(sw.from.p1, sw.to.p1, t);
          sw.path.setAttribute('d', pathD(p0, ctrl, p1));
        }
      });
    }

    /**
     * 말만 하는 걸음의 표식이 조금 아래에서 제자리로 앉는다.
     *
     * 정적 그리기가 이미 제자리에 세워 둔 것을 출발 자리로 물렸다가 되돌리는 꼴이라,
     * 첫 프레임 전에 `draw(0)` 으로 물림을 박아 둔다. 남은 `opacity` · `transform` 은
     * 뒤따르는 `stand` 가 요소를 통째로 다시 지어 거둔다.
     */
    async function runSettle(
      mark: Extract<PathCompressionStep, { kind: 'settle' }>['mark'],
      myGen: number,
    ): Promise<void> {
      // 커서는 이미 그 자리에 와 있다 — 사라졌다 나타나면 글리치로 읽히므로, 닿았다는
      // 것을 한 번 부푸는 것으로 짚는다. 반지름만 건드려 좌표를 되읽지 않는다.
      if (mark === 'cursor') {
        const cursor = cursorEl;
        if (cursor === null) return;
        const pop = (e: number): void => {
          cursor.setAttribute('r', String(CURSOR_R + CURSOR_POP * Math.sin(Math.PI * e)));
        };
        pop(0);
        await animate(SETTLE_MS, myGen, pop);
        return;
      }

      // 답 줄과 총계는 이 걸음에 처음 뜨는 것이라 나타나는 꼴이 옳다.
      const target = mark === 'summary' ? summaryEl : (resultRows[resultRows.length - 1] ?? null);
      if (target === null) return;
      const draw = (e: number): void => {
        attr(target, {
          opacity: e,
          transform: `translate(0, ${(SETTLE_RISE * (1 - e)).toFixed(2)})`,
        });
      };
      draw(0);
      await animate(SETTLE_MS, myGen, draw);
    }

    /** 방금 밟은 걸음 하나만 흐르게 한다. */
    async function flow(
      s: PathCompressionScene,
      step: PathCompressionStep,
      myGen: number,
    ): Promise<void> {
      const g = geom;
      if (g === null) return;
      switch (step.kind) {
        case 'begin':
          await runBegin(s, step.node, myGen);
          return;
        case 'climb':
          await runClimb(g, step.from, step.to, myGen);
          return;
        case 'compress':
          await runCompress(s, g, step.moves, myGen);
          return;
        case 'settle':
          await runSettle(step.mark, myGen);
          return;
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 짚어 둔 강조도, 보간의
     * 끝자리가 남긴 부동소수 꼬리도 그 한 줄이 거둔다. 사이에 프레임이 없어 같은
     * 그림이 다시 그려질 뿐이다.
     */
    async function render(
      next: PathCompressionScene,
      /** 이 조각은 출발 그림을 걸음의 계기값에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: PathCompressionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      stand(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;
      if (step === null) return;
      await flow(next, step, myGen);
      if (alive(myGen)) stand(next);
    }

    const instance: PathCompressionStage = {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) unschedule(id); // 걸어 둔 것을 먼저 거두고
        frames.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
