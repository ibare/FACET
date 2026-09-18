/**
 * beamSearch 개념 선언.
 *
 * canonical facet 은 `facet:beamSearch` — 완제품이다. 프롬프트 `For lunch she ate` 뒤에
 * 낱말 셋을 잇는 나무가 왼쪽에서 오른쪽으로 자라고, 세로줄마다 위쪽 띠가 빔 자리다.
 * 손잡이 둘 — 빔 폭(1 · 2 · 3 · 4, 처음 1)과 불가능한 후보 지우기(끔 · 켬, 처음 끔) —
 * 을 옮길 때마다 한 판을 새로 돈다. 여덟 조합의 답은 `runBeamSearch` 로 다시 재어
 * 설명 글의 표와 같음을 확인했다. 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **폭이라는 손잡이** 다 — 얼마나 넓어야 가장 그럴듯한
 * 글에 닿는가, 그리고 지우기를 먼저 하면 좁은 폭이 어떻게 구제되고 견줄 후보가 주는가.
 * 가장 그럴듯한 글에 닿는 폭은 지우기를 켜도 3 그대로다 — definition 이 "폭을 줄인다"
 * 고 말하지 않는 까닭이다. 주어가 "폭" 이다.
 *
 * - `carrySeveralLines` 는 폭 2 로 고정된 한 판에서 2 등 줄이 1 등을 앞지르는 장면이다.
 *   그쪽 어휘(greedy · runner-up · overtake · summed log probability)는 definition 에서
 *   쓰지 않았다 — 이 화면의 점수는 로그 합이 아니라 확률의 곱이기도 하다.
 * - `eraseTheImpossible` 는 줄기가 하나뿐인 문법 제약 디코딩이다. 그쪽 어휘(grammar ·
 *   JSON · token · redistribute)도 쓰지 않았다. **마주 보는 짝**으로 꼬리를 엇갈렸다 —
 *   여기서는 지워도 점수는 그대로이고 비운 빔 자리를 다른 줄기가 차지한다. 저쪽은 지운
 *   몫을 남은 후보에게 나눠 주고 한 번의 선택이 바뀐다.
 *
 * ── 전제
 *
 * 다음 낱말 표의 확률은 예로 정한 값이다. `a` 뒤 `apple` 45 % 는 작은 모형의 실수를
 * 일부러 넣은 것. avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const beamSearchConcept: FacetConceptSource = {
  id: 'beamSearch',
  label: 'Beam Search (How Wide the Beam Must Be)',
  canonicalFacet: 'facet:beamSearch',

  surface: {
    definition:
      'How wide a decoder\'s set of kept partial sentences must be to reach the likeliest complete sentence, and how ruling out ill-formed continuations before scoring rescues narrow beams and cuts the candidates scored, leaving every score untouched.',
    exemplarKeywords: [
      'beam search',
      'beam width',
      'beam size',
      'num_beams',
      'wider beam costs more candidates',
      'widening the beam stops helping',
      'sequence search in text generation',
      'constrained beam search',
      'pruning candidates to the top k by score',
      'machine translation decoding',
    ],
  },

  briefing: {
    observable: [
      'A tree grows left to right from the prompt "For lunch she ate", one column per word for three words. The top of every column is a dashed band holding exactly as many slots as the beam is wide, and the band stretches or shrinks when the width changes.',
      'Each column plays out as branching, then culling: every surviving stem sends out branches that line up below, the ones with the highest whole-sentence score climb into the band, and the rest are cut and fall away. A stem already closed by "." is carried across unchanged and marked "ended".',
      'With erasing off, widths one and two both settle on "a apple pie" at 14.175 % and the closing line says it breaks the article rule. Width three is the first to reach "some soup ." at 15 %, which begins from the third-placed first word "some" at 25 %. Width four finds the same sentence.',
      'The count of candidates scored reads 8, 13, 16 and 18 across widths one to four with erasing off, so every step wider costs more even where the answer no longer improves.',
      'With erasing on, branches at a column first appear without scores, the ones that cannot follow the article ("a apple", "an banana") are struck through and dropped, and their siblings rise to fill the band. Width one then chooses "a big sandwich" (fifth among grammatical sentences), width two "an apple ." (second), and widths three and four "some soup ." for 14 and 16 candidates scored instead of 16 and 18.',
      'Erasing never raises a surviving branch\'s score; the percentages stay exactly as the table gives them, and the change comes only from which stems get to occupy the slots.',
      'When a handle moves, the previous answer path stays as a dotted line and the new one flows out from it, so the switch between answers is traced rather than simply replaced. The per-mille gauge for the chosen sentence reads 142, 150, 74 and 128 for the four distinct answers.',
      'The next-word probabilities are values fixed for the example, not the output of any real model; the 45 % given to "apple" after "a" is a deliberate small-model mistake.',
    ],

    screen: {
      affordances: [
        'The screen plays one full round at width one with erasing off and then waits; each move of either handle starts a fresh round.',
        'A four-position handle for the beam width (1, 2, 3, 4) and a two-position handle to erase impossible candidates (off, on).',
        'Playback controls to run, step, pause, reset and change speed, next to three gauges: candidates scored, candidates erased, and the chosen sentence in per mille.',
        'A code panel holding the same search written as a function that keeps the stems and candidates in arrays and culls by choosing the largest score as many times as the width allows.',
      ],
    },

    useWhen: [
      'The article recommends a beam size and the reader needs to see that the right number depends on where the better sentence starts: here nothing below three finds it, and four finds nothing more while scoring two extra candidates.',
      'A reader assumes a wider beam is simply better; the gauge of candidates scored climbs at every width while the answer stops changing after three, which puts the cost of the setting in view.',
      'The prose explains constrained beam search and has to show why dropping ill-formed continuations helps even a narrow search: the slot freed by a struck branch goes to another stem, so width two already lands on a correct sentence.',
    ],

    avoidWhen: [
      'The subject is sampling — temperature, top-k or nucleus draws. Nothing here is random; every round is fully determined by the handles.',
      'The article is about length penalties, repetition penalties or diverse beams. All sentences here are three words or end early on "." and no score is adjusted.',
      'The point concerns an actual model\'s behaviour. The probabilities are chosen for the example and include a planted mistake, so no number here measures a real system.',
      'The subject is keeping output inside a schema or file format such as JSON. The only rule here is the a/an article agreement over a handful of English words.',
    ],

    contrastWith: [
      {
        concept: 'carrySeveralLines',
        note: 'One claim is that keeping a second candidate alive can rescue a better sentence; this one asks how many must be kept before the rescue is certain, and what each additional one costs.',
      },
      {
        concept: 'eraseTheImpossible',
        note: 'Both rule out continuations before choosing, but there the removed probability is handed to the survivors and changes a single pick, while here scores are left as they were and the gain is the room freed for other candidates.',
      },
      {
        concept: 'greedyDecoding',
        note: 'Taking the top word at each step is the width-one case of this search; this treats width as the adjustable quantity and weighs a better sentence against the extra candidates scored.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Both show a locally best choice leading to a worse whole, but that is a counterexample to a rule, and this is a remedy with a price: keep more partial answers and pay for it in comparisons.',
      },
      {
        concept: 'branchAndBound',
        note: 'Both cut branches of a search tree, but that cuts only what provably cannot win and so stays exact, while this cuts by rank with a fixed budget and can lose the best answer.',
      },
    ],
  },
};
