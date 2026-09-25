/**
 * first-come-first-run 의 그림 — 시간축 위의 시작점과 끝점.
 *
 * 위에는 프로세스마다 한 줄: 도착 틱에 자기 길이만큼의 점선 틀이 서 있다 (온 자리).
 * 아래는 CPU 한 줄. 오르는 프로세스는 제 줄의 도착 자리에서 CPU 줄로 **옮겨 와**
 * 앞의 것이 끝난 자리(또는 제 도착 자리)에 이어 붙는다. 지금 틱을 가리키는 세로선이
 * 지나가며 돈 만큼을 채우고, 아무도 없던 틱은 빈 CPU 구간으로 남는다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { FirstComeFirstRunScene } from './scene';

const H = 290;
const SVG_NS = 'http://www.w3.org/2000/svg';
const CURSOR_MS = 700;
const SLIDE_MS = 700;
const FRAME_MS = 16;

const PAD_L = 44;
const PAD_R = 40;
const CAPTION_Y = 22;
const NOTE_Y = 42;
const ROWS_TOP = 64;
const TRACK_Y = 204;
const TRACK_H = 32;
const AXIS_Y = TRACK_Y + TRACK_H + 10;
const AXIS_LABEL_Y = AXIS_Y + 18;
const ROW_PITCH_MAX = 30;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  o: { fill: string; size: string; anchor?: string; weight?: string; family?: string; halo?: string },
): void {
  const node = el(
    'text',
    {
      x,
      y,
      fill: o.fill,
      'font-size': o.size,
      'font-family': o.family ?? fonts.body,
      'text-anchor': o.anchor ?? 'start',
      'dominant-baseline': 'middle',
    },
    parent,
  );
  if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
  if (o.halo !== undefined) {
    node.setAttribute('stroke', o.halo);
    node.setAttribute('stroke-width', '3');
    node.setAttribute('paint-order', 'stroke');
  }
  node.textContent = text;
}

function captionOf(scene: FirstComeFirstRunScene, t: Translate): [string, string] {
  const st = scene.step;
  switch (st.kind) {
    case 'ready':
      return [t('caption.ready', 'The CPU is empty. Each process waits for its arrival tick.'), ''];
    case 'start':
      return [
        t('caption.start', '{name} starts: {start}', { name: st.id.toUpperCase(), start: st.start }),
        t('caption.later', 'Later of arrival {arrival} and previous end {prevEnd}', {
          arrival: st.arrival,
          prevEnd: st.prevEnd,
        }),
      ];
    case 'idle':
      return [
        t('caption.idle', 'CPU idle: {tick}', { tick: st.tick }),
        t('caption.idleWhy', 'Next, not yet arrived: {name} · arrival: {arrival}', {
          name: st.next.toUpperCase(),
          arrival: st.arrival,
        }),
      ];
    case 'done':
      return [
        t('caption.done', '{name} ends: {tick}', { name: st.id.toUpperCase(), tick: st.tick }),
        t('caption.allDone', 'All processes finished'),
      ];
  }
}

export const firstComeFirstRunStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** slide: 이번 걸음에 오르는 것이 제 줄에서 CPU 줄까지 온 만큼 (0‥1). */
    function draw(scene: FirstComeFirstRunScene, cursor: number | null, slide: number): void {
      svg.textContent = '';
      const { procs, horizon } = scene;
      if (horizon === null || horizon <= 0 || procs.length === 0) return;

      const colors = categorical(procs.length);
      const x0 = PAD_L;
      const x1 = PIECE_CANVAS_W - PAD_R;
      const unit = (x1 - x0) / horizon;
      const xAt = (tick: number): number => x0 + tick * unit;
      const pitch = Math.min(ROW_PITCH_MAX, (TRACK_Y - 18 - ROWS_TOP) / procs.length);
      const rowH = pitch * 0.62;
      const rowY = (i: number): number => ROWS_TOP + i * pitch;
      const colorOf = (id: string): string => {
        const i = procs.findIndex((p) => p.id === id);
        if (i < 0) throw new Error(`first-come-first-run stage: 모르는 식별자 ${id}`);
        return colors[i] ?? pal.text;
      };
      const seen = cursor ?? 0;
      const st = scene.step;
      const moving = st.kind === 'start' && slide < 1 ? st.id : null;

      // 캡션
      const [line1, line2] = captionOf(scene, t);
      label(svg, PIECE_CANVAS_W / 2, CAPTION_Y, line1, {
        fill: pal.text,
        size: fontSizes.md,
        anchor: 'middle',
        weight: '600',
      });
      if (line2 !== '') {
        label(svg, PIECE_CANVAS_W / 2, NOTE_Y, line2, { fill: pal.textMuted, size: fontSizes.sm, anchor: 'middle' });
      }

      // 프로세스 줄 — 도착 자리의 점선 틀
      procs.forEach((p, i) => {
        const y = rowY(i);
        const c = colors[i] ?? pal.text;
        const arrived = p.arrival <= seen;
        const g = el('g', {}, svg);
        if (!arrived) g.setAttribute('opacity', '0.35');
        label(g, PAD_L - 10, y + rowH / 2, p.id.toUpperCase(), {
          fill: c,
          size: fontSizes.sm,
          anchor: 'end',
          weight: '700',
          family: fonts.mono,
        });
        const ax = xAt(p.arrival);
        el('path', { d: `M ${r2(ax - 4)} ${r2(y - 6)} L ${r2(ax + 4)} ${r2(y - 6)} L ${r2(ax)} ${r2(y - 1)} Z`, fill: c }, g);
        el(
          'rect',
          {
            x: ax,
            y,
            width: p.length * unit,
            height: rowH,
            rx: 3,
            fill: 'none',
            stroke: c,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          },
          g,
        );
      });

      // 이번에 오른 것의 도착 자리에서 CPU 줄까지 내려 긋는 안내선
      if (st.kind === 'start') {
        const i = procs.findIndex((p) => p.id === st.id);
        const ax = xAt(st.arrival);
        el(
          'line',
          {
            x1: ax,
            y1: rowY(i) + rowH,
            x2: ax,
            y2: TRACK_Y,
            stroke: colorOf(st.id),
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
          },
          svg,
        );
      }

      // CPU 줄
      label(svg, PAD_L - 10, TRACK_Y + TRACK_H / 2, t('label.cpu', 'CPU'), {
        fill: pal.text,
        size: fontSizes.sm,
        anchor: 'end',
        weight: '600',
      });
      el('rect', { x: x0, y: TRACK_Y, width: x1 - x0, height: TRACK_H, fill: pal.bgSubtle, stroke: pal.border }, svg);

      // 빈 CPU 구간
      for (const s of scene.idles) {
        const end = Math.min(s.to ?? seen, seen);
        const w = Math.max(0, end - s.from) * unit;
        el(
          'rect',
          {
            x: xAt(s.from),
            y: TRACK_Y + 3,
            width: w,
            height: TRACK_H - 6,
            fill: pal.bg,
            stroke: pal.textMuted,
            'stroke-dasharray': '3 3',
          },
          svg,
        );
        label(svg, xAt(s.from) + 5, TRACK_Y + TRACK_H / 2, t('label.idle', 'idle'), {
          fill: pal.textMuted,
          size: fontSizes.xs,
        });
      }

      // CPU 에 오른 것 — 돈 만큼 채우고 남은 몫은 틀만
      for (const pl of scene.placed) {
        if (pl.id === moving) continue;
        const c = colorOf(pl.id);
        const x = xAt(pl.start);
        const w = (pl.end - pl.start) * unit;
        const ran = Math.max(0, Math.min(seen, pl.end) - pl.start) * unit;
        el('rect', { x, y: TRACK_Y, width: w, height: TRACK_H, fill: pal.bg, stroke: c, 'stroke-width': 1.5 }, svg);
        if (ran > 0) el('rect', { x, y: TRACK_Y, width: ran, height: TRACK_H, fill: c }, svg);
        label(svg, x + w / 2, TRACK_Y + TRACK_H / 2, pl.id.toUpperCase(), {
          fill: pal.text,
          size: fontSizes.sm,
          anchor: 'middle',
          weight: '700',
          family: fonts.mono,
          halo: pal.bg,
        });
      }

      // 옮겨 오는 중인 것 — 도착 자리에서 시작 자리로
      if (moving !== null && st.kind === 'start') {
        const i = procs.findIndex((p) => p.id === moving);
        const p = procs[i];
        if (p === undefined) throw new Error(`first-come-first-run stage: 모르는 식별자 ${moving}`);
        const k = slide;
        const x = xAt(p.arrival) + (xAt(st.start) - xAt(p.arrival)) * k;
        const y = rowY(i) + (TRACK_Y - rowY(i)) * k;
        const h = rowH + (TRACK_H - rowH) * k;
        const c = colorOf(moving);
        el('rect', { x, y, width: p.length * unit, height: h, rx: 3, fill: pal.bg, stroke: c, 'stroke-width': 1.5 }, svg);
        label(svg, x + (p.length * unit) / 2, y + h / 2, moving.toUpperCase(), {
          fill: pal.text,
          size: fontSizes.sm,
          anchor: 'middle',
          weight: '700',
          family: fonts.mono,
          halo: pal.bg,
        });
      }

      // 시간축 — 시작점 · 끝점 · 빈 CPU 의 시작은 굵게
      const marks = new Set<number>();
      for (const pl of scene.placed) {
        if (pl.id !== moving) marks.add(pl.start);
        if (pl.end <= seen) marks.add(pl.end);
      }
      for (const s of scene.idles) marks.add(s.from);
      el('line', { x1: x0, y1: AXIS_Y, x2: x1, y2: AXIS_Y, stroke: pal.border }, svg);
      for (let tick = 0; tick <= horizon; tick += 1) {
        const x = xAt(tick);
        const strong = marks.has(tick);
        el('line', { x1: x, y1: AXIS_Y - 4, x2: x, y2: AXIS_Y + 4, stroke: strong ? pal.text : pal.border }, svg);
        label(svg, x, AXIS_LABEL_Y, String(tick), {
          fill: strong ? pal.text : pal.textMuted,
          size: fontSizes.xs,
          anchor: 'middle',
          weight: strong ? '700' : '400',
          family: fonts.mono,
        });
      }
      label(svg, x1 + 14, AXIS_LABEL_Y, t('label.tick', 'tick'), { fill: pal.textMuted, size: fontSizes.xs });

      // 지금 틱
      if (cursor !== null) {
        const cx = xAt(cursor);
        el('line', { x1: cx, y1: ROWS_TOP - 10, x2: cx, y2: AXIS_Y, stroke: pal.primary, 'stroke-width': 2 }, svg);
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = performance.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const step = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - began) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            step();
          }, FRAME_MS);
          timers.add(id);
        };
        step();
      });
    }

    async function play(scene: FirstComeFirstRunScene, mine: number): Promise<void> {
      const st = scene.step;
      if (st.kind === 'ready') return;
      const to = scene.now;
      const slideFrom = st.kind === 'start' ? 0 : 1;
      if (st.from !== null && to !== null && st.from < to) {
        const from = st.from;
        draw(scene, from, slideFrom);
        await tween(CURSOR_MS, mine, (p) => draw(scene, from + (to - from) * p, slideFrom));
        if (mine !== gen || destroyed) return;
      }
      if (st.kind === 'start') {
        draw(scene, to, 0);
        await tween(SLIDE_MS, mine, (p) => draw(scene, to, p));
        if (mine !== gen || destroyed) return;
      }
      draw(scene, scene.now, 1);
    }

    return {
      render(next: FirstComeFirstRunScene, _prev: FirstComeFirstRunScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        draw(next, next.now, 1);
        if (!opts.animate || destroyed) return;
        return play(next, mine);
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
