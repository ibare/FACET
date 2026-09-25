/**
 * roundRobinQuantum 개념 선언.
 *
 * canonical facet 은 `facet:roundRobinQuantum` — 프로세스 넷(A 0·5 · B 0·4 · C 1·2 · D 2·1)을 라운드 로빈으로 돌린다.
 * 손잡이 둘: 몫 1 ~ 5(처음 2) · 바꾸는 비용 0 / 1 틱(처음 0). 몫을 키우면 토막이 합쳐지고 줄이면 쪼개지며,
 * 비용 1 이면 바뀔 때마다 회색 틈이 끼어 끝이 23 · 18 · 17 · 16 · 15 로 밀린다. 몫 5 는 FCFS 와 같다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `timeSliceRotate` 는 몫을 다 쓴 것이 줄 끝으로 돌아가는 한 장면, `quantumSizeTradeoff` 는 몫 1 · 4 두 판을
 * 비용 없이 나란히 세어 보는 한 장면이다. 이쪽은 **몫의 사다리 전체를 쓸고, 바꾸는 비용이 그 저울을 끝 시각으로
 * 옮기는 것, 가장 긴 일에 닿으면 FCFS 로 무너지는 것**을 쥔다. 그래서 definition 은 sweep · overhead · finish
 * later · degenerates into FCFS 쪽 낱말을 쥐고, 조각들이 독점한 back of the queue · side by side · first turn 을
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `roundRobinQuantum.md` 가 밝힌 것):
 *  - 틱은 모형의 정수 시각. CPU 하나, 입출력 없음. 도착 · 길이는 예로 정한 값.
 *  - 바꾸는 비용 1 틱은 보이도록 키운 값이다 — 실제 문맥 교환은 마이크로초, 몫은 밀리초 단위다.
 *  - 첫 오름 · 줄이 비어 같은 것이 다시 오르는 것은 바뀜이 아니다. 바꾸는 중인 틱은 대기로 세되 첫 응답에는 세지 않는다.
 *  - 같은 틱의 차례: 끝 → 몫 다 쓴 것이 내려옴 → 도착이 줄 끝 → 내려온 것이 그 뒤.
 *  - 평균 반환은 몫에 따라 오르내려 주장하지 않는다.
 *  - 코드 패널은 IR 하나(`roundRobin`)를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const roundRobinQuantumConcept: FacetConceptSource = {
  id: 'roundRobinQuantum',
  label: 'Round Robin Time Quantum and Switch Overhead',
  canonicalFacet: 'facet:roundRobinQuantum',

  surface: {
    definition:
      'Sweeping the round-robin quantum from one tick to the longest job\'s length trades responsiveness against switching overhead; once each switch costs time, small quanta finish everything later, and the largest collapses into FCFS.',
    exemplarKeywords: [
      'how to choose the time quantum',
      'time quantum too small',
      'time quantum too large becomes FCFS',
      'context switch overhead in round robin',
      'round robin scheduling example',
      'response time vs throughput',
      'scheduling overhead',
      'Linux timeslice length',
      'interactive vs batch workloads',
      'round robin Gantt chart',
    ],
  },

  briefing: {
    observable: [
      'Each process — A (arrives 0, length 5), B (0, 4), C (1, 2), D (2, 1) — has its own horizontal lane labelled "Length: …", and the blocks it ran are laid on that lane along a tick axis. How many blocks a lane breaks into is how many times that process used up its slice and went to the back.',
      'A thin bar under each lane runs from arrival to the first tick it actually ran ("Arrival to first run"), and a "Response: …" tag appears when it starts. A grey band across all lanes marks a "Switching tick".',
      'Captions narrate the boundary events: "Arrived: C", "Slice used up, to the back: A (left: 3)", "Switched to: B", "Finished: B". The round closes with "Avg first response: …", "Switches: …" and "Done at tick …", and an "End: …" mark sits at the finish.',
      'With switch cost 0, moving the slice from 1 to 5 takes switches from 11 down to 3 and average first response from 1.00 up to 5.50, while the end stays at tick 12 for every slice — without a cost, the slice only reorders the work.',
      'With switch cost 1, every switch inserts a grey tick and pushes the blocks after it to the right; the end moves to 23, 18, 17, 16 and 15 for slices 1 to 5, and average first response becomes 2.75 up to 7.00.',
      'At slice 5, the length of the longest job, nothing ever returns to the back of the line, and the schedule is the same as first-come first-served.',
      'When the handle moves, the previous round\'s blocks stay faint and each new block pulls the matching old one into its new place and width, so blocks visibly merge as the slice grows and split as it shrinks; the old end mark stays as "Previous end: …".',
      'Ticks and lengths are example values; one CPU, no I/O. The 1-tick switch cost is enlarged to be visible — real context switches take microseconds against millisecond slices. Switching ticks count as waiting but not toward first response, and the first dispatch or a process re-running on an empty queue is not a switch.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: "Time slice" with 1 to 5 (starting at 2) and "Switch cost" with 0 or 1 (starting at 0). A new round plays each time either moves; the default round is twelve steps.',
        'Three readouts: "Switches", "Switching ticks" and "First response total".',
        'The move that makes the idea land is setting Switch cost to 1 and then stepping the slice down from 5 to 1: the grey bands multiply and the End mark slides right each time, while first response keeps improving.',
        'The code panel, labelled "Round robin", starts empty with a "+ Add language" button; the chosen language shows a `roundRobin` function taking the slice and the cost, and carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article must explain why the quantum cannot simply be made as small as possible: responsiveness improves, but once a switch costs anything, the switches themselves push every completion later.',
      'The article states that round robin with a very large quantum is just FCFS and wants the exact slice at which that happens for a concrete set of jobs.',
      'A reader needs to see that without switching overhead the quantum changes only the order of work, not when the last job ends.',
    ],

    avoidWhen: [
      'The article is about what the switch itself saves and restores (registers, PCB) or about cache and TLB effects after a switch. The cost here is a flat tick, with no state or cache drawn.',
      'The subject is priority, aging or weighted shares. Every process here is treated alike and only the slice differs.',
      'The claim concerns average turnaround improving or worsening with the slice. Here it rises and falls irregularly with the slice and is not what the screen argues.',
    ],

    contrastWith: [
      {
        concept: 'timeSliceRotate',
        note: 'Returning to the back of the queue is the rule of round robin. Tuning the slice asks how often that rule should fire, given that each firing may cost time.',
      },
      {
        concept: 'quantumSizeTradeoff',
        note: 'Two fixed slices with free switching isolate the trade between switch count and first response. Adding a per-switch cost turns that count into delay for everyone, and somewhere along the range of slice sizes round robin stops being round robin.',
      },
      {
        concept: 'switchCosts',
        note: 'A flat charge per switch is the direct cost of switching. The indirect cost of a switch — caches and translations that must refill afterwards — is a separate price that is not a fixed number of ticks.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'Comparing policies asks whose waiting grows when the rule changes; the quantum question stays within one fair rule and weighs early response against overhead.',
      },
    ],
  },
};
