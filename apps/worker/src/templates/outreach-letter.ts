// ============================================================
// SurplusFlow AI — Outreach Letter Templates (Print via Lob)
// Lob requires HTML formatted for 8.5x11 print layout.
// ============================================================

interface LetterMerge {
  claimantFirstName: string;
  claimantLastName: string;
  claimantFullName: string;
  claimantAddress: string;
  claimantCity: string | null;
  claimantState: string | null;
  claimantZip: string | null;
  reportedAmount: string;
  propertyDescription: string | null;
  holderName: string | null;
  jurisdictionState: string;
  jurisdictionCounty: string | null;
  caseNumber: string;
  companyName: string;
  companyAddress: string;
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

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function getLetterHtml(touchNumber: number, merge: LetterMerge): string {
  switch (touchNumber) {
    case 1:
      return touch1Letter(merge);
    case 2:
      return touch2Letter(merge);
    case 3:
      return touch3Letter(merge);
    default:
      return touch1Letter(merge);
  }
}

function letterShell(body: string, merge: LetterMerge): string {
  return `<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 1in; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
  }
  .header {
    border-bottom: 2px solid #2563eb;
    padding-bottom: 12pt;
    margin-bottom: 24pt;
  }
  .company-name {
    font-size: 18pt;
    font-weight: bold;
    color: #2563eb;
    margin: 0;
  }
  .company-info {
    font-size: 9pt;
    color: #666;
    margin-top: 4pt;
  }
  .date {
    margin-bottom: 18pt;
    font-size: 11pt;
  }
  .recipient {
    margin-bottom: 18pt;
    font-size: 11pt;
  }
  .body p {
    margin: 0 0 12pt 0;
    text-align: justify;
  }
  .highlight-box {
    border: 1pt solid #2563eb;
    background: #f0f7ff;
    padding: 12pt;
    margin: 18pt 0;
  }
  .highlight-box p { margin: 0 0 4pt 0; text-align: left; }
  .warning-box {
    border: 1pt solid #ef4444;
    background: #fef2f2;
    padding: 12pt;
    margin: 18pt 0;
  }
  .warning-box p { margin: 0 0 4pt 0; text-align: left; }
  .signature { margin-top: 24pt; }
  .footer {
    margin-top: 36pt;
    padding-top: 12pt;
    border-top: 1pt solid #ccc;
    font-size: 8pt;
    color: #999;
  }
</style>
</head>
<body>
  <div class="header">
    <p class="company-name">${e(merge.companyName)}</p>
    <p class="company-info">${e(merge.companyAddress)} | ${e(merge.companyPhone)} | ${e(merge.companyEmail)}</p>
  </div>
  <div class="date">${formatDate(merge.todayDate)}</div>
  <div class="recipient">
    ${e(merge.claimantFullName)}<br>
    ${merge.claimantAddress ? `${e(merge.claimantAddress)}<br>` : ''}${merge.claimantCity ? `${e(merge.claimantCity)}, ` : ''}${e(merge.claimantState ?? '')} ${e(merge.claimantZip ?? '')}
  </div>
  <div class="body">
    ${body}
  </div>
  <div class="footer">
    If you do not wish to receive further communications, call ${e(merge.optOutPhone)} or visit ${e(merge.optOutUrl)}.
    Case Reference: ${e(merge.caseNumber)}.
  </div>
</body>
</html>`;
}

function touch1Letter(m: LetterMerge): string {
  const body = `
    <p>Dear ${e(m.claimantFirstName)} ${e(m.claimantLastName)},</p>
    <p>Our research indicates that you may be entitled to unclaimed surplus funds
    in <strong>${e(m.jurisdictionState)}${m.jurisdictionCounty ? `, ${e(m.jurisdictionCounty)} County` : ''}</strong>.
    We are writing to inform you of this potential recovery opportunity.</p>
    <div class="highlight-box">
      <p><strong>Estimated Amount:</strong> ${e(m.reportedAmount)}</p>
      ${m.propertyDescription ? `<p><strong>Property:</strong> ${e(m.propertyDescription)}</p>` : ''}
      ${m.holderName ? `<p><strong>Holder:</strong> ${e(m.holderName)}</p>` : ''}
      <p><strong>Case Reference:</strong> ${e(m.caseNumber)}</p>
    </div>
    <p>${e(m.companyName)} specializes in recovering surplus funds on behalf of rightful
    owners. Our service fee is ${e(m.feePercent)}% of the recovered amount &mdash; you pay
    nothing unless we successfully recover your funds.</p>
    <p>To learn more or begin the recovery process, please contact us at
    ${e(m.companyPhone)} or ${e(m.companyEmail)}.</p>
    <div class="signature">
      <p>Sincerely,</p>
      <p><strong>${e(m.companyName)}</strong></p>
    </div>`;
  return letterShell(body, m);
}

function touch2Letter(m: LetterMerge): string {
  const body = `
    <p>Dear ${e(m.claimantFirstName)},</p>
    <p>We recently contacted you regarding unclaimed surplus funds of approximately
    <strong>${e(m.reportedAmount)}</strong> that may belong to you in ${e(m.jurisdictionState)}.</p>
    <p>We understand you may be busy, so we wanted to follow up. These funds
    have a limited recovery window, and we want to ensure you do not miss out
    on what may be rightfully yours.</p>
    <div class="highlight-box">
      <p><strong>Case Reference:</strong> ${e(m.caseNumber)}</p>
      <p><strong>Estimated Amount:</strong> ${e(m.reportedAmount)}</p>
      <p>No upfront costs &mdash; our ${e(m.feePercent)}% fee is only collected upon successful recovery.</p>
    </div>
    <p>Please reach out at your convenience by calling ${e(m.companyPhone)}
    or emailing ${e(m.companyEmail)}.</p>
    <div class="signature">
      <p>Best regards,</p>
      <p><strong>${e(m.companyName)}</strong></p>
    </div>`;
  return letterShell(body, m);
}

function touch3Letter(m: LetterMerge): string {
  const body = `
    <p>Dear ${e(m.claimantFirstName)},</p>
    <p>This is our final communication regarding unclaimed surplus funds of
    approximately <strong>${e(m.reportedAmount)}</strong> in ${e(m.jurisdictionState)}
    (Case ${e(m.caseNumber)}).</p>
    <p>If we do not hear from you, we will close this case and will not contact
    you again regarding this matter.</p>
    <div class="warning-box">
      <p><strong>This is your final notice.</strong></p>
      <p>After this, the case will be closed and recovery may no longer be
      available through our services.</p>
    </div>
    <p>If you would like to proceed, please contact us at ${e(m.companyPhone)}
    or ${e(m.companyEmail)}.</p>
    <div class="signature">
      <p>Respectfully,</p>
      <p><strong>${e(m.companyName)}</strong></p>
    </div>`;
  return letterShell(body, m);
}
