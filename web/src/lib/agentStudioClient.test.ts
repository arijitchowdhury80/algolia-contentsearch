/**
 * agentStudioClient SSE parser — golden-fixture tests.
 *
 * The AI SDK v4 data-stream format (compatibilityMode=ai-sdk-4) is an external
 * wire contract. Frame prefixes (rc3 useAgentStudioMaverick.ts:114-242):
 *   0:"text delta"                                  → streamed answer text
 *   9:{toolCallId,toolName,args}                    → tool call issued
 *   a:{toolCallId,result}                           → server tool result (hits)
 *   3:"error message"                               → error frame
 *   b:/e:/d:/f:/2:/c:                               → metadata (ignored)
 *
 * These fixtures lock the parser so a refactor can't silently drop text deltas,
 * hits (the grounding source pool), or error frames.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseSSELine, parseCompletionStream } from './agentStudioClient';

describe('parseSSELine', () => {
    it('splits on the FIRST colon (payload may contain colons, e.g. URLs)', () => {
        expect(parseSSELine('0:"see https://x.com"')).toEqual({
            prefix: '0',
            payload: '"see https://x.com"',
        });
    });

    it('returns null for a line with no colon', () => {
        expect(parseSSELine('garbage')).toBeNull();
    });
});

describe('parseCompletionStream', () => {
    it('concatenates 0: text deltas into the full answer', () => {
        const { content } = parseCompletionStream(['0:"Hello "', '0:"world"', 'd:{"finishReason":"stop"}']);
        expect(content).toBe('Hello world');
    });

    it('invokes onText with the running accumulation for each delta', () => {
        const onText = vi.fn();
        parseCompletionStream(['0:"Hel"', '0:"lo"'], onText);
        expect(onText).toHaveBeenNthCalledWith(1, 'Hel');
        expect(onText).toHaveBeenNthCalledWith(2, 'Hello');
    });

    it('collects tool calls from 9: frames', () => {
        const { toolInvocations } = parseCompletionStream([
            '9:{"toolCallId":"t1","toolName":"searchIndex","args":{"query":"faceting"}}',
        ]);
        expect(toolInvocations).toEqual([
            { tool_call_id: 't1', tool_name: 'searchIndex', args: { query: 'faceting' } },
        ]);
    });

    it('collects search hits from a: tool-result frames (the grounding source pool)', () => {
        const { hits } = parseCompletionStream([
            'a:{"toolCallId":"t1","result":{"hits":[{"title":"Faceting","url":"https://www.algolia.com/doc"},{"title":"Synonyms","url":"https://www.algolia.com/doc/synonyms"}]}}',
        ]);
        expect(hits).toHaveLength(2);
        expect(hits[0]).toMatchObject({ title: 'Faceting', url: 'https://www.algolia.com/doc' });
    });

    it('collects hits when a: result is a bare array', () => {
        const { hits } = parseCompletionStream([
            'a:{"toolCallId":"t1","result":[{"url":"https://www.algolia.com/doc"}]}',
        ]);
        expect(hits).toHaveLength(1);
    });

    it('captures a 3: error frame', () => {
        const { error } = parseCompletionStream(['3:"model provider returned 401"']);
        expect(error).toBe('model provider returned 401');
    });

    it('ignores metadata frames (b/e/d/f/2/c) without throwing', () => {
        const { content, error } = parseCompletionStream([
            'f:{"messageId":"m1"}',
            '0:"hi"',
            'e:{"finishReason":"stop"}',
            'd:{"finishReason":"stop"}',
        ]);
        expect(content).toBe('hi');
        expect(error).toBeUndefined();
    });

    it('tolerates malformed JSON in a delta without crashing', () => {
        const { content } = parseCompletionStream(['0:not-json', '0:"ok"']);
        // malformed delta is skipped; valid one still accumulates
        expect(content).toBe('ok');
    });
});
