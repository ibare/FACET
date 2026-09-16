/**
 * @piece 패턴을 텍스트에서 찾는 가장 단순한 방법.
 *
 * 답하는 질문 하나 — 어긋났을 때 여태 맞힌 것을 통째로 버리고 한 칸만 미는 것이
 * 얼마나 아까운가.
 *
 * 데이터는 실측이다. 텍스트 `abababcabab` 에서 패턴 `ababc` 를 찾으면 자리 일곱
 * 곳을 밀며 열일곱 번 견주고, 자리 2 하나에서 찾는다. 자리 0 에서 네 글자나
 * 맞고 다섯째에서 어긋나는 것이 이 조각의 뼈대라 텍스트를 바꾸면 논증이 사라진다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const naiveShiftByOneFacet: FacetJson = {
  id: 'facet:naiveShiftByOne',
  title: {
    en: 'Shifting the pattern one place at a time',
    ko: '패턴을 한 칸씩 밀어 보기',
    ja: 'パターンを1文字ずつずらす',
    zh: '把模式串逐位右移',
    ar: 'إزاحة النمط موضعًا واحدًا في كل مرة',
    es: 'Desplazar el patrón una posición cada vez',
    fr: 'Décaler le motif une position à la fois',
    hi: 'पैटर्न को एक-एक स्थान खिसकाना',
    id: 'Menggeser pola satu posisi setiap kali',
    pt: 'Deslocar o padrão uma posição de cada vez',
  },
  description: {
    en: 'Compare from the front; on a mismatch, throw away every match found so far and slide the pattern one place.',
    ko: '앞에서부터 견주다 어긋나면, 여태 맞힌 것을 모두 버리고 패턴을 한 칸 민다.',
    ja: '先頭から比べ、食い違ったらそれまでに一致した分をすべて捨ててパターンを1つずらす。',
    zh: '从头逐字比较；一旦不匹配，就丢弃已经匹配的部分，把模式串右移一位。',
    ar: 'قارن من البداية، وعند أول اختلاف اطرح كل ما طابق حتى الآن وأزح النمط موضعًا واحدًا.',
    es: 'Compara desde el principio; ante un desajuste, descarta todo lo emparejado y desplaza el patrón una posición.',
    fr: "Comparer depuis le début ; en cas de différence, jeter tout ce qui correspondait et décaler le motif d'une position.",
    hi: 'शुरू से मिलान करें; बेमेल मिलते ही अब तक का सारा मिलान छोड़कर पैटर्न को एक स्थान खिसकाएँ।',
    id: 'Bandingkan dari depan; begitu tidak cocok, buang semua yang sudah cocok dan geser pola satu posisi.',
    pt: 'Compare desde o início; ao primeiro desencontro, descarte tudo o que já combinou e desloque o padrão uma posição.',
  },
  algorithm: 'module:naiveShiftByOne',
  scene: 'module:naiveShiftByOneScene',
  initialData: {
    type: 'naive-shift-by-one',
    text: 'abababcabab',
    pattern: 'ababc',
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'naive-shift-by-one-stage' },
    controls: {
      type: 'control-bar',
      // 스크럽 띠. 장면 방식이라 어느 걸음이든 셈으로 얻으므로 끌어 볼 수 있다.
      controls: CONTROL_SET.pieceScrub,
    },
  },
  messages: {
    'caption.align': {
      en: 'Line up and compare from the front. Position: {shift}.',
      ko: '놓고 앞에서부터 견준다. 지금 자리: {shift}.',
      ja: '置いて先頭から比べる。今の位置: {shift}.',
      zh: '对齐后从头比较。当前位置: {shift}.',
      ar: 'حاذِ النمط وقارن من البداية. الموضع: {shift}.',
      es: 'Alinea y compara desde el principio. Posición: {shift}.',
      fr: 'Aligner et comparer depuis le début. Position : {shift}.',
      hi: 'रखकर शुरू से मिलान करें। वर्तमान स्थान: {shift}.',
      id: 'Sejajarkan lalu bandingkan dari depan. Posisi: {shift}.',
      pt: 'Alinhe e compare desde o início. Posição: {shift}.',
    },
    'caption.retreat': {
      en: 'A mismatch. Throw away everything matched so far and slide by one. Matched: {matched}.',
      ko: '어긋났다. 여태 맞힌 것을 버리고 한 칸만 민다. 맞힌 글자: {matched}.',
      ja: '食い違った。ここまで一致した分を捨てて1つだけずらす。一致した文字: {matched}.',
      zh: '不匹配。丢弃已经匹配的部分，只右移一位。已匹配字符: {matched}.',
      ar: 'اختلاف. اطرح كل ما طابق حتى الآن وأزح موضعًا واحدًا فقط. المطابق: {matched}.',
      es: 'Desajuste. Descarta todo lo emparejado y desplaza solo una posición. Emparejados: {matched}.',
      fr: "Différence. Jeter tout ce qui correspondait et ne décaler que d'une position. Correspondances : {matched}.",
      hi: 'बेमेल। अब तक का सारा मिलान छोड़कर केवल एक स्थान खिसकाएँ। मिले अक्षर: {matched}.',
      id: 'Tidak cocok. Buang semua yang sudah cocok dan geser hanya satu posisi. Cocok: {matched}.',
      pt: 'Desencontro. Descarte tudo o que já combinou e desloque apenas uma posição. Combinados: {matched}.',
    },
    'caption.retreatNone': {
      en: 'The very first letter is a mismatch. Slide by one.',
      ko: '첫 글자부터 어긋난다. 한 칸 민다.',
      ja: '最初の1文字から食い違う。1つずらす。',
      zh: '第一个字符就不匹配。右移一位。',
      ar: 'الحرف الأول نفسه مختلف. أزح موضعًا واحدًا.',
      es: 'La primera letra ya no coincide. Desplaza una posición.',
      fr: "La toute première lettre diffère. Décaler d'une position.",
      hi: 'पहला अक्षर ही बेमेल है। एक स्थान खिसकाएँ।',
      id: 'Huruf pertama saja sudah tidak cocok. Geser satu posisi.',
      pt: 'A primeira letra já não combina. Desloque uma posição.',
    },
    'caption.found': {
      en: 'The whole pattern matched. Found at: {shift}.',
      ko: '패턴이 모두 맞았다. 찾은 자리: {shift}.',
      ja: 'パターンがすべて一致した。見つけた位置: {shift}.',
      zh: '整个模式串都匹配。找到的位置: {shift}.',
      ar: 'طابق النمط كله. موضع العثور: {shift}.',
      es: 'El patrón completo coincide. Encontrado en: {shift}.',
      fr: 'Le motif entier correspond. Trouvé à : {shift}.',
      hi: 'पूरा पैटर्न मिल गया। मिला स्थान: {shift}.',
      id: 'Seluruh pola cocok. Ditemukan di: {shift}.',
      pt: 'O padrão inteiro combina. Encontrado em: {shift}.',
    },
    'caption.done': {
      en: 'No positions left to slide to. Comparisons: {comparisons}.',
      ko: '더 밀 자리가 없다. 견준 횟수: {comparisons}.',
      ja: 'もうずらす位置がない。比べた回数: {comparisons}.',
      zh: '没有可以再移的位置了。比较次数: {comparisons}.',
      ar: 'لم يبقَ موضع للإزاحة. عدد المقارنات: {comparisons}.',
      es: 'No quedan posiciones a las que desplazarse. Comparaciones: {comparisons}.',
      fr: 'Il ne reste plus aucune position. Comparaisons : {comparisons}.',
      hi: 'अब खिसकाने के लिए कोई स्थान नहीं। तुलनाएँ: {comparisons}.',
      id: 'Tidak ada posisi tersisa untuk digeser. Perbandingan: {comparisons}.',
      pt: 'Não restam posições para deslocar. Comparações: {comparisons}.',
    },
  },
};
