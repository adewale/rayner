# Why will Rust not send this Arc to another thread?

The value x is an Arc<Cell<i32>>. Arc is Rust's reference-counted pointer for sharing ownership between threads, so moving x into thread::spawn seems reasonable. Yet rustc refuses the program. The error says Cell<i32> lacks Sync, which prevents Arc<Cell<i32>> from being Send. Why does moving a pointer require its contents to be shareable?

Send asks whether ownership of a value can move to another thread. Sync asks whether shared references to that value can cross threads: T is Sync when &T is Send. Ownership and shared access impose different demands, so the two properties form four possible combinations.

Cell<i32> can move. Once ownership has moved, the new thread can use that Cell without another thread accessing it through the old owner. But Cell::set writes through a shared reference, &self, without synchronization. Sharing such references between threads would allow unsynchronized access to the same value. Cell<i32> is therefore Send but not Sync.

An Arc changes the ownership situation. Cloning it gives another owner access to the same contents. Moving one clone to another thread can leave another clone behind, so moving an Arc can also share its contents. Arc<T> requires T to be both Send and Sync to cross threads. Its atomic reference count protects ownership bookkeeping; it does not lock access to T. Wrapping Cell<i32> in Arc moves the point from Send only to neither.

The remaining types show why these are separate questions. Rc<i32> has a reference count without atomic synchronization, so it is neither Send nor Sync. An i32 has both properties. MutexGuard<i32> is Sync but not Send: a shared reference can be used safely, but moving the guard could cause it to be dropped on another thread. Dropping unlocks the mutex, and Rust must support platforms where the unlocking thread must be the one that locked it.

A Mutex addresses the access problem that Arc alone leaves open. It allows access to its contents while holding a lock. For Mutex<T> to be Send and Sync, its contents must be Send; T need not itself be Sync, because the mutex controls access. Cell<i32> meets that requirement. Mutex<Cell<i32>> is therefore Send and Sync, and wrapping it in Arc preserves both properties while allowing shared ownership.

Build the selected type from the inside out, applying each wrapper's requirements to what it actually contains. Then compare the thread APIs. A move closure that owns x needs x to be Send. A scoped thread borrowing &x needs x to be Sync; the scope keeps the borrow from outliving x. The type's name is less informative than those ownership and access requirements.
