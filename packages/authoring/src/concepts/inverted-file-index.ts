/**
 * invertedFileIndex 개념 선언.
 *
 * canonical facet 은 `facet:invertedFileIndex` — 완결형이다. 왼쪽은 점 스물넷이
 * 놓인 정사각 평면이고 오른쪽은 색인 그 자체다. 줄 하나가 칸 하나이고 그 안의
 * 칩이 명단이며, 차례를 재는 걸음에서 줄이 스스로 정렬한다. 연 칸 손잡이
 * (1·2·3·4) 와 계기 둘(재현율 % · 본 점)이 딸려 있다. 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 지는 것은 **두 수가 한 손잡이에 매여 있다** 는 것이다. 정확함과
 * 비용이 같은 레버의 양 끝이라 어느 한쪽만 고를 수 없다는 것이 무게중심이고,
 * 그래서 definition 의 주어가 "색인과 그 손잡이" 이며 꼬리가 "둘을 함께 정한다"
 * 로 닫힌다.
 *
 * 조각 `probeAFewCells` 는 **여는 일 자체**만, 조각 `recallSpeedTradeoff` 는
 * **덜 뒤질 때 답이 무엇을 잃는가**만 말한다. 셋이 같은 데이터를 쓰므로
 * definition 이 붙지 않게 어휘를 갈라 두었다 — 이쪽은 조율 · 결합 · 비용 어휘를,
 * 조각 둘은 각각 가르기 · 건너뛰기 어휘와 참값 · 빠짐 어휘를 갖는다.
 *
 * 군집화 계열(`kmeans` · `hierarchical` · `dbscan`)의 어휘는 셋 다에서 뺐다.
 * 저쪽은 무리를 찾는 일이고 이쪽은 이미 나뉜 칸을 골라 여는 일이다.
 *
 * 이름이 전문 검색의 역색인과 겹치므로 avoidWhen 이 그 오검출을 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const invertedFileIndexConcept: FacetConceptSource = {
  id: 'invertedFileIndex',
  label: 'Inverted File Index (One Setting Fixes Accuracy and Cost)',
  domain: 'ai-engineering',
  canonicalFacet: 'facet:invertedFileIndex',

  surface: {
    definition:
      'An inverted file index over vectors, where a single tunable setting governs how much of the index is consulted and fixes the accuracy and the cost together.',
    exemplarKeywords: [
      'IVF',
      'inverted file index',
      'nprobe',
      'tuning a vector index',
      'accuracy versus latency',
      'faiss IndexIVFFlat',
      'diminishing returns from more work',
      'one dial sets two numbers',
      'serving a vector index at a target quality',
      'choosing an operating point',
    ],
  },

  briefing: {
    observable: [
      'Moving the one handle from its lowest notch to its highest walks the two counters together — forty, eighty, a hundred and a hundred on the first, six, twelve, eighteen and twenty-four on the second — so neither number can be read without the other.',
      'The last notch is the one that pays for nothing: it adds six more measured points and leaves the answer exactly as it was, so the point at which more work stops buying anything is on screen rather than asserted.',
      'The five numbered tags that make up the current answer fly across the plane to new holders when a wider setting is chosen, while the points themselves never move, because their positions are the distances being argued about.',
      'A dashed ring sits on each of the five that a full measurement says are truly nearest, so a tag landing inside a ring is a hit and the count of such landings is what the accuracy counter reports.',
      'The right-hand panel is the index itself: one row per cell holding that cell\'s membership as chips, each row labelled with the distance from the query to that cell\'s representative.',
      'The rows re-order themselves at the ranking step so that the row to be consulted first rises to the top, and rows never consulted are left faded at the bottom when the round ends.',
      'Opening a cell grows spokes from that cell\'s representative out to its own members, and those members change colour; the number of recoloured points is exactly what the work counter shows.',
      'Both axes of the plane carry the same scale, so a point that looks nearer to the query is nearer.',
    ],

    screen: {
      affordances: [
        'A round plays on its own after mounting and then the screen waits; play, single step, pause, reset and a speed slider drive the replay.',
        'A segmented handle beside the playback controls sets how many cells get consulted — one, two, three or four, starting at two — and choosing a notch runs the round again at that width instead of clearing the screen.',
        'The way to make the coupling visible is to note both counters, move the handle one notch, and read them again; they never move one at a time.',
        'The points, the four representatives and the query are fixed, so the four pairs of numbers can be quoted in the text exactly as they appear.',
      ],
    },

    useWhen: [
      'An article presents a vector index as the thing that makes similarity search fast and the reader takes the speed as free. One handle that drives an accuracy reading and a work reading at the same time is what turns the speed into something that was bought.',
      'Someone has to pick an operating point for a deployment and is treating the quality of the answers as a fixed property of the system rather than as something they are choosing. Four settings, each with its own pair of readings, is that choice laid out.',
      'The prose quotes a quality figure for a retrieval system without saying what was spent to reach it, and a reader needs to see that the same system reaches several such figures depending on one number.',
      'A reader expects that spending more always buys more. The widest setting here measures six extra points and returns the same answer as the setting before it, which is where the buying stops.',
    ],

    avoidWhen: [
      'The article means the inverted index of full-text search — a map from a term to the documents containing it, with postings lists, stop words and term frequencies. Nothing here involves words or documents, and the shared name is the whole of the resemblance.',
      'The subject is how the representatives were obtained or how the data should be divided. They are given on this screen and the argument starts after that.',
      'The point is a different family of approximate index — a proximity graph, a hashing scheme, or compressing the vectors themselves so each comparison gets cheaper. The work here is reduced only by leaving data unread, and every vector kept is kept whole.',
      'The article uses "recall" for the share of true positives a classifier finds among labelled examples. Here it is the share of the genuinely nearest items that came back.',
      'The subject is exact search and the guarantee that nothing can be missed, or the cost of measuring against everything. Both are the baseline this is measured against rather than what it shows.',
    ],

    contrastWith: [
      {
        concept: 'probeAFewCells',
        note: 'One claims that comparisons can be confined to a few regions at all; this claims that how many of them get consulted is a dial with two readings attached, so the mechanism is taken as settled here.',
      },
      {
        concept: 'recallSpeedTradeoff',
        note: 'One is about what the answer loses when less is examined; this is about the loss and the saving being two readings off the same setting, which is why neither can be chosen on its own.',
      },
      {
        concept: 'knn',
        note: 'Both answer a nearest-neighbour question, but one measures against every stored example and so cannot be wrong, while this one is wrong by a stated amount in exchange for measuring against fewer.',
      },
      {
        concept: 'kmeans',
        note: 'The divisions this index rests on are the kind of grouping that method produces, but forming them is a separate question from deciding how many to consult once a query arrives.',
      },
      {
        concept: 'spaceErrorTradeoff',
        note: 'Both price an approximation in its own units, but one pays for less memory with counts that come back too large, and this pays for less work with items that never come back at all.',
      },
    ],
  },
};
