/**
 * kvCache 개념 선언.
 *
 * canonical facet 은 `facet:kvCache` — 완제품이다. 왼쪽은 걸음마다 새로 셈한 K·V 자리를
 * 칸으로 쌓은 기둥들, 오른쪽은 캐시 더미다. 손잡이 둘(캐시 끔 · 켬, 만들 토큰 2 · 4 · 8 ·
 * 16)을 옮기면 한 판을 다시 재생한다. 계기 셋(셈한 K·V 자리 · 주의 점수 셈 · 캐시 자리)과
 * 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **글 길이에 따라 아낀 몫이 어떻게 벌어지고, 무엇은 아끼지
 * 못하는가** 다 (47 % → 91 %, 그래도 주의 점수 셈은 남는다). 주어는 "아낀 몫" 이다.
 *
 * 어휘 배타로 조각 셋의 낱말을 definition 에서 뺐다.
 *  - `dontRecountThePast` 의 낱말(recompute · identical · unchanged)은 쓰지 않는다.
 *  - `firstTokenVsRest` 의 낱말(prompt · first · opening · one pass)은 쓰지 않는다.
 *  - `cacheKeepsGrowing` 의 낱말(bytes · memory · layer · context limit)은 쓰지 않는다.
 * 대신 이쪽이 "key-value cache" · "share" · "attends" 를 쥔다 — 조각 셋의 definition 에는
 * 0 건이다.
 *
 * ── 전제
 *
 * 낱말 하나 = 토큰 하나, 이어짐은 예로 정한 것, "K·V 자리" 는 층 · 머리를 세지 않은
 * 단위다. 시간 · 바이트는 화면에 없다. avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kvCacheConcept: FacetConceptSource = {
  id: 'kvCache',
  label: 'KV Cache (How the Saving Widens With Length)',
  canonicalFacet: 'facet:kvCache',

  surface: {
    definition:
      'How the share of work a key-value cache saves during text generation widens as the output gets longer, and what it leaves in place: each new query still attends to every position before it.',
    exemplarKeywords: [
      'KV cache',
      'key-value cache in transformers',
      'why LLM inference uses a cache',
      'autoregressive decoding cost',
      'quadratic versus linear work per generated sequence',
      'how much does caching save',
      'attention cost still grows with length',
      'transformer inference optimisation',
      'use_cache',
      'past_key_values',
    ],
  },

  briefing: {
    observable: [
      'The prompt is eight words, and one word is counted as one token. The words that follow it are an example continuation chosen for the count, not text a model produced; the tally depends only on how many positions there are, never on which words fill them.',
      'The unit on screen is one position\'s K and V computed once. Layers and heads multiply both settings by the same factor, so they are left out of every number, and no time or byte figure appears anywhere.',
      'On the left, each step gets a column of cells, one cell per position whose K·V was computed at that step, rising into a dashed outline that shows the plan for the whole round. With the cache off the columns climb as a staircase, 8, 9, 10 and on, one cell higher every step.',
      'With the cache on, the first column is still eight cells high and every later column is a single cell, so the staircase collapses to one tall column followed by a flat row. Moving a handle carries the previous outline over into the new one, so the collapse is seen as a change of shape.',
      'On the right, with the cache on, every computed cell travels into a pile labelled KV cache and is marked with the word of its position. The pile and the columns use the same cell height, so the pile ends exactly as tall as all the columns put together. With the cache off the pile stays empty and reads "nothing kept".',
      'The final token\'s K·V is never computed, since nothing comes after it, so the cache ends one short: eight plus the number generated, minus one.',
      'The closing line with the cache on gives the total computed, the total without the cache, and the saving: 17 against 9 (47%) for two tokens, 38 against 11 (71%) for four, 92 against 15 (84%) for eight, 248 against 23 (91%) for sixteen.',
      'The attention-score counter counts one query row multiplied by one key row. For sixteen tokens it reads 276 with the cache on against 2,216 without — far smaller, but not zero, and it keeps rising by one more row each step because the newest query still looks at every earlier key.',
    ],

    screen: {
      affordances: [
        'The screen plays a round by itself and then waits; moving either handle replays the round with the new setting.',
        'A two-position handle for the cache, opening at Off, and a four-position handle for how many tokens to generate — 2, 4, 8 or 16 — opening at 8.',
        'Playback controls for running, stepping, pausing, resetting and changing speed, beside three live counts: K·V positions computed so far, attention scores computed so far, and positions currently held in the cache.',
        'A code panel labelled "Counting K·V and attention scores" whose highlighted line follows the step being played: the full recount, the whole-prompt fill, or the single appended position.',
      ],
    },

    useWhen: [
      'An article states that caching makes generation faster and the reader needs to see by how much and why the gain keeps widening: four settings take the saving from 47% to 91% of the K·V work.',
      'The prose has to hold two costs apart that readers tend to merge — the K·V work, which becomes one position per step, and the attention scoring, which still grows with every token — and three separate counters show them moving differently.',
      'A reader should leave with the whole bargain in one view: work that stops repeating on the left, and a store that fills cell for cell with that same work on the right.',
    ],

    avoidWhen: [
      'The article needs the size of the cache in bytes or gigabytes for a real model. Nothing here is measured in bytes; the counts are positions of an eight-word example prompt with layers and heads left out.',
      'The subject is latency, throughput or tokens per second. The screen counts units of work, not time, and says nothing about hardware.',
      'The article is about evicting, compressing or paging cache entries, or sharing a prefix between requests. The cache here only grows within a single request and nothing is ever removed.',
      'The word "cache" refers to a CPU cache, a web cache or a lookup table in front of a database. The subject here is inside a language model generating text.',
    ],

    contrastWith: [
      {
        concept: 'dontRecountThePast',
        note: 'One makes the single observation that earlier positions give the same keys and values every step and so need not be redone; this weighs what that observation is worth over a whole generation and what it cannot remove.',
      },
      {
        concept: 'firstTokenVsRest',
        note: 'One is about the unevenness between the step that takes in the prompt and the steps after it; this is about the total across all steps and how its saving scales with length.',
      },
      {
        concept: 'cacheKeepsGrowing',
        note: 'One prices the store in bytes for a real model configuration; this counts it in positions and sets it against the work it spares, so its claim is the exchange rather than the bill.',
      },
      {
        concept: 'speculativeDecoding',
        note: 'Both reduce what generation costs, but a key-value cache removes repeated work inside every step while keeping one token per step, whereas guessing ahead tries to accept several tokens for one pass of the large model.',
      },
      {
        concept: 'batchingAndPadding',
        note: 'Caching reduces the work within one sequence; batching shares a pass across several sequences, and the wasted slots it creates are a different kind of loss from the repeated work caching removes.',
      },
      {
        concept: 'memoWriteOnce',
        note: 'Both store a result the first time and reuse it, but memoisation saves a recursion from expanding the same subproblem, while here the stored rows are reused by a sequence that keeps getting longer, so the store itself grows with the output.',
      },
    ],
  },
};
