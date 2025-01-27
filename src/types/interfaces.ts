export interface FileSnapshot {
	content: string;
	relativePath: string;
}

export interface Snapshot {
	name: string;
	timestamp: number;
	files: FileSnapshot[];
}

export interface DiffFile {
	relativePath: string;
	path: string;
	status: 'modified' | 'deleted' | 'created';
	original?: string;
	modified?: string;
}
