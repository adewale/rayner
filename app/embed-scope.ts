/** Exiting a phase cancels pending waits. Check again at each synchronous commit. */
export class StateScope extends AbortController {
  check() { this.signal.throwIfAborted(); }
  async wait<T>(work: PromiseLike<T>): Promise<T> {
    this.check();
    let abort!:()=>void;
    try {
      return await Promise.race([work,new Promise<never>((_,reject)=>{
        abort=()=>reject(this.signal.reason);
        this.signal.addEventListener('abort',abort,{once:true});
      })]);
    } finally { this.signal.removeEventListener('abort',abort); }
  }
  async run(work: () => Promise<void>): Promise<void> {
    try { await work(); } catch(error) { if(!this.signal.aborted) throw error; }
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
