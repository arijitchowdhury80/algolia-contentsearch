/**
 * conversation history slicing — ported pattern from rc3 useChatStream.ts:118-121
 * (filter to user/assistant → slice last N → map to {role, content}).
 *
 * Stage-1 keeps the last ~8 turns (16 messages) of two-way thread context so the
 * agent has memory across follow-ups without unbounded prompt growth.
 */
import { describe, it, expect } from 'vitest';
import { buildConversationHistory } from './conversation';
import type { Message } from '../types/chat';

const msg = (role: 'user' | 'assistant', content: string): Message => ({ role, content });

describe('buildConversationHistory', () => {
    it('maps to bare {role, content} pairs, dropping UI-only fields', () => {
        const history = buildConversationHistory([
            { role: 'user', content: 'hi', isLoading: false, sources: [], id: 'x' },
        ]);
        expect(history).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('keeps only the last 16 messages (≈8 turns) by default', () => {
        const many: Message[] = Array.from({ length: 30 }, (_, i) =>
            msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`)
        );
        const history = buildConversationHistory(many);
        expect(history).toHaveLength(16);
        expect(history[0].content).toBe('m14'); // 30 - 16 = 14 dropped
        expect(history[15].content).toBe('m29');
    });

    it('respects a custom maxMessages cap', () => {
        const many: Message[] = Array.from({ length: 10 }, (_, i) => msg('user', `m${i}`));
        expect(buildConversationHistory(many, 4)).toHaveLength(4);
    });

    it('excludes non-conversational roles (e.g. system/tool placeholders)', () => {
        const mixed = [
            msg('user', 'q1'),
            { role: 'system', content: 'noise' } as unknown as Message,
            msg('assistant', 'a1'),
        ];
        const history = buildConversationHistory(mixed);
        expect(history).toEqual([
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' },
        ]);
    });
});
