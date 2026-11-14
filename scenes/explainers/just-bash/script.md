# Why must you keep the returned shell?

- **Reader:** a programmer calling a sandboxed or in-memory shell library from code (an agent tool, a test harness), who knows a pipeline and a redirect from the command line and expects a write to change the shell it ran on.
- **Answer:** exec returns a new shell holding the write and leaves the shell you passed in unchanged
- **Changed condition:** none; the explainer has no settings. The comparison it makes instead is the same cat on two shell values: the shell exec returned, which holds shout.txt and prints HELLO, against the shell the caller started with, which still has no files and prints nothing.
- **Reader's own work:** predict where HELLO went when cat on the starting shell prints nothing; at the end, run the pipeline, cat on the newest shell, cat on s0 and ls on the live machine; answer the check questions, which ask about two writes from the same empty shell, a pipeline with no redirect, and ls.
- **Checked against:** Nothing external: the model is this explainer’s own teaching shell, not the upstream JustBash implementation. Its own tests (`model.test.ts`) check, over generated shells and commands, that exec leaves the shell it is given unchanged and puts a redirect’s write only in the shell it returns, and play every order of the script’s commands to check that s0 stays empty and that the session refuses what exec refuses; `answers.ts` computes the check answers from the model.
- **Grounding:** none
- **Leaves out:** every command but echo, this uppercase tr and cat (anything else, such as ls, is refused with an error); Bash quoting and expansion, process execution, kernel pipes, permissions, persistence and Bash’s missing-file message (cat on a shell without the file prints nothing here); the parser tree in the detail steps illustrates this one command and is not a general shell parser.

## Check yourself

1. From the empty shell, a caller runs echo hi > a.txt and keeps the returned shell. Then it runs echo bye > b.txt on the empty shell again and keeps that result too. Which files does the second result hold, and where is a.txt?
   The second result holds b.txt and nothing else. a.txt is in the first result, because the second command started from the empty shell, which never received the first write.
2. Run echo hello | tr a-z A-Z with no redirect. What does exec print, and does the returned shell gain a file?
   It prints "HELLO\n", and the returned shell holds no files. Without a redirect the text stays on standard output, so there is no write for the returned shell to carry.
3. To check whether shout.txt exists, a caller runs ls on the returned shell. What happens, and what does that tell it about the file?
   exec throws “Unknown model command: ls”, because this model has branches only for echo, tr and cat. The error says nothing about shout.txt; cat on the returned shell would print its contents.

## Why this explainer

The lesson is about an interface, not about Bash: a function that returns a new state instead of changing the one it was given. Code that ignores the return value has lost the write although the command succeeded, and nothing reports an error. The explainer opens on exactly that surprise (the command ran, yet cat finds nothing) so the reader asks where HELLO went before being told.

The answer step names the two values side by side, and the lesson step makes them concrete as s0 and s1 on a live machine, so the reader can cat either shell and see that holding both is also useful: the caller can compare the shell before and after a write. The detail steps (parse, reduce, redirect, lookup) show how the command gets there: the command line parses into two commands and a redirect, the redirect is not a command, exec hands one string from command to command, and the redirect takes the last string as the file’s contents.

The model draws on the JustBash and Lantern sources in the scene’s metadata but must not be presented as running upstream JustBash. Its empty result for cat on the original shell is the model’s behaviour, not Bash’s missing-file message, and the steps say the pipeline hands strings between builtins rather than creating a kernel pipe. The check answers’ values were computed from the model (`scenes/explainers/just-bash/model.ts`) when they were written here; if the model changes, recompute them.
