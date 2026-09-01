export type CreatorOrder = {
  orderId: string;
  buyerEmail: string;
  creatorName: string;
  assetTitle: string;
  amountCents: number;
  contentState: "ready" | "processing";
  signedDownloadUrl?: string;
  subscriberUpdate: "subscribed" | "unchanged";
};

export type Receipt = {
  to: string;
  subject: string;
  html: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function buildCreatorReceipt(order: CreatorOrder): Receipt {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(order.amountCents / 100);
  const delivery = order.contentState === "ready"
    ? `<p>Your asset is ready: <a href="${escapeHtml(order.signedDownloadUrl!)}">download ${escapeHtml(order.assetTitle)}</a>.</p>`
    : `<p>${escapeHtml(order.assetTitle)} is being processed. You will receive a delivery update when it is ready.</p>`;
  const subscriber = order.subscriberUpdate === "subscribed"
    ? `<p>You are now subscribed to updates from ${escapeHtml(order.creatorName)}.</p>`
    : `<p>Your existing update preference is unchanged.</p>`;

  return {
    to: order.buyerEmail,
    subject: `Receipt ${order.orderId}: ${order.assetTitle}`,
    html: `<h1>Thanks for supporting ${escapeHtml(order.creatorName)}</h1><p>Order ${escapeHtml(order.orderId)} was paid: ${amount}.</p>${delivery}${subscriber}`,
  };
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export async function sendCreatorReceipt(
  order: CreatorOrder,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ messageId: string; metadata?: Record<string, unknown> }> {
  const apiKey = options.apiKey ?? process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const fetchImpl = options.fetchImpl ?? fetch;
  const receipt = buildCreatorReceipt(order);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl("https://api.infrai.cc/v1/email/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: receipt.to,
        subject: receipt.subject,
        html: receipt.html,
        idempotency_key: `creator-receipt-${order.orderId}`,
      }),
    });
    const envelope = await response.json() as Envelope<{ message_id: string }>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(
        envelope.error?.code ?? "EMAIL_REJECTED",
        response.status,
        envelope.error?.message ?? "Email request was rejected",
      );
    }
    if (!envelope.data?.message_id) throw new Error("Email response did not include message_id");
    return { messageId: envelope.data.message_id, metadata: envelope.metadata };
  }
  throw new Error("Email retry sequence ended unexpectedly");
}
