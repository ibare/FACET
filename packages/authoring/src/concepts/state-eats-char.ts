/**
 * stateEatsChar 개념 선언.
 *
 * canonical facet 은 `facet:stateEatsChar` — 키워드 셋 `for` · `from` · `function` 을 알아보는 DFA(자리 14 · 옮김 13, 시작 0)에
 * `function` 여덟 글자를 넣는다. 걸음마다 맨 앞 글자 하나가 먹히고 자리가 한 번 옮는다. 나가는 길이 여럿인 자리는 1 하나
 * (`o` · `r` · `u`)이고 `u` 가 하나를 골라 자리 2 ~ 6 은 한 번도 밟지 않는다. 스스로 재생하고 멈춘다 (아홉 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `finiteAutomata` + 조각 셋)
 *
 * 완제품은 NFA → DFA 변환의 **값**(자리 두 배 · 걸음 그대로)을, `acceptState` 는 멈춘 자리의 판정을, `nfaToDfa` 는
 * 자리 모임이 뭉치는 구성을 쥔다. 이쪽은 걷기의 한 걸음 — **글자 하나를 먹고 옮김 하나를 따른다** 하나다. 그래서
 * definition 은 consumes one character · single transition labelled · next state fixed 를 쥐고, accept · reject ·
 * subset · doubles 를 쓰지 않는다. 판정은 이 장면이 하지 않는다 (마지막 자리가 받는 자리 13 이지만 판정은 없다).
 *
 * 전제 (설명 글 `stateEatsChar.md`): 기계의 글자는 세 낱말에 든 것뿐이다. 실제 어휘 분석기의 기계는 이름 · 수 ·
 * 연산자 규칙까지 합쳐 훨씬 크다. 막힘(옮김이 없는 글자)은 이 입력에서 일어나지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stateEatsCharConcept: FacetConceptSource = {
  id: 'stateEatsChar',
  label: 'One Character, One Transition (A DFA Step)',
  canonicalFacet: 'facet:stateEatsChar',

  surface: {
    definition:
      'A deterministic automaton consumes one input character per step and follows the single transition labelled with it, so even from a state with several exits the next state is already fixed.',
    exemplarKeywords: [
      'DFA transition function',
      'delta(state, character)',
      'transition table lookup',
      'state diagram trace',
      'keyword recognizer',
      'trie of keywords for, from, function',
      'deterministic means one choice per symbol',
      'no backtracking in a DFA',
      'how a lexer reads a keyword',
    ],
  },

  briefing: {
    observable: [
      'A machine of 14 states and 13 transitions recognises the keywords `for`, `from` and `function`. All three start with `f`, so the path is shared up to state 1, which then splits three ways on `o`, `r` and `u`. Double circles mark states 3 `FOR`, 6 `FROM` and 13 `FUNCTION`.',
      'The input `function` sits in an Input row. The opening view reads "Start state: 0".',
      'Each step removes the first character of the input and moves the marker along one arrow: "Ate: f · state 0 → 1 · Ways out: 1 · taken: f".',
      'At step 2 the machine is at state 1 with three ways out; `u` takes one — "Ways out: 3 · taken: u" — and the labels of the two unused arrows, `o` and `r`, stay dashed.',
      'The walk continues 7 → 8 → 9 → 10 → 11 → 12 → 13, one arrow per character. Nine states are stood on in all, eight characters plus the start, and states 2 to 6 are never visited.',
      'The last character lands on state 13, but no accept or reject verdict is given. The machine only knows the three words; a real lexer\'s machine also holds rules for names, numbers and operators.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, nine steps counting the opening view, and stops after the last `n`.',
        'A Replay button and a playback strip sit below it. Holding step 2 shows the only state with more than one exit and the character that decides which one is taken.',
      ],
    },

    useWhen: [
      'The article defines a DFA step for the first time and needs the transition function in action: current state and next character in, exactly one next state out.',
      'The reader imagines the machine trying several branches at a fork, and the article needs a fork where the character alone settles the way with no looking back.',
    ],

    avoidWhen: [
      'The article is about deciding whether a string is accepted. This walk never states a verdict.',
      'The subject is nondeterminism, ε-moves, or being in several states at once. The machine here is deterministic throughout.',
      'The point is what happens when no transition matches. Every character here has its arrow.',
    ],

    contrastWith: [
      {
        concept: 'acceptState',
        note: 'Moving on each character is the reading half of a DFA; accepting or rejecting is decided separately, once the input runs out, by where the reading left it.',
      },
      {
        concept: 'nfaToDfa',
        note: 'A DFA can take one arrow per character because the subset construction already folded every set of possible NFA positions into a single state.',
      },
      {
        concept: 'finiteAutomata',
        note: 'One transition per character is the run-time promise. The price paid for it, in how many states the machine needs, is a separate question about construction.',
      },
      {
        concept: 'manyPatternsOnePass',
        note: 'Both walk a shared-prefix tree of words one character at a time. Multi-pattern search also has to find every occurrence inside a longer text, while this machine reads one token from its start.',
      },
    ],
  },
};
