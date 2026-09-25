/**
 * processState 개념 선언.
 *
 * canonical facet 은 `facet:processState` — CPU 하나를 프로세스 1 ~ 5 개가 나눠 쓴다. 프로세스마다 CPU 2 틱 →
 * 입출력 5 틱을 되풀이하고, 틱 열넷의 CPU 띠 · 준비 줄 · 잠든 자리 · 프로세스 카드(상태 · 남은 틱)가 틱마다 움직인다.
 * 손잡이(프로세스 수)를 돌리면 이용률이 29 → 57 → 86 → 100 → 100% 로 오르다 멎고, 멎은 뒤로는 준비 줄 틱만
 * 6 → 16 → 30 으로 는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 한 프로세스가 지나는 길(`stateTransitions`) · 제 사건이 와야 깸(`blockedWaitsEvent`) ·
 * 받은 것을 적는 표(`pcbHoldsState`). 이쪽은 **프로세스 수를 돌리면 CPU 이용률이 어떻게 오르고 어디서 멎는가**를 쥔다.
 * 그래서 definition 은 multiprogramming · utilization · saturates · ready queue 쪽 낱말을 쥐고, 조각들이 독점한
 * transition · edge · event queue · wake order · record · reclaim 을 쓰지 않는다.
 *
 * 전제 (설명 글 `processState.md` 가 밝힌 것 — 화면은 각주가 없다):
 *  - 틱 수(CPU 2 · 입출력 5 · 지평 14)는 예로 정한 값이다. 멎는 자리 "프로세스 수 > (2 + 5) / 2" 가 여기서 나온다.
 *  - 입출력 장치가 프로세스마다 따로다(장치 다툼 없음). 바꾸는 비용 0. 빼앗기 없음.
 *  - 코드 패널은 IR 하나(`cpuUtilization`)를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const processStateConcept: FacetConceptSource = {
  id: 'processState',
  label: 'Process States and Multiprogramming (CPU Utilization vs Process Count)',
  canonicalFacet: 'facet:processState',

  surface: {
    definition:
      'Multiprogramming keeps several I/O-bound processes loaded so one runs while others wait for I/O; adding processes raises CPU utilization until it saturates, after which extra ones only lengthen the ready queue.',
    exemplarKeywords: [
      'multiprogramming',
      'degree of multiprogramming',
      'CPU utilization',
      'CPU idle time',
      'I/O-bound process',
      'CPU burst and I/O burst',
      'ready queue length',
      'why run more than one process',
      'overlapping computation with I/O',
      'diminishing returns of adding processes',
      'running, ready and waiting states',
    ],
  },

  briefing: {
    observable: [
      'A CPU strip of fourteen tick cells (0 to 13) runs across the top; below it are a CPU place, a Ready line and a Waiting area, and one card per process showing its letter, its state (Ready, Running or Waiting) and "Left: n" — remaining CPU ticks while running, remaining I/O ticks while asleep.',
      'Every process repeats the same cycle: two ticks on the CPU, then five ticks waiting on its own I/O device. Each tick step is captioned "Tick n" with what happened — "Picked: A", "Runs: A", "Sleeps: A", "Wakes: A" or "CPU idle" — and the card\'s state and count are rewritten on the spot.',
      'With the default two processes the strip fills as `AABB...AABB...`: after B sleeps at tick 4, the CPU sits idle for ticks 4 to 6 while both wait, because a sleeping process does not wake until its own I/O is done, even with the CPU free. The round ends with "CPU busy: 8 / 14" and "Utilization: 57%".',
      'Across the handle the strip fills in: 1 process `AA.....AA.....` (29%), 2 `AABB...AABB...` (57%), 3 `AABBCC.AABBCC.` (86%), 4 `AABBCCDDAABBCC` (100%), 5 `AABBCCDDEEAABB` (100%). Utilization stops rising at four; four and five differ only in which letters occupy the strip.',
      'Three readouts carry the round: CPU busy ticks (4, 8, 12, 14, 14), CPU utilization % (29, 57, 86, 100, 100) and Ready-queue ticks (0, 2, 6, 16, 30). Past saturation the extra processes show up only as time standing in the Ready line.',
      'When the handle changes, the previous round\'s strip stays faintly in place and each cell is overwritten as the new round reaches that tick, so the idle gaps visibly fill with another process\'s burst.',
      'The tick counts are example values, each process has its own I/O device so there is no device contention, switching costs nothing, and a running process is never preempted — it gives up the CPU only after its two ticks. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position "Processes" slider from 1 to 5, starting at 2. Each round plays fourteen ticks, shows the utilization, then waits for the handle.',
        'The move that makes the idea land is stepping the count upward: from 1 to 3 the dotted gaps on the strip are taken by the new process\'s burst, and from 4 to 5 the strip stays full while the Ready-queue ticks jump from 16 to 30.',
        'A code panel titled "Code" shows `cpuUtilization`, the same tick-by-tick loop, in a language the reader adds, with the line of the current step highlighted. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why an operating system keeps many processes in memory at once and needs the idle CPU time of a single I/O-heavy process to be seen being reclaimed by others.',
      'A reader assumes that adding processes always makes the machine do more work; the utilization that stops at 100% while ready-queue time keeps climbing shows where that stops being true.',
    ],

    avoidWhen: [
      'The article is about choosing which ready process runs next. Selection here is a fixed first-come order with no preemption, and the comparison is across process counts, not across policies.',
      'The subject is the full five-state life cycle including creation and termination. Only the ready, running and waiting states cycle here; no process is created or exits.',
      'The point is the time spent saving and restoring state on a switch. Switching is free in this model.',
    ],

    contrastWith: [
      {
        concept: 'stateTransitions',
        note: 'The legal moves between states are a rule about one process on its own. Multiprogramming takes the middle loop of those moves, runs it for several processes at once, and asks how busy that keeps a single processor.',
      },
      {
        concept: 'blockedWaitsEvent',
        note: 'That a sleeper wakes only on its own event is the reason a lone I/O-bound process leaves the processor idle; multiprogramming is the remedy of having someone else ready to run through that gap.',
      },
      {
        concept: 'pcbHoldsState',
        note: 'The kernel\'s per-process record also holds the state and remaining work that change continually while processes run; the resources-given side of that record is a separate concern about cleanup at exit.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'Multiprogramming asks how many processes are worth loading to keep the processor busy; a scheduling policy takes the ready set as given and decides in what order its members get the processor.',
      },
    ],
  },
};
