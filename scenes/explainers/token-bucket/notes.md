# Construction and scope

The same arrival schedule runs at one, two and four tokens a second, holding capacity at five. Simultaneous arrivals isolate capacity from refill rate; R8 and R9 isolate elapsed time from request count; the final wait exposes the cap. The plotted refill line represents available credit between calls, although the implementation updates its balance lazily.

The model is a single client's initially full bucket, with unit-cost requests, monotonic supplied times and immediate acceptance or refusal. It does not queue, reserve future tokens or simulate server work. Its decisions on this schedule are compared with [golang.org/x/time/rate v0.15.0](https://pkg.go.dev/golang.org/x/time@v0.15.0/rate); this does not assert equivalence to every feature of that package. The final comparison's “R10 is accepted at every rate” means the three displayed rates, and the caption says so in its next sentence, with the boundary below which R10 is refused; the `fork` explainer quotes that sentence and its fidelity test pins it. `test/explain-token-bucket.test.ts` holds the boundary, the answer's window bound and the check answers to the model.

Other sources: [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585#section-4) for 429 and the [Lantern token-bucket scene](https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/token-bucket.ts).
