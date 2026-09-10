/**
 * @piece 제자리 정렬 — 가진 자리 안에서 끝내는가, 자리를 더 얻어 쓰는가.
 *
 * 답하는 질문 하나: **같은 값을 같은 순서로 만들면서 한쪽은 왜 자리를 빌리지
 * 않는가.** 견주고 옮기는 일은 두 방식이 똑같이 한다. 다른 것은 차지한 넓이뿐이고,
 * 그 차이가 알고리즘을 고르는 이유가 된다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 없다 — 넓이는 세는 것이 아니라 보이는 것이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const inPlaceVsExtraFacet: FacetJson = {
  id: 'facet:inPlaceVsExtra',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'In-Place Sorting',
    ko: '제자리 정렬',
    ja: 'その場での整列',
    zh: '原地排序',
    ar: 'الفرز في المكان',
    es: 'Ordenar en el sitio',
    fr: 'Tri en place',
    hi: 'यथास्थान सॉर्टिंग',
    id: 'Pengurutan di tempat',
    pt: 'Ordenação no lugar',
  },
  description: {
    en: 'Two sorts reach the same order; only one of them asks for more room.',
    ko: '두 정렬이 같은 순서에 닿는다. 자리를 더 달라는 쪽은 하나뿐이다.',
    ja: '二つの整列が同じ並びに届く。場所を余分に求めるのは片方だけだ。',
    zh: '两种排序到达同样的顺序，只有一种要额外的空间。',
    ar: 'فرزان يصلان إلى الترتيب نفسه، وواحد منهما فقط يطلب مساحة إضافية.',
    es: 'Dos ordenaciones llegan al mismo orden; solo una pide más espacio.',
    fr: 'Deux tris atteignent le même ordre ; un seul réclame de la place en plus.',
    hi: 'दो सॉर्ट एक ही क्रम तक पहुँचते हैं; जगह सिर्फ़ एक माँगता है।',
    id: 'Dua pengurutan mencapai urutan yang sama; hanya satu yang minta ruang tambahan.',
    pt: 'Duas ordenações chegam à mesma ordem; só uma pede mais espaço.',
  },
  algorithm: 'module:inPlaceVsExtra',
  projector: 'module:inPlaceVsExtraProjector',

  initialData: {
    type: 'in-place-vs-extra',
    // 값 넷을 두 벌 늘어놓고 나란히 정렬한다. 넷이면 빌린 넓이가 원본만큼
    // 자라는 것이 한 화면에 들어오고, 그보다 많으면 칸이 좁아진다.
    values: [8, 3, 5, 1],
    stepMs: 850,
  },

  blocks: {
    stage: { type: 'in-place-vs-extra-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.begin': {
      en: 'The same values, sorted two ways — one keeps to its own cells, the other copies them out.',
      ko: '같은 값을 두 방식으로 정렬한다 — 한쪽은 가진 칸 안에서, 다른 쪽은 새 자리에 옮겨 적으며.',
      ja: '同じ値を二通りに整列する — 一方は自分の枡の中だけで、もう一方は別の場所へ書き写しながら。',
      zh: '同样的值，两种排法 — 一种只在自己的格子里，另一种把它们抄到别处。',
      ar: 'القيم نفسها تُفرز بطريقتين — واحدة تبقى في خاناتها والأخرى تنسخها إلى مكان آخر.',
      es: 'Los mismos valores, ordenados de dos formas: una se queda en sus casillas y la otra los copia fuera.',
      fr: "Les mêmes valeurs, triées de deux façons — l'une reste dans ses cases, l'autre les recopie ailleurs.",
      hi: 'वही मान, दो तरीक़ों से सॉर्ट — एक अपने ही ख़ानों में रहता है, दूसरा उन्हें कहीं और नक़ल करता है।',
      id: 'Nilai yang sama, diurutkan dua cara — satu bertahan di selnya sendiri, satunya menyalinnya ke luar.',
      pt: 'Os mesmos valores, ordenados de dois jeitos — um fica nas próprias células, o outro os copia para fora.',
    },
    'caption.claim': {
      en: 'Each side takes the room it needs: one slot to hold a value, one cell to write the first result.',
      ko: '각자 필요한 자리를 얻는다 — 한쪽은 값을 잠깐 들고 있을 칸 하나, 다른 쪽은 첫 결과를 적을 칸 하나.',
      ja: '各自が必要な場所を取る — 片方は値を一時置く枡ひとつ、もう片方は最初の結果を書く枡ひとつ。',
      zh: '各自取用所需的空间：一边一个暂存位放值，一边一个格子写下第一个结果。',
      ar: 'يأخذ كل جانب ما يلزمه: خانة لحفظ قيمة، وخانة لكتابة أول نتيجة.',
      es: 'Cada lado toma el espacio que necesita: una ranura para guardar un valor y una casilla para escribir el primer resultado.',
      fr: "Chaque côté prend la place qu'il lui faut : une case pour retenir une valeur, une case pour écrire le premier résultat.",
      hi: 'हर पक्ष अपनी ज़रूरत की जगह लेता है: एक ख़ाना मान थामने के लिए, एक ख़ाना पहला नतीजा लिखने के लिए।',
      id: 'Tiap sisi mengambil ruang yang diperlukan: satu slot untuk menahan nilai, satu sel untuk menulis hasil pertama.',
      pt: 'Cada lado toma o espaço de que precisa: um espaço para segurar um valor, uma célula para escrever o primeiro resultado.',
    },
    'caption.reuseVsGrow': {
      en: 'The held slot is used again. Copying needs one more cell — {n} of them now.',
      ko: '들고 있던 자리는 그대로 다시 쓴다. 옮겨 적는 쪽은 칸이 또 하나 필요하다 — 이제 {n}칸.',
      ja: '一時置きの枡はそのまま使い回す。書き写すほうは枡がもうひとつ要る — いまは {n} 個。',
      zh: '暂存位可以反复使用。抄写的那边又要一个格子 — 现在共 {n} 个。',
      ar: 'الخانة المؤقّتة تُستعمل مرّة أخرى، أمّا النسخ فيحتاج خانة إضافية — صارت {n}.',
      es: 'La ranura reservada se reutiliza. Copiar necesita otra casilla: ya van {n}.',
      fr: 'La case retenue ressert. La copie réclame une case de plus — {n} maintenant.',
      hi: 'थामने वाला ख़ाना फिर से काम आता है। नक़ल करने वाले को एक और ख़ाना चाहिए — अब {n}।',
      id: 'Slot penahan itu dipakai lagi. Yang menyalin butuh satu sel lagi — kini {n}.',
      pt: 'O espaço reservado é reaproveitado. Copiar exige mais uma célula — {n} agora.',
    },
    'caption.done': {
      en: 'Same order, different room: {a} extra cell against {b} — one for every value.',
      ko: '순서는 같고 넓이는 다르다 — 한쪽은 {a}칸, 다른 쪽은 값의 수만큼 {b}칸.',
      ja: '並びは同じ、場所は違う — 片方は {a} 枡、もう片方は値の数だけ {b} 枡。',
      zh: '顺序相同，占地不同 — 一边 {a} 格，另一边跟值一样多的 {b} 格。',
      ar: 'الترتيب نفسه والمساحة مختلفة: خانة {a} إضافية مقابل {b} — واحدة لكل قيمة.',
      es: 'Mismo orden, distinto espacio: {a} casilla extra frente a {b}, una por cada valor.',
      fr: 'Même ordre, place différente : {a} case en plus contre {b} — une par valeur.',
      hi: 'क्रम वही, जगह अलग: एक तरफ़ {a} ख़ाना, दूसरी तरफ़ हर मान के लिए एक, यानी {b}।',
      id: 'Urutan sama, ruang berbeda: {a} sel tambahan berbanding {b} — satu untuk tiap nilai.',
      pt: 'Mesma ordem, espaço diferente: {a} célula extra contra {b} — uma para cada valor.',
    },

    'label.laneInPlace': {
      en: 'sorting in place',
      ko: '제자리에서 정렬',
      ja: 'その場で整列',
      zh: '原地排序',
      ar: 'الفرز في المكان',
      es: 'ordenar en el sitio',
      fr: 'tri en place',
      hi: 'यथास्थान सॉर्ट',
      id: 'urut di tempat',
      pt: 'ordenar no lugar',
    },
    'label.laneCopy': {
      en: 'copying into new space',
      ko: '새 자리에 옮겨 적기',
      ja: '新しい場所へ書き写す',
      zh: '抄写到新空间',
      ar: 'النسخ إلى مساحة جديدة',
      es: 'copiar a un espacio nuevo',
      fr: 'copie dans un nouvel espace',
      hi: 'नई जगह में नक़ल',
      id: 'menyalin ke ruang baru',
      pt: 'copiar para um espaço novo',
    },
    'label.extraCells': {
      en: '{n} extra',
      ko: '추가 {n}칸',
      ja: '追加 {n} 枡',
      zh: '额外 {n} 格',
      ar: '{n} إضافية',
      es: '{n} de más',
      fr: '{n} en plus',
      hi: '{n} अतिरिक्त',
      id: '{n} tambahan',
      pt: '{n} a mais',
    },
  },
};
