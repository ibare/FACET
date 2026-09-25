/**
 * starvationOfLong 개념 선언.
 *
 * canonical facet 은 `facet:starvationOfLong` — 비선점 SJF 에서 긴 작업(0, 6)이 짧은 것 S1 ~ S6(길이 2, 틱 0 · 1 · 3 ·
 * 5 · 7 · 9 도착)에게 고를 때마다 건너뛰어진다. 건너뛴 횟수 6, 대기 12, 반환 18. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `schedulingPolicy` 는 같은 일감(짧은 것이 이어 옴)을 네 정책으로 돌려 FCFS 는 긴 것을 굶기지 않는 대신
 * 짧은 것 모두를 세운다는 것을 견준다. 이쪽은 SJF 한 차례 안의 한 장면 — **고를 때마다 긴 것이 건너뛰어지고,
 * 그 무엇도 변하지 않은 채 대기만 쌓인다** — 하나다. 순위가 오르는 일(`aging`)은 없다. definition 은 passed over ·
 * steady stream · indefinitely · average looks small 을 독점한다.
 *
 * 전제: 틱 단위, CPU 하나, 입출력 없음, 바꾸는 비용 0, 동률은 줄에 먼저 선 것. 값은 예로 정한 것.
 * 짧은 것이 끝없이 오면 긴 것은 영영 오르지 못한다 — 화면에서는 틱 12 에 흐름이 끊겨 오른다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const starvationOfLongConcept: FacetConceptSource = {
  id: 'starvationOfLong',
  label: 'Starvation of a Long Job Under SJF',
  canonicalFacet: 'facet:starvationOfLong',

  surface: {
    definition:
      'Under non-preemptive SJF with a steady stream of short arrivals, a long job already in line is passed over at every selection and can wait indefinitely, even while the average waiting time looks small.',
    exemplarKeywords: [
      'starvation in SJF',
      'indefinite postponement',
      'indefinite blocking',
      'long process never gets the CPU',
      'disadvantage of shortest job first',
      'average hides the worst case',
      'fairness in CPU scheduling',
      'why aging is needed',
    ],
  },

  briefing: {
    observable: [
      'A "Long job" card with length 6 stands in the "Ready line" next to a CPU slot and a "Done" area. Short jobs S1–S6, each length 2, arrive at ticks 0, 1, 3, 5, 7 and 9; S1 and the Long job are both present at tick 0.',
      'Each time the CPU frees, the shortest job in line is chosen and the Long job stays at the front of the line: "Tick 2 · S2 runs first, Long job is passed over. Times skipped: 2". The chosen short job arcs over the Long job on its way to the CPU, and each jump leaves an arc above the Long job\'s card; the arcs only accumulate. Every time a short job finishes, the next short one has already arrived.',
      'The skip count climbs 1, 2, 3, 4, 5, 6 at ticks 0, 2, 4, 6, 8 and 10, while the Long job\'s "Wait: …" grows. Nothing about it changes — not its length, not its place — only the ticks it has waited.',
      'The short jobs run almost as soon as they arrive: S1 waits 0, each of the others 1.',
      'At tick 12 no short job is in line: "Nothing else is in line — Long job runs. Wait: 12". It ends at tick 18: "Long job is done. Times skipped: 6 · Wait: 12 · Turnaround: 18".',
      'The average wait over all seven is only 2.43 ticks, because six of them barely waited; the average does not show how long one job was held back. If short jobs never stopped, the Long job would never run. Ticks are model units; one CPU, no I/O, no switching cost, ties go to whoever joined the line first.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one pick per step, and stops when the Long job finishes at tick 18.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to any of the six skips holds the Long job at the front of the line while another short job takes the CPU.',
      ],
    },

    useWhen: [
      'The article explains starvation and needs a case where the rule is working exactly as designed yet one job is skipped at every decision.',
      'The article warns that a good average waiting time can hide one job that waited far longer than everyone else, and wants the 2.43 average beside the 12-tick wait.',
    ],

    avoidWhen: [
      'The article is about the remedy, aging, or about priorities rising. Nothing changes the Long job\'s standing here.',
      'The subject is starvation in lock or reader-writer protocols, or in resource allocation. This is CPU selection only.',
      'The point is deadlock. The Long job is never blocked forever; it runs once the stream stops.',
    ],

    contrastWith: [
      {
        concept: 'shortestFirst',
        note: 'Shortest-first minimizes waiting for a fixed set of jobs. Starvation is what the same rule does when the set keeps growing with short arrivals.',
      },
      {
        concept: 'aging',
        note: 'Starvation is the problem: a job whose standing never changes loses every choice. Aging is a fix that changes the standing with time spent waiting.',
      },
      {
        concept: 'convoyEffect',
        note: 'In a convoy the short jobs pay for one long job ahead of them; under starvation the long job pays for the short ones. Each ordering rule has its own victim.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'Starvation is one policy\'s behaviour on one workload. Another policy on the same arrivals avoids it and spreads the waiting over the short jobs instead.',
      },
    ],
  },
};
