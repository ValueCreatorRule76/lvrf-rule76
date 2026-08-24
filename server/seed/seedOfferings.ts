import '../env.js';
import { pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { pool } from '../db/pool.js';
import { withActorTransaction, type Db } from '../db/withActorTransaction.js';
import * as schema from '../../db/schema.js';

/**
 * Idempotent seed for the Skillsoft content catalog — twelve offerings that
 * have existed only in the local dev database since 2 August, never
 * committed, never applied to production, where `offerings` is empty.
 *
 * tenant_id is NOT hardcoded. Local and production disagree on it (local:
 * e30917e8-6593-45eb-8036-03a62aa6d9e7; production:
 * 20b625bc-3c67-4238-9ccd-1e5cafe7f896) — a literal id is portable to
 * exactly one database and a bug in every other. Resolved at runtime by
 * tenant name instead:
 *
 *   offerings(tenant_id, offering_key)  — offerings_tenant_key_unique,
 *   a partial unique index WHERE deleted_at IS NULL (0006 — soft-deleting a
 *   row frees its key for reuse). ON CONFLICT DO NOTHING against exactly
 *   that target, so re-running this file is a no-op on rows already seeded.
 *
 * This never creates a tenant and never creates a capability — it only
 * writes the catalog. evidence_ratification stays 'unratified' on every
 * row: nobody has audited these evidentiary claims. market_status stays
 * exactly as recorded locally, including global_knowledge_ilt = active;
 * retiring it is a separate deliberate change, not a seed decision.
 */

interface SourceRef {
  url: string;
  retrieved_at: string;
  note?: string;
}

interface OfferingSeed {
  offeringKey: string;
  name: string;
  family: (typeof schema.offeringFamily.enumValues)[number];
  description: string;
  evidenceClass: (typeof schema.evidenceClass.enumValues)[number];
  verificationSource: (typeof schema.verificationSource.enumValues)[number];
  evidenceArtifacts: string[];
  commercialModel: string | null;
  sourceRefs: SourceRef[];
  confirmationGaps: string[];
  providerOrg: string | null;
  evidenceAccess: (typeof schema.evidenceAccess.enumValues)[number];
  marketStatus: string;
  evidenceRatification: string;
}

// Read from the local database, not invented and not paraphrased. Twelve
// rows, exactly as they exist locally as of 24 August 2026.
const OFFERINGS: OfferingSeed[] = [
  {
    offeringKey: "codecademy_enterprise",
    name: "Codecademy for Enterprise",
    family: "practice",
    description: "Hands-on, in-browser technical skill building. Enterprise positioning centres on cybersecurity, cloud computing, and AI.",
    evidenceClass: "demonstrated",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["completed project artifacts", "in-environment exercise results", "skill path completion with assessment"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/technology-skills/skills-training", retrieved_at: "2026-08-01" },
      { url: "https://www.skillsoft.com/compliance-leaders", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G1", "G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "global_knowledge_ilt",
    name: "Instructor-Led Tech Training (Global Knowledge)",
    family: "instructor_led",
    description: "Live instructor-led technical training delivered by field experts, frequently oriented to vendor certification. Formerly a Skillsoft-owned business unit. Skillsoft divested Global Knowledge to an affiliate of Enduring Ventures — definitive agreement announced 2026-05-20, sale completed 2026-07-06 — and now maintains a reciprocal partnership under which Skillsoft customers retain access to Global Knowledge's instructor-led training and Global Knowledge customers gain access to the Skillsoft platform. That partnership is why this offering still appears on skillsoft.com; Global Knowledge is now a separate company Skillsoft does not own.",
    evidenceClass: "assessed",
    verificationSource: "third_party",
    evidenceArtifacts: ["certification pass/fail from issuing body", "credential ID", "credential expiry date"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.globalknowledge.com/us-en/", retrieved_at: "2026-08-01" },
      { url: "https://investor.skillsoft.com/sec-filings/all-sec-filings/content/0001437749-26-017991/skil20260520_8k.htm", note: "8-K, Item 1.01 — definitive agreement to sell Global Knowledge to an Enduring Ventures affiliate (EHJob GP LLC), announced 2026-05-20.", retrieved_at: "2026-08-02" },
      { url: "https://investor.skillsoft.com/news-events/press-releases/detail/457/skillsoft-completes-sale-of-global-knowledge-business-advancing-focus-on-ai-native-skills-management-platform", note: "Completion announcement, 2026-07-06 — confirms the reciprocal partnership and Enduring Ventures as buyer.", retrieved_at: "2026-08-02" },
    ],
    confirmationGaps: ["G7"],
    providerOrg: "Global Knowledge (Enduring Ventures affiliate)",
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_ai_coach",
    name: "Skillsoft AI Coach",
    family: "coaching",
    description: "ICF-aligned AI coaching delivered to every employee at enterprise scale. Consumes role and proficiency data and translates skills gaps into actionable behaviour change, with reflection and accountability prompts.",
    evidenceClass: "demonstrated",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["coaching interaction log", "goal-setting and completion record", "reflection prompt and response"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/coaching", retrieved_at: "2026-08-01" },
      { url: "https://s3.us-east-1.amazonaws.com/skillsoft.com/prod/resources/Skillsoft_AI_Coach.pdf", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G3", "G1"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_caisy",
    name: "Skillsoft CAISY® Conversation AI Simulator",
    family: "practice",
    description: "AI-powered conversation simulator for rehearsing difficult work conversations, with real-time adaptive feedback and a Role Model mode in which the AI demonstrates the conversation. Published scenario families include leadership, first-time managers, first-time managers in tech, agile tech and product teams, compliance, coaching, customer service, sales and marketing, well-being, and procurement. Custom scenarios can be commissioned.",
    evidenceClass: "demonstrated",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["scored conversation transcript", "adaptive feedback record", "repeat-attempt delta"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/caisy", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G2", "G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_coaching_1to1",
    name: "Skillsoft 1:1 Coaching (incl. Specialized)",
    family: "coaching",
    description: "Future-focused personalized coaching partnership. ICF/EMCC-credentialed coaches with 10+ years professional experience, stated 98% match success rate, network across 30+ countries and 25+ languages. Specialized 1:1 is a topical variant targeting specific circumstances.",
    evidenceClass: "demonstrated",
    verificationSource: "human_observer",
    evidenceArtifacts: ["coach-attested goal completion", "session record", "coach observation notes"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/coaching", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G3", "G4"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_coaching_group",
    name: "Skillsoft Group Coaching",
    family: "coaching",
    description: "Cohort-based coaching developing community, connection, and culture.",
    evidenceClass: "assessed",
    verificationSource: "human_observer",
    evidenceArtifacts: ["cohort progress record", "facilitator assessment", "group goal completion"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/coaching", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G3", "G4"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_compliance_suite",
    name: "Skillsoft Compliance Suite",
    family: "content",
    description: "Risk-based compliance and ethics training spanning legal and ethics, EHS and workplace safety, cybersecurity and data protection, and ESG/CSR. Published customer stories include Sensata Technologies (21,000+ employees, multi-language) and Scotts Miracle-Gro (7,600 associates across 70 locations).",
    evidenceClass: "assessed",
    verificationSource: "customer_system",
    evidenceArtifacts: ["completion attestation", "assessment score", "audit-ready training record"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/compliance-leaders", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_content_marketplace",
    name: "Skillsoft Content Marketplace",
    family: "enabler",
    description: "Curation and automation of partner content into best-suited learning paths.",
    evidenceClass: "consumption",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["content launch and completion telemetry"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/content-marketplace", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_leadership_development_program",
    name: "Skillsoft Leadership Development Program (SLDP)",
    family: "program",
    description: "Structured leadership program powered by MIT Sloan Management Review and Business Advance, preparing leaders to drive performance in the digital era across critical leadership and business skills.",
    evidenceClass: "assessed",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["program completion record", "leadership assessment score", "360 or benchmark result where configured"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/leadership-and-business-skills/leadership-development-program", retrieved_at: "2026-08-01" },
      { url: "https://www.skillsoft.com/compliance-leaders", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G1", "G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_lx_design_studio",
    name: "Skillsoft LX Design Studio",
    family: "enabler",
    description: "AI-powered authoring for courses, simulations, and assessments, with a stated design cycle of minutes rather than months, and easy update as priorities change.",
    evidenceClass: "none",
    verificationSource: "none",
    evidenceArtifacts: [],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/meet-skillsoft-percipio", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_percipio_platform",
    name: "Skillsoft Percipio Platform",
    family: "platform",
    description: "AI-native skills management platform positioned as the system of engagement for identifying gaps, building skills, deploying talent, and proving impact. Every learning interaction is claimed to generate real-time proficiency data.",
    evidenceClass: "assessed",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["role-level proficiency scores", "skill gap deltas", "learning path progress", "completion records"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://www.skillsoft.com/meet-skillsoft-percipio", retrieved_at: "2026-08-01" },
      { url: "https://www.skillsoft.com/", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G1", "G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
  {
    offeringKey: "skillsoft_skill_benchmarks",
    name: "Skill Benchmarks & Skills Readiness Assessment",
    family: "assessment",
    description: "Scored measurement of current capability against a defined standard. The baseline instrument for the LVRF spine — without a scored pre-measure there is no delta to verify at Measure or Verify.",
    evidenceClass: "assessed",
    verificationSource: "vendor_platform",
    evidenceArtifacts: ["pre/post proficiency score against defined standard", "role-level readiness index", "benchmark percentile"],
    commercialModel: null,
    sourceRefs: [
      { url: "https://insight.skillsoft.com/skills-readiness-assessment/p/1", retrieved_at: "2026-08-01" },
      { url: "https://www.skillsoft.com/meet-skillsoft-percipio", retrieved_at: "2026-08-01" },
    ],
    confirmationGaps: ["G1", "G6"],
    providerOrg: null,
    evidenceAccess: "unconfirmed",
    marketStatus: "active",
    evidenceRatification: "unratified",
  },
];

export interface SeedOfferingsResult {
  tenantId: string;
  inserted: string[];
  skipped: string[];
}

async function resolveTenantId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM tenants WHERE name = 'Skillsoft'",
  );
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one tenant named 'Skillsoft', found ${rows.length}. ` +
      'Not guessing which one — resolve the tenant row before re-running this seed.',
    );
  }
  return rows[0].id;
}

export async function seedOfferings(): Promise<SeedOfferingsResult> {
  const tenantId = await resolveTenantId();

  const actorPersonId = process.env.LVRF_ACTOR_PERSON_ID;
  if (!actorPersonId) {
    throw new Error(
      'LVRF_ACTOR_PERSON_ID is not set. A catalog seed has a person behind ' +
      'it, not an unattributed write — set it to the id of a real, ' +
      'non-simulated person before running this.',
    );
  }

  return withActorTransaction(pool, actorPersonId, async (db: Db) => {
    const inserted: string[] = [];
    const skipped: string[] = [];

    for (const offering of OFFERINGS) {
      const rows = await db
        .insert(schema.offerings)
        .values({ tenantId, ...offering })
        .onConflictDoNothing({
          target: [schema.offerings.tenantId, schema.offerings.offeringKey],
          where: sql`${schema.offerings.deletedAt} IS NULL`,
        })
        .returning({ id: schema.offerings.id });

      if (rows.length > 0) {
        inserted.push(offering.offeringKey);
        console.log(`  inserted  ${offering.offeringKey}`);
      } else {
        skipped.push(offering.offeringKey);
        console.log(`  skipped   ${offering.offeringKey}  (already present)`);
      }
    }

    return { tenantId, inserted, skipped };
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  seedOfferings()
    .then((result) => {
      console.log(
        `\nSeed complete — offerings for tenant ${result.tenantId}. ` +
        `${result.inserted.length} inserted, ${result.skipped.length} already present. ` +
        `${result.inserted.length + result.skipped.length} of ${OFFERINGS.length} accounted for.`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
