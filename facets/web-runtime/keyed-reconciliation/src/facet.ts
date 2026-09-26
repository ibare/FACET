/**
 * keyedReconciliation — facet 선언.
 *
 * 손잡이 둘(키 모드 · 목록 바뀜)로 열다섯 칸을 모두 만져 볼 수 있다. 데이터·계기 값은
 * `judge-sim.py reconciliation` 실측표(사양 `keyed-reconciliation` 사양의 "대조" 절)와
 * algorithm.ts · irs.ts 가 각각 셈해 맞춘다.
 */
import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const keyedReconciliationFacet: FacetJson = {
  id: 'facet:keyedReconciliation',
  title: {
    en: 'Keyed Reconciliation',
    ko: '키 기반 재조정',
    ja: 'キーによる再調整',
    zh: '基于键的协调',
    ar: 'التوفيق باستخدام المفتاح',
    es: 'Reconciliación por clave',
    fr: 'Réconciliation par clé',
    hi: 'कुंजी आधारित सामंजस्य',
    id: 'Rekonsiliasi berbasis kunci',
    pt: 'Reconciliação por chave',
  },
  description: {
    en: "Position-based matching and key-based matching turn the same list change into very different numbers of patches, creates, deletes, and moves — and decide whether a checked item's state follows the right node or drifts onto the wrong one.",
    ko: '자리로 맞추는 방식과 키로 맞추는 방식은 같은 목록 변화를 전혀 다른 수의 고침·만듦·지움·옮김으로 바꾸고, 눌린 칸이 옳은 노드를 따라가는지 엉뚱한 노드로 새는지를 가른다.',
    ja: '位置による対応付けとキーによる対応付けは、同じリスト変化を全く異なる数の更新・生成・削除・移動に変え、チェック状態が正しいノードに付いていくか間違ったノードに移るかを左右する。',
    zh: '按位置匹配和按键匹配会让同一次列表变化产生完全不同数量的修补、创建、删除和移动，并决定被选中项的状态是跟对了节点，还是漂移到了错误的节点上。',
    ar: 'تؤدي المطابقة حسب الموضع والمطابقة حسب المفتاح إلى تحويل نفس تغيير القائمة إلى أعداد مختلفة تمامًا من التصحيحات والإنشاءات والحذف والنقل، وتحدد ما إذا كانت حالة العنصر المحدد تتبع العقدة الصحيحة أم تنجرف إلى عقدة خاطئة.',
    es: 'La coincidencia por posición y la coincidencia por clave convierten el mismo cambio de lista en cantidades muy distintas de parches, creaciones, eliminaciones y movimientos, y determinan si el estado de un elemento marcado sigue al nodo correcto o se desvía hacia uno equivocado.',
    fr: "La correspondance par position et la correspondance par clé transforment le même changement de liste en des nombres très différents de correctifs, créations, suppressions et déplacements, et déterminent si l'état d'un élément coché suit le bon nœud ou dérive vers le mauvais.",
    hi: 'स्थिति के आधार पर मिलान और कुंजी के आधार पर मिलान एक ही सूची परिवर्तन को पैच, निर्माण, हटाने और स्थानांतरण की बिल्कुल अलग संख्या में बदल देते हैं, और तय करते हैं कि चेक किए गए आइटम की स्थिति सही नोड के साथ जाती है या गलत नोड पर बहक जाती है।',
    id: 'Pencocokan berdasarkan posisi dan berdasarkan kunci mengubah perubahan daftar yang sama menjadi jumlah tambal, buat, hapus, dan pindah yang sangat berbeda, serta menentukan apakah status item yang dicentang mengikuti simpul yang benar atau bergeser ke simpul yang salah.',
    pt: 'A correspondência por posição e por chave transforma a mesma mudança de lista em números muito diferentes de correções, criações, exclusões e movimentos, e determina se o estado de um item marcado segue o nó correto ou desvia para o nó errado.',
  },
  algorithm: 'module:keyedReconciliation',
  projector: 'module:keyedReconciliationProjector',
  initialData: {
    type: 'keyedReconciliation',
    stepMs: 1400,
    oldItems: ['a', 'b', 'c', 'd', 'e'],
    checkedItem: 'b',
    keyModeIds: ['none', 'index', 'id'],
    changeIds: ['prepend', 'append', 'remove-first', 'reverse', 'retag'],
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'keyed-reconciliation-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'keyMode',
          name: 'keyMode',
          label: {
            en: 'Key mode',
            ko: '키 모드',
            ja: 'キーモード',
            zh: '键模式',
            ar: 'وضع المفتاح',
            es: 'Modo de clave',
            fr: 'Mode de clé',
            hi: 'कुंजी मोड',
            id: 'Mode kunci',
            pt: 'Modo de chave',
          },
          segments: [
            {
              value: 0,
              default: true,
              label: {
                en: 'None', ko: '없음', ja: 'なし', zh: '无', ar: 'بدون',
                es: 'Ninguna', fr: 'Aucune', hi: 'कोई नहीं', id: 'Tidak ada', pt: 'Nenhuma',
              },
            },
            {
              value: 1,
              label: {
                en: 'By position', ko: '자리 번호', ja: '位置順', zh: '按位置', ar: 'حسب الموضع',
                es: 'Por posición', fr: 'Par position', hi: 'स्थिति अनुसार', id: 'Berdasarkan posisi', pt: 'Por posição',
              },
            },
            {
              value: 2,
              label: {
                en: 'By key', ko: '고유 키', ja: 'キー順', zh: '按键', ar: 'حسب المفتاح',
                es: 'Por clave', fr: 'Par clé', hi: 'कुंजी अनुसार', id: 'Berdasarkan kunci', pt: 'Por chave',
              },
            },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'change',
          name: 'change',
          label: {
            en: 'List change',
            ko: '목록 바뀜',
            ja: 'リスト変更',
            zh: '列表变化',
            ar: 'تغيير القائمة',
            es: 'Cambio de lista',
            fr: 'Changement de liste',
            hi: 'सूची परिवर्तन',
            id: 'Perubahan daftar',
            pt: 'Mudança de lista',
          },
          segments: [
            {
              value: 0,
              default: true,
              label: {
                en: 'Prepend', ko: '맨 앞에 넣기', ja: '先頭に追加', zh: '插入到最前', ar: 'إضافة في البداية',
                es: 'Insertar al inicio', fr: 'Ajouter au début', hi: 'आगे जोड़ें', id: 'Tambah di depan', pt: 'Inserir no início',
              },
            },
            {
              value: 1,
              label: {
                en: 'Append', ko: '맨 뒤에 넣기', ja: '末尾に追加', zh: '添加到最后', ar: 'إضافة في النهاية',
                es: 'Añadir al final', fr: 'Ajouter à la fin', hi: 'अंत में जोड़ें', id: 'Tambah di akhir', pt: 'Adicionar no final',
              },
            },
            {
              value: 2,
              label: {
                en: 'Remove first', ko: '앞에서 빼기', ja: '先頭を削除', zh: '移除第一个', ar: 'إزالة الأول',
                es: 'Quitar el primero', fr: 'Retirer le premier', hi: 'पहला हटाएँ', id: 'Hapus yang pertama', pt: 'Remover o primeiro',
              },
            },
            {
              value: 3,
              label: {
                en: 'Reverse', ko: '뒤집기', ja: '反転', zh: '反转', ar: 'عكس',
                es: 'Invertir', fr: 'Inverser', hi: 'उलटें', id: 'Balik', pt: 'Inverter',
              },
            },
            {
              value: 4,
              label: {
                en: 'Change tag', ko: '태그 바꾸기', ja: 'タグ変更', zh: '更改标签', ar: 'تغيير الوسم',
                es: 'Cambiar etiqueta', fr: 'Changer la balise', hi: 'टैग बदलें', id: 'Ubah tag', pt: 'Mudar tag',
              },
            },
          ],
        },
      ],
      metrics: [
        {
          name: 'patched',
          initial: 0,
          label: {
            en: 'Patched', ko: '고침', ja: '更新', zh: '修补', ar: 'تصحيح',
            es: 'Parcheado', fr: 'Corrigé', hi: 'पैच किया', id: 'Ditambal', pt: 'Corrigido',
          },
        },
        {
          name: 'created',
          initial: 0,
          label: {
            en: 'Created', ko: '만듦', ja: '生成', zh: '创建', ar: 'إنشاء',
            es: 'Creado', fr: 'Créé', hi: 'बनाया', id: 'Dibuat', pt: 'Criado',
          },
        },
        {
          name: 'deleted',
          initial: 0,
          label: {
            en: 'Deleted', ko: '지움', ja: '削除', zh: '删除', ar: 'حذف',
            es: 'Eliminado', fr: 'Supprimé', hi: 'हटाया', id: 'Dihapus', pt: 'Excluído',
          },
        },
        {
          name: 'moved',
          initial: 0,
          label: {
            en: 'Moved', ko: '옮김', ja: '移動', zh: '移动', ar: 'نقل',
            es: 'Movido', fr: 'Déplacé', hi: 'स्थानांतरित', id: 'Dipindahkan', pt: 'Movido',
          },
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:keyed-reconciliation-imperative',
      label: {
        en: 'Code', ko: '코드', ja: 'コード', zh: '代码', ar: 'الكود',
        es: 'Código', fr: 'Code', hi: 'कोड', id: 'Kode', pt: 'Código',
      },
    },
  },
  messages: {
    'stage.oldList': {
      en: 'old list', ko: '옛 목록', ja: '旧リスト', zh: '旧列表', ar: 'القائمة القديمة',
      es: 'lista anterior', fr: 'ancienne liste', hi: 'पुरानी सूची', id: 'daftar lama', pt: 'lista antiga',
    },
    'stage.newList': {
      en: 'new list', ko: '새 목록', ja: '新リスト', zh: '新列表', ar: 'القائمة الجديدة',
      es: 'lista nueva', fr: 'nouvelle liste', hi: 'नई सूची', id: 'daftar baru', pt: 'lista nova',
    },
    'stage.actualList': {
      en: 'actual list', ko: '실제 목록', ja: '実際のリスト', zh: '实际列表', ar: 'القائمة الفعلية',
      es: 'lista real', fr: 'liste réelle', hi: 'वास्तविक सूची', id: 'daftar aktual', pt: 'lista real',
    },
    'stage.checkResultCorrect': {
      en: 'checked mark stayed with "{item}"',
      ko: '눌린 칸이 "{item}" 곁에 그대로 남았다',
      ja: 'チェックは "{item}" のそばに残った',
      zh: '勾选标记仍留在 "{item}" 旁边',
      ar: 'بقيت علامة الاختيار بجانب "{item}"',
      es: 'la marca se quedó junto a "{item}"',
      fr: 'la coche est restée à côté de "{item}"',
      hi: 'चेक निशान "{item}" के पास रहा',
      id: 'tanda centang tetap di sebelah "{item}"',
      pt: 'a marca permaneceu ao lado de "{item}"',
    },
    'stage.checkResultWrong': {
      en: 'checked mark ended up next to "{next}", not "{item}"',
      ko: '눌린 칸이 "{item}" 대신 "{next}" 곁으로 갔다',
      ja: 'チェックは "{item}" ではなく "{next}" のそばに移った',
      zh: '勾选标记跑到了 "{next}" 旁边，而不是 "{item}"',
      ar: 'انتقلت علامة الاختيار إلى جانب "{next}" بدلاً من "{item}"',
      es: 'la marca terminó junto a "{next}", no "{item}"',
      fr: "la coche s'est retrouvée à côté de \"{next}\", pas \"{item}\"",
      hi: 'चेक निशान "{item}" के बजाय "{next}" के पास चला गया',
      id: 'tanda centang berpindah ke sebelah "{next}", bukan "{item}"',
      pt: 'a marca acabou ao lado de "{next}", não "{item}"',
    },
    'stage.checkResultGone': {
      en: 'checked mark disappeared with the removed node',
      ko: '눌린 칸이 지워진 노드와 함께 사라졌다',
      ja: 'チェックは削除されたノードと共に消えた',
      zh: '勾选标记随被删除的节点一起消失了',
      ar: 'اختفت علامة الاختيار مع العقدة المحذوفة',
      es: 'la marca desapareció junto con el nodo eliminado',
      fr: 'la coche a disparu avec le nœud supprimé',
      hi: 'चेक निशान हटाए गए नोड के साथ गायब हो गया',
      id: 'tanda centang menghilang bersama simpul yang dihapus',
      pt: 'a marca desapareceu junto com o nó removido',
    },
  },
};
