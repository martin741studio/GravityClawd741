import { createHash } from 'crypto';

export interface MultimodalPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string; // Base64
    };
    fileUri?: string; // For larger files in cloud storage if needed
}

export type MultimodalMessage = MultimodalPart[];

/**
 * Helper to check if a message is multimodal.
 */
export function isMultimodal(message: any): message is MultimodalMessage {
    return Array.isArray(message) && message.some(part => part.inlineData || part.fileUri);
}

/**
 * Generates a SHA-256 hash for a multimodal part containing data.
 */
export function getMediaHash(part: MultimodalPart): string | null {
    if (!part.inlineData) return null;
    return createHash('sha256').update(part.inlineData.data).digest('hex');
}
