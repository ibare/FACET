/**
 * bindsKeyToName 개념 선언.
 *
 * canonical facet 은 `facet:bindsKeyToName` — 한 주장을 말하는 조각(piece) facet. 인증서 한 장
 * (`CN=mail.example` · 열쇠 (2419, 3) · 발급자 `CN=Sample CA`). CA 가 이름 · 발급자 · 열쇠를 한 줄(tbs)로 이어
 * 요약 258 을 만들고 서명 1102 를 건다. 받는 쪽이 풀면 258 로 맞다. 열쇠만 (2701, 5) 로 바꿔 끼우면 다시 이은 줄의
 * 요약이 2636 이 되어 푼 값 258 과 어긋난다. 걸음 여섯(걸음 0 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `certificate` 는 무엇에 서명하느냐를 돌리며 위조 넷의 성패를 견준다. 형제 조각 `trustAnchor` 는 뿌리를 무엇으로
 * 믿는가다. 이쪽의 주장은 하나 — **서명이 이름과 열쇠를 함께 담은 요약 하나에 걸려 있어, 한쪽만 바꿔도 들통난다.**
 * 그래서 definition 은 subject name · public key · one digest · together · replacing only the key 를 쥐고, forgery 의 갈래 ·
 * multiply · collision · root · trust store 를 쓰지 않는다.
 *
 * 전제 (설명 글 `bindsKeyToName.md`): 장난감 RSA(CA 53 · 71 · e 11 · d 331) · 요약 = 장난감 16 비트 해시 H 를 CA 의 n 으로
 * 줄인 것 · tbs = `<subject>|<issuer>|<n>|<e>` · 받는 쪽은 CA 공개 열쇠를 이미 가졌다고 둔다 · 사슬 · 유효 기간 · 폐기는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bindsKeyToNameConcept: FacetConceptSource = {
  id: 'bindsKeyToName',
  label: 'A Certificate Binds Name and Key Under One Signature',
  canonicalFacet: 'facet:bindsKeyToName',

  surface: {
    definition:
      'A certificate issuer signs one digest computed over the subject name and public key together, so replacing only the key changes the recomputed digest and the unchanged signature no longer verifies.',
    exemplarKeywords: [
      'what does a certificate prove',
      'binding a public key to an identity',
      'tbsCertificate',
      'to-be-signed fields',
      'subject and subject public key',
      'swap the public key in a certificate',
      'tampered certificate detected',
      'certificate signature covers the key',
      'digital certificate',
      'CA signs the certificate fields',
    ],
  },

  briefing: {
    observable: [
      'One certificate card: Name `CN=mail.example`, Key (2419, 3), Issuer `CN=Sample CA`, Signature "none yet". The CA sits beside it with its key "n 3763 · e 11" and "d 331 — CA only".',
      'The CA joins the fields into one line, `CN=mail.example|CN=Sample CA|2419|3`, and the line runs "→ H a2b3 = 41651 → mod 3763 →" into the digest 258. Then "CA signs that one digest: 258^d mod 3763 = 1102", and the signature drops into the card.',
      'The Verifier, holding "CA key (3763, 11)", joins the line again, gets digest 258, unwraps the signature, 1102^11 mod 3763 = 258, and marks Match.',
      'A Key swapper replaces only the key: "(2419, 3) → (2701, 5). Name, issuer and signature stay." The old key is set aside as "Key taken out".',
      'The Verifier joins the new line `CN=mail.example|CN=Sample CA|2701|5` → H d816 → digest 2636, while the unwrapped signature is still 258: Mismatch. The two lines, "Line CA joined and signed" and "Line the verifier joins again", sit one above the other; the name and issuer segments line up exactly and only the key segment differs.',
      'RSA uses two-digit primes and the digest is a 16-bit toy hash reduced mod 3763; the formulas are the real ones. The verifier is assumed to already hold the CA\'s public key. There is one certificate, no chain, no validity dates or revocation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself, counting the opening, and stops on the mismatch.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to the first verification and forward to the last sets Match beside Mismatch for a certificate whose name never changed.',
        'The names, keys and every number are fixed, so each line and digest can be quoted exactly as shown.',
      ],
    },

    useWhen: [
      'The article says a certificate vouches that a key belongs to a name, and the reader needs to see why an attacker cannot keep the CA\'s signature and slip in its own key.',
      'A reader asks what exactly a CA signs; the answer is one line holding name, issuer and key, reduced to a single digest.',
    ],

    avoidWhen: [
      'The subject is how a browser decides to trust the CA\'s key in the first place. The verifier here already holds it.',
      'The article is about intermediate certificates or chain validation. There is a single certificate.',
      'The point is comparing forgery techniques or what happens when the digest collides. Only one tampering, a key swap, is shown.',
      'The article is about encrypting with the certified key. Nothing is encrypted here.',
    ],

    contrastWith: [
      {
        concept: 'certificate',
        note: 'Binding name and key under one digest defeats one forgery, the key swap. Forgery as a whole asks which other attacks remain open depending on whether the CA signs raw numbers or digests.',
      },
      {
        concept: 'trustAnchor',
        note: 'Binding assumes the verifier already holds a trustworthy issuer key. Why that key is trusted at all is the separate question of the root.',
      },
      {
        concept: 'hashIntegrityCheck',
        note: 'A bare hash detects change only if it travels by a safer route than the data. A signed digest can travel alongside the data, because nobody without the issuer\'s private key can produce a matching one.',
      },
      {
        concept: 'certificateChain',
        note: 'A chain repeats the issuer-signs-subject check up to a root. Binding is what one link of that chain guarantees: the key in the certificate is the one the issuer attached to that name.',
      },
    ],
  },
};
