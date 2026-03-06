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
            <p>By accessing or using the SurplusFlow AI platform (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. SurplusFlow AI reserves the right to update these terms at any time. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">2. Description of Services</h2>
            <p>SurplusFlow AI provides a surplus fund recovery management platform that assists businesses in identifying, tracking, and recovering unclaimed property, foreclosure surplus, and tax sale surplus funds. The platform includes case management, compliance tools, document generation, outreach automation, and billing features.</p>
            <p>SurplusFlow AI does not provide legal advice. Users are responsible for ensuring their use of the platform complies with all applicable laws and regulations in their jurisdiction.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">3. User Obligations</h2>
            <p>Users agree to: (a) provide accurate and complete information; (b) maintain the confidentiality of their login credentials; (c) comply with all applicable federal, state, and local laws governing surplus fund recovery; (d) not use the platform for any unlawful purpose; (e) not attempt to access data belonging to other users or organizations.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">4. Fee Structure</h2>
            <p>Fees for surplus recovery services are governed by individual service agreements between the recovery firm and its claimants. All fee arrangements must comply with applicable state regulations, including maximum fee percentages, cooling-off periods, and required disclosures. The platform enforces jurisdiction-specific fee caps automatically.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">5. Data Handling</h2>
            <p>SurplusFlow AI processes sensitive personal information including names, addresses, Social Security numbers (encrypted), and financial data. All data is encrypted at rest and in transit. See our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link> for full details on data handling practices.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">6. Limitation of Liability</h2>
            <p>SurplusFlow AI is provided &quot;as is&quot; without warranties of any kind. We are not liable for: (a) any indirect, incidental, or consequential damages; (b) loss of data or business interruption; (c) actions taken based on platform outputs; (d) compliance failures resulting from incorrect user input. Our total liability shall not exceed the fees paid by the user in the twelve months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">7. Governing Law</h2>
            <p>These Terms shall be governed by the laws of the State of Florida, without regard to conflict of law provisions. Any disputes shall be resolved in the courts of Miami-Dade County, Florida.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">8. Contact</h2>
            <p>For questions about these Terms, contact us at <span className="font-medium">legal@surplusflow.com</span>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
