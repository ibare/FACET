/**
 * regexBacktracking 개념 선언.
 *
 * canonical facet 은 `facet:regexBacktracking` — 무늬 `(a|aa)*b` 를 명령 아홉(CHAR · SPLIT · JMP · MATCH)으로 옮긴
 * 역추적 엔진이 글줄 a…a 에 대어 본 수를 자리마다 기둥으로 세운다. 손잡이 둘: a 의 수(2 · 4 · 6 · 8 · 10 · 12, 처음 6),
 * 끝 글자(b · a, 처음 a). 끝 글자 a(안 맞음)면 대어 본 글자가 14 · 43 · 119 · 318 · 839 · 2203 으로 두 칸마다 약 2.6 배,
 * b(맞음)면 a 의 수 + 3 으로 곧게 는다. 아래 가는 막대는 같은 무늬 DFA 의 옮김 수(글자 수 그대로).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `patternMatchesSet` 은 무늬가 글줄 모임을 뜻한다는 장면, `backtrackOnFail` 은 욕심 되풀이가 글자 하나를
 * 내놓고 되감는 한 걸음이다. 이쪽은 걸음 하나가 아니라 **대어 본 수가 어떻게 자라는가**, 그리고 손잡이로 갈리는
 * 대비 둘(안 맞는 글줄 ↔ 맞는 글줄, 역추적 ↔ DFA)을 쥔다. 그래서 definition 은 fails · exponentially · every path ·
 * matching input stays linear · DFA 를 쥐고, 조각이 독점한 greedy · gives back one character · set of strings 를 쓰지 않는다.
 *
 * 전제 (설명 글 `regexBacktracking.md`): 무늬는 글줄 전체에 맞아야 한다. 갈래는 왼쪽 먼저, `*` 는 욕심껏,
 * 막히면 가장 최근 갈림길로. 대어 본 수는 CHAR 명령 실행 수(글줄 끝 너머 끝 칸 포함). 한 걸음은 한 자리에서 시작한 길을
 * 다 대 본 것. 코드 패널은 엔진 자체(`matchAll` · `matchFrom`)를 IR → 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const regexBacktrackingConcept: FacetConceptSource = {
  id: 'regexBacktracking',
  label: 'Regex Backtracking (What a Failed Match Costs)',
  canonicalFacet: 'facet:regexBacktracking',

  surface: {
    definition:
      'A backtracking regex engine rejects a failing string only after trying every path through the pattern, so its work grows exponentially with input length, while a matching string and a DFA stay linear.',
    exemplarKeywords: [
      'catastrophic backtracking',
      'ReDoS',
      'regular expression denial of service',
      'exponential regex matching time',
      'why is my regex so slow',
      'PCRE and Perl-style regex engines',
      'backtracking engine versus DFA engine',
      'RE2 and Thompson NFA guarantee linear time',
      'ambiguous alternation inside a star',
      'regex performance on non-matching input',
    ],
  },

  briefing: {
    observable: [
      'The pattern `(a|aa)*b` sits above a text of a\'s, one cell per position plus a dashed "end" cell past the last letter. Each cell grows a bar counting how many letters the engine tried there.',
      'The engine runs the pattern as nine instructions (CHAR, SPLIT, JMP, MATCH). It tries the left alternative first, takes the star greedily, and on a dead end returns to the most recent choice point. The pattern has to match the whole text.',
      'The default round (six a\'s, last letter a) takes ten steps counting the start. First a greedy descent along `a` to the end, six tries; then each position from the end cell back to #0 is exhausted in turn — "Every way from #5 tried, all blocked". The orange share added per step grows leftward: 3, 3, 6, 10, 17, 28, 46.',
      'Final bar heights from the left are 3, 4, 7, 11, 18, 29, 47: each is the sum of the two before it, because a position is reached either one `a` or one `aa` earlier. The verdict reads "no match, only after every way was tried": 119 letters tried, 66 branches re-chosen.',
      'Moving "Count of a" through 2, 4, 6, 8, 10, 12 gives 14, 43, 119, 318, 839, 2203 letters tried — about 2.6 times for every two more letters. The bar scale is fixed at the largest round, so each increase visibly outruns the last.',
      'Switching "Last letter" to b flips the picture: after the descent, `a` and `aa` fail at the end and `b` matches at once. Each a-cell shows 1, the b-cell 3, the end cell 0, and letters tried are the count of a plus 3 (5 up to 15).',
      'A thin bar underneath shows "DFA moves", one per letter of the text — 12 for twelve a\'s. Readouts carry Letters tried, Branches re-chosen and DFA moves.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a six-position "Count of a" slider (2 to 12, starting at 6) and a two-position "Last letter" slider (b or a, starting at a).',
        'The move that makes the idea land is raising the count of a with the last letter left at a, then flipping the last letter to b at the largest count: 2203 letters tried against 15.',
        'The code panel, labelled "Backtracking machine", starts empty with a "+ Add language" button. It shows the engine itself — `matchAll` resets the counters and calls `matchFrom` at instruction 0, position 0 — carrying the same meaning in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article warns about a regex that hangs a server on crafted input and needs the number of tries climbing out of proportion as the input grows by two letters.',
      'The reader believes regex matching always takes time proportional to the text, and the article needs the case where matching input is fast and non-matching input explodes.',
      'The article is choosing between a backtracking engine and an automaton-based one and wants the two counts side by side on the same pattern.',
    ],

    avoidWhen: [
      'The article teaches regex syntax or how to write a pattern. There is one fixed pattern and only the text changes.',
      'The subject is backreferences, lookaround or other features that force backtracking. The pattern here uses only alternation, star and literals.',
      'The point is a single backtrack step — giving back one character and retrying. Steps here bundle whole exhausted positions and show totals.',
    ],

    contrastWith: [
      {
        concept: 'backtrackOnFail',
        note: 'Giving back one character after a greedy overshoot is the mechanism; how many such retreats pile up on an input that cannot match, and how fast that number grows, is the cost that mechanism carries.',
      },
      {
        concept: 'patternMatchesSet',
        note: 'Every path through a pattern spells one string of its set. The engine\'s cost comes from walking those paths one at a time, and an ambiguous pattern offers many paths to the same prefix.',
      },
      {
        concept: 'finiteAutomata',
        note: 'Both answer the same membership question at a price. Backtracking pays in time on bad inputs; building a DFA pays in states up front and then reads each letter once.',
      },
      {
        concept: 'backtracking',
        note: 'Backtracking search enumerates every arrangement on purpose. A regex engine wants just one successful path, and the blow-up appears only when no path exists and it must exhaust them all.',
      },
    ],
  },
};
