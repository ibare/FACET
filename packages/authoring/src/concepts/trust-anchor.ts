/**
 * trustAnchor 개념 선언.
 *
 * canonical facet 은 `facet:trustAnchor` — 한 주장을 말하는 조각(piece) facet. 이름이 `CN=Demo Root CA` 로 같은 뿌리
 * 둘(진짜 (4757, 13) · 가짜 (4661, 7))이 건너와 있고, 신뢰 저장소에는 연결 전부터 진짜의 항목 하나가 있다. 둘 다 제 서명을
 * 제 열쇠로 풀면 맞다(1754 · 1795). 저장소와 견줄 때에야 진짜만 믿는다. 끝 수: 제 서명이 맞은 뿌리 2 · 믿은 뿌리 1.
 * 걸음 다섯(걸음 0 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `certificate` 는 위조 넷의 성패를 견주고 가짜 뿌리를 그 하나로 품는다. 형제 조각 `bindsKeyToName` 은 한 장 안에서
 * 이름과 열쇠가 묶이는 것이다. 이쪽의 주장은 하나 — **제 서명은 누구나 맞출 수 있어 뿌리를 가르지 못하고, 믿음은 미리 들여놓은
 * 저장소에서 온다.** 그래서 definition 은 self-signed · root · trust store · installed in advance 를 쥐고, forgery 의 갈래 ·
 * subject name and key · leaf · intermediate 를 쓰지 않는다.
 *
 * 전제 (설명 글 `trustAnchor.md`): 장난감 RSA(진짜 67 · 71 · e 13 · 가짜 59 · 79 · e 7) · 요약 = 장난감 16 비트 해시 H 를
 * 제 n 으로 줄인 것 · 저장소는 이름으로 찾고 열쇠로 가른다 · 잎 · 중간 인증서 · 유효 기간 · 폐기는 없다.
 * 저장소를 운영체제 · 브라우저가 싣는다는 것은 설명 글이 말하고 화면은 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const trustAnchorConcept: FacetConceptSource = {
  id: 'trustAnchor',
  label: 'Trust Anchor: Roots Are Trusted Because They Were Installed',
  canonicalFacet: 'facet:trustAnchor',

  surface: {
    definition:
      'A self-signed root certificate verifies under its own key whether genuine or fake, so a root is trusted only when its key matches one installed in the trust store in advance.',
    exemplarKeywords: [
      'trust anchor',
      'root certificate',
      'self-signed certificate',
      'root store',
      'trusted root certification authorities',
      'who signs the root certificate',
      'why trust a root CA',
      'installing a custom root certificate',
      'fake root CA',
      'operating system and browser root programs',
      'self-signed certificate warning',
    ],
  },

  briefing: {
    observable: [
      'Two root cards arrive, "Genuine root" and "Fake root", both with Subject and Issuer `CN=Demo Root CA`. Above them a Trust store already holds one entry, "CN=Demo Root CA · n 4757 · e 13"; the caption says the store was filled before this connection.',
      'Genuine root, own key: digest of name and key 1754, self-signature 3160, and 3160^13 mod 4757 = 1754 — Holds.',
      'Fake root, own key: digest 1795, self-signature 2676, and 2676^7 mod 4661 = 1795 — also Holds. Whoever made the fake holds its private key, so the self-signature is as correct as the genuine one. "Self-signatures that held: 2".',
      'Genuine root against the store: "found by name in the store; the keys match", Store (4757, 13) = this (4757, 13). Trusted — the card rises to the store and is tied to it.',
      'Fake root against the store: found by the same name, but Store (4757, 13) ≠ this (4661, 7). Not trusted — the card sinks. The run ends with "Self-signatures that held: 2" beside "Trusted roots: 1".',
      'RSA uses two-digit primes and the digest is a 16-bit toy hash reduced by the root\'s own n; the formulas are the real ones. There are no leaf or intermediate certificates, and validity and revocation are not checked. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself, counting the opening, and stops once the fake root is rejected.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to the second step holds the moment both self-signatures have held and nothing yet separates the two roots.',
        'The root name, keys and store entry are fixed, so every figure can be quoted as shown.',
      ],
    },

    useWhen: [
      'The reader asks who vouches for the root at the top of a chain; two roots whose self-signatures both check out, told apart only by the preinstalled store, answer it.',
      'The article warns that adding a root certificate to a device is a weighty decision, and needs to show that nothing but the store entry stands between a fake root and trust.',
    ],

    avoidWhen: [
      'The subject is climbing from a server\'s leaf certificate through intermediates. There are only roots here.',
      'The article is about how a certificate binds a public key to a domain name. The roots here only sign themselves.',
      'The point is certificate pinning, revocation lists or Certificate Transparency. None of them appear.',
    ],

    contrastWith: [
      {
        concept: 'certificateChain',
        note: 'Chain validation climbs until it reaches a root the client already holds. The trust anchor is the claim that this stopping point is trusted by prior installation, not by any check the chain performs.',
      },
      {
        concept: 'bindsKeyToName',
        note: 'A signed certificate ties a subject\'s key to its name, provided the issuer\'s key is trusted. A root has no issuer above it, so its signature on itself ties nothing and trust has to come from outside.',
      },
      {
        concept: 'certificate',
        note: 'A fake root is one route among several for forging a certificate. On its own, the point is broader: correct self-signature arithmetic is available to anyone and never grants trust.',
      },
      {
        concept: 'signatureKeyDirection',
        note: 'That the private key signs and the public key checks explains why a self-signature verifies. It is also why it proves nothing about identity: whoever made the key pair can always make it verify.',
      },
    ],
  },
};
