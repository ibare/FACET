/**
 * branchHistoryTable 개념 선언.
 *
 * canonical facet 은 `facet:branchHistoryTable` — 한 분기의 결과 열 18 번을 지역 이력으로
 * 색인한 2비트 카운터 표로 짐작하는 완결형이다. 손잡이 둘(이력 길이 0~3 · 분기 열 무늬/무작위)
 * 을 돌리면 처음부터 다시 재생한다. 무늬 TTN 은 이력 2 에서 틀림이 6 → 1 로 떨어지고,
 * 무작위 열은 이력을 어디까지 올려도 50 % 다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 셋 다 "지난 결과로 다음을 짐작한다" 를 다루므로 **주어 층위**를 셋으로 갈랐다.
 *
 *   이 개념                **고를 수 있는 길이**. 이력 한 비트가 표를 두 배로 가르고, 그 값은
 *                          분기의 되풀이 주기를 덮을 때까지만 난다는 맞바꿈.
 *   patternFromHistory     **기억하는 내용** — 직전 두 결과 뒤에 무엇이 왔는가를 적어 두는 것.
 *                          번갈아 가는 분기가 그 말의 증거다.
 *   unpredictableBranch    **분기 쪽의 성질** — 결과가 우연이면 무엇을 기억해도 절반.
 *
 * 어휘 배타: 이 definition 은 'alternating' · 'followed' · 'pair' 를 쓰지 않고(저쪽 몫),
 * 'chance' · 'random' · 'half' · 'coin' 도 쓰지 않는다(무작위 쪽 몫). 무작위 열이 이 화면의
 * 손잡이 한쪽이지만 그 낱말은 조각이 독점하게 두고, 여기서는 useWhen 과 keywords 에서만
 * 다룬다. 반대로 'doubles' · 'counters' · 'period' · 'length' 는 이 definition 만 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const branchHistoryTableConcept: FacetConceptSource = {
  id: 'branchHistoryTable',
  label: 'Branch History Table (How Much History to Keep)',
  canonicalFacet: 'facet:branchHistoryTable',

  surface: {
    definition:
      "Choosing how many recent outcomes of one branch index its two-bit counters: each added bit doubles the table, and the extra length pays only until it can tell every point of the branch's repeating period apart.",
    exemplarKeywords: [
      'branch history table',
      'local history predictor',
      'two-level adaptive predictor',
      'pattern history table',
      'history register',
      'history length',
      'table of 2-bit counters indexed by history',
      'Yeh and Patt predictor',
      'how long a history does a predictor need',
      'predictor table size',
      'dynamic branch prediction accuracy',
      'predictable versus data-dependent branches',
    ],
  },

  briefing: {
    observable: [
      'Three layers stack from top to bottom: an outcome strip of eighteen tiles, a history register of as many bits as the chosen length, and a row of counter cells, one per possible history value.',
      'Each counter is drawn as a dial with a needle: the two left ticks mean not taken, the two right ticks mean taken, and every needle starts on the weakly-taken tick.',
      'Changing the history length makes the cells split rather than reappear: each new cell emerges from the parent cell that shares its low bits and slides into place, 1 → 2 → 4 → 8. Shortening the history merges them back.',
      'A marker labelled with the history in binary moves over the cell being read before every guess; after the outcome is known, the new result slides into the register from the right, the oldest bit drops off the left, and the marker jumps to the next cell.',
      'Under each tile of the outcome strip a mark is left once it is resolved — a circle for a correct guess, a cross for a miss — so the positions of the misses stay visible for the whole round.',
      'On the repeating TTN branch the round ends at 6 misses (67 % hit) with history 0 and still 6 with history 1, then drops to 1 miss (94 %) at history 2 and stays there at 3. The single remaining miss is the first visit to one cell before it has learned.',
      'On the random branch every history length ends at 50 % hit. The crosses change position from one length to the next while their count stays level, and the needles keep swinging instead of settling.',
      'Three counters sit in the control bar — Misses, Hit %, and Table cells — and a closing caption states the misses out of eighteen, the hit percentage and the cell count.',
      'The code panel shows a function that runs one round with the same rule as the screen and returns the miss count, shifting the history with the newest outcome in the lowest bit.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. A round covers all eighteen outcomes and then waits.',
        'A History length slider set to 0, 1, 2 or 3 and a Branch slider set to Pattern or Random carry the argument. Turning either one, even in the middle of a round, starts a fresh round from the first outcome under the new setting.',
        'The screen opens at history 0 on the Pattern branch — a single shared counter — so the first round shows the no-history baseline before anything is split.',
        'Both outcome sequences are fixed (TTN six times, and one fixed random sequence with nine takens), so an article can quote the miss count for any of the eight combinations.',
        'The code panel labelled Local history table starts empty with a "+ Add language" button; the round appears written out only after the reader picks a language.',
      ],
    },

    useWhen: [
      'The article claims a longer history always makes a predictor better. Stepping the history length on the repeating branch shows 1 bit changing nothing, 2 bits removing almost every miss, and 3 bits adding nothing more — the gain arrives as a single step at one bit short of the three-outcome period and stops there.',
      'The reader must weigh storage against accuracy: every extra history bit doubles the number of counters, and the screen puts the Table cells count beside the Hit % so the doubling and its return can be read together.',
      'The argument needs the same hardware to fail on one branch and succeed on another. Flipping between the repeating and the random sequence under the same history length isolates the branch itself as the variable.',
      'The article explains why one history bit is not enough for TTN: the outcome after a taken can be either taken or not taken, so one cell receives both and cannot settle, and only two bits pull those cases apart into separate dials.',
    ],

    avoidWhen: [
      'The article is about global history shared across branches, gshare, or tournament and perceptron predictors. Only one branch and its own history run here.',
      'The subject is the branch target buffer or where a jump goes. Only the taken or not-taken direction is guessed.',
      'The point is two different branches colliding in the same predictor entry. There is one branch here, so no entry is ever shared between branches.',
      'The subject is the cycles lost when a guess is wrong or how the pipeline is flushed. The screen counts misses, not their price.',
      'The article uses "history table" for a database audit log, a version history, or browser history.',
      'The article is about branches in version control. The branch here is a conditional jump in machine code.',
    ],

    contrastWith: [
      {
        concept: 'patternFromHistory',
        note: 'That one asserts what history buys — each recent pair remembers what came after it — while this one treats the length of that record as a cost to choose and asks where adding more stops paying.',
      },
      {
        concept: 'unpredictableBranch',
        note: 'This claims that recording more past helps a regular branch only up to a point; that one claims no amount of recorded past helps a branch whose outcomes are independent, placing the limit in the branch rather than in the predictor\'s size.',
      },
      {
        concept: 'saturatingCounter',
        note: 'A single counter per branch remembers only which direction has been winning lately; indexing many counters by history lets one branch keep a separate lean for each recent context.',
      },
      {
        concept: 'staticPrediction',
        note: 'A fixed rule decides before the program runs and never changes its guess; this learns from each outcome and changes where it looks as the history moves.',
      },
      {
        concept: 'directMappedCache',
        note: 'Both use a few bits to pick exactly one slot out of a power-of-two table. There the bits are cut from an address; here they are the branch\'s own recent outcomes, so the slot depends on what happened, not on where the code lives.',
      },
    ],
  },
};
