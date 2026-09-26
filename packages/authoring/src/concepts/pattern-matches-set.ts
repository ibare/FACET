/**
 * patternMatchesSet 개념 선언.
 *
 * canonical facet 은 `facet:patternMatchesSet` — 무늬 `(<|>|=)=?` 를 선로로 편다. 걸음마다 길 하나를 따라가 그 길의
 * 글자를 이은 글줄이 아래 모임에 떨어진다. `<` · `<=` · `>` · `>=` · `=` · `==` 여섯, 크기 3 × 2 = 6. `!=` 는 없다.
 * 스스로 재생하고 멈춘다 (처음 화면을 넣어 일곱 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `regexBacktracking` + 조각 둘)
 *
 * 완제품은 엔진이 길을 하나씩 대어 보는 **값이 어떻게 자라는가**를, 형제 `backtrackOnFail` 은 욕심 되풀이의 되감기
 * 한 걸음을 쥔다. 이쪽은 글줄을 넣기 전의 물음 — **무늬가 무엇을 뜻하는가** 하나다. 그래서 definition 은
 * denotes · set of strings · each path spells one member 를 쥐고, engine · tries · greedy · cost 를 쓰지 않는다.
 *
 * 전제 (설명 글 `patternMatchesSet.md`): 펼치는 차례(앞 조각 바깥, `=?` 는 없음 먼저)는 펼치는 차례일 뿐 모임에는
 * 차례가 없다. 무늬는 어휘 분석기의 견줌 · 넣기 연산자 규칙 하나를 예로 삼은 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const patternMatchesSetConcept: FacetConceptSource = {
  id: 'patternMatchesSet',
  label: 'A Regular Expression Denotes a Set of Strings',
  canonicalFacet: 'facet:patternMatchesSet',

  surface: {
    definition:
      'A regular expression denotes a set of strings: every path through its alternatives and optional parts spells exactly one member, so (<|>|=)=? stands for six strings and nothing else.',
    exemplarKeywords: [
      'language of a regular expression',
      'regular language',
      'L(r) the set denoted by r',
      'list every string a regex matches',
      'alternation and optional operator',
      'formal language theory',
      'token pattern for comparison operators',
      'regex as a set rather than a test',
      'finite versus infinite regular language',
    ],
  },

  briefing: {
    observable: [
      'The pattern `(<|>|=)=?` is written at the top and laid out below it as a track. The first group is a three-way fork through cells `<`, `>`, `=`; the second is one `=` cell with a "skip" loop over it.',
      'At the start only the pattern is shown and the set below — "Strings the pattern means" — is empty, "Size: 0".',
      'Each step a dot follows one path from the start circle to the end circle, copying the letter of every cell it passes while the cells stay in place. At the end the copied string drops into the set: "This path spells <=".',
      'The strings drop in the order `<`, `<=`, `>`, `>=`, `=`, `==`. Each lands in a slot set by its choices — column by the first fork, row by whether the `=` is there — not by when it arrived.',
      'After the last path, "No path is left" and the set is full at size 6: three choices times present-or-absent. No two strings are the same, and `!=` is nowhere, because no path spells it.',
      'The pattern is one lexer rule used as an example, the one for comparison and assignment operators.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, seven steps counting the opening view, and stops when the set holds six strings.',
        'A Replay button and a playback strip sit below it. Holding any middle step shows the pattern unchanged while the set has grown by exactly one string.',
      ],
    },

    useWhen: [
      'The article introduces regular expressions formally and needs readers to see a pattern as the set it stands for before any matching happens.',
      'The reader asks what a lexer rule actually covers, and the article wants every string of one small rule listed, including one that is left out.',
    ],

    avoidWhen: [
      'The article is about how fast a regex engine runs or why it slows down. Nothing is matched against input here.',
      'The subject is a pattern with `*` or `+` and an infinite set. This pattern is finite and every member is shown.',
      'The article teaches regex syntax feature by feature. Only alternation and the optional mark appear.',
    ],

    contrastWith: [
      {
        concept: 'regexBacktracking',
        note: 'That a pattern names a set is a statement about meaning. A backtracking engine turns the same paths into a search for one that fits a given string, and its cost depends on how many paths it must walk.',
      },
      {
        concept: 'backtrackOnFail',
        note: 'Listing the set treats every path as equal and walks them all. Matching one string commits to a path first and retreats only when it fails.',
      },
      {
        concept: 'nfaToDfa',
        note: 'A pattern\'s paths describe the set; an automaton built from the pattern recognises the same set by reading a string instead of listing members.',
      },
    ],
  },
};
