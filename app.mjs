import { loadSequelize } from "./database.mjs";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import jwt from 'jsonwebtoken';

/**
 * Point d'entrée de l'application
 * Vous déclarer ici les routes de votre API REST
 */
async function main() {
    try {
        const sequelize = await loadSequelize(); // Chargement de Sequelize
        const User = sequelize.models.User; // Récupère le modèle User
        const Post = sequelize.models.Post; // Récupère le modèle Post
        const Comment = sequelize.models.Comment; // Récupère le modèle Comment

        // Initialisation d'Express et des middlewares  
        const app = express();

        // je place le middleware express.json AVANT la définition des routes de mon serveur
        app.use(express.json());

        // Activer cookie-parser pour qu'il fournissent les cookies dans req.cookies
        app.use(cookieParser());

        app.use(cors({
            origin: 'http://localhost:5500', // Remplacez par l'origine de votre frontend
            credentials: true // Autoriser les cookies
        }));

        const JWT_SECRET = 'votre_cle_secrete_pour_jwt'; // Utilisez une clé secrète sécurisée dans une application réelle
        app.post('/login', async (req, res) => { // Route pour connecter un utilisateur
            const { email, password } = req.body;

            // 1. Vérification des données manquantes (au début)
            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }

            try {
                // 2. Recherche de l'utilisateur par email
                const user = await User.findOne({ where: { email } });

                // 3. Vérification de l'utilisateur et du mot de passe haché
                if (!user || !await bcrypt.compare(password, user.password)) {
                    return res.status(401).json({ message: 'Invalid email or password' });
                }

                // Si tout est bon, on génère le token
                const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
                res.cookie('token', token, {
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: false, // À mettre à true en production avec HTTPS
                    maxAge: 3600000
                });
                res.json({ message: 'Login successful' });

            } catch (error) {
                res.status(500).json({ message: 'Error logging in', error: error.message });
            }
        });

        app.post('/register', async (req, res) => { // Route pour enregistrer un nouvel utilisateur
            const { email, password, verifiedPassword } = req.body;

            // 1. Vérification des données manquantes (au début)
            if (!email || !password || !verifiedPassword) {
                return res.status(400).json({ message: 'Email, password and verifiedPassword are required' });
            }

            // 2. Vérification de la correspondance des mots de passe
            if (password !== verifiedPassword) {
                return res.status(400).json({ message: 'Passwords do not match' });
            }

            try {
                // 3. Hachage du mot de passe
                const hashedPassword = await bcrypt.hash(password, 10);

                // 4. Création de l'utilisateur AVEC le mot de passe haché
                const newUser = await User.create({ email, password: hashedPassword });

                res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
            } catch (error) {
                // Gestion des erreurs (ex: email déjà existant si unique dans le modèle)
                res.status(500).json({ message: 'Error registering user', error: error.message });
            }
        });
        // Récupérer TOUS les posts avec leurs utilisateurs
        app.get("/posts", async (req, res) => { // Route pour récupérer tous les posts
            try {
                const posts = await Post.findAll({ // Trouve tous les posts dans la base de données
                    include: [{
                        model: User, // Inclut les données de l'utilisateur associé à chaque post
                        attributes: ['username', 'email'] // Sélectionne uniquement les attributs username et email
                    }]
                });
                res.json(posts); // Renvoie les posts en JSON
            } catch (error) { // Gestion des erreurs lors de la récupération des posts
                console.error("Erreur GET /posts:", error);
                res.status(500).json({ error: "Erreur serveur" }); // Renvoie une erreur serveur
            }
        });

        // Récupérer UN post par ID (bonus)
        app.get("/post/:id", async (req, res) => {
            try {
                const post = await Post.findByPk(req.params.id, { // Trouve un post par son ID
                    include: [
                        { model: User, attributes: ['username', 'email'] }, // Inclut les données de l'utilisateur associé
                        { model: Comment }  // Inclut les commentaires associés
                    ]
                });
                if (!post) { // Vérifie si le post existe
                    return res.status(404).json({ error: "Post non trouvé" }); // Renvoie une erreur 404 si le post n'existe pas
                }
                res.json(post); // Renvoie le post en JSON
            } catch (error) {
                console.error("Erreur GET /post/:id:", error); // Gestion des erreurs lors de la récupération d'un post par ID
                res.status(500).json({ error: "Erreur serveur" }); // Renvoie une erreur serveur
            }
        });


        app.use(isLoggedInJWT(User));

        // Middleware pour parser le JSON 
        app.get("/user/:id", async (req, res) => {  // Récupérer un utilisateur par son ID
            try {

                const userId = req.params.id; // Récupère l'ID depuis les paramètres de la requête
                const user = await User.findByPk(userId) // Trouve l'utilisateur par son ID;

                res.json(user); //  Renvoie l'utilisateur en JSON
            } catch (error) {
                console.log(error);
                res.status(500).json({ message: "Error Server please try again" }); // Erreur serveur
            }
        });

       app.post("/post", async (req, res) => {  //  Route pour créer un nouveau post
            try {
                // Utiliser req.user.id qui vient du JWT (authentifié par isLoggedInJWT)
                const userId = req.user.id; 
                const { title, content } = req.body;

                // Ajouter une validation basique
                if (!title || !content) {
                    return res.status(400).json({ error: "Title and content are required" });
                }

                const newPost = await Post.create({
                    title,
                    content,
                    UserId: userId // Utiliser l'ID de l'utilisateur connecté
                });
                res.status(201).json(newPost);
            } catch (error) {
                console.error("Erreur POST /post:", error);
                // Si isLoggedInJWT a échoué, on n'arriverait pas ici, mais erreur 500 pour le reste
                res.status(500).json({ error: "Erreur serveur lors de la création du post" });
            }
        });

        app.delete("/post/:postId", async (req, res) => { // Route pour supprimer un post
            try {
                const postId = req.params.postId; // Récupère l'ID du post depuis les paramètres d'URL
                
                // L'utilisateur est garanti d'être authentifié ici
                const userId = req.user.id; 

                //  Récupère le post pour vérifier son existence et son auteur
                const post = await Post.findByPk(postId);
                if (!post) { // Vérifie si le post existe
                    return res.status(404).json({ error: "Post non trouvé" }); 
                }

                //  Vérifie si l'utilisateur actuel est bien l'auteur du post
                if (post.UserId !== userId) { // Utilisez 'UserId' si c'est la convention Sequelize
                    return res.status(403).json({ error: "Accès refusé : vous n'êtes pas l'auteur de ce post" }); 
                }

                //  Supprime le post de la base de données
                await post.destroy();

                res.json({ message: "Post supprimé avec succès" });
            } catch (error) {
                console.error("Erreur DELETE /post/:postId:", error);
                res.status(500).json({ error: "Erreur serveur" }); 
            }
        });



        app.post("/comment", async (req, res) => { // Route pour créer un nouveau commentaire
            const newCommentData = req.body;
            const userId = req.user.id; // L'ID de l'utilisateur connecté

            // Validation de base
            if (!newCommentData.content || !newCommentData.postId) {
                return res.status(400).json({ error: "Content and PostId are required" });
            }

            try {
                const newComment = await Comment.create({
                    content: newCommentData.content,
                    PostId: newCommentData.postId,
                    UserId: userId // Associer le commentaire à l'utilisateur connecté
                });
                res.json(newComment);
            } catch (error) {
                console.error("Erreur POST /comment:", error);
                res.status(500).json({ error: "Erreur lors de la création du commentaire" });
            }
        });

       
        app.delete("/comment/:commentId", async (req, res) => { 
            try {
                // Récupérer l'ID du paramètre d'URL
                const commentId = req.params.commentId; 

                // L'utilisateur est connecté grâce à isLoggedInJWT
                const userId = req.user.id; 

                //  Récupère le commentaire pour vérifier son existence et son auteur
                const comment = await Comment.findByPk(commentId);
                if (!comment) {
                    return res.status(404).json({ error: "Commentaire non trouvé" });
                }

                //  Vérifie si l'utilisateur actuel est bien l'auteur du commentaire
                // Assurez-vous que le modèle Comment a bien un champ `userId` (ou `UserId`)
                if (comment.UserId !== userId) {
                    return res.status(403).json({ error: "Accès refusé : vous n'êtes pas l'auteur de ce commentaire" });
                }

                await comment.destroy();

                res.json({ message: "Commentaire supprimé avec succès" });
            } catch (error) {
                console.error("Erreur DELETE /comment/:commentId:", error);
                res.status(500).json({ error: "Erreur serveur" });
            }
        });



        //  Récupérer TOUS les posts avec leurs commentaires
        app.get("/posts-with-comments", async (req, res) => {
            try {
                const posts = await Post.findAll({ // Trouve tous les posts dans la base de données 
                    include: [
                        { model: User, attributes: ['username', 'email'] }, // Inclut les données de l'utilisateur associé
                        { model: Comment } // Inclut les commentaires associés
                    ]
                });
                res.json(posts); // Renvoie les posts en JSON
            } catch (error) {
                console.error("Erreur:", error); // Gestion des erreurs lors de la récupération des posts avec commentaires
                res.status(500).json({ error: "Erreur serveur" }); // Renvoie une erreur serveur
            }
        });



        function isLoggedInJWT(UserModel) { // Middleware pour vérifier si l'utilisateur est connecté via JWT
            return async (req, res, next) => { // Fonction middleware
                const token = req.cookies.token; // Récupère le token JWT depuis les cookies
                if (!token) {
                    return res.status(401).json({ message: 'Unauthorized: No token provided' }); // Renvoie une erreur si aucun token n'est fourni
                }
                try {
                    const decoded = jwt.verify(token, JWT_SECRET); // Vérifie et décode le token JWT

                    req.user = await UserModel.findByPk(decoded.userId); // Récupérer l'utilisateur connecté
                    if (!req.user) {
                        return res.status(401).json({ message: 'Unauthorized' }); // Renvoie une erreur si l'utilisateur n'est pas trouvé
                    }
                    next();
                } catch (error) {
                    return res.status(401).json({ message: 'Unauthorized: Invalid token' }); // Renvoie une erreur si le token est invalide
                }
            }
        }

        app.get('/logout', (req, res) => { // Route pour déconnecter un utilisateur
            res.clearCookie('token'); // Supprime le cookie contenant le token JWT
            res.json({ message: 'Logout successful' }); // Renvoie un message de succès 
        });





        app.listen(3000, () => {
            console.log("Serveur démarré sur http://localhost:3000"); // Démarrage du serveur sur le port 3000
        });



    } catch (error) {
        console.error("Error de chargement de Sequelize:", error);
    }
}
main();