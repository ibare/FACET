/**
 * splitAndNumber 개념 선언.
 *
 * canonical facet 은 `facet:splitAndNumber` — 조각(piece)이다. 왼쪽 원장에 벡터
 * 다섯이 줄로 서 있고 오른쪽에 앞 토막 · 뒤 토막의 평면 둘이 있다. 한 줄이
 * 가운데서 갈리면 두 토막이 각 평면으로 날아가 점이 되고, 대표 넷까지 선을 뻗어
 * 재 본 뒤 가장 가까운 하나로 갈아타며, 값 칸은 비고 번호 칸이 찬다. 계기도
 * 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `productQuantization` 은 토막 수를 손잡이로 삼아 정확도와 자리의
 * 맞바꿈을 맡는다. 이 조각이 홀로 맡는 것은 **대체 그 자체** 다 — 값을 버리고
 * 대표의 번호만 남기며, 앞뒤 토막이 따로 고르므로 한 벌이 서로 다른 번호 둘로
 * 적힐 수 있다는 것. definition 의 주어가 "적어 두는 것" 이고, keywords 는
 * 무엇이 저장되는가 · 표 조회 어휘만 갖는다 (완제품의 메모리 대 정확도 어휘와
 * 겹치지 않게).
 *
 * ── 묶음 사이는 어떻게 갈랐나
 *
 * 무엇으로 재는가(각 · 방향 · 잣대 고르기)와 몇 번 재는가(곱셈 · 훑기 · 차원
 * 수)의 어휘를 definition 과 keywords 에서 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitAndNumberConcept: FacetConceptSource = {
  id: 'splitAndNumber',
  label: 'Split and Number (Keeping the Label Instead of the Values)',
  canonicalFacet: 'facet:splitAndNumber',

  surface: {
    definition:
      'Cutting a vector in two and writing down, for each half, only the number of the table entry that stands in for it, so a row of four values is held afterwards as a pair of numbers.',
    exemplarKeywords: [
      'store a code instead of the values',
      'codebook lookup',
      'one number in place of several values',
      'sub-vector',
      'coding half a vector at a time',
      'what is actually kept for each item',
      'sixteen bytes become two',
      'the index of a stand-in',
      'the halves are coded independently',
      'decoding returns the stand-in and not the original',
    ],
  },

  briefing: {
    observable: [
      'The ledger on the left shows the code slots as empty dashed boxes from the first frame, so what the row is going to become is visible before anything is replaced.',
      'A dashed cut opens down the middle of the active row and the two halves leave as points, each flying into its own plane — the independence of the halves is staged as two separate departures.',
      'Spokes reach from the arriving point to all four table entries at once and only then does one of them turn solid while the rest fade back, so choosing is preceded by measuring rather than asserted.',
      'The measured number is written next to the chosen spoke and rides along with the point as it hops, so the reading stays attached to the thing it measured.',
      'As the point lands, the four value cells fade out and the two code slots fill in with the colour of the entry chosen, so losing the values and gaining the numbers are one motion.',
      'Each coded half leaves a small dot parked beside its table entry, so by the end every entry carries a visible tally of how many halves collected on it.',
      'The fifth row is the one where the two halves disagree — front picks 1 and back picks 2 — and the caption changes wording for exactly that row, while the other four happen to agree.',
      'The error column reads 1.41 for four rows and 1.00 for the third, whose back half lands exactly on its entry and shows a measured reading of 0.00.',
      'The closing beat draws two brackets on the same row, 16 bytes under the values and 2 bytes under the numbers, so the comparison is spatial rather than stated.',
      'The numbers on screen start from zero, so an article quoting "entry 1" must mean the second of the four.',
    ],

    screen: {
      affordances: [
        'The screen codes all five rows on its own and stops with the two brackets drawn.',
        'Two buttons: Replay, and a step control that rewinds and walks the same rows one beat at a time, which is how a reader can hold the screen at the moment all four spokes are still drawn.',
        'The five vectors and the two tables of four entries are fixed, so an article can name the row whose halves disagree and the row whose back half lands exactly.',
      ],
    },

    useWhen: [
      'The article says vectors are stored "compressed" and the reader has no picture of what physically remains. A row whose values fade out and leave two small numbers behind is that picture.',
      'A reader hears "codebook" and pictures a dictionary that translates something. Here the entry is a position that the data moves onto, and what is written down is merely which position it was.',
      'The prose treats the whole vector as coded in one go, and the thing that has to land is that the halves are decided separately — one row here picks two different entries for one item.',
    ],

    avoidWhen: [
      'The subject is how the table entries were arrived at, or why these positions rather than others. They are placed in advance here and never moved.',
      'The point is what finer or coarser cutting buys, or how much fidelity is lost overall. The cut stays at two halves for the whole run.',
      'The article is about comparing coded items without decoding them first, or the precomputed tables that allow it. Everything here ends at the stand-in.',
      'The subject is lossless compression, entropy coding or an archive format, where the original is recoverable by construction.',
      'The article means hashing a value into a slot. Two nearby halves are meant to collect on the same number here, which is the opposite of what a hash is built for.',
    ],

    contrastWith: [
      {
        concept: 'productQuantization',
        note: 'One holds the cut at a single setting and is about the substitution itself; the other treats the cut as the variable and reports what moving it does to fidelity and storage.',
      },
      {
        concept: 'assignThenMove',
        note: 'Both attach data to a stand-in, but there the stand-ins slide to the middle of whatever attached to them, while here they never move and the whole point is which one was picked.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both turn something into a small number, but one is built so that near values land far apart, and this is built so that near values land on the same number.',
      },
    ],
  },
};
