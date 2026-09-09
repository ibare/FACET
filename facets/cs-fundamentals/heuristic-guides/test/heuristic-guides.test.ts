/**
 * 조각의 셈과 재생을 잰다.
 *
 * 화면에 뜨는 수(열어 본 칸 · 걸음 수)는 전부 알고리즘이 격자에서 셈해 나온다.
 * 그 수가 흔들리면 그림이 거짓을 말하게 되므로 대조값을 여기 못 박는다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import {
  computeHeuristicGuidesResult,
  heuristicGuidesFacet,
  registerHeuristicGuides,
  type HeuristicGuidesData,
} from '../src/index.js';
import { clearRegistry, runFacet } from '@ffacet/core/runtime';

const data = heuristicGuidesFacet.initialData as unknown as HeuristicGuidesData;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('heuristicGuides', () => {
  it('짐작을 더하면 열어 본 칸이 줄고 길은 그대로다', () => {
    const { plain, guided } = computeHeuristicGuidesResult(data);

    expect(plain.moves.length).toBe(25);
    expect(guided.moves.length).toBe(7);
    // 마지막으로 꺼낸 칸이 목표여야 탐색이 닿은 것이다.
    expect(plain.moves[plain.moves.length - 1]?.cell).toEqual(data.goal);
    expect(guided.moves[guided.moves.length - 1]?.cell).toEqual(data.goal);
    // 답은 같다 — 짐작은 어디를 들여다볼지만 바꾼다.
    expect(guided.route).toEqual(plain.route);
    expect(plain.route.length - 1).toBe(6);
  });

  it('열어 본 칸의 수는 걸음마다 하나씩 는다', () => {
    const { plain } = computeHeuristicGuidesResult(data);
    expect(plain.moves.map((m) => m.count)).toEqual(plain.moves.map((_, i) => i + 1));
  });

  it('마운트하면 스스로 재생하고 세로는 그대로다', async () => {
    clearRegistry();
    registerHeuristicGuides();

    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(heuristicGuidesFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg?.getAttribute('viewBox');

      // 마운트 직후의 수를 먼저 잡아 둔다. 상수 문턱으로 재려다 실패한 적이
      // 있다 — 격자 70 칸에 막대와 그 배경까지 이미 일흔여섯이라, "칸이 열렸다"
      // 는 단언이 **한 걸음도 굴러가지 않아도** 통과했다. 자랐는지를 보려면
      // 자라기 전과 견주는 수밖에 없다.
      const before = svg?.querySelectorAll('rect').length ?? 0;

      await wait(1_500);
      // 캔버스가 떨어져 나가지 않았고, 세로도 그대로다.
      expect(container.querySelector('svg')).toBe(svg);
      expect(svg?.getAttribute('viewBox')).toBe(box);
      // 재생이 굴러 칸이 실제로 열렸다.
      expect(svg?.querySelectorAll('rect').length ?? 0).toBeGreaterThan(before);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  });
});
