// ============================================================
// SurplusFlow AI — Outreach Email Templates
// ============================================================

interface OutreachMerge {
  claimantFirstName: string;
  claimantLastName: string;
  claimantFullName: string;
  reportedAmount: string;
  propertyDescription: string | null;
  holderName: string | null;
  jurisdictionState: string;
  jurisdictionCounty: string | null;
  caseNumber: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  optOutUrl: string;
  optOutPhone: string;
  feePercent: string;
  todayDate: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function e(val: unknown): string {
  return escapeHtml(String(val ?? ''));
}

export function getEmailSubject(touchNumber: number, merge: OutreachMerge): string {
  switch (touchNumber) {
    case 1:
      return `${merge.claimantFirstName}, you may have unclaimed surplus funds in ${merge.jurisdictionState}`;
    case 2:
      return `Follow-up: Unclaimed funds of ${merge.reportedAmount} — ${merge.caseNumber}`;
    case 3:
      return `Final notice: Unclaimed surplus funds — Case ${merge.caseNumber}`;
    default:
      return `Regarding your unclaimed surplus funds — ${merge.caseNumber}`;
  }
}

export function getEmailHtml(touchNumber: number, merge: OutreachMerge): string {
  switch (touchNumber) {
    case 1:
      return touch1Html(merge);
    case 2:
      return touch2Html(merge);
    case 3:
      return touch3Html(merge);
    default:
      return touch1Html(merge);
  }
}

export function getEmailText(touchNumber: number, merge: OutreachMerge): string {
  switch (touchNumber) {
    case 1:
      return touch1Text(merge);
    case 2:
      return touch2Text(merge);
    case 3:
      return touch3Text(merge);
    default:
      return touch1Text(merge);
  }
}

// --- Touch 1: Initial outreach ---

function touch1Html(m: OutreachMerge): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:20px">
    <h2 style="color:#2563eb;margin:0">${e(m.companyName)}</h2>
    <p style="color:#666;margin:5px 0 0;font-size:14px">Surplus Recovery Services</p>
  </div>

  <p>Dear ${e(m.claimantFirstName)} ${e(m.claimantLastName)},</p>

  <p>Our records indicate that you may be entitled to unclaimed surplus funds
  in <strong>${e(m.jurisdictionState)}${m.jurisdictionCounty ? `, ${e(m.jurisdictionCounty)} County` : ''}</strong>.</p>

  <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:15px;margin:20px 0;border-radius:4px">
    <p style="margin:0"><strong>Estimated Amount:</strong> ${e(m.reportedAmount)}</p>
    ${m.propertyDescription ? `<p style="margin:5px 0 0"><strong>Property:</strong> ${e(m.propertyDescription)}</p>` : ''}
    ${m.holderName ? `<p style="margin:5px 0 0"><strong>Holder:</strong> ${e(m.holderName)}</p>` : ''}
    <p style="margin:5px 0 0"><strong>Case Reference:</strong> ${e(m.caseNumber)}</p>
  </div>

  <p>${e(m.companyName)} specializes in recovering surplus funds on behalf of rightful
  owners. Our service fee is <strong>${e(m.feePercent)}%</strong> of the recovered amount — you pay
  nothing unless we successfully recover your funds.</p>

  <p>To learn more or begin the recovery process, please contact us:</p>

  <div style="background:#f9fafb;padding:15px;border-radius:4px;margin:15px 0">
    <p style="margin:0">📞 <strong>${e(m.companyPhone)}</strong></p>
    <p style="margin:5px 0">✉️ <strong>${e(m.companyEmail)}</strong></p>
    ${m.companyWebsite ? `<p style="margin:5px 0">🌐 <strong>${e(m.companyWebsite)}</strong></p>` : ''}
  </div>

  <p>Sincerely,<br><strong>${e(m.companyName)}</strong></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0 15px">
  <p style="font-size:12px;color:#999">
    This communication is from ${e(m.companyName)}. If you do not wish to receive
    further communications, please call ${e(m.optOutPhone)} or visit
    ${e(m.optOutUrl)} to opt out. Case ref: ${e(m.caseNumber)}.
  </p>
</body>
</html>`;
}

function touch1Text(m: OutreachMerge): string {
  return `Dear ${m.claimantFirstName} ${m.claimantLastName},

Our records indicate that you may be entitled to unclaimed surplus funds in ${m.jurisdictionState}${m.jurisdictionCounty ? `, ${m.jurisdictionCounty} County` : ''}.

Estimated Amount: ${m.reportedAmount}
${m.propertyDescription ? `Property: ${m.propertyDescription}\n` : ''}${m.holderName ? `Holder: ${m.holderName}\n` : ''}Case Reference: ${m.caseNumber}

${m.companyName} specializes in recovering surplus funds on behalf of rightful owners. Our service fee is ${m.feePercent}% of the recovered amount — you pay nothing unless we successfully recover your funds.

To learn more or begin the recovery process, contact us:
Phone: ${m.companyPhone}
Email: ${m.companyEmail}
${m.companyWebsite ? `Website: ${m.companyWebsite}\n` : ''}
Sincerely,
${m.companyName}

---
To opt out: call ${m.optOutPhone} or visit ${m.optOutUrl}
Case ref: ${m.caseNumber}`;
}

// --- Touch 2: Follow-up ---

function touch2Html(m: OutreachMerge): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:20px">
    <h2 style="color:#2563eb;margin:0">${e(m.companyName)}</h2>
  </div>

  <p>Dear ${e(m.claimantFirstName)},</p>

  <p>We recently contacted you regarding unclaimed surplus funds of approximately
  <strong>${e(m.reportedAmount)}</strong> that may belong to you in ${e(m.jurisdictionState)}.</p>

  <p>We understand you may be busy, so we wanted to follow up. These funds
  have a limited recovery window, and we want to ensure you don't miss out
  on what may be rightfully yours.</p>

  <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:20px 0;border-radius:4px">
    <p style="margin:0"><strong>Case Reference:</strong> ${e(m.caseNumber)}</p>
    <p style="margin:5px 0 0"><strong>Estimated Amount:</strong> ${e(m.reportedAmount)}</p>
    <p style="margin:5px 0 0">No upfront costs — our ${e(m.feePercent)}% fee is only collected upon successful recovery.</p>
  </div>

  <p>Please reach out at your convenience:</p>
  <p>📞 ${e(m.companyPhone)} | ✉️ ${e(m.companyEmail)}</p>

  <p>Best regards,<br><strong>${e(m.companyName)}</strong></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0 15px">
  <p style="font-size:12px;color:#999">
    To opt out: ${e(m.optOutPhone)} or ${e(m.optOutUrl)}. Ref: ${e(m.caseNumber)}.
  </p>
</body>
</html>`;
}

function touch2Text(m: OutreachMerge): string {
  return `Dear ${m.claimantFirstName},

We recently contacted you regarding unclaimed surplus funds of approximately ${m.reportedAmount} that may belong to you in ${m.jurisdictionState}.

These funds have a limited recovery window and we want to ensure you don't miss out.

Case Reference: ${m.caseNumber}
Estimated Amount: ${m.reportedAmount}
No upfront costs — our ${m.feePercent}% fee is only collected upon successful recovery.

Contact us: ${m.companyPhone} or ${m.companyEmail}

Best regards,
${m.companyName}

---
To opt out: ${m.optOutPhone} or ${m.optOutUrl}. Ref: ${m.caseNumber}`;
}

// --- Touch 3: Final notice ---

function touch3Html(m: OutreachMerge): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:20px">
    <h2 style="color:#2563eb;margin:0">${e(m.companyName)}</h2>
  </div>

  <p>Dear ${e(m.claimantFirstName)},</p>

  <p>This is our final communication regarding unclaimed surplus funds of
  approximately <strong>${e(m.reportedAmount)}</strong> in ${e(m.jurisdictionState)}
  (Case ${e(m.caseNumber)}).</p>

  <p>If we do not hear from you, we will close this case and will not contact
  you again regarding this matter.</p>

  <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:15px;margin:20px 0;border-radius:4px">
    <p style="margin:0"><strong>This is your final notice.</strong></p>
    <p style="margin:5px 0 0">After this, the case will be closed and recovery may no longer be available through our services.</p>
  </div>

  <p>If you'd like to proceed, contact us:<br>
  📞 ${e(m.companyPhone)} | ✉️ ${e(m.companyEmail)}</p>

  <p>Respectfully,<br><strong>${e(m.companyName)}</strong></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0 15px">
  <p style="font-size:12px;color:#999">
    This was our final communication. Ref: ${e(m.caseNumber)}.
  </p>
</body>
</html>`;
}

function touch3Text(m: OutreachMerge): string {
  return `Dear ${m.claimantFirstName},

This is our final communication regarding unclaimed surplus funds of approximately ${m.reportedAmount} in ${m.jurisdictionState} (Case ${m.caseNumber}).

If we do not hear from you, we will close this case and will not contact you again regarding this matter.

If you'd like to proceed, contact us:
Phone: ${m.companyPhone}
Email: ${m.companyEmail}

Respectfully,
${m.companyName}

---
This was our final communication. Ref: ${m.caseNumber}`;
}
