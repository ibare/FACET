/**
 * svd 개념 선언.
 *
 * canonical facet 은 `facet:svd` — 0..9 의 정수로 채운 6 × 7 수의 표 넷(하트 · 십자 · 계단 · 흩어짐)을 특이값 순서의
 * 겹 L_j = u_j u_jᵀ A 로 나누고 **큰 σ 부터 쌓아** 쌓은 표가 원래 표에 얼마나 다가가는지 센다. 칸 값은 네모의 크기,
 * 음수 칸은 속이 빈 네모. 손잡이 둘 — 그림 넷(처음 하트) · 남길 겹 1..6(처음 4). 코드 패널은 없다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 각각 한 장면이다 — 2×2 변환 하나가 돌리고 · 늘이고 · 돌리는 세 동작으로 갈린다(`svdThreeSteps`, 기하) ·
 * 표 하나에서 작은 겹부터 버리면 어느 순간 모양이 무너진다(`lowRankApprox`, 버림). 이쪽은 그림을 바꿔 가며
 * **몇 겹이면 서는지가 그림마다 다르다**를 맡는다. 오차는 남은 σ 가 정한다(일반 사실). 반면 "같은 칸 42 / 42 에 닿는 겹" 은
 * 반올림 비교라 남은 몫이 칸에 퍼진 모양도 정한다 — 하트는 겹 4 뒤 오차 2.2 % 가 남아도 닿는다. 그래서 "σ 가 빨리 줄수록 적은 겹"
 * 은 **이 네 그림에서 그랬다**로만 적고 일반 명제로 쓰지 않는다 (설명 글 `svd.md` 와 같은 선).
 * definition 은 how many layers · differs by table · error set by the singular values left · looks simple 을 쥐고,
 * 조각들의 rotation · ellipse · drop smallest first · collapse 를 쓰지 않는다.
 *
 * 전제 (설명 글 `svd.md`):
 *  - 그림 넷은 예로 정한 표다. 하트는 조각 lowRankApprox 의 표 그대로다.
 *  - σ 는 AAᵀ 의 고유분해(순환 야코비)에서 얻는다. 오차 % 는 프로베니우스 노름 — 남은 σ 들의 제곱합의 제곱근과 같다.
 *  - "같은 칸" 은 반올림 비교로 모양을 세는 한 방법일 뿐이라, 겹을 더해도 오르내릴 수 있다 (계단 19 · 14 · 16).
 *  - 네 사례가 일반을 증명하지 않는다. 운동 도중의 네모 크기는 그림일 뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const svdConcept: FacetConceptSource = {
  id: 'svd',
  label: 'SVD Layers: What Decides How Many Rebuild a Table',
  canonicalFacet: 'facet:svd',

  surface: {
    definition:
      'Stacking a matrix\'s rank-one SVD layers from the largest, the error left is set by the singular values not yet stacked, so how many layers rebuild a table differs from table to table, whatever it looks like.',
    exemplarKeywords: [
      'SVD',
      'singular values',
      'singular value spectrum',
      'decay of singular values',
      'matrix as a sum of rank-one matrices',
      'outer product expansion',
      'effective rank',
      'why some images compress better than others',
      'how many singular values to keep',
      'Frobenius norm error',
    ],
  },

  briefing: {
    observable: [
      'Three areas side by side: the "Original table" (a 6 × 7 grid of the picture\'s numbers 0 to 9), the "Stacked table" that starts as an empty grid, and six σ bars on two shelves, "Layers left" and "Layers stacked". Each cell value is drawn as a square whose side is proportional to its size; a negative cell is a hollow square.',
      'Each step one layer comes out of its σ bar as a small table, slides over the stacked table and merges into it; the stacked table\'s squares grow or shrink to the new values, and that σ bar moves down to "Layers stacked". The caption reads "Layer 1 (σ₁ 34.86) → A₁" and then "Error 28.9 % · Matching cells 11 / 42".',
      'Default run, Heart with 4 layers kept: σ are 34.86 · 9.88 · 3.33 · 1.04 · 0.69 · 0.40, and the stacked table goes through error 28.9 %, 9.8 %, 3.6 %, 2.2 % with matching cells 11, 22, 41, 42; the round ends with "End — first layer at 42 / 42: 4".',
      'Plus is one horizontal and one vertical line: σ₃ to σ₆ show 0.00, and two layers rebuild it exactly, even though its single-layer error (45.9 %) is worse than Heart\'s (28.9 %).',
      'Stairs looks simple but its σ fall slowly (37.33 · 12.69 · 7.92 · 6.01 · 5.08 · 4.63): the error stays above 10 % through layer 5 and it needs all six layers. Its matching cells go 10, 19, 14, 16, 20, 42 — up and down, while the error only falls. Scatter also needs all six. On these four tables the faster the σ fall, the fewer layers it takes to reach 42 / 42.',
      'Matching cells is a rounding test, so it also depends on how the leftover spreads across cells: Heart reaches 42 / 42 at layer 4 while its error is still 2.2 %, because every remaining cell rounds back to its original value.',
      'Tables stacked from too few layers leave the 0 to 9 range, from −1.47 to 12.27 across the four pictures, which is where the hollow squares appear.',
      'Two counters, Layers stacked and Matching cells, sit under the controls. The four pictures are chosen examples, the error is the Frobenius norm, and "matching" means equal after rounding; the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two segmented sliders: "Picture" with Heart, Plus, Stairs, Scatter (starting at Heart) and "Layers kept" from 1 to 6 (starting at 4, marked on the σ shelf as "To stack: 4"). Changing either empties the stacked table and plays a new round; a round of k layers takes about 2k seconds.',
        'The move that makes the idea land is leaving Layers kept at 6 and stepping through the pictures: Plus is finished at layer 2, Heart at 4, Stairs and Scatter only at 6, and on these four the σ bars already hint at that order before any layer is stacked.',
        'A second move is setting Stairs with Layers kept at 4, where the error is still 16.7 %, and comparing it with Heart at the same setting.',
      ],
    },

    useWhen: [
      'The article claims that simple-looking images compress well under SVD. Stairs, as plain as a picture gets, needs every layer, while Plus is rebuilt in two, and on these four tables the order follows how fast the σ bars fall.',
      'The prose moves from "a matrix is a sum of rank-one pieces weighted by singular values" to "so the singular values tell you how much you can keep", and needs several matrices whose spectra differ visibly.',
      'A reader needs to see that the error after k layers is fixed by the singular values that are left, and that counting matching cells is a cruder measure that can move up and down.',
    ],

    avoidWhen: [
      'The subject is the geometry of one linear map — rotations, stretching, ellipses. There is no plane or circle here, only tables of numbers.',
      'The article is about PCA, projecting data points onto axes, or recommender systems with missing entries. The tables here are complete 6 × 7 grids with no points or axes.',
      'The subject is how SVD is computed numerically. The layers are given; the screen shows no algorithm and has no code panel.',
    ],

    contrastWith: [
      {
        concept: 'lowRankApprox',
        note: 'Dropping the smallest layers of one table shows that a truncated decomposition can keep a shape; asking why one table survives with two layers and another needs all of them moves the question from one truncation to how the singular values of different tables compare.',
      },
      {
        concept: 'svdThreeSteps',
        note: 'One term of the decomposition is a rotation, an axis stretch and another rotation; stacking those terms as layers of a table asks how many terms a given matrix needs, which the geometry of one term does not answer.',
      },
      {
        concept: 'pca',
        note: 'Principal components come from the decomposition of a centred data matrix and are read as directions in the data; the layers here are read as parts of the matrix itself, and nothing is centred or projected.',
      },
    ],
  },
};
