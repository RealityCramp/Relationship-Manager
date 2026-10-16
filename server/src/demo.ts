/**
 * Deterministic demo data generator. Produces realistic export files for every supported
 * source (LinkedIn CSV, Facebook JSON, X archive, vCard, mbox) that overlap on purpose, so
 * de-duplication, categories and all visualisations have something interesting to show.
 * Used by `npm run seed`, the E2E suite and the training-video recorder.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Priya', 'Mateo', 'Sofia', 'Kenji', 'Amara', 'Lucas', 'Nia', 'Oscar', 'Leila', 'Felix', 'Hana', 'Diego', 'Ines', 'Theo', 'Chloe', 'Ravi', 'Elena', 'Jonas', 'Mila', 'Arjun', 'Freya', 'Omar', 'Yuki', 'Tomas', 'Ada', 'Grace', 'Marcus', 'Isla', 'Kofi', 'Beatriz', 'Henrik', 'Sana', 'Victor', 'Wren'];
const LAST = ['Nguyen', 'Okafor', 'Schmidt', 'Rossi', 'Tanaka', 'Fernandez', 'Patel', 'Larsen', 'Dubois', 'Kim', 'Walsh', 'Haddad', 'Moreau', 'Silva', 'Kowalski', 'Mensah', 'Ivanova', 'Brooks', 'Castillo', 'Lindqvist', 'Ahmed', 'Baker', 'Costa', 'Delgado', 'Eriksen', 'Fischer', 'Gupta', 'Hughes', 'Ibarra', 'Jensen'];
const COMPANIES = [
  { name: 'Northwind Labs', domain: 'northwindlabs.com' },
  { name: 'Lumen Analytics', domain: 'lumenanalytics.io' },
  { name: 'Harbor Health', domain: 'harborhealth.org' },
  { name: 'Aster Capital', domain: 'astercapital.com' },
  { name: 'Pixelforge Studio', domain: 'pixelforge.studio' },
  { name: 'Greenline Logistics', domain: 'greenline.co' },
  { name: 'Civic Bridge', domain: 'civicbridge.org' },
  { name: 'Quill & Ink Media', domain: 'quillink.media' },
  { name: 'Orbital Systems', domain: 'orbital.systems' },
  { name: 'Mesa University', domain: 'mesa.edu' },
];
const TITLES = ['Product Manager', 'Software Engineer', 'Head of Partnerships', 'Designer', 'Data Scientist', 'Founder', 'Account Executive', 'Marketing Lead', 'Operations Manager', 'Research Fellow', 'CTO', 'Recruiter', 'Analyst', 'Program Director'];
const CITIES = ['St. Louis, MO', 'Chicago, IL', 'Austin, TX', 'Seattle, WA', 'Denver, CO', 'New York, NY', 'London, UK', 'Berlin, DE', 'Toronto, CA', 'Lisbon, PT'];
const FREEMAIL = ['gmail.com', 'outlook.com', 'icloud.com', 'yahoo.com'];

export interface DemoPerson {
  first: string;
  last: string;
  company?: { name: string; domain: string };
  title?: string;
  city: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  inLinkedIn: boolean;
  inFacebook: boolean;
  inX: boolean;
  inContacts: boolean;
  inEmail: boolean;
  emailVolume: number;
  xHandle?: string;
}

export interface DemoDataset {
  self: { name: string; email: string; corporate: { name: string; domain: string } };
  people: DemoPerson[];
  files: { linkedin: string; facebook: string; xFollowers: string; xFollowing: string; xCsv: string; contacts: string; mbox: string };
}

export function generateDemo(seed = 42, count = 140): DemoDataset {
  const rand = rng(seed);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const self = { name: 'Jordan Reyes', email: 'jordan@northwindlabs.com', corporate: COMPANIES[0] };
  const people: DemoPerson[] = [];
  const used = new Set<string>();
  while (people.length < count) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const key = `${first} ${last}`;
    if (used.has(key)) continue;
    used.add(key);
    const r = rand();
    // ~22% colleagues at own company, ~55% at other companies, rest independent
    const company = r < 0.22 ? COMPANIES[0] : r < 0.77 ? pick(COMPANIES.slice(1)) : undefined;
    const slug = `${first}.${last}`.toLowerCase();
    const p: DemoPerson = {
      first,
      last,
      company,
      title: company ? pick(TITLES) : rand() < 0.4 ? pick(TITLES) : undefined,
      city: pick(CITIES),
      workEmail: company ? `${slug}@${company.domain}` : undefined,
      personalEmail: rand() < 0.65 ? `${slug}${Math.floor(rand() * 90)}@${pick(FREEMAIL)}` : undefined,
      phone: rand() < 0.5 ? `+1 314 555 ${String(1000 + Math.floor(rand() * 9000))}` : undefined,
      inLinkedIn: company ? rand() < 0.85 : rand() < 0.3,
      inFacebook: rand() < 0.45,
      inX: rand() < 0.35,
      inContacts: rand() < 0.5,
      inEmail: rand() < 0.55,
      emailVolume: Math.floor(rand() * rand() * 40),
      xHandle: `${first.toLowerCase()}_${last.toLowerCase()}`.slice(0, 15),
    };
    if (!p.inLinkedIn && !p.inFacebook && !p.inX && !p.inContacts && !p.inEmail) p.inContacts = true;
    people.push(p);
  }

  /* LinkedIn */
  const li = ['Notes:', '"When exporting your connection data, you may notice that some of the email addresses are missing."', '', 'First Name,Last Name,URL,Email Address,Company,Position,Connected On'];
  for (const p of people.filter((x) => x.inLinkedIn)) {
    const d = new Date(2017 + Math.floor(rand() * 9), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    li.push([p.first, p.last, `https://www.linkedin.com/in/${p.first.toLowerCase()}-${p.last.toLowerCase()}`, rand() < 0.5 ? (p.workEmail ?? '') : '', p.company?.name ?? '', p.title ?? '', date].map(csv).join(','));
  }

  /* Facebook */
  const fb = { friends_v2: people.filter((x) => x.inFacebook).map((p) => ({ name: `${p.first} ${p.last}`, timestamp: 1420000000 + Math.floor(rand() * 300000000) })) };

  /* X */
  const xp = people.filter((x) => x.inX);
  const xFollowers = `window.YTD.follower.part0 = ${JSON.stringify(
    xp.slice(0, Math.ceil(xp.length * 0.7)).map((p, i) => ({ follower: { accountId: String(100000 + i), userLink: `https://twitter.com/intent/user?user_id=${100000 + i}` } })),
    null,
    2,
  )}`;
  const xFollowing = `window.YTD.following.part0 = ${JSON.stringify(
    xp.slice(Math.floor(xp.length * 0.4)).map((p, i) => ({ following: { accountId: String(100000 + Math.floor(xp.length * 0.4) + i), userLink: `https://twitter.com/intent/user?user_id=${100000 + Math.floor(xp.length * 0.4) + i}` } })),
    null,
    2,
  )}`;
  const xCsv = ['id,username,name,location,description', ...xp.map((p, i) => [String(100000 + i), p.xHandle!, `${p.first} ${p.last}`, p.city, p.title ? `${p.title} · ${p.company?.name ?? 'independent'}` : 'Curious human'].map(csv).join(','))].join('\n');

  /* Contacts (vCard) */
  const vcf = people
    .filter((x) => x.inContacts)
    .map((p) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${p.last};${p.first};;;`,
        `FN:${p.first} ${p.last}`,
        p.company ? `ORG:${p.company.name}` : '',
        p.title ? `TITLE:${p.title}` : '',
        p.workEmail ? `EMAIL;TYPE=WORK:${p.workEmail}` : '',
        p.personalEmail ? `EMAIL;TYPE=HOME:${p.personalEmail}` : '',
        p.phone ? `TEL;TYPE=CELL:${p.phone}` : '',
        `ADR;TYPE=HOME:;;;${p.city.split(',')[0]};${p.city.split(',')[1]?.trim() ?? ''};;USA`,
        rand() < 0.3 ? 'CATEGORIES:Family' : rand() < 0.5 ? 'CATEGORIES:Clients' : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  /* mbox */
  const messages: string[] = [];
  let msgCounter = 1;
  const subjects = ['Quick question', 'Follow-up from our call', 'Intro', 'Proposal draft', 'Lunch next week?', 'Re: Q3 planning', 'Conference tickets', 'Thanks!', 'Board update', 'Invoice #4821', 'Design review', 'Hiring plan'];
  const fmt = (d: Date) => d.toUTCString().replace('GMT', '+0000');
  for (const p of people.filter((x) => x.inEmail)) {
    const email = p.workEmail ?? p.personalEmail ?? `${p.first}.${p.last}@gmail.com`.toLowerCase();
    const threads = 1 + Math.floor(p.emailVolume / 4);
    const bidirectional = rand() < 0.8;
    for (let t = 0; t < threads; t++) {
      const subject = pick(subjects);
      const start = new Date(Date.now() - Math.floor(rand() * 700) * 86400000);
      const rootId = `<${msgCounter++}.${seed}@demo.mail>`;
      const n = 1 + Math.floor(rand() * 4);
      let prevId = rootId;
      for (let i = 0; i < n; i++) {
        const d = new Date(start.getTime() + i * 3600000 * (1 + Math.floor(rand() * 48)));
        const out = bidirectional ? i % 2 === 1 : false;
        const id = i === 0 ? rootId : `<${msgCounter++}.${seed}@demo.mail>`;
        const cc = rand() < 0.2 ? people.filter((o) => o !== p && o.inEmail)[Math.floor(rand() * 10)] : undefined;
        messages.push(
          [
            `From ${out ? self.email : email} ${d.toUTCString()}`,
            `From: ${out ? `${self.name} <${self.email}>` : `${p.first} ${p.last} <${email}>`}`,
            `To: ${out ? `${p.first} ${p.last} <${email}>` : `${self.name} <${self.email}>`}`,
            cc ? `Cc: ${cc.first} ${cc.last} <${cc.workEmail ?? cc.personalEmail ?? `${cc.first}.${cc.last}@gmail.com`.toLowerCase()}>` : '',
            `Subject: ${i ? 'Re: ' : ''}${subject}`,
            `Date: ${fmt(d)}`,
            `Message-ID: ${id}`,
            i ? `In-Reply-To: ${prevId}` : '',
            i ? `References: ${rootId}` : '',
            'Content-Type: text/plain; charset=utf-8',
            '',
            `Hi, this is message ${i + 1} of ${n} in the "${subject}" thread.`,
            '',
          ]
            .filter((l) => l !== '')
            .join('\n') + '\n',
        );
        prevId = id;
      }
    }
  }

  return {
    self,
    people,
    files: {
      linkedin: li.join('\n') + '\n',
      facebook: JSON.stringify(fb, null, 2),
      xFollowers,
      xFollowing,
      xCsv,
      contacts: vcf + '\n',
      mbox: messages.join('\n'),
    },
  };
}

function csv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
