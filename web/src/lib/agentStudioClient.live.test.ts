/**
 * LIVE integration smoke — runs ONLY when RUN_LIVE=1 (skipped in the normal suite).
 *
 *   RUN_LIVE=1 AS_APP_ID=VVKSSPDMJX AS_SEARCH_KEY=... AS_AGENT_ID=... \
 *     npx vitest run src/lib/agentStudioClient.live.test.ts
 *
 * Proves: the live published agent answers, the search key is accepted, and OUR
 * parser handles the REAL AI-SDK-v4 stream (content + a: hits).
 * Does NOT prove: browser CORS (node fetch bypasses CORS — that needs a browser).
 */
import { describe, it, expect } from 'vitest';
import { callCompletions } from './agentStudioClient';

// Dev-only test; avoid a hard @types/node dependency in the app tsconfig.
declare const process: { env: Record<string, string | undefined> };

const RUN = process.env.RUN_LIVE === '1';

describe.skipIf(!RUN)('agentStudioClient — LIVE', () => {
    const config = {
        appId: process.env.AS_APP_ID ?? 'VVKSSPDMJX',
        searchKey: process.env.AS_SEARCH_KEY ?? '',
        agentId: process.env.AS_AGENT_ID ?? '',
    };

    it('streams a grounded answer with hits from the live mirror agent', async () => {
        let lastText = '';
        const result = await callCompletions(
            config,
            { query: 'What is faceted search in Algolia?' },
            (acc) => { lastText = acc; },
        );

        // eslint-disable-next-line no-console
        console.log('[LIVE] content chars:', result.content.length, '| hits:', result.hits.length, '| error:', result.error);
        // eslint-disable-next-line no-console
        console.log('[LIVE] preview:', result.content.substring(0, 300));

        expect(result.error).toBeUndefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(lastText).toBe(result.content); // onText delivered the final accumulation
    }, 60_000);
});
