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
 * 화면을 명령이 아니라 **장면**으로 만든다 (`scene:`) — 어느 걸음의 화면이든 셈으로
 * 얻으므로 띠로 임의의 자리에 갈 수 있다 (S-scene).
 *
 * 전제는 글이 밝힌다 (S-piece: 화면에 각주를 두지 않는다). `description.ts` 가 둘을
 * 적는다 — 가장 작은 마디는 실제 비율이면 보이지 않아 최소 폭으로 띄웠다는 것, 그리고
 * RSA 는 애초에 키보다 큰 것을 직접 서명할 수 없어 크기 문제가 비용만이 아니라 가능
 * 여부의 문제이기도 하다는 것.
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
  scene: 'module:signatureOnHashScene',
  initialData: {
    type: 'signature-on-hash',
    hashLabel: 'SHA-256',
    signatureLabel: 'Ed25519',
    documentBytes: 3700000,
    digestBytes: 32,
    signatureBytes: 64,
    // 걸음 사이의 쉼. 접힘 운동은 그 위에 더해진다 — `render` 의 약속이 장면이 다
    // 선 뒤에 풀리므로 다음 걸음이 운동을 앞지르지 않는다 (S-piece 의 걸음 벽시계).
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
    // 바이트 수를 글자로 못박지 않는다 — 자료가 바뀌면 캡션이 조용히 거짓이 된다.
    // 장면이 `digestBytes` 에서 실어 준다 (함정 33).
    'caption.hashed': {
      en: 'Hashing folds it into {bytes} bytes.',
      ko: '해시가 그것을 {bytes}바이트로 접는다.',
      ja: 'ハッシュがそれを {bytes} バイトに畳む。',
      zh: '哈希把它折成 {bytes} 字节。',
      ar: 'تطوي التجزئة ذلك في {bytes} بايت.',
      es: 'El hash lo pliega en {bytes} bytes.',
      fr: 'Le hachage le replie en {bytes} octets.',
      hi: 'हैशिंग उसे {bytes} बाइट में मोड़ देती है।',
      id: 'Hashing melipatnya menjadi {bytes} byte.',
      pt: 'O hash o dobra em {bytes} bytes.',
    },
    'caption.signed': {
      en: 'The private key signs those {bytes} bytes.',
      ko: '개인키는 그 {bytes}바이트에 서명한다.',
      ja: '秘密鍵はその {bytes} バイトに署名する。',
      zh: '私钥对这 {bytes} 字节签名。',
      ar: 'يوقّع المفتاح الخاص على تلك الـ{bytes} بايت.',
      es: 'La clave privada firma esos {bytes} bytes.',
      fr: 'La clé privée signe ces {bytes} octets.',
      hi: 'निजी कुंजी उन्हीं {bytes} बाइट पर हस्ताक्षर करती है।',
      id: 'Kunci privat menandatangani {bytes} byte itu.',
      pt: 'A chave privada assina esses {bytes} bytes.',
    },
    // 조각의 결론이라 수를 글자로 적어 두지 않는다. 막대의 폭을 정하는 바로 그
    // 바이트 수에서 장면이 센다 (`scene.ts` 의 `timesLargerOf`, 함정 34).
    'caption.compare': {
      en: 'The signature stays {bytes} bytes while the document beside it is {times} times larger.',
      ko: '옆의 문서가 {times}배 큰데도 서명은 {bytes}바이트에 머문다.',
      ja: '隣の文書が {times} 倍大きくても署名は {bytes} バイトのままだ。',
      zh: '旁边的文档大 {times} 倍，签名仍是 {bytes} 字节。',
      ar: 'يبقى التوقيع {bytes} بايت بينما المستند المجاور أكبر بـ{times} مرة.',
      es: 'La firma se queda en {bytes} bytes aunque el documento a su lado sea {times} veces mayor.',
      fr: 'La signature reste de {bytes} octets alors que le document à côté est {times} fois plus grand.',
      hi: 'बगल का दस्तावेज़ {times} गुना बड़ा है, फिर भी हस्ताक्षर {bytes} बाइट ही रहता है।',
      id: 'Tanda tangan tetap {bytes} byte padahal dokumen di sebelahnya {times} kali lebih besar.',
      pt: 'A assinatura fica em {bytes} bytes embora o documento ao lado seja {times} vezes maior.',
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
      // 장면 방식이라 띠(timeline)를 단다 — 어느 걸음의 화면이든 계산으로 얻으므로
      // 임의의 자리로 끌 수 있다 (S-piece 의 조작 표).
      controls: CONTROL_SET.pieceScrub,
    },
  },
};
