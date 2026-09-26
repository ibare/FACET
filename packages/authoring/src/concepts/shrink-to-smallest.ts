/**
 * shrinkToSmallest 개념 선언.
 *
 * canonical facet 은 `facet:shrinkToSmallest` — 성질 `decode(encode(list)) == list` 를 깨는 입력 `[7, 23, 4, 1]` 을
 * 줄인다. 칸 하나를 지운 후보 · 값 하나를 줄인 후보를 돌려 여전히 깨지면 받고 멀쩡하면 버린다. 후보 열을 돌려
 * 다섯을 받고 다섯을 버린 뒤, 새 후보가 없어 `[10]` 에서 멈춘다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (버린 토픽의 조각)
 *
 * catalog `origin` 은 완제품 판정에서 버린 토픽 `counterexample-shrinking` 을 가리킨다. 완제품이 없는 묶음이라
 * (`tasks/concept-meta-batch-protocol.md` 묶는 법 2) 조각 개념만 쓰고, 가장 가까운 완제품 `branchCoverage` 와
 * 이웃 묶음의 이력 bisect(`historyBisect` · `bisectHalving`)를 contrastWith 로 잇는다. bisect 는 이력의 한 점을
 * 반씩 좁혀 찾고, 이쪽은 **입력의 크기**를 줄이며 반씩 가르지 않는다.
 * definition 은 property-based testing · counterexample · shrinking · smaller candidate · still fails 를 쥐고,
 * coverage · line · branch · mutant · commit · halving 을 쓰지 않는다.
 *
 * 전제 (설명 글 `shrinkToSmallest.md`):
 *  - 처음 입력은 생성기가 찾았다고 둔다. encode 는 수마다 십진 글자를 사이 표시 없이 잇고, decode 는 글자 하나를
 *    수 하나로 읽는다 (두 함수의 코드는 화면에 없다).
 *  - 줄이기 규칙은 단순화한 모형이다 — 한 바퀴에 앞 칸부터 지우기, 그다음 칸마다 값을 0 · 반 · 하나 뺀 값 차례로.
 *    받은 것이 있는 바퀴 뒤에 한 바퀴 더. 돌려 본 입력은 기억해 다시 돌리지 않는다. 실제 도구(Hypothesis ·
 *    QuickCheck 등)는 목록 · 수마다 다른 후보를 만들고 반씩 잘라 보기도 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shrinkToSmallestConcept: FacetConceptSource = {
  id: 'shrinkToSmallest',
  label: 'Shrinking a Failing Input (Property-Based Testing)',
  canonicalFacet: 'facet:shrinkToSmallest',

  surface: {
    definition:
      'Property-based testing shrinks a failing input by trying smaller candidates — one element removed or one value reduced — keeping each that still fails until no smaller failing candidate remains.',
    exemplarKeywords: [
      'shrinking',
      'counterexample shrinking',
      'minimal failing input',
      'property-based testing',
      'Hypothesis shrinking',
      'QuickCheck shrink',
      'fast-check counterexample',
      'round-trip property encode decode',
      'test case reduction',
      'why the reported failing example is so small',
    ],
  },

  briefing: {
    observable: [
      'The property `decode(encode(list)) == list` sits at the top. The input `[7, 23, 4, 1]` is shown as four slots with its encoding `"72341"` and the decoded result `→ [7, 2, 3, 4, 1]`, marked `!=` and "breaks". The caption reads "The property breaks on this input. Length: 4".',
      'Each step builds one candidate beside the input, runs the property on it and labels it "kept" or "dropped": "Without slot 0 it still breaks. Kept — the candidate is the new input." or "Without slot 0 the property holds. Dropped — the input stays." Candidates show their own encoding and decoding, and a round label, such as "Round 1 · delete slot 0".',
      'Deletions come first: 7 goes, `[23, 4, 1]` still breaks; removing 23 gives `[4, 1]`, which holds, so it is dropped; then 4 and 1 go, leaving `[23]`.',
      'Values shrink next: 23 → 0 holds and is dropped, 23 → 11 still breaks (`"11"` → `[1, 1]`) and is kept, 11 → 5 holds, 11 → 10 still breaks and is kept, 10 → 9 holds. The slot that caused the failure never disappears; only its value falls.',
      'An "Already run" list grows with every input tried; candidates already in it are skipped without a step, counted as "Skipped, already run". Round 2 tries deleting the last slot, `[]` holds, and nothing new is left.',
      'The last step reads "No new candidate left. Smallest input: [10] · Candidates run: 10 · kept: 5 · dropped: 5". `[10]` encodes to `"10"` and decodes to `[1, 0]`; every one-slot list holding a single-digit value holds.',
      'The assumptions, which the screen does not footnote: the starting input is taken as what a generator found. encode joins decimal digits with no separator and decode reads one digit per number; their code is not on the screen. The shrinking rule is a simplified model — delete slots front to back, then try each value as 0, half, and one less, repeat a round while anything was kept, and remember inputs already run. Real tools such as Hypothesis or QuickCheck generate different candidates per type and may also try cutting a list in half.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one candidate per step, and stops when no new candidate is left.',
        'A Replay button and a playback strip sit below it. Holding the strip on the step where `[4, 1]` is dropped shows why 23 cannot be deleted.',
        'The property, the starting input and the shrinking order are fixed, so an article can quote every candidate and its verdict in sequence.',
      ],
    },

    useWhen: [
      'The article introduces property-based testing and needs to explain why the counterexample a tool reports is so small compared with the random input that first failed.',
      'A reader asks what a shrinker actually does; the step-by-step kept / dropped verdicts, with the failing slot surviving every deletion attempt, show the loop.',
      'The article uses a round-trip property as its example and wants the minimal failing case, `[10]`, to reveal the bug: digits of a two-digit number lose their boundary.',
    ],

    avoidWhen: [
      'The article is about how the random inputs are generated or how many are tried. Generation is not shown; the failing input is given.',
      'The subject is finding the commit that introduced a bug by halving history. Nothing here is a history or a version; the size of one input is reduced.',
      'The point is delta debugging on large files or halving strategies. The rule here removes one slot at a time and never splits the list in half.',
      'The article needs the actual fix to the encoder. The screen stops at the smallest failing input.',
    ],

    contrastWith: [
      {
        concept: 'bisectHalving',
        note: 'Bisecting narrows down a point in an ordered history by halving the range each time. Shrinking reduces the size of one failing input, and the candidates here only ever remove one element or lower one value.',
      },
      {
        concept: 'historyBisect',
        note: 'Bisecting a history answers when a failure first appeared. Shrinking answers what the smallest input showing it is. Both repeat a check and narrow toward the failure, one across time, the other within the input.',
      },
      {
        concept: 'branchCoverage',
        note: 'Coverage and mutation measures judge how much passing tests exercise before anything fails. Shrinking begins after a test has failed and asks how little input is needed to keep it failing.',
      },
    ],
  },
};
