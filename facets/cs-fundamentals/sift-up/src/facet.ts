/**
 * siftUp — 상향 재배치 조각(piece) 선언.
 *
 * @piece 넣고 위로 올라가며 자리 잡는다. 새 값이 맨 끝자리에 앉은 뒤 부모와
 * 견주기를 반복하며 오르지만, 꼭대기까지 가는 것이 아니라 **자기 자리를
 * 찾으면 멈추는** 것이 요점이다. 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 *
 * 데이터는 최소 힙 배열 [3,5,8,9,6,12,10] 에 7 을 넣는 시나리오다. 걸음은
 * algorithm.ts 가 이 배열을 실제로 시뮬레이션해 계산하며, 여기 적힌 것은
 * 시작 배열과 넣을 값뿐이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const siftUpFacet: FacetJson = {
  id: 'facet:siftUp',
  title: {
    en: 'Sift Up',
    ko: '상향 재배치',
    ja: 'シフトアップ',
    zh: '上浮调整',
    ar: 'الغربلة صعوداً',
    es: 'Ascenso',
    fr: 'Remontée',
    hi: 'सिफ़्ट अप',
    id: 'Sift Up',
    pt: 'Subida',
  },
  description: {
    en: 'Insert at the last slot, then climb until you find your place.',
    ko: '맨 끝자리에 넣고, 자기 자리를 찾을 때까지 오른다.',
    ja: '最後の空きに入れ、自分の場所が見つかるまで登る。',
    zh: '先放到最后一个位置，再往上爬到属于自己的位置。',
    ar: 'ندخلها في آخر موضع، ثم تصعد حتى تجد مكانها.',
    es: 'Se inserta en la última casilla y sube hasta encontrar su sitio.',
    fr: "On insère à la dernière place, puis on remonte jusqu'à trouver la sienne.",
    hi: 'आख़िरी ख़ाने में डालें, फिर अपनी जगह मिलने तक ऊपर चढ़ें।',
    id: 'Sisipkan di slot terakhir, lalu naik sampai menemukan tempatnya.',
    pt: 'Insere-se na última posição e sobe até encontrar o seu lugar.',
  },
  algorithm: 'module:siftUp',
  projector: 'module:siftUpProjector',
  initialData: {
    type: 'sift-up',
    values: [3, 5, 8, 9, 6, 12, 10],
    insertValue: 7,
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.insert': {
      en: 'The new value {value} takes the last open slot.',
      ko: '새 값 {value} 이 맨 끝자리에 앉는다.',
      ja: '新しい値 {value} が最後の空きに入る。',
      zh: '新值 {value} 占据最后一个空位。',
      ar: 'تأخذ القيمة الجديدة {value} آخر موضع شاغر.',
      es: 'El nuevo valor {value} ocupa la última casilla libre.',
      fr: 'La nouvelle valeur {value} prend la dernière place libre.',
      hi: 'नया मान {value} आख़िरी खाली ख़ाने में बैठता है।',
      id: 'Nilai baru {value} menempati slot kosong terakhir.',
      pt: 'O novo valor {value} ocupa a última posição livre.',
    },
    'caption.compareSwap': {
      en: '{child} comes before its parent {parent} — they swap places.',
      ko: '{child} 이 부모 {parent} 보다 앞선다 — 자리를 맞바꾼다.',
      ja: '{child} は親 {parent} より先に来る — 位置を入れ替える。',
      zh: '{child} 排在父节点 {parent} 之前 — 两者交换位置。',
      ar: '{child} يسبق أباه {parent} — يتبادلان الموضع.',
      es: '{child} va antes que su padre {parent}: intercambian lugares.',
      fr: '{child} passe avant son parent {parent} — ils échangent leurs places.',
      hi: '{child} अपने जनक {parent} से पहले आता है — दोनों जगह बदल लेते हैं।',
      id: '{child} mendahului induknya {parent} — keduanya bertukar tempat.',
      pt: '{child} vem antes do pai {parent} — trocam de lugar.',
    },
    'caption.compareStop': {
      en: '{child} does not come before its parent {parent} — it stops here.',
      ko: '{child} 이 부모 {parent} 보다 앞서지 못한다 — 여기서 멈춘다.',
      ja: '{child} は親 {parent} より先に来ない — ここで止まる。',
      zh: '{child} 排不到父节点 {parent} 之前 — 就停在这里。',
      ar: '{child} لا يسبق أباه {parent} — يتوقّف هنا.',
      es: '{child} no va antes que su padre {parent}: se detiene aquí.',
      fr: '{child} ne passe pas avant son parent {parent} — il reste là.',
      hi: '{child} अपने जनक {parent} से पहले नहीं आता — यहीं रुक जाता है।',
      id: '{child} tidak mendahului induknya {parent} — berhenti di sini.',
      pt: '{child} não vem antes do pai {parent} — para aqui.',
    },
    'caption.settle': {
      en: 'This is its place.',
      ko: '여기가 자기 자리다.',
      ja: 'ここが自分の場所だ。',
      zh: '这里就是它的位置。',
      ar: 'هنا مكانها.',
      es: 'Este es su sitio.',
      fr: 'Voilà sa place.',
      hi: 'यही इसकी जगह है।',
      id: 'Di sinilah tempatnya.',
      pt: 'Este é o seu lugar.',
    },
  },
  blocks: {
    stage: { type: 'sift-up-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
