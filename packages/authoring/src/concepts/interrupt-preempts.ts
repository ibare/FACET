/**
 * interruptPreempts 개념 선언.
 *
 * canonical facet 은 `facet:interruptPreempts` — 여섯 명령짜리 프로그램이 도는 중 키보드가 시각 2.5 에 부른다. 셋째 명령은
 * 끝까지 가고, 시각 3 의 경계에서 부름을 받아 돌아올 자리 4 를 적고 처리기 세 명령(Read from device · Put in buffer ·
 * Return)을 돈 뒤 넷째 명령으로 돌아온다. 프로그램은 6 대신 9 에 끝난다. 열두 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `pollingVsInterrupt` 는 기다리는 두 길의 견줌, `transferWithoutCpu` 는 DMA, 완제품 `ioTransferModes` 는 비용 평면이다. 이쪽은
 * 인터럽트 한 번의 **흐름** — 언제 멈추고(명령 경계) · 무엇을 적고(돌아올 자리) · 어디로 돌아오는가 하나다. 그래서
 * definition 은 instruction boundary · saves the return address · handler · resumes · delayed by 쪽 낱말을 쥔다.
 * `contextSwitching`(나 묶음)과는 "적어 두고 돌아온다" 가 겹치므로 register set · another process 를 쓰지 않는다.
 *
 * 전제: 틱은 예로 정한 단위(명령 하나 1 틱). 적는 것은 돌아올 자리 하나로 줄였다. 부름이 온 때와 받은 때의 0.5 틱 차이는
 * 셋째 명령의 남은 몫이라 프로그램을 따로 늦추지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const interruptPreemptsConcept: FacetConceptSource = {
  id: 'interruptPreempts',
  label: 'Interrupt Handling (Step Out, Then Come Back)',
  canonicalFacet: 'facet:interruptPreempts',

  surface: {
    definition:
      'A hardware interrupt is taken only at the next instruction boundary: the CPU saves the address of the next instruction, runs the handler, then resumes there, so the program finishes later by the handler\'s length.',
    exemplarKeywords: [
      'interrupt handler',
      'interrupt service routine',
      'ISR',
      'IRQ',
      'return address saved on interrupt',
      'interrupt latency',
      'keyboard interrupt',
      'interrupts checked between instructions',
      'return from interrupt',
      'hardware interrupt flow',
    ],
  },

  briefing: {
    observable: [
      'A "Program" of six numbered instructions runs beside a "Handler" of three — "Read from device", "Put in buffer", "Return" — with a "Keyboard" and a "Return point" box. A "Time" readout starts at 0: "Instructions in the program: 6. No call yet."',
      'Instructions 1 and 2 run one tick each. During the third, "Keyboard calls at time 2.5; the instruction keeps going." — the call mark appears, but instruction 3 finishes.',
      'At the boundary: "Boundary at time 3: the call is taken. Return point saved: 4", with "Called: 2.5 · taken: 3 · waited: 0.5".',
      'The three handler instructions run from time 3 to 6. Then "Time 6: the handler is done. Back to the saved point: 4", and instructions 4, 5 and 6 run to time 9.',
      'The final card reads "Program ends at: 9 · without the call: 6 · later by: 3" — exactly the handler\'s three instructions. The 0.5 tick between the call and the boundary was the rest of instruction 3 and adds nothing.',
      'A tick is an example unit, one instruction each. The only thing saved is the return point, and control comes back to the same program; saving and loading a whole register set to switch to another process is a different operation.',
    ],

    screen: {
      affordances: [
        'The screen plays twelve steps by itself, from the start through the call, the handler and the return, and stops after instruction 6.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the boundary step shows the call time and the taken time side by side.',
        'Times and instruction names are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article walks through what the CPU does when a device interrupts: finish the current instruction, remember where to come back, run the handler, return.',
      'A reader asks why an interrupt is not handled the instant it arrives, and the article needs the gap between "called at 2.5" and "taken at 3".',
    ],

    avoidWhen: [
      'The article is about switching between processes or threads. Control returns to the same program and only one return point is saved.',
      'The subject is interrupt priorities, nesting or masking. There is a single interrupt.',
      'The point is comparing interrupts with polling or DMA. Only one interrupt flow is shown.',
    ],

    contrastWith: [
      {
        concept: 'contextSwitching',
        note: 'Both save something and come back later. An interrupt saves only where to resume the same program, while a context switch saves an entire register set so a different flow can run.',
      },
      {
        concept: 'pollingVsInterrupt',
        note: 'Choosing to be called rather than to keep asking is a decision about waiting; how the call is actually taken, at a boundary and back to a saved point, is the mechanism beneath that choice.',
      },
      {
        concept: 'transferWithoutCpu',
        note: 'DMA ends with one interrupt of exactly this kind; its gain is in needing only one for a whole transfer.',
      },
      {
        concept: 'ioTransferModes',
        note: 'A handler\'s length is the delay one interrupt causes; priced per word and compared with polling and DMA, it becomes one of three costs.',
      },
    ],
  },
};
