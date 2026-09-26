/**
 * inlineGrowsCode 개념 선언.
 *
 * canonical facet 은 `facet:inlineGrowsCode` — 세 주소 코드 `poly(x)`(명령 다섯)와 그것을 세 번 부르는
 * `main(a, b, c)`(명령 여섯). 부른 자리를 위에서부터 하나씩 몸통으로 바꿀 때마다 크기 +3 · 실행 −2 —
 * 크기 11 → 14 → 17 → 20, 실행 21 → 19 → 17 → 15. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `inliningTradeoff` 은 몸 길이의 한계로 붙일 함수를 고르고 그 한계를 올릴 때의 값을 보이고, 형제
 * `pasteTheBody` 는 한 자리를 붙일 때 인자와 돌려준 값이 어디로 가는가를 맡는다. 이쪽의 한 동사는 "반대로
 * 기운다" — 한 함수를 모든 자리에 붙이며 코드 크기와 실행 명령 수가 서로 반대쪽으로 벌어진다. 그래서 definition 은
 * code size · executed instructions · call and return · body copy per site 쪽 낱말을 쥐고, threshold · which
 * callees · argument binding 을 쓰지 않는다.
 *
 * 전제 (설명 글 `inlineGrowsCode.md`): 화면의 코드는 세 주소 코드 — 특정 CPU 가 아닌 교과서 표기다. 명령 하나를
 * 비용 하나로 쳤다(실제 부르기는 더 비싸다). `poly` 의 정의는 지우지 않고 센다. 한 방식이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const inlineGrowsCodeConcept: FacetConceptSource = {
  id: 'inlineGrowsCode',
  label: 'Inlining Grows Code Size While Cutting Executed Instructions',
  canonicalFacet: 'facet:inlineGrowsCode',

  surface: {
    definition:
      'Each call site replaced by a copy of the callee body removes a call and a return from execution but adds that copy to the program, so code size climbs by three per site while executed instructions fall by two.',
    exemplarKeywords: [
      'code bloat',
      'code size increase from inlining',
      'binary size grows',
      'instruction count',
      'call overhead',
      'call and return instructions',
      'three-address code',
      'size vs speed',
      'instruction cache pressure',
      'why inlining makes binaries bigger',
    ],
  },

  briefing: {
    observable: [
      'The code is three-address code, one instruction per line. `function poly(x)` has five instructions — `t1 = x * x`, `t2 = t1 * 3`, `t3 = x * 2`, `t4 = t2 + t3`, `return t4` — and `function main(a, b, c)` has six: `t5 = call poly(a)`, `t6 = call poly(b)`, `t7 = call poly(c)`, `t8 = t5 + t6`, `t9 = t8 + t7`, `return t9`.',
      'Two stacks of bricks stand on the right, one brick per instruction: "Size · instructions in the code" and "Run · steps in one run of main", joined at the top by a bar. The start reads "Calls to poly in main: 3 · Size: 11 · Run: 21"; in the Run stack the `call` and `return` bricks are labelled as such.',
      'Step 1: "The call that fills t5 is replaced by the body of poly · Size: 11 → 14 · Run: 21 → 19". The call line becomes `t10 = a * a`, `t11 = t10 * 3`, `t12 = a * 2`, `t5 = t11 + t12`; tags beside the stacks read +3 and −2.',
      'Step 2 does the same for `t6` with `t13` to `t15` (Size 14 → 17, Run 19 → 17). Step 3: "Last call replaced: the body of poly now fills t7 · Size: 17 → 20 · Run: 17 → 15". The call and return bricks are gone from the Run stack.',
      'Every site moves the two numbers by the same unequal amounts: size +3 (four body instructions replace one call line) and run −2 (the `call` and the `return`). The definition of `poly` stays and is still counted in Size. The run is four steps counting the start. `main(2, 3, 5)` returns 134 before and after.',
      'The parameter `x` becomes the argument name and new temporaries continue from the highest number in the program; the temporary `return` handed back becomes the receiving name, so no `return` line is copied. Each instruction is counted as cost 1; a real call also builds a stack frame and saves registers, so the real saving in time is larger.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one call site replaced per step, and stops after the third.',
        'A Replay button and a playback strip sit below it. Dragging from the start to the end shows the Size stack rising past the Run stack as Run shrinks.',
        'The program is fixed, so every instruction and count can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article warns that inlining makes programs larger and needs the two counts moving in opposite directions at every call site, with the growth tied to body length.',
      'A reader thinks inlining is purely a speed-up; the stacks going 11 → 20 in size against 21 → 15 in run length show what is paid for it.',
    ],

    avoidWhen: [
      'The article is about choosing which functions to inline by a size limit. Only one function is inlined here, at all of its sites.',
      'The subject is how an expression argument is bound to the parameter in one substitution. Every argument here is already a name, so it is simply renamed.',
      'The point is measured run time, cache misses or benchmark results. The only costs shown are instruction counts.',
    ],

    contrastWith: [
      {
        concept: 'inliningTradeoff',
        note: 'Inlining one function at every site fixes a single rate of growth. Choosing functions by a length limit is about how that rate rises as longer bodies are admitted.',
      },
      {
        concept: 'pasteTheBody',
        note: 'Substituting one body concerns where arguments and results go. Counting across repeated substitutions concerns what the program gains in speed and loses in size.',
      },
      {
        concept: 'unrollLoop',
        note: 'Both copy code to remove repeated control instructions. Unrolling removes loop tests and bumps; inlining removes calls and returns.',
      },
      {
        concept: 'returnToCaller',
        note: 'The return instruction is one of the two costs every call carries. Inlining removes it by writing the result directly into the receiving name.',
      },
    ],
  },
};
