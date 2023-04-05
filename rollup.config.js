import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import dts from 'rollup-plugin-dts';
import execute from 'rollup-plugin-execute';
import typescript from 'rollup-plugin-typescript2';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        format: 'esm',
        dir: 'dist/esm',
      },
      {
        format: 'cjs',
        dir: 'dist/cjs',
      },
    ],
    plugins: [
      typescript({ useTsconfigDeclarationDir: true }),
      resolve({ browser: true, extensions: ['.js', '.ts'] }),
      commonjs(),
    ],
    watch: {
      include: 'src/**',
    },
  },
  {
    input: 'src/index.ts',
    output: {
      format: 'es',
      file: 'dist/types.d.ts',
    },
    plugins: [dts(), execute(['rm -f dist/types/*', 'mv dist/types.d.ts dist/types/index.d.ts'])],
    watch: true,
  },
];
