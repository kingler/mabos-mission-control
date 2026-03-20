# Goals — Fulfillment Manager

## Delegated Goals (from Stakeholder)

- **DG-FUL-1**: Operate reliable, automated order fulfillment through Pictorem to support VividWalls growth to $13.7M Year 5 revenue
  - Delegated by: Kingler Bercy (Stakeholder Principal) via COO
  - Measure: >95% auto-fulfillment, zero lost orders, <48hr order-to-ship
  - Timeline: Ongoing — operational from day one

- **DG-FUL-2**: Maintain fulfillment infrastructure resilience so that no customer order is ever lost or indefinitely delayed
  - Delegated by: Kingler Bercy (Stakeholder Principal) via COO
  - Measure: Zero lost orders, <5% error rate, all errors resolved within 20 minutes
  - Timeline: Ongoing

## Strategic Goals

- **G-FUL-1**: Achieve >95% auto-fulfillment rate
  - Rationale: Manual fulfillment does not scale. At projected volumes ($13.7M Year 5 = thousands of monthly orders), automated submission through CDP is the only viable path. Every percentage point of automation failure creates manual overhead.
  - Success criteria: Rolling 30-day auto-fulfillment rate >95%, measured as (orders auto-submitted to Pictorem) / (total paid orders received)
  - Timeline: Ongoing, target from first month of operations
  - Dependencies: Print-ready images available in PostgreSQL (Product Manager/Inventory Manager), Payment Bridge operational (CTO)

- **G-FUL-2**: Maintain <5% pipeline error rate
  - Rationale: Errors across all failure states (automation_error, submission_failed, image_download_failed, automation_partial, blocked_no_print_image) must stay low to maintain customer trust and operational efficiency.
  - Success criteria: Rolling 7-day error rate <5%, no single error type exceeding 2%
  - Timeline: Ongoing
  - Dependencies: Stable Pictorem UI (external), robust CDP selectors, reliable infrastructure

## Tactical Goals

- **G-FUL-3**: Resolve all pipeline failures within 20 minutes of detection
  - Rationale: Fast error resolution prevents order backlogs, maintains customer SLAs, and catches cascading failures early. 20-minute resolution enables same-day resubmission for most errors.
  - Success criteria: Mean time to resolution (MTTR) <20 minutes for all error categories, 95th percentile <45 minutes
  - Timeline: Ongoing
  - Dependencies: Error alerting system, documented remediation runbooks, CTO escalation path

- **G-FUL-4**: Maintain Payment Bridge (port 3001) uptime >99%
  - Rationale: Payment Bridge is the single point through which all Shopify webhooks flow to Pictorem submission. Downtime = zero fulfillment. 99% uptime allows ~7.3 hours/month downtime maximum.
  - Success criteria: Monthly uptime >99%, no single downtime event exceeding 30 minutes, health check monitoring active
  - Timeline: Ongoing
  - Dependencies: CTO infrastructure support, server monitoring tools

- **G-FUL-5**: Build automated retry system for transient failures
  - Rationale: Many CDP failures (network timeouts, DOM loading delays, session expiry) are transient and resolve on retry. Automated retry with exponential backoff can recover 60-80% of transient failures without human intervention.
  - Success criteria: Automated retry handles DOM timeouts, network errors, and session expiry; reduces manual escalation by 50%
  - Timeline: 45 days after pipeline is operational
  - Dependencies: Error categorization complete (G-FUL-2 data), CTO approval for retry infrastructure

## Operational Goals

- **G-FUL-6**: Track every paid Shopify order through complete fulfillment lifecycle — zero lost orders
  - Rationale: A lost order (paid but never fulfilled, never refunded, never tracked) is the worst possible customer experience and a business-ending pattern if systemic.
  - Success criteria: Daily reconciliation of Shopify paid orders vs. fulfillment status in PostgreSQL, zero unaccounted orders older than 24 hours
  - Timeline: Ongoing from first order
  - Dependencies: Shopify webhook reliability, PostgreSQL order tracking schema

- **G-FUL-7**: Create failure pattern library documenting all known error types
  - Rationale: Documented failure patterns accelerate diagnosis, enable automated remediation, and serve as training data for predictive failure detection.
  - Success criteria: Library covers all 7 status states, includes root causes, remediation steps, and frequency data for each pattern
  - Timeline: 60 days, then ongoing updates
  - Dependencies: Sufficient order volume to observe failure patterns

- **G-FUL-8**: Report fulfillment metrics to COO weekly
  - Rationale: Operational transparency enables informed decisions about capacity, partner relationships, and infrastructure investment.
  - Success criteria: Weekly report covering auto-fulfillment rate, error rate by category, MTTR, bridge uptime, and order volume trends
  - Timeline: Ongoing
  - Dependencies: Metrics collection infrastructure

## Learning & Self-Improvement Goals

- **L-FUL-1**: Master CDP browser automation resilience patterns
  - Objective: Achieve expert-level proficiency in building robust, failure-resistant CDP automation that survives Pictorem UI changes, network variability, and edge cases
  - Learning path: Study robust selector strategies (data attributes > CSS > XPath), implement intelligent wait patterns (explicit waits, MutationObserver), research anti-detection techniques, build DOM change detection
  - Success criteria: Can design a CDP flow that tolerates minor DOM changes without code updates, selector failure rate <1%
  - Timeline: 30 days

- **L-FUL-2**: Learn predictive failure detection for automation pipelines
  - Objective: Move from reactive error handling to proactive failure prevention by monitoring leading indicators of pipeline degradation
  - Learning path: Study performance baseline establishment, anomaly detection algorithms, DOM change monitoring, session health indicators, Pictorem response time trends
  - Success criteria: Can identify and alert on at least 3 leading indicators of imminent automation failure before orders are affected
  - Timeline: 60 days

- **L-FUL-3**: Study error categorization and automated remediation
  - Objective: Build systematic approach to classifying, diagnosing, and auto-resolving pipeline failures without human intervention
  - Learning path: Failure taxonomy design, decision tree construction for auto-remediation, escalation logic, SRE runbook best practices
  - Success criteria: Documented decision tree that auto-resolves 70%+ of transient failures, clearly escalates persistent failures with diagnostic context
  - Timeline: 45 days

- **L-FUL-4**: Develop self-healing automation techniques
  - Objective: Build automation that adapts to changes in Pictorem's UI without manual selector updates — the ultimate resilience goal
  - Learning path: Adaptive selector strategies (visual matching, relative positioning, semantic selectors), fallback flow paths, session recovery patterns, ML-based element identification
  - Success criteria: Prototype self-healing mechanism that auto-adapts to at least 1 common DOM change pattern (e.g., class name changes on form fields)
  - Timeline: 90 days

- **L-FUL-5**: Improve fulfillment speed optimization
  - Objective: Reduce end-to-end time from webhook receipt to Pictorem submission, enabling faster customer delivery
  - Learning path: Queue optimization, batch submission strategies, parallel browser instance management, off-peak scheduling analysis, Pictorem submission time profiling
  - Success criteria: Reduce median webhook-to-submission time by 30%, identify and implement at least 2 speed optimization techniques
  - Timeline: 60 days
