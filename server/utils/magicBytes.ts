import { logger } from "../logger";

// Magic Bytes
const SIGNATURES = {
    PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
    ZIP: [0x50, 0x4B, 0x03, 0x04], // PK.. (Common ZIP)
};

/**
 * Validate that the file buffer matches the expected format signature.
 * 
 * @param buffer - File content buffer
 * @param filename - Original filename (for extension check context)
 * @returns boolean - true if valid, false if mismatch
 */
export function validateMagicBytes(buffer: Buffer, filename: string): boolean {
    if (!buffer || buffer.length < 4) {return false;}

    const ext = filename.toLowerCase().split('.').pop() || '';

    // Check PDF
    if (ext === 'pdf') {
        const isPdf = compareBytes(buffer, SIGNATURES.PDF);
        if (!isPdf) {
            logger.warn({ filename, head: buffer.subarray(0, 4).toString('hex') }, 'Magic Byte Mismatch: Expected PDF');
        }
        return isPdf;
    }

    // Check DOCX (Zip container)
    if (ext === 'docx') {
        const isZip = compareBytes(buffer, SIGNATURES.ZIP);
        if (!isZip) {
            // Some docx tools might use empty/spanned zip signatures? 
            // Stick to standard PK\x03\x04 for now.
            logger.warn({ filename, head: buffer.subarray(0, 4).toString('hex') }, 'Magic Byte Mismatch: Expected ZIP/DOCX');
        }
        return isZip;
    }

    // Allow others (txt/md) or default true if not strictly enforced
    if (['txt', 'md'].includes(ext)) {
        return true;
    }

    // If extension is not one we strictly check, assume safe (or handled by other validators)
    // But for this task, we focus on PDF/DOCX spoofing.
    return true;
}

function compareBytes(buffer: Buffer, signature: number[]): boolean {
    for (let i = 0; i < signature.length; i++) {
        if (buffer[i] !== signature[i]) {return false;}
    }
    return true;
}
