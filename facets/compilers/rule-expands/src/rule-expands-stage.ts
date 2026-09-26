/**
 * rule-expands 의 무대 — 한 줄로 늘어선 기호 열이 제자리에서 부풀어 오른다.
 *
 * 가장 왼쪽 비단말 칸이 오그라들어 사라지고, 그 자리에서 규칙의 몸이 벌어져 들어선다.
 * 오른쪽 칸들은 몸이 늘어난 만큼 밀려난다. 몸에 자기 이름이 있으면 그 칸이 더 오른쪽에서
 * 다시 선다. 아래에는 목표(토큰 열)가 같은 칸 자리에 깔려 있어, 줄이 어디까지 닿았는지 보인다.
 */
import {
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
import type { RuleExpandsScene } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const SLOT_MAX = 78;
const BOX_GAP = 8;
const BOX_H = 40;
const ROW_Y = 172;
const GRAMMAR_TOP = 36;
const GRAMMAR_LINE = 26;
const CAPTION_Y = 128;
const RULE_Y = 218;
const TOKENS_LABEL_Y = 244;
const TOKEN_Y = 266;
const TOKEN_TEXT_Y = 284;
const MOTION_MS = 400;
const FRAME_MS = 16;

/** 고정폭 글꼴의 글자 폭 — 크기는 토큰에서 */
const MONO_RATIO = 0.6;

function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function ease(p: number): number {
  const c = Math.max(0, Math.min(1, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function band(p: number, from: number, to: number): number {
  return ease((p - from) / (to - from));
}

type Slots = { x0: number; w: number };

function slotsFor(scene: RuleExpandsScene): Slots {
  const n = Math.max(scene.target.length, scene.form.length);
  const w = Math.min(SLOT_MAX, (W - 2 * MARGIN) / n);
  return { x0: (W - n * w) / 2, w };
}

function slotCenter(s: Slots, i: number): number {
  return s.x0 + s.w * (i + 0.5);
}

export const ruleExpandsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const mdPx = parseFloat(fontSizes.md);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opt: { size: string; fill: string; mono?: boolean; weight?: string; anchor?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opt.fill,
          'font-family': opt.mono === true ? fonts.mono : fonts.body,
          'font-size': opt.size,
          'text-anchor': opt.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opt.weight !== undefined) node.setAttribute('font-weight', opt.weight);
      node.textContent = content;
      return node;
    }

    function isNonterminal(scene: RuleExpandsScene, sym: string): boolean {
      return scene.nonterminals.includes(sym);
    }

    /** 기호 칸 하나 — (0,0) 을 가운데로 그린 뒤 바깥 g 의 transform 으로 자리를 잡는다 */
    function symbolBox(parent: Element, scene: RuleExpandsScene, sym: string, boxW: number, self: boolean): SVGGElement {
      const g = el('g', {}, parent);
      const nt = isNonterminal(scene, sym);
      el(
        'rect',
        {
          x: -boxW / 2,
          y: -BOX_H / 2,
          width: boxW,
          height: BOX_H,
          rx: 6,
          fill: self ? colors.accent : nt ? colors.bgSubtle : colors.bg,
          stroke: nt ? colors.primary : colors.border,
          'stroke-width': nt ? 1.5 : 1,
        },
        g,
      );
      write(g, 0, 1, sym, {
        size: fontSizes.md,
        fill: self ? colors.stateInk : nt ? colors.primary : colors.text,
        mono: true,
        weight: nt ? '700' : '400',
        anchor: 'middle',
      });
      return g;
    }

    function place(g: SVGGElement, x: number, scale: number): void {
      const s = Math.max(0, Math.min(1, scale));
      g.setAttribute('transform', `translate(${num(x)} ${num(ROW_Y)}) scale(${num(s)})`);
    }

    type Drawn = { boxes: SVGGElement[]; notes: SVGGElement; slots: Slots };

    function drawGrammar(scene: RuleExpandsScene, layer: Element): void {
      const charW = mdPx * MONO_RATIO;
      const usedId = scene.step?.ruleId ?? null;
      write(layer, MARGIN, GRAMMAR_TOP - 22, t('label.grammar', 'Grammar'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      scene.nonterminals.forEach((lhs, line) => {
        const y = GRAMMAR_TOP + 6 + line * GRAMMAR_LINE;
        let x = MARGIN;
        const head = `${lhs} →`;
        write(layer, x, y, head, { size: fontSizes.md, fill: colors.primary, mono: true, weight: '700' });
        x += (head.length + 1) * charW;
        const alts = scene.rules.filter((r) => r.lhs === lhs);
        alts.forEach((r, j) => {
          if (j > 0) {
            write(layer, x, y, '|', { size: fontSizes.md, fill: colors.textMuted, mono: true });
            x += 2 * charW;
          }
          const body = r.rhs.join(' ');
          const w = body.length * charW;
          const used = r.id === usedId;
          if (used) {
            el('rect', { x: x - 3, y: y - mdPx * 0.75, width: w + 6, height: mdPx * 1.5, rx: 3, fill: colors.accent }, layer);
          }
          write(layer, x, y, body, {
            size: fontSizes.md,
            fill: used ? colors.stateInk : colors.text,
            mono: true,
            weight: used ? '700' : '400',
          });
          write(layer, x + w + 2, y - mdPx * 0.55, r.id, { size: fontSizes.xs, fill: colors.textMuted });
          x += w + (r.id.length * xsPx * 0.6) + charW * 1.5;
        });
      });
    }

    function drawCounters(scene: RuleExpandsScene, layer: Element): void {
      const x = W - MARGIN;
      write(layer, x, GRAMMAR_TOP + 6, t('label.length', 'Symbols in the line: {n}', { n: scene.form.length }), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'end',
      });
      write(layer, x, GRAMMAR_TOP + 6 + GRAMMAR_LINE, t('label.left', 'Nonterminals left: {n}', { n: scene.ntLeft }), {
        size: fontSizes.sm,
        fill: scene.ntLeft === 0 ? colors.textMuted : colors.primary,
        weight: '700',
        anchor: 'end',
      });
    }

    function drawCaption(scene: RuleExpandsScene, layer: Element): void {
      const s = scene.step;
      let line: string;
      if (s === null) {
        line = t('caption.start', 'The line holds only the start symbol: {sym}', { sym: scene.form.join(' ') });
      } else if (scene.ntLeft === 0) {
        line = t('caption.done', '{rule}: {sym} gave way to its body. No nonterminal left, so expanding stops.', {
          rule: s.ruleId,
          sym: s.lhs,
        });
      } else if (s.selfAt.length > 0) {
        line = t('caption.self', '{rule}: {sym} gave way to its body, and the same name stands again further right.', {
          rule: s.ruleId,
          sym: s.lhs,
        });
      } else {
        line = t('caption.plain', '{rule}: {sym} gave way to its body.', { rule: s.ruleId, sym: s.lhs });
      }
      write(layer, MARGIN, CAPTION_Y, line, { size: fontSizes.md, fill: colors.text });
    }

    function drawTokens(scene: RuleExpandsScene, layer: Element, slots: Slots): void {
      write(
        layer,
        MARGIN,
        TOKENS_LABEL_Y,
        t('label.tokens', 'Goal — tokens of {src}: {n}', { src: scene.source, n: scene.tokens.length }),
        { size: fontSizes.xs, fill: colors.textMuted },
      );
      const reached = scene.nextPos < 0 ? scene.form.length : scene.nextPos;
      scene.target.forEach((term, i) => {
        const cx = slotCenter(slots, i);
        const hit = i < reached;
        el(
          'line',
          {
            x1: cx - (slots.w - BOX_GAP) / 2,
            x2: cx + (slots.w - BOX_GAP) / 2,
            y1: TOKEN_Y - smPx,
            y2: TOKEN_Y - smPx,
            stroke: hit ? colors.primary : colors.border,
            'stroke-width': hit ? 2 : 1,
          },
          layer,
        );
        write(layer, cx, TOKEN_Y, term, {
          size: fontSizes.sm,
          fill: hit ? colors.text : colors.textMuted,
          mono: true,
          weight: hit ? '700' : '400',
          anchor: 'middle',
        });
        const tok = scene.tokens[i];
        if (tok === undefined) throw new Error(`rule-expands 무대: 토큰 ${i} 가 없다`);
        write(layer, cx, TOKEN_TEXT_Y, tok.text, { size: fontSizes.xs, fill: colors.textMuted, mono: true, anchor: 'middle' });
      });
    }

    /** 이번 걸음의 표지 — 들어선 몸 아래의 괄호와 쓴 규칙, 다음에 펼칠 칸 위의 표 */
    function drawNotes(scene: RuleExpandsScene, layer: SVGGElement, slots: Slots): void {
      const s = scene.step;
      if (s !== null) {
        const left = slotCenter(slots, s.pos) - (slots.w - BOX_GAP) / 2;
        const right = slotCenter(slots, s.pos + s.bodyLen - 1) + (slots.w - BOX_GAP) / 2;
        const by = ROW_Y + BOX_H / 2 + 7;
        el(
          'path',
          {
            d: `M ${num(left)} ${num(by - 4)} V ${num(by)} H ${num(right)} V ${num(by - 4)}`,
            fill: 'none',
            stroke: colors.itemActive,
            'stroke-width': 1.5,
          },
          layer,
        );
        const rule = scene.rules.find((r) => r.id === s.ruleId);
        if (rule === undefined) throw new Error(`rule-expands 무대: 규칙 ${s.ruleId} 가 없다`);
        const content = `${rule.lhs} → ${rule.rhs.join(' ')}`;
        const charW = smPx * MONO_RATIO;
        const idW = (s.ruleId.length + 1) * charW;
        const w = idW + content.length * charW;
        const mid = (left + right) / 2;
        const x = Math.max(MARGIN, Math.min(W - MARGIN - w, mid - w / 2));
        write(layer, x, RULE_Y, s.ruleId, { size: fontSizes.sm, fill: colors.itemActive, mono: true, weight: '700' });
        write(layer, x + idW, RULE_Y, content, { size: fontSizes.sm, fill: colors.text, mono: true });
      }
      if (scene.nextPos >= 0) {
        const cx = slotCenter(slots, scene.nextPos);
        const ty = ROW_Y - BOX_H / 2 - 6;
        el('path', { d: `M ${num(cx - 6)} ${num(ty - 8)} L ${num(cx + 6)} ${num(ty - 8)} L ${num(cx)} ${num(ty)} Z`, fill: colors.itemActive }, layer);
      }
    }

    function drawStatic(scene: RuleExpandsScene): Drawn {
      svg.textContent = '';
      const slots = slotsFor(scene);
      const back = el('g', {}, svg);
      drawGrammar(scene, back);
      drawCounters(scene, back);
      drawCaption(scene, back);
      drawTokens(scene, back, slots);
      const row = el('g', {}, svg);
      const boxW = slots.w - BOX_GAP;
      const selfAt = scene.step?.selfAt ?? [];
      const boxes = scene.form.map((sym, i) => {
        const g = symbolBox(row, scene, sym, boxW, selfAt.includes(i));
        place(g, slotCenter(slots, i), 1);
        return g;
      });
      const notes = el('g', {}, svg);
      drawNotes(scene, notes, slots);
      return { boxes, notes, slots };
    }

    function frame(mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function inflate(next: RuleExpandsScene, mine: number): Promise<void> {
      const s = next.step;
      if (s === null) return;
      const drawn = drawStatic(next);
      const { boxes, notes, slots } = drawn;
      const grow = s.bodyLen - 1;
      const boxW = slots.w - BOX_GAP;
      // 사라지는 이름 — 펼치기 전 칸 자리에서 오그라든다
      const ghostLayer = el('g', {}, svg);
      const ghost = symbolBox(ghostLayer, next, s.lhs, boxW, false);
      const origin = slotCenter(slots, s.pos);

      const paint = (p: number): void => {
        place(ghost, origin, 1 - band(p, 0, 0.45));
        const spread = band(p, 0.2, 1);
        boxes.forEach((g, i) => {
          const to = slotCenter(slots, i);
          if (i < s.pos) return;
          if (i < s.pos + s.bodyLen) {
            place(g, origin + (to - origin) * spread, spread);
            return;
          }
          const from = slotCenter(slots, i - grow);
          place(g, from + (to - from) * band(p, 0, 0.85), 1);
        });
        notes.setAttribute('opacity', num(band(p, 0.7, 1)));
      };

      paint(0);
      const started = Date.now();
      for (;;) {
        if (!(await frame(mine))) return;
        const p = (Date.now() - started) / MOTION_MS;
        if (p >= 1) break;
        paint(p);
      }
      drawStatic(next);
    }

    function follows(next: RuleExpandsScene, prev: RuleExpandsScene | null): boolean {
      if (prev === null || next.step === null) return false;
      const prevK = prev.step === null ? 0 : prev.step.k;
      return prevK + 1 === next.step.k && prev.form.length + next.step.bodyLen - 1 === next.form.length;
    }

    return {
      render(next: RuleExpandsScene, prev: RuleExpandsScene | null, opts: { animate: boolean }): Promise<void> | void {
        if (destroyed) return;
        const mine = (gen += 1);
        if (!opts.animate || !follows(next, prev)) {
          drawStatic(next);
          return;
        }
        return inflate(next, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
