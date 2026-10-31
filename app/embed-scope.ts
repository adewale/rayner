/**
 * Run a generator with `yield* scope.wait(promise)` at each suspension.
 * Only this driver resumes it; cancellation closes the continuation. A yielded
 * browser operation still needs the signal at its paint boundary (ReaderSink).
 */
export class StateScope extends AbortController {
  *wait<T>(work: PromiseLike<T>): Generator<PromiseLike<T>, T, unknown> {
    return (yield work) as T;
  }
  async run<T>(work: () => Generator<PromiseLike<unknown>, T, unknown>): Promise<T | undefined> {
    const task = work();
    let abort!:()=>void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(this.signal.reason);
      this.signal.addEventListener('abort', abort, {once:true});
    });
    void cancelled.catch(() => {});
    try {
      this.signal.throwIfAborted();
      let next = task.next();
      while (!next.done) {
        // Neither success nor failure may enter the continuation before this check.
        const resume = await Promise.race([next.value, cancelled]).then(
          value => () => task.next(value),
          error => () => task.throw(error),
        );
        this.signal.throwIfAborted();
        next = resume();
      }
      return next.value;
    } catch (error) { if (!this.signal.aborted) throw error; }
    finally {
      this.signal.removeEventListener('abort', abort);
      task.return(undefined as never);
    }
  }
  frame(paint: () => void) {
    if(this.signal.aborted) return;
    const abort=()=>cancelAnimationFrame(id);
    const id=requestAnimationFrame(()=>{
      this.signal.removeEventListener('abort',abort);
      paint();
    });
    this.signal.addEventListener('abort',abort,{once:true});
  }
}
