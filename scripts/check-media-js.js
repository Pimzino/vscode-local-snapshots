'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const mediaDir = path.join(__dirname, '..', 'media');
const files = fs
	.readdirSync(mediaDir)
	.filter((name) => name.endsWith('.js'))
	.map((name) => path.join(mediaDir, name))
	.sort();

let failed = false;

for (const file of files) {
	const relativePath = path.relative(process.cwd(), file);
	const result = spawnSync(process.execPath, ['--check', file], {
		encoding: 'utf8',
	});

	if (result.status === 0) {
		console.log(`OK ${relativePath}`);
		continue;
	}

	failed = true;
	console.error(`FAIL ${relativePath}`);
	if (result.stderr) {
		console.error(result.stderr.trim());
	}
}

if (failed) {
	console.error('\nMedia JavaScript syntax check failed.');
	process.exit(1);
}

console.log(`\nChecked ${files.length} media file(s).`);
