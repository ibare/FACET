/**
 * bloomFilter 개념 선언.
 *
 * canonical facet 은 `facet:bloomFilter` — 완결형이다. 손잡이 둘(자리 수 m 은
 * 16·32·64, 해시 수 k 는 1~6)을 독자가 밀면 그때마다 여섯 키를 처음부터 다시
 * 넣고, 넣지 않은 키 3000 개를 물어 거짓 양성률을 실측해 보인다. 재생 묶음
 * 다섯과 누적 계기 넷, 그리고 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **고르는 일** 을 맡는다 — 자리를 얼마나 주고 해시를 몇 개 쓸지는
 * 따로 정할 수 없고, 하나가 다른 하나의 최적점을 옮긴다는 것. 조각 셋은 그
 * 설정을 고정한 채 각각 넣기(`severalHashesOneValue`) · 묻기의 신뢰
 * (`wrongInOneDirection`) · 지우기(`cannotUnset`) 한 대목씩만 말한다. keywords 도
 * 이쪽만 sizing · 최적 k · 메모리 예산 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bloomFilterConcept: FacetConceptSource = {
  id: 'bloomFilter',
  label: 'Bloom Filter (Sizing Bits Against the Error Rate)',
  canonicalFacet: 'facet:bloomFilter',

  surface: {
    definition:
      'A Bloom filter tests set membership with a bit array and several hash functions; its rate of wrong positive answers depends on the array size and the hash count together, not on either alone.',
    exemplarKeywords: [
      'Bloom filter',
      'false positive rate',
      'optimal number of hash functions',
      'bits per element',
      'sizing a Bloom filter',
      'm and k',
      'approximate set membership',
      'probabilistic data structure',
      'space-efficient set',
      'memory budget versus accuracy',
      'skip an expensive lookup',
      'tuning a filter',
    ],
  },

  briefing: {
    observable: [
      'Six keys sit in a row across the top; the one being hashed is lit, the ones already inserted carry a third tone, and the positions each key computed appear as numbers beneath its chip.',
      'The bit array is a single row of cells that keeps the same height whether it holds sixteen, thirty-two or sixty-four positions — at the widest setting the cells are too narrow to print 0 and 1, so only their fill says which are on, and the index numbers thin out to every eighth.',
      'When a key lands on a position that is already on, the cell takes a distinct colour and the caption says it stays 1, so the array is seen to keep no record that two keys wanted it.',
      'After the six insertions the screen asks three thousand keys that were never inserted and reports how many came back as "present" — a percentage beside a bar showing what fraction of the array is on.',
      'Four counters run along the bottom: hashes computed, positions on, overlaps, and wrong positives. Overlaps is the gap between keys times hashes and the positions actually lit.',
      'At sixteen positions with six hashes every cell ends up on, the percentage is painted in the alarm colour, and the caption says that whatever is asked, the answer is "present".',
      'Moving either handle abandons the picture and rebuilds the array from empty at the new setting; the counters are re-counted for that pass rather than accumulating across passes.',
      'With a language added, the two functions stand side by side and open with the same two lines and the same loop, parting only at whether the position is written or tested.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One full pass plays on mount, and the screen then waits at the handles instead of looping.',
        'Two segmented sliders sit beside the playback controls — one for the number of positions over 16, 32 and 64, one for the number of hashes over 1 through 6 — opening at 32 and 3.',
        'The way to find the turning point is to leave the first slider alone and walk the second upward one segment at a time, reading the percentage after each pass: it falls, then climbs again, and where it turns moves when the first slider is changed.',
        'The six keys and their two base hash values are fixed, and every position, bit and percentage on screen is computed during the pass rather than written in, so figures can be quoted as they appear.',
        'The code panel starts empty with a prompt to add one. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article quotes a formula for the best number of hash functions and the reader takes it as a fact about the structure rather than about one array size. Holding the room fixed, walking the hash count up, and watching the measured percentage fall and then rise is what turns the formula into a curve with a turning point.',
      'Someone is about to pick a size from a memory budget alone. The setting where every position ends up lit, and every question is answered "present", shows that too little room does not degrade the answer gradually — it ends the structure\'s usefulness outright.',
    ],

    avoidWhen: [
      'The article needs occurrences counted or frequencies estimated. Every cell here holds one bit and cannot say how many times anything arrived.',
      'The subject is taking a value back out, or updating one already inserted. Nothing on this screen removes anything.',
      'The point is which hash function to choose or how evenly it spreads. Two base hashes are fixed and combined arithmetically, and nothing weighs them against alternatives.',
      'The article needs a structure that returns the stored value rather than a verdict about it. Nothing of a key survives past the positions it turned on.',
      'The reader wants the error formula derived. Percentages here are measured by asking three thousand unseen keys, not computed from an expression.',
    ],

    contrastWith: [
      {
        concept: 'severalHashesOneValue',
        note: 'Both rest on one value claiming several positions, but that one asserts only that insertion works this way, while this treats how many positions and how much room as quantities to be weighed against each other.',
      },
      {
        concept: 'wrongInOneDirection',
        note: 'That one settles which of the two answers is capable of being wrong; this takes the asymmetry as given and asks how often the fallible one is wrong at a given setting.',
      },
      {
        concept: 'cannotUnset',
        note: 'One is about an operation the structure refuses outright, the other about how well it performs the operations it accepts.',
      },
      {
        concept: 'countMinSketch',
        note: 'Both spend a few hashes and a small table to answer about far more data than they store, but one is asked whether something was seen and the other how often, which is why one keeps bits and the other counters.',
      },
      {
        concept: 'hashTableChaining',
        note: 'Both reach a position by hashing, but a table keeps the keys and so answers exactly, while this keeps only marks and trades exactness for room.',
      },
    ],
  },
};
