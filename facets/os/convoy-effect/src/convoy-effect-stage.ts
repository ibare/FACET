/**
 * convoy-effect 무대 — 기다린 틱이 쌓이는 기둥.
 *
 * 왼쪽 CPU 칸에는 주인의 남은 양이 틱 한 칸씩 쌓여 있고, 오른쪽에는 뒤따른 것마다 기둥이 선다.
 * 한 걸음(한 틱)에 CPU 칸의 맨 위 한 칸이 줄고, 그 틱 동안 줄에 서 있던 기둥 **모두가 한 칸씩
 * 함께** 밑에서 밀려 올라간다. 칸의 색은 그 틱에 CPU 를 쥐었던 것의 색이라, 큰 작업이 쥔 동안
 * 쌓인 기다림이 기둥의 대부분을 차지한 채 끝까지 남는다. CPU 칸과 기둥은 같은 칸 높이를 쓴다 —
 * 한 칸이 빠질 때 네 칸이 붙는 것이 보이도록.
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
import { followersWaited, type ConvoyScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 380;
const PAD = 20;
const MOTION_MS = 240;
const FRAME_MS = 16;
/** 칸 높이 · 칸 폭의 상한. 실제 값은 캔버스에서 역산한다. */
const CELL_H_MAX = 24;
const CELL_W_MAX = 52;
const CELL_GAP = 2;

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return 1 - (1 - q) * (1 - q) * (1 - q);
}

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, fill: string, size: string, weight = 'normal', anchor = 'middle'): SVGTextElement {
  const node = el('text', {
    x,
    y,
    fill,
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    'text-anchor': anchor,
  }, parent);
  node.textContent = text;
  return node;
}

/** 걸음 운동이 만지는 손잡이 — 정적 그리기가 매번 새로 만든다. */
type Handles = {
  arrive: SVGGElement[];
  rise: { stack: SVGGElement; fresh: SVGRectElement }[];
  cpuStack: SVGGElement | null;
  cpuTravel: number;
  consumed: { rect: SVGRectElement; bottom: number } | null;
};

export const convoyEffectStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function nameOf(id: string): string {
      const named: Record<string, () => string> = {
        big: () => t('label.big', 'Big job'),
      };
      const fn = named[id];
      return fn === undefined ? id.toUpperCase() : fn();
    }

    function geometry(scene: ConvoyScene) {
      const followers = scene.jobs.filter((j) => j.id !== scene.lead);
      const cpuW = Math.round(W * 0.24);
      const cpuCx = PAD + cpuW / 2;
      const colsX0 = PAD + cpuW + 24;
      const colW = followers.length > 0 ? (W - PAD - colsX0) / followers.length : 0;
      const colCx = new Map<string, number>(followers.map((j, i) => [j.id, colsX0 + colW * (i + 0.5)]));
      const top = 78;
      const base = H - 64;
      // 틱 한 칸의 높이 — 가장 길게 기다릴 수 있는 양(모두의 길이 합 − 가장 짧은 길이)과 가장 긴 길이가 다 들어가게.
      const lengths = scene.jobs.map((j) => j.length);
      const total = lengths.reduce((s, v) => s + v, 0);
      const capacity = lengths.length > 0 ? Math.max(total - Math.min(...lengths), Math.max(...lengths)) : 1;
      const cellH = Math.min(CELL_H_MAX, (base - top - 16) / capacity);
      const cellW = Math.min(CELL_W_MAX, colW * 0.5, cpuW * 0.4);
      return { followers, cpuW, cpuCx, colW, colCx, top, base, cellH, cellW };
    }

    function jobColor(scene: ConvoyScene, id: string): string {
      const hues = categorical(scene.jobs.length);
      const i = scene.jobs.findIndex((j) => j.id === id);
      const c = i >= 0 ? hues[i] : undefined;
      return c ?? colors.border;
    }

    function captions(scene: ConvoyScene): [string, string] {
      const s = scene.step;
      const total = t('caption.total', 'Ticks waited so far, small jobs: {n}', { n: followersWaited(scene) });
      if (s.kind === 'start') {
        return [t('caption.start', 'Tick {tick} · on CPU: {name}', { tick: s.tick, name: nameOf(s.run) }), total];
      }
      if (s.kind === 'tick') {
        if (s.run === null) return [t('caption.idle', 'Tick {from}→{to} · CPU idle', { from: s.from, to: s.to }), total];
        if (s.waiting.length === 0) {
          return [t('caption.alone', 'Tick {from}→{to} · on CPU: {name} · nobody waits', { from: s.from, to: s.to, name: nameOf(s.run) }), total];
        }
        return [
          t('caption.tick', 'Tick {from}→{to} · on CPU: {name} · waiting: {n}, each +1', {
            from: s.from,
            to: s.to,
            name: nameOf(s.run),
            n: s.waiting.length,
          }),
          total,
        ];
      }
      if (s.kind === 'finish') {
        return [
          t('caption.end', 'Small jobs — ticks run: {ran} · ticks waited: {waited}', { ran: s.ran, waited: s.waited }),
          t('caption.split', 'Waited while {name} held the CPU: {during} · after: {after}', {
            name: nameOf(scene.lead ?? ''),
            during: s.during,
            after: s.after,
          }),
        ];
      }
      return ['', ''];
    }

    function cellRect(parent: Element, cx: number, bottom: number, g: ReturnType<typeof geometry>, fill: string): SVGRectElement {
      return el('rect', {
        x: cx - g.cellW / 2,
        y: bottom - g.cellH + CELL_GAP / 2,
        width: g.cellW,
        height: g.cellH - CELL_GAP,
        rx: 2,
        fill,
      }, parent);
    }

    function drawStatic(scene: ConvoyScene): Handles {
      svg.textContent = '';
      const handles: Handles = { arrive: [], rise: [], cpuStack: null, cpuTravel: 0, consumed: null };
      if (scene.lead === null) return handles;
      const g = geometry(scene);
      const step = scene.step;

      const [line1, line2] = captions(scene);
      label(svg, W / 2, 24, line1, colors.text, fontSizes.md, '600');
      label(svg, W / 2, 46, line2, colors.textMuted, fontSizes.sm);

      // CPU 칸
      el('rect', {
        x: PAD,
        y: g.top - 24,
        width: g.cpuW,
        height: g.base + 52 - (g.top - 24),
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
      }, svg);
      label(svg, g.cpuCx, g.top - 6, t('label.cpu', 'CPU'), colors.textMuted, fontSizes.sm, '600');
      el('line', { x1: PAD + 10, y1: g.base + 1, x2: PAD + g.cpuW - 10, y2: g.base + 1, stroke: colors.border }, svg);

      const cpuStack = el('g', {}, svg);
      if (scene.cpu !== null) {
        const fill = jobColor(scene, scene.cpu);
        for (let k = 0; k < scene.left; k += 1) cellRect(cpuStack, g.cpuCx, g.base - k * g.cellH, g, fill);
        label(svg, g.cpuCx, g.base + 20, nameOf(scene.cpu), colors.text, fontSizes.md, '600');
        const end = scene.ends[scene.cpu];
        label(
          svg,
          g.cpuCx,
          g.base + 40,
          end === undefined ? t('label.left', 'Left: {n}', { n: scene.left }) : t('state.end', 'End: {tick}', { tick: end }),
          colors.textMuted,
          fontSizes.xs,
        );
      } else {
        label(svg, g.cpuCx, g.base + 20, t('label.idle', 'Idle'), colors.textMuted, fontSizes.md);
      }
      handles.cpuStack = cpuStack;

      // 이번 틱에 CPU 가 쓴 한 칸 — 운동 동안만 보인다. 정적 화면에는 없다.
      if (step.kind === 'tick' && step.run !== null) {
        const bottom = g.base - scene.left * g.cellH;
        const rect = cellRect(cpuStack, g.cpuCx, bottom, g, jobColor(scene, step.run));
        rect.setAttribute('height', '0');
        rect.setAttribute('y', String(r2(bottom - CELL_GAP / 2)));
        handles.consumed = { rect, bottom: bottom - CELL_GAP / 2 };
        if (step.started) {
          const from = g.colCx.get(step.run);
          if (from !== undefined) handles.cpuTravel = from - g.cpuCx;
        }
      }

      // 뒤따른 것들의 기둥
      for (const job of g.followers) {
        const cx = g.colCx.get(job.id);
        if (cx === undefined) continue;
        const present = scene.present.includes(job.id);
        const wrap = el('g', present ? {} : { opacity: 0.35 }, svg);
        el('line', {
          x1: cx - g.colW * 0.36,
          y1: g.base + 1,
          x2: cx + g.colW * 0.36,
          y2: g.base + 1,
          stroke: colors.border,
          ...(present ? {} : { 'stroke-dasharray': '3 3' }),
        }, wrap);
        label(wrap, cx, g.base + 20, nameOf(job.id), colors.text, fontSizes.md, '600');
        el('rect', { x: cx - 9, y: g.base + 26, width: 18, height: 3, rx: 1.5, fill: jobColor(scene, job.id) }, wrap);

        const end = scene.ends[job.id];
        const state = !present
          ? t('state.notYet', 'Not here yet')
          : end !== undefined
            ? t('state.end', 'End: {tick}', { tick: end })
            : scene.cpu === job.id
              ? t('state.run', 'Running')
              : t('state.wait', 'Waiting');
        label(wrap, cx, g.base + 44, state, scene.cpu === job.id && end === undefined ? colors.text : colors.textMuted, fontSizes.xs);

        const cells = scene.cells[job.id] ?? [];
        const stack = el('g', {}, wrap);
        let fresh: SVGRectElement | null = null;
        cells.forEach((runner, i) => {
          const fromBottom = cells.length - 1 - i; // 가장 오래된 것이 맨 위, 새 것이 맨 아래
          const rect = cellRect(stack, cx, g.base - fromBottom * g.cellH, g, runner === '' ? colors.border : jobColor(scene, runner));
          if (i === cells.length - 1) fresh = rect;
        });
        if (present) {
          label(stack, cx, g.base - cells.length * g.cellH - 6, String(cells.length), colors.text, fontSizes.sm, '600');
        }

        if (step.kind === 'tick' && step.arrive.includes(job.id)) handles.arrive.push(wrap);
        if (step.kind === 'tick' && step.waiting.includes(job.id) && fresh !== null) {
          handles.rise.push({ stack, fresh });
        }
      }
      return handles;
    }

    /** 한 시계로 흘린다. p 는 0 → 1. */
    function motion(h: Handles, cellH: number, p: number): void {
      const e = ease(p);
      for (const wrap of h.arrive) {
        wrap.setAttribute('transform', `translate(0 ${r2(-18 * (1 - e))})`);
        wrap.setAttribute('opacity', String(r2(e)));
      }
      for (const { stack, fresh } of h.rise) {
        stack.setAttribute('transform', `translate(0 ${r2(cellH * (1 - e))})`);
        fresh.setAttribute('height', String(r2(Math.max(0, cellH * e - CELL_GAP))));
      }
      const travelE = h.cpuTravel !== 0 ? ease(p / 0.6) : 1;
      const shrinkE = h.cpuTravel !== 0 ? ease((p - 0.4) / 0.6) : e;
      if (h.cpuStack !== null && h.cpuTravel !== 0) {
        h.cpuStack.setAttribute('transform', `translate(${r2(h.cpuTravel * (1 - travelE))} 0)`);
      }
      if (h.consumed !== null) {
        const height = Math.max(0, (cellH - CELL_GAP) * (1 - shrinkE));
        h.consumed.rect.setAttribute('height', String(r2(height)));
        h.consumed.rect.setAttribute('y', String(r2(h.consumed.bottom - height)));
      }
    }

    function play(h: Handles, cellH: number, mine: number): Promise<void> {
      const frames = Math.max(1, Math.ceil(MOTION_MS / FRAME_MS));
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const next = () => {
          if (destroyed || mine !== gen) return finish();
          i += 1;
          motion(h, cellH, i / frames);
          if (i >= frames) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            next();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          next();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    return {
      async render(next: ConvoyScene, _prev: ConvoyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || next.step.kind !== 'tick' || next.lead === null) return;
        const cellH = geometry(next).cellH;
        motion(handles, cellH, 0);
        await play(handles, cellH, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
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
