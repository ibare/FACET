/**
 * prefix-suffix-jump-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다
 * (S-scene).
 *
 * ── 화면은 두 층이다
 *
 *   위   패턴 한 줄, 그 아래로 **펴진 복제** 한 줄, 그 아래 표 한 줄.
 *        복제가 오른쪽으로 한 칸씩 밀리며 겹치는 칸을 견주고, 정해진 값이
 *        패턴 칸에서 표 칸으로 떨어진다. 밀어 본 자리마다 **시험 자국**이 남아,
 *        몇 번을 밀어 보고 나서 그 값을 얻었는지가 화면에 선다.
 *   아래 텍스트 한 줄, 그 아래를 미끄러지는 **패턴 덩어리**.
 *        어긋나면 표에서 선이 내려와 밀 거리를 말하고, 덩어리가 그만큼 날아간다.
 *        건너뛴 자리에는 가 보지 않은 자국이 남는다.
 *
 * 두 층이 같은 칸 격자를 쓴다. 위에서 민 거리와 아래에서 민 거리가 같은 자로
 * 읽혀야 "겹친 만큼만 민다" 가 한 문장이 되기 때문이다.
 *
 * ── 채움과 테두리를 갈랐다
 *
 * 옛 화면은 칸의 형편을 `'default' | 'ghost' | 'compare' | 'same' | 'differ' | 'kept'`
 * 여섯으로 **한 축에** 실었다. 그래서 통째로 맞은 마지막 화면에서 여섯 칸이 전부
 * `same` 이 되며 **"이 둘은 물려받아 다시 보지 않았다"** 가 지워졌다 — 그것이 이
 * 조각이 하려는 말인데도 그랬다.
 *
 * 지금은 두 축이다.
 *
 * - **채움(fill·글자색) = 값의 형편** — 아무것도 아님 / 복제다 / 견주는 중 / 같다 / 다르다.
 * - **테두리(stroke·굵기) = 짚음의 표식** — 물려받아 **다시 보지 않은** 글자.
 *
 * 둘이 서로 다른 축에 있으므로 "맞았다" 와 "다시 보지 않았다" 가 한 칸에 함께 선다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 복제가 몇 칸 밀렸나는 `let ghostShift` 에, 덩어리가 어느 칸에 있나는 `let blockAt` 에,
 * 띠가 어디까지 벌어졌나는 **`band` 의 `width` 속성을 도로 읽어** 얻었고, 덩어리가
 * 이미 떴나는 **`blockGroup` 의 `opacity` 속성**이 답했고, 건너뛴 자리는 `skipLayer`
 * 의 **자식 노드**로만 쌓였고, 표의 값은 칸의 `textContent` 로만 있었다. 이제 전부
 * 장면이 말하고 이 파일은 그것을 그린다 (`scene.ts` 의 "옛 자리").
 *
 * ── 좌표
 *
 * 가로는 `PIECE_CANVAS_W` 에서 역산한다 — 칸 폭은 상한만 상수로 두고 남는 폭을
 * 여백으로 버리지 않는다 (S-piece). 세로는 그림이 정하는 값이라 이 파일이 상수로
 * 갖는다 (S-view).
 *
 * 문안은 `params.t` 로 만든다. 장면은 무엇을 말할지와 인자만 담는다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  borrowAt,
  captionOf,
  currentShift,
  focusIndex,
  shiftFor,
  type PrefixSuffixJumpScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 좌우로 남길 최소 여백. 칸 폭은 이 안에서 역산한다 (S-piece). */
const SIDE_MIN = 26;
/** 칸 폭의 상한. 못박는 값이 아니라 위쪽 한계다. */
const CELL_MAX_W = 56;
/** 칸 사이의 틈. */
const CELL_GAP = 6;
const CELL_H = 42;
const FAIL_H = 26;

const BAND_Y = 20;
const PATTERN_Y = 26;
/** 밀어 본 자리에 남는 시험 자국의 높이. 패턴 줄과 복제 줄 사이다. */
const TRY_MARK_Y = 72;
const TRY_MARK_R = 3;
const GHOST_Y = 78;
const FAIL_Y = 132;
const DIVIDER_Y = 172;
const TEXT_Y = 184;
const BLOCK_Y = 234;
const CAPTION_Y = 292;

// 걸음 안의 시간. 걸음 사이의 정지(stepMs)는 선언이 지고, 여기 있는 것은
// 그 걸음이 화면에서 일어나는 데 드는 시간이다.
const FRAME_MS = 16;
const SLIDE_MS = 180;
const FLASH_MS = 120;
const COMPARE_MS = 160;
const HOLD_MS = 180;
const FOLD_MS = 220;
const DROP_MS = 240;
const CHAR_MS = 160;
const LINE_MS = 240;
const JUMP_MS = 360;
const LIFT_MS = 280;

/** 표에서 덩어리로 내려오는 선의 길이 — 그리는 운동의 눈금으로만 쓴다. */
const LINK_DASH = 400;

/**
 * 칸의 **형편** — 값이 지금 어떤가. 채움과 글자색이 이 축을 진다.
 *
 * 어디에도 저장하지 않고 걸음마다 장면에서 파생한다.
 */
type Tone = 'idle' | 'ghost' | 'probing' | 'same' | 'differ';

/**
 * 칸의 **표식** — 짚었나 짚지 않았나. 테두리가 이 축을 진다.
 *
 * `kept` 는 앞 정렬에서 맞은 것을 물려받아 **이번에 다시 보지 않은** 글자다.
 * 형편과 다른 축이라 "맞았다" 와 겹쳐 칠해도 서로를 지우지 않는다.
 */
type Mark = 'none' | 'kept';

type Cell = { rect: SVGRectElement; ink: SVGTextElement };

/** 자리 셈. 장면의 바탕 둘에서 캔버스를 역산한다. */
type Geom = {
  cols: number;
  cellW: number;
  innerW: number;
  colX(i: number): number;
  cellX(i: number): number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  patternCells: Cell[];
  /** 복제 줄. 몸을 거둔 뒤에는 비어 있다. */
  ghostCells: Cell[];
  ghostGroup: SVGGElement | null;
  band: SVGRectElement | null;
  /** 밀어 본 자리의 자국. 마지막 하나가 답이라 속이 찬다. */
  tryMarks: SVGCircleElement[];
  failCells: Cell[];
  textCells: Cell[];
  blockCells: Cell[];
  blockGroup: SVGGElement | null;
  /** 건너뛴 정렬 자리의 자국. */
  skipMarks: SVGGElement[];
  /** 표에서 덩어리로 내려온 선. 빌리는 걸음에만 있다. */
  link: SVGPathElement | null;
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

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

export const prefixSuffixJumpStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<PrefixSuffixJumpScene> {
    const colors: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 켜 (뒤에서 앞으로). 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gBack = el('g', {});
    const gSkip = el('g', {});
    const gBand = el('g', {});
    const gUpper = el('g', {});
    const gLower = el('g', {});
    const gLink = el('g', {});
    const gBlock = el('g', {});
    const gFloat = el('g', {});
    const gText = el('g', {});
    svg.append(gBack, gSkip, gBand, gUpper, gLower, gLink, gBlock, gFloat, gText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 이어 달리므로, 그 사이에 `destroy` 나 다음 걸음이
     * 끼어들면 남은 마디가 **이미 새로 선 화면**을 덮는다. `isInstant` 는 빗장이
     * 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function wait(ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
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

    function animate(ms: number, mine: number, apply: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) return finish();
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          apply(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function geomOf(scene: PrefixSuffixJumpScene): Geom {
      const m = scene.base.pattern.length;
      const n = scene.base.text.length;
      // 텍스트 한 줄과, 복제가 제 길이만큼 더 밀려 갈 자리를 함께 담는다.
      const cols = Math.max(n, m * 2);
      // 칸 폭은 상한만 상수다. 남는 폭을 여백으로 버리지 않는다 (S-piece).
      const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cols));
      const originX = Math.round((W - cols * cellW) / 2);
      return {
        cols,
        cellW,
        innerW: cellW - CELL_GAP,
        colX: (i) => originX + i * cellW,
        cellX: (i) => originX + i * cellW + CELL_GAP / 2,
      };
    }

    // ── 칠 ───────────────────────────────────────────────────────────────

    /** 형편은 채움이 진다. 테두리는 여기서 밑칠만 하고 표식이 덮어쓴다. */
    function paint(cell: Cell, tone: Tone, mark: Mark): void {
      const skin: Record<Tone, { fill: string; stroke: string; ink: string; dash: string }> = {
        idle: { fill: colors.itemDefault, stroke: colors.border, ink: colors.text, dash: '' },
        ghost: {
          fill: colors.bgSubtle,
          stroke: colors.textMuted,
          ink: colors.textMuted,
          dash: '5 3',
        },
        probing: {
          fill: colors.itemComparing,
          stroke: colors.itemComparing,
          ink: colors.stateInk,
          dash: '',
        },
        same: { fill: colors.itemPivot, stroke: colors.itemPivot, ink: colors.stateInk, dash: '' },
        differ: {
          fill: colors.itemSwapping,
          stroke: colors.itemSwapping,
          ink: colors.stateInk,
          dash: '',
        },
      };
      const s = skin[tone];
      cell.rect.setAttribute('fill', s.fill);
      cell.rect.setAttribute('stroke-dasharray', s.dash);
      cell.ink.setAttribute('fill', s.ink);
      // 표식은 테두리에만 산다 — 채움을 건드리지 않으므로 형편을 지우지 않는다.
      cell.rect.setAttribute('stroke', mark === 'kept' ? colors.itemSorted : s.stroke);
      cell.rect.setAttribute('stroke-width', mark === 'kept' ? '3' : '1.5');
    }

    /** 표 칸 — 채움이 "값이 찼나", 테두리가 "이번에 이 칸을 빌려 쓴다". */
    function paintFail(cell: Cell, filled: boolean, lit: boolean): void {
      cell.rect.setAttribute('fill', filled ? colors.bgSubtle : colors.bg);
      cell.rect.setAttribute('stroke-dasharray', filled ? '' : '4 3');
      cell.rect.setAttribute('stroke', lit ? colors.itemPivot : colors.border);
      cell.rect.setAttribute('stroke-width', lit ? '3' : '1.5');
      cell.ink.setAttribute('fill', colors.text);
    }

    // ── 조각 짓기 ─────────────────────────────────────────────────────────

    function makeCell(
      parent: SVGElement,
      geom: Geom,
      col: number,
      y: number,
      glyph: string,
    ): Cell {
      const rect = el('rect', {
        x: geom.cellX(col),
        y,
        width: geom.innerW,
        height: CELL_H,
        rx: 7,
      });
      const ink = el('text', {
        x: geom.cellX(col) + geom.innerW / 2,
        y: y + CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      ink.textContent = glyph;
      parent.append(rect, ink);
      return { rect, ink };
    }

    function makeSkipMark(geom: Geom, col: number): SVGGElement {
      const g = el('g', { opacity: 0.4 });
      g.appendChild(
        el('rect', {
          x: geom.cellX(col),
          y: BLOCK_Y,
          width: geom.innerW,
          height: CELL_H,
          rx: 7,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      g.appendChild(
        el('line', {
          x1: geom.cellX(col) + 6,
          y1: BLOCK_Y + CELL_H - 6,
          x2: geom.cellX(col) + geom.innerW - 6,
          y2: BLOCK_Y + 6,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        }),
      );
      return g;
    }

    function place(group: SVGGElement, dx: number, dy: number): void {
      group.setAttribute('transform', `translate(${dx} ${dy})`);
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    function captionText(scene: PrefixSuffixJumpScene): string {
      const c = captionOf(scene);
      if (c === null) return '';
      switch (c.kind) {
        case 'lookPrefix':
          return t('caption.lookPrefix', 'Looking at the first {n} letters.', { n: c.n });
        case 'overlapSame':
          return t('caption.overlapSame', 'Overlap of {n}: the head and the tail are the same.', {
            n: c.n,
          });
        case 'overlapDiffer':
          return t('caption.overlapDiffer', 'Overlap of {n}: the head and the tail differ.', {
            n: c.n,
          });
        case 'noOverlap':
          return t('caption.noOverlap', 'Slid all the way past — nothing overlaps.');
        case 'tableTakes':
          return t('caption.tableTakes', 'The table takes {n}.', { n: c.n });
        case 'matchedThenDiffer':
          return t('caption.matchedThenDiffer', '{n} letters match, then the next one differs.', {
            n: c.n,
          });
        case 'fullMatch':
          return t('caption.fullMatch', 'Every letter of the pattern matches.');
        case 'borrowOverlap':
          return t(
            'caption.borrowOverlap',
            'The matched part ends with the same {n} letters it starts with.',
            { n: c.n },
          );
        case 'slideBy':
          return t('caption.slideBy', 'Slide {n} and keep the overlap as already matched.', {
            n: c.n,
          });
        case 'slideOne':
          return t('caption.slideOne', 'Nothing matched here, so slide one.');
        case 'found':
          return t('caption.found', 'The pattern sits at {i}.', { i: c.i });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /**
     * 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene).
     *
     * 켜 자신에게는 아무 속성도 달지 않는다. 자식을 비워도 레이어의 `opacity` 나
     * `transform` 은 남으므로, 미끄러지고 흐려지는 것은 전부 켜 **안쪽**의 무리에
     * 달고 그 무리는 걸음마다 새로 짓는다 (프로토콜 4 절 "재건 밖 요소").
     */
    function rewind(): void {
      for (const layer of [gBack, gSkip, gBand, gUpper, gLower, gLink, gBlock, gFloat, gText]) {
        layer.textContent = '';
      }
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 앞 장면과 견주어 달라진 것만 고치지 않는다 — 어느 걸음에서 오든 결과가 같아야
     * 되돌릴 명령을 따로 둘 필요가 없다 (S-scene).
     */
    function drawStatic(scene: PrefixSuffixJumpScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const pattern = scene.base.pattern;
      const text = scene.base.text;
      const m = pattern.length;
      const n = text.length;

      gBack.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }));

      const hunt = scene.hunt;
      const fold = scene.fold;
      const end = focusIndex(scene);

      // ── 건너뛴 자리의 자국. 쌓이고 지워지지 않는다 — 이 조각의 결론이다.
      const skipMarks: SVGGElement[] = [];
      if (hunt !== null) {
        for (const col of hunt.skips) {
          const mark = makeSkipMark(geom, col);
          gSkip.appendChild(mark);
          skipMarks.push(mark);
        }
      }

      // ── 지금 보고 있는 조각을 감싸는 띠.
      let band: SVGRectElement | null = null;
      if (end !== null && end >= 0) {
        band = el('rect', {
          x: geom.cellX(0) - 5,
          y: BAND_Y,
          width: end * geom.cellW + geom.innerW + 10,
          height: CELL_H + 12,
          rx: 10,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        });
        gBand.appendChild(band);
      }

      // ── 패턴 한 줄 — 접히는 몸.
      const patternCells: Cell[] = [];
      for (let i = 0; i < m; i += 1) {
        patternCells.push(makeCell(gUpper, geom, i, PATTERN_Y, pattern[i] ?? ''));
      }

      // 지금 견주고 있는 겹침의 판정. 시험이 끝나 값이 앉았으면 남기지 않는다.
      const trying = fold !== null && !fold.settled ? fold.tries[fold.tries.length - 1] : undefined;
      const shift = currentShift(scene);
      for (let i = 0; i < m; i += 1) {
        const cell = patternCells[i];
        if (cell === undefined) continue;
        const inTail =
          trying !== undefined && i >= shift && i < shift + trying.border && trying.border > 0;
        paint(cell, inTail ? (trying.matched ? 'same' : 'differ') : 'idle', 'none');
      }

      // ── 밀어 본 자리의 시험 자국. 속이 빈 것은 헛걸음, 찬 것이 답이다.
      const tryMarks: SVGCircleElement[] = [];
      if (fold !== null && end !== null && end >= 0) {
        for (const item of fold.tries) {
          const col = shiftFor(end, item.border);
          const dot = el('circle', {
            cx: geom.cellX(col) + geom.innerW / 2,
            cy: TRY_MARK_Y,
            r: TRY_MARK_R,
            fill: item.matched ? colors.itemPivot : 'none',
            stroke: item.matched ? colors.itemPivot : colors.textMuted,
            'stroke-width': 1.2,
          });
          gUpper.appendChild(dot);
          tryMarks.push(dot);
        }
      }

      // ── 펴진 복제. 값이 앉으면 몸을 거두므로 짓지 않는다.
      const ghostCells: Cell[] = [];
      let ghostGroup: SVGGElement | null = null;
      if (fold !== null && !fold.settled && end !== null && end >= 0) {
        ghostGroup = el('g', {});
        gUpper.appendChild(ghostGroup);
        for (let i = 0; i <= end; i += 1) {
          const cell = makeCell(ghostGroup, geom, i, GHOST_Y, pattern[i] ?? '');
          const inHead = trying !== undefined && i < trying.border;
          paint(cell, inHead ? (trying.matched ? 'same' : 'differ') : 'ghost', 'none');
          ghostCells.push(cell);
        }
        place(ghostGroup, shift * geom.cellW, 0);
      }

      // ── 표 한 줄.
      const lit = borrowAt(scene);
      const failCells: Cell[] = [];
      for (let i = 0; i < m; i += 1) {
        const rect = el('rect', {
          x: geom.cellX(i),
          y: FAIL_Y,
          width: geom.innerW,
          height: FAIL_H,
          rx: 5,
        });
        const ink = el('text', {
          x: geom.cellX(i) + geom.innerW / 2,
          y: FAIL_Y + FAIL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
        const value = scene.fails[i];
        ink.textContent = value === undefined ? '' : String(value);
        gUpper.append(rect, ink);
        const cell: Cell = { rect, ink };
        paintFail(cell, value !== undefined, lit === i);
        failCells.push(cell);
      }

      gLower.appendChild(
        el('line', {
          x1: geom.colX(0),
          y1: DIVIDER_Y,
          x2: geom.colX(n),
          y2: DIVIDER_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // ── 텍스트 한 줄.
      const textCells: Cell[] = [];
      for (let i = 0; i < n; i += 1) {
        textCells.push(makeCell(gLower, geom, i, TEXT_Y, text[i] ?? ''));
      }

      // ── 덩어리와 텍스트의 칠. 물려받은 글자는 테두리가 따로 말한다.
      const blockCells: Cell[] = [];
      let blockGroup: SVGGElement | null = null;
      if (hunt !== null) {
        blockGroup = el('g', {});
        gBlock.appendChild(blockGroup);
        for (let i = 0; i < m; i += 1) {
          blockCells.push(makeCell(blockGroup, geom, i, BLOCK_Y, pattern[i] ?? ''));
        }
        place(blockGroup, hunt.align * geom.cellW, 0);
      }

      for (let i = 0; i < n; i += 1) {
        const cell = textCells[i];
        if (cell !== undefined) paint(cell, 'idle', 'none');
      }
      if (hunt !== null) {
        const scan = hunt.scan;
        // 아직 견주기 전이면 물려받은 앞 글자까지만 맞은 것으로 선다.
        const matched = hunt.found ? m : (scan?.matched ?? hunt.keep);
        // 어긋난 자리는 **견주어 본 걸음에만** 있다. 밀고 나서 아직 안 본 칸은
        // 어긋난 것이 아니라 아무것도 아니다.
        const mismatch = !hunt.found && scan !== null && scan.matched < m ? scan.matched : -1;
        for (let i = 0; i < m; i += 1) {
          const tone: Tone = i < matched ? 'same' : i === mismatch ? 'differ' : 'idle';
          // 앞 정렬에서 맞은 것을 물려받아 이번에 다시 보지 않은 글자.
          const mark: Mark = i < hunt.keep ? 'kept' : 'none';
          const head = blockCells[i];
          const under = textCells[hunt.align + i];
          if (head !== undefined) paint(head, tone, mark);
          if (under !== undefined && tone !== 'idle') paint(under, tone, mark);
        }
      }

      // ── 표에서 덩어리로 내려오는 선 — 밀 거리를 말해 주는 자리다.
      let link: SVGPathElement | null = null;
      if (hunt !== null && lit !== null && lit >= 0) {
        const x1 = geom.cellX(lit) + geom.innerW / 2;
        const y1 = FAIL_Y + FAIL_H;
        const x2 = geom.cellX(hunt.align) + geom.innerW / 2;
        const y2 = BLOCK_Y;
        const mid = (y1 + y2) / 2;
        link = el('path', {
          d: `M ${x1} ${y1} Q ${x1} ${mid} ${(x1 + x2) / 2} ${mid} T ${x2} ${y2}`,
          fill: 'none',
          stroke: colors.itemPivot,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        gLink.appendChild(link);
      }

      // ── 캡션.
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      caption.textContent = captionText(scene);
      gText.appendChild(caption);

      return {
        geom,
        patternCells,
        ghostCells,
        ghostGroup,
        band,
        tryMarks,
        failCells,
        textCells,
        blockCells,
        blockGroup,
        skipMarks,
        link,
      };
    }

    // ── 운동. 정적 그리기가 끝 자리를 세웠으므로 아직 못 온 만큼을 뒤로 물린다 ──

    /** 접었던 몸이 패턴 줄에서 아래로 펴지고, 띠가 보는 만큼 벌어진다. */
    async function flowFocus(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const end = focusIndex(scene);
      const ghost = drawn.ghostGroup;
      const band = drawn.band;
      if (end === null || ghost === null || band === null) return;

      // 출발 폭은 **앞 자리**에서 셈한다. 화면의 속성을 도로 읽지 않는다 (S-scene).
      const toW = end * drawn.geom.cellW + drawn.geom.innerW + 10;
      const fromW = end === 0 ? drawn.geom.innerW + 10 : (end - 1) * drawn.geom.cellW + drawn.geom.innerW + 10;
      const fromOpacity = end === 0 ? 0 : 1;
      const drop = GHOST_Y - PATTERN_Y;

      await animate(FOLD_MS, mine, (e) => {
        band.setAttribute('opacity', String(lerp(fromOpacity, 1, e)));
        band.setAttribute('width', String(lerp(fromW, toW, e)));
        ghost.setAttribute('opacity', String(e));
        place(ghost, currentShift(scene) * drawn.geom.cellW, lerp(-drop, 0, e));
      });
    }

    /** 복제가 한 칸 더 밀려 가 겹치는 칸을 견준다. */
    async function flowTry(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const fold = scene.fold;
      const end = focusIndex(scene);
      const ghost = drawn.ghostGroup;
      if (fold === null || end === null || ghost === null) return;
      const tries = fold.tries;
      const last = tries[tries.length - 1];
      if (last === undefined) return;
      const before = tries[tries.length - 2];
      const fromShift = before === undefined ? 0 : shiftFor(end, before.border);
      const toShift = shiftFor(end, last.border);

      // 미끄러지는 동안은 아직 아무것도 견주지 않았다. 여기까지 동기라 번쩍이지 않는다.
      for (const cell of drawn.patternCells) paint(cell, 'idle', 'none');
      for (const cell of drawn.ghostCells) paint(cell, 'ghost', 'none');
      const fresh = drawn.tryMarks[tries.length - 1];
      fresh?.setAttribute('opacity', '0');

      await animate(SLIDE_MS, mine, (e) => {
        place(ghost, lerp(fromShift, toShift, e) * drawn.geom.cellW, 0);
        fresh?.setAttribute('opacity', String(e));
      });
      if (!alive(mine)) return;

      if (last.border === 0) {
        // 끝까지 밀었다 — 겹칠 것이 없으니 견줄 칸도 없다.
        await wait(HOLD_MS, mine);
        return;
      }

      for (let i = 0; i < last.border; i += 1) {
        const head = drawn.ghostCells[i];
        const tail = drawn.patternCells[toShift + i];
        if (head !== undefined) paint(head, 'probing', 'none');
        if (tail !== undefined) paint(tail, 'probing', 'none');
      }
      await wait(last.matched ? COMPARE_MS : FLASH_MS, mine);
      if (!alive(mine)) return;

      const verdict: Tone = last.matched ? 'same' : 'differ';
      for (let i = 0; i < last.border; i += 1) {
        const head = drawn.ghostCells[i];
        const tail = drawn.patternCells[toShift + i];
        if (head !== undefined) paint(head, verdict, 'none');
        if (tail !== undefined) paint(tail, verdict, 'none');
      }
      await wait(last.matched ? HOLD_MS : FLASH_MS, mine);
    }

    /** 정해진 값이 패턴 칸에서 표 칸으로 떨어지고, 접었던 몸을 거둔다. */
    async function flowSettle(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const end = focusIndex(scene);
      if (end === null || end < 0) return;
      const value = scene.fails[end];
      const target = drawn.failCells[end];
      if (value === undefined || target === undefined) return;
      const geom = drawn.geom;

      const falling = el('text', {
        x: geom.cellX(end) + geom.innerW / 2,
        y: PATTERN_Y + CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      falling.textContent = String(value);
      gFloat.appendChild(falling);
      target.ink.setAttribute('opacity', '0');

      const fromY = PATTERN_Y + CELL_H / 2;
      const toY = FAIL_Y + FAIL_H / 2;
      await animate(DROP_MS, mine, (e) => {
        falling.setAttribute('y', String(lerp(fromY, toY, e)));
      });
      if (!alive(mine)) return;
      falling.remove();
      target.ink.removeAttribute('opacity');

      // 몸을 거둔다. 정적 그리기는 이미 거둔 화면이라 여기서만 잠깐 짓는다.
      const ghost = el('g', {});
      gFloat.appendChild(ghost);
      for (let i = 0; i <= end; i += 1) {
        const cell = makeCell(ghost, geom, i, GHOST_Y, scene.base.pattern[i] ?? '');
        paint(cell, 'ghost', 'none');
      }
      const shift = currentShift(scene);
      const drop = GHOST_Y - PATTERN_Y;
      place(ghost, shift * geom.cellW, 0);
      await animate(FOLD_MS, mine, (e) => {
        ghost.setAttribute('opacity', String(1 - e));
        place(ghost, shift * geom.cellW, lerp(0, -drop, e));
      });
      ghost.remove();
    }

    /** 덩어리 아래 글자를 하나씩 이어 견준다. 물려받은 앞 글자는 건드리지 않는다. */
    async function flowScan(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const hunt = scene.hunt;
      const block = drawn.blockGroup;
      if (hunt === null || hunt.scan === null || block === null) return;
      const m = scene.base.pattern.length;
      const matched = hunt.scan.matched;

      // 처음 서는 덩어리는 나타나며 앉는다. 두 번째부터는 이미 서 있다.
      if (hunt.align === 0 && hunt.keep === 0) {
        block.setAttribute('opacity', '0');
        await animate(FLASH_MS, mine, (e) => block.setAttribute('opacity', String(e)));
        if (!alive(mine)) return;
        block.removeAttribute('opacity');
      }

      // 아직 안 본 글자를 도로 재운다. 물려받은 앞 글자는 그대로 둔다.
      for (let i = hunt.keep; i < m; i += 1) {
        const head = drawn.blockCells[i];
        const under = drawn.textCells[hunt.align + i];
        if (head !== undefined) paint(head, 'idle', 'none');
        if (under !== undefined) paint(under, 'idle', 'none');
      }

      for (let k = hunt.keep; k < matched; k += 1) {
        const head = drawn.blockCells[k];
        const under = drawn.textCells[hunt.align + k];
        if (head !== undefined) paint(head, 'probing', 'none');
        if (under !== undefined) paint(under, 'probing', 'none');
        await wait(CHAR_MS, mine);
        if (!alive(mine)) return;
        if (head !== undefined) paint(head, 'same', 'none');
        if (under !== undefined) paint(under, 'same', 'none');
      }

      if (matched < m) {
        const head = drawn.blockCells[matched];
        const under = drawn.textCells[hunt.align + matched];
        if (head !== undefined) paint(head, 'differ', 'none');
        if (under !== undefined) paint(under, 'differ', 'none');
      }
      await wait(HOLD_MS, mine);
    }

    /** 표의 그 칸에서 덩어리로 선이 내려온다. */
    async function flowBorrow(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const hunt = scene.hunt;
      const link = drawn.link;
      if (hunt === null || hunt.borrow === null || hunt.scan === null || link === null) return;
      const matched = hunt.scan.matched;
      const border = hunt.borrow;

      // 선이 닿기 전에는 앞 조각과 뒤 조각이 아직 한 짝으로 묶이지 않았다.
      for (let i = 0; i < border; i += 1) {
        const head = drawn.blockCells[i];
        const tail = drawn.blockCells[matched - border + i];
        if (head !== undefined) paint(head, 'same', i < hunt.keep ? 'kept' : 'none');
        if (tail !== undefined) paint(tail, 'same', 'none');
      }

      link.setAttribute('stroke-dasharray', String(LINK_DASH));
      link.setAttribute('stroke-dashoffset', String(LINK_DASH));
      await animate(LINE_MS, mine, (e) => {
        link.setAttribute('stroke-dashoffset', String(LINK_DASH * (1 - e)));
      });
      if (!alive(mine)) return;
      // 되돌릴 때는 보간값이 아니라 속성을 통째로 거둔다 (S-scene).
      link.removeAttribute('stroke-dashoffset');
      link.removeAttribute('stroke-dasharray');
      await wait(HOLD_MS, mine);
    }

    /** 덩어리가 겹친 만큼만 날아가고, 지나친 자리에 자국이 남는다. */
    async function flowJump(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
      from: number,
    ): Promise<void> {
      const hunt = scene.hunt;
      const block = drawn.blockGroup;
      if (hunt === null || block === null) return;
      const to = hunt.align;
      // 이번에 새로 남는 자국만 뒤로 물린다. 앞서 쌓인 것은 이미 서 있다.
      const fresh = drawn.skipMarks.slice(hunt.skips.length - Math.max(0, to - from - 1));
      for (const mark of fresh) mark.setAttribute('opacity', '0');

      await animate(JUMP_MS, mine, (e) => {
        place(block, lerp(from, to, e) * drawn.geom.cellW, -10 * Math.sin(e * Math.PI));
        for (const mark of fresh) mark.setAttribute('opacity', String(0.4 * e));
      });
      if (!alive(mine)) return;
      await wait(HOLD_MS, mine);
    }

    /** 통째로 맞았다. 덩어리가 한 번 들렸다 앉는다. */
    async function flowFound(
      scene: PrefixSuffixJumpScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const hunt = scene.hunt;
      const block = drawn.blockGroup;
      if (hunt === null || block === null) return;
      // 가로 자리는 장면이 말한다. 화면의 `transform` 을 도로 읽지 않는다 (S-scene).
      const dx = hunt.align * drawn.geom.cellW;
      await animate(LIFT_MS, mine, (e) => {
        place(block, dx, -8 * Math.sin(e * Math.PI));
      });
      if (!alive(mine)) return;
      await wait(HOLD_MS, mine);
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: PrefixSuffixJumpScene,
      _prev: PrefixSuffixJumpScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'focus':
          await flowFocus(next, drawn, mine);
          break;
        case 'try':
          await flowTry(next, drawn, mine);
          break;
        case 'settle':
          await flowSettle(next, drawn, mine);
          break;
        case 'scan':
          await flowScan(next, drawn, mine);
          break;
        case 'borrow':
          await flowBorrow(next, drawn, mine);
          break;
        case 'jump':
          await flowJump(next, drawn, mine, step.from);
          break;
        case 'found':
          await flowFound(next, drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 `opacity` 와 좌표 끝자리, 잠깐 지은 조각이 통째로 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 타이머는 콜백을 아예 부르지 않으므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
