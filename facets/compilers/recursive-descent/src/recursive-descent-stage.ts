/**
 * recursive-descent 무대 — 원시 · 토큰 줄(읽는 자리) · 함수 상자 기둥 · 지금 문법.
 *
 * 운동
 *   - 부름: 새 함수 상자가 부른 상자 자리에서 한 칸 아래 제 깊이로 **내려온다**
 *   - 먹기: 먹힌 토큰이 입력 줄에서 **떨어져 나와** 먹은 함수의 상자로 들어간다. 줄에는 빈 자리가 남는다
 *   - 돌아옴: 상자가 부른 상자 자리로 **올라가며** 걷힌다 (먹은 토큰을 안은 채)
 *   - 한계: −1 이 기둥을 타고 위로 오르고, 상자가 아래에서부터 **무너져 내린다**
 *   - 읽는 자리 표 · 가장 깊이 선 · 문법의 켜진 규칙 틀이 제 자리로 옮겨 간다
 * 길이는 재생 속도를 따른다 (projector 가 걸음마다 속도를 넘긴다).
 *
 * 무대는 셈하지 않는다 — 열린 함수 · 돌아온 함수 · 먹힌 자리 · 판정 · 돌려줌 · 가장 깊이는 payload 가 준다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Frame, RoundPayload, StepPayload, Token } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 494;
const X0 = 16;
/** 토큰 칸 */
const TOK_Y = 30;
const TOK_W = 40;
const TOK_H = 36;
const TOK_GAP = 2;
/** 기둥 — 깊이 12 까지의 자리를 처음부터 */
const SLOTS = 12;
const SLOT_Y0 = 114;
const SLOT_H = 22;
const SLOT_STEP = 26;
const BOX_X = 44;
const BOX_W = 240;
const CHIP_X = 110;
const CHIP_W = 34;
const CHIP_H = 16;
const LIMIT_Y = SLOT_Y0 + SLOTS * SLOT_STEP + 2;
/** 문법 */
const GX = 390;
const RULE_Y0 = 124;
const RULE_STEP = 22;
const MOTION_MS = 300;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function textNode(parent: Element, x: number, y: number, s: string, attrs: Attrs = {}): SVGTextElement {
  const node = el('text', { x, y, 'xml:space': 'preserve', ...attrs }, parent);
  node.style.whiteSpace = 'pre';
  node.textContent = s;
  return node;
}

/** 옮김 — transform · opacity 를 CSS transition 으로 */
function place(g: SVGGElement, x: number, y: number, opacity: number, ms: number, delay = 0): void {
  g.style.transition = ms > 0 ? `transform ${ms}ms ease-out ${delay}ms, opacity ${ms}ms ease-out ${delay}ms` : 'none';
  g.style.transform = `translate(${x}px, ${y}px)`;
  g.style.opacity = String(opacity);
}

/** 처음 자리에 놓고 한 번 읽게 한 뒤 목적지로 — 새 요소가 날아 들어오게 */
function enter(g: SVGGElement, from: [number, number], to: [number, number], ms: number, fromOpacity = 0): void {
  place(g, from[0], from[1], fromOpacity, 0);
  void g.getBoundingClientRect();
  place(g, to[0], to[1], 1, ms);
}

const slotY = (depth: number): number => SLOT_Y0 + (depth - 1) * SLOT_STEP;
const cellX = (i: number): number => X0 + i * (TOK_W + TOK_GAP);
const chipX = (j: number): number => BOX_X + CHIP_X + j * (CHIP_W + 4);

type BoxEl = { g: SVGGElement; rect: SVGRectElement; name: SVGTextElement };
type ChipEl = { g: SVGGElement };

function mount(container: HTMLElement, params: Parameters<CanvasView['mount']>[1]): ViewInstance {
  void container;
  const svg = params.canvas;
  const c: Palette = getColors(params.theme);
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const MONO = fonts.mono;
  const BODY = fonts.body;
  const isInstant = params.isInstant ?? ((): boolean => false);
  /** 걷을 요소 — 운동이 끝나면 떼어 낸다. 되짚기가 시작되면 곧바로 떼어 끝 상태로 */
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  const later = (ms: number, f: () => void): void => {
    if (ms <= 0 || isInstant()) {
      f();
      return;
    }
    const id = setTimeout(() => {
      timers.delete(id);
      f();
    }, ms);
    timers.set(id, f);
  };
  params.onScrubStart?.(() => {
    const pending = [...timers];
    timers.clear();
    for (const [id, f] of pending) {
      clearTimeout(id);
      f();
    }
    // 걸려 있던 전이를 끝 값으로 — 되짚어 몰아 먹이는 걸음은 운동 없이 그린다
    for (const g of svg.querySelectorAll('g')) g.style.transition = 'none';
  });

  el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);

  // ── 원시
  textNode(svg, X0, 18, t('label.source', 'Source'), { fill: c.textMuted, 'font-family': BODY, 'font-size': fontSizes.xs });
  const sourceText = textNode(svg, X0 + 64, 18, '', { fill: c.text, 'font-family': MONO, 'font-size': fontSizes.md });

  // ── 토큰 줄
  const tokenLayer = el('g', {}, svg);
  const cursor = el('g', {}, svg);
  el('path', { d: `M ${TOK_W / 2} 0 l -6 8 l 12 0 z`, fill: c.primary }, cursor);
  textNode(cursor, TOK_W / 2, 20, t('label.cursor', 'reading'), {
    fill: c.primary, 'font-family': BODY, 'font-size': fontSizes.xs, 'text-anchor': 'middle',
  });
  place(cursor, cellX(0), TOK_Y + TOK_H + 4, 0, 0);
  type Cell = { g: SVGGElement; rect: SVGRectElement; kind: SVGTextElement; text: SVGTextElement };
  const cells: Cell[] = [];
  let tokens: Token[] = [];
  let limit = 0;

  // ── 기둥
  textNode(svg, X0, SLOT_Y0 - 8, t('label.stack', 'Call stack by depth'), { fill: c.textMuted, 'font-family': BODY, 'font-size': fontSizes.xs });
  for (let d = 1; d <= SLOTS; d += 1) {
    textNode(svg, BOX_X - 8, slotY(d) + 15, String(d), {
      fill: c.textMuted, 'font-family': MONO, 'font-size': fontSizes.xs, 'text-anchor': 'end',
    });
    el('rect', {
      x: BOX_X, y: slotY(d), width: BOX_W, height: SLOT_H, rx: 3, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 3',
    }, svg);
  }
  el('line', { x1: X0, y1: LIMIT_Y, x2: BOX_X + BOX_W, y2: LIMIT_Y, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '6 3' }, svg);
  const limitText = textNode(svg, BOX_X + BOX_W + 8, LIMIT_Y + 20, '', { fill: c.danger, 'font-family': BODY, 'font-size': fontSizes.xs });
  const ghost = el('g', {}, svg);
  el('rect', { x: 0, y: 0, width: BOX_W, height: SLOT_H, rx: 3, fill: 'none', stroke: c.danger, 'stroke-dasharray': '4 3' }, ghost);
  const ghostText = textNode(ghost, 8, 15, '', { fill: c.danger, 'font-family': MONO, 'font-size': fontSizes.sm });
  place(ghost, BOX_X, LIMIT_Y + 6, 0, 0);

  const deepest = el('g', {}, svg);
  el('line', { x1: -4, y1: 0, x2: BOX_W + 4, y2: 0, stroke: c.accent, 'stroke-width': 2 }, deepest);
  const deepestText = textNode(deepest, BOX_W + 8, 4, '', { fill: c.accent, 'font-family': BODY, 'font-size': fontSizes.xs });
  place(deepest, BOX_X, SLOT_Y0 - 2, 0, 0);

  const boxLayer = el('g', {}, svg);
  const chipLayer = el('g', {}, svg);
  const boxes = new Map<number, BoxEl>();
  const chips = new Map<number, ChipEl>();

  const tag = el('g', {}, svg);
  const tagRect = el('rect', { x: -2, y: -14, width: 40, height: 18, rx: 3, fill: c.bg, stroke: c.danger }, tag);
  const tagText = textNode(tag, 18, 0, '', { fill: c.danger, 'font-family': MONO, 'font-size': fontSizes.md, 'text-anchor': 'middle', 'font-weight': 700 });
  place(tag, BOX_X + BOX_W - 44, SLOT_Y0 + 15, 0, 0);

  // ── 문법
  textNode(svg, GX, SLOT_Y0 - 8, t('label.grammar', 'Grammar'), { fill: c.textMuted, 'font-family': BODY, 'font-size': fontSizes.xs });
  const ruleHi = el('g', {}, svg);
  const ruleHiRect = el('rect', { x: -6, y: 0, width: W - GX - 10, height: RULE_STEP, rx: 3, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5 }, ruleHi);
  place(ruleHi, GX, RULE_Y0 - 15, 0, 0);
  const ruleLayer = el('g', {}, svg);

  // ── 판정 · 돌려줌
  const verdict = el('g', {}, svg);
  const verdictRect = el('rect', { x: 0, y: 0, width: 180, height: 34, rx: 4, fill: c.bg, 'stroke-width': 2 }, verdict);
  const verdictText = textNode(verdict, 12, 22, '', { 'font-family': BODY, 'font-size': fontSizes.lg, 'font-weight': 700 });
  const returnsText = textNode(verdict, 12, 56, '', { fill: c.text, 'font-family': MONO, 'font-size': fontSizes.sm });
  place(verdict, GX, 300, 0, 0);

  // ── 캡션
  const caption = textNode(svg, X0, H - 14, '', { fill: c.text, 'font-family': BODY, 'font-size': fontSizes.sm });

  const drawCell = (cell: Cell, i: number, eaten: boolean): void => {
    const tk = tokens[i];
    if (!tk) throw new Error(`토큰 ${i} 이 없다`);
    cell.rect.setAttribute('stroke', eaten ? c.border : c.text);
    cell.rect.setAttribute('stroke-dasharray', eaten ? '3 3' : 'none');
    cell.kind.setAttribute('fill', c.textMuted);
    cell.text.setAttribute('fill', eaten ? c.border : c.text);
  };

  const chipOf = (i: number): ChipEl => {
    const tk = tokens[i];
    if (!tk) throw new Error(`먹힌 토큰 ${i} 이 없다`);
    const g = el('g', {}, chipLayer);
    el('rect', { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: 3, fill: c.bgSubtle, stroke: c.text }, g);
    textNode(g, CHIP_W / 2, 12, tk.text, { fill: c.text, 'font-family': MONO, 'font-size': fontSizes.sm, 'text-anchor': 'middle' });
    const chip = { g };
    chips.set(i, chip);
    return chip;
  };
  const chipStart = (i: number): [number, number] => [cellX(i) + (TOK_W - CHIP_W) / 2, TOK_Y + TOK_H - CHIP_H - 2];
  const chipAt = (depth: number, j: number): [number, number] => [chipX(j), slotY(depth) + (SLOT_H - CHIP_H) / 2];

  const boxOf = (f: Frame): BoxEl => {
    const g = el('g', {}, boxLayer);
    const rect = el('rect', { x: 0, y: 0, width: BOX_W, height: SLOT_H, rx: 3, fill: c.bgSubtle, stroke: c.border }, g);
    const name = textNode(g, 8, 15, f.name, { fill: c.text, 'font-family': MONO, 'font-size': fontSizes.sm });
    const box = { g, rect, name };
    boxes.set(f.id, box);
    return box;
  };

  const clearMoving = (): void => {
    for (const b of boxes.values()) b.g.remove();
    for (const ch of chips.values()) ch.g.remove();
    boxes.clear();
    chips.clear();
  };

  const setRound = (r: RoundPayload): void => {
    tokens = r.tokens;
    limit = r.limit;
    sourceText.textContent = r.source;
    limitText.textContent = t('label.limit', 'Limit: {n}', { n: r.limit });
    ghostText.textContent = '';
    clearMoving();
    // 토큰 칸 — 자리는 남기고 글만 바꾼다
    while (cells.length < tokens.length) {
      const g = el('g', {}, tokenLayer);
      const rect = el('rect', { x: 0, y: 0, width: TOK_W, height: TOK_H, rx: 3, fill: c.bg }, g);
      const kind = textNode(g, TOK_W / 2, 13, '', { 'font-family': MONO, 'font-size': fontSizes.xs, 'text-anchor': 'middle' });
      const text = textNode(g, TOK_W / 2, 30, '', { 'font-family': MONO, 'font-size': fontSizes.md, 'text-anchor': 'middle' });
      place(g, cellX(cells.length), TOK_Y, 1, 0);
      cells.push({ g, rect, kind, text });
    }
    cells.forEach((cell, i) => {
      const tk = tokens[i];
      if (!tk) {
        cell.g.style.display = 'none';
        return;
      }
      cell.g.style.display = '';
      cell.kind.textContent = tk.kind;
      cell.text.textContent = tk.text;
      drawCell(cell, i, false);
    });
    // 문법
    while (ruleLayer.firstChild) ruleLayer.firstChild.remove();
    r.rules.forEach((rule, i) => {
      textNode(ruleLayer, GX, RULE_Y0 + i * RULE_STEP, `R${i + 1}`, { fill: c.textMuted, 'font-family': MONO, 'font-size': fontSizes.sm });
      textNode(ruleLayer, GX + 34, RULE_Y0 + i * RULE_STEP, rule, { fill: c.text, 'font-family': MONO, 'font-size': fontSizes.sm });
    });
  };

  /** 되감기 — 걸어 둔 걷기를 거두고 판 머리 전의 빈 무대로 (자리 틀 · 문법 줄은 다음 setRound 가 다시 채운다) */
  const reset = (): void => {
    for (const id of timers.keys()) clearTimeout(id);
    timers.clear();
    clearMoving();
    ghostText.textContent = '';
    caption.textContent = '';
    place(ghost, BOX_X, LIMIT_Y + 6, 0, 0);
    place(tag, BOX_X + BOX_W - 44, SLOT_Y0 + 15, 0, 0);
    place(verdict, GX, 300, 0, 0);
    place(cursor, cellX(0), TOK_Y + TOK_H + 4, 0, 0);
    place(deepest, BOX_X, SLOT_Y0 - 2, 0, 0);
    place(ruleHi, GX, RULE_Y0 - 15, 0, 0);
  };

  const setStep = (s: StepPayload, speed: number): void => {
    if (tokens.length === 0) throw new Error('판 머리(setRound) 없이 걸음이 왔다');
    const ms = isInstant() ? 0 : Math.round(MOTION_MS / Math.max(0.25, speed));
    if (s.step === 0) {
      // 새 판의 걸음 0 — 앞 판의 결론을 걷는다
      clearMoving();
      ghostText.textContent = '';
      place(ghost, BOX_X, LIMIT_Y + 6, 0, 0);
      place(tag, BOX_X + BOX_W - 44, SLOT_Y0 + 15, 0, 0);
      place(verdict, GX, 300, 0, 0);
    }
    // 토큰 줄 — 먹힌 칸은 빈 자리로
    cells.forEach((cell, i) => {
      if (i < tokens.length) drawCell(cell, i, i < s.pos);
    });
    place(cursor, cellX(s.pos), TOK_Y + TOK_H + 4, 1, ms);

    const fall = s.outcome === 'limit';
    const deepestReturned = s.returnedDeepest;
    // 돌아온 함수 — 부른 상자 자리로 올라가며 걷힌다 (한계면 아래에서부터 무너져 내린다)
    for (const f of s.returned) {
      const box = boxes.get(f.id);
      if (!box) throw new Error(`돌아온 함수 #${f.id} 의 상자가 없다 — 앞 걸음에 열리지 않았다`);
      const upY = f.depth > 1 ? slotY(f.depth - 1) : SLOT_Y0 - SLOT_STEP;
      const toY = fall ? slotY(f.depth) + 40 : upY;
      const delay = fall ? Math.round(((deepestReturned - f.depth) / Math.max(1, deepestReturned)) * ms * 0.5) : 0;
      const dur = fall ? Math.round(ms * 0.5) : ms;
      box.rect.setAttribute('stroke', fall ? c.danger : c.border);
      place(box.g, BOX_X, toY, 0, dur, delay);
      boxes.delete(f.id);
      later(dur + delay + 20, () => box.g.remove());
      f.eaten.forEach((i, j) => {
        const chip = chips.get(i);
        const ch = chip ?? chipOf(i);
        if (!chip) {
          enter(ch.g, chipStart(i), chipAt(f.depth, j), Math.round(ms / 2), 1);
        }
        const [cx] = chipAt(f.depth, j);
        place(ch.g, cx, toY + (SLOT_H - CHIP_H) / 2, 0, dur, delay + (chip ? 0 : Math.round(ms / 2)));
        chips.delete(i);
        later(dur + delay + ms + 20, () => ch.g.remove());
      });
    }
    // 열린 함수 — 새 상자는 부른 상자 자리에서 내려온다
    const top = s.stack[s.stack.length - 1];
    for (const f of s.stack) {
      const have = boxes.get(f.id);
      const box = have ?? boxOf(f);
      const y = slotY(f.depth);
      if (have) place(box.g, BOX_X, y, 1, ms);
      else enter(box.g, [BOX_X, f.depth > 1 ? slotY(f.depth - 1) : SLOT_Y0 - SLOT_STEP], [BOX_X, y], ms);
      const active = top !== undefined && f.id === top.id;
      box.rect.setAttribute('stroke', active ? c.primary : c.border);
      box.rect.setAttribute('stroke-width', active ? '2' : '1');
      f.eaten.forEach((i, j) => {
        const have2 = chips.get(i);
        if (have2) place(have2.g, ...chipAt(f.depth, j), 1, ms);
        else enter(chipOf(i).g, chipStart(i), chipAt(f.depth, j), ms, 1);
      });
    }

    // 가장 깊이 선
    if (s.maxDepth > 0) {
      deepestText.textContent = t('label.deepest', 'Deepest: {n}', { n: s.maxDepth });
      place(deepest, BOX_X, slotY(s.maxDepth) + SLOT_H + 2, 1, ms);
    } else {
      place(deepest, BOX_X, SLOT_Y0 - 2, 0, ms);
    }

    // 문법 — 부른 함수의 규칙 틀
    if (s.activeRules.length > 0) {
      const lo = Math.min(...s.activeRules);
      const hi = Math.max(...s.activeRules);
      ruleHiRect.setAttribute('height', String((hi - lo + 1) * RULE_STEP));
      place(ruleHi, GX, RULE_Y0 - 15 + lo * RULE_STEP, 1, ms);
    } else {
      place(ruleHi, GX, RULE_Y0 - 15, 0, ms);
    }

    // 한계 · 돌려줌
    if (s.outcome !== 'running') {
      if (s.result === null) throw new Error('판이 끝났는데 돌려줌이 없다');
      tagText.textContent = String(s.result);
      tagRect.setAttribute('stroke', s.outcome === 'limit' ? c.danger : c.text);
      tagText.setAttribute('fill', s.outcome === 'limit' ? c.danger : c.text);
      enter(tag, [BOX_X + BOX_W - 44, slotY(Math.max(1, deepestReturned)) + 15], [BOX_X + BOX_W - 44, SLOT_Y0 - SLOT_STEP + 15], ms, 1);
      if (s.outcome === 'limit') {
        if (s.refusedDepth === null) throw new Error('한계 판정에 거절된 깊이가 없다');
        ghostText.textContent = `parseExpr  ${t('label.refused', 'depth {n} refused', { n: s.refusedDepth })}`;
        enter(ghost, [BOX_X, LIMIT_Y - SLOT_H], [BOX_X, LIMIT_Y + 6], ms);
        verdictText.textContent = t('verdict.limit', 'Call limit hit');
        verdictRect.setAttribute('stroke', c.danger);
        verdictText.setAttribute('fill', c.danger);
        verdictRect.setAttribute('stroke-dasharray', '6 3');
      } else {
        verdictText.textContent = t('verdict.done', 'Every token eaten');
        verdictRect.setAttribute('stroke', c.text);
        verdictText.setAttribute('fill', c.text);
        verdictRect.setAttribute('stroke-dasharray', 'none');
      }
      returnsText.textContent = t('label.returns', 'parseProgram returns: {n}', { n: s.result });
      enter(verdict, [GX, 320], [GX, 300], ms);
    }

    // 캡션
    if (s.step === 0) {
      caption.textContent = t('caption.start', 'Nothing called yet · reading position {pos}', { pos: s.pos });
    } else if (s.called !== null) {
      caption.textContent = t('caption.call', '#{step}  call {name} at depth {depth} · ate {ate} · returned {ret}', {
        step: s.step, name: s.called.name, depth: s.called.depth, ate: s.ate.length, ret: s.returns,
      });
    } else if (s.outcome === 'accepted') {
      caption.textContent = t('caption.done', '#{step}  ate {ate} · returned {ret} · next is EOF', {
        step: s.step, ate: s.ate.length, ret: s.returns,
      });
    } else {
      if (s.refusedDepth === null) throw new Error('한계 판정에 거절된 깊이가 없다');
      caption.textContent = t('caption.limit', '#{step}  call at depth {depth} refused · limit {limit} · −1 unwinds {ret} returns', {
        step: s.step, depth: s.refusedDepth, limit, ret: s.returns,
      });
    }
  };

  return {
    setRound,
    setStep,
    reset,
    destroy() {
      for (const id of timers.keys()) clearTimeout(id);
      timers.clear();
      while (svg.firstChild) svg.firstChild.remove();
    },
  };
}

export const recursiveDescentStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount,
};
