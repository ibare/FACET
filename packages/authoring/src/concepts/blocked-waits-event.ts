/**
 * blockedWaitsEvent 개념 선언.
 *
 * canonical facet 은 `facet:blockedWaitsEvent` — 프로세스 셋(편집기 · 복사 · 계산기)과 CPU 하나. 편집기는 틱 1 에
 * 키 입력 줄에, 복사는 틱 3 에 디스크 응답 줄에 잠든다. 디스크 응답은 틱 6 에 와서 복사가 먼저 깨고, 틱 8 · 9 에
 * CPU 가 놀아도 편집기는 잠든 채이다가 틱 10 키 입력에 깬다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `processState` 도 "CPU 가 비어도 제 입출력이 끝나야 깬다" 를 품지만 장치가 프로세스마다 따로라 줄이 없고,
 * 주장은 이용률이다. 이쪽은 **잠든 것을 무엇이 깨우는가** 하나 — 사건마다 따로 선 대기 줄, 깨는 차례는 사건이 오는
 * 차례. 그래서 definition 은 wait queue per event · wakes only when · idle CPU · arrival order 를 독점한다.
 *
 * 전제 (설명 글 `blockedWaitsEvent.md`): 틱 수(디스크 3 틱 · 키 입력 틱 10)는 예로 정한 값. 빼앗기 없음.
 * 일이 없는 틱은 걸음이 되지 않고 CPU 띠의 빈 칸으로만 드러난다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const blockedWaitsEventConcept: FacetConceptSource = {
  id: 'blockedWaitsEvent',
  label: 'A Blocked Process Waits for Its Event',
  canonicalFacet: 'facet:blockedWaitsEvent',

  surface: {
    definition:
      'A blocked process sits in the wait queue of the particular event it needs and wakes only when that event arrives, not when the CPU goes idle, so processes wake in event-arrival order rather than sleep order.',
    exemplarKeywords: [
      'blocked state',
      'wait queue per device',
      'sleeping on I/O',
      'waiting for keyboard input',
      'disk I/O completion wakes process',
      'event queue',
      'sleep and wakeup',
      'does a blocked process use CPU',
      'CPU idle while processes are blocked',
    ],
  },

  briefing: {
    observable: [
      'A CPU strip with ticks 0 to 10 runs across the top. Below are a Ready queue, the CPU, a Finished area, and two separate wait lines, one labelled "Waiting for: Disk reply" and one "Waiting for: Key press", each with an "Arrives:" tag. Three processes: Editor, Copier, Calculator.',
      'At tick 1 the Editor sleeps in the Key press line ("Arrives: tick 10"); at tick 3 the Copier sleeps in the Disk reply line ("Arrives: tick 6") and the Calculator runs.',
      'At tick 6 the disk reply arrives and only that line moves: "Disk reply arrives → Copier wakes. Ticks asleep: 3". The Copier goes to the Ready queue and, with the queue empty, runs in the same tick, while the caption notes "Still asleep: Editor · waiting for: Key press".',
      'At tick 8 the Copier finishes and "The CPU is idle." The Editor does not stir. Ticks 8 and 9 stay unpainted on the CPU strip.',
      'At tick 10 the key press arrives: "Key press arrives → Editor wakes. Ticks asleep: 9 · Editor runs. · CPU idle ticks just before: 2". The Editor slept first and woke last.',
      'Only ticks where something happens become steps; empty ticks show only as blank cells on the strip. Tick counts are example values and nothing is preempted, which the screen does not footnote.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one eventful tick per step, and stops after the Editor finishes at tick 11.',
        'A Replay button and a playback strip sit below it. Holding the tick 8 step shows the idle CPU next to the still-occupied Key press line.',
      ],
    },

    useWhen: [
      'A reader supposes that a sleeping process is woken whenever the processor becomes free; the two idle ticks with the Editor still in its line answer that directly.',
      'The article explains that the kernel keeps a separate wait queue for each device or event and needs a case where the later sleeper wakes first because its event came first.',
    ],

    avoidWhen: [
      'The article is about how many processes are needed to keep the processor busy. There are three fixed processes here and no utilization figure.',
      'The subject is condition variables or semaphores in user programs. The waiting here is on device events inside the kernel model.',
      'The point is interrupt handling or how the device signals completion. Arrival is given as a tick number; the mechanism is not shown.',
    ],

    contrastWith: [
      {
        concept: 'processState',
        note: 'Waking only on one\'s own event explains why a lone I/O-bound process leaves the processor idle; multiprogramming is about filling that idle time with other processes.',
      },
      {
        concept: 'stateTransitions',
        note: 'The transition model says waiting leads only to ready; this adds what triggers that move for a particular sleeper, and that nothing else can.',
      },
      {
        concept: 'waitAndSignal',
        note: 'Both put a thread to sleep until something happens. A device event wakes a kernel-blocked process; a condition variable is woken by another thread\'s signal and the woken thread must recheck its condition.',
      },
    ],
  },
};
