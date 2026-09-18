/**
 * contextAssembly 개념 선언.
 *
 * canonical facet 은 `facet:contextAssembly` — 완제품이다. 위에서 아래로 세 층이 놓인다 —
 * 찾아온 조각 여덟이 등수 차례로 선 선반, 예산 길이의 문턱, 그리고 맥락을 그린 골짜기.
 * 골짜기의 세로 깊이가 가까운 끝까지의 거리다. 손잡이 둘(예산 45 · 55 · 65 · 85, 놓는 법
 * 등수대로 · 끝부터 번갈아)을 옮기면 한 판을 다시 재생한다. 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 묶음 셋이 같은 맥락 이야기를 하므로 **주어 층위**와 **꼬리의 교차**로 갈랐다.
 *
 *   budgetRunsOut   개수가 바뀌고 차례는 따지지 않는다 — 창 · 지시문 · 답 몫 · 들지 않는 첫 조각
 *   lostInTheMiddle 개수가 그대로이고 자리만 바뀐다 — 한 조각 · 앞 · 가운데 · 끝 · 놓치기 쉬움
 *   contextAssembly 둘이 한데 묶인다 — 더 담을수록 답이 묻힌다, 놓는 법이 그것을 막는다
 *
 * 어휘도 나눴다. 이 개념의 definition 은 prompt · allowance · sequence · buries ·
 * alternating 을 쥐고, 형제의 대표 낱말(window · instructions · reply · fit · middle ·
 * front · overlook)은 쓰지 않는다. 기계로 확인했다 — 세 definition 의 핵심 낱말이 서로의
 * definition 에 0 건이다.
 *
 * ── 전제
 *
 * 등수는 예로 정한 것이고 낱말 하나를 토큰 하나로 친다. "가운데를 흘린다" 는 여기서 셈한
 * 것이 아니라 실측 연구(Liu 외 2023)가 보고한 경향이며, 화면은 자리와 거리만 센다.
 * 이 둘을 avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const contextAssemblyConcept: FacetConceptSource = {
  id: 'contextAssembly',
  label: 'Context Assembly (How Many to Admit and in What Sequence)',
  canonicalFacet: 'facet:contextAssembly',

  surface: {
    definition:
      'Assembling a prompt from ranked search results means choosing how many a word allowance admits and how to sequence them; adding more in rank sequence buries the key passage, while an alternating layout holds it at a fixed depth.',
    exemplarKeywords: [
      'context assembly',
      'prompt construction for RAG',
      'how many retrieved documents to include',
      'ordering retrieved passages in the prompt',
      'more context made the answer worse',
      'put the most relevant document first or last',
      'context packing',
      'retrieval augmented generation prompt layout',
      'stuffing the prompt with search results',
      'document ordering strategy',
    ],
  },

  briefing: {
    observable: [
      'Eight retrieved chunks about Apollo 11 stand on a shelf in rank order, each drawn as wide as the number of words it holds, and the one holding the answer, "The lunar module Eagle touched down on 20 July 1969.", is fourth. The third one carries a different July date, the launch day, so a reader who skims dates can be misled by it.',
      'A trough as long as the allowance sits under the shelf. Chunks drop into it by rank until the running total would pass the allowance; the first one that would pass it bounces back to the shelf, and nothing ranked below it is tried.',
      'The four allowance settings admit four, five, six and all eight chunks, using 42, 51, 62 and 83 words; the answer chunk gets in at every setting because it is admitted once 42 words are in.',
      'The admitted chunks then line up in a valley from front to back, and how far down a chunk sits is its distance to the nearer end of that line. With the chunks placed by rank the answer chunk stays in the fourth slot every time, but as more chunks are added after it that distance grows 0, 1, 2, 3 across the four allowance settings; at the largest it sits at the bottom, as far from both ends as any of eight slots can be.',
      'Placed from both ends alternately, ranks one to eight go to slots 1, 8, 2, 7, 3, 6, 4, 5, the newcomers are pushed inward, and the answer chunk stays one slot from an end at every allowance setting.',
      'At the smallest allowance the by-rank placement puts the answer chunk right at the back (distance 0) while the alternating one leaves it at distance 1, so neither placement wins everywhere.',
      'Three live counts show chunks in, words used and the answer depth. The depth is a position count only: nothing on the screen measures how well a model would use the chunk, and the claim that the centre is where models do worst is a tendency reported in published measurements, not something computed here.',
    ],

    screen: {
      affordances: [
        'The screen plays one full round — admit, place, measure — at an allowance of 45 words with by-rank placement, then waits for a handle to move and plays the round again with the new values.',
        'A handle for the allowance with four settings (45, 55, 65, 85 words, where one word is counted as one token) and a handle for placement with two settings, by rank and ends first.',
        'Playback controls for running, stepping, pausing, resetting and changing speed, beside three live counts: chunks in, words used and answer depth.',
        'A code panel labelled "Fill, place, measure" holds one routine that counts how many chunks fit, records the slot each rank takes and returns the answer depth, and it agrees with the live counts for every combination of the two handles.',
      ],
    },

    useWhen: [
      'An article recommends raising the retrieval count or the context allowance and the reader assumes more is always safer. Turning the allowance from 45 to 85 with by-rank placement shows the answer chunk sinking from the back of the line to the deepest slot of all while the count of chunks in doubles.',
      'The prose proposes a remedy for burying — putting the best-ranked material at the two ends — and needs to show it working without overselling it. The alternating setting holds the answer one slot from an end at every allowance, and the smallest allowance is where plain rank order does slightly better.',
      'A pipeline write-up has to explain that deciding what goes in and deciding where it goes are separate steps that interact, and one routine carries both with the numbers laid out for all eight combinations.',
    ],

    avoidWhen: [
      'The article needs a measured effect on answer quality — accuracy by position, attention weights, a curve from an experiment. The screen counts only slots and distances; the valley is a picture of distance, and the weakness at the centre is cited, not measured.',
      'Token counting itself is the subject. Here a word is counted as one token by splitting on spaces, which is a stated simplification, and no tokenizer runs.',
      'The subject is how the ranking was produced — which retriever, which scores, whether the fourth place is deserved. The ranks are fixed by design, with the answer deliberately placed fourth.',
      'The article is about fitting a long conversation history into a chat model or summarising old turns. Everything here is one question and a single batch of retrieved passages.',
    ],

    contrastWith: [
      {
        concept: 'budgetRunsOut',
        note: 'One is only about the count — a fixed allowance stops admitting at the first passage that will not fit, and order is never at stake; this joins that count to the arrangement and shows the two pulling against each other.',
      },
      {
        concept: 'lostInTheMiddle',
        note: 'One holds the set of passages fixed and moves a single one to show that position alone can matter; this lets the set grow and asks what that growth does to the position of the one that matters.',
      },
      {
        concept: 'reranking',
        note: 'Reranking decides which passages deserve the top ranks; assembly takes those ranks as given and decides how many of them to keep and in what sequence the model receives them.',
      },
      {
        concept: 'chunking',
        note: 'Chunking settles how long each passage is before anything is retrieved; assembly works with whatever lengths it is handed, and those lengths decide how many fit under the allowance.',
      },
      {
        concept: 'tokenization',
        note: 'Tokenization is where a real token count comes from; assembly only needs some count to measure against the allowance and treats a word as one token to keep that count honest about being an approximation.',
      },
    ],
  },
};
