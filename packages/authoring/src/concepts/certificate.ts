/**
 * certificate 개념 선언.
 *
 * canonical facet 은 `facet:certificate` — CA 하나(`CN=Sample CA`, 3763, 11)가 장난감 RSA 로 인증서에 서명하고, 공격자는
 * `CN=mail.example` 에 제 열쇠(n 2701)를 묶은 인증서를 받는 쪽에 통과시키려 한다. 받는 쪽의 확인 줄은 신뢰 저장소 → 서명 확인
 * 두 자리. 손잡이 둘 — 서명 대상(문서 그대로 · 요약, 처음 요약) · 위조(곱하기 · 겹치는 짝 · 열쇠 바꿔 끼우기 · 가짜 뿌리,
 * 처음 겹치는 짝). 서명 대상을 돌리면 곱하기와 겹치는 짝의 멈춘 자리가 서로 자리를 바꾼다(통과 ↔ 서명 확인).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `bindsKeyToName` 은 이름과 열쇠가 한 요약에 묶여 열쇠만 바꾸면 어긋나는 한 장면, `trustAnchor` 는 제 서명은 누구나
 * 맞추니 뿌리를 가르는 것은 미리 들여놓은 저장소라는 한 장면이다. 이쪽은 그 둘을 위조 넷 가운데 둘로 품고, **무엇에 서명하느냐를
 * 돌리면 어느 위조가 통과하는가** 를 맡는다. 그래서 definition 은 raw · multiply · hash-then-sign · collision · forgery 쪽 낱말을
 * 쥐고, 조각들이 독점한 name and key together · self-signed · trust store beforehand 를 쓰지 않는다.
 *
 * 전제 (설명 글 `certificate.md` 가 밝힌 것 — 화면은 각주를 달지 않는다):
 *  - 장난감 RSA(두 자리 소수) · 요약 = 장난감 16 비트 해시 H 를 CA 의 n 으로 줄인 것이라 폭이 3763 자리뿐 — 짝이 16 장 만에 난다.
 *  - 문서 번호 규칙 `10 × e + 이름 자리` 는 이 판이 지은 것. 실물은 문서 그대로 서명하지 않는다 — 왜 안 쓰는지 보이려고 둔 판.
 *  - 요약 쪽 곱하기는 "같은 A · B 로는" 막힌다까지만 참이다. 요약에 서명하면 안전하다고 쓰지 않는다 — 요약 × 겹치는 짝이 통과한다.
 *  - 유효 기간 · 폐기 · 사슬 오르기는 보지 않는다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const certificateConcept: FacetConceptSource = {
  id: 'certificate',
  label: 'Certificate Forgery: What the CA Signs Decides Which Attack Works',
  canonicalFacet: 'facet:certificate',

  surface: {
    definition:
      'Which certificate forgery succeeds depends on what the CA signs: raw RSA signatures multiply into a valid new one, while hash-then-sign closes that hole but falls to a digest collision.',
    exemplarKeywords: [
      'certificate forgery',
      'forged certificate',
      'textbook RSA signature malleability',
      'multiplicative property of RSA signatures',
      'hash-then-sign',
      'why sign a hash instead of the message',
      'MD5 collision rogue CA certificate 2008',
      'signature security depends on collision resistance',
      'certificate authority',
      'X.509',
      'rogue CA',
      'PKI attack',
    ],
  },

  briefing: {
    observable: [
      'Left: who signs (the CA `CN=Sample CA`, key n 3763 · e 11, with d 331 shown on its side) and who asks (Owner `CN=mail.example` (2419, 3), Attacker `CN=mallory.example` n 2701). Middle: the certificate sent to the CA and the Target `CN=mail.example` carrying the attacker\'s key. Right: the Receiver\'s check line, Trust store on top, then Signature check, then Accepted.',
      'Each round is six steps counting the opening (five for Fake root): start · prepare · sign · forge · trust store · signature check. In the prepare step the attacker\'s candidates are counted and a "Forger tries" bar fills; in the sign step a signature token crosses from the signer to a certificate; in the forge step that signature moves onto the target, or two signatures meet and multiply.',
      'The forged certificate travels down the check line and stops at the place it fails, marked "Stopped here", or reaches the end, "Made it through". Captions give the arithmetic, e.g. "Signature check: 1109^11 mod 3763 = 63 = signed value 63, accepted".',
      'Default round (Digest × Colliding pair): after 16 certificates, `CN=mallory.example` with e 23 and `CN=mail.example` with e 25 both give digest 63. The CA signs the harmless one, 63^331 mod 3763 = 1109, the signature is moved onto (`CN=mail.example`, 2701, 25), the trust store sees (3763, 11) = (3763, 11), and the signature check passes. The forged certificate\'s e is 25, not 5.',
      'Raw document × Multiply: after 27 tries the attacker gets the CA to sign its own certificates numbered 831 and 1191; their signatures multiply to 741, and 741^11 mod 3763 = 52, the target\'s number — accepted. With Digest the same two certificates give digests 389 and 1751, whose product 36 is not the target digest 2636, so it stops at the signature check.',
      'Raw document × Colliding pair: all 248 certificates have different numbers, no pair exists, and the forgery stops at the signature check. Key swap stops at the signature check under both settings (digest 258 vs 2636, number 32 vs 52). Fake root — a self-made `CN=Sample CA` with key (4661, 7) that signs the target directly — stops at the trust store under both settings.',
      'Three readouts: Forger tries (27 · 248 or 16 · 0), CA signatures (Multiply 2 · Colliding pair 1 · Key swap 1 · Fake root 0, the fake root\'s signature not counted) and Accepted (1 or 0).',
      'Everything is toy-sized: RSA with two-digit primes, and a digest that is a 16-bit toy hash reduced mod 3763, which is why a collision turns up so fast. The "raw document" is the certificate written as a number `10 × e + name digit` so it fits under n; real certificates are far larger than the key and are never signed raw. Validity dates, revocation and chain climbing are not checked. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two segmented handles: "Signed value" (Raw document · Digest, starting at Digest) and "Forgery" (Multiply · Colliding pair · Key swap · Fake root, starting at Colliding pair). Each round plays to its stop and waits for a handle.',
        'The move that makes the idea land is flipping "Signed value" while Forgery sits on Multiply or Colliding pair: the two forgeries trade places between "Made it through" and stopping at the signature check. Stepping through Forgery instead moves the stop mark between the trust store, the signature check and the end.',
        'The code panel, labelled "Receiver check", starts empty with a "+ Add language" button; the chosen language (Python, JavaScript, TypeScript, Java, C++ or C#) shows the receiver\'s check (`receive`) and the `sign` and `forge` arithmetic, with the line of the current step lit. The 16-bit hash value arrives as an argument, and the attacker\'s search is not in the code, so no line lights during the prepare step.',
      ],
    },

    useWhen: [
      'The article explains why RSA signatures are applied to a hash rather than to the message, and wants the attack that raw signing allows set against the attack that hashing then invites.',
      'A reader thinks "hash-then-sign" makes a signature unconditionally safe; the round where a digest collision gets a forged certificate accepted shows the safety has moved onto the hash.',
      'The article surveys ways to get a certificate for a name you do not own and needs each one stopped, or not, at a named point of verification.',
    ],

    avoidWhen: [
      'The subject is walking a chain from leaf through intermediate to root. There is one CA here and no chain.',
      'The article is about certificate expiry, revocation, OCSP or host-name mismatch. None of these are checked.',
      'The point is how a real hash function such as SHA-256 resists collisions. The digest here is deliberately tiny so a collision is found in 16 tries.',
      'The article presents padding schemes such as PSS or PKCS#1 v1.5 as the fix for RSA malleability. Only raw numbers and reduced digests are signed here.',
    ],

    contrastWith: [
      {
        concept: 'bindsKeyToName',
        note: 'That a name and a key share one signed digest is why swapping the key fails. Forgery in general asks what else an attacker can try once that route is closed, and finds routes that depend on what exactly gets signed.',
      },
      {
        concept: 'trustAnchor',
        note: 'Trusting a root because its key was installed in advance settles where verification starts. Among forgeries, that same rule is what stops a self-made issuer whose own arithmetic is correct.',
      },
      {
        concept: 'signatureOnHash',
        note: 'Signing a digest is usually justified by size and cost. Forgery adds a security reason and its price: hashing removes the multiplicative attack, and the signature is then only as strong as the hash is against collisions.',
      },
      {
        concept: 'certificateChain',
        note: 'Chain validation is about how far up a verifier must climb before it can stop. Forgery holds the issuer fixed and asks whether a certificate that issuer never meant to sign can pass the check at all.',
      },
      {
        concept: 'collision',
        note: 'A hash collision is a property of the function alone. In certificate forgery it becomes an attack: the collision lets a signature issued for a harmless certificate be carried over to a harmful one.',
      },
    ],
  },
};
