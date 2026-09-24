import { build } from 'esbuild';
await build({ entryPoints: ['server/index.ts', 'server/cli.ts'], outdir: 'dist-server', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });
