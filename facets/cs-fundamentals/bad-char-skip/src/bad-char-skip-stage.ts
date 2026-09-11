/**
 * bad-char-skip-stage — 패턴이 텍스트 위를 뛰어넘는 그림.
 *
 * 동사는 "뛰어넘는다" 다. 그래서 이 화면의 주인공은 **자리를 옮기는 덩어리**다.
 *   · 텍스트는 한 줄의 띠로 깔리고 움직이지 않는다.
 *   · 패턴은 그 아래를 미끄러지는 한 덩어리다. 미는 거리가 걸음마다 다르다.
 *   · 어긋난 글자는 띠에서 **떠올라 표의 칸으로 날아간다.** 그 칸이 가진 수가
 *     곧 뛸 거리라서, 표와 점프가 한 몸짓으로 이어진다.
 *   · 민 거리는 패턴이 지나간 자취를 따라 호(arc)로 자란다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 가로는 러너가 `PIECE_CANVAS_W` 로
 * 정하고, 세로는 이 그림이 정하므로 여기 상수로 둔다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg' as const;

/** 세로는 내용이 정한다 — 표 · 텍스트 띠 · 패턴 · 점프 호 · 캡션. */
const CANVAS_H = 262;

// 칸 크기는 캔버스 폭에서 역산하고, 상수로는 상한만 둔다 (S-piece "그 폭을 채운다").
const CELL_MAX_W = 30;
const CELL_SIDE_MIN = 18;
const CELL_H = 32;

const SLOT_Y = 26;
const SLOT_H = 30;
const SLOT_GAP = 10;
const SLOT_SIDE_MIN = 20;
const SLOT_MAX_W = 92;

const TABLE_LABEL_BASE = 18;
const IDX_BASE = 80;
const TEXT_Y = 86;
const PAT_Y = 136;
const ARC_Y = 176;
const ARC_DEPTH = 24;
const CAP_BASE = 220;
const CAP_LINE_H = 18;
const CAP_MAX_UNITS = 84;
const CAP_MAX_LINES = 3;

const FRAME_MS = 16;
const SCAN_STEP_MS = 120;
const LIFT_MS = 380;
const HOLD_MS = 160;
const SLIDE_MS = 440;
const BOUNCE_MS = 260;
const BOUNCE_DEPTH = 7;

/** 빈칸도 한 글자라는 것을 보이는 표식 (C10 — 도형에 각인된 글자). */
const BLANK_MARK = '·';
/** 표에 없는 글자가 받는 값. 수식 표기라 번역하지 않는다 (C10). */
const ABSENT_MARK = '−1';

type Tone = 'idle' | 'match' | 'miss';

type Scene = { text: string; pattern: string };

type Slot = { ch: string; last: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

/**
 * `initialData` 를 좁히는 것은 mount 다 (S-piece). projector 는 이것을 다시
 * 좁히지 않는다 — 걸음마다 오는 payload 만 좁혀 넘긴다.
 */
function readScene(initial: Record<string, unknown> | undefined): Scene {
  const raw = initial ?? {};
  return {
    text: typeof raw.text === 'string' ? raw.text : '',
    pattern: typeof raw.pattern === 'string' ? raw.pattern : '',
  };
}

/** 패턴의 글자별 마지막 자리. 표의 칸 순서는 패턴에 처음 나온 순서다. */
function buildSlots(pattern: string): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    const seen = slots.find((s) => s.ch === ch);
    if (seen) seen.last = i;
    else slots.push({ ch, last: i });
  }
  return slots;
}

/** 넓은 글자(한글·가나·한자)는 두 칸으로 센다. 줄바꿈 폭 어림에만 쓴다. */
function unitsOf(s: string): number {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
  return n;
}

function wrapText(content: string, budget: number): string[] {
  const lines: string[] = [];
  let line = '';
  const push = (): void => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of content.split(' ')) {
    // 띄어쓰기가 없는 언어는 한 낱말이 통째로 길다 — 칸 수로 끊는다.
    if (unitsOf(word) > budget) {
      push();
      let piece = '';
      for (const ch of word) {
        if (unitsOf(piece + ch) > budget) {
          lines.push(piece);
          piece = ch;
        } else piece += ch;
      }
      line = piece;
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (line && unitsOf(next) > budget) {
      push();
      line = word;
    } else line = next;
  }
  push();
  return lines;
}

export const badCharSkipStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';

    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const { text, pattern } = readScene(params.initialData);

    // ── 걸어 둔 것과 기다리는 것 (S-piece)
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    async function tween(ms: number, apply: (p: number) => void): Promise<void> {
      const started = Date.now();
      for (;;) {
        if (destroyed) {
          apply(1);
          return;
        }
        const raw = Math.min(1, (Date.now() - started) / ms);
        apply(ease(raw));
        if (raw >= 1) return;
        await wait(FRAME_MS);
      }
    }

    // ── 자리 셈 (캔버스에서 역산)
    const cellW = Math.min(
      CELL_MAX_W,
      Math.floor((PIECE_CANVAS_W - CELL_SIDE_MIN * 2) / Math.max(1, text.length)),
    );
    const originX = Math.round((PIECE_CANVAS_W - text.length * cellW) / 2);
    const cellX = (i: number): number => originX + i * cellW;
    const glyphOf = (ch: string): string => (ch === ' ' ? BLANK_MARK : ch);

    const slots = buildSlots(pattern);
    const absentIdx = slots.length; // 표에 없는 글자가 가는 칸
    const slotCount = slots.length + 1;
    const slotW = Math.min(
      SLOT_MAX_W,
      Math.floor(
        (PIECE_CANVAS_W - SLOT_SIDE_MIN * 2 - SLOT_GAP * (slotCount - 1)) / slotCount,
      ),
    );
    const slotRowX = Math.round(
      (PIECE_CANVAS_W - (slotCount * slotW + (slotCount - 1) * SLOT_GAP)) / 2,
    );
    const slotX = (i: number): number => slotRowX + i * (slotW + SLOT_GAP);
    /** 칸 안에서 글자가 서는 자리 — 날아온 글자도 같은 자리에 내려앉는다. */
    const slotCharX = (i: number): number => slotX(i) + slotW * 0.3;

    const gTable = el('g', {});
    const gText = el('g', {});
    const gJump = el('g', { opacity: 0 });
    const gPattern = el('g', { transform: 'translate(0 0)' });
    const gCursor = el('g', { opacity: 0 });
    const gToken = el('g', { opacity: 0 });
    const gCaption = el('g', {});
    for (const g of [gTable, gText, gJump, gPattern, gCursor, gToken, gCaption]) {
      svg.appendChild(g);
    }

    // ── 표 — 글자마다 "패턴 안에서 마지막으로 선 자리"
    const tableLabel = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: TABLE_LABEL_BASE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    tableLabel.textContent = tr('label.table', 'last position in the pattern');
    gTable.appendChild(tableLabel);

    const slotRects: SVGRectElement[] = [];
    const slotValues: SVGTextElement[] = [];
    for (let i = 0; i < slotCount; i += 1) {
      const absent = i === absentIdx;
      const rect = el('rect', {
        x: slotX(i),
        y: SLOT_Y,
        width: slotW,
        height: SLOT_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: absent ? c.textMuted : c.border,
        'stroke-width': 1,
        'stroke-dasharray': absent ? '4 3' : 'none',
      });
      gTable.appendChild(rect);
      slotRects.push(rect);

      if (!absent) {
        const ch = el('text', {
          x: slotCharX(i),
          y: SLOT_Y + SLOT_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        ch.textContent = glyphOf(slots[i].ch);
        gTable.appendChild(ch);
      }

      const value = el('text', {
        x: slotX(i) + slotW * 0.74,
        y: SLOT_Y + SLOT_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: absent ? c.textMuted : c.text,
      });
      value.textContent = absent ? ABSENT_MARK : String(slots[i].last);
      gTable.appendChild(value);
      slotValues.push(value);
    }

    function litSlot(index: number): void {
      for (let i = 0; i < slotCount; i += 1) {
        const on = i === index;
        const absent = i === absentIdx;
        slotRects[i].setAttribute(
          'stroke',
          on ? c.itemActive : absent ? c.textMuted : c.border,
        );
        slotRects[i].setAttribute('stroke-width', on ? '2.5' : '1');
        slotValues[i].setAttribute(
          'fill',
          on ? c.itemActive : absent ? c.textMuted : c.text,
        );
      }
    }

    // ── 텍스트 띠 — 움직이지 않는다
    const textRects: SVGRectElement[] = [];
    const textGlyphs: SVGTextElement[] = [];
    for (let i = 0; i < text.length; i += 1) {
      const idx = el('text', {
        x: cellX(i) + (cellW - 2) / 2,
        y: IDX_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      idx.textContent = String(i);
      gText.appendChild(idx);

      const rect = el('rect', {
        x: cellX(i),
        y: TEXT_Y,
        width: cellW - 2,
        height: CELL_H,
        rx: 4,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1,
      });
      gText.appendChild(rect);
      textRects.push(rect);

      const glyph = el('text', {
        x: cellX(i) + (cellW - 2) / 2,
        y: TEXT_Y + CELL_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      glyph.textContent = glyphOf(text[i]);
      gText.appendChild(glyph);
      textGlyphs.push(glyph);
    }

    // ── 패턴 — 한 덩어리로 미끄러진다
    const patFrame = el('rect', {
      x: cellX(0) - 5,
      y: PAT_Y - 5,
      width: pattern.length * cellW + 8,
      height: CELL_H + 10,
      rx: 8,
      fill: 'none',
      stroke: c.text,
      'stroke-width': 1.5,
    });
    gPattern.appendChild(patFrame);

    const patRects: SVGRectElement[] = [];
    const patGlyphs: SVGTextElement[] = [];
    for (let i = 0; i < pattern.length; i += 1) {
      const rect = el('rect', {
        x: cellX(i),
        y: PAT_Y,
        width: cellW - 2,
        height: CELL_H,
        rx: 4,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      gPattern.appendChild(rect);
      patRects.push(rect);

      const glyph = el('text', {
        x: cellX(i) + (cellW - 2) / 2,
        y: PAT_Y + CELL_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      glyph.textContent = glyphOf(pattern[i]);
      gPattern.appendChild(glyph);
      patGlyphs.push(glyph);
    }

    // ── 견주는 자리를 잇는 커서
    gCursor.appendChild(
      el('line', {
        x1: 0,
        y1: TEXT_Y + CELL_H + 1,
        x2: 0,
        y2: PAT_Y - 1,
        stroke: c.itemActive,
        'stroke-width': 2,
      }),
    );
    gCursor.appendChild(
      el('circle', {
        cx: 0,
        cy: (TEXT_Y + CELL_H + PAT_Y) / 2,
        r: 3.5,
        fill: c.itemActive,
      }),
    );
    let cursorX = 0;

    // ── 떠오르는 글자 — 띠에서 표로 날아간다
    const tokenRect = el('rect', {
      x: 0,
      y: 0,
      width: cellW - 2,
      height: CELL_H,
      rx: 4,
      fill: c.itemSwapping,
      stroke: c.itemSwapping,
      'stroke-width': 1,
    });
    const tokenGlyph = el('text', {
      x: (cellW - 2) / 2,
      y: CELL_H / 2 + 5,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: c.stateInk,
    });
    gToken.appendChild(tokenRect);
    gToken.appendChild(tokenGlyph);

    // ── 점프 호 — 민 거리가 그대로 길이다
    const jumpPath = el('path', {
      d: '',
      fill: 'none',
      stroke: c.itemActive,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    const jumpHead = el('circle', { cx: 0, cy: ARC_Y, r: 3.5, fill: c.itemActive });
    const jumpLabel = el('text', {
      x: 0,
      y: ARC_Y + ARC_DEPTH * 0.62,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: c.itemActive,
    });
    gJump.appendChild(jumpPath);
    gJump.appendChild(jumpHead);
    gJump.appendChild(jumpLabel);

    function drawJump(x1: number, x2: number): void {
      const mid = (x1 + x2) / 2;
      jumpPath.setAttribute('d', `M ${x1} ${ARC_Y} Q ${mid} ${ARC_Y + ARC_DEPTH} ${x2} ${ARC_Y}`);
      jumpHead.setAttribute('cx', String(x2));
      jumpLabel.setAttribute('x', String(mid));
    }

    // ── 캡션
    function setCaption(content: string): void {
      gCaption.textContent = '';
      if (!content) return;
      const lines = wrapText(content, CAP_MAX_UNITS).slice(0, CAP_MAX_LINES);
      for (let i = 0; i < lines.length; i += 1) {
        const node = el('text', {
          x: PIECE_CANVAS_W / 2,
          y: CAP_BASE + i * CAP_LINE_H,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        node.textContent = lines[i];
        gCaption.appendChild(node);
      }
    }

    // ── 칠하기
    function paint(
      rect: SVGRectElement,
      glyph: SVGTextElement,
      tone: Tone,
      base: string,
    ): void {
      if (tone === 'match') {
        rect.setAttribute('fill', c.itemPivot);
        rect.setAttribute('stroke', c.itemPivot);
        glyph.setAttribute('fill', c.stateInk);
        return;
      }
      if (tone === 'miss') {
        rect.setAttribute('fill', c.itemSwapping);
        rect.setAttribute('stroke', c.itemSwapping);
        glyph.setAttribute('fill', c.stateInk);
        return;
      }
      rect.setAttribute('fill', base);
      rect.setAttribute('stroke', c.border);
      glyph.setAttribute('fill', c.text);
    }

    function paintPair(at: number, j: number, tone: Tone): void {
      const ti = at + j;
      if (ti >= 0 && ti < textRects.length) {
        paint(textRects[ti], textGlyphs[ti], tone, c.itemDefault);
      }
      if (j >= 0 && j < patRects.length) {
        paint(patRects[j], patGlyphs[j], tone, c.bgSubtle);
      }
    }

    function clearMarks(): void {
      for (let i = 0; i < textRects.length; i += 1) {
        paint(textRects[i], textGlyphs[i], 'idle', c.itemDefault);
      }
      for (let i = 0; i < patRects.length; i += 1) {
        paint(patRects[i], patGlyphs[i], 'idle', c.bgSubtle);
      }
      gCursor.setAttribute('opacity', '0');
      gToken.setAttribute('opacity', '0');
      gJump.setAttribute('opacity', '0');
      litSlot(-1);
    }

    // ── 움직임
    let lastMissAt: number | null = null;

    function placeCursor(col: number): void {
      cursorX = cellX(col) + (cellW - 2) / 2;
      gCursor.setAttribute('transform', `translate(${cursorX} 0)`);
      gCursor.setAttribute('opacity', '1');
    }

    async function moveCursor(col: number): Promise<void> {
      const from = cursorX;
      const to = cellX(col) + (cellW - 2) / 2;
      await tween(SCAN_STEP_MS, (p) => {
        cursorX = from + (to - from) * p;
        gCursor.setAttribute('transform', `translate(${cursorX} 0)`);
      });
    }

    async function liftToken(cellIndex: number, slotIndex: number): Promise<void> {
      tokenGlyph.textContent = glyphOf(text[cellIndex] ?? '');
      const x0 = cellX(cellIndex);
      const y0 = TEXT_Y;
      const x1 = slotCharX(slotIndex) - (cellW - 2) / 2;
      const y1 = SLOT_Y + (SLOT_H - CELL_H) / 2;
      gToken.setAttribute('transform', `translate(${x0} ${y0})`);
      gToken.setAttribute('opacity', '1');
      await tween(LIFT_MS, (p) => {
        gToken.setAttribute(
          'transform',
          `translate(${x0 + (x1 - x0) * p} ${y0 + (y1 - y0) * p})`,
        );
      });
    }

    async function slide(from: number, to: number): Promise<void> {
      const x1 = cellX(from);
      const x2 = cellX(to);
      jumpLabel.textContent = String(to - from);
      drawJump(x1, x1);
      gJump.setAttribute('opacity', '1');
      await tween(SLIDE_MS, (p) => {
        const x = x1 + (x2 - x1) * p;
        gPattern.setAttribute('transform', `translate(${x - cellX(0)} 0)`);
        drawJump(x1, x);
      });
    }

    // ── projector 가 부르는 표면
    async function scan(p: {
      at: number;
      matched: number;
      mismatchAt: number | null;
    }): Promise<void> {
      clearMarks();
      placeCursor(p.at + pattern.length);
      for (let k = 0; k < p.matched; k += 1) {
        const j = pattern.length - 1 - k;
        await moveCursor(p.at + j);
        if (destroyed) return;
        paintPair(p.at, j, 'match');
      }
      if (p.mismatchAt === null) {
        lastMissAt = null;
        return;
      }
      const j = pattern.length - 1 - p.matched;
      await moveCursor(p.at + j);
      if (destroyed) return;
      paintPair(p.at, j, 'miss');
      lastMissAt = p.mismatchAt;
    }

    async function skip(p: {
      from: number;
      to: number;
      lastIndex: number;
    }): Promise<void> {
      const missAt = lastMissAt ?? p.from + (p.to - p.from) + p.lastIndex;
      const ch = text[missAt] ?? '';
      const known = slots.findIndex((s) => s.ch === ch);
      const slotIndex = known >= 0 ? known : absentIdx;

      await liftToken(missAt, slotIndex);
      if (destroyed) return;
      litSlot(slotIndex);
      await wait(HOLD_MS);
      if (destroyed) return;
      await slide(p.from, p.to);
      lastMissAt = null;
    }

    async function found(p: { at: number }): Promise<void> {
      gCursor.setAttribute('opacity', '0');
      for (let j = 0; j < pattern.length; j += 1) paintPair(p.at, j, 'match');
      const dx = cellX(p.at) - cellX(0);
      await tween(BOUNCE_MS, (t) => {
        const dy = Math.sin(t * Math.PI) * BOUNCE_DEPTH;
        gPattern.setAttribute('transform', `translate(${dx} ${dy})`);
      });
      gPattern.setAttribute('transform', `translate(${dx} 0)`);
    }

    function reset(): void {
      clearMarks();
      lastMissAt = null;
      gPattern.setAttribute('transform', 'translate(0 0)');
      setCaption('');
    }

    clearMarks();

    return {
      scan,
      skip,
      found,
      reset,
      setCaption,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
