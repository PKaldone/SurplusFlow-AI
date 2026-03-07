// ============================================================
// SurplusFlow AI — Physical Mail Sender (Lob)
// ============================================================

const LOB_API_KEY = process.env.LOB_API_KEY || '';
const LOB_BASE = 'https://api.lob.com/v1';
const COMPANY_ADDRESS = {
  name: process.env.COMPANY_NAME || 'SurplusFlow Recovery Services',
  address_line1: process.env.COMPANY_ADDRESS_LINE1 || '123 Main Street',
  address_city: process.env.COMPANY_ADDRESS_CITY || 'Miami',
  address_state: process.env.COMPANY_ADDRESS_STATE || 'FL',
  address_zip: process.env.COMPANY_ADDRESS_ZIP || '33101',
};

export interface SendLetterParams {
  to: {
    name: string;
    address_line1: string;
    address_line2?: string;
    address_city: string;
    address_state: string;
    address_zip: string;
  };
  html: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface SendLetterResult {
  id: string;
  success: boolean;
  error?: string;
  expectedDelivery?: string;
}

export async function sendLetter(params: SendLetterParams): Promise<SendLetterResult> {
  if (!LOB_API_KEY) {
    throw new Error('LOB_API_KEY is not configured');
  }

  const body = {
    description: params.description ?? 'SurplusFlow Outreach Letter',
    to: params.to,
    from: COMPANY_ADDRESS,
    file: params.html,
    color: false,
    metadata: params.metadata ?? {},
  };

  const resp = await fetch(`${LOB_BASE}/letters`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${LOB_API_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json() as Record<string, unknown>;

  if (!resp.ok) {
    const errObj = data.error as Record<string, unknown> | undefined;
    return { id: '', success: false, error: errObj?.message as string ?? `HTTP ${resp.status}` };
  }

  return {
    id: data.id as string,
    success: true,
    expectedDelivery: data.expected_delivery_date as string | undefined,
  };
}

export function isMailConfigured(): boolean {
  return !!LOB_API_KEY;
}
