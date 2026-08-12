# Executed rules authority

`manifest.json` freezes the implementation boundary captured before the
off-chain port. It is now a self-contained, transport-neutral parity corpus:
the legacy validator, program, generated client, and characterization runner
were removed after the target core and release gates passed. Source hashes and
the rolled-back start observation remain historical provenance only; no test
requires a chain toolchain or source checkout.

The source hashes are provenance, not a target API. Target tests consume only
transport-neutral expectations and must not reproduce chain account, signature,
wallet, callback, or transaction shapes.

The legacy Community Chest card sends the player to position 21 even though the
board defines Free Parking at position 20. Position 21 is retained here only as
divergence evidence; the accepted target is position 20.
