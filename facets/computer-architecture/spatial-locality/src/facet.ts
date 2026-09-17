/**
 * 공간 지역성 — 옆자리를 이어서 쓴다.
 *
 * 한 줄이 올라오면 그 줄이 다 쓰일 때까지 아래층을 찾지 않는다. 넷을 짚는 동안
 * 내려가는 일은 처음 한 번뿐이고, 줄이 끝나는 자리에서만 다시 내려간다.
 *
 * @piece
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const spatialLocalityFacet: FacetJson = {
  id: 'facet:spatialLocality',
  title: {
    en: 'Spatial locality',
    ko: '공간 지역성',
    ja: '空間局所性',
    zh: '空间局部性',
    ar: 'الموضعية المكانية',
    es: 'Localidad espacial',
    fr: 'Localité spatiale',
    hi: 'स्थानिक निकटता',
    id: 'Lokalitas spasial',
    pt: 'Localidade espacial',
  },
  description: {
    en: 'One line comes up, and the next three cost nothing.',
    ko: '한 줄이 올라오면 이어지는 셋은 공짜다.',
    ja: '1 ラインが上がれば、続く 3 つはただで済む。',
    zh: '一行上来之后，接下来的三个不再花代价。',
    ar: 'يصعد سطر واحد، فتأتي الثلاثة التالية بلا كلفة.',
    es: 'Sube una línea y los tres siguientes salen gratis.',
    fr: 'Une ligne monte, et les trois suivants ne coûtent rien.',
    hi: 'एक लाइन ऊपर आती है, और अगले तीन मुफ़्त पड़ते हैं।',
    id: 'Satu baris naik, dan tiga berikutnya gratis.',
    pt: 'Uma linha sobe e os três seguintes saem de graça.',
  },
  algorithm: 'module:spatialLocality',
  scene: 'module:spatialLocalityScene',
  initialData: {
    type: 'spatialLocality',
    /** 캐시 라인 한 줄이 담는 바이트 수. */
    lineBytes: 16,
    /** 정수 하나의 바이트 수. 16 ÷ 4 라 한 줄에 넷이 실린다. */
    elemBytes: 4,
    /** a[0] 부터 a[7] 까지 차례로 짚는다. */
    count: 8,
    /** 걸음이 끝난 뒤의 정지 시간. 캡션을 읽을 틈이다. */
    stepMs: 650,
  },
  blocks: {
    stage: { type: 'spatial-locality-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.probe': {
      en: 'a[{i}] — address {addr}, line {line}. Not up here.',
      ko: 'a[{i}] — 주소 {addr}, 줄 {line}. 위층에 없다.',
      ja: 'a[{i}] — アドレス {addr}、ライン {line}。上位にはない。',
      zh: 'a[{i}] — 地址 {addr}，行 {line}。上层没有。',
      ar: 'a[{i}] — العنوان {addr}، السطر {line}. ليس في الأعلى.',
      es: 'a[{i}]: dirección {addr}, línea {line}. No está arriba.',
      fr: 'a[{i}] — adresse {addr}, ligne {line}. Absent en haut.',
      hi: 'a[{i}] — पता {addr}, लाइन {line}। ऊपर नहीं है।',
      id: 'a[{i}] — alamat {addr}, baris {line}. Tidak ada di atas.',
      pt: 'a[{i}] — endereço {addr}, linha {line}. Não está aqui em cima.',
    },
    'caption.lift': {
      en: 'Miss. A whole line rises — {span} come up together.',
      ko: '미스. 아래층에서 한 줄이 통째로 올라온다 — 함께 오는 것은 {span}.',
      ja: 'ミス。1 ラインがまるごと上がる — 一緒に来るのは {span}。',
      zh: '未命中。整行上移 — 一起上来的有 {span}。',
      ar: 'إخفاق. يصعد سطر كامل — يأتي معه {span}.',
      es: 'Fallo. Sube una línea entera: suben juntos {span}.',
      fr: 'Échec. Une ligne entière monte : ils montent ensemble, {span}.',
      hi: 'मिस। पूरी लाइन ऊपर आती है — साथ आते हैं {span}।',
      id: 'Miss. Satu baris utuh naik — yang ikut naik {span}.',
      pt: 'Falha. Uma linha inteira sobe — sobem juntos {span}.',
    },
    'caption.hit': {
      en: 'a[{i}] — address {addr}, line {line}. Already up here.',
      ko: 'a[{i}] — 주소 {addr}, 줄 {line}. 이미 위층에 있다.',
      ja: 'a[{i}] — アドレス {addr}、ライン {line}。すでに上位にある。',
      zh: 'a[{i}] — 地址 {addr}，行 {line}。已经在上层。',
      ar: 'a[{i}] — العنوان {addr}، السطر {line}. موجود في الأعلى بالفعل.',
      es: 'a[{i}]: dirección {addr}, línea {line}. Ya está arriba.',
      fr: 'a[{i}] — adresse {addr}, ligne {line}. Déjà en haut.',
      hi: 'a[{i}] — पता {addr}, लाइन {line}। पहले से ऊपर है।',
      id: 'a[{i}] — alamat {addr}, baris {line}. Sudah ada di atas.',
      pt: 'a[{i}] — endereço {addr}, linha {line}. Já está aqui em cima.',
    },
    'caption.done': {
      en: '{touches} touches: {hits} rode along, {misses} went down.',
      ko: '짚은 것은 {touches}. 함께 올라온 것은 {hits}, 내려간 것은 {misses}.',
      ja: '触れたのは {touches}。一緒に上がったのは {hits}、下りたのは {misses}。',
      zh: '共触及 {touches}：搭车上来 {hits}，下行 {misses}。',
      ar: 'لمسات: {touches} — رافقت السطر {hits}، ونزلت {misses}.',
      es: 'Accesos: {touches}. Subieron de paso {hits}; bajaron {misses}.',
      fr: 'Accès : {touches}. Montés au passage : {hits} ; descendus : {misses}.',
      hi: 'कुल पहुँच {touches}: साथ आए {hits}, नीचे गए {misses}।',
      id: 'Sentuhan: {touches}. Ikut naik {hits}, turun {misses}.',
      pt: 'Acessos: {touches}. Subiram juntos {hits}; desceram {misses}.',
    },
  },
};
