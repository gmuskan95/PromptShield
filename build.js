const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outdir = path.resolve(__dirname, 'dist');
try { fs.rmSync(outdir, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(outdir, { recursive: true });

async function buildAll(){
  const builds = [
    {entry: 'src/background.ts', outfile: path.join(outdir, 'background.js')},
    {entry: 'src/contentScript.ts', outfile: path.join(outdir, 'contentScript.js')},
    {entry: 'src/popup.ts', outfile: path.join(outdir, 'popup.js')},
    {entry: 'src/onboarding.ts', outfile: path.join(outdir, 'onboarding.js')}
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
  const toCopy = ['manifest.json','popup.html','options.html','onboarding.html'];
  // generate icons from icon.svg at build time — no manual export needed
  const svgPath = path.resolve(__dirname, 'icon.svg');
  if (fs.existsSync(svgPath)) {
    const destIcons = path.join(outdir, 'icons');
    fs.mkdirSync(destIcons, { recursive: true });
    const svgBuf = fs.readFileSync(svgPath);
    await Promise.all([16, 48, 128].map(size =>
      sharp(svgBuf).resize(size, size).png().toFile(path.join(destIcons, `icon${size}.png`))
    ));
  }
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
