/**
 * ConflictMiss facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "빈 자리가 셋이나 있는데 왜 밀려나는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 선언이 주는 것은 **구조**뿐이다 — 줄 수 · 라인 크기 · 찾는 주소. 인덱스 ·
 * 태그 · 히트/미스 · 밀려난 태그 · 빈 줄의 수는 algorithm 이 그 자리에서 셈하고,
 * 어디에 무엇을 놓을지는 stage 가 캔버스에서 역산한다 (S-piece).
 *
 * 네 줄짜리 직접 사상 캐시에서 주소 0 과 64 는 둘 다 인덱스가 0 이다
 * (0÷16=0, 0 mod 4=0 / 64÷16=4, 4 mod 4=0). 번갈아 여섯 번 찾으면 여섯 번 다
 * 미스이고 히트는 0 인데, 그동안 줄 1·2·3 은 내내 비어 있다. 캐시의 4분의 3 이
 * 놀고 있는데도 밀려나는 것 — 자리가 모자라서가 아니라 갈 곳이 하나뿐이라서다.
 *
 * ReactiveMechanism 이라 mount 즉시 스스로 재생한다. 걸음 간격은 `stepMs` 가
 * 정한다 — 컨트롤바에 speed-slider 가 없어 늦출 수 없기 때문이다.
 *
 * `header` 를 두지 않는다 (제목은 글의 문단이 준다). `metrics` 도 두지 않는다.
 * `layout` 은 러너가 만든다.
 *
 * title / description / messages 는 열 언어를 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const conflictMissFacet: FacetJson = {
  id: 'facet:conflictMiss',
  title: {
    en: 'Conflict Miss',
    ko: '충돌 실패',
    ja: 'コンフリクトミス',
    zh: '冲突失效',
    ar: 'إخفاق التعارض',
    es: 'Fallo por conflicto',
    fr: 'Défaut de conflit',
    hi: 'संघर्ष मिस',
    id: 'Conflict miss',
    pt: 'Falha por conflito',
  },
  description: {
    en: 'Space is free, yet every block is pushed out',
    ko: '빈 자리가 있는데도 밀려난다',
    ja: '空きがあるのに追い出される',
    zh: '明明有空位，却被挤出去',
    ar: 'هناك مساحة فارغة ومع ذلك يُطرد كل مَدخل',
    es: 'Hay líneas libres y aun así cada bloque es expulsado',
    fr: 'Des lignes sont libres et pourtant chaque bloc est expulsé',
    hi: 'जगह खाली है, फिर भी हर ब्लॉक बाहर धकेल दिया जाता है',
    id: 'Masih ada tempat kosong, tetapi setiap blok tetap terdorong keluar',
    pt: 'Há linhas livres e mesmo assim cada bloco é expulso',
  },
  algorithm: 'module:conflictMiss',
  projector: 'module:conflictMissProjector',
  initialData: {
    type: 'conflict-miss',
    lineCount: 4,
    lineSize: 16,
    addresses: [0, 64, 0, 64, 0, 64],
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.fill': {
      en: 'This address can sit in only one line: {index}.',
      ko: '이 주소가 앉을 수 있는 줄은 하나뿐이다 — 줄 {index}.',
      ja: 'このアドレスが入れる行は一つだけ — 行 {index}。',
      zh: '这个地址只能放进一个行 — 行 {index}。',
      ar: 'هذا العنوان لا يمكنه الجلوس إلا في سطر واحد: {index}.',
      es: 'Esta dirección solo puede ocupar una línea: {index}.',
      fr: "Cette adresse ne peut occuper qu'une seule ligne : {index}.",
      hi: 'यह पता केवल एक ही लाइन में बैठ सकता है: {index}.',
      id: 'Alamat ini hanya bisa menempati satu baris: {index}.',
      pt: 'Este endereço só pode ocupar uma linha: {index}.',
    },
    'caption.evict': {
      en: 'The same line again, so the older block is pushed out: {evicted}.',
      ko: '또 같은 줄이다 — 살던 것이 밀려난다. 밀려난 주소: {evicted}.',
      ja: 'また同じ行だ — 先にいた方が追い出される。追い出されたアドレス: {evicted}。',
      zh: '又是同一个行 — 原来的被挤出去。被挤出的地址: {evicted}。',
      ar: 'السطر نفسه مرة أخرى، لذا يُطرد المَدخل الأقدم: {evicted}.',
      es: 'La misma línea otra vez, así que el bloque anterior es expulsado: {evicted}.',
      fr: 'Encore la même ligne, donc le bloc précédent est expulsé : {evicted}.',
      hi: 'फिर वही लाइन, इसलिए पुराना ब्लॉक बाहर धकेल दिया जाता है: {evicted}.',
      id: 'Baris yang sama lagi, jadi blok lama terdorong keluar: {evicted}.',
      pt: 'A mesma linha de novo, então o bloco anterior é expulso: {evicted}.',
    },
    'caption.done': {
      en: 'Lookups: {total}, hits: {hits}. Lines still empty: {empty}.',
      ko: '찾은 횟수 {total}, 맞은 횟수 {hits}. 여태 비어 있는 줄: {empty}.',
      ja: '参照 {total} 回、ヒット {hits} 回。まだ空のままの行: {empty}。',
      zh: '查找次数 {total}，命中次数 {hits}。仍然空着的行: {empty}。',
      ar: 'عمليات البحث: {total}، الإصابات: {hits}. الأسطر التي ما زالت فارغة: {empty}.',
      es: 'Búsquedas: {total}, aciertos: {hits}. Líneas aún vacías: {empty}.',
      fr: 'Recherches : {total}, succès : {hits}. Lignes encore vides : {empty}.',
      hi: 'खोजें: {total}, हिट: {hits}. अब भी खाली लाइनें: {empty}.',
      id: 'Pencarian: {total}, hit: {hits}. Baris yang masih kosong: {empty}.',
      pt: 'Buscas: {total}, acertos: {hits}. Linhas ainda vazias: {empty}.',
    },
    'label.pushedOut': {
      en: 'Pushed out: {n}',
      ko: '밀려난 것: {n}',
      ja: '追い出された数: {n}',
      zh: '被挤出: {n}',
      ar: 'المطرودة: {n}',
      es: 'Expulsados: {n}',
      fr: 'Expulsés : {n}',
      hi: 'बाहर धकेले गए: {n}',
      id: 'Terdorong keluar: {n}',
      pt: 'Expulsos: {n}',
    },
    'label.emptyLines': {
      en: 'Empty lines: {n}',
      ko: '빈 줄: {n}',
      ja: '空の行: {n}',
      zh: '空行: {n}',
      ar: 'الأسطر الفارغة: {n}',
      es: 'Líneas vacías: {n}',
      fr: 'Lignes vides : {n}',
      hi: 'खाली लाइनें: {n}',
      id: 'Baris kosong: {n}',
      pt: 'Linhas vazias: {n}',
    },
  },
  blocks: {
    stage: { type: 'conflict-miss-stage' },
    controls: {
      type: 'control-bar',
      // 다시 보기는 놓친 사람을 위한 것이고, 한 걸음은 곱씹으며 읽고 싶은
      // 사람을 위한 것이다. 둘 다 눌러야 완성되는 조작이 아니다 (S-piece).
      controls: CONTROL_SET.piece,
    },
  },
};
