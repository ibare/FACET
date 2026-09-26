import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { CascadeConflictScene, SceneNode, SceneRule, SceneWeight } from './scene.js';

/**
 * 규칙 카드가 스타일시트 줄에서 나와 오른쪽 "자리" 로 들어간다. 무거우면 앉고, 앉아 있던
 * 카드는 제 줄로 밀려 돌아간다. 가벼우면 자리에 부딪혀 제 줄로 튕겨 돌아간다.
 * 마지막에는 자리에 앉은 카드의 선언이 요소 상자로 올라가 붙는다.
 */

const H = 350;
const W = PIECE_CANVAS_W;
const M = 16;
const GAP = 20;
const CARD_W = Math.floor((W - 2 * M - GAP) / 2);
const LEFT_X = M;
const RIGHT_X = W - M - CARD_W;

const HEAD_Y = 22;
const LIST_TOP = 34;
const LIST_BOTTOM = 290;
const MAX_CARD_H = 40;
const MAX_ROW_STEP = 50;

const BOX_Y = 34;
const BOX_H = 84;
const SEAT_LABEL_Y = 140;
const SEAT_Y = 148;
const CMP_LABEL_Y = 212;
const CMP_COL_Y = 228;
const CMP_ROW1_Y = 234;
const CMP_ROW_H = 20;
const CMP_ROW_GAP = 4;
const CMP_COL_W = 44;
const CAPTION_Y = 326;
const CAPTION_LINE = 18;

const CELL_W = 22;
const CELL_H = 20;

const MOVE_MS = 640;
const FRAME_MS = 16;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
const LG = parseFloat(fontSizes.lg);

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  name: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Attrs): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = s;
  return node;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function shift(g: SVGGElement, dx: number, dy: number): void {
  const x = round(dx);
  const y = round(dy);
  if (x === 0 && y === 0) g.removeAttribute('transform');
  else g.setAttribute('transform', `translate(${x} ${y})`);
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
}

function phase(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

function weightText(w: SceneWeight): string {
  return `(${w[0]},${w[1]},${w[2]})`;
}

function nodeName(n: SceneNode): string {
  return `${n.tag}${n.id === null ? '' : `#${n.id}`}${n.classes.map((c) => `.${c}`).join('')}`;
}

function openTag(n: SceneNode): string {
  const id = n.id === null ? '' : ` id="${n.id}"`;
  const cls = n.classes.length === 0 ? '' : ` class="${n.classes.join(' ')}"`;
  return `<${n.tag}${id}${cls}>`;
}

function declText(r: SceneRule): string {
  return `${r.prop}: ${r.value};`;
}

/** 캡션 폭 어림 — 한글 · 한자권 글자는 한 칸, 나머지는 반 칸 남짓. */
function roughWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? px : px * 0.56;
  return w;
}

function splitCaption(s: string, px: number, max: number): string[] {
  if (roughWidth(s, px) <= max) return [s];
  const chars = [...s];
  const mid = chars.length / 2;
  let best = -1;
  chars.forEach((ch, i) => {
    if (ch === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  });
  if (best < 0) best = Math.floor(mid);
  const first = chars.slice(0, best).join('').trimEnd();
  const second = chars.slice(best).join('').trimStart();
  return [first, second];
}

/** 맞댄 규칙의 무게는 이미 드러나 있어야 한다 — 없으면 장면이 틀린 것이다. */
function knownWeight(scene: CascadeConflictScene, order: number): SceneWeight {
  const w = scene.weights[order - 1];
  if (w === undefined || w === null) {
    throw new Error(`cascade-conflict stage: 규칙 #${order} 의 무게가 장면에 없다`);
  }
  return w;
}

type Handles = {
  cards: Map<number, SVGGElement>;
  applied: SVGGElement | null;
};

export const cascadeConflictStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function rowGeometry(n: number): { step: number; cardH: number } {
      const step = Math.min(MAX_ROW_STEP, (LIST_BOTTOM - LIST_TOP) / Math.max(1, n));
      return { step, cardH: Math.min(MAX_CARD_H, step - 8) };
    }

    function rowY(order: number, n: number): number {
      return round(LIST_TOP + (order - 1) * rowGeometry(n).step);
    }

    type CardState = 'waiting' | 'holder' | 'displaced' | 'blocked';

    function drawCard(
      layer: Element,
      rule: SceneRule,
      weight: SceneWeight | null,
      x: number,
      y: number,
      cardH: number,
      state: CardState,
      fresh: boolean,
    ): SVGGElement {
      const g = el(layer, 'g', {});
      const lost = state === 'displaced' || state === 'blocked';
      const stroke = fresh && lost ? c.itemSwapping : state === 'holder' ? c.primary : c.border;
      el(g, 'rect', {
        x,
        y,
        width: CARD_W,
        height: cardH,
        rx: 6,
        fill: state === 'holder' ? c.bgSubtle : c.bg,
        stroke,
        'stroke-width': state === 'holder' || (fresh && lost) ? 2 : 1,
      });
      const ink = lost ? c.textMuted : c.text;
      const top = y + cardH / 2;
      label(g, x + 10, round(top - 3), `#${rule.order}`, {
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': XS,
      });
      label(g, x + 36, round(top - 3), rule.selector, {
        fill: ink,
        'font-family': fonts.mono,
        'font-size': SM,
        'font-weight': state === 'holder' ? 600 : 400,
      });
      const decl = label(g, x + 36, round(top + 12), declText(rule), {
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': XS,
      });
      if (lost) decl.setAttribute('text-decoration', 'line-through');
      if (lost) {
        const mark =
          state === 'displaced'
            ? t('mark.displaced', 'seat taken')
            : t('mark.blocked', 'pushed out');
        label(g, x + CARD_W - 3 * CELL_W - 16, round(top + 12), mark, {
          fill: fresh ? c.itemSwapping : c.textMuted,
          'font-family': fonts.body,
          'font-size': XS,
          'text-anchor': 'end',
        });
      }
      const cellsX = x + CARD_W - 3 * CELL_W - 10;
      const cellY = round(top - CELL_H / 2);
      for (let k = 0; k < 3; k += 1) {
        const cx = cellsX + k * CELL_W;
        el(g, 'rect', {
          x: cx,
          y: cellY,
          width: CELL_W,
          height: CELL_H,
          fill: 'none',
          stroke: c.border,
        });
        const v = weight === null ? '·' : String(weight[k]);
        label(g, cx + CELL_W / 2, cellY + CELL_H / 2 + 4, v, {
          fill: weight === null ? c.textMuted : ink,
          'font-family': fonts.mono,
          'font-size': SM,
          'text-anchor': 'middle',
        });
      }
      return g;
    }

    function drawStatic(scene: CascadeConflictScene): Handles {
      svg.textContent = '';
      const n = scene.rules.length;
      const { cardH } = rowGeometry(n);
      const step = scene.step;
      const cards = new Map<number, SVGGElement>();

      label(svg, LEFT_X, HEAD_Y, t('label.sheet', 'Stylesheet, in source order'), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': SM,
      });
      label(svg, RIGHT_X, HEAD_Y, t('label.element', 'The element'), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': SM,
      });

      // 요소 상자 — 조상은 바깥 상자의 이름으로, 대상은 여는 태그로.
      const target = scene.path[scene.path.length - 1] as SceneNode;
      const ancestors = scene.path.slice(0, -1).map(nodeName).join(' ');
      el(svg, 'rect', {
        x: RIGHT_X,
        y: BOX_Y,
        width: CARD_W,
        height: BOX_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: c.border,
      });
      label(svg, RIGHT_X + 10, BOX_Y + 14, ancestors, {
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': XS,
      });
      const innerX = RIGHT_X + 12;
      const innerY = BOX_Y + 22;
      const innerW = CARD_W - 24;
      el(svg, 'rect', {
        x: innerX,
        y: innerY,
        width: innerW,
        height: BOX_H - 30,
        rx: 4,
        fill: c.bg,
        stroke: c.border,
      });
      label(svg, innerX + 10, innerY + 17, openTag(target), {
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': SM,
      });
      const slotY = innerY + 24;
      const slotH = 22;
      const winner = scene.applied === null ? null : (scene.rules[scene.applied - 1] as SceneRule);
      el(svg, 'rect', {
        x: innerX + 8,
        y: slotY,
        width: innerW - 16,
        height: slotH,
        rx: 3,
        fill: 'none',
        stroke: winner === null ? c.border : c.success,
        'stroke-width': winner === null ? 1 : 2,
        'stroke-dasharray': winner === null ? '4 3' : 'none',
      });
      let applied: SVGGElement | null = null;
      if (winner !== null) {
        applied = el(svg, 'g', {});
        label(applied, innerX + 18, slotY + 15, declText(winner), {
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': SM,
          'font-weight': 600,
        });
      }

      // 자리
      label(svg, RIGHT_X, SEAT_LABEL_Y, t('label.seat', 'Holds the seat'), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': SM,
      });
      el(svg, 'rect', {
        x: RIGHT_X,
        y: SEAT_Y,
        width: CARD_W,
        height: cardH,
        rx: 6,
        fill: 'none',
        stroke: c.border,
        'stroke-dasharray': '4 3',
      });

      // 스타일시트 줄 — 자리에 앉은 카드의 줄은 빈 틀만 남는다.
      const lostHow = new Map(scene.lost.map((l) => [l.order, l.how] as const));
      const freshLoser =
        step.kind === 'duel' ? (step.verdict === 'lighter' ? step.order : step.holder) : null;
      const listLayer = el(svg, 'g', {});
      const seatLayer = el(svg, 'g', {});
      for (const rule of scene.rules) {
        const y = rowY(rule.order, n);
        const weight = scene.weights[rule.order - 1] ?? null;
        if (scene.holder === rule.order) {
          el(listLayer, 'rect', {
            x: LEFT_X,
            y,
            width: CARD_W,
            height: cardH,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 3',
          });
          label(listLayer, LEFT_X + 10, round(y + cardH / 2 - 3), `#${rule.order}`, {
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': XS,
          });
          cards.set(rule.order, drawCard(seatLayer, rule, weight, RIGHT_X, SEAT_Y, cardH, 'holder', false));
          continue;
        }
        const how = lostHow.get(rule.order);
        const state: CardState = how ?? 'waiting';
        cards.set(
          rule.order,
          drawCard(listLayer, rule, weight, LEFT_X, y, cardH, state, freshLoser === rule.order),
        );
      }

      // 맞댐 — 들어온 무게와 쥔 무게를 칸마다 나란히.
      if (step.kind === 'duel') {
        const wIn = knownWeight(scene, step.order);
        const wHeld = knownWeight(scene, step.holder);
        label(svg, RIGHT_X, CMP_LABEL_Y, t('label.compare', 'Weights, compared ID → class → tag'), {
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': SM,
        });
        const colsX = RIGHT_X + CARD_W - 3 * CMP_COL_W;
        const colNames = [t('col.a', 'ID'), t('col.b', 'class'), t('col.c', 'tag')];
        colNames.forEach((name, k) => {
          label(svg, colsX + k * CMP_COL_W + CMP_COL_W / 2, CMP_COL_Y, name, {
            fill: c.textMuted,
            'font-family': fonts.body,
            'font-size': XS,
            'text-anchor': 'middle',
          });
        });
        const row2Y = CMP_ROW1_Y + CMP_ROW_H + CMP_ROW_GAP;
        const rows: [string, SceneRule, SceneWeight, number][] = [
          [
            t('label.in', 'In #{n}', { n: step.order }),
            scene.rules[step.order - 1] as SceneRule,
            wIn,
            CMP_ROW1_Y,
          ],
          [
            t('label.held', 'Held #{n}', { n: step.holder }),
            scene.rules[step.holder - 1] as SceneRule,
            wHeld,
            row2Y,
          ],
        ];
        for (const [who, rule, w, y] of rows) {
          label(svg, RIGHT_X, y + 14, who, {
            fill: c.text,
            'font-family': fonts.body,
            'font-size': SM,
          });
          label(svg, RIGHT_X + 72, y + 14, rule.selector, {
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': SM,
          });
          for (let k = 0; k < 3; k += 1) {
            const decisive = step.column === k;
            label(svg, colsX + k * CMP_COL_W + CMP_COL_W / 2, y + 15, String(w[k]), {
              fill: decisive ? c.text : c.textMuted,
              'font-family': fonts.mono,
              'font-size': decisive ? MD : SM,
              'font-weight': decisive ? 700 : 400,
              'text-anchor': 'middle',
            });
          }
        }
        if (step.column !== null) {
          el(svg, 'rect', {
            x: colsX + step.column * CMP_COL_W + 4,
            y: CMP_ROW1_Y - 1,
            width: CMP_COL_W - 8,
            height: 2 * CMP_ROW_H + CMP_ROW_GAP + 2,
            rx: 4,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 2,
          });
        }
        const sign = step.verdict === 'heavier' ? '>' : step.verdict === 'equal' ? '=' : '<';
        label(svg, colsX - 12, round(CMP_ROW1_Y + CMP_ROW_H + CMP_ROW_GAP / 2 + 6), sign, {
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': LG,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
      }

      // 캡션 — 지금 일어난 일만.
      const caption = captionFor(scene);
      splitCaption(caption, MD, W - 2 * M).forEach((line, i) => {
        label(svg, M, CAPTION_Y + i * CAPTION_LINE - 9, line, {
          fill: c.text,
          'font-family': fonts.body,
          'font-size': MD,
        });
      });

      return { cards, applied };
    }

    function captionFor(scene: CascadeConflictScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        const prop = (scene.rules[0] as SceneRule).prop;
        return t('caption.start', 'Rules setting {prop} on this element: {n}. No rule holds the seat yet.', {
          prop,
          n: scene.rules.length,
        });
      }
      if (step.kind === 'take') {
        return t('caption.take', 'Rule #{n} comes first and takes the empty seat.', { n: step.order });
      }
      if (step.kind === 'duel') {
        const vars = {
          n: step.order,
          w: weightText(knownWeight(scene, step.order)),
          h: step.holder,
          hw: weightText(knownWeight(scene, step.holder)),
        };
        if (step.verdict === 'heavier') {
          return t('caption.heavier', 'Rule #{n} {w} is heavier than #{h} {hw}. It takes the seat.', vars);
        }
        if (step.verdict === 'equal') {
          return t(
            'caption.equal',
            'Rule #{n} {w} weighs the same as #{h} {hw}. The later one takes the seat.',
            vars,
          );
        }
        return t(
          'caption.lighter',
          'Rule #{n} {w} is lighter than #{h} {hw}. It came later and is still pushed out.',
          vars,
        );
      }
      const winner = scene.rules[step.order - 1] as SceneRule;
      return t('caption.apply', 'Rule #{n} kept the seat: {decl} is applied. Seat taken: {s} · pushed out: {k}.', {
        n: step.order,
        decl: declText(winner),
        s: step.swaps,
        k: step.kept,
      });
    }

    function clock(ms: number, frame: (p: number) => void, alive: () => boolean): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive()) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(
        next: CascadeConflictScene,
        _prev: CascadeConflictScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        const n = next.rules.length;
        const step = next.step;
        const moves: ((p: number) => void)[] = [];
        const toTop = (g: SVGGElement): void => {
          svg.appendChild(g);
        };

        if (step.kind === 'take') {
          const g = h.cards.get(step.order);
          if (g !== undefined) {
            toTop(g);
            const dx = LEFT_X - RIGHT_X;
            const dy = rowY(step.order, n) - SEAT_Y;
            moves.push((p) => {
              const k = 1 - ease(p);
              shift(g, dx * k, dy * k);
            });
          }
        } else if (step.kind === 'duel') {
          const incoming = h.cards.get(step.order);
          const held = h.cards.get(step.holder);
          if (step.verdict === 'lighter') {
            // 자리 앞까지 가서 부딪히고 제 줄로 튕겨 돌아온다. 정적 자리는 제 줄이다.
            if (incoming !== undefined) {
              toTop(incoming);
              const dx = RIGHT_X - 44 - LEFT_X;
              const dy = SEAT_Y - rowY(step.order, n);
              moves.push((p) => {
                const k = p < 0.5 ? ease(p / 0.5) : 1 - ease((p - 0.5) / 0.5);
                shift(incoming, dx * k, dy * k);
              });
            }
            if (held !== undefined) {
              moves.push((p) => {
                const hit = Math.max(0, 1 - Math.abs(p - 0.5) / 0.12);
                shift(held, 6 * hit, 0);
              });
            }
          } else {
            // 들어온 카드가 자리에 앉고, 앉아 있던 카드는 제 줄로 밀려 돌아간다.
            if (held !== undefined) {
              const dx = RIGHT_X - LEFT_X;
              const dy = SEAT_Y - rowY(step.holder, n);
              moves.push((p) => {
                const k = 1 - ease(phase(p, 0.35, 1));
                shift(held, dx * k, dy * k);
              });
            }
            if (incoming !== undefined) {
              toTop(incoming);
              const dx = LEFT_X - RIGHT_X;
              const dy = rowY(step.order, n) - SEAT_Y;
              moves.push((p) => {
                const k = 1 - ease(phase(p, 0, 0.65));
                shift(incoming, dx * k, dy * k);
              });
            }
          }
        } else if (step.kind === 'apply' && h.applied !== null) {
          // 자리에 앉은 카드의 선언이 요소 상자 안으로 올라가 붙는다.
          const g = h.applied;
          toTop(g);
          const { cardH } = rowGeometry(n);
          const fromX = RIGHT_X + 36;
          const fromY = SEAT_Y + cardH / 2 + 12;
          const toX = RIGHT_X + 12 + 18;
          const toY = BOX_Y + 22 + 24 + 15;
          moves.push((p) => {
            const k = 1 - ease(p);
            shift(g, (fromX - toX) * k, (fromY - toY) * k);
          });
        }

        if (moves.length === 0) return;
        const alive = (): boolean => mine === gen && !destroyed;
        await clock(
          MOVE_MS,
          (p) => {
            for (const m of moves) m(p);
          },
          alive,
        );
        if (!alive()) return;
        drawStatic(next);
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
