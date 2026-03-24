const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\fikri\\Downloads\\rough-animation (25).html';
const destDir = 'e:\\Novel\\lookis-animator';

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, {recursive: true});

let html = fs.readFileSync(srcPath, 'utf8');

// Extract CSS
const styleRegex = /<style>([\s\S]*?)<\/style>/;
const styleMatch = html.match(styleRegex);
if(styleMatch) {
    fs.writeFileSync(path.join(destDir, 'style.css'), styleMatch[1].trim());
    html = html.replace(styleRegex, '<link rel="stylesheet" href="./style.css">');
}

// Extract Main Script
const scriptRegex = /<script>\s*(function makeDraggable[\s\S]*?)<\/script>/;
const scriptMatch = html.match(scriptRegex);
if(scriptMatch) {
    fs.writeFileSync(path.join(destDir, 'app.js'), scriptMatch[1].trim());
    html = html.replace(scriptRegex, '<script src="./app.js" defer></script>');
}

// Add PWA tags (manifest, theme color)
const pwaHead = `
<link rel="manifest" href="./manifest.json">
<meta name="theme-color" content="#111111">
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icon.svg">
`;
html = html.replace('</title>', '</title>' + pwaHead);

// Add SW registration at the end of body
const swScript = `
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('SW Registered!', reg.scope);
      }).catch(err => console.log('SW Registration failed:', err));
    });
  }
</script>
`;
html = html.replace('</body>', swScript + '\\n</body>');

// Fix CDN links to be protocol-relative or absolute https
// already are absolute: https://cdn.jsdelivr...

fs.writeFileSync(path.join(destDir, 'index.html'), html);
console.log('Build successful!');
