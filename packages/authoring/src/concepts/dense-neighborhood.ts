/**
 * denseNeighborhood 개념 선언.
 *
 * canonical facet 은 `facet:denseNeighborhood` — 조각(piece)이다. 왼쪽 들판에
 * 점 스물 (고리 열넷과 그 한가운데 덩이 여섯), 오른쪽에 잰 거리가 떨어지는 축이
 * 있고 eps 가 그 축을 가로지르는 한 줄로 그어져 있다. 계기도 코드 패널도 없고
 * 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `dbscan` 은 손잡이 둘이 서로 다른 것을 만진다는 결과를 맡고, 조각
 * `noiseLeftOut` 은 어디에도 안 드는 점을 남기는 일을 맡는다. 이 조각이 홀로
 * 맡는 것은 **번짐이 무리를 정한다는 것과 그래서 모양이 자유롭다는 것** 이다 —
 * 이웃의 이웃으로 옮아붙는 연결성 하나가 답을 만들고, 잰 것은 거리 하나뿐이라
 * 무리가 둥글 이유가 없다는 것.
 * definition 의 주어가 "이어 붙이기" 이고, keywords 는 연결성 · 비볼록 모양
 * 어휘만 갖는다 (완제품의 매개변수 조율 어휘, noiseLeftOut 의 이상점 어휘와
 * 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const denseNeighborhoodConcept: FacetConceptSource = {
  id: 'denseNeighborhood',
  label: 'Dense Neighbourhood (A Group Is What the Chaining Reaches)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:denseNeighborhood',

  surface: {
    definition:
      'Grouping by chaining: a point with enough neighbours inside a radius passes membership on to those neighbours, so a group is whatever the chain reaches, in whatever shape.',
    exemplarKeywords: [
      'neighbours of neighbours',
      'transitive reachability',
      'chaining',
      'non-convex clusters',
      'a ring around a blob',
      'crescent and spiral shapes',
      'connected components by distance',
      'single linkage',
      'a gap between within-group and between-group distances',
      'why a centre-based split fails here',
      'clusters that are not round',
    ],
  },

  briefing: {
    observable: [
      'Twenty points are arranged as a ring of fourteen with a clump of six sitting inside it, so the two groups occupy the same centre and cannot be told apart by distance from any single point.',
      'A spark is placed on one point and the caption reports how many neighbours lie inside the radius, counting the point itself.',
      'The fire then jumps from neighbours to neighbours of neighbours, drawing a link for each pair it crosses, and the group grows around the ring one wave at a time without ever cutting across the middle.',
      'An axis on the right collects every distance the spreading measured, running from zero to twice the radius with the radius drawn as a line across it, and the distances fall into two separated heaps with that line between them.',
      'The neighbouring gaps along the ring land at about 1.42, below the line and therefore linked; the shortest gap from the ring to the inner clump is 2.53, above the line and therefore not.',
      'When nothing more lies inside the radius the caption gives the distance to the nearest point still outside the group, so the stopping is stated as a measurement rather than as an outcome.',
      'A second spark is then placed where the fire never reached, and the closing caption gives the number of groups the fire settled into and their sizes.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole spreading on its own and stops once every point belongs somewhere.',
        'Two buttons: Replay, and a step control that rewinds and walks the same waves one at a time, which is how a reader can stay on a single jump and read the distance it used.',
        'The points, the radius and the threshold are fixed, so an article can name the ring, the clump inside it, and the two distances the argument rests on.',
      ],
    },

    useWhen: [
      'The article claims density-based grouping handles shapes a centre-based split cannot, and this is the arrangement where that is not arguable — the fire travels the whole ring without once crossing the middle it encircles.',
      'The prose needs the reader to see that shape is never consulted. Two heaps of distances with one line between them is the entire reason the answer comes out as two groups, and neither heap knows anything about rings.',
      'A reader has reachability as a definition and needs it as a process: a point brings in its neighbours, those bring in theirs, and the group is wherever that runs out.',
    ],

    avoidWhen: [
      'The subject is what becomes of points nothing reaches. Every point on this screen ends up in a group and no leftovers appear.',
      'The article is about choosing the radius or the threshold, or about how the answer moves when they change. Both are fixed here and never touched.',
      'The point is the cost of finding neighbours or how the work grows with the number of points. Nothing is counted on this screen.',
      'The article uses spreading for diffusion through a network, gossip protocols, or an epidemic model. The picture matches and the subject does not.',
      'The subject is grouping that merges whole groups pairwise, or that recomputes membership for every point on every round.',
    ],

    contrastWith: [
      {
        concept: 'dbscan',
        note: 'This fixes the radius and the threshold to show what one spreading decides; that screen moves them to show what each of them was deciding all along.',
      },
      {
        concept: 'noiseLeftOut',
        note: 'Both run the same chaining, but there the interest is in the points it never reaches, while here every point is reached and the shape of the reach is the subject.',
      },
      {
        concept: 'separateComponents',
        note: 'The same idea of following links until they run out, except the links are given by the graph there and manufactured by a distance threshold here.',
      },
      {
        concept: 'assignThenMove',
        note: 'Membership by chaining never needs a centre; the alternation there measures every point against centres, which is exactly what a ring around a blob defeats.',
      },
      {
        concept: 'mergeNearestPair',
        note: 'Both build groups out of short distances, but merging joins two whole groups per step while this pulls in one neighbourhood at a time from inside a group.',
      },
    ],
  },
};
