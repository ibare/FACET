/**
 * 앙상블 투표 — 여러 나무가 투표한다.
 *
 * 물음마다 나무들의 답이 **갈리고**, 다수 쪽으로 **모인** 답을 정답과 견준다.
 * 지는 표는 지우지 않는다 — 지우면 "여럿이라 낫다" 가 아니라 "다 맞혔다" 로
 * 읽힌다. 맺음에서 나무별 맞힌 수와 다수결의 맞힌 수를 나란히 놓는다.
 *
 * ── 이벤트 (facet 고유 + 표준 done). 전부 silent 아님 — 걸음마다 화면이 바뀐다.
 *
 * **어느 발신도 payload 를 싣지 않는다.** 화면에 나란히 뜨는 수는 전부 판에서
 * 세지는 것이라, 실어 보내면 그림과 다른 출처가 되어 언젠가 갈린다. 세는 규칙이
 * 한 벌이어야 하는 것만 아래 두 함수로 내주고 `scene.ts` 가 그것을 부른다.
 *
 *   board-ready    {}  판이 다 놓였다. 나무 수 · 물음 수 · 놓인 답의 수는 바탕에서 센다.
 *   votes-split    {}  이 열의 답이 갈린다. 표의 셈은 `voteCounts` 로 나온다.
 *   votes-gathered {}  다수 쪽이 하나로 모여 앉고 정답과 견주어진다. 다수도 정답도
 *                      판에 놓인 답과 선언된 정답에서 나온다.
 *   done           {}  맺음. 나무별 맞힌 수와 다수결의 맞힌 수 전부 판에서 센다.
 *   rewind         {}  자동 재생을 마친 뒤 advance 를 받아 처음으로 돌아간다.
 *
 * ── metric 은 부르지 않는다 (조각).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ManyTreesVoteData = {
  type: string;
  /** 나무 이름. 화면의 행 순서이자 answers 의 바깥 차원. */
  trees: string[];
  /** 물음 이름. 화면의 열 순서이자 answers 의 안쪽 차원. */
  questions: string[];
  /** 고를 수 있는 답. 화면에서 왼쪽부터 이 순서로 갈라진다. */
  options: string[];
  /** 물음마다의 정답. questions 와 길이가 같다. */
  truth: string[];
  /** answers[나무][물음] — 스물다섯 개의 답. */
  answers: string[][];
  /** 걸음 간격 (ms). 읽을 시간을 정하는 저작 결정. */
  stepMs: number;
};

const DEFAULT_STEP_MS = 800;

/**
 * 물음 하나의 표를 options 순서대로 센다.
 *
 * **algorithm 과 장면이 이 한 벌을 함께 쓴다.** 셈을 발신에 실으면 화면이 그리는
 * 표와 캡션이 말하는 수가 서로 다른 출처가 된다. 표를 세는 일은 이 조각이 피하려는
 * 셈이 아니라 바탕에서 곧바로 나오는 것이라 내주는 편이 옳다.
 */
export function voteCounts(options: readonly string[], votes: readonly string[]): number[] {
  const counts = options.map(() => 0);
  for (const vote of votes) {
    const at = options.indexOf(vote);
    if (at >= 0) counts[at] += 1;
  }
  return counts;
}

/**
 * 표가 가장 많은 선택지의 자리. 최다가 갈리면 -1.
 *
 * 다수를 고르는 잣대도 한 벌이다 — 화면의 다수결 칸과 algorithm 의 동수 검사가
 * 같은 함수를 지난다.
 */
export function majorityIndex(counts: readonly number[]): number {
  let top = -1;
  let best = -1;
  let tied = false;
  for (let i = 0; i < counts.length; i += 1) {
    const n = counts[i] ?? 0;
    if (n > best) {
      best = n;
      top = i;
      tied = false;
    } else if (n === best) {
      tied = true;
    }
  }
  return tied || top < 0 ? -1 : top;
}

/** 데이터가 판을 이룰 수 있는지 본다. 어긋나면 화면이 조용히 거짓을 말하게 된다. */
function assertShape(data: ManyTreesVoteData): void {
  const { trees, questions, options, truth, answers } = data;
  if (trees.length === 0 || questions.length === 0) {
    throw new Error('앙상블 투표 데이터가 비어 있다: trees 또는 questions 가 0개');
  }
  if (options.length < 2) {
    throw new Error(`앙상블 투표 선택지 부족: options ${options.length}개 — 둘 이상이어야 갈린다`);
  }
  if (truth.length !== questions.length) {
    throw new Error(
      `앙상블 투표 정답 길이 불일치: truth ${truth.length}개 · questions ${questions.length}개`,
    );
  }
  if (answers.length !== trees.length) {
    throw new Error(
      `앙상블 투표 답표 행 불일치: answers ${answers.length}행 · trees ${trees.length}그루`,
    );
  }
  for (let t = 0; t < answers.length; t += 1) {
    if (answers[t].length !== questions.length) {
      throw new Error(
        `앙상블 투표 답표 열 불일치: ${trees[t]} 의 답 ${answers[t].length}개 · questions ${questions.length}개`,
      );
    }
    // 선택지 밖의 답은 표로 세어지지 않아 화면의 셈이 조용히 비어 버린다.
    for (let q = 0; q < answers[t].length; q += 1) {
      if (!options.includes(answers[t][q])) {
        throw new Error(
          `앙상블 투표 선택지 밖의 답: ${trees[t]} 가 ${questions[q]} 에 "${answers[t][q]}" 라 했다`,
        );
      }
    }
  }
}

export const manyTreesVoteAlgorithm = async (
  ctx: FacetContext<ManyTreesVoteData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ManyTreesVoteData>;
  const data = rc.data;
  assertShape(data);

  const { questions, options, answers } = data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생을 마쳤는가. 마친 뒤로는 걸음마다 advance 를 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문은 그냥 지난다 — 첫 누름이 되감기만 하고 멈추면 안 된다. */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  }

  /** 한 바퀴 — 판을 놓고 물음을 차례로 투표에 부친 뒤 견준다. 취소되면 false. */
  async function playThrough(): Promise<boolean> {
    await rc.emit({ type: 'board-ready' });

    for (let q = 0; q < questions.length; q += 1) {
      if (!(await gate())) return false;

      await rc.emit({ type: 'votes-split' });

      if (!(await gate())) return false;

      // 동수면 다수가 없어 화면이 "모인다" 를 말할 수 없다. 자료의 문제다.
      if (majorityIndex(voteCounts(options, answers.map((row) => row[q]))) < 0) {
        throw new Error(
          `앙상블 투표 동수: ${questions[q]} 에서 최다 표가 갈렸다 — 나무 수를 홀수로 둔다`,
        );
      }

      await rc.emit({ type: 'votes-gathered' });
    }

    if (!(await gate())) return false;

    await rc.emit({ type: 'done' });
    return true;
  }

  if (!(await playThrough())) return;

  // 자동 재생이 끝났다. 이제부터는 누를 때마다 한 걸음씩 되짚는다.
  manual = true;
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    freeGate = true;
    if (!(await playThrough())) return;
  }
};
