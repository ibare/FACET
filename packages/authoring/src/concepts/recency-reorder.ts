/**
 * recencyReorder 개념 선언.
 *
 * canonical facet 은 `facet:recencyReorder` — 가득 찬 프레임 넷의 줄(5 · 9 · 2 · 6, 맨 앞이 가장 최근)에 참조 다섯
 * (2 · 6 · 2 · 5 · 1)이 온다. 적중이면 쓰인 페이지가 맨 앞으로 당겨지고 사이의 것이 한 칸씩 밀린다. 한 번도 안 쓰인
 * 9 가 맨 뒤로 내려앉고, 폴트 1 이 오자 찾지 않고 바로 떨어진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `evictLeastRecent` 는 같은 LRU 를 **때 표시를 되짚어 고르는** 그림으로 쥔다. 이쪽은 **줄의 순서가 바뀌는
 * 것** — 쓰일 때 당기고, 그래서 버릴 것이 늘 끝에 있다 — 이다. definition 은 pulls to the front · pushing back one
 * place · drifts to the tail · without any search 를 독점하고, last used · looks back · longest ago · LRU 를 쓰지 않는다
 * (LRU 낱말은 exemplarKeywords 에만).
 *
 * 전제: 값은 예로 정한 것. 줄 안의 페이지는 서로 달라 동률이 없다. 실제로는 적중을 MMU 와 TLB 가 처리해 커널이
 * 참조마다 줄을 고칠 수 없어, 참조 비트로 흉내 내는 경우가 많다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const recencyReorderConcept: FacetConceptSource = {
  id: 'recencyReorder',
  label: 'Move to Front on Use (The Next Victim Waits at the Back)',
  canonicalFacet: 'facet:recencyReorder',

  surface: {
    definition:
      'Every hit pulls the used page to the front of an ordered list, pushing the others back one place, so a page nobody touches drifts to the tail and is removed from there without any search.',
    exemplarKeywords: [
      'move-to-front list',
      'LRU list maintenance',
      'recency order',
      'LRU stack',
      'most recently used at the head',
      'how LRU finds the victim quickly',
      'LRU implementation with a list',
      'reorder on access',
    ],
  },

  briefing: {
    observable: [
      'A vertical line of four pages, labelled "Most recent" at the top and "Next out" at the bottom, starts as 5, 9, 2, 6. The start reads "Every frame is full. The line runs from last used to next out." The references 2, 6, 2, 5, 1 wait in a "Reference" row, and each step leaves a column showing the line\'s new order.',
      'On a hit the used page slides out of its place and goes to the top while the pages above it move down one place: "Page 2: hit. It is pulled to the front." with "Pushed back one place: 2" (the count of pages that moved).',
      'The first four references are all hits, and the line goes 2 5 9 6 → 6 2 5 9 → 2 6 5 9 → 5 2 6 9. Page 9, second from the top at the start, is never used and sinks to the bottom.',
      'On the fifth reference, page 1 misses: "Page 1: fault. The new page goes to the front." and "Leaves from the back, no search: page 9". The line ends 1 5 2 6.',
      'Counters end at "Hits: 4 · Faults: 1". The pages and references are chosen for illustration and are all distinct, so no ties arise.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one reference per step, and stops after the fault — six steps including the start.',
        'A Replay button and a playback strip sit below it. Stepping through the four hits shows page 9 moving one place lower each time something above it is pulled forward.',
        'The line and references are fixed, so an article can quote every intermediate order.',
      ],
    },

    useWhen: [
      'The article explains how least-recently-used replacement avoids scanning every page at eviction time, and needs the ordered list where the victim is simply the last element.',
      'A reader wants to see why an unused page becomes the victim without anything happening to it directly — it is pushed down by others being used.',
    ],

    avoidWhen: [
      'The article is about comparing last-use times to justify one eviction. There are no times on this screen, only order.',
      'The subject is the hash map plus linked list of a software LRU cache and its get and put operations. Only the order of pages in memory frames is shown.',
      'The point is how hardware approximates recency with reference bits. The order here is exact.',
    ],

    contrastWith: [
      {
        concept: 'evictLeastRecent',
        note: 'Looking back at each page\'s last use and picking the oldest is the rule; reordering on every use keeps the answer ready at one end, so the rule is applied without a comparison at eviction time.',
      },
      {
        concept: 'lruCache',
        note: 'A software cache keeps the same move-to-front order but pairs it with a key lookup so each access is found quickly; for memory frames only the order itself matters.',
      },
      {
        concept: 'secondChance',
        note: 'Reordering on every hit needs work at each access. The clock replaces that with a single bit set on use and examined only when a victim is needed, trading exactness for cost.',
      },
    ],
  },
};
