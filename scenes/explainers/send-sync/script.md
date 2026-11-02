# Script: can this Rust value cross a thread boundary?

Questions the reader brings: Why did rustc refuse my thread? Isn't Arc the thread-safe pointer? What do Send and Sync actually mean?

Start from a program a Rust programmer writes on day two. `x` is an `Arc<Cell<i32>>`, and `thread::spawn(move || x.set(1))` hands it to a new thread. rustc refuses with E0277. Arc is the pointer the standard library offers for sharing between threads, so why? The error itself holds the clue: it says `Cell<i32>` cannot be shared between threads safely, that `Sync` is not implemented for it, and that this was required for `Arc<Cell<i32>>` to implement `Send`.

Those are the two questions the compiler asks of every type. Send: can a value move to another thread? Sync: can several threads hold a shared `&T` at once (T is Sync exactly when `&T` is Send)? Two yes-or-no questions make four quadrants. Cell<i32> lands in "Send only": `Cell::set` writes through `&self` with no synchronisation, so it cannot be shared, but a whole Cell can move.

Now wrap it in Arc. Every clone of an Arc reaches the same T, and Arc adds no locking, so Arc<T> is Send only when T is both Send and Sync. Cell<i32> is not Sync, so the point leaves "Send only" for "Neither": wrapping made it less movable, not more. Arc makes its count thread-safe, not the value inside.

The other quadrants fill out the map. Rc<i32> is neither, whatever it holds: it is the single-threaded Arc, with a plain integer count. i32 is both: Send and Sync are auto traits. And the odd one, MutexGuard<i32>, is Sync but not Send: dropping it unlocks the mutex, and a POSIX lock must be released on the thread that took it. Every combination occurs, so the two questions really are separate.

So how do you share a Cell? Put it behind a Mutex: Mutex<T> needs only T: Send, and its lock makes it Sync. Mutex<Cell<i32>> is both, Arc<Mutex<Cell<i32>>> is both, and both thread APIs accept it. The setting builds any of nine types from the inside out; Arc<T> with Cell<i32> rebuilds the refused x.

**The aha:** the Cell<i32> point, renamed x is Arc<Cell<i32>>, slides from "Send only" to "Neither".

**Sentence to remember:** Arc<T> is Send only when T is both Send and Sync, so Arc shares a value between threads but never makes the value itself safe to share.

**Check questions**, in `meta.checks`, asked after the last step:

1. Why does rustc refuse `thread::spawn(move || x.set(1))` when x is an `Arc<Cell<i32>>`?
2. Which type here is Sync but not Send, and why can't it move?
3. Is `Arc<MutexGuard<i32>>` Send? (A transfer: no case builds it.)

| Step | Script | Reader predicts |
| --- | --- | --- |
| spawn | paragraph 1: the refused program and rustc's error | why Arc, the thread-safe pointer, is refused |
| questions | paragraph 2: the two questions, named from the error, and the empty 2 × 2 | which quadrant holds Cell<i32> |
| cell | paragraph 2, Cell's quadrant and why | where Arc<Cell<i32>> lands |
| arc-cell | paragraph 3: Arc's rule, the answer and the aha | |
| rc | paragraph 4, Rc: the count Arc makes atomic | |
| i32 | paragraph 4, auto traits | what could be Sync but not Send |
| guard | paragraph 4, MutexGuard | what could make the Cell safe to share |
| rules | paragraph 5, Mutex's rule beside Arc's | |
| wrap-mutex, wrap-arc | paragraph 5, the chosen type built inside out (one step per wrapper) | |
| threads | paragraph 5, what spawn and scope accept for x | |
