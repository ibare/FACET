/**
 * 다시 세지 않기 — 그림.
 *
 * 가운데 줄이 열(토큰)이다. 위쪽은 캐시가 없는 쪽, 아래쪽은 캐시가 있는 쪽이고, 둘 다
 * 열과 자기 K·V 줄 사이에 "셈" 띠가 가로놓인다. 한 걸음에서
 *   - 위: 앞 걸음의 K·V 가 버려지고, 열의 모든 자리가 다시 띠를 지나 올라간다.
 *   - 아래: 이미 셈한 K·V 는 제자리에 머물고, 새 자리 하나만 띠를 지나 줄 끝에 붙는다.
 * 그 뒤 이 걸음이 낸 토큰이 열 끝에 들어온다. 오른쪽 눈금은 걸음마다 셈한 자리 수를
 * 위(캐시 없음)는 위로, 아래(캐시)는 아래로 쌓는다.
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
import { cachedPositions, totals, type DontRecountThePastScene } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 세로 자리
const HEAD_TOP_Y = 22;
const TOP_CHIP_Y = 60;
const TOP_BAND_Y = 92;
const TOK_Y = 150;
const BOT_BAND_Y = 192;
const BOT_CHIP_Y = 240;
const HEAD_BOT_Y = 284;
const CAPTION_Y = 316;
const BAND_H = 16;
const TOK_H = 26;
const CHIP_H = 16;

// 가로 자리 — 오른쪽 눈금 폭을 빼고 남는 것을 열이 쓴다
const PAD = 16;
const ROW_L = 84;
const TALLY_W = 132;
const GAP = 22;
/** 토큰 한 칸 폭의 상한 */
const SLOT_MAX = 64;

// 눈금 한 칸
const UNIT_H = 8;
const UNIT_GAP = 2;

// 운동 (ms)
const T_DROP = 250;
const T_PASS = 600;
const T_TALLY = 160;
const T_TOKEN = 300;
const T_ALL = T_DROP + T_PASS + T_TOKEN;

type Handles = {
  /** 이번 걸음에 새로 셈한 K·V — 위쪽 */
  topNew: Array<{ el: SVGGElement; x: number }>;
  /** 이번 걸음에 새로 셈한 K·V — 아래쪽 */
  botNew: Array<{ el: SVGGElement; x: number }>;
  /** 이번 걸음이 낸 토큰 */
  produced: { el: SVGGElement; x: number } | null;
  /** 이번 걸음 눈금 칸 — 위 · 아래 */
  topUnits: SVGRectElement[];
  botUnits: SVGRectElement[];
  /** 겹칠 자리 (버려지는 K·V 를 잠시 그린다) */
  overlay: SVGGElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** 좌표 글자 — 끝자리와 -0 을 걷어낸다. */
function r(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function clamp01(p: number): number {
  return Math.min(1, Math.max(0, p));
}

type Geometry = {
  slotW: number;
  cx(i: number): number;
  tallyL: number;
  colW: number;
  colGap: number;
  bandR: number;
};

function geometry(scene: DontRecountThePastScene): Geometry {
  const n = Math.max(1, scene.words.length);
  const rowR = PIECE_CANVAS_W - PAD - TALLY_W - GAP;
  const slotW = Math.min(SLOT_MAX, (rowR - ROW_L) / n);
  const tallyL = PIECE_CANVAS_W - PAD - TALLY_W;
  const cols = Math.max(1, scene.steps);
  const colGap = 6;
  const colW = Math.min(16, (TALLY_W - colGap * (cols - 1)) / cols);
  return {
    slotW,
    cx: (i) => ROW_L + slotW * (i + 0.5),
    tallyL,
    colW,
    colGap,
    bandR: ROW_L + slotW * n,
  };
}

export const dontRecountThePastStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DontRecountThePastScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function chip(parent: Element, x: number, y: number, w: number, fresh: boolean): SVGGElement {
      const g = el('g', { transform: `translate(${r(x)},${r(y)})` }, parent);
      el(
        'rect',
        {
          x: r(-w / 2),
          y: -CHIP_H / 2,
          width: r(w),
          height: CHIP_H,
          rx: 3,
          fill: fresh ? c.itemComparing : c.bgSubtle,
          stroke: fresh ? c.itemComparing : c.textMuted,
          'stroke-width': 1,
        },
        g,
      );
      const label = el(
        'text',
        {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: fresh ? c.stateInk : c.textMuted,
        },
        g,
      );
      label.textContent = t('label.kv', 'K·V');
      return g;
    }

    function band(y: number, g: Geometry): void {
      el(
        'rect',
        {
          x: ROW_L - 4,
          y,
          width: r(g.bandR - ROW_L + 8),
          height: BAND_H,
          rx: 3,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
        },
        svg,
      );
      const label = el(
        'text',
        {
          x: ROW_L - 10,
          y: y + BAND_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        svg,
      );
      label.textContent = t('label.compute', 'compute');
    }

    /** 눈금 한 기둥. `up` 이면 기준선에서 위로, 아니면 아래로 쌓는다. */
    function column(
      g: Geometry,
      col: number,
      count: number,
      baseY: number,
      up: boolean,
      current: boolean,
    ): SVGRectElement[] {
      const x = g.tallyL + col * (g.colW + g.colGap);
      const out: SVGRectElement[] = [];
      for (let j = 0; j < count; j += 1) {
        const off = j * (UNIT_H + UNIT_GAP) + UNIT_GAP;
        const y = up ? baseY - off - UNIT_H : baseY + off;
        out.push(
          el(
            'rect',
            {
              x: r(x),
              y: r(y),
              width: r(g.colW),
              height: UNIT_H,
              rx: 1.5,
              fill: current ? c.itemComparing : c.textMuted,
            },
            svg,
          ),
        );
      }
      return out;
    }

    function text(
      x: number,
      y: number,
      s: string,
      anchor: 'start' | 'end' | 'middle',
      opts: { size?: string; fill?: string; weight?: string; font?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r(x),
          y: r(y),
          'text-anchor': anchor,
          'font-family': opts.font ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'font-weight': opts.weight ?? 'normal',
        },
        svg,
      );
      node.textContent = s;
      return node;
    }

    function drawStatic(scene: DontRecountThePastScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        topNew: [],
        botNew: [],
        produced: null,
        topUnits: [],
        botUnits: [],
        overlay: el('g', {}, undefined),
      };
      if (scene.words.length === 0) {
        svg.appendChild(handles.overlay);
        return handles;
      }
      const g = geometry(scene);
      const sum = totals(scene);
      const lastK = scene.recount.length;
      const nowRecount = scene.recount[lastK - 1] ?? [];
      const nowFresh = scene.fresh[lastK - 1] ?? [];

      // 머리 — 두 쪽의 이름과 셈한 수
      text(PAD, HEAD_TOP_Y, t('label.noCache', 'No cache'), 'start', { weight: '600' });
      text(PAD, HEAD_BOT_Y, t('label.cache', 'KV cache'), 'start', { weight: '600' });
      text(
        PIECE_CANVAS_W - PAD,
        HEAD_TOP_Y,
        t('label.counts', 'K·V computed — this step {n} · total {sum}', { n: nowRecount.length, sum: sum.recount }),
        'end',
        { size: fontSizes.xs, fill: c.textMuted },
      );
      text(
        PIECE_CANVAS_W - PAD,
        HEAD_BOT_Y,
        t('label.counts', 'K·V computed — this step {n} · total {sum}', { n: nowFresh.length, sum: sum.fresh }),
        'end',
        { size: fontSizes.xs, fill: c.textMuted },
      );

      // 셈 띠 둘
      band(TOP_BAND_Y, g);
      band(BOT_BAND_Y, g);

      // 눈금 — 기준선과 걸음마다의 기둥
      const topBase = TOP_BAND_Y + BAND_H;
      const botBase = BOT_BAND_Y;
      el(
        'line',
        { x1: g.tallyL, x2: PIECE_CANVAS_W - PAD, y1: topBase, y2: topBase, stroke: c.border, 'stroke-width': 1 },
        svg,
      );
      el(
        'line',
        { x1: g.tallyL, x2: PIECE_CANVAS_W - PAD, y1: botBase, y2: botBase, stroke: c.border, 'stroke-width': 1 },
        svg,
      );
      for (let s = 0; s < lastK; s += 1) {
        const current = s === lastK - 1 && scene.step?.kind === 'step';
        const tu = column(g, s, scene.recount[s]?.length ?? 0, topBase, true, current);
        const bu = column(g, s, scene.fresh[s]?.length ?? 0, botBase, false, current);
        if (current) {
          handles.topUnits = tu;
          handles.botUnits = bu;
        }
      }

      const chipW = Math.max(12, g.slotW - 14);

      // 위 — 이번 걸음에 셈한 K·V (앞 걸음 것은 버려졌다)
      for (const p of nowRecount) {
        const x = g.cx(p);
        handles.topNew.push({ el: chip(svg, x, TOP_CHIP_Y, chipW, true), x });
      }

      // 아래 — 캐시에 머무는 K·V, 이번에 셈한 것만 밝다
      const freshSet = new Set(nowFresh);
      for (const p of cachedPositions(scene)) {
        const x = g.cx(p);
        const isNew = freshSet.has(p);
        const node = chip(svg, x, BOT_CHIP_Y, chipW, isNew);
        if (isNew) handles.botNew.push({ el: node, x });
      }

      // 가운데 — 열
      const tokW = Math.max(12, g.slotW - 6);
      const producedAt = scene.step?.kind === 'step' ? scene.step.produced : -1;
      for (let i = 0; i < scene.shown; i += 1) {
        const x = g.cx(i);
        const word = scene.words[i] ?? '';
        const isProduced = i === producedAt;
        const tg = el('g', { transform: `translate(${r(x)},${TOK_Y})` }, svg);
        el(
          'rect',
          {
            x: r(-tokW / 2),
            y: -TOK_H / 2,
            width: r(tokW),
            height: TOK_H,
            rx: 4,
            fill: c.bg,
            stroke: isProduced ? c.accent : c.text,
            'stroke-width': isProduced ? 2 : 1,
          },
          tg,
        );
        const size = Math.min(12, (tokW - 6) / (Math.max(1, word.length) * 0.62));
        const label = el(
          'text',
          {
            x: 0,
            y: r(size * 0.35),
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': `${r(size)}px`,
            fill: c.text,
          },
          tg,
        );
        label.textContent = word;
        if (isProduced) handles.produced = { el: tg, x };
      }

      // 캡션 — 지금 일어나는 일
      if (scene.step?.kind === 'step') {
        text(
          PAD,
          CAPTION_Y,
          t('caption.step', 'Step {k}: reads a sequence of {len} tokens and emits the next one.', {
            k: scene.step.k,
            len: scene.step.produced,
          }),
          'start',
          { fill: c.textMuted },
        );
      } else if (scene.step?.kind === 'init') {
        text(
          PAD,
          CAPTION_Y,
          t('caption.init', 'Tokens given at the start: {n}. No K·V computed yet.', { n: scene.promptLen }),
          'start',
          { fill: c.textMuted },
        );
      }

      svg.appendChild(handles.overlay);
      return handles;
    }

    /** 한 시계로 흘린다. 다 흐르거나 거둬지면 풀린다. */
    function run(mine: number, total: number, frame: (ms: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        frame(0);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const ms = Date.now() - start;
          frame(Math.min(ms, total));
          if (ms >= total) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      });
    }

    async function render(
      next: DontRecountThePastScene,
      prev: DontRecountThePastScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const flows =
        opts.animate &&
        prev !== null &&
        next.step?.kind === 'step' &&
        prev.words.length === next.words.length &&
        next.recount.length === prev.recount.length + 1;
      if (!flows) return;

      // 버려지는 앞 걸음의 K·V — 위쪽에만 있다
      const g = geometry(next);
      const chipW = Math.max(12, g.slotW - 14);
      const dropped = (next.recount[next.recount.length - 2] ?? []).map((p) => {
        const node = chip(h.overlay, g.cx(p), TOP_CHIP_Y, chipW, false);
        return { el: node, x: g.cx(p) };
      });

      const frame = (ms: number): void => {
        // 1. 앞 걸음의 K·V 가 버려진다
        const pd = ease(ms / T_DROP);
        for (const d of dropped) {
          d.el.setAttribute('transform', `translate(${r(d.x)},${r(TOP_CHIP_Y - 16 * pd)})`);
          d.el.setAttribute('opacity', String(r(1 - pd)));
        }
        // 2. 셈을 지나간다 — 위는 열 전부가, 아래는 새 자리만
        const raw = (ms - T_DROP) / T_PASS;
        const pp = ease(raw);
        const shown = clamp01(raw * 6);
        for (const a of h.topNew) {
          a.el.setAttribute('transform', `translate(${r(a.x)},${r(TOK_Y + (TOP_CHIP_Y - TOK_Y) * pp)})`);
          a.el.setAttribute('opacity', String(r(shown)));
        }
        for (const a of h.botNew) {
          a.el.setAttribute('transform', `translate(${r(a.x)},${r(TOK_Y + (BOT_CHIP_Y - TOK_Y) * pp)})`);
          a.el.setAttribute('opacity', String(r(shown)));
        }
        // 3. 눈금이 한 칸씩 쌓인다
        const tallyStart = T_DROP + T_PASS;
        const units = (list: SVGRectElement[]): void => {
          const each = list.length > 0 ? T_TALLY / list.length : T_TALLY;
          list.forEach((u, j) => {
            u.setAttribute('opacity', ms >= tallyStart + j * each ? '1' : '0');
          });
        };
        units(h.topUnits);
        units(h.botUnits);
        // 4. 이 걸음이 낸 토큰이 열 끝에 들어온다
        if (h.produced) {
          const pt = ease((ms - tallyStart) / T_TOKEN);
          h.produced.el.setAttribute('transform', `translate(${r(h.produced.x + 18 * (1 - pt))},${TOK_Y})`);
          h.produced.el.setAttribute('opacity', String(r(pt)));
        }
      };

      await run(mine, T_ALL, frame);
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
