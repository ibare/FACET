/**
 * allSuffixesSorted 개념 선언.
 *
 * canonical facet 은 `facet:allSuffixesSorted` — 조각(piece)이다. 화면이 두 자리로
 * 갈린다. 왼쪽은 `banana` 와 거기서 떨어져 나온 꼬리 여섯이 계단으로 서고, 오른쪽은
 * 사전 순으로 하나씩 건너온 꼬리들이 서는 줄이다. 끝에 앞머리가 같은 셋(a · ana ·
 * anana) 위로 띠가 오르고 공통 글자가 짚인다. 계기도 코드 패널도 없고 컨트롤은
 * 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 이웃과 어떻게 갈랐나
 *
 * 저장소에 "정렬을 전제로 찾는다" 는 개념이 이미 여럿 있어 definition 이 붙기 쉽다.
 * 그래서 이쪽 definition 의 주어를 **찾는 방법이 아니라 미리 만들어 두는 물건** 으로
 * 고정했다 — 한 문자열의 꼬리 전부를 사전 순으로 늘어놓은 배열, 그리고 그 배열에서
 * 한 패턴의 등장 자리들이 한 덩어리로 붙는다는 성질.
 *
 * `trie` · `sharePrefixPath` 가 가장 가깝다. 둘 다 앞머리가 같은 것을 한데 모으지만
 * 자료의 모양이 다르다 — 저쪽은 **나무의 길**로 여러 낱말이 앞머리를 나눠 쓰고,
 * 이쪽은 **평평한 목록의 순서**로 한 문자열의 제 꼬리들이 이웃한다. `requiresSorted`
 * 는 남이 이미 갖춰 놓은 순서를 어겼을 때의 실패를 말하고, 이쪽은 그 순서를 만들어
 * 내는 일 자체를 말한다. `prefixSuffixJump` 와는 전처리의 대상이 갈린다 — 저쪽은
 * 패턴을, 이쪽은 텍스트를 미리 손본다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const allSuffixesSortedConcept: FacetConceptSource = {
  id: 'allSuffixesSorted',
  label: 'All Suffixes, Sorted (Occurrences Gather in One Block)',
  canonicalFacet: 'facet:allSuffixesSorted',

  surface: {
    definition:
      'Every suffix of a single string held in dictionary order, an index prepared before any pattern is known, in which all occurrences of a pattern stand together in one contiguous block.',
    exemplarKeywords: [
      'suffix array',
      'sorted suffixes',
      'every tail of a string',
      'lexicographic order of suffixes',
      'an index built over the text itself',
      'preprocess the text once and search it many times',
      'occurrences end up next to each other',
      'substring search index',
      'full-text index',
      'the suffixes of banana',
      'store the starting positions instead of the strings',
      'shorter comes first when the beginnings agree',
    ],
  },

  briefing: {
    observable: [
      'Two lanes stand side by side under their own headings, one for the suffixes as the string produced them and one for the order being built, and the seats of the second lane are drawn as dashed empty lines before anything arrives in them.',
      'The string sits across the top with a position number over each character, and the six tails drop out of it one after another — each beginning under the character it was cut at, so they land as a staircase of shortening rows rather than as a list.',
      'A separate move slides every tail left onto one common edge, and the caption states that this is what makes them comparable; no ordering happens until after it.',
      'Each tail carries a small chip holding the position it was cut from, and the chip travels with it, so the finished lane reads 5, 3, 1, 0, 4, 2 down its edge — the starting positions in an order that keeps nothing of the original run.',
      'The tails cross one at a time in dictionary order, rising slightly as they travel and changing tone as they settle, with the caption naming the tail that is taking its place.',
      'Short-before-long is visible in the landing order rather than asserted: a, then ana, then anana take consecutive seats, the shorter one always ahead where the beginnings agree.',
      'A band then rises over the top three seats and the one character those three share is picked out inside each of them, so the block is marked by what its members have in common rather than by where in the string they came from.',
      'The closing caption gives the payoff as the reason the band is drawn — the tails that begin alike now form a single stretch, and that stretch is the only part worth looking at.',
    ],

    screen: {
      affordances: [
        'The screen cuts, aligns and orders all six tails on its own and stops with the band standing over the finished block.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip back into the sorting holds a single tail as it crosses to its seat, and dragging to the very start returns the bare string.',
        'The string is fixed at banana, so an article can name the six tails, the order they land in, and the positions the chips read once they have all arrived.',
      ],
    },

    useWhen: [
      'The article hands the reader a suffix array as a row of numbers — 5, 3, 1, 0, 4, 2 — and expects it to be taken on faith. Those numbers arrive here as chips carried by the tails themselves, so the row is a result of watching rather than a fact to accept.',
      'The prose claims that ordering the tails makes every occurrence of a pattern adjacent, and a reader has no reason to believe it. The band closing over three tails that begin with the same character is that claim in the form of a picture.',
      'The reader is about to be shown a search that runs on a prepared text and first has to accept what the preparation is made of: one string, cut at every position, and nothing else brought in from outside.',
    ],

    avoidWhen: [
      'The subject is how a suffix array is actually constructed — prefix doubling, DC3, SA-IS, or what sorting n suffixes costs. The ordering here is carried out by taking whichever tail comes next, which shows the result and not the method.',
      'The subject is the lookup that runs on the finished arrangement: narrowing down to a pattern’s block, counting the occurrences it holds, reporting where they are. Nothing is looked for on this screen.',
      'The article needs the lengths shared between neighbouring entries, or a compressed index built from them such as the Burrows–Wheeler transform. What is drawn here is the ordering alone.',
      'The shared beginning in question is between different stored strings rather than between the tails of one string. Everything arranged here comes out of a single text.',
      'The article uses "suffix" for a file extension, a domain suffix, or a word ending in grammar.',
      'The point is how little space the index occupies because it keeps only n starting positions. Every tail here is drawn out as its own row of characters so the ordering can be read.',
    ],

    contrastWith: [
      {
        concept: 'suffixArray',
        note: 'The ordering and what is asked of it: this ends when the tails are in order, while that begins there and claims the ordering answers for a pattern it was never told about.',
      },
      {
        concept: 'trie',
        note: 'Both make strings that begin alike findable together, but one shares those beginnings as a single path through a tree, while this leaves every string whole and gets the same grouping out of ordering alone.',
      },
      {
        concept: 'sharePrefixPath',
        note: 'There a beginning is shared between different words so that one place can serve several of them; here nothing is shared at all — the strings are the tails of one text and the grouping is only that they are neighbours.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Both finish their preparation before any searching begins, but one prepares the pattern and holds for that pattern alone, while this prepares the text and stands for whatever pattern is asked of it afterwards.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'One keeps nothing between attempts and pays again at every starting position; this pays once, before any pattern is known, and buys occurrences that are already standing together.',
      },
      {
        concept: 'requiresSorted',
        note: 'There the ordering is a condition someone else has to uphold on data that was already lying there; here the ordering is the product itself, made on purpose so that something can be searched later.',
      },
    ],
  },
};
