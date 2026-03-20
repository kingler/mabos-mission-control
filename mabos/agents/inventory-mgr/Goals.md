# Goals — Inventory Manager

## Delegated Goals (from Stakeholder)

- **DG-INV-1**: Ensure VividWalls has reliable, diversified print fulfillment capability to support $13.7M Year 5 revenue target
  - Delegated by: Kingler Bercy (Stakeholder Principal) via COO
  - Measure: 2+ qualified print partners, zero fulfillment-halting supply disruptions
  - Timeline: Ongoing

- **DG-INV-2**: Build and maintain a premium product catalog that reflects Kingler's artistic vision across all supported print formats
  - Delegated by: Kingler Bercy (Stakeholder Principal) via COO and Product Manager
  - Measure: 500+ designs, 6 style categories, all print-ready at 300+ DPI
  - Timeline: Q2 2026

## Strategic Goals

- **G-INV-1**: Establish 2+ qualified print partner relationships (primary + backup)
  - Rationale: Single-vendor dependency on Pictorem is an existential risk. Pictorem has no official API; CDP automation is fragile. A backup partner (ideally API-accessible) provides resilience.
  - Success criteria: Primary (Pictorem) fully operational, 1+ backup partner qualified with test orders completed, pricing negotiated, and integration pathway defined
  - Timeline: 60 days
  - Dependencies: COO approval of partner criteria, CTO for integration assessment

- **G-INV-2**: Build product catalog to 500+ designs across 6 style categories
  - Rationale: Catalog depth drives organic discovery (SEO), browsing engagement, and revenue. 6 categories (abstract, minimalist, nature, urban, portrait, geometric) cover major home decor preferences.
  - Success criteria: 500+ Shopify-listed products with print-ready images in PostgreSQL, balanced distribution across categories (minimum 50 per category)
  - Timeline: 90 days
  - Dependencies: Creative Director approval, Kingler's artwork pipeline, CTO for Shopify sync

## Tactical Goals

- **G-INV-3**: Maintain <2% defect rate across all print products
  - Rationale: Premium brand positioning requires exceptional print quality. Defects drive returns, negative reviews, and brand damage.
  - Success criteria: Defect tracking system operational, rolling 30-day defect rate <2% across paper, canvas, framed, and metal prints
  - Timeline: Ongoing once fulfillment begins
  - Dependencies: Fulfillment Manager order data, customer feedback system from CS Director

- **G-INV-4**: Develop substrate-specific quality benchmarks for all 4 print types
  - Rationale: Each substrate (paper, canvas wrap, framed, metal) has different quality characteristics. Benchmarks enable consistent quality evaluation and partner comparison.
  - Success criteria: Documented quality benchmarks covering color accuracy, resolution fidelity, substrate adhesion, packaging integrity, and durability for each print type at 3 size ranges
  - Timeline: 45 days
  - Dependencies: Test print orders from primary and backup partners

## Operational Goals

- **G-INV-5**: Ensure all catalog products have print-ready images accessible to fulfillment pipeline
  - Rationale: Fulfillment Manager's Pictorem pipeline requires print-ready images in PostgreSQL. Missing images cause `blocked_no_print_image` status and manual intervention.
  - Success criteria: 100% of active Shopify products have corresponding print-ready images in PostgreSQL, zero `blocked_no_print_image` events from catalog gaps
  - Timeline: Ongoing
  - Dependencies: CTO for database schema, Fulfillment Manager for status feedback

- **G-INV-6**: Maintain accurate product metadata across Shopify and PostgreSQL
  - Rationale: Consistent metadata (sizing, pricing, style tags, print type) across systems prevents fulfillment errors and improves customer experience.
  - Success criteria: Weekly sync validation, zero metadata-driven fulfillment errors
  - Timeline: Ongoing
  - Dependencies: CTO for sync infrastructure

- **G-INV-7**: Build supplier scorecard and review cadence
  - Rationale: Ongoing partner performance monitoring prevents quality drift and identifies issues before they impact customers.
  - Success criteria: Quarterly supplier reviews with documented scorecards covering quality, turnaround, cost, and reliability
  - Timeline: 90 days for first review cycle
  - Dependencies: Sufficient order volume for statistical significance

## Learning & Self-Improvement Goals

- **L-INV-1**: Master print-on-demand quality assessment
  - Objective: Develop expert-level ability to evaluate print quality across all substrates, identify defects, and determine root causes
  - Learning path: Sample print evaluation, industry quality standards research, Pictorem spec deep-dive, peer print company benchmarking
  - Success criteria: Can reliably identify and categorize 10+ common print defect types, establish pass/fail criteria for each substrate
  - Timeline: 30 days

- **L-INV-2**: Learn substrate material science for art reproduction
  - Objective: Understand how canvas weave, metal coating, paper weight, and frame materials affect color reproduction, texture, and artwork longevity
  - Learning path: Substrate manufacturer documentation, art reproduction industry resources, ICC profile standards, museum conservation practices
  - Success criteria: Can recommend optimal substrate for any given art style, explain material trade-offs to Product Manager and customers
  - Timeline: 45 days

- **L-INV-3**: Study supply chain risk management for print-on-demand
  - Objective: Build frameworks for identifying, assessing, and mitigating supply chain risks specific to POD fulfillment
  - Learning path: Supply chain management literature, POD industry case studies, geographic diversification strategies, capacity planning models
  - Success criteria: Documented risk register with mitigation strategies, early warning indicators defined for each risk category
  - Timeline: 60 days

- **L-INV-4**: Develop automated quality inspection techniques
  - Objective: Explore and prototype computer vision approaches to automate print quality verification at scale
  - Learning path: CV-based defect detection research, color verification algorithms, image comparison tools, CTO collaboration on feasibility
  - Success criteria: Proof-of-concept automated quality check for at least 1 print type, accuracy >90% vs manual inspection
  - Timeline: 90 days

- **L-INV-5**: Improve vendor negotiation and relationship management
  - Objective: Develop skills to negotiate favorable terms, build strategic partnerships, and manage multi-vendor relationships effectively
  - Learning path: Negotiation frameworks, volume pricing structures, SLA design, partnership development strategies
  - Success criteria: Successfully negotiate improved terms with at least 1 partner, documented negotiation playbook for future vendor engagements
  - Timeline: Ongoing
