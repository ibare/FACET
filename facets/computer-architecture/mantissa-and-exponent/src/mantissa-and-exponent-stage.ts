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
 *
 * ── 장면 방식으로 옮기며 고친 것
 *
 * 옛 그림은 읽은 값 셋이 식으로 내려갈 때 토막 밑의 **자취를 함께 걷어냈다**
 * (`for (const g of groups) fadeOut(g.note)`). 그래서 다 끝난 화면에는 "지수를
 * 129 로 읽고 치우침 127 을 뺐다" 도 "가수를 1.1001 로 읽었다" 도 남지 않았고,
 * 마지막 캡션이 "세 토막이 수 하나를 이룬다" 고 말할 때 **그 셋이 무엇을 읽어
 * 나온 것인지가 화면에 없었다** (프로토콜 함정 7 · 8).
 *
 * 그래서 두 가지를 바꿨다.
 *
 * - **자취는 남는다.** 토막 밑의 작은 글은 조립 뒤에도 서 있다. 부호·지수·가수가
 *   각자 제 자리에 제 읽은 바를 남기고, 식은 그 셋이 모인 자리다.
 * - **치우침은 두 값을 함께 보인다.** 옛 그림은 큰 글씨가 129 에서 2 로 갈아
 *   끼워지고 밑에 `bias 127` 만 남아 **빼기 전의 수가 사라졌다.** 지금은
 *   `129 − bias 127` 이 남아 세 수가 한 화면에 선다.
 *
 * ── 그리는 규약
 *
 * 걸음마다 여섯 층을 통째로 비우고 장면에서 다시 세운다. 고정 자리에 남는 요소를
 * 하나도 두지 않으므로 "재건 밖 요소" 가 없다 (S-scene · 프로토콜 함정 18).
 * 운동은 rAF 보간뿐이고 CSS `transition` 은 쓰지 않는다 — 되짚기는
 * `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게
 * 한다 (S-scene MUST NOT).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { partsOf, phaseRank, type MantissaAndExponentScene } from './scene.js';
import type { Float32Parts } from './algorithm.js';

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
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힣豈-﫿＀-｠]/;

/** 토막의 차례. 이름이 아니라 자리라서 숫자로 둔다. */
const SIGN = 0;
const EXP = 1;
const MAN = 2;

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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 물러났다 붙는 결. 갈리는 운동에도 값이 내려앉는 운동에도 같은 것을 쓴다. */
function ease(p: number): number {
  return 1 - (1 - p) ** 3;
}

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}

/** 보간이 남기는 끝자리를 자른다. `-0` 은 자바스크립트가 `'0'` 으로 적는다. */
function num(v: number): string {
  return String(Number(v.toFixed(2)));
}

/** 그림이 캔버스에서 역산한 자리. 장면은 좌표를 모른다 (S-piece). */
type Geom = {
  cellW: number;
  lens: [number, number, number];
  joinLefts: [number, number, number];
  splitLefts: [number, number, number];
  cxs: [number, number, number];
  digitY: number;
  ghostX: number;
};

/** 조립된 식이 서는 자리. 글자 폭에서 한 번에 셈한다. */
type Formula = {
  cxSign: number;
  cxSig: number;
  cxMul: number;
  cxBase: number;
  cxSup: number;
  cxEq: number;
  cxVal: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  parts: Float32Parts;
  formula: Formula;
  /** 국면의 차례. -1 이면 아직 아무 걸음도 밟지 않았다. */
  rank: number;
  /** 비트 줄 전체. `lay-bits` 에서 이것이 통째로 내려앉는다. */
  strip: SVGGElement | null;
  srcTag: SVGTextElement | null;
  srcValue: SVGTextElement | null;
  /** 토막마다의 비트 칸 묶음. `split` 에서 이것이 밀려난다. */
  cellGroups: (SVGGElement | null)[];
  rects: SVGRectElement[][];
  digits: SVGTextElement[][];
  marks: SVGElement[];
  results: (SVGTextElement | null)[];
  notes: (SVGTextElement | null)[];
  ghost: SVGGElement | null;
  ghostLabel: SVGTextElement | null;
  formulaNodes: SVGTextElement[];
  rules: SVGLineElement[];
  ruleLens: number[];
};

export const mantissaAndExponentStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MantissaAndExponentScene> {
    // 러너가 캔버스를 컨테이너에 먼저 붙이고 부른다 — container 를 비우면 그것이
    // 떨어져 나간다 (S-view). 비울 것은 캔버스 안쪽이다.
    const svg = params.canvas;
    svg.textContent = '';

    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isDark = params.theme === 'dark';
    // 세 토막을 가르는 색 — n 개 카테고리 식별이므로 categorical 이다 (S-view).
    // 칸 바탕은 테마와 무관하게 고정하고(그 위 잉크는 stateInk), 글자 색만
    // 배경에 맞춰 명도를 고른다. 셋은 바탕이 정하는 수라 걸음마다 갈리지 않는다.
    const tiles = categorical(3, 'vivid');
    const inks = categorical(3, isDark ? 'vivid' : 'deep');

    const SRC_FS = parseFloat(fontSizes.xl);
    const BIT_FS = parseFloat(fontSizes.xs);
    const READ_FS = parseFloat(fontSizes.lg);
    const SUP_FS = parseFloat(fontSizes.xs);
    const CAP_FS = parseFloat(fontSizes.sm);

    const names: [string, string, string] = [
      t('label.sign', 'sign'),
      t('label.exponent', 'exponent'),
      t('label.mantissa', 'mantissa'),
    ];

    // ── 켜켜이. 아래에서부터 쌓는다. 층 자신은 속성을 얻지 않는다 — 걸음마다
    //    자식만 비우고 다시 세운다 (프로토콜 함정 18).
    const gStrip = svgEl('g', {});
    const gCuts = svgEl('g', {});
    const gMarks = svgEl('g', {});
    const gRead = svgEl('g', {});
    const gFormula = svgEl('g', {});
    const gCaption = svgEl('g', {});
    svg.append(gStrip, gCuts, gMarks, gRead, gFormula, gCaption);
    const layers = [gStrip, gCuts, gMarks, gRead, gFormula, gCaption];

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 unmount 가 끼어들면 남은
     * 프레임이 이미 떨어져 나간 화면을 덮을 수 있으므로, 프레임마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
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
          // 세대가 바뀌었으면 그리지 않고 물러난다.
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

    function geomOf(parts: Float32Parts): Geom {
      const cellW = Math.max(
        6,
        Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2 - GROUP_GAP * 2) / parts.total)),
      );
      const joinWidth = cellW * parts.total;
      const splitWidth = joinWidth + GROUP_GAP * 2;
      const joinOrigin = Math.round((W - joinWidth) / 2);
      const splitOrigin = Math.round((W - splitWidth) / 2);

      const lens: [number, number, number] = [parts.signLen, parts.expLen, parts.manLen];
      const joinLefts: [number, number, number] = [
        joinOrigin,
        joinOrigin + parts.signLen * cellW,
        joinOrigin + (parts.signLen + parts.expLen) * cellW,
      ];
      const splitSign = splitOrigin;
      const splitExp = splitOrigin + parts.signLen * cellW + GROUP_GAP;
      const splitMan = splitExp + parts.expLen * cellW + GROUP_GAP;
      const splitLefts: [number, number, number] = [splitSign, splitExp, splitMan];
      const cxs: [number, number, number] = [
        splitSign + (lens[SIGN] * cellW) / 2,
        splitExp + (lens[EXP] * cellW) / 2,
        splitMan + (lens[MAN] * cellW) / 2,
      ];

      return {
        cellW,
        lens,
        joinLefts,
        splitLefts,
        cxs,
        digitY: STRIP_Y + CELL_H / 2 + BIT_FS * 0.35,
        ghostX: Math.max(splitExp + parts.expLen * cellW + 3, splitMan - cellW - 5),
      };
    }

    /**
     * 읽은 값이 제 토막 밑에 앉는 가운데. 캔버스 밖으로 나가지 않게 당긴다.
     *
     * 옛 그림은 이 값을 `Group.resultCx` 에 적어 두고 조립 운동의 출발값으로
     * 삼았다 — DOM 의 거울이다. 여기서는 글자와 자리에서 그때마다 셈한다.
     */
    function readCx(text: string, cx: number): number {
      const half = monoWidth(text, READ_FS) / 2;
      return Math.max(6 + half, Math.min(W - 6 - half, cx));
    }

    /** 식이 서는 자리. 옛 그림은 이것을 화면의 글자를 도로 읽어 쟀다 (함정 25). */
    function formulaOf(parts: Float32Parts): Formula {
      const signText = parts.sign;
      const sigText = parts.significand;
      const expText = signedNumber(parts.actual);

      const wSign = monoWidth(signText, READ_FS);
      const wSig = monoWidth(sigText, READ_FS);
      const wMul = monoWidth(MUL, READ_FS);
      const wBase = monoWidth(RADIX, READ_FS);
      const wSup = monoWidth(expText, SUP_FS);
      const wEq = monoWidth(EQ, READ_FS);
      const wVal = monoWidth(parts.value, READ_FS);
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

      return { cxSign, cxSig, cxMul, cxBase, cxSup, cxEq, cxVal };
    }

    /** 토막이 읽은 값. 국면이 정한다 — 화면을 도로 읽지 않는다. */
    function readingOf(parts: Float32Parts, rank: number, which: number): string {
      if (which === SIGN) return rank >= phaseRank('sign') ? parts.sign : '';
      if (which === EXP) {
        if (rank >= phaseRank('debiased')) return signedNumber(parts.actual);
        return rank >= phaseRank('exponent') ? signedNumber(parts.raw) : '';
      }
      if (rank >= phaseRank('hidden')) return parts.significand;
      return rank >= phaseRank('fraction') ? parts.fraction : '';
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    type TextOpts = {
      x: number;
      y: number;
      size: number;
      fill: string;
      anchor?: string;
      mono?: boolean;
      weight?: string;
      content?: string;
    };

    function textNode(o: TextOpts): SVGTextElement {
      const node = svgEl('text', {
        x: num(o.x),
        y: num(o.y),
        'font-size': o.size,
        'font-family': o.mono === true ? fonts.mono : fonts.body,
        'text-anchor': o.anchor ?? 'middle',
        fill: o.fill,
      });
      if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
      node.textContent = o.content ?? '';
      return node;
    }

    function clearAll(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /**
     * 가수 밑의 이진 표기. 숨은 1 이 붙은 뒤에는 그 한 글자를 점선 칸과 같은
     * 색으로 둔다 — 저장된 비트가 아니라는 말을 글에서도 한다.
     */
    function fillMantissaNote(node: SVGTextElement, text: string, ghosted: boolean): void {
      node.textContent = '';
      if (ghosted) {
        const lead = svgEl('tspan', { fill: c.ghostOutline });
        lead.textContent = text.slice(0, 1);
        node.appendChild(lead);
        node.appendChild(document.createTextNode(`${text.slice(1)}${SUB_TWO}`));
        return;
      }
      node.textContent = `${text}${SUB_TWO}`;
    }

    function drawStatic(scene: MantissaAndExponentScene): Drawn {
      clearAll();

      const parts = partsOf(scene);
      const geom = geomOf(parts);
      const formula = formulaOf(parts);
      const rank = scene.phase === null ? -1 : phaseRank(scene.phase);

      const d: Drawn = {
        geom,
        parts,
        formula,
        rank,
        strip: null,
        srcTag: null,
        srcValue: null,
        cellGroups: [null, null, null],
        rects: [[], [], []],
        digits: [[], [], []],
        marks: [],
        results: [null, null, null],
        notes: [null, null, null],
        ghost: null,
        ghostLabel: null,
        formulaNodes: [],
        rules: [],
        ruleLens: [],
      };

      // 아무 걸음도 밟지 않았으면 캔버스가 비어 있다. 캡션도 없다.
      if (rank < 0) return d;

      const split = rank >= phaseRank('split');

      // ── 머리: 어떤 값을 어떤 꼴로 적었는가.
      // `float32` 는 그 분야에서 원어 그대로 통용되는 표기라 표식이다 (C10).
      d.srcTag = textNode({
        x: geom.splitLefts[SIGN],
        y: SRC_Y,
        size: parseFloat(fontSizes.sm),
        fill: c.textMuted,
        anchor: 'start',
        mono: true,
        content: 'float32',
      });
      d.srcValue = textNode({
        x: W / 2,
        y: SRC_Y,
        size: SRC_FS,
        fill: c.text,
        mono: true,
        weight: '600',
        content: parts.value,
      });
      gStrip.append(d.srcTag, d.srcValue);

      // ── 비트 줄. 갈리기 전에는 붙어 있고 갈린 뒤에는 세 토막이 벌어져 선다.
      const strip = svgEl('g', {});
      d.strip = strip;
      gStrip.appendChild(strip);

      let index = 0;
      for (let i = 0; i < 3; i += 1) {
        const cells = svgEl('g', {});
        const left = split ? geom.splitLefts[i] : geom.joinLefts[i];
        for (let k = 0; k < geom.lens[i]; k += 1) {
          const x = left + k * geom.cellW;
          const rect = svgEl('rect', {
            x: num(x),
            y: STRIP_Y,
            width: geom.cellW,
            height: CELL_H,
            rx: 2,
            fill: split ? (tiles[i] ?? c.itemDefault) : c.itemDefault,
            stroke: c.border,
            'stroke-width': 1,
          });
          const digit = textNode({
            x: x + geom.cellW / 2,
            y: geom.digitY,
            size: BIT_FS,
            fill: split ? c.stateInk : c.text,
            mono: true,
            content: parts.bits.charAt(index) === '' ? '0' : parts.bits.charAt(index),
          });
          cells.append(rect, digit);
          d.rects[i].push(rect);
          d.digits[i].push(digit);
          index += 1;
        }
        strip.appendChild(cells);
        d.cellGroups[i] = cells;
      }

      // ── 숨은 1. 저장된 비트가 아니므로 점선이고, 줄 위 가수 토막 바로 앞에 선다.
      if (rank >= phaseRank('hidden')) {
        const ghost = svgEl('g', {});
        ghost.append(
          svgEl('rect', {
            x: num(geom.ghostX),
            y: STRIP_Y,
            width: geom.cellW,
            height: CELL_H,
            rx: 2,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1.5,
            'stroke-dasharray': '3 2',
          }),
          textNode({
            x: geom.ghostX + geom.cellW / 2,
            y: geom.digitY,
            size: BIT_FS,
            fill: c.text,
            mono: true,
            content: '1',
          }),
        );
        d.ghostLabel = textNode({
          x: geom.ghostX + geom.cellW / 2,
          y: STRIP_Y - 6,
          size: BIT_FS,
          fill: c.textMuted,
          content: t('label.hiddenOne', 'hidden 1'),
        });
        strip.append(ghost, d.ghostLabel);
        d.ghost = ghost;
      }

      // ── 갈린 셋이 제 이름을 단다.
      if (split) {
        for (let i = 0; i < 3; i += 1) {
          const width = geom.lens[i] * geom.cellW;
          const left = geom.splitLefts[i];
          const ink = inks[i] ?? c.text;
          const bracket = svgEl('path', {
            d: `M ${num(left)} ${BRACKET_Y - 5} L ${num(left)} ${BRACKET_Y} L ${num(left + width)} ${BRACKET_Y} L ${num(left + width)} ${BRACKET_Y - 5}`,
            fill: 'none',
            stroke: ink,
            'stroke-width': 1.5,
          });
          // 이름과 개수를 가운데에서 좌우로 벌려 놓는다 — 이어 붙이면 어순이 다른
          // 언어에서 깨진다 (C10). 개수는 숫자 표기라 표식이다.
          const name = textNode({
            x: geom.cxs[i] - 4,
            y: NAME_Y,
            size: parseFloat(fontSizes.sm),
            fill: c.text,
            anchor: 'end',
            content: names[i],
          });
          const count = textNode({
            x: geom.cxs[i] + 4,
            y: NAME_Y,
            size: parseFloat(fontSizes.sm),
            fill: c.textMuted,
            anchor: 'start',
            mono: true,
            content: `· ${geom.lens[i]}`,
          });
          gMarks.append(bracket, name, count);
          d.marks.push(bracket, name, count);
        }
      }

      // ── 읽은 값과 그 밑의 자취. 조립한 뒤에는 값만 식으로 내려가고 자취는 남는다.
      const assembled = rank >= phaseRank('assembled');
      for (let i = 0; i < 3; i += 1) {
        const text = readingOf(parts, rank, i);
        if (text === '') continue;
        const ink = inks[i] ?? c.text;
        const sup = assembled && i === EXP;
        const node = textNode({
          x: assembled
            ? i === SIGN
              ? formula.cxSign
              : i === EXP
                ? formula.cxSup
                : formula.cxSig
            : readCx(text, geom.cxs[i]),
          y: assembled ? (sup ? FORMULA_Y - SUP_RAISE : FORMULA_Y) : READ_Y,
          size: sup ? SUP_FS : READ_FS,
          fill: ink,
          mono: true,
          weight: '600',
          content: text,
        });
        gRead.appendChild(node);
        d.results[i] = node;
      }

      if (rank >= phaseRank('debiased')) {
        const note = textNode({
          x: geom.cxs[EXP],
          y: NOTE_Y,
          size: BIT_FS,
          fill: c.textMuted,
          content: t('label.bias', '{raw} − bias {b}', {
            raw: parts.raw,
            b: parts.bias,
          }),
        });
        gRead.appendChild(note);
        d.notes[EXP] = note;
      }

      if (rank >= phaseRank('fraction')) {
        const hidden = rank >= phaseRank('hidden');
        const note = textNode({
          x: geom.cxs[MAN],
          y: NOTE_Y,
          size: BIT_FS,
          fill: c.textMuted,
          mono: true,
        });
        fillMantissaNote(
          note,
          hidden ? parts.significandBits : parts.fractionBits,
          hidden,
        );
        gRead.appendChild(note);
        d.notes[MAN] = note;
      }

      // ── 조립된 식. 움직이는 셋 말고 나머지가 여기서 선다.
      if (assembled) {
        for (const [x, content] of [
          [formula.cxMul, MUL],
          [formula.cxBase, RADIX],
          [formula.cxEq, EQ],
        ] as [number, string][]) {
          const node = textNode({
            x,
            y: FORMULA_Y,
            size: READ_FS,
            fill: c.text,
            mono: true,
            content,
          });
          gFormula.appendChild(node);
          d.formulaNodes.push(node);
        }
        const valueNode = textNode({
          x: formula.cxVal,
          y: FORMULA_Y,
          size: READ_FS,
          fill: c.text,
          mono: true,
          weight: '600',
          content: parts.value,
        });
        gFormula.appendChild(valueNode);
        d.formulaNodes.push(valueNode);
      }

      // ── 위의 수와 아래의 수가 같다는 것을 두 밑줄이 긋는다.
      if (rank >= phaseRank('settled')) {
        for (const [cx, width, y] of [
          [W / 2, monoWidth(parts.value, SRC_FS), SRC_Y + 6],
          [formula.cxVal, monoWidth(parts.value, READ_FS), FORMULA_Y + 6],
        ] as [number, number, number][]) {
          const half = width / 2 + 2;
          const rule = svgEl('line', {
            x1: num(cx - half),
            y1: y,
            x2: num(cx + half),
            y2: y,
            stroke: c.accent,
            'stroke-width': 2,
            'stroke-linecap': 'round',
          });
          gFormula.appendChild(rule);
          d.rules.push(rule);
          d.ruleLens.push(half * 2);
        }
      }

      // ── 캡션. 지금 무슨 일이 일어나는지만 말한다. 국면이 이미 가른다 (C10).
      const line = captionFor(scene, parts);
      if (line !== '') {
        const [head, tail] = wrapCaption(line, W - 48, CAP_FS);
        gCaption.appendChild(
          textNode({ x: W / 2, y: CAPTION_Y, size: CAP_FS, fill: c.textMuted, content: head }),
        );
        if (tail !== '') {
          gCaption.appendChild(
            textNode({
              x: W / 2,
              y: CAPTION_Y + CAPTION_LINE,
              size: CAP_FS,
              fill: c.textMuted,
              content: tail,
            }),
          );
        }
      }

      return d;
    }

    function captionFor(scene: MantissaAndExponentScene, parts: Float32Parts): string {
      switch (scene.phase) {
        case 'laid':
          return t('caption.layBits', 'One number, written as {n} bits.', { n: parts.total });
        case 'split':
          return t('caption.split', 'It splits into three: {a} · {b} · {c}', {
            a: parts.signLen,
            b: parts.expLen,
            c: parts.manLen,
          });
        case 'sign':
          return t('caption.sign', 'The first bit carries the sign: {s}', { s: parts.sign });
        case 'exponent':
          return t('caption.exponent', 'The next {n} bits read as {raw}.', {
            n: parts.expLen,
            raw: parts.raw,
          });
        case 'debiased':
          return t('caption.debias', 'Take away the bias {bias}. The real exponent is {actual}.', {
            bias: parts.bias,
            actual: parts.actual,
          });
        case 'fraction':
          return t('caption.mantissa', 'The last {n} bits are the fraction: {frac}', {
            n: parts.manLen,
            frac: parts.fractionBits,
          });
        case 'hidden':
          return t('caption.hiddenOne', 'A leading 1 is never stored. It is always there: {s}', {
            s: parts.significandBits,
          });
        case 'assembled':
          return t('caption.assemble', 'Three parts, one number: {value}', { value: parts.value });
        case 'settled':
          return t('caption.done', 'The same number it started as: {value}', {
            value: parts.value,
          });
        default:
          return '';
      }
    }

    // ── 운동 ──────────────────────────────────────────────────────────────

    function setOpacity(node: SVGElement | null, v: number): void {
      if (node === null) return;
      if (v >= 1) node.removeAttribute('opacity');
      else node.setAttribute('opacity', num(v));
    }

    function shift(node: SVGElement | null, dx: number, dy: number): void {
      if (node === null) return;
      if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${num(dx)} ${num(dy)})`);
    }

    /** 아직 못 온 만큼을 뒤로 물린다 — 정적 그리기가 이미 끝 자리를 세워 두었다. */
    function rise(node: SVGElement | null, from: number, e: number): void {
      shift(node, 0, from * (1 - e));
      setOpacity(node, e);
    }

    function flowLaid(d: Drawn, mine: number): Promise<void> {
      return tween(FADE_MS + 60, mine, (p) => {
        const e = ease(p);
        rise(d.strip, -6, e);
        setOpacity(d.srcTag, e);
        setOpacity(d.srcValue, e);
      });
    }

    /** 길이 `ms` 짜리 마디가 길이 `total` 짜리 시계 안에서 얼마나 왔나. */
    function seg(p: number, total: number, ms: number): number {
      return clamp01((total * p) / ms);
    }

    async function flowSplit(d: Drawn, mine: number): Promise<void> {
      // 정적 그리기는 이미 갈린 끝 자리를 세워 두었다. 아직 못 온 만큼을 여기서
      // 곧바로 뒤로 물린다 — `tween` 이 첫 프레임을 동기로 그리므로 깜빡이지 않는다.
      for (let i = 0; i < 3; i += 1) {
        shift(d.cellGroups[i], d.geom.joinLefts[i] - d.geom.splitLefts[i], 0);
        for (const rect of d.rects[i]) rect.setAttribute('fill', c.itemDefault);
        for (const digit of d.digits[i]) digit.setAttribute('fill', c.text);
      }
      for (const mark of d.marks) mark.setAttribute('opacity', '0');

      // 1. 끊긴다 — 자른 자리가 위에서 내려와 줄을 가른다. 갈린 뒤에는 없는
      //    것이므로 정적 그리기가 짓지 않고 여기서만 짓는다 (함정 17).
      const cuts = [d.geom.joinLefts[EXP], d.geom.joinLefts[MAN]].map((x) =>
        svgEl('line', {
          x1: num(x),
          y1: STRIP_Y - 7,
          x2: num(x),
          y2: STRIP_Y + CELL_H + 7,
          stroke: c.text,
          'stroke-width': 2,
          'stroke-linecap': 'round',
          opacity: '0',
        }),
      );
      for (const cut of cuts) gCuts.appendChild(cut);

      await tween(CUT_MS + 40, mine, (p) => {
        const e = ease(seg(p, CUT_MS + 40, CUT_MS));
        for (const cut of cuts) rise(cut, -14, e);
      });
      if (!alive(mine)) return;

      // 2. 갈린다 — 세 토막이 서로 밀려난다. 이것이 이 조각의 운동이다.
      await tween(SPLIT_MS + 40, mine, (p) => {
        const e = ease(seg(p, SPLIT_MS + 40, SPLIT_MS));
        for (let i = 0; i < 3; i += 1) {
          shift(d.cellGroups[i], (d.geom.joinLefts[i] - d.geom.splitLefts[i]) * (1 - e), 0);
          // 색은 갈리는 순간에 들어온다. 상태 표시가 아니라 갈림의 표시다.
          const tinted = e >= 0.35;
          for (const rect of d.rects[i]) {
            rect.setAttribute('fill', tinted ? (tiles[i] ?? c.itemDefault) : c.itemDefault);
          }
          for (const digit of d.digits[i]) {
            digit.setAttribute('fill', tinted ? c.stateInk : c.text);
          }
        }
        for (const cut of cuts) setOpacity(cut, 1 - e);
      });
      if (!alive(mine)) return;

      // 3. 갈린 셋이 제 이름을 단다.
      await tween(FADE_MS, mine, (p) => {
        for (const mark of d.marks) setOpacity(mark, ease(p));
      });
    }

    function flowRead(d: Drawn, which: number, mine: number): Promise<void> {
      return tween(POP_MS, mine, (p) => rise(d.results[which], 7, ease(p)));
    }

    /**
     * 읽은 값이 다른 값으로 내려앉는다. 129 가 2 가 되는 자리.
     *
     * 갈아 끼우기 전의 글자는 **국면이 말한다** — `prev` 에서 꺼내지 않는다
     * (S-scene). 129 도 0.5625 도 같은 `readFloat32Parts` 에서 나온 수다.
     */
    function swapFrame(
      node: SVGTextElement | null,
      was: string,
      becomes: string,
      cx: number,
      p: number,
    ): void {
      if (node === null) return;
      const out = SWAP_MS * 0.4;
      const ms = SWAP_MS * p;
      if (ms < out) {
        node.textContent = was;
        node.setAttribute('x', num(readCx(was, cx)));
        shift(node, 0, 0);
        setOpacity(node, 1 - clamp01(ms / out));
        return;
      }
      node.textContent = becomes;
      node.setAttribute('x', num(readCx(becomes, cx)));
      rise(node, -6, ease(clamp01((ms - out) / (SWAP_MS - out))));
    }

    async function flowDebias(d: Drawn, mine: number): Promise<void> {
      // 치우침을 빼기 전의 수를 먼저 세운다. **국면이 말하는 값**이지 `prev` 에서
      // 꺼낸 것이 아니다 (S-scene).
      const was = signedNumber(d.parts.raw);
      const node = d.results[EXP];
      if (node !== null) {
        node.textContent = was;
        node.setAttribute('x', num(readCx(was, d.geom.cxs[EXP])));
      }
      // 치우침이 아래에서 올라와 붙는다. 붙은 뒤에도 남아 왜 줄었는지 말한다.
      await tween(NOTE_MS, mine, (p) => rise(d.notes[EXP], 12, ease(p)));
      if (!alive(mine)) return;
      await tween(SWAP_MS, mine, (p) =>
        swapFrame(node, was, signedNumber(d.parts.actual), d.geom.cxs[EXP], p),
      );
    }

    function flowFraction(d: Drawn, mine: number): Promise<void> {
      return tween(POP_MS, mine, (p) => {
        const e = ease(p);
        rise(d.results[MAN], 7, e);
        setOpacity(d.notes[MAN], e);
      });
    }

    async function flowHidden(d: Drawn, mine: number): Promise<void> {
      // 숨은 1 이 붙기 전의 십진값을 먼저 세운다 — 국면이 말하는 값이다.
      const was = d.parts.fraction;
      const node = d.results[MAN];
      if (node !== null) {
        node.textContent = was;
        node.setAttribute('x', num(readCx(was, d.geom.cxs[MAN])));
      }

      // 점선 칸이 가수 토막 앞의 빈자리로 미끄러져 들어온다.
      const lead = Math.round(SLIDE_MS * 0.6);
      const back = d.geom.cellW + 10;
      const slideTo = (e: number): void => {
        shift(d.ghost, -back * (1 - e), 0);
        setOpacity(d.ghost, e);
        setOpacity(d.ghostLabel, e);
      };

      await tween(lead, mine, (p) => slideTo(ease(seg(p, lead, SLIDE_MS))));
      if (!alive(mine)) return;
      // 줄 위의 칸과 밑의 십진값이 이어서 바뀐다 — 같은 하나의 일이라 시계가 하나다.
      await tween(SWAP_MS, mine, (p) => {
        slideTo(ease(clamp01((lead + SWAP_MS * p) / SLIDE_MS)));
        swapFrame(node, was, d.parts.significand, d.geom.cxs[MAN], p);
      });
    }

    /**
     * 읽은 값 셋이 제자리에서 내려와 한 줄을 이룬다.
     *
     * 시계는 하나다 — 셋이 모이는 것과 식의 나머지가 드러나는 것이 한 뜻이라
     * `Promise.all` 로 가르지 않는다 (프로토콜 3 절).
     */
    function flowAssemble(d: Drawn, mine: number): Promise<void> {
      const total = TRAVEL_MS + FADE_MS;
      const lag = Math.round(TRAVEL_MS * 0.6);
      const from: [number, number, number][] = [
        [
          readCx(d.parts.sign, d.geom.cxs[SIGN]) - d.formula.cxSign,
          READ_Y - FORMULA_Y,
          READ_FS,
        ],
        [
          readCx(signedNumber(d.parts.actual), d.geom.cxs[EXP]) - d.formula.cxSup,
          READ_Y - (FORMULA_Y - SUP_RAISE),
          READ_FS,
        ],
        [
          readCx(d.parts.significand, d.geom.cxs[MAN]) - d.formula.cxSig,
          READ_Y - FORMULA_Y,
          READ_FS,
        ],
      ];
      return tween(total, mine, (p) => {
        const ms = total * p;
        const e = ease(clamp01(ms / TRAVEL_MS));
        for (let i = 0; i < 3; i += 1) {
          const [dx, dy, size] = from[i];
          shift(d.results[i], dx * (1 - e), dy * (1 - e));
          if (i === EXP && d.results[i] !== null) {
            // 지수는 가면서 어깨 글자 크기로 줄어든다.
            const fs = e >= 1 ? SUP_FS : size + (SUP_FS - size) * e;
            d.results[i]?.setAttribute('font-size', num(fs));
          }
        }
        const late = clamp01((ms - lag) / FADE_MS);
        for (const node of d.formulaNodes) setOpacity(node, ease(late));
      });
    }

    function flowSettle(d: Drawn, mine: number): Promise<void> {
      return tween(RULE_MS + 40, mine, (p) => {
        const e = ease(clamp01(p / (RULE_MS / (RULE_MS + 40))));
        for (let i = 0; i < d.rules.length; i += 1) {
          const len = d.ruleLens[i];
          if (e >= 1) {
            d.rules[i].removeAttribute('stroke-dasharray');
            d.rules[i].removeAttribute('stroke-dashoffset');
            continue;
          }
          d.rules[i].setAttribute('stroke-dasharray', num(len));
          d.rules[i].setAttribute('stroke-dashoffset', num(len * (1 - e)));
        }
      });
    }

    function flowFor(d: Drawn, scene: MantissaAndExponentScene, mine: number): Promise<void> {
      switch (scene.phase) {
        case 'laid':
          return flowLaid(d, mine);
        case 'split':
          return flowSplit(d, mine);
        case 'sign':
          return flowRead(d, SIGN, mine);
        case 'exponent':
          return flowRead(d, EXP, mine);
        case 'debiased':
          return flowDebias(d, mine);
        case 'fraction':
          return flowFraction(d, mine);
        case 'hidden':
          return flowHidden(d, mine);
        case 'assembled':
          return flowAssemble(d, mine);
        case 'settled':
          return flowSettle(d, mine);
        default:
          return Promise.resolve();
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: MantissaAndExponentScene,
      _prev: MantissaAndExponentScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      await flowFor(drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 속성과 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    // 처음 화면은 되감은 화면과 같다 — 둘 다 `phase` 가 `null` 인 장면이고,
    // 러너가 첫 `render` 로 세운다. 여기서 따로 그릴 것이 없다.

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
