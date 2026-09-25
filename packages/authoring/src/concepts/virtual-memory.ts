/**
 * virtualMemory 개념 선언.
 *
 * canonical facet 은 `facet:virtualMemory` — 프레임 12 개를 여러 프로세스가 나눠 쓰며 120 틱을 돈다. 손잡이 둘 —
 * 프로세스 수(1~5, 처음 3) · 작업 집합(3~5, 처음 4). CPU 이용률은 프로세스를 늘리면 오르다가, 작업 집합의 합이 12 를
 * 넘는 자리에서 무너진다(62% → 24%). 무너지는 자리는 작업 집합이 정한다 — 3 이면 다섯째, 4 면 넷째, 5 면 셋째.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * `pageFault` 는 한 접근이 멈췄다 다시 도는 네 걸음, `swapInOut` 은 프로세스가 통째로 오가는 것, `thrashing` 은
 * 밀려난 페이지가 바로 다음 참조에 되불리는 맴돌기 한 판을 쥔다. 이쪽은 **시간 축의 CPU 이용률이 어디서
 * 무너지는가** 를 쥔다. 그래서 definition 은 CPU utilization · processes share · working sets · collapses · disk-bound
 * 를 쓰고, 조각들이 쥔 stops · restarts · swap area · whole process · next reference · every reference faults 를 쓰지 않는다.
 *
 * 전제 (설명 글 `virtualMemory.md`): 프레임 12 · 120 틱 · 입출력 6 틱 · 디스크 4 틱은 예로 정한 값. CPU · 디스크
 * 하나씩, 디스크는 한 번에 한 페이지를 온 차례로. 준비 줄은 온 차례. 교체는 전역 LRU. 이 완제품은 코드 패널이
 * 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const virtualMemoryConcept: FacetConceptSource = {
  id: 'virtualMemory',
  label: 'Virtual Memory and the Thrashing Cliff (CPU Use vs Process Count)',
  canonicalFacet: 'facet:virtualMemory',

  surface: {
    definition:
      'How CPU utilization responds as more processes share a fixed pool of frames: it climbs while their working sets fit together, then collapses to a disk-bound floor once the working sets add up to more than memory.',
    exemplarKeywords: [
      'degree of multiprogramming',
      'CPU utilization vs number of processes',
      'working set model',
      'thrashing curve',
      'when does thrashing start',
      'memory overcommitment',
      'page fault rate and CPU utilization',
      'demand paging performance',
      'load control',
    ],
  },

  briefing: {
    observable: [
      'Two strips span 120 ticks: CPU on top, Disk beneath. A CPU cell is coloured by the process that did useful work in that tick, marked "Fault" if the tick was lost to a page fault, and left blank if the CPU was idle; a Disk cell shows which process\'s page is being loaded.',
      'Twelve frames (0–11) sit in the middle, labelled like "P1·a". Loaded pages rise from the disk into their frame; evicted pages drop back to the disk.',
      'Each step advances 10 ticks, thirteen steps per round. The caption reads, for example, "Ticks: 100–110 · Useful ticks: 66 · Faults: 12 · Evicted: 0 · Disk queue: 0"; the round opens with "Processes: 3 · Working set: 4 · Total: 12 · Frames: 12".',
      'With working set 4 and 3 processes (total exactly 12) the twelve first-touch faults are loaded in the first 50 ticks and no fault follows; the round ends at 74 useful ticks, 62%. With 4 processes (total 16) the disk works 119 of 120 ticks, there are 33 faults and 17 evictions, and CPU use falls to 24%. Five processes stay at 24%.',
      'Below, a curve of "CPU use (%)" against "Processes" 1–5, with a second row giving the "Working set total" for each; totals over 12 are marked in red. For working set 3 the drop comes at the fifth process (73% → 54%), for 4 at the fourth (62% → 24%), for 5 at the third (43% → 24%).',
      'Frames, tick lengths and I/O times are values chosen for illustration. There is one CPU and one disk that loads one page at a time in arrival order; replacement is least-recently-used across all processes. Each process cycles through its pages a, b, c, … and enters 6 ticks of I/O after every two references.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Processes" 1 to 5 (starting at 3) and "Working set" 3 to 5 (starting at 4). Each round plays 120 ticks, then waits.',
        'Three counters: "Useful ticks", "Page faults" and "CPU use (%)".',
        'The move that makes the idea land is raising Processes from 3 to 4 at working set 4: the CPU strip fills with lost and idle ticks while the disk strip goes solid, and the curve drops from 62% to 24%. Changing the working set moves the point of collapse sideways.',
      ],
    },

    useWhen: [
      'The article argues that adding processes to keep the CPU busy backfires, and needs the curve that rises and then falls with the exact point where total working sets pass the frame count.',
      'A reader wants to see thrashing as a system-wide throughput problem — CPU idle, disk saturated — rather than as the fate of a single page.',
    ],

    avoidWhen: [
      'The article explains what happens on a single page fault, step by step. Faults here are ticks on a strip, not a walkthrough.',
      'The subject is choosing which page to evict. One fixed policy is used; the policy is not the variable.',
      'The point is address translation, page tables or the TLB. No address is shown.',
      'The subject is swapping whole processes out to disk. Processes here stay resident and only pages move.',
    ],

    contrastWith: [
      {
        concept: 'thrashing',
        note: 'The mechanism of thrashing is that each page pushed out is needed again at once. The system-level claim is where that begins — the working sets\' total against the frame count — and what it costs in CPU use.',
      },
      {
        concept: 'pageFault',
        note: 'A single fault stops one access until the page arrives. Many processes faulting at once turn those individual waits into a queue at one disk, and that queue is what caps CPU use.',
      },
      {
        concept: 'swapInOut',
        note: 'Moving a whole process out to disk lowers the number competing for frames; that is the remedy an operating system applies when the multiprogramming level is past the collapse.',
      },
      {
        concept: 'pageReplacement',
        note: 'The eviction rule decides which page leaves when memory is full. Once working sets add up to more than memory, no choice of rule rescues the system; how many processes compete is what decides.',
      },
    ],
  },
};
