/**
 * adam 개념 선언.
 *
 * canonical facet 은 `facet:adam` — 늘인 그릇 L = 5a² + (5/r)·b² 를 (1, 1) 에서 20 번 내려간다. 손잡이 둘 — 갱신 규칙
 * (경사 하강 · Adam, 처음 Adam) 과 축 비 r(1 · 10 · 100 · 1000, 처음 100) — 을 돌리면 두 축 막대(간 몫)가 빈 막대에서
 * 다시 찬다. 경사 하강(η 0.1)은 a 가 첫 갱신에 다 차고 b 는 r 100 · 1000 에서 18% · 2% 에 그친다. Adam(η 0.05)은
 * 네 r 모두 두 축이 나란히 89% 다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `perParameterStep` 은 자리마다 η/(√v̂ + ε) 로 벌어지는 보폭 자체 — 기울기 백 배 차이를 보폭이 거꾸로 백 배
 * 벌려 움직임이 같아지는 장면 — 이다. 이쪽은 **축 비를 돌려도 Adam 의 진척은 그대로, 학습률 하나는 가파른 축에
 * 묶여 완만한 축이 처진다** 는 대비를 쥔다. definition 은 steepness ratio · capped by the steepest axis · same pace
 * whatever the ratio 를 쥐고, 조각의 divides by the root of its running squared-gradient average · step size 를 쓰지
 * 않는다.
 *
 * 전제 (설명 글 `adam.md`):
 *  - 한 그릇을 축마다 늘인 손실이라 Adam 이 축 비에 완전히 무디다. 축이 얽힌 손실에서는 그렇지 않다.
 *  - "Adam 이 늘 빠르다" 가 아니다 — r 1 에서 경사 하강이 두 축 모두 100% 로 먼저 닿는다.
 *  - 갱신 20 번에서 끊은 것은 그 안에서 두 축이 바닥 쪽으로만 가기 때문이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const adamConcept: FacetConceptSource = {
  id: 'adam',
  label: 'Adam vs One Learning Rate on Unequally Steep Axes',
  canonicalFacet: 'facet:adam',

  surface: {
    definition:
      'When one axis of the loss is r times steeper than another, a single learning rate is capped by the steep axis and barely moves the shallow one, while Adam advances both at the same pace whatever r is.',
    exemplarKeywords: [
      'Adam optimizer',
      'Kingma and Ba',
      'adaptive optimizer vs SGD',
      'ill-conditioned loss',
      'elongated valley',
      'condition number',
      'invariance to gradient scale',
      'why Adam converges faster',
      'torch.optim.Adam',
      'feature scaling and optimization',
    ],
  },

  briefing: {
    observable: [
      'Two bars, a and b, each run from "Start 1" to "Floor 0"; the fill is the share of the way already covered, shown as a percentage beside "a = …" and "b = …". A "Steepness" mark on the left draws each axis\'s slope, labelled "g = 10·a" and "g = 0.1·b" at r 100. The header reads "Update rule: Adam · η 0.05" and "L = 5a² + (5/r)·b² · r = 100".',
      'The round is 21 steps, the start and 20 updates: "Update t / 20 · covered a …% · b …%". Ticks left on each bar mark earlier positions, so a bar filled all at once looks different from one filled evenly.',
      'With Adam both bars fill side by side, 5% · 10% · … · 89%, and end "After 20 updates · covered a 89% · b 89%" with a = b = 0.11. The same happens at r 1, 10, 100 and 1000; turning r flattens the b slope mark and leaves the filling unchanged.',
      'With Gradient descent (η 0.1) the a bar fills completely on the first update. The b bar reaches 100% at r 1, 88% at r 10, 18% at r 100 and 2% at r 1000 after 20 updates.',
      'Two readouts, "a covered (%)" and "b covered (%)", carry the round.',
      'The loss is one bowl stretched along each axis separately, which is why Adam is fully indifferent to r here; with a bowl stretched along a diagonal it would not be. Adam is not always further along — at r 1 gradient descent reaches the floor on both axes while Adam is at 89%.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Update rule" with Gradient descent · Adam (starts at Adam) and "Axis ratio r" with 1 · 10 · 100 · 1000 (starts at 100). Turning either empties both bars and replays the 20 updates.',
        'The move that makes the idea land is setting r to 1000 and flipping the update rule: gradient descent fills a at once and leaves b at 2%, Adam fills both to 89% as it did at every other r.',
        'The code panel, labelled "Two update rules", starts empty with an add-language button; the chosen language shows `gdRun` and `adamRun`, and each update lights the body of the rule in use. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why Adam often trains faster than plain gradient descent and needs the reason to be the uneven steepness across weights, not a better learning rate.',
      'The reader asks why a single learning rate cannot simply be raised for the slow weights; the rate that brings the steep axis to the floor in one update leaves the flat axis 2% of the way after twenty at r 1000.',
      'The article needs an honest comparison in which Adam does not win at every setting — at r 1 gradient descent is ahead.',
    ],

    avoidWhen: [
      'The subject is Adam\'s bias correction, the choice of β1 and β2, or AdamW and weight decay. Those parameters are fixed and not discussed on screen.',
      'The article is about losses whose steep direction is diagonal to the weights. The bowl here is stretched only along the axes.',
      'The point is momentum alone. The comparison is between two rules for sizing steps.',
    ],

    contrastWith: [
      {
        concept: 'perParameterStep',
        note: 'Dividing each weight\'s step by its own gradient size is the mechanism; being unaffected by how uneven the axes are is the consequence measured over a whole descent.',
      },
      {
        concept: 'learningRateTooBig',
        note: 'The steepest axis is where a raised learning rate first overshoots, which is what caps a single rate; a per-axis step removes that cap for the other axes.',
      },
      {
        concept: 'momentum',
        note: 'Momentum smooths the direction of motion with past gradients but keeps one scale for all weights; adapting the scale per weight is a separate idea, and Adam carries both.',
      },
      {
        concept: 'gradientDescent',
        note: 'Gradient descent multiplies every weight\'s gradient by the same rate; adaptive methods keep the direction per weight but choose each weight\'s step size from its own history.',
      },
    ],
  },
};
