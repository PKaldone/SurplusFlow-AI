import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800 mb-8 inline-block">&larr; Back to home</Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: March 1, 2026</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">1. Agreement to Terms</h2>
            <p>By accessing the SurplusFlow claimant portal (&quot;Portal&quot;), you agree to be bound by these Terms of Service. The Portal allows you to view and manage your surplus fund recovery case, review and sign contracts, upload required documents, and track claim progress.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">2. Your Account</h2>
            <p>Access to the Portal is provided via secure magic links sent to your registered email address. You are responsible for maintaining the security of your email account. Do not share your login links with others. Each link is single-use and expires after 15 minutes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">3. Services Provided</h2>
            <p>Through the Portal, your recovery firm provides surplus fund recovery services on your behalf. This includes locating surplus funds, preparing and filing claims, and managing the recovery process. The firm acts as your authorized representative in accordance with the contract you sign through this Portal.</p>
            <p>The Portal and its operators do not provide legal advice. For legal questions about your claim, consult with a licensed attorney.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">4. Fees and Compensation</h2>
            <p>Fee arrangements are specified in your individual service contract, which you can review and sign through this Portal. Fee percentages are subject to state regulations and will not exceed the legal maximum for your jurisdiction. You have the right to a cooling-off period as specified by your state&apos;s laws, during which you may cancel without penalty.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">5. Your Responsibilities</h2>
            <p>You agree to: (a) provide truthful and accurate information; (b) upload authentic documents; (c) respond to communications in a timely manner; (d) review contracts carefully before signing; (e) notify us immediately if any of your information changes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">6. Right to Cancel</h2>
            <p>You have the right to rescind (cancel) your service contract within the cooling-off period specified in your contract and applicable state law. To cancel, contact your recovery firm directly or use the cancellation option in the Portal if available.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">7. Limitation of Liability</h2>
            <p>The Portal is provided &quot;as is.&quot; We are not responsible for the outcome of any claim or the actions of government agencies processing your claim. Recovery of surplus funds is not guaranteed.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">8. Contact</h2>
            <p>For questions about these Terms or your claim, contact us at <span className="font-medium">support@surplusflow.com</span>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
