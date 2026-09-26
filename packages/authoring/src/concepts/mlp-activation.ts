/**
 * mlpActivation 개념 선언.
 *
 * canonical facet 은 `facet:mlpActivation` — 입력 둘 · 은닉 H · 출력 하나인 망이 XOR 네 무리 점 열둘(q1 … q12)을
 * 같은 첫 무게에서 전체 묶음 경사 하강(학습률 0.5, 600 에폭)으로 배운다. 스냅샷 여덟(에폭 0 · 10 · 25 · 50 · 100 · 200 ·
 * 400 · 600)에서 경계 o = 0 이 옮겨 간다. 손잡이 둘 — 활성화(없음 · ReLU · 시그모이드) · 은닉 폭(1 · 2 · 4).
 * 에폭 600: 없음은 폭과 무관하게 6/12 · ReLU 폭 4 는 12/12 (손실 0.006) · 시그모이드 폭 4 는 12/12 이지만 느리다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 굽힘 없는 층이 한 층으로 접힘(`nonlinearBends`) · ReLU 꺾임선을 더해 모서리가 생김
 * (`layersCompose`) · 가운데 층이 점을 새 자리로 옮김(`hiddenLayerFeatures`) · 시그모이드 양끝에서 기울기가 사라짐
 * (`saturateAndVanish`). 이쪽은 그 장면들을 **학습 한 판에 잇고, 두 손잡이의 조합을 견주는 것**을 맡는다. 그래서
 * definition 은 training · XOR · activation choice · hidden width · every point classified 를 쥐고, 조각들이 독점한
 * collapse · hinge · corner · remap · saturation · derivative 를 쓰지 않는다.
 *
 * 전제 (설명 글 `mlpActivation.md`): 첫 무게는 한 번 고른 값(ReLU 폭 2 는 첫 무게에 따라 9 와 12 로 갈린다) ·
 * "시그모이드가 느리다" 는 이 출발 무게에서 잰 것 · 점은 XOR 무리를 조금 비껴 둔 장난감 자료 · 출력 치우침 첫 값 0.1 ·
 * o = 0 이면 0 · 코드 패널은 IR → 여섯 언어의 학습 함수.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mlpActivationConcept: FacetConceptSource = {
  id: 'mlpActivation',
  label: 'Multilayer Perceptron: Activation and Hidden Width on XOR',
  canonicalFacet: 'facet:mlpActivation',

  surface: {
    definition:
      'Training one hidden-layer network on XOR from identical starting weights, the choice of activation (none, ReLU, sigmoid) and hidden width decides whether gradient descent can curve the boundary to classify every point.',
    exemplarKeywords: [
      'multilayer perceptron',
      'MLP',
      'XOR problem',
      'why neural networks need activation functions',
      'ReLU vs sigmoid',
      'number of hidden units',
      'hidden layer width',
      'universal approximation intuition',
      'nonlinear decision boundary',
      'PyTorch nn.Linear with nn.ReLU',
      'Keras Dense layer activation',
    ],
  },

  briefing: {
    observable: [
      'Twelve points q1 … q12 sit on the input plane [−2, 2]² in the four XOR clusters, three per cluster: top-left and bottom-right are one class, bottom-left and top-right the other. The network has two inputs, H hidden units and one output o = c + Σ vⱼ·act(zⱼ).',
      'A bold line marks the boundary o = 0 with light shading on each side; dashed lines mark each unit\'s zⱼ = 0; red rings mark misclassified points. On the right are the activation curve, the count of correct points and a mean cross-entropy loss line that grows one segment per snapshot on a fixed 0 … 0.9 axis.',
      'One round is eight snapshots — epochs 0, 10, 25, 50, 100, 200, 400, 600 — and at each step the boundary moves from the previous snapshot\'s shape to the new one. Counters read "Epoch" and "Correct points"; the last caption reads "Training is over. Turn a knob to train again from the same initial weights".',
      'At epoch 600, with no activation, widths 1, 2 and 4 all end at 6 of 12 correct and loss 0.676: the boundary stays a straight line that tilts while it searches (early counts wander, up to 8 or 9) and then settles at 6.',
      'With ReLU, width 4 classifies all twelve by the epoch 50 snapshot and ends at loss 0.006, the boundary turning at the dashed unit lines; widths 1 and 2 end at 9 correct (losses 0.478 and 0.347) from these starting weights.',
      'With sigmoid, widths 2 and 4 reach 12 correct (losses 0.061 and 0.058), width 1 ends at 9. Width 4 is slower than ReLU: its loss at epoch 200 is 0.462 against ReLU\'s 0.023, and it gets all twelve only by the epoch 400 snapshot.',
      'Premises the screen does not footnote: the starting weights were picked once — across five other starts, no activation always stays below twelve and ReLU width 4 always gets twelve, but ReLU width 2 splits between 9 and 12; "sigmoid is slow" is measured from this start; the clusters are slightly offset toy data; training is full-batch gradient descent with learning rate 0.5; an output of exactly 0 counts as class 0.',
    ],

    screen: {
      affordances: [
        'Playback controls (Play, Step, Pause, Reset, Speed) plus two handles: an "Activation" slider with None, ReLU and Sigmoid (starting at ReLU) and a "Hidden width" slider with 1, 2 and 4 (starting at 4). Width H uses the first H of the same four starting units, and every change retrains from those same weights, so two rounds differ by one handle only.',
        'The move that lands the idea is switching Activation from ReLU to None at width 4: the boundary that wrapped all twelve points straightens into one line and the correct count drops to 6, however wide the layer.',
        'The code panel, labelled "Training function", starts empty with a "+ Add language" button; the chosen language shows `mlpTrain`, which updates the weight buffers in place and returns the correct count and loss seen on screen. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a multilayer perceptron needs a nonlinearity and wants the same XOR training run three ways, so that "no activation" visibly ends as a straight line at half the points while ReLU and sigmoid finish the job.',
      'A reader asks whether more hidden units or a different activation matters more; the table of widths 1, 2, 4 against None, ReLU, Sigmoid lets both knobs be compared from one fixed starting point.',
    ],

    avoidWhen: [
      'The article is about deep networks with many hidden layers, convolution or attention. There is exactly one hidden layer of at most four units here.',
      'The subject is the backpropagation algorithm itself or how gradients are computed. Training runs here, but only its outcome at eight snapshots is shown.',
      'The claim is that ReLU always beats sigmoid or that a given width always suffices. The comparison is from one chosen set of starting weights, and the article must not generalise it without that premise.',
    ],

    contrastWith: [
      {
        concept: 'nonlinearBends',
        note: 'Linear layers composing into one linear map is an algebraic fact about any weights; here that fact shows up as a training outcome — a network without activation stalling at a straight boundary on XOR.',
      },
      {
        concept: 'layersCompose',
        note: 'Summing ReLU units gives a boundary its corners with weights chosen by hand. The multilayer perceptron question is whether training finds such weights, and how the number of units limits the corners available.',
      },
      {
        concept: 'hiddenLayerFeatures',
        note: 'A bent boundary in input space and a straight cut in hidden-unit space are two views of the same trained network; this concept judges success by the input-space boundary and the correct count.',
      },
      {
        concept: 'saturateAndVanish',
        note: 'The small slope of the sigmoid away from its centre is a property of one function. Slower sigmoid training on XOR is one consequence of that property, measured from a particular start.',
      },
      {
        concept: 'kernelLifts',
        note: 'Both make a straight separator curve in the original space. A kernel fixes the lifting in advance; a hidden layer learns its own transformation during training.',
      },
    ],
  },
};
