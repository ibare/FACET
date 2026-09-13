/**
 * tokens-per-language-stage — 줄이 옆으로 길어지는 그림.
 *
 * 문장 다섯이 낱글자 격자 위에 같은 자리에서 시작한다. 자를 차례가 오면 조각
 * 경계마다 틈이 벌어지면서 글자들이 오른쪽으로 밀리고, 줄 끝의 조각 수도 그만큼
 * 함께 밀려난다 — 줄이 길어진 만큼이 곧 조각이 늘어난 만큼이다.
 *
 * 영어 줄은 낱말이 통째로 한 조각이라 거의 움직이지 않는다. 그것이 이 그림이
 * 하려는 말이다.
 *
 * 좌표는 전부 여기서 셈한다. 선언에는 말뭉치와 문장만 있고 자리는 없다 (S-piece).
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세운다 — 되돌릴 명령이 없어야 어느 걸음으로든 갈 수 있다 (S-scene).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

import type { CutRow, TokensScene, VocabBand } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const PAD_X = 16;

/** 캡션 한 줄. */
const CAPTION_BASELINE = 20;

/** 어휘 띠 — 조각 수가 데이터에 달렸으므로 자리를 미리 잡아 두고 넘치면 줄인다 (S-view). */
const VOCAB_TOP = 32;
const VOCAB_LINES = 4;
const VOCAB_LINE_H = 17;
const VOCAB_BAND = VOCAB_LINES * VOCAB_LINE_H;

/** 문장 줄. 다섯 자리를 잡아 두고, 더 오면 층 간격을 줄여 담는다. */
const ROWS_TOP = VOCAB_TOP + VOCAB_BAND + 14;
const ROW_SLOTS = 5;
const ROW_PITCH = 48;

const NAME_DY = 9;
const CELL_TOP_DY = 15;
const CELL_H = 28;

const BADGE_W = 54;
const BADGE_GAP = 8;

/** 낱말 사이는 처음부터 떨어져 있고, 조각 사이는 자를 때 벌어진다. */
const WORD_GAP = 12;
const PIECE_GAP = 9;

/** 글자 한 칸의 가로 상한. 실제 값은 캔버스에서 역산한다 (S-piece). */
const CHAR_MAX_W = 28;
const CHAR_MIN_W = 8;

const CHIP_PAD_X = 5;
const CHIP_GAP_X = 4;
const CHIP_H = 14;

/** 모노 글자 한 칸의 가로 어림 — 글자 크기에 곱해 쓴다. */
const MONO_ADV = 0.62;

const ANIM_MS = 420;
const BOX_INSET = 2;

const STAGE_H = ROWS_TOP + ROW_SLOTS * ROW_PITCH + 10;

type SentenceSpec = { code: string; text: string };

type LetterView = {
  el: SVGTextElement;
  /** 자르기 전의 자리. */
  tightX: number;
};

type RowView = {
  code: string;
  words: string[];
  letters: LetterView[];
  group: SVGGElement;
  /** 자르기 전 줄의 오른쪽 끝. */
  tightEnd: number;
  cy: number;
  top: number;
};

/** 선언의 초기 데이터에서 문장 목록을 좁힌다. 러너 밖에서 빈 config 로 띄워도 던지지 않는다. */
function readSentences(initialData: Record<string, unknown> | undefined): SentenceSpec[] {
  if (initialData === undefined) return [];
  const raw = initialData.sentences;
  if (!Array.isArray(raw)) return [];
  const out: SentenceSpec[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.code !== 'string' || typeof row.text !== 'string') continue;
    out.push({ code: row.code, text: row.text });
  }
  return out;
}

function mk<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

/** 디자인 토큰의 글자 크기를 수로. */
function px(token: string): number {
  return Number.parseFloat(token);
}

/** 조각 경계가 어디서 벌어지는지 — 글자마다 앞에 놓인 틈의 수. */
function shiftsFor(
  words: string[],
  letterCount: number,
  pieces: string[],
): { letterGaps: number[]; boxes: { start: number; len: number; gaps: number }[]; total: number } {
  const starts: number[] = [];
  let acc = 0;
  for (const word of words) {
    starts.push(acc);
    acc += word.length;
  }

  const letterGaps = new Array<number>(letterCount).fill(0);
  const boxes: { start: number; len: number; gaps: number }[] = [];
  let charIdx = 0;
  let wordIdx = 0;
  let gaps = 0;

  for (const piece of pieces) {
    // 낱말 첫머리에서 시작하는 조각은 이미 낱말 틈만큼 떨어져 있다. 낱말 안에서
    // 갈라진 자리에만 새 틈이 생긴다.
    if (wordIdx < starts.length && charIdx > starts[wordIdx]) gaps += 1;
    boxes.push({ start: charIdx, len: piece.length, gaps });
    for (let k = 0; k < piece.length && charIdx < letterCount; k += 1) {
      letterGaps[charIdx] = gaps;
      charIdx += 1;
    }
    while (wordIdx < words.length && charIdx >= starts[wordIdx] + words[wordIdx].length) {
      wordIdx += 1;
    }
  }

  return { letterGaps, boxes, total: gaps };
}

export const tokensPerLanguageStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const sentences = readSentences(params.initialData);

    const smallFs = px(fontSizes.xs);

    // ── 기다리는 것을 거두는 자리 (S-piece)
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function animate(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          apply(1);
          resolve();
        };
        waiters.add(finish);

        const tick = (): void => {
          if (destroyed) return; // destroy 가 waiters 를 깨워 풀어 준다
          const raw = Math.min(1, (Date.now() - started) / ms);
          // 처음이 빠르고 끝이 느린 감속 — 벌어지는 것이 자리를 잡는 느낌.
          apply(1 - (1 - raw) * (1 - raw));
          if (raw >= 1) {
            finish();
            return;
          }
          schedule();
        };
        const schedule = (): void => {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        schedule();
      });
    }

    /** 이 줄의 언어 이름. 코드는 데이터의 식별자이고 이름은 문안이다 (C10). */
    function languageName(code: string): string {
      switch (code) {
        case 'en':
          return t('label.en', 'English');
        case 'es':
          return t('label.es', 'Spanish');
        case 'pt':
          return t('label.pt', 'Portuguese');
        case 'id':
          return t('label.id', 'Indonesian');
        case 'fr':
          return t('label.fr', 'French');
        default:
          return code;
      }
    }

    // ── 글자 한 칸의 가로
    //
    // 낱글자까지 다 부서지는 최악을 가정해 역산한다. 자르기 전에 자리를 잡아야
    // 하는데 어떻게 잘릴지는 그때 모르므로, 가장 많이 벌어지는 경우에 맞춰 둔다.
    const avail = W - PAD_X * 2 - BADGE_W - BADGE_GAP;
    let charW = CHAR_MAX_W;
    for (const sentence of sentences) {
      const words = sentence.text.split(' ').filter((word) => word.length > 0);
      const chars = words.reduce((sum, word) => sum + word.length, 0);
      if (chars === 0) continue;
      const gaps = (words.length - 1) * WORD_GAP + (chars - words.length) * PIECE_GAP;
      charW = Math.min(charW, Math.floor((avail - gaps) / chars));
    }
    charW = Math.max(CHAR_MIN_W, charW);

    const rowPitch =
      sentences.length > ROW_SLOTS
        ? Math.floor((ROW_SLOTS * ROW_PITCH) / sentences.length)
        : ROW_PITCH;

    // ── 그림
    let caption: SVGTextElement | null = null;
    let vocabGroup: SVGGElement | null = null;
    let markLine: SVGLineElement | null = null;
    const rows = new Map<string, RowView>();

    /** 화면을 처음으로 되돌린다. 늘 비우고 시작하므로 되돌릴 명령이 없다 (S-scene). */
    function build(): void {
      canvas.textContent = '';
      rows.clear();
      vocabGroup = null;
      markLine = null;

      caption = mk('text', {
        x: PAD_X,
        y: CAPTION_BASELINE,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      canvas.appendChild(caption);

      sentences.forEach((sentence, index) => {
        const words = sentence.text.split(' ').filter((word) => word.length > 0);
        const top = ROWS_TOP + index * rowPitch;
        const cy = top + CELL_TOP_DY + CELL_H / 2;

        const group = mk('g', {});
        canvas.appendChild(group);

        const code = mk('text', {
          x: PAD_X,
          y: top + NAME_DY,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        code.textContent = sentence.code;
        group.appendChild(code);

        const name = mk('text', {
          x: PAD_X + Math.round(smallFs * MONO_ADV * 3) + 6,
          y: top + NAME_DY,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        name.textContent = languageName(sentence.code);
        group.appendChild(name);

        const letters: LetterView[] = [];
        let charIdx = 0;
        words.forEach((word, wordIdx) => {
          for (const ch of word) {
            const tightX = PAD_X + charIdx * charW + wordIdx * WORD_GAP;
            const el = mk('text', {
              x: tightX + charW / 2,
              y: cy,
              'font-family': fonts.mono,
              'font-size': fontSizes.lg,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              fill: colors.text,
              opacity: 0,
            });
            el.textContent = ch;
            group.appendChild(el);
            letters.push({ el, tightX });
            charIdx += 1;
          }
        });

        const tightEnd = PAD_X + charIdx * charW + Math.max(0, words.length - 1) * WORD_GAP;
        rows.set(sentence.code, {
          code: sentence.code,
          words,
          letters,
          group,
          tightEnd,
          cy,
          top,
        });
      });
    }

    build();

    function setCaption(text: string): void {
      if (caption !== null) caption.textContent = text;
    }

    // ── 장면의 조각들을 세우는 일
    //
    // 걸음마다 부르던 함수를 버리지 않고 `withAnim` 을 받게 고쳤다. 참이면 흐르게
    // 그리고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기가 거짓으로 온다 (S-scene).

    function drawVocab(v: VocabBand, withAnim: boolean): Promise<void> {
      if (vocabGroup !== null) vocabGroup.remove();
      const group = mk('g', {});
      canvas.appendChild(group);
      vocabGroup = group;

      // 칩을 줄에 담는다. 넘치면 다음 줄로.
      const bandW = W - PAD_X * 2;
      const lines: { token: string; x: number }[][] = [];
      let line: { token: string; x: number }[] = [];
      let cursor = 0;
      for (const token of v.tokens) {
        const width = Math.round(token.length * smallFs * MONO_ADV) + CHIP_PAD_X * 2;
        if (cursor > 0 && cursor + width > bandW) {
          lines.push(line);
          line = [];
          cursor = 0;
        }
        line.push({ token, x: cursor });
        cursor += width + CHIP_GAP_X;
      }
      if (line.length > 0) lines.push(line);

      // 잡아 둔 자리를 넘치면 층 간격을 줄여 담는다. 세로는 늘리지 않는다 (S-view).
      const lineH = lines.length > VOCAB_LINES ? VOCAB_BAND / lines.length : VOCAB_LINE_H;
      const top = VOCAB_TOP + Math.max(0, (VOCAB_BAND - lines.length * lineH) / 2);

      const chips: SVGGElement[] = [];
      lines.forEach((row, lineIdx) => {
        for (const item of row) {
          const width = Math.round(item.token.length * smallFs * MONO_ADV) + CHIP_PAD_X * 2;
          const y = top + lineIdx * lineH;
          const chip = mk('g', { opacity: 0 });
          chip.appendChild(
            mk('rect', {
              x: PAD_X + item.x,
              y,
              width,
              height: CHIP_H,
              rx: 3,
              fill: colors.bgSubtle,
              stroke: colors.border,
            }),
          );
          const label = mk('text', {
            x: PAD_X + item.x + width / 2,
            y: y + CHIP_H / 2,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: colors.textMuted,
          });
          label.textContent = item.token;
          chip.appendChild(label);
          group.appendChild(chip);
          chips.push(chip);
        }
      });

      // 칩이 차례로 내려앉는다.
      const draw = (p: number): void => {
        chips.forEach((chip, i) => {
          const stagger = chips.length <= 1 ? p : Math.min(1, Math.max(0, p * 2 - i / chips.length));
          chip.setAttribute('opacity', String(stagger));
          chip.setAttribute('transform', `translate(0, ${((1 - stagger) * -5).toFixed(2)})`);
        });
      };
      if (!withAnim) {
        draw(1);
        return Promise.resolve();
      }
      return animate(ANIM_MS, draw);
    }

    function revealLetters(withAnim: boolean): Promise<void> {
      const all = [...rows.values()].flatMap((row) => row.letters);
      const draw = (p: number): void => {
        for (const letter of all) {
          letter.el.setAttribute('opacity', String(p));
          letter.el.setAttribute('transform', `translate(0, ${((1 - p) * -6).toFixed(2)})`);
        }
      };
      if (!withAnim) {
        draw(1);
        return Promise.resolve();
      }
      return animate(ANIM_MS, draw);
    }

    /**
     * 한 줄을 조각으로 가른다.
     *
     * `highlight` 는 지나가는 강조다 — 지금 자르는 줄만 물들고, 다음 줄로 넘어가면
     * 거둬진다. 장면이 그 줄이 어디인지 말해 주므로 여기서 앞줄을 찾아 지울 것이 없다.
     */
    function cutRow(cut: CutRow, withAnim: boolean, highlight: boolean): Promise<void> {
      const row = rows.get(cut.code);
      if (row === undefined) return Promise.resolve();

      const { letterGaps, boxes, total } = shiftsFor(row.words, row.letters.length, cut.pieces);

      const rects = boxes.map((box) => {
        const first = row.letters[box.start];
        const x = (first === undefined ? PAD_X : first.tightX) + BOX_INSET;
        const rect = mk('rect', {
          x,
          y: row.top + CELL_TOP_DY,
          width: Math.max(1, box.len * charW - BOX_INSET * 2),
          height: CELL_H,
          rx: 4,
          fill: 'none',
          stroke: highlight ? colors.itemActive : colors.border,
          opacity: 0,
        });
        row.group.insertBefore(rect, row.group.firstChild);
        return { rect, from: x, to: x + box.gaps * PIECE_GAP };
      });

      const badge = mk('g', { opacity: 0 });
      const count = mk('text', {
        x: 0,
        y: row.cy - 5,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'dominant-baseline': 'central',
        fill: colors.text,
      });
      count.textContent = String(cut.pieceCount);
      badge.appendChild(count);
      const ratio = mk('text', {
        x: 0,
        y: row.cy + 11,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'dominant-baseline': 'central',
        fill: colors.textMuted,
      });
      // 수식 표기는 문안이 아니라 표식이다 (C10).
      ratio.textContent = `×${Math.floor(cut.ratioTenths / 10)}.${cut.ratioTenths % 10}`;
      badge.appendChild(ratio);
      row.group.appendChild(badge);

      const badgeFrom = row.tightEnd + BADGE_GAP;
      const badgeTo = badgeFrom + total * PIECE_GAP;

      // 조각이 벌어지면서 글자가 오른쪽으로 밀리고, 줄 끝의 수도 함께 밀려난다.
      const draw = (p: number): void => {
        row.letters.forEach((letter, i) => {
          const dx = letterGaps[i] * PIECE_GAP * p;
          letter.el.setAttribute('opacity', '1');
          letter.el.setAttribute('transform', `translate(${dx.toFixed(2)}, 0)`);
        });
        for (const item of rects) {
          item.rect.setAttribute('x', String((item.from + (item.to - item.from) * p).toFixed(2)));
          item.rect.setAttribute('opacity', String(p));
        }
        badge.setAttribute('opacity', String(p));
        badge.setAttribute(
          'transform',
          `translate(${(badgeFrom + (badgeTo - badgeFrom) * p).toFixed(2)}, 0)`,
        );
      };
      if (!withAnim) {
        draw(1);
        return Promise.resolve();
      }
      return animate(ANIM_MS, draw);
    }

    /**
     * 으뜸 언어의 끝에 표시선을 내린다.
     *
     * 자를 때 물들었던 테두리를 거두는 일은 여기서 하지 않는다 — 장면이 그때
     * `activeCode` 를 비우므로 `cutRow` 가 처음부터 물들이지 않는다.
     */
    function drawMarker(baseCode: string, withAnim: boolean): Promise<void> {
      const base = rows.get(baseCode);
      if (base === undefined) return Promise.resolve();

      const last = [...rows.values()].reduce((deepest, row) => Math.max(deepest, row.top), ROWS_TOP);
      const x = base.tightEnd + 1;
      const from = base.top + CELL_TOP_DY - 6;
      const to = last + CELL_TOP_DY + CELL_H + 6;

      if (markLine !== null) markLine.remove();
      // 이 줄이 이 그림의 단일 강조다 — 으뜸 언어의 끝이 어디였는지를 가리키고,
      // 다른 줄이 그보다 얼마나 더 나갔는지가 그대로 보인다.
      const line = mk('line', {
        x1: x,
        y1: from,
        x2: x,
        y2: from,
        stroke: colors.accent,
        'stroke-width': 2,
        'stroke-dasharray': '4 3',
      });
      canvas.appendChild(line);
      markLine = line;

      const draw = (p: number): void => {
        line.setAttribute('y2', String((from + (to - from) * p).toFixed(2)));
      };
      if (!withAnim) {
        draw(1);
        return Promise.resolve();
      }
      return animate(ANIM_MS, draw);
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: TokensScene['caption']): void {
      if (cap === null) {
        setCaption('');
        return;
      }
      switch (cap.kind) {
        case 'vocab':
          setCaption(
            t(
              'caption.vocab',
              'A vocabulary learned from English words only — words: {words}, vocabulary pieces: {n}.',
              { words: cap.words, n: cap.n },
            ),
          );
          return;
        case 'sentences':
          setCaption(t('caption.sentences', 'These sentences all mean the same thing.'));
          return;
        case 'scatter':
          setCaption(
            t('caption.scatter', 'Cut with that vocabulary — letters: {chars}, pieces: {pieces}.', {
              chars: cap.chars,
              pieces: cap.pieces,
            }),
          );
          return;
        case 'done':
          setCaption(
            t(
              'caption.done',
              'Same meaning, similar length. Pieces — fewest: {min}, most: {max}.',
              { min: cap.min, max: cap.max },
            ),
          );
          return;
      }
    }

    // ── 장면 그리기 ─────────────────────────────────────────────────────────
    //
    // 걸음마다 부르는 메서드 대신 이 하나가 화면 전체를 세운다. 늘 `build()` 로
    // 처음에 돌린 뒤 그 장면이 말하는 것만 다시 그리므로, 어느 걸음에서 어느
    // 걸음으로 가든 같은 길이고 되돌릴 명령을 따로 둘 필요가 없다.

    async function render(
      next: TokensScene,
      prev: TokensScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      build();
      drawCaption(next.caption);

      if (next.vocab !== null) {
        // 방금 배웠을 때만 칩이 내려앉는다.
        await drawVocab(next.vocab, opts.animate && prev?.vocab == null);
      }

      if (next.lettersShown) {
        await revealLetters(opts.animate && prev?.lettersShown !== true);
      }

      // 자른 줄들. 방금 하나 늘었을 때만 그 마지막 줄이 벌어지는 것을 보인다 —
      // 걸음을 건너뛰어 왔으면 늘어난 수가 맞지 않아 저절로 걸러진다.
      const grewOne = opts.animate && next.cuts.length === (prev?.cuts.length ?? 0) + 1;
      for (const [i, cut] of next.cuts.entries()) {
        const isLast = i === next.cuts.length - 1;
        await cutRow(cut, grewOne && isLast, cut.code === next.activeCode);
      }

      if (next.baseCode !== null) {
        await drawMarker(next.baseCode, opts.animate && prev?.baseCode == null);
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
        canvas.textContent = '';
      },
    };
  },
};
