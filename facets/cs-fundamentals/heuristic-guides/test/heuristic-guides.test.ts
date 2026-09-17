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
  remainingGuess,
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

  it('같은 칸을 두 번 꺼내지 않는다', () => {
    // 열어 본 칸의 수는 이제 화면이 `moves` 를 세어 말한다. 그 셈이 뜻을 가지려면
    // 한 칸이 두 번 꺼내어지는 일이 없어야 한다 — 그렇지 않으면 막대가 격자보다
    // 길어진다. 옮기기 전에는 걸음마다 실려 오던 누계를 대조했는데, 그 수가
    // `i + 1` 이라 사실은 아무것도 재지 않는 단언이었다.
    for (const trace of Object.values(computeHeuristicGuidesResult(data))) {
      const keys = trace.moves.map((m) => `${m.cell.col},${m.cell.row}`);
      expect(new Set(keys).size).toBe(keys.length);
      // 후보로 올린 칸도 겹치지 않는다. 겹치면 타일이 두 벌 그려진다.
      const opened = trace.moves.flatMap((m) => m.opened.map((at) => `${at.col},${at.row}`));
      expect(new Set(opened).size).toBe(opened.length);
    }
  });

  it('짐작은 목표에서 0 이고 한 칸 멀어질 때마다 하나씩 는다', () => {
    // 화면의 숫자와 꺼내는 차례를 정하는 수가 같은 함수를 지난다. 그 함수를
    // 내주었으므로 여기서 못 박는다.
    expect(remainingGuess(data.goal.col, data.goal.row, data.goal)).toBe(0);
    expect(remainingGuess(data.start.col, data.start.row, data.goal)).toBe(6);
    expect(remainingGuess(0, 0, data.goal)).toBe(8);
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
