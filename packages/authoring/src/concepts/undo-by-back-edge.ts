/**
 * undoByBackEdge 개념 선언.
 *
 * canonical facet 은 `facet:undoByBackEdge` — 정점 넷 · 방향 관 다섯짜리 작은
 * 관망에서 앞으로 난 화살만 타다 넷에서 막히고, 앞서 흘려 둔 것을 밀어내는
 * 길로 여섯까지 가는 조각이다. 스스로 재생하고, 그 뒤에는 한 걸음씩 다시 볼
 * 수 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 완제품 `maxFlow` 는 절차 전체와 총량을, `bottleneckSetsFlow` 는 한 길에서
 * 양을 정하는 규칙을 진다. 이 조각이 지는 것은 **한 줄의 근거** 다 — 흘린 만큼
 * 반대 방향에 폭이 생기지 않으면 무엇이 부족한가. 그래서 definition 의 주어는
 * 관망도 총량도 아니고 "흘리는 행위가 만드는 반대 방향의 여유" 다.
 *
 * 변별어를 붙이지 않았다. `undoByBackEdge` 는 그 자체로 문장이라 다른 개념과
 * 겹칠 여지가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const undoByBackEdgeConcept: FacetConceptSource = {
  id: 'undoByBackEdge',
  label: 'Undo by Back Edge (Room to Push Flow Back)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:undoByBackEdge',

  surface: {
    definition:
      'Sending an amount along a link opens the same amount of room in the opposite direction, so a later route can displace earlier traffic instead of only adding new.',
    exemplarKeywords: [
      'back edge',
      'reverse arc',
      'residual capacity in the other direction',
      'undoing an earlier choice',
      'why the order of choices does not matter',
      'pushing flow back',
      'rerouting what was already sent',
      'stuck below the true answer',
      'a wrong first move that fixes itself',
    ],
  },

  briefing: {
    observable: [
      'Each pipe is divided lengthwise into as many lanes as its capacity, so what is inside and what is still free are counted in the same units and the reader can add them up by eye.',
      'The arrow at the head of a pipe is drawn as large as the free room and the arrow at its tail as large as the amount inside; tail arrows do not exist at the start and appear only after something has travelled.',
      'Three routes along the head arrows carry two, one and one, and then the run visibly stops: a probe is pushed at each full pipe and bounces back off it, with the running figure resting at four.',
      'The fourth route enters a pipe from its tail; the lump arriving there pushes what was already inside out of the far end, and the displaced amount carries on down a different pipe rather than vanishing.',
      'The gauge at the right fills in steps and settles at six, two above where the run was stuck, and the closing caption says that no route is left even along the tail arrows.',
      'The pipe that gets emptied by the reversal ends the run with fewer lanes filled than it had midway through, so the total going up and one pipe going down happen in the same move.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole argument by itself on mount — the stuck state first, then the reversal — and stops at the end.',
        'Two buttons: Replay, and a step control that walks the same sequence one move at a time, which is how a reader can hold on the moment the earlier amount is pushed out.',
        'The five pipes and their capacities are fixed, so an article can name four and six and rely on the reader seeing both numbers appear in that order.',
      ],
    },

    useWhen: [
      'The article has introduced sending amounts along routes and the reader assumes the first routes chosen have to be good ones. Watching a plausible first route strand the run two short, and then be partly undone without being deleted, is the demonstration that nothing has to be chosen well.',
      'The reader has met the two-line update that subtracts from one direction and adds to the other, and reads the second line as bookkeeping. Here that line is the only reason the run does not end at four.',
      'A procedure is being described as correct regardless of the order its steps are taken in, and the reader needs to see the repair mechanism that buys that guarantee rather than take it on faith.',
    ],

    avoidWhen: [
      'The article uses "undo" for an editor history, a transaction rollback, or a command that can be reversed by the user. Nothing here is discarded — the displaced amount continues along another pipe.',
      'The subject is the classification of edges in a depth-first search, or the back edges that identify loops in a control-flow graph. The phrase is shared and the meaning is not.',
      'The point is how much a single route can carry, or what the total for the network comes to. Those are settled elsewhere; this shows what would be missing without the reverse room.',
      'The article is about abandoning a partial solution and trying another — the search pattern where a wrong step is erased. What happens here is a rearrangement, not an erasure.',
    ],

    contrastWith: [
      {
        concept: 'maxFlow',
        note: 'The full procedure accumulates this reverse room on every push and, on its network, never spends it; here it is spent, which is what shows the room was not optional.',
      },
      {
        concept: 'bottleneckSetsFlow',
        note: 'That one fixes how much a route carries and never revisits it; this one is what keeps such a decision from being final.',
      },
      {
        concept: 'tryAndUndo',
        note: 'Both make undoing part of the method rather than a repair after failure, but there the undone step disappears and here it is re-routed while the total goes up.',
      },
      {
        concept: 'greedyCanFail',
        note: 'The same complaint about choices made in a bad order, answered differently: there the order is what costs you, here a mechanism makes the order stop mattering.',
      },
    ],
  },
};
