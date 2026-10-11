# VirtuSP market and cost research

Research checked **2026-10-11**, USD. Repository inspected at `eb7920b`; this is a document-only research draft. Read alongside [clinical review](CLINICAL-REVIEW-CHECKLIST.md) and [pitch draft](PITCH-RESEARCH-DRAFT.md). No credentials, runtime stores or recovery/evaluation outputs were inspected; no paid inference was run.

Evidence labels: **External finding** = a primary source's result; **Repository observation** = code/document inspection, not a live verification; **Estimate** = arithmetic from declared inputs; **Pilot hypothesis** = a proposal to evaluate. No VirtuSP usage, latency, educational effectiveness or clinical reliability was measured in this research.

Research checkpoint: source/fact review, cost arithmetic, 240-second narration timing, local links, table structure and encoding checked. `npm test` passed **119 automated tests** with credential-file loading and external networking disabled, using isolated test state. These engineering tests do not validate the research assumptions, clinical judgments or bias detection. This window's deliverables are only the three new research documents; the active workflow owner retains the shared handoff and combined application checkpoint.

## Buyer, users and proposed need

**Pilot hypothesis:** offer faculty-controlled conversation practice between supervised classes and standardized-patient sessions. Faculty and human standardized patients retain teaching, physical-examination, debriefing and assessment roles. The value proposition to test is more opportunities to practice a specific objective, with feedback that a faculty reviewer can trace to the conversation. Faculty time savings and better clinical performance are hypotheses, not established benefits.

| Proposed stakeholder | Responsibility to confirm in discovery |
| --- | --- |
| Program lead/course director | Sponsor the pilot and curriculum fit; choose objectives, learner level, scope and budget; decide whether use remains formative. |
| Simulation center | Coordinate with existing SP teaching; review scenario authenticity, accessibility, presentation and debrief; identify practice gaps without assuming SP replacement. |
| Discipline faculty | Own and review cases, urgent-referral wording, released versions, transcript judgments and feedback corrections. |
| University IT/security/privacy/accessibility | Approve identity, permissions, tenancy, vendor contracts, data retention, hosting, operations and accessibility; define incident and support ownership. |
| Learners | Practice within their course and role; report unsupported replies/feedback and reflect before repeating. |

These are proposed responsibilities, not Rutgers procurement findings. Candidate practice tasks need discipline-specific approval:

| Learner discipline | Proposed conversation task | Boundary |
| --- | --- | --- |
| PA | Focused history, uncertainty, shared decisions and referral communication | Faculty specifies supervision and expected clinical reasoning. |
| Nutrition/dietetics | Dietary history, patient goals, feasible counseling and coordination | Do not require an independent medical diagnosis or prescription. |
| Physical therapy | Function/mobility history, goals, fall-safety discussion and escalation | Conversation does not demonstrate a hands-on examination or movement assessment. |
| Nursing | Assessment questions, patient education, safety-netting and escalation/handoff | Match learner level and local course expectations. |
| Medicine | History, synthesis, explanation and shared decisions | Do not represent a text encounter as a full examination or competence certification. |

## Rutgers SHP scale: enrollment is not demand

**External findings**, checked 2026-10-11:

| Quantity | Official evidence and reporting scope | Use/caveat |
| --- | --- | --- |
| SHP enrolled students | **1,320** in the [2024–2025 Community Impact Report, Study section](https://shp.rutgers.edu/community-impact-report/study/); reporting year from the [report cover page](https://shp.rutgers.edu/community-impact-report/) | School enrollment across programs; not a licensed-seat count or all eligible conversation-practice learners. |
| SHP program breadth | **Nearly 30 academic programs**, same Study section | Approximate source wording; exact contemporary degree/certificate count **not found** in that report's web text. |
| PA class size | **50**, [MS Physician Assistant FAQ](https://shp.rutgers.edu/ms-physician-assistant/) | Undated current program page; an advertised class size, not observed 2026 matriculation or total enrollment. |
| Entry-level clinical nutrition | **Maximum 35** across local and remote tracks, [MS Clinical Nutrition for aspiring dietitians](https://shp.rutgers.edu/ms-clinical-nutrition-aspiring-dietitians/) | Undated admissions limit; actual cohort enrollment **not found**. Do not add a separate 35 for each track. |
| DPT current entering cohort / total enrollment | **Not found** in the inspected [DPT program page](https://shp.rutgers.edu/doctor-of-physical-therapy/) | Verify with program owner before a PT-specific forecast; do not estimate enrollment from duration. |
| SHP simulation faculty workload, participating VirtuSP users, concurrent users, monthly encounters | **Not found** | Require pilot data; enrollment does not determine any of these. |

The [Rutgers schools directory](https://www.rutgers.edu/schools-and-colleges) lists nursing and medical schools separately from SHP. Cross-school nursing/medicine interest must not be counted as SHP enrollment. The report PDF failed to open through the research browser; the figures above come from Rutgers' accessible report website, not an inferred PDF extraction. This search is not proof that unavailable figures do not exist elsewhere.

Definitions for all forecasts: **seats** = learners eligible/invited; **monthly active learners** = distinct learners completing at least one encounter that month; **concurrent users** = simultaneous active visits; **encounters** = individual patient visits, including repeats. One completed four-patient group means four encounters, not one.

## Evidence for repeat practice, logistics and educator workload

Three original studies support a rationale for investigation, not a claim that this prototype solves the problem:

| External finding | Population, date and result | Limitation and usable claim |
| --- | --- | --- |
| [Kron et al., randomized virtual-human communication trial](https://pubmed.ncbi.nlm.nih.gov/27939846/) | Published April 2017, online October 29, 2016. **421 second-year medical students**: virtual-human simulation 210, multimedia learning 211. Performance improved on repeat scenario interactions; the simulation arm had higher subsequent composite communication OSCE scores. | Specific MPathic-VR intervention, not this LLM app; simulation/OSCE outcomes do not establish patient-care benefit. Supports testing feedback followed by another attempt, not a universal weekly practice dose. |
| [Howley et al., SP-program survey](https://pubmed.ncbi.nlm.nih.gov/20165521/) | June 29, 2009. Structured interviews with **61 ASPE-affiliated US/Canadian SP programs**. Mean permanent program staff, excluding SPs and temporary staff, **4.8**. | Old, selected program sample and self-report. Shows SP provision includes administration/training; historical wages are not current competitor prices. Does not establish Rutgers staffing or avoidable cost. |
| [Boamah et al., nursing-faculty burnout study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10002003/) | March 1, 2023; survey May–July 2021. **645 Canadian nursing faculty**. Those working more than 45 hours/week had higher total burnout scores than lower-hour groups. | Cross-sectional, voluntary, pandemic-era Canadian educators. Association is not causation; no SHP-faculty prevalence or software savings can be inferred. Avoid the abstract's simplified 3–4-course claim: its reported adjusted pairwise total-score comparison was not significant. |

**Pilot hypothesis:** start with one conversation and one repeat after feedback, then offer two additional attempts in a month. **Four encounters per active learner per month** is a pilot planning input, not an evidence-established optimum. Measure completion, voluntary repeat uptake, corrected feedback and total faculty authoring/review time. Account for new review work as well as any work avoided.

## Alternatives and published prices

Official pages inspected 2026-10-11. Product descriptions are vendor statements, not independent effectiveness evidence. Prices have different scopes; these rows do not support a savings percentage.

| Alternative | Official offering | Published USD price/date | Comparison boundary |
| --- | --- | --- | --- |
| Human SP service: University of Florida ALAC | [SP teaching and assessment center](https://simulation.med.ufl.edu/); [fee schedule](https://simulation.med.ufl.edu/fee-structure/) | Effective **July 1, 2026**: on-site UF internal educational activity **$110/student**; external **$235/student/activity**, comprising $110 plus $125 facilities. | A specific center/activity price, not Rutgers' rate or a 15-minute conversation tariff. Human portrayal, facilities and assessment scope differ. |
| Elsevier Shadow Health | [Screen-based Digital Clinical Experiences for nursing](https://www.elsevier.com/products/shadow-health) | **Not published** on inspected product page; institutional/course pricing must be obtained. | Existing curriculum product; content, term/access period and bundling must be compared. No student-forum prices used. |
| Oxford Medical Simulation | [Clinical VR simulations, analytics and implementation services](https://oxfordmedicalsimulation.com/); [contact/demo route](https://oxfordmedicalsimulation.com/contact/) | **Quote required** to budget; no numeric price published on inspected official pages. | VR/implementation scope and hardware differ; assess role coverage, authoring, support and accessibility in a real quote. |
| Faculty/peer role-play plus existing SP teaching | Current institutional workflow, to inventory with the course owner | **Not found** for Rutgers marginal cost | Salary, rooms and SP costs may already be committed. Do not count all existing expenditure as recoverable savings. |

## Provider and hosting facts requiring engineering confirmation

**Repository observations at `eb7920b`:** [cloud code](../lib/cloud.js) defaults to Bedrock Sonnet 4.6, permits a separate fast selector model, and supports optional direct Anthropic. The direct branch defaults to the code identifier `claude-opus-5-5`; its availability/tariff is **not verified here**. The Sonnet direct example below is an explicitly configured pricing sensitivity, not that branch's default or confirmed active model. [AWS infrastructure](../infra/aws/variables.tf) defaults to Grok 4.7 but its generic region default is us-east-1. The [shared handoff](HANDOFF.md) reports a deployed Grok 4.7 service in **us-west-2** on 2026-10-10. Defaults and a deployment report do not establish the provider on the next recording. The user does not know the engineering choice; confirmation remains outstanding.

The staged encounter can select a topic, return approved wording, or make additional paraphrase/verification calls; some greetings/unknown replies skip calls. An optional configured guardrail is a separate service invocation, not a language-model call. The optional Anthropic conversational branch in [engine code](../lib/engine.js) can fail into the staged path and currently supplies guarded truths to its dialogue model; the handoff flags disclosure/grounding concerns. It must not be described as having the staged path's protections. This research does not resolve those defects.

Owner must confirm: deployed image/checkpoint; provider and exact models for each call; region/inference profile/service tier; dialogue mode; configured guardrail; voice path/account tariff; billable reasoning tokens; retries/timeouts/fallbacks; analysis frequency; session, tenant and storage behavior. No measured production token or speech telemetry was available to this research.

### Price inputs

List prices checked **2026-10-11**, without credits, discounts, cache or batch savings:

| Option | Rate/unit and source | Pricing scope |
| --- | --- | --- |
| Bedrock Grok 4.7 | **$2.20 input / $6.60 output per million tokens**, [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-xai-grok-4-7.html) | Standard **Geo CRIS**; modeled US profile originating in us-west-2. US routing can include multiple US regions; not Oregon-only processing. Global rates $2/$6 are not used. |
| Direct Anthropic Sonnet 4.6 | **$3 input / $15 output per million tokens**, [provider pricing](https://platform.claude.com/docs/en/about-claude/pricing) | First-party API, global default; AWS region is not applicable. Pricing sensitivity only, not a recommendation to switch. |
| Bedrock Sonnet 4.6 sensitivity | **$3.30/$16.50 per million**, derived as direct/global $3/$15 × **1.10** | [Anthropic's cloud-endpoint pricing note](https://platform.claude.com/docs/en/about-claude/pricing) describes the 10% regional premium. Confirm actual AWS endpoint tariff on [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) before treating this derivation as a quote. |
| ElevenLabs Flash/Turbo TTS | **$0.04 per 1,000 characters**, [ElevenAPI pricing](https://elevenlabs.io/pricing/api) | Current pay-as-you-go USD page, not credits; optional Flash v2.5 repository path. Do not use older $0.05 snippets or temporary v4 promotions. |
| ElevenLabs Scribe | Batch **$0.22/hour**; realtime **$0.39/hour**, same page | Examples below use realtime for the assumed connection duration. Browser dictation/typed input instead contributes $0 of this API STT fee. |
| Illustrative Lightsail host | Linux public-IPv4 VM: **$12/month (2 GB)**, **$24 (4 GB)**, **$44 (8 GB)**, [AWS pricing](https://aws.amazon.com/lightsail/pricing/) | An alternative topology for budgeting, not the existing ECS bill or proven capacity. Oregon is a [supported region](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html). |
| Current repository hosting option | [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [EFS](https://aws.amazon.com/efs/pricing/), [RDS](https://aws.amazon.com/rds/postgresql/pricing/), [ALB](https://aws.amazon.com/elasticloadbalancing/pricing/), [CloudFront](https://aws.amazon.com/cloudfront/pricing/), [S3](https://aws.amazon.com/s3/pricing/), [VPC](https://aws.amazon.com/vpc/pricing/), [logs](https://aws.amazon.com/cloudwatch/pricing/) | **Full us-west-2 stack total not verified**. Needs actual task hours, sizing, database, EFS/backup, IP/network and logging usage. Fargate page's visible examples are us-east-1; do not silently price Oregon from them. |

### Reproducible per-encounter assumptions

**Estimates, not measurements.** The mentor's **15-minute encounter** is a planning assumption awaiting discipline review. Turn count and transcript size do not follow automatically from duration. Output budgets include an assumed allowance for billable reasoning; recorded reply length alone cannot price Grok high reasoning. Every call includes prompts, schemas, context and retransmitted conversation; there is no cache discount. High is a sensitivity case, not a spending ceiling.

| Input | Low | Base | High |
| --- | ---: | ---: | ---: |
| Student/patient exchanges | 12 | 20 | 30 |
| Average dialogue LLM calls per exchange | 2 | 2.5 | 3 |
| Input / output tokens per dialogue call | 1,500 / 150 | 2,500 / 600 | 4,000 / 1,500 |
| One assessment + audit: summed input / output | 14,000 / 2,700 | 24,000 / 4,500 | 40,000 / 6,500 |
| Rephrasing: input / output | 0 / 0 | 3,000 / 800 | 6,000 / 1,500 |
| Optional bias analysis: summed input / output when requested | Not requested | 24,000 / 4,800 on 25% of encounters | 40,000 / 8,500 on all encounters |
| Expected extra assessment + audit revision | None | 10% × 24,000 / 4,500 | One × 40,000 / 6,500 |
| Optional case-specific checklist | None | None | 12,000 / 2,200; only on an appropriate reviewed case |
| Additional paid retry/failed-call reserve applied to all token totals | 5% | 10% | 25% |
| Spoken patient output | Text only | 6,000 characters | 12,000 characters |
| Paid realtime STT connection | None | 15 minutes | 20 minutes, allowing idle/reconnect time |
| Additional speech replay/retry reserve | 0% | 5% | 15% |
| Attributable storage/network reserve | $0.001 | $0.005 | $0.020 |

Average calls are allowances across mixed turn types, not a trace of the implementation. Assessment includes model review; explicit revisions are separate from the extra failure/retry reserve. A fallback can still cost money for a failed or completed rejected call; local fallback itself adds no LLM fee. For mixed models, price each call at its own rate. Here all calls use the same rate to make the sensitivity reproducible. Group-level analysis must be allocated once across its constituent encounters; the percentages here represent an allocated per-encounter budget, not a claim about the current group payload.

Storage/network reserves are **budget assumptions, not quoted AWS unit charges**. Planning payloads: 0.2/1/5 MB of text/logs per encounter retained for one month, and 0/5/20 MB of attributable outbound media. Camera video is not assumed stored. They leave room for request overhead and versioned backup; actual retention, repeated whole-store writes, static-video downloads and egress can exceed them. Use [S3 pricing](https://aws.amazon.com/s3/pricing/) and the chosen host/network tariff with measured bytes and requests before purchase. Included host transfer is not charged again when reconciling the bill.

```text
For each priced call j:
  AI cost = SUM_j(input_tokens_j * input_USD_per_M / 1,000,000
                + output_tokens_j * output_USD_per_M / 1,000,000)
Voice = (TTS_characters / 1,000 * TTS_USD_per_1K
        + STT_minutes / 60 * STT_USD_per_hour) * speech_retry_multiplier
Variable = AI + Voice + attributable_storage_network
Monthly = encounters_per_month * Variable + fixed_hosting_operations
Per_active_learner = Monthly / monthly_active_learners
```

If configured, separately add paid guardrail text units at the selected policy's [official rate](https://aws.amazon.com/bedrock/pricing/). They are excluded here because configuration is unconfirmed. Also excluded: image/video generation, recording hosting, paid OCR, setup/migration, institutional security review and faculty case/feedback labor. These exclusions prevent treating the estimates as a complete production quote.

| Calculated quantity | Low | Base | High |
| --- | ---: | ---: | ---: |
| Total input tokens after reserves | 52,500 | 176,440 | 622,500 |
| Total output tokens after reserves | 6,615 | 40,645 | 200,250 |
| AI: Grok Geo CRIS | $0.159159 | $0.656425 | $2.691150 |
| AI: direct Sonnet sensitivity, same token budget | $0.256725 | $1.138995 | $4.871250 |
| AI: derived regional Sonnet sensitivity | $0.282398 | $1.252895 | $5.358375 |
| Voice | $0 | $0.354375 | $0.701500 |
| Storage/network reserve | $0.001 | $0.005 | $0.020 |
| **Variable, Grok example** | **$0.160159** | **$1.015800** | **$3.412650** |

For example, base input = `(20*2.5*2500 + 24000 + 3000 + .25*24000 + .10*24000)*1.10 = 176440`. Base output = `(20*2.5*600 + 4500 + 800 + .25*4800 + .10*4500)*1.10 = 40645`. Base AI = `176440*2.20/1e6 + 40645*6.60/1e6 = $0.656425`; base voice = `(6000*.04/1000 + 15*.39/60)*1.05 = $0.354375`. Round only final displayed totals. Same-budget comparisons do not establish equal quality, tokenization, speed or call count across providers.

### Monthly hosting/operations and school scenarios

An illustrative **Lightsail-based pilot budget**, not a quote for the deployed ECS architecture:

| Fixed monthly input | Low | Base | High |
| --- | ---: | ---: | ---: |
| Published VM list-price input | $12 | $24 | $44 |
| Assumed additional infrastructure reserve: backups, logs, identity/network tooling, etc. | $38 | $126 | $456 |
| Assumed operations labor | 2 h × $50 = $100 | 6 h × $50 = $300 | 16 h × $75 = $1,200 |
| **Fixed hosting/operations F** | **$150** | **$450** | **$1,700** |

Labor rates/hours and infrastructure reserves are explicit budgeting assumptions, not Rutgers wages or provider prices. They do not establish that institutional requirements are covered. University-managed existing compute could change incremental charges but still has an internal cost and named operations owner. Existing multi-task ECS/EFS/RDS/ALB/CloudFront requires its own line-item estimate; this budget must not be called its observed bill.

| Scenario, fixed volume across sensitivity columns | Low monthly | Base monthly | High monthly |
| --- | ---: | ---: | ---: |
| **PA-sized cohort:** 50 invited seats; 40 active; 4 encounters/active/month = 160 | $175.63 | $612.53 | $2,246.02 |
| **School pilot across five courses:** 250 invited seats; 200 active; 4 encounters/active/month = 800 | $278.13 | $1,262.64 | $4,430.12 |
| School-pilot cost/active learner/month | $1.39 | $6.31 | $22.15 |

The five-course pilot is proposed; no Rutgers adoption, course size or participation agreement is implied. The PA example uses the published 50 as a sizing anchor; 40 active is an assumed 80% participation, not a reported cohort. Keeping volume fixed makes the low/base/high cost inputs comparable. If practice frequency is 2 or 8 rather than 4, replace 800 with 400 or 1,600; fixed costs do not halve/double. With the derived regional Sonnet base price, the 800-encounter total becomes **$1,739.82**, before excluded costs.

**Separately labeled scale sensitivity: 1,000 encounters/day**, every day in a 30-day month = 30,000. Same assumed mixes: variable daily **$160.16 / $1,015.80 / $3,412.65**; monthly including the illustrative F **$4,954.77 / $30,924.00 / $104,079.50**. These are arithmetic sensitivities, not a guaranteed bill or a sufficient hosting budget for this load. Engineering must replace F with measured/sized architecture costs before a forecast. Active learners are unspecified, so cost/active learner is **not calculable** for this scenario.

At an assumed 15 minutes/visit, 1,000/day requires 250 encounter-hours/day: about **31.25 concurrent visits on average** if spread evenly across eight hours; peaks can be much higher. That is workload arithmetic, not capacity. Model quotas, call bursts, speech limits, backpressure, persistent sessions and shared-state writes remain unresolved. [ECS autoscaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html) can adjust task count, but does not make application state distributed. The handoff's local mocked/offline load tests do not establish cloud capacity or latency with real AI traffic.

### Authoring and customer pricing are separate

Authoring budget per new case, including draft/review and repair allowance: low **20,000 input/4,000 output × 1.05**; base **40,000/8,000 × 1.10**; high **80,000/16,000 × 1.25**. At Grok Geo rates: **$0.07392 / $0.15488 / $0.35200** per case. These are assumptions, not observed extraction cost or completeness. Add faculty authoring/review separately: proposed **1 h × $75 = $75 / 2 h × $100 = $200 / 4 h × $150 = $600** per case. Ten cases would budget $0.74–$3.52 AI plus $750–$6,000 human review, excluding document acquisition, supplements and additional clinical review. Revisions of case content need renewed review and publication; earlier immutable versions remain preserved.

**No customer seat price is proposed as fact.** Internal provider cost/active learner is not a sale price per enrolled seat. A commercial offer also needs support, security/privacy/accessibility work, institutional onboarding, case review, vendor minimums, idle seats, incident response and margin. A pricing formula could be `(operating + review + support + setup allocation)/(1 - proposed gross margin)/contracted seats`; inputs and margin require owner decisions and a buyer conversation. Hackathon credits are excluded from all calculations.

## University hosting and Canvas feasibility

**Proposed later implementation:** university-managed VM/container hosting is technically plausible, with the existing Node/container and AWS work as a starting point. [AWS Cognito SAML federation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-saml-idp.html) is one identity option, not an installed Rutgers integration. Real authentication, server authorization, tenant separation, session persistence across instances, retention/deletion rules, backup/restore tests, auditability, privacy/security/accessibility review and operational ownership need decisions. A TLS endpoint and demo-role cookie do not establish institutional readiness. Use synthetic cases and learner records approved for the pilot; no real patient records are needed.

**Canvas is a future path, not built integration.** [Canvas LTI documentation](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools_intro), [configuration](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_dev_key_config) and [launch overview](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview) describe LTI 1.3/LTI Advantage. Work includes admin-approved registration/deployment, OIDC launch and signed-token validation (issuer/audience, expiry, state/nonce and keys), course/role-to-app permission mapping and per-deployment isolation. Deep linking, roster access and grade return are separate scoped services; request only needed data. A plain link is a smaller pilot step, but does not provide SSO or assignment/grade sync. The current framing policy/session architecture also needs review for embedded launches. Do not return an unreviewed automated rubric as a high-stakes Canvas grade.

## Unresolved facts and proposed pilot measurements

- **Medical student/faculty:** relevant cohort size and actual course demand; discipline objectives and 15-minute suitability; urgent-referral case; faculty minutes per case/feedback review; strong/weak transcript corrections; acceptable formative use and debrief wording.
- **Engineering:** recording provider/mode/image; all-call token and reasoning usage, retry/fallback counts, speech characters/connection minutes, region/tariffs and optional guardrail; actual ECS bill; identity/state/tenancy readiness; latency/capacity under a controlled real-provider pilot.
- **Institution/course owner:** contemporary program counts and DPT enrollment; participating learners; existing SP costs and what spending is actually incremental; IT/security/retention owner; vendor quotes and commercial terms.
- **Pilot hypotheses to measure:** four attempts/month is tolerable; learners repeat after one actionable coaching point; faculty can correct evidence-linked feedback efficiently. Record total review effort and independent human judgments, not just automated score changes. No causal educational or bias claim follows from a small uncontrolled pilot.

## Source table

All live pages accessed 2026-10-11; undated pages have no verified publication date. Links in the body identify the claim location.

| Claim | Source / publisher | Publication or pricing date | Scope and caveat |
| --- | --- | --- | --- |
| 1,320 students; nearly 30 programs | [Study](https://shp.rutgers.edu/community-impact-report/study/) and [cover](https://shp.rutgers.edu/community-impact-report/), Rutgers SHP | Reporting 2024–2025; page publication date not stated | Enrollment and approximate breadth, not app demand. |
| PA 50; nutrition maximum 35; missing DPT figures | [PA](https://shp.rutgers.edu/ms-physician-assistant/), [nutrition](https://shp.rutgers.edu/ms-clinical-nutrition-aspiring-dietitians/), [DPT](https://shp.rutgers.edu/doctor-of-physical-therapy/), Rutgers SHP | Undated, checked 2026-10-11 | Advertised class/capacity vs actual enrollment. |
| Nursing/medicine outside SHP count | [Schools directory](https://www.rutgers.edu/schools-and-colleges), Rutgers | Undated | Institutional boundaries, not a market total. |
| Repeat practice with feedback | [Kron et al.](https://pubmed.ncbi.nlm.nih.gov/27939846/), Patient Education and Counseling | Online 2016-10-29; issue 2017-04 | 421 medical students; different system; no VirtuSP validation. |
| SP logistics/staff | [Howley et al.](https://pubmed.ncbi.nlm.nih.gov/20165521/), Medical Education Online / ASPE study | 2009-06-29 | 61 programs; old self-reported staffing, not modern unit prices. |
| Educator hours/burnout association | [Boamah et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC10002003/), IJERPH | 2023-03-01; survey 2021 | 645 Canadian nursing faculty; no Rutgers or causal savings estimate. |
| Human SP activity price | [Fee schedule](https://simulation.med.ufl.edu/fee-structure/), University of Florida CELS | Effective 2026-07-01 | Specific service/facilities scope. |
| Digital alternatives/pricing absent | [Shadow Health](https://www.elsevier.com/products/shadow-health), Elsevier; [OMS](https://oxfordmedicalsimulation.com/), Oxford Medical Simulation | Undated, checked 2026-10-11 | Vendor offerings; quote/price absent from inspected pages. |
| Grok Geo token rates/routing | [Model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-xai-grok-4-7.html), AWS | Live list pricing checked 2026-10-11 | Standard tier; selected inference option matters. |
| Sonnet rates/premium | [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), Anthropic; [Bedrock](https://aws.amazon.com/bedrock/pricing/), AWS | Live pricing checked 2026-10-11 | Direct vs cloud endpoint; regional figure is a derivation pending tariff confirmation. |
| Speech rates | [ElevenAPI](https://elevenlabs.io/pricing/api), ElevenLabs | Live pricing checked 2026-10-11 | USD per characters/hour; account terms and concurrency unverified. |
| VM prices/Oregon availability | [Pricing](https://aws.amazon.com/lightsail/pricing/) and [regions](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html), AWS | Live list pricing checked 2026-10-11 | Alternative illustrative topology; reserves are our estimates. |
| Full AWS stack must be priced | [Fargate](https://aws.amazon.com/fargate/pricing/) and service links in price-input table, AWS | Checked 2026-10-11 | No complete Oregon stack quote; regional dynamic rates need confirmation. |
| Scaling/federation feasibility | [ECS scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html), [SAML](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-saml-idp.html), AWS | Undated current docs | Infrastructure capability does not resolve application/session governance. |
| Canvas feasibility | [LTI](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools_intro), [configuration](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_dev_key_config), [launch](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview), Instructure | Undated current docs | Required implementation path, not completed work. |
| Current repository claims | [HANDOFF](HANDOFF.md), [objective workflow](OBJECTIVE-WORKFLOW.md), source files linked above | Checkpoint `eb7920b`, inspected 2026-10-11 | Repository observations; live recording and safeguards remain owner-verification items. |
| Usage/cost/pilot proposals | Assumption tables and arithmetic in this brief | 2026-10-11 | Estimates/hypotheses; no measured bill, reliability or capacity. |
