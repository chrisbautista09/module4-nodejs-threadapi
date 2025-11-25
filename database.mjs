import { Sequelize, DataTypes } from "sequelize";

/**
 * 
 * @returns {Promise<Sequelize>} // Retourne une promesse qui résout une instance de Sequelize
 */
export async function loadSequelize() {// Fonction asynchrone pour charger Sequelize

    try {
        const login = {
            database: "app-database",
            username: "root",
            password: "root"
        };  // Informations de connexion

        // Connexion à la BDD
        const sequelize = new Sequelize(login.database, login.username, login.password, {
            host: "localhost",
            dialect: "mysql"
        });

        // ----  1. Création de tables via les models ---- 
        // Création des models (tables) -------------//
        const User = sequelize.define("User", { // Modèle User  
            username: DataTypes.STRING, // Attributs
            email: DataTypes.STRING, // Attributs
            password: DataTypes.STRING // Attributs
        });
        const Post = sequelize.define("Post", { // Modèle Post
            title: DataTypes.STRING, // Attributs
            content: DataTypes.STRING // Attributs
        });

        const Comment = sequelize.define("Comment", { // Modèle Comment
            content: DataTypes.STRING, // Attributs
            PostId: DataTypes.INTEGER, //  Attributs    
            UserId: DataTypes.INTEGER, // Attributs
        });

        User.hasMany(Post); // Association: Un utilisateur a plusieurs posts
        Post.belongsTo(User); // Association: Un post appartient à un utilisateur
        Post.hasMany(Comment); // Association: Un post a plusieurs commentaires
        Comment.belongsTo(Post); // Association: Un commentaire appartient à un post

        // CRÉER LES TABLES AVANT LA FONCTION sync !
        // -----------------------------------------//
        await sequelize.sync({ force: true }); // Synchronisation des modèles avec la base de données
        console.log("Connexion à la BDD effectuée") // Connexion réussie

        // ----  2. Retour de l'instance Sequelize ---- 

        // Init fixtures data
        const userTest = await User.create({ // Création d'un utilisateur de test
            username: "Billy",
            email: "billy@mail.com",
            password: "1234"
        });

        const postTest = await Post.create({ // Création d'un post de test
            title: "Mon premier post",
            content: "Contenu de mon premier post",
            UserId: userTest.id
        });

        const commentTest = await Comment.create({ // Création d'un commentaire de test
            content: "Super post !",
            PostId: postTest.id

        });


        return sequelize;// Retourne l'instance Sequelize pour une utilisation ultérieure
    } catch (error) {
        console.error(error); // Affichage de l'erreur
        throw Error("Échec du chargement de Sequelize"); // Lancement d'une nouvelle erreur



    }



}