import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, sendCreatorReceipt, type CreatorOrder } from "./receipt_sender.js";

export const completedOrderSchema = z.object({
  orderId: z.string().min(1),
  buyerEmail: z.string().email(),
  creatorName: z.string().min(1),
  assetTitle: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  contentState: z.enum(["ready", "processing"]),
  signedDownloadUrl: z.string().url().optional(),
  subscriberUpdate: z.enum(["subscribed", "unchanged"]),
}).superRefine((order, context) => {
  if (order.contentState === "ready" && !order.signedDownloadUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["signedDownloadUrl"],
      message: "A ready asset requires a signed download URL",
    });
  }
});

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/orders/complete") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsedJson: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const parsed = completedOrderSchema.safeParse(parsedJson);
    if (!parsed.success) {
      json(response, 400, { error: "Invalid completed order", issues: parsed.error.issues });
      return;
    }
    const order = parsed.data as CreatorOrder;
    const result = await sendCreatorReceipt(order);
    json(response, 202, { orderId: parsed.data.orderId, messageId: result.messageId });
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(response, 400, { error: "Request body must be valid JSON" });
    } else if (error instanceof InfraiError) {
      json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.message,
        code: error.code,
      });
    } else {
      json(response, 500, { error: "Could not complete order receipt" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Creator order service listening on http://localhost:${port}`));
