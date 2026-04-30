/**
 * IP 라우팅 (network IP routing) facet 알고리즘 — ReactiveMechanism + 자동 시연.
 *
 * 시그니처 행동: 패킷이 직행하지 않고 라우터마다 한 번씩 멈춰, 그 자리에서 자기 표만
 * 펼쳐 가장 긴 일치 prefix 가 가리키는 next-hop 으로 한 걸음만 떠나며, 그때마다
 * TTL 이 한 칸 깎인다. 9 단 hop 시퀀스 (도착 → 표 펼침 → 비트 비교 → 채택 행 →
 * 시선 화살표 → 카드 떠남 + TTL 카운트다운 → 표 접힘 → 다음 링크) 이 한 hop 에
 * 1:1 대응된다.
 *
 * 진행 모델: 메시지 시퀀스형. mount 직후 자동 시연 4 패킷 (정상 도착 / R4 분기 도착 /
 * default 외부 / TTL=2 폐기) 시연 후 idle 진입.
 *
 * 입력 어휘 (모두 facet 로컬, 'reset' / 'speed' 만 mechanism 표준):
 *   - send         payload: { dst?: string; ttl?: number }
 *                  — 호스트 A 가 패킷 발신 (dst, ttl 미지정 시 기본값).
 *   - step-hop     payload?: unknown — 다음 hop 한 단계만 진행한 뒤 정지.
 *   - auto-demo    payload?: unknown — 자동 시연 시퀀스 재시작.
 *   - pause        payload?: unknown — 진행 중인 운동 정지.
 *   - resume       payload?: unknown — pause 에서 풀려 진행.
 *   - ttl-default  payload: { value: number } — 발신 시 기본 TTL 변경 (64/32/8/4/2).
 *
 * 식별자 (C1):
 *   - `host:A` `host:B`                          — 끝점 호스트.
 *   - `router:R1` ... `router:R4`                — 중간 라우터.
 *   - `link:A-R1` `link:R1-R2` ... `link:R1-R4`  — 토폴로지 링크.
 *   - `table:R1` ...                             — 라우터별 라우팅 테이블 패널.
 *   - `row:R1:0` `row:R1:1` ...                  — 표 한 행.
 *   - `packet:p<traceIndex>`                     — 한 패킷 사건의 정체성.
 *   - `bit:dst:i`                                — dst 비트 표시줄의 i 번째 비트.
 *   - `gauge:row:R1:0` ...                       — 행 옆 일치 길이 게이지.
 *   - `arrow:sight:R1->R2`                       — 채택 행 → next-hop 시선 화살표.
 *   - `caption`                                  — 상단 캡션.
 *   - `sub-info`                                 — 우상단 보조 정보 영역.
 *
 * 이벤트 어휘 (모두 facet 로컬):
 *   - init                  { hosts, routers, links, tables, defaultTtl, autoDemoSequence }
 *   - packet-sent           { traceIndex, packet: { src, dst, ttl }, fromHost }
 *   - packet-arrived        { traceIndex, atRouter }    — 안개 걷힘 + 동심원 강조.
 *   - table-opened          { atRouter, dstBits }       — 표 커튼 펼침.
 *   - lpm-evaluated         { atRouter, rows, adoptedRowIdx, nextHopNode } — 비교 결과.
 *   - sight-arrow           { fromRouter, toNode }      — 채택 행 → next-hop 시선 화살표.
 *   - packet-departing      { traceIndex, fromRouter, toNode, ttlBefore, ttlAfter }
 *   - table-closed          { atRouter }                — 표 접힘 + 안개 복귀.
 *   - packet-link-slide     { traceIndex, fromNode, toNode } — 링크 위 미끄러짐.
 *   - packet-delivered      { traceIndex, atHost, ttlRemaining }
 *   - packet-dropped        { traceIndex, atRouter, reason: 'ttl-zero' | 'no-route' }
 *   - packet-external       { traceIndex, atRouter, viaInterface } — default → 외부 페이드.
 *   - caption               { text, kind: 'concept' | 'event', durationMs? }
 *   - mode                  { mode: 'auto' | 'step' | 'paused' | 'idle' }, silent
 *   - phase                 { phase: 'demo' | 'idle' }, silent
 *
 * phase 어휘: 'demo' (자동 시연) | 'idle' (사용자 입력 대기). irs.ts 빈 배열이라 동기 대상 없음.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type IpRoutingInputEvent =
  | { type: 'send'; payload?: { dst?: string; ttl?: number } }
  | { type: 'step-hop'; payload?: unknown }
  | { type: 'auto-demo'; payload?: unknown }
  | { type: 'pause'; payload?: unknown }
  | { type: 'resume'; payload?: unknown }
  | { type: 'ttl-default'; payload?: { value?: number; segmentIndex?: number } };

export type RoutingTableRow = {
  /** 라우팅 prefix (예: '203.0.113.0/24'). */
  prefix: string;
  /** prefix 길이 (비트 수, 0~32). */
  prefixLen: number;
  /** 32비트 prefix 의 마스크된 정수값. */
  prefixBits: number;
  /** next-hop 노드 식별자 (router id 또는 'external' / 'direct'). */
  nextHop: string;
  /** 라우터 출구 인터페이스 라벨 (예: 'eth0'). */
  iface: string;
};

export type RouterDef = {
  id: string;
  /** 토폴로지 위 좌표 (stage view 가 반영). */
  x: number;
  y: number;
  table: RoutingTableRow[];
};

export type HostDef = {
  id: string;
  /** 호스트 IP 주소 (예: '192.0.2.10'). */
  ip: string;
  x: number;
  y: number;
};

export type LinkDef = {
  id: string;
  from: string;
  to: string;
};

export type AutoDemoStep = {
  dst: string;
  ttl: number;
  /** 캡션 보조 메시지 (예: '정상 도착'). */
  note?: string;
};

export type IpRoutingData = {
  type: 'ip-routing';
  hosts: HostDef[];
  routers: RouterDef[];
  links: LinkDef[];
  /** 호스트 A 발신 시 기본 TTL. */
  defaultTtl: number;
  /** 자동 시연 시퀀스. */
  autoDemoSequence: AutoDemoStep[];
  /** 자동 시연 중 한 패킷 끝 → 다음 발신 사이 간격 ms. */
  demoGapMs: number;
  /** 한 hop 9 단 시퀀스의 운동 길이 ms (Normal 기준). */
  hopTimings: {
    arriveMs: number;
    fogClearMs: number;
    tableOpenMs: number;
    bitCompareMs: number;
    sightArrowMs: number;
    departMs: number;
    ttlCountdownMs: number;
    tableCloseMs: number;
    linkSlideMs: number;
  };
  /** TTL 임계치 — 이 이하에서 게이지가 주황으로 변함. */
  ttlWarnThreshold: number;
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function ipToInt(ip: string): number {
  const parts = ip.split('.').map((s) => parseInt(s, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return 0;
  // bigint 회피: unsigned 32-bit 산술 (>>> 0).
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** prefixLen 만큼 상위 비트 일치 검사. */
function matchPrefix(dstInt: number, prefixBits: number, prefixLen: number): boolean {
  if (prefixLen === 0) return true; // default route 항상 매치.
  const mask = prefixLen === 32 ? 0xffffffff : ((0xffffffff << (32 - prefixLen)) >>> 0);
  return ((dstInt & mask) >>> 0) === ((prefixBits & mask) >>> 0);
}

/** dstInt 와 prefix 의 비트 단위 일치 길이 (좌→우 비교, 첫 불일치 직전까지). */
function commonBitLength(dstInt: number, prefixBits: number, max: number): number {
  let i = 0;
  for (; i < max; i++) {
    const bit = 31 - i;
    const dBit = (dstInt >>> bit) & 1;
    const pBit = (prefixBits >>> bit) & 1;
    if (dBit !== pBit) break;
  }
  return i;
}

function ipBitsString(ip: string): string {
  const v = ipToInt(ip);
  let s = '';
  for (let i = 31; i >= 0; i--) {
    s += ((v >>> i) & 1).toString();
    if (i % 8 === 0 && i !== 0) s += ' ';
  }
  return s;
}

// ── 알고리즘 본체 ─────────────────────────────────────────────────────────

export async function ipRouting(ctxBase: FacetContext<IpRoutingData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<IpRoutingData>;
  const data = ctx.data;
  const { hosts, routers, links, autoDemoSequence, demoGapMs, hopTimings } = data;

  let traceIndex = 0;
  let defaultTtl = data.defaultTtl;

  // routers/hosts 빠른 조회.
  const routerById = new Map<string, RouterDef>();
  for (const r of routers) routerById.set(r.id, r);
  const hostById = new Map<string, HostDef>();
  for (const h of hosts) hostById.set(h.id, h);

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: {
      hosts: hosts.map((h) => ({ ...h })),
      routers: routers.map((r) => ({ ...r, table: r.table.map((row) => ({ ...row })) })),
      links: links.map((l) => ({ ...l })),
      defaultTtl,
      autoDemoSequence: autoDemoSequence.map((s) => ({ ...s })),
      ttlWarnThreshold: data.ttlWarnThreshold,
    },
  });
  await ctx.emit({
    type: 'caption',
    payload: {
      text: '한 패킷이 라우터 사슬을 hop 단위로 흐른다 — 매 라우터에서 자기 표만 보고 next-hop 한 걸음을 정한다.',
      kind: 'concept',
    },
  });
  await ctx.emit({ type: 'phase', payload: { phase: 'demo' }, silent: true });

  /** ms sleep with cancel + interrupt detection. 반환: 입력이 들어오면 그 입력. */
  async function sleepOrInterrupt(ms: number): Promise<IpRoutingInputEvent | null> {
    if (ctx.cancelled) return null;
    const ok = await ctx.sleep(ms);
    if (!ok || ctx.cancelled) return null;
    return ctx.pollInput<IpRoutingInputEvent>();
  }

  /** LPM 결정: dst 와 라우터의 표를 보고 채택 행을 찾는다. */
  function evaluateLpm(
    router: RouterDef,
    dstIp: string,
  ): {
    rows: Array<{ rowIdx: number; matchLen: number; matched: boolean }>;
    adoptedRowIdx: number;
  } {
    const dstInt = ipToInt(dstIp);
    const rowResults: Array<{ rowIdx: number; matchLen: number; matched: boolean }> = [];
    let bestIdx = -1;
    let bestLen = -1;
    for (let i = 0; i < router.table.length; i++) {
      const row = router.table[i];
      const matched = matchPrefix(dstInt, row.prefixBits, row.prefixLen);
      // matchLen — 비트 비교 시각화 입력. 매치되면 prefixLen, 아니면 첫 불일치까지의 공통 비트 수.
      const matchLen = matched
        ? row.prefixLen
        : Math.min(commonBitLength(dstInt, row.prefixBits, row.prefixLen), row.prefixLen - 1);
      rowResults.push({ rowIdx: i, matchLen, matched });
      if (matched && row.prefixLen > bestLen) {
        bestLen = row.prefixLen;
        bestIdx = i;
      }
    }
    return { rows: rowResults, adoptedRowIdx: bestIdx };
  }

  /**
   * 한 hop 의 9 단 시퀀스 — 라우터 도착부터 다음 노드 이동 전까지.
   * 반환: 이동할 next-hop 노드 id, 또는 null (폐기/외부/도착).
   */
  type HopOutcome =
    | { kind: 'next'; nextNode: string; ttlAfter: number }
    | { kind: 'dropped'; reason: 'ttl-zero' | 'no-route' }
    | { kind: 'external'; viaInterface: string }
    | { kind: 'terminal'; reason: 'directly-connected' };

  async function runHopAtRouter(
    trace: number,
    router: RouterDef,
    dstIp: string,
    ttlIn: number,
  ): Promise<HopOutcome> {
    // 2. R 도착 (안개 걷힘).
    await ctx.emit({ type: 'packet-arrived', payload: { traceIndex: trace, atRouter: router.id } });
    await ctx.emit({
      type: 'caption',
      payload: { text: `패킷이 ${router.id} 에 도착했다 — 표를 펼친다.`, kind: 'event' },
    });
    if (await sleepOrInterrupt(hopTimings.arriveMs)) {
      // interrupt 무시 — 시퀀스 한 번은 끝까지.
    }

    // 3. 표 펼침.
    await ctx.emit({
      type: 'table-opened',
      payload: { atRouter: router.id, dstBits: ipBitsString(dstIp), dst: dstIp },
    });
    await sleepOrInterrupt(hopTimings.tableOpenMs);

    // 4. LPM 비트 비교.
    const lpm = evaluateLpm(router, dstIp);
    await ctx.emit({
      type: 'lpm-evaluated',
      payload: {
        atRouter: router.id,
        rows: lpm.rows,
        adoptedRowIdx: lpm.adoptedRowIdx,
        nextHopNode:
          lpm.adoptedRowIdx >= 0 ? router.table[lpm.adoptedRowIdx].nextHop : null,
        nextHopIface:
          lpm.adoptedRowIdx >= 0 ? router.table[lpm.adoptedRowIdx].iface : null,
      },
    });
    if (lpm.adoptedRowIdx < 0) {
      await ctx.emit({
        type: 'caption',
        payload: { text: '일치하는 행이 없다 — 패킷이 폐기된다.', kind: 'event' },
      });
      await ctx.emit({
        type: 'packet-dropped',
        payload: { traceIndex: trace, atRouter: router.id, reason: 'no-route' },
      });
      return { kind: 'dropped', reason: 'no-route' };
    }
    const adopted = router.table[lpm.adoptedRowIdx];
    await ctx.emit({
      type: 'caption',
      payload: {
        text:
          adopted.prefixLen === 0
            ? `구체 일치 없음 — default 행이 채택되어 ${adopted.nextHop} 으로 나간다.`
            : `${adopted.prefix} 가 가장 긴 일치 — next-hop 은 ${adopted.nextHop} 다.`,
        kind: 'event',
      },
    });
    await sleepOrInterrupt(hopTimings.bitCompareMs);

    // 6. 시선 화살표 (next-hop 이 라우터/호스트인 경우만).
    if (adopted.nextHop !== 'external' && adopted.nextHop !== 'direct') {
      await ctx.emit({
        type: 'sight-arrow',
        payload: {
          fromRouter: router.id,
          toNode: adopted.nextHop,
          iface: adopted.iface,
        },
      });
      await sleepOrInterrupt(hopTimings.sightArrowMs);
    }

    // 7. TTL 카운트다운 + 카드 떠남 준비.
    const ttlAfter = ttlIn - 1;
    await ctx.emit({
      type: 'packet-departing',
      payload: {
        traceIndex: trace,
        fromRouter: router.id,
        toNode: adopted.nextHop,
        ttlBefore: ttlIn,
        ttlAfter,
      },
    });
    await sleepOrInterrupt(hopTimings.ttlCountdownMs);

    // 8. 표 접힘 + 안개 복귀.
    await ctx.emit({ type: 'table-closed', payload: { atRouter: router.id } });
    await sleepOrInterrupt(hopTimings.tableCloseMs);

    // TTL 0 검사.
    if (ttlAfter <= 0) {
      await ctx.emit({
        type: 'caption',
        payload: { text: 'TTL 이 0 이다 — 패킷이 폐기되었다.', kind: 'event' },
      });
      await ctx.emit({
        type: 'packet-dropped',
        payload: { traceIndex: trace, atRouter: router.id, reason: 'ttl-zero' },
      });
      return { kind: 'dropped', reason: 'ttl-zero' };
    }

    // 외부 / direct 처리.
    if (adopted.nextHop === 'external') {
      await ctx.emit({
        type: 'caption',
        payload: { text: `${router.id} 의 외부 인터페이스로 나갔다.`, kind: 'event' },
      });
      await ctx.emit({
        type: 'packet-external',
        payload: { traceIndex: trace, atRouter: router.id, viaInterface: adopted.iface },
      });
      return { kind: 'external', viaInterface: adopted.iface };
    }
    if (adopted.nextHop === 'direct') {
      await ctx.emit({
        type: 'caption',
        payload: { text: `${router.id} 의 직접 연결망으로 도달했다.`, kind: 'event' },
      });
      return { kind: 'terminal', reason: 'directly-connected' };
    }

    return { kind: 'next', nextNode: adopted.nextHop, ttlAfter };
  }

  /** 한 패킷의 hop-by-hop 운동 — 호스트 A 출발. */
  async function runPacket(dst: string, ttl: number, note?: string): Promise<void> {
    const trace = traceIndex++;
    const startHost = hosts[0];
    await ctx.emit({
      type: 'packet-sent',
      payload: {
        traceIndex: trace,
        packet: { src: startHost.ip, dst, ttl },
        fromHost: startHost.id,
        note: note ?? null,
      },
    });
    await ctx.emit({
      type: 'caption',
      payload: {
        text: `${startHost.id} 가 패킷을 만들었다 — dst=${dst}, TTL=${ttl}.`,
        kind: 'event',
      },
    });

    // A → R1 슬라이드.
    const firstRouter = routers[0];
    await ctx.emit({
      type: 'packet-link-slide',
      payload: { traceIndex: trace, fromNode: startHost.id, toNode: firstRouter.id },
    });
    await sleepOrInterrupt(hopTimings.linkSlideMs);

    let currentRouter: RouterDef | null = firstRouter;
    let currentTtl = ttl;

    while (currentRouter) {
      if (ctx.cancelled) return;
      const outcome = await runHopAtRouter(trace, currentRouter, dst, currentTtl);
      if (outcome.kind === 'dropped' || outcome.kind === 'external' || outcome.kind === 'terminal') {
        return;
      }
      // outcome.kind === 'next'
      const fromId = currentRouter.id;
      const toId = outcome.nextNode;
      currentTtl = outcome.ttlAfter;
      // 호스트 도착 검사.
      const targetHost = hostById.get(toId);
      if (targetHost) {
        await ctx.emit({
          type: 'packet-link-slide',
          payload: { traceIndex: trace, fromNode: fromId, toNode: toId },
        });
        await sleepOrInterrupt(hopTimings.linkSlideMs);
        await ctx.emit({
          type: 'packet-delivered',
          payload: { traceIndex: trace, atHost: targetHost.id, ttlRemaining: currentTtl },
        });
        await ctx.emit({
          type: 'caption',
          payload: {
            text: `패킷이 목적지에 도달했다 — TTL ${currentTtl} 남음.`,
            kind: 'event',
          },
        });
        return;
      }
      const nextRouter = routerById.get(toId);
      if (!nextRouter) {
        await ctx.emit({
          type: 'packet-dropped',
          payload: { traceIndex: trace, atRouter: fromId, reason: 'no-route' },
        });
        return;
      }
      // 라우터 사이 링크 슬라이드.
      await ctx.emit({
        type: 'packet-link-slide',
        payload: { traceIndex: trace, fromNode: fromId, toNode: toId },
      });
      const interrupt = await sleepOrInterrupt(hopTimings.linkSlideMs);
      if (interrupt) {
        // step-hop 같은 입력은 다음 hop 전에 폴링되므로 통과 (한 hop 완결).
        // 그러나 'pause' 는 즉시 반응해야 하므로 큐에 다시 넣는다.
        // ReactiveContext 에는 push back 이 없어 단순 무시 (다음 라운드 wait 에서 해결).
      }
      currentRouter = nextRouter;
    }
  }

  async function runAutoDemo(): Promise<IpRoutingInputEvent | null> {
    await ctx.emit({ type: 'mode', payload: { mode: 'auto' }, silent: true });
    for (const step of autoDemoSequence) {
      if (ctx.cancelled) return null;
      const pending = ctx.pollInput<IpRoutingInputEvent>();
      if (pending) {
        await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
        return pending;
      }
      await runPacket(step.dst, step.ttl, step.note);
      const interrupt = await sleepOrInterrupt(demoGapMs);
      if (interrupt) {
        await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
        return interrupt;
      }
    }
    await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
    await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
    await ctx.emit({
      type: 'caption',
      payload: {
        text: '자동 시연 끝 — 발신 / 한 hop / 자동 시연 / 초기 TTL 로 추가 운동을 발화시킬 수 있다.',
        kind: 'concept',
      },
    });
    return null;
  }

  // mount 직후 자동 시연 한 호흡.
  let interrupted = await runAutoDemo();

  // 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;

    let ev: IpRoutingInputEvent;
    if (interrupted) {
      ev = interrupted;
      interrupted = null;
    } else {
      try {
        ev = await ctx.waitForInput<IpRoutingInputEvent>();
      } catch {
        return;
      }
    }

    if (ev.type === 'send') {
      const dst = ev.payload?.dst ?? hosts[hosts.length - 1].ip;
      const ttl = typeof ev.payload?.ttl === 'number' ? ev.payload.ttl : defaultTtl;
      await runPacket(dst, ttl);
      continue;
    }

    if (ev.type === 'auto-demo') {
      interrupted = await runAutoDemo();
      continue;
    }

    if (ev.type === 'step-hop') {
      // 한 hop 만 — 가장 단순한 구현으로, 대표 시나리오 한 패킷 발신.
      // 알고리즘 입장에서는 한 패킷 운동이 한 호흡이며, 사용자는 원하는 만큼 step 을 누른다.
      await runPacket(hosts[hosts.length - 1].ip, defaultTtl, '한 hop 시연');
      continue;
    }

    if (ev.type === 'ttl-default') {
      const v = ev.payload?.value;
      if (typeof v === 'number' && v > 0) {
        defaultTtl = v;
        await ctx.emit({
          type: 'caption',
          payload: { text: `초기 TTL 을 ${v} 로 설정했다.`, kind: 'event' },
        });
      }
      continue;
    }

    if (ev.type === 'pause') {
      await ctx.emit({ type: 'mode', payload: { mode: 'paused' }, silent: true });
      continue;
    }
    if (ev.type === 'resume') {
      await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
      continue;
    }
  }
}
