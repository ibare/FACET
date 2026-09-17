/**
 * hnsw 개념 선언.
 *
 * canonical facet 은 `facet:hnsw` — 완제품이다. 정사각 지도 한 장에 점 스물넷이
 * 네 무리로 흩어져 있고, 점의 굵기가 그 점이 오른 층을 말한다. 진입점 여섯에서
 * 걸음이 한꺼번에 나아가며 저마다 색과 이름표와 자취를 든다. 층 수 손잡이를
 * 1 · 2 · 3 · 4 로 옮기면 끝자리가 흩어졌다 한 점으로 모인다 (닿은 곳 1 · 2 ·
 * 6 · 6, 본 점 34 · 49 · 65 · 66). 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **층의 깊이가 무엇을 사는가** 다. 사는 것은 "덜 보는
 * 것" 이 아니다 — 층을 쌓을수록 본 점은 오히려 늘어난다. 사는 것은 **어디서
 * 출발해도 같은 답에 닿는 것**이고, 값을 치르고 확실함을 산다. definition 의
 * 주어가 "층이 얼마나 깊어야 하는가" 이고 꼬리가 "더 보면서 산다" 로 끝나는
 * 까닭이다.
 *
 * 어휘는 형제와 나눠 가졌다 — 한 층에서 걷는 일의 어휘(이음 · 들여다봄 · 멎음)는
 * `neighborsLinkedAhead` 가, 층 사이에서 자리를 물려주는 어휘(성김 · 촘촘함 ·
 * 물려줌 · 건너뜀)는 `coarseThenFine` 이 가져갔다. 여기 남은 것은 깊이 · 출발
 * 자리 · 값이다.
 *
 * 이웃 개념과의 경계도 지켰다 — `bfs` · `dfs` · `dijkstra` 는 최단 경로와 도달
 * 가능성을 말하므로 그쪽 어휘(frontier · shortest path · reachability · traversal)
 * 는 쓰지 않았다. 이쪽은 근사 최근접이다.
 *
 * 같은 도메인의 IVF 계열(`invertedFileIndex` · `probeAFewCells` ·
 * `recallSpeedTradeoff`)과도 어휘를 갈랐다. 우산말 "approximate nearest
 * neighbour" 는 `recallSpeedTradeoff` 의 definition 이 이미 쥐고 있고
 * "accuracy versus latency" 는 `invertedFileIndex` 의 것이라 둘 다 양보했다.
 * 이쪽이 가져가는 것은 **그래프**와 **출발 자리**다 — IVF 계열에는 걸음이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hnswConcept: FacetConceptSource = {
  id: 'hnsw',
  label: 'HNSW (How Deep the Layers Have to Be)',
  canonicalFacet: 'facet:hnsw',

  surface: {
    definition:
      'How deep a layered search structure must be before searches begun anywhere arrive at one and the same correct answer: that depth is paid for by examining more points, not fewer.',
    exemplarKeywords: [
      'HNSW',
      'hierarchical navigable small world',
      'nearest neighbour search over a graph index',
      'graph based vector index',
      'every search should end in the same place',
      'how many layers should the index have',
      'the search gets stuck far from the answer',
      'why a deeper index still probes more points',
      'does the entry point matter',
      'embedding search over a vector store',
    ],
  },

  briefing: {
    observable: [
      'Every one of the twenty-four points sits on a single square map, and the size of a dot says how high that point reaches. Moving the handle makes dots swell and shrink before any walking begins, so the structure being altered is visible as a change in the picture rather than only as a number.',
      'Six searches run at the same time rather than one after another. Each carries the name of the place it started from, keeps its own colour, and drags its own trail, so the reader compares six endings in one glance instead of remembering five earlier runs.',
      'Every point a search has looked at keeps a small mark in that search\'s colour, set at its own angle around the point, so a point examined by several of them wears several marks and a crowded point is legible as crowded.',
      'A crosshair marks the target and a dashed square marks the point that is in fact closest to it. The square is marked but not named, so an article can point at it on the screen without being able to quote a name for it.',
      'With the handle at one, the six come to rest scattered right across the map and only one of them is standing on the marked point. At three and at four all six finish ringed around that single point.',
      'The running total of points looked at reads 34, 49, 65 and 66 as the handle goes from one to four. It climbs while the count of arrivals climbs from one to six — the two numbers move the same way, not opposite ways.',
      'The line that closes each round states the depth, how many of the six arrived, and the total looked at, so the exchange being made is spelled out in one sentence every time the handle moves.',
    ],

    screen: {
      affordances: [
        'The screen plays a whole round by itself and then waits, holding the finished picture until the handle is moved again.',
        'A handle with four positions for the depth, opening at three — which is a setting where every search already arrives, so the reader has to turn it down to find the failure.',
        'Playback controls for running, stepping, pausing, resetting and changing speed, next to two live counts: how many of the six arrived, and how many points were looked at in total.',
        'The twenty-four positions, the six starting places and the target are all fixed, and the starting places are named on screen, so an article can refer to a particular search by where it began.',
      ],
    },

    useWhen: [
      'The article has told the reader that layering makes the search cheaper, and that is the half-truth they will carry away. Turning the handle up raises the count of points looked at from 34 to 66, so what the depth actually costs can be put in front of them instead of being glossed over.',
      'A reader distrusts a method that starts from an arbitrary place, and rightly: at one level five of the six searches finish somewhere other than the right point. The same handle at three brings all six onto it, which is the argument for depth stated as a change the reader watches happen.',
      'The prose needs the failure mode itself — a search that ends satisfied while sitting far from the answer — and at the shallow setting five of the six do exactly that, each stopping inside the cluster it happened to begin in.',
    ],

    avoidWhen: [
      'The subject is how the structure gets built — where a point\'s links come from, or how it is decided how high a point reaches. Both are fixed here and follow the point\'s number, so nothing on screen produces them.',
      'The article is about returning a ranked list of several results. Each search here ends at a single resting place and nothing is ranked or collected.',
      'The subject is what changes in high dimensions — why distances crowd together, or why the trouble begins above a few dozen dimensions. The map here is a flat plane with whole-number coordinates.',
      'The article uses "layers" for the stacked transforms of a neural network, or "embedding" for how those transforms represent a token. The words match and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'neighborsLinkedAhead',
        note: 'One is about what a single walk does with the links it has been given; this is about how much layering it takes before the outcome of that walk stops depending on where it began.',
      },
      {
        concept: 'coarseThenFine',
        note: 'Both are claims about stacking, but one is about what a level hands to the level beneath it, while this is about how many such levels the result has to be trusted through, and what trusting it costs.',
      },
      {
        concept: 'skipList',
        note: 'The same bargain made over an ordered line instead of a plane: there the levels buy a lookup cost that grows slowly, and here, with no order to exploit, they buy agreement between searches that began in different places.',
      },
      {
        concept: 'knn',
        note: 'One measures the query against every example it has kept, so its answer is exact by construction; this gives up that certainty in exchange for not having to make the sweep, and then has to earn the certainty back through depth.',
      },
      {
        concept: 'recallSpeedTradeoff',
        note: 'Both weigh the quality of an approximate answer against the work done for it, but one holds the structure still and watches the answer decay as less gets examined, while this treats the examining as the price and asks how much structure makes the answer stop depending on where the search began.',
      },
    ],
  },
};
