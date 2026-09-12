/**
 * 곱 양자화 — 손잡이 네 값에서 오차와 자리를 잠근다.
 *
 * **끝 상태만 보지 않는다.** 계기는 누적 채널이라 손잡이를 돌려 다시 돌면 수가
 * 쌓이는데, 마지막 회차만 재면 그 붕괴가 보이지 않는다. 회차마다 계기 두 개를
 * 그 자리에서 읽는다.
 *
 * 화면이 말하는 수와 화면이 그린 것도 함께 본다 — 캡션의 오차와 벌어짐의 길이가
 * 같은 이야기를 해야 한다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clearRegistry, runFacet } from '@ffacet/core';
import {
  computeProductQuantizationRound,
  productQuantizationFacet,
  registerProductQuantization,
} from '../src/index.js';

const VECTOR = [6, 2, 7, 3, 5, 8, 2, 6];
const GRID = [2, 4, 6, 8];

/** 호스트가 실제로 돌려 잰 표. 이 수가 나와야 한다. */
const TABLE = [
  { parts: 1, size: 8, bytes: 1, errorX100: 656, percent: 44, restored: [4, 4, 4, 4, 4, 4, 4, 4] },
  { parts: 2, size: 4, bytes: 2, errorX100: 624, percent: 41, restored: [4, 4, 4, 4, 6, 6, 6, 6] },
  { parts: 4, size: 2, bytes: 4, errorX100: 557, percent: 37, restored: [4, 4, 4, 4, 6, 6, 4, 4] },
  { parts: 8, size: 1, bytes: 8, errorX100: 173, percent: 11, restored: [6, 2, 6, 2, 4, 8, 2, 6] },
];

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function metricValue(container: HTMLElement, name: string): number {
  const badge = container.querySelector(`.facet-control-bar__metric--${name}`);
  const value = badge?.lastElementChild?.textContent ?? '';
  return Number(value);
}

/** 벌어짐 여덟의 길이 합. 되살린 값이 원본에서 얼마나 떨어져 있는지 그림에서 읽는다. */
function gapTotal(container: HTMLElement): number {
  let sum = 0;
  for (const line of container.querySelectorAll('.facet-pq__gap')) {
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

/** 계기 둘이 기다리는 값이 될 때까지 본다. 상한에 닿으면 그대로 돌아와 아래에서 어긋남을 드러낸다. */
async function settleAt(container: HTMLElement, bytes: number, percent: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (metricValue(container, 'code-bytes') === bytes && metricValue(container, 'error-percent') === percent) {
      // 마지막 걸음의 애니메이션이 끝나 그림이 멎을 틈을 준다.
      await delay(200);
      return;
    }
    await delay(50);
  }
}

describe('곱 양자화의 셈', () => {
  it('손잡이 네 값에서 표와 같은 오차와 자리가 나온다', () => {
    for (const row of TABLE) {
      const round = computeProductQuantizationRound(VECTOR, GRID, row.parts);
      expect({
        parts: round.parts,
        size: round.size,
        bytes: round.bytes,
        errorX100: round.errorX100,
        percent: round.percent,
        restored: round.restored,
      }).toEqual(row);
    }
  });

  it('오차는 단조로 줄고 자리는 단조로 는다', () => {
    const rounds = TABLE.map((row) => computeProductQuantizationRound(VECTOR, GRID, row.parts));
    for (let i = 1; i < rounds.length; i += 1) {
      expect(rounds[i].errorX100).toBeLessThan(rounds[i - 1].errorX100);
      expect(rounds[i].bytes).toBeGreaterThan(rounds[i - 1].bytes);
    }
  });

  it('동률은 번호가 앞선 쪽이 이긴다', () => {
    // 값 3 은 대표 2 와 4 로부터 같고, 값 5 는 4 와 6 으로부터 같다.
    expect(computeProductQuantizationRound([3], GRID, 1).restored).toEqual([2]);
    expect(computeProductQuantizationRound([5], GRID, 1).restored).toEqual([4]);
    expect(computeProductQuantizationRound([7], GRID, 1).restored).toEqual([6]);
  });
});

describe('손잡이를 돌리면', () => {
  it('회차마다 계기와 화면이 표와 같다', async () => {
    clearRegistry();
    registerProductQuantization();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(productQuantizationFacet, container);
    // 걸음 간격은 속도에 나뉜다 — 검사는 빨리 돌리고 화면은 그대로 본다.
    handle.setSpeed(8);

    const seen: Array<{ bytes: number; percent: number; caption: string; slots: number; gap: number }> = [];

    try {
      // 처음 자리는 토막 2 다. 그 뒤 4 · 8 · 1 로 옮긴다.
      const order = [2, 4, 8, 1];
      for (const parts of order) {
        const row = TABLE.find((r) => r.parts === parts)!;
        if (parts !== 2) {
          const cell = container.querySelector<HTMLElement>(
            `[data-seg-index="${TABLE.findIndex((r) => r.parts === parts)}"]`,
          );
          expect(cell, `토막 ${parts} 구간이 있어야 한다`).not.toBeNull();
          cell!.click();
        }
        await settleAt(container, row.bytes, row.percent);
        seen.push({
          bytes: metricValue(container, 'code-bytes'),
          percent: metricValue(container, 'error-percent'),
          caption: container.querySelector('.facet-pq__caption')?.textContent ?? '',
          slots: container.querySelectorAll('.facet-pq__slot').length,
          gap: gapTotal(container),
        });
      }
    } finally {
      handle.destroy();
      container.remove();
    }

    // 계기는 회차마다 표와 같다 — 쌓이면 둘째 회차부터 어긋난다.
    expect(seen.map((s) => ({ bytes: s.bytes, percent: s.percent }))).toEqual(
      [2, 4, 8, 1].map((parts) => {
        const row = TABLE.find((r) => r.parts === parts)!;
        return { bytes: row.bytes, percent: row.percent };
      }),
    );

    // 쌓인 번호의 수가 곧 자리다.
    expect(seen.map((s) => s.slots)).toEqual([2, 4, 8, 1]);

    // 캡션이 말하는 오차가 표의 소수 두 자리와 같다.
    for (let i = 0; i < seen.length; i += 1) {
      const row = TABLE.find((r) => r.parts === [2, 4, 8, 1][i])!;
      expect(seen[i].caption).toContain((row.errorX100 / 100).toFixed(2));
    }

    // 그림도 같은 말을 한다. 벌어짐 여덟의 길이 합은 |원본 - 되살린 것| 의 합에
    // 축척(UNIT=16)을 곱한 값이라, 화면에 실제로 선 것이 표의 되살린 벡터인지
    // 여기서 드러난다 — 캡션만 맞고 그림이 딴 자리에 서 있는 것을 잡는다.
    const UNIT = 16;
    const byParts = new Map(seen.map((s, i) => [[2, 4, 8, 1][i], s.gap]));
    for (const row of TABLE) {
      const want = row.restored.reduce((a, v, i) => a + Math.abs(VECTOR[i] - v), 0) * UNIT;
      expect(byParts.get(row.parts)!, `토막 ${row.parts} 의 벌어짐`).toBeCloseTo(want, 1);
    }
    // 토막 8 이 가장 붙어 있고 토막 1 이 가장 벌어져 있다.
    expect(byParts.get(8)!).toBeLessThan(byParts.get(4)!);
    expect(byParts.get(4)!).toBeLessThan(byParts.get(1)!);
  }, 120_000);
});
