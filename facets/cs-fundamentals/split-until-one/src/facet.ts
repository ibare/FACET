/**
 * @piece 분할 — 더 쪼갤 수 없을 때까지 반으로 가른다.
 *
 * 답하는 질문 하나: **쪼개는 동안 무엇이 바뀌는가.**
 * 바뀌는 것은 묶음의 경계뿐이다. 값은 한 칸도 움직이지 않고, 좌우 순서는
 * 처음과 끝이 같으며, 견줌은 한 번도 일어나지 않는다. 그리고 낱개가 되면
 * 멈춘다 — 낱개 하나는 그 자체로 이미 줄이 서 있기 때문이다.
 *
 * header (title-block) 도 metrics 도 두지 않는다. 제목은 글의 문단이 주고,
 * 조각은 셀 것이 없다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const splitUntilOneFacet: FacetJson = {
  id: 'facet:splitUntilOne',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Splitting',
    ko: '분할',
    ja: '分割',
    zh: '分割',
    ar: 'التقسيم',
    es: 'División',
    fr: 'Division',
    hi: 'विभाजन',
    id: 'Pembagian',
    pt: 'Divisão',
  },
  description: {
    en: 'Halving a range over and over changes nothing but the group boundaries.',
    ko: '구간을 거듭 반으로 가르는 동안 바뀌는 것은 묶음의 경계뿐이다.',
    ja: '区間を半分に割り続けても、変わるのは束の境界だけだ。',
    zh: '把区间一再对半分开，变的只有分组的边界。',
    ar: 'تقسيم المدى إلى نصفين مرارًا لا يغيّر سوى حدود المجموعات.',
    es: 'Partir un rango en dos una y otra vez solo cambia los límites de los grupos.',
    fr: 'Couper un intervalle en deux encore et encore ne change que les frontières des groupes.',
    hi: 'किसी परास को बार-बार आधा करने से समूहों की सीमाओं के सिवा कुछ नहीं बदलता।',
    id: 'Membelah rentang berulang kali hanya mengubah batas kelompok.',
    pt: 'Partir um intervalo ao meio vezes sem conta só muda as fronteiras dos grupos.',
  },
  algorithm: 'module:splitUntilOne',
  projector: 'module:splitUntilOneProjector',
  initialData: {
    type: 'split-until-one',
    values: [6, 2, 8, 4],
    /** 걸음 간격. 화면의 갈라짐 애니메이션이 이 위에 더해진다 (S-piece). */
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'split-until-one-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.whole': {
      en: 'All {n} values sit in one group. Nothing has been compared.',
      ko: '값 {n}개가 한 묶음에 있다. 아직 아무것도 견주지 않았다.',
      ja: '{n} 個の値がひとつの束にある。まだ何も比べていない。',
      zh: '{n} 个值同在一组。还没有比较过任何一对。',
      ar: 'كل القيم الـ{n} في مجموعة واحدة. لم تُقارَن أي منها بعد.',
      es: 'Los {n} valores están en un solo grupo. Todavía no se ha comparado nada.',
      fr: "Les {n} valeurs sont dans un seul groupe. Rien n'a encore été comparé.",
      hi: 'सभी {n} मान एक ही समूह में हैं। अभी कोई तुलना नहीं हुई।',
      id: 'Semua {n} nilai berada dalam satu kelompok. Belum ada yang dibandingkan.',
      pt: 'Os {n} valores estão num só grupo. Nada foi comparado ainda.',
    },
    'caption.split': {
      en: 'The group is cut in half. No value moves — only a boundary.',
      ko: '묶음이 반으로 갈린다. 값은 움직이지 않고 경계만 생긴다.',
      ja: '束が半分に割れる。値は動かず、境界だけができる。',
      zh: '这一组被对半切开。值没有移动 — 只多了一条边界。',
      ar: 'تُقسم المجموعة نصفين. لا تتحرك أي قيمة — يظهر حدّ فقط.',
      es: 'El grupo se corta por la mitad. Ningún valor se mueve: solo aparece un límite.',
      fr: 'Le groupe est coupé en deux. Aucune valeur ne bouge — seule une frontière apparaît.',
      hi: 'समूह आधा कट जाता है। कोई मान हिलता नहीं — बस एक सीमा बनती है।',
      id: 'Kelompok terbelah dua. Tak ada nilai yang berpindah — hanya muncul batas.',
      pt: 'O grupo é cortado ao meio. Nenhum valor se move — surge apenas uma fronteira.',
    },
    'caption.splitAgain': {
      en: 'Each half is cut again. The left-to-right order still holds.',
      ko: '갈라진 것이 또 갈라진다. 좌우 순서는 그대로다.',
      ja: '割れたものがまた割れる。左右の順は変わらない。',
      zh: '每一半再次切开。从左到右的顺序依旧。',
      ar: 'يُقسم كل نصف مرة أخرى. ويبقى ترتيب القيم كما هو.',
      es: 'Cada mitad se vuelve a cortar. El orden de izquierda a derecha se mantiene.',
      fr: "Chaque moitié est coupée à nouveau. L'ordre de gauche à droite tient toujours.",
      hi: 'हर आधा फिर से कटता है। बाएँ से दाएँ क्रम वैसा ही रहता है।',
      id: 'Tiap belahan dibelah lagi. Urutan kiri-ke-kanan tetap sama.',
      pt: 'Cada metade é cortada de novo. A ordem da esquerda para a direita mantém-se.',
    },
    'caption.leaves': {
      en: 'Each group holds one value — already in order, nothing left to cut.',
      ko: '모든 묶음이 낱개다. 낱개 하나는 이미 줄이 서 있으니 가를 것이 없다.',
      ja: 'どの束も値ひとつ — ひとつならもう並んでいて、割るものがない。',
      zh: '每组只剩一个值 — 单个本就有序，再没什么可切。',
      ar: 'كل مجموعة تحوي قيمة واحدة — مرتّبة أصلًا، ولم يبقَ ما يُقسم.',
      es: 'Cada grupo tiene un solo valor: ya está ordenado, no queda nada que cortar.',
      fr: "Chaque groupe ne contient qu'une valeur — déjà en ordre, plus rien à couper.",
      hi: 'हर समूह में एक ही मान — वह पहले से क्रम में है, अब काटने को कुछ नहीं।',
      id: 'Tiap kelompok berisi satu nilai — sudah urut, tak ada lagi yang dibelah.',
      pt: 'Cada grupo tem um só valor — já está ordenado, não resta nada para cortar.',
    },
  },
};
