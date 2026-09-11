/**
 * editDistance — 표를 다 채우면 숫자 하나가 아니라 고치는 방법이 나온다.
 *
 * 손잡이 하나가 답을 다른 것으로 만드는 완제품이다. 교체를 비싸게 매기면 한 번의
 * 바꿈 대신 넣기와 지우기 둘로 돌아가고, 되짚은 길이 눈에 띄게 달라진다.
 *
 * `initialData` 에는 **1차 데이터만** 둔다 — 낱말 둘과 손잡이의 처음 자리. 표도
 * 되짚은 길도 고침 목록도 algorithm 이 직접 셈한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const editDistanceFacet: FacetJson = {
  id: 'facet:editDistance',

  title: {
    en: 'Edit distance',
    ko: '편집 거리',
    ja: '編集距離',
    zh: '编辑距离',
    ar: 'مسافة التحرير',
    es: 'Distancia de edición',
    fr: "Distance d'édition",
    hi: 'संपादन दूरी',
    id: 'Jarak penyuntingan',
    pt: 'Distância de edição',
  },

  description: {
    en: 'Filling the table gives a number, but walking back through it gives the actual list of fixes — and what you price dearly changes that list.',
    ko: '표를 다 채우면 숫자 하나가 나오지만, 그 표를 되짚으면 실제 고침 목록이 나온다. 그리고 무엇을 비싸게 매기느냐가 그 목록을 바꾼다.',
    ja: '表を埋めると数が一つ出るが、その表を逆にたどると実際の修正の一覧が出る。そして何を高く見積もるかがその一覧を変える。',
    zh: '把表填满会得到一个数字，而倒着回溯这张表会得到真正的修改清单——你把什么定得贵，清单就会跟着变。',
    ar: 'ملء الجدول يعطي رقمًا واحدًا، لكن تتبّعه عكسيًا يعطي قائمة التعديلات الفعلية — وما تجعله غاليًا يغيّر تلك القائمة.',
    es: 'Rellenar la tabla da un número, pero recorrerla hacia atrás da la lista real de arreglos, y lo que encarezcas cambia esa lista.',
    fr: "Remplir la table donne un nombre, mais la parcourir à rebours donne la vraie liste des corrections — et ce que l'on rend cher change cette liste.",
    hi: 'तालिका भरने से एक संख्या मिलती है, पर उसे उल्टा चलने से असली सुधारों की सूची मिलती है — और आप जिसे महँगा रखते हैं वही सूची बदल देता है।',
    id: 'Mengisi tabel memberi satu angka, tetapi menelusurinya mundur memberi daftar perbaikan yang sebenarnya — dan apa yang dihargai mahal akan mengubah daftar itu.',
    pt: 'Preencher a tabela dá um número, mas percorrê-la ao contrário dá a lista real de correções — e aquilo que se torna caro muda essa lista.',
  },

  algorithm: 'module:editDistance',
  projector: 'module:editDistanceProjector',

  initialData: {
    type: 'edit-distance',
    /** 고치는 쪽. 표의 세로. */
    source: 'intention',
    /** 맞출 쪽. 표의 가로. */
    target: 'execution',
    /** 손잡이의 처음 자리. 되돌리면 control-bar 가 슬라이더도 이 값으로 돌린다. */
    subCost: 1,
    /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 저작 결정이다. */
    stepMs: 150,
  },

  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },

  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'edit-distance-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'sub-cost',
          name: 'subCost',
          label: {
            en: 'Substitution cost',
            ko: '교체 비용',
            ja: '置換コスト',
            zh: '替换代价',
            ar: 'كلفة الاستبدال',
            es: 'Coste de sustitución',
            fr: 'Coût de substitution',
            hi: 'प्रतिस्थापन लागत',
            id: 'Biaya penggantian',
            pt: 'Custo de substituição',
          },
          segments: [
            { value: 1, label: '1', default: true },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
          ],
        },
      ],
      metrics: [
        {
          name: 'cost-sum',
          label: {
            en: 'Total cost',
            ko: '드는 값',
            ja: '合計コスト',
            zh: '总代价',
            ar: 'الكلفة الكلية',
            es: 'Coste total',
            fr: 'Coût total',
            hi: 'कुल लागत',
            id: 'Total biaya',
            pt: 'Custo total',
          },
          initial: 0,
        },
        {
          name: 'fix-count',
          label: {
            en: 'Fixes',
            ko: '고침',
            ja: '手直し',
            zh: '修改',
            ar: 'التعديلات',
            es: 'Arreglos',
            fr: 'Corrections',
            hi: 'सुधार',
            id: 'Perbaikan',
            pt: 'Correções',
          },
          initial: 0,
        },
        {
          name: 'replace-count',
          label: {
            en: 'Replacements',
            ko: '바꿈',
            ja: '置換',
            zh: '替换',
            ar: 'الاستبدالات',
            es: 'Sustituciones',
            fr: 'Substitutions',
            hi: 'प्रतिस्थापन',
            id: 'Penggantian',
            pt: 'Substituições',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:edit-distance-imperative',
      label: {
        en: 'Fill and walk back',
        ko: '채우기와 되짚기',
        ja: '埋めることと逆にたどること',
        zh: '填表与回溯',
        ar: 'الملء والتتبّع العكسي',
        es: 'Rellenar y retroceder',
        fr: 'Remplir et remonter',
        hi: 'भरना और पीछे लौटना',
        id: 'Mengisi dan menelusuri mundur',
        pt: 'Preencher e voltar atrás',
      },
    },
  },

  messages: {
    'caption.start': {
      en: 'Substitution costs {sub}. The table fills from the corner outwards.',
      ko: '교체 비용이 {sub}. 표는 구석에서부터 차 나간다.',
      ja: '置換のコストは {sub}。表は角から埋まっていく。',
      zh: '替换的代价是 {sub}。表从角落开始往外填。',
      ar: 'كلفة الاستبدال {sub}. يمتلئ الجدول من الزاوية إلى الخارج.',
      es: 'Sustituir cuesta {sub}. La tabla se llena desde la esquina hacia fuera.',
      fr: 'Une substitution coûte {sub}. La table se remplit depuis le coin.',
      hi: 'प्रतिस्थापन की लागत {sub} है। तालिका कोने से बाहर की ओर भरती है।',
      id: 'Penggantian berharga {sub}. Tabel terisi dari sudut ke luar.',
      pt: 'Substituir custa {sub}. A tabela enche-se a partir do canto.',
    },

    'caption.filled': {
      en: 'The table is full. The last cell says {n}.',
      ko: '표가 다 찼다. 마지막 칸이 말하는 수는 {n}.',
      ja: '表が埋まった。最後のマスが言う数は {n}。',
      zh: '表填满了。最后一格说的是 {n}。',
      ar: 'امتلأ الجدول. الخانة الأخيرة تقول {n}.',
      es: 'La tabla está llena. La última celda dice {n}.',
      fr: 'La table est pleine. La dernière case dit {n}.',
      hi: 'तालिका भर गई। आख़िरी खाना कहता है {n}।',
      id: 'Tabel sudah penuh. Sel terakhir berkata {n}.',
      pt: 'A tabela está cheia. A última célula diz {n}.',
    },

    'caption.back': {
      en: 'Walking back from that cell — every step names one edit.',
      ko: '그 칸에서 거꾸로 짚어 나간다 — 한 걸음이 손질 하나의 이름이다.',
      ja: 'そのマスから逆にたどる — 一歩ごとに手直しがひとつ決まる。',
      zh: '从那一格倒着走回去——每一步就是一次修改。',
      ar: 'نعود من تلك الخانة إلى الوراء — كل خطوة تسمّي تعديلًا واحدًا.',
      es: 'Volvemos atrás desde esa celda: cada paso nombra una edición.',
      fr: 'On repart en arrière depuis cette case : chaque pas nomme une correction.',
      hi: 'उस खाने से उल्टा चलते हैं — हर क़दम एक सुधार का नाम है।',
      id: 'Menelusuri mundur dari sel itu — tiap langkah menyebut satu suntingan.',
      pt: 'Voltamos para trás a partir dessa célula — cada passo nomeia uma edição.',
    },

    'caption.collect': {
      en: 'Read the walk forwards and the fix list falls out.',
      ko: '그 길을 읽는 차례로 다시 훑으면 고침 목록이 나온다.',
      ja: 'その道を読む順にたどり直すと、修正の一覧が出てくる。',
      zh: '按阅读顺序再走一遍这条路，修改清单就出来了。',
      ar: 'اقرأ المسار من بدايته فتظهر قائمة التعديلات.',
      es: 'Leyendo el camino hacia delante aparece la lista de arreglos.',
      fr: "En relisant le chemin dans l'ordre, la liste des corrections apparaît.",
      hi: 'उसी रास्ते को सीधे क्रम में पढ़ें तो सुधारों की सूची निकल आती है।',
      id: 'Baca jalur itu maju, daftar perbaikan pun muncul.',
      pt: 'Lendo o caminho para a frente, sai a lista de correções.',
    },

    'caption.verdict': {
      en: 'Cost {sub}: {fix} fixes, {rep} of them replacements, {cost} in total.',
      ko: '비용 {sub} — 고침은 {fix} 가지, 그중 바꿈이 {rep}, 합은 {cost}.',
      ja: 'コスト {sub} — 手直しは {fix} 件、うち置換が {rep}、合計は {cost}。',
      zh: '代价 {sub} —— 修改 {fix} 处，其中替换 {rep} 处，合计 {cost}。',
      ar: 'الكلفة {sub}: {fix} تعديلات، منها {rep} استبدالات، والمجموع {cost}.',
      es: 'Coste {sub}: {fix} arreglos, {rep} de ellos sustituciones, {cost} en total.',
      fr: 'Coût {sub} : {fix} corrections, dont {rep} substitutions, {cost} au total.',
      hi: 'लागत {sub}: {fix} सुधार, उनमें {rep} प्रतिस्थापन, कुल {cost}।',
      id: 'Biaya {sub}: {fix} perbaikan, {rep} di antaranya penggantian, totalnya {cost}.',
      pt: 'Custo {sub}: {fix} correções, {rep} delas substituições, {cost} no total.',
    },

    'caption.waiting': {
      en: 'Move the substitution cost to fix the same two words another way.',
      ko: '교체 비용을 밀면 같은 두 낱말을 다른 방법으로 고친다.',
      ja: '置換コストを動かすと、同じ二つの語を別のやり方で直す。',
      zh: '拨动替换代价，同样的两个词就会以另一种方式被修改。',
      ar: 'حرّك كلفة الاستبدال لتصحيح الكلمتين نفسهما بطريقة أخرى.',
      es: 'Mueve el coste de sustitución para arreglar las mismas dos palabras de otra manera.',
      fr: 'Déplacez le coût de substitution pour corriger les deux mêmes mots autrement.',
      hi: 'प्रतिस्थापन की लागत बदलें और वही दो शब्द दूसरे तरीक़े से सुधरेंगे।',
      id: 'Geser biaya penggantian untuk memperbaiki dua kata yang sama dengan cara lain.',
      pt: 'Mova o custo de substituição para corrigir as mesmas duas palavras de outro modo.',
    },

    'fix.replace': {
      en: 'replace {a} with {b}',
      ko: '{a} 를 {b} 로 바꿈',
      ja: '{a} を {b} に置換',
      zh: '把 {a} 换成 {b}',
      ar: 'استبدل {a} بـ {b}',
      es: 'cambiar {a} por {b}',
      fr: 'remplacer {a} par {b}',
      hi: '{a} की जगह {b}',
      id: 'ganti {a} dengan {b}',
      pt: 'trocar {a} por {b}',
    },

    'fix.insert': {
      en: 'insert {b}',
      ko: '{b} 를 넣음',
      ja: '{b} を挿入',
      zh: '插入 {b}',
      ar: 'أدرج {b}',
      es: 'insertar {b}',
      fr: 'insérer {b}',
      hi: '{b} जोड़ें',
      id: 'sisipkan {b}',
      pt: 'inserir {b}',
    },

    'fix.delete': {
      en: 'delete {a}',
      ko: '{a} 를 지움',
      ja: '{a} を削除',
      zh: '删除 {a}',
      ar: 'احذف {a}',
      es: 'borrar {a}',
      fr: 'supprimer {a}',
      hi: '{a} हटाएँ',
      id: 'hapus {a}',
      pt: 'apagar {a}',
    },

    'label.before': {
      en: 'before',
      ko: '고치기 전',
      ja: '直す前',
      zh: '修改前',
      ar: 'قبل',
      es: 'antes',
      fr: 'avant',
      hi: 'पहले',
      id: 'sebelum',
      pt: 'antes',
    },

    'label.after': {
      en: 'after',
      ko: '고친 뒤',
      ja: '直した後',
      zh: '修改后',
      ar: 'بعد',
      es: 'después',
      fr: 'après',
      hi: 'बाद में',
      id: 'sesudah',
      pt: 'depois',
    },

    'label.answer': {
      en: 'Answer',
      ko: '답',
      ja: '答え',
      zh: '答案',
      ar: 'الجواب',
      es: 'Respuesta',
      fr: 'Réponse',
      hi: 'उत्तर',
      id: 'Jawaban',
      pt: 'Resposta',
    },

    'label.fixList': {
      en: 'Fix list',
      ko: '고침 목록',
      ja: '修正の一覧',
      zh: '修改清单',
      ar: 'قائمة التعديلات',
      es: 'Lista de arreglos',
      fr: 'Liste des corrections',
      hi: 'सुधारों की सूची',
      id: 'Daftar perbaikan',
      pt: 'Lista de correções',
    },
  },
};
