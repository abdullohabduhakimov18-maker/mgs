import { useState, type FormEvent } from 'react';
import { Check, Send } from 'lucide-react';

const RECIPIENT_EMAIL = 'abdullohabduhakimov18@gmail.com';
const FORMSUBMIT_AJAX_ENDPOINT = `https://formsubmit.co/ajax/${RECIPIENT_EMAIL}`;

type SubmitState = 'idle' | 'sending' | 'sent' | 'activation' | 'error';

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export function NoteFormSection() {
  const [message, setMessage] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [feedbackNote, setFeedbackNote] = useState('');

  const trimmedMessage = message.trim();

  const tryFormSubmitFallback = async (text: string) => {
    try {
      const fallbackRes = await fetchWithTimeout(
        FORMSUBMIT_AJAX_ENDPOINT,
        {
          method: 'POST',
          referrerPolicy: 'origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: 'Hamidabonu',
            message: text,
            _subject: 'Secret message',
            _template: 'table',
            _captcha: 'false',
          }),
        },
        15000,
      );

      const fallbackData = (await fallbackRes.json().catch(() => null)) as
        | { success?: boolean | string; message?: string }
        | null;

      if (
        fallbackRes.ok &&
        (fallbackData?.success === true || fallbackData?.success === 'true')
      ) {
        setSubmitState('sent');
        setFeedbackNote('Your secret message has been sent.');
        setMessage('');
        return;
      }

      const apiMsg =
        typeof fallbackData?.message === 'string' ? fallbackData.message : '';
      if (
        apiMsg.toLowerCase().includes('activat') ||
        apiMsg.toLowerCase().includes('confirm')
      ) {
        setSubmitState('activation');
        setFeedbackNote(
          `One-time activation needed for this deployed URL: please click the confirmation link just sent to ${RECIPIENT_EMAIL} (check Spam too), then press Send again.`,
        );
        return;
      }

      setSubmitState('error');
      setFeedbackNote(
        apiMsg ||
          'Could not send right now. Please try again in a moment.',
      );
    } catch {
      setSubmitState('error');
      setFeedbackNote('Could not send right now. Please try again in a moment.');
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!trimmedMessage || submitState === 'sending') return;

    setSubmitState('sending');
    setFeedbackNote('');

    try {
      const response = await fetchWithTimeout(
        '/api/secret-message',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: trimmedMessage,
          }),
        },
        9000,
      );

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; code?: string; error?: string; needsActivation?: boolean }
        | null;

      if (response.ok && data?.ok) {
        setSubmitState('sent');
        setFeedbackNote('Your secret message has been sent.');
        setMessage('');
        return;
      }

      if (
        response.status === 404 ||
        response.status === 405 ||
        data?.code === 'MISSING_RESEND_KEY' ||
        (response.ok && !data)
      ) {
        await tryFormSubmitFallback(trimmedMessage);
        return;
      }

      if (data?.needsActivation) {
        setSubmitState('activation');
        setFeedbackNote(
          'One-time activation needed: please click the confirmation link just sent to your inbox, then press Send again.',
        );
        return;
      }

      setSubmitState('error');
      setFeedbackNote(
        data?.error || 'Could not send right now. Please try again in a moment.',
      );
    } catch {
      await tryFormSubmitFallback(trimmedMessage);
    }
  };

  const handleReset = () => {
    setSubmitState('idle');
    setFeedbackNote('');
  };

  return (
    <section
      id="secret-message"
      aria-label="Secret message"
      className="relative z-20 flex min-h-[75svh] w-full items-center justify-center px-6 py-24"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0e1c]/70 p-6 shadow-2xl backdrop-blur-md sm:p-9">
        <header className="mb-6 space-y-1.5">
          <h2 className="font-editorial text-3xl font-normal tracking-wide text-slate-100 sm:text-4xl">
            Secret message
          </h2>
          <p className="text-sm text-slate-400">
            Your message will go to him.
          </p>
        </header>

        {submitState === 'sent' ? (
          <div className="space-y-6 py-2">
            <div className="flex items-start gap-3.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <p className="leading-relaxed">{feedbackNote}</p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-slate-200 transition-colors duration-200 hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              Write another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <textarea
              name="message"
              aria-label="Secret message"
              required
              rows={4}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your secret message..."
              className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 transition-colors focus:border-rose-400/60 focus:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
            />

            {(submitState === 'error' || submitState === 'activation') && feedbackNote && (
              <p
                role="status"
                className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100"
              >
                {feedbackNote}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!trimmedMessage || submitState === 'sending'}
                className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border border-rose-400/40 bg-rose-500/20 px-6 py-2.5 text-sm font-medium tracking-wide text-rose-50 transition-all duration-200 hover:border-rose-300/65 hover:bg-rose-500/30 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
                <span>{submitState === 'sending' ? 'Sending...' : 'Send'}</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </section>
  );
}
