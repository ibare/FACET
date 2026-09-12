/**
 * between-letter-and-word — 한 문장을 세 가지 크기로 자른다.
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *
 *   cut      { row: 'word' | 'piece' | 'letter'; segments: string[] }
 *            한 줄이 자기 자리에서 갈라진다. segments 는 자른 결과이며 그 길이가
 *            곧 조각 수다 — 수를 따로 싣지 않는다. 두 자리에 두면 언젠가 어긋난다.
 *            silent 아님.
 *
 *   between  { word: number; piece: number; letter: number; seams: number[] }
 *            셋을 견주는 마지막 걸음. seams 는 조각 줄에서 **낱말 안쪽이 갈린**
 *            자리이며, 값은 그 자리에서 새로 시작하는 글자의 index (0 부터).
 *            silent 아님.
 *
 *   rewind   {}
 *            처음 상태로 되감는다. 자동 재생을 마친 뒤 `advance` 를 처음 누를 때
 *            나가고, 곧바로 첫 걸음이 뒤따른다 (S-piece). silent 아님.
 *
 * ── 1차 데이터와 파생값
 *
 * 선언에 있는 것은 말뭉치(낱말과 빈도)와 병합 횟수와 문장뿐이다. 낱말 6 · 조각 9 ·
 * 글자 28 은 **여기서 셈한다.** 병합 횟수를 바꾸면 조각 수가 따라 바뀌어야 하므로
 * 파생값을 선언에 박지 않는다 (S-piece).
 *
 * BPE 는 낱말 끝에 `</w>` 를 **독립 기호로** 붙이는 본을 쓴다. 이 선택이 결과를
 * 가른다 — 마커 없이 돌리면 같은 26 회 병합에서 `walking` 이 통째로 남아 조각이
 * 일곱이 된다. 마커가 있어야 `ing` 이 네 낱말에 걸친 꼬리로 모여 `walk` 와 갈린다.
 *
 * 메트릭은 부르지 않는다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 말뭉치 한 줄 — 낱말과 그 빈도. */
export type CorpusEntry = { word: string; freq: number };

export type BetweenLetterAndWordData = {
  type: 'between-letter-and-word';
  /** 자를 문장. 낱말 사이는 빈칸 하나. */
  sentence: string;
  /** BPE 를 학습시킨 말뭉치. */
  corpus: CorpusEntry[];
  /** 병합 횟수. */
  merges: number;
  /** 걸음 사이에 쉬는 시간 (S-piece). */
  stepMs: number;
};

/** 낱말 끝 표시. 어휘 안에서만 쓰이고 화면에도 셈에도 나가지 않는다. */
const EOW = '</w>';

type Merge = readonly [string, string];

function symbolsOf(word: string): string[] {
  return [...word, EOW];
}

function applyMerge(symbols: readonly string[], a: string, b: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < symbols.length; i += 1) {
    if (i + 1 < symbols.length && symbols[i] === a && symbols[i + 1] === b) {
      out.push(a + b);
      i += 1;
      continue;
    }
    out.push(symbols[i]);
  }
  return out;
}

/**
 * 말뭉치에서 병합 규칙을 얻는다 — 가장 자주 붙어 다니는 두 기호를 하나로 묶기를
 * `rounds` 번 되풀이한다.
 *
 * 같은 빈도가 여럿이면 **먼저 만난 쌍**이 이긴다. Map 이 넣은 순서를 지키므로
 * 더 큰 값만 갈아 끼우면 그 규칙이 그대로 지켜진다.
 */
export function trainMerges(corpus: readonly CorpusEntry[], rounds: number): Merge[] {
  const words = corpus.map((entry) => ({ symbols: symbolsOf(entry.word), freq: entry.freq }));
  const merges: Merge[] = [];

  for (let round = 0; round < rounds; round += 1) {
    const counts = new Map<string, number>();
    for (const word of words) {
      for (let i = 0; i + 1 < word.symbols.length; i += 1) {
        const pair = `${word.symbols[i]} ${word.symbols[i + 1]}`;
        counts.set(pair, (counts.get(pair) ?? 0) + word.freq);
      }
    }

    let bestPair = '';
    let bestCount = 0;
    for (const [pair, count] of counts) {
      if (count > bestCount) {
        bestPair = pair;
        bestCount = count;
      }
    }
    if (bestPair === '') break;

    const cut = bestPair.indexOf(' ');
    const a = bestPair.slice(0, cut);
    const b = bestPair.slice(cut + 1);
    merges.push([a, b]);
    for (const word of words) word.symbols = applyMerge(word.symbols, a, b);
  }

  return merges;
}

/** 얻은 규칙을 순서대로 먹여 한 낱말을 조각으로 자른다. */
export function segmentWord(word: string, merges: readonly Merge[]): string[] {
  let symbols = symbolsOf(word);
  for (const [a, b] of merges) symbols = applyMerge(symbols, a, b);
  // 낱말 끝 표시는 걷어낸다. 세는 것은 자른 자리이지 표시가 아니다.
  return symbols.map((s) => s.split(EOW).join('')).filter((s) => s !== '');
}

export type Segmentations = {
  /** 낱말 단위. */
  words: string[];
  /** 조각 단위. */
  pieces: string[];
  /** 글자 단위. */
  letters: string[];
  /** 조각 줄에서 낱말 안쪽이 갈린 자리 — 그 자리에서 시작하는 글자의 index. */
  seams: number[];
};

/** 자른 자리들이 시작하는 글자 index. */
function startsOf(segments: readonly string[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const segment of segments) {
    starts.push(at);
    at += segment.length;
  }
  return starts;
}

/**
 * 한 문장을 세 가지 크기로 자른 결과. 화면에 뜨는 수는 전부 여기서 나온다.
 */
export function computeSegmentations(data: BetweenLetterAndWordData): Segmentations {
  const merges = trainMerges(data.corpus, data.merges);
  const words = data.sentence.split(' ').filter((w) => w !== '');
  const pieces = words.flatMap((word) => segmentWord(word, merges));
  const letters = [...data.sentence].filter((ch) => ch !== ' ');

  const wordStarts = new Set(startsOf(words));
  const seams = startsOf(pieces).filter((at) => at > 0 && !wordStarts.has(at));

  return { words, pieces, letters, seams };
}

export async function betweenLetterAndWordAlgorithm(
  ctx: FacetContext<BetweenLetterAndWordData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<BetweenLetterAndWordData>;
  const { words, pieces, letters, seams } = computeSegmentations(rc.data);
  const stepMs = rc.data.stepMs;

  /** 자동 재생을 마쳤는가. 마친 뒤로는 걸음 사이에서 입력을 기다린다. */
  let manual = false;
  /** 이 회차의 첫 걸음인가. 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). */
  let first = true;

  async function waitAdvance(): Promise<boolean> {
    for (;;) {
      if (rc.cancelled) return false;
      try {
        const input = await rc.waitForInput();
        if (rc.cancelled) return false;
        // 받은 것의 종류를 본다 — 위젯 입력이 걸음으로 세어지지 않게 (S-piece).
        if (input.type === 'advance') return true;
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!rc.cancelled) throw err;
        return false;
      }
    }
  }

  /** 걸음 사이의 문. 지나갈 수 있으면 true, 끊겼으면 false. */
  async function gate(): Promise<boolean> {
    if (first) {
      first = false;
      return true;
    }
    if (manual) return waitAdvance();
    return rc.sleep(stepMs);
  }

  for (;;) {
    first = true;

    if (!(await gate())) return;
    await rc.emit({ type: 'cut', payload: { row: 'word', segments: words } });

    if (!(await gate())) return;
    await rc.emit({ type: 'cut', payload: { row: 'piece', segments: pieces } });

    if (!(await gate())) return;
    await rc.emit({ type: 'cut', payload: { row: 'letter', segments: letters } });

    if (!(await gate())) return;
    await rc.emit({
      type: 'between',
      payload: {
        word: words.length,
        piece: pieces.length,
        letter: letters.length,
        seams,
      },
    });

    // 자동 재생은 여기서 끝난다. 이제부터는 눌러야 나아간다.
    manual = true;
    if (!(await waitAdvance())) return;
    if (rc.cancelled) return;
    await rc.emit({ type: 'rewind' });
    // 위로 돌아가면 first 가 다시 참이라, 이 한 번의 누름으로 되감기와 첫 걸음이
    // 함께 나간다 — 눌러도 반응이 없는 것으로 읽히지 않게 (S-piece).
  }
}
