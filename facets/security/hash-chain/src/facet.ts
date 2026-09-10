/**
 * HashChain facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "지난 기록을 몰래 고치면 왜 들통나는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 데이터는 실측 SHA-256 이다. 각 칸의 hash 는 sha256(prev + data) 이고, 첫 칸의
 * prev 는 0 으로 채웠다. 2번 칸을 'withdraw 90' 으로 고치면 그 칸부터 끝까지
 * 세 칸의 값이 전부 갈린다.
 *
 * 각주가 밝히는 전제: 뒤를 전부 다시 계산하면 사슬 자체는 다시 맞는다. 그래도
 * 마지막 해시를 따로 갖고 있는 사람에게는 어긋남이 드러난다 — 사슬이 막는 것은
 * 조용한 수정이지 수정 자체가 아니다.
 *
 * title / description / messages 는 열 언어를 모두 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const hashChainFacet: FacetJson = {
  id: 'facet:hashChain',
  title: {
    en: 'Hash Chain',
    ko: '해시 체인',
    ja: 'ハッシュチェーン',
    zh: '哈希链',
    ar: 'سلسلة التجزئة',
    es: 'Cadena de hashes',
    fr: 'Chaîne de hachage',
    hi: 'हैश शृंखला',
    id: 'Rantai hash',
    pt: 'Cadeia de hashes',
  },
  description: {
    en: 'Each entry carries the previous hash, so one edit breaks everything after it',
    ko: '칸마다 앞의 해시를 품고 있어, 한 번의 수정이 그 뒤를 전부 어긋나게 한다',
    ja: '各欄が前のハッシュを抱えているので、一度の書き換えがその後をすべて狂わせる',
    zh: '每一格都带着前一格的哈希，改动一处，其后全都对不上',
    ar: 'كل سجلّ يحمل تجزئة سابقه، فتعديل واحد يُفسد كل ما بعده',
    es: 'Cada entrada lleva el hash de la anterior, así que una sola edición rompe todo lo que sigue',
    fr: 'Chaque entrée porte le hachage de la précédente : une seule modification casse tout ce qui suit',
    hi: 'हर प्रविष्टि पिछली का हैश साथ रखती है, इसलिए एक बदलाव उसके बाद का सब बिगाड़ देता है',
    id: 'Tiap entri membawa hash entri sebelumnya, jadi satu suntingan merusak semua yang mengikutinya',
    pt: 'Cada entrada leva o hash da anterior, por isso uma única edição quebra tudo o que vem depois',
  },
  algorithm: 'module:hashChain',
  projector: 'module:hashChainProjector',
  initialData: {
    type: 'hash-chain',
    algorithmLabel: 'SHA-256',
    // 전부 실측 SHA-256. hash = sha256(prev + data), 첫 칸의 prev 는 0 으로 채웠다.
    blocks: [
      {
        data: 'deposit 50',
        prev: '0000000000000000000000000000000000000000000000000000000000000000',
        hash: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
      },
      {
        data: 'withdraw 20',
        prev: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
        hash: 'fe56a4cedab058595c97176dadbb5ccd8f78c25847efa8fe54af35bb6524f89c',
      },
      {
        data: 'deposit 10',
        prev: 'fe56a4cedab058595c97176dadbb5ccd8f78c25847efa8fe54af35bb6524f89c',
        hash: '2cf4fa4ea76711097f19bddaa064b144ccb549ba1e17180ca7fd77013218c5ba',
      },
      {
        data: 'withdraw 5',
        prev: '2cf4fa4ea76711097f19bddaa064b144ccb549ba1e17180ca7fd77013218c5ba',
        hash: '492b3daec7b50381578e86195a41fff61a4525aaeff64b97c56ebf96106555e1',
      },
    ],
    tamper: {
      index: 1,
      data: 'withdraw 90',
      blocks: [
        {
          data: 'deposit 50',
          prev: '0000000000000000000000000000000000000000000000000000000000000000',
          hash: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
        },
        {
          data: 'withdraw 90',
          prev: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
          hash: '3ba861d8bc6e9f056d87a15b41f4a6e1a87e5da002cff848186fffb74887993e',
        },
        {
          data: 'deposit 10',
          prev: '3ba861d8bc6e9f056d87a15b41f4a6e1a87e5da002cff848186fffb74887993e',
          hash: '01ebd178d465e257d3957e5d636dba36be4b752358dbb9339fd92128fe149a34',
        },
        {
          data: 'withdraw 5',
          prev: '01ebd178d465e257d3957e5d636dba36be4b752358dbb9339fd92128fe149a34',
          hash: '66c72b4c7f47eaaaa1d68e07a904fde103c63c58c3ac159f6615c2342d140c18',
        },
      ],
    },
    stepMs: 1000,
  },
  shuffleOnReset: false,
  messages: {
    'caption.linked': {
      en: 'Every entry holds the hash of the one before it.',
      ko: '모든 칸이 앞 칸의 해시를 쥐고 있다.',
      ja: 'どの欄も前の欄のハッシュを握っている。',
      zh: '每一格都握着前一格的哈希。',
      ar: 'كل سجلّ يمسك بتجزئة السجلّ الذي قبله.',
      es: 'Cada entrada guarda el hash de la anterior.',
      fr: 'Chaque entrée détient le hachage de la précédente.',
      hi: 'हर प्रविष्टि अपने पहले वाली का हैश थामे है।',
      id: 'Setiap entri memegang hash entri sebelumnya.',
      pt: 'Cada entrada guarda o hash da anterior.',
    },
    'caption.tampered': {
      en: 'Someone edits an old entry.',
      ko: '누군가 지난 칸의 내용을 고친다.',
      ja: '誰かが古い欄の中身を書き換える。',
      zh: '有人改动了一条旧记录。',
      ar: 'يعدّل أحدهم سجلًّا قديمًا.',
      es: 'Alguien edita una entrada antigua.',
      fr: "Quelqu'un modifie une ancienne entrée.",
      hi: 'कोई पुरानी प्रविष्टि बदल देता है।',
      id: 'Seseorang menyunting entri lama.',
      pt: 'Alguém edita uma entrada antiga.',
    },
    'caption.broken': {
      en: 'Its hash changes, and the next entry is holding the old one.',
      ko: '그 칸의 해시가 바뀌는데, 다음 칸은 옛 값을 쥐고 있다.',
      ja: 'その欄のハッシュが変わるのに、次の欄は古い値を握ったままだ。',
      zh: '这一格的哈希变了，可下一格握着的还是旧值。',
      ar: 'تتغيّر تجزئته، بينما السجلّ التالي ما زال يمسك بالقديمة.',
      es: 'Su hash cambia, pero la siguiente entrada sigue guardando el antiguo.',
      fr: "Son hachage change, alors que l'entrée suivante détient encore l'ancien.",
      hi: 'उसका हैश बदल जाता है, पर अगली प्रविष्टि पुराना ही थामे है।',
      id: 'Hash-nya berubah, sementara entri berikutnya masih memegang yang lama.',
      pt: 'O seu hash muda, mas a entrada seguinte ainda guarda o antigo.',
    },
    'caption.cascaded': {
      en: 'The mismatch runs all the way to the end.',
      ko: '어긋남이 끝까지 번진다.',
      ja: '食い違いが最後まで広がる。',
      zh: '这处不符一直蔓延到末尾。',
      ar: 'يمتدّ الاختلاف حتى النهاية.',
      es: 'El desajuste se propaga hasta el final.',
      fr: "Le décalage se propage jusqu'au bout.",
      hi: 'यह बेमेल अंत तक फैल जाता है।',
      id: 'Ketidakcocokan itu merambat sampai ujung.',
      pt: 'A discrepância propaga-se até ao fim.',
    },
    'label.prev': {
      en: 'prev',
      ko: '앞',
      ja: '前',
      zh: '前',
      ar: 'السابق',
      es: 'anterior',
      fr: 'précédent',
      hi: 'पिछला',
      id: 'sebelumnya',
      pt: 'anterior',
    },
    'label.hash': {
      en: 'hash',
      ko: '해시',
      ja: 'ハッシュ',
      zh: '哈希',
      ar: 'التجزئة',
      es: 'hash',
      fr: 'hachage',
      hi: 'हैश',
      id: 'hash',
      pt: 'hash',
    },
  },
  blocks: {
    stage: { type: 'chain-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
