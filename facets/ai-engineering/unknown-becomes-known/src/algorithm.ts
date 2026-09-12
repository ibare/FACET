/**
 * unknownBecomesKnown — 모르는 낱말이 아는 조각으로 쪼개져 받아진다.
 *
 * 답하는 물음: **어휘에 없는 낱말이 오면 어떻게 되는가.**
 * 통째로는 어휘에 없지만 갈라진 두 토막이 각각 어휘 안에 있어, 거절되지 않고
 * 그 조각으로 적힌 채 받아진다.
 *
 * 어휘를 **어떻게 얻었는지**(짝을 세어 잦은 것부터 합치는 학습)는 여기서 말하지
 * 않는다. 어휘를 이미 가진 것으로 놓고 시작한다.
 *
 * ── 자르는 법
 *
 * **자르는 것은 어휘 목록이 아니라 병합 규칙 열이다.** 낱말의 글자를 하나씩 떼고
 * 끝에 `</w>` 를 붙여 놓은 뒤, 학습 때 나온 병합 규칙을 **배운 차례대로 한 번씩**
 * 훑으며 인접한 두 조각이 그 규칙과 맞으면 합친다 (`segment`).
 *
 * 어휘에서 가장 긴 조각을 찾는 방식이 아니다. 둘은 대개 같은 답을 내지만 같은
 * 규칙이 아니고, 그 차이가 화면의 말을 거짓으로 만든다 — **어휘 목록은 보여 주기
 * 위한 산물이라 중간 조각이 거기 없을 수 있다.** 실제로 `warmness` 는
 * `w · arm · ness</w>` 로 잘리는데 `w` 와 `arm` 은 선반에 아예 없다.
 *
 * 규칙 열과 어휘는 말뭉치(낱말 22개와 빈도)를 30회 병합해 실제로 재어 얻었다.
 * 짝 빈도가 같으면 `"<왼쪽> <오른쪽>"` 의 사전순 최소를 고른다 — 작은 말뭉치에서
 * 동점은 흔해서, 정해 두지 않으면 같은 말뭉치에서 다른 어휘가 나온다.
 * 그 규칙 30개가 사양의 어휘 14종과 `boldness → bold · ness</w>` 를 그대로
 * 되내는 것을 대조했다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 인 것은 없다)
 *
 *   vocab-laid     { count: number }                           어휘 선반이 선다
 *   word-splits    { word: string; pieces: string[];           낱말이 조각으로 갈라진다
 *                    seen: boolean }
 *   whole-missed   { word: string }                            통째로 훑어도 맞는 것이 없다
 *   pieces-lock    { word: string; pieces: string[] }          토막이 어휘의 조각과 맞물린다
 *   word-received  { word: string; pieces: string[];           아는 조각으로 적어 받아 낸다
 *                    seen: boolean }
 *   rewind         payload 없음                                처음으로 되감는다
 *   done           { received: number }                        끝
 *
 * `seen` 은 문안이 아니라 데이터다 — 말뭉치에 있던 낱말인지 여부이며, 어떤 말을
 * 띄울지는 projector 가 정한다 (C10).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type UnknownBecomesKnownData = {
  type: string;
  /**
   * 병합 30회 끝에 낱말들이 잘려 있던 조각들. **보여 주기 위한 산물**이며
   * 자르는 데 쓰이지 않는다 — 선반에 무엇을 세울지가 이것으로 정해진다.
   */
  vocab: string[];
  /** 배운 차례 그대로의 병합 규칙. 자르는 일은 이것을 다시 밟는 일이다. */
  merges: string[][];
  /** 말뭉치에 있던 낱말. 자르는 일이 예사로운 일임을 먼저 보인다. */
  corpusWord: string;
  /** 말뭉치에 한 번도 없던 낱말들. */
  unknownWords: string[];
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 낱말 끝 표식. **다른 글자와 똑같은 독립 기호**라 그 자체가 병합 대상이 된다 —
 * 어휘에 `cold</w>` 와 `cold` 가 둘 다 있는 것이 그 증거다. 앞은 낱말이 거기서
 * 닫히는 꼴, 뒤는 접미가 뒤따를 때 쓰이는 꼴이다.
 */
const END = '</w>';

/** 인접한 `(a, b)` 를 모두 `a+b` 로 합친다. */
function mergeOnce(parts: readonly string[], a: string, b: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) {
      out.push(a + b);
      i += 2;
    } else {
      out.push(parts[i]);
      i += 1;
    }
  }
  return out;
}

/**
 * 낱말을 자른다 — 글자를 하나씩 떼고 끝 표식을 붙인 뒤, 병합 규칙을 배운
 * 차례대로 한 번씩 훑으며 맞는 짝을 합친다. 어휘 목록은 보지 않는다.
 */
function segment(word: string, merges: readonly string[][]): string[] {
  let parts = [...word, END];
  for (const rule of merges) {
    if (rule.length < 2) continue;
    parts = mergeOnce(parts, rule[0], rule[1]);
  }
  return parts;
}

export async function unknownBecomesKnownAlgorithm(
  ctx: FacetContext<UnknownBecomesKnownData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<UnknownBecomesKnownData>;
  const { vocab, merges, corpusWord, unknownWords, stepMs } = rc.data;

  /** 자동 재생을 마친 뒤로는 한 걸음씩 짚는다. */
  let manual = false;

  /** 다음 `advance` 를 기다린다. 취소로 깨어났으면 false. */
  async function waitAdvance(): Promise<boolean> {
    try {
      for (;;) {
        if (rc.cancelled) return false;
        const input = await rc.waitForInput();
        if (rc.cancelled) return false;
        // 위젯 입력이 붙는 날을 위해 받은 것의 종류를 본다 (S-piece).
        if (input.type === 'advance') return true;
      }
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!rc.cancelled) throw err;
      return false;
    }
  }

  /**
   * 걸음 **사이**의 간격. 자동 재생이면 쉬고, 한 걸음씩 모드면 `advance` 를
   * 기다린다. 걸음 앞이 아니라 뒤에 두므로 첫 걸음은 문을 지나지 않는다 (S-piece).
   */
  async function pause(): Promise<boolean> {
    if (!manual) return rc.sleep(stepMs);
    return waitAdvance();
  }

  /** 처음부터 끝까지 한 바퀴. 중간에 취소되면 false. */
  async function playThrough(): Promise<boolean> {
    // 1) 아는 조각이 선다. 이것이 가진 전부다.
    await rc.emit({ type: 'vocab-laid', payload: { count: vocab.length } });
    if (!(await pause())) return false;

    // 2) 말뭉치에 있던 낱말도 어휘대로 잘린다 — 자르는 것은 예사로운 일이다.
    const seenPieces = segment(corpusWord, merges);
    if (seenPieces.length > 0) {
      await rc.emit({
        type: 'word-splits',
        payload: { word: corpusWord, pieces: seenPieces, seen: true },
      });
      if (!(await pause())) return false;
      await rc.emit({
        type: 'word-received',
        payload: { word: corpusWord, pieces: seenPieces, seen: true },
      });
      if (!(await pause())) return false;
    }

    // 3) 한 번도 본 적 없는 낱말들. 첫 낱말에서만 "통째로는 없다" 를 세우고
    //    맞물리는 순간을 따로 떼어 보인다 — 그 뒤는 같은 일의 되풀이다.
    let received = 0;
    for (let i = 0; i < unknownWords.length; i += 1) {
      const word = unknownWords[i];
      const pieces = segment(word, merges);
      if (pieces.length === 0) continue;

      if (i === 0) {
        if (!vocab.includes(`${word}${END}`)) {
          await rc.emit({ type: 'whole-missed', payload: { word } });
          if (!(await pause())) return false;
        }
        await rc.emit({ type: 'word-splits', payload: { word, pieces, seen: false } });
        if (!(await pause())) return false;
        await rc.emit({ type: 'pieces-lock', payload: { word, pieces } });
        if (!(await pause())) return false;
      } else {
        await rc.emit({ type: 'word-splits', payload: { word, pieces, seen: false } });
        if (!(await pause())) return false;
      }

      await rc.emit({ type: 'word-received', payload: { word, pieces, seen: false } });
      received += 1;
      if (!(await pause())) return false;
    }

    await rc.emit({ type: 'done', payload: { received } });
    return true;
  }

  if (!(await playThrough())) return;

  // 자동 재생이 끝났다. 이제부터 누르는 `advance` 는 되감고 첫 걸음까지 간다.
  for (;;) {
    if (!(await waitAdvance())) return;
    manual = true;
    await rc.emit({ type: 'rewind' });
    if (!(await playThrough())) return;
  }
}
