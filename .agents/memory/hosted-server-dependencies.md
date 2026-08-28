---
name: Hosted server dependency baseline
description: Runtime and security constraints for dependency maintenance on the hosted API.
---

Keep the hosted HTTP service on Node 20 or newer and require a clean production dependency audit when changing its server packages.

**Why:** The MCP server dependency graph requires Node 20+, and the maintained Express 4 releases still resolved to HTTP parsing and routing packages with known denial-of-service vulnerabilities. The compatible Express 5 line resolved those advisories.

**How to apply:** After dependency changes, verify the selected Node runtime, run a clean-install compatibility check and production audit, then typecheck, build, restart, and smoke-test the hosted routes.