/**
 * trie 개념 선언.
 *
 * canonical facet 은 `facet:trie` — 나무 그림 + 자동완성 결과 표시 + "낱말 / 자리"
 * 표시 + 낱말 입력칸과 네 연산 버튼.
 *
 * 마운트 직후 씨앗 낱말 다섯(car · cart · cat · do · dog)을 한 글자씩 넣어 보인 뒤
 * 멈추고 학습자의 입력을 기다린다. 그 뒤로는 독자가 낱말을 넣고 찾고 자동완성하고
 * 지우는 것을 몰아 볼 수 있다.
 *
 * 변별어를 붙이지 않은 이유: 접두사 나무를 달리 부르는 이름(prefix tree)이 있을 뿐
 * 같은 이름을 다투는 다른 자료구조가 없다. 대신 간선이 글자 하나씩을 지는 것을
 * definition 에 못박아, 간선이 문자열 토막을 지는 압축형이 이 id 로 걸리지 않게 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const trieConcept: FacetConceptSource = {
  id: 'trie',
  label: 'Trie (Prefix Tree)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:trie',

  surface: {
    definition:
      'A tree that stores strings character by character, where each link carries one character and the characters from the root to a place spell the prefix kept there.',
    exemplarKeywords: [
      'trie',
      'prefix tree',
      'autocomplete',
      'typeahead suggestions',
      'prefix search',
      'word dictionary',
      'spell checker',
      'string keys',
      'insert search delete words',
    ],
  },

  briefing: {
    observable: [
      'Five words go in on mount, one character at a time, before the reader touches anything — a character already on the path makes an existing circle flash and adds nothing, a new character sprouts a circle where the words split.',
      'Every link is labelled with the character it follows, so reading the labels down from the root gives the prefix standing at any circle.',
      'Circles where a word ends are filled and drawn with a heavier outline than circles that are only passed through — being on the path and being a word are two different states on screen.',
      'A "Held" readout reports words and seats side by side after every operation, and the seat count climbs far more slowly than the characters put in.',
      'Pressing Complete walks down to the typed prefix and then fills a separate readout with every word underneath it at once, in alphabetical order, while the caption states how many there were.',
      'A search ends in one of three captions: the word ends here, the path exists but no word ends here, or there is no branch for that character so it stops mid-word.',
      'Removing a word reports how many seats were actually freed, and that number is often smaller than the length of the word — sometimes zero — because the remaining words still hold the path.',
      'Two counters run underneath: words currently stored, and steps, which rises once per character examined by whichever operation was pressed.',
    ],

    screen: {
      affordances: [
        'The reader drives this. It puts five words in on mount — car, cart, cat, do, dog — then stops and waits for input.',
        'The controls are one word field plus Insert, Search, Complete, Remove and Reset. What is typed is folded to lowercase letters and cut at six characters, so the tree stays inside its frame.',
        'Typing a prefix and pressing Complete is the move worth showing: the descent is short and the answer is a list, not a single hit.',
        'Inserting words that begin alike and then removing one of them is what makes the freed-seat number interesting — the path survives its own word.',
      ],
    },

    useWhen: [
      'The reader has to find out what a prefix actually buys: type a few characters, press Complete, and several stored words come back from one short descent with the count stated.',
      'The article turns to what deleting leaves behind — put words in, take one out, and the freed-seat number reports how much of the path the surviving words still hold.',
    ],

    avoidWhen: [
      'The article is about a compressed prefix structure — radix tree, Patricia trie — where one link stands for a whole run of characters. Every link here carries exactly one character.',
      'The subject is autocomplete quality: ranking, scoring, typo tolerance, fuzzy matching. Prefix matches here come back in plain alphabetical order.',
      'The article is about matching network address prefixes and picking the longest match. The keys here are lowercase words and nothing on screen speaks to addresses, masks or ranges.',
      'The point is memory measured in bytes — per-node child arrays, pointer overhead, cache behaviour. What is counted here is seats, not storage.',
    ],

    contrastWith: [
      {
        concept: 'sharePrefixPath',
        note: 'Same structure, different half: that one stays on the moment the characters are being placed and what the shared beginning saves, this one is about what the built structure is then used for.',
      },
      {
        concept: 'walkPerCharacter',
        note: 'The descent is the same motion, but that concept is about what one descent costs and how it can end, while this one spends the descent on prefixes the reader chooses.',
      },
      {
        concept: 'hashTableChaining',
        note: 'Both hold keys and answer whether one is present, but a hash table computes an address from the whole key and so can say nothing about which keys begin alike.',
      },
    ],
  },
};
