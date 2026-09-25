/**
 * pageReplacement 개념 선언.
 *
 * canonical facet 은 `facet:pageReplacement` — 참조열 하나를 정책(FIFO · LRU · Clock) × 프레임(1~5)으로 돌린다.
 * 손잡이 셋 — 정책(처음 FIFO) · 프레임(처음 4) · 참조열(1 · 2, 처음 1). 참조열 1 에서 프레임 3 → 4 로 FIFO 는 9 → 10
 * 으로 늘고, Clock 은 9 → 9, LRU 는 10 → 8 로 준다. 참조열 2(벨레이디의 열)에서는 Clock 도 9 → 10 으로 는다.
 * LRU 는 어느 열에서도 늘지 않지만, 프레임 3 에서는 셋 가운데 가장 많다(10 대 9).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각 다섯은 각자 한 규칙의 한 장면이다 — LRU 가 마지막 쓴 때를 되짚어 고르는 것(`evictLeastRecent`), 쓸 때마다
 * 앞으로 당겨 맨 뒤가 곧 다음 차례인 것(`recencyReorder`), FIFO 가 쓰임을 무시하는 것(`evictOldest`), FIFO 의 3 칸과
 * 4 칸을 나란히 흘려 4 칸이 앞지르는 것(`beladyAnomaly`), 바늘이 표시를 지우며 한 번 봐주는 것(`secondChance`).
 * 이쪽은 **정책이 "프레임을 늘리면 좋아진다" 의 참거짓을 정한다** 를 쥔다. 그래서 definition 은 policy decides ·
 * lowers, keeps or raises · never rises · not fewest at every size 를 쓰고, 조각들의 look back · front of list · arrival
 * · overtakes · hand · reference bit · spared 를 쓰지 않는다.
 *
 * 전제 (설명 글 `pageReplacement.md`): 참조열 1 은 예로 정한 열, 참조열 2 는 벨레이디가 쓴 열. 빈 프레임은 번호 낮은
 * 것부터, 내보낸 자리에 새 페이지. 새 페이지 표시 1, 바늘은 내보낸 칸 다음으로. FIFO · LRU 동률 없음. OPT 는 화면에
 * 없다(설명 글만). 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pageReplacementConcept: FacetConceptSource = {
  id: 'pageReplacement',
  label: 'Page Replacement Policies (FIFO, LRU, Clock Across Frame Counts)',
  canonicalFacet: 'facet:pageReplacement',

  surface: {
    definition:
      'Across FIFO, LRU and Clock on one reference string, the replacement policy decides whether one more frame lowers, keeps or raises the fault count; LRU never rises, yet it is not fewest at every frame count.',
    exemplarKeywords: [
      'page replacement algorithms',
      'FIFO vs LRU vs Clock',
      'page replacement policy comparison',
      'does adding frames always reduce page faults',
      'stack algorithms',
      'inclusion property',
      'page faults vs number of frames graph',
      'optimal page replacement OPT',
      'operating system page replacement exercise',
    ],
  },

  briefing: {
    observable: [
      'A "References" strip holds the reference string (string 1: 4 2 5 1 4 2 3 2 4 2 5 1 3); frames are drawn as "frame 0", "frame 1", …; one reference per step. Captions name each outcome: "Hit: frame 2", "Fault: empty frame 3", "Fault: evicted 4 from frame 1".',
      'Beneath the strip is the evidence each policy uses. Under FIFO a lane marked "Arrived" holds a marker per page and the leftmost one drops out on eviction, even if that page was just used. Under LRU the same lane is marked "Last used" and a hit pulls the page\'s marker to the current reference. Under Clock each frame shows "mark 0" or "mark 1" and a "hand" turns beneath the frames; cleared marks are named in the caption ("Mark cleared: frame 0").',
      'A bar chart, "Faults by frame count", shows the fault total for 1 to 5 frames under the current policy and string; the current round\'s bar grows from zero as faults occur.',
      'String 1, faults by frames 1–5: FIFO 13, 12, 9, 10, 5; LRU 13, 11, 10, 8, 5; Clock 13, 12, 9, 9, 5. From 3 to 4 frames FIFO rises, Clock stays, LRU falls — but at 3 frames LRU is the highest.',
      'String 2 (1 2 3 4 1 2 5 1 2 3 4 5): FIFO 12, 12, 9, 10, 5; LRU 12, 12, 10, 8, 5; Clock 12, 12, 9, 10, 5. Here Clock also rises from 3 to 4 frames. LRU rises in neither string.',
      'The opening round (string 1, FIFO, 4 frames) takes fourteen steps and ends with Faults 10, Hits 3, Evictions 6, frames holding 1, 3, 2, 5.',
      'String 1 is chosen for illustration; string 2 is the one Bélády used to show the anomaly. Empty frames fill lowest first, a new page takes the evicted page\'s frame and enters with its mark set, and Clock\'s hand stays on frame 0 while frames are still empty. FIFO and LRU times are reference numbers, so no ties arise.',
    ],

    screen: {
      affordances: [
        'Playback controls plus three handles: "Policy" (FIFO, LRU, Clock; starting at FIFO), "Frames" (1 to 5; starting at 4) and "Reference string" (1 or 2; starting at 1). Each round plays the string once, then waits.',
        'Three counters: "Faults", "Hits" and "Evictions".',
        'The move that makes the idea land is stepping Frames between 3 and 4 under each policy in turn and watching the bar pair: up under FIFO, level under Clock, down under LRU. Switching to string 2 makes Clock rise as well.',
        'The code panel, labelled "Page replacer", starts empty with a "+ Add language" button; the chosen language shows the replacement routine and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article compares FIFO, LRU and Clock and needs to show that the ranking depends on the frame count — LRU loses at 3 frames and wins at 4 on the same string.',
      'A reader assumes more memory always means fewer page faults, and the article needs to show that it holds for LRU but not for FIFO or Clock, with the reason being the policy itself.',
    ],

    avoidWhen: [
      'The subject is an LRU cache in application code, keyed by arbitrary keys. The slots here are page frames in an operating system.',
      'The article is about processor cache replacement or cache associativity. Frame count, not associativity, is the axis here.',
      'The point is thrashing, the number of processes, or CPU utilization. One process\'s references run with no timing.',
      'The subject is the optimal (OPT/Bélády\'s MIN) algorithm on its own. OPT is not one of the choices on screen.',
    ],

    contrastWith: [
      {
        concept: 'beladyAnomaly',
        note: 'The anomaly is a property of first-in-first-out replacement on a particular string. Setting it beside other policies shows it is not universal — LRU never exhibits it — and that Clock can.',
      },
      {
        concept: 'evictLeastRecent',
        note: 'How least-recently-used picks its victim is one rule examined alone. Comparing it with other rules asks when that choice pays off and when, at a different frame count, it does worse.',
      },
      {
        concept: 'evictOldest',
        note: 'First-in-first-out ignores use, so a page used a moment ago can be evicted. Across frame counts that blindness is also why its fault count can rise when memory grows.',
      },
      {
        concept: 'secondChance',
        note: 'The clock\'s reference bit spares recently used pages once. Whether that approximation of recency inherits least-recently-used\'s guarantee of never getting worse with more frames is a comparative question, and the answer is no.',
      },
      {
        concept: 'recencyReorder',
        note: 'Keeping pages ordered by last use is how least-recently-used is maintained cheaply. That the order for k frames is always a prefix of the order for k+1 is what stops its fault count from rising, the property the comparison exposes.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Both choose which occupied slot to give up. A processor cache is judged on miss count at a fixed capacity; page replacement is also judged by how faults move as the number of frames changes.',
      },
    ],
  },
};
