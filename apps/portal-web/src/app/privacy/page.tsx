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
            <p>To process your surplus fund claim, we collect:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Identity Information:</strong> Your name, date of birth, and the last 4 digits of your Social Security number for verification</li>
              <li><strong>Contact Information:</strong> Email address, phone number, and mailing address</li>
              <li><strong>Documents:</strong> Government-issued ID, proof of address, and other documents you upload to support your claim</li>
              <li><strong>Claim Data:</strong> Property records, surplus amounts, and case status information</li>
              <li><strong>Technical Data:</strong> Your IP address and login activity for security purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">2. How We Use Your Information</h2>
            <p>Your information is used exclusively to: (a) verify your identity as the rightful claimant; (b) prepare and file your surplus recovery claim; (c) communicate with you about your case status; (d) generate required legal documents; (e) comply with state and federal regulations.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">3. How We Protect Your Data</h2>
            <p>Your privacy and security are our top priority:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>All sensitive data (SSN, financial info) is encrypted with dedicated encryption keys</li>
              <li>All connections use TLS encryption (the lock icon in your browser)</li>
              <li>Access to your data is strictly limited to authorized personnel working on your case</li>
              <li>Every access to your records is logged in a tamper-proof audit trail</li>
              <li>Login is via secure, time-limited magic links — no passwords to steal</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">4. Who Can See Your Data</h2>
            <p>Your data may be shared with: (a) the recovery firm managing your case; (b) an attorney assigned to your case, if applicable; (c) government agencies where your claim is filed (this is required to recover your funds); (d) our secure hosting and infrastructure providers, who process data on our behalf under strict agreements.</p>
            <p><strong>We never sell your personal information.</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">5. How Long We Keep Your Data</h2>
            <p>We keep your case data during the active claim process and for seven (7) years after case closure for legal and compliance purposes. Sensitive identification data (SSN) is deleted after your case is closed unless required by law. You can request early deletion subject to legal requirements.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>See what personal data we have about you</li>
              <li>Correct any incorrect information</li>
              <li>Request deletion of your data (subject to legal requirements)</li>
              <li>Opt out of non-essential communications</li>
              <li>Receive a copy of your data</li>
            </ul>
            <p className="mt-2">To exercise any of these rights, email <span className="font-medium">privacy@surplusflow.com</span>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">7. Contact Us</h2>
            <p>If you have questions about how your data is handled, reach out to us at <span className="font-medium">privacy@surplusflow.com</span>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
