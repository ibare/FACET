/**
 * dualIssue 개념 선언.
 *
 * canonical facet 은 `facet:dualIssue` — 명령어 여섯이 프로그램 순서로 줄 서고, 맨 앞 둘이
 * 두 자리 문 앞에 선다. 둘째가 첫째의 결과 레지스터를 읽지 않으면 둘이 한 박자 줄에
 * 나란히 앉고, 읽으면 둘째 자리의 문이 닫혀 첫째만 들어간다. 여섯이 네 박자에 끝난다.
 * 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 둘(`outOfOrderExecution` · `readyFirst`)은 뒤의 것이 앞을 **건너뛰는** 기계다.
 * 이쪽은 **건너뛰지 않는** 기계다 — 순서는 끝까지 지키고, 한 박자의 폭만 둘로 늘었다.
 * 주어는 "맨 앞 둘 사이의 의존 하나" 다.
 *
 * 어휘 배타: definition 은 형제의 낱말(window · load · stalled · ready · retire ·
 * reorder buffer · overtake)을 쓰지 않는다. 박자도 형제가 쓰는 'cycle' 대신 'clock' 으로
 * 적었다. 반대로 'pair' · 'two' · 'in-order' · 'the register the first writes' 는 이쪽이
 * 독점한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dualIssueConcept: FacetConceptSource = {
  id: 'dualIssue',
  label: 'Dual Issue (Two Instructions per Clock, In Order)',
  canonicalFacet: 'facet:dualIssue',

  surface: {
    definition:
      'An in-order core able to send two instructions per clock pairs the front two only when the second does not read the register the first writes; otherwise the first goes alone and the second waits for the next clock.',
    exemplarKeywords: [
      'dual issue',
      'dual-issue pipeline',
      'superscalar',
      'in-order superscalar',
      'two-wide issue',
      'issue width',
      'instruction pairing',
      'Pentium U and V pipes',
      'Cortex-A53 dual issue',
      'why two issue slots do not halve the time',
      'dependency inside an issue pair',
    ],
  },

  briefing: {
    observable: [
      'Six instructions stand in program order on the left, and the front two step up to a door with two seats; beyond it is one row of two seats per beat.',
      'For each pair the caption names the register the front instruction produces and says whether the one behind it reads that register — "both enter" or "waits".',
      'When the second reads the first one\'s result, its seat in the door closes and the front instruction enters its beat row alone; the one left behind becomes the front of the next pair.',
      'In this program I1 and I2 enter together, I3 enters alone because I4 reads its r7, I4 and I5 enter together, and I6 enters alone with nothing behind it.',
      'I3 reads results from I1 and I2 without holding anything up, because those entered on an earlier beat; only a dependency inside the same pair splits it.',
      'The closing caption compares the beats used with a one-at-a-time machine: 4 beats instead of 6.',
    ],

    screen: {
      affordances: [
        'The screen plays all six instructions through the door on its own and stops on the closing count.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip back holds the moment the door closes on I4, next to the beat where I1 and I2 went through together.',
        'The six instructions are fixed, so an article can name the pair that splits and the register that splits it.',
      ],
    },

    useWhen: [
      'The article says a core can issue two instructions per clock and the reader assumes that halves the running time. Six instructions finishing in four beats rather than three, because one same-pair dependency sends an instruction in alone, is the correction.',
      'The reader needs to see that an in-order machine judges only the front two against each other, and that a result produced on an earlier beat never blocks the next pair.',
    ],

    avoidWhen: [
      'The article is about letting later instructions go ahead of a stalled one. This machine never skips the line; I5 waits behind I4 even though it depends on nothing.',
      'The subject is multiple cores, hardware threads or SMT. The two seats here belong to one instruction stream.',
      'The article is about VLIW, where the compiler decides the bundles. Here the pairing is decided at run time from the two register fields.',
      'The topic is the latency of a slow operation such as a memory load. Every instruction here takes one beat.',
    ],

    contrastWith: [
      {
        concept: 'outOfOrderExecution',
        note: 'Widening issue while keeping strict order stalls on the first dependency at the front; out-of-order execution lets independent later work use the empty slot instead.',
      },
      {
        concept: 'readyFirst',
        note: 'Here instructions start in program order and only the width changes; ready-first lets them start out of order and restores program order only when results are made visible.',
      },
      {
        concept: 'operandForwarding',
        note: 'Forwarding is why a result from the previous beat can already be read; it cannot help two instructions issued in the same beat, which is why a same-pair dependency still splits them.',
      },
      {
        concept: 'stageOverlap',
        note: 'Pipelining overlaps successive instructions at different stages; dual issue puts two instructions into the same stage side by side.',
      },
    ],
  },
};
