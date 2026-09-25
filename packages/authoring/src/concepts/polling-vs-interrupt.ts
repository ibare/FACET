/**
 * pollingVsInterrupt 개념 선언.
 *
 * canonical facet 은 `facet:pollingVsInterrupt` — 같은 장치 · 같은 준비 시각(틱 7)을 두고 두 CPU 가 나란히 틱을 쓴다. 폴링
 * CPU 에는 "No" 가 일곱 번 쌓이고 틱 7 에 "Yes", 인터럽트 CPU 에는 딴 일이 일곱 틱 쌓이고 틱 7 에 처리기로 들어간다. 둘 다
 * 틱 8 에 데이터를 받아 t = 9 에 끝난다. 손잡이 없이 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ioTransferModes` 는 장치 빠르기와 낱말 수로 펼친 평면에서 세 방식의 비용을 견준다. 이쪽은 **장치 하나 · 준비 시각
 * 하나**를 두고 두 CPU 의 기다림을 한 틱씩 쌓는 장면이다 — 받는 때는 같고, 그 앞에 쌓인 것이 다르다. 그래서 definition 은
 * busy-waiting · asking repeatedly · other work until signalled · same moment 쪽 낱말을 쥐고, DMA · fewest cycles · region 을
 * 쓰지 않는다.
 *
 * 전제: 틱은 예로 정한 단위(묻기 · 딴 일 · 들어가기 · 받아 가기 각 한 틱). 딴 일이 한 틱 단위라 준비 틱이 곧 명령 경계다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pollingVsInterruptConcept: FacetConceptSource = {
  id: 'pollingVsInterrupt',
  label: 'Polling vs Interrupt (Waiting for One Device)',
  canonicalFacet: 'facet:pollingVsInterrupt',

  surface: {
    definition:
      'A CPU waiting on a device can keep asking whether it is ready or do other work until the device signals; both take the data at the same moment and differ in what filled the wait.',
    exemplarKeywords: [
      'busy waiting',
      'polling loop',
      'status register check',
      'spin until ready',
      'interrupt-driven I/O',
      'wasted CPU time while waiting',
      'is the device ready',
      'polling vs interrupt driven',
      'event notification vs checking',
    ],
  },

  briefing: {
    observable: [
      'Two columns, "Polling CPU" and "Interrupt CPU", stand on either side of a shared "Device" that reads "Working…". Counters "Asks" and "Other work" start at 0: "The device starts working. Neither CPU knows when it will be ready."',
      'Each step is one tick and adds one cell to both columns at the same height. From tick 0 to 6: "Not ready: polling hears no, the interrupt CPU does other work." — "No" stacks on the left, "Other work" on the right.',
      'At tick 7 the device turns "Ready": "Ready: polling hears yes, the interrupt CPU is called in." The left column gets "Yes", the right "Enter handler".',
      'At tick 8 both columns show "Take data" and the screen ends with "Polling done: t = 9 · Interrupt done: t = 9". The counters stand at Asks 8 and Other work 7.',
      'Neither CPU gets the data sooner; what differs is the stack below it: eight asks against seven ticks of other work plus one tick of entering the handler. That entry tick is the interrupt\'s own cost, which for a device that is ready almost at once can exceed a few asks.',
      'A tick is an example unit; one ask, one tick of other work, entering the handler and taking the data each take one. The interrupt is taken at an instruction boundary, and since other work comes in one-tick pieces here, the ready tick is a boundary.',
    ],

    screen: {
      affordances: [
        'The screen plays ten steps by itself, one tick per step, and stops at t = 9. There is no handle.',
        'A Replay button and a playback strip sit below it. Dragging the strip to tick 7 lines up "Yes" and "Enter handler" at the same height.',
        'The ready tick is fixed at 7, so an article can quote every count exactly.',
      ],
    },

    useWhen: [
      'The article introduces the two ways a CPU can wait for a device and needs them run against the same device, so that the only visible difference is what the CPU did while waiting.',
      'A reader thinks interrupts deliver data faster than polling, and the article needs both columns finishing at t = 9.',
    ],

    avoidWhen: [
      'The article is about DMA or about which mode is cheapest over many transfers. One device and one ready time are shown, with no DMA.',
      'The subject is the details of taking an interrupt, such as saving a return point. Entering the handler is a single tick here.',
      'The point is spinlocks between threads. The waiting here is on a device, not on another thread.',
    ],

    contrastWith: [
      {
        concept: 'ioTransferModes',
        note: 'For one device with one ready time the two ways of waiting finish together; once device speed and the number of words vary, the same difference picks a cheapest mode, and DMA joins the choice.',
      },
      {
        concept: 'interruptPreempts',
        note: 'Being called in is a single event in the wait; what happens inside that step, the boundary, the saved return point and the handler, is its own mechanism.',
      },
    ],
  },
};
