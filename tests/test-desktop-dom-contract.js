import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const htmlPath = path.resolve(process.cwd(), 'src/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const requiredIds = [
  'screen-splash',
  'screen-draw',
  'screen-sim',
  'world',
  'design-area',
  'panel-top-bar',
  'panel-progress-left',
  'panel-controls',
  'panel-scorecard',
  'btn-start-sim',
  'btn-pause',
  'btn-reset',
  'btn-edit',
  'btn-back',
  'btn-run',
  'tool-node',
  'tool-joint',
  'tool-bone',
  'tool-muscle',
  'tool-select',
  'tool-move',
  'tool-erase',
  'tool-pan',
  'tool-undo',
  'tool-reset-view',
  'tool-save',
  'tool-load',
  'tool-clear'
];

const missing = requiredIds.filter(id => !html.includes(`id="${id}"`));

if (missing.length > 0) {
  console.error('Desktop DOM contract failed. Missing IDs:');
  missing.forEach(id => console.error(`  - ${id}`));
  process.exit(1);
}

console.log('test-desktop-dom-contract: OK');
