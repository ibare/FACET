/**
 * 온도와 표본 추출 — stage.
 *
 * 운동의 동사: **몫이 쏠리고 퍼지며, 깎인 것이 가라앉는다.**
 *
 *   왼쪽 사다리   두 기둥 — 벌점 뒤 로짓(왼쪽)과 그것을 T 로 나눈 값(오른쪽, 1 등과의 간격).
 *                 벌점을 돌리면 이미 쓴 말의 점만 왼쪽 기둥에서 **가라앉고**, 온도를 돌리면
 *                 오른쪽 기둥의 점들이 1 등 쪽으로 **몰려들거나** 아래로 **흘러 퍼진다.**
 *   몫의 줄       0 부터 1 까지의 줄을 후보 차례대로 몫만큼 나눈 칸. 칸의 경계가 **미끄러진다.**
 *   난수 핀       서른 난수 u 가 줄 위 제자리에 박혀 있다. 판이 바뀌어도 **움직이지 않는다.**
 *   더미          뽑기마다 핀에서 점 하나가 줄로 떨어져 그 자리의 칸을 짚고, 그 후보의 더미로
 *                 옮겨 쌓인다. 새 판이 시작되면 쌓였던 점들이 **제 핀으로 돌아가** 새 칸으로
 *                 다시 떨어진다 — 난수는 그대로이고 칸의 경계만 움직였다.
 *
 * 색은 design-tokens 경유. 세로는 마운트 뒤 바뀌지 않는다 — 가장 큰 사다리 간격(1 등과 꼴찌의
 * 간격 11.2)과 가장 큰 더미(서른)가 들어갈 자리를 처음부터 잡는다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 460;

const PAD = 16;
const PROMPT_Y = 22;
const CAPTION_Y = 46;
const HEAD_Y = 72;

// 사다리
const LAD_L = 44;
const LAD_R = 116;
const LAD_LABEL_X = 134;
const LAD_TOP = 90;
const LAD_BOTTOM = 432;
/** 로짓 한 단위의 세로 길이. 가장 큰 간격 11.2 가 336 으로 LAD_BOTTOM 안에 든다. */
const UNIT = 30;
const LABEL_GAP = 13;

// 몫의 줄과 핀
const SX0 = 250;
const SX1 = W - PAD;
const SW = SX1 - SX0;
const PIN_ROWS = [88, 101, 114];
const PIN_R = 3;
const STRIP_Y = 128;
const STRIP_H = 30;
const AXIS_Y = STRIP_Y + STRIP_H + 13;

// 더미
const PILE_BASE = 410;
const WORD_Y = 426;
const SAID_Y = 450;
const DOT_R = 4.4;
const DOT_DX = 5.6;
const DOT_DY = 11.5;
/** 앞 판 더미 윤곽의 반폭. */
const GHOST_HW = DOT_DX + DOT_R + 2;

type Pt = { x: number; y: number };

type StageData = { prompt: string; words: string[]; logits: number[] };

function readData(raw: unknown): StageData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const prompt = r['prompt'];
  const words = r['words'];
  const logits = r['logits'];
  if (typeof prompt !== 'string') return null;
  if (!Array.isArray(words) || !words.every((w) => typeof w === 'string')) return null;
  if (!Array.isArray(logits) || !logits.every((z) => typeof z === 'number')) return null;
  if (words.length !== logits.length || words.length === 0) return null;
  return { prompt, words: words as string[], logits: logits as number[] };
}

/** projector 가 부르는 stage 의 표면. */
export type TemperatureSamplingStage = ViewInstance & {
  setup(info: { used: number[]; us: number[]; draws: number; seed: number }): void;
  penalize(penalty: number, penalized: number[], ms: number): void;
  scale(temperature: number, scaled: number[], ms: number): void;
  share(probs: number[], top: number, topPercent: number, ms: number): void;
  drop(n: number, u: number, pick: number, count: number, repeat: boolean, ms: number): void;
  tally(counts: number[], distinct: number, repeats: number, draws: number): void;
  reset(): void;
};

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const r2 = (v: number): string => {
  const x = Math.round(v * 100) / 100;
  return String(Object.is(x, -0) ? 0 : x);
};

export const temperatureSamplingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): TemperatureSamplingStage {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const data = readData(params.initialData);

    // ── 걸어 둔 것 (거두기용)
    let destroyed = false;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const set = (node: Element, attrs: Record<string, string | number>): void => {
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
    };

    // ── 화면 상태 (정본). 운동은 이 값을 보간해 apply() 로 그린다.
    const words = data?.words ?? [];
    const k = words.length;
    const colors = categorical(Math.max(k, 1));
    const maxLogit = data ? Math.max(...data.logits) : 0;
    let used: number[] = words.map(() => 0);
    let us: number[] = [];
    let draws = 0;
    let seed = 0;

    let leftVals: number[] = data ? [...data.logits] : [];
    let rightGap: number[] = data ? data.logits.map((z) => maxLogit - z) : [];
    let cum: number[] | null = null; // 길이 k + 1 의 경계, 첫 몫이 오기 전엔 없음
    let probs: number[] | null = null;
    let topIdx = -1;
    let hitCell = -1;
    let blank = '';
    let caption = t('caption.ready', 'Candidates for the next word: {n}', { n: words.length });
    let counts: number[] = words.map(() => 0);
    let lastCounts: number[] | null = null;
    /** 점 n 의 자리 — 핀이면 null. */
    let dotSlot: Array<{ pick: number; slot: number } | null> = [];
    /** 점 n 의 지금 그려지는 좌표. null 이면 숨김(핀에 겹침). */
    let dotPos: Array<Pt | null> = [];
    let flying = -1;

    const pinPt = (n: number): Pt => ({
      x: SX0 + (us[n] ?? 0) * SW,
      y: PIN_ROWS[n % PIN_ROWS.length]!,
    });
    const colX = (i: number): number => SX0 + ((i + 0.5) * SW) / Math.max(k, 1);
    const slotPt = (pick: number, slot: number): Pt => ({
      x: colX(pick) + (slot % 2 === 0 ? -DOT_DX : DOT_DX),
      y: PILE_BASE - DOT_R - Math.floor(slot / 2) * DOT_DY,
    });
    const pileTop = (c: number): number => PILE_BASE - Math.ceil(c / 2) * DOT_DY;
    const leftY = (z: number): number => LAD_TOP + (maxLogit - z) * UNIT;
    const rightY = (gap: number): number => Math.min(LAD_BOTTOM, LAD_TOP + gap * UNIT);

    // ── 요소
    let root: SVGGElement | null = null;
    type Nodes = {
      captionText: SVGTextElement;
      blankSpan: SVGTSpanElement;
      promptSpans: Array<{ span: SVGTSpanElement; word: string }>;
      ghostL: SVGCircleElement[];
      cutL: SVGLineElement[];
      dotL: SVGCircleElement[];
      dotR: SVGCircleElement[];
      link: SVGLineElement[];
      leader: SVGLineElement[];
      label: SVGTextElement[];
      stripBase: SVGRectElement;
      cell: SVGRectElement[];
      cellWord: SVGTextElement[];
      cellPct: SVGTextElement[];
      pins: SVGCircleElement[];
      ticks: SVGLineElement[];
      dots: SVGCircleElement[];
      countText: SVGTextElement[];
      ghostLine: SVGRectElement[];
      ghostText: SVGTextElement[];
      lastLegend: SVGGElement;
      saidGroup: SVGGElement;
      pinsHead: SVGTextElement;
    };
    let nodes: Nodes | null = null;

    function build(): void {
      svg.textContent = '';
      root = el('g', {}, svg);
      if (!data) return;
      const g = root;

      // 프롬프트 — 이미 쓴 말에 밑줄
      const prompt = el('text', { x: PAD, y: PROMPT_Y, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: pal.text }, g);
      const promptSpans: Nodes['promptSpans'] = [];
      for (const token of data.prompt.split(' ').filter((s) => s.length > 0)) {
        // 밑줄은 낱말에만 — 끝 마침표와 띄어쓰기는 따로 둔다
        const word = token.endsWith('.') ? token.slice(0, -1) : token;
        const span = el('tspan', {}, prompt);
        span.textContent = word;
        const rest = el('tspan', {}, prompt);
        rest.textContent = `${token.slice(word.length)} `;
        promptSpans.push({ span, word });
      }
      const blankSpan = el('tspan', { 'font-weight': 700 }, prompt);

      const captionText = el('text', { x: PAD, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.text }, g);

      // 사다리 머리와 기둥
      const headL = el('text', { x: LAD_L, y: HEAD_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      headL.textContent = t('label.logit', 'logit');
      const headR = el('text', { x: LAD_R, y: HEAD_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      headR.textContent = t('label.scaled', '÷ T');
      el('line', { x1: LAD_L, y1: LAD_TOP - 8, x2: LAD_L, y2: leftY(Math.min(...data.logits, 0)) + 8, stroke: pal.border, 'stroke-width': 1 }, g);
      el('line', { x1: LAD_R, y1: LAD_TOP - 8, x2: LAD_R, y2: LAD_BOTTOM + 2, stroke: pal.border, 'stroke-width': 1 }, g);

      const link: SVGLineElement[] = [];
      const cutL: SVGLineElement[] = [];
      const ghostL: SVGCircleElement[] = [];
      const leader: SVGLineElement[] = [];
      const dotL: SVGCircleElement[] = [];
      const dotR: SVGCircleElement[] = [];
      const label: SVGTextElement[] = [];
      for (let i = 0; i < k; i += 1) {
        link.push(el('line', { stroke: colors[i]!, 'stroke-width': 1.5, 'stroke-opacity': 0.7 }, g));
        cutL.push(el('line', { stroke: pal.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, g));
        ghostL.push(el('circle', { r: 4, fill: 'none', stroke: pal.textMuted, 'stroke-dasharray': '2 2' }, g));
        leader.push(el('line', { stroke: pal.border, 'stroke-width': 1 }, g));
      }
      for (let i = 0; i < k; i += 1) {
        dotL.push(el('circle', { r: 4.5, fill: colors[i]!, stroke: pal.bg, 'stroke-width': 1 }, g));
        dotR.push(el('circle', { r: 4.5, fill: colors[i]!, stroke: pal.bg, 'stroke-width': 1 }, g));
        const lb = el('text', { x: LAD_LABEL_X, 'dominant-baseline': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.text }, g);
        lb.textContent = words[i]!;
        label.push(lb);
      }

      // 몫의 줄
      const pinsHead = el('text', { x: SX0, y: HEAD_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      const stripBase = el('rect', { x: SX0, y: STRIP_Y, width: SW, height: STRIP_H, fill: pal.bgSubtle, stroke: pal.border }, g);
      const cell: SVGRectElement[] = [];
      const cellWord: SVGTextElement[] = [];
      const cellPct: SVGTextElement[] = [];
      for (let i = 0; i < k; i += 1) {
        cell.push(el('rect', { y: STRIP_Y, height: STRIP_H, fill: colors[i]!, stroke: pal.bg, 'stroke-width': 1 }, g));
      }
      for (let i = 0; i < k; i += 1) {
        const w = el('text', { y: STRIP_Y + 13, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.stateInk }, g);
        w.textContent = words[i]!;
        cellWord.push(w);
        cellPct.push(el('text', { y: STRIP_Y + 25, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.stateInk }, g));
      }
      const zero = el('text', { x: SX0, y: AXIS_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      // 판정 3 — 수 표기(줄의 왼끝 0). 번역하지 않는 표식.
      zero.textContent = '0';
      const one = el('text', { x: SX1, y: AXIS_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      // 판정 3 — 수 표기(줄의 오른끝 1). 번역하지 않는 표식.
      one.textContent = '1';

      const ticks: SVGLineElement[] = [];
      const pins: SVGCircleElement[] = [];
      for (let n = 0; n < us.length; n += 1) {
        const p = pinPt(n);
        ticks.push(el('line', { x1: r2(p.x), x2: r2(p.x), y1: r2(p.y + PIN_R), y2: STRIP_Y, stroke: pal.border, 'stroke-width': 1 }, g));
      }
      for (let n = 0; n < us.length; n += 1) {
        const p = pinPt(n);
        pins.push(el('circle', { cx: r2(p.x), cy: r2(p.y), r: PIN_R, fill: pal.bg, stroke: pal.textMuted, 'stroke-width': 1 }, g));
      }

      // 더미
      el('line', { x1: SX0, x2: SX1, y1: PILE_BASE, y2: PILE_BASE, stroke: pal.border, 'stroke-width': 1 }, g);
      const countText: SVGTextElement[] = [];
      const ghostLine: SVGRectElement[] = [];
      const ghostText: SVGTextElement[] = [];
      for (let i = 0; i < k; i += 1) {
        const wl = el('text', { x: r2(colX(i)), y: WORD_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.text }, g);
        wl.textContent = words[i]!;
        ghostLine.push(el('rect', { fill: 'none', stroke: pal.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 2' }, g));
        ghostText.push(el('text', { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g));
      }
      for (let i = 0; i < k; i += 1) {
        // 앞 판 윤곽 위에 겹쳐도 읽히게 바탕색 테를 두른다
        countText.push(
          el('text', {
            x: r2(colX(i)),
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: pal.text,
            stroke: pal.bg,
            'stroke-width': 3,
            'paint-order': 'stroke',
          }, g),
        );
      }
      const saidGroup = el('g', {}, g);
      const lastLegend = el('g', {}, g);
      el('rect', { x: SX1 - 92, y: AXIS_Y + 16, width: 12, height: 10, fill: 'none', stroke: pal.textMuted, 'stroke-dasharray': '3 2' }, lastLegend);
      const lt = el('text', { x: SX1 - 74, y: AXIS_Y + 25, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, lastLegend);
      lt.textContent = t('label.last', 'last round');

      const dots: SVGCircleElement[] = [];
      for (let n = 0; n < us.length; n += 1) {
        dots.push(el('circle', { r: DOT_R, stroke: pal.bg, 'stroke-width': 0.8 }, g));
      }

      nodes = {
        captionText, blankSpan, promptSpans, ghostL, cutL, dotL, dotR, link, leader, label,
        stripBase, cell, cellWord, cellPct, pins, ticks, dots, countText, ghostLine, ghostText,
        lastLegend, saidGroup, pinsHead,
      };
      drawSaid();
    }

    /** 이미 쓴 말 표시 — 프롬프트 밑줄과 더미 아래 묶음. used 가 정해질 때 한 번. */
    function drawSaid(): void {
      if (!nodes) return;
      for (const { span, word } of nodes.promptSpans) {
        const i = words.indexOf(word);
        if (i >= 0 && used[i] === 1) {
          set(span, { 'text-decoration': 'underline', 'font-weight': 700 });
        } else {
          span.removeAttribute('text-decoration');
          span.removeAttribute('font-weight');
        }
      }
      const g = nodes.saidGroup;
      g.textContent = '';
      const cols = used.map((u, i) => (u === 1 ? i : -1)).filter((i) => i >= 0);
      if (cols.length === 0) return;
      const x0 = colX(cols[0]!) - 22;
      const x1 = colX(cols[cols.length - 1]!) + 22;
      const y = WORD_Y + 8;
      el('path', { d: `M${r2(x0)} ${y - 3} V${y} H${r2(x1)} V${y - 3}`, fill: 'none', stroke: pal.textMuted, 'stroke-width': 1 }, g);
      const s = el('text', { x: r2((x0 + x1) / 2), y: SAID_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted }, g);
      s.textContent = t('label.said', 'already said');
    }

    /** 이름표가 겹치지 않게 세로 자리를 고른다. */
    function spread(ys: number[]): number[] {
      const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const out = ys.slice();
      let prev = -Infinity;
      for (const [y, i] of order) {
        const v = Math.max(y, prev + LABEL_GAP);
        out[i] = v;
        prev = v;
      }
      let next = Infinity;
      for (let j = order.length - 1; j >= 0; j -= 1) {
        const i = order[j]![1];
        const v = Math.min(out[i]!, next - LABEL_GAP, LAD_BOTTOM + 6);
        out[i] = v;
        next = v;
      }
      return out;
    }

    function apply(): void {
      if (!nodes || !data) return;
      const n = nodes;
      n.captionText.textContent = caption;
      // 판정 1 — 프롬프트 끝 빈칸을 그리는 도형 글자. 번역하지 않는 표식.
      n.blankSpan.textContent = blank === '' ? '___' : blank;
      set(n.blankSpan, { fill: blank === '' ? pal.textMuted : pal.text });

      // 사다리
      const ly = leftVals.map(leftY);
      const ry = rightGap.map(rightY);
      const lab = spread(ry);
      for (let i = 0; i < k; i += 1) {
        set(n.dotL[i]!, { cx: LAD_L, cy: r2(ly[i]!) });
        set(n.dotR[i]!, { cx: LAD_R, cy: r2(ry[i]!) });
        set(n.link[i]!, { x1: LAD_L, y1: r2(ly[i]!), x2: LAD_R, y2: r2(ry[i]!) });
        set(n.leader[i]!, { x1: LAD_R + 5, y1: r2(ry[i]!), x2: LAD_LABEL_X - 3, y2: r2(lab[i]!) });
        set(n.label[i]!, { y: r2(lab[i]!), 'font-weight': i === topIdx ? 700 : 400 });
        const orig = data.logits[i]!;
        const sunk = Math.abs(leftVals[i]! - orig) > 1e-9;
        set(n.ghostL[i]!, { cx: LAD_L, cy: r2(leftY(orig)), visibility: sunk ? 'visible' : 'hidden' });
        set(n.cutL[i]!, {
          x1: LAD_L,
          x2: LAD_L,
          y1: r2(leftY(orig) + 4),
          y2: r2(ly[i]! - 4.5),
          visibility: sunk && ly[i]! - leftY(orig) > 9 ? 'visible' : 'hidden',
        });
      }

      // 몫의 줄
      n.pinsHead.textContent = draws > 0 ? t('label.pins', 'the same {draws} random numbers every round (seed {seed})', { draws, seed }) : '';
      for (let i = 0; i < k; i += 1) {
        const a = cum ? cum[i]! : 0;
        const b = cum ? cum[i + 1]! : 0;
        const x = SX0 + a * SW;
        const w = Math.max(0, (b - a) * SW);
        set(n.cell[i]!, {
          x: r2(x),
          width: r2(w),
          visibility: cum ? 'visible' : 'hidden',
          stroke: i === hitCell ? pal.text : pal.bg,
          'stroke-width': i === hitCell ? 2 : 1,
        });
        const wide = cum !== null && w >= 36;
        set(n.cellWord[i]!, { x: r2(x + w / 2), visibility: wide ? 'visible' : 'hidden' });
        set(n.cellPct[i]!, { x: r2(x + w / 2), visibility: wide && probs ? 'visible' : 'hidden' });
        // 판정 3 — 값 하나에 % 기호가 붙은 수 표기. 번역하지 않는 표식.
        n.cellPct[i]!.textContent = probs ? `${Math.round(probs[i]! * 100)}%` : '';
      }

      // 핀 — 떨어져 나간 핀은 비어 있고, 점이 돌아오면 다시 찬다
      for (let j = 0; j < n.pins.length; j += 1) {
        set(n.pins[j]!, { stroke: j === flying ? pal.text : pal.textMuted, 'stroke-width': j === flying ? 2 : 1 });
      }

      // 더미
      for (let i = 0; i < k; i += 1) {
        const c = counts[i]!;
        set(n.countText[i]!, { y: r2(pileTop(c) - 6), visibility: c > 0 ? 'visible' : 'hidden' });
        n.countText[i]!.textContent = String(c);
        const last = lastCounts ? lastCounts[i]! : 0;
        const show = lastCounts !== null && last > 0;
        const gy = pileTop(last);
        set(n.ghostLine[i]!, {
          x: r2(colX(i) - GHOST_HW),
          y: r2(gy),
          width: r2(GHOST_HW * 2),
          height: r2(PILE_BASE - gy),
          visibility: show ? 'visible' : 'hidden',
        });
        set(n.ghostText[i]!, { x: r2(colX(i) + GHOST_HW + 3), y: r2(gy + 4), visibility: show ? 'visible' : 'hidden' });
        n.ghostText[i]!.textContent = String(last);
      }
      set(n.lastLegend, { visibility: lastCounts ? 'visible' : 'hidden' });
      for (let j = 0; j < n.dots.length; j += 1) {
        const p = dotPos[j] ?? null;
        const s = dotSlot[j] ?? null;
        if (!p) {
          set(n.dots[j]!, { visibility: 'hidden' });
          continue;
        }
        set(n.dots[j]!, { cx: r2(p.x), cy: r2(p.y), fill: s ? colors[s.pick]! : pal.textMuted, visibility: 'visible' });
      }
    }

    // ── 운동. 통로마다 하나씩 — 새 운동이 오면 앞 것을 끝자리로 밀고 시작한다.
    type Tween = { finish: () => void };
    const running = new Map<string, Tween>();

    function schedule(fn: () => void): void {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          fn();
        });
        frames.add(id);
      } else {
        const id = setTimeout(() => {
          timers.delete(id);
          fn();
        }, 16);
        timers.add(id);
      }
    }

    function tween(channel: string, ms: number, step: (k: number) => void): void {
      running.get(channel)?.finish();
      if (destroyed) return;
      if (ms <= 0) {
        step(1);
        apply();
        return;
      }
      const start = Date.now();
      let done = false;
      const tw: Tween = {
        finish() {
          if (done) return;
          done = true;
          running.delete(channel);
          step(1);
          apply();
        },
      };
      running.set(channel, tw);
      const frame = (): void => {
        if (done || destroyed) return;
        const kk = Math.min(1, (Date.now() - start) / ms);
        if (kk >= 1) {
          tw.finish();
          return;
        }
        step(ease(kk));
        apply();
        schedule(frame);
      };
      step(0);
      apply();
      schedule(frame);
    }

    function stopAll(): void {
      for (const tw of [...running.values()]) tw.finish();
      running.clear();
    }

    function initState(): void {
      leftVals = data ? [...data.logits] : [];
      rightGap = data ? data.logits.map((z) => maxLogit - z) : [];
      cum = null;
      probs = null;
      topIdx = -1;
      hitCell = -1;
      blank = '';
      caption = t('caption.ready', 'Candidates for the next word: {n}', { n: words.length });
      counts = words.map(() => 0);
      lastCounts = null;
      dotSlot = us.map(() => null);
      dotPos = us.map(() => null);
      flying = -1;
    }

    build();
    initState();
    apply();

    const instance: TemperatureSamplingStage = {
      setup(info) {
        if (destroyed || !data) return;
        stopAll();
        used = words.map((_, i) => (info.used[i] === 1 ? 1 : 0));
        us = info.us.slice();
        draws = info.draws;
        seed = info.seed;
        build();
        initState();
        apply();
      },

      penalize(penalty, penalized, ms) {
        if (destroyed || !data || !nodes) return;
        const said = words.filter((_, i) => used[i] === 1).join(', ');
        caption =
          penalty === 1
            ? t('caption.noPenalty', 'Penalty {p}: no score is cut.', { p: penalty })
            : t('caption.penalize', 'Penalty {p}: words already said lose score — {words}', { p: penalty, words: said });
        // 앞 판의 결과를 남기고, 쌓였던 점은 제 핀으로 돌아간다.
        const landed = dotSlot.some((s) => s !== null);
        if (landed) lastCounts = counts.slice();
        counts = words.map(() => 0);
        hitCell = -1;
        flying = -1;
        blank = '';
        const fromDots = dotPos.map((p) => (p ? { ...p } : null));
        dotSlot = us.map(() => null);
        const fromL = leftVals.slice();
        tween('dots', ms * 0.8, (kk) => {
          dotPos = fromDots.map((p, j) => {
            if (!p) return null;
            if (kk >= 1) return null;
            const to = pinPt(j);
            return { x: lerp(p.x, to.x, kk), y: lerp(p.y, to.y, kk) };
          });
        });
        tween('ladder', ms * 0.8, (kk) => {
          leftVals = fromL.map((z, i) => lerp(z, penalized[i] ?? z, kk));
        });
      },

      scale(temperature, scaled, ms) {
        if (destroyed || !data || !nodes) return;
        caption = t('caption.scale', 'Every score is divided by T = {t}.', { t: temperature });
        const top = Math.max(...scaled);
        const target = scaled.map((w) => top - w);
        const from = rightGap.slice();
        tween('ladder', ms * 0.8, (kk) => {
          rightGap = from.map((g, i) => lerp(g, target[i] ?? g, kk));
        });
      },

      share(p, top, topPercent, ms) {
        if (destroyed || !data || !nodes) return;
        caption = t('caption.share', 'Shares of the line from 0 to 1 — top: {word} {pct}%', {
          word: words[top] ?? '',
          pct: topPercent,
        });
        const target: number[] = [0];
        let acc = 0;
        for (const v of p) {
          acc += v;
          target.push(acc);
        }
        target[target.length - 1] = 1;
        const from = cum ? cum.slice() : target.map(() => 0);
        probs = p.slice();
        topIdx = top;
        tween('strip', ms * 0.8, (kk) => {
          cum = from.map((a, i) => lerp(a, target[i]!, kk));
        });
      },

      drop(n, u, pick, count, repeat, ms) {
        if (destroyed || !data || !nodes || n < 0 || n >= us.length) return;
        const vars = { n: n + 1, u: u.toFixed(4), word: words[pick] ?? '' };
        caption = repeat
          ? t('caption.drawRepeat', 'Draw {n}: u = {u} lands on {word} — already said.', vars)
          : t('caption.draw', 'Draw {n}: u = {u} lands on {word}.', vars);
        running.get('dots')?.finish();
        flying = n;
        hitCell = pick;
        blank = words[pick] ?? '';
        const from = pinPt(n);
        const hit = { x: from.x, y: STRIP_Y + STRIP_H / 2 };
        const slot = Math.max(0, count - 1);
        const to = slotPt(pick, slot);
        dotSlot[n] = { pick, slot };
        tween('dots', ms * 0.8, (kk) => {
          const pos =
            kk < 0.45
              ? { x: from.x, y: lerp(from.y, hit.y, kk / 0.45) }
              : { x: lerp(hit.x, to.x, (kk - 0.45) / 0.55), y: lerp(hit.y, to.y, (kk - 0.45) / 0.55) };
          dotPos[n] = pos;
          if (kk >= 1) {
            counts[pick] = Math.max(counts[pick] ?? 0, count);
            flying = -1;
          }
        });
      },

      tally(c, distinct, repeats, total) {
        if (destroyed || !data || !nodes) return;
        stopAll();
        counts = words.map((_, i) => c[i] ?? 0);
        hitCell = -1;
        caption = t('caption.tally', '{draws} draws: {distinct} kinds, {repeats} repeats of words already said.', {
          draws: total,
          distinct,
          repeats,
        });
        apply();
      },

      reset() {
        if (destroyed) return;
        stopAll();
        used = words.map(() => 0);
        us = [];
        draws = 0;
        seed = 0;
        build();
        initState();
        apply();
      },

      destroy() {
        destroyed = true;
        running.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
        nodes = null;
      },
    };
    return instance;
  },
};
