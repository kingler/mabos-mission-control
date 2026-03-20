# Beliefs — Inventory Manager

Last updated: 2026-03-20
Revision count: 0

## Environment Beliefs

| ID | Belief | Value | Certainty | Source | Updated |
| --- | ------ | ----- | --------- | ------ | ------- |
| BE-INV-001 | Print-on-demand market is growing steadily, driven by personalization trends and AI art adoption | Growth rate ~12% YoY | 0.85 | Industry reports, Pictorem volume data | 2026-03-20 |
| BE-INV-002 | Multiple print partners exist (Pictorem, Printful, Gooten, Gelato) but quality varies significantly by substrate and partner | Pictorem highest canvas quality for art reproduction | 0.90 | Partner evaluation, sample testing | 2026-03-20 |
| BE-INV-003 | Quality varies dramatically across print substrates — canvas wraps outperform paper for color vibrancy, metal prints excel for modern/abstract styles | Substrate-quality mapping exists | 0.82 | Sample print comparisons, customer feedback | 2026-03-20 |
| BE-INV-004 | Shipping costs are rising across all carriers, impacting margins on lower-priced items (sub-$50 prints) | 8-15% shipping cost increase YoY | 0.78 | Carrier rate cards, Pictorem shipping data | 2026-03-20 |
| BE-INV-005 | AI-generated art requires higher DPI source files (300+ DPI at print size) to avoid artifacts visible on large-format prints | Minimum 300 DPI at final print dimensions | 0.95 | Print testing, Pictorem specs | 2026-03-20 |
| BE-INV-006 | Seasonal demand patterns exist: holiday gift season (Nov-Dec) drives 35-40% of annual volume, spring home refresh (Mar-Apr) is secondary peak | Seasonality confirmed | 0.75 | E-commerce industry data, early sales signals | 2026-03-20 |

## Self Beliefs

| ID | Belief | Value | Certainty | Source | Updated |
| --- | ------ | ----- | --------- | ------ | ------- |
| BS-INV-001 | Primary role is managing supplier relationships and product catalog quality — not physical inventory (print-on-demand model eliminates warehousing) | No physical inventory required | 0.98 | Business model definition | 2026-03-20 |
| BS-INV-002 | Quality verification is the highest-value function — defective prints damage brand reputation and create costly returns | Quality gate is critical path | 0.92 | Customer satisfaction data, return cost analysis | 2026-03-20 |
| BS-INV-003 | Catalog breadth across 6 style categories (abstract, minimalist, nature, urban, portrait, geometric) drives discovery and conversion | Style diversity = revenue diversity | 0.80 | Product analytics, CMO insights | 2026-03-20 |
| BS-INV-004 | Print partner redundancy is an existential risk mitigation — single partner dependency could halt all fulfillment | Backup partner is urgent priority | 0.88 | Risk assessment, COO directive | 2026-03-20 |
| BS-INV-005 | Current substrate knowledge is strongest for canvas wraps, weakest for metal prints — gap needs closing | Metal print expertise is a gap | 0.70 | Self-assessment | 2026-03-20 |

## Agent Beliefs

| ID | About | Belief | Value | Certainty | Source | Updated |
| --- | ----- | ------ | ----- | --------- | ------ | ------- |
| BA-INV-001 | Fulfillment Manager | Executes orders through Pictorem via CDP automation on Payment Bridge (port 3001); depends on accurate print-ready image availability | Pipeline operator, downstream dependency | 0.95 | System architecture, operational handoff | 2026-03-20 |
| BA-INV-002 | Product Manager | Defines catalog requirements including style categories, sizing matrix, and pricing tiers; drives which products get created | Product definition authority | 0.88 | Role definition, collaboration history | 2026-03-20 |
| BA-INV-003 | COO | Sets quality standards, defect rate targets (<2%), and supply chain resilience requirements; direct reporting line | Operational authority, SLA setter | 0.95 | Org structure, COO directives | 2026-03-20 |
| BA-INV-004 | Creative Director | Ensures all designs meet VividWalls brand standards before catalog inclusion; aesthetic quality gate | Brand guardian, upstream dependency | 0.85 | Brand guidelines, creative review process | 2026-03-20 |
| BA-INV-005 | CTO | Maintains PostgreSQL product database and Shopify sync; technical infrastructure for catalog management | Technical enabler | 0.82 | System architecture | 2026-03-20 |

## Business Beliefs

| ID | Belief | Value | Certainty | Source | Updated |
| --- | ------ | ----- | --------- | ------ | ------- |
| BB-INV-001 | Target catalog size is 500+ designs across 6 style categories to provide sufficient browsing depth and SEO surface area | 500+ designs, 6 categories | 0.90 | Product strategy, CEO vision | 2026-03-20 |
| BB-INV-002 | Pictorem is the primary print partner — best canvas quality, acceptable pricing, but no official API (CDP automation required) | Pictorem = primary partner | 0.95 | Partner evaluation, fulfillment architecture | 2026-03-20 |
| BB-INV-003 | A qualified backup print partner is needed for business continuity — ideally with API access for more reliable automation | Backup partner = high priority | 0.85 | Risk assessment, COO requirement | 2026-03-20 |
| BB-INV-004 | Print types supported: paper prints, canvas wraps, framed prints, metal prints — canvas wraps are highest margin and volume | 4 print types, canvas wraps lead | 0.90 | Product catalog, sales data | 2026-03-20 |
| BB-INV-005 | Size range from 8x10 to custom dimensions; medium prints (16x20 to 24x36) are the volume sweet spot at $79-$129 | Medium prints = core revenue | 0.82 | Pricing strategy, early sales patterns | 2026-03-20 |
| BB-INV-006 | Defect rate target is <2% across all substrates and sizes — currently unmeasured, needs baseline | <2% defect target | 0.88 | COO quality standards | 2026-03-20 |
| BB-INV-007 | Year 5 revenue target of $13.7M requires catalog to scale to thousands of designs with automated quality assurance | Scale requires automation | 0.75 | Financial projections, CFO model | 2026-03-20 |

## Learning Beliefs

| ID | Belief | Knowledge Gap | Priority | Source | Updated |
| --- | ------ | ------------- | -------- | ------ | ------- |
| BL-INV-001 | Print technology is advancing — new substrates (acrylic, bamboo) and printing methods (direct-to-substrate UV) could expand product line | Emerging substrate and print tech evaluation | High | Industry trend monitoring | 2026-03-20 |
| BL-INV-002 | Automated quality assessment via computer vision could replace manual sample reviews at scale | CV-based print quality inspection | Medium | CTO research, industry tools | 2026-03-20 |
| BL-INV-003 | Supplier evaluation methodologies (scorecards, SLA frameworks) exist in manufacturing — adaptable to print-on-demand | Formal supplier evaluation framework | High | Supply chain management literature | 2026-03-20 |
| BL-INV-004 | Color management across different substrates requires ICC profile knowledge and soft-proofing techniques | ICC profiles and color management for art reproduction | Medium | Print industry standards | 2026-03-20 |
| BL-INV-005 | Vendor negotiation leverage increases with volume — understanding volume discount structures is a gap | Volume-based pricing negotiation | Low | Business development best practices | 2026-03-20 |

## Belief Revision Log

| Date | ID | Change | Old | New | Source |
| ---- | -- | ------ | --- | --- | ------ |
| 2026-03-20 | — | Initial belief set established | — | All beliefs initialized | System initialization, stakeholder directives |
