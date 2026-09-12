/**
 * conflict-miss — 충돌 실패 조각(piece) facet 의 알고리즘.
 *
 * 답하는 질문: "빈 자리가 셋이나 있는데 왜 밀려나는가?"
 *
 * 직접 사상(direct-mapped) 캐시에서 주소 하나가 앉을 수 있는 줄은 **하나뿐**이다.
 * 인덱스가 같은 두 주소를 번갈아 찾으면, 다른 줄이 아무리 비어 있어도 둘이 한
 * 줄을 두고 서로 밀어낸다. 담을 자리가 모자란 것이 아니라 갈 곳이 하나뿐이다.
 *
 * 셈은 전부 여기서 한다 — 선언이 주는 것은 줄 수 · 라인 크기 · 찾는 주소 목록
 * 뿐이고, 인덱스 · 태그 · 히트/미스 · 축출된 태그 · 빈 줄의 수는 이 자리에서
 * 나온다 (S-piece: 화면에 쓰는 값은 실측한다).
 *
 *   줄 번호 = 주소 ÷ 라인 크기
 *   인덱스  = 줄 번호 mod 줄 수
 *   태그    = 줄 번호 ÷ 줄 수
 *
 * ── 이벤트 (C2)
 *
 *   access  한 번의 접근. silent 아님.
 *     {
 *       order: number            몇 번째 접근인가 (1부터)
 *       address: number          찾은 주소
 *       lineNo: number           주소가 속한 메모리 줄 번호
 *       index: number            그 주소가 앉을 수 있는 유일한 줄
 *       tag: number              그 줄에 앉은 것이 누구인지 가리는 값
 *       hit: boolean             이미 같은 태그가 앉아 있었는가
 *       evictedAddress: number | null   밀려난 주소. 빈 줄이었으면 null
 *       evictedTag: number | null       밀려난 태그. 빈 줄이었으면 null
 *       emptyIndices: number[]   이 접근이 끝난 뒤 비어 있는 줄
 *       emptyLines: number       그 개수
 *       hitCount: number         여기까지의 히트 수
 *       missCount: number        여기까지의 미스 수
 *       evictionCount: number    여기까지 밀려난 수
 *     }
 *     target 은 `index:<index>` — 표준 식별자 문법 (원칙 4).
 *
 *   done    다 찾고 난 뒤의 셈. silent 아님.
 *     { total: number; hitCount: number; missCount: number;
 *       evictionCount: number; emptyIndices: number[]; emptyLines: number }
 *
 *   rewind  화면을 처음으로 되돌린다. payload 없음. silent 아님 (그림이 바뀐다).
 *
 * ── 진행
 *
 * reactive 다 (S-piece). mount 하면 스스로 재생하고, 걸음 간격은 `stepMs` 가
 * 정한다. 다 보고 난 뒤에는 `advance` 를 받아 처음부터 한 걸음씩 짚는다 —
 * 첫 누름은 되감고 **첫 걸음까지** 간다.
 *
 * 걸음표를 손으로 적지 않는다. 걸음은 `addresses` 를 도는 것 자체이며, 캐시의
 * 상태는 그 순회가 만들어 낸다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConflictMissFacetData = {
  type: string;
  /** 캐시의 줄 수. 직접 사상이라 줄 하나에 한 자리다. */
  lineCount: number;
  /** 한 줄이 담는 바이트 수. */
  lineSize: number;
  /** 차례로 찾는 주소. */
  addresses: number[];
  /** 걸음 사이에 쉬는 시간 (S-piece). */
  stepMs: number;
};

/** 줄 하나에 앉아 있는 것. 비어 있으면 null. */
type Resident = { tag: number; address: number } | null;

/** 다음 걸음으로 갈지 묻는 문. false 면 그만둔다. */
type Gate = () => Promise<boolean>;

export const conflictMiss = async (ctx: FacetContext<ConflictMissFacetData>): Promise<void> => {
  const rc = ctx as ReactiveContext<ConflictMissFacetData>;

  /**
   * 찾는 주소를 차례로 밟는다.
   *
   * **첫 걸음은 문을 지나지 않는다** (S-piece). 문은 걸음 *사이*의 것이라 첫
   * 걸음 앞에는 기다릴 앞걸음이 없다 — 문을 먼저 두면 stepMs 만큼 빈 화면이
   * 보인 뒤에야 그림이 선다.
   */
  const play = async (gate: Gate): Promise<void> => {
    const { lineCount, lineSize, addresses } = rc.data;
    const lines: Resident[] = new Array<Resident>(Math.max(1, lineCount)).fill(null);

    let hitCount = 0;
    let missCount = 0;
    let evictionCount = 0;
    let order = 0;
    let opened = false;

    for (const address of addresses) {
      if (opened && !(await gate())) return;
      opened = true;

      order += 1;
      const lineNo = Math.floor(address / lineSize);
      const index = ((lineNo % lines.length) + lines.length) % lines.length;
      const tag = Math.floor(lineNo / lines.length);

      const resident = lines[index] ?? null;
      const hit = resident !== null && resident.tag === tag;
      const evicted = !hit && resident !== null ? resident : null;

      if (hit) hitCount += 1;
      else missCount += 1;
      if (evicted !== null) evictionCount += 1;

      lines[index] = { tag, address };

      const emptyIndices: number[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i] === null) emptyIndices.push(i);
      }

      await rc.emit({
        type: 'access',
        target: `index:${index}`,
        payload: {
          order,
          address,
          lineNo,
          index,
          tag,
          hit,
          evictedAddress: evicted === null ? null : evicted.address,
          evictedTag: evicted === null ? null : evicted.tag,
          emptyIndices,
          emptyLines: emptyIndices.length,
          hitCount,
          missCount,
          evictionCount,
        },
      });
      if (rc.cancelled) return;
    }

    if (!(await gate())) return;

    const emptyIndices: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i] === null) emptyIndices.push(i);
    }

    await rc.emit({
      type: 'done',
      payload: {
        total: order,
        hitCount,
        missCount,
        evictionCount,
        emptyIndices,
        emptyLines: emptyIndices.length,
      },
    });
  };

  // 자동 재생 — 걸음 사이에 stepMs 만큼 쉰다.
  await play(() => rc.sleep(rc.data.stepMs));

  // 다 보고 난 뒤 — 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 짚는다.
  // 첫 누름은 되감고 첫 걸음까지 간다 (`play` 가 첫 걸음에 문을 두지 않으므로,
  // rewind 와 첫 access 가 같은 누름에 함께 나간다).
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    // 뒤에서도 본다 — throw 규약에만 기대지 않는다 (C8).
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    await play(async () => {
      for (;;) {
        if (rc.cancelled) return false;
        const next = await rc.waitForInput();
        if (rc.cancelled) return false;
        if (next.type === 'advance') return true;
      }
    });
  }
};
