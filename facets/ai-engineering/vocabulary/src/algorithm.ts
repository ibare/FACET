/**
 * 어휘 사전 — 어휘가 무엇을 담았느냐가 무엇을 잘 자르는지 정한다.
 *
 * 진행 모델은 reactive 다 (선언 자리는 `index.ts`). 마운트 직후 첫 말뭉치로 시험
 * 낱말 여섯을 한 번 자르고, 그 뒤로는 말뭉치 손잡이를 기다린다. 손잡이를 옮기면
 * 그 말뭉치로 다시 학습해 **같은 낱말을 다시 자른다** — 자르는 자리가 옮겨 간다.
 *
 * ── 발신 이벤트 (facet 고유 확장 어휘)
 *
 *   corpus-chosen   { index: number; corpus: string; size: number }
 *       말뭉치 하나를 골라 병합 규칙을 학습했다. silent 아님 — 머리 표가 바뀐다.
 *   word-cut        { word: string; parts: string[]; pieces: number }
 *       시험 낱말 하나를 그 규칙으로 잘랐다. silent 아님 — 경계가 옮겨 간다.
 *   corpus-settled  { index: number; corpus: string; total: number; size: number;
 *                     tieWith: string | null }
 *       여섯을 다 자르고 합계를 냈다. `tieWith` 는 앞서 **같은 합계**를 낸 다른
 *       말뭉치의 이름이고, 없으면 null. silent 아님.
 *
 * `phase` 는 발신하지 않는다. 코드 패널이 없기 때문이고 (까닭은 `irs.ts` 머리말),
 * C3 은 all-or-none 이라 한쪽만 두면 안 된다.
 *
 * ── 계기 (`facet.ts` 의 metrics 와 이름이 같아야 한다, C5)
 *
 *   piece-sum        시험 낱말 여섯의 조각 합계. 낱말을 자를 때마다 는다.
 *   vocabulary-size  어휘 크기 — 말뭉치의 낱말을 그 규칙으로 잘랐을 때 나오는
 *                    서로 다른 조각의 수.
 *
 * ── BPE 규약 셋. 이것을 안 지키면 아래 수가 재현되지 않는다
 *
 *  1. **낱말 끝 표식을 독립 기호로 붙인다.** `cell` 은 `c · e · l · l · </w>`
 *     다섯 원소로 시작하고, 표식도 다른 글자와 똑같이 병합 대상이 된다.
 *  2. **짝 빈도가 같으면 사전순으로 앞선 짝을 고른다.** 짝을 `"<왼쪽> <오른쪽>"`
 *     문자열로 적었을 때 사전순 최소다. 정해 두지 않으면 같은 말뭉치에서도
 *     실행마다 다른 어휘가 나온다.
 *  3. **자르는 것은 어휘 목록이 아니라 병합 규칙 열이다.** 어휘에서 최장일치를
 *     찾는 것이 아니라, 학습으로 얻은 규칙을 **배운 차례대로 한 번씩 훑으며**
 *     인접한 두 조각이 그 규칙과 맞으면 합친다. 어휘 목록은 표시용 산물이고
 *     중간 조각은 거기 안 보일 수 있다 — 화면이 "어휘에 있는 것만으로 자른다"
 *     고 말하면 거짓이 된다.
 *
 * ── 병합 40 회로 학습해 실제로 나오는 값
 *
 *   낱말        everyday   biology              code
 *   cellular    9          6 (cell u l a r _)   8
 *   genetic     7          1 (genetic_)         7
 *   indexed     8          7                    4 (index e d _)
 *   strings     8          6                    2 (string s_)
 *   organism    7          5                    9  ← everyday 보다도 나쁘다
 *   numbers     8          7                    2 (number s_)
 *   합계        47         32                   32
 *   어휘 크기   14         28                   28
 *
 * `biology` 와 `code` 는 합계가 32 로 같은데 **어느 낱말을 잘 자르는지가 정반대**다.
 * 어휘는 자기가 본 것만 잘 자른다. `test/vocabulary.test.ts` 가 이 표를 잠근다.
 *
 * `everyday` 는 병합이 39 회에서 멈춘다 — 낱말 열넷이 모두 한 덩이가 되어 더 합칠
 * 짝이 남지 않기 때문이다. 거기서 배운 어휘에는 긴 영어 낱말의 속조각이 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 말뭉치 하나 — 이름과 낱말별 빈도. */
export type VocabularyCorpus = {
  name: string;
  words: Record<string, number>;
};

export type VocabularyData = {
  type: string;
  corpora: VocabularyCorpus[];
  /** 세 말뭉치에 똑같이 들이대는 시험 낱말. */
  testWords: string[];
  /** 학습 병합 횟수. */
  merges: number;
  /** 낱말 끝 표식. 다른 글자와 똑같이 병합 대상이 된다. */
  endMark: string;
  /** 마운트 직후 고르는 말뭉치. control-bar 구간의 default 와 같아야 한다. */
  initialCorpus: number;
  /** 걸음 사이의 정지 시간 — 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** 학습으로 얻은 병합 규칙 하나. 배운 차례가 곧 적용 차례다. */
export type MergeRule = { left: string; right: string };

/** 조각 열에서 인접한 (left, right) 를 모두 하나로 합친다. */
function applyRule(parts: string[], rule: MergeRule): string[] {
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i + 1 < parts.length && parts[i] === rule.left && parts[i + 1] === rule.right) {
      out.push(rule.left + rule.right);
      i += 1;
      continue;
    }
    out.push(parts[i]);
  }
  return out;
}

/**
 * 말뭉치에서 병합 규칙을 학습한다.
 *
 * 빈도가 같은 짝이 여럿이면 `"<왼쪽> <오른쪽>"` 의 사전순 최소를 고른다 (규약 2).
 * 더 합칠 짝이 없으면 요청한 횟수를 못 채우고 멈춘다.
 */
export function trainMerges(
  words: Record<string, number>,
  merges: number,
  endMark: string,
): MergeRule[] {
  const rows = Object.entries(words).map(([word, freq]) => ({
    parts: [...word, endMark],
    freq,
  }));
  const rules: MergeRule[] = [];

  for (let step = 0; step < merges; step += 1) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (let i = 0; i + 1 < row.parts.length; i += 1) {
        const key = `${row.parts[i]} ${row.parts[i + 1]}`;
        counts.set(key, (counts.get(key) ?? 0) + row.freq);
      }
    }
    // 낱말이 모두 한 덩이가 되면 여기 닿는다 (everyday 가 39 회에서 그렇다).
    if (counts.size === 0) break;

    let bestKey = '';
    let bestCount = -1;
    for (const [key, count] of counts) {
      if (count > bestCount || (count === bestCount && key < bestKey)) {
        bestKey = key;
        bestCount = count;
      }
    }

    const sep = bestKey.indexOf(' ');
    const rule: MergeRule = { left: bestKey.slice(0, sep), right: bestKey.slice(sep + 1) };
    rules.push(rule);
    for (const row of rows) row.parts = applyRule(row.parts, rule);
  }

  return rules;
}

/**
 * 낱말 하나를 병합 규칙 열로 자른다.
 *
 * 어휘 목록에서 최장일치를 찾는 것이 아니다 — 배운 차례대로 규칙을 한 번씩
 * 훑는다 (규약 3).
 */
export function segmentWord(
  word: string,
  rules: readonly MergeRule[],
  endMark: string,
): string[] {
  let parts = [...word, endMark];
  for (const rule of rules) parts = applyRule(parts, rule);
  return parts;
}

/**
 * 어휘 — 말뭉치의 낱말을 그 규칙으로 잘랐을 때 나오는 서로 다른 조각.
 *
 * 이것이 화면이 말하는 "어휘 크기" 다. 학습 중간에 생겼다가 더 큰 조각에 먹힌
 * 부분 조각은 여기 없다 — 규약 3 이 말하는 대로, 목록은 산물이지 자르는 도구가
 * 아니기 때문이다.
 */
export function vocabularyOf(
  words: Record<string, number>,
  rules: readonly MergeRule[],
  endMark: string,
): string[] {
  const seen = new Set<string>();
  for (const word of Object.keys(words)) {
    for (const part of segmentWord(word, rules, endMark)) seen.add(part);
  }
  return [...seen];
}

/** 손잡이가 보낸 payload 에서 말뭉치 번호를 읽는다. 못 읽으면 null (C9). */
function readCorpusIndex(payload: unknown, count: number): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).value;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value >= count) return null;
  return value;
}

/** 손잡이를 기다린 결과. 갈림과 취소를 boolean 하나로 겹치지 않는다 (C8). */
type Handle = { kind: 'corpus'; index: number } | { kind: 'cancelled' };

export async function vocabulary(ctx: FacetContext<VocabularyData>): Promise<void> {
  const rctx = ctx as ReactiveContext<VocabularyData>;
  const data = ctx.data;
  const corpora = data.corpora;
  if (corpora.length === 0 || data.testWords.length === 0) return;

  /**
   * 계기는 누적 채널이다 — 러너는 **되감기 때만** 비운다. 손잡이를 돌려 다시 도는
   * 것은 되감기가 아니므로, 그대로 두면 판을 거듭할수록 수가 쌓여 손잡이와 무관한
   * 값이 뜬다. 그래서 지금 값을 들고 **차이만** 보낸다.
   *
   * 차이가 0 이어도 보낸다. 안 보내면 갈리지 않는 손잡이 값에서 계기 이름이 통째로
   * 안 실려 "선언한 계기가 빠진 것" 과 구별되지 않는다 — 이 화면은 `biology` 와
   * `code` 의 합계가 둘 다 32 라 그 자리를 실제로 만난다.
   *
   * 이름은 호출부에 리터럴로 남으므로 grep 으로 잡힌다 (C5).
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return rctx.sleep(data.stepMs);
  };

  /** 말뭉치 이름 → 그 말뭉치가 낸 합계. 같은 합계를 알아보는 데 쓴다. */
  const seenTotals = new Map<string, number>();

  const runCorpus = async (index: number): Promise<boolean> => {
    const corpus = corpora[index];
    const rules = trainMerges(corpus.words, data.merges, data.endMark);
    const size = vocabularyOf(corpus.words, rules, data.endMark).length;

    setMetric('vocabulary-size', size);
    setMetric('piece-sum', 0);
    await ctx.emit({
      type: 'corpus-chosen',
      payload: { index, corpus: corpus.name, size },
    });
    if (!(await pause())) return false;

    let total = 0;
    for (const word of data.testWords) {
      // 문(gate)은 emit **뒤**에 둔다. 첫 걸음 앞에는 기다릴 앞걸음이 없어서,
      // 앞에 두면 말뭉치를 고를 때마다 빈 판이 stepMs 만큼 먼저 보인다. 그래서
      // 이 줄이 이 루프의 진입 검사다 (C8).
      if (ctx.cancelled) return false;
      const parts = segmentWord(word, rules, data.endMark);
      total += parts.length;
      setMetric('piece-sum', total);
      await ctx.emit({
        type: 'word-cut',
        payload: { word, parts, pieces: parts.length },
      });
      if (!(await pause())) return false;
    }

    let tieWith: string | null = null;
    for (const [name, sum] of seenTotals) {
      if (name !== corpus.name && sum === total) {
        tieWith = name;
        break;
      }
    }
    seenTotals.set(corpus.name, total);

    await ctx.emit({
      type: 'corpus-settled',
      payload: { index, corpus: corpus.name, total, size, tieWith },
    });
    return true;
  };

  /** 말뭉치가 갈리는 입력만 걸음으로 센다 (S-runtime 의 dispatch 단일 경로). */
  const waitForCorpus = async (current: number): Promise<Handle> => {
    for (;;) {
      // 앞 — `continue` 로 돌아와도 여기를 지난다.
      if (ctx.cancelled) return { kind: 'cancelled' };
      const input = await rctx.waitForInput();
      // 뒤 — 취소 시 reject 한다는 규약에 기대지 않는다.
      if (ctx.cancelled) return { kind: 'cancelled' };
      if (input.type !== 'corpus') continue;
      const next = readCorpusIndex(input.payload, corpora.length);
      if (next === null || next === current) continue;
      return { kind: 'corpus', index: next };
    }
  };

  let index =
    data.initialCorpus >= 0 && data.initialCorpus < corpora.length ? data.initialCorpus : 0;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runCorpus(index))) return;
      const handle = await waitForCorpus(index);
      if (handle.kind === 'cancelled') return;
      index = handle.index;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다. 그 밖의
    // 오류는 그대로 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
