# Base de données Supabase

`schema.sql` crée toutes les tables et règles de sécurité (RLS) du
projet en une fois — pensé pour un **tout nouveau projet Supabase**.

## ⚠️ Vous avez déjà un projet Supabase en place ?

N'exécutez pas ce fichier tel quel : `create table` échouera sur les
tables déjà existantes. Ce fichier sert de référence/documentation de
l'état final du schéma, et de point de départ propre pour un nouveau
déploiement (par ex. un environnement de test séparé).

Pour appliquer un changement précis à une base existante, écrivez et
exécutez uniquement le `alter table` / `create table if not exists`
correspondant à ce qui manque.
