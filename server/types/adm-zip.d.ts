declare module 'adm-zip' {
    export default class AdmZip {
        constructor(filePath?: string | Buffer);
        addFile(entryName: string, content: Buffer, comment?: string, attr?: number): void;
        addLocalFile(localPath: string, zipPath?: string, zipName?: string): void;
        addLocalFolder(localPath: string, zipPath?: string, filter?: RegExp): void;
        toBuffer(): Buffer;
        getEntries(): any[];
        readAsText(entry: any, encoding?: string): string;
        entryName: string;
    }
}
