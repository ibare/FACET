/**
 * merge-sort 완결형 선언.
 *
 * 블록은 셋뿐이다 — stage · controls · codePanel. 제목 블록을 두지 않는다
 * (이름은 카탈로그 카드와 글의 문단이 준다). 미리보기·스냅샷 같은 곁가지도
 * 두지 않는다. 조각 셋(`splitUntilOne` · `mergeTwoSorted` · `inPlaceVsExtra`)
 * 이 쪼갬 · 한 번의 병합 · 빌린 자리를 각각 이미 그렸으므로, 완결형은 그것을
 * 되풀이하지 말고 알고리즘 전체가 굴러가는 것만 보인다.
 *
 * `shuffleOnReset` 은 끈다. 이 데이터로 재귀가 세 겹까지 내려가고 견줌 14 ·
 * 옮김 20 이 나오는 것이 글에서 짚는 수라, 매번 다른 배치가 되면 글과 화면이
 * 어긋난다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const mergeSortFacet: FacetJson = {
  id: 'facet:mergeSort',
  title: {
    en: 'Merge Sort',
    ko: '머지 정렬',
    ar: 'الترتيب بالدمج',
    es: 'Ordenamiento por mezcla',
    fr: 'Tri fusion',
    hi: 'मर्ज सॉर्ट',
    id: 'Pengurutan gabung',
    pt: 'Ordenação por mesclagem',
  },
  description: {
    en: 'Split down to single items, then merge back up by looking only at the two fronts.',
    ko: '낱개가 될 때까지 쪼갠 뒤, 양쪽 맨 앞만 보며 되짚어 오르며 합친다',
    ar: 'قسّم حتى العناصر المفردة، ثم ادمج صعودًا بالنظر إلى المقدمتين فقط.',
    es: 'Divide hasta elementos sueltos y luego mezcla hacia arriba mirando solo los dos frentes.',
    fr: 'Découpez jusqu\'aux éléments seuls, puis fusionnez en remontant en ne regardant que les deux têtes.',
    hi: 'एकल तत्वों तक बाँटें, फिर केवल दोनों अग्रभागों को देखकर ऊपर की ओर मिलाएँ।',
    id: 'Pecah sampai satuan, lalu gabungkan ke atas dengan hanya melihat dua ujung depan.',
    pt: 'Divida até itens isolados e depois mescle de volta olhando apenas as duas frentes.',
  },
  algorithm: 'module:mergeSort',
  projector: 'module:mergeSortProjector',
  initialData: { type: 'array', values: [38, 27, 43, 3, 9, 82, 10] },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  messages: {
    'caption.start': {
      en: 'Split all the way down, then merge back up.',
      ko: '끝까지 쪼갠 뒤, 되짚어 오르며 합친다',
      ar: 'قسّم حتى النهاية، ثم ادمج صعودًا.',
      es: 'Divide hasta el fondo y luego mezcla hacia arriba.',
      fr: 'Découpez jusqu\'en bas, puis fusionnez en remontant.',
      hi: 'पूरी तरह नीचे तक बाँटें, फिर ऊपर की ओर मिलाएँ।',
      id: 'Pecah sampai paling bawah, lalu gabungkan ke atas.',
      pt: 'Divida até o fundo e depois mescle de volta.',
    },
    'caption.split': {
      en: 'Cut [{lo}..{hi}] in two at {mid}.',
      ko: '[{lo}..{hi}] 를 {mid} 에서 둘로 가른다',
      ar: 'اقطع [{lo}..{hi}] إلى نصفين عند {mid}.',
      es: 'Corta [{lo}..{hi}] en dos en {mid}.',
      fr: 'Coupez [{lo}..{hi}] en deux à {mid}.',
      hi: '[{lo}..{hi}] को {mid} पर दो भागों में काटें।',
      id: 'Potong [{lo}..{hi}] menjadi dua di {mid}.',
      pt: 'Corte [{lo}..{hi}] em dois em {mid}.',
    },
    'caption.goLeft': {
      en: 'Go down the left half first.',
      ko: '왼쪽 반부터 내려간다',
      ar: 'انزل إلى النصف الأيسر أولًا.',
      es: 'Baja primero por la mitad izquierda.',
      fr: 'Descendez d\'abord dans la moitié gauche.',
      hi: 'पहले बाएँ आधे भाग में नीचे जाएँ।',
      id: 'Turuni paruh kiri lebih dulu.',
      pt: 'Desça primeiro pela metade esquerda.',
    },
    'caption.goRight': {
      en: 'The left half is done — now the right.',
      ko: '왼쪽 반을 마쳤다 — 이제 오른쪽',
      ar: 'انتهى النصف الأيسر — والآن الأيمن.',
      es: 'La mitad izquierda está lista; ahora la derecha.',
      fr: 'La moitié gauche est faite — maintenant la droite.',
      hi: 'बायाँ आधा पूरा हुआ — अब दायाँ।',
      id: 'Paruh kiri selesai — sekarang yang kanan.',
      pt: 'A metade esquerda terminou — agora a direita.',
    },
    'caption.base': {
      en: 'One item on its own is already sorted.',
      ko: '홀로 남은 하나는 이미 정렬돼 있다',
      ar: 'عنصر واحد بمفرده مرتَّب أصلًا.',
      es: 'Un solo elemento ya está ordenado.',
      fr: 'Un élément seul est déjà trié.',
      hi: 'अकेला एक तत्व पहले से क्रमित है।',
      id: 'Satu item sendirian sudah terurut.',
      pt: 'Um item sozinho já está ordenado.',
    },
    'caption.merge': {
      en: 'Both halves are sorted — merge [{lo}..{hi}].',
      ko: '양쪽 반이 모두 정렬됐다 — [{lo}..{hi}] 를 합친다',
      ar: 'النصفان مرتَّبان — ادمج [{lo}..{hi}].',
      es: 'Ambas mitades están ordenadas: mezcla [{lo}..{hi}].',
      fr: 'Les deux moitiés sont triées — fusionnez [{lo}..{hi}].',
      hi: 'दोनों आधे क्रमित हैं — [{lo}..{hi}] को मिलाएँ।',
      id: 'Kedua paruh sudah terurut — gabungkan [{lo}..{hi}].',
      pt: 'As duas metades estão ordenadas — mescle [{lo}..{hi}].',
    },
    'caption.copy': {
      en: 'Both halves are copied aside — the room they borrow.',
      ko: '양쪽 반을 옆에 베껴 둔다 — 이것이 빌리는 자리다',
      ar: 'يُنسخ النصفان جانبًا — هذا هو المكان المستعار.',
      es: 'Ambas mitades se copian aparte: ese es el espacio prestado.',
      fr: 'Les deux moitiés sont copiées à côté — c\'est la place empruntée.',
      hi: 'दोनों आधे अलग कॉपी होते हैं — यही उधार ली गई जगह है।',
      id: 'Kedua paruh disalin ke samping — inilah ruang yang dipinjam.',
      pt: 'As duas metades são copiadas à parte — é o espaço emprestado.',
    },
    'caption.compare': {
      en: 'Only the two fronts are compared.',
      ko: '견주는 것은 양쪽 맨 앞 둘뿐이다',
      ar: 'لا يُقارَن سوى المقدمتين.',
      es: 'Solo se comparan los dos frentes.',
      fr: 'Seules les deux têtes sont comparées.',
      hi: 'केवल दोनों अग्रभागों की तुलना होती है।',
      id: 'Hanya dua ujung depan yang dibandingkan.',
      pt: 'Apenas as duas frentes são comparadas.',
    },
    'caption.takeLeft': {
      en: '{v} wins from the left.',
      ko: '왼쪽의 {v} 가 앞선다',
      ar: '{v} يفوز من اليسار.',
      es: '{v} gana por la izquierda.',
      fr: '{v} l\'emporte à gauche.',
      hi: 'बाईं ओर से {v} आगे है।',
      id: '{v} menang dari kiri.',
      pt: '{v} vence pela esquerda.',
    },
    'caption.takeRight': {
      en: '{v} wins from the right.',
      ko: '오른쪽의 {v} 가 앞선다',
      ar: '{v} يفوز من اليمين.',
      es: '{v} gana por la derecha.',
      fr: '{v} l\'emporte à droite.',
      hi: 'दाईं ओर से {v} आगे है।',
      id: '{v} menang dari kanan.',
      pt: '{v} vence pela direita.',
    },
    'caption.drain': {
      en: 'One side is empty — {v} just slides over.',
      ko: '한쪽이 비었다 — {v} 는 그대로 넘어온다',
      ar: 'أحد الجانبين فارغ — {v} ينتقل كما هو.',
      es: 'Un lado está vacío: {v} simplemente pasa.',
      fr: 'Un côté est vide — {v} glisse simplement.',
      hi: 'एक ओर खाली है — {v} बस खिसक आता है।',
      id: 'Satu sisi kosong — {v} tinggal bergeser.',
      pt: 'Um lado está vazio — {v} apenas desliza.',
    },
    'caption.merged': {
      en: '[{lo}..{hi}] is one sorted run now.',
      ko: '[{lo}..{hi}] 가 정렬된 한 줄이 됐다',
      ar: 'صار [{lo}..{hi}] سلسلة مرتَّبة واحدة.',
      es: '[{lo}..{hi}] ya es una sola tira ordenada.',
      fr: '[{lo}..{hi}] forme désormais une seule suite triée.',
      hi: '[{lo}..{hi}] अब एक क्रमित शृंखला है।',
      id: '[{lo}..{hi}] kini satu deret terurut.',
      pt: '[{lo}..{hi}] agora é uma única sequência ordenada.',
    },
    'caption.done': {
      en: 'The topmost merge was the last one to run.',
      ko: '맨 위의 합침이 맨 마지막이었다',
      ar: 'الدمج الأعلى كان آخر ما جرى.',
      es: 'La mezcla más alta fue la última en ejecutarse.',
      fr: 'La fusion la plus haute a été la dernière.',
      hi: 'सबसे ऊपर का विलय सबसे अंत में चला।',
      id: 'Penggabungan paling atas adalah yang terakhir berjalan.',
      pt: 'A mesclagem mais alta foi a última a rodar.',
    },
  },
  blocks: {
    stage: { type: 'merge-sort-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        {
          name: 'compare-count',
          label: { en: 'Compares', ko: '견줌', ar: 'مقارنات', es: 'Comparaciones', fr: 'Comparaisons', hi: 'तुलनाएँ', id: 'Perbandingan', pt: 'Comparações' },
          initial: 0,
        },
        {
          name: 'move-count',
          label: { en: 'Moves', ko: '옮김', ar: 'نقلات', es: 'Movimientos', fr: 'Déplacements', hi: 'स्थानांतरण', id: 'Perpindahan', pt: 'Movimentos' },
          initial: 0,
        },
        {
          name: 'recurse-depth',
          label: { en: 'Depth', ko: '깊이', ar: 'العمق', es: 'Profundidad', fr: 'Profondeur', hi: 'गहराई', id: 'Kedalaman', pt: 'Profundidade' },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드', ar: 'الشيفرة', es: 'Código', fr: 'Code', hi: 'कोड', id: 'Kode', pt: 'Código' },
      ir: 'ir:mergesort-recursive',
    },
  },
};
