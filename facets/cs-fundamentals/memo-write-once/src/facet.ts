/**
 * memoWriteOnce 의 선언.
 *
 * @piece 조각(piece) facet — 질문 하나에 답하고 멈춘다 (S-piece).
 *   묻는 것: 적어 두면 왜 빨라지는가.
 *   답: 답을 얻은 항은 표로 옮겨 가 적히고, 같은 항을 다시 만나면 표에서
 *       되돌아 나온다. 그 자리에서 가지는 더 뻗지 않는다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 배치는 러너가 만든다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const memoWriteOnceFacet: FacetJson = {
  id: 'facet:memoWriteOnce',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Memoization',
    ko: '메모이제이션',
    ja: 'メモ化',
    zh: '记忆化',
    ar: 'حفظ النتائج',
    es: 'Memoización',
    fr: 'Mémoïsation',
    hi: 'मेमोआइज़ेशन',
    id: 'Memoisasi',
    pt: 'Memoização',
  },
  description: {
    en: 'A solved term moves into the table; meeting it again reads the value back instead of branching.',
    ko: '푼 항은 표로 옮겨 가 적히고, 다시 만나면 뻗는 대신 표에서 값을 읽는다.',
    ja: '解けた項は表へ移して書き、また出会えば枝を伸ばさずに表から値を読む。',
    zh: '解出的项写进表里；再遇到它就从表中读值，而不再往下分叉。',
    ar: 'يُنقل الحد المحلول إلى الجدول، وعند لقائه ثانيةً تُقرأ قيمته من الجدول بدل التفرّع.',
    es: 'El término resuelto pasa a la tabla; al volver a encontrarlo se lee su valor en vez de ramificar.',
    fr: "Un terme résolu passe dans la table ; le revoir, c'est y relire sa valeur au lieu de rouvrir des branches.",
    hi: 'हल हो चुका पद तालिका में लिख जाता है; दोबारा मिलने पर शाखा फैलाने के बजाय वहीं से मान पढ़ लिया जाता है।',
    id: 'Suku yang sudah terpecahkan pindah ke tabel; bertemu lagi berarti membaca nilainya dari sana, bukan bercabang.',
    pt: 'Um termo resolvido passa para a tabela; reencontrá-lo é ler o valor de lá em vez de ramificar.',
  },
  algorithm: 'module:memoWriteOnce',
  projector: 'module:memoWriteOnceProjector',
  initialData: {
    type: 'memo-write-once',
    n: 5,
    stepMs: 460,
  },
  blocks: {
    stage: { type: 'memo-write-once-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.call': {
      en: 'Call f({n}).',
      ko: 'f({n}) 을 부른다.',
      ja: 'f({n}) を呼ぶ。',
      zh: '调用 f({n})。',
      ar: 'استدعِ f({n}).',
      es: 'Se llama a f({n}).',
      fr: 'On appelle f({n}).',
      hi: 'f({n}) को बुलाएँ।',
      id: 'Panggil f({n}).',
      pt: 'Chama-se f({n}).',
    },
    'caption.write': {
      en: 'f({n}) = {value}. Write it into memo[{n}].',
      ko: 'f({n}) = {value} — memo[{n}] 에 적는다.',
      ja: 'f({n}) = {value} — memo[{n}] に書き込む。',
      zh: 'f({n}) = {value} — 写进 memo[{n}]。',
      ar: 'f({n}) = {value}. اكتبها في memo[{n}].',
      es: 'f({n}) = {value}. Se escribe en memo[{n}].',
      fr: 'f({n}) = {value}. On écrit dans memo[{n}].',
      hi: 'f({n}) = {value}। इसे memo[{n}] में लिख दें।',
      id: 'f({n}) = {value}. Tulis ke memo[{n}].',
      pt: 'f({n}) = {value}. Escreve-se em memo[{n}].',
    },
    'caption.read': {
      en: 'f({n}) is already written — read {value}, branch no further.',
      ko: 'f({n}) 은 이미 적혀 있다 — {value} 를 읽고 더 뻗지 않는다.',
      ja: 'f({n}) はすでに書いてある — {value} を読んで、これ以上は伸ばさない。',
      zh: 'f({n}) 已经写过了 — 读出 {value}，不再往下分叉。',
      ar: 'f({n}) مكتوبة سلفًا — اقرأ {value} ولا تتفرّع أكثر.',
      es: 'f({n}) ya está escrita: se lee {value} y no se ramifica más.',
      fr: "f({n}) est déjà écrite — on lit {value} et on ne pousse pas plus loin.",
      hi: 'f({n}) पहले से लिखा है — {value} पढ़ लें, आगे शाखा नहीं।',
      id: 'f({n}) sudah tertulis — baca {value}, tak bercabang lagi.',
      pt: 'f({n}) já está escrita — lê-se {value} e não se ramifica mais.',
    },
    'caption.done': {
      en: '{solved} terms solved, {reused} read back from memo. f({n}) = {value}.',
      ko: '푼 항 {solved}, 표에서 읽은 항 {reused}. f({n}) = {value}.',
      ja: '解いた項 {solved}、表から読んだ項 {reused}。f({n}) = {value}。',
      zh: '解出 {solved} 项，从表中读回 {reused} 项。f({n}) = {value}。',
      ar: 'حُلّت {solved} حدود، وقُرئ {reused} من الجدول. f({n}) = {value}.',
      es: '{solved} términos resueltos, {reused} leídos de la tabla. f({n}) = {value}.',
      fr: '{solved} termes résolus, {reused} relus dans la table. f({n}) = {value}.',
      hi: '{solved} पद हल हुए, {reused} तालिका से पढ़े गए। f({n}) = {value}।',
      id: '{solved} suku terpecahkan, {reused} dibaca dari tabel. f({n}) = {value}.',
      pt: '{solved} termos resolvidos, {reused} lidos da tabela. f({n}) = {value}.',
    },
  },
};
