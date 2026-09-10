/**
 * bottleneckSetsFlow 개념 선언.
 *
 * canonical facet 은 `facet:bottleneckSetsFlow` — 정점 넷 · 관 다섯짜리 작은
 * 관망에서 길을 찾고 → 여유를 재고 → 가장 좁은 곳에 조임쇠를 물고 → 그만큼
 * 흘리기를 세 번 하고 멈추는 조각이다. 스스로 재생하고, 그 뒤에는 한 걸음씩
 * 다시 볼 수 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 완제품 `maxFlow` 는 절차 전체와 그 총량을 진다. 이 조각이 지는 것은 그중
 * **한 걸음의 규칙 하나** 다 — 길이 정해지면 흘릴 양은 이미 정해져 있고, 그
 * 값을 정하는 것은 길에서 여유가 가장 적은 관 하나뿐이라는 것. 그래서
 * definition 에 "source" 도 "maximum" 도 "residual" 도 넣지 않았다.
 *
 * 되돌리기는 여기 없다 — 그것은 `undoByBackEdge` 의 몫이다.
 *
 * 변별어를 붙였다. "bottleneck" 은 성능 분석 · 신경망 층 · 공정 관리에서 모두
 * 쓰이는 말이라 id 를 `bottleneck` 으로 두면 봉투가 그 넓이를 물려받는다
 * (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bottleneckSetsFlowConcept: FacetConceptSource = {
  id: 'bottleneckSetsFlow',
  label: 'The Narrowest Pipe Sets the Amount',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bottleneckSetsFlow',

  surface: {
    definition:
      'Once a route is chosen, the amount it can carry equals the smallest remaining room on it, and sending that amount fills exactly that link.',
    exemplarKeywords: [
      'bottleneck',
      'narrowest link on a path',
      'the weakest link decides',
      'minimum capacity along a route',
      'saturating an edge',
      'choke point',
      'a chain is as strong as its thinnest part',
      'how much can one route carry',
      'slowest stage limits the line',
    ],
  },

  briefing: {
    observable: [
      'Thickness is capacity: a pipe is drawn as wide as the amount it can take, so pipes of different widths are visibly different pipes before anything moves.',
      'What has been sent is drawn as a core running down the middle of the pipe, and the core thickening until it reaches the pipe wall is what "full" looks like — the narrowest pipe reaches its wall first because it had the least wall to reach.',
      'A probe travels the found route pipe by pipe before any amount is named, so the route exists as a thing on screen before the arithmetic starts.',
      'Every pipe on the route gets its remaining room written beside it, and a clamp closes on the one with the least; when several tie, the clamp bites all of them.',
      'The third route sends only one unit while the first two sent two each, and the reason is readable on the pipes: the route it had to take runs through links that earlier rounds already narrowed.',
      'A running arrival figure sits under the picture and reaches five, and pipes that filled up stay marked as full for the rest of the run.',
      'At the end a probe pokes at each pipe leaving the source in turn and is turned back by each, which is how "no route left" is shown rather than asserted.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence by itself on mount and then stops on the closing state.',
        'Two buttons: Replay, and a step control that walks the same sequence one move at a time, which is the way to pause between the room being measured and the amount being sent.',
        'The network is fixed at four nodes and five pipes, so an article can name the three amounts and the arrival total and count on them being there.',
      ],
    },

    useWhen: [
      'The article has said that a route carries "as much as it can" and the reader takes that to mean the capacity of the route as a whole. Seeing every pipe on the route offer a different amount, and only the least of them count, replaces a vague phrase with a rule.',
      'The reader needs to understand why sending flow closes doors: the pipe that decided the amount is precisely the pipe that ends up full, so the next route has to go somewhere else or not exist.',
      'A limit somewhere in a chain is being introduced — a stage, a link, a lane — and the reader has to see that widening anything other than the tightest part changes nothing.',
    ],

    avoidWhen: [
      'The article uses "bottleneck" for a slow spot in a program or a system under profiling. Nothing here is measured in time, and no work is being sped up.',
      'The subject is a narrow layer inside a neural network, the sense in which an autoencoder has a bottleneck. That word means a dimension there, and a capacity here.',
      'The point is that the order routes are chosen in does not matter, or that flow already sent can be taken back. Nothing here is ever taken back.',
      'The article needs the maximum total for a network, or the argument that a total is maximal. This stops after the rule for one route is settled.',
    ],

    contrastWith: [
      {
        concept: 'maxFlow',
        note: 'The same rule applied once and named, against the same rule repeated until the network is saturated and the accumulated total is the answer.',
      },
      {
        concept: 'undoByBackEdge',
        note: 'Two halves of what one round does: this one decides how much goes down a route, that one explains why an earlier decision never becomes permanent.',
      },
      {
        concept: 'takeBestNow',
        note: 'Both make a locally forced choice and move on, but there the choice is which item to take and here the amount is not chosen at all — the route dictates it.',
      },
    ],
  },
};
