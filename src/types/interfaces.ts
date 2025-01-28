export interface FileSnapshot {
	content: string;
	relativePath: string;
}

export interface Snapshot {
	name: string;
	timestamp: number;
	files: FileSnapshot[];
	workspaceFolder?: string; // Workspace folder path for backward compatibility
	snapshotScope?: {
		type: 'file' | 'directory' | 'workspace';
		uri: string;
	};
}

export interface DiffFile {
	relativePath: string;
	path: string;
	status: 'modified' | 'deleted' | 'created';
	original?: string;
	modified?: string;
}
