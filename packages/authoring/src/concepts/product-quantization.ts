/**
 * productQuantization 개념 선언.
 *
 * canonical facet 은 `facet:productQuantization` — 완결형이다. 값 여덟이 별의
 * 살로 서고 대표 넷이 동심원으로 둘러싼다. 손잡이(토막 수 1 · 2 · 4 · 8)를 옮기면
 * 되살린 윤곽이 고리 위의 호로 모였다 흩어지고, 원본과의 벌어짐이 붉은 선으로
 * 그 자리에 남으며, 오른쪽에 번호가 하나씩 쌓인다. 계기 둘(자리 · 오차 %)이
 * 붙어 있고 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `splitAndNumber` 는 쪼개어 번호로 갈아 끼우는 일 자체를 맡는다. 이 개념이
 * 홀로 맡는 것은 **맞바꿈** 이다 — 잘게 쪼갤수록 되살린 것이 원본에 붙고 남길
 * 번호가 그만큼 는다는, 서로 반대로 움직이는 두 값. definition 의 주어가
 * "토막을 더 내는 일" 이고, keywords 는 메모리 대 정확도 · 색인 압축 어휘를
 * 갖는다 (조각의 대체 어휘와 겹치지 않게).
 *
 * ── 묶음 사이는 어떻게 갈랐나
 *
 * 이 묶음은 **얼마나 줄여 두고 재는가** 다. 무엇으로 재는가(각 · 방향 · 잣대
 * 고르기)와 몇 번 재는가(곱셈 · 훑기 · 차원 수)의 어휘를 definition 과
 * keywords 에서 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const productQuantizationConcept: FacetConceptSource = {
  id: 'productQuantization',
  label: 'Product Quantization (Finer Chunks, Truer Values, More Storage)',
  domain: 'ai-engineering',
  canonicalFacet: 'facet:productQuantization',

  surface: {
    definition:
      'Cutting a vector into chunks and keeping one table number for each: the more chunks it is cut into, the closer the rebuilt vector stands to the original, and the more numbers have to be held.',
    exemplarKeywords: [
      'product quantization',
      'PQ codes',
      'how many sub-vectors to use',
      'compressed vector index',
      'holding millions of embeddings in memory',
      'accuracy against memory footprint',
      'IVFPQ',
      'bytes held per item',
      'faiss compression',
      'a coarse stand-in for an embedding',
    ],
  },

  briefing: {
    observable: [
      'The original is a polygon that never moves for the whole run, so every change on screen is something the coding did rather than a change of subject.',
      'The four table values are drawn as concentric rings, which makes a chunk that has been coded read as an arc lying on one ring — the flattening of several values into one is a shape, not a caption.',
      'The gap between original and rebuilt is drawn in red at the spoke where it occurs and left there, so the error stays beside the value that owns it instead of being sent off to a counter.',
      'Numbers stack up on the right, one per chunk, and the byte reading underneath is literally the height of that stack, so the price is counted in the same gesture that pays it.',
      'Across the four settings the error reads 6.56, 6.24, 5.57 and 1.73 while the storage reads 1, 2, 4 and 8 bytes, and the two move in opposite directions at every step.',
      'The last step is far larger than the three before it: cutting down to one value per chunk lets every value pick its own table entry, and the percentage counter drops from 37 to 11.',
      'Both figures are stated against the original at 32 bytes, so the saving and the damage are quoted on one scale.',
      'Ties are settled toward the lower number, and this data actually reaches a tie four times, so the picture is reproducible rather than depending on which entry was examined first.',
      'After the handle moves, the rebuilt outline starts from wherever the previous setting left it and walks to its new place chunk by chunk, so the first beat of a new setting still shows the old shape.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One setting plays through on mount and the screen then waits.',
        'A segmented slider beside the playback controls carries four chunk counts — 1, 2, 4 and 8 — starting at 2, and each choice recuts the star and codes it again from the beginning.',
        'The trade only exists across settings, so it is the reader who assembles it by moving the handle and reading the two counters at each stop.',
        'The vector and the four table values are fixed, so an article can quote any row of the ladder and the reader will read the same figures.',
      ],
    },

    useWhen: [
      'An article quotes a compression ratio for a vector store as a headline figure, with the damage left unstated. Two counters moving in opposite directions at every notch is the missing half of that figure.',
      'A reader treats coding as a switch that is either on or off. Four settings between "one number for everything" and "one number per value" turn it into a dial with a readable cost at each position.',
      'The prose says accuracy is approximately preserved and needs somewhere for "approximately" to land — here it is a set of red lengths standing on the values that suffered them.',
    ],

    avoidWhen: [
      'The subject is where the table entries come from — learning them from the data, or why one set of stand-ins beats another. They are handed over as an even grid here and never questioned.',
      'The point is scoring the codes against a query without rebuilding, or the lookup tables that make that possible. Everything here is judged against the rebuilt values.',
      'The article means reducing the precision of model weights or activations, or storing numbers as smaller integers. What is replaced here is a run of values by one table number.',
      'The subject is lossless compression — encodings from which the original comes back exactly.',
      'The question is what a search costs once the vectors are held this way. Nothing is searched on this screen.',
    ],

    contrastWith: [
      {
        concept: 'splitAndNumber',
        note: 'One fixes the cut at a single setting and is about the substitution itself; the other moves the cut and reports what fidelity and storage do as it moves.',
      },
      {
        concept: 'projectAndLose',
        note: 'Both keep less than they were given, but one discards a whole direction and cannot get it back, while this keeps every component and only coarsens the values each may take.',
      },
      {
        concept: 'spaceErrorTradeoff',
        note: 'Both buy accuracy with memory, but one crowds many keys into shared counters so every answer comes back too large, while here a value is replaced by a stand-in and the error has no fixed direction.',
      },
      {
        concept: 'kmeans',
        note: 'The stand-ins here are given in advance and the subject is what happens as they are applied more finely; finding where such stand-ins ought to sit in the first place is the other question.',
      },
    ],
  },
};
