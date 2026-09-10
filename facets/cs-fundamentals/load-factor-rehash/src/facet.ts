/**
 * 적재율과 재해싱 — 조각(piece) facet 선언.
 *
 * @piece 한 질문에만 답한다 — **판을 넓히면 담긴 것들의 자리는 어떻게 되는가.**
 * 헤더도 메트릭도 두지 않고, 레이아웃은 러너에게 맡긴다 (S-piece).
 *
 * initialData 의 수는 전부 실측값이다. `hashCode` 는 Java `String.hashCode()`
 * 이고 `masked` 는 `hashCode & 0x7FFFFFFF`, 자리는 `masked % 버킷수` 다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';
import type { LoadFactorRehashData } from './algorithm.js';

const loadFactorRehashData: LoadFactorRehashData = {
  type: 'load-factor-rehash',
  buckets: 8,
  grownBuckets: 16,
  threshold: 0.75,
  incoming: 'date',
  stepMs: 740,
  keys: [
    { key: 'kiwi', hashCode: 3292336, masked: 3292336, slotSmall: 0, slotLarge: 0 },
    { key: 'cherry', hashCode: -1361513063, masked: 785970585, slotSmall: 1, slotLarge: 9 },
    { key: 'apple', hashCode: 93029210, masked: 93029210, slotSmall: 2, slotLarge: 10 },
    { key: 'fig', hashCode: 101380, masked: 101380, slotSmall: 4, slotLarge: 4 },
    { key: 'banana', hashCode: -1396355227, masked: 751128421, slotSmall: 5, slotLarge: 5 },
    { key: 'date', hashCode: 3076014, masked: 3076014, slotSmall: 6, slotLarge: 14 },
  ],
};

export const loadFactorRehashFacet: FacetJson = {
  id: 'facet:loadFactorRehash',
  title: {
    en: 'Load factor and rehashing',
    ko: '적재율과 재해싱',
    ja: '負荷率と再ハッシュ',
    zh: '装载因子与重新散列',
    ar: 'معامل التحميل وإعادة التجزئة',
    es: 'Factor de carga y rehashing',
    fr: 'Facteur de charge et réhachage',
    hi: 'लोड फ़ैक्टर और रीहैशिंग',
    id: 'Faktor muat dan rehash',
    pt: 'Fator de carga e re-hashing',
  },
  description: {
    en: 'When the table gets too full it grows, and every key is placed again from scratch.',
    ko: '너무 차면 판을 넓혀 다시 뿌린다.',
    ja: '詰まりすぎたら表を広げ、すべての鍵を一から置き直す。',
    zh: '表太满就扩容，每个键都从头重新安放。',
    ar: 'حين يمتلئ الجدول أكثر من اللازم يتوسّع، وتُوضع كل المفاتيح من جديد.',
    es: 'Cuando la tabla se llena demasiado, crece y cada clave se coloca de nuevo desde cero.',
    fr: 'Quand la table est trop pleine, elle grandit et chaque clé est replacée à zéro.',
    hi: 'तालिका बहुत भर जाए तो वह बढ़ती है, और हर कुंजी नए सिरे से रखी जाती है।',
    id: 'Saat tabel terlalu penuh ia diperbesar, dan setiap kunci ditempatkan ulang dari awal.',
    pt: 'Quando a tabela fica cheia demais ela cresce, e cada chave é colocada outra vez do zero.',
  },
  algorithm: 'module:loadFactorRehash',
  projector: 'module:loadFactorRehashProjector',
  initialData: loadFactorRehashData,
  blocks: {
    stage: { type: 'load-factor-rehash-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.loadFactor': {
      en: 'load factor',
      ko: '적재율',
      ja: '負荷率',
      zh: '装载因子',
      ar: 'معامل التحميل',
      es: 'factor de carga',
      fr: 'facteur de charge',
      hi: 'लोड फ़ैक्टर',
      id: 'faktor muat',
      pt: 'fator de carga',
    },
    'caption.threshold': {
      en: 'One more key fills {count} of {buckets} buckets — the load factor reaches the {threshold} threshold.',
      ko: '하나가 더 들어오자 {buckets} 칸 중 {count} 이 찼다. 적재율이 임계 {threshold} 에 닿는다.',
      ja: 'もう一つ入って {buckets} 個中 {count} が埋まった — 負荷率が閾値 {threshold} に届く。',
      zh: '再进来一个，{buckets} 个桶里占了 {count} — 装载因子触到阈值 {threshold}。',
      ar: 'مفتاح آخر يملأ {count} من {buckets} سلة — فيبلغ معامل التحميل العتبة {threshold}.',
      es: 'Una clave más llena {count} de {buckets} cubetas: el factor de carga alcanza el umbral {threshold}.',
      fr: 'Une clé de plus remplit {count} des {buckets} alvéoles — le facteur de charge atteint le seuil {threshold}.',
      hi: 'एक कुंजी और आते ही {buckets} में से {count} भर गए — लोड फ़ैक्टर {threshold} की सीमा छू लेता है।',
      id: 'Satu kunci lagi mengisi {count} dari {buckets} keranjang — faktor muat menyentuh ambang {threshold}.',
      pt: 'Mais uma chave enche {count} de {buckets} baldes — o fator de carga atinge o limiar {threshold}.',
    },
    'caption.grow': {
      en: 'The table doubles, so the same {count} keys now fill far less of it.',
      ko: '판을 두 배로 넓힌다. 같은 {count} 인데 차지하는 몫이 확 줄었다.',
      ja: '表を倍に広げる。同じ {count} なのに占める割合がぐっと減った。',
      zh: '表扩大一倍，同样的 {count} 占的份额一下子小了很多。',
      ar: 'يتضاعف الجدول، فالمفاتيح {count} نفسها تشغل منه أقل بكثير.',
      es: 'La tabla se duplica, así que las mismas {count} claves ocupan mucho menos.',
      fr: 'La table double, si bien que les mêmes {count} clés en occupent bien moins.',
      hi: 'तालिका दुगनी हो जाती है, तो वही {count} कुंजियाँ अब कहीं कम जगह घेरती हैं।',
      id: 'Tabel digandakan, sehingga {count} kunci yang sama kini mengisi jauh lebih sedikit.',
      pt: 'A tabela duplica, e as mesmas {count} chaves passam a ocupar muito menos.',
    },
    'caption.recompute': {
      en: 'Nothing is carried over. Every key is divided again by the new bucket count.',
      ko: '옛 자리를 그대로 옮기지 않는다. 새 버킷 수로 전부 다시 나눈다.',
      ja: '前の位置をそのまま移しはしない。すべての鍵を新しいバケット数で割り直す。',
      zh: '旧位置不照搬。每个键都用新的桶数重新取余。',
      ar: 'لا شيء يُنقل كما هو. كل مفتاح يُقسّم من جديد على عدد السلال الجديد.',
      es: 'No se arrastra nada. Cada clave se divide otra vez entre el nuevo número de cubetas.',
      fr: "Rien n'est repris tel quel. Chaque clé est redivisée par le nouveau nombre d'alvéoles.",
      hi: 'पुरानी जगह ज्यों की त्यों नहीं ले जाई जाती। हर कुंजी को नई बकेट संख्या से फिर से बाँटा जाता है।',
      id: 'Tak ada yang dibawa apa adanya. Setiap kunci dibagi ulang dengan jumlah keranjang yang baru.',
      pt: 'Nada é transportado tal como está. Cada chave é dividida de novo pelo novo número de baldes.',
    },
    'caption.result': {
      en: '{moved} keys landed somewhere else. {stayed} happened to stay.',
      ko: '{moved} 은 자리가 바뀌었고, {stayed} 은 우연히 그대로 남았다.',
      ja: '{moved} は別の場所に移り、{stayed} はたまたまそのままだった。',
      zh: '{moved} 落到了别处，{stayed} 恰好留在原位。',
      ar: '{moved} حطّت في مواضع أخرى، و{stayed} بقيت مصادفةً في مكانها.',
      es: '{moved} cayeron en otro sitio. {stayed} se quedaron por casualidad.',
      fr: '{moved} ont atterri ailleurs. {stayed} sont restées par hasard.',
      hi: '{moved} कहीं और जा गिरीं। {stayed} संयोग से वहीं रह गईं।',
      id: '{moved} mendarat di tempat lain. {stayed} kebetulan tetap di tempatnya.',
      pt: '{moved} foram parar noutro sítio. {stayed} ficaram por acaso.',
    },
  },
};
