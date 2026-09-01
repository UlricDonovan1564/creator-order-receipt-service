import { sendCreatorReceipt } from "../src/receipt_sender.js";

const buyerEmail = process.env.DEMO_EMAIL_TO;
if (!buyerEmail) throw new Error("DEMO_EMAIL_TO is required");

const result = await sendCreatorReceipt({
  orderId: "ORDER-1042",
  buyerEmail,
  creatorName: "Signal Studio",
  assetTitle: "Agent Evaluation Notes",
  amountCents: 2400,
  contentState: "ready",
  signedDownloadUrl: "https://downloads.example.com/signed/ORDER-1042",
  subscriberUpdate: "subscribed",
});

console.log(`Receipt accepted with message_id ${result.messageId}`);
