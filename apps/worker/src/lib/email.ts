// ============================================================
// SurplusFlow AI — Email Sender (Resend)
// ============================================================

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'SurplusFlow <claims@surplusflow.com>';

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  id: string;
  success: boolean;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getClient();

  const { data, error } = await client.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
    tags: params.tags,
  });

  if (error) {
    return { id: '', success: false, error: error.message };
  }

  return { id: data?.id ?? '', success: true };
}

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}
