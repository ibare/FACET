/**
 * @piece 세어 둔 수를 읽을 때 왜 세 줄 가운데 가장 작은 값을 믿는가.
 *
 * 질문 하나에 답하고 멈춘다. 제목은 곁의 글이 주므로 title-block 을 두지 않고,
 * 셀 것이 없으므로 계기판도 두지 않는다. 배치는 러너가 만든다.
 *
 * 1차 데이터는 키 문자열과 빈도뿐이다. 자리도 표의 값도 algorithm 이 직접 셈한다 —
 * 여기 적어 두면 데이터를 고칠 때 화면이 조용히 거짓을 말하게 된다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const trustTheSmallestFacet: FacetJson = {
  id: 'facet:trustTheSmallest',

  title: {
    en: 'Trust the smallest',
    ko: '가장 작은 값을 믿는다',
    ja: '最小値を信じる',
    zh: '相信最小值',
    ar: 'ثق بالأصغر',
    es: 'Confía en el menor',
    fr: 'Faire confiance au plus petit',
    hi: 'सबसे छोटे पर भरोसा',
    id: 'Percayai yang terkecil',
    pt: 'Confie no menor',
  },

  description: {
    en: 'A Count-Min Sketch answers a count by reading three rows and keeping the lowest — shared cells can only inflate a count, never shrink it.',
    ko: 'Count-Min Sketch 는 세 줄에서 읽은 값 가운데 가장 낮은 것을 답으로 내놓는다. 함께 쓰는 칸은 값을 부풀릴 수는 있어도 깎지는 못한다.',
    ja: 'Count-Min Sketch は 3 行から読んだ値のうち最も小さいものを答えとする。共有されたセルは値を膨らませることはあっても減らすことはない。',
    zh: 'Count-Min Sketch 从三行中读数并取最小值作为答案。共享的格子只会让计数变大，不会变小。',
    ar: 'يجيب Count-Min Sketch بقراءة ثلاثة صفوف وأخذ أصغر قيمة؛ الخلايا المشتركة قد تضخّم العدّ لكنها لا تنقصه أبدًا.',
    es: 'Un Count-Min Sketch responde leyendo tres filas y quedándose con el valor más bajo: las celdas compartidas solo pueden inflar el conteo, nunca reducirlo.',
    fr: 'Un Count-Min Sketch répond en lisant trois lignes et en gardant la plus petite valeur : les cellules partagées ne peuvent que gonfler le compte, jamais le réduire.',
    hi: 'Count-Min Sketch तीन पंक्तियों से पढ़कर सबसे छोटा मान उत्तर देता है — साझा कोष्ठ गिनती को बढ़ा सकते हैं, घटा नहीं सकते।',
    id: 'Count-Min Sketch menjawab dengan membaca tiga baris dan mengambil nilai terkecil — sel bersama hanya bisa menggelembungkan hitungan, tidak pernah mengecilkannya.',
    pt: 'Um Count-Min Sketch responde lendo três linhas e tomando o menor valor — células compartilhadas só podem inflar a contagem, nunca reduzi-la.',
  },

  algorithm: 'module:trustTheSmallest',
  projector: 'module:trustTheSmallestProjector',

  initialData: {
    type: 'trust-the-smallest',
    /** 줄 수 = 해시 함수의 수. */
    depth: 3,
    /** 줄마다의 칸 수. 부풂이 눈에 보이도록 일부러 좁게 잡았다. */
    width: 5,
    /** 걸음이 끝난 뒤 쉬는 시간. 읽을 틈을 주는 저작 결정이다 (S-piece). */
    stepMs: 760,
    /** 들어오는 것 열아홉 개를 키별로 묶었다. 빈도가 곧 참값이다. */
    stream: [
      { key: 'kiwi', count: 8 },
      { key: 'mango', count: 4 },
      { key: 'elder', count: 3 },
      { key: 'cherry', count: 2 },
      { key: 'banana', count: 2 },
    ],
  },

  blocks: {
    stage: { type: 'trust-the-smallest-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.ingest': {
      en: 'Key "{key}" arrives {count} times. One cell in every row goes up.',
      ko: '키 {key} — 들어온 횟수는 {count}. 줄마다 한 칸씩 오른다.',
      ja: 'キー {key} が {count} 回。各行で 1 マスずつ上がる。',
      zh: '键 {key} 出现 {count} 次。每行各有一格增加。',
      ar: 'المفتاح "{key}" يرد {count} مرة. ترتفع خلية واحدة في كل صف.',
      es: 'La clave "{key}" llega {count} veces. Sube una celda en cada fila.',
      fr: 'La clé « {key} » arrive {count} fois. Une cellule monte dans chaque ligne.',
      hi: 'कुंजी "{key}" {count} बार आती है। हर पंक्ति में एक कोष्ठ बढ़ता है।',
      id: 'Kunci "{key}" datang {count} kali. Satu sel di setiap baris naik.',
      pt: 'A chave "{key}" chega {count} vezes. Uma célula sobe em cada linha.',
    },

    'caption.exact': {
      en: 'Three rows read "{key}"; the answer sinks to {min} — exactly the true count.',
      ko: '키 {key} — 세 줄에서 읽은 값이 가라앉아 멈춘 자리는 {min}. 참값 그대로.',
      ja: 'キー {key} を 3 行から読み、答えは {min} まで沈む。真の個数と同じ。',
      zh: '从三行读取键 {key}，答案下沉到 {min}，与真实计数相同。',
      ar: 'ثلاثة صفوف تقرأ "{key}"؛ تهبط الإجابة إلى {min} — وهي العدّ الحقيقي تمامًا.',
      es: 'Tres filas leen "{key}"; la respuesta baja hasta {min}, exactamente el conteo real.',
      fr: "Trois lignes lisent « {key} » ; la réponse descend jusqu'à {min}, exactement le compte réel.",
      hi: 'तीन पंक्तियाँ "{key}" पढ़ती हैं; उत्तर {min} तक उतरता है — यही सही गिनती है।',
      id: 'Tiga baris membaca "{key}"; jawabannya turun ke {min} — persis hitungan sebenarnya.',
      pt: 'Três linhas leem "{key}"; a resposta desce até {min} — exatamente a contagem real.',
    },

    'caption.inflated': {
      en: 'Three rows read "{key}"; the answer sinks to {min}, yet the true count is {truth}. Shared cells puffed it up.',
      ko: '키 {key} — 가라앉아 멈춘 자리는 {min}, 참값은 {truth}. 함께 쓰는 칸이 값을 부풀렸다.',
      ja: 'キー {key} の答えは {min} まで沈むが、真の個数は {truth}。共有セルが値を膨らませた。',
      zh: '键 {key} 的答案下沉到 {min}，而真实计数是 {truth}。共享格子把它撑大了。',
      ar: 'تهبط إجابة "{key}" إلى {min}، لكن العدّ الحقيقي هو {truth}. الخلايا المشتركة ضخّمت القيمة.',
      es: 'La respuesta de "{key}" baja hasta {min}, pero el conteo real es {truth}. Las celdas compartidas la inflaron.',
      fr: "La réponse de « {key} » descend jusqu'à {min}, mais le compte réel est {truth}. Les cellules partagées l'ont gonflée.",
      hi: '"{key}" का उत्तर {min} तक उतरता है, पर सही गिनती {truth} है। साझा कोष्ठों ने इसे बढ़ा दिया।',
      id: 'Jawaban "{key}" turun ke {min}, padahal hitungan sebenarnya {truth}. Sel bersama menggelembungkannya.',
      pt: 'A resposta de "{key}" desce até {min}, mas a contagem real é {truth}. Células compartilhadas a inflaram.',
    },

    'caption.verdict': {
      en: 'Across all {n} keys, the smallest reading never fell below the true count.',
      ko: '키 {n} 가운데 최솟값이 참값보다 작게 읽힌 것은 없다.',
      ja: '{n} 個のキーすべてで、最小値が真の個数を下回ることはなかった。',
      zh: '全部 {n} 个键中，最小读数从未低于真实计数。',
      ar: 'في المفاتيح {n} جميعها، لم تنخفض أصغر قراءة دون العدّ الحقيقي قط.',
      es: 'En las {n} claves, la lectura más pequeña nunca quedó por debajo del conteo real.',
      fr: "Sur les {n} clés, la plus petite lecture n'est jamais tombée sous le compte réel.",
      hi: 'सभी {n} कुंजियों में, सबसे छोटा पठन कभी सही गिनती से कम नहीं हुआ।',
      id: 'Pada semua {n} kunci, bacaan terkecil tidak pernah jatuh di bawah hitungan sebenarnya.',
      pt: 'Em todas as {n} chaves, a menor leitura nunca ficou abaixo da contagem real.',
    },

    'label.truth': {
      en: 'true {n}',
      ko: '참값 {n}',
      ja: '真値 {n}',
      zh: '真实 {n}',
      ar: 'الحقيقي {n}',
      es: 'real {n}',
      fr: 'réel {n}',
      hi: 'सही {n}',
      id: 'asli {n}',
      pt: 'real {n}',
    },

    'label.answer': {
      en: 'min {n}',
      ko: '최솟값 {n}',
      ja: '最小 {n}',
      zh: '最小 {n}',
      ar: 'الأصغر {n}',
      es: 'mín {n}',
      fr: 'min {n}',
      hi: 'न्यूनतम {n}',
      id: 'min {n}',
      pt: 'mín {n}',
    },
  },
};
