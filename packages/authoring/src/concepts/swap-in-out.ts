/**
 * swapInOut 개념 선언.
 *
 * canonical facet 은 `facet:swapInOut` — 12 KiB 사용자 메모리의 자리 셋이 P1(실행) · P2(기다림) · P3(준비)로 차 있다.
 * P4 가 오자 기다리는 P2 가 통째로 디스크의 스왑 자리로 내려가고 P4 가 자리 1 로 올라온다. P2 의 입출력이 끝나고
 * P1 이 끝나 자리 0 이 비자 P2 가 **처음과 다른 자리** 0 으로 올라온다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `virtualMemory`(완제품)는 프로세스 수를 돌려 CPU 이용률이 무너지는 자리를 쥐고, 형제 `pageFault` 는 페이지 하나가
 * 접근 때 올라오는 네 걸음, `thrashing` 은 페이지가 맴도는 것을 쥔다. 이쪽은 **프로세스 단위로 통째** 오가고,
 * **누구를** 내리는지는 상태(기다림)가 정하고, 돌아올 때 **자리가 바뀐다** 를 쥔다. definition 은 whole ·
 * blocked · swap area · different location 을 독점하고 page · frame · fault 를 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 프로세스는 통째로 오간다. 빈 자리는 번호 낮은 것부터, 디스크에서 준비된 프로세스가
 * 막 도착한 것보다 먼저 올라온다. P1 이 끝난 뒤 누가 실행될지는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const swapInOutConcept: FacetConceptSource = {
  id: 'swapInOut',
  label: 'Swapping a Whole Process Out and Back In',
  canonicalFacet: 'facet:swapInOut',

  surface: {
    definition:
      'When memory is full and a new process arrives, a whole process that is blocked waiting is moved out to the swap area on disk, and later brought back in, possibly at a different location than before.',
    exemplarKeywords: [
      'swapping',
      'swap out and swap in',
      'swap space',
      'medium-term scheduler',
      'suspended process',
      'which process to swap out',
      'relocation after swap-in',
      'backing store',
    ],
  },

  briefing: {
    observable: [
      'Memory has three slots, labelled "Slot 0: 0–4 KiB", "Slot 1: 4–8 KiB" and "Slot 2: 8–12 KiB", beside a "New" arrival area and a "Disk — swap area". At the start P1 is running in slot 0, P2 is waiting in slot 1, P3 is ready in slot 2: "Memory slots in use: 3 / 3".',
      '"P4 arrives, ready to run. Free slots: 0" — P4 waits in the New area.',
      '"P2 is waiting, so it goes down to disk whole. Freed: slot 1" — the entire process moves to the swap area, and a "Went down: P2" marker keeps its old slot in view. Then "P4 comes up into slot 1".',
      '"P2 finishes its I/O and is ready, but it is still on disk" — its state changes to ready while it stays on the disk.',
      '"P1 finishes and leaves. Freed: slot 0", then "P2 comes back up from disk into slot 0. It went down from slot 1". The run ends with P2 in slot 0, P4 in slot 1, P3 in slot 2 and the swap area empty.',
      'The values are chosen for illustration. Processes move whole; moving individual pages on demand is a different mechanism. Empty slots fill lowest first, and a ready process on disk is brought in before a newly arriving one. Who runs after P1 leaves is not shown — every process in memory stays ready.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops once P2 is back in memory — seven steps including the start.',
        'A Replay button and a playback strip sit below it. Setting the strip at the swap-out step and then at the final step puts P2\'s old and new slots side by side.',
        'The sequence is fixed, so an article can quote each state change and slot number.',
      ],
    },

    useWhen: [
      'The article explains how an operating system makes room for a new process when memory is full, and needs to show why the blocked process, not the running or ready ones, is the one sent out.',
      'A reader needs to see why swapped-out code cannot rely on fixed physical addresses: the process comes back into a different slot than the one it left.',
    ],

    avoidWhen: [
      'The article is about demand paging or page faults, where single pages are loaded when touched. Here processes move whole.',
      'The subject is the swap partition or swap file on a modern Linux system under memory pressure, which pages individual pages out. This is whole-process swapping.',
      'The point is CPU scheduling order. Which process runs next is not shown.',
    ],

    contrastWith: [
      {
        concept: 'pageFault',
        note: 'A fault loads one page because an access touched it. Swapping moves a whole process because of its state, whether or not any access asked for it.',
      },
      {
        concept: 'virtualMemory',
        note: 'Sending whole processes out reduces how many compete for frames. The reason that matters — CPU use collapses once working sets exceed memory — is the system-level claim this remedy answers.',
      },
      {
        concept: 'blockedWaitsEvent',
        note: 'A blocked process waits for an event and cannot use the CPU until it arrives. That makes it the natural one to move out of memory, since it would not run in the meantime anyway.',
      },
    ],
  },
};
