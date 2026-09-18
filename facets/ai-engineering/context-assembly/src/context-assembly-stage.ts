/**
 * 맥락 조립 stage — 조각이 예산 문턱을 지나 맥락의 골짜기에 앉는다.
 *
 * 세 층이 위에서 아래로 놓인다.
 *   선반    찾아온 조각 여덟, 등수 차례. 폭은 낱말 수에 비례한다.
 *   문턱    예산 길이의 홈. 담긴 조각이 낱말 수만큼 차고, 넘는 첫 조각은 문턱을 넘어섰다가
 *           선반으로 튕겨 난다.
 *   골짜기  맥락. 조각이 앞에서 뒤로 늘어서고, 세로 깊이가 **가까운 끝까지의 거리**다
 *           (자리 i 의 깊이 = min(i, m − 1 − i)). 뒤로 조각이 붙으면 답 조각은 가로 자리를
 *           지킨 채 가라앉고, 끝부터 번갈아 놓으면 가운데로 조각이 밀려 들어와 답이 끝 가까이에
 *           남는다.
 *
 * 깊이는 자리와 거리만 그린다 — 모형이 무엇을 놓치는지(쓰임 · 정답률)는 그리지 않는다.
 * 조각 하나는 요소 하나이고, 판이 바뀌어도 지우지 않고 지금 자리에서 다음 자리로 옮긴다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

/** projector 가 부르는 구조적 표면 (C9 — projector 는 이 타입으로 좁힌다). */
export type ContextAssemblyStage = {
  roundStart(budget: number, order: number, lengths: readonly number[], ms: number): Promise<void>;
  admit(rank: number, words: number, used: number, budget: number, ms: number): Promise<void>;
  overflow(rank: number, words: number, used: number, budget: number, leftOut: number, ms: number): Promise<void>;
  seat(rank: number, side: 'front' | 'back', ms: number): Promise<void>;
  depth(answer: number, slot: number, count: number, depth: number, leftOut: number, ms: number): Promise<void>;
  clear(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const HEIGHT = 432;

const X0 = 44;
/** 낱말 하나의 가로 폭. 여덟을 다 담아도(83 낱말 + 틈 일곱) 폭 안에 선다. */
const K = 6;
const GAP = 4;
const CH = 24;

const Q_Y = 18;
const SHELF_LABEL_Y = 40;
const SHELF_Y = 62;
const BAR_LABEL_Y = 108;
const BAR_Y = 126;
const CONTEXT_LABEL_Y = 186;
const RIM_Y = 200;
/** 거리 1 만큼의 깊이. 사다리 끝(여덟)에서 가장 깊은 거리 3 이 들어갈 자리를 처음부터 잡는다. */
const DY = 38;
const MAX_DEPTH = 3;
const CAP_Y = 378;
const TEXT_Y = 418;

type Where = 'shelf' | 'bar' | 'valley' | 'out';

type Chunk = {
  rank: number;
  words: number;
  text: string;
  w: number;
  where: Where;
  x: number;
  y: number;
  g: SVGGElement;
  rect: SVGRectElement;
};

type Init = { question: string; chunks: string[]; answer: number; budget: number; order: number };

function readInit(raw: unknown): Init | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.question !== 'string') return null;
  if (!Array.isArray(d.chunks) || !d.chunks.every((c) => typeof c === 'string')) return null;
  if (typeof d.answerRank !== 'number') return null;
  const budget = typeof d.budget === 'number' ? d.budget : 0;
  const order = typeof d.order === 'number' ? d.order : 0;
  return { question: d.question, chunks: d.chunks as string[], answer: d.answerRank - 1, budget, order };
}

const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const r1 = (v: number): number => Math.round(v * 10) / 10 + 0;

export const contextAssemblyStageView: CanvasView = {
  canvas: { height: HEIGHT },
  mount(_container, params): ViewInstance & ContextAssemblyStage {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const p: Palette = getColors(params.theme);
    const init = readInit(params.initialData);

    let destroyed = false;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const el = <Tag extends keyof SVGElementTagNameMap>(
      tag: Tag,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[Tag] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };

    // ── 층
    const root = el('g', {}, svg);
    const bgLayer = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const curveLayer = el('g', {}, root);
    const markLayer = el('g', {}, root);
    const chunkLayer = el('g', {}, root);
    const capLayer = el('g', {}, root);

    const textAttrs = (size: string, fill: string, family: string = fonts.body) => ({
      'font-family': family,
      'font-size': size,
      fill,
    });

    // ── 바탕 글
    if (init) {
      const q = el('text', { x: 16, y: Q_Y, ...textAttrs(fontSizes.sm, p.text) }, bgLayer);
      q.textContent = t('label.question', 'Question: {q}', { q: init.question });
    }
    const shelfLabel = el('text', { x: X0, y: SHELF_LABEL_Y, ...textAttrs(fontSizes.xs, p.textMuted) }, bgLayer);
    shelfLabel.textContent = t('label.shelf', 'Retrieved chunks, by rank');
    const leftOutLabel = el(
      'text',
      { x: W - 16, y: SHELF_LABEL_Y, 'text-anchor': 'end', ...textAttrs(fontSizes.xs, p.danger) },
      bgLayer,
    );
    const barLabel = el('text', { x: X0, y: BAR_LABEL_Y, ...textAttrs(fontSizes.xs, p.textMuted) }, bgLayer);
    const track = el(
      'rect',
      { x: X0, y: BAR_Y - 3, width: 0, height: CH + 6, rx: 4, fill: p.bgSubtle, stroke: p.border },
      bgLayer,
    );
    const budgetLine = el(
      'line',
      { x1: X0, x2: X0, y1: BAR_Y - 8, y2: BAR_Y + CH + 8, stroke: p.danger, 'stroke-width': 2 },
      bgLayer,
    );
    const budgetNum = el(
      'text',
      { x: X0, y: BAR_Y + CH + 20, 'text-anchor': 'middle', ...textAttrs(fontSizes.xs, p.danger) },
      bgLayer,
    );
    const contextLabel = el('text', { x: X0, y: CONTEXT_LABEL_Y, ...textAttrs(fontSizes.xs, p.textMuted) }, bgLayer);
    contextLabel.textContent = t('label.context', 'Context, front to back');

    // 깊이 눈금 — 0 이 맥락의 끝(가장자리), 아래로 갈수록 끝에서 멀다
    const ticks: SVGTextElement[] = [];
    for (let d = 0; d <= MAX_DEPTH; d += 1) {
      const y = RIM_Y + d * DY + CH / 2;
      el('line', { x1: 34, x2: 40, y1: y, y2: y, stroke: p.border }, bgLayer);
      const tick = el(
        'text',
        { x: 30, y: y + 4, 'text-anchor': 'end', ...textAttrs(fontSizes.xs, p.textMuted) },
        bgLayer,
      );
      tick.textContent = String(d);
      ticks.push(tick);
    }
    el('line', { x1: 37, x2: 37, y1: RIM_Y + CH / 2, y2: RIM_Y + MAX_DEPTH * DY + CH / 2, stroke: p.border }, bgLayer);
    const axisMid = RIM_Y + (MAX_DEPTH * DY + CH) / 2;
    const axisLabel = el(
      'text',
      {
        x: 12,
        y: axisMid,
        'text-anchor': 'middle',
        transform: `rotate(-90 12 ${axisMid})`,
        ...textAttrs(fontSizes.xs, p.textMuted),
      },
      bgLayer,
    );
    axisLabel.textContent = t('label.axis', 'distance to nearest end');

    const curve = el(
      'polyline',
      { points: '', fill: 'none', stroke: p.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' },
      curveLayer,
    );

    const capLine1 = el('text', { x: 16, y: CAP_Y, ...textAttrs(fontSizes.sm, p.text) }, capLayer);
    const capLine2 = el('text', { x: 16, y: CAP_Y + 16, ...textAttrs(fontSizes.sm, p.text) }, capLayer);
    const quote = el('text', { x: 16, y: TEXT_Y, ...textAttrs(fontSizes.xs, p.textMuted, fonts.mono) }, capLayer);

    // ── 조각
    // 낱말 수는 stage 가 다시 세지 않는다 — 알고리즘이 첫 판의 round-start 에 실어 보낸 것으로 짓는다.
    const chunks: Chunk[] = [];
    function build(lengths: readonly number[]): void {
      if (!init || chunks.length > 0) return;
      init.chunks.forEach((text, rank) => {
        const n = lengths[rank];
        if (typeof n !== 'number') return;
        const w = n * K;
        const g = el('g', {}, chunkLayer);
        const rect = el('rect', { x: 0, y: 0, width: w - 1, height: CH, rx: 3, 'stroke-width': 1.5 }, g);
        const label = el(
          'text',
          {
            x: (w - 1) / 2,
            y: CH / 2 + 4,
            'text-anchor': 'middle',
            ...textAttrs(fontSizes.xs, rank === init.answer ? p.stateInk : p.text),
          },
          g,
        );
        // rank 는 0 기준 색인 — 화면은 1 부터 읽는다 (공통 안내문 5 절 "수에 대해").
        // '#' 은 언어마다 옮길 낱말이 아니라 번호 표식이라 messages 를 거치지 않는다 (C10 판정: 문안 아님).
        label.textContent = `#${rank + 1}`;
        if (rank === init.answer) {
          const tag = el(
            'text',
            { x: (w - 1) / 2, y: -4, 'text-anchor': 'middle', ...textAttrs(fontSizes.xs, p.text) },
            g,
          );
          tag.textContent = t('label.answer', 'answer');
        }
        const [x, y] = shelfPos(rank, lengths);
        const c: Chunk = { rank, words: n, text, w, where: 'shelf', x, y, g, rect };
        chunks.push(c);
        paint(c);
      });
    }
    const answer = init?.answer ?? -1;

    let budget = init?.budget ?? 0;
    let order = init?.order ?? 0;
    let front: number[] = [];
    let back: number[] = [];
    /** 문턱에 든 조각, 든 차례 */
    let bar: number[] = [];

    // ── 자리 셈
    function shelfPos(rank: number, lengths?: readonly number[]): [number, number] {
      let x = X0;
      for (let i = 0; i < rank; i += 1) x += (lengths ? lengths[i]! * K : chunks[i]!.w) + GAP;
      return [x, SHELF_Y];
    }
    function barPos(index: number): [number, number] {
      let x = X0;
      for (let i = 0; i < index; i += 1) x += chunks[bar[i]!]!.w;
      return [x, BAR_Y];
    }
    /** 맥락의 차례 — 앞쪽은 앉은 차례대로, 뒤쪽은 거꾸로 (뒤에서 비어 있는 가장 뒤 자리부터 찼다). */
    function arrangement(): number[] {
      return [...front, ...[...back].reverse()];
    }
    function valleyPos(arr: number[], i: number): [number, number] {
      let x = X0;
      for (let j = 0; j < i; j += 1) x += chunks[arr[j]!]!.w + GAP;
      const m = arr.length;
      return [x, RIM_Y + Math.min(i, m - 1 - i) * DY];
    }

    // ── 그리기
    function paint(c: Chunk): void {
      c.g.setAttribute('transform', `translate(${r1(c.x)} ${r1(c.y)})`);
      const isAnswer = c.rank === answer;
      const fill = isAnswer ? p.accent : c.where === 'valley' || c.where === 'bar' ? p.itemDefault : p.bgSubtle;
      const stroke = c.where === 'bar' ? p.itemActive : c.where === 'valley' ? p.text : p.border;
      c.rect.setAttribute('fill', fill);
      c.rect.setAttribute('stroke', stroke);
      if (c.where === 'out') c.g.setAttribute('opacity', '0.35');
      else c.g.removeAttribute('opacity');
    }
    function paintCurve(): void {
      const inValley = chunks.filter((c) => c.where === 'valley').sort((a, b) => a.x - b.x);
      curve.setAttribute(
        'points',
        inValley.map((c) => `${r1(c.x + (c.w - 1) / 2)},${r1(c.y + CH / 2)}`).join(' '),
      );
    }
    function setTrack(b: number): void {
      const x = r1(X0 + b * K);
      track.setAttribute('width', String(r1(b * K)));
      budgetLine.setAttribute('x1', String(x));
      budgetLine.setAttribute('x2', String(x));
      budgetNum.setAttribute('x', String(x));
    }

    // ── 시계 — 재생 속도를 따라온 ms 를 projector 가 준다
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
    function tween(ms: number, frame: (u: number) => void): Promise<void> {
      if (destroyed || ms <= 0) {
        if (!destroyed) frame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const t0 = performance.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || done) {
            finish();
            return;
          }
          const u = Math.min(1, (performance.now() - t0) / ms);
          frame(ease(u));
          if (u >= 1) finish();
          else schedule(tick);
        };
        schedule(tick);
      });
    }
    /** 조각 여럿을 지금 자리에서 목표 자리로 한 시계로 옮긴다. */
    function move(targets: Array<[Chunk, number, number]>, ms: number, extra?: (u: number) => void): Promise<void> {
      const from = targets.map(([c]) => [c.x, c.y] as const);
      return tween(ms, (u) => {
        targets.forEach(([c, x, y], i) => {
          const [fx, fy] = from[i]!;
          c.x = fx + (x - fx) * u;
          c.y = fy + (y - fy) * u;
          paint(c);
        });
        extra?.(u);
        paintCurve();
      });
    }

    // ── 캡션
    function wrap(text: string, max: number): [string, string] {
      const perChar = 6.6;
      const limit = Math.floor(max / perChar);
      if (text.length <= limit) return [text, ''];
      const cut = text.lastIndexOf(' ', limit);
      const at = cut > 0 ? cut : limit;
      return [text.slice(0, at), text.slice(at).trim()];
    }
    function caption(text: string, chunkText: string | null): void {
      const [a, b] = wrap(text, W - 32);
      capLine1.textContent = a;
      capLine2.textContent = b;
      quote.textContent = chunkText === null ? '' : t('caption.chunk', '“{text}”', { text: chunkText });
    }

    function clearMarks(): void {
      markLayer.textContent = '';
      for (const tick of ticks) {
        tick.setAttribute('fill', p.textMuted);
        tick.removeAttribute('font-weight');
      }
    }

    function home(): void {
      front = [];
      back = [];
      bar = [];
      for (const c of chunks) {
        const [x, y] = shelfPos(c.rank);
        c.where = 'shelf';
        c.x = x;
        c.y = y;
        paint(c);
      }
      ghostLayer.textContent = '';
      clearMarks();
      paintCurve();
      setTrack(budget);
      budgetNum.textContent = String(budget);
      barLabel.textContent = t('label.budget', 'Budget: {budget} words', { budget });
      leftOutLabel.textContent = '';
      caption('', null);
    }
    home();

    const stage: ContextAssemblyStage = {
      async roundStart(nextBudget, nextOrder, lengths, ms) {
        if (destroyed) return;
        build(lengths);
        const was = budget;
        budget = nextBudget;
        order = nextOrder;
        front = [];
        back = [];
        bar = [];
        clearMarks();
        leftOutLabel.textContent = '';
        budgetNum.textContent = String(budget);
        barLabel.textContent = t('label.budget', 'Budget: {budget} words', { budget });
        caption(t('caption.start', 'Budget {budget} words. Chunks go in by rank until one does not fit.', { budget }), null);

        // 지난 판의 답 자리를 남겨 새 판의 답과 견주게 한다
        ghostLayer.textContent = '';
        const a = chunks[answer];
        if (a && a.where === 'valley') {
          el(
            'rect',
            {
              x: r1(a.x),
              y: r1(a.y),
              width: a.w - 1,
              height: CH,
              rx: 3,
              fill: 'none',
              stroke: p.ghostOutline,
              'stroke-dasharray': '4 3',
            },
            ghostLayer,
          );

        }

        // 밖에 남았던 조각은 선반으로 돌아온다
        for (const c of chunks) {
          if (c.where === 'out') {
            c.where = 'shelf';
            paint(c);
          }
        }
        // 문턱이 새 예산으로 옮겨 간다
        await tween(ms * 0.5, (u) => setTrack(was + (budget - was) * u));
      },

      async admit(rank, _words, used, total, ms) {
        const c = chunks[rank];
        if (destroyed || !c) return;
        bar.push(rank);
        const [x, y] = barPos(bar.length - 1);
        c.where = 'bar';
        caption(
          t('caption.admit', 'Rank {rank} fits: {words} words, {used} of {budget} used.', {
            rank: rank + 1,
            words: c.words,
            used,
            budget: total,
          }),
          c.text,
        );
        await move([[c, x, y]], ms);
      },

      async overflow(rank, wordsNeeded, used, total, leftOut, ms) {
        const c = chunks[rank];
        if (destroyed || !c) return;
        caption(
          t(
            'caption.overflow',
            'Rank {rank} needs {words} words but only {room} are left. It bounces off, and nothing after it is looked at.',
            { rank: rank + 1, words: wordsNeeded, room: total - used },
          ),
          c.text,
        );
        leftOutLabel.textContent = t('label.leftOut', 'Left out: {n}', { n: leftOut });
        // 뒤의 조각은 보지도 않고 밖에 남는다 — 맥락에 앉아 있던 것도 선반으로 물러난다
        const rest: Array<[Chunk, number, number]> = [];
        for (const o of chunks) {
          if (o.rank <= rank) continue;
          o.where = 'out';
          const [sx, sy] = shelfPos(o.rank);
          rest.push([o, sx, sy]);
        }
        // 넘는 조각은 문턱을 넘어섰다가
        c.where = 'bar';
        c.rect.setAttribute('stroke', p.danger);
        await move([[c, X0 + used * K, BAR_Y], ...rest], ms * 0.5, () => c.rect.setAttribute('stroke', p.danger));
        if (destroyed) return;
        // 선반으로 튕겨 난다
        c.where = 'out';
        const [sx, sy] = shelfPos(rank);
        await move([[c, sx, sy]], ms * 0.5);
      },

      async seat(rank, side, ms) {
        const c = chunks[rank];
        if (destroyed || !c) return;
        if (side === 'back') back.push(rank);
        else front.push(rank);
        c.where = 'valley';
        bar = bar.filter((r) => r !== rank);
        const arr = arrangement();
        const targets: Array<[Chunk, number, number]> = arr.map((r, i) => {
          const [x, y] = valleyPos(arr, i);
          return [chunks[r]!, x, y];
        });
        const key = order === 0 ? 'append' : side;
        const vars = { rank: rank + 1 };
        const text =
          key === 'append'
            ? t('caption.seat.append', 'Rank {rank} is added after the others.', vars)
            : key === 'front'
              ? t('caption.seat.front', 'Rank {rank} takes the frontmost free slot.', vars)
              : t('caption.seat.back', 'Rank {rank} takes the backmost free slot.', vars);
        caption(text, c.text);
        await move(targets, ms);
      },

      async depth(ans, slot, count, d, leftOut, ms) {
        if (destroyed) return;
        leftOutLabel.textContent = t('label.leftOut', 'Left out: {n}', { n: leftOut });
        const a = chunks[ans];
        if (!a || slot < 0 || d < 0) {
          caption(t('caption.missing', 'The answer chunk did not fit.'), null);
          return;
        }
        caption(
          t('caption.depth', 'The answer chunk is in slot {slot} of {count}. Distance to the nearest end: {depth}.', {
            slot: slot + 1,
            count,
            depth: d,
          }),
          a.text,
        );
        // 자리 번호 (1 부터)
        const arr = arrangement();
        arr.forEach((r, i) => {
          const c = chunks[r]!;
          const num = el(
            'text',
            { x: r1(c.x + (c.w - 1) / 2), y: r1(c.y + CH + 12), 'text-anchor': 'middle', ...textAttrs(fontSizes.xs, p.textMuted) },
            markLayer,
          );
          num.textContent = String(i + 1);
        });
        const tick = ticks[d];
        if (tick) {
          tick.setAttribute('fill', p.text);
          tick.setAttribute('font-weight', '700');
        }
        // 거리는 사슬을 따라 답 조각에서 가까운 끝까지 건너는 칸 수다 — 그 길을 그린다
        const i = arr.indexOf(ans);
        const m = arr.length;
        const stepDir = i <= m - 1 - i ? -1 : 1;
        const pts: Array<[number, number]> = [];
        for (let s = 0; s <= d; s += 1) {
          const c = chunks[arr[i + s * stepDir]!]!;
          pts.push([c.x + (c.w - 1) / 2, c.y + CH / 2]);
        }
        if (d === 0) {
          el(
            'rect',
            {
              x: r1(a.x - 4),
              y: r1(a.y - 4),
              width: a.w + 7,
              height: CH + 8,
              rx: 6,
              fill: 'none',
              stroke: p.primary,
              'stroke-width': 2,
            },
            markLayer,
          );
          return;
        }
        const path = el(
          'polyline',
          { points: '', fill: 'none', stroke: p.primary, 'stroke-width': 4, 'stroke-linecap': 'round' },
          markLayer,
        );
        await tween(ms * 0.6, (u) => {
          const reach = u * d;
          const whole = Math.floor(reach);
          const shown = pts.slice(0, whole + 1);
          if (whole < d) {
            const [ax, ay] = pts[whole]!;
            const [bx, by] = pts[whole + 1]!;
            const f = reach - whole;
            shown.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
          }
          path.setAttribute('points', shown.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' '));
        });
      },

      clear() {
        if (destroyed) return;
        budget = init?.budget ?? 0;
        order = init?.order ?? 0;
        home();
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
