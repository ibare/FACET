/**
 * staticPrediction 개념 선언.
 *
 * canonical facet 은 `facet:staticPrediction` — 값 열 개를 더하는 반복 하나에서 앞으로
 * 뛰는 검사 분기와 뒤로 뛰는 반복 분기가 스무 번 나고, 손잡이로 짐작 규칙 셋(늘 안 탄다 ·
 * 늘 탄다 · 뒤로면 탄다)을 바꿔 가며 틀림이 어느 분기에 쌓이는지 견주는 화면이다.
 * 틀릴 때마다 박자 둘을 잃는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 묶음은 이 완제품과 조각 둘 (backwardTaken · mispredictionPenalty) 이다.
 *
 *   이 개념                `fixed rule` · `before the program runs` · `blind to past` ·
 *                          `compared` · `which branches` 를 갖는다. 주어는 "규칙 여럿 사이의 고름".
 *   backwardTaken          `target` · `lower address` · `loop` · `exit` 를 갖는다.
 *                          주어는 "프로그램의 버릇" — 반복을 닫는 분기가 대개 탄다.
 *   mispredictionPenalty   `fetched behind` · `resolves` · `stage` · `cycles` · `deeper` 를 갖는다.
 *                          주어는 "틀림 한 번의 값".
 *
 * 세 definition 은 서로의 대표 낱말을 쓰지 않는다 (기계 확인). 화면에는 뒤로 뛰는 분기도
 * 잃은 박자도 나오지만, 그 낱말을 조각에 맡겨 두어야 검색이 갈린다 — 이쪽은 **규칙을
 * 바꿔 틀림의 자리가 옮겨 가는 것**만 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const staticPredictionConcept: FacetConceptSource = {
  id: 'staticPrediction',
  label: 'Static Branch Prediction (Comparing Fixed Guessing Rules)',
  canonicalFacet: 'facet:staticPrediction',

  surface: {
    definition:
      'Static branch prediction fixes one guessing rule before the program runs, blind to what any branch did before, and rules are compared by how often and on which branches they guess wrong.',
    exemplarKeywords: [
      'static branch prediction',
      'predict not taken',
      'predict taken',
      'always not taken',
      'always taken',
      'BTFN',
      'compile-time branch hint',
      'likely / unlikely annotation',
      'fixed prediction policy',
      'prediction without history',
      'prediction accuracy of a simple rule',
      'which prediction strategy misses less',
      'cheapest branch predictor',
    ],
  },

  briefing: {
    observable: [
      'The program is a six-line summing loop written in assembly; the two branch lines, a forward `beq` and a backward `blt`, each carry a needle that swings to the side the current rule guesses before any branch runs.',
      'A strip to the right records, element by element, whether each of the two branches was guessed right or wrong, so the twenty branch executions of one run are laid out in order.',
      'Every wrong guess releases a chunk of lost cycles that flies to a pile belonging to that branch, so the losses stay attributed to the branch that caused them.',
      'When a new run starts, the previous run\'s piles remain as dashed outlines, so switching rules shows chunks moving from one branch\'s pile to the other\'s.',
      'With the ten values here, never-taken misses 11 of 20 (9 on the loop branch, 2 on the check), always-taken misses 9 (8 on the check, 1 on the loop branch), and guessing by jump direction misses 3 — 22, 18 and 6 lost cycles.',
      'Small bars at the lower left keep the lost-cycle total of the last run under each rule, so all three can be read side by side once each has been played.',
      'The closing caption splits the misses into forward and backward and gives the lost cycles and the percentage right.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A three-way control labelled Guess rule — Never taken (default), Always taken, Backward taken — carries the argument: a run finishes and waits, and the next press replays the same twenty branches under the chosen rule.',
        'Three counters sit on the control bar: Misses, Hit % and Lost cycles, for the run in progress.',
        'The program, the ten values and the two-cycle cost per miss are fixed, so an article can quote the exact totals for each rule.',
        'The code panel, labelled Counting misses per rule, starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article claims that switching from "predict not taken" to "predict taken" makes a pipeline better, and the reader needs to see that the misses mostly change address rather than disappear.',
      'The prose has to justify why a simple processor or a compiler hint would pick one fixed guess over another, and the reader should weigh three candidates on one program with the totals in view.',
      'The reader is about to meet predictors that learn from history, and should first know how far a rule with no memory at all already gets — and exactly which cases it can never recover.',
    ],

    avoidWhen: [
      'The article is about predictors that record what a branch did — counters, history tables, pattern tables. Nothing here remembers a past outcome.',
      'The subject is how the pipeline discovers a wrong guess and cancels the instructions it fetched. The cost of a miss is a fixed number of cycles here and the pipeline is never drawn.',
      'The subject is finding the target address of a taken branch — branch target buffers, return stacks, indirect jumps. That cost is set to zero here.',
      'The article is about "static" in the sense of static analysis, static typing or static variables.',
      'The subject is branchless code, conditional moves or speculative execution security flaws.',
    ],

    contrastWith: [
      {
        concept: 'backwardTaken',
        note: 'That concept is the observation that makes one fixed rule good — loop-closing jumps usually go back — while this one is the choice among fixed rules and what each choice costs on a given program.',
      },
      {
        concept: 'mispredictionPenalty',
        note: 'This claims the choice of guess decides how many misses occur and on which branches; the other claims the harm of each miss grows with how late the pipeline learns the outcome.',
      },
      {
        concept: 'saturatingCounter',
        note: 'A counter changes its guess from what the branch did before; a static rule is decided once and never updates, so it cannot adapt to a branch that changes behaviour.',
      },
      {
        concept: 'branchHistoryTable',
        note: 'History-indexed prediction can learn a repeating pattern of outcomes; a static rule assigns every execution of a branch the same guess, so any alternation is missed on every other pass.',
      },
      {
        concept: 'controlHazard',
        note: 'The hazard is the reason a guess is needed at all — the next fetch happens before the branch is decided; static prediction is one answer to what that guess should be.',
      },
    ],
  },
};
