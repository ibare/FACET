/**
 * keep-old-version 의 stage — 줄 위에 판이 쌓이는 더미.
 *
 * 동사는 "쌓인다". 줄 이름을 받친 판 위로 판이 아래(옛것)에서 위(새것)로 포개진다.
 * - 쓰기: 새 판이 위에서 내려와 더미 꼭대기에 얹힌다. 아래 판은 한 칸도 움직이지 않는다.
 * - 커밋: 틱 시계의 수가 둘로 날아가 옛 판의 끝 칸과 새 판의 시작 칸에 찍히고, "지금" 표지가 새 판으로 올라간다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Version } from './algorithm.js';
import type { KeepOldVersionScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 24;
const CLOCK_W = 88;
const CLOCK_H = 60;
const CLOCK_Y = 18;
/** 판 더미가 차지할 수 있는 위 끝. 시계·캡션 띠 아래. */
const PILE_TOP = 96;
/** 줄 받침의 윗변. */
const BASE_Y = 300;
const BASE_H = 26;
const GAP = 10;
const SLAB_H_MAX = 52;
const SLAB_W_MAX = 360;
/** 판 좌우 틱 칸의 폭 상한. */
const TICK_BOX_MAX = 64;
const MARKER_GAP = 14;

const DROP_MS = 560;
const STAMP_MS = 640;

type Layout = {
  x0: number;
  slabW: number;
  slabH: number;
  box: number;
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function layoutFor(count: number): Layout {
  const slabW = Math.min(SLAB_W_MAX, PIECE_CANVAS_W - 2 * (PAD + 126));
  const x0 = (PIECE_CANVAS_W - slabW) / 2;
  const room = BASE_Y - GAP - PILE_TOP;
  const slabH = Math.min(SLAB_H_MAX, Math.floor(room / Math.max(1, count)) - GAP);
  const box = Math.min(TICK_BOX_MAX, Math.floor(slabW / 5));
  return { x0, slabW, slabH, box };
}

/** i 번째 판(0 이 가장 옛 판)의 윗변. */
function slotY(l: Layout, i: number): number {
  return BASE_Y - GAP - (i + 1) * l.slabH - i * GAP;
}

function isCurrent(v: Version): boolean {
  return v.start !== null && v.end === null;
}

/** 교과서 연산 표기 — W2(tea=35). 번역하지 않는 자료다. */
function writeLabel(txn: string, row: string, value: number): string {
  return 'W' + txn.replace(/^T/, '') + '(' + row + '=' + String(value) + ')';
}

/** 교과서 연산 표기 — C2. */
function commitLabel(txn: string): string {
  return 'C' + txn.replace(/^T/, '');
}

function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

export const keepOldVersionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const xsPx = parseFloat(fontSizes.xs);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      o: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': o.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size,
          'font-weight': o.weight ?? 'normal',
          fill: o.fill,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    /** 손잡이 — 운동이 만질 요소. drawStatic 이 매번 새로 짓는다. */
    type Handles = {
      slabs: SVGGElement[];
      startNums: SVGTextElement[];
      endNums: SVGTextElement[];
      marker: SVGGElement | null;
      clockCenter: { x: number; y: number };
      layer: SVGGElement;
    };

    function caption(scene: KeepOldVersionScene): string {
      const s = scene.step;
      const n = scene.versions.length;
      if (s === null) {
        return t('caption.start', 'Row {row} before any change. Versions: {n}.', { row: scene.row, n });
      }
      if (s.kind === 'write') {
        return t('caption.write', '{op}: a new version is stacked on top. Versions: {n}.', {
          op: writeLabel(s.txn, scene.row, s.value),
          n,
        });
      }
      const oldV = scene.versions[s.ended];
      const newV = scene.versions[s.started];
      if (!oldV || !newV) throw new Error('keep-old-version stage: 커밋이 가리키는 판이 사슬에 없다');
      return t('caption.commit', '{op} at tick {tick}: version {old} ends, version {new} begins. Versions: {n}.', {
        op: commitLabel(s.txn),
        tick: s.tick,
        old: oldV.value,
        new: newV.value,
        n,
      });
    }

    function drawStatic(scene: KeepOldVersionScene): Handles {
      svg.textContent = '';
      const l = layoutFor(scene.versions.length);
      const layer = el('g', {}, svg);

      // 틱 시계
      el(
        'rect',
        { x: PAD, y: CLOCK_Y, width: CLOCK_W, height: CLOCK_H, rx: 8, fill: c.bgSubtle, stroke: c.border },
        layer,
      );
      label(layer, PAD + CLOCK_W / 2, CLOCK_Y + 15, t('label.tick', 'Tick'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      const clockCenter = { x: PAD + CLOCK_W / 2, y: CLOCK_Y + 40 };
      label(layer, clockCenter.x, clockCenter.y, String(scene.tick), {
        size: fontSizes.xl,
        fill: c.text,
        mono: true,
        weight: 'bold',
      });

      // 캡션 — 지금 일어나는 일
      label(layer, PAD + CLOCK_W + 20, CLOCK_Y + CLOCK_H / 2, caption(scene), {
        size: fontSizes.md,
        fill: c.text,
        anchor: 'start',
      });

      // 줄 받침과 칸 이름
      el(
        'rect',
        { x: l.x0, y: BASE_Y, width: l.slabW, height: BASE_H, rx: 4, fill: c.bgSubtle, stroke: c.border },
        layer,
      );
      label(layer, l.x0 + l.slabW / 2, BASE_Y + BASE_H / 2, t('label.row', 'Row {row}', { row: scene.row }), {
        size: fontSizes.sm,
        fill: c.text,
        weight: 'bold',
      });
      const headY = BASE_Y + BASE_H + 20;
      label(layer, l.x0 + l.box / 2, headY, t('label.start', 'Start tick'), { size: fontSizes.xs, fill: c.textMuted });
      label(layer, l.x0 + l.slabW - l.box / 2, headY, t('label.end', 'End tick'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });

      // 판 더미 — 아래가 옛 판
      const slabs: SVGGElement[] = [];
      const startNums: SVGTextElement[] = [];
      const endNums: SVGTextElement[] = [];
      let currentAt = -1;
      scene.versions.forEach((v, i) => {
        const y = slotY(l, i);
        const g = el('g', {}, layer);
        slabs.push(g);
        const cur = isCurrent(v);
        if (cur) currentAt = i;
        const pending = v.start === null;
        const ended = v.end !== null;

        // 시작 틱 칸
        el('rect', { x: l.x0, y, width: l.box, height: l.slabH, rx: 4, fill: c.bg, stroke: c.border }, g);
        startNums.push(
          label(g, l.x0 + l.box / 2, y + l.slabH / 2, v.start === null ? '—' : String(v.start), {
            size: fontSizes.md,
            fill: v.start === null ? c.textMuted : c.text,
            mono: true,
          }),
        );

        // 값 칸
        const vx = l.x0 + l.box + 6;
        const vw = l.slabW - 2 * l.box - 12;
        const body: Record<string, string | number> = {
          x: vx,
          y,
          width: vw,
          height: l.slabH,
          rx: 6,
          fill: ended ? c.bgSubtle : c.bg,
          stroke: cur ? c.itemActive : pending ? c.textMuted : c.border,
          'stroke-width': cur ? 2 : 1.5,
        };
        if (pending) body['stroke-dasharray'] = '6 4';
        el('rect', body, g);
        label(g, vx + vw / 2, y + l.slabH / 2, String(v.value), {
          size: fontSizes.xl,
          fill: ended ? c.textMuted : c.text,
          mono: true,
          weight: 'bold',
        });
        if (v.txn !== null) {
          label(g, vx + 8, y + xsPx / 2 + 6, v.txn, {
            size: fontSizes.xs,
            fill: c.textMuted,
            anchor: 'start',
            mono: true,
          });
        }

        // 끝 틱 칸
        const ex = l.x0 + l.slabW - l.box;
        el('rect', { x: ex, y, width: l.box, height: l.slabH, rx: 4, fill: c.bg, stroke: c.border }, g);
        endNums.push(
          label(g, ex + l.box / 2, y + l.slabH / 2, v.end === null ? '∞' : String(v.end), {
            size: fontSizes.md,
            fill: v.end === null ? c.textMuted : c.text,
            mono: true,
          }),
        );
      });

      // 지금 판 표지
      let marker: SVGGElement | null = null;
      if (currentAt >= 0) {
        const my = slotY(l, currentAt) + l.slabH / 2;
        const mx = l.x0 + l.slabW + MARKER_GAP;
        marker = el('g', {}, layer);
        el('path', { d: `M ${round(mx)} ${round(my)} l 10 -7 l 0 14 z`, fill: c.itemActive }, marker);
        label(marker, mx + 16, my, t('label.current', 'Current'), {
          size: fontSizes.sm,
          fill: c.itemActive,
          anchor: 'start',
          weight: 'bold',
        });
      }

      return { slabs, startNums, endNums, marker, clockCenter, layer };
    }

    /** 한 시계로 흘리는 운동. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - began) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: KeepOldVersionScene,
      prev: KeepOldVersionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null || prev === null) return;
      const l = layoutFor(next.versions.length);

      if (step.kind === 'write') {
        const slab = h.slabs[step.index];
        if (!slab) return;
        // 위에서 내려와 꼭대기에 얹힌다 — 아직 못 온 만큼 위로 들려 있다.
        const lift = slotY(l, step.index) + l.slabH + 12;
        slab.setAttribute('transform', `translate(0 ${round(-lift)})`);
        await tween(DROP_MS, mine, (p) => {
          slab.setAttribute('transform', `translate(0 ${round(-lift * (1 - easeOut(p)))})`);
        });
      } else {
        const endText = h.endNums[step.ended];
        const startText = h.startNums[step.started];
        if (!endText || !startText) return;
        // 찍히기 전에는 칸이 비어 있다.
        endText.setAttribute('opacity', '0');
        startText.setAttribute('opacity', '0');
        const targets = [
          { x: l.x0 + l.slabW - l.box / 2, y: slotY(l, step.ended) + l.slabH / 2 },
          { x: l.x0 + l.box / 2, y: slotY(l, step.started) + l.slabH / 2 },
        ];
        const chips = targets.map((to) => {
          const g = el('g', {}, h.layer);
          el('rect', { x: -16, y: -13, width: 32, height: 26, rx: 5, fill: c.accent }, g);
          label(g, 0, 0, String(step.tick), { size: fontSizes.md, fill: c.stateInk, mono: true, weight: 'bold' });
          return { g, to };
        });
        const from = h.clockCenter;
        const rise = slotY(l, step.ended) - slotY(l, step.started);
        const marker = h.marker;
        const place = (p: number): void => {
          const e = easeOut(p);
          for (const chip of chips) {
            const x = from.x + (chip.to.x - from.x) * e;
            const y = from.y + (chip.to.y - from.y) * e;
            chip.g.setAttribute('transform', `translate(${round(x)} ${round(y)})`);
          }
          marker?.setAttribute('transform', `translate(0 ${round(rise * (1 - e))})`);
        };
        place(0);
        await tween(STAMP_MS, mine, place);
      }
      if (destroyed || mine !== gen) return;
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
