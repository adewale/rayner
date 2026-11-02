# Script : comment les parts changent-elles l’impôt d’un couple ?

Question du lecteur : un couple avec un enfant déclare 65 673,88 €. Pourquoi l’impôt commence-t-il par diviser ce revenu, et qu’est-ce que cela change ?

Un couple marié ou pacsé, un enfant, déclare 65 673,88 € de revenu net imposable pour 2024. L’impôt ne s’applique pas à ce revenu tel quel : il le divise d’abord par un nombre de parts, applique le barème, puis multiplie. Pourquoi diviser ?

Parce que le même revenu fait vivre plus de personnes. Ici il fait vivre trois personnes : le couple compte deux parts, l’enfant une demi-part, soit 2,5 parts. On divise parce que le même revenu fait vivre plus de personnes : le barème s’applique au revenu d’une part, puis l’impôt est multiplié par le nombre de parts.

Le revenu d’une part, le quotient, vaut 65 673,88 € ÷ 2,5 = 26 269,55 €. Le barème est progressif : chaque tranche est taxée à son propre taux, et ce quotient n’atteint que la tranche à 11 %. Seuls les euros au-dessus de 11 497 € y sont taxés : 1 624,98 € pour une part.

Multiplié par 2,5 parts, cela fait 4 062,45 €. Appliqué au revenu entier, le barème aurait donné 12 867,64 €, parce que le revenu entier monte dans la tranche à 30 %. Chaque part repart du bas du barème : c’est tout l’effet des parts.

Cet effet est borné. OpenFisca refait le calcul sur deux parts, comme si le couple n’avait pas d’enfant : 6 033,12 €. L’enfant fait donc gagner 1 970,67 €, mais le plafond limite ce gain à 1 791 € par demi-part : l’impôt retenu est 6 033,12 € − 1 791 € = 4 242,12 €. La décote, qui allège les petits impôts, ne joue pas à ce niveau : l’impôt est de 4 242 €.

**L’aha :** le graphique par tranche, où les 2,5 parts restent dans la tranche à 11 % alors que le revenu entier paie surtout dans la tranche à 30 % : 4 062 € contre 12 868 €.

**Phrase à retenir :** diviser par les parts fait repartir chaque part du bas du barème ; le plafond limite ce que les enfants peuvent faire gagner.

**Questions de vérification**, dans `meta.checks`, posées après la dernière étape :

1. Pour ce couple avec un enfant, combien donne le barème sur le revenu entier, et combien le calcul par parts avant plafonnement ?
2. Pourquoi l’impôt de ce couple est-il de 4 242 € et non de 4 062 € ?
3. Avec 30 000 € et deux enfants, combien vaut l’impôt d’une part ?

**Le levier du lecteur :** le nombre d’enfants et le revenu. À 30 000 €, la décote annule l’impôt ; à 150 000 €, le plafond reprend une partie de l’avantage dès le premier enfant.

**Détail :** les seuils du barème des revenus 2025 restent une étape de détail, hors du fil principal.

| Étape | Script | Le lecteur prédit |
| --- | --- | --- |
| revenu | paragraphe 1 : le foyer et la question | pourquoi diviser ? |
| parts | paragraphe 2 : la réponse, et les parts du foyer | |
| quotient | paragraphe 3 : le revenu d’une part | |
| bareme | paragraphe 3 : l’impôt de chaque tranche pour une part | |
| taux | paragraphe 3 : seul l’excédent est taxé à 11 % | combien pour 2,5 parts, et sur le revenu entier ? |
| multiplie | paragraphe 4 : l’aha, 4 062 € contre 12 868 € | |
| reference | paragraphe 5 : le calcul sur deux parts | |
| plafond | paragraphe 5 : le plafond | |
| decote | paragraphe 5 : la décote et l’impôt final | |
| revenus-2025 | détail : les seuils 2025 | |
