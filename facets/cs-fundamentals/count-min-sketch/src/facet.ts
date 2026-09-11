/**
 * countMinSketch — 적은 자리로 "몇 번 봤는가" 를 센다.
 *
 * 손잡이 둘이 서로 다른 것을 만지는 완제품이다. 폭은 충돌 자체를 줄이고 깊이는
 * 운 나쁜 줄을 피할 기회를 늘린다. 같은 칸 수를 어느 쪽에 쓸지가 조작으로 물어진다.
 *
 * `initialData` 에는 **1차 데이터만** 둔다 — 키와 빈도와 판의 처음 모양. 자리도
 * 표의 값도 읽히는 값도 오차도 algorithm 이 직접 셈한다. 여기 적어 두면 데이터를
 * 고칠 때 화면이 조용히 거짓을 말하게 된다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const countMinSketchFacet: FacetJson = {
  id: 'facet:countMinSketch',

  title: {
    en: 'Count-Min Sketch',
    ko: 'Count-Min Sketch',
    ja: 'Count-Min Sketch',
    zh: 'Count-Min Sketch',
    ar: 'Count-Min Sketch',
    es: 'Count-Min Sketch',
    fr: 'Count-Min Sketch',
    hi: 'Count-Min Sketch',
    id: 'Count-Min Sketch',
    pt: 'Count-Min Sketch',
  },

  description: {
    en: 'Counting how often each key was seen, in far fewer cells than there are keys — width cuts how often keys collide, depth cuts how much a collision costs.',
    ko: '키 수보다 훨씬 적은 칸으로 "몇 번 봤는가" 를 센다. 폭은 부딪치는 빈도를 줄이고, 깊이는 부딪쳤을 때 치르는 값을 줄인다.',
    ja: 'キーの数よりずっと少ないセルで「何回見たか」を数える。幅は衝突の頻度を減らし、深さは衝突したときの代償を減らす。',
    zh: '用远少于键数的格子数出"看过几次"。宽度降低碰撞的频率，深度降低碰撞的代价。',
    ar: 'عدّ كم مرة شوهد كل مفتاح بخلايا أقل بكثير من عدد المفاتيح — العرض يقلّل تكرار التصادم، والعمق يقلّل كلفته.',
    es: 'Contar cuántas veces se vio cada clave con muchas menos celdas que claves: el ancho reduce la frecuencia de las colisiones y la profundidad reduce su coste.',
    fr: "Compter combien de fois chaque clé a été vue avec bien moins de cases que de clés : la largeur réduit la fréquence des collisions, la profondeur en réduit le coût.",
    hi: 'कुंजियों की संख्या से कहीं कम खानों में गिनना कि हर कुंजी कितनी बार दिखी — चौड़ाई टकराव की आवृत्ति घटाती है, गहराई उसकी कीमत।',
    id: 'Menghitung berapa kali tiap kunci terlihat dengan sel yang jauh lebih sedikit daripada jumlah kunci — lebar menekan seringnya tabrakan, kedalaman menekan biayanya.',
    pt: 'Contar quantas vezes cada chave foi vista com muito menos células do que chaves — a largura reduz a frequência das colisões, a profundidade reduz o seu custo.',
  },

  algorithm: 'module:countMinSketch',
  projector: 'module:countMinSketchProjector',

  initialData: {
    type: 'count-min-sketch',
    /** 세는 차례. 같은 키는 몰아서 한 걸음에 올린다. */
    keys: [
      'apple',
      'fig',
      'kiwi',
      'mango',
      'elder',
      'cherry',
      'banana',
      'date',
      'grape',
      'lemon',
      'melon',
      'peach',
    ],
    /** 빈도 = 참값. `max(1, 20 - 2i)` 로 기울여 두었다. 합은 112. */
    counts: [20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 1],
    /** 손잡이의 처음 자리. 되돌리면 control-bar 가 슬라이더도 이 값으로 돌린다. */
    width: 12,
    depth: 3,
    /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 저작 결정이다. */
    stepMs: 170,
  },

  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },

  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'count-min-sketch-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'width',
          name: 'width',
          label: {
            en: 'Width w',
            ko: '폭 w',
            ja: '幅 w',
            zh: '宽度 w',
            ar: 'العرض w',
            es: 'Ancho w',
            fr: 'Largeur w',
            hi: 'चौड़ाई w',
            id: 'Lebar w',
            pt: 'Largura w',
          },
          segments: [
            { value: 4, label: '4' },
            { value: 6, label: '6' },
            { value: 8, label: '8' },
            { value: 12, label: '12', default: true },
            { value: 16, label: '16' },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'depth',
          name: 'depth',
          label: {
            en: 'Depth d',
            ko: '깊이 d',
            ja: '深さ d',
            zh: '深度 d',
            ar: 'العمق d',
            es: 'Prof. d',
            fr: 'Profondeur d',
            hi: 'गहराई d',
            id: 'Kedalaman d',
            pt: 'Profundidade d',
          },
          segments: [
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3', default: true },
            { value: 4, label: '4' },
          ],
        },
      ],
      metrics: [
        {
          name: 'cell-count',
          label: {
            en: 'Cells',
            ko: '칸',
            ja: 'セル',
            zh: '格子',
            ar: 'الخلايا',
            es: 'Celdas',
            fr: 'Cases',
            hi: 'खाने',
            id: 'Sel',
            pt: 'Células',
          },
          initial: 0,
        },
        {
          name: 'bump-count',
          label: {
            en: 'Bumps',
            ko: '올린 횟수',
            ja: '加算回数',
            zh: '累加次数',
            ar: 'الزيادات',
            es: 'Subidas',
            fr: 'Hausses',
            hi: 'वृद्धियाँ',
            id: 'Kenaikan',
            pt: 'Subidas',
          },
          initial: 0,
        },
        {
          name: 'error-sum',
          label: {
            en: 'Overshoot',
            ko: '부푼 양',
            ja: '膨らみ',
            zh: '膨胀量',
            ar: 'التضخّم',
            es: 'Exceso',
            fr: 'Excès',
            hi: 'अधिकता',
            id: 'Kelebihan',
            pt: 'Excesso',
          },
          initial: 0,
        },
        {
          name: 'exact-count',
          label: {
            en: 'Exact',
            ko: '정확히 맞은 키',
            ja: 'ぴたり',
            zh: '精确命中',
            ar: 'الدقيقة',
            es: 'Exactas',
            fr: 'Exactes',
            hi: 'सटीक',
            id: 'Tepat',
            pt: 'Exatas',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:count-min-sketch-imperative',
      label: {
        en: 'Count and read',
        ko: '넣기와 읽기',
        ja: '加算と読み出し',
        zh: '累加与读取',
        ar: 'العدّ والقراءة',
        es: 'Contar y leer',
        fr: 'Compter et lire',
        hi: 'गिनना और पढ़ना',
        id: 'Menghitung dan membaca',
        pt: 'Contar e ler',
      },
    },
  },

  messages: {
    'caption.start': {
      en: 'Width {width} x depth {depth} = {cells} cells for {total} items.',
      ko: '폭 {width} × 깊이 {depth} — 칸 수는 {cells}, 흘러드는 항목은 {total}.',
      ja: '幅 {width} × 深さ {depth} — セル数 {cells}、流れ込む項目 {total}。',
      zh: '宽度 {width} × 深度 {depth} = {cells} 格，用来数 {total} 个项目。',
      ar: 'العرض {width} × العمق {depth} = {cells} خلية لـ {total} عنصر.',
      es: 'Ancho {width} x profundidad {depth} = {cells} celdas para {total} elementos.',
      fr: 'Largeur {width} x profondeur {depth} = {cells} cases pour {total} éléments.',
      hi: 'चौड़ाई {width} x गहराई {depth} = {cells} खाने, {total} आइटम के लिए।',
      id: 'Lebar {width} x kedalaman {depth} = {cells} sel untuk {total} item.',
      pt: 'Largura {width} x profundidade {depth} = {cells} células para {total} itens.',
    },

    'caption.count': {
      en: 'Counting "{key}" {count} times — one cell rises in each of {depth} rows.',
      ko: '키 {key} 를 {count} 번 센다 — {depth} 줄마다 한 칸씩 오른다.',
      ja: 'キー {key} を {count} 回数える — {depth} 行それぞれで 1 マスずつ上がる。',
      zh: '把键 {key} 数 {count} 次 —— {depth} 行中各有一格上升。',
      ar: 'عدّ "{key}" {count} مرة — ترتفع خلية واحدة في كل من {depth} صفوف.',
      es: 'Contando "{key}" {count} veces: sube una celda en cada una de las {depth} filas.',
      fr: 'On compte « {key} » {count} fois : une case monte dans chacune des {depth} lignes.',
      hi: '"{key}" को {count} बार गिना जा रहा है — {depth} में से हर पंक्ति में एक खाना बढ़ता है।',
      id: 'Menghitung "{key}" {count} kali — satu sel naik di tiap {depth} baris.',
      pt: 'Contando "{key}" {count} vezes — sobe uma célula em cada uma das {depth} linhas.',
    },

    'caption.read': {
      en: 'Reading "{key}" — one cell from each of {depth} rows.',
      ko: '키 {key} 를 되읽는다 — {depth} 줄에서 한 칸씩.',
      ja: 'キー {key} を読み戻す — {depth} 行から 1 マスずつ。',
      zh: '读回键 {key} —— 从 {depth} 行各取一格。',
      ar: 'قراءة "{key}" — خلية واحدة من كل من {depth} صفوف.',
      es: 'Leyendo "{key}": una celda de cada una de las {depth} filas.',
      fr: 'Lecture de « {key} » : une case dans chacune des {depth} lignes.',
      hi: '"{key}" पढ़ा जा रहा है — {depth} में से हर पंक्ति से एक खाना।',
      id: 'Membaca "{key}" — satu sel dari tiap {depth} baris.',
      pt: 'Lendo "{key}" — uma célula de cada uma das {depth} linhas.',
    },

    'caption.min': {
      en: 'The smallest of the {depth} readings is {read}.',
      ko: '{depth} 개의 읽은 값 가운데 가장 작은 것은 {read}.',
      ja: '{depth} 個の読み値のうち最も小さいものは {read}。',
      zh: '{depth} 个读数中最小的是 {read}。',
      ar: 'أصغر القراءات الـ {depth} هو {read}.',
      es: 'La menor de las {depth} lecturas es {read}.',
      fr: 'La plus petite des {depth} lectures est {read}.',
      hi: '{depth} पठनों में सबसे छोटा {read} है।',
      id: 'Yang terkecil dari {depth} bacaan adalah {read}.',
      pt: 'A menor das {depth} leituras é {read}.',
    },

    'caption.exact': {
      en: '"{key}" reads {read} — exactly the true count.',
      ko: '키 {key} 는 {read} 로 읽힌다 — 참값 그대로.',
      ja: 'キー {key} は {read} と読める — 真の個数と同じ。',
      zh: '键 {key} 读作 {read} —— 与真实计数相同。',
      ar: '"{key}" يُقرأ {read} — وهو العدّ الحقيقي تمامًا.',
      es: '"{key}" se lee {read}: exactamente el conteo real.',
      fr: '« {key} » se lit {read} : exactement le compte réel.',
      hi: '"{key}" {read} पढ़ा जाता है — बिल्कुल सही गिनती।',
      id: '"{key}" terbaca {read} — persis hitungan sebenarnya.',
      pt: '"{key}" lê-se {read} — exatamente a contagem real.',
    },

    'caption.inflated': {
      en: '"{key}" reads {read}, but the true count is {truth}. Shared cells puffed it up.',
      ko: '키 {key} 는 {read} 로 읽히지만 참값은 {truth}. 함께 쓰는 칸이 값을 부풀렸다.',
      ja: 'キー {key} は {read} と読めるが真の個数は {truth}。共有セルが値を膨らませた。',
      zh: '键 {key} 读作 {read}，而真实计数是 {truth}。共享格子把它撑大了。',
      ar: '"{key}" يُقرأ {read} لكن العدّ الحقيقي {truth}. الخلايا المشتركة ضخّمت القيمة.',
      es: '"{key}" se lee {read}, pero el conteo real es {truth}. Las celdas compartidas lo inflaron.',
      fr: '« {key} » se lit {read}, mais le compte réel est {truth}. Les cases partagées l\'ont gonflé.',
      hi: '"{key}" {read} पढ़ा जाता है, पर सही गिनती {truth} है। साझा खानों ने इसे बढ़ा दिया।',
      id: '"{key}" terbaca {read}, padahal hitungan sebenarnya {truth}. Sel bersama menggelembungkannya.',
      pt: '"{key}" lê-se {read}, mas a contagem real é {truth}. Células compartilhadas a inflaram.',
    },

    'caption.verdict': {
      en: 'Width {width} x depth {depth} = {cells} cells. Overshoot total {errorSum}; {exact} of {keyCount} keys read exactly.',
      ko: '폭 {width} × 깊이 {depth} — 칸 {cells}. 부푼 양의 합은 {errorSum}, 정확히 맞은 키는 {keyCount} 중 {exact}.',
      ja: '幅 {width} × 深さ {depth} — セル {cells}。膨らみの合計 {errorSum}、ぴたり当たりは {keyCount} 中 {exact}。',
      zh: '宽度 {width} × 深度 {depth} = {cells} 格。膨胀总量 {errorSum}，{keyCount} 个键中有 {exact} 个读数精确。',
      ar: 'العرض {width} × العمق {depth} = {cells} خلية. مجموع التضخّم {errorSum}؛ {exact} من {keyCount} مفتاحًا قُرئت بدقة.',
      es: 'Ancho {width} x profundidad {depth} = {cells} celdas. Exceso total {errorSum}; {exact} de {keyCount} claves se leen exactas.',
      fr: 'Largeur {width} x profondeur {depth} = {cells} cases. Excès total {errorSum} ; {exact} clés sur {keyCount} sont lues exactement.',
      hi: 'चौड़ाई {width} x गहराई {depth} = {cells} खाने। कुल अधिकता {errorSum}; {keyCount} में से {exact} कुंजियाँ सटीक पढ़ी गईं।',
      id: 'Lebar {width} x kedalaman {depth} = {cells} sel. Total kelebihan {errorSum}; {exact} dari {keyCount} kunci terbaca tepat.',
      pt: 'Largura {width} x profundidade {depth} = {cells} células. Excesso total {errorSum}; {exact} de {keyCount} chaves leem-se exatas.',
    },

    'caption.waiting': {
      en: 'Move width or depth to count the same {total} items again.',
      ko: '폭이나 깊이를 밀면 같은 {total} 개를 다시 센다.',
      ja: '幅か深さを動かすと同じ {total} 個をもう一度数える。',
      zh: '拨动宽度或深度，就再数一遍同样的 {total} 个项目。',
      ar: 'حرّك العرض أو العمق لعدّ الـ {total} عنصر نفسها من جديد.',
      es: 'Mueve el ancho o la profundidad para volver a contar los mismos {total} elementos.',
      fr: 'Déplacez la largeur ou la profondeur pour recompter les mêmes {total} éléments.',
      hi: 'चौड़ाई या गहराई बदलें और वही {total} आइटम फिर से गिने जाएँगे।',
      id: 'Geser lebar atau kedalaman untuk menghitung ulang {total} item yang sama.',
      pt: 'Mova a largura ou a profundidade para contar de novo os mesmos {total} itens.',
    },

    'label.true': {
      en: 'true',
      ko: '참값',
      ja: '真値',
      zh: '真值',
      ar: 'الحقيقي',
      es: 'real',
      fr: 'réel',
      hi: 'सही',
      id: 'asli',
      pt: 'real',
    },

    'label.over': {
      en: 'overshoot',
      ko: '부푼 양',
      ja: '膨らみ',
      zh: '膨胀',
      ar: 'التضخّم',
      es: 'exceso',
      fr: 'excès',
      hi: 'अधिकता',
      id: 'kelebihan',
      pt: 'excesso',
    },
  },
};
