import { DiffFile } from '../types/interfaces';

type DiffFilePath = Pick<DiffFile, 'relativePath'>;

/**
 * Compares diff file paths for stable, case-insensitive ordering.
 */
export function compareDiffFilePaths(a: DiffFilePath, b: DiffFilePath): number {
	return a.relativePath.localeCompare(b.relativePath, undefined, {
		sensitivity: 'base',
		numeric: true,
	});
}

/**
 * Returns a new array of diff files sorted by relative path.
 */
export function sortDiffFilesByPath<T extends DiffFilePath>(files: T[]): T[] {
	return [...files].sort(compareDiffFilePaths);
}
