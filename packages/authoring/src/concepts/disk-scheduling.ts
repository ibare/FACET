/**
 * diskScheduling 개념 선언.
 *
 * canonical facet 은 `facet:diskScheduling` — 교과서 요청 열 98 · 183 · 37 · 122 · 14 · 124 · 65 · 67 을 다섯 정책
 * (FCFS · SSTF · SCAN · LOOK · C-LOOK)이 받는다. 손잡이 둘 — "Policy"(처음 SSTF)와 "Arm start"(53 · 100 · 150, 처음 53).
 * 53 에서는 SSTF 가 236 으로 가장 짧고, 100 · 150 에서는 LOOK 이 가장 짧으며 SSTF 는 셋째로 내려간다. FCFS 는 어디서나
 * 가장 길다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 각각 한 장면이다 — 요청 하나의 시간이 팔이 옮긴 거리를 따른다(`seekDistanceCosts`) · 온 차례와 상관없이 한
 * 방향으로 훑고 돌아선다(`elevatorSweep`). 이쪽은 **정책 다섯의 총 이동 거리를 견주고 시작 자리를 옮겨 순위가 뒤집히는
 * 것**을 맡는다. 그래서 definition 은 five policies · total head movement · ranking · starting cylinder 쪽 낱말을 쥐고,
 * 조각들이 독점한 milliseconds · rotational latency · reverses · newly arrived 를 쓰지 않는다.
 *
 * 전제 (설명 글 `diskScheduling.md` 가 밝힌 것):
 *  - 실린더 0..199, 거리는 번호 차의 절댓값. 훑는 정책의 처음 방향은 위(큰 번호). C-LOOK 의 건너뛰는 거리도 합에 넣었다.
 *  - 세는 것은 실린더 수이지 시간이 아니다. 회전 대기와 새로 들어오는 요청은 없다 — SSTF 의 굶김은 보이지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const diskSchedulingConcept: FacetConceptSource = {
  id: 'diskScheduling',
  label: 'Disk Scheduling (FCFS, SSTF, SCAN, LOOK, C-LOOK)',
  canonicalFacet: 'facet:diskScheduling',

  surface: {
    definition:
      'Disk scheduling policies FCFS, SSTF, SCAN, LOOK and C-LOOK order pending requests to reduce total head movement, and which one moves least can change with the arm\'s starting cylinder.',
    exemplarKeywords: [
      'disk scheduling algorithms',
      'shortest seek time first',
      'SCAN vs LOOK',
      'C-SCAN C-LOOK',
      'total head movement',
      'total seek distance exercise',
      'HDD I/O scheduler',
      'is SSTF optimal',
      'request queue 98 183 37 122 14 124 65 67',
    ],
  },

  briefing: {
    observable: [
      'A cylinder axis from 0 to 199 carries the eight waiting requests 14 · 37 · 65 · 67 · 98 · 122 · 124 · 183 and the arm at its start: "Arm at cylinder 53 · requests waiting: 8". A "Distance moved" readout starts at 0.',
      'Each step moves the arm to the next request of the chosen policy and draws the move, e.g. "Served cylinder 65 · this move: 12". SCAN adds a step "Ran on to end cylinder 199", LOOK and SCAN mark "Turned back", and C-LOOK marks "Jumped to the lowest request". The round ends with "SSTF served all 8 requests · Distance moved: 236".',
      'Below, five bars headed "Distance moved by each policy · start: cylinder 53" give every policy\'s total at once — FCFS 640, SSTF 236, SCAN 331, LOOK 299, C-LOOK 322 — with "◀ shortest" beside the winner.',
      'Moving the start changes the ranking. From 100: FCFS 597, SSTF 307, SCAN 284, LOOK 252, C-LOOK 336. From 150: 647, 305, 234, 202, 312. From 53 SSTF is shortest; from 100 and 150 LOOK is, and SSTF falls to third, behind SCAN too. FCFS is longest from every start.',
      'From 100, SSTF serves 98, 122 and 124, then goes down to 14 and has to climb 169 cylinders back to reach 183.',
      'Distance is counted in cylinders, not time; real seek time is not proportional to distance, and rotation and new arrivals are left out, so SSTF\'s starvation of far requests does not show. The sweeping policies start upward, and C-LOOK\'s jump back is counted in its total, which some textbooks omit.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Policy" (FCFS, SSTF, SCAN, LOOK, C-LOOK; starts at SSTF) and "Arm start" (53, 100, 150; starts at 53). Each round plays the chosen policy\'s moves and waits for the handles.',
        'The move that makes the idea land is changing "Arm start" from 53 to 100 while the bars stay in view: the "shortest" mark leaves SSTF for LOOK.',
        'The code panel, labelled "Total cylinders moved", starts empty with a "+ Add language" button; the chosen language highlights the line of the current move. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article works through the classic disk scheduling exercise and needs the total head movement of each policy on the same request queue.',
      'A reader assumes that always serving the nearest request (SSTF) is optimal, and the article needs a starting position where a sweeping policy moves less.',
    ],

    avoidWhen: [
      'The article is about SSDs or NVMe queues. There is no arm to move on those devices.',
      'The subject is request latency in milliseconds or rotational delay. Only cylinders are counted.',
      'The point is starvation under a stream of new requests. All eight requests are present from the start and no new one arrives.',
    ],

    contrastWith: [
      {
        concept: 'seekDistanceCosts',
        note: 'That each request\'s time grows with the distance the arm travels is why the order matters at all; the policies compete on the sum of those distances.',
      },
      {
        concept: 'elevatorSweep',
        note: 'Sweeping in one direction and turning only when nothing lies ahead is the rule behind SCAN and LOOK; comparing policies asks when that rule beats serving the nearest request.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'CPU scheduling orders jobs by run time to cut waiting; disk scheduling orders requests by position to cut head travel, and the nearest-first choice fails for a different reason, since serving one request moves the arm and changes every distance.',
      },
    ],
  },
};
