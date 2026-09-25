/**
 * lock-ordering stage — 자물쇠가 번호 차례로 층을 이룬다 (아래가 m1, 위로 갈수록 큰 번호).
 *
 * 스레드마다 세로 기둥 하나. 기둥의 표지는 그 스레드가 쥔 가장 높은 층에 서고(쥔 것이 없으면 바닥),
 * 잠든 스레드의 기다림은 표지에서 기다리는 층까지 뻗는 점선 화살이다. 규칙을 걸면 모든 화살이 위를 향한다.
 * 잡으면 표지가 오르고, 놓으면 내려오고, 넘겨받으면 화살을 타고 오른다.
 * 기둥 옆의 가는 화살은 프로그램이 잡는 차례(첫 잡기 → 둘째 잡기)다.
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
import type { Line } from './algorithm';
import type { LockOrderingScene, Owner, SceneProgram, TickStep, Wait } from './scene';

const H = 436;
const LEFT = 56;
const RIGHT = 10;
const HEAD_Y = 26;
const DONE_Y = 44;
const TOP = 84;
const GROUND = 262;
const PROG_TOP = 292;
const PROG_BOTTOM = 372;
const CAP1_Y = 400;
const CAP2_Y = 422;
const MOVE_MS = 280;
const RULE_MS = 700;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Geo = {
  thread: string;
  x: number;
  color: string;
  markerY: number;
  held: number[]; // 쥔 층의 y
  wait: { y1: number; y2: number } | null;
  slots: { y: number; lock: string; filled: boolean }[];
  order: { y1: number; y2: number } | null;
  done: boolean;
};

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lineText(line: Line): string {
  if (line.op === 'work') return 'work()';
  return `${line.op}(${line.lock})`;
}

function lineKey(line: Line): string {
  return line.op === 'work' ? 'work' : `${line.op}:${line.lock}`;
}

function lockLines(lines: Line[]): string[] {
  return lines.flatMap((l) => (l.op === 'lock' ? [l.lock] : []));
}

export const lockOrderingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const fontPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    }

    function rankY(scene: LockOrderingScene): Map<string, number> {
      const sorted = [...scene.locks].sort((a, b) => a.rank - b.rank);
      const gap = (GROUND - TOP) / Math.max(1, sorted.length);
      return new Map(sorted.map((l, i) => [l.id, GROUND - gap * (i + 1)]));
    }

    function colX(scene: LockOrderingScene, i: number): number {
      const colW = (W - LEFT - RIGHT) / Math.max(1, scene.programs.length);
      return LEFT + colW * (i + 0.5);
    }

    function threadColor(scene: LockOrderingScene, thread: string): string {
      const i = scene.programs.findIndex((p) => p.thread === thread);
      return categorical(scene.programs.length, 'vivid')[i] ?? pal.text;
    }

    function geometry(
      scene: LockOrderingScene,
      programs: SceneProgram[],
      owners: Owner[],
      waits: Wait[],
      done: string[],
    ): Geo[] {
      const ys = rankY(scene);
      const yOf = (lock: string): number => {
        const y = ys.get(lock);
        if (y === undefined) throw new Error(`lock-ordering stage: 자물쇠 ${lock} 의 층이 없다`);
        return y;
      };
      return programs.map((prog, i) => {
        const heldY = owners
          .filter((o) => o.owner === prog.thread)
          .map((o) => yOf(o.lock))
          .sort((a, b) => b - a);
        const markerY = heldY.length === 0 ? GROUND : Math.min(...heldY);
        const w = waits.find((x) => x.thread === prog.thread);
        const uses = [...new Set(prog.lines.flatMap((l) => (l.op === 'work' ? [] : [l.lock])))];
        const firstTwo = lockLines(prog.lines);
        const a = firstTwo[0];
        const b = firstTwo[1];
        return {
          thread: prog.thread,
          x: colX(scene, i),
          color: threadColor(scene, prog.thread),
          markerY,
          held: heldY,
          wait: w === undefined ? null : { y1: markerY, y2: yOf(w.lock) },
          slots: uses.map((lock) => ({
            lock,
            y: yOf(lock),
            filled: owners.some((o) => o.lock === lock && o.owner === prog.thread),
          })),
          order: a !== undefined && b !== undefined ? { y1: yOf(a), y2: yOf(b) } : null,
          done: done.includes(prog.thread),
        };
      });
    }

    function arrow(
      parent: Element,
      x: number,
      y1: number,
      y2: number,
      color: string,
      width: number,
      dashed: boolean,
    ): void {
      const len = Math.abs(y2 - y1);
      if (len < 1) return;
      const dir = y2 < y1 ? -1 : 1;
      const head = Math.min(7, len);
      node(parent, 'line', {
        x1: x,
        y1,
        x2: x,
        y2: y2 - dir * head,
        stroke: color,
        'stroke-width': width,
        ...(dashed ? { 'stroke-dasharray': '4 3' } : {}),
      });
      node(parent, 'path', {
        d: `M ${r2(x)} ${r2(y2)} L ${r2(x - 4.5)} ${r2(y2 - dir * head)} L ${r2(x + 4.5)} ${r2(y2 - dir * head)} Z`,
        fill: color,
      });
    }

    /** 움직이는 층 — 칸 · 기둥 · 표지 · 기다림 화살 · 잡는 차례 화살. */
    function drawDyn(layer: Element, geos: Geo[], pulse: { thread: string; k: number } | null, ring: string | null): void {
      layer.textContent = '';
      const R = Math.min(11, (GROUND - TOP) / 8);
      for (const g of geos) {
        const col = node(layer, 'g', g.done ? { opacity: 0.4 } : {});
        if (g.order !== null) {
          const off = g.order.y2 < g.order.y1 ? -6 : 6;
          arrow(col, g.x + 34, g.order.y1 + off, g.order.y2 - off, pal.textMuted, 1.2, false);
        }
        for (const s of g.slots) {
          node(col, 'rect', {
            x: g.x - 16,
            y: s.y - 6,
            width: 32,
            height: 12,
            rx: 3,
            fill: s.filled ? g.color : pal.bg,
            stroke: s.filled ? g.color : pal.textMuted,
            'stroke-width': 1.2,
          });
        }
        const low = g.held.length === 0 ? null : Math.max(...g.held);
        if (low !== null && low - g.markerY > 1) {
          node(col, 'line', { x1: g.x, y1: low, x2: g.x, y2: g.markerY, stroke: g.color, 'stroke-width': 4 });
        }
        if (g.wait !== null && g.wait.y1 - R - 2 > g.wait.y2 + 8) {
          arrow(col, g.x, g.wait.y1 - R - 2, g.wait.y2 + 8, g.color, 2.4, true);
        }
        const k = pulse !== null && pulse.thread === g.thread ? pulse.k : 1;
        node(col, 'circle', {
          cx: g.x,
          cy: g.markerY,
          r: R * k,
          fill: g.color,
          stroke: ring === g.thread ? pal.text : g.color,
          'stroke-width': ring === g.thread ? 2 : 1,
        });
        node(
          col,
          'text',
          {
            x: g.x,
            y: g.markerY + fontPx * 0.36,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: pal.textInverse,
          },
          g.thread,
        );
      }
    }

    function rankOf(scene: LockOrderingScene, lock: string): number {
      const l = scene.locks.find((x) => x.id === lock);
      if (l === undefined) throw new Error(`lock-ordering stage: 자물쇠 ${lock} 의 번호가 없다`);
      return l.rank;
    }

    function heldText(owners: Owner[], thread: string, scene: LockOrderingScene): string {
      const held = owners
        .filter((o) => o.owner === thread)
        .map((o) => o.lock)
        .sort((a, b) => rankOf(scene, a) - rankOf(scene, b));
      return held.length === 0 ? t('label.nothing', 'nothing') : held.join(', ');
    }

    function captions(scene: LockOrderingScene): [string, string] {
      const step = scene.step;
      if (step === null) {
        const down = scene.writtenDown;
        if (down.length === 0) {
          return [t('caption.startNone', 'As written — every thread already locks the lower number first.'), ''];
        }
        return [
          t('caption.start', 'As written — higher number first: {threads}', {
            threads: down.join(', '),
          }),
          '',
        ];
      }
      if (step.kind === 'rule') {
        const parts = step.changes.map((c) => {
          const [first, second] = lockLines(c.after);
          return t('caption.ruleChange', '{thread}: {first} now comes before {second}.', {
            thread: c.thread,
            first: first ?? '',
            second: second ?? '',
          });
        });
        return [t('caption.ruleHead', 'Rule: every thread locks the lower number first.'), parts.join(' · ')];
      }
      return tickCaptions(scene, step);
    }

    function tickCaptions(scene: LockOrderingScene, s: TickStep): [string, string] {
      const lock = s.lock ?? '';
      let first: string;
      let second = '';
      if (s.kind === 'take') {
        first = t('caption.take', 'Tick {tick} · {thread} takes {lock}.', { tick: s.tick, thread: s.thread, lock });
      } else if (s.kind === 'block') {
        first = t('caption.block', 'Tick {tick} · {thread} sleeps waiting for {lock}. Holder: {holder}.', {
          tick: s.tick,
          thread: s.thread,
          lock,
          holder: s.holder ?? '',
        });
        const held = s.held.join(', ');
        second =
          s.held.length === 0
            ? t('caption.waitEmpty', 'Holds: nothing · waits for: {lock}', { lock })
            : s.upward === true
            ? t('caption.waitHigher', 'Holds: {held} · waits for: {lock} — a higher number.', { held, lock })
            : t('caption.waitLower', 'Holds: {held} · waits for: {lock} — a lower number.', { held, lock });
      } else if (s.kind === 'work') {
        first = t('caption.work', 'Tick {tick} · {thread} runs work() holding {held}.', {
          tick: s.tick,
          thread: s.thread,
          held: heldText(scene.owners, s.thread, scene),
        });
      } else if (s.to === null) {
        first = t('caption.releaseFree', 'Tick {tick} · {thread} releases {lock}. No one is waiting for it.', {
          tick: s.tick,
          thread: s.thread,
          lock,
        });
      } else {
        first = t('caption.releaseHand', 'Tick {tick} · {thread} releases {lock}. {to} wakes up holding it.', {
          tick: s.tick,
          thread: s.thread,
          lock,
          to: s.to,
        });
      }
      const finishedNow = scene.done.includes(s.thread) && !s.wasDone.includes(s.thread);
      if (scene.programs.length > 0 && scene.done.length === scene.programs.length) {
        second = t('caption.allDone', 'All finished. Order: {order}', { order: scene.done.join(' · ') });
      } else if (finishedNow) {
        second = t('caption.finished', '{thread} is finished.', { thread: s.thread });
      }
      return [first, second];
    }

    type Handles = { dyn: Element; lines: Map<string, SVGTextElement[]> };

    function drawStatic(scene: LockOrderingScene): Handles {
      canvas.textContent = '';
      const root = node(canvas, 'g', {});
      const ys = rankY(scene);
      const lines = new Map<string, SVGTextElement[]>();

      for (const l of scene.locks) {
        const y = ys.get(l.id);
        if (y === undefined) continue;
        node(root, 'line', { x1: LEFT - 8, y1: y, x2: W - RIGHT, y2: y, stroke: pal.border, 'stroke-width': 1 });
        node(
          root,
          'text',
          {
            x: 14,
            y: y + fontPx * 0.36,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 600,
            fill: pal.text,
          },
          l.id,
        );
      }
      node(root, 'line', {
        x1: LEFT - 8,
        y1: GROUND,
        x2: W - RIGHT,
        y2: GROUND,
        stroke: pal.border,
        'stroke-width': 1,
        'stroke-dasharray': '2 4',
      });

      const step = scene.step;
      const n = Math.max(1, ...scene.programs.map((p) => p.lines.length));
      const lh = Math.min(17, (PROG_BOTTOM - PROG_TOP) / Math.max(1, n - 1));
      scene.programs.forEach((prog, i) => {
        const x = colX(scene, i);
        const color = threadColor(scene, prog.thread);
        const done = scene.done.indexOf(prog.thread);
        node(
          root,
          'text',
          {
            x,
            y: HEAD_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: color,
          },
          prog.thread,
        );
        if (done >= 0) {
          node(
            root,
            'text',
            {
              x,
              y: DONE_Y,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: pal.textMuted,
            },
            t('label.finished', 'Done #{n}', { n: done + 1 }),
          );
        }
        const pcEntry = scene.pc.find((p) => p.thread === prog.thread);
        const waiting = scene.waits.some((w) => w.thread === prog.thread);
        const changed = step !== null && step.kind === 'rule' && step.changes.some((c) => c.thread === prog.thread);
        const els: SVGTextElement[] = [];
        prog.lines.forEach((line, j) => {
          const y = PROG_TOP + lh * j;
          const executed = step !== null && step.kind !== 'rule' && step.thread === prog.thread && step.line === j;
          const ruleLine = changed && line.op !== 'work';
          if (executed || ruleLine) {
            node(root, 'rect', {
              x: x - 46,
              y: y - fontPx * 0.95,
              width: 92,
              height: fontPx * 1.35,
              rx: 3,
              fill: ruleLine ? pal.accent : pal.bgSubtle,
              opacity: ruleLine ? 0.35 : 1,
            });
          }
          const stuck = waiting && pcEntry !== undefined && pcEntry.pc === j;
          els.push(
            node(
              root,
              'text',
              {
                x: x - 40,
                y,
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                'font-weight': executed || stuck ? 700 : 400,
                fill: stuck ? color : executed || ruleLine ? pal.text : pal.textMuted,
                opacity: done >= 0 ? 0.55 : 1,
              },
              lineText(line),
            ),
          );
        });
        lines.set(prog.thread, els);
      });

      const [c1, c2] = captions(scene);
      node(
        root,
        'text',
        {
          x: W / 2,
          y: CAP1_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: pal.text,
        },
        c1,
      );
      if (c2 !== '') {
        node(
          root,
          'text',
          {
            x: W / 2,
            y: CAP2_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: pal.textMuted,
          },
          c2,
        );
      }

      const dyn = node(root, 'g', {});
      drawDyn(
        dyn,
        geometry(scene, scene.programs, scene.owners, scene.waits, scene.done),
        null,
        step !== null && step.kind !== 'rule' ? step.thread : null,
      );
      return { dyn, lines };
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function mix(a: Geo[], b: Geo[], p: number): Geo[] {
      return b.map((gb, i) => {
        const ga = a[i] ?? gb;
        const markerY = lerp(ga.markerY, gb.markerY, p);
        let wait: Geo['wait'] = null;
        if (ga.wait === null && gb.wait !== null) {
          wait = { y1: gb.wait.y1, y2: lerp(gb.wait.y1, gb.wait.y2, p) };
        } else if (ga.wait !== null && gb.wait === null) {
          wait = markerY > ga.wait.y2 ? { y1: markerY, y2: ga.wait.y2 } : null;
        } else if (ga.wait !== null && gb.wait !== null) {
          wait = { y1: lerp(ga.wait.y1, gb.wait.y1, p), y2: lerp(ga.wait.y2, gb.wait.y2, p) };
        }
        const both = gb.held.filter((y) => ga.held.includes(y));
        return {
          ...gb,
          markerY,
          held: both.length === 0 ? [] : [...both, markerY],
          wait,
          slots: gb.slots.map((s) => ({
            ...s,
            filled: s.filled && ga.slots.some((x) => x.lock === s.lock && x.filled),
          })),
          order:
            ga.order !== null && gb.order !== null
              ? { y1: lerp(ga.order.y1, gb.order.y1, p), y2: lerp(ga.order.y2, gb.order.y2, p) }
              : gb.order,
          done: ga.done,
        };
      });
    }

    async function render(
      next: LockOrderingScene,
      prev: LockOrderingScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      const step = next.step;
      if (!opts.animate || prev === null || step === null) return;

      if (step.kind === 'rule') {
        const before = next.programs.map((p) => {
          const c = step.changes.find((x) => x.thread === p.thread);
          return c === undefined ? p : { thread: p.thread, lines: c.before };
        });
        const ga = geometry(next, before, next.owners, next.waits, next.done);
        const gb = geometry(next, next.programs, next.owners, next.waits, next.done);
        const n = Math.max(1, ...next.programs.map((p) => p.lines.length));
        const lh = Math.min(17, (PROG_BOTTOM - PROG_TOP) / Math.max(1, n - 1));
        const moves: { el: SVGTextElement; dy: number }[] = [];
        for (const c of step.changes) {
          const els = handles.lines.get(c.thread) ?? [];
          c.after.forEach((line, i) => {
            const j = c.before.findIndex((b) => lineKey(b) === lineKey(line));
            const el = els[i];
            if (el !== undefined && j >= 0 && j !== i) moves.push({ el, dy: (j - i) * lh });
          });
        }
        const frame = (p: number): void => {
          for (const m of moves) m.el.setAttribute('transform', `translate(0 ${r2(m.dy * (1 - p))})`);
          drawDyn(handles.dyn, mix(ga, gb, p), null, null);
        };
        frame(0);
        await tween(mine, RULE_MS, frame);
      } else {
        const ga = geometry(next, next.programs, step.wasOwners, step.wasWaits, step.wasDone);
        const gb = geometry(next, next.programs, next.owners, next.waits, next.done);
        const pulse = step.kind === 'work';
        const frame = (p: number): void => {
          drawDyn(
            handles.dyn,
            mix(ga, gb, p),
            pulse ? { thread: step.thread, k: 1 + 0.3 * Math.sin(Math.PI * p) } : null,
            step.thread,
          );
        };
        frame(0);
        await tween(mine, MOVE_MS, frame);
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
