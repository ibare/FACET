/**
 * 가수와 지수 — 서른두 비트가 셋으로 갈리는 그림.
 *
 * ── 형태가 어디서 나왔나
 *
 * 동사는 **갈린다** 이다. 그래서 화면의 뼈대는 한 줄로 붙어 있던 비트가 두
 * 자리에서 끊기고 세 토막이 서로 밀려나는 운동이다. 색은 갈리는 순간에 들어온다 —
 * 셋이 서로 다른 것이 되었다는 표시이지 상태 표시가 아니다.
 *
 * 읽은 값은 재는 자리에 남긴다 (S-piece) — 각 토막이 읽은 값은 옆의 계기가
 * 아니라 그 토막 **바로 밑**에 선다. 자리를 옮기는 것은 마지막 조립 한 번뿐이고,
 * 그때 셋이 한자리로 모이는 것이 곧 "셋이 하나의 수를 이룬다" 는 주장이다.
 *
 * 숨은 1 은 줄 위에서 보인다. 가수 토막 앞의 빈자리로 점선 칸이 미끄러져 들어오고,
 * 그와 동시에 밑의 십진값과 이진 표기가 함께 바뀐다. 점선인 것은 그 칸이 저장된
 * 비트가 아니기 때문이다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 준다. 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const W = PIECE_CANVAS_W;
const H = 214;

// 칸 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece "그 폭을 채운다").
const SIDE_MIN = 24;
const CELL_MAX_W = 20;
const CELL_H = 24;
const GROUP_GAP = 26;

const SRC_Y = 28;
const STRIP_Y = 44;
const BRACKET_Y = 78;
const NAME_Y = 93;
const READ_Y = 122;
const NOTE_Y = 136;
const FORMULA_Y = 166;
const CAPTION_Y = 190;
const CAPTION_LINE = 15;
const SUP_RAISE = 9;
const SLOT_GAP = 10;

const FADE_MS = 220;
const CUT_MS = 180;
const SPLIT_MS = 460;
const POP_MS = 260;
const NOTE_MS = 240;
const SWAP_MS = 280;
const SLIDE_MS = 340;
const TRAVEL_MS = 520;
const RULE_MS = 420;

// 도형에 새겨진 기호 — 번역 대상이 아니다 (C10 "표식이냐 문안이냐").
const MUL = '×';
const EQ = '=';
/** 밑. 이진 부동소수점이라 언제나 2 다. */
const RADIX = '2';
const SUB_TWO = '₂';

/** 온폭 글자 — 캡션을 접을 때 폭을 두 배로 센다. */
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힣豈-﫿＀-｠]/;

type Scene = {
  signLen: number;
  expLen: number;
  manLen: number;
  total: number;
};

/**
 * `initialData` 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불리는
 * 유일한 경로다 (S-piece). 걸음마다 오는 payload 는 projector 가 좁혀 넘긴다.
 */
function readScene(initialData: unknown): Scene {
  const d =
    typeof initialData === 'object' && initialData !== null
      ? (initialData as Record<string, unknown>)
      : {};
  const count = (key: string, fallback: number): number => {
    const v = d[key];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.trunc(v) : fallback;
  };
  const signLen = count('signBits', 1);
  const expLen = count('exponentBits', 8);
  const manLen = count('mantissaBits', 23);
  return { signLen, expLen, manLen, total: signLen + expLen + manLen };
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 고정폭 글자의 대략 폭. 읽는 값과 식은 전부 숫자·기호라 이 어림이 맞는다. */
function monoWidth(s: string, size: number): number {
  return s.length * size * 0.6;
}

function looseWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? size : size * 0.55;
  return w;
}

/** 캡션을 두 줄까지 접는다. 열 언어가 같은 폭에 들어오지 않으므로 필요하다. */
function wrapCaption(line: string, budget: number, size: number): [string, string] {
  if (looseWidth(line, size) <= budget) return [line, ''];
  const words = line.split(' ');
  let head = '';
  let tail = '';
  for (const word of words) {
    const next = head === '' ? word : `${head} ${word}`;
    if (tail === '' && looseWidth(next, size) <= budget) {
      head = next;
      continue;
    }
    tail = tail === '' ? word : `${tail} ${word}`;
  }
  if (head === '') {
    // 띄어쓰기가 없는 글은 글자로 자른다.
    let acc = '';
    for (const ch of line) {
      if (looseWidth(acc + ch, size) > budget) break;
      acc += ch;
    }
    return [acc, line.slice(acc.length)];
  }
  return [head, tail];
}

/** 지수는 음수가 될 수 있다. 빼기표는 하이픈이 아니라 U+2212 다. */
function signedNumber(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

type Group = {
  /** 비트 칸이 든 자리. 갈릴 때 이것이 통째로 밀린다. */
  cells: SVGGElement;
  rects: SVGRectElement[];
  digits: SVGTextElement[];
  len: number;
  joinLeft: number;
  splitLeft: number;
  cx: number;
  tile: string;
  ink: string;
  bracket: SVGPathElement;
  name: SVGTextElement;
  count: SVGTextElement;
  result: SVGTextElement;
  note: SVGTextElement;
  /** 읽은 값이 지금 서 있는 가운데. 조립할 때 여기서부터 옮긴다. */
  resultCx: number;
};

export const mantissaAndExponentStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 러너가 캔버스를 컨테이너에 먼저 붙이고 부른다 — container 를 비우면 그것이
    // 떨어져 나간다 (S-view). 비울 것은 캔버스 안쪽이다.
    const svg = params.canvas;
    svg.textContent = '';

    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isDark = params.theme === 'dark';
    // 세 토막을 가르는 색 — n 개 카테고리 식별이므로 categorical 이다 (S-view).
    // 칸 바탕은 테마와 무관하게 고정하고(그 위 잉크는 stateInk), 글자 색만
    // 배경에 맞춰 명도를 고른다.
    const tiles = categorical(3, 'vivid');
    const inks = categorical(3, isDark ? 'vivid' : 'deep');

    const SRC_FS = parseFloat(fontSizes.xl);
    const BIT_FS = parseFloat(fontSizes.xs);
    const READ_FS = parseFloat(fontSizes.lg);
    const SUP_FS = parseFloat(fontSizes.xs);
    const CAP_FS = parseFloat(fontSizes.sm);

    const scene = readScene(params.initialData);
    const cellW = Math.max(
      6,
      Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2 - GROUP_GAP * 2) / scene.total)),
    );
    const joinWidth = cellW * scene.total;
    const splitWidth = joinWidth + GROUP_GAP * 2;
    const joinOrigin = Math.round((W - joinWidth) / 2);
    const splitOrigin = Math.round((W - splitWidth) / 2);

    const joinSign = joinOrigin;
    const joinExp = joinOrigin + scene.signLen * cellW;
    const joinMan = joinOrigin + (scene.signLen + scene.expLen) * cellW;
    const splitSign = splitOrigin;
    const splitExp = splitOrigin + scene.signLen * cellW + GROUP_GAP;
    const splitMan = splitExp + scene.expLen * cellW + GROUP_GAP;

    const digitY = STRIP_Y + CELL_H / 2 + BIT_FS * 0.35;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

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

    /** 처음 상태를 브라우저에 한 번 커밋시킨다. 없으면 전이가 건너뛰어진다. */
    function reflow(): void {
      svg.getBoundingClientRect();
    }

    // ── 켜켜이. 아래에서부터 쌓는다.
    const gMarks = svgEl('g', {});
    const gStrip = svgEl('g', {});
    const gCuts = svgEl('g', {});
    const gRead = svgEl('g', {});
    const gFormula = svgEl('g', {});
    svg.append(gMarks, gStrip, gCuts, gRead, gFormula);

    /** opacity/transform 을 건드리는 것은 전부 여기 담아 두고 되감을 때 한꺼번에 되돌린다. */
    const animated: SVGElement[] = [];
    function track<T extends SVGElement>(node: T): T {
      animated.push(node);
      return node;
    }

    type TextOpts = {
      x: number;
      y: number;
      size: string;
      fill: string;
      anchor?: string;
      mono?: boolean;
      weight?: string;
      content?: string;
    };

    function textNode(o: TextOpts): SVGTextElement {
      const node = svgEl('text', {
        x: o.x,
        y: o.y,
        'font-size': o.size,
        'font-family': o.mono === true ? fonts.mono : fonts.body,
        'text-anchor': o.anchor ?? 'middle',
        fill: o.fill,
      });
      if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
      node.textContent = o.content ?? '';
      return node;
    }

    // ── 머리: 어떤 값을 어떤 꼴로 적었는가.
    // `float32` 는 그 분야에서 원어 그대로 통용되는 표기라 표식이다 (C10).
    const srcTag = track(
      textNode({
        x: splitOrigin,
        y: SRC_Y,
        size: fontSizes.sm,
        fill: c.textMuted,
        anchor: 'start',
        mono: true,
        content: 'float32',
      }),
    );
    const srcValue = track(
      textNode({
        x: W / 2,
        y: SRC_Y,
        size: fontSizes.xl,
        fill: c.text,
        mono: true,
        weight: '600',
      }),
    );
    const srcRule = track(
      svgEl('line', {
        x1: W / 2,
        y1: SRC_Y + 6,
        x2: W / 2,
        y2: SRC_Y + 6,
        stroke: c.accent,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      }),
    );
    svg.append(srcTag, srcValue, srcRule);

    // ── 끊기는 자리. 붙어 있을 때의 경계에 선다.
    const cuts = [joinExp, joinMan].map((x) =>
      track(
        svgEl('line', {
          x1: x,
          y1: STRIP_Y - 7,
          x2: x,
          y2: STRIP_Y + CELL_H + 7,
          stroke: c.text,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      ),
    );
    for (const cut of cuts) gCuts.appendChild(cut);

    function makeGroup(o: {
      index: number;
      len: number;
      joinLeft: number;
      splitLeft: number;
      name: string;
      noteMono: boolean;
    }): Group {
      const width = o.len * cellW;
      const cx = o.splitLeft + width / 2;
      const ink = inks[o.index] ?? c.text;
      const tile = tiles[o.index] ?? c.itemDefault;

      const cells = track(svgEl('g', {}));
      gStrip.appendChild(cells);

      const bracket = track(
        svgEl('path', {
          d: `M ${o.splitLeft} ${BRACKET_Y - 5} L ${o.splitLeft} ${BRACKET_Y} L ${o.splitLeft + width} ${BRACKET_Y} L ${o.splitLeft + width} ${BRACKET_Y - 5}`,
          fill: 'none',
          stroke: ink,
          'stroke-width': 1.5,
        }),
      );
      // 이름과 개수를 가운데에서 좌우로 벌려 놓는다 — 이어 붙이면 어순이 다른
      // 언어에서 깨진다 (C10). 개수는 숫자 표기라 표식이다.
      const name = track(
        textNode({
          x: cx - 4,
          y: NAME_Y,
          size: fontSizes.sm,
          fill: c.text,
          anchor: 'end',
          content: o.name,
        }),
      );
      const count = track(
        textNode({
          x: cx + 4,
          y: NAME_Y,
          size: fontSizes.sm,
          fill: c.textMuted,
          anchor: 'start',
          mono: true,
          content: `· ${o.len}`,
        }),
      );
      const result = track(
        textNode({
          x: cx,
          y: READ_Y,
          size: fontSizes.lg,
          fill: ink,
          mono: true,
          weight: '600',
        }),
      );
      const note = track(
        textNode({
          x: cx,
          y: NOTE_Y,
          size: fontSizes.xs,
          fill: c.textMuted,
          mono: o.noteMono,
        }),
      );
      gMarks.append(bracket, name, count);
      gRead.append(result, note);

      return {
        cells,
        rects: [],
        digits: [],
        len: o.len,
        joinLeft: o.joinLeft,
        splitLeft: o.splitLeft,
        cx,
        tile,
        ink,
        bracket,
        name,
        count,
        result,
        note,
        resultCx: cx,
      };
    }

    const groups: Group[] = [
      makeGroup({
        index: 0,
        len: scene.signLen,
        joinLeft: joinSign,
        splitLeft: splitSign,
        name: t('label.sign', 'sign'),
        noteMono: false,
      }),
      makeGroup({
        index: 1,
        len: scene.expLen,
        joinLeft: joinExp,
        splitLeft: splitExp,
        name: t('label.exponent', 'exponent'),
        noteMono: false,
      }),
      makeGroup({
        index: 2,
        len: scene.manLen,
        joinLeft: joinMan,
        splitLeft: splitMan,
        name: t('label.mantissa', 'mantissa'),
        noteMono: true,
      }),
    ];
    const [signG, expG, manG] = groups as [Group, Group, Group];

    // ── 숨은 1. 저장된 비트가 아니므로 점선이고, 줄 위 가수 토막 바로 앞에 선다.
    const ghostX = Math.max(splitExp + scene.expLen * cellW + 3, splitMan - cellW - 5);
    const ghost = track(svgEl('g', {}));
    ghost.append(
      svgEl('rect', {
        x: ghostX,
        y: STRIP_Y,
        width: cellW,
        height: CELL_H,
        rx: 2,
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 2',
      }),
      textNode({
        x: ghostX + cellW / 2,
        y: digitY,
        size: fontSizes.xs,
        fill: c.text,
        mono: true,
        content: '1',
      }),
    );
    const ghostLabel = track(
      textNode({
        x: ghostX + cellW / 2,
        y: STRIP_Y - 6,
        size: fontSizes.xs,
        fill: c.textMuted,
        content: t('label.hiddenOne', 'hidden 1'),
      }),
    );
    gStrip.append(ghost, ghostLabel);

    // ── 조립된 식. 움직이는 셋 말고 나머지는 여기서 만들어 둔다.
    const mulNode = track(
      textNode({ x: W / 2, y: FORMULA_Y, size: fontSizes.lg, fill: c.text, mono: true, content: MUL }),
    );
    const baseNode = track(
      textNode({ x: W / 2, y: FORMULA_Y, size: fontSizes.lg, fill: c.text, mono: true, content: RADIX }),
    );
    const eqNode = track(
      textNode({ x: W / 2, y: FORMULA_Y, size: fontSizes.lg, fill: c.text, mono: true, content: EQ }),
    );
    const valueNode = track(
      textNode({
        x: W / 2,
        y: FORMULA_Y,
        size: fontSizes.lg,
        fill: c.text,
        mono: true,
        weight: '600',
      }),
    );
    const valueRule = track(
      svgEl('line', {
        x1: W / 2,
        y1: FORMULA_Y + 6,
        x2: W / 2,
        y2: FORMULA_Y + 6,
        stroke: c.accent,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      }),
    );
    gFormula.append(mulNode, baseNode, eqNode, valueNode, valueRule);

    // ── 캡션. 지금 무슨 일이 일어나는지만 말한다.
    const capLine1 = track(
      textNode({ x: W / 2, y: CAPTION_Y, size: fontSizes.sm, fill: c.textMuted }),
    );
    const capLine2 = track(
      textNode({ x: W / 2, y: CAPTION_Y + CAPTION_LINE, size: fontSizes.sm, fill: c.textMuted }),
    );
    svg.append(capLine1, capLine2);

    // ── 움직임.
    function fadeIn(node: SVGElement, ms = FADE_MS): void {
      node.style.transition = `opacity ${ms}ms ease`;
      node.style.opacity = '1';
    }

    function fadeOut(node: SVGElement, ms = FADE_MS): void {
      node.style.transition = `opacity ${ms}ms ease`;
      node.style.opacity = '0';
    }

    async function riseIn(node: SVGElement, from: number, ms: number): Promise<void> {
      node.style.transition = 'none';
      node.style.opacity = '0';
      node.style.transform = `translate(0px, ${from}px)`;
      reflow();
      node.style.transition = `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ms}ms ease`;
      node.style.opacity = '1';
      node.style.transform = 'translate(0px, 0px)';
      await wait(ms);
    }

    function placeReading(g: Group, value: string): void {
      g.result.textContent = value;
      const half = monoWidth(value, READ_FS) / 2;
      const cx = Math.max(6 + half, Math.min(W - 6 - half, g.cx));
      g.resultCx = cx;
      g.result.setAttribute('x', String(cx));
    }

    /** 읽은 값이 다른 값으로 내려앉는다. 129 가 2 가 되는 자리. */
    async function swapResult(g: Group, value: string): Promise<void> {
      const out = Math.round(SWAP_MS * 0.4);
      const back = SWAP_MS - out;
      fadeOut(g.result, out);
      await wait(out);
      placeReading(g, value);
      g.result.style.transition = 'none';
      g.result.style.transform = 'translate(0px, -6px)';
      reflow();
      g.result.style.transition = `transform ${back}ms ease, opacity ${back}ms ease`;
      g.result.style.opacity = '1';
      g.result.style.transform = 'translate(0px, 0px)';
      await wait(back);
    }

    function travel(node: SVGElement, dx: number, dy: number, ms: number): void {
      node.style.transition = `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), font-size ${ms}ms ease`;
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function drawRule(rule: SVGLineElement, cx: number, width: number, y: number): void {
      const half = width / 2 + 2;
      rule.setAttribute('x1', String(cx - half));
      rule.setAttribute('x2', String(cx + half));
      rule.setAttribute('y1', String(y));
      rule.setAttribute('y2', String(y));
      rule.style.transition = 'none';
      rule.style.opacity = '1';
      rule.setAttribute('stroke-dasharray', String(half * 2));
      rule.setAttribute('stroke-dashoffset', String(half * 2));
      reflow();
      rule.style.transition = `stroke-dashoffset ${RULE_MS}ms ease`;
      rule.setAttribute('stroke-dashoffset', '0');
    }

    // ── projector 가 부르는 것들.

    async function layBits(bits: string, value: string): Promise<void> {
      srcValue.textContent = value;
      fadeIn(srcTag);
      fadeIn(srcValue);

      let index = 0;
      for (const g of groups) {
        g.cells.textContent = '';
        g.rects = [];
        g.digits = [];
        for (let k = 0; k < g.len; k += 1) {
          const x = g.joinLeft + k * cellW;
          const rect = svgEl('rect', {
            x,
            y: STRIP_Y,
            width: cellW,
            height: CELL_H,
            rx: 2,
            fill: c.itemDefault,
            stroke: c.border,
            'stroke-width': 1,
          });
          const digit = textNode({
            x: x + cellW / 2,
            y: digitY,
            size: fontSizes.xs,
            fill: c.text,
            mono: true,
            content: bits.charAt(index) === '' ? '0' : bits.charAt(index),
          });
          g.cells.append(rect, digit);
          g.rects.push(rect);
          g.digits.push(digit);
          index += 1;
        }
        g.cells.style.opacity = '1';
      }

      // 한 줄이 자리를 잡는다.
      gStrip.style.transition = 'none';
      gStrip.style.opacity = '0';
      gStrip.style.transform = 'translate(0px, -6px)';
      reflow();
      gStrip.style.transition = `transform ${FADE_MS}ms ease, opacity ${FADE_MS}ms ease`;
      gStrip.style.opacity = '1';
      gStrip.style.transform = 'translate(0px, 0px)';
      await wait(FADE_MS + 60);
    }

    async function split(): Promise<void> {
      // 1. 끊긴다 — 자른 자리가 위에서 내려와 줄을 가른다.
      for (const cut of cuts) {
        cut.style.transition = 'none';
        cut.style.opacity = '0';
        cut.style.transform = 'translate(0px, -14px)';
      }
      reflow();
      for (const cut of cuts) {
        cut.style.transition = `transform ${CUT_MS}ms ease, opacity ${CUT_MS}ms ease`;
        cut.style.opacity = '1';
        cut.style.transform = 'translate(0px, 0px)';
      }
      await wait(CUT_MS + 40);

      // 2. 갈린다 — 세 토막이 서로 밀려난다. 이것이 이 조각의 운동이다.
      for (const g of groups) {
        g.cells.style.transition = `transform ${SPLIT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        g.cells.style.transform = `translate(${g.splitLeft - g.joinLeft}px, 0px)`;
        for (const rect of g.rects) {
          rect.style.transition = `fill ${SPLIT_MS}ms ease`;
          rect.setAttribute('fill', g.tile);
        }
        // 고정 타일 위의 잉크는 테마를 따라 뒤집지 않는다 (design-tokens).
        for (const digit of g.digits) digit.setAttribute('fill', c.stateInk);
      }
      for (const cut of cuts) fadeOut(cut, SPLIT_MS);
      await wait(SPLIT_MS + 40);

      // 3. 갈린 셋이 제 이름을 단다.
      for (const g of groups) {
        fadeIn(g.bracket);
        fadeIn(g.name);
        fadeIn(g.count);
      }
      await wait(FADE_MS);
    }

    async function readSign(sign: string): Promise<void> {
      placeReading(signG, sign);
      await riseIn(signG.result, 7, POP_MS);
    }

    async function readExponent(raw: number): Promise<void> {
      placeReading(expG, signedNumber(raw));
      await riseIn(expG.result, 7, POP_MS);
    }

    async function debias(bias: number, actual: number): Promise<void> {
      // 치우침이 아래에서 올라와 붙는다. 붙은 뒤에도 남아 왜 줄었는지 말한다.
      expG.note.textContent = t('label.bias', 'bias {b}', { b: bias });
      await riseIn(expG.note, 12, NOTE_MS);
      await swapResult(expG, signedNumber(actual));
    }

    async function readMantissa(fractionBits: string, fraction: string): Promise<void> {
      manG.note.textContent = `${fractionBits}${SUB_TWO}`;
      placeReading(manG, fraction);
      fadeIn(manG.note);
      await riseIn(manG.result, 7, POP_MS);
    }

    async function revealHiddenOne(significandBits: string, significand: string): Promise<void> {
      ghost.style.transition = 'none';
      ghost.style.opacity = '0';
      ghost.style.transform = `translate(${-(cellW + 10)}px, 0px)`;
      ghostLabel.style.transition = 'none';
      ghostLabel.style.opacity = '0';
      reflow();
      ghost.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLIDE_MS}ms ease`;
      ghost.style.opacity = '1';
      ghost.style.transform = 'translate(0px, 0px)';
      fadeIn(ghostLabel, SLIDE_MS);
      // 줄 위의 칸과 밑의 두 표기가 한꺼번에 바뀐다 — 같은 하나의 일이다.
      manG.note.textContent = `${significandBits}${SUB_TWO}`;
      await wait(Math.round(SLIDE_MS * 0.6));
      await swapResult(manG, significand);
    }

    async function assemble(value: string): Promise<void> {
      const signText = signG.result.textContent ?? '';
      const sigText = manG.result.textContent ?? '';
      const expText = expG.result.textContent ?? '';

      const wSign = monoWidth(signText, READ_FS);
      const wSig = monoWidth(sigText, READ_FS);
      const wMul = monoWidth(MUL, READ_FS);
      const wBase = monoWidth(RADIX, READ_FS);
      const wSup = monoWidth(expText, SUP_FS);
      const wEq = monoWidth(EQ, READ_FS);
      const wVal = monoWidth(value, READ_FS);
      const total =
        wSign + wSig + SLOT_GAP + wMul + SLOT_GAP + wBase + wSup + SLOT_GAP + wEq + SLOT_GAP + wVal;

      let x = (W - total) / 2;
      const cxSign = x + wSign / 2;
      x += wSign;
      const cxSig = x + wSig / 2;
      x += wSig + SLOT_GAP;
      const cxMul = x + wMul / 2;
      x += wMul + SLOT_GAP;
      const cxBase = x + wBase / 2;
      x += wBase;
      const cxSup = x + wSup / 2;
      x += wSup + SLOT_GAP;
      const cxEq = x + wEq / 2;
      x += wEq + SLOT_GAP;
      const cxVal = x + wVal / 2;

      mulNode.setAttribute('x', String(cxMul));
      baseNode.setAttribute('x', String(cxBase));
      eqNode.setAttribute('x', String(cxEq));
      valueNode.setAttribute('x', String(cxVal));
      valueNode.textContent = value;

      // 읽은 값 셋이 제자리에서 내려와 한 줄을 이룬다. 부호는 왼쪽에서,
      // 가수는 오른쪽에서 모인다.
      travel(signG.result, cxSign - signG.resultCx, FORMULA_Y - READ_Y, TRAVEL_MS);
      travel(manG.result, cxSig - manG.resultCx, FORMULA_Y - READ_Y, TRAVEL_MS);
      travel(expG.result, cxSup - expG.resultCx, FORMULA_Y - SUP_RAISE - READ_Y, TRAVEL_MS);
      // 지수는 가면서 어깨 글자 크기로 줄어든다.
      expG.result.style.fontSize = `${SUP_FS}px`;
      for (const g of groups) fadeOut(g.note);

      await wait(Math.round(TRAVEL_MS * 0.6));
      fadeIn(mulNode);
      fadeIn(baseNode);
      fadeIn(eqNode);
      fadeIn(valueNode);
      await wait(Math.round(TRAVEL_MS * 0.4) + FADE_MS);
    }

    async function settle(): Promise<void> {
      // 위의 수와 아래의 수가 같다는 것을 두 밑줄이 동시에 긋는다.
      drawRule(srcRule, W / 2, monoWidth(srcValue.textContent ?? '', SRC_FS), SRC_Y + 6);
      drawRule(
        valueRule,
        parseFloat(valueNode.getAttribute('x') ?? String(W / 2)),
        monoWidth(valueNode.textContent ?? '', READ_FS),
        FORMULA_Y + 6,
      );
      await wait(RULE_MS + 40);
    }

    function rewind(): void {
      for (const node of animated) {
        node.style.transition = 'none';
        node.style.opacity = '0';
        node.style.transform = 'translate(0px, 0px)';
      }
      for (const g of groups) {
        g.cells.textContent = '';
        g.rects = [];
        g.digits = [];
        g.result.textContent = '';
        g.note.textContent = '';
        g.result.style.fontSize = `${READ_FS}px`;
        g.resultCx = g.cx;
        g.result.setAttribute('x', String(g.cx));
      }
      srcValue.textContent = '';
      valueNode.textContent = '';
      for (const rule of [srcRule, valueRule]) {
        rule.setAttribute('stroke-dashoffset', '0');
        rule.setAttribute('x1', String(W / 2));
        rule.setAttribute('x2', String(W / 2));
      }
      capLine1.textContent = '';
      capLine2.textContent = '';
    }

    function setCaption(line: string): void {
      const [head, tail] = wrapCaption(line, W - 48, CAP_FS);
      capLine1.textContent = head;
      capLine2.textContent = tail;
      capLine1.style.transition = `opacity ${FADE_MS}ms ease`;
      capLine1.style.opacity = '1';
      capLine2.style.transition = `opacity ${FADE_MS}ms ease`;
      capLine2.style.opacity = tail === '' ? '0' : '1';
    }

    // 처음 상태는 되감은 상태와 같다 — 한 곳에서만 정한다.
    rewind();

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
      layBits,
      split,
      readSign,
      readExponent,
      debias,
      readMantissa,
      revealHiddenOne,
      assemble,
      settle,
      rewind,
      setCaption,
    };
  },
};
