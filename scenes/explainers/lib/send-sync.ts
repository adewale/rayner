// Send and Sync for a handful of standard-library types, decided from a table of their impl lines.
// Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// Each row transcribes the impls in rust-lang/rust at tag 1.99.1, with `?Sized` and the allocator
// parameter left out (the allocator is the default, Global, which is Send and Sync):
//   alloc/src/sync.rs:284  unsafe impl<T: ?Sized + Sync + Send, A: Allocator + Send> Send for Arc<T, A> {}
//   alloc/src/sync.rs:286  unsafe impl<T: ?Sized + Sync + Send, A: Allocator + Sync> Sync for Arc<T, A> {}
//   alloc/src/rc.rs:334    impl<T: ?Sized, A: Allocator> !Send for Rc<T, A> {}
//   alloc/src/rc.rs:342    impl<T: ?Sized, A: Allocator> !Sync for Rc<T, A> {}
//   core/src/cell.rs:320   unsafe impl<T: ?Sized> Send for Cell<T> where T: Send {}
//   core/src/cell.rs:328   impl<T: ?Sized> !Sync for Cell<T> {}
//   std/src/sync/poison/mutex.rs:238  unsafe impl<T: ?Sized + Send> Send for Mutex<T> {}
//   std/src/sync/poison/mutex.rs:257  unsafe impl<T: ?Sized + Send> Sync for Mutex<T> {}
//   std/src/sync/poison/mutex.rs:289  impl<T: ?Sized> !Send for MutexGuard<'_, T> {}
//   std/src/sync/poison/mutex.rs:294  unsafe impl<T: ?Sized + Sync> Sync for MutexGuard<'_, T> {}
//   core/src/marker.rs:105  unsafe impl<T: Sync + PointeeSized> Send for &T {}
// i32 has no impl line: Send and Sync are auto traits (marker.rs:92 and :657), and the Sync docs
// say primitive types are Sync (marker.rs:521); the Nomicon says almost all primitives are both.

/** What a type needs of the type inside it to have the trait. */
export type Needs = 'always' | 'never' | 'send' | 'sync' | 'send+sync';
export type Ctor = 'i32' | 'Cell' | 'Rc' | 'Mutex' | 'MutexGuard' | 'Arc' | '&';
export interface RustType {
  ctor: Ctor;
  of?: RustType;
}
export const RULES: Record<Ctor, { send: Needs; sync: Needs }> = {
  i32: { send: 'always', sync: 'always' },
  Cell: { send: 'send', sync: 'never' },
  Rc: { send: 'never', sync: 'never' },
  Mutex: { send: 'send', sync: 'send' },
  MutexGuard: { send: 'never', sync: 'sync' },
  Arc: { send: 'send+sync', sync: 'send+sync' },
  // A shared reference: &T is Send when T is Sync (marker.rs:105). Its own Sync is not used here.
  '&': { send: 'sync', sync: 'sync' },
};

export const t = (ctor: Ctor, of?: RustType): RustType => (of ? { ctor, of } : { ctor });
const I32 = t('i32');

function meets(needs: Needs, inner: RustType | undefined): boolean {
  if (needs === 'always') return true;
  if (needs === 'never') return false;
  if (!inner) throw new Error(`A rule that looks inside needs an inner type`);
  const send = isSend(inner),
    sync = isSync(inner);
  return needs === 'send' ? send : needs === 'sync' ? sync : send && sync;
}
export const isSend = (type: RustType): boolean => meets(RULES[type.ctor].send, type.of);
export const isSync = (type: RustType): boolean => meets(RULES[type.ctor].sync, type.of);

export function nameOf(type: RustType): string {
  if (type.ctor === 'i32') return 'i32';
  if (type.ctor === '&') return '&' + nameOf(type.of!);
  return `${type.ctor}<${nameOf(type.of!)}>`;
}

/** Mermaid's quadrant numbers with x = Send and y = Sync: 1 both, 2 Sync only, 3 neither, 4 Send only. */
export type Quadrant = 1 | 2 | 3 | 4;
export const quadrantOf = (type: RustType): Quadrant => {
  const send = isSend(type),
    sync = isSync(type);
  return send ? (sync ? 1 : 4) : sync ? 2 : 3;
};

// ---- the explainer's choices
export const INNERS = {
  i32: I32,
  cell: t('Cell', I32),
  rc: t('Rc', I32),
} as const;
export type Inner = keyof typeof INNERS;
export type Wrapper = 'arc' | 'mutex' | 'arc-mutex';
/** The wrappers applied from the inside out. */
export const WRAPS: Record<Wrapper, readonly Ctor[]> = {
  arc: ['Arc'],
  mutex: ['Mutex'],
  'arc-mutex': ['Mutex', 'Arc'],
};
/** The four single types the scene places first, one per quadrant. */
export const SINGLES: readonly RustType[] = [I32, t('Rc', I32), t('Cell', I32), t('MutexGuard', I32)];

export interface Layer {
  name: string;
  send: boolean;
  sync: boolean;
  quadrant: Quadrant;
}
const layer = (type: RustType): Layer => ({
  name: nameOf(type),
  send: isSend(type),
  sync: isSync(type),
  quadrant: quadrantOf(type),
});
/** The chosen type built inside out: the inner type, then one layer per wrapper. */
export function build(wrapper: Wrapper, inner: Inner): Layer[] {
  let type: RustType = INNERS[inner];
  const out = [layer(type)];
  for (const ctor of WRAPS[wrapper]) {
    type = t(ctor, type);
    out.push(layer(type));
  }
  return out;
}

/**
 * What the two thread APIs accept for a value x of the chosen type. thread::spawn needs its
 * closure to be Send + 'static (std/src/thread/functions.rs:125-129); a `move` closure that owns x
 * is Send when x's type is. Scope::spawn needs a Send closure too (std/src/thread/scoped.rs:201-204);
 * one that holds &x is Send when &T is, that is when T is Sync. Every type here is 'static.
 */
export function threads(wrapper: Wrapper, inner: Inner) {
  let type: RustType = INNERS[inner];
  for (const ctor of WRAPS[wrapper]) type = t(ctor, type);
  return { name: nameOf(type), spawnMove: isSend(type), scopeBorrow: isSend(t('&', type)) };
}

/**
 * The program the explainer opens on, and the lines of rustc's error it shows. The test in
 * test/explain-send-sync.test.ts compiles OPENING inside a function and checks that rustc's error
 * is E0277 and contains each of OPENING_ERROR's lines, joined as rustc prints them.
 */
export const OPENING = ['let x = Arc::new(Cell::new(0));', 'thread::spawn(move || x.set(1));'] as const;
export const OPENING_TYPE = t('Arc', INNERS.cell);
export const OPENING_ERROR = [
  '`Cell<i32>` cannot be shared between threads safely',
  'the trait `Sync` is not implemented for `Cell<i32>`',
  'required for `Arc<Cell<i32>>` to implement `Send`',
] as const;
