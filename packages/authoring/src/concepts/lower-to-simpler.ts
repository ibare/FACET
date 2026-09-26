/**
 * lowerToSimpler 개념 선언.
 *
 * canonical facet 은 `facet:lowerToSimpler` — 한 줄 `let r = (a + b) * (c - d) / 2 + a` 에서 연산 다섯이 속부터 하나씩 떼어져
 * 세 주소 코드 줄로 내려앉는다(`t1 = a + b` · `t2 = c - d` · `t3 = t1 * t2` · `t4 = t3 / 2` · `r = t4 + a`). 마지막 연산은 임시 없이
 * `r` 에 곧장 쓴다. 끝에 a = 3 · b = 5 · c = 7 · d = 4 로 두 쪽이 다 15 인지 대조한다. 7 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `flowGraphs`(완제품)의 걸음 0 에 이미 낮춘 세 주소 코드가 있다 — 낮추기를 걸음으로 두지 않았다. 이쪽이 그 앞 단계를 맡는다.
 * 블록 · 간선 · 사슬이 없는 **식 하나의 낮추기**라, definition 은 nested expression · one operator per line · innermost first ·
 * temporary · line order replaces parentheses · same value 를 쥐고, block · jump · chain · version 을 쓰지 않는다.
 *
 * 전제: `@notation native` — 위 한 줄은 FACET 조각의 코드 표기, 아래 줄들은 교과서 세 주소 코드(LLVM IR 은 `%1 = add i32 %a, %b`
 * 처럼 타입을 적는다 — 여기선 뺐다). a · b · c · d 는 예로 정한 값, `/` 는 실수 나눗셈이지만 이 값에서는 나누어떨어진다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lowerToSimplerConcept: FacetConceptSource = {
  id: 'lowerToSimpler',
  label: 'Lowering an Expression to Three-Address Code',
  canonicalFacet: 'facet:lowerToSimpler',

  surface: {
    definition:
      'Lowering a nested expression emits one three-address instruction per operator, innermost first, each result held in a new temporary, so line order takes over the job of parentheses and the computed value is unchanged.',
    exemplarKeywords: [
      'three-address code',
      'TAC',
      'intermediate code generation',
      'lowering',
      'temporaries t1 t2',
      'linearizing an expression',
      'quadruples',
      'LLVM IR instructions',
      'one operation per instruction',
      'what happens to parentheses',
    ],
  },

  briefing: {
    observable: [
      'One source line, `let r = (a + b) * (c - d) / 2 + a`, with five operations nested inside it, sits above an empty column of three-address code.',
      'Each step detaches the leftmost operation whose operands are both names or numbers; it drops to a new line and writes into the next temporary, and the temporary\'s name is left in its place: `t1 = a + b` leaves `r = t1 * (c - d) / 2 + a`; then `t2 = c - d`; then `t3 = t1 * t2`; then `t4 = t3 / 2`.',
      'The last operation, `t4 + a`, is the outermost and uses no temporary — it is written straight into `r` as `r = t4 + a`. The `let` does not come down; it declares a name and is not an operation.',
      'The two pairs of parentheses do not appear in the five lines; line order now does their work. `t1 * t2 / 2` without parentheses still means `(t1 * t2) / 2` because operators of the same level group from the left.',
      'The final step feeds the same inputs to both sides — a = 3, b = 5, c = 7, d = 4. The source gives 15, and the lines give t1 = 8, t2 = 3, t3 = 24, t4 = 12, r = 15. Seven steps including step 0: one source line, five detachments, one check. Five lines, four temporaries.',
      'The upper line is written in a small language-neutral notation and the lower lines in textbook three-address code without types; real compilers differ, for example LLVM IR writes `%1 = add i32 %a, %b`. `/` is real division, but these values divide exactly.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one detached operation per step, and stops after the value check.',
        'A Replay button and a playback strip sit below it. Holding the strip on step 3 shows `t1 * t2` leaving the source line once both of its operands have become temporaries.',
        'The expression and the input values are fixed, so each new line and the matching 15 can be quoted as they appear.',
      ],
    },

    useWhen: [
      'The article introduces intermediate code and needs a nested expression flattened into instructions of one operation each, with the order they come out in.',
      'A reader asks where the parentheses go once code is compiled, and the article wants the lowered lines doing the same job through their order and still producing the same value.',
    ],

    avoidWhen: [
      'The subject is parsing the expression or operator precedence during parsing. The expression here arrives already understood.',
      'The article is about lowering control flow such as if or while into jumps. There is one expression and no branch.',
      'The article is about register allocation or machine instructions. Temporaries here are unlimited names, not registers.',
    ],

    contrastWith: [
      {
        concept: 'flowGraphs',
        note: 'Lowering produces a flat list of simple instructions. Building a flow graph starts from that list and adds blocks and edges once there are branches.',
      },
      {
        concept: 'treeDropsSyntax',
        note: 'Dropping punctuation from the parse tree removes parentheses from the tree while keeping their grouping in its shape; lowering then turns that shape into an order of instructions.',
      },
      {
        concept: 'registerAllocation',
        note: 'Lowering creates as many temporaries as operations need; register allocation later has to fit them into a small fixed set of registers.',
      },
    ],
  },
};
