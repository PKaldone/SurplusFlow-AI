import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800 mb-8 inline-block">&larr; Back to home</Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: March 1, 2026</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">1. Information We Collect</h2>
            <p>SurplusFlow AI collects information necessary to provide surplus fund recovery services:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Personal Information:</strong> Name, email, phone number, mailing address</li>
              <li><strong>Sensitive Identifiers:</strong> Social Security numbers (last 4 digits stored, full SSN encrypted), date of birth</li>
              <li><strong>Financial Data:</strong> Claimed amounts, payout details, fee calculations</li>
              <li><strong>Property Data:</strong> Property descriptions, parcel numbers, sale records</li>
              <li><strong>Usage Data:</strong> Login timestamps, IP addresses, audit trail of actions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">2. How We Use Information</h2>
            <p>We use collected information to: (a) manage surplus recovery cases; (b) generate and send compliant outreach to claimants; (c) produce legal documents and filings; (d) calculate and process fees; (e) maintain compliance with state regulations; (f) audit and secure platform activity.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">3. Data Security</h2>
            <p>We employ industry-standard security measures including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>AES-256 encryption for sensitive data at rest</li>
              <li>TLS 1.3 for all data in transit</li>
              <li>Dedicated encryption keys for SSN data</li>
              <li>Role-based access control (RBAC) limiting data visibility</li>
              <li>Append-only audit logs tracking all data access</li>
              <li>Automated session expiration and token rotation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">4. Third-Party Sharing</h2>
            <p>We do not sell personal information. We may share data with: (a) assigned attorneys handling your case; (b) government agencies as required for filing claims; (c) service providers who assist in platform operations (hosting, email delivery) under strict data processing agreements; (d) as required by law or legal process.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">5. Data Retention</h2>
            <p>We retain case data for the duration of the recovery process plus seven (7) years for compliance and audit purposes. Sensitive identifiers (SSN) are purged after case closure unless retention is legally required. You may request deletion of your data subject to legal retention requirements.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">6. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to: (a) access your personal data; (b) correct inaccurate data; (c) request deletion of your data; (d) opt out of marketing communications; (e) receive a copy of your data in a portable format. To exercise these rights, contact us at <span className="font-medium">privacy@surplusflow.com</span>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">7. Contact</h2>
            <p>For privacy questions or concerns, contact our Data Protection team at <span className="font-medium">privacy@surplusflow.com</span>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
