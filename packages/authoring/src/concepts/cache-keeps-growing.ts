/**
 * cacheKeepsGrowing 개념 선언.
 *
 * canonical facet 은 `facet:cacheKeepsGrowing` — 조각이다. 위에 자리 하나의 줄(층마다 K 칸 ·
 * V 칸, layer 1 부터 layer 32 까지)이 있고, 아래에 꼭대기가 문맥 한도 4096 인 캐시 통이
 * 있다. 자리가 1 → 1024 → 2048 → 3072 → 4096 으로 늘 때마다 원본 줄의 복제가 떨어져
 * 켜로 쌓이고, 켜는 걷히지 않는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **값** 이다 — 바이트 · 기억 · 층 · 문맥 한도. 형제 셋의
 * definition 에는 이 낱말이 0 건이고, 이쪽 definition 에는 형제의 낱말(recompute ·
 * share · attends · prompt · first)이 0 건이다 (어휘 배타). 주어도 "요청 하나의 기억" 으로
 * 두어 셈의 양을 말하는 형제들과 층위를 갈랐다.
 *
 * ── 전제
 *
 * 모형 구성은 Llama 2 7B 의 공개 구성값(층 32 · K·V 머리 32 · 머리 차원 128 · fp16 값
 * 2 바이트)이고 묶음은 1 이다. 실측이 아니라 공식에 넣어 셈한 값이다. avoidWhen 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheKeepsGrowingConcept: FacetConceptSource = {
  id: 'cacheKeepsGrowing',
  label: 'The Cache Keeps Growing (Bytes per Position)',
  canonicalFacet: 'facet:cacheKeepsGrowing',

  surface: {
    definition:
      'Each token position adds a fixed number of bytes of stored key and value rows to every layer, so one request\'s memory climbs in a straight line to the context limit and never shrinks.',
    exemplarKeywords: [
      'KV cache memory size',
      'how many GB does the KV cache take',
      'GPU memory per request',
      'bytes per token',
      'long context memory cost',
      'KV cache size formula',
      'layers times heads times head dimension',
      'fp16 cache footprint',
      'why long prompts run out of VRAM',
      'Llama 2 7B KV cache',
    ],
  },

  briefing: {
    observable: [
      'The model configuration is the published one for Llama 2 7B — 32 layers, 32 key-value heads, head dimension 128, two bytes per fp16 value — with a batch of one. The sizes are computed from that configuration by formula, not measured on a running system.',
      'At the top, one position is drawn as a single strip running from "layer 1" to "layer 32", each layer holding a K cell and a V cell. That original strip stays in place for the whole run.',
      'The first step spells out the unit: 2 × 32 layers × 32 heads × 128 dims × 2 bytes, equal to 524,288 bytes, or 512 KiB for one position.',
      'Below is a tank whose height stands for positions, with the context limit of 4096 marked at the top. Positions go 1, 1024, 2048, 3072, 4096; at each step a copy of the strip drops in, stretched by the number of positions added, and settles as a new band on top of the ones before.',
      'The bands are never cleared. The caption for each step reports how many rows every layer gained and the cache size — 512 MiB, 1 GiB, 1.5 GiB and finally 2 GiB at the limit — always adding "still 512 KiB per position".',
      'Positions are counted on the left edge of the tank and the size in bytes is written on the right edge, so the straight-line growth reads off both sides at once.',
    ],

    screen: {
      affordances: [
        'The screen plays through from one position to the context limit on its own and stops with the tank full.',
        'Beneath it are a Replay button and a playback strip. Once the run is over, dragging the handle to a step holds that band and its caption still.',
        'The configuration and the five position counts are fixed, so an article can quote any size and the position count it belongs to.',
      ],
    },

    useWhen: [
      'An article says long contexts are expensive and the reader imagines the model weights are what grows. Here the weights never appear; what fills up is half a mebibyte per token for a single request, reaching 2 GiB at 4096.',
      'The reader needs the size formula taken apart — which factors are the layer count, the heads, the head width and the value precision — before a later section changes one of them.',
      'The prose has to establish that the growth is strictly proportional and permanent within a request: every band adds the same amount per position and none is ever taken back.',
    ],

    avoidWhen: [
      'The article is about a different model, grouped-query or multi-query attention, or quantised values. The numbers here come from one published configuration with as many key-value heads as query heads and two-byte values, and they would change with any of those.',
      'The subject is how many requests a server can hold at once. Only one request is sized here.',
      'The point is the amount of arithmetic saved by keeping earlier results. Nothing here counts computation; the only quantity is storage.',
      'The article concerns evicting, windowing or compressing old entries to cap the size. The tank only ever fills.',
    ],

    contrastWith: [
      {
        concept: 'kvCache',
        note: 'One sets the store against the work it spares and counts both in positions; this puts a price on the store alone, in bytes for a named configuration, without asking what it buys.',
      },
      {
        concept: 'dontRecountThePast',
        note: 'Refusing to redo earlier positions is the benefit; holding every one of them for the rest of the request is the bill, and this is the bill.',
      },
      {
        concept: 'budgetRunsOut',
        note: 'Both are limits reached as text gets longer, but a context budget is counted in tokens that fit into the input, while this counts the storage each of those tokens goes on occupying while output is produced.',
      },
      {
        concept: 'batchingAndPadding',
        note: 'Grouping requests multiplies throughput, while the per-request store sized here is what caps how many can be grouped, since every request carries its own.',
      },
      {
        concept: 'lruCache',
        note: 'A fixed-capacity cache stays bounded by throwing entries out; this one has no eviction and so no bound except the context limit, because every stored row is still needed.',
      },
    ],
  },
};
