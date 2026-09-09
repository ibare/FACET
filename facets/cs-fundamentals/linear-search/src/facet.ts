/**
 * 선형 탐색 완결형 선언.
 *
 * 블록은 셋뿐이다 — `stage` · `controls` · `codePanel`. 제목 블록을 두지 않는다
 * (이름은 카탈로그 카드와 글의 문단이 준다).
 *
 * 이 facet 의 산출물은 그림이 아니라 **코드** 다. 알고리즘이 워낙 짧아서 코드
 * 패널이 화면의 주인공이 된다 — `ir:linearsearch-scan` 하나가 여섯 언어로
 * 펼쳐지고, 거기서 `len(arr)` 이 `len(arr)` · `arr.length` · `arr.size()` ·
 * `arr.Length` 로 갈리는 것이 이 완제품이 보여 줄 것이다.
 *
 * 식별자 (C1): `index:<i>`.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const linearSearchFacet: FacetJson = {
  id: 'facet:linearSearch',
  // 제목은 카탈로그 카드의 이름과 같다 (C4 명명 규칙 5).
  title: {
    en: 'Linear Search',
    ko: '선형 탐색',
    ar: 'البحث الخطي',
    es: 'Búsqueda lineal',
    fr: 'Recherche linéaire',
    hi: 'रैखिक खोज',
    id: 'Pencarian linear',
    pt: 'Busca linear',
  },
  description: {
    en: 'Look at every cell in turn — with no order to lean on, that is the only honest way to say "not here".',
    ko: '앞에서부터 하나씩 본다 — 줄이 서 있지 않으면 없다고 답하려고 끝까지 봐야 한다',
    ar: 'انظر إلى كل خانة بالترتيب — بلا ترتيب مسبق، هذه هي الطريقة الصادقة الوحيدة لقول "غير موجود".',
    es: 'Mira cada casilla por turno: sin un orden en el que apoyarse, es la única forma honesta de decir "no está".',
    fr: 'Regarder chaque case à son tour — sans ordre sur lequel s’appuyer, c’est la seule façon honnête de dire « absent ».',
    hi: 'हर खाने को बारी-बारी देखें — क्रम न हो तो "यहाँ नहीं है" कहने का यही एकमात्र ईमानदार तरीका है।',
    id: 'Lihat setiap sel bergiliran — tanpa urutan untuk bersandar, hanya begitu bisa jujur berkata "tidak ada".',
    pt: 'Olhe cada casa por vez — sem ordem em que se apoiar, é o único jeito honesto de dizer "não está".',
  },
  algorithm: 'module:linearSearch',
  projector: 'module:linearSearchProjector',
  // 사양이 정한 자료. **줄이 서 있지 않다** — 그것이 이 알고리즘의 전제다.
  // 먼저 55 (자리 4 에 있다) 를, 그다음 50 (없다) 을 찾는다.
  initialData: {
    type: 'array',
    values: [42, 17, 93, 8, 55, 71, 30, 64],
    targets: [55, 50],
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    stage: { type: 'linear-search-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        {
          name: 'search-count',
          label: {
            en: 'Search',
            ko: '훑기',
            ar: 'بحث',
            es: 'Búsqueda',
            fr: 'Recherche',
            hi: 'खोज',
            id: 'Pencarian',
            pt: 'Busca',
          },
          initial: 0,
        },
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
          name: 'hit-count',
          label: {
            en: 'Found',
            ko: '찾음',
            ar: 'موجود',
            es: 'Encontrado',
            fr: 'Trouvé',
            hi: 'मिला',
            id: 'Ketemu',
            pt: 'Achado',
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
      ir: 'ir:linearsearch-scan',
    },
  },
  messages: {
    'label.target': {
      en: 'Looking for',
      ko: '찾는 값',
      ar: 'نبحث عن',
      es: 'Se busca',
      fr: 'On cherche',
      hi: 'खोज रहे हैं',
      id: 'Mencari',
      pt: 'Procurando',
    },
    'label.round': {
      en: 'Search {n} of {total}',
      ko: '{total} 번 중 {n} 번째 훑기',
      ar: 'البحث {n} من {total}',
      es: 'Búsqueda {n} de {total}',
      fr: 'Recherche {n} sur {total}',
      hi: '{total} में से {n} खोज',
      id: 'Pencarian {n} dari {total}',
      pt: 'Busca {n} de {total}',
    },
    'label.log': {
      en: 'Searches so far',
      ko: '지금까지의 훑기',
      ar: 'عمليات البحث حتى الآن',
      es: 'Búsquedas hasta ahora',
      fr: 'Recherches jusqu’ici',
      hi: 'अब तक की खोजें',
      id: 'Pencarian sejauh ini',
      pt: 'Buscas até agora',
    },
    'label.rowHit': {
      en: '{target} — seat {index}, {count} cells looked at',
      ko: '{target} — {index} 번 자리, {count} 칸을 봤다',
      ar: '{target} — الموضع {index}، فُحصت {count} خانة',
      es: '{target} — puesto {index}, {count} casillas miradas',
      fr: '{target} — place {index}, {count} cases regardées',
      hi: '{target} — स्थान {index}, {count} खाने देखे गए',
      id: '{target} — kursi {index}, {count} sel dilihat',
      pt: '{target} — lugar {index}, {count} casas olhadas',
    },
    'label.rowMiss': {
      en: '{target} — not here, all {count} cells looked at',
      ko: '{target} — 없다, {count} 칸을 다 봤다',
      ar: '{target} — غير موجود، فُحصت الخانات {count} كلها',
      es: '{target} — no está, se miraron las {count} casillas',
      fr: '{target} — absent, les {count} cases ont été regardées',
      hi: '{target} — यहाँ नहीं, सभी {count} खाने देखे गए',
      id: '{target} — tidak ada, semua {count} sel dilihat',
      pt: '{target} — não está, todas as {count} casas olhadas',
    },
    'caption.start': {
      en: 'The line is not sorted, so there is no way to stop early.',
      ko: '줄이 서 있지 않다 — 중간에 그만둘 근거가 없다',
      ar: 'الصف غير مرتّب، فلا سبيل للتوقف مبكرًا.',
      es: 'La fila no está ordenada, así que no hay forma de parar antes de tiempo.',
      fr: 'La rangée n’est pas triée : rien ne permet de s’arrêter en chemin.',
      hi: 'पंक्ति क्रम में नहीं है, इसलिए बीच में रुकने का कोई आधार नहीं।',
      id: 'Barisan ini tidak terurut, jadi tidak ada alasan berhenti di tengah.',
      pt: 'A fila não está ordenada, então não há como parar antes do fim.',
    },
    'caption.begin': {
      en: 'Start at the front and look for {target}.',
      ko: '맨 앞에서부터 {target} 을 찾는다',
      ar: 'ابدأ من المقدمة وابحث عن {target}.',
      es: 'Empieza por el frente y busca {target}.',
      fr: 'On part de l’avant et on cherche {target}.',
      hi: 'सामने से शुरू करें और {target} खोजें।',
      id: 'Mulai dari depan dan cari {target}.',
      pt: 'Comece pela frente e procure {target}.',
    },
    'caption.look': {
      en: 'Seat {index} holds {value}.',
      ko: '{index} 번 자리에는 {value} 가 있다',
      ar: 'الموضع {index} يحمل {value}.',
      es: 'El puesto {index} contiene {value}.',
      fr: 'La place {index} contient {value}.',
      hi: 'स्थान {index} में {value} है।',
      id: 'Kursi {index} berisi {value}.',
      pt: 'O lugar {index} contém {value}.',
    },
    'caption.same': {
      en: '{value} is {target} — stop here.',
      ko: '{value} 가 {target} 이다 — 여기서 멈춘다',
      ar: '{value} هو {target} — نتوقف هنا.',
      es: '{value} es {target}: paramos aquí.',
      fr: '{value} est {target} — on s’arrête ici.',
      hi: '{value} ही {target} है — यहीं रुकें।',
      id: '{value} adalah {target} — berhenti di sini.',
      pt: '{value} é {target} — paramos aqui.',
    },
    'caption.differ': {
      en: '{value} is not {target} — go on.',
      ko: '{value} 는 {target} 이 아니다 — 다음 칸으로',
      ar: '{value} ليس {target} — نتابع.',
      es: '{value} no es {target}: seguimos.',
      fr: '{value} n’est pas {target} — on continue.',
      hi: '{value} {target} नहीं है — आगे बढ़ें।',
      id: '{value} bukan {target} — lanjut.',
      pt: '{value} não é {target} — seguimos.',
    },
    'caption.found': {
      en: 'Found {target} at seat {index} — {count} cells looked at.',
      ko: '{target} 을 {index} 번 자리에서 찾았다 — {count} 칸을 봤다',
      ar: 'وجدنا {target} في الموضع {index} — بعد فحص {count} خانة.',
      es: 'Se encontró {target} en el puesto {index}: {count} casillas miradas.',
      fr: '{target} trouvé à la place {index} — {count} cases regardées.',
      hi: '{target} स्थान {index} पर मिला — {count} खाने देखे गए।',
      id: '{target} ditemukan di kursi {index} — {count} sel dilihat.',
      pt: '{target} encontrado no lugar {index} — {count} casas olhadas.',
    },
    'caption.notFound': {
      en: '{target} is not here — every one of the {count} cells had to be looked at.',
      ko: '{target} 은 없다 — {count} 칸을 하나도 빠짐없이 봐야 했다',
      ar: '{target} غير موجود — كان لا بد من فحص الخانات {count} كلها.',
      es: '{target} no está: hubo que mirar las {count} casillas, una por una.',
      fr: '{target} n’est pas là — il a fallu regarder chacune des {count} cases.',
      hi: '{target} यहाँ नहीं है — {count} में से हर खाना देखना पड़ा।',
      id: '{target} tidak ada — semua {count} sel harus dilihat satu per satu.',
      pt: '{target} não está aqui — foi preciso olhar cada uma das {count} casas.',
    },
    'caption.done': {
      en: '{searches} searches took {compares} comparisons in all.',
      ko: '훑기 {searches} 번에 견줌은 모두 {compares} 번이었다',
      ar: 'استغرقت {searches} عمليات بحث {compares} مقارنة إجمالًا.',
      es: '{searches} búsquedas costaron {compares} comparaciones en total.',
      fr: '{searches} recherches ont coûté {compares} comparaisons au total.',
      hi: '{searches} खोजों में कुल {compares} तुलनाएँ लगीं।',
      id: '{searches} pencarian memakan {compares} perbandingan seluruhnya.',
      pt: '{searches} buscas custaram {compares} comparações ao todo.',
    },
  },
};
