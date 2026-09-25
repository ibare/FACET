/**
 * tlsHandshake 개념 선언.
 *
 * canonical facet 은 `facet:tlsHandshake` — 클라이언트 · 가운데 사람 · 서버가 가로로 선다. 작은 수 디피-헬먼(p 23 · g 5 ·
 * a 6 · b 15 · 가운데 m 9)과 장난감 RSA 서명. 손잡이 둘 — "Middle party" 엿듣기만 ↔ 끼어들기(처음 끼어들기), "Check certificate"
 * 안 함 ↔ 함(처음 함). 엿듣기만이면 두 K 가 2 로 같고 가운데는 K 0 개. 끼어들기 · 안 함이면 K 가 9 · 10 으로 갈리고 가운데가
 * 둘 다 쥔다. 끼어들기 · 함이면 사슬은 맞지만 서명이 어긋나(풀기 272 · 요약 195) 연결이 끊긴다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `sharedSecretInPublic` 은 엿듣는 이 앞에서 같은 K 에 닿는 장면, `certificateChain` 은 잎에서 뿌리로 거슬러 오르는 장면이다.
 * 이쪽은 **"비밀을 맞췄다" 와 "누구와 맞췄는가" 를 손잡이 둘로 가르는 것** — 끼어든 이는 디피-헬먼만으로 막히지 않고, 서버 서명을
 * 확인해야 끊긴다 — 을 맡는다. 그래서 definition 은 man-in-the-middle · substitutes · authenticate · abort 쪽 낱말을 쥐고,
 * 조각들이 쥔 eavesdropper copies · never crosses · trust store · issuer climb 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `tlsHandshake.md` 가 밝힌 것):
 *  - 작은 수 유한체 DH 와 장난감 RSA(서버 서명 지수 1109 · 요약 = 받은 값 × p + B 는 예로 정한 것). 비밀 값은 난수가 아니다.
 *  - 실제 TLS 1.3 은 ECDHE 와 대화 기록 해시 위의 CertificateVerify. 호스트 이름 일치 · 유효 기간 · 폐기는 보지 않는다.
 *  - 가운데가 제 인증서를 내미는 길은 화면에 없다(설명 글만 말한다). 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tlsHandshakeConcept: FacetConceptSource = {
  id: 'tlsHandshake',
  label: 'TLS Handshake: Who Was the Key Agreed With',
  canonicalFacet: 'facet:tlsHandshake',

  surface: {
    definition:
      'A man-in-the-middle who substitutes its own Diffie-Hellman value ends up sharing a separate key with each side; the handshake aborts only when the server\'s signature over the exchanged values fails to verify against its certified key.',
    exemplarKeywords: [
      'TLS handshake',
      'HTTPS',
      'man-in-the-middle attack',
      'MITM on key exchange',
      'unauthenticated Diffie-Hellman',
      'server authentication',
      'CertificateVerify',
      'why certificate validation matters',
      'disabling certificate verification',
      'ECDHE key exchange',
      'TLS 1.3',
    ],
  },

  briefing: {
    observable: [
      'Three boxes side by side — Client, Middle party, Server — each with its own secret (a 6 · m 9 · b 15), a Received slot and a K slot. Under the server, Public: p 23 · g 5. Bottom left a Trust store holding `CN=Example Root CA`. The caption opens "Secrets stay home: a 6 · b 15 · m 9. Public: p 23 · g 5".',
      'When the middle intercepts, A 8 stops on the line — "Client sends A 8. The middle stops it on the line" — and the middle sends its own M 11 to the server. The server makes B 19, signs digest 272 (signature 2016), and on the way back the middle keeps B 19 and sends M 11 to the client, passing the certificates and signature through unchanged.',
      'With the check on, the chain holds — "Chain check: links that hold 2 / 2" — but the bottom row sets the opened signature against the client\'s own digest: "Signature opens to 272 · client\'s own digest 195. Mismatch: the client cuts the connection." The K slots stay empty and Open connections is 0.',
      'With the check off, the same interception ends open: client K 9, server K 10, and the middle holds both. An arc above links client–middle and middle–server instead of client–server; Open connections 1, Keys held by middle 2.',
      'When the middle only listens, A and B pass it by and it keeps copies. Both ends reach K 2, the middle holds no key, and with the check on the signature opens to 203 against a digest of 203.',
      'Across the four settings (listens/intercepts × off/on): K 2 · 2 with 0 keys at the middle; 2 · 2 with 0; 9 · 10 with 2; none, connection cut. A round is 6, 8, 9 or 8 steps including the start.',
      'Numbers are small finite-field Diffie-Hellman and toy RSA, with fixed example secrets; the signature rule is chosen for the example. Real TLS 1.3 uses ECDHE and signs a hash of the whole handshake transcript. Host-name matching, validity dates and revocation are not checked. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Middle party" (Listens / Intercepts) starting at Intercepts, and "Check certificate" (Off / On) starting at On. The first round therefore ends with the connection cut.',
        'The move that makes the idea land is switching the check Off with the middle still intercepting: the connection now opens, the two K values split to 9 and 10, and the middle holds both. Then switching the middle to Listens: the values pass it by and both ends meet at 2.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button; the chosen language shows `handshake`, `chainHolds` and `powMod` and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'A reader believes key exchange alone makes a connection secure; turning the certificate check off while a middle party intercepts shows both ends "secured" to the wrong party.',
      'The article explains what certificate validation actually defends against, and needs the case where the chain is valid yet the signature over the exchanged values still exposes the interception.',
    ],

    avoidWhen: [
      'The subject is TLS record encryption, cipher suites or session resumption. The round ends once keys are agreed or the connection is cut.',
      'The article is about why discrete logarithms are hard to reverse. The numbers are small enough that nothing here depends on that difficulty.',
      'The point is certificate revocation, expiry or host-name mismatch. None of these are checked.',
    ],

    contrastWith: [
      {
        concept: 'sharedSecretInPublic',
        note: 'Reaching the same key in front of a passive listener is the promise of Diffie-Hellman. Whether that key is shared with the intended server is a separate question the exchange cannot answer by itself.',
      },
      {
        concept: 'certificateChain',
        note: 'A valid chain proves a public key belongs to a name. It does not prove that key signed this particular exchange; that second check is what defeats an interceptor who forwards the real certificates.',
      },
      {
        concept: 'signatureKeyDirection',
        note: 'Signing with a private key and checking with the public key is the general operation. In a handshake the thing signed is the pair of exchanged values, so a substituted value breaks the check.',
      },
    ],
  },
};
