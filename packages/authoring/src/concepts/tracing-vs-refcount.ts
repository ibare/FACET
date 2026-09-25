/**
 * tracingVsRefcount 개념 선언.
 *
 * canonical facet 은 `facet:tracingVsRefcount` — 같은 가리킴 그래프 두 벌(왼쪽 추적 · 오른쪽 계수). 뿌리 x → A,
 * y → D, 사슬 A → B → C 와 D → E → F. 고리 손잡이를 켜면 되돌아오는 화살 C → A · F → E 가 더해진다. 놓는 이름
 * 손잡이(없음 · x · y · x, y)로 뿌리를 놓으면 계수 쪽이 먼저 수를 내리고 연쇄로 치우며, 그다음 추적 쪽이 남은
 * 뿌리에서 표시하고 놓인 차례로 훑는다. 판 끝 계기 셋(추적이 치움 · 계수가 치움 · 남은 쓰레기). 한 판 10 ~ 15 걸음.
 *
 * reactive 다. 손잡이를 돌릴 때마다 판 하나가 새로 돈다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 한 방식씩 한 장면을 쥔다 — `gcReachableFromRoot` 는 표시와 훑음, `refcountZero` 는 수가 0 이 된 줄
 * 바로 뒤의 치움, `referenceCycle` 은 서로 붙든 수가 1 에서 멈추는 것. 이쪽은 **두 방식을 같은 그래프에 나란히
 * 돌려 무엇이 둘을 가르는가**를 쥔다: 고리가 없으면 어느 뿌리를 놓든 같은 것을 치우고, 되돌아오는 화살이 생기면
 * 갈리며, 고리의 자리가 얼마나 갈리는지를 정한다. 그래서 definition 에 mark · sweep · reachable(추적 조각) ·
 * tally · zero(계수 조각) · each other · stuck(고리 조각)을 쓰지 않고 agree · diverge · back-pointer · side by side 를
 * 이쪽 낱말로 쓴다.
 *
 * 전제 (설명 글이 밝힌 것): 코드 패널은 여섯 언어의 가비지 컬렉터가 아니라 수거기 둘을 여섯 언어로 쓴 것이다
 * (IR 은 한 뜻을 옮길 뿐 언어별 런타임의 차이를 보이지 않는다). 추적 수거는 보통 나중에 한꺼번에 도는데 이 화면은
 * 뿌리를 놓은 뒤 곧바로 한 번 돌린다. 객체 이름 · 뿌리 이름 · 힙 차례는 예로 정한 값이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tracingVsRefcountConcept: FacetConceptSource = {
  id: 'tracingVsRefcount',
  label: 'Tracing GC vs Reference Counting (Where They Disagree)',
  canonicalFacet: 'facet:tracingVsRefcount',

  surface: {
    definition:
      'Tracing collection and reference counting, run side by side on one object graph as its entry points are dropped, throw away exactly the same objects until a back-pointer closes a loop; from then on they diverge, counting retains what the loop holds while tracing throws it out, and where the loop sits decides how far apart they end up.',
    exemplarKeywords: [
      'tracing GC vs reference counting',
      'garbage collection strategies compared',
      'mark-sweep versus refcounting',
      'why does CPython need a cycle collector',
      'why the JVM does not use reference counting',
      'Swift ARC vs tracing garbage collector',
      'shared_ptr vs garbage collection',
      'when do reference counting and tracing disagree',
      'automatic memory management trade-offs',
      'back-pointer keeps objects alive',
    ],
  },

  briefing: {
    observable: [
      'Two copies of the same graph stand side by side, one headed "Tracing" and one "Counting". Each has a Roots strip with the names x and y and six objects A to F: x points to A and y to D, with the chains A → B → C and D → E → F. The counting copy shows under each object the number of pointers coming in; the tracing copy puts a dot on objects it marks.',
      'Turning the cycle on grows two arrows that point back, C → A and F → E. The first closes a loop that contains the object x points to; the second closes a loop hanging below the object y points to. Their starting counts become A 2, B 1, C 1, D 1, E 2, F 1.',
      'In each round the counting copy moves first. Each dropped name withdraws its arrow in both copies ("Dropped: y · Count of D: 0"), and an object whose number reaches 0 is removed at once, taking its outgoing arrows with it and lowering the next object\'s number ("Freed by counting: D · Count of E: 1").',
      'Then the tracing copy marks from the roots still held, following arrows depth first, and a sweep passes through A to F in heap order, keeping marked objects ("Kept: A") and removing the rest ("Swept: A"). When the sweep removes an object that the counting copy still holds, that object gets a "Garbage" tag and the Garbage left counter rises.',
      'With the cycle off the two copies always remove the same objects: 0, 3, 3 and 6 for dropping none, x, y, or both. With the cycle on and both names dropped (the first round), tracing removes 6 and counting removes only D, leaving 5 as garbage — ten steps. Dropping x alone gives 3 against 0; dropping y alone gives 3 against 1, because D goes but E and F keep each other. A round takes 10 to 15 steps.',
      'The code panel is the two collectors written in six languages: the graph is a flat adjacency list `adj[i*n+j]`, and the entry function `garbageLeft` returns what tracing removed minus what counting removed. It shows one meaning carried into six languages, not each language\'s own collector. Real runtimes split as follows: Java, C# and JavaScript trace; CPython counts and adds a cycle-finding tracer; C++ `shared_ptr` only counts, so loops leak unless one side is a `weak_ptr`. Tracing normally runs later in a batch; this screen runs it right after the names are dropped. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet with two segmented sliders — Dropped roots (None, x, y, "x, y") and Cycle (None, Present) — plus playback controls. Every change starts a new round: removed objects return to their places and the root arrows reach out again before the round plays.',
        'The move that makes the idea land is flipping Cycle with both roots dropped: the three counters go from 6, 6, 0 to 6, 1, 5. Choosing y alone with the cycle on then shows a loop placed lower down splitting the result differently.',
        'Three counters sit under the controls: Freed by tracing, Freed by counting and Garbage left.',
      ],
    },

    useWhen: [
      'The article compares how languages reclaim memory automatically — why CPython bolts a cycle detector onto counting, why the JVM and JavaScript engines trace — and needs both verdicts on the same objects at once.',
      'The reader has met one collection strategy and assumes the other is equivalent. Toggling the back-pointers shows the two agree exactly while the graph has no loop and part ways as soon as it has one.',
      'The article argues that the position of a loop matters: a loop through the object a variable points to keeps the whole chain under counting, while one hanging further down keeps only part of it.',
    ],

    avoidWhen: [
      'The article walks through a single strategy in detail, such as the two phases of mark and sweep on their own. Both strategies run here, and each round interleaves them.',
      'The subject is generational, incremental or concurrent collection, pause times, or weak references in action. One immediate pass over six objects is drawn, and no weak reference appears.',
      'The topic is manual memory management with explicit free calls. Nothing here is returned by the program; both sides decide on their own.',
    ],

    contrastWith: [
      {
        concept: 'gcReachableFromRoot',
        note: 'Reachability from the roots is one of the two verdicts compared here. On its own it explains what a tracing collector keeps; set beside counting it becomes the side that still removes a loop nobody can reach.',
      },
      {
        concept: 'refcountZero',
        note: 'Removal at the moment the last holder lets go is how the counting side works. The comparison adds the question of what that rule misses that a search from the roots would catch.',
      },
      {
        concept: 'referenceCycle',
        note: 'Counts that never reach zero inside a loop are the single cause of every disagreement between the two strategies. The comparison claims more: without a loop the two agree completely, and the loop\'s position sets how much is left behind.',
      },
      {
        concept: 'allocateAndFree',
        note: 'Both are about when heap memory is given back. Here a collector decides from the pointer graph; under manual management the program decides with explicit calls, and the timing and number of those calls are what go wrong.',
      },
    ],
  },
};
