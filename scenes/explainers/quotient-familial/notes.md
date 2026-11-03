# Notes pour l’auteur

Le cas par défaut est un couple marié ou pacsé avec un enfant et 65 673,88 € de revenu net imposable pour 2024. Le récit arrondit les montants pour faire ressortir les mécanismes ; la scène conserve les calculs en centimes. La comparaison avec les revenus 2025 reste facultative : elle distingue un changement de règles d’un changement de revenu ou de composition du foyer.

Le modèle reprend les étapes citées d’OpenFisca France 176.1.3. Il s’arrête avant les réductions et crédits d’impôt et ignore le seuil de 61 € sous lequel l’impôt n’est pas recouvré. Il ne constitue pas un calcul complet de l’impôt pour tout foyer. Le nombre de parts, le plafonnement et la décote suivent les paramètres et les cas proposés par la scène.

L’étape du barème marque la « dernière tranche du quotient », et non la « tranche marginale ». Quand le plafond s’applique, OpenFisca calcule le taux marginal du foyer (`ir_taux_marginal`) sur le calcul à deux parts : le couple par défaut a un quotient dans la tranche à 11 % mais un taux marginal de 30 %. Le test `test/explain-quotient-familial.test.ts` le vérifie dans sa table de réponses OpenFisca.

Les questions de fin demandent d’appliquer le mécanisme à un cas que la scène ne déroule pas (un taux unique, l’avantage à trois revenus, la décote à 4 000 €). Le script évite donc d’en donner les réponses telles quelles.
