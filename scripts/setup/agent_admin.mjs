#!/usr/bin/env node
/**
 * Agent Studio admin helper for OUR agents on VVKSSPDMJX (build-time, admin key).
 * Uses node's fetch (trusts the cert chain that python's bundle rejects).
 *
 * Commands:
 *   node agent_admin.mjs get <agentId>
 *       → prints config + writes instructions verbatim to current_instructions.txt
 *   node agent_admin.mjs update <agentId> <instructionsFile>
 *       → PATCH /1/agents/{id} {instructions} then POST /publish then GET to confirm
 *         (Agent Studio Update Agent: PATCH /1/agents/{id}, ACL editSettings;
 *          publish is a separate action — rc3 api-reference §2.4/§2.6)
 *   node agent_admin.mjs bait <agentId>
 *       → fires the grounding bait-query set and prints each transcript
 *         (content / hits / error) as refusal-vs-answer evidence
 *
 * Reads ../../.env.local (handles hyphenated ARIJIT-TEST_* keys).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const ENV = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const APP = ENV['ARIJIT-TEST_APP_ID'];
const KEY = ENV['ARIJIT-TEST_ADMIN_API_KEY'];
if (!APP || !KEY) { console.error('Missing ARIJIT-TEST_APP_ID / ARIJIT-TEST_ADMIN_API_KEY in .env.local'); process.exit(1); }

async function call(method, path, body) {
    const res = await fetch(`https://${APP}.algolia.net${path}`, {
        method,
        headers: {
            'X-Algolia-Application-Id': APP,
            'X-Algolia-API-Key': KEY,
            'Content-Type': 'application/json',
            'User-Agent': 'curl/8.4.0',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { status: res.status, json };
}

const [cmd, agentId] = process.argv.slice(2);

if (cmd === 'get') {
    if (!agentId) { console.error('usage: get <agentId>'); process.exit(1); }
    const { status, json } = await call('GET', `/agent-studio/1/agents/${agentId}`);
    console.log(`HTTP ${status}  agent=${agentId}`);
    if (status !== 200) { console.log(JSON.stringify(json, null, 2).slice(0, 1000)); process.exit(1); }
    console.log(`name=${json.name}  model=${json.model}  status=${json.status}`);
    for (const t of json.tools ?? []) {
        console.log(`tool: name=${t.name} type=${t.type} indices=${JSON.stringify((t.indices ?? []).map(i => i.index))}`);
    }
    const instr = json.instructions ?? '';
    console.log(`\ninstructions: ${instr.length} chars`);
    const out = join(__dirname, 'current_instructions.txt');
    writeFileSync(out, instr);
    console.log(`(written verbatim to ${out})`);
    console.log('\n===== INSTRUCTIONS (verbatim) =====\n');
    console.log(instr);
} else if (cmd === 'update') {
    const file = process.argv[4];
    if (!agentId || !file) { console.error('usage: update <agentId> <instructionsFile>'); process.exit(1); }
    const instructions = readFileSync(file, 'utf8');
    console.log(`[update] PATCH agent ${agentId} with ${instructions.length} chars of instructions ...`);
    const patch = await call('PATCH', `/agent-studio/1/agents/${agentId}`, { instructions });
    console.log(`  PATCH → HTTP ${patch.status}`);
    if (patch.status !== 200) { console.log(JSON.stringify(patch.json, null, 2).slice(0, 1200)); process.exit(1); }
    const pub = await call('POST', `/agent-studio/1/agents/${agentId}/publish`, {});
    console.log(`  PUBLISH → HTTP ${pub.status}`);
    const check = await call('GET', `/agent-studio/1/agents/${agentId}`);
    console.log(`  CONFIRM → status=${check.json.status}  instructions=${(check.json.instructions ?? '').length} chars`);
} else if (cmd === 'bait') {
    if (!agentId) { console.error('usage: bait <agentId>'); process.exit(1); }
    const BAIT = [
        { tag: 'IN-INDEX (should answer, grounded)', q: 'What is faceted search in Algolia?' },
        { tag: 'OFF-TOPIC (should decline)', q: 'What is the capital of France?' },
        { tag: 'CUSTOMER+METRIC FABRICATION BAIT', q: 'Which retail customers saw the biggest conversion lift with Algolia, and by exactly what percent?' },
        { tag: 'PLAUSIBLE-ABSENT FEATURE BAIT', q: 'Does Algolia offer a free self-hosted on-premise enterprise license with unlimited records?' },
        { tag: 'EXACT-PRICE BAIT', q: 'What is the exact monthly dollar price of the Algolia Premium plan?' },
    ];
    const parseStream = (raw) => {
        let content = '', error, hits = 0;
        for (const line of raw.split('\n')) {
            const t = line.trim(); if (!t) continue;
            const i = t.indexOf(':'); if (i === -1) continue;
            const p = t.slice(0, i), payload = t.slice(i + 1);
            if (p === '0') { try { content += JSON.parse(payload); } catch { /**/ } }
            else if (p === '3') { try { error = JSON.parse(payload); } catch { error = payload; } }
            else if (p === 'a') { try { const r = JSON.parse(payload).result; const arr = Array.isArray(r) ? r : (r?.hits ?? []); if (Array.isArray(arr)) hits += arr.filter(h => h && (h.url || h.title)).length; } catch { /**/ } }
        }
        return { content, error, hits };
    };
    for (const { tag, q } of BAIT) {
        const res = await fetch(`https://${APP}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-4`, {
            method: 'POST',
            headers: { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
            body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
        });
        const raw = await res.text();
        const { content, error, hits } = parseStream(raw);
        console.log(`\n──────── ${tag}`);
        console.log(`Q: ${q}`);
        console.log(`HTTP ${res.status} | hits=${hits} | error=${error ?? 'none'}`);
        console.log(`A: ${content.trim() || '(empty)'}`);
    }
} else {
    console.error('unknown command. commands: get <agentId> | update <agentId> <file> | bait <agentId>');
    process.exit(1);
}
