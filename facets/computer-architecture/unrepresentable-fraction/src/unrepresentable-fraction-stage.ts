/**
 * unrepresentable-fraction stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 형태가 어디서 나왔는가
 *
 * 이 조각의 동사는 **되돌아온다** 이다. 그래서 화면의 중심은 "남은 값이 놓이는
 * 자리들의 줄" 이고, 그 위를 값 하나가 왼쪽에서 오른쪽으로 옮겨 간다. 앞에 나온
 * 자리로 다시 닿는 순간 줄 위에 **호가 그어지고 값이 그 호를 타고 되돌아간다** —
 * 되풀이는 색이 바뀌는 일이 아니라 자리를 옮기는 일이라야 한다 (S-piece).
 *
 * **지나온 나머지는 하나도 지워지지 않는다.** 그래야 "같은 값이 다시 나왔다" 를
 * 말할 짝이 남는다. 자리 타일은 `slots` 가 통째로 세우고, 고리가 닫히면 그 두
 * 끝에 표식이 서서 **완주 화면에도** 어디로 되돌아왔는지가 남는다.
 *
 * 아래의 띠는 뽑혀 나온 자리가 쌓이는 곳이다. 자리는 타일에서 띠로 **떨어져**
 * 내려오고, 고리를 돌 때마다 같은 네 자리가 다시 떨어진다.
 *
 * ── 이행이 고친 것 둘
 *
 * 1. **잘린 몫이 화면에서 사라지고 있었다.** 옛 `cut()` 은 넘친 자리를 오른쪽으로
 *    밀며 `opacity` 0 으로 지우고 `overflow.remove()` 했다. 그러면 "끝나지 않는
 *    것을 유한한 그릇에 담으면 무엇이 버려지는가" 라는 **두 번째 결론이 완주
 *    화면에 없다.** 이제 잘린 자리는 그릇 선 아래 한 줄로 **떨어져 흐리게 남고**,
 *    끝없음을 말하는 `…` 도 그 줄 끝에 따라 내려간다 (프로토콜 4 절 7 번).
 * 2. **이번 걸음에 무엇이 떨어졌나가 정지 화면에 없었다.** 칩이 `itemActive` 로
 *    날아왔다가 `text` 로 앉아 버려, 멎은 화면에서는 방금 나온 자리를 짚을 수
 *    없었다. 이제 그 자리 위에 눈금이 선다.
 *
 * ── 채움과 테두리를 갈라 둔다 (프로토콜 4 절 29 번)
 *
 * | | 채움 | 테두리 |
 * | --- | --- | --- |
 * | 자리 타일 | 값이 앉았나 (빈 자리는 점선 바탕뿐) | 고리의 두 끝 · 이번에 짚어 본 자리 |
 * | 띠의 자리 | 그릇 안 / 잘려 나간 것 / 올림으로 바뀐 것 | 되풀이 구간 밑줄 · 이번 걸음 눈금 |
 *
 * 옛 화면은 타일의 `stroke` 1.5/3 한 축에 "값이 앉았다" 와 "되돌아온 자리다" 두
 * 뜻을 실었다. 갈라 두면 둘이 한 화면에 함께 선다.
 *
 * ── 좌표
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 선언하지 않고, 세로만 여기서 정한다
 * (S-piece). 타일 폭과 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다.
 *
 * `TRACK_SLOTS` 와 `TAPE_CELLS` 는 **이 그림이 담는 한도**다. 장면은 한도를 모르고
 * 구조를 통째로 들고 있으며, 자르는 것은 그리는 쪽의 몫이다.
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

import { fractionDecimalText } from './algorithm.js';
import {
  digitAt,
  flipIndexOf,
  keepOf,
  nextSlot,
  type UnrepresentableFractionScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 216;
const SIDE_MIN = 22;

/** 남은 값이 놓이는 자리의 수 — 이 그림이 담는 한도. */
const TRACK_SLOTS = 5;
const TILE_GAP = 24;
const TILE_MAX_W = 96;
const TILE_Y = 46;
const TILE_H = 42;
const DOT_R = 7;
const DOT_Y = TILE_Y - 9;
const ARC_CTRL_Y = -8;
const ARC_LABEL_Y = 12;

/** 자리띠가 담는 칸의 수 — 이 그림이 담는 한도. */
const TAPE_CELLS = 30;
const CELL_MAX_W = 20;
const PREFIX_W = 66;
const TAIL_W = 16;

/** 그릇 표식이 서는 자리 — 띠 바로 위. */
const BRACKET_LABEL_Y = 98;
const BRACKET_Y = 104;
/** 이번 걸음에 떨어진 자리를 짚는 눈금. */
const TICK_Y0 = 111;
const TICK_Y1 = 115;

const TAPE_Y = 118;
const CELL_H = 26;
const DIGIT_BASELINE = TAPE_Y + 18;
/** 되풀이 구간 밑줄. */
const RULE_Y = 150;
/** 그릇 밖으로 잘려 나간 자리가 앉는 줄. */
const DROP_BASELINE = 172;
const CAPTION_Y = 200;

const MOVE_MS = 360;
const POP_MS = 180;
const ARC_MS = 620;
const LAP_TOTAL_MS = 820;
const CUT_MS = 560;
const FLIP_MS = 320;
const FADE_MS = 260;
const HOLD_MS = 60;

/** 마무리에서 기계가 흐려지는 정도. 보간 끝에서 이 상수를 그대로 쓴다. */
const DONE_OPACITY = '0.45';

const tileW = Math.min(
  TILE_MAX_W,
  Math.floor((W - SIDE_MIN * 2 - TILE_GAP * (TRACK_SLOTS - 1)) / TRACK_SLOTS),
);
const trackW = TRACK_SLOTS * tileW + TILE_GAP * (TRACK_SLOTS - 1);
const trackX = Math.round((W - trackW) / 2);

const cellW = Math.min(
  CELL_MAX_W,
  Math.floor((W - SIDE_MIN * 2 - PREFIX_W - TAIL_W) / TAPE_CELLS),
);
const tapeW = TAPE_CELLS * cellW;
const tapeX = Math.round((W - tapeW - PREFIX_W - TAIL_W) / 2) + PREFIX_W;

const tileX = (i: number): number => trackX + i * (tileW + TILE_GAP);
const tileCx = (i: number): number => tileX(i) + tileW / 2;
const cellX = (i: number): number => tapeX + i * cellW;
const cellCx = (i: number): number => cellX(i) + cellW / 2;

type Pt = { x: number; y: number };

/**
 * 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다.
 *
 * 좌표도 함께 싣는다 — 운동의 출발값을 화면에서 되읽지 않기 위함이다 (S-scene:
 * `prev` 도 화면도 출발값의 출처가 아니다).
 */
type Drawn = {
  /** 자리 타일 그룹. 안 열린 자리는 `null`. */
  tiles: (SVGGElement | null)[];
  token: SVGCircleElement | null;
  arc: SVGPathElement | null;
  arcHead: SVGPathElement | null;
  arcLabel: SVGTextElement | null;
  rule: SVGLineElement | null;
  ruleX0: number;
  ruleX1: number;
  /** 띠에 앉은 자리 글자. 차례가 곧 자리 번호이며, 잘린 것은 `null`. */
  tapeDigits: (SVGTextElement | null)[];
  /** 이번 걸음에 떨어진 자리를 짚는 눈금. */
  ticks: SVGLineElement[];
  /** 그릇 밖으로 잘려 나간 글자들. 꼬리 `…` 도 여기 든다. */
  dropped: SVGTextElement[];
  bracket: SVGPathElement | null;
  bracketX0: number;
  bracketX1: number;
  vesselLabel: SVGTextElement | null;
  cutLine: SVGLineElement | null;
  /** 올림으로 바뀐 자리와 그 두 값. 운동이 자취값에서 그릇값으로 넘긴다. */
  flip: { node: SVGTextElement; was: number; now: number } | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 2;
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 2차 베지에 위의 한 점. SVG 기하 API 에 기대지 않으려고 직접 센다. */
function quadAt(from: Pt, ctrl: Pt, to: Pt, p: number): Pt {
  const q = 1 - p;
  return {
    x: q * q * from.x + 2 * q * p * ctrl.x + p * p * to.x,
    y: q * q * from.y + 2 * q * p * ctrl.y + p * p * to.y,
  };
}

/** 두 자리를 잇는 호의 세 점. */
function arcPoints(from: number, to: number): { p1: Pt; ctrl: Pt; p2: Pt } {
  const p1 = { x: tileCx(from), y: DOT_Y };
  const p2 = { x: tileCx(to), y: DOT_Y };
  return { p1, ctrl: { x: (p1.x + p2.x) / 2, y: ARC_CTRL_Y }, p2 };
}

/** 호를 `upto` 만큼만 그린 경로. */
function arcPathD(from: number, to: number, upto: number): string {
  const { p1, ctrl, p2 } = arcPoints(from, to);
  const steps = 28;
  let d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  for (let i = 1; i <= steps; i += 1) {
    const pt = quadAt(p1, ctrl, p2, (i / steps) * upto);
    d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }
  return d;
}

/** 그릇의 자락. 왼쪽 끝에서 `x1` 까지 아래로 열린 괄호를 그린다. */
function bracketD(x0: number, x1: number): string {
  return `M ${x0.toFixed(1)} ${BRACKET_Y} l 0 6 L ${x1.toFixed(1)} ${BRACKET_Y + 6} l 0 -6`;
}

export const unrepresentableFractionStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<UnrepresentableFractionScene> {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 기다림과 프레임. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 마디 지나고 (`lap` 은 열두 마디까지 간다), 그 사이에
     * `destroy` 가 오면 남은 마디가 이미 떨어져 나간 노드를 만진다. `isInstant` 는
     * 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function wait(ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
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

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) return finish();
          const p = ms <= 0 ? 1 : clamp01((now() - started) / ms);
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

    // ── 층 (뒤에서 앞으로). 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gTape = el('g');
    const gTrack = el('g');
    const gArc = el('g');
    const gTiles = el('g');
    const gDigits = el('g');
    const gDrop = el('g');
    const gVessel = el('g');
    const gToken = el('g');
    const gChips = el('g');
    const gText = el('g');
    const layers = [gTape, gTrack, gArc, gTiles, gDigits, gDrop, gVessel, gToken, gChips, gText];
    for (const layer of layers) canvas.appendChild(layer);

    /**
     * 마무리에 흐려지는 층.
     *
     * 층 자체는 재건 밖이라 마지막 `drawStatic` 이 자식만 갈아 끼우고 층의
     * `opacity` 는 건드리지 않는다. 그래서 정적 경로가 **매번 명시로** 쓴다
     * (프로토콜 4 절 18 번).
     */
    const dimLayers = [gTrack, gTiles, gArc, gToken];

    function clearAll(): void {
      for (const layer of layers) layer.textContent = '';
    }

    // ── 문안 ──────────────────────────────────────────────────────────────

    /**
     * 그 걸음이 무엇을 말하나. `step` 의 갈래와 1 대 1 이라 장면에 따로 담지 않는다.
     *
     * 수는 전부 장면의 자취에서 꺼낸다 — 캡션과 그림이 한 출처다 (C10).
     */
    function captionOf(s: UnrepresentableFractionScene): string {
      const step = s.step;
      if (step === null) return '';
      const den = s.denominator;
      const text = (n: number): string => fractionDecimalText(n, den);

      switch (step.kind) {
        case 'seed':
          return t('caption.seed', 'Start from {rest}. Multiply by 2 and peel off one digit.', {
            rest: text(s.numerator),
          });
        case 'peel': {
          const digit = s.digits[s.digits.length - 1] ?? 0;
          const fromValue = s.slots[step.from] ?? 0;
          // 곱은 자취에서 되세운다 — 떼어 낸 자리와 남은 것을 합치면 곱이다.
          const product = digit * den + s.rest;
          return t(
            'caption.peel',
            '{from} × 2 = {product} — the digit taken is {digit}, and what is left is {rest}.',
            {
              from: text(fromValue),
              product: text(product),
              digit: String(digit),
              rest: text(s.rest),
            },
          );
        }
        case 'close':
          return t(
            'caption.repeat',
            'This remainder has appeared before: {rest}. The pattern closes here.',
            { rest: text(s.rest) },
          );
        case 'lap':
          return t('caption.lap', 'Around the loop again: {digits}. It never ends.', {
            digits: s.digits.slice(s.digits.length - step.count).join(''),
          });
        case 'cut':
          return t(
            'caption.cut',
            'float32 holds only this many digits: {keep}. The rest is cut off, and the last digit rounds up.',
            { keep: keepOf(s) },
          );
        case 'done':
          return t(
            'caption.done',
            'This value has no end in base 2: {value}. What is stored is the cut value.',
            { value: text(s.numerator) },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 층을 통째로 비우고 다시 짓는다. 되돌릴 목록을 손으로 관리하지 않으므로 보간이
     * 남긴 `opacity` 나 좌표 끝자리가 남을 자리가 없다 (S-scene).
     */
    function drawStatic(s: UnrepresentableFractionScene): Drawn {
      clearAll();

      const den = s.denominator;
      const shown = Math.min(s.digits.length, TAPE_CELLS);
      const keep = keepOf(s);
      const flipAt = s.cut ? flipIndexOf(s) : 0;
      /** 띠에 남는 자리 수. 잘린 뒤에는 그릇이 담는 만큼이다. */
      const kept = s.cut ? Math.min(keep, shown) : shown;
      const step = s.step;

      // ── 빈 자리와 ×2 화살. 그림의 바탕이다.
      for (let i = 0; i < TRACK_SLOTS; i += 1) {
        gTrack.appendChild(
          el('rect', {
            x: tileX(i),
            y: TILE_Y,
            width: tileW,
            height: TILE_H,
            rx: 8,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '4 3',
          }),
        );
        if (i === TRACK_SLOTS - 1) continue;
        const y = TILE_Y + TILE_H / 2;
        const from = tileX(i) + tileW + 3;
        const to = tileX(i + 1) - 3;
        gTrack.appendChild(
          el('line', {
            x1: from,
            y1: y,
            x2: to - 4,
            y2: y,
            stroke: colors.border,
            'stroke-width': 1.5,
          }),
        );
        gTrack.appendChild(
          el('path', {
            d: `M ${to - 5} ${y - 4} L ${to} ${y} L ${to - 5} ${y + 4} Z`,
            fill: colors.border,
          }),
        );
        // 수식 표기라 문안이 아니다 (C10).
        const times = el('text', {
          x: (from + to) / 2,
          y: y - 7,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        times.textContent = '×2';
        gTrack.appendChild(times);
      }

      // ── 자리 타일. 지나온 나머지는 하나도 지워지지 않는다.
      //    채움 = 값이 앉았다 / 테두리 = 고리의 끝 · 이번에 짚어 본 자리.
      const probed = step !== null && step.kind === 'peel' && !step.fresh ? step.to : -1;
      const tiles: (SVGGElement | null)[] = [];
      for (let i = 0; i < TRACK_SLOTS; i += 1) {
        const value = s.slots[i];
        if (value === undefined) {
          tiles.push(null);
          continue;
        }
        const marked = (s.loop !== null && (i === s.loop.from || i === s.loop.to)) || i === probed;
        const group = el('g');
        group.appendChild(
          el('rect', {
            x: tileX(i),
            y: TILE_Y,
            width: tileW,
            height: TILE_H,
            rx: 8,
            fill: colors.bg,
            stroke: marked ? colors.accent : colors.text,
            'stroke-width': marked ? 2.5 : 1.5,
          }),
        );
        const label = el('text', {
          x: tileCx(i),
          y: TILE_Y + TILE_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        label.textContent = fractionDecimalText(value, den);
        group.appendChild(label);
        gTiles.appendChild(group);
        tiles.push(group);
      }

      // ── 고리. 닫히면 호와 표식이 서고 **끝까지 남는다**.
      let arc: SVGPathElement | null = null;
      let arcHead: SVGPathElement | null = null;
      let arcLabel: SVGTextElement | null = null;
      if (s.loop !== null && s.loop.from < TRACK_SLOTS && s.loop.to < TRACK_SLOTS) {
        const { from, to } = s.loop;
        arc = el('path', {
          d: arcPathD(from, to, 1),
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
        });
        gArc.appendChild(arc);
        const head = arcPoints(from, to).p2;
        arcHead = el('path', {
          d: `M ${head.x - 5} ${head.y - 8} L ${head.x + 5} ${head.y - 8} L ${head.x} ${head.y - 1} Z`,
          fill: colors.accent,
        });
        gArc.appendChild(arcHead);
        arcLabel = el('text', {
          x: (tileCx(from) + tileCx(to)) / 2,
          y: ARC_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.accent,
        });
        arcLabel.textContent = t('label.repeat', 'repeats');
        gArc.appendChild(arcLabel);
      }

      // ── 토큰. 지금 값이 어느 자리에 있나.
      let token: SVGCircleElement | null = null;
      if (s.slots.length > 0 && s.at < TRACK_SLOTS) {
        token = el('circle', {
          cx: tileCx(s.at),
          cy: DOT_Y,
          r: DOT_R,
          fill: colors.itemActive,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
        gToken.appendChild(token);
      }

      // ── 띠 바탕과 분수 표기.
      gTape.appendChild(
        el('rect', {
          x: tapeX,
          y: TAPE_Y,
          width: tapeW,
          height: CELL_H,
          rx: 4,
          fill: colors.bgSubtle,
        }),
      );
      // 수식 표기라 문안이 아니다 (C10) — 분수는 장면이 준다.
      const prefix = el('text', {
        x: tapeX - 6,
        y: DIGIT_BASELINE,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      prefix.textContent = `${s.numerator}/${den} = 0.`;
      gTape.appendChild(prefix);

      // ── 뽑혀 나온 자리들. 그릇 밖의 것은 아래 줄로 내려가 흐리게 남는다.
      const tapeDigits: (SVGTextElement | null)[] = [];
      const dropped: SVGTextElement[] = [];
      let flip: Drawn['flip'] = null;
      for (let i = 0; i < shown; i += 1) {
        const value = digitAt(s, i);
        if (value === undefined) {
          tapeDigits.push(null);
          continue;
        }
        const out = s.cut && i >= keep;
        const flipped = flipAt > 0 && i === flipAt - 1;
        const node = el('text', {
          x: cellCx(i),
          y: out ? DROP_BASELINE : DIGIT_BASELINE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: out ? colors.textMuted : flipped ? colors.accent : colors.text,
        });
        node.textContent = String(value);
        if (out) {
          gDrop.appendChild(node);
          dropped.push(node);
          tapeDigits.push(null);
        } else {
          gDigits.appendChild(node);
          tapeDigits.push(node);
          if (flipped) flip = { node, was: s.digits[i] ?? value, now: value };
        }
      }

      // ── 끝없음을 말하는 꼬리. 잘린 뒤에는 잘린 몫을 따라 아래 줄로 내려간다.
      const tail = el('text', {
        x: cellX(shown) + 3,
        y: s.cut ? DROP_BASELINE : DIGIT_BASELINE,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      tail.textContent = '…';
      if (s.cut) {
        gDrop.appendChild(tail);
        dropped.push(tail);
      } else {
        gDigits.appendChild(tail);
      }

      // ── 이번 걸음에 떨어진 자리를 짚는 눈금 (테두리 축).
      const ticks: SVGLineElement[] = [];
      const freshFrom =
        step === null
          ? -1
          : step.kind === 'peel'
            ? s.digits.length - 1
            : step.kind === 'lap'
              ? s.digits.length - step.count
              : -1;
      if (freshFrom >= 0) {
        for (let i = Math.max(0, freshFrom); i < kept; i += 1) {
          const mark = el('line', {
            x1: cellCx(i),
            y1: TICK_Y0,
            x2: cellCx(i),
            y2: TICK_Y1,
            stroke: colors.accent,
            'stroke-width': 2,
          });
          gDigits.appendChild(mark);
          ticks.push(mark);
        }
      }

      // ── 되풀이 구간 밑줄 (테두리 축).
      let rule: SVGLineElement | null = null;
      let ruleX0 = 0;
      let ruleX1 = 0;
      if (s.loop !== null) {
        ruleX0 = cellX(Math.min(s.loop.to, TAPE_CELLS));
        ruleX1 = cellX(kept);
        rule = el('line', {
          x1: ruleX0,
          y1: RULE_Y,
          x2: ruleX1,
          y2: RULE_Y,
          stroke: colors.accent,
          'stroke-width': 2,
        });
        gDigits.appendChild(rule);
      }

      // ── 그릇. 어디까지 담기는지와 어디서 잘리는지.
      let bracket: SVGPathElement | null = null;
      let vesselLabel: SVGTextElement | null = null;
      let cutLine: SVGLineElement | null = null;
      const bracketX0 = tapeX;
      const bracketX1 = cellX(Math.min(keep, TAPE_CELLS));
      if (s.cut) {
        bracket = el('path', {
          d: bracketD(bracketX0, bracketX1),
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        gVessel.appendChild(bracket);
        // 그 분야에서 원어 그대로 쓰는 말이라 표식이다 (C10).
        vesselLabel = el('text', {
          x: (bracketX0 + bracketX1) / 2,
          y: BRACKET_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        vesselLabel.textContent = 'float32';
        gVessel.appendChild(vesselLabel);
        cutLine = el('line', {
          x1: bracketX1,
          y1: TAPE_Y - 4,
          x2: bracketX1,
          y2: TAPE_Y + CELL_H + 4,
          stroke: colors.danger,
          'stroke-width': 2,
        });
        gVessel.appendChild(cutLine);
      }

      // ── 캡션
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      caption.textContent = captionOf(s);
      gText.appendChild(caption);

      // ── 재건 밖 요소. 층의 opacity 는 매번 명시로 쓴다.
      for (const layer of dimLayers) {
        if (s.done) layer.setAttribute('opacity', DONE_OPACITY);
        else layer.removeAttribute('opacity');
      }

      return {
        tiles,
        token,
        arc,
        arcHead,
        arcLabel,
        rule,
        ruleX0,
        ruleX1,
        tapeDigits,
        ticks,
        dropped,
        bracket,
        bracketX0,
        bracketX1,
        vesselLabel,
        cutLine,
        flip,
      };
    }

    // ── 운동. 정적 그리기가 끝 자리를 세웠으므로 아직 못 온 만큼을 뒤로 물린다 ──

    /** 타일 하나가 제자리에서 솟는다. `e` 0→1 로만 진폭이 정해진다. */
    function popTile(group: SVGGElement, i: number, e: number): void {
      if (e >= 1) {
        group.removeAttribute('transform');
        return;
      }
      const cx = tileCx(i);
      const cy = TILE_Y + TILE_H / 2;
      const k = 0.86 + 0.14 * e;
      group.setAttribute(
        'transform',
        `translate(${cx} ${cy}) scale(${k.toFixed(3)}) translate(${-cx} ${-cy})`,
      );
    }

    /** 날아가는 글자 하나. 운동 중에만 있으므로 정적 그리기가 만들지 않는다. */
    function newChip(text: string, at: Pt, size: string): SVGTextElement {
      const chip = el('text', {
        x: at.x,
        y: at.y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': size,
        fill: colors.itemActive,
      });
      chip.textContent = text;
      gChips.appendChild(chip);
      return chip;
    }

    function moveChip(chip: SVGTextElement, at: Pt): void {
      chip.setAttribute('x', at.x.toFixed(2));
      chip.setAttribute('y', at.y.toFixed(2));
    }

    /** 분수가 띠의 왼쪽에서 첫 자리로 올라온다. */
    async function flowSeed(
      s: UnrepresentableFractionScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const tile = drawn.tiles[0];
      const token = drawn.token;
      if (tile === null || token === null) return;
      tile.setAttribute('opacity', '0');
      token.setAttribute('opacity', '0');

      const from: Pt = { x: tapeX - 30, y: DIGIT_BASELINE };
      const to: Pt = { x: tileCx(0), y: TILE_Y + TILE_H / 2 + 6 };
      const chip = newChip(fractionDecimalText(s.numerator, s.denominator), from, fontSizes.md);
      await tween(MOVE_MS, mine, (p) => {
        const e = easeInOut(p);
        moveChip(chip, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      });
      if (!alive(mine)) return;

      chip.remove();
      tile.removeAttribute('opacity');
      await tween(POP_MS, mine, (p) => popTile(tile, 0, easeOut(p)));
      if (!alive(mine)) return;
      token.removeAttribute('opacity');
    }

    /**
     * 자리 하나를 뽑는다.
     *
     * 새 자리로 가는 걸음이면 값이 옮겨 가고, 앞에 나온 자리로 되돌아오는 걸음이면
     * 값은 그대로 둔 채 그 자리를 짚어 보인다 — 되돌아가는 운동은 다음 걸음(고리
     * 닫기)이 맡는다. 자리가 떨어지는 것과 토큰이 옮기는 것은 한 뜻이라 **한 시계**로
     * 흘린다 (프로토콜 3 절 3 번).
     */
    async function flowPeel(
      s: UnrepresentableFractionScene,
      drawn: Drawn,
      from: number,
      to: number,
      fresh: boolean,
      mine: number,
    ): Promise<void> {
      const index = s.digits.length - 1;
      const digit = s.digits[index];
      const node = index < TAPE_CELLS ? drawn.tapeDigits[index] : null;
      const tile = fresh ? drawn.tiles[to] : null;
      const token = drawn.token;

      if (node !== null) node.setAttribute('opacity', '0');
      for (const tick of drawn.ticks) tick.setAttribute('opacity', '0');
      if (tile !== null && tile !== undefined) tile.setAttribute('opacity', '0');

      const start: Pt = { x: tileCx(from), y: TILE_Y + TILE_H + 4 };
      const land: Pt = { x: cellCx(Math.min(index, TAPE_CELLS - 1)), y: DIGIT_BASELINE };
      const chip = digit === undefined ? null : newChip(String(digit), start, fontSizes.sm);
      const x0 = tileCx(from);
      const x1 = tileCx(to);

      await tween(MOVE_MS, mine, (p) => {
        const e = easeInOut(p);
        if (chip !== null) {
          moveChip(chip, { x: start.x + (land.x - start.x) * e, y: start.y + (land.y - start.y) * e });
        }
        if (fresh && token !== null) token.setAttribute('cx', (x0 + (x1 - x0) * e).toFixed(2));
        if (tile !== null && tile !== undefined) {
          if (p > 0.45) {
            tile.removeAttribute('opacity');
            popTile(tile, to, easeOut(clamp01((p - 0.45) / 0.55)));
          }
        }
      });
      if (!alive(mine)) return;
      chip?.remove();
      node?.removeAttribute('opacity');
      for (const tick of drawn.ticks) tick.removeAttribute('opacity');
    }

    /** 고리가 닫힌다. 호를 긋고 값이 그 호를 타고 되돌아가며 밑줄이 자란다. */
    async function flowClose(
      drawn: Drawn,
      from: number,
      to: number,
      mine: number,
    ): Promise<void> {
      const arc = drawn.arc;
      if (arc === null) return;
      drawn.arcHead?.setAttribute('opacity', '0');
      drawn.arcLabel?.setAttribute('opacity', '0');
      arc.setAttribute('d', arcPathD(from, to, 0));

      await tween(ARC_MS / 2, mine, (p) => {
        if (p >= 1) arc.setAttribute('d', arcPathD(from, to, 1));
        else arc.setAttribute('d', arcPathD(from, to, easeOut(p)));
      });
      if (!alive(mine)) return;
      drawn.arcHead?.removeAttribute('opacity');
      drawn.arcLabel?.removeAttribute('opacity');

      const { p1, ctrl, p2 } = arcPoints(from, to);
      const token = drawn.token;
      const rule = drawn.rule;
      token?.setAttribute('cx', p1.x.toFixed(2));
      token?.setAttribute('cy', p1.y.toFixed(2));
      rule?.setAttribute('x2', drawn.ruleX0.toFixed(2));

      // 되돌아가는 것과 밑줄이 자라는 것은 한 뜻이라 시계를 하나만 쓴다.
      await tween(ARC_MS, mine, (p) => {
        const e = easeInOut(p);
        if (token !== null) {
          if (p >= 1) {
            token.setAttribute('cx', p2.x.toFixed(2));
            token.setAttribute('cy', p2.y.toFixed(2));
          } else {
            const pt = quadAt(p1, ctrl, p2, e);
            token.setAttribute('cx', pt.x.toFixed(2));
            token.setAttribute('cy', pt.y.toFixed(2));
          }
        }
        if (rule !== null) {
          const x = p >= 1 ? drawn.ruleX1 : drawn.ruleX0 + (drawn.ruleX1 - drawn.ruleX0) * e;
          rule.setAttribute('x2', x.toFixed(2));
        }
      });
    }

    /** 고리를 다시 돈다. 한 걸음에 도는 바퀴가 늘수록 빨라진다. */
    async function flowLap(
      s: UnrepresentableFractionScene,
      drawn: Drawn,
      from: number,
      count: number,
      mine: number,
    ): Promise<void> {
      if (count <= 0) return;
      const start = s.digits.length - count;
      const token = drawn.token;
      const ms = Math.max(60, Math.round(LAP_TOTAL_MS / count));

      for (let i = start; i < s.digits.length && i < TAPE_CELLS; i += 1) {
        drawn.tapeDigits[i]?.setAttribute('opacity', '0');
      }
      for (const tick of drawn.ticks) tick.setAttribute('opacity', '0');

      let at = from;
      for (let k = 0; k < count; k += 1) {
        if (!alive(mine)) return;
        const hopFrom = at;
        const hopTo = nextSlot(at, s.loop);
        at = hopTo;
        const index = start + k;
        const digit = s.digits[index];
        const node = index < TAPE_CELLS ? drawn.tapeDigits[index] : null;

        const chipStart: Pt = { x: tileCx(hopFrom), y: TILE_Y + TILE_H + 4 };
        const chipEnd: Pt = { x: cellCx(Math.min(index, TAPE_CELLS - 1)), y: DIGIT_BASELINE };
        const chip = digit === undefined ? null : newChip(String(digit), chipStart, fontSizes.sm);

        const back = hopTo <= hopFrom;
        const { p1, ctrl, p2 } = arcPoints(hopFrom, hopTo);
        const x0 = tileCx(hopFrom);
        const x1 = tileCx(hopTo);

        await tween(ms, mine, (p) => {
          const e = easeInOut(p);
          if (chip !== null) {
            moveChip(chip, {
              x: chipStart.x + (chipEnd.x - chipStart.x) * e,
              y: chipStart.y + (chipEnd.y - chipStart.y) * e,
            });
          }
          if (token === null) return;
          if (p >= 1) {
            token.setAttribute('cx', tileCx(hopTo).toFixed(2));
            token.setAttribute('cy', String(DOT_Y));
            return;
          }
          if (back) {
            const pt = quadAt(p1, ctrl, p2, e);
            token.setAttribute('cx', pt.x.toFixed(2));
            token.setAttribute('cy', pt.y.toFixed(2));
          } else {
            token.setAttribute('cx', (x0 + (x1 - x0) * e).toFixed(2));
            token.setAttribute('cy', String(DOT_Y));
          }
        });
        if (!alive(mine)) return;
        chip?.remove();
        node?.removeAttribute('opacity');
      }
      for (const tick of drawn.ticks) tick.removeAttribute('opacity');
    }

    /**
     * 그릇이 찼다. 자락이 그어지고 넘은 자리가 띠 밖으로 떨어진다.
     *
     * 떨어진 자리는 **사라지지 않고 아래 줄에 흐리게 남는다** — 무엇이 버려졌나가
     * 이 조각의 두 번째 결론이기 때문이다.
     */
    async function flowCut(drawn: Drawn, mine: number): Promise<void> {
      const bracket = drawn.bracket;
      if (bracket !== null) {
        drawn.vesselLabel?.setAttribute('opacity', '0');
        drawn.cutLine?.setAttribute('opacity', '0');
        bracket.setAttribute('d', bracketD(drawn.bracketX0, drawn.bracketX0));
        await tween(CUT_MS / 2, mine, (p) => {
          const x =
            p >= 1
              ? drawn.bracketX1
              : drawn.bracketX0 + (drawn.bracketX1 - drawn.bracketX0) * easeOut(p);
          bracket.setAttribute('d', bracketD(drawn.bracketX0, x));
        });
        if (!alive(mine)) return;
        drawn.vesselLabel?.removeAttribute('opacity');
        drawn.cutLine?.removeAttribute('opacity');
      }

      if (drawn.dropped.length > 0) {
        for (const node of drawn.dropped) node.setAttribute('y', String(DIGIT_BASELINE));
        await tween(CUT_MS, mine, (p) => {
          const e = easeOut(p);
          const y = p >= 1 ? DROP_BASELINE : DIGIT_BASELINE + (DROP_BASELINE - DIGIT_BASELINE) * e;
          for (const node of drawn.dropped) node.setAttribute('y', y.toFixed(2));
        });
        if (!alive(mine)) return;
      }

      // 올림 — 마지막 자리가 위로 튀었다 내려오며 값이 바뀐다.
      const flip = drawn.flip;
      if (flip !== null && flip.was !== flip.now) {
        flip.node.textContent = String(flip.was);
        await tween(FLIP_MS, mine, (p) => {
          const y = p >= 1 ? DIGIT_BASELINE : DIGIT_BASELINE - 9 * Math.sin(p * Math.PI);
          flip.node.setAttribute('y', y.toFixed(2));
          // 같은 걸음을 두 번 그려도 같은 결과가 되도록 매 프레임 통째로 쓴다.
          flip.node.textContent = String(p > 0.5 ? flip.now : flip.was);
        });
      }
    }

    /** 기계는 멎고 그릇에 담긴 것만 남는다. */
    async function flowDone(mine: number): Promise<void> {
      await tween(FADE_MS, mine, (p) => {
        if (p >= 1) {
          for (const layer of dimLayers) layer.setAttribute('opacity', DONE_OPACITY);
          return;
        }
        const o = (1 - 0.55 * easeOut(p)).toFixed(3);
        for (const layer of dimLayers) layer.setAttribute('opacity', o);
      });
      if (!alive(mine)) return;
      await wait(HOLD_MS, mine);
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: UnrepresentableFractionScene,
      _prev: UnrepresentableFractionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'seed':
          await flowSeed(next, drawn, mine);
          break;
        case 'peel':
          await flowPeel(next, drawn, step.from, step.to, step.fresh, mine);
          break;
        case 'close':
          await flowClose(drawn, step.from, step.to, mine);
          break;
        case 'lap':
          await flowLap(next, drawn, step.from, step.count, mine);
          break;
        case 'cut':
          await flowCut(drawn, mine);
          break;
        case 'done':
          await flowDone(mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 `opacity` 와 좌표 끝자리, 날아온 칩이 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 rAF 는 tick 을 아예 부르지 않으므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const layer of layers) layer.remove();
      },
    };
  },
};
