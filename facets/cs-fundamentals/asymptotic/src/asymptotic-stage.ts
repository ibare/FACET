/**
 * asymptotic-stage — 같은 길이의 자 둘과, 그것이 몇 낱개로 나뉘는가.
 *
 * ── 형태가 질문에서 나온 자리
 *
 * 묻는 것은 "비가 머무는가 떠나는가" 다. 비는 **몇 번 들어가는가** 이므로, 큰 쪽을
 * 자 하나로 놓고 작은 쪽의 낱개로 **나눈다**. 나뉜 낱개의 수가 곧 비다.
 *
 * 그래서 두 자의 **길이는 같다.** 길이에는 뜻이 없고 나뉜 결에만 뜻이 있다 — 이
 * 전제를 밝히는 자리는 화면이 아니라 `description.ts` 다. 길이를 값에 비례시키면
 * n = 1,024 에서 `n²` 가 1,048,576 이라 선형으로는 담기지 않고, 로그로 누르면 둘 다
 * 직선이 되어 갈린다는 것 자체가 사라진다. **축척을 고르는 대신 축척을 없앤다.**
 *
 * 위 자(다른 반)는 손잡이를 밀수록 둘에서 백둘로 잘게 부서져 빗살이 되고, 아래
 * 자(같은 반)는 **끝까지 둘로만 나뉜다.** 손잡이를 밀어도 안 움직이는 그 수가
 * 이 화면의 주장이다.
 *
 * 아래 기록줄은 지나온 자리를 남긴다. 한 자리만 보면 n = 4 에서 둘 다 2 라 구별되지
 * 않는데, 다섯 자리가 나란히 서면 한 줄은 2 4 10 32 102 이고 다른 줄은 2 2 2 2 2 다.
 * **교차는 한 점이고 등급은 끝까지의 성질**이라는 것이 그 두 줄의 차이다.
 *
 * 조각(`curvesCross`)은 같은 재료를 **저울**로 그려 어디서 뒤집히는지를 보였다.
 * 여기서는 뒤집힘이 아니라 벌어짐이 주제라 저울이 아니라 자다.
 *
 * ── 운동
 *
 * 낱개는 왼쪽부터 **드러난다** (덮개가 물러난다). 자리를 옮길 때는 낱개가 왼쪽부터
 * 덮이고, 기록의 그 칸에 표가 앉는다. 판정에서는 지나온 자리를 잇는 선이 왼쪽에서
 * 오른쪽으로 뻗는다. 페이드가 아니라 자리를 옮긴다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 기록 칸 수가 손잡이에 따라 달라지지
 * 않도록, 칸은 사다리 전부를 처음부터 세워 두고 지나온 것만 채운다.
 *
 * ── 눈금의 사본을 두지 않는다
 *
 * **stage 는 algorithm 을 참조할 수 없다** (원칙 1). 그래서 사다리를 여기 적어 두면
 * 선언 · algorithm · stage 셋이 갈리고 축이 조용히 거짓말을 한다. 사다리는 걸음마다
 * 오는 payload 에서 받고, 낱개의 폭도 그 자리에 셈한다. 갈릴 사본이 없다.
 *
 * 다만 **담을 수 있는 범위**는 그림이 정한다 — 아래 `TILE_CAPACITY` 와
 * `RECORD_CAPACITY` 가 그것이고, 선언이 그 범위를 넘는 손잡이를 고르면
 * `test/asymptotic.test.ts` 가 걸린다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 720;
const VIEW_H = 310;
const PAD_X = 16;

// ── 자 둘. 길이가 같다 — 그것이 이 화면의 전제다.
const BAR_X = 196;
const BAR_W = 456;
const BAR_H = 32;
const ROW_CROSS_Y = 40;
const ROW_SAME_Y = 94;
/** 낱개 수를 적는 자리. 자 오른쪽에 비워 두어 수가 늘 바탕 위에 앉는다. */
const COUNT_X = BAR_X + BAR_W + 10;
/** 낱개 사이의 실틈. 이것이 있어야 빗살로 읽힌다. */
const TILE_GAP = 1;

// ── 기록줄
const DIVIDER_Y = 152;
const REC_LABEL_RIGHT = 104;
const REC_X = 116;
const REC_RIGHT = VIEW_W - PAD_X;
const REC_HEAD_Y = 172;
const REC_N_Y = 194;
const REC_CROSS_Y = 220;
const REC_CROSS_TRAIL_Y = 230;
const REC_SAME_Y = 250;
const REC_SAME_TRAIL_Y = 260;

// ── 캡션 두 줄. 길이에 따라 그림이 밀리지 않게 늘 비워 둔다.
const CAP_Y1 = 282;
const CAP_Y2 = 300;
const CAP_EM = 46;

/**
 * 걸음마다의 운동 길이 (ms).
 *
 * 걸음 벽시계는 **운동 + `stepMs`** 이고, 가장 얇은 걸음이 800ms 아래로 떨어지면
 * 캡션을 읽을 틈이 사라진다. 바닥선을 못박은 것은 `S-piece` 85–87 이라 조각의
 * 잣대이지만 이 배치의 사양이 완제품의 자동 재생도 같은 잣대로 본다.
 *
 * 가장 얇은 걸음은 크기 짚기(`MS_SIZE`)이고 판을 세우는 첫 걸음과 마무리 걸음에도
 * 운동을 둔다 — 정지 걸음이 하나라도 있으면 그 걸음만 바닥선에 붙는다.
 *
 * **셈하지 말고 쟀다.** 실제 stage 를 감싸 걸음 사이를 찍으니 864 · 871 · 995 · 907ms
 * 로 돌았고 가장 얇은 걸음이 **864ms** 였다 (크기 짚기 440 + `stepMs` 420). 정지
 * 걸음은 하나도 없다. 그 실측을 `test/asymptotic.test.ts` 가 커밋된 검사로 잠근다 —
 * 가짜 stage 로 재면 얹히는 애니메이션이 통째로 빠져 재는 뜻이 없어진다.
 */
const MS_BOARD = 460;
const MS_SIZE = 440;
const MS_CROSS = 560;
const MS_SAME = 480;
const MS_VERDICT = 460;
const FRAME_MS = 16;

/**
 * 자 하나가 담을 수 있는 낱개의 수.
 *
 * 짐작이 아니라 기하에서 나온다 — 낱개 하나의 폭이 이 아래로 내려가면 실틈이 사라져
 * 빗살이 아니라 통막대로 보인다. 손잡이가 이 범위를 넘는 값을 고르면 화면이 비를
 * 말하지 못하게 되고, 그 자리를 테스트가 잠근다.
 */
const MIN_TILE_PITCH = 3;
export const TILE_CAPACITY = Math.floor(BAR_W / MIN_TILE_PITCH);

/** 기록줄이 담을 수 있는 칸 수. 칸 하나가 세 자리 수를 담을 최소 폭에서 나온다. */
const MIN_SLOT_W = 64;
export const RECORD_CAPACITY = Math.floor((REC_RIGHT - REC_X) / MIN_SLOT_W);

/** 낱개 하나가 차지하는 가로. 온전한 낱개와 남은 조각을 합쳐 자를 꽉 채운다. */
export function tilePitch(tiles: number, remainder: number): number {
  const total = Math.max(1, tiles + remainder);
  return BAR_W / total;
}

/**
 * **값으로 읽는 수**를 세 자리마다 끊는다.
 *
 * 숫자 표기가 두 층위라서 둔다 — **식 표기에는 구분을 넣지 않고 값 읽기에는 넣는다.**
 * `2n²` 의 `2` 는 식의 계수라 그냥 `2` 이고, 입력 크기 1,024 는 값이라 끊는다. 같은
 * 수라도 어느 층위로 읽히느냐가 다르다. 그래서 이 함수는 **식 표기 상수
 * (`CROSS_FORMULA` · `SAME_FORMULA`)에는 절대 쓰지 않는다.**
 *
 * locale 별 구분자(`1.024` · `١٬٠٢٤`)를 따르지 않고 쉼표로 고정한다 — 손잡이의
 * segment 라벨이 `FacetJson` 에 박힌 고정 문자열이라, 여기만 locale 을 따르면 같은
 * 수가 한 화면에서 두 모양으로 뜬다. 저장소에 수 서식 규약이 아직 없어 **한 화면
 * 안의 일치**를 먼저 지킨다.
 */
export function groupDigits(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(Math.trunc(value)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 두 반은 서로 다른 두 정체성이다 — n 개 카테고리 식별 (S-view 결정 트리 3). */
const TONE = 'vivid' as const;
const INK_CROSS = 0;
const INK_SAME = 1;

/**
 * 자에 새겨지는 비용 식.
 *
 * 수식 표기는 **표식**이라 상수로 둔다 — 열 언어로 옮겨 적어도 글자가 달라지지
 * 않으므로 키를 만들지 않는다 (C10 판정 3). 반의 **이름**은 언어마다 다르니 그쪽만
 * `messages` 에 있다.
 */
const CROSS_FORMULA = 'n² ÷ n log₂n';
const SAME_FORMULA = '2n² ÷ n²';
/** 기록줄의 크기 머리. 수식 기호라 표식이다. */
const SIZE_MARK = 'n';

export type AsymptoticTiling = {
  index: number;
  n: number;
  tiles: number;
  remainder: number;
};

export type AsymptoticStageInstance = ViewInstance & {
  setBoard(sizes: number[]): Promise<void>;
  setSize(a: { index: number; n: number; logBits: number }): Promise<void>;
  tileCross(a: AsymptoticTiling): Promise<void>;
  tileSame(a: AsymptoticTiling): Promise<void>;
  verdict(a: { index: number; gap: number }): Promise<void>;
  setCaption(value: string): void;
  reset(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
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

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

/** 한 글자가 차지하는 폭(em 근사). 한글·가나·한자는 한 칸을 다 쓴다. */
function emWidth(s: string): number {
  let sum = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      (c >= 0x1100 && c <= 0x11ff) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xff60);
    sum += wide ? 1 : 0.52;
  }
  return sum;
}

/** 낱말 경계로 두 줄까지 접는다. 띄어쓰기가 없는 글은 글자로 끊는다. */
function wrapTwo(value: string, budget: number): [string, string] {
  if (emWidth(value) <= budget) return [value, ''];
  const words = value.split(' ');
  if (words.length > 1) {
    let head = '';
    let rest = '';
    for (const word of words) {
      const next = head === '' ? word : `${head} ${word}`;
      if (rest === '' && emWidth(next) <= budget) head = next;
      else rest = rest === '' ? word : `${rest} ${word}`;
    }
    if (head !== '') return [head, rest];
  }
  let head = '';
  let rest = '';
  for (const ch of value) {
    if (rest === '' && emWidth(head + ch) <= budget) head += ch;
    else rest += ch;
  }
  return [head, rest];
}

/** 선언이 준 사다리를 mount 에서 한 번 좁힌다. */
function readSizes(raw: Record<string, unknown> | undefined): number[] {
  const v = raw?.sizes;
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return [];
    out.push(item);
  }
  return out;
}

type Row = {
  y: number;
  ink: string;
  partialInk: string;
  tilesLayer: SVGGElement;
  cover: SVGRectElement;
  count: SVGTextElement;
  trail: SVGLineElement;
  recordY: number;
};

type Slot = {
  marker: SVGRectElement;
  cross: SVGTextElement;
  same: SVGTextElement;
  cx: number;
};

export const asymptoticStageView: CanvasView = {
  canvas: { width: VIEW_W, height: VIEW_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const ink = categorical(2, TONE);
    const crossInk = ink[INK_CROSS] ?? colors.itemComparing;
    const sameInk = ink[INK_SAME] ?? colors.itemDefault;

    // 한 문안이 두 자리(자의 이름표 · 기록줄의 줄 이름)에서 쓰인다. en 원본이
    // 호출부에 리터럴로 한 번 남아 추출기가 본다 (C10).
    const crossName = tr('label.crossClass', 'Different class');
    const sameName = tr('label.sameClass', 'Same class');

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const root = el('g');
    params.canvas.appendChild(root);

    const barLayer = el('g');
    const chromeLayer = el('g');
    const recordLayer = el('g');
    const captionLayer = el('g');
    root.append(barLayer, chromeLayer, recordLayer, captionLayer);

    // ── 걸어 둔 것과 기다리는 것. destroy 에서 일괄로 거둔다.
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
          apply(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          apply(raw);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    /** 자 한 줄을 세운다. 덮개가 낱개를 가리고, 테두리는 덮개 위에 남는다. */
    function makeRow(y: number, tone: string, name: string, formula: string, recordY: number): Row {
      const tilesLayer = el('g');
      const cover = el('rect', {
        x: BAR_X,
        y,
        width: BAR_W,
        height: BAR_H,
        fill: colors.bg,
      });
      const frame = el('rect', {
        x: BAR_X,
        y,
        width: BAR_W,
        height: BAR_H,
        rx: 3,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
      barLayer.append(tilesLayer, cover, frame);

      chromeLayer.append(
        text(name, PAD_X, y + 12, fontSizes.sm, colors.text, 'start'),
        text(formula, PAD_X, y + 26, fontSizes.xs, colors.textMuted, 'start', fonts.mono),
      );
      const count = text('', COUNT_X, y + BAR_H / 2, fontSizes.sm, colors.text, 'start', fonts.mono);
      chromeLayer.appendChild(count);

      const trail = el('line', {
        x1: REC_X,
        y1: recordY,
        x2: REC_X,
        y2: recordY,
        stroke: tone,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        opacity: 0,
      });
      recordLayer.appendChild(trail);

      return {
        y,
        ink: tone,
        partialInk: shiftLightness(tone, 0.16),
        tilesLayer,
        cover,
        count,
        trail,
        recordY,
      };
    }

    const crossRow = makeRow(ROW_CROSS_Y, crossInk, crossName, CROSS_FORMULA, REC_CROSS_TRAIL_Y);
    const sameRow = makeRow(ROW_SAME_Y, sameInk, sameName, SAME_FORMULA, REC_SAME_TRAIL_Y);

    chromeLayer.appendChild(
      el('line', {
        x1: PAD_X,
        y1: DIVIDER_Y,
        x2: VIEW_W - PAD_X,
        y2: DIVIDER_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    chromeLayer.append(
      text(
        tr('label.record', 'Every size walked so far'),
        PAD_X,
        REC_HEAD_Y,
        fontSizes.xs,
        colors.textMuted,
        'start',
      ),
      text(SIZE_MARK, REC_LABEL_RIGHT, REC_N_Y, fontSizes.xs, colors.textMuted, 'end', fonts.mono),
      text(crossName, REC_LABEL_RIGHT, REC_CROSS_Y, fontSizes.xs, colors.textMuted, 'end'),
      text(sameName, REC_LABEL_RIGHT, REC_SAME_Y, fontSizes.xs, colors.textMuted, 'end'),
    );

    const caption1 = text('', VIEW_W / 2, CAP_Y1, fontSizes.sm, colors.text, 'middle');
    const caption2 = text('', VIEW_W / 2, CAP_Y2, fontSizes.sm, colors.text, 'middle');
    captionLayer.append(caption1, caption2);

    // ── 갈아 끼워지는 것들.
    const slots: Slot[] = [];
    const slotLayer = el('g');
    recordLayer.appendChild(slotLayer);

    /** 덮개를 물려 낱개를 왼쪽부터 드러낸다. p = 1 이면 다 드러난 것. */
    function setReveal(row: Row, p: number): void {
      row.cover.setAttribute('x', String(BAR_X + BAR_W * p));
      row.cover.setAttribute('width', String(BAR_W * (1 - p)));
    }

    /** 낱개를 그린다. 온전한 것과 남은 조각을 같은 규칙으로 나눈다. */
    function drawTiles(row: Row, tiles: number, remainder: number): void {
      row.tilesLayer.textContent = '';
      const pitch = tilePitch(tiles, remainder);
      const whole = Math.min(tiles, TILE_CAPACITY);
      for (let i = 0; i < whole; i += 1) {
        row.tilesLayer.appendChild(
          el('rect', {
            x: BAR_X + pitch * i,
            y: row.y,
            width: Math.max(1, pitch - TILE_GAP),
            height: BAR_H,
            fill: row.ink,
          }),
        );
      }
      if (remainder > 0.01) {
        row.tilesLayer.appendChild(
          el('rect', {
            x: BAR_X + pitch * tiles,
            y: row.y,
            width: Math.max(1, pitch * remainder - TILE_GAP),
            height: BAR_H,
            fill: row.partialInk,
          }),
        );
      }
    }

    async function fill(row: Row, a: AsymptoticTiling, ms: number): Promise<void> {
      drawTiles(row, a.tiles, a.remainder);
      row.count.textContent = `× ${groupDigits(a.tiles)}`;
      await tween(ms, (p) => setReveal(row, easeOut(p)));
    }

    function clearRow(row: Row): void {
      row.tilesLayer.textContent = '';
      row.count.textContent = '';
      setReveal(row, 0);
    }

    function clearTrails(): void {
      for (const row of [crossRow, sameRow]) {
        row.trail.setAttribute('x2', String(REC_X));
        row.trail.setAttribute('opacity', '0');
      }
    }

    function clearBoard(): void {
      clearRow(crossRow);
      clearRow(sameRow);
      clearTrails();
      slotLayer.textContent = '';
      slots.length = 0;
    }

    /** 사다리 칸을 세운다. 칸 수는 payload 가 정한다 — 사본을 두지 않는다. */
    function buildSlots(sizes: number[]): void {
      slotLayer.textContent = '';
      slots.length = 0;
      const count = Math.max(1, sizes.length);
      const slotW = (REC_RIGHT - REC_X) / count;
      sizes.forEach((n, i) => {
        const cx = REC_X + slotW * (i + 0.5);
        const marker = el('rect', {
          x: cx - slotW / 2 + 6,
          y: REC_N_Y - 15,
          width: slotW - 12,
          height: 3,
          rx: 1.5,
          fill: colors.accent,
          opacity: 0,
        });
        const cross = text('', cx, REC_CROSS_Y, fontSizes.sm, crossInk, 'middle', fonts.mono);
        const same = text('', cx, REC_SAME_Y, fontSizes.sm, sameInk, 'middle', fonts.mono);
        slotLayer.append(
          marker,
          text(groupDigits(n), cx, REC_N_Y, fontSizes.xs, colors.textMuted, 'middle', fonts.mono),
          cross,
          same,
        );
        slots.push({ marker, cross, same, cx });
      });
    }

    function setCaption(value: string): void {
      const [first, second] = wrapTwo(value, CAP_EM);
      caption1.textContent = first;
      caption2.textContent = second;
    }

    // ── 마운트 즉시 사다리를 세워 둔다. 러너가 곧 board-set 을 보내지만 그 전에도
    //    빈 캔버스가 보이는 일이 없어야 한다.
    buildSlots(readSizes(params.initialData));
    setReveal(crossRow, 0);
    setReveal(sameRow, 0);

    const instance: AsymptoticStageInstance = {
      async setBoard(sizes: number[]): Promise<void> {
        clearBoard();
        buildSlots(sizes);
        // 빈 자 둘이 왼쪽에서 제 길이로 뻗는다. 판을 세우는 걸음에도 운동을 준다.
        await tween(MS_BOARD, (p) => {
          const e = easeOut(p);
          for (const row of [crossRow, sameRow]) {
            row.cover.setAttribute('x', String(BAR_X + BAR_W * e));
            row.cover.setAttribute('width', String(BAR_W * (1 - e)));
          }
        });
        // 자는 아직 비어 있다 — 덮개를 도로 덮어 낱개가 들어올 자리를 남긴다.
        setReveal(crossRow, 0);
        setReveal(sameRow, 0);
      },

      async setSize(a: { index: number; n: number; logBits: number }): Promise<void> {
        for (const slot of slots) slot.marker.setAttribute('opacity', '0');
        const slot = slots[a.index];
        // 앞자리의 낱개가 왼쪽부터 덮이고, 기록의 이번 칸에 표가 앉는다.
        await tween(MS_SIZE, (p) => {
          const e = easeInOut(p);
          for (const row of [crossRow, sameRow]) {
            row.cover.setAttribute('x', String(BAR_X));
            row.cover.setAttribute('width', String(BAR_W * e));
          }
          slot?.marker.setAttribute('opacity', String(e));
        });
        clearRow(crossRow);
        clearRow(sameRow);
        slot?.marker.setAttribute('opacity', '1');
      },

      async tileCross(a: AsymptoticTiling): Promise<void> {
        await fill(crossRow, a, MS_CROSS);
        const slot = slots[a.index];
        if (slot) slot.cross.textContent = groupDigits(a.tiles);
      },

      async tileSame(a: AsymptoticTiling): Promise<void> {
        await fill(sameRow, a, MS_SAME);
        const slot = slots[a.index];
        if (slot) slot.same.textContent = groupDigits(a.tiles);
      },

      async verdict(a: { index: number; gap: number }): Promise<void> {
        const end = slots[a.index]?.cx ?? REC_X;
        // 지나온 자리를 잇는 선이 두 줄 아래로 각각 뻗는다. 한 줄은 수가 자라고
        // 한 줄은 그대로인 것이 그 길이 위에서 나란히 읽힌다.
        await tween(MS_VERDICT, (p) => {
          const e = easeOut(p);
          for (const row of [crossRow, sameRow]) {
            row.trail.setAttribute('opacity', String(e));
            row.trail.setAttribute('x2', String(REC_X + (end - REC_X) * e));
          }
        });
      },

      setCaption,

      reset(): void {
        clearBoard();
        caption1.textContent = '';
        caption2.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거둔 뒤 기다리던 것을 깨운다 — 안 깨우면 emit 이 영영
        // 돌아오지 않아 알고리즘과 SVG 가 통째로 붙들린다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };

    return instance;
  },
};
