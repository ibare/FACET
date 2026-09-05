/**
 * IpRouting facet JSON 선언.
 *
 * 진행 모델 메시지 시퀀스형 + 입력 반응형 (ReactiveMechanism).
 * mount 즉시 자동 시연 (정상 도착 / R4 분기 / default 외부 / TTL=2 폐기) 4 발신 후
 * 학습자 입력 대기.
 *
 * 컨트롤바 어휘:
 *   [발신] [한 hop] [자동 시연] [⏸ 일시정지] [재개] [초기 TTL ▏━●━━] [↺ 초기화]
 *
 * 식별자 (C1): `host:` `router:` `link:` `table:` `row:` `packet:` `bit:` `gauge:` `arrow:`.
 */

import type { FacetJson } from '@ffacet/core/runtime';

const R1_TABLE = [
  // 짧은 일치 (LPM 으로 패배) — 그러나 표 위에 같이 등장.
  {
    prefix: '203.0.0.0/16',
    prefixLen: 16,
    prefixBits: ((203 << 24) | (0 << 16)) >>> 0,
    nextHop: 'router:R4',
    iface: 'eth1',
  },
  // 가장 긴 일치 (R2 로 채택).
  {
    prefix: '203.0.113.0/24',
    prefixLen: 24,
    prefixBits: ((203 << 24) | (0 << 16) | (113 << 8)) >>> 0,
    nextHop: 'router:R2',
    iface: 'eth0',
  },
  // R4 분기로 향하는 다른 prefix (198.51.100.0/24 패킷에서 채택).
  {
    prefix: '198.51.100.0/24',
    prefixLen: 24,
    prefixBits: ((198 << 24) | (51 << 16) | (100 << 8)) >>> 0,
    nextHop: 'router:R4',
    iface: 'eth1',
  },
  // default — 어느 것도 일치하지 않을 때.
  {
    prefix: '0.0.0.0/0',
    prefixLen: 0,
    prefixBits: 0,
    nextHop: 'router:R3',
    iface: 'eth2',
  },
];

const R2_TABLE = [
  {
    prefix: '203.0.113.0/24',
    prefixLen: 24,
    prefixBits: ((203 << 24) | (0 << 16) | (113 << 8)) >>> 0,
    nextHop: 'router:R3',
    iface: 'eth0',
  },
  {
    prefix: '0.0.0.0/0',
    prefixLen: 0,
    prefixBits: 0,
    nextHop: 'router:R1',
    iface: 'eth1',
  },
];

const R3_TABLE = [
  // 호스트 B 가 직접 연결된 망.
  {
    prefix: '203.0.113.0/24',
    prefixLen: 24,
    prefixBits: ((203 << 24) | (0 << 16) | (113 << 8)) >>> 0,
    nextHop: 'host:B',
    iface: 'eth0',
  },
  // default — 외부.
  {
    prefix: '0.0.0.0/0',
    prefixLen: 0,
    prefixBits: 0,
    nextHop: 'external',
    iface: 'eth-ext',
  },
];

const R4_TABLE = [
  {
    prefix: '198.51.100.0/24',
    prefixLen: 24,
    prefixBits: ((198 << 24) | (51 << 16) | (100 << 8)) >>> 0,
    nextHop: 'direct',
    iface: 'eth0',
  },
  {
    prefix: '0.0.0.0/0',
    prefixLen: 0,
    prefixBits: 0,
    nextHop: 'router:R1',
    iface: 'eth1',
  },
];

export const ipRoutingFacet: FacetJson = {
  id: 'facet:ipRouting',
  title: { en: 'IP Routing', ko: 'IP 라우팅' },
  description: {
    en: 'A packet hops router-by-router; each router consults only its own table and picks the longest-prefix-match next-hop, decrementing TTL on every hop',
    ko: '한 패킷이 매 라우터에서 자기 표만 보고 가장 긴 일치 prefix 의 next-hop 한 걸음을 정하며 TTL 한 칸씩 깎이는 hop-by-hop 분산 결정',
  },
  algorithm: 'module:ipRouting',
  projector: 'module:ipRoutingProjector',
  initialData: {
    type: 'ip-routing',
    hosts: [
      { id: 'host:A', ip: '192.0.2.10', x: 60, y: 220 },
      { id: 'host:B', ip: '203.0.113.42', x: 540, y: 220 },
    ],
    routers: [
      { id: 'router:R1', x: 180, y: 220, table: R1_TABLE },
      { id: 'router:R2', x: 300, y: 220, table: R2_TABLE },
      { id: 'router:R3', x: 420, y: 220, table: R3_TABLE },
      { id: 'router:R4', x: 180, y: 140, table: R4_TABLE },
    ],
    links: [
      { id: 'link:A-R1', from: 'host:A', to: 'router:R1' },
      { id: 'link:R1-R2', from: 'router:R1', to: 'router:R2' },
      { id: 'link:R2-R3', from: 'router:R2', to: 'router:R3' },
      { id: 'link:R3-B', from: 'router:R3', to: 'host:B' },
      { id: 'link:R1-R4', from: 'router:R1', to: 'router:R4' },
    ],
    defaultTtl: 64,
    autoDemoSequence: [
      { dst: '203.0.113.42', ttl: 64, note: '정상 도착 — LPM 으로 R2 채택' },
      { dst: '198.51.100.7', ttl: 64, note: 'R4 분기 — 198.51.100.0/24 채택' },
      { dst: '8.8.8.8', ttl: 64, note: 'default 행 채택 — 외부로 나감' },
      { dst: '203.0.113.42', ttl: 2, note: 'TTL=2 — 도중 폐기' },
    ],
    demoGapMs: 800,
    hopTimings: {
      arriveMs: 200,
      fogClearMs: 200,
      tableOpenMs: 250,
      bitCompareMs: 350,
      sightArrowMs: 250,
      departMs: 200,
      ttlCountdownMs: 200,
      tableCloseMs: 250,
      linkSlideMs: 400,
    },
    ttlWarnThreshold: 4,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  messages: {
    'caption.demoEnd': { en: 'Demo finished — Send / One hop / Demo / Initial TTL can set off more movement.', ko: '자동 시연 끝 — 발신 / 한 hop / 자동 시연 / 초기 TTL 로 추가 운동을 발화시킬 수 있다.' },
    'caption.intro': { en: 'One packet flows hop by hop along a chain of routers — at each one it consults only its own table to choose the next hop.', ko: '한 패킷이 라우터 사슬을 hop 단위로 흐른다 — 매 라우터에서 자기 표만 보고 next-hop 한 걸음을 정한다.' },
    'caption.noRoute': { en: 'No matching row — the packet is dropped.', ko: '일치하는 행이 없다 — 패킷이 폐기된다.' },
    'caption.ttlExpired': { en: 'TTL reached 0 — the packet was dropped.', ko: 'TTL 이 0 이다 — 패킷이 폐기되었다.' },
    'label.matchBits': { en: '{n} bit', ko: '{n} bit' },
    'label.ttl': { en: 'TTL: {n} / {max}', ko: 'TTL: {n} / {max}' },
    'label.src': { en: 'src: {v}', ko: 'src: {v}' },
    'label.dst': { en: 'dst: {v}', ko: 'dst: {v}' },
    'caption.base': { en: 'IP routing is a hop-by-hop distributed decision — at every router a packet consults only that router\'s own table to choose one next hop, and one is taken off its TTL each time.', ko: 'IP 라우팅은 한 패킷이 매 라우터에서 자기 표만 보고 next-hop 한 걸음을 정하며 TTL 한 칸씩만 깎이는 hop-by-hop 분산 결정이다.' },
    'label.currentEvent': { en: 'current event', ko: '현재 사건' },
    'label.host': { en: 'host {id}', ko: '호스트 {id}' },
    'label.matchLength': { en: 'match length', ko: '일치 길이' },
    'label.packetHeader': { en: 'packet header', ko: '패킷 헤더' },
    'label.references': { en: 'See also: Kurose-Ross LPM Interactive · INET/OMNeT++ Routing Visualizer · Cisco Packet Tracer · Practical Networking — Packet Traveling', ko: '참고: Kurose-Ross LPM Interactive · INET/OMNeT++ Routing Visualizer · Cisco Packet Tracer · Practical Networking — Packet Traveling' },
    'label.routingTable': { en: 'routing table ({router}) — dst {dst}', ko: '라우팅 테이블 ({router}) — dst {dst}' },
    'legend.rules': { en: 'Only one router\'s table is open at any moment — a router sees only its own. The longest match wins. Every hop takes one off the TTL.', ko: '한 시점에 단 한 라우터의 표만 펼쳐진다 — 라우터는 자기 표만 본다. 가장 긴 일치가 이긴다. 한 hop 마다 TTL 이 한 칸 줄어든다.' },
    'sub.arrived': { en: '{router} reached', ko: '{router} 도착' },
    'sub.arrivedDetail': { en: 'opening its table', ko: '표를 펼친다' },
    'sub.bitCompare': { en: 'starting bit comparison for dst {dst}', ko: 'dst {dst} 비트 비교 시작' },
    'sub.delivered': { en: 'host {host} reached', ko: '호스트 {host} 도달' },
    'sub.dropNoRoute': { en: 'no matching row', ko: '일치 행 없음' },
    'sub.dropTtl': { en: 'TTL reached 0', ko: 'TTL 이 0 에 닿았다' },
    'sub.dropped': { en: 'dropped — {router}', ko: '폐기 — {router}' },
    'sub.egress': { en: 'left via an external interface — {router}', ko: '외부 인터페이스로 나감 — {router}' },
    'sub.gazeArrow': { en: 'gaze arrow → {node}', ko: '시선 화살표 → {node}' },
    'sub.idle': { en: 'idle', ko: '대기 중' },
    'sub.idleDetail': { en: 'send / demo / one hop / initial TTL', ko: '발신 / 자동 시연 / 한 hop / 초기 TTL' },
    'sub.initialized': { en: 'initialized', ko: '초기화 됨' },
    'sub.initializedDetail': { en: 'send / one hop / demo / initial TTL', ko: '발신 / 한 hop / 자동 시연 / 초기 TTL' },
    'sub.lpmNoMatch': { en: 'LPM result — no match', ko: 'LPM 결과 — 일치 없음' },
    'sub.lpmNoMatchDetail': { en: 'the packet is dropped', ko: '패킷이 폐기된다' },
    'sub.lpmResult': { en: 'LPM result — {router} → {nextHop}', ko: 'LPM 결과 — {router} → {nextHop}' },
    'sub.send': { en: 'host {host} sends #{n}', ko: '호스트 {host} 발신 #{n}' },
    'sub.tableOpen': { en: '{router} table open', ko: '{router} 표 펼침' },
    'sub.topology': { en: '{routers} routers / {links} links', ko: '라우터 {routers} 대 / 링크 {links} 줄' },
    'sub.topologyDetail': { en: 'initial TTL {ttl}, demo sends {sends}', ko: '초기 TTL {ttl}, 자동 시연 {sends} 발신' },
    'sub.ttlLeft': { en: 'TTL {ttl} left', ko: 'TTL {ttl} 남음' },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'ip-routing-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'send', label: { en: 'Send', ko: '발신' } },
        { widget: 'button', action: 'step-hop', label: { en: '1 hop', ko: '한 hop' } },
        { widget: 'button', action: 'auto-demo', label: { en: 'Auto demo', ko: '자동 시연' } },
        { widget: 'button', action: 'pause', label: { en: '⏸ Pause', ko: '⏸ 일시정지' } },
        { widget: 'button', action: 'resume', label: { en: 'Resume', ko: '재개' } },
        {
          widget: 'segmented-slider',
          action: 'ttl-default',
          name: 'ttl',
          label: { en: 'Initial TTL', ko: '초기 TTL' },
          segments: [
            { value: 64, label: { en: '64', ko: '64' }, default: true },
            { value: 32, label: { en: '32', ko: '32' } },
            { value: 8, label: { en: '8', ko: '8' } },
            { value: 4, label: { en: '4', ko: '4' } },
            { value: 2, label: { en: '2', ko: '2' } },
          ],
        },
        { widget: 'speed-slider', action: 'speed', default: 1, steps: [0.5, 1, 2] },
        { widget: 'button', action: 'reset', label: { en: '↺ Reset', ko: '↺ 초기화' } },
      ],
    },
  },
};
