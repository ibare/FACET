/**
 * curvesCross 개념 선언.
 *
 * canonical facet 은 `facet:curvesCross` — 삽입 정렬의 비용 `n²/4` 와 병합 정렬의
 * `n log₂n` 을 한 저울에 올리고, 사다리 2 · 4 · 8 · 12 · 16 · 20 · 32 · 64 를 차례로
 * 달아 보는 화면이다. n = 16 에서 양쪽이 64 = 64 로 수평이 되고, 싼 쪽의 표가 아래
 * 가로줄의 제 칸에 쌓여 색이 한 번만 바뀐다. 끝에 왼쪽 구간에 괄호가 쳐진다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 저쪽 둘이 표기 자체의 성질을 말한다면 이것은 **실무의 선택**을 말한다. 견주는 것이
 * 항이나 계수가 아니라 이름 붙은 두 알고리즘의 실제 비용이고, 교차점이 곧 정렬
 * 라이브러리가 짧은 구간을 삽입 정렬에 넘기는 문턱이다. definition 의 주어를 "두
 * 알고리즘" 으로 잡아 나머지 둘과 갈랐다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const curvesCrossConcept: FacetConceptSource = {
  id: 'curvesCross',
  label: 'The Input Size Where Two Algorithms Trade Places',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:curvesCross',

  surface: {
    definition:
      'Two algorithms with their costs counted at each input size: the asymptotically worse one really does less work below one exact size, and that size is the threshold implementations switch at.',
    exemplarKeywords: [
      'crossover point',
      'insertion sort versus merge sort',
      'fast on small inputs',
      'threshold for switching algorithms',
      'hybrid sort',
      'Timsort',
      'introsort',
      'when the slower algorithm is faster',
      'cutoff length for recursion',
      'asymptotically better but slower in practice',
    ],
  },

  briefing: {
    observable: [
      'The two costs are weighed against each other on a balance — the left pan marked insertion sort and n²/4, the right pan merge sort and n log₂n — and the pan doing more work sinks.',
      'The tilt of the beam carries the ratio between the two costs, so it reads as order and margin, while the exact numbers sit on the pans and a badge under the pivot names the current n.',
      'The eight input sizes are drawn as empty dashed slots on a rail below before any weighing happens, so the run is visible as a whole sequence from the start.',
      'Every weighing sends a chip from the cheaper pan down into its own slot, and the rail fills from left to right with chips that change colour exactly once along its length.',
      'At n = 16 both pans read 64 and the beam is level; the chip for that slot arrives as two halves, one from each pan, and settles split down the middle.',
      'A dashed line then drops at that slot and tints the rail into two regions named after the two sorts, and a bracket reaching back from it to the left end is labelled as the range where libraries sort short runs.',
    ],

    screen: {
      affordances: [
        'The screen weighs all eight sizes on its own, marks the flip and stops with the bracket drawn under the short-run range.',
        'Two buttons: Replay, and a step control for weighing one size at a time, which is how a reader can stop on the level beam and read 64 on both pans.',
        'The two cost formulas and the eight sizes are fixed, so an article can quote any weighing — 16 against 24, or 36 against 43, or 64 against 64 — and the reader will find it on the pans.',
      ],
    },

    useWhen: [
      'The article has just ranked two algorithms by their asymptotic class and the reader carries that ranking down to every input size. One run in which the worse class really does less work, up to a size that can be named, puts a boundary on the claim.',
      'The prose is about to explain why a production sort has a second, simpler sort inside it. The size at which the beam goes over is the reason that second sort is there.',
      'The reader needs the crossing to be an exact fact rather than an impression: both pans reading 64 at the same size is the two costs being equal, not close.',
    ],

    avoidWhen: [
      'The subject is how either sort actually rearranges values — comparing, shifting, splitting, merging. Neither sort runs here; only their costs are weighed.',
      'The article is about the terms inside a single cost formula, or about whether a coefficient may be dropped. Two separate formulas sit on the pans and both are kept whole.',
      'The point is measured wall-clock time, cache behaviour or constants on one machine. Every number here is a formula evaluated and rounded to an integer.',
      'The article uses "crossing" for lines meeting in geometry, or for crossover between parents in a genetic algorithm.',
    ],

    contrastWith: [
      {
        concept: 'asymptotic',
        note: 'One names the input size at which two costs trade places; the wider concept is that such a crossing is a single point while belonging to a growth class is a property of the whole range, so the crossing settles nothing about the class.',
      },
      {
        concept: 'growthOutpaces',
        note: 'One asks which term inside a single written cost survives; this one keeps two costs whole and asks at which input size the cheaper of the two changes identity.',
      },
      {
        concept: 'constantFades',
        note: 'That one varies a constant to show that a crossing can only be relocated; this one fixes two named algorithms, finds where their crossing lands, and reads a working rule off it.',
      },
      {
        concept: 'insertionSort',
        note: 'There the method is the subject; here it appears only as a cost, and the claim is about the range of sizes on which it is the cheaper of two.',
      },
      {
        concept: 'mergeSort',
        note: 'One explains how splitting and merging earns its cost; the other takes that cost as given and locates the size below which it is not yet worth paying.',
      },
    ],
  },
};
