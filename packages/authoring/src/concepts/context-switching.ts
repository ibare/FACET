/**
 * contextSwitching 개념 선언.
 *
 * canonical facet 은 `facet:contextSwitching` — 단일 CPU 무대 + 좌우 보관소 +
 * 천장에서 내려오는 트리거 + 시간 띠.
 *
 * reactive 지만 재생/단계 컨트롤을 갖는다. 프로세스/스레드 모드 전환으로 보관소
 * 두께가 달라지는 것이 오버헤드 차이를 드러내는 장치.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const contextSwitchingConcept: FacetConceptSource = {
  id: 'contextSwitching',
  label: 'Context Switching',
  domain: 'os',
  canonicalFacet: 'facet:contextSwitching',

  surface: {
    definition:
      'Saving one execution flow\'s register state and restoring another\'s on the same processor, so each resumes exactly where it left off.',
    exemplarKeywords: [
      'context switch',
      'process control block',
      'register save and restore',
      'preemption',
      'scheduler',
      'time slice',
      'switching overhead',
      'thread versus process',
      'concurrency on one core',
      'interrupt handling',
    ],
  },

  briefing: {
    observable: [
      'There is exactly one stage and it holds one flow at a time — concurrency on a single core is shown as alternation, never as simultaneity.',
      'A trigger descends from the ceiling to stop the running flow. It comes from outside rather than from the flow itself, which is what makes preemption involuntary.',
      'The register bundle is lifted out into its own holder and the other flow\'s bundle is placed back into the same slots — two distinct motions, so saving and restoring are not conflated.',
      'Between the two motions the stage sits empty and nobody makes progress. That gap is the overhead, drawn as time rather than described as a cost.',
      'The time strip below records the whole run: colour where a flow advanced, grey hatching where the stage was empty. The hatching accumulates.',
      'Switching between process and thread mode changes how thick the holders are — a thread switch carries less across, and the strip\'s hatching shortens accordingly.',
      'Four trigger kinds are selectable: timer, system call, I/O completion, interrupt.',
    ],

    screen: {
      affordances: [
        'Playback controls: play, single step, pause, reset. Stepping is how to separate the save from the restore.',
        'Mode toggles between thread and process. Running the same sequence in both modes and comparing the grey hatching is the argument about overhead, made by the screen instead of by prose.',
        'The trigger kind can be changed, which is how to show that the switch mechanism is the same regardless of what caused it.',
      ],
    },

    useWhen: [
      'The prose says a switch "costs something" and the reader hears it as vague. Watching the registers be copied out and another set copied in makes the cost concrete.',
      'The reader should understand what a process control block holds, which only means something while a switch is in progress.',
    ],


    avoidWhen: [
      'The article is about scheduling policy — which flow runs next and why. The order here is fixed; this shows the mechanism of switching, not the choice.',
      'The subject is parallelism across cores. There is one stage, and that single occupancy is the premise.',
      'The point is virtual memory or address space isolation. Only registers move here; nothing represents page tables.',
    ],

    contrastWith: [
      {
        concept: 'stack',
        note: 'The register bundle lifted into a holder is the same instinct as a stack frame — state set aside so it can be resumed exactly as it was.',
      },
    ],
  },
};
