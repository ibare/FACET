/**
 * turnaroundVsWait 개념 선언.
 *
 * canonical facet 은 `facet:turnaroundVsWait` — A(0, 4) · B(1, 3) · C(3, 2)를 FCFS 로 돌린 뒤, 프로세스마다
 * 도착에서 끝까지의 막대(반환)가 내려와 도착을 0 에 맞추고 CPU 에 오른 틱에서 두 토막(대기 · 실행)으로 벌어진다.
 * B 와 C 는 반환 6 으로 같고 대기는 3 · 4 로 다르다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `schedulingPolicy` 는 정책이 대기를 누구에게 옮기는지 견준다. 이쪽은 그 전에 필요한 한 식 —
 * **반환 = 대기 + 실행, 스케줄이 바꾸는 것은 대기 토막뿐** — 하나다. 줄의 드나듦이나 정책 비교는 없다.
 * definition 은 turnaround · waiting · burst · split · equal turnaround 를 독점하고, 누적(`convoyEffect`) ·
 * 시작점(`firstComeFirstRun`)의 낱말을 쓰지 않는다.
 *
 * 전제: 틱은 모형의 정수 시각(밀리초가 아니다). CPU 하나, 입출력 없음, 바꾸는 비용 0. 대기는 줄에 서 있던 틱 수.
 * 응답 시간은 다루지 않는다. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const turnaroundVsWaitConcept: FacetConceptSource = {
  id: 'turnaroundVsWait',
  label: 'Turnaround Time = Waiting Time + Burst',
  canonicalFacet: 'facet:turnaroundVsWait',

  surface: {
    definition:
      'A process\'s turnaround time, from arrival to completion, splits into waiting time in the ready queue plus its own CPU burst, so two processes with equal turnaround can have waited different amounts.',
    exemplarKeywords: [
      'turnaround time',
      'waiting time',
      'turnaround time minus burst time',
      'completion time minus arrival time',
      'CPU burst time',
      'scheduling criteria',
      'how to calculate waiting time',
      'scheduling metrics table',
      'difference between turnaround and waiting time',
    ],
  },

  briefing: {
    observable: [
      'The upper panel is a clock in ticks ("Clock (ticks)", 0 to 9). Each process has an arrival triangle and a bar from arrival to finish ("Arrival to finish"), with a vertical mark where it got the CPU.',
      'Three processes share one CPU in first-come order: A arrives at 0 with length 4, B at 1 with length 3, C at 3 with length 2. The first step runs them: "Ran first come, first served. Last finish: tick 9."',
      'Then, one process per step, its bar drops into the lower panel, aligns its arrival to zero and splits at the tick it started into a waiting segment and a running segment, with tags "Turnaround: …", "Wait: …", "Run: …". Both panels use the same scale.',
      'A: "turnaround 4 = wait 0 + run 4" — it ran on arrival and has no waiting segment. B: turnaround 6 = wait 3 + run 3. C: turnaround 6 = wait 4 + run 2.',
      'The last step sets B and C side by side: "B · C — turnaround 6 · 6, wait 3 · 4." Equal turnaround, different waiting.',
      'The run segment is always the process\'s own length, so the schedule can only stretch or shrink the waiting segment. Six steps in total: the opening clock, the run, three splits and the comparison. Ticks are model time units, not milliseconds; one CPU, no I/O, no switching cost. Waiting is counted as ticks spent in line; response time is not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops after setting B and C side by side.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to a single split holds one process\'s bar at the moment it breaks into wait and run.',
        'The three processes and their numbers are fixed, so an article can quote every turnaround, wait and run value exactly.',
      ],
    },

    useWhen: [
      'The article defines turnaround and waiting time and needs the reader to see one as the other plus the burst, on real bars rather than a formula.',
      'A reader thinks two processes that took equally long to finish were treated equally, and the article needs a case where one of them spent more of that time waiting.',
    ],

    avoidWhen: [
      'The article is about response time, the delay before a process first runs. That measure is not shown.',
      'The subject is comparing scheduling policies or improving the average. Only one fixed schedule appears.',
      'The article discusses throughput or CPU utilization. Neither is measured.',
    ],

    contrastWith: [
      {
        concept: 'firstComeFirstRun',
        note: 'Computing when each process starts under first-come order produces the schedule; splitting turnaround into wait and run reads that schedule per process to say how much of the elapsed time was spent idle in line.',
      },
      {
        concept: 'convoyEffect',
        note: 'The convoy effect is about waiting piling up for many processes behind one. The turnaround split is the accounting that says what waiting is in the first place.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'A policy can only move the waiting part of turnaround, because each run part is fixed by the process\'s length; that is why policies are compared on waiting.',
      },
    ],
  },
};
