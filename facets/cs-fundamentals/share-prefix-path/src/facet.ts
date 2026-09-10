/**
 * sharePrefixPath facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "같은 앞글자로 시작하는 낱말들은 자리를 어떻게 나눠 쓰는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나 + 한 걸음씩 짚기 하나) / 제목
 * 없음 / 한 주장 / 메트릭 없음 / 캔버스 폭 620 / 전제를 글에서 밝힌다.
 *
 * words 는 실측 순서 그대로다 — car → cart → cat → dog. 결과 자리 수(뿌리 포함
 * 아홉), 따로 담았을 때의 글자 수(3+4+3+3=13), 아낀 수(4)는 전부 algorithm 이
 * words 를 실제로 순회해 계산한 값이다 (지어내지 않는다, S-piece MUST).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const sharePrefixPathFacet: FacetJson = {
  id: 'facet:sharePrefixPath',
  title: {
    en: 'Shared Prefix Path',
    ko: '접두사 공유',
    ja: '接頭辞の共有',
    zh: '共享前缀',
    ar: 'مشاركة البادئة',
    es: 'Prefijo compartido',
    fr: 'Préfixe partagé',
    hi: 'साझा उपसर्ग',
    id: 'Berbagi awalan',
    pt: 'Prefixo compartilhado',
  },
  description: {
    en: 'Words that share a beginning ride the same path until the letters split',
    ko: '같은 앞글자는 글자가 갈라지기 전까지 같은 길을 탄다',
    ja: '同じ書き出しの語は、文字が分かれるまで同じ道をたどる',
    zh: '开头相同的词会走同一条路，直到字母分岔',
    ar: 'الكلمات التي تشترك في بدايتها تسلك المسار نفسه حتى تفترق الحروف',
    es: 'Las palabras que empiezan igual recorren el mismo camino hasta que las letras se separan',
    fr: "Les mots qui commencent pareil suivent le même chemin jusqu'à ce que les lettres divergent",
    hi: 'एक जैसे शुरू होने वाले शब्द तब तक एक ही राह चलते हैं जब तक अक्षर अलग नहीं हो जाते',
    id: 'Kata yang berawal sama menempuh jalur yang sama sampai hurufnya bercabang',
    pt: 'Palavras que começam igual seguem o mesmo caminho até as letras se separarem',
  },
  algorithm: 'module:sharePrefixPath',
  projector: 'module:sharePrefixPathProjector',
  initialData: {
    type: 'share-prefix-path',
    words: ['car', 'cart', 'cat', 'dog'],
    stepMs: 620,
  },
  shuffleOnReset: false,
  messages: {
    'caption.begin': {
      en: "Inserting '{word}'.",
      ko: "'{word}' 를 넣는다.",
      ja: '「{word}」を入れる。',
      zh: '插入 “{word}”。',
      ar: 'ندخل «{word}».',
      es: 'Insertando «{word}».',
      fr: 'Insertion de « {word} ».',
      hi: '“{word}” डाल रहे हैं।',
      id: 'Menyisipkan “{word}”.',
      pt: 'Inserindo “{word}”.',
    },
    'caption.wordEnd': {
      en: "'{word}': rode {rode}, grew {grown}.",
      ko: "'{word}': 탄 자리 {rode} · 새 자리 {grown}.",
      ja: '「{word}」— 乗った席 {rode} · 新しい席 {grown}。',
      zh: '“{word}”：借用 {rode} 个位置，新增 {grown} 个。',
      ar: '«{word}»: ركبت {rode} ونمت {grown}.',
      es: '«{word}»: aprovechó {rode}, creó {grown}.',
      fr: '« {word} » : a repris {rode}, en a créé {grown}.',
      hi: '“{word}”: {rode} जगहें साझा कीं, {grown} नई बनीं।',
      id: '“{word}”: menumpang {rode}, menambah {grown}.',
      pt: '“{word}”: aproveitou {rode}, criou {grown}.',
    },
    'caption.summary': {
      en: '{wordCount} words, {totalSeats} seats (root included) instead of {rawChars} separate ones — saved {saved}.',
      ko: '낱말 {wordCount}개, 자리 {totalSeats}개(뿌리 포함) — 따로 담았다면 {rawChars}개, {saved}개를 아꼈다.',
      ja: '語 {wordCount} 個、席 {totalSeats} 個（根を含む）— 別々なら {rawChars} 個、{saved} 個を節約した。',
      zh: '{wordCount} 个词，{totalSeats} 个位置（含根）— 分开存要 {rawChars} 个，省下 {saved} 个。',
      ar: '{wordCount} كلمات و{totalSeats} موضعًا (بما فيها الجذر) بدل {rawChars} منفصلة — وفّرنا {saved}.',
      es: '{wordCount} palabras, {totalSeats} asientos (raíz incluida) en vez de {rawChars} sueltos: ahorramos {saved}.',
      fr: '{wordCount} mots, {totalSeats} places (racine comprise) au lieu de {rawChars} séparées — {saved} économisées.',
      hi: '{wordCount} शब्द, {totalSeats} जगहें (जड़ सहित) — अलग-अलग रखने पर {rawChars} लगतीं, {saved} बचीं।',
      id: '{wordCount} kata, {totalSeats} tempat (termasuk akar) alih-alih {rawChars} terpisah — hemat {saved}.',
      pt: '{wordCount} palavras, {totalSeats} lugares (raiz incluída) em vez de {rawChars} separados — {saved} economizados.',
    },
  },
  blocks: {
    stage: { type: 'share-prefix-path-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
