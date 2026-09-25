/**
 * virtualRuntime 개념 선언.
 *
 * canonical facet 은 `facet:virtualRuntime` — 무게 2 : 1 : 1 인 A · B · C 가 틱 0 부터 모두 준비되어 있고, 틱마다 가상
 * 시간이 가장 작은 것이 한 틱 돌아 `2 ÷ 무게` 만큼 는다. 12 틱의 차례는 A B C A B C A A B C A A, 쓴 틱 6 : 3 : 3,
 * 끝에서 셋의 가상 시간은 모두 6. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 `weightedFairShare` 아래 조각 하나)
 *
 * 완제품은 B 의 무게를 돌려 몫이 무게의 비로 옮겨 가는 것과, 늦게 온 C 의 출발점(0 / 가장 작은 값)이 그 비를
 * 지키거나 깨는 것을 쥔다. 이쪽은 한 판의 한 동작 — **가장 뒤처진 것이 뽑혀 따라붙고, 가상 시간들이 서로를
 * 앞지르며 나란히 오른다** — 하나다. 줄의 차례 · 몫 · 순위의 수는 없다. definition 은 smallest vruntime · furthest
 * behind · catches up · stay level 을 독점하고, 완제품의 late arrival · initialized · share ratio 를 쓰지 않는다.
 *
 * 전제: 정수 틱, CPU 하나, 입출력 없음, 바꾸는 비용 0. 셋은 틱 0 부터 준비되어 있고 끝나지 않는다. `2 ÷ 무게` 는 예로 정한
 * 단순화 — 실제 CFS 의 nice 무게표 · 새 프로세스 자리 잡기 · 목표 지연은 없다. 동률은 가장 오래전에 돈 것(안 돈 것이
 * 가장 오래전, 그 안에서는 목록 차례) — 12 틱 가운데 여섯 번.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const virtualRuntimeConcept: FacetConceptSource = {
  id: 'virtualRuntime',
  label: 'Virtual Runtime (CFS Runs the Furthest Behind)',
  canonicalFacet: 'facet:virtualRuntime',

  surface: {
    definition:
      'CFS gives each tick to the task with the smallest virtual runtime, the one furthest behind; running advances that count by an amount inversely proportional to weight, so the counts keep overtaking each other and stay level.',
    exemplarKeywords: [
      'vruntime',
      'virtual runtime',
      'CFS picks the leftmost task',
      'red-black tree of runnable tasks',
      'how CFS chooses the next task',
      'virtual time in fair scheduling',
      'weight slows vruntime growth',
      'fair scheduler catch-up',
    ],
  },

  briefing: {
    observable: [
      'Each process runs along its own horizontal lane whose axis is "Virtual time" (0 to 6): A with "Weight 2", B and C with "Weight 1". A "Smallest virtual time" line marks the one furthest behind, a "Ticks used" count sits beside each lane, and "Last ran: tick …" or "Not run yet" shows under each runner.',
      'Each time a runner is picked it jumps forward once and leaves a segment behind it, so how many jumps it took to cover the same distance — the ticks it actually used — stays visible on the lane.',
      'All three start at 0: "Every virtual time starts at 0". Each tick the lowest is picked and grows by 2 ÷ weight: A by 1, B and C by 2. Captions show both the choice and the arithmetic — "Tick 3 · furthest behind: A" and "Virtual time 2 → 3 (+1, weight 2)".',
      'Ties are frequent, six of the twelve ticks. They go to the process that ran longest ago, and one that has not run yet counts as longest ago, then list order: "Tick 1 · tied: B · C · first in the list not yet run: B". At tick 4 all three sit at 2; A ran at tick 3, C at 2 and B at 1, so B is picked.',
      'Over twelve ticks the order is A B C A B C A A B C A A. A, growing half as fast, comes back to the bottom more often. The three virtual times keep passing each other and never drift far apart.',
      'The run ends "Ticks run: 12" and "Ticks used 6 : 3 : 3 · weights 2 : 1 : 1": actual CPU time matches the weight ratio, and all three virtual times stand level at 6.',
      'Ticks are model units; one CPU, no I/O, no switching cost; all three are ready from tick 0 and never finish. The 2 ÷ weight rule is a chosen simplification — real CFS uses a nice-to-weight table, places newcomers at the minimum virtual time and divides a target latency — and only the "pick the smallest" rule is shown.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick per step, and stops after twelve ticks on the ticks-used ratio.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 4 holds the three-way tie at 2 and the pick of B by longest-since-run.',
      ],
    },

    useWhen: [
      'The article introduces vruntime and needs the selection rule seen tick by tick: always the one furthest behind, which then moves up.',
      'A reader asks how a scheduler without time slices or turn order can still hand a heavier task more CPU, and the article needs the 6 : 3 : 3 result arising from nothing but slower growth.',
    ],

    avoidWhen: [
      'The article is about what happens when a task arrives late or wakes from sleep. All three are present from the first tick.',
      'The subject is the red-black tree itself — insertion, rotations, balancing. The screen shows values, not a tree.',
      'The article is about nice values, sched_latency or cgroup shares. None is modelled.',
    ],

    contrastWith: [
      {
        concept: 'weightedFairShare',
        note: 'Choosing the smallest virtual runtime is the whole selection rule. That the long-run share follows the weights, and that a newcomer\'s starting count can break it, are consequences of the rule rather than the rule.',
      },
      {
        concept: 'timeSliceRotate',
        note: 'Round robin gives turns in queue order for a fixed slice; a virtual-runtime scheduler keeps no order and no slice, only a running count per task.',
      },
      {
        concept: 'aging',
        note: 'Aging lifts a waiting job so it eventually wins; picking the smallest virtual runtime makes the one that has had least always win. Both favour whoever is behind, measured differently.',
      },
    ],
  },
};
