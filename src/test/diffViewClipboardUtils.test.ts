import * as assert from 'assert';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const clipboardUtils = require(path.join(__dirname, '../../media/diffViewClipboardUtils.js')) as {
	getFilePathFromHeader: (header: HTMLElement | null | undefined) => string | null;
	handleFilePathCopyEvent: (event: ClipboardEvent, header: HTMLElement | null | undefined) => {
		handled: boolean;
		filePath: string | null;
		needsExtensionClipboard: boolean;
	};
	findFileHeaderFromFilePath: (filePathElement: Element | null | undefined) => HTMLElement | null;
	getFileHeaderFromCopyTarget: (target: EventTarget | null | undefined) => HTMLElement | null;
};

function createFileHeader(filePath: string): HTMLElement {
	const header = {
		getAttribute: (name: string) => (name === 'data-file-path' ? filePath : null),
		querySelector: (selector: string) => {
			if (selector === '.file-path .path') {
				return { textContent: filePath };
			}

			return null;
		},
		closest: () => null,
	} as unknown as HTMLElement;

	return header;
}

function createCopyEvent(): ClipboardEvent & { clipboardData: DataTransfer } {
	const data = new Map<string, string>();
	const clipboardData = {
		setData: (type: string, value: string) => {
			data.set(type, value);
		},
		getData: (type: string) => data.get(type) ?? '',
	} as unknown as DataTransfer;

	let defaultPrevented = false;
	const event = {
		clipboardData,
		preventDefault: () => {
			defaultPrevented = true;
		},
		get defaultPrevented() {
			return defaultPrevented;
		},
	} as unknown as ClipboardEvent & { clipboardData: DataTransfer };

	return event;
}

suite('DiffView clipboard utilities', () => {
	test('getFilePathFromHeader returns data-file-path attribute', () => {
		const header = createFileHeader('src/core/search-service.ts');

		assert.strictEqual(clipboardUtils.getFilePathFromHeader(header), 'src/core/search-service.ts');
	});

	test('getFilePathFromHeader returns null for missing header', () => {
		assert.strictEqual(clipboardUtils.getFilePathFromHeader(null), null);
		assert.strictEqual(clipboardUtils.getFilePathFromHeader(undefined), null);
	});

	test('handleFilePathCopyEvent writes file path to clipboard data', () => {
		const header = createFileHeader('src/providers/text-provider.ts');
		const event = createCopyEvent();

		const handled = clipboardUtils.handleFilePathCopyEvent(event, header);

		assert.strictEqual(handled.handled, true);
		assert.strictEqual(handled.needsExtensionClipboard, true);
		assert.strictEqual(event.defaultPrevented, true);
		assert.strictEqual(event.clipboardData.getData('text/plain'), 'src/providers/text-provider.ts');
	});

	test('handleFilePathCopyEvent returns unhandled when clipboard data is unavailable and no file path', () => {
		const event = {
			clipboardData: null,
			preventDefault: () => undefined,
		} as unknown as ClipboardEvent;

		const result = clipboardUtils.handleFilePathCopyEvent(event, null);

		assert.deepStrictEqual(result, {
			handled: false,
			filePath: null,
			needsExtensionClipboard: false,
		});
	});

	test('handleFilePathCopyEvent returns unhandled when header is missing', () => {
		const event = {
			clipboardData: null,
			preventDefault: () => undefined,
		} as unknown as ClipboardEvent;

		assert.deepStrictEqual(clipboardUtils.handleFilePathCopyEvent(event, null), {
			handled: false,
			filePath: null,
			needsExtensionClipboard: false,
		});
	});

	test('findFileHeaderFromFilePath returns closest file header', () => {
		const header = { className: 'file-header' } as unknown as HTMLElement;
		const filePath = {
			closest: (selector: string) => (selector === '.file-header' ? header : null),
		} as unknown as Element;

		assert.strictEqual(clipboardUtils.findFileHeaderFromFilePath(filePath), header);
	});

	test('getFileHeaderFromCopyTarget returns header when copy starts in file path', () => {
		const header = createFileHeader('src/core/search-service.ts');
		const pathSpan = {
			closest: (selector: string) => {
				if (selector === '.file-path') {
					return { closest: (innerSelector: string) => (innerSelector === '.file-header' ? header : null) };
				}

				return null;
			},
		} as unknown as Element;

		assert.strictEqual(clipboardUtils.getFileHeaderFromCopyTarget(pathSpan), header);
	});

	test('getFileHeaderFromCopyTarget ignores copy from action buttons', () => {
		const header = createFileHeader('src/core/search-service.ts');
		const restoreButton = {
			closest: (selector: string) => {
				if (selector === '.file-path') {
					return null;
				}

				if (selector === '.file-header') {
					return header;
				}

				if (selector === '.actions') {
					return { className: 'actions' };
				}

				return null;
			},
		} as unknown as Element;

		assert.strictEqual(clipboardUtils.getFileHeaderFromCopyTarget(restoreButton), null);
	});

	test('handleFilePathCopyEvent requests extension clipboard when clipboard data is unavailable', () => {
		const header = createFileHeader('README.md');
		const event = {
			clipboardData: null,
			preventDefault: () => undefined,
		} as unknown as ClipboardEvent;

		const result = clipboardUtils.handleFilePathCopyEvent(event, header);

		assert.deepStrictEqual(result, {
			handled: true,
			filePath: 'README.md',
			needsExtensionClipboard: true,
		});
	});
});
