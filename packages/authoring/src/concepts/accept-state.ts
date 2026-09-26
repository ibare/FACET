/**
 * acceptState 개념 선언.
 *
 * canonical facet 은 `facet:acceptState` — 무늬 `[0-9]+(e[0-9]+)?` 의 DFA(자리 A · B · C · D, 옮김 다섯, 받는 자리 B · D)에
 * `120e` 를 넣는다. 세 글자 동안 받는 자리 B 에 서지만 마지막 `e` 가 C 로 옮기고 입력이 떨어진다. 판정은 C 하나로 —
 * 안 받음. 어느 글자에서도 막히지 않았다. 스스로 재생하고 멈춘다 (여섯 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `finiteAutomata` + 조각 셋)
 *
 * 완제품은 NFA → DFA 변환의 값을, `stateEatsChar` 는 글자 하나에 옮김 하나를, `nfaToDfa` 는 구성을 쥔다. 이쪽은
 * **판정** 하나 — 입력을 다 먹은 뒤 멈춘 자리만 센다, 지나온 받는 자리는 세지 않는다. 그래서 definition 은
 * accepts · stops · after the last character · passed earlier do not count 를 쥐고, transition labelled · subset ·
 * doubles 를 쓰지 않는다.
 *
 * 전제 (설명 글 `acceptState.md`): 막혀서 안 받는 것과 끝까지 먹고 선 자리로 안 받는 것은 다르다 — 여기는 뒤쪽.
 * 어휘 분석기가 지나친 받는 자리를 따로 적어 두는 것은 기계 바깥의 기록이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const acceptStateConcept: FacetConceptSource = {
  id: 'acceptState',
  label: 'Only the Stopping State Decides Acceptance',
  canonicalFacet: 'facet:acceptState',

  surface: {
    definition:
      'A DFA accepts or rejects a string by the state it stops in after the last character; accepting states passed on the way do not count, so 120e is rejected though 120 would be accepted.',
    exemplarKeywords: [
      'accepting state',
      'final state',
      'double circle in a state diagram',
      'accept or reject a string',
      'language membership test',
      'number with exponent token',
      'scientific notation like 1e5',
      'rejected without getting stuck',
      'automaton has no memory of the path',
    ],
  },

  briefing: {
    observable: [
      'The pattern `[0-9]+(e[0-9]+)?`, a number that may carry an exponent, is drawn as four states: A (start), B, C, D. Arrows: `A -[0-9]-> B`, `B -[0-9]-> B`, `B -e-> C`, `C -[0-9]-> D`, `D -[0-9]-> D`. B and D are double circles, "accepting state".',
      'The input `120e` is read one character per step, and a strip "Characters read · positions stood on" records each character with the state it led to.',
      '`1` moves A → B, "an accepting state"; `2` and `0` keep it at B, each time an accepting state. After three characters the input read so far, `120`, would have been accepted.',
      '`e` moves B → C. C is not accepting: an `e` has been read but no exponent digit yet. Then the input runs out.',
      'The verdict: "Input used up. Stopped at C, not an accepting state: rejected", followed by "Steps that stood on an accepting state before the stop: 3. They do not count".',
      'All four characters were consumed and none lacked a transition, so the rejection comes from where the machine stopped, not from getting stuck. The run takes six steps counting the start.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, six steps counting the opening view, and stops on the verdict.',
        'A Replay button and a playback strip sit below it. Holding step 3 shows the machine on accepting state B with one character still to read, the moment a reader might wrongly call it accepted.',
      ],
    },

    useWhen: [
      'The reader thinks an automaton accepts as soon as it touches an accepting state, and the article needs an input that passes one three times and still ends rejected.',
      'The article defines acceptance formally and wants the rule shown on a concrete token: the answer depends only on the final state, not on the history.',
    ],

    avoidWhen: [
      'The article is about a lexer remembering the last accepting position and backing up to it. That bookkeeping sits outside the machine and is not performed here.',
      'The subject is rejection because a character has no transition. Every character here has one.',
      'The point is building the automaton from a pattern. The four-state machine is given complete.',
    ],

    contrastWith: [
      {
        concept: 'stateEatsChar',
        note: 'Following one arrow per character says how a DFA reads; acceptance is the separate rule applied once reading ends, and it looks only at the state that reading produced.',
      },
      {
        concept: 'longestMatchWins',
        note: 'A lexer wants the longest prefix that forms a token, so it cares about accepting states passed on the way. A DFA judging a whole string ignores them; the lexer\'s memory of them is extra bookkeeping.',
      },
      {
        concept: 'nfaToDfa',
        note: 'After the subset construction a DFA state accepts if it contains any accepting NFA state. Whichever way a state became accepting, the verdict still rests on the one the input ends in.',
      },
    ],
  },
};
