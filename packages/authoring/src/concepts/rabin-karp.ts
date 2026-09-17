/**
 * rabinKarp 개념 선언.
 *
 * canonical facet 은 `facet:rabinKarp` — 완제품이다. 되풀이 글 60자 위를 창이
 * 지나가고, 원장 막대 둘이 글줄과 **같은 가로 범위**에 놓여 "굴리며 만진 글자" 와
 * "처음부터 견주면" 을 잰다. 그 아래 손잡이 다섯 값을 한꺼번에 세운 대조 막대가
 * 있다 — 굴리는 쪽 다섯이 120 으로 한 치도 다르지 않고 단순 쪽 다섯이 89 에서 279 로
 * 오른다. 손잡이는 패턴 길이(2 · 4 · 6 · 8 · 10)다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `rollingHash` 는 **갱신**이 주어다 — 앞 창의 답에서 다음 창의 답을 얻는 일.
 * 이쪽 definition 의 주어는 **창을 수로 달아 보고 일치를 글자로 확인하는 검색**이고,
 * 주장은 그 항등식이다 — 만지는 글자가 글 길이의 두 배에 못박힌다는 것. 조각은
 * 해시가 같아지는 자리에서 멈추므로 확인도 2n 도 조각에 없다.
 *
 * ── `ahoCorasick` 과의 경계가 이 개념에서 가장 좁다
 *
 * 둘 다 "손잡이를 밀어도 안 움직이는 수" 가 주장이다. 그래서 **무엇이 고정이고
 * 무엇이 대신 늘어나는가**로 갈랐다. 이쪽은 **패턴이 길어져도** 만지는 글자가
 * 2n 이고 저장하는 것이 없다. 저쪽은 **패턴이 많아져도** 읽은 글자가 n 이고 그
 * 대신 마디가 는다. 장치 낱말도 겹치지 않는다 — 창 · 굴린 수 · 확인 대 나무 ·
 * 되돌아가는 링크 · 패턴 목록.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rabinKarpConcept: FacetConceptSource = {
  id: 'rabinKarp',
  label: 'Rabin-Karp (Matching by Number, Settling by Letter)',
  canonicalFacet: 'facet:rabinKarp',

  surface: {
    definition:
      "Weighing each window of the text against the pattern as a single rolled number and settling an agreement character by character, so the letters touched stay at twice the text length whatever the pattern's length.",
    exemplarKeywords: [
      'Rabin-Karp',
      'hash based substring search',
      'spurious hit',
      'the numbers agree but the letters do not',
      'check a candidate before reporting a match',
      'plagiarism and duplicate detection',
      'search cost that does not grow with the pattern',
      'probabilistic string matching',
      'when repetition drags the simple method to the end',
      'matching on a fingerprint, then on the characters',
    ],
  },

  briefing: {
    observable: [
      'A reference band sits above the text: the pattern as letter cells and, beside them, a pill carrying the one number every window is weighed against.',
      'The first window is the expensive one and is drawn that way — its letters light one after another before any value exists. Every window after it colours exactly two cells, the one leaving and the one entering, and leaves everything between them plain.',
      'Two ledger bars share the text strip\'s exact horizontal span and one fixed scale, so their lengths can be read against the text itself rather than against each other alone; the plain-comparison bar outruns the rolling one from early on.',
      'When a window\'s number equals the reference, the whole window colours at once in a single step — that step is the settling, and the rolling bar jumps there by the pattern\'s length rather than by two.',
      'A found position keeps a mark under it for the rest of the run, and the sweep does not stop there but carries on to the end of the text.',
      'Beneath the ledgers a paired-bar chart stands for all five handle positions at once, with the current one shaded, so the trade is legible without the handle being touched: the rolling bars are exactly level at 120 across all five while the plain ones climb from 89 to 279.',
      'The number of rolls falls from 58 to 50 as the pattern lengthens, and the letters touched stay at 120 regardless, so the readouts show one quantity moving while the one the screen is about does not.',
      'The closing line names both totals, and a second line beneath it points at the handle and names the number that will not move.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position slider for the pattern length, at six to begin with.',
        'The pattern is cut leftward from a fixed position near the end of the text, so it occurs exactly once whatever length the handle asks for.',
        'Three readouts beside the handle — letters touched, plain compares, rolls — and every number on screen is computed during the run rather than written into the declaration.',
        'The base and the modulus are fixed and deliberately not offered as handles, so the only thing a reader can move is the length.',
        'The code panel puts the rolling and the character check in one procedure, which is where the two costs the ledgers separate come from.',
      ],
    },

    useWhen: [
      'The article calls the method linear on average and a reader hears a hedge. The chart standing across all five lengths at once, rolling bars exactly level and plain ones climbing to three times their start, puts the claim and its rival in one picture before anything is touched.',
      'A reader has been shown how one window value becomes the next and now needs to know what happens when two values agree. The window colouring whole in one step, and the touched count leaping by the pattern length right there, is the checking being paid for rather than assumed.',
      'The prose needs it accepted that the advantage belongs to the text as much as to the method. This text repeats so heavily that starting over at each position gets dragged deep into the window again and again, which is precisely the case a rolled number is for.',
    ],

    avoidWhen: [
      'The subject is how one window value is turned into the next — which contribution is taken out, which is put in, why that is constant work. Those two cells are coloured here but the arithmetic behind them is not worked out.',
      'The article is about choosing the base or the modulus, or about how likely two unlike windows are to agree. One fixed pair is used from beginning to end and nothing is weighed against another.',
      'The subject is the worst case. A text and pattern contrived so the numbers agree everywhere would put the full checking cost back on every window, and nothing on screen stands for that.',
      'The article needs a guarantee rather than a likelihood. What is shown rests on disagreements being settled by one number and agreements being rare, not on a bound that holds for every input.',
      'The article is about finding several patterns in one sweep. One pattern is weighed against here, and the count of patterns is not what the handle moves.',
    ],

    contrastWith: [
      {
        concept: 'rollingHash',
        note: 'The update and the search it serves: that one ends the moment two values agree, while this treats the agreement as a candidate, pays to read the characters behind it, and carries on to a position it can name.',
      },
      {
        concept: 'ahoCorasick',
        note: 'Both hold one number still while a handle is pushed, and the two handles are different: here the single pattern is made longer, the letters touched stay at twice the text, and nothing is stored; there the patterns are made more numerous, the characters read stay at the text length, and the room the structure needs grows instead.',
      },
      {
        concept: 'kmp',
        note: 'Both attack the same search, but one removes repeated comparison outright and owes nothing to the shape of the text, while this leans on disagreements being settled by a single number and needs a text that would otherwise drag.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'That argues two unlike inputs must eventually share one value; this is what a search has to do about it — treat every agreement as a candidate and read the characters before calling it a match.',
      },
    ],
  },
};
