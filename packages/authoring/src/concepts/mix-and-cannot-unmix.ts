/**
 * mixAndCannotUnmix 개념 선언.
 *
 * canonical facet 은 `facet:mixAndCannotUnmix` — 조각. 공개값 A = 2^a mod 11 = 3 하나만 보이고 a 는 숨는다. 두 사다리 —
 * 섞지 않은 2^k 와 mod 11 로 섞은 값 — 위에서 지수 k 를 1 부터 10 까지 올린다. 섞지 않은 쪽은 늘 오르고, 섞은 쪽은
 * 오름 넷 · 내림 다섯으로 튄다. 지수 8 에서 A 를 만나고, 끝에 A 3 은 섞은 값 가운데 셋째로 작은데 지수는 8 이라고 적는다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ecc` 는 가는 셈과 되찾는 셈의 **수**를 손잡이로 견준다. 이쪽의 한 질문은 "섞은 값의 **크기**에서 지수를 짐작할
 * 실마리가 남는가" 다. 그래서 definition 은 order · size · rank · jumps up and down 쪽 낱말을 쥐고, 셈 수 · 두 배-더하기 ·
 * 곡선은 쓰지 않는다. 형제 `easyOneWayHardBack`(곱셈 대 나눗셈의 수고)과도 "수고" 가 아니라 "순서가 사라진다" 로 갈린다.
 *
 * 전제 (설명 글 `mixAndCannotUnmix.md`): p 11 · g 2 · a 8 은 예로 정한 작은 값 · 2 는 mod 11 의 원시근이라 1..10 이 한 번씩
 * 나온다 · 실물은 2048 비트 이상의 p 나 타원 곡선 군 · 구조(A = g^a mod p, 이산 로그)는 같다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mixAndCannotUnmixConcept: FacetConceptSource = {
  id: 'mixAndCannotUnmix',
  label: 'Modular Mixing Hides the Exponent',
  canonicalFacet: 'facet:mixAndCannotUnmix',

  surface: {
    definition:
      'Reducing powers of g mod p destroys their order: as the exponent rises the reduced values jump up and down, so the size of a public value A gives no hint of its exponent.',
    exemplarKeywords: [
      'discrete logarithm',
      'g^a mod p',
      'modular exponentiation',
      'why modular arithmetic is one-way',
      'primitive root',
      'no ordering after mod',
      'cannot binary search the exponent',
      'Diffie-Hellman public value',
      'one-way function',
    ],
  },

  briefing: {
    observable: [
      'At the top: "Public: A = 2^a mod 11 = 3" and "Hidden: a". The opening caption reads "Only A is public. Both sides raise the exponent one at a time."',
      'Two ladders stand side by side with small values at the bottom: "Unmixed value · 2^k" with rungs 2 … 1024, and "Mixed value · 2^k mod 11" with slots 1 … 10, the slot holding A marked. Each side keeps an Up and a Down counter.',
      'Each step raises k by one; the ball on each ladder hops to its new rung, the exponent is stamped beside it, and rising hops arc to one side while falling hops arc to the other. Captions read like "Exponent 4: unmixed up → 16 · mixed down → 5".',
      'The unmixed side only ever climbs, one rung at a time: 2, 4, 8, … 1024. The mixed side goes 2, 4, 8, 5, 10, 9, 7, 3, 6, 1 — four rises and five falls — and after ten steps every slot from 1 to 10 has been filled once.',
      'At exponent 8 the mixed value equals A: "Mixed equals A here — exponent 8", and the hidden a is replaced by "Exponent that met A: 8". The run continues to exponent 10 anyway.',
      'The final step sets the two rankings side by side: "Among mixed values, A 3: rank 3 from smallest (of 10) · exponent 8" and "Among unmixed values, 256: rank 8 from smallest (of 10) · exponent 8". Read bottom to top, the stamps on the mixed ladder are 10, 1, 8, 2, 4, 9, 7, 3, 6, 5.',
    ],

    screen: {
      affordances: [
        'The screen plays eleven steps by itself, counting the opening, and stops after exponent 10.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back and forth over the middle steps shows the mixed ball swinging up and down while the unmixed ball keeps climbing.',
        'p = 11, g = 2 and a = 8 are fixed, so every power, residue and rank can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader asks why A = g^a mod p cannot be undone by guessing a bigger or smaller exponent. The small A that sits at exponent 8 answers it.',
      'An article on the discrete logarithm wants to show that the reduction mod p is what removes the foothold, by setting the same powers before and after the reduction side by side.',
    ],

    avoidWhen: [
      'The subject is the full key exchange — two parties, a wire, an eavesdropper, a shared key. Only one public value and its exponent appear.',
      'The article is about fast exponentiation or how many multiplications a power takes. Every exponent is visited in turn and no operation count is compared.',
      'The point is modular arithmetic as clock arithmetic for its own sake. The wrap-around is used here only to show that order disappears.',
      'The article needs realistic group sizes or the best known discrete-log algorithms. p is 11.',
    ],

    contrastWith: [
      {
        concept: 'easyOneWayHardBack',
        note: 'Both are about a one-way computation. That one measures the effort gap between multiplying and factoring; this one shows that the output keeps no order that would narrow a search back to the input.',
      },
      {
        concept: 'sharedSecretInPublic',
        note: 'Key agreement relies on A = g^a mod p being safe to publish; this concept isolates why it is safe, without the second party or the shared key.',
      },
      {
        concept: 'ecc',
        note: 'Elliptic-curve cryptography compares the cost of building a public point with the cost of recovering its secret, in two groups; this concept makes no count and argues only that the public value\'s size betrays nothing.',
      },
      {
        concept: 'hashAvalanche',
        note: 'Both show outputs that keep no trace of how close their inputs were, but a hash does it by design over arbitrary data, while modular reduction does it to the consecutive powers of one base.',
      },
    ],
  },
};
