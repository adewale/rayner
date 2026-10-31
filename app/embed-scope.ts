/** Work belongs to a phase. Exiting it cancels waits and queued browser work. */
export class StateScope extends AbortController {
  exit() { this.abort(); }
  async wait<T>(work: PromiseLike<T>): Promise<T> {
    this.signal.throwIfAborted();
    let abort!:()=>void;
    try {
      const value=await Promise.race([work,new Promise<never>((_,reject)=>{
        abort=()=>reject(this.signal.reason);
        this.signal.addEventListener('abort',abort,{once:true});
      })]);
      this.signal.throwIfAborted();
      return value;
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
