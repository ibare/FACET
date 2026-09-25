/**
 * nonAtomicIncrement 개념 선언.
 *
 * canonical facet 은 `facet:nonAtomicIncrement` — 한 줄 `count = count + 1` 이 세 걸음 `let r = count`(읽기) ·
 * `r = r + 1`(더하기) · `count = r`(쓰기)로 펼쳐지고, 걸음 사이에 틈(gap) 둘이 표시된다. 메모리 `count` 41 ·
 * 레지스터 `r` 이 걸음마다 바뀌고, 더한 뒤 쓰기 전에는 42 ≠ 41 이 보인다. 스레드는 A 하나. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mutex` 는 그 틈에 다른 스레드가 끼는 것을 몫으로 돌려 본다. 이쪽은 끼어드는 스레드가 없다 — 주장은 **한 줄이
 * 세 걸음이고 그 사이 메모리와 레지스터가 다른 값을 든다** 하나. 그래서 definition 은 one statement · load · add ·
 * store · register vs memory · not atomic 을 독점하고, 두 스레드 · 덮어씀 · 자물쇠는 쓰지 않는다.
 *
 * 전제 (설명 글 `nonAtomicIncrement.md`): 처음 값 41 은 예. 세 줄은 기계어가 아니라 읽기 · 더하기 · 쓰기를 드러내는
 * 표기다 — 실제 CPU 는 메모리를 곧바로 더하는 명령도 있고, 그런 명령도 여러 코어에서는 원자적이지 않다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nonAtomicIncrementConcept: FacetConceptSource = {
  id: 'nonAtomicIncrement',
  label: 'count = count + 1 Is Not Atomic',
  canonicalFacet: 'facet:nonAtomicIncrement',

  surface: {
    definition:
      'The single statement count = count + 1 runs as three separate steps — load into a register, add, store to memory — so it is not atomic, and between steps the register and memory hold different values.',
    exemplarKeywords: [
      'atomic operation',
      'non-atomic increment',
      'read-modify-write',
      'count++ is not atomic',
      'load add store',
      'register versus memory',
      'i++ thread safe',
      'atomic increment instruction',
      'std::atomic fetch_add',
    ],
  },

  briefing: {
    observable: [
      'At the top is one line, `count = count + 1` ("One line of code, about to run."). Below are Memory holding `count` = 41 and Thread A with its register `r`.',
      'The line unfolds into three: `let r = count` (read), `r = r + 1` (add), `count = r` (write), with a "gap" marker between each pair.',
      'Read: memory 41 is copied into the register — both show 41.',
      'Add: only the register changes. The register shows 42, memory still 41, and a ≠ sign stands between them — the same `count` holds two different values in two places.',
      'Write: "the register value is copied back to memory." Memory 42 · Register 42.',
      'There is one thread and nothing interrupts it; the gaps are only pointed out. The start value 41 is an example, and the three lines are a notation for read, add and write rather than real machine code — some processors can add to memory in one instruction, which is still not atomic across several cores. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the unfolding and the three steps by itself and stops after the write.',
        'A Replay button and a playback strip sit below it. Holding the Add step keeps the 42-versus-41 mismatch on screen.',
      ],
    },

    useWhen: [
      'The article must establish that an increment is not a single indivisible action before explaining any race; one thread and no interference keeps attention on the three steps and the gaps between them.',
      'A reader asks what "atomic" means; the moment when register and memory disagree is where a non-atomic operation can be cut.',
    ],

    avoidWhen: [
      'The article needs to show an update actually being lost. No second thread appears.',
      'The subject is how atomic instructions or locks are implemented in hardware. Only the non-atomic version is shown.',
      'The point is compiler optimizations such as keeping a variable in a register across a loop. The three steps happen once.',
    ],

    contrastWith: [
      {
        concept: 'lostUpdate',
        note: 'A non-atomic increment only opens a gap; a lost update is what happens when another thread\'s read and write land inside such a gap.',
      },
      {
        concept: 'mutex',
        note: 'Three steps with gaps is the precondition; whether a switch actually falls inside them depends on the schedule, and a lock is what keeps it from mattering.',
      },
    ],
  },
};
