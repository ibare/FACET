/**
 * shortest-first 무대 — 자리마다 한 줄. 줄의 왼쪽은 그 자리에 선 것의 길이, 오른쪽은 그것이
 * 기다리는 동안 앞에서 도는 것들의 길이를 이어 놓은 띠(= 대기). 띠는 윗줄 띠의 연장이라
 * 한 프로세스의 길이가 뒤에 선 줄마다 한 번씩 세로로 쌓인다 — 그 기둥의 높이가 곱하는 수다.
 *
 * 운동: 고른 것의 줄이 실제로 위로 당겨지고 나머지는 한 칸씩 밀려 내려간다. 그다음 앞 목록이
 * 바뀐 줄의 띠만 다시 자란다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ShortestFirstScene } from './scene.js';

const H = 270;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CAPTION_Y = 26;
const HEAD_Y = 62;
const ROW_TOP = 74;
const ROW_H = 28;
const ROW_GAP = 14;
const U_MAX = 32;

const SLIDE_MS = 700;
const GROW_MS = 520;
const OUTLINE_MS = 700;

type El = SVGElement;

function el(tag: string, attrs: Record<string, string | number>, text?: string): El {
  const e = document.createElementNS(SVG_NS, tag) as El;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function r2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function isScene(x: unknown): x is ShortestFirstScene {
  return typeof x === 'object' && x !== null && Array.isArray((x as { procs?: unknown }).procs);
}

type RowParts = {
  group: El;
  copies: { rect: El; label: El; offset: number; width: number }[];
  waitLabel: El | null;
  stripWidth: number;
};

export const shortestFirstStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const labelPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 매 그리기마다 새로 만드는 손잡이
    let rows = new Map<string, RowParts>();
    let outlines: { rect: El; width: number }[] = [];

    function geometry(scene: ShortestFirstScene) {
      const bursts = scene.procs.map((p) => p.burst);
      const total = bursts.reduce((s, b) => s + b, 0);
      const maxLen = Math.max(...bursts);
      const maxWait = total - Math.min(...bursts);
      const blockX = PAD + 48;
      const waitLabelW = 44;
      const u = Math.min(U_MAX, Math.floor((PIECE_CANVAS_W - blockX - 26 - waitLabelW - PAD) / (maxLen + maxWait)));
      const stripX = blockX + maxLen * u + 26;
      const waitX = stripX + maxWait * u + 10;
      return { u, blockX, stripX, waitX };
    }

    function rowY(slot: number): number {
      return ROW_TOP + slot * (ROW_H + ROW_GAP);
    }

    function drawStatic(scene: ShortestFirstScene): void {
      svg.textContent = '';
      rows = new Map();
      outlines = [];
      const { u, blockX, stripX, waitX } = geometry(scene);
      const palette = categorical(scene.procs.length);
      const colorOf = new Map(scene.procs.map((p, i) => [p.id, palette[i] as string]));
      const burstOf = new Map(scene.procs.map((p) => [p.id, p.burst]));
      const step = scene.step;
      const ordered = scene.waits !== null;

      // 캡션 — 지금 일어나는 일
      const n = scene.procs.length;
      const avg = (total: number): string => (total / n).toFixed(2);
      const need = (x: number | null, what: string): number => {
        if (x === null) throw new Error(`shortest-first stage: ${step.kind} 걸음에 ${what} 가 없다`);
        return x;
      };
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Ready at tick {tick}: {names}', {
          tick: Math.max(...scene.procs.map((p) => p.arrive)),
          names: scene.procs.map((p) => p.id.toUpperCase()).join(', '),
        });
      } else if (step.kind === 'fcfs') {
        caption = t('caption.fcfs', 'In arrival order — wait total: {total} · average: {avg}', {
          total: need(scene.total, 'total'),
          avg: avg(need(scene.total, 'total')),
        });
      } else if (step.kind === 'pull') {
        caption = t('caption.pull', 'Shortest left: {name} → slot {slot} — wait total: {total} · average: {avg}', {
          name: step.id.toUpperCase(),
          slot: scene.placed,
          total: need(scene.total, 'total'),
          avg: avg(need(scene.total, 'total')),
        });
      } else {
        caption = t('caption.compare', 'Average wait — arrival order: {fcfs} · shortest first: {sjf}', {
          fcfs: avg(need(scene.fcfsTotal, 'fcfsTotal')),
          sjf: avg(need(scene.sjfTotal, 'sjfTotal')),
        });
      }
      svg.appendChild(
        el('text', { x: PAD, y: CAPTION_Y, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 }, caption),
      );

      // 머리
      const head = { y: HEAD_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs };
      svg.appendChild(el('text', { ...head, x: blockX }, t('label.length', 'Length (ticks)')));
      if (ordered) {
        svg.appendChild(el('text', { ...head, x: stripX }, t('label.ahead', 'Running ahead while waiting (ticks)')));
        svg.appendChild(el('text', { ...head, x: waitX }, t('label.wait', 'Wait')));
      }

      // 도착 차례의 대기 — 견줄 때만, 같은 자리에 점선 윤곽
      if (step.kind === 'compare' && scene.fcfsBySlot !== null) {
        scene.fcfsBySlot.forEach((w, slot) => {
          if (w <= 0) return;
          const rect = el('rect', {
            x: stripX,
            y: rowY(slot) - 2,
            width: r2(w * u),
            height: ROW_H + 4,
            rx: 3,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          svg.appendChild(rect);
          outlines.push({ rect, width: r2(w * u) });
        });
      }

      const pulled = step.kind === 'pull' ? step.id : null;
      scene.order.forEach((id, slot) => {
        const burst = burstOf.get(id);
        const color = colorOf.get(id);
        if (burst === undefined || color === undefined) throw new Error(`shortest-first stage: 모르는 식별자 ${id}`);
        const fixed = scene.policy === 'fcfs' || (scene.policy === 'sjf' && slot < scene.placed);
        const g = el('g', { transform: `translate(0,${rowY(slot)})` });
        svg.appendChild(g);

        if (ordered) {
          g.appendChild(
            el(
              'text',
              {
                x: PAD + 6,
                y: ROW_H / 2 + 4,
                'text-anchor': 'middle',
                fill: fixed ? colors.text : colors.textMuted,
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                'font-weight': fixed ? 700 : 400,
              },
              String(slot + 1),
            ),
          );
        }
        g.appendChild(
          el(
            'text',
            {
              x: PAD + 30,
              y: ROW_H / 2 + 5,
              'text-anchor': 'middle',
              fill: colors.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'font-weight': 700,
            },
            id.toUpperCase(),
          ),
        );
        const block = el('rect', {
          x: blockX,
          y: 0,
          width: r2(burst * u),
          height: ROW_H,
          rx: 3,
          fill: color,
          stroke: id === pulled ? colors.accent : 'none',
          'stroke-width': id === pulled ? 3 : 0,
        });
        g.appendChild(block);
        g.appendChild(
          el(
            'text',
            {
              x: r2(blockX + (burst * u) / 2),
              y: ROW_H / 2 + 4,
              'text-anchor': 'middle',
              fill: colors.textInverse,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': 700,
            },
            String(burst),
          ),
        );

        const parts: RowParts = { group: g, copies: [], waitLabel: null, stripWidth: 0 };
        if (ordered && scene.waits !== null) {
          // 앞에 선 것들의 길이를 이어 놓는다 — 대기의 몸통
          let off = 0;
          for (const ahead of scene.order.slice(0, slot)) {
            const b = burstOf.get(ahead) as number;
            const c = colorOf.get(ahead) as string;
            const w = r2(b * u);
            const rect = el('rect', {
              x: r2(stripX + off),
              y: 3,
              width: w,
              height: ROW_H - 6,
              fill: c,
              'fill-opacity': 0.35,
              stroke: c,
              'stroke-width': 1,
            });
            const label = el(
              'text',
              {
                x: r2(stripX + off + w / 2),
                y: ROW_H / 2 + 4,
                'text-anchor': 'middle',
                fill: colors.text,
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
              },
              ahead.toUpperCase(),
            );
            g.appendChild(rect);
            if (w >= labelPx) g.appendChild(label);
            parts.copies.push({ rect, label, offset: off, width: w });
            off = r2(off + w);
          }
          parts.stripWidth = off;
          const wait = scene.waits[id];
          if (wait === undefined) throw new Error(`shortest-first stage: ${id} 의 대기가 없다`);
          parts.waitLabel = el(
            'text',
            {
              x: waitX,
              y: ROW_H / 2 + 5,
              fill: colors.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'font-weight': 700,
            },
            String(wait),
          );
          g.appendChild(parts.waitLabel);
        }
        rows.set(id, parts);
      });

      // 기둥마다 곱하는 수 — 한 길이가 뒤에 선 줄의 수만큼 쌓인다
      if (ordered) {
        const baseY = rowY(scene.order.length - 1) + ROW_H + 18;
        let off = 0;
        scene.order.forEach((id, slot) => {
          const b = burstOf.get(id) as number;
          const behind = scene.order.length - 1 - slot;
          if (behind > 0) {
            svg.appendChild(
              el(
                'text',
                {
                  x: r2(stripX + off + (b * u) / 2),
                  y: baseY,
                  'text-anchor': 'middle',
                  fill: colors.textMuted,
                  'font-family': fonts.mono,
                  'font-size': fontSizes.xs,
                },
                t('label.term', '{len}×{k}', { len: b, k: behind }),
              ),
            );
          }
          off += b * u;
        });
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            wake();
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

    function growStrips(ids: readonly string[], p: number): void {
      for (const id of ids) {
        const row = rows.get(id);
        if (row === undefined) continue;
        const reach = row.stripWidth * p;
        for (const c of row.copies) {
          const w = Math.max(0, Math.min(c.width, reach - c.offset));
          c.rect.setAttribute('width', String(r2(w)));
          c.label.setAttribute('opacity', w >= c.width ? '1' : '0');
        }
        row.waitLabel?.setAttribute('opacity', p >= 1 ? '1' : '0');
      }
    }

    async function render(next: unknown, prev: unknown, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed || !isScene(next)) return;
      drawStatic(next);
      if (!opts.animate || prev === null || prev === undefined) return;
      const step = next.step;

      if (step.kind === 'fcfs') {
        const ids = [...next.order];
        await tween(GROW_MS, mine, (p) => growStrips(ids, p));
      } else if (step.kind === 'pull') {
        const pitch = ROW_H + ROW_GAP;
        const moved = next.order.filter((id) => step.from.indexOf(id) !== next.order.indexOf(id));
        const regrow = next.order.filter((id) => {
          const now = next.order.slice(0, next.order.indexOf(id)).join(',');
          const was = step.from.slice(0, step.from.indexOf(id)).join(',');
          return now !== was;
        });
        if (moved.length > 0) {
          await tween(SLIDE_MS, mine, (p) => {
            for (const id of moved) {
              const row = rows.get(id);
              if (row === undefined) continue;
              const to = next.order.indexOf(id);
              const from = step.from.indexOf(id);
              const y = rowY(to) + (from - to) * pitch * (1 - p);
              row.group.setAttribute('transform', `translate(0,${r2(y)})`);
            }
            growStrips(regrow, 0);
          });
        }
        if (regrow.length > 0 && mine === gen && !destroyed) {
          await tween(GROW_MS, mine, (p) => growStrips(regrow, p));
        }
      } else if (step.kind === 'compare') {
        const list = outlines;
        await tween(OUTLINE_MS, mine, (p) => {
          for (const o of list) o.rect.setAttribute('width', String(r2(o.width * p)));
        });
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
