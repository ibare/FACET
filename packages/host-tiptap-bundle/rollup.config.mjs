// @ts-check
/**
 * @facet/host-tiptap-bundle — rollup 설정.
 *
 * 정책 (논의 결과):
 *  - 단일 ESM entry (host-tiptap-bundle.js) + dynamic import 자동 chunk 추론.
 *  - inlineDynamicImports: false (기본 명시) — 21 facet 의 lazy 보존 핵심.
 *  - external: @tiptap/core, @tiptap/pm — 호스트의 단일 인스턴스 보장.
 *  - chunkFileNames 는 함수형 — facet/ 와 runtime/ 디렉터리 분리 (디버깅 노이즈 감소).
 *  - manualChunks 는 강제 분리가 아닌 chunk name 부여 hint 용. core/runtime 의 공용 chunk 추출은 rollup 자동 위임 후 visualizer 로 실측 조정.
 *  - sourcemap: true.
 *  - VISUALIZE=1 환경변수일 때만 stats.html 생성 (PR 시 size 회귀 점검용).
 *  - .d.ts 는 별도 빌드 패스 (rollup-plugin-dts) 로 단일 dist/host-tiptap-bundle.d.ts 생성.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import dts from 'rollup-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

const VISUALIZE = process.env.VISUALIZE === '1';

const external = [/^@tiptap\/core/, /^@tiptap\/pm(\/.*)?$/];

/**
 * chunk 분리 + 이름 부여.
 *
 *  - facet (facets/<group>/<name>/src) → 'facet-<name>' (개별 lazy chunk).
 *  - core / ir-interpreter / view-code / transpiler-* → 'runtime' (entry 와 facet 모두가 공유).
 *
 * runtime 을 명시 분리하지 않으면 rollup 이 공용 코드를 임의의 한 facet chunk (알파벳 첫 번째) 에 흡수시켜 entry 가 그 facet 을 정적 import 하는 비정상 그래프가 만들어진다.
 *
 * id 는 절대 파일 경로로 들어옴 (workspace 패키지명이 아님).
 */
function manualChunks(id) {
  const facet = id.match(/facets\/[^/]+\/([^/]+)\/src\//);
  if (facet) return `facet-${facet[1]}`;
  if (
    id.includes('/packages/core/') ||
    id.includes('/packages/ir-interpreter/') ||
    id.includes('/packages/view-code/') ||
    /\/packages\/transpiler-[^/]+\//.test(id)
  ) {
    return 'runtime';
  }
  return undefined;
}

/** chunk 의 출력 디렉터리 결정. facet → facets/, vendor → vendor/, 나머지 → runtime/. */
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
    entryFileNames: 'host-tiptap-bundle.js',
    chunkFileNames: chunkFileName,
    inlineDynamicImports: false,
    sourcemap: true,
    generatedCode: 'es2015',
    /** facet 별 chunk 분리 + 공용 runtime chunk 명시. */
    manualChunks,
  },
  plugins: [
    nodeResolve({
      extensions: ['.ts', '.tsx', '.mjs', '.js'],
      preferBuiltins: false,
    }),
    esbuild({
      target: 'es2022',
      sourceMap: true,
      tsconfig: '../../tsconfig.base.json',
      // 타입체크는 pnpm typecheck (tsc --noEmit) 가 담당. 여기는 transpile only.
    }),
    VISUALIZE &&
      visualizer({
        filename: 'stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
};

const dtsBundle = {
  input: 'src/index.ts',
  external,
  output: {
    file: 'dist/host-tiptap-bundle.d.ts',
    format: 'es',
  },
  plugins: [dts()],
};

export default [jsBundle, dtsBundle];
