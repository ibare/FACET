/**
 * scanUntilFound 개념 선언.
 *
 * canonical facet 은 `facet:scanUntilFound` — 조각(piece)이다. 줄은 한 벌만
 * 그리고, 같은 눈길이 그 한 줄을 두 번 지나간다. 지나간 자취가 아래에 나란히
 * 쌓여 두 길이를 견줄 수 있고, 그 사이에 길이 차이를 재는 표가 붙는다.
 * 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `linearSearch` 가 절차 전체와 코드 · 누적 계기를 맡으므로, 이 조각은
 * **두 훑기의 길이 차이** 한 가지에만 무게를 싣는다 — 찾으면 그 자리에서 멎지만
 * 없다고 답하려면 끝까지 가야 하고, 그것은 줄이 서 있지 않아 중간에 포기할
 * 근거가 없기 때문이라는 것. definition 의 주어가 "실패한 조회의 값" 이고,
 * keywords 는 이른 탈출 · 부재 증명 · 최악의 경우 어휘만 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const scanUntilFoundConcept: FacetConceptSource = {
  id: 'scanUntilFound',
  label: 'Scan Until Found (Why the Miss Costs More Than the Hit)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:scanUntilFound',

  surface: {
    definition:
      'In an unordered row a match ends the scan where it is found, while absence can only be established by reaching the end, so a failed lookup costs more than a successful one.',
    exemplarKeywords: [
      'early exit',
      'break out of the loop',
      'not found',
      'proving something is absent',
      'worst case versus the usual case',
      'the miss is the expensive one',
      'no reason to give up early',
      'membership test cost',
      'how many elements did it actually touch',
      'stops as soon as it matches',
    ],
  },

  briefing: {
    observable: [
      'One row is drawn, not two: the same gaze crosses that single row twice, and only the trails it leaves accumulate underneath, one per pass.',
      'The gaze really travels — it slides along the row rather than jumping between highlighted cells — and each trail segment stretches out from its left edge as the gaze advances.',
      'The first pass ends against a wall at the cell that matched, and its trail stops there with the count of cells looked at written at its tip.',
      'The second pass runs past the last cell: the trail leaves the row as an arrow and the gaze itself slides off the edge of the picture, which is what "there was nowhere to give up" looks like.',
      'The two trails lie parallel, so their lengths can be compared directly, and a bracket underneath measures the difference between them.',
      'The closing caption names the two costs as numbers the scan itself counted — what stopping cost, and what answering "no" cost.',
    ],

    screen: {
      affordances: [
        'The screen plays both passes on its own and stops with the two trails and the bracket left in place.',
        'Two buttons: Replay, and a step control that rewinds and walks the same two passes one cell at a time, which is the way to stop on the cell where the first pass ends.',
        'The row and the two values looked for are fixed, so an article can name the value that is in the row and the one that is not.',
      ],
    },

    useWhen: [
      'The article says a search is fast because it usually stops early, and the reader takes that as the whole story. The second trail running off the end is the case the average was hiding.',
      'A reader has to accept that the expensive case is not bad luck but forced: with no order in the row there is no cell at which giving up would be justified, and the picture offers no such cell.',
      'The prose is about a membership check inside a loop — checking a list for a value on every iteration — and the cost that matters is the one paid when the value is not there.',
    ],

    avoidWhen: [
      'The article is teaching how a scan is written, or comparing the same loop across languages. Nothing here shows source.',
      'The row in the article is sorted, or the point is what an order lets a search skip. The argument here depends on there being no order to lean on.',
      'The subject is a structure that answers absence without scanning — a hash set, an index, a Bloom filter.',
      'The point is total work over many searches, or an amortised or average cost. Two passes are shown and each is reported on its own.',
    ],

    contrastWith: [
      {
        concept: 'linearSearch',
        note: 'That concept is the procedure itself; this one keeps nothing but the asymmetry between a scan that ends at a match and one that must reach the end to prove absence.',
      },
      {
        concept: 'requiresSorted',
        note: 'The mirror of this: an order is exactly what would give the scan a place to stop early, and without it there is none.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both concern where a search may stop, but halving discards the part of the row it has ruled out, while this can rule nothing out until it has looked.',
      },
    ],
  },
};
