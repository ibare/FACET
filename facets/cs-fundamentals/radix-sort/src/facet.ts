/**
 * 기수 정렬 (LSD) 완결형 선언.
 *
 * 블록은 셋뿐이다 — `stage` · `controls` · `codePanel`. 제목 블록을 두지 않는다
 * (이름은 카탈로그 카드와 글의 문단이 준다). 미리보기 · 스냅샷 · 패스 표시는
 * 빌트인 view 를 빌리지 않고 stage 가 직접 그린다.
 *
 * 이 facet 의 산출물은 그림이 아니라 **코드** 다. `ir:radixsort-lsd` 하나가
 * 여섯 언어로 펼쳐지고, 재생 중인 phase 가 그 줄을 짚는다. `'//'` 가 파이썬에서
 * `//`, 자바·C++·C# 에서 `/`, 자바스크립트·타입스크립트에서 `Math.floor(...)`
 * 로 갈리는 것이 이 알고리즘에서 실제로 보이는 자리다.
 *
 * `compare-count` 는 선언만 하고 알고리즘이 갱신하지 않는다 — 값끼리 견주는
 * 일이 한 번도 없다는 것이 이 알고리즘의 요점이라, 0 이 화면에 떠 있어야 한다.
 *
 * 식별자 (C1): `index:<i>`.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const radixSortFacet: FacetJson = {
  id: 'facet:radixSort',
  // 제목은 카탈로그 카드의 이름과 같다 (C4 명명 규칙 5).
  title: {
    en: 'Radix Sort',
    ko: '기수 정렬',
    ar: 'الترتيب الجذري',
    es: 'Ordenamiento radix',
    fr: 'Tri par base',
    hi: 'रेडिक्स सॉर्ट',
    id: 'Pengurutan radix',
    pt: 'Ordenação radix',
  },
  description: {
    en: 'Line them up by one digit at a time — never comparing two values.',
    ko: '한 자리씩만 보고 줄을 세운다 — 값끼리 견주는 일이 없다',
    ar: 'رتّبها رقمًا واحدًا في كل جولة — دون أي مقارنة بين قيمتين.',
    es: 'Ordena mirando un solo dígito por vuelta, sin comparar dos valores nunca.',
    fr: 'Aligne-les un chiffre à la fois — sans jamais comparer deux valeurs.',
    hi: 'हर बार सिर्फ़ एक अंक देखकर कतार बनाएँ — दो मानों की तुलना किए बिना।',
    id: 'Urutkan dengan melihat satu digit tiap putaran — tanpa pernah membandingkan dua nilai.',
    pt: 'Alinhe-os um dígito por vez — sem nunca comparar dois valores.',
  },
  algorithm: 'module:radixSort',
  projector: 'module:radixSortProjector',
  // 사양이 정한 자료. 세 자리 수와 한 자리 수가 섞여 있어야 라운드가 셋이 되고,
  // 10의 자리에서 802 와 2 가 앞뒤를 지키는 대목(둘 다 0)이 나온다 — 안정성이
  // 실제로 쓰이는 자리다. 섞으면 그것이 사라진다.
  initialData: { type: 'array', values: [170, 45, 75, 90, 802, 24, 2, 66] },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    stage: { type: 'radix-sort-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        {
          name: 'round-count',
          label: {
            en: 'Rounds',
            ko: '라운드',
            ar: 'جولات',
            es: 'Vueltas',
            fr: 'Tours',
            hi: 'दौर',
            id: 'Putaran',
            pt: 'Rodadas',
          },
          initial: 0,
        },
        {
          name: 'place-count',
          label: {
            en: 'Placements',
            ko: '놓기',
            ar: 'إيداعات',
            es: 'Colocaciones',
            fr: 'Placements',
            hi: 'स्थापन',
            id: 'Penempatan',
            pt: 'Colocações',
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
      ir: 'ir:radixsort-lsd',
    },
  },
  messages: {
    'caption.start': {
      en: 'One digit at a time, starting from the lowest place.',
      ko: '한 자리씩만 본다. 낮은 자리부터',
      ar: 'رقم واحد في كل مرة، بدءًا من أدنى منزلة.',
      es: 'Un dígito por vez, empezando por la posición más baja.',
      fr: 'Un chiffre à la fois, en partant du rang le plus bas.',
      hi: 'एक बार में एक अंक, सबसे नीचे के स्थान से शुरू।',
      id: 'Satu digit tiap kali, mulai dari tempat terendah.',
      pt: 'Um dígito por vez, começando pela casa mais baixa.',
    },
    'caption.scanMax': {
      en: 'The largest value is {max} — it decides how many places to visit.',
      ko: '가장 큰 수가 {max} 다 — 자리를 몇 번 볼지가 여기서 정해진다',
      ar: 'أكبر قيمة هي {max} — وهي تحدد عدد المنازل التي سنمر بها.',
      es: 'El valor mayor es {max}: él decide cuántas posiciones hay que recorrer.',
      fr: 'La plus grande valeur est {max} — elle décide du nombre de rangs à parcourir.',
      hi: 'सबसे बड़ा मान {max} है — यही तय करता है कि कितने स्थान देखने हैं।',
      id: 'Nilai terbesar adalah {max} — itulah yang menentukan berapa tempat yang dilalui.',
      pt: 'O maior valor é {max} — é ele que decide quantas casas percorrer.',
    },
    'caption.round': {
      en: 'Round {round} — line them up by the place worth {exp}.',
      ko: '{round} 번째 라운드 — {exp} 자리로 줄을 세운다',
      ar: 'الجولة {round} — رتّبها حسب المنزلة التي تساوي {exp}.',
      es: 'Vuelta {round}: alinéalos por la posición que vale {exp}.',
      fr: 'Tour {round} — aligne-les selon le rang valant {exp}.',
      hi: 'दौर {round} — {exp} वाले स्थान से कतार बनाएँ।',
      id: 'Putaran {round} — urutkan berdasarkan tempat senilai {exp}.',
      pt: 'Rodada {round} — alinhe-os pela casa que vale {exp}.',
    },
    'caption.read': {
      en: 'The place-{exp} digit of {value} is {digit}.',
      ko: '{value} 의 {exp} 자리 숫자는 {digit}',
      ar: 'رقم المنزلة {exp} في {value} هو {digit}.',
      es: 'El dígito de la posición {exp} de {value} es {digit}.',
      fr: 'Le chiffre de rang {exp} de {value} est {digit}.',
      hi: '{value} के {exp} स्थान का अंक {digit} है।',
      id: 'Digit tempat {exp} dari {value} adalah {digit}.',
      pt: 'O dígito da casa {exp} de {value} é {digit}.',
    },
    'caption.count': {
      en: 'Bucket {digit} now holds {count}.',
      ko: '{digit} 번 통이 이제 {count} 개다',
      ar: 'السلة {digit} تحتوي الآن على {count}.',
      es: 'El cubo {digit} ya tiene {count}.',
      fr: 'Le seau {digit} en contient maintenant {count}.',
      hi: 'डिब्बा {digit} में अब {count} हैं।',
      id: 'Ember {digit} kini berisi {count}.',
      pt: 'O balde {digit} agora tem {count}.',
    },
    'caption.prefix': {
      en: 'Bucket {digit} takes {added} from its left neighbour — {value} values sit at digit {digit} or below.',
      ko: '{digit} 번 통이 왼쪽 이웃에게서 {added} 를 받는다 — {digit} 이하인 수가 {value} 개라는 뜻이다',
      ar: 'السلة {digit} تأخذ {added} من جارتها اليسرى — أي أن {value} قيمة تقع عند الرقم {digit} أو دونه.',
      es: 'El cubo {digit} toma {added} de su vecino izquierdo: hay {value} valores con dígito {digit} o menor.',
      fr: 'Le seau {digit} prend {added} à son voisin de gauche — {value} valeurs ont un chiffre inférieur ou égal à {digit}.',
      hi: 'डिब्बा {digit} अपने बाएँ पड़ोसी से {added} लेता है — अंक {digit} या उससे कम वाले {value} मान हैं।',
      id: 'Ember {digit} mengambil {added} dari tetangga kirinya — ada {value} nilai dengan digit {digit} atau kurang.',
      pt: 'O balde {digit} toma {added} do vizinho à esquerda — há {value} valores com dígito {digit} ou menor.',
    },
    'caption.place': {
      en: 'Read from the back: bucket {digit} drops to {slot}, so {value} takes seat {slot}.',
      ko: '뒤에서부터 읽는다 — {digit} 번 통이 {slot} 로 줄고, 그 자리에 {value} 가 앉는다',
      ar: 'نقرأ من الخلف: السلة {digit} تنزل إلى {slot}، فيأخذ {value} المقعد {slot}.',
      es: 'Se lee desde atrás: el cubo {digit} baja a {slot}, así que {value} ocupa el puesto {slot}.',
      fr: 'On lit depuis la fin : le seau {digit} descend à {slot}, donc {value} prend la place {slot}.',
      hi: 'पीछे से पढ़ते हैं: डिब्बा {digit} घटकर {slot} हो जाता है, इसलिए {value} स्थान {slot} पर बैठता है।',
      id: 'Dibaca dari belakang: ember {digit} turun ke {slot}, jadi {value} menempati kursi {slot}.',
      pt: 'Lendo de trás para a frente: o balde {digit} cai para {slot}, então {value} ocupa o lugar {slot}.',
    },
    'caption.roundEnd': {
      en: 'Place {exp} is settled. Round {round} kept the earlier order untouched.',
      ko: '{exp} 자리가 끝났다. {round} 번째 라운드는 앞선 순서를 건드리지 않았다',
      ar: 'انتهت المنزلة {exp}. الجولة {round} لم تمسّ الترتيب السابق.',
      es: 'La posición {exp} queda resuelta. La vuelta {round} no alteró el orden anterior.',
      fr: 'Le rang {exp} est réglé. Le tour {round} n\'a pas touché à l\'ordre précédent.',
      hi: '{exp} स्थान तय हो गया। दौर {round} ने पिछले क्रम को नहीं बिगाड़ा।',
      id: 'Tempat {exp} selesai. Putaran {round} tidak mengusik urutan sebelumnya.',
      pt: 'A casa {exp} está resolvida. A rodada {round} não mexeu na ordem anterior.',
    },
    'caption.done': {
      en: 'Sorted in {rounds} rounds and {places} placements — without comparing two values even once.',
      ko: '{rounds} 라운드, {places} 번 놓기로 정렬됐다 — 값끼리 견준 적은 한 번도 없다',
      ar: 'تم الترتيب في {rounds} جولات و {places} إيداعًا — دون مقارنة قيمتين ولو مرة واحدة.',
      es: 'Ordenado en {rounds} vueltas y {places} colocaciones, sin comparar dos valores ni una vez.',
      fr: 'Trié en {rounds} tours et {places} placements — sans comparer deux valeurs une seule fois.',
      hi: '{rounds} दौर और {places} स्थापन में क्रम बन गया — दो मानों की तुलना एक बार भी नहीं।',
      id: 'Terurut dalam {rounds} putaran dan {places} penempatan — tanpa sekali pun membandingkan dua nilai.',
      pt: 'Ordenado em {rounds} rodadas e {places} colocações — sem comparar dois valores nem uma vez.',
    },
  },
};
