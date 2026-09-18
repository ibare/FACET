/**
 * chunking 개념 선언.
 *
 * canonical facet 은 `facet:chunking` — 완제품이다. 꿀벌 글 한 편(낱말 121, 문장 9)을 손잡이
 * 둘 — 자르는 법(낱말 수 · 반 겹침 · 문장 경계)과 창 크기(16 · 24 · 32) — 로 덩이로 가른다.
 * 덩이는 글 위아래 두 길의 띠, 덩이 끝마다 칼, 문장 밑줄은 통째면 초록 · 잘리면 빨강, 아래
 * 컵 하나가 덩이 하나다. 손잡이를 옮기면 앞 판의 띠와 칼이 지워지지 않고 새 자리로 미끄러진다.
 * 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **설정 아홉 칸 사이의 저울질** 이다 — 문장을 덜 자르는 설정은
 * 언제나 다른 자리(담은 낱말 · 채움)에서 값을 치른다. definition 의 주어가 "자르는 법과 창
 * 크기를 고르는 일" 이고 꼬리가 "저장이나 채움으로 치른다" 이다 (주어 층위 가르기 — 조각
 * 둘은 한 장면의 한 주장이고, 이쪽은 조작으로 여러 판을 잇는 전체).
 *
 * 어휘 배타 — 조각의 대표 낱말을 definition 에 넣지 않았다. `whereToCut` 이 쥔 것은
 * 문단(paragraph) · 같은 조각 수 · 칼자리가 옮겨 감, `overlapTheSeam` 이 쥔 것은
 * 겹침(overlap) · 이음매(seam) · 물러남(back) · 두 번(twice). 이쪽이 쥔 것은 rule · window
 * size · storage · full 이다. 기계 확인으로 교차 0 건.
 *
 * 이웃 `tokenization` 은 컴파일러의 렉싱이라 잇지 않고 avoidWhen 으로 막는다. 토큰화
 * 계열은 `betweenLetterAndWord` · `subwordSegmentation` 과 잇는다 — 둘 다 "글을 자른다"
 * 이지만 자르는 단위의 층위가 다르다.
 *
 * ── 전제
 *
 * 글과 창 크기는 예로 고른 것이고, 낱말은 공백으로 가른 덩이이지 모형의 토큰이 아니다.
 * 화면의 수는 그 글에서 셈한 값이지 어떤 모형이나 검색기가 낸 값이 아니다. 실제 창은
 * 수백 토큰이다. 이것을 avoidWhen 과 observable 에서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const chunkingConcept: FacetConceptSource = {
  id: 'chunking',
  label: 'Chunking (Choosing a Cutting Rule and Window Size)',
  canonicalFacet: 'facet:chunking',

  surface: {
    definition:
      'Choosing a rule and a window size for splitting documents into retrieval chunks, where every setting that breaks fewer sentences pays for it in extra storage or in chunks that run less full.',
    exemplarKeywords: [
      'text chunking for RAG',
      'chunk size',
      'fixed-size chunking',
      'sentence-based chunking',
      'sliding window chunking',
      'chunking strategy comparison',
      'document splitter',
      'text splitter settings',
      'preparing documents for a vector store',
      'how big should a chunk be',
      'retrieval-augmented generation ingestion',
    ],
  },

  briefing: {
    observable: [
      'One passage about honey bees — 121 words in nine sentences — is laid out as running text. Words are counted by splitting on spaces, so the counts are of these words, not of any model\'s tokens, and every number on screen is computed from this one passage rather than produced by a model or a search engine.',
      'Each chunk is a band drawn alternately above and below the text, and a knife stands at the end of every chunk. A knife that lands right after a sentence ends is green; one that lands in the middle of a sentence is orange.',
      'Every sentence has an underline that turns green when some chunk holds it from first word to last, and red when none does. A red underline opens a visible gap at the knife that split it, and a sentence longer than the window is underlined with a double line.',
      'A row of cups below the text stands for the chunks, one cup each. A cup\'s height is the window and the level inside it is how many words that chunk actually holds, so a half-empty chunk is visible as a half-empty cup.',
      'At the opening setting — cutting at a fixed count of words, window 24 — six chunks break four of the nine sentences and store 121 words, and the closing line reports the window as 84% filled.',
      'Keeping window 24 and switching to half overlap gives ten chunks, two broken sentences and 229 words stored for a 121-word passage; words held by two chunks sit on a pale tint. Switching instead to sentence end gives seven chunks, one broken sentence, 121 words stored, and a fill of 72%.',
      'Across all nine settings the broken count falls in the same order at every window size — fixed count, then half overlap, then sentence end — and only sentence end at window 32 reaches zero. The one sentence that stays broken under sentence end at window 24 is the fourth, which at 26 words is longer than the window itself.',
      'When a handle is moved, the knives and bands from the previous round do not vanish; they slide along the text in reading order to their new places, gaps in underlines close or open, and the cups rise or sink to the new lengths.',
    ],

    screen: {
      affordances: [
        'Playback controls for running, stepping, pausing, resetting and changing speed. Each round cuts the passage one chunk at a time with the current settings, then judges every sentence, then waits for a handle to move.',
        'A three-position handle for the cutting rule — a fixed count of words, half overlap, sentence end — opening at the fixed count, and a three-position handle for the window size — 16, 24, 32 words — opening at 24.',
        'Three live counts beside the controls: chunks, broken sentences, and words stored. The fill percentage appears only in the closing line of each round.',
        'The passage is fixed and in English, so an article can name a sentence by its position or its opening words and quote any of the nine combinations.',
        'The code panel starts empty with an "+ Add language" button. Its routines cut by sliding a window by a stride, cut by gathering sentences until the window would overflow, and count, for each sentence, whether any chunk holds both its first and last word.',
      ],
    },

    useWhen: [
      'The article recommends a chunk size or a splitter setting and needs the reader to see that no setting is free: fewer broken sentences come back either as the same words stored twice or as chunks that leave their window partly empty, and the nine combinations put all three numbers side by side.',
      'A reader assumes a bigger window simply solves broken sentences. Under the fixed count the window going from 16 to 32 only takes the broken count from six to three, while sentence end at 16 already reaches two — the rule moves the number more than the size does.',
      'The prose has to explain why even careful splitting leaves one sentence broken, and the 26-word sentence that no rule can keep whole at window 24 is the concrete case.',
    ],

    avoidWhen: [
      'The article is about what happens after chunks exist — embedding them, ranking them against a query, or packing the retrieved ones into a prompt. Nothing here is searched or retrieved; the screen stops once the passage has been cut and judged.',
      'The article needs realistic sizes or token counts. The windows of 16 to 32 words and the 121-word passage are chosen for illustration, words are split on spaces rather than by a tokenizer, and none of the percentages describe a real retrieval system.',
      'The subject is semantic or embedding-based splitting, headings and markup, or recursive splitters that try larger text blocks before sentences. The only rules on this screen are a fixed count of words, a half-window overlap and sentence ends.',
      'The article uses "chunking" in the psychology-of-memory sense of grouping items so they are easier to hold in mind, or means splitting a file for upload or transfer.',
    ],

    contrastWith: [
      {
        concept: 'whereToCut',
        note: 'One isolates a single variable — where the cut falls, with the number of pieces held equal; this weighs whole settings against each other, where changing the rule also changes how many chunks there are, how much is stored and how full each runs.',
      },
      {
        concept: 'overlapTheSeam',
        note: 'Repeating words across a boundary is one of the options weighed here, priced against the others; there it is the single remedy, justified by the one sentence it rescues.',
      },
      {
        concept: 'contextAssembly',
        note: 'Splitting decides what units exist before any question is asked; assembly decides, once a question has arrived, which of those units go into the prompt and in what order.',
      },
      {
        concept: 'hybridSearch',
        note: 'The unit of retrieval is settled here and taken as given there; how a query finds its best units says nothing about whether those units kept their sentences intact.',
      },
      {
        concept: 'betweenLetterAndWord',
        note: 'Both ask how coarsely to divide text, but at different scales: one weighs letters against words as the grain a model reads, and this weighs spans of dozens of words as the grain a search returns.',
      },
      {
        concept: 'subwordSegmentation',
        note: 'A vocabulary learned from data decides where words split into pieces; here the words are left intact and the question is where a longer stretch of them should end.',
      },
    ],
  },
};
