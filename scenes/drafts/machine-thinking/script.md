# Why can a machine's thinking look like ours and still be different?

- **Reader:** uses chatbots, has noticed that their answers often read like a person's reasoning and sometimes break down in strange ways, and has not read Dimitri Glazkov's essay "Machine Thinking".
- **Answer:** It rolls over the same terrain of ideas, but it is pushed rather than pulled, and it feels nothing.
- **Changed condition:** whether admitting the lowest idea, "I'm the cause", hurts. When it hurts, your ball stops at Work harder and the machine's reaches the answer; when it does not, both end on the answer and the difference is hidden.
- **Reader's own work:** predict where the machine's ball stops; choose whether the answer hurts; then the two check questions.
- **Checked against:** six claims quoted from the essay in `fixtures/essay-claims.json`, each held to the model by a named test in `model.test.ts` (four by hand-worked values on the explainer's slope, two by property over random slopes).
- **Grounding:** read: Dimitri Glazkov, “Machine Thinking”, 20 January 2025
- **Leaves out:** how brains and language models really work: the model pictures the essay's metaphor, with four ideas in a row where real mental models have many dimensions, and each feeling, need and habit reduced to one number on a spot's height. It also leaves out training, which does change a machine's terrain, between runs rather than during one.

## Check yourself

1. Give the machine only two pushes on the first throw. Where does its ball stop, and why there?
   At Work harder, where your ball stopped when the answer hurt, though for a different reason: yours stopped because nothing beside it felt lower, and the machine's because it was not run a third time.
2. After the second throw, with the answer painful, how small would the pain have to be for your ball to roll on to I'm the cause?
   Under 1.6: your ball rests at 2.8, and the answer's ground is 1.2, so 1.2 plus the pain must be below 2.8. On the first throw anything under 2.2 would have done, so each throw that stops short makes the answer harder to reach.

## Why this explainer

Glazkov's essay works by one picture, a ball rolling over a terrain of mental models, and then by two ways the machine's ball differs: what moves it, and whether feeling takes part. Because prose asks the reader to hold both balls in mind at once, the explainer rolls them on the same slope, one above the other, where the reader can watch the paths match and then split.

The setting carries the essay's point about matching results. With the answer painless, both balls end in the same place, so their stopping place cannot tell them apart. With it painful, the person's ball stops short of lower ground, as the essay says a negative feeling can keep us from answers we already have, while the machine rolls on and says the answer would hurt, which Glazkov calls logic-feeling.

The second throw carries the essay's last mechanism, the ball carving its own grooves. A machine's terrain is fixed while it runs; a person's changes as they think, and in the painful case it makes the avoided answer harder to reach.

Because the model's tests hold it to six sentences from the essay rather than to any brain or language model, the receipt grades it `read`, and the Leaves out line names what the toy omits.
