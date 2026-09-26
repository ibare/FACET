/**
 * layout-thrash-stage — 상자 열을 실제 인라인 흐름처럼 배치해 보여준다.
 *
 * 한 상자의 너비가 늘면(그 상자를 기준으로) 오른쪽에 이어지는 상자들이 실제로
 * x 좌표를 옮겨 밀려난다 — 장식으로 얹은 이동이 아니라, 상자 너비 목록을 다시
 * 배치해 다시 그린 것이다. 폭이 화면을 넘으면 다음 줄로 접힌다(실제 인라인 요소
 * 행이 그러듯).
 *
 * 상자 상태: pending(아직) → reading(읽는 중, 번갈아/읽기 모아서 전용) →
 * growing(쓰는 중 — 애니메이션) → done(이번 판에서 다 처리됨).
 *
 * 강제/프레임 레이아웃은 전체 캔버스에 짧은 표시등으로, 더러움/깨끗은 배지로 보인다.
 */
import type { CanvasView, Palette, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const CANVAS_W = 720;
const CANVAS_H = 410;
const MARGIN_X = 16;
const ROW_CAPACITY = CANVAS_W - 2 * MARGIN_X;
const SCALE = 0.5;
const BOX_H = 34;
const BOX_GAP = 6;
const ROW_GAP = 10;
const BOXES_TOP = 132;
const LINE_H = 16;
const CODE_TOP = 34;

type BoxState = 'pending' | 'reading' | 'growing' | 'done';

type Placed = { x: number; y: number; w: number };

/** 한 줄 인라인 흐름을 흉내내는 배치 — 폭이 넘치면 다음 줄로 접는다. */
function layoutBoxes(realWidths: number[]): Placed[] {
  const out: Placed[] = [];
  let x = 0;
  let row = 0;
  for (const real of realWidths) {
    const w = Math.max(6, real * SCALE);
    if (x > 0 && x + w > ROW_CAPACITY) {
      row += 1;
      x = 0;
    }
    out.push({ x: MARGIN_X + x, y: BOXES_TOP + row * (BOX_H + ROW_GAP), w });
    x += w + BOX_GAP;
  }
  return out;
}

function stateFill(state: BoxState, colors: Palette): string {
  if (state === 'growing') return colors.itemPivot;
  if (state === 'done') return colors.itemSorted;
  return colors.itemDefault;
}

function stateStroke(state: BoxState, colors: Palette): string {
  if (state === 'reading' || state === 'growing') return colors.primary;
  return colors.border;
}

function stateInk(state: BoxState, colors: Palette): string {
  if (state === 'growing') return colors.stateInk;
  if (state === 'done') return colors.textInverse;
  return colors.text;
}

/** 판마다 한 번씩 고르는 native 코드 — order 값에 따라 문자 그대로 다르다. 이 facet 의 자료다. */
type CodeLines = { rw: string[]; wr: string[]; batch: string[] };

/** phase 이름 → 그 order 코드에서 강조할 줄 번호(0-based). 없으면 강조하지 않는다. */
const HIGHLIGHT_LINE: Record<string, number> = {
  'rw-step': 2,
  'wr-step': 1,
  'batch-read': 0,
  'batch-write': 1,
};

export type LayoutThrashStageInstance = ViewInstance & {
  resetRound(order: number, widths: number[]): void;
  markReading(indices: number[]): void;
  growBox(boxIndex: number, from: number, to: number, durationMs: number): Promise<void>;
  growBoxes(from: number[], to: number[], durationMs: number): Promise<void>;
  flashLayout(kind: 'forced' | 'frame', durationMs: number): Promise<void>;
  highlightCode(phase: string | null): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function asStringLines(v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error('layout-thrash stage: code 줄 목록이 배열이 아니다');
  return v.map((s) => {
    if (typeof s !== 'string') throw new Error('layout-thrash stage: code 줄이 문자열이 아니다');
    return s;
  });
}

/** initialData.code 를 읽는다 — initialData 자체가 없으면(config: {} 전수 검사) 빈 코드로 둔다. */
function readCode(initialData: Record<string, unknown> | undefined): CodeLines {
  if (!initialData) return { rw: [], wr: [], batch: [] };
  const raw = initialData.code;
  if (typeof raw !== 'object' || raw === null) throw new Error('layout-thrash stage: initialData.code 가 없다');
  const c = raw as { rw?: unknown; wr?: unknown; batch?: unknown };
  return { rw: asStringLines(c.rw), wr: asStringLines(c.wr), batch: asStringLines(c.batch) };
}

export const layoutThrashStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }): LayoutThrashStageInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);

    const bg = el('rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(CANVAS_W));
    bg.setAttribute('height', String(CANVAS_H));
    bg.setAttribute('fill', colors.bg);
    svg.appendChild(bg);

    const caption = el('text');
    caption.setAttribute('x', String(MARGIN_X));
    caption.setAttribute('y', '18');
    caption.setAttribute('font-family', fonts.body);
    caption.setAttribute('font-size', fontSizes.md);
    caption.setAttribute('fill', colors.text);
    svg.appendChild(caption);

    // ── native 코드 블록 (order 에 따라 통째로 바뀐다. 한 줄마다 배경 rect 로 강조)
    const codeGroup = el('g');
    svg.appendChild(codeGroup);
    const codeBg = el('rect');
    codeBg.setAttribute('x', String(MARGIN_X - 4));
    codeBg.setAttribute('fill', colors.accent);
    codeBg.setAttribute('opacity', '0');
    codeGroup.appendChild(codeBg);
    const codeTexts: SVGTextElement[] = [];

    // ── 더러움/깨끗 배지
    const badge = el('text');
    badge.setAttribute('x', String(MARGIN_X));
    badge.setAttribute('y', String(CODE_TOP + 4 * LINE_H + 14));
    badge.setAttribute('font-family', fonts.body);
    badge.setAttribute('font-size', fontSizes.sm);
    svg.appendChild(badge);

    // ── 상자 열
    const boxGroup = el('g');
    svg.appendChild(boxGroup);

    // ── 강제/프레임 레이아웃 표시등 — 전체 캔버스를 짧게 덮는다.
    const flash = el('rect');
    flash.setAttribute('x', '0');
    flash.setAttribute('y', '0');
    flash.setAttribute('width', String(CANVAS_W));
    flash.setAttribute('height', String(CANVAS_H));
    flash.setAttribute('opacity', '0');
    flash.setAttribute('pointer-events', 'none');
    svg.appendChild(flash);

    const code: CodeLines = readCode(params.initialData);
    let currentOrder = 0;
    let currentWidths: number[] = [];
    let states: BoxState[] = [];
    let boxRects: SVGRectElement[] = [];
    let boxTexts: SVGTextElement[] = [];

    const pendingResolvers = new Set<() => void>();
    let destroyed = false;

    function codeFor(order: number): string[] {
      if (order === 0) return code.rw;
      if (order === 1) return code.wr;
      return code.batch;
    }

    function drawCode(): void {
      for (const tx of codeTexts) tx.remove();
      codeTexts.length = 0;
      const lines = codeFor(currentOrder);
      let widest = 0;
      lines.forEach((line, i) => {
        const tx = el('text');
        tx.setAttribute('x', String(MARGIN_X));
        tx.setAttribute('y', String(CODE_TOP + i * LINE_H));
        tx.setAttribute('font-family', fonts.mono);
        tx.setAttribute('font-size', fontSizes.xs);
        tx.setAttribute('fill', colors.text);
        tx.textContent = line;
        codeGroup.appendChild(tx);
        codeTexts.push(tx);
        widest = Math.max(widest, line.length);
      });
      codeBg.setAttribute('width', String(widest * 6 + 12));
      codeBg.setAttribute('height', String(LINE_H));
      codeBg.setAttribute('opacity', '0');
    }

    function highlightCode(phase: string | null): void {
      const lineNo = phase !== null ? HIGHLIGHT_LINE[phase] : undefined;
      if (lineNo === undefined) {
        codeBg.setAttribute('opacity', '0');
        return;
      }
      codeBg.setAttribute('y', String(CODE_TOP + lineNo * LINE_H - 12));
      codeBg.setAttribute('opacity', '0.25');
    }

    function setBadge(dirty: boolean): void {
      badge.textContent = dirty ? t('stage.dirty', 'dirty') : t('stage.clean', 'clean');
      badge.setAttribute('fill', dirty ? colors.itemComparing : colors.text);
    }

    function paintBox(i: number): void {
      const rect = boxRects[i];
      const text = boxTexts[i];
      if (!rect || !text) return;
      const state = states[i];
      rect.setAttribute('fill', stateFill(state, colors));
      rect.setAttribute('stroke', stateStroke(state, colors));
      rect.setAttribute('stroke-width', state === 'reading' || state === 'growing' ? '2' : '1');
      text.setAttribute('fill', stateInk(state, colors));
    }

    function applyPlacement(placed: Placed[]): void {
      for (let i = 0; i < placed.length; i += 1) {
        const p = placed[i];
        const rect = boxRects[i];
        const text = boxTexts[i];
        if (!rect || !text) continue;
        rect.setAttribute('x', String(p.x));
        rect.setAttribute('y', String(p.y));
        rect.setAttribute('width', String(p.w));
        rect.setAttribute('height', String(BOX_H));
        text.setAttribute('x', String(p.x + p.w / 2));
        text.setAttribute('y', String(p.y + BOX_H / 2 + 4));
        text.style.display = p.w >= 18 ? '' : 'none';
      }
    }

    function rebuildBoxes(widths: number[]): void {
      for (const r of boxRects) r.remove();
      for (const tx of boxTexts) tx.remove();
      boxRects = [];
      boxTexts = [];
      states = widths.map(() => 'pending');
      for (let i = 0; i < widths.length; i += 1) {
        const rect = el('rect');
        rect.setAttribute('rx', '3');
        boxGroup.appendChild(rect);
        boxRects.push(rect);
        const text = el('text');
        text.setAttribute('font-family', fonts.body);
        text.setAttribute('font-size', fontSizes.xs);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = String(i + 1);
        boxGroup.appendChild(text);
        boxTexts.push(text);
        paintBox(i);
      }
      applyPlacement(layoutBoxes(widths));
    }

    function resetRound(order: number, widths: number[]): void {
      currentOrder = order;
      currentWidths = widths.slice();
      drawCode();
      highlightCode(null);
      setBadge(false);
      flash.setAttribute('opacity', '0');
      rebuildBoxes(currentWidths);
      caption.textContent = t('stage.round', 'New round — {count} boxes', { count: widths.length });
    }

    function markReading(indices: number[]): void {
      for (const i of indices) {
        if (states[i - 1] !== undefined) {
          states[i - 1] = 'reading';
          paintBox(i - 1);
        }
      }
      caption.textContent =
        indices.length > 1
          ? t('stage.readAll', 'Reading all boxes (offsetWidth)')
          : t('stage.reading', 'Reading box {n} (offsetWidth)', { n: indices[0] ?? 0 });
    }

    function waitFrame(durationMs: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const start = performance.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          pendingResolvers.delete(finish);
          onFrame(1);
          resolve();
        };
        pendingResolvers.add(finish);
        function tick(now: number): void {
          if (done) return;
          const p = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }

    async function tweenWidths(newWidths: number[], durationMs: number, growing: number[]): Promise<void> {
      for (const i of growing) {
        if (states[i - 1] !== undefined) states[i - 1] = 'growing';
      }
      for (const i of growing) paintBox(i - 1);
      const from = layoutBoxes(currentWidths);
      const to = layoutBoxes(newWidths);
      await waitFrame(durationMs, (p) => {
        const placed: Placed[] = to.map((target, i) => {
          const start = from[i] ?? target;
          if (start.y !== target.y) {
            // 줄이 바뀌는 상자는 세로만 즉시 옮기고 가로만 부드럽게 잇는다.
            return { x: start.x + (target.x - start.x) * p, y: p >= 1 ? target.y : start.y, w: start.w + (target.w - start.w) * p };
          }
          return { x: start.x + (target.x - start.x) * p, y: target.y, w: start.w + (target.w - start.w) * p };
        });
        applyPlacement(placed);
      });
      currentWidths = newWidths.slice();
      for (const i of growing) {
        if (states[i - 1] !== undefined) states[i - 1] = 'done';
      }
      for (const i of growing) paintBox(i - 1);
    }

    async function growBox(boxIndex: number, from: number, to: number, durationMs: number): Promise<void> {
      // 쓰는 순간 더러워진다 — 애니메이션이 끝나기를 기다리지 않고 곧바로 배지를 올린다.
      setBadge(true);
      const next = currentWidths.slice();
      next[boxIndex - 1] = to;
      caption.textContent = t('stage.writing', 'Box {n} grows: {from}px → {to}px', { n: boxIndex, from, to });
      await tweenWidths(next, durationMs, [boxIndex]);
    }

    async function growBoxes(_from: number[], to: number[], durationMs: number): Promise<void> {
      setBadge(true);
      caption.textContent = t('stage.writeAll', 'All boxes grow by 10px at once');
      const indices = to.map((_, i) => i + 1);
      await tweenWidths(to.slice(), durationMs, indices);
    }

    async function flashLayout(kind: 'forced' | 'frame', durationMs: number): Promise<void> {
      const color = kind === 'forced' ? colors.danger : colors.primary;
      flash.setAttribute('fill', color);
      caption.textContent =
        kind === 'forced' ? t('stage.forced', 'Forced synchronous layout!') : t('stage.frame', 'Frame layout (once, deferred)');
      await waitFrame(durationMs, (p) => {
        const peak = p < 0.5 ? p * 2 : (1 - p) * 2;
        flash.setAttribute('opacity', String(Math.max(0, peak) * 0.28));
      });
      flash.setAttribute('opacity', '0');
      // 레이아웃을 돌고 나면(강제든 프레임이든) 깨끗해진다.
      setBadge(false);
    }

    return {
      destroy() {
        destroyed = true;
        for (const resolve of [...pendingResolvers]) resolve();
        pendingResolvers.clear();
      },
      resetRound,
      markReading,
      growBox,
      growBoxes,
      flashLayout,
      highlightCode,
    };
  },
};
