/**
 * flowGraphs 개념 선언.
 *
 * canonical facet 은 `facet:flowGraphs` — 같은 원시 네 문장(`let u = a * 3` · `let v = u - b` · `u` 를 바꾸는 문장 · `return u * v`)을
 * 손잡이 "흐름 꼴"(곧은 줄 · if · if-else · while)로 감싼다. 세 주소 코드가 다시 줄을 서고(명령 5 · 7 · 9 · 9), 리더 앞에서 잘려
 * 블록이 되고(1 · 3 · 4 · 4), 블록 끝에서 간선이 뻗고, 도달 훑기 뒤 정의-사용 사슬이 뻗는다(5 · 8 · 9 · 15). 넣기 둘이 닿는 읽기는
 * 0 · 1 · 1 · 6.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * `lowerToSimpler` 는 식 한 줄이 세 주소 코드 줄들로 낮춰지는 것(걸음 0 에 이미 된 결과), `basicBlock` 은 리더에서 자르기,
 * `edgesAreJumps` 는 블록 끝의 간선, `valueFlowsToUse` 는 곧은 줄의 사슬을 쥔다. 이쪽은 **감싸는 흐름 꼴을 바꾸면 블록 · 간선 ·
 * 사슬이 함께 갈리고, 한 읽기에 닿는 넣기가 둘이 된다**는 대비를 맡는다. 그래서 definition 은 straight line · if · if-else · while ·
 * more than one definition · reaching definitions 를 쥐고, leader 규칙 · fall-through · temporaries per operator 를 쓰지 않는다.
 *
 * 전제 (설명 글 `flowGraphs.md` 가 밝힌 것):
 *  - `@notation native` — 세 주소 코드는 교과서 표기. 임시(`t1` · `t2`)도 넣기로 친다.
 *  - 도달 훑기는 실제 컴파일러의 데이터 흐름 분석(도달 정의)이다. 코드를 돌리지 않는다(`a` · `b` 의 값이 없다).
 *  - 두 가닥을 하나로 푸는 것(파이)은 SSA 의 일이다 — 여기서는 닿는 데까지.
 *  - 코드 패널은 IR 을 여섯 언어로 옮긴 `flowGraph` 컴파일러 함수다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const flowGraphsConcept: FacetConceptSource = {
  id: 'flowGraphs',
  label: 'Flow Graphs: Blocks, Edges and Def-Use Chains',
  canonicalFacet: 'facet:flowGraphs',

  surface: {
    definition:
      'Wrapping the same statements as straight-line code, an if, an if-else or a while changes the control flow graph a compiler builds and, through reaching definitions, which reads can receive a value from more than one assignment.',
    exemplarKeywords: [
      'control flow graph',
      'CFG',
      'data flow analysis',
      'reaching definitions',
      'def-use chains',
      'use-def chains',
      'loop back edge',
      'fixed-point iteration',
      'dragon book',
      'intermediate representation',
      'compiler middle end',
      'how branches and loops shape analysis',
    ],
  },

  briefing: {
    observable: [
      'The source is always four statements — `let u = a * 3`, `let v = u - b`, a statement that changes `u`, and `return u * v` — shown beside its three-address code. The handle chooses what wraps the third statement: nothing, `if v > 8`, `if v > 8` with an `else`, or `while v > 8` (whose body also does `v = v - 3`).',
      'Turning the handle first re-lines the three-address code: going from Straight to if pushes in `t1 = v > 8` and `ifnot t1 goto L1`, and while adds `goto L1` at the end of the body. Instructions: 5 · 7 · 9 · 9.',
      'Then four stages. The code is cut in front of leader lines into blocks (1 · 3 · 4 · 4). Edges grow from block ends, "jump", "fall-through" or "backward" (0 · 3 · 4 · 4, with one backward edge under while); Straight has a single block and skips this step.',
      'A reaching sweep carries definitions along the edges into the next blocks\' "in" sets, repeated until nothing changes; only sweeps that changed something become steps. While needs two, because the loop body\'s `u@5` and `v@6` return to the loop head B2 only on the second sweep, together with `t1@3`.',
      'Finally chains run from definitions to reads (5 · 8 · 9 · 15). Where branches meet, `t2 = u * v` receives `u` from two definitions — line 5 and line 1 under if, line 5 and line 7 under if-else. Under while, six reads each receive two definitions. Readout "Reads with 2+ defs": 0 · 1 · 1 · 6.',
      'Steps per round including step 0: 4 · 7 · 8 · 9. Temporaries such as `t1` count as definitions, while `a` and `b` are never assigned and stay outside the chains. Nothing is executed. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Flow shape", with four positions: Straight, if, if-else (starting position) and while. Four readouts: "Blocks", "Edges", "Chains" and "Reads with 2+ defs".',
        'The move that makes the idea land is stepping from Straight to if: the code grows two lines, one block becomes three, and the read of `u` after the join gains a second definition.',
        'The code panel, labelled "Building the flow graph", starts empty with a "+ Add language" button. It shows `flowGraph`, a compiler function that takes instructions and names as numbers and computes blocks, edges, sweeps, chains and multi-definition reads, matching the stage. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces the control flow graph as the structure an optimizer works on and wants branches and loops shown changing its shape from the same statements.',
      'A reader asks why data flow analysis must iterate, and the article needs a loop where definitions reach the header only on the second sweep.',
      'The article motivates SSA by showing a read that two assignments can reach once a branch is introduced.',
    ],

    avoidWhen: [
      'The subject is a runtime trace or profiling — which path executes. Edges and chains here are structure written in the code.',
      'The article is about liveness analysis or register pressure. The analysis here is reaching definitions only.',
      'The article wants the φ that merges two definitions. Here the two reaching definitions are shown, not merged.',
    ],

    contrastWith: [
      {
        concept: 'basicBlock',
        note: 'Cutting at leaders is the first step of building the graph. The surrounding control structure determines where leaders appear, and so how many blocks there are.',
      },
      {
        concept: 'edgesAreJumps',
        note: 'Reading edges off each block\'s last instruction is a local rule; the graph as a whole, and whether it contains a backward edge, is what the surrounding control structure produces.',
      },
      {
        concept: 'valueFlowsToUse',
        note: 'In straight-line code every read has one reaching definition. Branches and loops are what give a read two, and need the iterated sweep to find them.',
      },
      {
        concept: 'lowerToSimpler',
        note: 'Lowering to three-address code is the step that produces the instructions; the flow graph is built on top of that output.',
      },
      {
        concept: 'ssaForm',
        note: 'A flow graph exposes reads reached by several definitions. SSA is the representation that gives each such read a single definition through φ.',
      },
    ],
  },
};
