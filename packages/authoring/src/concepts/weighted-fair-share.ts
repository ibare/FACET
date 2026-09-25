/**
 * weightedFairShare 개념 선언.
 *
 * canonical facet 은 `facet:weightedFairShare` — A · B 가 0 틱부터, C 가 12 틱에 와서 24 틱 동안 CPU 를 나눈다.
 * 한 틱 돌면 가상 시간이 `6 ÷ 무게` 만큼 오르고, 틱마다 가상 시간이 가장 작은 것이 돈다. 손잡이 둘:
 * B 의 무게 1 · 2 · 3(처음 2) · C 의 출발점 0 에서 / 가장 작은 값에서(처음 가장 작은 값에서).
 * 앞 12 틱 B 의 몫 50 · 67 · 75 %, 0 에서 출발한 C 는 뒤 12 틱 가운데 8 · 6 · 5 틱, 가장 작은 값에서면 4 · 3 · 3 틱.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * `virtualRuntime` 은 무게 2 : 1 : 1 한 판에서 틱마다 가장 뒤처진 것이 뽑혀 따라붙는 한 장면이다. 이쪽은 **무게를
 * 돌려 몫이 무게의 비로 옮겨 가는 것, 늦게 온 것의 출발점이 그 비를 지키거나 깨는 것**을 쥔다. 그래서 definition 은
 * weight · share in proportion · late arrival · initialized at zero · monopolize 쪽을 쥐고, 조각이 독점한
 * smallest value · furthest behind · leapfrog · stay level 을 쓰지 않는다.
 *
 * 전제 (설명 글 `weightedFairShare.md` 가 밝힌 것):
 *  - 틱은 모형의 시각. CPU 하나, 입출력 없음, 바꾸는 비용 0.
 *  - `6 ÷ 무게` 는 예로 정한 단순화(6 은 1 · 2 · 3 의 최소공배수). 실제 CFS 의 nice 무게표 · 목표 지연 · 최소 실행 단위는 없다.
 *  - 실제 CFS 는 새로 온 것을 가장 작은 가상 시간 근처에서 출발시킨다 — "0 에서" 는 그러지 않으면 생기는 일을 보이려고 둔 값.
 *  - 동률은 마지막으로 돈 틱이 가장 이른 것, 그다음 목록 차례. 판마다 7 ~ 14 번 걸린다.
 *  - 몫은 앞 12 틱으로만 잰다 — 뒤 12 틱은 무게 합으로 나누어떨어지지 않는다.
 *  - 코드 패널은 IR 하나(`fairShare`)를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const weightedFairShareConcept: FacetConceptSource = {
  id: 'weightedFairShare',
  label: 'Weighted Fair Share in CFS (Weights and Late Arrivals)',
  canonicalFacet: 'facet:weightedFairShare',

  surface: {
    definition:
      'Under Linux CFS, raising one task\'s weight raises its CPU share in the same ratio, and initializing a late arrival\'s vruntime at zero instead of the current minimum lets it monopolize the CPU while catching up.',
    exemplarKeywords: [
      'Completely Fair Scheduler weights',
      'nice value and CPU share',
      'proportional share scheduling',
      'weighted fair queuing for CPU',
      'min_vruntime for new tasks',
      'new process placement in CFS',
      'sched_entity vruntime initialization',
      'CPU share percentage by weight',
      'fairness when a process wakes or forks',
      'Linux scheduler fairness',
    ],
  },

  briefing: {
    observable: [
      'A line graph plots virtual time against tick for A, B and C over 24 ticks, beside a "Ticks received" bar per process labelled with its weight ("weight 1", "weight 2"). A and B are present from tick 0; C arrives at tick 12.',
      'Each tick one process runs and its line steps up by 6 ÷ weight: 6 for weight 1, 3 for weight 2, 2 for weight 3. Captions show the arithmetic — "Tick 1: B runs · 0 + 6 ÷ 2 = 3 · Others: A 6". A heavier process\'s line lies flatter and it is picked more often.',
      'Ties are frequent — 7 to 14 of the 24 picks in a round — and captions name the rule each time: "Tie at 6 (A · B): the one that ran longest ago goes first", or, when none has run, list order.',
      'Over the first 12 ticks, shared by A and B only, B receives 6, 8 or 9 ticks for weights 1, 2 and 3 — 50, 67 and 75 percent, the weight ratio exactly. The round ends with "B share of the first 12 ticks: 8/12 = 67%" and "Last 12 ticks · C: …".',
      'At tick 12 a caption reports where C starts: "virtual time starts at the lowest present: 24" in the default round, or "starts at 0". Starting at the lowest, C climbs alongside the others and gets 4, 3 or 3 of the last 12 ticks for B\'s weights 1, 2, 3.',
      'Starting at zero, C is far behind everyone and is picked tick after tick until it catches up — with B at weight 1 it runs 6 ticks in a row and takes 8 of the last 12 (6 at weight 2, 5 at weight 3). The default round totals A 7 · B 14 · C 3; at weight 2 from zero it becomes A 6 · B 12 · C 6, so the latecomer gets as much as A.',
      'The previous round stays as dashed lines ("dashed: previous run") when a handle moves. Ticks are model time; one CPU, no I/O, no switching cost. The 6 ÷ weight increment is a chosen simplification — real CFS derives weights from nice values and uses a target latency and minimum granularity, none of which are modelled — and real CFS places newcomers near the minimum, so "zero" is there to show what happens otherwise.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: "Weight of B" with 1, 2, 3 (starting at 2), and "C starts at" with "zero" or "the lowest" (starting at "the lowest"). Each change plays a new round of 26 steps: one per tick, one for C\'s arrival, one for the final share.',
        'Three readouts: "A ticks", "B ticks" and "C ticks", the ticks each has received so far.',
        'The move that makes the idea land is flipping "C starts at" to "zero" at a fixed weight: C\'s line drops to the floor at tick 12 and runs straight up while A\'s and B\'s go flat, and the C ticks readout jumps.',
        'The code panel, labelled "Weighted fair share", starts empty with a "+ Add language" button; the chosen language shows a `fairShare` function with the late-start choice as a flag, carrying one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article claims CFS divides the CPU by weight and needs the ratio to come out exactly — 1:2 giving 67 percent — from nothing but "run the lowest".',
      'The article explains why the kernel starts a new or waking task near min_vruntime, and needs the failure case where it starts at zero and takes over the CPU.',
    ],

    avoidWhen: [
      'The subject is the nice-to-weight table, sched_latency, minimum granularity or group scheduling. None of those is modelled.',
      'The article is about multi-core load balancing or run queues per CPU. There is one CPU.',
      'The article is about fair queuing of network packets. The mechanism is similar in spirit but everything here is CPU time.',
    ],

    contrastWith: [
      {
        concept: 'virtualRuntime',
        note: 'Picking the smallest virtual runtime is the whole selection rule. The weight ratio it yields, and its dependence on where a newcomer\'s count begins, are consequences that only show over a full run with arrivals.',
      },
      {
        concept: 'roundRobinQuantum',
        note: 'Round robin shares equally by giving everyone the same slice in turn; weighted fair share has no turn order at all and shares unequally on purpose.',
      },
      {
        concept: 'priorityAging',
        note: 'Priority decides who goes first and needs aging to keep the low one alive; weights decide how much each gets, so no one is shut out to begin with.',
      },
    ],
  },
};
