/**
 * overlapTheSeam 개념 선언.
 *
 * canonical facet 은 `facet:overlapTheSeam` — 조각이다. 자전거 튜브 가는 안내문 한 문단
 * (낱말 54, 문장 다섯)이 문장마다 한 줄로 서고, 19 낱말 창으로 두 번 자른다. 겹침 없이는
 * 창 셋, 둘째 이음매가 넷째 문장을 `keeps | its shape.` 에서 가른다 (온전 4/5). 겹침 6 ·
 * 보폭 13 으로 자르면 창마다 이음매에 섰다가 여섯 낱말 물러나고, 셋째 창이 넷째 문장을
 * 통째로 담는다 (창 넷, 온전 5/5). 값은 저장 낱말 54 → 72. 스스로 한 번 재생하고 그 뒤로는
 * 재생 띠로 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **이음매에 걸린 문장을 되풀이로 건지는 일** 이다. definition 의
 * 주어가 "창이 앞 창 끝보다 몇 낱말 앞에서 시작하는 것" 이고 꼬리가 "그 낱말을 두 번
 * 저장한다" 이다.
 *
 * 마주 보는 짝 — `whereToCut` 과 꼬리를 교차시켰다. 저쪽은 조각 수를 지키고 칼자리를
 * 옮긴다, 이쪽은 **창 길이를 지키고 낱말을 되풀이한다** (칼자리는 그대로 두고 창 수가
 * 는다). 이쪽 definition 에는 문단(paragraph) · 같은 조각 수 가 0 건이다.
 *
 * 완제품 `chunking` 이 쥔 rule · window size · storage · full 도 쓰지 않았다 — 저장의 값은
 * "twice" 로 말하고 "storage" 는 양보했다.
 *
 * ── 전제
 *
 * 글 · 창 19 · 겹침 6 은 예로 고른 것이다. 낱말은 공백으로 가른 덩이이지 모형의 토큰이
 * 아니다. 겹침 6 이 알맞은 값이라는 주장이 아니다 — 창 하나를 넘는 문장은 어떤 겹침으로도
 * 한 창에 들지 않는다. 이것을 avoidWhen 에서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const overlapTheSeamConcept: FacetConceptSource = {
  id: 'overlapTheSeam',
  label: 'Overlap the Seam (Sliding Windows That Share Words)',
  canonicalFacet: 'facet:overlapTheSeam',

  surface: {
    definition:
      'Starting each fixed-length window a few words before the previous one ended, so a sentence straddling the seam lands whole inside a single window, at the price of those shared words being kept twice.',
    exemplarKeywords: [
      'chunk overlap',
      'overlapping chunks',
      'sliding window with stride',
      'chunk_overlap parameter',
      'stride and overlap for text splitting',
      'context lost at chunk boundaries',
      'duplicate text across chunks',
      'boundary sentence split between two chunks',
      'how much overlap between chunks',
    ],
  },

  briefing: {
    observable: [
      'A single block of instructions for changing a bicycle inner tube — fifty-four words in five sentences — is laid out one sentence per row, so whether a sentence fits in one window reads as a single row. Words are counted by splitting on spaces, not by a model\'s tokenizer.',
      'A thin lane above each row shows the windows cut without overlap, and two lanes below show the overlapping windows, neighbouring windows alternating between the two lanes so that a word held by two windows has two bars under it. A small numbered tag at the right of each row names the window that holds that sentence whole — the upper tag for the plain cut, the lower one for the overlapping cut.',
      'Without overlap, three 19-word windows fill in from the front. The second seam, after word 38, falls between "keeps" and "its shape." in the fourth sentence, which is marked as caught between two windows, and the caption reports only four of five sentences whole.',
      'With an overlap of six the legend reads "overlap 6 · stride 13". Window 1 still starts at word 1; each later window first stands at the seam and then slides six words back, staying 19 words long, and the old seam stays behind as a dotted mark.',
      'When window 3 slides back to begin at word 27, the fourth sentence — words 31 to 40 — falls entirely inside it, and the caption says window 3 now holds sentence 4 whole. Window 4 adds a fourth window that the plain cut did not need.',
      'Two summary lines at the top compare the cuts: "3 windows · 54 words stored · 4/5 sentences whole" against "4 windows · 72 words stored · 5/5 sentences whole", and the closing caption states the cost as 72 words stored instead of 54.',
    ],

    screen: {
      affordances: [
        'The screen plays once by itself — the plain cut, the verdict on each sentence, then the four overlapping windows one at a time — and stops with both summary lines showing.',
        'A Replay button and a playback strip sit underneath. Once the run is over, dragging the strip back holds the picture at the moment the fourth sentence is split, or at the moment window 3 slides back to rescue it.',
        'The passage, the window of 19 words and the overlap of 6 are fixed, and sentences and windows are numbered on screen, so an article can refer to "sentence 4" or "window 3" directly.',
      ],
    },

    useWhen: [
      'The article sets a chunk overlap value and the reader wants to know what it is for: a question about inflating the new tube would retrieve a chunk holding only "Inflate the new tube slightly so it keeps", and the overlap is what puts "its shape." back beside it.',
      'A reader treats overlap as free insurance. The same passage goes from 54 stored words to 72 and from three pieces to four, so the duplication has a number attached.',
      'The prose explains "stride" and needs to show that the window stays the same length while its starting point moves back — the two numbers in the legend, overlap and stride, add up to the window.',
    ],

    avoidWhen: [
      'The article is about choosing among several splitting approaches, or about cutting at the text\'s own boundaries instead. Here the cuts always fall at fixed counts of words and only the overlap changes.',
      'The subject is a sentence longer than the window. Every sentence here is at most fourteen words against a window of nineteen, and no amount of overlap can put a longer sentence whole into one window.',
      'The article needs a recommended overlap. Nineteen and six were chosen so that exactly one sentence is rescued; the passage is a made-up example, and the words are not model tokens.',
      'The article means overlap between convolution windows, sliding-window attention in a model, or overlap-add in signal processing. The shared vocabulary does not make them the same subject.',
    ],

    contrastWith: [
      {
        concept: 'whereToCut',
        note: 'Both answer a sentence caught at a cut, in opposite ways: this leaves the cut in place and repeats the words around it so the sentence is also whole on the far side, while the other moves the cut so it never falls inside the sentence.',
      },
      {
        concept: 'chunking',
        note: 'Repetition across a boundary is argued here as the remedy for one sentence; set against other splitting rules it becomes one option among several, and its extra storage has to be weighed against what the others give up instead.',
      },
      {
        concept: 'contextAssembly',
        note: 'Words repeated at a boundary are stored twice; when two neighbouring pieces are both retrieved for one question, the same words also compete twice for a limited prompt.',
      },
    ],
  },
};
