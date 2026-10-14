/**
 * Legal page content for StreamVerse.
 *
 * IMPORTANT: this is product scaffolding, not approved legal text, and it has not been reviewed by a
 * lawyer. Anything the business still has to decide is written as a `[[placeholder]]`; the legal page
 * renders those as highlighted tokens so they are easy to find and replace. Do not add guarantees,
 * certifications, entity names, addresses or jurisdictions here until the business has confirmed them.
 *
 * Blocks: a string is a paragraph; `{ list: [...] }` is a bullet list.
 */

export type LegalBlock = string | { list: string[] };
export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };
export type LegalDoc = { title: string; summary: string; sections: LegalSection[] };

/* ------------------------------------------------------------------ Privacy Policy */

export const privacyPolicy: LegalDoc = {
  title: "Privacy Policy",
  summary: "What StreamVerse collects when you watch, read and listen, how it is used, and the choices you have.",
  sections: [
    {
      id: "introduction",
      heading: "Introduction",
      blocks: [
        "This Privacy Policy explains how StreamVerse collects, uses and protects information when you use our website and apps to watch movies, read eBooks and listen to audiobooks (the “Service”). By using the Service you agree to the practices described here.",
        "The Service is operated by [[Company legal name]].",
      ],
    },
    {
      id: "information-collected",
      heading: "Information we collect",
      blocks: [
        "We collect the following kinds of information, depending on how you use the Service:",
        { list: ["account information you give us", "activity and usage information created as you use the Service", "payment information handled by our payment provider", "technical information about your device and browser"] },
      ],
    },
    {
      id: "account-information",
      heading: "Account information",
      blocks: ["This includes your name, email address, country, language, age (used for age-restricted titles), avatar and the preferences you choose, such as playback, subtitle, audio and notification settings."],
    },
    {
      id: "usage-information",
      heading: "Usage and activity information",
      blocks: [
        "To give you a continuous experience we keep information about what you do in the Service:",
        { list: ["titles you add to My List or your Library", "where you stopped watching, reading or listening, and your bookmarks", "your history and recent searches", "notifications you have read or removed"] },
        "We also collect technical information such as device and browser type and error reports so we can keep the Service working.",
      ],
    },
    {
      id: "payment-information",
      heading: "Payment information",
      blocks: [
        "Payments are handled by a third-party payment provider. Card details are entered with, and processed by, that provider. StreamVerse keeps only limited display information about a saved card: the card type, the last four digits, the expiry date, the name on the card and the billing country. We do not store your full card number or security code.",
        "[[Confirm the payment provider and the exact information received from it]]",
      ],
    },
    {
      id: "cookies-storage",
      heading: "Cookies and browser storage",
      blocks: [
        "StreamVerse uses your browser's storage to remember your preferences, your lists, your progress and your sign-in. In the current version of the Service this information is saved in your browser on your device, so clearing your browser data will remove it. [[List any cookies or similar technologies used once accounts are connected to a server]]",
      ],
    },
    {
      id: "how-we-use",
      heading: "How we use information",
      blocks: [
        "We use information to:",
        { list: ["provide the Service and keep your place in titles", "apply age, region and plan restrictions to content", "process payments and send billing notices", "personalise recommendations and notifications you have turned on", "keep the Service secure and prevent misuse", "provide support and meet legal obligations"] },
      ],
    },
    {
      id: "service-providers",
      heading: "Service providers",
      blocks: [
        "We use trusted providers to help run the Service, such as hosting, payment processing, email delivery and analytics. They may use information only to perform services for us. We share information with others only where the law requires it, to protect people or the Service, in connection with a business transfer, or with your consent. [[List the categories or names of providers the business uses]]",
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: ["We use reasonable technical and organisational measures intended to protect information against loss, misuse and unauthorised access. No system is completely secure, so we cannot guarantee absolute security."],
    },
    {
      id: "retention",
      heading: "Data retention",
      blocks: ["We keep information for as long as needed to provide the Service and for legitimate business and legal purposes, such as resolving disputes and keeping billing records. [[Specify retention periods for account data, activity data and billing records]]"],
    },
    {
      id: "your-rights",
      heading: "Your rights and account controls",
      blocks: [
        "You can change your profile, language and playback preferences, notification settings and saved payment methods in your account, and you can remove titles from My List, your Library and your History at any time.",
        "Depending on where you live, you may also have the right to access, correct, delete or receive a copy of your personal information, and to object to certain uses. To make a request, contact us using the details below. We may need to verify your identity first.",
      ],
    },
    {
      id: "children",
      heading: "Children and minors",
      blocks: ["Some titles are age-restricted and the Service asks you to confirm your age before opening them. The Service is not intended for children under [[minimum age]] without a parent or guardian, and we do not knowingly collect personal information from them. If you believe a child has given us information, contact us and we will take appropriate steps."],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      blocks: ["We may update this policy from time to time. When we make material changes we will take reasonable steps to let you know, for example with a notice in the Service. The date of the latest version is shown at the top of this page."],
    },
    {
      id: "contact",
      heading: "Contact information",
      blocks: ["Questions about this policy or your information can be sent to [[Support email]].", "[[Company legal name and postal address]]"],
    },
  ],
};

/* ------------------------------------------------------------------ Terms & Conditions */

export const termsAndConditions: LegalDoc = {
  title: "Terms & Conditions",
  summary: "The rules for using StreamVerse, including subscriptions, billing, cancellation and acceptable use.",
  sections: [
    {
      id: "acceptance",
      heading: "Acceptance of these terms",
      blocks: ["These Terms & Conditions (the “Terms”) are an agreement between you and [[Company legal name]] (“StreamVerse”, “we”, “us”). By creating an account or using the Service you agree to these Terms. If you do not agree, do not use the Service."],
    },
    {
      id: "account-use",
      heading: "Account use",
      blocks: ["You are responsible for the information in your account, for keeping your sign-in details private, and for everything that happens under your account. Tell us promptly if you think someone else has used it. Accounts are for personal, non-commercial use and may not be shared outside your household unless your plan says otherwise."],
    },
    {
      id: "eligibility",
      heading: "Eligibility",
      blocks: ["You must be at least [[minimum age]] years old, or have the permission of a parent or guardian, to use the Service. Some titles are restricted by age or region, and you must be eligible to access them."],
    },
    {
      id: "subscription-terms",
      heading: "Subscription terms",
      blocks: [
        "Access to the full library requires a paid plan. The plans, prices and billing periods (monthly or yearly) are shown on the Subscription page. Plans renew automatically at the end of each billing period until cancelled.",
        "Upgrading a plan takes effect immediately. A downgrade takes effect at the end of your current billing period. We may change plans or prices with reasonable notice, and changes apply from your next billing period.",
      ],
    },
    {
      id: "billing",
      heading: "Billing",
      blocks: ["You authorise us and our payment provider to charge your default payment method for your plan on each renewal date and for any other amounts you agree to. Keep your payment details up to date. If a payment fails we may retry it, tell you, and limit or pause access until the balance is settled. You are responsible for any taxes that apply unless we tell you otherwise."],
    },
    {
      id: "cancellation",
      heading: "Cancellation",
      blocks: ["You can cancel your plan at any time from the Subscription page. After you cancel, you keep access until the end of the billing period you have already paid for, and you will not be charged again. Cancelling is separate from getting a refund; see our Refund Policy."],
    },
    {
      id: "content-access",
      heading: "Content access",
      blocks: ["Movies, eBooks and audiobooks are licensed to you for personal viewing, reading and listening through the Service. Titles may be added, changed or removed, and some are available only for a limited time, in certain regions, to certain ages or on certain plans. We do not promise that any particular title will always be available."],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      blocks: [
        "You agree not to:",
        { list: ["copy, record, download, redistribute or publicly show content except as the Service allows", "bypass age, region, plan or copy-protection controls", "use the Service for anything unlawful or to harm others", "interfere with, probe or overload the Service or its security", "share your account in a way these Terms do not allow"] },
      ],
    },
    {
      id: "intellectual-property",
      heading: "Intellectual property",
      blocks: ["The Service and its content, including films, books, audio, artwork, software and branding, belong to StreamVerse or its licensors and are protected by law. These Terms give you a limited, non-exclusive, non-transferable right to use the Service and do not transfer any ownership to you."],
    },
    {
      id: "user-responsibilities",
      heading: "Your responsibilities",
      blocks: ["You are responsible for having a compatible device and internet connection, for the accuracy of the information you give us, and for following the age and region rules that apply to you. Data charges from your internet or mobile provider are your responsibility."],
    },
    {
      id: "availability",
      heading: "Availability of the Service",
      blocks: ["We work to keep the Service available but do not promise it will be uninterrupted or error free. We may carry out maintenance, and we may change or discontinue features. Video, reading and audio quality can depend on your device and connection."],
    },
    {
      id: "termination",
      heading: "Suspension and termination",
      blocks: ["We may suspend or end your access if you break these Terms, if payment is overdue, if needed to protect the Service or other people, or if the law requires it. You may stop using the Service at any time. Parts of these Terms that by their nature should continue after termination will continue."],
    },
    {
      id: "disclaimers",
      heading: "Disclaimers",
      blocks: ["To the fullest extent permitted by law, the Service and its content are provided “as is” and “as available”, without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement."],
    },
    {
      id: "limitation",
      heading: "Limitation of liability",
      blocks: ["To the fullest extent permitted by law, StreamVerse will not be liable for indirect, incidental, special or consequential damages, or for loss of data or profits. Our total liability for claims relating to the Service is limited to [[liability cap]]. Nothing in these Terms limits liability that cannot be limited by law."],
    },
    {
      id: "changes",
      heading: "Changes to these Terms",
      blocks: ["We may update these Terms. When changes are material we will take reasonable steps to tell you. If you keep using the Service after the changes take effect, you accept the updated Terms."],
    },
    {
      id: "governing-law",
      heading: "Governing law",
      blocks: ["These Terms are governed by the laws of [[governing jurisdiction]], without regard to conflict-of-law rules, unless the law where you live requires otherwise."],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: ["Questions about these Terms can be sent to [[Support email]].", "[[Company legal name and postal address]]"],
    },
  ],
};

/* ------------------------------------------------------------------ Refund Policy */

export const refundPolicy: LegalDoc = {
  title: "Refund Policy",
  summary: "When refunds are available for StreamVerse subscriptions, and how to ask for one.",
  sections: [
    {
      id: "overview",
      heading: "Overview",
      blocks: ["This policy explains how refunds work for StreamVerse charges. Read it together with our Terms & Conditions. We want billing to be clear and fair, and we will always look into a charge you believe is wrong."],
    },
    {
      id: "subscription-refunds",
      heading: "Subscription refunds",
      blocks: ["Subscription fees are charged at the start of each billing period for the plan you chose. In general, fees for a billing period that has already started are not refundable, except as set out below. [[Confirm the business's position on refunds for the first period of a new subscription]]"],
    },
    {
      id: "duplicate-charges",
      heading: "Duplicate charges",
      blocks: ["If you were charged twice for the same period, tell us as soon as you notice. We will check your billing history and payment records. Confirmed duplicate charges are refunded in full."],
    },
    {
      id: "incorrect-billing",
      heading: "Failed or incorrect billing",
      blocks: ["If a charge does not match your plan, or you were charged after a valid cancellation, contact us. If the charge was our error, we will correct it by refund or credit. A failed payment does not create a charge, so there is nothing to refund; update your payment method and the renewal will be retried."],
    },
    {
      id: "eligibility",
      heading: "Refund eligibility",
      blocks: [
        "We may provide a full or partial refund, or a credit, in situations such as:",
        { list: ["a duplicate charge for the same period", "a charge for an amount that does not match your plan", "a charge made after a valid, timely cancellation", "a failure on our side that stopped you from using the Service for a significant time", "[[Other refund situations the business wants to support]]"] },
        "To be considered for a renewal charge you did not intend, contact us within [[number of days]] days of the charge.",
      ],
    },
    {
      id: "non-refundable",
      heading: "What is not refundable",
      blocks: [
        "Unless the law requires otherwise, these are generally not refundable:",
        { list: ["fees for a billing period that has already started, once the Service has been available to you", "charges for titles you chose not to watch, read or listen to", "unavailability of a specific title, which can change over time", "accounts closed for breaking our Terms"] },
      ],
    },
    {
      id: "cancellation-vs-refund",
      heading: "Cancellation is not the same as a refund",
      blocks: ["Cancelling your plan stops future renewals. You keep access until the end of the period you have paid for, and you will not be charged again. Cancelling does not by itself create a refund for the period already paid."],
    },
    {
      id: "processing",
      heading: "Review and processing",
      blocks: ["We will review your request and reply with a decision. Approved refunds are returned to the original payment method where possible. [[State the typical review and processing time once confirmed with the payment provider]]"],
    },
    {
      id: "how-to-request",
      heading: "How to request a refund",
      blocks: ["Contact us at [[Support email]] from the address on your account. Include the date and amount of the charge, your plan and the reason for your request. You can find your charges in the billing history on the Subscription page."],
    },
    {
      id: "contact",
      heading: "Contact and support",
      blocks: ["For refund and billing questions, contact [[Support email]]. Exceptional requests are reviewed case by case, and approval is at our discretion."],
    },
  ],
};
