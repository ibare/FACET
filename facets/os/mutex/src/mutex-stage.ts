/**
 * mutex 의 무대.
 *
 * 왼쪽과 오른쪽에 두 스레드의 프로그램(가상 표기)이 있고, 가운데에 **합친 실행 줄** — 틱마다 한 칸 — 이 있다.
 * 토막 걸음마다 그 토막의 줄들이 스레드 쪽 프로그램에서 합친 줄의 칸으로 옮겨 들어간다.
 *
 * 손잡이를 돌려 새 판이 시작되면 앞 판의 줄 칩은 지우지 않고 흐리게 남는다. 새 판의 토막이 오면 같은 줄
 * (같은 스레드 · 같은 글자 · 같은 차례)의 칩이 앞 판의 자리에서 새 자리로 옮겨 간다 — 다시 끼워 든다.
 * 덮은 쓰기 표시도 앞 판의 자리에서 새 자리로 옮겨 가고, 새 판에 없으면 판 끝에서 사라진다.
 * 자물쇠가 있으면 주인 자리 · 줄 자리 사이를 스레드 표식이 오가고, 칸 옆 띠가 그 줄을 도는 동안의 주인을 보인다 —
 * 주인 띠 안에 다른 스레드의 줄이 끼지 않는 것(막힌 시도 한 칸 말고)이 덩어리로 뭉친 모양이다.
 *
 * 셈은 하지 않는다. 받은 값을 놓을 뿐이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageTick = {
  tick: number;
  thread: number;
  line: number;
  text: string;
  nth: number;
  blocked: boolean;
  lost: { old: number; new: number } | null;
  owner: number | null;
  /** 그 줄을 도는 동안의 자물쇠 주인 — 주인 띠는 이것으로 칠한다. */
  holder: number | null;
};

export type StageRound = {
  threads: string[];
  program: string[];
  shared: string;
  register: string;
  lock: string | null;
  start: number;
};

export type StageChunk = {
  thread: number;
  ticks: StageTick[];
  count: number;
  regs: (number | null)[];
  pcs: number[];
  asleep: boolean[];
  finished: boolean[];
  owner: number | null;
  queue: number[];
};

/** projector 가 부르는 무대의 표면. */
export type MutexStage = {
  begin(round: StageRound, caption: string, ms: number): void;
  chunk(chunk: StageChunk, caption: string, ms: number): void;
  finish(caption: string, ms: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
/** 가장 긴 판(자물쇠 있음 · 20 틱)의 칸이 모두 들어가는 높이. 마운트 뒤 바꾸지 않는다. */
const MAX_TICKS = 20;
const ROW_H = 20;
const ROW_Y0 = 100;
const H = ROW_Y0 + MAX_TICKS * ROW_H + 50;

// 가운데 합친 줄
const TICK_X = 276;
const BAND_X = 282;
const CHIP_X = 290;
const CHIP_W = 158;
const CHIP_H = 16;
const MARK_X = 454;
const MARK_W = 50;

// 양옆 프로그램
const COL_X = [16, 528];
const PROG_Y0 = 100;
const PROG_H = 20;

// 자물쇠 상자
const LOCK_X = 388;
const OWNER_SLOT = { x: 418, y: 50 };
const QUEUE_SLOT = { x: 478, y: 50 };

const lineY = (line: number): number => PROG_Y0 + line * PROG_H;
const rowY = (tick: number): number => ROW_Y0 + tick * ROW_H;
const homeOf = (thread: number): { x: number; y: number } => ({ x: (COL_X[thread] ?? 0) + 10, y: 22 });

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function text(parent: Element, x: number, y: number, body: string, attrs: Record<string, string | number> = {}): SVGTextElement {
  const node = el('text', { x, y, 'dominant-baseline': 'central', ...attrs }, parent);
  node.textContent = body;
  return node;
}

type Moving = { x: number; y: number; frame: number | null };

type Chip = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement; tag: SVGTextElement; thread: number };

export const mutexStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const tone = categorical(2, 'vivid');
    const threadColor = (i: number): string => {
      const col = tone[i];
      if (col === undefined) throw new Error(`스레드 ${i} 의 색이 없다`);
      return col;
    };
    const mono = fonts.mono;
    const body = fonts.body;

    // ── 움직임 — rAF 로 translate 를 옮긴다. 도중에 새 목표가 오면 지금 자리에서 다시 출발한다.
    const moving = new Map<SVGGElement, Moving>();
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const setAt = (g: SVGGElement, x: number, y: number): void => {
      const m = moving.get(g);
      if (m && m.frame !== null) {
        cancelAnimationFrame(m.frame);
        frames.delete(m.frame);
      }
      moving.set(g, { x, y, frame: null });
      g.setAttribute('transform', `translate(${x} ${y})`);
    };
    const moveTo = (g: SVGGElement, x: number, y: number, ms: number, delay = 0): void => {
      const m = moving.get(g);
      if (!m || ms <= 0 || typeof requestAnimationFrame !== 'function') {
        setAt(g, x, y);
        return;
      }
      if (m.frame !== null) {
        cancelAnimationFrame(m.frame);
        frames.delete(m.frame);
      }
      const fx = m.x;
      const fy = m.y;
      const t0 = performance.now() + delay;
      const tick = (now: number): void => {
        const k = Math.min(1, Math.max(0, (now - t0) / ms));
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const cx = fx + (x - fx) * e;
        const cy = fy + (y - fy) * e;
        g.setAttribute('transform', `translate(${cx} ${cy})`);
        const cur = moving.get(g);
        if (!cur) return;
        cur.x = cx;
        cur.y = cy;
        if (k < 1) {
          const id = requestAnimationFrame(tick);
          frames.add(id);
          cur.frame = id;
        } else {
          cur.frame = null;
        }
      };
      const id = requestAnimationFrame(tick);
      frames.add(id);
      m.frame = id;
    };
    const later = (ms: number, fn: () => void): void => {
      if (ms <= 0) {
        fn();
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const drop = (g: SVGGElement): void => {
      const m = moving.get(g);
      if (m && m.frame !== null) cancelAnimationFrame(m.frame);
      moving.delete(g);
      g.remove();
    };

    // ── 층
    const root = el('g', { 'font-family': body }, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);
    const staticLayer = el('g', {}, root);
    const progLayer = el('g', {}, root);
    const bandLayer = el('g', {}, root);
    const chipLayer = el('g', {}, root);
    const markLayer = el('g', {}, root);
    const tokenLayer = el('g', {}, root);
    const caption = text(root, W / 2, H - 22, '', {
      'text-anchor': 'middle', fill: c.text, 'font-size': fontSizes.md, 'font-weight': 600,
    });

    // 가운데 머리 — 공유 값 상자 · 자물쇠 상자 · 합친 줄 제목과 틱 번호
    el('rect', { x: 256, y: 8, width: 118, height: 60, rx: 6, fill: c.bgSubtle, stroke: c.border }, staticLayer);
    text(staticLayer, 315, 22, t('label.shared', 'Shared'), { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
    const countText = text(staticLayer, 315, 48, '', {
      'text-anchor': 'middle', fill: c.text, 'font-family': mono, 'font-size': fontSizes.lg, 'font-weight': 700,
    });
    const lockBox = el('g', { visibility: 'hidden' }, staticLayer);
    el('rect', { x: LOCK_X, y: 8, width: 116, height: 60, rx: 6, fill: c.bgSubtle, stroke: c.border }, lockBox);
    const lockTitle = text(lockBox, LOCK_X + 58, 20, '', { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
    text(lockBox, OWNER_SLOT.x, 33, t('label.owner', 'Owner'), { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
    text(lockBox, QUEUE_SLOT.x, 33, t('label.queue', 'Queue'), { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
    el('circle', { cx: OWNER_SLOT.x, cy: OWNER_SLOT.y, r: 10, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 2' }, lockBox);
    el('circle', { cx: QUEUE_SLOT.x, cy: QUEUE_SLOT.y, r: 10, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 2' }, lockBox);
    text(staticLayer, 256, 86, t('label.order', 'Run order'), { fill: c.textMuted, 'font-size': fontSizes.xs });
    for (let i = 0; i < MAX_TICKS; i += 1) {
      text(staticLayer, TICK_X, rowY(i) + ROW_H / 2, String(i), {
        'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': mono,
      });
      el('line', {
        x1: CHIP_X, x2: CHIP_X + CHIP_W, y1: rowY(i) + ROW_H - 1, y2: rowY(i) + ROW_H - 1, stroke: c.border, 'stroke-dasharray': '2 3',
      }, staticLayer);
    }

    // ── 판마다 바뀌는 것
    type Side = { head: SVGTextElement; state: SVGTextElement; reg: SVGTextElement; pointer: SVGTextElement; home: SVGCircleElement };
    const sides: Side[] = [0, 1].map((i) => {
      const x = COL_X[i] ?? 0;
      const home = el('circle', { cx: x + 10, cy: 22, r: 10, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 2', visibility: 'hidden' }, staticLayer);
      const head = text(staticLayer, x + 26, 22, '', { fill: threadColor(i), 'font-size': fontSizes.md, 'font-weight': 700 });
      const state = text(staticLayer, x + 216, 22, '', { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs });
      const reg = text(staticLayer, x + 26, 48, '', { fill: c.text, 'font-family': mono, 'font-size': fontSizes.sm });
      const pointer = text(progLayer, x, 0, '▸', { fill: c.accent, 'font-size': fontSizes.sm, visibility: 'hidden' });
      return { head, state, reg, pointer, home };
    });
    const progLines: SVGGElement[] = [];

    const tokens: SVGGElement[] = [0, 1].map((i) => {
      const g = el('g', { visibility: 'hidden' }, tokenLayer);
      el('circle', { cx: 0, cy: 0, r: 9, fill: threadColor(i), stroke: c.bg, 'stroke-width': 1.5 }, g);
      text(g, 0, 0, '', { 'text-anchor': 'middle', fill: c.stateInk, 'font-size': fontSizes.xs, 'font-weight': 700 });
      const h = homeOf(i);
      setAt(g, h.x, h.y);
      return g;
    });

    let live = new Map<string, Chip>();
    let ghosts = new Map<string, Chip>();
    let liveMarks: SVGGElement[] = [];
    let ghostMarks: SVGGElement[] = [];
    let round: StageRound | null = null;

    const keyOf = (tk: StageTick): string => `${tk.thread}:${tk.text}#${tk.nth}`;

    const makeChip = (tk: StageTick): Chip => {
      const g = el('g', {}, chipLayer);
      const box = el('rect', { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: 3, fill: c.bg, stroke: threadColor(tk.thread), 'stroke-width': 1.2 }, g);
      const name = round?.threads[tk.thread];
      if (name === undefined) throw new Error(`스레드 ${tk.thread} 의 이름이 없다`);
      text(g, 8, CHIP_H / 2, name, { 'text-anchor': 'middle', fill: threadColor(tk.thread), 'font-size': fontSizes.xs, 'font-weight': 700 });
      const label = text(g, 18, CHIP_H / 2, tk.text, { fill: c.text, 'font-family': mono, 'font-size': fontSizes.xs });
      const tag = text(g, CHIP_W - 4, CHIP_H / 2, '', { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs });
      return { g, box, label, tag, thread: tk.thread };
    };
    const dress = (chip: Chip, tk: StageTick): void => {
      chip.g.setAttribute('opacity', '1');
      chip.label.textContent = tk.text;
      chip.box.setAttribute('stroke-dasharray', tk.blocked ? '3 2' : 'none');
      chip.label.setAttribute('fill', tk.blocked ? c.textMuted : c.text);
      chip.tag.textContent = tk.blocked ? t('label.asleep', 'Asleep') : '';
    };
    const makeMark = (): SVGGElement => {
      const g = el('g', {}, markLayer);
      el('rect', { x: 0, y: 0, width: MARK_W, height: CHIP_H, rx: 3, fill: c.danger }, g);
      text(g, MARK_W / 2, CHIP_H / 2, '', { 'text-anchor': 'middle', fill: c.stateInk, 'font-family': mono, 'font-size': fontSizes.xs, 'font-weight': 700 });
      return g;
    };

    const clearAll = (): void => {
      for (const ch of [...live.values(), ...ghosts.values()]) drop(ch.g);
      for (const m of [...liveMarks, ...ghostMarks]) drop(m);
      live = new Map();
      ghosts = new Map();
      liveMarks = [];
      ghostMarks = [];
      bandLayer.replaceChildren();
    };

    const showRegs = (regs: (number | null)[]): void => {
      if (!round) return;
      for (let i = 0; i < sides.length; i += 1) {
        const v = regs[i];
        sides[i]!.reg.textContent = `${round.register} = ${v === null || v === undefined ? '–' : String(v)}`;
      }
    };
    const showPointers = (pcs: number[], finished: boolean[], asleep: boolean[]): void => {
      for (let i = 0; i < sides.length; i += 1) {
        const s = sides[i]!;
        const pc = pcs[i];
        if (pc === undefined) throw new Error(`스레드 ${i} 의 지금 줄이 없다`);
        if (finished[i]) {
          s.pointer.setAttribute('visibility', 'hidden');
          s.state.textContent = t('label.finished', 'Finished');
        } else {
          s.pointer.setAttribute('visibility', 'visible');
          s.pointer.setAttribute('x', String(COL_X[i] ?? 0));
          s.pointer.setAttribute('y', String(lineY(pc) + PROG_H / 2));
          s.state.textContent = asleep[i] ? t('label.asleep', 'Asleep') : '';
        }
        for (const g of progLines) {
          if (Number(g.getAttribute('data-thread')) !== i) continue;
          const line = Number(g.getAttribute('data-line'));
          g.setAttribute('opacity', line < pc ? '0.45' : '1');
        }
      }
    };
    const placeTokens = (owner: number | null, queue: number[], ms: number): void => {
      if (!round || round.lock === null) return;
      for (let i = 0; i < tokens.length; i += 1) {
        const q = queue.indexOf(i);
        const at = owner === i ? OWNER_SLOT : q >= 0 ? { x: QUEUE_SLOT.x + q * 22, y: QUEUE_SLOT.y } : homeOf(i);
        moveTo(tokens[i]!, at.x, at.y, ms);
      }
    };

    const stage: MutexStage = {
      begin(r, cap, ms) {
        round = r;
        caption.textContent = cap;
        countText.textContent = `${r.shared} = ${r.start}`;
        // 프로그램 — 두 스레드 같은 글자, 한 벌씩
        for (const g of progLines) g.remove();
        progLines.length = 0;
        for (let i = 0; i < sides.length; i += 1) {
          const s = sides[i]!;
          const name = r.threads[i];
          if (name === undefined) throw new Error(`스레드 ${i} 의 이름이 없다`);
          s.head.textContent = t('label.thread', 'Thread {name}', { name });
          s.state.textContent = '';
          s.home.setAttribute('visibility', r.lock === null ? 'hidden' : 'visible');
          r.program.forEach((line, n) => {
            const g = el('g', { 'data-thread': i, 'data-line': n }, progLayer);
            text(g, (COL_X[i] ?? 0) + 14, lineY(n) + PROG_H / 2, line, { fill: c.text, 'font-family': mono, 'font-size': fontSizes.sm });
            progLines.push(g);
          });
        }
        showRegs(r.threads.map(() => null));
        showPointers(r.threads.map(() => 0), r.threads.map(() => false), r.threads.map(() => false));
        // 자물쇠
        lockBox.setAttribute('visibility', r.lock === null ? 'hidden' : 'visible');
        lockTitle.textContent = r.lock === null ? '' : t('label.lock', 'Lock {name}', { name: r.lock });
        tokens.forEach((g, i) => {
          const tag = g.querySelector('text');
          if (tag) tag.textContent = r.threads[i] ?? '';
          g.setAttribute('visibility', r.lock === null ? 'hidden' : 'visible');
        });
        placeTokens(null, [], ms);
        // 앞 판은 지우지 않고 흐리게 남긴다 — 새 판의 토막이 같은 줄을 새 자리로 옮긴다
        for (const [k, ch] of live) {
          ch.g.setAttribute('opacity', '0.3');
          ghosts.set(k, ch);
        }
        live = new Map();
        for (const m of liveMarks) {
          m.setAttribute('opacity', '0.3');
          ghostMarks.push(m);
        }
        liveMarks = [];
        bandLayer.replaceChildren();
      },

      chunk(ch, cap, ms) {
        if (!round) throw new Error('판이 시작되기 전에 토막이 왔다');
        caption.textContent = cap;
        const n = ch.ticks.length;
        ch.ticks.forEach((tk, idx) => {
          const key = keyOf(tk);
          const delay = n > 1 ? (idx * ms * 0.4) / n : 0;
          const dur = Math.max(0, ms - delay);
          let chip = ghosts.get(key);
          if (chip) {
            ghosts.delete(key);
          } else {
            chip = makeChip(tk);
            setAt(chip.g, (COL_X[tk.thread] ?? 0) + 12, lineY(tk.line) + (PROG_H - CHIP_H) / 2);
          }
          live.set(key, chip);
          dress(chip, tk);
          chipLayer.appendChild(chip.g);
          moveTo(chip.g, CHIP_X, rowY(tk.tick) + (ROW_H - CHIP_H) / 2 - 1, dur, delay);

          if (tk.holder !== null) {
            el('rect', { x: BAND_X, y: rowY(tk.tick), width: 4, height: ROW_H, fill: threadColor(tk.holder) }, bandLayer);
          }
          if (tk.lost) {
            let mark = ghostMarks.shift();
            if (!mark) {
              mark = makeMark();
              setAt(mark, CHIP_X + CHIP_W - MARK_W, rowY(tk.tick) + (ROW_H - CHIP_H) / 2 - 1);
            }
            mark.setAttribute('opacity', '1');
            const label = mark.querySelector('text');
            if (label) label.textContent = t('label.lost', '{old} → {new}', { old: tk.lost.old, new: tk.lost.new });
            markLayer.appendChild(mark);
            liveMarks.push(mark);
            moveTo(mark, MARK_X, rowY(tk.tick) + (ROW_H - CHIP_H) / 2 - 1, dur, delay);
          }
        });
        countText.textContent = `${round.shared} = ${ch.count}`;
        showRegs(ch.regs);
        showPointers(ch.pcs, ch.finished, ch.asleep);
        placeTokens(ch.owner, ch.queue, ms);
      },

      finish(cap, ms) {
        caption.textContent = cap;
        // 새 판에 자리가 없는 앞 판의 줄과 표시는 여기서 사라진다
        const gone = [...ghosts.values()].map((ch) => ch.g).concat(ghostMarks);
        ghosts = new Map();
        ghostMarks = [];
        for (const g of gone) {
          moveTo(g, (moving.get(g)?.x ?? 0) + 24, moving.get(g)?.y ?? 0, ms);
          later(ms, () => drop(g));
        }
      },

      reset() {
        clearAll();
        round = null;
        caption.textContent = '';
      },
    };

    return {
      ...stage,
      destroy() {
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        moving.clear();
        root.remove();
      },
    };
  },
};
