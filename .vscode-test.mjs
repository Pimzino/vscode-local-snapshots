import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
	{
		label: 'unit',
		files: 'out/test/**/*.test.js',
		exclude: 'out/test/performance.test.js',
		extensionDevelopmentPath: '.',
	},
	{
		label: 'performance',
		files: 'out/test/performance.test.js',
		extensionDevelopmentPath: '.',
	},
]);
