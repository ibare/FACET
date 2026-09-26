/**
 * @piece
 * 질문: INNER JOIN 은 두 표의 줄을 어떻게 이어 새 줄을 만드는가.
 *
 * @notation native
 * 화면의 질의는 SQL 그대로 둔다 — SQL 문이 곧 이 조각이 말하는 소재다.
 */
import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const matchOnKeyFacet: FacetJson = {
  id: 'facet:matchOnKey',
  title: {
    en: 'INNER JOIN: rows meet on a key',
    ko: 'INNER JOIN — 열쇠가 맞는 줄끼리 잇는다',
    ja: 'INNER JOIN — キーが一致する行どうしをつなぐ',
    zh: 'INNER JOIN — 键相同的行连在一起',
    ar: 'INNER JOIN — تلتقي الصفوف عند المفتاح',
    es: 'INNER JOIN: las filas se unen por una clave',
    fr: 'INNER JOIN : les lignes se rejoignent par une clé',
    hi: 'INNER JOIN — कुंजी मिलने पर पंक्तियाँ जुड़ती हैं',
    id: 'INNER JOIN: baris bertemu lewat kunci',
    pt: 'INNER JOIN: as linhas se encontram pela chave',
  },
  description: {
    en: 'Each emp row carries its dept_id to dept, finds the row with the same id, and a copy of that row joins it to make one result row.',
    ko: 'emp 의 줄이 하나씩 제 dept_id 를 들고 dept 에서 같은 id 의 줄을 찾아가고, 그 줄의 복사본이 붙어 결과 한 줄이 된다.',
    ja: 'emp の各行が自分の dept_id を持って dept へ行き、同じ id の行を見つけ、その行のコピーがくっついて結果の 1 行になる。',
    zh: 'emp 的每一行带着自己的 dept_id 去 dept 找 id 相同的行，那一行的副本贴上来，合成结果中的一行。',
    ar: 'يحمل كل صف في emp قيمة dept_id إلى dept، فيجد الصف ذا المعرّف نفسه، وتلتصق به نسخة من ذلك الصف لتكوّن صفًا واحدًا في النتيجة.',
    es: 'Cada fila de emp lleva su dept_id a dept, encuentra la fila con el mismo id y una copia de esa fila se le une para formar una fila del resultado.',
    fr: 'Chaque ligne de emp porte son dept_id jusqu’à dept, trouve la ligne au même id, et une copie de cette ligne s’y joint pour former une ligne du résultat.',
    hi: 'emp की हर पंक्ति अपना dept_id लेकर dept में उसी id वाली पंक्ति खोजती है, और उस पंक्ति की प्रति जुड़कर परिणाम की एक पंक्ति बनती है।',
    id: 'Setiap baris emp membawa dept_id-nya ke dept, menemukan baris dengan id yang sama, lalu salinan baris itu menempel sehingga menjadi satu baris hasil.',
    pt: 'Cada linha de emp leva seu dept_id até dept, encontra a linha com o mesmo id, e uma cópia dessa linha se junta a ela para formar uma linha do resultado.',
  },
  algorithm: 'module:matchOnKey',
  scene: 'module:matchOnKeyScene',
  initialData: {
    type: 'match-on-key',
    stepMs: 1200,
    sql: ['SELECT e.name, d.dname', 'FROM emp e', 'JOIN dept d ON e.dept_id = d.id;'],
    left: {
      name: 'emp',
      columns: ['id', 'name', 'dept_id'],
      rows: [
        [1, 'Ann', 20],
        [2, 'Bo', 10],
        [3, 'Cy', 20],
        [4, 'Di', 30],
        [5, 'Eve', 20],
      ],
    },
    right: {
      name: 'dept',
      columns: ['id', 'dname'],
      rows: [
        [10, 'Sales'],
        [20, 'Dev'],
        [30, 'Ops'],
      ],
    },
    on: { left: 'dept_id', right: 'id' },
    select: { left: 'name', right: 'dname' },
  },
  shuffleOnReset: false,
  messages: {
    'label.result': {
      en: 'Result',
      ko: '결과',
      ja: '結果',
      zh: '结果',
      ar: 'النتيجة',
      es: 'Resultado',
      fr: 'Résultat',
      hi: 'परिणाम',
      id: 'Hasil',
      pt: 'Resultado',
    },
    'caption.start': {
      en: 'Rows in {left}: {e} · rows in {right}: {d}',
      ko: '{left} 줄: {e} · {right} 줄: {d}',
      ja: '{left} の行: {e} · {right} の行: {d}',
      zh: '{left} 的行数: {e} · {right} 的行数: {d}',
      ar: 'صفوف {left}: {e} · صفوف {right}: {d}',
      es: 'Filas de {left}: {e} · filas de {right}: {d}',
      fr: 'Lignes de {left} : {e} · lignes de {right} : {d}',
      hi: '{left} की पंक्तियाँ: {e} · {right} की पंक्तियाँ: {d}',
      id: 'Baris {left}: {e} · baris {right}: {d}',
      pt: 'Linhas de {left}: {e} · linhas de {right}: {d}',
    },
    'caption.seek': {
      en: '{name} looks for {right}.{col} = {key}.',
      ko: '{name}: {right}.{col} = {key} 인 줄을 찾아간다.',
      ja: '{name}: {right}.{col} = {key} の行を探しに行く。',
      zh: '{name}：去找 {right}.{col} = {key} 的行。',
      ar: '{name} يبحث عن {right}.{col} = {key}.',
      es: '{name} busca {right}.{col} = {key}.',
      fr: '{name} cherche {right}.{col} = {key}.',
      hi: '{name}: {right}.{col} = {key} वाली पंक्ति खोजता है।',
      id: '{name} mencari {right}.{col} = {key}.',
      pt: '{name} procura {right}.{col} = {key}.',
    },
    'caption.join': {
      en: 'Result rows: {n} · copies of {dname}: {c}',
      ko: '결과 줄: {n} · {dname} 복사본: {c}',
      ja: '結果の行: {n} · {dname} のコピー: {c}',
      zh: '结果行数: {n} · {dname} 的副本: {c}',
      ar: 'صفوف النتيجة: {n} · نسخ {dname}: {c}',
      es: 'Filas del resultado: {n} · copias de {dname}: {c}',
      fr: 'Lignes du résultat : {n} · copies de {dname} : {c}',
      hi: 'परिणाम की पंक्तियाँ: {n} · {dname} की प्रतियाँ: {c}',
      id: 'Baris hasil: {n} · salinan {dname}: {c}',
      pt: 'Linhas do resultado: {n} · cópias de {dname}: {c}',
    },
  },
  blocks: {
    stage: { type: 'match-on-key-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
