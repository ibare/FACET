// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { factorial, registerFactorial, factorialFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('Factorial 알고리즘', () => {
  it('5! = 120', async () => {
    const r = await factorial({
      data: { type: 'integer', n: 5 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(120);
  });

  it('0! = 1', async () => {
    const r = await factorial({
      data: { type: 'integer', n: 0 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(1);
  });

  it('1! = 1', async () => {
    const r = await factorial({
      data: { type: 'integer', n: 1 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(1);
  });

  it('10! = 3628800', async () => {
    const r = await factorial({
      data: { type: 'integer', n: 10 },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(3628800);
  });
});

describe('Factorial facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerFactorial();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(factorialFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(2000);
    handle.destroy();
  });
});
