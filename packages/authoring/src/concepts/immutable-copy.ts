/**
 * immutableCopy 개념 선언.
 *
 * canonical facet 은 `facet:immutableCopy` — 서로 이어지지 않는 프로그램 둘. A 는 `scores[1] = 9` 로 목록 [4, 7, 5]
 * 자체의 자리 1 을 덮어써 7 이 사라진다 (목록 1 · 7 을 가진 목록 0). B 는 `copyWith(scores, 1, 9)` 로 베낀 새 목록의
 * 자리 1 에만 9 를 넣어 옛 [4, 7, 5] 와 새 [4, 9, 5] 가 함께 선다 (목록 2 · 7 을 가진 목록 1). 걸음 여덟 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (함수형 일곱)
 *
 * "immutability · copy · original · overwrite · version" 을 이쪽이 독점한다. map · filter · reduce 도 새 목록이나
 * 값을 만들며 옛 목록을 그대로 두지만 그것은 이 개념의 말이라 그쪽 definition 이 쓰지 않는다.
 * 변수와 타입의 `aliasing`(이름 둘 · 목록 하나)과 가깝지만 이 화면에는 이름 둘이 한 목록을 가리키는 일이 없다 —
 * definition 에 name · refer · shared 를 쓰지 않는다.
 *
 * 전제: `copyWith` 는 이 표기의 내장이다 (자바스크립트 `Array.prototype.with` 가 같은 일을 한다). 목록 자리는 0 부터
 * 센다. 실제 불변 자료구조는 통째로 베끼지 않고 바뀌지 않은 부분을 나눠 쓰지만 화면은 통째 베끼기만 그린다.
 * 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const immutableCopyConcept: FacetConceptSource = {
  id: 'immutableCopy',
  label: 'Immutability (Copy With the Change Instead of Overwriting)',
  canonicalFacet: 'facet:immutableCopy',

  surface: {
    definition:
      'Immutability means producing an updated version by copying the data with the edit applied, so the original survives intact beside it; overwriting a slot of the existing list destroys the old element instead.',
    exemplarKeywords: [
      'immutability',
      'immutable data',
      'persistent data structure',
      'copy on update',
      'mutation vs copy',
      'non-destructive update',
      'Array.prototype.with',
      'toSorted and toSpliced',
      'tuple vs list',
      'frozen object',
      'immutable state in Redux',
      'keeping the previous version',
    ],
  },

  briefing: {
    observable: [
      'The screen holds two separate programs, labelled "A · change it" and "B · make a new one". A runs to the end first, then B starts from scratch; they share the name `scores` but not a list.',
      'A: `let scores = [4, 7, 5]`, then `scores[1] = 9`, then `show scores`. The caption says "Slot 1 of the same list: 7 → 9." — 9 pushes 7 out of the cell and no new list appears. The counter reads "lists: 1 · lists holding 7: 0", and the output is [4, 9, 5].',
      'B: `let scores = [4, 7, 5]`, then `let fixed = copyWith(scores, 1, 9)`, then `show scores` and `show fixed`. The caption says "The list is copied into a new one; only its slot 1 gets 9." The counter reads "lists: 2 · lists holding 7: 1", and the outputs are [4, 7, 5] then [4, 9, 5].',
      'Both programs end with [4, 9, 5] somewhere; only B still has the old [4, 7, 5].',
      'No two names ever point at the same list: A has one name and one list, B two names and two lists.',
      'A step is one top-level line — three for A, four for B, eight in all counting the start.',
      '`copyWith(list, i, v)` is a built-in of this notation; JavaScript\'s `scores.with(1, 9)` does the same. Slots are counted from 0. The copy is drawn whole; real immutable structures usually share the unchanged parts between versions, which the screen does not show. The code is written in a small language-neutral notation rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays program A and then program B by itself and stops with both lists of B standing side by side.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to A\'s second line shows the list right after 7 was overwritten.',
        'The lists, the slot and the new value are fixed.',
      ],
    },

    useWhen: [
      'The reader sees no difference between `list[1] = 9` and building a changed copy, since both end with [4, 9, 5]. Counting how many lists still hold the old 7 shows what the overwrite threw away.',
      'The article introduces immutable data or non-destructive methods such as `with`, `toSorted` or a persistent collection and needs the old version visibly surviving.',
      'The article explains why keeping earlier states intact makes undo, history or time-travel debugging possible.',
    ],

    avoidWhen: [
      'The point is two variables naming one list, where a change through one appears through the other. That never happens in this picture.',
      'The article is about structural sharing or the memory cost of persistent data structures. The copy here is drawn as a full duplicate.',
      'The subject is a language keyword such as `const` or `final` that forbids rebinding a name. This is about the list\'s contents, not the name.',
    ],

    contrastWith: [
      {
        concept: 'aliasing',
        note: 'Aliasing is the hazard in-place changes create when two names share one list; building a changed copy removes the hazard, since nothing anyone already holds is ever altered.',
      },
      {
        concept: 'noSideEffect',
        note: 'Avoiding side effects is the goal; refusing to overwrite existing data is one discipline that serves it for collections.',
      },
      {
        concept: 'growAndCopy',
        note: 'Both copy every element into a new block. Growing an array copies for room and discards the old block; an immutable update copies to preserve the old version and keeps it.',
      },
      {
        concept: 'mapOneByOne',
        note: 'Transforming every element into a fresh list also leaves the source alone, but only as a by-product of how that operation is defined. Keeping the old version intact beside the new one is the whole claim of immutability.',
      },
      {
        concept: 'pureFunction',
        note: 'Immutability is a rule about data: keep the old version intact beside the new. Purity is the property that rule gives a function, namely that its answer no longer depends on what was called before it.',
      },
    ],
  },
};
