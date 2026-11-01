// L41: see evidence_fixture.sh. Prints the body to send, a tab, and the opening to make after it (or nothing).
const [raw, path] = process.argv.slice(2);
const b = JSON.parse(raw);
// A body offering AI-sourced evidence as verified is a deliberate refusal: it goes as written.
if (b.ai_sourced === true && b.source_verified === true) { console.log(`${raw}\t`); process.exit(0); }
const verified = b.source_verified === true;
delete b.source_verified;
if (!/\/facts/.test(path) && b.about === undefined) b.about = 'account';
const open = { source_verified: true };
if (b.kind === 'attestation' || b.attested_by_person_id) open.attester_document = 'email';
if (b.evidence_form === 'statement' && b.kind === 'attestation') {
  Object.assign(open, { evidence_form: 'quote', quote_text: 'I attest to this, in my own words (fixture).', how_read: 'Read from the email the attester sent (fixture only).' });
}
console.log(`${JSON.stringify(b)}\t${verified ? JSON.stringify(open) : ''}`);
