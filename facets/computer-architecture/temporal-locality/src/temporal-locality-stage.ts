/**
 * temporal-locality 조각의 그림.
 *
 * 두 층으로 세운다. 위는 칸 둘짜리 캐시, 아래는 라인이 늘어선 메모리다. 맨 위에
 * 접근열 두 줄이 있고, 한 번의 접근마다 **탐침이 그 자리에서 내려간다.**
 *
 *   맞으면  캐시 칸에서 되돌아온다 — 아래층까지 가지 않는다.
 *   빗나가면 아래층까지 내려가고, 그 라인이 칸으로 **올라온다.**
 *            칸이 차 있으면 가장 오래 기다린 것이 아래로 **밀려난다.**
 *
 * 내려간 길은 실선으로 남는다. 접근열이 끝나면 그 줄이 아래층까지 몇 번
 * 내려갔는지가 화면에 그대로 보인다 — 셈을 옆의 계기로 날려 보내지 않고 재는
 * 자리에 남긴다 (S-piece).
 *
 * 색은 전부 design-tokens 에서 받는다 (S-view). 맞음은 `accent`, 빗나감은
 * `danger` — 미스는 비용을 치르는 사건이라 severity 로 읽는다. 올라온 라인은
 * `itemSorted` 에 `textInverse` 잉크다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 세로는 이 그림이 정하는 값이라 여기 둔다 (S-piece). */
const W = PIECE_CANVAS_W;
const STAGE_H = 292;

const SIDE = 16;
const LABEL_W = 60;
const ROW_H = 26;
const ROW_Y = [22, 58] as const;
const TOKEN_GAP = 8;
const TOKEN_MAX_W = 84;
const MARK_W = 16;

const SLOT_Y = 112;
const SLOT_H = 48;
const SLOT_GAP = 28;
const SLOT_MAX_W = 210;

const MEM_Y = 208;
const MEM_H = 32;
const MEM_GAP = 4;
const MEM_MAX_W = 52;

const CAPTION_Y = 272;

const DOWN_HIT_MS = 190;
const HOLD_MS = 90;
const UP_HIT_MS = 160;
const DOWN_MISS_MS = 300;
const EVICT_MS = 200;
const RISE_MS = 300;
const WAKE_MS = 160;
const VERDICT_MS = 320;

const PROBE_R = 7;
const EVICT_DROP = 58;

/**
 * 도형에 새겨진 표식 (C10). 번역하지 않는다 — `cache` · `memory` · `line` 은
 * 한국어 문서도 원어 그대로 쓰는 말이고, `a[3]` · `H` · `M` 은 도식 기호다.
 */
const CACHE_MARK = 'cache';
const MEMORY_MARK = 'memory';
const HIT_MARK = 'H';
const MISS_MARK = 'M';
const cellMark = (index: number): string => `a[${index}]`;
const lineMark = (line: number): string => `line ${line}`;

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

type Scene = {
  slots: number;
  lineBytes: number;
  elemBytes: number;
  streams: number[][];
};

type TokenCell = {
  rect: SVGRectElement;
  label: SVGTextElement;
  markRect: SVGRectElement;
  markText: SVGTextElement;
  x: number;
  w: number;
  y: number;
  cx: number;
};

type RowView = {
  label: SVGTextElement;
  tokens: TokenCell[];
  trails: SVGLineElement[];
};

type SlotView = { rect: SVGRectElement; x: number; w: number; cx: number };
type MemView = { rect: SVGRectElement; label: SVGTextElement; x: number; w: number; cx: number };
type Block = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; at: Rect };

export type TemporalLocalityAccessView = {
  stream: number;
  step: number;
  index: number;
  line: number;
  hit: boolean;
  slot: number;
  evicted: number | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 한 줄에 균등하게 늘어놓되 남는 폭을 여백으로 버리지 않는다 (S-piece). */
function spread(count: number, from: number, span: number, gap: number, maxW: number): {
  w: number;
  x0: number;
} {
  if (count <= 0) return { w: 0, x0: from };
  const w = Math.max(8, Math.min(maxW, Math.floor((span - gap * (count - 1)) / count)));
  const total = w * count + gap * (count - 1);
  return { w, x0: from + Math.round((span - total) / 2) };
}

/**
 * `initialData` 를 좁히는 자리는 mount 다 (S-piece). projector 는 이것을 다시
 * 좁혀 밀어 넣지 않는다 — 걸음마다 오는 payload 만 좁혀 넘긴다.
 */
function readScene(data: Record<string, unknown> | undefined): Scene {
  const d = data ?? {};
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const streams: number[][] = [];
  if (Array.isArray(d.streams)) {
    for (const raw of d.streams) {
      if (typeof raw !== 'object' || raw === null) continue;
      const indices = (raw as Record<string, unknown>).indices;
      if (!Array.isArray(indices)) continue;
      streams.push(indices.filter((n): n is number => typeof n === 'number'));
    }
  }
  return {
    slots: Math.max(1, Math.floor(num(d.slots, 2))),
    lineBytes: Math.max(1, num(d.lineBytes, 16)),
    elemBytes: Math.max(1, num(d.elemBytes, 4)),
    streams,
  };
}

export const temporalLocalityStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const trailLayer = el('g', {});
    const memLayer = el('g', {});
    const cacheLayer = el('g', {});
    const rowLayer = el('g', {});
    svg.appendChild(trailLayer);
    svg.appendChild(memLayer);
    svg.appendChild(cacheLayer);
    svg.appendChild(rowLayer);

    // ── 아래층: 라인이 늘어선 메모리 ──────────────────────────────────────
    let maxLine = 0;
    for (const indices of scene.streams) {
      for (const index of indices) {
        maxLine = Math.max(maxLine, Math.floor((index * scene.elemBytes) / scene.lineBytes));
      }
    }
    const lineCount = scene.streams.length > 0 ? maxLine + 1 : 0;
    const memSpread = spread(lineCount, SIDE, W - SIDE * 2, MEM_GAP, MEM_MAX_W);
    const memBoxes: MemView[] = [];

    memLayer.appendChild(
      el('text', {
        x: SIDE,
        y: MEM_Y - 9,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    ).textContent = MEMORY_MARK;

    for (let i = 0; i < lineCount; i += 1) {
      const x = memSpread.x0 + i * (memSpread.w + MEM_GAP);
      const rect = el('rect', {
        x,
        y: MEM_Y,
        width: memSpread.w,
        height: MEM_H,
        rx: 5,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      const label = el('text', {
        x: x + memSpread.w / 2,
        y: MEM_Y + MEM_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = String(i);
      memLayer.appendChild(rect);
      memLayer.appendChild(label);
      memBoxes.push({ rect, label, x, w: memSpread.w, cx: x + memSpread.w / 2 });
    }

    // ── 위층: 칸 둘짜리 캐시 ──────────────────────────────────────────────
    const slotSpread = spread(scene.slots, SIDE, W - SIDE * 2, SLOT_GAP, SLOT_MAX_W);
    const slots: SlotView[] = [];

    cacheLayer.appendChild(
      el('text', {
        x: slotSpread.x0,
        y: SLOT_Y - 9,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    ).textContent = CACHE_MARK;

    for (let i = 0; i < scene.slots; i += 1) {
      const x = slotSpread.x0 + i * (slotSpread.w + SLOT_GAP);
      const rect = el('rect', {
        x,
        y: SLOT_Y,
        width: slotSpread.w,
        height: SLOT_H,
        rx: 7,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1.4,
        'stroke-dasharray': '5 4',
      });
      cacheLayer.appendChild(rect);
      slots.push({ rect, x, w: slotSpread.w, cx: x + slotSpread.w / 2 });
    }

    // ── 맨 위: 접근열 두 줄 ───────────────────────────────────────────────
    const rows: RowView[] = [];

    for (let s = 0; s < scene.streams.length; s += 1) {
      const indices = scene.streams[s] ?? [];
      const y = ROW_Y[Math.min(s, ROW_Y.length - 1)] ?? ROW_Y[0];
      const geom = spread(indices.length, SIDE + LABEL_W, W - SIDE * 2 - LABEL_W, TOKEN_GAP, TOKEN_MAX_W);

      const label = el('text', {
        x: SIDE + LABEL_W - 12,
        y: y + ROW_H / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      // 키와 en 원본을 리터럴로 둔다 — 추출기와 대조 검사가 리터럴만 읽는다 (C10).
      label.textContent = s === 0 ? t('label.near', 'same spot') : t('label.far', 'scattered');
      rowLayer.appendChild(label);

      const tokens: TokenCell[] = [];
      for (let i = 0; i < indices.length; i += 1) {
        const x = geom.x0 + i * (geom.w + TOKEN_GAP);
        const rect = el('rect', {
          x,
          y,
          width: geom.w,
          height: ROW_H,
          rx: 6,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1,
        });
        const text = el('text', {
          x: x + (geom.w - MARK_W - 6) / 2,
          y: y + ROW_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        text.textContent = cellMark(indices[i] ?? 0);
        const markRect = el('rect', {
          x: x + geom.w - MARK_W - 5,
          y: y + (ROW_H - MARK_W) / 2,
          width: MARK_W,
          height: MARK_W,
          rx: 4,
          fill: c.bgSubtle,
          opacity: 0,
        });
        const markText = el('text', {
          x: x + geom.w - MARK_W / 2 - 5,
          y: y + ROW_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.stateInk,
          opacity: 0,
        });
        rowLayer.appendChild(rect);
        rowLayer.appendChild(text);
        rowLayer.appendChild(markRect);
        rowLayer.appendChild(markText);
        tokens.push({ rect, label: text, markRect, markText, x, w: geom.w, y, cx: x + geom.w / 2 });
      }
      rows.push({ label, tokens, trails: [] });
    }

    const probe = el('circle', {
      cx: -20,
      cy: -20,
      r: PROBE_R,
      fill: c.itemActive,
      opacity: 0,
    });
    svg.appendChild(probe);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    svg.appendChild(caption);

    // ── 기다리는 것들 ────────────────────────────────────────────────────
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const blocks = new Map<number, Block>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function tween(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const start = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id: number | null = null;
        const step = (): void => {
          if (id !== null) {
            frames.delete(id);
            id = null;
          }
          if (destroyed) return finish();
          const p = ms <= 0 ? 1 : Math.min(1, (now() - start) / ms);
          draw(ease(p));
          if (p >= 1) return finish();
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    // ── 그림 조작 ────────────────────────────────────────────────────────
    function placeProbe(at: Pt): void {
      probe.setAttribute('cx', String(at.x));
      probe.setAttribute('cy', String(at.y));
    }

    function moveProbe(from: Pt, to: Pt, ms: number): Promise<void> {
      return tween(ms, (p) => placeProbe({ x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) }));
    }

    function makeBlock(line: number, at: Rect): Block {
      const g = el('g', {});
      const rect = el('rect', {
        x: at.x,
        y: at.y,
        width: at.w,
        height: at.h,
        rx: 6,
        fill: c.itemSorted,
      });
      const text = el('text', {
        x: at.x + at.w / 2,
        y: at.y + at.h / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textInverse,
        opacity: 0,
      });
      text.textContent = lineMark(line);
      g.appendChild(rect);
      g.appendChild(text);
      cacheLayer.appendChild(g);
      return { g, rect, text, at };
    }

    function placeBlock(block: Block, at: Rect): void {
      block.at = at;
      block.rect.setAttribute('x', String(at.x));
      block.rect.setAttribute('y', String(at.y));
      block.rect.setAttribute('width', String(at.w));
      block.rect.setAttribute('height', String(at.h));
      block.text.setAttribute('x', String(at.x + at.w / 2));
      block.text.setAttribute('y', String(at.y + at.h / 2 + 4));
    }

    function slotRect(slot: SlotView): Rect {
      return { x: slot.x + 5, y: SLOT_Y + 5, w: slot.w - 10, h: SLOT_H - 10 };
    }

    function memRect(box: MemView): Rect {
      return { x: box.x, y: MEM_Y, w: box.w, h: MEM_H };
    }

    /** 칸에 있던 라인이 아래로 밀려난다. */
    async function evict(slotIndex: number): Promise<void> {
      const block = blocks.get(slotIndex);
      if (!block) return;
      blocks.delete(slotIndex);
      const from = block.at;
      await tween(EVICT_MS, (p) => {
        placeBlock(block, { ...from, y: from.y + EVICT_DROP * p });
        block.g.setAttribute('opacity', String(1 - p));
      });
      block.g.remove();
    }

    /** 아래층의 라인이 칸으로 올라오고, 탐침도 함께 제 자리로 돌아온다. */
    async function rise(line: number, slotIndex: number, probeHome: Pt): Promise<void> {
      const box = memBoxes[line];
      const slot = slots[slotIndex];
      if (!box || !slot) return;
      const from = memRect(box);
      const to = slotRect(slot);
      const block = makeBlock(line, from);
      const probeFrom: Pt = { x: box.cx, y: MEM_Y + MEM_H / 2 };
      await tween(RISE_MS, (p) => {
        placeBlock(block, {
          x: lerp(from.x, to.x, p),
          y: lerp(from.y, to.y, p),
          w: lerp(from.w, to.w, p),
          h: lerp(from.h, to.h, p),
        });
        block.text.setAttribute('opacity', String(p));
        placeProbe({ x: lerp(probeFrom.x, probeHome.x, p), y: lerp(probeFrom.y, probeHome.y, p) });
      });
      blocks.set(slotIndex, block);
    }

    /** 이미 있던 라인이 한 번 들썩인다 — 맞았다는 표시. */
    async function nudge(slotIndex: number): Promise<void> {
      const block = blocks.get(slotIndex);
      if (!block) return;
      const base = block.at;
      await tween(HOLD_MS * 2, (p) => {
        const lift = Math.sin(p * Math.PI) * 5;
        placeBlock(block, { ...base, y: base.y - lift });
      });
      placeBlock(block, base);
    }

    function addTrail(row: RowView, from: Pt, to: Pt): void {
      const trail = el('line', {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: c.danger,
        'stroke-width': 1.2,
        opacity: 0.3,
      });
      trailLayer.appendChild(trail);
      row.trails.push(trail);
    }

    function markToken(cell: TokenCell, hit: boolean): void {
      cell.markRect.setAttribute('fill', hit ? c.accent : c.danger);
      cell.markRect.setAttribute('opacity', '1');
      cell.markText.textContent = hit ? HIT_MARK : MISS_MARK;
      cell.markText.setAttribute('opacity', '1');
    }

    function setRowTone(index: number, tone: 'idle' | 'active'): void {
      const row = rows[index];
      if (!row) return;
      const active = tone === 'active';
      row.label.setAttribute('fill', active ? c.text : c.textMuted);
      for (const cell of row.tokens) {
        cell.rect.setAttribute('stroke', active ? c.text : c.border);
        cell.rect.setAttribute('stroke-width', active ? '1.6' : '1');
        cell.label.setAttribute('fill', active ? c.text : c.textMuted);
      }
      for (const trail of row.trails) trail.setAttribute('opacity', active ? '0.42' : '0.22');
    }

    function clearBlocks(): void {
      for (const block of blocks.values()) block.g.remove();
      blocks.clear();
    }

    function resetAll(): void {
      clearBlocks();
      for (const row of rows) {
        for (const trail of row.trails) trail.remove();
        row.trails.length = 0;
        for (const cell of row.tokens) {
          cell.markRect.setAttribute('opacity', '0');
          cell.markText.setAttribute('opacity', '0');
        }
      }
      for (let i = 0; i < rows.length; i += 1) setRowTone(i, 'idle');
      cacheLayer.setAttribute('opacity', '1');
      memLayer.setAttribute('opacity', '1');
      probe.setAttribute('opacity', '0');
      caption.textContent = '';
    }

    resetAll();

    // ── projector 가 부르는 표면 ─────────────────────────────────────────
    const instance: ViewInstance = {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      async beginStream(p: { stream: number }): Promise<void> {
        for (let i = 0; i < rows.length; i += 1) setRowTone(i, i === p.stream ? 'active' : 'idle');
        cacheLayer.setAttribute('opacity', '1');
        memLayer.setAttribute('opacity', '1');
        // 앞 열이 남긴 것은 칸에서 떨어져 나간다.
        await Promise.all([...blocks.keys()].map((slot) => evict(slot)));
        await wait(WAKE_MS);
      },

      async access(p: TemporalLocalityAccessView): Promise<void> {
        const row = rows[p.stream];
        const cell = row?.tokens[p.step];
        const slot = slots[p.slot];
        const box = memBoxes[p.line];
        if (!row || !cell || !slot || !box) return;

        const home: Pt = { x: cell.cx, y: cell.y + ROW_H + PROBE_R };
        placeProbe(home);
        probe.setAttribute('opacity', '1');

        if (p.hit) {
          const at: Pt = { x: slot.cx, y: SLOT_Y + SLOT_H / 2 };
          await moveProbe(home, at, DOWN_HIT_MS);
          await nudge(p.slot);
          // 아래층까지 갈 일이 없다 — 여기서 되돌아온다.
          await moveProbe(at, home, UP_HIT_MS);
        } else {
          const at: Pt = { x: box.cx, y: MEM_Y + MEM_H / 2 };
          await moveProbe(home, at, DOWN_MISS_MS);
          addTrail(row, { x: cell.cx, y: cell.y + ROW_H }, { x: box.cx, y: MEM_Y });
          if (p.evicted !== null) await evict(p.slot);
          await rise(p.line, p.slot, home);
        }

        probe.setAttribute('opacity', '0');
        markToken(cell, p.hit);
      },

      endStream(p: { stream: number }): void {
        setRowTone(p.stream, 'idle');
      },

      async verdict(): Promise<void> {
        for (let i = 0; i < rows.length; i += 1) setRowTone(i, 'active');
        clearBlocks();
        const trails = rows.flatMap((row) => row.trails);
        await tween(VERDICT_MS, (p) => {
          cacheLayer.setAttribute('opacity', String(lerp(1, 0.3, p)));
          memLayer.setAttribute('opacity', String(lerp(1, 0.45, p)));
          for (const trail of trails) {
            trail.setAttribute('stroke-width', String(lerp(1.2, 2.4, p)));
            trail.setAttribute('opacity', String(lerp(0.42, 0.75, p)));
          }
        });
      },

      rewind(): void {
        resetAll();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
