const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = path.resolve(__dirname, 'dist');
try { fs.rmSync(outdir, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(outdir, { recursive: true });

async function buildAll(){
  const builds = [
    {entry: 'src/background.ts', outfile: path.join(outdir, 'background.js')},
    {entry: 'src/contentScript.ts', outfile: path.join(outdir, 'contentScript.js')},
    {entry: 'src/detector.ts', outfile: path.join(outdir, 'detector.js')},
    {entry: 'src/popup.ts', outfile: path.join(outdir, 'popup.js')}
  ];

  await Promise.all(builds.map(b=>esbuild.build({
    entryPoints: [b.entry],
    bundle: true,
    platform: 'browser',
    sourcemap: false,
    minify: false,
    outfile: b.outfile
  })));

  // copy static assets
  const toCopy = ['manifest.json','popup.html','options.html'];
  toCopy.forEach(f=>{
    const src = path.resolve(__dirname, f);
    const dest = path.join(outdir, f);
    try {
      if (fs.cpSync) {
        fs.cpSync(src, dest, { recursive: true, force: true });
      } else {
        // fallback for older Node: file copy only (your assets are files)
        fs.copyFileSync(src, dest);
      }
    } catch (e) { console.warn('copy failed', f, e.message); }
  });

  console.log('Build complete — output in', outdir);
}

buildAll().catch(err=>{ console.error(err); process.exit(1); });
