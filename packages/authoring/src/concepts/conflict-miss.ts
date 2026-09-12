/**
 * conflictMiss 개념 선언.
 *
 * canonical facet 은 `facet:conflictMiss` — 네 줄짜리 캐시에서 주소 0 과 64 를
 * 번갈아 여섯 번 찾는 조각. 여섯 번 다 미스이고 히트는 0 인데, 그동안 줄
 * 1·2·3 은 내내 비어 있다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 directMappedCache 와)
 *
 * 이 둘이 가장 붙는다 — 저쪽의 절벽은 결국 여기서 벌어지는 일이 쌓인 결과다.
 * 그래서 **어휘를 배타로 갈랐다.**
 *
 *   이 개념             `empty lines` · `only one line it may occupy` ·
 *                       `pushed out` · `space to spare` 를 갖는다.
 *   directMappedCache   `fits` · `outgrows` · `miss rate` · `cliff` ·
 *                       `flat then collapses` 를 갖는다.
 *
 * definition 에서 서로의 낱말을 한 번도 쓰지 않는다. 이쪽은 수를 세지 않고
 * (미스율도 배열 크기도 말하지 않는다) 한 장면만 말하며, 저쪽은 그 장면을
 * 전제한 채 값이 어떻게 변하는지만 말한다.
 *
 * indexAndTag 와는 층위로 갈렸다 — 저쪽은 주소가 어떻게 읽히는가이고 이쪽은
 * 그렇게 읽힌 결과가 프로그램에 무엇을 하는가다. 그래서 여기 definition 은
 * 토막 · 비트 · 오프셋 어휘를 쓰지 않는다.
 *
 * ── 이 개념만의 오검출
 *
 * `collision` 이 아니라 `conflict` 인데도 **해시 충돌 글이 반드시 걸린다** —
 * "둘이 한 자리를 두고 부딪힌다" 가 같은 말로 읽히기 때문이다. 저장소에
 * `pigeonholeCollision` · `hashTableChaining` 이 따로 있으므로 avoidWhen 첫
 * 자리에서 밀어내고 대비도 걸어 둔다. `conflict` 자체도 머지 충돌 · 잠금 충돌 ·
 * 일정 충돌로 훨씬 흔하게 쓰인다 — 그쪽도 함께 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const conflictMissConcept: FacetConceptSource = {
  id: 'conflictMiss',
  label: 'Conflict Miss (Thrown Out With Lines to Spare)',
  domain: 'computer-architecture',
  canonicalFacet: 'facet:conflictMiss',

  surface: {
    definition:
      'A cache throws a block out while most of its lines stand empty, because each address has exactly one line it may occupy and two addresses in use happen to want that same one.',
    exemplarKeywords: [
      'conflict miss',
      'thrown out while the cache is mostly empty',
      'two addresses land on the same cache line',
      'cache thrashing between two arrays',
      'a stride that keeps returning to one line',
      'the cache was not even full',
      'padding between arrays made it faster',
      'a power-of-two stride is slow',
      'not a shortage of room',
      'making the cache bigger did not help',
      'two hot addresses fighting over one place',
      'the same line wanted again and again by different data',
    ],
  },

  briefing: {
    observable: [
      'The cache is drawn as four upright columns rather than a row, so that arriving and leaving can be two directions of one motion.',
      'The arriving block waits above and to the side, then slides sideways along a dashed guide that bends down into a column — and it bends into the same column every time, six times out of six, so the repetition is the argument.',
      'As the new block descends into the column the one living there is carried down and out of the frame in the same direction at the same moment, fading as it goes, so it is pushed rather than erased.',
      'Three columns keep their dashed outline and their vacancy mark from the first moment to the last, and nothing ever travels toward them.',
      'A brace gathers exactly those three columns and carries a running count of them beside the picture, so the vacancy is quantified in the same glance as the displacement.',
      'The blocks that have been pushed out pile up as small dashed chips beneath the column, and their labels alternate — one, the other, one, the other — which is what mutual displacement looks like once it has accumulated.',
      'A verdict is stamped over the column at each access, and it reads the same on all six.',
      'Three lines of arithmetic stand at the side and are recomputed for every access, deriving the line from the address, then the column from the line, then the label from the line — so the column being the same twice over can be checked rather than believed.',
      'Each block carries both its address and the label that distinguishes it, so the two competitors are never confused for one another while they alternate.',
      'The captions say first that this address can sit in only one column, and afterwards that the same column is wanted again and the older occupant goes.',
      'The closing caption puts the three quantities in one line: how many lookups were made, how many succeeded, and how many columns are still empty.',
    ],

    screen: {
      affordances: [
        'The screen plays the six lookups and the closing count on its own and then stops.',
        'Two buttons: Replay, and a step control for taking the lookups one at a time, which is how a reader can stop on the moment a block is pushed out with three columns standing unused beside it.',
        'The four columns, the two addresses and the six lookups are fixed, so an article can name either address and quote the column it is forced into.',
      ],
    },

    useWhen: [
      'The article says a cache discarded something and the reader supplies the obvious reason, that it was full. A displacement happening with three of four places unused is the correction, and it has to be seen in one glance rather than argued.',
      'The prose needs the reader to separate two causes that produce the same symptom — running out of room, and being sent to a place that is taken — before any remedy can be discussed, since the remedies are different.',
      'The reader has to accept that buying a larger cache can change nothing at all, which only follows once the losses are seen to have nothing to do with how much it holds.',
      'The article is about an unlucky arrangement of data — two arrays a certain distance apart, a stride that keeps landing in the same place — and needs the mechanism behind the bad luck rather than the advice alone.',
      'The prose is about to introduce a scheme that gives an address more than one place to go, and the reader should already feel what having exactly one costs.',
    ],

    avoidWhen: [
      'The subject is a hash collision — two keys producing one hash value, why collisions are unavoidable, collision resistance, or birthday bounds. Nothing is hashed here and nothing is a matter of counting or chance: the address arithmetic is exact, and the same address always arrives at the same place.',
      'The article is about a hash table handling two keys in one bucket by chaining or probing. Both keys are kept there; here the second arrival ends the first one\'s stay.',
      'The article uses "conflict" for a merge conflict in version control, two writers updating one record, a lock held by someone else, or a scheduling clash.',
      'The subject is a cache that genuinely has no room left and must choose something to discard. Nothing is chosen here — the address names its own victim — and room is never what runs out.',
      'The article is about how a cache behaves as a program\'s data grows, or where the turn from cheap to expensive falls. One arrangement is played here and nothing is varied.',
      'The subject is how an address divides into fields, or what the stored label is for. The division is used here and not explained.',
      'The article is about giving an address several places to go, or about which of those places to give up. Only the single-place scheme is drawn, and what it costs is the whole point.',
      'The subject is an HTTP cache, a CDN, or a browser cache, where two documents never compete for one slot.',
      'The article is about memoizing a function or caching results under a key.',
      'The subject is two processor cores writing to one block, or keeping caches consistent between them. A single stream of lookups runs here and nothing is written.',
      'The article is about the cost of a trip to memory. What is shown is why the trip is taken again, never what it is worth.',
    ],

    contrastWith: [
      {
        concept: 'directMappedCache',
        note: 'This is the single scene offered as proof that placement, not room, is the cause; that one takes the cause as settled and follows the damage as a growing amount of data is put through the same rule.',
      },
      {
        concept: 'indexAndTag',
        note: 'That one establishes how an address arrives at one line and how the line says whose data it holds; this uses both and asks what it costs a program when two addresses in play arrive at the same one.',
      },
      {
        concept: 'temporalLocality',
        note: 'Both end with data gone before it is wanted again, but there it is gone because more data was live than could be kept at once, and here because it was sent to an occupied place while other places were free.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'Two meanings of two things landing in one place: there it is a counting argument that some pair must collide however clever the function, here it is an arithmetic certainty about two particular addresses, and the cure is to move the data rather than to accept the inevitable.',
      },
      {
        concept: 'lruCache',
        note: 'There the interesting question is which entry to give up when there is no room, and a good answer keeps more of them; here nothing is chosen and there is room, so no answer to that question would help.',
      },
    ],
  },
};
