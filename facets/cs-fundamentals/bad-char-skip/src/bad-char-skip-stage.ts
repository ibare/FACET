/**
 * bad-char-skip-stage — 패턴이 텍스트 위를 뛰어넘는 그림.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세운다 (S-scene). 되돌릴 명령이 없으므로 늘 비우고 다시 짓는다.
 *
 * 동사는 "뛰어넘는다" 다. 그래서 이 화면의 주인공은 **자리를 옮기는 덩어리**다.
 *   · 텍스트는 한 줄의 띠로 깔리고 움직이지 않는다.
 *   · 패턴은 그 아래를 미끄러지는 한 덩어리다. 미는 거리가 걸음마다 다르다.
 *   · 어긋난 글자는 띠에서 **떠올라 표의 칸으로 날아간다.** 그 칸이 가진 수가
 *     곧 뛸 거리라서, 표와 점프가 한 몸짓으로 이어진다.
 *   · 민 거리는 호(arc)로 남는다. **호는 지워지지 않고 쌓인다** — 그 아래가
 *     끝내 한 번도 짚어 보지 않은 자리이고, 그것이 이 조각이 자랑하는 것이다.
 *
 * ── 두 축을 가른다 (프로토콜 4 절)
 *
 *   **채움 = 값의 형편** — 마지막으로 견주었을 때 맞았나 어긋났나.
 *   **테두리 = 짚음의 표식** — 이 칸을 한 번이라도 들여다본 적 있나. 쌓인다.
 *
 * 둘을 한 축에 실으면 "건너뛴 칸" 과 "보고 나서 지나간 칸" 이 같은 모양이 되어
 * 조각의 주장이 정반대로 읽힌다. 다 끝난 화면에서 테두리가 없는 칸이 곧
 * **아예 안 본 자리**다.
 *
 * 텍스트 칸의 채움은 마지막으로 짚은 자리의 형편이라 밀고 나서도 남지만, 패턴
 * 칸의 채움은 **지금 선 자리에서** 견준 결과라 밀면 사라진다 — 옮겨 간 자리에서는
 * 아직 아무것도 견주지 않았기 때문이다.
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

import {
  mismatchAt,
  type BadCharCaption,
  type BadCharSkipScene,
  type Probe,
} from './scene.js';

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

const MARK_WIDTH = '1.6';
const LIT_WIDTH = '2.5';

/** 빈칸도 한 글자라는 것을 보이는 표식 (C10 — 도형에 각인된 글자). */
const BLANK_MARK = '·';
/** 표에 없는 글자가 받는 값. 수식 표기라 번역하지 않는다 (C10). */
const ABSENT_MARK = '−1';

/** 채움이 말하는 것 — 마지막으로 견주었을 때의 형편. */
type Tone = 'idle' | 'match' | 'miss';

/** 캔버스에서 역산한 자리. 바탕(텍스트·표)이 정하므로 그릴 때마다 다시 잰다. */
type Layout = {
  cellW: number;
  cellX: (i: number) => number;
  slotCount: number;
  absentIdx: number;
  slotW: number;
  slotX: (i: number) => number;
  slotCharX: (i: number) => number;
};

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

function layoutOf(scene: BadCharSkipScene): Layout {
  const count = Math.max(1, scene.base.text.length);
  const cellW = Math.min(
    CELL_MAX_W,
    Math.floor((PIECE_CANVAS_W - CELL_SIDE_MIN * 2) / count),
  );
  const originX = Math.round((PIECE_CANVAS_W - scene.base.text.length * cellW) / 2);

  const slotCount = scene.slots.length + 1;
  const slotW = Math.min(
    SLOT_MAX_W,
    Math.floor(
      (PIECE_CANVAS_W - SLOT_SIDE_MIN * 2 - SLOT_GAP * (slotCount - 1)) / slotCount,
    ),
  );
  const rowX = Math.round(
    (PIECE_CANVAS_W - (slotCount * slotW + (slotCount - 1) * SLOT_GAP)) / 2,
  );
  const slotX = (i: number): number => rowX + i * (slotW + SLOT_GAP);

  return {
    cellW,
    cellX: (i: number): number => originX + i * cellW,
    slotCount,
    absentIdx: scene.slots.length,
    slotW,
    slotX,
    /** 칸 안에서 글자가 서는 자리 — 날아온 글자도 같은 자리에 내려앉는다. */
    slotCharX: (i: number): number => slotX(i) + slotW * 0.3,
  };
}

/**
 * 그 자리에서 짚어 본 텍스트 칸들 — **오른쪽부터 짚어 간 차례 그대로**.
 * 맞은 칸들이 앞에 오고, 어긋난 칸이 있으면 마지막이다.
 */
function colsOf(scene: BadCharSkipScene, probe: Probe): number[] {
  const m = scene.base.pattern.length;
  const cols: number[] = [];
  const seen = Math.min(probe.matched, m);
  for (let k = 0; k < seen; k += 1) cols.push(probe.at + m - 1 - k);
  const miss = mismatchAt(scene, probe);
  if (miss !== null) cols.push(miss);
  return cols;
}

/** 앞선 `count` 개의 자리에서 짚어 본 칸 전부. 테두리 표식이 여기서 나온다. */
function lookedUpTo(scene: BadCharSkipScene, count: number): Set<number> {
  const seen = new Set<number>();
  for (let i = 0; i < count && i < scene.probes.length; i += 1) {
    for (const col of colsOf(scene, scene.probes[i])) seen.add(col);
  }
  return seen;
}

/** 넓은 글자(한글·가나 등)는 두 칸으로 센다. 줄바꿈 폭 어림에만 쓴다. */
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
    // 장면 방식에서는 문안을 stage 가 만든다 — 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 세대 빗장. `render` 가 새로 오면 앞 세대의 운동은 화면에 손대지 않고 물러난다.
     *
     * 정적 그리기가 칸을 매번 새로 짓지만 **손잡이 배열을 다시 채우므로**, 앞
     * 세대가 `await` 뒤에 그 배열을 읽으면 살아 있는 화면에 옛 프레임을 쓴다
     * (프로토콜 3-4 절).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

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

    /**
     * rAF 대신 타이머 보간. CSS transition 은 되짚은 뒤에도 혼자 흘러간다 (MUST NOT).
     *
     * **프레임마다 세대를 본다.** 되짚기가 운동 도중에 끼어들면 앞 세대의 남은
     * 프레임들이 이미 새로 선 화면에 옛 값을 쓴다 — 레이어(`gPattern`)와 정적
     * 그리기가 다시 채우는 손잡이(`lastArc`)는 둘 다 살아 있는 요소라, `await`
     * 뒤에만 보는 빗장으로는 못 막는다.
     */
    function animate(ms: number, mine: number, onFrame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || !alive(mine)) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed || !alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          onFrame(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 레이어. 한 번만 짓고, 그릴 때마다 비운다.
    const gTable = el('g', {});
    const gText = el('g', {});
    const gJump = el('g', {});
    const gPattern = el('g', {});
    const gCursor = el('g', {});
    const gToken = el('g', {});
    const gCaption = el('g', {});
    const layers = [gTable, gText, gJump, gPattern, gCursor, gToken, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 정적 그리기가 다시 채우는 손잡이들
    let slotRects: SVGRectElement[] = [];
    let slotValues: SVGTextElement[] = [];
    let textRects: SVGRectElement[] = [];
    let textGlyphs: SVGTextElement[] = [];
    let patRects: SVGRectElement[] = [];
    let patGlyphs: SVGTextElement[] = [];
    let lastArc: { path: SVGPathElement; head: SVGCircleElement; label: SVGTextElement } | null =
      null;

    function fillOf(tone: Tone, base: string): string {
      if (tone === 'match') return c.itemPivot;
      if (tone === 'miss') return c.itemSwapping;
      return base;
    }

    function inkOf(tone: Tone): string {
      return tone === 'idle' ? c.text : c.stateInk;
    }

    /** 텍스트 칸 하나 — 채움은 형편, 테두리는 짚어 본 표식. 두 축이 겹치지 않는다. */
    function paintTextCell(i: number, tone: Tone, looked: boolean): void {
      const rect = textRects[i];
      const glyph = textGlyphs[i];
      if (!rect || !glyph) return;
      rect.setAttribute('fill', fillOf(tone, c.itemDefault));
      rect.setAttribute('stroke', looked ? c.text : c.border);
      rect.setAttribute('stroke-width', looked ? MARK_WIDTH : '1');
      glyph.setAttribute('fill', inkOf(tone));
    }

    function paintPatCell(j: number, tone: Tone): void {
      const rect = patRects[j];
      const glyph = patGlyphs[j];
      if (!rect || !glyph) return;
      rect.setAttribute('fill', fillOf(tone, c.bgSubtle));
      rect.setAttribute('stroke', c.border);
      glyph.setAttribute('fill', inkOf(tone));
    }

    /** 표의 칸 하나를 켠다. `-1` 이면 전부 끈다. */
    function litSlot(scene: BadCharSkipScene, index: number): void {
      for (let i = 0; i < slotRects.length; i += 1) {
        const on = i === index;
        const absent = i === scene.slots.length;
        slotRects[i].setAttribute(
          'stroke',
          on ? c.itemActive : absent ? c.textMuted : c.border,
        );
        slotRects[i].setAttribute('stroke-width', on ? LIT_WIDTH : '1');
        slotValues[i].setAttribute(
          'fill',
          on ? c.itemActive : absent ? c.textMuted : c.text,
        );
      }
    }

    /** 어긋난 글자가 가는 표의 칸. 패턴에 없는 글자는 마지막 칸(−1)이다. */
    function slotIndexOf(scene: BadCharSkipScene, ch: string): number {
      const known = scene.slots.findIndex((s) => s.ch === ch);
      return known >= 0 ? known : scene.slots.length;
    }

    const glyphOf = (ch: string): string => (ch === ' ' ? BLANK_MARK : ch);

    // ── 정적 그리기 ──────────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 레이어 자신의 속성도 되돌린다 — 자식을 비워도 남는다. */
    function rewind(): void {
      for (const g of layers) {
        g.textContent = '';
        g.removeAttribute('opacity');
        g.removeAttribute('transform');
      }
      slotRects = [];
      slotValues = [];
      textRects = [];
      textGlyphs = [];
      patRects = [];
      patGlyphs = [];
      lastArc = null;
    }

    function drawTable(scene: BadCharSkipScene, geo: Layout): void {
      const label = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: TABLE_LABEL_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = t('label.table', 'last position in the pattern');
      gTable.appendChild(label);

      for (let i = 0; i < geo.slotCount; i += 1) {
        const absent = i === geo.absentIdx;
        const rect = el('rect', {
          x: geo.slotX(i),
          y: SLOT_Y,
          width: geo.slotW,
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
            x: geo.slotCharX(i),
            y: SLOT_Y + SLOT_H / 2 + 5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: c.text,
          });
          ch.textContent = glyphOf(scene.slots[i].ch);
          gTable.appendChild(ch);
        }

        const value = el('text', {
          x: geo.slotX(i) + geo.slotW * 0.74,
          y: SLOT_Y + SLOT_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: absent ? c.textMuted : c.text,
        });
        value.textContent = absent ? ABSENT_MARK : String(scene.slots[i].last);
        gTable.appendChild(value);
        slotValues.push(value);
      }
    }

    function drawTextBand(scene: BadCharSkipScene, geo: Layout): void {
      const { text } = scene.base;
      for (let i = 0; i < text.length; i += 1) {
        const idx = el('text', {
          x: geo.cellX(i) + (geo.cellW - 2) / 2,
          y: IDX_BASE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        idx.textContent = String(i);
        gText.appendChild(idx);

        const rect = el('rect', {
          x: geo.cellX(i),
          y: TEXT_Y,
          width: geo.cellW - 2,
          height: CELL_H,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        gText.appendChild(rect);
        textRects.push(rect);

        const glyph = el('text', {
          x: geo.cellX(i) + (geo.cellW - 2) / 2,
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
    }

    function drawPattern(scene: BadCharSkipScene, geo: Layout): void {
      const { pattern } = scene.base;
      const left = geo.cellX(scene.stand);
      gPattern.appendChild(
        el('rect', {
          x: left - 5,
          y: PAT_Y - 5,
          width: pattern.length * geo.cellW + 8,
          height: CELL_H + 10,
          rx: 8,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 1.5,
        }),
      );

      for (let j = 0; j < pattern.length; j += 1) {
        const rect = el('rect', {
          x: geo.cellX(scene.stand + j),
          y: PAT_Y,
          width: geo.cellW - 2,
          height: CELL_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        });
        gPattern.appendChild(rect);
        patRects.push(rect);

        const glyph = el('text', {
          x: geo.cellX(scene.stand + j) + (geo.cellW - 2) / 2,
          y: PAT_Y + CELL_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        glyph.textContent = glyphOf(pattern[j]);
        gPattern.appendChild(glyph);
        patGlyphs.push(glyph);
      }
    }

    function arcPath(x1: number, x2: number): string {
      const mid = (x1 + x2) / 2;
      return `M ${x1} ${ARC_Y} Q ${mid} ${ARC_Y + ARC_DEPTH} ${x2} ${ARC_Y}`;
    }

    /** 지금까지 민 것을 **전부** 그린다. 호는 지워지지 않고 쌓인다. */
    function drawJumps(scene: BadCharSkipScene, geo: Layout): void {
      for (const jump of scene.jumps) {
        const x1 = geo.cellX(jump.from);
        const x2 = geo.cellX(jump.to);
        const path = el('path', {
          d: arcPath(x1, x2),
          fill: 'none',
          stroke: c.itemActive,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        const head = el('circle', { cx: x2, cy: ARC_Y, r: 3.5, fill: c.itemActive });
        const label = el('text', {
          x: (x1 + x2) / 2,
          y: ARC_Y + ARC_DEPTH * 0.62,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.itemActive,
        });
        label.textContent = String(jump.to - jump.from);
        gJump.appendChild(path);
        gJump.appendChild(head);
        gJump.appendChild(label);
        lastArc = { path, head, label };
      }
    }

    /** 견주는 자리를 잇는 커서. 짚어 보는 걸음에만 선다. */
    function drawCursor(scene: BadCharSkipScene, geo: Layout): void {
      if (scene.step?.kind !== 'scan') return;
      const probe = scene.probes[scene.probes.length - 1];
      if (!probe) return;
      const cols = colsOf(scene, probe);
      const at = cols.length > 0 ? cols[cols.length - 1] : probe.at;
      buildCursor(geo, at);
    }

    function buildCursor(geo: Layout, col: number): void {
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
      placeCursor(geo, col);
    }

    /** 칸의 가운데 가로 자리. */
    function centerOf(geo: Layout, col: number): number {
      return geo.cellX(col) + (geo.cellW - 2) / 2;
    }

    function placeCursor(geo: Layout, col: number): void {
      gCursor.setAttribute('transform', `translate(${centerOf(geo, col)} 0)`);
    }

    function captionText(cap: BadCharCaption): string {
      switch (cap.kind) {
        case 'allMatch':
          return t('caption.allMatch', 'All {n} letters match.', { n: cap.n });
        case 'missAtEnd':
          return t('caption.missAtEnd', 'The last letter already differs: {ch}', {
            ch: cap.ch,
          });
        case 'missAfter':
          return t(
            'caption.missAfter',
            'Matched from the right: {n}. Then this letter breaks it: {ch}',
            { n: cap.n, ch: cap.ch },
          );
        case 'skipKnown':
          return t(
            'caption.skipKnown',
            '{ch} last stands in the pattern at {last}, so the slide is only {n}',
            { ch: cap.ch, last: cap.last, n: cap.n },
          );
        case 'skipNone':
          return t(
            'caption.skipNone',
            '{ch} is nowhere in the pattern, so nothing can overlap it. Cells jumped: {n}',
            { ch: cap.ch, n: cap.n },
          );
        case 'found':
          return t('caption.found', 'The whole pattern matches. Position: {at}', {
            at: cap.at,
          });
      }
    }

    function drawCaption(cap: BadCharCaption | null): void {
      if (!cap) return;
      const lines = wrapText(captionText(cap), CAP_MAX_UNITS).slice(0, CAP_MAX_LINES);
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

    /**
     * 장면이 말하는 것을 전부 세운다. 어느 걸음에서 오든 결과가 같다.
     *
     * 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 — 그리면서 이웃의 지금
     * 좌표를 읽으면 순회 순서가 숨은 상태가 된다 (프로토콜 4 절).
     */
    function drawStatic(scene: BadCharSkipScene): void {
      rewind();
      const geo = layoutOf(scene);

      drawTable(scene, geo);
      drawTextBand(scene, geo);
      drawPattern(scene, geo);
      drawJumps(scene, geo);

      const probe = scene.probes[scene.probes.length - 1];
      const looked = lookedUpTo(scene, scene.probes.length);
      for (const i of looked) paintTextCell(i, 'idle', true);

      if (probe) {
        // 마지막으로 짚은 자리의 형편. 텍스트 칸에는 남고, 패턴 칸에는 **지금 그
        // 자리에 서 있을 때만** 남는다 — 밀고 나면 아직 견준 것이 없다.
        const cols = colsOf(scene, probe);
        const stands = scene.stand === probe.at;
        for (let k = 0; k < cols.length; k += 1) {
          const tone: Tone = k < probe.matched ? 'match' : 'miss';
          paintTextCell(cols[k], tone, true);
          if (stands) paintPatCell(cols[k] - probe.at, tone);
        }
      }

      // 표의 칸은 민 걸음에서만 켜진다 — 그 칸의 수가 곧 민 거리라서다.
      if (scene.step?.kind === 'skip' && probe) {
        const miss = mismatchAt(scene, probe);
        const ch = miss === null ? '' : (scene.base.text[miss] ?? '');
        litSlot(scene, slotIndexOf(scene, ch));
      } else {
        litSlot(scene, -1);
      }

      drawCursor(scene, geo);
      drawCaption(scene.caption);
    }

    // ── 운동 ────────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 오지
    // 않은 만큼을 뒤로 물려** 놓고 제자리로 돌려놓는 꼴이 된다.

    /**
     * 오른쪽 끝부터 한 칸씩 짚어 간다. 짚은 칸에 표식과 형편이 함께 앉는다.
     *
     * 커서의 출발 자리는 **장면이 정한 칸에서 셈한다.** 화면의 지금 자리를 따로
     * 적어 둔 표나 속성을 되읽어 출발값으로 삼으면, 되짚어 세운 직후에 그것이 옛
     * 화면의 것이라 엉뚱한 데서 출발한다 (프로토콜 4 절).
     */
    async function flowScan(scene: BadCharSkipScene, mine: number): Promise<void> {
      const probe = scene.probes[scene.probes.length - 1];
      if (!probe) return;
      const geo = layoutOf(scene);
      const cols = colsOf(scene, probe);
      const before = lookedUpTo(scene, scene.probes.length - 1);

      // 출발 그림으로 물린다 — 이 걸음이 짚기 전으로.
      for (const i of cols) paintTextCell(i, 'idle', before.has(i));
      for (const i of cols) paintPatCell(i - probe.at, 'idle');
      gCursor.textContent = '';
      // 커서는 패턴의 오른쪽 끝 바깥에서 출발해 왼쪽으로 짚어 들어간다.
      const startCol = probe.at + scene.base.pattern.length;
      buildCursor(geo, startCol);

      let fromX = centerOf(geo, startCol);
      for (let k = 0; k < cols.length; k += 1) {
        const a = fromX;
        const b = centerOf(geo, cols[k]);
        await animate(SCAN_STEP_MS, mine, (e) => {
          gCursor.setAttribute('transform', `translate(${a + (b - a) * e} 0)`);
        });
        if (!alive(mine)) return;
        fromX = b;
        const tone: Tone = k < probe.matched ? 'match' : 'miss';
        paintTextCell(cols[k], tone, true);
        paintPatCell(cols[k] - probe.at, tone);
      }
    }

    /** 어긋난 글자가 표로 날아오르고, 그만큼 패턴이 민다. */
    async function flowSkip(scene: BadCharSkipScene, mine: number): Promise<void> {
      const jump = scene.jumps[scene.jumps.length - 1];
      const probe = scene.probes[scene.probes.length - 1];
      if (!jump || !probe) return;
      const geo = layoutOf(scene);
      const miss = mismatchAt(scene, probe);
      if (miss === null) return;
      const ch = scene.base.text[miss] ?? '';
      const slot = slotIndexOf(scene, ch);

      // 출발 그림으로 물린다 — 칸은 아직 안 켜졌고, 호는 아직 자라지 않았고,
      // 패턴은 아직 옛 자리에 있다.
      litSlot(scene, -1);
      const x1 = geo.cellX(jump.from);
      const x2 = geo.cellX(jump.to);
      if (lastArc) {
        lastArc.path.setAttribute('d', arcPath(x1, x1));
        lastArc.head.setAttribute('cx', String(x1));
        lastArc.label.setAttribute('x', String(x1));
      }
      gPattern.setAttribute('transform', `translate(${x1 - x2} 0)`);

      // 1) 글자가 떠올라 칸으로 간다.
      const tokenRect = el('rect', {
        x: 0,
        y: 0,
        width: geo.cellW - 2,
        height: CELL_H,
        rx: 4,
        fill: c.itemSwapping,
        stroke: c.itemSwapping,
        'stroke-width': 1,
      });
      const tokenGlyph = el('text', {
        x: (geo.cellW - 2) / 2,
        y: CELL_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.stateInk,
      });
      tokenGlyph.textContent = glyphOf(ch);
      gToken.appendChild(tokenRect);
      gToken.appendChild(tokenGlyph);

      const fromX = geo.cellX(miss);
      const toX = geo.slotCharX(slot) - (geo.cellW - 2) / 2;
      const toY = SLOT_Y + (SLOT_H - CELL_H) / 2;
      gToken.setAttribute('transform', `translate(${fromX} ${TEXT_Y})`);
      await animate(LIFT_MS, mine, (e) => {
        gToken.setAttribute(
          'transform',
          `translate(${fromX + (toX - fromX) * e} ${TEXT_Y + (toY - TEXT_Y) * e})`,
        );
      });
      if (!alive(mine)) return;

      // 2) 칸이 켜진다. 그 수가 곧 뛸 거리다.
      litSlot(scene, slot);
      await wait(HOLD_MS);
      if (!alive(mine)) return;

      // 3) 패턴이 밀고, 호가 그만큼 자란다. 한 뜻이라 한 시계로 흐른다.
      await animate(SLIDE_MS, mine, (e) => {
        gPattern.setAttribute('transform', `translate(${(x1 - x2) * (1 - e)} 0)`);
        const head = x1 + (x2 - x1) * e;
        if (!lastArc) return;
        lastArc.path.setAttribute('d', arcPath(x1, head));
        lastArc.head.setAttribute('cx', String(head));
        lastArc.label.setAttribute('x', String((x1 + head) / 2));
      });
    }

    /** 통째로 맞은 자리에서 한 번 눌러앉는다. */
    async function flowFound(mine: number): Promise<void> {
      await animate(BOUNCE_MS, mine, (e) => {
        gPattern.setAttribute(
          'transform',
          `translate(0 ${Math.sin(e * Math.PI) * BOUNCE_DEPTH})`,
        );
      });
    }

    async function flow(scene: BadCharSkipScene, mine: number): Promise<void> {
      switch (scene.step?.kind) {
        case 'scan':
          return flowScan(scene, mine);
        case 'skip':
          return flowSkip(scene, mine);
        case 'found':
          return flowFound(mine);
        default:
          return;
      }
    }

    /**
     * 장면을 그린다.
     *
     * `prev` 는 쓰지 않는다 — 무엇을 흐르게 할지는 `step` 이 말하고, 출발 그림은
     * 장면에서 셈으로 복원한다 (S-scene 의 "`prev` 는 고르는 데만").
     */
    async function render(
      next: BadCharSkipScene,
      _prev: BadCharSkipScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다 (S-scene MUST).
      if (!opts.animate) return;
      await flow(next, mine);
      if (!alive(mine)) return;
      // 운동이 남긴 속성·보간 끝자리를 통째로 지운다.
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
