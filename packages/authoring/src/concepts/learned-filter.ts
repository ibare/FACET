/**
 * learnedFilter 개념 선언.
 *
 * canonical facet 은 `facet:learnedFilter` — 0 아홉과 b 0 에서 시작한 3×3 창 하나를 잡음 섞인 조각 열여섯(무늬 넷 ×
 * 넷)으로 로지스틱 분류기처럼 배운다. 손잡이 "가려낼 무늬"(세로 · 가로 · 대각)가 y = 1 인 줄을 고른다. 판 40 을
 * 판 5 마다 한 걸음씩 보이고, 끝 걸음에 깨끗한 무늬 넷의 응답 가운데 가장 큰 하나를 짚는다. 판 40 에서 창의 양수
 * 칸은 세 과제 모두 정확히 그 무늬의 밝은 칸이고, 닮음은 0.78 · 0.79 · 0.77.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `filtersLearnEdges` 는 이미 배운 것으로 정한 창 하나에 무늬 다섯을 대 보고 응답 차례로 늘어세운다 — 학습을
 * 그리지 않는다. 이쪽은 **과제를 바꾸면 같은 0 에서 시작한 창이 다른 모양으로 깎인다** 는 것, 즉 학습과 그 대비를
 * 맡는다. 그래서 definition 은 starting from zero · trained · target pattern · switching the target 을 쥐고,
 * 조각이 독점한 respond most / ranked / reversed edge 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `learnedFilter.md` 가 밝힌 것):
 *  - 합성곱 층의 첫 창 하나를 로지스틱 분류기로 떼어 배운 단순화다. 창은 입력 위를 밀려 가지 않는다. 채널 하나.
 *  - 자료는 작게 지어낸 무늬 넷에 씨앗 고정 잡음을 섞은 것. 배우는 비율 0.5 · 전체 묶음 경사 하강.
 *  - 닮음은 창과, 평균을 뺀 무늬 사이의 코사인.
 *  - 실제 CNN 첫 층 창이 경계를 닮는다는 것은 알려진 경향이고, 여기는 그 까닭의 한 조각(모양은 과제와 자료에서 온다)이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것 — 한 판의 고침과 끝 걸음의 비교만 담는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const learnedFilterConcept: FacetConceptSource = {
  id: 'learnedFilter',
  label: 'A Filter Shaped by Its Training Target',
  canonicalFacet: 'facet:learnedFilter',

  surface: {
    definition:
      'Trained from all-zero weights by gradient descent, the same 3×3 filter takes on the shape of whichever pattern it is taught to detect, so switching the target rearranges its positive and negative cells.',
    exemplarKeywords: [
      'how CNN filters are learned',
      'learned convolution kernels',
      'first-layer filters look like edge detectors',
      'filter visualization',
      'training a kernel with gradient descent',
      'logistic regression on image patches',
      'weights start at zero',
      'epochs of training',
      'features are learned, not hand-designed',
      'template learned from data',
    ],
  },

  briefing: {
    observable: [
      'On the left, four patterns — "Vertical edge", "Horizontal edge", "Diagonal", "Flat patch" — each have a row of four "Noisy pieces", sixteen in all. A "y = 1" frame surrounds the row of the chosen target; the other twelve pieces count as 0.',
      'On the right, a 3×3 "Window" starts at 0.00 in every cell with "b = 0.00" and "Similarity: not measured". Each step jumps five epochs, and each cell fills with a square sized by |w| and coloured by its sign; a corner dot marks the target\'s bright cells, and a heavy border marks cells whose sign matches the pattern.',
      'For the vertical target the captions run "After epoch 5: similarity 0.48, cells with matching sign 7 / 9", then 0.63 and 8 / 9 at epoch 10, 9 / 9 from epoch 15, and 0.78 at "Epoch 40 / 40". The final window is −0.56 −0.34 0.36 / −0.44 −1.14 1.12 / −1.79 −1.03 0.47 with b = −0.06 — positive exactly in the right-hand column.',
      'The last step lays the four clean patterns against the window and marks the largest response: "Clean patterns against the window: largest response 1.89 for Vertical edge", with the others −2.41, −2.64 and −3.41.',
      'Across the handle: the horizontal target ends with positive cells exactly in the bottom row (similarity 0.79, largest response 1.77 for Horizontal edge), the diagonal target in the top-right, centre and bottom-left cells (0.77, 1.90 for Diagonal). Changing the target sinks the window back to zero and it fills again toward the new pattern; the same target always gives the same result.',
      'Premises the screen does not footnote: this isolates one first-layer filter and trains it as a logistic classifier, without sliding it over an image; the patterns and seeded noise are made up for the example; similarity is the cosine between the window and the mean-subtracted pattern; learning rate 0.5, full-batch gradient descent over 40 epochs.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a "Target pattern" slider with Vertical, Horizontal and Diagonal, starting at Vertical. A round shows epochs 0 to 40 in steps of five, then the response check, then waits for the handle.',
        'Three readouts sit under the controls: "Epoch", "Similarity %" and "Matching signs".',
        'The move that makes the idea land is switching the target from Vertical to Horizontal and back: the y = 1 frame moves to another row, and the window empties and refills with its positive cells turned from the right column to the bottom row.',
        'The code panel, labelled "Training code", starts empty with a "+ Add language" button; the chosen language shows a `trainEpoch` function for one update and a `strongest` function for the final comparison, and highlights the lines of the current phase. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says CNN filters are learned rather than designed and needs to show where their shape comes from: the same zero-initialised window becomes a vertical, horizontal or diagonal detector depending only on what it is trained to pick out.',
      'A reader has seen pictures of edge-like first-layer filters and asks why they look that way; the article wants the window\'s similarity to its target rising epoch by epoch until every cell\'s sign matches.',
    ],

    avoidWhen: [
      'The subject is how a convolution slides over an image or how feature maps are computed. The window stays in one place and is trained on 3×3 pieces directly.',
      'The article is about visualising deep-layer features, activation maximisation or saliency maps. Only one small first-layer filter is shown.',
      'The subject is multi-layer backpropagation through a whole CNN. The filter is trained alone as a single logistic unit.',
      'The point is comparing optimisers or learning-rate schedules. One fixed learning rate and full-batch updates are used throughout.',
    ],

    contrastWith: [
      {
        concept: 'filtersLearnEdges',
        note: 'Probing a finished filter with patterns shows that its weights look like what it responds to. Training it from zero under different targets shows the cause: the weights take that shape because of the task they were trained on.',
      },
      {
        concept: 'logisticRegression',
        note: 'The training rule is the same logistic model; what is new is reading the nine learned weights as an image and seeing them form the pattern they were trained to detect.',
      },
      {
        concept: 'angleNotLength',
        note: 'Similarity here is a cosine between the window and the pattern, so it measures whether the weights point the same way as the pattern regardless of how large they have grown.',
      },
    ],
  },
};
