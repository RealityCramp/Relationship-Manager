import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkedInConnections } from './linkedin.ts';
import { fixMojibake, parseFacebookJson } from './facebook.ts';
import { parseXData } from './x.ts';
import { parseContacts } from './contacts.ts';
import { buildEmailImport, parseAddresses, parseMbox, decodeRfc2047 } from './email.ts';
import { guessSource } from './index.ts';
import { parseCsv } from '../csv.ts';

test('csv parser handles quotes, commas and newlines', () => {
  const rows = parseCsv('a,"b, c","line\nbreak"\n"he said ""hi""",2,3\n');
  assert.deepEqual(rows, [
    ['a', 'b, c', 'line\nbreak'],
    ['he said "hi"', '2', '3'],
  ]);
});

test('linkedin connections with notes preamble', () => {
  const csv = `Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Lovelace,https://www.linkedin.com/in/ada-lovelace,ada@analytical.engine,Analytical Engines Ltd,Chief Analyst,12 Mar 2021\nAlan,Turing,https://www.linkedin.com/in/alan-turing,,Bletchley Park,Cryptanalyst,05 Jun 2019\n`;
  const r = parseLinkedInConnections(csv);
  assert.equal(r.contacts.length, 2);
  assert.equal(r.contacts[0].displayName, 'Ada Lovelace');
  assert.equal(r.contacts[0].handle, 'ada-lovelace');
  assert.deepEqual(r.contacts[0].emails, ['ada@analytical.engine']);
  assert.equal(r.contacts[0].company, 'Analytical Engines Ltd');
  assert.ok(r.contacts[0].connectedAt?.startsWith('2021-03-12'));
  assert.deepEqual(r.contacts[1].categories, ['business']);
});

test('facebook friends_v2 with mojibake names', () => {
  const json = JSON.stringify({ friends_v2: [{ name: 'RenÃ©e Dupont', timestamp: 1600000000 }, { name: 'Bob Jones', timestamp: 1500000000 }] });
  const r = parseFacebookJson(json);
  assert.equal(r.contacts.length, 2);
  assert.equal(r.contacts[0].displayName, 'Renée Dupont');
  assert.deepEqual(r.contacts[0].categories, ['personal']);
  assert.equal(fixMojibake('plain'), 'plain');
});

test('x archive follower.js', () => {
  const js = `window.YTD.follower.part0 = [ { "follower" : { "accountId" : "12345", "userLink" : "https://twitter.com/intent/user?user_id=12345" } } ]`;
  const r = parseXData(js, 'follower.js');
  assert.equal(r.contacts.length, 1);
  assert.equal(r.contacts[0].externalId, '12345');
  assert.deepEqual(r.contacts[0].tags, ['x:follower']);
});

test('x csv with usernames', () => {
  const r = parseXData('username,name\n@grace,Grace Hopper\n', 'followers.csv');
  assert.equal(r.contacts[0].handle, 'grace');
  assert.equal(r.contacts[0].url, 'https://x.com/grace');
});

test('vcard parsing', () => {
  const vcf = `BEGIN:VCARD\nVERSION:3.0\nN:Hopper;Grace;;;\nFN:Grace Hopper\nORG:US Navy\nTITLE:Rear Admiral\nEMAIL;TYPE=INTERNET:grace@navy.mil\nTEL;TYPE=CELL:+1 555 0100\nCATEGORIES:Mentors,Navy\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\nFN:Solo Email\nEMAIL:solo@gmail.com\nEND:VCARD\n`;
  const r = parseContacts(vcf, 'contacts.vcf');
  assert.equal(r.contacts.length, 2);
  assert.equal(r.contacts[0].firstName, 'Grace');
  assert.equal(r.contacts[0].company, 'US Navy');
  assert.deepEqual(r.contacts[0].tags, ['Mentors', 'Navy']);
  assert.deepEqual(r.contacts[0].categories, ['business']);
  assert.deepEqual(r.contacts[1].categories, ['personal']);
});

test('google contacts csv', () => {
  const csv = `First Name,Last Name,Organization Name,Organization Title,E-mail 1 - Value,E-mail 2 - Value,Phone 1 - Value,Labels\nLinus,Torvalds,Linux Foundation,Fellow,linus@kernel.org,linus@gmail.com,+1 555 0101,* myContacts ::: Open Source\n`;
  const r = parseContacts(csv, 'contacts.csv');
  assert.equal(r.contacts.length, 1);
  assert.deepEqual(r.contacts[0].emails, ['linus@kernel.org', 'linus@gmail.com']);
  assert.deepEqual(r.contacts[0].tags, ['Open Source']);
  assert.deepEqual([...r.contacts[0].categories!].sort(), ['business', 'personal']);
});

test('address and rfc2047 parsing', () => {
  assert.deepEqual(parseAddresses('"Doe, Jane" <jane@example.com>, bob@example.org'), [
    { name: 'Doe, Jane', email: 'jane@example.com' },
    { name: '', email: 'bob@example.org' },
  ]);
  assert.equal(decodeRfc2047('=?utf-8?B?SMOpbGxv?='), 'Héllo');
  assert.equal(decodeRfc2047('=?iso-8859-1?Q?caf=E9?='), 'café');
});

test('mbox bidirectional detection', () => {
  const mbox = [
    'From alice@example.com Mon Jan 01 00:00:00 2024',
    'From: Alice <alice@example.com>',
    'To: me@mine.com',
    'Subject: Hello',
    'Date: Mon, 1 Jan 2024 10:00:00 +0000',
    'Message-ID: <1@example.com>',
    '',
    'hi',
    '',
    'From me@mine.com Mon Jan 02 00:00:00 2024',
    'From: Me <me@mine.com>',
    'To: Alice <alice@example.com>, carol@corp.com',
    'Subject: Re: Hello',
    'Date: Tue, 2 Jan 2024 10:00:00 +0000',
    'Message-ID: <2@mine.com>',
    'In-Reply-To: <1@example.com>',
    'References: <1@example.com>',
    '',
    'hello back',
    '',
    'From newsletter@spam.com Mon Jan 03 00:00:00 2024',
    'From: News <newsletter@spam.com>',
    'To: me@mine.com',
    'Subject: Buy now',
    'Date: Wed, 3 Jan 2024 10:00:00 +0000',
    'Message-ID: <3@spam.com>',
    '',
    'spam',
  ].join('\n');
  const messages = parseMbox(mbox);
  assert.equal(messages.length, 3);
  const r = buildEmailImport(messages, { selfEmails: ['me@mine.com'], corporateDomains: ['corp.com'] });
  assert.equal(r.contacts.length, 1, 'only alice is bidirectional');
  assert.equal(r.contacts[0].displayName, 'Alice');
  assert.deepEqual(r.contacts[0].categories, ['business']);
  assert.equal(r.interactions.length, 2);
  assert.equal(r.interactions[0].threadId, r.interactions[1].threadId);
  const all = buildEmailImport(messages, { selfEmails: ['me@mine.com'], corporateDomains: ['corp.com'], bidirectionalOnly: false });
  assert.deepEqual(all.contacts.map((c) => c.emails![0]).sort(), ['alice@example.com', 'carol@corp.com']);
  assert.deepEqual(all.contacts.find((c) => c.emails![0] === 'carol@corp.com')?.categories, ['corporate']);
});

test('guessSource', () => {
  assert.equal(guessSource('Connections.csv', ''), 'linkedin');
  assert.equal(guessSource('friends.json', ''), 'facebook');
  assert.equal(guessSource('follower.js', ''), 'x');
  assert.equal(guessSource('All mail.mbox', ''), 'email');
  assert.equal(guessSource('export.vcf', ''), 'contacts');
  assert.equal(guessSource('x.txt', 'BEGIN:VCARD'), 'contacts');
});
