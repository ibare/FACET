/**
 * 서브워드 분할 stage — 문장 한 줄이 타일로 놓이고, 규칙이 먹을 때마다 타일들이
 * **서로에게 미끄러져** 합쳐지며 줄이 짧아진다.
 *
 * ── 이 화면의 동사는 "뭉친다"
 *
 * 값을 갈아 끼우는 재그리기로는 그 동사가 일어나지 않는다. 그래서 걸음마다
 * 두 벌의 배치(앞 줄 · 뒤 줄)를 셈해 **모든 타일을 제 자리로 옮기는 애니메이션**을
 * 돌린다. 합쳐지는 짝은 서로에게 다가가 겹치고, 그 뒤 타일 하나로 바뀐다.
 * 나머지 타일도 왼쪽으로 당겨지므로 줄 전체가 눈에 띄게 짧아진다.
 *
 * ── 줄어든 것을 어디에 견주는가
 *
 * 줄이 짧아지는 것은 견줄 것이 있어야 보인다. 그래서 **병합이 없을 때의 끝자리**에
 * 점선 눈금을 박아 두고 (마운트 때 한 번 정해 움직이지 않는다), 그 아래 길이 막대가
 * 줄과 함께 줄어든다.
 *
 * ── 세로는 마운트 뒤 바뀌지 않는다 (S-view)
 *
 * `canvas` 로 선언한 높이를 그대로 쓰고 `viewBox` 를 다시 재지 않는다. 타일 수가
 * 33 에서 7 까지 변해도 줄은 한 줄이고 높이가 달라지지 않는다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스. 완제품이라 글 폭보다 넓게 쓴다. */
const CANVAS_W = 760;
const CANVAS_H = 210;
/** 줄의 좌우 여백. */
const SIDE = 28;
/** 타일 사이 틈과 타일 안 좌우 여백. */
const GAP = 3;
const PAD = 3;
/** 글자 한 칸의 **상한**. 실제 값은 캔버스 폭에서 역산한다. */
const CHAR_W_MAX = 10;
const ROW_Y = 52;
const TILE_H = 44;
const BAR_Y = 120;
const BAR_H = 6;
const RULE_Y = 156;
const CAPTION_Y = 184;
const CAPTION_LEAD = 17;
/** 캡션 한 줄에 담는 글자 수. 넘치면 두 줄로 나눈다. */
const CAPTION_WRAP = 70;
/** 애니메이션 프레임 간격. */
const FRAME_MS = 16;

/** 이 stage 가 `initialData` 에서 읽는 것 — 좁히는 자리는 여기 하나다. */
export type SubwordScene = { sentence: string; endMark: string };

/** 한 걸음의 결과. projector 가 좁혀서 넘긴다 (C9). */
export type SubwordMergeFrame = {
  pieces: string[];
  /** 앞 조각 열에서 합쳐진 짝의 왼쪽 자리. */
  mergedAt: number[];
};

/**
 * `initialData` 를 좁힌다. projector 도 같은 함수를 불러 쓴다 — 좁히는 규칙이
 * 두 벌이 되지 않게.
 */
export function readSubwordScene(raw: unknown): SubwordScene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    sentence: typeof d.sentence === 'string' ? d.sentence : '',
    endMark: typeof d.endMark === 'string' ? d.endMark : '</w>',
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 들어오고 나가는 속도를 죽인 보간. */
function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

/** 캡션을 두 줄까지 나눈다. 넘치는 말을 버리지는 않는다. */
function wrapCaption(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line === '' ? w : `${line} ${w}`;
    if (candidate.length > max && line !== '') {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line !== '') lines.push(line);
  if (lines.length <= 2) return lines;
  return [lines[0] as string, lines.slice(1).join(' ')];
}

type Tile = {
  width: number;
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
};

export const subwordSegmentationStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너에는 손대지 않는다. 러너가 캔버스를 이미 거기 붙여 두었고, 이 stage 가
    // 그리는 것은 전부 그 캔버스 안이다.
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readSubwordScene(params.initialData);

    const glyphsOf = (piece: string): string =>
      scene.endMark === '' ? piece : piece.split(scene.endMark).join('_');

    /** 병합이 하나도 없을 때의 줄 — 낱글자와 끝 표식. */
    const opening: string[] = [];
    for (const word of scene.sentence.split(' ')) {
      if (word === '') continue;
      opening.push(...word.split(''), scene.endMark);
    }

    const openGlyphs = opening.reduce((n, p) => n + glyphsOf(p).length, 0);
    const charW = Math.max(
      4,
      Math.min(
        CHAR_W_MAX,
        Math.floor(
          (CANVAS_W - SIDE * 2 - GAP * Math.max(0, opening.length - 1) - PAD * 2 * opening.length) /
            Math.max(1, openGlyphs),
        ),
      ),
    );

    function measure(pieces: readonly string[]): {
      widths: number[];
      xs: number[];
      total: number;
    } {
      const widths = pieces.map((p) => glyphsOf(p).length * charW + PAD * 2);
      const xs: number[] = [];
      let x = SIDE;
      for (const w of widths) {
        xs.push(x);
        x += w + GAP;
      }
      return { widths, xs, total: pieces.length === 0 ? 0 : x - SIDE - GAP };
    }

    const openSpan = measure(opening).total;
    const tickX = SIDE + openSpan;

    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      t(
        'label.aria',
        'Subword segmentation: the sentence as tiles that slide together into fewer, longer pieces as the merge count grows',
      ),
    );

    // ── 바탕 — 눈금과 길이 막대는 타일 뒤에 깔린다.
    const rowLabel = el('text', {
      x: SIDE,
      y: 30,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    rowLabel.textContent = t('label.row', 'the sentence, cut into pieces');

    const tick = el('line', {
      x1: tickX,
      y1: 38,
      x2: tickX,
      y2: BAR_Y + BAR_H + 6,
      stroke: colors.border,
      'stroke-width': 1,
      'stroke-dasharray': '3 3',
    });
    const tickLabel = el('text', {
      x: tickX,
      y: 30,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    tickLabel.textContent = t('label.reference', 'length with no merges');

    const barTrack = el('rect', {
      x: SIDE,
      y: BAR_Y,
      width: openSpan,
      height: BAR_H,
      rx: 3,
      fill: colors.border,
    });
    const bar = el('rect', {
      x: SIDE,
      y: BAR_Y,
      width: openSpan,
      height: BAR_H,
      rx: 3,
      fill: colors.text,
    });

    const ruleText = el('text', {
      x: SIDE,
      y: RULE_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
    });

    const captionA = el('text', {
      x: SIDE,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    const captionB = el('text', {
      x: SIDE,
      y: CAPTION_Y + CAPTION_LEAD,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });

    const row = el('g', {});
    canvas.append(rowLabel, tick, tickLabel, barTrack, bar, row, ruleText, captionA, captionB);

    // ── 기다리던 것을 destroy 가 푼다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(ms: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          step(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick2 = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          step(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick2();
          }, FRAME_MS);
          timers.add(id);
        };
        tick2();
      });
    }

    let tiles: Tile[] = [];
    let current: string[] = [];

    function paint(tile: Tile, active: boolean): void {
      tile.rect.setAttribute('fill', active ? colors.itemActive : colors.itemDefault);
      tile.rect.setAttribute('stroke', active ? colors.itemActive : colors.border);
      tile.label.setAttribute('fill', active ? colors.stateInk : colors.text);
    }

    function build(pieces: readonly string[], active: ReadonlySet<number>): void {
      for (const tile of tiles) tile.g.remove();
      tiles = [];
      const { widths, xs, total } = measure(pieces);
      pieces.forEach((piece, i) => {
        const g = el('g', {
          transform: `translate(${xs[i] as number},${ROW_Y})`,
          'data-piece-index': i,
        });
        const rect = el('rect', {
          width: widths[i] as number,
          height: TILE_H,
          rx: 4,
          'stroke-width': 1,
        });
        const label = el('text', {
          x: (widths[i] as number) / 2,
          y: 28,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
        });
        label.textContent = glyphsOf(piece);
        g.append(rect, label);
        row.appendChild(g);
        const tile: Tile = { width: widths[i] as number, g, rect, label };
        paint(tile, active.has(i));
        tiles.push(tile);
      });
      current = [...pieces];
      bar.setAttribute('width', String(Math.max(0, total)));
    }

    function setCaption(line: string): void {
      const [a, b] = wrapCaption(line, CAPTION_WRAP);
      captionA.textContent = a ?? '';
      captionB.textContent = b ?? '';
    }

    build(opening, new Set());

    return {
      /** 줄을 통째로 갈아 놓는다 — 판의 시작과 끝, 되돌리기. */
      setPieces(pieces: string[]): void {
        build(pieces, new Set());
      },

      /**
       * 한 걸음. 합쳐지는 짝은 서로에게 미끄러지고 나머지는 왼쪽으로 당겨진다.
       * 애니메이션이 끝나야 promise 가 풀리므로 projector 가 그것을 기다린다.
       */
      async mergeTo(frame: SubwordMergeFrame, durationMs: number): Promise<void> {
        const prev = current;
        const next = frame.pieces;
        const marks = new Set(frame.mergedAt);
        const from = measure(prev);
        const to = measure(next);

        // 앞 줄과 뒤 줄의 짝을 맞춘다. 어긋나면 (이벤트가 건너뛰었거나 순서가
        // 틀렸으면) 애니메이션 없이 뒤 줄로 갈아 놓는다 — 거짓 운동을 보이지 않는다.
        const dest: number[] = [];
        const joined = new Set<number>();
        let i = 0;
        let k = 0;
        let sane = tiles.length === prev.length;
        while (sane && i < prev.length) {
          if (k >= next.length) {
            sane = false;
            break;
          }
          if (marks.has(i) && i + 1 < prev.length) {
            dest[i] = to.xs[k] as number;
            dest[i + 1] = (to.xs[k] as number) + (to.widths[k] as number) - (from.widths[i + 1] as number);
            joined.add(k);
            paint(tiles[i] as Tile, true);
            paint(tiles[i + 1] as Tile, true);
            i += 2;
          } else {
            dest[i] = to.xs[k] as number;
            i += 1;
          }
          k += 1;
        }
        if (!sane || k !== next.length) {
          build(next, new Set());
          return;
        }

        await animate(durationMs, (p) => {
          const e = ease(p);
          for (let n = 0; n < tiles.length; n += 1) {
            const start = from.xs[n] as number;
            const x = start + ((dest[n] as number) - start) * e;
            (tiles[n] as Tile).g.setAttribute('transform', `translate(${x.toFixed(2)},${ROW_Y})`);
          }
          bar.setAttribute('width', String(Math.max(0, from.total + (to.total - from.total) * e)));
        });

        build(next, joined);
      },

      setCaption,

      /** 지금 먹은 규칙을 기호로 적는다. 말은 캡션이 한다. */
      setRule(text: string): void {
        ruleText.textContent = text;
      },

      reset(): void {
        ruleText.textContent = '';
        setCaption('');
        build(opening, new Set());
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
