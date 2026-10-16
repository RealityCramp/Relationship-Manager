import { resolve } from 'node:path';
import type { Recorder } from './lib.ts';

export interface VideoScript {
  id: string;
  title: string;
  description: string;
  level: 'start' | 'core' | 'advanced';
  guide: string;
  /** Which account state the video expects: an empty workspace or the full demo. */
  dataset: 'empty' | 'demo';
  run: (rec: Recorder, ctx: VideoContext) => Promise<void>;
}

export interface VideoContext {
  email: string;
  password: string;
  fixtures: string;
  baseURL: string;
}

const fx = (dir: string, f: string) => resolve(dir, f);

export const VIDEOS: VideoScript[] = [
  {
    id: 'welcome-tour',
    title: 'Welcome tour',
    description: 'Sign in, meet the dashboard and learn how the four circles organise your network.',
    level: 'start',
    guide: 'getting-started',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Welcome to Relationship Manager', 'A two-minute tour');
      await rec.chapter('Signing in');
      await rec.say('Relationship Manager brings every connection you have into one place: LinkedIn, Facebook, X, your address book and your email.');
      await rec.say('Start by signing in. Each person has their own account, and accounts can share workspaces with a team.');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.install();
      await rec.chapter('The dashboard');
      await rec.say('This is your dashboard. The top row shows how many people, relationships, interactions and companies are in the workspace.');
      await rec.hover('[data-testid=category-card-personal]');
      await rec.say('Below that are the four circles. Every person belongs to one or more of them.');
      await rec.say('Personal is friends and family, from Facebook, your contacts and personal email.');
      await rec.hover('[data-testid=category-card-business]');
      await rec.say('Business is professional contacts outside your company, mostly LinkedIn and work email.');
      await rec.hover('[data-testid=category-card-corporate]');
      await rec.say('Corporate is people inside your own organisation, matched by your corporate email domains.');
      await rec.hover('[data-testid=category-card-social]');
      await rec.say('And Social is the wider public network: followers and follows on X.');
      await rec.scroll(500);
      await rec.say('Further down you can see activity over time, your strongest relationships and your top companies.');
      await rec.chapter('Navigation');
      await rec.hover('[data-testid=nav-network]');
      await rec.say('The rail on the left takes you to the Network views, the People directory, Import, Learn and Settings.');
      await rec.click('[data-testid=theme-toggle]');
      await rec.say('The theme follows your system, and you can switch between light and dark at any time.');
      await rec.click('[data-testid=theme-toggle]');
      await rec.say('That is the tour. The next videos walk through importing your data and exploring the visualisations.');
      await rec.finish();
    },
  },
  {
    id: 'importing-sources',
    title: 'Importing your connections',
    description: 'Export from LinkedIn, Facebook, X, Contacts and email, then import them with the wizard.',
    level: 'start',
    guide: 'importing-data',
    dataset: 'empty',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Importing your connections', 'LinkedIn · Facebook · X · Contacts · Email');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=dashboard-import-cta]');
      await rec.install();
      await rec.chapter('Set your own addresses first');
      await rec.say('A brand-new workspace is empty. Before importing email, tell the app which addresses are yours and which domains belong to your company.');
      await rec.goto('/settings/workspace');
      await rec.type('[data-testid=ws-self-emails]', 'jordan@northwindlabs.com');
      await rec.type('[data-testid=ws-domains]', 'northwindlabs.com');
      await rec.click('[data-testid=ws-save]');
      await rec.say('Your addresses let the app tell sent mail from received mail. The domains put colleagues into the Corporate circle.');
      await rec.chapter('The import wizard');
      await rec.click('[data-testid=nav-import]');
      await rec.say('Open Import. Pick a source, add the export file, review what was found, and import. Each tile explains where to download the file.');
      await rec.click('[data-testid=source-linkedin]');
      await rec.say('LinkedIn: Settings, Data privacy, Get a copy of your data, then choose Connections. You will get Connections.csv by email.');
      await rec.page.setInputFiles('[data-testid=file-input]', fx(ctx.fixtures, 'linkedin-Connections.csv'));
      await rec.install();
      await rec.say('Drop the file on the drop zone. The source is detected automatically from the file name and contents.');
      await rec.click('[data-testid=preview-button]');
      await rec.page.waitForSelector('[data-testid=import-preview]');
      await rec.install();
      await rec.say('Review shows how many people were found, a sample of names and companies, and any warnings.');
      await rec.click('[data-testid=confirm-import]');
      await rec.page.waitForSelector('[data-testid=import-results]');
      await rec.install();
      await rec.say('Done. The results table tells you how many people are new, how many merged into existing people, and how many relationships were created.');
      await rec.chapter('Facebook, X and Contacts');
      await rec.click('text=Import another source');
      await rec.click('[data-testid=source-facebook]');
      await rec.say('Facebook: Settings, Your information, Download your information. Choose Friends and followers in JSON format.');
      await rec.page.setInputFiles('[data-testid=file-input]', fx(ctx.fixtures, 'facebook-friends.json'));
      await rec.install();
      await rec.click('[data-testid=import-now-button]');
      await rec.page.waitForSelector('[data-testid=import-results]');
      await rec.install();
      await rec.say('People who were already imported from LinkedIn are matched by name, so you get one person with two sources, not two people.');
      await rec.click('text=Import another source');
      await rec.click('[data-testid=source-x]');
      await rec.say('X: request your archive, then drop follower.js and following.js. The archive only has account IDs, so add an X API key in Settings to resolve names, or use a CSV export.');
      await rec.page.setInputFiles('[data-testid=file-input]', fx(ctx.fixtures, 'x-followers.csv'));
      await rec.install();
      await rec.click('[data-testid=import-now-button]');
      await rec.page.waitForSelector('[data-testid=import-results]');
      await rec.install();
      await rec.click('text=Import another source');
      await rec.click('[data-testid=source-contacts]');
      await rec.say('Contacts: export a vCard or CSV from Google Contacts, iPhone or Outlook.');
      await rec.page.setInputFiles('[data-testid=file-input]', fx(ctx.fixtures, 'contacts.vcf'));
      await rec.install();
      await rec.click('[data-testid=import-now-button]');
      await rec.page.waitForSelector('[data-testid=import-results]');
      await rec.install();
      await rec.chapter('Email');
      await rec.click('text=Import another source');
      await rec.click('[data-testid=source-email]');
      await rec.say('Email is the richest source. Export an mbox from Google Takeout, Apple Mail or Thunderbird.');
      await rec.say('Only people you have exchanged mail with in both directions are imported, so newsletters and one-way notifications stay out.');
      await rec.page.setInputFiles('[data-testid=file-input]', fx(ctx.fixtures, 'mail.mbox'));
      await rec.install();
      await rec.click('[data-testid=import-now-button]');
      await rec.page.waitForSelector('[data-testid=import-results]');
      await rec.install();
      await rec.say('Email also records interactions, which drive the strength score and the activity timeline.');
      await rec.click('[data-testid=results-view-network]');
      await rec.page.waitForSelector('[data-testid=force-graph]');
      await rec.install();
      await rec.pause(2500);
      await rec.say('All five sources, one network. Re-importing a file later is safe: nothing gets duplicated.');
      await rec.finish();
    },
  },
  {
    id: 'network-graph',
    title: 'Exploring the network graph',
    description: 'Lenses, search, strength filter, clustering and the person side sheet.',
    level: 'core',
    guide: 'exploring-visualisations',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('The network graph', 'Force-directed, interactive, fast');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.goto('/network');
      await rec.page.waitForSelector('[data-testid=force-graph]');
      await rec.pause(2500);
      await rec.chapter('Reading the graph');
      await rec.say('The graph places you in the centre. Every dot is a person, coloured by their primary circle, and sized by relationship strength.');
      await rec.say('Lines are relationships. Solid lines come from your sources and email threads; dashed lines connect people at the same company.');
      await rec.say('Rings around a dot show that the person is in more than one circle.');
      await rec.chapter('Lenses and filters');
      await rec.click('[data-testid=lens-corporate]');
      await rec.pause(2500);
      await rec.say('Use the lens chips to focus on one circle. Here is just the Corporate circle: your colleagues.');
      await rec.click('[data-testid=lens-business]');
      await rec.pause(2200);
      await rec.say('And the Business circle.');
      await rec.click('[data-testid=lens-all]');
      await rec.pause(1500);
      await rec.type('[data-testid=search-input]', 'Northwind');
      await rec.pause(2200);
      await rec.say('Search filters the graph by name, company or email as you type.');
      await rec.type('[data-testid=search-input]', '');
      await rec.page.getByLabel('Minimum strength').fill('0.4');
      await rec.pause(2000);
      await rec.say('The strength slider hides weaker relationships so the people who matter most stand out.');
      await rec.page.getByLabel('Minimum strength').fill('0');
      await rec.pause(1500);
      await rec.chapter('Clustering');
      await rec.page.getByRole('combobox').nth(1).selectOption('category');
      await rec.pause(3000);
      await rec.say('Cluster by circle pulls each circle into its own region of the canvas.');
      await rec.page.getByRole('combobox').nth(1).selectOption('company');
      await rec.pause(3000);
      await rec.say('Cluster by company groups colleagues together.');
      await rec.page.getByRole('combobox').nth(1).selectOption('none');
      await rec.pause(2500);
      await rec.chapter('Interacting');
      await rec.say('Scroll to zoom, drag the background to pan, and drag a person to pin them while the layout settles.');
      const box = (await rec.page.locator('[data-testid=force-graph] canvas').boundingBox())!;
      await rec.moveCursor(box.x + box.width / 2, box.y + box.height / 2);
      await rec.page.mouse.wheel(0, -400);
      await rec.pause(1200);
      await rec.page.mouse.wheel(0, 400);
      await rec.pause(800);
      await rec.say('Hover for a quick summary. Click a person to open their side sheet.');
      await rec.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await rec.pause(1500);
      await rec.say('The sheet shows strength, interactions, sources and the people they are connected to. Open takes you to the full profile.');
      await rec.click('[aria-label=Close]');
      await rec.hover('[aria-label="Fit to view"]');
      await rec.say('The toolbar zooms, fits the graph to the window and re-runs the layout.');
      await rec.finish();
    },
  },
  {
    id: 'venn-chord-flow',
    title: 'Venn, chord and flow diagrams',
    description: 'See how your circles overlap and where each one comes from.',
    level: 'core',
    guide: 'exploring-visualisations',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Venn, chord and flow', 'How your circles overlap');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.goto('/network?view=venn');
      await rec.page.waitForSelector('[data-testid=venn]');
      await rec.chapter('Venn diagram');
      await rec.say('The Venn view answers one question: who is in more than one circle?');
      await rec.say('With all four circles selected you get the classic four-set diagram. Each number is the count of people in exactly that overlap.');
      await rec.click('[data-testid=venn-set-social]');
      await rec.pause(1500);
      await rec.say('Deselect a circle and the diagram becomes area-proportional: bigger groups get bigger circles, and the overlap size is exact.');
      await rec.click('[data-testid=venn-set-corporate]');
      await rec.pause(1500);
      const box = (await rec.page.locator('[data-testid=venn] canvas').boundingBox())!;
      await rec.moveCursor(box.x + box.width / 2, box.y + box.height / 2);
      await rec.pause(1200);
      await rec.say('Hover a region for details. Click it to list exactly those people.');
      await rec.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await rec.page.waitForSelector('[data-testid=people-table]');
      await rec.install();
      await rec.pause(1500);
      await rec.say('That takes you to People with the matching filter already applied.');
      await rec.chapter('Chord diagram');
      await rec.goto('/network?view=chord');
      await rec.page.waitForSelector('[data-testid=chord] svg');
      await rec.say('The chord diagram shows the same overlaps as flows. Each arc is a circle, and ribbon width is how many people two circles share.');
      await rec.say('The loops that return to the same arc are people in only that circle. Hover a ribbon to see the count, click it to list the people.');
      await rec.chapter('Flow diagram');
      await rec.goto('/network?view=flow');
      await rec.page.waitForSelector('[data-testid=sankey] svg');
      await rec.say('Flow is a Sankey diagram: sources on the left, circles in the middle, companies on the right.');
      await rec.say('It shows where each circle comes from. Hover a node to trace its flows, click a company to list its people.');
      await rec.finish();
    },
  },
  {
    id: 'treemap-radial-activity',
    title: 'Treemap, radial tree and activity',
    description: 'Companies and people by strength, the hierarchy around you, and your interaction history.',
    level: 'core',
    guide: 'exploring-visualisations',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Treemap, radial and activity', 'Three more ways to see your network');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.goto('/network?view=treemap');
      await rec.page.waitForSelector('[data-testid=treemap] svg');
      await rec.chapter('Treemap');
      await rec.say('The treemap nests people inside companies inside circles. Box size is relationship strength, so the biggest boxes are your closest people.');
      await rec.page.getByTestId('treemap').getByText(/^Business/).first().click();
      await rec.install();
      await rec.pause(1500);
      await rec.say('Click a circle or company to zoom in, and use the breadcrumb to go back.');
      await rec.click('[data-testid=treemap-root]');
      await rec.chapter('Radial tree');
      await rec.goto('/network?view=radial');
      await rec.page.waitForSelector('[data-testid=radial] svg');
      await rec.say('The radial tree is the same hierarchy as a dendrogram: you in the centre, then circles, then companies, then people on the outer ring.');
      await rec.say('In large networks the outer names appear on hover, and clicking a person opens their sheet.');
      await rec.chapter('Activity');
      await rec.goto('/network?view=activity');
      await rec.page.waitForSelector('[data-testid=activity-view]');
      await rec.say('Activity charts your interactions per month over the last two years, straight from imported email threads and anything you log by hand.');
      await rec.scroll(300);
      await rec.say('The strength distribution shows how many people sit at each level, and the heat map shows which sources feed each circle.');
      await rec.say('All of these views share the same filters at the top: lens, source and search.');
      await rec.finish();
    },
  },
  {
    id: 'people-and-contacts',
    title: 'Managing people',
    description: 'Search and filter the directory, edit a profile, tag, take notes, log interactions and merge duplicates.',
    level: 'core',
    guide: 'managing-people',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Managing people', 'The directory and the profile page');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.goto('/people');
      await rec.page.waitForSelector('[data-testid=people-table]');
      await rec.chapter('The directory');
      await rec.say('People is the full directory, sorted by strength. Each row shows company, circles, sources, strength and the last contact date.');
      await rec.type('[data-testid=search-input]', 'Harbor');
      await rec.pause(1200);
      await rec.say('Search matches names, companies, titles, emails and notes.');
      await rec.type('[data-testid=search-input]', '');
      await rec.click('[data-testid=cat-chip-personal]');
      await rec.click('[data-testid=cat-chip-business]');
      await rec.pause(1000);
      await rec.say('Circle chips combine: this is everyone who is both Personal and Business. The exact switch narrows it to people in only those circles.');
      await rec.click('text=Clear filters');
      await rec.chapter('A profile');
      await rec.click('[data-testid=person-row]');
      await rec.page.waitForSelector('[data-testid=circles-card]');
      await rec.install();
      await rec.say('A profile brings together everything known about a person: contact details, sources with links back to the original profile, circles and strength.');
      await rec.click('[data-testid=circles-card] [data-testid=cat-chip-social]');
      await rec.pause(1200);
      await rec.say('Circles are inferred automatically, but you can override them by tapping the chips. Reset returns to automatic.');
      await rec.click('text=Reset to automatic');
      await rec.type('[data-testid=tag-input]', 'mentor');
      await rec.page.keyboard.press('Enter');
      await rec.pause(800);
      await rec.say('Tags are free-form labels you can filter by in the directory.');
      await rec.type('[data-testid=notes-input]', 'Met at the Chicago conference. Follow up about the partnership idea.');
      await rec.click('[data-testid=save-notes]');
      await rec.say('Notes are private to the workspace and searchable.');
      await rec.scroll(400);
      await rec.click('[data-testid=log-interaction]');
      await rec.type('[data-testid=log-subject]', 'Coffee catch-up');
      await rec.click('[data-testid=log-save]');
      await rec.say('Log meetings, calls and messages by hand. They count towards strength just like email threads.');
      await rec.say('Connected people lists everyone linked to this person, with the kind of link: a shared employer or an email thread.');
      await rec.chapter('Duplicates');
      await rec.goto('/people');
      await rec.click('[data-testid=find-duplicates]');
      await rec.pause(1200);
      await rec.say('Imports match people by email, handle and exact name. For anything that slips through, Find duplicates lists likely pairs and lets you merge with one click.');
      await rec.click('text=Close');
      await rec.click('[data-testid=export-csv]');
      await rec.say('And you can export the current list as CSV at any time.');
      await rec.finish();
    },
  },
  {
    id: 'workspaces-and-team',
    title: 'Workspaces and your team',
    description: 'Configure a workspace, invite teammates with roles and keep separate networks.',
    level: 'advanced',
    guide: 'team-workspaces',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Workspaces and your team', 'Multi-user from the start');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.goto('/settings/workspace');
      await rec.chapter('Workspace settings');
      await rec.say('A workspace is one network. You can have several: a personal one, and one you share with a team.');
      await rec.say('Workspace settings hold your own email addresses and your corporate domains. Changing the domains recomputes the Corporate circle for everyone.');
      await rec.chapter('Members and roles');
      await rec.click('[data-testid=tab-members]');
      await rec.page.waitForSelector('[data-testid=members-card]');
      await rec.install();
      await rec.say('Members shows who has access. The owner can invite people as editors, who can import and edit, or viewers, who can only look.');
      await rec.type('[data-testid=invite-email]', 'teammate@example.com');
      await rec.click('[data-testid=invite-send]');
      await rec.pause(1200);
      await rec.say('If the person already has an account they join immediately. Otherwise you get an invite link to send them; it works once and lets them sign up straight into the workspace.');
      await rec.chapter('More workspaces');
      await rec.click('[data-testid=tab-workspace]');
      await rec.click('[data-testid=ws-new]');
      await rec.type('[data-testid=ws-create-name]', 'Sales team');
      await rec.click('[data-testid=ws-create]');
      await rec.pause(1200);
      await rec.say('New workspaces start empty. Switch between them with the menu at the top of the rail.');
      await rec.click('[data-testid=workspace-menu]');
      await rec.pause(1200);
      await rec.page.keyboard.press('Escape');
      await rec.page.getByRole('menuitem', { name: /Demo network/ }).click();
      await rec.say('Each workspace has its own people, integrations and members.');
      await rec.finish();
    },
  },
  {
    id: 'integrations-api-keys',
    title: 'Integrations and API keys',
    description: 'Connect IMAP, Google, Microsoft 365, X, Facebook and LinkedIn with your own keys and sync on demand.',
    level: 'advanced',
    guide: 'integrations-and-api-keys',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Integrations and API keys', 'Sync without downloading files');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.goto('/settings/integrations');
      await rec.page.waitForSelector('[data-testid=provider-tiles]');
      await rec.chapter('Connectors');
      await rec.say('Instead of exporting files, you can connect accounts directly. Every connector accepts your own API keys or tokens.');
      await rec.say('Keys are encrypted at rest with AES-256 and never sent back to the browser. Use app passwords and short-lived tokens where you can.');
      await rec.hover('[data-testid=provider-imap]');
      await rec.say('IMAP works with Gmail, Outlook, Fastmail, iCloud and any mail server. It scans your inbox and sent folder for two-way conversations.');
      await rec.hover('[data-testid=provider-google]');
      await rec.say('Google uses the Gmail and People APIs. Microsoft 365 uses Microsoft Graph for mail and contacts.');
      await rec.hover('[data-testid=provider-x]');
      await rec.say('X resolves followers and follows with names and avatars from a bearer token. Facebook and LinkedIn verify your account with their tokens.');
      await rec.chapter('Adding a connector');
      await rec.click('[data-testid=provider-imap]');
      await rec.type('[data-testid=field-host]', 'imap.gmail.com');
      await rec.type('[data-testid=field-user]', 'jordan@northwindlabs.com');
      await rec.type('[data-testid=field-password]', 'app-password-goes-here', 25);
      await rec.say('Fill in the host, your address and an app password, then connect.');
      await rec.click('[data-testid=integration-save]');
      await rec.page.waitForSelector('[data-testid=integration-imap]');
      await rec.install();
      await rec.say('The connector appears with its settings; notice the password is only shown as set, never its value.');
      await rec.hover('[data-testid=integration-test]');
      await rec.say('Test checks the credentials. Sync now pulls everything in and runs the same matching as a file import.');
      await rec.chapter('Syncing');
      await rec.goto('/import');
      await rec.hover('[data-testid=sync-imap]');
      await rec.say('Connected accounts also show on the Import page, so you can sync from the same place you import files.');
      await rec.goto('/settings/integrations');
      await rec.page.once('dialog', (d) => d.accept());
      await rec.click('[data-testid=integration-delete]');
      await rec.say('Remove a connector at any time; its keys are deleted with it.');
      await rec.finish();
    },
  },
  {
    id: 'install-and-offline',
    title: 'Install the app and work offline',
    description: 'Install Relationship Manager as a PWA, personalise the theme and export your data.',
    level: 'advanced',
    guide: 'install-and-offline',
    dataset: 'demo',
    async run(rec, ctx) {
      await rec.goto('/');
      await rec.title('Install and go offline', 'A progressive web app');
      await rec.type('[data-testid=auth-email]', ctx.email);
      await rec.type('[data-testid=auth-password]', ctx.password, 30);
      await rec.click('[data-testid=auth-submit]');
      await rec.page.waitForSelector('[data-testid=stat-cards]');
      await rec.chapter('Installing');
      await rec.click('[data-testid=account-menu]');
      await rec.pause(1200);
      await rec.say('Relationship Manager is a progressive web app. In Chrome, Edge or Safari you can install it from the account menu or the browser address bar.');
      await rec.page.keyboard.press('Escape');
      await rec.say('Installed, it runs in its own window with its own icon, on desktop and on phones.');
      await rec.chapter('Offline');
      await rec.say('The app shell and everything you have already viewed are cached, so you can browse your network without a connection. Changes wait until you are back online.');
      await rec.chapter('Personalise');
      await rec.goto('/settings/appearance');
      await rec.click('[data-testid=seed-146c2e]');
      await rec.pause(900);
      await rec.say('Pick an accent colour and the whole palette is derived from it, the way Material You does on Android.');
      await rec.click('[data-testid=seed-6750a4]');
      await rec.pause(900);
      await rec.click('[data-testid=seed-0b57d0]');
      await rec.click('[data-testid=segment-dark]');
      await rec.pause(1200);
      await rec.say('Dark mode is one tap away.');
      await rec.click('[data-testid=segment-light]');
      await rec.chapter('Your data');
      await rec.click('[data-testid=tab-data]');
      await rec.hover('[data-testid=export-json]');
      await rec.say('Everything you import stays in your own database. Export the whole workspace as JSON whenever you like.');
      await rec.say('That is the end of the series. The written guides in Learn cover every topic in more depth.');
      await rec.finish();
    },
  },
];
