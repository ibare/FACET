/**
 * saturatingCounter 개념 선언.
 *
 * canonical facet 은 `facet:saturatingCounter` — 결과 열 열여섯 개("세 번 돌고
 * 나가는" 안쪽 반복이 세 번, 그 뒤 갈래가 아예 뒤집혀 N 넷)를 카운터 비트 1 · 2 · 3
 * 으로 걷는 완제품. 손잡이를 돌리면 같은 열을 새 폭으로 처음부터 다시 걷고, 앞 판의
 * 바늘 자취는 옅게 남는다. 세 폭의 셈은 이렇다.
 *
 *   1 비트  반복 중 틀림 5 · 뒤집힌 뒤 틀림 0 · 합 5 · 맞힘 69%
 *   2 비트  3 · 1 · 4 · 75%
 *   3 비트  3 · 3 · 6 · 63%
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 둘이 이 화면의 두 대목을 하나씩 떼어 간다 — oneBitDoubleFault 는 1 비트의
 * 짝지은 틀림, fourStateHysteresis 는 네 칸 사다리의 규칙. 그래서 이쪽은
 * **주어 층위**를 올렸다. 주어는 "카운터의 한 걸음" 이 아니라 "폭을 몇 비트로 할
 * 것인가" 라는 설계 결정이고, 그 결정이 두 구간의 틀림을 서로 맞바꾼다는 것만
 * 말한다.
 *
 * 어휘도 배타로 갈랐다. 이 definition 은 `bits` · `ride out` · `one-off
 * exceptions` · `lag` · `reverses for good` 를 갖고, 조각들의 대표 낱말 —
 * `remembers` · `flipped` · `exit` · `re-entry`(oneBit), `states` · `strongly` ·
 * `weakly` · `middle` · `steps`(fourState) — 은 한 번도 쓰지 않는다. 조각이 그
 * 낱말을 독점하게 두어야 검색이 갈린다.
 *
 * ── 이 개념만의 오검출
 *
 * `saturating` 은 포화 산술(넘치면 끝값에 머무는 정수 덧셈, DSP · SIMD 의
 * saturating add)과 같은 말이다. 저장소에 integerOverflow 가 있으므로 avoidWhen 과
 * 대비에서 밀어낸다. 트랜지스터 · 증폭기의 포화, 화학의 포화 용액도 같은 낱말이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const saturatingCounterConcept: FacetConceptSource = {
  id: 'saturatingCounter',
  label: 'Saturating Counter (How Many Bits a Branch Predictor Needs)',
  canonicalFacet: 'facet:saturatingCounter',

  surface: {
    definition:
      "Choosing how many bits a branch predictor's saturating counter gets: more bits ride out one-off exceptions but lag longer once a branch's direction reverses for good.",
    exemplarKeywords: [
      'saturating counter',
      '2-bit saturating counter',
      'two-bit branch predictor',
      'bimodal predictor',
      'n-bit counter predictor',
      'dynamic branch prediction',
      'counter width',
      'why two bits and not three',
      'how long should the predictor hold on',
      'loop branch misprediction rate',
      'prediction accuracy per counter size',
      'slow to adapt when the branch changes behaviour',
      'stability versus responsiveness',
      'branch predictor trade-off',
    ],
  },

  briefing: {
    observable: [
      'On the left the counter stands as a column of cells split by a bold threshold line: cells above it guess taken, cells below guess not taken, and a needle marks the current cell.',
      'On the right the same vertical axis is unrolled over time, so the needle leaves a trace and every place the trace crosses the threshold line is a place where the next guess changes.',
      'Each step fills three rows above the trace — the outcome, the guess made before seeing it, and whether that guess was right — and the needle moves one cell only after the outcome is known: up on taken, down on not taken.',
      'At either end the needle stays put and the caption says the counter is saturated; when a move crosses the line the threshold briefly thickens and the caption says the next guess flips.',
      'The outcome sequence is fixed: an inner loop that runs three times and leaves, opened three times over, followed by four not-taken outcomes once the branch has turned. The two stretches are named under the plot and their misses are tallied separately.',
      'Three counters sit in the control bar — misses in the loop, misses after the flip, and total misses. With 1 bit they read 5, 0 and 5; with 2 bits 3, 1 and 4; with 3 bits 3, 3 and 6.',
      'Changing the width grows or shrinks the cells outward from the threshold (2, 4, 8 in all) and moves the starting cell, the top one, further from the line; the previous run\'s trace stays behind faintly so the new trace can be compared against it.',
      'The closing caption gives the width, the two separate miss counts and the percentage right — 69, 75 and 63 percent for 1, 2 and 3 bits.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A three-way Counter bits control set to 1, 2 and 3 carries the argument. It starts at 1; a run finishes and waits, and choosing another width replays the same outcomes from the beginning under that width.',
        'The outcome sequence and the point where the branch turns are fixed, so an article can quote the exact miss counts each width produces.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; the function counts misses over a range of steps, and the two counters on screen are that function called on the loop stretch and on the stretch after the turn.',
      ],
    },

    useWhen: [
      'The article claims two bits are the standard for a branch counter and the reader should see why rather than accept it: one bit pays for every loop it leaves, three bits pay for every real change, and two sits between them — the counters move in opposite directions as the width rises.',
      'The prose presents holding on as simply better and needs the price made visible: the widest counter is the worst of the three here, because it spends three steps wrong after the branch has truly turned.',
      'The reader has to compare the same branch history under different predictor sizes and read the difference off one set of numbers rather than off three separate diagrams.',
    ],

    avoidWhen: [
      'The article is about saturating arithmetic — an addition that clamps at the largest representable value instead of wrapping, as in DSP or SIMD instructions. Only a branch counter clamps here, and no arithmetic result is at stake.',
      'The subject is how a predictor chooses which counter to consult — indexing by address, global history, correlating or two-level schemes. A single counter serving a single branch is all that is run here.',
      'The article is about what one wrong guess costs in pipeline cycles. Misses are counted here, never priced.',
      'The subject is a fixed rule decided at compile time, such as assuming backward jumps are taken. Every guess here comes from what the branch did before.',
      'The article uses "saturation" for a transistor, an amplifier, a colour, a solution in chemistry, or a network link running at capacity.',
      'The subject is a hardware counter that measures events, such as a performance counter or a timer. This counter holds a guess, not a count of anything.',
    ],

    contrastWith: [
      {
        concept: 'oneBitDoubleFault',
        note: 'That is the narrowest possible predictor and the single claim that its misses come in pairs at loop boundaries; this treats width as a setting and weighs the pairs against what a wider memory costs when the branch really changes.',
      },
      {
        concept: 'fourStateHysteresis',
        note: 'That fixes the width at two bits and states the rule for when a guess changes; this varies the width and asks which setting gives the fewest misses overall.',
      },
      {
        concept: 'staticPrediction',
        note: 'A static rule never learns from what a branch did; a counter learns only from that, and the question becomes how quickly it should let the past be overruled.',
      },
      {
        concept: 'branchHistoryTable',
        note: 'That is about which counter a branch is sent to, using recent history to separate situations one counter would blur; this is about how a single counter behaves once it has been chosen.',
      },
      {
        concept: 'integerOverflow',
        note: 'Both concern a value at the end of its range; overflow wraps around to the other end silently, while a saturating counter stops at the end on purpose so that a long run cannot be undone by a single contrary result.',
      },
    ],
  },
};
