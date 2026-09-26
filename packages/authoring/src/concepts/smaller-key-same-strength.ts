/**
 * smallerKeySameStrength 개념 선언.
 *
 * canonical facet 은 `facet:smallerKeySameStrength` — 조각. 강도 다섯 단(80 · 112 · 128 · 192 · 256 비트)마다 RSA 모듈러스 막대와
 * 타원 곡선 키 막대가 같은 축척으로 나란히 늘고, 배율(6.4 → 30.0)과 차(864 → 14848 비트)가 단마다 벌어진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ecc` 는 한 곡선 위의 셈을 손잡이로 돌리고, 형제 `pointAddOnCurve` 는 점 덧셈의 모양을 보인다. 이쪽에는 곡선도 셈도 없다 —
 * **표준이 정한 열쇠 길이 표** 하나다. 그래서 definition 은 security level · bits · RSA modulus · ratio · gap 쪽 낱말을 쥐고,
 * 점 · 두 배-더하기 · 되찾기는 쓰지 않는다.
 *
 * 전제 (설명 글 `smallerKeySameStrength.md`): 표는 NIST SP 800-57 Part 1 Rev. 5 표 2 · 곡선 쪽은 표준 범위의 아래 끝 · "강도 s 비트" 는
 * 가장 좋은 알려진 공격에 약 2^s 번의 일 · 곡선은 폴라드 로(제곱근)라 키 = 2 × 강도, RSA 는 일반 수체 체라 가파르다 ·
 * 셈 속도 · 서명 크기 · 양자 이야기는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const smallerKeySameStrengthConcept: FacetConceptSource = {
  id: 'smallerKeySameStrength',
  label: 'Key Length vs Security Level (RSA and Elliptic Curve)',
  canonicalFacet: 'facet:smallerKeySameStrength',

  surface: {
    definition:
      'At equal security levels an elliptic-curve key needs about twice the level in bits while an RSA modulus grows far faster, so the ratio and bit gap between them widen as strength rises.',
    exemplarKeywords: [
      'key size comparison',
      'RSA vs ECC key length',
      'bits of security',
      'security strength',
      'NIST SP 800-57',
      'RSA-2048',
      'RSA-3072',
      'P-256',
      '256-bit elliptic curve key',
      'why ECC keys are shorter',
      'Pollard rho',
      'general number field sieve',
    ],
  },

  briefing: {
    observable: [
      'Opening: an empty table headed Strength · RSA · Elliptic curve · Ratio · Gap, with only the five strength levels 80, 112, 128, 192 and 256 filled in — "Strength levels to compare: 5".',
      'Each step reveals one level. An RSA bar and an elliptic-curve bar, on the same scale and aligned at the left, grow from the previous level\'s lengths to the new ones, and the ratio and gap columns fill in.',
      'The rows read 1024 / 160 (×6.4, 864), 2048 / 224 (×9.1, 1824), 3072 / 256 (×12.0, 2816), 7680 / 384 (×20.0, 7296) and 15360 / 512 (×30.0, 14848).',
      'Captions track the widening: "Strength 128: ratio ×9.1 → ×12.0, gap 1824 → 2816 bits". Dashed lines joining the bar ends fan apart as the table goes down.',
      'The elliptic-curve column is exactly twice the strength at every row; the RSA column is not tied to any such multiple.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself, counting the empty opening table, and stops once the 256-bit row is in.',
        'A Replay button and a playback strip sit below it. Dragging the strip back after the run shows the two bars growing level by level from the same start.',
        'Every number comes from the standard\'s table, so the key sizes, ratios and gaps can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader suspects a 256-bit elliptic-curve key must be weaker than a 2048-bit RSA key because it is shorter. Comparing at equal strength rather than equal length corrects that.',
      'An article on choosing key sizes needs the standard pairing — RSA-2048 at 112 bits, RSA-3072 alongside P-256 at 128 — laid out together.',
      'The point is that the advantage of curves grows as security requirements rise, not just that curve keys are shorter.',
    ],

    avoidWhen: [
      'The article is about how elliptic-curve arithmetic works — point addition, scalar multiplication. There is no curve on the screen.',
      'The subject is speed, signature size, bandwidth or post-quantum security. Only attack cost is compared.',
      'The article is about symmetric key lengths (AES-128/256) on their own. Only the two public-key columns are drawn.',
    ],

    contrastWith: [
      {
        concept: 'asymmetricRsa',
        note: 'RSA as a mechanism is about a key pair where one key locks and the other unlocks; this concept takes RSA\'s security for granted and asks only how long its modulus must be for a given attack cost.',
      },
      {
        concept: 'ecc',
        note: 'Elliptic-curve cryptography as a computation compares the work of building a public point with the work of recovering its secret; this concept compares real key lengths across security levels and explains nothing of the arithmetic.',
      },
      {
        concept: 'pointAddOnCurve',
        note: 'Point addition is the operation inside every curve key; key length for equal strength is a claim about how the best attacks scale, which the operation alone does not reveal.',
      },
    ],
  },
};
