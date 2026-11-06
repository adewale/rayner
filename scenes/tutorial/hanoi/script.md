# How few moves can carry a tower to another peg?

Three disks sit on peg A, the largest at the bottom. You may move one disk at a time, from the top of a peg onto an empty peg or onto a larger disk. How few moves carry the whole tower to peg C? Guess before you read on.

Start with the disk that is hardest to move: disk 3, the largest. It cannot move while a disk sits on it. It cannot land on C while a disk is there either, because it is the largest disk. So at the moment disk 3 moves, disks 1 and 2 must both be on B, the spare peg. Getting them there is the same puzzle again, one size smaller: carry a two-disk tower from A to B. That takes three moves. And once disk 3 has moved, the two will have to come back on top of it. So the smaller tower moves twice and the largest disk once.

Disk 3 then goes straight to C. It moves once, and never needs to move again.

Now the two-disk tower is on the wrong peg, and the same puzzle appears a third time: carry it from B onto disk 3. Three more moves. Three, one, three: seven moves. Nothing in that plan can be skipped, and a search of all 27 arrangements of the three disks finds no shorter route.

The plan does not care how many disks there are. With four, the three disks above disk 4 go to B first, which takes seven moves; disk 4 moves once; the three come back on top in seven more. Fifteen. Each extra disk doubles the count and adds one.

Press the moves yourself, and try to beat seven. A move the rules forbid is refused, and the page says why. The counts come from this explainer's own model of the rules, checked by searching every arrangement for three and four disks; larger towers are left to the pattern.
