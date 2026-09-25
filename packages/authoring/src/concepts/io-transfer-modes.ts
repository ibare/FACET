/**
 * ioTransferModes 개념 선언.
 *
 * canonical facet 은 `facet:ioTransferModes` — 같은 낱말들을 폴링 · 인터럽트 · DMA 세 줄이 받는다. 손잡이 둘
 * "Words"(1 · 2 · 4 · 8, 처음 2)와 "Ticks per word"(1 · 2 · 4 · 8, 처음 2)가 CPU 가 잃은 틱을 정한다 — 폴링 낱말 × d,
 * 인터럽트 낱말 × 3, DMA 2 + 3 = 5. 4 × 4 평면에서 폴링 다섯 칸 · 인터럽트 두 칸 · DMA 아홉 칸이 이기고 비기는 칸은 없다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — CPU 를 거치지 않는 옮기기(`transferWithoutCpu`) · 명령 경계에서 끼어들었다 돌아오기
 * (`interruptPreempts`) · 한 장치를 두고 묻기와 불리기(`pollingVsInterrupt`). 이쪽은 세 방식을 **장치 빠르기와 옮길 양으로
 * 펼친 평면 위에서 견주는 것**만 쥔다. 그래서 definition 은 fewest CPU cycles · device speed · transfer size · each wins a
 * region 쪽 낱말을 쥐고, 조각들이 독점한 instruction boundary · return address · controller counts down · same moment 를
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `ioTransferModes.md` 가 밝힌 것): 틱은 예로 정한 단위, 처리기 3 틱 · DMA 준비 2 틱도 예로 정한 값이라
 * 구역 경계는 이 값에 걸려 있다. DMA 가 메모리 통로를 CPU 와 나눠 쓰는 일(사이클 훔치기)은 넣지 않았다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ioTransferModesConcept: FacetConceptSource = {
  id: 'ioTransferModes',
  label: 'I/O Transfer Modes (Polling vs Interrupts vs DMA)',
  canonicalFacet: 'facet:ioTransferModes',

  surface: {
    definition:
      'Which of polling, interrupt-driven I/O and DMA costs the CPU the fewest cycles depends on device speed and transfer size: polling wins fast short transfers, interrupts slow single words, DMA large transfers.',
    exemplarKeywords: [
      'programmed I/O vs interrupt vs DMA',
      'I/O techniques comparison',
      'CPU overhead of I/O',
      'when is polling better than interrupts',
      'when to use DMA',
      'interrupt overhead per byte',
      'I/O methods trade-off',
      'CPU cycles lost to I/O',
      'device driver I/O strategy',
    ],
  },

  briefing: {
    observable: [
      'Three bars, "Polling", "Interrupt" and "DMA", sit under the title "Ticks the CPU lost", each with a "Lost ticks" count. A dashed outline marks where each bar will end this round. Each bar states its rule: "Each word: asks for 2 ticks", "Each word: handler 3 ticks", "Setup 2 ticks · completion handler 3 ticks".',
      'A round steps through "DMA setup" (DMA +2), then one step per word — "Polling asks until the word is ready · interrupt runs the handler · DMA: the controller moves it" — adding d to polling, 3 to interrupt and nothing to DMA, and ends with "DMA completion interrupt" (DMA +3).',
      'With 2 words at 2 ticks per word the round ends at polling 4, interrupt 6, DMA 5, and the polling bar is tagged "least lost". Readouts under the controls repeat the three totals.',
      'A 4 × 4 map, "Least-losing mode", has "Words" on one axis and "Ticks per word" on the other, each cell coloured by the winner, with a mark on the current cell. Polling wins five cells (few words, fast device), interrupt two (one word from a slow device), DMA nine (many words); no cell is a tie, and with a single word DMA is sometimes the most expensive.',
      'The polling bar follows both handles, the interrupt bar follows only the number of words, and the DMA bar stays at 5 whatever the handles say.',
      'Ticks are an example unit, and the 3-tick handler and 2-tick DMA setup are example values; the boundaries between regions move if they change, while the three-region shape stays. The time for the device to produce all words is the same in every mode, and DMA competing with the CPU for the memory bus is left out.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles, "Words" and "Ticks per word", each with positions 1 · 2 · 4 · 8, both starting at 2. Each round plays setup, the words and the DMA completion, then waits for the handles.',
        'The move that makes the idea land is walking the current-cell mark across the map: raise ticks per word with one word and the winner goes from polling to interrupt; raise the number of words and DMA takes over.',
      ],
    },

    useWhen: [
      'The article compares polling, interrupts and DMA and needs to show that none of them always wins: which one wastes least CPU time depends on how fast the device is and how much is moved.',
      'A reader believes interrupts are always better than polling or DMA always best, and the article needs the cells where each of those beliefs fails.',
    ],

    avoidWhen: [
      'The article is about how a single interrupt is taken and returned from. Handlers here are counted in ticks, not stepped through.',
      'The subject is completion time or I/O throughput. The device takes the same time in every mode; only lost CPU ticks differ.',
      'The point is DMA bus contention, scatter-gather or IOMMUs. None are modelled.',
    ],

    contrastWith: [
      {
        concept: 'transferWithoutCpu',
        note: 'Handing the copying to a controller is what makes DMA\'s cost flat; the comparison asks at what transfer size that fixed setup-and-completion price becomes the cheapest option.',
      },
      {
        concept: 'interruptPreempts',
        note: 'How a device call is taken at an instruction boundary and returned from is one mechanism; the comparison prices each such call as a fixed handler cost per word and weighed against the other modes.',
      },
      {
        concept: 'pollingVsInterrupt',
        note: 'For one device with one ready time, polling and interrupts deliver the data at the same moment and differ in what the CPU did meanwhile; across device speeds and numbers of words the same difference becomes a winner that changes.',
      },
    ],
  },
};
