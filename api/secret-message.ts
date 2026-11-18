const DEFAULT_RECIPIENT = 'abdullohabduhakimov18@gmail.com';
const DEFAULT_FROM = 'For Hamidabonu <onboarding@resend.dev>';
const MAX_MESSAGE_LENGTH = 2000;

interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  on?: (event: string, listener: (chunk: Uint8Array | string) => void) => void;
}

interface ApiResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  end?: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildEmailHtml(message: string): string {
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background-color:#05060c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f1f5f9;">
    <div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,255,255,0.12);border-radius:16px;background-color:#0b0e1c;padding:28px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#fda4af;">For Hamidabonu</p>
      <h1 style="margin:0 0 20px;font-size:24px;font-weight:500;color:#ffffff;">Secret message</h1>
      <div style="border-radius:12px;background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:18px;font-size:15px;line-height:1.65;color:#e2e8f0;white-space:pre-wrap;">${safeMessage}</div>
    </div>
  </body>
</html>`;
}

async function readJsonBody(req: ApiRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !(req.body instanceof Uint8Array)) {
    return req.body as Record<string, unknown>;
  }

  if (typeof req.body === 'string') {
    return (JSON.parse(req.body) as Record<string, unknown>) || {};
  }

  if (req.body instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(req.body);
    return decoded.trim() ? ((JSON.parse(decoded) as Record<string, unknown>) || {}) : {};
  }

  if (!req.on) {
    return {};
  }

  const decoder = new TextDecoder();
  const raw = await new Promise<string>((resolve, reject) => {
    let text = '';
    req.on?.('data', (chunk) => {
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    });
    req.on?.('end', () => {
      text += decoder.decode();
      resolve(text);
    });
    req.on?.('error', (err) => reject(err));
  });

  if (!raw.trim()) {
    return {};
  }

  return (JSON.parse(raw) as Record<string, unknown>) || {};
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end?.();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      provider: 'resend',
      configured: Boolean(process.env.RESEND_API_KEY?.trim()),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid request body.' });
    return;
  }

  const rawMessage = typeof body.message === 'string' ? body.message : '';
  const trimmedMessage = rawMessage.trim();

  if (!trimmedMessage) {
    res.status(400).json({ ok: false, error: 'Please write a message before sending.' });
    return;
  }

  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({
      ok: false,
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    res.status(503).json({
      ok: false,
      code: 'MISSING_RESEND_KEY',
      error: 'RESEND_API_KEY is not configured on the server.',
    });
    return;
  }

  const recipient =
    process.env.SECRET_MESSAGE_RECIPIENT_EMAIL?.trim() || DEFAULT_RECIPIENT;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: 'Secret message',
        text: `From: Hamidabonu\n\n${trimmedMessage}`,
        html: buildEmailHtml(trimmedMessage),
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: { message?: string } }
      | null;

    if (!response.ok) {
      const errorMessage =
        payload?.message ||
        payload?.error?.message ||
        `Resend request failed (${response.status}).`;
      const status =
        response.status >= 400 && response.status < 500 ? response.status : 502;
      res.status(status).json({ ok: false, error: errorMessage });
      return;
    }

    res.status(200).json({ ok: true, provider: 'resend', id: payload?.id });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    res.status(isTimeout ? 504 : 500).json({
      ok: false,
      error: isTimeout
        ? 'Email service timed out. Please try again.'
        : 'Could not send right now. Please try again in a moment.',
    });
  } finally {
    clearTimeout(timer);
  }
}
