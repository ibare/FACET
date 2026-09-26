/**
 * regex-backtracking 무대 — 글줄 칸마다 선 "대어 본 수" 기둥 · tries 막대 · 지금 자리 표시.
 *
 * 운동: 판이 바뀌면 칸이 옛 끝 칸 자리에서 오른쪽으로 미끄러져 **늘어나거나** 새 끝 칸으로 접혀 **줄고**,
 * 앞 판의 기둥 · 막대는 바닥으로 주저앉는다. 걸음마다 이번에 새로 대어 본 수가 기둥 · 막대 위로 **쌓여 오른다**
 * (앞 걸음까지의 몫은 바탕색, 이번 몫은 강조색). 자리 표시는 그 걸음의 자리로 미끄러진다.
 *
 * 눈금은 판 머리 payload 의 사다리 전체 값(hitsScale · triesScale · capacity)으로 고정한다 — 무대는 셈하지 않는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 410;
const PAD = 24;
const COL_TOP = 64;
const COL_BASE = 236;
const COL_H = COL_BASE - COL_TOP;
const CELL_Y = 244;
const CELL_H = 38;
const IDX_Y = 300;
const TRIES_Y = 334;
const DFA_Y = 364;
const CAPTION_Y = 398;
const BAR_W = W - PAD * 2;

export type BoardView = {
  letters: string[];
  patternText: string;
  cells: number;
  capacity: number;
  triesScale: number;
  hitsScale: number;
  dfaSteps: number;
  durationMs: number;
  caption: string;
};

export type StepView = {
  kind: 'descend' | 'exhaust' | 'accept';
  sp: number;
  tries: number;
  delta: number;
  hits: number[];
  fresh: number[];
  durationMs: number;
  caption: string;
};

export type VerdictView = { matched: boolean; tries: number; durationMs: number; caption: string };

export type RegexBacktrackingStage = ViewInstance & {
  setBoard(p: BoardView): void;
  showStep(p: StepView): void;
  showVerdict(p: VerdictView): void;
  /** 되감기 — 판의 결론(기둥 · 막대 · 판정 · 자리 표시 · 캡션)을 모두 걷어 빈 무대로 */
  clear(): void;
};

type Slot = {
  g: SVGGElement;
  cell: SVGRectElement;
  letter: SVGTextElement;
  idx: SVGTextElement;
  base: SVGRectElement;
  fresh: SVGRectElement;
  value: SVGTextElement;
  /** 지금 그려진 값 (운동의 출발점) */
  x: number;
  baseH: number;
  freshH: number;
  /** 운동의 도착점 */
  tx: number;
  tBaseH: number;
  tFreshH: number;
  fx: number;
  fBaseH: number;
  fFreshH: number;
  visible: boolean;
  hideAfter: boolean;
};

type Bar = { base: SVGRectElement; fresh: SVGRectElement; w: number; fw: number; tw: number; ffw: number; tfw: number; fbw: number };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  parent.appendChild(e);
  return e;
}

export const regexBacktrackingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const root = el('g', {}, svg);

    // ── 머리: 무늬 · 글줄 · 판정
    const patLabel = el('text', { x: PAD, y: 28, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
    patLabel.textContent = t('label.pattern', 'Pattern');
    const patText = el('text', { x: PAD + 64, y: 30, 'font-family': fonts.mono, 'font-size': fontSizes.xl, fill: c.text, 'font-weight': 600 }, root);
    const txtLabel = el('text', { x: PAD + 220, y: 28, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
    txtLabel.textContent = t('label.text', 'Text');
    const txtText = el('text', { x: PAD + 270, y: 30, 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text }, root);

    const verdictG = el('g', { visibility: 'hidden' }, root);
    const verdictBox = el('rect', { x: W - PAD - 120, y: 10, width: 120, height: 30 }, verdictG);
    const verdictText = el('text', { x: W - PAD - 60, y: 30, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700 }, verdictG);

    // 기둥 바닥선
    el('line', { x1: PAD, y1: COL_BASE + 0.5, x2: W - PAD, y2: COL_BASE + 0.5, stroke: c.border }, root);

    const slotsG = el('g', {}, root);
    const marker = el('rect', { x: 0, y: CELL_Y - 3, width: 0, height: CELL_H + 6, rx: 4, fill: 'none', stroke: c.accent, 'stroke-width': 3, visibility: 'hidden' }, root);
    const caret = el('path', { d: '', fill: c.accent, visibility: 'hidden' }, root);

    // ── tries 막대 · DFA 막대
    const triesLabel = el('text', { x: PAD, y: TRIES_Y - 6, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, root);
    const triesMax = el('text', { x: W - PAD, y: TRIES_Y - 6, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, root);
    el('rect', { x: PAD, y: TRIES_Y, width: BAR_W, height: 12, fill: 'none', stroke: c.border }, root);
    const triesBar: Bar = {
      base: el('rect', { x: PAD, y: TRIES_Y, width: 0, height: 12, fill: c.primary }, root),
      fresh: el('rect', { x: PAD, y: TRIES_Y, width: 0, height: 12, fill: c.itemComparing }, root),
      w: 0, fw: 0, tw: 0, tfw: 0, fbw: 0, ffw: 0,
    };
    const dfaLabel = el('text', { x: PAD, y: DFA_Y - 6, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
    el('rect', { x: PAD, y: DFA_Y, width: BAR_W, height: 6, fill: 'none', stroke: c.border }, root);
    const dfaBar: Bar = {
      base: el('rect', { x: PAD, y: DFA_Y, width: 0, height: 6, fill: c.textMuted }, root),
      fresh: el('rect', { x: PAD, y: DFA_Y, width: 0, height: 6, fill: c.textMuted }, root),
      w: 0, fw: 0, tw: 0, tfw: 0, fbw: 0, ffw: 0,
    };

    const caption = el('text', { x: PAD, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, root);

    // ── 칸 자리 (사다리의 가장 큰 칸 수만큼, 판 머리에서 늘린다)
    const slots: Slot[] = [];
    let cellW = 0;
    let colScale = 0;
    let barScale = 0;
    let count = 0;
    let markerX = 0;
    let markerFrom = 0;
    let markerTo = 0;
    let markerOn = false;

    const slotX = (i: number): number => PAD + i * cellW;
    const ensureSlots = (capacity: number): void => {
      while (slots.length < capacity) {
        const g = el('g', { visibility: 'hidden' }, slotsG);
        const s: Slot = {
          g,
          cell: el('rect', { y: CELL_Y, height: CELL_H, rx: 3, 'stroke-width': 1.5 }, g),
          letter: el('text', { y: CELL_Y + CELL_H / 2 + smPx / 2 + 2, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text }, g),
          idx: el('text', { y: IDX_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, g),
          base: el('rect', { fill: c.primary }, g),
          fresh: el('rect', { fill: c.itemComparing }, g),
          value: el('text', { 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text }, g),
          x: 0, baseH: 0, freshH: 0, tx: 0, tBaseH: 0, tFreshH: 0, fx: 0, fBaseH: 0, fFreshH: 0,
          visible: false, hideAfter: false,
        };
        slots.push(s);
      }
    };

    const drawSlot = (s: Slot): void => {
      const cw = cellW - 8;
      s.g.setAttribute('transform', `translate(${s.x.toFixed(2)},0)`);
      s.cell.setAttribute('x', '4');
      s.cell.setAttribute('width', String(cw));
      s.letter.setAttribute('x', String(cellW / 2));
      s.idx.setAttribute('x', String(cellW / 2));
      const colW = cellW - 14;
      s.base.setAttribute('x', '7');
      s.base.setAttribute('width', String(colW));
      s.base.setAttribute('y', (COL_BASE - s.baseH).toFixed(2));
      s.base.setAttribute('height', Math.max(0, s.baseH).toFixed(2));
      s.fresh.setAttribute('x', '7');
      s.fresh.setAttribute('width', String(colW));
      s.fresh.setAttribute('y', (COL_BASE - s.baseH - s.freshH).toFixed(2));
      s.fresh.setAttribute('height', Math.max(0, s.freshH).toFixed(2));
      s.value.setAttribute('x', String(cellW / 2));
      s.value.setAttribute('y', (COL_BASE - s.baseH - s.freshH - 4).toFixed(2));
    };
    const drawBar = (b: Bar): void => {
      b.base.setAttribute('width', Math.max(0, b.w).toFixed(2));
      b.fresh.setAttribute('x', (PAD + b.w).toFixed(2));
      b.fresh.setAttribute('width', Math.max(0, b.fw).toFixed(2));
    };
    const drawMarker = (): void => {
      marker.setAttribute('x', (markerX + 2).toFixed(2));
      marker.setAttribute('width', String(cellW - 4));
      const cx = markerX + cellW / 2;
      caret.setAttribute('d', `M ${(cx - 6).toFixed(2)} ${IDX_Y + 12} L ${(cx + 6).toFixed(2)} ${IDX_Y + 12} L ${cx.toFixed(2)} ${IDX_Y + 5} Z`);
      marker.setAttribute('visibility', markerOn ? 'visible' : 'hidden');
      caret.setAttribute('visibility', markerOn ? 'visible' : 'hidden');
    };

    // ── 운동 — 출발점(from)에서 도착점(to)으로 rAF 로 옮긴다
    let raf: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stopMotion = (): void => {
      if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      if (timer !== null) clearTimeout(timer);
      raf = null;
      timer = null;
    };
    const apply = (k: number): void => {
      const e = k >= 1 ? 1 : 1 - Math.pow(1 - k, 3);
      for (const s of slots) {
        s.x = s.fx + (s.tx - s.fx) * e;
        s.baseH = s.fBaseH + (s.tBaseH - s.fBaseH) * e;
        s.freshH = s.fFreshH + (s.tFreshH - s.fFreshH) * e;
        if (k >= 1 && s.hideAfter) {
          s.visible = false;
          s.hideAfter = false;
          s.g.setAttribute('visibility', 'hidden');
        }
        drawSlot(s);
      }
      for (const b of [triesBar, dfaBar]) {
        b.w = b.fbw + (b.tw - b.fbw) * e;
        b.fw = b.ffw + (b.tfw - b.ffw) * e;
        drawBar(b);
      }
      markerX = markerFrom + (markerTo - markerFrom) * e;
      drawMarker();
    };
    const animate = (durationMs: number): void => {
      stopMotion();
      for (const s of slots) {
        s.fx = s.x;
        s.fBaseH = s.baseH;
        s.fFreshH = s.freshH;
      }
      for (const b of [triesBar, dfaBar]) {
        b.fbw = b.w;
        b.ffw = b.fw;
      }
      markerFrom = markerX;
      const hasRaf = typeof requestAnimationFrame === 'function';
      if (!(durationMs > 0) || !hasRaf) {
        apply(1);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number): void => {
        const k = Math.min(1, (now - t0) / durationMs);
        apply(k);
        raf = k < 1 ? requestAnimationFrame(tick) : null;
      };
      raf = requestAnimationFrame(tick);
      // 탭이 가려져 rAF 가 멎어도 도착점에는 닿게
      timer = setTimeout(() => {
        stopMotion();
        apply(1);
      }, durationMs + 60);
    };

    const setCell = (s: Slot, i: number, letter: string | null): void => {
      s.letter.textContent = letter ?? '';
      s.idx.textContent = t('label.pos', '#{i}', { i });
      if (letter === null) {
        // 끝 칸 — 견줄 글자가 없는 자리
        s.cell.setAttribute('fill', c.bgSubtle);
        s.cell.setAttribute('stroke', c.textMuted);
        s.cell.setAttribute('stroke-dasharray', '4 3');
        s.letter.textContent = t('label.end', 'end');
        s.letter.setAttribute('font-size', fontSizes.xs);
        s.letter.setAttribute('fill', c.textMuted);
        s.letter.setAttribute('font-family', fonts.body);
      } else {
        s.cell.setAttribute('fill', c.bg);
        s.cell.setAttribute('stroke', c.border);
        s.cell.removeAttribute('stroke-dasharray');
        s.letter.setAttribute('font-size', fontSizes.lg);
        s.letter.setAttribute('fill', c.text);
        s.letter.setAttribute('font-family', fonts.mono);
      }
    };

    const need = (v: unknown, what: string): number => {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`regex-backtracking-stage: ${what} 가 수가 아니다`);
      return v;
    };

    const instance: RegexBacktrackingStage = {
      setBoard(p) {
        const capacity = need(p.capacity, 'capacity');
        if (p.cells !== p.letters.length + 1) throw new Error('regex-backtracking-stage: 칸 수가 글자 수 + 끝 칸이 아니다');
        if (p.cells > capacity) throw new Error('regex-backtracking-stage: 칸 수가 자리보다 많다');
        cellW = BAR_W / capacity;
        colScale = COL_H / need(p.hitsScale, 'hitsScale');
        barScale = BAR_W / need(p.triesScale, 'triesScale');
        ensureSlots(capacity);

        patText.textContent = p.patternText;
        txtText.textContent = p.letters.join('');
        verdictG.setAttribute('visibility', 'hidden');
        caption.textContent = p.caption;
        triesLabel.textContent = t('label.tries', 'Letters tried: {n}', { n: 0 });
        triesMax.textContent = String(p.triesScale);
        dfaLabel.textContent = t('label.dfa', 'DFA moves: {n}', { n: p.dfaSteps });

        const oldCount = count;
        const oldEndX = oldCount > 0 ? slotX(oldCount - 1) : PAD;
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i]!;
          if (i < p.cells) {
            setCell(s, i, i < p.letters.length ? p.letters[i]! : null);
            s.value.textContent = '0';
            s.value.setAttribute('fill', c.textMuted);
            if (!s.visible) {
              // 새로 생긴 칸 — 옛 끝 칸 자리에서 오른쪽으로 미끄러져 나온다
              s.x = oldEndX;
              s.baseH = 0;
              s.freshH = 0;
              s.visible = true;
              s.g.setAttribute('visibility', 'visible');
            }
            s.tx = slotX(i);
            s.hideAfter = false;
          } else if (s.visible) {
            // 없어진 칸 — 새 끝 칸 자리로 접혀 들어간다
            s.tx = slotX(p.cells - 1);
            s.hideAfter = true;
          }
          s.tBaseH = 0;
          s.tFreshH = 0;
        }
        count = p.cells;
        triesBar.tw = 0;
        triesBar.tfw = 0;
        dfaBar.tw = p.dfaSteps * barScale;
        dfaBar.tfw = 0;
        markerOn = false;
        markerTo = markerX;
        animate(p.durationMs);
      },

      showStep(p) {
        if (p.hits.length !== count || p.fresh.length !== count) throw new Error('regex-backtracking-stage: 자리마다 수의 길이가 칸 수와 다르다');
        if (p.sp < 0 || p.sp >= count) throw new Error(`regex-backtracking-stage: 칸 밖의 자리 ${p.sp}`);
        stopMotion();
        apply(1);
        for (let i = 0; i < count; i++) {
          const s = slots[i]!;
          const h = need(p.hits[i], 'hits');
          const f = need(p.fresh[i], 'fresh');
          // 앞 걸음의 몫은 바탕으로 합치고, 이번 몫이 그 위로 쌓여 오른다
          s.baseH = s.baseH + s.freshH;
          s.freshH = 0;
          s.tBaseH = (h - f) * colScale;
          s.tFreshH = f * colScale;
          s.value.textContent = String(h);
          s.value.setAttribute('fill', f > 0 ? c.text : c.textMuted);
          s.value.setAttribute('font-weight', f > 0 ? '700' : '400');
        }
        triesBar.w = triesBar.w + triesBar.fw;
        triesBar.fw = 0;
        triesBar.tw = (p.tries - p.delta) * barScale;
        triesBar.tfw = p.delta * barScale;
        triesLabel.textContent = t('label.tries', 'Letters tried: {n}', { n: p.tries });
        caption.textContent = p.caption;
        if (!markerOn) markerX = slotX(p.sp);
        markerOn = true;
        markerTo = slotX(p.sp);
        animate(p.durationMs);
      },

      showVerdict(p) {
        stopMotion();
        apply(1);
        // 이 판의 몫이 다 쌓였다 — 강조를 바탕으로 합친다
        for (let i = 0; i < count; i++) {
          const s = slots[i]!;
          s.tBaseH = s.baseH + s.freshH;
          s.tFreshH = 0;
          s.value.setAttribute('font-weight', '400');
        }
        triesBar.tw = triesBar.w + triesBar.fw;
        triesBar.tfw = 0;
        triesLabel.textContent = t('label.tries', 'Letters tried: {n}', { n: p.tries });
        verdictG.setAttribute('visibility', 'visible');
        if (p.matched) {
          verdictBox.setAttribute('rx', '15');
          verdictBox.setAttribute('fill', c.bg);
          verdictBox.setAttribute('stroke', c.text);
          verdictBox.setAttribute('stroke-width', '2');
          verdictText.setAttribute('fill', c.text);
          verdictText.textContent = t('label.match', 'Match');
        } else {
          verdictBox.setAttribute('rx', '2');
          verdictBox.setAttribute('fill', c.danger);
          verdictBox.setAttribute('stroke', c.danger);
          verdictBox.setAttribute('stroke-width', '2');
          verdictText.setAttribute('fill', c.stateInk);
          verdictText.textContent = t('label.noMatch', 'No match');
        }
        caption.textContent = p.caption;
        markerTo = markerX;
        animate(p.durationMs);
      },

      clear() {
        stopMotion();
        for (const s of slots) {
          s.x = s.tx = s.fx = PAD;
          s.baseH = s.tBaseH = s.fBaseH = 0;
          s.freshH = s.tFreshH = s.fFreshH = 0;
          s.visible = false;
          s.hideAfter = false;
          s.g.setAttribute('visibility', 'hidden');
          drawSlot(s);
        }
        count = 0;
        for (const b of [triesBar, dfaBar]) {
          b.w = b.fw = b.tw = b.tfw = b.fbw = b.ffw = 0;
          drawBar(b);
        }
        markerOn = false;
        drawMarker();
        verdictG.setAttribute('visibility', 'hidden');
        patText.textContent = '';
        txtText.textContent = '';
        triesLabel.textContent = '';
        triesMax.textContent = '';
        dfaLabel.textContent = '';
        caption.textContent = '';
      },

      destroy() {
        stopMotion();
        root.remove();
      },
    };
    return instance;
  },
};
