/**
 * k-최근접 이웃 facet JSON 선언.
 *
 * 진행 모델: 입력 반응형 (`ReactiveMechanism`). mount 직후 경계를 한 번 그리고
 * 물음점 여섯 곳을 차례로 돈다. 재생 · 한 걸음 · 멈춤 · 되감기 · 속도 위에
 * **k 슬라이더** 를 얹는다 — 이 완제품의 논증을 지는 물건이라 그것이 없으면
 * 완제품이 아니다. 재생 셋은 메커니즘이 `ctx.sleep` 의 걸음 경계에서 지므로
 * algorithm 은 k 슬라이더만 본다.
 *
 * 자료는 이름표 있는 점 열여덟이다. 마지막 둘이 요점이다 — `A (5.2, 4.6)` 은
 * B 무리 안에 있고 `B (4.2, 3.2)` 는 A 무리 안에 있다. k = 1 만 그 둘을 제
 * 부류로 판정한다 (자기 자신이 자기의 가장 가까운 이웃이므로). k 가 3 이상이면
 * 둘 다 주변에 삼켜진다.
 *
 * 식별자 (C1): `point:<i>` — 자료의 자리 번호.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/** 이름표 있는 자료 열여덟. 0 = A, 1 = B. 순서가 곧 `point:<i>` 의 i. */
const LABELED_18 = [
  { x: 1.5, y: 2.0, label: 0 },
  { x: 2.5, y: 1.5, label: 0 },
  { x: 1.0, y: 3.5, label: 0 },
  { x: 3.0, y: 2.8, label: 0 },
  { x: 2.0, y: 4.2, label: 0 },
  { x: 4.0, y: 1.8, label: 0 },
  { x: 3.5, y: 4.5, label: 0 },
  { x: 5.0, y: 2.2, label: 0 },
  { x: 5.2, y: 4.6, label: 0 },
  { x: 5.5, y: 5.0, label: 1 },
  { x: 6.5, y: 3.8, label: 1 },
  { x: 4.5, y: 6.2, label: 1 },
  { x: 7.0, y: 5.5, label: 1 },
  { x: 5.8, y: 6.8, label: 1 },
  { x: 7.5, y: 4.2, label: 1 },
  { x: 6.2, y: 5.9, label: 1 },
  { x: 3.8, y: 5.8, label: 1 },
  { x: 4.2, y: 3.2, label: 1 },
];

/**
 * 자동 시연이 도는 물음점 여섯.
 *
 * 앞의 넷은 k 를 옮기면 답이 뒤집히는 자리다 — (4.2, 3.2) 과 (5.2, 4.6) 은
 * 1 ↔ 3 에서, (4.7, 4.4) 는 3 ↔ 7 에서, (5.2, 3.2) 는 7 ↔ 15 에서 갈린다.
 * 뒤의 둘은 무리 한복판이라 어느 k 에서도 흔들리지 않는다.
 */
const QUERY_TOUR = [
  { x: 4.2, y: 3.2 },
  { x: 5.2, y: 4.6 },
  { x: 4.7, y: 4.4 },
  { x: 5.2, y: 3.2 },
  { x: 2.2, y: 2.6 },
  { x: 6.4, y: 5.6 },
];

export const knnFacet: FacetJson = {
  id: 'facet:knn',
  title: {
    en: 'k-Nearest Neighbours — how many do you ask?',
    ko: 'k-최근접 이웃 — 몇에게 물을 것인가',
    ar: 'أقرب k جار — كم واحدًا تسأل؟',
    es: 'k vecinos más cercanos: ¿a cuántos preguntas?',
    fr: 'k plus proches voisins — à combien demander ?',
    hi: 'k-निकटतम पड़ोसी — कितनों से पूछें?',
    id: 'k tetangga terdekat — berapa yang ditanya?',
    pt: 'k vizinhos mais próximos — a quantos perguntar?',
  },
  description: {
    en: 'Nothing is learned; every question rescans the data. Move k and the whole boundary changes.',
    ko: '학습이 없다. 물을 때마다 자료를 다시 훑는다. k 를 옮기면 경계 전체가 바뀐다.',
    ar: 'لا يوجد تعلّم؛ كل سؤال يعيد مسح البيانات. حرّك k فتتغيّر الحدود كلها.',
    es: 'No se aprende nada: cada pregunta vuelve a recorrer los datos. Mueve k y cambia toda la frontera.',
    fr: "Rien n'est appris : chaque question reparcourt les données. Déplacez k et toute la frontière change.",
    hi: 'कुछ भी सीखा नहीं जाता; हर सवाल पूरे डेटा को दोबारा छानता है। k बदलिए और पूरी सीमा बदल जाती है।',
    id: 'Tidak ada yang dipelajari; tiap pertanyaan memindai ulang data. Geser k dan seluruh batas berubah.',
    pt: 'Nada é aprendido; cada pergunta varre os dados de novo. Mova k e toda a fronteira muda.',
  },
  algorithm: 'module:knn',
  projector: 'module:knnProjector',
  initialData: {
    type: 'knn',
    points: LABELED_18,
    kValues: [1, 3, 7, 15],
    initialKIndex: 1,
    gridSize: 24,
    planeMin: 0,
    planeMax: 8,
    queries: QUERY_TOUR,
    timings: { neighborMs: 160, stopMs: 600 },
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  messages: {
    'label.legend': {
      en: 'tagged data',
      ko: '이름표 있는 자료',
      ar: 'بيانات موسومة',
      es: 'datos etiquetados',
      fr: 'données étiquetées',
      hi: 'लेबल वाला डेटा',
      id: 'data berlabel',
      pt: 'dados rotulados',
    },
    'label.overruledRing': {
      en: 'overruled',
      ko: '삼켜짐',
      ar: 'مُلغى',
      es: 'anulado',
      fr: 'renversé',
      hi: 'पलटा गया',
      id: 'terbantahkan',
      pt: 'revertido',
    },
    'label.asking': {
      en: 'asking the nearest {k}',
      ko: '가장 가까운 {k} 개에게 묻는다',
      ar: 'نسأل أقرب {k}',
      es: 'preguntando a los {k} más cercanos',
      fr: 'on interroge les {k} plus proches',
      hi: 'निकटतम {k} से पूछा जा रहा है',
      id: 'bertanya pada {k} terdekat',
      pt: 'perguntando aos {k} mais próximos',
    },
    'label.aCells': {
      en: 'cells judged A: {a} out of {total}',
      ko: 'A 로 판정된 칸은 {total} 중 {a}.',
      ar: 'الخانات المحكوم عليها A: {a} من {total}',
      es: 'celdas juzgadas A: {a} de {total}',
      fr: 'cases jugées A : {a} sur {total}',
      hi: 'A माने गए खाने: {total} में से {a}',
      id: 'sel yang dinilai A: {a} dari {total}',
      pt: 'células julgadas A: {a} de {total}',
    },
    'label.flipped': {
      en: 'moving k from {prev} to {k} flipped {n} cells',
      ko: 'k 를 {prev} 에서 {k} 로 옮기자 뒤집힌 칸은 {n}.',
      ar: 'نقل k من {prev} إلى {k} قلب {n} خانة',
      es: 'mover k de {prev} a {k} volteó {n} celdas',
      fr: 'passer k de {prev} à {k} a retourné {n} cases',
      hi: 'k को {prev} से {k} करने पर {n} खाने पलटे',
      id: 'memindah k dari {prev} ke {k} membalik {n} sel',
      pt: 'mover k de {prev} para {k} virou {n} células',
    },
    'label.firstDraw': {
      en: 'the first drawing, with no earlier k to compare against',
      ko: '처음 그린 것이라 견줄 앞의 k 가 없다.',
      ar: 'هذا أول رسم، ولا يوجد k سابق للمقارنة',
      es: 'es el primer dibujo, sin una k anterior con la que comparar',
      fr: 'premier tracé, sans k antérieur pour comparer',
      hi: 'यह पहला चित्र है, तुलना के लिए पिछला k नहीं है',
      id: 'gambar pertama, belum ada k sebelumnya untuk dibandingkan',
      pt: 'é o primeiro desenho, sem um k anterior para comparar',
    },
    'label.mislabeled': {
      en: 'points judged against their own tag: {n}',
      ko: '자기 이름표와 다르게 판정된 점은 {n}.',
      ar: 'النقاط المحكوم عليها خلافًا لوسمها: {n}',
      es: 'puntos juzgados en contra de su propia etiqueta: {n}',
      fr: 'points jugés à rebours de leur propre étiquette : {n}',
      hi: 'अपने ही लेबल के विरुद्ध माने गए बिंदु: {n}',
      id: 'titik yang dinilai berlawanan dengan labelnya: {n}',
      pt: 'pontos julgados contra o próprio rótulo: {n}',
    },
    'caption.idle': {
      en: 'every spot on the plane already has an answer, and that is the boundary',
      ko: '평면의 모든 자리에 이미 답이 있다. 그 답이 갈리는 자리가 경계다.',
      ar: 'كل موضع في المستوى له جواب بالفعل، وذلك هو الحد',
      es: 'cada punto del plano ya tiene una respuesta, y eso es la frontera',
      fr: 'chaque endroit du plan a déjà une réponse, et c’est cela la frontière',
      hi: 'तल की हर जगह का उत्तर पहले से तय है, और वही सीमा है',
      id: 'setiap tempat di bidang sudah punya jawaban, dan itulah batasnya',
      pt: 'cada ponto do plano já tem uma resposta, e é isso a fronteira',
    },
    'caption.moved': {
      en: 'spot {index} of {total} is being asked',
      ko: '{total} 곳 가운데 {index} 번째 물음점.',
      ar: 'يجري سؤال الموضع {index} من {total}',
      es: 'se pregunta el punto {index} de {total}',
      fr: 'on interroge l’endroit {index} sur {total}',
      hi: '{total} में से {index} जगह पूछी जा रही है',
      id: 'tempat ke-{index} dari {total} sedang ditanya',
      pt: 'o ponto {index} de {total} está sendo perguntado',
    },
    'caption.measuring': {
      en: 'the distance to all {n} is measured again',
      ko: '자료 전부까지의 거리를 다시 잰다. 그 수는 {n}.',
      ar: 'تُقاس المسافة إلى الجميع من جديد، وعددهم {n}',
      es: 'se vuelve a medir la distancia a los {n}',
      fr: 'la distance vers les {n} est mesurée de nouveau',
      hi: 'सभी {n} तक की दूरी दोबारा नापी जाती है',
      id: 'jarak ke semua {n} diukur ulang',
      pt: 'a distância até todos os {n} é medida de novo',
    },
    'caption.taking': {
      en: 'the closest one still unpicked is called out, which makes {n}',
      ko: '아직 안 뽑힌 것 중 가장 가까운 것이 불려 나온다. 이로써 뽑힌 것은 {n}.',
      ar: 'يُستدعى أقرب من لم يُختر بعد، فيصير العدد {n}',
      es: 'se llama al más cercano aún sin elegir, con lo que van {n}',
      fr: 'le plus proche non encore choisi est appelé, ce qui en fait {n}',
      hi: 'अब तक न चुने गए सबसे नज़दीक को बुलाया जाता है, कुल हुए {n}',
      id: 'yang terdekat dan belum terpilih dipanggil, jadi totalnya {n}',
      pt: 'o mais próximo ainda não escolhido é chamado, somando {n}',
    },
    'caption.verdict': {
      en: 'this spot is judged {label}',
      ko: '이 자리의 판정은 {label}.',
      ar: 'يُحكم على هذا الموضع بأنه {label}',
      es: 'este punto se juzga {label}',
      fr: 'cet endroit est jugé {label}',
      hi: 'इस जगह का निर्णय है {label}',
      id: 'tempat ini dinilai {label}',
      pt: 'este ponto é julgado {label}',
    },
    'caption.kept': {
      en: 'its own tag is {own}, and the neighbours said the same',
      ko: '제 이름표는 {own} 이고 이웃도 그렇게 답했다.',
      ar: 'وسمه هو {own}، وقال الجيران المثل',
      es: 'su propia etiqueta es {own}, y los vecinos dijeron lo mismo',
      fr: 'son étiquette est {own}, et les voisins ont dit pareil',
      hi: 'इसका अपना लेबल {own} है, और पड़ोसियों ने भी वही कहा',
      id: 'labelnya sendiri {own}, dan para tetangga mengatakan hal yang sama',
      pt: 'seu próprio rótulo é {own}, e os vizinhos disseram o mesmo',
    },
    'caption.swallowed': {
      en: 'its own tag is {own}, but the neighbours overruled it',
      ko: '제 이름표는 {own} 인데 이웃에게 삼켜졌다.',
      ar: 'وسمه هو {own}، لكن الجيران ألغوه',
      es: 'su propia etiqueta es {own}, pero los vecinos la anularon',
      fr: 'son étiquette est {own}, mais les voisins l’ont renversée',
      hi: 'इसका अपना लेबल {own} है, पर पड़ोसियों ने उसे पलट दिया',
      id: 'labelnya sendiri {own}, tetapi para tetangga membantahnya',
      pt: 'seu próprio rótulo é {own}, mas os vizinhos o reverteram',
    },
    'caption.settled': {
      en: 'votes went {a} to {b}, so the answer is {label}',
      ko: '표는 {a} 대 {b} 로 갈렸고 답은 {label}.',
      ar: 'جاءت الأصوات {a} مقابل {b}، فالجواب {label}',
      es: 'los votos fueron {a} a {b}, así que la respuesta es {label}',
      fr: 'les voix sont allées {a} contre {b}, donc la réponse est {label}',
      hi: 'मत {a} बनाम {b} रहे, इसलिए उत्तर है {label}',
      id: 'suaranya {a} lawan {b}, jadi jawabannya {label}',
      pt: 'os votos ficaram {a} a {b}, então a resposta é {label}',
    },
    'caption.done': {
      en: 'the tour is over, and moving k changes the whole field at once',
      ko: '한 바퀴 다 돌았다. k 를 옮기면 평면 전체가 한꺼번에 바뀐다.',
      ar: 'انتهت الجولة، وتحريك k يغيّر الحقل كله دفعة واحدة',
      es: 'el recorrido terminó, y mover k cambia todo el campo de una vez',
      fr: 'le tour est fini, et déplacer k change tout le champ d’un coup',
      hi: 'चक्कर पूरा हुआ, और k बदलते ही पूरा क्षेत्र एक साथ बदल जाता है',
      id: 'putarannya selesai, dan menggeser k mengubah seluruh bidang sekaligus',
      pt: 'a volta terminou, e mover k muda o campo inteiro de uma vez',
    },
  },
  blocks: {
    stage: { type: 'knn-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'k',
          name: 'k',
          label: {
            en: 'Neighbours asked',
            ko: '묻는 이웃 수',
            ar: 'عدد الجيران',
            es: 'Vecinos consultados',
            fr: 'Voisins interrogés',
            hi: 'पूछे गए पड़ोसी',
            id: 'Tetangga yang ditanya',
            pt: 'Vizinhos consultados',
          },
          segments: [
            { value: 1, label: '1' },
            { value: 3, label: '3', default: true },
            { value: 7, label: '7' },
            { value: 15, label: '15' },
          ],
        },
      ],
      metrics: [
        {
          name: 'distance-count',
          label: {
            en: 'Distances',
            ko: '잰 거리',
            ar: 'مسافات',
            es: 'Distancias',
            fr: 'Distances',
            hi: 'दूरियाँ',
            id: 'Jarak',
            pt: 'Distâncias',
          },
          initial: 0,
        },
        {
          name: 'mislabel-count',
          label: {
            en: 'Overruled',
            ko: '삼켜진 점',
            ar: 'مُلغاة',
            es: 'Anulados',
            fr: 'Renversés',
            hi: 'पलटे गए',
            id: 'Terbantahkan',
            pt: 'Revertidos',
          },
          initial: 0,
        },
        {
          name: 'grid-a-count',
          label: {
            en: 'A cells',
            ko: 'A 칸',
            ar: 'خانات A',
            es: 'Celdas A',
            fr: 'Cases A',
            hi: 'A खाने',
            id: 'Sel A',
            pt: 'Células A',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: {
        en: 'Code',
        ko: '코드',
        ar: 'الشيفرة',
        es: 'Código',
        fr: 'Code',
        hi: 'कोड',
        id: 'Kode',
        pt: 'Código',
      },
      ir: 'ir:knn',
    },
  },
};
