import { Link } from "react-router-dom";


export default function NotFound() {
return (
    <main className="min-h-dvh grid place-items-center p-4">
        <div className="card text-center space-y-3">
            <h2 className="text-xl font-semibold">Page introuvable</h2>
            <p className="opacity-80">Vérifiez l’URL.</p>
            <Link to="/" className="btn btn-accent inline-block">Retour à l’accueil</Link>
        </div>
    </main>
);
}