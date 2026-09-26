/**
 * @piece
 * 두 갈래가 같은 이름에 서로 다른 판을 넣으면, 갈래가 만난 뒤에 읽는 이름은 어느 판인가?
 *
 * @notation native — 세 주소 코드와 SSA(판 번호 · φ)는 컴파일러의 내부 표기이고, 그 표기 자체가 주장이다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { Ins } from './algorithm.js';

const v = (name: string) => ({ var: name });
const n = (x: number) => ({ num: x });

/** 판 없는 세 주소 코드 — `function f(a)` 를 이 서브도메인의 낮추기 규약으로 낮춘 것. */
const code: Ins[] = [
  { label: null, k: 'copy', dst: 'x', src: v('a') },
  { label: null, k: 'copy', dst: 'y', src: n(1) },
  { label: null, k: 'bin', dst: 'z', l: v('a'), op: '*', r: n(2) },
  { label: null, k: 'bin', dst: 't1', l: v('x'), op: '>', r: n(5) },
  { label: null, k: 'ifnot', cond: 't1', target: 'L1' },
  { label: null, k: 'bin', dst: 'x', l: v('x'), op: '-', r: n(5) },
  { label: null, k: 'goto', target: 'L2' },
  { label: 'L1', k: 'copy', dst: 'y', src: n(2) },
  { label: 'L2', k: 'bin', dst: 't2', l: v('x'), op: '+', r: v('y') },
  { label: null, k: 'bin', dst: 't3', l: v('t2'), op: '+', r: v('z') },
  { label: null, k: 'return', value: v('t3') },
];

export const phiMergesFacet: FacetJson = {
  id: 'facet:phiMerges',
  title: {
    en: 'φ — where branched versions meet',
    ko: '파이 — 갈라진 판이 만나는 자리',
    ja: 'φ — 分かれた版が出会う場所',
    zh: 'φ — 分叉的版本汇合之处',
    ar: 'φ — حيث تلتقي الإصدارات المتفرعة',
    es: 'φ — donde se juntan las versiones de las ramas',
    fr: 'φ — là où se rejoignent les versions des branches',
    hi: 'φ — जहाँ शाखाओं के संस्करण मिलते हैं',
    id: 'φ — tempat versi dari cabang bertemu',
    pt: 'φ — onde as versões dos ramos se encontram',
  },
  description: {
    en: 'When two branches put different versions into one name, a φ at the head of the merge block picks the version of the side control came from.',
    ko: '두 갈래가 한 이름에 서로 다른 판을 넣으면, 만나는 블록 머리의 파이가 흐름이 들어온 쪽의 판을 고른다.',
    ja: '二つの分岐が一つの名前に異なる版を入れると、合流ブロックの先頭の φ が、制御が入ってきた側の版を選ぶ。',
    zh: '两条分支给同一个名字放入不同版本时，汇合块开头的 φ 会选取控制流进入那一侧的版本。',
    ar: 'عندما يضع فرعان إصدارين مختلفين في اسم واحد، تختار φ في رأس كتلة الالتقاء إصدار الجانب الذي جاء منه التنفيذ.',
    es: 'Cuando dos ramas ponen versiones distintas en un mismo nombre, una φ al inicio del bloque de unión toma la versión del lado por el que llegó el control.',
    fr: 'Quand deux branches mettent des versions différentes dans un même nom, une φ en tête du bloc de jonction prend la version du côté par où le contrôle est arrivé.',
    hi: 'जब दो शाखाएँ एक ही नाम में अलग-अलग संस्करण डालती हैं, तो मिलन ब्लॉक के सिरे पर φ उस ओर का संस्करण चुनता है जिधर से नियंत्रण आया।',
    id: 'Saat dua cabang memasukkan versi berbeda ke satu nama, φ di kepala blok pertemuan mengambil versi dari sisi tempat kendali datang.',
    pt: 'Quando dois ramos põem versões diferentes num mesmo nome, uma φ no início do bloco de junção pega a versão do lado por onde o controle chegou.',
  },
  algorithm: 'module:phiMerges',
  scene: 'module:phiMergesScene',
  initialData: {
    type: 'phi-merges',
    stepMs: 1800,
    code,
    input: [['a', 8]],
  },
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'Merge block: {merge} ← {preds}. Still read without versions: {names}',
      ko: '만나는 블록: {merge} ← {preds}. 아직 판 없이 읽는 이름: {names}',
      ja: '合流ブロック: {merge} ← {preds}。まだ版なしで読む名前: {names}',
      zh: '汇合块: {merge} ← {preds}。仍不带版本读取的名字: {names}',
      ar: 'كتلة الالتقاء: {merge} ← {preds}. أسماء ما زالت تُقرأ بلا إصدار: {names}',
      es: 'Bloque de unión: {merge} ← {preds}. Aún se leen sin versión: {names}',
      fr: 'Bloc de jonction : {merge} ← {preds}. Encore lus sans version : {names}',
      hi: 'मिलन ब्लॉक: {merge} ← {preds}. अभी भी बिना संस्करण के पढ़े जाने वाले नाम: {names}',
      id: 'Blok pertemuan: {merge} ← {preds}. Masih dibaca tanpa versi: {names}',
      pt: 'Bloco de junção: {merge} ← {preds}. Ainda lidos sem versão: {names}',
    },
    'caption.phi': {
      en: '{name} — arriving: {inc}. They differ → one φ, new version: {dst}',
      ko: '{name} — 들어오는 판: {inc}. 서로 다르다 → 파이 하나, 새 판: {dst}',
      ja: '{name} — 入ってくる版: {inc}。異なる → φ を一つ、新しい版: {dst}',
      zh: '{name} — 流入的版本: {inc}。不同 → 一个 φ，新版本: {dst}',
      ar: '{name} — الإصدارات الواردة: {inc}. مختلفة → φ واحدة، إصدار جديد: {dst}',
      es: '{name} — versiones que llegan: {inc}. Distintas → una φ, versión nueva: {dst}',
      fr: '{name} — versions entrantes : {inc}. Différentes → une φ, nouvelle version : {dst}',
      hi: '{name} — आने वाले संस्करण: {inc}. अलग हैं → एक φ, नया संस्करण: {dst}',
      id: '{name} — versi yang masuk: {inc}. Berbeda → satu φ, versi baru: {dst}',
      pt: '{name} — versões que chegam: {inc}. Diferentes → uma φ, versão nova: {dst}',
    },
    'caption.pass': {
      en: '{name} — arriving: {inc}. Same → no φ, passes through: {ver}',
      ko: '{name} — 들어오는 판: {inc}. 같다 → 파이 없음, 그대로 지나감: {ver}',
      ja: '{name} — 入ってくる版: {inc}。同じ → φ なし、そのまま通過: {ver}',
      zh: '{name} — 流入的版本: {inc}。相同 → 无 φ，直接通过: {ver}',
      ar: '{name} — الإصدارات الواردة: {inc}. متطابقة → لا φ، يمر كما هو: {ver}',
      es: '{name} — versiones que llegan: {inc}. Iguales → sin φ, pasa tal cual: {ver}',
      fr: '{name} — versions entrantes : {inc}. Identiques → pas de φ, passe telle quelle : {ver}',
      hi: '{name} — आने वाले संस्करण: {inc}. समान → कोई φ नहीं, जैसा है वैसा गुज़रता है: {ver}',
      id: '{name} — versi yang masuk: {inc}. Sama → tanpa φ, lewat apa adanya: {ver}',
      pt: '{name} — versões que chegam: {inc}. Iguais → sem φ, passa como está: {ver}',
    },
    'caption.rename': {
      en: 'The body of {block} now reads the merged versions. Reads rewritten: {n}',
      ko: '{block} 몸이 모인 판을 읽는다. 바뀐 읽기 자리: {n}',
      ja: '{block} の本体が合流した版を読む。書き換えた読み取り: {n}',
      zh: '{block} 的主体改读汇合后的版本。改写的读取处: {n}',
      ar: 'جسم {block} يقرأ الآن الإصدارات المدمجة. مواضع القراءة المعدلة: {n}',
      es: 'El cuerpo de {block} lee ahora las versiones unidas. Lecturas reescritas: {n}',
      fr: 'Le corps de {block} lit désormais les versions fusionnées. Lectures réécrites : {n}',
      hi: '{block} का शरीर अब मिले हुए संस्करण पढ़ता है. बदले गए पठन स्थान: {n}',
      id: 'Badan {block} kini membaca versi yang digabung. Tempat baca yang diubah: {n}',
      pt: 'O corpo de {block} agora lê as versões unidas. Leituras reescritas: {n}',
    },
    'caption.run.path': {
      en: 'Run with {input}. Path: {path}. Returned: {result}',
      ko: '돌림 {input}. 지나간 길: {path}. 돌려준 값: {result}',
      ja: '実行 {input}。通った道: {path}。返した値: {result}',
      zh: '运行 {input}。经过的路径: {path}。返回值: {result}',
      ar: 'تشغيل مع {input}. المسار: {path}. القيمة المعادة: {result}',
      es: 'Ejecución con {input}. Camino: {path}. Valor devuelto: {result}',
      fr: 'Exécution avec {input}. Chemin : {path}. Valeur renvoyée : {result}',
      hi: '{input} के साथ चलाना. रास्ता: {path}. लौटाया गया मान: {result}',
      id: 'Jalankan dengan {input}. Jalur: {path}. Nilai kembali: {result}',
      pt: 'Execução com {input}. Caminho: {path}. Valor devolvido: {result}',
    },
    'caption.run.pick': {
      en: 'Came in from: {from} → each φ takes that side: {picks}',
      ko: '들어온 쪽: {from} → 파이마다 그쪽 판을 고른다: {picks}',
      ja: '入ってきた側: {from} → 各 φ はその側の版を選ぶ: {picks}',
      zh: '进入的一侧: {from} → 每个 φ 选取该侧的版本: {picks}',
      ar: 'جاء من: {from} → كل φ تأخذ إصدار ذلك الجانب: {picks}',
      es: 'Entró desde: {from} → cada φ toma ese lado: {picks}',
      fr: 'Entré depuis : {from} → chaque φ prend ce côté : {picks}',
      hi: 'यहाँ से आया: {from} → हर φ उसी ओर का संस्करण चुनता है: {picks}',
      id: 'Masuk dari: {from} → setiap φ mengambil sisi itu: {picks}',
      pt: 'Entrou por: {from} → cada φ pega esse lado: {picks}',
    },
    'label.pass': {
      en: 'passes',
      ko: '지나감',
      ja: '通過',
      zh: '通过',
      ar: 'يمر',
      es: 'pasa',
      fr: 'passe',
      hi: 'गुज़रता',
      id: 'lewat',
      pt: 'passa',
    },
  },
  blocks: {
    stage: { type: 'phi-merges-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
