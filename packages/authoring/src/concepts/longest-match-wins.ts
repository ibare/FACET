/**
 * longestMatchWins 개념 선언.
 *
 * canonical facet 은 `facet:longestMatchWins` — 한 줄 `if iffy >= 10` 의 네 자리에서 맞는 규칙들이 후보로 서고,
 * 가장 멀리 뻗은 것이 집는다. 길이가 같으면 규칙 열에서 앞선 것이 집는다 (자리 0: `IF` 2 · `NAME` 2 → `IF`).
 * 자리 3 이 눈여겨볼 곳이다 — `IF` 2 · `NAME` 4 → `NAME iffy`. 스스로 재생하고 멈춘다 (아홉 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `tokenization` + 조각 둘)
 *
 * 완제품은 원문을 토큰 줄로 바꾸는 단계 전체를 쥔다. 형제 `splitIntoTokens` 는 빈칸이 경계를 정하고 버려지는
 * 장면이다. 이쪽은 **한 자리에서 규칙 여럿이 맞을 때의 겨룸** 하나 — 길이가 먼저, 규칙 차례는 동률일 때만.
 * 그래서 definition 은 several rules · same position · farthest · tie · listed first 를 쥐고, whitespace ·
 * discarded 와 완제품의 first stage 를 쓰지 않는다.
 *
 * 전제 (설명 글 `longestMatchWins.md`): 규칙 열은 장난감 언어의 서른두 줄(키워드 열여섯 · `NAME` · `NUM` ·
 * 연산자 열넷), 화면에는 그 자리에서 맞는 규칙만 선다. 입력은 한 줄.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const longestMatchWinsConcept: FacetConceptSource = {
  id: 'longestMatchWins',
  label: 'Longest Match Wins (Maximal Munch, Ties by Rule Order)',
  canonicalFacet: 'facet:longestMatchWins',

  surface: {
    definition:
      'When several lexer rules match at the same position, the one reaching farthest takes the token and rule order breaks only equal-length ties, so iffy is a name rather than the keyword if.',
    exemplarKeywords: [
      'maximal munch',
      'longest match rule',
      'keyword versus identifier conflict',
      'why is iffy not the keyword if',
      'rule priority in lex or flex',
      '>= lexed as one operator',
      'reserved word recognition',
      'first listed rule wins a tie',
      'lexer ambiguity resolution',
    ],
  },

  briefing: {
    observable: [
      'The line `if iffy >= 10` is read from the left, one position at a time. At each position the rules that match stand up as candidates, each with the length it can reach.',
      'Position 0: `IF` reaches 2 and `NAME` reaches 2. Same length, so the rule listed earlier takes it — `IF` is rule #3, `NAME` rule #17.',
      'Position 3: `IF` reaches 2 but `NAME` runs on through `i`, `if`, `iff` to all four letters. "The farthest reach takes it": `NAME iffy`. The word begins with `if` and still does not become the keyword.',
      'Position 8: `OP >=` reaches 2 and `OP >` reaches 1, so `>=` is one token. Position 11: only `NUM` matches, giving `NUM 10`. Blanks match no rule and are passed over.',
      'The run ends with four tokens, `IF · NAME iffy · OP >= · NUM 10`. Each position takes two steps — candidates reaching out, then one taking the token.',
      'The rule list is a toy language of thirty-two lines: sixteen keywords, then `NAME` as `[a-z]([a-z]|[0-9])*`, then `NUM`, then fourteen operators. Only the rules that match at the current position are drawn.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, nine steps counting the opening view, and stops after `NUM 10`.',
        'A Replay button and a playback strip sit below it. Holding position 3 shows `IF` stopping at length 2 while `NAME` reaches 4 — the moment where length beats rule order.',
      ],
    },

    useWhen: [
      'The reader assumes keywords always win and needs to see a word starting with `if` lexed as a name because a longer match exists.',
      'The article explains how a lexer generator such as lex orders its rules, and must make clear that the order only matters when two candidates are the same length.',
    ],

    avoidWhen: [
      'The subject is routing tables and longest prefix match on addresses. The rules here are token patterns over source characters.',
      'The article is about blanks and why spacing does not change a program. Blanks here are simply passed over.',
      'The point is how a regex engine searches within one pattern. Each rule here reports only how far it reaches, not how it got there.',
    ],

    contrastWith: [
      {
        concept: 'tokenization',
        note: 'Tokenization is the whole pass that turns characters into labelled tokens. The longest-match rule is the single policy it relies on whenever more than one cut would be valid at the same spot.',
      },
      {
        concept: 'splitIntoTokens',
        note: 'Where a blank or a change of character kind stands, the end of a token is not in question. The contest arises only where several rules could each end the token at a different length.',
      },
      {
        concept: 'nfaToDfa',
        note: 'Merging the keyword and name rules into one automaton produces states that accept for both; the listed-first rule then labels that state. Maximal munch adds the other half: keep reading while the merged machine can still go on.',
      },
      {
        concept: 'longestPrefixMatch',
        note: 'Both prefer the longest candidate, but a router compares one address against stored prefixes, while a lexer extends several patterns across the remaining input and consumes what the winner covered.',
      },
    ],
  },
};
