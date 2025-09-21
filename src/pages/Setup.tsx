// src/pages/Setup.tsx
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";

type Difficulty = "easy" | "medium" | "hard";

const LABELS = {
  cell: "Biologie cellulaire",
  genetics: "Génétique",
  anatomy: "Anatomie",
  physiology: "Physiologie",
  microbio: "Microbiologie",
  biochem: "Biochimie",
} as const;

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "medium", label: "Moyen" },
  { value: "hard", label: "Difficile" },
];

const COUNTS = [5, 10, 15, 20];

export default function Setup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const rawCat = params.get("category") ?? "";
  const catKey = rawCat as keyof typeof LABELS; // narrows to our known keys
  const categoryName = LABELS[catKey] ?? "Catégorie";
  const hasValidCategory = Boolean(LABELS[catKey]);

  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [count, setCount] = useState<number>(10);

  const start = () => {
    if (!hasValidCategory) return;
    const q = new URLSearchParams({
      category: rawCat,
      difficulty,
      n: String(count),
    });
    navigate(`/quiz?${q.toString()}`);
  };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">

      <div className="card space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-center">{categoryName}</h2>
          <p className="opacity-80 text-sm text-center mt-1">
            Configure ton quiz puis lance-le.
          </p>
          {!hasValidCategory && (
            <p className="opacity-70 text-xs text-center mt-2">
              Astuce : rends-toi à l’accueil et choisis une catégorie.
            </p>
          )}
        </div>

        <section className="space-y-2">
          <h3 className="font-medium">Difficulté</h3>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                className={`option ${
                  difficulty === d.value ? "option-selected" : ""
                }`}
                onClick={() => setDifficulty(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Nombre de questions</h3>
          <div className="grid grid-cols-4 gap-2">
            {COUNTS.map((n) => (
              <button
                key={n}
                className={`option ${count === n ? "option-selected" : ""}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <button
          className="btn btn-accent w-full"
          onClick={start}
          disabled={!hasValidCategory}
          title={!hasValidCategory ? "Choisir une catégorie d'abord" : ""}
        >
          Commencer
        </button>
      </div>
    </main>
  );
}
