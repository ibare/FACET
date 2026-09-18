/**
 * readyFirst 개념 선언.
 *
 * canonical facet 은 `facet:readyFirst` — 명령어 넷(`lw` 하나와 그 결과를 읽는 `add`, 서로
 * 무관한 `sub` · `or`)을 사이클 단위로 돌린다. `sub` 와 `or` 는 사이클 1 에 끝나 앞의 둘을
 * 앞지르지만, 원래 순서로 자리가 정해진 줄에 서서 `lw`(사이클 5) · `add` 가 빠질 때까지
 * 기다렸다가 사이클 6 에 `add` 와 함께 커밋된다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `outOfOrderExecution` 도 앞지름과 순서대로의 커밋을 둘 다 그린다. 그러나 그쪽의
 * 주장은 **창이 넓을수록 빈 박자가 메워진다** 는 양의 이야기이고, 이쪽은 **실행 순서와
 * 결과가 드러나는 순서가 갈라진다** 는 두 순서의 이야기다. 주어 층위를 갈랐다 — 그쪽은
 * 기계의 처리량, 이쪽은 바깥에서 보이는 순서의 보장.
 *
 * 어휘 배타: definition 은 형제의 낱말(window · cycles · slow load · pair · clock ·
 * register)을 쓰지 않고, 'reorder buffer' · 'retired' · 'inputs are ready' 는 이쪽이 독점한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const readyFirstConcept: FacetConceptSource = {
  id: 'readyFirst',
  label: 'Ready First, Commit in Order (Reorder Buffer)',
  canonicalFacet: 'facet:readyFirst',

  surface: {
    definition:
      'Execution order and completion order split apart: an instruction whose inputs are ready runs past earlier ones still waiting, then holds in a reorder buffer until everything ahead of it has retired.',
    exemplarKeywords: [
      'reorder buffer',
      'ROB',
      'in-order commit',
      'in-order retirement',
      'execute out of order, commit in order',
      'retire stage',
      'precise exceptions',
      'finished but not yet committed',
      'why results appear in program order',
      'architectural state updated in order',
    ],
  },

  briefing: {
    observable: [
      'Four instructions sit in the window in program order; each has its own lane in the upper half, and the add is tagged "waits for r1" because it reads what the lw loads.',
      'In cycle 1 the lw, the sub and the or all leave the window together; the sub and the or reach the end of their lanes in that same cycle while the lw needs four, and the caption says they finished ahead of the earlier instructions.',
      'Finished instructions drop into the line below, labelled "Line — program order", each into its own fixed place, so the sub and the or stand behind two empty places.',
      'The caption keeps naming what the waiting instructions are waiting in line for; the add only starts in cycle 5, after the lw has finished, while the lw commits.',
      'Commits go through the gate strictly from the head of the line: the lw first, then in cycle 6 the add, the sub and the or together.',
    ],

    screen: {
      affordances: [
        'The screen plays the six cycles on its own and stops with all four instructions committed.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, the strip can hold still on a cycle where the sub and the or are already finished and standing in line behind empty places.',
        'The four instructions and the load latency of four cycles are fixed, so an article can quote the cycle in which each instruction finished and the cycle in which it committed.',
      ],
    },

    useWhen: [
      'The article says a processor runs instructions out of order and the reader immediately worries that the program would then see results in the wrong order. Instructions that finished first standing still until the earlier ones have committed is the answer that has to be seen.',
      'The reader needs "finished" and "committed" to be two separate events, with a gap of several cycles between them for the same instruction.',
    ],

    avoidWhen: [
      'The subject is how much speed a larger scheduling window gains. There is no handle here and a single program runs once.',
      'The article is about exceptions, interrupts or a mispredicted branch being rolled back. Nothing here fails or is discarded; every instruction commits.',
      'The topic is register renaming. None of the four instructions writes a register another one also writes.',
      '"Program order" refers to memory ordering between threads, memory barriers or a consistency model. Only one instruction stream appears.',
    ],

    contrastWith: [
      {
        concept: 'outOfOrderExecution',
        note: 'Both start later instructions early; ready-first is the guarantee that results still appear in program order, while the broader concept is about how much lookahead turns into saved cycles.',
      },
      {
        concept: 'dualIssue',
        note: 'Dual issue keeps program order at the start and only widens it; here the start order is abandoned and program order is restored at commit instead.',
      },
      {
        concept: 'readBeforeWrite',
        note: 'Reading a value before its producer has written it is the hazard; ready-first answers it by holding the reader back until the value exists while letting unrelated instructions go on.',
      },
      {
        concept: 'branchFlush',
        note: 'Discarding wrongly started work needs a point past which nothing has become visible yet; committing in program order is what supplies that point.',
      },
    ],
  },
};
