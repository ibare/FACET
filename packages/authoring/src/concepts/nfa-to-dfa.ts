/**
 * nfaToDfa 개념 선언.
 *
 * canonical facet 은 `facet:nfaToDfa` — 키워드 `if` 와 이름 `(i|f)(i|f)*` 를 ε 옮김 둘로 합친 NFA(자리 여섯, 받는 자리
 * 3 `IF` · 5 `NAME`, 글자 `i` · `f`)를 부분집합 구성으로 DFA 로 바꾼다. D0 `{0, 1, 4}`(ε-닫힘) · D1 `{2, 5}` · D2 `{5}` ·
 * D3 `{3, 5}`. 새로 선 것 셋 · 이미 있던 것을 가리킨 것 다섯, DFA 자리 넷 · 옮김 여덟. D3 는 `IF` · `NAME` 둘 다 품지만
 * 규칙 열에서 앞선 `IF` 로 받는다. 스스로 재생하고 멈춘다 (처음 화면을 넣어 열 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `finiteAutomata` + 조각 셋)
 *
 * 완제품은 같은 구성을 손잡이로 키워 **값**(DFA 자리 두 배)을 잰다 — 그쪽 NFA 에는 ε 옮김이 없다. 이쪽은 구성 한 판의
 * 규칙 자체 — **함께 있을 수 있는 NFA 자리 모임 하나가 DFA 자리 하나가 된다**, ε-닫힘, 두 규칙을 한 기계로 합쳤을 때
 * 받는 자리의 우선. 그래서 definition 은 set of NFA states · ε-closure · merged rules · listed first 를 쥐고,
 * doubles · state explosion · one move per letter 를 쓰지 않는다.
 *
 * 전제 (설명 글 `nfaToDfa.md`): 할 일은 번호 차례로 꺼내고 한 덩이 안에서는 `i` 다음 `f`. ε-닫힘으로 자리가 붙는 것은
 * D0 한 번뿐이다. 글자는 `i` · `f` 둘만 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nfaToDfaConcept: FacetConceptSource = {
  id: 'nfaToDfa',
  label: 'Subset Construction (NFA State Sets Become DFA States)',
  canonicalFacet: 'facet:nfaToDfa',

  surface: {
    definition:
      'The subset construction makes each set of NFA states that can be occupied together, after ε-closure, into one DFA state; a set holding two rules\' accepting states takes the rule listed first.',
    exemplarKeywords: [
      'subset construction',
      'powerset construction',
      'epsilon closure',
      'ε-transitions',
      'convert NFA to DFA by hand',
      'Rabin and Scott',
      'combining lexer rules into one automaton',
      'keyword and identifier in one DFA',
      'lex and flex rule priority',
      'NFA is in several states at once',
    ],
  },

  briefing: {
    observable: [
      'Above is an NFA of six states, 0 to 5, over the letters `i` and `f`. From start 0, two ε arrows split into a keyword branch spelling `if` (accepting at 3 as `IF`) and a name branch `(i|f)(i|f)*` (accepting at 5 as `NAME`). Below, the DFA starts empty: "Start state: 0. The DFA is still empty."',
      'Step 1 gathers every state reachable from 0 by ε alone, `{0, 1, 4}`, as D0. A "To do" list shows which DFA states are still waiting.',
      'Each later step takes one DFA state and one letter: copies of the NFA states reached drop down and clump together. A new set gets a border and the next number — `i` from D0 gives `{2, 5}` as D1, `f` gives `{5}` as D2, `f` from D1 gives `{3, 5}` as D3. A set already built receives only an arrow: "From D1 on i: {5}. Already a state: D2."',
      'After D2 and D3 are processed on both letters (all four go to `{5}`, D2), "To do: none". The DFA ends with 4 states and 8 transitions; three sets were new and five pointed to existing ones.',
      'A DFA state accepts if it holds any NFA accepting state. D1 `{2, 5}` and D2 `{5}` accept as `NAME`; D3 `{3, 5}` holds both `IF` and `NAME` and is labelled `IF`, the rule listed earlier. D0 does not accept.',
      'ε-closure adds states only once, at D0; every later move lands on states with no outgoing ε, so the closure equals the move. The run takes ten steps counting the start.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, ten steps counting the opening view, and stops when nothing is left to do.',
        'A Replay button and a playback strip sit below it. Holding the step that creates D3 shows the one clump that contains accepting states of both rules.',
      ],
    },

    useWhen: [
      'The article walks through converting an NFA to a DFA and needs each step visible: which set was taken, which letter, and whether the resulting set is new.',
      'The reader asks how a lexer generator joins a keyword rule and an identifier rule into one machine, and why the keyword is listed before the identifier.',
    ],

    avoidWhen: [
      'The article is about how large DFAs can become. This construction ends with four states and shows no growth.',
      'The subject is building an NFA from a regular expression. The NFA here is given.',
      'The point is minimising a DFA or merging equivalent states. The four states are left as built.',
    ],

    contrastWith: [
      {
        concept: 'finiteAutomata',
        note: 'One run of the construction shows its rule: reachable sets become states. How many sets a pattern can produce, and how that grows as the pattern lengthens, is the cost side of the same conversion.',
      },
      {
        concept: 'stateEatsChar',
        note: 'Building folds the NFA\'s several simultaneous positions into single states ahead of time; running the result is then just one arrow per character.',
      },
      {
        concept: 'acceptState',
        note: 'In the construction each new state inherits acceptance from the NFA states it contains; the verdict on a particular input still comes from the one state that input stops in.',
      },
      {
        concept: 'longestMatchWins',
        note: 'Rule order settles which token kind an accepting state reports when two rules finish together. How far to read before accepting is a separate rule, preferring the longest reach.',
      },
    ],
  },
};
