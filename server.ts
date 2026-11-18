import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolvePort();
const DEFAULT_RECIPIENT = 'abdullohabduhakimov18@gmail.com';
const DEFAULT_FROM = 'For Hamidabonu <onboarding@resend.dev>';
const MAX_MESSAGE_LENGTH = 2000;

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

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  message: string,
): Promise<{ ok: true; id?: string } | { ok: false; status: number; error: string }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Secret message',
      text: `From: Hamidabonu\n\n${message}`,
      html: buildEmailHtml(message),
    }),
    signal: AbortSignal.timeout(8000),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const errorMessage =
      payload?.message ||
      payload?.error?.message ||
      `Resend request failed (${response.status})`;
    return {
      ok: false,
      status: response.status >= 400 && response.status < 500 ? response.status : 502,
      error: errorMessage,
    };
  }

  return { ok: true, id: payload?.id };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/secret-message', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      provider: 'resend',
      configured: Boolean(process.env.RESEND_API_KEY?.trim()),
    });
  });

  app.post('/api/secret-message', async (req: Request, res: Response) => {
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message : '';
    const trimmedMessage = rawMessage.trim();

    if (!trimmedMessage) {
      res.status(400).json({ error: 'Please write a message before sending.' });
      return;
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
      return;
    }

    const recipient =
      process.env.SECRET_MESSAGE_RECIPIENT_EMAIL?.trim() || DEFAULT_RECIPIENT;
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;

    if (!resendApiKey) {
      res.status(503).json({
        ok: false,
        code: 'MISSING_RESEND_KEY',
        error: 'RESEND_API_KEY is not configured on the server.',
      });
      return;
    }

    try {
      const result = await sendViaResend(
        resendApiKey,
        fromEmail,
        recipient,
        trimmedMessage,
      );

      if (!result.ok) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }

      res.status(200).json({ ok: true, provider: 'resend', id: result.id });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');

      res.status(isTimeout ? 504 : 500).json({
        ok: false,
        error: isTimeout
          ? 'Email service timed out. Please try again.'
          : 'Could not send right now. Please try again in a moment.',
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
