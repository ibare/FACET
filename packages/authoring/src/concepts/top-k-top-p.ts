/**
 * topKTopP 개념 선언.
 *
 * canonical facet 은 `facet:topKTopP` — 완제품이다. 뾰족한 문맥과 평평한 문맥이 나란히 서고,
 * 문맥마다 왼쪽에 칸 높이가 모두 같은 순위 사다리, 오른쪽에 조각 높이가 확률에 비례하는 몫
 * 기둥이 띠로 이어진다. k 칼날은 두 사다리의 같은 칸 경계로, p 선은 두 기둥의 같은 깊이로
 * 내려온다. 손잡이는 top-k (1 · 2 · 3 · 5 · 8) 와 top-p (0.5 · 0.75 · 0.9 · 1) 이고, 둘을
 * 함께 걸면 k 가 먼저 자르고 p 는 남은 것을 다시 나눈 분포로 잰다. 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **두 칼날이 저마다 무엇을 고정하고 무엇을 흔드는가, 그리고
 * 이어 걸면 어떻게 되는가** 다. definition 의 주어가 "고정된 개수와 고정된 몫" 이고 꼬리가
 * "이어 걸면 어느 한쪽보다도 적게 남을 수 있다" 로 끝난다.
 *
 * 어휘는 형제와 나눴다 — 뽑기 · 살아남은 것에게 비례해 나눠 줌(draw · survivors ·
 * proportion)은 `cutTheTail` 이, 확률을 차례로 더해 p 에 닿음 · 한 낱말이 압도함(summed ·
 * reaches · dominates · compete)은 `fillToAShare` 가 가져갔다. 여기 남은 것은 count · mass ·
 * peaked · flat · chained 다. 두 조각의 definition 에는 이 낱말이 0 건이다 (기계 확인).
 *
 * ── 밝힌 전제
 *
 * 두 문맥의 확률은 천분율 정수로 예로 정한 값이다 — 실제 모형의 출력이 아니다. 화면 아래
 * 각주가 이를 적지만, writer 가 수를 인용할 때 놓치지 않도록 observable 과 avoidWhen 에도 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const topKTopPConcept: FacetConceptSource = {
  id: 'topKTopP',
  label: 'Top-k vs Top-p (Cutting by Count or by Share)',
  canonicalFacet: 'facet:topKTopP',

  surface: {
    definition:
      'A fixed candidate count and a fixed probability mass, set against a peaked and a flat next-token distribution, each hold one quantity steady while the other swings; chained, they can keep fewer than either alone.',
    exemplarKeywords: [
      'top-k vs top-p',
      'top_k and top_p together',
      'which runs first, top-k or top-p',
      'top-p applied after top-k',
      'why top-p adapts and top-k does not',
      'truncation strategies for LLM decoding',
      'choosing sampling parameters for generation',
      'confident vs uncertain next-token distribution',
      'how much probability gets thrown away',
      'Hugging Face logits warpers',
      'vLLM sampling parameters',
    ],
  },

  briefing: {
    observable: [
      'Two contexts stand side by side, "The opposite of hot is" and "For breakfast I had", each with eight candidate words. Their probabilities are example values given in per mille (880 for "cold" against 230 for "toast" at the top), not the output of a real model, and a note under the picture says so.',
      'In each context a ladder of equal-height rungs on the left counts ranks, a column on the right stacks slabs sized by probability, and a ribbon ties each rung to its slab, so one candidate can be followed from where it ranks to how much it holds.',
      'Moving top-k brings a blade down to the same rung boundary on both ladders. At k = 2 both contexts keep two, yet the cut share reads 8% on the peaked side — where the wrong answer "warm" survives — and 58% on the flat side, where "cereal" through "coffee" all fall.',
      'Moving top-p hangs a line at the same depth on both columns, and each rank in turn adds to a running bar until the bar meets the line. At 0.9 the peaked side stops after two and the flat side after six, while the cut shares land close together at 8% and 7%.',
      'Whenever something is cut, the fallen slabs drop away and the remaining ones swell in proportion to fill the column, and the percentage beside each word is its share of what is still in rather than of the original whole.',
      'With both set, k cuts first and p is measured on the rescaled remainder. At k = 2 and p = 0.9 the peaked side, which either setting alone would leave at two, keeps "cold" alone, and the verdict under that context reads "Cut by: p on the rescaled rest".',
      'Each context ends a round with a cut-share gauge and a verdict naming what did the cutting — k, p, p on the rescaled rest, or nothing — and four live counts give kept and cut % for the peaked and flat sides.',
      'The flat side at k = 5 and p = 0.5 lands exactly on the boundary: "toast" and "eggs" hold 420 of the 840 left, precisely half, and because reaching the line counts, it keeps two.',
    ],

    screen: {
      affordances: [
        'The screen opens at top-k 8 and top-p 1, where nothing is cut, plays one round, and then waits; every move of either handle replays a round from the full distributions.',
        'Two segmented sliders, top-k with positions 1, 2, 3, 5 and 8 and top-p with 0.5, 0.75, 0.9 and 1, sit beside the playback buttons and a speed control.',
        'A code panel titled "Where the cut falls" starts empty; the reader clicks "+ Add language" to pick from Python, JavaScript, TypeScript, Java, C++ and C#, at most two side by side, and the highlighted line then follows the round from the k blade to the running total to the measurement.',
        'The two prompts, their sixteen words and every probability are fixed, so an article can quote any kept count or cut percentage for any of the twenty settings and name the word it concerns.',
      ],
    },

    useWhen: [
      'An article recommends a top-k value as if it meant the same thing in every context, and the reader needs to see that k = 2 throws away 8% of the probability after one prompt and 58% after another.',
      'The prose has to explain why top-p is called adaptive without leaving it as a slogan: one line at 0.9 keeps two words after a near-certain prompt and six after an open one, and the reader moves the line to watch that happen.',
      'A reader configuring a generation API sets both top_k and top_p and assumes the result is simply the stricter of the two. The chained case that keeps a single word where each setting alone would keep two is the counterexample.',
      'The article contrasts the two methods and needs one sentence to carry away: a fixed number keeps the count level and lets the discarded probability vary with the prompt, while a fixed share does the opposite.',
    ],

    avoidWhen: [
      'The article quotes these probabilities as measurements of a real model. They are example values in per mille chosen to make one prompt near-certain and the other open.',
      'The subject is what happens after the shortlist is formed — the random pick of the next word. Each round here ends by measuring what was cut, and nothing is chosen.',
      'The article is about temperature or any other reshaping of the whole distribution. Both handles here only remove candidates; the relative sizes of whatever remains are never changed.',
      'The subject is the internal order of a specific library beyond the fact that k is applied first. The picture follows that one order and does not show any alternative ordering.',
    ],

    contrastWith: [
      {
        concept: 'cutTheTail',
        note: 'Both involve truncating by rank, but one follows a single truncation through to the random pick it leaves room for, while this weighs rank-based truncation against a threshold on accumulated probability and asks which quantity each keeps fixed.',
      },
      {
        concept: 'fillToAShare',
        note: 'One claims that a threshold on accumulated probability lets the shape of the distribution decide how many candidates stay; this adds the reverse half — a fixed number lets the shape decide how much probability is discarded — and what the two do when stacked.',
      },
      {
        concept: 'temperatureSampling',
        note: 'Temperature reshapes every candidate\'s probability and removes none; truncation removes candidates and leaves the ratios among the rest exactly as they were.',
      },
      {
        concept: 'greedyDecoding',
        note: 'Keeping only the single most probable token is where both truncations collapse to one candidate; this concerns the settings short of that limit, where the two disagree.',
      },
      {
        concept: 'beamSearch',
        note: 'Beam width is also a fixed count, but it counts whole partial sequences carried across steps rather than candidates for a single next token.',
      },
    ],
  },
};
