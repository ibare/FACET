import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 꾸러미를 새로 내보낼 때, 무엇이 바뀌었느냐에 따라 버전의 세 자리 가운데 어느 것이 오르는가.
 */
export const threeNumbersFacet: FacetJson = {
  id: 'facet:threeNumbers',
  title: {
    en: 'Which of the three numbers goes up',
    ko: '세 자리 가운데 어느 수가 오르는가',
    ja: '三つの数のどれが上がるか',
    zh: '三个数字中哪一个会上升',
    ar: 'أيّ الأرقام الثلاثة يرتفع',
    es: 'Cuál de los tres números sube',
    fr: 'Lequel des trois nombres monte',
    hi: 'तीन संख्याओं में से कौन-सी बढ़ती है',
    id: 'Angka mana dari ketiganya yang naik',
    pt: 'Qual dos três números sobe',
  },
  description: {
    en: 'Each release, the heaviest change picks the place: that number goes up and every number to its right drops to 0.',
    ko: '내보낼 때마다 가장 무거운 바뀜이 자리를 고른다. 그 자리의 수가 오르고 오른쪽 수는 모두 0 으로 떨어진다.',
    ja: 'リリースのたびに最も重い変更が桁を選ぶ。その数が上がり、右側の数はすべて0に戻る。',
    zh: '每次发布，最重的变更决定位置：该位的数字加一，其右边的数字全部归零。',
    ar: 'في كل إصدار يختار التغيير الأثقل الخانة: يرتفع رقمها وتهبط كل الأرقام على يمينها إلى 0.',
    es: 'En cada versión, el cambio más pesado elige la posición: ese número sube y todos los de su derecha caen a 0.',
    fr: 'À chaque version, le changement le plus lourd choisit la position : ce nombre monte et tous ceux à sa droite retombent à 0.',
    hi: 'हर रिलीज़ में सबसे भारी बदलाव स्थान चुनता है: वह संख्या बढ़ती है और उसके दाईं ओर की सभी संख्याएँ 0 पर गिर जाती हैं।',
    id: 'Setiap rilis, perubahan terberat memilih posisinya: angka itu naik dan semua angka di kanannya jatuh ke 0.',
    pt: 'A cada lançamento, a mudança mais pesada escolhe a posição: esse número sobe e todos à sua direita caem para 0.',
  },
  algorithm: 'module:threeNumbers',
  scene: 'module:threeNumbersScene',
  initialData: {
    type: 'three-numbers',
    stepMs: 1300,
    start: '1.4.2',
    releases: [
      [{ id: 'fixTimeout', kind: 'fix' }],
      [
        { id: 'addRetry', kind: 'feature' },
        { id: 'fixTypo', kind: 'fix' },
      ],
      [
        { id: 'removeCallback', kind: 'breaking' },
        { id: 'addStream', kind: 'feature' },
        { id: 'fixLeak', kind: 'fix' },
      ],
      [{ id: 'fixHeader', kind: 'fix' }],
    ],
  },
  shuffleOnReset: false,
  blocks: {
    stage: { type: 'three-numbers-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'label.major': {
      en: 'Major', ko: '메이저', ja: 'メジャー', zh: '主版本', ar: 'رئيسي',
      es: 'Mayor', fr: 'Majeure', hi: 'मेजर', id: 'Mayor', pt: 'Maior',
    },
    'label.minor': {
      en: 'Minor', ko: '마이너', ja: 'マイナー', zh: '次版本', ar: 'فرعي',
      es: 'Menor', fr: 'Mineure', hi: 'माइनर', id: 'Minor', pt: 'Menor',
    },
    'label.patch': {
      en: 'Patch', ko: '패치', ja: 'パッチ', zh: '修订号', ar: 'تصحيح',
      es: 'Parche', fr: 'Correctif', hi: 'पैच', id: 'Patch', pt: 'Patch',
    },
    'label.breaking': {
      en: 'Breaking change', ko: '호환 깨짐', ja: '互換性の破壊', zh: '破坏兼容', ar: 'تغيير يكسر التوافق',
      es: 'Cambio incompatible', fr: 'Rupture de compatibilité', hi: 'संगतता तोड़ने वाला बदलाव',
      id: 'Perubahan tak kompatibel', pt: 'Mudança incompatível',
    },
    'label.feature': {
      en: 'New feature', ko: '기능 추가', ja: '機能追加', zh: '新增功能', ar: 'ميزة جديدة',
      es: 'Nueva función', fr: 'Nouvelle fonction', hi: 'नई सुविधा', id: 'Fitur baru', pt: 'Novo recurso',
    },
    'label.fix': {
      en: 'Fix', ko: '고침', ja: '修正', zh: '修复', ar: 'إصلاح',
      es: 'Corrección', fr: 'Correction', hi: 'सुधार', id: 'Perbaikan', pt: 'Correção',
    },
    'label.fixTimeout': {
      en: 'Timeout fix', ko: '시간 초과 고침', ja: 'タイムアウト修正', zh: '修复超时', ar: 'إصلاح انتهاء المهلة',
      es: 'Arreglo del tiempo de espera', fr: 'Correction du délai', hi: 'टाइमआउट सुधार',
      id: 'Perbaikan batas waktu', pt: 'Correção de tempo limite',
    },
    'label.addRetry': {
      en: 'Retry added', ko: '다시 시도 추가', ja: '再試行を追加', zh: '新增重试', ar: 'إضافة إعادة المحاولة',
      es: 'Reintento añadido', fr: 'Nouvel essai ajouté', hi: 'पुनः प्रयास जोड़ा',
      id: 'Coba ulang ditambahkan', pt: 'Nova tentativa adicionada',
    },
    'label.fixTypo': {
      en: 'Typo fix', ko: '오타 고침', ja: '誤字修正', zh: '修正笔误', ar: 'إصلاح خطأ مطبعي',
      es: 'Errata corregida', fr: 'Coquille corrigée', hi: 'वर्तनी सुधार', id: 'Perbaikan salah ketik', pt: 'Erro de digitação corrigido',
    },
    'label.removeCallback': {
      en: 'Callback style removed', ko: '콜백 방식 없앰', ja: 'コールバック方式を廃止', zh: '移除回调方式', ar: 'إزالة أسلوب الاستدعاء الراجع',
      es: 'Callbacks eliminados', fr: 'Style callback retiré', hi: 'कॉलबैक शैली हटाई',
      id: 'Gaya callback dihapus', pt: 'Estilo callback removido',
    },
    'label.addStream': {
      en: 'Streams added', ko: '스트림 추가', ja: 'ストリームを追加', zh: '新增流', ar: 'إضافة التدفقات',
      es: 'Streams añadidos', fr: 'Flux ajoutés', hi: 'स्ट्रीम जोड़े', id: 'Stream ditambahkan', pt: 'Streams adicionados',
    },
    'label.fixLeak': {
      en: 'Memory leak fix', ko: '메모리 새는 곳 고침', ja: 'メモリリーク修正', zh: '修复内存泄漏', ar: 'إصلاح تسرّب الذاكرة',
      es: 'Fuga de memoria corregida', fr: 'Fuite mémoire corrigée', hi: 'मेमोरी लीक सुधार',
      id: 'Perbaikan kebocoran memori', pt: 'Vazamento de memória corrigido',
    },
    'label.fixHeader': {
      en: 'Header fix', ko: '헤더 고침', ja: 'ヘッダー修正', zh: '修复头部', ar: 'إصلاح الترويسة',
      es: 'Cabecera corregida', fr: 'En-tête corrigé', hi: 'हेडर सुधार', id: 'Perbaikan header', pt: 'Cabeçalho corrigido',
    },
    'caption.start': {
      en: 'Current version: {version}',
      ko: '지금 버전: {version}',
      ja: '現在のバージョン: {version}',
      zh: '当前版本：{version}',
      ar: 'الإصدار الحالي: {version}',
      es: 'Versión actual: {version}',
      fr: 'Version actuelle : {version}',
      hi: 'वर्तमान संस्करण: {version}',
      id: 'Versi sekarang: {version}',
      pt: 'Versão atual: {version}',
    },
    'caption.release': {
      en: 'Release {n} · changes: {count} · heaviest: {kind}',
      ko: '내보냄 {n} · 바뀐 것: {count} · 가장 무거운 것: {kind}',
      ja: 'リリース {n} · 変更: {count} · 最も重いもの: {kind}',
      zh: '发布 {n} · 变更：{count} · 最重：{kind}',
      ar: 'الإصدار {n} · التغييرات: {count} · الأثقل: {kind}',
      es: 'Versión {n} · cambios: {count} · el más pesado: {kind}',
      fr: 'Version {n} · changements : {count} · le plus lourd : {kind}',
      hi: 'रिलीज़ {n} · बदलाव: {count} · सबसे भारी: {kind}',
      id: 'Rilis {n} · perubahan: {count} · terberat: {kind}',
      pt: 'Lançamento {n} · mudanças: {count} · mais pesada: {kind}',
    },
    'caption.bump': {
      en: '{from} → {to} · raised: {place} · dropped to 0: {dropped}',
      ko: '{from} → {to} · 올린 자리: {place} · 0 으로 떨어진 자리: {dropped}',
      ja: '{from} → {to} · 上げた桁: {place} · 0 に落ちた桁: {dropped}',
      zh: '{from} → {to} · 上升的位：{place} · 归零的位：{dropped}',
      ar: '{from} → {to} · الخانة المرفوعة: {place} · الهابطة إلى 0: {dropped}',
      es: '{from} → {to} · sube: {place} · cae a 0: {dropped}',
      fr: '{from} → {to} · monte : {place} · retombe à 0 : {dropped}',
      hi: '{from} → {to} · बढ़ा स्थान: {place} · 0 पर गिरे: {dropped}',
      id: '{from} → {to} · naik: {place} · jatuh ke 0: {dropped}',
      pt: '{from} → {to} · sobe: {place} · cai para 0: {dropped}',
    },
    'caption.bumpNoDrop': {
      en: '{from} → {to} · raised: {place} · dropped to 0: none',
      ko: '{from} → {to} · 올린 자리: {place} · 0 으로 떨어진 자리: 없음',
      ja: '{from} → {to} · 上げた桁: {place} · 0 に落ちた桁: なし',
      zh: '{from} → {to} · 上升的位：{place} · 归零的位：无',
      ar: '{from} → {to} · الخانة المرفوعة: {place} · الهابطة إلى 0: لا شيء',
      es: '{from} → {to} · sube: {place} · cae a 0: ninguno',
      fr: '{from} → {to} · monte : {place} · retombe à 0 : aucun',
      hi: '{from} → {to} · बढ़ा स्थान: {place} · 0 पर गिरे: कोई नहीं',
      id: '{from} → {to} · naik: {place} · jatuh ke 0: tidak ada',
      pt: '{from} → {to} · sobe: {place} · cai para 0: nenhum',
    },
    'caption.done': {
      en: 'Releases: {releases} · changes: {changes} · drops to 0: {drops}',
      ko: '내보냄: {releases} · 바뀐 것: {changes} · 0 으로 떨어진 일: {drops}',
      ja: 'リリース: {releases} · 変更: {changes} · 0 に落ちた回数: {drops}',
      zh: '发布：{releases} · 变更：{changes} · 归零次数：{drops}',
      ar: 'الإصدارات: {releases} · التغييرات: {changes} · مرات الهبوط إلى 0: {drops}',
      es: 'Versiones: {releases} · cambios: {changes} · caídas a 0: {drops}',
      fr: 'Versions : {releases} · changements : {changes} · retombées à 0 : {drops}',
      hi: 'रिलीज़: {releases} · बदलाव: {changes} · 0 पर गिरना: {drops}',
      id: 'Rilis: {releases} · perubahan: {changes} · jatuh ke 0: {drops}',
      pt: 'Lançamentos: {releases} · mudanças: {changes} · quedas para 0: {drops}',
    },
  },
};
