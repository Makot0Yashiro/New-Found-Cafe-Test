import { build } from 'esbuild';
// The exported HTML remains in public; only the browser authentication client is bundled.
await build({entryPoints:['web/app.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'public/static/js/app.js',minify:true});
