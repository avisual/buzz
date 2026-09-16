# buzz-feature-flags

Provider-neutral, typed feature-flag contracts for Buzz server crates.

This crate is infrastructure-only. It defines a small API for flag evaluation,
plus a static evaluator and an optional LaunchDarkly adapter behind a compile
feature.

## Purpose

`buzz-feature-flags` centralizes typed flag evaluation so server crates can use
flags without importing vendor SDK types.

Provider-neutral types:

- `BooleanFlag`
- `IntegerFlag` (`i64`, including negative values)
- `EvaluationContext` (required `CommunityId`, optional actor `PublicKey`)
- `FlagEvaluator` (typed `evaluate_bool` and `evaluate_int`)
- `StaticEvaluator` (always returns declared defaults)

LaunchDarkly support is optional and compile-gated behind
`buzz-feature-flags/launchdarkly`.

## Proposed Integration Boundary (not yet wired)

The intended composition root is the outer relay binary:

- Public/OSS relay build: compile and construct `StaticEvaluator` only.
- Block-internal relay build (`bb-block`): forward a relay Cargo feature to
  `buzz-feature-flags/launchdarkly`, then construct
  `LaunchDarklyEvaluator` from explicit runtime config (SDK key and optional
  relay proxy endpoint).

This repository currently adds the crate and adapter, but does **not** yet wire
relay `AppState`/handlers to consume it.

## Composition Root Shape (proposed)

Construct once at process startup, then inject shared
`Arc<dyn FlagEvaluator>` into server components.

```rust
use std::sync::Arc;

use buzz_feature_flags::{FlagEvaluator, StaticEvaluator};

fn build_flags_evaluator() -> Arc<dyn FlagEvaluator> {
    Arc::new(StaticEvaluator)
}

struct RelayCompositionRoot {
    feature_flags: Arc<dyn FlagEvaluator>,
}

impl RelayCompositionRoot {
    fn new() -> Self {
        Self {
            feature_flags: build_flags_evaluator(),
        }
    }
}
```

When using LaunchDarkly, keep an owned concrete handle so shutdown can call
`close()`; inject a cloned trait-object view for consumers.

## `buzz-db` Boundary (approved correction)

`buzz-db` may evaluate flags internally when choosing between equivalent query
implementations. It should depend on `buzz-feature-flags` without enabling the
LaunchDarkly feature, and it should never construct or import provider types.

Concise example (query path selection only):

```rust
use buzz_core::CommunityId;
use std::sync::Arc;

use buzz_feature_flags::{EvaluationContext, FlagEvaluator, IntegerFlag};

pub struct Db {
    feature_flags: Arc<dyn FlagEvaluator>,
}

impl Db {
    pub async fn list_events(
        &self,
        community: CommunityId,
    ) -> anyhow::Result<Vec<EventRow>> {
        let context = EvaluationContext::for_community(community);

        let query_version = self.feature_flags.evaluate_int(
            IntegerFlag::new("db.events.query-version", 1),
            &context,
        );

        if query_version >= 2 {
            self.list_events_v2_sql(community).await
        } else {
            self.list_events_v1_sql(community).await
        }
    }
}
```

SQL details are intentionally omitted in this example; the key point is that
public `Db` methods accept only domain inputs, while feature-flag evaluator
wiring remains internal to `Db` construction.

`EvaluationContext::for_actor` is appropriate only when the existing DB
operation already receives an authoritative authenticated actor for domain
behavior. Feature targeting must not add actor/pubkey parameters to otherwise
actor-free DB APIs.

## Guardrails

- Evaluation context inputs are authoritative server-resolved values
  (`community`, optional `actor`), not client-supplied targeting attributes.
- Flags may choose between **equivalent** implementations only.
- Flags must not weaken authorization, tenant isolation, ordering guarantees,
  transaction/consistency behavior, or schema invariants.
- Declared defaults choose the established safe path.
- Integer values must be validated at the consumer boundary before affecting
  behavior.

## Fallback, Startup, and Lifecycle

- `StaticEvaluator` always returns each flag's declared default.
- LaunchDarkly adapter returns declared defaults when a flag is missing, wrong
  type, or evaluation fails.
- Recommended rollout posture for non-critical flags: if LaunchDarkly startup
  fails, degrade to `StaticEvaluator` rather than failing relay startup.
- If LaunchDarkly is used, call evaluator `close()` during process shutdown.
- Safety invariants must never rely on remote-flag availability.

## Build and Test Expectations

Build modes:

```bash
# Provider-neutral (default): no LaunchDarkly dependency activated
cargo build -p buzz-feature-flags

# LaunchDarkly adapter enabled
cargo build -p buzz-feature-flags --features launchdarkly
```

Dependency-graph expectation checks:

```bash
# Default graph should exclude launchdarkly-server-sdk
cargo tree -p buzz-feature-flags

# Feature graph should include launchdarkly-server-sdk
cargo tree -p buzz-feature-flags --features launchdarkly
```

Testing expectations:

- Run provider-neutral tests and LaunchDarkly-feature tests for this crate.
- When `buzz-db` adopts flag-gated query selection, add parity tests proving
  old/new query paths return equivalent rows, ordering, and transactional
  behavior for the same inputs.

## References

- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/multi-tenant-relay.md](../../docs/multi-tenant-relay.md)
