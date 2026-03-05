import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const htmlPath = path.resolve(root, 'src/index.html');
const mainPath = path.resolve(root, 'src/main.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const main = fs.readFileSync(mainPath, 'utf8');

const requiredHtmlIds = [
  'mobile-panel-shell',
  'btn-mobile-panel-back',
  'btn-mobile-tab-controls',
  'btn-mobile-tab-stats',
  'mobile-pane-controls',
  'mobile-pane-stats',
  'top-metrics-container',
  'mobile-stats-live-body',
  'mobile-stats-neural-body',
  'mobile-stats-evolution-body',
  'mobile-stats-secondary-body'
];

const requiredMainTokens = [
  'mobile-sheet-open',
  'mobile-sheet-controls',
  'mobile-sheet-stats',
  'openMobileSheet(',
  'closeMobileSheet(',
  'setMobileSheetTab('
];

const missingHtml = requiredHtmlIds.filter(id => !html.includes(`id="${id}"`));
const missingMain = requiredMainTokens.filter(token => !main.includes(token));

if (missingHtml.length || missingMain.length) {
  console.error('Mobile sheet DOM contract failed.');
  if (missingHtml.length) {
    console.error('Missing HTML IDs:');
    missingHtml.forEach(id => console.error(`  - ${id}`));
  }
  if (missingMain.length) {
    console.error('Missing JS tokens:');
    missingMain.forEach(token => console.error(`  - ${token}`));
  }
  process.exit(1);
}

console.log('test-mobile-sheet-dom-contract: OK');
