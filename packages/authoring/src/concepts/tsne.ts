/**
 * tsne 개념 선언.
 *
 * canonical facet 은 `facet:tsne` — 점 예순(무리 셋 x 스물)을 실제로 t-SNE 로
 * 펴는 완결형이다. 왼쪽 판에 원래 자리, 오른쪽 판에 편 자리를 놓고, 아래에
 * 퍼플렉시티마다 나온 갈림과 무리 사이 비를 쌓는 장부를 둔다. 손잡이는
 * 퍼플렉시티 5 · 15 · 30 셋이다. 코드 패널은 없다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 둘과 한 묶음이다. 갈래는 이렇게 잡았다.
 *   tsne                실제로 돌려 보는 절차와 그 결과 — 손잡이 하나가 그림을 가른다
 *   keepNeighborsClose  이웃만 지키기로 하면 반드시 어딘가 찢어진다는 대가
 *   globalAndLocal      두 가지로 편 그림을 견주면 무리 사이 거리가 사라진다
 * definition 의 무게중심을 각각 알고리즘·대가·견줌에 두고, exemplarKeywords 는
 * t-SNE 와 퍼플렉시티 어휘를 여기에만 남겨 조각 둘과 겹치지 않게 했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tsneConcept: FacetConceptSource = {
  id: 'tsne',
  label: 't-SNE (Perplexity and What the Picture Loses)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:tsne',

  surface: {
    definition:
      'A nonlinear embedding that fits low-dimensional positions to neighbourhood probabilities scaled by a perplexity setting, so the number and shape of visible groups depend on that setting.',
    exemplarKeywords: [
      't-SNE',
      'perplexity setting',
      'dimensionality reduction',
      'embedding scatter plot',
      'how many clusters are in this plot',
      'UMAP',
      'visualizing high-dimensional data',
      'KL divergence between neighbour distributions',
      'early exaggeration',
      'hyperparameter changes the picture',
      'single-cell or word embedding plots',
    ],
  },

  briefing: {
    observable: [
      'Two panels stand side by side: the real positions on the left, unchanged from mount onward, and the flattened positions on the right, redrawn as the descent runs.',
      'Each panel marks the centre of every group and rings it with a dashed circle for how wide the group sits, so a group coming apart is visible as a ring that outgrows its panel.',
      'The lines joining the centres carry no lengths, only the gap written as a multiple of the first gap — the two panels have different units and that multiple is the only thing comparable across them.',
      'The right-hand panel has no axis ticks at all, because its coordinates have no unit.',
      'A ledger below holds one row for the real positions and one for each perplexity, and rows stay empty until that setting has actually been run, so the comparison accumulates as the reader tries settings.',
      'At perplexity 5 one group shatters and the separation reading falls below one; at 30 the groups stay tight but their edges touch; at 15 they split cleanly.',
      'In the clean picture the gap ratio reads close to one, while the same ratio for the real positions reads above two — the setting that separates best is also the one where the between-group distances have been flattened out.',
      'Three readouts run along the bottom: steps taken, separation now, and gap ratio, all recomputed as the descent proceeds.',
    ],

    screen: {
      affordances: [
        'The reader drives this screen. It runs one descent at perplexity 15 on mount and then waits.',
        'A three-way perplexity control offers 5, 15 and 30; picking one starts a fresh descent from the same data and appends its result to the ledger.',
        'Play, step, pause, reset and a speed control govern the descent itself, so the reader can hold it mid-run and watch the group centres still drifting.',
        'The way to make the argument visible is to run all three settings and read the ledger, since the rows stay for comparison after each run.',
      ],
    },

    useWhen: [
      'An article reads a conclusion off an embedding plot — that there are three groups, or that two of them are close — and the reader needs to know which of those readings the method actually supports. Running the same data at three settings and getting three different pictures settles it.',
      'The prose treats the perplexity value as a detail of the call rather than a decision. Watching one group shatter at 5 and the boundaries blur at 30 puts the setting in the same class as the choice of method.',
      'The reader has accepted that the flattening is faithful because the groups look crisp. The clean run is exactly where the between-group ratio collapses, so the crispness and the distortion arrive together.',
    ],

    avoidWhen: [
      'The article uses "perplexity" as the evaluation measure of a language model. That is an unrelated quantity and nothing here measures it.',
      'The subject is a linear projection — principal components, loadings, explained variance. This method keeps no axes and its coordinates carry no interpretation.',
      'The point is how a clustering method decides group membership or how many groups there are. Nothing here assigns anything; the groups are known in advance and only their picture changes.',
      'The article needs the internals of UMAP, or a comparison of the two methods\' objectives. Only one method is run here.',
      'The subject is reducing dimension in order to feed a model rather than to look at a picture. Every reading here is visual.',
    ],

    contrastWith: [
      {
        concept: 'keepNeighborsClose',
        note: 'That concept is why holding every short distance intact forces a break somewhere; here the same pressure is governed by perplexity, which decides where the break lands.',
      },
      {
        concept: 'globalAndLocal',
        note: 'That one lays two flattenings of the same points side by side to show the gaps evening out; here a single method produces that evening-out on its own as the price of a clean split.',
      },
      {
        concept: 'pca',
        note: 'Both put high-dimensional data on a plane, but one keeps the directions of largest spread and their scale while this keeps only who is near whom.',
      },
      {
        concept: 'dbscan',
        note: 'Both hinge on a neighbourhood setting, and both change their answer when it moves; one is deciding group membership, the other only deciding where to draw the points.',
      },
    ],
  },
};
