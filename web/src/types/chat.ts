/**
 * Chat data contracts — trimmed Stage-1 port of rc3 src/types/chat.ts:12-144.
 *
 * Only the fields the Stage-1 webapp actually uses. The full rc3 type carried
 * dozens of fields for the Maverick double-helix / specialist system that are
 * out of scope here; they can be re-introduced at Stage 2 if needed.
 */

export type SourceType = 'casual' | 'rag' | 'fallback' | 'doc' | 'refusal' | string;

/**
 * A retrieved source / citation. Shape is tolerant of both our Agent Studio
 * `a:` tool-result hits and keyword-search hits ({title,url,summary}) AND rc2's
 * Atlas shape ({doc_title,doc_url,chunk_text}) — the grounding auditor reads
 * either, so Source mirrors that union.
 */
export interface Source {
    id?: string;
    objectID?: string;
    title?: string;
    url?: string;
    summary?: string;
    source_type?: string;
    // rc2/Atlas-shaped fields (kept so audit.ts source-pool matching is faithful)
    doc_title?: string;
    doc_url?: string;
    chunk_text?: string;
    doc_summary?: string;
    position?: number;
}

/**
 * Which panel produced this message (used by the comparison view).
 *   website — ① Current Website Search (placeholder, offline capture in Wave 2)
 *   mirror  — ② Ask AI (placeholder agent → real Ask-AI-default config in Wave 2)
 *   tuned   — ③ Our System (optimized)
 */
export type ColumnId = 'website' | 'mirror' | 'tuned';

export interface Message {
    id?: string;
    timestamp?: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    sourceType?: SourceType;
    /** Which column this answer came from (assistant messages in the A/B view). */
    column?: ColumnId;
    /** True while the answer is still streaming. */
    isLoading?: boolean;
    /** True when the agent issued a strict, grounded refusal (no answer in index). */
    refused?: boolean;
    queryID?: string;
    indexName?: string;
}

/** A bare conversation turn sent back to Agent Studio as prior context. */
export interface HistoryEntry {
    role: 'user' | 'assistant';
    content: string;
}
