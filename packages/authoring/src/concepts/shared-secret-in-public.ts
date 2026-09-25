/**
 * sharedSecretInPublic 개념 선언.
 *
 * canonical facet 은 `facet:sharedSecretInPublic` — 클라이언트 · 서버 · 엿듣는 이. p 23 · g 5 가 건너고, 클라이언트가
 * A = 5^6 mod 23 = 8, 서버가 B = 5^15 mod 23 = 19 를 셈해 보낸다. 건널 때마다 엿듣는 이 손에 사본이 떨어진다. 두 끝이 각자
 * K = 2 에 닿고, K 는 선을 건너지 않는다. 엿듣는 이는 23 · 5 · 8 · 19 를 쥐고 A × B mod p = 14 를 셈할 뿐이다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `tlsHandshake` 는 가운데가 값을 바꿔 끼우면 K 가 갈리고 서명 확인이 그것을 끊는다는 것을 손잡이로 돌린다. 이웃
 * `certificateChain` 은 인증서를 뿌리까지 거슬러 오른다. 이쪽의 주장은 하나 — **공개값만 선을 건너는데 두 끝은 엿듣는 이가 셈할 수
 * 없는 같은 수에 각자 닿는다.** 그래서 definition 은 public values · eavesdropper · copies · never transmitted 쪽 낱말을 쥐고,
 * man-in-the-middle · certificate · signature · abort 를 쓰지 않는다.
 *
 * 전제 (설명 글 `sharedSecretInPublic.md` 가 밝힌 것): 작은 수 유한체 판(p 23 이면 6 번째 시도로 a 가 풀린다) · 실제 TLS 1.3 은
 * ECDHE · 비밀 a · b 는 보기로 정한 값 · 엿듣는 이는 듣기만 한다(바꿔치기는 인증서의 일).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sharedSecretInPublicConcept: FacetConceptSource = {
  id: 'sharedSecretInPublic',
  label: 'Diffie-Hellman: A Shared Secret Over a Public Wire',
  canonicalFacet: 'facet:sharedSecretInPublic',

  surface: {
    definition:
      'In Diffie-Hellman key exchange only public values cross the wire, yet each end raises the other\'s value to its own secret exponent and both reach the same key, which is never transmitted and cannot be formed from the eavesdropper\'s copies.',
    exemplarKeywords: [
      'Diffie-Hellman key exchange',
      'g^a mod p',
      'shared secret',
      'key agreement',
      'passive eavesdropper',
      'modular exponentiation',
      'discrete logarithm',
      'public and private values',
      'why the key is never sent',
      'finite field DH example',
    ],
  },

  briefing: {
    observable: [
      'Client and Server at the two ends of a "public wire", an Eavesdropper below it. Each end shows its secret — a = 6 at the client, b = 15 at the server — and slots for p, g, A, B, K. "Each end keeps its own secret." "The eavesdropper’s hand is empty."',
      'p = 23 and g = 5 cross from client to server, and "The eavesdropper keeps a copy." The original keeps travelling; only a copy drops into the eavesdropper\'s hand.',
      'Each computation is spelled out: "Client: A = g^a mod p = 5^6 mod 23 = 8", then A = 8 crosses; "Server: B = g^b mod p = 5^15 mod 23 = 19", then B = 19 crosses back. The eavesdropper keeps a copy each time.',
      'The keys are computed separately at each end — "Client: K = B^a mod p = 19^6 mod 23 = 2", then "Server: K = A^b mod p = 8^15 mod 23 = 2". No K ever travels on the wire, and a and b never leave their ends.',
      'Last step: "Eavesdropper holds p = 23 · g = 5 · A = 8 · B = 19 · A × B mod p = 14, not K = 2 at both ends."',
      'The numbers are small enough that trying k = 1, 2, … finds a at the sixth try; real use takes numbers far too large for that, and TLS 1.3 uses elliptic-curve Diffie-Hellman. The secrets are fixed for the example, and the eavesdropper only listens. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, eight steps after the opening scene, and stops after the eavesdropper\'s attempt.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 7 holds both K = 2 values side by side with the wire between them carrying nothing of the sort.',
        'All values are fixed, so every exponentiation can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader asks how two parties can agree on a secret key when everything they send can be read; the eavesdropper ending with four public numbers and no K answers it.',
      'An article introduces Diffie-Hellman arithmetic and wants a worked example with small numbers where every power and remainder is visible.',
    ],

    avoidWhen: [
      'The subject is a man-in-the-middle who alters values. The third party here only copies what passes.',
      'The article is about RSA encryption or digital signatures. Nothing is encrypted or signed; a key is agreed.',
      'The point is elliptic-curve arithmetic. The exchange is done in integers modulo 23.',
    ],

    contrastWith: [
      {
        concept: 'tlsHandshake',
        note: 'Agreeing on a key that a listener cannot compute is one guarantee. Knowing the other end is the intended server is another, and without authentication an active interceptor gets a key with each side.',
      },
      {
        concept: 'certificateChain',
        note: 'Key agreement produces a secret without saying who shares it. Certificate validation establishes whose public key is whose, which is what key agreement lacks.',
      },
      {
        concept: 'signatureKeyDirection',
        note: 'A signature binds a message to the holder of one private key. Diffie-Hellman binds nothing to anyone; both ends contribute a secret and neither proves identity.',
      },
      {
        concept: 'asymmetricRsa',
        note: 'RSA encryption lets anyone lock a message that only the key holder can open. Diffie-Hellman sends no message under a key at all; both sides derive the same key from each other\'s public values.',
      },
    ],
  },
};
