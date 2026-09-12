/**
 * 서브워드 분할 (BPE) — 어휘가 커질수록 같은 문장이 덜 잘린다.
 *
 * ── 진행 모델
 *
 * reactive 다. 선언 자리는 `facet.ts` 가 아니라 `index.ts` 의 등록 옵션이다
 * (`registerAlgorithm(..., { mechanismKind: 'reactive' })`). 마운트 직후 손잡이
 * 기본값으로 한 판 돌고, 그 뒤로는 손잡이가 올 때까지 기다린다. 재생 · 멈춤 ·
 * 한 걸음 · 되감기는 메커니즘이 진다.
 *
 * ── BPE 규약 셋. 이것을 안 지키면 사양의 수가 재현되지 않는다
 *
 *  1. 낱말 끝 표식 `</w>` 를 **독립 기호**로 붙인다. `the` 는 `t · h · e · </w>`
 *     네 원소로 시작하고, 표식도 다른 글자와 똑같이 병합 대상이 된다.
 *  2. 짝 빈도가 같으면 **사전순으로 앞선 짝**을 고른다. 짝을 `"<왼쪽> <오른쪽>"`
 *     문자열로 적었을 때의 최소다. 작은 말뭉치에서 동률은 흔해서, 정해 두지 않으면
 *     같은 말뭉치로도 실행마다 다른 화면이 나온다.
 *  3. 자르는 것은 어휘 목록이 아니라 **병합 규칙 열**이다. 어휘에서 최장일치를
 *     찾는 방식이 아니라, 배운 차례대로 규칙을 한 번씩 훑으며 인접한 두 조각이
 *     그 규칙과 맞으면 합친다.
 *
 * ── 발신 이벤트 + payload 스키마 (C2)
 *
 *   run-begin    { merges, pieces: string[], pieceCount, vocabSize }
 *                한 판의 시작. 화면은 낱글자 줄로 되돌아간다. `vocabSize` 는 그
 *                순간의 어휘, 곧 낱글자와 끝 표식의 종류 수다.
 *   pair-merged  { merges, ruleIndex, ruleCount, left, right, joined,
 *                  pieces: string[], mergedAt: number[], pieceCount }
 *                규칙 하나가 문장에 실제로 먹은 걸음. `mergedAt` 은 **앞 조각 열**
 *                에서 합쳐진 짝의 왼쪽 자리다 — 한 규칙이 여러 자리에 동시에 먹으므로
 *                배열이다.
 *   run-settled  { merges, pieces: string[], pieceCount, vocabSize, applied }
 *                이 손잡이 값의 답. `applied` 는 문장을 실제로 바꾼 규칙의 수다.
 *
 * silent 는 하나도 없다 — 셋 다 화면이 바뀌는 걸음의 경계다. `phase` 도 보내지
 * 않는다. 코드 패널을 두지 않아 받을 자리가 없고, C3 은 all-or-none 이다
 * (까닭은 `irs.ts` 머리말).
 *
 * ── 메트릭 (C5)
 *
 *   piece-count · vocab-size — `facet.ts` 의 `metrics[].name` 과 같다.
 *
 *   `ctx.metric` 은 **누적 채널**이고 러너는 되감기 때만 계기를 비운다. 손잡이를
 *   돌려 다시 도는 것은 되감기가 아니므로, 지금 값을 들고 **차이만** 보내는
 *   `gauge` 를 쓴다. 이름은 호출부에 리터럴로 남으므로 C5 의 취지가 지켜진다.
 *   델타가 0 이어도 보낸다 — 안 보내면 갈리지 않는 손잡이 값에서 계기 이름이
 *   통째로 안 실려 "선언한 계기가 빠진 것" 과 구별되지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 말뭉치 한 낱말과 그 빈도. */
export type CorpusEntry = { word: string; freq: number };

/** 배운 병합 규칙 하나 — 왼쪽 조각과 오른쪽 조각을 잇는다. */
export type MergeRule = { left: string; right: string };

export type SubwordSegmentationData = {
  type: string;
  /** 말뭉치 — 낱말과 빈도. 규칙은 여기서 배운다. */
  corpus: CorpusEntry[];
  /** 시험 문장. 빈칸으로 갈라 낱말마다 따로 자른다. */
  sentence: string;
  /** 낱말 끝 표식. 독립 기호로 붙이고 병합 대상이 된다. */
  endMark: string;
  /** 손잡이가 고를 수 있는 병합 횟수. */
  mergeCounts: number[];
  /** 마운트 직후 도는 병합 횟수. 손잡이의 기본 구간과 같아야 한다. */
  initialMerges: number;
  /** 걸음 하나를 보인 뒤 쉬는 시간. 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** 한 걸음 — 규칙 하나가 문장에 먹은 자리와 그 결과. */
export type MergeFrame = {
  ruleIndex: number;
  left: string;
  right: string;
  joined: string;
  /** 앞 조각 열에서 합쳐진 짝의 왼쪽 자리. */
  mergedAt: number[];
  pieces: string[];
};

export type SubwordRun = {
  rules: MergeRule[];
  /** 규칙을 다 배운 뒤 말뭉치에 남은 조각의 종류 수. */
  vocabSize: number;
  /** 규칙을 배우기 전, 곧 낱글자와 끝 표식의 종류 수. */
  startVocabSize: number;
  /** 문장을 낱글자에서 시작해 규칙을 다 훑은 결과. */
  pieces: string[];
  /** 문장을 실제로 바꾼 걸음들. 안 먹은 규칙은 여기 없다. */
  frames: MergeFrame[];
};

/**
 * 인접한 `left right` 를 모두 `left+right` 로 합친다. 합친 자리(입력 기준 왼쪽
 * 색인)도 함께 돌려준다.
 */
function mergeMarked(
  parts: readonly string[],
  left: string,
  right: string,
): { parts: string[]; marks: number[] } {
  const out: string[] = [];
  const marks: number[] = [];
  let i = 0;
  while (i < parts.length) {
    if (i + 1 < parts.length && parts[i] === left && parts[i + 1] === right) {
      marks.push(i);
      out.push(left + right);
      i += 2;
    } else {
      out.push(parts[i] as string);
      i += 1;
    }
  }
  return { parts: out, marks };
}

/** 인접한 `left right` 를 모두 합친 조각 열. */
export function mergeAdjacent(
  parts: readonly string[],
  left: string,
  right: string,
): string[] {
  return mergeMarked(parts, left, right).parts;
}

/** 낱말 하나를 낱글자와 끝 표식으로 편 열. */
export function openWord(word: string, endMark: string): string[] {
  return [...word, endMark];
}

/**
 * 말뭉치에서 병합 규칙을 `maxMerges` 개까지 배운다.
 *
 * 동률이면 사전순으로 앞선 짝을 고른다 (규약 2). 더 합칠 짝이 없으면 일찍 멈춘다.
 */
export function learnMerges(
  corpus: readonly CorpusEntry[],
  endMark: string,
  maxMerges: number,
): { rules: MergeRule[]; vocabSize: number } {
  const words = corpus.map((e) => ({ parts: openWord(e.word, endMark), freq: e.freq }));
  const rules: MergeRule[] = [];

  for (let step = 0; step < maxMerges; step += 1) {
    const counts = new Map<string, number>();
    for (const w of words) {
      for (let i = 0; i + 1 < w.parts.length; i += 1) {
        const key = `${w.parts[i]} ${w.parts[i + 1]}`;
        counts.set(key, (counts.get(key) ?? 0) + w.freq);
      }
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [key, c] of counts) {
      if (c > bestCount || (c === bestCount && best !== null && key < best)) {
        best = key;
        bestCount = c;
      }
    }
    if (best === null) break;
    const sp = best.indexOf(' ');
    const left = best.slice(0, sp);
    const right = best.slice(sp + 1);
    rules.push({ left, right });
    for (const w of words) w.parts = mergeAdjacent(w.parts, left, right);
  }

  const vocab = new Set<string>();
  for (const w of words) for (const p of w.parts) vocab.add(p);
  return { rules, vocabSize: vocab.size };
}

/** 낱말 하나를 규칙 열로 자른다 — 배운 차례대로 한 번씩 훑는다 (규약 3). */
export function segmentWord(
  word: string,
  endMark: string,
  rules: readonly MergeRule[],
): string[] {
  let parts = openWord(word, endMark);
  for (const r of rules) parts = mergeAdjacent(parts, r.left, r.right);
  return parts;
}

/** 문장을 낱말마다 잘라 한 줄로 이은 조각 열. */
export function segmentSentence(
  sentence: string,
  endMark: string,
  rules: readonly MergeRule[],
): string[] {
  const out: string[] = [];
  for (const word of sentence.split(' ')) {
    if (word === '') continue;
    out.push(...segmentWord(word, endMark, rules));
  }
  return out;
}

/**
 * 손잡이 값 하나로 한 판을 통째로 셈한다.
 *
 * 화면이 보일 걸음은 **문장을 실제로 바꾼 규칙**뿐이다. 말뭉치에서만 먹고 이
 * 문장에는 안 닿는 규칙이 절반쯤 되는데, 그것까지 걸음으로 세면 아무 일도 안
 * 일어나는 정지 화면이 그만큼 늘어난다.
 */
export function computeSubwordRun(
  data: SubwordSegmentationData,
  mergeCount: number,
): SubwordRun {
  const { rules, vocabSize } = learnMerges(data.corpus, data.endMark, mergeCount);
  const startVocabSize = learnMerges(data.corpus, data.endMark, 0).vocabSize;

  let words = data.sentence
    .split(' ')
    .filter((w) => w !== '')
    .map((w) => openWord(w, data.endMark));
  const flatten = (rows: string[][]): string[] => rows.flat();

  const frames: MergeFrame[] = [];
  rules.forEach((rule, ruleIndex) => {
    const marks: number[] = [];
    const nextWords: string[][] = [];
    let offset = 0;
    for (const parts of words) {
      const merged = mergeMarked(parts, rule.left, rule.right);
      for (const m of merged.marks) marks.push(offset + m);
      nextWords.push(merged.parts);
      offset += parts.length;
    }
    words = nextWords;
    if (marks.length === 0) return;
    frames.push({
      ruleIndex,
      left: rule.left,
      right: rule.right,
      joined: rule.left + rule.right,
      mergedAt: marks,
      pieces: flatten(words),
    });
  });

  return { rules, vocabSize, startVocabSize, pieces: flatten(words), frames };
}

/** 손잡이가 보낸 payload 에서 병합 횟수를 읽는다. 못 읽으면 null (C9). */
function readMergeCount(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function subwordSegmentation(
  ctx: FacetContext<SubwordSegmentationData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<SubwordSegmentationData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : 340;

  /** 계기에 지금 실려 있는 값. 차이만 보내려면 이쪽이 들고 있어야 한다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - prev);
  };

  /**
   * 손잡이 값 하나로 한 판을 보인다.
   *
   * 돌려주는 boolean 은 **살아 있는가** 하나만 뜻한다. 갈림을 여기 겹치지 않는다 (C8).
   */
  async function play(merges: number): Promise<boolean> {
    const run = computeSubwordRun(data, merges);
    const opening = segmentSentence(data.sentence, data.endMark, []);

    gauge('piece-count', opening.length);
    gauge('vocab-size', run.startVocabSize);
    await ctx.emit({
      type: 'run-begin',
      payload: {
        merges,
        pieces: opening,
        pieceCount: opening.length,
        vocabSize: run.startVocabSize,
      },
    });
    if (!(await rx.sleep(stepMs))) return false;

    for (const frame of run.frames) {
      if (ctx.cancelled) return false;
      gauge('piece-count', frame.pieces.length);
      await ctx.emit({
        type: 'pair-merged',
        payload: {
          merges,
          ruleIndex: frame.ruleIndex,
          ruleCount: run.rules.length,
          left: frame.left,
          right: frame.right,
          joined: frame.joined,
          pieces: frame.pieces,
          mergedAt: frame.mergedAt,
          pieceCount: frame.pieces.length,
        },
      });
      if (!(await rx.sleep(stepMs))) return false;
    }

    gauge('piece-count', run.pieces.length);
    gauge('vocab-size', run.vocabSize);
    await ctx.emit({
      type: 'run-settled',
      payload: {
        merges,
        pieces: run.pieces,
        pieceCount: run.pieces.length,
        vocabSize: run.vocabSize,
        applied: run.frames.length,
      },
    });
    return true;
  }

  try {
    let current = data.initialMerges;
    if (!(await play(current))) return;

    for (;;) {
      // 앞 검사는 루프 안 첫 줄이다 — 밖에 두면 continue 경로를 안 덮는다 (C8).
      if (ctx.cancelled) return;
      const input = await rx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'merges') continue;
      const picked = readMergeCount(input.payload);
      if (picked === null || !data.mergeCounts.includes(picked)) continue;
      if (picked === current) continue;
      current = picked;
      if (!(await play(current))) return;
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
