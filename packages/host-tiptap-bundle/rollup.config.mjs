// @ts-check
/**
 * @ffacet/host-tiptap-bundle — rollup 설정.
 *
 * 정책 (논의 결과):
 *  - 단일 ESM entry (host-tiptap-bundle.js) + dynamic import 자동 chunk 추론.
 *  - inlineDynamicImports: false (기본 명시) — 카탈로그 facet 전부의 lazy 보존 핵심.
 *  - external: @tiptap/core, @tiptap/pm — 호스트의 단일 인스턴스 보장.
 *  - chunkFileNames 는 함수형 — facet/ 와 runtime/ 디렉터리 분리 (디버깅 노이즈 감소).
 *  - manualChunks 는 강제 분리가 아닌 chunk name 부여 hint 용. core/runtime 의 공용 chunk 추출은 rollup 자동 위임 후 visualizer 로 실측 조정.
 *  - sourcemap: false — 발행본에 소스맵을 넣지 않는다. 소비자가 단계 실행할 자리가
 *    아니고, 맵이 tarball 의 3분의 2 를 차지했다. 켜져 있던 것은 판단의 결과가
 *    아니라 개발 기본값이 발행으로 흘러든 것이었다.
 *  - VISUALIZE=1 환경변수일 때만 stats.html 생성 (PR 시 size 회귀 점검용).
 *  - .d.ts 는 별도 빌드 패스 (rollup-plugin-dts) 로 단일 dist/host-tiptap-bundle.d.ts 생성.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import esbuild from 'rollup-plugin-esbuild';
import dts from 'rollup-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

const VISUALIZE = process.env.VISUALIZE === '1';

// @ffacet/core 는 external — 호스트가 단일 인스턴스로 설치(peerDependency)해 FacetExtension 의
// registry 가 호스트의 runFacet/loadFacet(@ffacet/core/runtime)과 동일 인스턴스를 공유한다.
// core 를 inline 하면 registry 가 갈라져 bootstrapFacet 등록 facet 을 FacetExtension 이 못 찾는다.
const external = [/^@ffacet\/core(\/.*)?$/, /^@tiptap\/core/, /^@tiptap\/pm(\/.*)?$/];

/**
 * chunk 분리 + 이름 부여.
 *
 *  - facet (facets/<group>/<name>/src) → 'facet-<name>' (개별 lazy chunk).
 *  - bootstrap 의 언어별 카탈로그 (src/catalog/<locale>.generated.ts) → 'catalog-<locale>' (언어별 lazy chunk).
 *  - ir-interpreter / view-code / transpiler-* → 'runtime' (entry 와 facet 모두가 공유).
 *    core 는 external 이라 그래프에 들어오지 않는다.
 *
 * runtime 을 명시 분리하지 않으면 rollup 이 공용 코드를 임의의 한 facet chunk (알파벳 첫 번째) 에 흡수시켜 entry 가 그 facet 을 정적 import 하는 비정상 그래프가 만들어진다.
 *
 * id 는 절대 파일 경로로 들어옴 (workspace 패키지명이 아님).
 */
function manualChunks(id) {
  const facet = id.match(/facets\/[^/]+\/([^/]+)\/src\//);
  if (facet) return `facet-${facet[1]}`;
  const catalog = id.match(/\/packages\/bootstrap\/src\/catalog\/([a-z]+)\.generated\.ts$/);
  if (catalog && catalog[1] !== 'loaders') return `catalog-${catalog[1]}`;
  if (
    id.includes('/packages/ir-interpreter/') ||
    id.includes('/packages/view-code/') ||
    /\/packages\/transpiler-[^/]+\//.test(id)
  ) {
    return 'runtime';
  }
  return undefined;
}

/** chunk 의 출력 디렉터리 결정. facet → facets/, 카탈로그 → catalog/, vendor → vendor/, 나머지 → runtime/. */
function chunkFileName(info) {
  const name = info.name ?? '';
  if (name.startsWith('facet-')) return 'facets/[name]-[hash].js';
  if (name.startsWith('catalog-')) return 'catalog/[name]-[hash].js';
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
    sourcemap: false,
    generatedCode: 'es2015',
    /** facet 별 chunk 분리 + 공용 runtime chunk 명시. */
    manualChunks,
  },
  plugins: [
    // bootstrap 의 loadFrameworkMessages 가 messages/<locale>.json 을 정적 경로로
    // 동적 import 한다. 이 번들은 bootstrap 을 inline 하므로 여기서도 json 을
    // 읽을 수 있어야 한다.
    json({ compact: true, namedExports: false }),
    nodeResolve({
      extensions: ['.ts', '.tsx', '.mjs', '.js'],
      preferBuiltins: false,
    }),
    esbuild({
      target: 'es2022',
      sourceMap: false,
      tsconfig: '../../tsconfig.base.json',
      // 비 ASCII 문자열을 \uXXXX 로 풀지 않는다 (bootstrap 설정과 같은 판단 — 언어별
      // 카탈로그가 한국어 기준 절반 가까이 부푼다).
      charset: 'utf8',
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
  // dts 는 기본적으로 모든 외부 모듈을 external 로 분류해 `export ... from
  // '@ffacet/host-tiptap'` 를 그대로 남긴다. 그 둘은 발행되지 않는 private
  // 패키지라 소비자는 타입을 전혀 받지 못한다 — includeExternal 로 이 둘의
  // 타입만 끌어들인다. core / tiptap 은 여기 없으므로 external 로 남아
  // 호스트가 설치한 단일 인스턴스의 타입을 그대로 쓴다.
  plugins: [dts({ includeExternal: ['@ffacet/host-tiptap', '@ffacet/bootstrap'] })],
};

export default [jsBundle, dtsBundle];
