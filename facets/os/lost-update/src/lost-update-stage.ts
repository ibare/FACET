/**
 * 갱신 손실의 무대.
 *
 * 공유 값 칸은 위 가운데에 **값 카드가 쌓이는 자리**다. 쓰기는 새 카드를 제 스레드 쪽에서
 * 밀어 넣어 지금 카드 위에 덮는다 — 덮인 카드는 아래에 가장자리만 남고 글자는 가려진다.
 * 읽기는 맨 위 카드의 값이 스레드의 제 칸으로 내려온다 (원본은 칸에 남는다).
 * 견줌에서는 쌓인 카드를 옆으로 펼쳐 무엇이 덮였는지 드러내고, 있어야 할 값을 곁에 둔다.
 *
 * 정적 그리기가 정본이다. 운동은 그 자리에 아직 못 온 만큼(offset)으로만 그린다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
} from '@ffacet/core/runtime';
import type { LostUpdateScene } from './scene.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms) */
const READ_MS = 700;
const WRITE_MS = 950;
const FAN_MS = 800;

/** 덮인 카드가 삐져나오는 폭 */
const PEEK = 6;
const PEEK_MAX = 3;

function r(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

type Pt = { x: number; y: number };

type Handles = {
  /** 스레드 차례 — 제 칸의 값 묶음 */
  mines: (SVGGElement | null)[];
  /** 카드 차례(아래 → 위) — 카드 묶음 */
  cards: SVGGElement[];
  ghost: SVGGElement | null;
};

export const lostUpdateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const codePx = parseFloat(fontSizes.sm);
    const cw = Math.min(96, W / 6);
    const ch = 40;
    const stack: Pt = { x: W / 2, y: 64 };
    const headY = 136;
    const lineY0 = 162;
    const lineH = 24;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function put<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      content?: string,
    ): SVGElementTagNameMap[K] {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(typeof v === 'number' ? r(v) : v));
      if (content !== undefined) el.textContent = content;
      parent.appendChild(el);
      return el;
    }

    function colX(i: number, n: number): number {
      return (W * (2 * i + 1)) / (2 * n);
    }

    function mineAt(s: LostUpdateScene, i: number): Pt {
      const th = s.threads[i];
      const lines = th === undefined ? 0 : th.lines.length;
      return { x: colX(i, s.threads.length) + cw * 0.35, y: lineY0 + lines * lineH + 26 };
    }

    /** 쌓인 자리 — 맨 위가 stack, 아래로 갈수록 왼쪽 위로 삐져나온다 */
    function stackAt(k: number, len: number): Pt {
      const d = Math.min(PEEK_MAX, len - 1 - k);
      return { x: stack.x - d * PEEK, y: stack.y - d * PEEK };
    }

    /** 펼친 자리 — 맨 위 카드는 제자리, 앞의 것은 왼쪽으로 */
    function rowAt(k: number, len: number): Pt {
      return { x: stack.x - (len - 1 - k) * (cw + 16), y: stack.y };
    }

    function ghostAt(): Pt {
      return { x: stack.x + cw + 56, y: stack.y };
    }

    function threadColor(s: LostUpdateScene, id: string | null): string {
      if (id === null) return colors.textMuted;
      const i = s.threads.findIndex((th) => th.id === id);
      const pal = categorical(Math.max(1, s.threads.length), 'vivid');
      const c = pal[i];
      if (c === undefined) throw new Error(`무대: 모르는 스레드 ${id}`);
      return c;
    }

    function card(
      parent: Element,
      at: Pt,
      value: number,
      stroke: string,
      opts: { dashed?: boolean; strike?: boolean },
    ): SVGGElement {
      const g = put('g', {}, parent);
      put(
        'rect',
        {
          x: at.x - cw / 2,
          y: at.y - ch / 2,
          width: cw,
          height: ch,
          rx: 6,
          fill: colors.bg,
          stroke,
          'stroke-width': 2,
          ...(opts.dashed === true ? { 'stroke-dasharray': '5 4' } : {}),
        },
        g,
      );
      put(
        'text',
        {
          x: at.x,
          y: at.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: opts.dashed === true ? colors.textMuted : colors.text,
        },
        g,
        String(value),
      );
      if (opts.strike === true) {
        put(
          'line',
          {
            x1: at.x - cw / 2 + 10,
            y1: at.y,
            x2: at.x + cw / 2 - 10,
            y2: at.y,
            stroke: colors.danger,
            'stroke-width': 2,
          },
          g,
        );
      }
      return g;
    }

    function tag(at: Pt, line: number, content: string, fill: string): void {
      put(
        'text',
        {
          x: at.x,
          y: at.y + ch / 2 + 16 + line * 15,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill,
        },
        svg,
        content,
      );
    }

    function lineText(s: LostUpdateScene, line: LostUpdateScene['threads'][number]['lines'][number]): string {
      if (line.kind === 'read') return `let ${s.local} = ${s.shared}`;
      return `${s.shared} = ${s.local} + ${line.add}`;
    }

    function caption(s: LostUpdateScene): string {
      const st = s.step;
      if (st.kind === 'start') {
        const top = s.cards[s.cards.length - 1];
        if (top === undefined) throw new Error('무대: 공유 값 카드가 없다');
        return t('caption.start', 'Shared {name}: {v}', { name: s.shared, v: top.value });
      }
      if (st.kind === 'read') {
        return t('caption.read', 'Thread {th} reads {name} — its own {local}: {v}', {
          th: st.thread,
          name: s.shared,
          local: s.local,
          v: st.value,
        });
      }
      if (st.kind === 'write') {
        if (st.stale) {
          return t('caption.writeStale', 'Thread {th} writes {after} over {before} — from its old read {mine}', {
            th: st.thread,
            after: st.after,
            before: st.before,
            mine: st.mine,
          });
        }
        return t('caption.write', 'Thread {th} writes {after} over {before}', {
          th: st.thread,
          after: st.after,
          before: st.before,
        });
      }
      return t('caption.compare', 'Left: {final} · Should be: {expected} · Lost: {lost}', {
        final: st.final,
        expected: st.expected,
        lost: st.lost,
      });
    }

    function drawStatic(s: LostUpdateScene): Handles {
      svg.textContent = '';
      // 층: 스레드 → 공유 칸 → 제 칸의 값 (움직이는 카드가 글자 위로 지나가게)
      const threadLayer = put('g', {}, svg);
      const stackLayer = put('g', {}, svg);
      const mineLayer = put('g', {}, svg);
      const n = s.threads.length;
      const st = s.step;
      const fanned = st.kind === 'compare';
      const len = s.cards.length;

      // 공유 값의 이름
      put(
        'text',
        {
          x: stack.x,
          y: 18,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.text,
        },
        svg,
        s.shared,
      );

      // 있어야 할 값 — 펼칠 때 맨 위 카드 뒤에서 나오도록 카드보다 먼저
      const ghost: SVGGElement | null =
        st.kind === 'compare' ? card(stackLayer, ghostAt(), st.expected, colors.textMuted, { dashed: true }) : null;

      // 카드 — 아래부터 그려 위 카드가 아래 카드를 덮는다
      const cards: SVGGElement[] = [];
      s.cards.forEach((c, k) => {
        const at = fanned ? rowAt(k, len) : stackAt(k, len);
        const stroke = fanned && c.lost ? colors.danger : threadColor(s, c.by);
        cards.push(card(stackLayer, at, c.value, stroke, { strike: fanned && c.lost }));
      });

      if (fanned) {
        s.cards.forEach((c, k) => {
          const at = rowAt(k, len);
          tag(at, 0, c.by === null ? t('label.start', 'start') : c.by, c.lost ? colors.danger : colors.textMuted);
          if (c.lost) tag(at, 1, t('label.covered', 'covered'), colors.danger);
          else if (k === len - 1) tag(at, 1, t('label.final', 'left'), colors.text);
        });
        tag(ghostAt(), 0, t('label.expected', 'should be'), colors.textMuted);
      }

      // 스레드 — 머리 · 두 줄 · 제 칸
      const mines: (SVGGElement | null)[] = [];
      s.threads.forEach((th, i) => {
        const x = colX(i, n);
        const color = threadColor(s, th.id);
        const left = x - cw * 1.1;
        put('circle', { cx: left + 5, cy: headY - 4, r: 5, fill: color }, threadLayer);
        put(
          'text',
          {
            x: left + 16,
            y: headY,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: colors.text,
          },
          threadLayer,
          t('label.thread', 'Thread {th}', { th: th.id }),
        );
        const done = s.done[i] ?? 0;
        th.lines.forEach((line, k) => {
          const y = lineY0 + k * lineH;
          const current = (st.kind === 'read' || st.kind === 'write') && st.thread === th.id && st.line === k;
          if (current) {
            put(
              'rect',
              { x: left - 6, y: y - lineH / 2 - 4, width: cw * 2.4, height: lineH, rx: 4, fill: colors.bgSubtle },
              threadLayer,
            );
            put('rect', { x: left - 6, y: y - lineH / 2 - 4, width: 3, height: lineH, fill: color }, threadLayer);
          }
          put(
            'text',
            {
              x: left + 2,
              y: y + codePx / 3 - 4,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': current ? 700 : 400,
              fill: k < done ? colors.text : colors.textMuted,
            },
            threadLayer,
            lineText(s, line),
          );
        });
        // 제 칸
        const m = mineAt(s, i);
        put(
          'text',
          {
            x: m.x - cw / 2 - 8,
            y: m.y,
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          threadLayer,
          s.local,
        );
        put(
          'rect',
          {
            x: m.x - cw / 2 - 3,
            y: m.y - ch / 2 - 3,
            width: cw + 6,
            height: ch + 6,
            rx: 8,
            fill: 'none',
            stroke: color,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          },
          threadLayer,
        );
        const v = s.mine[i];
        mines.push(v === null || v === undefined ? null : card(mineLayer, m, v, color, {}));
      });

      put(
        'text',
        {
          x: W / 2,
          y: H - 14,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
        caption(s),
      );

      return { mines, cards, ghost };
    }

    function shift(g: SVGGElement, dx: number, dy: number): void {
      if (r(dx) === 0 && r(dy) === 0) g.removeAttribute('transform');
      else g.setAttribute('transform', `translate(${r(dx)} ${r(dy)})`);
    }

    function tween(ms: number, mine: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        const t0 = performance.now();
        let over = false;
        const finish = (): void => {
          if (over) return;
          over = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (over) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const u = Math.min(1, (performance.now() - t0) / ms);
          frame(u);
          if (u >= 1) {
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

    const renderer: SceneRenderer<LostUpdateScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate || destroyed || prev === null) return;
        const st = next.step;
        const len = next.cards.length;

        if (st.kind === 'read') {
          const i = next.threads.findIndex((th) => th.id === st.thread);
          const g = h.mines[i];
          if (g === undefined || g === null) throw new Error(`무대: ${st.thread} 의 제 칸이 없다`);
          const end = mineAt(next, i);
          const from = stackAt(len - 1, len);
          await tween(READ_MS, mine, (u) => {
            const k = 1 - ease(u);
            shift(g, (from.x - end.x) * k, (from.y - end.y) * k);
          });
        } else if (st.kind === 'write') {
          const i = next.threads.findIndex((th) => th.id === st.thread);
          const top = h.cards[len - 1];
          if (top === undefined) throw new Error('무대: 맨 위 카드가 없다');
          const src = mineAt(next, i);
          const side = colX(i, next.threads.length) < stack.x ? -1 : 1;
          const beside: Pt = { x: stack.x + side * (cw + 30), y: stack.y };
          const end = stackAt(len - 1, len);
          const below = h.cards.slice(0, len - 1);
          const split = 0.5;
          await tween(WRITE_MS, mine, (u) => {
            // 앞 반: 제 칸에서 공유 칸 옆까지 오른다. 뒤 반: 옆에서 밀려 들어가 덮는다
            let p: Pt;
            if (u < split) {
              const e = ease(u / split);
              p = { x: src.x + (beside.x - src.x) * e, y: src.y + (beside.y - src.y) * e };
            } else {
              const e = ease((u - split) / (1 - split));
              p = { x: beside.x + (end.x - beside.x) * e, y: beside.y };
            }
            shift(top, p.x - end.x, p.y - end.y);
            // 덮이는 카드들은 덮이는 순간 한 칸씩 뒤로 물러난다
            const back = u < split ? 1 : 1 - ease((u - split) / (1 - split));
            below.forEach((g, k) => {
              const was = stackAt(k, len - 1);
              const now = stackAt(k, len);
              shift(g, (was.x - now.x) * back, (was.y - now.y) * back);
            });
          });
        } else if (st.kind === 'compare') {
          const ghost = h.ghost;
          const g0 = ghostAt();
          await tween(FAN_MS, mine, (u) => {
            const k = 1 - ease(u);
            h.cards.forEach((g, j) => {
              const from = stackAt(j, len);
              const to = rowAt(j, len);
              shift(g, (from.x - to.x) * k, (from.y - to.y) * k);
            });
            if (ghost !== null) shift(ghost, (stack.x - g0.x) * k, 0);
          });
        } else {
          return;
        }
        if (mine === gen && !destroyed) drawStatic(next);
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
    return renderer;
  },
};
