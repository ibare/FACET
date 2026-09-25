/**
 * transferWithoutCpu 개념 선언.
 *
 * canonical facet 은 `facet:transferWithoutCpu` — CPU 가 DMA 제어기에 주소 200 · 개수 6 · 방향을 적고 나면, 제어기가 장치의
 * 낱말 여섯(17 · 42 · 8 · 91 · 33 · 60)을 메모리 200~205 로 하나씩 옮기며 주소를 올리고 개수를 줄인다. 같은 틱에 CPU 는 제
 * 일(3 · 1 · 4 · 1 · 5 · 9 더하기)을 해 합이 23 이 된다. 개수가 0 이 되면 한 번 부른다. 열 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ioTransferModes` 는 세 방식의 잃은 틱을 평면에서 견준다. 이쪽은 DMA 한 판의 **안쪽** — 옮기는 동안 CPU 가 제
 * 일을 한다는 것 하나다. 그래서 definition 은 controller · address · count · direction · words never pass through the CPU ·
 * single interrupt 쪽 낱말을 쥐고, polling · fewest cycles · device speed 를 쓰지 않는다.
 *
 * 전제: 틱은 예로 정한 단위(낱말 하나 옮기기 1 틱 · CPU 덧셈 1 틱). 버스 다툼(사이클 훔치기)은 두지 않았다 — CPU 는
 * 캐시 안에서 일한다고 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const transferWithoutCpuConcept: FacetConceptSource = {
  id: 'transferWithoutCpu',
  label: 'DMA (Moving Data Without the CPU)',
  canonicalFacet: 'facet:transferWithoutCpu',

  surface: {
    definition:
      'With DMA the CPU only programs a controller with an address, a count and a direction; the controller copies each word into memory itself while the CPU keeps working, then raises one interrupt when the count hits zero.',
    exemplarKeywords: [
      'direct memory access',
      'DMA controller',
      'bus mastering',
      'DMA transfer complete interrupt',
      'offloading data copies from the CPU',
      'cycle stealing',
      'disk and network card transfers to RAM',
      'DMA address and count registers',
      'zero-copy',
    ],
  },

  briefing: {
    observable: [
      'Four parts sit on screen: a "Device buffer" holding 17 · 42 · 8 · 91 · 33 · 60, "Memory" addresses 200 to 205, a "DMA controller" with Address, Count and Direction all blank, and a "CPU" with its "Own work" list 3 · 1 · 4 · 1 · 5 · 9 and a "Sum" of 0.',
      'Step 1: "CPU writes to the controller — address 200 · count 6"; the controller now reads Address 200, Count 6, Direction device → memory.',
      'Each of the next six steps is one tick in which two things happen: "Word 17 → memory 200 · meanwhile CPU sum: 3". The controller\'s address goes up by one and its count down by one, and the word travels through the controller, not through the CPU. The sum grows 3 · 4 · 8 · 9 · 14 · 23.',
      'When the count reaches 0: "Count: 0 — the controller calls the CPU", and finally "CPU takes the call — words moved: 6 · calls: 1". The CPU touched the transfer twice, to program it and to take the call; no word passed through it. Ten steps in all, counting the start.',
      'A tick is an example unit (one word moved or one addition per tick), not real nanoseconds. On real hardware the controller and CPU share the memory bus and one may wait for the other; here the CPU is assumed to work from its cache, so both advance every tick without conflict.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten steps by itself — programming, six moves, the call and its acknowledgement — and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip through the move steps shows memory filling and the CPU sum rising in the same ticks.',
        'All values are fixed, so an article can quote each address, count and sum exactly.',
      ],
    },

    useWhen: [
      'The article introduces DMA and needs the essential picture: the CPU writes three values, a controller counts down on its own, and the CPU is interrupted only once.',
      'A reader asks what the CPU is doing while data arrives from disk or network, and the article wants a running sum that keeps growing during the transfer as the answer.',
    ],

    avoidWhen: [
      'The article compares polling, interrupts and DMA by cost. Only DMA is shown, with no alternative beside it.',
      'The subject is memory-bus contention, cache coherence with DMA, or IOMMU protection. The model removes all of these.',
      'The point is scatter-gather lists or chained descriptors. There is one contiguous transfer.',
    ],

    contrastWith: [
      {
        concept: 'ioTransferModes',
        note: 'A fixed setup and one completion call is what DMA costs; whether that beats per-word interrupts or polling depends on the number of words and the device speed.',
      },
      {
        concept: 'interruptPreempts',
        note: 'The single call at the end is an ordinary interrupt; DMA\'s point is that there is only one for the whole transfer instead of one per word.',
      },
      {
        concept: 'pollingVsInterrupt',
        note: 'Polling and interrupts are two ways for the CPU to wait for data it will copy itself; DMA removes the CPU from the copying altogether.',
      },
    ],
  },
};
