// @ts-check
/**
 * @ffacet/core — rollup 설정.
 *
 * 정책:
 *  - 2 entry: index (ir 타입 + runtime 재공개) / runtime (4-layer 런타임 공개 표면).
 *  - core 는 외부 npm 의존이 없다 (완전 자족). external 없음.
 *  - registry 등 모듈 스코프 싱글톤은 index/runtime 가 공유하는 단일 chunk 에 남아야
 *    한다. index 가 runtime 을 통째로 re-export 하므로 rollup 이 공유 코드를 단일
 *    chunk 로 추출 → @ffacet/core 와 @ffacet/core/runtime 이 같은 registry 인스턴스를
 *    가리킨다 (bootstrap 등록 ↔ runFacet 재생 단일 인스턴스 보장의 토대).
 *  - .d.ts 는 별도 dts 패스로 entry 별 생성.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import dts from 'rollup-plugin-dts';

const input = {
  index: 'src/index.ts',
  runtime: 'src/runtime/index.ts',
};

const jsBundle = {
  input,
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    sourcemap: true,
    generatedCode: 'es2015',
  },
  plugins: [
    nodeResolve({ extensions: ['.ts', '.tsx', '.mjs', '.js'], preferBuiltins: false }),
    esbuild({
      target: 'es2022',
      sourceMap: true,
      tsconfig: '../../tsconfig.base.json',
      // 타입체크는 pnpm typecheck (tsc --noEmit) 담당. 여기는 transpile only.
    }),
  ],
};

const dtsBundle = {
  input,
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: '[name].d.ts',
    chunkFileNames: 'chunks/[name]-[hash].d.ts',
  },
  plugins: [dts()],
};

export default [jsBundle, dtsBundle];
