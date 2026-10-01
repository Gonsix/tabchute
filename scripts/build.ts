import { cp, mkdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
async function build() {
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });
  const result = await Bun.build({ entrypoints: ['src/background.ts', 'src/popup.ts', 'src/editor.ts'], outdir: 'dist', target: 'browser', format: 'esm', minify: true });
  if (!result.success) throw new AggregateError(result.logs, 'Build failed');
  await cp('static', 'dist', { recursive: true });
  console.log('Built TabChute → dist/');
}
await build();
if (process.argv.includes('--watch')) {
  let timer: ReturnType<typeof setTimeout>;
  let pending = Promise.resolve();
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => { pending = pending.then(build).catch(console.error); }, 150); };
  watch('src', { recursive: true }, rebuild);
  watch('static', { recursive: true }, rebuild);
  console.log('Watching src/ and static/. Reload the extension after a build.');
}
