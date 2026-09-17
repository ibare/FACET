/**
 * halve-the-range-stage — 후보 구간이 걸음마다 반씩 사라지는 화면.
 *
 * 움직이는 것은 값이 아니라 **구간의 폭**이다. 살아 있는 후보는 하나의 띠로
 * 둘러싸이고, 견줌이 끝날 때마다 그 띠의 모서리가 안쪽으로 미끄러진다. 값은 자기
 * 자리에서 한 걸음도 옮기지 않는다 — 줄어드는 것은 폭이다.
 *
 * 후보에서 빠진 자리는 지워지지 않는다. 제자리에서 아래로 물러나 자취 선반에
 * 내려앉고, 그 무리 아래에 이번 한 번의 견줌으로 몇이 걷혔는지가 칩으로 붙는다.
 * **그 칩들이 쌓인 것이 이 조각의 결론이다** — 다 끝나 정지한 그림에서 칩의 수가
 * 곧 몇 번 반으로 줄었나이고, 칩의 수를 더하면 처음 후보 수가 나온다. 그래야
 * "절반" 이 어림이 아니라 세어 볼 수 있는 셈이 된다.
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * 한 칸에 두 가지 말이 겹치는 조각이라 이 갈래가 중요하다. 짚어 본 자리는 나중에
 * 후보에서 빠지기도 하고 답이 되기도 하는데, 둘을 같은 칠로 말하면 뒤엣것이
 * 앞엣것을 지운다.
 *   - **채움은 값의 형편** — 아직 후보냐, 걷혔느냐, 찾던 값이냐.
 *   - **테두리는 짚음의 표식** — 이 자리를 짚어 보았다.
 * 그래서 걷힌 자리에도 짚었던 테가 남고, 답인 자리에도 짚었던 테가 남는다.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 껍데기(`root`) 말고는 걸음마다 통째로 다시 지으므로
 * "정적 경로가 매번 명시로 쓰는가" 를 따로 살필 재건 밖 요소가 없다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 띠도 커서도 이미 끝 자리에 서
 * 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발 자리는
 * 장면의 `step` 이 실어 온 자리 번호에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * 세로는 canvas 선언으로 정해지고 그 뒤 바뀌지 않는다 (S-view).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다. 화면 문자는
 * 전부 `params.t` 로 만든다 (C10). 칸에 적힌 값은 숫자 표식이라 문안이 아니다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  space,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  remainingOf,
  sunkSlots,
  type HalveTheRangeCaption,
  type HalveTheRangeScene,
  type HalveTheRangeSpan,
  type HalveTheRangeSweep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 자취 선반과 셈 줄까지 처음부터 자리를 잡는다. */
const H = 208;

const LABEL_BASE = 20;
const TILE_Y = 40;
const TILE_H = 40;
const BAND_PAD_X = parseFloat(space.sm);
const BAND_PAD_Y = parseFloat(space.md);
const BAND_Y = TILE_Y - BAND_PAD_Y;
const BAND_H = TILE_H + BAND_PAD_Y * 2;
const CARET_TOP = BAND_Y + 2;
const CARET_H = 8;
const CARET_HALF_W = 6;
/** 후보에서 빠진 자리가 물러나는 깊이. */
const SINK = 60;
const RAIL_Y = TILE_Y + SINK + TILE_H;
/** 한 번에 걷힌 무리를 아래에서 묶는 셈괄호. */
const BRACKET_Y = 147;
const BRACKET_TICK = 5;
const CHIP_Y = 152;
const CHIP_H = 22;
const CAPTION_BASE = 194;

/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 84;
const SIDE_MIN = 24;
const TILE_GAP = parseFloat(space.sm);

// 테두리 — 짚어 본 적 없는 자리 / 짚어 본 자리.
const STROKE_PLAIN = 1;
const STROKE_PROBED = 3;
const BAND_STROKE = 2;
const BRACKET_STROKE = 1.5;
/** 매듭짓는 걸음에서 셈괄호가 잠깐 부푸는 폭. */
const TALLY_SWELL = 2;

// 지속시간. 걸음 하나는 여기에 stepMs 가 더해진다 (S-piece).
/** 구간이 바깥에서 줄 위로 좁혀 들어오는 몫. */
const OPEN_MS = 300;
/** 커서가 처음 자리에 내려앉는 몫. */
const DROP_MS = 240;
const PROBE_MS = 260;
const MOVE_MS = 420;
const TALLY_MS = 420;
/** 커서가 처음 앉을 때 위에서 내려오는 높이. */
const CARET_DROP = 10;
/** 새 칩이 떠오르며 올라오는 높이. */
const CHIP_RISE = 12;

/**
 * 견줌의 방향 기호. 번역하면 오히려 화면과 어긋나는 수식 표기라 상수로 둔다
 * (C10 "표식이냐 문안이냐" 3번).
 */
const REL_GLYPH: Record<'lt' | 'gt', string> = { lt: '<', gt: '>' };

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 글자가 차지하는 폭의 어림. 한글은 한 글자가 온폭에 가깝다. */
function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of s) units += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.56;
  return units * size;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 잇닿은 자리들로 끊어 나눈다.
 *
 * `found` 걸음에서는 걷힌 무리가 찾은 자리를 사이에 두고 둘로 갈린다. 그때
 * 최솟값~최댓값을 한 괄호로 묶으면 **답까지 함께 묶여** 괄호가 거짓을 말한다.
 * 그래서 괄호는 잇닿은 토막마다 하나씩 그리고, 셈을 적은 칩은 무리 하나에
 * 하나만 단다 — 칩의 수가 곧 반으로 줄어든 횟수다.
 */
function runsOf(indices: readonly number[]): Array<{ lo: number; hi: number }> {
  const sorted = [...indices].sort((a, b) => a - b);
  const runs: Array<{ lo: number; hi: number }> = [];
  for (const i of sorted) {
    const last = runs[runs.length - 1];
    if (last !== undefined && i === last.hi + 1) last.hi = i;
    else runs.push({ lo: i, hi: i });
  }
  return runs;
}

/** 걷힌 무리 하나의 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type ChipGroup = {
  g: SVGGElement;
  brackets: SVGPathElement[];
  box: SVGRectElement;
};

export const halveTheRangeStageView: CanvasView = {
  canvas: { height: H },

  // container 는 계약상 받지만 쓰지 않는다. 러너가 붙여 준 캔버스 안에만 그린다 —
  // 컨테이너를 비우면 그 캔버스가 떨어져 나간다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HalveTheRangeScene> {
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const chipRx = CHIP_H / 2;
    const tileRx = parseFloat(radii.md);

    // 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 통째로 다시 짓는다.
    const root = el('g');
    svg.appendChild(root);

    // ── 기하. 장면의 `values` 길이가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    let n = 0;
    let cellW = 0;
    let originX = 0;

    function layout(scene: HalveTheRangeScene): void {
      n = scene.values.length;
      cellW = n > 0 ? Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n)) : 0;
      originX = Math.round((W - n * cellW) / 2);
    }

    const slotX = (i: number): number => originX + i * cellW;
    const slotMid = (i: number): number => originX + (i + 0.5) * cellW;
    const spanX = (span: HalveTheRangeSpan): number => slotX(span.lo) - BAND_PAD_X;
    const spanW = (span: HalveTheRangeSpan): number =>
      Math.max(0, (span.hi - span.lo + 1) * cellW + BAND_PAD_X * 2);

    // ── 이번 장면이 세운 DOM 손잡이.
    let bandEl: SVGRectElement | null = null;
    let spanLabelEl: SVGTextElement | null = null;
    let caretEl: SVGPolygonElement | null = null;
    let tileEls: SVGGElement[] = [];
    let chipEls: ChipGroup[] = [];

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로 다시
    // 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미 새로
    // 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고, 운동은
    // `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    // `isInstant` 와 `onScrubStart` 는 러너가 장면 조각에서 부르지 않으므로 빗장이
    // 되지 못한다 — 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const canAnimate = typeof requestAnimationFrame === 'function';
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 걸음을 **한 시계로** 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다.
     *
     * `destroy` 가 `waiters` 를 깨우므로 프레임이 취소되어 tick 이 아예 안 불려도
     * 기다리던 promise 가 반드시 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine) || !canAnimate || ms <= 0) {
          if (alive(mine)) draw(1);
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
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(easeOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        // 첫 프레임을 곧바로 그린다 — 뒤로 물린 자리를 먼저 박아 두지 않으면
        // 끝 자리가 한 번 번쩍인다.
        tick();
      });
    }

    // ── 정적 그리기. 그 장면이 말하는 것을 전부 세운다.

    function placeBand(x: number, w: number): void {
      if (bandEl === null) return;
      bandEl.setAttribute('x', String(x));
      bandEl.setAttribute('width', String(Math.max(0, w)));
      if (spanLabelEl !== null) spanLabelEl.setAttribute('x', String(x + w / 2));
    }

    function placeCaret(x: number, dy: number): void {
      if (caretEl === null) return;
      caretEl.setAttribute('transform', `translate(${x}, ${dy})`);
    }

    function placeTile(i: number, dy: number): void {
      const g = tileEls[i];
      if (g !== undefined) g.setAttribute('transform', `translate(0, ${dy})`);
    }

    /** 걷힌 무리 하나 — 잇닿은 토막마다 괄호, 무리마다 셈 칩 하나. */
    function drawSweep(sweep: HalveTheRangeSweep): ChipGroup {
      const runs = runsOf(sweep.slots);
      const first = runs[0];
      const last = runs[runs.length - 1];
      const cx = (slotX(first.lo) + slotX(last.hi + 1)) / 2;
      const text = tr('label.gone', '{n} gone', { n: sweep.slots.length });
      const size = parseFloat(fontSizes.sm);
      const w = textWidth(text, size) + parseFloat(space.md) * 2;

      const g = el('g');
      const brackets: SVGPathElement[] = [];
      for (const run of runs) {
        const x0 = slotX(run.lo) + TILE_GAP / 2;
        const x1 = slotX(run.hi + 1) - TILE_GAP / 2;
        const path = el('path', {
          d:
            `M ${x0} ${BRACKET_Y - BRACKET_TICK} L ${x0} ${BRACKET_Y} ` +
            `L ${x1} ${BRACKET_Y} L ${x1} ${BRACKET_Y - BRACKET_TICK}`,
          fill: 'none',
          stroke: c.text,
          'stroke-width': BRACKET_STROKE,
        });
        brackets.push(path);
        g.appendChild(path);
      }
      const box = el('rect', {
        x: cx - w / 2,
        y: CHIP_Y,
        width: w,
        height: CHIP_H,
        rx: chipRx,
        fill: c.bg,
        stroke: c.text,
        'stroke-width': BRACKET_STROKE,
      });
      const label = el('text', {
        x: cx,
        y: CHIP_Y + CHIP_H / 2 + size * 0.36,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: c.text,
      });
      label.textContent = text;
      g.append(box, label);
      return { g, brackets, box };
    }

    function rewind(): void {
      root.textContent = '';
      bandEl = null;
      spanLabelEl = null;
      caretEl = null;
      tileEls = [];
      chipEls = [];
    }

    function drawStatic(scene: HalveTheRangeScene): void {
      layout(scene);
      const sunk = sunkSlots(scene);
      const probed = new Set(scene.probes);
      const span = scene.span;
      const left = remainingOf(span);

      // 자취 선반. 걷힌 자리가 내려앉는 자리를 처음부터 알려 둔다.
      root.appendChild(
        el('line', {
          x1: originX,
          x2: originX + n * cellW,
          y1: RAIL_Y,
          y2: RAIL_Y,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        }),
      );

      // 살아 있는 구간의 띠. 폭이 0 이면 짓지 않는다 — 숨기기만 하면 앞 걸음의
      // 좌표가 남는다.
      if (span !== null && left > 0) {
        bandEl = el('rect', {
          y: BAND_Y,
          height: BAND_H,
          rx: tileRx + BAND_PAD_X / 2,
          fill: c.bgSubtle,
          stroke: scene.finished && scene.found !== null ? c.accent : c.text,
          'stroke-width': BAND_STROKE,
        });
        spanLabelEl = el('text', {
          y: LABEL_BASE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.text,
        });
        spanLabelEl.textContent = tr('label.remaining', '{n} candidates', { n: left });
        root.append(bandEl, spanLabelEl);
        placeBand(spanX(span), spanW(span));
      }

      // 지금 짚고 있는 자리를 가리키는 커서. 짚은 적이 없으면 짓지 않는다.
      const here = scene.probes.length > 0 ? scene.probes[scene.probes.length - 1] : null;
      if (here !== null) {
        caretEl = el('polygon', {
          points: `${-CARET_HALF_W},${CARET_TOP} ${CARET_HALF_W},${CARET_TOP} 0,${CARET_TOP + CARET_H}`,
          fill: scene.found === here ? c.accent : c.itemComparing,
        });
        root.appendChild(caretEl);
        placeCaret(slotMid(here), 0);
      }

      // 값 칸. 채움은 값의 형편, 테두리는 짚음의 표식이다.
      for (let i = 0; i < n; i += 1) {
        const isFound = scene.found === i;
        const fill = isFound ? c.accent : sunk[i] ? c.bgSubtle : c.itemDefault;
        const ink = isFound ? c.stateInk : sunk[i] ? c.textMuted : c.text;
        const g = el('g');
        g.append(
          el('rect', {
            x: slotX(i) + TILE_GAP / 2,
            y: TILE_Y,
            width: Math.max(0, cellW - TILE_GAP),
            height: TILE_H,
            rx: tileRx,
            fill,
            stroke: probed.has(i) ? c.itemComparing : c.border,
            'stroke-width': probed.has(i) ? STROKE_PROBED : STROKE_PLAIN,
          }),
        );
        const label = el('text', {
          x: slotMid(i),
          y: TILE_Y + TILE_H / 2 + parseFloat(fontSizes.lg) * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: ink,
        });
        label.textContent = String(scene.values[i]);
        g.appendChild(label);
        root.appendChild(g);
        tileEls.push(g);
        placeTile(i, sunk[i] ? SINK : 0);
      }

      // 걷힌 무리들. 지워지지 않고 쌓인다 — 이 누적이 이 조각의 결론이다.
      for (const sweep of scene.sweeps) {
        const group = drawSweep(sweep);
        root.appendChild(group.g);
        chipEls.push(group);
      }
    }

    function drawCaption(caption: HalveTheRangeCaption | null): void {
      const node = el('text', {
        x: W / 2,
        y: CAPTION_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.textMuted,
      });
      node.textContent = caption === null ? '' : captionText(caption);
      root.appendChild(node);
    }

    function captionText(caption: HalveTheRangeCaption): string {
      switch (caption.kind) {
        case 'start':
          return tr('caption.start', 'A sorted range of {n}. Looking for {target}.', {
            n: caption.n,
            target: caption.target,
          });
        case 'probe':
          return tr('caption.probe', '{n} candidates left. The middle one is {mid}.', {
            n: caption.left,
            mid: caption.mid,
          });
        case 'narrow':
          return tr(
            'caption.narrow',
            '{mid} {rel} {target} — {swept} candidates leave at once. {left} left.',
            {
              mid: caption.mid,
              rel: REL_GLYPH[caption.rel],
              target: caption.target,
              swept: caption.swept,
              left: caption.left,
            },
          );
        case 'found':
          return tr('caption.found', '{mid} = {target}. Found — the other {swept} leave. {left} left.', {
            mid: caption.mid,
            target: caption.target,
            swept: caption.swept,
            left: caption.left,
          });
        case 'done':
          return tr('caption.done', '{comparisons} comparisons cut {n} candidates down to {left}.', {
            comparisons: caption.comparisons,
            n: caption.n,
            left: caption.left,
          });
      }
    }

    // ── 방금 달라진 것만 흐르게 한다. 출발 자리는 전부 `step` 이 말한다.

    /**
     * 구간이 처음 선다 — 바깥에서 줄 위로 좁혀 들어온다.
     *
     * 짚을 것도 걷힐 것도 없는 얇은 걸음이라 `stepMs` 만으로는 앞뒤와 구별되지
     * 않는다. 운동은 눈에 띄는 것이 아니라 **그 걸음이 하는 말과 같은 동사**로
     * 고른다. 이 조각의 동사는 좁아지는 것이므로, 없던 띠가 나타나는 대신 캔버스
     * 양끝에서 줄 위로 좁혀 들어온다 (`opacity` 0→1 은 깜빡임으로 읽힌다).
     */
    function openBand(span: HalveTheRangeSpan, mine: number): Promise<void> {
      if (bandEl === null) return Promise.resolve();
      const toX = spanX(span);
      const toW = spanW(span);
      return tween(OPEN_MS, mine, (p) => {
        placeBand(lerp(0, toX, p), lerp(W, toW, p));
      });
    }

    /**
     * 커서가 가운데로 간다. 짚은 칸의 테두리가 함께 자란다 — 한 뜻이라 한 시계다.
     *
     * 처음 짚는 자리는 옆에서 미끄러져 오면 거짓이다 (올 데가 없었다). 대신 위에서
     * 자리에 **내려앉는다** — 처음 뜨는 것은 앉는 꼴이 맞다.
     */
    function moveCaret(from: number | null, to: number, mine: number): Promise<void> {
      const toX = slotMid(to);
      const tile = tileEls[to];
      const box = tile === undefined ? null : tile.firstElementChild;
      const grow = (p: number): void => {
        if (box !== null) box.setAttribute('stroke-width', String(lerp(STROKE_PLAIN, STROKE_PROBED, p)));
      };
      if (from === null) {
        return tween(DROP_MS, mine, (p) => {
          placeCaret(toX, lerp(-CARET_DROP, 0, p));
          grow(p);
        });
      }
      const fromX = slotMid(from);
      return tween(PROBE_MS, mine, (p) => {
        placeCaret(lerp(fromX, toX, p), 0);
        grow(p);
      });
    }

    /**
     * 구간이 좁아지고, 걷힌 자리가 물러나고, 칩이 떠오른다 — 한 호흡에.
     *
     * 세 운동이 한 뜻("이만큼이 한 번에 빠졌다")이라 한 목록·한 시계로 돌린다.
     * `Promise.all` 로 갈라 돌리면 lockstep 이 우연히 맞는 꼴이 된다.
     */
    function collapse(
      step: { from: HalveTheRangeSpan; to: HalveTheRangeSpan; swept: readonly number[] },
      mine: number,
    ): Promise<void> {
      const fromX = spanX(step.from);
      const fromW = spanW(step.from);
      const toX = spanX(step.to);
      const toW = spanW(step.to);
      const chip = step.swept.length > 0 ? (chipEls[chipEls.length - 1] ?? null) : null;
      return tween(MOVE_MS, mine, (p) => {
        placeBand(lerp(fromX, toX, p), lerp(fromW, toW, p));
        for (const i of step.swept) placeTile(i, lerp(0, SINK, p));
        if (chip !== null) {
          chip.g.setAttribute('opacity', String(p));
          chip.g.setAttribute('transform', `translate(0, ${(1 - p) * CHIP_RISE})`);
        }
      });
    }

    /**
     * 매듭짓는 걸음. 쌓인 무리들을 왼쪽부터 차례로 훑어 셈괄호가 부풀었다 돌아온다.
     *
     * 이 걸음도 흐를 것이 없는 얇은 걸음이다. 캡션이 말하는 것이 "견줌 몇 번이
     * 후보를 몇에서 몇으로 줄였다" 이므로, 그 근거인 무리들을 차례로 짚는 것이 같은
     * 동사다. 이미 서 있는 것이라 부풀었다 돌아오는 꼴로 그린다.
     */
    function tally(mine: number): Promise<void> {
      const groups = chipEls;
      if (groups.length === 0) return Promise.resolve();
      const stride = 1 / (groups.length + 1);
      return tween(TALLY_MS, mine, (p) => {
        for (let k = 0; k < groups.length; k += 1) {
          const local = clamp01((p - k * stride) / (1 - groups.length * stride));
          // 양 끝에서는 보간값이 아니라 상수를 그대로 쓴다. `Math.sin(Math.PI)` 는
          // 0 이 아니라 1.2e-16 이라 `'1.5'` 가 `'1.5000000000000002'` 가 된다 —
          // 눈에는 안 보이지만 화면을 견주는 감사는 그 한 글자를 잡는다.
          const swell = local <= 0 || local >= 1 ? 0 : Math.sin(local * Math.PI) * TALLY_SWELL;
          const width = String(BRACKET_STROKE + swell);
          for (const bracket of groups[k].brackets) bracket.setAttribute('stroke-width', width);
          groups[k].box.setAttribute('stroke-width', width);
        }
      });
    }

    function flow(scene: HalveTheRangeScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'open':
          return openBand(step.to, mine);
        case 'probe':
          return moveCaret(step.from, step.to, mine);
        case 'collapse':
          return collapse(step, mine);
        case 'tally':
          return tally(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(`opacity` · `transform` · 부푼 `stroke-width`)이 한꺼번에 사라져,
     * 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 자리
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: HalveTheRangeScene,
      _prev: HalveTheRangeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (canAnimate) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 프레임이 취소되면 그 tick 이 아예 안 불려 resolve 가 지나가지 않는다.
        // 기다리던 것을 여기서 직접 깨운다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        root.remove();
      },
    };
  },
};
