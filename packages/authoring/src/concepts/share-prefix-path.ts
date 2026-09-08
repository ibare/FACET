/**
 * sharePrefixPath 개념 선언.
 *
 * canonical facet 은 `facet:sharePrefixPath` — 낱말 칩 넉 장 + 자라나는 나무 +
 * 캡션 한 줄. 한 주장만 말하고 멈춘다: 앞이 같은 낱말은 이미 난 자리를 그대로
 * 타고, 글자가 갈라지는 첫 자리에서만 새 자리가 돋는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚기 두 버튼이 있으나 화면이 할
 * 말을 마치는 데 누름이 필요하지 않다. 누구의 하위도 아니므로 canonicalFacet 은
 * 자기 자신이고 `specializes` 를 두지 않는다.
 *
 * 변별어를 붙인 이유: "prefix" 는 접두사 합(prefix sum) 이나 정렬된 키의 접두사
 * 압축에서도 쓰이는 말이라, id 가 넣기의 동작(길을 나눠 쓴다)을 특정해야 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sharePrefixPathConcept: FacetConceptSource = {
  id: 'sharePrefixPath',
  label: 'Words Sharing One Path',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:sharePrefixPath',

  surface: {
    definition:
      'Inserting strings into a character tree reuses the places of a beginning that already exists and creates new places only from the first character that differs.',
    exemplarKeywords: [
      'shared prefix',
      'common prefix',
      'words that start alike',
      'inserting into a trie',
      'reusing nodes',
      'branching point',
      'space saved by sharing',
      'prefix tree construction',
      'one path many words',
    ],
  },

  briefing: {
    observable: [
      'Four word chips stand across the top — car, cart, cat, dog. The one being inserted is lit, and each turns to a finished state as it completes, so the reader always knows which word is talking.',
      'A cursor returns to the root for every word and then travels downward: when the character is already there the existing circle flashes and nothing is added, when it is new a circle grows out of its parent and slides into place carrying that character.',
      'A word that finishes gets a dot on its last circle and its own text printed underneath, so the place where a word ends is marked apart from the places that are merely on the way.',
      'Each word closes with a count of how many places it rode versus how many it grew: car grows three and rides none, cart rides three and grows one, cat rides two and grows one, dog shares nothing and grows three.',
      'The closing caption puts the whole thing in one line — four words held in nine places including the root, against thirteen characters if each word were laid out on its own, four saved.',
    ],

    screen: {
      affordances: [
        'The four insertions play through on their own and the screen stops on the closing count, so it finishes its argument without being clicked.',
        'Two buttons: replay, and a step button for taking the insertion one moment at a time. The first press of the step button rewinds to the bare root and shows the first move in the same press.',
        'Every number on screen comes from actually inserting the four words in that order, so the saving is a result rather than a stated figure.',
      ],
    },

    useWhen: [
      'The prose says common beginnings are stored once and the reader hears a figure of speech. Carrying the insertion out and landing on nine places for thirteen characters settles it as arithmetic.',
      'The article is about to talk about branching, and the reader first has to accept that one circle can belong to several words at the same time rather than to the word that created it.',
    ],

    avoidWhen: [
      'The article is about prefix sums, prefix products or any running total that carries the word "prefix" — the vocabulary matches and the subject does not.',
      'The subject is looking a word up or testing membership once the structure exists. Everything shown here happens while words are being put in.',
      'The article is about deleting a word and reclaiming the places it used.',
      'The topic is prefix compression in sorted keys or index pages, where a stored key drops the characters it shares with its neighbour. Here every character keeps a place of its own.',
    ],

    contrastWith: [
      {
        concept: 'trie',
        note: 'This is the storing half of that structure, held at the moment the characters are being placed rather than at the point where the finished tree gets used.',
      },
      {
        concept: 'walkPerCharacter',
        note: 'One is about places being created and shared, the other about a search moving through places that already exist.',
      },
      {
        concept: 'hashTableChaining',
        note: 'A hash table scatters keys on purpose so that similar keys land far apart; here similar keys are deliberately kept together on one path.',
      },
    ],
  },
};
