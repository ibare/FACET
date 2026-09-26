/**
 * valueFlowsToUse 개념 선언.
 *
 * canonical facet 은 `facet:valueFlowsToUse` — 곧은 줄 여섯(`x = a * 2` · `y = x + b` · `z = x * y` · `x = z - x` · `w = x + y` ·
 * `return w`)에서 넣는 줄마다 값이 아래 읽는 자리들로 뻗는다. 줄 1 의 `x` 는 줄 2 · 3 · 4 로 셋, 줄 4 가 `x` 에 다시 넣어 거기서 끊긴다.
 * 사슬 여덟 · 넣는 줄 다섯, 바깥 값 `a` · `b` 는 사슬 밖. 6 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `flowGraphs`(완제품)는 흐름 꼴이 바뀌면 한 읽기에 넣기가 둘 닿는 대비를 쥔다. 이쪽은 **갈래 없는 곧은 줄에서 한 넣기가 어디까지
 * 닿나** — 여러 자리로 갈라짐 · 다시 넣으면 끊김 · 읽기가 먼저 — 를 쥔다. 그래서 definition 은 def-use chain · later reads ·
 * reassigning cuts off 를 쥐고, block · edge · if · while · reaching sweep 을 쓰지 않는다.
 *
 * 전제: `@notation native` 교과서 세 주소 코드. `return` 의 값도 읽는 자리. 이름은 그대로 두고(SSA 판을 붙이지 않고) 길만 그린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const valueFlowsToUseConcept: FacetConceptSource = {
  id: 'valueFlowsToUse',
  label: 'A Value Flows From Its Assignment to Its Uses',
  canonicalFacet: 'facet:valueFlowsToUse',

  surface: {
    definition:
      'A def-use chain pairs one assignment with each later read of its value; one value can fan out to several reads, and assigning the same name again cuts the earlier value off from every read below.',
    exemplarKeywords: [
      'def-use chain',
      'du chain',
      'definition and use',
      'where is this value used',
      'redefinition kills the old value',
      'reassignment cuts off',
      'data dependence',
      'read before write in one statement',
      'dataflow in straight-line code',
    ],
  },

  briefing: {
    observable: [
      'Six lines of three-address code: `x = a * 2`, `y = x + b`, `z = x * y`, `x = z - x`, `w = x + y`, `return w`. Each assigning line has its own lane on the left; a value travels down it and branches into the reading slots of the lines that use it.',
      'One assigning line per step, six steps including step 0. Line 1\'s `x` reaches lines 2, 3 and 4 — three reads; on line 4 it is the right-hand `- x`. Line 4 assigns `x` again, so this lane stops there with a bar and never reaches line 5.',
      'Line 2\'s `y` reaches lines 3 and 5 — it is never reassigned, so it skips across to line 5. Line 3\'s `z` reaches line 4.',
      'Line 4\'s new `x` reaches line 5: the `x` on line 5 comes from here, not from line 1, and the new lane crosses where the old one was cut. Line 5\'s `w` reaches the `return` on line 6.',
      'The end shows eight chains from five assigning lines. `a` and `b` are never assigned in this code, so their two reads stay faint and outside the chains. Names never change on screen — which assignment a value came from is told by lane and colour.',
      'On line 4 the right side is read before the left side is written, so the right-hand `x` still holds line 1\'s value. No values are computed; the notation is textbook three-address code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one assigning line per step, and stops after `w` reaches `return`.',
        'A Replay button and a playback strip sit below it. Holding the strip on step 1 shows the lane of the first `x` ending at line 4.',
        'The code is fixed, so each count such as "Line 1 assigns x → reads reached: 3" can be quoted as it appears.',
      ],
    },

    useWhen: [
      'The article defines def-use chains and needs one value fanning out to several reads and another stopped by a reassignment.',
      'A reader confuses the two `x` values on lines 1 and 4 because they share a name, and the article wants the read on line 5 traced to the second one.',
    ],

    avoidWhen: [
      'The article is about code with branches or loops, where a read can be reached by several assignments. This code is straight-line.',
      'The subject is data dependences between loop iterations or for parallelization. There is no loop.',
      'The article is about runtime values or debugging variable contents. Nothing is evaluated.',
    ],

    contrastWith: [
      {
        concept: 'flowGraphs',
        note: 'In straight-line code the nearest assignment above always wins. Once branches or loops enter, a read can be reached by more than one assignment and finding them takes an analysis over the graph.',
      },
      {
        concept: 'assignOnce',
        note: 'Chains keep one name and connect writes to reads by lines; single assignment moves that connection into the names, so the two `x` values become two different names.',
      },
      {
        concept: 'unusedIsRemoved',
        note: 'A chain records who reads a value. An assignment with no chains at all is exactly what dead-code removal looks for.',
      },
    ],
  },
};
