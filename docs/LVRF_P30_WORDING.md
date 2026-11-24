# §30: the wording, old and new (Gate A file for Brad, 24 Nov 2026)

Every message §30 changes, as hardening.sql and the server hold it. On screen, a database message loses its
`LVRF: <table>:` prefix and starts with a capital (D4); the record (`refusals`) keeps the raw text. `%` is a value the
database fills in.

## Database (hardening.sql): 50 messages in 22 functions

| Old | New |
|---|---|
| LVRF: value_levers: a lever's tenant is its pack entry's (entry % is not of tenant %). | LVRF: value_levers: This lever's pack entry (%) is not in your company's record. |
| LVRF: value_levers: only the tenant's steward may propose a lever (proposed_by % is not the steward). | LVRF: value_levers: only the steward may propose a lever (proposed_by % is not the steward). |
| LVRF: value_levers: only the tenant's steward may withdraw a lever (retired_by % is not the steward). | LVRF: value_levers: only the steward may withdraw a lever (retired_by % is not the steward). |
| LVRF: lever_offerings: a link's tenant is its lever's and its offering's (tenant %). | LVRF: lever_offerings: This link's lever or offering is not in your company's record. |
| LVRF: lever_offerings: only the tenant's steward may link a solution to a lever (linked_by % is not the steward). | LVRF: lever_offerings: only the steward may link a solution to a lever (linked_by % is not the steward). |
| LVRF: lever_offerings: only the tenant's steward may withdraw a link (retired_by % is not the steward). | LVRF: lever_offerings: only the steward may withdraw a link (retired_by % is not the steward). |
| LVRF: value_hypotheses: the account % is not of tenant %. | LVRF: value_hypotheses: the account % is not one of your company's accounts. |
| LVRF: value_hypotheses: lever % is not a current lever of this tenant. | LVRF: value_hypotheses: lever % is not a current lever of your company. |
| LVRF: value_hypotheses: the author % is not current, non-simulated staff of the tenant. | LVRF: value_hypotheses: the author % is not a current, real member of your company's staff. |
| LVRF: reference_example_markers: the account % is not of tenant %. | LVRF: reference_example_markers: the account % is not one of your company's accounts. |
| LVRF: reference_example_markers: only the tenant's steward may mark a reference example (marked_by % is not the steward). | LVRF: reference_example_markers: only the steward may mark a reference example (marked_by % is not the steward). |
| LVRF: reference_example_markers: only the tenant's steward may unmark a reference example. | LVRF: reference_example_markers: only the steward may unmark a reference example. |
| LVRF: executive_summaries: the account % is not of tenant %. | LVRF: executive_summaries: the account % is not one of your company's accounts. |
| LVRF: executive_summaries: the author % is not current, non-simulated staff of the tenant; a summary is written by a named person. | LVRF: executive_summaries: the author % is not a current, real member of your company's staff; a summary is written by a named person. |
| LVRF: account_person_links: the account % is not of tenant %. | LVRF: account_person_links: the account % is not one of your company's accounts. |
| LVRF: account_person_links: % is not current, non-simulated staff of the tenant; only the tenant's own people are linked to an account (a customer's people belong to it directly). | LVRF: account_person_links: % is not a current, real member of your company's staff; only your company's own people are linked to an account (a customer's people belong to it directly). |
| LVRF: account_person_links: the linker % is not current staff of the tenant. | LVRF: account_person_links: the linker % is not a current member of your company's staff. |
| LVRF: value_outcome_evidence: only the tenant's steward corrects what a link supports. | LVRF: value_outcome_evidence: only the steward corrects what a link supports. |
| LVRF: value_outcome_evidence: only the tenant's steward withdraws a link. | LVRF: value_outcome_evidence: only the steward withdraws a link. |
| LVRF: run_errata: run % is not of tenant %. | LVRF: run_errata: run % is not one of your company's runs. |
| LVRF: run_errata: only the tenant's steward records an erratum. | LVRF: run_errata: only the steward records an erratum. |
| LVRF: governance_acts: the act's subject is not of tenant %. | LVRF: governance_acts: the act's subject is not in your company's record. |
| LVRF: governance_acts: the act's result %.% does not exist in tenant %. | LVRF: governance_acts: the act's result %.% is not in your company's record. |
| LVRF: customer_role_grants: only the tenant's steward revokes a role. | LVRF: customer_role_grants: only the steward revokes a role. |
| LVRF: customer_role_grants: the account is not of tenant %. | LVRF: customer_role_grants: the account is not one of your company's accounts. |
| LVRF: customer_role_grants: only the tenant's steward names a customer-side role. | LVRF: customer_role_grants: only the steward names a customer-side role. |
| LVRF: customer_role_grants: % is vendor-side (tenant staff, a vendor-side role, or sign-in credentials), not the customer. | LVRF: customer_role_grants: % is vendor-side (your company's staff, a vendor-side role, or sign-in credentials), not the customer. |
| LVRF: system_exercise_marks: only the tenant's steward marks an item as a system exercise. | LVRF: system_exercise_marks: only the steward marks an item as a system exercise. |
| LVRF: system_exercise_marks: % % does not exist in tenant %. | LVRF: system_exercise_marks: % % is not in your company's record. |
| LVRF: figure_findings: only the tenant's steward records a finding. | LVRF: figure_findings: only the steward records a finding. |
| LVRF: figure_findings: outcome % is not of this account and tenant. | LVRF: figure_findings: outcome % is not of this account. |
| LVRF: evidence %: only the tenant's steward states what a row from before this field is about. | LVRF: evidence %: only the steward states what a row from before this field is about. |
| LVRF: evidence %: only the tenant's steward withdraws a verification. | LVRF: evidence %: only the steward withdraws a verification. |
| LVRF: industries: only the tenant's steward adds an industry. | LVRF: industries: only the steward adds an industry. |
| LVRF: outcome_withdrawals: outcome % is not of tenant %. | LVRF: outcome_withdrawals: outcome % is not one of your company's outcomes. |
| LVRF: outcome_withdrawals: only the tenant's steward withdraws a measurement or a commitment, as themself. | LVRF: outcome_withdrawals: only the steward withdraws a measurement or a commitment, as themself. |
| LVRF: policy_values: only the tenant's steward sets a policy value, as themself. | LVRF: policy_values: only the steward sets a policy value, as themself. |
| LVRF: policy_values: a new value supersedes a value of the same tenant and key. | LVRF: policy_values: a new value supersedes a value of the same key in your company's record. |
| LVRF: lens_policies: only the tenant's steward ratifies a lens policy, as themself. | LVRF: lens_policies: only the steward ratifies a lens policy, as themself. |
| LVRF: lens_policies: a new version supersedes a policy of the same tenant and persona. | LVRF: lens_policies: a new version supersedes a policy of the same persona in your company's record. |
| LVRF: monetization_rates: the account % is not of tenant %. | LVRF: monetization_rates: the account % is not one of your company's accounts. |
| LVRF: monetization_rates: a rate is recorded by current, non-simulated staff of the tenant, as themself. | LVRF: monetization_rates: a rate is recorded by a current, real member of your company's staff, as themself. |
| LVRF: roadmap_milestones: the engagement % is not of tenant %. | LVRF: roadmap_milestones: the engagement % is not one of your company's engagements. |
| LVRF: roadmap_milestones: a milestone is planned by current, non-simulated staff of the tenant, as themself. | LVRF: roadmap_milestones: a milestone is planned by a current, real member of your company's staff, as themself. |
| LVRF: record_documents: a % is recorded by current staff of the tenant, as themself. | LVRF: record_documents: a % is recorded by a current member of your company's staff, as themself. |
| LVRF: record_documents: a CFO-lens print request names the CFO lens policy it applied, the tenant's current one. | LVRF: record_documents: a CFO-lens print request names the CFO lens policy it applied, your company's current one. |
| LVRF: record_documents: only the tenant's steward shares a run for review (D-M21). | LVRF: record_documents: only the steward shares a run for review. |
| LVRF: research_clearances: only the tenant's steward clears an account or an industry for research with Claude, or withdraws a clearance. | LVRF: research_clearances: only the steward clears an account or an industry for research with Claude, or withdraws a clearance. |
| LVRF: research_clearances: the account or industry is not a current one of this tenant. | LVRF: research_clearances: the account or industry is not a current one of your company. |
| LVRF: research_calls: the call names a prompt of this tenant, with that prompt's SHA-256. | LVRF: research_calls: the call names a prompt of your company, with that prompt's SHA-256. |

(50 lines.)

## Server strings

| File | Old | New |
|---|---|---|
| server/lib/classifyInstitution.ts | message: `industry_slug unknown for this tenant: ${industrySlug}`, | message: `industry_slug unknown for your company: ${industrySlug}`, |
| server/lib/evidenceAbout.ts | if (!found) throw new EvidenceFormError('The account named as what this evidence is about is not an account of this tenant.'); | if (!found) throw new EvidenceFormError('The account named as what this evidence is about is not one of your company\'s accounts.'); |
| server/lib/plainChecks.ts | persons_scoped_to_exactly_one: "A person belongs to the tenant's staff or to one account, not both.", | persons_scoped_to_exactly_one: "A person belongs to your company's staff or to one account, not both.", |
| server/lib/stewardActs.ts | : `${act} is the steward's act, and this tenant has no steward named.`, | : `${act} is the steward's act, and your company has no steward named.`, |
| server/research/callAnswer.ts | if (!r) throw new ImportTextError([`research call ${callId} is not an answered call of this tenant`], { call_id: callId }); | if (!r) throw new ImportTextError([`research call ${callId} is not an answered call of your company`], { call_id: callId }); |
| server/routes/accountEvidence.ts | if (!e || isOtherTenant(req, e.tenant_id, { table: 'evidence', id })) return refused('That is not an evidence row of this tenant.'); | if (!e || isOtherTenant(req, e.tenant_id, { table: 'evidence', id })) return refused('That is not an evidence row of your company.'); |
| server/routes/accountEvidence.ts | if (!x || isOtherTenant(req, x.tenant_id, { table: 'run_errata', id })) return { erratum_id: id, blockers: ['That is not an erratum of this  | if (!x || isOtherTenant(req, x.tenant_id, { table: 'run_errata', id })) return { erratum_id: id, blockers: ['That is not an erratum of your  |
| server/routes/accountInputs.ts | message: `An institution named "${institutionName}" already exists for this tenant, but is retired or superseded and not currently active —  | message: `An institution named "${institutionName}" already exists for your company, but is retired or superseded and not currently active — |
| server/routes/accountInputs.ts | message: `An institution named "${institutionName}" already exists for this tenant.`, | message: `An institution named "${institutionName}" already exists for your company.`, |
| server/routes/accountPersonLinks.ts | if (!p) throw new ValidationError([`body.person_id ${personId} is not a current member of this tenant's staff (a customer's people belong to | if (!p) throw new ValidationError([`body.person_id ${personId} is not a current member of your company's staff (a customer's people belong t |
| server/routes/industryAdd.ts | if (taken.length > 0) throw new Refusal(409, `This tenant already has "${taken[0].name}" (${taken[0].slug}).`); | if (taken.length > 0) throw new Refusal(409, `Your company already has "${taken[0].name}" (${taken[0].slug}).`); |
| server/routes/offeringAttachment.ts | message: `offering_key not found for this tenant: ${offeringKey}`, | message: `offering_key not found for your company: ${offeringKey}`, |
| server/routes/researchPrompt.ts | 'not the tenant-self institution. A customer outcome metric lives in that customer\'s ' + | 'not your own company\'s account. A customer outcome metric lives in that customer\'s ' + |
| server/routes/valueLevers.ts | if (!offering) throw new ValidationError([`body.offering_key "${offeringKey}" is not a current offering in this tenant's catalog`]); | if (!offering) throw new ValidationError([`body.offering_key "${offeringKey}" is not a current offering in your company's catalog`]); |

## Client strings

| File | Old | New |
|---|---|---|
| client/src/components/valueCase/CaseInputs.tsx | Share for review (D-M21) | Share for review |
| client/src/components/OutsideInWalk.tsx | …the steward's act — {name}'s alone (3.0 Band A). | …the steward's act — {name}'s alone. |
| client/src/components/PackResearch.tsx | This is the steward's act — {name}'s alone (3.0 Band A). | This is the steward's act — {name}'s alone. |
| client/src/pages/IndustryPackPage.tsx | This is the steward's act — {name}'s alone (3.0 Band A). | This is the steward's act — {name}'s alone. |

