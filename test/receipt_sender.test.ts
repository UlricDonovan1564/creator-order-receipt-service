import assert from "node:assert/strict";
import test from "node:test";
import { buildCreatorReceipt } from "../src/receipt_sender.js";

test("a processing asset defers the link while preserving subscriber state", () => {
  const receipt = buildCreatorReceipt({
    orderId: "ORDER-9",
    buyerEmail: "reader@example.com",
    creatorName: "Vector Field",
    assetTitle: "RAG Field Guide",
    amountCents: 1900,
    contentState: "processing",
    subscriberUpdate: "unchanged",
  });

  assert.match(receipt.html, /is being processed/);
  assert.match(receipt.html, /existing update preference is unchanged/);
  assert.doesNotMatch(receipt.html, /href=/);
});
