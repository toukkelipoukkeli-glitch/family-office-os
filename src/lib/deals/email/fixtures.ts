/**
 * Deterministic, offline FIXTURE emails for the deal-email parser.
 *
 * These are fictional emails written by hand to exercise the parser. They are
 * never fetched from a live Gmail account — tests run entirely against these
 * strings so they are deterministic and offline (see AGENTS.md). No address
 * here is real and nothing is ever sent to them.
 */

/** A broker intro with a clear deal size in `€` + magnitude suffix. */
export const forestryBrokerEmail = `Message-Id: <CA+acorn-2026@example.com>
Subject: Project Acorn — forestry roll-up opportunity
From: "Jane Doe" <jane.doe@evergreen-advisory.com>
To: family.office@example.com
Cc: Karl Nieminen <karl@nieminen-forestry.fi>
Date: Mon, 12 Jan 2026 09:30:00 +0200

Hello,

As your advisory broker, I wanted to introduce a forestry roll-up of three
family-owned plots in central Finland. Indicative size is around €4.5m, with
upside if we add the adjacent woodland (a further €800k).

Happy to set up a call.

Best,
Jane Doe
Evergreen Advisory — M&A
--
Jane Doe | Partner | Evergreen Advisory
+358 40 123 4567
`;

/** A founder reaching out directly, dollars with thousands separators. */
export const vineyardFounderEmail = `Subject: Re: Intro — Napa vineyard stake
From: maria@sunhill-vineyards.com
To: family.office@example.com
Date: Tue, 03 Feb 2026 17:05:00 -0800

Hi there,

Following up after our intro. As founder and owner of Sun Hill, I'm looking
for a minority equity stake of $2,000,000 in our Napa vineyard operation.

Cheers,
Maria
`;

/** A lawyer email, code-suffix money, and a quoted reply that must be stripped. */
export const watchCollectionLawyerEmail = `Subject: Fwd: Patek collection — estate sale
From: "R. Schmidt (Counsel)" <r.schmidt@schmidt-legal.ch>
To: family.office@example.com
Date: Wed, 18 Mar 2026 11:00:00 +0100

Dear Sir/Madam,

On behalf of the estate, we can offer a curated watch collection. The reserve
is 1.2m CHF.

Kind regards,
R. Schmidt

On Tue, 17 Mar 2026 at 14:00, Someone <someone@example.com> wrote:
> This part is a quoted reply and should be ignored, $9,999,999.
`;

/** An email with no detectable money and a generic sender domain. */
export const vagueOutlookEmail = `Subject: quick question about art advisory
From: collector42@outlook.com
To: family.office@example.com
Date: Thu, 09 Apr 2026 08:00:00 +0000

Hi — do you ever look at gallery-sourced contemporary art? No numbers yet,
just gauging interest.
`;

/** A minimal email missing Subject and Date (graceful-degradation case). */
export const minimalEmail = `From: tipster@deals.example.org

Heard you might want a crypto token allocation. Will send details.
`;

/** All fixture emails as a record for table-driven tests. */
export const dealEmailFixtures = {
  forestryBrokerEmail,
  vineyardFounderEmail,
  watchCollectionLawyerEmail,
  vagueOutlookEmail,
  minimalEmail,
} as const;
