/**
 * typeFlowsUp 개념 선언.
 *
 * canonical facet 은 `facet:typeFlowsUp` — 타입을 적지 않은 세 줄(`count` · `price` · `big`)에서 잎의 타입이 정해지고,
 * 연산마다 규칙으로 합쳐지며 뿌리로 오른다. L3 `count * 3 + price > 10` 에서 타입이 int → float → bool 로 두 번 바뀌고,
 * 뿌리의 bool 이 이름 `big` 에 붙는다. 13 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `typeChecking`(완제품)은 규칙표가 걸리는 자리를 옮기는 대비를, `typeMismatch` 는 한 자리가 걸려 거부되는 결과를 쥔다.
 * 이쪽은 걸림이 없는 **오름 하나** — 적지 않은 타입을 식에서 얻어 오는 추론 — 을 쥔다. 그래서 definition 은
 * unannotated · leaves · root · inferred 를 쥐고, error · reject · rule table 같은 말을 넣지 않는다.
 *
 * 전제: 규칙은 장난감 언어의 것(자바 · C# 에 가깝다 — int 는 float 를 만나면 넓혀지고, 견줌은 bool 을 내며, bool 은 수가 아니다).
 * 값은 셈하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const typeFlowsUpConcept: FacetConceptSource = {
  id: 'typeFlowsUp',
  label: 'Inferring a Type From the Leaves Up',
  canonicalFacet: 'facet:typeFlowsUp',

  surface: {
    definition:
      'For a variable declared without a type, the compiler infers one from the initializer: leaf types come first, each operator combines its children\'s types, and the type reaching the root becomes the variable\'s.',
    exemplarKeywords: [
      'type inference',
      'local type inference',
      'var in Java and C#',
      'auto in C++',
      'let without a type annotation',
      'bottom-up type derivation',
      'synthesized attribute',
      'int promoted to float in an expression',
      'comparison yields a boolean',
      'expression tree types',
      'how does the compiler know the type',
    ],
  },

  briefing: {
    observable: [
      'Three lines with no type written anywhere: `let count = 4`, `let price = 2.5`, `let big = count * 3 + price > 10`. Each expression grows upward as a tree above its line, and a "Names" row across the top collects the names.',
      'On L1 and L2 the single leaf fixes the type at once — `4` is int, `2.5` is float — and it rises straight to the names row as `count` int and `price` float.',
      'L3 has seven nodes, four leaves and three operators, visited left child, right child, then the node itself. The name leaves `count` and `price` read their types from the names row.',
      '`count * 3` is int with int giving int: the type rises unchanged. `+ price` is int with float giving float: int widens on the way up. `> 10` compares float with int and gives bool, a type neither child had.',
      'The root\'s bool rises to the name `big`. The run is 13 steps including step 0 and ends with the names row reading `count` int · `price` float · `big` bool.',
      'No value is shown — not what `count * 3` equals nor whether `big` is true. The rules belong to a toy language close to Java and C#: `+ - *` give int for two ints and float if either side is float, comparisons take numbers and give bool, and bool is not a number.',
    ],

    screen: {
      affordances: [
        'The screen plays the inference by itself, one node per step, and stops once `big` has its type.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to the `+ price` step holds the moment int becomes float partway up the tree.',
        'The program is fixed, so an article can quote each rule line such as "Rule int + float → float" exactly as it appears.',
      ],
    },

    useWhen: [
      'The article introduces `var`, `auto` or an unannotated `let` and has to answer where the variable\'s type comes from when nobody wrote it.',
      'A reader is unsure why `a * 3 + b > 10` ends up boolean when every operand is a number, and the article wants the type changing twice as it moves toward the root.',
    ],

    avoidWhen: [
      'The article is about type errors or rejected programs. Every rule application here succeeds.',
      'The subject is inference that flows in more than one direction, such as Hindley–Milner or inferring from later uses. Types here only move from an expression to the name on its left.',
      'The article needs values evaluated at run time. The tree carries types only.',
    ],

    contrastWith: [
      {
        concept: 'typeChecking',
        note: 'Inference derives a type where one was left out; checking compares types that meet against a table and counts the places where no rule exists.',
      },
      {
        concept: 'typeMismatch',
        note: 'When every operator has a rule, the type always reaches the root. A mismatch is the case where one operator has no rule for its pair and nothing rises past it.',
      },
      {
        concept: 'parseTreeToAst',
        note: 'The abstract syntax tree is the structure the parser hands over; inference walks that finished tree and attaches a type to each node.',
      },
    ],
  },
};
