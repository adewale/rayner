# How few moves can carry a tower to another peg?

- **Reader:** knows the rules of the puzzle, or can read them in one sentence, and has never asked why the answer is seven.
- **Answer:** the smaller tower moves twice and the largest disk once.
- **Changed condition:** four disks. The count becomes 15, and disk 1's first move flips from C to B, which shows the plan nesting inside itself.
- **Reader's own work:** predict the count first; at the end, carry the tower from the full stack on A and try to beat seven.
- **Checked against:** a search of every arrangement of three, four and five disks, in the model's own tests; no outside system.
- **Leaves out:** more than three pegs, and towers of more than five disks, which rest on the pattern.

## Check yourself

1. Suppose the tower must end on B instead. Where must disks 1 and 2 be when disk 3 moves?
   On C: disk 3 needs B empty to land there, so the smaller tower waits on the other peg.
2. How few moves carry five disks, and where does disk 1 go first?
   31: the four-disk tower moves twice, 15 moves each time, and disk 5 once. Disk 1 goes first to C, as it does for three disks.

## Why this explainer

Most people meet the Tower of Hanoi as a puzzle about patience and learn the answer, seven, as a fact. The point of this explainer is that seven is not a fact to memorise: it falls out of one observation about the largest disk. It cannot move until everything above it is out of the way, and the only place to put "everything above it" is the spare peg. That is the same puzzle one size smaller, and once it is solved it has to be solved again to put the tower back. Three, one, three.

The four-disk setting is there to stop the reader treating that as a trick for three disks. Fifteen is seven, one, seven; and the first move flipping to B is the plan visibly nesting, which a reader who has only memorised moves cannot explain.

The live ending matters because a reader who believes seven is the minimum should be able to try to beat it and fail, with the rules refusing each illegal move and saying why.
