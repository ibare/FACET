/**
 * hashToBucket 개념 선언.
 *
 * canonical facet 은 `facet:hashToBucket` — 키 하나가 두 번 접혀 정해진 개수의
 * 자리 중 하나로 눌려 들어가는 대목만 말하고 멈추는 짧은 화면이다. 글자 칸이
 * 하나의 정수로 모이고, 부호 비트가 떨어져 나가고, 남은 수가 여덟 칸 띠를 감아
 * 돌다 제 자리에 앉는다.
 *
 * 스스로 네 키를 재생하고 멈춘다. 그 뒤에는 다시 보기와 한 걸음씩 짚기를
 * 기다리며, 독자가 값을 넣는 자리는 없다.
 *
 * 변별어를 붙인 이유: `hash` 만으로는 암호학적 해시 쪽 개념들과 갈리지 않는다.
 * 이 개념이 말하는 것은 주소 계산 하나뿐이므로 도착지(bucket)를 id 에 넣어
 * 자리를 좁혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashToBucketConcept: FacetConceptSource = {
  id: 'hashToBucket',
  label: 'Computing a Bucket from a Key',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:hashToBucket',

  surface: {
    definition:
      'A hash function reduces a key of any length to a single integer, and a remainder operation maps that integer onto one of a fixed number of bucket indices.',
    exemplarKeywords: [
      'hash function',
      'bucket index',
      'modulo bucket count',
      'hashCode',
      'String.hashCode',
      'how a key becomes an array index',
      'computed address instead of search',
      'mask the sign bit',
      'index from key',
      'hash map internals',
    ],
  },

  briefing: {
    observable: [
      'Each key arrives as one box per character, and the rows are visibly different lengths — three characters for one key, six for another — so the premise is that the input has no fixed size.',
      'The character boxes slide together into the middle and collapse into a single chip carrying one integer, which is the real Java String.hashCode value for that key.',
      'A small tile marked 0 or 1 hangs beside the chip and falls away before the division; for the key whose hash came out negative the tile reads 1, and the caption shows the masking that removes it.',
      'The remaining number drops onto a band of eight numbered slots and wraps around it before stopping — the wrapping is the remainder, and the caption reads the division out as a line of arithmetic.',
      'The number then flattens into a small tag inside the slot it stopped at, and after four keys the closing line states that any key at all folds into one of the eight slots.',
    ],

    screen: {
      affordances: [
        'It runs four keys through four moments each on its own and then stops, so the reader gets the whole argument without pressing anything.',
        'Two buttons: Replay, and Step. Step rewinds to an empty band and walks the same sequence one moment at a time, which is how the arithmetic can be read at the reader\'s own pace.',
        'The keys are fixed (kiwi, fig, apple, banana) and every number on screen is computed rather than written in, so the values can be quoted in the text exactly as they appear.',
      ],
    },

    useWhen: [
      'The article claims a lookup goes straight to its place instead of scanning, and the reader has no picture of how an arbitrary string turns into a place. Characters collapsing into one integer and that integer wrapping onto a band of slots supplies the missing half.',
      'Code in the article masks a hash before dividing — & 0x7FFFFFFF, or an absolute value — and the reader takes it for a trick. Watching the sign bit fall off between the multiply-and-add and the remainder makes it an ordinary part of computing an index.',
    ],

    avoidWhen: [
      'The subject is a cryptographic hash — digests, collision resistance, password storage. The function here exists only to produce a small slot number, and nothing on screen speaks to any security property.',
      'The point is what happens when two keys produce the same slot. The four keys shown land in four different slots and the screen ends there.',
      'The article compares hash functions or argues about distribution quality. One function is run, and nothing here weighs it against another.',
      'The article is about hashing for deduplication, fingerprinting or content addressing, where the value itself is the identifier rather than a position in a table.',
    ],

    contrastWith: [
      {
        concept: 'indexAddressCalc',
        note: 'Both end at a position in an array, but one is handed an index and works out an address from it, while this one has to manufacture the index from a key that is not a number at all.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'This is the mapping that makes a lookup cheap; the other is the counting argument for why that mapping can never be one to one.',
      },
      {
        concept: 'hashTableChaining',
        note: 'A hash table is this address computation plus an answer for the case where two keys compute the same address.',
      },
    ],
  },
};
