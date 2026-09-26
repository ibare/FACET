/**
 * backtrackOnFail 개념 선언.
 *
 * canonical facet 은 `facet:backtrackOnFail` — 무늬 `[0-9]*00` 을 글줄 `1200` 에 댄다. 욕심 `[0-9]*` 가 넷을 다 먹어
 * 첫 `0` 이 끝 칸에서 막히고, `0` 하나를 내놓고 자리 3 으로 되감긴다. 다시 둘째 `0` 이 막혀 하나를 더 내놓고 자리 2 로
 * 되감기며, 한 번 맞았던 첫 `0` 의 맞음도 없던 일이 된다. 그다음 맞음. 실패 둘 · 되돌아감 둘. 스스로 재생하고 멈춘다
 * (처음 화면을 넣어 열세 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `regexBacktracking` + 조각 둘)
 *
 * 완제품은 되감기가 쌓여 **값이 지수로 자라는 것**을, 형제 `patternMatchesSet` 은 무늬가 **뜻하는 모임**을 쥔다.
 * 이쪽은 되감기 한 걸음 — 욕심껏 먹고, 막히면 가장 최근 선택에서 하나 내놓고 뒤를 다시 맞춘다. 그래서 definition 은
 * greedy · gives back one character · retries 를 쥐고, exponential · every path · cost · set 을 쓰지 않는다.
 *
 * 전제 (설명 글 `backtrackOnFail.md`): 무늬는 글줄 전체에 맞아야 한다. `*` 는 욕심이 있다 — 적게 먹고 시작하는 되풀이를
 * 두는 엔진도 있다. 이 글줄에서는 맞음으로 끝나 "더 내놓을 것이 없는" 안 맞음까지는 가지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const backtrackOnFailConcept: FacetConceptSource = {
  id: 'backtrackOnFail',
  label: 'Greedy Star Gives Back One Character and Retries',
  canonicalFacet: 'facet:backtrackOnFail',

  surface: {
    definition:
      'When a greedy quantifier has consumed too much for the rest of the pattern to fit, the regex engine gives back one character, rewinds to it, and retries the later parts from there.',
    exemplarKeywords: [
      'greedy quantifier',
      'regex gives back characters',
      'how regex backtracking works step by step',
      'greedy star then backtrack',
      'most recent choice point',
      'undoing an earlier partial match',
      'regex debugger trace',
      'why .* followed by a literal still matches',
      'anchored full-string match',
    ],
  },

  briefing: {
    observable: [
      'Four rows: the three parts of the pattern `[0-9]*00` in place; the text `1200` with positions from 0, a wall at its end and an "end" cell past the wall; a "Held by" row showing which part holds which character; a "Given back" row at the bottom. The two `0` parts are told apart by colour and by "#1" and "#2". An orange bar marks the position being looked at.',
      '`[0-9]*` eats `1`, `2`, `0`, `0` in four steps — "Held: 1200". Then `0` #1 is tried at the end cell: "no character is left". Fail.',
      'Back to `[0-9]*`: it gives back the last `0`, holding `120`, and the engine rewinds to position 3. `0` #1 matches there, but `0` #2 is blocked at the end cell. Fail again.',
      '`[0-9]*` gives back one more `0`, holding `12`, and the engine rewinds to position 2 — "Matches undone: 1": the earlier match of `0` #1 is wiped and returned to its place.',
      '`0` #1 matches position 2, `0` #2 matches position 3, and pattern and text end together: "The whole line matched." Two fails, two give-backs, five tries of a part against a character in all, thirteen steps counting the start.',
      'Position 3 belongs to three different parts over the run — first `[0-9]*`, then `0` #1, finally `0` #2 — and the Given back row keeps a mark for each of the first two holders.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, thirteen steps counting the opening view, and stops once the whole line has matched.',
        'A Replay button and a playback strip sit below it. Holding the second give-back shows `[0-9]*` down to `12` and the undone match of `0` #1 in the same moment.',
        'The pattern and the text are fixed, so an article can quote each held string and position as it appears.',
      ],
    },

    useWhen: [
      'The reader expects a greedy `*` to fail when it swallows too much, and the article needs to show the engine handing characters back until the rest fits.',
      'The article explains that undoing a choice also undoes every match made after it, and needs a concrete case where a part that already matched is sent back.',
    ],

    avoidWhen: [
      'The article is about lazy or reluctant quantifiers. The star here is greedy only.',
      'The subject is regex engines slowing to a crawl on hostile input. This run ends in a match after two retreats.',
      'The point is matching a substring anywhere in a longer text. The pattern here must cover the whole line.',
    ],

    contrastWith: [
      {
        concept: 'regexBacktracking',
        note: 'One give-back and retry is the step itself. When no path can succeed, those steps compound across every choice point, and the total grows exponentially with the input.',
      },
      {
        concept: 'patternMatchesSet',
        note: 'The set a pattern means is fixed before any text arrives. Backtracking is what an engine does to find one member of that set equal to a particular string.',
      },
      {
        concept: 'acceptState',
        note: 'A DFA never takes a character back: it reads each once and judges by the state it stops in. The retreat belongs to engines that commit to a guess and must undo it.',
      },
      {
        concept: 'backtracking',
        note: 'General backtracking undoes a choice to explore every arrangement. A regex engine undoes the latest greedy choice only until one arrangement fits, then stops.',
      },
    ],
  },
};
