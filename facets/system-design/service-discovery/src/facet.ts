/**
 * 서비스 디스커버리 — 선언.
 *
 * 1차 데이터: 서비스 · 인스턴스 넷(식별자 · 주소) · 멈춤(누가 · 언제) · 틱 수 · 하트비트 간격 ·
 * 잃음 확률 · 씨앗 · 틱마다 요청 수 · 만료 사다리. 잃음 표 · 명단 · 고른 곳 · 계기는 알고리즘이 셈한다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { ServiceDiscoveryData } from './algorithm.js';

const initialData: ServiceDiscoveryData = {
  type: 'service-discovery',
  stepMs: 500,
  motionMs: 300,
  service: 'payments',
  instances: [
    { id: 'a', addr: '10.0.2.21:8080' },
    { id: 'b', addr: '10.0.2.22:8080' },
    { id: 'c', addr: '10.0.2.23:8080' },
    { id: 'd', addr: '10.0.2.24:8080' },
  ],
  stop: { instance: 'd', tick: 10 },
  ticks: 24,
  beat: 2,
  lossPercent: 25,
  seed: 42,
  callsPerTick: 2,
  ladder: [3, 4, 5, 7, 9],
  defaultExpiry: 5,
};

export const serviceDiscoveryFacet: FacetJson = {
  id: 'facet:serviceDiscovery',
  title: {
    en: 'Service discovery',
    ko: '서비스 디스커버리',
    ja: 'サービスディスカバリー',
    zh: '服务发现',
    ar: 'اكتشاف الخدمات',
    es: 'Descubrimiento de servicios',
    fr: 'Découverte de services',
    hi: 'सर्विस डिस्कवरी',
    id: 'Service discovery',
    pt: 'Descoberta de serviços',
  },
  description: {
    en: 'The registry drops an instance once it has been silent for the expiry length. At expiry 3 a single lost heartbeat drops live instances 9 times; at expiry 9 none are dropped wrongly, but the stopped d stays listed 7 ticks and the gateway sends it 4 requests.',
    ko: '등록부는 만료 길이만큼 조용한 인스턴스를 지운다. 만료 3 에서는 하트비트 한 통만 잃어도 산 인스턴스를 9 번 지우고, 만료 9 에서는 잘못 지움이 0 이지만 멈춘 d 가 7 틱 남아 게이트웨이가 요청 4 개를 그리로 보낸다.',
    ja: 'レジストリは期限の長さだけ沈黙したインスタンスを消す。期限 3 ではハートビートを一通失うだけで生きたインスタンスを 9 回消し、期限 9 では誤った削除は 0 だが、止まった d が 7 ティック残り、ゲートウェイはそこへ 4 件のリクエストを送る。',
    zh: '注册表会删除沉默达到过期长度的实例。过期为 3 时，只丢一次心跳就会误删活着的实例 9 次；过期为 9 时误删为 0，但停止的 d 会留在名单上 7 个刻度，网关向它发出 4 个请求。',
    ar: 'يحذف السجل النسخة بعد أن تصمت طوال مدة الانتهاء. عند 3 يكفي فقدان نبضة واحدة لحذف نسخ حية 9 مرات؛ وعند 9 لا حذف خاطئ، لكن d المتوقفة تبقى في القائمة 7 نبضات ويرسل إليها البوابة 4 طلبات.',
    es: 'El registro elimina una instancia cuando lleva en silencio lo que dura la expiración. Con 3, perder un solo latido elimina instancias vivas 9 veces; con 9 no hay bajas erróneas, pero la d detenida sigue en la lista 7 ticks y la pasarela le envía 4 peticiones.',
    fr: 'Le registre retire une instance restée muette pendant la durée d’expiration. À 3, un seul battement perdu retire des instances vivantes 9 fois ; à 9, aucun retrait erroné, mais la d arrêtée reste listée 7 ticks et la passerelle lui envoie 4 requêtes.',
    hi: 'रजिस्ट्री उस इंस्टेंस को हटा देती है जो समाप्ति-अवधि जितना चुप रहा। समाप्ति 3 पर एक ही हार्टबीट खोने से जीवित इंस्टेंस 9 बार हटते हैं; 9 पर गलत हटाना 0 है, पर रुका हुआ d 7 टिक सूची में रहता है और गेटवे उसे 4 अनुरोध भेजता है।',
    id: 'Registri menghapus instans yang diam selama panjang kedaluwarsa. Pada 3, kehilangan satu heartbeat saja menghapus instans hidup 9 kali; pada 9 tidak ada hapus keliru, tetapi d yang berhenti tetap terdaftar 7 tik dan gateway mengirim 4 permintaan ke sana.',
    pt: 'O registro remove uma instância quando ela fica em silêncio pelo tempo de expiração. Com 3, perder um único heartbeat remove instâncias vivas 9 vezes; com 9 não há remoção errada, mas a d parada fica listada 7 ticks e o gateway lhe envia 4 requisições.',
  },
  algorithm: 'module:serviceDiscovery',
  projector: 'module:serviceDiscoveryProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'service-discovery-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'expiry',
          name: 'expiry',
          label: {
            en: 'Expiry length',
            ko: '만료 길이',
            ja: '期限の長さ',
            zh: '过期长度',
            ar: 'مدة الانتهاء',
            es: 'Expiración',
            fr: 'Durée d’expiration',
            hi: 'समाप्ति अवधि',
            id: 'Panjang kedaluwarsa',
            pt: 'Tempo de expiração',
          },
          segments: [
            { value: 3, label: '3' },
            { value: 4, label: '4' },
            { value: 5, label: '5', default: true },
            { value: 7, label: '7' },
            { value: 9, label: '9' },
          ],
        },
      ],
      metrics: [
        {
          name: 'dead-calls',
          label: {
            en: 'Requests to a dead one',
            ko: '죽은 곳에 간 요청',
            ja: '死んだ先へのリクエスト',
            zh: '发往已停实例的请求',
            ar: 'طلبات إلى نسخة ميتة',
            es: 'Peticiones a una caída',
            fr: 'Requêtes vers une morte',
            hi: 'मृत पर गए अनुरोध',
            id: 'Permintaan ke yang mati',
            pt: 'Requisições a uma morta',
          },
          initial: 0,
        },
        {
          name: 'false-drops',
          label: {
            en: 'Live ones dropped',
            ko: '산 것을 지움',
            ja: '生きたものを削除',
            zh: '误删活实例',
            ar: 'حذف نسخ حية',
            es: 'Vivas eliminadas',
            fr: 'Vivantes retirées',
            hi: 'जीवित हटाए गए',
            id: 'Yang hidup dihapus',
            pt: 'Vivas removidas',
          },
          initial: 0,
        },
        {
          name: 'stale-ticks',
          label: {
            en: 'Ticks dead d stayed',
            ko: '죽은 d 가 남은 틱',
            ja: '止まった d が残ったティック',
            zh: '停止的 d 留存刻度',
            ar: 'نبضات بقاء d الميتة',
            es: 'Ticks con d caída',
            fr: 'Ticks où d morte reste',
            hi: 'मृत d के बचे टिक',
            id: 'Tik d mati tersisa',
            pt: 'Ticks com d morta',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:service-discovery-imperative',
      label: {
        en: 'Registry expiry and gateway pick',
        ko: '등록부 만료와 게이트웨이 고르기',
        ja: 'レジストリの期限とゲートウェイの選択',
        zh: '注册表过期与网关选择',
        ar: 'انتهاء السجل واختيار البوابة',
        es: 'Expiración del registro y elección de la pasarela',
        fr: 'Expiration du registre et choix de la passerelle',
        hi: 'रजिस्ट्री समाप्ति और गेटवे चयन',
        id: 'Kedaluwarsa registri dan pilihan gateway',
        pt: 'Expiração do registro e escolha do gateway',
      },
    },
  },
  messages: {
    'label.gateway': {
      en: 'Gateway', ko: '게이트웨이', ja: 'ゲートウェイ', zh: '网关', ar: 'البوابة',
      es: 'Pasarela', fr: 'Passerelle', hi: 'गेटवे', id: 'Gateway', pt: 'Gateway',
    },
    'label.roster': {
      en: 'roster', ko: '명단', ja: '名簿', zh: '名单', ar: 'القائمة',
      es: 'lista', fr: 'liste', hi: 'सूची', id: 'daftar', pt: 'lista',
    },
    'label.registry': {
      en: 'Registry', ko: '등록부', ja: 'レジストリ', zh: '注册表', ar: 'السجل',
      es: 'Registro', fr: 'Registre', hi: 'रजिस्ट्री', id: 'Registri', pt: 'Registro',
    },
    'label.quiet': {
      en: 'bar = ticks of silence', ko: '막대 = 조용한 틱 수', ja: '棒 = 沈黙したティック数', zh: '条 = 沉默的刻度数',
      ar: 'العمود = نبضات الصمت', es: 'barra = ticks en silencio', fr: 'barre = ticks de silence',
      hi: 'बार = चुप टिक', id: 'batang = tik diam', pt: 'barra = ticks em silêncio',
    },
    'label.tick': {
      en: 'tick {tick}', ko: '틱 {tick}', ja: 'ティック {tick}', zh: '刻度 {tick}', ar: 'النبضة {tick}',
      es: 'tick {tick}', fr: 'tick {tick}', hi: 'टिक {tick}', id: 'tik {tick}', pt: 'tick {tick}',
    },
    'label.up': {
      en: 'up', ko: '살아 있음', ja: '稼働中', zh: '存活', ar: 'تعمل',
      es: 'viva', fr: 'vivante', hi: 'चालू', id: 'hidup', pt: 'viva',
    },
    'label.stopped': {
      en: 'stopped', ko: '멈춤', ja: '停止', zh: '已停止', ar: 'متوقفة',
      es: 'detenida', fr: 'arrêtée', hi: 'रुका', id: 'berhenti', pt: 'parada',
    },
    'label.dropped': {
      en: 'dropped', ko: '지움', ja: '削除', zh: '已删除', ar: 'محذوفة',
      es: 'eliminada', fr: 'retirée', hi: 'हटाया', id: 'dihapus', pt: 'removida',
    },
    'label.rejoined': {
      en: 'back', ko: '다시 오름', ja: '再登録', zh: '重新上榜', ar: 'عادت',
      es: 'de vuelta', fr: 'revenue', hi: 'फिर जुड़ा', id: 'kembali', pt: 'de volta',
    },
    'label.lost': {
      en: 'lost', ko: '잃음', ja: '消失', zh: '丢失', ar: 'فُقدت',
      es: 'perdido', fr: 'perdu', hi: 'खोया', id: 'hilang', pt: 'perdido',
    },
    'label.expiryLine': {
      en: 'expiry line: {n}', ko: '만료 선: {n}', ja: '期限線: {n}', zh: '过期线: {n}', ar: 'خط الانتهاء: {n}',
      es: 'línea de expiración: {n}', fr: 'ligne d’expiration : {n}', hi: 'समाप्ति रेखा: {n}',
      id: 'garis kedaluwarsa: {n}', pt: 'linha de expiração: {n}',
    },
    'caption.start': {
      en: 'Tick 0: {count} instances registered · expiry {n} ticks',
      ko: '틱 0: 인스턴스 {count} 개 등록 · 만료 {n} 틱',
      ja: 'ティック 0: インスタンス {count} 個を登録 · 期限 {n} ティック',
      zh: '刻度 0: 注册 {count} 个实例 · 过期 {n} 个刻度',
      ar: 'النبضة 0: تسجيل {count} نسخ · الانتهاء {n} نبضات',
      es: 'Tick 0: {count} instancias registradas · expiración {n} ticks',
      fr: 'Tick 0 : {count} instances enregistrées · expiration {n} ticks',
      hi: 'टिक 0: {count} इंस्टेंस दर्ज · समाप्ति {n} टिक',
      id: 'Tik 0: {count} instans terdaftar · kedaluwarsa {n} tik',
      pt: 'Tick 0: {count} instâncias registradas · expiração {n} ticks',
    },
    'caption.stop': {
      en: 'stops sending: {id}', ko: '멈춤: {id}', ja: '送信停止: {id}', zh: '停止发送: {id}', ar: 'توقفت عن الإرسال: {id}',
      es: 'deja de enviar: {id}', fr: 'cesse d’envoyer : {id}', hi: 'भेजना बंद: {id}', id: 'berhenti mengirim: {id}',
      pt: 'para de enviar: {id}',
    },
    'caption.heard': {
      en: 'heartbeats in: {ids}', ko: '닿은 소식: {ids}', ja: '届いたハートビート: {ids}', zh: '收到心跳: {ids}',
      ar: 'نبضات وصلت: {ids}', es: 'latidos recibidos: {ids}', fr: 'battements reçus : {ids}',
      hi: 'पहुँचे हार्टबीट: {ids}', id: 'heartbeat masuk: {ids}', pt: 'heartbeats recebidos: {ids}',
    },
    'caption.lost': {
      en: 'lost on the way: {ids}', ko: '길에서 잃음: {ids}', ja: '途中で消失: {ids}', zh: '途中丢失: {ids}',
      ar: 'فُقدت في الطريق: {ids}', es: 'perdidos en el camino: {ids}', fr: 'perdus en route : {ids}',
      hi: 'रास्ते में खोए: {ids}', id: 'hilang di jalan: {ids}', pt: 'perdidos no caminho: {ids}',
    },
    'caption.back': {
      en: 'back on the list: {ids}', ko: '다시 오름: {ids}', ja: '名簿に復帰: {ids}', zh: '重新上榜: {ids}',
      ar: 'عادت إلى القائمة: {ids}', es: 'de vuelta en la lista: {ids}', fr: 'de retour dans la liste : {ids}',
      hi: 'सूची में लौटे: {ids}', id: 'kembali ke daftar: {ids}', pt: 'de volta à lista: {ids}',
    },
    'caption.dropLive': {
      en: 'dropped while alive: {ids}', ko: '지움(살아 있음): {ids}', ja: '生きたまま削除: {ids}', zh: '活着却被删除: {ids}',
      ar: 'حُذفت وهي حية: {ids}', es: 'eliminadas estando vivas: {ids}', fr: 'retirées encore vivantes : {ids}',
      hi: 'जीवित रहते हटाए: {ids}', id: 'dihapus saat hidup: {ids}', pt: 'removidas ainda vivas: {ids}',
    },
    'caption.dropDead': {
      en: 'dropped after stopping: {ids}', ko: '지움(멈춘 것): {ids}', ja: '停止後に削除: {ids}', zh: '停止后删除: {ids}',
      ar: 'حُذفت بعد التوقف: {ids}', es: 'eliminadas tras detenerse: {ids}', fr: 'retirées après l’arrêt : {ids}',
      hi: 'रुकने के बाद हटाए: {ids}', id: 'dihapus setelah berhenti: {ids}', pt: 'removidas após parar: {ids}',
    },
    'caption.requests': {
      en: 'requests → {ids}', ko: '요청 → {ids}', ja: 'リクエスト → {ids}', zh: '请求 → {ids}', ar: 'الطلبات → {ids}',
      es: 'peticiones → {ids}', fr: 'requêtes → {ids}', hi: 'अनुरोध → {ids}', id: 'permintaan → {ids}', pt: 'requisições → {ids}',
    },
  },
};
