/**
 * positionalEncoding 개념 선언.
 *
 * canonical facet 은 `facet:positionalEncoding` — 자리 32 개(0..31)에 사인 · 코사인 위치 표시를 칠한 줄무늬 표와,
 * 간격 Δ = 1..31 마다 두 자리의 거리 D(Δ) = ‖PE(0) − PE(Δ)‖ 막대 31 개. 손잡이 "Encoding size"(d 2 · 4 · 8 · 16, 처음 2)를
 * 올리면 열 쌍(주파수)이 1 → 8 로 붙고, 가장 닮은 간격 Δ* 가 25 → 19 → 6 → 1 로 이웃 쪽으로 옮겨 가며,
 * 이웃보다 가까운 먼 간격의 수는 9 → 9 → 1 → 0 이다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `orderMustBeAdded` 는 "어텐션은 차례를 모르고, 자리 표시를 더해야 안다" 는 한 장면이다. 이쪽은 표시를 더한다는 것을
 * 전제로 두고 **그 표시가 먼 자리끼리 헷갈리지 않으려면 무엇이 있어야 하는가**(느린 주파수)를 손잡이로 가른다. 그래서 definition 은
 * frequency · encoding dimension · gap · most similar · adjacent 쪽 낱말을 쥐고, 조각이 독점한 reorder · set · unchanged · added 를
 * 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `positionalEncoding.md` 가 밝힌 것):
 *  - base 10000, 자리 32 개, 각도는 라디안, 거리는 유클리드이고 간격에만 달린다.
 *  - 실제 트랜스포머는 d 512 이상에 자리 수천이다. 여기서는 d 16 까지.
 *  - 이 화면에는 어텐션 셈이 없다 — 위치 표시 자체가 자리를 얼마나 가르는지만 잰다. 표시는 토큰 표시에 더해진 뒤에야 어텐션이 쓴다.
 *  - 자리마다 벡터를 배우는 위치 표시도 있다.
 *  - IR 이 없어 코드 패널이 없다 (그래서 briefing 은 코드 패널을 언급하지 않는다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const positionalEncodingConcept: FacetConceptSource = {
  id: 'positionalEncoding',
  label: 'Sinusoidal Positional Encoding (Frequencies vs Aliasing)',
  canonicalFacet: 'facet:positionalEncoding',

  surface: {
    definition:
      'With one sine-cosine frequency, positions far apart receive nearly identical encodings; enlarging the encoding dimension adds slower frequencies until the most similar gap becomes the adjacent position.',
    exemplarKeywords: [
      'positional encoding',
      'sinusoidal position embedding',
      'PE(pos, 2i) = sin(pos / 10000^(2i/d))',
      'why sine and cosine for positions',
      'why multiple frequencies in positional encoding',
      'wavelengths of positional encoding',
      'position aliasing',
      'periodic encoding repeats',
      'Transformer position information',
      'distance between position vectors',
    ],
  },

  briefing: {
    observable: [
      'On the left is a striped table: 32 rows for positions 0 to 31, one column per component, cells coloured by sign and shaded by size, with each column pair headed by its frequency ω. On the right are 31 bars, one per gap Δ = 1 to 31, each the distance between the encodings of position 0 and position Δ.',
      'A round is five steps: the empty board ("Encoding size d 2 · positions 32 · frequencies 1"), the table filled at once ("Each position gets sin · cos per frequency — slowest ω 1"), the 31 bars rising ("Distance for every gap Δ — farthest 2.00"), a horizontal line at the neighbour distance with far gaps under it marked, and finally a mark on the most similar gap with the two rows it compares lifted out below, labelled "Position 0" and "Position Δ".',
      'At d 2 there is one frequency, ω = 1. The neighbour distance D(1) is 0.96, nine far gaps (6, 7, 12, 13, 18, 19, 25, 26, 31) fall under it, and the most similar gap is 25 at distance 0.13 — position 25 looks more like position 0 than position 1 does.',
      'Stepping d up adds column pairs from the right (1, 2, 4, then 8 frequencies), the first pair ω = 1 staying unchanged. The most similar gap slides 25 → 19 → 6 → 1 and its distance rises 0.13 → 0.24 → 0.66 → 1.01; only at d 16 is the nearest neighbour the most similar position.',
      'The count of far gaps closer than a neighbour does not fall at first: 9 at d 2, still 9 at d 4, then 1 at d 8 (gap 6) and 0 at d 16. The frequency added at d 4 is ω = 0.01, which turns only 0.31 radians over the 32 positions and shows as an almost flat column; the drop comes when ω = 0.1 enters at d 8. The bar axis ends at 2.00, 2.01, 2.81 and 3.51 for the four sizes.',
      'Two readouts carry the round: "Most similar gap" and "Far gaps closer than a neighbour".',
      'Positions start at 0, angles are in radians and the base is 10000. Because the distance between two encodings depends only on their gap, similarity is counted per gap rather than per pair of positions. There is no attention computation on this screen: it measures how well the encoding alone separates positions, before it would be added to token embeddings. Real models use d of 512 or more over thousands of positions, and learned position embeddings also exist. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and one handle, a four-position "Encoding size" slider at 2, 4, 8 and 16, starting at 2. A round plays its five steps and waits; a new value starts a fresh round.',
        'The move that makes the idea land is stepping d from 2 to 16 and watching the most-similar-gap mark slide along the bar axis toward gap 1, while the table gains slower column pairs.',
        'Stopping at d 4 is worth doing on purpose: a new column pair has arrived yet the count of confusable far gaps is still 9, which shows that adding a frequency only helps when it turns noticeably within the range of positions.',
      ],
    },

    useWhen: [
      'The article explains why the sinusoidal encoding uses a whole spread of frequencies instead of one sine wave, and needs to show one wave making position 25 a near twin of position 0.',
      'A reader asks what the 10000 in the formula and the dimension index are for, and the article wants the frequencies to earn their place by measurably pushing the most similar position back to the neighbour.',
    ],

    avoidWhen: [
      'The article is about showing that attention ignores word order in the first place. The encoding is measured here on its own, with no tokens and no attention step.',
      'The subject is learned position embeddings, rotary embeddings (RoPE), ALiBi or relative position bias. Only the fixed sine-cosine formula appears.',
      'The point is how positional vectors are combined with token vectors, by adding or concatenating. No token vectors are on this screen.',
    ],

    contrastWith: [
      {
        concept: 'orderMustBeAdded',
        note: 'That attention needs some position signal added to its inputs is the reason an encoding exists at all. Whether that signal keeps distant positions apart is a property of the encoding\'s frequencies, and one frequency is not enough.',
      },
      {
        concept: 'selfAttention',
        note: 'Attention compares tokens by the dot product of their projections and has no notion of where they sit. A positional encoding is designed before any of that happens, and its quality is judged by how distinct it keeps positions from one another.',
      },
      {
        concept: 'angleNotLength',
        note: 'Cosine similarity compares directions after dividing out length. Sinusoidal encodings all have the same length, so distance between them is set by angle alone, and a single frequency lets angles wrap around and repeat.',
      },
      {
        concept: 'carryHiddenState',
        note: 'A recurrent network knows order because each step receives the state left by the previous one. A sinusoidal encoding supplies order without any passing along, by giving each position its own fixed vector.',
      },
    ],
  },
};
