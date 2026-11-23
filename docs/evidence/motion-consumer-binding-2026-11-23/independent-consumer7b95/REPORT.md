# Independent review of the 7b95f443 evidence consumer

**Focused review passes.** Both defects returned from attempt 3 are closed at `7b95f4435a4a1b2209c6de7c924cf5c00c98d085`. I found no further blocker in the scoped read-only checks. Full integration and CI remain separate gates.

## Producer files and citations

I exercised the whole-case and semantic-assessment entry points separately on all 13 cases below. The original counterexamples use the genuine source-39 producer inventory for all 59 cases and synthetic worker results. The relocation controls use a complete 15 MiB copy of the original poll case, its two full native side ledgers and all original picture assets. The other 58 IDs are explicitly unresolved in that fixture.

| Inputs | Independent result at both entry points |
| --- | --- |
| Genuine original full inventory | Accepted |
| Genuine 815 receipt alone, or the complete 815 side summary and matching receipt, submitted under the source-39 case | Both refused |
| Extra nonexistent image with the genuine variant's SHA | Refused |
| Intact paired-case archive before and after moving the directory | Both accepted |
| Symlink to the genuine frame, equivalent relative paths, and a directory alias for the complete archive | All accepted |
| Existing unbound PNG copy or a symlink to an identical-byte PNG in the older source tree | Both refused |
| Byte-identical case copy in the wrong file role | Refused |
| Older genuine receipt symlinked at the canonical variant filename | Refused |

The validator now resolves the actual producer directory, verifies that the case and side files occupy the roles assigned by that producer, and compares the recorded and loaded side provenance. Every cited PNG is read, checked and tied to a verified frame through its actual path and SHA. The evidence model continues to rely on the native producer's execution attestation. [Independent control results](independent-controls.json)

The original source-815 genuine positive passed. The nine distinct earlier negative modes either refused or produced the expected baseline-subtracted semantic miss. The wrong route was exercised separately at both entry points. [Historical replay](admission-controls/results.json)

## Source-qualified measurement

I passed the original independent reviews and completed worker payloads through the new consumer. I also parsed each worker result and recomputed freshness against its actual chapter baseline. Each run contains eight completing, finding-free baselines and 59 variants, comprising 52 completed checks and seven worker refusals. The source-39 payload SHA is `86f67874816e7b930a8c403fea0440d303c2f875f2f18739deecc05386150d7d`. [Independent measurement readback](source-bound-readback.json)

| Run | Legacy credit | Any fresh rejection | Original exact targets | Semantic results |
| --- | ---: | ---: | ---: | --- |
| `8151582f` | 41/59 | 41/59 | 9/12 | Three of four V3 representations matched |
| `39b75450` | 41/59 | 42/59 | 9/12 | Three of four V3 representations matched, plus the new domain-clearance representation |

At source 39 the new domain match has travel actor and sole mask `poll`, sole subject and victim `card:domain`, requirement `clear`, device scenario, and step `ask` / event `collect`. The previous generic poll representation still misses on both sources. All four approved physical relations have a matching representation at source 39. Five registration versions describe those four relations. The aggregate counts use the corpus's mixed historical policy. The direct re-ask native no-op still earns zero, and the other 38 individually required legacy cases retain their credit. The frozen 16/20 and historical 39/59 keep their original meanings.

## Scope of the artwork conclusion

The complete tracked diff from source 39 changes only the semantic consumer and its unit test. All 34 artifacts indexed by the original independent verdict still match their digests. The renderer, art, local animation contract, corpus, execution workers, native capture pipeline and private root-owned test contracts have identical Git objects. The native classifications remain 45 observed clauses, four typed guards, four full-route non-reproductions and six editorial judgments. The eight primary PNGs personally opened in attempt 3 and its 704 return samples retain source 39. I performed no fresh native inspection or all-59 worker run at the reader revision. [Source comparison](unchanged-runtime.json) · [Original source-39 independent report](../../../../rayner-attempt3/out/remaining-fixes-2026-11-22/astra-attempt-3/REPORT.md)
