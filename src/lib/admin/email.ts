import { OTP_TTL_MINUTES } from './auth';

export interface MailConfig {
	apiKey: string;
	from: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Reads the Resend configuration from the Worker secrets, or returns null when
 * it is absent — `wrangler dev` has no secrets unless a `.dev.vars` is present,
 * and a missing key should surface as "email is not configured" rather than as
 * a failed HTTP call to Resend.
 */
export function mailConfig(env: App.Platform['env'] | undefined): MailConfig | null {
	const apiKey = env?.RESEND_API_KEY;
	const from = env?.RESEND_FROM;
	return apiKey && from ? { apiKey, from } : null;
}

/**
 * Returns whether Resend accepted the message. The caller deliberately does not
 * surface that result to the browser: /admin answers identically whether or not
 * the address was on the allowlist, so leaking "the mail went out" would undo
 * that. Nothing here logs `code` — it would end up in `wrangler tail`.
 */
export async function sendOtpEmail(cfg: MailConfig, to: string, code: string): Promise<boolean> {
	const res = await fetch(RESEND_ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: cfg.from,
			to: [to],
			subject: `${code} is your cook-up admin code`,
			text: otpText(code),
			html: otpHtml(code)
		})
	}).catch(() => null);

	if (!res?.ok) {
		console.error(`resend: OTP send failed with status ${res?.status ?? 'network error'}`);
		return false;
	}
	return true;
}

const otpText = (code: string) =>
	`${code}\n\nThis cook-up admin code expires in ${OTP_TTL_MINUTES} minutes and can be used once.\nIf you did not ask for it, ignore this message — it grants no access on its own.\n`;

const otpHtml = (code: string) => `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px;background:#f6f5f2;font-family:ui-sans-serif,system-ui,sans-serif;color:#1c1917">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">
    <p style="margin:0 0 20px;font-size:15px;color:#57534e">Your cook-up admin code</p>
    <p style="margin:0 0 20px;font-size:36px;font-weight:700;letter-spacing:.22em;font-variant-numeric:tabular-nums">${code}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c">
      Expires in ${OTP_TTL_MINUTES} minutes, single use. If you did not request it, ignore this message &mdash; it grants no access on its own.
    </p>
  </div>
</body></html>`;
