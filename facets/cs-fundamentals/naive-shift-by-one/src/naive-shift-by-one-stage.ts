/**
 * naive-shift-by-one stage — 텍스트 한 줄 아래에서 패턴 띠가 한 칸씩 밀린다.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 질문의 동사는 **"도로 물러난다"** 다. 그래서 화면에는 서로 반대 방향의 운동
 * 둘이 같은 가로축 위에 놓인다.
 *
 *   이음 띠   맞힌 글자만큼 왼쪽에서 오른쪽으로 차오르다가, 어긋나는 순간
 *             **0 으로 도로 줄어든다.** 여태 맞힌 것을 버리는 일 그 자체다.
 *   커서      견주는 자리를 따라 오른쪽으로 가다가, 어긋나면 패턴 맨 앞으로
 *             **되돌아온다.**
 *   패턴 띠   그렇게 다 버리고 나서 겨우 **한 칸** 오른쪽으로 미끄러진다.
 *
 * 네 칸이나 차오른 띠가 무너지고 띠는 한 칸만 가는 것 — 그 길이의 대비가 이
 * 조각이 보여야 할 전부다. 페이드가 아니라 폭과 자리가 실제로 변한다.
 *
 * 세로는 여기서 정하고 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 마운트한 뒤 바뀌지 않는다 (S-view). */
const CANVAS_H = 220;

/** 왼쪽에 'text' · 'pattern' 표식이 서는 자리. */
const LABEL_W = 70;
const SIDE_MIN = 26;
const CELL_MAX_W = 56;
const CELL_H = 46;
const CELL_GAP = 4;

const CURSOR_Y = 12;
const CURSOR_H = 11;
const TEXT_Y = 30;
const FOUND_Y = 79;
const FOUND_H = 3;
const SEAM_Y = 89;
const SEAM_H = 10;
const PAT_Y = 106;
const TICK_Y = 164;
const TICK_H = 6;
const CAPTION_Y = 198;

const SLIDE_MS = 300;
const CURSOR_MS = 170;
const SEAM_MS = 110;
const COLLAPSE_MS = 340;
const SETTLE_MS = 280;
const FRAME_MS = 16;

/**
 * 도형에 새겨진 표식 — 그 분야에서 원어 그대로 통용되는 말이라 키를 만들지
 * 않는다 (C10 의 표식 판정 1·2번).
 */
const MARK_TEXT = 'text';
const MARK_PATTERN = 'pattern';

type CellState = 'idle' | 'hit' | 'miss';

export type NaiveShiftByOneScene = {
  text: string;
  pattern: string;
};

/**
 * `initialData` 를 좁힌다. 좁히는 자리는 stage 의 mount 다 — projector 가 없어도
 * 반드시 불리는 유일한 경로라, 규칙이 두 벌이 되지 않게 여기 하나만 둔다 (S-piece).
 */
export function readNaiveShiftByOneScene(initialData: unknown): NaiveShiftByOneScene {
  const d = (typeof initialData === 'object' && initialData !== null ? initialData : {}) as Record<
    string,
    unknown
  >;
  return {
    text: typeof d.text === 'string' ? d.text : '',
    pattern: typeof d.pattern === 'string' ? d.pattern : '',
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const ease = (p: number): number => 1 - (1 - p) * (1 - p);

export const naiveShiftByOneStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 준 이 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const c = getColors(params.theme);
    const scene = readNaiveShiftByOneScene(params.initialData);
    const text = scene.text;
    const pattern = scene.pattern;
    const n = Math.max(1, text.length);
    const m = Math.max(1, pattern.length);
    const lastShift = Math.max(0, text.length - pattern.length);

    // 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - LABEL_W - SIDE_MIN) / n));
    const spanW = n * cellW;
    const originX = LABEL_W + Math.round((PIECE_CANVAS_W - LABEL_W - SIDE_MIN - spanW) / 2);
    const colCenter = (i: number): number => originX + i * cellW + cellW / 2;
    const shiftX = (s: number): number => originX + s * cellW;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const step = (): void => {
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(ease(p));
          if (p >= 1 || destroyed) {
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

    // ── 그리기 ────────────────────────────────────────────────────────────
    const tickRow = el('g', {});
    const ticks: SVGRectElement[] = [];
    for (let s = 0; s <= lastShift; s += 1) {
      const tick = el('rect', {
        x: shiftX(s) + CELL_GAP,
        y: TICK_Y,
        width: Math.max(2, cellW - CELL_GAP * 2),
        height: TICK_H,
        rx: TICK_H / 2,
        fill: c.border,
      });
      ticks.push(tick);
      tickRow.appendChild(tick);
    }
    canvas.appendChild(tickRow);

    const textRow = el('g', {});
    const textCells: SVGRectElement[] = [];
    const textGlyphs: SVGTextElement[] = [];
    for (let i = 0; i < text.length; i += 1) {
      const cell = el('rect', {
        x: originX + i * cellW + CELL_GAP / 2,
        y: TEXT_Y,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 5,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      const glyph = el('text', {
        x: colCenter(i),
        y: TEXT_Y + CELL_H / 2 + 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: c.text,
      });
      glyph.textContent = text[i] ?? '';
      textCells.push(cell);
      textGlyphs.push(glyph);
      textRow.appendChild(cell);
      textRow.appendChild(glyph);
    }
    canvas.appendChild(textRow);

    /** 찾아낸 자리에 남는 자국. 걸음이 지나가도 지우지 않는다. */
    const foundLayer = el('g', {});
    canvas.appendChild(foundLayer);

    // 패턴 띠 — 통째로 옮겨 다닌다. 이음 띠도 같이 움직여야 하므로 한 무리에 둔다.
    const strip = el('g', { transform: `translate(${shiftX(0)}, ${PAT_Y})` });
    const seam = el('rect', {
      x: 0,
      y: SEAM_Y - PAT_Y,
      width: 0,
      height: SEAM_H,
      rx: SEAM_H / 2,
      fill: c.itemPivot,
    });
    strip.appendChild(seam);
    const patCells: SVGRectElement[] = [];
    const patGlyphs: SVGTextElement[] = [];
    for (let j = 0; j < pattern.length; j += 1) {
      const cell = el('rect', {
        x: j * cellW + CELL_GAP / 2,
        y: 0,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 5,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      const glyph = el('text', {
        x: j * cellW + cellW / 2,
        y: CELL_H / 2 + 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: c.text,
      });
      glyph.textContent = pattern[j] ?? '';
      patCells.push(cell);
      patGlyphs.push(glyph);
      strip.appendChild(cell);
      strip.appendChild(glyph);
    }
    canvas.appendChild(strip);

    const cursor = el('g', { transform: `translate(${colCenter(0)}, ${CURSOR_Y})` });
    cursor.appendChild(
      el('path', {
        d: `M -7 0 L 7 0 L 0 ${CURSOR_H} Z`,
        fill: c.itemComparing,
      }),
    );
    canvas.appendChild(cursor);

    for (const [mark, y] of [
      [MARK_TEXT, TEXT_Y + CELL_H / 2 + 4],
      [MARK_PATTERN, PAT_Y + CELL_H / 2 + 4],
    ] as const) {
      const label = el('text', {
        x: originX - 12,
        y,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      label.textContent = mark;
      canvas.appendChild(label);
    }

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    canvas.appendChild(caption);

    // ── 상태 ──────────────────────────────────────────────────────────────
    let shift = 0;
    let cursorX = colCenter(0);
    let seamW = 0;

    function paintCell(cell: SVGRectElement, glyph: SVGTextElement, state: CellState): void {
      // 타일이 고정색이면 잉크도 고정색으로 간다 (design-tokens 의 stateInk 표).
      const fill = state === 'hit' ? c.itemPivot : state === 'miss' ? c.itemSwapping : c.itemDefault;
      cell.setAttribute('fill', fill);
      cell.setAttribute('stroke', state === 'idle' ? c.border : fill);
      glyph.setAttribute('fill', state === 'idle' ? c.text : c.stateInk);
    }

    function clearMarks(): void {
      for (let i = 0; i < textCells.length; i += 1) {
        paintCell(textCells[i]!, textGlyphs[i]!, 'idle');
      }
      for (let j = 0; j < patCells.length; j += 1) {
        paintCell(patCells[j]!, patGlyphs[j]!, 'idle');
      }
      seamW = 0;
      seam.setAttribute('width', '0');
    }

    function placeCursor(x: number): void {
      cursorX = x;
      cursor.setAttribute('transform', `translate(${x}, ${CURSOR_Y})`);
    }

    function placeStrip(x: number, dy = 0): void {
      strip.setAttribute('transform', `translate(${x}, ${PAT_Y + dy})`);
    }

    return {
      /** 자리 `next` 로 미끄러진다. 앞자리에서 켜 둔 표시는 여기서 거둔다. */
      async align(next: number): Promise<void> {
        const from = shiftX(shift);
        const to = shiftX(next);
        clearMarks();
        shift = next;
        for (let s = 0; s < ticks.length; s += 1) {
          ticks[s]!.setAttribute(
            'fill',
            s === next ? c.itemComparing : s < next ? c.textMuted : c.border,
          );
        }
        const front = colCenter(next);
        const fromCursor = cursorX;
        if (from === to && fromCursor === front) return;
        await tween(SLIDE_MS, (p) => {
          placeStrip(from + (to - from) * p);
          placeCursor(fromCursor + (front - fromCursor) * p);
        });
      },

      /** 한 글자를 견준다. 커서가 그 칸으로 가고, 맞았으면 이음 띠가 그만큼 찬다. */
      async compare(offset: number, hit: boolean): Promise<void> {
        const target = colCenter(shift + offset);
        const from = cursorX;
        await tween(CURSOR_MS, (p) => placeCursor(from + (target - from) * p));
        const i = shift + offset;
        if (textCells[i] && textGlyphs[i]) paintCell(textCells[i]!, textGlyphs[i]!, hit ? 'hit' : 'miss');
        if (patCells[offset] && patGlyphs[offset]) {
          paintCell(patCells[offset]!, patGlyphs[offset]!, hit ? 'hit' : 'miss');
        }
        if (!hit) return;
        const fromW = seamW;
        const toW = (offset + 1) * cellW;
        seamW = toW;
        await tween(SEAM_MS, (p) => {
          seam.setAttribute('width', String(Math.max(0, fromW + (toW - fromW) * p)));
        });
      },

      /**
       * 도로 물러난다 — 이음 띠가 0 으로 줄고 커서가 패턴 맨 앞으로 돌아온다.
       * 어긋난 칸은 그 까닭이 보이도록 물러나는 동안 켜 둔 채로 둔다.
       */
      async retreat(matched: number): Promise<void> {
        const fromW = Math.max(seamW, matched * cellW);
        const fromCursor = cursorX;
        const front = colCenter(shift);
        await tween(COLLAPSE_MS, (p) => {
          seam.setAttribute('width', String(Math.max(0, fromW * (1 - p))));
          placeCursor(fromCursor + (front - fromCursor) * p);
        });
        seamW = 0;
        clearMarks();
      },

      /** 다 맞았다. 자리를 잡는 느낌으로 한 번 내려앉고, 그 자리에 자국을 남긴다. */
      async found(): Promise<void> {
        foundLayer.appendChild(
          el('rect', {
            x: shiftX(shift) + CELL_GAP / 2,
            y: FOUND_Y,
            width: m * cellW - CELL_GAP,
            height: FOUND_H,
            rx: FOUND_H / 2,
            fill: c.itemPivot,
          }),
        );
        const x = shiftX(shift);
        await tween(SETTLE_MS, (p) => placeStrip(x, Math.sin(p * Math.PI) * 5));
        placeStrip(x);
      },

      /** 더 밀 자리가 없다. 견줄 것이 없으니 커서를 거둔다. */
      finish(): void {
        cursor.setAttribute('opacity', '0');
      },

      setCaption(line: string): void {
        caption.textContent = line;
      },

      /** 처음 자리로. 되감기와 러너의 reset 이 함께 쓴다. */
      reset(): void {
        clearMarks();
        foundLayer.textContent = '';
        shift = 0;
        placeStrip(shiftX(0));
        placeCursor(colCenter(0));
        cursor.setAttribute('opacity', '1');
        caption.textContent = '';
        for (const tick of ticks) tick.setAttribute('fill', c.border);
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
