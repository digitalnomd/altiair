# Altier's Darkmesh Product Flow Chart

Darkmesh is a squad-level edge intelligence mesh. Each soldier carries an edge device that gathers local sensor data, filters it locally, exchanges compact evidence with nearby peers in a resilient ring, and can upload to or download from Palantir Foundry/CASK when that device has the best secure internet path.

![Darkmesh product flow chart](../assets/pitch/product-flow-chart.svg)

## Product Flow

```mermaid
flowchart TD
  subgraph Squad["Squad edge ring"]
    A["Soldier A edge device\ncamera + mic + report"]
    B["Soldier B edge device\nRFID / RF + mic"]
    C["Soldier C edge device\nAnduril Hawkeye/EagleEye feed"]
    D["Soldier D edge device\nRF / RFID + operator notes"]
    A --> B --> C --> D --> A
  end

  A --> Filter["Local filtering\nrules + local LLM assist"]
  B --> Filter
  C --> Filter
  D --> Filter

  Filter --> Evidence["Signed compact evidence\nnot raw continuous feeds"]
  Evidence --> Ledger["Replicated mission ledger\nstore-forward + peer gossip"]
  Ledger --> Fusion["Distributed fusion\nconfidence, freshness, contradictions"]
  Fusion --> Queue["Human-review cue queue"]
  Queue --> Display["Pi-hosted / wearable display"]

  Ledger --> Gateway{"Which edge device has\nbest secure internet path?"}
  Gateway -- "selected soldier device" --> Foundry["Palantir Foundry / CASK\nontology sync + after-action record"]
  Gateway -- "no" --> Local["Continue local DDIL operation\nqueue reconciliation"]
  Local --> Ledger
  Foundry --> Context["Governed mission context"]
  Context --> Fusion
```

## Logo Note

This chart uses text wordmark/logo badges for `Darkmesh`, `Raspberry Pi`, `NVIDIA Jetson`, `Anduril Hawkeye/EagleEye`, and `Palantir Foundry` rather than embedding copied trademark artwork. NVIDIA's public brand page says logo use requires authorization, Raspberry Pi offers a separate application path for `Powered by Raspberry Pi` logo use, Anduril public logo references carry trademark caveats, and the public Palantir SVG reference carries trademark caveats. Keeping text badges avoids implying endorsement while still making the product stack clear.

Product naming note: the public Anduril product page I found is `EagleEye`; I did not find an official Anduril product page named `Hawkeye`. The diagram keeps `Hawkeye/EagleEye` as a candidate sensor/feed label until the team confirms the exact product name to show judges or partners.

References:

- NVIDIA logo and brand guidelines: https://www.nvidia.com/en-gb/about-nvidia/legal-info/logo-brand-usage/
- Raspberry Pi `Powered by Raspberry Pi` application: https://www.raspberrypi.com/trademark-rules/powered-raspberry-pi/
- Anduril EagleEye product page: https://www.anduril.com/eagleeye/
- Anduril logo SVG reference and trademark caveat: https://commons.wikimedia.org/wiki/File%3AAnduril_Industries_Logo.svg
- Palantir Technologies SVG reference and trademark caveat: https://commons.m.wikimedia.org/wiki/File%3APalantir_Technologies_logo.svg
