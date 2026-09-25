/**
 * evictLeastRecent 개념 선언.
 *
 * canonical facet 은 `facet:evictLeastRecent` — 프레임 셋에 참조 여덟(7 · 0 · 1 · 2 · 0 · 3 · 0 · 4)을 흘린다. 자리가
 * 없을 때 프레임마다 화살이 마지막 쓴 때로 거슬러 뻗고, 가장 먼 과거에 닿은 페이지가 나간다. 페이지 0 은 가장
 * 먼저 들어왔지만 최근에 쓰여 t6 · t8 에 남는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `pageReplacement`(완제품)는 정책 셋을 프레임 수에 걸쳐 견준다. 형제 `recencyReorder` 는 같은 LRU 를 **줄의 순서**
 * 로 유지해 찾지 않고 맨 뒤를 내보내는 것을 쥔다 — 이쪽은 **때 표시를 되짚어 고르는 판단** 하나다. `evictOldest` 는
 * 들어온 차례만 보는 FIFO. definition 은 looks back · last used · longest ago · loaded early survives 를 독점하고
 * front · tail · without searching · arrival order 를 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 폴트면 빈 프레임 번호 낮은 것부터, 없으면 마지막 쓴 때가 가장 이른 것을 내보내고
 * 그 프레임에 새 페이지. 동률 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const evictLeastRecentConcept: FacetConceptSource = {
  id: 'evictLeastRecent',
  label: 'LRU Eviction (Look Back to the Last Use)',
  canonicalFacet: 'facet:evictLeastRecent',

  surface: {
    definition:
      'LRU picks its victim by looking back to when each resident page was last used and evicting the one used longest ago, so a page loaded early survives as long as it was used recently.',
    exemplarKeywords: [
      'LRU page replacement',
      'least recently used',
      'which page does LRU evict',
      'last use time',
      'LRU example 7 0 1 2 0 3 0 4',
      'LRU vs FIFO victim',
      'page replacement worked example',
      'temporal locality',
    ],
  },

  briefing: {
    observable: [
      'Time runs left to right. The top row holds the references t1–t8: 7, 0, 1, 2, 0, 3, 0, 4, with the current one outlined. On the left are "Frame 0", "Frame 1", "Frame 2"; each has a time line running right, and a dot on it marks when its page was last used. Small text under each frame name gives when the page came in ("in t2").',
      'The first three references fill empty frames: "Page 7: fault. It goes into empty frame 0."',
      'On a hit the page stays put and only its dot slides to the current column: "Page 0: hit. Only its last use moves, from t2 to t5."',
      'On a fault with no free frame, arrows reach back from the current column toward each frame\'s dot at the same speed; the one that arrives last, the page used longest ago, drops into an "Evicted" row and the new page takes its frame: "Page 2: fault, no free frame. Looking back, the farthest is page 7 at t1 — out."',
      'At t6 and t8 page 0 came in first but was used just before, and the screen says so: "Page 0 came in first (t2), but was used at t5. It stays." The evicted pages are 7, then 1, then 2.',
      'The run ends at "Faults: 6 · Hits: 2" with frames holding 4, 0, 3. The values are chosen for illustration; no two pages share a last-use time here.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one reference per step, and stops after t8 — nine steps including the start.',
        'A Replay button and a playback strip sit below it. Stopping on t6 holds the arrows mid-flight, with page 1\'s arrow still reaching past the others.',
        'The references are fixed, so an article can quote each victim and its last-use time.',
      ],
    },

    useWhen: [
      'The article explains the LRU rule and needs the reader to see that the deciding fact is when each page was last touched, not when it arrived.',
      'A reader works an LRU exercise by hand and wants each eviction justified with the three last-use times that were compared.',
    ],

    avoidWhen: [
      'The article is about how LRU is implemented with an ordered list or counters. The decision is shown as a comparison of times, not a data structure.',
      'The subject is an LRU cache for key-value lookups in application code. This is page replacement in memory frames.',
      'The point is comparing replacement policies or changing the number of frames. One policy, three frames.',
      'The subject is approximations such as the clock or reference bits. The times here are exact.',
    ],

    contrastWith: [
      {
        concept: 'evictOldest',
        note: 'Both evict one page when memory is full. First-in-first-out goes by when the page arrived and ignores use; least-recently-used goes by the last use, so an early arrival that is still in use survives.',
      },
      {
        concept: 'recencyReorder',
        note: 'Comparing last-use times is the rule; keeping the pages in use order so the victim is always at one end is a way to apply that rule without comparing at eviction time.',
      },
      {
        concept: 'secondChance',
        note: 'A single reference bit per page approximates the same idea cheaply: it records only whether a page was used since the hand last passed, not exactly when.',
      },
      {
        concept: 'pageReplacement',
        note: 'Choosing by last use is one rule on its own; setting it beside other rules across frame counts shows that it never gets worse with more frames yet is not always the fewest.',
      },
      {
        concept: 'lruCache',
        note: 'The same recency rule governs a bounded key-value cache in software. There the concern is the lookup and ordering structures; here it is the eviction decision among memory frames.',
      },
    ],
  },
};
