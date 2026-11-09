// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { CHECK_TYPES, INNERS, isSend, isSync, nameOf, t } from './model.ts';
import type { RustType } from './model.ts';

const traits = (send: boolean, sync: boolean) =>
  send && sync ? 'Send and Sync' : send ? 'Send but not Sync' : sync ? 'Sync but not Send' : 'neither Send nor Sync';
const CELL = { send: isSend(INNERS.cell), sync: isSync(INNERS.cell), spawn: isSend(INNERS.cell), scope: isSend(t('&', INNERS.cell)) };
/** The second and third questions' types: Rc<Mutex<i32>> and Arc<MutexGuard<i32>>. */
export const [RC_MUTEX, ARC_GUARD] = CHECK_TYPES as [RustType, RustType];

export const questions = {
  1: () =>
    `${CELL.spawn ? 'The move compiles' : 'The move is refused'}: it hands the whole Cell to the new thread, and Cell<i32> is ${CELL.send ? '' : 'not '}Send. The borrow ${CELL.scope ? 'compiles' : 'is refused'}: the scoped thread would share c with its parent through &c, and Cell<i32> is ${CELL.sync ? '' : 'not '}Sync.`,
  2: () =>
    `${isSend(RC_MUTEX) ? 'Yes' : 'No'}. Rc’s plain owner count is the problem, not the value inside, so Rc<T> is neither Send nor Sync whatever T is, and ${nameOf(RC_MUTEX)} is ${traits(isSend(RC_MUTEX), isSync(RC_MUTEX))}.`,
  3: () =>
    `${isSend(ARC_GUARD) ? 'Yes' : 'No'}. Arc needs T to be both Send and Sync, and MutexGuard<i32> is Sync but not Send, so ${nameOf(ARC_GUARD)} is neither.`,
};
