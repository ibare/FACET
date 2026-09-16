/**
 * pivot-choice-matters-stage — 기준 하나에 얹힌 저울 두 대.
 *
 * ── 화면이 하려는 말
 *
 * 판 하나가 한 줄(lane)이고, **두 줄이 처음부터 나란히 서 있다.** 견주라고 만든
 * 화면이라 한쪽이 끝난 뒤에 다른 쪽이 생기면 견줄 대상이 화면에 없다. 위에는
 * 원래 줄의 자리 일곱(점선)이 남고, 아래에는 받침 위에 저울대가 걸린다. 기준으로
 * 뽑힌 칸은 줄에서 빠져 받침 아래로 내려가 저울을 떠받치고, 나머지 칸들은 하나씩
 * 왼팔·오른팔로 건너가 실린다. 다 실리면 저울대가 개수 차이만큼 기운다 — 고르게
 * 나뉘면 흔들리다 수평으로 멎고, 한쪽에 몰리면 그쪽으로 쏠린 채 멎는다.
 *
 * 저울대의 길이는 두 줄에서 같다. 그래서 한 팔에 실린 칸의 길이를 두 판 사이에
 * 그대로 견줄 수 있고, 텅 빈 팔은 맨 저울대로 드러난다.
 *
 * **다 굴린 화면에 두 판의 자취가 온전히 남는다.** 실린 칸도, 남는 일을 짚은
 * 대괄호도, `7 → 3` 과 `7 → 6` 이라는 계기도 지워지지 않는다. 이 조각의 주장이
 * 곧 그 둘의 차이이므로 마지막 화면이 그 차이를 그대로 이고 있어야 한다.
 *
 * ── 장면을 그린다 (`render` 하나로 산다)
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render(next, prev, {animate})` 가 그
 * 장면의 화면을 **전량** 세우고, `animate` 일 때만 방금 달라진 것을 흐르게 한다
 * (S-scene). 되짚기는 `animate: false` 로 와서 정적 경로만 지나간다.
 *
 * 걸음마다 흐를 것을 `Motion` 하나로 모아 **시계 하나로** 흘린다. 재는 걸음은
 * 대괄호가 그어지는 것과 그 팔의 칸이 부푸는 것이 함께 일어나는데, 그 둘을 따로
 * 돌리면 하나를 `void` 로 던질 여지가 생긴다 (S-scene). 시계가 하나면 `render` 의
 * Promise 가 둘 다 선 뒤에 저절로 풀린다.
 *
 * `prev` 는 들추지 않는다. 기준 칸이 떠나는 자리도, 건너가는 칸의 출발 자리도,
 * 저울대가 기울기 시작하는 각도도 전부 `next` 에서 되셈된다.
 *
 * ── 수와 자리
 *
 * 화면에 뜨는 수는 전부 `scene.ts` 의 셈 함수를 지난다 (`totalOf` · `remainingOf`
 * · `countOn`). 계기의 `7 → 3`, 캡션의 수, 대괄호가 설 팔이 같은 출처라 갈릴 자리가
 * 없다. 자리는 여기서 캔버스로부터 역산한다 — 칸 폭도 저울대의 길이도 장면에 없다
 * (S-piece).
 *
 * 세로도 장면이 정한다. 판이 몇이냐가 캔버스 높이를 정하므로 정적 그리기가 매번
 * `viewBox` 를 다시 쓴다.
 *
 * ── 뒷일
 *
 * rAF 루프 하나만 쓰고 destroy() 에서 세운다. 대기 중인 애니메이션 Promise 는
 * destroy 시 전부 즉시 결과를 낸다 — 걸린 채로 남으면 알고리즘이 멈춘 자리에서
 * 영영 깨어나지 못한다.
 *
 * 지연 발화를 막는 것은 **`opts.animate` 검사와 세대 빗장** 둘이다. `isInstant`
 * 와 `onScrubStart` 는 쓰지 않는다 — 러너는 장면 조각에서 그 둘을 부르지 않는다
 * (S-scene).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  activeIndex,
  activeTrial,
  armOf,
  bracketedSides,
  countOn,
  focusOf,
  pivotIndexAt,
  pivotValueAt,
  remainingOf,
  totalOf,
  type PivotArmSide,
  type PivotChoiceMattersScene,
  type PivotChoiceMattersTrial,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로 (줄 안에서의 상대 좌표)
const PAD_TOP = 8;
const CELL_H = 26;
const ROW_Y = 0;
const BEAM_Y = 72;
const ARM_TOP = BEAM_Y - CELL_H;
const FULCRUM_H = 12;
const FULCRUM_HALF_W = 11;
const PIVOT_Y = BEAM_Y + FULCRUM_H;
const BRACKET_Y = ARM_TOP - 9;
const BRACKET_TICK = 6;
const LANE_H = 116;
const LANE_GAP = 18;
const CAPTION_BAND = 34;

// ── 가로. 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
const CELL_MAX_W = 46;
const SIDE_MIN = 16;
const CELL_INSET = 2;
const MEASURE_X = 10;
const MEASURE_Y = 19;

// ── 운동
const LIFT_MS = 340;
const MOVE_MS = 240;
const TILT_MS = 460;
/**
 * 재는 걸음과 견주는 걸음에 얹는 얇은 운동.
 *
 * 둘 다 원래는 흐를 것이 없어 벽시계가 `stepMs` 그대로였다. `stepMs` 를 올리면
 * 이미 긴 걸음이 함께 길어지므로 그 걸음에만 짧은 운동을 얹는다 (프로토콜 4 절).
 */
const MARK_MS = 260;
const MOVE_ARC = 12;
/** 한쪽에 전부 몰렸을 때의 기움. 저울대 끝이 60px 넘게 벌어진다. */
const MAX_TILT_DEG = 6;
/** 멎기 전의 흔들림. 수평으로 끝나는 저울도 한 번은 움직이게 한다. */
const WOBBLE_DEG = 1.2;
/** 재는 걸음에서 칸이 부푸는 정도. 이미 서 있던 것이라 나타나는 꼴이 아니다. */
const SWELL = 0.08;
const DIM_OPACITY = 0.42;

/** 두 판 기준 기본 높이. 판 수가 다르면 정적 그리기가 다시 잰다. */
const DEFAULT_H = PAD_TOP + 2 * LANE_H + LANE_GAP + CAPTION_BAND;

type CellState = 'row' | 'pivot' | 'landed' | 'remaining';

/** 그린 것의 손잡이. 운동이 만질 것만 쥔다 — 뜻이나 수치는 담지 않는다. */
type LaneNodes = {
  g: SVGGElement;
  beam: SVGGElement;
  brackets: { path: SVGPathElement; length: number }[];
  cells: SVGGElement[];
};

/** 캔버스에서 역산한 자리들. 장면만 알면 나오는 값이라 매번 다시 셈한다. */
type Layout = {
  width: number;
  height: number;
  cx: number;
  pitch: number;
  beamHalf: number;
  pivotX: number;
  laneCount: number;
  rowX(i: number): number;
  armX(side: PivotArmSide, slot: number): number;
  laneTop(i: number): number;
};

/** 한 걸음에 흐를 것 전부. 시계 하나로 돈다. */
type Motion = { duration: number; apply(t: number): void };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** 저울대가 멎는 각. 개수 차이만 말하고 무게라는 뜻은 없다. */
function tiltOf(trial: PivotChoiceMattersTrial): number {
  const left = countOn(trial, 'left');
  const right = countOn(trial, 'right');
  const load = left + right;
  return load === 0 ? 0 : (MAX_TILT_DEG * (right - left)) / load;
}

/**
 * 장면으로부터 자리를 셈한다.
 *
 * 한 팔에 최대 n-1 칸이 실릴 수 있다. 그 길이가 캔버스 반폭에 들어가도록 칸 폭을
 * 역산한다 — 남는 폭을 여백으로 버리지 않는다 (S-piece).
 */
function layoutOf(scene: PivotChoiceMattersScene): Layout {
  const width = PIECE_CANVAS_W;
  const n = Math.max(1, scene.values.length);
  const laneCount = Math.max(1, scene.pivots.length);
  const halfSpan = Math.max(1, n - 1) + 0.5;
  const pitch = Math.min(CELL_MAX_W, Math.floor((width / 2 - SIDE_MIN) / halfSpan));
  const cx = width / 2;
  return {
    width,
    height: PAD_TOP + laneCount * LANE_H + (laneCount - 1) * LANE_GAP + CAPTION_BAND,
    cx,
    pitch,
    beamHalf: halfSpan * pitch,
    pivotX: cx - pitch / 2,
    laneCount,
    rowX: (i) => cx - (n * pitch) / 2 + i * pitch,
    armX: (side, slot) =>
      side === 'left' ? cx - pitch / 2 - slot * pitch : cx + pitch / 2 + (slot - 1) * pitch,
    laneTop: (i) => PAD_TOP + i * (LANE_H + LANE_GAP),
  };
}

export const pivotChoiceMattersStageView: CanvasView = {
  canvas: { height: DEFAULT_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PivotChoiceMattersScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    svg.appendChild(root);

    // ── 애니메이션 동력 ──────────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    /**
     * 기다리다 만 것들을 깨우는 자리.
     *
     * 프레임을 거두는 것만으로는 모자란다 — 취소된 tick 은 아예 불리지 않으므로
     * `destroyed` 를 보고 resolve 하는 길도 지나가지 않는다. 그러면 `await
     * ctx.emit` 이 영영 돌아오지 않아, unmount 된 뒤에도 알고리즘과 SVG 트리가
     * 통째로 붙들린다 (S-piece).
     */
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 모든 요소를 매번 새로 만들므로 살아남은 옛 운동이 쥔 것은 이미
     * 떨어져 나간 노드다. 그래도 빗장을 둔다 — 깨어난 프레임이 헛일을 하는 것을
     * 여기서 끊고, 무엇이 유효한 세대인지가 코드에 적힌다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, 16) as unknown as number);
    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };
    const nowMs = (): number =>
      typeof performance === 'object' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    /**
     * 한 마디를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(duration: number, my: number, apply: (t: number) => void): Promise<void> {
      const paint = (t: number): void => {
        if (alive(my)) apply(t);
      };
      paint(0);
      if (destroyed || duration <= 0) {
        paint(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const startedAt = nowMs();
        let id = 0;
        const tick = (): void => {
          frames.delete(id);
          if (destroyed || my !== gen) {
            finish();
            return;
          }
          const t = Math.min(1, (nowMs() - startedAt) / duration);
          paint(t);
          if (t >= 1) {
            finish();
            return;
          }
          id = schedule(tick);
          frames.add(id);
        };
        id = schedule(tick);
        frames.add(id);
      });
    }

    // ── 문안 ─────────────────────────────────────────────────────────────

    /**
     * 캡션의 문자를 만든다.
     *
     * 장면은 무엇을 말할지만 쥐고 있고 수는 여기서 셈 함수로 꺼낸다 — 화면의 대괄호와
     * 계기가 같은 함수를 지나므로 캡션의 수와 갈릴 수 없다 (C10, 프로토콜 4 절).
     */
    function captionText(scene: PivotChoiceMattersScene): string {
      const caption = scene.caption;
      const trial = activeTrial(scene);
      if (!caption || !trial) return '';
      const pivot = pivotValueAt(scene, activeIndex(scene)) ?? 0;
      switch (caption.kind) {
        case 'pickMiddle':
          return tr('caption.pickMiddle', 'Take the middle value {pivot} as the pivot.', { pivot });
        case 'pickFirst':
          return tr(
            'caption.pickFirst',
            'Now take the first value {pivot} as the pivot — the input is already sorted.',
            { pivot },
          );
        case 'splitEven':
          return tr(
            'caption.splitEven',
            '{left} slide left, {right} slide right. The beam stays level.',
            { left: countOn(trial, 'left'), right: countOn(trial, 'right') },
          );
        case 'pileOneSide':
          return tr(
            'caption.pileOneSide',
            'Nothing is smaller than {pivot} — all {loaded} pile onto one side.',
            { pivot, loaded: remainingOf(trial) },
          );
        case 'workHalved':
          return tr(
            'caption.workHalved',
            'The biggest part left holds {remaining} of {total} — the work halved.',
            { remaining: remainingOf(trial), total: totalOf(scene) },
          );
        case 'workBarelySmaller':
          return tr(
            'caption.workBarelySmaller',
            'The biggest part left holds {remaining} of {total} — only the pivot is gone.',
            { remaining: remainingOf(trial), total: totalOf(scene) },
          );
      }
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────

    function setPos(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    }

    function paintCell(rect: SVGRectElement, label: SVGTextElement, state: CellState): void {
      const fill =
        state === 'pivot' ? c.itemPivot : state === 'remaining' ? c.itemActive : c.itemDefault;
      const stroke =
        state === 'pivot'
          ? c.itemPivot
          : state === 'remaining'
            ? c.itemActive
            : state === 'landed'
              ? c.textMuted
              : c.border;
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', stroke);
      label.setAttribute('fill', state === 'pivot' || state === 'remaining' ? c.stateInk : c.text);
    }

    function makeCell(value: number, state: CellState, at: Layout): SVGGElement {
      const g = el('g', {});
      const rect = el('rect', {
        x: CELL_INSET,
        y: 0,
        width: at.pitch - CELL_INSET * 2,
        height: CELL_H,
        rx: 4,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: at.pitch / 2,
        y: CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      label.textContent = String(value);
      paintCell(rect, label, state);
      g.appendChild(rect);
      g.appendChild(label);
      return g;
    }

    /**
     * 장면이 말하는 것을 전부 세운다.
     *
     * 걸음마다 통째로 다시 짓는다. 되돌릴 명령이 필요 없고, 흐르던 운동이 남긴
     * 속성도 남을 자리가 없다 (S-scene). 요소를 계속 쓰지 않으므로 "숨기기만 해서
     * 앞 걸음의 값이 남는" 자리도 생기지 않는다 — 아직 없는 것은 짓지 않는다.
     */
    function drawStatic(scene: PivotChoiceMattersScene): LaneNodes[] {
      const at = layoutOf(scene);
      svg.setAttribute('viewBox', `0 0 ${at.width} ${at.height}`);
      root.textContent = '';

      const focus = focusOf(scene);
      const drawn: LaneNodes[] = [];

      for (let i = 0; i < at.laneCount; i += 1) {
        const trial = scene.trials[i] ?? null;
        const pivotIndex = pivotIndexAt(scene, i);
        const bracketed = trial ? bracketedSides(trial) : [];

        const g = el('g', {
          transform: `translate(0 ${at.laneTop(i)})`,
          // 언제나 명시로 쓴다. 지금 말하고 있는 판만 또렷하고, 다 굴린 뒤에는 둘 다 또렷하다.
          opacity: focus === null || focus === i ? 1 : DIM_OPACITY,
        });

        // 원래 줄의 자리. 기준 칸이 빠져나가도 그 자리는 점선으로 남는다.
        for (let k = 0; k < scene.values.length; k += 1) {
          g.appendChild(
            el('rect', {
              x: at.rowX(k) + CELL_INSET,
              y: ROW_Y,
              width: at.pitch - CELL_INSET * 2,
              height: CELL_H,
              rx: 4,
              fill: 'none',
              stroke: c.border,
              'stroke-dasharray': '3 3',
            }),
          );
        }

        const angle = trial?.settled === true ? tiltOf(trial) : 0;
        const beam = el('g', { transform: `rotate(${angle.toFixed(3)} ${at.cx} ${BEAM_Y})` });
        beam.appendChild(
          el('line', {
            x1: at.cx - at.beamHalf,
            y1: BEAM_Y,
            x2: at.cx + at.beamHalf,
            y2: BEAM_Y,
            stroke: c.textMuted,
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }),
        );

        // 남는 일을 짚은 대괄호. **남는 강조**라 정적 그리기가 세운다 (S-scene).
        const brackets: { path: SVGPathElement; length: number }[] = [];
        for (const side of bracketed) {
          const count = trial === null ? 0 : countOn(trial, side);
          const x0 =
            side === 'left' ? at.cx - at.pitch / 2 - count * at.pitch : at.cx + at.pitch / 2;
          const x1 = x0 + count * at.pitch;
          const path = el('path', {
            d: `M ${x0} ${BRACKET_Y + BRACKET_TICK} L ${x0} ${BRACKET_Y} L ${x1} ${BRACKET_Y} L ${x1} ${BRACKET_Y + BRACKET_TICK}`,
            fill: 'none',
            stroke: c.itemActive,
            'stroke-width': 2,
            'stroke-linejoin': 'round',
          });
          beam.appendChild(path);
          brackets.push({ path, length: BRACKET_TICK * 2 + count * at.pitch });
        }
        g.appendChild(beam);

        g.appendChild(
          el('polygon', {
            points: `${at.cx},${BEAM_Y} ${at.cx - FULCRUM_HALF_W},${BEAM_Y + FULCRUM_H} ${at.cx + FULCRUM_HALF_W},${BEAM_Y + FULCRUM_H}`,
            fill: c.textMuted,
          }),
        );

        // 계기 — `총수 → 남는 일`. 재기 전에는 아예 짓지 않는다.
        if (trial?.measured === true) {
          const measure = el('text', {
            x: MEASURE_X,
            y: MEASURE_Y,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            fill: c.text,
          });
          measure.textContent = `${totalOf(scene)} → ${remainingOf(trial)}`;
          g.appendChild(measure);
        }

        // 칸. 어느 단계에 있는지는 장면이 말하고, 자리와 칠은 거기서 나온다.
        const cells: SVGGElement[] = [];
        for (let k = 0; k < scene.values.length; k += 1) {
          const value = scene.values[k];
          const placement = trial?.placed.find((p) => p.index === k) ?? null;
          if (trial && pivotIndex === k) {
            const cell = makeCell(value, 'pivot', at);
            setPos(cell, at.pivotX, PIVOT_Y);
            g.appendChild(cell);
            cells.push(cell);
          } else if (placement) {
            const state: CellState = bracketed.includes(placement.side) ? 'remaining' : 'landed';
            const cell = makeCell(value, state, at);
            setPos(cell, at.armX(placement.side, placement.slot), ARM_TOP);
            // 저울대에 실린 칸은 저울이 기울면 함께 돈다.
            beam.appendChild(cell);
            cells.push(cell);
          } else {
            const cell = makeCell(value, 'row', at);
            setPos(cell, at.rowX(k), ROW_Y);
            g.appendChild(cell);
            cells.push(cell);
          }
        }

        root.appendChild(g);
        drawn.push({ g, beam, brackets, cells });
      }

      const caption = el('text', {
        x: at.cx,
        y: at.height - 12,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      caption.textContent = captionText(scene);
      root.appendChild(caption);

      return drawn;
    }

    // ── 흐르게 할 것 ─────────────────────────────────────────────────────

    /**
     * 이 걸음에 흐를 것을 하나로 모은다.
     *
     * 흐를 것이 여럿인 걸음(재기)도 목록 하나로 묶어 **시계 하나**가 돌린다. 그래야
     * `render` 의 Promise 가 전부 선 뒤에 풀린다 (S-scene).
     */
    function motionFor(scene: PivotChoiceMattersScene, drawn: LaneNodes[]): Motion | null {
      const step = scene.step;
      if (!step) return null;
      const at = layoutOf(scene);
      const lane = activeIndex(scene);
      const trial = activeTrial(scene);
      const nodes = drawn[lane];

      switch (step.kind) {
        // 기준 칸이 받침 위로 미끄러진 뒤 내려앉는다.
        case 'lift': {
          const pivotIndex = pivotIndexAt(scene, lane);
          const cell = pivotIndex === null ? undefined : nodes?.cells[pivotIndex];
          if (!cell || pivotIndex === null) return null;
          const fromX = at.rowX(pivotIndex);
          return {
            duration: LIFT_MS,
            apply(t) {
              const slide = easeInOut(Math.min(1, t * 1.6));
              const drop = easeInOut(t);
              setPos(
                cell,
                fromX + (at.pivotX - fromX) * slide,
                ROW_Y + (PIVOT_Y - ROW_Y) * drop,
              );
            },
          };
        }

        // 방금 쌓인 칸 하나가 줄에서 팔로 건너간다. 어느 칸인지는 장면의 끝이 말한다.
        case 'move': {
          const placement = trial?.placed[trial.placed.length - 1];
          const cell = placement ? nodes?.cells[placement.index] : undefined;
          if (!placement || !cell) return null;
          const fromX = at.rowX(placement.index);
          const toX = at.armX(placement.side, placement.slot);
          return {
            duration: MOVE_MS,
            apply(t) {
              const e = easeInOut(t);
              const y = ROW_Y + (ARM_TOP - ROW_Y) * e - MOVE_ARC * Math.sin(Math.PI * t);
              setPos(cell, fromX + (toX - fromX) * e, y);
            },
          };
        }

        // 저울대가 기운다. 출발은 언제나 수평이다 — 판마다 기우는 걸음이 한 번뿐이라.
        case 'settle': {
          const beam = nodes?.beam;
          if (!beam || !trial) return null;
          const target = tiltOf(trial);
          return {
            duration: TILT_MS,
            apply(t) {
              const swing = WOBBLE_DEG * Math.sin(t * Math.PI * 3) * (1 - t);
              const a = target * easeInOut(t) + swing;
              beam.setAttribute('transform', `rotate(${a.toFixed(3)} ${at.cx} ${BEAM_Y})`);
            },
          };
        }

        /*
         * 남는 일을 짚는다.
         *
         * 대괄호는 **처음 나타나는 것**이라 그어지는 꼴이 맞고, 그 팔의 칸은 **이미
         * 서 있던 것**이라 나타나는 꼴이 아니라 부풀었다 돌아오는 꼴이 맞다. 둘을 한
         * 시계로 돌린다.
         */
        case 'measure': {
          if (!nodes || !trial) return null;
          const brackets = nodes.brackets;
          // 부푸는 칸과 그 자리. 자리는 장면의 팔·차례에서 다시 셈한다 — 요소의
          // 지금 좌표를 되읽으면 순서가 화면을 가른다 (프로토콜 4 절).
          const swelling: { cell: SVGGElement; x: number }[] = [];
          for (const side of bracketedSides(trial)) {
            for (const placement of armOf(trial, side)) {
              const cell = nodes.cells[placement.index];
              if (cell) swelling.push({ cell, x: at.armX(placement.side, placement.slot) });
            }
          }
          if (brackets.length === 0 && swelling.length === 0) return null;
          return {
            duration: MARK_MS,
            apply(t) {
              const drawn01 = easeInOut(t);
              for (const bracket of brackets) {
                bracket.path.setAttribute('stroke-dasharray', String(bracket.length));
                bracket.path.setAttribute(
                  'stroke-dashoffset',
                  (bracket.length * (1 - drawn01)).toFixed(2),
                );
              }
              const scale = 1 + SWELL * Math.sin(Math.PI * t);
              const half = at.pitch / 2;
              const mid = CELL_H / 2;
              for (const spot of swelling) {
                spot.cell.setAttribute(
                  'transform',
                  `translate(${spot.x.toFixed(2)} ${ARM_TOP.toFixed(2)}) translate(${half.toFixed(2)} ${mid.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${(-half).toFixed(2)} ${(-mid).toFixed(2)})`,
                );
              }
            },
          };
        }

        // 흐려 두었던 판이 도로 밝아진다. 견주라는 말과 같은 동사다.
        case 'compare': {
          const dimmed = drawn.filter((_, i) => i !== lane);
          if (dimmed.length === 0) return null;
          return {
            duration: MARK_MS,
            apply(t) {
              const value = DIM_OPACITY + (1 - DIM_OPACITY) * easeInOut(t);
              for (const node of dimmed) node.g.setAttribute('opacity', value.toFixed(3));
            },
          };
        }
      }
    }

    /**
     * 장면을 그린다.
     *
     * 정적으로 전량 세운 뒤, `animate` 일 때만 방금 달라진 것을 흐르게 한다.
     * 되짚기는 `animate: false` 로 와서 타이머도 프레임도 걸지 않고 돌아간다.
     */
    async function render(
      next: PivotChoiceMattersScene,
      /** 출발 자리를 장면에서 되셈하므로 앞 장면을 들추지 않는다. */
      _prev: PivotChoiceMattersScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const my = gen;

      const drawn = drawStatic(next);
      if (!opts.animate) return;

      const motion = motionFor(next, drawn);
      if (!motion || motion.duration <= 0) return;

      await animate(motion.duration, my, (t) => motion.apply(t));

      if (!alive(my)) return;
      // 운동이 남긴 보간 끝자리와 임시 속성을 거두고 그 장면을 통째로 다시 세운다.
      // 속성을 하나씩 되돌리는 것보다 안전하고, 그 사이에 타이머도 프레임도 없어
      // 페인트가 끼지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        // 살아 있는 걸음 함수가 깨어나도 자기 세대가 아니게 만든다.
        gen += 1;
        for (const id of frames) unschedule(id);
        frames.clear();
        // 걸려 있는 애니메이션은 여기서 전부 결과를 낸다 — 남기면 알고리즘이
        // 깨어나지 못한 채로 멈춘다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
