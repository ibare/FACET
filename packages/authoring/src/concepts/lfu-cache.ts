/**
 * lfuCache 개념 선언.
 *
 * canonical facet 은 `facet:lfuCache` — 요청 60(앞 20 어제 · 뒤 40 오늘)을 용량 3 캐시에 흘리고,
 * 손잡이 "세는 창"(끝없음 · 32 · 16 · 8 · 4, 처음 끝없음)이 횟수를 얼마나 먼 과거까지 세는지 정한다.
 * 계기 둘: 오늘 적중 8 · 11 · 13 · 10 · 6, 옛 키 자리 48 · 30 · 17 · 6 · 4.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `evictLeastFrequent` 는 끝없이 세는 LFU 가 가득 찬 캐시에서 무엇을 버리는가(가장 적은 횟수 · 동률은
 * 오래된 마지막 사용) 한 장면이다. 이쪽은 **세는 창을 돌리면 무엇이 갈리는가**를 쥔다 — 그래서 definition 은
 * window · aging · 지난 인기 · 훑기 · 적중이 가운데서 가장 높다는 낱말을 쥐고, 조각이 독점한 fewest · tie ·
 * victim 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `lfuCache.md` 가 밝힌 것):
 *  - 캐시 안 LFU. 횟수는 창 안의 요청으로 센다 — 창이 곧 기억이라 나갔다 온 키도 창 안에 남은 만큼 다시 센다.
 *  - "최근 W 요청" 창은 실제 LFU 의 나이 먹이기(aging · 감쇠)를 줄인 꼴이다.
 *  - 요청 흐름은 선형 합동 생성기 x ← (75·x + 74) mod 65537, 씨앗 42 로 미리 뽑았다.
 *  - 걸음 하나 = 요청 하나. 시각 · 지연은 셈하지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lfuCacheConcept: FacetConceptSource = {
  id: 'lfuCache',
  label: 'LFU Cache (How Far Back to Count Uses)',
  canonicalFacet: 'facet:lfuCache',

  surface: {
    definition:
      'How far back an LFU cache counts uses sets its behavior: counting forever lets formerly popular keys squat in the cache, a very short window acts like LRU and loses hot keys to one-off scans, and hits peak in between.',
    exemplarKeywords: [
      'LFU cache',
      'least frequently used',
      'LFU aging',
      'frequency decay',
      'sliding window frequency count',
      'cache pollution by stale popularity',
      'scan resistance',
      'LFU vs LRU hit rate',
      'W-TinyLFU',
      'Redis allkeys-lfu',
      'Caffeine cache',
    ],
  },

  briefing: {
    observable: [
      'A row of sixty requests runs across the top, split into Yesterday (the first 20) and Today (the last 40). A shaded band over the row is the counting window: the most recent W requests including the current one. The caption reads "Window: Endless" or "Window: 16".',
      'Below sit the three slots of a capacity-3 cache. Each shows its key, an "Old key" tag if the key appeared yesterday, a bar for "Count in window" and the step it was "Last used". Each step fills an empty slot, hits, or empties the slot with the shortest bar and puts the new key there ("Evicted: /book").',
      'Yesterday is dominated by `/event` (6 of every 10 requests); today is `/menu` and `/book` (3 each of every 10) plus one-time `/scan/<step>` paths (4 of every 10). With an Endless window the `/event` bar climbs to 10 and never shrinks, so it holds a slot to the last step while the other two slots churn.',
      'With a finite window the band slides one request per step and bars shrink as requests leave it. A triangle under the request row marks the step where `/event` is first evicted; turning the handle moves it earlier: never, then step 43, 35, 26, 7.',
      'The two readouts end at: "Hits today" 8, 11, 13, 10, 6 and "Old-key slots" (the sum, over today\'s steps, of slots holding a yesterday key) 48, 30, 17, 6, 4 for Endless, 32, 16, 8, 4. Hits peak at 16; with window 4 they fall to 6, the same count LRU gets on this stream.',
      'When the smallest counts tie, a line reads "Count tie: the older last use leaves". Such ties decide 8, 9 and 8 evictions at Endless, 32 and 16, but 28 and 33 at 8 and 4, where `/menu` and `/book` often sit at count 1 alongside the scans.',
      'The window of the last W requests stands in for the aging or decay real LFU implementations use. Counts are kept only for keys in the window, the stream was generated in advance from seed 42, and one step is one request with no clock. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a "Count window" slider with positions Endless, 32, 16, 8, 4, starting at Endless. Each setting replays the sixty requests from an empty cache, then waits.',
        'The move that makes the idea land is stepping the window down one notch at a time and watching two readouts part ways: Old-key slots falls steadily while Hits today rises, peaks at 16, then falls again.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button. It shows `lateHits` with helpers `findSlot`, `countInWindow` and `pickVictim`, taking paths as numbers in order of first appearance, and returns the same value as Hits today. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that pure LFU goes stale when traffic shifts, and needs yesterday\'s hot key holding a slot all day next to the hit count that costs.',
      'A reader asks why production LFU caches age or decay their counters instead of counting forever, and the answer should show both failure ends — too long and too short — with a better middle.',
    ],

    avoidWhen: [
      'The article only explains which key LFU evicts from a full cache. This screen assumes that rule and varies the counting horizon.',
      'The subject is the hash-map-plus-list data structure behind a cache, or O(1) LFU with frequency buckets. No data structure is drawn.',
      'The point is comparing LRU, FIFO and LFU side by side. There is no policy switch; LRU is only the limit a short window approaches.',
    ],

    contrastWith: [
      {
        concept: 'evictLeastFrequent',
        note: 'Choosing the key with the lowest count is the rule; how long counts are allowed to remember decides whether that rule keeps the right keys once the workload changes.',
      },
      {
        concept: 'lruCache',
        note: 'Recency looks only at the last touch and forgets popularity at once; frequency with a shrinking window slides toward that same forgetting, and the useful setting lies before it gets there.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Replacement policies differ by which record of past accesses they read. This holds the frequency record fixed and asks how much of the past it should include.',
      },
      {
        concept: 'evictLeastRecent',
        note: 'Evicting by last use protects whatever was touched lately, including one-time scans; counting frequency over a moderate window protects keys that recur, which is where the extra hits come from.',
      },
    ],
  },
};
