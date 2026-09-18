/**
 * 자르는 자리 — 같은 글을 두 방식으로 자르고, 칼자리가 문장을 가르는지 센다.
 *
 * 글은 문단의 목록이다 (영어 원문 그대로, 번역하지 않는다).
 * - 낱말 = 공백으로 가른 덩이. 구두점은 붙은 낱말에 딸린다.
 * - 문장 = 마침표(`.`)로 끝나는 낱말까지. 마침표 없이 남은 낱말은 마지막 문장이 된다.
 * - 칼자리 `at` = "앞에서 `at` 낱말 뒤" (1 부터 센 낱말 `at` 과 `at + 1` 사이).
 * - 끊긴 문장 = 칼자리가 그 문장의 첫 낱말과 끝 낱말 **사이**에 떨어진 문장.
 *   문장 끝 바로 뒤에 떨어진 칼자리는 끊김이 아니다.
 *
 * 두 방식:
 * - 고정 자르기 — 처음부터 `size` 낱말마다 자른다. 마지막 조각은 남은 만큼. 겹침 없음.
 * - 문단 자르기 — 문단 하나가 조각 하나. 겹침 없음.
 * 두 방식의 칼자리를 차례대로 짝지어, 고정 칼자리가 문단 끝으로 옮겨 가는 걸음으로 보인다.
 * (사양이 `size` 를 두 방식의 조각 수가 같아지게 골랐다. 수가 다르면 짧은 쪽까지만 짝짓는다.)
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 * - `init`  { words: string[]; sentences: [number, number][]; paragraphs: number; size: number }
 *           sentences 는 문장마다 [첫 낱말, 끝 낱말] — 0 기준 낱말 번호
 * - `cut`   { at: number; torn: number | null }
 *           고정 칼자리 하나가 떨어진다. torn 은 그것이 가른 문장 번호(0 기준), 없으면 null
 * - `move`  { from: number; to: number; rejoined: number | null; torn: number | null }
 *           칼자리 하나가 문단 끝으로 옮겨 간다. rejoined 는 다시 한 조각에 든 문장,
 *           torn 은 새 칼자리가 가른 문장 (이 자료에서는 없다)
 * - `done`  { chunks: number; fixedTorn: number; paragraphTorn: number; sentences: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WhereToCutFacetData = {
  type: 'where-to-cut';
  /** 문단들. 영어 원문 그대로 — 자료다. */
  paragraphs: string[];
  /** 고정 자르기의 길이 (낱말 수). */
  size: number;
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

/** 문장마다 [첫 낱말, 끝 낱말] (0 기준). */
function sentencesOf(words: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < words.length; i += 1) {
    if (words[i]!.endsWith('.')) {
      out.push([start, i]);
      start = i + 1;
    }
  }
  if (start < words.length) out.push([start, words.length - 1]);
  return out;
}

/** 칼자리 `at` (앞 `at` 낱말 뒤) 이 가르는 문장 번호. 없으면 null. */
function sentenceCutBy(sentences: Array<[number, number]>, at: number): number | null {
  for (let s = 0; s < sentences.length; s += 1) {
    const [a, b] = sentences[s]!;
    // 칼자리는 낱말 at-1 과 at 사이. 둘 다 같은 문장 안이면 끊긴다.
    if (a <= at - 1 && at <= b) return s;
  }
  return null;
}

export async function whereToCut(context: FacetContext<WhereToCutFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<WhereToCutFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const words: string[] = [];
  const paragraphEnds: number[] = [];
  for (const p of data.paragraphs) {
    if (ctx.cancelled) return;
    for (const w of p.split(/\s+/)) if (w.length > 0) words.push(w);
    paragraphEnds.push(words.length);
  }
  const sentences = sentencesOf(words);
  const total = words.length;

  const fixedCuts: number[] = [];
  for (let at = data.size; at < total; at += data.size) {
    if (ctx.cancelled) return;
    fixedCuts.push(at);
  }
  const paragraphCuts = paragraphEnds.slice(0, -1);

  // 첫 걸음은 문 밖에 둔다 — 마운트 직후 빈 화면을 두지 않는다.
  await ctx.emit({
    type: 'init',
    payload: {
      words: [...words],
      sentences: sentences.map(([a, b]) => [a, b]),
      paragraphs: paragraphEnds.length,
      size: data.size,
    },
  });

  let fixedTorn = 0;
  for (const at of fixedCuts) {
    if (!(await pause())) return;
    const torn = sentenceCutBy(sentences, at);
    if (torn !== null) fixedTorn += 1;
    await ctx.emit({ type: 'cut', payload: { at, torn } });
  }

  // 지금 칼자리들이 가른 문장 — 옮길 때마다 새로 센다.
  const live = [...fixedCuts];
  const pairs = Math.min(fixedCuts.length, paragraphCuts.length);
  for (let k = 0; k < pairs; k += 1) {
    if (!(await pause())) return;
    const from = fixedCuts[k]!;
    const to = paragraphCuts[k]!;
    const was = sentenceCutBy(sentences, from);
    const torn = sentenceCutBy(sentences, to);
    const rejoined = was !== null && was !== torn ? was : null;
    live[k] = to;
    await ctx.emit({ type: 'move', payload: { from, to, rejoined, torn } });
  }

  if (!(await pause())) return;
  let paragraphTorn = 0;
  for (const at of live) {
    if (ctx.cancelled) return;
    if (sentenceCutBy(sentences, at) !== null) paragraphTorn += 1;
  }
  await ctx.emit({
    type: 'done',
    payload: {
      chunks: live.length + 1,
      fixedTorn,
      paragraphTorn,
      sentences: sentences.length,
    },
  });
}
