/**
 * between-letter-and-word-stage — 한 문장이 갈라지는 것을 그린다.
 *
 * ── 형태가 어디서 나왔나
 *
 * 동사가 "갈라진다" 이므로 **한 덩이가 실제로 쪼개져 서로 멀어져야** 한다. 그래서
 * 세 줄 모두 같은 문장을 한 장의 타일로 이고 시작하고, 자를 차례가 오면 그 타일이
 * N 장으로 나뉘어 글자와 함께 오른쪽으로 벌어진다. 벌어진 만큼 줄이 길어지므로
 * 줄 끝의 수 (6 · 9 · 28) 가 저절로 층계를 이룬다 — 잰 값을 옆의 계기로 날려
 * 보내지 않고 재는 자리에 둔다 (S-piece).
 *
 * 세 줄이 왼끝을 맞추고 글자 폭을 공유하는 것이 견줌의 기준이다. 자르는 자리가
 * 어디로 옮겨 갔는지는 마지막 걸음에서 조각 줄의 **낱말 안쪽 이음매**를 짚어
 * 보인다.
 *
 * ── 좌표
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로만 여기 상수로 둔다
 * (S-piece). 글자 칸 폭은 상수로 못박지 않고 **가장 넓은 줄(글자 줄)이 캔버스를
 * 채우도록** 역산하며, 상수는 상한으로만 둔다.
 *
 * ── 그리는 방식
 *
 * 걸음마다 부르는 메서드 대신 `render` 하나가 장면을 통째로 세운다. 늘 `rewind()`
 * 로 문장 한 덩이에 돌린 뒤 그 장면이 말하는 것만 다시 그리므로, 어느 걸음에서
 * 어느 걸음으로 가든 같은 길이고 되돌릴 명령이 필요 없다 (S-scene).
 */

import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import type { BetweenScene, RowKey } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로. 캡션 한 줄 + 세 줄 + 이음매 표시가 넘치지 않을 만큼. */
const CANVAS_H = 180;

const CAPTION_Y = 22;
const LABEL_X = 16;
/** 줄이 시작하는 자리. 왼쪽은 표식 라벨 자리다. */
const STRIP_X = 64;
const RIGHT_PAD = 16;
/** 줄 끝과 수 사이. */
const COUNT_GAP = 10;
/** 수가 차지하는 폭. 두 자리까지 든다. */
const COUNT_W = 26;

const ROW_TOP = 44;
const ROW_PITCH = 46;
const TILE_H = 26;

/** 글자 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 16;
/** 자른 자리마다 벌어지는 너비. */
const CUT_GAP = 6;
/** 빈칸은 글자 칸의 절반 남짓. 자른 자리와 달리 처음부터 있다. */
const SPACE_RATIO = 0.45;

const SPLIT_MS = 480;
const SEAM_MS = 320;
const TICK_W = 5;

const ROW_ORDER: readonly RowKey[] = ['word', 'piece', 'letter'];

type Span = readonly [number, number];

type Row = {
  top: number;
  tiles: SVGGElement;
  rects: SVGRectElement[];
  spans: Span[];
  glyphs: SVGTextElement[];
  count: SVGTextElement;
  xs: number[];
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

type Scene = { sentence: string };

/**
 * `initialData` 를 좁히는 자리는 여기다 — 장면이 같은 것을 다시 담지 않는다.
 * 장면이 말하는 것은 문장이 아니라 그 문장이 어떻게 갈렸는가다 (S-piece).
 */
function readScene(initialData: Record<string, unknown> | undefined): Scene {
  const sentence = initialData?.sentence;
  return { sentence: typeof sentence === 'string' ? sentence : '' };
}

export const betweenLetterAndWordStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    // 문안을 만드는 자리가 여기로 왔다 — 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    const root = el('g', {});
    svg.appendChild(root);

    const scene = readScene(params.initialData);
    const letters: string[] = [];
    /** 이 글자 앞에 빈칸이 있었는가. */
    const spaced: boolean[] = [];
    {
      let pending = false;
      for (const ch of scene.sentence) {
        if (ch === ' ') {
          pending = true;
          continue;
        }
        letters.push(ch);
        spaced.push(pending);
        pending = false;
      }
    }

    const spaceCount = spaced.filter(Boolean).length;
    const stripMax = PIECE_CANVAS_W - STRIP_X - COUNT_GAP - COUNT_W - RIGHT_PAD;
    const denom = Math.max(1, letters.length + spaceCount * SPACE_RATIO);
    const maxCuts = Math.max(0, letters.length - 1);
    const cellW = Math.max(
      4,
      Math.min(CELL_MAX_W, Math.floor((stripMax - maxCuts * CUT_GAP) / denom)),
    );
    const spaceW = Math.round(cellW * SPACE_RATIO);
    // 글자 크기는 칸에서 나오는 기하 수치다. 문서 층의 리듬(캡션·라벨)만 토큰을
    // 거친다 (S-view).
    const glyphPx = Math.round(cellW * 1.3);

    const caption = el('text', {
      x: LABEL_X,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.appendChild(caption);

    /** 자른 자리의 집합 → 글자마다의 x (줄 시작을 0 으로 잰 값). */
    function xsFor(cuts: ReadonlySet<number>): number[] {
      const xs: number[] = [];
      let x = 0;
      for (let i = 0; i < letters.length; i += 1) {
        if (i > 0) {
          x += cellW;
          if (spaced[i]) x += spaceW;
          if (cuts.has(i)) x += CUT_GAP;
        }
        xs.push(x);
      }
      return xs;
    }

    function cutsOf(segments: readonly string[]): Set<number> {
      const cuts = new Set<number>();
      let at = 0;
      for (const segment of segments) {
        at += segment.length;
        if (at > 0 && at < letters.length) cuts.add(at);
      }
      return cuts;
    }

    function spansOf(segments: readonly string[]): Span[] {
      const spans: Span[] = [];
      let at = 0;
      for (const segment of segments) {
        spans.push([at, at + segment.length - 1]);
        at += segment.length;
      }
      return spans;
    }

    const rows = new Map<RowKey, Row>();

    function renderTiles(row: Row, xs: readonly number[]): void {
      row.tiles.textContent = '';
      row.rects = row.spans.map(([a, b]) => {
        const rect = el('rect', {
          x: STRIP_X + xs[a],
          y: row.top,
          width: xs[b] + cellW - xs[a],
          height: TILE_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        });
        row.tiles.appendChild(rect);
        return rect;
      });
    }

    function placeRow(row: Row, xs: readonly number[]): void {
      for (let i = 0; i < row.glyphs.length; i += 1) {
        row.glyphs[i].setAttribute('x', String(STRIP_X + xs[i] + cellW / 2));
      }
      for (let j = 0; j < row.rects.length; j += 1) {
        const [a, b] = row.spans[j];
        row.rects[j].setAttribute('x', String(STRIP_X + xs[a]));
        row.rects[j].setAttribute('width', String(xs[b] + cellW - xs[a]));
      }
      const end = letters.length === 0 ? 0 : xs[letters.length - 1] + cellW;
      row.count.setAttribute('x', String(STRIP_X + end + COUNT_GAP));
    }

    function buildRow(key: RowKey, index: number): Row {
      const top = ROW_TOP + index * ROW_PITCH;
      const middle = top + TILE_H / 2;
      const group = el('g', {});

      const label = el('text', {
        x: LABEL_X,
        y: middle,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'dominant-baseline': 'central',
      });
      // 소문자 도식 라벨 한 단어는 표식이다 — 키를 만들지 않는다 (C10).
      label.textContent = key;
      group.appendChild(label);

      const tiles = el('g', {});
      group.appendChild(tiles);

      const glyphGroup = el('g', {});
      const glyphs = letters.map((ch) => {
        const glyph = el('text', {
          x: STRIP_X,
          y: middle,
          'font-family': fonts.mono,
          'font-size': glyphPx,
          fill: colors.text,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        glyph.textContent = ch;
        glyphGroup.appendChild(glyph);
        return glyph;
      });
      group.appendChild(glyphGroup);

      const count = el('text', {
        x: STRIP_X,
        y: middle,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
        'dominant-baseline': 'central',
      });
      group.appendChild(count);

      root.appendChild(group);
      return { top, tiles, rects: [], spans: [], glyphs, count, xs: [] };
    }

    /** 자르기 전 — 문장 한 덩이. */
    function resetRow(row: Row): void {
      row.spans = letters.length === 0 ? [] : [[0, letters.length - 1]];
      row.xs = xsFor(new Set<number>());
      row.count.textContent = '';
      renderTiles(row, row.xs);
      placeRow(row, row.xs);
    }

    ROW_ORDER.forEach((key, index) => {
      const row = buildRow(key, index);
      rows.set(key, row);
      resetRow(row);
    });

    const seamGroup = el('g', {});
    root.appendChild(seamGroup);

    // ── 걸어 둔 것과 기다리는 것 (S-piece)
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * `render` 는 `opts.animate` 로 이미 갈라지지만, 앞 걸음의 프레임이 아직 돌고
     * 있는 중에 사용자가 띠를 끌면 그 프레임이 되짚은 화면 위에 옛 목표를 마저
     * 그린다. 그래서 이 문도 함께 둔다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 규약과 같은 모양, 화면은 그대로).
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    function animate(ms: number, step: (progress: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) {
          step(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const linear = Math.min(1, (Date.now() - started) / ms);
          // 갈라지는 것은 끝에서 잦아든다.
          step(1 - (1 - linear) * (1 - linear));
          if (linear >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    /** 한 줄을 자른 자리대로 세운다. 갈라지는 운동은 `withAnim` 일 때만 보인다. */
    async function cutRow(
      key: RowKey,
      segments: readonly string[],
      withAnim: boolean,
    ): Promise<void> {
      const row = rows.get(key);
      if (!row || destroyed || letters.length === 0 || segments.length === 0) return;

      const from = row.xs;
      const to = xsFor(cutsOf(segments));
      // 새 조각들을 **옛 자리에** 먼저 세운다 — 그래야 갈라지는 순간이 보인다.
      row.spans = spansOf(segments);
      renderTiles(row, from);
      row.count.textContent = String(segments.length);
      placeRow(row, from);

      // 이미 갈라져 있던 줄은 끝 자리에 곧바로 앉힌다 — 되짚을 때 지나온 걸음을
      // 다시 밟으면 그 애니메이션이 되짚기보다 오래 남는다 (S-scene).
      if (withAnim) {
        await animate(SPLIT_MS, (p) => {
          placeRow(
            row,
            from.map((x, i) => x + (to[i] - x) * p),
          );
        });
      }

      row.xs = to;
      placeRow(row, to);
    }

    /**
     * 조각 줄의 낱말 안쪽 이음매를 짚는다.
     *
     * 이 표시는 돋아났다 사라지는 것이 아니라 **남는다.** 그래서 정적으로 오는
     * 길에서도 다 자란 높이로 세워야 되짚었을 때 그대로 서 있다 (S-scene).
     */
    async function markSeams(seams: readonly number[], withAnim: boolean): Promise<void> {
      const row = rows.get('piece');
      if (!row || destroyed) return;

      const ticks = seams
        .filter((at) => at > 0 && at < letters.length)
        .map((at) => {
          const middle = (row.xs[at - 1] + cellW + row.xs[at]) / 2;
          const tick = el('rect', {
            x: STRIP_X + middle - TICK_W / 2,
            y: row.top + TILE_H / 2,
            width: TICK_W,
            height: 0,
            rx: 1,
            fill: colors.accent,
          });
          seamGroup.appendChild(tick);
          return tick;
        });
      if (ticks.length === 0) return;

      const full = TILE_H + 8;
      const draw = (p: number): void => {
        const height = full * p;
        for (const tick of ticks) {
          tick.setAttribute('y', String(row.top + TILE_H / 2 - height / 2));
          tick.setAttribute('height', String(height));
        }
      };
      if (!withAnim) {
        draw(1);
        return;
      }
      await animate(SEAM_MS, draw);
    }

    /** 처음으로 되감는다 — 세 줄이 다시 문장 한 덩이가 되고 이음매가 걷힌다. */
    function rewind(): void {
      seamGroup.textContent = '';
      caption.textContent = '';
      for (const row of rows.values()) resetRow(row);
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: BetweenScene['caption']): void {
      if (!cap) {
        caption.textContent = '';
        return;
      }
      if (cap.kind === 'between') {
        caption.textContent = t(
          'caption.between',
          'Pieces land in between — words {word}, pieces {piece}, letters {letter}.',
          { word: cap.word, piece: cap.piece, letter: cap.letter },
        );
        return;
      }
      if (cap.row === 'word') {
        caption.textContent = t('caption.word', 'Cut at the spaces — words {n}.', { n: cap.n });
        return;
      }
      if (cap.row === 'piece') {
        caption.textContent = t(
          'caption.piece',
          'Same sentence, cut into pieces — pieces {n}.',
          { n: cap.n },
        );
        return;
      }
      caption.textContent = t('caption.letter', 'Cut at every letter — letters {n}.', { n: cap.n });
    }

    /**
     * 장면 하나를 화면에 세운다.
     *
     * 앞 장면과 견주어 달라진 것만 고치지 않는다 — 늘 비우고 전부 세운다. `prev`
     * 는 **무엇을 흐르게 할지 고르는 데만** 쓴다 (S-scene).
     */
    async function render(
      next: BetweenScene,
      prev: BetweenScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      rewind();
      drawCaption(next.caption);

      for (const key of ROW_ORDER) {
        const segments = next.rows[key];
        if (!segments) continue;
        // 방금 갈라진 줄에서만 벌어지는 운동을 보인다. 걸음을 건너뛰어 왔으면
        // 앞 장면에서 이미 갈라져 있으므로 이 잣대에 저절로 걸러진다.
        const justCut = opts.animate && prev !== null && prev.rows[key] === null;
        await cutRow(key, segments, justCut);
      }

      if (next.seams) {
        const justMarked = opts.animate && prev !== null && prev.seams === null;
        await markSeams(next.seams, justMarked);
      }
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
