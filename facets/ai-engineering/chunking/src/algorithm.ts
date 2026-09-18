/**
 * 청킹 — 글을 검색용 덩이로 자를 때, 무엇을 기준으로 얼마만큼 자르면 문장이 덜 잘리는가.
 *
 * 한 판 = 지금 손잡이 값(자르는 법 · 창 크기)으로 글을 덩이로 가르고, 문장마다 어느 덩이엔가
 * 통째로 드는지 가린다. 판이 끝나면 손잡이 입력을 기다리고, 받은 값으로 다시 한 판을 돈다.
 *
 * ## 규약 (검색 증강 조각들과 같다)
 *
 * - 낱말 = 공백으로 가른 덩이. 구두점은 붙은 낱말에 딸린다.
 * - 문장 = 마침표로 끝나는 낱말까지. 이 글은 낱말 121, 문장 9 (8 · 16 · 7 · 26 · 10 · 19 · 14 · 13 · 8).
 * - 자르는 법 (`rule`)
 *   - 0 낱말 수 — 덩이 k 는 낱말 [k·S, min(k·S + S, 전체)). 끝이 글 끝에 닿으면 멈춘다.
 *   - 1 반 겹침 — 겹침 = S // 2, 보폭 = S − 겹침. 덩이 k 는 [k·보폭, min(k·보폭 + S, 전체)).
 *   - 2 문장 경계 — 문장을 차례로 담는다. 담아 둔 것에 이 문장을 더해 S 를 넘으면 담아 둔 것을
 *     덩이로 내보내고 이 문장부터 새로 담는다. 문장 하나가 S 보다 길면 앞에서부터 S 낱말씩 잘라
 *     내보내고, S 이하로 남은 꼬리가 "담아 둔 것" 이 된다. 끝에 남은 것은 덩이 하나.
 * - 잘린 문장 = 어느 덩이에도 첫 낱말과 끝 낱말이 함께 들지 않은 문장.
 * - 담은 낱말 = 덩이 길이의 합 (겹친 낱말은 두 번 센다).
 * - 채움 % = `(담은 × 100 + 덩이 × S // 2) // (덩이 × S)` — 반올림 정수 나눗셈. 계기가 아니라 화면 캡션.
 * - 구간은 0 기준 반열림으로 다루고, 화면과 글에서는 덩이 · 낱말 번호를 1 부터 읽는다.
 *
 * 예로 정한 값은 없다 — 글과 두 사다리가 1차 자료의 전부이고 나머지는 전부 여기서 셈한다.
 * 동률 규칙도 없다 (셈이 전부 정수 구간이다).
 *
 * ## 이벤트 (payload 스키마)
 *
 * - `plan`  { rule: number, size: number, count: number }                    — 판의 시작. 걸음 경계 아님(곧바로 첫 덩이)
 * - `chunk` { index: number, start: number, end: number, count: number,
 *             whole: number[] }                                            — 덩이 하나. whole = 이 덩이에 통째로 든 문장 번호(0 기준)
 * - `judge` { broken: number[], total: number, count: number }             — 잘린 문장 번호(0 기준) · 문장 수 · 이번 판 덩이 수
 * - `done`  { chunks: number, broken: number, stored: number, fill: number } — 판의 끝. 뒤에 입력을 기다린다
 * - `phase` { phase }  silent: true
 *
 * ## phase 어휘 (irs.ts 와 같다)
 *
 * `'cut' | 'check' | 'done'`
 *
 * - cut   덩이 하나를 버퍼에 적는다 (cutByWords · cutBySentences)
 * - check 문장마다 덩이를 훑어 통째로 드는지 본다 (countBroken)
 * - done  잘린 문장 수를 돌려준다
 *
 * 걸음 경계는 `sleep` 과 판 끝의 `waitForInput` 이다. cut 은 덩이마다, check 는 판정 뒤, done 은
 * 입력 대기에서 켜져 있다 — 셋 다 경계 앞에 선다.
 *
 * ## 계기 (누적 채널이라 지금 값을 들고 차이만 보낸다)
 *
 * - `chunk-count`            덩이 수 (덩이마다 하나씩 는다)
 * - `broken-sentence-count`  잘린 문장 수 (판정 걸음에서 정해진다)
 * - `stored-word-count`      담은 낱말 수 (덩이마다 그 길이만큼 는다)
 *
 * 판이 바뀌면 셋을 0 으로 되돌리고 다시 센다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ChunkingData = {
  type: 'chunking';
  /** 자료 — 영어 글. 번역하지 않는다. */
  text: string;
  /** 자르는 법 사다리 — 0 낱말 수 · 1 반 겹침 · 2 문장 경계 */
  rules: number[];
  /** 창 크기 사다리 (낱말) */
  sizes: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 자르는 법 번호 */
export const RULE_WORDS = 0;
export const RULE_HALF = 1;
export const RULE_SENTENCE = 2;

/** 덩이 하나 — 낱말 구간 [start, end) */
export type Chunk = { start: number; end: number };

/** 문장 하나 — 낱말 구간 [start, end) */
export type Sentence = { start: number; end: number };

/** 낱말 = 공백으로 가른 덩이. */
export function splitWords(text: string): string[] {
  return text.split(' ').filter((w) => w.length > 0);
}

/** 문장 = 마침표로 끝나는 낱말까지. 끝에 마침표가 없는 꼬리도 한 문장으로 친다. */
export function sentenceSpans(words: readonly string[]): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i += 1) {
    if (words[i]!.endsWith('.')) {
      out.push({ start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < words.length) out.push({ start, end: words.length });
  return out;
}

/** 낱말 수 · 반 겹침 — IR 의 `cutByWords` 와 같은 걸음. */
export function cutByWords(total: number, size: number, overlap: number): Chunk[] {
  const stride = size - overlap;
  const out: Chunk[] = [];
  let start = 0;
  let end = 0;
  while (end < total) {
    end = Math.min(start + size, total);
    out.push({ start, end });
    start += stride;
  }
  return out;
}

/** 문장 경계 — IR 의 `cutBySentences` 와 같은 걸음. */
export function cutBySentences(sentences: readonly Sentence[], size: number): Chunk[] {
  const out: Chunk[] = [];
  let holdStart = -1;
  let holdEnd = -1;
  for (const s of sentences) {
    const span = s.end - s.start;
    if (holdStart >= 0) {
      if (holdEnd - holdStart + span > size) {
        out.push({ start: holdStart, end: holdEnd });
        holdStart = -1;
      }
    }
    if (span > size) {
      // 창보다 긴 문장 — 앞에서부터 창 크기씩 잘라 내보낸다. 어느 법으로도 잘린다.
      let piece = s.start;
      while (s.end - piece > size) {
        out.push({ start: piece, end: piece + size });
        piece += size;
      }
      holdStart = piece;
      holdEnd = s.end;
    } else {
      if (holdStart < 0) holdStart = s.start;
      holdEnd = s.end;
    }
  }
  if (holdStart >= 0) out.push({ start: holdStart, end: holdEnd });
  return out;
}

/** 손잡이 값으로 덩이를 가른다. */
export function cutChunks(words: readonly string[], rule: number, size: number): Chunk[] {
  if (rule === RULE_SENTENCE) return cutBySentences(sentenceSpans(words), size);
  const overlap = rule === RULE_HALF ? Math.floor(size / 2) : 0;
  return cutByWords(words.length, size, overlap);
}

/** 덩이 하나에 통째로 드는가. */
export function holds(chunk: Chunk, s: Sentence): boolean {
  return chunk.start <= s.start && s.end <= chunk.end;
}

/** 잘린 문장 번호 (0 기준) — IR 의 `countBroken` 이 세는 것. */
export function brokenSentences(sentences: readonly Sentence[], chunks: readonly Chunk[]): number[] {
  const out: number[] = [];
  sentences.forEach((s, j) => {
    if (!chunks.some((c) => holds(c, s))) out.push(j);
  });
  return out;
}

/** 채움 % — 반올림 정수 나눗셈. */
export function fillPercent(stored: number, count: number, size: number): number {
  const cap = count * size;
  if (cap <= 0) return 0;
  return Math.floor((stored * 100 + Math.floor(cap / 2)) / cap);
}

/** 한 판의 결과 — 검사와 설명 글의 대조가 쓴다. */
export type ChunkingResult = {
  chunks: Chunk[];
  broken: number[];
  stored: number;
  fill: number;
};

export function computeChunkingResult(text: string, rule: number, size: number): ChunkingResult {
  const words = splitWords(text);
  const sentences = sentenceSpans(words);
  const chunks = cutChunks(words, rule, size);
  const broken = brokenSentences(sentences, chunks);
  const stored = chunks.reduce((a, c) => a + (c.end - c.start), 0);
  return { chunks, broken, stored, fill: fillPercent(stored, chunks.length, size) };
}

function pickDefault(ladder: readonly number[], preferred: number): number {
  return ladder.includes(preferred) ? preferred : (ladder[0] ?? preferred);
}

/** 손잡이 입력을 읽는다. 사다리에 없는 값이면 null. */
function readKnob(payload: unknown, ladder: readonly number[]): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number') return null;
  return ladder.includes(value) ? value : null;
}

export async function chunkingAlgorithm(base: FacetContext<ChunkingData>): Promise<void> {
  const ctx = base as ReactiveContext<ChunkingData>;
  const data = ctx.data;
  const words = splitWords(typeof data.text === 'string' ? data.text : '');
  const sentences = sentenceSpans(words);
  const rules = Array.isArray(data.rules) ? data.rules : [RULE_WORDS, RULE_HALF, RULE_SENTENCE];
  const sizes = Array.isArray(data.sizes) ? data.sizes : [16, 24, 32];
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 700;

  let rule = pickDefault(rules, RULE_WORDS);
  let size = pickDefault(sizes, 24);

  // 계기는 더하기만 한다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 걸음 사이의 문. 끝까지 지났으면 true, 취소됐으면 false. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  };

  /** 한 판. 끝까지 돌았으면 true, 취소됐으면 false. */
  const playOnce = async (): Promise<boolean> => {
    const chunks = cutChunks(words, rule, size);
    gauge('chunk-count', 0);
    gauge('stored-word-count', 0);
    gauge('broken-sentence-count', 0);
    await ctx.emit({ type: 'plan', payload: { rule, size, count: chunks.length } });

    let stored = 0;
    for (let k = 0; k < chunks.length; k += 1) {
      if (ctx.cancelled) return false;
      const c = chunks[k]!;
      const whole: number[] = [];
      sentences.forEach((s, j) => {
        if (holds(c, s)) whole.push(j);
      });
      stored += c.end - c.start;
      await phase('cut');
      await ctx.emit({
        type: 'chunk',
        payload: { index: k, start: c.start, end: c.end, count: chunks.length, whole },
      });
      gauge('chunk-count', k + 1);
      gauge('stored-word-count', stored);
      if (!(await pause())) return false;
    }

    const broken = brokenSentences(sentences, chunks);
    await phase('check');
    await ctx.emit({ type: 'judge', payload: { broken, total: sentences.length, count: chunks.length } });
    gauge('broken-sentence-count', broken.length);
    if (!(await pause())) return false;

    await phase('done');
    await ctx.emit({
      type: 'done',
      payload: {
        chunks: chunks.length,
        broken: broken.length,
        stored,
        fill: fillPercent(stored, chunks.length, size),
      },
    });
    return !ctx.cancelled;
  };

  try {
    if (!(await playOnce())) return;
    for (;;) {
      if (ctx.cancelled) return;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      let changed = applyInput(input.type, input.payload);
      // 재생 도중 여러 번 돌렸으면 큐에 쌓여 있다 — 마지막 값으로 한 판만 돈다.
      for (let next = ctx.pollInput(); next !== null; next = ctx.pollInput()) {
        if (ctx.cancelled) return;
        if (applyInput(next.type, next.payload)) changed = true;
      }
      if (!changed) continue;
      if (!(await playOnce())) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }

  /** 우리 손잡이 입력이면 값을 바꾸고 true. 아니면 false (흘린다). */
  function applyInput(type: string, payload: unknown): boolean {
    if (type === 'rule') {
      const v = readKnob(payload, rules);
      if (v === null) return false;
      rule = v;
      return true;
    }
    if (type === 'size') {
      const v = readKnob(payload, sizes);
      if (v === null) return false;
      size = v;
      return true;
    }
    return false;
  }
}
