/**
 * table-per-scope 의 그림.
 *
 * 왼쪽은 원시 프로그램과 읽는 자리, 오른쪽은 표 더미. 동사는 "얹고 적고 걷는다" —
 *   - 얹기: 새 표가 위에서 내려와 더미 맨 위에 놓인다
 *   - 적기: 선언된 이름이 그 줄의 글자 자리에서 날아가 맨 위 표의 새 줄이 된다
 *   - 걷기: 맨 위 표가 적힌 줄째로 들려 치워진다
 * 더미에 있는 표마다 프로그램 옆에 그 몸의 범위를 같은 색 막대로 둔다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate } from '@ffacet/core/runtime';
import type { ScopeTable, SceneLine, TablePerScopeScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOTION_MS = 380;
const DROP = 56;
const FRAME_MS = 16;

type El = SVGElement;

function el(tag: string, attrs: Record<string, string | number>, parent?: El): El {
  const node = document.createElementNS(SVG_NS, tag) as El;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 표 하나의 크기 — 머리 칸 · 줄 칸 · 아래 여백. 빈 표도 한 줄 칸을 둔다. */
type CardMetrics = { head: number; row: number; pad: number; gap: number };

function cardHeight(t: ScopeTable, m: CardMetrics): number {
  return m.head + Math.max(1, t.rows.length) * m.row + m.pad;
}

export const tablePerScopeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const charW = smPx * 0.6;

    // 왼쪽 — 프로그램
    const codeTop = 48;
    const codeBottom = H - 14;
    const barX0 = 10;
    const barStep = 6;
    const cursorX = 34;
    const numX = 64;
    const codeX = 74;
    // 오른쪽 — 표 더미
    const stackX0 = Math.round(W * 0.47);
    const stackX1 = W - 16;
    const cardW = Math.min(250, stackX1 - stackX0);
    const cardX = Math.round(stackX0 + (stackX1 - stackX0 - cardW) / 2);
    const pileBottom = H - 36;
    const pileTopLimit = codeTop + 4;
    const countY = H - 14;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function clear(): void {
      svg.textContent = '';
    }

    function lineH(n: number): number {
      if (n <= 0) return 22;
      return Math.min(22, (codeBottom - codeTop) / n);
    }

    function lineTop(i: number, n: number): number {
      return codeTop + i * lineH(n);
    }

    function lineMid(i: number, n: number): number {
      return lineTop(i, n) + lineH(n) / 2;
    }

    /** 표의 색 — 맨 바깥은 0, 머리줄은 글에서의 차례대로. 바탕(줄 목록)에서 정해져 걸음마다 같다. */
    function scopeColor(lines: SceneLine[], head: number): string {
      const headers: number[] = [];
      lines.forEach((ln, i) => {
        if (ln.k === 'function' || ln.k === 'if' || ln.k === 'for') headers.push(i + 1);
      });
      const palette = categorical(headers.length + 1, 'vivid');
      const idx = head === 0 ? 0 : headers.indexOf(head) + 1;
      const c = palette[idx];
      if (c === undefined) throw new Error(`표의 머리줄 L${head} 이 프로그램에 없다`);
      return c;
    }

    function scopeLabel(tb: ScopeTable): string {
      if (tb.kind === 'top') return t('label.scope.top', 'outermost');
      if (tb.kind === 'function') {
        if (tb.owner === null) throw new Error('함수 몸 표에 이름이 없다');
        return t('label.scope.function', '{name} body', { name: tb.owner });
      }
      if (tb.kind === 'for') return t('label.scope.for', 'for body');
      return t('label.scope.if', 'if body');
    }

    function bodySpan(tb: ScopeTable): { from: number; to: number } {
      return tb.kind === 'top' ? { from: 1, to: tb.end } : { from: tb.head + 1, to: tb.end };
    }

    /** 더미의 자리 — 아래(맨 바깥)부터 위로. 넘치면 칸을 줄여 담는다. */
    function layoutPile(pile: ScopeTable[]): { ys: number[]; hs: number[]; m: CardMetrics } {
      let m: CardMetrics = { head: 24, row: 20, pad: 6, gap: 8 };
      const total = (mm: CardMetrics): number =>
        pile.reduce((s, tb) => s + cardHeight(tb, mm), 0) + Math.max(0, pile.length - 1) * mm.gap;
      const room = pileBottom - pileTopLimit;
      const need = total(m);
      if (need > room) {
        const k = room / need;
        m = { head: m.head * k, row: m.row * k, pad: m.pad * k, gap: m.gap * k };
      }
      const ys: number[] = [];
      const hs: number[] = [];
      let y = pileBottom;
      for (const tb of pile) {
        const h = cardHeight(tb, m);
        y -= h;
        ys.push(y);
        hs.push(h);
        y -= m.gap;
      }
      return { ys, hs, m };
    }

    type CardHandle = { g: El; rowTexts: El[] };

    function drawCard(
      parent: El,
      lines: SceneLine[],
      tb: ScopeTable,
      y: number,
      h: number,
      m: CardMetrics,
      isTop: boolean,
    ): CardHandle {
      const g = el('g', {}, parent);
      const color = scopeColor(lines, tb.head);
      el('rect', {
        x: cardX, y: r1(y), width: cardW, height: r1(h), rx: 5,
        fill: colors.bg,
        stroke: isTop ? colors.text : colors.border,
        'stroke-width': isTop ? 1.8 : 1,
      }, g);
      el('rect', { x: cardX, y: r1(y), width: 7, height: r1(h), rx: 3, fill: color }, g);
      const headY = y + m.head / 2 + smPx * 0.35;
      const label = el('text', {
        x: cardX + 16, y: r1(headY),
        fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600,
      }, g);
      label.textContent = scopeLabel(tb);
      const span = bodySpan(tb);
      const spanText = el('text', {
        x: cardX + cardW - 10, y: r1(headY), 'text-anchor': 'end',
        fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
      }, g);
      spanText.textContent = t('label.span', 'L{from}–L{to}', span);
      el('line', {
        x1: cardX + 12, x2: cardX + cardW - 8, y1: r1(y + m.head), y2: r1(y + m.head),
        stroke: colors.border, 'stroke-width': 1,
      }, g);
      const rowTexts: El[] = [];
      if (tb.rows.length === 0) {
        const empty = el('text', {
          x: cardX + 16, y: r1(y + m.head + m.row / 2 + smPx * 0.35),
          fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-style': 'italic',
        }, g);
        empty.textContent = t('label.empty', 'no names yet');
      }
      tb.rows.forEach((row, k) => {
        const ry = y + m.head + (k + 0.5) * m.row + smPx * 0.35;
        const rg = el('g', {}, g);
        const nm = el('text', {
          x: cardX + 16, y: r1(ry),
          fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600,
        }, rg);
        nm.textContent = row.name;
        const at = el('text', {
          x: cardX + cardW - 10, y: r1(ry), 'text-anchor': 'end',
          fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        }, rg);
        at.textContent = t('label.line', 'L{n}', { n: row.line });
        rowTexts.push(rg);
      });
      return { g, rowTexts };
    }

    function caption(s: TablePerScopeScene): string {
      const step = s.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Reading starts at the top. One table is already there: the outermost.');
      }
      if (step.kind === 'open') {
        const tb = s.pile[s.pile.length - 1];
        if (tb === undefined || tb.id !== step.id) throw new Error('얹은 표가 맨 위에 없다');
        const scope = scopeLabel(tb);
        if (step.initial.length === 0) {
          return t('caption.open', 'L{line}: a body opens. The {scope} table goes on top.', {
            line: step.line, scope,
          });
        }
        return t('caption.openWith', 'L{line}: a body opens. The {scope} table goes on top, already holding: {names}', {
          line: step.line, scope, names: step.initial.join(', '),
        });
      }
      if (step.kind === 'declare') {
        const tb = s.pile[s.pile.length - 1];
        if (tb === undefined || tb.id !== step.id) throw new Error('적힌 표가 맨 위에 없다');
        return t('caption.declare', 'L{line} declares {name}. It is written in the top table: {scope}.', {
          line: step.line, name: step.name, scope: scopeLabel(tb),
        });
      }
      return t('caption.close', 'After L{line}, a body ends. The {scope} table comes off with every name in it.', {
        line: step.line, scope: scopeLabel(step.was),
      });
    }

    type Drawn = { cards: CardHandle[]; motion: El; pileLayout: ReturnType<typeof layoutPile> };

    function drawStatic(s: TablePerScopeScene): Drawn {
      clear();
      const n = s.lines.length;
      const lh = lineH(n);

      const cap = el('text', {
        x: 16, y: 26, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      }, svg);
      cap.textContent = caption(s);

      // 읽는 자리
      if (s.cursor !== null) {
        const c = s.cursor;
        if (c.after) {
          const by = lineTop(c.line, n);
          el('line', {
            x1: cursorX + 8, x2: stackX0 - 16, y1: r1(by), y2: r1(by),
            stroke: colors.itemComparing, 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
          }, svg);
          el('path', {
            d: `M${cursorX} ${r1(by - 5)} L${cursorX + 7} ${r1(by)} L${cursorX} ${r1(by + 5)} Z`,
            fill: colors.itemComparing,
          }, svg);
        } else {
          const i = c.line - 1;
          el('rect', {
            x: cursorX + 8, y: r1(lineTop(i, n) + 1), width: stackX0 - 16 - (cursorX + 8), height: r1(lh - 2),
            rx: 3, fill: colors.bgSubtle,
          }, svg);
          const my = lineMid(i, n);
          el('path', {
            d: `M${cursorX} ${r1(my - 5)} L${cursorX + 7} ${r1(my)} L${cursorX} ${r1(my + 5)} Z`,
            fill: colors.itemComparing,
          }, svg);
        }
      }

      // 몸의 범위 막대 — 더미에 있는 표마다
      s.pile.forEach((tb, d) => {
        if (tb.kind === 'top') return;
        const span = bodySpan(tb);
        const x = barX0 + (d - 1) * barStep;
        el('rect', {
          x, y: r1(lineTop(span.from - 1, n) + 2), width: 4,
          height: r1(lineTop(span.to, n) - lineTop(span.from - 1, n) - 4),
          rx: 2, fill: scopeColor(s.lines, tb.head),
        }, svg);
      });

      // 프로그램
      s.lines.forEach((ln, i) => {
        const y = lineMid(i, n) + smPx * 0.35;
        const num = el('text', {
          x: numX, y: r1(y), 'text-anchor': 'end',
          fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        }, svg);
        num.textContent = t('label.line', 'L{n}', { n: i + 1 });
        const code = el('text', {
          x: r1(codeX + ln.indent * 4 * charW), y: r1(y),
          fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
        }, svg);
        code.textContent = ln.text;
      });

      // 표 더미
      const pileLayout = layoutPile(s.pile);
      const cards = s.pile.map((tb, d) => {
        const y = pileLayout.ys[d];
        const h = pileLayout.hs[d];
        if (y === undefined || h === undefined) throw new Error('표 자리를 셈하지 못했다');
        return drawCard(svg, s.lines, tb, y, h, pileLayout.m, d === s.pile.length - 1);
      });

      const count = el('text', {
        x: r1(cardX + cardW / 2), y: countY, 'text-anchor': 'middle',
        fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm,
      }, svg);
      count.textContent = t('label.stacked', 'Tables stacked: {n}', { n: s.pile.length });

      const motion = el('g', {}, svg);
      return { cards, motion, pileLayout };
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function animate(s: TablePerScopeScene, drawn: Drawn, mine: number): Promise<void> {
      const step = s.step;
      const n = s.lines.length;
      if (step.kind === 'open') {
        const card = drawn.cards[drawn.cards.length - 1];
        if (card === undefined) return;
        card.g.setAttribute('transform', `translate(0 ${-DROP})`);
        card.g.setAttribute('opacity', '0');
        await tween(mine, MOTION_MS, (p) => {
          const e = easeOut(p);
          card.g.setAttribute('transform', `translate(0 ${r1(-(1 - e) * DROP)})`);
          card.g.setAttribute('opacity', String(r1(Math.min(1, p * 2.5))));
        });
        return;
      }
      if (step.kind === 'declare') {
        const card = drawn.cards[drawn.cards.length - 1];
        const top = s.pile[s.pile.length - 1];
        const y0 = drawn.pileLayout.ys[drawn.cards.length - 1];
        const ln = s.lines[step.line - 1];
        if (card === undefined || top === undefined || y0 === undefined || ln === undefined) return;
        const row = card.rowTexts[card.rowTexts.length - 1];
        if (row === undefined) return;
        if (ln.k !== 'let' && ln.k !== 'function') throw new Error(`L${step.line}: 선언 줄이 아니다`);
        // 이름은 `let 이름` · `function 이름` 의 둘째 낱말 자리에 있다
        const fromX = codeX + (ln.indent * 4 + ln.k.length + 1) * charW;
        const fromY = lineMid(step.line - 1, n) + smPx * 0.35;
        const m = drawn.pileLayout.m;
        const toX = cardX + 16;
        const toY = y0 + m.head + (top.rows.length - 0.5) * m.row + smPx * 0.35;
        row.setAttribute('opacity', '0');
        const fly = el('text', {
          x: r1(fromX), y: r1(fromY),
          fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600,
        }, drawn.motion);
        fly.textContent = step.name;
        const chip = el('rect', {
          x: r1(fromX - 3), y: r1(fromY - smPx), width: r1(step.name.length * charW + 6), height: r1(smPx + 5),
          rx: 3, fill: colors.accent, opacity: 0.55,
        }, drawn.motion);
        drawn.motion.insertBefore(chip, fly);
        await tween(mine, MOTION_MS, (p) => {
          const e = easeInOut(p);
          const x = fromX + (toX - fromX) * e;
          const y = fromY + (toY - fromY) * e - Math.sin(Math.PI * e) * 26;
          fly.setAttribute('x', String(r1(x)));
          fly.setAttribute('y', String(r1(y)));
          chip.setAttribute('x', String(r1(x - 3)));
          chip.setAttribute('y', String(r1(y - smPx)));
        });
        return;
      }
      if (step.kind === 'close') {
        // 걷힌 표는 남은 더미 바로 위에 있었다
        const was = step.was;
        const withWas = layoutPile([...s.pile, was]);
        const y = withWas.ys[withWas.ys.length - 1];
        const h = withWas.hs[withWas.hs.length - 1];
        if (y === undefined || h === undefined) return;
        const card = drawCard(drawn.motion, s.lines, was, y, h, withWas.m, true);
        await tween(mine, MOTION_MS, (p) => {
          const e = easeInOut(p);
          card.g.setAttribute('transform', `translate(${r1(e * 70)} ${r1(-e * 64)})`);
          card.g.setAttribute('opacity', String(r1(1 - e)));
        });
      }
    }

    return {
      async render(next: TablePerScopeScene, prev: TablePerScopeScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        await animate(next, drawn, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        clear();
      },
    };
  },
};
