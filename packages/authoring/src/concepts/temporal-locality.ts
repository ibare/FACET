/**
 * temporalLocality 개념 선언.
 *
 * canonical facet 은 `facet:temporalLocality` — 칸 둘짜리 캐시로 접근열 둘을
 * 견주는 조각. 읽는 횟수는 여섯으로 같고 아래층까지 내려간 횟수가 하나 대 여섯이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 spatialLocality 와 **방향**으로 갈랐다.
 *
 *   이 개념          같은 자리로 **되돌아온다**. 되돌아오기까지의 사이가 짧으면
 *                    아직 위층에 있고, 멀리 흩어지면 돌아왔을 때 이미 밀려나 있다.
 *                    여기서는 한 원소를 여러 번 읽는 것이 전부다.
 *   spatialLocality  옆자리로 **나아간다**. 거기서는 같은 원소를 두 번 짚지 않는다.
 *
 * lineFill 과는 이득의 출처가 다르다 — 저쪽은 딸려 온 이웃이 벌어 주는 것이고
 * 이쪽은 딸려 온 이웃을 한 번도 쓰지 않은 채 되돌아오기만으로 번다.
 *
 * 그래서 keywords 는 되풀이 어휘(재사용 · 재사용 거리 · 워킹 셋 · 반복문이 거듭
 * 만지는 변수)를 갖고, 순회 어휘는 spatialLocality 에 넘긴다.
 *
 * 밀어내는 규칙이 화면에서 LRU 인 것은 재는 자가 최근성이어야 앞뒤가 맞기
 * 때문이지 정책을 견주려는 것이 아니다 — 그 구분을 avoidWhen 과 lruCache 대비에
 * 적어 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const temporalLocalityConcept: FacetConceptSource = {
  id: 'temporalLocality',
  label: 'Temporal Locality (Coming Back Before It Is Gone)',
  domain: 'computer-architecture',
  canonicalFacet: 'facet:temporalLocality',

  surface: {
    definition:
      'A program\'s tendency to reference the same address again soon after using it, so the data is still resident when it returns, while references spread far enough apart come back to find it displaced.',
    exemplarKeywords: [
      'temporal locality',
      'reuse of the same data',
      'reuse distance',
      'working set',
      'a loop variable read over and over',
      'repeated lookups of the same key',
      'the same table scanned again and again',
      'it was still in cache',
      'the working set no longer fits',
      'hot data staying resident',
      'accessed again before it is evicted',
    ],
  },

  briefing: {
    observable: [
      'Two access sequences sit at the top with the same number of reads, six against six, so the count is held constant and only the choice of where to look differs.',
      'Each access sends a probe downward from its own token, and the probe either turns back at the cache — where the resident block gives a small nudge — or carries on to the memory row below, which makes the two outcomes differ in distance travelled rather than in colour alone.',
      'Every descent leaves a solid trail behind it, so the count is left standing in the place where it was measured instead of being sent off to a counter: one trail under the first row, six under the second.',
      'Tokens are stamped H or M as they resolve, so the sequence can be read back afterwards access by access.',
      'When both slots are occupied, the block that has gone longest unused drops away downward before the new line rises into its place, so displacement is shown as a departure rather than an overwrite.',
      'The memory row below is indexed by line, not by element, and the scattered sequence reaches lines 0, 5 and 10 — three distinct lines cycling through a cache with two slots, which is why every one of its returns arrives too late.',
      'The first sequence reads one spot six times and descends only on the first of them; the five that follow all turn back upstairs.',
      'At the verdict the cache and memory dim while the trails thicken, leaving the two quantities being compared as the only things lit.',
      'The cache is emptied between the two sequences, so the second starts from the same cold state as the first.',
    ],

    screen: {
      affordances: [
        'The screen plays both sequences and the closing comparison on its own and then stops.',
        'Two buttons: Replay, and a step control for taking the reads one at a time, which is how a reader can pause on the moment a block is pushed out just before it would have been wanted again.',
        'The two sequences and the two-slot cache are fixed, so an article can name the spot that is read six times, or follow one address around the scattered loop and back.',
      ],
    },

    useWhen: [
      'The article credits the cache with making memory fast and the reader takes the benefit as automatic. Two sequences with identical read counts and wildly different descent counts moves the credit to the access pattern.',
      'The reader needs to see why exceeding the available room loses the benefit outright rather than gradually — three live lines cycling through two slots means every single return is a miss, not most of them.',
      'The prose is about keeping the set of actively used data small, and needs reuse to appear as a literal return to the same place rather than as a statistic.',
      'The reader should understand that how long a value survives depends on what else is touched in the meantime, not on its own age — the scattered sequence loses its lines to the other two addresses, not to time passing.',
    ],

    avoidWhen: [
      'The subject is using addresses next to one another. The repetition here is a return to a place already visited, not progress along adjacent places.',
      'The point is that fetching one element brings its neighbours. The screen holds four elements in a line and never profits from any of them; its only saving comes from returning.',
      'The article is weighing one discard rule against another — least recently used against least frequently used, or random, or first in first out. Recency is fixed here as the assumption under which reuse gets rewarded, not offered as a choice being examined.',
      'The subject is a bounded key-value cache as a data structure, its internal bookkeeping, or the interview question about implementing one.',
      'The article is about an HTTP cache, a CDN, or the caching of computed results under a key.',
      'The point is how wide a block should be. Width is fixed here and does not enter the comparison.',
      'The subject is two addresses colliding in the same slot while the rest of the cache sits empty. The pressure here comes from more live lines than slots, not from where lines are placed.',
      'The article is about a compiler keeping a value in a register, or about which values to keep close in a program\'s own structures.',
      'The subject is how much a single trip to memory costs.',
    ],

    contrastWith: [
      {
        concept: 'spatialLocality',
        note: 'Two ways a later access can be cheap, and they are not the same reason: returning to an address already fetched, or moving on to one fetched alongside it. A program can have either without the other.',
      },
      {
        concept: 'lineFill',
        note: 'That one is the fetch that brings neighbours along uninvited; this one never gets anything from the neighbours and earns its saving purely by coming back in time.',
      },
      {
        concept: 'cacheLine',
        note: 'This holds the geometry fixed and varies where the program looks; that one holds the program fixed and varies the geometry.',
      },
      {
        concept: 'lruCache',
        note: 'Recency appears in both, but there it is the rule being built and scrutinised, while here it is the background assumption that makes coming back soon worth anything at all.',
      },
      {
        concept: 'latencyLadder',
        note: 'This counts the trips that reuse avoids; that one says what each avoided trip was worth.',
      },
    ],
  },
};
