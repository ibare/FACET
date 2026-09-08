/**
 * walkPerCharacter 개념 선언.
 *
 * canonical facet 은 `facet:walkPerCharacter` — 이미 다 그려진 나무 + 내려가는
 * 커서 링 + 캡션 한 줄 + 내려간 칸 수. 한 주장만 말하고 멈춘다: 찾기는 찾는 말의
 * 글자를 하나씩 써서 한 칸씩 내려가는 일이며, 그 걸음은 세 가지 다른 결말로
 * 갈린다.
 *
 * 스스로 세 번의 찾기를 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚기 두 버튼이
 * 있으나 화면이 할 말을 마치는 데 누름이 필요하지 않다. 누구의 하위도 아니므로
 * canonicalFacet 은 자기 자신이고 `specializes` 를 두지 않는다.
 *
 * 변별어를 붙인 이유: "탐색" 이나 "조회" 로 줄이면 값을 견주며 내려가는 다른
 * 나무들과 뭉개진다. 글자 하나가 곧 한 칸이라는 것이 이 개념의 전부다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const walkPerCharacterConcept: FacetConceptSource = {
  id: 'walkPerCharacter',
  label: 'One Character, One Level Down',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:walkPerCharacter',

  surface: {
    definition:
      'Looking a string up in a character tree spends one character per level downward, and the walk ends found, on an unmarked place, or at a branch that is not there.',
    exemplarKeywords: [
      'trie search',
      'prefix lookup',
      'character by character',
      'one step per letter',
      'lookup cost by key length',
      'membership test',
      'is this word in the dictionary',
      'path exists but not a word',
      'no branch for that letter',
    ],
  },

  briefing: {
    observable: [
      'The tree for five stored words is already standing before the first search — nine circles counting the root, each link labelled with the character that leads down it.',
      'Small dots sit under the circles that are the end of a stored word, five of them, so the reader can tell a place that ends a word from a place that is only passed through before any search runs.',
      'Each search snaps a ring back to the root and then moves it down one level per character, while a number under the caption counts the levels descended — three characters is three moves regardless of how many words the tree holds.',
      'Three searches run in order and land differently: "ten" finishes on a dotted circle and is a stored word, "te" finishes on a circle with no dot so the path exists but the word does not, "tin" cannot leave the "t" circle because no branch carries that character.',
      'The three endings are painted apart rather than described apart — the found place takes the accent colour, the unmarked place stays in the active tone, and the blocked place turns to the danger tone with a small badge naming the character that had no branch.',
    ],

    screen: {
      affordances: [
        'The three searches play through on their own and the screen stops on the last verdict, so it says what it has to say without a click.',
        'Two buttons: replay, and a step button for taking the walk one moment at a time. The first press of the step button rewinds to the first search and shows its opening move in the same press.',
        'The stored words and the three queries are fixed, chosen so that the three endings all occur and none of them has to be described in words the screen does not show.',
      ],
    },

    useWhen: [
      'The article claims the cost of a lookup follows the length of the key and not the number of stored words, and the reader needs to watch the level counter rise once per character to take that as fact rather than as a bound quoted at them.',
      'The prose treats "not found" as a single outcome, while a walk that ends on an unmarked place and a walk that cannot take its next character are different failures the reader has to see pulled apart.',
    ],

    avoidWhen: [
      'The article is about substring or pattern matching inside one text — KMP, Boyer-Moore, sliding comparisons. Those also advance one character at a time, over an entirely different structure.',
      'The subject is how the structure gets built or updated. The tree here is drawn complete before the first search and never changes shape.',
      'The article is about reaching a key by computing an address from it, where cost stops depending on the key beyond hashing it once.',
      'The point is what to offer when a word is absent — suggestions, nearest matches, corrections. The walk stops and reports how it stopped, and offers nothing further.',
    ],

    contrastWith: [
      {
        concept: 'trie',
        note: 'This is the retrieval half of that structure, narrowed to one query and the way it ends, rather than the full set of operations the tree supports.',
      },
      {
        concept: 'sharePrefixPath',
        note: 'The shape being walked is exactly the shape that sharing produced; this concept takes that shape as given and asks what it costs to move through it.',
      },
      {
        concept: 'bstCompareAndGo',
        note: 'Both descend one level at a time, but one compares whole keys to choose a side while this one spends a single character to choose a branch.',
      },
    ],
  },
};
