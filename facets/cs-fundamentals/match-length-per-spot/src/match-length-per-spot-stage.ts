/**
 * match-length-per-spot-stage — 자리마다의 겹침 길이를 그리는 stage view.
 *
 * 동사는 **비춘다** 다. 구간 안의 자리는 왼쪽 거울 자리에서 답을 받아 오는데,
 * 그 일이 화면에서 실제로 일어나야 한다 — 값 조각이 거울 칸에서 떠올라 활을
 * 그리며 오른쪽 자리로 내려앉는다. 구간 밖에서는 두 커서가 나란히 오른쪽으로
 * 걸으며 글자를 견주고, 구간과 오른쪽 끝 표시는 오른쪽으로만 미끄러진다.
 *
 * 가로는 러너가 PIECE_CANVAS_W 로 정하므로 적지 않고, 세로는 그림이 정하는
 * 값이라 여기 상수로 둔다 (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로 배치. 위에서 아래로 활 · 밴드 · 글자칸 · 커서 · 값칸 · 자리번호 · 캡션.
const CANVAS_H = 268;
const LABEL_Y = 52;
const BAND_Y = 60;
const BAND_H = 10;
const CELLS_Y = 80;
const CELL_H = 46;
const CURSOR_Y = CELLS_Y + CELL_H + 6;
const CURSOR_H = 12;
const VALUE_Y = 152;
const VALUE_H = 32;
const INDEX_Y = 200;
const CAPTION_Y = 228;
const CAPTION_LINE_H = 19;

// ── 가로. 상수는 상한만 두고 실제 크기는 캔버스에서 역산한다.
const CELL_MAX_W = 64;
const SIDE_MIN = 26;
const VALUE_INSET = 7;

// ── 걸음 안의 시간. 이 뒤에 stepMs 만큼 더 쉰다.
const FRAME_MS = 16;
const STEP_MOVE_MS = 170;
const HIT_FLASH_MS = 90;
const MISS_FLASH_MS = 280;
const WRITE_FLASH_MS = 150;
const BORROW_LIFT_MS = 120;
const BORROW_FLY_MS = 430;
const WINDOW_MOVE_MS = 360;
const SWEEP_MS = 460;
const BOUNCE_MS = 110;

/** 빌려 오는 길의 제어점 높이. 곡선 꼭대기는 밴드 위쪽에 걸린다. */
const ARC_CTRL_Y = -100;

const CAPTION_MAX_CHARS = 72;

type Scene = { text: string };

/** initialData 는 오픈 타입이라 여기서 한 번만 좁힌다 (C9). */
function readScene(raw: Record<string, unknown> | undefined): Scene {
  const text = typeof raw?.text === 'string' ? raw.text : '';
  return { text };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 한 줄이 넘치면 빈칸에서 두 줄로 나눈다. 빈칸이 없는 문자는 한 줄로 둔다. */
function wrapCaption(text: string): string[] {
  if (text.length <= CAPTION_MAX_CHARS) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let head = '';
  let i = 0;
  while (i < words.length) {
    const next = head === '' ? words[i] : `${head} ${words[i]}`;
    if (head !== '' && next.length > CAPTION_MAX_CHARS) break;
    head = next;
    i += 1;
  }
  const tail = words.slice(i).join(' ');
  return tail === '' ? [head] : [head, tail];
}

type CellParts = { rect: SVGRectElement; glyph: SVGTextElement };
type ValueParts = { group: SVGGElement; rect: SVGRectElement; glyph: SVGTextElement };

export const matchLengthPerSpotStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    const text = scene.text;
    const n = text.length;

    const cellW = n > 0
      ? Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / n))
      : CELL_MAX_W;
    const originX = Math.round((PIECE_CANVAS_W - n * cellW) / 2);
    const cellX = (i: number): number => originX + i * cellW;
    const cellCenter = (i: number): number => cellX(i) + cellW / 2;
    const valueCenterY = VALUE_Y + VALUE_H / 2;

    // ── 걸어 둔 것과 기다리는 것. destroy 에서 한꺼번에 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    async function tween(ms: number, apply: (t: number) => void): Promise<void> {
      const steps = Math.max(1, Math.round(ms / FRAME_MS));
      for (let s = 1; s <= steps; s += 1) {
        await wait(FRAME_MS);
        if (destroyed) {
          apply(1);
          return;
        }
        apply(easeInOut(s / steps));
      }
    }

    // ── 겹 구성. 활 → 밴드 → 칸 → 커서 → 값 → 글 순으로 쌓는다.
    const gBands = el('g', {});
    const gCells = el('g', {});
    const gSweep = el('g', {});
    const gGuide = el('g', {});
    const gCursors = el('g', {});
    const gValues = el('g', {});
    const gChip = el('g', {});
    const gCaption = el('g', {});
    svg.appendChild(gBands);
    svg.appendChild(gCells);
    svg.appendChild(gSweep);
    svg.appendChild(gValues);
    svg.appendChild(gCursors);
    svg.appendChild(gGuide);
    svg.appendChild(gChip);
    svg.appendChild(gCaption);

    // 거울 밴드 — 맨 앞에서 구간과 같은 길이만큼.
    const mirrorBand = el('rect', {
      x: originX, y: BAND_Y, width: 0, height: BAND_H, rx: 4,
      fill: c.auxCursor, opacity: 0,
    });
    const mirrorLabel = el('text', {
      x: originX, y: LABEL_Y, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted, opacity: 0,
    });
    mirrorLabel.textContent = tr('label.mirror', 'mirror');

    // 구간 밴드 — 지금까지 가장 오른쪽까지 닿은 겹침.
    const windowBand = el('rect', {
      x: originX, y: BAND_Y, width: 0, height: BAND_H, rx: 4,
      fill: c.accent, opacity: 0,
    });

    // 오른쪽 끝 표시. 오른쪽으로만 움직인다.
    const edgeLine = el('line', {
      x1: originX, y1: BAND_Y - 6, x2: originX, y2: VALUE_Y + VALUE_H + 6,
      stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0,
    });
    const edgeLabel = el('text', {
      x: originX, y: LABEL_Y, 'text-anchor': 'middle',
      'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text, opacity: 0,
    });
    edgeLabel.textContent = 'r';

    gBands.appendChild(mirrorBand);
    gBands.appendChild(windowBand);
    gBands.appendChild(edgeLine);
    gBands.appendChild(mirrorLabel);
    gBands.appendChild(edgeLabel);

    // 글자 칸 · 값 칸 · 자리 번호.
    const cells: CellParts[] = [];
    const boxes: ValueParts[] = [];
    for (let i = 0; i < n; i += 1) {
      const rect = el('rect', {
        x: cellX(i) + 1, y: CELLS_Y, width: cellW - 2, height: CELL_H, rx: 5,
        fill: c.itemDefault, stroke: c.border, 'stroke-width': 1,
      });
      const glyph = el('text', {
        x: cellCenter(i), y: CELLS_Y + CELL_H / 2 + 6, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text,
      });
      glyph.textContent = text[i] ?? '';
      gCells.appendChild(rect);
      gCells.appendChild(glyph);
      cells.push({ rect, glyph });

      const group = el('g', {});
      const boxRect = el('rect', {
        x: cellX(i) + VALUE_INSET, y: VALUE_Y,
        width: cellW - VALUE_INSET * 2, height: VALUE_H, rx: 5,
        fill: 'none', stroke: c.border, 'stroke-width': 1, 'stroke-dasharray': '3 3',
      });
      const boxGlyph = el('text', {
        x: cellCenter(i), y: valueCenterY + 5, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text,
      });
      group.appendChild(boxRect);
      group.appendChild(boxGlyph);
      gValues.appendChild(group);
      boxes.push({ group, rect: boxRect, glyph: boxGlyph });

      const tick = el('text', {
        x: cellCenter(i), y: INDEX_Y, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      tick.textContent = String(i);
      gValues.appendChild(tick);
    }

    // 견주는 커서 둘. 왼쪽(맨 앞) 것은 속이 비고, 오른쪽(지금 자리) 것은 찼다.
    const cursorPath = `M -7 ${CURSOR_H} L 7 ${CURSOR_H} L 0 0 Z`;
    const frontCursor = el('path', {
      d: cursorPath, fill: 'none', stroke: c.auxCursor, 'stroke-width': 1.5, opacity: 0,
      transform: `translate(${originX}, ${CURSOR_Y})`,
    });
    const spotCursor = el('path', {
      d: cursorPath, fill: c.text, opacity: 0,
      transform: `translate(${originX}, ${CURSOR_Y})`,
    });
    gCursors.appendChild(frontCursor);
    gCursors.appendChild(spotCursor);

    const captionLines: SVGTextElement[] = [0, 1].map((line) => {
      const node = el('text', {
        x: PIECE_CANVAS_W / 2, y: CAPTION_Y + line * CAPTION_LINE_H,
        'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': fontSizes.md, fill: c.textMuted,
      });
      gCaption.appendChild(node);
      return node;
    });

    // ── 상태.
    let win: { left: number; right: number } | null = null;
    const borrowed: boolean[] = new Array<boolean>(n).fill(false);

    function regionFill(i: number): string {
      if (!win) return c.itemDefault;
      if (i >= win.left && i <= win.right) return c.subtreeShadeRight;
      if (i < win.right - win.left + 1) return c.subtreeShadeLeft;
      return c.itemDefault;
    }

    function paintRegions(): void {
      for (let i = 0; i < n; i += 1) {
        cells[i]!.rect.setAttribute('fill', regionFill(i));
        cells[i]!.glyph.setAttribute('fill', c.text);
      }
    }

    function paintBands(leftEdge: number, rightEdge: number, span: number): void {
      const visible = span > 0 ? 1 : 0;
      windowBand.setAttribute('x', String(leftEdge));
      windowBand.setAttribute('width', String(Math.max(0, rightEdge - leftEdge)));
      windowBand.setAttribute('opacity', String(visible));
      mirrorBand.setAttribute('x', String(originX));
      mirrorBand.setAttribute('width', String(Math.max(0, span)));
      mirrorBand.setAttribute('opacity', String(visible * 0.9));
      mirrorLabel.setAttribute('x', String(originX + span / 2));
      mirrorLabel.setAttribute('opacity', String(span > cellW ? 1 : 0));
      edgeLine.setAttribute('x1', String(rightEdge));
      edgeLine.setAttribute('x2', String(rightEdge));
      edgeLine.setAttribute('opacity', String(visible));
      edgeLabel.setAttribute('x', String(rightEdge));
      edgeLabel.setAttribute('opacity', String(visible));
    }

    function clearValue(i: number): void {
      borrowed[i] = false;
      const box = boxes[i]!;
      box.group.setAttribute('transform', 'translate(0, 0)');
      box.rect.setAttribute('fill', 'none');
      box.rect.setAttribute('stroke', c.border);
      box.rect.setAttribute('stroke-dasharray', '3 3');
      box.glyph.textContent = '';
    }

    function settleValue(i: number): void {
      const box = boxes[i]!;
      box.rect.removeAttribute('stroke-dasharray');
      if (borrowed[i]) {
        box.rect.setAttribute('fill', c.accent);
        box.rect.setAttribute('stroke', c.accent);
        box.glyph.setAttribute('fill', c.stateInk);
      } else {
        box.rect.setAttribute('fill', c.bgSubtle);
        box.rect.setAttribute('stroke', c.border);
        box.glyph.setAttribute('fill', c.text);
      }
    }

    async function writeValue(i: number, value: number, fromMirror: boolean): Promise<void> {
      borrowed[i] = fromMirror;
      const box = boxes[i]!;
      box.glyph.textContent = String(value);
      box.rect.removeAttribute('stroke-dasharray');
      box.rect.setAttribute('fill', c.accent);
      box.rect.setAttribute('stroke', c.accent);
      box.glyph.setAttribute('fill', c.stateInk);
      await wait(WRITE_FLASH_MS);
      settleValue(i);
    }

    function placeCursors(frontX: number, spotX: number): void {
      frontCursor.setAttribute('transform', `translate(${frontX}, ${CURSOR_Y})`);
      spotCursor.setAttribute('transform', `translate(${spotX}, ${CURSOR_Y})`);
    }

    function showCursors(on: boolean): void {
      frontCursor.setAttribute('opacity', on ? '1' : '0');
      spotCursor.setAttribute('opacity', on ? '1' : '0');
    }

    async function flashPair(a: number, b: number, fill: string, ms: number): Promise<void> {
      for (const i of [a, b]) {
        if (i < 0 || i >= n) continue;
        cells[i]!.rect.setAttribute('fill', fill);
        cells[i]!.glyph.setAttribute('fill', c.stateInk);
      }
      await wait(ms);
      for (const i of [a, b]) {
        if (i < 0 || i >= n) continue;
        cells[i]!.rect.setAttribute('fill', regionFill(i));
        cells[i]!.glyph.setAttribute('fill', c.text);
      }
    }

    function resetAll(): void {
      win = null;
      paintRegions();
      paintBands(originX, originX, 0);
      showCursors(false);
      gSweep.textContent = '';
      gGuide.textContent = '';
      gChip.textContent = '';
      for (let i = 0; i < n; i += 1) clearValue(i);
    }

    resetAll();

    const instance: ViewInstance = {
      setCaption(value: string): void {
        const lines = wrapCaption(value);
        captionLines[0]!.textContent = lines[0] ?? '';
        captionLines[1]!.textContent = lines[1] ?? '';
      },

      /** 맨 앞 자리 — 문자열 전체를 훑고 그 길이를 값 칸에 놓는다. */
      async showWhole(step: { index: number; value: number }): Promise<void> {
        const sweep = el('rect', {
          x: cellX(0) + 1, y: CELLS_Y, width: 0, height: CELL_H, rx: 5,
          fill: c.accent, 'fill-opacity': 0.22,
        });
        gSweep.appendChild(sweep);
        const full = n * cellW - 2;
        await tween(SWEEP_MS, (t) => {
          sweep.setAttribute('width', String(full * t));
        });
        await writeValue(step.index, step.value, false);
        await tween(160, (t) => {
          sweep.setAttribute('fill-opacity', String(0.22 * (1 - t)));
        });
        sweep.remove();
      },

      /** 구간 밖 — 커서 둘이 나란히 걸으며 글자를 견준다. */
      async scan(step: { index: number; start: number; value: number; mismatch: boolean }): Promise<void> {
        const { index, start, value, mismatch } = step;
        let at = start;
        placeCursors(cellCenter(at), cellCenter(index + at));
        showCursors(true);

        for (let k = start; k < value; k += 1) {
          if (k > at) {
            const fromK = at;
            await tween(STEP_MOVE_MS, (t) => {
              placeCursors(
                lerp(cellCenter(fromK), cellCenter(k), t),
                lerp(cellCenter(index + fromK), cellCenter(index + k), t),
              );
            });
            at = k;
          }
          await flashPair(k, index + k, c.itemComparing, HIT_FLASH_MS);
        }

        if (mismatch) {
          // 맞은 견줌이 하나라도 있었으면 커서가 한 칸 더 나아가 어긋난 자리를 짚는다.
          if (value > at) {
            const fromK = at;
            await tween(STEP_MOVE_MS, (t) => {
              placeCursors(
                lerp(cellCenter(fromK), cellCenter(value), t),
                lerp(cellCenter(index + fromK), cellCenter(index + value), t),
              );
            });
          } else {
            placeCursors(cellCenter(value), cellCenter(index + value));
          }
          await flashPair(value, index + value, c.itemSwapping, MISS_FLASH_MS);
        }

        showCursors(false);
        await writeValue(index, value, false);
      },

      /** 구간 안 — 거울 자리의 답이 활을 그리며 이 자리로 옮겨 온다. */
      async borrow(step: { index: number; from: number; value: number }): Promise<void> {
        const { index, from, value } = step;
        const source = boxes[from]!;
        source.rect.setAttribute('stroke', c.accent);
        source.rect.setAttribute('stroke-width', '2');
        await wait(BORROW_LIFT_MS);

        const x0 = cellCenter(from);
        const x1 = cellCenter(index);
        const cx = (x0 + x1) / 2;
        const guide = el('path', {
          d: `M ${x0} ${valueCenterY} Q ${cx} ${ARC_CTRL_Y} ${x1} ${valueCenterY}`,
          fill: 'none', stroke: c.auxCursor, 'stroke-width': 1,
          'stroke-dasharray': '4 4', opacity: 0.9,
        });
        gGuide.appendChild(guide);

        const chipW = Math.min(30, cellW - VALUE_INSET * 2);
        const chip = el('g', { transform: `translate(${x0}, ${valueCenterY})` });
        const chipRect = el('rect', {
          x: -chipW / 2, y: -13, width: chipW, height: 26, rx: 5, fill: c.accent,
        });
        const chipGlyph = el('text', {
          x: 0, y: 5, 'text-anchor': 'middle', 'font-family': fonts.mono,
          'font-size': fontSizes.md, fill: c.stateInk,
        });
        chipGlyph.textContent = String(value);
        chip.appendChild(chipRect);
        chip.appendChild(chipGlyph);
        gChip.appendChild(chip);

        await tween(BORROW_FLY_MS, (t) => {
          const u = 1 - t;
          const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
          const y = u * u * valueCenterY + 2 * u * t * ARC_CTRL_Y + t * t * valueCenterY;
          chip.setAttribute('transform', `translate(${x}, ${y})`);
        });

        chip.remove();
        source.rect.setAttribute('stroke-width', '1');
        settleValue(from);
        await writeValue(index, value, true);
        await tween(150, (t) => {
          guide.setAttribute('opacity', String(0.9 * (1 - t)));
        });
        guide.remove();
      },

      /** 구간이 오른쪽으로 미끄러진다. 오른쪽 끝은 뒤로 가지 않는다. */
      async moveWindow(step: { left: number; right: number }): Promise<void> {
        const prev = win ?? { left: step.left, right: step.left - 1 };
        const fromL = cellX(prev.left);
        const fromR = cellX(prev.right + 1);
        const fromSpan = fromR - fromL;
        const toL = cellX(step.left);
        const toR = cellX(step.right + 1);
        const toSpan = toR - toL;

        await tween(WINDOW_MOVE_MS, (t) => {
          paintBands(lerp(fromL, toL, t), lerp(fromR, toR, t), lerp(fromSpan, toSpan, t));
        });

        win = { left: step.left, right: step.right };
        paintRegions();
        paintBands(toL, toR, toSpan);
      },

      /** 마무리 — 거울에서 빌려 온 자리들이 차례로 한 번 튄다. */
      async finish(): Promise<void> {
        showCursors(false);
        for (let i = 0; i < n; i += 1) {
          if (!borrowed[i]) continue;
          const box = boxes[i]!;
          await tween(BOUNCE_MS, (t) => {
            box.group.setAttribute('transform', `translate(0, ${-6 * t})`);
          });
          await tween(BOUNCE_MS, (t) => {
            box.group.setAttribute('transform', `translate(0, ${-6 * (1 - t)})`);
          });
        }
      },

      rewind(): void {
        resetAll();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
