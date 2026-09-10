/**
 * assignThenMove 개념 선언.
 *
 * canonical facet 은 `facet:assignThenMove` — 조각(piece)이다. 위에 번갈이 저울,
 * 왼쪽에 점 열셋과 중심 셋이 노는 들판, 오른쪽에 회마다 중심이 옮긴 거리를
 * 적는 장부가 있다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `kmeans` 는 여러 판을 굴려 **멎은 자리가 여럿** 이라는 결과를 맡고,
 * 조각 `kMustBeGiven` 은 k 가 입력이라는 것을 맡는다. 이 조각이 홀로 맡는 것은
 * **한 바퀴의 두 몸짓과 멎음의 조건** 이다 — 붙는 일과 옮기는 일이 번갈아 돌고,
 * 아무도 안 움직이면 그 다음 바퀴도 똑같으므로 멈춘다는 것.
 * definition 의 주어가 "한 바퀴" 이고, keywords 는 반복 · 수렴 어휘만 갖는다
 * (완제품의 초기화 · 지역 최적 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const assignThenMoveConcept: FacetConceptSource = {
  id: 'assignThenMove',
  label: 'Assign, Then Move (One Turn of the Alternation)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:assignThenMove',

  surface: {
    definition:
      'One turn of an alternation: each point takes its nearest centre, then each centre slides to the mean of the points that took it, and the turning stops when nothing moves.',
    exemplarKeywords: [
      'assignment step and update step',
      'alternating optimisation',
      'iterate until convergence',
      'nothing moved so it stopped',
      'fixed point of an iteration',
      'the centre slides to the mean of its members',
      'each point takes the nearest centre',
      'why the loop terminates',
      'coordinate descent',
      'starting centres in the wrong place',
    ],
  },

  briefing: {
    observable: [
      'A gauge across the top slides left and right to say which of the two gestures is happening, so the alternation itself is visible as a movement rather than inferred from the caption.',
      'Points reach out with spokes to the centre they take, and on the next step the centre is dragged along those spokes to the middle of them, leaving a ghost ring and a trace where it used to be.',
      'The three centres start piled in the middle where none of the three clumps is, so the first attachment is visibly wrong and the correction happens in front of the reader.',
      'A ledger on the right records one bar per centre per round for the distance it travelled; the bars shorten from round to round until a round has none at all, and that is where the run stops.',
      'The caption after each attachment reports the group sizes, and the caption after each move reports the three distances, so the two gestures are described in different quantities.',
      'The closing caption states how many rounds were turned and that it stopped because nobody moved, rather than because a limit was reached.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole alternation on its own and stops on the round where nothing moves.',
        'Two buttons: Replay, and a step control that rewinds and walks the same rounds one gesture at a time, which is how a reader can sit between an attachment and the move it causes.',
        'The points and the starting centres are fixed, so an article can name the three clumps and the spot in the middle where the centres begin.',
      ],
    },

    useWhen: [
      'The article gives the two steps as a numbered list and the reader takes them for two phases of a setup rather than a cycle. The gauge crossing back and forth every step is what makes the cycle the object.',
      'A reader asks what stops the loop, and the honest answer is that a round which moves nothing produces the same attachment next time. Bars shrinking to nothing in the ledger is that argument in a form that can be pointed at.',
      'The prose needs the moment a badly placed centre repairs itself, and the screen begins with all three centres sitting where no group is.',
    ],

    avoidWhen: [
      'The subject is which answer the method ends up at, or why two runs disagree. Only one start is shown here and it runs once through to its stopping point.',
      'The article is about how many groups there should be. The number of centres is fixed on this screen and never questioned.',
      'The point is the cost of the method — how many distances get measured, how it scales with the number of points. Nothing here is counted.',
      'The article uses "assign" for allocating work to workers, shards or servers, and "move" for relocating that work. The words match and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'kmeans',
        note: 'Where the alternation comes to rest, and how much the starting centres decide that, is a different question from what one turn does and why the turning stops.',
      },
      {
        concept: 'kMustBeGiven',
        note: 'Both hold the number of centres fixed, but there the fixing itself is the problem, while here it is a premise and the turning is what is at issue.',
      },
      {
        concept: 'mergeNearestPair',
        note: 'Both move toward groups step by step, but merging joins two groups permanently on each step while this reassigns every point from scratch on each turn.',
      },
    ],
  },
};
