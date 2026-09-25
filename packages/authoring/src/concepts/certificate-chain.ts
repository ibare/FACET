/**
 * certificateChain 개념 선언.
 *
 * canonical facet 은 `facet:certificateChain` — 서버가 잎 `CN=shop.example` 과 중간 `CN=Example Issuing CA` 를 꾸러미로
 * 보낸다. 확인은 잎의 발급자를 꾸러미에서 찾아 서명을 풀고, 중간의 발급자 `CN=Example Root CA` 는 꾸러미에 없어 클라이언트의
 * 신뢰 저장소(Other · Example · Old 차례)에서 찾는다. 서명이 맞으면 저장소의 뿌리에 닿아 멈춘다. 사슬 셋. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `tlsHandshake` 는 사슬 확인을 한 걸음으로 접고 서버 서명이 끼어들기를 잡는 쪽을 돌린다. 이웃 `sharedSecretInPublic` 은
 * 열쇠 맞추기다. 이쪽의 주장은 하나 — **확인은 잎에서 발급자를 따라 한 칸씩 올라, 클라이언트가 원래 가진 뿌리에 닿아야 멈춘다.**
 * 그래서 definition 은 leaf · issuer · intermediate · trust store · root 쪽 낱말을 쥐고, man-in-the-middle · key exchange ·
 * abort 를 쓰지 않는다.
 *
 * 전제 (설명 글 `certificateChain.md` 가 밝힌 것): 장난감 RSA(네 자리 열쇠, 요약 = `subject|issuer|n|e` 코드값 합 mod n) ·
 * 화면은 셈식 없이 맞음 · 어긋남만 · 꾸러미 먼저 그다음 저장소 · 유효 기간 · 폐기 · 호스트 이름 일치는 보지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const certificateChainConcept: FacetConceptSource = {
  id: 'certificateChain',
  label: 'Certificate Chain Validation: Climbing to a Trusted Root',
  canonicalFacet: 'facet:certificateChain',

  surface: {
    definition:
      'Certificate chain validation starts at the server\'s leaf certificate and climbs issuer by issuer, checking each signature with the issuer\'s public key, and stops only at a root already in the client\'s own trust store.',
    exemplarKeywords: [
      'certificate chain',
      'chain of trust',
      'intermediate CA',
      'root CA',
      'trust store',
      'leaf certificate',
      'issuer and subject',
      'X.509 path validation',
      'certificate authority',
      'missing intermediate certificate',
    ],
  },

  briefing: {
    observable: [
      'Server on one side with a Received bundle of two certificates, `CN=shop.example` (issuer `CN=Example Issuing CA`) and `CN=Example Issuing CA` (issuer `CN=Example Root CA`). Client on the other with a Trust store holding `CN=Other Root CA`, `CN=Example Root CA`, `CN=Old Root CA`. Each card shows its public key and, where it has one, a signature.',
      'The bundle crosses to the client — "Certificates received from the server: 2".',
      'Climbing from the leaf: "Issuer CN=Example Issuing CA — found in the received bundle." Then "Opened the signature with the issuer\'s public key — it matches the digest."',
      'Next link: "Issuer CN=Example Root CA — not in the received bundle; found in the trust store." The search crosses from what the server sent into what the client already had; `CN=Other Root CA` is passed over by name and `CN=Old Root CA` is never looked at.',
      'The intermediate\'s signature is opened with the root\'s key and matches. Then: "Reached a certificate from the trust store — stop and trust it. Links in the chain: 3". The root\'s own self-signature is not checked.',
      'Signatures are toy RSA with four-digit keys, and the digest is a character-code sum of `subject|issuer|n|e`; the screen shows only match or mismatch. Validity dates, revocation and host-name matching are not checked. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, six steps after the opening scene, and stops once a trusted root is reached.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to the second "find" step holds the moment the search leaves the received bundle and enters the trust store.',
        'Certificate names and the order of the trust store are fixed, so each step\'s wording can be quoted as shown.',
      ],
    },

    useWhen: [
      'The reader asks how a browser can trust a certificate it has never seen; climbing issuer by issuer until a root the client already holds answers it.',
      'The article warns that a root sent by the server proves nothing, and needs the moment where the search has to find the root in the client\'s own store.',
    ],

    avoidWhen: [
      'The subject is certificate revocation, OCSP, expiry or host-name mismatch errors. None are checked.',
      'The article is about key exchange or man-in-the-middle attacks on it. Only certificate verification happens here.',
      'The point is how RSA signatures are computed. The arithmetic stays off screen; only match or mismatch is shown.',
    ],

    contrastWith: [
      {
        concept: 'tlsHandshake',
        note: 'A valid chain shows the server\'s key belongs to its name. Whether that key signed the values exchanged in this handshake is a further check, and it is the one an interceptor forwarding real certificates fails.',
      },
      {
        concept: 'sharedSecretInPublic',
        note: 'Key agreement gives two ends a common secret without identifying either. Chain validation identifies the server\'s key and exchanges no secret.',
      },
      {
        concept: 'signatureOnHash',
        note: 'Signing a digest rather than the whole document is how one signature is made. Chain validation repeats checking such signatures link by link and decides where the repetition may stop.',
      },
    ],
  },
};
