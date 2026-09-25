/**
 * priorityAging 개념 선언.
 *
 * canonical facet 은 `facet:priorityAging` — 순위 1 의 월말 보고서(길이 4)와 순위 3 의 짧은 일 J1 ~ J7(길이 2,
 * 0 틱부터 2 틱마다)을 비선점 우선순위로 돌린다. 손잡이는 에이징 간격 하나(없음 · 6 · 4 · 3 · 2 · 1, 처음 없음).
 * 간격을 줄이면 보고서 시작이 14 → 12 → 8 → 6 → 4 → 2 로 당겨지고, J 대기 합이 0 · 4 · 12 · 16 · 20 · 24 로 는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `aging` 은 간격 3 한 판에서 순위가 한 칸씩 올라 동률로 이기는 한 장면, `priorityPreempt` 는 높은 것이 오면
 * 그 틱에 자리를 뺏는 한 장면(순위 고정)이다. 이쪽은 **간격을 돌려 굶던 일의 앞당김과 그 값을 치르는 높은
 * 일들의 대기를 한 저울에 올리는 것**을 쥔다. 그래서 definition 은 tuning · rate · who pays · overtaken 쪽
 * 낱말을 쥐고, 조각들이 독점한 one level per fixed interval · ties · takes the CPU at once · remaining burst 를
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `priorityAging.md` 가 밝힌 것):
 *  - 순위는 수가 클수록 높다(교과서에 따라 반대). 틱은 모형의 시각, CPU 하나, 입출력 없음, 바꾸는 비용 0.
 *  - 실효 순위 = 순위 + ⌊(지금 − 줄에 선 틱) ÷ 간격⌋ 은 예로 정한 단순화. 줄에 있는 모두가 똑같이 오른다.
 *  - 비선점. 동률이면 줄에 먼저 선 것 — 에이징을 켠 다섯 판 모두의 끼어듦이 이 동률로 정해진다.
 *  - J 대기 합 = 4 × (보고서 뒤로 밀린 J 수) 는 J 가 끊김 없이 오는 이 데이터의 결과이지 법칙이 아니다.
 *  - 코드 패널은 IR 하나(`agingSchedule` · `effective`)를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const priorityAgingConcept: FacetConceptSource = {
  id: 'priorityAging',
  label: 'Priority Scheduling with Tunable Aging (Who Pays)',
  canonicalFacet: 'facet:priorityAging',

  surface: {
    definition:
      'Tuning the aging rate in priority scheduling moves a starved job\'s start earlier, and the favoured jobs it overtakes pay for that with extra delay of their own.',
    exemplarKeywords: [
      'priority scheduling with aging',
      'aging rate',
      'how fast should aging raise priority',
      'cost of preventing starvation',
      'fairness vs priority',
      'low-priority job starvation fix',
      'aging in operating systems',
      'non-preemptive priority scheduling example',
      'priority boost interval',
      'effective priority',
    ],
  },

  briefing: {
    observable: [
      'A vertical axis "Priority (higher is up)" holds a card per job. The Month-end report (priority 1, length 4) and seven short jobs J1–J7 (priority 3, length 2, arriving every 2 ticks from tick 0) move from "Not arrived yet" into the waiting area, up to the CPU and into "Finished". Arrival ticks sit under each job ("tick 0", "tick 2", …) and become "at tick …" once it has run.',
      'Captions narrate each tick boundary: "Arrived: …", "Month-end report priority: 1 → 2", "To CPU: J3 (priority 3)", and when the report catches up, "Tied at 3 with J…: first in line wins".',
      'With aging interval "none", the report is passed over by all seven J jobs, starts at tick 14 and waits 14 ticks; the round ends "Report start: tick 14 · Report wait: 14 · J wait total: 0".',
      'Shrinking the interval — none, 6, 4, 3, 2, 1 — makes the report climb the axis faster and cut in earlier: its start moves 14, 12, 8, 6, 4, 2.',
      'A "Wait (ticks)" bar per job on the right shows who pays: each J that the report overtakes waits exactly the report\'s length, 4 ticks. The "J total" rises 0, 4, 12, 16, 20, 24 across the same intervals, while J jobs that reach the CPU before the report drop from 7 to 1.',
      'A CPU strip at the bottom keeps a faint dotted mark where the report got the CPU in the previous round, so each new round shows how much earlier it cut in.',
      'In every round with aging on, the report enters the CPU at the tick its effective priority ties the newly arrived J at 3, and the tie goes to whoever joined the queue first. Priority numbers count upward here (some textbooks invert this); the aging formula — base priority plus waited ticks divided by the interval, rounded down, applied to everyone in the queue — is a chosen simplification. Scheduling is non-preemptive, one CPU, no I/O, no switching cost.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and one handle, "Aging interval", with None, 6, 4, 3, 2 and 1 (starting at None). Each position starts a new round of 9 to 18 steps.',
        'Three readouts: "Report wait", "J wait total" and "J ahead of report".',
        'The move that makes the idea land is stepping the interval down one position at a time and watching two things together: the report\'s start on the CPU strip moving left and the J wait bars on the right growing.',
        'The code panel, labelled "Priority scheduling with aging", starts empty with a "+ Add language" button; the chosen language shows `agingSchedule` with an `effective` priority function, carrying one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article recommends aging as the fix for starvation and must also say what it costs: the jobs that used to win now wait, by a measurable amount.',
      'The article discusses how to set the aging rate, and needs the whole range from no aging to aggressive aging set against the same stream of high-priority work.',
    ],

    avoidWhen: [
      'The subject is priority inversion caused by locks, or priority inheritance. No job holds a resource here; only CPU order is involved.',
      'The article is about preemptive priority scheduling. A job whose priority rises never displaces the one running.',
      'The claim is a general formula for how much high-priority jobs lose. The 4 ticks per overtaken job holds for this uninterrupted arrival stream, not in general.',
    ],

    contrastWith: [
      {
        concept: 'aging',
        note: 'Aging as a rule says a waiting job\'s priority climbs until it wins. Tuning the rate asks how soon that should happen and who absorbs the delay when it does.',
      },
      {
        concept: 'priorityPreempt',
        note: 'Preemption changes when a higher priority takes effect; aging changes what the priorities are. Aging without preemption moves the priorities but never displaces the running job.',
      },
      {
        concept: 'starvationOfLong',
        note: 'Starvation can come from any rule that always prefers one kind of job, length or priority. Aging is a remedy specific to priority, and it trades the starved job\'s wait for others\'.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'Switching whole policies moves waiting between processes; aging moves it too, but within one priority policy and by a dial rather than a different rule.',
      },
    ],
  },
};
