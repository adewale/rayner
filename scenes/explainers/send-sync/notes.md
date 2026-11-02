# Construction and scope

The refused Arc<Cell<i32>> program precedes the trait map so both names answer a concrete compiler error. Cell and Arc<Cell> occupy different quadrants for an ownership reason, not because wrapping changes Cell's internals. The default selected wrapper builds the working Arc<Mutex<Cell<i32>>>; another setting reconstructs the failure.

The model classifies the nine selected type/wrapper combinations, checked against rustc 1.99.1. The opening program is compiled as well. This is not a general trait solver: lifetime bounds, arbitrary generic types, unsafe implementations and other thread APIs are outside the model. The spawn/scope comparison isolates Send and Sync; a complete program must meet each API's other bounds too. MutexGuard's restriction supports platforms requiring same-thread unlock rather than claiming every operating system imposes that rule.

Sources: [Rust 1.99.1 standard library](https://github.com/rust-lang/rust/tree/1.99.1/library), the [closure capture reference](https://github.com/rust-lang/reference/blob/d9d9ed57a120e3c87033fd598f191bbb84aad097/src/types/closure.md), and the [Nomicon's Send and Sync discussion](https://github.com/rust-lang/nomicon/blob/60ed8f3bb9d22a60865197a0ac74911436703430/src/send-and-sync.md). Exact trait implementations are linked in `scene.ts`.
