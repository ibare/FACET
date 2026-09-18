/**
 * 처리량과 지연 — 두 기계가 나란히 달린다.
 *
 * 위 줄은 파이프라인이 없는 기계, 아래 줄은 다섯 단계 파이프라인. 두 줄이 한 시계를
 * 나눠 쓴다. 명령어 조각이 왼쪽 대기열에서 단계 칸을 지나 오른쪽 받이로 실제로
 * 옮겨 간다. 받이에 닿은 조각 옆에는 들어간 사이클과 나온 사이클이 붙는다 — 한
 * 조각이 머문 길이는 두 줄이 같고, 받이가 다 차는 때가 갈린다.
 */
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { Say, ThroughputScene } from './scene.js';

type Machine = 'serial' | 'pipe';
const MACHINES: readonly Machine[] = ['serial', 'pipe'];

const H = 330;
const PAD = 10;
const CLOCK_H = 38;
const CAPTION_H = 34;
const LANE_GAP = 12;
const LANE_HEAD = 20;
const ROW_MAX = 20;
const CHIP_W_MAX = 46;
const BOX_W_MAX = 84;
const BOX_GAP = 8;
const SPAN_W = 88;

/** 한 사이클 걸음의 운동. 가장 얇은 걸음 = 이것 + stepMs 500. */
const CYCLE_MS = 380;
/** 여러 사이클을 한 걸음에 묶을 때 사이클 하나의 운동. */
const FAST_CYCLE_MS = 240;
/** WB 에서 받이로 나가는 운동. */
const OUT_MS = 300;

const SVG = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

type Layout = {
  laneTop: Record<Machine, number>;
  rowH: number;
  chipW: number;
  chipH: number;
  queueX: number;
  boxX0: number;
  boxW: number;
  boxY: Record<Machine, number>;
  boxH: number;
  trayX: number;
  captionY: number;
};

function r(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function layoutOf(n: number, depth: number): Layout {
  const W = PIECE_CANVAS_W;
  const laneH = (H - CLOCK_H - CAPTION_H - LANE_GAP) / 2;
  const rowH = Math.min(ROW_MAX, (laneH - LANE_HEAD - 6) / Math.max(1, n));
  const chipH = Math.max(10, rowH - 4);
  const chipW = Math.min(CHIP_W_MAX, W / 13);
  const queueX = PAD;
  const trayX = W - PAD - chipW - SPAN_W;
  const boxX0 = queueX + chipW + 20;
  const boxEnd = trayX - 20;
  const boxW = Math.min(BOX_W_MAX, (boxEnd - boxX0 - BOX_GAP * (depth - 1)) / Math.max(1, depth));
  const bodyH = rowH * n;
  const boxH = Math.min(bodyH, 58);
  const laneTop: Record<Machine, number> = {
    serial: CLOCK_H,
    pipe: CLOCK_H + laneH + LANE_GAP,
  };
  const boxY: Record<Machine, number> = {
    serial: laneTop.serial + LANE_HEAD + (bodyH - boxH) / 2,
    pipe: laneTop.pipe + LANE_HEAD + (bodyH - boxH) / 2,
  };
  return { laneTop, rowH, chipW, chipH, queueX, boxX0, boxW, boxY, boxH, trayX, captionY: H - 12 };
}

function narrowData(raw: unknown): { n: number } {
  const d = (raw ?? {}) as { instructions?: unknown };
  return { n: Array.isArray(d.instructions) ? d.instructions.length : 0 };
}

export const throughputNotLatencyStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ThroughputScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const { n: declared } = narrowData(params.initialData);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 새로 지은 손잡이 — 운동이 이것만 만진다. */
    let chips: Record<Machine, SVGGElement[]> = { serial: [], pipe: [] };
    let spans: Record<Machine, SVGTextElement[]> = { serial: [], pipe: [] };
    let clockText: SVGTextElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function opcode(asm: string): string {
      const m = /^\s*(\S+)/.exec(asm);
      return m ? m[1] : asm;
    }

    /**
     * 단계 식별자는 initialData.stages 에 둔다 — 깊이(단계 수)가 거기서 나오고 알고리즘·장면이
     * 같은 구조에서 셈한다. 표시 이름은 공통 모형의 다섯에 한해 문안으로 푼다.
     */
    function stageLabel(id: string): string {
      switch (id) {
        case 'if':
          return t('stage.if', 'IF');
        case 'id':
          return t('stage.id', 'ID');
        case 'ex':
          return t('stage.ex', 'EX');
        case 'mem':
          return t('stage.mem', 'MEM');
        case 'wb':
          return t('stage.wb', 'WB');
        default:
          return id;
      }
    }

    function rowY(L: Layout, m: Machine, i: number): number {
      return L.laneTop[m] + LANE_HEAD + L.rowH * i + L.rowH / 2;
    }

    function boxCenter(L: Layout, m: Machine, k: number): Pt {
      return { x: L.boxX0 + (L.boxW + BOX_GAP) * k + L.boxW / 2, y: L.boxY[m] + L.boxH * 0.62 };
    }

    function queuePt(L: Layout, m: Machine, i: number): Pt {
      return { x: L.queueX + L.chipW / 2, y: rowY(L, m, i) };
    }

    function trayPt(L: Layout, m: Machine, i: number): Pt {
      return { x: L.trayX + L.chipW / 2, y: rowY(L, m, i) };
    }

    /** 사이클 c 동안 명령어 i 가 있는 자리. WB 를 도는 사이클에는 WB 칸이다. */
    function during(s: ThroughputScene, L: Layout, m: Machine, i: number, c: number): Pt {
      const depth = s.stages.length;
      const rel = c - s.entry[m][i];
      if (rel < 0) return queuePt(L, m, i);
      if (rel < depth) return boxCenter(L, m, rel);
      return trayPt(L, m, i);
    }

    /** 사이클 c 가 끝난 화면의 자리. WB 를 마친 명령어는 받이에 있다. */
    function settled(s: ThroughputScene, L: Layout, m: Machine, i: number, c: number): Pt {
      const depth = s.stages.length;
      if (c - s.entry[m][i] >= depth - 1) return trayPt(L, m, i);
      return during(s, L, m, i, c);
    }

    function exitOf(s: ThroughputScene, m: Machine, i: number): number {
      return s.entry[m][i] + s.stages.length - 1;
    }

    function place(g: SVGGElement, p: Pt): void {
      g.setAttribute('transform', `translate(${r(p.x)},${r(p.y)})`);
    }

    function clockLabel(c: number): string {
      return t('label.cycle', 'cycle {c}', { c });
    }

    function sayText(s: ThroughputScene, say: Say): string {
      const n = s.instructions.length;
      switch (say.kind) {
        case 'ready':
          return t('caption.ready', '{n} instructions wait at each machine.', { n: say.n });
        case 'inside':
          return t('caption.inside', 'Cycle {c}. Instructions inside — pipelined: {p}, not pipelined: {s}.', {
            c: say.c,
            p: say.p,
            s: say.s,
          });
        case 'bothOut':
          return t('caption.bothOut', '{name} leaves both machines at cycle {c}: {lat} cycles inside each.', {
            name: opcode(s.instructions[say.i] ?? ''),
            c: say.c,
            lat: say.lat,
          });
        case 'pipeOut':
          return t('caption.pipeOut', 'Pipelined: {name} in at cycle {a}, out at cycle {c} — still {lat} cycles.', {
            name: opcode(s.instructions[say.i] ?? ''),
            a: say.from,
            c: say.c,
            lat: say.lat,
          });
        case 'serialOut':
          return t('caption.serialOut', 'Not pipelined: {name} in at cycle {a}, out at cycle {c} — still {lat} cycles.', {
            name: opcode(s.instructions[say.i] ?? ''),
            a: say.from,
            c: say.c,
            lat: say.lat,
          });
        case 'pipeDone':
          return t('caption.pipeDone', 'The pipelined machine has all {n} out at cycle {c}. The other has {k}.', {
            n,
            c: say.c,
            k: say.k,
          });
        case 'serialDone':
          return t('caption.serialDone', 'The other machine gets all {n} out at cycle {c}, {d} cycles later.', {
            n,
            c: say.c,
            d: say.d,
          });
      }
    }

    function drawStatic(s: ThroughputScene): Layout {
      svg.textContent = '';
      const n = s.instructions.length || declared;
      const depth = s.stages.length;
      const L = layoutOf(n, depth);
      const W = PIECE_CANVAS_W;
      const hues = categorical(Math.max(1, n), 'vivid');
      chips = { serial: [], pipe: [] };
      spans = { serial: [], pipe: [] };

      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);

      clockText = el(
        'text',
        {
          x: r(W / 2),
          y: 25,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
          fill: colors.text,
        },
        svg,
      );
      clockText.textContent = clockLabel(s.cycle);

      for (const m of MACHINES) {
        const top = L.laneTop[m];
        const entry = s.entry[m];
        const done = entry.filter((_, i) => exitOf(s, m, i) <= s.cycle).length;
        const lastExit = Math.max(0, ...entry.map((_, i) => exitOf(s, m, i)));

        const name = el(
          'text',
          { x: PAD, y: r(top + 13), 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: colors.text },
          svg,
        );
        name.textContent = m === 'serial' ? t('label.serial', 'Not pipelined') : t('label.pipe', 'Pipelined');

        const allOut = n > 0 && done === n;
        const status = el(
          'text',
          {
            x: W - PAD,
            y: r(top + 13),
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': allOut ? 600 : 400,
            fill: allOut ? colors.success : colors.textMuted,
          },
          svg,
        );
        status.textContent = allOut
          ? t('status.done', 'all {n} out by cycle {c}', { n, c: lastExit })
          : t('status.count', 'out: {k} of {n}', { k: done, n });

        // 대기열과 받이의 빈 자리
        for (let i = 0; i < n; i += 1) {
          for (const p of [queuePt(L, m, i), trayPt(L, m, i)]) {
            el(
              'rect',
              {
                x: r(p.x - L.chipW / 2),
                y: r(p.y - L.chipH / 2),
                width: r(L.chipW),
                height: r(L.chipH),
                rx: 3,
                fill: 'none',
                stroke: colors.border,
                'stroke-dasharray': '3 3',
              },
              svg,
            );
          }
        }

        // 단계 칸
        for (let k = 0; k < depth; k += 1) {
          const x = L.boxX0 + (L.boxW + BOX_GAP) * k;
          el(
            'rect',
            { x: r(x), y: r(L.boxY[m]), width: r(L.boxW), height: r(L.boxH), rx: 5, fill: colors.bgSubtle, stroke: colors.border },
            svg,
          );
          const lab = el(
            'text',
            {
              x: r(x + L.boxW / 2),
              y: r(L.boxY[m] + 13),
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            svg,
          );
          lab.textContent = stageLabel(s.stages[k]);
        }

        // 받이 옆의 머문 사이클
        for (let i = 0; i < n; i += 1) {
          const out = exitOf(s, m, i);
          const p = trayPt(L, m, i);
          const span = el(
            'text',
            {
              x: r(p.x + L.chipW / 2 + 8),
              y: r(p.y + 4),
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: out === s.cycle ? colors.text : colors.textMuted,
            },
            svg,
          );
          span.textContent = out <= s.cycle ? t('label.span', 'cycles {a}–{b}', { a: entry[i], b: out }) : '';
          spans[m].push(span);
        }

        // 명령어 조각
        for (let i = 0; i < n; i += 1) {
          const g = el('g', {}, svg);
          const fresh = exitOf(s, m, i) === s.cycle;
          el(
            'rect',
            {
              x: r(-L.chipW / 2),
              y: r(-L.chipH / 2),
              width: r(L.chipW),
              height: r(L.chipH),
              rx: 3,
              fill: hues[i % hues.length],
              stroke: fresh ? colors.accent : 'none',
              'stroke-width': fresh ? 2 : 0,
            },
            g,
          );
          const tx = el(
            'text',
            {
              x: 0,
              y: r(L.chipH * 0.3),
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: colors.stateInk,
            },
            g,
          );
          tx.textContent = opcode(s.instructions[i] ?? '');
          place(g, settled(s, L, m, i, s.cycle));
          chips[m].push(g);
        }
      }

      const cap = el(
        'text',
        {
          x: r(W / 2),
          y: L.captionY,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        },
        svg,
      );
      cap.textContent = sayText(s, s.say);
      return L;
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const frame = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - t0) / ms);
          draw(ease(p));
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, 16);
          timers.add(id);
        };
        frame();
      });
    }

    /** 조각들을 a 자리에서 b 자리로 한 시계에 흘린다. 움직일 것이 없으면 곧바로. */
    async function slide(
      mine: number,
      ms: number,
      from: (m: Machine, i: number) => Pt,
      to: (m: Machine, i: number) => Pt,
    ): Promise<void> {
      const moves: { g: SVGGElement; a: Pt; b: Pt }[] = [];
      for (const m of MACHINES) {
        chips[m].forEach((g, i) => {
          const a = from(m, i);
          const b = to(m, i);
          place(g, a);
          if (a.x !== b.x || a.y !== b.y) moves.push({ g, a, b });
        });
      }
      if (moves.length === 0) return;
      await tween(ms, mine, (p) => {
        for (const { g, a, b } of moves) place(g, { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
      });
    }

    async function render(
      next: ThroughputScene,
      _prev: ThroughputScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const L = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null || step.to <= step.from) return;
      const alive = (): boolean => mine === gen && !destroyed;

      // 정적 그리기가 세운 끝 화면을 이번 걸음의 출발 자리로 돌려 둔다 — 첫 프레임에 끝 자리가 번쩍이지 않게
      for (const m of MACHINES) {
        chips[m].forEach((g, i) => place(g, settled(next, L, m, i, step.from)));
        spans[m].forEach((sp, i) => {
          const out = exitOf(next, m, i);
          if (out > step.from) sp.textContent = '';
        });
      }
      if (clockText) clockText.textContent = clockLabel(step.from);

      const per = step.to - step.from === 1 ? CYCLE_MS : FAST_CYCLE_MS;
      for (let c = step.from + 1; c <= step.to; c += 1) {
        if (!alive()) return;
        if (clockText) clockText.textContent = clockLabel(c);
        const prevC = c - 1;
        const first = c === step.from + 1;
        await slide(
          mine,
          per,
          (m, i) => (first ? settled(next, L, m, i, prevC) : during(next, L, m, i, prevC)),
          (m, i) => during(next, L, m, i, c),
        );
      }
      if (!alive()) return;
      await slide(
        mine,
        OUT_MS,
        (m, i) => during(next, L, m, i, step.to),
        (m, i) => settled(next, L, m, i, step.to),
      );
      if (!alive()) return;
      drawStatic(next);
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
        svg.textContent = '';
      },
    };
  },
};
