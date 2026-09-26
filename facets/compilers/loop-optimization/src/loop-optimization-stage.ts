/**
 * loop-optimization 무대 — 원시 프로그램의 줄이 판을 넘어 같은 key 로 이어진다.
 *
 * 줄은 제자리를 key 로 기억한다. 꺼낸 줄은 몸에서 들려 `while` 위로 옮겨 가고, 벌은 원래 줄 자리에서 옆으로
 * 밀려 나와 제 줄로 내려앉고, 나머지는 몸의 같은 벌 자리에서 반복 밖으로 떨어져 나온다. 새 판이 서면 늘어났던
 * 줄은 제 원래 줄 자리로 접혀 들어간다. 오른쪽 두 저울눈(실행 연산 · 코드 줄)은 걸음 0 과 셈 걸음에서만 움직인다.
 *
 * 무대는 셈하지 않는다 — 줄 글자 · 벌 번호 · 판정 · 수는 projector 가 넘긴 payload 그대로다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { JudgeMark, ProgramLine } from './algorithm.js';

const SVG = 'http://www.w3.org/2000/svg';

const W = 820;
const H = 500;
/** 가장 긴 프로그램(N 10 · F 4 · 꺼내기 끔)은 18 줄이다 — 그 자리를 처음부터 잡는다. */
const MAX_LINES = 18;
const LINE_H = 22;
const TOP = 34;
const LEFT = 26;
const MARK_X = 392;
const BAR_X = 590;
const BAR_W = 206;
const CAPTION_Y = TOP + MAX_LINES * LINE_H + 34;

export type LoopStageBars = {
  ops: number;
  overhead: number;
  codeLines: number;
  ops0: number;
  codeLines0: number;
};

export type LoopStage = ViewInstance & {
  reset(): void;
  setScale(scaleOps: number, scaleLines: number): void;
  showProgram(lines: ProgramLine[], emphasis: string[], durMs: number): void;
  setJudge(marks: JudgeMark[]): void;
  clearMarks(): void;
  markRewrites(keys: string[]): void;
  setBars(bars: LoopStageBars, durMs: number): void;
  setCaption(text: string): void;
};

type LineEl = {
  g: SVGGElement;
  bg: SVGRectElement;
  text: SVGTextElement;
  mark: SVGGElement;
  line: ProgramLine;
  x: number;
  y: number;
  previousText: string;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export const loopOptimizationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const codePx = parseFloat(fontSizes.md);
    const charW = codePx * 0.6;
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id);
        pending.delete(id);
        fn();
      }, ms);
      timers.add(id);
      pending.set(id, fn);
    };
    const flushTimers = () => {
      const fns = [...pending.values()];
      for (const id of timers) clearTimeout(id);
      timers.clear();
      pending.clear();
      for (const fn of fns) fn();
    };
    params.onScrubStart?.(flushTimers);

    const root = el('g');
    svg.appendChild(root);

    // 반복 몸 괄호 — while 줄에서 몸 끝까지 늘고 준다
    const bracket = el('rect', { x: LEFT + 4 * charW - 8, y: TOP, width: 3, height: 0, rx: 1.5, fill: c.border });
    bracket.style.opacity = '0';
    root.appendChild(bracket);
    const linesLayer = el('g');
    root.appendChild(linesLayer);

    // 저울눈 둘
    const bars = el('g');
    root.appendChild(bars);
    type Scale = {
      label: SVGTextElement;
      value: SVGTextElement;
      track: SVGRectElement;
      fill: SVGRectElement;
      part: SVGRectElement | null;
      partLabel: SVGTextElement | null;
      tick: SVGLineElement;
      tickLabel: SVGTextElement;
    };
    const makeScale = (y: number, withPart: boolean): Scale => {
      const label = el('text', { x: BAR_X, y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md });
      const value = el('text', {
        x: BAR_X + BAR_W,
        y,
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'text-anchor': 'end',
      });
      const track = el('rect', { x: BAR_X, y: y + 10, width: BAR_W, height: 18, fill: c.bgSubtle, rx: 2 });
      const fill = el('rect', { x: BAR_X, y: y + 10, width: 0, height: 18, fill: c.primary, rx: 2 });
      const part = withPart
        ? el('rect', { x: BAR_X, y: y + 10, width: 0, height: 18, fill: c.accent, rx: 2 })
        : null;
      const partLabel = withPart
        ? el('text', { x: BAR_X, y: y + 44, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm })
        : null;
      const tick = el('line', {
        x1: BAR_X,
        x2: BAR_X,
        y1: y + 4,
        y2: y + 34,
        stroke: c.text,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 2',
      });
      const tickLabel = el('text', {
        x: BAR_X,
        y: withPart ? y + 60 : y + 46,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      for (const e of [label, value, track, fill, part, partLabel, tick, tickLabel]) if (e) bars.appendChild(e);
      bars.style.opacity = '0';
      return { label, value, track, fill, part, partLabel, tick, tickLabel };
    };
    const opsScale = makeScale(TOP + 16, true);
    const linesScale = makeScale(TOP + 120, false);

    const caption = el('text', {
      x: LEFT,
      y: CAPTION_Y,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    root.appendChild(caption);

    const els = new Map<string, LineEl>();
    let scaleOps = 0;
    let scaleLines = 0;

    const xOf = (indent: number) => LEFT + indent * 4 * charW;
    const yOf = (row: number) => TOP + row * LINE_H;
    const place = (g: SVGGElement, x: number, y: number, opacity: number, durMs: number) => {
      const instant = isInstant() || durMs <= 0;
      g.style.transition = instant ? 'none' : `transform ${durMs}ms ease-in-out, opacity ${durMs}ms ease-in-out`;
      g.style.transform = `translate(${x}px, ${y}px)`;
      g.style.opacity = String(opacity);
    };

    const setMark = (le: LineEl, parts: { badge: string; strong: boolean; note: string } | null) => {
      le.mark.textContent = '';
      if (parts === null) return;
      const mx = MARK_X - le.x;
      const bw = Math.max(34, parts.badge.length * smPx * 0.9 + 12);
      le.mark.appendChild(
        el('rect', {
          x: mx,
          y: -LINE_H / 2 - 1,
          width: bw,
          height: LINE_H - 4,
          rx: 3,
          fill: parts.strong ? c.primary : c.bg,
          stroke: parts.strong ? c.primary : c.border,
        }),
      );
      const b = el('text', {
        x: mx + bw / 2,
        y: 3,
        fill: parts.strong ? c.textInverse : c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      b.textContent = parts.badge;
      le.mark.appendChild(b);
      if (parts.note !== '') {
        const n = el('text', {
          x: mx + bw + 8,
          y: 3,
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        n.textContent = parts.note;
        le.mark.appendChild(n);
      }
    };

    const tagOf = (line: ProgramLine): { badge: string; strong: boolean; note: string } | null => {
      if (line.part === 'tail') return { badge: t('label.tailTag', 'leftover {n}', { n: line.copy }), strong: false, note: '' };
      if (line.part === 'body' && line.copy >= 2) {
        return { badge: t('label.copyTag', 'copy {n}', { n: line.copy }), strong: false, note: '' };
      }
      return null;
    };

    const inst: LoopStage = {
      reset() {
        flushTimers();
        linesLayer.textContent = '';
        els.clear();
        bracket.style.opacity = '0';
        bars.style.opacity = '0';
        caption.textContent = '';
      },
      setScale(ops, lines) {
        if (!(ops > 0) || !(lines > 0)) throw new Error('loop-optimization-stage: 눈금이 비었다');
        scaleOps = ops;
        scaleLines = lines;
      },
      showProgram(lines, emphasis, durMs) {
        if (lines.length > MAX_LINES) throw new Error(`loop-optimization-stage: 줄이 ${MAX_LINES} 보다 많다`);
        const nextKeys = new Set(lines.map((l) => l.key));
        const target = new Map<string, { x: number; y: number }>();
        lines.forEach((l, row) => target.set(l.key, { x: xOf(l.indent), y: yOf(row) }));

        // 사라지는 줄 — 제 원래 줄 자리로 접혀 들어간다
        for (const [key, le] of [...els]) {
          if (nextKeys.has(key)) continue;
          els.delete(key);
          const home = le.line.home === null ? undefined : target.get(le.line.home);
          const to = home ?? { x: le.x, y: le.y };
          le.mark.textContent = '';
          place(le.g, to.x, to.y, 0, durMs);
          if (isInstant() || durMs <= 0) le.g.remove();
          else later(durMs, () => le.g.remove());
        }

        const fresh: LineEl[] = [];
        for (const l of lines) {
          const to = target.get(l.key);
          if (to === undefined) throw new Error('loop-optimization-stage: 줄 자리가 없다');
          let le = els.get(l.key);
          if (le === undefined) {
            const g = el('g');
            const bg = el('rect', {
              x: -4,
              y: -LINE_H / 2 - 1,
              width: l.text.length * charW + 8,
              height: LINE_H - 2,
              rx: 3,
              fill: c.itemActive,
            });
            bg.style.opacity = '0';
            const text = el('text', {
              x: 0,
              y: 4,
              fill: c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'xml:space': 'preserve',
            });
            const mark = el('g');
            g.append(bg, text, mark);
            linesLayer.appendChild(g);
            // 처음 나타나는 줄은 출발 줄 자리에서 옆으로 밀려 나온다
            const from = l.from === null ? undefined : els.get(l.from);
            if (from !== undefined) {
              place(g, from.x + 6 * charW, from.y, 0, 0);
            } else {
              place(g, to.x, to.y, 0, 0);
            }
            le = { g, bg, text, mark, line: l, x: to.x, y: to.y, previousText: l.text };
            els.set(l.key, le);
            fresh.push(le);
          }
          le.previousText = le.line.text;
          le.line = l;
          le.text.textContent = l.text;
          le.bg.setAttribute('width', String(l.text.length * charW + 8));
          le.bg.style.opacity = emphasis.includes(l.key) ? '1' : '0';
          le.x = to.x;
          le.y = to.y;
          if (fresh.includes(le)) setMark(le, tagOf(l));
        }
        // 새 줄은 한 프레임 뒤에 목표로 — 출발 자리를 브라우저가 먼저 그리게 한다
        if (fresh.length > 0) void linesLayer.getBoundingClientRect();
        for (const l of lines) {
          const le = els.get(l.key);
          if (le === undefined) throw new Error('loop-optimization-stage: 줄을 잃었다');
          place(le.g, le.x, le.y, 1, durMs);
        }

        // 반복 몸 괄호
        const loopRow = lines.findIndex((l) => l.key === 'loop');
        const bodyRows = lines.map((l, i) => (l.part === 'body' ? i : -1)).filter((i) => i >= 0);
        const lastBody = bodyRows.length > 0 ? Math.max(...bodyRows) : loopRow;
        if (loopRow >= 0) {
          const instant = isInstant() || durMs <= 0;
          bracket.style.transition = instant ? 'none' : `height ${durMs}ms ease-in-out, y ${durMs}ms ease-in-out`;
          bracket.setAttribute('y', String(yOf(loopRow) + LINE_H / 2 - 2));
          bracket.setAttribute('height', String(Math.max(0, (lastBody - loopRow) * LINE_H)));
          bracket.style.height = `${Math.max(0, (lastBody - loopRow) * LINE_H)}px`;
          bracket.style.opacity = '1';
        }
      },
      setJudge(marks) {
        for (const m of marks) {
          const le = els.get(m.key);
          if (le === undefined) throw new Error(`loop-optimization-stage: 판정할 줄이 없다 ${m.key}`);
          const names = m.names.join(' · ');
          const note =
            m.reason === 'steady'
              ? t('label.reasonSteady', 'not changed in the loop: {names}', { names })
              : m.reason === 'changes'
                ? t('label.reasonChanges', 'changed in the loop: {names}', { names })
                : t('label.reasonTwice', 'written twice: {names}', { names });
          setMark(le, {
            badge: m.invariant ? t('label.invariant', 'invariant') : t('label.variant', 'varies'),
            strong: m.invariant,
            note,
          });
        }
      },
      clearMarks() {
        for (const le of els.values()) setMark(le, tagOf(le.line));
      },
      markRewrites(keys) {
        for (const k of keys) {
          const le = els.get(k);
          if (le === undefined) throw new Error(`loop-optimization-stage: 고친 줄이 없다 ${k}`);
          setMark(le, { badge: t('label.rewritten', 'rewritten'), strong: false, note: t('label.was', 'was {old}', { old: le.previousText }) });
        }
      },
      setBars(b, durMs) {
        if (!(scaleOps > 0) || !(scaleLines > 0)) throw new Error('loop-optimization-stage: 눈금을 먼저 받아야 한다');
        const instant = isInstant() || durMs <= 0;
        const tr = instant ? 'none' : `width ${durMs}ms ease-in-out, x1 ${durMs}ms, x2 ${durMs}ms`;
        const wOps = (BAR_W * b.ops) / scaleOps;
        const wPart = (BAR_W * b.overhead) / scaleOps;
        const wLines = (BAR_W * b.codeLines) / scaleLines;
        const setW = (r: SVGRectElement, w: number) => {
          r.style.transition = tr;
          r.setAttribute('width', String(w));
          r.style.width = `${w}px`;
        };
        setW(opsScale.fill, wOps);
        if (opsScale.part !== null) setW(opsScale.part, wPart);
        setW(linesScale.fill, wLines);
        opsScale.label.textContent = t('label.execOps', 'Exec ops');
        opsScale.value.textContent = String(b.ops);
        if (opsScale.partLabel !== null) {
          opsScale.partLabel.textContent = t('label.overheadPart', 'of which loop overhead: {n}', { n: b.overhead });
        }
        linesScale.label.textContent = t('label.codeLines', 'Code lines');
        linesScale.value.textContent = String(b.codeLines);
        const tickAt = (s: Scale, x: number) => {
          s.tick.setAttribute('x1', String(x));
          s.tick.setAttribute('x2', String(x));
          s.tickLabel.setAttribute('x', String(x));
          s.tickLabel.textContent = t('label.original', 'original');
        };
        tickAt(opsScale, BAR_X + (BAR_W * b.ops0) / scaleOps);
        tickAt(linesScale, BAR_X + (BAR_W * b.codeLines0) / scaleLines);
        bars.style.opacity = '1';
      },
      setCaption(text) {
        caption.textContent = text;
      },
      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        pending.clear();
        root.remove();
      },
    };
    return inst;
  },
};
