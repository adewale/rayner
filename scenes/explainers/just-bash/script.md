# Why must you keep the returned shell?

Run `echo hello | tr a-z A-Z > shout.txt` in a small in-memory shell. Echo produces hello and a newline. The pipe passes that text to tr, which changes the letters to uppercase. The redirect then stores HELLO and its newline in shout.txt instead of leaving that text on standard output.

The command has created a file, but which shell can read it? Keep the original shell value and compare it with the one returned by the execution. Calling cat with the returned value prints HELLO. Calling it with the original prints nothing: that value still has no files.

In this model, execution returns the next shell instead of changing the input shell. The filesystem write belongs to the returned value. Discarding that return value also discards the caller's route to the new filesystem state, even though the command itself ran successfully.

The detailed path follows the same distinction. A tree represents the two commands and the redirect. The executor passes one string from command to command, then copies the filesystem into a new shell with the file added. Keeping both shell values lets the caller inspect the state before and after the write.

This teaching shell implements echo, this uppercase operation and cat; another command name, such as ls, is refused. It is not a complete Bash implementation. Its empty result for cat on the original shell is the model's behavior, not a demonstration of Bash's missing-file diagnostics. The lesson is about retaining returned state, not about an operating-system process changing its working environment.
