// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { fibonaccimemo, registerFibonaccimemo, fibonaccimemoFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('FibonacciMemo 알고리즘', () => {
  it('fib(0) = 0', async () => {
    const r = await fibonaccimemo({
      data: { type: 'integer', n: 0 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(0);
  });

  it('fib(1) = 1', async () => {
    const r = await fibonaccimemo({
      data: { type: 'integer', n: 1 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(1);
  });

  it('fib(8) = 21', async () => {
    const r = await fibonaccimemo({
      data: { type: 'integer', n: 8 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(21);
  });

  it('fib(15) = 610', async () => {
    const r = await fibonaccimemo({
      data: { type: 'integer', n: 15 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(610);
  });
});

describe('FibonacciMemo facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerFibonaccimemo();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(fibonaccimemoFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(2000);
    handle.destroy();
  });
});
