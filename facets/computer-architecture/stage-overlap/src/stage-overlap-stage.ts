/**
 * 단계 겹치기 stage — 세로로 선 다섯 칸의 관(IF 가 위, WB 가 아래).
 *
 * 동사는 "밀려 들어간다". 박자마다 관 속 명령어가 모두 한 칸씩 아래로 내려가고,
 * 비워진 IF 로 줄 맨 앞의 명령어가 내려앉는다. 줄은 한 자리씩 당겨지고, WB 를 마친
 * 명령어는 관 밑으로 빠져 끝난 줄에 들어가며 먼저 끝난 것들을 옆으로 민다.
 * 모든 이동은 한 시계로 흐른다 — 한 박자는 한 번의 밀림이다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';

import type { StageKey } from './algorithm.js';
import type { StageOverlapScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 366;
const MARGIN = 16;

/** 캡션 두 줄의 바탕선. */
const CAPTION_Y1 = 20;
const CAPTION_Y2 = 37;
/** 기다리는 줄 · 관 · 끝난 줄의 세로 자리. */
const QUEUE_Y = 52;
const TILE_H = 28;
const PIPE_TOP = QUEUE_Y + TILE_H + 18;
const SLOT_H = 36;
const SLOT_GAP = 4;
/** 관의 왼쪽 벽. 그 왼쪽은 단계 이름표 자리다. */
const PIPE_X = 64;
const SLOT_PAD = 5;
const TILE_GAP = 12;
/** 타일 폭의 상한 — 명령어가 넷보다 적어도 줄이 포스터처럼 번지지 않게. */
const TILE_W_MAX = 150;

/** 한 박자의 밀림. */
const MOVE_MS = 520;
const FRAME_MS = 16;

type Point = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 등)는 1em, 나머지는 0.55em. */
function estimateWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? px : px * 0.55;
  return w;
}

function narrowInstructions(data: Record<string, unknown> | undefined): number {
  const list = data?.instructions;
  return Array.isArray(list) ? list.length : 0;
}

function stageLabel(t: Translate, key: StageKey): string {
  switch (key) {
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
  }
}

function captionOf(t: Translate, scene: StageOverlapScene): string {
  const step = scene.step;
  const n = scene.instructions.length;
  if (step === null) return '';
  if (step.kind === 'init') {
    return t('caption.init', '{n} instructions wait in line. The pipeline is empty.', { n });
  }
  if (step.kind === 'drain') {
    return t(
      'caption.drain',
      'All {n} finished by cycle {c}. One at a time, they would have taken {serial} cycles.',
      { n, c: scene.cycle, serial: step.serial },
    );
  }
  const c = scene.cycle;
  if (step.entered === null) {
    return t(
      'caption.noFetch',
      'Cycle {c}: everyone moves down one stage. Nothing is left to fetch, so IF stays empty.',
      { c },
    );
  }
  const ins = scene.instructions[step.entered] ?? '';
  const busy = scene.occupancy.filter((k) => k !== null).length;
  if (busy === 1) return t('caption.first', 'Cycle {c}: {ins} enters IF.', { c, ins });
  return t(
    'caption.push',
    'Cycle {c}: everyone moves down one stage, and {ins} enters the freed IF.',
    { c, ins },
  );
}

export const stageOverlapStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance & SceneRenderer<StageOverlapScene> {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const declaredCount = narrowInstructions(params.initialData);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 지금 화면의 타일 — 명령어 번호로 찾는다. drawStatic 이 매번 새로 짓는다. */
    let tiles = new Map<number, SVGGElement>();

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

    function label(
      parent: Element,
      text: string,
      x: number,
      y: number,
      opts: { size: string; fill: string; anchor?: string; weight?: number; mono?: boolean; maxW?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: round(x),
          y: round(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      if (opts.maxW !== undefined && estimateWidth(text, parseFloat(opts.size)) > opts.maxW) {
        node.setAttribute('textLength', String(round(opts.maxW)));
        node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
      node.textContent = text;
      return node;
    }

    // ── 자리 셈 (캔버스에서 역산한다) ─────────────────────────────

    function tileWidth(count: number): number {
      const k = Math.max(count, 1);
      const room = W - MARGIN - PIPE_X - SLOT_PAD - (k - 1) * TILE_GAP;
      return Math.min(TILE_W_MAX, Math.floor(room / k));
    }

    function queuePos(q: number, tw: number): Point {
      return { x: PIPE_X + SLOT_PAD + q * (tw + TILE_GAP), y: QUEUE_Y };
    }

    function slotTop(s: number): number {
      return PIPE_TOP + s * (SLOT_H + SLOT_GAP);
    }

    function slotPos(s: number): Point {
      return { x: PIPE_X + SLOT_PAD, y: slotTop(s) + (SLOT_H - TILE_H) / 2 };
    }

    function doneY(depth: number): number {
      return slotTop(depth) - SLOT_GAP + 18;
    }

    function donePos(d: number, tw: number, depth: number): Point {
      return { x: PIPE_X + SLOT_PAD + d * (tw + TILE_GAP), y: doneY(depth) };
    }

    /** 명령어 k 가 이 장면에서 서 있는 자리. */
    function placeOf(scene: StageOverlapScene, k: number, tw: number): Point {
      const depth = scene.stages.length;
      const s = scene.occupancy.indexOf(k);
      if (s >= 0) return slotPos(s);
      if (k >= scene.fetched) return queuePos(k - scene.fetched, tw);
      const i = scene.finished.findIndex((f) => f.k === k);
      return donePos(scene.finished.length - 1 - i, tw, depth);
    }

    /** 이번 걸음이 명령어 k 를 어디서 출발시키는가 — 장면의 step 이 말한다. */
    function originOf(scene: StageOverlapScene, k: number, tw: number): Point | null {
      const step = scene.step;
      if (step === null) return null;
      const depth = scene.stages.length;
      if (step.kind === 'init') {
        const to = queuePos(k, tw);
        return { x: to.x + (W - queuePos(0, tw).x), y: to.y };
      }
      const s = scene.occupancy.indexOf(k);
      if (s >= 0) return s === 0 ? queuePos(0, tw) : slotPos(s - 1);
      const entered = step.kind === 'cycle' ? step.entered : null;
      if (k >= scene.fetched) {
        return entered === null ? null : queuePos(k - scene.fetched + 1, tw);
      }
      if (step.left === null) return null;
      const i = scene.finished.findIndex((f) => f.k === k);
      const d = scene.finished.length - 1 - i;
      return d === 0 ? slotPos(depth - 1) : donePos(d - 1, tw, depth);
    }

    // ── 정적 그리기 — 장면 하나의 화면 전체 ────────────────────────

    function drawStatic(scene: StageOverlapScene): void {
      svg.textContent = '';
      tiles = new Map();
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);

      const count = scene.instructions.length > 0 ? scene.instructions.length : declaredCount;
      const tw = tileWidth(count);
      const depth = scene.stages.length;
      const fills = categorical(Math.max(count, 1), 'pastel');
      const edges = categorical(Math.max(count, 1), 'deep');

      // 캡션 — 지금 일어나는 일. 넘치면 두 줄로 가르고, 그래도 넘치면 좁힌다.
      const caption = captionOf(t, scene);
      const capW = W - 2 * MARGIN;
      const capPx = parseFloat(fontSizes.sm);
      const capOpts = { size: fontSizes.sm, fill: colors.text, maxW: capW };
      if (caption !== '' && estimateWidth(caption, capPx) > capW && caption.includes(' ')) {
        const mid = Math.floor(caption.length / 2);
        const before = caption.lastIndexOf(' ', mid);
        const after = caption.indexOf(' ', mid);
        const cut =
          before < 0 ? after : after < 0 ? before : mid - before <= after - mid ? before : after;
        label(svg, caption.slice(0, cut), MARGIN, CAPTION_Y1, capOpts);
        label(svg, caption.slice(cut + 1), MARGIN, CAPTION_Y2, capOpts);
      } else if (caption !== '') {
        label(svg, caption, MARGIN, CAPTION_Y1 + 8, capOpts);
      }

      if (depth === 0) return;

      // 줄 이름표
      const labelX = PIPE_X - 10;
      const muted = { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end', maxW: labelX - 4 };
      label(svg, t('label.queue', 'queue'), labelX, QUEUE_Y + TILE_H / 2 + 4, muted);
      label(svg, t('label.done', 'done'), labelX, doneY(depth) + TILE_H / 2 + 4, muted);

      // 관 — 다섯 칸과 단계 이름
      const slotW = tw + 2 * SLOT_PAD;
      for (let s = 0; s < depth; s += 1) {
        const key = scene.stages[s];
        if (key === undefined) continue;
        const busy = scene.occupancy[s] !== null && scene.occupancy[s] !== undefined;
        el(
          'rect',
          {
            x: PIPE_X,
            y: round(slotTop(s)),
            width: slotW,
            height: SLOT_H,
            rx: 3,
            fill: busy ? colors.bgSubtle : colors.bg,
            stroke: colors.border,
            'stroke-width': 1,
          },
          svg,
        );
        label(svg, stageLabel(t, key), labelX, slotTop(s) + SLOT_H / 2 + 4, {
          size: fontSizes.sm,
          fill: busy ? colors.text : colors.textMuted,
          anchor: 'end',
          weight: 600,
        });
      }

      // 박자 읽음 — 관 오른쪽
      const busyCount = scene.occupancy.filter((k) => k !== null).length;
      const readX = PIPE_X + slotW + 28;
      const readW = W - MARGIN - readX;
      if (scene.cycle > 0) {
        label(svg, t('label.cycle', 'cycle {c}', { c: scene.cycle }), readX, slotTop(1) + 8, {
          size: fontSizes.xl,
          fill: colors.text,
          weight: 600,
          maxW: readW,
        });
        label(
          svg,
          t('label.busy', '{busy} of {total} stages busy', { busy: busyCount, total: depth }),
          readX,
          slotTop(1) + 30,
          { size: fontSizes.sm, fill: colors.textMuted, maxW: readW },
        );
      }

      // 끝난 줄 밑의 사이클 표 — 각자 WB 를 마친 사이클
      for (let i = 0; i < scene.finished.length; i += 1) {
        const f = scene.finished[i];
        if (f === undefined) continue;
        const p = donePos(scene.finished.length - 1 - i, tw, depth);
        label(svg, t('label.doneAt', 'cycle {c}', { c: f.at }), p.x + tw / 2, p.y + TILE_H + 14, {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
          maxW: tw,
        });
      }

      // 명령어 타일 — 제자리(끝 자리)에 선다
      for (let k = 0; k < scene.instructions.length; k += 1) {
        const text = scene.instructions[k] ?? '';
        const at = placeOf(scene, k, tw);
        const g = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` }, svg);
        el(
          'rect',
          {
            x: 0,
            y: 0,
            width: tw,
            height: TILE_H,
            rx: 4,
            fill: fills[k] ?? colors.bgSubtle,
            stroke: edges[k] ?? colors.border,
            'stroke-width': 1.5,
          },
          g,
        );
        label(g, text, tw / 2, TILE_H / 2 + 4, {
          size: fontSizes.sm,
          fill: colors.stateInk,
          anchor: 'middle',
          mono: true,
          maxW: tw - 8,
        });
        tiles.set(k, g);
      }
    }

    // ── 운동 ──────────────────────────────────────────────────────

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    type Move = { g: SVGGElement; from: Point; to: Point };

    async function push(scene: StageOverlapScene, mine: number): Promise<void> {
      const tw = tileWidth(scene.instructions.length);
      const moves: Move[] = [];
      for (let k = 0; k < scene.instructions.length; k += 1) {
        const g = tiles.get(k);
        const from = originOf(scene, k, tw);
        if (g === undefined || from === null) continue;
        const to = placeOf(scene, k, tw);
        if (from.x === to.x && from.y === to.y) continue;
        moves.push({ g, from, to });
      }
      if (moves.length === 0) return;

      const place = (u: number): void => {
        const e = ease(u);
        for (const m of moves) {
          const x = round(m.from.x + (m.to.x - m.from.x) * e);
          const y = round(m.from.y + (m.to.y - m.from.y) * e);
          m.g.setAttribute('transform', `translate(${x},${y})`);
        }
      };

      // 끝 자리가 첫 프레임에 번쩍이지 않게 — 아직 못 온 만큼으로 되돌려 놓고 출발한다.
      place(0);
      const start = Date.now();
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const u = Math.min(1, (Date.now() - start) / MOVE_MS);
        place(u);
        if (u >= 1) return;
      }
    }

    return {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || prev === null || next.step === null) return;
        await push(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
