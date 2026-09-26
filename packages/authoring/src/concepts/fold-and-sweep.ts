/**
 * foldAndSweep 개념 선언.
 *
 * canonical facet 은 `facet:foldAndSweep` — 일곱 줄 함수 `price(n)` 에 폴딩(끔 · 폴딩 · 전파 + 폴딩)과
 * 죽은 코드 제거(끔 · 켬)를 차례로 돌린다. 손잡이 여섯 칸에서 실행 연산 · 줄 · 접은 마디 · 지운 줄이 갈리고,
 * 지운 줄은 폴딩 손잡이에 따라 1 · 1 · 5 가 된다. 전파 + 폴딩 × 켬에서 연산 7 · 줄 7 이 연산 2 · 줄 2 로 준다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `foldAtCompile` 은 전파 없는 폴딩이 식 안에서 안쪽부터 접히는 장면, `unusedIsRemoved` 는 쓰임이 0 인
 * 줄이 판을 거듭하며 위로 번져 떨어지는 장면이다. 이쪽은 두 패스를 **잇달아** 돌려 앞 패스가 뒤 패스의 몫을
 * 얼마나 바꾸는가를 맡는다. 그래서 definition 은 pass ordering · propagation · 두 패스의 몫(1 줄 대 5 줄)을 쥐고,
 * 조각이 독점한 innermost · literal operand · use count · cascade · round 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `foldAndSweep.md` 가 밝힌 것):
 *  - 원시 프로그램은 어느 언어도 아닌 표기다. 코드 패널은 그 프로그램이 아니라 프로그램을 번호 배열로 받아
 *    접고 쓸어 내는 컴파일러 함수이며, IR 하나를 여섯 언어로 옮긴 것이다.
 *  - 두 패스를 한 번씩 정해진 차례(폴딩 → 제거)로 돌리는 한 방식이다. 실제 컴파일러는 여러 번 섞어 돌린다.
 *  - 실행 연산은 한 번 부를 때 지나는 연산 마디 수다. 밖에 흔적을 남기는 줄은 쓰임이 0 이어도 지우지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const foldAndSweepConcept: FacetConceptSource = {
  id: 'foldAndSweep',
  label: 'Constant Folding Then Dead-Code Elimination (Pass Interaction)',
  canonicalFacet: 'facet:foldAndSweep',

  surface: {
    definition:
      'Running constant propagation with folding before dead-code elimination decides how much the later pass can delete: without propagation it removes one line, with it five, cutting seven operations to two.',
    exemplarKeywords: [
      'optimization pass ordering',
      'phase ordering problem',
      'one optimization enables another',
      'constant propagation and folding',
      'dead code elimination after constant propagation',
      'DCE',
      'compiler optimization pipeline',
      'LLVM passes',
      'GCC -O2',
      'why optimizations are run in sequence',
      'program shrinks after optimization',
    ],
  },

  briefing: {
    observable: [
      'A seven-line function `price(n)` stands with line numbers L1 to L7: `let rate = 3`, `let tax = rate * 10`, `let base = 60 * 60`, `let fee = base - tax * 100`, `let unused = n * fee`, `return n * tax + fee`. A strip above names the two passes, "Propagate + fold → Dead-code removal", and each round starts with "Start from the original program".',
      'With propagation on, the folding pass walks the lines top to bottom. A line that becomes a single number enters a "Known" column ("known: tax = 30"), and further down each use of that name is replaced by the number before folding continues. Captions count it line by line, for example "L5: nodes folded in this line 2 · names replaced 2 · known: fee = 600". The parameter `n` is never replaced.',
      'Folding never deletes a line. After it, the dead-code pass puts a "Uses" badge beside every `let` line; at the default setting all five read 0 ("Pass 1: uses counted · lines with zero uses: 5"), and L2 to L6 drop out together in one pass. Pass 2 finds no `let` line left and the round ends with "Count: executed ops 2 · lines 2", leaving `return n * 30 + 600`.',
      'Four readouts follow each step: Executed ops, Lines, Folded nodes, Removed lines. Across the six handle positions they read: off/off 7 · 7 · 0 · 0; off/on 6 · 6 · 0 · 1; fold/off 6 · 7 · 1 · 0; fold/on 5 · 6 · 1 · 1; propagate/off 3 · 7 · 4 · 0; propagate/on 2 · 2 · 4 · 5.',
      'The number of lines the dead-code pass removes goes 1, 1, 5 as folding moves from off to fold to propagate + fold. Plain folding does not change it, because names such as `tax` in `tax * 100` still hold the lines above them in use. With propagation on and the dead-code pass off, the program keeps all seven lines while running only 3 operations.',
      'Every setting returns the same values; the program is only rewritten. Executed ops counts the operation nodes passed in one call. A line whose effect reaches outside (a call or output) would be kept even with zero uses; this program has none. Real compilers interleave these passes many times; here each runs once in a fixed order.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Folding" with three positions (Off, Fold, Propagate + fold; starts at Propagate + fold) and "Dead-code removal" with Off and On (starts On). Each round replays from the original program, then waits for a handle to move.',
        'The move that makes the idea land is holding Dead-code removal on and stepping Folding from Fold to Propagate + fold: Removed lines jumps from 1 to 5 and Lines falls from 6 to 2. Switching Dead-code removal off at Propagate + fold shows the orphaned lines left standing.',
        'The code panel, labelled "Compiler: fold, then sweep", starts empty with a "+ Add language" button; the chosen language shows the compiler function that folds and sweeps, and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says optimizations feed each other and needs a case where turning on one pass multiplies what the next pass can do: five deletions instead of one.',
      'A reader wonders why compilers run constant propagation before dead-code elimination; switching the order-dependent passes on and off shows the lines only become dead once names have been replaced by numbers.',
    ],

    avoidWhen: [
      'The article is about the fold or reduce operation over a list in functional programming. Folding here means evaluating constant arithmetic in a program.',
      'The subject is dead code inside branches, unreachable blocks, or control-flow analysis. This function has no branches; deletion is decided only by counting reads of names.',
      'The point is garbage collection or freeing memory at run time. Nothing is collected while the program runs; lines are removed from the source before it runs.',
    ],

    contrastWith: [
      {
        concept: 'foldAtCompile',
        note: 'Folding alone replaces arithmetic on literal numbers and stops at any name. Chaining it with propagation and a deletion pass is what turns those numbers into lines no one needs.',
      },
      {
        concept: 'unusedIsRemoved',
        note: 'Deletion by use counts can spread upward over several rounds within one pass. When an earlier pass has already replaced the names by numbers, the uses are gone before counting starts and most lines are dead in the first round.',
      },
      {
        concept: 'valueFlowsToUse',
        note: 'Knowing where each defined value is read is the information both passes depend on; this concept is about what happens when one pass rewrites those reads before the other counts them.',
      },
      {
        concept: 'reduceFold',
        note: 'Reduce combines a sequence of values into one at run time. Constant folding combines operands written in the source into one number before the program ever runs.',
      },
    ],
  },
};
