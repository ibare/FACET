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
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드는 없다. `render(next, prev, { animate })` 하나가 그 장면이
 * 말하는 화면을 통째로 세우고, `prev` 는 무엇을 흐르게 할지 고르는 데만 쓴다. 그래서
 * 어느 걸음에서 어느 걸음으로 가든 결과가 같고, 되돌릴 명령을 따로 둘 필요가 없다
 * (S-scene). 장면의 모양은 `scene.ts`.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { MergeScene } from './scene.js';

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

/**
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면이 말하는 화면을 통째로
 * 세우므로, 되돌릴 명령이 있을 자리가 없다 (S-scene).
 */
export type MergeTheFrequentPairStage = ViewInstance & {
  render(next: MergeScene, prev: MergeScene | null, opts: { animate: boolean }): Promise<void>;
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
    // 문안은 장면이 아니라 여기서 만든다. 저작자 오버라이드도 이 통로로만 온다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
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

    /** 합쳐져 나온 조각. 장면이 쥔 자취를 `render` 가 그릴 때마다 여기 옮겨 담는다. */
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
    //
    // `known` 은 그 조각이 그려지는 시점의 어휘다. 합치는 운동을 그릴 때는 합쳐지기
    // 전의 어휘로 옛 조각을 칠해야 하므로 바깥에서 다른 것을 건넬 수 있게 둔다.
    function paintChip(chip: Chip, chosen: boolean, known: Set<string> = learned): void {
      const isLearned = known.has(chip.text);
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

    function wrapCaption(text: string): [string, string] {
      const max = Math.max(8, Math.floor((W - SIDE * 2) / CAPTION_CHAR_W));
      if (text.length <= max) return [text, ''];
      if (!text.includes(' ')) return [text.slice(0, max), text.slice(max)];
      let cut = text.lastIndexOf(' ', max);
      if (cut <= 0) cut = max;
      return [text.slice(0, cut), text.slice(cut + 1)];
    }

    function setCaption(text: string): void {
      const [first, second] = wrapCaption(text);
      captionLine1.textContent = first;
      captionLine2.textContent = second;
    }

    /** 처음으로 되감는다. 그리기는 늘 여기서 출발하므로 되돌릴 명령이 필요 없다. */
    function rewind(): void {
      learned.clear();
      for (const row of rows) clearRow(row);
      captionLine1.textContent = '';
      captionLine2.textContent = '';
    }

    /** 고른 짝은 서로에게 기운다. 닫히기 전의 당김이고, 걸음이 끝난 뒤에도 남는 자세다. */
    function leanOf(flags: boolean[], i: number): number {
      if (flags[i] === true) return LEAN;
      if (flags[i - 1] === true) return -LEAN;
      return 0;
    }

    /** 이음매 위의 수. 잰 값은 재는 자리에 남긴다 (S-piece). */
    function putSeam(
      row: Row,
      xs: number[],
      tokens: string[],
      i: number,
      count: number,
      chosen: boolean,
    ): SVGTextElement {
      const seam = el('text');
      seam.setAttribute('x', String(Math.round((xs[i] + chipW(tokens[i]) + xs[i + 1]) / 2)));
      seam.setAttribute('y', '0');
      seam.setAttribute('text-anchor', 'middle');
      seam.setAttribute('dominant-baseline', 'central');
      seam.setAttribute('font-family', fonts.mono);
      seam.setAttribute('font-size', fontSizes.xs);
      seam.setAttribute('fill', chosen ? colors.text : colors.textMuted);
      seam.setAttribute('font-weight', chosen ? '700' : '400');
      seam.setAttribute('opacity', '1');
      seam.textContent = String(count);
      row.seamLayer.appendChild(seam);
      return seam;
    }

    // ── 장면 그리기 ─────────────────────────────────────────────────────────
    //
    // 걸음마다 부르는 메서드 대신 이 아래가 화면 전체를 세운다. 늘 `rewind()` 로
    // 처음에 돌린 뒤 그 장면이 말하는 것만 다시 그리므로, 어느 걸음에서 어느
    // 걸음으로 가든 같은 길이다.

    /** 장면이 말하는 줄과 이음매를 통째로 세운다. 앞 화면과 견주지 않는다. */
    function stand(s: MergeScene): void {
      learned.clear();
      for (const token of s.learned) learned.add(token);
      // 이음매 폭은 쪼갠 직후의 줄이 정한다. 조각은 합쳐지기만 하므로 그 뒤로는
      // 줄어들기만 하고, 걸음마다 다시 재면 같은 열이 네 줄에서 함께 닫히는
      // 그림이 흔들린다.
      fitSeam(s.baseRows);

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const tokens = s.rows[r] ?? [];
        if (tokens.length === 0) continue;
        const xs = layout(tokens);
        const flags = s.seams?.winner[r] ?? [];

        tokens.forEach((text, i) => {
          const chip = makeChip(row, text);
          place(chip, xs[i] + leanOf(flags, i));
          paintChip(chip, flags[i] === true || flags[i - 1] === true);
          row.chips.push(chip);
        });

        if (!s.seams) continue;
        const line = s.seams.counts[r] ?? [];
        for (let i = 0; i < line.length && i + 1 < tokens.length; i++) {
          row.seams.push(putSeam(row, xs, tokens, i, line[i], flags[i] === true));
        }
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: MergeScene['caption']): void {
      if (!cap) {
        setCaption('');
        return;
      }
      switch (cap.kind) {
        case 'split':
          setCaption(
            t('caption.split', 'Each word is cut into letters, closed by the end mark {mark}.', {
              mark: cap.mark,
            }),
          );
          return;
        case 'weigh':
          setCaption(
            t(
              'caption.weigh',
              'Count every neighbouring pair across the whole corpus. Heaviest seam: {pair} at {count}.',
              { pair: `${cap.a}+${cap.b}`, count: cap.count },
            ),
          );
          return;
        case 'merge':
          setCaption(
            t('caption.merge', 'The seam closes: {pair} becomes {token}, in every word at once.', {
              pair: `${cap.a}+${cap.b}`,
              token: cap.token,
            }),
          );
          return;
        case 'done':
          setCaption(
            t('caption.done', 'Five merges, and the vocabulary stops here. Distinct pieces: {n}.', {
              n: cap.pieces,
            }),
          );
          return;
      }
    }

    // ── 흐르게 하는 셋. 정적으로 이미 서 있는 화면을 출발 자리로 되돌린 뒤 되짚어 온다.

    /**
     * 쪼개진다. 조각을 낱말 모양 그대로 붙여 세운 뒤 이음매만큼 벌린다 — 쪼개는 일
     * 자체가 운동이다.
     */
    function spread(): Promise<void> {
      const plans: { chips: Chip[]; from: number[]; to: number[] }[] = [];
      for (const row of rows) {
        const to = row.chips.map((chip) => chip.x);
        const from: number[] = [];
        let packed = originX;
        for (const chip of row.chips) {
          from.push(packed);
          packed += chip.w;
        }
        row.chips.forEach((chip, i) => place(chip, from[i]));
        plans.push({ chips: row.chips, from, to });
      }

      return tween(SPREAD_MS, (p) => {
        const e = easeOut(p);
        for (const plan of plans) {
          plan.chips.forEach((chip, i) => {
            place(chip, plan.from[i] + (plan.to[i] - plan.from[i]) * e);
          });
        }
      });
    }

    /** 이음매마다 셈이 내려앉고, 가장 무거운 이음매의 두 조각이 서로에게 기운다. */
    function leanIn(s: MergeScene): Promise<void> {
      const leaning: { chip: Chip; from: number; to: number }[] = [];
      for (let r = 0; r < rows.length; r++) {
        const flags = s.seams?.winner[r] ?? [];
        rows[r].chips.forEach((chip, i) => {
          const lean = leanOf(flags, i);
          if (lean === 0) return;
          leaning.push({ chip, from: chip.x - lean, to: chip.x });
        });
      }
      for (const lean of leaning) place(lean.chip, lean.from);
      for (const row of rows) for (const seam of row.seams) seam.setAttribute('opacity', '0');

      return tween(WEIGH_MS, (p) => {
        const e = easeOut(p);
        for (const row of rows) {
          for (const seam of row.seams) seam.setAttribute('opacity', String(e));
        }
        for (const lean of leaning) {
          place(lean.chip, lean.from + (lean.to - lean.from) * e);
        }
      });
    }

    /**
     * 두 조각이 서로에게 미끄러져 하나가 되고, 뒤따르던 것들이 같이 당겨 온다.
     * 닫히는 틈에서 셈이 밀려 나가고, 맞붙은 자리에서 합쳐진 조각으로 바뀐다.
     *
     * 합치기 직전의 줄은 `merged.at` 을 되짚어 세운다 — 합쳐져 나온 조각을 다시 둘로
     * 풀면 그때의 줄이 그대로 나오므로, 앞 장면을 뒤지지 않고도 출발 자리를 안다.
     */
    async function closeSeam(s: MergeScene): Promise<void> {
      const m = s.merged;
      if (!m) return;

      // 합쳐지기 전의 어휘. 이번에 나온 조각은 아직 없었다.
      const before = new Set(s.learned);
      before.delete(m.token);

      const plans: {
        row: Row;
        old: Chip[];
        from: number[];
        to: number[];
        fading: SVGTextElement[];
        closing: SVGTextElement[];
        merging: Chip[];
      }[] = [];

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const tokens = s.rows[r] ?? [];
        const at = m.at[r] ?? [];
        const xsNew = layout(tokens);

        const pre: string[] = [];
        const preFlags: boolean[] = [];
        const to: number[] = [];
        tokens.forEach((text, i) => {
          if (at[i] !== true) {
            to.push(xsNew[i]);
            pre.push(text);
            return;
          }
          preFlags[pre.length] = true;
          // 왼쪽은 합쳐진 자리의 왼쪽 끝으로, 오른쪽은 그 오른쪽 끝으로.
          to.push(xsNew[i], xsNew[i] + chipW(text) - chipW(m.b));
          pre.push(m.a, m.b);
        });

        const xsPre = layout(pre);
        const old: Chip[] = [];
        const from: number[] = [];
        const merging: Chip[] = [];
        pre.forEach((text, k) => {
          const chip = makeChip(row, text);
          const x = xsPre[k] + leanOf(preFlags, k);
          place(chip, x);
          paintChip(chip, preFlags[k] === true || preFlags[k - 1] === true, before);
          old.push(chip);
          from.push(x);
          if (preFlags[k] === true || preFlags[k - 1] === true) merging.push(chip);
        });

        const line = m.counts[r] ?? [];
        const fading: SVGTextElement[] = [];
        const closing: SVGTextElement[] = [];
        for (let k = 0; k < line.length && k + 1 < pre.length; k++) {
          const seam = putSeam(row, xsPre, pre, k, line[k], preFlags[k] === true);
          (preFlags[k] === true ? closing : fading).push(seam);
        }

        plans.push({ row, old, from, to, fading, closing, merging });
      }

      // 합쳐진 조각은 이미 제자리에 서 있다. 맞붙을 때까지 감춰 둔다.
      for (const row of rows) {
        for (const chip of row.chips) chip.g.setAttribute('opacity', '0');
      }

      await tween(SLIDE_MS, (p) => {
        const slide = easeOut(p);
        const gone = segment(p, 0, 0.35);
        const squeezed = segment(p, 0.45, 0.9);
        const seamless = 1 - segment(p, 0.6, 1);
        for (const plan of plans) {
          plan.old.forEach((chip, k) => {
            place(chip, plan.from[k] + (plan.to[k] - plan.from[k]) * slide);
          });
          for (const seam of plan.fading) seam.setAttribute('opacity', String(1 - gone));
          for (const seam of plan.closing) seam.setAttribute('opacity', String(1 - squeezed));
          for (const chip of plan.merging) chip.rect.setAttribute('stroke-opacity', String(seamless));
        }
      });

      // 맞붙은 자리에서 바꿔치기. 글자가 이미 제자리에 있으므로 아주 짧은 겹침만으로
      // 끝난다.
      await tween(SWAP_MS, (p) => {
        for (const plan of plans) {
          for (const chip of plan.row.chips) chip.g.setAttribute('opacity', String(p));
          for (const chip of plan.old) chip.g.setAttribute('opacity', String(1 - p));
        }
      });

      // 흐르게 하려고 얹었던 것을 남김없이 거둔다. 남으면 같은 장면인데 흐르게
      // 그렸을 때와 곧바로 세웠을 때의 화면이 갈린다.
      for (const plan of plans) {
        for (const chip of plan.old) chip.g.remove();
        for (const chip of plan.row.chips) chip.g.removeAttribute('opacity');
        plan.row.seamLayer.textContent = '';
      }
    }

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     */
    async function render(
      next: MergeScene,
      prev: MergeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      rewind();
      stand(next);
      drawCaption(next.caption);
      if (!opts.animate) return;

      // 방금 달라진 것만 흐르게 한다. 걸음이 이어지지 않으면 (스크럽이 건너뛰면)
      // 셋 다 거짓이 되어 저절로 걸러진다.
      const justSplit =
        next.rows.length > 0 &&
        next.seams === null &&
        next.merged === null &&
        (prev === null || prev.rows.length === 0);
      const justWeighed = next.seams !== null && (prev === null || prev.seams === null);
      const justMerged =
        next.merged !== null && prev !== null && prev.merged === null && prev.seams !== null;

      if (justSplit) await spread();
      else if (justWeighed) await leanIn(next);
      else if (justMerged) await closeSeam(next);
    }

    const instance: MergeTheFrequentPairStage = {
      render,

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
