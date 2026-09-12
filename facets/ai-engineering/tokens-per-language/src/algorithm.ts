/**
 * tokens-per-language — 같은 뜻인데 조각 수가 몇 배 차이 난다.
 *
 * 말뭉치(영어 낱말)로 병합 규칙을 배우고, 그 규칙으로 같은 뜻의 문장 다섯을
 * 자른다. 어휘가 한 언어에 맞춰져 있으면 그 언어의 문장만 낱말째로 서고
 * 나머지는 낱글자로 부서진다.
 *
 * ── 이벤트 목록 / payload 스키마 (C2)
 *
 *   vocab-learned    { corpusWords: number; tokens: string[] }
 *                    말뭉치 낱말 수와, 병합을 마친 뒤 말뭉치가 실제로 쓰는 어휘.
 *   sentences-shown  payload 없음. 문장 다섯을 자르기 전 모습으로 드러낸다.
 *   scatter          { code: string; chars: number; pieces: string[];
 *                      pieceCount: number; ratioTenths: number }
 *                    한 언어의 문장을 어휘로 자른다. ratioTenths 는 으뜸 언어
 *                    대비 배수를 열 배로 셈한 정수 (35 = 3.5배).
 *   done             { baseCode: string; minCount: number; maxCount: number }
 *                    배수를 잰 으뜸 언어와, 가장 적은 조각 수와 가장 많은 조각 수.
 *   rewind           payload 없음. 되감아 처음 상태로.
 *
 * silent 인 이벤트는 없다 — 다섯 모두 화면이 바뀌는 걸음이다.
 *
 * 화면에 뜨는 문안은 여기서 정하지 않는다. 이 파일은 수와 조각만 내보내고
 * 문장은 projector 가 messages 에서 가져온다 (C10).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TokensPerLanguageData = {
  type: string;
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
  /** 병합을 몇 번 돌릴지. */
  mergeCount: number;
  /** 배수를 재는 기준이 되는 언어 코드. */
  baseCode: string;
  /** 어휘를 배울 말뭉치 — 낱말과 그 빈도. */
  corpus: { word: string; freq: number }[];
  /** 같은 뜻의 문장들. 코드는 화면에 띄울 이름이 아니라 데이터의 식별자다. */
  sentences: { code: string; text: string }[];
};

/** 붙여 하나로 만들 두 조각. */
type Merge = { a: string; b: string };

/** 이웃한 두 조각이 나란히 선 자리를 모두 붙인다. */
function applyMerge(parts: string[], a: string, b: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i + 1 < parts.length && parts[i] === a && parts[i + 1] === b) {
      out.push(a + b);
      i += 1;
    } else {
      out.push(parts[i]);
    }
  }
  return out;
}

/**
 * 말뭉치에서 병합 규칙을 배운다.
 *
 * 가장 자주 붙어 다니는 두 조각을 하나로 묶기를 되풀이한다. 빈도가 같으면
 * 사전순으로 앞선 짝을 고른다 — 동점 처리를 정해 두지 않으면 같은 말뭉치에서
 * 다른 어휘가 나와, 화면에 뜨는 수가 실행할 때마다 달라진다.
 */
function learnMerges(
  corpus: { word: string; freq: number }[],
  mergeCount: number,
): { merges: Merge[]; vocab: string[] } {
  const words = corpus.map((entry) => ({ parts: [...entry.word], freq: entry.freq }));
  const merges: Merge[] = [];

  for (let round = 0; round < mergeCount; round += 1) {
    const counts = new Map<string, number>();
    for (const word of words) {
      for (let i = 0; i + 1 < word.parts.length; i += 1) {
        const key = `${word.parts[i]} ${word.parts[i + 1]}`;
        counts.set(key, (counts.get(key) ?? 0) + word.freq);
      }
    }
    if (counts.size === 0) break;

    let best = '';
    let bestFreq = -1;
    for (const [key, freq] of counts) {
      if (freq > bestFreq || (freq === bestFreq && key < best)) {
        best = key;
        bestFreq = freq;
      }
    }

    const sep = best.indexOf(' ');
    const a = best.slice(0, sep);
    const b = best.slice(sep + 1);
    merges.push({ a, b });
    for (const word of words) word.parts = applyMerge(word.parts, a, b);
  }

  // 어휘는 병합을 마친 말뭉치가 실제로 쓰는 조각들이다. 도중에 더 큰 조각에
  // 통째로 먹힌 조각은 남지 않는다.
  const vocab = [...new Set(words.flatMap((word) => word.parts))].sort();
  return { merges, vocab };
}

/** 배운 규칙을 배운 차례대로 먹여 낱말 하나를 자른다. */
function cutWord(merges: Merge[], word: string): string[] {
  let parts = [...word];
  for (const merge of merges) parts = applyMerge(parts, merge.a, merge.b);
  return parts;
}

/** 문장을 자른다. 조각은 낱말 경계를 넘지 않는다. */
function cutSentence(merges: Merge[], text: string): string[] {
  return text
    .split(' ')
    .filter((word) => word.length > 0)
    .flatMap((word) => cutWord(merges, word));
}

/** 으뜸 언어 대비 배수를 한 자리까지. 반올림해 열 배 정수로 돌려준다. */
function ratioTenthsOf(pieces: number, base: number): number {
  if (base <= 0) return 0;
  return Math.floor((pieces * 10 + Math.floor(base / 2)) / base);
}

export async function tokensPerLanguageAlgorithm(
  ctx: FacetContext<TokensPerLanguageData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<TokensPerLanguageData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const corpus = data.corpus;
  const sentences = data.sentences;

  const { merges, vocab } = learnMerges(corpus, data.mergeCount);

  const rows = sentences.map((sentence) => {
    const pieces = cutSentence(merges, sentence.text);
    return {
      code: sentence.code,
      chars: sentence.text.replace(/ /g, '').length,
      pieces,
    };
  });

  const baseRow = rows.find((row) => row.code === data.baseCode) ?? rows[0];
  const baseCount = baseRow === undefined ? 0 : baseRow.pieces.length;
  const baseCode = baseRow === undefined ? '' : baseRow.code;
  const counts = rows.map((row) => row.pieces.length);
  const minCount = counts.length === 0 ? 0 : Math.min(...counts);
  const maxCount = counts.length === 0 ? 0 : Math.max(...counts);

  /** 자동 재생 중인가, 한 걸음씩 짚는 중인가. */
  let manual = false;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const elapsed = await rctx.sleep(stepMs);
    return elapsed && !ctx.cancelled;
  }

  async function waitForAdvance(): Promise<boolean> {
    try {
      for (;;) {
        // 앞 — 루프 안에 둔다. 밖에 두면 advance 아닌 입력에 돌아왔을 때 이 검사를
        // 지나지 않는다. waitForInput 이 취소 시 reject 하더라도 그 규약에 기대지
        // 않는다 (C8).
        if (ctx.cancelled) return false;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return false;
        // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 걸음으로 세지 않게 (S-piece).
        if (input.type === 'advance') return true;
      }
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!ctx.cancelled) throw err;
      return false;
    }
  }

  /** 걸음 사이의 문. 자동 재생이면 쉬고, 짚어 보는 중이면 누를 때까지 기다린다. */
  async function gate(): Promise<boolean> {
    return manual ? waitForAdvance() : pause();
  }

  async function play(): Promise<boolean> {
    // 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 앞걸음이 없으니 기다릴 것도
    // 없고, 문을 먼저 두면 stepMs 만큼 빈 화면이 보인다 (S-piece).
    await ctx.emit({
      type: 'vocab-learned',
      payload: { corpusWords: corpus.length, tokens: vocab },
    });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'sentences-shown' });

    for (const row of rows) {
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'scatter',
        payload: {
          code: row.code,
          chars: row.chars,
          pieces: row.pieces,
          pieceCount: row.pieces.length,
          ratioTenths: ratioTenthsOf(row.pieces.length, baseCount),
        },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { baseCode, minCount, maxCount } });
    return true;
  }

  try {
    if (!(await play())) return;

    for (;;) {
      if (!(await waitForAdvance())) return;
      // 자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다.
      // 여기서 첫 걸음은 문 밖에 있으므로 되감기 하나로 끝나지 않는다 (S-piece).
      await ctx.emit({ type: 'rewind' });
      manual = true;
      if (!(await play())) return;
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
