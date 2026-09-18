/**
 * greedyDecoding 개념 선언.
 *
 * canonical facet 은 `facet:greedyDecoding` — 완제품이다. 프롬프트
 * `The best way to learn is` 의 끝 낱말 `is` 에서 다음 낱말 표를 걷는다. 낱말은
 * 알약, 갈래는 선, 끝 표식 `.` 은 오른쪽 벽이다. 첫 걸음만 손잡이의 등수(1 · 2 · 3)를
 * 고르고 그 뒤는 늘 1 등이다. 구슬의 넓이가 글 전체의 확률이라 걸음마다 줄어든다.
 * 1 등은 끝을 못 만나고 여섯 걸음을 다 치러 1.4 %, 2 등은 `by doing .` 로 닫혀
 * 25.2 %, 3 등은 `practice .` 로 15.0 % — 첫 걸음 확률(40 · 35 · 25)과 글 전체가
 * 엇갈린다. 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **걸음의 1 등과 글 전체의 1 등이 다르다** 는 주장이다.
 * definition 의 주어는 "걸음마다 가장 그럴듯한 낱말을 고르는 일" 이고 꼬리는 "곱셈 ·
 * 첫 선택 · 먼저 닫힘" 이다. 조각 `alwaysTheHighest` 가 맡는 **되풀이 · 고리 · 되밟음**
 * 어휘는 이 definition 과 keywords 에 넣지 않았다 — 화면에 되풀이 계기가 있어도
 * 그 낱말은 조각이 독점하게 두어 검색이 갈리게 했다 (observable 에는 적는다, 화면에
 * 실제로 있으므로). 반대로 조각 쪽은 "확률 · 곱 · 글 전체" 를 쓰지 않는다.
 * 낱말도 화면을 따라 갈랐다 — 이쪽은 word, 조각은 token.
 *
 * ── 전제
 *
 * 다음 낱말 표의 확률은 예로 정한 값이고 앞 낱말 하나만 본다. 화면 아래 한 줄이
 * 그렇게 적지만, writer 가 실제 모형의 수로 옮기지 않도록 avoidWhen 에도 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const greedyDecodingConcept: FacetConceptSource = {
  id: 'greedyDecoding',
  label: 'Greedy Decoding (Best Step, Not Best Sentence)',
  canonicalFacet: 'facet:greedyDecoding',

  surface: {
    definition:
      'Taking the most probable word at each generation step need not yield the most probable sentence, because sentence probability multiplies every step and a weaker first choice can close sooner and score higher.',
    exemplarKeywords: [
      'greedy decoding',
      'argmax decoding in language models',
      'locally optimal is not globally optimal',
      'sequence probability as a product of word probabilities',
      'why the most likely next word is not the most likely sentence',
      'end of sequence marker',
      'short sentences score higher',
      'deterministic text generation',
      'decoding strategy for an LLM',
      'giving up the first choice',
    ],
  },

  briefing: {
    observable: [
      'The next-word table is spread out as a graph of word pills: the walk starts at "is", the last word of the prompt "The best way to learn is", branches running forward are straight lines, branches that lead back to an earlier word bow outward as arcs, and the end mark "." stands as a wall on the right.',
      'A bead marks the end of the text as it grows, and its area is the whole-sentence probability, so it visibly shrinks with every word appended; the caption spells each multiplication as "× p% — the whole sentence is now …%".',
      'With the first step at rank 1 the walk takes "to" (40%), then "learn" (60%), then "is" (50%) and comes back to where it started: "to learn is to learn is" uses all six steps without meeting the end mark, each second pass winds the trail one layer further out, and the whole sentence finishes at 1.4% (the per-mille gauge reads 14).',
      'With the first step at rank 2 the walk takes "by" (35%), then "doing" (80%), then "." (90%) and closes after three words at 25.2%; at rank 3 it takes "practice" (25%) and "." (60%) and closes at 15.0%. The caption says the remaining steps cost nothing once the end mark is chosen.',
      'A table below the graph keeps one row per first-step rank, each with a bar for the first-step probability and a bar for the whole sentence; rows not yet walked show a dashed box reading "not walked yet", and a frame moves to the rank now being walked. Once all three are walked the first-step bars fall 40, 35, 25 while the sentence bars read 1.4, 25.2, 15.0.',
      'A third gauge counts words picked again inside the generated text, not counting the prompt: it reads 3 for rank 1 and 0 for ranks 2 and 3.',
      'Turning the handle rewinds the previous trail back to the fork at "is" before the bead swells again and sets off down the new branch.',
      'A line of small print under the graph states that the probabilities are example values chosen by hand and that the next word depends only on the previous word.',
    ],

    screen: {
      affordances: [
        'The screen walks rank 1 on arrival and then waits for the handle, keeping each finished result in the table below.',
        'A segmented slider labelled First-step rank offers 1, 2 and 3, opening at 1; only the first step follows it, and every later step always takes rank 1.',
        'Playback controls sit beside three live gauges: First step %, Whole sentence ‰ and Repeats in generated text.',
        'A code panel labelled Greedy walk holds the same walk as a program, and the table, prompt and six-step limit are fixed, so every percentage on screen can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article claims that picking the likeliest word each time gives the likeliest text, and the reader needs a counterexample with numbers: 40% beats 35% on the first step, yet the sentences end at 1.4% against 25.2%.',
      'The prose explains why a decoder scores a whole output rather than its next word, and it needs the reader to see the product shrinking step by step, which the bead does as an area.',
      'A reader wonders why an end-of-sequence mark changes which output wins; here the branch that closes early stops paying while the branch that never closes pays for all six steps.',
    ],

    avoidWhen: [
      'The probabilities are illustrative values set by hand and the table looks only one word back, so the article should not present 1.4%, 25.2% or 15.0% as the output of any real model.',
      'The subject is how a model computes its next-word distribution — logits, softmax, attention over the context. The screen hands the percentages over directly and computes none of them.',
      'The article is about random sampling, temperature or truncating the candidate list. Nothing here is drawn at random; only the rank of the first step is chosen by the reader.',
      'The topic is greedy algorithms in general — scheduling, coin change, spanning trees. The only choice made here is the next word of a sentence.',
    ],

    contrastWith: [
      {
        concept: 'alwaysTheHighest',
        note: 'Both follow the same top-choice rule, but one is about what that rule does to the wording — it can only replay itself — while this is about what it does to the score, which can end up far below that of a sentence opened with a lesser choice.',
      },
      {
        concept: 'beamSearch',
        note: 'This establishes that the step-wise best is not the sentence-wise best; beam search is the response, keeping several partial sentences and comparing them on the whole-sentence score before committing.',
      },
      {
        concept: 'temperatureSampling',
        note: 'Both leave the top-ranked rule behind, but for different reasons: here a lesser first word is taken to reach a better-scoring sentence, while sampling draws lesser words by chance so the output varies from run to run.',
      },
      {
        concept: 'topKTopP',
        note: 'One restricts which candidates may be drawn at random; this makes no draw at all and asks only whether the single top candidate at each step adds up to the top sentence.',
      },
      {
        concept: 'greedyCanFail',
        note: 'The same failure of committing to the local best, met in a different currency: there the local pick leaves a remainder that costs extra items, and here it leaves a continuation whose multiplied probability ends lower.',
      },
      {
        concept: 'speculativeDecoding',
        note: 'That technique takes the greedy output as the fixed target a draft must match, so it inherits whatever this rule chooses; this questions whether that target is the best sentence to begin with.',
      },
    ],
  },
};
