# Comment les parts changent-elles l’impôt d’un couple ?

- **Reader:** a French taxpayer, or someone filling in a déclaration for a married or PACS couple, who knows the household has "parts" and that children lower the tax, but not why dividing the income and multiplying the tax back changes anything.
- **Answer:** Diviser change l’impôt parce que le barème est progressif : chaque part repart du bas du barème, donc moins d’euros atteignent les tranches les plus taxées que sur le revenu entier
- **Changed condition:** the number of children and the income. At 65 673,88 € the plafond takes back part of the advantage with one child but not with two or three; at 150 000 € it binds for one, two and three children; at 30 000 € it never binds and the tax falls to zero whatever the number of children, through the décote with none or one child and through the barème itself with two or three.
- **Reader's own work:** predict whether dividing and multiplying by the parts changes the tax; choose any of the twelve households (0 to 3 children at three incomes); answer the check questions, which ask for a flat tax, the growth of the advantage with income, and the décote at 4 000 €, cases the scene does not walk through.
- **Checked against:** openfisca-france 176.1.3 (commit 5cc6563): its three LexImpact 2024 test vectors for married or PACS couples, reproduced to the cent and the euro, and OpenFisca's own answers (parts, ir_brut, ir_ss_qf, ir_plaf_qf, décote, ip_net, taux marginal) for thirteen households, each child count at the three offered incomes plus one LexImpact case, for revenus 2024 and 2025, to the cent; all in `test/explain-quotient-familial.test.ts`.
- **Leaves out:** réductions and crédits d'impôt; the 61 € threshold below which the tax is not collected; single, widowed or invalid taxpayers and children not fully in the couple's care; it is not a complete tax calculation for any household. Rules for years other than revenus 2024, and 2025 in the detail step.

## Check yourself

1. Si l’impôt prenait 11 % de chaque euro, sans tranches, un enfant de plus changerait-il l’impôt du couple à 65 673,88 € ? Pourquoi ?
   Non : 11 % × (65 673,88 € ÷ 2,5) × 2,5 = 11 % × 65 673,88 € = 7 224,13 €, quel que soit le nombre de parts. Diviser ne change l’impôt que parce que le taux monte avec le revenu : avec un seul taux, aucune part ne fait redescendre d’euros vers un taux plus bas.
2. Avec un enfant, l’avantage de la demi-part reste sous le plafond de 1 791 € à 30 000 € mais le dépasse à 65 673,88 €. Pourquoi grandit-il avec le revenu, alors que le plafond reste fixe ?
   La demi-part retire des euros du haut du quotient. À 30 000 €, ces euros étaient taxés à 11 %, et l’avantage vaut 632,34 €. À 65 673,88 €, le quotient sans enfant, 32 836,94 €, atteint la tranche à 30 % ; la demi-part le ramène à 26 269,55 €, dans la tranche à 11 %, et l’avantage vaut 1 970,67 €. Le plafond reprend donc 179,67 € ici, et 1 626,26 € à 150 000 €.
3. À 30 000 € sans enfant, le barème donne 770,66 € d’impôt, et le couple ne paie rien. Quelle étape annule cet impôt, et l’annulerait-elle s’il valait 4 000 € ?
   La décote : 1 470 € − 45,25 % × 770,66 € = 1 121 €, plus que l’impôt, qui tombe à 0. Pour 4 000 €, elle vaudrait 1 470 € − 1 810 €, moins que zéro : elle ne retire plus rien dès 3 248 € d’impôt.

## Why this explainer

Le quotient familial paraît être un tour de passe-passe : on divise le revenu par les parts, puis on multiplie l'impôt par ces mêmes parts. Le lecteur doit repartir avec l'idée que ce n'est pas neutre parce que le barème est progressif, et le voir sur les euros eux-mêmes : la barre des tranches, revenu entier contre parts, a la même longueur, seules les coupes changent. C'est le moment à retenir.

Le cas par défaut, un couple marié avec un enfant et 65 673,88 € de revenu net imposable pour 2024, est un vecteur de test LexImpact d'OpenFisca, et c'est aussi le cas où le plafond s'applique : le récit mène du mécanisme à sa limite sans changer de foyer. Les trois revenus proposés ont été choisis pour que le réglage change la conclusion (décote, plafond qui ne joue pas, plafond qui joue), pas seulement les montants. La scène calcule en centimes ; les phrases arrondissent quand l'arrondi fait mieux ressortir le mécanisme.

Les questions de fin demandent d'appliquer le mécanisme à un cas que la scène ne déroule pas ; la scène ne doit donc pas en donner les réponses telles quelles. L'étape sur les revenus 2025 reste un détail facultatif : elle distingue un changement de règles d'un changement de revenu ou de famille.
