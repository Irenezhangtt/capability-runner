import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'icon.svg'])
  await copyFile(`reviewer-demo/${file}`, `dist/${file}`);
console.log('Built credential-free interactive demo in dist/');
