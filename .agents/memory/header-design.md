---
name: Header floating design
description: Header component is position:fixed top-right with no background — floats over page content
---

## Design decision

Header.tsx uses `position: "fixed", top: 8, right: 8, zIndex: 200` — it doesn't occupy flex layout space in App.tsx so main content fills the full viewport from top.

TON icon uses toncoin.png (copied to mini-app/public/toncoin.png, also importable via @assets/toncoin_1780755414938.png). Both TON and TONYX icons are 22×22 circular.

Pills have glass-morphism: `background: rgba(2,6,18,0.82)`, `backdropFilter: blur(14px)`, border, boxShadow.

**Why**: User requested transparent/floating header that doesn't create a dark bar at the top of every page.

**How to apply**: Never add `height` or take flex space in the header. Pages don't need paddingTop for the header — the pills float over content intentionally.
