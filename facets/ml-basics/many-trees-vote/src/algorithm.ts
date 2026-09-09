/**
 * 앙상블 투표 — 여러 나무가 투표한다.
 *
 * 물음마다 나무들의 답이 **갈리고**, 다수 쪽으로 **모인** 답을 정답과 견준다.
 * 지는 표는 지우지 않는다 — 지우면 "여럿이라 낫다" 가 아니라 "다 맞혔다" 로
 * 읽힌다. 맺음에서 나무별 맞힌 수와 다수결의 맞힌 수를 나란히 놓는다.
 *
 * ── 식별자
 *   index:<q>   물음의 열 번호 (0-based). payload.question 이 정규 경로이고
 *               target 은 열 하나를 가리키는 보조 표기다.
 *
 * ── 이벤트 (facet 고유 + 표준 done). 전부 silent 아님 — 걸음마다 화면이 바뀐다.
 *
 *   board-ready    { trees: number; questions: number; total: number }
 *                  판이 다 놓였다. total 은 화면에 놓인 답의 개수 (나무 × 물음).
 *
 *   votes-split    { question: number; votes: string[]; counts: number[] }
 *                  votes 는 나무 순서대로의 답, counts 는 options 순서대로의 표수.
 *
 *   votes-gathered { question: number; majority: string; truth: string;
 *                    correct: boolean; winners: number[]; losers: number[] }
 *                  winners/losers 는 나무 인덱스. losers 는 화면에 남는다.
 *
 *   done           { treeScores: number[]; best: number; perfect: number;
 *                    majorityScore: number; total: number }
 *                  total 은 물음의 개수 (분모). perfect 는 다 맞힌 나무의 수.
 *
 *   rewind         {}
 *                  자동 재생을 마친 뒤 advance 를 받아 처음으로 돌아간다.
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
  }
}

export const manyTreesVoteAlgorithm = async (
  ctx: FacetContext<ManyTreesVoteData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ManyTreesVoteData>;
  const data = rc.data;
  assertShape(data);

  const { trees, questions, options, truth, answers } = data;
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

  /** 물음 하나의 표를 options 순서대로 센다. */
  function tally(q: number): number[] {
    const counts = options.map(() => 0);
    for (let t = 0; t < trees.length; t += 1) {
      const pick = options.indexOf(answers[t][q]);
      if (pick < 0) {
        throw new Error(
          `앙상블 투표 선택지 밖의 답: ${trees[t]} 가 ${questions[q]} 에 "${answers[t][q]}" 라 했다`,
        );
      }
      counts[pick] += 1;
    }
    return counts;
  }

  /** 한 바퀴 — 판을 놓고 물음을 차례로 투표에 부친 뒤 견준다. 취소되면 false. */
  async function playThrough(): Promise<boolean> {
    await rc.emit({
      type: 'board-ready',
      payload: {
        trees: trees.length,
        questions: questions.length,
        total: trees.length * questions.length,
      },
    });

    const treeScores = trees.map(() => 0);
    let majorityScore = 0;

    for (let q = 0; q < questions.length; q += 1) {
      if (!(await gate())) return false;

      const votes = answers.map((row) => row[q]);
      const counts = tally(q);
      await rc.emit({
        type: 'votes-split',
        target: `index:${q}`,
        payload: { question: q, votes, counts },
      });

      if (!(await gate())) return false;

      let top = 0;
      for (let i = 1; i < counts.length; i += 1) {
        if (counts[i] > counts[top]) top = i;
      }
      const tied = counts.filter((c) => c === counts[top]).length > 1;
      if (tied) {
        throw new Error(
          `앙상블 투표 동수: ${questions[q]} 에서 최다 표가 갈렸다 — 나무 수를 홀수로 둔다`,
        );
      }
      const majority = options[top];
      const winners: number[] = [];
      const losers: number[] = [];
      for (let t = 0; t < trees.length; t += 1) {
        if (votes[t] === majority) winners.push(t);
        else losers.push(t);
        if (votes[t] === truth[q]) treeScores[t] += 1;
      }
      const correct = majority === truth[q];
      if (correct) majorityScore += 1;

      await rc.emit({
        type: 'votes-gathered',
        target: `index:${q}`,
        payload: { question: q, majority, truth: truth[q], correct, winners, losers },
      });
    }

    if (!(await gate())) return false;

    let best = 0;
    let perfect = 0;
    for (const s of treeScores) {
      if (s > best) best = s;
      if (s === questions.length) perfect += 1;
    }
    await rc.emit({
      type: 'done',
      payload: { treeScores, best, perfect, majorityScore, total: questions.length },
    });
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
