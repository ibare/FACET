/**
 * 배치와 패딩 — stage view.
 *
 * 화면은 넷이다.
 *   위     대기열 — 요청 조각이 도착 차례로 늘어선다. 맨 앞이 빠지면 뒤가 앞으로 밀린다.
 *   가운데 자리 줄 — 자리마다 칸이 한 칸씩 자란다. 토큰은 요청 색, 빈칸은 빗금.
 *                   자리 수를 바꾸면 줄이 펴지거나 접힌다.
 *   오른쪽 돌려받은 걸음 — 요청마다 끝난 걸음만큼 막대가 자란다. 점선은 앞 판의 막대.
 *   아래   칸 막대 — 지금까지 쓴 칸(토큰)과 빈칸의 몫.
 *
 * projector 가 판의 상태를 통째로 `show(state, ms)` 로 넘긴다. stage 는 요소를 이어 쓰며
 * 자리를 옮길 것은 `ms` 동안 흘려 옮긴다 — 재생 속도에 맞춘 길이는 projector 가 셈한다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type BatchStageRequest = { tokens: number; prompt: string };
/**
 * 자리 하나. `req` 는 요청 색인(없으면 -1), `done` 은 낸 토큰, `pad` 는 쌓인 빈칸.
 * `gone` 이 참이면 요청은 이미 돌려받았고 칸만 흐리게 남는다 (묶어서 기다림에서 다음 묶음이 앉기 전까지).
 */
export type BatchStageLane = { req: number; done: number; pad: number; gone?: boolean };

export type BatchStageCaption =
  | { kind: 'setup'; policy: number; slots: number }
  | { kind: 'form'; batch: number; first: number; last: number; longest: number; len: number }
  | { kind: 'step'; step: number; active: number; slots: number }
  | { kind: 'refill'; moves: { req: number; slot: number }[] }
  | { kind: 'release'; step: number; reqs: number[] }
  | { kind: 'return'; step: number; reqs: number[] }
  | { kind: 'done'; steps: number; idle: number; cells: number };

export type BatchStageState = {
  requests: BatchStageRequest[];
  slots: number;
  lanes: BatchStageLane[];
  /** 대기열의 요청 색인, 앞에서부터. */
  queue: number[];
  /** 요청마다 끝난 걸음. 0 = 아직. */
  finish: number[];
  /** 앞 판의 끝난 걸음. 빈 배열이면 앞 판이 없다. */
  ghost: number[];
  step: number;
  idle: number;
  used: number;
  cells: number;
  /** 가동 % — 알고리즘이 셈한 값. */
  pct: number;
  caption: BatchStageCaption | null;
};

/** projector 가 부르는 stage 의 표면. */
export type BatchStage = {
  show(state: BatchStageState, ms: number): void;
};

// ── 자리 잡기 ───────────────────────────────────────────────────────────────

const W = 620;
const H = 470;
const PAD_X = 16;

/** 자리 사다리의 끝값 — 자리 줄은 이만큼을 처음부터 담는다. */
const MAX_LANES = 8;
/** 칸 줄의 칸 수 — 가장 긴 묶음(토큰 12)이 들어간다. */
const MAX_CELLS = 12;
/** 칸 막대의 끝 — 자리 8 × 걸음 12 = 96 이 가장 크다. */
const MAX_CAPACITY = 96;
/** 돌려받은 걸음 막대의 끝 — 자리 1 의 걸음 48. */
const MAX_FINISH = 48;

const CHIP_W = 46;
const CHIP_H = 20;

const QUEUE_Y = 34;
const QUEUE_X = 70;
const QUEUE_GAP = 6;

const LANES_TOP = 96;
const LANES_H = 272;
const LANE_X = 16;
const LANE_CHIP_X = 70;
const CELLS_X = 124;
const CELL_GAP = 2;
const CELL_W = 20;

const TRAY_X = 404;
const TRAY_BAR_X = TRAY_X + CHIP_W + 8;
const TRAY_BAR_W = W - PAD_X - 22 - TRAY_BAR_X;
const TRAY_ROW_H = LANES_H / MAX_LANES;

const BAR_Y = 392;
const BAR_X = 70;
const BAR_W = W - PAD_X - BAR_X;
const BAR_H = 14;

const STATS_Y = 428;
const CAPTION_Y = 454;

const SVG_NS = 'http://www.w3.org/2000/svg';

let hatchSerial = 0;

function lanePitch(slots: number): number {
  return Math.min(40, LANES_H / Math.max(1, slots));
}
function laneY(s: number, slots: number): number {
  return LANES_TOP + s * lanePitch(slots);
}
function round(x: number): number {
  const r = Math.round(x * 100) / 100;
  return r === 0 ? 0 : r;
}
function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** 상태가 없을 때 쓰는 빈 판. */
function emptyState(): BatchStageState {
  return {
    requests: [],
    slots: 0,
    lanes: [],
    queue: [],
    finish: [],
    ghost: [],
    step: 0,
    idle: 0,
    used: 0,
    cells: 0,
    pct: 0,
    caption: null,
  };
}

export const batchingAndPaddingStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params): ViewInstance & BatchStage {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const tones = categorical(MAX_LANES, 'vivid');
    const toneOf = (req: number): string => tones[req % tones.length] ?? c.itemActive;

    let destroyed = false;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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
    function text(parent: Element, x: number, y: number, size: string, fill: string, anchor = 'start') {
      const node = el('text', { x, y, 'font-size': size, 'font-family': fonts.body, fill, 'text-anchor': anchor }, parent);
      return node;
    }

    // ── 흐름 — 같은 열쇠의 새 흐름은 앞 것을 대신하고, 지금 값에서 출발한다 ──
    const current = new Map<string, number>();
    const running = new Map<string, () => void>();

    function schedule(fn: () => void): () => void {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          fn();
        });
        frames.add(id);
        return () => {
          cancelAnimationFrame(id);
          frames.delete(id);
        };
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, 16);
      timers.add(id);
      return () => {
        clearTimeout(id);
        timers.delete(id);
      };
    }

    function flow(key: string, target: number, ms: number, apply: (v: number) => void, snapDown = false): void {
      running.get(key)?.();
      running.delete(key);
      const from = current.get(key);
      if (from === undefined || ms <= 0 || from === target || destroyed || (snapDown && target < from)) {
        current.set(key, target);
        apply(target);
        return;
      }
      const start = Date.now();
      const tick = () => {
        if (destroyed) return;
        const k = Math.min(1, (Date.now() - start) / ms);
        const value = from + (target - from) * ease(k);
        current.set(key, value);
        apply(value);
        if (k < 1) running.set(key, schedule(tick));
        else running.delete(key);
      };
      running.set(key, schedule(tick));
    }

    // ── 바탕 ────────────────────────────────────────────────────────────────
    const root = el('g', {}, svg);
    const defs = el('defs', {}, root);
    hatchSerial += 1;
    const hatchId = `batching-and-padding-hatch-${hatchSerial}`;
    const hatch = el(
      'pattern',
      { id: hatchId, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      defs,
    );
    el('rect', { x: 0, y: 0, width: 5, height: 5, fill: c.bgSubtle }, hatch);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: c.textMuted, 'stroke-width': 1.6 }, hatch);
    const hatchFill = `url(#${hatchId})`;

    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);
    text(root, PAD_X, QUEUE_Y + 14, fontSizes.sm, c.textMuted).textContent = t('label.queue', 'Queue');
    const queueEmpty = text(root, QUEUE_X, QUEUE_Y + 14, fontSizes.sm, c.textMuted);
    text(root, TRAY_X, LANES_TOP - 12, fontSizes.sm, c.textMuted).textContent = t(
      'label.returned',
      'Returned at step',
    );
    text(root, PAD_X, BAR_Y + 11, fontSizes.sm, c.textMuted).textContent = t('label.cells', 'Cells');
    el('rect', { x: BAR_X, y: BAR_Y, width: BAR_W, height: BAR_H, fill: 'none', stroke: c.border }, root);
    const usedBar = el('rect', { x: BAR_X, y: BAR_Y, width: 0, height: BAR_H, fill: c.itemActive }, root);
    const idleBar = el('rect', { x: BAR_X, y: BAR_Y, width: 0, height: BAR_H, fill: hatchFill }, root);
    const legend = text(root, W - PAD_X, BAR_Y - 8, fontSizes.xs, c.textMuted, 'end');
    const stats = text(root, PAD_X, STATS_Y, fontSizes.md, c.text);
    const caption = text(root, PAD_X, CAPTION_Y, fontSizes.sm, c.textMuted);

    const lanesLayer = el('g', {}, root);
    const trayLayer = el('g', {}, root);
    const chipsLayer = el('g', {}, root);

    // ── 자리 줄 — 사다리 끝값만큼 처음부터 둔다 ────────────────────────────
    type LaneNodes = { g: SVGGElement; label: SVGTextElement; prompt: SVGTextElement; cells: SVGGElement };
    const laneNodes: LaneNodes[] = [];
    for (let s = 0; s < MAX_LANES; s++) {
      const g = el('g', {}, lanesLayer);
      const label = text(g, LANE_X, 26, fontSizes.sm, c.text);
      label.textContent = t('label.slot', 'Slot {n}', { n: s + 1 });
      const prompt = text(g, CELLS_X, 9, fontSizes.xs, c.textMuted);
      const cells = el('g', {}, g);
      laneNodes.push({ g, label, prompt, cells });
    }
    let lanesNow: BatchStageLane[] = [];
    let requestsNow: BatchStageRequest[] = [];
    let slotsNow = 0;

    function drawCells(s: number, front: number): void {
      const node = laneNodes[s];
      if (!node) return;
      node.cells.textContent = '';
      const lane = lanesNow[s];
      if (!lane || s >= slotsNow) return;
      const cellH = Math.max(8, Math.min(18, lanePitch(slotsNow) - 16));
      const len = lane.req >= 0 ? requestsNow[lane.req]?.tokens ?? 0 : 0;
      for (let k = 0; k < MAX_CELLS; k++) {
        const x = CELLS_X + k * (CELL_W + CELL_GAP);
        const filled = Math.max(0, Math.min(1, front - k));
        const token = lane.req >= 0 && k < len;
        if (token) {
          el('rect', { x, y: 12, width: CELL_W, height: cellH, fill: 'none', stroke: toneOf(lane.req), 'stroke-width': 1 }, node.cells);
        }
        if (filled > 0) {
          // 낸 토큰은 요청 색, 그 뒤로 쌓인 것은 빈칸.
          const kind = lane.req >= 0 && k < lane.done ? 'token' : 'pad';
          el(
            'rect',
            {
              x,
              y: 12,
              width: round(CELL_W * filled),
              height: cellH,
              fill: kind === 'token' ? toneOf(lane.req) : hatchFill,
            },
            node.cells,
          );
        }
      }
    }

    // ── 요청 조각 · 돌려받은 막대 ────────────────────────────────────────────
    type ChipNodes = { g: SVGGElement; rect: SVGRectElement; name: SVGTextElement; count: SVGTextElement };
    const chips: ChipNodes[] = [];
    type TrayNodes = { ghost: SVGRectElement; bar: SVGRectElement; value: SVGTextElement; slot: SVGRectElement };
    const trays: TrayNodes[] = [];

    function ensureRequests(n: number): void {
      while (chips.length < n) {
        const r = chips.length;
        const g = el('g', {}, chipsLayer);
        const rect = el(
          'rect',
          { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: 4, fill: c.bg, stroke: toneOf(r), 'stroke-width': 2 },
          g,
        );
        const name = text(g, 6, 14, fontSizes.sm, c.text);
        name.setAttribute('font-weight', '600');
        name.textContent = t('label.request', 'R{n}', { n: r + 1 });
        const count = text(g, CHIP_W - 5, 14, fontSizes.xs, c.textMuted, 'end');
        chips.push({ g, rect, name, count });

        const y = LANES_TOP + r * TRAY_ROW_H;
        const slot = el(
          'rect',
          { x: TRAY_X, y, width: CHIP_W, height: CHIP_H, rx: 4, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 2' },
          trayLayer,
        );
        const ghost = el(
          'rect',
          { x: TRAY_BAR_X, y: y + 4, width: 0, height: CHIP_H - 8, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 2' },
          trayLayer,
        );
        const bar = el('rect', { x: TRAY_BAR_X, y: y + 4, width: 0, height: CHIP_H - 8, fill: toneOf(r) }, trayLayer);
        const value = text(trayLayer, TRAY_BAR_X + 4, y + 14, fontSizes.xs, c.text);
        trays.push({ ghost, bar, value, slot });
      }
      for (let r = 0; r < chips.length; r++) {
        const on = r < n ? '' : 'none';
        chips[r]!.g.style.display = on;
        trays[r]!.ghost.style.display = on;
        trays[r]!.bar.style.display = on;
        trays[r]!.value.style.display = on;
        trays[r]!.slot.style.display = on;
      }
    }

    function chipTarget(state: BatchStageState, r: number): [number, number] {
      const q = state.queue.indexOf(r);
      if (q >= 0) return [QUEUE_X + q * (CHIP_W + QUEUE_GAP), QUEUE_Y];
      const s = state.lanes.findIndex((l) => l.req === r && !l.gone);
      if (s >= 0) return [LANE_CHIP_X, laneY(s, state.slots) + 12];
      return [TRAY_X, LANES_TOP + r * TRAY_ROW_H];
    }

    function captionText(cap: BatchStageCaption | null): string {
      if (!cap) return '';
      const reqName = (r: number) => t('label.request', 'R{n}', { n: r + 1 });
      const policyName = (p: number) =>
        p === 0 ? t('policy.wait', 'Wait for the batch') : t('policy.refill', 'Refill empty slots');
      switch (cap.kind) {
        case 'setup':
          return t('caption.setup', '{policy} with {slots} slots. Every request starts in the queue.', {
            policy: policyName(cap.policy),
            slots: cap.slots,
          });
        case 'form':
          if (cap.first === cap.last) {
            return t('caption.formOne', 'Batch {batch}: {first} alone, {len} tokens.', {
              batch: cap.batch,
              first: reqName(cap.first),
              len: cap.len,
            });
          }
          return t('caption.form', 'Batch {batch}: {first}–{last}. The longest is {longest}, {len} tokens.', {
            batch: cap.batch,
            first: reqName(cap.first),
            last: reqName(cap.last),
            longest: reqName(cap.longest),
            len: cap.len,
          });
        case 'step':
          return t('caption.step', 'Step {step}: {active} of {slots} slots make a token.', {
            step: cap.step,
            active: cap.active,
            slots: cap.slots,
          });
        case 'refill':
          return t('caption.refill', 'From the queue into empty slots: {list}.', {
            list: cap.moves
              .map((m) => t('label.move', '{req} → slot {slot}', { req: reqName(m.req), slot: m.slot + 1 }))
              .join(t('label.listSep', ', ')),
          });
        case 'release':
          return t('caption.release', 'Finished at step {step} and left the slot: {list}.', {
            step: cap.step,
            list: cap.reqs.map(reqName).join(t('label.listSep', ', ')),
          });
        case 'return':
          return t('caption.return', 'Batch over at step {step}. Returned together: {list}.', {
            step: cap.step,
            list: cap.reqs.map(reqName).join(t('label.listSep', ', ')),
          });
        case 'done':
          return t('caption.done', 'Finished in {steps} steps. {idle} of {cells} cells were empty.', {
            steps: cap.steps,
            idle: cap.idle,
            cells: cap.cells,
          });
      }
    }

    function show(state: BatchStageState, ms: number): void {
      if (destroyed) return;
      requestsNow = state.requests;
      lanesNow = state.lanes;
      slotsNow = state.slots;
      ensureRequests(state.requests.length);

      // 대기열
      queueEmpty.textContent =
        state.queue.length === 0 && state.requests.length > 0 ? t('label.queueEmpty', '(empty)') : '';
      queueEmpty.setAttribute('x', String(QUEUE_X + 4));

      // 자리 줄 — 보이는 줄은 제자리로 펴지고, 남는 줄은 마지막 줄로 접힌다.
      for (let s = 0; s < MAX_LANES; s++) {
        const node = laneNodes[s]!;
        const visible = s < state.slots;
        const y = visible ? laneY(s, state.slots) : laneY(Math.max(0, state.slots - 1), state.slots);
        flow(`lane:${s}:y`, y, ms, (v) => node.g.setAttribute('transform', `translate(0 ${round(v)})`));
        flow(`lane:${s}:o`, visible ? 1 : 0, ms, (v) => node.g.setAttribute('opacity', String(round(v))));
        const lane = state.lanes[s];
        node.prompt.textContent =
          visible && lane && lane.req >= 0 && !lane.gone ? state.requests[lane.req]?.prompt ?? '' : '';
        node.cells.setAttribute('opacity', lane?.gone ? '0.4' : '1');
        const front = visible && lane ? lane.done + lane.pad : 0;
        flow(`lane:${s}:front`, front, ms, (v) => drawCells(s, v), true);
      }

      // 요청 조각과 돌려받은 막대
      const barScale = TRAY_BAR_W / MAX_FINISH;
      for (let r = 0; r < state.requests.length; r++) {
        const chip = chips[r]!;
        const tray = trays[r]!;
        chip.count.textContent = String(state.requests[r]!.tokens);
        const [x, y] = chipTarget(state, r);
        flow(`chip:${r}:x`, x, ms, (v) => chip.g.setAttribute('transform', `translate(${round(v)} ${round(current.get(`chip:${r}:y`) ?? y)})`));
        flow(`chip:${r}:y`, y, ms, (v) => chip.g.setAttribute('transform', `translate(${round(current.get(`chip:${r}:x`) ?? x)} ${round(v)})`));
        const fin = state.finish[r] ?? 0;
        const ghost = state.ghost[r] ?? 0;
        tray.ghost.setAttribute('width', String(round(ghost * barScale)));
        tray.ghost.style.display = ghost > 0 ? '' : 'none';
        flow(`bar:${r}`, fin * barScale, ms, (v) => tray.bar.setAttribute('width', String(round(v))));
        tray.value.textContent = fin > 0 ? String(fin) : '';
        tray.value.setAttribute('x', String(round(TRAY_BAR_X + Math.max(fin, ghost) * barScale + 4)));
      }

      // 칸 막대 — 쓴 칸과 빈칸
      const capScale = BAR_W / MAX_CAPACITY;
      flow('used', state.used * capScale, ms, (v) => {
        usedBar.setAttribute('width', String(round(v)));
        idleBar.setAttribute('x', String(round(BAR_X + v)));
      });
      flow('idle', state.idle * capScale, ms, (v) => idleBar.setAttribute('width', String(round(v))));
      legend.textContent = state.ghost.length > 0 ? t('label.ghost', 'Dashed bars: the previous run') : '';

      stats.textContent =
        state.requests.length === 0
          ? ''
          : t('label.stats', 'Step {step} · cells {cells} · empty {idle} · busy {pct}%', {
              step: state.step,
              cells: state.cells,
              idle: state.idle,
              pct: state.pct,
            });
      caption.textContent = captionText(state.caption);
    }

    show(emptyState(), 0);

    return {
      show,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        running.clear();
        svg.textContent = '';
      },
    };
  },
};
