/**
 * BPE 학습 — 무엇이 흔하냐가 무엇을 먼저 합칠지 정한다.
 *
 * ── 진행 모델
 *
 * `ReactiveMechanism`. 마운트 직후 기본 빈도로 여섯 걸음을 돌아 보이고, 그 뒤로는
 * `waitForInput` 으로 빈도 손잡이만 기다린다. 재생 · 멈춤 · 한 걸음은 메커니즘이
 * `ctx.sleep` 의 경계에서 지므로 알고리즘이 알 필요가 없다.
 *
 * ── BPE 규약 셋 (이것을 안 지키면 아래 수가 재현되지 않는다)
 *
 * 1. **낱말 끝 표식을 독립 기호로 붙인다.** `sing` 은 `s · i · n · g · </w>` 다섯
 *    원소로 시작하고, 표식도 다른 글자와 똑같이 병합 대상이 된다.
 * 2. **짝 빈도가 같으면 사전순으로 앞선 짝을 고른다.** 짝을 `"<왼쪽> <오른쪽>"`
 *    문자열로 적었을 때 사전순 최소다. 이 말뭉치에는 동률이 실제로 있다 (빈도 2
 *    에서 세 걸음, 18 에서 두 걸음). 정해 두지 않으면 실행마다 다른 화면이 나온다.
 * 3. **자르는 것은 어휘 목록이 아니라 병합 규칙 열이다.** 어휘에서 최장일치를
 *    찾는 것이 아니라, 배운 병합 규칙을 **차례대로 한 번씩 훑으며** 인접한 두
 *    조각이 그 규칙과 맞으면 합친다 (`applyMerge` 를 규칙 순서대로 부르는 것이
 *    곧 그 절차다).
 *
 * ── 이벤트 어휘 (C2)
 *
 *   'run-begin'      새 빈도로 처음부터 돈다.                     silent: false
 *       payload { freq, steps, words: { word, freq, tokens }[] }
 *   'pairs-ranked'   이웃 짝을 모두 세어 줄 세웠다.                silent: false
 *       payload { step, rows: { left, right, count, whole }[], tied }
 *   'merge-chosen'   그중 하나를 골랐다.                           silent: false
 *       payload { step, left, right, token, count, tied, whole }
 *   'tokens-merged'  고른 짝을 말뭉치 전체에 적용했다.             silent: false
 *       payload { step, words: { word, freq, tokens }[], vocabSize, wholeWord }
 *   'run-settled'    여섯 걸음을 다 돌았다.                         silent: false
 *       payload { freq, wholeStep, vocabSize, words, rules }
 *
 * `target` 은 쓰지 않는다 — 이 facet 이 가리키는 것은 낱개 원소가 아니라 판
 * 전체의 상태 하나뿐이라, 식별자를 붙이면 뜻 없는 이름만 늘어난다 (C1).
 *
 * ── 받는 입력 (`mechanism.dispatch` → `ctx.waitForInput`)
 *
 *   'freq'  빈도 손잡이가 움직였다.
 *       payload { value: number }  — `freqChoices` 안의 값 하나. 그 밖의 값과
 *                                    그 밖의 type 은 흘린다.
 *
 * ── phase 어휘 (C3)
 *
 * **없다.** 이 완제품은 IR 을 두지 않으므로 코드 패널도 없고 phase 를 받을 자리가
 * 없다. C3 은 all-or-none 이라 한쪽만 두지 않는다. 까닭은 `irs.ts` 머리말에 있다.
 *
 * ── 메트릭 (C5)
 *
 *   'vocab-piece-count'  지금 말뭉치를 이루는 서로 다른 조각의 수
 *   'whole-word-step'    손잡이 낱말이 통째로 한 조각이 된 걸음 (아직이면 0)
 *
 * `ctx.metric` 은 **누적 채널**이다 — 러너는 되감기 때만 계기를 비운다. 손잡이를
 * 돌려 다시 도는 것은 되감기가 아니므로, 지금 값을 들고 차이만 보내는 `gauge` 를
 * 거친다. 차이가 0 이어도 보낸다 — 안 보내면 갈리지 않는 손잡이 값에서 계기
 * 이름이 통째로 안 실려 "선언한 계기가 빠진 것" 과 구별되지 않는다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 말뭉치 한 줄 — 낱말과 그것이 나온 횟수. */
export type BpeWordSpec = { word: string; freq: number };

/** 알고리즘이 보는 판. `facet.ts::initialData` 가 이 모양으로 선언한다. */
export type BpeTrainingData = {
  type: 'bpeTraining';
  /** 말뭉치. 화면에 놓이는 차례이기도 하다. */
  corpus: BpeWordSpec[];
  /** 손잡이가 빈도를 바꾸는 낱말. 나머지 다섯의 빈도는 고정이다. */
  handleWord: string;
  /** 손잡이가 고를 수 있는 빈도. */
  freqChoices: number[];
  /** 처음 돌아 보일 빈도. */
  initialFreq: number;
  /** 몇 걸음을 도는가. */
  mergeSteps: number;
  /** 낱말 끝 표식. 독립 기호로 붙고 다른 글자와 똑같이 병합 대상이 된다. */
  endMark: string;
  /** 걸음 사이의 정지 시간 (ms). 애니메이션이 끝난 뒤부터 센다. */
  stepMs: number;
};

/** 이웃한 두 조각과 그것이 말뭉치 전체에서 나온 횟수. */
export type PairCount = {
  left: string;
  right: string;
  count: number;
  /** 이 짝을 합치면 손잡이 낱말이 통째로 한 조각이 되는가. */
  whole: boolean;
};

/** 배운 병합 규칙 하나. */
export type MergeRule = {
  left: string;
  right: string;
  /** 합쳐서 생긴 조각. */
  token: string;
  count: number;
  /** 고를 때 같은 수가 여럿이었는가 (사전순으로 갈랐다). */
  tied: boolean;
  whole: boolean;
};

/** 한 낱말의 지금 분할. */
export type WordSplit = { word: string; freq: number; tokens: string[] };

/** 한 걸음의 자취 — 세고, 고르고, 적용한 결과. */
export type TrainStep = {
  ranking: PairCount[];
  rule: MergeRule;
  words: WordSplit[];
  vocabSize: number;
  /** 이 걸음에서 손잡이 낱말이 통째가 되었는가. */
  wholeWord: boolean;
};

/** 한 판 전체. */
export type TrainRun = {
  freq: number;
  steps: TrainStep[];
  words: WordSplit[];
  vocabSize: number;
  /** 손잡이 낱말이 통째가 된 걸음 번호 (1-based). 끝내 아니면 0. */
  wholeStep: number;
};

/**
 * 낱말을 원소로 푼다 — 글자 하나씩에 낱말 끝 표식을 독립 기호로 덧붙인다 (규약 1).
 */
export function splitToSymbols(word: string, endMark: string): string[] {
  return [...word.split(''), endMark];
}

/** 짝을 견주는 자. 조각에는 공백이 없으므로 이 문자열이 짝의 정체다 (규약 2). */
function pairKey(left: string, right: string): string {
  return `${left} ${right}`;
}

/**
 * 이웃한 짝을 모두 세어 줄 세운다. 수가 많은 것이 앞, 같으면 사전순으로 앞선 것이
 * 앞이다 — 그래서 `rows[0]` 이 곧 이 걸음의 승자다 (규약 2).
 */
export function rankPairs(words: WordSplit[], wholeToken: string): PairCount[] {
  const counts = new Map<string, number>();
  for (const w of words) {
    for (let i = 0; i + 1 < w.tokens.length; i += 1) {
      const key = pairKey(w.tokens[i], w.tokens[i + 1]);
      counts.set(key, (counts.get(key) ?? 0) + w.freq);
    }
  }
  const rows: PairCount[] = [];
  for (const [key, count] of counts) {
    const at = key.indexOf(' ');
    const left = key.slice(0, at);
    const right = key.slice(at + 1);
    rows.push({ left, right, count, whole: left + right === wholeToken });
  }
  rows.sort((a, b) => b.count - a.count || (pairKey(a.left, a.right) < pairKey(b.left, b.right) ? -1 : 1));
  return rows;
}

/**
 * 규칙 하나를 한 낱말에 적용한다 — 왼쪽부터 한 번 훑으며 맞는 자리를 합친다 (규약 3).
 */
export function applyMerge(tokens: string[], left: string, right: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (i + 1 < tokens.length && tokens[i] === left && tokens[i + 1] === right) {
      out.push(left + right);
      i += 2;
    } else {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out;
}

/** 지금 말뭉치를 이루는 서로 다른 조각의 수. */
export function vocabSizeOf(words: WordSplit[]): number {
  const seen = new Set<string>();
  for (const w of words) for (const tk of w.tokens) seen.add(tk);
  return seen.size;
}

function cloneWords(words: WordSplit[]): WordSplit[] {
  return words.map((w) => ({ word: w.word, freq: w.freq, tokens: [...w.tokens] }));
}

/**
 * 손잡이 낱말의 빈도를 주고 여섯 걸음을 돈다. 순수 함수 — `ctx` 를 받지 않으므로
 * 테스트가 직접 부른다 (C8 Exception).
 */
export function trainBpe(data: BpeTrainingData, freq: number): TrainRun {
  const wholeToken = data.handleWord + data.endMark;
  const words: WordSplit[] = data.corpus.map((w) => ({
    word: w.word,
    freq: w.word === data.handleWord ? freq : w.freq,
    tokens: splitToSymbols(w.word, data.endMark),
  }));

  const steps: TrainStep[] = [];
  let wholeStep = 0;
  for (let i = 0; i < data.mergeSteps; i += 1) {
    const ranking = rankPairs(words, wholeToken);
    if (ranking.length === 0) break;
    const top = ranking[0];
    const tied = ranking.length > 1 && ranking[1].count === top.count;
    const rule: MergeRule = {
      left: top.left,
      right: top.right,
      token: top.left + top.right,
      count: top.count,
      tied,
      whole: top.whole,
    };
    for (const w of words) w.tokens = applyMerge(w.tokens, top.left, top.right);
    const after = cloneWords(words);
    const handle = after.find((w) => w.word === data.handleWord);
    const becameWhole = wholeStep === 0 && handle !== undefined && handle.tokens.length === 1;
    if (becameWhole) wholeStep = i + 1;
    steps.push({ ranking, rule, words: after, vocabSize: vocabSizeOf(after), wholeWord: becameWhole });
  }

  const final = cloneWords(words);
  return { freq, steps, words: final, vocabSize: vocabSizeOf(final), wholeStep };
}

/** 선언한 값 가운데 하나로 맞춘다. 벗어난 값이면 첫 칸으로 떨어뜨린다. */
function choose(value: number, choices: number[]): number {
  return choices.includes(value) ? value : choices[0];
}

/** 손잡이가 보낸 것인가. 아니면 null — 알 수 없는 조작과 목록 밖의 값은 흘린다. */
function readFreq(input: ReactiveInputEvent, choices: number[]): number | null {
  if (input.type !== 'freq') return null;
  const payload = input.payload as { value?: unknown } | undefined;
  const value = payload?.value;
  if (typeof value !== 'number' || !choices.includes(value)) return null;
  return value;
}

/** 계기를 지금 값으로 맞춘다. 누적 채널이라 차이만 보낸다 (머리말 참조). */
type Gauge = (name: string, value: number) => void;

/**
 * 한 판을 재생한다. 끝까지 돌면 true, 도중에 취소됐으면 false.
 */
async function play(
  ctx: ReactiveContext<BpeTrainingData>,
  freq: number,
  gauge: Gauge,
): Promise<boolean> {
  const data = ctx.data;
  const run = trainBpe(data, freq);
  const start: WordSplit[] = data.corpus.map((w) => ({
    word: w.word,
    freq: w.word === data.handleWord ? freq : w.freq,
    tokens: splitToSymbols(w.word, data.endMark),
  }));

  await ctx.emit({
    type: 'run-begin',
    payload: { freq, steps: run.steps.length, words: start },
  });
  gauge('vocab-piece-count', vocabSizeOf(start));
  gauge('whole-word-step', 0);

  for (let i = 0; i < run.steps.length; i += 1) {
    // 걸음 사이의 문. `sleep` 이 취소를 지므로 이 한 줄이 루프의 진입 검사다 (C8).
    if (!(await ctx.sleep(data.stepMs))) return false;
    const step = run.steps[i];

    await ctx.emit({
      type: 'pairs-ranked',
      payload: { step: i + 1, rows: step.ranking, tied: step.rule.tied },
    });
    if (ctx.cancelled) return false;

    await ctx.emit({
      type: 'merge-chosen',
      payload: {
        step: i + 1,
        left: step.rule.left,
        right: step.rule.right,
        token: step.rule.token,
        count: step.rule.count,
        tied: step.rule.tied,
        whole: step.rule.whole,
      },
    });
    if (ctx.cancelled) return false;

    await ctx.emit({
      type: 'tokens-merged',
      payload: {
        step: i + 1,
        words: step.words,
        vocabSize: step.vocabSize,
        wholeWord: step.wholeWord,
      },
    });
    gauge('vocab-piece-count', step.vocabSize);
    if (step.wholeWord) gauge('whole-word-step', i + 1);
    if (ctx.cancelled) return false;
  }

  await ctx.emit({
    type: 'run-settled',
    payload: {
      freq,
      wholeStep: run.wholeStep,
      vocabSize: run.vocabSize,
      words: run.words,
      rules: run.steps.map((s) => s.rule),
    },
  });
  gauge('vocab-piece-count', run.vocabSize);
  gauge('whole-word-step', run.wholeStep);
  return true;
}

/**
 * 알고리즘 본체. 한 판을 보인 뒤 손잡이를 기다리고, 값이 바뀌면 그 값으로 처음부터
 * 다시 돈다.
 */
export async function bpeTraining(ctx: FacetContext<BpeTrainingData>): Promise<void> {
  const rx = ctx as ReactiveContext<BpeTrainingData>;
  const data = rx.data;

  /**
   * 계기는 누적 채널이라 지금 값을 들고 차이만 보낸다. 이름은 호출부에 리터럴로
   * 남으므로 grep 으로 잡힌다 (C5).
   */
  const shown = new Map<string, number>();
  const gauge: Gauge = (name, value) => {
    const delta = value - (shown.get(name) ?? 0);
    shown.set(name, value);
    rx.metric(name, delta);
  };

  let freq = choose(data.initialFreq, data.freqChoices);

  try {
    if (!(await play(rx, freq, gauge))) return;
    for (;;) {
      // 앞 검사 — `continue` 로 돌아와도 여기를 지난다 (C8).
      if (rx.cancelled) return;
      const input = await rx.waitForInput();
      // 뒤 검사 — throw 규약에 기대지 않는다 (C8).
      if (rx.cancelled) return;
      const next = readFreq(input, data.freqChoices);
      if (next === null || next === freq) continue;
      freq = next;
      if (!(await play(rx, freq, gauge))) return;
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!rx.cancelled) throw err;
  }
}
