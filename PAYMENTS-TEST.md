# CAP Ados : test Stripe à 4,99 €
Produit de test : prod_VRLegkkfDXss5X
Prix : price_1UQSxPQSKBv4bDcXupls6W3F (499 centimes EUR, achat unique)
Payment Link : plink_1UQSxvQSKBv4bDcXD8rpCpvA
Mode réel : désactivé.
URL de test : https://buy.stripe.com/test_14A00l3OF5cx01meKK0sU02

Carte de test succès : 4242 4242 4242 4242 ; date future ; CVC 123. Ne jamais utiliser une vraie carte. Le résultat doit afficher le montant 4,99 EUR et une transaction en mode test dans Stripe.
La simulation locale reste disponible. Le bouton Stripe ouvre une vraie page Stripe en environnement de test, sans débit réel. Aucun accès Pro ne doit être activé sur la seule base d’un retour navigateur.

Avant toute vente : ajouter une vérification serveur et un webhook signé pour checkout.session.completed et checkout.session.async_payment_succeeded, contrôler payment_status=paid, le produit, le montant et la devise, enregistrer les droits Premium de façon idempotente. Le serveur et les droits ne sont pas encore intégrés : ce parcours teste le paiement seulement. Aucune clé Stripe dans le client.

Sources : https://docs.stripe.com/testing et https://docs.stripe.com/checkout/fulfillment
