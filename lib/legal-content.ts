import type { LegalSection } from "@/components/legal-page";

export const privacySections: LegalSection[] = [
  {
    title: "Information we collect",
    body: [
      "We collect account information such as name, username, email, phone or sign-in provider, age, gender, city, state, profile details, profile photos, and app preferences.",
      "We collect chat, call, wallet, transaction, report, block, device, visitor, and safety information needed to run the service, prevent abuse, and support users.",
      "For hosts who request withdrawals, we may collect payout and tax details such as UPI ID, legal name, bank details, PAN where required, payout statements, and withdrawal history.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "We use information to create accounts, show profiles, match users, deliver chats and calls, process wallet balances, handle withdrawals, respond to support requests, and keep the platform safe.",
      "We use device and activity signals to prevent fraud, duplicate accounts, spam, underage use, chargebacks, banned-device re-entry, and misuse of chat or call features.",
      "Payout and tax information is used only for withdrawal processing, tax compliance, fraud prevention, dispute handling, and legally required records.",
    ],
  },
  {
    title: "Sharing",
    body: [
      "We do not sell personal information. We share information only with service providers needed for hosting, authentication, database, media storage, calls, analytics, payments, payout processing, safety review, legal compliance, or support.",
      "Profile information, public photos, location at city/state level, online status, and rates may be visible to other users where the app experience requires it.",
      "We may disclose information if required by law, court order, payment dispute, tax process, fraud investigation, or to protect users and the platform.",
    ],
  },
  {
    title: "Retention and deletion",
    body: [
      "Chat messages and in-chat media are designed to expire after a limited period. Some safety, wallet, transaction, payout, report, audit, and tax records may be kept longer where needed for legal, fraud, accounting, or dispute reasons.",
      "Users may request account deletion or data help through support. Some records cannot be deleted immediately if we are required to retain them for security, tax, accounting, dispute, or legal obligations.",
    ],
  },
  {
    title: "Security",
    body: [
      "We use access controls, server-side checks, database policies, and provider security features to protect data. No online service can guarantee absolute security.",
      "Users should keep login details private and report suspicious activity, impersonation, harassment, or payment issues promptly.",
    ],
  },
];

export const termsSections: LegalSection[] = [
  {
    title: "Eligibility",
    body: [
      "You must be at least 18 years old to use Kizo. By using the service, you confirm that the information you provide is accurate and that you are legally allowed to use the app.",
      "We may suspend or remove accounts that appear fake, unsafe, underage, abusive, fraudulent, or in violation of these terms.",
    ],
  },
  {
    title: "Accounts and conduct",
    body: [
      "You are responsible for your account, device, messages, media, calls, wallet activity, and interactions with other users.",
      "Do not impersonate others, upload stolen media, harass users, threaten users, share illegal content, attempt scams, manipulate calls or messages, evade bans, or use automation to abuse the service.",
      "Users can block or report other users. We may review reports and take action including warnings, feature limits, suspension, device bans, payout holds, or account removal.",
    ],
  },
  {
    title: "Wallet, beans, and rewards",
    body: [
      "Beans, coins, credits, rewards, or balances are app records used for Kizo features. They are not bank deposits, securities, stored-value instruments, or guaranteed cash unless a withdrawal is approved under the host payout rules.",
      "Balances may be adjusted for refunds, chargebacks, fraud, technical errors, duplicate transactions, abuse, policy violations, or legal requirements.",
    ],
  },
  {
    title: "Calls and content",
    body: [
      "Kizo provides chat and calling tools. We do not guarantee that any user will respond, stay online, accept a call, or provide a particular conversation experience.",
      "Users must not record, distribute, threaten, blackmail, or misuse another person's content, images, voice, video, or personal information.",
    ],
  },
  {
    title: "Changes and termination",
    body: [
      "We may change features, rates, limits, policies, or availability when needed for business, safety, compliance, or technical reasons.",
      "We may suspend or terminate access if we believe continued access creates legal, fraud, safety, payment, or platform risk.",
    ],
  },
];

export const refundSections: LegalSection[] = [
  {
    title: "General rule",
    body: [
      "Digital beans, coins, credits, messages, calls, gifts, boosts, and similar digital features are generally non-refundable once delivered, used, or credited to the account.",
      "A refund may be considered only for duplicate payment, failed credit, clear technical error, unauthorized transaction reported promptly, or a legal requirement.",
    ],
  },
  {
    title: "Non-refundable cases",
    body: [
      "We do not usually refund dissatisfaction with a conversation, user not replying, user blocking, voluntary spending, change of mind, account suspension for policy violations, or balances affected by fraud or abuse.",
      "If a payment is reversed, charged back, or reported as fraud, related beans, host rewards, payouts, and accounts may be held or adjusted.",
    ],
  },
  {
    title: "Review process",
    body: [
      "Refund requests should include account details, payment reference, amount, date, and a short explanation. We may ask for additional information to verify the issue.",
      "Approved refunds are processed to the original payment method where possible. Bank, payment gateway, and provider timelines may vary.",
    ],
  },
  {
    title: "Taxes and fees",
    body: [
      "Prices may include or exclude taxes depending on the checkout shown. Gateway charges, taxes, and already-used digital value may reduce the refundable amount where allowed by law.",
    ],
  },
];

export const hostSections: LegalSection[] = [
  {
    title: "Host participation",
    body: [
      "Hosts can create profiles, receive chats or calls, and earn app rewards according to the rates, limits, and rules shown in the app.",
      "Being visible in discovery, receiving traffic, receiving calls, earning rewards, or qualifying for withdrawal is not guaranteed.",
    ],
  },
  {
    title: "Withdrawals",
    body: [
      "Withdrawals are optional and subject to eligibility, review, available balance, fraud checks, payment status, chargeback risk, policy compliance, and applicable tax or payout requirements.",
      "We may request payout information such as UPI ID, legal name, bank details, PAN, or other details needed to process withdrawals, maintain records, prevent fraud, or comply with law.",
      "If required payout or tax details are not provided, withdrawals may be delayed, limited, rejected, or kept unavailable while the in-app balance remains subject to platform rules.",
    ],
  },
  {
    title: "Processing timeline",
    body: [
      "Eligible withdrawals are normally reviewed within 24 hours, excluding Sundays, government holidays, bank downtime, payment provider downtime, fraud reviews, and compliance checks.",
      "First withdrawals, large withdrawals, suspicious activity, duplicate device or UPI use, reports, chargebacks, or unusual earning patterns may require manual review and take longer.",
    ],
  },
  {
    title: "Adjustments and holds",
    body: [
      "Host earnings may be reduced, reversed, or held for refunds, chargebacks, fake engagement, policy violations, duplicate accounts, banned-device activity, reports, technical errors, or suspected fraud.",
      "We may require additional verification before releasing payouts if activity creates safety, legal, tax, or fraud risk.",
    ],
  },
  {
    title: "Tax responsibility",
    body: [
      "Hosts are responsible for their own tax filings and for providing accurate payout and tax information where required. We may deduct, report, or withhold amounts if required by applicable law.",
    ],
  },
];

export const safetySections: LegalSection[] = [
  {
    title: "Respect and consent",
    body: [
      "Use Kizo respectfully. Do not pressure users, threaten users, share private information, record without permission, or continue contacting someone who has blocked or refused you.",
      "Sexual, romantic, or personal conversations must stay legal, consensual, and between adults.",
    ],
  },
  {
    title: "Not allowed",
    body: [
      "We do not allow minors, impersonation, stolen photos, scams, extortion, blackmail, non-consensual intimate content, hate, threats, illegal services, trafficking, or attempts to move users into unsafe transactions.",
      "Do not ask for passwords, OTPs, bank login details, private documents, or money outside the platform in a deceptive way.",
    ],
  },
  {
    title: "Blocking and reports",
    body: [
      "Users can block other users. Blocking disables direct interaction features for that relationship where supported by the app.",
      "Repeated blocks, reports, fraud signals, or safety violations may lead to account suspension, device ban, payout hold, or permanent removal.",
    ],
  },
  {
    title: "Location and privacy",
    body: [
      "Use city/state location features honestly, but do not share your exact address, private workplace, documents, or sensitive personal details with strangers.",
      "Meetings outside the app are not supervised by Kizo. Users are responsible for their own choices and safety.",
    ],
  },
  {
    title: "Emergency",
    body: [
      "Kizo is not an emergency service. If you are in immediate danger, contact local emergency services or trusted local help.",
    ],
  },
];
