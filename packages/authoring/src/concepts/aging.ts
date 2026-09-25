/**
 * aging 개념 선언.
 *
 * canonical facet 은 `facet:aging` — 순위 1 의 월말 보고서(0, 길이 3)가 순위 3 의 J1 ~ J6(길이 2, 틱 0 · 1 · 3 · 5 · 7 · 9)
 * 사이에서 줄에서 3 틱을 기다릴 때마다 한 칸씩 올라, 틱 6 에 J4 와 순위 3 으로 나란해지고 줄에 먼저 선 덕에 뽑힌다.
 * 시작 6 · 대기 6 · 끝 9. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 `priorityAging` 아래 조각 둘)
 *
 * 완제품은 간격을 없음 ~ 1 로 돌려 앞당김과 높은 일들의 대기를 한 저울에 올린다. 형제 `priorityPreempt` 는 순위가 고정된
 * 채 자리를 뺏는 장면이다. 이쪽은 간격 3 한 판의 한 동작 — **기다린 만큼 순위의 수가 한 칸씩 오르고, 나란해지는
 * 순간 고름에서 이긴다** — 하나다. "에이징이 없으면 12" 는 화면에 없다. definition 은 effective priority · one level
 * per interval · ties · wins the pick 을 독점하고, 완제품의 tuning · who pays · overtaken 을 쓰지 않는다.
 *
 * id 는 관행대로 facet id 와 같게 `aging` 이다 — 다른 분야의 "aging" 과 갈라지는 몫은 label 과 avoidWhen 이 맡는다.
 *
 * 전제: 순위는 수가 클수록 높다. 에이징 식(처음 순위 + ⌊기다린 틱 ÷ 3⌋)은 예로 정한 단순화이고, 줄에 선 모두가 똑같이
 * 오른다(J4 가 틱 9 에 4 인 흔적). 비선점. 동률은 줄에 먼저 선 것. 틱 단위, CPU 하나, 입출력 없음, 바꾸는 비용 0.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const agingConcept: FacetConceptSource = {
  id: 'aging',
  label: 'Aging in Priority Scheduling (Rank Climbs While Waiting)',
  canonicalFacet: 'facet:aging',

  surface: {
    definition:
      'Aging raises a queued process\'s effective priority one level per fixed interval spent in line, until a low-priority process ties a newly arrived high one and wins the pick.',
    exemplarKeywords: [
      'aging',
      'aging technique to prevent starvation',
      'priority aging',
      'effective priority increases with waiting time',
      'solution to starvation in priority scheduling',
      'dynamic priority',
      'low priority process eventually runs',
      'priority increments over time',
    ],
  },

  briefing: {
    observable: [
      'A vertical "Rank" axis from 1 to 4 holds the waiting cards, ordered left to right by "Queue order →", beside a CPU slot and a "Finished" area. The Month-end report starts at rank 1; J1–J6 arrive at rank 3.',
      'The report (length 3) and J1 arrive at tick 0; J2–J6 (length 2 each) follow at ticks 1, 3, 5, 7 and 9. Each time the CPU frees, the highest rank in the queue is picked and runs to the end.',
      'The report is passed by J1, J2 and J3 in turn, but a small gauge beside it fills with each tick waited, and every 3 ticks it climbs one level: "Rank up: Month-end report 1 → 2 · ticks waited: 3" at tick 3, and 2 → 3 at tick 6.',
      'At tick 6 the queue holds the report and J4, both at rank 3. The tie goes to whoever joined the queue first: "Picked: Month-end report · rank 3 — same rank as J4, but joined the queue first".',
      'The report runs ticks 6–9: "Finished: Month-end report · started at tick 6 · ticks waited: 6". At that moment J5 and J6 had not yet arrived — the report climbed before the stream of high-rank jobs stopped.',
      'At tick 9 J4 shows rank 4: it too has aged, having waited since tick 5. Everyone in the queue ages at the same rate; it is not a rule that favours low ranks, but one that lets long waiting count.',
      'Higher numbers mean higher rank here (some textbooks invert this). The rate — one level per 3 ticks waited — is a chosen example; real systems pick their own interval and step. Once on the CPU a job no longer ages and is never displaced. Ticks are model units; one CPU, no I/O, no switching cost.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick boundary per step, and stops when the report finishes at tick 9.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 6 holds the report and J4 level at rank 3 with the report chosen.',
      ],
    },

    useWhen: [
      'The article presents aging as the cure for starvation in priority scheduling and needs the reader to watch a priority number actually change while the job waits.',
      'The article must explain that aging does not guarantee a low job runs first, only that it eventually draws level with incoming higher jobs, and that the tie rule then decides.',
    ],

    avoidWhen: [
      'The subject is aging in other senses — page-replacement aging counters, cache aging, or data expiry. This is priority in CPU scheduling.',
      'The article is about how fast aging should be set, or what the high-priority jobs lose. One rate is shown and the cost to others is not measured.',
      'The point is preemptive priority. A job whose rank rises never displaces the running one.',
    ],

    contrastWith: [
      {
        concept: 'starvationOfLong',
        note: 'Starvation is a job whose standing never changes losing every choice. Aging makes the standing change with waiting, so the choices eventually go the other way.',
      },
      {
        concept: 'priorityAging',
        note: 'Aging at one rate says the low job gets in. Varying the rate shows how soon it gets in and that the jobs it passes pay for it.',
      },
      {
        concept: 'priorityPreempt',
        note: 'Aging changes the priorities; preemption decides whether a new priority can interrupt the running job. They are independent choices.',
      },
      {
        concept: 'demoteOnOveruse',
        note: 'Aging raises a job for waiting; feedback demotion lowers a job for running too long. Both adjust standing from observed behaviour, in opposite directions.',
      },
    ],
  },
};
