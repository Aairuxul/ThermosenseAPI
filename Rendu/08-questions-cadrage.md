# Questions de cadrage

### Q1 : Un opérateur de la zone A peut-il lire les mesures d'un capteur de la zone B ?
Non, la requête renvoie une 404. La contrainte technique est que nous devons verifier a chaque fois si l'utilisateur qui fait la requête à le droit d'accéder a la ressource ciblée.

### Q2 un device IoT peut-il lire sa propre configuration (GET /sensors/(id))
Oui le device peut lire sa propre configuration. L'avantage c'est qu'il peut se lire lui même vu qu'il en a les droits. Un attaquant peut récupérer les données de ce device et potentiellement la structure de tout les autres. 
Un moyen de limiter cela serait de limiter les requetes venant d'un sensor à un certain temps. 

### Q3 Qui peut créer un nouveau capteur (POST /sensors) ?
L'admin et l'operateur peuvent créer des capteurs. En revanche, pour l'opérateur, il ne peut en ajouter que dans sa zone.

### Q4 Quel rôle peut envoyer une commande à un actionneur (POST /actuators/(id)/commands)
L'admine et l'opérateur dans sa zone peuvent envoyer une commande à un actionneur. Un lecteur qui surveille des données en temps réel ne peut pas déclencher d'action physique. Le device lui-même ne peut pas créer d'actionneur car c'est via measurments qu'on va pouvoir surveiller et déclencher potentiellement des changements dessus. Le risque est que si un attaquant accède a l'actionneur, il puisse modifier directement les infos dessus.
