import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { _getKnowledgeWithDeps } from "../../agents/solution.js";

function makeDeps(overrides = {}) {
  return {
    embedQueryFn: async () => new Float64Array([0.1, 0.2, 0.3]),
    retrieveVectorFn: async () => [],
    retrieveLocalFn: async () => [],
    hasSupabaseFn: () => false,
    hasEmbeddingFn: () => false,
    ...overrides
  };
}

describe("getKnowledge per-use-case retrieval", () => {
  it("Test 1: calls embedQuery once per use_case", async () => {
    let callCount = 0;
    const deps = makeDeps({
      hasSupabaseFn: () => true,
      hasEmbeddingFn: () => true,
      embedQueryFn: async () => { callCount++; return new Float64Array([0.1]); },
      retrieveVectorFn: async () => [{ id: "A", title: "T", content: "c", similarity: 0.8 }]
    });

    await _getKnowledgeWithDeps({ use_cases: ["HCI", "DR"] }, deps);

    assert.equal(callCount, 2, "embedQuery should be called exactly 2 times");
  });

  it("Test 2: deduplicates by chunk ID keeping highest similarity", async () => {
    let call = 0;
    const deps = makeDeps({
      hasSupabaseFn: () => true,
      hasEmbeddingFn: () => true,
      embedQueryFn: async () => new Float64Array([0.1]),
      retrieveVectorFn: async () => {
        call++;
        if (call === 1) {
          return [
            { id: "A", title: "Doc A", content: "c", similarity: 0.8 },
            { id: "B", title: "Doc B", content: "c", similarity: 0.7 }
          ];
        }
        return [
          { id: "A", title: "Doc A", content: "c", similarity: 0.9 },
          { id: "C", title: "Doc C", content: "c", similarity: 0.6 }
        ];
      }
    });

    const result = await _getKnowledgeWithDeps({ use_cases: ["HCI", "DR"] }, deps);

    const chunkA = result.chunks.find((c) => c.id === "A");
    assert.ok(chunkA, "Chunk A must be present");
    assert.equal(chunkA.similarity, 0.9, "Chunk A should have highest similarity 0.9");
    assert.ok(result.chunks.find((c) => c.id === "B"), "Chunk B must be present");
    assert.ok(result.chunks.find((c) => c.id === "C"), "Chunk C must be present");
  });

  it("Test 3: caps output at 5 chunks", async () => {
    const deps = makeDeps({
      hasSupabaseFn: () => true,
      hasEmbeddingFn: () => true,
      embedQueryFn: async () => new Float64Array([0.1]),
      retrieveVectorFn: async () => [
        { id: "1", title: "T1", content: "c", similarity: 0.9 },
        { id: "2", title: "T2", content: "c", similarity: 0.85 },
        { id: "3", title: "T3", content: "c", similarity: 0.8 },
        { id: "4", title: "T4", content: "c", similarity: 0.75 },
        { id: "5", title: "T5", content: "c", similarity: 0.7 },
        { id: "6", title: "T6", content: "c", similarity: 0.65 }
      ]
    });

    const result = await _getKnowledgeWithDeps({ use_cases: ["HCI", "DR", "Backup"] }, deps);

    assert.ok(result.chunks.length <= 5, `chunks length ${result.chunks.length} should be <= 5`);
  });

  it("Test 4: falls back to local on vector failure", async () => {
    const deps = makeDeps({
      hasSupabaseFn: () => true,
      hasEmbeddingFn: () => true,
      embedQueryFn: async () => { throw new Error("embedding API down"); },
      retrieveLocalFn: async () => [
        { source_key: "seed/doc1.md", title: "Local Doc", content: "c", score: 3 }
      ]
    });

    const result = await _getKnowledgeWithDeps({ use_cases: ["HCI"] }, deps);

    assert.equal(result.retrieval_mode, "local_fallback", "Should fall back to local_fallback");
  });

  it("Test 5: local fallback deduplicates by source_key", async () => {
    let localCall = 0;
    const deps = makeDeps({
      hasSupabaseFn: () => false,
      hasEmbeddingFn: () => false,
      retrieveLocalFn: async () => {
        localCall++;
        if (localCall === 1) {
          return [
            { source_key: "seed/doc1.md", title: "Doc 1", content: "c", score: 2 },
            { source_key: "seed/doc2.md", title: "Doc 2", content: "c", score: 1 }
          ];
        }
        return [
          { source_key: "seed/doc1.md", title: "Doc 1", content: "c", score: 5 },
          { source_key: "seed/doc3.md", title: "Doc 3", content: "c", score: 1 }
        ];
      }
    });

    const result = await _getKnowledgeWithDeps({ use_cases: ["HCI", "DR"] }, deps);

    assert.equal(result.retrieval_mode, "local_fallback");
    const doc1 = result.chunks.find((c) => c.source_key === "seed/doc1.md");
    assert.ok(doc1, "doc1 must be present");
    assert.equal(doc1.score, 5, "doc1 should have highest score 5");
    const uniqueKeys = new Set(result.chunks.map((c) => c.source_key));
    assert.equal(uniqueKeys.size, result.chunks.length, "No duplicate source_keys");
  });
});
