/**
 * z-algorithm-stage — 이은 글 한 줄과 그 아래 Z 표, 그리고 찾은 자리.
 *
 * 그리는 것은 넷이다.
 *   1. 이은 글 `찾는 것 $ 글` 한 줄. 앞쪽 구간은 옅은 색지로 갈라 둔다.
 *   2. 겹침 구간과 거울 띠. 구간의 오른쪽 끝은 오른쪽으로만 미끄러진다.
 *   3. 자리마다의 Z 값. 거울에서 빌려 온 자리는 강조색으로 남는다.
 *   4. 찾은 자리 — 글 구간의 칸을 칠하고 아래에 막대를 놓는다.
 *
 * **애니메이션이 없다.** 걸음의 길이는 algorithm 의 `ctx.sleep` 이 정하고 여기서는
 * 즉시 칠한다. 그래서 기다리는 promise 도, 거둘 타이머도 없다 — `destroy` 가
 * 지울 것은 캔버스 안의 노드뿐이다 (S-view).
 *
 * **세로는 마운트한 뒤 바뀌지 않는다.** 가로 칸 너비도 마운트 때 `texts` 중 가장
 * 긴 것으로 한 번 정하고 그 뒤로 건드리지 않는다 — 단을 바꿔도 칸이 움직이지
 * 않아야 독자가 같은 자리를 견줄 수 있다 (S-view).
 */

import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 300;
const PAD = 20;
const INNER = W - PAD * 2;

// ── 세로 배치. 위에서 아래로 라벨 · 띠 · 글자칸 · 커서 · 값칸 · 자리번호 ·
//    찾은자리 막대 · 요약 · 캡션.
const PATTERN_LABEL_Y = 18;
const BAND_Y = 38;
const BAND_H = 8;
const CELLS_Y = 54;
const CELL_H = 38;
const CURSOR_Y = CELLS_Y + CELL_H + 4;
const CURSOR_H = 10;
const VALUE_Y = 112;
const VALUE_H = 26;
const INDEX_Y = 154;
const HIT_Y = 164;
const HIT_H = 6;
const STAT_LABEL_Y = 196;
const STAT_VALUE_Y = 220;
const CAPTION_Y = 262;
const CAPTION_LINE_H = 18;

/** 값 칸을 글자 칸보다 좁게 들여 둔다. 두 줄이 붙어 보이지 않게. */
const VALUE_INSET = 5;

/** 칸 안에 수를 적을 수 있는 최소 너비. 이보다 좁으면 칸만 칠한다. */
const DIGIT_MIN_W = 16;

const CAPTION_MAX_CHARS = 86;

const STAT_COLS = [PAD, PAD + 230, PAD + 460];

type CellParts = { rect: SVGRectElement; glyph: SVGTextElement };
type ValueParts = { rect: SVGRectElement; glyph: SVGTextElement | null };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
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
    if (head !== '' && (next?.length ?? 0) > CAPTION_MAX_CHARS) break;
    head = next ?? '';
    i += 1;
  }
  const tail = words.slice(i).join(' ');
  return tail === '' ? [head] : [head, tail];
}

/** initialData 는 오픈 타입이라 여기서 한 번만 좁힌다 (C9). */
function readScene(raw: Record<string, unknown> | undefined): {
  pattern: string;
  separator: string;
  texts: string[];
} {
  const pattern = typeof raw?.['pattern'] === 'string' ? raw['pattern'] : '';
  const separator = typeof raw?.['separator'] === 'string' ? raw['separator'] : '$';
  const texts = Array.isArray(raw?.['texts'])
    ? (raw['texts'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return { pattern, separator, texts };
}

export const zAlgorithmStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    /**
     * 손잡이를 밀라는 문안은 세 곳에서 뜬다 (첫 그리기 · 끝 · 되돌리기).
     * en 원본을 세 벌 두면 고칠 때 하나가 빠지므로 한 번만 적는다 (C10 PREFER).
     *
     * 키와 en 원본은 여기서도 **리터럴**이라 추출기가 그대로 본다. 키나 원본을
     * 인자로 받는 헬퍼로 감싸면 둘이 변수가 되어 추출기가 못 보고, 전수 검사
     * `en-original-matches-declaration` 에서 그 문안이 통째로 사라진다.
     */
    const pushCaption = (): string =>
      t('caption.push', 'Push the slider. The more the text repeats, the more gets borrowed and the less gets compared.');

    // 칸 너비는 가장 긴 단을 기준으로 한 번만 정한다. 단을 바꿔도 칸이 움직이지
    // 않아야 독자가 같은 자리를 견줄 수 있다.
    const maxN = scene.texts.reduce(
      (best, txt) => Math.max(best, scene.pattern.length + scene.separator.length + txt.length),
      1,
    );
    const cellW = INNER / maxN;
    const showDigit = cellW >= DIGIT_MIN_W;
    const cellX = (i: number): number => PAD + i * cellW;
    const cellCenter = (i: number): number => cellX(i) + cellW / 2;
    const valueCenterY = VALUE_Y + VALUE_H / 2;

    // ── 고정 층 ────────────────────────────────────────────────
    //
    // 찾는 것을 글자로 한 번 더 적지 않는다. 그것은 아래 칸줄의 앞부분에 이미
    // 그려져 있고 색지로 갈라 두었으므로, 이 라벨은 **그 구간을 가리키는 말**이다.
    //
    // 옛 모양은 라벨 옆 `x: PAD + 74` 에 값을 적었는데, 그러면 라벨이 74px 안에
    // 들어가야 한다. 아랍어 문안이 그 폭을 넘어 값과 겹쳤다. 글꼴 폭을 어림해
    // 여백을 늘리는 대신 **겹칠 자리를 없앴다** — 이제 라벨이 캔버스 폭을 통째로
    // 쓰므로 어느 언어에서도 깨지지 않는다.
    const patternLabel = el('text', {
      x: PAD,
      y: PATTERN_LABEL_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    patternLabel.textContent = t('label.pattern', 'looking for');
    svg.appendChild(patternLabel);

    // 거울 띠 — 맨 앞에서 구간과 같은 길이만큼.
    const mirrorBand = el('rect', {
      x: PAD, y: BAND_Y, width: 0, height: BAND_H, rx: 3,
      fill: c.auxCursor, opacity: 0,
    });
    const mirrorLabel = el('text', {
      x: PAD, y: PATTERN_LABEL_Y + 12, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted, opacity: 0,
    });
    mirrorLabel.textContent = t('label.mirror', 'mirror');

    // 겹침 구간 띠.
    const windowBand = el('rect', {
      x: PAD, y: BAND_Y, width: 0, height: BAND_H, rx: 3,
      fill: c.accent, opacity: 0,
    });

    // 구간의 오른쪽 끝. 오른쪽으로만 움직인다.
    const edgeLine = el('line', {
      x1: PAD, y1: BAND_Y - 5, x2: PAD, y2: VALUE_Y + VALUE_H + 5,
      stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0,
    });

    svg.appendChild(mirrorBand);
    svg.appendChild(windowBand);
    svg.appendChild(edgeLine);
    svg.appendChild(mirrorLabel);

    const cellsG = el('g', {});
    const valuesG = el('g', {});
    const hitsG = el('g', {});
    svg.appendChild(cellsG);
    svg.appendChild(valuesG);
    svg.appendChild(hitsG);

    // 견주는 커서 둘. 왼쪽(맨 앞) 것은 속이 비고, 오른쪽(지금 자리) 것은 찼다.
    const cursorPath = `M -6 ${CURSOR_H} L 6 ${CURSOR_H} L 0 0 Z`;
    const frontCursor = el('path', {
      d: cursorPath, fill: 'none', stroke: c.auxCursor, 'stroke-width': 1.5, opacity: 0,
      transform: `translate(${PAD}, ${CURSOR_Y})`,
    });
    const spotCursor = el('path', {
      d: cursorPath, fill: c.text, opacity: 0,
      transform: `translate(${PAD}, ${CURSOR_Y})`,
    });
    svg.appendChild(frontCursor);
    svg.appendChild(spotCursor);

    // 요약 셋.
    for (const [i, label] of [
      t('label.borrows', 'borrowed'),
      t('label.saved', 'comparisons saved'),
      t('label.matches', 'found at'),
    ].entries()) {
      const node = el('text', {
        x: STAT_COLS[i] ?? PAD, y: STAT_LABEL_Y,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      });
      node.textContent = label;
      svg.appendChild(node);
    }

    const statValues = [0, 1, 2].map((i) => {
      const node = el('text', {
        x: STAT_COLS[i] ?? PAD, y: STAT_VALUE_Y,
        'font-family': fonts.mono, 'font-size': fontSizes.xl, fill: c.text,
      });
      svg.appendChild(node);
      return node;
    });

    const captionLines = [0, 1].map((line) => {
      const node = el('text', {
        x: PAD, y: CAPTION_Y + line * CAPTION_LINE_H,
        'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text,
      });
      svg.appendChild(node);
      return node;
    });

    // ── 다시 지어지는 층 ────────────────────────────────────────
    let cells: CellParts[] = [];
    let boxes: ValueParts[] = [];
    let borrowed: boolean[] = [];
    let matched: boolean[] = [];
    let n = 0;
    let off = 0;
    let win: { left: number; right: number } | null = null;

    function setCaption(value: string): void {
      const lines = wrapCaption(value);
      const first = captionLines[0];
      const second = captionLines[1];
      if (first) first.textContent = lines[0] ?? '';
      if (second) second.textContent = lines[1] ?? '';
    }

    /** 칸의 바탕색 — 찾은 자리 · 구간 안 · 앞 구간 · 그 밖. */
    function cellFill(i: number): string {
      if (matched[i] === true) return c.itemSorted;
      if (win && i >= win.left && i <= win.right) return c.subtreeShadeRight;
      if (i < off) return c.subtreeShadeLeft;
      return c.itemDefault;
    }

    /**
     * 칸 위의 잉크. 타일이 테마를 따라 뒤집으면 잉크도 뒤집고, 타일이 고정이면
     * 잉크도 고정한다 (design-tokens 의 stateInk 표).
     */
    function cellInk(i: number): string {
      return matched[i] === true ? c.textInverse : c.text;
    }

    function paintCell(i: number): void {
      const cell = cells[i];
      if (cell === undefined) return;
      cell.rect.setAttribute('fill', cellFill(i));
      cell.rect.setAttribute('stroke', matched[i] === true ? c.itemSorted : c.border);
      cell.glyph.setAttribute('fill', cellInk(i));
    }

    function paintAllCells(): void {
      for (let i = 0; i < n; i += 1) paintCell(i);
    }

    function paintBands(): void {
      if (!win) {
        windowBand.setAttribute('opacity', '0');
        mirrorBand.setAttribute('opacity', '0');
        mirrorLabel.setAttribute('opacity', '0');
        edgeLine.setAttribute('opacity', '0');
        return;
      }
      const l = cellX(win.left);
      const r = cellX(win.right + 1);
      const span = r - l;
      windowBand.setAttribute('x', String(l));
      windowBand.setAttribute('width', String(Math.max(0, span)));
      windowBand.setAttribute('opacity', '1');
      mirrorBand.setAttribute('x', String(PAD));
      mirrorBand.setAttribute('width', String(Math.max(0, span)));
      mirrorBand.setAttribute('opacity', '0.9');
      mirrorLabel.setAttribute('x', String(PAD + span / 2));
      mirrorLabel.setAttribute('opacity', span > cellW ? '1' : '0');
      edgeLine.setAttribute('x1', String(r));
      edgeLine.setAttribute('x2', String(r));
      edgeLine.setAttribute('opacity', '1');
    }

    function setValue(i: number, value: number | null, fromMirror: boolean): void {
      const box = boxes[i];
      if (box === undefined) return;
      borrowed[i] = fromMirror;
      if (value === null) {
        box.rect.setAttribute('fill', 'none');
        box.rect.setAttribute('stroke', c.border);
        box.rect.setAttribute('stroke-dasharray', '3 3');
        if (box.glyph) box.glyph.textContent = '';
        return;
      }
      box.rect.removeAttribute('stroke-dasharray');
      box.rect.setAttribute('fill', fromMirror ? c.accent : c.bgSubtle);
      box.rect.setAttribute('stroke', fromMirror ? c.accent : c.border);
      if (box.glyph) {
        box.glyph.textContent = String(value);
        box.glyph.setAttribute('fill', fromMirror ? c.stateInk : c.text);
      }
    }

    function placeCursors(front: number, spot: number, on: boolean): void {
      frontCursor.setAttribute('transform', `translate(${cellCenter(front)}, ${CURSOR_Y})`);
      spotCursor.setAttribute('transform', `translate(${cellCenter(spot)}, ${CURSOR_Y})`);
      frontCursor.setAttribute('opacity', on ? '1' : '0');
      spotCursor.setAttribute('opacity', on ? '1' : '0');
    }

    function clearStats(): void {
      for (const node of statValues) node.textContent = '';
    }

    /** 이번 단의 이은 글로 화면을 다시 짓는다. 세로도 칸 너비도 건드리지 않는다. */
    function build(joined: string, patternLen: number, sepLen: number): void {
      cellsG.textContent = '';
      valuesG.textContent = '';
      hitsG.textContent = '';
      cells = [];
      boxes = [];
      n = joined.length;
      off = patternLen + sepLen;
      borrowed = new Array<boolean>(n).fill(false);
      matched = new Array<boolean>(n).fill(false);
      win = null;

      for (let i = 0; i < n; i += 1) {
        const rect = el('rect', {
          x: cellX(i) + 0.5, y: CELLS_Y, width: cellW - 1, height: CELL_H, rx: 3,
          fill: c.itemDefault, stroke: c.border, 'stroke-width': 1,
        });
        const glyph = el('text', {
          x: cellCenter(i), y: CELLS_Y + CELL_H / 2 + 5, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text,
        });
        glyph.textContent = joined[i] ?? '';
        cellsG.appendChild(rect);
        cellsG.appendChild(glyph);
        cells.push({ rect, glyph });

        const boxRect = el('rect', {
          x: cellX(i) + VALUE_INSET, y: VALUE_Y,
          width: Math.max(2, cellW - VALUE_INSET * 2), height: VALUE_H, rx: 3,
          fill: 'none', stroke: c.border, 'stroke-width': 1, 'stroke-dasharray': '3 3',
        });
        valuesG.appendChild(boxRect);
        let boxGlyph: SVGTextElement | null = null;
        if (showDigit) {
          boxGlyph = el('text', {
            x: cellCenter(i), y: valueCenterY + 4, 'text-anchor': 'middle',
            'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text,
          });
          valuesG.appendChild(boxGlyph);
        }
        boxes.push({ rect: boxRect, glyph: boxGlyph });

        // 자리 번호는 다섯 칸마다. 다 적으면 글자보다 번호가 빽빽해진다.
        if (i % 5 === 0) {
          const tick = el('text', {
            x: cellCenter(i), y: INDEX_Y, 'text-anchor': 'middle',
            'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
          });
          tick.textContent = String(i);
          valuesG.appendChild(tick);
        }
      }

      paintAllCells();
      paintBands();
      placeCursors(0, 0, false);
      clearStats();
    }

    build('', 0, 0);
    setCaption(pushCaption());

    const instance: ViewInstance = {
      destroy() {
        // 거둘 타이머도 프레임도 없다 — 애니메이션을 두지 않았다. 남은 것은
        // 캔버스 안의 노드뿐이고, 캔버스 자체는 러너의 것이라 두고 간다.
        svg.textContent = '';
      },

      rebuild(info: {
        level: number;
        pattern: string;
        separator: string;
        text: string;
        joined: string;
      }) {
        build(info.joined, info.pattern.length, info.separator.length);
        setCaption(
          t('caption.start', 'Level {level}. Glue what we seek in front of the text, split by a divider that appears in neither.', {
            level: info.level,
          }),
        );
      },

      async showWhole(step: { index: number; value: number }) {
        setValue(step.index, step.value, false);
        setCaption(
          t('caption.whole', 'The front spot matches the whole joined string — its answer is the full length {n}.', {
            n: step.value,
          }),
        );
      },

      async borrow(step: { index: number; from: number; value: number }) {
        // 거울 자리를 잠깐 도드라지게 하고, 이 자리에 빌린 값을 놓는다.
        const source = boxes[step.from];
        if (source) source.rect.setAttribute('stroke', c.accent);
        setValue(step.index, step.value, true);
        placeCursors(step.from, step.index, false);
        setCaption(
          t('caption.borrow', 'Inside the window. Borrow the answer from the mirror spot {from} on the left.', {
            from: step.from,
          }),
        );
      },

      async scan(step: {
        index: number;
        start: number;
        value: number;
        mismatch: boolean;
        inside: boolean;
      }) {
        // 견준 마지막 짝에 커서를 세운다. 어긋나 멈췄으면 그 자리를 짚는다.
        const k = step.mismatch ? step.value : Math.max(step.start, step.value - 1);
        placeCursors(Math.min(k, n - 1), Math.min(step.index + k, n - 1), true);
        setValue(step.index, step.value, false);
        setCaption(
          step.inside
            ? t('caption.extend', 'The borrowed {k} reached the window edge. Beyond it nothing was ever checked, so compare for real.', {
                k: step.start,
              })
            : t('caption.outside', 'Outside the window. There is nothing to borrow, so compare from the very front.'),
        );
      },

      async moveWindow(step: { left: number; right: number }) {
        win = { left: step.left, right: step.right };
        paintAllCells();
        paintBands();
        setCaption(
          t('caption.window', 'The overlap reached farther right. The window moves to {l}…{r} and its right end never steps back.', {
            l: step.left,
            r: step.right,
          }),
        );
      },

      async markMatch(step: { at: number; index: number }) {
        placeCursors(0, 0, false);
        for (let d = 0; d < off - 1 && step.index + d < n; d += 1) {
          matched[step.index + d] = true;
          paintCell(step.index + d);
        }
        const bar = el('rect', {
          x: cellX(step.index) + 0.5,
          y: HIT_Y,
          width: Math.max(0, cellW * (off - 1) - 1),
          height: HIT_H,
          rx: 2,
          fill: c.itemSorted,
        });
        hitsG.appendChild(bar);
        setCaption(
          t('caption.match', 'This spot holds exactly the length we seek, so the text matches at {at}. No character was read again.', {
            at: step.at,
          }),
        );
      },

      showSummary(info: { borrows: number; saved: number; matches: number }) {
        const first = statValues[0];
        const second = statValues[1];
        const third = statValues[2];
        if (first) first.textContent = String(info.borrows);
        if (second) second.textContent = String(info.saved);
        if (third) third.textContent = String(info.matches);
        setCaption(
          t('caption.summary', 'Borrowed {b} times, saved {s} comparisons, found {m} places.', {
            b: info.borrows,
            s: info.saved,
            m: info.matches,
          }),
        );
      },

      finish() {
        placeCursors(0, 0, false);
        setCaption(pushCaption());
      },

      reset() {
        build('', 0, 0);
        setCaption(pushCaption());
      },
    };

    return instance;
  },
};
