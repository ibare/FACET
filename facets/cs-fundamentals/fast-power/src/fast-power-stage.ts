/**
 * fast-power-stage — 제곱의 사다리와, 같은 눈금으로 그린 곱셈 자 둘.
 *
 * ── 형태가 질문에서 나온 자리
 *
 * 묻는 것은 "그래서 얼마나 아끼는가" 다. 아낌은 견줌이므로 **두 길이를 같은
 * 눈금으로 나란히 그린다** — 아래의 자 둘은 칸 하나가 곱셈 하나이고 눈금이 서로
 * 같아, 두 막대의 길이 차이가 곧 절약이다. 지수를 밀면 단순한 쪽이 화면 끝까지
 * 뻗는 동안 빠른 쪽은 실오라기로 줄어든다.
 *
 * 왼쪽 사다리는 그 절약이 어디서 오는지를 말한다. 한 칸 내려갈 때마다 덮는 폭이
 * 두 배가 되므로 칸 수는 지수가 아니라 **자릿수**만큼이고, 그래서 지수가 125 배가
 * 되어도 사다리는 넷에서 열로만 는다. 칸이 답으로 갈지 말지는 그 자리의 이진수가
 * 정하고, 답으로 간 칸의 폭을 더하면 지수가 된다 — 오른쪽 상자의 어깨수가 1 · 5 ·
 * 13 으로 자라는 것이 그 덧셈이다.
 *
 * 조각(`squareAndHalve`)은 같은 일을 **가로로 접히는 줄**로 그렸다. 여기서는 접을
 * 것이 없고 쌓을 것만 있으므로 세로 사다리다 — 지수 1000 이면 줄은 화면에 담기지
 * 않지만 사다리는 열 칸이면 된다.
 *
 * ── 운동
 *
 * 제곱은 새 칸이 윗칸 자리에서 제 자리로 **내려오고**, 답으로 보내는 것은 어깨수가
 * 사다리에서 답 상자로 **날아간다**. 건너뛰는 자리는 칸이 왼쪽으로 물러나 남는다.
 * 페이드가 아니라 자리를 옮긴다 — `S-piece` 가 조각에 건 잣대이나 완제품도 같다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 지수에 따라 칸 수가 넷에서 열까지
 * 달라지지만, 사다리가 놓일 자리는 가장 큰 경우에 맞춰 잡아 두고 칸 높이만 그 안에서
 * 줄인다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 720;
const VIEW_H = 320;
const PAD_X = 16;

/** 머리 라벨이 앉는 줄. */
const HEAD_Y = 22;

// ── 사다리. 칸 수는 4~10 으로 달라지고 자리는 가장 큰 경우에 맞춰 잡아 둔다.
const LADDER_TOP = 36;
const LADDER_H = 168;
const RUNG_MAX_H = 26;
/** 칸 하나가 글자를 담는 최소 높이. 이 아래로 줄이면 어깨수가 읽히지 않는다. */
const MIN_CHIP_H = 12;
const DIGIT_CX = PAD_X + 11;
const SPAN_RIGHT = PAD_X + 84;
const CHIP_X = PAD_X + 96;
const CHIP_W = 150;

// ── 답 상자.
const BOX_X = 470;
const BOX_W = VIEW_W - PAD_X - BOX_X;
const BOX_TOP = LADDER_TOP;
const BOX_H = LADDER_H;

// ── 곱셈 자 둘. 칸 하나가 곱셈 하나이고 눈금은 둘이 같다.
const TRACK_X = PAD_X + 72;
/**
 * 막대 끝에 수를 적을 자리.
 *
 * 이만큼을 비워 두면 막대가 오른쪽 끝까지 가지 않으므로 **수가 늘 바탕 위에 앉는다.**
 * 비워 두지 않으면 단순한 쪽 막대가 자를 가득 채울 때 수를 막대 안으로 돌려 넣게
 * 되는데, 막대 색은 `categorical` 이라 그 위의 잉크는 `design-tokens` 의 대비 표가
 * 보증하지 않는다 (rule-guard 권고, 2026-09-11).
 */
const COUNT_W = 44;
const TRACK_W = VIEW_W - PAD_X - TRACK_X - COUNT_W;
const FAST_Y = 228;
const SLOW_Y = 254;
const BAR_H = 16;
const BRACKET_Y = 284;
const CAPTION_Y = 306;
/** 칸 하나의 상한. 지수가 작을 때 자가 포스터가 되지 않게 한다. */
const UNIT_MAX = 18;

/**
 * 걸음마다의 운동 길이.
 *
 * 걸음 벽시계는 운동 + `stepMs` 이고, 가장 얇은 걸음이 800ms 아래로 떨어지면
 * 캡션을 읽을 틈이 사라진다. 바닥선을 못박은 것은 `S-piece` 85–87 행이라 조각의
 * 잣대이지만, 이 배치의 사양이 **완제품의 자동 재생도 같은 잣대로 본다** 고 적어
 * 그대로 준용한다.
 *
 * 가장 얇은 걸음은 건너뛰기라 340 + 560 = 900ms 이고, 실측은 915ms 였다. 판을
 * 세우는 첫 걸음과 마무리 걸음에도 운동을 둔다 — 정지 걸음이 하나라도 있으면 그
 * 걸음만 바닥선에 붙는다.
 */
const MS_BEGIN = 400;
const MS_SQUARE = 360;
const MS_TAKE = 420;
const MS_SKIP = 340;
const MS_VERDICT = 320;
const FRAME_MS = 16;

/**
 * 이 그림이 담는 사다리 칸 수의 상한.
 *
 * **stage 는 algorithm 을 참조할 수 없으므로(원칙 1) 손잡이 눈금을 알 길이 없다.**
 * 그래서 눈금의 사본을 두지 않는다 — 칸 수도 자의 눈금도 걸음마다 오는 payload 에서
 * 그 자리에 셈한다. 다만 **담을 수 있는 범위**는 그림이 정하고, 선언이 그 범위를
 * 넘는 손잡이 값을 고르면 축이 조용히 거짓말을 한다. 그 자리를 잠그는 것이
 * `test/fast-power.test.ts` 의 "축이 손잡이를 따라간다" 절이다.
 *
 * 값은 짐작이 아니라 기하에서 나온다 — 칸 하나가 `MIN_CHIP_H` 아래로 내려가지
 * 않는 최대 칸 수다. 지수 1000 이면 열 칸이라 아직 여유가 있다.
 */
export const LADDER_CAPACITY = Math.floor(LADDER_H / (MIN_CHIP_H + 2));

/** 가장 큰 손잡이 값에서도 빠른 쪽 막대가 이만큼은 남아야 보인다. */
export const MIN_VISIBLE_BAR = 4;

/** 자 하나가 쓸 수 있는 가로. 단순한 쪽 막대가 이보다 길면 축이 잘린다. */
export const TRACK_SPAN = TRACK_W;

/**
 * 곱셈 하나가 차지하는 가로.
 *
 * **자 둘이 같은 눈금을 쓴다** — 그것이 이 화면의 견줌이고, 눈금이 갈리면 두 막대의
 * 길이 차이가 절약을 뜻하지 않게 된다. 단순한 쪽이 자를 가득 채우도록 잡되 지수가
 * 작을 때 칸이 포스터가 되지 않게 상한을 둔다.
 */
export function unitFor(slow: number): number {
  return Math.min(UNIT_MAX, TRACK_W / Math.max(1, slow));
}

/** 자 둘을 가르는 색. 알고리즘 상태가 아니라 두 방법의 식별이다 (S-view 결정 트리 3). */
const TRACK_TONE = 'vivid' as const;
const TRACK_FAST = 0;
const TRACK_SLOW = 1;

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export type FastPowerScene = {
  base: number;
  exponent: number;
};

/** 지수의 이진 자릿수. 사다리의 칸 수이기도 하다. */
function bitLength(n: number): number {
  let bits = 0;
  let v = Math.floor(n);
  while (v > 0) {
    bits += 1;
    v = Math.floor(v / 2);
  }
  return Math.max(1, bits);
}

/** 3¹³ 처럼 어깨에 올린 수. 수식 표기이므로 표식이다 — 키를 만들지 않는다 (C10). */
function raised(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join('');
}

/**
 * initialData 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불리는 유일한
 * 경로이고, 좁히는 규칙이 두 벌이 되지 않게 여기 하나만 둔다.
 */
function readScene(raw: Record<string, unknown> | undefined): FastPowerScene {
  const base = typeof raw?.base === 'number' && Number.isFinite(raw.base) ? raw.base : 0;
  const rawExp = raw?.exponent;
  const exponent =
    typeof rawExp === 'number' && Number.isFinite(rawExp) ? Math.max(1, Math.floor(rawExp)) : 1;
  return { base, exponent };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

function text(
  content: string,
  x: number,
  y: number,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
  family: string = fonts.body,
): SVGTextElement {
  const t = el('text', {
    x,
    y,
    'font-family': family,
    'font-size': size,
    fill,
    'text-anchor': anchor,
    'dominant-baseline': 'middle',
  });
  t.textContent = content;
  return t;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

type Rung = {
  group: SVGGElement;
  chip: SVGRectElement;
  label: SVGTextElement;
  digit: SVGTextElement;
  place: number;
  /** 답으로 보낸 칸인가. 상태를 글자에서 되읽지 않으려고 여기 둔다. */
  taken: boolean;
};

export const fastPowerStageView: CanvasView = {
  canvas: { width: VIEW_W, height: VIEW_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const trackInk = categorical(2, TRACK_TONE);

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const root = el('g');
    params.canvas.appendChild(root);

    const ladderLayer = el('g');
    const boxLayer = el('g');
    const trackLayer = el('g');
    const chromeLayer = el('g');
    root.append(ladderLayer, boxLayer, trackLayer, chromeLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          apply(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return;
          const raw = Math.min(1, (Date.now() - start) / ms);
          apply(ease(raw));
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

    // ── 고정 장식: 머리 라벨과 답 상자와 자의 라벨, 캡션 자리.
    chromeLayer.append(
      text(tr('label.digit', 'digit'), DIGIT_CX, HEAD_Y, fontSizes.xs, colors.textMuted, 'middle'),
      text(tr('label.span', 'span'), SPAN_RIGHT, HEAD_Y, fontSizes.xs, colors.textMuted, 'end'),
      text(
        tr('label.answer', 'answer'),
        BOX_X + BOX_W / 2,
        HEAD_Y,
        fontSizes.xs,
        colors.textMuted,
        'middle',
      ),
      text(
        tr('label.fast', 'fast'),
        TRACK_X - 8,
        FAST_Y + BAR_H / 2,
        fontSizes.xs,
        colors.textMuted,
        'end',
      ),
      text(
        tr('label.slow', 'simple'),
        TRACK_X - 8,
        SLOW_Y + BAR_H / 2,
        fontSizes.xs,
        colors.textMuted,
        'end',
      ),
    );

    const boxFrame = el('rect', {
      x: BOX_X,
      y: BOX_TOP,
      width: BOX_W,
      height: BOX_H,
      rx: 4,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    chromeLayer.insertBefore(boxFrame, chromeLayer.firstChild);

    // 자의 바닥선 — 막대가 0 일 때도 자가 어디까지인지 보이게 한다.
    for (const y of [FAST_Y, SLOW_Y]) {
      chromeLayer.appendChild(
        el('line', {
          x1: TRACK_X,
          x2: TRACK_X + TRACK_W,
          y1: y + BAR_H + 3,
          y2: y + BAR_H + 3,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
    }

    const fastBar = el('rect', {
      x: TRACK_X,
      y: FAST_Y,
      width: 0,
      height: BAR_H,
      rx: 2,
      fill: trackInk[TRACK_FAST] ?? colors.itemDefault,
    });
    const slowBar = el('rect', {
      x: TRACK_X,
      y: SLOW_Y,
      width: 0,
      height: BAR_H,
      rx: 2,
      fill: trackInk[TRACK_SLOW] ?? colors.itemDefault,
    });
    const fastCount = text('', TRACK_X, FAST_Y + BAR_H / 2, fontSizes.xs, colors.text, 'start', fonts.mono);
    const slowCount = text('', TRACK_X, SLOW_Y + BAR_H / 2, fontSizes.xs, colors.text, 'start', fonts.mono);
    trackLayer.append(slowBar, fastBar, slowCount, fastCount);

    const bracket = el('path', {
      d: '',
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 2,
      opacity: 0,
    });
    const bracketLabel = text('', 0, BRACKET_Y + 16, fontSizes.sm, colors.text, 'middle');
    bracketLabel.setAttribute('opacity', '0');
    trackLayer.append(bracket, bracketLabel);

    const answerSum = text(
      '',
      BOX_X + BOX_W / 2,
      BOX_TOP + BOX_H - 16,
      fontSizes.lg,
      colors.text,
      'middle',
    );
    boxLayer.appendChild(answerSum);

    const caption = text('', VIEW_W / 2, CAPTION_Y, fontSizes.sm, colors.text, 'middle');
    chromeLayer.appendChild(caption);

    // ── 갈아 끼워지는 것들.
    let base = 0;
    let rows = 1;
    let rungH = RUNG_MAX_H;
    let unit = UNIT_MAX;
    let slowWidth = 0;
    let fastWidth = 0;
    let taken = 0;
    let sumPlaces = 0;
    let slotH = 20;
    const rungs: Rung[] = [];

    function rungY(row: number): number {
      return LADDER_TOP + row * rungH;
    }

    /** 막대 끝에 붙이는 수. 자 오른쪽에 자리를 비워 두었으므로 늘 바탕 위다. */
    function placeCount(node: SVGTextElement, width: number, value: number, y: number): void {
      node.textContent = String(value);
      node.setAttribute('x', String(TRACK_X + width + 6));
      node.setAttribute('y', String(y + BAR_H / 2));
    }

    function makeRung(row: number, place: number): Rung {
      const group = el('g');
      const y = rungY(row);
      const h = Math.max(MIN_CHIP_H, rungH - 6);
      const chip = el('rect', {
        x: CHIP_X,
        y: y + (rungH - h) / 2,
        width: CHIP_W,
        height: h,
        rx: 3,
        fill: colors.itemComparing,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const label = text(
        `${base}${raised(place)}`,
        CHIP_X + CHIP_W / 2,
        y + rungH / 2,
        fontSizes.sm,
        colors.stateInk,
        'middle',
        fonts.mono,
      );
      const span = text(
        String(place),
        SPAN_RIGHT,
        y + rungH / 2,
        fontSizes.xs,
        colors.textMuted,
        'end',
        fonts.mono,
      );
      const digit = text('', DIGIT_CX, y + rungH / 2, fontSizes.sm, colors.textMuted, 'middle', fonts.mono);
      group.append(span, chip, label, digit);
      ladderLayer.appendChild(group);
      return { group, chip, label, digit, place, taken: false };
    }

    /** 앞 칸을 가라앉힌다 — 지금 손에 든 제곱은 하나뿐이라는 표시다. */
    function settle(rung: Rung | undefined): void {
      if (!rung) return;
      if (rung.taken) return;
      rung.chip.setAttribute('fill', colors.itemDefault);
      rung.label.setAttribute('fill', colors.text);
    }

    function clearScene(): void {
      ladderLayer.textContent = '';
      rungs.length = 0;
      taken = 0;
      sumPlaces = 0;
      fastWidth = 0;
      slowWidth = 0;
      answerSum.textContent = '';
      fastBar.setAttribute('width', '0');
      slowBar.setAttribute('width', '0');
      fastCount.textContent = '';
      slowCount.textContent = '';
      bracket.setAttribute('opacity', '0');
      bracketLabel.setAttribute('opacity', '0');
      // 날아가 앉은 어깨수만 거둔다 — 합계 글자는 자리에 둔다.
      for (const node of [...boxLayer.childNodes]) {
        if (node !== answerSum) boxLayer.removeChild(node);
      }
    }

    async function begin(a: { base: number; exponent: number; slow: number }): Promise<void> {
      clearScene();
      base = a.base;
      rows = bitLength(a.exponent);
      rungH = Math.min(RUNG_MAX_H, LADDER_H / rows);
      slotH = Math.min(20, (BOX_H - 46) / Math.max(1, rows));
      unit = unitFor(a.slow);
      slowWidth = unit * a.slow;
      fastWidth = 0;

      const first = makeRung(0, 1);
      rungs.push(first);
      first.group.setAttribute('opacity', '0');

      // 첫 칸이 왼쪽에서 미끄러져 들어오고, 그 곁에서 단순한 쪽의 자가 제 길이로
      // 뻗는다. 단순한 쪽은 재생하기 전에 이미 아는 값이라 처음부터 다 그린다.
      await tween(MS_BEGIN, (p) => {
        first.group.setAttribute('opacity', String(p));
        first.group.setAttribute('transform', `translate(${(1 - p) * -40} 0)`);
        slowBar.setAttribute('width', String(slowWidth * p));
        placeCount(slowCount, slowWidth * p, Math.round(a.slow * p), SLOW_Y);
      });
    }

    async function square(a: { row: number; place: number; mults: number }): Promise<void> {
      settle(rungs[a.row - 1]);
      const rung = makeRung(a.row, a.place);
      rungs[a.row] = rung;
      const from = rungY(a.row - 1) - rungY(a.row);
      const target = unit * a.mults;

      // 새 칸이 윗칸 자리에서 제 자리로 내려온다 — 앞 값이 제 자신을 만나 생긴
      // 칸이라는 것을 자리가 말한다.
      await tween(MS_SQUARE, (p) => {
        rung.group.setAttribute('opacity', String(p));
        rung.group.setAttribute('transform', `translate(0 ${from * (1 - p)})`);
        const w = fastWidth + (target - fastWidth) * p;
        fastBar.setAttribute('width', String(w));
        placeCount(fastCount, w, a.mults, FAST_Y);
      });
      fastWidth = target;
    }

    async function take(a: { row: number; place: number; mults: number }): Promise<void> {
      const rung = rungs[a.row];
      if (rung) {
        rung.taken = true;
        rung.digit.textContent = '1';
        rung.digit.setAttribute('fill', colors.text);
        rung.chip.setAttribute('fill', colors.itemPivot);
        rung.label.setAttribute('fill', colors.stateInk);
      }
      sumPlaces += a.place;
      const slot = taken;
      taken += 1;

      const flyer = text(
        `× ${base}${raised(a.place)}`,
        CHIP_X + CHIP_W / 2,
        rungY(a.row) + rungH / 2,
        fontSizes.sm,
        colors.accent,
        'middle',
        fonts.mono,
      );
      boxLayer.insertBefore(flyer, answerSum);

      const fromX = CHIP_X + CHIP_W / 2;
      const fromY = rungY(a.row) + rungH / 2;
      const toX = BOX_X + BOX_W / 2;
      const toY = BOX_TOP + 14 + slot * slotH;
      const target = unit * a.mults;

      // 어깨수가 사다리에서 답 상자로 날아간다. 답의 어깨수는 그만큼 자란다.
      await tween(MS_TAKE, (p) => {
        flyer.setAttribute('x', String(fromX + (toX - fromX) * p));
        flyer.setAttribute('y', String(fromY + (toY - fromY) * p));
        const w = fastWidth + (target - fastWidth) * p;
        fastBar.setAttribute('width', String(w));
        placeCount(fastCount, w, a.mults, FAST_Y);
      });
      fastWidth = target;
      answerSum.textContent = `${base}${raised(sumPlaces)}`;
    }

    async function skip(a: { row: number; place: number; mults: number }): Promise<void> {
      const rung = rungs[a.row];
      if (!rung) return;
      rung.digit.textContent = '0';
      rung.digit.setAttribute('fill', colors.textMuted);
      rung.label.setAttribute('fill', colors.textMuted);

      // 칸이 왼쪽으로 물러나 남는다 — 답으로 가지 않은 자리다.
      await tween(MS_SKIP, (p) => {
        rung.chip.setAttribute('fill', colors.itemDefault);
        rung.group.setAttribute('transform', `translate(${-10 * p} 0)`);
        rung.group.setAttribute('opacity', String(1 - 0.42 * p));
      });
    }

    async function verdict(a: { fast: number; slow: number; saved: number }): Promise<void> {
      const from = TRACK_X + unit * a.fast;
      const to = TRACK_X + unit * a.slow;
      bracketLabel.textContent = tr('label.saved', 'saved {saved}', { saved: a.saved });
      bracketLabel.setAttribute('x', String((from + to) / 2));

      // 두 자의 차이에 괄호를 씌운다. 그 벌어짐이 이 화면이 말하려는 수다.
      await tween(MS_VERDICT, (p) => {
        const end = from + (to - from) * p;
        bracket.setAttribute(
          'd',
          `M ${from} ${BRACKET_Y - 5} L ${from} ${BRACKET_Y} L ${end} ${BRACKET_Y} L ${end} ${BRACKET_Y - 5}`,
        );
        bracket.setAttribute('opacity', String(p));
        bracketLabel.setAttribute('opacity', String(p));
      });
    }

    function setCaption(value: string): void {
      caption.textContent = value;
    }

    function reset(): void {
      clearScene();
      caption.textContent = '';
    }

    // ── 마운트 즉시 한 칸을 세워 둔다. 러너가 곧 begin 을 보내지만 그 전에도 빈
    //    캔버스가 보이는 일이 없어야 한다.
    const seed = readScene(params.initialData);
    base = seed.base;
    rows = bitLength(seed.exponent);
    rungH = Math.min(RUNG_MAX_H, LADDER_H / rows);
    slotH = Math.min(20, (BOX_H - 46) / Math.max(1, rows));
    unit = unitFor(seed.exponent - 1);
    rungs.push(makeRung(0, 1));

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거둔 뒤 기다리던 것을 깨운다 — 안 깨우면 emit 이 영영
        // 돌아오지 않아 알고리즘과 SVG 가 통째로 붙들린다. 짜임의 정본은
        // `S-piece` 에 있으나 애니메이션을 기다리는 완제품도 조건이 같다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      begin,
      square,
      take,
      skip,
      verdict,
      setCaption,
      reset,
    };
  },
};
