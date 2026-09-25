/**
 * saveAndRestore 개념 선언.
 *
 * canonical facet 은 `facet:saveAndRestore` — CPU 칸 둘(pc · r)을 두 프로그램이 번갈아 쓴다. A 가 두 줄을 밟아
 * pc 3 · r 3 이 되면 A 의 기록에 적고, B 의 기록(pc 1 · r 0)을 꺼내 **같은 칸**을 덮는다. B 가 r 을 10 · 9 로 만든 뒤
 * 적히고, A 의 pc 3 · r 3 이 9 위로 되돌아와 A 가 3 + 4 + 5 = 12 를 보인다. 걸음 열둘. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `contextSwitching` 은 저장 · 빈 무대 · 복원 세 박자를 트리거 종류 · 스레드/프로세스 모드로 돌려 보이며 빈
 * 시간(오버헤드)을 쌓는다. 이쪽은 **왜 적고 꺼내야 하는가** 하나 — 칸은 하나라 다음 프로그램이 덮고, 적어 둔 값이
 * 돌아와야 계산이 맞는다(되돌리지 않으면 18). 그래서 definition 은 program counter · overwritten · record · correct
 * result 를 쥐고, 오버헤드 · 트리거 · 캐시는 쓰지 않는다. 비용은 `switchCosts` 가 쥔다.
 *
 * 전제 (설명 글 `saveAndRestore.md`): 실제 CPU 의 레지스터는 훨씬 많고 기록은 PCB 나 커널 스택에 있다 — 칸 둘로 줄였다.
 * 언제 바꿀지는 미리 정했고 시간은 세지 않는다. 코드는 어느 언어도 아닌 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const saveAndRestoreConcept: FacetConceptSource = {
  id: 'saveAndRestore',
  label: 'Saving and Restoring the Program Counter and Registers',
  canonicalFacet: 'facet:saveAndRestore',

  surface: {
    definition:
      'Two programs sharing one CPU overwrite the same program counter and register, so the outgoing program\'s values are copied to its saved record and copied back later, letting it continue at its line with its own value.',
    exemplarKeywords: [
      'save registers',
      'restore registers',
      'program counter',
      'saved context',
      'register file shared between processes',
      'resume where it left off',
      'why a switched-out process keeps its values',
      'kernel stack',
      'trap frame',
    ],
  },

  briefing: {
    observable: [
      'Two programs sit side by side. A: `let sum = 0`, `sum = sum + 3`, `sum = sum + 4`, `sum = sum + 5`, `show sum`. B: `let n = 10`, `n = n - 1`, `n = n - 1`, `show n`. Under each is a record ("Record of A", "Record of B") with a pc and an r; the CPU box holds one pc and one r.',
      'A runs two lines: "A, line 2 — r 0 → 3 · pc 2 → 3". Then "Save A — record ← pc 3 · r 3" copies the CPU\'s values into A\'s record.',
      '"Restore B — record → pc 1 · r 0 · r overwritten: 3" puts B\'s values into the very same CPU slots. B runs two lines and r becomes 10, then 9 — A\'s 3 is gone from the CPU.',
      '"Save B — record ← pc 3 · r 9", then "Restore A — record → pc 3 · r 3 · r overwritten: 9". A continues at line 3: r 3 → 7 → 12, and line 5 shows 12.',
      'B ends waiting before its line 3 with pc 3 · r 9 held in its record. Twelve steps: start, A\'s two lines, save, restore, B\'s two lines, save, restore, A\'s three lines.',
      'The CPU is reduced to two slots and the switch points are fixed in advance; how long saving and restoring take is not counted. The code uses a small language-neutral notation — `let`, `show` — rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the twelve steps by itself and stops after A shows 12.',
        'A Replay button and a playback strip sit below it. Holding the "Restore A" step shows the saved 3 replacing B\'s 9 in the same slot, the one move that keeps A\'s sum correct.',
      ],
    },

    useWhen: [
      'The article must explain why an interrupted program does not lose its place or its partial results, and needs the shared register slot visibly taken over by another program in between.',
      'A reader thinks each process has its own physical registers; watching B\'s values sit in the same pc and r that A used makes clear that saving and restoring is what keeps them apart.',
    ],

    avoidWhen: [
      'The article is about the time or performance cost of switching. Nothing here is timed.',
      'The subject is what causes a switch — timer, system call, interrupt. The switch points are fixed and no cause is shown.',
      'The point is thread versus process switches or address spaces. There are two programs and two register slots only.',
    ],

    contrastWith: [
      {
        concept: 'contextSwitching',
        note: 'Saving and restoring is the necessity at the core of a switch; context switching as a whole adds what triggers it, the idle gap it leaves, and how much heavier a process switch is than a thread switch.',
      },
      {
        concept: 'switchCosts',
        note: 'Copying registers out and back in is what a switch must do to be correct; what it costs, including the slow reads that follow, is a separate question.',
      },
      {
        concept: 'pcbHoldsState',
        note: 'The saved pc and register belong to the same per-process record as the list of granted resources, but they serve resumption, not cleanup at exit.',
      },
    ],
  },
};
