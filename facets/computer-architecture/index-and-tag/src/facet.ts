/**
 * 인덱스와 태그 조각.
 *
 * @piece 주소를 쪼개 들어갈 자리를 정한다 — 주소 하나가 세 토막으로 끊기고,
 * 가운데 토막이 들어갈 줄을 가리키고, 윗 토막은 그 줄에 남아 누구의 것인지를
 * 증언하고, 아랫 토막은 줄 안에서 몇 번째 바이트인지를 말한다.
 *
 * 1차 데이터는 캐시 크기 · 라인 크기 · 주소 다섯뿐이다. 토막의 비트 폭 · 각
 * 토막의 값 · 비트열은 algorithm 이 그 자리에서 셈하고, 자리와 크기는 stage 가
 * 캔버스에서 역산한다 — 화면에 뜰 값을 선언에 적어 두면 데이터를 바꿀 때
 * 둘이 어긋난다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const indexAndTagFacet: FacetJson = {
  id: 'facet:indexAndTag',
  title: {
    en: 'Index and Tag',
    ko: '인덱스와 태그',
    ja: 'インデックスとタグ',
    zh: '索引与标记',
    ar: 'الفهرس والوسم',
    es: 'Índice y etiqueta',
    fr: 'Index et étiquette',
    hi: 'इंडेक्स और टैग',
    id: 'Index dan Tag',
    pt: 'Índice e etiqueta',
  },
  description: {
    en: 'An address is cut into three: the index picks the line, the tag stays in it to say whose it is, the offset points at the byte inside the line.',
    ko: '주소를 셋으로 쪼갠다 — 인덱스는 줄을 고르고, 태그는 그 줄에 남아 누구의 것인지 증언하고, 오프셋은 줄 안의 바이트를 가리킨다.',
    ja: 'アドレスを三つに切る。インデックスが行を選び、タグはその行に残って誰のものかを示し、オフセットは行の中のバイトを指す。',
    zh: '把地址切成三段：索引挑选行，标记留在行里证明它属于谁，偏移指出行内的第几个字节。',
    ar: 'يُقسَّم العنوان إلى ثلاثة: الفهرس يختار السطر، والوسم يبقى فيه ليشهد لمن هو، والإزاحة تشير إلى البايت داخل السطر.',
    es: 'La dirección se parte en tres: el índice elige la línea, la etiqueta se queda en ella para decir de quién es, y el desplazamiento señala el byte dentro de la línea.',
    fr: "L'adresse est coupée en trois : l'index choisit la ligne, l'étiquette y reste pour dire à qui elle appartient, le décalage désigne l'octet dans la ligne.",
    hi: 'पता तीन हिस्सों में कटता है — इंडेक्स लाइन चुनता है, टैग उसी लाइन में रहकर बताता है कि वह किसका है, और ऑफ़सेट लाइन के भीतर बाइट दिखाता है।',
    id: 'Alamat dipotong menjadi tiga: index memilih baris, tag tinggal di baris itu untuk menyatakan milik siapa, dan offset menunjuk byte di dalam baris.',
    pt: 'O endereço é cortado em três: o índice escolhe a linha, a etiqueta fica nela para dizer de quem é, e o deslocamento aponta o byte dentro da linha.',
  },
  algorithm: 'module:indexAndTag',
  projector: 'module:indexAndTagProjector',
  initialData: {
    type: 'index-and-tag',
    /** 캐시 64바이트 · 라인 16바이트 · 직접 사상 — 그러니 줄이 넷이다. */
    cacheSize: 64,
    lineSize: 16,
    /**
     * 주소 공간을 10비트로 본다 (1024바이트). 라인 16바이트가 오프셋 4비트를,
     * 줄 넷이 인덱스 2비트를 가져가고 남는 4비트가 태그다.
     */
    addrBits: 10,
    /**
     * 0 과 64 는 인덱스가 같고 태그가 다르다 — 같은 줄을 노리는 서로 다른 곳이다.
     * 0 과 20 은 인덱스가 달라 서로 다른 줄에 앉는다. 132 가 줄 0 을 다시 노린다.
     */
    addresses: [0, 20, 64, 100, 132],
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'index-and-tag-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.arrives': {
      en: 'One address arrives: {addr}.',
      ko: '주소 하나가 들어온다: {addr}.',
      ja: 'アドレスが一つ来る: {addr}。',
      zh: '来了一个地址：{addr}。',
      ar: 'يصل عنوان واحد: {addr}.',
      es: 'Llega una dirección: {addr}.',
      fr: 'Une adresse arrive : {addr}.',
      hi: 'एक पता आता है: {addr}।',
      id: 'Satu alamat datang: {addr}.',
      pt: 'Chega um endereço: {addr}.',
    },
    'caption.splits': {
      en: 'It breaks into three — tag, index, offset.',
      ko: '주소가 세 토막으로 끊긴다 — tag · index · offset.',
      ja: 'アドレスが三つに切れる — tag・index・offset。',
      zh: '地址断成三段——tag、index、offset。',
      ar: 'ينقسم العنوان إلى ثلاثة أجزاء — tag و index و offset.',
      es: 'Se parte en tres: tag, index, offset.',
      fr: "L'adresse se coupe en trois : tag, index, offset.",
      hi: 'पता तीन टुकड़ों में कटता है — tag, index, offset।',
      id: 'Alamat terpotong menjadi tiga: tag, index, offset.',
      pt: 'O endereço se parte em três: tag, index, offset.',
    },
    'caption.dispatch': {
      en: 'The index picks line {line}, the tag stays in it, the offset points at byte {offset}.',
      ko: '인덱스가 고른 줄은 {line}, 그 줄에 남는 것은 태그, 오프셋이 가리키는 바이트는 {offset}.',
      ja: 'インデックスが選ぶ行は {line}、その行に残るのはタグ、オフセットが指すバイトは {offset}。',
      zh: '索引挑中的行是 {line}，留在行里的是标记，偏移指向的字节是 {offset}。',
      ar: 'السطر الذي اختاره الفهرس: {line}، ويبقى الوسم فيه، والبايت الذي تشير إليه الإزاحة: {offset}.',
      es: 'La línea que elige el índice: {line}; la etiqueta se queda en ella; el byte que señala el desplazamiento: {offset}.',
      fr: "La ligne choisie par l'index : {line} ; l'étiquette y reste ; l'octet désigné par le décalage : {offset}.",
      hi: 'इंडेक्स ने चुनी लाइन: {line}, टैग उसी में रहता है, ऑफ़सेट जिस बाइट को दिखाता है: {offset}।',
      id: 'Baris yang dipilih index: {line}, tag tinggal di sana, byte yang ditunjuk offset: {offset}.',
      pt: 'A linha escolhida pelo índice: {line}; a etiqueta fica nela; o byte apontado pelo deslocamento: {offset}.',
    },
    'caption.evicted': {
      en: 'That line was holding tag {old}; tag {tag} takes its place — same line, different place.',
      ko: '그 줄이 들고 있던 태그는 {old}, 새로 앉는 태그는 {tag}. 줄은 같아도 다른 곳이다.',
      ja: 'その行が持っていたタグは {old}、新たに座るタグは {tag}。行は同じでも別の場所だ。',
      zh: '这一行原本存着的标记是 {old}，新坐进来的标记是 {tag}。行相同，地方却不同。',
      ar: 'الوسم الذي كان في ذلك السطر: {old}، والوسم الذي يجلس مكانه: {tag}. السطر نفسه لكن المكان مختلف.',
      es: 'La etiqueta que guardaba esa línea: {old}; la que ocupa su lugar: {tag}. Misma línea, otro lugar.',
      fr: "L'étiquette que gardait cette ligne : {old} ; celle qui prend sa place : {tag}. Même ligne, autre endroit.",
      hi: 'उस लाइन में पहले से रखा टैग: {old}, अब बैठने वाला टैग: {tag}। लाइन वही, जगह दूसरी।',
      id: 'Tag yang tadi disimpan baris itu: {old}, tag yang kini menempatinya: {tag}. Barisnya sama, tempatnya beda.',
      pt: 'A etiqueta que a linha guardava: {old}; a que ocupa o lugar: {tag}. Mesma linha, outro lugar.',
    },
    'caption.done': {
      en: 'Different places can share one line. The tag is what tells them apart.',
      ko: '서로 다른 곳이 한 줄을 함께 쓴다. 가르는 것은 태그다.',
      ja: '別の場所が一つの行を分け合う。分けるのはタグだ。',
      zh: '不同的地方可以共用一行。把它们分开的是标记。',
      ar: 'أماكن مختلفة قد تتشارك سطرًا واحدًا، والوسم هو ما يميّزها.',
      es: 'Lugares distintos pueden compartir una línea. La etiqueta es lo que los distingue.',
      fr: "Des endroits différents peuvent partager une ligne. C'est l'étiquette qui les distingue.",
      hi: 'अलग-अलग जगहें एक ही लाइन साझा कर सकती हैं। उन्हें अलग करता है टैग।',
      id: 'Tempat yang berbeda bisa berbagi satu baris. Yang membedakannya adalah tag.',
      pt: 'Lugares diferentes podem dividir uma linha. A etiqueta é o que os distingue.',
    },
    'label.address': {
      en: 'address {addr}',
      ko: '주소 {addr}',
      ja: 'アドレス {addr}',
      zh: '地址 {addr}',
      ar: 'العنوان {addr}',
      es: 'dirección {addr}',
      fr: 'adresse {addr}',
      hi: 'पता {addr}',
      id: 'alamat {addr}',
      pt: 'endereço {addr}',
    },
  },
};
