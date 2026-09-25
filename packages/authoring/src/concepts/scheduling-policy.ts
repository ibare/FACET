/**
 * schedulingPolicy 개념 선언.
 *
 * canonical facet 은 `facet:schedulingPolicy` — 같은 일감을 FCFS · SJF · SRTF · MLFQ 네 정책으로 다시 붙인다.
 * 손잡이 둘: 정책(처음 SRTF) · 일감(큰 것 먼저 / 짧은 것이 이어 옴). 판이 바뀌면 앞 판의 CPU 줄이 흐리게 남고,
 * 새 판이 끝날 때 같은 프로세스의 칸이 새 자리로 미끄러진다. 끝나는 틱은 정책과 무관하고(15 · 18), 기다림만
 * 누구에게서 누구에게로 옮겨 간다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 일곱)
 *
 * 조각 일곱은 각각 한 장면이다 — 줄에서 오름(`readyQueuePick`) · 반환의 두 토막(`turnaroundVsWait`) ·
 * 시작점(`firstComeFirstRun`) · 큰 것 뒤의 누적(`convoyEffect`) · 짧은 것 당기기(`shortestFirst`) ·
 * 건너뜀(`starvationOfLong`) · 층 내려앉기(`demoteOnOveruse`). 이쪽은 **정책을 돌려 같은 일감의 기다림이
 * 옮겨 가는 것과, 이기는 정책이 일감에 따라 뒤바뀌는 것**을 쥔다. 그래서 definition 은 네 정책 이름 ·
 * 같은 일감 · 끝나는 틱 고정 · 기다림이 옮겨 감 · 도착 모양이 승자를 정함을 쥐고, 조각들이 독점한 ready queue ·
 * turnaround · starts at the later of · convoy · passed over · demoted 를 쓰지 않는다.
 *
 * 전제 (설명 글 `schedulingPolicy.md` 가 밝힌 것):
 *  - 틱은 모형의 정수 시각. CPU 하나, 입출력 없음, 바꾸는 비용 0. 도착 · 길이는 예로 정한 값.
 *  - 같은 틱의 차례: 끝 → 몫 다 쓴 것이 내려옴 → 도착 → 내려온 것 → 선점 판정 → 고름. 동률은 줄에 먼저 선 것.
 *  - MLFQ 는 층 셋 · 몫 1 · 2 · 4 · 선점 없음 · 끌어올림 없음으로 단순화했다.
 *  - SRTF 는 남은 양을 미리 안다고 친다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이고, 정책마다 다른 것은 `keyOf` 한 함수다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const schedulingPolicyConcept: FacetConceptSource = {
  id: 'schedulingPolicy',
  label: 'CPU Scheduling Policies Compared (FCFS, SJF, SRTF, MLFQ)',
  canonicalFacet: 'facet:schedulingPolicy',

  surface: {
    definition:
      'Replaying one workload under FCFS, SJF, SRTF and MLFQ leaves the final finish time unchanged but moves waiting from some processes onto others, and which policy wins on average wait depends on the arrival pattern.',
    exemplarKeywords: [
      'CPU scheduling algorithms comparison',
      'FCFS vs SJF vs SRTF',
      'which scheduling algorithm is best',
      'average waiting time by policy',
      'preemptive vs non-preemptive SJF',
      'shortest remaining time first',
      'multilevel feedback queue',
      'Gantt chart for several algorithms',
      'no scheduling policy is best for every workload',
      'short-term scheduler policy',
    ],
  },

  briefing: {
    observable: [
      'A CPU row at the top fills with coloured blocks tick by tick, one per process that ran. Below it, one "Ticks waited" bar per process grows while that process is present but not running, and a "Ready queue" strip with a "Finished, in order" strip shows who is lined up and who is done. Each process card reads "Arrive: … · Length: …".',
      'The first round is SRTF on the "Big first" workload: a Big job of length 10 arrives at tick 0 and four short jobs S1–S4 follow at ticks 1–3. Captions read like "Preempted: Big job (9 left) · by S1 (1 left)"; the shorts run first and the Big job waits 5 ticks. The round ends at tick 15 with "Average wait: 1.40".',
      'Changing the policy starts a new round on the same workload. The previous CPU row rises one line and stays faint, labelled "Previous: …", and when the new round ends its blocks slide down to where the same process sits in the new row. Each wait bar keeps the previous length as a dotted line.',
      'On "Big first", FCFS and SJF keep the four shorts waiting until tick 11 (average 7.80 and 7.60); non-preemptive SJF barely helps because the Big job is already running. SRTF moves that waiting onto the Big job alone (1.40), and MLFQ, without knowing lengths, comes close (2.00).',
      'On "Steady shorts" — a Long job of 6 and six shorts of 2 arriving one after another — SJF and SRTF lower the average to 2.43 while the Long job waits 12 ticks. FCFS never starves the Long job but holds every short job 6–7 ticks (5.86). MLFQ, second-best before, is worst here (7.00): a short job of length 2 cannot finish in the top quantum of 1, drops a level and lands behind newcomers.',
      'Under MLFQ the ready queue splits into three levels labelled "Level n · quantum q" (quanta 1, 2, 4), and a process that used its whole quantum drops one level down. Under SRTF a preempted process steps back to the end of the queue.',
      'Whatever the policy, the last finish is the same — tick 15 on "Big first", tick 18 on "Steady shorts" — because the CPU never idles. Only who waits changes. Ticks, lengths and arrival times are example values; the CPU is single, there is no I/O and switching costs nothing. SRTF is assumed to know remaining times in advance, and MLFQ is simplified: three levels, no preemption between levels, no periodic boost to the top.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: "Policy" with FCFS, SJF, SRTF and MLFQ (starting on SRTF), and "Workload" with "Big first" and "Steady shorts" (starting on "Big first"). Moving either starts a new round.',
        'Three readouts under the controls: "Total wait", "Longest wait" and "Switches".',
        'The move that makes the idea land is switching Policy while keeping the workload: the faint previous row and the dotted bar lengths show exactly whose waiting grew and whose shrank. Then switching Workload shows the ranking of policies reversing.',
        'The code panel, labelled "Scheduler", starts empty with a "+ Add language" button. The chosen language shows one scheduler loop in which only the key function `keyOf` differs by policy — queue order, length, remaining time or level. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article compares scheduling algorithms and needs to show that total CPU time is fixed and a policy only chooses whose wait it is, with the same five or seven processes replayed under each.',
      'The article argues that the best policy depends on the workload — for example that MLFQ nearly matches SRTF when one big job arrives first yet does worst when short jobs keep arriving.',
      'A reader wonders why non-preemptive SJF gives almost no gain when the long job is already running, and the article needs SJF and SRTF side by side on the same arrivals.',
    ],

    avoidWhen: [
      'The subject is round-robin time slices, priority numbers with aging, or weighted fair share (CFS). None of those policies is on the Policy handle.',
      'The article is about multiprocessor or real-time scheduling (EDF, rate-monotonic, load balancing across cores). There is one CPU and no deadlines.',
      'The point is I/O-bound versus CPU-bound behaviour or processes blocking for I/O. Nothing here blocks; every process only needs the CPU.',
    ],

    contrastWith: [
      {
        concept: 'readyQueuePick',
        note: 'The ready queue is where waiting processes stand under any policy; a policy is the rule for which one in it goes next, and changing that rule is what moves the waiting around.',
      },
      {
        concept: 'turnaroundVsWait',
        note: 'Turnaround splits into waiting plus the process\'s own run time, and only the waiting part is something a policy can change. Comparing policies is comparing how that waiting part is distributed.',
      },
      {
        concept: 'convoyEffect',
        note: 'The convoy effect is one policy\'s failure on one kind of workload. Setting policies side by side asks which of them hands that accumulated wait to the long job instead.',
      },
      {
        concept: 'shortestFirst',
        note: 'Shortest-first is optimal only when every job is present at once. With staggered arrivals and a long job already running, the gain needs preemption, which is the difference between SJF and SRTF.',
      },
      {
        concept: 'starvationOfLong',
        note: 'Starvation is the cost that a low average wait can hide inside one process. A policy comparison puts that hidden cost next to the policies that avoid it and what they pay instead.',
      },
      {
        concept: 'demoteOnOveruse',
        note: 'Demotion is the mechanism by which a multilevel feedback queue learns which jobs are long. Whether that learning pays off relative to knowing the lengths depends on the workload.',
      },
      {
        concept: 'roundRobinQuantum',
        note: 'Choosing among policies and tuning the time slice of one policy are separate decisions; round robin trades response time against switching overhead rather than moving waiting between short and long jobs.',
      },
      {
        concept: 'processState',
        note: 'Process states say when a process is ready, running or blocked; a scheduling policy only decides among those already ready.',
      },
    ],
  },
};
