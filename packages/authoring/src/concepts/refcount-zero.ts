/**
 * refcountZero 개념 선언.
 *
 * canonical facet 은 `facet:refcountZero` — `let a = new Node()` · `let b = a` · `let c = b` · `a = null` · `c = null` ·
 * `b = null`. 객체 A 하나에 이름 셋이 붙어 수가 1 · 2 · 3 으로 오르고, a · c · b 차례로 놓아 2 · 1 · 0. 0 이 된 줄 바로
 * 다음 걸음에서 A 가 거둬진다. 만든 이름 a 가 가장 먼저 놓았지만 A 는 두 걸음 더 산다. 걸음 여덟 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟 — 치우는 쪽 셋)
 *
 * "tally · zero · immediately after the line · holder" 를 이쪽이 독점한다. `gcReachableFromRoot` 의 roots · mark ·
 * sweep · reachable, `referenceCycle` 의 cycle · each other · stuck 을 definition 에서 쓰지 않는다. 수를 셈하는
 * 낱말은 이쪽이 tally, cycle 쪽이 count 로 나눠 쓴다.
 *
 * 전제: `Node` 는 필드 `next` 하나를 가진 작은 객체이고 이 프로그램은 필드를 쓰지 않는다. 칸 주소는 예로 정한 값이다.
 * 새로 가리키는 쪽을 먼저 올리고 놓는 쪽을 나중에 내리는 규약이다. 코드는 어느 언어도 아닌 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const refcountZeroConcept: FacetConceptSource = {
  id: 'refcountZero',
  label: 'Reference Counting (Reclaimed When the Count Hits Zero)',
  canonicalFacet: 'facet:refcountZero',

  surface: {
    definition:
      'Reference counting keeps a per-object tally of variables pointing at it, raised by each new holder and lowered by each release; the line that brings it to zero is followed at once by reclaiming the object.',
    exemplarKeywords: [
      'reference counting',
      'reference count',
      'refcount',
      'retain count',
      'ARC in Swift',
      'Objective-C retain and release',
      'CPython sys.getrefcount',
      'std::shared_ptr use_count',
      'Rc in Rust',
      'deterministic deallocation',
      'object freed when last reference goes away',
    ],
  },

  briefing: {
    observable: [
      'The program is six lines: `let a = new Node()`, `let b = a`, `let c = b`, `a = null`, `c = null`, `b = null`. A Stack holds the name cells a, b, c, and a Heap holds the one object A with its count.',
      'The first line creates A with a count of 1 ("New object A. a → A. Count of A: 1"). `let b = a` and `let c = b` add two more arrows to the same object, and the count climbs to 2 and 3 — still one object, more holders.',
      'The next three lines let go one at a time: "a lets go of A. Count of A: 2", then c to 1, then b to 0.',
      'Right after the line that reaches 0, a separate step reads "Count of A: 0. Reclaimed: A." and the object disappears. Nothing is left on the heap at the end.',
      'The name that created A, a, was the first to let go, yet A lived two more steps because b and c still pointed at it. Eight steps in all, counting the start; the count goes 1, 2, 3, 2, 1, 0.',
      'Node is a small object with one field, next, that this program never uses. Cell addresses are example values, and a new holder is counted before the old one is released. The code is a small language-neutral notation rather than any one real language. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the six lines by itself and stops after A is reclaimed.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to `a = null` holds the moment the creating name lets go while the object survives.',
        'The program is fixed.',
      ],
    },

    useWhen: [
      'The reader thinks an object belongs to the variable that created it. `a` letting go first while A lives on until `b` lets go shows that only the number of holders matters.',
      'The article explains why memory is freed promptly in CPython, Swift or with `shared_ptr` — at a known line rather than at some later collection — and wants the count reaching 0 and the removal on the very next step.',
    ],

    avoidWhen: [
      'The subject is a tracing collector with roots and mark and sweep phases. Nothing is traced here; the only test is a count.',
      'The point is objects that refer to one another. No object field is ever set here, so every arrow comes from a name.',
      'The article needs weak references or thread-safe atomic counting. Only plain counts on one object appear.',
    ],

    contrastWith: [
      {
        concept: 'gcReachableFromRoot',
        note: 'Both decide when an object can go. Counting decides locally and at once, when the last holder lets go; tracing decides globally and later, by searching from the roots during a collection.',
      },
      {
        concept: 'referenceCycle',
        note: 'Counting works when every holder eventually lets go. When two objects hold each other, the last holders are the objects themselves, and that is where counting stops working.',
      },
      {
        concept: 'aliasing',
        note: 'Several names bound to one object is the situation both describe. Aliasing asks what a change through one name looks like through another; counting asks how many such names remain before the object may be removed.',
      },
      {
        concept: 'manualFree',
        note: 'Both end with memory given back. Counting decides the moment automatically from the number of holders; manual management leaves the moment to an explicit call written by the programmer.',
      },
      {
        concept: 'tracingVsRefcount',
        note: 'Removal when the last holder lets go is a complete rule on its own terms. Compared with a search from the roots, it gives the same result on graphs without loops and falls short only on graphs with them.',
      },
    ],
  },
};
