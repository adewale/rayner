export function* wait<T>(work: PromiseLike<T>): Generator<PromiseLike<T>, T, unknown> {
  return (yield work) as T;
}

/**
 * Run a generator with `yield* wait(promise)` at each suspension.
 * Only this driver resumes it; cancellation closes the continuation. A yielded
 * browser operation still needs the signal at its paint boundary (ReaderSink).
 */
export class StateScope extends AbortController {
  async run<T>(work: () => Generator<PromiseLike<unknown>, T, unknown>): Promise<T | undefined> {
    const signal = this.signal;
    const task = work();
    let abort!:()=>void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, {once:true});
    });
    void cancelled.catch(() => {});
    try {
      signal.throwIfAborted();
      let next = task.next();
      while (!next.done) {
        // Neither success nor failure may enter the continuation before this check.
        const resume = await Promise.race([next.value, cancelled]).then(
          value => () => task.next(value),
          error => () => task.throw(error),
        );
        signal.throwIfAborted();
        next = resume();
      }
      return next.value;
    } catch (error) { if (!signal.aborted) throw error; }
    finally {
      signal.removeEventListener('abort', abort);
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
