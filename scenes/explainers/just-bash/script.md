# Why must you keep the returned shell?

Run `echo hello | tr a-z A-Z > shout.txt` in a small in-memory shell. Echo produces hello and a newline, tr changes the letters to uppercase, and the redirect stores HELLO and its newline in shout.txt instead of printing them. Nothing reports an error. Then run `cat shout.txt` on the shell you started with, and it prints nothing. Where did HELLO go?

It went into a different shell. In this model a shell is a plain value, a set of files and a count of commands run, and the exec function that runs a command does not change the value it is given. It copies the files, adds the redirect's write to the copy and returns the copy. Run cat on the returned shell and it prints HELLO; run it on the original and it prints nothing, because that value still has no files.

So the write belongs to whichever value the caller keeps. Name the starting shell s0 and the returned one s1. Code that passes s1 to its next command sees shout.txt. Code that keeps using s0, because it ignored what exec returned, has lost the file even though the command succeeded. Keeping both is also useful: the caller can compare the shell before and after a write.

The details show how the command gets there. The command line parses into a tree of two commands and a redirect, and the redirect is not a command. Exec passes one string from command to command, with no kernel pipe between them, and the redirect takes the last string as the file's contents.

This teaching shell implements echo, this uppercase operation and cat; any other command name, such as ls, is refused with an error. It is not a complete Bash implementation, and its empty result for cat on the original shell is the model's behaviour, not Bash's missing-file message. The lesson concerns an interface that returns a new state instead of changing the old one, not how an operating-system process changes its working directory or files.
