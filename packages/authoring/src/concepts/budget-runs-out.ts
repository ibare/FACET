/**
 * budgetRunsOut 개념 선언.
 *
 * canonical facet 은 `facet:budgetRunsOut` — 조각이다. 위에 80 토큰짜리 맥락 창이 가로로
 * 눕고, 아래에 앉을 것들이 줄지어 있다 — 지시문 · 질문 · 답 몫, 그리고 등수대로 조각 다섯.
 * 줄마다 제 토큰 수만큼의 막대가 있고, 걸음마다 막대가 창의 제자리로 옮겨 앉는다.
 * 스스로 한 바퀴 재생하고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **창을 먼저 차지하는 것들 때문에 조각 몫이 줄어든다** 는
 * 주장이다. definition 의 주어는 맥락 창이고, 지시문 · 질문 · 답 몫 · 들지 않는 첫 조각을
 * 쥔다. 차례나 자리에 관한 낱말(prompt · sequence · buries · middle · front · end)은 쓰지
 * 않았다 — 자리는 형제 둘의 몫이고, 이 화면은 자리를 그리지 않는다. 기계로 확인했다.
 *
 * 꼬리는 형제와 엇갈린다 — 여기서는 **개수가 바뀌고 차례는 따지지 않으며**,
 * `lostInTheMiddle` 은 개수가 그대로이고 자리만 바뀐다.
 *
 * ── 전제
 *
 * 낱말 하나를 토큰 하나로 친다 (공백으로 가른 덩이, 구두점은 붙은 낱말에 딸린다). 실제
 * 토크나이저가 아니다. 창 80 · 답 몫 20 도 예로 정한 값이다. avoidWhen 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const budgetRunsOutConcept: FacetConceptSource = {
  id: 'budgetRunsOut',
  label: 'Budget Runs Out (What Is Left of the Context Window for Retrieved Chunks)',
  canonicalFacet: 'facet:budgetRunsOut',

  surface: {
    definition:
      'A fixed context window seats the instructions, the question and empty room for the reply first; retrieved chunks take only the remainder, in rank order, stopping at the first one that does not fit.',
    exemplarKeywords: [
      'context window limit',
      'token budget for retrieved context',
      'reserve tokens for the output',
      'max tokens for the completion',
      'not all retrieved chunks fit',
      'system prompt eats into the context',
      'truncating retrieved documents',
      'top k does not fit in the context length',
      'how many chunks can I send',
      'context length exceeded',
    ],
  },

  briefing: {
    observable: [
      'The window is drawn as one horizontal strip 80 cells wide, one cell per token, and every item waiting below it carries a bar on the same scale, so a bar\'s length is its cost in the window.',
      'The instructions (8), the question (5) and the room held empty for the reply (20) move into the window first, which leaves 47 for chunks; the reply\'s share stays visibly empty after it is seated.',
      'The first three chunks, at 14, 13 and 17 tokens, settle in one after another from the left and bring the running total to 44 of 47.',
      'The fourth chunk needs 12 with 3 left. It rises, hangs over the gap with its surplus lying across the question and the reply\'s share, then drops back to its own row marked "left out"; the fifth is never tried and is marked "not looked at".',
      'The closing line reads kept 3 of 5, used 44, 3 left, and states that fitting all five would take 69.',
      'Every chunk is a plain sentence about photosynthesis, and one word is counted as one token by splitting on spaces — a convention for the example, not a real tokenizer, whose counts would come out larger for the same text.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — the seating of the fixed items, then each chunk in rank order, then the tally — and stops on the tally.',
        'Beneath it are a Replay button and a playback strip; dragging the handle to one step holds that moment still, including the fourth chunk hanging over the gap before it drops back.',
        'The window size, the reply\'s share, the instructions, the question and the five chunks are fixed, so an article can quote any of the counts and name the chunk it belongs to.',
      ],
    },

    useWhen: [
      'An article says "retrieve the top five and pass them to the model" and the reader pictures all five arriving. Here the fourth and fifth never reach the model because the window was partly spoken for before any chunk arrived.',
      'A reader wonders why raising the output length setting cut how much retrieved text got through. The 20 tokens held empty for the reply come out of the same 80, and the chunks work with the 47 that remain.',
      'The prose needs to name the stopping rule plainly — the first chunk that would overflow ends the filling, so a lower-ranked chunk is dropped for its position in the queue, not for being less useful.',
    ],

    avoidWhen: [
      'Real token counts matter to the argument. One word is counted as one token here, and a real tokenizer would charge more for the same sentences; the window of 80 and the reply share of 20 are example values chosen to make the arithmetic visible.',
      'The article is about where in the context a chunk ends up and whether the model notices it there. Admitted chunks simply line up in rank order; their placement is not examined.',
      'The subject is choosing a smarter packing — skipping a chunk that does not fit to try a smaller one, or trimming chunks to size. Filling stops at the first misfit and nothing is shortened.',
      'The article is about a chat history growing past the window over many turns. There is a single question and one pass of filling.',
    ],

    contrastWith: [
      {
        concept: 'contextAssembly',
        note: 'Here the only question is how many passages the leftover room admits; assembly takes that count as one of two choices and weighs it against the arrangement of what got in.',
      },
      {
        concept: 'lostInTheMiddle',
        note: 'A passage that never enters is lost for certain and by rule; a passage that enters but sits far from both ends is only at risk, and only by a reported tendency.',
      },
      {
        concept: 'tokensPerLanguage',
        note: 'Both are about a fixed window running short, but one blames the text for costing more pieces per meaning, while this blames everything else that has to share the window before the text arrives.',
      },
      {
        concept: 'chunking',
        note: 'Chunk length is decided upstream by chunking; this is where that decision is paid for, since longer passages mean fewer of them fit in whatever room is left.',
      },
    ],
  },
};
