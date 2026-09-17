/**
 * pNp 개념 선언.
 *
 * canonical facet 은 `facet:pNp` — 같은 부분집합 합 문제를 놓고 **확인 줄**과
 * **찾기 줄**을 나란히 두고, 손잡이(원소 개수 n, 6~20)를 밀어 둘이 갈리는 것을
 * 보이는 화면이다. 칸 하나가 후보 하나이고 32 × 32 = 1024 칸이 한 장이며, 그 한
 * 장이 위층 격자의 칸 하나다. n = 10 이 아래층을, n = 20 이 위층을 정확히 채운다.
 * 확인 쪽은 자의 칸 `n−1` 중 이번 후보가 쓴 둘만 칠한다.
 *
 * 재생·한 걸음·일시정지·되돌리기·속도에 개수 손잡이가 붙고, 계기 셋과 코드 패널이
 * 딸린 완결형이다. 걸음은 손잡이와 무관하게 아홉으로 고정이다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `verifyVsFind` 가 **한 인스턴스의 대비**(찾기 64 대 확인 1)를, 조각
 * `reduceToKnown` 이 **문제를 다른 문제로 옮겨 앉히는 일**을 맡는다. 이 개념이
 * 더하는 것은 **크기를 밀었을 때 간극이 어떻게 벌어지는가** 다 — 한쪽은 한 칸씩
 * 늘고 다른 쪽은 두 배가 된다. definition 의 주어를 "크기에 따른 두 값의 벌어짐" 으로
 * 잡아 한 크기에서 멈추는 조각과 갈라 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pNpConcept: FacetConceptSource = {
  id: 'pNp',
  label: 'P vs NP (Checking Gains a Step, Finding Doubles)',
  canonicalFacet: 'facet:pNp',

  surface: {
    definition:
      'The split between problems whose answers can be checked quickly and problems whose answers must be found: as the input grows, checking one candidate gains a single step while the number of candidates doubles.',
    exemplarKeywords: [
      'P versus NP',
      'NP-complete',
      'combinatorial explosion',
      'intractable problem',
      'the search space doubles',
      'exponential blow-up',
      'why brute force stops working',
      'complexity classes P and NP',
      'a million candidates',
      'checking is cheap solving is not',
    ],
  },

  briefing: {
    observable: [
      'The numbers to choose from stand in a row at the top with a target plate of 50 at the right end; pushing the handle adds numbers to that row and leaves the target alone.',
      'The checking side is a single square — one candidate — with the handed candidate written out as 7 + 19 + 24 and a sum plate that takes the target colour when it reads 50.',
      'Beneath it runs a ruler of dashed cells, one per addition a candidate could ever need, of which only the ones this candidate actually used are filled: it reads 2 of 5 at the smallest setting and 2 of 19 at the largest, growing by exactly one cell per number added.',
      'The finding side is two dashed lattices of 32 by 32 cells standing side by side, with a connector running from the whole left lattice to a single outlined cell in the corner of the right one, which is what that cell stands for.',
      'The lower lattice fills only two of its rows at the smallest setting, comes out exactly full at ten numbers, and at twenty numbers both lattices are full — the picture keeps proportion inside each layer instead of compressing.',
      'Under the lattices sit the two readings that go with them: how many candidates there are, and how many full lattices that comes to.',
      'The sweep of the candidates takes three steps whatever the setting, shading the same fraction of both layers each time, and the caption counts the candidates seen against the total.',
      'The run always ends on the same step: checking stopped at one candidate, finding had to look at every one of them, and the caption states both numbers together.',
      'A ladder along the bottom marks the six settings and fills in each one the reader has already visited, so the sizes tried so far stay on screen.',
      'Three counters run along the bar: the candidates checking looked at, which stays at one; the candidates finding looked at; and the additions one candidate can cost.',
    ],

    screen: {
      affordances: [
        'A first run plays on its own when the screen appears and then waits for the handle.',
        'The bar carries play, single step, pause, reset and a speed slider, and beside them a segmented slider for how many numbers are in play — 6, 8, 10, 12, 15 and 20 — starting at 6.',
        'The run is nine steps long at every setting, so what changes when the handle moves is the numbers each step reports, not how long the screen takes.',
        'The numbers, the target and the candidate handed to the checking side are all fixed, so an article can name 7 + 19 + 24 and the reader will find it at any setting.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side, and the two functions in it — adding up one candidate, counting the candidates — both loop once per number while returning numbers of utterly different size.',
      ],
    },

    useWhen: [
      'The article calls a problem hard and the reader takes that as "takes a while". Moving the handle from six numbers to twenty lengthens one side by fourteen cells and takes the other from sixty-four candidates to over a million, which makes hardness a rate rather than an amount.',
      'A reader needs the names of the two classes attached to something countable before the open question can mean anything. One side a person could finish by hand at every setting, beside a side that fills the screen at the last, is where that question sits.',
      'The prose needs the reader to feel the size of a search space rather than read the figure. A full board of cells standing for one cell of the next board is the thousandfold step drawn at proportion, which a compressed axis would flatten away.',
      'The article is about to claim that meeting an answer early proves nothing about the cost. The candidate handed over is confirmed in two additions, and the other side still has to account for every candidate before it can say whether any exists.',
    ],

    avoidWhen: [
      'The subject is a better search for this problem — ordering the candidates, cutting branches, a table over reachable sums. Every candidate here is counted in the same flat way and none is skipped.',
      'The article is about the formal definitions of the two classes, about proving a problem complete for one of them, or about the current status of the open question. What is on screen is one problem at six sizes.',
      'The point is carrying a problem over to another problem so that existing methods apply. Nothing is translated here; the same instance simply grows.',
      'The subject is how long an actual program runs. Every number shown is a count of candidates or of additions, not a duration.',
      'The article uses "verify" for checking a signature, a hash or an identity, or uses P and N for something other than classes of problems.',
    ],

    contrastWith: [
      {
        concept: 'verifyVsFind',
        note: 'One is the gap between checking and finding at a single instance, drawn tile for tile; the other is what becomes of that gap as the instance grows, with one side gaining a step and the other doubling.',
      },
      {
        concept: 'reduceToKnown',
        note: 'One carries a problem over to where methods already exist and borrows them; the other measures what answering a problem outright costs, which a translation moves rather than lowers.',
      },
      {
        concept: 'backtracking',
        note: 'Both face a space of candidates, but one is about cutting whole regions away before entering them, and this one is about how fast that space grows when nothing may be cut.',
      },
      {
        concept: 'greedyCanFail',
        note: 'One shows a cheap rule settling for a worse answer than the best available; the other shows a problem for which no cheap rule is known at all, so certainty costs every candidate.',
      },
      {
        concept: 'bigO',
        note: 'One picks the term a written cost is named by; this one is about two costs on the same problem pulling apart, where the difference is not which term wins but whether the count doubles or grows by one.',
      },
    ],
  },
};
