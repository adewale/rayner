# Can this Rust value cross a thread boundary?

- **Reader:** a Rust programmer who has used `Arc` and `thread::spawn`, has met error E0277 naming Send or Sync, and cannot yet say why moving a pointer needs its contents to be shareable.
- **Answer:** Arc<T> is Send only when T is both Send and Sync
- **Changed condition:** the wrapper (Arc<T>, Mutex<T> or Arc<Mutex<T>>) and the T inside it (i32, Cell<i32> or Rc<i32>). The built type lands in a different quadrant, and the last step says which thread API accepts it: Arc<Cell<i32>> rebuilds the refused opening, Arc<Mutex<Cell<i32>>> (the default) crosses both ways, and anything holding Rc<i32> crosses neither.
- **Reader's own work:** predict why rustc refuses the Arc, where Cell<i32> and then Arc<Cell<i32>> land, which quadrant could be Sync but not Send, and what would make the Cell safe to share; choose the wrapper and T; answer the check questions.
- **Checked against:** rustc. The model's rule table transcribes the impl lines of the Rust 1.99.1 standard library, and `model.test.ts` reads it against those lines and holds the nine selected type/wrapper combinations and the single types to a table of rustc 1.99.1's answers (compiled once in the `rust:1.99.1-slim` image). The same test compiles the opening program and the model's claims, including the check questions' Rc<Mutex<i32>> and Arc<MutexGuard<i32>>, with whichever rustc is on PATH; those two are outside the frozen 1.99.1 table. `answers.ts` computes the check answers from the model.
- **Grounding:** live: rustc, compiling the model’s claims; the table is rustc 1.99.1’s
- **Leaves out:** it is not a general trait solver: lifetime bounds, arbitrary generic types, unsafe implementations, other wrappers and other thread APIs are outside the model. The spawn and scope comparison isolates Send and Sync; a complete program must meet each API's other bounds too. MutexGuard's restriction is for platforms that need the locking thread to unlock, not a claim that every operating system requires it.

## Check yourself

1. Take a plain Cell<i32> c, with no Arc. Does thread::spawn(move || c.set(1)) compile? Does a scoped thread that borrows &c?
   The move compiles: it hands the whole Cell to the new thread, and Cell<i32> is Send. The borrow is refused: the scoped thread would share c with its parent through &c, and Cell<i32> is not Sync.
2. Mutex made Cell<i32> safe to share. Does Rc<Mutex<i32>> cross to another thread?
   No. Rc’s plain owner count is the problem, not the value inside, so Rc<T> is neither Send nor Sync whatever T is, and Rc<Mutex<i32>> is neither Send nor Sync.
3. Is Arc<MutexGuard<i32>> Send?
   No. Arc needs T to be both Send and Sync, and MutexGuard<i32> is Sync but not Send, so Arc<MutexGuard<i32>> is neither.

## Why this explainer

Send and Sync are usually taught as two definitions, and the definitions do not explain the error a programmer actually meets: `Arc<Cell<i32>>` refused by `thread::spawn`, with a message about Sync on a move. So the refused program comes first, and both trait names arrive as answers to that concrete error.

The aha is that Cell and Arc<Cell> sit in different quadrants for an ownership reason, not because wrapping changes Cell: a moved Arc can leave a clone behind, so moving it shares its contents. The four single types (Cell, Rc, i32, MutexGuard) fill the 2 × 2 so the reader sees that every combination occurs and the two questions really are separate. Mutex is then the fix, because the lock supplies the synchronisation Cell lacks; the default setting builds the working Arc<Mutex<Cell<i32>>>, and another setting rebuilds the failure from the inside out.

Exact trait implementations are cited beside the captions in `scene.ts` and transcribed in `model.ts`; the check answers state the model's answers, and a guard in `scene.ts` fails the scene if the model stops giving them.
