/**
 * wait-cycle stage — 동사 "이어져 닫힌다".
 *
 * 스레드 카드를 둘레에 세우고, 잠드는 스레드마다 그 카드에서 자물쇠 주인의 카드로
 * 기다림 화살이 뻗어 나간다. 마지막 화살이 첫 스레드에 꽂히면 점 하나가 화살을 따라
 * 한 바퀴 돌며 고리를 물들인다. 멈춤 걸음에서는 CPU 표지가 스레드를 차례로 들렀다가
 * 아무에게도 머물지 못하고 가운데로 돌아온다.
 *
 * 자물쇠는 비어 있을 때 가운데에 놓여 있고, 잡히면 주인 카드의 머리칸으로 옮겨 간다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { WaitCycleOp } from './algorithm.js';
import type { WaitCycleScene } from './scene.js';

const H = 440;
const NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 650;
const RING_MS = 1000;
const HOP_MS = 340;

type Pt = { x: number; y: number };
type Box = { cx: number; cy: number; left: number; top: number; w: number; h: number };

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return Object.is(out, -0) ? 0 : out;
}

function mk<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  content?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  }
  if (content !== undefined) node.textContent = content;
  parent.appendChild(node);
  return node;
}

function codeOf(op: WaitCycleOp): string {
  if (op.op === 'work') return 'work()';
  return `${op.op}(${op.lock})`;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

/** 두 상자 가운데를 잇는 선을 각 상자 테두리에서 gap 만큼 떨어져 자른다. */
function clipBetween(a: Box, b: Box, gap: number): { from: Pt; to: Pt } {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reach = (bx: Box) =>
    Math.min(
      Math.abs(ux) > 1e-6 ? bx.w / 2 / Math.abs(ux) : Infinity,
      Math.abs(uy) > 1e-6 ? bx.h / 2 / Math.abs(uy) : Infinity,
    ) + gap;
  const ra = reach(a);
  const rb = reach(b);
  return {
    from: { x: a.cx + ux * ra, y: a.cy + uy * ra },
    to: { x: b.cx - ux * rb, y: b.cy - uy * rb },
  };
}

export const waitCycleStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    const SM = parseFloat(fontSizes.sm);
    const MD = parseFloat(fontSizes.md);
    const LINE_H = Math.round(SM * 1.45);
    const HEAD_H = Math.round(MD * 1.9);
    const MARGIN = 16;
    const CAPTION_BAND = 54;
    const TOP = 40;
    const CHIP_W = Math.round(SM * 2.8);
    const CHIP_H = Math.round(SM * 1.5);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // ---- 자리 셈 (장면의 바탕에서만) ------------------------------------------------

    type Layout = {
      boxes: Map<string, Box>;
      pool: Map<string, Pt>;
      idle: Pt;
      centre: Pt;
    };

    function layoutOf(scene: WaitCycleScene): Layout {
      const n = scene.threads.length;
      const longest = Math.max(...scene.threads.map((th) => th.program.length));
      const cardH = HEAD_H + longest * LINE_H + 10;
      const cardW = Math.min(180, Math.round(W * 0.29));
      const bottom = H - CAPTION_BAND;
      const angles = scene.threads.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1));
      const sins = angles.map((a) => (Math.abs(Math.sin(a)) < 1e-9 ? 0 : Math.sin(a)));
      const coss = angles.map((a) => (Math.abs(Math.cos(a)) < 1e-9 ? 0 : Math.cos(a)));
      const minS = Math.min(...sins);
      const maxS = Math.max(...sins);
      const minC = Math.min(...coss);
      const maxC = Math.max(...coss);
      const ry = maxS - minS > 1e-9 ? (bottom - TOP - cardH) / (maxS - minS) : 0;
      const rx = maxC - minC > 1e-9 ? (W - 2 * MARGIN - cardW) / (maxC - minC) : 0;
      const cy = TOP + cardH / 2 - minS * ry;
      const cx = W / 2 - ((minC + maxC) / 2) * rx;
      const boxes = new Map<string, Box>();
      scene.threads.forEach((th, i) => {
        const bx = cx + (coss[i] ?? 0) * rx;
        const by = cy + (sins[i] ?? 0) * ry;
        boxes.set(th.id, { cx: bx, cy: by, left: bx - cardW / 2, top: by - cardH / 2, w: cardW, h: cardH });
      });
      const gapX = CHIP_W + 12;
      const pool = new Map<string, Pt>();
      scene.locks.forEach((l, i) => {
        pool.set(l, { x: cx + (i - (scene.locks.length - 1) / 2) * gapX, y: cy + CHIP_H * 0.9 });
      });
      return { boxes, pool, idle: { x: cx, y: cy - CHIP_H * 1.4 }, centre: { x: cx, y: cy } };
    }

    function boxOf(lay: Layout, id: string): Box {
      const b = lay.boxes.get(id);
      if (!b) throw new Error(`wait-cycle stage: 스레드 ${id} 의 자리가 없다`);
      return b;
    }

    /** 스레드가 쥘 수 있는 자물쇠의 머리칸 자리 (프로그램에 처음 나오는 차례). */
    function slotOf(scene: WaitCycleScene, lay: Layout, id: string, lock: string): Pt {
      const th = scene.threads.find((x) => x.id === id);
      if (!th) throw new Error(`wait-cycle stage: 스레드 ${id} 가 없다`);
      const order: string[] = [];
      for (const op of th.program) {
        if (op.op !== 'work' && !order.includes(op.lock)) order.push(op.lock);
      }
      const j = order.indexOf(lock);
      if (j < 0) throw new Error(`wait-cycle stage: ${id} 의 프로그램에 ${lock} 이 없다`);
      const b = boxOf(lay, id);
      return { x: b.left + 34 + CHIP_W / 2 + j * (CHIP_W + 5), y: b.top + HEAD_H / 2 };
    }

    function poolOf(lay: Layout, lock: string): Pt {
      const p = lay.pool.get(lock);
      if (!p) throw new Error(`wait-cycle stage: 자물쇠 ${lock} 의 자리가 없다`);
      return p;
    }

    function cpuSpot(lay: Layout, id: string | null): Pt {
      if (id === null) return lay.idle;
      const b = boxOf(lay, id);
      // 둘레 바깥쪽 모서리 위 — 들어오는 화살과 겹치지 않게
      const x = b.cx > lay.centre.x + 1 ? b.left + b.w - CHIP_W / 2 : b.left + CHIP_W / 2;
      return { x, y: b.top - CHIP_H / 2 - 5 };
    }

    // ---- 그리기 조각 ------------------------------------------------------------------

    function lockChip(parent: Element, name: string, at: Pt): SVGGElement {
      const g = mk(parent, 'g', { transform: `translate(${r1(at.x)},${r1(at.y)})` });
      mk(g, 'rect', {
        x: -CHIP_W / 2,
        y: -CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 4,
        fill: c.primary,
      });
      mk(
        g,
        'text',
        {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: c.textInverse,
        },
        name,
      );
      return g;
    }

    function cpuChip(parent: Element, at: Pt, idle: boolean): SVGGElement {
      const g = mk(parent, 'g', { transform: `translate(${r1(at.x)},${r1(at.y)})` });
      mk(g, 'rect', {
        x: -CHIP_W / 2,
        y: -CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: CHIP_H / 2,
        fill: idle ? c.bg : c.itemActive,
        stroke: idle ? c.textMuted : c.itemActive,
        'stroke-width': 1.5,
        ...(idle ? { 'stroke-dasharray': '3 3' } : {}),
      });
      mk(
        g,
        'text',
        {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: idle ? c.textMuted : c.textInverse,
        },
        t('label.cpu', 'CPU'),
      );
      return g;
    }

    type Arrow = { line: SVGLineElement; head: SVGPolygonElement; from: Pt; to: Pt };

    function headPoints(from: Pt, to: Pt): string {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const s = 9;
      const bx = to.x - ux * s;
      const by = to.y - uy * s;
      const pts: Pt[] = [
        to,
        { x: bx - uy * s * 0.5, y: by + ux * s * 0.5 },
        { x: bx + uy * s * 0.5, y: by - ux * s * 0.5 },
      ];
      return pts.map((q) => `${r1(q.x)},${r1(q.y)}`).join(' ');
    }

    function setArrow(a: Arrow, tip: Pt, color: string, width: number): void {
      a.line.setAttribute('x2', String(r1(tip.x)));
      a.line.setAttribute('y2', String(r1(tip.y)));
      a.line.setAttribute('stroke', color);
      a.line.setAttribute('stroke-width', String(width));
      a.head.setAttribute('points', headPoints(a.from, tip));
      a.head.setAttribute('fill', color);
    }

    // ---- 정적 그리기 (정본) -------------------------------------------------------------

    type Handles = {
      lay: Layout;
      arrows: Map<string, Arrow>;
      locks: Map<string, SVGGElement>;
      cards: Map<string, SVGRectElement>;
      cpu: SVGGElement;
      front: SVGGElement;
    };

    function drawStatic(scene: WaitCycleScene): Handles {
      svg.textContent = '';
      const lay = layoutOf(scene);
      const ownerOf = new Map(scene.owners.map((o) => [o.lock, o.owner]));
      const pcOf = new Map(scene.pcs.map((o) => [o.thread, o.pc]));
      const statusOf = new Map(scene.status.map((o) => [o.thread, o.status]));
      const inRing = (id: string) => scene.ring.includes(id);
      const step = scene.step;

      // 틱 표시
      if (scene.tick !== null) {
        mk(
          svg,
          'text',
          {
            x: MARGIN,
            y: 22,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: c.text,
          },
          t('label.tick', 'Tick {n}', { n: scene.tick }),
        );
      }

      // 카드
      const cards = new Map<string, SVGRectElement>();
      for (const th of scene.threads) {
        const b = boxOf(lay, th.id);
        const st = statusOf.get(th.id);
        const pc = pcOf.get(th.id);
        if (st === undefined || pc === undefined) {
          throw new Error(`wait-cycle stage: 스레드 ${th.id} 의 상태가 장면에 없다`);
        }
        const ringed = inRing(th.id);
        const edge = ringed ? c.danger : st === 'asleep' ? c.itemComparing : c.border;
        const card = mk(svg, 'rect', {
          x: b.left,
          y: b.top,
          width: b.w,
          height: b.h,
          rx: 8,
          fill: st === 'done' ? c.bgSubtle : c.bg,
          stroke: edge,
          'stroke-width': ringed || st === 'asleep' ? 2 : 1.25,
          ...(st === 'asleep' ? { 'stroke-dasharray': '6 4' } : {}),
        });
        cards.set(th.id, card);
        mk(svg, 'line', {
          x1: b.left,
          y1: b.top + HEAD_H,
          x2: b.left + b.w,
          y2: b.top + HEAD_H,
          stroke: c.border,
          'stroke-width': 1,
        });
        mk(
          svg,
          'text',
          {
            x: b.left + 12,
            y: b.top + HEAD_H / 2,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: c.text,
          },
          th.id,
        );
        if (st !== 'ready') {
          mk(
            svg,
            'text',
            {
              x: b.left + b.w - 10,
              y: b.top + HEAD_H / 2,
              'text-anchor': 'end',
              'dominant-baseline': 'central',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              'font-weight': 600,
              fill: st === 'asleep' ? (ringed ? c.danger : c.itemComparing) : c.textMuted,
            },
            st === 'asleep' ? t('label.asleep', 'asleep') : t('label.done', 'done'),
          );
        }
        th.program.forEach((op, i) => {
          const y = b.top + HEAD_H + 5 + LINE_H * (i + 0.5);
          const justRan = step?.kind === 'tick' && step.thread === th.id && step.line === i;
          const stuck = st === 'asleep' && i === pc;
          if (justRan) {
            mk(svg, 'rect', {
              x: b.left + 6,
              y: y - LINE_H / 2,
              width: b.w - 12,
              height: LINE_H,
              rx: 3,
              fill: stuck ? c.danger : c.itemActive,
              'fill-opacity': 0.16,
            });
          }
          if ((st === 'ready' && i === pc) || stuck) {
            mk(
              svg,
              'text',
              {
                x: b.left + 12,
                y,
                'dominant-baseline': 'central',
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                fill: stuck ? c.danger : c.itemActive,
              },
              '▸',
            );
          }
          mk(
            svg,
            'text',
            {
              x: b.left + 26,
              y,
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': stuck ? 700 : 400,
              fill: stuck ? c.danger : i < pc ? c.textMuted : c.text,
            },
            codeOf(op),
          );
        });
      }

      // 기다림 화살
      const arrows = new Map<string, Arrow>();
      const gArrows = mk(svg, 'g', {});
      for (const e of scene.waits) {
        const { from, to } = clipBetween(boxOf(lay, e.from), boxOf(lay, e.to), 6);
        const ringed = inRing(e.from) && inRing(e.to);
        const color = ringed ? c.danger : c.itemComparing;
        const line = mk(gArrows, 'line', {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: color,
          'stroke-width': ringed ? 3 : 2,
          'stroke-linecap': 'butt',
        });
        const head = mk(gArrows, 'polygon', { points: headPoints(from, to), fill: color });
        arrows.set(e.from, { line, head, from, to });
        // 화살 옆에 기다리는 자물쇠 이름 — 둘레 바깥쪽으로 비켜 둔다
        const mid = lerp(from, to, 0.5);
        const ox = mid.x - lay.centre.x;
        const oy = mid.y - lay.centre.y;
        const ol = Math.hypot(ox, oy) || 1;
        mk(
          gArrows,
          'text',
          {
            x: mid.x + (ox / ol) * 14,
            y: mid.y + (oy / ol) * 14,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: color,
          },
          e.lock,
        );
      }

      // 자물쇠 — 비었으면 가운데, 잡혔으면 주인의 머리칸
      const locks = new Map<string, SVGGElement>();
      for (const l of scene.locks) {
        const who = ownerOf.get(l);
        if (who === undefined) throw new Error(`wait-cycle stage: 자물쇠 ${l} 의 주인 칸이 없다`);
        const at = who === null ? poolOf(lay, l) : slotOf(scene, lay, who, l);
        locks.set(l, lockChip(svg, l, at));
      }

      const cpu = cpuChip(svg, cpuSpot(lay, scene.cpu), scene.cpu === null);
      const front = mk(svg, 'g', {});

      // 캡션 — 지금 일어난 일. 폭을 넘으면 낱말 사이에서 두 줄로 나눈다
      const lines = wrap(captionOf(scene), W - 2 * MARGIN);
      lines.forEach((ln, i) => {
        mk(
          svg,
          'text',
          {
            x: W / 2,
            y: H - CAPTION_BAND / 2 + (i - (lines.length - 1) / 2) * MD * 1.3,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.text,
          },
          ln,
        );
      });

      return { lay, arrows, locks, cards, cpu, front };
    }

    /** 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)는 한 칸, 나머지는 반 칸 남짓. */
    function roughWidth(str: string): number {
      let w = 0;
      for (const ch of str) w += /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? MD : MD * 0.56;
      return w;
    }

    function wrap(str: string, max: number): string[] {
      const words = str.split(' ');
      if (roughWidth(str) <= max || words.length < 2) return [str];
      let best = 1;
      let bestGap = Infinity;
      for (let k = 1; k < words.length; k += 1) {
        const gap = Math.abs(roughWidth(words.slice(0, k).join(' ')) - roughWidth(words.slice(k).join(' ')));
        if (gap < bestGap) {
          bestGap = gap;
          best = k;
        }
      }
      return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }

    function captionOf(scene: WaitCycleScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'No tick yet. Every lock is free.');
      if (step.kind === 'halt') {
        const h = scene.halted;
        if (!h) throw new Error('wait-cycle stage: 멈춤 걸음에 멈춤 기록이 없다');
        if (h.asleep === 0 && h.ready === 0) {
          return t('caption.end', 'Every thread has finished. Finished: {done}.', { done: h.done });
        }
        return t(
          'caption.halt',
          'Ready: {ready} · Asleep: {asleep} · Finished: {done} — no thread can take this tick.',
          { ready: h.ready, asleep: h.asleep, done: h.done },
        );
      }
      const th = scene.threads.find((x) => x.id === step.thread);
      const op = th?.program[step.line];
      if (!op) throw new Error(`wait-cycle stage: ${step.thread} 의 ${step.line} 번 줄이 없다`);
      const need = (v: string | null, what: string): string => {
        if (v === null) throw new Error(`wait-cycle stage: ${step.outcome} 걸음에 ${what} 가 없다`);
        return v;
      };
      const lock = step.outcome === 'ran' ? '' : need(step.lock, 'lock');
      const other = step.outcome === 'blocked' || step.outcome === 'handed' ? need(step.other, 'other') : '';
      switch (step.outcome) {
        case 'took':
          return t('caption.took', '{thread} runs lock({lock}). It was free — now {thread} holds it.', {
            thread: step.thread,
            lock,
          });
        case 'blocked':
          if (scene.ring[0] === step.thread) {
            return t('caption.closed', '{thread} runs lock({lock}). Held by {owner}. Follow the arrows: {ring}', {
              thread: step.thread,
              lock,
              owner: other,
              ring: [...scene.ring, step.thread].join(' → '),
            });
          }
          return t('caption.blocked', '{thread} runs lock({lock}). Held by {owner} — {thread} sleeps and waits.', {
            thread: step.thread,
            lock,
            owner: other,
          });
        case 'ran':
          return t('caption.ran', '{thread} runs {code}.', { thread: step.thread, code: codeOf(op) });
        case 'released':
          return t('caption.released', '{thread} runs unlock({lock}). No one is waiting, so it is free.', {
            thread: step.thread,
            lock,
          });
        case 'handed':
          return t('caption.handed', '{thread} runs unlock({lock}). Handed to {heir}, who wakes up.', {
            thread: step.thread,
            lock,
            heir: other,
          });
      }
    }

    // ---- 시계 -------------------------------------------------------------------------

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tickFn = () => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tickFn();
          }, 16);
          timers.add(id);
        };
        tickFn();
      });
    }

    function place(g: SVGGElement, at: Pt): void {
      g.setAttribute('transform', `translate(${r1(at.x)},${r1(at.y)})`);
    }

    // ---- 걸음 ---------------------------------------------------------------------------

    async function animateStep(next: WaitCycleScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (!step) return;
      const lay = h.lay;
      const live = () => mine === gen && !destroyed;

      if (step.kind === 'halt') {
        // CPU 표지가 다음 차례부터 스레드를 하나씩 들르고, 머물 곳이 없어 가운데로 돌아온다
        const ids = next.threads.map((th) => th.id);
        const lastIdx = step.cpuFrom === null ? -1 : ids.indexOf(step.cpuFrom);
        const tour: Pt[] = [cpuSpot(lay, step.cpuFrom)];
        for (let k = 1; k <= ids.length; k += 1) {
          const id = ids[(lastIdx + k + ids.length) % ids.length];
          if (id !== undefined) tour.push(cpuSpot(lay, id));
        }
        tour.push(lay.idle);
        const hops = tour.length - 1;
        await tween(HOP_MS * hops, mine, (p) => {
          const pos = p * hops;
          const i = Math.min(hops - 1, Math.floor(pos));
          const a = tour[i];
          const b = tour[i + 1];
          if (a && b) place(h.cpu, lerp(a, b, pos - i));
        });
        return;
      }

      const fromCpu = cpuSpot(lay, step.cpuFrom);
      const toCpu = cpuSpot(lay, step.thread);

      // 움직일 자물쇠 — 잡기 · 넘기기 · 놓기
      let chip: { g: SVGGElement; a: Pt; b: Pt } | null = null;
      if (step.lock !== null) {
        const g = h.locks.get(step.lock);
        if (g && step.outcome === 'took') {
          chip = { g, a: poolOf(lay, step.lock), b: slotOf(next, lay, step.thread, step.lock) };
        } else if (g && step.outcome === 'handed' && step.other !== null) {
          chip = {
            g,
            a: slotOf(next, lay, step.thread, step.lock),
            b: slotOf(next, lay, step.other, step.lock),
          };
        } else if (g && step.outcome === 'released') {
          chip = { g, a: slotOf(next, lay, step.thread, step.lock), b: poolOf(lay, step.lock) };
        }
      }

      // 새로 뻗는 화살 — 막힌 스레드에서 주인으로
      const grow = step.outcome === 'blocked' ? h.arrows.get(step.thread) : undefined;
      const closes = step.outcome === 'blocked' && next.ring[0] === step.thread;
      const ringArrows: Arrow[] = [];
      if (closes) {
        for (const id of next.ring) {
          const a = h.arrows.get(id);
          if (a) ringArrows.push(a);
        }
        // 고리가 아직 물들기 전 — 기다림 색으로 돌려 둔다
        for (const a of ringArrows) setArrow(a, a === grow ? a.from : a.to, c.itemComparing, 2);
        for (const id of next.ring) h.cards.get(id)?.setAttribute('stroke', c.itemComparing);
      } else if (grow) {
        setArrow(grow, grow.from, c.itemComparing, 2);
      }

      place(h.cpu, fromCpu);
      if (chip) place(chip.g, chip.a);

      await tween(MOVE_MS, mine, (p) => {
        place(h.cpu, lerp(fromCpu, toCpu, p));
        if (chip) place(chip.g, lerp(chip.a, chip.b, p));
        if (grow) setArrow(grow, lerp(grow.from, grow.to, p), c.itemComparing, 2);
      });
      if (!live() || !closes || ringArrows.length === 0) return;

      // 화살을 따라 한 바퀴 — 지나간 화살부터 고리 색으로
      const first = ringArrows[0];
      if (!first) return;
      const dot = mk(h.front, 'circle', { cx: first.from.x, cy: first.from.y, r: 6, fill: c.danger });
      const n = ringArrows.length;
      await tween(RING_MS, mine, (p) => {
        const pos = p * n;
        const i = Math.min(n - 1, Math.floor(pos));
        ringArrows.forEach((a, k) => {
          if (k < i || (k === i && pos - i >= 1)) setArrow(a, a.to, c.danger, 3);
        });
        next.ring.forEach((id, k) => {
          if (k <= i) h.cards.get(id)?.setAttribute('stroke', c.danger);
        });
        const a = ringArrows[i];
        if (!a) return;
        const at = lerp(a.from, a.to, pos - i);
        dot.setAttribute('cx', String(r1(at.x)));
        dot.setAttribute('cy', String(r1(at.y)));
      });
    }

    return {
      async render(next: WaitCycleScene, _prev: WaitCycleScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animateStep(next, handles, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
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
