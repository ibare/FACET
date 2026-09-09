/**
 * 삽입 정렬 완결형 선언.
 *
 * 블록은 셋뿐이다 — `stage` · `controls` · `codePanel`. 제목 블록을 두지 않는다
 * (이름은 카탈로그 카드와 글의 문단이 준다). 줄 선 구간 · 손에 든 값 · 값별
 * 비켜섬 기록은 빌트인 view 를 빌리지 않고 stage 가 직접 그린다.
 *
 * 이 facet 의 산출물은 그림이 아니라 **코드** 다. `ir:insertionsort-imperative`
 * 하나가 여섯 언어로 펼쳐지고, 재생 중인 phase 가 그 줄을 짚는다.
 *
 * 식별자 (C1): `index:<i>`.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const insertionSortFacet: FacetJson = {
  id: 'facet:insertionSort',
  // 제목은 카탈로그 카드의 이름과 같다 (C4 명명 규칙 5).
  title: {
    en: 'Insertion Sort',
    ko: '삽입 정렬',
    ar: 'الترتيب بالإدراج',
    es: 'Ordenamiento por inserción',
    fr: 'Tri par insertion',
    hi: 'इंसर्शन सॉर्ट',
    id: 'Pengurutan sisip',
    pt: 'Ordenação por inserção',
  },
  description: {
    en: 'Hold one value, let the bigger ones step aside, and drop it in — an ordered input barely works at all.',
    ko: '값 하나를 들고 큰 것들을 비켜세운 뒤 끼워 넣는다 — 이미 줄 선 입력에서는 거의 일하지 않는다',
    ar: 'احمل قيمة واحدة، ودع الأكبر منها يتنحّى، ثم أدرجها — المدخل المرتّب أصلًا لا يكلّف شيئًا تقريبًا.',
    es: 'Sostén un valor, deja que los mayores se aparten y encájalo: con una entrada ya ordenada casi no trabaja.',
    fr: "Tenez une valeur, laissez les plus grandes s'écarter, puis insérez-la — sur une entrée déjà triée, il ne travaille presque pas.",
    hi: 'एक मान हाथ में लें, बड़े मानों को एक-एक खाना खिसकने दें, फिर उसे बैठा दें — पहले से क्रमित इनपुट पर यह लगभग कुछ नहीं करता।',
    id: 'Pegang satu nilai, biarkan yang lebih besar menyingkir, lalu sisipkan — pada masukan yang sudah terurut ia nyaris tak bekerja.',
    pt: 'Segure um valor, deixe os maiores saírem do caminho e encaixe-o — numa entrada já ordenada, quase não trabalha.',
  },
  algorithm: 'module:insertionSort',
  projector: 'module:insertionSortProjector',
  // 사양이 정한 자료. 90 을 넣을 때 비켜섬이 0 이 되는 대목이 이 배치에서
  // 실제로 일어난다 — 섞으면 그것이 사라진다.
  initialData: { type: 'array', values: [64, 25, 12, 22, 11, 90, 34] },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    stage: { type: 'insertion-sort-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        {
          name: 'compare-count',
          label: {
            en: 'Compare',
            ko: '견줌',
            ar: 'مقارنة',
            es: 'Comparar',
            fr: 'Comparer',
            hi: 'तुलना',
            id: 'Banding',
            pt: 'Comparar',
          },
          initial: 0,
        },
        {
          name: 'shift-count',
          label: {
            en: 'Step aside',
            ko: '비켜섬',
            ar: 'إزاحة',
            es: 'Desplazamiento',
            fr: 'Décalage',
            hi: 'खिसकाव',
            id: 'Geseran',
            pt: 'Deslocamento',
          },
          initial: 0,
        },
        {
          name: 'insert-count',
          label: {
            en: 'Insert',
            ko: '넣기',
            ar: 'إدراج',
            es: 'Inserción',
            fr: 'Insertion',
            hi: 'सम्मिलन',
            id: 'Penyisipan',
            pt: 'Inserção',
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
      ir: 'ir:insertionsort-imperative',
    },
  },
  messages: {
    'label.sortedRun': {
      en: 'in order',
      ko: '줄 선 구간',
      ar: 'مرتّب',
      es: 'en orden',
      fr: 'en ordre',
      hi: 'क्रम में',
      id: 'terurut',
      pt: 'em ordem',
    },
    'label.ledger': {
      en: 'Shifts per inserted value',
      ko: '넣은 값마다 비켜선 횟수',
      ar: 'عدد الإزاحات لكل قيمة مُدرجة',
      es: 'Desplazamientos por valor insertado',
      fr: 'Décalages par valeur insérée',
      hi: 'हर सम्मिलित मान पर खिसकाव',
      id: 'Geseran per nilai yang disisipkan',
      pt: 'Deslocamentos por valor inserido',
    },
    'caption.start': {
      en: 'The first cell alone is already a sorted run.',
      ko: '첫 칸 하나는 그 자체로 이미 줄이 서 있다',
      ar: 'الخانة الأولى وحدها تُعدّ صفًّا مرتّبًا بالفعل.',
      es: 'La primera casilla por sí sola ya es un tramo ordenado.',
      fr: 'La première case à elle seule forme déjà une suite ordonnée.',
      hi: 'पहला खाना अकेले ही एक क्रमित शृंखला है।',
      id: 'Sel pertama saja sudah merupakan deret yang terurut.',
      pt: 'A primeira casa sozinha já é um trecho ordenado.',
    },
    'caption.pick': {
      en: 'Take {value} out. {count} cells on the left are in order.',
      ko: '{value} 를 집어 든다. 왼쪽 {count} 칸은 줄이 서 있다',
      ar: 'اسحب {value} خارجًا. {count} خانات على اليسار مرتّبة.',
      es: 'Saca {value}. Las {count} casillas de la izquierda están en orden.',
      fr: 'Retirez {value}. Les {count} cases de gauche sont en ordre.',
      hi: '{value} को बाहर निकालें। बाईं ओर के {count} खाने क्रम में हैं।',
      id: 'Ambil {value} keluar. {count} sel di kiri sudah terurut.',
      pt: 'Retire {value}. As {count} casas da esquerda estão em ordem.',
    },
    'caption.compare': {
      en: 'Is {value} greater than {key}?',
      ko: '{value} 는 {key} 보다 큰가',
      ar: 'هل {value} أكبر من {key}؟',
      es: '¿Es {value} mayor que {key}?',
      fr: 'Est-ce que {value} est plus grand que {key} ?',
      hi: 'क्या {value}, {key} से बड़ा है?',
      id: 'Apakah {value} lebih besar dari {key}?',
      pt: '{value} é maior que {key}?',
    },
    'caption.shift': {
      en: '{value} is greater — it steps one cell to the right.',
      ko: '{value} 는 더 크다 — 오른쪽으로 한 칸 비켜선다',
      ar: '{value} أكبر — فيتنحّى خانة واحدة إلى اليمين.',
      es: '{value} es mayor: se aparta una casilla a la derecha.',
      fr: '{value} est plus grand — il se décale d’une case vers la droite.',
      hi: '{value} बड़ा है — यह एक खाना दाईं ओर खिसक जाता है।',
      id: '{value} lebih besar — ia menyingkir satu sel ke kanan.',
      pt: '{value} é maior — desloca-se uma casa para a direita.',
    },
    'caption.stopSmaller': {
      en: '{value} is not greater than {key} — the walk stops here.',
      ko: '{value} 는 {key} 보다 크지 않다 — 여기서 멈춘다',
      ar: '{value} ليس أكبر من {key} — يتوقّف المسير هنا.',
      es: '{value} no es mayor que {key}: el recorrido se detiene aquí.',
      fr: "{value} n'est pas plus grand que {key} — la marche s'arrête ici.",
      hi: '{value}, {key} से बड़ा नहीं है — चलना यहीं रुक जाता है।',
      id: '{value} tidak lebih besar dari {key} — penelusuran berhenti di sini.',
      pt: '{value} não é maior que {key} — a caminhada para aqui.',
    },
    'caption.stopEdge': {
      en: 'The left end is passed — {key} is the smallest so far.',
      ko: '왼쪽 끝을 지났다 — {key} 가 지금까지 가장 작다',
      ar: 'تم تجاوز الطرف الأيسر — {key} هو الأصغر حتى الآن.',
      es: 'Se pasó el extremo izquierdo: {key} es el menor hasta ahora.',
      fr: "L'extrémité gauche est dépassée — {key} est le plus petit jusqu'ici.",
      hi: 'बायाँ सिरा पार हो गया — {key} अब तक सबसे छोटा है।',
      id: 'Ujung kiri terlewati — {key} yang terkecil sejauh ini.',
      pt: 'A ponta esquerda foi ultrapassada — {key} é o menor até agora.',
    },
    'caption.place': {
      en: '{value} settles into seat {index}.',
      ko: '{value} 가 {index} 번 자리에 내려앉는다',
      ar: '{value} يستقرّ في المقعد {index}.',
      es: '{value} se asienta en el puesto {index}.',
      fr: '{value} se pose à la place {index}.',
      hi: '{value} स्थान {index} पर बैठ जाता है।',
      id: '{value} turun ke kursi {index}.',
      pt: '{value} assenta no lugar {index}.',
    },
    'caption.settle': {
      en: '{count} cells are in order now. {value} cost {shifts} steps aside.',
      ko: '이제 {count} 칸이 줄 섰다. {value} 는 {shifts} 번 비켜세우고 들어갔다',
      ar: 'أصبحت {count} خانات مرتّبة الآن. كلّف {value} إزاحة {shifts} مرات.',
      es: 'Ahora {count} casillas están en orden. {value} costó {shifts} desplazamientos.',
      fr: '{count} cases sont maintenant en ordre. {value} a coûté {shifts} décalages.',
      hi: 'अब {count} खाने क्रम में हैं। {value} के लिए {shifts} बार खिसकाना पड़ा।',
      id: 'Kini {count} sel sudah terurut. {value} menuntut {shifts} geseran.',
      pt: 'Agora {count} casas estão em ordem. {value} custou {shifts} deslocamentos.',
    },
    'caption.settleNone': {
      en: '{value} was already home — nothing stepped aside.',
      ko: '{value} 는 이미 제자리였다 — 아무것도 비켜서지 않았다',
      ar: '{value} كان في موضعه أصلًا — لم يتنحَّ شيء.',
      es: '{value} ya estaba en su sitio: nada se apartó.',
      fr: "{value} était déjà à sa place — rien ne s'est écarté.",
      hi: '{value} पहले से अपनी जगह पर था — कुछ भी नहीं खिसका।',
      id: '{value} sudah di tempatnya — tidak ada yang menyingkir.',
      pt: '{value} já estava no lugar — nada se afastou.',
    },
    'caption.done': {
      en: 'Sorted with {compares} comparisons and {shifts} steps aside.',
      ko: '견줌 {compares} 번 · 비켜섬 {shifts} 번으로 정렬됐다',
      ar: 'تم الترتيب بـ {compares} مقارنات و {shifts} إزاحات.',
      es: 'Ordenado con {compares} comparaciones y {shifts} desplazamientos.',
      fr: 'Trié avec {compares} comparaisons et {shifts} décalages.',
      hi: '{compares} तुलनाओं और {shifts} खिसकावों से क्रम में लग गया।',
      id: 'Terurut dengan {compares} pembandingan dan {shifts} geseran.',
      pt: 'Ordenado com {compares} comparações e {shifts} deslocamentos.',
    },
  },
};
