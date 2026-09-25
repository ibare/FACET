/**
 * 비선점 stage — CPU 는 넘어가고 자물쇠는 남는다.
 *
 * 스레드는 우선순위 차례로 위에서 아래로 선다 (높은 쪽이 위). 왼쪽 길의 CPU 칩은 틱마다 그 틱에
 * 실행된 줄 옆으로 **움직인다** — 높은 쪽이 오면 위로 뛰어오르고, 높은 쪽이 잠들면 아래로 되돌아온다.
 * 오른쪽 길의 자물쇠는 주인의 손 자리에 머문다. CPU 가 몇 번을 오가도 자물쇠는 주인이 놓는 틱에만 옮긴다.
 * 막힌 스레드는 자물쇠로 점선 줄을 뻗은 채 잠든다.
 */
import {
  type CanvasView,
  type ViewMountParams,
  type ViewInstance,
  type Palette,
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { NoPreemptionScene, NoPreemptionSceneThread } from './scene';

const H = 392;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 700;

type Box = {
  thread: NoPreemptionSceneThread;
  top: number;
  height: number;
  /** 줄 i 의 가운데 y */
  lineY: (i: number) => number;
};

type Layout = {
  w: number;
  boxX0: number;
  boxX1: number;
  cpuX: number;
  lockX: number;
  lineH: number;
  boxes: Map<string, Box>;
  freeY: number;
  idleY: number;
};

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r1(v) : v));
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function layoutOf(scene: NoPreemptionScene): Layout {
  const w = PIECE_CANVAS_W;
  const top = 46;
  const bottom = H - 70;
  const headH = 28;
  const pad = 8;
  const gap = 40;
  const ordered = [...scene.threads].sort((a, b) => b.priority - a.priority);
  const totalLines = ordered.reduce((n, th) => n + th.lines.length, 0);
  const n = ordered.length;
  const room = bottom - top - n * (headH + 2 * pad) - Math.max(0, n - 1) * gap;
  const lineH = totalLines > 0 ? Math.min(24, room / totalLines) : 24;
  const boxes = new Map<string, Box>();
  let y = top;
  for (const th of ordered) {
    const bTop = y;
    const height = headH + 2 * pad + th.lines.length * lineH;
    boxes.set(th.id, {
      thread: th,
      top: bTop,
      height,
      lineY: (i) => bTop + headH + pad + (i + 0.5) * lineH,
    });
    y += height + gap;
  }
  const lockX = w - 70;
  const boxX1 = w - 150;
  const centers = [...boxes.values()].map((b) => b.top + b.height / 2);
  const first = centers[0] ?? (top + bottom) / 2;
  const last = centers[centers.length - 1] ?? first;
  const mid = (first + last) / 2;
  return { w, boxX0: 84, boxX1, cpuX: 44, lockX, lineH, boxes, freeY: mid, idleY: mid };
}

function ownerOf(scene: NoPreemptionScene, lock: string): string | null {
  for (const [k, v] of scene.owners) if (k === lock) return v;
  return null;
}

function pcOf(scene: NoPreemptionScene, id: string): number {
  for (const [k, v] of scene.pcs) if (k === id) return v;
  return 0;
}

function sleepOf(scene: NoPreemptionScene, id: string): number {
  for (const [k, v] of scene.sleepTicks) if (k === id) return v;
  return 0;
}

export const noPreemptionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function nameOf(id: string): string {
      if (id === 'L') return t('label.L', 'Low priority');
      if (id === 'H') return t('label.H', 'High priority');
      return id;
    }

    function priorityOf(scene: NoPreemptionScene, id: string): number | null {
      for (const th of scene.threads) if (th.id === id) return th.priority;
      return null;
    }

    function lockSpotY(lay: Layout, owner: string | null): number {
      if (owner === null) return lay.freeY;
      const b = lay.boxes.get(owner);
      return b ? b.top + b.height / 2 : lay.freeY;
    }

    function cpuSpotY(lay: Layout, thread: string | null, line: number | null): number {
      if (thread === null || line === null) return lay.idleY;
      const b = lay.boxes.get(thread);
      return b ? b.lineY(line) : lay.idleY;
    }

    type Handles = {
      cpu: SVGGElement | null;
      lock: SVGGElement | null;
      tether: SVGLineElement | null;
      tetherFrom: { x: number; y: number } | null;
      arrivedBoxes: SVGGElement[];
    };

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size ?? fontSizes.sm,
        fill: o.fill ?? c.text,
        'text-anchor': o.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (o.weight) node.setAttribute('font-weight', o.weight);
      node.textContent = s;
      return node;
    }

    /** 앞 글자 뒤에 빈칸 하나를 두고 이어 쓴다 — 글자 폭을 셈하지 않는다 */
    function tspan(parent: SVGTextElement, s: string, o: { size?: string; fill?: string; weight?: string }): void {
      const node = document.createElementNS(SVG_NS, 'tspan');
      node.setAttribute('dx', String(Math.round(smPx * 0.6)));
      if (o.size) node.setAttribute('font-size', o.size);
      if (o.fill) node.setAttribute('fill', o.fill);
      if (o.weight) node.setAttribute('font-weight', o.weight);
      node.textContent = s;
      parent.appendChild(node);
    }

    function drawLock(parent: Element, lay: Layout, name: string, owner: string | null): SVGGElement {
      const g = el(parent, 'g', {});
      const cy = lockSpotY(lay, owner);
      const held = owner !== null;
      const bw = 46;
      const bh = 26;
      const x = lay.lockX;
      // 고리 — 몸 위의 반원
      el(g, 'path', {
        d: `M ${r1(x - 11)} ${r1(cy - bh / 2 + 2)} v -6 a 11 11 0 0 1 22 0 v 6`,
        fill: 'none',
        stroke: held ? c.itemActive : c.textMuted,
        'stroke-width': 3,
      });
      el(g, 'rect', {
        x: x - bw / 2,
        y: cy - bh / 2 + 2,
        width: bw,
        height: bh,
        rx: 5,
        fill: held ? c.itemActive : c.bg,
        stroke: held ? c.itemActive : c.textMuted,
        'stroke-width': 1.5,
      });
      text(g, x, cy + 3, name, { mono: true, weight: '700', anchor: 'middle', fill: held ? c.textInverse : c.text });
      return g;
    }

    function drawStatic(scene: NoPreemptionScene): Handles {
      svg.textContent = '';
      const handles: Handles = { cpu: null, lock: null, tether: null, tetherFrom: null, arrivedBoxes: [] };
      if (scene.threads.length === 0) return handles;
      const lay = layoutOf(scene);
      const step = scene.step;
      const root = el(svg, 'g', {});

      // 머리 줄 — 틱과 두 셈
      const tickLabel =
        scene.tick === null ? t('label.noTick', 'Before the first tick') : t('label.tick', 'Tick {n}', { n: scene.tick });
      text(root, 16, 20, tickLabel, { weight: '700', size: fontSizes.md });
      text(root, lay.w - 16, 14, t('label.switches', 'CPU passed: {n}', { n: scene.switches }), {
        anchor: 'end',
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      text(root, lay.w - 16, 30, t('label.ownerChanges', 'Lock changed hands: {n}', { n: scene.ownerChanges }), {
        anchor: 'end',
        size: fontSizes.xs,
        fill: c.textMuted,
      });

      // 자물쇠 빈 자리
      el(root, 'rect', {
        x: lay.lockX - 25,
        y: lay.freeY - 11,
        width: 50,
        height: 30,
        rx: 6,
        fill: 'none',
        stroke: c.border,
        'stroke-dasharray': '3 3',
      });
      // "비어 있음" 은 자물쇠가 실제로 빈 걸음에만 — 쥔 틱에 떠 있으면 상태로 읽힌다
      if (scene.locks.some((lock) => ownerOf(scene, lock) === null)) {
        text(root, lay.lockX, lay.freeY + 30, t('label.free', 'free'), { anchor: 'middle', size: fontSizes.xs, fill: c.textMuted });
      }

      // 스레드 상자
      for (const box of lay.boxes.values()) {
        const th = box.thread;
        const present = scene.present.includes(th.id);
        const asleep = scene.asleep.includes(th.id);
        const done = scene.done.includes(th.id);
        const g = el(root, 'g', {});
        if (step && step.arrived.includes(th.id)) handles.arrivedBoxes.push(g);
        el(g, 'rect', {
          x: lay.boxX0,
          y: box.top,
          width: lay.boxX1 - lay.boxX0,
          height: box.height,
          rx: 8,
          fill: asleep ? c.bgSubtle : c.bg,
          stroke: present ? c.border : c.textMuted,
          'stroke-width': 1.2,
          ...(present && !asleep ? {} : { 'stroke-dasharray': '5 4' }),
        });
        const headY = box.top + 15;
        const head = text(g, lay.boxX0 + 12, headY, nameOf(th.id), { weight: '700', fill: present ? c.text : c.textMuted });
        tspan(head, t('label.priority', 'Priority {p}', { p: th.priority }), {
          size: fontSizes.xs,
          fill: c.textMuted,
          weight: '400',
        });
        let tag = '';
        if (!present) tag = t('label.notYet', 'Arrives at tick {n}', { n: th.arrive });
        else if (asleep) tag = t('label.asleep', 'Asleep');
        else if (done) tag = t('label.done', 'Done');
        // 머리 오른쪽 — 잠든 틱 수(자취)와 지금 상태
        const slept = sleepOf(scene, th.id);
        const sleptText = slept > 0 ? t('label.sleptTicks', 'Ticks asleep: {n}', { n: slept }) : '';
        const first = sleptText || tag;
        if (first) {
          const right = text(g, lay.boxX1 - 10, headY, first, {
            anchor: 'end',
            size: fontSizes.xs,
            fill: sleptText ? c.danger : c.textMuted,
          });
          if (sleptText && tag) {
            tspan(right, tag, { size: fontSizes.xs, fill: asleep ? c.danger : c.textMuted, weight: asleep ? '700' : '400' });
          }
        }
        const pc = pcOf(scene, th.id);
        th.lines.forEach((line, i) => {
          const y = box.lineY(i);
          const ran = step !== null && step.thread === th.id && step.line === i;
          if (ran) {
            el(g, 'rect', {
              x: lay.boxX0 + 6,
              y: y - lay.lineH / 2 + 1,
              width: lay.boxX1 - lay.boxX0 - 12,
              height: lay.lineH - 2,
              rx: 4,
              fill: c.bgSubtle,
              stroke: c.accent,
              'stroke-width': 1.5,
            });
          }
          const past = i < pc && !ran;
          text(g, lay.boxX0 + 22, y, line, {
            mono: true,
            fill: !present || past ? c.textMuted : c.text,
            weight: ran ? '700' : '400',
          });
        });
        // 쥔 자물쇠와 이은 손 — 상자 오른쪽 가에서 자물쇠까지
        for (const lock of scene.locks) {
          if (ownerOf(scene, lock) === th.id) {
            const cy = box.top + box.height / 2;
            el(root, 'line', {
              x1: lay.boxX1,
              y1: cy,
              x2: lay.lockX - 23,
              y2: cy,
              stroke: c.itemActive,
              'stroke-width': 3,
            });
          }
        }
      }

      // 자물쇠 줄에 선 스레드 — 막힌 줄에서 자물쇠까지 점선
      for (const [lock, q] of scene.queues) {
        const owner = ownerOf(scene, lock);
        const ly = lockSpotY(lay, owner);
        for (const id of q) {
          const b = lay.boxes.get(id);
          if (!b) continue;
          const from = { x: lay.boxX1, y: b.lineY(pcOf(scene, id)) };
          const line = el(root, 'line', {
            x1: from.x,
            y1: from.y,
            x2: lay.lockX - 24,
            y2: ly - 2,
            stroke: c.danger,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          if (step && step.op === 'block' && step.thread === id) {
            handles.tether = line;
            handles.tetherFrom = from;
          }
        }
      }

      // 자물쇠
      for (const lock of scene.locks) {
        const g = drawLock(root, lay, lock, ownerOf(scene, lock));
        if (step && step.lock === lock) handles.lock = g;
      }

      // CPU 칩과 실행 줄로 뻗는 손
      const cpuY = cpuSpotY(lay, step ? step.thread : null, step ? step.line : null);
      const cpu = el(root, 'g', {});
      el(cpu, 'rect', {
        x: lay.cpuX - 26,
        y: cpuY - 12,
        width: 52,
        height: 24,
        rx: 5,
        fill: step ? c.accent : c.bg,
        stroke: step ? c.accent : c.textMuted,
        'stroke-width': 1.5,
      });
      // 노랑 위 글자는 두 테마 모두 어두운 쪽이 읽힌다
      const onAccent = params.theme === 'dark' ? c.bg : c.text;
      text(cpu, lay.cpuX, cpuY + 1, t('label.cpu', 'CPU'), {
        anchor: 'middle',
        weight: '700',
        size: fontSizes.xs,
        fill: step ? onAccent : c.text,
      });
      if (step) {
        el(cpu, 'line', {
          x1: lay.cpuX + 26,
          y1: cpuY,
          x2: lay.boxX0 + 6,
          y2: cpuY,
          stroke: c.accent,
          'stroke-width': 2,
        });
      }
      handles.cpu = cpu;

      // 캡션 — 지금 일어난 일만
      drawCaption(root, scene);
      return handles;
    }

    function cpuLine(scene: NoPreemptionScene): string | null {
      const step = scene.step;
      if (!step || step.cpuFrom === null || step.cpuFrom === step.thread) return null;
      const from = nameOf(step.cpuFrom);
      const to = nameOf(step.thread);
      const a = priorityOf(scene, step.thread);
      const b = priorityOf(scene, step.cpuFrom);
      if (a !== null && b !== null && a > b) {
        return t('caption.cpuPreempt', 'CPU: {from} → {to}. Priority {a} > {b}.', { from, to, a, b });
      }
      if (scene.asleep.includes(step.cpuFrom)) {
        return t('caption.cpuAsleep', 'CPU: {from} → {to}. {from}: asleep.', { from, to });
      }
      if (scene.done.includes(step.cpuFrom)) {
        return t('caption.cpuDone', 'CPU: {from} → {to}. {from}: done.', { from, to });
      }
      return t('caption.cpu', 'CPU: {from} → {to}.', { from, to });
    }

    function opLine(scene: NoPreemptionScene): string {
      const step = scene.step;
      if (!step) return t('caption.start', 'Nothing has run yet. Lock {lock}: free.', { lock: scene.locks.join(', ') });
      const l = step.lock ?? '';
      switch (step.op) {
        case 'take':
          return t('caption.take', 'Takes lock {lock}.', { lock: l });
        case 'block':
          return t('caption.block', 'Lock {lock} is held by {owner}. Cannot take it — asleep.', {
            lock: l,
            owner: step.lockFrom === null ? '' : nameOf(step.lockFrom),
          });
        case 'work':
          for (const name of scene.locks) {
            if (ownerOf(scene, name) === step.thread) {
              return t('caption.workHold', 'Runs one line, still holding lock {lock}.', { lock: name });
            }
          }
          return t('caption.work', 'Runs one line.');
        case 'handoff':
          return t('caption.handoff', 'Releases lock {lock}. Handed straight to {to}, who wakes.', {
            lock: l,
            to: step.lockTo === null ? '' : nameOf(step.lockTo),
          });
        case 'release':
          return t('caption.release', 'Releases lock {lock}. Nobody waiting: free.', { lock: l });
      }
    }

    function drawCaption(root: Element, scene: NoPreemptionScene): void {
      const y0 = H - 46;
      const cl = cpuLine(scene);
      if (cl !== null) text(root, 16, y0, cl, { fill: c.textMuted });
      const step = scene.step;
      const y1 = H - 22;
      if (step) {
        const line = text(root, 16, y1, nameOf(step.thread), { weight: '700' });
        tspan(line, opLine(scene), { weight: '400' });
      } else {
        text(root, 16, y1, opLine(scene));
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    async function animateStep(next: NoPreemptionScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (!step) return;
      const lay = layoutOf(next);
      const cpuTo = cpuSpotY(lay, step.thread, step.line);
      const cpuFrom = cpuSpotY(lay, step.cpuFrom, step.cpuFromLine);
      const cpuDy = cpuFrom - cpuTo;
      const lockMoves = step.lock !== null && step.lockFrom !== step.lockTo && step.op !== 'block';
      const lockDy = lockMoves ? lockSpotY(lay, step.lockFrom) - lockSpotY(lay, step.lockTo) : 0;
      const tether = h.tether;
      const tf = h.tetherFrom;
      const tx2 = tether ? Number(tether.getAttribute('x2')) : 0;
      const ty2 = tether ? Number(tether.getAttribute('y2')) : 0;

      const frame = (p: number): void => {
        // CPU 가 먼저 옮기고 (0 ~ 0.6), 자물쇠 · 막힘은 그 뒤 (0.45 ~ 1)
        const pc = ease(Math.min(1, p / 0.6));
        const pl = ease(Math.max(0, Math.min(1, (p - 0.45) / 0.55)));
        if (h.cpu) h.cpu.setAttribute('transform', `translate(0 ${r1(cpuDy * (1 - pc))})`);
        for (const g of h.arrivedBoxes) g.setAttribute('transform', `translate(${r1(80 * (1 - pc))} 0)`);
        if (h.lock && lockMoves) h.lock.setAttribute('transform', `translate(0 ${r1(lockDy * (1 - pl))})`);
        if (tether && tf) {
          tether.setAttribute('x2', String(r1(tf.x + (tx2 - tf.x) * pl)));
          tether.setAttribute('y2', String(r1(tf.y + (ty2 - tf.y) * pl)));
        }
      };

      frame(0);
      const frames = Math.max(1, Math.round(MOVE_MS / 16));
      for (let i = 1; i <= frames; i += 1) {
        await wait(16);
        if (mine !== gen || destroyed) return;
        frame(i / frames);
      }
    }

    return {
      render(next: NoPreemptionScene, prev: NoPreemptionScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || !next.step || prev === null || prev.tick === next.tick) return;
        return animateStep(next, h, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    } as ViewInstance;
  },
};
