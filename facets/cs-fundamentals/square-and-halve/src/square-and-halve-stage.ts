/**
 * square-and-halve stage — 접혀 내려가는 줄들과 그 아래의 이진 자리표.
 *
 * ── 형태가 질문에서 나온 자리
 *
 * 칸 하나의 **가로 길이가 곧 그 칸이 덮는 지수 폭**이다. 처음 줄은 폭 1 짜리 칸
 * 열셋이고, 접을 때마다 칸 수는 반이 되며 칸 하나의 폭은 두 배가 된다. 그래서
 * 줄 전체의 길이는 남은 지수에 정확히 비례한다.
 *
 * **접힌 줄은 지워지지 않고 그 자리에 남는다.** 줄 하나가 늘어난 것이 곧 제곱
 * 한 번이므로, 다 끝나 멎은 그림에서 줄을 세면 제곱 횟수가 나오고 자리표의 칩을
 * 세면 답곱 횟수가 나온다. 둘을 더한 여섯이 이 조각이 자랑하는 수다. 옮기기 전
 * 화면은 접을 때마다 앞 줄을 지워 **그 수가 완주 화면 어디에도 없었다** — 캡션이
 * 말로만 하고 있었다 (프로토콜 4 절 7 번·10 번).
 *
 * ── 채움과 테두리를 갈라 둔다
 *
 * 취한 자리와 건너뛴 자리를 같은 모양으로 그리면 읽기가 뒤집힌다. 그래서 어휘를
 * 먼저 가른다 (프로토콜 4 절 23 번·29 번).
 *   - **채움은 값의 형편** — 줄에 서 있다(바탕색) / 답으로 앉았다(칩).
 *   - **테두리는 자리의 표식** — 답으로 보내 **비운 자리**는 칩과 같은 색의 점선
 *     테만 남고, 자리표에서 **아무것도 오지 않은 자리**는 테두리 색 점선으로 남는다.
 * 한 축에 값을 셋 이상 싣지 않으므로 "떠났다" 가 "비었다" 를 덮지 않는다.
 *
 * 그래서 완주 화면에 셋이 함께 선다 — 줄에 남은 빈 테(여기서 하나가 나갔다),
 * 자리표의 칩(그 값이 답에 곱해졌다), 빈 자리와 0(여기서는 아무것도 나가지 않았다).
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 껍데기(`root`) 말고는 걸음마다 통째로 다시 지으므로
 * 정적 그리기가 매번 명시로 써야 할 **재건 밖 요소가 없다** (프로토콜 4 절 18 번).
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 칩도 새 줄도 이미 끝 자리에
 * 서 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다. 그 출발
 * 자리는 장면이 말하는 줄 번호·칸 수에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * 가로는 러너가 PIECE_CANVAS_W 로 주므로 어디에도 적지 않고 그 폭을 채운다.
 * 세로는 자리표의 자리 수가 정하므로 정적 그리기가 매번 다시 잰다 (S-view,
 * 프로토콜 4 절 16 번).
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다. 화면 문자는
 * 전부 `params.t` 로 만든다 (C10). 칸에 적힌 값과 이진 숫자는 수 표식이라 문안이
 * 아니다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  bitsOf,
  enteringCountOf,
  multipliesOf,
  naiveOf,
  productOf,
  slotCountOf,
  squaringsOf,
  takenOf,
  totalOf,
  unitsAt,
  type SquareAndHalveScene,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

/** 세로 배분. 내용이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const ROWS_TOP = 14;
const ROW_H = 36;
const ROW_GAP = 12;
const STRIP_GAP = 24;
const STRIP_H = 38;
const DIGIT_H = 20;
const PRODUCT_H = 26;
const CAPTION_H = 38;
const BOTTOM = 10;

/** 칸 사이의 틈. 둘이 하나로 붙는 순간이 보이게 하는 최소 폭이다. */
const INSET = 2;
/** 좌우로 남길 최소 여백. 칸 크기는 이 폭에서 역산한다 (S-piece 그 폭을 채운다). */
const SIDE_MIN = 10;
/** 칸 하나가 커질 수 있는 상한. 지수가 작을 때 그림이 포스터가 되지 않게 한다. */
const UNIT_MAX = 46;

/** 빈 자리를 말하는 점선. 떠난 자리와 아직 안 온 자리가 같은 자다. */
const DASH = '4 4';

/**
 * 걸음마다의 애니메이션 길이.
 *
 * 걸음 벽시계는 애니메이션 + stepMs 이고, 가장 얇은 걸음이 800ms 아래로
 * 떨어지면 캡션을 읽을 틈이 사라진다 (S-piece). stepMs 는 800 이므로 **모든
 * 걸음에 실제 운동이 하나씩 있어야** 바닥선에 붙지 않는다. 줄을 세우는 첫
 * 걸음이 정지 화면이면 정확히 800 이 되므로 거기에도 MS_BEGIN 을 둔다.
 *
 * 가장 얇은 걸음은 skip 으로 340 + 800 = 1140ms 다. 옮기기 전과 같은 값이다.
 */
const MS_BEGIN = 380;
const MS_TAKE = 420;
const MS_SKIP = 340;
const MS_FOLD = 520;
const MS_DONE = 320;

/** 선언된 캔버스 높이가 기대는 줄 수. 정적 그리기가 장면에서 다시 잰다. */
const DEFAULT_ROWS = 4;

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function heightFor(rows: number): number {
  const rowsH = rows * ROW_H + Math.max(0, rows - 1) * ROW_GAP;
  return ROWS_TOP + rowsH + STRIP_GAP + STRIP_H + DIGIT_H + PRODUCT_H + CAPTION_H + BOTTOM;
}

/** 3¹³ 처럼 어깨에 올린 수. 수식 표기이므로 표식이다 — 키를 만들지 않는다 (C10). */
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join('');
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

/** 글자 폭의 어림. 한글·가나·한자는 한 칸을 다 쓰고 나머지는 그 절반쯤 쓴다. */
function widthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    em += wide ? 1 : 0.55;
  }
  return em;
}

/** 캡션을 두 줄 안에 담는다. 열 언어 중 가장 긴 것이 넘치지 않게 하는 자다. */
function wrapTwo(text: string, maxEm: number): string[] {
  if (widthEm(text) <= maxEm) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (widthEm(next) > maxEm && line !== '') {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    } else {
      line = next;
    }
  }
  if (lines.length < 2 && line !== '') lines.push(line);
  // 띄어쓰기가 드문 글은 낱말로 갈리지 않으므로 글자로 자른다.
  if (lines.length === 1 && widthEm(lines[0] ?? '') > maxEm) {
    const chars = [...text];
    let head = '';
    let idx = 0;
    while (idx < chars.length && widthEm(head + (chars[idx] ?? '')) <= maxEm) {
      head += chars[idx];
      idx += 1;
    }
    return [head, chars.slice(idx).join('')];
  }
  return lines;
}

type Box = { x: number; y: number; w: number; h: number };

/** 이번 장면이 세운 칸 하나의 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type CellEls = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement | null };

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const squareAndHalveStageView: CanvasView = {
  canvas: { height: heightFor(DEFAULT_ROWS) },

  // container 는 계약상 받지만 쓰지 않는다. 러너가 붙여 준 캔버스 안에만 그린다 —
  // 컨테이너를 비우면 그 캔버스가 떨어져 나간다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SquareAndHalveScene> {
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    // 한 번만 세우는 껍데기. 안에 담기는 것은 걸음마다 통째로 다시 짓는다.
    const root = el('g');
    svg.appendChild(root);

    // ── 기하. 장면의 지수가 정하므로 좌표는 장면에 담지 않는다 (S-piece).
    let slots = DEFAULT_ROWS;
    let stripUnits = 1;
    let unit = 1;
    let originX = 0;
    let stripY = 0;
    let digitY = 0;
    let productY = 0;
    let captionY = 0;

    function layout(scene: SquareAndHalveScene): void {
      slots = slotCountOf(scene);
      // 자리표의 전체 폭. 8+4+2+1 처럼 자릿값을 다 더한 만큼이다.
      stripUnits = Math.pow(2, slots) - 1;
      unit = Math.max(4, Math.min(UNIT_MAX, Math.floor((W - SIDE_MIN * 2) / stripUnits)));
      originX = Math.round((W - stripUnits * unit) / 2);
      stripY = ROWS_TOP + slots * ROW_H + (slots - 1) * ROW_GAP + STRIP_GAP;
      digitY = stripY + STRIP_H + 15;
      productY = stripY + STRIP_H + DIGIT_H + 18;
      const height = heightFor(slots);
      captionY = height - BOTTOM - 20;
      // init 이 사라졌으므로 캔버스 세로도 정적 그리기가 매번 정한다 (프로토콜 16 번).
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    }

    function rowY(index: number): number {
      return ROWS_TOP + index * (ROW_H + ROW_GAP);
    }

    function slotOf(place: number): { x: number; w: number } {
      return {
        x: originX + (stripUnits - (2 * place - 1)) * unit,
        w: place * unit,
      };
    }

    function cellBox(index: number, units: number, rowIdx: number): Box {
      return {
        x: originX + index * units * unit + INSET,
        y: rowY(rowIdx),
        w: Math.max(2, units * unit - INSET * 2),
        h: ROW_H,
      };
    }

    function chipBox(place: number): Box {
      const slot = slotOf(place);
      return {
        x: slot.x + INSET,
        y: stripY,
        w: Math.max(2, slot.w - INSET * 2),
        h: STRIP_H,
      };
    }

    /** 칸 폭에서 역산한 글자 크기. 그림이 정하는 값이라 토큰의 대상이 아니다 (S-view). */
    function labelSize(text: string, boxW: number): number {
      const fit = Math.floor((boxW - 6) / Math.max(1, text.length * 0.62));
      return Math.max(9, Math.min(15, fit));
    }

    function placeLabel(label: SVGTextElement, text: string, box: Box): void {
      label.textContent = text;
      label.setAttribute('x', String(box.x + box.w / 2));
      label.setAttribute('y', String(box.y + box.h / 2 + 5));
      label.setAttribute('font-size', String(labelSize(text, box.w)));
    }

    // ── 이번 장면이 세운 DOM 손잡이.
    /** 줄마다의 칸들. 떠난 자리도 제자리에 있으므로 칸 번호가 그대로 자리 번호다. */
    let rowEls: CellEls[][] = [];
    /** 자리표에 앉은 칩들. `takenOf` 의 차례와 같다. */
    let chipEls: CellEls[] = [];
    /** 자리표 밑의 이진 숫자들. 자리 번호 순서다. */
    let digitEls: SVGTextElement[] = [];

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로 다시
    // 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미 새로
    // 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고, 운동은
    // 프레임마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
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
          // 부드럽게 서고 부드럽게 멈춘다.
          draw(raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2);
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

    /** 줄에 서 있는 칸. 채움이 "값이 여기 있다" 를 말한다. */
    function drawCell(box: Box, value: number): CellEls {
      const g = el('g');
      const rect = el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 3,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const label = el('text', {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: colors.text,
      });
      placeLabel(label, String(value), box);
      g.append(rect, label);
      root.appendChild(g);
      return { g, rect, label };
    }

    /**
     * 답으로 보내 **비운 자리.** 칩과 같은 색의 점선 테만 남는다.
     *
     * 지우지 않고 남기는 까닭은 줄의 길이가 그때의 지수이기 때문이다 — 빈 테의 폭을
     * 다 더하면 처음 지수가 된다. 여기서 하나가 나갔다는 사실 자체가 정보다.
     */
    function drawGap(box: Box): CellEls {
      const g = el('g');
      const rect = el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 3,
        fill: 'none',
        stroke: colors.itemSorted,
        'stroke-width': 1,
        'stroke-dasharray': DASH,
      });
      g.appendChild(rect);
      root.appendChild(g);
      return { g, rect, label: null };
    }

    /** 자리표의 빈 자리. 아무것도 오지 않은 자리라 테두리 색 점선이다. */
    function drawSlot(place: number): void {
      const box = chipBox(place);
      root.appendChild(
        el('rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 3,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': DASH,
        }),
      );
    }

    /** 자리표에 앉은 칩. 채움이 "이 값이 답에 곱해졌다" 를 말한다. */
    function drawChip(place: number, value: number): CellEls {
      const box = chipBox(place);
      const g = el('g');
      const rect = el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 3,
        fill: colors.itemSorted,
        stroke: colors.itemSorted,
        'stroke-width': 1,
      });
      const label = el('text', {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: colors.textInverse,
      });
      placeLabel(label, String(value), box);
      g.append(rect, label);
      root.appendChild(g);
      return { g, rect, label };
    }

    /** 자리표 밑의 이진 숫자 하나. 수 표기이므로 표식이다 (C10). */
    function drawDigit(place: number, bit: number): SVGTextElement {
      const slot = slotOf(place);
      const node = el('text', {
        x: slot.x + slot.w / 2,
        y: digitY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: bit === 1 ? colors.text : colors.textMuted,
      });
      node.textContent = bit === 1 ? '1' : '0';
      root.appendChild(node);
      return node;
    }

    /**
     * 답으로 보낸 값들의 곱셈식.
     *
     * 곱하는 값도 그 결과도 자리표에 앉은 칩에서 나온다 — 옛 화면은 값을 payload 로
     * 받아 쌓고 결과도 payload 로 받아 **같은 물음에 답이 둘**이었다.
     */
    function drawProduct(scene: SquareAndHalveScene): void {
      const factors = takenOf(scene).map((taken) => taken.factor);
      const node = el('text', {
        x: W / 2,
        y: productY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      if (factors.length > 0) {
        const chain = factors.join(' × ');
        const head = scene.finished ? `${scene.base}${superscript(scene.exponent)} = ` : '';
        node.textContent =
          factors.length === 1 && !scene.finished
            ? `${head}${chain}`
            : `${head}${chain} = ${productOf(scene)}`;
      }
      root.appendChild(node);
    }

    function captionText(scene: SquareAndHalveScene): string {
      const step = scene.step;
      if (step === null) return '';
      const decided = scene.places.length - 1;
      const here = scene.rows[decided];
      const last = scene.rows[scene.rows.length - 1];
      switch (step.kind) {
        case 'begin':
          return tr(
            'caption.begin',
            'A row of {exponent} cells, each one {base}. Multiplied one at a time, that is {naive} multiplications.',
            { exponent: enteringCountOf(scene, 0), base: scene.base, naive: naiveOf(scene) },
          );
        case 'take':
          if (here === undefined) return '';
          return tr(
            'caption.take',
            'The count {count} is odd, so one cell has no partner. It goes into the answer: {factor}.',
            { count: enteringCountOf(scene, decided), factor: here.value },
          );
        case 'skip':
          if (here === undefined) return '';
          return tr(
            'caption.skip',
            'The count {count} is even — every cell has a partner. Nothing goes into the answer.',
            { count: enteringCountOf(scene, decided) },
          );
        case 'fold':
          if (last === undefined) return '';
          return tr(
            'caption.fold',
            'Fold in half. Each pair meets and becomes one cell worth {value}, and the row now holds {count}.',
            { value: last.value, count: last.count },
          );
        case 'done':
          return tr(
            'caption.done',
            '{total} multiplications instead of {naive} — {squarings} squarings and {multiplies} products. The digits {bits} say which squares were taken.',
            {
              total: totalOf(scene),
              naive: naiveOf(scene),
              squarings: squaringsOf(scene),
              multiplies: multipliesOf(scene),
              bits: bitsOf(scene).join(''),
            },
          );
      }
    }

    function drawCaption(scene: SquareAndHalveScene): void {
      const lines = wrapTwo(captionText(scene), (W - 28) / 12);
      const single = lines.length === 1;
      const first = el('text', {
        x: W / 2,
        y: single ? captionY + 8 : captionY,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      first.textContent = lines[0] ?? '';
      const second = el('text', {
        x: W / 2,
        y: captionY + 15,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      second.textContent = single ? '' : (lines[1] ?? '');
      root.append(first, second);
    }

    function rewind(): void {
      root.textContent = '';
      rowEls = [];
      chipEls = [];
      digitEls = [];
    }

    function drawStatic(scene: SquareAndHalveScene): void {
      layout(scene);

      // 자리표의 자리들. 답이 내려앉을 자를 처음부터 세워 둔다.
      for (let i = 0; i < slots; i += 1) drawSlot(unitsAt(slots - 1 - i));

      // 줄들. 접힌 줄도 지워지지 않고 제자리에 남는다 — 줄의 수가 곧 제곱 횟수다.
      scene.rows.forEach((row, r) => {
        const units = unitsAt(r);
        const entering = enteringCountOf(scene, r);
        const cells: CellEls[] = [];
        for (let i = 0; i < entering; i += 1) {
          const box = cellBox(i, units, r);
          // 떠난 칸은 늘 그 줄의 끝 칸이다.
          cells.push(i < row.count ? drawCell(box, row.value) : drawGap(box));
        }
        rowEls.push(cells);
      });

      // 답으로 앉은 칩들과 자리마다의 이진 숫자.
      for (const taken of takenOf(scene)) chipEls.push(drawChip(taken.place, taken.factor));
      scene.places.forEach((place, r) => {
        digitEls.push(drawDigit(unitsAt(r), place === 'take' ? 1 : 0));
      });

      drawProduct(scene);
      drawCaption(scene);
    }

    // ── 방금 달라진 것만 흐르게 한다. 출발 자리는 전부 장면에서 셈한다.

    /** 줄이 왼쪽 위에서 차례로 미끄러져 들어와 선다. */
    function enterRow(mine: number): Promise<void> {
      const cells = rowEls[0] ?? [];
      if (cells.length === 0) return Promise.resolve();
      return tween(MS_BEGIN, mine, (p) => {
        for (let i = 0; i < cells.length; i += 1) {
          const cell = cells[i];
          if (cell === undefined) continue;
          // 앞 칸부터 차례로 — 줄이 한 번에 나타나지 않고 깔린다.
          const local = Math.min(1, Math.max(0, (p * (cells.length + 3) - i) / 3));
          cell.g.setAttribute('transform', `translate(${-20 * (1 - local)} ${-14 * (1 - local)})`);
          cell.g.setAttribute('opacity', String(0.25 + 0.75 * local));
        }
      });
    }

    /**
     * 짝 없이 남은 한 칸이 제 폭과 꼭 맞는 자리로 내려앉는다.
     *
     * 칩은 이미 자리표에 서 있으므로 **떠나온 자리로 도로 물려** 놓고 시작한다.
     * 그 자리는 장면이 말한다 — 떠난 칸은 그 줄의 끝 칸이고 그 번호가 `row.count` 다.
     * 화면을 되읽거나 `prev` 를 들추지 않는다 (S-scene).
     */
    function payCell(scene: SquareAndHalveScene, mine: number): Promise<void> {
      const r = scene.places.length - 1;
      const row = scene.rows[r];
      const chip = chipEls[chipEls.length - 1];
      const digit = digitEls[digitEls.length - 1];
      if (row === undefined || chip === undefined) return Promise.resolve();
      const from = cellBox(row.count, unitsAt(r), r);
      const to = chipBox(unitsAt(r));
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      const digitFrom = { x: from.x + from.w / 2, y: from.y + ROW_H / 2 + 5 };
      const digitTo = { x: to.x + to.w / 2, y: digitY };
      return tween(MS_TAKE, mine, (p) => {
        // 끝에서는 보간값이 아니라 상수를 그대로 쓴다 — `dx * 0` 은 `-0` 이 된다.
        if (p >= 1) chip.g.removeAttribute('transform');
        else chip.g.setAttribute('transform', `translate(${dx * (1 - p)} ${dy * (1 - p)})`);
        chip.rect.setAttribute('height', String(lerp(ROW_H, STRIP_H, p)));
        if (chip.label !== null) {
          chip.label.setAttribute('y', String(to.y + lerp(ROW_H, STRIP_H, p) / 2 + 5));
        }
        if (digit === undefined) return;
        digit.setAttribute('x', String(lerp(digitFrom.x, digitTo.x, p)));
        digit.setAttribute('y', String(lerp(digitFrom.y, digitTo.y, p)));
      });
    }

    /** 짝수라 남는 칸이 없다. 0 하나가 줄 끝에서 제 자리로 떨어질 뿐이다. */
    function dropZero(scene: SquareAndHalveScene, mine: number): Promise<void> {
      const r = scene.places.length - 1;
      const row = scene.rows[r];
      const digit = digitEls[digitEls.length - 1];
      if (row === undefined || digit === undefined) return Promise.resolve();
      const slot = slotOf(unitsAt(r));
      const fromX = originX + row.count * unitsAt(r) * unit;
      const fromY = rowY(r) + ROW_H / 2 + 5;
      const toX = slot.x + slot.w / 2;
      return tween(MS_SKIP, mine, (p) => {
        digit.setAttribute('x', String(lerp(fromX, toX, p)));
        digit.setAttribute('y', String(lerp(fromY, digitY, p)));
      });
    }

    /**
     * 반으로 접는다.
     *
     * 새 줄의 칸 하나는 앞 줄의 짝 하나에서 나온다. 그래서 새 칸은 **제 짝 둘을
     * 덮은 채로** 떠올랐다가 한 줄 아래로 내려앉는다 — 짝의 폭을 합친 것이 곧 새
     * 칸의 폭이라 가로는 움직일 것이 없다. 두 칸이 만나는 그 자리가 제곱이다.
     * 페이드가 아니라 실제로 자리를 옮긴다 (S-piece).
     */
    function foldDown(scene: SquareAndHalveScene, mine: number): Promise<void> {
      const r = scene.rows.length - 1;
      const cells = rowEls[r];
      if (r <= 0 || cells === undefined || cells.length === 0) return Promise.resolve();
      const drop = rowY(r) - rowY(r - 1);
      return tween(MS_FOLD, mine, (p) => {
        for (const cell of cells) {
          if (p >= 1) cell.g.removeAttribute('transform');
          else cell.g.setAttribute('transform', `translate(0 ${-drop * (1 - p)})`);
        }
      });
    }

    /** 내려앉은 칩들이 한 번 들썩인다 — 저것들을 다 곱한 것이 답이라는 뜻. */
    function tally(mine: number): Promise<void> {
      const chips = [...chipEls];
      if (chips.length === 0) return Promise.resolve();
      return tween(MS_DONE, mine, (p) => {
        // 양 끝에서는 보간값이 아니라 상수를 쓴다. `Math.sin(Math.PI)` 는 0 이 아니다.
        if (p <= 0 || p >= 1) {
          for (const chip of chips) chip.g.removeAttribute('transform');
          return;
        }
        const lift = -6 * Math.sin(Math.PI * p);
        for (const chip of chips) chip.g.setAttribute('transform', `translate(0 ${lift})`);
      });
    }

    function flow(scene: SquareAndHalveScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'begin':
          return enterRow(mine);
        case 'take':
          return payCell(scene, mine);
        case 'skip':
          return dropZero(scene, mine);
        case 'fold':
          return foldDown(scene, mine);
        case 'done':
          return tally(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(`opacity` · `transform` · 늘어난 `height`)이 한꺼번에 사라져, 흐른
     * 화면과 곧바로 세운 화면이 갈리지 않는다 (프로토콜 4 절).
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 장면이 말하는 줄 번호와
     * 칸 수에서 셈한다 (S-scene).
     */
    async function render(
      next: SquareAndHalveScene,
      _prev: SquareAndHalveScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        // 걸어 둔 프레임을 먼저 거두고,
        if (canAnimate) for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 프레임이 취소되면 그 tick 이 아예 안 불려 resolve
        // 가 지나가지 않는다. 이것이 없으면 unmount 된 뒤에도 알고리즘이
        // await ctx.emit 에 매달린 채 붙들린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        root.remove();
      },
    };
  },
};
