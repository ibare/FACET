/**
 * 한 박자에 둘 — 그림.
 *
 * 왼쪽에 명령어가 프로그램 순서대로 줄 서고, 줄의 맨 앞 둘이 두 자리 문 앞에 선다.
 * 문 너머에는 박자마다 한 줄씩, 두 자리가 있다. 둘째가 첫째의 결과를 읽지 않으면
 * 둘이 문을 지나 같은 박자 줄에 나란히 앉고, 읽으면 둘째 자리의 문이 닫혀 첫째만
 * 들어간다. 박자 줄은 명령어 수만큼 마련한다 — 하나씩 냈을 때의 박자 수다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { DualIssueScene, DualIssueSceneInstr } from './scene.js';

const H = 340;
const PAD = 16;
/** 줄과 박자 칸 사이 — 문이 여기 선다 */
const DOOR_GAP = 44;
/** 박자 이름 칸 */
const BEAT_LABEL = 58;
const SEAT_GAP = 10;
const CARD_W_MAX = 170;
const ROWS_TOP = 58;
const ROWS_BOTTOM = 14;
const ROW_H_MAX = 48;
const CARD_H_MAX = 32;
/** 문 앞에 설 때 줄에서 문 쪽으로 나서는 거리 */
const NUDGE = 16;
/** 카드 안 — 명령어 글자가 시작하는 자리 */
const TEXT_X = 34;
/** 고정폭 글꼴의 글자 폭 비 */
const MONO_RATIO = 0.6;
const PAIR_MS = 600;
const ISSUE_MS = 900;
const TICK_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Layout = {
  cw: number;
  rh: number;
  ch: number;
  qx: number;
  doorX: number;
  beatLabelX: number;
  seatX: [number, number];
  charW: number;
};

type Handles = {
  cards: Map<number, SVGGElement>;
  connector: { el: SVGLineElement; x1: number; y1: number; x2: number; y2: number } | null;
  bar: { el: SVGRectElement; h: number } | null;
};

function r(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function narrowCount(initialData: Record<string, unknown> | undefined): number {
  const program = initialData?.program;
  return Array.isArray(program) ? program.length : 0;
}

function layoutFor(n: number): Layout {
  const w = PIECE_CANVAS_W;
  const cw = Math.min(CARD_W_MAX, (w - 2 * PAD - DOOR_GAP - BEAT_LABEL - SEAT_GAP) / 3);
  const rows = Math.max(n, 2);
  const rh = Math.min(ROW_H_MAX, (H - ROWS_TOP - ROWS_BOTTOM) / rows);
  const ch = Math.min(CARD_H_MAX, rh - 10);
  const qx = PAD;
  const doorX = qx + cw + DOOR_GAP / 2;
  const beatLabelX = qx + cw + DOOR_GAP;
  const seat0 = beatLabelX + BEAT_LABEL;
  return {
    cw,
    rh,
    ch,
    qx,
    doorX,
    beatLabelX,
    seatX: [seat0, seat0 + cw + SEAT_GAP],
    charW: parseFloat(fontSizes.sm) * MONO_RATIO,
  };
}

/** 명령어 글자를 조각으로 — 레지스터마다 자리를 짚을 수 있게 */
function tokens(ins: DualIssueSceneInstr): { s: string; role: 'op' | 'dest' | 'src' | 'sep'; src?: number }[] {
  const out: { s: string; role: 'op' | 'dest' | 'src' | 'sep'; src?: number }[] = [
    { s: ins.op, role: 'op' },
    { s: ' ', role: 'sep' },
    { s: ins.dest, role: 'dest' },
  ];
  ins.srcs.forEach((s, i) => {
    out.push({ s: ', ', role: 'sep' });
    out.push({ s, role: 'src', src: i });
  });
  return out;
}

/** 카드 안에서 한 조각의 글자 자리 (시작 글자 번호 · 길이) */
function tokenSpan(
  ins: DualIssueSceneInstr,
  pick: (tk: { role: string; src?: number }) => boolean,
): { at: number; len: number } | null {
  let at = 0;
  for (const tk of tokens(ins)) {
    if (pick(tk)) return { at, len: tk.s.length };
    at += tk.s.length;
  }
  return null;
}

export const dualIssueStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DualIssueScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const baseCount = narrowCount(params.initialData);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const cardY = (L: Layout, row: number): number => ROWS_TOP + L.rh * row + (L.rh - L.ch) / 2;
    const label = (id: number): string => t('label.instr', 'I{n}', { n: id + 1 });

    function caption(scene: DualIssueScene): string {
      if (scene.instrs.length === 0) return '';
      if (scene.done) {
        return t('caption.done', '{k} beats used — one at a time would take {n}.', {
          k: scene.done.beats,
          n: scene.done.serial,
        });
      }
      const g = scene.gate;
      if (g) {
        const a = label(g.head);
        if (g.next === null) {
          return t('caption.last', 'Nothing stands behind {a} — it enters alone.', { a });
        }
        const b = label(g.next);
        const reg = scene.instrs[g.head]?.dest ?? '';
        if (g.hits.length > 0) {
          return t('caption.wait', '{a} produces {r}; {b} behind it reads {r} — {b} waits.', {
            a,
            b,
            r: reg,
          });
        }
        return t('caption.pair', '{a} produces {r}; {b} behind it does not read {r} — both enter.', {
          a,
          b,
          r: reg,
        });
      }
      if (scene.beats > 0) {
        const last = scene.placed.filter((p) => p.beat === scene.beats);
        const a = label(last[0]?.id ?? 0);
        if (last.length > 1) {
          return t('caption.together', 'Beat {k}: {a} and {b} enter together.', {
            k: scene.beats,
            a,
            b: label(last[1]!.id),
          });
        }
        return t('caption.alone', 'Beat {k}: {a} enters alone.', { k: scene.beats, a });
      }
      return t('caption.start', 'Instructions line up in program order before a two-seat door.');
    }

    function drawCard(
      L: Layout,
      parent: Element,
      id: number,
      ins: DualIssueSceneInstr,
      x: number,
      y: number,
      fill: string,
      marks: { dest?: string; srcs?: Map<number, string> },
    ): SVGGElement {
      const g = el('g', { transform: `translate(${r(x)},${r(y)})` }, parent);
      el('rect', { x: 0, y: 0, width: r(L.cw), height: r(L.ch), rx: 5, fill, stroke: c.border }, g);
      const idText = el(
        'text',
        {
          x: 8,
          y: r(L.ch / 2),
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        g,
      );
      idText.textContent = label(id);
      let at = 0;
      for (const tk of tokens(ins)) {
        const tx = TEXT_X + at * L.charW;
        const mark =
          tk.role === 'dest' ? marks.dest : tk.role === 'src' ? marks.srcs?.get(tk.src ?? -1) : undefined;
        if (mark) {
          el(
            'rect',
            {
              x: r(tx - 2),
              y: r(L.ch / 2 - 9),
              width: r(tk.s.length * L.charW + 4),
              height: 18,
              rx: 3,
              fill: 'none',
              stroke: mark,
              'stroke-width': 2,
            },
            g,
          );
        }
        if (tk.role !== 'sep') {
          const tx2 = el(
            'text',
            {
              x: r(tx),
              y: r(L.ch / 2),
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: tk.role === 'op' ? c.textMuted : c.text,
            },
            g,
          );
          tx2.textContent = tk.s;
        } else if (tk.s.trim() !== '') {
          const sep = el(
            'text',
            {
              x: r(tx),
              y: r(L.ch / 2),
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            g,
          );
          sep.textContent = tk.s.trim();
        }
        at += tk.s.length;
      }
      return g;
    }

    function drawStatic(scene: DualIssueScene): Handles {
      svg.textContent = '';
      const handles: Handles = { cards: new Map(), connector: null, bar: null };
      const n = scene.instrs.length > 0 ? scene.instrs.length : baseCount;
      const L = layoutFor(n);

      const cap = el(
        'text',
        {
          x: PAD,
          y: 24,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        },
        svg,
      );
      cap.textContent = caption(scene);

      const head = (x: number, text: string): void => {
        const h = el(
          'text',
          { x: r(x), y: ROWS_TOP - 8, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
          svg,
        );
        h.textContent = text;
      };
      head(L.qx, t('label.queue', 'program order'));
      head(L.beatLabelX, t('label.issued', 'issued'));

      // 박자 줄 — 명령어 수만큼. 쓰지 않은 줄은 흐리게 남는다
      for (let i = 0; i < n; i += 1) {
        const used = i < scene.beats;
        const y = cardY(L, i);
        const lb = el(
          'text',
          {
            x: r(L.beatLabelX),
            y: r(y + L.ch / 2),
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: used ? c.text : c.textMuted,
            opacity: used ? 1 : 0.55,
          },
          svg,
        );
        lb.textContent = t('label.beat', 'beat {k}', { k: i + 1 });
        for (const sx of L.seatX) {
          el(
            'rect',
            {
              x: r(sx),
              y: r(y),
              width: r(L.cw),
              height: r(L.ch),
              rx: 5,
              fill: 'none',
              stroke: c.border,
              'stroke-dasharray': '4 3',
            },
            svg,
          );
        }
      }

      // 문 — 두 자리가 뚫린 벽
      const gate = scene.gate;
      const open = [0, 1].map((k) => ({ top: cardY(L, k) - 4, bottom: cardY(L, k) + L.ch + 4 }));
      const wallTop = ROWS_TOP - 2;
      const wallBottom = ROWS_TOP + L.rh * 2 + 2;
      const wall = [
        [wallTop, open[0]!.top],
        [open[0]!.bottom, open[1]!.top],
        [open[1]!.bottom, wallBottom],
      ];
      for (const [y1, y2] of wall) {
        el(
          'line',
          { x1: r(L.doorX), y1: r(y1!), x2: r(L.doorX), y2: r(y2!), stroke: c.text, 'stroke-width': 4 },
          svg,
        );
      }
      const seatOpen = (k: number): boolean =>
        gate !== null && (k === 0 || (gate.next !== null && gate.hits.length === 0));
      for (let k = 0; k < 2; k += 1) {
        const o = open[k]!;
        const tone = seatOpen(k) ? c.success : c.textMuted;
        for (const y of [o.top, o.bottom]) {
          el(
            'line',
            { x1: r(L.doorX - 6), y1: r(y), x2: r(L.doorX + 6), y2: r(y), stroke: tone, 'stroke-width': 2 },
            svg,
          );
        }
      }
      if (gate && gate.next !== null && gate.hits.length > 0) {
        const o = open[1]!;
        const h = o.bottom - o.top;
        const bar = el(
          'rect',
          { x: r(L.doorX - 3), y: r(o.top), width: 6, height: r(h), fill: c.danger },
          svg,
        );
        handles.bar = { el: bar, h };
      }

      // 줄 선 명령어 — 문 앞 둘은 견주는 동안 문 쪽으로 나선다
      scene.queue.forEach((id, row) => {
        const ins = scene.instrs[id];
        if (!ins) return;
        const inGate = gate !== null && (id === gate.head || id === gate.next);
        const marks: { dest?: string; srcs?: Map<number, string> } = {};
        if (gate && id === gate.head) marks.dest = c.accent;
        if (gate && id === gate.next) {
          const srcs = new Map<number, string>();
          ins.srcs.forEach((_, i) => srcs.set(i, gate.hits.includes(i) ? c.danger : c.success));
          marks.srcs = srcs;
        }
        const x = L.qx + (inGate ? NUDGE : 0);
        handles.cards.set(id, drawCard(L, svg, id, ins, x, cardY(L, row), c.bgSubtle, marks));
      });

      // 견준 결과 — 읽는 자리에서 만드는 자리로 잇는다
      if (gate && gate.next !== null && gate.hits.length > 0) {
        const a = scene.instrs[gate.head];
        const b = scene.instrs[gate.next];
        const ds = a ? tokenSpan(a, (tk) => tk.role === 'dest') : null;
        const ss = b ? tokenSpan(b, (tk) => tk.role === 'src' && tk.src === gate.hits[0]) : null;
        if (ds && ss) {
          const x0 = L.qx + NUDGE + TEXT_X;
          const x1 = x0 + (ds.at + ds.len / 2) * L.charW;
          const y1 = cardY(L, 0) + L.ch / 2 + 9;
          const x2 = x0 + (ss.at + ss.len / 2) * L.charW;
          const y2 = cardY(L, 1) + L.ch / 2 - 9;
          const line = el(
            'line',
            { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), stroke: c.danger, 'stroke-width': 2 },
            svg,
          );
          handles.connector = { el: line, x1, y1, x2, y2 };
        }
      }

      // 들어간 명령어
      for (const p of scene.placed) {
        const ins = scene.instrs[p.id];
        if (!ins) continue;
        const seat = p.seat === 1 ? 1 : 0;
        handles.cards.set(
          p.id,
          drawCard(L, svg, p.id, ins, L.seatX[seat], cardY(L, p.beat - 1), c.bg, {}),
        );
      }
      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        let elapsed = 0;
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
          elapsed += TICK_MS;
          const p = clamp01(elapsed / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, TICK_MS);
        timers.add(id);
      });
    }

    const place = (g: SVGGElement | undefined, x: number, y: number): void => {
      g?.setAttribute('transform', `translate(${r(x)},${r(y)})`);
    };

    async function render(
      next: DualIssueScene,
      _prev: DualIssueScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const hs = drawStatic(next);
      const step = next.step;
      if (!opts.animate || !step) return;
      const L = layoutFor(next.instrs.length);

      if (step.kind === 'pair' && next.gate) {
        const g = next.gate;
        const ids = g.next === null ? [g.head] : [g.head, g.next];
        await tween(PAIR_MS, mine, (p) => {
          const pn = ease(clamp01(p / 0.5));
          ids.forEach((id, row) => place(hs.cards.get(id), L.qx + NUDGE * pn, cardY(L, row)));
          const pl = ease(clamp01((p - 0.5) / 0.5));
          if (hs.connector) {
            const k = hs.connector;
            k.el.setAttribute('x2', String(r(k.x1 + (k.x2 - k.x1) * pl)));
            k.el.setAttribute('y2', String(r(k.y1 + (k.y2 - k.y1) * pl)));
            k.el.setAttribute('opacity', pl > 0 ? '1' : '0');
          }
          if (hs.bar) hs.bar.el.setAttribute('height', String(r(hs.bar.h * pl)));
        });
      } else if (step.kind === 'issue') {
        const beatRow = step.beat - 1;
        const shift = step.shift;
        await tween(ISSUE_MS, mine, (p) => {
          const pa = ease(clamp01(p / 0.5));
          const pb = ease(clamp01((p - 0.5) / 0.5));
          step.ids.forEach((id, seat) => {
            const sx = L.seatX[seat === 1 ? 1 : 0];
            const fromX = L.qx + NUDGE;
            place(
              hs.cards.get(id),
              fromX + (sx - fromX) * pa,
              cardY(L, seat) + (cardY(L, beatRow) - cardY(L, seat)) * pb,
            );
          });
          const pq = ease(clamp01((p - 0.35) / 0.65));
          next.queue.forEach((id, row) => {
            const was = row + shift;
            const fromX = L.qx + (was < 2 ? NUDGE : 0);
            place(
              hs.cards.get(id),
              fromX + (L.qx - fromX) * pq,
              cardY(L, was) + (cardY(L, row) - cardY(L, was)) * pq,
            );
          });
        });
      } else {
        return;
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
        svg.textContent = '';
      },
    };
  },
};
