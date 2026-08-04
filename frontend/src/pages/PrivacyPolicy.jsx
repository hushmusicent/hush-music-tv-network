import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-black text-white px-6 md:px-12 py-16 max-w-3xl mx-auto" data-testid="privacy-policy-page">
      <h1 className="font-heading text-4xl mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: February 26, 2026</p>

      <section className="space-y-6 text-gray-300 leading-relaxed">
        <p>
          Hush Music TV Network ("we", "our", "the service") operates the broadcaster.emergent.host
          website and Hush Music TV mobile & TV apps. This page explains what data we handle and how.
        </p>

        <h2 className="text-2xl font-heading text-white pt-4">What we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Analytics (anonymous)</strong>: IP-based approximate location (country/region only) via ip-api.com, timestamps of channel views, and commercial view events. No user account required.</li>
          <li><strong>Admin accounts</strong>: If you sign in as an admin, we store your email and hashed password (bcrypt).</li>
          <li><strong>Third-party content</strong>: The app embeds YouTube videos via YouTube's official IFrame Player. YouTube's own privacy policy applies to that playback (yt.be/privacy).</li>
        </ul>

        <h2 className="text-2xl font-heading text-white pt-4">What we don't collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>No personally identifiable information from viewers (no accounts required to watch)</li>
          <li>No tracking cookies, no third-party ad networks</li>
          <li>No sale of user data — ever</li>
        </ul>

        <h2 className="text-2xl font-heading text-white pt-4">Data storage</h2>
        <p>
          Analytics events and admin credentials are stored on our servers. Videos are stored on
          Cloudflare R2. Data is retained indefinitely unless you request deletion via the contact
          address below.
        </p>

        <h2 className="text-2xl font-heading text-white pt-4">Your rights</h2>
        <p>
          You may request access to, correction of, or deletion of any personal data associated with
          you by emailing <a className="text-primary underline" href="mailto:hushmusicent419@gmail.com">hushmusicent419@gmail.com</a>.
          We'll respond within 30 days.
        </p>

        <h2 className="text-2xl font-heading text-white pt-4">Children</h2>
        <p>
          The service is not directed to children under 13. We don't knowingly collect personal
          information from anyone under 13. Some channels are labeled for kids/family viewing but no
          account or personal data is required to view them.
        </p>

        <h2 className="text-2xl font-heading text-white pt-4">Changes</h2>
        <p>
          We may update this policy. Changes will be posted on this page with a new "Last updated" date.
        </p>

        <h2 className="text-2xl font-heading text-white pt-4">Contact</h2>
        <p>
          Hush Music Entertainment LLC<br />
          Email: <a className="text-primary underline" href="mailto:hushmusicent419@gmail.com">hushmusicent419@gmail.com</a>
        </p>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
