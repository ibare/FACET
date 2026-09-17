/**
 * manyPatternsOnePass 개념 선언.
 *
 * canonical facet 은 `facet:manyPatternsOnePass` — 조각(piece)이다. 패턴 넉 줄이
 * 글자 칸으로 왼쪽에서 들어와 한 나무로 포개지고, 그 아래 여섯 글자 텍스트를
 * 왼쪽에서 오른쪽으로 딱 한 번 지나간다. 읽는 자리와 나무의 자리를 잇는 점선
 * 한 가닥, 되돌아가지 않고 자라기만 하는 띠, 걸린 패턴이 텍스트 위로 날아가
 * 앉는 딱지가 전부다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `failLink` 와는 **성과와 장치** 관계라 definition 이 붙기 쉽다. 그래서
 * 이쪽 definition 의 주어를 **얻는 것** 으로 고정했다 — 패턴마다 한 번씩이던
 * 훑기가 한 번으로 바뀐다는 거래. 저쪽은 **이어 둔 연결** 자체를 주어로 삼는다.
 * keywords 도 이쪽은 여러 낱말을 한꺼번에 거르는 응용 어휘를, 저쪽은 실패 링크 ·
 * 접미사 링크 어휘를 갖는다.
 *
 * 이웃 `trie` · `sharePrefixPath` 와는 **자료의 모양 ↔ 훑는 동안의 움직임** 으로
 * 갈랐다. 그쪽 둘은 나무가 어떻게 생겼고 어떻게 지어지는가를 말하고, 이쪽은 그
 * 나무 위로 텍스트가 흐르는 동안 무엇이 일어나는가를 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const manyPatternsOnePassConcept: FacetConceptSource = {
  id: 'manyPatternsOnePass',
  label: 'Many Patterns in One Pass (One Tree Instead of One Sweep Each)',
  canonicalFacet: 'facet:manyPatternsOnePass',

  surface: {
    definition:
      'Searching for several patterns at the same time by folding them into one character tree, so a single left-to-right pass over the text replaces one pass per pattern.',
    exemplarKeywords: [
      'Aho-Corasick',
      'multi-pattern string matching',
      'searching for many keywords at once',
      'dictionary matching',
      'one pass over the text',
      'scanning a log for many signatures',
      'keyword and profanity filtering',
      'blocklist matching',
      'the number of patterns stops mattering',
      'two patterns ending at the same place',
      'four searches collapse into one',
    ],
  },

  briefing: {
    observable: [
      'Four rows of letter tiles slide in from the left edge, one row per pattern, and the caption puts a number on the alternative first: searched one at a time, the text would be crossed four times.',
      'The rows then fold downward into a single tree — tiles carrying the same character in the same column settle onto one place, a root mark slides in from the left, and branches grow outward from parent to child. Twelve tiles went in; the caption gives the total as ten places counting the root.',
      'Below the tree the six characters of the text are a row of cells crossed strictly left to right: the current cell is lit, the cells behind it hold a spent tone, and a ribbon beneath the row only ever lengthens to the right.',
      'A dashed line joins the lit text cell to the place the cursor stands on, so at every moment both halves of the state are readable at once — which character is being read, and where in the tree that has left us.',
      'The first character finds no branch at the root: the cursor nudges sideways and springs back instead of moving, and the caption says it stays.',
      'At the fourth character two patterns finish at one and the same place, and two tags fly out of it together and land over different spans of the text row — one covering three cells, one covering two, stacked in separate lanes because they overlap.',
      'At the fifth character the path runs out and the cursor slips backwards through the tree and then descends again in one unbroken motion, while the ribbon underneath keeps growing — the position in the tree goes back, the position in the text does not.',
      'The closing caption counts what the one pass produced — three — and an accent mark then sweeps the ribbon once from end to end.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole thing on its own — the four rows laid out, the fold into one tree, then the single crossing of the text — and stops on the closing count.',
        'Under it sit a Replay button and a playback strip. Once the closing count is up, dragging the handle back is the way to stop on the moment two tags leave one place together.',
        'The four patterns and the six-character text are fixed, so an article can name them and quote the counts the run produces rather than describing them in general terms.',
      ],
    },

    useWhen: [
      'The article asserts that many keywords can be checked together without saying what that buys. Here the four separate crossings are named first, then the merged tree runs once and returns three hits, so the trade is counted rather than promised.',
      'The reader has to separate two positions that a single sentence usually conflates — where the scan stands in the structure, and how far it has got through the text. Both are drawn at the same time, and only one of them ever moves backwards.',
      'The prose needs it accepted that one place can finish more than one pattern, so that catching two at a single character reads as a property of the shared tree rather than a quirk of the example.',
    ],

    avoidWhen: [
      'The article is about finding one pattern inside one text. The entire claim here is that the count of patterns stops entering the number of crossings, which says nothing when the count is one.',
      'The subject is how the fallback target is chosen when the path runs out. The cursor is seen slipping back and descending again, but the rule that decides where it lands is not worked out on this screen.',
      'The subject is what building the structure costs — the time or the memory of assembling the tree before the search. The fold happens in one animated move here and nothing is charged for it.',
      'The article is about wildcards, regular expressions, character classes or approximate matches. Every pattern here is a plain run of characters that has to appear exactly.',
      '"Pattern" in the article means a design pattern, or a regular expression, rather than a literal string to be found inside text.',
    ],

    contrastWith: [
      {
        concept: 'ahoCorasick',
        note: 'The claim and its price: this counts the separate sweeps that collapse into one, while that sets a second number beside the saving — the room the merged structure takes, which is what the first number was bought with.',
      },
      {
        concept: 'failLink',
        note: 'Two halves of one machine: this names the result — the text is crossed once and nothing is missed — while that names the connection without which the crossing could not stay single.',
      },
      {
        concept: 'trie',
        note: 'The same shape of tree underlies both, but one concept is about what the structure holds and what may be asked of it, while this is about what happens to a stream of text driven through it.',
      },
      {
        concept: 'sharePrefixPath',
        note: 'A shared beginning is the saving in both, but there it is counted in places the structure needs to exist, and here in how many times the text has to be read.',
      },
      {
        concept: 'walkPerCharacter',
        note: 'Both spend one character per step against a character tree, but one is a single query descending until it stops, while this never stops — the descent continues across the whole text without returning to the start.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Both concern what a sweep over a text costs, but one pays again at every starting position for a single pattern, while here every pattern is charged to the same one crossing.',
      },
    ],
  },
};
