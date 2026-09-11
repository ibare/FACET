/**
 * matchLengthPerSpot 개념 선언.
 *
 * canonical facet 은 `facet:matchLengthPerSpot` — 조각(piece)이다. 문자열
 * `aabaabaabx` 한 벌이 글자 칸 열 개로 서 있고, 그 아래 점선 값 칸에 자리마다의
 * 답이 채워진다. 구간 밖 자리는 커서 둘이 나란히 걸으며 글자를 견주고, 구간 안
 * 자리는 왼쪽 거울 칸에서 값 조각이 활을 그리며 날아와 앉는다. 구간 밴드와 `r`
 * 표시는 옮겨 가되 한 번도 왼쪽으로 가지 않는다. 계기도 코드 패널도 없고
 * 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 이 데이터에서 무엇이 걸리는가
 *
 * 답은 `10,1,0,6,1,0,3,1,0,0` 이고, 거울에서 빌리는 자리가 다섯(i=4,5,6,7,8),
 * 실제로 글자를 견주는 자리가 다섯(i=1,2,3,6,9), 구간 이동이 둘(`[1,1]` → `[3,8]`)
 * 이다.
 *
 * i=6 이 이 데이터의 고비다. 거울 자리 `값[3]` 이 6 인데 구간 끝까지가 3 뿐이라
 * **3 만 빌리고**, 그 너머는 확인된 적이 없으므로 구간 끝에서부터 실제로 견줘 한
 * 번에 어긋난다. 빌림과 이어 견줌이 한 자리에서 같이 보이는 유일한 자리다. 게다가
 * stage 의 `scan` 이 끝에 `writeValue(..., false)` 를 부르므로 그 칸은 빌린 색이
 * 아니라 견준 색으로 앉는다 — **빌림은 다섯이지만 마무리에 튀는 칸은 넷**이다.
 *
 * (앞선 고정 문자열 `aabaabxaab` 에서는 이 갈래가 한 번도 성립하지 않아 화면이
 * 규칙의 절반만 보였다. 그래서 텍스트를 바꿨다.)
 *
 * ── 이웃과 어떻게 갈랐나
 *
 * 가장 가까운 `prefixSuffixJump` 와는 **무엇을 세는가** 로 갈랐다. 저쪽은 각 앞조각의
 * 머리이자 꼬리인 가장 긴 길이를 세고 그 값을 **밀 거리**로 쓴다. 이쪽은 각 자리가
 * **맨 앞과 겹치는 길이**를 세고, 그 셈이 **제가 앞서 낸 답을 되빌린다**는 것 자체가
 * 주장이다. keywords 도 저쪽은 실패 함수 · 경계(border) 어휘를, 이쪽은 Z 값 ·
 * 거울 자리 · 오른쪽으로만 가는 구간 어휘를 갖는다.
 *
 * `memoWriteOnce` · `overlappingSubproblems` 와는 **되빌리는 근거**로 갈랐다. 저쪽은
 * 같은 부분문제를 다시 만나 저장된 답을 꺼내는 것이고, 이쪽은 대칭 때문에 **다른
 * 자리의 답이 이 자리의 답을 보증하는 것**이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matchLengthPerSpotConcept: FacetConceptSource = {
  id: 'matchLengthPerSpot',
  label: 'Match Length at Every Position (Borrowing from the Mirror Spot)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:matchLengthPerSpot',

  surface: {
    definition:
      "Computing for every position of a string how far it agrees with that same string's own beginning, where a position inside an already verified stretch takes its answer from the mirrored earlier position instead of measuring it from scratch.",
    exemplarKeywords: [
      'Z array',
      'Z function',
      'Z algorithm',
      'longest common prefix with the string itself',
      'match length at each index',
      'the rightmost stretch that repeats the beginning',
      'copy the value from the mirrored index',
      'reuse an answer by symmetry',
      'the segment only ever moves right',
      'linear time preprocessing of one string',
      'a string containing a copy of its own start',
    ],
  },

  briefing: {
    observable: [
      'Ten letter cells stand in a single row, each with a dashed empty box below it and its position number under that, so every answer can be watched arriving in the box that belongs to it.',
      'The first position is settled by a tinted bar sweeping the whole row from end to end before the full length drops into its box, which is why that one entry is larger than every other.',
      'For a position outside the verified stretch two markers appear, a hollow one at the front of the row and a filled one at the position itself, and they step rightward in lockstep — the pair of cells under them flashing briefly where the letters agree and flashing longer in a different tone on the pair that does not; the long walk of six agreeing pairs at position three is what opens the stretch the rest of the run then lives off.',
      "For a position inside the stretch the markers stay away entirely: the number lifts out of a box further left and flies along a dashed arc over the row into this position's box. That flight happens five times, and four of those positions are settled by it outright, without one letter being compared.",
      "The fifth flight carries a smaller number than the box it left — the mirror box holds six, but only the three that still fit inside the stretch are handed over — and because that borrowed run ends exactly at the stretch's right edge, the markers do appear there, land on the first pair beyond it, and fail on it at once; borrowing and comparing are seen at one and the same position.",
      'A band covers the verified stretch with a dashed vertical line labelled r at its right end, a second band of the same width is held at the very front of the row under the word mirror, and the cells are shaded to set the stretch apart from the opening it repeats; the band relocates only twice in the whole run — onto a single cell near the front, then onto a stretch of six — and its right end lands farther right on both moves, which the closing caption states outright.',
      'Boxes filled from the mirror keep a stronger fill than boxes filled by comparing, and at the end each of the four that the mirror settled on its own bounces once in turn — the position that had to go on comparing is left in the computed tone, so how much of the table the borrowing actually finished can be counted from the picture at rest.',
    ],

    screen: {
      affordances: [
        'The screen works through all ten positions on its own and stops on the closing caption with the band left standing over the last stretch.',
        'Two buttons: Replay, and a step control that rewinds and re-walks the same run one move at a time, which is the way to stop on a single flight of a number out of a mirror box.',
        'The string is fixed at aabaabaabx, so an article can name the answers that appear — ten, one, zero, six, one, zero, three, one, zero, zero — and the one position where a borrowed answer runs out and comparing resumes.',
      ],
    },

    useWhen: [
      'The article states that the entire table is built in time proportional to the length of the string, and the reader has no way to believe it, since each entry looks like it needs its own walk back to the front. The dashed right end advancing and never returning is that proof, drawn.',
      'A passage claims a position can be answered without looking at the letters sitting there, and the reader needs both the authority for it and its limit. A number arriving by arc with no markers on screen gives the authority; the one flight that is cut down to what the stretch still covers, and then has to go on comparing from that edge, gives the limit.',
      'The prose has established that a string may carry a copy of its own opening further along, and now needs that copy to do work rather than merely be pointed at — here the copy is what hands the answers over.',
    ],

    avoidWhen: [
      "The article is searching for one string inside another. Only one string is present here, and every answer is measured against that same string's own beginning.",
      'What the article wants is a distance to move something forward after a failed comparison. Nothing advances across the row here; each position receives a length and keeps it.',
      'The subject is comparing from the back of a pattern, choosing a skip from the letter that failed, matching by a fingerprint over a sliding window, sorting the suffixes of a text, or driving many patterns through a single pass.',
      '"Window" in the article means a fixed-width span slid along a sequence to keep a running sum or maximum, or a region of a user interface. The stretch here is whatever piece has been shown to repeat the beginning, and it is relocated rather than slid.',
      'The article needs what the finished table is then used for — locating occurrences, finding the shortest repeating unit, counting distinct substrings. The run ends when the last box is filled.',
    ],

    contrastWith: [
      {
        concept: 'zAlgorithm',
        note: 'Filling the table against reading it: this is about a measurement feeding on its own earlier answers, while that claims a search is nothing more than collecting the finished measurements that equal one particular length.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Both are read off a single string with nothing else involved, but one measures, for each opening piece, the longest length that is at once its head and its tail, and exists to settle how far to move after a failure; this measures how far each position agrees with the beginning, and its claim is about how that measurement feeds on its own earlier answers.',
      },
      {
        concept: 'memoWriteOnce',
        note: "Both hand back an answer already established instead of establishing it again, but there the grounds are that the identical subproblem has returned, and here the grounds are symmetry — a different position's answer settles this one because the region they lie in is known to repeat the beginning.",
      },
      {
        concept: 'overlappingSubproblems',
        note: 'Repetition licenses the saving in both, but there it is the same term recurring on separate branches of one expansion, while here it is one region of a string being a duplicate of another, so answers transfer sideways between positions that are not the same question.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Both start from the cost of going back to the front and comparing from there, but one lets that cost stand as the complaint, while this claims a position falling inside a verified region owes little or none of it.',
      },
    ],
  },
};
