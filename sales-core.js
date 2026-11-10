/* YALO CRM: sales core (pure logic, no DOM, no Firebase). Works in the browser (window.YS) and in Node.
 * Built from the playbooks in the founder-*, sales-*, growth-skill, ig-dm, yt-comment and ig-human skills:
 *  - brands: two companies in one CRM (YALO, Clearpath QR), each with its own profile
 *  - sequences: email / DM / comment steps written for each audience (facts only come from the brand profile)
 *  - objection + rejection library (acknowledge, associate, ask)
 *  - call outcomes -> stage change + follow-up tasks
 *  - lead score ("do this next") and forecast
 *  - AI prompt builders (Groq) and a human-writing filter
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./outreach-core.js'), require('./sales-lexicon.js'));
  else root.YS = factory(root.YO, root.YO_LEX);
})(typeof self !== 'undefined' ? self : this, function (YO, LEX) {
  'use strict';
  const DAY = 86400000, HOUR = 3600000;
  const clean = YO.clean;

  /* ================================================================== brands */
  const DEFAULT_BRANDS = {
    yalo: {
      id: 'yalo', name: 'YALO', color: '#4f46e5',
      oneLiner: 'Rent financing, plus a marketplace where people pay rent and buy appliances.',
      audience: 'Business owners, CFOs and other C-suite executives at companies in Nigeria.',
      offer: 'YALO pays the landlord in full on day one and the business repays monthly from operating cash flow. No collateral, and no penalty for settling early. For staff, employees can have their annual rent paid upfront and repay monthly through payroll, at no cost to the employer.',
      marketplace: 'YALO also runs a marketplace where people can buy appliances, not just pay rent.',
      price: '', terms: '',
      proof: ['YALO works with 163 businesses across Nigeria.', 'YALO has financed more than 1,600 rental accounts.'],
      guarantee: '',
      tone: 'Direct, calm and respectful. Plain words. Talks about cash flow and capital for owners and CFOs, never hype.',
      avoid: 'guaranteed returns, free money, limited time offer, act now',
      icpTitles: 'CFO, finance director, owner, founder, CEO, managing director, COO, HR director'
    },
    clearpath: {
      id: 'clearpath', name: 'Clearpath QR', color: '#0d9488',
      oneLiner: 'A QR code generator for YouTube creators that captures leads from viewers in real time.',
      audience: 'YouTube creators and channel owners who want to turn viewers into leads they can contact.',
      offer: 'Put a QR code on screen in a video or live stream. Viewers scan it and you capture who they are as it happens.',
      marketplace: '', price: '', terms: '', proof: [], guarantee: '',
      tone: 'Friendly, short, creator to creator. No hype, no pressure.',
      avoid: 'guaranteed views, go viral, game-changer, 10x',
      icpTitles: 'creator, YouTuber, channel owner, founder'
    }
  };
  const BRAND_IDS = ['yalo', 'clearpath'];
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  function mergeBrands(saved) {
    const out = {};
    for (const id of BRAND_IDS) {
      const d = DEFAULT_BRANDS[id], s = (saved && saved[id]) || {};
      out[id] = Object.assign({}, d, s, { id, proof: s.proof !== undefined ? arr(s.proof) : d.proof.slice() });
    }
    return out;
  }
  const brandOf = lead => (lead && lead.brand && DEFAULT_BRANDS[lead.brand]) ? lead.brand : 'yalo';
  const filterByBrand = (leads, brand) => (!brand || brand === 'all') ? leads : leads.filter(l => brandOf(l) === brand);
  // Facts the AI and the templates rely on. Missing ones are shown in Settings so they can be filled in.
  const BRAND_FIELDS = [
    { key: 'oneLiner', label: 'One line: what the company does', help: 'One plain sentence.' },
    { key: 'audience', label: 'Who you sell to', help: 'Job titles and type of company.' },
    { key: 'offer', label: 'What you offer', help: 'The deal in plain words: what they get, how it is paid, the main reassurance.', long: true },
    { key: 'price', label: 'Price or rates', help: 'Leave empty if you prefer to quote on a call. The AI will then never quote one.' },
    { key: 'terms', label: 'Terms (tenor, fees, eligibility)', help: 'Only facts you are happy to say out loud.', long: true },
    { key: 'proof', label: 'Proof (one fact per line)', help: 'Real numbers and customers only. These are used in emails.', long: true, list: true },
    { key: 'marketplace', label: 'Marketplace line (optional)', help: 'One sentence about any extra product.' },
    { key: 'guarantee', label: 'Guarantee (optional)', help: 'Only if you really honour it.' },
    { key: 'tone', label: 'Tone of voice', help: 'How you want to sound.' },
    { key: 'avoid', label: 'Words and claims to avoid', help: 'Comma separated.' },
    { key: 'icpTitles', label: 'Target job titles', help: 'Used to pick the right sequence and to score leads.' }
  ];
  function missingFacts(profile) {
    const need = ['offer', 'audience', 'proof', 'price'];
    return need.filter(k => !(Array.isArray(profile[k]) ? profile[k].length : clean(profile[k])));
  }

  /* ================================================================== sequences */
  // Each step: { day, channel:'email'|'dm'|'comment', label, subject, body }. "day" = days after the FIRST step.
  const SEQUENCES = {
    'yalo-lease': {
      brand: 'yalo', name: 'Owners and CFOs: lease financing', audience: 'Owners, CFOs, finance leads',
      steps: [
        { day: 0, channel: 'email', label: 'The capital question', subject: 'Rent and working capital at {company}', body: `Hi {first_name},

Most businesses pay a year's rent upfront. For {company} that is likely a large cheque sitting with the landlord while the money could be working in the business.

YALO pays the landlord in full on day one. You repay monthly from operating cash flow, with no collateral.

Is this on your radar before your next renewal, or am I off base?` },
        { day: 2, channel: 'email', label: 'The hidden cost', subject: 'The hidden cost of paying rent upfront', body: `Hi {first_name},

A quick follow-up with the maths. When a business pays {lease_phrase} in rent upfront, it is lending that money to the landlord, interest free, for twelve months.

With YALO the landlord is still paid in full. You spread the cost monthly and can settle early without a penalty.

Worth 15 minutes to see what that looks like for your next renewal?` },
        { day: 6, channel: 'email', label: 'The case', subject: 'How a Lagos distribution company handled its renewal', body: `Hi {first_name},

A distribution company in Lagos had a combined office and warehouse lease up for renewal. The CFO had the cash, but putting all of it into rent would have paused a growth cycle that was already paying off.

YALO paid the landlord in full on signing day. The company repaid monthly from operating cash flow and kept its capital working. Landlords who prefer guaranteed upfront payment sometimes offer a rebate as well.

Would a similar structure make sense for {company}?` },
        { day: 13, channel: 'email', label: 'The direct ask', subject: "Fifteen minutes on {company}'s lease", body: `Hi {first_name},

I'll be direct. If {company} pays rent upfront, there is a cost your P&L does not show: what that cash could have earned inside the business.

YALO covers the rent on day one. You repay monthly. Early settlement carries no penalty.

I'd like to set up 15 minutes this week or next. What does your availability look like?` },
        { day: 20, channel: 'email', label: 'The one-pager', subject: 'One page on repaying rent monthly', body: `Hi {first_name},

Okay if I send over a one-page breakdown of how monthly repayment would work for a lease like {company}'s, including what happens if you settle early?` },
        { day: 29, channel: 'email', label: 'The proof', subject: 'Who else has done this', body: `Hi {first_name},

{proof} {proof2}

If {company} has a renewal coming up, would a short call be useful?` },
        { day: 44, channel: 'email', label: 'Closing the loop', subject: 'Should I close the loop?', body: `Hi {first_name},

I have reached out a few times, so I will stop after this one.

When {company}'s next renewal comes, the default is to pay upfront. YALO is the alternative: we pay the landlord in full and you repay monthly.

If it becomes relevant, reply "later" and I will check back in a few months.` }
      ]
    },
    'yalo-staff': {
      brand: 'yalo', name: 'Owners and executives: staff housing benefit', audience: 'Owners, COOs, HR and people leads',
      steps: [
        { day: 0, channel: 'email', label: 'The retention question', subject: "A no-cost way to help {company}'s staff with rent", body: `Hi {first_name},

Many good people leave, not because of the company, but because rent is due a year upfront while salary arrives monthly.

Through YALO your employees can have their annual rent paid upfront and repay monthly through payroll. It costs {company} nothing.

Is keeping your people on your agenda this year, or am I off base?` },
        { day: 2, channel: 'email', label: 'The cost of replacing', subject: 'What it costs to replace one employee', body: `Hi {first_name},

Replacing someone usually costs more than keeping them: recruitment fees, onboarding, lost output and manager time. Most businesses only add it up after a resignation.

Housing support is one of the few benefits that costs the company nothing to offer. YALO handles the paperwork, the landlord and the payment.

Worth 15 minutes to see how it would work at {company}?` },
        { day: 6, channel: 'email', label: 'How it works', subject: 'How rent support works through payroll', body: `Hi {first_name},

The short version. An employee finds a home, YALO pays the landlord the full year, and the employee repays monthly through payroll. {company} does not fund the rent and takes on no extra salary cost.

YALO handles documentation, landlord engagement and payment logistics.

Would it help if I walked your HR lead through it?` },
        { day: 13, channel: 'email', label: 'Beyond rent', subject: 'Rent and appliances for your staff', body: `Hi {first_name},

{marketplace}

For a business that wants a benefit people actually use, rent and appliances are two things most employees pay for anyway.

I'd like to set up 15 minutes this week or next. What does your availability look like?` },
        { day: 20, channel: 'email', label: 'The announcement note', subject: 'A short note to announce the benefit', body: `Hi {first_name},

Some employers present this as a wellbeing benefit rather than a financial product, and that framing tends to land better with staff.

Okay if I send over a short note on how other employers announce it?` },
        { day: 29, channel: 'email', label: 'The proof', subject: 'Who else offers this', body: `Hi {first_name},

{proof} {proof2}

If housing support is something {company} would consider, would a 15-minute walkthrough of how it runs in practice be useful?` },
        { day: 44, channel: 'email', label: 'Closing the loop', subject: 'Close the file?', body: `Hi {first_name},

I have reached out a few times without hearing back, so this is my last note.

If the timing is not right, that is fine. When staff retention or housing support moves up {company}'s list, reply "later" and I will pick this up again.` }
      ]
    },
    'clearpath-creator': {
      brand: 'clearpath', name: 'YouTube creators: comment, DM, email', audience: 'YouTube creators and channel owners',
      steps: [
        { day: 0, channel: 'comment', label: 'Engage first', subject: '', body: `Leave one genuine comment on {first_name}'s latest video. Mention one specific thing you learned or liked. No pitch, no link, under 30 words.

Their video or topic: {hook}` },
        { day: 2, channel: 'dm', label: 'Warm DM', subject: '', body: `Hi {first_name}, I left a comment on your {hook} video.

One idea that fits it: show a QR on screen at the moment you mention your offer, so viewers can act while they are still watching. I build Clearpath QR, which captures who scans as it happens.

Is turning viewers into leads something you are working on?` },
        { day: 5, channel: 'email', label: 'Intro email', subject: 'A question about your YouTube leads', body: `Hi {first_name},

I'm {sender_name} from {brand}. {offer}

Is capturing more leads from your viewers something you want, or am I off base?` },
        { day: 9, channel: 'dm', label: 'DM with a new idea', subject: '', body: `Hi {first_name}, one more thought on {hook}. A good moment for the QR is right after you give people a reason to act, like a free resource or a giveaway.

Would it help if I showed you what a captured lead looks like?` },
        { day: 14, channel: 'email', label: 'The walkthrough', subject: 'What a captured lead looks like', body: `Hi {first_name},

Okay if I show you a quick walkthrough of what a captured lead looks like, using one of your videos as the example?

If it is not for you, just say so and I won't follow up again.` },
        { day: 24, channel: 'dm', label: 'Closing the loop', subject: '', body: `Hi {first_name}, I'll stop messaging here so I don't clog your inbox. If capturing leads from your videos becomes a priority, reply "later" and I'll check back in a few months.` }
      ]
    }
  };
  const gapsOf = steps => steps.map((s, i) => i ? Math.max(0, s.day - steps[i - 1].day) : 0);
  const seqIdsForBrand = b => Object.keys(SEQUENCES).filter(id => SEQUENCES[id].brand === b);
  const OWNERS_RE = /\b(cfo|chief financial|finance|financial|treasurer|controller|owner|founder|co-founder|ceo|chief executive|managing director|\bmd\b|president|proprietor|director of finance)\b/i;
  const PEOPLE_RE = /\b(hr|human resource|people|talent|coo|chief operating|operations|admin|culture|workforce)\b/i;
  // Pick a sequence for a person: by brand and job title.
  function autoSeqType(lead, contact) {
    const b = brandOf(lead);
    if (b === 'clearpath') return 'clearpath-creator';
    const t = String((contact && contact.title) || '');
    if (OWNERS_RE.test(t) && !PEOPLE_RE.test(t)) return 'yalo-lease';
    if (PEOPLE_RE.test(t)) return 'yalo-staff';
    return 'yalo-lease';
  }
  function sequenceMeta(lead, contact, forceType) {
    const type = forceType || autoSeqType(lead, contact);
    const d = SEQUENCES[type];
    return d ? { type, n: d.steps.length, gaps: gapsOf(d.steps) } : { type, n: 7, gaps: null };
  }
  // templatesFor(type) for YO.renderStep. Falls back to the original office / employer scripts for old leads.
  function templatesFor(type, legacy) {
    if (SEQUENCES[type]) return SEQUENCES[type].steps;
    return (legacy && legacy[type]) || [];
  }
  const channelLabel = c => ({ email: 'Email', dm: 'DM', comment: 'Comment' }[c] || 'Email');

  /* ================================================================== objections + rejections */
  // reply = what to say, in the Acknowledge, Associate, Ask pattern. {terms} {offer} come from the brand profile.
  const OBJECTIONS = [
    { id: 'price', group: 'objection', title: 'What are the rates and fees?', means: 'They are checking whether it is affordable, or whether there is a catch. A question about price is interest, not a no.',
      reply: { yalo: `Fair question, and I would rather give you real numbers than a range. The cost depends on the size of the lease and how many months you repay over. Can I ask what your annual rent is and when it is due? Then I can show you the exact monthly figure next to paying upfront.`,
        clearpath: `Fair question. Before I give you a number, what would one captured lead be worth to you? That tells us whether it is worth doing, and then I will tell you exactly what it costs.` },
      ask: 'What is your annual rent and when is it due? / What would one lead be worth to you?', next: { days: 1, note: 'Send {name} the numbers they asked for' } },
    { id: 'info', group: 'objection', title: '"Send me some information"', means: 'Often a polite way to end the call. Sometimes real. Find out which, and book the next step before you hang up.',
      reply: { default: `Happy to. So I send the right thing, what would you most want to see: how the repayment works, what it costs, or how others use it? And can we put 15 minutes in the diary for Thursday so I can answer anything it raises?` },
      ask: 'What would you most want to see?', next: { hours: 2, note: 'Send {name} the information they asked for' } },
    { id: 'not-now', group: 'objection', title: '"Not a good time"', means: 'Usually priority, not time. Separate the two, and ask when they pictured starting.',
      reply: { yalo: `Understood. Most finance teams are busiest around a renewal, and that is exactly when the upfront payment hurts most. When is your next renewal due? If it is a few months away, let us look at it now so you are not deciding in a rush.`,
        clearpath: `No problem. When do you next have a big video or live stream coming up? We can set it up so the QR is ready for that one, and it takes very little of your time.` },
      ask: 'When is your next renewal / next big video?', next: { days: 30, note: 'Check back with {name} before their renewal or next video' } },
    { id: 'board', group: 'objection', title: '"I need to talk to my board / partner / team"', means: 'Either real, or a smokescreen. Ask who else decides and what they would push back on.',
      reply: { default: `That makes sense. Who else is involved, and what do you think they would push back on? If it helps, I can join a short call with them, or send you a one-page summary written for them. Do you need their approval, or just their support?` },
      ask: 'Who else is involved and what would they push back on?', next: { days: 2, note: 'Send {name} the summary for their board or partner and offer a joint call' } },
    { id: 'already', group: 'objection', title: '"We already have a bank / provider / tool"', means: 'They have a solution. The question is whether it fully solves the problem, not whether you are better.',
      reply: { yalo: `That is good to hear, most of our clients did too. We usually sit next to the bank, not instead of it. Out of curiosity, does your bank pay the landlord in full upfront and let you repay monthly without collateral?`,
        clearpath: `Good, that means you already care about capturing leads. What do you like about it, and what is one thing you wish it did? Clearpath QR is built for the moment a viewer is watching, so I would love to know whether that gap matters to you.` },
      ask: 'What do you like about it, and what do you wish it did?', next: { days: 14, note: 'Follow up with {name} with one specific difference' } },
    { id: 'need', group: 'objection', title: '"We do not need it" / "Our cash is fine"', means: 'They do not feel the pain yet. Do not argue. Ask what the money would do if it were free.',
      reply: { yalo: `That is a good position to be in. If that rent money were not tied up for twelve months, what is one thing you would do with it in the business? That is usually the real cost of paying upfront.`,
        clearpath: `Fair enough. If you could see exactly who watched and wanted more, would that change what you make or sell next? If not, I will not push.` },
      ask: 'What would you do with that money / those leads?', next: { days: 30, note: 'Check back with {name} with a new angle' } },
    { id: 'trust', group: 'objection', title: '"How do I know you are legitimate?"', means: 'A fair worry. Answer with facts they can check, and offer to let them verify.',
      reply: { default: `Good thing to check. {proof} I am happy to share references you can call, or send our company details so you can verify them. What would you need to see to feel comfortable?` },
      ask: 'What would you need to see to feel comfortable?', next: { days: 1, note: 'Send {name} references and company details' } },
    { id: 'catch', group: 'objection', title: '"What is the catch?" / "Sounds too good to be true"', means: 'They want the downside spelled out. Give it honestly.',
      reply: { yalo: `Good question. The honest answer: you are paying for the convenience of spreading the rent, so the total is a little more than a single upfront payment, and in return your cash stays in the business. Whether that is worth it depends on what the cash earns for you. Shall we work through your numbers?`,
        clearpath: `Fair. {offer} The honest limit: it only helps if you put the QR where people will see it. Shall I show you how a creator would place it in a video?` },
      ask: 'Shall we work it through with your numbers?', next: { days: 1, note: 'Walk {name} through the numbers' } },
    { id: 'guarantee', group: 'objection', title: '"What if it does not work for us?"', means: 'They want risk removed. Only offer what you truly stand behind.',
      reply: { default: `Fair. {guarantee} What would you need to see in the first month to know it was working?` },
      ask: 'What would you need to see in the first month?', next: { days: 2, note: 'Send {name} what to expect in the first 30 days' } },
    { id: 'staff-uptake', group: 'objection', title: '"Will my staff actually use it?"', means: 'They worry about launching a benefit nobody uses.',
      reply: { yalo: `Fair worry. Rent is something almost every employee pays every year, so the interest tends to be real. We handle the paperwork and the landlord, so it needs very little from HR. Would it help if we ran a short session for your staff so they can ask us directly?` },
      ask: 'Would a short staff session help?', next: { days: 3, note: 'Offer {name} a staff session date' } },
    { id: 'think', group: 'objection', title: '"I need to think about it"', means: 'Usually two layers deep, which is progress. Find the real concern.',
      reply: { default: `Of course. What are the main things you are weighing? And if everything lined up, would you want to go ahead?` },
      ask: 'What are you weighing, and what would make it a yes?', next: { days: 3, note: 'Follow up with {name}, ask what they decided' } },
    { id: 'viewers', group: 'objection', title: '"My viewers will not scan it"', means: 'They doubt it will work for their audience. Make it small and testable.',
      reply: { clearpath: `Possible, and the only way to know is to test. Put the QR on screen once, with a clear reason to scan, and see what you capture. Which of your videos gets the most views? We could start there.` },
      ask: 'Which video gets the most views?', next: { days: 2, note: 'Help {name} place a QR on one video' } },
    // ---- rejections ----
    { id: 'not-interested', group: 'rejection', title: '"Not interested"', means: 'A real no, or a reflex. Respect it, learn one thing, leave the door open.',
      reply: { default: `Understood, thank you for telling me straight. Before I go, was it the timing, or is this just not relevant for you? Either answer helps me. I will not chase you.` },
      ask: 'Was it timing or relevance?', next: { days: 120, note: 'Light check-in with {name} (said no earlier). Add something new.' } },
    { id: 'wrong-person', group: 'rejection', title: '"I am not the right person"', means: 'Ask for the right person while you have their attention.',
      reply: { default: `Thank you, that helps. Who would be the right person for this at your company? If you are comfortable, could you introduce us, or may I mention your name?` },
      ask: 'Who is the right person?', next: { days: 1, note: 'Contact the person {name} referred us to' } },
    { id: 'remove', group: 'rejection', title: '"Remove me" / "Stop emailing"', means: 'Stop immediately. Mark them do-not-contact. Do not send another follow-up.',
      reply: { default: `Done. I have removed you and you will not hear from me again. Sorry for the interruption.` },
      ask: '', next: null, dnc: true },
    { id: 'ghosted', group: 'rejection', title: 'No reply after several touches', means: 'They are busy or not interested. A short, human close-the-loop gets surprising replies.',
      reply: { default: `I have reached out a few times, so I will stop here. If this becomes relevant, reply "later" and I will check back in a few months. Wishing you well either way.` },
      ask: '', next: { days: 90, note: 'Pulse check with {name}: a new reason to talk' } },
    { id: 'no-show', group: 'rejection', title: 'They missed the meeting', means: 'Life happens. Make it easy to rebook, do not scold.',
      reply: { default: `No worries, I know how busy it gets. Here are two times that work for me: tomorrow at 10:00 or Thursday at 15:00. Would either suit you?` },
      ask: 'Would either time suit you?', next: { days: 1, note: 'Rebook {name}' } }
  ];
  function objectionReply(o, brand, profile) {
    const raw = (o.reply && (o.reply[brand] || o.reply.default)) || '';
    const proof = arr(profile && profile.proof);
    return raw.replace(/\{terms\}/g, clean(profile && profile.terms) || 'the terms depend on your situation, so I would rather show you real numbers')
      .replace(/\{offer\}/g, clean(profile && profile.offer))
      .replace(/\{proof\}/g, proof.length ? proof.slice(0, 2).join(' ') : '')
      .replace(/\{guarantee\}/g, clean(profile && profile.guarantee) || 'I will be straight about what we can and cannot promise.')
      .replace(/\s{2,}/g, ' ').trim();
  }
  const objectionsFor = (brand, group) => OBJECTIONS.filter(o => (!group || o.group === group) && (!o.reply || o.reply[brand] || o.reply.default));

  /* ================================================================== call outcomes -> stage + follow-up tasks */
  const OUTCOMES = [
    { id: 'no_answer', label: 'No answer', icon: '📵', callOnly: true, tasks: [{ days: 1, note: 'Call {name} again' }] },
    { id: 'voicemail', label: 'Left voicemail', icon: '📨', callOnly: true, tasks: [{ days: 2, note: 'Follow up {name} on the voicemail with a short message' }] },
    { id: 'interested', label: 'Interested', icon: '🔥', stage: 'Replied', tasks: [{ days: 1, note: 'Book a meeting with {name}' }] },
    { id: 'send_info', label: 'Wants information', icon: '📄', stage: 'Replied', tasks: [{ hours: 2, note: 'Send {name} the information they asked for' }, { days: 3, note: 'Check {name} saw it and ask for 15 minutes' }] },
    { id: 'meeting', label: 'Meeting booked', icon: '📅', stage: 'Meeting Set', needsDate: true, tasks: [{ beforeMeetingH: 24, note: 'Confirm the meeting with {name}' }, { beforeMeetingH: 1, note: 'Prepare for the meeting with {name}' }] },
    { id: 'not_now', label: 'Not now', icon: '⏳', pause: true, tasks: [{ days: 90, note: 'Check back with {name} (said not now)' }] },
    { id: 'wrong_person', label: 'Wrong person', icon: '↪️', tasks: [{ days: 1, note: 'Ask {name} who the right person is, then contact them' }] },
    { id: 'not_interested', label: 'Not interested', icon: '🚫', stage: 'Lost', loss: 'Not interested', tasks: [{ days: 120, note: 'Light check-in with {name} (said no earlier)' }] },
    { id: 'dnc', label: "Don't contact me", icon: '⛔', stage: 'Lost', loss: 'Asked not to be contacted', dnc: true, tasks: [] },
    { id: 'ooo', label: 'Out of office', icon: '🏝️', replyOnly: true, pause: true, tasks: [{ days: 7, note: 'Follow up {name}, they were out of office' }] }
  ];
  const STAGE_ORDER = ['New', 'Contacted', 'Replied', 'Meeting Set', 'Proposal Sent', 'Closed', 'Lost'];
  // Applies an outcome to the lead object (mutates it) and returns the tasks and activity text to save.
  function applyOutcome(lead, ci, outcomeId, now, opts) {
    opts = opts || {}; now = now || new Date();
    const o = OUTCOMES.find(x => x.id === outcomeId);
    if (!o) return null;
    const c = (lead.contacts || [])[ci] || {};
    const name = clean(c.name) || clean(lead.company) || 'this lead';
    const res = { outcome: o, stageChanged: null, tasks: [], dnc: false, paused: false, activity: `${opts.via === 'email' ? 'Reply from' : 'Call with'} ${name}: ${o.label.toLowerCase()}` };
    if (o.stage) {
      const cur = STAGE_ORDER.indexOf(lead.stage), nxt = STAGE_ORDER.indexOf(o.stage);
      if (o.stage === 'Lost' || nxt > cur) { res.stageChanged = [lead.stage, o.stage]; lead.stage = o.stage; if (o.loss) lead.lossReason = o.loss; }
    }
    if (!lead.contactedAt) lead.contactedAt = new Date(now).toISOString();
    if (o.dnc && YO.setDnc(lead, ci, true, now)) res.dnc = true;
    if (o.pause && YO.setPaused(lead, ci, true)) res.paused = true;
    for (const t of o.tasks) {
      let when;
      if (t.beforeMeetingH != null) {
        if (!opts.meetingAt) continue;
        when = new Date(new Date(opts.meetingAt).getTime() - t.beforeMeetingH * HOUR);
        if (when < now) continue;
      } else when = new Date(now.getTime() + (t.days != null ? t.days * DAY : 0) + (t.hours != null ? t.hours * HOUR : 0));
      res.tasks.push({ when: when.toISOString(), note: t.note.replace(/\{name\}/g, name) });
    }
    if (o.needsDate && opts.meetingAt) res.activity += ` for ${new Date(opts.meetingAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
    return res;
  }
  // Creates the task for an objection/rejection outcome (used by the objection helper).
  function taskForObjection(o, lead, ci, now) {
    if (!o || !o.next) return null;
    const c = (lead.contacts || [])[ci] || {};
    const name = clean(c.name) || clean(lead.company);
    const ms = (o.next.days || 0) * DAY + (o.next.hours || 0) * HOUR;
    return { when: new Date((now || new Date()).getTime() + ms).toISOString(), note: o.next.note.replace(/\{name\}/g, name) };
  }

  /* ================================================================== lead score ("do this next") */
  const daysSince = (iso, now) => iso ? Math.floor((now - new Date(iso)) / DAY) : null;
  function lastTouch(lead, acts) {
    const a = acts.filter(x => x.leadId === lead.id && x.type !== 'lead').map(x => x.ts).sort().pop();
    return a || lead.contactedAt || null;
  }
  // Returns { score, reasons[], action, ... } or null if the lead should not be worked.
  function scoreLead(lead, ctx) {
    ctx = ctx || {}; const now = ctx.now || new Date(), acts = ctx.activities || [];
    if (!lead || lead._deleted || ['Closed', 'Lost'].includes(lead.stage)) return null;
    const c = (lead.contacts || [])[0] || {};
    if (lead.contacts && lead.contacts.length && lead.contacts.every(x => x.dnc)) return null;
    let score = 0; const reasons = []; let action = 'review';
    const title = clean(c.title);
    if (OWNERS_RE.test(title)) { score += 20; reasons.push(`${title}: decision maker`); }
    else if (PEOPLE_RE.test(title)) { score += 12; }
    const val = Number(lead.value) || 0;
    if (val > 0) { score += Math.min(15, Math.round(Math.log10(val + 1) * 2)); if (val >= 1e6) reasons.push(`Deal worth ${YO.fmtLease(val) ? 'N' + YO.fmtLease(val) : val}`); }
    const stagePts = { New: 5, Contacted: 12, Replied: 32, 'Meeting Set': 36, 'Proposal Sent': 40 }[lead.stage] || 0;
    score += stagePts;
    const q = ctx.queue || [];
    const mine = q.filter(x => x.lead.id === lead.id && !x.noEmail);
    const od = mine.find(x => x.when === 'overdue'), td = mine.find(x => x.when === 'today');
    if (lead.stage === 'Replied') { score += 25; reasons.push('Replied, waiting for your answer'); action = 'reply'; }
    if (od) { score += 20; reasons.push(`Step ${od.idx + 1} is ${Math.max(1, Math.round((now - od.due) / DAY))}d overdue`); if (action === 'review') action = 'send'; }
    else if (td) { score += 15; reasons.push(`Step ${td.idx + 1} is due today`); if (action === 'review') action = 'send'; }
    const dueTasks = (ctx.reminders || []).filter(r => r.leadId === lead.id && !r.done && new Date(r.when) <= now);
    if (dueTasks.length) { score += 18; reasons.push(`Task due: ${dueTasks[0].note}`); if (action === 'review') action = 'call'; }
    const last = lastTouch(lead, acts), quiet = daysSince(last, now);
    if (['Contacted', 'Replied', 'Meeting Set', 'Proposal Sent'].includes(lead.stage) && quiet != null && quiet >= 7) {
      score += Math.min(15, quiet); reasons.push(`No contact for ${quiet} days`); if (action === 'review') action = 'call';
    }
    if (lead.stage === 'New' && !last) { score += 6; reasons.push('Never contacted'); if (c.phone && action === 'review') action = 'call'; }
    if (lead.stage === 'Meeting Set') { reasons.push('Meeting set: prepare and confirm'); action = action === 'review' ? 'prep' : action; }
    if (!reasons.length) reasons.push('In your pipeline');
    return { lead, score: Math.round(score), reasons, action, ci: 0 };
  }
  function nextActions(leads, ctx, limit) {
    const q = ctx.queue || YO.buildQueue(leads.filter(l => !l._deleted), ctx.now);
    const c2 = Object.assign({}, ctx, { queue: q });
    return leads.map(l => scoreLead(l, c2)).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit || 5);
  }
  const ACTION_LABEL = { reply: 'Reply', send: 'Send email', call: 'Call', prep: 'Prepare', review: 'Review' };

  /* ================================================================== forecast */
  const DEFAULT_WEIGHTS = { New: 0.05, Contacted: 0.1, Replied: 0.25, 'Meeting Set': 0.5, 'Proposal Sent': 0.7, Closed: 1, Lost: 0 };
  function forecast(leads, activities, now, weights) {
    now = now || new Date(); const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
    const live = leads.filter(l => l && !l._deleted);
    const open = live.filter(l => !['Closed', 'Lost'].includes(l.stage));
    const closed = live.filter(l => l.stage === 'Closed'), lost = live.filter(l => l.stage === 'Lost');
    const sum = a => a.reduce((s, l) => s + (Number(l.value) || 0), 0);
    const byStage = {};
    STAGE_ORDER.forEach(s => { const ls = live.filter(l => l.stage === s); byStage[s] = { count: ls.length, value: sum(ls), weighted: Math.round(sum(ls) * (w[s] || 0)) }; });
    const weighted = open.reduce((s, l) => s + (Number(l.value) || 0) * (w[l.stage] || 0), 0);
    // time in stage and time to close from the stage-change entries in the activity log
    const changes = {};
    (activities || []).filter(a => a.type === 'status' && /Stage: (.+) -> (.+)/.test(a.desc || '')).forEach(a => { (changes[a.leadId] = changes[a.leadId] || []).push(a); });
    const stuck = open.map(l => {
      const last = lastTouch(l, activities || []);
      const quiet = daysSince(last, now);
      return { lead: l, quiet: quiet == null ? daysSince(l.createdAt, now) : quiet };
    }).filter(x => x.quiet >= 14 && ['Contacted', 'Replied', 'Meeting Set', 'Proposal Sent'].includes(x.lead.stage)).sort((a, b) => b.quiet - a.quiet);
    const decided = closed.length + lost.length;
    const days = closed.map(l => { const ch = (changes[l.id] || []).filter(a => /-> Closed/.test(a.desc)).map(a => a.ts).sort().pop(); return ch && l.createdAt ? (new Date(ch) - new Date(l.createdAt)) / DAY : null; }).filter(x => x != null);
    return {
      weighted: Math.round(weighted), openValue: sum(open), openCount: open.length, closedValue: sum(closed), closedCount: closed.length, lostCount: lost.length,
      winRate: decided ? closed.length / decided : null, avgDeal: closed.length ? Math.round(sum(closed) / closed.length) : null,
      avgDaysToClose: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null, byStage, stuck, weights: w
    };
  }

  /* ================================================================== human-writing filter (from ig-human) */
  // zero-width and other invisible characters that a keyboard never produces (built from char codes)
  const INVIS = new RegExp('[' + [0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD, 0x180E, 0x2028, 0x2029].map(c => String.fromCharCode(c)).join('') + ']', 'g');
  function humanize(text) {
    let s = String(text == null ? '' : text); let changes = 0;
    const before = s;
    s = s.replace(INVIS, ''); s = s.replace(/[   ]/g, ' ');
    const urls = []; s = s.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g, m => { urls.push(m); return '\u0000' + (urls.length - 1) + '\u0000'; });
    (LEX.typo || []).forEach(([from, to]) => { s = s.split(from).join(to); });
    s = s.replace(/…/g, '...').replace(/•/g, '-');
    (LEX.words || []).forEach(([find, rep]) => {
      const re = new RegExp('(^|[^A-Za-z])(' + find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'gi');
      s = s.replace(re, (m, pre, hit) => { const r = hit[0] === hit[0].toUpperCase() && hit[0] !== hit[0].toLowerCase() && rep ? rep[0].toUpperCase() + rep.slice(1) : rep; return pre + r; });
    });
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => urls[+i]);
    s = s.replace(/[ \t]+,/g, ',').replace(/,\s*,/g, ',').replace(/,\s*([.!?])/g, '$1').replace(/ {2,}/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/^[ ,]+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (s !== before) changes = 1;
    const flags = [];
    (LEX.structures || []).forEach(st => { try { if (new RegExp(st.rx, st.flags || '').test(s)) flags.push({ id: st.id, name: st.name, fix: st.fix }); } catch (e) { /* skip */ } });
    return { text: s, changed: changes === 1, flags };
  }


  /* ================================================================== custom sequences (template editor) */
  const BASE_SEQUENCES = JSON.parse(JSON.stringify(SEQUENCES));
  const CHANNELS = ['email', 'dm', 'comment'];
  let CUSTOM = {};
  const TOKENS = [
    ['first_name', 'Their first name'], ['company', 'Their company'], ['title', 'Their job title'], ['hook', 'What they did / why now'],
    ['proof', 'First proof fact'], ['proof2', 'Second proof fact'], ['offer', 'Your offer'], ['lease_phrase', 'Rent amount or "a large sum"'],
    ['marketplace', 'Marketplace line'], ['sender_name', 'Your name'], ['sender_title', 'Your title'], ['sender_company', 'Your company'], ['brand', 'Company name']
  ];
  const TOKEN_SET = new Set(TOKENS.map(x => x[0]));
  const stepText = (v, max) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
  function sanitizeSequence(seq, brand) {
    const steps = arr(seq && seq.steps).slice(0, 12).map((s, i) => ({
      day: Math.max(0, Math.min(365, parseInt(s && s.day, 10) || 0)), channel: CHANNELS.includes(s && s.channel) ? s.channel : 'email',
      label: clean(s && s.label, 80) || ('Step ' + (i + 1)), subject: clean(s && s.subject, 200), body: stepText(s && s.body, 4000).trim()
    }));
    const out = { brand: BRAND_IDS.includes(seq && seq.brand) ? seq.brand : (brand || 'yalo'), name: clean(seq && seq.name, 80) || 'My sequence', audience: clean(seq && seq.audience, 120), steps };
    if (seq && seq.base) out.base = String(seq.base).slice(0, 60);      // Firestore rejects undefined values, so only set it when there is one
    return out;
  }
  function validateSequence(seq) {
    const errs = [];
    if (!seq.steps.length) errs.push('Add at least one step.');
    seq.steps.forEach((s, i) => {
      if (!s.body) errs.push(`Step ${i + 1} has no message.`);
      if (s.channel === 'email' && !s.subject) errs.push(`Step ${i + 1} is an email and needs a subject.`);
      if (i && s.day < seq.steps[i - 1].day) errs.push(`Step ${i + 1} comes before step ${i} (check the day numbers).`);
    });
    return errs;
  }
  // custom = { id: sequence }. Built-in ids are overridden when present; other ids are new sequences. Mutates SEQUENCES in place.
  function setCustomSequences(custom) {
    CUSTOM = {};
    Object.keys(SEQUENCES).forEach(k => delete SEQUENCES[k]);
    Object.keys(BASE_SEQUENCES).forEach(k => { SEQUENCES[k] = JSON.parse(JSON.stringify(BASE_SEQUENCES[k])); });
    Object.keys(custom || {}).forEach(id => {
      if (!/^[a-z0-9-]{3,60}$/.test(id)) return;
      const s = sanitizeSequence(custom[id], (BASE_SEQUENCES[id] || {}).brand);
      if (validateSequence(s).length) return;
      CUSTOM[id] = s; SEQUENCES[id] = Object.assign({}, s, { custom: true });
    });
    return Object.keys(CUSTOM);
  }
  const isBuiltIn = id => !!BASE_SEQUENCES[id];
  const isEdited = id => !!CUSTOM[id];
  const baseSequence = id => BASE_SEQUENCES[id] ? JSON.parse(JSON.stringify(BASE_SEQUENCES[id])) : null;
  function newSequenceId(brand, existing) { let i = Date.now().toString(36); while ((existing || SEQUENCES)[`custom-${brand}-${i}`]) i += 'x'; return `custom-${brand}-${i}`; }

  function slopHits(text) {
    const hits = [];
    (LEX.words || []).forEach(([find]) => { if (new RegExp('(^|[^A-Za-z])' + find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z])', 'i').test(text)) hits.push(find); });
    return hits;
  }
  /* Playbook checks shown next to every step in the editor. */
  function lintStep(step, idx) {
    const out = [], text = (step.subject ? step.subject + '\n' : '') + step.body, body = step.body || '';
    const add = (ok, good, bad) => out.push({ ok, text: ok ? good : bad });
    const sentences = body.split(/(?<=[.?!])\s+/).filter(x => x.trim()).length, links = (body.match(/https?:\/\/|www\./gi) || []).length;
    const asks = (body.match(/\?/g) || []).length;
    if (step.channel === 'email') {
      add(!!step.subject && step.subject.length <= 70 && !/^re:/i.test(step.subject), 'Subject is short and honest', 'Subject is missing, too long, or looks like a fake reply');
      add(sentences <= 7 && body.length <= 750, 'Short enough to read in seconds', `Too long (${sentences} sentences). Aim for 3 to 6`);
      add(asks >= 1 || /\b(reply|okay if|what does your availability)/i.test(body), 'Has one easy ask', 'No clear ask. End with something they can answer in a few words');
      add(asks <= 2, 'Only one main question', 'More than two questions. Keep one ask');
      add(idx === 0 ? links === 0 : links <= 1, idx === 0 ? 'No links in the first email' : 'Links kept to a minimum', idx === 0 ? 'Remove links from the first email (they hurt delivery)' : 'Too many links');
    } else if (step.channel === 'dm') {
      add(body.length <= 480 && sentences <= 5, 'Short enough for a DM', 'Too long for a DM. Aim for 2 to 4 sentences');
      add(links === 0, 'No link in the message', 'Remove the link. DMs with links read like a funnel');
      add(asks >= 1, 'Has one small ask', 'No question. End with one small ask');
    } else {
      add(links === 0, 'No link', 'Remove the link from a comment');
      add(!/\b(buy|discount|offer|sign up|dm me)\b/i.test(body), 'No pitch in a public comment', 'This reads like a pitch. Public comments should add value only');
    }
    add(!/[—–]/.test(text), 'No long dashes', 'Replace long dashes with commas or full stops');
    const h = humanize(text), slop = slopHits(text);
    add(!slop.length, 'No stock AI phrases', 'Machine-written wording: ' + slop.slice(0, 4).join(', ') + '. Use plainer words');
    add(!h.flags.length, 'No stiff patterns', 'Stiff pattern: ' + h.flags.map(f => f.name).join('; '));
    const unknown = (text.match(/\{([a-z_0-9]+)\}/g) || []).map(x => x.slice(1, -1)).filter(x => !TOKEN_SET.has(x));
    add(!unknown.length, 'All placeholders are known', 'Unknown placeholder: ' + unknown.map(x => '{' + x + '}').join(', '));
    if (step.channel !== 'comment') add(/\{first_name\}|\[FNAME\]/.test(text), 'Uses their name', 'Add {first_name} so it reads personally');
    return out;
  }
  function sampleFor(brandId, profile) {
    return brandId === 'clearpath'
      ? { lead: { id: 'sample', company: 'Tech Tom', brand: 'clearpath', hook: 'how he edits in one hour', contacts: [{ name: 'Tom Ray', title: 'Creator', email: 'tom@example.com' }], stage: 'New' } }
      : { lead: { id: 'sample', company: 'Acme Ltd', brand: 'yalo', lease: 12000000, contacts: [{ name: 'Jane Doe', title: 'CFO', email: 'jane@example.com' }], stage: 'New' } };
  }
  function renderSample(step, brandId, profile, sender) {
    const s = sampleFor(brandId, profile).lead; const type = '__preview';
    const tf = () => [step];
    s.contacts[0].seq = { active: true, startedAt: new Date().toISOString(), type, steps: [{ status: 'draft' }] };
    return YO.renderStep(s, 0, 0, tf, { brand: profile, sender });
  }

  /* ================================================================== what is working (reply rate per step) */
  function seqStats(leads) {
    const out = {};
    const get = id => out[id] = out[id] || { sent: 0, replied: 0, steps: [] };
    for (const lead of leads) {
      if (!lead || lead._deleted) continue;
      const n = Math.max((lead.contacts || []).length, 1);
      for (let ci = 0; ci < n; ci++) {
        const c = (lead.contacts || [])[ci];
        let steps, type;
        if (c && c.seq) { steps = c.seq.steps; type = c.seq.type || autoSeqType(lead, c); }
        else if (ci === 0 && Array.isArray(lead.emails) && lead.emails.some(e => e && ['sent', 'opened', 'replied'].includes(e.status))) { steps = lead.emails; type = lead.seqType || YO.autoType(lead); }
        else continue;
        const o = get(type);
        steps.forEach((s, i) => {
          const st = (o.steps[i] = o.steps[i] || { sent: 0, replied: 0 });
          if (s && ['sent', 'opened', 'replied'].includes(s.status)) { o.sent++; st.sent++; }
          if (s && s.status === 'replied') { o.replied++; st.replied++; }
        });
      }
    }
    return out;
  }

  /* ================================================================== daily sending plan (cold outreach, spaced through the day) */
  const DEFAULT_PLAN = { target: 100, split: [30, 30, 30, 10], times: ['09:00', '11:30', '14:00', '16:30'], mailboxes: [], capPerMailbox: 25, minGapMin: 2, skipRamp: false, overrideCap: false };
  function planConfig(s) {
    const p = Object.assign({}, DEFAULT_PLAN, (s && s.plan) || {});
    p.mailboxes = arr(p.mailboxes).map(x => clean(x, 120).toLowerCase()).filter(x => YO.normEmail(x));
    p.split = arr(p.split).length === 4 ? p.split.map(x => Math.max(0, Number(x) || 0)) : DEFAULT_PLAN.split.slice();
    p.times = arr(p.times).length === 4 ? p.times.map(x => /^\d{1,2}:\d{2}$/.test(x) ? x : '09:00') : DEFAULT_PLAN.times.slice();
    p.target = Math.max(1, Math.min(500, parseInt(p.target, 10) || 100)); p.capPerMailbox = Math.max(5, Math.min(60, parseInt(p.capPerMailbox, 10) || 25));
    p.minGapMin = Math.max(0, Math.min(30, Number(p.minGapMin))); if (isNaN(p.minGapMin)) p.minGapMin = 2;
    return p;
  }
  const isColdSend = a => a && a.type === 'email' && /^Sent email /.test(a.desc || '');
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const sentOn = (acts, day) => (acts || []).filter(a => isColdSend(a) && a.ts && sameDay(a.ts, day));
  // Warm-up (playbook): about 10 a day per mailbox at the start, rising by 5 each week to the cap.
  function rampCap(cfg, acts, now) {
    if (cfg.skipRamp) return cfg.capPerMailbox;
    const first = (acts || []).filter(isColdSend).map(a => a.ts).sort()[0];
    const weeks = first ? Math.floor((now - new Date(first)) / (7 * DAY)) : 0;
    return Math.min(cfg.capPerMailbox, 10 + 5 * weeks);
  }
  function splitTarget(split, target) {
    const sum = split.reduce((a, b) => a + b, 0) || 1; const raw = split.map(x => x * target / sum);
    const out = raw.map(Math.floor); let rest = target - out.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { out[i]++; rest--; } });
    return out;
  }
  const minutesOf = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  function planStatus(cfg, acts, queue, now) {
    now = now || new Date();
    const boxes = cfg.mailboxes.length || 1;
    const perBox = rampCap(cfg, acts, now), safe = boxes * perBox;
    const target = cfg.overrideCap ? cfg.target : Math.min(cfg.target, safe);
    const parts = splitTarget(cfg.split, target);
    const mins = now.getHours() * 60 + now.getMinutes();
    let cum = 0;
    const batches = parts.map((n, i) => { const start = minutesOf(cfg.times[i]); cum += n; return { time: cfg.times[i], target: n, cum, started: mins >= start }; });
    const sentTodayList = sentOn(acts, now), sent = sentTodayList.length;
    const releasedCum = batches.filter(b => b.started).reduce((a, b) => Math.max(a, b.cum), 0);
    let current = -1; batches.forEach((b, i) => { if (b.started) current = i; });
    const sendable = (queue || []).filter(q => q.when !== 'upcoming' && !q.noEmail);
    const perMailbox = cfg.mailboxes.length ? cfg.mailboxes.map(m => ({ email: m, sent: sentTodayList.filter(a => a.mailbox === m).length, cap: perBox })) : [{ email: '', sent, cap: perBox }];
    const warnings = [];
    if (!cfg.overrideCap && cfg.target > safe) warnings.push(`Your target is ${cfg.target} a day, but ${boxes} mailbox${boxes > 1 ? 'es are' : ' is'} only safe for about ${safe} a day right now (${perBox} each). Today's plan is ${target}. You can override this in Settings, but spam folders and blocked addresses are the usual result.`);
    if (cfg.overrideCap && cfg.target > safe) warnings.push(`Over the safe limit: ${cfg.target} planned vs about ${safe} safe. Watch for bounces and spam placement.`);
    if (!cfg.mailboxes.length) warnings.push('Add your sending mailboxes in Settings so emails alternate between them and each person always hears from the same address.');
    perMailbox.forEach(m => { if (m.sent >= m.cap) warnings.push(`${m.email || 'Your mailbox'} has reached its limit for today (${m.cap}).`); });
    const available = sendable.length, dueNow = Math.max(0, Math.min(releasedCum, target) - sent);
    const remaining = Math.max(0, target - sent);
    if (available < remaining) warnings.push(`Only ${available} email${available === 1 ? ' is' : 's are'} ready, and the plan wants ${remaining} more. Import about ${remaining - available} more people (or start more sequences) to fill it.`);
    return { target, rawTarget: cfg.target, safe, perBox, sent, batches, current, dueNow: Math.min(dueNow, available), releasedCum, available, remaining, perMailbox, warnings, nextBatch: batches.find(b => !b.started) || null, done: sent >= target };
  }
  // Each person is always emailed from the same mailbox: pick the one with the fewest people so far.
  function mailboxPicker(mailboxes, leads) {
    const counts = {}; mailboxes.forEach(m => { counts[m] = 0; });
    (leads || []).forEach(l => (l.contacts || []).forEach(c => { if (c && c.seq && c.seq.mailbox && counts[c.seq.mailbox] != null) counts[c.seq.mailbox]++; }));
    return function pick() {
      if (!mailboxes.length) return null;
      const m = mailboxes.slice().sort((a, b) => counts[a] - counts[b])[0]; counts[m]++; return m;
    };
  }

  /* ================================================================== tasks (reminders, grouped) */
  const taskIcon = note => /\bcall\b|ring|phone/i.test(note) ? '📞' : /\bsend|email|message|info/i.test(note) ? '✉️' : /\bmeeting|book|confirm|prepare|prep\b/i.test(note) ? '📅' : '✅';
  function taskBuckets(tasks, leadsById, now, brand) {
    now = now || new Date();
    const sod = new Date(now); sod.setHours(0, 0, 0, 0); const eod = new Date(now); eod.setHours(23, 59, 59, 999);
    const out = { overdue: [], today: [], upcoming: [], done: [] };
    (tasks || []).forEach(t => {
      const lead = leadsById[t.leadId];
      if (brand && brand !== 'all' && lead && brandOf(lead) !== brand) return;
      if (brand && brand !== 'all' && !lead && t.leadId) return;
      const when = new Date(t.when);
      const k = t.done ? 'done' : when < sod ? 'overdue' : when <= eod ? 'today' : 'upcoming';
      out[k].push(Object.assign({ lead }, t));
    });
    const asc = (a, b) => new Date(a.when) - new Date(b.when);
    out.overdue.sort(asc); out.today.sort(asc); out.upcoming.sort(asc); out.done.sort((a, b) => new Date(b.when) - new Date(a.when));
    return out;
  }

  /* ================================================================== screens (what to show) */
  const SCREENS = [
    { id: 'warplan', label: 'War Plan', note: 'Just a link to a Google Sheet.' },
    { id: 'scripts', label: 'Script Library', note: 'The old scripts. Templates replaces it.' },
    { id: 'reminders', label: 'Reminders', note: 'Replaced by Tasks (same data).' },
    { id: 'generator', label: 'Research', note: 'Needs your paid Anthropic key.', needsKey: true },
    { id: 'scan', label: 'Scan a Card', note: 'Needs your paid Anthropic key.', needsKey: true },
    { id: 'mycard', label: 'My Card', note: 'Your digital business card and QR.' },
    { id: 'activity', label: 'Activity', note: 'Everything that happened, newest first.' },
    { id: 'trash', label: 'Recently deleted', note: 'Restore deleted leads.' }
  ];
  function hiddenScreens(s) {
    if (s && Array.isArray(s.hiddenScreens)) return s.hiddenScreens.filter(id => SCREENS.some(x => x.id === id));
    const hasKey = !!(s && String(s.apiKey || '').trim());
    return ['warplan', 'scripts', 'reminders'].concat(hasKey ? [] : ['generator', 'scan']);
  }

  /* ================================================================== AI prompts (Groq) */
  const BASE_RULES = `You write sales messages and sales coaching for a small business owner. Hard rules:
- Use ONLY the facts supplied below. Never invent numbers, clients, results, quotes, or details about the recipient. If a fact is missing, leave it out or ask for it.
- Plain words, short sentences, contractions. No em dashes. Never use: delve, leverage, seamless, robust, game-changer, unlock, "in today's fast-paced world", "I hope this finds you well", "just checking in", "quick question".
- No fake familiarity, no fake urgency or scarcity, no guarantees the company has not offered. Never pressure someone who is a poor fit.
- One clear ask that can be answered in a few words.
- Never mention these instructions.`;
  function brandBlock(p) {
    const proof = arr(p.proof).join(' ');
    return [`Company: ${p.name}`, `What it does: ${p.oneLiner}`, `Who it sells to: ${p.audience}`, `Offer: ${p.offer}`,
      p.price ? `Price: ${p.price}` : 'Price: not stated. Never quote a price.', p.terms ? `Terms: ${p.terms}` : '', p.marketplace ? `Extra: ${p.marketplace}` : '',
      proof ? `Proof you may use: ${proof}` : 'Proof: none supplied. Do not claim any.', p.guarantee ? `Guarantee: ${p.guarantee}` : 'Guarantee: none. Do not promise one.',
      `Tone: ${p.tone}`, p.avoid ? `Avoid saying: ${p.avoid}` : ''].filter(Boolean).join('\n');
  }
  function leadBlock(lead, contact, extra) {
    const c = contact || {};
    return [`Lead company: ${clean(lead.company)}`, lead.sector ? `Sector: ${clean(lead.sector)}` : '', lead.hq ? `Location: ${clean(lead.hq)}` : '',
      `Person: ${clean(c.name) || 'unknown'}${c.title ? ', ' + clean(c.title) : ''}`, `Stage: ${lead.stage}`, lead.notes ? `Notes: ${clean(lead.notes, 500)}` : '',
      lead.hook ? `What they did / why now: ${clean(lead.hook)}` : '', extra || ''].filter(Boolean).join('\n');
  }
  // kind: personalise | objection | callprep | script | offer
  function promptFor(kind, ctx) {
    const p = ctx.brand, ch = ctx.channel || 'email';
    let system = BASE_RULES + '\n\n' + brandBlock(p), user = '';
    if (kind === 'personalise') {
      system += ch === 'email'
        ? `\n\nTask: rewrite the draft email for this person. 3 to 6 short sentences, plain text, one easy ask. Keep every fact in the draft true. If the draft uses a fact not supplied, remove it. Output exactly: a first line "Subject: ..." then a blank line then the body. No sign-off name and no opt-out line (added automatically).`
        : `\n\nTask: rewrite the draft ${ch === 'comment' ? 'YouTube comment' : 'direct message'} for this person. ${ch === 'comment' ? 'Under 30 words, no pitch, no link.' : '2 to 4 sentences, no link, reference the specific thing they did, give something useful before asking, one small ask.'} Output only the message.`;
      user = `${leadBlock(ctx.lead, ctx.contact)}\n\nSender: ${clean(ctx.sender && ctx.sender.name)}${ctx.sender && ctx.sender.title ? ', ' + clean(ctx.sender.title) : ''}\n\nDraft to rewrite:\n${ctx.draft}\n\n${ctx.instruction ? 'Extra instruction: ' + clean(ctx.instruction, 300) : ''}`;
    } else if (kind === 'template') {
      system += `\n\nTask: improve this sales template step for maximum replies while following the playbook. Keep every placeholder in curly braces exactly as written (for example {first_name}, {company}, {proof}). Do not add facts, numbers or claims that are not in the company profile. ${ch === 'email' ? '3 to 6 short sentences, one easy ask, plain text, no links.' : ch === 'dm' ? '2 to 4 sentences, no link, one small ask.' : 'Under 30 words, no pitch, no link.'} Output exactly: ${ch === 'email' ? 'a first line "Subject: ..." then a blank line then the body' : 'only the message'}. Then a blank line, the line "WHY:" and one short sentence on what you changed.`;
      user = `Audience: ${clean(ctx.audience, 200)}\nStep: ${clean(ctx.label, 80)} (${ch})\n${ctx.subject ? 'Subject: ' + clean(ctx.subject, 200) + '\n' : ''}Message:\n${ctx.draft}`;
    } else if (kind === 'objection') {
      system += `\n\nTask: help handle an objection or rejection using this method: Acknowledge what they said in your words, Associate it with something positive or with how others think about it, then Ask one question that moves forward. Never argue, never discount the price, never invent proof. Output exactly three parts:\nSPOKEN: (what to say on a call, under 60 words, ends with one question)\nWRITTEN: (the same reply as a short email or DM, under 70 words)\nNEXT STEP: (one concrete next action with a timeframe)`;
      user = `${leadBlock(ctx.lead, ctx.contact)}\n\nWhat they said: "${clean(ctx.objection, 400)}"${ctx.standard ? `\n\nOur standard reply (improve and tailor it, keep it true): ${ctx.standard}` : ''}`;
    } else if (kind === 'callprep') {
      system += `\n\nTask: a one-page call prep card for the seller. Use these headings: WHO THEY ARE, WHY CALL NOW, OPENING (Proof, Promise, Plan in about 20 seconds), FIVE DISCOVERY QUESTIONS (clarify why they are talking today, what they have tried, what staying stuck costs, who else decides, when they would start), LIKELY OBJECTION AND REPLY, THE ASK, BOOK THE NEXT STEP. Use only supplied facts. Mark anything unknown as "ask them".`;
      user = `${leadBlock(ctx.lead, ctx.contact, ctx.history ? 'Recent history:\n' + ctx.history : '')}`;
    } else if (kind === 'script') {
      system += `\n\nTask: a short call script of about 250 words with a natural opening, two discovery questions, a 30 second pitch built from the offer, the objection that is most likely for this audience with a calm reply, and a close that books the next meeting. Spoken language, not corporate.`;
      user = leadBlock(ctx.lead, ctx.contact);
    } else if (kind === 'offer') {
      system += `\n\nTask: build an offer using the Value Equation (dream outcome up, perceived likelihood up, time delay down, effort and sacrifice down). Output these headings: DREAM OUTCOME, PROBLEMS IN ORDER (8 to 12 the buyer meets), SOLUTION FOR EACH, WHAT TO TRIM, BONUSES (each kills one objection), GUARANTEE (only if one was supplied, otherwise say none and suggest a safe alternative such as a small first step), NAME (three options), VALUE EQUATION SCORES (1 to 10 for each of the four drivers, with the weakest first), ONE-LINE PITCH, FIVE THINGS TO CONFIRM. Real scarcity and urgency only. Flag every assumption.`;
      user = `Target buyer: ${clean(ctx.avatar, 300)}\nProblem they feel: ${clean(ctx.pain, 400)}\nWhat we sell: ${clean(ctx.product, 400)}\nWhat we can deliver and afford: ${clean(ctx.limits, 400)}`;
    }
    return { system, user: user.trim(), temperature: kind === 'offer' ? 0.7 : 0.5, max_tokens: kind === 'callprep' || kind === 'offer' ? 1100 : 700 };
  }
  // Clean model output before showing it: strip fences and quotes, run the human-writing filter.
  function cleanAi(text) {
    let s = String(text || '').replace(/^```[a-z]*\n?|```$/gm, '').trim();
    if (/^"[\s\S]*"$/.test(s) && s.indexOf('"', 1) === s.length - 1) s = s.slice(1, -1);
    return humanize(s);
  }
  async function groqChat(o, fetchImpl) {
    const f = fetchImpl || fetch;
    const res = await f('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + o.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: o.model || 'llama-3.3-70b-versatile', temperature: o.temperature, max_tokens: o.max_tokens, messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }] })
    });
    if (res.status === 401) throw new Error('Groq did not accept the key. Check it in Settings.');
    if (res.status === 429) throw new Error('Groq is rate limiting you. Wait a minute and try again.');
    if (res.status === 404 || res.status === 400) { let m = ''; try { m = (await res.json()).error.message; } catch (e) { /* ignore */ } throw new Error('Groq: ' + (m || 'request not accepted. Try another model in Settings.')); }
    if (!res.ok) throw new Error('Groq error ' + res.status);
    const j = await res.json();
    const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!t) throw new Error('Groq returned nothing. Try again.');
    return t;
  }
  async function groqModels(key, fetchImpl) {
    const f = fetchImpl || fetch;
    const res = await f('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } });
    if (res.status === 401) throw new Error('Groq did not accept the key.');
    if (!res.ok) throw new Error('Could not load models (' + res.status + ').');
    const j = await res.json();
    return (j.data || []).map(m => m.id).filter(id => !/whisper|guard|tts|embed|playai|distil-whisper/i.test(id)).sort();
  }

  return {
    DEFAULT_BRANDS, BRAND_IDS, BRAND_FIELDS, mergeBrands, brandOf, filterByBrand, missingFacts,
    SEQUENCES, seqIdsForBrand, autoSeqType, sequenceMeta, templatesFor, gapsOf, channelLabel,
    OBJECTIONS, objectionReply, objectionsFor, OUTCOMES, STAGE_ORDER, applyOutcome, taskForObjection,
    scoreLead, nextActions, ACTION_LABEL, DEFAULT_WEIGHTS, forecast, humanize, promptFor, cleanAi, groqChat, groqModels,
    CHANNELS, TOKENS, setCustomSequences, sanitizeSequence, validateSequence, isBuiltIn, isEdited, baseSequence, newSequenceId, lintStep, sampleFor, renderSample, seqStats,
    DEFAULT_PLAN, planConfig, rampCap, splitTarget, planStatus, mailboxPicker, sentOn, isColdSend, taskIcon, taskBuckets, SCREENS, hiddenScreens
  };
});
