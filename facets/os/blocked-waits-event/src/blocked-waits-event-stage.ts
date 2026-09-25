/**
 * blocked-waits-event 의 그림.
 *
 * 주인공은 줄이다. 준비 줄 · CPU · 끝난 것들이 위에 한 줄로 서고, 그 아래에 **사건마다 따로 선
 * 대기 줄**이 놓인다. 대기 줄의 오른쪽 끝은 그 사건이 들어오는 문이다.
 *
 * 운동
 *   - 잠든다 — CPU 에서 내려와 제 사건의 줄 끝에 선다
 *   - 깨어난다 — 사건이 문에서 출발해 제 줄을 따라 흘러가 맨 앞에 닿고, 닿은 하나만 준비 줄 끝으로
 *     올라간다. 다른 줄에 선 것은 움직이지 않는다
 *   - 실행 · 끝 — 준비 줄 맨 앞이 CPU 로, CPU 의 것이 끝난 자리로 옮겨 간다
 * 위쪽의 CPU 띠는 틱마다 누가 CPU 를 썼는지 칠한다. 칠해지지 않은 지나간 칸은 CPU 가 빈 틱이다.
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
  type SceneRenderer,
  type Translate,
} from '@ffacet/core/runtime';
import type { BlockedWaitsEventScene, Snapshot } from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';

const M = 16;
const GAP = 8;
const BOX_H = 30;
const BOX_W_MAX = 76;
const PORT_W_MAX = 132;

const RULER_Y = 22;
const RULER_H = 20;
const RULER_LEFT = 64;
const TOP_LABEL_Y = 88;
const TOP_BOX_Y = 98;
const LANES_TOP = 156;
const LANE_PITCH_MAX = 72;
const CAPTION_Y = 312;
const LINE_H = 18;

const MOVE_MS = 380;
const PULSE_MS = 260;

type Pt = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 줄들의 모습에서 자리를 셈한다. 폭은 캔버스에서 역산한다. */
function makeLayout(scene: BlockedWaitsEventScene) {
  const W = PIECE_CANVAS_W;
  const n = Math.max(scene.procs.length, 1);
  const k = Math.max(scene.events.length, 1);
  const cpuPad = 14;
  const boxW = Math.min(BOX_W_MAX, Math.floor((W - 2 * M - 2 * cpuPad - 48 - 2 * n * GAP) / (2 * n + 1)));
  const readyLeft = M;
  const readyEnd = readyLeft + n * (boxW + GAP) - GAP;
  const cpuX = readyEnd + 24;
  const cpuW = boxW + 2 * cpuPad;
  const doneX = cpuX + cpuW + 24;
  const portW = Math.min(PORT_W_MAX, Math.floor(W * 0.22));
  const portX = W - M - portW;
  const troughRight = portX - 10;
  const lanePitch = Math.min(LANE_PITCH_MAX, Math.floor((CAPTION_Y - 24 - LANES_TOP) / k));
  const horizon = Math.max(scene.horizon, 1);
  const cellW = (W - M - RULER_LEFT) / horizon;

  function laneTop(e: number): number {
    return LANES_TOP + e * lanePitch;
  }
  function troughY(e: number): number {
    return laneTop(e) + 16;
  }
  function place(snap: Snapshot, proc: string): Pt {
    const r = snap.ready.indexOf(proc);
    if (r >= 0) return { x: readyLeft + (n - 1 - r) * (boxW + GAP), y: TOP_BOX_Y };
    if (snap.cpu === proc) return { x: cpuX + cpuPad, y: TOP_BOX_Y };
    const d = snap.done.indexOf(proc);
    if (d >= 0) return { x: doneX + d * (boxW + GAP), y: TOP_BOX_Y };
    for (let e = 0; e < snap.wait.length; e += 1) {
      const q = snap.wait[e] ?? [];
      const i = q.indexOf(proc);
      if (i >= 0) return { x: M + 6 + i * (boxW + GAP), y: troughY(e) + 4 };
    }
    throw new Error(`그림: ${proc} 가 어느 줄에도 없다`);
  }
  return {
    W, n, boxW, readyLeft, readyEnd, cpuX, cpuW, doneX, portX, portW, troughRight,
    laneTop, troughY, place, horizon, cellW,
  };
}

type Layout = ReturnType<typeof makeLayout>;

export const blockedWaitsEventStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let procEls = new Map<string, SVGGElement>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [key, v] of Object.entries(attrs)) e.setAttribute(key, typeof v === 'number' ? String(round(v)) : v);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    }

    // 표시 이름은 문안이다 — 식별자마다 키를 적어 둔다. 모르는 식별자는 이름을 지어내지 않고 던진다.
    const procLabels: Record<string, () => string> = {
      editor: () => t('label.proc.editor', 'Editor'),
      copier: () => t('label.proc.copier', 'Copier'),
      calc: () => t('label.proc.calc', 'Calculator'),
    };
    const eventLabels: Record<string, () => string> = {
      disk: () => t('label.event.disk', 'Disk reply'),
      key: () => t('label.event.key', 'Key press'),
    };
    function procName(id: string): string {
      const name = procLabels[id];
      if (name === undefined) throw new Error(`그림: 프로세스 ${id} 의 표시 이름이 없다`);
      return name();
    }
    function eventName(id: string): string {
      const name = eventLabels[id];
      if (name === undefined) throw new Error(`그림: 사건 ${id} 의 표시 이름이 없다`);
      return name();
    }

    function colorsFor(scene: BlockedWaitsEventScene): readonly string[] {
      return categorical(Math.max(scene.procs.length, 1), 'vivid');
    }
    function inkOf(ink: readonly string[], scene: BlockedWaitsEventScene, proc: string): string {
      const v = ink[scene.procs.indexOf(proc)];
      if (v === undefined) throw new Error(`그림: ${proc} 의 색이 없다`);
      return v;
    }
    function eventAt(scene: BlockedWaitsEventScene, e: number): string {
      const id = scene.events[e];
      if (id === undefined) throw new Error(`그림: ${e} 번째 사건이 없다`);
      return eventName(id);
    }

    function drawRuler(scene: BlockedWaitsEventScene, L: Layout, g: Element, ink: readonly string[]): void {
      node('text', {
        x: M, y: RULER_Y + RULER_H / 2 + 4,
        fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600,
      }, g, t('label.cpu', 'CPU'));
      const now = scene.tick;
      for (let cell = 0; cell < L.horizon; cell += 1) {
        const x = RULER_LEFT + cell * L.cellW;
        const span = scene.runs.find((r) => r.from <= cell && (r.to === null ? now !== null && cell <= now : cell < r.to));
        const past = now !== null && cell < now;
        const attrs: Record<string, string | number> = {
          x: x + 1, y: RULER_Y, width: L.cellW - 2, height: RULER_H, rx: 3,
        };
        if (span !== undefined) {
          attrs['fill'] = inkOf(ink, scene, span.proc);
          attrs['stroke'] = 'none';
        } else if (past) {
          attrs['fill'] = 'none';
          attrs['stroke'] = c.textMuted;
          attrs['stroke-dasharray'] = '3 3';
        } else {
          attrs['fill'] = c.bgSubtle;
          attrs['stroke'] = c.border;
        }
        node('rect', attrs, g);
        node('text', {
          x: x + L.cellW / 2, y: RULER_Y + RULER_H + 13, 'text-anchor': 'middle',
          fill: now === cell ? c.text : c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
          'font-weight': now === cell ? 700 : 400,
        }, g, String(cell));
      }
      if (now !== null) {
        const mx = now >= L.horizon ? RULER_LEFT + L.horizon * L.cellW : RULER_LEFT + (now + 0.5) * L.cellW;
        node('path', {
          d: `M ${round(mx - 5)} ${RULER_Y - 9} L ${round(mx + 5)} ${RULER_Y - 9} L ${round(mx)} ${RULER_Y - 2} Z`,
          fill: c.accent, stroke: c.text, 'stroke-width': 0.8,
        }, g);
      }
    }

    function drawFrames(scene: BlockedWaitsEventScene, L: Layout, g: Element): void {
      const label = (x: number, y: number, s: string) =>
        node('text', { x, y, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, g, s);
      label(L.readyLeft, TOP_LABEL_Y, t('label.ready', 'Ready queue'));
      label(L.cpuX, TOP_LABEL_Y, t('label.cpu', 'CPU'));
      label(L.doneX, TOP_LABEL_Y, t('label.done', 'Finished'));
      for (let i = 0; i < L.n; i += 1) {
        node('rect', {
          x: L.readyLeft + i * (L.boxW + GAP), y: TOP_BOX_Y, width: L.boxW, height: BOX_H, rx: 5,
          fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3',
        }, g);
      }
      const busy = scene.now.cpu !== null;
      node('rect', {
        x: L.cpuX, y: TOP_BOX_Y - 8, width: L.cpuW, height: BOX_H + 16, rx: 8,
        fill: c.bgSubtle, stroke: busy ? c.itemActive : c.border, 'stroke-width': busy ? 2.5 : 1.2,
      }, g);
      // 준비 줄 맨 앞 → CPU, CPU → 끝
      const ay = TOP_BOX_Y + BOX_H / 2;
      for (const [x1, x2] of [[L.readyEnd + 3, L.cpuX - 3], [L.cpuX + L.cpuW + 3, L.doneX - 3]] as const) {
        node('path', {
          d: `M ${round(x1)} ${ay} L ${round(x2)} ${ay} M ${round(x2 - 5)} ${ay - 4} L ${round(x2)} ${ay} L ${round(x2 - 5)} ${ay + 4}`,
          fill: 'none', stroke: c.textMuted, 'stroke-width': 1.2,
        }, g);
      }

      scene.events.forEach((ev, e) => {
        const top = L.laneTop(e);
        const ty = L.troughY(e);
        const th = BOX_H + 8;
        label(M, top + 10, t('label.queue', 'Waiting for: {event}', { event: eventName(ev) }));
        node('rect', {
          x: M, y: ty, width: L.troughRight - M, height: th, rx: 6,
          fill: c.bgSubtle, stroke: c.border,
        }, g);
        // 사건이 들어오는 문
        node('rect', {
          x: L.portX, y: ty, width: L.portW, height: th, rx: 6,
          fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.2,
        }, g);
        node('path', {
          d: `M ${round(L.portX)} ${ty + th / 2} L ${round(L.troughRight)} ${ty + th / 2}`,
          stroke: c.textMuted, 'stroke-width': 1.2,
        }, g);
        node('text', {
          x: L.portX + L.portW / 2, y: ty + 15, 'text-anchor': 'middle',
          fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600,
        }, g, eventName(ev));
        const next = scene.arrivals
          .filter((a) => a.event === e)
          .reduce<number | null>((m, a) => (m === null || a.at < m ? a.at : m), null);
        node('text', {
          x: L.portX + L.portW / 2, y: ty + 30, 'text-anchor': 'middle',
          fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
        }, g, next === null
          ? t('label.arriveNone', 'Arrives: —')
          : t('label.arrive', 'Arrives: tick {tick}', { tick: next }));
      });
    }

    function drawProcs(scene: BlockedWaitsEventScene, L: Layout, g: Element, ink: readonly string[]): void {
      procEls = new Map();
      const asleep = new Set(scene.now.wait.flat());
      scene.procs.forEach((p) => {
        const at = L.place(scene.now, p);
        const sleeping = asleep.has(p);
        const grp = node('g', { transform: `translate(${round(at.x)} ${round(at.y)})` }, g);
        node('rect', {
          x: 0, y: 0, width: L.boxW, height: BOX_H, rx: 5,
          fill: sleeping ? c.bgSubtle : c.bg,
          stroke: inkOf(ink, scene, p), 'stroke-width': 2.2,
          ...(sleeping ? { 'stroke-dasharray': '4 3' } : {}),
        }, grp);
        node('text', {
          x: L.boxW / 2, y: BOX_H / 2 + 4, 'text-anchor': 'middle',
          fill: sleeping ? c.textMuted : c.text, 'font-family': fonts.body, 'font-size': fontSizes.xs,
          'font-weight': 600,
        }, grp, procName(p));
        procEls.set(p, grp);
      });
    }

    function captionLines(scene: BlockedWaitsEventScene): string[] {
      const step = scene.step;
      if (step === null) return [];
      const lines: string[] = [];
      for (const h of step.happenings) {
        const proc = procName(h.proc);
        if (h.kind === 'run') lines.push(t('caption.run', '{proc} runs.', { proc }));
        else if (h.kind === 'done') lines.push(t('caption.done', '{proc} finishes.', { proc }));
        else if (h.kind === 'sleep') {
          lines.push(t('caption.sleep', '{proc} sleeps. Waiting for: {event}', {
            proc, event: eventAt(scene, h.event),
          }));
        } else {
          lines.push(t('caption.wake', '{event} arrives → {proc} wakes. Ticks asleep: {n}', {
            proc, event: eventAt(scene, h.event), n: h.slept,
          }));
        }
      }
      if (step.idle > 0) lines.push(t('caption.idle', 'CPU idle ticks just before: {n}', { n: step.idle }));
      const woke = step.happenings.some((h) => h.kind === 'wake');
      const sleepers = scene.now.wait.some((q) => q.length > 0);
      if (scene.now.cpu === null && sleepers) lines.push(t('caption.cpuIdle', 'The CPU is idle.'));
      if (woke || scene.now.cpu === null) {
        const justSlept = new Set(step.happenings.filter((h) => h.kind === 'sleep').map((h) => h.proc));
        scene.now.wait.forEach((q, e) => {
          for (const p of q) {
            if (justSlept.has(p)) continue;
            lines.push(t('caption.stay', 'Still asleep: {proc} · waiting for: {event}', {
              proc: procName(p), event: eventAt(scene, e),
            }));
          }
        });
      }
      return lines;
    }

    function drawCaption(scene: BlockedWaitsEventScene, g: Element): void {
      const title = scene.tick === null
        ? t('caption.before', 'Before the first tick')
        : t('caption.tick', 'Tick: {tick}', { tick: scene.tick });
      node('text', {
        x: M, y: CAPTION_Y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700,
      }, g, title);
      const lines = captionLines(scene);
      const pitch = Math.min(LINE_H, (H - 8 - CAPTION_Y) / Math.max(lines.length, 1));
      lines.forEach((s, i) => {
        node('text', {
          x: M + 96, y: CAPTION_Y + i * pitch, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm,
        }, g, s);
      });
    }

    function drawStatic(scene: BlockedWaitsEventScene): Layout {
      svg.textContent = '';
      const L = makeLayout(scene);
      const ink = colorsFor(scene);
      const base = node('g', {}, svg);
      drawRuler(scene, L, base, ink);
      drawFrames(scene, L, base);
      drawCaption(scene, base);
      drawProcs(scene, L, node('g', {}, svg), ink);
      node('g', {}, svg); // 흐르는 사건이 지나가는 층
      return L;
    }

    function tween(ms: number, mine: number, draw: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        if (destroyed || mine !== gen) return finish();
        waiters.add(finish);
        const start = performance.now();
        const frame = (): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          const u = Math.min(1, (performance.now() - start) / ms);
          draw(ease(u));
          if (u >= 1) return finish();
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    /** 세로 먼저, 가로 나중 — 줄 사이를 오갈 때 다른 줄을 가로지르지 않게. */
    function along(a: Pt, b: Pt, u: number): Pt {
      const dy = Math.abs(b.y - a.y);
      const dx = Math.abs(b.x - a.x);
      const total = dx + dy;
      if (total === 0) return a;
      const s = u * total;
      if (s <= dy) return { x: a.x, y: a.y + Math.sign(b.y - a.y) * s };
      return { x: a.x + Math.sign(b.x - a.x) * (s - dy), y: b.y };
    }

    function setAt(p: string, at: Pt): void {
      procEls.get(p)?.setAttribute('transform', `translate(${round(at.x)} ${round(at.y)})`);
    }

    async function play(next: BlockedWaitsEventScene, L: Layout, mine: number): Promise<void> {
      const step = next.step;
      if (step === null) return;
      const first = step.frames[0];
      if (first === undefined) return;
      // 요소는 끝 자리에 서 있다 — 이 틱 앞의 자리로 되돌려 두고 출발한다
      for (const p of next.procs) setAt(p, L.place(first, p));
      const layer = svg.lastElementChild;

      for (let i = 0; i < step.happenings.length; i += 1) {
        const h = step.happenings[i];
        const from = step.frames[i];
        const to = step.frames[i + 1];
        if (h === undefined || from === undefined || to === undefined) return;
        if (mine !== gen || destroyed) return;

        if (h.kind === 'wake' && layer !== null) {
          const ty = L.troughY(h.event) + (BOX_H + 8) / 2;
          const head = L.place(from, h.proc);
          const x0 = L.portX;
          const x1 = head.x + L.boxW;
          const dot = node('circle', { cx: x0, cy: ty, r: 6, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, layer);
          await tween(PULSE_MS, mine, (u) => dot.setAttribute('cx', String(round(x0 + (x1 - x0) * u))));
          if (mine !== gen || destroyed) return;
          dot.remove();
        }

        const moving = next.procs
          .map((p) => ({ p, a: L.place(from, p), b: L.place(to, p) }))
          .filter((m) => m.a.x !== m.b.x || m.a.y !== m.b.y);
        await tween(MOVE_MS, mine, (u) => {
          for (const m of moving) setAt(m.p, along(m.a, m.b, u));
        });
      }
    }

    const renderer: SceneRenderer<BlockedWaitsEventScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const L = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await play(next, L, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
