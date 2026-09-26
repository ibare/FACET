/**
 * cascade-priority 의 무대.
 *
 * 왼쪽에 요소·부모·조상(body·html) 사슬을 세로로 두고(위가 html, 아래가 요소 —
 * "거슬러 올라간다" 는 방향을 물리적 위쪽으로 그린다), 오른쪽에 규칙 다섯 카드를
 * 원본 차례로 둔다. 카드는 상태(후보/아님·맞음/아님)에 따라 테두리·불투명도가
 * 바뀌고, "자리를 쥔 규칙" 이 되면 카드 자신이 왼쪽 아래의 held 자리로 옮겨 간다
 * (재그리기가 아니라 같은 노드의 transform 을 튠다). 다른 규칙에 밀리면 제 home
 * 자리로 되돌아간다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 640;
const HEIGHT = 420;

const CHAIN_X = 40;
const CHAIN_W = 220;
const CHAIN_H = 48;
const CHAIN_Y = { html: 24, body: 92, parent: 160, element: 228 } as const;

const HELD_X = CHAIN_X;
const HELD_Y = 300;
const HELD_W = CHAIN_W;
const HELD_H = 54;

const CARD_X = 300;
const CARD_W = 280;
const CARD_H = 54;
const CARD_GAP = 74;
const CARD_Y0 = 24;

const MOVE_MS = 360;

type RuleCard = {
  id: number;
  g: SVGGElement;
  rect: SVGRectElement;
  selectorText: SVGTextElement;
  weightText: SVGTextElement;
  statusText: SVGTextElement;
  homeX: number;
  homeY: number;
};

type RuleInfo = { id: number; selector: string; weight: number };

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag);
}

function specTriple(weight: number): string {
  const a = Math.floor(weight / 100);
  const b = Math.floor((weight % 100) / 10);
  const c = weight % 10;
  return `(${a},${b},${c})`;
}

class CascadePriorityScene {
  private readonly svg: SVGSVGElement;
  private readonly colors: Palette;
  private readonly t: Translate;
  private readonly cards = new Map<number, RuleCard>();
  private readonly rafIds = new Set<number>();

  private readonly elementBox: { rect: SVGRectElement; text: SVGTextElement; role: SVGTextElement };
  private readonly parentBox: { rect: SVGRectElement; text: SVGTextElement; role: SVGTextElement };

  constructor(canvas: SVGSVGElement, params: ViewMountParams) {
    this.svg = canvas;
    this.colors = getColors(params.theme);
    this.t = params.t ?? makeTranslator(params.locale);
    this.svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    this.svg.setAttribute('font-family', fonts.body);

    const bg = el('rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(WIDTH));
    bg.setAttribute('height', String(HEIGHT));
    bg.setAttribute('fill', this.colors.bg);
    this.svg.appendChild(bg);

    this.drawCaption(CHAIN_X, 12, this.t('caption.chainHeading', 'Element and ancestors'));
    this.drawCaption(CARD_X, 12, this.t('caption.rulesHeading', 'Rules (source order)'));
    this.drawCaption(HELD_X, HELD_Y - 12, this.t('caption.heldSlot', 'Rule currently in place'));

    this.connect(CHAIN_X + CHAIN_W / 2, CHAIN_Y.html + CHAIN_H, CHAIN_X + CHAIN_W / 2, CHAIN_Y.body);
    this.connect(CHAIN_X + CHAIN_W / 2, CHAIN_Y.body + CHAIN_H, CHAIN_X + CHAIN_W / 2, CHAIN_Y.parent);
    this.connect(CHAIN_X + CHAIN_W / 2, CHAIN_Y.parent + CHAIN_H, CHAIN_X + CHAIN_W / 2, CHAIN_Y.element);

    this.drawStaticBox(CHAIN_Y.html, 'html');
    this.drawStaticBox(CHAIN_Y.body, 'body');
    this.parentBox = this.drawRoleBox(CHAIN_Y.parent, this.t('label.parent', 'Parent'));
    this.elementBox = this.drawRoleBox(CHAIN_Y.element, this.t('label.element', 'Element'));

    const heldRect = el('rect');
    heldRect.setAttribute('x', String(HELD_X));
    heldRect.setAttribute('y', String(HELD_Y));
    heldRect.setAttribute('width', String(HELD_W));
    heldRect.setAttribute('height', String(HELD_H));
    heldRect.setAttribute('rx', '6');
    heldRect.setAttribute('fill', 'none');
    heldRect.setAttribute('stroke', this.colors.border);
    heldRect.setAttribute('stroke-dasharray', '4 4');
    this.svg.appendChild(heldRect);
  }

  private drawCaption(x: number, y: number, text: string): void {
    const t = el('text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('font-size', fontSizes.sm);
    t.setAttribute('fill', this.colors.textMuted);
    t.textContent = text;
    this.svg.appendChild(t);
  }

  private connect(x1: number, y1: number, x2: number, y2: number): void {
    const line = el('line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', this.colors.border);
    this.svg.appendChild(line);
  }

  private drawStaticBox(y: number, tag: string): void {
    const g = el('g');
    const rect = el('rect');
    rect.setAttribute('x', String(CHAIN_X));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(CHAIN_W));
    rect.setAttribute('height', String(CHAIN_H));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', this.colors.bgSubtle);
    rect.setAttribute('stroke', this.colors.border);
    const text = el('text');
    text.setAttribute('x', String(CHAIN_X + CHAIN_W / 2));
    text.setAttribute('y', String(y + CHAIN_H / 2 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', fonts.mono);
    text.setAttribute('font-size', fontSizes.md);
    text.setAttribute('fill', this.colors.text);
    text.textContent = `<${tag}>`;
    g.appendChild(rect);
    g.appendChild(text);
    this.svg.appendChild(g);
  }

  private drawRoleBox(y: number, role: string): { rect: SVGRectElement; text: SVGTextElement; role: SVGTextElement } {
    const g = el('g');
    const rect = el('rect');
    rect.setAttribute('x', String(CHAIN_X));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(CHAIN_W));
    rect.setAttribute('height', String(CHAIN_H));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', this.colors.bgSubtle);
    rect.setAttribute('stroke', this.colors.border);
    rect.setAttribute('stroke-width', '2');
    const roleText = el('text');
    roleText.setAttribute('x', String(CHAIN_X + 6));
    roleText.setAttribute('y', String(y - 6));
    roleText.setAttribute('font-size', fontSizes.xs);
    roleText.setAttribute('fill', this.colors.textMuted);
    roleText.textContent = role;
    const text = el('text');
    text.setAttribute('x', String(CHAIN_X + CHAIN_W / 2));
    text.setAttribute('y', String(y + CHAIN_H / 2 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', fonts.mono);
    text.setAttribute('font-size', fontSizes.md);
    text.setAttribute('fill', this.colors.text);
    g.appendChild(rect);
    g.appendChild(roleText);
    g.appendChild(text);
    this.svg.appendChild(g);
    return { rect, text, role: roleText };
  }

  private homeOf(index: number): { x: number; y: number } {
    return { x: CARD_X, y: CARD_Y0 + index * CARD_GAP };
  }

  /** 카드 다섯을 처음(또는 다시) 그린다. 이미 있으면 자리·글자만 되돌린다. */
  private ensureCards(rules: RuleInfo[]): void {
    rules.forEach((rule, index) => {
      const existing = this.cards.get(rule.id);
      const home = this.homeOf(index);
      if (existing) {
        existing.homeX = home.x;
        existing.homeY = home.y;
        existing.selectorText.textContent = rule.selector;
        existing.weightText.textContent = specTriple(rule.weight);
        return;
      }
      const g = el('g');
      g.setAttribute('transform', `translate(${home.x},${home.y})`);
      const rect = el('rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(CARD_W));
      rect.setAttribute('height', String(CARD_H));
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', this.colors.bgSubtle);
      rect.setAttribute('stroke', this.colors.border);
      rect.setAttribute('stroke-width', '2');
      const selectorText = el('text');
      selectorText.setAttribute('x', '10');
      selectorText.setAttribute('y', '22');
      selectorText.setAttribute('font-family', fonts.mono);
      selectorText.setAttribute('font-size', fontSizes.md);
      selectorText.setAttribute('fill', this.colors.text);
      selectorText.textContent = rule.selector;
      const weightText = el('text');
      weightText.setAttribute('x', '10');
      weightText.setAttribute('y', '42');
      weightText.setAttribute('font-family', fonts.mono);
      weightText.setAttribute('font-size', fontSizes.xs);
      weightText.setAttribute('fill', this.colors.textMuted);
      weightText.textContent = specTriple(rule.weight);
      const statusText = el('text');
      statusText.setAttribute('x', String(CARD_W - 10));
      statusText.setAttribute('y', '22');
      statusText.setAttribute('text-anchor', 'end');
      statusText.setAttribute('font-size', fontSizes.xs);
      statusText.setAttribute('fill', this.colors.textMuted);
      g.appendChild(rect);
      g.appendChild(selectorText);
      g.appendChild(weightText);
      g.appendChild(statusText);
      this.svg.appendChild(g);
      this.cards.set(rule.id, {
        id: rule.id,
        g,
        rect,
        selectorText,
        weightText,
        statusText,
        homeX: home.x,
        homeY: home.y,
      });
    });
  }

  private moveTo(card: RuleCard, x: number, y: number, speedMul: number): void {
    const start = { x: 0, y: 0 };
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(card.g.getAttribute('transform') ?? '');
    start.x = m ? Number(m[1]) : card.homeX;
    start.y = m ? Number(m[2]) : card.homeY;
    const duration = Math.max(60, MOVE_MS / Math.max(0.25, speedMul));
    const startTime = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - p) * (1 - p);
      const cx = start.x + (x - start.x) * eased;
      const cy = start.y + (y - start.y) * eased;
      card.g.setAttribute('transform', `translate(${cx},${cy})`);
      if (p < 1) {
        const id = requestAnimationFrame(step);
        this.rafIds.add(id);
      }
    };
    const id = requestAnimationFrame(step);
    this.rafIds.add(id);
  }

  initRound(elementMarkup: string, parentMarkup: string, rules: RuleInfo[]): void {
    this.elementBox.text.textContent = elementMarkup;
    this.parentBox.text.textContent = parentMarkup;
    this.elementBox.rect.setAttribute('stroke', this.colors.border);
    this.elementBox.rect.setAttribute('stroke-width', '2');
    this.ensureCards(rules);
    for (const card of this.cards.values()) {
      card.g.setAttribute('transform', `translate(${card.homeX},${card.homeY})`);
      card.rect.setAttribute('stroke', this.colors.border);
      card.rect.setAttribute('fill', this.colors.bgSubtle);
      card.rect.setAttribute('opacity', '1');
      card.statusText.textContent = '';
    }
  }

  setCandidates(ids: number[]): void {
    const set = new Set(ids);
    for (const card of this.cards.values()) {
      if (set.has(card.id)) {
        card.rect.setAttribute('stroke', this.colors.accent);
        card.rect.setAttribute('opacity', '1');
        card.statusText.textContent = this.t('label.candidate', 'candidate');
      } else {
        card.rect.setAttribute('opacity', '0.35');
        card.statusText.textContent = this.t('label.notCandidate', 'not a candidate');
      }
    }
  }

  setJudged(ruleId: number, matched: boolean): void {
    const card = this.cards.get(ruleId);
    if (!card) throw new Error(`알 수 없는 카드: ${ruleId}`);
    if (matched) {
      card.rect.setAttribute('stroke', this.colors.itemComparing);
      card.statusText.textContent = this.t('label.matched', 'matched');
    } else {
      card.rect.setAttribute('opacity', '0.35');
      card.rect.setAttribute('stroke', this.colors.border);
      card.statusText.textContent = this.t('label.unmatched', 'not matched');
    }
  }

  setHeld(ruleId: number, prevId: number | null, speedMul: number): void {
    const card = this.cards.get(ruleId);
    if (!card) throw new Error(`알 수 없는 카드: ${ruleId}`);
    if (prevId !== null && prevId !== ruleId) {
      const prev = this.cards.get(prevId);
      if (prev) {
        prev.rect.setAttribute('stroke', this.colors.itemComparing);
        prev.rect.setAttribute('fill', this.colors.bgSubtle);
        prev.statusText.textContent = this.t('label.matched', 'matched');
        this.moveTo(prev, prev.homeX, prev.homeY, speedMul);
      }
    }
    card.rect.setAttribute('stroke', this.colors.primary);
    card.rect.setAttribute('fill', this.colors.itemActive);
    card.statusText.textContent = this.t('label.held', 'in place');
    this.moveTo(card, HELD_X, HELD_Y, speedMul);
  }

  assignValue(value: string): void {
    this.elementBox.rect.setAttribute('stroke', value);
    this.elementBox.rect.setAttribute('stroke-width', '4');
  }

  destroy(): void {
    for (const id of this.rafIds) cancelAnimationFrame(id);
    this.rafIds.clear();
  }
}

/** 마운트 직후(첫 round-init 전) 미리보기용 — 실제 표기는 algorithm 이 만들어 보낸다. */
function previewMarkup(mark: number, parent: number): { element: string; parent: string } {
  const id = mark === 2 || mark === 3 ? ' id="lead"' : '';
  const cls = mark === 1 || mark === 3 ? ' class="note"' : '';
  const parentCls = parent === 1 ? ' class="card"' : '';
  return { element: `<p${id}${cls}>`, parent: `<div${parentCls}>` };
}

export const cascadePriorityStageView: CanvasView = {
  canvas: { width: WIDTH, height: HEIGHT, fit: 'fill' },
  mount(_container, params): ViewInstance {
    const scene = new CascadePriorityScene(params.canvas, params);
    const initial = params.initialData as
      | { mark?: unknown; parent?: unknown; rules?: unknown }
      | undefined;
    if (initial && Array.isArray(initial.rules)) {
      const rules = initial.rules as Array<{ id: number; selector: string; parts: string[] }>;
      const weightOf = (parts: string[]): number => {
        let idc = 0;
        let clc = 0;
        let tgc = 0;
        for (const p of parts) {
          if (p === 'id') idc += 1;
          if (p === 'class') clc += 1;
          if (p === 'tag') tgc += 1;
        }
        return idc * 100 + clc * 10 + tgc;
      };
      const infos: RuleInfo[] = rules.map((r) => ({ id: r.id, selector: r.selector, weight: weightOf(r.parts) }));
      const mark = typeof initial.mark === 'number' ? initial.mark : 0;
      const parent = typeof initial.parent === 'number' ? initial.parent : 0;
      const markup = previewMarkup(mark, parent);
      scene.initRound(markup.element, markup.parent, infos);
    }
    return {
      initRound: (elementMarkup: string, parentMarkup: string, rules: RuleInfo[]) =>
        scene.initRound(elementMarkup, parentMarkup, rules),
      setCandidates: (ids: number[]) => scene.setCandidates(ids),
      setJudged: (ruleId: number, matched: boolean) => scene.setJudged(ruleId, matched),
      setHeld: (ruleId: number, prevId: number | null, speedMul: number) => scene.setHeld(ruleId, prevId, speedMul),
      assignValue: (value: string) => scene.assignValue(value),
      destroy: () => scene.destroy(),
    };
  },
};
