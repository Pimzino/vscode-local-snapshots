export interface FileSnapshot {
	content: string;
	relativePath: string;
}

export interface Snapshot {
	name: string;
	timestamp: number;
	files: FileSnapshot[];
} 