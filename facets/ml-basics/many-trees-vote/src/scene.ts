/**
 * ManyTreesVote 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 하나(`model`)뿐이고 조회 분기도 DOM 되읽기도 0 건이었다.
 * 곧 **화면이 통째로 상태**였다는 뜻이고, 실제로 SVG 속성과 **타입 선언에 얹힌
 * 필드**에 흩어져 있었다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `type Cell = { group; box; glyph }` — **DOM 손잡이만 있고 뜻이 없는 타입.**
 *   그러니 각 칸이 무엇을 말하는가가 전부 그 세 노드의 속성에만 있었다.
 *   - `group` 의 `transform` — 좌표가 아니라 **어느 국면인가**. 아직 갈리지 않았나
 *     (0px) · 갈려서 어느 쪽으로 밀렸나(±). **한 속성에 두 뜻**이 실렸다.
 *   - `box` 의 `stroke`/`stroke-width` 와 `glyph` 의 `fill`, 그리고 `group` 에
 *     덧붙는 **자식 선 하나** — 이 답이 정답과 어긋났나. 이 조각의 결론이 거기
 *     있었고, 되돌리는 명령이 없어 쌓이기만 했다 (그것이 옳았다).
 * - `type Geometry` + `let geo` — **척도.** 열 폭 · 행 높이 · 칸 폭 · 세 기준선이
 *   전부 거기서 나왔고, `setModel` 때 한 번 재고 그 뒤로 계속 썼다.
 * - `let majorityHolders` · `let truthHolders` — `<g>` 의 **자식 수**가 그 열이
 *   모였나 · 정답과 견주어졌나를 쥐었다. 점선 테 하나(1)냐 테 + 채운 칸 + 글자(3)냐.
 * - `let treeColors` — 나무의 색판. `drawBoard` 안에서 다시 셈해졌다.
 * - `let model` — 러너가 주는 바탕의 **두 벌째 사본** (projector 에도 한 벌 있었다).
 * - `scoreLayer` 의 자식 유무 — 맺음이 났나.
 *
 * 여기서는 그 전부가 `ready` · `split` · `gathered` · `summed` 네 수로 줄었다.
 * 칸이 밀려난 자리도, 빗금이 그어졌나도, 다수결 칸이 찼나도, 맞힌 수도 그 넷과
 * 바탕에서 파생된다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 화면에는 열마다의 표 셈, 다수결 칸의 답, 정답과의 맞음 표시, 나무별 맞힌 수,
 * 다수결의 맞힌 수가 **나란히** 뜬다. 옛 발신은 그 전부를 payload 로 실어 왔다 —
 * `counts` · `majority` · `truth` · `correct` · `winners` · `losers` ·
 * `treeScores` · `best` · `perfect` · `majorityScore` · `total` 이 화면이 세는 것과
 * 다른 출처였다.
 *
 * **이제 남은 payload 가 하나도 없다.** 이 조각의 바탕은 답표 스물다섯 개이고
 * 화면의 모든 수가 그 표에서 세지므로, 실어 올 판정이 없다.
 *
 * - **몇 번째 열인가는 발신이 온 차례가 말한다.** `votes-split` 은 올 때마다 하나씩
 *   쌓이므로 `split` 이 곧 갈린 열의 수이고 지금 열은 `split - 1` 이다.
 *   `target: index:<q>` 는 식별자 표기로 남아 있으나 장면은 그것을 읽지 않는다.
 * - **다수도 싣지 않는다.** 판에 놓인 답을 세어 나온다. 세는 규칙은 algorithm 이
 *   `voteCounts` · `majorityIndex` 로 내주고 장면이 그것을 부른다 — algorithm 의
 *   동수 검사와 화면의 다수결 칸이 **한 함수를 지난다** (프로토콜 4 절 B 갈래).
 * - **이긴 표와 진 표도 싣지 않는다.** 그 답이 다수와 같은지 견주면 나온다.
 * - **맞힌 수도 싣지 않는다.** 판에 굳은 열을 정답과 견주어 센다. 조각의 결론이
 *   그림과 **같은 자료**를 쓰게 하는 것이 이행의 알맹이다 (프로토콜 4 절 10 · 34).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 나무 · 물음 · 선택지 · 정답 · 답표라는 **구조**만 담고,
 * 열 폭 · 행 높이 · 밀려나는 거리는 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다
 * (S-piece).
 *
 * 문안도 담지 않는다. `captionFor` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { majorityIndex, voteCounts } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 운동의 출발 그림이 필요한 자리 둘(칸이 어디서
 * 밀려나기 시작하나 · 점이 어느 칸에서 떨어져 나오나)이 모두 바탕과 `split` 에서
 * 셈해진다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type VoteStep =
  /** 판이 다 놓였다. */
  | { kind: 'board' }
  /** 이 열의 답들이 열 축에서 좌우로 밀려난다. */
  | { kind: 'split' }
  /** 다수 쪽 표가 다수결 칸으로 모이고, 정답과 견주어 빗금이 그어진다. */
  | { kind: 'gather' }
  /** 맞힌 수가 오른쪽에 나란히 선다. */
  | { kind: 'sum' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type VoteCaption =
  /** 판의 크기 — 나무 · 물음 · 놓인 답의 수. */
  | { kind: 'intro'; trees: number; questions: number; total: number }
  /** 이 물음에서 답이 갈렸다. 양쪽 표의 수. */
  | { kind: 'split'; q: string; optionA: string; optionB: string; countA: number; countB: number }
  /** 다수 쪽이 모인 답과 정답, 그리고 둘이 맞았나. */
  | { kind: 'gather'; majority: string; truth: string; agreed: boolean }
  /** 맺음 — 다 맞힌 나무의 수 · 나무 중 최고 · 다수결. */
  | { kind: 'sum'; total: number; best: number; perfect: number; majorityScore: number };

export type ManyTreesVoteScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 나무 이름. 자리 번호가 곧 행이다. */
  trees: readonly string[];
  /** 물음 이름. 자리 번호가 곧 열이다. */
  questions: readonly string[];
  /** 고를 수 있는 답. 왼쪽부터 이 순서로 갈라진다. */
  options: readonly string[];
  /** 물음마다의 정답. */
  truth: readonly string[];
  /** answers[나무][물음]. 화면의 모든 셈이 이 표에서 나온다. */
  answers: readonly (readonly string[])[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 판이 다 놓였다고 말했나. 판 자체는 바탕이라 처음부터 서 있다. */
  ready: boolean;
  /**
   * 표가 갈린 열의 수. 열 `q < split` 이 갈려 있고, 지금 열은 `split - 1` 이다.
   *
   * 이 하나가 밀려난 자리를 통째로 말한다 — 어느 쪽으로 얼마나 밀리는지는 그 칸의
   * 답이 `options` 의 몇 번째냐가 정한다.
   */
  split: number;
  /** 모여서 정답과 견주어진 열의 수. `gathered <= split` 이다. */
  gathered: number;
  /** 맺음이 났나. */
  summed: boolean;

  step: VoteStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `ready` 아래 넷은 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 표가 다 모이고 맞힌 수까지 선 채로 선다 (S-scene).
 */
export type VoteBoard = Pick<
  ManyTreesVoteScene,
  'trees' | 'questions' | 'options' | 'truth' | 'answers'
>;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * 선언을 판으로 좁힌다.
 *
 * **새 배열을 낸다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체라
 * 참조로 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene). 좁히는 규칙은
 * 이 한 벌뿐이다 — 두 벌이 되면 한쪽만 고쳐져 화면과 셈이 다른 판을 본다 (C9).
 */
export function readVoteBoard(raw: unknown): VoteBoard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const trees = d.trees;
  const questions = d.questions;
  const options = d.options;
  const truth = d.truth;
  const answers = d.answers;
  if (!isStringArray(trees) || !isStringArray(questions)) return null;
  if (!isStringArray(options) || !isStringArray(truth)) return null;
  if (!Array.isArray(answers) || !answers.every(isStringArray)) return null;
  if (trees.length === 0 || questions.length === 0 || options.length < 2) return null;
  const rows = answers as string[][];
  if (truth.length !== questions.length) return null;
  if (rows.length !== trees.length) return null;
  if (rows.some((row) => row.length !== questions.length)) return null;
  return {
    trees: [...trees],
    questions: [...questions],
    options: [...options],
    truth: [...truth],
    answers: rows.map((row) => [...row]),
  };
}

/**
 * 아직 아무 말도 하지 않은 처음 화면 — 판만 놓여 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: VoteBoard): ManyTreesVoteScene {
  return {
    trees: base.trees,
    questions: base.questions,
    options: base.options,
    truth: base.truth,
    answers: base.answers,
    ready: false,
    split: 0,
    gathered: 0,
    summed: false,
    step: null,
  };
}

// ── 파생. 화면이 쓰는 수는 전부 여기를 지난다 ───────────────────────────────

/** 그 열의 표가 갈렸나 — 칸이 밀려나 있나. */
export function isSplit(scene: ManyTreesVoteScene, q: number): boolean {
  return q >= 0 && q < scene.split;
}

/** 그 열이 모여 정답과 견주어졌나. */
export function isGathered(scene: ManyTreesVoteScene, q: number): boolean {
  return q >= 0 && q < scene.gathered;
}

/** 물음 하나에 나무들이 낸 답 — 나무 순서대로. */
export function votesOf(scene: ManyTreesVoteScene, q: number): string[] {
  return scene.trees.map((_, t) => scene.answers[t]?.[q] ?? '');
}

/** `options` 순서대로의 표수. algorithm 이 내준 한 벌을 쓴다. */
export function countsOf(scene: ManyTreesVoteScene, q: number): number[] {
  return voteCounts(scene.options, votesOf(scene, q));
}

/**
 * 다수 쪽 답. 최다가 갈리면 빈 문자열.
 *
 * **판에 놓인 답에서 나온다.** algorithm 이 실어 보내던 `majority` 를 걷어낸 자리다 —
 * 그림의 표와 결론이 같은 자료를 쓴다 (프로토콜 4 절 34).
 */
export function majorityOf(scene: ManyTreesVoteScene, q: number): string {
  const at = majorityIndex(countsOf(scene, q));
  return at < 0 ? '' : (scene.options[at] ?? '');
}

/** 그 답이 `options` 의 몇 번째인가. 밀려나는 쪽이 여기서 정해진다. 없으면 -1. */
export function optionIndexOf(scene: ManyTreesVoteScene, t: number, q: number): number {
  const answer = scene.answers[t]?.[q];
  return answer === undefined ? -1 : scene.options.indexOf(answer);
}

/** 그 나무의 표가 다수 쪽에 들었나. */
export function isWinner(scene: ManyTreesVoteScene, t: number, q: number): boolean {
  const answer = scene.answers[t]?.[q];
  return answer !== undefined && answer === majorityOf(scene, q);
}

/** 그 답이 정답과 어긋났나 — 빗금이 그어지는 잣대. */
export function isWrong(scene: ManyTreesVoteScene, t: number, q: number): boolean {
  const answer = scene.answers[t]?.[q];
  return answer !== undefined && answer !== scene.truth[q];
}

/**
 * 나무마다 맞힌 수 — **판에 굳은 열까지만** 센다.
 *
 * 걸음이 실어 오지 않는다. 걸음마다 자라는 셈이 아니라 굳은 열을 다시 세는 것이라
 * 어느 걸음으로 되짚어 와도 같은 수가 나온다.
 */
export function treeScoresOf(scene: ManyTreesVoteScene): number[] {
  return scene.trees.map((_, t) => {
    let n = 0;
    for (let q = 0; q < scene.gathered; q += 1) {
      if (scene.answers[t]?.[q] === scene.truth[q]) n += 1;
    }
    return n;
  });
}

/** 다수결이 맞힌 수. 그림의 다수결 칸과 같은 자료에서 나온다. */
export function majorityScoreOf(scene: ManyTreesVoteScene): number {
  let n = 0;
  for (let q = 0; q < scene.gathered; q += 1) {
    if (majorityOf(scene, q) === scene.truth[q]) n += 1;
  }
  return n;
}

/** 나무 중 가장 많이 맞힌 수. */
export function bestTreeScoreOf(scene: ManyTreesVoteScene): number {
  let best = 0;
  for (const score of treeScoresOf(scene)) if (score > best) best = score;
  return best;
}

/** 물음을 다 맞힌 나무의 수. 분모는 물음 전체다. */
export function perfectTreeCountOf(scene: ManyTreesVoteScene): number {
  const total = scene.questions.length;
  if (total === 0) return 0;
  let n = 0;
  for (const score of treeScoresOf(scene)) if (score === total) n += 1;
  return n;
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 이 아니라 **상태**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
 * 나와야 하고, 장면에 캡션 필드를 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(scene: ManyTreesVoteScene): VoteCaption | null {
  if (scene.summed) {
    return {
      kind: 'sum',
      total: scene.questions.length,
      best: bestTreeScoreOf(scene),
      perfect: perfectTreeCountOf(scene),
      majorityScore: majorityScoreOf(scene),
    };
  }
  // 갈린 열과 모인 열의 수가 같으면 방금 모였다는 뜻이다.
  if (scene.split > 0 && scene.gathered === scene.split) {
    const q = scene.split - 1;
    const majority = majorityOf(scene, q);
    const truth = scene.truth[q] ?? '';
    return { kind: 'gather', majority, truth, agreed: majority === truth };
  }
  if (scene.split > 0) {
    const q = scene.split - 1;
    const counts = countsOf(scene, q);
    return {
      kind: 'split',
      q: scene.questions[q] ?? '',
      optionA: scene.options[0] ?? '',
      optionB: scene.options[1] ?? '',
      countA: counts[0] ?? 0,
      countB: counts[1] ?? 0,
    };
  }
  if (!scene.ready) return null;
  return {
    kind: 'intro',
    trees: scene.trees.length,
    questions: scene.questions.length,
    // 판에 놓인 답의 수. 상수로 적어 두지 않고 판의 두 변에서 센다.
    total: scene.trees.length * scene.questions.length,
  };
}

export const manyTreesVoteScene: ScenePlan<ManyTreesVoteScene> = {
  /**
   * 첫 장면은 판만 세우고 아무 말도 하지 않는다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   * `readVoteBoard` 가 **새 배열**을 내므로 러너가 준 객체를 참조로 쥐지 않는다.
   */
  initial(initialData: unknown): ManyTreesVoteScene {
    const board = readVoteBoard(initialData);
    if (board === null) {
      return atStart({ trees: [], questions: [], options: [], truth: [], answers: [] });
    }
    return atStart({
      trees: board.trees,
      questions: board.questions,
      options: board.options,
      truth: board.truth,
      answers: board.answers,
    });
  },

  reduce(scene: ManyTreesVoteScene, event: FacetRuntimeEvent): ManyTreesVoteScene {
    switch (event.type) {
      /*
       * 판이 다 놓였다. 한 회차의 첫 걸음이므로 자취를 새로 깐다 — 되감지 않고
       * 곧바로 다시 재생하는 길도 있다.
       */
      case 'board-ready':
        return {
          ...atStart({
            trees: scene.trees,
            questions: scene.questions,
            options: scene.options,
            truth: scene.truth,
            answers: scene.answers,
          }),
          ready: true,
          step: { kind: 'board' },
        };

      /*
       * 이 열의 답이 갈린다. 어느 열인지도 표의 셈도 실어 오지 않는다 — **이 발신의
       * 차례가 곧 열 번호**이고 셈은 판에서 나온다.
       */
      case 'votes-split':
        if (scene.split >= scene.questions.length) return scene;
        if (scene.split !== scene.gathered) return scene;
        return { ...scene, split: scene.split + 1, step: { kind: 'split' } };

      /*
       * 다수 쪽이 모여 앉고 정답과 견주어진다. 다수도, 이긴 표도, 진 표도 실어
       * 오지 않는다 — 판에 놓인 답과 선언된 정답에서 전부 나온다.
       */
      case 'votes-gathered':
        if (scene.gathered >= scene.split) return scene;
        return { ...scene, gathered: scene.gathered + 1, step: { kind: 'gather' } };

      /*
       * 맺음. 맞힌 수를 실어 오지 않는다 — 판에 굳은 열을 세어 나온다
       * (프로토콜 4 절 10 · 34).
       */
      case 'done':
        if (scene.gathered === 0) return scene;
        return { ...scene, summed: true, step: { kind: 'sum' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          trees: scene.trees,
          questions: scene.questions,
          options: scene.options,
          truth: scene.truth,
          answers: scene.answers,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
