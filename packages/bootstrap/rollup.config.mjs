// @ts-check
/**
 * @ffacet/bootstrap — rollup 설정.
 *
 * 정책:
 *  - 단일 ESM entry (bootstrap.js) + dynamic import 자동 chunk 추론.
 *  - external: @ffacet/core(+/runtime). core 는 호스트가 단일 인스턴스로 설치(peerDependency)
 *    → bootstrapFacet 등록과 runFacet 재생이 동일 registry 를 공유한다. core 를 inline 하면
 *    registry 가 갈라져 등록한 facet 을 재생기가 못 찾는다 (단일 인스턴스 핵심 제약).
 *  - algorithm 19종은 import('@ffacet/algorithm-*') 가 dynamic import 경계로 살아남아
 *    facet 별 lazy chunk 로 분리된다.
 *  - view-code / transpiler 6종은 정적 import → 공용 runtime chunk 로 inline.
 *  - .d.ts 는 별도 dts 패스. core 타입 참조는 external 로 보존.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import dts from 'rollup-plugin-dts';

const external = [/^@ffacet\/core(\/.*)?$/];

/**
 * chunk 분리 + 이름 부여.
 *  - algorithm facet (facets/<group>/<name>/src) → 'facet-<name>' (개별 lazy chunk).
 *  - view-code / transpiler-* → 'runtime' (entry 와 facet 모두 공유).
 * id 는 절대 파일 경로로 들어온다.
 */
function manualChunks(id) {
  const facet = id.match(/facets\/[^/]+\/([^/]+)\/src\//);
  if (facet) return `facet-${facet[1]}`;
  if (
    id.includes('/packages/view-code/') ||
    /\/packages\/transpiler-[^/]+\//.test(id)
  ) {
    return 'runtime';
  }
  return undefined;
}

/** chunk 출력 디렉터리. facet → facets/, vendor → vendor/, 나머지 → runtime/. */
function chunkFileName(info) {
  const name = info.name ?? '';
  if (name.startsWith('facet-')) return 'facets/[name]-[hash].js';
  const id = info.facadeModuleId ?? info.moduleIds?.[0] ?? '';
  if (id.includes('node_modules')) return 'vendor/[name]-[hash].js';
  return 'runtime/[name]-[hash].js';
}

const jsBundle = {
  input: 'src/index.ts',
  external,
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: 'bootstrap.js',
    chunkFileNames: chunkFileName,
    inlineDynamicImports: false,
    sourcemap: true,
    generatedCode: 'es2015',
    manualChunks,
  },
  plugins: [
    nodeResolve({ extensions: ['.ts', '.tsx', '.mjs', '.js'], preferBuiltins: false }),
    esbuild({
      target: 'es2022',
      sourceMap: true,
      tsconfig: '../../tsconfig.base.json',
    }),
  ],
};

const dtsBundle = {
  input: 'src/index.ts',
  external,
  output: {
    file: 'dist/bootstrap.d.ts',
    format: 'es',
  },
  plugins: [dts()],
};

export default [jsBundle, dtsBundle];
