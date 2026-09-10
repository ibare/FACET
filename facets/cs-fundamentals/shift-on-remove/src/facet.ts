/**
 * @piece 삭제 이동 — 가운데를 빼면 뒤가 당겨진다.
 *
 * 조각(piece) facet. 한 주장만 말하고 멈춘다 (S-piece).
 *   - 제목 블록 없음 — 제목은 글의 문단이 준다.
 *   - 메트릭 없음 — 셀 것이 없다.
 *   - 컨트롤은 다시 보기와 한 걸음 둘뿐이며, 둘 다 눌러야 완성되는 조작이 아니다.
 *     아무것도 누르지 않아도 화면은 스스로 재생해 할 말을 마친다.
 *
 * 실측 전제 — values / removeIndex 가 화면의 모든 수의 출처다.
 *   [10, 20, 30, 40, 50] 에서 인덱스 1(값 20) 을 빼면
 *   30 → 1번, 40 → 2번, 50 → 3번 으로 앞에서부터 세 번 옮겨지고
 *   결과는 [10, 30, 40, 50], 쓰는 칸은 4개, 4번 칸은 더 쓰이지 않는다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const shiftOnRemoveFacet: FacetJson = {
  id: 'facet:shiftOnRemove',
  title: {
    en: 'Shift on remove',
    ko: '삭제 이동',
    ja: '削除でずれる',
    zh: '删除后前移',
    ar: 'الإزاحة عند الحذف',
    es: 'Desplazar al borrar',
    fr: 'Décalage à la suppression',
    hi: 'हटाने पर खिसकाव',
    id: 'Geser saat menghapus',
    pt: 'Deslocar ao remover',
  },
  description: {
    en: 'Take one out of the middle and everything behind it is pulled left.',
    ko: '가운데를 빼면 뒤가 당겨진다.',
    ja: '真ん中を一つ抜くと、後ろのものが左へ引き寄せられる。',
    zh: '从中间抽走一个，后面的全都往左拉。',
    ar: 'انزع واحدًا من الوسط، فيُسحب كل ما خلفه إلى اليسار.',
    es: 'Saca uno del medio y todo lo que hay detrás se corre a la izquierda.',
    fr: 'Retirez un élément du milieu et tout ce qui suit est tiré vers la gauche.',
    hi: 'बीच से एक निकालो और उसके पीछे का सब बाईं ओर खिंच आता है।',
    id: 'Ambil satu dari tengah, maka semua di belakangnya tertarik ke kiri.',
    pt: 'Tire um do meio e tudo o que está atrás é puxado para a esquerda.',
  },
  algorithm: 'module:shiftOnRemove',
  projector: 'module:shiftOnRemoveProjector',
  initialData: {
    type: 'shift-on-remove',
    values: [10, 20, 30, 40, 50],
    removeIndex: 1,
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'shift-on-remove-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.intact': {
      en: 'An array holds its values in a row with no gaps.',
      ko: '배열은 값을 빈틈없이 한 줄로 둔다.',
      ja: '配列は値を隙間なく一列に置く。',
      zh: '数组把值一个挨一个排成一行，没有空隙。',
      ar: 'تحفظ المصفوفة قيمها في صفّ واحد بلا فجوات.',
      es: 'Un arreglo guarda sus valores en fila y sin huecos.',
      fr: 'Un tableau garde ses valeurs en ligne, sans trou.',
      hi: 'सरणी अपने मानों को बिना अंतराल एक पंक्ति में रखती है।',
      id: 'Larik menyimpan nilainya berderet tanpa celah.',
      pt: 'Um arranjo guarda os seus valores em fila, sem falhas.',
    },
    'caption.remove': {
      en: 'Remove index {index}. That slot is now empty.',
      ko: '인덱스 {index} 자리를 뺀다. 그 칸이 빈다.',
      ja: '添字 {index} を抜く。その枠が空く。',
      zh: '删掉下标 {index}。那一格空了。',
      ar: 'احذف الموضع {index}. صارت تلك الخانة فارغة.',
      es: 'Se quita el índice {index}. Esa casilla queda vacía.',
      fr: "On retire l'indice {index}. Cette case est maintenant vide.",
      hi: 'सूचकांक {index} हटाएँ। वह खाना अब खाली है।',
      id: 'Hapus indeks {index}. Kotak itu kini kosong.',
      pt: 'Remove-se o índice {index}. Essa casa fica vazia.',
    },
    'caption.pull': {
      en: 'Pull from the front, or a value would be overwritten.',
      ko: '빈 칸 바로 뒤부터 당긴다. 뒤에서 시작하면 값이 덮인다.',
      ja: '空いた枠のすぐ後ろから引く。後ろから始めると値が上書きされる。',
      zh: '要从空格紧后面开始拉；从后面起头会把值覆盖掉。',
      ar: 'اسحب من المقدّمة، وإلا كُتب فوق قيمة.',
      es: 'Hay que tirar desde delante; si no, se sobrescribiría un valor.',
      fr: "On tire depuis l'avant, sinon une valeur serait écrasée.",
      hi: 'आगे से खींचें, वरना कोई मान ऊपर लिखा जाएगा।',
      id: 'Tarik dari depan, kalau tidak ada nilai yang tertimpa.',
      pt: 'Puxa-se a partir da frente, senão um valor seria sobrescrito.',
    },
    'caption.result': {
      en: '{moved} values shifted one slot left. The tail slot is no longer used.',
      ko: '값 {moved}개가 한 칸씩 당겨졌다. 끝 칸은 더 쓰이지 않는다.',
      ja: '値 {moved} 個が一枠ずつ左へずれた。末尾の枠はもう使わない。',
      zh: '{moved} 个值各左移一格。末尾那格不再使用。',
      ar: 'انزاحت {moved} قيم خانة واحدة إلى اليسار. الخانة الأخيرة لم تعد مستعملة.',
      es: '{moved} valores se corrieron una casilla a la izquierda. La casilla final ya no se usa.',
      fr: "{moved} valeurs ont glissé d'une case vers la gauche. La dernière case ne sert plus.",
      hi: '{moved} मान एक-एक खाना बाईं ओर खिसके। आख़िरी खाना अब काम नहीं आता।',
      id: '{moved} nilai bergeser satu kotak ke kiri. Kotak terakhir tak dipakai lagi.',
      pt: '{moved} valores deslocaram-se uma casa para a esquerda. A última casa já não é usada.',
    },
    'label.used': {
      en: 'in use: {n}',
      ko: '쓰는 칸 {n}',
      ja: '使用中: {n}',
      zh: '使用中：{n}',
      ar: 'قيد الاستعمال: {n}',
      es: 'en uso: {n}',
      fr: 'utilisées : {n}',
      hi: 'उपयोग में: {n}',
      id: 'terpakai: {n}',
      pt: 'em uso: {n}',
    },
    'label.unused': {
      en: 'unused',
      ko: '안 씀',
      ja: '未使用',
      zh: '未使用',
      ar: 'غير مستعملة',
      es: 'sin usar',
      fr: 'inutilisée',
      hi: 'अप्रयुक्त',
      id: 'tak terpakai',
      pt: 'sem uso',
    },
  },
};
