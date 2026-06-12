/**
 * Conversation helpers — ported from rc3 useChatStream.ts:118-121.
 *
 * Slices a thread down to the recent two-way context that gets sent to Agent
 * Studio as prior turns. Keeps memory across follow-ups without unbounded
 * prompt growth.
 */
import type { Message, HistoryEntry } from '../types/chat';

/** ~8 turns of user+assistant exchange. */
const DEFAULT_MAX_MESSAGES = 16;

/**
 * Filter to user/assistant messages, keep the last `maxMessages`, and map to
 * bare {role, content} pairs (dropping UI-only fields like isLoading/sources).
 */
export function buildConversationHistory(
    messages: Message[],
    maxMessages: number = DEFAULT_MAX_MESSAGES,
): HistoryEntry[] {
    return messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-maxMessages)
        .map(m => ({ role: m.role, content: m.content }));
}
