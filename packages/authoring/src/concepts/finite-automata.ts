/**
 * finiteAutomata 개념 선언.
 *
 * canonical facet 은 `facet:finiteAutomata` — "끝에서 k 째 글자가 a" 인 글을 받는 무늬 `(a|b)*a(a|b)…` 의 NFA(자리 k + 1,
 * ε 옮김 없음)를 부분집합 구성으로 DFA 로 바꾸고, 지은 DFA 로 입력을 걷는다. 손잡이 둘: 끝에서 몇째 k(1 · 2 · 3 · 4, 처음 2),
 * 입력(ab · abab · abbab · aabba, 처음 abbab). k 를 올리면 NFA 는 2 · 3 · 4 · 5 로 한 칸씩, DFA 는 2 · 4 · 8 · 16 으로 두 배씩
 * 자란다. 걷는 걸음은 k 와 상관없이 글자 수 그대로. 입력만 바꾸면 기계는 다시 짓지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 글자 하나에 옮김 하나(`stateEatsChar`) · 멈춘 자리의 판정(`acceptState`) · 자리 모임이
 * 한 자리로 뭉치는 구성 한 판(`nfaToDfa`). 이쪽은 손잡이로 **바꾼 값**을 잰다: 무엇이 두 배로 늘고(DFA 자리) 무엇이
 * 그대로인가(걷는 걸음). 그래서 definition 은 state count doubles · NFA grows by one · still one step per letter 를 쥐고,
 * 조각이 독점한 ε-closure · accepting state decides · single transition labelled 를 쓰지 않는다.
 *
 * 전제 (설명 글 `finiteAutomata.md`): 무늬는 `{n}` 없이 풀어 쓴 장난감 무늬. DFA 는 최소화하지 않지만 이 무늬의
 * DFA 는 2^k 보다 작아질 수 없다(교과서의 사실). 덩이 번호는 생긴 차례. 코드 패널은 **지어진 DFA 를 걷는 함수**만 IR → 여섯
 * 언어로 옮긴 것이고, 부분집합 구성은 알고리즘이 지은 표로 넘긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const finiteAutomataConcept: FacetConceptSource = {
  id: 'finiteAutomata',
  label: 'Finite Automata (What Turning an NFA into a DFA Costs)',
  canonicalFacet: 'facet:finiteAutomata',

  surface: {
    definition:
      'Converting an NFA into an equivalent DFA can double the state count each time the pattern grows by one position, while the NFA adds a single state and the DFA still reads each letter once.',
    exemplarKeywords: [
      'NFA vs DFA',
      'DFA state explosion',
      'exponential blow-up of the subset construction',
      'k-th symbol from the end language',
      '2^k states lower bound',
      'deterministic versus nondeterministic finite automaton',
      'lexer generator transition tables',
      'time versus space in regex engines',
      'regular expression to automaton',
    ],
  },

  briefing: {
    observable: [
      'The pattern `(a|b)*a(a|b)` (for k = 2) is shown with its NFA below it: state 0 with a self-loop on a, b, then `0 -a-> 1`, then one state per extra `(a|b)`. There are no ε moves; start is 0 and the accepting state is k, so the NFA has k + 1 states.',
      'The DFA is built one layer per step. Each DFA state is a set of NFA states, starting from `D0 {0}`; new sets from the previous layer are taken in number order and moved on a then b. A set seen before reuses its number, a new one gets the next number. The last layer adds nothing and only closes transitions.',
      'For k = 2 the finished DFA reads `D0 {0}`, `D1 {0, 1}`, `D2 {0, 1, 2}`, `D3 {0, 2}`, each with an a-arrow and a b-arrow. Sets holding NFA state 2 are drawn as accepting.',
      'Then the input is walked: each letter enters the machine and disappears while a marker moves along one transition — "Letter #1 a: D0 → D1". With `abbab` the walk stops at `D3 {0, 2}`: "holds NFA accept state 2 → accepted". The default round is 11 steps: start, four layers, five letters, verdict.',
      'Moving "From the end" through 1, 2, 3, 4 gives NFA states 2, 3, 4, 5 and DFA states 2, 4, 8, 16 (transitions 4 to 32). Earlier DFA states reappear with the same numbers and sets; only the accepting marks move to the new accept state.',
      'Changing "Input" alone does not rebuild the machine — "Same k, same DFA". Only the walk and the verdict are redone, and the walk always takes as many moves as the input has letters. Readouts carry NFA states, DFA states and Walk steps.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a four-position "From the end" slider (k from 1 to 4, starting at 2) and a four-position "Input" slider (ab, abab, abbab, aabba, starting at abbab).',
        'The move that makes the idea land is stepping k upward and watching DFA states double while NFA states and Walk steps barely move; switching the input afterwards shows the built machine being reused as is.',
        'The code panel, labelled "Walking the DFA", starts empty with a "+ Add language" button. It shows only the walk over a built table — `delta[cur * 2 + word[i]]` per letter, then the accept table — in Python, JavaScript, TypeScript, Java, C++ and C#; the construction is passed in as data.',
      ],
    },

    useWhen: [
      'The article claims determinising a regular expression is always cheap, and needs a family of patterns where each extra position doubles the DFA.',
      'The article explains why lexers and fast regex engines precompute a DFA: the table may be large, but reading stays one move per character no matter how the pattern grows.',
    ],

    avoidWhen: [
      'The subject is DFA minimisation algorithms such as Hopcroft\'s. No minimisation step is performed; the size here is already the lower bound for this pattern.',
      'The article is about ε-transitions or Thompson\'s construction of an NFA from a regex. This NFA has no ε moves and is given, not built.',
      'The point is automata over large real alphabets or Unicode. The alphabet here is just a and b.',
    ],

    contrastWith: [
      {
        concept: 'nfaToDfa',
        note: 'The subset construction itself is the rule that each reachable set of NFA states becomes one DFA state. What that rule costs in size, and what it saves at run time, is the trade in comparing the sizes of the two machines.',
      },
      {
        concept: 'stateEatsChar',
        note: 'One move per character is what makes a DFA fast. Holding that fixed while the machine grows exponentially is the other side of the same bargain.',
      },
      {
        concept: 'acceptState',
        note: 'Judging by the state reached at the end is how any DFA answers. When the DFA is built from an NFA, that final state is a set of NFA states, and it accepts when it holds the NFA\'s accept state.',
      },
      {
        concept: 'regexBacktracking',
        note: 'Both price the same question. A backtracking engine pays in time on inputs that fail; a precomputed DFA pays in states once and never retries a letter.',
      },
      {
        concept: 'ahoCorasick',
        note: 'Aho-Corasick also trades room for a text-length scan, but the room grows with the number of patterns; a single pattern\'s DFA grows with how far back it must remember.',
      },
    ],
  },
};
