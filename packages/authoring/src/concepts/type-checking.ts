/**
 * typeChecking 개념 선언.
 *
 * canonical facet 은 `facet:typeChecking` — 같은 일곱 줄(`qty` · `rate` · `cost` · `over` · `units` · `share` · `whole`)을
 * 규칙표 셋(엄격 · 넓힘 · 느슨)으로 검사한다. 줄마다 식의 타입이 잎에서 뿌리로 오르다 규칙표에 없는 짝에서 멈추고,
 * 손잡이를 돌리면 걸린 자리가 L3 · L6 · L7 → L5 · L7 → L7 로 옮겨 가며 셋 · 둘 · 하나로 준다. 판정은 셋 다 거부다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `typeFlowsUp` 은 한 식에서 타입이 오르는 걸음을, `typeMismatch` 는 한 자리가 걸려 프로그램 전체가 거부되는 것을 쥔다.
 * 이쪽은 **규칙표를 바꾸면 걸리는 자리가 옮겨 간다**는 대비를 맡는다. 그래서 definition 은 strict · widening · loose ·
 * 규칙표 · 걸린 자리의 수를 쥐고, 조각들이 쥔 leaf · root · inference(오름)와 never runs · not even lines above(거부)를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `typeChecking.md` 가 밝힌 것):
 *  - 세 규칙은 장난감 언어의 것이다. 엄격 ≈ int 와 float 를 섞지 않는 언어(OCaml), 넓힘 ≈ 자바 · C#, 느슨 ≈ `true + 1` 을
 *    셈하는 자바스크립트 · 파이썬.
 *  - 걸린 이름은 "타입 없음" 으로 두고 끝까지 읽는다. 그 이름을 읽는 식은 다시 세지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 검사기 함수(`checkProgram` · `typeOf`)다. 소재 프로그램이 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const typeCheckingConcept: FacetConceptSource = {
  id: 'typeChecking',
  label: 'Type Checking Under Strict, Widening and Loose Rules',
  canonicalFacet: 'facet:typeChecking',

  surface: {
    definition:
      'Checking one program against strict, widening and loose conversion tables shows that the language\'s rule table decides which operator pairs and declarations are type errors, and so how many error sites a compiler reports.',
    exemplarKeywords: [
      'static type checking',
      'type checker',
      'implicit conversion rules',
      'int to float promotion',
      'numeric widening',
      'type coercion',
      'is bool a number',
      'true + 1 in JavaScript',
      'strongly vs weakly typed',
      'error recovery in a type checker',
      'cascading type errors',
      'OCaml separate float operators',
      'Java double promotion',
    ],
  },

  briefing: {
    observable: [
      'Seven source lines are checked top to bottom once: `let qty = 4`, `let rate = 2.5`, `let cost = qty * rate`, `let over = cost > 10`, `let units: int = qty + over`, `let share: float = qty`, `let whole: int = rate`. No values are computed; only types (`int`, `float`, `bool`) appear.',
      'On each line with an operator the type climbs the expression tree to its root, then is attached to the name or fitted into the declared slot. Lines with a single leaf take one step. A round is 12 steps including step 0, under every rule set.',
      'Under Strict the climb stops at L3 on `int * float`; `cost` is left untyped (`?`), and L4 and L5, which read it, pass as "No type" without being counted. L6 and L7 then fail at their declared slots: three error sites (L3, L6, L7) and two untyped names.',
      'Under Widening (the starting position) L3 and L4 pass, the climb stops at L5 on `int + bool`, and L7 fails because `float` does not fit an `int` slot: two error sites. Under Loose, which also counts `bool` as `int`, only L7 fails: one error site.',
      'Every rule set ends with the program rejected — no table admits narrowing `float` into `int` at L7. The handle changes the number and places of the error sites, not the verdict.',
      'When the handle moves, the previous round\'s error sites stay as dashed marks at step 0, and this round\'s error marker slides from those marks to the new place.',
      'The three rule sets belong to a toy language. Strict is close to a language that never mixes `int` and `float`, such as OCaml; Widening is close to Java and C#; Loose is close to JavaScript and Python, where `true + 1` is 2. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Type rules", with three positions: Strict, Widening (starting position) and Loose. Two readouts, "Error sites" and "Untyped names", end each round at 3 · 2, 2 · 0 and 1 · 0.',
        'The move that makes the idea land is stepping the handle from Strict to Loose and watching the stopping place of the climb slide down the program while the verdict stays "rejected".',
        'The code panel, labelled "Type checker", starts empty with a "+ Add language" button. It shows a checker that receives the rule table as arrays (`opRule`, `fits`) and only reads them; the handle changes those two arrays and nothing else. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article compares how languages treat mixed arithmetic such as `int * float` or `int + bool`, and wants one program whose reported errors shift as the conversion rules loosen.',
      'A reader asks why the same code compiles in one language and is refused in another, and the article needs to show that the difference lives in a table of allowed operand pairs, not in the checker\'s procedure.',
      'The article explains why a checker reports several errors in one pass instead of stopping at the first, including why a name that failed is not counted again where it is read.',
    ],

    avoidWhen: [
      'The subject is runtime type errors, dynamic typing or values being converted while a program runs. Nothing executes here; only types are read.',
      'The article is about generics, subtyping, type inference algorithms such as Hindley–Milner, or user-defined types. The table covers four built-in types and four operators.',
      'The point is a program that passes type checking. Under every rule set on the handle this program is rejected.',
    ],

    contrastWith: [
      {
        concept: 'typeFlowsUp',
        note: 'Deriving an expression\'s type bottom-up is the procedure; changing the table of allowed pairs is what decides where that procedure gets stuck.',
      },
      {
        concept: 'typeMismatch',
        note: 'One failed pair rejecting a whole program before it runs is the consequence of an error. Which pairs count as errors in the first place is set by the language\'s conversion table.',
      },
      {
        concept: 'narrowingLoss',
        note: 'Narrowing loss is what happens to a value when a conversion is allowed and performed at run time; a static checker instead decides beforehand whether that conversion is allowed at all.',
      },
      {
        concept: 'scopeAndSymbols',
        note: 'Both are semantic checks done after parsing. Name resolution asks which declaration a use refers to; type checking asks whether the types that meet at an operator or slot are compatible.',
      },
    ],
  },
};
