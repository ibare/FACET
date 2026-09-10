/**
 * SignatureOnHash facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "왜 문서 전체가 아니라 그 해시에 서명하는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 출처는 디지털 서명이지만 해시를 재료로 쓴다 — 조각의 출처와 소속이 갈리는
 * 첫 사례다. 소속으로 치면 해시 글에도 서명 글에도 등장할 수 있다.
 *
 * 각주가 밝히는 전제: 작은 두 막대는 실제 비율이면 보이지 않아 최소 폭을 주었다.
 * 그리고 RSA 는 애초에 키보다 큰 것을 직접 서명할 수 없다 — 크기 문제는 비용만이
 * 아니라 가능 여부의 문제이기도 하다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const signatureOnHashFacet: FacetJson = {
  id: 'facet:signatureOnHash',
  title: {
    en: 'Signing the Digest',
    ko: '다이제스트 서명',
    ja: 'ダイジェストに署名する',
    zh: '对摘要签名',
    ar: 'التوقيع على البصمة',
    es: 'Firmar el resumen',
    fr: "Signer l'empreinte",
    hi: 'डाइजेस्ट पर हस्ताक्षर',
    id: 'Menandatangani ringkasan',
    pt: 'Assinar o resumo',
  },
  description: {
    en: 'A signature stays 64 bytes however large the document it stands for',
    ko: '문서가 아무리 커도 서명은 64바이트에 머문다',
    ja: '文書がどれほど大きくても署名は 64 バイトのままだ',
    zh: '不论文档多大，签名始终是 64 字节',
    ar: 'يبقى التوقيع 64 بايت مهما كبر المستند الذي يمثّله',
    es: 'La firma se queda en 64 bytes por grande que sea el documento',
    fr: 'La signature reste de 64 octets, quelle que soit la taille du document',
    hi: 'दस्तावेज़ कितना भी बड़ा हो, हस्ताक्षर 64 बाइट ही रहता है',
    id: 'Tanda tangan tetap 64 byte sebesar apa pun dokumennya',
    pt: 'A assinatura fica em 64 bytes por maior que seja o documento',
  },
  algorithm: 'module:signatureOnHash',
  projector: 'module:signatureOnHashProjector',
  initialData: {
    type: 'signature-on-hash',
    hashLabel: 'SHA-256',
    signatureLabel: 'Ed25519',
    documentBytes: 3700000,
    digestBytes: 32,
    signatureBytes: 64,
    // 접힘 운동(FOLD_MS)이 한 걸음 안에서 끝나야 한다.
    stepMs: 1100,
  },
  shuffleOnReset: false,
  messages: {
    'caption.document': {
      en: 'The document can be any size at all.',
      ko: '문서는 얼마든지 커질 수 있다.',
      ja: '文書はいくらでも大きくなり得る。',
      zh: '文档可以是任意大小。',
      ar: 'يمكن للمستند أن يبلغ أي حجم كان.',
      es: 'El documento puede tener cualquier tamaño.',
      fr: "Le document peut avoir n'importe quelle taille.",
      hi: 'दस्तावेज़ किसी भी आकार का हो सकता है।',
      id: 'Dokumennya bisa sebesar apa pun.',
      pt: 'O documento pode ter qualquer tamanho.',
    },
    'caption.hashed': {
      en: 'Hashing folds it into 32 bytes.',
      ko: '해시가 그것을 32바이트로 접는다.',
      ja: 'ハッシュがそれを 32 バイトに畳む。',
      zh: '哈希把它折成 32 字节。',
      ar: 'تطوي التجزئة ذلك في 32 بايت.',
      es: 'El hash lo pliega en 32 bytes.',
      fr: 'Le hachage le replie en 32 octets.',
      hi: 'हैशिंग उसे 32 बाइट में मोड़ देती है।',
      id: 'Hashing melipatnya menjadi 32 byte.',
      pt: 'O hash o dobra em 32 bytes.',
    },
    'caption.signed': {
      en: 'The private key signs those 32 bytes.',
      ko: '개인키는 그 32바이트에 서명한다.',
      ja: '秘密鍵はその 32 バイトに署名する。',
      zh: '私钥对这 32 字节签名。',
      ar: 'يوقّع المفتاح الخاص على تلك الـ32 بايت.',
      es: 'La clave privada firma esos 32 bytes.',
      fr: 'La clé privée signe ces 32 octets.',
      hi: 'निजी कुंजी उन्हीं 32 बाइट पर हस्ताक्षर करती है।',
      id: 'Kunci privat menandatangani 32 byte itu.',
      pt: 'A chave privada assina esses 32 bytes.',
    },
    'caption.compare': {
      en: 'The signature stays this size no matter how large the document grows.',
      ko: '문서가 아무리 커져도 서명은 이 크기에 머문다.',
      ja: '文書がどれほど大きくなっても署名はこの大きさのままだ。',
      zh: '不论文档变得多大，签名都保持这个大小。',
      ar: 'يبقى التوقيع بهذا الحجم مهما كبر المستند.',
      es: 'La firma mantiene este tamaño por mucho que crezca el documento.',
      fr: 'La signature garde cette taille, quelle que soit la croissance du document.',
      hi: 'दस्तावेज़ चाहे कितना भी बढ़े, हस्ताक्षर इसी आकार का रहता है।',
      id: 'Tanda tangan tetap sebesar ini sebesar apa pun dokumennya tumbuh.',
      pt: 'A assinatura mantém este tamanho por mais que o documento cresça.',
    },
    'label.document': {
      en: 'document',
      ko: '문서',
      ja: '文書',
      zh: '文档',
      ar: 'المستند',
      es: 'documento',
      fr: 'document',
      hi: 'दस्तावेज़',
      id: 'dokumen',
      pt: 'documento',
    },
    'label.digest': {
      en: 'digest',
      ko: '해시',
      ja: 'ダイジェスト',
      zh: '摘要',
      ar: 'البصمة',
      es: 'resumen',
      fr: 'empreinte',
      hi: 'डाइजेस्ट',
      id: 'ringkasan',
      pt: 'resumo',
    },
    'label.signature': {
      en: 'signature',
      ko: '서명',
      ja: '署名',
      zh: '签名',
      ar: 'التوقيع',
      es: 'firma',
      fr: 'signature',
      hi: 'हस्ताक्षर',
      id: 'tanda tangan',
      pt: 'assinatura',
    },
  },
  blocks: {
    stage: { type: 'sign-hash-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
