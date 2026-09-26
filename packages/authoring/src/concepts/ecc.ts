/**
 * ecc 개념 선언.
 *
 * canonical facet 은 `facet:ecc` — 완제품. 왼쪽 원소판(곡선 y² = x³ + 2x + 2 mod 17 의 점판, 또는 g 5 mod 23 의 시계판)
 * 위에서 두 길을 센다. 비밀 k 의 2진을 높은 비트부터 읽는 두 배-더하기로 kG 에 닿는 가는 셈과, 공개된 kG 만 보고 G 부터
 * 하나씩 더해 k 를 되찾는 셈(k − 1). 끝에 상대 비밀 15 로 만든 B 가 건너와 k·B = 15·A = K 로 교환이 닫힌다.
 * 손잡이는 군(곱셈 · 곡선)과 비밀 k. 코드 패널은 IR → 여섯 언어.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 셋은 이 판의 한 장면씩을 쥔다 — `pointAddOnCurve` 는 점 덧셈 하나의 모양(실수 위 곡선),
 * `mixAndCannotUnmix` 는 섞은 값의 크기가 지수를 알려 주지 않는다는 것, `smallerKeySameStrength` 는 RSA 와 곡선 열쇠의
 * 길이 표. 이쪽은 **손잡이로 두 셈을 견주는 전체**라 definition 은 double-and-add · scalar multiplication · 셈 수 ·
 * 군을 바꿔도 같은 셈 쪽 낱말을 쥐고, 선 · 뒤집기 · 크기 순위 · 비트 표는 쓰지 않는다.
 * 비밀 k 손잡이의 칸 수와 값 범위는 줄어드는 중이라 적지 않는다 (기본 13 만 적는다).
 *
 * 전제 (설명 글 `ecc.md`): 작은 유한체 곡선(점 18 + O, G 의 차수 19)과 p 23 곱셈군 · 실물은 256 비트 곡선(secp256k1 · P-256)과
 * 2048 비트 p · 점 덧셈 식 · 두 배-더하기 · 교환 식은 실물과 같다 · 비밀 k 와 상대 비밀 15 는 예로 정한 값 · 되찾는 셈은
 * "G 부터 하나씩" 으로 센 것이고 실물의 최선 공격(폴라드 로)은 이보다 빠르다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const eccConcept: FacetConceptSource = {
  id: 'ecc',
  label: 'Elliptic Curve Cryptography (Double-and-Add vs Recovering k)',
  canonicalFacet: 'facet:ecc',

  surface: {
    definition:
      'Elliptic-curve scalar multiplication reaches kG from G by double-and-add in a few group operations, while recovering k from kG by adding G repeatedly costs k − 1, and the same counts hold in a multiplicative group mod p.',
    exemplarKeywords: [
      'elliptic curve cryptography',
      'ECC',
      'scalar multiplication',
      'double-and-add',
      'elliptic curve discrete logarithm problem',
      'ECDLP',
      'ECDH',
      'Diffie-Hellman',
      'public key kG',
      'secp256k1',
      'P-256',
      'finite field curve',
      'group operation count',
    ],
  },

  briefing: {
    observable: [
      'On the left, a board of group elements: in the curve group, the 18 points of y² = x³ + 2x + 2 (mod 17) scattered on a grid plus the point at infinity O; in the multiply group, the values of g = 5 mod 23 set around a clock face. The board title names the group ("Curve · y² = x³ + 2x + 2 (mod 17)" or "Multiply · gᵏ mod 23 · g = 5").',
      'On the right, "Secret k: 13" with its binary digits 1 1 0 1, a "Double-and-add path" row of chips, and two bars labelled "Forward ops" and "Backward ops".',
      'Double-and-add reads the bits from the top: a current-point marker leaps across the board G → 2G → 3G → 6G → 12G → 13G, each leap captioned like "Double: 3G → 6G = (16, 13)" or "Add G: 12G → 13G = (16, 4)", and the forward bar grows one cell per operation to 5.',
      'The recovery step starts again from G and walks G, 2G, 3G, … one point at a time, leaving a trail, until it meets 13G: "From G, one at a time: 12 × add G → (16, 4) · recovered k: 13". The backward bar ends at 12 against the forward bar\'s 5.',
      'The last step is the exchange: "Alice · A = 13G: (16, 4)", "Bob · B = 15G: (3, 16)" and "13·B = 15·A = K: (9, 16)" — both sides land on the same point K. The caption reads "Exchange · K: (9, 16) · forward 5 · backward 12".',
      'A default run is eight steps counting the opening: start, double, add, double, double, add, recover, exchange.',
    ],

    screen: {
      affordances: [
        'Play, Step, Pause and Reset with a speed slider, plus two segmented handles — Group (Multiply / Curve, starting on Curve) and Secret k (starting at 13) — and the Forward ops / Backward ops metrics. Each change of a handle replays the whole run from the opening.',
        'Stepping Secret k upward is the contrast to show: the backward count grows in a straight line as k − 1, while the forward count rises and falls with the binary pattern of k — a power of two costs fewer operations than the value just below it. For the smallest values of k the two counts are equal, and they separate from there.',
        'Switching Group moves every element from the scattered curve board onto the clock face of g^m mod 23, yet for the same k both bars keep exactly their lengths: doubling becomes squaring and adding G becomes multiplying by g, so the two groups walk the same path with the same count.',
        'The code panel, labelled "Code", carries the same computation into Python, JavaScript, TypeScript, Java, C++ and C#, and its counts and shared key match the screen for every setting of the handles.',
      ],
    },

    useWhen: [
      'The article explains why an elliptic-curve public key kG can be published: the reader needs to see the few leaps that build it set against the long walk needed to get k back.',
      'The reader believes elliptic-curve Diffie-Hellman is a different kind of scheme from classic Diffie-Hellman. Flipping between the curve and multiplication mod p while both counts stay fixed shows they are the same exchange in two groups.',
      'The article introduces double-and-add and wants the operation count tied to the binary form of the secret rather than to its size.',
    ],

    avoidWhen: [
      'The article needs the geometric chord-and-tangent picture of point addition on a smooth curve. The board is a finite field, so points jump rather than being joined by lines.',
      'The subject is the real attack cost on ECC (Pollard\'s rho, square-root security) or concrete key sizes. The backward count here is plain one-at-a-time search on a curve with 19 multiples of G.',
      'The point is an eavesdropper or a man-in-the-middle during key exchange. Only the final equality of the two sides\' K is shown; nobody listens or tampers.',
      'The article is about ECDSA signatures. Nothing is signed or verified.',
    ],

    contrastWith: [
      {
        concept: 'asymmetricRsa',
        note: 'Both rest on a computation that is cheap forward and costly to reverse, but RSA\'s hard direction is factoring a product of primes while ECC\'s is finding how many times a point was added, which lets it reach the same strength with a much shorter key.',
      },
      {
        concept: 'pointAddOnCurve',
        note: 'Point addition is the single group operation; this concept counts how many of them building kG takes compared with recovering k, and treats each addition as one unit.',
      },
      {
        concept: 'mixAndCannotUnmix',
        note: 'Both concern getting an exponent-like secret back from a public result. That one argues the result\'s size carries no hint of the exponent; this one counts the work of the forward and backward paths and shows it is the same in two different groups.',
      },
      {
        concept: 'smallerKeySameStrength',
        note: 'Key length versus security level is a table-level comparison between RSA and curves; this concept is the arithmetic of one curve, with no claim about how many bits a real key needs.',
      },
      {
        concept: 'sharedSecretInPublic',
        note: 'Diffie-Hellman over a public wire is about what a listener can and cannot compute from the values that cross; this concept is about the cost gap that makes a public point safe to send, with the exchange reduced to the equality k·B = b·A.',
      },
      {
        concept: 'fastPower',
        note: 'Double-and-add is square-and-multiply written in additive notation. Fast power is about the saving itself; here the saving is one side of a one-way gap.',
      },
    ],
  },
};
