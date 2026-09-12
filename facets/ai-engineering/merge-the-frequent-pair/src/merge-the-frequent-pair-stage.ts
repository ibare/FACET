/**
 * merge-the-frequent-pair-stage — 낱말 넷이 조각으로 서 있고, 가장 무거운 이음매가
 * 모든 줄에서 한꺼번에 닫힌다.
 *
 * 그림이 하는 일은 하나다. **떨어져 있던 두 조각이 서로에게 미끄러져 하나가 되고,
 * 그 뒤 같은 자리가 모두 함께 바뀐다.** 그래서 이 파일의 운동은 전부 자리 이동이다 —
 * 조각은 transform 으로 움직이고, 이음매의 셈은 닫히는 틈에서 밀려 나간다.
 *
 * ── 왜 이 배치인가
 *
 * 줄마다 왼쪽 끝을 맞춰 세운다. 낱글자 폭이 한 칸으로 고정이라 `f·a·s·t` 과
 * `l·a·s·t` 이 세로로 줄을 맞추고, 그래서 `s+t` 이 닫힐 때 **같은 열이 네 줄에서
 * 동시에 닫히는 것**이 보인다. 합치기가 낱말 하나의 일이 아니라 말뭉치 전체의
 * 일이라는 것이 배치에서 나온다.
 *
 * ── 이음매 위의 수
 *
 * 잰 값은 재는 자리에 남긴다 (S-piece). 짝의 빈도를 옆의 계기로 모으지 않고 그
 * 짝이 실제로 붙어 있는 이음매마다 적는다. 같은 수가 여러 줄에 되풀이되는 것이
 * 곧 "말뭉치 전체에서 센다" 는 뜻이다.
 *
 * 좌표는 전부 캔버스에서 역산한다. 이음매 폭은 가장 넓은 줄(첫 걸음의 낱글자)이
 * 폭을 채우도록 정하고, 조각은 합쳐지기만 하므로 그 뒤로는 줄어들기만 한다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 네 줄이 들어가는 높이. 마운트한 뒤 바뀌지 않는다 (S-view). */
const CANVAS_H = 216;

const SIDE = 18;
const LABEL_GAP = 12;
const CHIP_H = 30;
const CHIP_PAD = 7;
/** 조각 글자 한 칸. textLength 로 이 격자를 강제해 합쳐진 뒤에도 글자가 제자리에 선다. */
const CHAR_W = 10;
const LABEL_CHAR_W = 7.2;
const CAPTION_CHAR_W = 7.1;
const SEAM_MAX = 40;
const SEAM_MIN = 14;
const ROWS_TOP = 46;
const ROW_PITCH_MAX = 44;
const BOTTOM_PAD = 10;
const CAPTION_Y1 = 17;
const CAPTION_Y2 = 34;
const CHIP_RX = 6;
/** 고른 짝이 서로에게 기울어지는 거리. 닫히기 전의 당김이다. */
const LEAN = 3;

const SPREAD_MS = 320;
const WEIGH_MS = 220;
const SLIDE_MS = 460;
const SWAP_MS = 140;

type SceneWord = { text: string; freq: number };

type Chip = {
  text: string;
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  /** 지금 그려져 있는 자리. */
  x: number;
  w: number;
};

type Row = {
  g: SVGGElement;
  chipLayer: SVGGElement;
  seamLayer: SVGGElement;
  chips: Chip[];
  seams: SVGTextElement[];
};

export type MergeTheFrequentPairStage = ViewInstance & {
  paint(rows: string[][]): Promise<void>;
  weigh(counts: number[][], winner: boolean[][]): Promise<void>;
  fuse(rows: string[][], token: string): Promise<void>;
  rewind(): void;
  setCaption(text: string): void;
};

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, name) as SVGElementTagNameMap[K];
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — mount 가 그것을 받는 유일한 경로이고,
 * projector 가 없어도 반드시 불린다 (S-piece).
 */
function readScene(initialData: ViewMountParams['initialData']): SceneWord[] {
  const raw = (initialData as { words?: unknown } | undefined)?.words;
  if (!Array.isArray(raw)) return [];
  const out: SceneWord[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const word = item as Record<string, unknown>;
    if (typeof word.text !== 'string' || typeof word.freq !== 'number') continue;
    out.push({ text: word.text, freq: word.freq });
  }
  return out;
}

function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** 전체 진행 p 에서 [a, b] 구간만 떼어낸 진행. */
function segment(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

export const mergeTheFrequentPairStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const colors: Palette = getColors(params.theme);
    const words = readScene(params.initialData);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    // ── 자리 셈. 모두 캔버스에서 역산한다.
    const maxWordLen = words.reduce((a, w) => Math.max(a, w.text.length), 1);
    const maxFreqLen = words.reduce((a, w) => Math.max(a, String(w.freq).length), 1);
    const labelW = Math.round((maxWordLen + 1 + maxFreqLen) * LABEL_CHAR_W) + 6;
    const originX = SIDE + labelW + LABEL_GAP;
    const avail = W - SIDE - originX;
    const pitch = Math.min(
      ROW_PITCH_MAX,
      Math.floor((CANVAS_H - ROWS_TOP - BOTTOM_PAD) / Math.max(1, words.length)),
    );
    /** 이음매 폭. 첫 걸음의 줄을 받아 한 번 정하고 그 뒤로 바꾸지 않는다. */
    let seamGap = SEAM_MAX;

    const chipW = (text: string): number => text.length * CHAR_W + CHIP_PAD * 2;

    /** 합쳐져 나온 조각. 어휘가 자라는 것이 여기 쌓인다. */
    const learned = new Set<string>();

    // ── 뼈대.
    const captionLine1 = el('text');
    const captionLine2 = el('text');
    for (const [line, y] of [[captionLine1, CAPTION_Y1], [captionLine2, CAPTION_Y2]] as const) {
      line.setAttribute('x', String(SIDE));
      line.setAttribute('y', String(y));
      line.setAttribute('font-family', fonts.body);
      line.setAttribute('font-size', fontSizes.md);
      line.setAttribute('fill', colors.text);
      canvas.appendChild(line);
    }

    const rows: Row[] = words.map((word, index) => {
      const g = el('g');
      g.setAttribute('transform', `translate(0, ${ROWS_TOP + Math.round(pitch / 2) + index * pitch})`);

      const freqText = el('text');
      freqText.setAttribute('x', String(originX - LABEL_GAP));
      freqText.setAttribute('y', '0');
      freqText.setAttribute('text-anchor', 'end');
      freqText.setAttribute('dominant-baseline', 'central');
      freqText.setAttribute('font-family', fonts.mono);
      freqText.setAttribute('font-size', fontSizes.sm);
      freqText.setAttribute('fill', colors.textMuted);
      // `×5` 는 배수를 적는 기호 표기라 표식이다 (C10). 낱말과 빈도는 데이터다.
      freqText.textContent = `×${word.freq}`;

      const wordText = el('text');
      const freqW = (String(word.freq).length + 1) * LABEL_CHAR_W + 5;
      wordText.setAttribute('x', String(Math.round(originX - LABEL_GAP - freqW)));
      wordText.setAttribute('y', '0');
      wordText.setAttribute('text-anchor', 'end');
      wordText.setAttribute('dominant-baseline', 'central');
      wordText.setAttribute('font-family', fonts.mono);
      wordText.setAttribute('font-size', fontSizes.sm);
      wordText.setAttribute('fill', colors.text);
      wordText.textContent = word.text;

      const chipLayer = el('g');
      const seamLayer = el('g');
      g.appendChild(wordText);
      g.appendChild(freqText);
      g.appendChild(chipLayer);
      g.appendChild(seamLayer);
      canvas.appendChild(g);
      return { g, chipLayer, seamLayer, chips: [], seams: [] };
    });

    // ── 시간.
    function tween(ms: number, step: (p: number) => void): Promise<void> {
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
        const tick = (): void => {
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
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 조각.
    function paintChip(chip: Chip, chosen: boolean): void {
      const isLearned = learned.has(chip.text);
      const fill = chosen ? colors.itemPivot : isLearned ? colors.itemSorted : colors.itemDefault;
      const ink = chosen ? colors.stateInk : isLearned ? colors.textInverse : colors.text;
      chip.rect.setAttribute('fill', fill);
      chip.rect.setAttribute('stroke', chosen ? colors.itemPivot : isLearned ? colors.itemSorted : colors.border);
      chip.label.setAttribute('fill', ink);
    }

    function place(chip: Chip, x: number): void {
      chip.x = x;
      chip.g.setAttribute('transform', `translate(${Math.round(x)}, 0)`);
    }

    function makeChip(row: Row, text: string): Chip {
      const g = el('g');
      const rect = el('rect');
      const w = chipW(text);
      rect.setAttribute('x', '0');
      rect.setAttribute('y', String(-CHIP_H / 2));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(CHIP_H));
      rect.setAttribute('rx', String(CHIP_RX));
      rect.setAttribute('stroke-width', '1');

      const label = el('text');
      label.setAttribute('x', String(w / 2));
      label.setAttribute('y', '0');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-size', fontSizes.lg);
      // 글자를 한 칸 격자에 맞춘다. 두 조각이 맞붙었을 때 글자가 합쳐진 조각의
      // 제자리에 그대로 서므로, 바꿔치기가 눈에 띄지 않는다.
      label.setAttribute('textLength', String(text.length * CHAR_W));
      label.setAttribute('lengthAdjust', 'spacing');
      label.textContent = text;

      g.appendChild(rect);
      g.appendChild(label);
      row.chipLayer.appendChild(g);
      const chip: Chip = { text, g, rect, label, x: 0, w };
      paintChip(chip, false);
      return chip;
    }

    function clearRow(row: Row): void {
      row.chipLayer.textContent = '';
      row.seamLayer.textContent = '';
      row.chips = [];
      row.seams = [];
    }

    /** 줄 하나의 자리 — 왼쪽 끝을 맞추고 이음매 폭만큼 띄운다. */
    function layout(tokens: string[]): number[] {
      const xs: number[] = [];
      let x = originX;
      for (const token of tokens) {
        xs.push(x);
        x += chipW(token) + seamGap;
      }
      return xs;
    }

    /** 가장 넓은 줄이 폭을 채우도록 이음매를 정한다. 상수는 상한과 하한만 잡는다. */
    function fitSeam(tokenRows: string[][]): void {
      let gap = SEAM_MAX;
      for (const tokens of tokenRows) {
        if (tokens.length < 2) continue;
        const chars = tokens.reduce((a, t) => a + t.length, 0);
        const fit = Math.floor(
          (avail - chars * CHAR_W - tokens.length * CHIP_PAD * 2) / (tokens.length - 1),
        );
        gap = Math.min(gap, fit);
      }
      seamGap = Math.max(SEAM_MIN, gap);
    }

    /** 이번에 닫힐 이음매. `weigh` 가 받아 두었다가 `fuse` 가 쓴다. */
    let marked: boolean[][] = [];

    function wrapCaption(text: string): [string, string] {
      const max = Math.max(8, Math.floor((W - SIDE * 2) / CAPTION_CHAR_W));
      if (text.length <= max) return [text, ''];
      if (!text.includes(' ')) return [text.slice(0, max), text.slice(max)];
      let cut = text.lastIndexOf(' ', max);
      if (cut <= 0) cut = max;
      return [text.slice(0, cut), text.slice(cut + 1)];
    }

    const instance: MergeTheFrequentPairStage = {
      setCaption(text: string): void {
        const [first, second] = wrapCaption(text);
        captionLine1.textContent = first;
        captionLine2.textContent = second;
      },

      /**
       * 낱말이 낱글자로 쪼개진다. 조각을 낱말 모양 그대로 붙여 세운 뒤 이음매만큼
       * 벌린다 — 쪼개는 일 자체가 운동이다.
       */
      async paint(tokenRows: string[][]): Promise<void> {
        fitSeam(tokenRows);
        marked = [];
        const plans: { row: Row; from: number[]; to: number[] }[] = [];

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const tokens = tokenRows[r] ?? [];
          clearRow(row);
          const to = layout(tokens);
          const from: number[] = [];
          let packed = originX;
          for (const token of tokens) {
            row.chips.push(makeChip(row, token));
            from.push(packed);
            packed += chipW(token);
          }
          row.chips.forEach((chip, i) => place(chip, from[i]));
          plans.push({ row, from, to });
        }

        await tween(SPREAD_MS, (p) => {
          const e = easeOut(p);
          for (const plan of plans) {
            plan.row.chips.forEach((chip, i) => {
              place(chip, plan.from[i] + (plan.to[i] - plan.from[i]) * e);
            });
          }
        });
      },

      /**
       * 이음매마다 그 짝의 셈이 내려앉고, 가장 무거운 이음매의 두 조각이 서로에게
       * 기운다. 닫히기 전의 당김이다.
       */
      async weigh(counts: number[][], winner: boolean[][]): Promise<void> {
        marked = winner;
        const leaning: { chip: Chip; from: number; to: number }[] = [];

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          row.seamLayer.textContent = '';
          row.seams = [];
          const line = counts[r] ?? [];
          const flags = winner[r] ?? [];

          for (let i = 0; i < line.length && i + 1 < row.chips.length; i++) {
            const left = row.chips[i];
            const right = row.chips[i + 1];
            const chosen = flags[i] === true;
            const seam = el('text');
            seam.setAttribute('x', String(Math.round((left.x + left.w + right.x) / 2)));
            seam.setAttribute('y', '0');
            seam.setAttribute('text-anchor', 'middle');
            seam.setAttribute('dominant-baseline', 'central');
            seam.setAttribute('font-family', fonts.mono);
            seam.setAttribute('font-size', fontSizes.xs);
            seam.setAttribute('fill', chosen ? colors.text : colors.textMuted);
            seam.setAttribute('font-weight', chosen ? '700' : '400');
            seam.setAttribute('opacity', '0');
            seam.textContent = String(line[i]);
            row.seamLayer.appendChild(seam);
            row.seams.push(seam);

            if (chosen) {
              leaning.push({ chip: left, from: left.x, to: left.x + LEAN });
              leaning.push({ chip: right, from: right.x, to: right.x - LEAN });
              paintChip(left, true);
              paintChip(right, true);
            }
          }
        }

        await tween(WEIGH_MS, (p) => {
          const e = easeOut(p);
          for (const row of rows) {
            for (const seam of row.seams) seam.setAttribute('opacity', String(e));
          }
          for (const lean of leaning) {
            place(lean.chip, lean.from + (lean.to - lean.from) * e);
          }
        });
      },

      /**
       * 두 조각이 서로에게 미끄러져 하나가 되고, 뒤따르던 것들이 같이 당겨 온다.
       * 닫히는 틈에서 셈이 밀려 나가고, 맞붙은 자리에서 합쳐진 조각으로 바뀐다.
       */
      async fuse(tokenRows: string[][], token: string): Promise<void> {
        const plans: {
          row: Row;
          tokens: string[];
          from: number[];
          to: number[];
          fading: SVGTextElement[];
          closing: SVGTextElement[];
          merging: Chip[];
        }[] = [];

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const tokens = tokenRows[r] ?? [];
          const flags = marked[r] ?? [];
          const xs = layout(tokens);
          const from = row.chips.map((chip) => chip.x);
          const to = new Array<number>(row.chips.length).fill(0);
          const fading: SVGTextElement[] = [];
          const closing: SVGTextElement[] = [];
          const merging: Chip[] = [];

          let i = 0;
          let j = 0;
          while (i < row.chips.length && j < tokens.length) {
            if (flags[i] === true && i + 1 < row.chips.length) {
              // 왼쪽은 합쳐진 자리의 왼쪽 끝으로, 오른쪽은 그 오른쪽 끝으로.
              to[i] = xs[j];
              to[i + 1] = xs[j] + chipW(tokens[j]) - row.chips[i + 1].w;
              merging.push(row.chips[i], row.chips[i + 1]);
              if (row.seams[i]) closing.push(row.seams[i]);
              i += 2;
              j += 1;
            } else {
              to[i] = xs[j];
              i += 1;
              j += 1;
            }
          }
          for (const seam of row.seams) {
            if (!closing.includes(seam)) fading.push(seam);
          }
          plans.push({ row, tokens, from, to, fading, closing, merging });
        }

        await tween(SLIDE_MS, (p) => {
          const slide = easeOut(p);
          const gone = segment(p, 0, 0.35);
          const squeezed = segment(p, 0.45, 0.9);
          const seamless = 1 - segment(p, 0.6, 1);
          for (const plan of plans) {
            plan.row.chips.forEach((chip, i) => {
              place(chip, plan.from[i] + (plan.to[i] - plan.from[i]) * slide);
            });
            for (const seam of plan.fading) seam.setAttribute('opacity', String(1 - gone));
            for (const seam of plan.closing) seam.setAttribute('opacity', String(1 - squeezed));
            for (const chip of plan.merging) chip.rect.setAttribute('stroke-opacity', String(seamless));
          }
        });

        // 맞붙은 자리에 합쳐진 조각을 세운다. 글자가 이미 제자리에 있으므로
        // 바꿔치기는 아주 짧은 겹침만으로 끝난다.
        learned.add(token);
        const swaps: { row: Row; old: Chip[]; fresh: Chip[] }[] = [];
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const plan = plans[r];
          const xs = layout(plan.tokens);
          const old = row.chips;
          const fresh: Chip[] = [];
          plan.tokens.forEach((text, index) => {
            const chip = makeChip(row, text);
            place(chip, xs[index]);
            chip.g.setAttribute('opacity', '0');
            fresh.push(chip);
          });
          swaps.push({ row, old, fresh });
        }

        await tween(SWAP_MS, (p) => {
          for (const swap of swaps) {
            for (const chip of swap.fresh) chip.g.setAttribute('opacity', String(p));
            for (const chip of swap.old) chip.g.setAttribute('opacity', String(1 - p));
          }
        });

        for (const swap of swaps) {
          for (const chip of swap.old) chip.g.remove();
          swap.row.chips = swap.fresh;
          swap.row.seamLayer.textContent = '';
          swap.row.seams = [];
        }
        marked = [];
      },

      rewind(): void {
        learned.clear();
        marked = [];
        for (const row of rows) clearRow(row);
        captionLine1.textContent = '';
        captionLine2.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        // 캔버스는 러너의 것이라 떼지 않는다. 안쪽만 비운다 (S-view).
        canvas.textContent = '';
      },
    };

    return instance;
  },
};
